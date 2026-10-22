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

test('ne izlesem: bitmemiş yapımlardan seçer, filtreler ve izledim işaretler', () => {
    const w = loadApp({
        seriesData: [
            { id: 1, name: 'Biten Dizi', platform: 'Netflix', categories: [1], seasons: [{ season: 1, totalEpisodes: 2, watchedEpisodes: 2 }], createdAt: '2024-01-01T00:00:00Z' },
            { id: 2, name: 'Devam Eden', platform: 'Netflix', categories: [1], runtime: 50, seasons: [{ season: 1, totalEpisodes: 10, watchedEpisodes: 3 }], createdAt: '2024-01-01T00:00:00Z' },
            { id: 3, name: 'Bırakılan', platform: 'Max', userStatus: 'dropped', categories: [], seasons: [{ season: 1, totalEpisodes: 10, watchedEpisodes: 1 }], createdAt: '2024-01-01T00:00:00Z' }
        ],
        moviesData: [
            { id: 10, name: 'İzlenmemiş Film', platform: 'Max', watched: false, runtime: 130, categories: [], createdAt: '2024-01-01T00:00:00Z' },
            { id: 11, name: 'İzlenmiş Film', platform: 'Max', watched: true, categories: [], createdAt: '2024-01-01T00:00:00Z' }
        ]
    });
    const doc = w.document;
    doc.getElementById('pickForMeBtn').click();
    assert.ok(doc.getElementById('pickModal').classList.contains('active'));

    const names = () => JSON.parse(JSON.stringify(w.pickCandidates().map(e => e.item.name).sort()));
    assert.deepEqual(names(), ['Devam Eden', 'İzlenmemiş Film'], 'biten, bırakılan ve izlenmiş olanlar aday değil');

    doc.getElementById('pickKind').value = 'series';
    assert.deepEqual(names(), ['Devam Eden']);

    doc.getElementById('pickKind').value = 'all';
    doc.getElementById('pickDuration').value = 'long';
    assert.deepEqual(names(), ['İzlenmemiş Film'], '120 dk üstü sadece film');

    doc.getElementById('pickDuration').value = '';
    doc.getElementById('pickPlatform').value = 'Netflix';
    assert.deepEqual(names(), ['Devam Eden']);

    // Sonuç kartından "bu bölümü izledim"
    doc.getElementById('pickRollBtn').click();
    const watchBtn = doc.querySelector('#pickResult [data-pick-watch]');
    assert.ok(watchBtn, 'izledim düğmesi olmalı');
    watchBtn.click();
    assert.equal(w.eval('seriesData.find(s => s.id === 2).seasons[0].watchedEpisodes'), 4);
    const log = JSON.parse(w.localStorage.getItem('watchLog'));
    assert.equal(log.length, 1);
    assert.equal(log[0].m, 50, 'günlüğe bölüm süresi yazılır');
    w.close();
});

test('takvim: çıkışlar doğru güne düşer ve .ics geçerli üretilir', () => {
    const w = loadApp({
        seriesData: [{ id: 1, name: 'Dizi; Virgüllü, Ad', platform: 'Netflix', categories: [], seasons: [
            { season: 1, totalEpisodes: 8, watchedEpisodes: 0, releaseDate: '2026-03-05' },
            { season: 2, totalEpisodes: 8, watchedEpisodes: 0, releaseDate: '2026-03-20' }
        ], createdAt: '2024-01-01T00:00:00Z' }],
        moviesData: [{ id: 2, name: 'Mart Filmi', releaseDate: '2026-03-20', createdAt: '2024-01-01T00:00:00Z' }]
    });
    const doc = w.document;
    doc.getElementById('upcomingTab').click();
    doc.getElementById('upcomingViewCalendar').click();
    assert.ok(!doc.getElementById('upcomingCalendar').classList.contains('hidden'));
    assert.ok(doc.getElementById('upcomingList').classList.contains('view-hidden'), 'takvimde liste gizlenir');

    w.eval('calendarMonth = new Date(2026, 2, 1); renderCalendar();');
    assert.equal(doc.getElementById('calendarTitle').textContent, 'Mart 2026');
    const cells = Array.from(doc.querySelectorAll('.calendar-cell:not(.is-empty)'));
    assert.equal(cells.length, 31);
    // 1 Mart 2026 pazar: önünde 6 boş hücre olmalı
    assert.equal(doc.querySelectorAll('.calendar-cell.is-empty').length, 6);
    const day5 = cells[4].textContent.replace(/\s+/g, ' ');
    assert.ok(day5.includes('Dizi; Virgüllü, Ad') && day5.includes('Sezon 1'));
    const day20 = cells[19].querySelectorAll('.calendar-chip');
    assert.equal(day20.length, 2, '20 Mart\'ta hem sezon hem film var');

    const ics = w.buildIcs(JSON.parse(JSON.stringify(w.getDatedReleases())));
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.trimEnd().endsWith('END:VCALENDAR'));
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20260305'));
    assert.ok(ics.includes('DTEND;VALUE=DATE:20260306'), 'tüm gün etkinliği ertesi gün biter');
    assert.ok(ics.includes('SUMMARY:Dizi\; Virgüllü\\, Ad — Sezon 1'), 'noktalı virgül ve virgül kaçışlanır');
    assert.ok(!/[^\r]\n/.test(ics), 'satırlar CRLF ile biter');
    w.close();
});

