import Countdown from "./Countdown";
import { flagUrl } from "@/lib/flags";

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
}: {
  match: Match;
  onPredict: () => void;
}) {
  const locked = new Date(match.match_time).getTime() <= Date.now();
  return (
    <div className="glossy-card w-full p-5 tilt-card">
      <div className="accent-strip" />
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {new Date(match.match_time).toLocaleString(undefined, {
            weekday: "short", hour: "2-digit", minute: "2-digit",
          })}
        </span>
        <Countdown to={match.match_time} />
      </div>
      <div className="flex items-center justify-between">
        <TeamBadge name={match.home_team} />
        <span className="text-2xl font-black text-muted-foreground">VS</span>
        <TeamBadge name={match.away_team} />
      </div>
      <button
        onClick={onPredict}
        disabled={locked}
        className="btn-glossy w-full mt-5"
        style={locked ? { filter: "grayscale(1)", opacity: 0.6 } : undefined}
      >
        {locked ? "Locked" : "Predict Now"}
      </button>
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
        <img
          src={flagUrl(name)}
          alt={`${name} flag`}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </div>
      <span className="text-xs font-semibold text-center leading-tight">{name}</span>
    </div>
  );
}