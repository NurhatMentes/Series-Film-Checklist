// Uygulamayı jsdom içinde yükleyip temel veri mantığını test eder.
// Çalıştırmak için: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    // Dış kaynakları (CDN) testte yükleme
    .replace(/<script src="https?:[^"]*"><\/script>/g, '')
    .replace(/<script src="js\/app.js"><\/script>/, '');
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

test('senkron birleştirme: yeni olan kazanır, silinen geri gelmez, veri geri gönderilmez', () => {
    const w = loadApp({ seriesData: legacySeries });
    let sent = 0;
    w.eval('rtcChannel = { readyState: "open", send() { window.__sent = (window.__sent || 0) + 1; } }');
    const dark = w.eval("seriesData.find(s => s.name === 'Dark')");
    w.removeSeries(dark.id);
    const remoteSeries = JSON.parse(JSON.stringify(w.eval('seriesData'))).concat([{ ...dark }]);
    remoteSeries[0].name = 'Uzak Değişiklik';
    remoteSeries[0].updatedAt = '2030-01-01T00:00:00Z';
    w.__sent = 0;
    w.applyRemoteData({ series: remoteSeries, movies: [], categories: [], tags: [] });
    const names = w.eval('seriesData.map(s => s.name)');
    assert.ok(names.includes('Uzak Değişiklik'));
    assert.ok(!names.includes('Dark'));
    sent = w.__sent;
    assert.equal(sent, 0);
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
