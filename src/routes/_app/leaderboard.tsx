import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Crown } from "lucide-react";

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
  const { data } = useQuery({
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
      <h1 className="text-xl font-black">Leaderboard</h1>

      <section className="glossy-card p-5 pb-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center">Top Performers</p>
        <div className="grid grid-cols-3 items-end mt-4 gap-2">
          <Podium rank={2} row={top3[1]} />
          <Podium rank={1} row={top3[0]} />
          <Podium rank={3} row={top3[2]} />
        </div>
      </section>

      <ul className="space-y-1.5">
        {rest.map((r, i) => {
          const rank = i + 4;
          const mine = r.id === user?.id;
          return (
            <li
              key={r.id}
              className="glossy-card px-4 py-3 flex items-center gap-3"
              style={mine ? { outline: "2px solid var(--success)" } : undefined}
            >
              <span className="w-7 text-center text-sm font-bold text-muted-foreground tabular-nums">{rank}</span>
              <Avatar url={r.avatar_url} code={r.employee_id} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{r.name || r.employee_code}</p>
                <p className="text-[11px] text-muted-foreground">{r.employee_code}</p>
              </div>
              <span className="text-sm font-black" style={{ color: "var(--success)" }}>
                {r.total_points} PTS
              </span>
            </li>
          );
        })}
      </ul>

      {me && (
        <div className="fixed bottom-[88px] inset-x-0 z-30 px-4">
          <div
            className="mx-auto max-w-2xl glossy-card p-3 flex items-center gap-3"
            style={{ outline: "2px solid var(--primary-glow)", boxShadow: "var(--shadow-glow-primary)" }}
          >
            <span className="w-7 text-center text-sm font-bold tabular-nums">#{myIdx + 1}</span>
            <Avatar url={me.avatar_url} code={me.employee_code} />
            <div className="flex-1">
              <p className="text-sm font-bold">Your Rank</p>
              <p className="text-[11px] text-muted-foreground">{me.employee_code}</p>
            </div>
            <span className="text-sm font-black" style={{ color: "var(--success)" }}>
              {me.total_points} PTS
            </span>
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
  const c = colors[rank];
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/30 bg-black/40 flex items-center justify-center text-sm font-bold">
        {row?.avatar_url ? (
          <img src={row.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          row?.name?.slice(0, 2).toUpperCase() ?? "—"
        )}
      </div>
      <p className="text-xs font-bold text-center leading-tight">{row?.name || "—"}</p>
      <p className="text-[11px] font-black" style={{ color: "var(--success)" }}>
        {row?.total_points ?? 0} PTS
      </p>
      <div
        className={`w-full ${c.h} rounded-t-2xl flex items-start justify-center pt-2 relative tilt-card`}
        style={{ background: c.bg, boxShadow: "var(--shadow-tilt)" }}
      >
        {rank === 1 && <Crown size={18} className="absolute -top-3 text-yellow-300 drop-shadow" />}
        <span className="text-xl font-black text-black/70">{rank}</span>
      </div>
    </div>
  );
}