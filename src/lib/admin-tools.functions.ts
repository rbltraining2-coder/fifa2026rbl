import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ADMIN_ID = "50161635";

async function assertAdmin(adminEmployeeId: string) {
  if (adminEmployeeId.toUpperCase() !== ADMIN_ID) {
    throw new Error("Forbidden: admin access required.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: caller } = await supabaseAdmin
    .from("registered_users")
    .select("is_admin")
    .eq("employee_id", ADMIN_ID)
    .maybeSingle();
  if (!caller?.is_admin) throw new Error("Forbidden: admin access required.");
}

const adminOnly = z.object({
  adminEmployeeId: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
});

/* ------------------------------------------------------------------ */
/* Compute points (mirror of sync endpoint)                            */
/* ------------------------------------------------------------------ */
function computePoints(
  p: { winner: string | null; predicted_home_score: number | null; predicted_away_score: number | null },
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

/* ------------------------------------------------------------------ */
/* Trigger score sync (calls the public sync endpoint)                 */
/* ------------------------------------------------------------------ */
export const triggerScoreSync = createServerFn({ method: "POST" })
  .inputValidator((d) => adminOnly.parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const secret = process.env.SCORE_SYNC_SECRET;
    if (!secret) throw new Error("SCORE_SYNC_SECRET is not configured.");
    const base = process.env.SYNC_ENDPOINT
      ?? "https://project--e068a158-2a0c-4115-b745-cfbb20d3e7c5.lovable.app/api/public/sync-external-scores";

    // Fire a no-op sync so the endpoint logs activity & exercises the pipeline.
    // If a real upstream is wired via SYNC_SOURCE_URL, fetch it first.
    let payload: unknown = { results: [] };
    const upstream = process.env.SYNC_SOURCE_URL;
    if (upstream) {
      try {
        const r = await fetch(upstream, { method: "GET" });
        if (r.ok) payload = await r.json();
      } catch (err: any) {
        return { ok: false, error: `Upstream fetch failed: ${err?.message ?? err}` };
      }
    }

    const res = await fetch(base, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: res.ok, status: res.status, response: json };
  });

/* ------------------------------------------------------------------ */
/* Recalculate leaderboard from scratch                                */
/* ------------------------------------------------------------------ */
export const recalculateLeaderboard = createServerFn({ method: "POST" })
  .inputValidator((d) => adminOnly.parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: refresh, error: refreshErr } = await supabaseAdmin.rpc("refresh_scoring_totals_rewards", {
      _match_ids: null,
    });
    if (refreshErr) throw new Error(refreshErr.message);
    const predictionsUpdated = Number((refresh as any)?.predictions_changed ?? 0);
    const usersRefreshed = Number((refresh as any)?.users_refreshed ?? 0);

    // 3. Log the recalculation as a sync entry for the activity feed.
    await supabaseAdmin.from("sync_logs").insert({
      source: "manual-recalculate",
      status: "success",
      predictions_scored: predictionsUpdated,
      users_refreshed: usersRefreshed,
    });

    return { predictionsUpdated, usersRefreshed, totalUsers: null };
  });

/* ------------------------------------------------------------------ */
/* Complete a match manually                                           */
/* ------------------------------------------------------------------ */
const completeSchema = adminOnly.extend({
  matchId: z.string().uuid(),
  homeScore: z.number().int().min(0).max(50),
  awayScore: z.number().int().min(0).max(50),
});

export const completeMatchManually = createServerFn({ method: "POST" })
  .inputValidator((d) => completeSchema.parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("matches")
      .update({
        home_score: data.homeScore,
        away_score: data.awayScore,
        status: "completed",
      })
      .eq("id", data.matchId);
    if (error) throw new Error(error.message);

    // Score every prediction for this match.
    const { data: preds } = await supabaseAdmin
      .from("predictions")
      .select("id, user_id, winner, predicted_home_score, predicted_away_score, points_earned")
      .eq("match_id", data.matchId);

    const affectedUsers = new Set<string>();
    for (const p of preds ?? []) {
      const earned = computePoints(p, { home_score: data.homeScore, away_score: data.awayScore });
      affectedUsers.add(p.user_id);
      if ((p.points_earned ?? 0) === earned) continue;
      await supabaseAdmin.from("predictions").update({ points_earned: earned }).eq("id", p.id);
    }
    for (const userId of affectedUsers) {
      const { data: rows } = await supabaseAdmin
        .from("predictions")
        .select("points_earned")
        .eq("user_id", userId);
      const total = (rows ?? []).reduce((s, r) => s + (r.points_earned ?? 0), 0);
      await supabaseAdmin
        .from("registered_users")
        .update({ total_points: total })
        .eq("employee_id", userId);
    }

    await supabaseAdmin.from("sync_logs").insert({
      source: "manual-complete",
      status: "success",
      updated: 1,
      users_refreshed: affectedUsers.size,
    });
    try { await supabaseAdmin.rpc("recalculate_rewards_and_badges"); } catch {}
    return { ok: true, usersRefreshed: affectedUsers.size };
  });

/* ------------------------------------------------------------------ */
/* Update match scores (without changing status)                       */
/* ------------------------------------------------------------------ */
const updateScoresSchema = adminOnly.extend({
  matchId: z.string().uuid(),
  homeScore: z.number().int().min(0).max(50),
  awayScore: z.number().int().min(0).max(50),
  status: z.enum(["scheduled", "live", "halftime", "completed", "cancelled"]).optional(),
});

export const updateMatchScores = createServerFn({ method: "POST" })
  .inputValidator((d) => updateScoresSchema.parse(d))
  .handler(async ({ data }) => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("matches")
      .update({
        home_score: data.homeScore,
        away_score: data.awayScore,
        ...(data.status ? { status: data.status } : {}),
      })
      .eq("id", data.matchId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("sync_logs").insert({
      source: "manual-score-edit",
      status: "success",
      updated: 1,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* List matches for admin pickers                                      */
/* ------------------------------------------------------------------ */
export type AdminMatchRow = {
  id: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  match_time: string;
  stage_name: string | null;
};

export const listMatchesForAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => adminOnly.parse(d))
  .handler(async ({ data }): Promise<{ matches: AdminMatchRow[] }> => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("matches")
      .select("id, home_team, away_team, home_score, away_score, status, match_time, stage_name")
      .order("match_time", { ascending: true });
    if (error) throw new Error(error.message);
    return { matches: (rows ?? []) as AdminMatchRow[] };
  });

/* ------------------------------------------------------------------ */
/* Sync logs feed                                                      */
/* ------------------------------------------------------------------ */
export type SyncLogRow = {
  id: string;
  source: string;
  status: string;
  received: number;
  processed: number;
  updated: number;
  created: number;
  predictions_scored: number;
  users_refreshed: number;
  failed_count: number;
  failures: SyncFailure[] | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type SyncFailure = {
  home_team?: string;
  away_team?: string;
  error?: string;
};

const listLogsSchema = adminOnly.extend({
  limit: z.number().int().min(1).max(200).optional(),
  onlyFailures: z.boolean().optional(),
});

export const listSyncLogs = createServerFn({ method: "POST" })
  .inputValidator((d) => listLogsSchema.parse(d))
  .handler(async ({ data }): Promise<{ logs: SyncLogRow[] }> => {
    await assertAdmin(data.adminEmployeeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("sync_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.onlyFailures) q = q.gt("failed_count", 0);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { logs: (rows ?? []).map((r: any) => ({
      ...r,
      failures: (r.failures as SyncFailure[] | null) ?? null,
    })) as SyncLogRow[] };
  });