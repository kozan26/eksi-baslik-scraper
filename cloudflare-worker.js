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
 * HTML'den entry'leri parse eder (Python'daki _extract_entries() mantığı)
 * CSS selector: #pinned-entry .content, #entry-item-list .content
 */
function parseEntriesFromHTML(html, limit = 50) {
  const entries = []
  
  try {
    if (!html || html.length < 100) {
      console.error('HTML too short or empty')
      return []
    }
    
    // 1. #pinned-entry .content - Pinned entry içindeki .content
    const pinnedContainerMatch = html.match(/<[^>]*id=["']pinned-entry["'][^>]*>([\s\S]*?)<\/[^>]+>/i)
    if (pinnedContainerMatch) {
      const pinnedContainer = pinnedContainerMatch[1]
      const pinnedContentRegex = /<[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi
      let pinnedContentMatch
      pinnedContentRegex.lastIndex = 0
      
      while ((pinnedContentMatch = pinnedContentRegex.exec(pinnedContainer)) !== null) {
        const content = cleanEntryText(pinnedContentMatch[1])
        if (content && content.trim().length > 0) {
          entries.push({
            id: 'pinned',
            order: 0,
            content,
          })
          break // Sadece ilk pinned content'i al
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
    
    // Entry-item-list içindeki tüm .content elementlerini bul
    const contentRegex = /<[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi
    const foundEntries = []
    let contentMatch
    contentRegex.lastIndex = 0
    
    let entryOrder = 0
    while ((contentMatch = contentRegex.exec(entryListContainer)) !== null && foundEntries.length < limit + 20) {
      const content = cleanEntryText(contentMatch[1])
      if (!content || content.trim().length < 3) {
        continue
      }
      
      const contentStart = contentMatch.index
      
      // Entry ID'yi bul - content'in önündeki en yakın entry-ID'yi bul
      const beforeContent = entryListContainer.substring(0, contentStart)
      const entryIdMatch = beforeContent.match(/id=["']entry-(\d+)["'][^>]*/gi)
      let entryId = null
      
      if (entryIdMatch && entryIdMatch.length > 0) {
        const lastMatch = entryIdMatch[entryIdMatch.length - 1]
        const idMatch = lastMatch.match(/entry-(\d+)/)
        if (idMatch) {
          entryId = idMatch[1]
        }
      }
      
      // Eğer önünde entry ID bulamazsa, content'ten sonraki ilk entry ID'yi dene
      if (!entryId) {
        const afterContent = entryListContainer.substring(contentStart + contentMatch[0].length, contentStart + contentMatch[0].length + 2000)
        const nextEntryMatch = afterContent.match(/id=["']entry-(\d+)["'][^>]*/i)
        if (nextEntryMatch) {
          const idMatch = nextEntryMatch[0].match(/entry-(\d+)/)
          if (idMatch) {
            entryId = idMatch[1]
          }
        }
      }
      
      // Entry ID bulunamadıysa, order kullan
      if (!entryId) {
        entryId = `order-${entryOrder}`
      }
      
      // Duplicate kontrolü
      const existing = foundEntries.find(e => e.id === entryId)
      if (!existing) {
        foundEntries.push({
          id: entryId,
          content,
          position: contentStart
        })
        entryOrder++
      }
    }
    
    // Position'a göre sırala (HTML'deki sırayı koru)
    foundEntries.sort((a, b) => a.position - b.position)
    
    // Order'ı ata ve ekle
    foundEntries.forEach((entry) => {
      entries.push({
        ...entry,
        order: entries.length
      })
    })
    
    console.log(`Parsed ${entries.length} entries (${foundEntries.length} regular, ${entries.length - foundEntries.length} pinned)`)
    
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
 */
async function discoverLastPage(baseUrl) {
  const normalizedBase = normalizeBaseUrl(baseUrl)
  
  try {
    // 1. p=1'de link taraması
    const page1Url = buildPageUrl(normalizedBase, 1)
    const html1 = await fetchHtml(page1Url)
    const m1 = maxPFromLinks(normalizedBase, html1)
    
    // 2. p=2'de link taraması (varsa)
    let m2 = m1
    if (m1 < 3) {
      try {
        const page2Url = buildPageUrl(normalizedBase, 2)
        const html2 = await fetchHtml(page2Url)
        m2 = Math.max(m1, maxPFromLinks(normalizedBase, html2))
      } catch (e) {
        // Ignore errors for page 2
      }
    }
    
    let candidate = Math.max(m1, m2)
    
    if (candidate >= 3) {
      return candidate
    }
    
    // 3. Sıralı yüryüş: 3, 4, 5... boş/404 olana kadar
    const MAX_SEQ_WALK = 100
    let current = Math.max(candidate, 2)
    
    for (let next = current + 1; next <= current + MAX_SEQ_WALK; next++) {
      try {
        const testUrl = buildPageUrl(normalizedBase, next)
        const testHtml = await fetchHtml(testUrl)
        
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
 */
async function scrapeAllPages(baseUrl, slug, id, lastPage) {
  const allEntries = []
  const normalizedBase = normalizeBaseUrl(baseUrl)
  
  // Maksimum sayfa limiti (Worker timeout için)
  const MAX_PAGES = 50
  const pagesToScrape = Math.min(lastPage, MAX_PAGES)
  
  console.log(`Scraping ${pagesToScrape} pages from ${normalizedBase}`)
  
  for (let p = 1; p <= pagesToScrape; p++) {
    try {
      const pageUrl = buildPageUrl(normalizedBase, p)
      const html = await fetchHtml(pageUrl)
      const entries = parseEntriesFromHTML(html, 1000) // Get all entries from page
      
      console.log(`Page ${p}: Found ${entries.length} entries`)
      allEntries.push(...entries)
    } catch (error) {
      console.error(`Page ${p} failed: ${error.message}`)
      if (p === 1) {
        // İlk sayfa başarısız olursa durdur
        throw error
      }
      // Diğer sayfalar için devam et
      continue
    }
  }
  
  return allEntries
}

/**
 * Entry'leri Cloudflare Workers AI ile özetler
 */
async function summarizeEntries(entries, env) {
  if (!entries || entries.length === 0) {
    return 'No entries to summarize.'
  }
  
  // Entry'leri birleştir (ilk 50 entry'yi al, çok uzun olmasın)
  const entryTexts = entries.slice(0, 50).map(e => e.content).join('\n\n---\n\n')
  
  // AI varsa kullan
  if (env && env.AI) {
    try {
      const prompt = `Şu Ekşi Sözlük entry'lerini Türkçe olarak özetle. Önemli noktaları ve ana konuları belirt:\n\n${entryTexts.substring(0, 15000)}`
      
      const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500
      })
      
      if (response && response.response) {
        return response.response
      }
    } catch (error) {
      console.error('AI summarization error:', error)
      // Fallback to simple summary
    }
  }
  
  // Fallback: Basit özet
  const totalEntries = entries.length
  const firstEntry = entries[0]?.content || ''
  const summary = `Toplam ${totalEntries} entry bulundu.\n\nİlk entry:\n${firstEntry.substring(0, 500)}${firstEntry.length > 500 ? '...' : ''}`
  
  return summary
}

