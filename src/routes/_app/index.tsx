import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { FeatureMatchCard, type Match } from "@/components/MatchCard";
import PredictionSheet from "@/components/PredictionSheet";
import { flagUrl } from "@/lib/flags";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [
      { title: "Match Predictions — Goal Gurus" },
      { name: "description", content: "See today's matches and upcoming fixtures, then lock in your predictions for the RBL FIFA 2026 league." },
      { property: "og:title", content: "Match Predictions — Goal Gurus" },
      { property: "og:description", content: "See today's matches and upcoming fixtures, then lock in your predictions for the RBL FIFA 2026 league." },
      { property: "og:url", content: "https://fifa2026rbl.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://fifa2026rbl.lovable.app/" }],
  }),
  component: HomePage,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

function HomePage() {
  const { profile } = useAuth();
  const [sheet, setSheet] = useState<Match | null>(null);

  const { data: matches } = useQuery({
    queryKey: ["matches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .order("match_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Match[];
    },
  });

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const today = (matches ?? []).filter((m) => {
    const t = new Date(m.match_time).getTime();
    return m.status !== "completed" && t - now < dayMs && t - now > -2 * 60 * 60 * 1000;
  });
  const upcoming = (matches ?? []).filter((m) => {
    const t = new Date(m.match_time).getTime();
    return m.status !== "completed" && t - now >= dayMs;
  });

  return (
    <div className="space-y-6">
      <section className="glossy-card welcome-card p-5">
        <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--success)]">
          {greeting().toUpperCase()}, {profile?.employee_code || "GURU"}!
        </p>
        <p className="text-xl font-black mt-1 text-white/95">
          {profile?.name || "Welcome back"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {today.length > 0
            ? `${today.length} match${today.length > 1 ? "es" : ""} kicking off soon — lock in your predictions.`
            : "No matches today. Check upcoming fixtures below."}
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-sm font-bold uppercase tracking-wider">Today's Matches</h1>
          <span className="text-xs text-muted-foreground">{today.length} live windows</span>
        </div>
        {today.length === 0 ? (
          <div className="glossy-card p-6 text-center text-muted-foreground text-sm">
            No matches in the next 24 hours.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {today.map((m) => (
              <FeatureMatchCard key={m.id} match={m} onPredict={() => setSheet(m)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider mb-3">Upcoming Fixtures</h2>
        <ul className="space-y-2">
          {upcoming.map((m) => {
            const locked = new Date(m.match_time).getTime() <= now;
            return (
              <li
                key={m.id}
                onClick={() => !locked && setSheet(m)}
                className="glossy-card px-4 py-3 flex items-center justify-between cursor-pointer hover:translate-y-[-1px] transition"
              >
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <img
                      src={flagUrl(m.home_team)}
                      alt={`${m.home_team} flag`}
                      className="w-8 h-8 rounded-full object-cover ring-2 ring-[color:var(--card)]"
                      loading="lazy"
                    />
                    <img
                      src={flagUrl(m.away_team)}
                      alt={`${m.away_team} flag`}
                      className="w-8 h-8 rounded-full object-cover ring-2 ring-[color:var(--card)]"
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      {m.home_team} <span className="text-muted-foreground">vs</span> {m.away_team}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(m.match_time).toLocaleString(undefined, {
                        weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                {locked && <Lock size={16} className="text-[var(--destructive)]" />}
              </li>
            );
          })}
          {upcoming.length === 0 && (
            <li className="text-sm text-muted-foreground text-center py-4">No upcoming fixtures.</li>
          )}
        </ul>
      </section>

      <PredictionSheet match={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}