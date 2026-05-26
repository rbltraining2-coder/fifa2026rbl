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

// Extra FIFA 2026 and common qualifier teams.
Object.assign(MAP, {
  "north korea": "kp", "dpr korea": "kp",
  "new zealand": "nz", panama: "pa", haiti: "ht",
  "trinidad and tobago": "tt", jamaica: "jm",
  honduras: "hn", "el salvador": "sv", guatemala: "gt",
  bolivia: "bo", paraguay: "py", venezuela: "ve",
  uae: "ae", "united arab emirates": "ae", iraq: "iq",
  jordan: "jo", lebanon: "lb", oman: "om", bahrain: "bh", kuwait: "kw",
  uzbekistan: "uz", "ivory coast": "ci", "cote d'ivoire": "ci",
  algeria: "dz", egypt: "eg", "south africa": "za",
  "burkina faso": "bf", mali: "ml", "cape verde": "cv",
  "czech republic": "cz", czechia: "cz", romania: "ro",
  slovakia: "sk", slovenia: "si", hungary: "hu",
  finland: "fi", iceland: "is", russia: "ru",
  "northern ireland": "gb-nir", albania: "al",
  thailand: "th", vietnam: "vn", indonesia: "id",
  "china pr": "cn", china: "cn", india: "in",
});

export function flagUrl(team: string): string {
  const key = team.trim().toLowerCase();
  const code = MAP[key];
  if (!code) return FALLBACK_FLAG;
  return `https://flagcdn.com/w160/${code}.png`;
}

// Neutral transparent placeholder used when a country isn't mapped or the
// CDN image fails to load.
export const FALLBACK_FLAG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
      <defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
        <stop offset='0' stop-color='%233CAC3B'/>
        <stop offset='1' stop-color='%231f6a1e'/>
      </linearGradient></defs>
      <rect width='64' height='64' fill='url(%23g)'/>
      <text x='50%' y='54%' text-anchor='middle' font-family='system-ui' font-size='28' font-weight='800' fill='white'>?</text>
    </svg>`,
  );