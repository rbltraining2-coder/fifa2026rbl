import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared ranking + tie-breaking logic used by the leaderboard, rewards tabs,
 * and per-match history detail so that equal scores always produce the same
 * displayed rank and the same display order across the app.
 *
 * Primary order:    total points DESC
 * Tiebreakers:      1) exact-score predictions DESC
 *                   2) correct-winner predictions DESC
 *                   3) earliest first prediction submission ASC
 *                   4) name (alphabetical) ASC
 *
 * Rank assignment uses competition ranking: equal points share the same rank
 * and the next distinct score skips ahead (1, 2, 2, 4 …).
 */

export type UserStat = { exactCount: number; winnerCount: number; firstAt: string };
export type UserStatMap = Map<string, UserStat>;

export type OverallLeaderboardRow = {
  id: string;
  employee_id: string;
  name: string;
  brand_name: string | null;
  avatar_url: string | null;
  total_points: number;
  exact_hits: number;
  winner_hits: number;
  played: number;
  accuracy: number;
  first_prediction_at: string;
};

type OverallAggregatePredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
  points_earned: number;
  created_at: string;
};

/**
 * Shared overall-leaderboard fetcher used by both the Leaderboard page and the
 * Profile page so that rank/played values stay consistent (including
 * tie-breaker behaviour).
 */
export function useOverallLeaderboard() {
  return useQuery({
    queryKey: ["leaderboard", "overall-completed-aggregate"],
    queryFn: async () => {
      const { data: matches, error: mErr } = await supabase
        .from("matches")
        .select("id")
        .eq("status", "completed")
        .not("home_score", "is", null)
        .not("away_score", "is", null)
        .limit(1000);
      if (mErr) throw mErr;

      type UserRow = Pick<
        OverallLeaderboardRow,
        "id" | "employee_id" | "name" | "avatar_url" | "total_points" | "brand_name"
      >;
      const users: UserRow[] = [];
      {
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabase
            .from("registered_users")
            .select("id, employee_id, name, avatar_url, total_points, brand_name")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          users.push(...((data ?? []) as UserRow[]));
          if ((data ?? []).length < pageSize) break;
        }
      }

      const completedIds = new Set((matches ?? []).map((m) => m.id as string));
      const preds: OverallAggregatePredictionRow[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("predictions")
          .select("id, user_id, match_id, points_earned, created_at")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        preds.push(...((data ?? []) as OverallAggregatePredictionRow[]));
        if ((data ?? []).length < pageSize) break;
      }

      const scoredPreds = preds.filter((p) => completedIds.has(p.match_id));
      const statMap = buildUserStatMap(
        scoredPreds,
        (p) => p.user_id,
        (p) => p.points_earned ?? 0,
        (p) => p.created_at,
      );
      const aggregates = new Map<
        string,
        Pick<
          OverallLeaderboardRow,
          "total_points" | "exact_hits" | "winner_hits" | "played" | "accuracy" | "first_prediction_at"
        >
      >();
      for (const p of scoredPreds) {
        const cur = aggregates.get(p.user_id) ?? {
          total_points: 0,
          exact_hits: 0,
          winner_hits: 0,
          played: 0,
          accuracy: 0,
          first_prediction_at: p.created_at,
        };
        cur.total_points += p.points_earned ?? 0;
        cur.exact_hits += p.points_earned === 3 ? 1 : 0;
        cur.winner_hits += p.points_earned === 1 ? 1 : 0;
        cur.played += 1;
        if (p.created_at < cur.first_prediction_at) cur.first_prediction_at = p.created_at;
        aggregates.set(p.user_id, cur);
      }

      const rows: OverallLeaderboardRow[] = users.map((u) => {
        const a = aggregates.get(u.employee_id) ?? {
          total_points: 0,
          exact_hits: 0,
          winner_hits: 0,
          played: 0,
          accuracy: 0,
          first_prediction_at: "\uffff",
        };
        const correct = a.exact_hits + a.winner_hits;
        return {
          ...u,
          total_points: a.total_points,
          exact_hits: a.exact_hits,
          winner_hits: a.winner_hits,
          played: a.played,
          accuracy: a.played > 0 ? Math.round((correct / a.played) * 100) : 0,
          first_prediction_at: a.first_prediction_at,
        };
      });
      return {
        rows,
        statMap,
        totalPredictions: preds.length,
        completedCount: completedIds.size,
      };
    },
  });
}

export function buildUserStatMap<T>(
  rows: T[],
  getUserId: (r: T) => string,
  getPoints: (r: T) => number,
  getCreatedAt: (r: T) => string,
): UserStatMap {
  const map: UserStatMap = new Map();
  for (const row of rows) {
    const userId = getUserId(row);
    const points = getPoints(row);
    const createdAt = getCreatedAt(row);
    const cur = map.get(userId);
    if (!cur) {
      map.set(userId, {
        exactCount: points === 3 ? 1 : 0,
        winnerCount: points === 1 ? 1 : 0,
        firstAt: createdAt,
      });
    } else {
      if (points === 3) cur.exactCount += 1;
      if (points === 1) cur.winnerCount += 1;
      if (createdAt < cur.firstAt) cur.firstAt = createdAt;
    }
  }
  return map;
}

/** Fetch per-user tiebreaker stats from the predictions table. */
export function useUserRankingStats() {
  return useQuery({
    queryKey: ["user-ranking-stats"],
    staleTime: 60_000,
    queryFn: async (): Promise<UserStatMap> => {
      const map: UserStatMap = new Map();
      // Page through to bypass the default 1000-row cap.
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("predictions")
          .select("user_id, points_earned, created_at")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = data ?? [];
        for (const p of rows) {
          const cur = map.get(p.user_id);
          if (!cur) {
            map.set(p.user_id, {
              exactCount: p.points_earned === 3 ? 1 : 0,
              winnerCount: p.points_earned === 1 ? 1 : 0,
              firstAt: p.created_at,
            });
          } else {
            if (p.points_earned === 3) cur.exactCount += 1;
            if (p.points_earned === 1) cur.winnerCount += 1;
            if (p.created_at < cur.firstAt) cur.firstAt = p.created_at;
          }
        }
        if (rows.length < pageSize) break;
      }
      return map;
    },
  });
}

export function compareTiebreakers(
  aId: string,
  bId: string,
  aName: string,
  bName: string,
  stats: UserStatMap | undefined,
): number {
  const sa = stats?.get(aId);
  const sb = stats?.get(bId);
  const ae = sa?.exactCount ?? 0;
  const be = sb?.exactCount ?? 0;
  if (be !== ae) return be - ae;
  const aw = sa?.winnerCount ?? 0;
  const bw = sb?.winnerCount ?? 0;
  if (bw !== aw) return bw - aw;
  const af = sa?.firstAt ?? "\uffff";
  const bf = sb?.firstAt ?? "\uffff";
  if (af !== bf) return af < bf ? -1 : 1;
  return (aName || aId).localeCompare(bName || bId);
}

/**
 * Sort rows by points DESC then tiebreakers, and return them annotated with a
 * competition `rank` field (equal points share rank).
 */
export function sortAndRank<T>(
  rows: T[],
  getUserId: (r: T) => string,
  getName: (r: T) => string,
  getPoints: (r: T) => number,
  stats: UserStatMap | undefined,
): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => {
    const pd = getPoints(b) - getPoints(a);
    if (pd !== 0) return pd;
    return compareTiebreakers(getUserId(a), getUserId(b), getName(a), getName(b), stats);
  });
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}