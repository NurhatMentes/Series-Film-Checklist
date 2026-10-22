# 🎬 İzleme Takip Uygulaması

Dizilerinizi ve filmlerinizi kolayca takip edebileceğiniz modern, kullanıcı dostu bir web uygulaması. Adını yazmanız yeterli: poster, açıklama, fragman, sezonlar ve daha fazlası internetten otomatik gelir. Verileriniz tarayıcınızda kalır; isterseniz cihazlarınız arasında otomatik senkronize edilir.

**Canlı sürüm:** https://nurhatmentes.github.io/Series-Film-Checklist/
<img width="708" height="821" alt="image" src="https://github.com/user-attachments/assets/d6ea50df-6f56-4518-a710-34b6c6a63b96" />
<img width="1063" height="879" alt="image" src="https://github.com/user-attachments/assets/63d6b8ad-0031-43b3-ab61-2e45c33f42c5" />
<img width="1066" height="840" alt="image" src="https://github.com/user-attachments/assets/374bf97f-e90a-400c-8f89-2b2882a1a2bc" />
<img width="1407" height="847" alt="image" src="https://github.com/user-attachments/assets/51c6b4f7-fa95-4c9d-9f2c-f7fe6c522ec0" />


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
- Her önerinin posterindeki ▶ düğmesi **fragmanı** açar
- **Listeme Ekle** ile ekleme formu tüm bilgilerle dolu açılır
- Listenizde olanlar gösterilmez, "İlgilenmiyorum" dedikleriniz bir daha önerilmez

### 📺 Dizi Takibi
- Her dizi tek kartta, sezonlar içinde; sezon ekleme/çıkarma aynı pencereden
- Sezon bazında bölüm ilerlemesi ve dizinin toplam ilerlemesi
- Kartta **"Sıradaki: S2 · B5 → İzledim"** butonu ile tek tıkla bölüm işaretleme; yanında **geri alma** ve **"Sezonu bitir"** (kalan bölümleri birden işaretler, bildirimden geri alınabilir)
- Sezon panelinde ayrıca **"Sezonu sıfırla"**
- **3'ten fazla sezonu olan diziler** sezon gruplarına ayrılır (Sezon 1-5, 6-10…). Grup başlığında toplu ilerleme ve her sezon için doluluğunu gösteren küçük bir sütun vardır; sütuna basmak o sezonu açar. Sıradaki bölümün olduğu grup kendiliğinden açık gelir.
- Durumlar: Planlanıyor, İzleniyor, Tamamlandı ve elle seçilen **Duraklatıldı / Bırakıldı**
- Biten dizilerde **"Baştan izle"**: ilerlemeyi sıfırlar, tekrar izleme sayacını artırır (geri alınabilir)
- Platform, puan, açıklama, poster, çıkış tarihi, fragman, kategori ve etiketler

