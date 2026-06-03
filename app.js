const state = {
  analysis: null,
  live: { matches: [], source: "loading", fetchedAt: null },
  groupFilter: "ALL",
  search: "",
  sortMode: "advance",
};

const selectors = {
  groupFilter: document.querySelector("#group-filter"),
  search: document.querySelector("#team-search"),
  sortMode: document.querySelector("#sort-mode"),
  groupGrid: document.querySelector("#group-grid"),
  matchStrip: document.querySelector("#match-strip"),
  liveStatus: document.querySelector("#live-status"),
  contenderList: document.querySelector("#contender-list"),
  thirdGrid: document.querySelector("#third-grid"),
  methodList: document.querySelector("#method-list"),
  sourceList: document.querySelector("#source-list"),
  teamCount: document.querySelector("#team-count"),
  leaderTitle: document.querySelector("#leader-title"),
};

const pct = (value, digits = 0) => `${(Number(value || 0) * 100).toFixed(digits)}%`;
const number = (value) => Number(value || 0);
const cleanStatus = (value) => String(value || "SCHEDULED").replaceAll("_", " ");

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function init() {
  state.analysis = await loadJson("./data/analysis.json");
  selectors.teamCount.textContent = state.analysis.groups.length;
  selectors.leaderTitle.textContent = state.analysis.contenders[0]?.Team || "Spain";
  setupControls();
  renderStaticSections();
  await refreshLive();
  render();
  window.setInterval(refreshLive, 30_000);
}

function setupControls() {
  const groups = ["ALL", ...new Set(state.analysis.groups.map((team) => team.Group))];
  selectors.groupFilter.innerHTML = groups
    .map((group) => `<option value="${group}">${group === "ALL" ? "All groups" : `Group ${group}`}</option>`)
    .join("");

  selectors.groupFilter.addEventListener("change", (event) => {
    state.groupFilter = event.target.value;
    render();
  });

  selectors.search.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });

  selectors.sortMode.addEventListener("change", (event) => {
    state.sortMode = event.target.value;
    render();
  });
}

async function refreshLive() {
  try {
    const live = await loadJson("./api/live");
    state.live = normalizeLivePayload(live, "api");
  } catch (apiError) {
    try {
      const sample = await loadJson("./data/live-results.sample.json");
      state.live = normalizeLivePayload(sample, "sample");
    } catch (sampleError) {
      state.live = { matches: [], source: "none", fetchedAt: new Date().toISOString() };
    }
  }
  renderLive();
  renderGroups();
}

function normalizeLivePayload(payload, fallbackSource) {
  const matches = Array.isArray(payload.matches) ? payload.matches : [];
  return {
    matches: matches.map((match) => ({
      group: match.group || guessGroup(match.homeTeam, match.awayTeam),
      homeTeam: match.homeTeam || match.home || "",
      awayTeam: match.awayTeam || match.away || "",
      homeScore: match.homeScore ?? match.score?.home ?? null,
      awayScore: match.awayScore ?? match.score?.away ?? null,
      status: match.status || "SCHEDULED",
      utcDate: match.utcDate || match.date || null,
      minute: match.minute ?? null,
      venue: match.venue || "",
    })),
    source: payload.source || fallbackSource,
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
    message: payload.message || "",
  };
}

function guessGroup(home, away) {
  const team = state.analysis?.groups.find((row) => row.Team === home || row.Team === away);
  return team?.Group || "";
}

function render() {
  renderLive();
  renderGroups();
}

function renderStaticSections() {
  renderContenders();
  renderThirdPlace();
  renderMethod();
}

