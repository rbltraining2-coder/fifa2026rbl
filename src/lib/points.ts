/**
 * Scoring rules for predictions:
 *  - Winner correct: 5 pts
 *  - Exact score: +10 pts (total 15 when both)
 *  - Total-goals bucket correct: +3 pts
 *  - Early-prediction bonus (saved >24h before kickoff): +2 pts
 */
export type Prediction = {
  winner: "home" | "draw" | "away" | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  total_goals_bucket: "under_2_5" | "between_2_3" | "over_3_5" | null;
  created_at: string;
};

export type MatchResult = {
  match_time: string;
  home_score: number;
  away_score: number;
};

export function bucketFor(total: number): Prediction["total_goals_bucket"] {
  if (total < 2.5) return "under_2_5";
  if (total > 3.5) return "over_3_5";
  return "between_2_3";
}

export function computeBreakdown(p: Prediction, m: MatchResult) {
  const items: { label: string; points: number }[] = [];
  const actualWinner =
    m.home_score > m.away_score ? "home" : m.home_score < m.away_score ? "away" : "draw";

  if (p.winner && p.winner === actualWinner) {
    items.push({ label: "Match winner", points: 5 });
  }
  if (
    p.predicted_home_score === m.home_score &&
    p.predicted_away_score === m.away_score
  ) {
    items.push({ label: "Exact score", points: 10 });
  }
  const actualBucket = bucketFor(m.home_score + m.away_score);
  if (p.total_goals_bucket && p.total_goals_bucket === actualBucket) {
    items.push({ label: "Total goals range", points: 3 });
  }
  const created = new Date(p.created_at).getTime();
  const kickoff = new Date(m.match_time).getTime();
  if (kickoff - created > 24 * 60 * 60 * 1000) {
    items.push({ label: "Early prediction bonus", points: 2 });
  }
  const total = items.reduce((s, i) => s + i.points, 0);
  return { items, total };
}