test('sezonu bitir / geri al: toplu işaretleme ve tek tıkla geri alma', () => {
    const w = loadApp({
        seriesData: [{ id: 1, name: 'Dizi', platform: 'Netflix', categories: [], runtime: 40, seasons: [
            { season: 1, totalEpisodes: 6, watchedEpisodes: 2 },
            { season: 2, totalEpisodes: 4, watchedEpisodes: 0 }
        ], createdAt: '2024-01-01T00:00:00Z' }]
    });
    const doc = w.document;
    const watched = () => JSON.parse(JSON.stringify(w.eval('seriesData[0].seasons.map(s => s.watchedEpisodes)')));

    // Sıradaki bölüm satırındaki "Sezonu bitir" 1. sezonu tamamlar
    doc.querySelector('.next-episode .complete-season').click();
    assert.deepEqual(watched(), [6, 0]);
    const log = JSON.parse(w.localStorage.getItem('watchLog'));
    assert.equal(log[0].n, 4, 'günlüğe 4 bölüm yazılır');
    assert.equal(log[0].m, 160, '4 x 40 dk');

    // Toast üzerindeki "Geri Al" eski haline döndürür
    const undo = Array.from(doc.querySelectorAll('#toastContainer button')).find(b => b.textContent === 'Geri Al');
    assert.ok(undo, 'geri al düğmesi olmalı');
    undo.click();
    assert.deepEqual(watched(), [2, 0]);

    // Sıradaki satırındaki geri alma düğmesi son bölümü düşer
    doc.querySelector('.next-episode .undo-episode').click();
    assert.deepEqual(watched(), [1, 0]);

    // Sezon panelindeki "sıfırla"
    doc.querySelector('.season-item .reset-season').click();
    assert.deepEqual(watched(), [0, 0]);
    assert.equal(w.eval('seriesData[0].seasons[0].lastWatchedAt'), null);
    w.close();
});

test('platform filtresi: seçenekler veriden üretilir ve liste süzülür', () => {
    const w = loadApp({
        seriesData: [
            { id: 1, name: 'Netflix Dizi', platform: 'Netflix', categories: [], seasons: [{ season: 1, totalEpisodes: 2, watchedEpisodes: 0 }], createdAt: '2024-01-01T00:00:00Z' },
            { id: 2, name: 'Max Dizi', platform: 'Max', categories: [], seasons: [{ season: 1, totalEpisodes: 2, watchedEpisodes: 0 }], createdAt: '2024-01-01T00:00:00Z' }
        ],
        moviesData: [
            { id: 3, name: 'Netflix Film', platform: 'Netflix', categories: [], createdAt: '2024-01-01T00:00:00Z' },
            { id: 4, name: 'Platformsuz Film', categories: [], createdAt: '2024-01-01T00:00:00Z' }
        ]
    });
    const doc = w.document;
    const seriesSelect = doc.getElementById('seriesPlatformFilter');
    assert.deepEqual(
        JSON.parse(JSON.stringify(Array.from(seriesSelect.options).map(o => o.textContent))),
        ['Tümü (2)', 'Max (1)', 'Netflix (1)']
    );
    const movieSelect = doc.getElementById('moviesPlatformFilter');
    assert.ok(Array.from(movieSelect.options).some(o => o.textContent === 'Diğer (1)'), 'platformsuz film "Diğer" sayılır');

    seriesSelect.value = 'Netflix';
    seriesSelect.dispatchEvent(new w.Event('change'));
    const shown = () => JSON.parse(JSON.stringify(Array.from(doc.querySelectorAll('#seriesList .card-title')).map(e => e.textContent.trim())));
    assert.deepEqual(shown(), ['Netflix Dizi']);
    assert.equal(w.localStorage.getItem('seriesPlatformFilter'), 'Netflix');

    // Son Netflix dizisi silinince filtre kendini temizler
    w.eval("removeSeries(1)");
    assert.equal(doc.getElementById('seriesPlatformFilter').value, '');
    assert.equal(shown().length, 1);
    w.close();
});

