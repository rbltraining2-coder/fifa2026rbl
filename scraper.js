#!/usr/bin/env node
/**
 * scraper.js — Automated FIFA 2026 score sync.
 *
 * Fetches live match data from a public football data source and POSTs the
 * normalized results to the RBL FIFA 2026 League sync endpoint.
 *
 * Required environment variables:
 *   - SYNC_ENDPOINT     Full URL to /api/public/sync-external-scores
 *   - SCORE_SYNC_SECRET Bearer token configured on the server
 *
 * Optional:
 *   - DATA_SOURCE_URL   Override the upstream data feed
 *
 * Default upstream: TheSportsDB public FIFA World Cup events feed.
 * Replace DATA_SOURCE_URL with any feed that returns the same shape
 * (or adapt the `extract` function below).
 */

const DEFAULT_SOURCE =
  "https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4429&s=2026";

async function main() {
  const endpoint = process.env.SYNC_ENDPOINT;
  const secret = process.env.SCORE_SYNC_SECRET;
  const source = process.env.DATA_SOURCE_URL || DEFAULT_SOURCE;

  if (!endpoint || !secret) {
    console.error("Missing SYNC_ENDPOINT or SCORE_SYNC_SECRET");
    process.exit(1);
  }

  console.log(`Fetching scores from ${source}`);
  const res = await fetch(source);
  if (!res.ok) {
    console.error(`Upstream feed responded ${res.status}`);
    process.exit(1);
  }
  const json = await res.json();
  const results = extract(json);
  console.log(`Extracted ${results.length} match rows`);

  if (results.length === 0) {
    console.log("Nothing to sync.");
    return;
  }

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ results }),
  });
  const text = await resp.text();
  console.log(`Sync response ${resp.status}: ${text}`);
  if (!resp.ok) process.exit(1);
}

/**
 * Normalize the upstream payload into `{ home_team, away_team, home_score,
 * away_score, is_completed }`. Adapt this if you swap the data source.
 */
function extract(json) {
  const events = json?.events ?? json?.matches ?? [];
  const out = [];
  for (const ev of events) {
    const home = ev.strHomeTeam ?? ev.home_team ?? ev.home;
    const away = ev.strAwayTeam ?? ev.away_team ?? ev.away;
    const homeScore = parseScore(ev.intHomeScore ?? ev.home_score);
    const awayScore = parseScore(ev.intAwayScore ?? ev.away_score);
    const status = String(ev.strStatus ?? ev.status ?? "").toLowerCase();
    const isCompleted =
      homeScore !== null &&
      awayScore !== null &&
      (status.includes("ft") || status.includes("final") || status.includes("complete") || ev.intHomeScore != null);
    if (!home || !away || homeScore === null || awayScore === null) continue;
    out.push({
      home_team: String(home),
      away_team: String(away),
      home_score: homeScore,
      away_score: awayScore,
      is_completed: Boolean(isCompleted),
    });
  }
  return out;
}

function parseScore(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});