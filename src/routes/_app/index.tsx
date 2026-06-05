import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { FeatureMatchCard, MatchCardSkeleton, type Match } from "@/components/MatchCard";
import PredictionSheet from "@/components/PredictionSheet";
import TeamFlag from "@/components/TeamFlag";
import { Lock, CalendarDays, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { getPredictionWindow } from "@/lib/predictionWindow";
import { formatIstDateTime, IST_LABEL } from "@/lib/ist";
import promoBanner from "@/assets/home-banner.png";

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
  const { profile, user } = useAuth();
  const [sheet, setSheet] = useState<Match | null>(null);

  const { data: matches, isLoading } = useQuery({
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

  const { data: predictedIds } = useQuery({
    queryKey: ["predictions", "ids", user?.employee_id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("match_id")
        .eq("user_id", user!.employee_id);
      if (error) throw error;
      return new Set((data ?? []).map((p) => p.match_id as string));
    },
  });
  const predicted = predictedIds ?? new Set<string>();

  const now = Date.now();
  const fourHoursMs = 4 * 60 * 60 * 1000;

  const futureMatches = (matches ?? [])
    .filter((m) => m.status !== "completed" && new Date(m.match_time).getTime() > now)
    .sort((a, b) => new Date(a.match_time).getTime() - new Date(b.match_time).getTime());

  const today = futureMatches.filter((m) => {
    const t = new Date(m.match_time).getTime();
    return t - now < fourHoursMs;
  });

  const todayIds = new Set(today.map((m) => m.id));
  const upcomingAll = futureMatches.filter((m) => !todayIds.has(m.id));
  // Featured = next upcoming fixture when there's nothing live in the next 4h.
  const featured = today.length === 0 ? upcomingAll[0] ?? null : null;
  const upcoming = featured ? upcomingAll.slice(1) : upcomingAll;

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Match Predictions</h1>
      <AnnouncementCarousel />
      <section
        aria-label="Goal Gurus FIFA 2026 promo"
        className="w-full rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 20px 50px -20px rgba(45,18,77,0.7)" }}
      >
        <img
          src={promoBanner}
          alt="Make your predictions before time runs out — Goal Gurus FIFA 2026"
          className="w-full h-auto block"
          loading="eager"
        />
      </section>
      <section className="glossy-card welcome-card p-5">
        <p className="text-xs sm:text-sm uppercase tracking-[0.16em] font-extrabold">
          <span className="text-white/70">{greeting().toUpperCase()}, </span>
          <span className="greeting-name">{(profile?.name || "Guru").toUpperCase()}!</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {today.length > 0
            ? `${today.length} match${today.length > 1 ? "es" : ""} kicking off soon — lock in your predictions.`
            : "No matches today. Check upcoming fixtures below."}
        </p>
      </section>

      {isLoading ? (
        <section className="flex flex-col gap-4">
          <MatchCardSkeleton />
          <MatchCardSkeleton />
        </section>
      ) : (
        <>
          {today.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--destructive)] animate-pulse" />
                  Today's Matches
                </h2>
                <span className="text-xs text-muted-foreground">{today.length} live window{today.length > 1 ? "s" : ""}</span>
              </div>
              <div className="flex flex-col gap-4">
                {today.map((m) => (
                  <FeatureMatchCard
                    key={m.id}
                    match={m}
                    alreadyPredicted={predicted.has(m.id)}
                    onPredict={() => setSheet(m)}
                  />
                ))}
              </div>
            </section>
          )}

          {featured && (
            <section className="animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                  <Sparkles size={14} className="text-[color:var(--primary-glow)]" />
                  Next Up
                </h2>
                <span className="text-xs text-muted-foreground">{formatIstDateTime(featured.match_time)} {IST_LABEL}</span>
              </div>
              <FeatureMatchCard
                match={featured}
                featured
                alreadyPredicted={predicted.has(featured.id)}
                onPredict={() => setSheet(featured)}
              />
            </section>
          )}

          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
              <CalendarDays size={14} className="text-muted-foreground" />
              Upcoming Fixtures
            </h2>
            <ul className="space-y-2">
          {upcoming.map((m) => {
            const w = getPredictionWindow(m.match_time, now);
            const isPredicted = predicted.has(m.id);
            return (
              <li
                key={m.id}
                onClick={() => w.canPredict && !isPredicted && setSheet(m)}
                className="glossy-card px-4 py-3 flex items-center justify-between cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(46,125,70,0.45)]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <TeamFlag team={m.home_team} size={32} className="ring-2 ring-[color:var(--card)]" />
                    <TeamFlag team={m.away_team} size={32} className="ring-2 ring-[color:var(--card)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      {m.home_team} <span className="text-muted-foreground">vs</span> {m.away_team}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatIstDateTime(m.match_time)} <span className="opacity-70">{IST_LABEL}</span>
                    </p>
                  </div>
                </div>
                {w.state === "locked" && <Lock size={16} className="text-[var(--destructive)]" />}
                {w.state === "early" && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Opens 24h before
                  </span>
                )}
                {isPredicted && w.state === "open" && (
                  <span className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--success)]">
                    Submitted
                  </span>
                )}
              </li>
            );
          })}
              {upcoming.length === 0 && !featured && today.length === 0 && (
                <li className="glossy-card p-8 text-center">
                  <CalendarDays size={28} className="mx-auto text-muted-foreground/60 mb-2" />
                  <p className="text-sm font-semibold">No fixtures scheduled yet</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Check back soon — the tournament hasn't started.</p>
                </li>
              )}
              {upcoming.length === 0 && (featured || today.length > 0) && (
                <li className="text-xs text-muted-foreground text-center py-3">No further fixtures yet.</li>
              )}
            </ul>
          </section>
        </>
      )}

      <PredictionSheet match={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}