test('yıllık özet: günlükten sayar, eski kayıtları iki kez saymaz', () => {
    const w = loadApp({
        categoriesData: [{ id: 1, name: 'Gerilim', color: '#ff0000' }, { id: 2, name: 'Komedi', color: '#00ff00' }],
        seriesData: [
            // Günlüğü olan dizi: yalnızca günlükteki bölümler sayılır
            { id: 1, name: 'Günlüklü Dizi', platform: 'Netflix', categories: [1], runtime: 50,
              seasons: [{ season: 1, totalEpisodes: 10, watchedEpisodes: 10, lastWatchedAt: '2026-02-01T00:00:00Z' }],
              lastWatchedAt: '2026-02-01T00:00:00Z', createdAt: '2024-01-01T00:00:00Z' },
            // Günlük öncesi dizi: son izleme tarihine göre sayılır
            { id: 2, name: 'Eski Dizi', platform: 'Max', categories: [1, 2], myRating: 9,
              seasons: [{ season: 1, totalEpisodes: 4, watchedEpisodes: 4, lastWatchedAt: '2026-05-01T00:00:00Z' }],
              lastWatchedAt: '2026-05-01T00:00:00Z', createdAt: '2024-01-01T00:00:00Z' },
            // Başka yıl: sayılmaz
            { id: 3, name: 'Geçen Yıl', platform: 'Max', categories: [],
              seasons: [{ season: 1, totalEpisodes: 3, watchedEpisodes: 3, lastWatchedAt: '2025-05-01T00:00:00Z' }],
              lastWatchedAt: '2025-05-01T00:00:00Z', createdAt: '2024-01-01T00:00:00Z' }
        ],
        moviesData: [{ id: 10, name: 'Eski Film', platform: 'Netflix', watched: true, runtime: 120, categories: [2],
            lastWatchedAt: '2026-06-01T00:00:00Z', createdAt: '2024-01-01T00:00:00Z' }],
        watchLog: [
            { t: '2026-02-01T10:00:00Z', k: 'series', id: 1, n: 3, m: 150 },
            { t: '2025-12-01T10:00:00Z', k: 'series', id: 1, n: 2, m: 100 }
        ]
    });

    const s2026 = JSON.parse(JSON.stringify(w.buildYearSummary(2026)));
    assert.equal(s2026.episodes, 3 + 4, 'günlükteki 3 bölüm + günlüksüz dizinin 4 bölümü');
    assert.equal(s2026.movies, 1);
    assert.equal(s2026.minutes, 150 + 4 * 45 + 120, 'süresi bilinmeyen dizi bölüm başına 45 dk sayılır');
    assert.equal(s2026.titles, 3);
    assert.equal(s2026.estimated, 2, 'günlük öncesi iki kayıt tahmini');
    assert.equal(s2026.categories[0].name, 'Gerilim');
    assert.equal(s2026.topRated[0].item.name, 'Eski Dizi');

    const s2025 = JSON.parse(JSON.stringify(w.buildYearSummary(2025)));
    assert.equal(s2025.episodes, 2 + 3, 'günlükteki 2 bölüm + o yıl izlenen dizi');

    const doc = w.document;
    doc.getElementById('statsTab').click();
    assert.ok(doc.getElementById('yearSummaryBody').textContent.includes('İzlenen bölüm'));
    const years = JSON.parse(JSON.stringify(Array.from(doc.getElementById('yearSummarySelect').options).map(o => o.value)));
    assert.ok(years.includes('2026') && years.includes('2025'));
    w.close();
});

