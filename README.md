# 📚 Ekşi Sözlük Gündem Scraper

Ekşi Sözlük'ün gündem başlıklarını canlı olarak gösteren web uygulaması. Cloudflare Workers ile scraping, React ile frontend.

## 🚀 Özellikler

- ✅ Ekşi Sözlük gündem başlıklarını canlı çeker
- ✅ **YENİ: Başlık URL'si girerek tüm entry'leri çekme ve AI ile özetleme**
- ✅ Cloudflare Workers ile scraping (CORS sorunu yok)
- ✅ Cloudflare Workers AI ile otomatik özetleme
- ✅ Tüm sayfaları otomatik tespit edip çekme (Python versiyonu gibi)
- ✅ React + Vite ile modern UI
- ✅ Responsive tasarım
- ✅ Otomatik güncelleme (5 dakikada bir)
- ✅ GitHub Pages'e deploy edilebilir

## 📦 Kurulum

### 1. Bağımlılıkları Yükle

```bash
npm install
```

### 2. Cloudflare Worker'ı Deploy Et

#### Seçenek A: Wrangler CLI ile (Önerilen)

```bash
# Wrangler'ı global olarak yükle (eğer yoksa)
npm install -g wrangler

# Cloudflare'e login ol
wrangler login

# Worker'ı deploy et
wrangler deploy
```

#### Seçenek B: Cloudflare Dashboard

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages
2. "Create application" → "Create Worker"
3. `cloudflare-worker.js` dosyasının içeriğini kopyala-yapıştır
4. Deploy et

### 2.5. Cloudflare Workers AI'yi Yapılandır (Opsiyonel - AI Özetleme İçin)

AI özetleme özelliğini kullanmak için:

1. Cloudflare Dashboard → Workers & Pages → Worker'ınızı seçin
2. "Settings" → "Bindings" → "Add binding"
3. Binding type: **Workers AI**
4. Variable name: `AI` (büyük harf)
5. Save

Not: Workers AI ücretsiz plan için sınırlıdır. AI olmadan da uygulama çalışır, basit özet gösterir.

### 3. Worker URL'ini Ayarla

Worker deploy edildikten sonra bir URL alacaksın (örn: `https://eksisozluk-gundem-worker.your-subdomain.workers.dev`)

`.env.local` dosyası oluştur:

```env
VITE_WORKER_URL=https://eksisozluk-gundem-worker.your-subdomain.workers.dev
```

### 4. Development Server'ı Başlat

```bash
npm run dev
```

Uygulama `http://localhost:5173` adresinde çalışacak.

## 🌐 GitHub Pages'e Deploy

### 1. GitHub Actions Workflow Oluştur

`.github/workflows/deploy.yml` dosyası oluştur:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm install
        
      - name: Build
        run: npm run build
        env:
          VITE_WORKER_URL: ${{ secrets.VITE_WORKER_URL }}
          
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### 2. GitHub Secrets Ayarla

Repository Settings → Secrets → Actions → "New repository secret":

- `VITE_WORKER_URL`: Cloudflare Worker URL'in (production)

### 3. GitHub Pages'i Aktif Et

Repository Settings → Pages:
- Source: `gh-pages` branch
- Folder: `/ (root)`

### 4. Push Et

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

GitHub Actions otomatik olarak build edip deploy edecek!

## 🔧 Konfigürasyon

### Worker URL'ini Değiştir

`.env.local` dosyasında:
```env
VITE_WORKER_URL=https://your-worker-url.workers.dev
```

Veya `src/App.jsx` içinde direkt değiştir:
```jsx
const WORKER_URL = 'https://your-worker-url.workers.dev'
```

### Güncelleme Sıklığı

`src/App.jsx` içinde otomatik güncelleme süresini değiştir:
```jsx
const interval = setInterval(fetchGundem, 5 * 60 * 1000) // 5 dakika
```

## 🤖 Başlık Özetleme (Web UI)

Uygulama arayüzünden herhangi bir Ekşi Sözlük başlığını özetleyebilirsiniz:

1. Ana sayfadaki "🤖 Başlık Özetle (AI ile)" bölümüne gidin
2. Bir Ekşi Sözlük başlık URL'si girin (örn: `https://eksisozluk.com/baslik--12345`)
3. "🚀 Özetle" butonuna tıklayın
4. Worker tüm sayfaları otomatik tespit edip çeker
5. AI tüm entry'leri analiz edip özet oluşturur

### API Endpoint

Doğrudan API'yi de kullanabilirsiniz:

