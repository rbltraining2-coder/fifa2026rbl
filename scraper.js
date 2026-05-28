#!/usr/bin/env node
/**
 * scraper.js — FIFA 2026 fixture & score sync (free-tier optimized).
 *
 * Tier-based gating runs BEFORE the upstream API call so we never burn a
 * request when no work is due. Tiers:
 *   - live      → every 15 min (any match currently in-play)
 *   - matchday  → every 1 h  (kickoff within next 24 h)
 *   - upcoming  → every 12 h (everything further out / housekeeping)
 * Completed matches are never re-synced.
 *
 * Required env:
 *   SYNC_ENDPOINT, SCORE_SYNC_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const DEFAULT_SOURCE =
  "https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4429&s=2026";

const TIER_INTERVALS_MS = {
  live: 15 * 60 * 1000,
  matchday: 60 * 60 * 1000,
  upcoming: 12 * 60 * 60 * 1000,
};

async function main() {
  const endpoint = process.env.SYNC_ENDPOINT;
  const secret = process.env.SCORE_SYNC_SECRET;
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const source = process.env.DATA_SOURCE_URL || DEFAULT_SOURCE;

  if (!endpoint || !secret || !sbUrl || !sbKey) {
    console.error("Missing required env (SYNC_ENDPOINT, SCORE_SYNC_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
    process.exit(1);
  }

  // 1. Decide tier from current DB state.
  const matches = await sbGet(sbUrl, sbKey, "matches", "id,home_team,away_team,match_time,status");
  const tier = decideTier(matches ?? []);
  console.log(`[sync] decided tier=${tier}`);

  // 2. Check last successful sync for this tier; skip if interval not elapsed.
  const since = new Date(Date.now() - TIER_INTERVALS_MS[tier]).toISOString();
  const recent = await sbGet(
    sbUrl,
    sbKey,
    "sync_logs",
    "id,created_at",
    `source=eq.score-sync:${tier}&status=in.(success,partial)&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1`,
  );
  if (recent && recent.length > 0) {
    console.log(`[sync] tier ${tier} within interval (last ${recent[0].created_at}); skipping run.`);
    return;
  }

  // 3. Fetch upstream feed (FIFA league only, single endpoint).
  console.log(`[sync] fetching fixtures from ${source}`);
  let json;
  try {
    const res = await fetchWithRetry(source, { method: "GET" }, 3);
    if (!res.ok) {
      console.error(`[sync] upstream responded ${res.status}; skipping run.`);
      return;
    }
    json = await res.json();
  } catch (err) {
    console.error(`[sync] upstream fetch failed: ${err?.message ?? err}`);
    return;
  }

  let results;
  try {
    results = extract(json);
  } catch (err) {
    console.error(`[sync] extract failed: ${err?.message ?? err}`);
    return;
  }

  // 4. Build a cache key map of DB matches so we can skip already-completed
  //    fixtures and any rows whose upstream snapshot is unchanged.
  const dbByKey = new Map();
  for (const m of matches ?? []) {
    dbByKey.set(matchKey(m.home_team, m.away_team, m.match_time), m);
  }

  const filtered = results.filter((r) => {
    const existing = dbByKey.get(matchKey(r.home_team, r.away_team, r.match_time));
    // Never re-sync completed matches — they're frozen.
    if (existing && existing.status === "completed") return false;
    // Tier-based scoping: only push what this tier cares about.
    if (tier === "live") {
      return r.status === "live" || r.status === "halftime" || (existing && (existing.status === "live" || existing.status === "halftime"));
    }
    if (tier === "matchday") {
      const kickoff = new Date(r.match_time).getTime();
      return kickoff <= Date.now() + 24 * 60 * 60 * 1000;
    }
    return true; // upcoming → full refresh of non-completed fixtures
  });

  console.log(`[sync] tier=${tier} extracted=${results.length} forwarded=${filtered.length}`);
  if (filtered.length === 0) {
    console.log("[sync] nothing to forward.");
    return;
  }

  // 5. Forward to server with tier tag so logs split per tier.
  try {
    const resp = await fetchWithRetry(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
          "X-Sync-Tier": tier,
        },
        body: JSON.stringify({ tier, results: filtered }),
      },
      3,
    );
    const text = await resp.text();
    console.log(`[sync] response ${resp.status}: ${text.slice(0, 400)}`);
  } catch (err) {
    console.error(`[sync] sync request failed: ${err?.message ?? err}`);
  }
}

function decideTier(matches) {
  const now = Date.now();
  const hasLive = matches.some((m) => m.status === "live" || m.status === "halftime");
  if (hasLive) return "live";
  const hasNearKickoff = matches.some((m) => {
    if (m.status === "completed" || m.status === "cancelled") return false;
    const t = new Date(m.match_time).getTime();
    // include matches that should be live but haven't been promoted yet
    return t <= now + 24 * 60 * 60 * 1000 && t >= now - 3 * 60 * 60 * 1000;
  });
  if (hasNearKickoff) return "matchday";
  return "upcoming";
}

function matchKey(home, away, time) {
  return `${String(home).trim()}|${String(away).trim()}|${new Date(time).toISOString()}`;
}

async function sbGet(url, key, table, select, extra = "") {
  const u = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}${extra ? "&" + extra : ""}`;
  const res = await fetch(u, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.error(`[sync] supabase ${table} query failed ${res.status}`);
    return [];
  }
  return res.json();
}

async function fetchWithRetry(url, init, attempts) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      // Rate-limited: respect Retry-After when present, otherwise exp backoff.
      if (res.status === 429) {
        const retry = Number(res.headers.get("retry-after")) || 0;
        const wait = retry > 0 ? retry * 1000 : 2000 * Math.pow(2, i);
        console.warn(`[sync] 429 rate-limited; sleeping ${wait}ms (attempt ${i + 1}/${attempts})`);
        await new Promise((r) => setTimeout(r, wait));
        lastErr = new Error("HTTP 429");
        continue;
      }
      if (res.ok || res.status < 500) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
  }
  throw lastErr ?? new Error("fetch failed");
}

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
    const status = normalizeStatus(ev.strStatus ?? ev.strPostponed ?? ev.status, matchTime, homeScore, awayScore);
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