test('bakım: yinelenenleri birleştirir, kopuk bağları temizler, kopya alır', () => {
    const w = loadApp({
        categoriesData: [{ id: 1, name: 'Dram', color: '#111111' }],
        tagsData: [{ id: 5, name: 'Kullanılmayan' }],
        seriesData: [
            { id: 1, name: 'Aynı Dizi', platform: 'Diğer', categories: [1], tags: ['Gizem'], imageUrl: 'https://img/a.jpg',
              seasons: [{ season: 1, totalEpisodes: 8, watchedEpisodes: 5 }], createdAt: '2024-01-01T00:00:00Z' },
            { id: 2, name: 'aynı dizi', platform: 'Netflix', categories: [99], tags: [], description: 'Açıklama', myRating: 8,
              seasons: [{ season: 1, totalEpisodes: 8, watchedEpisodes: 2 }, { season: 2, totalEpisodes: 6, watchedEpisodes: 6 }], createdAt: '2024-02-01T00:00:00Z' },
            { id: 3, name: 'Sayısız Sezon', platform: 'Max', categories: [], tags: [],
              seasons: [{ season: 1, totalEpisodes: 0, watchedEpisodes: 9 }], createdAt: '2024-01-01T00:00:00Z' }
        ],
        moviesData: []
    });
    const doc = w.document;
    doc.getElementById('openMaintenance').click();
    const titles = () => JSON.parse(JSON.stringify(Array.from(doc.querySelectorAll('.maintenance-issue-title')).map(e => e.textContent.trim())));
    assert.ok(titles().some(t => t.includes('yinelenen kayıt')));
    assert.ok(titles().some(t => t.includes('silinmiş kategori')));
    assert.ok(titles().some(t => t.includes('etiket listede yok')));
    assert.ok(titles().some(t => t.includes('kullanılmayan etiket')));
    assert.ok(titles().some(t => t.includes('bölüm sayısı eksik')));

    const fixByText = text => {
        const row = Array.from(doc.querySelectorAll('.maintenance-issue'))
            .find(el => el.querySelector('.maintenance-issue-title').textContent.includes(text));
        assert.ok(row, 'sorun bulunamadı: ' + text);
        row.querySelector('[data-issue-fix]').click();
    };

    fixByText('yinelenen kayıt');
    const series = JSON.parse(JSON.stringify(w.eval('seriesData')));
    assert.equal(series.length, 2, 'yinelenen kayıt silindi');
    // Daha çok alanı dolu olan (açıklama + puan) kayıt korunur
    const merged = series.find(s => s.id === 2);
    assert.ok(merged, 'daha dolu olan kayıt korunur');
    assert.equal(merged.platform, 'Netflix');
    assert.equal(merged.imageUrl, 'https://img/a.jpg', 'eksik poster diğerinden alınır');
    assert.deepEqual(JSON.parse(JSON.stringify(merged.tags)), ['Gizem'], 'etiketler birleşir');
    assert.equal(merged.seasons.length, 2);
    assert.equal(merged.seasons[0].watchedEpisodes, 5, 'izleme ilerlemesinde yüksek olan kalır');
    assert.deepEqual(JSON.parse(JSON.stringify(merged.categories)), [99, 1]);

    fixByText('silinmiş kategori');
    assert.deepEqual(JSON.parse(JSON.stringify(w.eval('seriesData.find(s => s.id === 2).categories'))), [1]);

    fixByText('bölüm sayısı eksik');
    assert.equal(w.eval('seriesData.find(s => s.id === 3).seasons[0].totalEpisodes'), 9);

    fixByText('etiket listede yok');
    assert.ok(JSON.parse(JSON.stringify(w.eval('tagsData'))).some(t => t.name === 'Gizem'));

    // Her düzeltmeden önce kopya alındı, geçmişten geri yüklenebilir
    const snapshots = JSON.parse(w.localStorage.getItem('dataSnapshots'));
    assert.ok(snapshots.length >= 4 && snapshots.length <= 5, 'en çok 5 kopya saklanır');
    assert.ok(doc.querySelector('[data-snapshot-restore]'));
    const oldest = snapshots[0];
    assert.equal(oldest.counts.series, 3);

    w.eval(`applySnapshot(${JSON.stringify(snapshots[0])})`);
    assert.equal(w.eval('seriesData.length'), 3, 'kopyadan geri yükleme eski hali getirir');

    // Sorun kalmayınca olumlu mesaj
    w.eval("seriesData = []; moviesData = []; tagsData = []; renderMaintenance();");
    assert.ok(doc.querySelector('.maintenance-ok'));
    w.close();
});

