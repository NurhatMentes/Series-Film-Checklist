# 🎬 İzleme Takip Uygulaması

Dizilerinizi ve filmlerinizi kolayca takip edebileceğiniz modern, kullanıcı dostu bir web uygulaması. Yerel depolama ile çalışır, verileriniz güvende kalır ve istediğiniz zaman yedek alıp geri yükleyebilirsiniz.

<img width="966" height="911" alt="image" src="https://github.com/user-attachments/assets/5848e430-2b93-4eaa-b2a1-408f39a5cd46" />




## Özellikler

### 📺 Dizi Takibi
- Birden fazla sezon ekleyin
- Her sezon için bölüm ilerlemesi takibi
- Platform bilgisi (Netflix, Disney+, Amazon Prime vb.)
- Tüm sezonları tek bir kartta görüntüleyin
- Sezon detaylarını aç/kapa ile görüntüleyin

### 🎬 Film Listesi
- İzlenecek filmleri ekleyin
- Film türüne göre sınıflandırın
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
- Şu ana kadar izlenen bölüm sayısı

### 🎞️ Film Ekleme
- Film adı
- Tür (Aksiyon, Dram, Komedi vb.)
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

## Kurulum

Bu uygulama özel bir kurulum gerektirmez. Yapmanız gerekenler:

1. `dizi_checklist.html` dosyasını indirin
2. Dosyayı tarayıcınızda açın
3. Hemen kullanmaya başlayın

### Alternatif Kullanım
```html
<!-- Doğrudan tarayıcıda açın -->
Dosyayı indirin → Sağ tıklayın → "Farklı Aç" → Tarayıcı seçin
