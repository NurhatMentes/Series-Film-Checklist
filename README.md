# Series Film Checklist

Bu depo, yerel projeniz `dizi_checklist.html` için hazırlanmış bir GitHub deposu şablonudur.

İçerik:
- `dizi_checklist.html` — mevcut tek sayfa uygulama.

Hazırlanan workflowlar:
- CI: HTML linter (htmlhint) çalıştırır (push ve PR'lerde).
- GitHub Pages deploy: `main` dalına push edildiğinde siteyi GitHub Pages ile yayınlar.

Nasıl kullanılır (PowerShell):
1) Yeni bir GitHub repo oluşturun, isim: "Series Film Checklist".
2) Lokal repository'yi başlatın (eğer henüz git yoksa) ve commit/push yapın:

```powershell
cd 'c:\Users\nurha\Desktop\Uygulamalar\Dizi-Film-Checklist'
git init
git add .
git commit -m "Initial commit: add workflows and metadata"
git branch -M main
# uzaktaki repo'yu ekleyin (GitHub'da oluşturduğunuz repo URL'sini kullanın)
git remote add origin https://github.com/<kullanici>/<Series-Film-Checklist>.git
git push -u origin main
```

Sonrasında GitHub'da repository ayarlarından Pages bölümünü kontrol ederek yayın URL'sini görebilirsiniz.

Notlar:
- CI için `htmlhint` kullanılıyor; ihtiyaç halinde ek testler/linters ekleyebilirim.
- İsterseniz Actions üzerinde özel dal veya build adımları ekleyebilirim.