test('yedek hatırlatması: hiç yedek yoksa uyarır, yedek alınınca kaybolur', () => {
    const w = loadApp({ moviesData: [{ id: 1, name: 'Film', createdAt: '2024-01-01T00:00:00Z' }] });
    const doc = w.document;
    const banner = doc.getElementById('backupBanner');
    assert.ok(!banner.classList.contains('hidden'), 'hiç yedek alınmamışken uyarı görünür');
    assert.ok(banner.textContent.includes('henüz hiç yedek almadın'));

    // Erteleme uyarıyı gizler
    banner.querySelector('[data-backup-snooze]').click();
    assert.ok(banner.classList.contains('hidden'));

    // Eski bir yedek tarihi tekrar uyarı çıkarır
    w.localStorage.removeItem('backupReminderSnoozedAt');
    w.localStorage.setItem('lastBackupAt', new Date(Date.now() - 45 * 86400000).toISOString());
    w.eval('renderBackupReminder()');
    assert.ok(doc.getElementById('backupBanner').textContent.includes('45 gün geçti'));

    // Yedek alınınca uyarı kalkar
    w.eval('markBackupTaken()');
    assert.ok(doc.getElementById('backupBanner').classList.contains('hidden'));
    assert.equal(JSON.parse(JSON.stringify(w.eval('backupStatus().state'))), 'ok');
    w.close();
});

test('tekrar izleme: diziyi baştan başlatır, filmi tekrar işaretler, günlüğü bozmaz', () => {
    const w = loadApp({
        seriesData: [{ id: 1, name: 'Bitmiş Dizi', platform: 'Netflix', categories: [], runtime: 50,
            seasons: [{ season: 1, totalEpisodes: 4, watchedEpisodes: 4, lastWatchedAt: '2026-01-01T00:00:00Z' }],
            createdAt: '2024-01-01T00:00:00Z' }],
        moviesData: [{ id: 2, name: 'İzlenmiş Film', watched: true, runtime: 100, categories: [],
            lastWatchedAt: '2026-01-01T00:00:00Z', createdAt: '2024-01-01T00:00:00Z' }]
    });
    const doc = w.document;

    doc.querySelector('.series-card .start-rewatch').click();
    assert.equal(w.eval('seriesData[0].rewatchCount'), 1);
    assert.equal(w.eval('seriesData[0].seasons[0].watchedEpisodes'), 0, 'ilerleme sıfırlanır');
    assert.equal(w.localStorage.getItem('watchLog'), null, 'baştan izleme günlüğe eksi bölüm yazmaz');
    assert.ok(doc.querySelector('.series-card .rewatch-badge'), 'kartta tekrar rozeti görünür');

    // Bildirimden geri alma eski ilerlemeyi getirir
    Array.from(doc.querySelectorAll('#toastContainer button')).find(b => b.textContent === 'Geri Al').click();
    assert.equal(w.eval('seriesData[0].seasons[0].watchedEpisodes'), 4);
    assert.equal(w.eval('seriesData[0].rewatchCount'), 0);

    doc.querySelector('.movie-card .movie-rewatch').click();
    assert.equal(w.eval('moviesData[0].rewatchCount'), 1);
    const log = JSON.parse(w.localStorage.getItem('watchLog'));
    assert.deepEqual([log.length, log[0].k, log[0].n, log[0].m], [1, 'movie', 1, 100]);
    w.close();
});

test('arama filtreleri: y:, platform:, etiket:, puan:>, durum:', () => {
    const w = loadApp({
        categoriesData: [{ id: 1, name: 'Dram', color: '#111111' }],
        seriesData: [
            { id: 1, name: 'Eski Dizi', platform: 'Netflix', categories: [1], tags: ['Gizem'], imdbRating: 9,
              releaseDate: '2008-05-01', seasons: [{ season: 1, totalEpisodes: 4, watchedEpisodes: 2 }], createdAt: '2024-01-01T00:00:00Z' },
            { id: 2, name: 'Yeni Dizi', platform: 'Max', categories: [], tags: [], imdbRating: 6,
              releaseDate: '2024-05-01', seasons: [{ season: 1, totalEpisodes: 4, watchedEpisodes: 4 }], createdAt: '2024-01-01T00:00:00Z' }
        ],
        moviesData: []
    });
    const doc = w.document;
    const search = doc.getElementById('searchSeries');
    const shown = () => JSON.parse(JSON.stringify(Array.from(doc.querySelectorAll('#seriesList .card-title')).map(e => e.textContent.trim())));
    const find = q => { search.value = q; search.dispatchEvent(new w.Event('input')); return shown(); };

    assert.deepEqual(find('y:2008'), ['Eski Dizi (2008)']);
    assert.deepEqual(find('y:2000-2010'), ['Eski Dizi (2008)']);
    assert.deepEqual(find('platform:netflix'), ['Eski Dizi (2008)']);
    assert.deepEqual(find('etiket:gizem'), ['Eski Dizi (2008)']);
    assert.deepEqual(find('kategori:dram'), ['Eski Dizi (2008)']);
    assert.deepEqual(find('puan:>8'), ['Eski Dizi (2008)']);
    assert.deepEqual(find('durum:tamamlandı'), ['Yeni Dizi (2024)']);
    assert.deepEqual(find('durum:izleniyor'), ['Eski Dizi (2008)']);
    assert.deepEqual(find('dizi puan:<7'), ['Yeni Dizi (2024)'], 'serbest metin ve filtre birlikte çalışır');
    assert.equal(find('y:1999').length, 0);
    // Tanınmayan anahtar düz metin sayılır, uygulamayı kırmaz
    assert.equal(find('saat:12').length, 0);

    const parsed = JSON.parse(JSON.stringify(w.parseSearchQuery('etiket:"bilim kurgu" dark y:2020')));
    assert.equal(parsed.text, 'dark');
    assert.deepEqual(parsed.filters, [{ key: 'tag', op: '', value: 'bilim kurgu' }, { key: 'year', op: '', value: '2020' }]);
    w.close();
});

