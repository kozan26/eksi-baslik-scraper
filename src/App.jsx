import { useState, useEffect } from 'react'

function App() {
  const [gundem, setGundem] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [entries, setEntries] = useState([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  
  // Scrape and summarize state
  const [topicUrl, setTopicUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapeProgress, setScrapeProgress] = useState(null)
  const [summaryData, setSummaryData] = useState(null)
  const [scrapeError, setScrapeError] = useState(null)

  // Cloudflare Worker URL'i
  // Development: http://localhost:8787
  // Production: Deploy ettiğin Cloudflare Worker URL'i
  const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787'

  const fetchGundem = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const url = `${WORKER_URL}/api/gundem`
      console.log('Fetching from:', url)
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.success && data.items) {
        setGundem(data.items)
        setLastUpdate(new Date())
      } else {
        throw new Error(data.error || 'Beklenmeyen yanıt formatı')
      }
    } catch (err) {
      console.error('Hata:', err)
      console.error('Worker URL:', WORKER_URL)
      setError(err.message || 'Gündem yüklenirken bir hata oluştu. Worker URL: ' + WORKER_URL)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGundem()
    // Her 5 dakikada bir otomatik güncelle
    const interval = setInterval(fetchGundem, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const formatDate = (date) => {
    if (!date) return ''
    return new Date(date).toLocaleString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const fetchEntries = async (item) => {
    setEntriesLoading(true)
    setSelectedTopic(item)
    setEntries([])
    
    try {
      // Limit parametresi ekle (daha fazla entry yükle)
      const response = await fetch(`${WORKER_URL}/api/topic/${item.slug}--${item.id}?limit=50`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.success && data.entries) {
        setEntries(data.entries)
      } else {
        throw new Error(data.error || "Entry'ler yüklenemedi")
      }
    } catch (err) {
      console.error('Entry loading error:', err)
      setError(err.message || "Entry'ler yüklenirken bir hata oluştu")
    } finally {
      setEntriesLoading(false)
    }
  }

  const closeEntries = () => {
    setSelectedTopic(null)
    setEntries([])
  }

  const handleScrapeAndSummarize = async (e) => {
    e.preventDefault()
    if (!topicUrl.trim()) {
      setScrapeError('Lütfen bir Ekşi Sözlük başlık URL\'si girin')
      return
    }

    setScraping(true)
    setScrapeError(null)
    setSummaryData(null)
    setScrapeProgress('İlk sayfa yükleniyor...')

    try {
      const url = `${WORKER_URL}/api/scrape-and-summarize?url=${encodeURIComponent(topicUrl.trim())}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
        setSummaryData(data)
        setTopicUrl('')
      } else {
        throw new Error(data.error || 'Scraping başarısız oldu')
      }
    } catch (err) {
      console.error('Scraping error:', err)
      setScrapeError(err.message || 'Başlık çekilirken bir hata oluştu')
    } finally {
      setScraping(false)
      setScrapeProgress(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-gray-800 mb-2">
            📚 Ekşi Sözlük Gündem
          </h1>
          <p className="text-gray-600">
            Gündemdeki başlıkları canlı olarak takip edin veya bir başlığı özetleyin
          </p>
          {lastUpdate && (
            <p className="text-sm text-gray-500 mt-2">
              Son güncelleme: {formatDate(lastUpdate)}
            </p>
          )}
        </div>

        {/* Scrape and Summarize Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border-l-4 border-blue-500">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            🤖 Başlık Özetle (AI ile)
          </h2>
          <p className="text-gray-600 mb-4">
            Bir Ekşi Sözlük başlık URL'si girin, tüm sayfaları çekip AI ile özetleyelim.
          </p>
          
          <form onSubmit={handleScrapeAndSummarize} className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={topicUrl}
                onChange={(e) => setTopicUrl(e.target.value)}
                placeholder="https://eksisozluk.com/baslik--12345"
                disabled={scraping}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
              <button
                type="submit"
                disabled={scraping || !topicUrl.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-lg"
              >
                {scraping ? '⏳ İşleniyor...' : '🚀 Özetle'}
              </button>
            </div>
          </form>

          {scrapeProgress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <div className="text-blue-800 text-sm">{scrapeProgress}</div>
            </div>
          )}

          {scrapeError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="text-red-800 font-semibold">❌ Hata: {scrapeError}</div>
            </div>
          )}

          {summaryData && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-800">Özet Sonucu</h3>
                <button
                  onClick={() => setSummaryData(null)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  ✕ Kapat
                </button>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex gap-4 text-sm text-gray-600 mb-3">
                  <span>📄 <strong>{summaryData.pages}</strong> sayfa</span>
                  <span>📝 <strong>{summaryData.entryCount}</strong> entry</span>
                </div>
                <a
                  href={summaryData.topic.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  {summaryData.topic.url} →
                </a>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
                <h4 className="font-bold text-gray-800 mb-3">🤖 AI Özeti:</h4>
                <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {summaryData.summary}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Refresh Button */}
        <div className="flex justify-center mb-6">
          <button
            onClick={fetchGundem}
            disabled={loading}
            className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-lg"
          >
            {loading ? '🔄 Yükleniyor...' : '🔄 Yenile'}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="text-red-800 font-semibold">❌ Hata: {error}</div>
            <div className="text-sm text-red-600 mt-2">
              Cloudflare Worker'ın çalıştığından emin olun.
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && gundem.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 text-lg">📥 Gündem yükleniyor...</div>
          </div>
        ) : gundem.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 text-lg">📰 Henüz gündem yok</div>
          </div>
        ) : (
          /* Gündem Listesi */
          <div className="space-y-3">
            {gundem.map((item, index) => (
              <div
                key={index}
                className="bg-white rounded-xl shadow-lg p-5 hover:shadow-xl transition-all border-l-4 border-orange-500"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="bg-orange-100 text-orange-800 text-xs font-bold px-2 py-1 rounded">
                        #{index + 1}
                      </span>
                      <span className="text-sm text-gray-500">
                        {item.entryCount || 0} entry
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800">
                      {item.title}
                    </h3>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchEntries(item)}
                      className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                    >
                      📖 Entry'leri Göster
                    </button>
                    <a
                      href={`https://eksisozluk.com/${item.slug}--${item.id || ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                    >
                      🔗 Aç
                    </a>
                  </div>
                </div>

                {/* Entry Listesi */}
                {selectedTopic?.id === item.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    {entriesLoading ? (
                      <div className="text-center py-4 text-gray-500">
                        Entry'ler yükleniyor...
                      </div>
                    ) : entries.length > 0 ? (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-semibold text-gray-700">
                            Entry'ler ({entries.length})
                          </h4>
                          <button
                            onClick={closeEntries}
                            className="text-sm text-gray-500 hover:text-gray-700"
                          >
                            ✕ Kapat
                          </button>
                        </div>
                        {entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-orange-600">
                                  #{entry.order}
                                </span>
                                <span className="text-xs text-gray-600">
                                  {entry.author}
                                </span>
                                {entry.date && (
                                  <span className="text-xs text-gray-500">
                                    • {entry.date}
                                  </span>
                                )}
                              </div>
                              {entry.favoriteCount > 0 && (
                                <span className="text-xs text-gray-500">
                                  ⭐ {entry.favoriteCount}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {entry.content}
                            </p>
                            {entry.entryUrl && (
                              <a
                                href={entry.entryUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-orange-600 hover:underline mt-2 inline-block"
                              >
                                Entry'yi aç →
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-gray-500">
                        Entry bulunamadı
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-sm text-gray-500">
          <p>Data source: <a href="https://eksisozluk.com" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">eksisozluk.com</a></p>
          <p className="mt-2">Powered by Cloudflare Workers</p>
        </div>
      </div>
    </div>
  )
}

export default App
