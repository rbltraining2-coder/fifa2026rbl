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

export function buildUserStatMap<T>(
  rows: T[],
  getUserId: (r: T) => string,
  getPoints: (r: T) => number,
  getUpdatedAt: (r: T) => string,
): UserStatMap {
  const map: UserStatMap = new Map();
  for (const row of rows) {
    const userId = getUserId(row);
    const points = getPoints(row);
    const updatedAt = getUpdatedAt(row);
    const cur = map.get(userId);
    if (!cur) {
      map.set(userId, {
        exactCount: points === 3 ? 1 : 0,
        winnerCount: points === 1 ? 1 : 0,
        firstAt: updatedAt,
      });
    } else {
      if (points === 3) cur.exactCount += 1;
      if (points === 1) cur.winnerCount += 1;
      if (updatedAt < cur.firstAt) cur.firstAt = updatedAt;
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
          .select("user_id, points_earned, updated_at")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = data ?? [];
        for (const p of rows) {
          const cur = map.get(p.user_id);
          if (!cur) {
            map.set(p.user_id, {
              exactCount: p.points_earned === 3 ? 1 : 0,
              winnerCount: p.points_earned === 1 ? 1 : 0,
              firstAt: p.updated_at,
            });
          } else {
            if (p.points_earned === 3) cur.exactCount += 1;
            if (p.points_earned === 1) cur.winnerCount += 1;
            if (p.updated_at < cur.firstAt) cur.firstAt = p.updated_at;
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