test('sabitleme: sabitlenen kayıt sıralamadan bağımsız üstte kalır', () => {
    const w = loadApp({
        moviesData: [
            { id: 1, name: 'Alfa', watched: false, categories: [], createdAt: '2024-03-01T00:00:00Z' },
            { id: 2, name: 'Zeta', watched: false, categories: [], createdAt: '2024-01-01T00:00:00Z' }
        ]
    });
    const doc = w.document;
    const sort = doc.getElementById('moviesSortSelect');
    sort.value = 'alphabetical';
    sort.dispatchEvent(new w.Event('change'));
    const shown = () => JSON.parse(JSON.stringify(Array.from(doc.querySelectorAll('#moviesList .card-title')).map(e => e.textContent.trim())));
    assert.deepEqual(shown(), ['Alfa', 'Zeta']);

    const zetaCard = Array.from(doc.querySelectorAll('.movie-card')).find(c => c.textContent.includes('Zeta'));
    zetaCard.querySelector('.pin-icon').click();
    assert.deepEqual(shown(), ['Zeta', 'Alfa'], 'A-Z sıralamasında bile sabitlenen üstte');
    assert.equal(w.eval('moviesData.find(m => m.id === 2).pinned'), true);
    assert.ok(Array.from(doc.querySelectorAll('.movie-card')).find(c => c.textContent.includes('Zeta')).classList.contains('is-pinned'));

    // Tekrar basınca sabitleme kalkar
    Array.from(doc.querySelectorAll('.movie-card')).find(c => c.textContent.includes('Zeta')).querySelector('.pin-icon').click();
    assert.deepEqual(shown(), ['Alfa', 'Zeta']);
    w.close();
});

test('nerede izlenir: TMDB sağlayıcıları ayrıştırılır ve kartta gösterilir', async () => {
    const w = loadApp({ moviesData: [{ id: 1, name: 'Film', categories: [], tmdbId: 55, createdAt: '2024-01-01T00:00:00Z' }] });
    w.localStorage.setItem('tmdbKey', 'test');
    w.fetch = async url => {
        const u = new URL(url);
        if (!u.pathname.includes('/movie/55')) return { ok: true, status: 200, json: async () => ({ results: [] }) };
        return { ok: true, status: 200, json: async () => ({
            id: 55, title: 'Film', overview: 'Açıklama', runtime: 120, release_date: '2020-01-01',
            'watch/providers': { results: { TR: {
                flatrate: [{ provider_name: 'Netflix', display_priority: 2 }, { provider_name: 'BluTV', display_priority: 1 }],
                ads: [{ provider_name: 'Tabii', display_priority: 5 }],
                rent: [{ provider_name: 'Apple TV', display_priority: 1 }],
                buy: [{ provider_name: 'Google Play Movies', display_priority: 1 }]
            }, US: { flatrate: [{ provider_name: 'Hulu' }] } } }
        }) };
    };

    const info = JSON.parse(JSON.stringify(await w.fetchTitleDetails('movie', { source: 'tmdb', id: 55, title: 'Film' })));
    assert.deepEqual(info.providers.flatrate, ['BluTV', 'Netflix', 'Tabii'], 'öncelik sırasına göre, abonelik ve reklamlı birlikte');
    assert.deepEqual(info.providers.rent, ['Apple TV+']);
    assert.deepEqual(info.providers.buy, ['Google Play Movies']);
    assert.equal(info.platform, 'BluTV', 'tek platform alanı en öncelikli olandan gelir');

    // Toplu doldurma kayda yazar ve kart gösterir
    const result = JSON.parse(JSON.stringify(await w.fillItem('movie', w.eval('moviesData[0]'), {})));
    assert.ok(result.filled.includes('nerede izlenir'));
    w.eval('refreshAll()');
    const row = w.document.querySelector('.movie-card .providers-row');
    assert.ok(row, 'kartta sağlayıcı satırı olmalı');
    const text = row.textContent.replace(/\s+/g, ' ');
    assert.ok(text.includes('Abonelikte') && text.includes('Netflix') && text.includes('Kiralık') && text.includes('Apple TV+'));
    assert.ok(!text.includes('Hulu'), 'başka ülkenin sağlayıcıları gelmez');

    // Arama filtresi sağlayıcı adlarını da görür
    const search = w.document.getElementById('searchMovies');
    search.value = 'platform:blutv';
    search.dispatchEvent(new w.Event('input'));
    assert.equal(w.document.querySelectorAll('#moviesList .movie-card').length, 1);
    w.close();
});

