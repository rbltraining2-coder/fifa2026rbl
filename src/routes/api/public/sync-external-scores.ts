import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

/**
 * Scoring rules (authoritative):
 *   - Exact score predicted        → 3 points
 *   - Correct winner or draw       → 1 point
 *   - Wrong prediction             → 0 points
 * Idempotent: same inputs always produce the same output, so re-running
 * on an unchanged match is safe. If the final score is later corrected,
 * re-running recomputes everything from scratch.
 */
function computePoints(
  p: {
    winner: string | null;
    predicted_home_score: number | null;
    predicted_away_score: number | null;
  },
  m: { home_score: number; away_score: number },
): number {
  const actualWinner =
    m.home_score > m.away_score ? "home" : m.home_score < m.away_score ? "away" : "draw";
  if (
    p.predicted_home_score === m.home_score &&
    p.predicted_away_score === m.away_score
  ) {
    return 3;
  }
  if (p.winner && p.winner === actualWinner) return 1;
  return 0;
}

function str(v: unknown, max = 256): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}
function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function bool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return /^(true|1|yes|ft|completed|finished)$/i.test(v.trim());
  if (typeof v === "number") return v === 1;
  return false;
}

const ALLOWED_STATUSES = new Set([
  "scheduled",
  "live",
  "halftime",
  "completed",
  "cancelled",
]);

function normalizeStatus(raw: unknown, isCompleted: boolean): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (ALLOWED_STATUSES.has(s)) return s;
  if (s === "ht" || s.includes("half")) return "halftime";
  if (s === "ft" || s.includes("final") || s.includes("complete") || s.includes("finished")) return "completed";
  if (s === "live" || s === "1h" || s === "2h" || s.includes("in play")) return "live";
  if (s.includes("cancel") || s.includes("postp")) return "cancelled";
  return isCompleted ? "completed" : "scheduled";
}

function toUtcIso(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  // Try "YYYY-MM-DD HH:MM:SS" without TZ -> treat as UTC
  const d2 = new Date(s.replace(" ", "T") + "Z");
  return isNaN(d2.getTime()) ? "" : d2.toISOString();
}

type NormalizedItem = {
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  match_time: string;
  stage: string;
  stadium: string | null;
  status: string;
  is_completed: boolean;
};

function normalize(raw: any): NormalizedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const home_team = str(raw.home_team ?? raw.homeTeam ?? raw.home ?? raw.team_home);
  const away_team = str(raw.away_team ?? raw.awayTeam ?? raw.away ?? raw.team_away);
  if (!home_team || !away_team) return null;
  const is_completed = bool(raw.is_completed ?? raw.isCompleted ?? raw.completed ?? raw.status);
  const stadiumRaw = str(raw.stadium ?? raw.venue ?? raw.strVenue ?? "", 256);
  return {
    home_team,
    away_team,
    home_score: num(raw.home_score ?? raw.homeScore ?? raw.score_home),
    away_score: num(raw.away_score ?? raw.awayScore ?? raw.score_away),
    match_time: toUtcIso(raw.match_time ?? raw.matchTime ?? raw.date ?? raw.kickoff),
    stage: str(raw.stage ?? raw.stage_name ?? raw.stageName ?? raw.competition ?? "Auto-Synced", 128),
    stadium: stadiumRaw || null,
    status: normalizeStatus(raw.status, is_completed),
    is_completed,
  };
}

