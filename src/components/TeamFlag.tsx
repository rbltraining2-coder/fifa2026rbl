import { useState } from "react";
import { flagCode } from "@/lib/flags";

/**
 * Renders a circular country flag from flagcdn.com. If the team can't be
 * mapped to an ISO code (or the image fails to load), gracefully falls back
 * to a clean coloured circle showing the team's initial letter.
 */
export default function TeamFlag({
  team,
  size = 32,
  className = "",
}: {
  team: string;
  size?: number;
  className?: string;
}) {
  const code = flagCode(team);
  const [broken, setBroken] = useState(false);
  const dim = { width: size, height: size };

  if (!code || broken) {
    const initial = (team.trim()[0] ?? "?").toUpperCase();
    return (
      <div
        aria-label={`${team} flag`}
        className={`rounded-full flex items-center justify-center font-black ${className}`}
        style={{
          ...dim,
          background: "linear-gradient(135deg,#25354E 0%,#161F30 100%)",
          color: "#C1EA3A",
          fontSize: Math.round(size * 0.42),
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
        }}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w80/${code}.png`}
      alt={`${team} flag`}
      loading="lazy"
      onError={() => setBroken(true)}
      className={`rounded-full object-cover ${className}`}
      style={dim}
    />
  );
}