// İzleme Takip - service worker (çevrimdışı çalışma)
const CACHE = 'izleme-takip-20260926-3';
const APP_SHELL = ['./', './index.html', './css/styles.css?v=20260926-3', './js/app.js?v=20260926-3', './manifest.webmanifest', './icon.svg'];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

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
    }
    // Diğer istekler (TMDB, YouTube, posterler) doğrudan ağa gider
});
