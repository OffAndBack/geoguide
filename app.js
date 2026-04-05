/* =====================================================
   GéoGuide — app.js v3
   Lieux en temps réel via OpenStreetMap / Overpass API
   ===================================================== */

const API_ENDPOINT = '/api/explain';
const DEFAULT_LOCATION = { lat: 48.8566, lon: 2.3522, label: 'Paris, France' };
const SEARCH_RADIUS_DEFAULT = 1000;

let state = {
  coords: null,
  places: [],
  filter: 'tous',
  lang: 'français',
  style: 'détaillé avec anecdotes',
  radius: SEARCH_RADIUS_DEFAULT,
  unit: 'metric',
  loading: false,
};

// ── Correspondances types OSM → catégories app ────────
const OSM_QUERIES = [
  // Monuments / tourisme
  { tag: 'tourism=attraction',       type: 'monument', icon: '🏛️' },
  { tag: 'tourism=museum',           type: 'musée',    icon: '🎨' },
  { tag: 'tourism=gallery',          type: 'musée',    icon: '🖼️' },
  { tag: 'tourism=viewpoint',        type: 'monument', icon: '👁️' },
  { tag: 'tourism=artwork',          type: 'monument', icon: '🗿' },
  { tag: 'historic=monument',        type: 'monument', icon: '🗽' },
  { tag: 'historic=memorial',        type: 'histoire', icon: '🪦' },
  { tag: 'historic=castle',          type: 'monument', icon: '🏰' },
  { tag: 'historic=ruins',           type: 'histoire', icon: '🏚️' },
  { tag: 'historic=archaeological_site', type: 'histoire', icon: '⛏️' },
  { tag: 'historic=building',        type: 'histoire', icon: '🏛️' },
  { tag: 'historic=manor',           type: 'monument', icon: '🏰' },
  { tag: 'historic=fort',            type: 'histoire', icon: '🏯' },
  { tag: 'amenity=place_of_worship', type: 'église',   icon: '⛪' },
  { tag: 'leisure=park',             type: 'parc',     icon: '🌳' },
  { tag: 'leisure=garden',           type: 'parc',     icon: '🌸' },
  { tag: 'leisure=nature_reserve',   type: 'parc',     icon: '🌿' },
  { tag: 'landuse=cemetery',         type: 'histoire', icon: '⚰️' },
];

// Icône selon le type OSM
function getIcon(tags) {
  if (tags.tourism === 'museum')            return '🎨';
  if (tags.tourism === 'gallery')           return '🖼️';
  if (tags.tourism === 'viewpoint')         return '👁️';
  if (tags.tourism === 'artwork')           return '🗿';
  if (tags.historic === 'castle')           return '🏰';
  if (tags.historic === 'fort')             return '🏯';
  if (tags.historic === 'ruins')            return '🏚️';
  if (tags.historic === 'memorial')         return '🪦';
  if (tags.historic === 'archaeological_site') return '⛏️';
  if (tags.amenity === 'place_of_worship') {
    const rel = tags.religion;
    if (rel === 'muslim') return '🕌';
    if (rel === 'jewish') return '🕍';
    return '⛪';
  }
  if (tags.leisure === 'park' || tags.leisure === 'garden') return '🌳';
  if (tags.leisure === 'nature_reserve')    return '🌿';
  if (tags.landuse === 'cemetery')          return '⚰️';
  return '🏛️';
}

function getType(tags) {
  if (tags.tourism === 'museum' || tags.tourism === 'gallery') return 'musée';
  if (tags.amenity === 'place_of_worship')  return 'église';
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.leisure === 'nature_reserve') return 'parc';
  if (tags.historic === 'memorial' || tags.historic === 'ruins' ||
      tags.historic === 'archaeological_site' || tags.landuse === 'cemetery') return 'histoire';
  return 'monument';
}