const ok200 = (payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export const Route = createFileRoute("/api/public/sync-external-scores")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        const expected = process.env.SCORE_SYNC_SECRET;
        if (!expected || !token || token !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          console.error("[sync-external-scores] invalid JSON body");
          return ok200({ ok: true, updated: 0, created: 0, failed: [], warning: "Invalid JSON" });
        }

        // Auto-detect structure: direct array, { results: [...] }, or { data: [...] }
        let rawItems: any[] = [];
        if (Array.isArray(body)) rawItems = body;
        else if (body && Array.isArray(body.results)) rawItems = body.results;
        else if (body && Array.isArray(body.data)) rawItems = body.data;
        else if (body && Array.isArray(body.matches)) rawItems = body.matches;

        if (rawItems.length === 0) {
          console.warn("[sync-external-scores] no processable items in payload", JSON.stringify(body)?.slice(0, 500));
          return ok200({ ok: true, updated: 0, created: 0, failed: [], warning: "No processable data found" });
        }

        const items: NormalizedItem[] = [];
        for (const r of rawItems) {
          const n = normalize(r);
          if (n) items.push(n);
          else console.warn("[sync-external-scores] skipped malformed item", JSON.stringify(r)?.slice(0, 200));
        }

        const updatedMatchIds: string[] = [];
        const createdMatchIds: string[] = [];
        const failed: { home_team: string; away_team: string; error: string }[] = [];

        for (const item of items) {
          try {
            const homeScore = item.home_score;
            const awayScore = item.away_score;
            const isCompleted = item.is_completed;
            const query = supabaseAdmin
            .from("matches")
            .select("id, home_score, away_score, status, match_time, stadium, stage_name")
            .eq("home_team", item.home_team)
            .eq("away_team", item.away_team);
            if (item.match_time) query.eq("match_time", item.match_time);
            const { data: m, error: findErr } = await query
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
            if (findErr) {
            failed.push({ home_team: item.home_team, away_team: item.away_team, error: findErr.message });
            continue;
            }

            if (!m) {
            const matchTime = item.match_time || new Date().toISOString();
            const { data: inserted, error: insertErr } = await supabaseAdmin
              .from("matches")
              .insert({
                home_team: item.home_team,
                away_team: item.away_team,
                home_score: homeScore,
                away_score: awayScore,
                status: item.status,
                match_time: matchTime,
                stage_name: item.stage || "Auto-Synced",
                stadium: item.stadium,
              })
              .select("id, home_team, away_team, home_score, away_score, status, match_time")
              .single();
            if (insertErr || !inserted) {
              failed.push({
                home_team: item.home_team,
                away_team: item.away_team,
                error: insertErr?.message ?? "Insert failed",
              });
              continue;
            }
            createdMatchIds.push(inserted.id);
            if (isCompleted) updatedMatchIds.push(inserted.id);
            continue;
            }
            const newStatus = item.status;
            const newMatchTime = item.match_time || (m as any).match_time;
            const newStadium = item.stadium ?? (m as any).stadium ?? null;
            const newStage = item.stage || (m as any).stage_name || "Auto-Synced";
            if (
              m.home_score === homeScore &&
              m.away_score === awayScore &&
              m.status === newStatus &&
              (m as any).match_time === newMatchTime &&
              (m as any).stadium === newStadium &&
              (m as any).stage_name === newStage
            ) {
              continue;
            }
            const { error: upErr } = await supabaseAdmin
            .from("matches")
            .update({
              home_score: homeScore,
              away_score: awayScore,
              status: newStatus,
              match_time: newMatchTime,
              stadium: newStadium,
              stage_name: newStage,
            })
            .eq("id", m.id);
            if (upErr) {
            failed.push({ home_team: item.home_team, away_team: item.away_team, error: upErr.message });
            continue;
            }
            if (isCompleted) updatedMatchIds.push(m.id);
          } catch (err: any) {
            console.error("[sync-external-scores] item error", err?.message ?? err);
            failed.push({ home_team: item.home_team, away_team: item.away_team, error: err?.message ?? "Unknown error" });
          }
        }

        // ─── Automatic prediction scoring engine ──────────────────────────
        // Runs whenever a match is completed or its final score changes.
        // Idempotent: re-running with the same inputs produces the same
        // points_earned, so duplicate runs don't double-award. If the final
        // score is later corrected, all affected predictions are recomputed.
        let predictionsUpdated = 0;
        let usersRefreshed = 0;
        if (updatedMatchIds.length > 0) {
          try {
            console.log(`[scoring] recomputing for ${updatedMatchIds.length} completed match(es)`);
            const { data: fresh, error: freshErr } = await supabaseAdmin
              .from("matches")
              .select("id, home_score, away_score")
              .in("id", updatedMatchIds);
            if (freshErr) throw freshErr;
            const matchById = new Map((fresh ?? []).map((m) => [m.id, m]));

            const { data: preds, error: predsErr } = await supabaseAdmin
              .from("predictions")
              .select("id, user_id, match_id, winner, predicted_home_score, predicted_away_score, points_earned")
              .in("match_id", updatedMatchIds);
            if (predsErr) throw predsErr;

            const affectedUsers = new Set<string>();
            for (const p of preds ?? []) {
              const m = matchById.get(p.match_id);
              if (!m || m.home_score == null || m.away_score == null) continue;
              const earned = computePoints(p, {
                home_score: m.home_score,
                away_score: m.away_score,
              });
              affectedUsers.add(p.user_id);
              // Skip the write when value is unchanged — prevents duplicate updates.
              if ((p.points_earned ?? 0) === earned) continue;
              const { error: upPredErr } = await supabaseAdmin
                .from("predictions")
                .update({ points_earned: earned })
                .eq("id", p.id);
              if (upPredErr) {
                console.error(`[scoring] prediction ${p.id} update failed:`, upPredErr.message);
                continue;
              }
              predictionsUpdated++;
            }
            console.log(`[scoring] ${predictionsUpdated} prediction point row(s) updated; ${affectedUsers.size} user(s) affected`);

            // Recompute each affected user's total from scratch (authoritative)
            // and only write when the value actually changed.
            for (const userId of affectedUsers) {
              const { data: userPreds, error: upErr } = await supabaseAdmin
                .from("predictions")
                .select("points_earned")
                .eq("user_id", userId);
              if (upErr) {
                console.error(`[scoring] aggregate fetch failed for ${userId}:`, upErr.message);
                continue;
              }
              const total = (userPreds ?? []).reduce(
                (s, r) => s + (r.points_earned ?? 0),
                0,
              );
              const { data: existing } = await supabaseAdmin
                .from("registered_users")
                .select("total_points")
                .eq("employee_id", userId)
                .maybeSingle();
              if (existing && (existing.total_points ?? 0) === total) continue;
              const { error: writeErr } = await supabaseAdmin
                .from("registered_users")
                .update({ total_points: total })
                .eq("employee_id", userId);
              if (writeErr) {
                console.error(`[scoring] total write failed for ${userId}:`, writeErr.message);
                continue;
              }
              usersRefreshed++;
            }
            console.log(`[scoring] ${usersRefreshed} user total(s) refreshed — leaderboard up to date`);
          } catch (err: any) {
            console.error("[scoring] recompute failed:", err?.message ?? err);
          }
        }

        return ok200({
          ok: true,
          received: rawItems.length,
          processed: items.length,
          updated: updatedMatchIds.length,
          created: createdMatchIds.length,
          predictions_scored: predictionsUpdated,
          users_refreshed: usersRefreshed,
          failed,
        });
      },
    },
  },
});