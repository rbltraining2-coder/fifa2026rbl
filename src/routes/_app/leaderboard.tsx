import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Crown, Trophy, Medal, History as HistoryIcon, ChevronLeft, ListOrdered, Users, BarChart3 } from "lucide-react";
import { useMemo, useState } from "react";
import TeamFlag from "@/components/TeamFlag";
import { formatIstDateTime, IST_LABEL } from "@/lib/ist";
import { buildUserStatMap, sortAndRank } from "@/lib/ranking";

export const Route = createFileRoute("/_app/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Goal Gurus" },
      { name: "description", content: "See the top prediction performers in the RBL FIFA 2026 Goal Gurus league and where you rank." },
      { property: "og:title", content: "Leaderboard — Goal Gurus" },
      { property: "og:description", content: "See the top prediction performers in the RBL FIFA 2026 Goal Gurus league and where you rank." },
      { property: "og:url", content: "https://fifa2026rbl.lovable.app/leaderboard" },
    ],
    links: [{ rel: "canonical", href: "https://fifa2026rbl.lovable.app/leaderboard" }],
  }),
  component: LeaderboardPage,
});

type Row = {
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

type CompletedMatch = {
  id: string;
  home_team: string;
  away_team: string;
  home_flag: string | null;
  away_flag: string | null;
  home_score: number | null;
  away_score: number | null;
  match_time: string;
};

type MatchPredictionRow = {
  id: string;
  user_id: string;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  winner: string | null;
  points_earned: number;
  created_at: string;
};

type PredictionAggregateRow = {
  id: string;
  user_id: string;
  match_id: string;
  points_earned: number;
  created_at: string;
};

function LeaderboardPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"overall" | "matches" | "history">("overall");
  const [selectedMatch, setSelectedMatch] = useState<CompletedMatch | null>(null);

  const { data: leaderboardData, isLoading } = useQuery({
    queryKey: ["leaderboard", "overall-completed-aggregate"],
    queryFn: async () => {
      const [{ data: matches, error: mErr }, { data: users, error: uErr }] = await Promise.all([
        supabase
          .from("matches")
          .select("id")
          .eq("status", "completed")
          .not("home_score", "is", null)
          .not("away_score", "is", null)
          .limit(1000),
        supabase
        .from("registered_users")
        .select("id, employee_id, name, avatar_url, total_points, brand_name")
          .limit(500),
      ]);
      if (mErr) throw mErr;
      if (uErr) throw uErr;

      const completedIds = new Set((matches ?? []).map((m) => m.id as string));
      const preds: PredictionAggregateRow[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("predictions")
          .select("id, user_id, match_id, points_earned, created_at")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        preds.push(...((data ?? []) as PredictionAggregateRow[]));
        if ((data ?? []).length < pageSize) break;
      }

      const scoredPreds = preds.filter((p) => completedIds.has(p.match_id));
      const statMap = buildUserStatMap(scoredPreds, (p) => p.user_id, (p) => p.points_earned ?? 0, (p) => p.created_at);
      const aggregates = new Map<string, Pick<Row, "total_points" | "exact_hits" | "winner_hits" | "played" | "accuracy" | "first_prediction_at">>();
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

      const rows = ((users ?? []) as Pick<Row, "id" | "employee_id" | "name" | "avatar_url" | "total_points" | "brand_name">[]).map((u) => {
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
        } as Row;
      });
      return { rows, statMap, totalPredictions: preds.length, completedCount: completedIds.size };
    },
  });

  const rows = sortAndRank(
    leaderboardData?.rows ?? [],
    (r) => r.employee_id,
    (r) => r.name || r.employee_id,
    (r) => r.total_points ?? 0,
    leaderboardData?.statMap,
  );
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const myIdx = rows.findIndex((r) => r.id === user?.id);
  const me = myIdx >= 0 ? rows[myIdx] : null;
  const leader = rows[0] ?? null;

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-2">
        <Trophy size={22} className="text-[color:var(--primary-glow)]" />
        <h1 className="text-xl font-black tracking-tight">Leaderboard</h1>
      </div>

      {/* Summary cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <SummaryCard icon={<BarChart3 size={14} />} label="Matches Done" value={leaderboardData?.completedCount ?? 0} />
        <SummaryCard icon={<Users size={14} />} label="Predictions" value={leaderboardData?.totalPredictions ?? 0} />
        <SummaryCard icon={<Crown size={14} />} label="Leader" value={leader?.name?.split(" ")[0] || "—"} sub={leader ? `${leader.total_points} pts` : ""} />
        <SummaryCard icon={<Medal size={14} />} label="Your Rank" value={me ? `#${me.rank}` : "—"} sub={me ? `${me.total_points} pts` : ""} />
      </section>

      <div className="glossy-card p-1 inline-flex gap-1 w-full">
        <button
          onClick={() => { setTab("overall"); setSelectedMatch(null); }}
          className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${tab === "overall" ? "bg-white/10 text-white shadow-inner" : "text-muted-foreground hover:text-white"}`}
        >
          <Trophy size={14} className="inline mr-1.5 -mt-0.5" /> Tournament Ranking
        </button>
        <button
          onClick={() => { setTab("matches"); setSelectedMatch(null); }}
          className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${tab === "matches" ? "bg-white/10 text-white shadow-inner" : "text-muted-foreground hover:text-white"}`}
        >
          <ListOrdered size={14} className="inline mr-1.5 -mt-0.5" /> Match Leaderboards
        </button>
        <button
          onClick={() => { setTab("history"); setSelectedMatch(null); }}
          className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${tab === "history" ? "bg-white/10 text-white shadow-inner" : "text-muted-foreground hover:text-white"}`}
        >
          <HistoryIcon size={14} className="inline mr-1.5 -mt-0.5" /> Match History
        </button>
      </div>

      {tab === "matches" ? (
        selectedMatch ? (
          <MatchHistoryDetail match={selectedMatch} onBack={() => setSelectedMatch(null)} currentUserId={user?.employee_id} />
        ) : (
          <MatchLeaderboardList onSelect={setSelectedMatch} />
        )
      ) : tab === "history" ? (
        selectedMatch ? (
          <MatchHistoryDetail match={selectedMatch} onBack={() => setSelectedMatch(null)} currentUserId={user?.employee_id} />
        ) : (
          <MatchHistoryList onSelect={setSelectedMatch} />
        )
      ) : (
      <>
      <section className="glossy-card p-5 pb-3 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(245,215,110,0.18), transparent 70%)",
          }}
        />
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground text-center font-bold relative">
          Top Performers
        </p>
        {isLoading || rows.length === 0 ? (
          <div className="grid grid-cols-3 items-end mt-4 gap-2">
            {[2, 1, 3].map((r) => (
              <div key={r} className="flex flex-col items-center gap-2">
                <div className="skeleton w-14 h-14 rounded-full" />
                <div className="skeleton h-3 w-14" />
                <div className={`skeleton w-full ${r === 1 ? "h-32" : r === 2 ? "h-24" : "h-20"} rounded-t-2xl`} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 items-end mt-4 gap-2 relative">
            <Podium rank={2} row={top3[1]} />
            <Podium rank={1} row={top3[0]} />
            <Podium rank={3} row={top3[2]} />
          </div>
        )}
      </section>

      <ul className="space-y-2">
        {rest.map((r, i) => {
          const rank = r.rank;
          const mine = r.id === user?.id;
          return (
            <li
              key={r.id}
              className={`glossy-card px-4 py-3 flex items-center gap-3 transition-transform duration-200 hover:-translate-y-0.5 ${mine ? "rank-mine" : ""}`}
            >
              <span className="w-8 text-center text-sm font-black text-muted-foreground tabular-nums">#{rank}</span>
              <Avatar url={r.avatar_url} code={r.employee_id} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate tracking-tight">
                  {r.name || r.employee_id}
                  <span className="font-normal text-muted-foreground"> | {r.brand_name || "Not Assigned"}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">{r.employee_id}</p>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-base font-black tabular-nums" style={{ color: "var(--primary-glow)" }}>
                  {r.total_points}
                </span>
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">pts</span>
              </div>
            </li>
          );
        })}
        {!isLoading && rows.length === 0 && (
          <li className="glossy-card p-8 text-center">
            <Medal size={28} className="mx-auto text-muted-foreground/60 mb-2" />
            <p className="text-sm font-semibold">No scores yet</p>
            <p className="text-[11px] text-muted-foreground mt-1">Predictions are scored as matches complete.</p>
          </li>
        )}
      </ul>
      </>
      )}

      {tab === "overall" && me && (
        <div className="fixed bottom-[88px] inset-x-0 z-30 px-4">
          <div
            className="mx-auto max-w-2xl glossy-card p-3 flex items-center gap-3 rank-mine"
          >
            <span className="w-9 text-center text-base font-black tabular-nums">#{me.rank}</span>
            <Avatar url={me.avatar_url} code={me.employee_id} />
            <div className="flex-1">
              <p className="text-sm font-black tracking-tight">Your Rank</p>
              <p className="text-[11px] text-muted-foreground">{me.employee_id}</p>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-lg font-black tabular-nums" style={{ color: "var(--primary-glow)" }}>
                {me.total_points}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">pts</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ url, code }: { url: string | null; code: string }) {
  return (
    <div className="w-9 h-9 rounded-full overflow-hidden border border-white/10 bg-black/30 flex items-center justify-center text-[11px] font-bold">
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : code.slice(0, 2).toUpperCase()}
    </div>
  );
}

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="glossy-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
        <span className="text-[color:var(--primary-glow)]">{icon}</span>{label}
      </div>
      <p className="text-base font-black mt-0.5 truncate" style={{ color: "var(--primary-glow)" }}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground -mt-0.5">{sub}</p>}
    </div>
  );
}

function MatchLeaderboardList({ onSelect }: { onSelect: (m: CompletedMatch) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", "match-leaderboards", "list"],
    queryFn: async () => {
      const { data: matches, error } = await supabase
        .from("matches")
        .select("id, home_team, away_team, home_flag, away_flag, home_score, away_score, match_time")
        .eq("status", "completed")
        .order("match_time", { ascending: false })
        .limit(200);
      if (error) throw error;
      const list = (matches ?? []) as CompletedMatch[];
      const ids = list.map((m) => m.id);
      if (ids.length === 0) return [] as (CompletedMatch & { predCount: number })[];
      const { data: preds, error: pErr } = await supabase
        .from("predictions")
        .select("match_id")
        .in("match_id", ids);
      if (pErr) throw pErr;
      const counts = new Map<string, number>();
      for (const p of preds ?? []) counts.set(p.match_id as string, (counts.get(p.match_id as string) ?? 0) + 1);
      return list.map((m) => ({ ...m, predCount: counts.get(m.id) ?? 0 }));
    },
  });

  if (isLoading) {
    return <ul className="space-y-2">{[0,1,2].map((i) => <li key={i} className="skeleton h-[84px]" />)}</ul>;
  }
  const matches = data ?? [];
  if (matches.length === 0) {
    return (
      <div className="glossy-card p-8 text-center">
        <ListOrdered size={28} className="mx-auto text-muted-foreground/60 mb-2" />
        <p className="text-sm font-semibold">No completed matches yet</p>
        <p className="text-[11px] text-muted-foreground mt-1">Per-match rankings appear here as fixtures finish.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {matches.map((m) => (
        <li
          key={m.id}
          onClick={() => onSelect(m)}
          className="glossy-card px-4 py-3 flex items-center gap-3 cursor-pointer transition-transform duration-200 hover:-translate-y-0.5"
        >
          <div className="flex -space-x-2">
            <TeamFlag team={m.home_team} size={32} className="ring-2 ring-[color:var(--card)]" />
            <TeamFlag team={m.away_team} size={32} className="ring-2 ring-[color:var(--card)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">
              {m.home_team} <span className="text-muted-foreground">vs</span> {m.away_team}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {formatIstDateTime(m.match_time)} <span className="opacity-70">{IST_LABEL}</span> · {m.predCount} prediction{m.predCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="text-right">
            <p className="score-display" style={{ fontSize: "1.3rem" }}>
              {m.home_score ?? "—"}<span className="text-muted-foreground mx-1">-</span>{m.away_score ?? "—"}
            </p>
            <p className="text-[9px] uppercase tracking-widest text-[color:var(--primary-glow)] font-bold mt-0.5">View Ranks →</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function MatchHistoryList({ onSelect }: { onSelect: (m: CompletedMatch) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", "history", "matches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("id, home_team, away_team, home_flag, away_flag, home_score, away_score, match_time")
        .eq("status", "completed")
        .order("match_time", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as CompletedMatch[];
    },
  });

  if (isLoading) {
    return (
      <ul className="space-y-2">
        {[0, 1, 2].map((i) => <li key={i} className="skeleton h-[72px]" />)}
      </ul>
    );
  }

  const matches = data ?? [];
  if (matches.length === 0) {
    return (
      <div className="glossy-card p-8 text-center">
        <HistoryIcon size={28} className="mx-auto text-muted-foreground/60 mb-2" />
        <p className="text-sm font-semibold">No completed matches yet</p>
        <p className="text-[11px] text-muted-foreground mt-1">Past results will appear here as matches finish.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {matches.map((m) => (
        <li
          key={m.id}
          onClick={() => onSelect(m)}
          className="glossy-card px-4 py-3 flex items-center gap-3 cursor-pointer transition-transform duration-200 hover:-translate-y-0.5"
        >
          <div className="flex -space-x-2">
            <TeamFlag team={m.home_team} size={32} className="ring-2 ring-[color:var(--card)]" />
            <TeamFlag team={m.away_team} size={32} className="ring-2 ring-[color:var(--card)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">
              {m.home_team} <span className="text-muted-foreground">vs</span> {m.away_team}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {formatIstDateTime(m.match_time)} <span className="opacity-70">{IST_LABEL}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="score-display" style={{ fontSize: "1.4rem" }}>
              {m.home_score ?? "—"}<span className="text-muted-foreground mx-1">-</span>{m.away_score ?? "—"}
            </p>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mt-0.5">Full Time</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function MatchHistoryDetail({
  match,
  onBack,
  currentUserId,
}: {
  match: CompletedMatch;
  onBack: () => void;
  currentUserId: string | undefined;
}) {
  const { data: rawData, isLoading } = useQuery({
    queryKey: ["leaderboard", "history", "match", match.id],
    queryFn: async () => {
      const { data: preds, error: pErr } = await supabase
        .from("predictions")
        .select("id, user_id, predicted_home_score, predicted_away_score, winner, points_earned, created_at")
        .eq("match_id", match.id);
      if (pErr) throw pErr;
      const rows = (preds ?? []) as MatchPredictionRow[];
      if (rows.length === 0) return [] as (MatchPredictionRow & { name: string; brand_name: string | null })[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: users, error: uErr } = await supabase
        .from("registered_users")
        .select("employee_id, name, brand_name")
        .in("employee_id", ids);
      if (uErr) throw uErr;
      const nameMap = new Map((users ?? []).map((u) => [u.employee_id as string, { name: (u.name as string) || (u.employee_id as string), brand_name: (u.brand_name as string | null) ?? null }]));
      return rows.map((r) => ({ ...r, name: nameMap.get(r.user_id)?.name ?? r.user_id, brand_name: nameMap.get(r.user_id)?.brand_name ?? null })) as (MatchPredictionRow & { name: string; brand_name: string | null })[];
    },
  });

  const stats = useMemo(
    () => buildUserStatMap(rawData ?? [], (r) => r.user_id, (r) => r.points_earned ?? 0, (r) => r.created_at),
    [rawData],
  );

  const data = sortAndRank(
    rawData ?? [],
    (r) => r.user_id,
    (r) => r.name,
    (r) => r.points_earned ?? 0,
    stats,
  );

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-white transition-colors"
      >
        <ChevronLeft size={14} /> Back to matches
      </button>

      <div className="glossy-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <TeamFlag team={match.home_team} size={36} />
            <p className="text-sm font-bold truncate">{match.home_team}</p>
          </div>
          <div className="flex items-center gap-2 px-2">
            <span className="score-display" style={{ fontSize: "1.8rem" }}>{match.home_score ?? "—"}</span>
            <span className="text-base font-bold text-muted-foreground">—</span>
            <span className="score-display" style={{ fontSize: "1.8rem" }}>{match.away_score ?? "—"}</span>
          </div>
          <div className="flex items-center gap-2 min-w-0 justify-end">
            <p className="text-sm font-bold truncate text-right">{match.away_team}</p>
            <TeamFlag team={match.away_team} size={36} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground text-center mt-2">
          {formatIstDateTime(match.match_time)} <span className="opacity-70">{IST_LABEL}</span>
        </p>
      </div>

      {isLoading ? (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => <li key={i} className="skeleton h-[56px]" />)}
        </ul>
      ) : data.length === 0 ? (
        <div className="glossy-card p-8 text-center">
          <p className="text-sm font-semibold">No predictions for this match</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((p) => {
            const rank = p.rank;
            const mine = p.user_id === currentUserId;
            return (
              <li
                key={p.id}
                className={`glossy-card px-4 py-3 flex items-center gap-3 ${mine ? "rank-mine" : ""}`}
              >
                <span className="w-8 text-center text-sm font-black text-muted-foreground tabular-nums">#{rank}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate tracking-tight">
                    {p.name}
                    <span className="font-normal text-muted-foreground"> | {p.brand_name || "Not Assigned"}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Pick {p.predicted_home_score ?? "?"}–{p.predicted_away_score ?? "?"} · Actual {match.home_score ?? "—"}–{match.away_score ?? "—"}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <span
                    className="text-base font-black tabular-nums"
                    style={{ color: p.points_earned > 0 ? "var(--primary-glow)" : "var(--muted-foreground)" }}
                  >
                    +{p.points_earned}
                  </span>
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">pts</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Podium({ rank, row }: { rank: 1 | 2 | 3; row: Row | undefined }) {
  const colors: Record<number, { bg: string; h: string }> = {
    1: { bg: "var(--gradient-podium-gold)", h: "h-32" },
    2: { bg: "var(--gradient-podium-silver)", h: "h-24" },
    3: { bg: "var(--gradient-podium-bronze)", h: "h-20" },
  };
  const delays: Record<number, string> = { 2: "0ms", 1: "120ms", 3: "240ms" };
  const c = colors[rank];
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`${rank === 1 ? "w-16 h-16" : "w-14 h-14"} rounded-full overflow-hidden border-2 ${rank === 1 ? "border-yellow-300/60" : "border-white/30"} bg-black/40 flex items-center justify-center text-sm font-bold transition-transform duration-300 hover:scale-110`}
        style={rank === 1 ? { boxShadow: "0 0 28px -4px rgba(245,215,110,0.55)" } : undefined}
      >
        {row?.avatar_url ? (
          <img src={row.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          row?.name?.slice(0, 2).toUpperCase() ?? "—"
        )}
      </div>
      <p className={`${rank === 1 ? "text-sm" : "text-xs"} font-bold text-center leading-tight tracking-tight max-w-full truncate px-1`}>
        {row?.name || "—"}
      </p>
      <p className="text-[11px] font-black tabular-nums" style={{ color: rank === 1 ? "#f5d76e" : "var(--primary-glow)" }}>
        {row?.total_points ?? 0} PTS
      </p>
      <div
        className={`w-full ${c.h} rounded-t-2xl flex items-start justify-center pt-2 relative tilt-card podium-rise`}
        style={{ background: c.bg, boxShadow: "var(--shadow-tilt)", animationDelay: delays[rank] }}
      >
        {rank === 1 && <Crown size={18} className="absolute -top-3 text-yellow-300 drop-shadow" />}
        <span className="text-xl font-black text-black/70">{rank}</span>
      </div>
    </div>
  );
}