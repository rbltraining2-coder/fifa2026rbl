import { useEffect, useState } from "react";

export default function Countdown({ to }: { to: string | Date }) {
  const target = typeof to === "string" ? new Date(to).getTime() : to.getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = target - now;
  if (ms <= 0) return <span className="countdown-pill" style={{ background: "rgba(60,172,59,0.15)", borderColor: "rgba(60,172,59,0.45)", color: "#9ce69b" }}>LIVE</span>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const label = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  return <span className="countdown-pill">⏱ {label}</span>;
}