test('takvim aboneliği: gist\'e yazar, sabit adres verir, yayından kaldırır', async () => {
    const w = loadApp({
        seriesData: [{ id: 1, name: 'Dizi', platform: 'Netflix', categories: [],
            seasons: [{ season: 1, totalEpisodes: 4, watchedEpisodes: 0, releaseDate: '2030-04-01' }], createdAt: '2024-01-01T00:00:00Z' }]
    });
    w.localStorage.setItem('gistToken', 'test-token');
    w.localStorage.setItem('gistId', 'abc123');
    const calls = [];
    w.fetch = async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
        return { ok: true, status: 200, json: async () => ({ id: 'abc123', owner: { login: 'nurhat' }, files: {} }) };
    };

    const result = JSON.parse(JSON.stringify(await w.publishCalendarToGist()));
    assert.equal(result.count, 1);
    assert.equal(result.url, 'https://gist.githubusercontent.com/nurhat/abc123/raw/izleme-takip-takvim.ics');
    assert.equal(w.localStorage.getItem('calendarIcsUrl'), result.url);
    assert.equal(calls[0].method, 'PATCH');
    const written = calls[0].body.files['izleme-takip-takvim.ics'].content;
    assert.ok(written.includes('DTSTART;VALUE=DATE:20300401') && written.includes('SUMMARY:Dizi — Sezon 1'));
    assert.ok(!written.includes('myRating') && !written.includes('watchLog'), 'kişisel veriler takvime yazılmaz');

    // Değişiklik yoksa otomatik tazeleme istek atmaz
    w.localStorage.setItem('calendarAutoPublish', '1');
    calls.length = 0;
    await w.refreshPublishedCalendar();
    assert.equal(calls.length, 0, 'içerik aynıysa tekrar yazılmaz');

    // Tarih değişince yazar
    w.eval("seriesData[0].seasons[0].releaseDate = '2030-05-05';");
    await w.refreshPublishedCalendar();
    assert.equal(calls.length, 1);
    assert.ok(calls[0].body.files['izleme-takip-takvim.ics'].content.includes('20300505'));

    // Yayından kaldırma dosyayı siler ve adresi unutur
    calls.length = 0;
    await w.unpublishCalendar();
    assert.equal(calls[0].body.files['izleme-takip-takvim.ics'], null);
    assert.equal(w.localStorage.getItem('calendarIcsUrl'), null);
    w.close();
});