### 🎬 Film Takibi
- "İzlendi" işaretleyici, izleme tarihi otomatik kaydedilir
- **Platform** alanı (otomatik doldurmada TMDB'nin Türkiye yayın bilgisinden gelir)
- İzlenmiş filmlerde **"Tekrar izledim"** düğmesi
- Puan, açıklama, poster, çıkış tarihi (kartta yıl olarak da görünür), fragman, kategori ve etiketler

### ⭐ Kişisel Bilgiler
- **Benim Puanım** (0-10), **Notum** ve **Tekrar izleme** sayısı; "Benim Puanım"a göre sıralama
- **Sabitleme:** kartın raptiye düğmesiyle istediğin yapımı listenin en üstüne tutturursun (seçili sıralama ne olursa olsun üstte kalır)

### 📡 Nerede İzlenir
- Kartlarda TMDB'nin Türkiye verisine göre **abonelikte / kiralık / satın alma** seçenekleri
- Yayın hakları değiştiği için "Eksikleri Tamamla" bu listeyi her çalıştığında tazeler

### 🎲 Ne izlesem?
- Üst çubuktaki düğme, **bitirmediğin** dizi ve filmler arasından sana bir tane seçer
- Tür (dizi/film), kategori, platform, süre ve "sadece başladıklarım" filtreleri
- Puanı yüksek ve yarıda kalmış yapımlar biraz daha sık çıkar; sonuç kartından bölümü/filmi **izledim** yapabilir veya kartı açabilirsin

### 🔍 Arama, Filtreleme ve Sıralama
- Ada, açıklamaya, platforma, etikete ve kategoriye göre **Türkçe harf duyarlı** arama
- Duruma, kategoriye ve **platforma** göre filtreleme (platform listesi verinden üretilir, seçim hatırlanır)
- **Arama kutusunda filtre:** `y:2008`, `y:2000-2010`, `platform:netflix`, `kategori:dram`, `etiket:"bilim kurgu"`, `puan:>8`, `benim:>7`, `durum:izleniyor`, `tekrar:>0` — serbest metinle birlikte kullanılabilir
- Sıralama: Son İzlenen, En Yeni/En Eski Eklenen, A-Z, Z-A, IMDB puanı, Benim Puanım, Çıkış Tarihi (seçim hatırlanır)

### 📅 Diğer Sekmeler
- **Yakında Çıkacaklar:** yeni sezonlar dahil yaklaşan çıkışlar (bu hafta / bu ay / sonrası), **aylık takvim görünümü** ve çıkış tarihlerini telefon/bilgisayar takvimine aktaran **.ics** dosyası (1 gün önce hatırlatmalı)
- **Takvim aboneliği:** .ics dosyası senkron Gist'ine yazılır, takvim uygulamanın kendi güncellediği sabit bir adres verir (bağlantıyı bilen yapım adlarını ve tarihlerini görebilir; puan, not ve izleme durumu bu dosyaya yazılmaz)
- **Fragmanlar:** tüm fragmanlar tek yerde; üstüne gelince önizleme, tıklayınca tam ekran
- **Kategoriler / Etiketler:** oluşturma, düzenleme, silme, birleştirme
- **İstatistikler:** izlenen bölüm, tamamlanan dizi, kategori ve platform dağılımı, en sevdikleriniz, son izlenenler
- **Yıllık Özet:** seçtiğin yılda izlediğin bölüm/film sayısı, toplam süre, en çok izlediğin türler ve platformlar, o yılın favorileri

### 🛠️ Kullanım Kolaylıkları
- **Toplu düzenleme:** seçili kayıtlara kategori/etiket ekleme veya kaldırma
- **Veri Bakımı:** yinelenen kayıtları birleştirir, eksik bilgileri, silinmiş kategorilere bağlı kayıtları, listede olmayan/kullanılmayan etiketleri ve bölüm sayısı girilmemiş sezonları bulup düzeltir
- **Sürüm geçmişi:** toplu veya geri alınamayan işlemlerden önce verinin kopyası alınır, son 5 kopya "Bakım" penceresinden geri yüklenebilir
- **Yedek hatırlatması:** hiç yedek alınmadıysa veya son yedeğin üzerinden 30 gün geçtiyse uyarı (7 gün ertelenebilir)
- **Silmeyi geri al** bildirimi
- **Klavye kısayolları:** `/` aramaya odaklanır, `n` yeni dizi/film ekler, `Esc` pencereyi kapatır
- **Görünüm:** açık/koyu tema ve 6 renk teması (Mor, Okyanus, Gün Batımı, Orman, Gece Yarısı, Kiraz); başlıktaki palet düğmesinden seçilir, bu tarayıcıda saklanır
- 1-2-3 sütun, Grid/Masonry yerleşim ve poster oranı (Orijinal, 2:3, 16:9, Kare) seçimi
- Uzun açıklamalar kartı taşırmaz: kart içinde kaydırılır (kenardaki gölge devamı olduğunu gösterir)
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
- **Yedek Al** ile tüm verileriniz tarihli bir JSON dosyası olarak indirilir (isteğe bağlı olarak posterler de dosyaya gömülür, izleme günlüğü dahildir)
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

### v2.4.0
- **Sezon grupları:** çok sezonlu dizilerde açılır gruplar, toplu ilerleme ve sezon sütunları
- Yakında Çıkacaklar, Öneriler ve "Ne izlesem?" kartlarında **kaydırılabilir açıklamalar**
- **6 renk teması** ve yeni Görünüm penceresi; arayüzdeki sabit mor tonlar tema değişkenlerine bağlandı

### v2.3.0
- **Tekrar izleme sayacı**; dizilerde "Baştan izle", filmlerde "Tekrar izledim"
- **Arama içinde filtreler** (`y:`, `platform:`, `kategori:`, `etiket:`, `puan:`, `durum:`, `tekrar:`)
- **Sabitleme:** seçili kayıtlar listenin üstünde kalır
- **Nerede izlenir:** TMDB'nin Türkiye verisinden abonelik/kiralık/satın alma listesi
- **Takvim aboneliği:** Gist üzerinden kendi güncellenen .ics adresi

### v2.2.0
- **Ne izlesem?**: bitirmediklerin arasından filtreli, ağırlıklı rastgele öneri
- **Takvim görünümü** ve **.ics dışa aktarma**; **platform filtresi** (filmlere platform alanı eklendi)
- **Yıllık Özet** ve izleme günlüğü (bölüm bazında kayıt; yedek dosyasına dahil)
- **Veri Bakımı**, **sürüm geçmişi** ve **yedek hatırlatması**
- Sezonu bitirme / sıfırlama / son bölümü geri alma düğmeleri
- Kayıtlara süre (runtime) alanı

### v2.1.0
- **Yeni Çıkanlar** bölümü, derlenmiş Tailwind, poster önbelleği ve yedeğe poster gömme
- Öneri ve yeni çıkanlar kartlarından fragman oynatma

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
