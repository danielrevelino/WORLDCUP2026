const DEFAULT_COMPETITION = "WC";
const DEFAULT_SEASON = "2026";

module.exports = async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");

  try {
    if (process.env.SCORE_API_URL) {
      const payload = await fetchCustomProvider();
      response.status(200).json(normalizeCustomProvider(payload));
      return;
    }

    if (process.env.FOOTBALL_DATA_TOKEN) {
      const payload = await fetchFootballData();
      response.status(200).json(normalizeFootballData(payload));
      return;
    }

    response.status(200).json({
      source: "sample",
      fetchedAt: new Date().toISOString(),
      message: "No live provider configured. Set FOOTBALL_DATA_TOKEN or SCORE_API_URL in Vercel.",
      matches: [],
    });
  } catch (error) {
    response.status(502).json({
      source: "error",
      fetchedAt: new Date().toISOString(),
      message: error.message,
      matches: [],
    });
  }
};

async function fetchCustomProvider() {
  const headers = {};
  if (process.env.SCORE_API_TOKEN) {
    headers[process.env.SCORE_API_TOKEN_HEADER || "Authorization"] = process.env.SCORE_API_TOKEN;
  }
  const upstream = await fetch(process.env.SCORE_API_URL, { headers });
  if (!upstream.ok) throw new Error(`Custom score provider returned ${upstream.status}`);
  return upstream.json();
}

async function fetchFootballData() {
  const competition = process.env.FOOTBALL_DATA_COMPETITION || DEFAULT_COMPETITION;
  const season = process.env.FOOTBALL_DATA_SEASON || DEFAULT_SEASON;
  const url = new URL(`https://api.football-data.org/v4/competitions/${competition}/matches`);
  url.searchParams.set("season", season);
  const upstream = await fetch(url, {
    headers: {
      "X-Auth-Token": process.env.FOOTBALL_DATA_TOKEN,
    },
  });
  if (!upstream.ok) throw new Error(`football-data.org returned ${upstream.status}`);
  return upstream.json();
}

function normalizeFootballData(payload) {
  return {
    source: "football_data",
    fetchedAt: new Date().toISOString(),
    message: "Normalized from football-data.org.",
    matches: (payload.matches || []).map((match) => ({
      group: extractGroup(match.group),
      homeTeam: match.homeTeam?.name || "",
      awayTeam: match.awayTeam?.name || "",
      homeScore: match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? null,
      awayScore: match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? null,
      status: match.status || "SCHEDULED",
      utcDate: match.utcDate || null,
      minute: null,
      venue: match.venue || "",
    })),
  };
}

function normalizeCustomProvider(payload) {
  const matches = Array.isArray(payload.matches) ? payload.matches : Array.isArray(payload) ? payload : [];
  return {
    source: "custom",
    fetchedAt: new Date().toISOString(),
    message: "Normalized from SCORE_API_URL.",
    matches: matches.map((match) => ({
      group: match.group || match.stage || "",
      homeTeam: match.homeTeam || match.home?.name || match.teams?.home?.name || "",
      awayTeam: match.awayTeam || match.away?.name || match.teams?.away?.name || "",
      homeScore: match.homeScore ?? match.score?.home ?? match.goals?.home ?? null,
      awayScore: match.awayScore ?? match.score?.away ?? match.goals?.away ?? null,
      status: match.status || match.fixture?.status?.short || "SCHEDULED",
      utcDate: match.utcDate || match.date || match.fixture?.date || null,
      minute: match.minute || match.fixture?.status?.elapsed || null,
      venue: match.venue || match.fixture?.venue?.name || "",
    })),
  };
}

function extractGroup(group) {
  if (!group) return "";
  const match = String(group).match(/[A-L]$/i);
  return match ? match[0].toUpperCase() : String(group).replace(/^Group\s+/i, "");
}
