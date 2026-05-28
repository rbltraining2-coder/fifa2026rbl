import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Minus, Plus, X, Lock } from "lucide-react";
import type { Match } from "./MatchCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getPredictionWindow } from "@/lib/predictionWindow";
import { savePrediction } from "@/lib/predictions.functions";

type Winner = "home" | "draw" | "away";

export default function PredictionSheet({
  match,
  onClose,
}: {
  match: Match | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [winner, setWinner] = useState<Winner>("home");
  const [hg, setHg] = useState(1);
  const [ag, setAg] = useState(1);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<{
    winner: Winner | null;
    hg: number | null;
    ag: number | null;
  } | null>(null);

  // Load existing prediction (if any) when sheet opens.
  useEffect(() => {
    if (!match || !user) {
      setExisting(null);
      return;
    }
    supabase
      .from("predictions")
      .select("winner, predicted_home_score, predicted_away_score")
      .eq("match_id", match.id)
      .eq("user_id", user.employee_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setExisting(null);
          return;
        }
        if (data.winner) setWinner(data.winner as Winner);
        if (data.predicted_home_score != null) setHg(data.predicted_home_score);
        if (data.predicted_away_score != null) setAg(data.predicted_away_score);
        setExisting({
          winner: (data.winner as Winner) ?? null,
          hg: data.predicted_home_score,
          ag: data.predicted_away_score,
        });
      });
  }, [match, user]);

  const save = async () => {
    if (!match || !user) return;
    const w = getPredictionWindow(match.match_time);
    if (!w.canPredict) {
      toast.error(
        w.state === "locked"
          ? "Predictions are locked — kick-off is within 30 minutes."
          : "Prediction window opens 24 hours before kick-off.",
      );
      return;
    }
    setSaving(true);
    try {
      await savePrediction({
        data: {
          employeeId: user.employee_id,
          matchId: match.id,
          winner,
          homeScore: hg,
          awayScore: ag,
        },
      });
    } catch (e) {
      setSaving(false);
      toast.error(e instanceof Error ? e.message : "Save failed");
      return;
    }
    setSaving(false);
    toast.success("Prediction saved");
    qc.invalidateQueries({ queryKey: ["predictions"] });
    onClose();
  };

  const locked = match ? !getPredictionWindow(match.match_time).canPredict : false;

  return (
    <AnimatePresence>
      {match && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/70 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 inset-x-0 z-50"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
          >
            <div
              className="mx-auto max-w-2xl rounded-t-3xl p-5 pb-8 max-h-[92vh] overflow-y-auto"
              style={{ background: "linear-gradient(180deg,#3a3d3d,#2a2c2c)", boxShadow: "0 -20px 60px rgba(0,0,0,0.6)" }}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                    {locked ? "Your Prediction" : "Predict"}
                  </p>
                  <h2 className="text-xl font-bold">
                    {match.home_team} <span className="text-muted-foreground">vs</span> {match.away_team}
                  </h2>
                </div>
                <button onClick={onClose} aria-label="Close prediction sheet" className="p-2 rounded-full hover:bg-white/5">
                  <X size={18} />
                </button>
              </div>

              {locked && existing && (
                <div
                  className="rounded-2xl p-4 mb-2 flex items-center gap-3"
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(245,158,11,0.35)",
                  }}
                >
                  <Lock size={16} className="text-[#F59E0B] shrink-0" />
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Locked Pick</p>
                    <p className="text-base font-bold">
                      {existing.hg ?? 0} – {existing.ag ?? 0}{" "}
                      <span className="text-muted-foreground font-normal text-sm">
                        ({existing.winner === "draw"
                          ? "Draw"
                          : existing.winner === "home"
                            ? match.home_team
                            : existing.winner === "away"
                              ? match.away_team
                              : "—"})
                      </span>
                    </p>
                  </div>
                </div>
              )}

              {locked && !existing && (
                <div
                  className="rounded-2xl p-4 mb-2 text-center text-sm text-muted-foreground"
                  style={{ background: "rgba(0,0,0,0.3)" }}
                >
                  Predictions are locked — no pick was saved for this match.
                </div>
              )}

              {!locked && (
              <>
              <Step n={1} title="Match Winner">
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["home", match.home_team],
                      ["draw", "Draw"],
                      ["away", match.away_team],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setWinner(k as Winner)}
                      className="rounded-xl py-3 text-sm font-semibold transition"
                      style={
                        winner === k
                          ? {
                              background: "var(--gradient-primary)",
                              color: "#fff",
                              boxShadow: "var(--shadow-glow-primary)",
                            }
                          : { background: "rgba(0,0,0,0.3)", color: "#bfc2bf" }
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Step>

              <Step n={2} title="Exact Score">
                <div className="grid grid-cols-2 gap-3">
                  <Counter label={match.home_team} value={hg} onChange={setHg} />
                  <Counter label={match.away_team} value={ag} onChange={setAg} />
                </div>
              </Step>

              <button onClick={save} disabled={saving} className="btn-glossy w-full mt-6">
                {saving ? "Saving…" : "Save Prediction"}
              </button>
              </>
              )}

              {locked && (
                <button onClick={onClose} className="btn-glossy w-full mt-4">
                  Close
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: "var(--primary)", color: "#fff" }}
        >
          {n}
        </span>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Counter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div
      className="rounded-xl p-3 flex flex-col items-center gap-2"
      style={{ background: "rgba(0,0,0,0.3)" }}
    >
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`Decrease ${label} score`}
          className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"
        >
          <Minus size={16} />
        </button>
        <span className="text-3xl font-black tabular-nums w-10 text-center">{value}</span>
        <button
          onClick={() => onChange(Math.min(20, value + 1))}
          aria-label={`Increase ${label} score`}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "var(--gradient-success)", color: "#fff" }}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}