test('sezon grupları: 3 üstü sezonlar gruplanır, sıradaki grup açık gelir', () => {
    const seasons = n => Array.from({ length: n }, (_, k) => ({ season: k + 1, totalEpisodes: 10, watchedEpisodes: k < 5 ? 10 : k === 5 ? 3 : 0 }));
    const w = loadApp({
        seriesData: [
            { id: 1, name: 'Uzun Dizi', platform: 'Netflix', categories: [], seasons: seasons(14), createdAt: '2024-01-01T00:00:00Z' },
            { id: 2, name: 'Kısa Dizi', platform: 'Netflix', categories: [], seasons: seasons(3), createdAt: '2024-01-01T00:00:00Z' }
        ]
    });
    const doc = w.document;
    const card = name => Array.from(doc.querySelectorAll('.series-card')).find(c => c.textContent.includes(name));

    assert.equal(card('Kısa Dizi').querySelectorAll('.season-group').length, 0, '3 sezonda gruplama yok');

    const groups = card('Uzun Dizi').querySelectorAll('.season-group');
    assert.equal(groups.length, 3, '14 sezon 5\'erli 3 gruba bölünür');
    const titles = JSON.parse(JSON.stringify(Array.from(groups).map(g => g.querySelector('.season-group-title').textContent)));
    assert.deepEqual(titles, ['Sezon 1-5', 'Sezon 6-10', 'Sezon 11-14']);

    // Sıradaki bölüm 6. sezonda: o grup açık, diğerleri kapalı
    assert.ok(!groups[0].classList.contains('is-open'));
    assert.ok(groups[1].classList.contains('is-open'), 'sıradaki bölümün grubu açık gelir');
    assert.equal(groups[1].querySelectorAll('.season-item').length, 5);

    // Grup başlığı toplu ilerlemeyi gösterir
    assert.ok(groups[0].querySelector('.season-group-count').textContent.includes('50/50'));
    assert.ok(groups[1].querySelector('.season-group-count').textContent.includes('3/50'));
    const pips = groups[0].querySelectorAll('.season-pip');
    assert.equal(pips.length, 5);
    assert.ok(pips[0].classList.contains('completed'));
    assert.ok(groups[1].querySelectorAll('.season-pip')[0].classList.contains('watching'));

    // Başlığa tıklayınca kapanır ve yeniden çizimde kapalı kalır
    groups[1].querySelector('.season-group-header').click();
    assert.ok(!card('Uzun Dizi').querySelectorAll('.season-group')[1].classList.contains('is-open'));
    w.eval('filterSeries()');
    assert.ok(!card('Uzun Dizi').querySelectorAll('.season-group')[1].classList.contains('is-open'), 'seçim yeniden çizimde korunur');

    // Göstergeye tıklayınca grubu ve o sezonu açar
    card('Uzun Dizi').querySelectorAll('.season-group')[2].querySelectorAll('.season-pip')[1].click();
    const reopened = card('Uzun Dizi').querySelectorAll('.season-group')[2];
    assert.ok(reopened.classList.contains('is-open'));
    assert.ok(reopened.querySelectorAll('.season-item')[1].querySelector('.season-content').classList.contains('show'));
    w.close();
});

test('görünüm: renk teması ve açık/koyu seçimi saklanır', () => {
    const w = loadApp({});
    const doc = w.document;
    assert.equal(doc.body.getAttribute('data-accent'), 'mor', 'varsayılan tema mor');

    doc.getElementById('openAppearance').click();
    const options = doc.querySelectorAll('#accentOptions [data-accent-id]');
    assert.equal(options.length, 6);
    assert.ok(doc.querySelector('[data-accent-id="mor"]').classList.contains('active'));

    doc.querySelector('[data-accent-id="orman"]').click();
    assert.equal(doc.body.getAttribute('data-accent'), 'orman');
    assert.equal(doc.documentElement.getAttribute('data-accent-boot'), 'orman', 'açılışta renk sıçraması olmasın diye html\'e de yazılır');
    assert.equal(w.localStorage.getItem('accent'), 'orman');
    assert.ok(doc.querySelector('[data-accent-id="orman"]').classList.contains('active'));

    // Koyu tema düğmesi hem gövdeyi hem Tailwind sınıfını günceller
    doc.querySelector('.mode-option[data-mode="dark"]').click();
    assert.ok(doc.body.classList.contains('dark-theme'));
    assert.ok(doc.documentElement.classList.contains('dark'));
    assert.equal(w.localStorage.getItem('theme'), 'dark');
    assert.equal(doc.querySelector('#themeToggle i').className, 'fas fa-sun');
    assert.equal(doc.body.getAttribute('data-accent'), 'orman', 'tema değişince renk seçimi korunur');

    // Başlıktaki düğme ile geri dön
    doc.getElementById('themeToggle').click();
    assert.ok(!doc.body.classList.contains('dark-theme'));
    assert.ok(!doc.documentElement.classList.contains('dark'));

    // Bilinmeyen değer varsayılana düşer
    w.localStorage.setItem('accent', 'uydurma');
    assert.equal(JSON.parse(JSON.stringify(w.currentAccent())), 'mor');
    w.close();
});
