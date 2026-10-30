// --- P2P Sync State ---
let pushDebounceTimer = null;
let peerPushDebounceTimer = null;
let connectTimeoutTimer = null;
// --- Genel yardımcılar ---
const DATA_KEYS = ['seriesData', 'moviesData', 'categoriesData', 'tagsData', 'deletedItems'];
const DEFAULT_CATEGORIES = [
    { id: 1, name: 'Aksiyon', color: '#ef4444' },
    { id: 2, name: 'Komedi', color: '#f59e0b' },
    { id: 3, name: 'Dram', color: '#10b981' },
    { id: 4, name: 'Bilim Kurgu', color: '#6366f1' },
    { id: 5, name: 'Fantastik', color: '#8b5cf6' }
];

function safeParse(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const value = JSON.parse(raw);
        return value == null ? fallback : value;
    } catch (_) {
        return fallback;
    }
}

// HTML içine yazılan kullanıcı verisini kaçışla (XSS önlemi)
function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function safeUrl(url) {
    const trimmed = String(url || '').trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

function safeColor(color) {
    return /^#[0-9a-f]{3,8}$/i.test(color || '') ? color : '#6366f1';
}

// Türkçe harflere duyarlı küçük harfe çevirme (İ/I sorunu)
function trLower(value) {
    return String(value || '').toLocaleLowerCase('tr');
}

// Cihazlar arası çakışmayan sayısal ID üretimi
let lastGeneratedId = 0;
function newId() {
    const candidate = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    lastGeneratedId = Math.max(candidate, lastGeneratedId + 1);
    return lastGeneratedId;
}

function getTimestamp(value) {
    if (!value) return 0;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function toInt(value, fallback = 0) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

function parseRatingInput(inputId) {
    const raw = document.getElementById(inputId).value;
    if (raw === '') return null;
    const value = parseFloat(raw);
    return Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : null;
}

function isEmptyValue(value) {
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function normalizeIdList(list) {
    if (!Array.isArray(list)) return [];
    return Array.from(new Set(list.map(v => Number(v)).filter(Number.isFinite)));
}

function normalizeTagList(list) {
    if (!Array.isArray(list)) return [];
    return Array.from(new Set(list.filter(t => typeof t === 'string').map(t => t.trim()).filter(Boolean)));
}

function normalizeSeason(season) {
    const totalEpisodes = Math.max(0, toInt(season.totalEpisodes));
    const watchedEpisodes = Math.min(Math.max(0, toInt(season.watchedEpisodes)), totalEpisodes || Infinity);
    return {
        id: season.id != null ? season.id : newId(),
        season: Math.max(0, toInt(season.season)),
        totalEpisodes,
        watchedEpisodes,
        releaseDate: season.releaseDate || null,
        updatedAt: season.updatedAt || null,
        lastWatchedAt: watchedEpisodes > 0 ? (season.lastWatchedAt || null) : null
    };
}

function normalizeCount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 999) : 0;
}

// { flatrate: [ad], rent: [ad], buy: [ad] } — her biri en çok 8 ad
const PROVIDER_KINDS = ['flatrate', 'rent', 'buy'];
function normalizeProviders(value) {
    if (!value || typeof value !== 'object') return null;
    const result = {};
    PROVIDER_KINDS.forEach(kind => {
        const list = Array.isArray(value[kind])
            ? Array.from(new Set(value[kind].map(x => String(x || '').trim()).filter(Boolean))).slice(0, 8)
            : [];
        if (list.length) result[kind] = list;
    });
    return Object.keys(result).length ? result : null;
}

function hasProviders(item) {
    return !!(item && item.providers && PROVIDER_KINDS.some(k => (item.providers[k] || []).length));
}

// Süre dakika cinsinden; saçma değerler (0, negatif, 12 saatten uzun) yok sayılır
function normalizeRuntime(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 && n <= 720 ? Math.round(n) : null;
}

function normalizeSeriesItem(item) {
    const seasons = (Array.isArray(item.seasons) ? item.seasons : [])
        .filter(s => s && typeof s === 'object')
        .map(normalizeSeason)
        .sort((a, b) => a.season - b.season);
    const lastWatched = seasons.reduce((max, s) => Math.max(max, getTimestamp(s.lastWatchedAt)), 0);
    return {
        ...item,
        id: item.id != null ? item.id : newId(),
        name: String(item.name || '').trim(),
        platform: item.platform || 'Diğer',
        categories: normalizeIdList(item.categories),
        tags: normalizeTagList(item.tags),
        trailerUrl: item.trailerUrl || '',
        imdbRating: item.imdbRating != null && item.imdbRating !== '' ? Number(item.imdbRating) : null,
        myRating: item.myRating != null && item.myRating !== '' ? Number(item.myRating) : null,
        notes: item.notes || '',
        userStatus: item.userStatus === 'paused' || item.userStatus === 'dropped' ? item.userStatus : null,
        description: item.description || '',
        imageUrl: item.imageUrl || '',
        releaseDate: item.releaseDate || null,
        runtime: normalizeRuntime(item.runtime),
        rewatchCount: normalizeCount(item.rewatchCount),
        pinned: !!item.pinned,
        providers: normalizeProviders(item.providers),
        providersAt: item.providersAt || null,
        createdAt: item.createdAt || item.updatedAt || null,
        updatedAt: item.updatedAt || item.createdAt || null,
        lastWatchedAt: lastWatched > 0 ? new Date(lastWatched).toISOString() : null,
        seasons
    };
}

// Eski format: her sezon ayrı bir kayıt (aynı isimle). Bunları tek diziye birleştir.
function mergeLegacySeriesRows(name, rows) {
    const byNewest = [...rows].sort((a, b) => getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt));
    const pick = field => {
        const row = byNewest.find(r => !isEmptyValue(r[field]));
        return row ? row[field] : undefined;
    };
    const created = rows.map(r => getTimestamp(r.createdAt)).filter(Boolean);
    const updated = rows.map(r => getTimestamp(r.updatedAt)).filter(Boolean);
    return normalizeSeriesItem({
        id: rows[0].id,
        name,
        platform: pick('platform'),
        categories: pick('categories'),
        tags: pick('tags'),
        trailerUrl: pick('trailerUrl'),
        imdbRating: pick('imdbRating'),
        description: pick('description'),
        imageUrl: pick('imageUrl'),
        releaseDate: pick('releaseDate'),
        createdAt: created.length ? new Date(Math.min(...created)).toISOString() : (updated.length ? new Date(Math.min(...updated)).toISOString() : null),
        updatedAt: updated.length ? new Date(Math.max(...updated)).toISOString() : null,
        seasons: rows.map(r => ({
            id: r.id,
            season: r.season,
            totalEpisodes: r.totalEpisodes,
            watchedEpisodes: r.watchedEpisodes,
            releaseDate: r.releaseDate || null,
            updatedAt: r.updatedAt || null,
            lastWatchedAt: r.lastWatchedAt || null
        }))
    });
}

function hasLegacySeries(list) {
    return Array.isArray(list) && list.some(item => item && !Array.isArray(item.seasons));
}

function normalizeSeriesList(list) {
    if (!Array.isArray(list)) return [];
    const result = [];
    const legacyGroups = new Map();
    list.forEach(item => {
        if (!item || typeof item !== 'object') return;
        if (Array.isArray(item.seasons)) {
            result.push(normalizeSeriesItem(item));
            return;
        }
        const key = String(item.name || '').trim();
        if (!legacyGroups.has(key)) {
            legacyGroups.set(key, []);
            result.push({ __legacyKey: key });
        }
        legacyGroups.get(key).push(item);
    });
    return result.map(entry => entry.__legacyKey !== undefined
        ? mergeLegacySeriesRows(entry.__legacyKey, legacyGroups.get(entry.__legacyKey))
        : entry);
}

function normalizeMovie(movie) {
    return {
        ...movie,
        id: movie.id != null ? movie.id : newId(),
        name: String(movie.name || '').trim(),
        watched: !!movie.watched,
        platform: movie.platform || 'Diğer',
        categories: normalizeIdList(movie.categories),
        tags: normalizeTagList(movie.tags),
        trailerUrl: movie.trailerUrl || '',
        imdbRating: movie.imdbRating != null && movie.imdbRating !== '' ? Number(movie.imdbRating) : null,
        myRating: movie.myRating != null && movie.myRating !== '' ? Number(movie.myRating) : null,
        notes: movie.notes || '',
        description: movie.description || '',
        imageUrl: movie.imageUrl || '',
        releaseDate: movie.releaseDate || null,
        runtime: normalizeRuntime(movie.runtime),
        rewatchCount: normalizeCount(movie.rewatchCount),
        pinned: !!movie.pinned,
        providers: normalizeProviders(movie.providers),
        providersAt: movie.providersAt || null,
        createdAt: movie.createdAt || movie.updatedAt || null,
        updatedAt: movie.updatedAt || movie.createdAt || null,
        lastWatchedAt: movie.watched ? (movie.lastWatchedAt || null) : null
    };
}

function normalizeMoviesList(list) {
    return Array.isArray(list) ? list.filter(m => m && typeof m === 'object').map(normalizeMovie) : [];
}

function normalizeCategoriesList(list) {
    if (!Array.isArray(list)) return null;
    return list
        .filter(c => c && typeof c === 'object' && c.id != null && String(c.name || '').trim())
        .map(c => ({ ...c, id: Number(c.id), name: String(c.name).trim(), color: safeColor(c.color) }));
}

function normalizeTagsData(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list
        .filter(t => t && typeof t === 'object' && typeof t.name === 'string' && t.name.trim())
        .map(t => ({ ...t, id: t.id != null ? Number(t.id) : newId(), name: t.name.trim() }))
        .filter(t => {
            if (seen.has(t.name)) return false;
            seen.add(t.name);
            return true;
        });
}

function normalizeDeleted(value) {
    const base = { series: {}, movies: {}, categories: {}, tags: {} };
    if (!value || typeof value !== 'object') return base;
    Object.keys(base).forEach(k => {
        if (value[k] && typeof value[k] === 'object') base[k] = { ...value[k] };
    });
    return base;
}

// Data storage
const rawSeriesData = safeParse('seriesData', []);
if (hasLegacySeries(rawSeriesData) && !localStorage.getItem('seriesData_v1_backup')) {
    // Geçişten önce eski veriyi bir kez yedekle
    try { localStorage.setItem('seriesData_v1_backup', JSON.stringify(rawSeriesData)); } catch (_) {}
}
let seriesData = normalizeSeriesList(rawSeriesData);
let moviesData = normalizeMoviesList(safeParse('moviesData', []));
let categoriesData = normalizeCategoriesList(safeParse('categoriesData', null)) || DEFAULT_CATEGORIES.map(c => ({ ...c }));
let tagsData = normalizeTagsData(safeParse('tagsData', []));
let deletedItems = normalizeDeleted(safeParse('deletedItems', null));
try {
    localStorage.setItem('seriesData', JSON.stringify(seriesData));
    localStorage.setItem('moviesData', JSON.stringify(moviesData));
} catch (_) {}

function markDeleted(kind, id) {
    if (!deletedItems[kind]) deletedItems[kind] = {};
    deletedItems[kind][String(id)] = Date.now();
    localStorage.setItem('deletedItems', JSON.stringify(deletedItems));
}

let filteredSeriesData = [...seriesData];
let filteredMoviesData = [...moviesData];
let currentSeriesFilter = 'all';
let currentMoviesFilter = 'all';
let currentSeriesCategory = null;
let currentMoviesCategory = null;
let currentTrailersFilter = 'all';
let currentTrailersSort = 'alphabetical';
let trailersSearchQuery = '';
let seriesView = '3';
// Görsel oranı: Tailwind aspect-ratio class
let posterAspect = localStorage.getItem('posterAspect') || 'original';
// Eski sürümde oran ayarı hiç uygulanmıyordu; kullanıcının alıştığı görünümü korumak için bir kez "Orijinal"e çek
if (!localStorage.getItem('posterAspectFixed')) {
    posterAspect = 'original';
    try {
        localStorage.setItem('posterAspect', posterAspect);
        localStorage.setItem('posterAspectFixed', '1');
    } catch (_) {}
}
// Kart yerleşimi modu: 'grid' veya 'masonry'
let layoutMode = localStorage.getItem('layoutMode') || 'masonry';
let trailerPlayer = null;
let trailerStartTimeout = null;
let trailerHasStarted = false;
let trailersPreviewPlayer = null;
let trailersPreviewVideoId = null;
let trailersPreviewStartTimer = null;
let selectedBulkKeys = new Set();
let bulkAddCategoryIds = new Set();
let bulkRemoveCategoryIds = new Set();
let bulkAddTagNames = new Set();
let bulkRemoveTagNames = new Set();

// --- Sync helpers (P2P) ---

function getAllDataPayload() {
    return {
        series: seriesData,
        movies: moviesData,
        categories: categoriesData,
        tags: tagsData,
        deleted: deletedItems,
        dataVersion: 2,
        updatedAt: Date.now(),
        origin: window.location.origin
    };
}

function getLastWatchedTimestamp(item) {
    return getTimestamp(item && item.lastWatchedAt);
}

function getSeriesLastWatchedTimestamp(series) {
    if (!series) return 0;
    const seasons = Array.isArray(series.seasons) ? series.seasons : [];
    return seasons.reduce((latest, season) => Math.max(latest, getLastWatchedTimestamp(season)), getLastWatchedTimestamp(series));
}

function findSeries(id) {
    return seriesData.find(item => String(item.id) === String(id));
}

function refreshSeriesLastWatched(series) {
    const latest = series.seasons.reduce((max, s) => Math.max(max, getLastWatchedTimestamp(s)), 0);
    series.lastWatchedAt = latest > 0 ? new Date(latest).toISOString() : null;
}

function updateSeriesWatchProgress(seriesId, seasonId, delta) {
    const series = findSeries(seriesId);
    if (!series) return false;
    const season = series.seasons.find(s => String(s.id) === String(seasonId));
    if (!season) return false;

    const now = new Date().toISOString();
    if (delta > 0) {
        if (season.watchedEpisodes >= season.totalEpisodes) return false;
        season.watchedEpisodes += 1;
        season.lastWatchedAt = now;
    } else if (delta < 0) {
        if (season.watchedEpisodes <= 0) return false;
        season.watchedEpisodes -= 1;
        if (season.watchedEpisodes === 0) season.lastWatchedAt = null;
    } else {
        return false;
    }
    season.updatedAt = now;
    series.updatedAt = now;
    refreshSeriesLastWatched(series);
    localStorage.setItem('seriesData', JSON.stringify(seriesData));
    logWatch({ k: 'series', id: series.id, n: delta, m: delta * episodeMinutes(series) });
    return true;
}

function handleSharedStorageUpdate(key, nextValue) {
    if (key === 'seriesData') {
        seriesData = normalizeSeriesList(nextValue);
    } else if (key === 'moviesData') {
        moviesData = normalizeMoviesList(nextValue);
    } else if (key === 'categoriesData') {
        categoriesData = normalizeCategoriesList(nextValue) || categoriesData;
    } else if (key === 'tagsData') {
        tagsData = normalizeTagsData(nextValue);
    } else if (key === 'deletedItems') {
        deletedItems = normalizeDeleted(nextValue);
    }
    refreshAll();
}

function schedulePeerPush() {
    if (!rtcChannel || rtcChannel.readyState !== 'open') return;
    clearTimeout(peerPushDebounceTimer);
    peerPushDebounceTimer = setTimeout(async () => {
        try {
            if (await sendSyncPayload(rtcChannel)) {
                updatePairingStatus('Bağlı - veriler gönderildi (' + new Date().toLocaleTimeString('tr-TR') + ')', 'success');
            }
        } catch (err) {
            updatePairingStatus('Veri gönderilemedi: ' + err.message, 'error');
        }
    }, 600);
}

// İki listeyi ID bazında birleştir: daha yeni updatedAt kazanır, silinenler (tombstone) elenir
function mergeById(localList, remoteList, localDeleted, remoteDeleted) {
    const map = new Map();
    const put = item => {
        if (!item || item.id == null) return;
        const key = String(item.id);
        const existing = map.get(key);
        if (!existing || getTimestamp(item.updatedAt) > getTimestamp(existing.updatedAt)) {
            map.set(key, item);
        }
    };
    (localList || []).forEach(put);
    (remoteList || []).forEach(put);

    const deleted = { ...(localDeleted || {}) };
    Object.entries(remoteDeleted || {}).forEach(([key, ts]) => {
        if (!deleted[key] || ts > deleted[key]) deleted[key] = ts;
    });

    const items = Array.from(map.values()).filter(item => {
        const ts = deleted[String(item.id)];
        return !ts || getTimestamp(item.updatedAt) > ts;
    });
    return { items, deleted };
}

// Diğer cihazdan (P2P) gelen veriyi birleştir
function applyRemoteData(data) {
    receivePeerPayload(data);
}

// Patch localStorage.setItem to auto-push
const __origSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function(key, value) {
    try {
        __origSetItem(key, value);
    } catch (err) {
        alert('Veriler kaydedilemedi (tarayıcı depolama alanı dolu olabilir): ' + err.message);
        return;
    }
    if (DATA_KEYS.includes(key)) {
        schedulePeerPush();
        if (typeof scheduleCloudSync === 'function') scheduleCloudSync();
    }
};

window.addEventListener('storage', function(event) {
    if (!event.key || !DATA_KEYS.includes(event.key)) {
        return;
    }

    try {
        const parsedValue = event.newValue ? JSON.parse(event.newValue) : null;
        handleSharedStorageUpdate(event.key, parsedValue);
    } catch (_) {}
});
let moviesView = '3';

// Image loading error handling
function handleImageError(img) {
    if (!img || img.hasAttribute('data-image-failed')) {
        return;
    }

    // YouTube thumbnail fallback strategy (hqdefault -> mqdefault)
    if (img.src && img.src.includes('i.ytimg.com/vi/')) {
        if (!img.hasAttribute('data-fallback-tried') && img.src.includes('hqdefault.jpg')) {
            img.setAttribute('data-fallback-tried', 'true');
            img.src = img.src.replace('hqdefault.jpg', 'mqdefault.jpg');
            return;
        }
    }

    if (img.src && img.src.indexOf('http://') === 0 && !img.hasAttribute('data-https-tried')) {
        img.setAttribute('data-https-tried', 'true');
        img.src = 'https://' + img.src.substring('http://'.length);
        return;
    }

    img.setAttribute('data-image-failed', 'true');
    img.style.display = 'none';
    const posterWrapper = img.closest('.poster-wrapper');
    const placeholderHost = posterWrapper || img.parentElement;
    if (placeholderHost) {
        placeholderHost.innerHTML = `
            <div class="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <i class="fas fa-image text-gray-400 text-4xl"></i>
            </div>
        `;
    }
}

function setupImageErrorHandling() {
    // Setup error handling for all images
    document.querySelectorAll('img').forEach(img => {
        if (!img.hasAttribute('data-error-handled')) {
            img.setAttribute('data-error-handled', 'true');
            img.addEventListener('error', function() {
                handleImageError(this);
            });
        }
    });
}

// Check for saved theme
// =====================================================================
// Görünüm: açık/koyu tema + renk teması
// =====================================================================
const ACCENTS = [
    { id: 'mor', name: 'Mor', colors: ['#6366f1', '#8b5cf6'] },
    { id: 'okyanus', name: 'Okyanus', colors: ['#0284c7', '#0891b2'] },
    { id: 'gunbatimi', name: 'Gün Batımı', colors: ['#ea580c', '#db2777'] },
    { id: 'orman', name: 'Orman', colors: ['#059669', '#65a30d'] },
    { id: 'gece', name: 'Gece Yarısı', colors: ['#475569', '#64748b'] },
    { id: 'kiraz', name: 'Kiraz', colors: ['#e11d48', '#9f1239'] }
];
const DEFAULT_ACCENT = 'mor';

function currentAccent() {
    let saved = '';
    try { saved = localStorage.getItem('accent') || ''; } catch (_) {}
    return ACCENTS.some(a => a.id === saved) ? saved : DEFAULT_ACCENT;
}

function applyAccent(id) {
    const accent = ACCENTS.some(a => a.id === id) ? id : DEFAULT_ACCENT;
    document.body.setAttribute('data-accent', accent);
    document.documentElement.setAttribute('data-accent-boot', accent);
    try { localStorage.setItem('accent', accent); } catch (_) {}
    // Tarayıcı arayüzü (adres çubuğu, görev listesi) sayfa rengine uysun
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.body).getPropertyValue('--page-2').trim() || '#6366f1');
    renderAppearance();
}

function setDarkMode(isDark) {
    document.body.classList.toggle('dark-theme', isDark);
    // Tailwind'in koyu tema sınıfı <html> üzerinde duruyor
    document.documentElement.classList.toggle('dark', isDark);
    const icon = document.querySelector('#themeToggle i');
    if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch (_) {}
    applyAccent(currentAccent());
}

function renderAppearance() {
    const grid = document.getElementById('accentOptions');
    const isDark = document.body.classList.contains('dark-theme');
    document.querySelectorAll('.mode-option').forEach(btn => {
        btn.classList.toggle('active', (btn.getAttribute('data-mode') === 'dark') === isDark);
    });
    if (!grid) return;
    const active = currentAccent();
    grid.innerHTML = ACCENTS.map(a => `
        <button type="button" class="accent-option${a.id === active ? ' active' : ''}" data-accent-id="${esc(a.id)}" aria-pressed="${a.id === active ? 'true' : 'false'}">
            <span class="accent-swatch" style="background: linear-gradient(135deg, ${esc(a.colors[0])} 0%, ${esc(a.colors[1])} 100%)"></span>
            <span class="accent-name">${esc(a.name)}</span>
        </button>`).join('');
}

function setupAppearance() {
    const modal = document.getElementById('appearanceModal');
    const openBtn = document.getElementById('openAppearance');
    if (openBtn && modal) {
        openBtn.addEventListener('click', () => { renderAppearance(); openModal(modal); });
        const closeBtn = document.getElementById('closeAppearanceModal');
        if (closeBtn) closeBtn.addEventListener('click', () => closeModal(modal));
        modal.addEventListener('click', e => {
            const target = e.target;
            if (!(target instanceof Element)) return;
            const accentBtn = target.closest('[data-accent-id]');
            if (accentBtn) { applyAccent(accentBtn.getAttribute('data-accent-id')); return; }
            const modeBtn = target.closest('[data-mode]');
            if (modeBtn) setDarkMode(modeBtn.getAttribute('data-mode') === 'dark');
        });
    }
    applyAccent(currentAccent());
}

const savedTheme = localStorage.getItem('theme') || 'light';
if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    document.querySelector('#themeToggle i').className = 'fas fa-sun';
}

// Theme toggle
document.getElementById('themeToggle').addEventListener('click', function () {
    setDarkMode(!document.body.classList.contains('dark-theme'));
});

// DOM Elements
const seriesTab = document.getElementById('seriesTab');
const moviesTab = document.getElementById('moviesTab');
const upcomingTab = document.getElementById('upcomingTab');
const categoriesTab = document.getElementById('categoriesTab');
const tagsTab = document.getElementById('tagsTab');
const trailersTab = document.getElementById('trailersTab');
const seriesContent = document.getElementById('seriesContent');
const moviesContent = document.getElementById('moviesContent');
const upcomingContent = document.getElementById('upcomingContent');
const categoriesContent = document.getElementById('categoriesContent');
const tagsContent = document.getElementById('tagsContent');
const trailersContent = document.getElementById('trailersContent');
const seriesList = document.getElementById('seriesList');
const moviesList = document.getElementById('moviesList');
const categoriesList = document.getElementById('categoriesList');
const seriesEmpty = document.getElementById('seriesEmpty');
const moviesEmpty = document.getElementById('moviesEmpty');
const trailersList = document.getElementById('trailersList');
const trailersEmpty = document.getElementById('trailersEmpty');
const trailersCount = document.getElementById('trailersCount');
const trailersPreviewInfo = document.getElementById('trailersPreviewInfo');
const trailersSearch = document.getElementById('trailersSearch');
const trailersFilterAll = document.getElementById('trailersFilterAll');
const trailersFilterSeries = document.getElementById('trailersFilterSeries');
const trailersFilterMovies = document.getElementById('trailersFilterMovies');
const trailersSortSelect = document.getElementById('trailersSortSelect');
const totalStats = document.getElementById('totalStats');

// Upcoming releases DOM elements
const upcomingList = document.getElementById('upcomingList');
const upcomingCount = document.getElementById('upcomingCount');
const upcomingEmpty = document.getElementById('upcomingEmpty');
const upcomingFilterAll = document.getElementById('upcomingFilterAll');
const upcomingFilterSeries = document.getElementById('upcomingFilterSeries');
const upcomingFilterMovies = document.getElementById('upcomingFilterMovies');
const thisWeekCount = document.getElementById('thisWeekCount');
const thisMonthCount = document.getElementById('thisMonthCount');
const futureCount = document.getElementById('futureCount');
// Sync UI elements
const openSyncModalBtn = document.getElementById('openSyncModal');
const syncModalEl = document.getElementById('syncModal');
const closeSyncModalBtn = document.getElementById('closeSyncModal');
const firebaseConfigInput = document.getElementById('firebaseConfigInput');
const connectSyncBtn = document.getElementById('connectSyncBtn');
const syncNowBtn = document.getElementById('syncNowBtn');
const disconnectSyncBtn = document.getElementById('disconnectSyncBtn');
const syncStatusEl = document.getElementById('syncStatus');
// Basitleştirilmiş WebRTC pairing elements
const pairingCode = document.getElementById('pairingCode');
const generateCodeBtn = document.getElementById('generateCodeBtn');
const showQrBtn = document.getElementById('showQrBtn');
const scanQrBtn = document.getElementById('scanQrBtn');
const connectBtn = document.getElementById('connectBtn');
const pairingStatus = document.getElementById('pairingStatus');
const pairingInstructions = document.getElementById('pairingInstructions');
const codeLabel = document.getElementById('codeLabel');
const qrContainer = document.getElementById('qrContainer');
const connectTimeoutInput = document.getElementById('connectTimeoutInput');
const seriesStats = document.getElementById('seriesStats');
const moviesStats = document.getElementById('moviesStats');
const moviesStatusSummary = document.getElementById('moviesStatusSummary');
const seriesStatusSummary = document.getElementById('seriesStatusSummary');
const addSeriesBtn = document.getElementById('addSeriesBtn');
const addSeriesBtnEmpty = document.getElementById('addSeriesBtnEmpty');
const addMovieBtn = document.getElementById('addMovieBtn');
const addMovieBtnEmpty = document.getElementById('addMovieBtnEmpty');
const addCategoryBtn = document.getElementById('addCategoryBtn');
const seriesModal = document.getElementById('seriesModal');
const movieModal = document.getElementById('movieModal');
const searchSeries = document.getElementById('searchSeries');
const searchMovies = document.getElementById('searchMovies');
const seriesTagCloud = document.getElementById('seriesTagCloud');
const moviesTagCloud = document.getElementById('moviesTagCloud');

let connectTimeoutMs = parseInt(localStorage.getItem('connectTimeoutMs') || '12000', 10);
if (connectTimeoutInput) {
    let seconds = Math.round(connectTimeoutMs / 1000);
    if (!Number.isFinite(seconds) || seconds <= 0) seconds = 12;
    if (seconds < 5) seconds = 5;
    if (seconds > 60) seconds = 60;
    connectTimeoutMs = seconds * 1000;
    connectTimeoutInput.value = seconds;
    connectTimeoutInput.addEventListener('change', function () {
        let value = parseInt(this.value, 10);
        if (!Number.isFinite(value) || value <= 0) value = 12;
        if (value < 5) value = 5;
        if (value > 60) value = 60;
        this.value = value;
        connectTimeoutMs = value * 1000;
        localStorage.setItem('connectTimeoutMs', String(connectTimeoutMs));
    });
}

// Initialize the app
function initApp() {
    // Initialize tag inputs
    initTagInput('seriesTagsInput', 'seriesTagsContainer');
    initTagInput('movieTagsInput', 'movieTagsContainer');

    // Event delegation for edit and delete buttons
    setupEventDelegation();
    setupBulkEditing();
    setupModalClosing();
    setupPickForMe();
    setupCardDetail();
    setupPosterPreview();
    setupAppearance();
    setupUpcomingCalendar();
    setupCalendarSubscription();
    setupPlatformFilters();
    setupMaintenance();
    setupBackupReminder();
    const yearSelect = document.getElementById('yearSummarySelect');
    if (yearSelect) yearSelect.addEventListener('change', renderYearSummary);

    refreshAll();
}

// Tüm görünümleri mevcut veriye göre yeniden çiz (tekrar tekrar çağrılabilir)
function refreshAll() {
    refreshPlatformFilters();
    if (typeof renderBackupReminder === 'function') renderBackupReminder();
    filterSeries();
    filterMovies();
    renderCategoriesList();
    renderCategoryFilters();
    renderTagsList();
    updateSeriesCategorySelector();
    updateMovieCategorySelector();
    updateTotalStats();
    updateSeriesTagCloud();
    updateMoviesTagCloud();
    if (upcomingContent && !upcomingContent.classList.contains('hidden')) renderUpcomingReleases();
    if (trailersContent && !trailersContent.classList.contains('hidden')) renderTrailersTab();
    const statsContent = document.getElementById('statsContent');
    if (statsContent && !statsContent.classList.contains('hidden')) renderStats();
    // Öneriler açıksa, listeye eklenenleri öneri listesinden düş
    const discoverContent = document.getElementById('discoverContent');
    if (discoverContent && !discoverContent.classList.contains('hidden')) {
        const cached = safeParse('discoverCache', null);
        if (cached && Array.isArray(cached.results)) renderDiscoverList(cached.results);
    }
}

// --- Bildirim (toast) ---
function showToast(message, options = {}) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);
    let timer = null;
    const dismiss = () => {
        clearTimeout(timer);
        toast.remove();
    };
    if (options.actionLabel && options.onAction) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = options.actionLabel;
        btn.addEventListener('click', () => {
            dismiss();
            options.onAction();
        });
        toast.appendChild(btn);
    }
    container.appendChild(toast);
    timer = setTimeout(dismiss, options.duration || 4000);
}

// Silinen kaydı geri getir
function restoreDeleted(kind, item, index) {
    const list = kind === 'series' ? seriesData : moviesData;
    if (list.some(x => String(x.id) === String(item.id))) return;
    item.updatedAt = new Date().toISOString();
    list.splice(Math.min(index, list.length), 0, item);
    if (deletedItems[kind]) delete deletedItems[kind][String(item.id)];
    localStorage.setItem('deletedItems', JSON.stringify(deletedItems));
    localStorage.setItem(kind === 'series' ? 'seriesData' : 'moviesData', JSON.stringify(list));
    refreshAll();
    showToast(`"${item.name}" geri getirildi.`);
}

function removeSeries(id) {
    const index = seriesData.findIndex(s => String(s.id) === String(id));
    if (index === -1) return;
    const series = seriesData[index];
    seriesData = seriesData.filter(s => String(s.id) !== String(id));
    selectedBulkKeys.delete('series:' + id);
    markDeleted('series', id);
    localStorage.setItem('seriesData', JSON.stringify(seriesData));
    refreshAll();
    showToast(`"${series.name}" silindi.`, {
        actionLabel: 'Geri Al',
        onAction: () => restoreDeleted('series', series, index),
        duration: 8000
    });
}

function removeMovie(id) {
    const index = moviesData.findIndex(m => String(m.id) === String(id));
    if (index === -1) return;
    const movie = moviesData[index];
    moviesData = moviesData.filter(m => String(m.id) !== String(id));
    selectedBulkKeys.delete('movie:' + id);
    markDeleted('movies', id);
    localStorage.setItem('moviesData', JSON.stringify(moviesData));
    refreshAll();
    showToast(`"${movie.name}" silindi.`, {
        actionLabel: 'Geri Al',
        onAction: () => restoreDeleted('movies', movie, index),
        duration: 8000
    });
}

// Event delegation setup (initApp içinde yalnızca bir kez çağrılır)
function setupEventDelegation() {
    if (setupEventDelegation.__done) return;
    setupEventDelegation.__done = true;

    document.addEventListener('click', function(e) {
        const target = e.target;
        if (!(target instanceof Element)) return;

        const seriesCard = target.closest('.series-card');
        const movieCard = target.closest('.movie-card');

        const openCardBtn = target.closest('[data-open-card]');
        if (openCardBtn && (seriesCard || movieCard)) {
            openCardDetail(seriesCard ? 'series' : 'movie', openCardBtn.getAttribute('data-open-card'));
            return;
        }

        const pinnedWatchBtn = target.closest('.pinned-watch');
        if (pinnedWatchBtn) {
            if (setMovieWatched(pinnedWatchBtn.getAttribute('data-id'), true)) {
                refreshAll();
                showToast('İzlendi olarak işaretlendi.');
            }
            return;
        }

        const pinBtn = target.closest('.pin-icon');
        if (pinBtn && (seriesCard || movieCard)) {
            togglePin(seriesCard ? 'series' : 'movie', pinBtn.getAttribute('data-id'));
            return;
        }

        const rewatchBtn = target.closest('.start-rewatch');
        if (rewatchBtn) { startSeriesRewatch(rewatchBtn.getAttribute('data-series-id')); return; }

        const movieRewatchBtn = target.closest('.movie-rewatch');
        if (movieRewatchBtn) { markMovieRewatch(movieRewatchBtn.getAttribute('data-id')); return; }

        const inDetail = !!target.closest('#cardDetailModal');

        const editBtn = target.closest('.edit-icon');
        if (editBtn && (seriesCard || movieCard)) {
            const id = editBtn.getAttribute('data-id');
            if (inDetail) closeCardDetail();
            if (seriesCard) editSeries(id); else editMovie(id);
            return;
        }

        const deleteBtn = target.closest('.delete-icon');
        if (deleteBtn && (seriesCard || movieCard)) {
            const id = deleteBtn.getAttribute('data-id');
            if (inDetail) closeCardDetail();
            if (seriesCard) removeSeries(id); else removeMovie(id);
            return;
        }

        const seasonSetBtn = target.closest('.complete-season, .reset-season, .undo-episode');
        if (seasonSetBtn && seriesCard) {
            e.stopPropagation();
            const seriesId = seasonSetBtn.getAttribute('data-series-id');
            const seasonId = seasonSetBtn.getAttribute('data-season-id');
            const series = findSeries(seriesId);
            const season = series && series.seasons.find(x => String(x.id) === String(seasonId));
            if (!season) return;
            const before = season.watchedEpisodes;
            const target_ = seasonSetBtn.classList.contains('complete-season') ? season.totalEpisodes
                : seasonSetBtn.classList.contains('reset-season') ? 0
                : before - 1;
            if (setSeasonWatched(seriesId, seasonId, target_)) {
                if (seasonSetBtn.closest('.season-item')) openSeasonIds.add(String(seasonId));
                filterSeries();
                updateTotalStats();
                const diff = Math.abs(season.watchedEpisodes - before);
                showToast(
                    season.watchedEpisodes > before
                        ? `S${season.season}: ${diff} bölüm izlendi olarak işaretlendi.`
                        : `S${season.season}: ${diff} bölüm geri alındı.`,
                    { actionLabel: 'Geri Al', onAction: () => {
                        if (setSeasonWatched(seriesId, seasonId, before)) { filterSeries(); updateTotalStats(); }
                    }, duration: 7000 }
                );
            }
            return;
        }

        const episodeBtn = target.closest('.increase-episode, .decrease-episode');
        if (episodeBtn && seriesCard) {
            e.stopPropagation();
            const delta = episodeBtn.classList.contains('increase-episode') ? 1 : -1;
            const seasonId = episodeBtn.getAttribute('data-season-id');
            if (updateSeriesWatchProgress(episodeBtn.getAttribute('data-series-id'), seasonId, delta)) {
                if (episodeBtn.closest('.season-item')) openSeasonIds.add(String(seasonId));
                filterSeries();
                updateTotalStats();
            }
            return;
        }

        const pip = target.closest('[data-season-pip]');
        if (pip && seriesCard) {
            e.stopPropagation();
            const seasonId = String(pip.getAttribute('data-season-pip'));
            // Göstergeye basınca o sezon açılsın ve görünür olsun
            openSeasonIds.add(seasonId);
            const group = pip.closest('.season-group');
            if (group) seasonGroupState.set(group.getAttribute('data-group-key'), true);
            filterSeries();
            const opened = document.querySelector(`.season-item[data-season-id="${CSS.escape(seasonId)}"]`);
            if (opened && opened.scrollIntoView) opened.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
        }

        const groupHeader = target.closest('.season-group-header');
        if (groupHeader && seriesCard) {
            const group = groupHeader.closest('.season-group');
            const content = group.querySelector('.season-group-content');
            const toggle = groupHeader.querySelector('.season-toggle');
            const isOpen = content.classList.toggle('show');
            group.classList.toggle('is-open', isOpen);
            toggle.classList.toggle('rotate', isOpen);
            groupHeader.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            seasonGroupState.set(group.getAttribute('data-group-key'), isOpen);
            // Grup kapanınca içindeki sezonlar da kapalı sayılsın
            if (!isOpen) group.querySelectorAll('.season-item').forEach(item => openSeasonIds.delete(String(item.getAttribute('data-season-id'))));
            return;
        }

        const seasonHeader = target.closest('.season-header');
        if (seasonHeader && seriesCard) {
            const item = seasonHeader.closest('.season-item');
            const content = item.querySelector('.season-content');
            const toggle = seasonHeader.querySelector('.season-toggle');
            const isOpen = content.classList.toggle('show');
            toggle.classList.toggle('rotate', isOpen);
            const seasonId = String(item.getAttribute('data-season-id'));
            if (isOpen) openSeasonIds.add(seasonId); else openSeasonIds.delete(seasonId);
        }
    });
}

document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const header = target.closest('.season-group-header, .season-header');
    if (!header) return;
    e.preventDefault();
    header.click();
});

// Açık sezon panellerini yeniden çizimden sonra da açık tut
const openSeasonIds = new Set();
// Açık/kapalı sezon grupları: "diziId:grupSırası" -> true/false (yoksa varsayılan kural geçerli)
const seasonGroupState = new Map();

// Kaç sezonda bir gruplanacağı: liste uzadıkça grup da büyür
const SEASON_GROUP_THRESHOLD = 3;
function seasonGroupSize(count) {
    if (count <= 6) return 3;
    if (count <= 20) return 5;
    return 10;
}

// 3'ten fazla sezonu olan dizilerde sezonları açılır gruplara böler
function buildSeasonGroups(series) {
    const seasons = series.seasons || [];
    if (seasons.length <= SEASON_GROUP_THRESHOLD) return null;

    const next = getSeriesTotals(series).next;
    const nextId = next ? String(next.id) : null;
    const size = seasonGroupSize(seasons.length);
    const groups = [];

    for (let start = 0; start < seasons.length; start += size) {
        const chunk = seasons.slice(start, start + size);
        const total = chunk.reduce((sum, x) => sum + (x.totalEpisodes || 0), 0);
        const watched = chunk.reduce((sum, x) => sum + (x.watchedEpisodes || 0), 0);
        const key = series.id + ':' + groups.length;
        const stored = seasonGroupState.get(key);
        const hasNext = !!nextId && chunk.some(x => String(x.id) === nextId);
        groups.push({
            key,
            seasons: chunk,
            total,
            watched,
            label: chunk.length === 1
                ? `Sezon ${chunk[0].season}`
                : `Sezon ${chunk[0].season}-${chunk[chunk.length - 1].season}`,
            status: total > 0 && watched >= total ? 'completed' : watched > 0 ? 'watching' : 'planning',
            // Kullanıcı bir seçim yaptıysa ona uy; yapmadıysa sıradaki bölümün olduğu grubu aç
            open: chunk.some(x => openSeasonIds.has(String(x.id))) || (stored === undefined ? hasNext : stored)
        });
    }
    return groups;
}

// Grup başlığındaki sezon göstergeleri: her sezon için bir kare, dolgusu izlenen orana göre
function renderSeasonPips(group) {
    return group.seasons.map(season => {
        const ratio = season.totalEpisodes > 0 ? season.watchedEpisodes / season.totalEpisodes : 0;
        const state = ratio >= 1 ? 'completed' : ratio > 0 ? 'watching' : 'planning';
        return `<button type="button" class="season-pip ${state}" data-season-pip="${esc(season.id)}" title="Sezon ${esc(season.season)} · ${esc(season.watchedEpisodes)}/${esc(season.totalEpisodes)} bölüm" aria-label="Sezon ${esc(season.season)}">
            <span class="season-pip-fill" style="height: ${Math.round(ratio * 100)}%"></span>
            <span class="season-pip-no">${esc(season.season)}</span>
        </button>`;
    }).join('');
}

function closeModal(modal) {
    if (!modal) return;
    if (modal.id === 'cardDetailModal') cardDetail = null;
    if (modal.classList.contains('trailer-modal')) {
        resetTrailerPlayerState();
        modal.remove();
        return;
    }
    modal.classList.remove('active');
    if (modal.id === 'syncModal' && typeof stopQrScanner === 'function') stopQrScanner();
}

// Esc tuşu ve modal dışına tıklama ile kapatma
function setupModalClosing() {
    if (setupModalClosing.__done) return;
    setupModalClosing.__done = true;

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        const openModals = Array.from(document.querySelectorAll('.modal.active'));
        const top = openModals[openModals.length - 1];
        if (top) closeModal(top);
    });

    // Formlarda yanlışlıkla veri kaybını önlemek için sadece basılı tutup bırakılan tıklamalar
    let downTarget = null;
    document.addEventListener('mousedown', e => { downTarget = e.target; });
    document.addEventListener('click', function (e) {
        const target = e.target;
        if (!(target instanceof Element) || !target.classList.contains('modal')) return;
        if (downTarget !== target) return;
        if (target.id === 'seriesModal' || target.id === 'movieModal') return;
        closeModal(target);
    });
}

function setupBulkEditing() {
    if (setupBulkEditing.__done) return;
    setupBulkEditing.__done = true;

    const bulkModal = document.getElementById('bulkEditModal');
    const closeBulkBtn = document.getElementById('closeBulkEditModal');
    const cancelBulkBtn = document.getElementById('cancelBulkEdit');
    const applyBulkBtn = document.getElementById('applyBulkEdit');
    const summaryEl = document.getElementById('bulkSelectionSummary');
    const openButtons = Array.from(document.querySelectorAll('.bulk-edit-open'));

    const selectCategoryEl = document.getElementById('bulkSelectCategoryId');
    const selectTagEl = document.getElementById('bulkSelectTagName');
    const replaceByCategoryBtn = document.getElementById('bulkReplaceSelectionByCategory');
    const addByCategoryBtn = document.getElementById('bulkAddSelectionByCategory');
    const replaceByTagBtn = document.getElementById('bulkReplaceSelectionByTag');
    const addByTagBtn = document.getElementById('bulkAddSelectionByTag');
    const clearSelectionBtn = document.getElementById('bulkClearSelectionBtn');

    const newCategoryNameEl = document.getElementById('bulkNewCategoryName');
    const newCategoryColorEl = document.getElementById('bulkNewCategoryColor');
    const addNewCategoryBtn = document.getElementById('bulkAddNewCategoryBtn');

    const newTagNameEl = document.getElementById('bulkNewTagName');
    const addNewTagBtn = document.getElementById('bulkAddNewTagBtn');

    const addCategoriesListEl = document.getElementById('bulkAddCategoriesList');
    const removeCategoriesListEl = document.getElementById('bulkRemoveCategoriesList');
    const addTagsListEl = document.getElementById('bulkAddTagsList');
    const removeTagsListEl = document.getElementById('bulkRemoveTagsList');

    function normalizeTagName(name) {
        if (typeof name !== 'string') return '';
        return name.trim();
    }

    function ensureTagExists(name) {
        const trimmed = normalizeTagName(name);
        if (!trimmed) return null;
        const exists = Array.isArray(tagsData) ? tagsData.find(t => t && t.name === trimmed) : null;
        if (exists) return exists;
        const next = { id: newId(), name: trimmed };
        tagsData.push(next);
        return next;
    }

    function getAllTagNames() {
        const set = new Set();
        if (Array.isArray(tagsData)) {
            tagsData.forEach(t => {
                if (t && typeof t.name === 'string') {
                    const n = t.name.trim();
                    if (n) set.add(n);
                }
            });
        }
        if (Array.isArray(seriesData)) {
            seriesData.forEach(s => {
                if (s && Array.isArray(s.tags)) {
                    s.tags.forEach(tag => {
                        const n = normalizeTagName(tag);
                        if (n) set.add(n);
                    });
                }
            });
        }
        if (Array.isArray(moviesData)) {
            moviesData.forEach(m => {
                if (m && Array.isArray(m.tags)) {
                    m.tags.forEach(tag => {
                        const n = normalizeTagName(tag);
                        if (n) set.add(n);
                    });
                }
            });
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
    }

    function renderSelectionCount() {
        const count = selectedBulkKeys.size;
        document.querySelectorAll('.bulk-selected-count').forEach(el => {
            el.textContent = String(count);
            el.classList.toggle('hidden', count === 0);
        });
    }

    function updateCardSelectedState(cardEl, isSelected) {
        if (!cardEl) return;
        cardEl.classList.toggle('bulk-selected', isSelected);
    }

    function closeBulkModal() {
        if (!bulkModal) return;
        bulkModal.classList.remove('active');
    }

    function openBulkModal() {
        if (!bulkModal) return;
        bulkAddCategoryIds = new Set();
        bulkRemoveCategoryIds = new Set();
        bulkAddTagNames = new Set();
        bulkRemoveTagNames = new Set();
        refreshBulkModalUI();
        bulkModal.classList.add('active');
    }

    function renderSelectOptions() {
        if (selectCategoryEl) {
            const options = ['<option value="">Kategori seçin...</option>']
                .concat(categoriesData.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`));
            selectCategoryEl.innerHTML = options.join('');
        }
        if (selectTagEl) {
            const options = ['<option value="">Etiket seçin...</option>']
                .concat(getAllTagNames().map(name => `<option value="${esc(name)}">${esc(name)}</option>`));
            selectTagEl.innerHTML = options.join('');
        }
    }

    function renderCategoryActionLists() {
        if (!addCategoriesListEl || !removeCategoriesListEl) return;
        const row = (cat, active, attr, activeClass) => `
            <button type="button" class="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ${active ? activeClass : 'border-transparent hover:bg-black/5'}" ${attr}="${esc(cat.id)}">
                <span class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full" style="background-color: ${safeColor(cat.color)}"></span>
                    <span>${esc(cat.name)}</span>
                </span>
                <i class="fas ${active ? 'fa-check-circle' : 'fa-circle'} ${active ? '' : 'opacity-20'}"></i>
            </button>
        `;
        addCategoriesListEl.innerHTML = categoriesData
            .map(cat => row(cat, bulkAddCategoryIds.has(cat.id), 'data-bulk-cat-add', 'border-indigo-500 bg-indigo-500/10'))
            .join('');
        removeCategoriesListEl.innerHTML = categoriesData
            .map(cat => row(cat, bulkRemoveCategoryIds.has(cat.id), 'data-bulk-cat-remove', 'border-amber-500 bg-amber-500/10'))
            .join('');
    }

    function renderTagActionLists() {
        if (!addTagsListEl || !removeTagsListEl) return;
        const names = getAllTagNames();
        addTagsListEl.innerHTML = names.map(name => {
            const cls = bulkAddTagNames.has(name) ? 'tag !bg-indigo-600 !text-white border-transparent' : 'tag';
            return `<button type="button" class="${cls}" data-bulk-tag-add="${esc(name)}">${esc(name)}</button>`;
        }).join('');
        removeTagsListEl.innerHTML = names.map(name => {
            const cls = bulkRemoveTagNames.has(name) ? 'tag !bg-amber-500 !text-white border-transparent' : 'tag';
            return `<button type="button" class="${cls}" data-bulk-tag-remove="${esc(name)}">${esc(name)}</button>`;
        }).join('');
    }

    function refreshBulkModalUI() {
        renderSelectOptions();
        renderCategoryActionLists();
        renderTagActionLists();
        if (summaryEl) {
            const count = selectedBulkKeys.size;
            summaryEl.textContent = count > 0 ? `${count} öğe seçili.` : 'Henüz öğe seçilmedi. Kartların sol üstündeki kutucuklarla seçim yapabilirsiniz.';
        }
    }

    function getKeysForCategory(catId) {
        const keys = new Set();
        if (Number.isFinite(catId)) {
            seriesData.forEach(s => {
                if (s && Array.isArray(s.categories) && s.categories.includes(catId)) {
                    keys.add('series:' + String(s.id));
                }
            });
            moviesData.forEach(m => {
                if (m && Array.isArray(m.categories) && m.categories.includes(catId)) {
                    keys.add('movie:' + String(m.id));
                }
            });
        }
        return keys;
    }

    function getKeysForTag(tagName) {
        const keys = new Set();
        const t = normalizeTagName(tagName);
        if (!t) return keys;
        seriesData.forEach(s => {
            if (s && Array.isArray(s.tags) && s.tags.includes(t)) {
                keys.add('series:' + String(s.id));
            }
        });
        moviesData.forEach(m => {
            if (m && Array.isArray(m.tags) && m.tags.includes(t)) {
                keys.add('movie:' + String(m.id));
            }
        });
        return keys;
    }

    function applySelectionSet(newSet) {
        selectedBulkKeys = new Set(newSet);
        renderSelectionCount();
        renderSeriesList();
        renderMoviesList();
        refreshBulkModalUI();
    }

    function mergeSelectionSet(extraSet) {
        extraSet.forEach(k => selectedBulkKeys.add(k));
        renderSelectionCount();
        renderSeriesList();
        renderMoviesList();
        refreshBulkModalUI();
    }

    document.addEventListener('change', function (e) {
        const cb = e.target;
        if (!(cb instanceof HTMLInputElement)) return;
        if (!cb.classList.contains('bulk-select-checkbox')) return;
        e.stopPropagation();
        const key = cb.getAttribute('data-select-key') || '';
        if (!key) return;
        if (cb.checked) selectedBulkKeys.add(key); else selectedBulkKeys.delete(key);
        updateCardSelectedState(cb.closest('.series-card') || cb.closest('.movie-card'), cb.checked);
        renderSelectionCount();
        if (bulkModal && bulkModal.classList.contains('active')) refreshBulkModalUI();
    }, true);

    document.addEventListener('click', function (e) {
        const t = e.target;
        if (!(t instanceof Element)) return;

        const catAddBtn = t.closest('[data-bulk-cat-add]');
        if (catAddBtn) {
            const id = parseInt(catAddBtn.getAttribute('data-bulk-cat-add') || '', 10);
            if (Number.isFinite(id)) {
                if (bulkAddCategoryIds.has(id)) bulkAddCategoryIds.delete(id);
                else {
                    bulkAddCategoryIds.add(id);
                    bulkRemoveCategoryIds.delete(id);
                }
                refreshBulkModalUI();
            }
            return;
        }
        const catRemoveBtn = t.closest('[data-bulk-cat-remove]');
        if (catRemoveBtn) {
            const id = parseInt(catRemoveBtn.getAttribute('data-bulk-cat-remove') || '', 10);
            if (Number.isFinite(id)) {
                if (bulkRemoveCategoryIds.has(id)) bulkRemoveCategoryIds.delete(id);
                else {
                    bulkRemoveCategoryIds.add(id);
                    bulkAddCategoryIds.delete(id);
                }
                refreshBulkModalUI();
            }
            return;
        }

        const tagAddBtn = t.closest('[data-bulk-tag-add]');
        if (tagAddBtn) {
            const name = tagAddBtn.getAttribute('data-bulk-tag-add') || '';
            const n = normalizeTagName(name);
            if (n) {
                if (bulkAddTagNames.has(n)) bulkAddTagNames.delete(n);
                else {
                    bulkAddTagNames.add(n);
                    bulkRemoveTagNames.delete(n);
                }
                refreshBulkModalUI();
            }
            return;
        }
        const tagRemoveBtn = t.closest('[data-bulk-tag-remove]');
        if (tagRemoveBtn) {
            const name = tagRemoveBtn.getAttribute('data-bulk-tag-remove') || '';
            const n = normalizeTagName(name);
            if (n) {
                if (bulkRemoveTagNames.has(n)) bulkRemoveTagNames.delete(n);
                else {
                    bulkRemoveTagNames.add(n);
                    bulkAddTagNames.delete(n);
                }
                refreshBulkModalUI();
            }
            return;
        }
    }, true);

    if (closeBulkBtn) closeBulkBtn.addEventListener('click', closeBulkModal);
    if (cancelBulkBtn) cancelBulkBtn.addEventListener('click', closeBulkModal);
    openButtons.forEach(btn => btn.addEventListener('click', openBulkModal));

    if (clearSelectionBtn) {
        clearSelectionBtn.addEventListener('click', function () {
            applySelectionSet(new Set());
        });
    }

    if (replaceByCategoryBtn) {
        replaceByCategoryBtn.addEventListener('click', function () {
            const id = parseInt((selectCategoryEl && selectCategoryEl.value) ? selectCategoryEl.value : '', 10);
            if (!Number.isFinite(id)) return;
            applySelectionSet(getKeysForCategory(id));
        });
    }
    if (addByCategoryBtn) {
        addByCategoryBtn.addEventListener('click', function () {
            const id = parseInt((selectCategoryEl && selectCategoryEl.value) ? selectCategoryEl.value : '', 10);
            if (!Number.isFinite(id)) return;
            mergeSelectionSet(getKeysForCategory(id));
        });
    }
    if (replaceByTagBtn) {
        replaceByTagBtn.addEventListener('click', function () {
            const name = (selectTagEl && selectTagEl.value) ? selectTagEl.value : '';
            const keys = getKeysForTag(name);
            applySelectionSet(keys);
        });
    }
    if (addByTagBtn) {
        addByTagBtn.addEventListener('click', function () {
            const name = (selectTagEl && selectTagEl.value) ? selectTagEl.value : '';
            const keys = getKeysForTag(name);
            mergeSelectionSet(keys);
        });
    }

    if (addNewCategoryBtn) {
        addNewCategoryBtn.addEventListener('click', function () {
            const name = (newCategoryNameEl && newCategoryNameEl.value) ? newCategoryNameEl.value.trim() : '';
            const color = (newCategoryColorEl && newCategoryColorEl.value) ? newCategoryColorEl.value.trim() : '#6366f1';
            if (!name) { alert('Lütfen bir kategori adı girin.'); return; }
            const exists = categoriesData.find(c => c && c.name === name);
            if (exists) {
                bulkAddCategoryIds.add(exists.id);
                bulkRemoveCategoryIds.delete(exists.id);
                refreshBulkModalUI();
                return;
            }
            const next = { id: newId(), name, color: safeColor(color) };
            categoriesData.push(next);
            localStorage.setItem('categoriesData', JSON.stringify(categoriesData));
            updateSeriesCategorySelector();
            updateMovieCategorySelector();
            renderCategoryFilters();
            renderCategoriesList();
            bulkAddCategoryIds.add(next.id);
            refreshBulkModalUI();
            if (newCategoryNameEl) newCategoryNameEl.value = '';
        });
    }

    if (addNewTagBtn) {
        addNewTagBtn.addEventListener('click', function () {
            const name = (newTagNameEl && newTagNameEl.value) ? newTagNameEl.value : '';
            const trimmed = normalizeTagName(name);
            if (!trimmed) { alert('Lütfen bir etiket adı girin.'); return; }
            ensureTagExists(trimmed);
            localStorage.setItem('tagsData', JSON.stringify(tagsData));
            bulkAddTagNames.add(trimmed);
            bulkRemoveTagNames.delete(trimmed);
            renderTagsList();
            renderTagOptions('seriesTagOptions', 'seriesTagsContainer');
            renderTagOptions('movieTagOptions', 'movieTagsContainer');
            updateSeriesTagCloud();
            updateMoviesTagCloud();
            refreshBulkModalUI();
            if (newTagNameEl) newTagNameEl.value = '';
        });
    }

    function applyChangesToCategoriesAndTags(item) {
        const currentCats = Array.isArray(item.categories) ? item.categories : [];
        const currentTags = Array.isArray(item.tags) ? item.tags : [];

        const catSet = new Set(currentCats);
        bulkAddCategoryIds.forEach(id => catSet.add(id));
        bulkRemoveCategoryIds.forEach(id => catSet.delete(id));
        item.categories = Array.from(catSet);

        const tagSet = new Set(currentTags.map(normalizeTagName).filter(Boolean));
        bulkAddTagNames.forEach(name => {
            const n = normalizeTagName(name);
            if (n) tagSet.add(n);
        });
        bulkRemoveTagNames.forEach(name => {
            const n = normalizeTagName(name);
            if (n) tagSet.delete(n);
        });
        item.tags = Array.from(tagSet);
        item.updatedAt = new Date().toISOString();
    }

    if (applyBulkBtn) {
        applyBulkBtn.addEventListener('click', function () {
            if (selectedBulkKeys.size === 0) {
                alert('Önce en az bir öğe seçmelisiniz.');
                return;
            }

            createSnapshot(`Toplu düzenleme öncesi (${selectedBulkKeys.size} kayıt)`);
            bulkAddTagNames.forEach(n => ensureTagExists(n));

            selectedBulkKeys.forEach(key => {
                if (key.startsWith('movie:')) {
                    const id = key.slice('movie:'.length);
                    const movie = moviesData.find(m => String(m.id) === id);
                    if (movie) applyChangesToCategoriesAndTags(movie);
                    return;
                }
                if (key.startsWith('series:')) {
                    const series = findSeries(key.slice('series:'.length));
                    if (series) applyChangesToCategoriesAndTags(series);
                }
            });

            localStorage.setItem('seriesData', JSON.stringify(seriesData));
            localStorage.setItem('moviesData', JSON.stringify(moviesData));
            localStorage.setItem('categoriesData', JSON.stringify(categoriesData));
            localStorage.setItem('tagsData', JSON.stringify(tagsData));

            filterSeries();
            filterMovies();
            renderCategoryFilters();
            renderTagsList();
            updateSeriesTagCloud();
            updateMoviesTagCloud();
            renderSelectionCount();

            closeBulkModal();
            alert('Toplu düzenleme başarıyla uygulandı!');
        });
    }

    renderSelectionCount();
}

// Render category chips with counts for series and movies
function renderCategoryFilters() {
    const seriesContainer = document.getElementById('seriesCategoryFilters');
    const moviesContainer = document.getElementById('moviesCategoryFilters');
    if (!seriesContainer || !moviesContainer) return;

    // Silinmiş kategori seçili kaldıysa filtreyi sıfırla
    if (currentSeriesCategory && !categoriesData.some(c => c.id === currentSeriesCategory)) currentSeriesCategory = null;
    if (currentMoviesCategory && !categoriesData.some(c => c.id === currentMoviesCategory)) currentMoviesCategory = null;

    const buildChip = (cat, count, isSelected, onClick) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'category-option' + (isSelected ? ' selected' : '');
        chip.style.setProperty('--cat', safeColor(cat.color));
        chip.setAttribute('data-id', cat.id);
        chip.innerHTML = `${esc(cat.name)} <span>(${count})</span>`;
        chip.addEventListener('click', function (e) {
            e.stopPropagation();
            onClick(cat.id);
        });
        return chip;
    };

    seriesContainer.innerHTML = '';
    moviesContainer.innerHTML = '';

    categoriesData.forEach(cat => {
        const seriesCount = seriesData.filter(s => s.categories && s.categories.includes(cat.id)).length;
        const movieCount = moviesData.filter(m => m.categories && m.categories.includes(cat.id)).length;

        seriesContainer.appendChild(buildChip(cat, seriesCount, currentSeriesCategory === cat.id, id => {
            currentSeriesCategory = currentSeriesCategory === id ? null : id;
            renderCategoryFilters();
            filterSeries();
        }));
        moviesContainer.appendChild(buildChip(cat, movieCount, currentMoviesCategory === cat.id, id => {
            currentMoviesCategory = currentMoviesCategory === id ? null : id;
            renderCategoryFilters();
            filterMovies();
        }));
    });
}

// Dizinin toplam bölüm/izlenen/durum bilgisi (tüm sezonlar)
function getSeriesTotals(series) {
    const seasons = Array.isArray(series.seasons) ? series.seasons : [];
    const total = seasons.reduce((sum, s) => sum + (s.totalEpisodes || 0), 0);
    const watched = seasons.reduce((sum, s) => sum + (s.watchedEpisodes || 0), 0);
    let status = total > 0 && watched >= total ? 'completed' : watched > 0 ? 'watching' : 'planning';
    if ((series.userStatus === 'paused' || series.userStatus === 'dropped') && status !== 'completed') status = series.userStatus;
    const next = seasons.find(s => s.watchedEpisodes < s.totalEpisodes) || null;
    // Son işaretlenen bölümün bulunduğu sezon: "geri al" bunu hedefler
    const prev = [...seasons].reverse().find(s => s.watchedEpisodes > 0) || null;
    return { total, watched, status, progress: total > 0 ? (watched / total) * 100 : 0, next, prev };
}

// Update total stats
function updateTotalStats() {
    const seriesCount = seriesData.length;
    const moviesCount = moviesData.length;

    seriesStats.textContent = seriesCount;
    moviesStats.textContent = moviesCount;
    totalStats.textContent = seriesCount + moviesCount;

    const watchedMovies = moviesData.filter(m => m.watched).length;
    if (moviesStatusSummary) {
        moviesStatusSummary.textContent = `İzlenen ${watchedMovies} / İzlenmeyen ${moviesCount - watchedMovies}`;
    }

    const counts = { completed: 0, watching: 0, planning: 0, paused: 0, dropped: 0 };
    seriesData.forEach(series => { counts[getSeriesTotals(series).status]++; });
    if (seriesStatusSummary) {
        const extra = (counts.paused ? ` / Duraklatılan ${counts.paused}` : '') + (counts.dropped ? ` / Bırakılan ${counts.dropped}` : '');
        seriesStatusSummary.textContent = `Tamamlanan ${counts.completed} / İzlenen ${counts.watching} / Planlanan ${counts.planning}${extra}`;
    }
}

// Upcoming releases functions
let currentUpcomingFilter = 'all';

function parseLocalDate(dateString) {
    if (!dateString) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
    const date = match ? new Date(+match[1], +match[2] - 1, +match[3]) : new Date(dateString);
    if (isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function getUpcomingContent() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingItems = [];

    // Diziler: dizinin ve sezonlarının en yakın gelecek tarihi
    seriesData.forEach(series => {
        const candidates = [
            { date: series.releaseDate, label: null },
            ...series.seasons.map(s => ({ date: s.releaseDate, label: `Sezon ${s.season}` }))
        ];
        let best = null;
        candidates.forEach(c => {
            const d = parseLocalDate(c.date);
            if (d && d >= today && (!best || d < best.parsed)) best = { ...c, parsed: d };
        });
        if (best) {
            upcomingItems.push({
                ...series,
                releaseDate: best.date,
                releaseLabel: best.label,
                type: 'series',
                daysUntil: getDaysUntilRelease(best.date)
            });
        }
    });

    moviesData.forEach(movie => {
        const d = parseLocalDate(movie.releaseDate);
        if (d && d >= today) {
            upcomingItems.push({
                ...movie,
                type: 'movie',
                daysUntil: getDaysUntilRelease(movie.releaseDate)
            });
        }
    });

    upcomingItems.sort((a, b) => a.daysUntil - b.daysUntil);
    return upcomingItems;
}

function filterUpcomingContent(filter) {
    currentUpcomingFilter = filter;
    const allUpcoming = getUpcomingContent();
    if (filter === 'series') return allUpcoming.filter(item => item.type === 'series');
    if (filter === 'movies') return allUpcoming.filter(item => item.type === 'movie');
    return allUpcoming;
}

function getUpcomingTimeline() {
    const allUpcoming = getUpcomingContent();
    return {
        thisWeek: allUpcoming.filter(item => item.daysUntil <= 7).length,
        thisMonth: allUpcoming.filter(item => item.daysUntil > 7 && item.daysUntil <= 30).length,
        future: allUpcoming.filter(item => item.daysUntil > 30).length
    };
}

function renderUpcomingReleases() {
    const upcomingItems = filterUpcomingContent(currentUpcomingFilter);
    const timeline = getUpcomingTimeline();

    if (upcomingCount) upcomingCount.textContent = `${upcomingItems.length}`;
    if (thisWeekCount) thisWeekCount.textContent = timeline.thisWeek;
    if (thisMonthCount) thisMonthCount.textContent = timeline.thisMonth;
    if (futureCount) futureCount.textContent = timeline.future;

    upcomingFilterAll.classList.toggle('active', currentUpcomingFilter === 'all');
    upcomingFilterSeries.classList.toggle('active', currentUpcomingFilter === 'series');
    upcomingFilterMovies.classList.toggle('active', currentUpcomingFilter === 'movies');

    if (upcomingItems.length === 0) {
        if (upcomingList) upcomingList.classList.add('hidden');
        if (upcomingEmpty) upcomingEmpty.classList.remove('hidden');
        return;
    }

    if (upcomingList) upcomingList.classList.remove('hidden');
    if (upcomingEmpty) upcomingEmpty.classList.add('hidden');

    upcomingList.innerHTML = upcomingItems.map(item => {
        const badgeInfo = getReleaseBadgeInfo(item.releaseDate);
        const chips = (item.categories || [])
            .map(catId => categoriesData.find(c => c.id === catId))
            .filter(Boolean)
            .map(c => `<span class="meta-chip">${esc(c.name)}</span>`)
            .join('');
        const imageUrl = safeUrl(item.imageUrl);

        return `
            <div class="upcoming-card">
                <div class="upcoming-thumb">
                    ${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(item.name)}" loading="lazy" onerror="handleImageError(this)">` : `<div class="w-full h-full flex items-center justify-center text-[11px] text-white/50">Poster yok</div>`}
                    ${badgeInfo ? `<span class="badge-overlay"><span class="release-badge ${badgeInfo.class}" title="${esc(badgeInfo.fullText)}"><i class="fas fa-calendar-alt"></i> ${esc(badgeInfo.text)}</span></span>` : ''}
                </div>
                <div class="min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white truncate">${esc(item.name)}</h3>
                        <span class="px-2 py-0.5 text-xs font-medium rounded-full ${item.type === 'series' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'}">${item.type === 'series' ? 'Dizi' : 'Film'}</span>
                    </div>
                    ${item.releaseLabel ? `<div class="text-sm text-gray-600 dark:text-gray-400"><i class="fas fa-layer-group mr-1"></i>${esc(item.releaseLabel)}</div>` : ''}
                    ${item.platform ? `<div class="text-sm text-gray-600 dark:text-gray-400"><i class="fas fa-tv mr-1"></i>${esc(item.platform)}</div>` : ''}
                    ${chips ? `<div class="meta-row">${chips}</div>` : ''}
                    ${item.description ? `<p class="upcoming-overview mt-2">${esc(item.description)}</p>` : ''}
                </div>
                <div class="upcoming-footer">
                    <div class="date"><i class="fas fa-calendar-alt"></i> ${esc(formatReleaseDate(item.releaseDate))}</div>
                    <div class="flex items-center gap-2">
                        ${item.imdbRating ? `<span class="pill-imdb"><i class="fas fa-star"></i>${esc(item.imdbRating)}</span>` : ''}
                        ${item.trailerUrl ? `<button class="trailer-btn" data-trailer-url="${esc(item.trailerUrl)}" data-title="${esc(item.name)}" title="Fragmanı İzle"><i class="fab fa-youtube mr-1"></i> İzle</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================================
// Takvim görünümü ve .ics dışa aktarma
// =====================================================================
let upcomingView = 'list';
let calendarMonth = null; // Date, ayın 1'i

// Listedeki tarihli her şey (geçmiş dahil): dizi sezonları, dizi ve film çıkışları
function getDatedReleases() {
    const entries = [];
    seriesData.forEach(series => {
        (series.seasons || []).forEach(season => {
            if (season.releaseDate) {
                entries.push({ date: season.releaseDate, name: series.name, type: 'series', label: `Sezon ${season.season}`, id: series.id });
            }
        });
        // Sezon tarihi yoksa dizinin kendi çıkış tarihini kullan
        if (series.releaseDate && !(series.seasons || []).some(s => s.releaseDate === series.releaseDate)) {
            entries.push({ date: series.releaseDate, name: series.name, type: 'series', label: '', id: series.id });
        }
    });
    moviesData.forEach(movie => {
        if (movie.releaseDate) entries.push({ date: movie.releaseDate, name: movie.name, type: 'movie', label: '', id: movie.id });
    });
    return entries.filter(e => parseLocalDate(e.date)).sort((a, b) => a.date.localeCompare(b.date));
}

function monthTitle(date) {
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calendarTitle');
    if (!grid || !title) return;
    if (!calendarMonth) {
        const now = new Date();
        calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    title.textContent = monthTitle(calendarMonth);

    const byDay = new Map();
    getDatedReleases().forEach(entry => {
        const d = parseLocalDate(entry.date);
        if (d.getFullYear() === calendarMonth.getFullYear() && d.getMonth() === calendarMonth.getMonth()) {
            const key = d.getDate();
            if (!byDay.has(key)) byDay.set(key, []);
            byDay.get(key).push(entry);
        }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    // Hafta pazartesi başlar
    const lead = (first.getDay() + 6) % 7;

    const weekDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const cells = weekDays.map(d => `<div class="calendar-weekday">${d}</div>`);
    for (let i = 0; i < lead; i++) cells.push('<div class="calendar-cell is-empty"></div>');
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
        const items = byDay.get(day) || [];
        const isToday = date.getTime() === today.getTime();
        const isPast = date < today;
        cells.push(`
            <div class="calendar-cell${isToday ? ' is-today' : ''}${isPast ? ' is-past' : ''}${items.length ? ' has-items' : ''}">
                <span class="calendar-day">${day}</span>
                ${items.map(entry => `
                    <button type="button" class="calendar-chip ${entry.type}" data-calendar-open="${esc(entry.type)}:${esc(entry.id)}" title="${esc(entry.name)}${entry.label ? ' — ' + esc(entry.label) : ''}">
                        <i class="fas ${entry.type === 'series' ? 'fa-tv' : 'fa-film'}"></i>
                        <span>${esc(entry.name)}${entry.label ? ` <span class="opacity-70">${esc(entry.label)}</span>` : ''}</span>
                    </button>`).join('')}
            </div>`);
    }
    grid.innerHTML = cells.join('');
}

function setUpcomingView(view) {
    upcomingView = view === 'calendar' ? 'calendar' : 'list';
    try { localStorage.setItem('upcomingView', upcomingView); } catch (_) {}
    const calendar = document.getElementById('upcomingCalendar');
    const isCalendar = upcomingView === 'calendar';
    if (calendar) calendar.classList.toggle('hidden', !isCalendar);
    document.querySelectorAll('[data-upcoming-view]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-upcoming-view') === upcomingView);
    });
    // Liste ve boş durum yalnızca liste görünümünde
    ['upcomingList', 'upcomingEmpty'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('view-hidden', isCalendar);
    });
    if (isCalendar) renderCalendar(); else renderUpcomingReleases();
}

// --- .ics dışa aktarma ---
function icsEscape(text) {
    return String(text || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsDate(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function buildIcs(entries) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Izleme Takip//TR',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:İzleme Takip'
    ];
    entries.forEach((entry, index) => {
        const start = parseLocalDate(entry.date);
        if (!start) return;
        const end = new Date(start);
        end.setDate(end.getDate() + 1); // tüm gün etkinliği: bitiş ertesi gün
        const summary = `${entry.name}${entry.label ? ' — ' + entry.label : ''}`;
        lines.push(
            'BEGIN:VEVENT',
            `UID:izleme-takip-${entry.type}-${entry.id}-${icsDate(start)}-${index}@nurhatmentes.github.io`,
            `DTSTAMP:${stamp}`,
            `DTSTART;VALUE=DATE:${icsDate(start)}`,
            `DTEND;VALUE=DATE:${icsDate(end)}`,
            `SUMMARY:${icsEscape(summary)}`,
            `DESCRIPTION:${icsEscape(entry.type === 'series' ? 'Dizi' : 'Film')} · İzleme Takip`,
            'BEGIN:VALARM',
            'TRIGGER:-P1D',
            'ACTION:DISPLAY',
            `DESCRIPTION:${icsEscape(summary + ' yarın çıkıyor')}`,
            'END:VALARM',
            'END:VEVENT'
        );
    });
    lines.push('END:VCALENDAR');
    // RFC 5545: satırlar CRLF ile ayrılır
    return lines.join('\r\n') + '\r\n';
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportUpcomingIcs() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const entries = getDatedReleases().filter(e => {
        const d = parseLocalDate(e.date);
        return d && d >= today;
    });
    if (!entries.length) {
        showToast('Takvime aktarılacak, tarihi gelecekte olan bir kayıt yok.');
        return;
    }
    downloadBlob(new Blob([buildIcs(entries)], { type: 'text/calendar;charset=utf-8' }), 'izleme-takip-cikislar.ics');
    showToast(`${entries.length} çıkış tarihi .ics dosyasına aktarıldı.`);
}

// =====================================================================
// Takvim aboneliği: .ics dosyasını senkron Gist'ine yazıp sabit adres verir
// =====================================================================
const GIST_ICS_FILE = 'izleme-takip-takvim.ics';

// İçerik değişti mi diye bakmak için ucuz bir özet (djb2)
function cheapHash(text) {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    return String(hash);
}

function upcomingIcsContent() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const entries = getDatedReleases().filter(e => {
        const d = parseLocalDate(e.date);
        return d && d >= today;
    });
    return { ics: buildIcs(entries), count: entries.length };
}

function savedIcsUrl() {
    try { return localStorage.getItem('calendarIcsUrl') || ''; } catch (_) { return ''; }
}

// Gist'in raw adresi iki biçimde olur; sürüm kimliği içermeyeni her zaman son hâli verir
function stableRawUrl(owner, gistId) {
    return `https://gist.githubusercontent.com/${owner}/${gistId}/raw/${GIST_ICS_FILE}`;
}

async function publishCalendarToGist(options = {}) {
    if (!isCloudSyncConfigured()) throw new Error('Önce Senkronizasyon penceresinden GitHub anahtarını kaydet.');
    const { ics, count } = upcomingIcsContent();
    if (!count && !options.allowEmpty) throw new Error('Tarihi gelecekte olan kayıt yok, yayınlanacak bir şey bulunamadı.');

    const gistId = getApiKey('gistId') || await findOrCreateGist();
    const gist = await githubFetch('/gists/' + gistId, {
        method: 'PATCH',
        body: JSON.stringify({ files: { [GIST_ICS_FILE]: { content: ics } } })
    });
    const owner = (gist && gist.owner && gist.owner.login) || '';
    if (!owner) throw new Error('Gist sahibi okunamadı, abonelik adresi oluşturulamadı.');

    const url = stableRawUrl(owner, gistId);
    try {
        __origSetItem('calendarIcsUrl', url);
        __origSetItem('calendarIcsHash', cheapHash(ics));
    } catch (_) {}
    return { url, count };
}

async function unpublishCalendar() {
    const gistId = getApiKey('gistId');
    if (gistId && isCloudSyncConfigured()) {
        // Gist'te dosyayı null yapmak onu siler; diğer dosyalara dokunulmaz
        await githubFetch('/gists/' + gistId, {
            method: 'PATCH',
            body: JSON.stringify({ files: { [GIST_ICS_FILE]: null } })
        });
    }
    ['calendarIcsUrl', 'calendarIcsHash', 'calendarAutoPublish'].forEach(k => {
        try { localStorage.removeItem(k); } catch (_) {}
    });
}

// Senkron sonrası: yayındaysa ve içerik değiştiyse sessizce tazele
async function refreshPublishedCalendar() {
    if (!savedIcsUrl()) return;
    let auto = false;
    try { auto = localStorage.getItem('calendarAutoPublish') === '1'; } catch (_) {}
    if (!auto) return;
    const { ics, count } = upcomingIcsContent();
    let lastHash = '';
    try { lastHash = localStorage.getItem('calendarIcsHash') || ''; } catch (_) {}
    if (cheapHash(ics) === lastHash) return;
    try { await publishCalendarToGist({ allowEmpty: count === 0 }); } catch (_) { /* senkronu bölmemek için sessiz */ }
}

function renderCalendarSub() {
    const statusEl = document.getElementById('calendarSubStatus');
    const linkBox = document.getElementById('calendarSubLink');
    const urlInput = document.getElementById('calendarIcsUrl');
    const webcal = document.getElementById('calendarWebcalLink');
    const unpublishBtn = document.getElementById('unpublishIcsBtn');
    const autoBox = document.getElementById('calendarAutoPublish');
    if (!statusEl) return;

    const url = savedIcsUrl();
    if (autoBox) {
        try { autoBox.checked = localStorage.getItem('calendarAutoPublish') === '1'; } catch (_) {}
    }

    if (!isCloudSyncConfigured()) {
        statusEl.innerHTML = '<i class="fas fa-info-circle mr-1"></i>Bu özellik senkronizasyon için kullandığın GitHub anahtarını kullanır. Henüz bir anahtar kaydetmemişsin.';
    } else if (url) {
        const { count } = upcomingIcsContent();
        statusEl.innerHTML = `<i class="fas fa-circle-check text-emerald-500 mr-1"></i>Yayında. Şu an ${esc(count)} çıkış tarihi gönderiliyor.`;
    } else {
        statusEl.innerHTML = '<i class="fas fa-circle-info mr-1"></i>Henüz yayınlanmadı. "Yayınla" dediğinde Gist\'ine bir takvim dosyası eklenir.';
    }

    if (linkBox) linkBox.classList.toggle('hidden', !url);
    if (unpublishBtn) unpublishBtn.classList.toggle('hidden', !url);
    if (url && urlInput) urlInput.value = url;
    if (url && webcal) webcal.href = url.replace(/^https:/, 'webcal:');
}

function setupCalendarSubscription() {
    const modal = document.getElementById('calendarSubModal');
    const openBtn = document.getElementById('openCalendarSubBtn');
    if (!modal || !openBtn) return;

    openBtn.addEventListener('click', () => {
        renderCalendarSub();
        openModal(modal);
    });
    const closeBtn = document.getElementById('closeCalendarSubModal');
    if (closeBtn) closeBtn.addEventListener('click', () => closeModal(modal));

    const publishBtn = document.getElementById('publishIcsBtn');
    if (publishBtn) publishBtn.addEventListener('click', async () => {
        publishBtn.disabled = true;
        const statusEl = document.getElementById('calendarSubStatus');
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Gist\'e yazılıyor...';
        try {
            const { count } = await publishCalendarToGist();
            renderCalendarSub();
            showToast(`${count} çıkış tarihi yayınlandı.`);
        } catch (err) {
            if (statusEl) statusEl.innerHTML = '<i class="fas fa-triangle-exclamation text-amber-500 mr-1"></i>' + esc(err.message);
        } finally {
            publishBtn.disabled = false;
        }
    });

    const unpublishBtn = document.getElementById('unpublishIcsBtn');
    if (unpublishBtn) unpublishBtn.addEventListener('click', async () => {
        if (!confirm('Takvim dosyası Gist\'ten silinecek ve abonelik adresi çalışmayı bırakacak. Devam edilsin mi?')) return;
        unpublishBtn.disabled = true;
        try {
            await unpublishCalendar();
            renderCalendarSub();
            showToast('Takvim yayından kaldırıldı.');
        } catch (err) {
            showToast('Kaldırılamadı: ' + err.message);
        } finally {
            unpublishBtn.disabled = false;
        }
    });

    const copyBtn = document.getElementById('copyIcsUrlBtn');
    if (copyBtn) copyBtn.addEventListener('click', async () => {
        const input = document.getElementById('calendarIcsUrl');
        if (!input || !input.value) return;
        try {
            await navigator.clipboard.writeText(input.value);
            showToast('Adres kopyalandı.');
        } catch (_) {
            input.select();
            showToast('Kopyalanamadı, adres seçildi: elle kopyalayabilirsin.');
        }
    });

    const autoBox = document.getElementById('calendarAutoPublish');
    if (autoBox) autoBox.addEventListener('change', () => {
        try { localStorage.setItem('calendarAutoPublish', autoBox.checked ? '1' : '0'); } catch (_) {}
        if (autoBox.checked && savedIcsUrl()) refreshPublishedCalendar();
    });
}

function setupUpcomingCalendar() {
    const shiftMonth = delta => {
        if (!calendarMonth) calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + delta, 1);
        renderCalendar();
    };
    const prev = document.getElementById('calendarPrev');
    const next = document.getElementById('calendarNext');
    const todayBtn = document.getElementById('calendarToday');
    if (prev) prev.addEventListener('click', () => shiftMonth(-1));
    if (next) next.addEventListener('click', () => shiftMonth(1));
    if (todayBtn) todayBtn.addEventListener('click', () => {
        const now = new Date();
        calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        renderCalendar();
    });
    document.querySelectorAll('[data-upcoming-view]').forEach(btn => {
        btn.addEventListener('click', () => setUpcomingView(btn.getAttribute('data-upcoming-view')));
    });
    const icsBtn = document.getElementById('exportIcsBtn');
    if (icsBtn) icsBtn.addEventListener('click', exportUpcomingIcs);

    const grid = document.getElementById('calendarGrid');
    if (grid) grid.addEventListener('click', e => {
        const chip = e.target.closest('[data-calendar-open]');
        if (!chip) return;
        const [type, id] = chip.getAttribute('data-calendar-open').split(':');
        if (type === 'series') editSeries(id); else editMovie(id);
    });

    try {
        const saved = localStorage.getItem('upcomingView');
        if (saved === 'calendar') setUpcomingView('calendar');
    } catch (_) {}
}

function getAllTrailerItems() {
    const items = [];
    const add = (type, item) => {
        const videoId = extractYouTubeVideoId(item.trailerUrl);
        if (!videoId) return;
        items.push({
            type,
            name: item.name,
            platform: type === 'series' ? item.platform : null,
            imageUrl: item.imageUrl,
            trailerUrl: item.trailerUrl,
            videoId
        });
    };
    (seriesData || []).forEach(series => add('series', series));
    (moviesData || []).forEach(movie => add('movie', movie));
    return items;
}

function renderTrailersTab() {
    if (!trailersList || !trailersEmpty) return;

    let items = getAllTrailerItems();

    if (currentTrailersFilter === 'series') {
        items = items.filter(i => i.type === 'series');
    } else if (currentTrailersFilter === 'movies') {
        items = items.filter(i => i.type === 'movie');
    }

    const q = trLower(trailersSearchQuery).trim();
    if (q) {
        items = items.filter(i => trLower(i.name).includes(q));
    }

    const byName = (a, b) => (a.name || '').localeCompare((b.name || ''), 'tr');
    if (currentTrailersSort === 'alphabetical') {
        items.sort(byName);
    } else if (currentTrailersSort === 'alphabetical-desc') {
        items.sort((a, b) => byName(b, a));
    } else if (currentTrailersSort === 'type-series-first' || currentTrailersSort === 'type-movies-first') {
        const first = currentTrailersSort === 'type-series-first' ? 'series' : 'movie';
        items.sort((a, b) => {
            const aKey = a.type === first ? 0 : 1;
            const bKey = b.type === first ? 0 : 1;
            return aKey !== bKey ? aKey - bKey : byName(a, b);
        });
    }

    if (trailersCount) trailersCount.textContent = String(items.length);

    if (trailersFilterAll && trailersFilterSeries && trailersFilterMovies) {
        trailersFilterAll.classList.toggle('active', currentTrailersFilter === 'all');
        trailersFilterSeries.classList.toggle('active', currentTrailersFilter === 'series');
        trailersFilterMovies.classList.toggle('active', currentTrailersFilter === 'movies');
    }

    if (items.length === 0) {
        trailersList.innerHTML = '';
        trailersEmpty.classList.remove('hidden');
        return;
    }

    trailersEmpty.classList.add('hidden');

    trailersList.innerHTML = items.map(item => {
        const typePill = item.type === 'series'
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
            : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
        const typeText = item.type === 'series' ? 'Dizi' : 'Film';
        const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(item.videoId)}/hqdefault.jpg`;

        return `
            <div class="bg-white/10 hover:bg-white/20 transition rounded-xl p-3 flex gap-3 items-center cursor-pointer outline-none focus:ring-2 focus:ring-white/30 trailer-preview-item"
                 role="button"
                 tabindex="0"
                 data-trailer-url="${esc(item.trailerUrl)}"
                 data-title="${esc(item.name)}"
                 data-video-id="${esc(item.videoId)}">
                <div class="w-20 h-12 rounded-lg overflow-hidden bg-black/20 flex-shrink-0">
                    <img src="${thumbUrl}" alt="${esc(item.name)}" class="w-full h-full object-cover" loading="lazy" onerror="handleImageError(this)">
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                        <div class="font-semibold text-gray-900 dark:text-white truncate">${esc(item.name)}</div>
                        <span class="px-2 py-0.5 text-xs font-medium rounded-full ${typePill}">${typeText}</span>
                    </div>
                    ${item.platform ? `<div class="text-xs text-gray-600 dark:text-gray-400 truncate"><i class="fas fa-tv mr-1"></i>${esc(item.platform)}</div>` : ''}
                    <div class="text-xs text-gray-600 dark:text-gray-400 mt-1"><i class="fab fa-youtube mr-1"></i>Üstüne gel: oynat • Tıkla: tam aç</div>
                </div>
            </div>
        `;
    }).join('');
}

function stopTrailersPreview(resetInfoText) {
    if (trailersPreviewStartTimer) {
        clearTimeout(trailersPreviewStartTimer);
        trailersPreviewStartTimer = null;
    }

    // Iframe'i temizle
    const container = document.getElementById('trailersPreviewPlayer');
    if (container) {
        container.innerHTML = '';
    }
    trailersPreviewPlayer = null;

    trailersPreviewVideoId = null;
    if (resetInfoText && trailersPreviewInfo) {
        trailersPreviewInfo.textContent = 'Liste üstünde imleç (cursor) ile bir fragmanın üstüne gelince önizleme (preview) oynar. Üzerine tıklayınca tam açılır.';
    }
}

function playTrailersPreview(videoId, title) {
    if (!videoId) return;
    if (trailersPreviewVideoId === videoId) return;
    trailersPreviewVideoId = videoId;

    const container = document.getElementById('trailersPreviewPlayer');
    if (!container) return;

    if (trailersPreviewInfo) {
        trailersPreviewInfo.textContent = `"${title}" önizleme (preview) yükleniyor...`;
    }

    trailersPreviewPlayer = createYouTubeEmbed(container, videoId, {
        title,
        autoplay: true,
        mute: true,
        controls: false,
        onFallback: () => {
            if (trailersPreviewInfo) trailersPreviewInfo.textContent = `"${title}" burada oynatılamıyor; tıklayınca YouTube'da açabilirsiniz.`;
        }
    });

    if (trailersPreviewInfo && trailersPreviewPlayer) {
        trailersPreviewInfo.textContent = `"${title}" önizleme (preview) oynuyor. Tam açmak için tıklayın.`;
    }
}

function scheduleTrailersPreview(videoId, title) {
    if (trailersPreviewStartTimer) {
        clearTimeout(trailersPreviewStartTimer);
        trailersPreviewStartTimer = null;
    }
    trailersPreviewStartTimer = setTimeout(() => {
        playTrailersPreview(videoId, title);
    }, 120);
}

// Kart başlığının yanında çıkış yılı (varsa)
function renderYearBadge(releaseDate) {
    const match = /^(\d{4})/.exec(String(releaseDate || ''));
    return match ? ` <span class="card-year">(${match[1]})</span>` : '';
}

function renderCategoryBadges(categoryIds) {
    return (categoryIds || [])
        .map(catId => categoriesData.find(c => c.id === catId))
        .filter(Boolean)
        .map(c => `<span class="category-badge" style="--cat: ${safeColor(c.color)}">${esc(c.name)}</span>`)
        .join('');
}

function renderTagBadges(tags) {
    return (tags || []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('');
}

function renderReleaseBadge(releaseDate) {
    const badgeInfo = getReleaseBadgeInfo(releaseDate);
    if (!badgeInfo) return '';
    return `<div class="mb-3">
        <div class="release-badge ${badgeInfo.class}" title="${esc(badgeInfo.fullText)}">
            <i class="fas fa-calendar-alt"></i>
            ${esc(badgeInfo.text)}
        </div>
    </div>`;
}

function renderPoster(item, badgeClass, badgeText, options = {}) {
    const imageUrl = safeUrl(item.imageUrl);
    if (!imageUrl) {
        return `<div class="mb-4 ${posterAspect === 'original' ? 'aspect-[2/3]' : posterAspect} poster-wrapper flex items-center justify-center bg-slate-200 dark:bg-slate-700"><i class="fa-solid fa-image text-slate-500 dark:text-slate-300 text-3xl"></i></div>`;
    }
    const aspectClass = posterAspect === 'original' ? 'poster-original' : posterAspect;
    // Fragmanı olan posterlerde imleç bir süre beklerse önizleme oynar (hoverTrailer)
    const previewId = options.hoverTrailer ? extractYouTubeVideoId(item.trailerUrl) : null;
    const previewAttrs = previewId
        ? ` data-hover-trailer="${esc(previewId)}" data-hover-title="${esc(item.name)}"`
        : '';
    return `<div class="mb-4 ${aspectClass} poster-wrapper"${previewAttrs}>
        <span class="poster-badge status-badge ${badgeClass}">${esc(badgeText)}</span>
        <img src="${esc(imageUrl)}" alt="${esc(item.name)}" class="w-full h-full object-cover" loading="lazy" onerror="handleImageError(this)">
        <div class="poster-overlay"></div>
        <div class="poster-info"><span class="title">${esc(item.name)}</span>${item.imdbRating ? `<span class="meta"><i class="fas fa-star text-yellow-400"></i> ${esc(item.imdbRating)}</span>` : ''}</div>
    </div>`;
}

// Tam kart: liste, sabitlenenler penceresi ve detay penceresi aynı şablonu kullanır
function renderSeriesCard(series) {
        const selectKey = 'series:' + String(series.id);
        const isSelected = selectedBulkKeys.has(selectKey);
        const { total: totalEpisodes, watched: watchedEpisodes, progress, status } = getSeriesTotals(series);

        const renderSeasonItem = season => {
            const seasonProgress = season.totalEpisodes > 0 ? (season.watchedEpisodes / season.totalEpisodes) * 100 : 0;
            const seasonStatus = season.totalEpisodes > 0 && season.watchedEpisodes >= season.totalEpisodes ? 'completed'
                : season.watchedEpisodes > 0 ? 'watching'
                    : 'planning';
            const isOpen = openSeasonIds.has(String(season.id));

            return `
                <div class="season-item p-4 mb-2 rounded-lg" data-season-id="${esc(season.id)}">
                    <div class="flex justify-between items-center cursor-pointer season-header">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-chevron-down season-toggle${isOpen ? ' rotate' : ''}"></i>
                            <span class="font-medium">Sezon ${esc(season.season)}</span>
                            <span class="status-badge ${seasonStatus}">${getStatusText(seasonStatus)}</span>
                        </div>
                        <span>${season.watchedEpisodes}/${season.totalEpisodes}</span>
                    </div>
                    <div class="season-content${isOpen ? ' show' : ''}">
                        <div class="content-inner">
                            <div class="mb-2">
                                <div class="flex justify-between text-sm mb-1">
                                    <span>İzlenen Bölüm</span>
                                    <span>${Math.round(seasonProgress)}%</span>
                                </div>
                                <div class="progress-bar">
                                    <div class="progress-fill progress-fill-themed" style="width: ${seasonProgress}%"></div>
                                </div>
                            </div>
                            <div class="flex flex-wrap justify-end gap-2 mt-4">
                                ${season.watchedEpisodes > 0 ? `<button class="btn btn-secondary btn-sm reset-season" data-series-id="${esc(series.id)}" data-season-id="${esc(season.id)}" title="Bu sezonu izlenmedi yap">
                                    <i class="fas fa-eraser"></i>
                                </button>` : ''}
                                ${season.totalEpisodes > 0 && season.watchedEpisodes < season.totalEpisodes ? `<button class="btn btn-secondary btn-sm complete-season" data-series-id="${esc(series.id)}" data-season-id="${esc(season.id)}" title="Sezonun tamamını izledim">
                                    <i class="fas fa-forward-fast mr-1"></i> Sezonu bitir
                                </button>` : ''}
                                <button class="btn btn-secondary btn-sm decrease-episode" data-series-id="${esc(series.id)}" data-season-id="${esc(season.id)}" title="Bir bölüm geri al">
                                    <i class="fas fa-minus"></i>
                                </button>
                                <button class="btn btn-primary btn-sm increase-episode" data-series-id="${esc(series.id)}" data-season-id="${esc(season.id)}" title="Bir bölüm izledim">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        };

        // 3'ten fazla sezon varsa açılır gruplara böl, yoksa düz listele
        const seasonGroups = buildSeasonGroups(series);
        const seasonsHtml = seasonGroups
            ? seasonGroups.map(group => {
                const percent = group.total > 0 ? Math.round((group.watched / group.total) * 100) : 0;
                return `
                <div class="season-group${group.open ? ' is-open' : ''}" data-group-key="${esc(group.key)}">
                    <div class="season-group-header" role="button" tabindex="0" aria-expanded="${group.open ? 'true' : 'false'}">
                        <div class="season-group-top">
                            <i class="fas fa-chevron-down season-toggle${group.open ? ' rotate' : ''}"></i>
                            <span class="season-group-title">${esc(group.label)}</span>
                            <span class="status-badge ${group.status}">${getStatusText(group.status)}</span>
                            <span class="season-group-count">${esc(group.watched)}/${esc(group.total)}<small> %${percent}</small></span>
                        </div>
                        <div class="season-pips">${renderSeasonPips(group)}</div>
                    </div>
                    <div class="season-group-content${group.open ? ' show' : ''}">
                        <div class="season-group-inner">${group.seasons.map(renderSeasonItem).join('')}</div>
                    </div>
                </div>`;
            }).join('')
            : series.seasons.map(renderSeasonItem).join('');

        const categoryBadges = renderCategoryBadges(series.categories);
        const tags = renderTagBadges(series.tags);
        const { next, prev } = getSeriesTotals(series);
        const nextEpisodeHtml = next && status !== 'dropped' ? `
            <div class="next-episode">
                <span><i class="fas fa-forward mr-1 text-indigo-500"></i>Sıradaki: <strong>S${esc(next.season)} · B${next.watchedEpisodes + 1}</strong></span>
                <div class="next-episode-actions">
                    ${prev ? `<button class="btn btn-secondary btn-sm undo-episode" data-series-id="${esc(series.id)}" data-season-id="${esc(prev.id)}" title="Son işaretlediğin bölümü geri al (S${esc(prev.season)} · B${prev.watchedEpisodes})">
                        <i class="fas fa-rotate-left"></i>
                    </button>` : ''}
                    <button class="btn btn-primary btn-sm increase-episode" data-series-id="${esc(series.id)}" data-season-id="${esc(next.id)}" title="Bu bölümü izledim">
                        <i class="fas fa-check mr-1"></i> İzledim
                    </button>
                    <button class="btn btn-secondary btn-sm complete-season" data-series-id="${esc(series.id)}" data-season-id="${esc(next.id)}" title="${esc(next.totalEpisodes - next.watchedEpisodes)} bölümü birden izledim olarak işaretle">
                        <i class="fas fa-forward-fast mr-1"></i> Sezonu bitir
                    </button>
                </div>
            </div>` : '';

        return `
            <div class="series-card card p-6 relative masonry-item${isSelected ? ' bulk-selected' : ''}${series.pinned ? ' is-pinned' : ''}">
                <label class="bulk-select-control" aria-label="Seç">
                    <input type="checkbox" class="bulk-select-checkbox" data-select-key="${esc(selectKey)}" ${isSelected ? 'checked' : ''}>
                </label>
                ${renderPoster(series, status, getStatusText(status))}
                <div class="mb-4">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex items-center space-x-2">
                            <h3 class="text-xl card-title">${esc(series.name)}${renderYearBadge(series.releaseDate)}</h3>
                            ${series.trailerUrl ? `<button class="trailer-btn text-sm" data-trailer-url="${esc(series.trailerUrl)}" data-title="${esc(series.name)}">
                                <i class="fab fa-youtube"></i> Fragman
                            </button>` : ''}
                        </div>
                        <div class="flex space-x-1 ml-2">
                            <button class="pin-icon ${series.pinned ? 'is-pinned' : ''}" data-id="${esc(series.id)}" title="${series.pinned ? 'Sabitlemeyi kaldır' : 'En üste sabitle'}" aria-pressed="${series.pinned ? 'true' : 'false'}">
                                <i class="fas fa-thumbtack"></i>
                            </button>
                            <button class="similar-icon text-amber-500 hover:text-amber-600" data-id="${esc(series.id)}" title="Benzerlerini öner">
                                <i class="fas fa-lightbulb"></i>
                            </button>
                            <button class="edit-icon text-blue-500 hover:text-blue-700" data-id="${esc(series.id)}" title="Düzenle">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="delete-icon text-red-500 hover:text-red-700" data-id="${esc(series.id)}" title="Sil">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="text-gray-600 dark:text-gray-300 mb-2">
                        <span class="status-badge ${status}">${getStatusText(status)}</span>
                        ${renderRewatchBadge(series)}
                        ${series.platform ? `<span class="ml-2">${esc(series.platform)}</span>` : ''}
                        ${series.imdbRating ? `<span class="ml-2 text-yellow-500" title="IMDb/TMDB puanı"><i class="fas fa-star"></i> ${esc(series.imdbRating)}</span>` : ''}
                        ${series.myRating != null ? `<span class="ml-2 text-pink-500" title="Benim puanım"><i class="fas fa-heart"></i> ${esc(series.myRating)}</span>` : ''}
                    </div>
                    ${series.notes ? `<p class="my-note">${esc(series.notes)}</p>` : ''}
                    ${series.description ? `<p class="text-sm text-gray-600 dark:text-gray-400 mb-2 description-text">${esc(series.description)}</p>` : ''}
                </div>
                ${nextEpisodeHtml}
                ${!next && status === 'completed' ? `
                <div class="next-episode">
                    <span><i class="fas fa-circle-check mr-1 text-emerald-500"></i>Bu diziyi bitirdin</span>
                    <div class="next-episode-actions">
                        <button class="btn btn-secondary btn-sm start-rewatch" data-series-id="${esc(series.id)}" title="İlerlemeyi sıfırlayıp baştan izlemeye başla">
                            <i class="fas fa-rotate-right mr-1"></i> Baştan izle
                        </button>
                    </div>
                </div>` : ''}
                ${renderProviders(series)}

                ${categoryBadges ? `<div class="mb-3">${categoryBadges}</div>` : ''}
                ${tags ? `<div class="mb-3">${tags}</div>` : ''}
                ${series.releaseDate ? renderReleaseBadge(series.releaseDate) : ''}

                <div class="mb-4">
                    <div class="flex justify-between text-sm mb-1">
                        <span>Toplam Bölüm: ${watchedEpisodes}/${totalEpisodes}</span>
                        <span>${Math.round(progress)}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill progress-fill-themed" style="width: ${progress}%"></div>
                    </div>
                </div>

                <div class="seasons-container">
                    ${seasonsHtml}
                </div>
            </div>
        `;
}

// Tam kart: liste, sabitlenenler penceresi ve detay penceresi aynı şablonu kullanır
function renderMovieCard(movie) {
        const selectKey = 'movie:' + String(movie.id);
        const isSelected = selectedBulkKeys.has(selectKey);
        const categoryBadges = renderCategoryBadges(movie.categories);
        const tags = renderTagBadges(movie.tags);
        const statusClass = movie.watched ? 'completed' : 'planning';
        const statusText = movie.watched ? 'İzlendi' : 'İzlenecek';

        return `
            <div class="movie-card card p-6 relative masonry-item${isSelected ? ' bulk-selected' : ''}${movie.pinned ? ' is-pinned' : ''}">
                <label class="bulk-select-control" aria-label="Seç">
                    <input type="checkbox" class="bulk-select-checkbox" data-select-key="${esc(selectKey)}" ${isSelected ? 'checked' : ''}>
                </label>
                ${renderPoster(movie, statusClass, statusText, { hoverTrailer: true })}
                <div class="mb-4">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex items-center space-x-2">
                            <h3 class="text-xl card-title">${esc(movie.name)}${renderYearBadge(movie.releaseDate)}</h3>
                            ${movie.trailerUrl ? `<button class="trailer-btn text-sm" data-trailer-url="${esc(movie.trailerUrl)}" data-title="${esc(movie.name)}">
                                <i class="fab fa-youtube"></i> Fragman
                            </button>` : ''}
                        </div>
                        <div class="flex space-x-1 ml-2">
                            <button class="pin-icon ${movie.pinned ? 'is-pinned' : ''}" data-id="${esc(movie.id)}" title="${movie.pinned ? 'Sabitlemeyi kaldır' : 'En üste sabitle'}" aria-pressed="${movie.pinned ? 'true' : 'false'}">
                                <i class="fas fa-thumbtack"></i>
                            </button>
                            <button class="similar-icon text-amber-500 hover:text-amber-600" data-id="${esc(movie.id)}" title="Benzerlerini öner">
                                <i class="fas fa-lightbulb"></i>
                            </button>
                            <button class="edit-icon text-blue-500 hover:text-blue-700" data-id="${esc(movie.id)}" title="Düzenle">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="delete-icon text-red-500 hover:text-red-700" data-id="${esc(movie.id)}" title="Sil">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="text-gray-600 dark:text-gray-300 mb-2">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                        ${renderRewatchBadge(movie)}
                        ${movie.platform && movie.platform !== 'Diğer' ? `<span class="ml-2">${esc(movie.platform)}</span>` : ''}
                        ${movie.imdbRating ? `<span class="ml-2 text-yellow-500" title="IMDb/TMDB puanı"><i class="fas fa-star"></i> ${esc(movie.imdbRating)}</span>` : ''}
                        ${movie.myRating != null ? `<span class="ml-2 text-pink-500" title="Benim puanım"><i class="fas fa-heart"></i> ${esc(movie.myRating)}</span>` : ''}
                    </div>
                    ${movie.notes ? `<p class="my-note">${esc(movie.notes)}</p>` : ''}
                    ${movie.description ? `<p class="text-sm text-gray-600 dark:text-gray-400 mb-2 description-text">${esc(movie.description)}</p>` : ''}
                </div>

                ${categoryBadges ? `<div class="mb-3">${categoryBadges}</div>` : ''}
                ${tags ? `<div class="mb-3">${tags}</div>` : ''}
                ${movie.releaseDate ? renderReleaseBadge(movie.releaseDate) : ''}
                ${renderProviders(movie)}

                <div class="flex items-center mb-4 gap-2 flex-wrap">
                    <span class="watched-indicator ${movie.watched ? 'watched' : 'unwatched'}"></span>
                    <span class="text-sm">${movie.watched ? 'İzlendi' : 'Henüz izlenmedi'}</span>
                    ${movie.watched ? `<button class="btn btn-secondary btn-sm movie-rewatch ml-auto" data-id="${esc(movie.id)}" title="Bir kez daha izledim olarak kaydet">
                        <i class="fas fa-rotate-right mr-1"></i> Tekrar izledim
                    </button>` : ''}
                </div>

                ${movie.updatedAt ? `<div class="text-sm text-gray-600 dark:text-gray-300">
                    <i class="fas fa-clock mr-1"></i> ${esc(formatDate(movie.updatedAt))}
                </div>` : ''}
            </div>
        `;
}

function renderSeriesList() {
    if (filteredSeriesData.length === 0) {
        seriesList.innerHTML = '';
        renderPinnedRow('series', []);
        seriesEmpty.classList.remove('hidden');
        const emptyTitle = seriesEmpty.querySelector('h3');
        if (emptyTitle) emptyTitle.textContent = seriesData.length === 0 ? 'Henüz dizi eklemediniz' : 'Filtreye uyan dizi bulunamadı';
        return;
    }

    seriesEmpty.classList.add('hidden');

    seriesList.className = layoutMode === 'masonry'
        ? `masonry masonry-${seriesView}-col`
        : `grid gap-6 grid-${seriesView}-col`;

    renderPinnedRow('series', filteredSeriesData.filter(x => x.pinned));
    seriesList.innerHTML = filteredSeriesData.filter(x => !x.pinned).map(renderSeriesCard).join('');
}

// Sabitlenenler şeridi: listenin üstünde, yan yana duran kompakt kartlar.
// Tam kart kullanılsaydı (14 sezonluk dizi gibi) uzun bir kart satırın boyunu
// belirler, kısa kartların altında koca boşluklar kalırdı.
function renderPinnedCard(kind, item) {
    const poster = safeUrl(item.imageUrl);
    const isSeries = kind === 'series';
    const totals = isSeries ? getSeriesTotals(item) : null;
    const status = isSeries ? totals.status : (item.watched ? 'completed' : 'planning');
    const statusText = isSeries ? getStatusText(status) : (item.watched ? 'İzlendi' : 'İzlenecek');
    const next = isSeries ? totals.next : null;
    const percent = isSeries ? Math.round(totals.progress) : (item.watched ? 100 : 0);

    const action = isSeries
        ? (next ? `<button class="btn btn-primary btn-sm increase-episode" data-series-id="${esc(item.id)}" data-season-id="${esc(next.id)}" title="S${esc(next.season)} · B${esc(next.watchedEpisodes + 1)} izlendi">
                <i class="fas fa-check mr-1"></i> S${esc(next.season)}·B${esc(next.watchedEpisodes + 1)}
            </button>` : '')
        : (!item.watched ? `<button class="btn btn-primary btn-sm pinned-watch" data-id="${esc(item.id)}" title="İzledim olarak işaretle">
                <i class="fas fa-check mr-1"></i> İzledim
            </button>` : '');

    return `
        <div class="pinned-card ${isSeries ? 'series-card' : 'movie-card'} is-pinned" data-id="${esc(item.id)}">
            <label class="bulk-select-control" aria-label="Seç">
                <input type="checkbox" class="bulk-select-checkbox" data-select-key="${esc((isSeries ? 'series:' : 'movie:') + item.id)}" ${selectedBulkKeys.has((isSeries ? 'series:' : 'movie:') + item.id) ? 'checked' : ''}>
            </label>
            <button type="button" class="pinned-poster" data-open-card="${esc(item.id)}" title="${esc(item.name)} kartını aç">
                ${poster
                    ? `<img src="${esc(poster)}" alt="${esc(item.name)}" loading="lazy" onerror="handleImageError(this)">`
                    : '<span class="pinned-noposter"><i class="fa-solid fa-image"></i></span>'}
            </button>
            <div class="pinned-body">
                <div class="pinned-head">
                    <button type="button" class="pinned-title" data-open-card="${esc(item.id)}">${esc(item.name)}${renderYearBadge(item.releaseDate)}</button>
                    <button class="pin-icon is-pinned" data-id="${esc(item.id)}" title="Sabitlemeyi kaldır" aria-pressed="true"><i class="fas fa-thumbtack"></i></button>
                </div>
                <div class="pinned-meta">
                    <span class="status-badge ${status}">${esc(statusText)}</span>
                    ${renderRewatchBadge(item)}
                    ${item.imdbRating ? `<span class="text-yellow-500"><i class="fas fa-star"></i> ${esc(item.imdbRating)}</span>` : ''}
                    ${item.platform && item.platform !== 'Diğer' ? `<span class="opacity-75">${esc(item.platform)}</span>` : ''}
                </div>
                ${isSeries ? `<div class="pinned-progress" title="${esc(totals.watched)}/${esc(totals.total)} bölüm">
                    <div class="progress-bar"><div class="progress-fill progress-fill-themed" style="width: ${percent}%"></div></div>
                    <span>${esc(totals.watched)}/${esc(totals.total)}</span>
                </div>` : ''}
                ${action ? `<div class="pinned-actions">${action}</div>` : ''}
            </div>
        </div>`;
}

function renderPinnedRow(kind, items) {
    const wrap = document.getElementById(kind + 'PinnedWrap');
    const list = document.getElementById(kind + 'PinnedList');
    const count = document.getElementById(kind + 'PinnedCount');
    if (!wrap || !list) return;
    if (!items.length) {
        wrap.classList.add('hidden');
        list.innerHTML = '';
        return;
    }
    wrap.classList.remove('hidden');
    list.className = 'pinned-grid';
    if (count) count.textContent = String(items.length);
    list.innerHTML = items.map(item => renderPinnedCard(kind === 'series' ? 'series' : 'movie', item)).join('');
}

// =====================================================================
// Kart detayı: sabitlenenler şeridinden tam kartı pencerede açar
// =====================================================================
let cardDetail = null; // { kind: 'series' | 'movie', id }

function findCardItem(kind, id) {
    const list = kind === 'series' ? seriesData : moviesData;
    return list.find(x => String(x.id) === String(id)) || null;
}

// Liste her yeniden çizildiğinde penceredeki kart da tazelenir
function renderCardDetail() {
    if (!cardDetail) return;
    const body = document.getElementById('cardDetailBody');
    if (!body) return;
    const item = findCardItem(cardDetail.kind, cardDetail.id);
    if (!item) {
        closeCardDetail();
        return;
    }
    body.innerHTML = cardDetail.kind === 'series' ? renderSeriesCard(item) : renderMovieCard(item);
}

function openCardDetail(kind, id) {
    if (!findCardItem(kind, id)) return;
    cardDetail = { kind, id };
    renderCardDetail();
    const modal = document.getElementById('cardDetailModal');
    if (modal) openModal(modal);
}

function closeCardDetail() {
    cardDetail = null;
    const modal = document.getElementById('cardDetailModal');
    if (modal && modal.classList.contains('active')) closeModal(modal);
}

function setupCardDetail() {
    const closeBtn = document.getElementById('closeCardDetailModal');
    if (closeBtn) closeBtn.addEventListener('click', closeCardDetail);
}

// =====================================================================
// Poster üstünde bekleyince fragman önizlemesi (filmler)
// =====================================================================
const POSTER_PREVIEW_DELAY = 2000; // ms: kazara geçişlerde oynamasın diye
let posterPreviewTimer = null;
let posterPreviewPending = null;
let posterPreviewWrapper = null;

function canHoverPreview() {
    // Dokunmatik ekranda "üstüne gelme" yok; tek dokunuş istemeden fragman açmasın
    return typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches;
}

function stopPosterPreview() {
    if (posterPreviewTimer) {
        clearTimeout(posterPreviewTimer);
        posterPreviewTimer = null;
    }
    posterPreviewPending = null;
    if (posterPreviewWrapper) {
        const layer = posterPreviewWrapper.querySelector('.poster-preview');
        if (layer) layer.remove();
        posterPreviewWrapper.classList.remove('is-previewing');
        posterPreviewWrapper = null;
    }
}

function startPosterPreview(wrapper) {
    if (!wrapper || !wrapper.isConnected) return;
    const videoId = wrapper.getAttribute('data-hover-trailer');
    if (!videoId) return;

    posterPreviewWrapper = wrapper;
    wrapper.classList.add('is-previewing');
    const layer = document.createElement('div');
    layer.className = 'poster-preview';
    wrapper.appendChild(layer);

    createYouTubeEmbed(layer, videoId, {
        title: wrapper.getAttribute('data-hover-title') || '',
        autoplay: true,
        mute: true,
        controls: false,
        // Gömülemiyorsa posteri olduğu gibi bırak
        onFallback: () => stopPosterPreview()
    });
}

function setupPosterPreview() {
    if (!canHoverPreview()) return;

    document.addEventListener('mouseover', function (e) {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const wrapper = target.closest('[data-hover-trailer]');
        if (!wrapper) {
            if (posterPreviewWrapper || posterPreviewPending) stopPosterPreview();
            return;
        }
        if (wrapper === posterPreviewWrapper || wrapper === posterPreviewPending) return;
        stopPosterPreview();
        posterPreviewPending = wrapper;
        posterPreviewTimer = setTimeout(() => {
            posterPreviewTimer = null;
            posterPreviewPending = null;
            startPosterPreview(wrapper);
        }, POSTER_PREVIEW_DELAY);
    }, { passive: true });

    // Kartın tamamen dışına çıkınca durdur (iframe'e geçişte durdurma)
    document.addEventListener('mouseout', function (e) {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const wrapper = target.closest('[data-hover-trailer]');
        if (!wrapper || (wrapper !== posterPreviewWrapper && wrapper !== posterPreviewPending)) return;
        const to = e.relatedTarget;
        if (to && to instanceof Node && wrapper.contains(to)) return;
        stopPosterPreview();
    }, { passive: true });

    // Sekme/pencere değişince veya sayfa arkaplana alınınca sustur
    window.addEventListener('blur', stopPosterPreview);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopPosterPreview(); });
}

// Render movies list
function renderMoviesList() {
    stopPosterPreview();
    if (filteredMoviesData.length === 0) {
        moviesList.innerHTML = '';
        renderPinnedRow('movies', []);
        moviesEmpty.classList.remove('hidden');
        const emptyTitle = moviesEmpty.querySelector('h3');
        if (emptyTitle) emptyTitle.textContent = moviesData.length === 0 ? 'Henüz film eklemediniz' : 'Filtreye uyan film bulunamadı';
        return;
    }

    moviesEmpty.classList.add('hidden');

    moviesList.className = layoutMode === 'masonry'
        ? `masonry masonry-${moviesView}-col`
        : `grid gap-6 grid-${moviesView}-col`;

    renderPinnedRow('movies', filteredMoviesData.filter(x => x.pinned));
    moviesList.innerHTML = filteredMoviesData.filter(x => !x.pinned).map(renderMovieCard).join('');
}

// Render categories list
function renderCategoriesList() {
    categoriesList.innerHTML = categoriesData.map(category => `
        <div class="card p-4 flex items-center justify-between category-card" data-id="${esc(category.id)}">
            <div class="flex items-center">
                <span class="w-4 h-4 rounded-full mr-3" style="background-color: ${safeColor(category.color)}"></span>
                <span class="font-medium">${esc(category.name)}</span>
            </div>
            <div class="flex items-center gap-3">
                <button class="text-blue-600 hover:text-blue-800 edit-category" data-id="${esc(category.id)}" title="Düzenle">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="text-red-500 hover:text-red-700 delete-category" data-id="${esc(category.id)}" title="Sil">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.delete-category').forEach(btn => {
        btn.addEventListener('click', function () {
            deleteCategory(Number(this.getAttribute('data-id')));
        });
    });

    document.querySelectorAll('.edit-category').forEach(btn => {
        btn.addEventListener('click', function () {
            startEditCategory(Number(this.getAttribute('data-id')));
        });
    });
}

// Render tags list
function renderTagsList() {
    const tagsList = document.getElementById('tagsList');
    if (!tagsList) return;

    // Birleştirilmiş etiket kümesi: global tagsData + içeriklerdeki etiketler
    const suggestionSet = new Set();

    if (Array.isArray(tagsData) && tagsData.length > 0) {
        tagsData.forEach(t => {
            if (t && typeof t.name === 'string' && t.name.trim() !== '') {
                suggestionSet.add(t.name.trim());
            }
        });
    }
    if (Array.isArray(seriesData) && seriesData.length > 0) {
        seriesData.forEach(s => {
            if (s && Array.isArray(s.tags)) {
                s.tags.forEach(tag => {
                    if (typeof tag === 'string' && tag.trim() !== '') {
                        suggestionSet.add(tag.trim());
                    }
                });
            }
        });
    }
    if (Array.isArray(moviesData) && moviesData.length > 0) {
        moviesData.forEach(m => {
            if (m && Array.isArray(m.tags)) {
                m.tags.forEach(tag => {
                    if (typeof tag === 'string' && tag.trim() !== '') {
                        suggestionSet.add(tag.trim());
                    }
                });
            }
        });
    }

    tagsList.innerHTML = Array.from(suggestionSet)
        .sort((a, b) => a.localeCompare(b, 'tr'))
        .map(name => {
            const tagObj = tagsData.find(t => t && t.name === name);
            const idAttr = tagObj ? `data-id="${esc(tagObj.id)}"` : '';
            const deleteBtn = tagObj ? `
                <button class="text-red-500 hover:text-red-700 delete-tag" data-id="${esc(tagObj.id)}" title="Sil">
                    <i class="fas fa-trash"></i>
                </button>
            ` : '';
            return `
                <div class="card p-4 flex items-center justify-between">
                    <span class="font-medium">${esc(name)}</span>
                    <div class="flex items-center gap-3">
                        <button class="text-blue-600 hover:text-blue-800 edit-tag" ${idAttr} data-name="${esc(name)}" title="Düzenle">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${deleteBtn}
                    </div>
                </div>
            `;
        }).join('');

    // Edit ve delete eventleri
    document.querySelectorAll('.edit-tag').forEach(btn => {
        btn.addEventListener('click', function () {
            const oldName = this.getAttribute('data-name');
            const idVal = this.getAttribute('data-id');
            const newName = prompt('Yeni etiket adı:', oldName);
            if (newName === null) return;
            const trimmed = newName.trim();
            if (!trimmed) { alert('Etiket adı boş olamaz.'); return; }
            if (trimmed === oldName) return;

            if (idVal) {
                editTag(Number(idVal), oldName, trimmed);
            } else {
                editTagByName(oldName, trimmed);
            }
        });
    });

    document.querySelectorAll('.delete-tag').forEach(btn => {
        btn.addEventListener('click', function () {
            deleteTag(Number(this.getAttribute('data-id')));
        });
    });
}

// Etiket düzenle (ID ile)
function editTag(id, oldName, newName) {
    const idx = tagsData.findIndex(t => t.id === id);
    if (idx === -1) return;

    const duplicate = tagsData.find(t => t.name === newName && t.id !== id);
    if (duplicate) {
        const proceed = confirm('Aynı isimde başka bir etiket var. Birleştirilsin mi?');
        if (!proceed) return;
        // Eski kayıt silinir, yeni isim zaten mevcut
        tagsData.splice(idx, 1);
    } else {
        tagsData[idx].name = newName;
    }

    renameTagInCollections(oldName, newName);

    localStorage.setItem('tagsData', JSON.stringify(tagsData));
    localStorage.setItem('seriesData', JSON.stringify(seriesData));
    localStorage.setItem('moviesData', JSON.stringify(moviesData));

    renderTagsList();
    renderTagOptions('seriesTagOptions', 'seriesTagsContainer');
    renderTagOptions('movieTagOptions', 'movieTagsContainer');
    updateSeriesTagCloud();
    updateMoviesTagCloud();
    filterSeries();
    filterMovies();
}

// Etiket düzenle (sadece isim ile - global liste yoksa)
function editTagByName(oldName, newName) {
    const found = tagsData.find(t => t.name === oldName);
    const duplicate = tagsData.find(t => t.name === newName);

    if (found) {
        if (!duplicate || duplicate.id === found.id) {
            found.name = newName;
        } else {
            // Duplicate mevcutsa, eskiyi kaldır
            tagsData = tagsData.filter(t => t.id !== found.id);
        }
    } else {
        if (!duplicate) {
            tagsData.push({ id: newId(), name: newName });
        }
    }

    renameTagInCollections(oldName, newName);

    localStorage.setItem('tagsData', JSON.stringify(tagsData));
    localStorage.setItem('seriesData', JSON.stringify(seriesData));
    localStorage.setItem('moviesData', JSON.stringify(moviesData));

    renderTagsList();
    renderTagOptions('seriesTagOptions', 'seriesTagsContainer');
    renderTagOptions('movieTagOptions', 'movieTagsContainer');
    updateSeriesTagCloud();
    updateMoviesTagCloud();
    filterSeries();
    filterMovies();
}

// Koleksiyonlarda etiket adını değiştir
function renameTagInCollections(oldName, newName) {
    seriesData.forEach(s => {
        if (Array.isArray(s.tags)) {
            s.tags = s.tags.map(tag => tag === oldName ? newName : tag);
            s.tags = Array.from(new Set(s.tags));
        }
    });
    moviesData.forEach(m => {
        if (Array.isArray(m.tags)) {
            m.tags = m.tags.map(tag => tag === oldName ? newName : tag);
            m.tags = Array.from(new Set(m.tags));
        }
    });
}

// Tüm mevcut etiketleri global etiketlere dönüştür
function promoteAllTags() {
    const namesSet = new Set();
    // Global tags
    if (Array.isArray(tagsData)) {
        tagsData.forEach(t => {
            if (t && typeof t.name === 'string') {
                const n = t.name.trim();
                if (n) namesSet.add(n);
            }
        });
    }
    // Series tags
    if (Array.isArray(seriesData)) {
        seriesData.forEach(s => {
            if (Array.isArray(s.tags)) {
                s.tags.forEach(tag => {
                    if (typeof tag === 'string') {
                        const n = tag.trim();
                        if (n) namesSet.add(n);
                    }
                });
            }
        });
    }
    // Movies tags
    if (Array.isArray(moviesData)) {
        moviesData.forEach(m => {
            if (Array.isArray(m.tags)) {
                m.tags.forEach(tag => {
                    if (typeof tag === 'string') {
                        const n = tag.trim();
                        if (n) namesSet.add(n);
                    }
                });
            }
        });
    }

    const existingNames = new Set(Array.isArray(tagsData) ? tagsData.map(t => t.name) : []);
    let addedCount = 0;

    Array.from(namesSet).sort((a, b) => a.localeCompare(b, 'tr')).forEach(name => {
        if (!existingNames.has(name)) {
            tagsData.push({ id: newId(), name });
            addedCount++;
        }
    });

    localStorage.setItem('tagsData', JSON.stringify(tagsData));

    renderTagsList();
    renderTagOptions('seriesTagOptions', 'seriesTagsContainer');
    renderTagOptions('movieTagOptions', 'movieTagsContainer');
    updateSeriesTagCloud();
    updateMoviesTagCloud();
    filterSeries();
    filterMovies();

    alert(addedCount > 0 ? ('Tüm etiketler global hale getirildi (' + addedCount + ' yeni).') : 'Tüm etiketler zaten global.');
}

// Update series category selector
function updateSeriesCategorySelector() {
    const selector = document.getElementById('seriesCategorySelector');
    selector.innerHTML = categoriesData.map(category => `
        <div class="category-option" data-id="${esc(category.id)}" style="--cat: ${safeColor(category.color)}">
            ${esc(category.name)}
        </div>
    `).join('');

    // Add event listeners
    document.querySelectorAll('#seriesCategorySelector .category-option').forEach(option => {
        option.addEventListener('click', function () {
            this.classList.toggle('selected');
        });
    });
}

// Update movie category selector
function updateMovieCategorySelector() {
    const selector = document.getElementById('movieCategorySelector');
    selector.innerHTML = categoriesData.map(category => `
        <div class="category-option" data-id="${esc(category.id)}" style="--cat: ${safeColor(category.color)}">
            ${esc(category.name)}
        </div>
    `).join('');

    // Add event listeners
    document.querySelectorAll('#movieCategorySelector .category-option').forEach(option => {
        option.addEventListener('click', function () {
            this.classList.toggle('selected');
        });
    });
}

// Update series tag cloud
function updateSeriesTagCloud() {
    const allTags = new Set();
    seriesData.forEach(series => {
        if (series.tags && series.tags.length > 0) {
            series.tags.forEach(tag => allTags.add(tag));
        }
    });

    if (allTags.size > 0) {
        seriesTagCloud.classList.remove('hidden'); // Ensure visibility
        seriesTagCloud.style.display = 'flex'; // Explicitly set display
        seriesTagCloud.innerHTML = Array.from(allTags).map(tag =>
            `<span class="tag cursor-pointer" data-tag="${esc(tag)}">${esc(tag)}</span>`
        ).join('');

        // Add event listeners
        document.querySelectorAll('#seriesTagCloud .tag').forEach(tagEl => {
            tagEl.addEventListener('click', function () {
                const tag = this.getAttribute('data-tag');
                searchSeries.value = tag;
                filterSeries();
            });
        });
    } else {
        seriesTagCloud.classList.add('hidden');
        seriesTagCloud.style.display = 'none'; // Ensure hidden state
    }
}

// Update movies tag cloud
function updateMoviesTagCloud() {
    const allTags = new Set();
    moviesData.forEach(movie => {
        if (movie.tags && movie.tags.length > 0) {
            movie.tags.forEach(tag => allTags.add(tag));
        }
    });

    if (allTags.size > 0) {
        moviesTagCloud.classList.remove('hidden'); // Ensure visibility
        moviesTagCloud.style.display = 'flex'; // Explicitly set display
        moviesTagCloud.innerHTML = Array.from(allTags).map(tag =>
            `<span class="tag cursor-pointer" data-tag="${esc(tag)}">${esc(tag)}</span>`
        ).join('');

        // Add event listeners
        document.querySelectorAll('#moviesTagCloud .tag').forEach(tagEl => {
            tagEl.addEventListener('click', function () {
                const tag = this.getAttribute('data-tag');
                searchMovies.value = tag;
                filterMovies();
            });
        });
    } else {
        moviesTagCloud.classList.add('hidden');
        moviesTagCloud.style.display = 'none'; // Ensure hidden state
    }
}

// Get series status (tüm sezonlara göre)
function getSeriesStatus(series) {
    return getSeriesTotals(series).status;
}

// Get status text
function getStatusText(status) {
    switch (status) {
        case 'completed': return 'Tamamlandı';
        case 'watching': return 'İzleniyor';
        case 'planning': return 'Planlanıyor';
        case 'paused': return 'Duraklatıldı';
        case 'dropped': return 'Bırakıldı';
        default: return '';
    }
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    if (!dateString || isNaN(date.getTime())) return '';
    return date.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Release date utility functions
function formatReleaseDate(dateString) {
    const date = parseLocalDate(dateString);
    if (!date) return '';
    const months = [
        'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function getDaysUntilRelease(dateString) {
    if (!dateString) return null;
    const releaseDate = parseLocalDate(dateString);
    if (!releaseDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((releaseDate - today) / (1000 * 60 * 60 * 24));
}

function getReleaseBadgeInfo(releaseDate) {
    if (!releaseDate) return null;

    const daysUntil = getDaysUntilRelease(releaseDate);
    const formattedDate = formatReleaseDate(releaseDate);
    if (daysUntil === null) return null;

    if (daysUntil < 0) {
        return {
            text: 'Yayında',
            class: 'release-badge-live',
            fullText: formattedDate
        };
    } else if (daysUntil === 0) {
        return {
            text: 'Bugün Çıkıyor',
            class: 'release-badge-today',
            fullText: formattedDate
        };
    } else if (daysUntil === 1) {
        return {
            text: '1 gün kaldı',
            class: 'release-badge-soon',
            fullText: formattedDate
        };
    } else if (daysUntil <= 7) {
        return {
            text: `${daysUntil} gün kaldı`,
            class: 'release-badge-soon',
            fullText: formattedDate
        };
    } else if (daysUntil <= 30) {
        return {
            text: `${daysUntil} gün kaldı`,
            class: 'release-badge-upcoming',
            fullText: formattedDate
        };
    } else {
        return {
            text: formattedDate,
            class: 'release-badge-far',
            fullText: `${daysUntil} gün kaldı`
        };
    }
}



// YouTube URL'den video ID'sini çıkar (tek tanım)
function extractYouTubeVideoId(url) {
    if (!url || typeof url !== 'string') return null;
    url = url.trim();
    if (url.length === 11 && /^[a-zA-Z0-9_-]+$/.test(url)) {
        return url;
    }
    const patterns = [
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*[&?]v=([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

function openYouTubeInNewTab(url) {
    if (!url) return;
    try {
        window.open(url, '_blank', 'noopener');
    } catch (_) {}
}

function getYouTubePlayerErrorText(code) {
    const c = Number(code);
    if (!Number.isFinite(c)) return 'YouTube oynatıcı hata verdi.';
    if (c === 2) return `Geçersiz video kimliği (invalid video id). (Hata ${c})`;
    if (c === 5) return `HTML5 oynatıcı hatası (HTML5 player error). (Hata ${c})`;
    if (c === 100) return `Video bulunamadı veya gizli (not found / private). (Hata ${c})`;
    if (c === 101 || c === 150) return `Video sahibi başka sitelerde oynatılmasına izin vermiyor. (Hata ${c})`;
    if (c === 152 || c === 153) return `YouTube bu sayfadan oynatmayı kabul etmedi (sayfa adresi iletilemedi). (Hata ${c})`;
    return `YouTube oynatıcı hatası. (Hata ${c})`;
}

function resetTrailerPlayerState() {
    trailerHasStarted = false;
    if (trailerStartTimeout) {
        clearTimeout(trailerStartTimeout);
        trailerStartTimeout = null;
    }

    // Iframe'i temizle
    const playerContainer = document.getElementById('trailerPlayer');
    if (playerContainer) {
        playerContainer.innerHTML = '';
    }
    trailerPlayer = null;
}

// YouTube fragman modal'ını göster
function showTrailerModal(videoUrl, title) {
    const videoId = extractYouTubeVideoId(videoUrl);
    if (!videoId) {
        alert('Geçerli bir YouTube URL\'si veya video ID\'si giriniz.');
        return;
    }

    resetTrailerPlayerState();

    const isFileProtocol = window.location.protocol === 'file:';
    const watchUrl = 'https://www.youtube.com/watch?v=' + encodeURIComponent(videoId);

    const modal = document.createElement('div');
    modal.className = 'modal trailer-modal active';
    modal.style.display = 'flex';

    const initialInfoText = isFileProtocol
        ? 'Bu sayfa tarayıcıda dosya (file://) olarak açılıyor. Bazı tarayıcılarda YouTube oynatıcı burada çalışmayabilir. Video başlamazsa veya hata alırsanız aşağıdaki buton ile fragmanı YouTube\'da açabilirsiniz.'
        : 'Video birkaç saniye içinde başlamazsa aşağıdaki buton ile fragmanı YouTube\'da açabilirsiniz.';

    modal.innerHTML = `
        <div class="trailer-modal-content">
            <div class="modal-header">
                <h3>${esc(title)} - Fragman</h3>
                <div class="flex items-center gap-2">
                    <a href="${watchUrl}" target="_blank" rel="noopener" class="trailer-btn" style="text-decoration: none;">
                        <i class="fab fa-youtube mr-1"></i> YouTube'da aç
                    </a>
                    <button class="close-trailer-btn">&times;</button>
                </div>
            </div>
            <div class="trailer-container">
                <div id="trailerPlayer"></div>
            </div>
            <div class="trailer-info">${initialInfoText}</div>
        </div>
    `;

    document.body.appendChild(modal);

    const infoEl = modal.querySelector('.trailer-info');

    const closeBtn = modal.querySelector('.close-trailer-btn');
    closeBtn.addEventListener('click', () => closeModal(modal));

    const playerContainer = modal.querySelector('#trailerPlayer');
    if (!playerContainer) {
        return;
    }

    trailerPlayer = createYouTubeEmbed(playerContainer, videoId, {
        title,
        autoplay: true,
        mute: false,
        controls: true,
        onFallback: code => {
            if (infoEl) infoEl.textContent = code ? getYouTubePlayerErrorText(code) : initialInfoText;
        }
    });

    // Bilgi metnini birkaç saniye sonra temizle (hata olursa yedek görünüm kendi mesajını yazar)
    if (infoEl && !isFileProtocol) {
        setTimeout(() => {
            if (!playerContainer.querySelector('.yt-fallback')) infoEl.textContent = '';
        }, 3000);
    }
}

// --- YouTube gömme yardımcıları ---
// Hata 153: YouTube, oynatıcıyı hangi sitenin açtığını (Referer) öğrenemediğinde verir.
// Bu yüzden origin/widget_referrer gönderiyoruz; file:// sayfalarında gömme hiç çalışmadığı için
// doğrudan kapak görseli + "YouTube'da izle" gösteriyoruz.
function canEmbedYouTube() {
    return window.location.protocol === 'https:' || window.location.protocol === 'http:';
}

function buildYouTubeEmbedUrl(videoId, { autoplay, mute, controls }) {
    const params = new URLSearchParams({
        autoplay: autoplay ? '1' : '0',
        mute: mute ? '1' : '0',
        controls: controls ? '1' : '0',
        rel: '0',
        modestbranding: '1',
        playsinline: '1',
        enablejsapi: '1',
        origin: window.location.origin,
        widget_referrer: window.location.href
    });
    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

function renderYouTubeFallback(container, videoId, title, code) {
    const watchUrl = 'https://www.youtube.com/watch?v=' + encodeURIComponent(videoId);
    const message = code
        ? getYouTubePlayerErrorText(code)
        : 'Sayfa dosya (file://) olarak açıldığı için video burada oynatılamıyor.';
    container.innerHTML = `
        <a class="yt-fallback" href="${esc(watchUrl)}" target="_blank" rel="noopener" title="YouTube'da izle">
            <img src="https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg" alt="${esc(title || '')}" onerror="handleImageError(this)">
            <span class="yt-fallback-overlay">
                <span class="yt-fallback-play"><i class="fab fa-youtube"></i></span>
                <span class="yt-fallback-text">YouTube'da izle</span>
                <span class="yt-fallback-note">${esc(message)}</span>
            </span>
        </a>
    `;
}

function createYouTubeEmbed(container, videoId, { title, autoplay, mute, controls, onFallback }) {
    container.innerHTML = '';
    if (!canEmbedYouTube()) {
        renderYouTubeFallback(container, videoId, title, null);
        if (onFallback) onFallback(null);
        return null;
    }

    const iframe = document.createElement('iframe');
    iframe.width = '100%';
    iframe.height = '100%';
    iframe.src = buildYouTubeEmbedUrl(videoId, { autoplay, mute, controls });
    iframe.title = title ? `${title} - YouTube` : 'YouTube video player';
    iframe.frameBorder = '0';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allowFullscreen = true;
    iframe.__ytFallback = code => {
        if (!iframe.isConnected) return;
        renderYouTubeFallback(container, videoId, title, code);
        if (onFallback) onFallback(code);
    };
    // Oynatıcıdan olay (hata) mesajları almak için dinlemeye başla
    iframe.addEventListener('load', () => {
        try {
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: videoId, channel: 'widget' }), 'https://www.youtube.com');
        } catch (_) {}
    });
    container.appendChild(iframe);
    return iframe;
}

// YouTube oynatıcısı hata verirse (ör. 101/150/153) siyah ekran yerine yedek görünüme geç
window.addEventListener('message', event => {
    if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(event.origin)) return;
    let data = event.data;
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) { return; }
    }
    if (!data || data.event !== 'onError') return;
    document.querySelectorAll('iframe').forEach(frame => {
        if (frame.contentWindow === event.source && typeof frame.__ytFallback === 'function') {
            frame.__ytFallback(data.info);
        }
    });
});

// =====================================================================
// Arama içinde filtreler: y:2008  platform:netflix  etiket:gizem  puan:>8
// =====================================================================
const SEARCH_FILTER_KEYS = {
    y: 'year', yil: 'year', yıl: 'year',
    p: 'platform', platform: 'platform',
    k: 'category', kategori: 'category', tür: 'category', tur: 'category',
    e: 'tag', etiket: 'tag',
    d: 'status', durum: 'status',
    puan: 'rating',
    benim: 'myRating',
    tekrar: 'rewatch'
};

const STATUS_ALIASES = {
    planlanıyor: 'planning', planlanan: 'planning', planlaniyor: 'planning',
    izleniyor: 'watching', izlenen: 'watching',
    tamamlandı: 'completed', tamamlanan: 'completed', tamamlandi: 'completed', bitti: 'completed', bitmiş: 'completed',
    duraklatıldı: 'paused', duraklatilan: 'paused', duraklatıldi: 'paused', duraklatılan: 'paused',
    bırakıldı: 'dropped', bırakılan: 'dropped', birakildi: 'dropped', birakilan: 'dropped',
    izlendi: 'watched', izlenmedi: 'unwatched'
};

// "y:2008", 'etiket:"bilim kurgu"' ve serbest metni ayırır
function parseSearchQuery(raw) {
    const filters = [];
    const words = [];
    // anahtar:"boşluklu değer" | "tırnaklı metin" | tek kelime
    const tokenPattern = /[^\s:]+:"[^"]*"|"[^"]*"|\S+/g;
    const tokens = String(raw || '').match(tokenPattern) || [];

    tokens.forEach(token => {
        const colon = token.indexOf(':');
        if (colon > 0 && token[0] !== '"') {
            const key = SEARCH_FILTER_KEYS[trLower(token.slice(0, colon))];
            let value = token.slice(colon + 1).replace(/^"|"$/g, '').trim();
            if (key && value) {
                const match = /^(>=|<=|>|<)?\s*(.+)$/.exec(value);
                filters.push({ key, op: match[1] || '', value: trLower(match[2]) });
                return;
            }
        }
        words.push(token.replace(/^"|"$/g, ''));
    });

    return { text: trLower(words.join(' ')).trim(), filters };
}

function compareNumber(actual, op, expected) {
    const target = parseFloat(String(expected).replace(',', '.'));
    if (!Number.isFinite(target)) return false;
    if (actual == null) return false;
    const value = Number(actual);
    if (op === '>') return value > target;
    if (op === '<') return value < target;
    if (op === '>=') return value >= target;
    if (op === '<=') return value <= target;
    return Math.abs(value - target) < 0.0001;
}

function matchesSearchFilter(item, filter, kind) {
    const { key, op, value } = filter;

    if (key === 'year') {
        const year = (item.releaseDate || '').slice(0, 4);
        if (!year) return false;
        const range = /^(\d{4})\s*-\s*(\d{4})$/.exec(value);
        if (range) return Number(year) >= Number(range[1]) && Number(year) <= Number(range[2]);
        if (op) return compareNumber(year, op, value);
        return year === value;
    }

    if (key === 'platform') {
        const names = [item.platform || '', ...PROVIDER_KINDS.flatMap(k => (item.providers && item.providers[k]) || [])];
        return names.some(name => trLower(name).includes(value));
    }

    if (key === 'category') {
        return (item.categories || []).some(id => {
            const cat = categoriesData.find(c => c.id === id);
            return cat && trLower(cat.name).includes(value);
        });
    }

    if (key === 'tag') return (item.tags || []).some(tag => trLower(tag).includes(value));

    if (key === 'status') {
        const wanted = STATUS_ALIASES[value] || value;
        if (kind === 'series') return getSeriesStatus(item) === wanted;
        if (wanted === 'watched' || wanted === 'completed') return !!item.watched;
        if (wanted === 'unwatched' || wanted === 'planning') return !item.watched;
        return false;
    }

    if (key === 'rating') return compareNumber(item.imdbRating, op, value);
    if (key === 'myRating') return compareNumber(item.myRating, op, value);
    if (key === 'rewatch') return compareNumber(normalizeCount(item.rewatchCount), op || '>=', value);

    return true;
}

function matchesSearchQuery(item, query, kind) {
    if (!matchesSearchTerm(item, query.text)) return false;
    return query.filters.every(filter => matchesSearchFilter(item, filter, kind));
}

function matchesSearchTerm(item, term) {
    if (!term) return true;
    if (trLower(item.name).includes(term)) return true;
    if (trLower(item.description).includes(term)) return true;
    if (item.platform && trLower(item.platform).includes(term)) return true;
    if ((item.tags || []).some(tag => trLower(tag).includes(term))) return true;
    return (item.categories || []).some(catId => {
        const cat = categoriesData.find(c => c.id === catId);
        return cat && trLower(cat.name).includes(term);
    });
}

// Filter series
function filterSeries() {
    const query = parseSearchQuery(searchSeries.value);

    filteredSeriesData = seriesData.filter(series => {
        if (!matchesSearchQuery(series, query, 'series')) return false;
        if (currentSeriesFilter !== 'all' && getSeriesStatus(series) !== currentSeriesFilter) return false;
        if (currentSeriesCategory && !(series.categories || []).includes(currentSeriesCategory)) return false;
        if (currentSeriesPlatform && (series.platform || 'Diğer') !== currentSeriesPlatform) return false;
        return true;
    });

    const seriesSortSelect = document.getElementById('seriesSortSelect');
    sortSeries(seriesSortSelect ? seriesSortSelect.value : 'recent');
    renderCardDetail();
}

// --- Platform filtresi ---
let currentSeriesPlatform = '';
let currentMoviesPlatform = '';
try {
    currentSeriesPlatform = localStorage.getItem('seriesPlatformFilter') || '';
    currentMoviesPlatform = localStorage.getItem('moviesPlatformFilter') || '';
} catch (_) { /* depolama kapalıysa filtresiz başla */ }

// Seçenekleri mevcut verideki platformlardan üret; seçili platform artık yoksa filtreyi temizle
function refreshPlatformFilters() {
    [
        { id: 'seriesPlatformFilter', list: seriesData, current: currentSeriesPlatform, set: v => { currentSeriesPlatform = v; } },
        { id: 'moviesPlatformFilter', list: moviesData, current: currentMoviesPlatform, set: v => { currentMoviesPlatform = v; } }
    ].forEach(({ id, list, current, set }) => {
        const select = document.getElementById(id);
        if (!select) return;
        const counts = new Map();
        list.forEach(item => {
            const name = item.platform || 'Diğer';
            counts.set(name, (counts.get(name) || 0) + 1);
        });
        const names = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b, 'tr'));
        if (current && !counts.has(current)) {
            set('');
            current = '';
        }
        select.innerHTML = `<option value="">Tümü (${list.length})</option>` +
            names.map(n => `<option value="${esc(n)}">${esc(n)} (${counts.get(n)})</option>`).join('');
        select.value = current;
    });
}

function setupPlatformFilters() {
    const bind = (id, storageKey, apply) => {
        const select = document.getElementById(id);
        if (!select) return;
        select.addEventListener('change', () => {
            apply(select.value);
            try { localStorage.setItem(storageKey, select.value); } catch (_) {}
        });
    };
    bind('seriesPlatformFilter', 'seriesPlatformFilter', value => { currentSeriesPlatform = value; filterSeries(); });
    bind('moviesPlatformFilter', 'moviesPlatformFilter', value => { currentMoviesPlatform = value; filterMovies(); });
}

// Filter movies
function filterMovies() {
    const query = parseSearchQuery(searchMovies.value);

    filteredMoviesData = moviesData.filter(movie => {
        if (!matchesSearchQuery(movie, query, 'movie')) return false;
        if (currentMoviesFilter === 'watched' && !movie.watched) return false;
        if (currentMoviesFilter === 'not-watched' && movie.watched) return false;
        if (currentMoviesCategory && !(movie.categories || []).includes(currentMoviesCategory)) return false;
        if (currentMoviesPlatform && (movie.platform || 'Diğer') !== currentMoviesPlatform) return false;
        return true;
    });

    const moviesSortSelect = document.getElementById('moviesSortSelect');
    sortMovies(moviesSortSelect ? moviesSortSelect.value : 'recent');
    renderCardDetail();
}

function setTagsInContainer(containerId, inputId, tags) {
    const tagsContainer = document.getElementById(containerId);
    tagsContainer.innerHTML = '';
    (tags || []).forEach(tag => tagsContainer.appendChild(createTagElement(tag, tagsContainer, true)));
    const input = document.createElement('input');
    input.type = 'text';
    input.id = inputId;
    input.className = 'tag-input';
    input.placeholder = 'Etiket ekle ve Enter\'a bas';
    tagsContainer.appendChild(input);
    initTagInput(inputId, containerId);
}

function setSelectedCategories(selectorId, categoryIds) {
    document.querySelectorAll(`#${selectorId} .category-option`).forEach(option => {
        const catId = Number(option.getAttribute('data-id'));
        option.classList.toggle('selected', (categoryIds || []).includes(catId));
    });
}

function setPlatformValue(selectId, platform) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const value = platform || 'Netflix';
    if (!Array.from(select.options).some(o => o.value === value)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    }
    select.value = value;
}

function openModal(modal) {
    modal.classList.add('active');
    const first = modal.querySelector('input[type="text"]:not([type="hidden"])');
    if (first) setTimeout(() => first.focus(), 50);
}

// Add new series
function addSeries(prefillName) {
    document.getElementById('seriesForm').reset();
    document.getElementById('seriesModalTitle').textContent = 'Dizi Ekle';
    document.getElementById('seriesId').value = '';
    document.getElementById('seriesName').value = typeof prefillName === 'string' ? prefillName : '';
    setPlatformValue('seriesPlatform', 'Netflix');
    setSelectedCategories('seriesCategorySelector', []);
    setTagsInContainer('seriesTagsContainer', 'seriesTagsInput', []);
    renderSeasonForms([{ season: 1, totalEpisodes: '', watchedEpisodes: 0 }]);
    if (typeof resetAutoFill === 'function') resetAutoFill('series');
    openModal(seriesModal);
}

// Edit series
function editSeries(id) {
    const series = findSeries(id);
    if (!series) return;

    document.getElementById('seriesForm').reset();
    document.getElementById('seriesModalTitle').textContent = 'Diziyi Düzenle';
    document.getElementById('seriesId').value = series.id;
    document.getElementById('seriesName').value = series.name;
    setPlatformValue('seriesPlatform', series.platform);
    document.getElementById('seriesTrailerUrl').value = series.trailerUrl || '';
    document.getElementById('seriesImdbRating').value = series.imdbRating != null ? series.imdbRating : '';
    document.getElementById('seriesDescription').value = series.description || '';
    document.getElementById('seriesImageUrl').value = series.imageUrl || '';
    document.getElementById('seriesReleaseDate').value = series.releaseDate || '';
    document.getElementById('seriesMyRating').value = series.myRating != null ? series.myRating : '';
    document.getElementById('seriesNotes').value = series.notes || '';
    document.getElementById('seriesRewatch').value = series.rewatchCount || '';
    document.getElementById('seriesUserStatus').value = series.userStatus || '';
    setSelectedCategories('seriesCategorySelector', series.categories);
    setTagsInContainer('seriesTagsContainer', 'seriesTagsInput', series.tags);
    renderSeasonForms(series.seasons);
    if (typeof resetAutoFill === 'function') resetAutoFill('series');
    openModal(seriesModal);
}

// Add new movie
function addMovie(prefillName) {
    document.getElementById('movieForm').reset();
    document.getElementById('movieModalTitle').textContent = 'Film Ekle';
    document.getElementById('movieId').value = '';
    document.getElementById('movieName').value = typeof prefillName === 'string' ? prefillName : '';
    setPlatformValue('moviePlatform', 'Netflix');
    setSelectedCategories('movieCategorySelector', []);
    setTagsInContainer('movieTagsContainer', 'movieTagsInput', []);
    if (typeof resetAutoFill === 'function') resetAutoFill('movie');
    openModal(movieModal);
}

// Edit movie
function editMovie(id) {
    const movie = moviesData.find(m => String(m.id) === String(id));
    if (!movie) return;

    document.getElementById('movieForm').reset();
    document.getElementById('movieModalTitle').textContent = 'Filmi Düzenle';
    document.getElementById('movieId').value = movie.id;
    document.getElementById('movieName').value = movie.name;
    document.getElementById('movieWatched').checked = !!movie.watched;
    document.getElementById('movieTrailerUrl').value = movie.trailerUrl || '';
    document.getElementById('movieImdbRating').value = movie.imdbRating != null ? movie.imdbRating : '';
    document.getElementById('movieDescription').value = movie.description || '';
    document.getElementById('movieImageUrl').value = movie.imageUrl || '';
    document.getElementById('movieReleaseDate').value = movie.releaseDate || '';
    document.getElementById('movieMyRating').value = movie.myRating != null ? movie.myRating : '';
    document.getElementById('movieNotes').value = movie.notes || '';
    document.getElementById('movieRewatch').value = movie.rewatchCount || '';
    setPlatformValue('moviePlatform', movie.platform || 'Diğer');
    setSelectedCategories('movieCategorySelector', movie.categories);
    setTagsInContainer('movieTagsContainer', 'movieTagsInput', movie.tags);
    if (typeof resetAutoFill === 'function') resetAutoFill('movie');
    openModal(movieModal);
}

// Add new category
function addCategory() {
    const name = document.getElementById('newCategoryName').value.trim();
    const color = document.getElementById('newCategoryColor').value;

    if (!name) {
        alert('Lütfen bir kategori adı girin.');
        return;
    }
    if (categoriesData.some(c => trLower(c.name) === trLower(name))) {
        alert('Bu isimde bir kategori zaten var.');
        return;
    }

    categoriesData.push({
        id: newId(),
        name: name,
        color: safeColor(color)
    });

    localStorage.setItem('categoriesData', JSON.stringify(categoriesData));

    // Reset form
    document.getElementById('newCategoryName').value = '';
    document.getElementById('newCategoryColor').value = '#6366f1';

    // Update UI
    renderCategoriesList();
    updateSeriesCategorySelector();
    updateMovieCategorySelector();
    renderCategoryFilters();
}

// Edit category (name and color)
function editCategory(id) {
    const category = categoriesData.find(c => c.id === id);
    if (!category) {
        alert('Kategori bulunamadı.');
        return;
    }

    const newName = prompt('Yeni kategori adını girin:', category.name);
    if (newName === null) return; // Kullanıcı iptal etti
    const trimmedName = newName.trim();
    if (!trimmedName) {
        alert('Kategori adı boş olamaz.');
        return;
    }

    const newColor = prompt('Yeni kategori rengini girin (#RRGGBB):', category.color);
    if (newColor === null) return; // Kullanıcı iptal etti
    const colorTrimmed = newColor.trim();
    const hexRegex = /^#([0-9A-Fa-f]{6})$/;
    if (!hexRegex.test(colorTrimmed)) {
        alert('Lütfen #RRGGBB formatında geçerli bir renk girin.');
        return;
    }

    category.name = trimmedName;
    category.color = colorTrimmed;

    localStorage.setItem('categoriesData', JSON.stringify(categoriesData));

    // UI ve bağlı bileşenleri güncelle
    renderCategoriesList();
    updateSeriesCategorySelector();
    updateMovieCategorySelector();
    renderCategoryFilters();
    // İçerik kartlarındaki rozetleri güncellemek için listeleri yeniden çiz
    if (typeof renderSeriesList === 'function') renderSeriesList();
    if (typeof renderMoviesList === 'function') renderMoviesList();
}

// Inline edit: start and save functions
function startEditCategory(id) {
    const category = categoriesData.find(c => c.id === id);
    const card = document.querySelector(`#categoriesList .category-card[data-id="${id}"]`);
    if (!category || !card) return;

    card.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
            <div class="form-group">
                <label for="editCategoryName_${id}">Kategori Adı</label>
                <input type="text" id="editCategoryName_${id}" class="form-control" value="${esc(category.name)}" placeholder="Kategori adı">
            </div>
            <div class="form-group">
                <label for="editCategoryColor_${id}">Renk</label>
                <input type="color" id="editCategoryColor_${id}" class="form-control color-picker" value="${safeColor(category.color)}">
            </div>
            <div class="form-group flex items-end gap-2">
                <button class="btn btn-primary save-category" data-id="${id}">
                    <i class="fas fa-save mr-2"></i> Kaydet
                </button>
                <button class="btn btn-secondary cancel-category" data-id="${id}">İptal</button>
            </div>
        </div>
    `;

    const saveBtn = card.querySelector('.save-category');
    const cancelBtn = card.querySelector('.cancel-category');
    if (saveBtn) {
        saveBtn.addEventListener('click', function () {
            const id = parseInt(this.getAttribute('data-id'));
            saveCategoryEdit(id);
        });
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
            renderCategoriesList();
        });
    }
}

function saveCategoryEdit(id) {
    const nameInput = document.getElementById(`editCategoryName_${id}`);
    const colorInput = document.getElementById(`editCategoryColor_${id}`);
    const name = nameInput ? nameInput.value.trim() : '';
    const color = colorInput ? colorInput.value : '';

    if (!name) {
        alert('Kategori adı boş olamaz.');
        return;
    }

    const hexRegex = /^#([0-9A-Fa-f]{6})$/;
    if (!hexRegex.test(color)) {
        alert('Lütfen #RRGGBB formatında geçerli bir renk girin.');
        return;
    }

    const category = categoriesData.find(c => c.id === id);
    if (!category) {
        alert('Kategori bulunamadı.');
        return;
    }

    category.name = name;
    category.color = color;

    localStorage.setItem('categoriesData', JSON.stringify(categoriesData));

    // UI güncellemeleri
    renderCategoriesList();
    updateSeriesCategorySelector();
    updateMovieCategorySelector();
    renderCategoryFilters();
    if (typeof renderSeriesList === 'function') renderSeriesList();
    if (typeof renderMoviesList === 'function') renderMoviesList();
}

// Delete category
function deleteCategory(id) {
    if (confirm('Bu kategoriyi silmek istediğinize emin misiniz? Bu kategoriye sahip tüm içeriklerden bu kategori kaldırılacak.')) {
        // Kategoriyi içeriklerden kaldır
        seriesData.forEach(series => {
            if (series.categories) {
                series.categories = series.categories.filter(catId => catId !== id);
            }
        });

        moviesData.forEach(movie => {
            if (movie.categories) {
                movie.categories = movie.categories.filter(catId => catId !== id);
            }
        });

        // Kategoriyi sil
        categoriesData = categoriesData.filter(c => c.id !== id);
        markDeleted('categories', id);
        if (currentSeriesCategory === id) currentSeriesCategory = null;
        if (currentMoviesCategory === id) currentMoviesCategory = null;

        // LocalStorage'ı güncelle
        localStorage.setItem('seriesData', JSON.stringify(seriesData));
        localStorage.setItem('moviesData', JSON.stringify(moviesData));
        localStorage.setItem('categoriesData', JSON.stringify(categoriesData));

        // UI'ı güncelle
        renderSeriesList();
        renderMoviesList();
        renderCategoriesList();
        updateSeriesCategorySelector();
        updateMovieCategorySelector();
        renderCategoryFilters();
    }
}

// Add new tag
function addTag() {
    const name = document.getElementById('newTagName').value.trim();

    if (!name) {
        alert('Lütfen bir etiket adı girin.');
        return;
    }

    if (tagsData.some(t => t.name === name)) {
        alert('Bu etiket zaten var.');
        return;
    }
    tagsData.push({
        id: newId(),
        name: name
    });

    localStorage.setItem('tagsData', JSON.stringify(tagsData));

    // Reset form
    document.getElementById('newTagName').value = '';

    // Update UI
    renderTagsList();
    // Refresh suggestion chips in modals
    renderTagOptions('seriesTagOptions', 'seriesTagsContainer');
    renderTagOptions('movieTagOptions', 'movieTagsContainer');
}

// Delete tag (remove from global and all series/movies)
function deleteTag(id) {
    const tagObj = tagsData.find(t => t.id === id);
    const tagName = tagObj ? tagObj.name : null;
    if (!tagName) {
        if (!confirm('Global listede bulunamadı. Yine de tüm içerikten silinsin mi?')) return;
    } else {
        if (!confirm('Bu etiket global listeden ve tüm dizi/film içeriklerinden silinecek. Emin misiniz?')) return;
    }

    // Remove from global list
    tagsData = tagsData.filter(t => t.id !== id);
    markDeleted('tags', id);

    // Remove from series and movies
    if (tagName) {
        if (Array.isArray(seriesData)) {
            seriesData.forEach(s => {
                if (Array.isArray(s.tags)) {
                    s.tags = s.tags.filter(tag => tag !== tagName);
                }
            });
        }
        if (Array.isArray(moviesData)) {
            moviesData.forEach(m => {
                if (Array.isArray(m.tags)) {
                    m.tags = m.tags.filter(tag => tag !== tagName);
                }
            });
        }
    }

    // Persist
    localStorage.setItem('tagsData', JSON.stringify(tagsData));
    localStorage.setItem('seriesData', JSON.stringify(seriesData));
    localStorage.setItem('moviesData', JSON.stringify(moviesData));

    // Refresh UI
    renderTagsList();
    renderTagOptions('seriesTagOptions', 'seriesTagsContainer');
    renderTagOptions('movieTagOptions', 'movieTagsContainer');
    updateSeriesTagCloud();
    updateMoviesTagCloud();
    filterSeries();
    filterMovies();
}

// Initialize tag input
function initTagInput(inputId, containerId) {
    const input = document.getElementById(inputId);
    const container = document.getElementById(containerId);

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && this.value.trim() !== '') {
            e.preventDefault();

            const tag = this.value.trim();
            const already = Array.from(container.querySelectorAll('.tag')).some(t => t.getAttribute('data-tag') === tag);
            if (!already) container.insertBefore(createTagElement(tag, container, true), this);
            this.value = '';
        }
    });

    // Existing tags don't need delete buttons automatically added

    // If there are global tags, render suggestion chips (for series/movie modals)
    const suggestionsId = inputId === 'seriesTagsInput' ? 'seriesTagOptions' : (inputId === 'movieTagsInput' ? 'movieTagOptions' : null);
    if (suggestionsId) renderTagOptions(suggestionsId, containerId);
}

// Render selectable tag options under modal inputs
function renderTagOptions(optionsContainerId, targetContainerId) {
    const optionsEl = document.getElementById(optionsContainerId);
    if (!optionsEl) return;

    // Clear existing
    optionsEl.innerHTML = '';

    // Build unified suggestion set from global tags and existing series/movies
    const suggestionSet = new Set();
    // Global tags defined in Tags tab
    if (Array.isArray(tagsData) && tagsData.length > 0) {
        tagsData.forEach(t => {
            if (t && typeof t.name === 'string' && t.name.trim() !== '') {
                suggestionSet.add(t.name.trim());
            }
        });
    }
    // Tags from existing series
    if (Array.isArray(seriesData) && seriesData.length > 0) {
        seriesData.forEach(s => {
            if (s && Array.isArray(s.tags)) {
                s.tags.forEach(tag => {
                    if (typeof tag === 'string' && tag.trim() !== '') {
                        suggestionSet.add(tag.trim());
                    }
                });
            }
        });
    }
    // Tags from existing movies
    if (Array.isArray(moviesData) && moviesData.length > 0) {
        moviesData.forEach(m => {
            if (m && Array.isArray(m.tags)) {
                m.tags.forEach(tag => {
                    if (typeof tag === 'string' && tag.trim() !== '') {
                        suggestionSet.add(tag.trim());
                    }
                });
            }
        });
    }

    // Render suggestion chips (sorted for consistency)
    Array.from(suggestionSet).sort((a, b) => a.localeCompare(b, 'tr')).forEach(tagName => {
        const chip = document.createElement('span');
        chip.className = 'tag';
        chip.textContent = tagName;
        chip.setAttribute('data-tag', tagName);

        chip.addEventListener('click', function (e) {
            e.stopPropagation();
            const container = document.getElementById(targetContainerId);
            // If already selected (there's a .tag with same text), remove it
            const exists = Array.from(container.querySelectorAll('.tag')).some(t => t.getAttribute('data-tag') === tagName);
            if (exists) {
                // remove first matching tag element (ignore delete button text)
                const toRemove = Array.from(container.querySelectorAll('.tag')).find(t => t.getAttribute('data-tag') === tagName);
                if (toRemove) container.removeChild(toRemove);
            } else {
                const tagEl = createTagElement(tagName, container, true);
                // Insert before input if present
                const input = container.querySelector('.tag-input');
                if (input) container.insertBefore(tagEl, input);
                else container.appendChild(tagEl);
            }
        });

        optionsEl.appendChild(chip);
    });
}

// Create tag element with optional delete functionality
function createTagElement(tag, container, showDeleteButton = true) {
    const tagEl = document.createElement('span');
    tagEl.className = 'tag';
    tagEl.textContent = tag;
    tagEl.setAttribute('data-tag', tag);

    if (showDeleteButton) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'ml-1 opacity-60 hover:opacity-100';
        deleteBtn.title = 'Etiketi kaldır';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            container.removeChild(tagEl);
        });
        tagEl.appendChild(deleteBtn);
    }

    return tagEl;
}

// Sezon düzenleyici (hem ekleme hem düzenleme modunda kullanılır)
function createSeasonFormRow(season) {
    const row = document.createElement('div');
    row.className = 'season-form-item';
    if (season && season.id != null) row.setAttribute('data-season-id', season.id);
    if (season && season.releaseDate) row.setAttribute('data-release-date', season.releaseDate);
    row.innerHTML = `
        <div class="season-form-header">
            <span class="season-form-title">Sezon</span>
            <button type="button" class="remove-season-btn" title="Sezonu kaldır">
                <i class="fas fa-times"></i> Kaldır
            </button>
        </div>
        <div class="season-form-fields">
            <div>
                <label class="text-sm">Sezon No</label>
                <input type="number" class="form-control season-number" min="0" required>
            </div>
            <div>
                <label class="text-sm">Toplam Bölüm</label>
                <input type="number" class="form-control season-total-episodes" min="1" required>
            </div>
            <div>
                <label class="text-sm">İzlenen Bölüm</label>
                <input type="number" class="form-control season-watched-episodes" min="0">
            </div>
        </div>
    `;
    row.querySelector('.season-number').value = season && season.season !== undefined ? season.season : '';
    row.querySelector('.season-total-episodes').value = season && season.totalEpisodes ? season.totalEpisodes : '';
    row.querySelector('.season-watched-episodes').value = season && season.watchedEpisodes ? season.watchedEpisodes : 0;
    row.querySelector('.remove-season-btn').addEventListener('click', () => {
        const container = document.getElementById('seasonsContainer');
        if (container.querySelectorAll('.season-form-item').length <= 1) {
            alert('Dizinin en az bir sezonu olmalı.');
            return;
        }
        row.remove();
    });
    return row;
}

function renderSeasonForms(seasons) {
    const container = document.getElementById('seasonsContainer');
    container.innerHTML = '';
    (seasons && seasons.length ? seasons : [{ season: 1 }]).forEach(season => {
        container.appendChild(createSeasonFormRow(season));
    });
}

function addSeasonForm() {
    const container = document.getElementById('seasonsContainer');
    const numbers = Array.from(container.querySelectorAll('.season-number')).map(i => toInt(i.value));
    const next = numbers.length ? Math.max(...numbers) + 1 : 1;
    const row = createSeasonFormRow({ season: next, totalEpisodes: '', watchedEpisodes: 0 });
    container.appendChild(row);
    row.querySelector('.season-total-episodes').focus();
}

function getSeasonsFromForm() {
    return Array.from(document.querySelectorAll('#seasonsContainer .season-form-item')).map(item => {
        const idAttr = item.getAttribute('data-season-id');
        return {
            id: idAttr ? (Number(idAttr) || idAttr) : null,
            season: toInt(item.querySelector('.season-number').value),
            totalEpisodes: toInt(item.querySelector('.season-total-episodes').value),
            watchedEpisodes: toInt(item.querySelector('.season-watched-episodes').value),
            releaseDate: item.getAttribute('data-release-date') || null
        };
    });
}

// Get selected categories from selector
function getSelectedCategories(selectorId) {
    const selected = [];
    document.querySelectorAll(`#${selectorId} .category-option.selected`).forEach(option => {
        selected.push(Number(option.getAttribute('data-id')));
    });
    return selected;
}

// Get tags from container
function getTagsFromContainer(containerId) {
    const tags = [];
    document.querySelectorAll(`#${containerId} .tag`).forEach(tagEl => {
        const tag = (tagEl.getAttribute('data-tag') || tagEl.textContent || '').trim();
        if (tag && !tags.includes(tag)) tags.push(tag);
    });
    return tags;
}

// Poster yedekleme: görseller küçültülüp (JPEG) yedek dosyasına gömülür; geri yüklemede
// service worker'ın görsel önbelleğine (sw.js'deki IMG_CACHE ile aynı ad) konur.
const POSTER_CACHE_NAME = 'izleme-takip-posters-v1';
const POSTER_BACKUP_WIDTH = 342;
const POSTER_BACKUP_CONCURRENCY = 6;

function collectPosterUrls() {
    const urls = new Set();
    [...seriesData, ...moviesData].forEach(item => {
        const url = safeUrl(item.imageUrl);
        if (url) urls.add(url);
    });
    return Array.from(urls);
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('okunamadı'));
        reader.readAsDataURL(blob);
    });
}

// Görseli en çok POSTER_BACKUP_WIDTH piksel genişliğe indirip JPEG data URL'e çevirir
async function posterBlobToDataUrl(blob) {
    if (typeof createImageBitmap !== 'function') return blobToDataUrl(blob);
    try {
        const bmp = await createImageBitmap(blob);
        const scale = Math.min(1, POSTER_BACKUP_WIDTH / bmp.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bmp.width * scale));
        canvas.height = Math.max(1, Math.round(bmp.height * scale));
        canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
        if (bmp.close) bmp.close();
        return canvas.toDataURL('image/jpeg', 0.82);
    } catch (_) {
        return blobToDataUrl(blob); // çözülemeyen biçim: olduğu gibi sakla
    }
}

async function fetchPosterBlob(url) {
    try {
        if (typeof caches !== 'undefined') {
            const hit = await (await caches.open(POSTER_CACHE_NAME)).match(url);
            if (hit) return await hit.blob();
        }
    } catch (_) { /* önbellek yoksa ağdan al */ }
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.blob();
}

// { url: dataUrl } döndürür; alınamayanlar atlanır
async function buildPosterBackup(onProgress) {
    const urls = collectPosterUrls();
    const posters = {};
    let done = 0;
    let failed = 0;
    let next = 0;
    async function worker() {
        while (next < urls.length) {
            const url = urls[next++];
            try {
                const dataUrl = await posterBlobToDataUrl(await fetchPosterBlob(url));
                if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) posters[url] = dataUrl;
                else failed++;
            } catch (_) { failed++; }
            done++;
            if (onProgress) onProgress(done, urls.length);
        }
    }
    await Promise.all(Array.from({ length: Math.min(POSTER_BACKUP_CONCURRENCY, urls.length) }, worker));
    return { posters, failed, total: urls.length };
}

// Yedekteki posterleri görsel önbelleğine yazar; yazılan sayıyı döndürür
async function restorePosters(posters) {
    if (!posters || typeof posters !== 'object' || typeof caches === 'undefined') return 0;
    let cache;
    try { cache = await caches.open(POSTER_CACHE_NAME); } catch (_) { return 0; }
    let restored = 0;
    for (const [url, dataUrl] of Object.entries(posters)) {
        if (!safeUrl(url) || typeof dataUrl !== 'string' || !/^data:image\/(jpeg|png|webp|gif);base64,/i.test(dataUrl)) continue;
        try {
            const blob = await (await fetch(dataUrl)).blob();
            await cache.put(url, new Response(blob, { headers: { 'content-type': blob.type } }));
            restored++;
        } catch (_) { /* tek görsel bozuksa diğerlerine devam */ }
    }
    return restored;
}

// Export data
const backupPostersCheckbox = document.getElementById('backupIncludePosters');
if (backupPostersCheckbox) {
    try { backupPostersCheckbox.checked = localStorage.getItem('backupPosters') !== '0'; } catch (_) {}
    backupPostersCheckbox.addEventListener('change', () => {
        try { localStorage.setItem('backupPosters', backupPostersCheckbox.checked ? '1' : '0'); } catch (_) {}
    });
}

document.getElementById('exportData').addEventListener('click', async function () {
    const button = this;
    const data = {
        dataVersion: 2,
        exportedAt: new Date().toISOString(),
        series: seriesData,
        movies: moviesData,
        categories: categoriesData,
        tags: tagsData,
        watchLog: getWatchLog()
    };

    if (backupPostersCheckbox && backupPostersCheckbox.checked && collectPosterUrls().length) {
        button.disabled = true;
        const label = button.innerHTML;
        try {
            const result = await buildPosterBackup((done, total) => {
                button.textContent = `Posterler ${done}/${total}`;
            });
            if (Object.keys(result.posters).length) data.posters = result.posters;
            if (result.failed) showToast(`${result.failed} posterin görseli alınamadı, yedekte yok.`);
        } catch (err) {
            showToast('Posterler yedeğe eklenemedi: ' + err.message);
        } finally {
            button.disabled = false;
            button.innerHTML = label;
        }
    }

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const linkElement = document.createElement('a');
    linkElement.href = url;
    linkElement.download = `izleme-takip-yedek-${stamp}.json`;
    document.body.appendChild(linkElement);
    linkElement.click();
    linkElement.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    markBackupTaken();
});

// Import data
document.getElementById('importData').addEventListener('change', function (e) {
    const file = e.target.files[0];
    this.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (ev) {
        let data;
        try {
            data = JSON.parse(ev.target.result);
        } catch (err) {
            alert('Dosya okunamadı, geçerli bir JSON yedeği değil: ' + err.message);
            return;
        }
        if (!data || typeof data !== 'object' || (!Array.isArray(data.series) && !Array.isArray(data.movies))) {
            alert('Bu dosya bir İzleme Takip yedeği gibi görünmüyor.');
            return;
        }

        const nextSeries = Array.isArray(data.series) ? normalizeSeriesList(data.series) : seriesData;
        const nextMovies = Array.isArray(data.movies) ? normalizeMoviesList(data.movies) : moviesData;
        const nextCategories = normalizeCategoriesList(data.categories) || categoriesData;
        const nextTags = Array.isArray(data.tags) ? normalizeTagsData(data.tags) : tagsData;

        const message = `Yedekte ${nextSeries.length} dizi ve ${nextMovies.length} film var.\n` +
            `Mevcut verileriniz (${seriesData.length} dizi, ${moviesData.length} film) bu yedekle DEĞİŞTİRİLECEK.\n\n` +
            'Devam edilsin mi? (Mevcut veriler tarayıcıda "importBackup" olarak saklanır.)';
        if (!confirm(message)) return;

        try {
            __origSetItem('importBackup', JSON.stringify({ savedAt: new Date().toISOString(), ...getAllDataPayload() }));
        } catch (_) {}
        createSnapshot('Yedekten geri yükleme öncesi');

        seriesData = nextSeries;
        moviesData = nextMovies;
        categoriesData = nextCategories;
        tagsData = nextTags;
        deletedItems = normalizeDeleted(null);
        selectedBulkKeys = new Set();

        localStorage.setItem('seriesData', JSON.stringify(seriesData));
        localStorage.setItem('moviesData', JSON.stringify(moviesData));
        localStorage.setItem('categoriesData', JSON.stringify(categoriesData));
        localStorage.setItem('tagsData', JSON.stringify(tagsData));
        localStorage.setItem('deletedItems', JSON.stringify(deletedItems));
        if (Array.isArray(data.watchLog)) saveWatchLog(data.watchLog.filter(e => e && e.t));

        refreshAll();
        const restoring = data.posters ? restorePosters(data.posters) : null;
        alert('Veriler başarıyla yüklendi!');
        if (restoring) {
            restoring.then(count => {
                if (count) {
                    showToast(`${count} poster cihaza geri yüklendi.`);
                    document.querySelectorAll('img[src^="http"]').forEach(img => { const src = img.src; img.src = ''; img.src = src; });
                }
            });
        }
    };
    reader.readAsText(file);
});

// Event listeners
// Sekme geçişleri
const TABS = [
    { tab: seriesTab, content: seriesContent },
    { tab: moviesTab, content: moviesContent },
    { tab: upcomingTab, content: upcomingContent, onShow: () => { if (upcomingView === 'calendar') renderCalendar(); else renderUpcomingReleases(); renderNewReleases(false); } },
    { tab: categoriesTab, content: categoriesContent },
    { tab: tagsTab, content: tagsContent },
    { tab: trailersTab, content: trailersContent, onShow: renderTrailersTab },
    { tab: document.getElementById('discoverTab'), content: document.getElementById('discoverContent'), onShow: () => renderDiscover(false) },
    { tab: document.getElementById('statsTab'), content: document.getElementById('statsContent'), onShow: renderStats }
];

function showTab(activeTab) {
    TABS.forEach(({ tab, content }) => {
        const isActive = tab === activeTab;
        tab.classList.toggle('active', isActive);
        content.classList.toggle('hidden', !isActive);
    });
    stopTrailersPreview(true);
    stopPosterPreview();
    const entry = TABS.find(t => t.tab === activeTab);
    if (entry && entry.onShow) entry.onShow();
    try { localStorage.setItem('activeTab', activeTab.id); } catch (_) {}
}

TABS.forEach(({ tab }) => tab.addEventListener('click', () => showTab(tab)));

function getActiveTabId() {
    const entry = TABS.find(t => t.tab.classList.contains('active'));
    return entry ? entry.tab.id : 'seriesTab';
}

// Upcoming releases filter event listeners
upcomingFilterAll.addEventListener('click', function () {
    filterUpcomingContent('all');
    renderUpcomingReleases();
});

upcomingFilterSeries.addEventListener('click', function () {
    filterUpcomingContent('series');
    renderUpcomingReleases();
});

upcomingFilterMovies.addEventListener('click', function () {
    filterUpcomingContent('movies');
    renderUpcomingReleases();
});

if (trailersList) {
    trailersList.addEventListener('mouseover', function (e) {
        const item = e.target.closest('.trailer-preview-item');
        if (!item) return;
        scheduleTrailersPreview(item.getAttribute('data-video-id'), item.getAttribute('data-title') || '');
    }, { passive: true });

    trailersList.addEventListener('focusin', function (e) {
        const item = e.target.closest('.trailer-preview-item');
        if (!item) return;
        scheduleTrailersPreview(item.getAttribute('data-video-id'), item.getAttribute('data-title') || '');
    }, { passive: true });

    trailersList.addEventListener('mouseleave', function () {
        stopTrailersPreview(false);
    });

    trailersList.addEventListener('click', function (e) {
        const item = e.target.closest('.trailer-preview-item');
        if (!item) return;
        showTrailerModal(item.getAttribute('data-trailer-url'), item.getAttribute('data-title') || '');
    });

    trailersList.addEventListener('keydown', function (e) {
        const item = e.target.closest('.trailer-preview-item');
        if (!item) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showTrailerModal(item.getAttribute('data-trailer-url'), item.getAttribute('data-title') || '');
        }
    });
}

if (trailersSearch) {
    trailersSearch.addEventListener('input', function () {
        trailersSearchQuery = (this.value || '');
        renderTrailersTab();
    });
}

if (trailersSortSelect) {
    trailersSortSelect.addEventListener('change', function () {
        currentTrailersSort = this.value || 'alphabetical';
        renderTrailersTab();
    });
}

function setTrailersFilter(filter) {
    currentTrailersFilter = filter;
    renderTrailersTab();
}

if (trailersFilterAll) {
    trailersFilterAll.addEventListener('click', function () { setTrailersFilter('all'); });
}
if (trailersFilterSeries) {
    trailersFilterSeries.addEventListener('click', function () { setTrailersFilter('series'); });
}
if (trailersFilterMovies) {
    trailersFilterMovies.addEventListener('click', function () { setTrailersFilter('movies'); });
}

addSeriesBtn.addEventListener('click', addSeries);
addSeriesBtnEmpty.addEventListener('click', addSeries);
addMovieBtn.addEventListener('click', addMovie);
addMovieBtnEmpty.addEventListener('click', addMovie);
addCategoryBtn.addEventListener('click', addCategory);
document.getElementById('addTagBtn').addEventListener('click', addTag);
document.getElementById('promoteAllTagsBtn').addEventListener('click', promoteAllTags);

// Fragman butonları için event listener (event delegation kullanarak)
document.addEventListener('click', function(e) {
    if (e.target.closest('.trailer-btn')) {
        const btn = e.target.closest('.trailer-btn');
        const trailerUrl = btn.getAttribute('data-trailer-url');
        const title = btn.getAttribute('data-title');
        showTrailerModal(trailerUrl, title);
    }
});

// Sync Modal events (WebRTC-only)
openSyncModalBtn.addEventListener('click', () => { syncModalEl.classList.add('active'); });
closeSyncModalBtn.addEventListener('click', () => closeModal(syncModalEl));

// --- WebRTC Pairing logic ---
const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let rtcPeer = null;
let rtcChannel = null;
let rtcInitiator = false;

// --- Eşleştirme kodu: kısaltılmış + sıkıştırılmış SDP ---
// Kod QR'a sığsın diye TCP adayları atılır ve metin deflate ile sıkıştırılır.
// "z1." ile başlayan kodlar sıkıştırılmıştır; eski (düz base64) kodlar da okunmaya devam eder.
const SIGNAL_PREFIX = 'z1.';

function slimSdp(sdp) {
    return String(sdp || '')
        .split(/\r?\n/)
        .filter(line => line && !(line.startsWith('a=candidate:') && / tcp /i.test(line)))
        .join('\r\n') + '\r\n';
}

function bytesToBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(text) {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function transformBytes(bytes, stream) {
    const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await response.arrayBuffer());
}

// --- Kompakt eşleştirme kodu ("m2.") ---
// Veri kanalı bağlantısı için SDP'nin yalnızca gerekli parçaları gönderilir:
// ICE kullanıcı adı/şifresi, DTLS parmak izi, rol, mid ve UDP adayları.
// Karşı taraf SDP'yi bunlardan yeniden kurar. Kod ~200 karakter olur; QR kolay okunur.
const COMPACT_PREFIX = 'm2.';
const CANDIDATE_PRIORITY = { h: 2130706431, s: 1694498815, p: 1862270975, r: 16777215 };
const CANDIDATE_TYPES = { host: 'h', srflx: 's', prflx: 'p', relay: 'r' };
const CANDIDATE_NAMES = { h: 'host', s: 'srflx', p: 'prflx', r: 'relay' };

function sdpValue(lines, key) {
    const line = lines.find(l => l.startsWith('a=' + key + ':'));
    return line ? line.slice(key.length + 3).trim() : '';
}

function encodeCompactSignal(description) {
    const lines = String(description.sdp || '').split(/\r?\n/);
    const ufrag = sdpValue(lines, 'ice-ufrag');
    const pwd = sdpValue(lines, 'ice-pwd');
    const fingerprint = sdpValue(lines, 'fingerprint');
    const setup = sdpValue(lines, 'setup');
    const mid = sdpValue(lines, 'mid') || '0';
    const [fpAlg, fpHex] = fingerprint.split(/\s+/);
    if (!ufrag || !pwd || fpAlg !== 'sha-256' || !fpHex || !setup) return null;
    if (/[|,\s]/.test(ufrag + pwd + mid)) return null;
    if (!lines.some(l => l.startsWith('m=application'))) return null;

    const fpBytes = new Uint8Array(fpHex.split(':').map(h => parseInt(h, 16)));
    const candidates = [];
    lines.filter(l => l.startsWith('a=candidate:')).forEach(line => {
        const parts = line.slice('a=candidate:'.length).split(/\s+/);
        // foundation component transport priority ip port typ type ...
        const [, component, transport, , ip, port, , type] = parts;
        if (component !== '1' || String(transport).toLowerCase() !== 'udp') return;
        const t = CANDIDATE_TYPES[type];
        if (!t || !ip || !port || /[,\s]/.test(ip)) return;
        const key = `${t} ${ip} ${port}`;
        if (!candidates.includes(key)) candidates.push(key);
    });
    if (candidates.length === 0) return null;

    const role = setup === 'actpass' ? 'x' : setup === 'active' ? 'a' : 'p';
    return COMPACT_PREFIX + [
        description.type === 'offer' ? 'o' : 'a',
        ufrag,
        pwd,
        bytesToBase64Url(fpBytes),
        role,
        mid,
        candidates.join(',')
    ].join('|');
}

function decodeCompactSignal(text) {
    const fields = text.slice(COMPACT_PREFIX.length).split('|');
    if (fields.length !== 7) return null;
    const [t, ufrag, pwd, fp, role, mid, cands] = fields;
    const fpHex = Array.from(base64UrlToBytes(fp)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
    const setup = role === 'x' ? 'actpass' : role === 'a' ? 'active' : 'passive';
    const candidateLines = cands.split(',').filter(Boolean).map((c, i) => {
        const [type, ip, port] = c.split(' ');
        const name = CANDIDATE_NAMES[type];
        if (!name) return null;
        const related = name === 'host' ? '' : ' raddr 0.0.0.0 rport 0';
        return `a=candidate:${i + 1} 1 udp ${CANDIDATE_PRIORITY[type] - i} ${ip} ${port} typ ${name}${related} generation 0`;
    }).filter(Boolean);
    const sessionId = String(Date.now()) + String(Math.floor(Math.random() * 1000));
    const sdp = [
        'v=0',
        `o=- ${sessionId} 2 IN IP4 127.0.0.1`,
        's=-',
        't=0 0',
        `a=group:BUNDLE ${mid}`,
        'a=msid-semantic: WMS',
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
        'c=IN IP4 0.0.0.0',
        ...candidateLines,
        `a=ice-ufrag:${ufrag}`,
        `a=ice-pwd:${pwd}`,
        'a=ice-options:trickle',
        `a=fingerprint:sha-256 ${fpHex}`,
        `a=setup:${setup}`,
        `a=mid:${mid}`,
        'a=sctp-port:5000',
        'a=max-message-size:262144',
        ''
    ].join('\r\n');
    return { type: t === 'o' ? 'offer' : 'answer', sdp };
}

async function encodeSignal(description) {
    try {
        const compact = encodeCompactSignal(description);
        if (compact) return compact;
    } catch (_) {}
    const payload = JSON.stringify({ t: description.type, s: slimSdp(description.sdp) });
    const bytes = new TextEncoder().encode(payload);
    if (typeof CompressionStream === 'function') {
        try {
            return SIGNAL_PREFIX + bytesToBase64Url(await transformBytes(bytes, new CompressionStream('deflate-raw')));
        } catch (_) {}
    }
    return bytesToBase64Url(bytes);
}

async function decodeSignal(text) {
    let raw = String(text || '').trim();
    if (!raw) return null;
    if (!raw.startsWith(COMPACT_PREFIX)) raw = raw.replace(/\s+/g, '');
    try {
        if (raw.startsWith(COMPACT_PREFIX)) return decodeCompactSignal(raw);
        let json;
        if (raw.startsWith(SIGNAL_PREFIX)) {
            if (typeof DecompressionStream !== 'function') {
                alert('Bu tarayıcı sıkıştırılmış kodu açamıyor. Lütfen tarayıcınızı güncelleyin.');
                return null;
            }
            const bytes = await transformBytes(base64UrlToBytes(raw.slice(SIGNAL_PREFIX.length)), new DecompressionStream('deflate-raw'));
            json = new TextDecoder().decode(bytes);
        } else {
            json = new TextDecoder().decode(base64UrlToBytes(raw));
        }
        const data = JSON.parse(json);
        if (data && data.t && data.s) return { type: data.t, sdp: data.s };
        if (data && data.type && data.sdp) return data; // eski format
        return null;
    } catch (_) {
        return null;
    }
}

// Basitleştirilmiş WebRTC eşleştirme sistemi
let pairingState = 'waiting'; // 'waiting', 'offer-generated', 'answer-received', 'connected'
let isInitiator = false;

function setupRtcChannel() {
    if (!rtcChannel) return;
    rtcChannel.onopen = () => {
        updateSyncIndicator();
        updatePairingStatus('Bağlandı! Cihazlar senkronize edildi.', 'success');
        if (connectTimeoutTimer) { try { clearTimeout(connectTimeoutTimer); } catch(_) {} connectTimeoutTimer = null; }
        updateInstructions('connected');
        pairingState = 'connected';
        sendSyncPayload(rtcChannel).catch(err => updatePairingStatus('Veri gönderilemedi: ' + err.message, 'error'));
    };
    rtcChannel.onmessage = (ev) => { handlePeerMessage(ev.data); };
    rtcChannel.onclose = () => {
        updateSyncIndicator();
        updatePairingStatus('Bağlantı kapandı', 'error');
        pairingState = 'waiting';
    };
}

function initRtcPeer(initiator) {
    rtcInitiator = !!initiator;
    isInitiator = initiator;
    rtcPeer = new RTCPeerConnection(RTC_CONFIG);
    rtcPeer.ondatachannel = (ev) => { rtcChannel = ev.channel; setupRtcChannel(); };
    rtcPeer.onicecandidate = () => { /* manual signaling: SDP yeterli */ };
    if (rtcInitiator) { rtcChannel = rtcPeer.createDataChannel('sync'); setupRtcChannel(); }
}

// ICE adayları tamamen toplanana kadar bekle
function waitForIceGatheringComplete(pc) {
    return new Promise(resolve => {
        if (!pc) return resolve();
        if (pc.iceGatheringState === 'complete') return resolve();
        const check = () => {
            if (pc.iceGatheringState === 'complete') {
                pc.removeEventListener('icegatheringstatechange', check);
                resolve();
            }
        };
        pc.addEventListener('icegatheringstatechange', check);
        // Güvenlik için maksimum bekleme (10 sn), bazı ortamlarda state olayı gelmeyebilir
        setTimeout(() => {
            pc.removeEventListener('icegatheringstatechange', check);
            resolve();
        }, 10000);
    });
}

// Header'daki senkronizasyon butonunda bağlantı durumunu göster
function setSyncIndicator(connected) {
    const dot = document.getElementById('syncIndicator');
    if (dot) dot.hidden = !connected;
    const btn = document.getElementById('openSyncModal');
    if (btn) btn.title = connected ? 'Senkronizasyon: bağlı' : 'Cihazlar arası senkronizasyon';
}

function updatePairingStatus(message, type = 'info') {
    if (pairingStatus) {
        pairingStatus.textContent = `Durum: ${message}`;
        pairingStatus.className = `text-gray-300 mb-2 ${type === 'success' ? 'text-green-400' : type === 'error' ? 'text-red-400' : ''}`;
    }
}

function updateInstructions(step) {
    if (!pairingInstructions) return;

    const instructions = {
        'waiting': `
            <p><strong>Adım 1:</strong> "Kod Üret" butonuna basın</p>
            <p><strong>Adım 2:</strong> Kodu diğer cihaza paylaşın (QR ile veya kopyala-yapıştır)</p>
            <p><strong>Adım 3:</strong> Diğer cihazdan gelen cevap kodunu buraya yapıştırın</p>
            <p><strong>Adım 4:</strong> "Bağlan" butonuna basın</p>
        `,
        'offer-generated': `
            <p><strong>✓ Adım 1 tamamlandı:</strong> Kod üretildi</p>
            <p><strong>→ Adım 2:</strong> Kodu diğer cihaza paylaşın (QR ile veya kopyala-yapıştır)</p>
            <p><strong>Adım 3:</strong> Diğer cihazdan gelen cevap kodunu buraya yapıştırın</p>
            <p><strong>Adım 4:</strong> "Bağlan" butonuna basın</p>
        `,
        'answer-received': `
            <p><strong>✓ Adım 1-3 tamamlandı:</strong> Cevap kodu alındı</p>
            <p><strong>→ Adım 4:</strong> "Bağlan" butonuna basın</p>
        `,
        'connecting': `
            <p><strong>Bağlantı kuruluyor...</strong> Lütfen bekleyin.</p>
        `,
        'connected': `
            <p><strong>✓ Tüm adımlar tamamlandı!</strong> Cihazlar başarıyla eşleştirildi.</p>
            <p>Artık verileriniz otomatik olarak senkronize edilecek.</p>
        `
    };

    pairingInstructions.innerHTML = instructions[step] || instructions['waiting'];
}

async function generateCode() {
    try {
        initRtcPeer(true);
        const offer = await rtcPeer.createOffer();
        await rtcPeer.setLocalDescription(offer);
        updatePairingStatus('Kod hazırlanıyor - Ağ bilgileri toplanıyor...');
        await waitForIceGatheringComplete(rtcPeer);
        pairingCode.value = await encodeSignal(rtcPeer.localDescription);

        updatePairingStatus('Kod üretildi - Diğer cihaza paylaşın');
        updateInstructions('offer-generated');
        pairingState = 'offer-generated';

        // Label'ı güncelle
        if (codeLabel) codeLabel.textContent = 'Üretilen Kod (Diğer cihaza paylaşın)';
        showQrCode();

    } catch (e) {
        updatePairingStatus('Kod üretilemedi: ' + e.message, 'error');
    }
}

function resetPairingState() {
    pairingState = 'waiting';
    isInitiator = false;
    if (rtcPeer) {
        rtcPeer.close();
        rtcPeer = null;
    }
    if (rtcChannel) {
        rtcChannel.close();
        rtcChannel = null;
    }
    if (pairingCode) pairingCode.value = '';
    if (codeLabel) codeLabel.textContent = 'Eşleştirme Kodu';
    updatePairingStatus('Hazır - Yeni eşleştirme başlatabilirsiniz');
    updateInstructions('waiting');
}

async function connectToPeer() {
    const codeValue = pairingCode.value.trim();
    if (!codeValue) {
        alert('Lütfen bir kod girin veya üretin!');
        return;
    }

    try {
        if (pairingState === 'waiting') {
            // Bu cihaz bağlanan taraf - offer kodunu işle
            const remote = await decodeSignal(codeValue);
            if (!remote) {
                alert('Geçersiz kod formatı!');
                return;
            }

            initRtcPeer(false);
            await rtcPeer.setRemoteDescription(remote);
            const answer = await rtcPeer.createAnswer();
            await rtcPeer.setLocalDescription(answer);
            updatePairingStatus('Cevap hazırlanıyor - Ağ bilgileri toplanıyor...');
            await waitForIceGatheringComplete(rtcPeer);

            // Answer kodunu göster
            pairingCode.value = await encodeSignal(rtcPeer.localDescription);
            updatePairingStatus('Cevap kodu üretildi - İlk cihaza verin');
            updateInstructions('answer-received');
            pairingState = 'answer-received';

            if (codeLabel) codeLabel.textContent = 'Cevap Kodu (İlk cihaza verin)';
            showQrCode();

        } else if (pairingState === 'offer-generated') {
            // Bu cihaz başlatan taraf - answer kodunu işle
            const ans = await decodeSignal(codeValue);
            if (!ans) {
                alert('Geçersiz cevap kodu formatı!');
                return;
            }

            await rtcPeer.setRemoteDescription(ans);
            updatePairingStatus('Bağlantı kuruluyor...');
            updateInstructions('connecting');
            if (connectTimeoutTimer) { try { clearTimeout(connectTimeoutTimer); } catch(_) {} }
            connectTimeoutTimer = setTimeout(() => {
                if (pairingState !== 'connected' || !rtcChannel || rtcChannel.readyState !== 'open') {
                    updatePairingStatus('Bağlantı kurulamadı. Ağ veya WebRTC engeli olabilir.', 'error');
                    updateInstructions('answer-received');
                }
            }, connectTimeoutMs);

        } else if (pairingState === 'answer-received') {
            // Cevap kodu zaten üretildi, tekrar bağlanmaya çalışıyor
            updatePairingStatus('Cevap kodu zaten üretildi. İlk cihaza verin ve orada "Bağlan" butonuna basın.', 'error');

        } else if (pairingState === 'connected') {
            // Zaten bağlı, yeni eşleştirme başlatmak istiyor
            const restart = confirm('Zaten bağlısınız. Yeni bir eşleştirme başlatmak istiyor musunuz?');
            if (restart) {
                resetPairingState();
                updatePairingStatus('Durum sıfırlandı. Yeni eşleştirme başlatabilirsiniz.');
            }

        } else {
            // Bilinmeyen durum - güvenli sıfırlama
            console.warn('Bilinmeyen pairingState:', pairingState);
            resetPairingState();
            updatePairingStatus('Durum sıfırlandı. Lütfen tekrar deneyin.');
        }

    } catch (e) {
        updatePairingStatus('Bağlantı hatası: ' + e.message, 'error');
        console.error('WebRTC bağlantı hatası:', e);
    }
}

// Harici betiği bir kez yükle; ilk kaynak çalışmazsa sıradakini dene
const scriptLoads = {};
function loadScriptOnce(globalName, urls) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (scriptLoads[globalName]) return scriptLoads[globalName];
    scriptLoads[globalName] = (async () => {
        for (const url of urls) {
            try {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = url;
                    script.async = true;
                    script.onload = resolve;
                    script.onerror = () => { script.remove(); reject(new Error('yüklenemedi: ' + url)); };
                    document.head.appendChild(script);
                });
                if (window[globalName]) return window[globalName];
            } catch (_) {}
        }
        scriptLoads[globalName] = null;
        throw new Error('Kütüphane yüklenemedi');
    })();
    return scriptLoads[globalName];
}

const QR_GENERATOR_URLS = [
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'
];
const QR_SCANNER_URLS = [
    'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
    'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

async function showQrCode() {
    const code = pairingCode.value.trim();
    if (!code) {
        alert('Önce bir kod üretin!');
        return;
    }

    try {
        await loadScriptOnce('QRCode', QR_GENERATOR_URLS);
    } catch (_) {
        alert('QR kod oluşturucu yüklenemedi. Kodu kopyalayıp mesajla gönderebilirsiniz.');
        return;
    }

    if (qrContainer) {
        qrContainer.innerHTML = '';
        try {
            const size = Math.max(220, Math.min(340, (qrContainer.clientWidth || 340) - 24));
            new QRCode(qrContainer, {
                text: code,
                width: size,
                height: size,
                colorDark: "#000000",
                colorLight: "#ffffff",
                // Uzun eşleştirme kodu için en yüksek kapasite (düşük hata düzeltme)
                correctLevel: QRCode.CorrectLevel.L
            });
        } catch (err) {
            qrContainer.innerHTML = '<p class="text-sm text-red-400">Kod QR koda sığmayacak kadar uzun. Kodu kopyalayıp mesajla gönderin.</p>';
        }
    }
}

// QR tarama (kamera)
let qrScanner = null;
const qrScannerContainer = document.getElementById('qrScannerContainer');
const stopQrScanBtn = document.getElementById('stopQrScanBtn');

async function stopQrScanner() {
    if (qrScanner) {
        try { await qrScanner.stop(); } catch (_) {}
        try { qrScanner.clear(); } catch (_) {}
        qrScanner = null;
    }
    if (qrScannerContainer) qrScannerContainer.classList.add('hidden');
    if (stopQrScanBtn) stopQrScanBtn.classList.add('hidden');
}

async function startQrScanner() {
    if (!window.isSecureContext) {
        alert('Kamera yalnızca güvenli (https) bağlantıda çalışır.');
        return;
    }
    const originalHtml = scanQrBtn ? scanQrBtn.innerHTML : '';
    if (scanQrBtn) {
        scanQrBtn.disabled = true;
        scanQrBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Yükleniyor...';
    }
    try {
        await loadScriptOnce('Html5Qrcode', QR_SCANNER_URLS);
    } catch (_) {
        alert('QR tarayıcı yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin; olmazsa kodu kopyala-yapıştır ile girebilirsiniz.');
        return;
    } finally {
        if (scanQrBtn) {
            scanQrBtn.disabled = false;
            scanQrBtn.innerHTML = originalHtml;
        }
    }
    await stopQrScanner();
    qrScannerContainer.innerHTML = '<div id="qrReader"></div>';
    qrScannerContainer.classList.remove('hidden');
    stopQrScanBtn.classList.remove('hidden');
    const scannerOptions = {
        verbose: false,
        // Android Chrome'daki yerleşik QR okuyucuyu kullan (çok daha hızlı ve isabetli)
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };
    if (window.Html5QrcodeSupportedFormats) scannerOptions.formatsToSupport = [Html5QrcodeSupportedFormats.QR_CODE];
    qrScanner = new Html5Qrcode('qrReader', scannerOptions);
    let handled = false;
    try {
        await qrScanner.start(
            { facingMode: 'environment' },
            {
                fps: 15,
                // Görüntünün büyük kısmını tara
                qrbox: (width, height) => {
                    const side = Math.floor(Math.min(width, height) * 0.85);
                    return { width: side, height: side };
                },
                videoConstraints: {
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            },
            async decodedText => {
                if (handled) return;
                handled = true;
                pairingCode.value = decodedText.trim();
                await stopQrScanner();
                updatePairingStatus('QR kod okundu, bağlanılıyor...', 'success');
                if (navigator.vibrate) navigator.vibrate(80);
                connectToPeer();
            }
        );
    } catch (err) {
        await stopQrScanner();
        alert('Kamera açılamadı: ' + (err && err.message ? err.message : err));
    }
}

if (scanQrBtn) scanQrBtn.addEventListener('click', startQrScanner);
if (stopQrScanBtn) stopQrScanBtn.addEventListener('click', stopQrScanner);

// Event listeners
if (generateCodeBtn) generateCodeBtn.addEventListener('click', generateCode);
if (connectBtn) connectBtn.addEventListener('click', connectToPeer);
if (showQrBtn) showQrBtn.addEventListener('click', showQrCode);

// Reset pairing button
const resetPairingBtn = document.getElementById('resetPairingBtn');
if (resetPairingBtn) resetPairingBtn.addEventListener('click', function() {
    resetPairingState();
    updatePairingStatus('Durum sıfırlandı. Yeni eşleştirme başlatabilirsiniz.');
});
document.getElementById('addNewSeasonBtn').addEventListener('click', addSeasonForm);

document.getElementById('cancelSeries').addEventListener('click', function () {
    closeModal(seriesModal);
});

document.getElementById('cancelMovie').addEventListener('click', function () {
    closeModal(movieModal);
});

// Series form submit
document.getElementById('seriesForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const id = document.getElementById('seriesId').value;
    const name = document.getElementById('seriesName').value.trim();
    const imdbRating = document.getElementById('seriesImdbRating').value;
    const releaseDate = document.getElementById('seriesReleaseDate').value;
    const seasonsFromForm = getSeasonsFromForm();

    if (!name) {
        alert('Dizi adı gereklidir.');
        return;
    }
    if (seasonsFromForm.length === 0) {
        alert('En az bir sezon eklemelisiniz!');
        return;
    }
    const invalid = seasonsFromForm.find(s => s.totalEpisodes <= 0);
    if (invalid) {
        alert(`Sezon ${invalid.season} için toplam bölüm sayısını girin.`);
        return;
    }
    const seasonNumbers = seasonsFromForm.map(s => s.season);
    if (new Set(seasonNumbers).size !== seasonNumbers.length) {
        alert('Aynı sezon numarası birden fazla kez girilmiş.');
        return;
    }

    const duplicate = seriesData.find(s => trLower(s.name) === trLower(name) && String(s.id) !== String(id));
    if (duplicate && !confirm(`"${duplicate.name}" adında bir dizi zaten var. Yine de ayrı bir kayıt olarak kaydedilsin mi?`)) {
        return;
    }

    const now = new Date().toISOString();
    const existing = id ? findSeries(id) : null;
    const previousSeasons = existing ? existing.seasons : [];

    const seasons = seasonsFromForm.map(formSeason => {
        const previous = previousSeasons.find(s => formSeason.id != null && String(s.id) === String(formSeason.id));
        const watched = Math.min(formSeason.watchedEpisodes, formSeason.totalEpisodes);
        let lastWatchedAt = null;
        if (watched > 0) {
            lastWatchedAt = previous && watched <= previous.watchedEpisodes
                ? (previous.lastWatchedAt || null)
                : now;
        }
        const changed = !previous || previous.season !== formSeason.season ||
            previous.totalEpisodes !== formSeason.totalEpisodes || previous.watchedEpisodes !== watched;
        return {
            id: previous ? previous.id : newId(),
            season: formSeason.season,
            totalEpisodes: formSeason.totalEpisodes,
            watchedEpisodes: watched,
            releaseDate: formSeason.releaseDate || (previous ? previous.releaseDate : null) || null,
            updatedAt: changed ? now : (previous.updatedAt || now),
            lastWatchedAt
        };
    });

    const fields = {
        name,
        platform: document.getElementById('seriesPlatform').value,
        categories: getSelectedCategories('seriesCategorySelector'),
        tags: getTagsFromContainer('seriesTagsContainer'),
        trailerUrl: document.getElementById('seriesTrailerUrl').value.trim(),
        imdbRating: imdbRating ? parseFloat(imdbRating) : null,
        description: document.getElementById('seriesDescription').value.trim(),
        imageUrl: document.getElementById('seriesImageUrl').value.trim(),
        releaseDate: releaseDate || null,
        rewatchCount: normalizeCount(document.getElementById('seriesRewatch').value),
        myRating: parseRatingInput('seriesMyRating'),
        notes: document.getElementById('seriesNotes').value.trim(),
        userStatus: document.getElementById('seriesUserStatus').value || null,
        seasons,
        updatedAt: now
    };
    const extra = typeof getAutoFillExtras === 'function' ? getAutoFillExtras('series') : {};

    if (existing) {
        Object.assign(existing, extra, fields);
        refreshSeriesLastWatched(existing);
    } else {
        const created = normalizeSeriesItem({ id: newId(), ...extra, ...fields, createdAt: now });
        seriesData.push(created);
    }

    localStorage.setItem('seriesData', JSON.stringify(seriesData));
    closeModal(seriesModal);
    refreshAll();
});

// Movie form submit
document.getElementById('movieForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const id = document.getElementById('movieId').value;
    const name = document.getElementById('movieName').value.trim();
    const watched = document.getElementById('movieWatched').checked;
    const platform = document.getElementById('moviePlatform').value;
    const categories = getSelectedCategories('movieCategorySelector');
    const tags = getTagsFromContainer('movieTagsContainer');
    const trailerUrl = document.getElementById('movieTrailerUrl').value.trim();
    const imdbRating = document.getElementById('movieImdbRating').value;
    const description = document.getElementById('movieDescription').value.trim();
    const imageUrl = document.getElementById('movieImageUrl').value.trim();
    const releaseDate = document.getElementById('movieReleaseDate').value;

    if (!name) {
        alert('Film adı gereklidir.');
        return;
    }
    const duplicate = moviesData.find(m => trLower(m.name) === trLower(name) && String(m.id) !== String(id));
    if (duplicate && !confirm(`"${duplicate.name}" adında bir film zaten var. Yine de ayrı bir kayıt olarak kaydedilsin mi?`)) {
        return;
    }

    if (id) {
        // Edit existing movie
        const index = moviesData.findIndex(m => String(m.id) === String(id));
        if (index !== -1) {
            const previousMovie = moviesData[index];
            const now = new Date().toISOString();
            const nextLastWatchedAt = !watched
                ? null
                : !previousMovie.watched
                    ? now
                    : previousMovie.lastWatchedAt || now;
            moviesData[index] = {
                ...previousMovie,
                ...(typeof getAutoFillExtras === 'function' ? getAutoFillExtras('movie') : {}),
                name,
                watched,
                platform,
                categories,
                tags,
                trailerUrl,
                imdbRating: imdbRating ? parseFloat(imdbRating) : null,
                description,
                imageUrl,
                releaseDate: releaseDate || null,
                myRating: parseRatingInput('movieMyRating'),
                rewatchCount: normalizeCount(document.getElementById('movieRewatch').value),
                notes: document.getElementById('movieNotes').value.trim(),
                updatedAt: now,
                lastWatchedAt: nextLastWatchedAt
            };
        }
    } else {
        // Add new movie
        const createdAt = new Date().toISOString();
        moviesData.push({
            ...(typeof getAutoFillExtras === 'function' ? getAutoFillExtras('movie') : {}),
            id: newId(),
            name,
            watched,
            platform,
            categories,
            tags,
            trailerUrl,
            imdbRating: imdbRating ? parseFloat(imdbRating) : null,
            description,
            imageUrl,
            releaseDate: releaseDate || null,
            myRating: parseRatingInput('movieMyRating'),
            rewatchCount: normalizeCount(document.getElementById('movieRewatch').value),
            notes: document.getElementById('movieNotes').value.trim(),
            createdAt,
            updatedAt: createdAt,
            lastWatchedAt: watched ? createdAt : null
        });
    }

    localStorage.setItem('moviesData', JSON.stringify(moviesData));
    closeModal(movieModal);
    refreshAll();
});

// Search and filter events
searchSeries.addEventListener('input', filterSeries);
searchMovies.addEventListener('input', filterMovies);

// Filter buttons
// Fragman sekmesindeki filtre butonlarının kendi dinleyicisi var; burada sadece dizi/film sekmeleri
document.querySelectorAll('#seriesContent .filter-button, #moviesContent .filter-button').forEach(btn => {
    btn.addEventListener('click', function () {
        const filter = this.getAttribute('data-filter');

        if (this.closest('#seriesContent')) {
            currentSeriesFilter = filter;
            document.querySelectorAll('#seriesContent .filter-button').forEach(b => {
                b.classList.remove('active');
            });
            this.classList.add('active');
            filterSeries();
        } else {
            currentMoviesFilter = filter;
            document.querySelectorAll('#moviesContent .filter-button').forEach(b => {
                b.classList.remove('active');
            });
            this.classList.add('active');
            filterMovies();
        }
    });
});

// View options
document.querySelectorAll('.view-button').forEach(btn => {
    btn.addEventListener('click', function () {
        const view = this.getAttribute('data-view');

        if (this.closest('#seriesContent')) {
            seriesView = view;
            document.querySelectorAll('#seriesContent .view-button').forEach(b => {
                b.classList.remove('active');
            });
            this.classList.add('active');
            renderSeriesList();
        } else {
            moviesView = view;
            document.querySelectorAll('#moviesContent .view-button').forEach(b => {
                b.classList.remove('active');
            });
            this.classList.add('active');
            renderMoviesList();
        }
    });
});

// Poster aspect ratio selectors
const posterAspectSelectSeries = document.getElementById('posterAspectSelectSeries');
const posterAspectSelectMovies = document.getElementById('posterAspectSelectMovies');
const layoutModeSelectSeries = document.getElementById('layoutModeSelectSeries');
const layoutModeSelectMovies = document.getElementById('layoutModeSelectMovies');

function syncPosterAspectSelects(value) {
    if (posterAspectSelectSeries) posterAspectSelectSeries.value = value;
    if (posterAspectSelectMovies) posterAspectSelectMovies.value = value;
}

function syncLayoutModeSelects(value) {
    if (layoutModeSelectSeries) layoutModeSelectSeries.value = value;
    if (layoutModeSelectMovies) layoutModeSelectMovies.value = value;
}

// Initialize selects with current value
syncPosterAspectSelects(posterAspect);
syncLayoutModeSelects(layoutMode);

function handleLayoutModeChange(value) {
    layoutMode = value;
    localStorage.setItem('layoutMode', layoutMode);
    syncLayoutModeSelects(layoutMode);
    syncLayoutToggleActive(layoutMode);
    renderSeriesList();
    renderMoviesList();
}

function handlePosterAspectChange(value, context) {
    posterAspect = value;
    localStorage.setItem('posterAspect', posterAspect);
    // Re-render lists; prefer current visible tab if context known
    if (context === 'series') {
        renderSeriesList();
    } else if (context === 'movies') {
        renderMoviesList();
    } else {
        // Fallback: render both
        renderSeriesList();
        renderMoviesList();
    }
    // Keep both selects in sync
    syncPosterAspectSelects(posterAspect);
}

if (posterAspectSelectSeries) {
    posterAspectSelectSeries.addEventListener('change', function () {
        handlePosterAspectChange(this.value, 'series');
    });
}

if (posterAspectSelectMovies) {
    posterAspectSelectMovies.addEventListener('change', function () {
        handlePosterAspectChange(this.value, 'movies');
    });
}

if (layoutModeSelectSeries) {
    layoutModeSelectSeries.addEventListener('change', function () {
        handleLayoutModeChange(this.value);
    });
}

if (layoutModeSelectMovies) {
    layoutModeSelectMovies.addEventListener('change', function () {
        handleLayoutModeChange(this.value);
    });
}

// Yerleşim toggle butonları
const layoutToggleGridSeries = document.getElementById('layoutToggleGridSeries');
const layoutToggleMasonrySeries = document.getElementById('layoutToggleMasonrySeries');
const layoutToggleGridMovies = document.getElementById('layoutToggleGridMovies');
const layoutToggleMasonryMovies = document.getElementById('layoutToggleMasonryMovies');

function syncLayoutToggleActive(value) {
    const setActive = (gridBtn, masonryBtn) => {
        if (!gridBtn || !masonryBtn) return;
        gridBtn.classList.toggle('active', value === 'grid');
        masonryBtn.classList.toggle('active', value === 'masonry');
    };
    setActive(layoutToggleGridSeries, layoutToggleMasonrySeries);
    setActive(layoutToggleGridMovies, layoutToggleMasonryMovies);
}

// İlk aktif durumu ayarla
syncLayoutToggleActive(layoutMode);

// Toggle click olayları
if (layoutToggleGridSeries) layoutToggleGridSeries.addEventListener('click', () => handleLayoutModeChange('grid'));
if (layoutToggleMasonrySeries) layoutToggleMasonrySeries.addEventListener('click', () => handleLayoutModeChange('masonry'));
if (layoutToggleGridMovies) layoutToggleGridMovies.addEventListener('click', () => handleLayoutModeChange('grid'));
if (layoutToggleMasonryMovies) layoutToggleMasonryMovies.addEventListener('click', () => handleLayoutModeChange('masonry'));

// =====================================================================
// Otomatik doldurma (TMDB, OMDb, TVmaze)
// =====================================================================
const TMDB_IMG = 'https://image.tmdb.org/t/p/';

function getApiKey(name) {
    try { return (localStorage.getItem(name) || '').trim(); } catch (_) { return ''; }
}

// Birincil + yedek TMDB anahtarı (yedek isteğe bağlı)
const TMDB_KEY_NAMES = ['tmdbKey', 'tmdbKey2'];

function getTmdbKeys() {
    const keys = TMDB_KEY_NAMES.map(getApiKey).filter(Boolean);
    return keys.filter((k, i) => keys.indexOf(k) === i); // aynı anahtar iki kez girilmişse tekile indir
}

function hasTmdbKey() {
    return getTmdbKeys().length > 0;
}

// Sorun çıkaran anahtar bir süre dinlendirilir; sonraki istekler önce sağlam olanı dener
const tmdbKeyCooldown = new Map(); // anahtar → bu zamana kadar (ms) sona kalan

function tmdbFailureCooldownMs(status) {
    if (status === 401 || status === 403) return 30 * 60 * 1000; // geçersiz/yetkisiz anahtar
    if (status === 429) return 60 * 1000;                       // istek sınırı
    return 20 * 1000;                                           // ağ / sunucu hatası
}

// Anahtar değiştiyse (ör. Ayarlar'dan kaydedildi) eski dinlendirmeleri sıfırla
function resetTmdbKeyCooldown() {
    tmdbKeyCooldown.clear();
    tmdbHostDownUntil = 0;
}

// TMDB bu süre içinde yanıt vermezse asılı kalmış sayılır ve yedek kaynağa geçilir
const TMDB_TIMEOUT_MS = 6000;
// Zaman aşımından sonra bu süre boyunca (yedek kaynak varsa) TMDB'yi hiç bekletmeden atla
let tmdbHostDownUntil = 0;

// İstek sınırı (429) veya geçici ağ hatalarında kısa bekleyip tekrar dener.
// options.timeoutMs verilirse yanıt gelmeyen (asılı kalan) istek iptal edilir ve err.timeout = true olur.
async function fetchJson(url, options, attempt = 0) {
    const { timeoutMs, ...fetchOptions } = options || {};
    const controller = timeoutMs ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    let res;
    try {
        res = await fetch(url, controller ? { ...fetchOptions, signal: controller.signal } : fetchOptions);
    } catch (networkError) {
        if (controller && controller.signal.aborted) {
            // Sunucu yanıt vermiyor: tekrar denemek yerine hemen bildir (yedek kaynağa geçilebilsin)
            const err = new Error('zaman aşımı');
            err.timeout = true;
            throw err;
        }
        if (attempt < 2) {
            await new Promise(r => setTimeout(r, 2500 * (attempt + 1)));
            return fetchJson(url, options, attempt + 1);
        }
        throw new Error('Bağlantı kurulamadı (internet veya istek sınırı).');
    } finally {
        if (timer) clearTimeout(timer);
    }
    if (res.status === 429 && attempt < 2) {
        await new Promise(r => setTimeout(r, 2500 * (attempt + 1)));
        return fetchJson(url, options, attempt + 1);
    }
    if (!res.ok) {
        const err = new Error('HTTP ' + res.status);
        err.status = res.status;
        try { err.body = (await res.text()).slice(0, 300); } catch (_) { /* gövde okunamadı */ }
        throw err;
    }
    return res.json();
}

// Tek bir anahtarla istek atar. retries=false ise 429/ağ hatasında beklemeden hemen hata verir
// (yedek anahtara geçilecekse vakit kaybetmemek için).
async function tmdbRequest(key, path, params = {}, retries = true) {
    const url = new URL('https://api.themoviedb.org/3' + path);
    Object.entries({ language: 'tr-TR', ...params }).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
    const headers = { accept: 'application/json' };
    if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
    else url.searchParams.set('api_key', key);
    return fetchJson(url.toString(), { headers, timeoutMs: TMDB_TIMEOUT_MS }, retries ? 0 : 2);
}

function tmdbErrorMessage(err) {
    if (err.status === 401) return 'TMDB anahtarı geçersiz. Ayarlar\'dan kontrol et.';
    if (err.status === 429) return 'TMDB istek sınırı aşıldı, biraz sonra tekrar dene.';
    return 'TMDB\'ye ulaşılamadı (' + err.message + ').';
}

// 404 gibi "anahtarla ilgisi olmayan" hatalarda yedek anahtara geçilmez
function isTmdbKeyFailure(err) {
    const s = err && err.status;
    return !s || s === 401 || s === 403 || s === 429 || s >= 500;
}

// options.noRetry: son anahtarda da bekleyip tekrar denemez (başka bir yedek kaynak varsa vakit kaybetmemek için)
async function tmdbFetch(path, params = {}, options = {}) {
    const all = getTmdbKeys();
    if (!all.length) throw new Error('TMDB anahtarı yok');
    // Yakın zamanda zaman aşımına uğradıysa ve yedek kaynak varsa tekrar bekletme
    if (options.noRetry && Date.now() < tmdbHostDownUntil) throw new Error(tmdbErrorMessage({ message: 'zaman aşımı' }));
    // Dinlenmede olmayanlar önce, sonra (son çare olarak) dinlenmedekiler
    const now = Date.now();
    const healthy = all.filter(k => (tmdbKeyCooldown.get(k) || 0) <= now);
    const resting = all.filter(k => !healthy.includes(k));
    const order = [...healthy, ...resting];

    let lastErr;
    for (let i = 0; i < order.length; i++) {
        const key = order[i];
        const isLast = i === order.length - 1;
        try {
            const data = await tmdbRequest(key, path, params, isLast && !options.noRetry);
            tmdbKeyCooldown.delete(key);
            tmdbHostDownUntil = 0;
            return data;
        } catch (err) {
            lastErr = err;
            if (err.timeout) {
                // Sunucu asılı: diğer anahtar da aynı sunucuya gidecek, boşuna bekleme
                tmdbHostDownUntil = Date.now() + 20 * 1000;
                break;
            }
            if (!isTmdbKeyFailure(err)) break;
            tmdbKeyCooldown.set(key, Date.now() + tmdbFailureCooldownMs(err.status));
        }
    }
    throw new Error(tmdbErrorMessage(lastErr));
}

function normalizeTitle(value) {
    return trLower(value)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9ğüşöçı]+/g, ' ')
        .trim();
}

// --- Tür → kategori/etiket eşleme ---
const GENRE_ALIASES = {
    'suc': ['polisiye', 'suç'], 'suç': ['polisiye', 'suç'], 'crime': ['polisiye', 'suç'],
    'fantazi': ['fantastik'], 'fantasy': ['fantastik'],
    'bilim kurgu': ['bilim kurgu'], 'science fiction': ['bilim kurgu'], 'science-fiction': ['bilim kurgu'], 'sci fi': ['bilim kurgu'],
    'action': ['aksiyon'], 'adventure': ['macera'], 'comedy': ['komedi'], 'drama': ['dram'],
    'horror': ['korku'], 'war': ['savaş'], 'politik': ['politik'], 'history': ['tarih'],
    'documentary': ['belgesel'], 'thriller': ['gerilim'], 'mystery': ['gizem'], 'gizem': ['gizem'],
    'anime': ['anime'], 'supernatural': ['paranormal'], 'romance': ['romantik'], 'romantik': ['romantik'],
    'family': ['aile'], 'animation': ['animasyon'], 'music': ['müzik'], 'western': ['western', 'vahşi batı']
};

function genreCandidates(genreName) {
    const parts = String(genreName || '').split(/&|,|\//).map(p => trLower(p).replace(/-/g, ' ').trim()).filter(Boolean);
    const out = new Set();
    parts.forEach(p => {
        out.add(p);
        (GENRE_ALIASES[p] || []).forEach(a => out.add(a));
    });
    return Array.from(out);
}

function matchGenres(genres, options = {}) {
    const categoryIds = new Set();
    const tagNames = new Set();
    const catByName = new Map(categoriesData.map(c => [trLower(c.name).replace(/-/g, ' '), c.id]));
    const allTags = new Set([
        ...tagsData.map(t => t.name),
        ...seriesData.flatMap(s => s.tags || []),
        ...moviesData.flatMap(m => m.tags || [])
    ]);
    const tagByName = new Map(Array.from(allTags).map(t => [trLower(t), t]));

    (genres || []).forEach(g => {
        genreCandidates(g).forEach(candidate => {
            if (catByName.has(candidate)) categoryIds.add(catByName.get(candidate));
            else if (tagByName.has(candidate)) tagNames.add(tagByName.get(candidate));
        });
    });

    const countries = (options.countries || []).map(c => String(c).toUpperCase());
    if (countries.includes('TR') && catByName.has('yerli')) categoryIds.add(catByName.get('yerli'));
    const isAnimation = (genres || []).some(g => /animasyon|animation|anime/i.test(g));
    if (isAnimation && countries.includes('JP') && catByName.has('anime')) categoryIds.add(catByName.get('anime'));

    return { categoryIds: Array.from(categoryIds), tagNames: Array.from(tagNames) };
}

// --- Platform eşleme ---
function mapPlatformName(name) {
    const n = trLower(name);
    if (!n) return '';
    if (n.includes('netflix')) return 'Netflix';
    if (n.includes('amazon') || n.includes('prime video')) return 'Amazon Prime';
    if (n.includes('disney')) return 'Disney+';
    if (n.includes('hbo') || n === 'max') return 'HBO Max';
    if (n.includes('blutv')) return 'BluTV';
    if (n.includes('exxen')) return 'Exxen';
    if (n.includes('gain')) return 'Gain';
    if (n.includes('tabii')) return 'Tabii';
    if (n === 'tod' || n.includes('tod tv')) return 'TOD';
    if (n.includes('apple')) return 'Apple TV+';
    return name;
}

function pickPlatform(details) {
    const providers = details['watch/providers'] && details['watch/providers'].results;
    const tr = providers && providers.TR;
    const list = tr && (tr.flatrate || tr.ads || tr.free);
    if (list && list.length) {
        const sorted = [...list].sort((a, b) => (a.display_priority || 99) - (b.display_priority || 99));
        return mapPlatformName(sorted[0].provider_name);
    }
    const network = details.networks && details.networks[0];
    return network ? mapPlatformName(network.name) : '';
}

// Türkiye'deki tüm yayın seçenekleri: abonelik (flatrate/ads/free), kiralık, satın alma
function pickProviders(details) {
    const results = details['watch/providers'] && details['watch/providers'].results;
    const tr = results && results.TR;
    if (!tr) return null;
    const names = list => (list || [])
        .slice()
        .sort((a, b) => (a.display_priority || 99) - (b.display_priority || 99))
        .map(p => mapPlatformName(p.provider_name))
        .filter(Boolean);
    return normalizeProviders({
        flatrate: [...names(tr.flatrate), ...names(tr.ads), ...names(tr.free)],
        rent: names(tr.rent),
        buy: names(tr.buy)
    });
}

// --- Fragman seçimi ---
function pickTrailer(videos) {
    const list = (videos && videos.results) || [];
    const scored = list
        .filter(v => v.site === 'YouTube' && v.key)
        .map(v => {
            let score = 0;
            if (v.type === 'Trailer') score += 4;
            else if (v.type === 'Teaser') score += 2;
            if (v.official) score += 1;
            if (v.iso_639_1 === 'tr') score += 3;
            else if (v.iso_639_1 === 'en') score += 1;
            return { v, score, date: getTimestamp(v.published_at) };
        })
        .sort((a, b) => (b.score - a.score) || (a.date - b.date));
    return scored.length ? 'https://www.youtube.com/watch?v=' + scored[0].v.key : '';
}

function pickTrReleaseDate(details) {
    const results = details.release_dates && details.release_dates.results;
    const tr = results && results.find(r => r.iso_3166_1 === 'TR');
    if (tr && tr.release_dates && tr.release_dates.length) {
        const preferred = tr.release_dates.find(r => r.type === 3) || tr.release_dates.find(r => r.type === 4) || tr.release_dates[0];
        if (preferred && preferred.release_date) return preferred.release_date.slice(0, 10);
    }
    return details.release_date || '';
}

async function fetchOmdbRating(imdbId) {
    const key = getApiKey('omdbKey');
    if (!key || !imdbId) return null;
    try {
        const data = await fetchJson(`https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(key)}`);
        const rating = parseFloat(data && data.imdbRating);
        return Number.isFinite(rating) ? rating : null;
    } catch (_) {
        return null;
    }
}

// --- Arama ---
async function searchTvmaze(query) {
    const data = await fetchJson('https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(query));
    return (data || []).slice(0, 8).map(({ show }) => ({
        source: 'tvmaze',
        id: show.id,
        title: show.name,
        originalTitle: '',
        year: (show.premiered || '').slice(0, 4),
        poster: show.image ? safeUrl(show.image.medium) : '',
        overview: stripHtml(show.summary)
    }));
}

// --- OMDb (filmler için yedek kaynak; anahtar Ayarlar'dan eklenir) ---
const OMDB_COUNTRY_CODES = {
    'turkey': 'TR', 'türkiye': 'TR', 'japan': 'JP', 'united states': 'US', 'usa': 'US',
    'united kingdom': 'GB', 'uk': 'GB', 'south korea': 'KR', 'france': 'FR', 'germany': 'DE'
};

function omdbCountryCodes(value) {
    return String(value || '').split(',').map(s => OMDB_COUNTRY_CODES[s.trim().toLowerCase()]).filter(Boolean);
}

// "16 Jul 2010" → "2010-07-16"
function parseOmdbDate(value) {
    const m = String(value || '').match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
    if (!m) return '';
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase());
    return month < 0 ? '' : `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

async function omdbRequest(params) {
    const key = getApiKey('omdbKey');
    if (!key) throw new Error('OMDb anahtarı yok');
    const url = new URL('https://www.omdbapi.com/');
    Object.entries({ ...params, apikey: key }).forEach(([k, v]) => url.searchParams.set(k, v));
    try {
        return await fetchJson(url.toString(), { timeoutMs: 8000 });
    } catch (err) {
        if (err.status === 401) throw new Error('OMDb anahtarı geçersiz veya günlük istek limiti doldu.');
        throw new Error('OMDb\'ye ulaşılamadı (' + err.message + ').');
    }
}

async function searchOmdb(query) {
    const data = await omdbRequest({ s: query, type: 'movie' });
    if (!data || data.Response !== 'True') {
        if (data && /not found|too many/i.test(data.Error || '')) return [];
        throw new Error('OMDb: ' + ((data && data.Error) || 'yanıt alınamadı'));
    }
    return (data.Search || []).slice(0, 8).map(m => mapOmdbSearchItem(m, 'omdb'));
}

// OMDb ve CollectAPI (OMDb verisini sarmalar) aynı kayıt biçimini kullanır
function mapOmdbSearchItem(m, source) {
    return {
        source,
        id: m.imdbID,
        title: m.Title,
        originalTitle: '',
        year: String(m.Year || '').slice(0, 4),
        poster: m.Poster && m.Poster !== 'N/A' ? safeUrl(m.Poster) : '',
        overview: ''
    };
}

function mapOmdbRecord(d, imdbId, source) {
    const clean = v => (v && v !== 'N/A') ? String(v) : '';
    const rating = parseFloat(d.imdbRating);
    return {
        source,
        imdbId: d.imdbID || imdbId,
        name: clean(d.Title),
        originalName: clean(d.Title),
        description: clean(d.Plot),
        imageUrl: safeUrl(clean(d.Poster)),
        imdbRating: Number.isFinite(rating) ? rating : null,
        trailerUrl: '',
        releaseDate: parseOmdbDate(d.Released),
        platform: '',
        genres: clean(d.Genre) ? clean(d.Genre).split(',').map(s => s.trim()).filter(Boolean) : [],
        countries: omdbCountryCodes(d.Country),
        seasons: []
    };
}

async function fetchOmdbDetails(imdbId) {
    const d = await omdbRequest({ i: imdbId, plot: 'full' });
    if (!d || d.Response !== 'True') throw new Error('OMDb: ' + ((d && d.Error) || 'yanıt alınamadı'));
    return mapOmdbRecord(d, imdbId, 'omdb');
}

// --- CollectAPI IMDB API (OMDb verisi; ücretsiz planda ayda 1.000 istek) ---
// minimal=true: sunucu tarafı "type" süzgeci ve content-type başlığı olmadan, yalnızca anahtar + sorgu ile istek
async function collectRequest(endpoint, params, minimal = false) {
    const key = getApiKey('collectKey').replace(/^apikey\s+/i, ''); // başında "apikey" ile yapıştırılmış olabilir
    if (!key) throw new Error('CollectAPI anahtarı yok');
    const url = new URL('https://api.collectapi.com/imdb/' + endpoint);
    Object.entries(params).forEach(([k, v]) => {
        if (minimal && k === 'type') return;
        if (v !== undefined && v !== '') url.searchParams.set(k, v);
    });
    const headers = { authorization: 'apikey ' + key };
    if (!minimal) headers['content-type'] = 'application/json';
    let data;
    try {
        data = await fetchJson(url.toString(), { headers, timeoutMs: 8000 });
    } catch (err) {
        if (err.status === 401 || err.status === 403) throw new Error('CollectAPI anahtarı geçersiz veya aylık istek limiti doldu.');
        // Sunucu hatasında bir kez sade istekle dene (kimi sunucular fazladan parametre/başlıkta takılabiliyor)
        if (err.status >= 500 && !minimal) return collectRequest(endpoint, params, true);
        // Sunucunun kendi hata mesajını göster (JSON ise "message" alanı, değilse düz metin)
        let detail = '';
        if (err.body) {
            try { const j = JSON.parse(err.body); detail = String(j.message || j.error || j.msg || '').trim(); } catch (_) { detail = String(err.body).replace(/<[^>]+>/g, ' ').trim(); }
        }
        throw new Error('CollectAPI\'ye ulaşılamadı (' + err.message + (detail ? ': ' + detail.slice(0, 120) : '') + ').');
    }
    if (!data || data.success === false) throw new Error('CollectAPI: ' + ((data && data.message) || 'yanıt alınamadı'));
    return data;
}

async function searchCollect(kind, query) {
    const wanted = kind === 'series' ? 'series' : 'movie';
    const data = await collectRequest('imdbSearchByName', { query, type: wanted });
    const list = Array.isArray(data.result) ? data.result : [];
    // Sunucu "type" süzgecini uygulamadıysa (sade istek) burada ayıkla
    return list.filter(m => !m.Type || m.Type === wanted).slice(0, 8).map(m => mapOmdbSearchItem(m, 'collect'));
}

async function fetchCollectDetails(imdbId) {
    const data = await collectRequest('imdbSearchById', { movieId: imdbId });
    const d = data.result;
    if (!d || Array.isArray(d) || d.Response === 'False') throw new Error('CollectAPI: kayıt bulunamadı');
    return mapOmdbRecord(d, imdbId, 'collect');
}

// TMDB yanıt vermezse sırayla denenecek yedek kaynaklar:
// diziler: TVmaze → CollectAPI, filmler: OMDb → CollectAPI (anahtarı kayıtlı olanlar)
function fallbackSources(kind) {
    const list = [];
    if (kind === 'series') list.push('tvmaze');
    if (kind === 'movie' && getApiKey('omdbKey')) list.push('omdb');
    if (getApiKey('collectKey')) list.push('collect');
    return list;
}

function hasFallbackSource(kind) {
    return fallbackSources(kind).length > 0;
}

function searchFromSource(source, kind, query) {
    if (source === 'tvmaze') return searchTvmaze(query);
    if (source === 'omdb') return searchOmdb(query);
    return searchCollect(kind, query);
}

function detailsFromSource(source, id) {
    if (source === 'tvmaze') return fetchTvmazeDetails(id);
    if (source === 'omdb') return fetchOmdbDetails(id);
    return fetchCollectDetails(id);
}

// Kaynakları sırayla dener: sonuç veren ilkini döndürür; hepsi boşsa [], hepsi hata verdiyse son hata
async function searchFallback(kind, query) {
    let lastErr = null, anyEmpty = false;
    for (const source of fallbackSources(kind)) {
        try {
            const results = await searchFromSource(source, kind, query);
            if (results.length) return results;
            anyEmpty = true;
        } catch (err) {
            lastErr = err;
        }
    }
    if (anyEmpty || !lastErr) return [];
    throw lastErr;
}

function fallbackSourceName(source) {
    return { omdb: 'OMDb', collect: 'CollectAPI' }[source] || 'TVmaze';
}

async function searchTitles(kind, query) {
    if (hasTmdbKey()) {
        try {
            // Yedek kaynak varsa TMDB'de gereksiz beklenmez
            const data = await tmdbFetch(kind === 'series' ? '/search/tv' : '/search/movie', { query, include_adult: 'false' }, { noRetry: hasFallbackSource(kind) });
            return (data.results || []).slice(0, 8).map(r => ({
                source: 'tmdb',
                id: r.id,
                title: kind === 'series' ? r.name : r.title,
                originalTitle: kind === 'series' ? r.original_name : r.original_title,
                year: ((kind === 'series' ? r.first_air_date : r.release_date) || '').slice(0, 4),
                poster: r.poster_path ? TMDB_IMG + 'w92' + r.poster_path : '',
                overview: r.overview || ''
            }));
        } catch (err) {
            if (!hasFallbackSource(kind)) throw err;
            // TMDB (tüm anahtarlar) yanıt vermedi: yedek kaynağa düş
            try {
                const results = await searchFallback(kind, query);
                results.forEach(r => { r.fallback = true; });
                return results;
            } catch (_) {
                throw err; // yedek de çalışmadıysa asıl TMDB hatasını göster
            }
        }
    }
    if (hasFallbackSource(kind)) return searchFallback(kind, query);
    throw new Error('Film araması için TMDB anahtarı gerekli. Sağ üstteki ⚙ Ayarlar\'dan ekleyebilirsin (ücretsiz).');
}

function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = String(html || '');
    return (div.textContent || '').trim();
}

// --- Detaylar: formda kullanılacak ortak yapı ---
async function fetchTitleDetails(kind, result) {
    if (['tvmaze', 'omdb', 'collect'].includes(result.source)) return detailsFromSource(result.source, result.id);
    try {
        return await fetchTmdbTitleDetails(kind, result);
    } catch (err) {
        if (!hasFallbackSource(kind)) throw err;
        // TMDB yanıt vermedi: başlığı adından yedek kaynaklarda sırayla bulup oradan doldur
        const names = [result.originalTitle, result.title].filter(Boolean);
        const wanted = names.map(normalizeTitle);
        if (names.length) {
            for (const source of fallbackSources(kind)) {
                try {
                    const found = await searchFromSource(source, kind, names[0]);
                    const match = found.find(r => wanted.includes(normalizeTitle(r.title)));
                    if (!match) continue;
                    const info = await detailsFromSource(source, match.id);
                    info.fallback = true;
                    return info;
                } catch (_) { /* sıradaki kaynağı dene */ }
            }
        }
        throw err; // güvenli eşleşme yoksa asıl TMDB hatasını göster
    }
}

async function fetchTmdbTitleDetails(kind, result) {
    const path = kind === 'series' ? `/tv/${result.id}` : `/movie/${result.id}`;
    const append = kind === 'series'
        ? 'videos,external_ids,watch/providers'
        : 'videos,external_ids,watch/providers,release_dates';
    const d = await tmdbFetch(path, { append_to_response: append, include_video_language: 'tr,en,null' }, { noRetry: hasFallbackSource(kind) });

    let description = d.overview || '';
    if (!description) {
        try {
            const en = await tmdbFetch(path, { language: 'en-US' });
            description = en.overview || '';
        } catch (_) {}
    }

    const imdbId = (d.external_ids && d.external_ids.imdb_id) || d.imdb_id || '';
    let rating = await fetchOmdbRating(imdbId);
    if (rating === null && d.vote_count > 10 && d.vote_average) rating = Math.round(d.vote_average * 10) / 10;

    const genres = (d.genres || []).map(g => g.name);
    const countries = kind === 'series'
        ? (d.origin_country || [])
        : (d.production_countries || []).map(c => c.iso_3166_1).concat(d.origin_country || []);

    const info = {
        source: 'tmdb',
        tmdbId: d.id,
        tmdbType: kind === 'series' ? 'tv' : 'movie',
        imdbId,
        name: kind === 'series' ? d.name : d.title,
        originalName: kind === 'series' ? d.original_name : d.original_title,
        description,
        imageUrl: d.poster_path ? TMDB_IMG + 'w500' + d.poster_path : '',
        imdbRating: rating,
        trailerUrl: pickTrailer(d.videos),
        releaseDate: kind === 'series' ? (d.first_air_date || '') : pickTrReleaseDate(d),
        platform: pickPlatform(d),
        providers: pickProviders(d),
        runtime: normalizeRuntime(kind === 'series'
            ? (Array.isArray(d.episode_run_time) ? d.episode_run_time[0] : null)
            : d.runtime),
        genres,
        countries,
        seasons: []
    };

    if (kind === 'series') {
        info.seasons = (d.seasons || [])
            .filter(s => s.season_number > 0 && (s.episode_count > 0 || s.air_date))
            .map(s => ({ season: s.season_number, totalEpisodes: s.episode_count || 0, releaseDate: s.air_date || null }));
        // Yayınlanacak bir sonraki bölüm yeni bir sezonun başlangıcıysa tarihini sezona yaz
        const next = d.next_episode_to_air;
        if (next && next.air_date) {
            const season = info.seasons.find(s => s.season === next.season_number);
            if (season && next.episode_number === 1) season.releaseDate = next.air_date;
        }
        if (!info.trailerUrl) {
            try {
                const vids = await tmdbFetch(`${path}/videos`, { language: 'en-US' });
                info.trailerUrl = pickTrailer(vids);
            } catch (_) {}
        }
    }
    return info;
}

async function fetchTvmazeDetails(id) {
    const [show, episodes, seasons] = await Promise.all([
        fetchJson(`https://api.tvmaze.com/shows/${id}`),
        fetchJson(`https://api.tvmaze.com/shows/${id}/episodes`).catch(() => []),
        fetchJson(`https://api.tvmaze.com/shows/${id}/seasons`).catch(() => [])
    ]);
    const counts = {};
    (episodes || []).forEach(ep => { if (ep.season > 0) counts[ep.season] = (counts[ep.season] || 0) + 1; });
    const seasonList = (seasons || []).filter(s => s.number > 0).map(s => ({
        season: s.number,
        totalEpisodes: Math.max(counts[s.number] || 0, s.episodeOrder || 0),
        releaseDate: s.premiereDate || null
    })).filter(s => s.totalEpisodes > 0 || s.releaseDate);

    const channel = show.webChannel ? show.webChannel.name : (show.network ? show.network.name : '');
    const country = (show.network && show.network.country && show.network.country.code) ||
        (show.webChannel && show.webChannel.country && show.webChannel.country.code) || '';
    const imdbId = show.externals && show.externals.imdb;
    let rating = await fetchOmdbRating(imdbId);
    if (rating === null && show.rating && show.rating.average) rating = show.rating.average;

    return {
        source: 'tvmaze',
        tvmazeId: show.id,
        imdbId: imdbId || '',
        name: show.name,
        originalName: show.name,
        description: stripHtml(show.summary),
        imageUrl: show.image ? safeUrl(show.image.original || show.image.medium) : '',
        imdbRating: rating,
        trailerUrl: '',
        releaseDate: show.premiered || '',
        platform: mapPlatformName(channel),
        genres: show.genres || [],
        countries: country ? [country] : [],
        seasons: seasonList
    };
}

// --- Form entegrasyonu ---
const autoFillState = {
    series: { extras: {}, timer: null, requestSeq: 0, lastQuery: '' },
    movie: { extras: {}, timer: null, requestSeq: 0, lastQuery: '' }
};

function autoFillEls(kind) {
    const prefix = kind === 'series' ? 'series' : 'movie';
    return {
        name: document.getElementById(prefix + 'Name'),
        status: document.getElementById(kind + 'AutoFillStatus'),
        results: document.getElementById(kind + 'AutoFillResults'),
        trailer: document.getElementById(prefix + 'TrailerUrl'),
        rating: document.getElementById(prefix + 'ImdbRating'),
        description: document.getElementById(prefix + 'Description'),
        image: document.getElementById(prefix + 'ImageUrl'),
        release: document.getElementById(prefix + 'ReleaseDate'),
        preview: document.getElementById(prefix + 'ImagePreview'),
        categorySelector: prefix === 'series' ? 'seriesCategorySelector' : 'movieCategorySelector',
        tagsContainer: prefix + 'TagsContainer'
    };
}

function setAutoFillStatus(kind, message, isError) {
    const el = autoFillEls(kind).status;
    if (!el) return;
    el.innerHTML = message || '';
    el.classList.toggle('error', !!isError);
}

function hideAutoFillResults(kind) {
    const el = autoFillEls(kind).results;
    if (el) {
        el.classList.add('hidden');
        el.innerHTML = '';
    }
}

function resetAutoFill(kind) {
    const state = autoFillState[kind];
    state.extras = {};
    state.lastQuery = '';
    clearTimeout(state.timer);
    state.requestSeq++;
    hideAutoFillResults(kind);
    const els = autoFillEls(kind);
    const hint = hasTmdbKey() || hasFallbackSource(kind)
        ? '<i class="fas fa-magic mr-1"></i>Adını yaz, çıkan listeden seç: bilgiler otomatik dolar.'
        : '<i class="fas fa-info-circle mr-1"></i>Otomatik doldurma için <button type="button" class="helper-link" data-open-settings>TMDB anahtarı ekle</button>.';
    setAutoFillStatus(kind, hint);
    document.querySelectorAll(`#${kind === 'series' ? 'seriesForm' : 'movieForm'} .form-group.autofilled`).forEach(g => g.classList.remove('autofilled'));
    updateImagePreview(els.image, els.preview);
}

function getAutoFillExtras(kind) {
    return { ...(autoFillState[kind] ? autoFillState[kind].extras : {}) };
}

function updateImagePreview(input, preview) {
    if (!input || !preview) return;
    const url = safeUrl(input.value);
    if (url) {
        preview.src = url;
        preview.classList.remove('hidden');
    } else {
        preview.removeAttribute('src');
        preview.classList.add('hidden');
    }
}

async function runAutoFillSearch(kind, query, { immediate } = {}) {
    const state = autoFillState[kind];
    const q = String(query || '').trim();
    if (q.length < 2) {
        hideAutoFillResults(kind);
        return;
    }
    if (!immediate && q === state.lastQuery) return;
    state.lastQuery = q;
    const seq = ++state.requestSeq;
    setAutoFillStatus(kind, '<i class="fas fa-spinner fa-spin mr-1"></i>İnternette aranıyor...');

    try {
        const results = await searchTitles(kind, q);
        if (seq !== state.requestSeq) return;
        renderAutoFillResults(kind, results);
        if (results.length === 0) setAutoFillStatus(kind, 'Sonuç bulunamadı. Farklı yazmayı veya orijinal adını denemeyi deneyebilirsin.');
        else setAutoFillStatus(kind, results[0].fallback
            ? 'TMDB şu an yanıt vermedi, yedek kaynak ' + fallbackSourceName(results[0].source) + ' kullanıldı. Doğru olanı seç. (Açıklama İngilizce, fragman yok.)'
            : results[0].source !== 'tmdb'
                ? 'Doğru olanı seç. (' + fallbackSourceName(results[0].source) + ' kaynağı: açıklama İngilizce, fragman yok. TMDB anahtarı eklersen hepsi Türkçe gelir.)'
                : 'Doğru olanı seç, bilgiler otomatik dolsun.');
    } catch (err) {
        if (seq !== state.requestSeq) return;
        hideAutoFillResults(kind);
        setAutoFillStatus(kind, esc(err.message), true);
    }
}

function renderAutoFillResults(kind, results) {
    const el = autoFillEls(kind).results;
    if (!el) return;
    if (!results.length) {
        hideAutoFillResults(kind);
        return;
    }
    el.innerHTML = results.map((r, i) => `
        <button type="button" class="autofill-result" data-index="${i}">
            ${r.poster ? `<img src="${esc(r.poster)}" alt="" loading="lazy">` : '<span class="noposter"><i class="fas fa-image"></i></span>'}
            <span class="min-w-0">
                <span class="title block">${esc(r.title)}${r.year ? ` <span class="sub">(${esc(r.year)})</span>` : ''}</span>
                ${r.originalTitle && r.originalTitle !== r.title ? `<span class="sub block">${esc(r.originalTitle)}</span>` : ''}
                ${r.overview ? `<span class="overview">${esc(r.overview)}</span>` : ''}
            </span>
        </button>
    `).join('');
    el.classList.remove('hidden');
    el.querySelectorAll('.autofill-result').forEach(btn => {
        btn.addEventListener('click', () => applyAutoFillResult(kind, results[Number(btn.getAttribute('data-index'))]));
    });
}

function markAutofilled(input) {
    const group = input && input.closest('.form-group');
    if (group) group.classList.add('autofilled');
}

async function applyAutoFillResult(kind, result) {
    const state = autoFillState[kind];
    const seq = ++state.requestSeq;
    hideAutoFillResults(kind);
    setAutoFillStatus(kind, `<i class="fas fa-spinner fa-spin mr-1"></i>"${esc(result.title)}" bilgileri getiriliyor...`);

    let info;
    try {
        info = await fetchTitleDetails(kind, result);
    } catch (err) {
        if (seq === state.requestSeq) setAutoFillStatus(kind, esc(err.message), true);
        return;
    }
    if (seq !== state.requestSeq) return;

    const els = autoFillEls(kind);
    const setField = (input, value) => {
        if (!input || value === undefined || value === null || value === '') return false;
        input.value = value;
        markAutofilled(input);
        return true;
    };

    setField(els.name, info.name);
    setField(els.description, info.description);
    setField(els.image, info.imageUrl);
    setField(els.rating, info.imdbRating != null ? info.imdbRating : '');
    setField(els.release, info.releaseDate);
    const trailerFilled = setField(els.trailer, info.trailerUrl);
    updateImagePreview(els.image, els.preview);

    if (info.platform) {
        const platformId = kind === 'series' ? 'seriesPlatform' : 'moviePlatform';
        setPlatformValue(platformId, info.platform);
        markAutofilled(document.getElementById(platformId));
    }

    // Kategoriler ve etiketler: mevcut seçime ekle
    const matched = matchGenres(info.genres, { countries: info.countries });
    const currentCats = getSelectedCategories(els.categorySelector);
    setSelectedCategories(els.categorySelector, Array.from(new Set([...currentCats, ...matched.categoryIds])));
    const container = document.getElementById(els.tagsContainer);
    const input = container.querySelector('.tag-input');
    matched.tagNames.forEach(tag => {
        const exists = Array.from(container.querySelectorAll('.tag')).some(t => t.getAttribute('data-tag') === tag);
        if (!exists) container.insertBefore(createTagElement(tag, container, true), input);
    });

    if (kind === 'series' && info.seasons.length) mergeSeasonsIntoForm(info.seasons);

    state.extras = {
        runtime: normalizeRuntime(info.runtime) || undefined,
        providers: info.providers || undefined,
        providersAt: info.providers ? new Date().toISOString() : undefined,
        tmdbId: info.tmdbId || undefined,
        tmdbType: info.tmdbType || undefined,
        tvmazeId: info.tvmazeId || undefined,
        imdbId: info.imdbId || undefined,
        originalName: info.originalName || undefined
    };
    Object.keys(state.extras).forEach(k => state.extras[k] === undefined && delete state.extras[k]);

    const notes = [];
    if (!trailerFilled) notes.push('fragman bulunamadı (<button type="button" class="helper-link" data-helper="youtube" data-kind="' + kind + '">YouTube\'da ara</button>)');
    if (matched.categoryIds.length === 0 && info.genres.length) notes.push('türler (' + esc(info.genres.join(', ')) + ') mevcut kategorilerinle eşleşmedi');
    setAutoFillStatus(kind, '<i class="fas fa-check-circle text-green-500 mr-1"></i>Bilgiler dolduruldu. Kontrol edip Kaydet\'e bas.' +
        (notes.length ? '<br><span class="opacity-80">Not: ' + notes.join('; ') + '.</span>' : ''));
}

// TMDB sezonlarını formdaki sezonlarla birleştir (izlenen bölümler korunur)
function mergeSeasonsIntoForm(fetchedSeasons) {
    const container = document.getElementById('seasonsContainer');
    const rows = Array.from(container.querySelectorAll('.season-form-item'));
    // Ekleme modunda boş varsayılan satırı kaldır
    rows.forEach(row => {
        const total = row.querySelector('.season-total-episodes').value;
        const watched = toInt(row.querySelector('.season-watched-episodes').value);
        if (!row.getAttribute('data-season-id') && !total && !watched) row.remove();
    });

    fetchedSeasons.forEach(fs => {
        const existing = Array.from(container.querySelectorAll('.season-form-item'))
            .find(row => toInt(row.querySelector('.season-number').value) === fs.season);
        if (existing) {
            const totalInput = existing.querySelector('.season-total-episodes');
            const watched = toInt(existing.querySelector('.season-watched-episodes').value);
            if (fs.totalEpisodes > 0) totalInput.value = Math.max(fs.totalEpisodes, watched);
            if (fs.releaseDate) existing.setAttribute('data-release-date', fs.releaseDate);
        } else {
            container.appendChild(createSeasonFormRow({
                season: fs.season,
                totalEpisodes: fs.totalEpisodes || '',
                watchedEpisodes: 0,
                releaseDate: fs.releaseDate
            }));
        }
    });

    // Sezon numarasına göre sırala
    Array.from(container.querySelectorAll('.season-form-item'))
        .sort((a, b) => toInt(a.querySelector('.season-number').value) - toInt(b.querySelector('.season-number').value))
        .forEach(row => container.appendChild(row));
    if (!container.querySelector('.season-form-item')) container.appendChild(createSeasonFormRow({ season: 1 }));
}

function setupAutoFill() {
    ['series', 'movie'].forEach(kind => {
        const els = autoFillEls(kind);
        const state = autoFillState[kind];

        els.name.addEventListener('input', () => {
            clearTimeout(state.timer);
            state.timer = setTimeout(() => runAutoFillSearch(kind, els.name.value), 450);
        });
        els.name.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !els.results.classList.contains('hidden')) {
                e.stopPropagation();
                hideAutoFillResults(kind);
            } else if (e.key === 'ArrowDown') {
                const first = els.results.querySelector('.autofill-result');
                if (first) { e.preventDefault(); first.focus(); }
            }
        });
        els.results.addEventListener('keydown', e => {
            const current = document.activeElement;
            if (!current || !current.classList.contains('autofill-result')) return;
            if (e.key === 'ArrowDown' && current.nextElementSibling) { e.preventDefault(); current.nextElementSibling.focus(); }
            if (e.key === 'ArrowUp') { e.preventDefault(); (current.previousElementSibling || els.name).focus(); }
            if (e.key === 'Escape') { e.stopPropagation(); hideAutoFillResults(kind); els.name.focus(); }
        });
        els.image.addEventListener('input', () => updateImagePreview(els.image, els.preview));
        els.preview.addEventListener('error', () => els.preview.classList.add('hidden'));
    });

    document.addEventListener('click', e => {
        const target = e.target;
        if (!(target instanceof Element)) return;

        const searchBtn = target.closest('.autofill-search-btn');
        if (searchBtn) {
            const kind = searchBtn.getAttribute('data-kind');
            runAutoFillSearch(kind, autoFillEls(kind).name.value, { immediate: true });
            return;
        }

        if (target.closest('[data-open-settings]')) {
            openSettingsModal();
            return;
        }

        const helper = target.closest('.helper-link[data-helper]');
        if (helper) {
            const kind = helper.getAttribute('data-kind');
            const name = autoFillEls(kind).name.value.trim();
            if (!name) { alert('Önce adını yaz.'); return; }
            const q = encodeURIComponent(name + (helper.getAttribute('data-helper') === 'youtube' ? ' fragman' : ' poster'));
            const url = helper.getAttribute('data-helper') === 'youtube'
                ? 'https://www.youtube.com/results?search_query=' + q
                : 'https://www.google.com/search?tbm=isch&q=' + q;
            window.open(url, '_blank', 'noopener');
            return;
        }

        // Sonuç listesi dışına tıklanınca kapat
        ['series', 'movie'].forEach(kind => {
            const group = autoFillEls(kind).name.closest('.autofill-group');
            if (group && !group.contains(target)) hideAutoFillResults(kind);
        });
    });
}

// --- Ayarlar modalı ---
const settingsModal = document.getElementById('settingsModal');

function openSettingsModal() {
    document.getElementById('tmdbKeyInput').value = getApiKey('tmdbKey');
    const tmdbKey2El = document.getElementById('tmdbKey2Input'); // eski önbellekli HTML'de olmayabilir
    if (tmdbKey2El) tmdbKey2El.value = getApiKey('tmdbKey2');
    document.getElementById('omdbKeyInput').value = getApiKey('omdbKey');
    const collectInputEl = document.getElementById('collectKeyInput'); // eski önbellekli HTML'de olmayabilir
    if (collectInputEl) collectInputEl.value = getApiKey('collectKey');
    const savedCount = getTmdbKeys().length;
    document.getElementById('apiKeyStatus').innerHTML = savedCount
        ? '<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>' +
          (savedCount > 1 ? '2 TMDB anahtarı kayıtlı (biri sorun çıkarırsa diğerine geçilir).' : 'TMDB anahtarı kayıtlı.') + '</span>'
        : '<span class="opacity-80">Henüz TMDB anahtarı eklenmedi.</span>';
    settingsModal.classList.add('active');
}

document.getElementById('openSettings').addEventListener('click', openSettingsModal);
document.getElementById('closeSettingsModal').addEventListener('click', () => closeModal(settingsModal));
document.getElementById('toggleTmdbKey').addEventListener('click', () => {
    const inputs = ['tmdbKeyInput', 'tmdbKey2Input', 'collectKeyInput'].map(id => document.getElementById(id)).filter(Boolean);
    const type = inputs[0].type === 'password' ? 'text' : 'password';
    inputs.forEach(input => { input.type = type; });
});

document.getElementById('saveApiKeysBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById('apiKeyStatus');
    const tmdbKey = document.getElementById('tmdbKeyInput').value.trim();
    const tmdbKey2Input = document.getElementById('tmdbKey2Input');
    const collectInputEl = document.getElementById('collectKeyInput');
    // Alan eski önbellekli HTML'de yoksa o anahtara dokunma
    const tmdbKey2 = tmdbKey2Input ? tmdbKey2Input.value.trim() : getApiKey('tmdbKey2');
    const omdbKey = document.getElementById('omdbKeyInput').value.trim();
    const collectKey = collectInputEl ? collectInputEl.value.trim() : getApiKey('collectKey');
    if (tmdbKey) __origSetItem('tmdbKey', tmdbKey); else localStorage.removeItem('tmdbKey');
    if (tmdbKey2Input) { if (tmdbKey2) __origSetItem('tmdbKey2', tmdbKey2); else localStorage.removeItem('tmdbKey2'); }
    if (omdbKey) __origSetItem('omdbKey', omdbKey); else localStorage.removeItem('omdbKey');
    if (collectInputEl) { if (collectKey) __origSetItem('collectKey', collectKey); else localStorage.removeItem('collectKey'); }
    resetTmdbKeyCooldown();

    const messages = [];
    if (tmdbKey || tmdbKey2) {
        statusEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Test ediliyor...';
        // Her anahtar ayrı ayrı test edilir (yedeğe geçiş testi bozmasın diye tmdbRequest ile)
        const toTest = [['TMDB anahtarı', tmdbKey], ['Yedek TMDB anahtarı', tmdbKey2]].filter(([, k]) => k);
        for (const [label, key] of toTest) {
            try {
                const data = await tmdbRequest(key, '/search/movie', { query: 'Inception' });
                messages.push(data && Array.isArray(data.results)
                    ? '<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>' + label + ' çalışıyor.</span>'
                    : '<span class="text-red-500">' + label + ': TMDB beklenmeyen yanıt verdi.</span>');
            } catch (err) {
                messages.push('<span class="text-red-500"><i class="fas fa-times-circle mr-1"></i>' + label + ': ' + esc(tmdbErrorMessage(err)) + '</span>');
            }
        }
    } else {
        messages.push('<span class="opacity-80">TMDB anahtarı kaldırıldı.</span>');
    }
    if (omdbKey) {
        try {
            const data = await fetchJson(`https://www.omdbapi.com/?i=tt1375666&apikey=${encodeURIComponent(omdbKey)}`);
            messages.push(data && data.Response === 'True'
                ? '<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>OMDb anahtarı çalışıyor.</span>'
                : '<span class="text-red-500">OMDb anahtarı geçersiz: ' + esc(data && data.Error) + '</span>');
        } catch (err) {
            messages.push('<span class="text-red-500">OMDb test edilemedi: ' + esc(err.message) + '</span>');
        }
    }
    if (collectKey) {
        try {
            const results = await searchCollect('movie', 'Inception');
            messages.push(results.length
                ? '<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>CollectAPI anahtarı çalışıyor.</span>'
                : '<span class="text-red-500">CollectAPI beklenmeyen (boş) yanıt verdi.</span>');
        } catch (err) {
            messages.push('<span class="text-red-500"><i class="fas fa-times-circle mr-1"></i>' + esc(err.message) + '</span>');
        }
    }
    statusEl.innerHTML = messages.join('<br>');
    resetAutoFill('series');
    resetAutoFill('movie');
});

// --- Toplu eksik tamamlama ---
let bulkFillRunning = false;
let bulkFillStop = false;

function isEmptyField(value) {
    return value === undefined || value === null || value === '';
}

function itemNeedsFill(item) {
    if (!hasProviders(item)) return true;
    return ['imageUrl', 'trailerUrl', 'description', 'imdbRating', 'releaseDate', 'runtime'].some(f => isEmptyField(item[f]));
}

async function findExactMatch(kind, item) {
    const results = await searchTitles(kind, item.originalName || item.name);
    const wanted = [item.name, item.originalName].filter(Boolean).map(normalizeTitle);
    return results.find(r => wanted.includes(normalizeTitle(r.title)) || wanted.includes(normalizeTitle(r.originalTitle))) || null;
}

async function fillItem(kind, item, options) {
    let info;
    if (item.tmdbId && hasTmdbKey()) {
        info = await fetchTitleDetails(kind, { source: 'tmdb', id: item.tmdbId, title: item.name, originalTitle: item.originalName });
    } else if (item.tvmazeId && !hasTmdbKey() && kind === 'series') {
        info = await fetchTitleDetails(kind, { source: 'tvmaze', id: item.tvmazeId });
    } else if (kind === 'movie' && !hasTmdbKey() && item.imdbId && (getApiKey('omdbKey') || getApiKey('collectKey'))) {
        info = await fetchTitleDetails(kind, { source: getApiKey('omdbKey') ? 'omdb' : 'collect', id: item.imdbId });
    } else {
        const match = await findExactMatch(kind, item);
        if (!match) return { status: 'nomatch' };
        info = await fetchTitleDetails(kind, match);
    }

    const filled = [];
    const fill = (field, value, label) => {
        if (isEmptyField(item[field]) && !isEmptyField(value)) {
            item[field] = value;
            filled.push(label);
        }
    };
    fill('imageUrl', info.imageUrl, 'poster');
    fill('trailerUrl', info.trailerUrl, 'fragman');
    // Anahtarsız kaynağın açıklamaları İngilizce; Türkçe listeye toplu olarak yazma
    if (info.source === 'tmdb') fill('description', info.description, 'açıklama');
    fill('imdbRating', info.imdbRating, 'puan');
    fill('releaseDate', info.releaseDate || null, 'tarih');
    fill('runtime', normalizeRuntime(info.runtime), 'süre');
    // Yayın hakları zamanla değişir: bu alan boş olmasa da güncellenir
    if (info.providers) {
        const before = JSON.stringify(item.providers || null);
        item.providers = info.providers;
        item.providersAt = new Date().toISOString();
        if (before !== JSON.stringify(item.providers)) filled.push('nerede izlenir');
    }
    if ((!item.platform || item.platform === 'Diğer') && info.platform) {
        item.platform = info.platform;
        filled.push('platform');
    }
    if (options.categories && (!item.categories || item.categories.length === 0)) {
        const matched = matchGenres(info.genres, { countries: info.countries });
        if (matched.categoryIds.length) {
            item.categories = matched.categoryIds;
            filled.push('kategori');
        }
    }
    if (kind === 'series' && options.addSeasons) {
        const known = new Set(item.seasons.map(s => s.season));
        const added = info.seasons.filter(s => !known.has(s.season) && s.totalEpisodes > 0);
        added.forEach(s => item.seasons.push(normalizeSeason({ ...s, watchedEpisodes: 0 })));
        // Mevcut sezonların tarihlerini ve eksik bölüm sayılarını tamamla
        info.seasons.forEach(s => {
            const existing = item.seasons.find(x => x.season === s.season);
            if (existing && !existing.releaseDate && s.releaseDate) existing.releaseDate = s.releaseDate;
            if (existing && s.totalEpisodes > existing.totalEpisodes) existing.totalEpisodes = s.totalEpisodes;
        });
        item.seasons.sort((a, b) => a.season - b.season);
        if (added.length) filled.push(added.length + ' yeni sezon');
    }
    if (info.tmdbId && !item.tmdbId) item.tmdbId = info.tmdbId;
    if (info.tvmazeId && !item.tvmazeId) item.tvmazeId = info.tvmazeId;
    if (info.imdbId && !item.imdbId) item.imdbId = info.imdbId;
    if (filled.length) item.updatedAt = new Date().toISOString();
    return { status: filled.length ? 'filled' : 'unchanged', filled };
}

document.getElementById('startBulkFillBtn').addEventListener('click', async () => {
    if (bulkFillRunning) return;
    const addSeasons = document.getElementById('bulkFillAddSeasons').checked;
    const categories = document.getElementById('bulkFillCategories').checked;
    if (!hasTmdbKey()) {
        if (!confirm('TMDB anahtarı yok. Diziler TVmaze ile, filmler (OMDb veya CollectAPI anahtarı varsa) onlarla; sınırlı (İngilizce) kaynakla tamamlanacak. Devam edilsin mi?')) return;
    }

    const queue = [
        ...seriesData.filter(s => itemNeedsFill(s) || addSeasons).map(item => ({ kind: 'series', item })),
        ...((hasTmdbKey() || hasFallbackSource('movie')) ? moviesData.filter(itemNeedsFill).map(item => ({ kind: 'movie', item })) : [])
    ];
    if (queue.length === 0) {
        alert('Tamamlanacak eksik bilgi bulunamadı.');
        return;
    }

    createSnapshot('Eksikleri tamamlama öncesi');
    bulkFillRunning = true;
    bulkFillStop = false;
    const startBtn = document.getElementById('startBulkFillBtn');
    const stopBtn = document.getElementById('stopBulkFillBtn');
    const progress = document.getElementById('bulkFillProgress');
    const fillBar = document.getElementById('bulkFillProgressFill');
    const text = document.getElementById('bulkFillProgressText');
    const log = document.getElementById('bulkFillLog');
    startBtn.disabled = true;
    stopBtn.classList.remove('hidden');
    progress.classList.remove('hidden');
    log.classList.remove('hidden');
    log.innerHTML = '';

    const counts = { filled: 0, nomatch: 0, unchanged: 0, error: 0 };
    const addLog = html => {
        const div = document.createElement('div');
        div.innerHTML = html;
        log.prepend(div);
    };

    for (let i = 0; i < queue.length && !bulkFillStop; i++) {
        const { kind, item } = queue[i];
        text.textContent = `${i + 1} / ${queue.length} — ${item.name}`;
        fillBar.style.width = `${((i + 1) / queue.length) * 100}%`;
        try {
            const result = await fillItem(kind, item, { addSeasons, categories });
            counts[result.status]++;
            if (result.status === 'filled') addLog(`<i class="fas fa-check text-green-500 mr-1"></i>${esc(item.name)}: ${esc(result.filled.join(', '))}`);
            if (result.status === 'nomatch') addLog(`<i class="fas fa-question text-amber-500 mr-1"></i>${esc(item.name)}: birebir eşleşme bulunamadı (düzenle ekranındaki ✨ ile elle seçebilirsin)`);
        } catch (err) {
            counts.error++;
            addLog(`<i class="fas fa-times text-red-500 mr-1"></i>${esc(item.name)}: ${esc(err.message)}`);
            if (/anahtar|sınır/i.test(err.message)) break;
        }
        if ((i + 1) % 10 === 0) {
            localStorage.setItem('seriesData', JSON.stringify(seriesData));
            localStorage.setItem('moviesData', JSON.stringify(moviesData));
        }
        await new Promise(r => setTimeout(r, hasTmdbKey() ? 150 : 600));
    }

    localStorage.setItem('seriesData', JSON.stringify(seriesData));
    localStorage.setItem('moviesData', JSON.stringify(moviesData));
    refreshAll();

    text.textContent = `${bulkFillStop ? 'Durduruldu' : 'Bitti'}: ${counts.filled} kayıt tamamlandı, ${counts.nomatch} eşleşmedi, ${counts.unchanged} değişmedi${counts.error ? ', ' + counts.error + ' hata' : ''}.`;
    bulkFillRunning = false;
    startBtn.disabled = false;
    stopBtn.classList.add('hidden');
});

document.getElementById('stopBulkFillBtn').addEventListener('click', () => { bulkFillStop = true; });

setupAutoFill();

// --- İstatistikler ---
function renderBarRows(entries) {
    if (!entries.length) return '<p class="text-sm opacity-70">Henüz veri yok.</p>';
    const max = Math.max(...entries.map(e => e.count), 1);
    return entries.map(e => `
        <div class="stats-bar-row">
            <span class="name" title="${esc(e.name)}">${esc(e.name)}</span>
            <span class="track"><span class="fill" style="display:block;width:${(e.count / max) * 100}%;${e.color ? `background:${safeColor(e.color)}` : ''}"></span></span>
            <span class="count">${e.count}</span>
        </div>`).join('');
}

function renderStats() {
    const kpis = document.getElementById('statsKpis');
    if (!kpis) return;

    const watchedEpisodes = seriesData.reduce((sum, s) => sum + getSeriesTotals(s).watched, 0);
    const totalEpisodes = seriesData.reduce((sum, s) => sum + getSeriesTotals(s).total, 0);
    const completedSeries = seriesData.filter(s => getSeriesTotals(s).status === 'completed').length;
    const watchedMovies = moviesData.filter(m => m.watched).length;
    const kpiItems = [
        { label: 'İzlenen bölüm', value: watchedEpisodes, sub: totalEpisodes ? `/ ${totalEpisodes} (%${Math.round(watchedEpisodes / totalEpisodes * 100)})` : '' },
        { label: 'Tamamlanan dizi', value: completedSeries, sub: `/ ${seriesData.length}` },
        { label: 'İzlenen film', value: watchedMovies, sub: `/ ${moviesData.length}` },
        { label: 'Yakında çıkacak', value: getUpcomingContent().length, sub: '' }
    ];
    kpis.innerHTML = kpiItems.map(k => `
        <div class="stats-kpi">
            <div class="value">${k.value}<span class="text-sm font-normal opacity-60 ml-1">${esc(k.sub)}</span></div>
            <div class="label">${esc(k.label)}</div>
        </div>`).join('');

    const statusLabels = { watching: 'İzleniyor', planning: 'Planlanıyor', completed: 'Tamamlandı', paused: 'Duraklatıldı', dropped: 'Bırakıldı' };
    const statusCounts = {};
    seriesData.forEach(s => { const st = getSeriesTotals(s).status; statusCounts[st] = (statusCounts[st] || 0) + 1; });
    document.getElementById('statsSeriesStatus').innerHTML = renderBarRows(
        Object.keys(statusLabels).filter(k => statusCounts[k]).map(k => ({ name: statusLabels[k], count: statusCounts[k] }))
    );

    document.getElementById('statsCategories').innerHTML = renderBarRows(
        categoriesData.map(c => ({
            name: c.name,
            color: c.color,
            count: seriesData.filter(s => s.categories.includes(c.id)).length + moviesData.filter(m => m.categories.includes(c.id)).length
        })).filter(e => e.count > 0).sort((a, b) => b.count - a.count)
    );

    const platformCounts = {};
    [...seriesData, ...moviesData].forEach(x => { const p = x.platform || 'Diğer'; platformCounts[p] = (platformCounts[p] || 0) + 1; });
    document.getElementById('statsPlatforms').innerHTML = renderBarRows(
        Object.entries(platformCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    );

    const all = [
        ...seriesData.map(s => ({ ...s, type: 'Dizi' })),
        ...moviesData.map(m => ({ ...m, type: 'Film' }))
    ];
    const rated = all.filter(x => x.myRating != null).sort((a, b) => b.myRating - a.myRating).slice(0, 8);
    document.getElementById('statsTopRated').innerHTML = rated.length
        ? rated.map(x => `<div class="stats-list-item"><span>${esc(x.name)} <span class="opacity-60 text-xs">${x.type}</span></span><span class="text-pink-500"><i class="fas fa-heart"></i> ${esc(x.myRating)}</span></div>`).join('')
        : '<p class="text-sm opacity-70">Kayıtlara "Benim Puanım" verdiğinde burada listelenir.</p>';

    const recent = all
        .map(x => ({ ...x, ts: x.type === 'Dizi' ? getSeriesLastWatchedTimestamp(x) : getLastWatchedTimestamp(x) }))
        .filter(x => x.ts > 0)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 10);
    document.getElementById('statsRecent').innerHTML = recent.length
        ? recent.map(x => `<div class="stats-list-item"><span>${esc(x.name)} <span class="opacity-60 text-xs">${x.type}</span></span><span class="opacity-70">${esc(new Date(x.ts).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }))}</span></div>`).join('')
        : '<p class="text-sm opacity-70">Henüz izleme kaydı yok.</p>';

    renderYearSummary();
}

// =====================================================================
// İzleme günlüğü (yıllık özet için) — yalnızca bu cihazda tutulur, yedeğe girer
// =====================================================================
const WATCH_LOG_KEY = 'watchLog';
const WATCH_LOG_MAX = 3000;
const DEFAULT_EPISODE_MINUTES = 45;
const DEFAULT_MOVIE_MINUTES = 110;

function getWatchLog() {
    const list = safeParse(WATCH_LOG_KEY, []);
    return Array.isArray(list) ? list.filter(e => e && e.t) : [];
}

function saveWatchLog(list) {
    try {
        const trimmed = list.length > WATCH_LOG_MAX ? list.slice(list.length - WATCH_LOG_MAX) : list;
        __origSetItem(WATCH_LOG_KEY, JSON.stringify(trimmed));
    } catch (_) { /* kota dolduysa günlük tutulmaz, uygulama çalışmaya devam eder */ }
}

// entry: { k:'series'|'movie', id, n: bölüm sayısı (geri almada negatif), m: dakika }
function logWatch(entry) {
    const log = getWatchLog();
    log.push({ t: new Date().toISOString(), ...entry });
    saveWatchLog(log);
}

function episodeMinutes(series) {
    return normalizeRuntime(series && series.runtime) || DEFAULT_EPISODE_MINUTES;
}

function movieMinutes(movie) {
    return normalizeRuntime(movie && movie.runtime) || DEFAULT_MOVIE_MINUTES;
}

// =====================================================================
// İzleme işlemleri (kart, "Ne izlesem?" ve toplu işlemler ortak kullanır)
// =====================================================================

// Bir sezonun izlenen bölüm sayısını doğrudan ayarla. Değişim olduysa true döner.
function setSeasonWatched(seriesId, seasonId, count, options = {}) {
    const series = findSeries(seriesId);
    if (!series) return false;
    const season = series.seasons.find(s => String(s.id) === String(seasonId));
    if (!season) return false;
    const target = Math.max(0, Math.min(Number(count) || 0, season.totalEpisodes || 0));
    const delta = target - season.watchedEpisodes;
    if (delta === 0) return false;

    const now = new Date().toISOString();
    season.watchedEpisodes = target;
    season.lastWatchedAt = target > 0 ? now : null;
    season.updatedAt = now;
    series.updatedAt = now;
    refreshSeriesLastWatched(series);
    localStorage.setItem('seriesData', JSON.stringify(seriesData));
    if (!options.silent) logWatch({ k: 'series', id: series.id, n: delta, m: delta * episodeMinutes(series) });
    return true;
}

function setMovieWatched(movieId, watched) {
    const movie = moviesData.find(m => String(m.id) === String(movieId));
    if (!movie || !!movie.watched === !!watched) return false;
    const now = new Date().toISOString();
    movie.watched = !!watched;
    movie.lastWatchedAt = watched ? now : null;
    movie.updatedAt = now;
    localStorage.setItem('moviesData', JSON.stringify(moviesData));
    logWatch({ k: 'movie', id: movie.id, n: watched ? 1 : -1, m: (watched ? 1 : -1) * movieMinutes(movie) });
    return true;
}

// Listenin üstüne sabitle / sabitlemeyi kaldır
function togglePin(kind, id) {
    const list = kind === 'series' ? seriesData : moviesData;
    const item = list.find(x => String(x.id) === String(id));
    if (!item) return;
    item.pinned = !item.pinned;
    item.updatedAt = new Date().toISOString();
    localStorage.setItem(kind === 'series' ? 'seriesData' : 'moviesData', JSON.stringify(list));
    if (kind === 'series') filterSeries(); else filterMovies();
    showToast(item.pinned ? `"${item.name}" en üste sabitlendi.` : `"${item.name}" sabitlemeden çıkarıldı.`);
}

// Diziyi baştan izlemeye başla: tekrar sayacını artır, bölümleri sıfırla
function startSeriesRewatch(id) {
    const series = findSeries(id);
    if (!series) return;
    const totals = getSeriesTotals(series);
    if (!confirm(`"${series.name}" baştan izlenmiş sayılacak: tüm sezonların bölüm ilerlemesi sıfırlanacak ve tekrar izleme sayısı ${(series.rewatchCount || 0) + 1} olacak.\n\nDevam edilsin mi?`)) return;

    const before = series.seasons.map(season => ({ id: season.id, watched: season.watchedEpisodes, lastWatchedAt: season.lastWatchedAt }));
    // Sıfırlama bir "geri alma" değil, bu yüzden günlüğe eksi bölüm yazılmaz
    series.seasons.forEach(season => setSeasonWatched(series.id, season.id, 0, { silent: true }));
    series.rewatchCount = normalizeCount(series.rewatchCount) + 1;
    series.updatedAt = new Date().toISOString();
    localStorage.setItem('seriesData', JSON.stringify(seriesData));
    refreshAll();
    showToast(`"${series.name}" ${series.rewatchCount}. kez izlemeye hazır. ${totals.watched} bölümlük ilerleme sıfırlandı.`, {
        actionLabel: 'Geri Al',
        duration: 9000,
        onAction: () => {
            before.forEach(({ id: seasonId, watched, lastWatchedAt }) => {
                setSeasonWatched(series.id, seasonId, watched, { silent: true });
                const season = series.seasons.find(x => String(x.id) === String(seasonId));
                if (season) season.lastWatchedAt = lastWatchedAt;
            });
            series.rewatchCount = Math.max(0, normalizeCount(series.rewatchCount) - 1);
            refreshSeriesLastWatched(series);
            localStorage.setItem('seriesData', JSON.stringify(seriesData));
            refreshAll();
        }
    });
}

// Filmi bir kez daha izledim
function markMovieRewatch(id) {
    const movie = moviesData.find(m => String(m.id) === String(id));
    if (!movie) return;
    const now = new Date().toISOString();
    movie.rewatchCount = normalizeCount(movie.rewatchCount) + 1;
    movie.watched = true;
    movie.lastWatchedAt = now;
    movie.updatedAt = now;
    localStorage.setItem('moviesData', JSON.stringify(moviesData));
    logWatch({ k: 'movie', id: movie.id, n: 1, m: movieMinutes(movie) });
    refreshAll();
    showToast(`"${movie.name}" ${movie.rewatchCount + 1}. kez izlendi olarak kaydedildi.`);
}

// Kartlardaki tekrar izleme rozeti
function renderRewatchBadge(item) {
    const count = normalizeCount(item.rewatchCount);
    if (!count) return '';
    return `<span class="rewatch-badge" title="${esc(count)} kez tekrar izledin (toplam ${esc(count + 1)} izleme)"><i class="fas fa-rotate-right"></i> ${esc(count)}x</span>`;
}

// "Nerede izlenir" satırı: abonelik, kiralama, satın alma
const PROVIDER_LABELS = { flatrate: 'Abonelikte', rent: 'Kiralık', buy: 'Satın al' };
function renderProviders(item) {
    if (!hasProviders(item)) return '';
    const when = item.providersAt ? ` · ${new Date(item.providersAt).toLocaleDateString('tr-TR')} itibarıyla` : '';
    const groups = PROVIDER_KINDS
        .filter(kind => (item.providers[kind] || []).length)
        .map(kind => `
            <div class="provider-group">
                <span class="provider-kind">${PROVIDER_LABELS[kind]}</span>
                ${item.providers[kind].map(name => `<span class="provider-chip ${kind === 'flatrate' ? 'is-included' : ''}">${esc(name)}</span>`).join('')}
            </div>`)
        .join('');
    return `<div class="providers-row" title="TMDB'nin Türkiye yayın bilgisi${when}">${groups}</div>`;
}

// =====================================================================
// "Ne izlesem?" — listedeki bitmemiş yapımlardan birini seçer
// =====================================================================
const pickModal = document.getElementById('pickModal');
let lastPickKey = '';

function pickCandidates() {
    const kind = (document.getElementById('pickKind') || {}).value || 'all';
    const category = Number((document.getElementById('pickCategory') || {}).value) || null;
    const platform = (document.getElementById('pickPlatform') || {}).value || '';
    const duration = (document.getElementById('pickDuration') || {}).value || '';
    const onlyStarted = !!(document.getElementById('pickOnlyStarted') || {}).checked;

    const inDuration = minutes => {
        if (!duration) return true;
        if (!minutes) return false; // süresi bilinmeyenler süre filtresinde elenir
        if (duration === 'short') return minutes <= 45;
        if (duration === 'medium') return minutes > 45 && minutes <= 120;
        return minutes > 120;
    };
    const matchesCommon = item => (!category || (item.categories || []).includes(category)) &&
        (!platform || (item.platform || 'Diğer') === platform);

    const list = [];
    if (kind !== 'movie') {
        seriesData.forEach(series => {
            const totals = getSeriesTotals(series);
            if (totals.status === 'completed' || totals.status === 'dropped') return;
            if (!totals.next) return;
            if (onlyStarted && totals.watched === 0) return;
            if (!matchesCommon(series)) return;
            if (!inDuration(normalizeRuntime(series.runtime))) return;
            list.push({ kind: 'series', item: series, totals });
        });
    }
    if (kind !== 'series') {
        moviesData.forEach(movie => {
            if (movie.watched) return;
            if (onlyStarted) return; // filmlerde "başlanmış" durumu yok
            if (!matchesCommon(movie)) return;
            if (!inDuration(normalizeRuntime(movie.runtime))) return;
            list.push({ kind: 'movie', item: movie });
        });
    }
    return list;
}

// Puanı yüksek ve yarıda bırakılmış yapımlar biraz daha sık çıksın
function pickWeight(entry) {
    let weight = 1;
    const rating = entry.item.myRating != null ? entry.item.myRating : entry.item.imdbRating;
    if (rating != null) weight += Math.max(0, (Number(rating) - 5) / 5);
    if (entry.kind === 'series' && entry.totals && entry.totals.watched > 0) weight += 0.8;
    return weight;
}

function weightedPick(list) {
    const total = list.reduce((sum, e) => sum + pickWeight(e), 0);
    let roll = Math.random() * total;
    for (const entry of list) {
        roll -= pickWeight(entry);
        if (roll <= 0) return entry;
    }
    return list[list.length - 1];
}

function pickReason(entry) {
    const reasons = [];
    if (entry.kind === 'series') {
        const t = entry.totals;
        if (t.watched === 0) reasons.push('Henüz başlamadın');
        else reasons.push(`${t.watched}/${t.total} bölüm bitti, sıradaki S${t.next.season} · B${t.next.watchedEpisodes + 1}`);
    } else {
        reasons.push('İzleme listende bekliyor');
    }
    const minutes = normalizeRuntime(entry.item.runtime);
    if (minutes) reasons.push(entry.kind === 'series' ? `bölüm başı ~${minutes} dk` : `~${minutes} dk`);
    if (entry.item.platform && entry.item.platform !== 'Diğer') reasons.push(entry.item.platform);
    return reasons.join(' · ');
}

function renderPickResult(entry) {
    const resultEl = document.getElementById('pickResult');
    const againBtn = document.getElementById('pickAgainBtn');
    const rollBtn = document.getElementById('pickRollBtn');
    if (!resultEl) return;

    if (!entry) {
        resultEl.innerHTML = '<p class="pick-empty"><i class="fas fa-circle-info mr-1"></i>Bu filtrelere uyan, bitirmediğin bir yapım yok. Filtreleri gevşetmeyi dene.</p>';
        if (againBtn) againBtn.classList.add('hidden');
        if (rollBtn) rollBtn.classList.remove('hidden');
        return;
    }

    const item = entry.item;
    const poster = safeUrl(item.imageUrl);
    const next = entry.kind === 'series' ? entry.totals.next : null;
    resultEl.innerHTML = `
        <div class="pick-card">
            <div class="pick-poster">
                ${poster ? `<img src="${esc(poster)}" alt="${esc(item.name)}" loading="lazy" onerror="handleImageError(this)">` : '<div class="pick-noposter"><i class="fas fa-image"></i></div>'}
            </div>
            <div class="pick-body">
                <div class="pick-title">${esc(item.name)}${renderYearBadge(item.releaseDate)}</div>
                <div class="pick-reason">${esc(pickReason(entry))}</div>
                ${item.description ? `<p class="pick-overview">${esc(item.description)}</p>` : ''}
                <div class="pick-actions">
                    ${next ? `<button type="button" class="btn btn-primary btn-sm" data-pick-watch="series:${esc(item.id)}:${esc(next.id)}"><i class="fas fa-check mr-1"></i>Bu bölümü izledim</button>` : ''}
                    ${entry.kind === 'movie' ? `<button type="button" class="btn btn-primary btn-sm" data-pick-watch="movie:${esc(item.id)}"><i class="fas fa-check mr-1"></i>İzledim</button>` : ''}
                    ${item.trailerUrl ? `<button type="button" class="btn btn-secondary btn-sm trailer-btn" data-trailer-url="${esc(item.trailerUrl)}" data-title="${esc(item.name)}"><i class="fab fa-youtube mr-1"></i>Fragman</button>` : ''}
                    <button type="button" class="btn btn-secondary btn-sm" data-pick-open="${esc(entry.kind)}:${esc(item.id)}"><i class="fas fa-edit mr-1"></i>Kartı aç</button>
                </div>
            </div>
        </div>`;
    if (againBtn) againBtn.classList.remove('hidden');
    if (rollBtn) rollBtn.classList.add('hidden');
}

function rollPick() {
    const list = pickCandidates();
    if (!list.length) {
        lastPickKey = '';
        renderPickResult(null);
        return;
    }
    // Aynı yapımı üst üste verme (tek aday varsa mecburen aynısı)
    let entry = weightedPick(list);
    if (list.length > 1) {
        for (let i = 0; i < 6 && entry.kind + ':' + entry.item.id === lastPickKey; i++) entry = weightedPick(list);
    }
    lastPickKey = entry.kind + ':' + entry.item.id;
    renderPickResult(entry);
}

function openPickModal() {
    const categorySelect = document.getElementById('pickCategory');
    const platformSelect = document.getElementById('pickPlatform');
    if (categorySelect) {
        const current = categorySelect.value;
        categorySelect.innerHTML = '<option value="">Farketmez</option>' +
            categoriesData.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
        categorySelect.value = current;
    }
    if (platformSelect) {
        const current = platformSelect.value;
        const platforms = Array.from(new Set([...seriesData, ...moviesData].map(x => x.platform).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'tr'));
        platformSelect.innerHTML = '<option value="">Farketmez</option>' +
            platforms.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
        platformSelect.value = current;
    }
    openModal(pickModal);
    rollPick();
}

function setupPickForMe() {
    const openBtn = document.getElementById('pickForMeBtn');
    if (!openBtn || !pickModal) return;
    openBtn.addEventListener('click', openPickModal);
    const closeBtn = document.getElementById('closePickModal');
    if (closeBtn) closeBtn.addEventListener('click', () => closeModal(pickModal));
    ['pickRollBtn', 'pickAgainBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', rollPick);
    });
    ['pickKind', 'pickCategory', 'pickPlatform', 'pickDuration', 'pickOnlyStarted'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', rollPick);
    });

    pickModal.addEventListener('click', e => {
        const target = e.target;
        if (!(target instanceof Element)) return;

        const watchBtn = target.closest('[data-pick-watch]');
        if (watchBtn) {
            const [kind, id, seasonId] = watchBtn.getAttribute('data-pick-watch').split(':');
            const done = kind === 'series' ? setSeasonWatchedPlusOne(id, seasonId) : setMovieWatched(id, true);
            if (done) {
                refreshAll();
                showToast('İzleme kaydedildi.');
                rollPick();
            }
            return;
        }

        const openCardBtn = target.closest('[data-pick-open]');
        if (openCardBtn) {
            const [kind, id] = openCardBtn.getAttribute('data-pick-open').split(':');
            closeModal(pickModal);
            if (kind === 'series') editSeries(id); else editMovie(id);
        }
    });
}

function setSeasonWatchedPlusOne(seriesId, seasonId) {
    const series = findSeries(seriesId);
    if (!series) return false;
    const season = series.seasons.find(s => String(s.id) === String(seasonId));
    if (!season) return false;
    return setSeasonWatched(seriesId, seasonId, season.watchedEpisodes + 1);
}

// =====================================================================
// Yıllık özet
// =====================================================================

// Günlük tutulmaya başlamadan önceki kayıtlar için son izleme tarihine bakılır.
// Günlükte geçen kayıtlar bu yoldan ikinci kez sayılmaz.
function buildYearSummary(year) {
    const log = getWatchLog();
    const loggedIds = new Set(log.map(e => e.k + ':' + e.id));
    const inYear = ts => ts && new Date(ts).getFullYear() === year;

    let episodes = 0;
    let movies = 0;
    let minutes = 0;
    const touched = new Map(); // "kind:id" -> kayıt

    const addItem = (kind, id) => {
        const item = kind === 'series'
            ? seriesData.find(x => String(x.id) === String(id))
            : moviesData.find(x => String(x.id) === String(id));
        if (item) touched.set(kind + ':' + id, { kind, item });
    };

    log.forEach(entry => {
        if (!inYear(entry.t)) return;
        const n = Number(entry.n) || 0;
        minutes += Number(entry.m) || 0;
        if (entry.k === 'series') episodes += n; else movies += n;
        if (n > 0) addItem(entry.k, entry.id);
    });

    let estimated = 0;
    seriesData.forEach(series => {
        if (loggedIds.has('series:' + series.id) || !inYear(series.lastWatchedAt)) return;
        const watched = getSeriesTotals(series).watched;
        if (!watched) return;
        episodes += watched;
        minutes += watched * episodeMinutes(series);
        estimated++;
        touched.set('series:' + series.id, { kind: 'series', item: series });
    });
    moviesData.forEach(movie => {
        if (loggedIds.has('movie:' + movie.id) || !movie.watched || !inYear(movie.lastWatchedAt)) return;
        movies += 1;
        minutes += movieMinutes(movie);
        estimated++;
        touched.set('movie:' + movie.id, { kind: 'movie', item: movie });
    });

    const items = Array.from(touched.values());
    const tally = (pairs) => {
        const counts = new Map();
        pairs.forEach(name => counts.set(name, (counts.get(name) || 0) + 1));
        return Array.from(counts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    };
    const categories = tally(items.flatMap(({ item }) => (item.categories || [])
        .map(id => (categoriesData.find(c => c.id === id) || {}).name)
        .filter(Boolean)));
    const platforms = tally(items.map(({ item }) => item.platform || 'Diğer'));
    const topRated = items
        .filter(({ item }) => item.myRating != null)
        .sort((a, b) => b.item.myRating - a.item.myRating)
        .slice(0, 5);

    return {
        year,
        episodes: Math.max(0, episodes),
        movies: Math.max(0, movies),
        minutes: Math.max(0, minutes),
        titles: items.length,
        categories,
        platforms,
        topRated,
        estimated
    };
}

function summaryYears() {
    const years = new Set();
    getWatchLog().forEach(e => {
        const y = new Date(e.t).getFullYear();
        if (Number.isFinite(y)) years.add(y);
    });
    [...seriesData, ...moviesData].forEach(item => {
        const ts = item.lastWatchedAt;
        if (!ts) return;
        const y = new Date(ts).getFullYear();
        if (Number.isFinite(y)) years.add(y);
    });
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
}

function formatHours(minutes) {
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    if (!hours) return `${rest} dk`;
    return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

function renderYearSummary() {
    const body = document.getElementById('yearSummaryBody');
    const select = document.getElementById('yearSummarySelect');
    if (!body || !select) return;

    const years = summaryYears();
    const wanted = Number(select.value) || new Date().getFullYear();
    const year = years.includes(wanted) ? wanted : years[0];
    select.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    select.value = String(year);

    const summary = buildYearSummary(year);
    if (!summary.titles && !summary.episodes && !summary.movies) {
        body.innerHTML = `<p class="text-sm opacity-70">${year} yılında işaretlenmiş izleme yok.</p>`;
        return;
    }

    const kpis = [
        { label: 'İzlenen bölüm', value: summary.episodes },
        { label: 'İzlenen film', value: summary.movies },
        { label: 'Toplam süre', value: formatHours(summary.minutes), small: true },
        { label: 'Farklı yapım', value: summary.titles }
    ];
    const list = (title, rows, empty) => `
        <div class="year-list">
            <h4>${esc(title)}</h4>
            ${rows.length ? rows.slice(0, 5).map(r => `<div class="stats-list-item"><span>${esc(r.name)}</span><span class="opacity-70">${esc(r.count)}</span></div>`).join('')
                : `<p class="text-sm opacity-60">${esc(empty)}</p>`}
        </div>`;

    body.innerHTML = `
        <div class="year-kpis">
            ${kpis.map(k => `<div class="stats-kpi"><div class="value${k.small ? ' value-sm' : ''}">${esc(k.value)}</div><div class="label">${esc(k.label)}</div></div>`).join('')}
        </div>
        <div class="year-lists">
            ${list('En çok izlediğin türler', summary.categories, 'Kategori atanmış yapım yok.')}
            ${list('Platformlar', summary.platforms, 'Platform bilgisi yok.')}
            <div class="year-list">
                <h4>Yılın favorileri</h4>
                ${summary.topRated.length
                    ? summary.topRated.map(({ item }) => `<div class="stats-list-item"><span>${esc(item.name)}</span><span class="text-pink-500"><i class="fas fa-heart"></i> ${esc(item.myRating)}</span></div>`).join('')
                    : '<p class="text-sm opacity-60">Bu yıl izlediklerine puan vermemişsin.</p>'}
            </div>
        </div>
        <p class="year-note">
            <i class="fas fa-circle-info mr-1"></i>Süreler, bilinmeyen durumlarda bölüm başına ${DEFAULT_EPISODE_MINUTES} dk ve film başına ${DEFAULT_MOVIE_MINUTES} dk varsayılarak hesaplanır.
            ${summary.estimated ? `${summary.estimated} yapım, bölüm bölüm kayıt tutulmadan önce izlendiği için son izleme tarihine göre bu yıla sayıldı.` : ''}
            İzleme günlüğü yalnızca bu cihazda tutulur; yedek dosyasına dahildir.
        </p>`;
}

// =====================================================================
// Yedek hatırlatması
// =====================================================================
const BACKUP_WARN_DAYS = 30;
const BACKUP_SNOOZE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function markBackupTaken() {
    try {
        localStorage.setItem('lastBackupAt', new Date().toISOString());
        localStorage.removeItem('backupReminderSnoozedAt');
    } catch (_) {}
    renderBackupReminder();
}

// { state: 'ok' | 'never' | 'stale' | 'nodata', days }
function backupStatus() {
    if (seriesData.length + moviesData.length === 0) return { state: 'nodata', days: 0 };
    let last = null;
    try { last = localStorage.getItem('lastBackupAt'); } catch (_) {}
    const ts = getTimestamp(last);
    if (!ts) return { state: 'never', days: 0 };
    const days = Math.floor((Date.now() - ts) / DAY_MS);
    return { state: days >= BACKUP_WARN_DAYS ? 'stale' : 'ok', days };
}

function backupMessage(status) {
    if (status.state === 'never') return 'Verilerin yalnızca bu tarayıcıda duruyor ve henüz hiç yedek almadın.';
    if (status.state === 'stale') return `Son yedeğinin üzerinden ${status.days} gün geçti.`;
    return '';
}

function renderBackupReminder() {
    const status = backupStatus();
    const message = backupMessage(status);

    // Pencere içindeki uyarı: ertelemeden bağımsız, her zaman güncel durumu gösterir
    const modalBox = document.getElementById('backupReminder');
    if (modalBox) {
        modalBox.classList.toggle('hidden', !message);
        if (message) {
            modalBox.innerHTML = `<i class="fas fa-shield-halved mr-2"></i>${esc(message)} <button type="button" class="helper-link" data-backup-now>Şimdi yedek al</button>`;
        }
    }

    const banner = document.getElementById('backupBanner');
    if (!banner) return;
    let snoozed = 0;
    try { snoozed = getTimestamp(localStorage.getItem('backupReminderSnoozedAt')); } catch (_) {}
    const isSnoozed = snoozed && Date.now() - snoozed < BACKUP_SNOOZE_DAYS * DAY_MS;
    if (!message || isSnoozed) {
        banner.classList.add('hidden');
        banner.innerHTML = '';
        return;
    }
    banner.classList.remove('hidden');
    banner.innerHTML = `
        <span><i class="fas fa-shield-halved mr-2"></i>${esc(message)} Tarayıcı verisi silinirse geri dönüşü yok.</span>
        <span class="backup-banner-actions">
            <button type="button" class="btn btn-primary btn-sm" data-backup-now><i class="fas fa-download mr-1"></i>Yedek al</button>
            <button type="button" class="btn btn-secondary btn-sm" data-backup-snooze>${BACKUP_SNOOZE_DAYS} gün sonra hatırlat</button>
        </span>`;
}

function setupBackupReminder() {
    document.addEventListener('click', e => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        if (target.closest('[data-backup-now]')) {
            const exportBtn = document.getElementById('exportData');
            if (exportBtn) exportBtn.click();
            return;
        }
        if (target.closest('[data-backup-snooze]')) {
            try { localStorage.setItem('backupReminderSnoozedAt', new Date().toISOString()); } catch (_) {}
            renderBackupReminder();
        }
    });
    renderBackupReminder();
}

// =====================================================================
// Sürüm geçmişi (geri alınamayan işlemlerden önce otomatik kopya)
// =====================================================================
const SNAPSHOT_KEY = 'dataSnapshots';
const SNAPSHOT_MAX = 5;
const SNAPSHOT_CHARS_MAX = 1200000; // ~1.2 MB: localStorage kotasını zorlamamak için

function getSnapshots() {
    const list = safeParse(SNAPSHOT_KEY, []);
    return Array.isArray(list) ? list.filter(x => x && x.at && x.data) : [];
}

function storeSnapshots(list) {
    // Kota dolarsa en eskiden başlayarak at
    let current = list.slice(-SNAPSHOT_MAX);
    while (current.length) {
        const text = JSON.stringify(current);
        if (text.length <= SNAPSHOT_CHARS_MAX) {
            try {
                __origSetItem(SNAPSHOT_KEY, text);
                return true;
            } catch (_) { /* kota: bir eskiyi daha at */ }
        }
        current = current.slice(1);
    }
    try { __origSetItem(SNAPSHOT_KEY, '[]'); } catch (_) {}
    return false;
}

function createSnapshot(label) {
    const snapshot = {
        at: new Date().toISOString(),
        label: String(label || 'Değişiklik'),
        counts: { series: seriesData.length, movies: moviesData.length },
        data: {
            series: seriesData,
            movies: moviesData,
            categories: categoriesData,
            tags: tagsData
        }
    };
    return storeSnapshots([...getSnapshots(), snapshot]);
}

function applySnapshot(snapshot) {
    const data = snapshot && snapshot.data;
    if (!data) return false;
    seriesData = normalizeSeriesList(data.series);
    moviesData = normalizeMoviesList(data.movies);
    categoriesData = normalizeCategoriesList(data.categories) || categoriesData;
    tagsData = normalizeTagsData(data.tags);
    // Kopyadan sonra silinenlerin mezar taşları, geri getirileni tekrar silmesin
    deletedItems = normalizeDeleted(null);
    selectedBulkKeys = new Set();
    localStorage.setItem('seriesData', JSON.stringify(seriesData));
    localStorage.setItem('moviesData', JSON.stringify(moviesData));
    localStorage.setItem('categoriesData', JSON.stringify(categoriesData));
    localStorage.setItem('tagsData', JSON.stringify(tagsData));
    localStorage.setItem('deletedItems', JSON.stringify(deletedItems));
    refreshAll();
    return true;
}

function renderSnapshots() {
    const listEl = document.getElementById('snapshotList');
    const limitEl = document.getElementById('snapshotLimit');
    if (!listEl) return;
    if (limitEl) limitEl.textContent = String(SNAPSHOT_MAX);
    const snapshots = getSnapshots().slice().reverse();
    if (!snapshots.length) {
        listEl.innerHTML = '<p class="text-sm opacity-70">Henüz kayıtlı kopya yok. İlk toplu işlemde otomatik oluşur.</p>';
        return;
    }
    listEl.innerHTML = snapshots.map((snap, index) => `
        <div class="snapshot-item">
            <div class="min-w-0">
                <div class="snapshot-label">${esc(snap.label)}</div>
                <div class="snapshot-meta">${esc(new Date(snap.at).toLocaleString('tr-TR'))} · ${esc(snap.counts ? snap.counts.series : '?')} dizi, ${esc(snap.counts ? snap.counts.movies : '?')} film</div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-snapshot-restore="${index}"><i class="fas fa-clock-rotate-left mr-1"></i>Geri Yükle</button>
        </div>`).join('');
}

function restoreSnapshotAt(reverseIndex) {
    const snapshots = getSnapshots().slice().reverse();
    const snapshot = snapshots[reverseIndex];
    if (!snapshot) return;
    const when = new Date(snapshot.at).toLocaleString('tr-TR');
    if (!confirm(`${when} tarihli kopya geri yüklenecek (${snapshot.counts.series} dizi, ${snapshot.counts.movies} film).\n\nŞu anki verilerin "Geri yükleme öncesi" adıyla kopyalanacak. Devam edilsin mi?`)) return;
    createSnapshot('Geri yükleme öncesi');
    if (applySnapshot(snapshot)) {
        renderSnapshots();
        showToast('Veriler seçilen kopyadan geri yüklendi.');
    }
}

// =====================================================================
// Veri bakımı: yinelenen kayıtlar, eksikler, kopuk bağlantılar
// =====================================================================

function fieldScore(item) {
    return ['imageUrl', 'description', 'trailerUrl', 'imdbRating', 'releaseDate', 'runtime', 'notes', 'myRating']
        .filter(f => !isEmptyField(item[f])).length;
}

function duplicateGroups(list) {
    const byName = new Map();
    list.forEach(item => {
        const key = normalizeTitle(item.name);
        if (!key) return;
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(item);
    });
    return Array.from(byName.values()).filter(group => group.length > 1);
}

// Aynı adlı kayıtları en dolu olanda birleştirir, diğerlerini siler
function mergeDuplicateGroup(kind, group) {
    const sorted = [...group].sort((a, b) => (fieldScore(b) - fieldScore(a)) || (getTimestamp(a.createdAt) - getTimestamp(b.createdAt)));
    const primary = sorted[0];
    const others = sorted.slice(1);

    others.forEach(other => {
        ['imageUrl', 'description', 'trailerUrl', 'imdbRating', 'releaseDate', 'runtime', 'notes', 'tmdbId', 'tmdbType', 'imdbId', 'tvmazeId', 'originalName'].forEach(field => {
            if (isEmptyField(primary[field]) && !isEmptyField(other[field])) primary[field] = other[field];
        });
        if (primary.platform === 'Diğer' && other.platform && other.platform !== 'Diğer') primary.platform = other.platform;
        primary.categories = Array.from(new Set([...(primary.categories || []), ...(other.categories || [])]));
        primary.tags = Array.from(new Set([...(primary.tags || []), ...(other.tags || [])]));
        if (other.myRating != null && (primary.myRating == null || other.myRating > primary.myRating)) primary.myRating = other.myRating;

        if (kind === 'series') {
            (other.seasons || []).forEach(season => {
                const existing = (primary.seasons || []).find(x => x.season === season.season);
                if (!existing) {
                    primary.seasons.push(normalizeSeason({ ...season, id: newId() }));
                    return;
                }
                existing.totalEpisodes = Math.max(existing.totalEpisodes || 0, season.totalEpisodes || 0);
                existing.watchedEpisodes = Math.max(existing.watchedEpisodes || 0, season.watchedEpisodes || 0);
                if (!existing.releaseDate && season.releaseDate) existing.releaseDate = season.releaseDate;
                if (getTimestamp(season.lastWatchedAt) > getTimestamp(existing.lastWatchedAt)) existing.lastWatchedAt = season.lastWatchedAt;
            });
            primary.seasons.sort((a, b) => a.season - b.season);
            refreshSeriesLastWatched(primary);
        } else {
            if (other.watched) primary.watched = true;
            if (getTimestamp(other.lastWatchedAt) > getTimestamp(primary.lastWatchedAt)) primary.lastWatchedAt = other.lastWatchedAt;
        }
    });

    primary.updatedAt = new Date().toISOString();
    const removeIds = new Set(others.map(o => String(o.id)));
    removeIds.forEach(id => markDeleted(kind === 'series' ? 'series' : 'movies', id));
    if (kind === 'series') seriesData = seriesData.filter(x => !removeIds.has(String(x.id)));
    else moviesData = moviesData.filter(x => !removeIds.has(String(x.id)));
    return others.length;
}

function findDataIssues() {
    const issues = [];
    const allItems = [...seriesData, ...moviesData];

    const dupSeries = duplicateGroups(seriesData);
    const dupMovies = duplicateGroups(moviesData);
    const dupCount = dupSeries.concat(dupMovies).reduce((sum, g) => sum + g.length - 1, 0);
    if (dupCount) {
        const names = dupSeries.concat(dupMovies).map(g => g[0].name).slice(0, 5);
        issues.push({
            id: 'duplicates',
            title: `${dupCount} yinelenen kayıt`,
            detail: `Aynı ada sahip kayıtlar: ${names.join(', ')}${dupSeries.length + dupMovies.length > 5 ? ' …' : ''}. Birleştirme, en dolu kaydı tutup diğerlerindeki eksik bilgileri, kategorileri, etiketleri ve izleme ilerlemesini ona taşır.`,
            fixLabel: 'Birleştir',
            fix: () => {
                let removed = 0;
                dupSeries.forEach(group => { removed += mergeDuplicateGroup('series', group); });
                dupMovies.forEach(group => { removed += mergeDuplicateGroup('movie', group); });
                localStorage.setItem('seriesData', JSON.stringify(seriesData));
                localStorage.setItem('moviesData', JSON.stringify(moviesData));
                localStorage.setItem('deletedItems', JSON.stringify(deletedItems));
                return `${removed} yinelenen kayıt birleştirildi.`;
            }
        });
    }

    const missing = allItems.filter(itemNeedsFill);
    if (missing.length) {
        issues.push({
            id: 'missing',
            title: `${missing.length} kayıtta eksik bilgi`,
            detail: 'Posteri, fragmanı, açıklaması, puanı, çıkış tarihi veya süresi boş olan kayıtlar var. "Eksikleri Tamamla" bunları internetten doldurmayı dener.',
            fixLabel: 'Eksikleri Tamamla',
            fix: () => {
                closeModal(document.getElementById('maintenanceModal'));
                const settings = document.getElementById('settingsModal');
                if (settings) {
                    openModal(settings);
                    const target = document.getElementById('startBulkFillBtn');
                    if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center' });
                }
                return null; // ayrı bir akışa geçildi
            }
        });
    }

    const categoryIds = new Set(categoriesData.map(c => c.id));
    const orphanItems = allItems.filter(item => (item.categories || []).some(id => !categoryIds.has(id)));
    if (orphanItems.length) {
        issues.push({
            id: 'orphanCategories',
            title: `${orphanItems.length} kayıtta silinmiş kategori`,
            detail: 'Bu kayıtlar artık var olmayan kategorilere bağlı. Temizleme yalnızca kopuk bağlantıları siler.',
            fixLabel: 'Temizle',
            fix: () => {
                orphanItems.forEach(item => { item.categories = (item.categories || []).filter(id => categoryIds.has(id)); });
                localStorage.setItem('seriesData', JSON.stringify(seriesData));
                localStorage.setItem('moviesData', JSON.stringify(moviesData));
                return `${orphanItems.length} kayıttaki kopuk kategori bağlantısı silindi.`;
            }
        });
    }

    const knownTags = new Set(tagsData.map(t => t.name));
    const usedTags = new Set(allItems.flatMap(item => item.tags || []));
    const unknownTags = Array.from(usedTags).filter(name => !knownTags.has(name));
    if (unknownTags.length) {
        issues.push({
            id: 'unknownTags',
            title: `${unknownTags.length} etiket listede yok`,
            detail: `Kayıtlarda kullanılan ama etiket listesinde olmayan etiketler: ${unknownTags.slice(0, 8).join(', ')}${unknownTags.length > 8 ? ' …' : ''}`,
            fixLabel: 'Listeye ekle',
            fix: () => {
                unknownTags.forEach(name => tagsData.push({ id: newId(), name }));
                tagsData = normalizeTagsData(tagsData);
                localStorage.setItem('tagsData', JSON.stringify(tagsData));
                return `${unknownTags.length} etiket listeye eklendi.`;
            }
        });
    }

    const unusedTags = tagsData.filter(t => !usedTags.has(t.name));
    if (unusedTags.length) {
        issues.push({
            id: 'unusedTags',
            title: `${unusedTags.length} kullanılmayan etiket`,
            detail: `Hiçbir kayıtta kullanılmayan etiketler: ${unusedTags.map(t => t.name).slice(0, 8).join(', ')}${unusedTags.length > 8 ? ' …' : ''}`,
            fixLabel: 'Kaldır',
            fix: () => {
                const remove = new Set(unusedTags.map(t => String(t.id)));
                remove.forEach(id => markDeleted('tags', id));
                tagsData = tagsData.filter(t => !remove.has(String(t.id)));
                localStorage.setItem('tagsData', JSON.stringify(tagsData));
                localStorage.setItem('deletedItems', JSON.stringify(deletedItems));
                return `${unusedTags.length} etiket kaldırıldı.`;
            }
        });
    }

    // Bölüm sayısı girilmemiş ama izlenmiş sezonlar: ilerleme yüzdesi hesaplanamaz
    const badSeasons = [];
    seriesData.forEach(series => {
        (series.seasons || []).forEach(season => {
            if (!season.totalEpisodes && season.watchedEpisodes > 0) badSeasons.push({ series, season });
        });
    });
    if (badSeasons.length) {
        const names = Array.from(new Set(badSeasons.map(b => b.series.name))).slice(0, 5);
        issues.push({
            id: 'seasons',
            title: `${badSeasons.length} sezonda bölüm sayısı eksik`,
            detail: `İzlenmiş görünen ama toplam bölüm sayısı girilmemiş sezonlar var (${names.join(', ')}); bu dizilerin ilerlemesi hesaplanamıyor. Düzeltme, toplam bölümü izlenen sayıya eşitleyip sezonu tamamlanmış sayar. Gerçek bölüm sayısını internetten almak için "Eksikleri Tamamla"yı kullan.`,
            fixLabel: 'Düzelt',
            fix: () => {
                badSeasons.forEach(({ season }) => { season.totalEpisodes = season.watchedEpisodes; });
                localStorage.setItem('seriesData', JSON.stringify(seriesData));
                return `${badSeasons.length} sezonun bölüm sayısı düzeltildi.`;
            }
        });
    }

    return issues;
}

let maintenanceIssues = [];

function renderMaintenance() {
    const listEl = document.getElementById('maintenanceIssues');
    if (!listEl) return;
    maintenanceIssues = findDataIssues();
    listEl.innerHTML = maintenanceIssues.length
        ? maintenanceIssues.map((issue, index) => `
            <div class="maintenance-issue">
                <div class="min-w-0">
                    <div class="maintenance-issue-title"><i class="fas fa-triangle-exclamation mr-2 text-amber-500"></i>${esc(issue.title)}</div>
                    <p class="maintenance-issue-detail">${esc(issue.detail)}</p>
                </div>
                <button type="button" class="btn btn-primary btn-sm" data-issue-fix="${index}">${esc(issue.fixLabel)}</button>
            </div>`).join('')
        : '<p class="maintenance-ok"><i class="fas fa-circle-check mr-2 text-emerald-500"></i>Veride düzeltilmesi gereken bir şey bulunamadı.</p>';
    renderSnapshots();
    renderBackupReminder();
}

function setupMaintenance() {
    const modal = document.getElementById('maintenanceModal');
    const openBtn = document.getElementById('openMaintenance');
    if (!modal || !openBtn) return;
    openBtn.addEventListener('click', () => {
        renderMaintenance();
        openModal(modal);
    });
    const closeBtn = document.getElementById('closeMaintenanceModal');
    if (closeBtn) closeBtn.addEventListener('click', () => closeModal(modal));

    modal.addEventListener('click', e => {
        const target = e.target;
        if (!(target instanceof Element)) return;

        const fixBtn = target.closest('[data-issue-fix]');
        if (fixBtn) {
            const issue = maintenanceIssues[Number(fixBtn.getAttribute('data-issue-fix'))];
            if (!issue) return;
            createSnapshot('Bakım: ' + issue.title);
            const message = issue.fix();
            if (message) {
                refreshAll();
                renderMaintenance();
                showToast(message);
            }
            return;
        }

        const restoreBtn = target.closest('[data-snapshot-restore]');
        if (restoreBtn) restoreSnapshotAt(Number(restoreBtn.getAttribute('data-snapshot-restore')));
    });
}

// --- Klavye kısayolları ---
// "/" : aktif sekmede aramaya odaklan, "n" : yeni dizi/film ekle
document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = document.activeElement;
    const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    if (typing || document.querySelector('.modal.active')) return;
    const tabId = getActiveTabId();
    if (e.key === '/') {
        const search = tabId === 'moviesTab' ? searchMovies : tabId === 'trailersTab' ? trailersSearch : tabId === 'seriesTab' ? searchSeries : null;
        if (search) {
            e.preventDefault();
            search.focus();
            search.select();
        }
    } else if (e.key === 'n' || e.key === 'N') {
        if (tabId === 'seriesTab') { e.preventDefault(); addSeries(); }
        else if (tabId === 'moviesTab') { e.preventDefault(); addMovie(); }
    }
});

// =====================================================================
// Senkronizasyon ortak yardımcıları
// =====================================================================

// Uzak veriyi yerel veriyle birleştir. Yerel veri değiştiyse true döner.
function mergeIncomingData(data) {
    if (!data || typeof data !== 'object') return false;
    const before = canonicalData(getSyncState());
    const remoteDeleted = normalizeDeleted(data.deleted);

    const series = mergeById(seriesData, normalizeSeriesList(data.series), deletedItems.series, remoteDeleted.series);
    const movies = mergeById(moviesData, normalizeMoviesList(data.movies), deletedItems.movies, remoteDeleted.movies);
    const categories = mergeById(categoriesData, normalizeCategoriesList(data.categories) || [], deletedItems.categories, remoteDeleted.categories);
    const tags = mergeById(tagsData, normalizeTagsData(data.tags), deletedItems.tags, remoteDeleted.tags);

    seriesData = series.items;
    moviesData = movies.items;
    categoriesData = categories.items;
    tagsData = normalizeTagsData(tags.items);
    deletedItems = {
        series: series.deleted,
        movies: movies.deleted,
        categories: categories.deleted,
        tags: tags.deleted
    };

    const changed = canonicalData(getSyncState()) !== before;
    if (changed) {
        // Uzak veriyi kaydederken tekrar gönderme tetiklenmesin
        __origSetItem('seriesData', JSON.stringify(seriesData));
        __origSetItem('moviesData', JSON.stringify(moviesData));
        __origSetItem('categoriesData', JSON.stringify(categoriesData));
        __origSetItem('tagsData', JSON.stringify(tagsData));
        __origSetItem('deletedItems', JSON.stringify(deletedItems));
        refreshAll();
    }
    return changed;
}

function getSyncState() {
    return { series: seriesData, movies: moviesData, categories: categoriesData, tags: tagsData, deleted: deletedItems };
}

// Sıradan bağımsız karşılaştırma için kararlı metin
function canonicalData(state) {
    const byId = list => [...(list || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const sortKeys = obj => Object.keys(obj || {}).sort().reduce((acc, k) => { acc[k] = obj[k]; return acc; }, {});
    const deleted = state.deleted || {};
    return JSON.stringify({
        series: byId(state.series),
        movies: byId(state.movies),
        categories: byId(state.categories),
        tags: byId(state.tags),
        deleted: ['series', 'movies', 'categories', 'tags'].reduce((acc, k) => { acc[k] = sortKeys(deleted[k]); return acc; }, {})
    });
}

function updateSyncIndicator() {
    const p2pOpen = !!(rtcChannel && rtcChannel.readyState === 'open');
    setSyncIndicator(p2pOpen || cloudSyncHealthy);
}

// =====================================================================
// P2P: büyük veriyi sıkıştırıp parçalar halinde gönder
// (WebRTC tek mesajda ~256 KB'tan fazlasını gönderemez)
// =====================================================================
const P2P_CHUNK_SIZE = 16000;
const incomingChunks = new Map();

async function packMessage(obj) {
    const json = JSON.stringify(obj);
    if (typeof CompressionStream === 'function') {
        try {
            const bytes = await transformBytes(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
            return { enc: 'deflate', body: bytesToBase64Url(bytes) };
        } catch (_) {}
    }
    return { enc: 'json', body: json };
}

async function unpackMessage(enc, body) {
    if (enc === 'deflate') {
        const bytes = await transformBytes(base64UrlToBytes(body), new DecompressionStream('deflate-raw'));
        return JSON.parse(new TextDecoder().decode(bytes));
    }
    return JSON.parse(body);
}

function waitForBufferDrain(channel) {
    if (channel.bufferedAmount < 1024 * 1024) return Promise.resolve();
    return new Promise(resolve => {
        channel.bufferedAmountLowThreshold = 256 * 1024;
        const done = () => { channel.removeEventListener('bufferedamountlow', done); resolve(); };
        channel.addEventListener('bufferedamountlow', done);
        setTimeout(done, 3000);
    });
}

async function sendSyncPayload(channel) {
    if (!channel || channel.readyState !== 'open') return false;
    const { enc, body } = await packMessage({ type: 'syncData', payload: getAllDataPayload() });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const total = Math.max(1, Math.ceil(body.length / P2P_CHUNK_SIZE));
    for (let i = 0; i < total; i++) {
        if (channel.readyState !== 'open') return false;
        await waitForBufferDrain(channel);
        channel.send(JSON.stringify({ type: 'chunk', id, i, total, enc, data: body.slice(i * P2P_CHUNK_SIZE, (i + 1) * P2P_CHUNK_SIZE) }));
    }
    return true;
}

async function handlePeerMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    if (!msg) return;
    if (msg.type === 'syncData' && msg.payload) {
        receivePeerPayload(msg.payload);
        return;
    }
    if (msg.type !== 'chunk' || !msg.id) return;
    let entry = incomingChunks.get(msg.id);
    if (!entry) {
        entry = { parts: new Array(msg.total), count: 0, enc: msg.enc };
        incomingChunks.set(msg.id, entry);
        updatePairingStatus('Veri alınıyor...', 'info');
    }
    if (entry.parts[msg.i] === undefined) {
        entry.parts[msg.i] = msg.data;
        entry.count++;
    }
    if (entry.count === msg.total) {
        incomingChunks.delete(msg.id);
        try {
            const full = await unpackMessage(entry.enc, entry.parts.join(''));
            if (full && full.type === 'syncData' && full.payload) receivePeerPayload(full.payload);
        } catch (err) {
            updatePairingStatus('Gelen veri okunamadı: ' + err.message, 'error');
        }
    }
}

function receivePeerPayload(payload) {
    const before = { series: seriesData.length, movies: moviesData.length };
    const changed = mergeIncomingData(payload);
    const time = new Date().toLocaleTimeString('tr-TR');
    if (changed) {
        const diff = `${seriesData.length - before.series >= 0 ? '+' : ''}${seriesData.length - before.series} dizi, ${moviesData.length - before.movies >= 0 ? '+' : ''}${moviesData.length - before.movies} film`;
        updatePairingStatus(`Bağlı - veriler birleştirildi (${diff}, ${time})`, 'success');
        showToast('Diğer cihazdan gelen veriler birleştirildi.');
        // Birleşmiş hali karşı tarafa da gönder (onun da eksiği kalmasın)
        schedulePeerPush();
    } else {
        updatePairingStatus(`Bağlı - iki cihaz zaten aynı (${time})`, 'success');
    }
    if (typeof scheduleCloudSync === 'function') scheduleCloudSync();
}

// =====================================================================
// Bulut senkronizasyonu (GitHub Gist)
// Veriler kullanıcının GitHub hesabında gizli bir gist'te tutulur.
// Her değişiklikten sonra ve uygulama açılınca otomatik birleştirilir.
// =====================================================================
const GIST_FILE = 'izleme-takip-data.json';
const GIST_DESCRIPTION = 'İzleme Takip verileri (otomatik senkron - silmeyin)';
let cloudSyncHealthy = false;
let cloudSyncTimer = null;
let cloudSyncRunning = false;
let cloudSyncAgain = false;

function getGistToken() { return getApiKey('gistToken'); }
function isCloudSyncConfigured() { return !!getGistToken(); }

async function githubFetch(path, options = {}) {
    const token = getGistToken();
    const res = await fetch('https://api.github.com' + path, {
        ...options,
        cache: 'no-store',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer ' + token,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(options.body ? { 'Content-Type': 'application/json' } : {})
        }
    });
    if (res.status === 401) throw new Error('GitHub anahtarı geçersiz veya süresi dolmuş.');
    if (res.status === 403 || res.status === 404) {
        const text = await res.text().catch(() => '');
        if (/rate limit/i.test(text)) throw new Error('GitHub istek sınırı aşıldı, biraz sonra tekrar denenecek.');
        throw new Error('GitHub erişimi reddedildi. Anahtarın "gist" izni olduğundan emin olun.');
    }
    if (!res.ok) throw new Error('GitHub hatası (' + res.status + ')');
    return res.status === 204 ? null : res.json();
}

async function findOrCreateGist() {
    const saved = getApiKey('gistId');
    if (saved) return saved;
    for (let page = 1; page <= 5; page++) {
        const list = await githubFetch(`/gists?per_page=100&page=${page}`);
        const found = (list || []).find(g => g.files && g.files[GIST_FILE]);
        if (found) {
            __origSetItem('gistId', found.id);
            return found.id;
        }
        if (!list || list.length < 100) break;
    }
    const created = await githubFetch('/gists', {
        method: 'POST',
        body: JSON.stringify({
            description: GIST_DESCRIPTION,
            public: false,
            files: { [GIST_FILE]: { content: JSON.stringify(buildCloudPayload()) } }
        })
    });
    __origSetItem('gistId', created.id);
    return created.id;
}

function buildCloudPayload() {
    return { app: 'izleme-takip', dataVersion: 2, savedAt: new Date().toISOString(), ...getSyncState() };
}

async function readGistData(gistId) {
    const gist = await githubFetch('/gists/' + gistId);
    const file = gist && gist.files && gist.files[GIST_FILE];
    if (!file) return null;
    let content = file.content;
    if (file.truncated && file.raw_url) {
        const raw = await fetch(file.raw_url, { cache: 'no-store' });
        content = await raw.text();
    }
    try { return JSON.parse(content); } catch (_) { return null; }
}

function setCloudStatus(message, type) {
    const el = document.getElementById('cloudSyncStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'text-sm mt-2 ' + (type === 'error' ? 'text-red-400' : type === 'success' ? 'text-green-500' : 'opacity-80');
}

function renderCloudSyncUI() {
    const configured = isCloudSyncConfigured();
    const setup = document.getElementById('cloudSyncSetup');
    const active = document.getElementById('cloudSyncActive');
    if (setup) setup.classList.toggle('hidden', configured);
    if (active) active.classList.toggle('hidden', !configured);
    const last = getApiKey('gistLastSync');
    if (configured && last && !document.getElementById('cloudSyncStatus').textContent) {
        setCloudStatus('Son senkron: ' + new Date(last).toLocaleString('tr-TR'), 'success');
    }
}

async function cloudSync({ silent = false } = {}) {
    if (!isCloudSyncConfigured()) return;
    if (cloudSyncRunning) { cloudSyncAgain = true; return; }
    if (!navigator.onLine) {
        setCloudStatus('Çevrimdışı - bağlantı gelince senkronize edilecek.', 'info');
        return;
    }
    cloudSyncRunning = true;
    if (!silent) setCloudStatus('Senkronize ediliyor...', 'info');
    try {
        const gistId = await findOrCreateGist();
        let remote;
        try {
            remote = await readGistData(gistId);
        } catch (err) {
            // Gist silinmişse yenisini oluştur
            if (/reddedildi/.test(err.message)) {
                localStorage.removeItem('gistId');
                remote = null;
            } else {
                throw err;
            }
        }
        const localChanged = remote ? mergeIncomingData(remote) : false;
        const remoteCanonical = remote ? canonicalData({
            series: normalizeSeriesList(remote.series),
            movies: normalizeMoviesList(remote.movies),
            categories: normalizeCategoriesList(remote.categories) || [],
            tags: normalizeTagsData(remote.tags),
            deleted: normalizeDeleted(remote.deleted)
        }) : null;
        if (remoteCanonical !== canonicalData(getSyncState())) {
            const id = getApiKey('gistId') || await findOrCreateGist();
            await githubFetch('/gists/' + id, {
                method: 'PATCH',
                body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(buildCloudPayload()) } } })
            });
        }
        const now = new Date().toISOString();
        __origSetItem('gistLastSync', now);
        cloudSyncHealthy = true;
        setCloudStatus('Son senkron: ' + new Date(now).toLocaleString('tr-TR') + (localChanged ? ' (diğer cihazdan değişiklikler alındı)' : ''), 'success');
        if (localChanged && !silent) showToast('Buluttaki değişiklikler alındı.');
        refreshPublishedCalendar();
    } catch (err) {
        cloudSyncHealthy = false;
        setCloudStatus('Senkron hatası: ' + err.message, 'error');
    } finally {
        cloudSyncRunning = false;
        updateSyncIndicator();
        if (cloudSyncAgain) {
            cloudSyncAgain = false;
            scheduleCloudSync(1500);
        }
    }
}

function scheduleCloudSync(delay = 3000) {
    if (!isCloudSyncConfigured()) return;
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => cloudSync({ silent: true }), delay);
}

function setupCloudSync() {
    const tokenInput = document.getElementById('gistTokenInput');
    document.getElementById('connectCloudBtn').addEventListener('click', async () => {
        const token = tokenInput.value.trim();
        if (!token) {
            alert('Önce GitHub anahtarını yapıştırın.');
            return;
        }
        __origSetItem('gistToken', token);
        localStorage.removeItem('gistId');
        tokenInput.value = '';
        renderCloudSyncUI();
        await cloudSync();
        startCloudSyncInterval();
        if (!cloudSyncHealthy) {
            // Hatalı anahtarı sakla ama kullanıcıya düzeltme imkânı ver
            renderCloudSyncUI();
        }
    });
    document.getElementById('cloudSyncNowBtn').addEventListener('click', () => cloudSync());
    document.getElementById('disconnectCloudBtn').addEventListener('click', () => {
        if (!confirm('Bu cihazda bulut senkronizasyonu kapatılsın mı? (Buluttaki verileriniz silinmez.)')) return;
        ['gistToken', 'gistId', 'gistLastSync'].forEach(k => localStorage.removeItem(k));
        cloudSyncHealthy = false;
        setCloudStatus('', 'info');
        renderCloudSyncUI();
        updateSyncIndicator();
    });

    renderCloudSyncUI();
    if (isCloudSyncConfigured()) {
        cloudSync({ silent: true });
        startCloudSyncInterval();
    }

    // Sekmeye dönünce ve internet gelince güncel hali çek
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') scheduleCloudSync(500);
    });
    window.addEventListener('online', () => scheduleCloudSync(500));
}

// Açık kaldığı sürece 2 dakikada bir kontrol et (sadece bulut senkronu kuruluysa)
let cloudSyncInterval = null;
function startCloudSyncInterval() {
    if (cloudSyncInterval) return;
    cloudSyncInterval = setInterval(() => {
        if (!isCloudSyncConfigured()) {
            clearInterval(cloudSyncInterval);
            cloudSyncInterval = null;
            return;
        }
        if (document.visibilityState === 'visible') cloudSync({ silent: true });
    }, 2 * 60 * 1000);
}

// =====================================================================
// Öneriler (TMDB "recommendations" + "similar")
// =====================================================================
const RECS_CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 gün
const recsIndex = new Map(); // "movie:123" -> öneri nesnesi
let currentDiscoverFilter = 'all';
let discoverLoading = false;

function getDismissedRecs() {
    const list = safeParse('dismissedRecs', []);
    return new Set(Array.isArray(list) ? list : []);
}

function dismissRec(key) {
    const set = getDismissedRecs();
    set.add(key);
    __origSetItem('dismissedRecs', JSON.stringify(Array.from(set)));
}

function recKey(kind, id) {
    return kind + ':' + id;
}

// Listede var mı? (TMDB kimliği veya ad eşleşmesiyle)
function isInMyList(kind, rec) {
    const list = kind === 'series' ? seriesData : moviesData;
    const titles = [rec.title, rec.originalTitle].filter(Boolean).map(normalizeTitle);
    return list.some(item =>
        (item.tmdbId && Number(item.tmdbId) === Number(rec.id)) ||
        titles.includes(normalizeTitle(item.name)) ||
        (item.originalName && titles.includes(normalizeTitle(item.originalName)))
    );
}

// Kaydın TMDB kimliğini bul (yoksa adıyla arayıp kaydet)
async function resolveTmdbId(kind, item) {
    const expectedType = kind === 'series' ? 'tv' : 'movie';
    if (item.tmdbId && (!item.tmdbType || item.tmdbType === expectedType)) return Number(item.tmdbId);
    const match = await findExactMatch(kind, item);
    if (!match || match.source !== 'tmdb') return null;
    item.tmdbId = match.id;
    item.tmdbType = expectedType;
    localStorage.setItem(kind === 'series' ? 'seriesData' : 'moviesData', JSON.stringify(kind === 'series' ? seriesData : moviesData));
    return match.id;
}

function mapTmdbResult(kind, r) {
    return {
        kind,
        id: r.id,
        title: kind === 'series' ? r.name : r.title,
        originalTitle: kind === 'series' ? r.original_name : r.original_title,
        year: ((kind === 'series' ? r.first_air_date : r.release_date) || '').slice(0, 4),
        poster: r.poster_path ? TMDB_IMG + 'w342' + r.poster_path : '',
        overview: r.overview || '',
        vote: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
        voteCount: r.vote_count || 0
    };
}

// Bir yapımın benzerleri (önbellekli)
async function fetchRecommendations(kind, tmdbId) {
    const cacheKey = 'recsCache:' + recKey(kind, tmdbId);
    const cached = safeParse(cacheKey, null);
    if (cached && Date.now() - cached.at < RECS_CACHE_TTL && Array.isArray(cached.items)) return cached.items;

    const base = (kind === 'series' ? '/tv/' : '/movie/') + tmdbId;
    const recs = await tmdbFetch(base + '/recommendations', { page: 1 });
    let results = recs.results || [];
    if (results.length < 8) {
        try {
            const similar = await tmdbFetch(base + '/similar', { page: 1 });
            results = results.concat(similar.results || []);
        } catch (_) {}
    }
    const seen = new Set();
    const items = results
        .filter(r => r && r.id && !seen.has(r.id) && seen.add(r.id))
        .map(r => mapTmdbResult(kind, r))
        .filter(r => r.title);
    try { __origSetItem(cacheKey, JSON.stringify({ at: Date.now(), items })); } catch (_) {}
    return items;
}

function renderRecCard(rec, reason) {
    const key = recKey(rec.kind, rec.id);
    recsIndex.set(key, rec);
    const inList = isInMyList(rec.kind, rec);
    const typeText = rec.kind === 'series' ? 'Dizi' : 'Film';
    const poster = safeUrl(rec.poster);
    return `
        <div class="rec-card" data-rec-key="${esc(key)}">
            <div class="rec-poster">
                ${poster ? `<img src="${esc(poster)}" alt="${esc(rec.title)}" loading="lazy" onerror="handleImageError(this)">` : '<div class="rec-noposter"><i class="fas fa-image"></i></div>'}
                <button type="button" class="rec-play" data-rec-trailer="${esc(key)}" title="Fragmanı izle" aria-label="${esc(rec.title)} fragmanını izle"><i class="fas fa-play"></i></button>
                <span class="rec-type">${typeText}</span>
                ${rec.vote ? `<span class="rec-vote"><i class="fas fa-star"></i> ${esc(rec.vote)}</span>` : ''}
            </div>
            <div class="rec-body">
                <div class="rec-title">${esc(rec.title)}${rec.year && !rec.date ? ` <span class="rec-year">(${esc(rec.year)})</span>` : ''}</div>
                ${rec.date ? renderRecDate(rec.date) : ''}
                ${reason ? `<div class="rec-reason"><i class="fas fa-heart mr-1"></i>${esc(reason)}</div>` : ''}
                ${rec.overview ? `<p class="rec-overview">${esc(rec.overview)}</p>` : ''}
                <div class="rec-actions">
                    ${inList
                        ? '<span class="rec-inlist"><i class="fas fa-check mr-1"></i>Listende var</span>'
                        : `<button type="button" class="btn btn-primary btn-sm" data-rec-add="${esc(key)}"><i class="fas fa-plus mr-1"></i>Listeme Ekle</button>`}
                    <button type="button" class="btn btn-secondary btn-sm" data-rec-dismiss="${esc(key)}" title="Bunu bir daha önerme"><i class="fas fa-eye-slash"></i></button>
                </div>
            </div>
        </div>
    `;
}

// --- Tek bir yapıma benzerler (kart üzerindeki 💡) ---
const recsModal = document.getElementById('recsModal');

async function showSimilarFor(kind, id) {
    const list = kind === 'series' ? seriesData : moviesData;
    const item = list.find(x => String(x.id) === String(id));
    if (!item) return;
    const titleEl = document.getElementById('recsModalTitle');
    const statusEl = document.getElementById('recsModalStatus');
    const listEl = document.getElementById('recsModalList');
    titleEl.textContent = `"${item.name}" sevenler bunları da sevdi`;
    listEl.innerHTML = '';
    recsModal.classList.add('active');

    if (!hasTmdbKey()) {
        statusEl.innerHTML = 'Öneriler için TMDB anahtarı gerekli. <button type="button" class="helper-link" data-open-settings>Ayarlar\'dan ekle</button>.';
        return;
    }
    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Öneriler getiriliyor...';
    try {
        const tmdbId = await resolveTmdbId(kind, item);
        if (!tmdbId) {
            statusEl.textContent = `"${item.name}" TMDB'de bulunamadı. Düzenle ekranındaki ✨ ile doğru yapımı seçersen öneriler çalışır.`;
            return;
        }
        const dismissed = getDismissedRecs();
        const recs = (await fetchRecommendations(kind, tmdbId)).filter(r => !dismissed.has(recKey(r.kind, r.id)));
        if (!recs.length) {
            statusEl.textContent = 'Bu yapım için öneri bulunamadı.';
            return;
        }
        const notInList = recs.filter(r => !isInMyList(r.kind, r)).length;
        statusEl.textContent = `${recs.length} öneri (${notInList} tanesi listende yok).`;
        listEl.innerHTML = recs.slice(0, 20).map(r => renderRecCard(r, null)).join('');
    } catch (err) {
        statusEl.textContent = err.message;
    }
}

// --- Keşfet: tüm listeye göre kişisel öneriler ---
function pickSeedItems() {
    const candidates = [
        ...seriesData.map(s => ({ kind: 'series', item: s, status: getSeriesTotals(s).status })),
        ...moviesData.map(m => ({ kind: 'movie', item: m, status: m.watched ? 'completed' : 'planning' }))
    ].filter(c => c.status !== 'dropped');

    const score = c => {
        let s = 0;
        if (c.item.myRating != null) s += c.item.myRating * 2;
        if (c.status === 'completed') s += 6;
        else if (c.status === 'watching') s += 5;
        if (c.item.imdbRating) s += Number(c.item.imdbRating);
        const lastWatched = c.kind === 'series' ? getSeriesLastWatchedTimestamp(c.item) : getLastWatchedTimestamp(c.item);
        if (lastWatched) s += Math.max(0, 6 - (Date.now() - lastWatched) / (30 * 24 * 3600 * 1000)); // son 6 ay
        return s;
    };
    return candidates
        .filter(c => c.status !== 'planning' || c.item.myRating != null)
        .map(c => ({ ...c, weight: score(c) }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 12);
}

async function buildDiscoverRecommendations(onProgress) {
    const seeds = pickSeedItems();
    const dismissed = getDismissedRecs();
    const pool = new Map();
    let done = 0;
    for (const seed of seeds) {
        onProgress && onProgress(`${++done}/${seeds.length}: "${seed.item.name}" için öneriler alınıyor...`);
        let tmdbId = null;
        try { tmdbId = await resolveTmdbId(seed.kind, seed.item); } catch (err) {
            if (/anahtar|sınır/i.test(err.message)) throw err;
        }
        if (!tmdbId) continue;
        let recs = [];
        try { recs = await fetchRecommendations(seed.kind, tmdbId); } catch (err) {
            if (/anahtar|sınır/i.test(err.message)) throw err;
        }
        recs.slice(0, 15).forEach((rec, index) => {
            const key = recKey(rec.kind, rec.id);
            if (dismissed.has(key) || isInMyList(rec.kind, rec)) return;
            const entry = pool.get(key) || { rec, score: 0, reasons: [] };
            // Birden fazla favoride çıkan ve listede üst sıralarda olanlar öne geçer
            entry.score += 1 + seed.weight / 20 + (15 - index) / 30;
            if (!entry.reasons.includes(seed.item.name)) entry.reasons.push(seed.item.name);
            pool.set(key, entry);
        });
    }
    const results = Array.from(pool.values())
        .map(e => ({ ...e, score: e.score + (e.rec.vote || 0) / 10 + Math.min(e.rec.voteCount, 5000) / 20000 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 40)
        .map(e => ({ rec: e.rec, reason: e.reasons.slice(0, 2).join(' ve ') + ' sevdiğin için' }));
    __origSetItem('discoverCache', JSON.stringify({ at: Date.now(), results }));
    return results;
}

function renderDiscoverList(results) {
    const listEl = document.getElementById('discoverList');
    const dismissed = getDismissedRecs();
    const filtered = results.filter(({ rec }) =>
        !dismissed.has(recKey(rec.kind, rec.id)) &&
        !isInMyList(rec.kind, rec) &&
        (currentDiscoverFilter === 'all' || (currentDiscoverFilter === 'series') === (rec.kind === 'series')));
    listEl.innerHTML = filtered.length
        ? filtered.map(({ rec, reason }) => renderRecCard(rec, reason)).join('')
        : '<p class="text-sm opacity-70 col-span-full">Gösterilecek öneri kalmadı. "Yenile" ile yeniden hesaplayabilirsin.</p>';
    document.querySelectorAll('[data-discover-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-discover-filter') === currentDiscoverFilter);
    });
}

async function renderDiscover(forceRefresh) {
    const statusEl = document.getElementById('discoverStatus');
    if (!statusEl) return;
    if (!hasTmdbKey()) {
        statusEl.innerHTML = '<i class="fas fa-info-circle mr-1"></i>Öneriler için TMDB anahtarı gerekli. <button type="button" class="helper-link" data-open-settings>Ayarlar\'dan ekle</button>.';
        document.getElementById('discoverList').innerHTML = '';
        return;
    }
    const cached = safeParse('discoverCache', null);
    if (!forceRefresh && cached && Array.isArray(cached.results) && Date.now() - cached.at < RECS_CACHE_TTL) {
        statusEl.textContent = 'Son hesaplama: ' + new Date(cached.at).toLocaleString('tr-TR');
        renderDiscoverList(cached.results);
        return;
    }
    if (discoverLoading) return;
    if (pickSeedItems().length === 0) {
        statusEl.textContent = 'Öneri üretmek için önce birkaç yapımı izlendi/tamamlandı olarak işaretle veya puan ver.';
        return;
    }
    discoverLoading = true;
    const refreshBtn = document.getElementById('refreshDiscoverBtn');
    if (refreshBtn) refreshBtn.disabled = true;
    try {
        const results = await buildDiscoverRecommendations(text => {
            statusEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>' + esc(text);
        });
        statusEl.textContent = results.length
            ? `Beğendiğin ${pickSeedItems().length} yapıma göre ${results.length} öneri bulundu.`
            : 'Şu an öneri bulunamadı.';
        renderDiscoverList(results);
    } catch (err) {
        statusEl.textContent = err.message;
    } finally {
        discoverLoading = false;
        if (refreshBtn) refreshBtn.disabled = false;
    }
}

function setupRecommendations() {
    document.getElementById('closeRecsModal').addEventListener('click', () => closeModal(recsModal));
    document.getElementById('refreshDiscoverBtn').addEventListener('click', () => renderDiscover(true));
    setupNewReleases();
    document.querySelectorAll('[data-discover-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            currentDiscoverFilter = btn.getAttribute('data-discover-filter');
            const cached = safeParse('discoverCache', null);
            if (cached && Array.isArray(cached.results)) renderDiscoverList(cached.results);
        });
    });

    document.addEventListener('click', e => {
        const target = e.target;
        if (!(target instanceof Element)) return;

        const similarBtn = target.closest('.similar-icon');
        if (similarBtn) {
            const kind = similarBtn.closest('.series-card') ? 'series' : 'movie';
            showSimilarFor(kind, similarBtn.getAttribute('data-id'));
            return;
        }

        const addBtn = target.closest('[data-rec-add]');
        if (addBtn) {
            const rec = recsIndex.get(addBtn.getAttribute('data-rec-add'));
            if (!rec) return;
            closeModal(recsModal);
            if (rec.kind === 'series') addSeries(rec.title); else addMovie(rec.title);
            // Ekleme penceresini TMDB bilgileriyle otomatik doldur
            applyAutoFillResult(rec.kind, { source: 'tmdb', id: rec.id, title: rec.title });
            return;
        }

        const trailerBtn = target.closest('[data-rec-trailer]');
        if (trailerBtn) {
            playRecTrailer(trailerBtn);
            return;
        }

        const dismissBtn = target.closest('[data-rec-dismiss]');
        if (dismissBtn) {
            const key = dismissBtn.getAttribute('data-rec-dismiss');
            dismissRec(key);
            const card = dismissBtn.closest('.rec-card');
            if (card && card.closest('#newReleasesList')) {
                renderNewReleasesList();
                showToast('Bu yapım yeni çıkanlarda bir daha gösterilmeyecek.');
                return;
            }
            if (card) card.remove();
            showToast('Bu yapım bir daha önerilmeyecek.');
        }
    });
}

// =====================================================================
// Yeni Çıkanlar: önümüzdeki 30 gün içinde çıkacak popüler yapımlar (TMDB discover)
// =====================================================================
const NEW_RELEASES_TTL = 6 * 60 * 60 * 1000; // 6 saat
const NEW_RELEASES_DAYS = 30;
const NEW_RELEASES_PER_KIND = 24;
let newReleasesItems = [];
let newReleasesLoading = false;
let newReleasesPeriod = 'all'; // all | week | month
let newReleasesKind = 'all'; // all | series | movies

function isoLocalDate(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function renderRecDate(dateString) {
    const badge = getReleaseBadgeInfo(dateString);
    if (!badge) return '';
    const days = getDaysUntilRelease(dateString);
    const extra = days > 1 && days <= 30 ? ` · ${days} gün kaldı` : (days === 1 ? ' · yarın' : (days === 0 ? ' · bugün' : ''));
    return `<div class="rec-date ${badge.class === 'release-badge-soon' || badge.class === 'release-badge-today' ? 'is-soon' : ''}"><i class="fas fa-calendar-alt mr-1"></i>${esc(formatReleaseDate(dateString))}${esc(extra)}</div>`;
}

async function fetchNewReleases() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + NEW_RELEASES_DAYS);
    const from = isoLocalDate(today);
    const to = isoLocalDate(end);

    const movieParams = page => ({
        'primary_release_date.gte': from, 'primary_release_date.lte': to,
        sort_by: 'popularity.desc', include_adult: 'false', page
    });
    // Talk-show, haber ve pembe dizileri ele: "yeni çıkan dizi" olarak ilgi çekmez
    const tvParams = page => ({
        'first_air_date.gte': from, 'first_air_date.lte': to,
        sort_by: 'popularity.desc', include_null_first_air_dates: 'false',
        without_genres: '10767,10763,10766', page
    });

    const jobs = [
        ['movie', tmdbFetch('/discover/movie', movieParams(1))],
        ['movie', tmdbFetch('/discover/movie', movieParams(2))],
        ['series', tmdbFetch('/discover/tv', tvParams(1))],
        ['series', tmdbFetch('/discover/tv', tvParams(2))]
    ];
    const settled = await Promise.allSettled(jobs.map(j => j[1]));
    const failed = settled.filter(r => r.status === 'rejected');
    if (failed.length === settled.length) throw failed[0].reason;

    const items = [];
    settled.forEach((res, i) => {
        if (res.status !== 'fulfilled') return;
        const kind = jobs[i][0];
        (res.value.results || []).forEach(r => {
            const rec = mapTmdbResult(kind, r);
            rec.date = (kind === 'series' ? r.first_air_date : r.release_date) || '';
            rec.popularity = r.popularity || 0;
            if (rec.id && rec.title && rec.date && rec.poster) items.push(rec);
        });
    });

    const seen = new Set();
    const result = [];
    ['movie', 'series'].forEach(kind => {
        items.filter(r => r.kind === kind)
            .sort((a, b) => b.popularity - a.popularity)
            .filter(r => !seen.has(recKey(r.kind, r.id)) && seen.add(recKey(r.kind, r.id)))
            .slice(0, NEW_RELEASES_PER_KIND)
            .forEach(r => result.push(r));
    });
    return result;
}

function renderNewReleasesList() {
    const listEl = document.getElementById('newReleasesList');
    const statusEl = document.getElementById('newReleasesStatus');
    if (!listEl) return;

    const dismissed = getDismissedRecs();
    const visible = newReleasesItems
        .map(rec => ({ rec, days: getDaysUntilRelease(rec.date) }))
        .filter(({ rec, days }) =>
            days !== null && days >= 0 &&
            !dismissed.has(recKey(rec.kind, rec.id)) &&
            !isInMyList(rec.kind, rec) &&
            (newReleasesKind === 'all' || (newReleasesKind === 'series') === (rec.kind === 'series')))
        .sort((a, b) => (a.days - b.days) || (b.rec.popularity - a.rec.popularity));

    document.querySelectorAll('[data-newrel-period]').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-newrel-period') === newReleasesPeriod));
    document.querySelectorAll('[data-newrel-kind]').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-newrel-kind') === newReleasesKind));

    const week = visible.filter(v => v.days <= 7);
    const month = visible.filter(v => v.days > 7);
    const groups = [];
    if (newReleasesPeriod !== 'month' && week.length) groups.push({ title: 'Bu Hafta', icon: 'fa-bolt', items: week });
    if (newReleasesPeriod !== 'week' && month.length) groups.push({ title: 'Bu Ay', icon: 'fa-calendar-day', items: month });

    if (!groups.length) {
        listEl.innerHTML = '<p class="text-sm opacity-70">Bu aralıkta gösterilecek yeni yapım yok. Listendekiler ve "gösterme" dediklerin hariç tutulur.</p>';
        return;
    }
    listEl.innerHTML = groups.map(g => `
        <section class="newrel-group">
            <h3 class="newrel-group-title"><i class="fas ${g.icon} mr-2"></i>${g.title}<span class="newrel-group-count">${g.items.length}</span></h3>
            <div class="recs-grid">${g.items.map(({ rec }) => renderRecCard(rec, null)).join('')}</div>
        </section>
    `).join('');
    if (statusEl && !newReleasesLoading) {
        statusEl.textContent = `${visible.length} yapım listelendi.`;
    }
}

async function renderNewReleases(forceRefresh) {
    const statusEl = document.getElementById('newReleasesStatus');
    const listEl = document.getElementById('newReleasesList');
    if (!statusEl || !listEl) return;
    if (!hasTmdbKey()) {
        statusEl.innerHTML = '<i class="fas fa-info-circle mr-1"></i>Yeni çıkanları görmek için TMDB anahtarı gerekli. <button type="button" class="helper-link" data-open-settings>Ayarlar\'dan ekle</button>.';
        listEl.innerHTML = '';
        return;
    }
    const today = isoLocalDate(new Date());
    const cached = safeParse('newReleasesCache', null);
    if (!forceRefresh && cached && cached.day === today && Array.isArray(cached.items) && Date.now() - cached.at < NEW_RELEASES_TTL) {
        newReleasesItems = cached.items;
        renderNewReleasesList();
        return;
    }
    if (newReleasesLoading) return;
    newReleasesLoading = true;
    const refreshBtn = document.getElementById('refreshNewReleasesBtn');
    if (refreshBtn) refreshBtn.disabled = true;
    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Yeni çıkanlar getiriliyor...';
    try {
        const items = await fetchNewReleases();
        newReleasesItems = items;
        try { __origSetItem('newReleasesCache', JSON.stringify({ at: Date.now(), day: today, items })); } catch (_) {}
        newReleasesLoading = false;
        renderNewReleasesList();
    } catch (err) {
        // Eski önbellek varsa onu göster, yoksa hatayı bildir
        if (cached && Array.isArray(cached.items) && cached.items.length) {
            newReleasesItems = cached.items;
            newReleasesLoading = false;
            renderNewReleasesList();
            statusEl.textContent = err.message + ' Son kaydedilen liste gösteriliyor.';
        } else {
            statusEl.textContent = err.message;
            listEl.innerHTML = '';
        }
    } finally {
        newReleasesLoading = false;
        if (refreshBtn) refreshBtn.disabled = false;
    }
}

// Bir yapımın fragmanını TMDB'den bul (önbellekli) ve fragman penceresinde aç
async function resolveRecTrailer(rec) {
    if (typeof rec.trailerUrl === 'string') return rec.trailerUrl; // '' = fragman yok (daha önce soruldu)
    const vids = await tmdbFetch(`/${rec.kind === 'series' ? 'tv' : 'movie'}/${rec.id}/videos`, {
        language: 'en-US', include_video_language: 'tr,en'
    });
    rec.trailerUrl = pickTrailer(vids);
    // Bulunan fragmanı, bu yapımı tutan önbelleklere de yaz (yeni çıkanlar ve öneriler)
    const patch = (cacheKey, listKey, getRec) => {
        try {
            const cached = safeParse(cacheKey, null);
            if (!cached || !Array.isArray(cached[listKey])) return;
            let changed = false;
            cached[listKey].forEach(entry => {
                const r = getRec(entry);
                if (r && r.kind === rec.kind && r.id === rec.id && r.trailerUrl !== rec.trailerUrl) { r.trailerUrl = rec.trailerUrl; changed = true; }
            });
            if (changed) __origSetItem(cacheKey, JSON.stringify(cached));
        } catch (_) {}
    };
    patch('newReleasesCache', 'items', r => r);
    patch('discoverCache', 'results', e => e && e.rec);
    return rec.trailerUrl;
}

async function playRecTrailer(button) {
    const rec = recsIndex.get(button.getAttribute('data-rec-trailer'));
    if (!rec || button.disabled) return;
    button.disabled = true;
    button.classList.add('is-loading');
    try {
        const url = await resolveRecTrailer(rec);
        if (url) showTrailerModal(url, rec.title);
        else showToast(`"${rec.title}" için henüz fragman yok.`);
    } catch (err) {
        showToast(err.message);
    } finally {
        button.disabled = false;
        button.classList.remove('is-loading');
    }
}

function setupNewReleases() {
    const refreshBtn = document.getElementById('refreshNewReleasesBtn');
    if (!refreshBtn) return;
    refreshBtn.addEventListener('click', () => renderNewReleases(true));
    document.querySelectorAll('[data-newrel-period]').forEach(btn => btn.addEventListener('click', () => {
        newReleasesPeriod = btn.getAttribute('data-newrel-period');
        renderNewReleasesList();
    }));
    document.querySelectorAll('[data-newrel-kind]').forEach(btn => btn.addEventListener('click', () => {
        newReleasesKind = btn.getAttribute('data-newrel-kind');
        renderNewReleasesList();
    }));
}

// Sorting functions
function getSortComparator(sortType, getLastWatched) {
    const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'tr');
    switch (sortType) {
        case 'recent':
            return (a, b) => (getLastWatched(b) - getLastWatched(a))
                || (getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt))
                || byName(a, b);
        case 'newest':
            return (a, b) => (getTimestamp(b.createdAt) - getTimestamp(a.createdAt)) || byName(a, b);
        case 'oldest':
            return (a, b) => (getTimestamp(a.createdAt) - getTimestamp(b.createdAt)) || byName(a, b);
        case 'alphabetical':
            return byName;
        case 'alphabetical-desc':
            return (a, b) => byName(b, a);
        case 'rating-desc':
            return (a, b) => ((b.imdbRating || 0) - (a.imdbRating || 0)) || byName(a, b);
        case 'rating-asc':
            return (a, b) => ((a.imdbRating || 0) - (b.imdbRating || 0)) || byName(a, b);
        case 'my-rating-desc':
            return (a, b) => ((b.myRating || 0) - (a.myRating || 0)) || ((b.imdbRating || 0) - (a.imdbRating || 0)) || byName(a, b);
        case 'release-desc':
            return (a, b) => (getTimestamp(b.releaseDate) - getTimestamp(a.releaseDate)) || byName(a, b);
        default:
            return null;
    }
}

// Sabitlenenler seçilen sıralamadan bağımsız olarak hep üstte kalır
function pinnedFirst(comparator) {
    return (a, b) => (!!b.pinned - !!a.pinned) || (comparator ? comparator(a, b) : 0);
}

function sortSeries(sortType) {
    filteredSeriesData.sort(pinnedFirst(getSortComparator(sortType, getSeriesLastWatchedTimestamp)));
    renderSeriesList();
}

function sortMovies(sortType) {
    filteredMoviesData.sort(pinnedFirst(getSortComparator(sortType, getLastWatchedTimestamp)));
    renderMoviesList();
}

// Sıralama seçimini hatırla
const seriesSortSelectEl = document.getElementById('seriesSortSelect');
const moviesSortSelectEl = document.getElementById('moviesSortSelect');
seriesSortSelectEl.value = localStorage.getItem('seriesSort') || 'recent';
moviesSortSelectEl.value = localStorage.getItem('moviesSort') || 'recent';
if (!seriesSortSelectEl.value) seriesSortSelectEl.value = 'recent';
if (!moviesSortSelectEl.value) moviesSortSelectEl.value = 'recent';

seriesSortSelectEl.addEventListener('change', function() {
    localStorage.setItem('seriesSort', this.value);
    sortSeries(this.value);
});

moviesSortSelectEl.addEventListener('change', function() {
    localStorage.setItem('moviesSort', this.value);
    sortMovies(this.value);
});

// Initialize the app
initApp();
setupCloudSync();
setupRecommendations();

// Son açık sekmeyi hatırla
try {
    const savedTab = document.getElementById(localStorage.getItem('activeTab') || '');
    if (savedTab && TABS.some(t => t.tab === savedTab)) showTab(savedTab);
} catch (_) {}

// PWA: çevrimdışı çalışma için service worker
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}
