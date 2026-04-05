/* =====================================================
   GéoGuide — app.js
   Guide touristique géolocalisé propulsé par Claude AI
   ===================================================== */

// ── Config ──────────────────────────────────────────
const API_ENDPOINT = '/api/explain';   // Vercel serverless function
const DEFAULT_LOCATION = { lat: 48.8566, lon: 2.3522, label: 'Paris, France (position simulée)' };
const SEARCH_RADIUS_DEFAULT = 500;     // mètres

// ── State ────────────────────────────────────────────
let state = {
  coords: null,
  places: [],
  filter: 'tous',
  lang: 'français',
  style: 'détaillé avec anecdotes',
  radius: SEARCH_RADIUS_DEFAULT,
};

// ── Données lieux (base statique étendue) ─────────────
const ALL_PLACES = [
  // Paris centre
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

  // Petite couronne
  { id:19, name:'Château de Versailles',  icon:'🏰', type:'monument', lat:48.8049, lon:2.1204, tags:['Louis XIV','XVIIe','Galerie des Glaces','Jardins Le Nôtre'] },
  { id:20, name:'Château de Vincennes',   icon:'🏰', type:'histoire', lat:48.8451, lon:2.4384, tags:['XIVe','Forteresse royale','Donjon médiéval'] },
];

// ── Distance haversine (km) ──────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Géolocalisation ──────────────────────────────────
function requestLocation() {
  const locText = document.getElementById('loc-text');
  locText.textContent = 'Localisation en cours…';

  if (!navigator.geolocation) {
    applyLocation(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.label);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      reverseGeocode(lat, lon);
    },
    () => applyLocation(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.label),
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

// ── Chargement des lieux ─────────────────────────────
function loadPlaces() {
  const { lat, lon } = state.coords;
  state.places = ALL_PLACES
    .map(p => ({ ...p, dist: Math.round(haversine(lat, lon, p.lat, p.lon)) }))
    .filter(p => p.dist <= state.radius)
    .sort((a, b) => a.dist - b.dist);

  renderPlaces();
  updateMapPins();
}

// ── Rendu liste ──────────────────────────────────────
function renderPlaces() {
  const container = document.getElementById('places-list');
  const filtered = state.filter === 'tous'
    ? state.places
    : state.places.filter(p => p.type === state.filter);

  if (!state.coords) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📍</div>
        <p>Activez la géolocalisation pour découvrir les lieux autour de vous</p>
        <button class="cta-btn" onclick="requestLocation()">Détecter ma position</button>
      </div>`;
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>Aucun lieu dans ce rayon ou cette catégorie.<br>Essayez d'augmenter le rayon dans les réglages.</p>
      </div>`;
    return;
  }

  const distLabel = d => d >= 1000 ? `${(d/1000).toFixed(1)} km` : `${d} m`;

  container.innerHTML = `
    <div class="section-label">${filtered.length} lieu${filtered.length > 1 ? 'x' : ''} à proximité</div>
    ${filtered.map(p => `
      <div class="place-card" onclick="showDetail(${p.id})">
        <div class="place-icon">${p.icon}</div>
        <div class="place-info">
          <div class="place-name">${p.name}</div>
          <div class="place-meta">
            <span>${distLabel(p.dist)}</span>
            <div class="place-dot"></div>
            <span>${p.type}</span>
          </div>
          <div class="place-preview">${p.tags.join(' · ')}</div>
        </div>
        <svg class="place-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `).join('')}
  `;
}

// ── Détail d'un lieu ─────────────────────────────────
async function showDetail(id) {
  const place = state.places.find(p => p.id === id);
  if (!place) return;

  showTab('detail');

  const distLabel = place.dist >= 1000 ? `${(place.dist/1000).toFixed(1)} km` : `${place.dist} m`;

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
        <span>📍 ${distLabel}</span>
        <span>🏷 ${place.type}</span>
      </div>
    </div>
    <div class="detail-divider"></div>
    <div class="detail-body" id="detail-text">
      <div class="loading-state">
        <div class="dot-pulse"><span></span><span></span><span></span></div>
        Claude génère l'explication…
      </div>
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
    </div>
  `;

  await fetchExplanation(place);
}

// ── Appel API (serverless Vercel) ────────────────────
async function fetchExplanation(place) {
  const textEl = document.getElementById('detail-text');
  if (!textEl) return;

  textEl.innerHTML = `<div class="loading-state"><div class="dot-pulse"><span></span><span></span><span></span></div>Claude génère l'explication…</div>`;

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

    // Supprimer le curseur résiduel
    textEl.querySelectorAll('.streaming-cursor').forEach(el => el.remove());

  } catch (err) {
    console.error('API error:', err);
    textEl.innerHTML = `
      <p style="color:var(--c-text2)">Impossible de charger l'explication.</p>
      <p style="font-size:13px;color:var(--c-text3);margin-top:8px;">Vérifiez que la clé API Anthropic est configurée dans les variables d'environnement Vercel.</p>
    `;
  }
}

function regenerateExplanation(id) {
  const place = state.places.find(p => p.id === id);
  if (place) fetchExplanation(place);
}

// ── Carte ────────────────────────────────────────────
function updateMapPins() {
  const g = document.getElementById('map-pins');
  if (!g || !state.coords) return;

  // Projette les 8 premiers lieux sur la mini-carte (360×240)
  const nearby = state.places.slice(0, 8);
  if (!nearby.length) { g.innerHTML = ''; return; }

  const cx = 180, cy = 120;
  const scale = 1500000 / state.radius * 80;

  g.innerHTML = nearby.map(p => {
    const dx = (p.lon - state.coords.lon) * scale * Math.cos(state.coords.lat * Math.PI / 180);
    const dy = -(p.lat - state.coords.lat) * scale;
    const x = Math.max(20, Math.min(340, Math.round(cx + dx)));
    const y = Math.max(20, Math.min(220, Math.round(cy + dy)));
    return `
      <g onclick="showDetail(${p.id})" style="cursor:pointer">
        <circle cx="${x}" cy="${y}" r="16" fill="var(--c-bg)" stroke="var(--c-border2)" stroke-width="1.5"/>
        <text x="${x}" y="${y+6}" text-anchor="middle" font-size="14">${p.icon}</text>
      </g>
    `;
  }).join('');
}

// ── Navigation ───────────────────────────────────────
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((el, i) => {
    el.classList.toggle('active', ['list','map','settings'].indexOf(tab) === i);
  });
  const target = document.getElementById('tab-' + tab);
  if (target) target.classList.add('active');
}

// ── Filtres ──────────────────────────────────────────
function toggleFilter(el, val) {
  document.querySelectorAll('#filter-row .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  state.filter = val;
  renderPlaces();
}

// ── Réglages ─────────────────────────────────────────
function updateRadius(val) {
  state.radius = parseInt(val);
  const label = state.radius >= 1000 ? `${(state.radius/1000).toFixed(1)} km` : `${state.radius} m`;
  document.getElementById('radius-val').textContent = label;
  document.getElementById('radius-label').textContent = label;
  if (state.coords) loadPlaces();
}

function setOption(el, key, value) {
  // Désactiver tous les chips du même groupe
  el.parentElement.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  state[key] = value;
}

// ── Google Maps ──────────────────────────────────────
function openGoogleMaps() {
  const c = state.coords || DEFAULT_LOCATION;
  window.open(`https://www.google.com/maps/@${c.lat},${c.lon},15z`, '_blank');
}

function openInMaps(lat, lon) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`, '_blank');
}
