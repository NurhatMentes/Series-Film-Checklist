# Proje Kontrol Listesi (Checklist)

## Büyük Bakım: Bug Düzeltmeleri + Otomatik Doldurma (2026-09-26)

### Kritik bugler
- [x] Veri modeli: her dizi artık tek kayıt, sezonlar içinde (`seasons[]`). Eski format açılışta otomatik dönüştürülür, eski veri `seriesData_v1_backup` olarak saklanır.
- [x] Dizi adı değiştirme artık çalışıyor ve diziyi ikiye bölmüyor; genel bilgiler tüm sezonlar için tek yerde.
- [x] P2P senkron: sonsuz geri gönderme döngüsü kaldırıldı; veriler ID + `updatedAt` ile birleştiriliyor, silinenler (tombstone) geri gelmiyor.
- [x] Yedek yükleme: liste anında güncelleniyor, çift dinleyici (çift onay/çift etiket) sorunu giderildi, doğrulama + onay eklendi.
- [x] Durum filtresi dizinin tüm sezonlarına göre; Türkçe İ/ı duyarlı arama; istatistik dizi sayısını doğru gösteriyor.

### Önemli bugler
- [x] Yeni ekle formu eski kaydın bilgileriyle açılmıyor; "Kaydet" butonu kaybolmuyor (sezon düzenleyici yeniden yazıldı).
- [x] `</html>` sonrası sayfaya basılan kod parçası silindi.
- [x] "Son izlenen" artık zorunlu değil, seçilebilir bir sıralama (seçim hatırlanıyor).
- [x] Yakında Çıkacaklar sayaçları, QR tarama, koyu tema (`dark:` sınıfları), eksik buton stilleri, Esc ile kapatma, YouTube linki, mobil taşmalar.
- [x] XSS: tüm kullanıcı verisi HTML'e kaçışlı yazılıyor; bozuk localStorage uygulamayı çökertmiyor.

### Yeni özellikler
- [x] Otomatik doldurma (TMDB; anahtarsız diziler için TVmaze): poster, açıklama, puan, tarih, fragman, kategori/etiket, platform, sezon/bölüm sayıları.
- [x] Mevcut kayıtlardaki eksikleri toplu tamamlama (sadece boş alanlar, yeni sezon ekleme seçeneği).
- [x] Dizilerde Duraklatıldı/Bırakıldı durumu, kartta "Sıradaki bölüm · İzledim" butonu.
- [x] Kişisel puan ve not, "Benim Puanım" sıralaması, İstatistikler sekmesi.
- [x] Silmede "Geri Al" bildirimi, klavye kısayolları (`/` arama, `n` yeni kayıt).
- [x] PWA (kurulabilir, çevrimdışı açılır), dosyalar `css/` ve `js/` altına bölündü, jsdom testleri + CI.

## Son Izlenen Icerik Siralamasi (2026-07-15)

- [x] Dizi sayfasinda son izlenen dizileri `lastWatchedAt` alanina gore listenin ustune tasima ozelligi eklendi.
- [x] Film sayfasinda son izlenen filmleri `lastWatchedAt` alanina gore listenin ustune tasima ozelligi eklendi.
- [x] Varsayilan siralama bozulmadan, yalnizca izleme gecmisi olan iceriklere oncelik verilmesi saglandi.
- [x] Son izleme verisi localStorage ve mevcut P2P senkronizasyon akisi icine dahil edildi.
- [x] Ayni tarayicidaki acik sekmeler arasinda `storage` olayi ile anlik guncelleme eklendi.
- [x] Farkli ekran genisliklerinde ve canli guncelleme akisinda tarayici testi yapildi.

## Hata Düzeltmeleri ve İyileştirmeler (2025-12-20)

- [x] **Tailwind CSS Uyarıları**: `line-clamp` plugin'i CDN URL'inden kaldırıldı (Tailwind v3.3+ ile varsayılan olarak geliyor).
- [x] **YouTube Thumbnail 404 Hataları**: `handleImageError` fonksiyonu güncellendi. `hqdefault.jpg` bulunamadığında otomatik olarak `mqdefault.jpg` sürümünü dener.
- [x] **Performans (Passive Listeners)**: Fragman listesi üzerindeki `mouseover` ve `focusin` olay dinleyicilerine `{ passive: true }` eklendi. Bu sayede kaydırma performansı artırıldı ve tarayıcı uyarıları giderildi.
- [x] **YouTube Player Optimizasyonu**: Kullanılmayan `youtube.com/iframe_api` script'i kaldırıldı. Video oynatma mantığı tamamen Iframe Embed yöntemine geçirildi.

## Sonraki Adımlar (Önerilen)
- [ ] Projeyi tam bir Vite + Tailwind CSS yapısına geçirmek (Prodüksiyon uyarısını tamamen kaldırmak için).
- [ ] WebRTC eşleştirme kodunu modüler hale getirmek.
