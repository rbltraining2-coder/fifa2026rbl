import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Crown, Trophy, Medal } from "lucide-react";

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

type Row = { id: string; employee_id: string; name: string; avatar_url: string | null; total_points: number };

function LeaderboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registered_users")
        .select("id, employee_id, name, avatar_url, total_points")
        .order("total_points", { ascending: false })
        .order("employee_id", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = data ?? [];
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const myIdx = rows.findIndex((r) => r.id === user?.id);
  const me = myIdx >= 0 ? rows[myIdx] : null;

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-2">
        <Trophy size={22} className="text-[color:var(--primary-glow)]" />
        <h1 className="text-xl font-black tracking-tight">Leaderboard</h1>
      </div>

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
          const rank = i + 4;
          const mine = r.id === user?.id;
          return (
            <li
              key={r.id}
              className={`glossy-card px-4 py-3 flex items-center gap-3 transition-transform duration-200 hover:-translate-y-0.5 ${mine ? "rank-mine" : ""}`}
            >
              <span className="w-8 text-center text-sm font-black text-muted-foreground tabular-nums">#{rank}</span>
              <Avatar url={r.avatar_url} code={r.employee_id} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate tracking-tight">{r.name || r.employee_id}</p>
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

      {me && (
        <div className="fixed bottom-[88px] inset-x-0 z-30 px-4">
          <div
            className="mx-auto max-w-2xl glossy-card p-3 flex items-center gap-3 rank-mine"
          >
            <span className="w-9 text-center text-base font-black tabular-nums">#{myIdx + 1}</span>
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