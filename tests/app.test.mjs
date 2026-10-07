// Uygulamayı jsdom içinde yükleyip temel veri mantığını test eder.
// Çalıştırmak için: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    // Dış kaynakları (CDN) testte yükleme
    .replace(/<script src="https?:[^"]*"><\/script>/g, '')
    .replace(/<script src="js\/app\.js(\?v=[^"]*)?"><\/script>/, '');
const appJs = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

// Uygulama betiğini gerçek bir <script> gibi çalıştır (let/const değişkenleri global kalsın)
function runApp(window) {
    const script = window.document.createElement('script');
    script.textContent = appJs;
    window.document.body.appendChild(script);
}

function createWindow() {
    const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
    const { window } = dom;
    window.tailwind = {};
    window.alert = () => {};
    window.confirm = () => true;
    window.onerror = (message) => { throw new Error(message); };
    return window;
}

function loadApp(storage = {}) {
    const window = createWindow();
    Object.entries(storage).forEach(([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)));
    runApp(window);
    return window;
}

const legacySeries = [
    { id: 1, name: 'İstanbul Masalı', season: 1, totalEpisodes: 8, watchedEpisodes: 8, platform: 'Netflix', categories: [3], tags: ['Gizem'], imageUrl: 'https://img/a.jpg', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    { id: 2, name: 'İstanbul Masalı', season: 2, totalEpisodes: 8, watchedEpisodes: 3, platform: 'Netflix', categories: [3, 1], tags: ['Gizem'], imageUrl: 'https://img/b.jpg', createdAt: '2024-02-01T00:00:00Z', updatedAt: '2024-03-01T00:00:00Z' },
    { id: 3, name: 'Dark', season: 1, totalEpisodes: 10, watchedEpisodes: 0, platform: 'Netflix', categories: [], tags: [] }
];

test('eski sezon-satırı verisi dizi başına tek kayda dönüştürülür', () => {
    const w = loadApp({ seriesData: legacySeries });
    // jsdom nesnelerini bu ortama kopyala (farklı realm karşılaştırması için)
    const series = JSON.parse(JSON.stringify(w.eval('seriesData')));
    assert.equal(series.length, 2);
    const ist = series.find(s => s.name === 'İstanbul Masalı');
    assert.deepEqual(ist.seasons.map(s => [s.season, s.totalEpisodes, s.watchedEpisodes]), [[1, 8, 8], [2, 8, 3]]);
    // En son güncellenen satırın bilgileri kazanır
    assert.equal(ist.imageUrl, 'https://img/b.jpg');
    assert.deepEqual(ist.categories, [3, 1]);
    // Eski veri yedeklenir
    assert.ok(w.localStorage.getItem('seriesData_v1_backup'));
    // İstatistik dizi sayısını gösterir, sezon sayısını değil
    assert.equal(w.document.getElementById('seriesStats').textContent, '2');
});

test('dizi durumu tüm sezonlara göre hesaplanır', () => {
    const w = loadApp({ seriesData: legacySeries });
    const ist = w.eval("seriesData.find(s => s.name === 'İstanbul Masalı')");
    assert.equal(w.getSeriesStatus(ist), 'watching');
    w.eval("currentSeriesFilter = 'completed'; filterSeries();");
    assert.equal(w.eval('filteredSeriesData.length'), 0);
});

test('Türkçe büyük/küçük harf duyarsız arama', () => {
    const w = loadApp({ seriesData: legacySeries });
    w.document.getElementById('searchSeries').value = 'istanbul';
    w.filterSeries();
    assert.equal(w.eval('filteredSeriesData.length'), 1);
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('senkron birleştirme: yeni olan kazanır, silinen geri gelmez, döngüye girmez', async () => {
    const w = loadApp({ seriesData: legacySeries });
    w.eval('rtcChannel = { readyState: "open", bufferedAmount: 0, send() { window.__sent = (window.__sent || 0) + 1; } }');
    const dark = w.eval("seriesData.find(s => s.name === 'Dark')");
    w.removeSeries(dark.id);
    await wait(700);
    const remoteSeries = JSON.parse(JSON.stringify(w.eval('seriesData'))).concat([{ ...dark }]);
    remoteSeries[0].name = 'Uzak Değişiklik';
    remoteSeries[0].updatedAt = '2030-01-01T00:00:00Z';
    const remote = { series: remoteSeries, movies: [], categories: w.eval('categoriesData'), tags: [] };

    w.__sent = 0;
    w.applyRemoteData(remote);
    const names = w.eval('seriesData.map(s => s.name)');
    assert.ok(names.includes('Uzak Değişiklik'));
    assert.ok(!names.includes('Dark'));
    await wait(700);
    // Değişiklik oldu: birleşmiş hali karşı tarafa bir kez gönderir
    const afterFirst = w.__sent;
    assert.ok(afterFirst >= 1);

    // Aynı veri tekrar gelirse artık hiçbir şey göndermez (sonsuz döngü yok)
    w.applyRemoteData(remote);
    await wait(700);
    assert.equal(w.__sent, afterFirst);
    w.close();
});

test('kullanıcı verisi HTML olarak çalıştırılmaz (XSS)', () => {
    const w = loadApp({ moviesData: [{ id: 1, name: '<img src=x onerror="window.__xss=1">', watched: false }] });
    assert.equal(w.document.querySelector('#moviesList img[src="x"]'), null);
    assert.ok(w.document.querySelector('#moviesList .card-title').textContent.includes('<img'));
});

test('bozuk localStorage verisi uygulamayı çökertmez', () => {
    const window = createWindow();
    window.localStorage.setItem('seriesData', '{bozuk json');
    runApp(window);
    assert.equal(window.eval('seriesData.length'), 0);
});

test('P2P: büyük veri (256 KB üstü) parçalar halinde eksiksiz aktarılır', async () => {
    const movies = Array.from({ length: 800 }, (_, i) => ({
        id: i + 1, name: 'Film ' + i, watched: i % 2 === 0, description: 'x'.repeat(400), createdAt: '2024-01-01T00:00:00Z'
    }));
    const sender = loadApp({ moviesData: movies });
    const receiver = loadApp({});
    const messages = [];
    const fakeChannel = { readyState: 'open', bufferedAmount: 0, send: m => messages.push(m) };

    const ok = await sender.sendSyncPayload(fakeChannel);
    assert.equal(ok, true);
    assert.ok(messages.length > 1, 'veri birden fazla parçaya bölünmeli');
    assert.ok(messages.every(m => m.length < 64 * 1024), 'her parça WebRTC sınırının altında olmalı');

    for (const m of messages) await receiver.handlePeerMessage(m);
    assert.equal(receiver.eval('moviesData.length'), 800);
    sender.close();
    receiver.close();
});

test('bulut senkronu: iki cihaz aynı gist üzerinden değişiklikleri paylaşır', async () => {
    // Sahte GitHub Gist API'si (iki cihaz aynı "sunucuyu" görür)
    const server = { gist: null };
    function installFakeGitHub(w) {
        w.fetch = async (url, options = {}) => {
            const method = options.method || 'GET';
            const json = body => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
            if (url.includes('/gists?')) return json(server.gist ? [server.gist] : []);
            if (method === 'POST') {
                const body = JSON.parse(options.body);
                server.gist = { id: 'g1', files: { 'izleme-takip-data.json': { content: body.files['izleme-takip-data.json'].content } } };
                return json(server.gist);
            }
            if (method === 'PATCH') {
                const body = JSON.parse(options.body);
                server.gist.files['izleme-takip-data.json'].content = body.files['izleme-takip-data.json'].content;
                return json(server.gist);
            }
            return json(server.gist);
        };
    }

    const phone = loadApp({ moviesData: [{ id: 1, name: 'Telefondaki Film', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }] });
    const pc = loadApp({ moviesData: [{ id: 2, name: 'Bilgisayardaki Film', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }] });
    for (const w of [phone, pc]) {
        installFakeGitHub(w);
        w.localStorage.setItem('gistToken', 'test-token');
    }

    await phone.cloudSync(); // gist'i oluşturur
    await pc.cloudSync();    // telefonun verisini alır, kendi verisini ekler
    await phone.cloudSync(); // bilgisayarın verisini alır

    const names = w => w.eval('moviesData.map(m => m.name)').slice().sort();
    assert.deepEqual(JSON.parse(JSON.stringify(names(phone))), ['Bilgisayardaki Film', 'Telefondaki Film']);
    assert.deepEqual(JSON.parse(JSON.stringify(names(pc))), ['Bilgisayardaki Film', 'Telefondaki Film']);

    // Bilgisayarda silinen film telefonda da silinir
    pc.eval("removeMovie(1)");
    await pc.cloudSync();
    await phone.cloudSync();
    assert.deepEqual(JSON.parse(JSON.stringify(names(phone))), ['Bilgisayardaki Film']);
    phone.close();
    pc.close();
});

test('öneriler: ortak öneri üste çıkar, listede olan ve reddedilen gösterilmez', async () => {
    const w = loadApp({
        moviesData: [
            { id: 1, name: 'Favori Film', watched: true, myRating: 9, tmdbId: 10, tmdbType: 'movie', createdAt: '2024-01-01T00:00:00Z' },
            { id: 2, name: 'İkinci Film', watched: true, tmdbId: 20, tmdbType: 'movie', createdAt: '2024-01-01T00:00:00Z' }
        ]
    });
    w.localStorage.setItem('tmdbKey', 'test');
    const movie = (id, title) => ({ id, title, original_title: title, release_date: '2020-01-01', vote_average: 7, vote_count: 100, overview: '' });
    const responses = {
        '/movie/10/recommendations': [movie(100, 'Ortak Öneri'), movie(200, 'Sadece Birincisi'), movie(20, 'İkinci Film')],
        '/movie/20/recommendations': [movie(100, 'Ortak Öneri'), movie(300, 'Sadece İkincisi')]
    };
    w.fetch = async url => {
        const path = new URL(url).pathname.replace('/3', '');
        const results = responses[path] || [];
        return { ok: true, status: 200, json: async () => ({ results }) };
    };

    const results = JSON.parse(JSON.stringify(await w.buildDiscoverRecommendations()));
    const titles = results.map(r => r.rec.title);
    assert.equal(titles[0], 'Ortak Öneri');
    assert.ok(results[0].reason.includes('Favori Film') && results[0].reason.includes('İkinci Film'));
    assert.ok(!titles.includes('İkinci Film'), 'listede olan yapım önerilmemeli');

    w.dismissRec('movie:100');
    w.localStorage.removeItem('discoverCache');
    const again = JSON.parse(JSON.stringify(await w.buildDiscoverRecommendations())).map(r => r.rec.title);
    assert.ok(!again.includes('Ortak Öneri'), 'reddedilen öneri bir daha çıkmamalı');
    w.close();
});

test('kartlarda çıkış yılı varsa başlığın yanında gösterilir', () => {
    const w = loadApp({
        moviesData: [
            { id: 1, name: 'Yıllı Film', releaseDate: '2014-11-05' },
            { id: 2, name: 'Yılsız Film' }
        ]
    });
    const titles = Array.from(w.document.querySelectorAll('#moviesList .card-title')).map(el => el.textContent.trim());
    assert.ok(titles.includes('Yıllı Film (2014)'));
    assert.ok(titles.includes('Yılsız Film'));
    w.close();
});

test('yeni çıkanlar: tarih aralığıyla sorgulanır, haftalara ayrılır, listedekiler gizlenir', async () => {
    const w = loadApp({
        moviesData: [{ id: 1, name: 'Listedeki Film', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }]
    });
    w.localStorage.setItem('tmdbKey', 'test');
    const day = n => { const d = new Date(); d.setDate(d.getDate() + n); const p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
    const requested = [];
    w.fetch = async url => {
        const u = new URL(url);
        requested.push(u);
        const page = u.searchParams.get('page');
        let results = [];
        if (page === '1' && u.pathname.endsWith('/discover/movie')) {
            results = [
                { id: 11, title: 'Bu Hafta Filmi', release_date: day(2), poster_path: '/a.jpg', popularity: 50 },
                { id: 12, title: 'Bu Ay Filmi', release_date: day(15), poster_path: '/b.jpg', popularity: 40 },
                { id: 13, title: 'Listedeki Film', release_date: day(3), poster_path: '/c.jpg', popularity: 30 },
                { id: 14, title: 'Afişsiz Film', release_date: day(4), poster_path: null, popularity: 20 }
            ];
        } else if (page === '1' && u.pathname.endsWith('/discover/tv')) {
            results = [{ id: 21, name: 'Yeni Dizi', first_air_date: day(5), poster_path: '/d.jpg', popularity: 60 }];
        }
        return { ok: true, status: 200, json: async () => ({ results }) };
    };

    await w.renderNewReleases(true);

    const movieReq = requested.find(u => u.pathname.endsWith('/discover/movie'));
    assert.equal(movieReq.searchParams.get('primary_release_date.gte'), day(0));
    assert.equal(movieReq.searchParams.get('primary_release_date.lte'), day(30));
    const tvReq = requested.find(u => u.pathname.endsWith('/discover/tv'));
    assert.equal(tvReq.searchParams.get('first_air_date.gte'), day(0));

    const doc = w.document;
    const titles = Array.from(doc.querySelectorAll('#newReleasesList .rec-title')).map(el => el.textContent.replace(/\s+/g, ' ').trim());
    assert.deepEqual(titles.sort(), ['Bu Ay Filmi', 'Bu Hafta Filmi', 'Yeni Dizi']);
    const groups = Array.from(doc.querySelectorAll('.newrel-group')).map(g => g.querySelector('.newrel-group-title').textContent.replace(/\d+$/, '').trim());
    assert.deepEqual(groups, ['Bu Hafta', 'Bu Ay']);
    assert.ok(doc.querySelector('#newReleasesList [data-rec-add="series:21"]'), 'dizi için "Listeme Ekle" olmalı');

    // Sadece diziler
    doc.querySelector('[data-newrel-kind="series"]').click();
    assert.equal(doc.querySelectorAll('#newReleasesList .rec-card').length, 1);

    // Ağ hatasında anlaşılır mesaj, önbellek varsa liste korunur
    w.fetch = async () => { throw new TypeError('network'); };
    await w.renderNewReleases(true);
    assert.ok(doc.getElementById('newReleasesStatus').textContent.includes('Son kaydedilen liste'));
    assert.ok(doc.querySelectorAll('#newReleasesList .rec-card').length >= 1);
    w.close();
});

test('yedek: posterler yedeğe gömülür ve geri yüklemede görsel önbelleğine yazılır', async () => {
    const w = loadApp({
        seriesData: [{ id: 1, name: 'Dizi', imageUrl: 'https://img.example/a.jpg', seasons: [{ season: 1, totalEpisodes: 1, watchedEpisodes: 0 }], createdAt: '2024-01-01T00:00:00Z' }],
        moviesData: [
            { id: 2, name: 'Film', imageUrl: 'https://img.example/b.jpg', createdAt: '2024-01-01T00:00:00Z' },
            { id: 3, name: 'Bozuk', imageUrl: 'https://img.example/yok.jpg', createdAt: '2024-01-01T00:00:00Z' },
            { id: 4, name: 'Aynı', imageUrl: 'https://img.example/a.jpg', createdAt: '2024-01-01T00:00:00Z' }
        ]
    });
    const stores = new Map();
    w.caches = { open: async name => {
        if (!stores.has(name)) stores.set(name, new Map());
        const m = stores.get(name);
        return { match: async u => m.get(u), put: async (u, r) => { m.set(u, r); } };
    } };
    w.Response = class { constructor(body, init) { this.body = body; this.headers = init.headers; } };
    const fetched = [];
    w.fetch = async url => {
        fetched.push(url);
        if (url.startsWith('data:')) {
            const [head, b64] = url.split(',');
            return { ok: true, blob: async () => new w.Blob([Buffer.from(b64, 'base64')], { type: head.slice(5, head.indexOf(';')) }) };
        }
        if (url.endsWith('yok.jpg')) return { ok: false, status: 404 };
        return { ok: true, blob: async () => new w.Blob([Buffer.from('fake-image-bytes')], { type: 'image/png' }) };
    };

    const result = await w.buildPosterBackup();
    assert.equal(result.total, 3, 'aynı poster tek sayılır');
    assert.equal(result.failed, 1);
    assert.deepEqual(Object.keys(result.posters).sort(), ['https://img.example/a.jpg', 'https://img.example/b.jpg']);
    assert.ok(result.posters['https://img.example/a.jpg'].startsWith('data:image/'));

    const restored = await w.restorePosters({ ...result.posters, 'javascript:alert(1)': 'data:image/png;base64,AAAA', 'https://img.example/c.jpg': 'data:text/html;base64,AAAA' });
    assert.equal(restored, 2, 'sadece geçerli adres + görsel verisi yazılır');
    const cache = await w.caches.open('izleme-takip-posters-v1');
    assert.ok(await cache.match('https://img.example/a.jpg'));
    assert.ok(!(await cache.match('https://img.example/c.jpg')));
    w.close();
});

test('yeni çıkanlar: poster üstündeki oynat düğmesi fragmanı bulup açar, yoksa bildirir', async () => {
    const w = loadApp({});
    w.localStorage.setItem('tmdbKey', 'test');
    const day = n => { const d = new Date(); d.setDate(d.getDate() + n); const p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
    const requested = [];
    w.fetch = async url => {
        const u = new URL(url);
        requested.push(u);
        let body = { results: [] };
        if (u.pathname.endsWith('/discover/movie')) body = { results: [
            { id: 11, title: 'Fragmanlı Film', release_date: day(2), poster_path: '/a.jpg', popularity: 50 },
            { id: 12, title: 'Fragmansız Film', release_date: day(3), poster_path: '/b.jpg', popularity: 40 }
        ] };
        if (u.pathname.endsWith('/movie/11/videos')) body = { results: [
            { site: 'YouTube', key: 'abc123XYZ_-', type: 'Trailer', official: true, iso_639_1: 'en', published_at: '2026-01-01T00:00:00Z' },
            { site: 'Vimeo', key: 'nope', type: 'Trailer' }
        ] };
        return { ok: true, status: 200, json: async () => body };
    };
    await w.renderNewReleases(true);
    const doc = w.document;

    doc.querySelector('[data-rec-trailer="movie:11"]').click();
    await new Promise(r => setTimeout(r, 20));
    const videoReq = requested.find(u => u.pathname.endsWith('/movie/11/videos'));
    assert.ok(videoReq, 'videolar TMDB’den istenmeli');
    assert.equal(videoReq.searchParams.get('include_video_language'), 'tr,en');
    assert.ok(doc.querySelector('.close-trailer-btn'), 'fragman penceresi açılmalı');
    assert.ok(doc.body.innerHTML.includes('abc123XYZ_-'));
    // Sonuç önbelleğe yazılır: ikinci tıklamada yeniden istek atılmaz
    const before = requested.length;
    doc.querySelector('.close-trailer-btn').click();
    doc.querySelector('[data-rec-trailer="movie:11"]').click();
    await new Promise(r => setTimeout(r, 20));
    assert.equal(requested.length, before);
    assert.equal(JSON.parse(w.localStorage.getItem('newReleasesCache')).items.find(i => i.id === 11).trailerUrl, 'https://www.youtube.com/watch?v=abc123XYZ_-');

    doc.querySelector('[data-rec-trailer="movie:12"]').click();
    await new Promise(r => setTimeout(r, 20));
    assert.ok(doc.getElementById('toastContainer').textContent.includes('henüz fragman yok'));
    w.close();
});

test('öneriler: kartlardaki oynat düğmesi fragmanı açar ve öneri önbelleğine yazar', async () => {
    const w = loadApp({});
    w.localStorage.setItem('tmdbKey', 'test');
    const rec = { kind: 'movie', id: 77, title: 'Önerilen Film', originalTitle: 'Rec', year: '2020', poster: 'https://img/p.jpg', overview: '', vote: 7.5, voteCount: 100 };
    w.localStorage.setItem('discoverCache', JSON.stringify({ at: Date.now(), results: [{ rec, reason: 'X sevdiğin için' }] }));
    w.fetch = async url => {
        const u = new URL(url);
        const body = u.pathname.endsWith('/movie/77/videos')
            ? { results: [{ site: 'YouTube', key: 'rec77KEYabc', type: 'Trailer', iso_639_1: 'tr', published_at: '2026-01-01T00:00:00Z' }] }
            : { results: [] };
        return { ok: true, status: 200, json: async () => body };
    };
    w.renderDiscoverList(JSON.parse(w.localStorage.getItem('discoverCache')).results);
    const btn = w.document.querySelector('#discoverList [data-rec-trailer="movie:77"]');
    assert.ok(btn, 'öneri kartında oynat düğmesi olmalı');
    btn.click();
    await new Promise(r => setTimeout(r, 20));
    assert.ok(w.document.body.innerHTML.includes('rec77KEYabc'), 'fragman penceresi açılmalı');
    const saved = JSON.parse(w.localStorage.getItem('discoverCache')).results[0].rec.trailerUrl;
    assert.equal(saved, 'https://www.youtube.com/watch?v=rec77KEYabc');
    w.close();
});
