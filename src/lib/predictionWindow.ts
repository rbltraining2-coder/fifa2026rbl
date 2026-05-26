// Centralised match prediction window rules.
//   * Opens 24 hours before kick-off.
//   * Hard-locks 30 minutes before kick-off.

export type WindowState = "early" | "open" | "locked";

export type WindowInfo = {
  state: WindowState;
  canPredict: boolean;
  label: string;
};

const DAY = 24 * 60 * 60 * 1000;
const LOCK_OFFSET = 30 * 60 * 1000;

export function getPredictionWindow(matchTime: string | Date, now: number = Date.now()): WindowInfo {
  const t = typeof matchTime === "string" ? new Date(matchTime).getTime() : matchTime.getTime();
  const diff = t - now;
  if (diff > DAY) {
    return {
      state: "early",
      canPredict: false,
      label: "Prediction window opens 24 hours before kick-off.",
    };
  }
  if (diff <= LOCK_OFFSET) {
    return { state: "locked", canPredict: false, label: "Locked" };
  }
  return { state: "open", canPredict: true, label: "Predict Now" };
}