# Proje Kontrol Listesi (Checklist)

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
