import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Trophy, Calendar, CalendarDays, CalendarRange, Crown } from "lucide-react";
import championBanner from "@/assets/champion-cup-banner.png";
import { useUserRankingStats, sortAndRank } from "@/lib/ranking";

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

type PeriodType = "daily" | "weekly" | "monthly" | "season";

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

const TABS: { id: PeriodType; label: string; icon: typeof Calendar }[] = [
  { id: "daily",   label: "Daily",   icon: Calendar },
  { id: "weekly",  label: "Weekly",  icon: CalendarDays },
  { id: "monthly", label: "Monthly", icon: CalendarRange },
  { id: "season",  label: "Season",  icon: Trophy },
];

function RewardsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<PeriodType>("weekly");
  const { data: stats } = useUserRankingStats();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["reward_winners", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reward_winners")
        .select("*")
        .eq("period_type", tab)
        .order("period_start", { ascending: false })
        .limit(500);
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
        .select("employee_id, name, avatar_url")
        .in("employee_id", allUserIds);
      if (error) throw error;
      const m = new Map<string, { name: string; avatar_url: string | null }>();
      (data ?? []).forEach((u: any) =>
        m.set(u.employee_id, { name: u.name || u.employee_id, avatar_url: u.avatar_url }),
      );
      return m;
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
      const ranked = sortAndRank(
        items,
        (r) => r.user_id,
        (r) => nameMap?.get(r.user_id)?.name ?? r.user_id,
        (r) => r.total_points,
        stats,
      );
      return { key, label: items[0].period_label, items: ranked };
    });
  }, [rows, stats, nameMap]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black">Rewards</h1>
      <p className="text-sm text-muted-foreground">
        Daily, weekly, monthly and season champions. Tied scores share the same rank.
      </p>

      <section
        aria-label="Champion Cup banner"
        className="w-full rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 20px 60px -20px rgba(120,60,220,0.55)" }}
      >
        <img
          src={championBanner}
          alt="RBL FIFA 2026 League — Play. Predict. Win!"
          className="w-full h-auto block"
          loading="eager"
        />
      </section>

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
                        <Crown size={18} className="text-yellow-300 shrink-0" />
                        <Avatar url={u?.avatar_url ?? null} fallback={u?.name ?? w.user_id} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black truncate">{u?.name ?? w.user_id}</p>
                          <p className="text-[10px] text-muted-foreground">{w.user_id}</p>
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
                        <span className="w-6 text-center text-xs font-black text-muted-foreground tabular-nums">#{r.rank}</span>
                        <Avatar url={u?.avatar_url ?? null} fallback={u?.name ?? r.user_id} small />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{u?.name ?? r.user_id}</p>
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