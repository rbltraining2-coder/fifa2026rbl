import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { computeBreakdown, type Prediction, type MatchResult } from "@/lib/points";
import type { Match } from "./MatchCard";

export default function ResultBreakdown({
  open,
  onClose,
  match,
  prediction,
}: {
  open: boolean;
  onClose: () => void;
  match: Match | null;
  prediction: Prediction | null;
}) {
  if (!match || !prediction) return null;
  const result: MatchResult = {
    match_time: match.match_time,
    home_score: match.home_score ?? 0,
    away_score: match.away_score ?? 0,
  };
  const { items, total } = computeBreakdown(prediction, result);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/75 z-50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
          >
            <div className="glossy-card max-w-sm w-full p-6 relative">
              <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10">
                <X size={16} />
              </button>
              <p className="text-xs uppercase tracking-widest text-muted-foreground text-center">Final Result</p>
              <div className="mt-2 text-center">
                <p className="text-sm text-muted-foreground">{match.home_team} vs {match.away_team}</p>
                <p className="text-4xl font-black mt-1">
                  {match.home_score} <span className="text-muted-foreground">–</span> {match.away_score}
                </p>
                <p className="text-xs mt-1 text-muted-foreground">
                  Your pick: {prediction.predicted_home_score} – {prediction.predicted_away_score}
                </p>
              </div>

              <div
                className="mt-5 rounded-2xl p-4 text-center"
                style={{ background: "var(--gradient-success)", boxShadow: "var(--shadow-glow-success)" }}
              >
                <p className="text-xs uppercase tracking-widest text-white/80">🎉 Congratulations</p>
                <p className="text-3xl font-black text-white mt-1">+{total} Points</p>
              </div>

              <ul className="mt-5 space-y-2">
                {items.length === 0 && (
                  <li className="text-sm text-muted-foreground text-center">No points earned this time.</li>
                )}
                {items.map((i) => (
                  <li
                    key={i.label}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                    style={{ background: "rgba(0,0,0,0.3)" }}
                  >
                    <span>{i.label}</span>
                    <span className="font-bold" style={{ color: "var(--success)" }}>+{i.points} PTS</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}