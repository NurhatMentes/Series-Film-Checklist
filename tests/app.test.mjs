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
