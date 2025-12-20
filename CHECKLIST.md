# Proje Kontrol Listesi (Checklist)

## Hata Düzeltmeleri ve İyileştirmeler (2025-12-20)

- [x] **Tailwind CSS Uyarıları**: `line-clamp` plugin'i CDN URL'inden kaldırıldı (Tailwind v3.3+ ile varsayılan olarak geliyor).
- [x] **YouTube Thumbnail 404 Hataları**: `handleImageError` fonksiyonu güncellendi. `hqdefault.jpg` bulunamadığında otomatik olarak `mqdefault.jpg` sürümünü dener.
- [x] **Performans (Passive Listeners)**: Fragman listesi üzerindeki `mouseover` ve `focusin` olay dinleyicilerine `{ passive: true }` eklendi. Bu sayede kaydırma performansı artırıldı ve tarayıcı uyarıları giderildi.
- [x] **YouTube Player Optimizasyonu**: Kullanılmayan `youtube.com/iframe_api` script'i kaldırıldı. Video oynatma mantığı tamamen Iframe Embed yöntemine geçirildi.

## Sonraki Adımlar (Önerilen)
- [ ] Projeyi tam bir Vite + Tailwind CSS yapısına geçirmek (Prodüksiyon uyarısını tamamen kaldırmak için).
- [ ] WebRTC eşleştirme kodunu modüler hale getirmek.
