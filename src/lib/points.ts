/**
 * Scoring rules for predictions (mirrors server-side computePoints):
 *   - Exact score correct → 3 points
 *   - Correct winner / draw (not exact) → 1 point
 *   - Otherwise → 0 points
 */
export type Prediction = {
  winner: "home" | "draw" | "away" | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  created_at: string;
};

export type MatchResult = {
  match_time: string;
  home_score: number;
  away_score: number;
};

export type BreakdownOutcome = "exact" | "winner" | "miss";

export function computeBreakdown(p: Prediction, m: MatchResult) {
  const actualWinner =
    m.home_score > m.away_score ? "home" : m.home_score < m.away_score ? "away" : "draw";
  const exact =
    p.predicted_home_score === m.home_score &&
    p.predicted_away_score === m.away_score;
  const winnerCorrect = !!p.winner && p.winner === actualWinner;

  let outcome: BreakdownOutcome = "miss";
  let total = 0;
  let headline = "No points earned";
  let detail = "Better luck next match.";

  if (exact) {
    outcome = "exact";
    total = 3;
    headline = "You earned 3 points";
    detail = "Exact score predicted correctly";
  } else if (winnerCorrect) {
    outcome = "winner";
    total = 1;
    headline = "You earned 1 point";
    detail = actualWinner === "draw" ? "Correct draw prediction" : "Correct winner prediction";
  }

  return { outcome, total, headline, detail, actualWinner, winnerCorrect, exact };
}