# 🎬 İzleme Takip Uygulaması

Dizilerinizi ve filmlerinizi kolayca takip edebileceğiniz modern, kullanıcı dostu bir web uygulaması. Yerel depolama ile çalışır, verileriniz güvende kalır ve istediğiniz zaman yedek alıp geri yükleyebilirsiniz.

<img width="732" height="901" alt="image" src="https://github.com/user-attachments/assets/66d9bd6a-389d-4780-a6a0-1b1a156e9b44" />
<img width="970" height="689" alt="image" src="https://github.com/user-attachments/assets/b0ad58e0-dd0d-44ab-87c1-30bf02219310" />
<img width="929" height="737" alt="image" src="https://github.com/user-attachments/assets/a034289d-5271-4afa-973a-e329d5f5c1f8" />



<img width="1389" height="751" alt="image" src="https://github.com/user-attachments/assets/f7abef3d-21c3-4f9b-b877-35af573e4a82" />



## Özellikler

### 📺 Dizi Takibi
- Birden fazla sezon ekleyin
- Her sezon için bölüm ilerlemesi takibi
- **Son izlenen diziler** otomatik olarak üst sıraya taşınır
- Platform bilgisi (Netflix, Disney+, Amazon Prime vb.)
- **IMDB puanı ekleme** (1-10 arası)
- **Dizi açıklaması** ve detaylı bilgiler
- **Resim linki** ile görsel zenginleştirme
- **Çıkış tarihi rozeti** - Yayın durumunu görsel olarak takip edin
- YouTube fragman linki entegrasyonu
- Tüm sezonları tek bir kartta görüntüleyin
- Sezon detaylarını aç/kapa ile görüntüleyin

### 🎬 Film Listesi
- İzlenecek filmleri ekleyin
- Film türüne göre sınıflandırın
- **Son izlenen filmler** otomatik olarak üst sıraya taşınır
- **IMDB puanı ekleme** (1-10 arası)
- **Film açıklaması** ve detaylı bilgiler
- **Resim linki** ile görsel zenginleştirme
- **Çıkış tarihi rozeti** - Vizyona giriş durumunu görsel olarak takip edin
- YouTube fragman linki entegrasyonu
- "İzlendi" işaretleyici ile durum takibi
- İzleme tarihini otomatik kaydetme

### 🛠️ Gelişmiş Özellikler
- **Karanlık/Aydınlık tema** - Göz yorgunluğunu azaltmak için
- **Çoklu görünüm modu** - 1, 2 veya 3 sütunlu karo görünümü
- **Gelişmiş filtreleme** - Duruma göre içerik filtreleme
- **Arama ve sıralama** - Hızlı içerik bulma
- **Tamamen offline çalışma** - İnternet bağlantısı gerekmez

### 💾 Veri Yönetimi
- **Yedekleme ve geri yükleme** - JSON dosya formatı
- **Yerel depolama** - Veriler tarayıcıda saklanır
- **Son izleme geçmişi** - `lastWatchedAt` bilgisiyle kalıcı sıralama
- **P2P senkronizasyon** - Eşlenen cihazlarda izleme güncellemeleri anlık yansır
- **Veri kaybı riski yok** - Manuel yedekleme ile güvence
- **Veri aktarımı** - Farklı cihazlara kolayca taşıma

## Kullanım

### 🚀 Başlangıç
1. Uygulamayı tarayıcınızda açın
2. "Yeni Dizi" veya "Yeni Film" butonuna tıklayın
3. Gerekli bilgileri doldurun ve kaydedin
4. İçerikleriniz otomatik olarak listelenir

### 🔧 Dizi Ekleme
- Dizi adı
- Sezon numarası
- Toplam bölüm sayısı
- Platform (isteğe bağlı)
- Çıkış tarihi (isteğe bağlı) - Yayın durumu rozetini görüntülemek için
- Şu ana kadar izlenen bölüm sayısı

### 🎞️ Film Ekleme
- Film adı
- Tür (Aksiyon, Dram, Komedi vb.)
- Çıkış tarihi (isteğe bağlı) - Vizyona giriş durumu rozetini görüntülemek için
- "İzlendi" onay kutusu

### 🔍 Filtreleme
**Diziler için:**
- Tümü
- Tamamlanan
- İzleniyor
- Planlanan

**Filmler için:**
- Tümü
- İzlendi
- İzlenmedi

### 🌙 Tema Değiştirme
Sağ üst köşedeki ay/güneş simgesine tıklayarak karanlık veya aydınlık temayı seçebilirsiniz.

### 🏷️ Çıkış Tarihi Rozetleri
Dizi ve filmlerinize çıkış tarihi eklediğinizde, otomatik olarak durumu gösteren renkli rozetler görüntülenir:

- 🟢 **Yayında/Vizyonda** - İçerik şu anda yayında (yeşil + nabız animasyonu)
- 🟡 **Bugün Çıkıyor** - İçerik bugün yayınlanıyor (turuncu + parlama animasyonu)
- 🔴 **1-7 gün içinde** - Yakında çıkacak (kırmızı rozet)
- 🔵 **8-30 gün içinde** - Orta vadede çıkacak (mavi rozet)
- ⚫ **30+ gün sonra** - Uzak gelecekte çıkacak (gri rozet)

Rozetler, içeriğinizin durumunu bir bakışta anlamanızı sağlar ve hangi içeriklerin ne zaman çıkacağını kolayca takip edebilirsiniz.

## Veri Güvenliği

### Nerede Saklanır?
- Tüm veriler **tarayıcınızın yerel depolamasında (localStorage)** saklanır
- Veriler sunucuya gönderilmez
- İnternet bağlantısı olmadan çalışır

### Yedekleme
- "Yedek Al" butonu ile tüm verilerinizi bir JSON dosyasına kaydedebilirsiniz
- Dosya bilgisayarınıza indirilir
- Aynı dosyayı "Dosya Yükle" ile geri yükleyebilirsiniz

### Veri Kaybı Riski
| Risk | Açıklama | Çözüm |
|------|---------|-------|
| ✅ | Tarayıcı verileri temizlenirse | Düzenli yedek alın |
| ⚠️ | Farklı cihazda açılırsa | Yedek dosyası ile aktarın |
| ❌ | İnternet kesilirse | Etkilenmez, offline çalışır |
| ❌ | Sunucu sorunu | Etkilenmez, yerel depolama kullanır |

## Son Güncellemeler (v1.4.0)

### 🆕 Yeni Özellikler
- **Son İzlenen Diziler**: İzleme ilerlemesi güncellenen diziler otomatik olarak listenin üstünde gösterilir
- **Son İzlenen Filmler**: Yeni izlenen filmler otomatik olarak listenin üstünde gösterilir
- **İzleme Zamanı Sıralaması**: Son izleme zamanına göre azalan sıra uygulanır
- **Canlı Sekme Güncellemesi**: Aynı tarayıcıdaki diğer sekmeler sıralama ve durum değişikliklerini anlık alır

### 🔧 Teknik İyileştirmeler
- Dizi sezon kayıtlarına ve film kayıtlarına `lastWatchedAt` alanı eklendi
- Mevcut sıralama korunurken yalnızca izleme geçmişi olan içerikler üste alınacak şekilde önceliklendirme mantığı eklendi
- Son izleme verisi mevcut P2P veri paketi ile birlikte eşlenen cihazlara aktarılır hale getirildi
- `storage` olayı ile aynı kullanıcı oturumundaki açık sekmeler arasında canlı güncelleme sağlandı

## Önceki Güncellemeler (v1.3.0)

### 🆕 Yeni Özellikler
- **Çıkış Tarihi Rozetleri**: Dizi ve filmlerinize çıkış tarihi ekleyerek otomatik durum rozetleri görüntüleyin
- **Dinamik Durum Gösterimi**: 5 farklı rozet türü ile yayın/vizyona giriş durumunu takip edin
- **Animasyonlu Rozetler**: Yayında olan içerikler için nabız animasyonu, bugün çıkanlar için parlama efekti
- **Akıllı Tarih Hesaplama**: Günlere göre otomatik renk kodlaması (yeşil, turuncu, kırmızı, mavi, gri)

### 🔧 Teknik İyileştirmeler
- Çıkış tarihi alanı dizi ve film formlarına eklendi
- `groupSeriesByName` fonksiyonu çıkış tarihi verilerini koruyacak şekilde güncellendi
- CSS animasyonları ve rozet stilleri eklendi
- Tarih hesaplama algoritması optimize edildi

### 📱 Kullanıcı Deneyimi
- Bir bakışta içerik durumu görünürlüğü
- Hangi içeriklerin ne zaman çıkacağını kolayca takip etme
- Görsel olarak zenginleştirilmiş kart görünümü
- Daha iyi içerik organizasyonu

## Önceki Güncellemeler (v1.2.0)

### 🆕 Özellikler
- **IMDB Puanı**: Dizi ve filmlerinize 1-10 arası puan verebilirsiniz
- **Açıklama Alanı**: Her içerik için detaylı açıklama ekleyebilirsiniz
- **Resim Linki**: Poster veya kapak resmi URL'si ekleyebilirsiniz
- **Görsel Kartlar**: Resim eklenmiş içerikler artık kartlarda görüntülenir
- **Yıldız Puanı**: IMDB puanları sarı yıldız ikonu ile gösterilir

## Kurulum

Bu uygulama özel bir kurulum gerektirmez. Yapmanız gerekenler:

1. `dizi_checklist.html` dosyasını indirin
2. Dosyayı tarayıcınızda açın
3. Hemen kullanmaya başlayın

### Alternatif Kullanım
```html
<!-- Doğrudan tarayıcıda açın -->
Dosyayı indirin → Sağ tıklayın → "Farklı Aç" → Tarayıcı seçin