function renderLive() {
  const liveMatches = state.live.matches
    .filter((match) => ["LIVE", "IN_PLAY", "PAUSED"].includes(match.status))
    .concat(state.live.matches.filter((match) => !["LIVE", "IN_PLAY", "PAUSED"].includes(match.status)))
    .slice(0, 8);

  const statusText = {
    football_data: "Connected to football-data.org through the Vercel API bridge.",
    custom: "Connected to the configured live-score provider.",
    api: "Connected to the live API bridge.",
    sample: "Using local sample data. Add an API token in Vercel to enable live results.",
    none: "No live feed is configured yet. Forecast tables are still available.",
    loading: "Loading score feed...",
  };

  selectors.liveStatus.textContent = `${statusText[state.live.source] || statusText.api} Last check: ${
    state.live.fetchedAt ? new Date(state.live.fetchedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "pending"
  }`;

  if (!liveMatches.length) {
    selectors.matchStrip.innerHTML = `<article class="match-item"><div class="match-meta"><span>No matches returned</span><span>Waiting</span></div><div class="match-score"><span>Live layer ready</span><span>--</span></div></article>`;
    return;
  }

  selectors.matchStrip.innerHTML = liveMatches
    .map((match) => {
      const score =
        match.homeScore === null || match.awayScore === null
          ? "vs"
          : `${match.homeScore} - ${match.awayScore}`;
      const timing = match.minute ? `${match.minute}'` : cleanStatus(match.status);
      return `
        <article class="match-item">
          <div class="match-meta">
            <span>Group ${match.group || "?"}</span>
            <span>${timing}</span>
          </div>
          <div class="match-score">
            <span>${escapeHtml(match.homeTeam)}</span>
            <span>${score}</span>
            <span>${escapeHtml(match.awayTeam)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderGroups() {
  const standings = calculateStandings();
  const summaries = new Map(state.analysis.groupSummary.map((row) => [row.Group, row]));
  const grouped = Map.groupBy
    ? Map.groupBy(state.analysis.groups, (team) => team.Group)
    : groupBy(state.analysis.groups, (team) => team.Group);

  const cards = [...grouped.entries()]
    .filter(([group]) => state.groupFilter === "ALL" || group === state.groupFilter)
    .map(([group, teams]) => {
      const visibleTeams = sortTeams(teams, standings.get(group) || []);
      const matchedTeams = visibleTeams.filter((team) => team.Team.toLowerCase().includes(state.search));
      if (state.search && matchedTeams.length === 0) return "";
      const summary = summaries.get(group);
      return `
        <article class="group-card">
          <div class="group-card__head">
            <div>
              <h3>Group ${group}</h3>
              <p class="strategic-read">${escapeHtml(summary?.["Strategic Read"] || "")}</p>
            </div>
            <span class="difficulty">${escapeHtml(summary?.Difficulty || "Medium")}</span>
          </div>
          <table class="team-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Win</th>
                <th>Adv</th>
                <th>Forecast</th>
                <th class="live-table">Pts</th>
              </tr>
            </thead>
            <tbody>
              ${matchedTeams.map((team) => renderTeamRow(team, standings)).join("")}
            </tbody>
          </table>
        </article>
      `;
    })
    .filter(Boolean);

  selectors.groupGrid.innerHTML = cards.length
    ? cards.join("")
    : `<article class="group-card"><div class="group-card__head"><h3>No teams match the filters</h3></div></article>`;
}

function renderTeamRow(team, standings) {
  const live = standings.get(team.Group)?.find((row) => row.team === team.Team) || emptyStanding(team.Team);
  return `
    <tr>
      <td>
        <span class="team-name">
          ${escapeHtml(team.Team)}
          <span class="team-role">${escapeHtml(team["Tier / Role"] || "")}</span>
        </span>
      </td>
      <td>${bar(team["Win Group %"])}</td>
      <td>${bar(team["Advance %"])}</td>
      <td>${escapeHtml(team["Predicted Finish"] || "")}</td>
      <td class="live-table">${live.points}</td>
    </tr>
  `;
}

function bar(value) {
  return `
    <span class="prob-bar">
      <span>${pct(value, 0)}</span>
      <span class="prob-track"><span class="prob-fill" style="width: ${Math.min(100, number(value) * 100)}%"></span></span>
    </span>
  `;
}

function sortTeams(teams, standingsRows) {
  const liveMap = new Map(standingsRows.map((row) => [row.team, row]));
  return [...teams].sort((a, b) => {
    if (state.sortMode === "win") return number(b["Win Group %"]) - number(a["Win Group %"]);
    if (state.sortMode === "finish") return finishRank(a["Predicted Finish"]) - finishRank(b["Predicted Finish"]);
    if (state.sortMode === "live") return (liveMap.get(b.Team)?.points || 0) - (liveMap.get(a.Team)?.points || 0);
    return number(b["Advance %"]) - number(a["Advance %"]);
  });
}

function finishRank(label) {
  return Number(String(label || "9").charAt(0)) || 9;
}

function calculateStandings() {
  const standings = new Map();
  for (const row of state.analysis.groups) {
    if (!standings.has(row.Group)) standings.set(row.Group, []);
    standings.get(row.Group).push(emptyStanding(row.Team));
  }

  for (const match of state.live.matches) {
    if (match.homeScore === null || match.awayScore === null) continue;
    if (!["FINISHED", "LIVE", "IN_PLAY", "PAUSED", "AWARDED"].includes(match.status)) continue;
    const group = match.group || guessGroup(match.homeTeam, match.awayTeam);
    const table = standings.get(group);
    if (!table) continue;
    const home = table.find((row) => row.team === match.homeTeam);
    const away = table.find((row) => row.team === match.awayTeam);
    if (!home || !away) continue;
    applyResult(home, number(match.homeScore), number(match.awayScore));
    applyResult(away, number(match.awayScore), number(match.homeScore));
  }

  for (const [group, table] of standings.entries()) {
    const forecast = new Map(
      state.analysis.groups.filter((row) => row.Group === group).map((row) => [row.Team, row])
    );
    table.sort((a, b) => {
      const aForecast = forecast.get(a.team);
      const bForecast = forecast.get(b.team);
      return (
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        number(bForecast?.["Win Group %"]) - number(aForecast?.["Win Group %"])
      );
    });
  }
  return standings;
}

function emptyStanding(team) {
  return {
    team,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  };
}

function applyResult(team, scored, conceded) {
  team.played += 1;
  team.goalsFor += scored;
  team.goalsAgainst += conceded;
  team.goalDifference = team.goalsFor - team.goalsAgainst;
  if (scored > conceded) {
    team.wins += 1;
    team.points += 3;
  } else if (scored === conceded) {
    team.draws += 1;
    team.points += 1;
  } else {
    team.losses += 1;
  }
}

function renderContenders() {
  const max = Math.max(...state.analysis.contenders.map((team) => number(team["Title %"])));
  selectors.contenderList.innerHTML = state.analysis.contenders
    .map(
      (team) => `
      <div class="contender-row">
        <div>
          <span class="contender-name">${escapeHtml(team.Team)}</span>
          <span class="contender-meta">Group ${team.Group} · QF ${pct(team["Reach QF %"], 1)}</span>
        </div>
        <span class="title-track">
          <span class="title-fill" style="width:${(number(team["Title %"]) / max) * 100}%"></span>
        </span>
        <strong>${pct(team["Title %"], 1)}</strong>
      </div>
    `
    )
    .join("");
}

function renderThirdPlace() {
  selectors.thirdGrid.innerHTML = state.analysis.thirdPlaceWatch
    .map(
      (team) => `
      <article class="third-item">
        <span class="third-rank">#${team.Priority}</span>
        <h3>${escapeHtml(team.Team)} · Group ${escapeHtml(team.Group)}</h3>
        <p><strong>${pct(team["Advance %"], 1)}</strong> advance probability</p>
        <p>${escapeHtml(team["Why they are live"] || "")}</p>
      </article>
    `
    )
    .join("");
}

function renderMethod() {
  selectors.methodList.innerHTML = state.analysis.method
    .map(
      (item) => `
      <div class="method-item">
        <strong>${escapeHtml(item.Step)}</strong>
        <span>${escapeHtml(item.Explanation)}</span>
      </div>
    `
    )
    .join("");

  selectors.sourceList.innerHTML = state.analysis.sources
    .map(
      (item) => `
      <a class="source-item" href="${item.URL}" target="_blank" rel="noreferrer">
        <strong>${escapeHtml(item.Source)}</strong>
        <span>${escapeHtml(item["Used for"])}</span>
      </a>
    `
    )
    .join("");
}

function groupBy(values, keyFn) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFn(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

init().catch((error) => {
  console.error(error);
  selectors.liveStatus.textContent = "Dashboard data failed to load. Check the browser console for details.";
});