```bash
curl "https://your-worker-url.workers.dev/api/scrape-and-summarize?url=https://eksisozluk.com/baslik--12345"
```

Yanıt formatı:
```json
{
  "success": true,
  "topic": {
    "slug": "baslik",
    "id": "12345",
    "url": "https://eksisozluk.com/baslik--12345"
  },
  "pages": 10,
  "entryCount": 250,
  "summary": "AI tarafından oluşturulmuş özet...",
  "timestamp": "2025-01-18T12:00:00.000Z"
}
```

## 🐍 Python Entry Scraper

Proje ayrıca bir Python scraper içerir. Bu scraper, belirli bir başlıktaki tüm entry'leri çekip text dosyasına kaydeder.

### Kurulum

```bash
# Python bağımlılıklarını yükle
pip install -r requirements.txt
```

### Kullanım

1. `scraper.py` dosyasını açın ve `BASE_URL` değişkenini hedef Ekşi Sözlük başlık URL'si ile değiştirin:

```python
BASE_URL = "https://eksisozluk.com/baslik-url--12345"
```

2. Scraper'ı çalıştırın:

```bash
python scraper.py
```

### Özellikler

- ✅ Cloudflare korumasını bypass eder (cloudscraper kullanır)
- ✅ Otomatik son sayfa tespiti (gelişmiş algoritma)
- ✅ Sadece entry metinlerini çeker (reklam ve gereksiz içerik yok)
- ✅ Her entry'nin başına madde işareti (•) ekler
- ✅ UTF-8 BOM ile kayıt (Excel uyumlu)
- ✅ Retry mekanizması (web ve mobile modlar)
- ✅ Çıktılar `output/` klasörüne kaydedilir

### Ayarlar

`scraper.py` dosyasının başındaki ayarları değiştirerek davranışı özelleştirebilirsiniz:

- `TIMEOUT`: İstek zaman aşımı (varsayılan: 25 saniye)
- `DELAY_BETWEEN_PAGES`: Sayfalar arası bekleme (varsayılan: 0.08-0.20 saniye)
- `OUT_DIR`: Çıktı klasörü (varsayılan: "output")
- `MAX_SEQ_WALK`: Maksimum sıralı sayfa keşfi (varsayılan: 1000)

### Çıktı Formatı

Dosyalar şu formatta kaydedilir:
```
{baslik-slug}_p1-{son-sayfa}_{tarih-saat}.txt
```

Örnek: `18-ekim-2025-besiktas-genclerbirligi-maci--8025909_p1-15_20250118_143022.txt`

## 📁 Proje Yapısı

```
├── cloudflare-worker.js    # Cloudflare Worker (scraping + AI summarization)
├── wrangler.toml          # Worker konfigürasyonu
├── scraper.py             # Python entry scraper
├── requirements.txt       # Python bağımlılıkları
├── src/
│   ├── App.jsx            # Ana component (gündem + özetleme UI)
│   ├── main.jsx           # Entry point
│   └── index.css          # Styles
├── index.html
├── package.json
└── vite.config.js
```

## 🔑 API Endpoints

### `/api/gundem`
Gündem başlıklarını döndürür.

### `/api/topic/:slug--:id`
Belirli bir başlığın entry'lerini çeker.

**Parametreler:**
- `limit` (query): Maksimum entry sayısı (varsayılan: 50)

### `/api/scrape-and-summarize` ⭐ YENİ
Tüm sayfaları çekip AI ile özetler.

**Parametreler:**
- `url` (query, gerekli): Ekşi Sözlük başlık URL'si

**Örnek:**
```bash
curl "https://your-worker.workers.dev/api/scrape-and-summarize?url=https://eksisozluk.com/example--12345"
```

## 🐛 Sorun Giderme

### Worker çalışmıyor

- Cloudflare Dashboard'da Worker'ın deploy olduğunu kontrol et
- Worker logs'u kontrol et (Cloudflare Dashboard → Workers → Logs)

### CORS hatası

- Worker'da CORS headers'ın olduğundan emin ol
- Worker URL'inin doğru olduğunu kontrol et

### Gündem yüklenmiyor

- Browser console'da hata mesajlarını kontrol et
- Worker URL'inin erişilebilir olduğunu test et:
  ```bash
  curl https://your-worker-url.workers.dev/api/gundem
  ```

## 📝 Lisans

MIT

## 🙏 Teşekkürler

- Ekşi Sözlük'e teşekkürler
- Cloudflare Workers'a teşekkürler

