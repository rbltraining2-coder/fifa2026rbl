import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

function bucketFor(total: number): "under_2" | "between_3_4" | "over_4" {
  if (total < 3) return "under_2";
  if (total > 3) return "over_4";
  return "between_3_4";
}

function computePoints(p: {
  winner: string | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  total_goals_bucket: string | null;
  created_at: string;
}, m: { match_time: string; home_score: number; away_score: number }) {
  let pts = 0;
  const actualWinner = m.home_score > m.away_score ? "home" : m.home_score < m.away_score ? "away" : "draw";
  if (p.winner && p.winner === actualWinner) pts += 5;
  if (p.predicted_home_score === m.home_score && p.predicted_away_score === m.away_score) pts += 10;
  if (p.total_goals_bucket && p.total_goals_bucket === bucketFor(m.home_score + m.away_score)) pts += 3;
  const created = new Date(p.created_at).getTime();
  const kickoff = new Date(m.match_time).getTime();
  if (kickoff - created > 24 * 60 * 60 * 1000) pts += 2;
  return pts;
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

type NormalizedItem = {
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  match_time: string;
  stage: string;
  is_completed: boolean;
};

function normalize(raw: any): NormalizedItem | null {
  if (!raw || typeof raw !== "object") return null;
  const home_team = str(raw.home_team ?? raw.homeTeam ?? raw.home ?? raw.team_home);
  const away_team = str(raw.away_team ?? raw.awayTeam ?? raw.away ?? raw.team_away);
  if (!home_team || !away_team) return null;
  return {
    home_team,
    away_team,
    home_score: num(raw.home_score ?? raw.homeScore ?? raw.score_home),
    away_score: num(raw.away_score ?? raw.awayScore ?? raw.score_away),
    match_time: str(raw.match_time ?? raw.matchTime ?? raw.date ?? raw.kickoff ?? "", 64),
    stage: str(raw.stage ?? raw.stage_name ?? raw.stageName ?? raw.competition ?? "Auto-Synced", 128),
    is_completed: bool(raw.is_completed ?? raw.isCompleted ?? raw.completed ?? raw.status),
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
            .select("id, home_score, away_score, status")
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
                status: "scheduled",
                match_time: matchTime,
                stage_name: item.stage || "Auto-Synced",
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
            const newStatus = isCompleted ? "completed" : "scheduled";
            if (
            m.home_score === homeScore &&
            m.away_score === awayScore &&
            m.status === newStatus
            ) {
            continue;
            }
            const { error: upErr } = await supabaseAdmin
            .from("matches")
            .update({
              home_score: homeScore,
              away_score: awayScore,
              status: newStatus,
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

        // Recompute points for predictions on completed matches.
        if (updatedMatchIds.length > 0) {
          try {
          const { data: fresh } = await supabaseAdmin
            .from("matches")
            .select("id, match_time, home_score, away_score")
            .in("id", updatedMatchIds);
          const matchById = new Map((fresh ?? []).map((m) => [m.id, m]));

          const { data: preds } = await supabaseAdmin
            .from("predictions")
            .select("id, user_id, match_id, winner, predicted_home_score, predicted_away_score, total_goals_bucket, created_at")
            .in("match_id", updatedMatchIds);

          for (const p of preds ?? []) {
            const m = matchById.get(p.match_id);
            if (!m || m.home_score == null || m.away_score == null) continue;
            const earned = computePoints(p, {
              match_time: m.match_time,
              home_score: m.home_score,
              away_score: m.away_score,
            });
            await supabaseAdmin.from("predictions").update({ points_earned: earned }).eq("id", p.id);
          }

          // Recompute totals per user (employee_id) and propagate to profiles by employee_code.
          const { data: allPreds } = await supabaseAdmin
            .from("predictions")
            .select("user_id, points_earned");
          const totals = new Map<string, number>();
          for (const r of allPreds ?? []) {
            totals.set(r.user_id, (totals.get(r.user_id) ?? 0) + (r.points_earned ?? 0));
          }
          for (const [employeeId, total] of totals) {
            await supabaseAdmin
              .from("registered_users")
              .update({ total_points: total })
              .eq("employee_id", employeeId);
            await supabaseAdmin
              .from("profiles")
              .update({ total_points: total })
              .eq("employee_code", employeeId);
          }
          } catch (err: any) {
            console.error("[sync-external-scores] points recompute failed", err?.message ?? err);
          }
        }

        return ok200({
          ok: true,
          received: rawItems.length,
          processed: items.length,
          updated: updatedMatchIds.length,
          created: createdMatchIds.length,
          failed,
        });
      },
    },
  },
});