import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { FeatureMatchCard, type Match } from "@/components/MatchCard";
import PredictionSheet from "@/components/PredictionSheet";
import { flagUrl } from "@/lib/flags";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setProgress(max > 0 ? (el.scrollLeft / max) * 100 : 0);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [scrollRef.current]);

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
        <h1 className="text-xl font-black mt-1 text-white/95">
          {profile?.name || "Welcome back"}
        </h1>
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
          <>
            <div
              ref={scrollRef}
              className="-mx-4 px-4 overflow-x-auto flex gap-4 snap-x snap-mandatory pb-2 scrollbar-none"
            >
              {today.map((m) => (
                <div key={m.id} className="snap-start">
                  <FeatureMatchCard match={m} onPredict={() => setSheet(m)} />
                </div>
              ))}
            </div>
            <div className="carousel-progress mt-3">
              <span style={{ width: `${Math.max(15, progress)}%` }} />
            </div>
          </>
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