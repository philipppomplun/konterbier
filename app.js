// Hier deine finale Google Apps Script Web-App URL eintragen:
const GOOGLE_SCRIPT_URL = https://script.google.com/macros/s/AKfycbwcxoZ2EX6dRsg3SVE65dgCmp5y__ElJqAIb67QK3axDGcjUKVoaIJJMiJWNXHPKm_z/exec;

document.addEventListener('DOMContentLoaded', () => {
  loadMatches();

  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');

  if (searchForm) {
    searchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = searchInput.value.trim();

      if (!url.includes('fupa.net')) {
        alert('Bitte gib einen gültigen FuPa.net Link ein!');
        return;
      }

      await parseAndAddFuPaMatch(url);
    });
  }
});

// 1. FuPa-Link direkt im Browser auslesen & parsen
async function parseAndAddFuPaMatch(fupaUrl) {
  const submitBtn = document.querySelector('#searchForm button');
  if (submitBtn) submitBtn.disabled = true;

  try {
    // Über CORS-Proxy im Browser laden
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(fupaUrl)}`;
    const response = await fetch(proxyUrl);
    const data = await response.json();
    const html = data.contents;

    // Fallbacks
    let homeTeam = "Heimteam", awayTeam = "Auswärtsteam", league = "FuPa Match";
    let dateText = "Demnächst", timeText = "15:00 Uhr", locationName = "Sportplatz";
    let address = "", homeLogo = "", awayLogo = "", lat = 53.5511, lng = 9.9937;

    // HTML parsen
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');

    // Versuchen JSON-LD Daten auszulesen
    scripts.forEach(script => {
      try {
        const matchData = JSON.parse(script.textContent);
        if (matchData.homeTeam || matchData['@type'] === 'SportsEvent') {
          if (matchData.homeTeam) homeTeam = matchData.homeTeam.name || homeTeam;
          if (matchData.awayTeam) awayTeam = matchData.awayTeam.name || awayTeam;
          if (matchData.homeTeam?.image) homeLogo = matchData.homeTeam.image;
          if (matchData.awayTeam?.image) awayLogo = matchData.awayTeam.image;

          if (matchData.location) {
            locationName = matchData.location.name || locationName;
            if (matchData.location.geo) {
              lat = parseFloat(matchData.location.geo.latitude) || lat;
              lng = parseFloat(matchData.location.geo.longitude) || lng;
            }
          }
          if (matchData.startDate) {
            const d = new Date(matchData.startDate);
            dateText = d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
            timeText = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + " Uhr";
          }
        }
      } catch (e) {}
    });

    // Fallback über Title-Tag, falls JSON-LD nicht auffindbar war
    if (homeTeam === "Heimteam") {
      const title = doc.querySelector('title')?.textContent || '';
      const parts = title.split(/ vs\.? | gegen | - | : /i);
      if (parts.length >= 2) {
        homeTeam = parts[0].trim();
        awayTeam = parts[1].trim();
      }
    }

    // Fertige Daten an das Google Sheet schicken
    const payload = {
      action: "addParsedMatch",
      league, homeTeam, homeLogo, awayTeam, awayLogo,
      timeText, dateText, locationName, address, lat, lng
    };

    await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    alert("Spiel erfolgreich hinzugefügt!");
    window.location.reload();

  } catch (err) {
    console.error("Fehler beim Auslesen:", err);
    alert("Konnte die Spieldaten nicht auslesen.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// 2. Spiele aus Google Sheet laden
async function loadMatches() {
  try {
    const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getMatches`);
    const matches = await res.json();
    renderMatches(matches);
  } catch (err) {
    console.error("Fehler beim Laden der Spiele:", err);
  }
}

// 3. Upvote/Downvote verarbeiten
async function voteMatch(matchId, type) {
  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: matchId, type: type })
    });
    loadMatches();
  } catch (err) {
    console.error("Fehler beim Upvote:", err);
  }
}

// 4. Anzeige im UI rendern
function renderMatches(matches) {
  const container = document.getElementById('matchesContainer');
  if (!container) return;

  if (!matches || matches.length === 0) {
    container.innerHTML = '<p style="text-align:center;">Keine anstehenden Spiele gefunden.</p>';
    return;
  }

  container.innerHTML = matches.map(m => `
    <div class="match-card">
      <div class="votes-badge">🔥 ${m.votes || 0} VOTES</div>
      <div class="league-name">${m.league}</div>
      <div class="match-main">
        <div class="team">
          <img src="${m.homeLogo || 'placeholder-logo.png'}" onerror="this.onerror=null;this.src='placeholder-logo.png';" alt="${m.homeTeam}">
          <span>${m.homeTeam}</span>
        </div>
        <div class="match-info">
          <h2>${m.timeText}</h2>
          <p>${m.dateText}</p>
          <p class="location">📍 ${m.locationName}</p>
        </div>
        <div class="team">
          <img src="${m.awayLogo || 'placeholder-logo.png'}" onerror="this.onerror=null;this.src='placeholder-logo.png';" alt="${m.awayTeam}">
          <span>${m.awayTeam}</span>
        </div>
      </div>
      <div class="actions">
        <button onclick="voteMatch('${m.id}', 'up')" class="btn-vote">👍 Upvote</button>
      </div>
    </div>
  `).join('');
}
