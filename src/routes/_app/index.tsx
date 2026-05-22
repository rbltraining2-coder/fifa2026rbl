import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { FeatureMatchCard, type Match } from "@/components/MatchCard";
import PredictionSheet from "@/components/PredictionSheet";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Home — Goal Gurus" }] }),
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
      <section className="glossy-card p-5">
        <div className="accent-strip" />
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{greeting()},</p>
        <h1 className="text-2xl font-black mt-1">{profile?.name || profile?.employee_code || "Guru"}!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {today.length > 0
            ? `${today.length} match${today.length > 1 ? "es" : ""} kicking off soon — lock in your predictions.`
            : "No matches today. Check upcoming fixtures below."}
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider">Today's Matches</h2>
          <span className="text-xs text-muted-foreground">{today.length} live windows</span>
        </div>
        {today.length === 0 ? (
          <div className="glossy-card p-6 text-center text-muted-foreground text-sm">
            No matches in the next 24 hours.
          </div>
        ) : (
          <div className="-mx-4 px-4 overflow-x-auto flex gap-4 snap-x snap-mandatory pb-2">
            {today.map((m) => (
              <div key={m.id} className="snap-start">
                <FeatureMatchCard match={m} onPredict={() => setSheet(m)} />
              </div>
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
                  <span className="text-2xl">{m.home_flag ?? "⚽"}</span>
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