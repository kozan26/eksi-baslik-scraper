# 🚀 Hızlı Kurulum Rehberi

## 1️⃣ Bağımlılıkları Yükle

```bash
npm install
```

## 2️⃣ Cloudflare Worker'ı Deploy Et

### Yöntem A: Wrangler CLI (Önerilen)

```bash
# Wrangler yükle (eğer yoksa)
npm install -g wrangler

# Cloudflare'e login ol
wrangler login

# Worker'ı deploy et
wrangler deploy
```

Deploy sonrası bir URL alacaksın, örn: `https://eksisozluk-gundem-worker.your-subdomain.workers.dev`

### Yöntem B: Cloudflare Dashboard

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages
2. "Create application" → "Create Worker"
3. `cloudflare-worker.js` içeriğini kopyala-yapıştır
4. Deploy et
5. URL'ini kopyala

## 3️⃣ Worker URL'ini Ayarla

`.env.local` dosyası oluştur:

```env
VITE_WORKER_URL=https://your-worker-url.workers.dev
```

Veya `src/App.jsx` içinde direkt değiştir (satır 11):

```jsx
const WORKER_URL = 'https://your-worker-url.workers.dev'
```

## 4️⃣ Development Server'ı Başlat

```bash
npm run dev
```

Tarayıcıda `http://localhost:5173` adresini aç.

## 5️⃣ GitHub'a Push Et

```bash
git init
git add .
git commit -m "Initial commit: Ekşi Sözlük Gündem Scraper"
git branch -M main
git remote add origin https://github.com/username/eksisozluk-gundem.git
git push -u origin main
```

## 6️⃣ GitHub Secrets Ayarla

1. GitHub Repository → Settings → Secrets and variables → Actions
2. "New repository secret" butonuna tıkla
3. Name: `VITE_WORKER_URL`
4. Value: Cloudflare Worker URL'in (örn: `https://your-worker.workers.dev`)
5. Add secret

## 7️⃣ GitHub Pages'i Aktif Et

1. GitHub Repository → Settings → Pages
2. Source: `gh-pages` branch seç
3. Folder: `/ (root)` seç
4. Save

Artık GitHub Actions otomatik olarak deploy edecek! 🎉

## ✅ Test

Worker URL'ini test et:

```bash
curl https://your-worker-url.workers.dev/api/gundem
```

Başarılı bir yanıt görmelisin:
```json
{
  "success": true,
  "items": [...],
  "timestamp": "..."
}
```

## 🐛 Sorun Giderme

### Worker 500 hatası veriyor
- Cloudflare Dashboard → Workers → Logs'u kontrol et
- HTML yapısı değişmiş olabilir, parsing fonksiyonunu güncelle

### Frontend'de CORS hatası
- Worker'da CORS headers'ın olduğundan emin ol
- Worker URL'inin doğru olduğunu kontrol et

### Gündem listesi boş geliyor
- Browser console'da Network tab'ı kontrol et
- Worker'ın başarılı yanıt döndüğünü kontrol et
- HTML parsing mantığı güncellenmiş olabilir