type Announcement = {
  id: string; title: string; description: string | null; image_url: string | null;
  start_date: string | null; end_date: string | null; active: boolean; sort_order: number;
};

function AnnouncementCarousel() {
  const { data } = useQuery({
    queryKey: ["announcements-active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("announcements")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const now = Date.now();
      return ((data ?? []) as Announcement[]).filter(a =>
        (!a.start_date || Date.parse(a.start_date) <= now) &&
        (!a.end_date || Date.parse(a.end_date) >= now)
      );
    },
  });
  const items = data ?? [];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setI(x => (x + 1) % items.length), 2000);
    return () => clearInterval(t);
  }, [items.length]);
  useEffect(() => { if (i >= items.length) setI(0); }, [items.length, i]);

  if (items.length === 0) return null;
  const cur = items[i] ?? items[0];
  const prev = () => setI((i - 1 + items.length) % items.length);
  const next = () => setI((i + 1) % items.length);

  return (
    <section aria-label="Announcements" className="relative w-full rounded-2xl overflow-hidden glossy-card">
      <div className="relative aspect-[16/7] sm:aspect-[16/6] bg-black/40">
        {cur.image_url && <img src={cur.image_url} alt={cur.title} className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <p className="text-sm sm:text-lg font-black text-white drop-shadow">{cur.title}</p>
          {cur.description && <p className="text-[11px] sm:text-xs text-white/85 mt-1 line-clamp-2">{cur.description}</p>}
        </div>
        {items.length > 1 && (
          <>
            <button onClick={prev} aria-label="Previous" className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70">
              <ChevronLeft size={16} />
            </button>
            <button onClick={next} aria-label="Next" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70">
              <ChevronRight size={16} />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {items.map((_, idx) => (
                <button key={idx} onClick={() => setI(idx)} aria-label={`Go to slide ${idx + 1}`}
                  className={`h-1.5 rounded-full transition-all ${idx === i ? "w-5 bg-white" : "w-1.5 bg-white/40"}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
