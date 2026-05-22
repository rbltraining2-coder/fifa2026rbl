const MAP: Record<string, string> = {
  brazil: "br", argentina: "ar", france: "fr", germany: "de",
  england: "gb-eng", italy: "it", spain: "es", portugal: "pt",
  netherlands: "nl", belgium: "be", croatia: "hr", uruguay: "uy",
  mexico: "mx", "united states": "us", usa: "us", japan: "jp",
  "south korea": "kr", korea: "kr", australia: "au", morocco: "ma",
  senegal: "sn", ghana: "gh", nigeria: "ng", cameroon: "cm",
  switzerland: "ch", denmark: "dk", sweden: "se", norway: "no",
  poland: "pl", serbia: "rs", wales: "gb-wls", scotland: "gb-sct",
  ecuador: "ec", colombia: "co", chile: "cl", peru: "pe",
  qatar: "qa", "saudi arabia": "sa", iran: "ir", canada: "ca",
  "costa rica": "cr", tunisia: "tn", turkey: "tr", austria: "at",
  ukraine: "ua", greece: "gr", ireland: "ie",
};

export function flagUrl(team: string): string {
  const key = team.trim().toLowerCase();
  const code = MAP[key] ?? "un";
  return `https://flagcdn.com/w160/${code}.png`;
}