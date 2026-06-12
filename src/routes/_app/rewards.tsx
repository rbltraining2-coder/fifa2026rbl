import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Trophy, Calendar, CalendarDays, Crown } from "lucide-react";
import championBannerAsset from "@/assets/rewards-banner-v2.png.asset.json";
import { buildUserStatMap, sortAndRank } from "@/lib/ranking";
import BrandLabel from "@/components/BrandLabel";

const LABELS: Record<PeriodType, { winner: string; sub: string }> = {
  daily:   { winner: "🏆 Match Winner",     sub: "🥈 Runner-Up" },
  weekly:  { winner: "🥇 Weekly Champion",  sub: "🥈 Runner-Up" },
  season:  { winner: "👑 Season Champion",  sub: "🥈 Runner-Up" },
};

export const Route = createFileRoute("/_app/rewards")({
  head: () => ({
    meta: [
      { title: "Rewards — Goal Gurus" },
      { name: "description", content: "Daily, weekly, monthly and season champions of the Goal Gurus prediction league." },
      { property: "og:title", content: "Rewards — Goal Gurus" },
      { property: "og:description", content: "Daily, weekly, monthly and season champions of the Goal Gurus prediction league." },
      { property: "og:url", content: "https://fifa2026rbl.lovable.app/rewards" },
    ],
    links: [{ rel: "canonical", href: "https://fifa2026rbl.lovable.app/rewards" }],
  }),
  component: RewardsPage,
});

type PeriodType = "daily" | "weekly" | "season";

type RewardRow = {
  id: string;
  period_type: PeriodType;
  period_key: string;
  period_label: string;
  period_start: string;
  period_end: string;
  user_id: string;
  total_points: number;
  rank: number;
};

type RewardPredictionRow = {
  user_id: string;
  match_id: string;
  points_earned: number;
  created_at: string;
};

type RewardMatchRow = { id: string; match_time: string };

type MerchRow = { id: string; rank: number; name: string; image_url: string | null; active: boolean };

type PrizeRow = { id: string; period_type: PeriodType; rank: number; label: string; icon: string | null; active: boolean };

const TABS: { id: PeriodType; label: string; icon: typeof Calendar }[] = [
  { id: "daily",   label: "Daily",   icon: Calendar },
  { id: "weekly",  label: "Weekly",  icon: CalendarDays },
  { id: "season",  label: "Season",  icon: Trophy },
];

function RewardsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<PeriodType>("weekly");

  const { data: merch } = useQuery({
    queryKey: ["season-merch"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("season_merchandise")
        .select("id, rank, name, image_url, active")
        .eq("active", true)
        .order("rank", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MerchRow[];
    },
  });
  const merchByRank = useMemo(() => {
    const m = new Map<number, MerchRow>();
    (merch ?? []).forEach(r => { if (!m.has(r.rank)) m.set(r.rank, r); });
    return m;
  }, [merch]);

  const { data: prizes } = useQuery({
    queryKey: ["prize-labels"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("prize_labels")
        .select("id, period_type, rank, label, icon, active")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as PrizeRow[];
    },
  });
  const prizeByKey = useMemo(() => {
    const m = new Map<string, PrizeRow>();
    (prizes ?? []).forEach(r => m.set(`${r.period_type}:${r.rank}`, r));
    return m;
  }, [prizes]);
  const getPrize = (period: PeriodType, rank: number) =>
    prizeByKey.get(`${period}:${rank}`) ?? null;

  const { data: rows, isLoading } = useQuery({
    queryKey: ["reward_winners", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reward_winners")
        .select("*")
        .eq("period_type", tab)
        .order("period_start", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as RewardRow[];
    },
  });

  // Resolve user-friendly names for the listed user_ids.
  const allUserIds = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.user_id))),
    [rows],
  );
  const { data: nameMap } = useQuery({
    queryKey: ["reward_winners", "names", allUserIds.join(",")],
    enabled: allUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registered_users")
        .select("employee_id, name, avatar_url, brand_name")
        .in("employee_id", allUserIds)
        .limit(10000);
      if (error) throw error;
      const m = new Map<string, { name: string; avatar_url: string | null; brand_name: string | null }>();
      (data ?? []).forEach((u: any) =>
        m.set(u.employee_id, { name: u.name || u.employee_id, avatar_url: u.avatar_url, brand_name: u.brand_name ?? null }),
      );
      return m;
    },
  });

  const { data: periodStatsSource } = useQuery({
    queryKey: ["reward_winners", "period-ranking-source", tab],
    queryFn: async () => {
      const { data: matches, error: mErr } = await supabase
        .from("matches")
        .select("id, match_time")
        .eq("status", "completed")
        .not("home_score", "is", null)
        .not("away_score", "is", null)
        .limit(1000);
      if (mErr) throw mErr;
      const matchById = new Map((matches ?? []).map((m) => [m.id as string, m as RewardMatchRow]));
      const predictions: RewardPredictionRow[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("predictions")
          .select("user_id, match_id, points_earned, created_at")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        predictions.push(...((data ?? []) as RewardPredictionRow[]));
        if ((data ?? []).length < pageSize) break;
      }
      return { matchById, predictions };
    },
  });

  const periods = useMemo(() => {
    const map = new Map<string, RewardRow[]>();
    (rows ?? []).forEach((r) => {
      const arr = map.get(r.period_key) ?? [];
      arr.push(r);
      map.set(r.period_key, arr);
    });
    return Array.from(map.entries()).map(([key, items]) => {
      const first = items[0];
      const periodStart = Date.parse(first.period_start);
      const periodEnd = Date.parse(first.period_end);
      const periodPredictions = (periodStatsSource?.predictions ?? []).filter((p) => {
        const m = periodStatsSource?.matchById.get(p.match_id);
        if (!m) return false;
        if (tab === "season") return true;
        const t = Date.parse(m.match_time);
        return t >= periodStart && t < periodEnd;
      });
      const periodStats = buildUserStatMap(
        periodPredictions,
        (p) => p.user_id,
        (p) => p.points_earned ?? 0,
        (p) => p.created_at,
      );
      const ranked = sortAndRank(
        items,
        (r) => r.user_id,
        (r) => nameMap?.get(r.user_id)?.name ?? r.user_id,
        (r) => r.total_points,
        periodStats,
      );
      return { key, label: items[0].period_label, items: ranked };
    });
  }, [rows, tab, periodStatsSource, nameMap]);

  const todayWinners = useMemo(() => {
    if (tab !== "daily") return null;
    if (!periodStatsSource || periodStatsSource.matchById.size === 0) return null;
    const allMatches = Array.from(periodStatsSource.matchById.values());
    if (allMatches.length === 0) return null;
    const sorted = [...allMatches].sort(
      (a, b) => Date.parse(b.match_time) - Date.parse(a.match_time),
    );
    const mostRecent = sorted[0];
    const fmt = (iso: string) =>
      new Date(iso).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    const targetDateString = fmt(mostRecent.match_time);
    const targetMatches = allMatches.filter(
      (m) => fmt(m.match_time) === targetDateString,
    );
    const targetIds = new Set(targetMatches.map((m) => m.id));
    const dailyPredictions = periodStatsSource.predictions.filter((p) =>
      targetIds.has(p.match_id),
    );
    const totals = new Map<string, number>();
    for (const p of dailyPredictions) {
      totals.set(p.user_id, (totals.get(p.user_id) ?? 0) + (p.points_earned ?? 0));
    }
    const stats = buildUserStatMap(
      dailyPredictions,
      (p) => p.user_id,
      (p) => p.points_earned ?? 0,
      (p) => p.created_at,
    );
    const userRows = Array.from(totals.entries()).map(([user_id, total_points]) => ({
      user_id,
      total_points,
    }));
    const ranked = sortAndRank(
      userRows,
      (r) => r.user_id,
      (r) => nameMap?.get(r.user_id)?.name ?? r.user_id,
      (r) => r.total_points,
      stats,
    );
    const top3 = ranked.filter((r) => r.rank <= 3);
    return { dateLabel: targetDateString, items: top3 };
  }, [tab, periodStatsSource, nameMap]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black">Rewards</h1>

      <section
        aria-label="Champion Cup banner"
        className="w-full rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 20px 60px -20px rgba(120,60,220,0.55)" }}
      >
        <img
          src={championBannerAsset.url}
          alt="RBL World Cup League 2026 — Play. Predict. Win!"
          className="w-full h-auto block object-contain"
          loading="eager"
        />
      </section>

      <div
        className="w-full text-center rounded-xl px-4 py-3 text-xs sm:text-sm font-semibold tracking-wide text-white/90"
        style={{
          background: "linear-gradient(135deg, rgba(147,51,234,0.22), rgba(59,130,246,0.18))",
          border: "1px solid rgba(167,139,250,0.35)",
          boxShadow: "0 8px 24px -12px rgba(120,60,220,0.55)",
        }}
      >
        🗓️ Weekly Rewards will be announced every <span className="font-black text-yellow-300" style={{ textShadow: "0 0 12px rgba(253,224,71,0.55)" }}>Monday</span>.
      </div>

      <div className="glossy-card p-1 inline-flex gap-1 w-full">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 px-2 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
              tab === id ? "bg-white/10 text-white shadow-inner" : "text-muted-foreground hover:text-white"
            }`}
          >
            <Icon size={13} className="inline mr-1 -mt-0.5" /> {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <ul className="space-y-2">
          {[0, 1, 2].map((i) => <li key={i} className="skeleton h-[120px]" />)}
        </ul>
      ) : periods.length === 0 ? (
        <div className="glossy-card p-8 text-center">
          <Trophy size={28} className="mx-auto text-muted-foreground/60 mb-2" />
          <p className="text-sm font-semibold">No {tab} winners yet</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Winners appear automatically once matches complete.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {tab === "daily" && todayWinners && todayWinners.items.length > 0 && (
            <li className="glossy-card p-4 relative overflow-hidden">
              <div className="accent-strip" />
              <div className="flex items-center justify-between mb-3">
                <p
                  className="text-sm font-black tracking-wide"
                  style={{ color: "#f5d76e", textShadow: "0 0 12px rgba(245,215,110,0.45)" }}
                >
                  🏆 Top 3 Winners of the Day
                </p>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {todayWinners.dateLabel}
                </span>
              </div>
              <ul className="space-y-2">
                {todayWinners.items.map((w) => {
                  const u = nameMap?.get(w.user_id);
                  const mine = w.user_id === user?.employee_id;
                  const isFirst = w.rank === 1;
                  if (isFirst) {
                    return (
                      <li
                        key={`today-${w.user_id}`}
                        className={`flex items-center gap-3 p-3 rounded-xl ${mine ? "rank-mine" : ""}`}
                        style={{
                          background:
                            "linear-gradient(135deg, rgba(245,215,110,0.22), rgba(245,215,110,0.04))",
                          border: "1px solid rgba(245,215,110,0.4)",
                        }}
                      >
                        <div className="flex flex-col items-center justify-center shrink-0 w-8">
                          <Crown size={18} className="text-yellow-300" />
                          <span className="text-[9px] font-black text-yellow-300 mt-0.5 tracking-wider">
                            1ST
                          </span>
                        </div>
                        <Avatar url={u?.avatar_url ?? null} fallback={u?.name ?? w.user_id} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black truncate">
                            {u?.name ?? w.user_id}
                            <span className="font-normal text-muted-foreground">
                              {" | "}
                              <BrandLabel brand={u?.brand_name} />
                            </span>
                          </p>
                          <p className="text-[10px] text-muted-foreground">{w.user_id}</p>
                        </div>
                        <div className="text-right">
                          <span
                            className="text-lg font-black tabular-nums"
                            style={{ color: "#f5d76e" }}
                          >
                            {w.total_points}
                          </span>
                          <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold block">
                            pts
                          </span>
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li
                      key={`today-${w.user_id}`}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 ${mine ? "rank-mine" : ""}`}
                    >
                      <span className="w-8 text-center text-xs font-black text-muted-foreground tabular-nums">
                        {w.rank === 2 ? "2nd" : "3rd"}
                      </span>
                      <Avatar url={u?.avatar_url ?? null} fallback={u?.name ?? w.user_id} small />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">
                          {u?.name ?? w.user_id}
                          <span className="font-normal text-muted-foreground">
                            {" | "}
                            <BrandLabel brand={u?.brand_name} />
                          </span>
                        </p>
                      </div>
                      <span
                        className="text-sm font-black tabular-nums"
                        style={{ color: "var(--primary-glow)" }}
                      >
                        {w.total_points}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          )}
          {periods.map((p) => {
            const winners = p.items.filter((i) => i.rank === 1);
            const runners = p.items.filter((i) => i.rank > 1 && i.rank <= 3);
            return (
              <li key={p.key} className="glossy-card p-4 relative overflow-hidden">
                <div className="accent-strip" />
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">
                    {p.label}
                  </p>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {winners.length > 1 ? `${winners.length}-way tie` : "Champion"}
                  </span>
                </div>
                <ul className="space-y-2">
                  {winners.map((w) => {
                    const u = nameMap?.get(w.user_id);
                    const mine = w.user_id === user?.employee_id;
                    return (
                      <li
                        key={w.id}
                        className={`flex items-center gap-3 p-3 rounded-xl ${mine ? "rank-mine" : ""}`}
                        style={{
                          background: "linear-gradient(135deg, rgba(245,215,110,0.18), rgba(245,215,110,0.04))",
                          border: "1px solid rgba(245,215,110,0.35)",
                        }}
                      >
                        <div className="flex flex-col items-center justify-center shrink-0 w-8">
                          <Crown size={18} className="text-yellow-300" />
                          <span className="text-[9px] font-black text-yellow-300 mt-0.5 tracking-wider">1ST</span>
                        </div>
                        <Avatar url={u?.avatar_url ?? null} fallback={u?.name ?? w.user_id} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black truncate">
                            {u?.name ?? w.user_id}
                            <span className="font-normal text-muted-foreground"> | <BrandLabel brand={u?.brand_name} /></span>
                          </p>
                          <p className="text-[10px] text-muted-foreground">{w.user_id}</p>
                          <p className="text-[10px] font-bold mt-0.5" style={{ color: "#f5d76e" }}>{LABELS[tab].winner}</p>
                          <PrizeBadge prize={getPrize(tab, w.rank)} tone="gold" />
                          {tab === "season" && merchByRank.get(w.rank) && (
                            <p className="text-[10px] text-[color:var(--primary-glow)] font-semibold mt-0.5">🎁 {merchByRank.get(w.rank)!.name}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-black tabular-nums" style={{ color: "#f5d76e" }}>
                            {w.total_points}
                          </span>
                          <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold block">pts</span>
                        </div>
                      </li>
                    );
                  })}
                  {runners.map((r) => {
                    const u = nameMap?.get(r.user_id);
                    const mine = r.user_id === user?.employee_id;
                    return (
                      <li
                        key={r.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 ${mine ? "rank-mine" : ""}`}
                      >
                        <span className="w-8 text-center text-xs font-black text-muted-foreground tabular-nums">
                          {r.rank === 2 ? "2nd" : r.rank === 3 ? "3rd" : `${r.rank}th`}
                        </span>
                        <Avatar url={u?.avatar_url ?? null} fallback={u?.name ?? r.user_id} small />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">
                            {u?.name ?? r.user_id}
                            <span className="font-normal text-muted-foreground"> | <BrandLabel brand={u?.brand_name} /></span>
                          </p>
                          <PrizeBadge prize={getPrize(tab, r.rank)} tone="silver" />
                          {tab === "season" && merchByRank.get(r.rank) && (
                            <p className="text-[10px] text-[color:var(--primary-glow)] font-semibold">🎁 {merchByRank.get(r.rank)!.name}</p>
                          )}
                        </div>
                        <span className="text-sm font-black tabular-nums" style={{ color: "var(--primary-glow)" }}>
                          {r.total_points}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Avatar({ url, fallback, small }: { url: string | null; fallback: string; small?: boolean }) {
  const size = small ? "w-7 h-7 text-[10px]" : "w-10 h-10 text-xs";
  return (
    <div className={`${size} rounded-full overflow-hidden border border-white/10 bg-black/30 flex items-center justify-center font-bold shrink-0`}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : fallback.slice(0, 2).toUpperCase()}
    </div>
  );
}

function PrizeBadge({ prize, tone }: { prize: PrizeRow | null; tone: "gold" | "silver" }) {
  if (!prize) return null;
  const gradients: Record<"gold" | "silver", string> = {
    gold: "linear-gradient(135deg, #fde68a 0%, #f59e0b 45%, #b45309 100%)",
    silver: "linear-gradient(135deg, #e0e7ff 0%, #a5b4fc 45%, #4f46e5 100%)",
  };
  const shadow =
    "0 6px 14px -4px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 3px rgba(0,0,0,0.28)";
  return (
    <span
      title={prize.label}
      className="prize-pill inline-flex items-center gap-1 mt-1 px-2.5 py-[3px] rounded-full text-[10px] font-black uppercase tracking-wider text-black/85 max-w-full"
      style={{
        background: gradients[tone],
        boxShadow: shadow,
        border: "1px solid rgba(255,255,255,0.35)",
        textShadow: "0 1px 0 rgba(255,255,255,0.4)",
      }}
    >
      {prize.icon && <span className="text-[11px] leading-none">{prize.icon}</span>}
      <span className="truncate">{prize.label}</span>
    </span>
  );
}
