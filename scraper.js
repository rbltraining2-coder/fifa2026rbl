#!/usr/bin/env node
/**
 * scraper.js — Automated FIFA 2026 fixture & score sync.
 *
 * Fetches all fixtures (scheduled + live + completed) from TheSportsDB and
 * POSTs the normalized payload to /api/public/sync-external-scores. The
 * server endpoint deduplicates by (home_team, away_team, match_time) and
 * updates teams, kickoff (UTC), stadium, scores, and status in place.
 *
 * Required env:
 *   SYNC_ENDPOINT      Full URL to /api/public/sync-external-scores
 *   SCORE_SYNC_SECRET  Bearer token configured on the server
 * Optional:
 *   DATA_SOURCE_URL    Override the upstream feed
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

  console.log(`Fetching fixtures from ${source}`);
  const res = await fetch(source);
  if (!res.ok) {
    console.error(`Upstream feed responded ${res.status}`);
    process.exit(1);
  }
  const json = await res.json();
  const results = extract(json);
  console.log(`Extracted ${results.length} fixtures`);

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
 * Map a TheSportsDB event to the normalized payload accepted by the
 * sync endpoint. All match_time values are emitted as UTC ISO strings.
 */
function extract(json) {
  const events = json?.events ?? json?.matches ?? [];
  const out = [];
  for (const ev of events) {
    const home = ev.strHomeTeam ?? ev.home_team ?? ev.home;
    const away = ev.strAwayTeam ?? ev.away_team ?? ev.away;
    if (!home || !away) continue;

    const matchTime = toUtcIso(ev.strTimestamp, ev.dateEvent, ev.strTime);
    if (!matchTime) continue;

    const homeScore = parseScore(ev.intHomeScore ?? ev.home_score);
    const awayScore = parseScore(ev.intAwayScore ?? ev.away_score);
    const stadium = ev.strVenue ?? ev.strStadium ?? null;
    const stage = ev.strStage ?? ev.strLeague ?? "Auto-Synced";
    const status = normalizeStatus(
      ev.strStatus ?? ev.strPostponed ?? ev.status,
      matchTime,
      homeScore,
      awayScore,
    );

    out.push({
      home_team: String(home),
      away_team: String(away),
      home_score: homeScore,
      away_score: awayScore,
      match_time: matchTime,
      stadium: stadium ? String(stadium) : null,
      stage: String(stage),
      status,
      is_completed: status === "completed",
    });
  }
  return out;
}

function toUtcIso(timestamp, dateEvent, strTime) {
  if (timestamp) {
    const d = new Date(String(timestamp).replace(" ", "T") + "Z");
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (dateEvent) {
    const t = strTime && /^\d{2}:\d{2}/.test(strTime) ? strTime.slice(0, 8) : "00:00:00";
    const d = new Date(`${dateEvent}T${t}Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function normalizeStatus(raw, matchTime, homeScore, awayScore) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (/^(yes|postp|cancel)/.test(s) || s === "canceled") return "cancelled";
  if (s === "ht" || s.includes("half")) return "halftime";
  if (s === "ft" || s.includes("final") || s.includes("complete") || s.includes("finished") || s.includes("aet") || s.includes("pen")) return "completed";
  if (s === "live" || s === "1h" || s === "2h" || s === "et" || s.includes("in play") || s.includes("playing")) return "live";
  const kickoff = new Date(matchTime).getTime();
  const now = Date.now();
  if (homeScore != null && awayScore != null && now > kickoff + 2 * 60 * 60 * 1000) return "completed";
  if (now >= kickoff && now <= kickoff + 2 * 60 * 60 * 1000) return "live";
  return "scheduled";
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