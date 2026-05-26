import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import PredictionSheet from "@/components/PredictionSheet";
import ResultBreakdown from "@/components/ResultBreakdown";
import type { Match } from "@/components/MatchCard";
import type { Prediction } from "@/lib/points";

export const Route = createFileRoute("/_app/predictions")({
  head: () => ({
    meta: [
      { title: "My Predictions — Goal Gurus" },
      { name: "description", content: "Review your upcoming, locked, and completed match predictions in the Goal Gurus league." },
      { property: "og:title", content: "My Predictions — Goal Gurus" },
      { property: "og:description", content: "Review your upcoming, locked, and completed match predictions in the Goal Gurus league." },
      { property: "og:url", content: "https://fifa2026rbl.lovable.app/predictions" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://fifa2026rbl.lovable.app/predictions" }],
  }),
  component: PredictionsPage,
});

type Tab = "upcoming" | "locked" | "completed";
type Row = { prediction: Prediction & { id: string; match_id: string }; match: Match };

function PredictionsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [editing, setEditing] = useState<Match | null>(null);
  const [showResult, setShowResult] = useState<Row | null>(null);

  const { data } = useQuery({
    queryKey: ["predictions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("id, match_id, winner, predicted_home_score, predicted_away_score, total_goals_bucket, points_earned, created_at, matches(*)")
        .eq("user_id", user!.employee_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        match_id: string;
        winner: Prediction["winner"];
        predicted_home_score: number | null;
        predicted_away_score: number | null;
        total_goals_bucket: Prediction["total_goals_bucket"];
        points_earned: number;
        created_at: string;
        matches: Match;
      }>;
    },
  });

  const rows: Row[] = useMemo(
    () =>
      (data ?? []).map((d) => ({
        match: d.matches,
        prediction: {
          id: d.id,
          match_id: d.match_id,
          winner: d.winner,
          predicted_home_score: d.predicted_home_score,
          predicted_away_score: d.predicted_away_score,
          total_goals_bucket: d.total_goals_bucket,
          created_at: d.created_at,
        },
      })),
    [data],
  );

  const now = Date.now();
  const filtered = rows.filter((r) => {
    const t = new Date(r.match.match_time).getTime();
    if (tab === "completed") return r.match.status === "completed";
    if (tab === "locked") return r.match.status !== "completed" && t <= now;
    return r.match.status !== "completed" && t > now;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">My Predictions</h1>

      <div className="glossy-card p-1 grid grid-cols-3 gap-1">
        {(["upcoming", "locked", "completed"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="py-2 rounded-xl text-xs uppercase tracking-wider font-semibold transition"
            style={
              tab === t
                ? { background: "var(--gradient-primary)", color: "#fff", boxShadow: "var(--shadow-glow-primary)" }
                : { color: "var(--muted-foreground)" }
            }
          >
            {t}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {filtered.length === 0 && (
          <li className="glossy-card p-6 text-center text-muted-foreground text-sm">
            No {tab} predictions yet.
          </li>
        )}
        {filtered.map((r) => (
          <li
            key={r.prediction.id}
            className="glossy-card p-4 flex items-center justify-between gap-3"
            onClick={() => r.match.status === "completed" && setShowResult(r)}
            role={r.match.status === "completed" ? "button" : undefined}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {r.match.home_team} <span className="text-muted-foreground">vs</span> {r.match.away_team}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Pick: {r.prediction.predicted_home_score} – {r.prediction.predicted_away_score} •{" "}
                {r.prediction.winner ?? "—"}
              </p>
            </div>
            {tab === "upcoming" && (
              <button
                className="text-xs font-bold px-3 py-1.5 rounded-full"
                style={{ background: "var(--gradient-primary)", color: "#fff" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(r.match);
                }}
              >
                Edit
              </button>
            )}
            {tab === "completed" && (
              <span
                className="text-xs font-black px-3 py-1.5 rounded-full"
                style={{ background: "var(--gradient-success)", color: "#fff" }}
              >
                +0 PTS
              </span>
            )}
          </li>
        ))}
      </ul>

      <PredictionSheet match={editing} onClose={() => setEditing(null)} />
      <ResultBreakdown
        open={!!showResult}
        onClose={() => setShowResult(null)}
        match={showResult?.match ?? null}
        prediction={showResult?.prediction ?? null}
      />
    </div>
  );
}