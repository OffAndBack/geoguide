/* =====================================================
   GéoGuide — app.js v2
   + Recherche de lieu manuelle (ville, adresse...)
   + Choix unité de distance (m/km ou miles)
   ===================================================== */

const API_ENDPOINT = '/api/explain';
const DEFAULT_LOCATION = { lat: 48.8566, lon: 2.3522, label: 'Paris, France' };
const SEARCH_RADIUS_DEFAULT = 500;

let state = {
  coords: null,
  places: [],
  filter: 'tous',
  lang: 'français',
  style: 'détaillé avec anecdotes',
  radius: SEARCH_RADIUS_DEFAULT,
  unit: 'metric',   // 'metric' (m/km) ou 'imperial' (miles)
};

// ── Données lieux ─────────────────────────────────────
const ALL_PLACES = [
  { id:1,  name:'Tour Eiffel',           icon:'🗼', type:'monument', lat:48.8584, lon:2.2945, tags:['XIXe siècle','Gustave Eiffel','Fer forgé','1889'] },
  { id:2,  name:'Cathédrale Notre-Dame',  icon:'⛪', type:'église',   lat:48.8530, lon:2.3499, tags:['Gothique','XIIe siècle','Île de la Cité','Victor Hugo'] },
  { id:3,  name:'Musée du Louvre',        icon:'🏛️', type:'musée',    lat:48.8606, lon:2.3376, tags:['Art universel','Peinture','Joconde','Antiquités'] },
  { id:4,  name:'Arc de Triomphe',        icon:'🏟️', type:'monument', lat:48.8738, lon:2.2950, tags:['Napoléon','XIXe','Champs-Élysées','Soldat inconnu'] },
  { id:5,  name:'Jardin des Tuileries',   icon:'🌳', type:'parc',     lat:48.8634, lon:2.3275, tags:['XVIIe','Jardin à la française','Orangerie'] },
  { id:6,  name:'Sainte-Chapelle',        icon:'🕍', type:'église',   lat:48.8554, lon:2.3450, tags:['Gothique rayonnant','XIIIe','Vitraux','Louis IX'] },
  { id:7,  name:"Musée d'Orsay",          icon:'🎨', type:'musée',    lat:48.8600, lon:2.3266, tags:['Impressionnisme','Van Gogh','Monet','Gare reconvertie'] },
  { id:8,  name:'Palais Royal',           icon:'👑', type:'monument', lat:48.8638, lon:2.3370, tags:['XVIIe','Jardins','Colonnes Buren','Richelieu'] },
  { id:9,  name:'Centre Pompidou',        icon:'🎭', type:'musée',    lat:48.8606, lon:2.3522, tags:['Art moderne','1977','Piano & Rogers','Beaubourg'] },
  { id:10, name:'Place de la Bastille',   icon:'🗽', type:'histoire', lat:48.8533, lon:2.3692, tags:['Révolution française','1789','Colonne de Juillet'] },
  { id:11, name:'Panthéon',               icon:'🏛️', type:'monument', lat:48.8462, lon:2.3508, tags:['Grands hommes','Voltaire','Victor Hugo','Coupole'] },
  { id:12, name:'Sacré-Cœur',             icon:'⛪', type:'église',   lat:48.8867, lon:2.3431, tags:['Montmartre','Néo-byzantin','Butte','Panorama'] },
  { id:13, name:'Place des Vosges',       icon:'🏘️', type:'histoire', lat:48.8554, lon:2.3625, tags:['XVIIe','Henri IV','Plus ancienne place de Paris'] },
  { id:14, name:'Palais de Justice',      icon:'⚖️', type:'histoire', lat:48.8554, lon:2.3452, tags:['Île de la Cité','XIVe','Conciergerie','Marie-Antoinette'] },
  { id:15, name:'Musée Carnavalet',       icon:'🗺️', type:'musée',    lat:48.8574, lon:2.3621, tags:['Histoire de Paris','Gratuit','Marais','Marcel Proust'] },
  { id:16, name:'Catacombes de Paris',    icon:'💀', type:'histoire', lat:48.8335, lon:2.3322, tags:['Ossements','XVIIIe','Carrières','Empire des morts'] },
  { id:17, name:'Opéra Garnier',          icon:'🎵', type:'monument', lat:48.8719, lon:2.3316, tags:['Napoléon III','1875','Fantôme de l\'Opéra','Chagall'] },
  { id:18, name:'Musée Rodin',            icon:'🗿', type:'musée',    lat:48.8558, lon:2.3157, tags:['Sculpture','Le Penseur','Hôtel Biron','Jardins'] },
  { id:19, name:'Château de Versailles',  icon:'🏰', type:'monument', lat:48.8049, lon:2.1204, tags:['Louis XIV','XVIIe','Galerie des Glaces','Jardins Le Nôtre'] },
  { id:20, name:'Château de Vincennes',   icon:'🏰', type:'histoire', lat:48.8451, lon:2.4384, tags:['XIVe','Forteresse royale','Donjon médiéval'] },
];

