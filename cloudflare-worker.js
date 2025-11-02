/**
 * Cloudflare Worker - Ekşi Sözlük Gündem Scraper
 * 
 * Deployment:
 * 1. wrangler publish (veya Cloudflare Dashboard'dan deploy et)
 * 2. Worker URL'ini frontend'de VITE_WORKER_URL olarak ayarla
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
    
    // Route: /api/gundem
    if (url.pathname === '/api/gundem') {
      try {
        const gundem = await scrapeEksisozluk()
        
        return new Response(JSON.stringify({
          success: true,
          items: gundem,
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

    // Route: /api/topic/:slug--:id - Başlığın entry'lerini çek
    if (url.pathname.startsWith('/api/topic/')) {
      try {
        const pathParts = url.pathname.replace('/api/topic/', '').split('--')
        if (pathParts.length < 2) {
          throw new Error('Geçersiz başlık formatı')
        }
        
        const slug = pathParts[0]
        const id = pathParts[1].split('?')[0] // Query string'i temizle
        const limit = parseInt(url.searchParams.get('limit') || '50', 10) // Varsayılan 50
        const minLimit = Math.max(limit, 10) // En az 10 entry
        
        const entries = await scrapeTopicEntries(slug, id, minLimit)
        
        return new Response(JSON.stringify({
          success: true,
          topic: {
            slug,
            id,
            url: `/${slug}--${id}`
          },
          entries,
          count: entries.length,
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

    // Route: /api/scrape-and-summarize - Scrape all pages and summarize with AI
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
          throw new Error('Invalid Ekşi Sözlük URL format')
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
          // Test the first page to see what HTML we're getting
          let testHtml = ''
          let fetchError = null
          let fetchStatus = null
          
          try {
            const testUrl = buildPageUrl(normalizeBaseUrl(baseUrl), 1)
            console.log('Testing URL:', testUrl)
            
            const testResponse = await fetch(testUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
              }
            })
            
            fetchStatus = testResponse.status
            console.log('Fetch status:', fetchStatus)
            
            if (!testResponse.ok) {
              fetchError = `HTTP ${fetchStatus}`
            } else {
              testHtml = await testResponse.text()
              console.log('HTML fetched, length:', testHtml.length)
            }
          } catch (e) {
            fetchError = e.message
            console.error('Fetch error:', e)
          }
          
          const isChallenge = testHtml ? /cloudflare|challenge|checking/i.test(testHtml) : false
          const hasEntryIds = testHtml ? /id=["']entry-\d+["']/i.test(testHtml) : false
          const hasEntryList = testHtml ? /id=["']entry-item-list["']/i.test(testHtml) : false
          
          let errorMsg = 'No entries found. '
          
          if (testHtml.length === 0) {
            errorMsg += `HTML çekilemedi (length=0). `
            if (fetchError) {
              errorMsg += `Fetch hatası: ${fetchError}. `
            }
            if (fetchStatus) {
              errorMsg += `HTTP Status: ${fetchStatus}. `
            }
            errorMsg += `Ekşi Sözlük Worker'dan gelen istekleri engelliyor olabilir. Cloudflare koruması nedeniyle bu normal olabilir.`
          } else {
            errorMsg += `Debug: HTML length=${testHtml.length}, isCloudflareChallenge=${isChallenge}, hasEntryIds=${hasEntryIds}, hasEntryList=${hasEntryList}.`
          }
          
          return new Response(JSON.stringify({
            success: false,
            error: errorMsg + ' Please try the /api/test-parse endpoint with your URL to see detailed HTML structure.',
            debug: {
              url: baseUrl,
              lastPage,
              slug,
              id,
              testPageHtmlLength: testHtml.length,
              fetchStatus,
              fetchError,
              isCloudflareChallenge: isChallenge,
              hasEntryIds,
              hasEntryList,
              testEndpoint: `${new URL(request.url).origin}/api/test-parse?url=${encodeURIComponent(baseUrl)}`
            }
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

    // Route: /api/test-parse - Test entry parsing with a URL
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

        const response = await fetch(baseUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const html = await response.text()
        
        // Check if we got Cloudflare challenge page instead of actual content
        const isCloudflareChallenge = /cloudflare|challenge|checking your browser/i.test(html) || html.length < 10000
        
        // Test parsing
        const entries = parseEntriesFromHTML(html, 10)
        
        // Check for key HTML elements
        const hasPinnedEntry = /id=["']pinned-entry["']/i.test(html)
        const hasEntryList = /id=["']entry-item-list["']/i.test(html)
        const entryIdMatches = html.match(/id=["']entry-(\d+)["']/gi) || []
        const contentMatches = html.match(/class=["'][^"']*content[^"']*["']/gi) || []
        
        // Get entry-item-list snippet
        const entryListSnippet = html.match(/<[^>]*id=["']entry-item-list["'][^>]*>[\s\S]{0,2000}/i)?.[0] || 'Not found'
        
        // Get first entry snippet
        const firstEntrySnippet = html.match(/<li[^>]*id=["']entry-\d+["'][^>]*>[\s\S]{0,2000}/i)?.[0] || 'Not found'
        
        // Check if HTML looks like actual Ekşi Sözlük page
        const looksLikeEksi = /eksisozluk|entry-item|topic-title/i.test(html)

        return new Response(JSON.stringify({
          success: true,
          url: baseUrl,
          htmlLength: html.length,
          isCloudflareChallenge,
          looksLikeEksi,
          hasPinnedEntry,
          hasEntryList,
          entryIdCount: entryIdMatches.length,
          contentClassCount: contentMatches.length,
          parsedEntries: entries.length,
          entries: entries.slice(0, 3), // First 3 entries as sample
          sampleHtml: {
            first1000: html.substring(0, 1000),
            last1000: html.substring(Math.max(0, html.length - 1000)),
            entryItemListSnippet: entryListSnippet.substring(0, 2000),
            firstEntryMatch: firstEntrySnippet.substring(0, 2000),
            // Try to find where entry-item-list might be
            searchForEntryList: {
              ulWithId: html.match(/<ul[^>]*id=["'][^"']*entry[^"']*["'][^>]*>/i)?.[0] || 'Not found',
              divWithId: html.match(/<div[^>]*id=["'][^"']*entry[^"']*["'][^>]*>/i)?.[0] || 'Not found'
            }
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

    // Route: /api/test-entry - Entry parsing test
    if (url.pathname === '/api/test-entry') {
      try {
        const testUrl = url.searchParams.get('url') || 'https://eksisozluk.com/2-kasim-2025-besiktas-fenerbahce-maci--8000065'
        const response = await fetch(testUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })
        
        const html = await response.text()
        
        // Entry pattern'leri test et
        const entryMatches = html.match(/<li[^>]*id=["']entry-(\d+)["'][^>]*>/gi) || []
        const entryCount = entryMatches.length
        
        // Content div'lerini say
        const contentDivs = html.match(/<div[^>]*class=["'][^"']*content["'][^"']*["'][^>]*>/gi) || []
        const contentCount = contentDivs.length
        
        // İlk 3 entry'nin HTML'ini al
        const entryPattern = /<li[^>]*id=["']entry-(\d+)["'][^>]*>([\s\S]{0,3000})/gi
        const entrySamples = []
        let match
        let count = 0
        while ((match = entryPattern.exec(html)) !== null && count < 3) {
          entrySamples.push({
            id: match[1],
            html: match[0].substring(0, 2000)
          })
          count++
        }
        
        return new Response(JSON.stringify({
          success: true,
          entryCount,
          contentCount,
          entrySamples,
          htmlLength: html.length
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

    // Route: /api/debug (HTML'in gelip gelmediğini test et)
    if (url.pathname === '/api/debug') {
      try {
        const response = await fetch('https://eksisozluk.com/basliklar/gundem', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })
        
        const html = await response.text()
        const linkCount = (html.match(/<a[^>]*href=["']\/([^"']+?)--(\d+)["'][^>]*>([^<]+?)<\/a>/gi) || []).length
        const mobileIndexFound = html.includes('mobile-index')
        const topicListFound = html.includes('topic-list')
        
        // topic-list bölümünü çıkar
        const topicListMatch = html.match(/<ul[^>]*class=["'][^"']*topic-list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)
        const topicListContent = topicListMatch ? topicListMatch[0].substring(0, 2000) : 'Not found'
        
        // İlk birkaç <li> elementini bul
        const liMatches = html.match(/<li[^>]*>[\s\S]{0,500}?<\/li>/gi) || []
        const sampleLiItems = liMatches.slice(0, 3).join('\n---\n')
        
        return new Response(JSON.stringify({
          success: true,
          htmlReceived: html.length > 0,
          htmlLength: html.length,
          linkCount,
          mobileIndexFound,
          topicListFound,
          topicListSample: topicListContent,
          sampleLiItems: sampleLiItems.substring(0, 1500),
          status: response.status
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
      message: 'Ekşi Sözlük Gündem API',
      endpoints: {
        '/api/gundem': 'Get trending topics (gündem)'
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  },
}

/**
 * Ekşi Sözlük ana sayfasını scrape eder ve gündem başlıklarını çıkarır
 */
