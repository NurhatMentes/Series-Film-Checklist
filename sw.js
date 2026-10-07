// İzleme Takip - service worker (çevrimdışı çalışma)
const CACHE = 'izleme-takip-20261007-2';
// Posterler ayrı bir önbellekte tutulur: uygulama sürümü değişince silinmez
const IMG_CACHE = 'izleme-takip-posters-v1';
const IMG_CACHE_MAX = 400; // en çok bu kadar görsel saklanır (eskiler silinir)
const APP_SHELL = ['./', './index.html', './css/styles.css?v=20261007-2', './css/tailwind.css?v=20261007-2', './js/app.js?v=20261007-2', './manifest.webmanifest', './icon.svg'];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
// CORS izni vermediği anlaşılan görsel sunucuları (bu oturum boyunca tekrar denenmez)
const noCorsHosts = new Set();

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Görseli (poster, fragman küçük resmi) önbellekten ver; yoksa ağdan alıp sakla.
// <img> istekleri "no-cors" gelir ve yanıtı opak olur (kota için çok yer sayılır, içeriği doğrulanamaz).
// Bu yüzden önce aynı adresi CORS ile isteriz; sunucu izin vermezse önbelleğe almadan olduğu gibi geçiririz.
async function handleImage(request) {
    const cache = await caches.open(IMG_CACHE);
    const cached = await cache.match(request.url);
    if (cached) return cached;

    const host = new URL(request.url).hostname;
    if (!noCorsHosts.has(host)) {
        try {
            const response = await fetch(request.url, { mode: 'cors', credentials: 'omit' });
            if (response.ok) {
                await cache.put(request.url, response.clone());
                trimImageCache(cache);
                return response;
            }
            return response; // 404 vb.: önbelleğe alma, olduğu gibi ilet
        } catch (_) {
            // CORS reddi ile gerçek ağ hatasını ayırt edemeyiz; aşağıda normal istek ağ hatasını zaten bildirir
            noCorsHosts.add(host);
        }
    }
    return fetch(request);
}

async function trimImageCache(cache) {
    try {
        const keys = await cache.keys();
        const extra = keys.length - IMG_CACHE_MAX;
        for (let i = 0; i < extra; i++) await cache.delete(keys[i]); // keys() ekleme sırasındadır: en eskiler gider
    } catch (_) { /* önemsiz */ }
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    // Uygulama dosyaları: önce ağ (güncel sürüm), ağ yoksa önbellek
    if (url.origin === self.location.origin) {
        event.respondWith(
            // Tarayıcının HTTP önbelleğini atla, sunucuya her seferinde değişip değişmediğini sor
            fetch(request, { cache: 'no-cache' })
                .then(response => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE).then(cache => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html')))
        );
        return;
    }

    // CDN kütüphaneleri: önbellekten hızlı ver, arkada güncelle
    if (CDN_HOSTS.includes(url.hostname)) {
        event.respondWith(
            caches.match(request).then(cached => {
                const network = fetch(request)
                    .then(response => {
                        if (response.ok || response.type === 'opaque') {
                            const copy = response.clone();
                            caches.open(CACHE).then(cache => cache.put(request, copy));
                        }
                        return response;
                    })
                    .catch(() => cached);
                return cached || network;
            })
        );
        return;
    }

    // Posterler ve diğer görseller: önbellekten ver, yoksa alıp sakla (çevrimdışı ve ağ sorunlarında da görünür)
    if (request.destination === 'image' && url.protocol === 'https:') {
        event.respondWith(handleImage(request));
    }
    // Diğer istekler (TMDB, YouTube vb. API çağrıları) doğrudan ağa gider
});
