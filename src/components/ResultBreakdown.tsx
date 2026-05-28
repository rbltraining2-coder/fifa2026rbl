import { motion, AnimatePresence } from "motion/react";
import { X, Check, XCircle, Trophy } from "lucide-react";
import { computeBreakdown, type Prediction, type MatchResult } from "@/lib/points";
import type { Match } from "./MatchCard";
import TeamFlag from "./TeamFlag";

export default function ResultBreakdown({
  open,
  onClose,
  match,
  prediction,
  pointsEarned,
}: {
  open: boolean;
  onClose: () => void;
  match: Match | null;
  prediction: Prediction | null;
  pointsEarned?: number | null;
}) {
  if (!match || !prediction) return null;
  const result: MatchResult = {
    match_time: match.match_time,
    home_score: match.home_score ?? 0,
    away_score: match.away_score ?? 0,
  };
  const breakdown = computeBreakdown(prediction, result);
  // Prefer the persisted server value if provided (authoritative).
  const total = pointsEarned ?? breakdown.total;
  const earnedPositive = total > 0;

  const accent =
    breakdown.outcome === "exact"
      ? "var(--gradient-success)"
      : breakdown.outcome === "winner"
        ? "linear-gradient(135deg,#3b82f6,#6366f1)"
        : "linear-gradient(135deg,#3a3d3d,#262828)";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/75 z-50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
          >
            <div
              className="glossy-card max-w-md w-full p-5 sm:p-6 relative overflow-hidden"
              role="dialog"
              aria-label="Prediction result"
            >
              <button
                onClick={onClose}
                aria-label="Close result"
                className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 z-10"
              >
                <X size={16} />
              </button>

              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground text-center">
                Match Result
              </p>

              {/* Final score with flags */}
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                  <TeamFlag team={match.home_team} size={40} />
                  <span className="text-xs font-semibold truncate max-w-full">{match.home_team}</span>
                </div>
                <div className="text-center px-2">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Final</p>
                  <p className="score-display text-4xl sm:text-5xl font-black leading-none tabular-nums">
                    {match.home_score ?? 0}
                    <span className="text-muted-foreground mx-1">–</span>
                    {match.away_score ?? 0}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                  <TeamFlag team={match.away_team} size={40} />
                  <span className="text-xs font-semibold truncate max-w-full">{match.away_team}</span>
                </div>
              </div>

              {/* Points headline */}
              <div
                className="mt-5 rounded-2xl p-4 text-center"
                style={{
                  background: accent,
                  boxShadow: earnedPositive ? "var(--shadow-glow-success)" : "none",
                }}
              >
                <div className="flex items-center justify-center gap-2 text-white/90">
                  {earnedPositive ? <Trophy size={14} /> : <XCircle size={14} />}
                  <p className="text-[10px] uppercase tracking-widest font-bold">
                    {earnedPositive ? "Points Earned" : "No Points"}
                  </p>
                </div>
                <p className="text-3xl font-black text-white mt-1">
                  {earnedPositive ? `+${total}` : "0"}
                </p>
                <p className="text-xs text-white/90 mt-1">{breakdown.detail}</p>
              </div>

              {/* Your prediction vs actual */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <SummaryTile
                  label="Your Pick"
                  value={`${prediction.predicted_home_score ?? 0} – ${prediction.predicted_away_score ?? 0}`}
                  sub={prediction.winner ? winnerLabel(prediction.winner, match) : "—"}
                />
                <SummaryTile
                  label="Actual"
                  value={`${match.home_score ?? 0} – ${match.away_score ?? 0}`}
                  sub={winnerLabel(breakdown.actualWinner as "home" | "draw" | "away", match)}
                />
              </div>

              {/* Accuracy checklist */}
              <ul className="mt-4 space-y-2">
                <AccuracyRow
                  ok={breakdown.exact}
                  label="Exact score"
                  points={breakdown.exact ? 3 : 0}
                />
                <AccuracyRow
                  ok={breakdown.winnerCorrect}
                  label="Match winner"
                  points={breakdown.exact ? 0 : breakdown.winnerCorrect ? 1 : 0}
                  dimmed={breakdown.exact}
                  note={breakdown.exact ? "Included in exact score" : undefined}
                />
              </ul>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function winnerLabel(w: "home" | "draw" | "away", match: Match) {
  if (w === "draw") return "Draw";
  return w === "home" ? match.home_team : match.away_team;
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      className="rounded-xl p-3 text-center"
      style={{ background: "rgba(0,0,0,0.3)" }}
    >
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-black mt-0.5 tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>
    </div>
  );
}

function AccuracyRow({
  ok,
  label,
  points,
  dimmed,
  note,
}: {
  ok: boolean;
  label: string;
  points: number;
  dimmed?: boolean;
  note?: string;
}) {
  return (
    <li
      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
      style={{ background: "rgba(0,0,0,0.3)", opacity: dimmed ? 0.6 : 1 }}
    >
      <span className="flex items-center gap-2">
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: ok ? "var(--gradient-success)" : "rgba(255,255,255,0.08)",
            color: "#fff",
          }}
        >
          {ok ? <Check size={12} /> : <X size={12} />}
        </span>
        <span>
          {label}
          {note && <span className="text-[10px] text-muted-foreground ml-2">{note}</span>}
        </span>
      </span>
      <span
        className="font-bold text-xs"
        style={{ color: points > 0 ? "var(--success)" : "var(--muted-foreground)" }}
      >
        {points > 0 ? `+${points} PTS` : "0 PTS"}
      </span>
    </li>
  );
}