// ── Distance haversine (mètres) ────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Formatage de distance selon l'unité choisie ────────
function formatDist(meters) {
  if (state.unit === 'imperial') {
    const miles = meters / 1609.344;
    return miles < 0.2
      ? `${Math.round(meters * 3.281)} ft`
      : `${miles.toFixed(1)} mi`;
  }
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

// ── Rayon en mètres selon l'unité ─────────────────────
function radiusInMeters(val) {
  return state.unit === 'imperial' ? val * 1609.344 : val;
}

// ── Géolocalisation GPS ────────────────────────────────
function requestLocation() {
  const locText = document.getElementById('loc-text');
  locText.textContent = 'Localisation en cours…';
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
  loadPlaces();
}

// ── Recherche manuelle de lieu ─────────────────────────
let searchTimeout = null;

function openSearchPanel() {
  const panel = document.getElementById('search-panel');
  panel.style.display = 'block';
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
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=fr`
    );
    const data = await r.json();
    if (!data.length) {
      results.innerHTML = '<div class="search-empty">Aucun résultat</div>';
      return;
    }
    results.innerHTML = data.map(d => `
      <div class="search-result-item" onclick="selectPlace(${d.lat}, ${d.lon}, '${d.display_name.replace(/'/g,"\\'")}')">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;color:var(--c-blue)">
          <path d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.5c-.83 0-1.5-.67-1.5-1.5S7.17 4.5 8 4.5 9.5 5.17 9.5 6 8.83 7.5 8 7.5z" fill="currentColor"/>
        </svg>
        <span>${d.display_name}</span>
      </div>
    `).join('');
  } catch {
    results.innerHTML = '<div class="search-empty">Erreur de connexion</div>';
  }
}

function selectPlace(lat, lon, label) {
  const shortLabel = label.split(',').slice(0, 2).join(',').trim();
  applyLocation(parseFloat(lat), parseFloat(lon), '📍 ' + shortLabel);
  closeSearchPanel();
}

// ── Chargement des lieux ────────────────────────────────
function loadPlaces() {
  const { lat, lon } = state.coords;
  const radiusM = radiusInMeters(state.radius);
  state.places = ALL_PLACES
    .map(p => ({ ...p, dist: Math.round(haversine(lat, lon, p.lat, p.lon)) }))
    .filter(p => p.dist <= radiusM)
    .sort((a, b) => a.dist - b.dist);
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
        <p>Activez la géolocalisation ou cherchez un lieu pour découvrir les sites à proximité</p>
        <button class="cta-btn" onclick="requestLocation()">Détecter ma position</button>
      </div>`;
    return;
  }
  const filtered = state.filter === 'tous' ? state.places : state.places.filter(p => p.type === state.filter);
  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>Aucun lieu dans ce rayon ou cette catégorie.<br>Essayez d'augmenter le rayon dans les réglages.</p>
      </div>`;
    return;
  }
  container.innerHTML = `
    <div class="section-label">${filtered.length} lieu${filtered.length > 1 ? 'x' : ''} à proximité</div>
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
          <div class="place-preview">${p.tags.join(' · ')}</div>
        </div>
        <svg class="place-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `).join('')}`;
}

