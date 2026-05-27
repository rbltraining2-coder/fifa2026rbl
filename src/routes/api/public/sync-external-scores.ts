import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ItemSchema = z.object({
  home_team: z.string().min(1).max(64),
  away_team: z.string().min(1).max(64),
  home_score: z.number().int().min(0).max(50),
  away_score: z.number().int().min(0).max(50),
  is_completed: z.boolean().optional().default(true),
  match_time: z.string().datetime().optional(),
  stage_name: z.string().min(1).max(64).optional(),
  stage: z.string().min(1).max(64).optional(),
});
const PayloadSchema = z.object({ results: z.array(ItemSchema).min(1).max(500) });

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

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const parsed = PayloadSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "Invalid payload", details: parsed.error.flatten() }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const updatedMatchIds: string[] = [];
        const createdMatchIds: string[] = [];
        const failed: { home_team: string; away_team: string; error: string }[] = [];

        for (const item of parsed.data.results) {
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
            const matchTime = item.match_time ?? new Date().toISOString();
            const { data: inserted, error: insertErr } = await supabaseAdmin
              .from("matches")
              .insert({
                home_team: item.home_team,
                away_team: item.away_team,
                home_score: item.home_score,
                away_score: item.away_score,
                status: "scheduled",
                match_time: matchTime,
                stage_name: item.stage ?? item.stage_name ?? "Auto-Synced",
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
            if (item.is_completed) updatedMatchIds.push(inserted.id);
            continue;
          }
          const newStatus = item.is_completed ? "completed" : "scheduled";
          if (
            m.home_score === item.home_score &&
            m.away_score === item.away_score &&
            m.status === newStatus
          ) {
            continue;
          }
          const { error: upErr } = await supabaseAdmin
            .from("matches")
            .update({
              home_score: item.home_score,
              away_score: item.away_score,
              status: newStatus,
            })
            .eq("id", m.id);
          if (upErr) {
            failed.push({ home_team: item.home_team, away_team: item.away_team, error: upErr.message });
            continue;
          }
          if (item.is_completed) updatedMatchIds.push(m.id);
        }

        // Recompute points for predictions on completed matches.
        if (updatedMatchIds.length > 0) {
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
        }

        return new Response(
          JSON.stringify({
            ok: true,
            updated: updatedMatchIds.length,
            created: createdMatchIds.length,
            failed,
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...CORS } },
        );
      },
    },
  },
});