// ── Distance haversine ─────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function formatDist(meters) {
  if (state.unit === 'imperial') {
    const miles = meters / 1609.344;
    return miles < 0.2 ? `${Math.round(meters * 3.281)} ft` : `${miles.toFixed(1)} mi`;
  }
  return meters >= 1000 ? `${(meters/1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function radiusInMeters() {
  return state.unit === 'imperial' ? state.radius * 1609.344 : state.radius;
}

// ── Géolocalisation GPS ────────────────────────────────
function requestLocation() {
  document.getElementById('loc-text').textContent = 'Localisation en cours…';
  closeSearchPanel();
  if (!navigator.geolocation) {
    applyLocation(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.label);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => reverseGeocode(pos.coords.latitude, pos.coords.longitude),
    () => applyLocation(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, '📍 ' + DEFAULT_LOCATION.label),
    { timeout: 8000, maximumAge: 60000 }
  );
}

async function reverseGeocode(lat, lon) {
  let label = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
    const d = await r.json();
    if (d.address) {
      const { city, town, village, suburb, postcode } = d.address;
      label = [suburb || village || town || city, postcode].filter(Boolean).join(' ') || label;
    }
  } catch {}
  applyLocation(lat, lon, '📍 ' + label);
}

function applyLocation(lat, lon, label) {
  state.coords = { lat, lon };
  document.getElementById('loc-text').textContent = label;
  loadPlacesFromOSM();
}

// ── Recherche manuelle ─────────────────────────────────
let searchTimeout = null;

function openSearchPanel() {
  document.getElementById('search-panel').style.display = 'block';
  document.getElementById('search-input').focus();
}

function closeSearchPanel() {
  document.getElementById('search-panel').style.display = 'none';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-input').value = '';
}

function onSearchInput(val) {
  clearTimeout(searchTimeout);
  const results = document.getElementById('search-results');
  if (val.length < 2) { results.innerHTML = ''; return; }
  results.innerHTML = '<div class="search-loading">Recherche…</div>';
  searchTimeout = setTimeout(() => searchPlace(val), 500);
}

async function searchPlace(query) {
  const results = document.getElementById('search-results');
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&accept-language=fr`
    );
    const data = await r.json();
    if (!data.length) { results.innerHTML = '<div class="search-empty">Aucun résultat</div>'; return; }
    results.innerHTML = data.map(d => `
      <div class="search-result-item" onclick="selectPlace(${d.lat}, ${d.lon}, '${d.display_name.replace(/'/g,"\\'")}')">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--c-blue)">
          <path d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.5c-.83 0-1.5-.67-1.5-1.5S7.17 4.5 8 4.5 9.5 5.17 9.5 6 8.83 7.5 8 7.5z" fill="currentColor"/>
        </svg>
        <span>${d.display_name}</span>
      </div>`).join('');
  } catch {
    results.innerHTML = '<div class="search-empty">Erreur de connexion</div>';
  }
}

function selectPlace(lat, lon, label) {
  const shortLabel = label.split(',').slice(0, 2).join(',').trim();
  applyLocation(parseFloat(lat), parseFloat(lon), '📍 ' + shortLabel);
  closeSearchPanel();
}

