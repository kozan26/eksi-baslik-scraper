/**
 * Cloudflare Worker - Ekşi Sözlük Entry Scraper + AI Summarizer
 * Python scraper'dan uyarlanmıştır
 */

export default {
  async fetch(request, env, ctx) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { 
        status: 405,
        headers: corsHeaders 
      })
    }

    const url = new URL(request.url)

    // Route: /api/gundem - Gündem listesi (frontend için)
    if (url.pathname === '/api/gundem') {
      return new Response(JSON.stringify({
        success: true,
        items: [],
        message: 'Gündem listesi özelliği devre dışı. Sadece başlık URL\'sinden entry çekme destekleniyor.',
        timestamp: new Date().toISOString()
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      })
    }

    // Route: /api/scrape-and-summarize - Ana endpoint
    if (url.pathname === '/api/scrape-and-summarize') {
      try {
        const topicUrl = url.searchParams.get('url')
        if (!topicUrl) {
          return new Response(JSON.stringify({
            success: false,
            error: 'URL parameter is required'
          }), {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          })
        }

        // Parse topic URL to get slug and id
        const urlObj = new URL(topicUrl)
        const pathMatch = urlObj.pathname.match(/\/([^/]+)--(\d+)/)
        if (!pathMatch) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Invalid Ekşi Sözlük URL format. Expected: https://eksisozluk.com/baslik--12345'
          }), {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          })
        }

        const slug = pathMatch[1]
        const id = pathMatch[2]
        const baseUrl = `https://eksisozluk.com/${slug}--${id}`

        // Discover last page and scrape all entries
        let lastPage
        let allEntries = []
        
        try {
          lastPage = await discoverLastPage(baseUrl)
          console.log(`Discovered last page: ${lastPage} for ${baseUrl}`)
        } catch (error) {
          console.error('Error discovering last page:', error)
        return new Response(JSON.stringify({
            success: false,
            error: `Failed to discover last page: ${error.message}`
        }), {
            status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        })
        }

        try {
          allEntries = await scrapeAllPages(baseUrl, slug, id, lastPage)
          console.log(`Total entries scraped: ${allEntries.length}`)
      } catch (error) {
          console.error('Error scraping pages:', error)
        return new Response(JSON.stringify({
          success: false,
            error: `Failed to scrape entries: ${error.message}`
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        })
        }

        if (allEntries.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No entries found. Please check the URL and try again.'
          }), {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          })
        }

        // Summarize using AI
        const summary = await summarizeEntries(allEntries, env)
        
        return new Response(JSON.stringify({
          success: true,
          topic: {
            slug,
            id,
            url: baseUrl
          },
          pages: lastPage,
          entryCount: allEntries.length,
          summary,
          entries: allEntries.slice(0, 5), // First 5 entries as sample
          timestamp: new Date().toISOString()
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        })
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        })
      }
    }

    // Route: /api/test-parse - Debug endpoint
    if (url.pathname === '/api/test-parse') {
      try {
        const testUrl = url.searchParams.get('url')
        if (!testUrl) {
        return new Response(JSON.stringify({
            success: false,
            error: 'URL parameter is required'
          }), {
            status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        })
        }

        const urlObj = new URL(testUrl)
        const pathMatch = urlObj.pathname.match(/\/([^/]+)--(\d+)/)
        if (!pathMatch) {
        return new Response(JSON.stringify({
          success: false,
            error: 'Invalid Ekşi Sözlük URL format'
        }), {
            status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        })
        }

        const slug = pathMatch[1]
        const id = pathMatch[2]
        const baseUrl = `https://eksisozluk.com/${slug}--${id}`

        const html = await fetchHtml(baseUrl)
        const entries = parseEntriesFromHTML(html, 10)
        
        const hasPinnedEntry = /id=["']pinned-entry["']/i.test(html)
        const hasEntryList = /id=["']entry-item-list["']/i.test(html)
        const entryIdMatches = html.match(/id=["']entry-(\d+)["']/gi) || []
        const contentMatches = html.match(/class=["'][^"']*content[^"']*["']/gi) || []
        
        return new Response(JSON.stringify({
          success: true,
          url: baseUrl,
          htmlLength: html.length,
          hasPinnedEntry,
          hasEntryList,
          entryIdCount: entryIdMatches.length,
          contentClassCount: contentMatches.length,
          parsedEntries: entries.length,
          entries: entries.slice(0, 3),
          sampleHtml: {
            first1000: html.substring(0, 1000),
            entryItemListSnippet: html.match(/<[^>]*id=["']entry-item-list["'][^>]*>[\s\S]{0,2000}/i)?.[0] || 'Not found',
            firstEntryMatch: html.match(/<li[^>]*id=["']entry-\d+["'][^>]*>[\s\S]{0,2000}/i)?.[0] || 'Not found'
          }
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        })
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        })
      }
    }

    // Default route
    return new Response(JSON.stringify({
      message: 'Ekşi Sözlük Scraper API',
      endpoints: {
        '/api/scrape-and-summarize': 'Scrape topic entries and summarize with AI',
        '/api/test-parse': 'Test HTML parsing (debug)'
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * URL'den p parametresini kaldırır, base URL döndürür
 */
function normalizeBaseUrl(url) {
  try {
    const urlObj = new URL(url)
    urlObj.searchParams.delete('p')
    return urlObj.toString()
  } catch (e) {
    return url
  }
}

/**
 * Base URL'e p parametresi ekler
 */
function buildPageUrl(baseUrl, page) {
  try {
    const urlObj = new URL(baseUrl)
    urlObj.searchParams.set('p', page.toString())
    return urlObj.toString()
  } catch (e) {
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}p=${page}`
  }
}

/**
 * Ekşi Sözlük'ten HTML çeker (retry mekanizması ile)
 */
async function fetchHtml(url) {
  const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0',
    'Referer': 'https://eksisozluk.com/'
  }

  const RETRIES = 3
  let lastError = null

  for (let i = 0; i < RETRIES; i++) {
    try {
      const response = await fetch(url, {
        headers: fetchHeaders
      })

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()
    
      if (!html || html.length === 0) {
        throw new Error('Empty HTML response')
      }
    
      return html
  } catch (error) {
      lastError = error
      console.log(`Fetch attempt ${i + 1}/${RETRIES} failed: ${error.message}`)
      if (i < RETRIES - 1) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, (i + 1) * 500))
      }
    }
  }

  throw lastError || new Error('Failed to fetch HTML')
}

/**
 * Entry text'ini temizler (Python versiyonu gibi)
 */
function cleanEntryText(htmlContent) {
  if (!htmlContent) return ''
  
  let content = htmlContent
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  
  return content
}

/**
 * HTML'den entry'leri parse eder (Python'daki _extract_entries() mantığını TAM TAKLİT)
 * Python: soup.select("#pinned-entry .content, #entry-item-list .content")
 * Her node için: get_text(separator="\n", strip=True), html.unescape, temizleme, append
 */
function parseEntriesFromHTML(html, limit = 1000) {
  const entries = []
  
  try {
    if (!html || html.length < 100) {
      console.error('HTML too short or empty')
      return []
    }
    
    // Python mantığı: soup.select("#pinned-entry .content, #entry-item-list .content")
    // Yani: Önce #pinned-entry içindeki .content'leri, sonra #entry-item-list içindeki .content'leri bul
    
    // 1. #pinned-entry .content - Pinned entry içindeki .content elementleri
    const pinnedContainerMatch = html.match(/<[^>]*id=["']pinned-entry["'][^>]*>([\s\S]*?)<\/[^>]+>/i)
    if (pinnedContainerMatch) {
      const pinnedContainer = pinnedContainerMatch[1]
      const pinnedContentRegex = /<[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi
      let pinnedContentMatch
      pinnedContentRegex.lastIndex = 0
      
      while ((pinnedContentMatch = pinnedContentRegex.exec(pinnedContainer)) !== null) {
        const content = cleanEntryText(pinnedContentMatch[1])
        if (content && content.trim().length > 0) {
          // Python gibi: Sadece content text'ini ekle, entry ID'ye bakma
          entries.push({
            id: 'pinned',
            order: entries.length,
            content,
          })
        }
      }
    }
    
    // 2. #entry-item-list .content - Entry list içindeki tüm .content elementleri
    let entryListContainer = null
    let entryListMatch = null
    
    // Önce <ul id="entry-item-list"> dene
    entryListMatch = html.match(/<ul[^>]*id=["']entry-item-list["'][^>]*>([\s\S]*?)<\/ul>/i)
    if (entryListMatch) {
      entryListContainer = entryListMatch[1]
    } else {
      // <div id="entry-item-list"> dene
      entryListMatch = html.match(/<div[^>]*id=["']entry-item-list["'][^>]*>([\s\S]*?)<\/div>/i)
      if (entryListMatch) {
        entryListContainer = entryListMatch[1]
      } else {
        // Herhangi bir tag dene
        entryListMatch = html.match(/<[^>]*id=["']entry-item-list["'][^>]*>([\s\S]*?)<\/[^>]+>/i)
        if (entryListMatch) {
          entryListContainer = entryListMatch[1]
        } else {
          // Bulamazsa, tüm HTML'de ara (fallback)
          entryListContainer = html
        }
      }
    }
    
    // Python mantığı: entry-item-list içindeki TÜM .content elementlerini bul
    // Entry ID'ye BAKMA, sadece content text'lerini çıkar (Python gibi)
    const contentRegex = /<[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi
    let contentMatch
    contentRegex.lastIndex = 0
    
    // Python gibi: Her content elementini sırayla bul ve direkt ekle (duplicate kontrolü YOK)
    while ((contentMatch = contentRegex.exec(entryListContainer)) !== null) {
      const content = cleanEntryText(contentMatch[1])
      
      // Python: if txt: out.append(txt)
      if (content && content.trim().length > 0) {
        // Python gibi: Direkt ekle, entry ID arama
        entries.push({
          id: `entry-${entries.length}`, // Sadece sıra numarası için ID
          order: entries.length,
          content,
        })
      }
    }
    
    console.log(`Parsed ${entries.length} entries from HTML (Python mantığı: sadece content text'leri, duplicate kontrolü yok)`)
    
    // Limit kadar döndür
    return entries.slice(0, limit)
    
  } catch (error) {
    console.error('Entry parse error:', error)
    return []
  }
}

/**
 * HTML'deki linklerden aynı path'e ait max p değerini bulur
 */
function maxPFromLinks(baseUrl, html) {
  try {
    const urlObj = new URL(baseUrl)
    const basePath = urlObj.pathname
    let maxP = 1
    
    // Tüm <a href> linklerini bul
    const linkPattern = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi
    let linkMatch
    
    while ((linkMatch = linkPattern.exec(html)) !== null) {
      try {
        let href = linkMatch[1]
        
        // Relative URL'yi absolute'a çevir
        if (href.startsWith('/')) {
          href = `${urlObj.protocol}//${urlObj.host}${href}`
        }
        
        const hrefUrl = new URL(href)
        
        // Aynı path'e sahip mi kontrol et
        if (hrefUrl.pathname === basePath) {
          const p = hrefUrl.searchParams.get('p')
          if (p) {
            const pNum = parseInt(p, 10)
            if (pNum > maxP) {
              maxP = pNum
            }
          }
        }
      } catch (e) {
        // Invalid URL, skip
        continue
      }
    }
    
    return maxP
  } catch (error) {
    console.error('Error finding max page from links:', error)
    return 1
  }
}

/**
 * Son sayfa sayısını tespit eder (Python'daki _discover_last_page_safely() mantığı)
 * Subrequest limiti için optimize edilmiş: maksimum 10 subrequest
 */
async function discoverLastPage(baseUrl) {
  const normalizedBase = normalizeBaseUrl(baseUrl)
  const MAX_SUBREQUESTS = 8 // Son sayfa tespiti için maksimum subrequest
  
  try {
    // 1. p=1'de link taraması
    const page1Url = buildPageUrl(normalizedBase, 1)
    const html1 = await fetchHtml(page1Url)
    const m1 = maxPFromLinks(normalizedBase, html1)
    
    // 2. p=2'de link taraması (varsa)
    let m2 = m1
    let subrequestsUsed = 1
    
    if (m1 < 3 && subrequestsUsed < MAX_SUBREQUESTS) {
      try {
        const page2Url = buildPageUrl(normalizedBase, 2)
        const html2 = await fetchHtml(page2Url)
        subrequestsUsed++
        m2 = Math.max(m1, maxPFromLinks(normalizedBase, html2))
      } catch (e) {
        // Ignore errors for page 2
      }
    }
    
    let candidate = Math.max(m1, m2)
    
    if (candidate >= 3) {
      return candidate
    }
    
    // 3. Sıralı yürüyüş: Kalan subrequest sayısına göre sınırla
    const remainingRequests = MAX_SUBREQUESTS - subrequestsUsed
    const MAX_SEQ_WALK = Math.min(remainingRequests, 20) // Maksimum 20 sayfa kontrol et
    
    let current = Math.max(candidate, 2)
    
    for (let next = current + 1; next <= current + MAX_SEQ_WALK; next++) {
      if (subrequestsUsed >= MAX_SUBREQUESTS) {
        console.log(`Subrequest limit reached (${MAX_SUBREQUESTS}), stopping at page ${candidate}`)
        break
      }
      
      try {
        const testUrl = buildPageUrl(normalizedBase, next)
        const testHtml = await fetchHtml(testUrl)
        subrequestsUsed++
        
        const items = parseEntriesFromHTML(testHtml, 1)
        
        if (items.length === 0) {
          // Sayfa var ama entry yok => son dolu sayfa candidate
          return next - 1
        }
        
        candidate = next
      } catch (e) {
        // 404/403 vb: daha ileri yok
        return candidate
      }
    }
    
    return candidate
  } catch (error) {
    console.error('Last page discovery error:', error)
    throw error
  }
}

/**
 * Tüm sayfaları çekip entry'leri birleştirir
 * Subrequest limiti için optimize edilmiş: maksimum 40 subrequest (son sayfa tespiti için 8-10, scraping için 30)
 */
async function scrapeAllPages(baseUrl, slug, id, lastPage) {
  const allEntries = []
  const entryIdSet = new Set() // Duplicate entry'leri önlemek için
  const normalizedBase = normalizeBaseUrl(baseUrl)
  
  // Cloudflare Workers subrequest limiti: 50
  // Son sayfa tespiti için ~8-10 kullandık, scraping için ~40 bırakıyoruz
  const MAX_SUBREQUESTS_FOR_SCRAPING = 40
  const MAX_PAGES = Math.min(lastPage, MAX_SUBREQUESTS_FOR_SCRAPING)
  const pagesToScrape = MAX_PAGES
  
  console.log(`Scraping ${pagesToScrape} pages from ${normalizedBase} (limited to prevent subrequest limit)`)
  
  for (let p = 1; p <= pagesToScrape; p++) {
    try {
      const pageUrl = buildPageUrl(normalizedBase, p)
      console.log(`Fetching page ${p}: ${pageUrl}`)
      
      const html = await fetchHtml(pageUrl)
      const entries = parseEntriesFromHTML(html, 10000) // Get ALL entries from page (very high limit)
      
      console.log(`Page ${p}: Parsed ${entries.length} entries from HTML`)
      
      // Python mantığı: all_entries.extend(items) - Direkt ekle, duplicate kontrolü YOK
      // Çünkü her sayfada farklı entry'ler var, duplicate olmaz
      const entriesBefore = allEntries.length
      
      // Pinned entry sadece ilk sayfada olmalı
      if (p === 1) {
        // İlk sayfa: Tüm entry'leri ekle (pinned dahil)
        for (const entry of entries) {
          entry.order = allEntries.length
          allEntries.push(entry)
        }
      } else {
        // Diğer sayfalar: Pinned entry'leri atla, sadece normal entry'leri ekle
        for (const entry of entries) {
          if (entry.id !== 'pinned') {
            entry.order = allEntries.length
            allEntries.push(entry)
          }
        }
      }
      
      const entriesAdded = allEntries.length - entriesBefore
      console.log(`Page ${p}: Added ${entriesAdded} entries (total: ${allEntries.length})`)
      
      // Python mantığı: Eğer sayfa boşsa (entry yoksa) dur
      if (entries.length === 0 && p > 1) {
        console.log(`Page ${p} has no entries, stopping (last full page: ${p - 1})`)
        break
      }
    } catch (error) {
      console.error(`Page ${p} failed: ${error.message}`)
      if (p === 1) {
        // İlk sayfa başarısız olursa durdur
        throw error
      }
      // Python mantığı: Sayfa hatası varsa dur (son sayfa bulundu)
      console.log(`Page ${p} error, stopping (last successful page: ${p - 1})`)
      break
    }
  }
  
  if (lastPage > MAX_PAGES) {
    console.log(`Warning: Topic has ${lastPage} pages but only scraped first ${MAX_PAGES} pages due to subrequest limit`)
  }
  
  console.log(`Total unique entries collected: ${allEntries.length}`)
  return allEntries
}

/**
 * Entry'leri Cloudflare Workers AI ile özetler
 */
async function summarizeEntries(entries, env) {
  if (!entries || entries.length === 0) {
    return 'No entries to summarize.'
  }
  
  // Entry'leri birleştir (ilk 100 entry'yi al, çok uzun olmasın)
  const entryTexts = entries.slice(0, 100).map((e, idx) => `Entry ${idx + 1}:\n${e.content}`).join('\n\n---\n\n')
  
  // AI varsa kullan
  if (env && env.AI) {
    try {
      console.log('Attempting AI summarization...')
      const prompt = `Şu Ekşi Sözlük entry'lerini Türkçe olarak özetle. Önemli noktaları, ana konuları ve genel görüşleri belirt. Özet en az 200 kelime olsun:\n\n${entryTexts.substring(0, 15000)}`
      
      const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000
      })
      
      console.log('AI response received:', response)
      
      if (response && response.response) {
        return response.response
      }
      
      // Alternatif response format kontrolü
      if (response && typeof response === 'string') {
        return response
      }
      
      if (response && response.choices && response.choices[0] && response.choices[0].message) {
        return response.choices[0].message.content
      }
    } catch (error) {
      console.error('AI summarization error:', error)
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        envAI: !!env?.AI
      })
      // Fallback to simple summary
    }
  } else {
    console.log('AI not available, using fallback summary')
  }
  
  // Fallback: Geliştirilmiş özet
  const totalEntries = entries.length
  const sampleEntries = entries.slice(0, 3).map((e, idx) => `${idx + 1}. ${e.content.substring(0, 200)}${e.content.length > 200 ? '...' : ''}`).join('\n\n')
  
  const summary = `Toplam ${totalEntries} entry bulundu.\n\nİlk birkaç entry örneği:\n\n${sampleEntries}`
  
  return summary
}