// ── Détail d'un lieu ─────────────────────────────────────
async function showDetail(id) {
  const place = state.places.find(p => p.id === id);
  if (!place) return;
  showTab('detail');
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
      body: JSON.stringify({ place: place.name, type: place.type, tags: place.tags, lang: state.lang, style: state.style }),
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
  } catch (err) {
    if (document.getElementById('detail-text')) {
      document.getElementById('detail-text').innerHTML =
        `<p style="color:var(--c-text2)">Impossible de charger l'explication. Vérifiez la clé API dans Vercel.</p>`;
    }
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
  const nearby = state.places.slice(0, 8);
  if (!nearby.length) { g.innerHTML = ''; return; }
  const cx = 180, cy = 120;
  const scale = 1500000 / radiusInMeters(state.radius) * 80;
  g.innerHTML = nearby.map(p => {
    const dx = (p.lon - state.coords.lon) * scale * Math.cos(state.coords.lat * Math.PI / 180);
    const dy = -(p.lat - state.coords.lat) * scale;
    const x = Math.max(20, Math.min(340, Math.round(cx + dx)));
    const y = Math.max(20, Math.min(220, Math.round(cy + dy)));
    return `
      <g onclick="showDetail(${p.id})" style="cursor:pointer">
        <circle cx="${x}" cy="${y}" r="16" fill="var(--c-bg)" stroke="var(--c-border2)" stroke-width="1.5"/>
        <text x="${x}" y="${y+6}" text-anchor="middle" font-size="14">${p.icon}</text>
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

// ── Filtres ─────────────────────────────────────────────
function toggleFilter(el, val) {
  document.querySelectorAll('#filter-row .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  state.filter = val;
  renderPlaces();
}

// ── Réglages ─────────────────────────────────────────────
function updateRadius(val) {
  state.radius = parseInt(val);
  const unit = state.unit === 'imperial' ? 'mi' : (state.radius >= 1000 ? 'km' : 'm');
  const display = state.unit === 'imperial'
    ? `${state.radius} mi`
    : (state.radius >= 1000 ? `${(state.radius/1000).toFixed(1)} km` : `${state.radius} m`);
  document.getElementById('radius-val').textContent = display;
  document.getElementById('radius-label').textContent = display;
  if (state.coords) loadPlaces();
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
    // Convertir le rayon courant en miles
    const miles = Math.round(state.radius / 1609.344) || 1;
    slider.min = 1; slider.max = 20; slider.step = 1; slider.value = miles;
    state.radius = miles;
    document.getElementById('radius-val').textContent = `${miles} mi`;
    document.getElementById('radius-label').textContent = `${miles} mi`;
  } else {
    // Remettre en mètres
    const meters = Math.round(state.radius * 1609.344 / 100) * 100 || 500;
    slider.min = 100; slider.max = 2000; slider.step = 100; slider.value = meters;
    state.radius = meters;
    const display = meters >= 1000 ? `${(meters/1000).toFixed(1)} km` : `${meters} m`;
    document.getElementById('radius-val').textContent = display;
    document.getElementById('radius-label').textContent = display;
  }
  if (state.coords) loadPlaces();
}

// ── Google Maps ──────────────────────────────────────────
function openGoogleMaps() {
  const c = state.coords || DEFAULT_LOCATION;
  window.open(`https://www.google.com/maps/@${c.lat},${c.lon},15z`, '_blank');
}

function openInMaps(lat, lon) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`, '_blank');
}
