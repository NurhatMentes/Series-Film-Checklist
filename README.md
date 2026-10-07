# 🎬 İzleme Takip Uygulaması

Dizilerinizi ve filmlerinizi kolayca takip edebileceğiniz modern, kullanıcı dostu bir web uygulaması. Adını yazmanız yeterli: poster, açıklama, fragman, sezonlar ve daha fazlası internetten otomatik gelir. Verileriniz tarayıcınızda kalır; isterseniz cihazlarınız arasında otomatik senkronize edilir.

**Canlı sürüm:** https://nurhatmentes.github.io/Series-Film-Checklist/

<img width="732" height="901" alt="image" src="https://github.com/user-attachments/assets/66d9bd6a-389d-4780-a6a0-1b1a156e9b44" />
<img width="970" height="689" alt="image" src="https://github.com/user-attachments/assets/b0ad58e0-dd0d-44ab-87c1-30bf02219310" />
<img width="929" height="737" alt="image" src="https://github.com/user-attachments/assets/a034289d-5271-4afa-973a-e329d5f5c1f8" />



<img width="1389" height="751" alt="image" src="https://github.com/user-attachments/assets/f7abef3d-21c3-4f9b-b877-35af573e4a82" />



## Özellikler

### ✨ Otomatik Doldurma (TMDB)
- Dizi/film adını yazmaya başlayın, posterli sonuç listesinden doğru olanı seçin
- **Poster, Türkçe açıklama, puan, çıkış tarihi ve YouTube fragmanı** otomatik dolar
- Türler mevcut **kategori ve etiketlerinizle** eşleştirilir (ör. Suç → Polisiye, Türk yapımı → Yerli)
- Diziler için **platform** (Türkiye'deki yayın bilgisine göre) ve **tüm sezonlar + bölüm sayıları** gelir
- **Eksikleri Tamamla:** mevcut kayıtlardaki boş poster, fragman, açıklama, puan ve tarihleri toplu doldurur (dolu alanlara dokunmaz); isteğe bağlı olarak yeni çıkan sezonları ekler
- TMDB anahtarı yokken diziler için sınırlı bir yedek kaynak (TVmaze, İngilizce) kullanılır

### 🔥 Yeni Çıkanlar
- **Yakında Çıkacaklar** sekmesinde, listende olmasa bile önümüzdeki 30 gün içinde çıkacak popüler dizi ve filmler **Bu Hafta / Bu Ay** gruplarıyla gösterilir (TMDB)
- Her posterin üstündeki ▶ düğmesi **fragmanı** TMDB'den bulup açar (bulunan fragman önbelleğe alınır)
- Dönem ve tür filtresi; **Listeme Ekle** ile ekleme formu tüm bilgilerle dolu açılır, istemediklerini gizleyebilirsin
- Poster görselleri cihazda önbelleğe alınır; ağ yavaşken veya çevrimdışıyken de görünür
- **Yedek Al** varsayılan olarak posterleri de yedek dosyasına ekler (küçültülmüş JPEG, "Posterleri ekle" kutusundan kapatılabilir); **Geri Yükle** posterleri yeni cihazın önbelleğine de yazar

### 💡 Öneriler
- Her kartta 💡 butonu: o yapıma **benzer dizi/filmler** (TMDB önerileri)
- **Öneriler** sekmesi: puan verdiğiniz, bitirdiğiniz ve son izlediğiniz yapımlara göre **size özel öneriler**; birden fazla favorinizde ortak çıkanlar üstte, "X'i sevdiğin için" açıklamasıyla
- **Listeme Ekle** ile ekleme formu tüm bilgilerle dolu açılır
- Listenizde olanlar gösterilmez, "İlgilenmiyorum" dedikleriniz bir daha önerilmez

### 📺 Dizi Takibi
- Her dizi tek kartta, sezonlar içinde; sezon ekleme/çıkarma aynı pencereden
- Sezon bazında bölüm ilerlemesi ve dizinin toplam ilerlemesi
- Kartta **"Sıradaki: S2 · B5 → İzledim"** butonu ile tek tıkla bölüm işaretleme
- Durumlar: Planlanıyor, İzleniyor, Tamamlandı ve elle seçilen **Duraklatıldı / Bırakıldı**
- Platform, puan, açıklama, poster, çıkış tarihi, fragman, kategori ve etiketler

### 🎬 Film Takibi
- "İzlendi" işaretleyici, izleme tarihi otomatik kaydedilir
- Puan, açıklama, poster, çıkış tarihi (kartta yıl olarak da görünür), fragman, kategori ve etiketler

### ⭐ Kişisel Bilgiler
- **Benim Puanım** (0-10) ve **Notum** alanları; "Benim Puanım"a göre sıralama

### 🔍 Arama, Filtreleme ve Sıralama
- Ada, açıklamaya, platforma, etikete ve kategoriye göre **Türkçe harf duyarlı** arama
- Duruma ve kategoriye göre filtreleme
- Sıralama: Son İzlenen, En Yeni/En Eski Eklenen, A-Z, Z-A, IMDB puanı, Benim Puanım, Çıkış Tarihi (seçim hatırlanır)

### 📅 Diğer Sekmeler
- **Yakında Çıkacaklar:** yeni sezonlar dahil yaklaşan çıkışlar (bu hafta / bu ay / sonrası)
- **Fragmanlar:** tüm fragmanlar tek yerde; üstüne gelince önizleme, tıklayınca tam ekran
- **Kategoriler / Etiketler:** oluşturma, düzenleme, silme, birleştirme
- **İstatistikler:** izlenen bölüm, tamamlanan dizi, kategori ve platform dağılımı, en sevdikleriniz, son izlenenler

### 🛠️ Kullanım Kolaylıkları
- **Toplu düzenleme:** seçili kayıtlara kategori/etiket ekleme veya kaldırma
- **Silmeyi geri al** bildirimi
- **Klavye kısayolları:** `/` aramaya odaklanır, `n` yeni dizi/film ekler, `Esc` pencereyi kapatır
- **Karanlık/Aydınlık tema**, 1-2-3 sütun, Grid/Masonry yerleşim ve poster oranı (Orijinal, 2:3, 16:9, Kare) seçimi
- **PWA:** telefona uygulama gibi kurulabilir, çevrimdışı açılır

## Kurulum ve İlk Ayarlar

Kurulum gerekmez; [canlı sürümü](https://nurhatmentes.github.io/Series-Film-Checklist/) tarayıcıda açmanız yeterli. Telefonda tarayıcı menüsünden **"Ana ekrana ekle"** ile uygulama gibi kurabilirsiniz.

### 1. Otomatik doldurma için TMDB anahtarı (ücretsiz)
1. [themoviedb.org](https://www.themoviedb.org/signup) üzerinde hesap açın
2. [Ayarlar → API](https://www.themoviedb.org/settings/api) sayfasından kişisel kullanım için anahtar isteyin
3. **Detaylar** sekmesindeki **API Anahtarı**'nı kopyalayın
4. Uygulamada sağ üstteki **⚙** simgesine tıklayın, anahtarı yapıştırın ve **Kaydet ve Test Et**'e basın

Gerçek IMDb puanı için isteğe bağlı olarak [OMDb](https://www.omdbapi.com/apikey.aspx) anahtarı da girebilirsiniz; yoksa TMDB kullanıcı puanı yazılır.

### 2. Cihazlar arası senkronizasyon (isteğe bağlı)
**Otomatik Senkronizasyon (önerilen):** Verileriniz GitHub hesabınızdaki gizli bir gist'te tutulur.
1. Üstteki **Senkronizasyon** butonuna tıklayın
2. Penceredeki bağlantıdan **"gist" izinli** bir GitHub anahtarı oluşturun (süreyi "No expiration" seçebilirsiniz)
3. Anahtarı yapıştırıp **Bağlan**'a basın; diğer cihazlarda da aynı anahtarı girin

Sonrasında her değişiklik birkaç saniye içinde buluta yazılır; uygulama açılınca, sekmeye dönünce ve açık kaldığı sürece 2 dakikada bir güncel hali alınır. İki cihazda yapılan farklı değişiklikler birleştirilir, silinenler her yerden silinir. Bağlıyken butondaki yeşil nokta yanar.

**Alternatif - Doğrudan eşleştirme (QR):** İki cihaz aynı anda açıkken hesapsız, tek seferlik aktarım. Bir cihazda **Kod Üret**, diğerinde **QR Tara**; cevap kodunu ilk cihaza verip **Bağlan**.

## Veri Güvenliği

### Nerede saklanır?
- Tüm veriler **tarayıcınızın yerel depolamasında (localStorage)** saklanır; bir sunucuya gönderilmez
- Otomatik senkronizasyonu açarsanız bir kopyası **kendi GitHub hesabınızdaki gizli gist**'te tutulur
- Uygulama internet bağlantısı olmadan da açılır (otomatik doldurma, öneriler ve senkron için internet gerekir)

### API anahtarları
- TMDB, OMDb ve GitHub anahtarları **sadece o cihazın tarayıcısında** (`tmdbKey`, `omdbKey`, `gistToken`) tutulur
- Repoya, yedek dosyasına, buluttaki gist'e veya diğer cihazlara **gönderilmez**; her cihazda ayrıca girilir
- Şifrelenmiş değildir: aynı tarayıcı profiline erişen biri görebilir. `nurhatmentes.github.io` altındaki diğer GitHub Pages siteleri de aynı depoyu paylaşır
- GitHub anahtarı yalnızca "gist" iznine sahiptir; repolarınıza erişemez. Şüphe halinde anahtarı sağlayıcının sitesinden iptal edip yenisini oluşturun

### Yedekleme
- **Yedek Al** ile tüm verileriniz tarihli bir JSON dosyası olarak indirilir
- **Dosya Yükle** ile geri yüklenir (yüklemeden önce onay istenir, mevcut veriler tarayıcıda ayrıca saklanır)
- Eski sürümün yedekleri de okunur ve yeni formata otomatik dönüştürülür

| Risk | Çözüm |
|------|-------|
| Tarayıcı verileri temizlenirse | Otomatik senkronizasyon veya düzenli yedek |
| Farklı cihazda açılırsa | Otomatik senkronizasyon, QR eşleştirme veya yedek dosyası |
| İnternet kesilirse | Etkilenmez; değişiklikler bağlantı gelince senkronize edilir |

## Geliştirme

### Proje yapısı
```
index.html              Sayfa yapısı
css/styles.css          Stiller (açık/koyu tema değişkenleri dahil)
js/app.js               Uygulama kodu
sw.js                   Service worker (çevrimdışı çalışma)
manifest.webmanifest    PWA bilgileri
icon.svg                Uygulama simgesi
tests/app.test.mjs      jsdom ile uygulama testleri
```

Uygulama kodu için derleme adımı yoktur; Font Awesome ve QR kütüphaneleri CDN'den yüklenir. Tailwind stilleri `css/tailwind.css` olarak önceden derlenmiş gelir; `index.html` veya `js/app.js` içinde yeni bir Tailwind sınıfı kullanırsan `npm run build:css` çalıştırıp çıkan dosyayı da commit'le (CI bunu kontrol eder).

### Yerelde çalıştırma
Service worker ve kamera `file://` altında çalışmadığı için basit bir sunucu kullanın:
```bash
python -m http.server 8000
```
Ardından `http://localhost:8000` adresini açın.

### Testler
```bash
npm install
npm test
```
Testler veri dönüşümü, Türkçe arama, XSS koruması, senkron birleştirme, P2P parçalı aktarım, bulut senkronu ve önerileri kapsar. CI her push'ta testleri ve `htmlhint` kontrolünü çalıştırır.

### Yayınlama
`main` dalına her push'ta GitHub Actions siteyi GitHub Pages'e yayınlar. CSS veya JS değiştiğinde, tarayıcıların eski dosyada takılı kalmaması için `index.html` içindeki iki `?v=` etiketini ve `sw.js` içindeki `CACHE` adını **aynı yeni değere** güncelleyin.

## Sürüm Notları

### v2.0.0
- **Otomatik doldurma** (TMDB/TVmaze) ve mevcut kayıtlar için toplu eksik tamamlama
- **Öneriler**: kart bazında benzerler ve kişisel öneri sekmesi
- **Otomatik bulut senkronizasyonu** (GitHub Gist); QR eşleştirme kısa kodlarla yeniden yazıldı, büyük veri artık parçalı ve sıkıştırılmış gönderiliyor
- Yeni veri modeli: her dizi tek kayıt, sezonlar içinde (eski veriler otomatik dönüştürülür)
- Duraklatıldı/Bırakıldı durumu, sıradaki bölüm butonu, kişisel puan ve not, İstatistikler sekmesi, silmeyi geri alma, klavye kısayolları, PWA
- Kartlarda çıkış yılı, yeniden tasarlanmış başlık çubuğu, uyumlu açık/koyu tema
- Düzeltmeler: dizi adı değiştirme, senkron döngüsü, yedek yükleme, durum filtresi, Türkçe arama, istatistikler, form sıfırlama, poster oranı, YouTube 153 hatası, mobil taşmalar, XSS

### v1.4.0
- Son izlenen dizi ve filmlerin üste taşınması (`lastWatchedAt`), sekmeler arası canlı güncelleme

### v1.3.0
- Çıkış tarihi rozetleri (Yayında, Bugün, 1-7 gün, 8-30 gün, 30+ gün)

### v1.2.0
- IMDB puanı, açıklama ve poster linki alanları