// ── Chargement des lieux via Overpass API (OSM) ────────
async function loadPlacesFromOSM() {
  if (!state.coords || state.loading) return;
  state.loading = true;

  const container = document.getElementById('places-list');
  container.innerHTML = `
    <div class="loading-state" style="padding:30px 20px;justify-content:center;flex-direction:column;gap:12px;text-align:center;">
      <div class="dot-pulse" style="justify-content:center;"><span></span><span></span><span></span></div>
      <div style="font-size:13px;color:var(--c-text2);">Recherche des lieux via OpenStreetMap…</div>
    </div>`;

  const { lat, lon } = state.coords;
  const radius = Math.round(radiusInMeters());

  // Requête Overpass : tous les lieux touristiques/historiques dans le rayon
  const query = `
    [out:json][timeout:25];
    (
      node["tourism"~"attraction|museum|gallery|viewpoint|artwork"](around:${radius},${lat},${lon});
      way["tourism"~"attraction|museum|gallery|viewpoint"](around:${radius},${lat},${lon});
      node["historic"~"monument|memorial|castle|ruins|archaeological_site|building|manor|fort"](around:${radius},${lat},${lon});
      way["historic"~"monument|memorial|castle|ruins|archaeological_site|building|manor|fort"](around:${radius},${lat},${lon});
      node["amenity"="place_of_worship"]["name"](around:${radius},${lat},${lon});
      way["amenity"="place_of_worship"]["name"](around:${radius},${lat},${lon});
      node["leisure"~"park|garden|nature_reserve"]["name"](around:${radius},${lat},${lon});
      way["leisure"~"park|garden|nature_reserve"]["name"](around:${radius},${lat},${lon});
      node["landuse"="cemetery"]["name"](around:${radius},${lat},${lon});
      way["landuse"="cemetery"]["name"](around:${radius},${lat},${lon});
    );
    out center tags;
  `;

  try {
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
    });
    const data = await resp.json();

    // Dédupliquer par nom, filtrer sans nom, calculer distance
    const seen = new Set();
    state.places = data.elements
      .filter(el => {
        const name = el.tags?.name;
        if (!name || seen.has(name.toLowerCase())) return false;
        seen.add(name.toLowerCase());
        return true;
      })
      .map(el => {
        const lat2 = el.lat ?? el.center?.lat;
        const lon2 = el.lon ?? el.center?.lon;
        const tags = el.tags || {};
        const dist = Math.round(haversine(lat, lon, lat2, lon2));
        const tagsArr = [
          tags['name:fr'] !== tags.name ? tags['name:fr'] : null,
          tags.historic || tags.tourism || tags.leisure || tags.amenity,
          tags.architect,
          tags.start_date || tags.year,
          tags.wikipedia ? 'Wikipedia' : null,
        ].filter(Boolean).slice(0, 4);

        return {
          id: el.id,
          name: tags['name:fr'] || tags.name,
          originalName: tags.name,
          icon: getIcon(tags),
          type: getType(tags),
          lat: lat2,
          lon: lon2,
          dist,
          tags: tagsArr.length ? tagsArr : [tags.historic || tags.tourism || tags.amenity || ''].filter(Boolean),
          osmTags: tags,
        };
      })
      .filter(p => p.lat && p.lon)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 60); // max 60 lieux

  } catch (e) {
    state.places = [];
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Impossible de charger les lieux.<br>Vérifiez votre connexion et réessayez.</p></div>`;
    state.loading = false;
    return;
  }

  state.loading = false;
  renderPlaces();
  updateMapPins();
}

// ── Rendu liste ─────────────────────────────────────────
function renderPlaces() {
  const container = document.getElementById('places-list');
  if (!state.coords) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📍</div>
        <p>Activez la géolocalisation ou cherchez un lieu</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button class="cta-btn" onclick="requestLocation()">📡 Ma position</button>
          <button class="cta-btn" style="background:var(--c-bg);color:var(--c-text);border:1px solid var(--c-border2);" onclick="openSearchPanel()">🔍 Chercher</button>
        </div>
      </div>`;
    return;
  }

  const filtered = state.filter === 'tous' ? state.places : state.places.filter(p => p.type === state.filter);

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>Aucun lieu "${state.filter}" dans ce rayon.<br>Essayez "Tous" ou augmentez le rayon.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="section-label">${filtered.length} lieu${filtered.length > 1 ? 'x' : ''} trouvé${filtered.length > 1 ? 's' : ''} · OpenStreetMap</div>
    ${filtered.map(p => `
      <div class="place-card" onclick="showDetail(${p.id})">
        <div class="place-icon">${p.icon}</div>
        <div class="place-info">
          <div class="place-name">${p.name}</div>
          <div class="place-meta">
            <span>${formatDist(p.dist)}</span>
            <div class="place-dot"></div>
            <span>${p.type}</span>
          </div>
          <div class="place-preview">${p.tags.join(' · ') || p.type}</div>
        </div>
        <svg class="place-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>`).join('')}`;
}

// ── Détail d'un lieu ─────────────────────────────────────
async function showDetail(id) {
  const place = state.places.find(p => p.id === id);
  if (!place) return;
  showTab('detail');

  const wikiLink = place.osmTags?.wikipedia
    ? `<a href="https://fr.wikipedia.org/wiki/${encodeURIComponent(place.osmTags.wikipedia.replace('fr:',''))}" target="_blank" style="color:var(--c-blue);font-size:12px;">Wikipedia ↗</a>`
    : '';

  document.getElementById('detail-content').innerHTML = `
    <button class="back-btn" onclick="showTab('list')">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M10 4L6 8l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Retour
    </button>
    <div class="detail-hero">${place.icon}</div>
    <div class="detail-header">
      <div class="detail-title">${place.name}</div>
      <div class="detail-meta">
        <span>📍 ${formatDist(place.dist)}</span>
        <span>🏷 ${place.type}</span>
        ${wikiLink}
      </div>
    </div>
    <div class="detail-divider"></div>
    <div class="detail-body" id="detail-text">
      <div class="loading-state"><div class="dot-pulse"><span></span><span></span><span></span></div>Gemini génère l'explication…</div>
    </div>
    <div class="detail-tags">${place.tags.map(t => `<span class="detail-tag">${t}</span>`).join('')}</div>
    <div class="detail-actions">
      <button class="action-btn primary" onclick="openInMaps(${place.lat}, ${place.lon})">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.5c-.83 0-1.5-.67-1.5-1.5S7.17 4.5 8 4.5 9.5 5.17 9.5 6 8.83 7.5 8 7.5z" fill="currentColor"/></svg>
        Y aller
      </button>
      <button class="action-btn" onclick="regenerateExplanation(${id})">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13.5 8A5.5 5.5 0 0 1 3.46 11.25M2.5 8A5.5 5.5 0 0 1 12.54 4.75M2.5 8H5M11 8h2.5M2.5 5v3M11 11v-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        Régénérer
      </button>
    </div>`;

  await fetchExplanation(place);
}

async function fetchExplanation(place) {
  const textEl = document.getElementById('detail-text');
  if (!textEl) return;
  textEl.innerHTML = `<div class="loading-state"><div class="dot-pulse"><span></span><span></span><span></span></div>Gemini génère l'explication…</div>`;
  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        place: place.name,
        type: place.type,
        tags: place.tags,
        lang: state.lang,
        style: state.style,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    textEl.innerHTML = '';
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta' && json.delta?.text) {
            textEl.textContent += json.delta.text;
          }
        } catch {}
      }
    }
  } catch {
    const el = document.getElementById('detail-text');
    if (el) el.innerHTML = `<p style="color:var(--c-text2)">Impossible de charger l'explication.</p>`;
  }
}