async function scrapeEksisozluk() {
  try {
    // Ekşi Sözlük gündem sayfasını direkt çek
    // Önce /basliklar/gundem deneyelim, yoksa ana sayfadan gündem bölümünü çıkaralım
    let response = await fetch('https://eksisozluk.com/basliklar/gundem', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })

    // Eğer gündem sayfası yoksa, ana sayfayı dene
    if (!response.ok || response.status === 404) {
      response = await fetch('https://eksisozluk.com', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      })
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const html = await response.text()
    
    // HTML'i parse et ve gündem başlıklarını çıkar
    const items = parseGundemFromHTML(html)
    
    return items
  } catch (error) {
    console.error('Scraping error:', error)
    throw error
  }
}

/**
 * HTML'den gündem başlıklarını parse eder
 * mobile-index div'inden verileri çıkarır
 * Format: "başlık entry_sayısı" örn: "beşiktaş fenerbahçe maçı 345"
 */
function parseGundemFromHTML(html) {
  const items = []
  
  try {
    // Öncelik 1: Desktop gündem listesi (en güvenilir)
    // Format: <ul class="topic-list"> içinde <li><a href="/baslik--id?a=popular">başlık <small>sayı</small></a></li>
    const topicListMatch = html.match(/<ul[^>]*class=["'][^"']*topic-list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)
    
    if (topicListMatch) {
      const listContent = topicListMatch[1]
      
      // <li> taglerini bul
      const listItems = listContent.match(/<li[^>]*>([\s\S]*?)<\/li>/gi)
      
      if (listItems && listItems.length > 0) {
        for (const li of listItems) {
          // Sponsored item'ları atla
          if (li.includes('sponsored') || li.includes('display:none')) {
            continue
          }
          
          // <a> tagini bul - format: <a href="/baslik--id?a=popular">başlık <small>sayı</small></a>
          const linkMatch = li.match(/<a[^>]*href=["']\/([^"']+?)--(\d+)(?:[^"']*?)["'][^>]*>([\s\S]*?)<\/a>/is)
          
          if (linkMatch) {
            const slug = linkMatch[1]
            const id = linkMatch[2]
            const linkContent = linkMatch[3]
            
            // Başlığı çıkar - <small> tag'ini kaldır
            let title = linkContent.replace(/<small[^>]*>[\s\S]*?<\/small>/gi, '').trim()
            
            // HTML entities'leri decode et
            title = title
              .replace(/&#x27;/g, "'")
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&#39;/g, "'")
              .replace(/&apos;/g, "'")
            
            // Entry sayısını <small> tag'inden çıkar
            const smallMatch = linkContent.match(/<small[^>]*>(\d+)<\/small>/i)
            const entryCount = smallMatch ? parseInt(smallMatch[1], 10) : null
            
            // Skip sabit başlıklar (sözlük kuralları, kariyer, vb.)
            const skipSlugs = ['sozluk-kurallari', 'sozluk-is-ilanlari', 'kariyer']
            
            if (title && title.length > 3 && !skipSlugs.includes(slug.toLowerCase())) {
              items.push({
                title,
                id,
                slug,
                url: `/${slug}--${id}`,
                entryCount
              })
            }
          }
        }
        
        if (items.length > 0) {
          return items.slice(0, 30)
        }
      }
    }

    // Öncelik 2: Mobile gündem (mobile-index div)
    // mobile-index div'ini bul
    const mobileIndexMatch = html.match(/<div[^>]*id=["']mobile-index["'][^>]*data-caption=["']([^"']*)["'][^>]*>([\s\S]*?)<\/div>/i)
    
    if (mobileIndexMatch) {
      const content = mobileIndexMatch[2]
      
      // Mobile index içindeki linkleri bul
      const mobileLinks = content.match(/<a[^>]*href=["']\/([^"']+?)--(\d+)["'][^>]*>([^<]+?)<\/a>/gi)
      
      if (mobileLinks) {
        const skipSlugs = ['sozluk-kurallari', 'sozluk-is-ilanlari']
        
        for (const link of mobileLinks) {
          const linkMatch = link.match(/<a[^>]*href=["']\/([^"']+?)--(\d+)["'][^>]*>([^<]+?)<\/a>/i)
          if (linkMatch) {
            const slug = linkMatch[1]
            const id = linkMatch[2]
            const title = linkMatch[3].trim()
            
            // Entry sayısını içerikten bul
            const entryMatch = content.match(new RegExp(`/${slug}--${id}[^>]*>([^<]*?)<(?:[^>]*?>){0,10}[^<]*?(\\d+)\\s*entry`, 'i'))
            const entryCount = entryMatch ? parseInt(entryMatch[2], 10) : null
            
            // Skip sabit başlıklar
            if (!skipSlugs.includes(slug.toLowerCase()) && title.length > 2) {
              items.push({
                title,
                id,
                slug,
                url: `/${slug}--${id}`,
                entryCount
              })
            }
          }
        }
        
        if (items.length > 0) {
          return items.slice(0, 30)
        }
      }
      
      // Alternatif: Metni satırlara böl ve parse et
      const lines = content.split(/\s{2,}|\n/).filter(line => line.trim())
      const skipWords = ['gündem', 'anket', 'ilişkiler', 'siyaset', 'spor', 'ekşi sözlük', 
                         'yetişkin', 'gündeminizi', 'kişiselleştirin', 'kariyer', 'kuralları']
      
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.length < 3) continue
        
        // Skip words kontrolü
        const shouldSkip = skipWords.some(word => 
          trimmed.toLowerCase().includes(word.toLowerCase())
        )
        if (shouldSkip) continue
        
        // Entry sayısını bul: "başlık 345" formatı
        const entryMatch = trimmed.match(/^(.+?)\s+(\d+)$/)
        
        if (entryMatch) {
          const title = entryMatch[1].trim()
          const entryCount = parseInt(entryMatch[2], 10)
          
          // HTML'deki linklerden ID'yi bul
          const linkInHTML = html.match(new RegExp(`<a[^>]*href=["']/([^"']*?)--(\\d+)["'][^>]*>${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))
          
          if (linkInHTML) {
            items.push({
              title,
              entryCount,
              id: linkInHTML[2],
              slug: linkInHTML[1],
              url: `/${linkInHTML[1]}--${linkInHTML[2]}`
            })
          }
        }
      }
    }

    // Öncelik 3: Tüm başlık linklerini bul ve filtrele (en geniş yöntem)
    const allLinks = html.match(/<a[^>]*href=["']\/([^"']+?)--(\d+)["'][^>]*>([^<]+?)<\/a>/gi)
    const skipSlugs = ['sozluk-kurallari', 'sozluk-is-ilanlari', 'kariyer', 'iletisim', 'hakkimizda']
    const skipWords = ['sözlük kuralları', 'kariyer', 'iletişim', 'hakkımızda', 'giriş', 'kayıt ol']
    
    if (allLinks) {
      // Eğer henüz item yoksa, daha geniş bir filtreleme yap
      const targetCount = items.length === 0 ? 30 : 10
      
      for (const link of allLinks) {
        const linkMatch = link.match(/<a[^>]*href=["']\/([^"']+?)--(\d+)["'][^>]*>([^<]+?)<\/a>/i)
        if (linkMatch) {
          const slug = linkMatch[1]
          const id = linkMatch[2]
          const title = linkMatch[3].trim()
          
          // Gündem sayfasındaki başlıkları bul (genellikle belirli class'larda)
          const linkIndex = html.indexOf(link)
          const context = html.substring(Math.max(0, linkIndex - 300), Math.min(html.length, linkIndex + 300))
          const isInGundemList = context.match(/gundem|trending|popular|hot|başlıklar/i)
          
          // Basit filtreleme - sabit başlıkları ve çok kısa başlıkları atla
          const shouldSkip = skipSlugs.includes(slug.toLowerCase()) || 
                             skipWords.some(word => title.toLowerCase().includes(word.toLowerCase())) ||
                             title.length < 4 ||
                             title.match(/^(ekşi|sözlük|kurallar|kariyer)/i)
          
          // Gündem listesi içindeyse veya henüz az item varsa ekle
          if (!shouldSkip && (isInGundemList || items.length < targetCount || title.length > 10)) {
            const entryMatch = context.match(/(\d+)\s*entry/i)
            const entryCount = entryMatch ? parseInt(entryMatch[1], 10) : null
            
            // Duplicate kontrolü
            const isDuplicate = items.some(item => 
              item.id === id || 
              item.slug === slug || 
              item.title.toLowerCase() === title.toLowerCase()
            )
            
            if (!isDuplicate) {
              items.push({
                title,
                id,
                slug,
                url: `/${slug}--${id}`,
                entryCount
              })
              
              if (items.length >= 30) break
            }
          }
        }
      }
    }

    // Duplicate'leri temizle (slug ve ID'ye göre)
    const uniqueItems = []
    const seenIds = new Set()
    const seenSlugs = new Set()
    
    for (const item of items) {
      // ID varsa ID'ye göre, yoksa slug'a göre kontrol et
      const key = item.id || item.slug || item.title.toLowerCase()
      
      if (item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id)
        uniqueItems.push(item)
      } else if (item.slug && !seenSlugs.has(item.slug)) {
        seenSlugs.add(item.slug)
        uniqueItems.push(item)
      } else if (!item.id && !item.slug && !seenIds.has(key)) {
        seenIds.add(key)
        uniqueItems.push(item)
      }
    }

    // İlk 30'u al ve en az 3 karakterlik başlıkları filtrele
    return uniqueItems
      .filter(item => item.title && item.title.length >= 3)
      .slice(0, 30)
    
  } catch (error) {
    console.error('Parse error:', error)
    return []
  }
}

/**
 * Desktop versiyondaki gündem listesini parse eder
 */
function parseDesktopGundem(html, linkMap = new Map()) {
  const items = []
  
  // <li> taglerini bul
  const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let liMatch
  
  while ((liMatch = liPattern.exec(html)) !== null) {
    const liContent = liMatch[1]
    
    // <a> tagini bul
    const linkMatch = liContent.match(/<a[^>]*href=["']\/([^"']+?)--(\d+)["'][^>]*>([^<]+?)<\/a>/i)
    
    if (linkMatch) {
      const title = linkMatch[3].trim()
      const id = linkMatch[2]
      const slug = linkMatch[1]
      
      // Entry sayısını bul
      const entryMatch = liContent.match(/(\d+)\s*entry/i)
      const entryCount = entryMatch ? parseInt(entryMatch[1], 10) : null
      
      items.push({
        title,
        id,
        url: `/${slug}--${id}`,
        entryCount: entryCount || linkMap.get(title.toLowerCase())?.entryCount || null
      })
    }
  }
  
  return items.length > 0 ? items : Array.from(linkMap.values()).slice(0, 30)
}

/**
 * Bir başlığın entry'lerini scrape eder
 * @param {string} slug - Başlık slug'ı
 * @param {string} id - Başlık ID'si
 * @param {number} limit - Maksimum entry sayısı (varsayılan: 20)
 */
async function scrapeTopicEntries(slug, id, limit = 50) {
  try {
    // Başlık sayfasını çek
    const url = `https://eksisozluk.com/${slug}--${id}`
    console.log('Fetching URL:', url)
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://eksisozluk.com/'
      }
    })

    console.log('Response status:', response.status)
    console.log('Response headers:', Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText.substring(0, 200)}`)
    }

    const html = await response.text()
    console.log('HTML fetched, length:', html.length)
    
    if (!html || html.length === 0) {
      throw new Error('Empty HTML response received from Ekşi Sözlük')
    }
    
    // Entry'leri parse et
    const entries = parseEntriesFromHTML(html, limit)
    console.log('Parsed entries:', entries.length)
    
    return entries
  } catch (error) {
    console.error('Entry scraping error:', error)
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      url: `https://eksisozluk.com/${slug}--${id}`
    })
    throw error
  }
}

/**
 * HTML'den entry'leri parse eder
 * Python scraper'dan ilham alınarak: #pinned-entry .content ve #entry-item-list .content
 */
function parseEntriesFromHTML(html, limit = 50) {
  const entries = []
  
  try {
    if (!html || html.length < 100) {
      console.error('HTML too short or empty')
      return []
    }
    
    // Python mantığını direkt taklit et: soup.select("#pinned-entry .content, #entry-item-list .content")
    // Basit yaklaşım: Her iki container içindeki tüm .content elementlerini sırayla bul
    
    // 1. #pinned-entry .content - Pinned entry içindeki .content elementleri
    const pinnedContainerMatch = html.match(/<[^>]*id=["']pinned-entry["'][^>]*>([\s\S]*?)<\/[^>]+>/i)
    if (pinnedContainerMatch) {
      const pinnedContainer = pinnedContainerMatch[1]
      // Pinned container içindeki tüm .content elementlerini bul (Python gibi)
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
            author: parseEntryAuthor(pinnedContainer) || 'Bilinmeyen',
            date: parseEntryDate(pinnedContainer),
            favoriteCount: parseEntryFavCount(pinnedContainer),
            entryUrl: null
          })
          break // Sadece ilk pinned content'i al (genelde bir tane olur)
        }
      }
    }
    
    // 2. #entry-item-list .content - Entry list içindeki tüm .content elementleri
    // Önce entry-item-list container'ını bul (farklı tag türlerini dene)
    let entryListContainer = null
    let entryListMatch = null
    
    // Önce <ul id="entry-item-list"> dene (en yaygın)
    entryListMatch = html.match(/<ul[^>]*id=["']entry-item-list["'][^>]*>([\s\S]*?)<\/ul>/i)
    if (entryListMatch) {
      entryListContainer = entryListMatch[1]
      console.log('Found entry-item-list (ul)')
    } else {
      // <div id="entry-item-list"> dene
      entryListMatch = html.match(/<div[^>]*id=["']entry-item-list["'][^>]*>([\s\S]*?)<\/div>/i)
      if (entryListMatch) {
        entryListContainer = entryListMatch[1]
        console.log('Found entry-item-list (div)')
      } else {
        // Herhangi bir tag dene
        entryListMatch = html.match(/<[^>]*id=["']entry-item-list["'][^>]*>([\s\S]*?)<\/[^>]+>/i)
        if (entryListMatch) {
          entryListContainer = entryListMatch[1]
          console.log('Found entry-item-list (any tag)')
        } else {
          // Bulamazsa, tüm HTML'de ara (fallback)
          entryListContainer = html
          console.log('entry-item-list not found, searching entire HTML')
        }
      }
    }
    
    // Entry-item-list içindeki tüm .content elementlerini bul (Python'daki gibi direkt)
    // Python'da entry ID'sine bakmıyor, sadece content'leri sırayla alıyor
    console.log(`entry-item-list container length: ${entryListContainer.length}`)
    
    // Önce content class'ını ara (farklı pattern'lerle)
    const contentRegex1 = /<[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi
    const contentRegex2 = /<[^>]*class=["']([^"']*\bcontent\b[^"']*)["'][^>]*>([\s\S]*?)<\/[^>]+>/gi
    
    // Test: content class'ı var mı?
    const contentTest = entryListContainer.match(/class=["'][^"']*content[^"']*["']/gi)
    console.log(`Content class matches found: ${contentTest ? contentTest.length : 0}`)
    
    const foundEntries = []
    let contentMatch
    contentRegex1.lastIndex = 0
    
    let entryOrder = 0
    while ((contentMatch = contentRegex1.exec(entryListContainer)) !== null && foundEntries.length < limit + 20) {
      const content = cleanEntryText(contentMatch[1])
      if (!content || content.trim().length < 3) {
        continue
      }
      
      const contentStart = contentMatch.index
      
      // Entry ID'yi bul - farklı yöntemler dene
      let entryId = null
      let entryHtml = ''
      
      // Yöntem 1: Content'in önündeki en yakın entry-ID'yi bul
      const beforeContent = entryListContainer.substring(0, contentStart)
      const entryIdMatch = beforeContent.match(/id=["']entry-(\d+)["'][^>]*/gi)
      
      if (entryIdMatch && entryIdMatch.length > 0) {
        const lastMatch = entryIdMatch[entryIdMatch.length - 1]
        const idMatch = lastMatch.match(/entry-(\d+)/)
        if (idMatch) {
          entryId = idMatch[1]
        }
      }
      
      // Yöntem 2: Content'ten sonraki ilk entry ID'yi dene
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
      
      // Yöntem 3: Content'in bulunduğu li/div elementi içinde entry ID ara
      if (!entryId) {
        // Content'in başından geriye doğru bir li veya div elementi bul
        const beforeContentSnippet = entryListContainer.substring(Math.max(0, contentStart - 5000), contentStart)
        const liMatch = beforeContentSnippet.match(/<li[^>]*id=["']entry-(\d+)["'][^>]*>[\s\S]{0,5000}?<[^>]*class=["'][^"']*\bcontent\b/i)
        if (liMatch) {
          entryId = liMatch[1]
        }
      }
      
      // Entry ID bulunamadıysa, sadece order kullan (Python gibi - entry ID'ye bakmıyor)
      if (!entryId) {
        entryId = `order-${entryOrder}`
        console.log(`Warning: Entry ID not found for content at position ${contentStart}, using order ID`)
      }
      
      // Entry HTML'ini bul (metadata için)
      if (entryId && entryId.startsWith('entry-')) {
        const entryIdNum = entryId.replace('entry-', '')
        const entryStart = entryListContainer.indexOf(`id="entry-${entryIdNum}"`)
        if (entryStart >= 0) {
          const entryEnd = entryListContainer.indexOf('</li>', entryStart + 100)
          entryHtml = entryListContainer.substring(
            Math.max(0, entryStart - 100), 
            entryEnd > 0 ? entryEnd + 5 : entryStart + 5000
          )
        }
      } else {
        // Entry ID yoksa, content'in etrafındaki HTML'i al
        entryHtml = entryListContainer.substring(
          Math.max(0, contentStart - 500), 
          contentStart + contentMatch[0].length + 500
        )
      }
      
      // Entry ID ile duplicate kontrolü yap
      const existing = foundEntries.find(e => e.id === entryId)
      if (!existing) {
        foundEntries.push({
          id: entryId.startsWith('order-') ? entryId : entryId,
          content,
          author: parseEntryAuthor(entryHtml) || 'Bilinmeyen',
          date: parseEntryDate(entryHtml),
          favoriteCount: parseEntryFavCount(entryHtml),
          entryUrl: entryId.startsWith('order-') ? null : `https://eksisozluk.com/entry/${entryId}`,
          position: contentStart
        })
        entryOrder++
      }
    }
    
    // Eğer hala entry bulunamadıysa, alternatif yöntemler dene
    if (foundEntries.length === 0 && entryListContainer) {
      console.log('No entries found with content class, trying alternative methods...')
      
      // Alternatif 1: Herhangi bir text içeren div/span/p elementi bul
      const textElements = entryListContainer.match(/<(div|span|p)[^>]*>([\s\S]{20,}?)<\/\1>/gi)
      if (textElements) {
        console.log(`Found ${textElements.length} text elements, trying to extract...`)
        for (let i = 0; i < Math.min(textElements.length, limit); i++) {
          const elem = textElements[i]
          const content = cleanEntryText(elem)
          if (content && content.trim().length > 10) {
            foundEntries.push({
              id: `order-${i}`,
              content,
              author: 'Bilinmeyen',
              date: null,
              favoriteCount: 0,
              entryUrl: null,
              position: i
            })
          }
        }
      }
      
      // Alternatif 2: Direkt entry-XXXXX içindeki content'i bul (fallback)
      if (foundEntries.length === 0) {
        console.log('Trying direct entry parsing (fallback)...')
      // Tüm entry-XXXXX ID'lerini bul
      const entryIdPattern = /id=["']entry-(\d+)["']/gi
      const entryIds = []
      let idMatch
      entryIdPattern.lastIndex = 0
      
      while ((idMatch = entryIdPattern.exec(entryListContainer)) !== null && entryIds.length < limit + 10) {
        entryIds.push({
          id: idMatch[1],
          index: idMatch.index
        })
      }
      
      // Her entry ID için content'i bul
      for (let i = 0; i < entryIds.length && foundEntries.length < limit + 10; i++) {
        const entryInfo = entryIds[i]
        const entryId = entryInfo.id
        
        // Entry'nin HTML'ini bul (<li id="entry-XXXXX">...</li>)
        const entryStart = entryInfo.index
        const entryHtmlMatch = entryListContainer.substring(entryStart).match(/<[^>]*id=["']entry-\d+["'][^>]*>([\s\S]{0,50000}?)<\/[^>]+>/i)
        
        if (entryHtmlMatch) {
          const entryHtml = entryHtmlMatch[0]
          // Entry içindeki content'i bul
          const contentMatch = entryHtml.match(/<[^>]*class=["'][^"']*\bcontent\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)
          if (contentMatch) {
            const content = cleanEntryText(contentMatch[1])
            if (content && content.trim().length > 3) {
              foundEntries.push({
                id: entryId,
                content,
                author: parseEntryAuthor(entryHtml) || 'Bilinmeyen',
                date: parseEntryDate(entryHtml),
                favoriteCount: parseEntryFavCount(entryHtml),
                entryUrl: `https://eksisozluk.com/entry/${entryId}`,
                position: entryStart
              })
            }
          }
        }
      }
    }
    
    // Position'a göre sırala (HTML'deki sırayı koru - Python gibi)
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
    
    // Eski kod - artık kullanılmıyor
    /*
    if (false) {
      // Eski kod - yorum satırı
    }
    */
  } catch (error) {
    console.error('Entry parse error:', error)
    console.error('HTML length:', html ? html.length : 0)
    // Debug: Check if entry-item-list exists
    if (html) {
      const hasEntryList = /id=["']entry-item-list["']/i.test(html)
      const hasPinned = /id=["']pinned-entry["']/i.test(html)
      console.error('Has entry-item-list:', hasEntryList, 'Has pinned-entry:', hasPinned)
    }
    return []
  }
}

/**
 * Entry text'ini temizler (Python versiyonu gibi)
 */
function cleanEntryText(htmlContent) {
  if (!htmlContent) return ''
  
  // HTML tag'lerini temizle
  let content = htmlContent
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // <br>, <p> tag'lerini newline'a çevir
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '') // Diğer HTML tag'lerini kaldır
    // HTML entities'leri decode et
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // \r\n'yi \n'ye çevir (Python gibi)
    .replace(/\r\n?/g, '\n')
    // Fazla boşlukları temizle (3+ newline'ı 2'ye indir - Python gibi)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  
  return content
}

/**
 * Entry yazarını HTML'den çıkarır
 */
function parseEntryAuthor(html) {
  const authorMatch = html.match(/<a[^>]*class=["'][^"']*entry-author["'][^"']*["'][^>]*>([^<]+?)<\/a>/i) ||
                      html.match(/id=["']entry-author["'][^>]*>[\s\S]*?<a[^>]*>([^<]+?)<\/a>/i) ||
                      html.match(/<a[^>]*href=["']\/biri\/([^"']+)["'][^>]*>([^<]+?)<\/a>/i) ||
                      html.match(/data-author=["']([^"']+)["']/i)
  return authorMatch ? (authorMatch[2] || authorMatch[1] || '').trim() : null
}

/**
 * Entry tarihini HTML'den çıkarır
 */
function parseEntryDate(html) {
  const dateMatch = html.match(/<a[^>]*class=["'][^"']*entry-date["'][^"']*["'][^>]*>([^<]+?)<\/a>/i) ||
                    html.match(/class=["'][^"']*entry-date["'][^"']*["'][^>]*permalink["'][^>]*>([^<]+?)<\/a>/i) ||
                    html.match(/data-date=["']([^"']+)["']/i) ||
                    html.match(/<time[^>]*>([^<]+?)<\/time>/i)
  return dateMatch ? (dateMatch[1] || dateMatch[2] || '').trim() : null
}

/**
 * Entry fav sayısını HTML'den çıkarır
 */
function parseEntryFavCount(html) {
  const favMatch = html.match(/class=["'][^"']*favorite-count["'][^"']*["'][^>]*>(\d+)/i) ||
                   html.match(/data-favorite-count=["'](\d+)["']/i) ||
                   html.match(/>(\d+)\s*favorite/i) ||
                   html.match(/favorite.*?(\d+)/i)
  return favMatch ? parseInt(favMatch[1], 10) : 0
}

/**
 * Entry ID'sini HTML'den çıkarır
 */
function parseEntryId(html) {
  const idMatch = html.match(/id=["']entry-(\d+)["']/i) ||
                  html.match(/data-id=["'](\d+)["']/i) ||
                  html.match(/href=["']\/entry\/(\d+)["']/i)
  return idMatch ? idMatch[1] : null
}

/**
 * Build page URL with p parameter
 */
function buildPageUrl(baseUrl, page) {
  const url = new URL(baseUrl)
  url.searchParams.set('p', page.toString())
  return url.toString()
}

/**
 * Normalize URL by removing p parameter
 */
function normalizeBaseUrl(url) {
  const urlObj = new URL(url)
  urlObj.searchParams.delete('p')
  return urlObj.toString()
}

/**
 * Find max page number from links in HTML (like Python version)
 */
function maxPFromLinks(baseUrl, html) {
  const baseUrlObj = new URL(baseUrl)
  const basePath = baseUrlObj.pathname
  
  let maxP = 1
  const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi
  let match
  
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      let href = match[1]
      // Make relative URLs absolute
      if (href.startsWith('/')) {
        href = `${baseUrlObj.origin}${href}`
      }
      
      const hrefUrl = new URL(href)
      if (hrefUrl.pathname === basePath && hrefUrl.searchParams.has('p')) {
        const p = parseInt(hrefUrl.searchParams.get('p'), 10)
        if (p > maxP) {
          maxP = p
        }
      }
    } catch (e) {
      // Invalid URL, skip
      continue
    }
  }
  
  return maxP
}

/**
 * Discover last page number (similar to Python version)
 */
async function discoverLastPage(baseUrl) {
  const normalizedBase = normalizeBaseUrl(baseUrl)
  
  const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://eksisozluk.com/'
  }
  
  try {
    // Check page 1
    const page1Url = buildPageUrl(normalizedBase, 1)
    console.log('Discover last page - fetching page 1:', page1Url)
    
    const response1 = await fetch(page1Url, {
      headers: fetchHeaders
    })
    
    console.log('Page 1 response status:', response1.status)
    
    if (!response1.ok) {
      throw new Error(`Page 1 failed with status ${response1.status}`)
    }
    
    const html1 = await response1.text()
    console.log('Page 1 HTML length:', html1.length)
    
    if (!html1 || html1.length === 0) {
      throw new Error('Page 1 returned empty HTML')
    }
    
    const m1 = maxPFromLinks(normalizedBase, html1)
    console.log('Page 1 max page found:', m1)
    
    // Check page 2 if needed
    let m2 = m1
    if (m1 < 3) {
      try {
        const page2Url = buildPageUrl(normalizedBase, 2)
        console.log('Fetching page 2:', page2Url)
        
        const response2 = await fetch(page2Url, {
          headers: fetchHeaders
        })
        
        if (response2.ok) {
          const html2 = await response2.text()
          if (html2 && html2.length > 0) {
            m2 = Math.max(m1, maxPFromLinks(normalizedBase, html2))
            console.log('Page 2 max page found:', m2)
          }
        }
      } catch (e) {
        console.log('Page 2 fetch error (ignoring):', e.message)
        // Ignore errors for page 2
      }
    }
    
    let candidate = Math.max(m1, m2)
    
    if (candidate >= 3) {
      console.log('Last page discovered:', candidate)
      return candidate
    }
    
    // Sequential walk: 3, 4, 5... until empty/404
    const MAX_SEQ_WALK = 100
    let current = Math.max(candidate, 2)
    
    for (let next = current + 1; next <= current + MAX_SEQ_WALK; next++) {
      try {
        const testUrl = buildPageUrl(normalizedBase, next)
        const testResponse = await fetch(testUrl, {
          headers: fetchHeaders
        })
        
        if (!testResponse.ok || testResponse.status === 404) {
          console.log(`Page ${next} returned ${testResponse.status}, last page is ${candidate}`)
          return candidate
        }
        
        const testHtml = await testResponse.text()
        
        if (!testHtml || testHtml.length === 0) {
          console.log(`Page ${next} returned empty HTML, last page is ${candidate}`)
          return candidate
        }
        
        const items = parseEntriesFromHTML(testHtml, 1)
        
        if (items.length === 0) {
          console.log(`Page ${next} has no entries, last page is ${candidate}`)
          return candidate
        }
        
        candidate = next
      } catch (e) {
        console.log(`Page ${next} fetch error, last page is ${candidate}:`, e.message)
        return candidate
      }
    }
    
    console.log('Last page discovered (max reached):', candidate)
    return candidate
  } catch (error) {
    console.error('Last page discovery error:', error)
    throw error // Re-throw to let caller handle it
  }
}

/**
 * Scrape all pages from a topic
 */
async function scrapeAllPages(baseUrl, slug, id, lastPage) {
  const allEntries = []
  const normalizedBase = normalizeBaseUrl(baseUrl)
  
  console.log(`Scraping ${lastPage} pages from ${normalizedBase}`)
  
  const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://eksisozluk.com/'
  }
  
  for (let p = 1; p <= lastPage; p++) {
    try {
      const pageUrl = buildPageUrl(normalizedBase, p)
      console.log(`Fetching page ${p}: ${pageUrl}`)
      
      const response = await fetch(pageUrl, {
        headers: fetchHeaders
      })
      
      console.log(`Page ${p} response status: ${response.status}`)
      
      if (!response.ok) {
        console.error(`Page ${p} failed: ${response.status}`)
        // İlk sayfa başarısız olursa durdur
        if (p === 1) {
          throw new Error(`First page failed with status ${response.status}. Ekşi Sözlük Worker isteklerini engelliyor olabilir.`)
        }
        continue
      }
      
      const html = await response.text()
      console.log(`Page ${p} HTML length: ${html.length}`)
      
      if (!html || html.length === 0) {
        console.error(`Page ${p} returned empty HTML`)
        if (p === 1) {
          throw new Error('First page returned empty HTML. Ekşi Sözlük Worker isteklerini engelliyor olabilir.')
        }
        continue
      }
      const entries = parseEntriesFromHTML(html, 1000) // Get all entries from page
      
      if (entries.length === 0 && p === 1) {
        console.error(`Warning: No entries found on page 1. HTML length: ${html.length}`)
        // Try to continue anyway, maybe other pages have entries
      }
      
      console.log(`Page ${p}: Found ${entries.length} entries`)
      allEntries.push(...entries)
      
      // Small delay between pages
      if (p < lastPage) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } catch (error) {
      console.error(`Error scraping page ${p}:`, error.message)
      continue
    }
  }
  
  console.log(`Total entries scraped: ${allEntries.length}`)
  return allEntries
}

/**
 * Summarize entries using Cloudflare Workers AI
 */
async function summarizeEntries(entries, env) {
  if (!entries || entries.length === 0) {
    return 'No entries to summarize'
  }

  // Combine all entry contents
  const allText = entries
    .map((entry, idx) => `Entry ${idx + 1}: ${entry.content}`)
    .join('\n\n')

  // Limit text length to avoid token limits (approx 30000 chars)
  const maxLength = 25000
  const textToSummarize = allText.length > maxLength 
    ? allText.substring(0, maxLength) + '\n\n[... truncated ...]'
    : allText

  const prompt = `You are analyzing entries from Ekşi Sözlük (a Turkish online dictionary/forum). 
Analyze the following ${entries.length} entries and provide a comprehensive summary in Turkish.

The summary should:
1. Identify the main topics and themes discussed
2. Highlight key points and opinions
3. Note any interesting patterns, controversies, or consensus
4. Be concise but informative
5. Write in Turkish

Entries:
${textToSummarize}

Summary:`

  try {
    // Try to use Cloudflare Workers AI
    // Check if AI binding is available (env.AI)
    if (env && env.AI) {
      // Try different AI models - prefer Turkish-capable models
      const models = [
        '@cf/meta/llama-2-7b-chat-int8',
        '@cf/mistral/mistral-7b-instruct-v0.1',
        '@cf/meta/llama-3-8b-instruct'
      ]
      
      let lastError = null
      for (const model of models) {
        try {
          const aiResponse = await env.AI.run(model, {
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that summarizes Turkish forum discussions in Turkish. Always respond in Turkish.'
              },
              {
                role: 'user',
                content: prompt
              }
            ]
          })

          // Handle different response formats
          let summary = ''
          if (typeof aiResponse === 'string') {
            summary = aiResponse
          } else if (aiResponse.response) {
            summary = aiResponse.response
          } else if (aiResponse.description) {
            summary = aiResponse.description
          } else if (aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message) {
            summary = aiResponse.choices[0].message.content
          } else if (aiResponse.content) {
            summary = aiResponse.content
          }

          if (summary && summary.trim().length > 0) {
            return summary.trim()
          }
        } catch (modelError) {
          console.error(`AI model ${model} failed:`, modelError)
          lastError = modelError
          continue
        }
      }
      
      // If all models failed, use fallback
      console.error('All AI models failed, using fallback:', lastError)
      return generateSimpleSummary(entries)
    } else {
      // Fallback: Simple summary if AI is not available
      return generateSimpleSummary(entries)
    }
  } catch (error) {
    console.error('AI summarization error:', error)
    // Fallback to simple summary
    return generateSimpleSummary(entries)
  }
}

/**
 * Generate a simple summary when AI is not available
 */
function generateSimpleSummary(entries) {
  const totalEntries = entries.length
  const avgLength = entries.reduce((sum, e) => sum + (e.content?.length || 0), 0) / totalEntries
  
  // Extract common words/phrases
  const allWords = entries
    .map(e => e.content?.toLowerCase() || '')
    .join(' ')
    .match(/\b\w{4,}\b/g) || []
  
  const wordFreq = {}
  allWords.forEach(word => {
    wordFreq[word] = (wordFreq[word] || 0) + 1
  })
  
  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word)

  return `Özet:
- Toplam ${totalEntries} entry analiz edildi
- Ortalama entry uzunluğu: ${Math.round(avgLength)} karakter
- En sık geçen kelimeler: ${topWords.join(', ')}

Not: AI özeti için Cloudflare Workers AI yapılandırması gerekli. Şu anda basit özet gösteriliyor.`
}

