import Countdown from "./Countdown";
import TeamFlag from "./TeamFlag";
import { getPredictionWindow } from "@/lib/predictionWindow";
import { formatIstShort, IST_LABEL } from "@/lib/ist";

export type Match = {
  id: string;
  home_team: string;
  away_team: string;
  home_flag: string | null;
  away_flag: string | null;
  match_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
};

export function FeatureMatchCard({
  match,
  onPredict,
  alreadyPredicted = false,
}: {
  match: Match;
  onPredict: () => void;
  alreadyPredicted?: boolean;
}) {
  const w = getPredictionWindow(match.match_time);
  const matchTimeStr = formatIstShort(match.match_time);
  return (
    <div className="glossy-card w-full p-5 tilt-card">
      <div className="accent-strip" />
      <div className="flex justify-end mb-2">
        <Countdown to={match.match_time} />
      </div>
      <div className="text-center mb-1">
        <span className="text-xs font-bold" style={{ color: "#D1D4D1", letterSpacing: "0.12em" }}>
          {matchTimeStr} <span className="opacity-70">{IST_LABEL}</span>
        </span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <TeamBadge name={match.home_team} />
        <span className="text-2xl font-black text-muted-foreground">VS</span>
        <TeamBadge name={match.away_team} />
      </div>
      <button
        onClick={onPredict}
        disabled={!w.canPredict || alreadyPredicted}
        className="btn-glossy w-full mt-4"
        style={!w.canPredict || alreadyPredicted ? { filter: "grayscale(0.4)", opacity: 0.7 } : undefined}
      >
        {alreadyPredicted
          ? "Prediction Submitted"
          : w.state === "locked"
          ? "Locked"
          : w.state === "early"
          ? "Opens 24h before"
          : "Predict Now"}
      </button>
      {alreadyPredicted && (
        <p className="mt-2 text-[11px] text-center text-muted-foreground">
          Edit in <span className="font-semibold text-white">My Predictions</span> tab.
        </p>
      )}
      {w.state === "early" && (
        <p className="mt-2 text-[11px] text-center text-muted-foreground">
          {w.label}
        </p>
      )}
    </div>
  );
}

function TeamBadge({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-2 w-[88px]">
      <div
        className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
        style={{
          background: "rgba(0,0,0,0.35)",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.15), 0 6px 18px -8px rgba(0,0,0,0.7)",
        }}
      >
        <TeamFlag team={name} size={56} />
      </div>
      <span className="text-xs font-semibold text-center leading-tight">{name}</span>
    </div>
  );
}