import Countdown from "./Countdown";
import TeamFlag from "./TeamFlag";
import { getPredictionWindow } from "@/lib/predictionWindow";
import { formatIstShort, IST_LABEL } from "@/lib/ist";
import featuredStadium from "@/assets/featured-stadium.jpg";

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
  featured = false,
}: {
  match: Match;
  onPredict: () => void;
  alreadyPredicted?: boolean;
  featured?: boolean;
}) {
  const w = getPredictionWindow(match.match_time);
  const matchTimeStr = formatIstShort(match.match_time);
  const isLive = match.status === "live" || match.status === "halftime";
  const isCompleted = match.status === "completed";
  const showScore = (isLive || isCompleted) && match.home_score != null && match.away_score != null;
  return (
    <div
      className={`glossy-card w-full p-5 tilt-card transition-transform duration-200 hover:-translate-y-0.5 ${featured ? "featured-match" : ""}`}
      style={featured ? ({ ["--featured-bg" as string]: `url(${featuredStadium})` } as React.CSSProperties) : undefined}
    >
      <div className="accent-strip" />
      <div className="flex items-center justify-between mb-2 gap-2">
        {featured ? (
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--primary-glow)]">
            ★ Featured Fixture
          </span>
        ) : <span />}
        <div className="flex items-center gap-2">
          {isLive && <span className="live-pill">{match.status === "halftime" ? "HT" : "LIVE"}</span>}
          {!isLive && !isCompleted && <Countdown to={match.match_time} />}
        </div>
      </div>
      <div className="text-center mb-1">
        <span className="text-xs font-bold" style={{ color: "#D1D4D1", letterSpacing: "0.12em" }}>
          {matchTimeStr} <span className="opacity-70">{IST_LABEL}</span>
        </span>
      </div>
      <div className="flex items-center justify-between mt-3 gap-2">
        <TeamBadge name={match.home_team} featured={featured} />
        {showScore ? (
          <div className="flex items-center gap-2 px-2">
            <span className={`score-display ${isLive ? "live" : ""}`}>{match.home_score}</span>
            <span className="text-base font-bold text-muted-foreground">—</span>
            <span className={`score-display ${isLive ? "live" : ""}`}>{match.away_score}</span>
          </div>
        ) : (
          <span className={`${featured ? "text-3xl vs-mark" : "text-2xl"} font-black ${featured ? "" : "text-muted-foreground"} tracking-tight`}>VS</span>
        )}
        <TeamBadge name={match.away_team} featured={featured} />
      </div>
      {isCompleted && (
        <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Full Time</p>
      )}
      <button
        onClick={onPredict}
        disabled={!w.canPredict || alreadyPredicted || isLive || isCompleted}
        className="btn-glossy w-full mt-4"
        style={(!w.canPredict || alreadyPredicted || isLive || isCompleted) ? { filter: "grayscale(0.4)", opacity: 0.7 } : undefined}
      >
        {isCompleted
          ? "Full Time"
          : isLive
          ? "Match In Progress"
          : alreadyPredicted
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

function TeamBadge({ name, featured = false }: { name: string; featured?: boolean }) {
  const size = featured ? 64 : 56;
  const ringSize = featured ? "w-16 h-16" : "w-14 h-14";
  return (
    <div className={`flex flex-col items-center gap-2 ${featured ? "w-[108px]" : "w-[96px]"}`}>
      <div
        className={`team-ring ${ringSize} rounded-full overflow-hidden flex items-center justify-center transition-transform duration-300 hover:scale-105`}
        style={{
          background: "rgba(0,0,0,0.35)",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.18), 0 8px 24px -8px rgba(0,0,0,0.75), 0 0 22px -8px rgba(46,125,70,0.45)",
        }}
      >
        <TeamFlag team={name} size={size} />
      </div>
      <span className={`${featured ? "text-sm" : "text-[13px]"} font-bold text-center leading-tight tracking-tight`}>{name}</span>
    </div>
  );
}

export function MatchCardSkeleton() {
  return (
    <div className="glossy-card w-full p-5">
      <div className="accent-strip" />
      <div className="flex justify-end mb-2">
        <div className="skeleton h-5 w-20" />
      </div>
      <div className="flex justify-center mb-3">
        <div className="skeleton h-3 w-32" />
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="flex flex-col items-center gap-2 w-[96px]">
          <div className="skeleton w-14 h-14 rounded-full" />
          <div className="skeleton h-3 w-16" />
        </div>
        <div className="skeleton h-8 w-10" />
        <div className="flex flex-col items-center gap-2 w-[96px]">
          <div className="skeleton w-14 h-14 rounded-full" />
          <div className="skeleton h-3 w-16" />
        </div>
      </div>
      <div className="skeleton h-11 w-full mt-4 rounded-full" />
    </div>
  );
}