function regenerateExplanation(id) {
  const place = state.places.find(p => p.id === id);
  if (place) fetchExplanation(place);
}

// ── Carte ────────────────────────────────────────────────
function updateMapPins() {
  const g = document.getElementById('map-pins');
  if (!g || !state.coords) return;
  const nearby = state.places.slice(0, 10);
  if (!nearby.length) { g.innerHTML = ''; return; }
  const cx = 180, cy = 120;
  const scale = 1500000 / radiusInMeters() * 80;
  g.innerHTML = nearby.map(p => {
    const dx = (p.lon - state.coords.lon) * scale * Math.cos(state.coords.lat * Math.PI / 180);
    const dy = -(p.lat - state.coords.lat) * scale;
    const x = Math.max(20, Math.min(340, Math.round(cx + dx)));
    const y = Math.max(20, Math.min(220, Math.round(cy + dy)));
    return `
      <g onclick="showDetail(${p.id})" style="cursor:pointer">
        <circle cx="${x}" cy="${y}" r="16" fill="var(--c-bg)" stroke="var(--c-border2)" stroke-width="1.5"/>
        <text x="${x}" y="${y+6}" text-anchor="middle" font-size="13">${p.icon}</text>
      </g>`;
  }).join('');
}

// ── Navigation ──────────────────────────────────────────
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((el, i) => {
    el.classList.toggle('active', ['list','map','settings'].indexOf(tab) === i);
  });
  const target = document.getElementById('tab-' + tab);
  if (target) target.classList.add('active');
}

function toggleFilter(el, val) {
  document.querySelectorAll('#filter-row .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  state.filter = val;
  renderPlaces();
}

// ── Réglages ─────────────────────────────────────────────
function updateRadius(val) {
  state.radius = parseInt(val);
  const display = state.unit === 'imperial'
    ? `${state.radius} mi`
    : (state.radius >= 1000 ? `${(state.radius/1000).toFixed(1)} km` : `${state.radius} m`);
  document.getElementById('radius-val').textContent = display;
  document.getElementById('radius-label').textContent = display;
}

// Recharger quand on relâche le slider
function onRadiusChange() {
  if (state.coords) loadPlacesFromOSM();
}

function setOption(el, key, value) {
  el.parentElement.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  state[key] = value;
  if (key === 'unit') switchUnit(value);
}

function switchUnit(unit) {
  state.unit = unit;
  const slider = document.getElementById('radius-slider');
  if (unit === 'imperial') {
    const miles = Math.max(1, Math.round(state.radius / 1609.344));
    slider.min = 1; slider.max = 20; slider.step = 1; slider.value = miles;
    state.radius = miles;
    document.getElementById('radius-val').textContent = `${miles} mi`;
    document.getElementById('radius-label').textContent = `${miles} mi`;
  } else {
    const meters = Math.round(state.radius * 1609.344 / 100) * 100 || 1000;
    slider.min = 200; slider.max = 5000; slider.step = 200; slider.value = meters;
    state.radius = meters;
    const display = meters >= 1000 ? `${(meters/1000).toFixed(1)} km` : `${meters} m`;
    document.getElementById('radius-val').textContent = display;
    document.getElementById('radius-label').textContent = display;
  }
  if (state.coords) loadPlacesFromOSM();
}

function openGoogleMaps() {
  const c = state.coords || DEFAULT_LOCATION;
  window.open(`https://www.google.com/maps/@${c.lat},${c.lon},15z`, '_blank');
}

function openInMaps(lat, lon) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`, '_blank');
}
