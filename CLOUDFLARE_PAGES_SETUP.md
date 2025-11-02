# Cloudflare Pages Environment Variable Ayarlama

Worker URL'i frontend'de kullanabilmek için Cloudflare Pages'te environment variable ayarlamanız gerekiyor.

## Adımlar:

1. **Cloudflare Dashboard'a gidin:**
   - https://dash.cloudflare.com
   - Workers & Pages → Projenizi seçin

2. **Settings → Environment Variables'a gidin**

3. **Production Environment için:**
   - "Add variable" butonuna tıklayın
   - Variable name: `VITE_WORKER_URL`
   - Value: `https://eksi-baslik-scraper.kozan26.workers.dev`
   - Save

4. **Preview Environment için (opsiyonel ama önerilir):**
   - "Add variable" butonuna tıklayın
   - Variable name: `VITE_WORKER_URL`
   - Value: `https://eksi-baslik-scraper.kozan26.workers.dev`
   - Save

5. **Branch Preview Environment için (opsiyonel ama önerilir):**
   - "Add variable" butonuna tıklayın
   - Variable name: `VITE_WORKER_URL`
   - Value: `https://eksi-baslik-scraper.kozan26.workers.dev`
   - Save

6. **Redeploy yapın:**
   - Settings → Builds & deployments
   - "Retry deployment" butonuna tıklayın
   - Veya yeni bir commit push edin

## Doğrulama:

Environment variable ayarlandıktan sonra:
- Worker URL: `https://eksi-baslik-scraper.kozan26.workers.dev`
- Test: Browser'da `https://eksi-baslik-scraper.kozan26.workers.dev/api/gundem` adresini açın
- JSON response görmelisiniz

## Not:

Kod içinde production için default URL ayarlandı (`https://eksi-baslik-scraper.kozan26.workers.dev`), ancak environment variable kullanmak daha iyi bir pratiktir çünkü:
- Farklı environment'lar için farklı URL'ler kullanabilirsiniz
- Kod değişikliği yapmadan URL'i değiştirebilirsiniz
- Daha güvenli ve yönetilebilir

