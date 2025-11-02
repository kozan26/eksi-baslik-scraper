var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-0Vmjji/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// cloudflare-worker.js
var cloudflare_worker_default = {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders
      });
    }
    const url = new URL(request.url);
    if (url.pathname === "/api/gundem") {
      try {
        const gundem = await scrapeEksisozluk();
        return new Response(JSON.stringify({
          success: true,
          items: gundem,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
    }
    if (url.pathname.startsWith("/api/topic/")) {
      try {
        const pathParts = url.pathname.replace("/api/topic/", "").split("--");
        if (pathParts.length < 2) {
          throw new Error("Ge\xE7ersiz ba\u015Fl\u0131k format\u0131");
        }
        const slug = pathParts[0];
        const id = pathParts[1].split("?")[0];
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const minLimit = Math.max(limit, 10);
        const entries = await scrapeTopicEntries(slug, id, minLimit);
        return new Response(JSON.stringify({
          success: true,
          topic: {
            slug,
            id,
            url: `/${slug}--${id}`
          },
          entries,
          count: entries.length,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
    }
    if (url.pathname === "/api/scrape-and-summarize") {
      try {
        const topicUrl = url.searchParams.get("url");
        if (!topicUrl) {
          return new Response(JSON.stringify({
            success: false,
            error: "URL parameter is required"
          }), {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          });
        }
        const urlObj = new URL(topicUrl);
        const pathMatch = urlObj.pathname.match(/\/([^/]+)--(\d+)/);
        if (!pathMatch) {
          throw new Error("Invalid Ek\u015Fi S\xF6zl\xFCk URL format");
        }
        const slug = pathMatch[1];
        const id = pathMatch[2];
        const baseUrl = `https://eksisozluk.com/${slug}--${id}`;
        const lastPage = await discoverLastPage(baseUrl);
        const allEntries = await scrapeAllPages(baseUrl, slug, id, lastPage);
        if (allEntries.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: "No entries found"
          }), {
            status: 404,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          });
        }
        const summary = await summarizeEntries(allEntries, env);
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
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
    }
    if (url.pathname === "/api/test-entry") {
      try {
        const testUrl = url.searchParams.get("url") || "https://eksisozluk.com/2-kasim-2025-besiktas-fenerbahce-maci--8000065";
        const response = await fetch(testUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        const html = await response.text();
        const entryMatches = html.match(/<li[^>]*id=["']entry-(\d+)["'][^>]*>/gi) || [];
        const entryCount = entryMatches.length;
        const contentDivs = html.match(/<div[^>]*class=["'][^"']*content["'][^"']*["'][^>]*>/gi) || [];
        const contentCount = contentDivs.length;
        const entryPattern = /<li[^>]*id=["']entry-(\d+)["'][^>]*>([\s\S]{0,3000})/gi;
        const entrySamples = [];
        let match;
        let count = 0;
        while ((match = entryPattern.exec(html)) !== null && count < 3) {
          entrySamples.push({
            id: match[1],
            html: match[0].substring(0, 2e3)
          });
          count++;
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
            "Content-Type": "application/json"
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
    }
    if (url.pathname === "/api/debug") {
      try {
        const response = await fetch("https://eksisozluk.com/basliklar/gundem", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        const html = await response.text();
        const linkCount = (html.match(/<a[^>]*href=["']\/([^"']+?)--(\d+)["'][^>]*>([^<]+?)<\/a>/gi) || []).length;
        const mobileIndexFound = html.includes("mobile-index");
        const topicListFound = html.includes("topic-list");
        const topicListMatch = html.match(/<ul[^>]*class=["'][^"']*topic-list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i);
        const topicListContent = topicListMatch ? topicListMatch[0].substring(0, 2e3) : "Not found";
        const liMatches = html.match(/<li[^>]*>[\s\S]{0,500}?<\/li>/gi) || [];
        const sampleLiItems = liMatches.slice(0, 3).join("\n---\n");
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
            "Content-Type": "application/json"
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
    }
    return new Response(JSON.stringify({
      message: "Ek\u015Fi S\xF6zl\xFCk G\xFCndem API",
      endpoints: {
        "/api/gundem": "Get trending topics (g\xFCndem)"
      }
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
};
async function scrapeEksisozluk() {
  try {
    let response = await fetch("https://eksisozluk.com/basliklar/gundem", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });
    if (!response.ok || response.status === 404) {
      response = await fetch("https://eksisozluk.com", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });
    }
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    const items = parseGundemFromHTML(html);
    return items;
  } catch (error) {
    console.error("Scraping error:", error);
    throw error;
  }
}
__name(scrapeEksisozluk, "scrapeEksisozluk");
function parseGundemFromHTML(html) {
  const items = [];
  try {
    const topicListMatch = html.match(/<ul[^>]*class=["'][^"']*topic-list[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i);
    if (topicListMatch) {
      const listContent = topicListMatch[1];
      const listItems = listContent.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
      if (listItems && listItems.length > 0) {
        for (const li of listItems) {
          if (li.includes("sponsored") || li.includes("display:none")) {
            continue;
          }
          const linkMatch = li.match(/<a[^>]*href=["']\/([^"']+?)--(\d+)(?:[^"']*?)["'][^>]*>([\s\S]*?)<\/a>/is);
          if (linkMatch) {
            const slug = linkMatch[1];
            const id = linkMatch[2];
            const linkContent = linkMatch[3];
            let title = linkContent.replace(/<small[^>]*>[\s\S]*?<\/small>/gi, "").trim();
            title = title.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&apos;/g, "'");
            const smallMatch = linkContent.match(/<small[^>]*>(\d+)<\/small>/i);
            const entryCount = smallMatch ? parseInt(smallMatch[1], 10) : null;
            const skipSlugs2 = ["sozluk-kurallari", "sozluk-is-ilanlari", "kariyer"];
            if (title && title.length > 3 && !skipSlugs2.includes(slug.toLowerCase())) {
              items.push({
                title,
                id,
                slug,
                url: `/${slug}--${id}`,
                entryCount
              });
            }
          }
        }
        if (items.length > 0) {
          return items.slice(0, 30);
        }
      }
    }
    const mobileIndexMatch = html.match(/<div[^>]*id=["']mobile-index["'][^>]*data-caption=["']([^"']*)["'][^>]*>([\s\S]*?)<\/div>/i);
    if (mobileIndexMatch) {
      const content = mobileIndexMatch[2];
      const mobileLinks = content.match(/<a[^>]*href=["']\/([^"']+?)--(\d+)["'][^>]*>([^<]+?)<\/a>/gi);
      if (mobileLinks) {
        const skipSlugs2 = ["sozluk-kurallari", "sozluk-is-ilanlari"];
        for (const link of mobileLinks) {
          const linkMatch = link.match(/<a[^>]*href=["']\/([^"']+?)--(\d+)["'][^>]*>([^<]+?)<\/a>/i);
          if (linkMatch) {
            const slug = linkMatch[1];
            const id = linkMatch[2];
            const title = linkMatch[3].trim();
            const entryMatch = content.match(new RegExp(`/${slug}--${id}[^>]*>([^<]*?)<(?:[^>]*?>){0,10}[^<]*?(\\d+)\\s*entry`, "i"));
            const entryCount = entryMatch ? parseInt(entryMatch[2], 10) : null;
            if (!skipSlugs2.includes(slug.toLowerCase()) && title.length > 2) {
              items.push({
                title,
                id,
                slug,
                url: `/${slug}--${id}`,
                entryCount
              });
            }
          }
        }
        if (items.length > 0) {
          return items.slice(0, 30);
        }
      }
      const lines = content.split(/\s{2,}|\n/).filter((line) => line.trim());
      const skipWords2 = [
        "g\xFCndem",
        "anket",
        "ili\u015Fkiler",
        "siyaset",
        "spor",
        "ek\u015Fi s\xF6zl\xFCk",
        "yeti\u015Fkin",
        "g\xFCndeminizi",
        "ki\u015Fiselle\u015Ftirin",
        "kariyer",
        "kurallar\u0131"
      ];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length < 3) continue;
        const shouldSkip = skipWords2.some(
          (word) => trimmed.toLowerCase().includes(word.toLowerCase())
        );
        if (shouldSkip) continue;
        const entryMatch = trimmed.match(/^(.+?)\s+(\d+)$/);
        if (entryMatch) {
          const title = entryMatch[1].trim();
          const entryCount = parseInt(entryMatch[2], 10);
          const linkInHTML = html.match(new RegExp(`<a[^>]*href=["']/([^"']*?)--(\\d+)["'][^>]*>${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"));
          if (linkInHTML) {
            items.push({
              title,
              entryCount,
              id: linkInHTML[2],
              slug: linkInHTML[1],
              url: `/${linkInHTML[1]}--${linkInHTML[2]}`
            });
          }
        }
      }
    }
    const allLinks = html.match(/<a[^>]*href=["']\/([^"']+?)--(\d+)["'][^>]*>([^<]+?)<\/a>/gi);
    const skipSlugs = ["sozluk-kurallari", "sozluk-is-ilanlari", "kariyer", "iletisim", "hakkimizda"];
    const skipWords = ["s\xF6zl\xFCk kurallar\u0131", "kariyer", "ileti\u015Fim", "hakk\u0131m\u0131zda", "giri\u015F", "kay\u0131t ol"];
    if (allLinks) {
      const targetCount = items.length === 0 ? 30 : 10;
      for (const link of allLinks) {
        const linkMatch = link.match(/<a[^>]*href=["']\/([^"']+?)--(\d+)["'][^>]*>([^<]+?)<\/a>/i);
        if (linkMatch) {
          const slug = linkMatch[1];
          const id = linkMatch[2];
          const title = linkMatch[3].trim();
          const linkIndex = html.indexOf(link);
          const context = html.substring(Math.max(0, linkIndex - 300), Math.min(html.length, linkIndex + 300));
          const isInGundemList = context.match(/gundem|trending|popular|hot|başlıklar/i);
          const shouldSkip = skipSlugs.includes(slug.toLowerCase()) || skipWords.some((word) => title.toLowerCase().includes(word.toLowerCase())) || title.length < 4 || title.match(/^(ekşi|sözlük|kurallar|kariyer)/i);
          if (!shouldSkip && (isInGundemList || items.length < targetCount || title.length > 10)) {
            const entryMatch = context.match(/(\d+)\s*entry/i);
            const entryCount = entryMatch ? parseInt(entryMatch[1], 10) : null;
            const isDuplicate = items.some(
              (item) => item.id === id || item.slug === slug || item.title.toLowerCase() === title.toLowerCase()
            );
            if (!isDuplicate) {
              items.push({
                title,
                id,
                slug,
                url: `/${slug}--${id}`,
                entryCount
              });
              if (items.length >= 30) break;
            }
          }
        }
      }
    }
    const uniqueItems = [];
    const seenIds = /* @__PURE__ */ new Set();
    const seenSlugs = /* @__PURE__ */ new Set();
    for (const item of items) {
      const key = item.id || item.slug || item.title.toLowerCase();
      if (item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        uniqueItems.push(item);
      } else if (item.slug && !seenSlugs.has(item.slug)) {
        seenSlugs.add(item.slug);
        uniqueItems.push(item);
      } else if (!item.id && !item.slug && !seenIds.has(key)) {
        seenIds.add(key);
        uniqueItems.push(item);
      }
    }
    return uniqueItems.filter((item) => item.title && item.title.length >= 3).slice(0, 30);
  } catch (error) {
    console.error("Parse error:", error);
    return [];
  }
}
__name(parseGundemFromHTML, "parseGundemFromHTML");
async function scrapeTopicEntries(slug, id, limit = 50) {
  try {
    const url = `https://eksisozluk.com/${slug}--${id}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    const entries = parseEntriesFromHTML(html, limit);
    return entries;
  } catch (error) {
    console.error("Entry scraping error:", error);
    throw error;
  }
}
__name(scrapeTopicEntries, "scrapeTopicEntries");
function parseEntriesFromHTML(html, limit = 50) {
  const entries = [];
  try {
    const entryContainerMatch = html.match(/<ul[^>]*id=["']entry-item-list["'][^>]*>([\s\S]*?)<\/ul>/i) || html.match(/<div[^>]*class=["'][^"']*entry-list["'][^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const searchHtml = entryContainerMatch ? entryContainerMatch[1] : html;
    const entryPatterns = [
      /<li[^>]*id=["']entry-(\d+)["'][^>]*>([\s\S]*?)<\/li>/gi,
      /<li[^>]*data-id=["'](\d+)["'][^>]*>([\s\S]*?)<\/li>/gi,
      /<div[^>]*class=["'][^"']*entry-item["'][^"']*["'][^>]*data-id=["'](\d+)["'][^>]*>([\s\S]*?)<\/div>/gi
    ];
    let entryMatch = null;
    let patternIndex = 0;
    while (patternIndex < entryPatterns.length && !entryMatch) {
      entryPatterns[patternIndex].lastIndex = 0;
      entryMatch = entryPatterns[patternIndex].exec(searchHtml);
      if (!entryMatch) patternIndex++;
    }
    if (!entryMatch) {
      const liPattern = /<li[^>]*>[\s\S]{0,10000}?<\/li>/gi;
      const liItems = [];
      let liMatch;
      liPattern.lastIndex = 0;
      while ((liMatch = liPattern.exec(html)) !== null && liItems.length < limit * 3) {
        liItems.push(liMatch[0]);
      }
      const liWithContent = [];
      for (const li of liItems) {
        const hasContent = /<div[^>]*class=["'][^"']*content["'][^"']*["']/i.test(li);
        const hasAuthor = /entry-author|href=["']\/biri\//i.test(li);
        const hasDate = /entry-date|permalink|href=["']\/entry\//i.test(li);
        if (hasContent && (hasAuthor || hasDate)) {
          liWithContent.push(li);
        }
      }
      if (liWithContent.length > 0) {
        for (let i = 0; i < Math.min(liWithContent.length, limit); i++) {
          const itemHtml = liWithContent[i];
          let content = parseEntryContent(itemHtml);
          const author = parseEntryAuthor(itemHtml);
          const date = parseEntryDate(itemHtml);
          const favCount = parseEntryFavCount(itemHtml);
          const entryId = parseEntryId(itemHtml) || `entry-${i + 1}`;
          if (content && content.trim().length > 3) {
            entries.push({
              id: entryId,
              order: entries.length + 1,
              // Orijinal sırayı koru
              content,
              author: author || "Bilinmeyen",
              date: date || null,
              favoriteCount: favCount,
              entryUrl: entryId.toString().match(/^\d+$/) ? `https://eksisozluk.com/entry/${entryId}` : null
            });
          }
        }
        if (entries.length > 0) {
          return entries.slice(0, limit);
        }
      }
      const contentDivPattern = /<div[^>]*class=["'][^"']*content["'][^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
      const allContentMatches = [];
      let match;
      let matchCount = 0;
      contentDivPattern.lastIndex = 0;
      while ((match = contentDivPattern.exec(html)) !== null && matchCount < limit * 5) {
        const startIndex = match.index;
        const endIndex = match.index + match[0].length;
        const contextStart = Math.max(0, startIndex - 3e3);
        const contextEnd = Math.min(html.length, endIndex + 3e3);
        const entryContext = html.substring(contextStart, contextEnd);
        const contentText = match[1].trim().replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
        const contentLength = contentText.length;
        const hasAuthor = /entry-author|href=["']\/biri\//i.test(entryContext);
        const hasDate = /entry-date|permalink|href=["']\/entry\/\d+/i.test(entryContext);
        const hasFooter = /entry-footer|feedback-container|entry-info/i.test(entryContext);
        const hasEntryMeta = /entry-item|entry-index/i.test(entryContext);
        const isAd = /sponsored|advertisement|doubleclick|adsbygoogle/i.test(entryContext);
        if (!isAd && contentLength > 3) {
          allContentMatches.push({
            contentHtml: match[0],
            content: match[1],
            context: entryContext,
            position: startIndex,
            score: (hasAuthor ? 10 : 0) + (hasDate ? 8 : 0) + (hasFooter ? 4 : 0) + (hasEntryMeta ? 6 : 0) + (contentLength > 50 ? 2 : 0) + (contentLength > 10 ? 1 : 0)
          });
        }
        matchCount++;
      }
      allContentMatches.sort((a, b) => a.position - b.position);
      if (allContentMatches.length > 0) {
        console.log(`Found ${allContentMatches.length} potential entries, processing up to ${limit}`);
        for (let i = 0; i < Math.min(allContentMatches.length, limit); i++) {
          const match2 = allContentMatches[i];
          let content = parseEntryContent(match2.contentHtml);
          const author = parseEntryAuthor(match2.context);
          const date = parseEntryDate(match2.context);
          const favCount = parseEntryFavCount(match2.context);
          const entryId = parseEntryId(match2.context) || `entry-${i + 1}`;
          if (!content || content.trim().length < 1) {
            const rawMatch = match2.contentHtml.match(/>([^<]{10,})</i);
            if (rawMatch && rawMatch[1]) {
              content = rawMatch[1].trim().substring(0, 500);
            }
          }
          if (content && content.trim().length > 0) {
            entries.push({
              id: entryId,
              order: entries.length + 1,
              content: content.trim(),
              author: author || "Bilinmeyen",
              date: date || null,
              favoriteCount: favCount,
              entryUrl: entryId.toString().match(/^\d+$/) ? `https://eksisozluk.com/entry/${entryId}` : null
            });
          }
        }
        console.log(`Parsed ${entries.length} entries from ${allContentMatches.length} matches`);
        if (entries.length > 0) {
          return entries.slice(0, limit);
        }
      }
    }
    if (entryMatch && patternIndex < entryPatterns.length) {
      entryPatterns[patternIndex].lastIndex = 0;
      const foundEntries = [];
      while ((entryMatch = entryPatterns[patternIndex].exec(searchHtml)) !== null) {
        const entryId = entryMatch[1];
        const entryHtml = entryMatch[2];
        const matchIndex = entryMatch.index;
        const content = parseEntryContent(entryHtml);
        const author = parseEntryAuthor(entryHtml);
        const date = parseEntryDate(entryHtml);
        const favCount = parseEntryFavCount(entryHtml);
        if (content && content.length > 0) {
          foundEntries.push({
            id: entryId,
            content,
            author: author || "Bilinmeyen",
            date: date || null,
            favoriteCount: favCount,
            entryUrl: `https://eksisozluk.com/entry/${entryId}`,
            position: matchIndex
            // Orijinal pozisyonu kaydet
          });
        }
      }
      foundEntries.sort((a, b) => a.position - b.position);
      foundEntries.forEach((entry, index) => {
        entries.push({
          ...entry,
          order: index + 1
        });
      });
    }
    return entries.slice(0, limit);
  } catch (error) {
    console.error("Entry parse error:", error);
    return [];
  }
}
__name(parseEntriesFromHTML, "parseEntriesFromHTML");
function parseEntryContent(html) {
  const contentMatch = html.match(/<div[^>]*class=["'][^"']*content["'][^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!contentMatch) return "";
  let content = contentMatch[1].replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/div>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n\s*\n\s*\n/g, "\n\n").trim();
  return content;
}
__name(parseEntryContent, "parseEntryContent");
function parseEntryAuthor(html) {
  const authorMatch = html.match(/<a[^>]*class=["'][^"']*entry-author["'][^"']*["'][^>]*>([^<]+?)<\/a>/i) || html.match(/id=["']entry-author["'][^>]*>[\s\S]*?<a[^>]*>([^<]+?)<\/a>/i) || html.match(/<a[^>]*href=["']\/biri\/([^"']+)["'][^>]*>([^<]+?)<\/a>/i) || html.match(/data-author=["']([^"']+)["']/i);
  return authorMatch ? (authorMatch[2] || authorMatch[1] || "").trim() : null;
}
__name(parseEntryAuthor, "parseEntryAuthor");
function parseEntryDate(html) {
  const dateMatch = html.match(/<a[^>]*class=["'][^"']*entry-date["'][^"']*["'][^>]*>([^<]+?)<\/a>/i) || html.match(/class=["'][^"']*entry-date["'][^"']*["'][^>]*permalink["'][^>]*>([^<]+?)<\/a>/i) || html.match(/data-date=["']([^"']+)["']/i) || html.match(/<time[^>]*>([^<]+?)<\/time>/i);
  return dateMatch ? (dateMatch[1] || dateMatch[2] || "").trim() : null;
}
__name(parseEntryDate, "parseEntryDate");
function parseEntryFavCount(html) {
  const favMatch = html.match(/class=["'][^"']*favorite-count["'][^"']*["'][^>]*>(\d+)/i) || html.match(/data-favorite-count=["'](\d+)["']/i) || html.match(/>(\d+)\s*favorite/i) || html.match(/favorite.*?(\d+)/i);
  return favMatch ? parseInt(favMatch[1], 10) : 0;
}
__name(parseEntryFavCount, "parseEntryFavCount");
function parseEntryId(html) {
  const idMatch = html.match(/id=["']entry-(\d+)["']/i) || html.match(/data-id=["'](\d+)["']/i) || html.match(/href=["']\/entry\/(\d+)["']/i);
  return idMatch ? idMatch[1] : null;
}
__name(parseEntryId, "parseEntryId");
function buildPageUrl(baseUrl, page) {
  const url = new URL(baseUrl);
  url.searchParams.set("p", page.toString());
  return url.toString();
}
__name(buildPageUrl, "buildPageUrl");
function normalizeBaseUrl(url) {
  const urlObj = new URL(url);
  urlObj.searchParams.delete("p");
  return urlObj.toString();
}
__name(normalizeBaseUrl, "normalizeBaseUrl");
function maxPFromLinks(baseUrl, html) {
  const baseUrlObj = new URL(baseUrl);
  const basePath = baseUrlObj.pathname;
  let maxP = 1;
  const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      let href = match[1];
      if (href.startsWith("/")) {
        href = `${baseUrlObj.origin}${href}`;
      }
      const hrefUrl = new URL(href);
      if (hrefUrl.pathname === basePath && hrefUrl.searchParams.has("p")) {
        const p = parseInt(hrefUrl.searchParams.get("p"), 10);
        if (p > maxP) {
          maxP = p;
        }
      }
    } catch (e) {
      continue;
    }
  }
  return maxP;
}
__name(maxPFromLinks, "maxPFromLinks");
async function discoverLastPage(baseUrl) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  try {
    const page1Url = buildPageUrl(normalizedBase, 1);
    const response1 = await fetch(page1Url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    const html1 = await response1.text();
    const m1 = maxPFromLinks(normalizedBase, html1);
    let m2 = m1;
    if (m1 < 3) {
      try {
        const page2Url = buildPageUrl(normalizedBase, 2);
        const response2 = await fetch(page2Url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        const html2 = await response2.text();
        m2 = Math.max(m1, maxPFromLinks(normalizedBase, html2));
      } catch (e) {
      }
    }
    let candidate = Math.max(m1, m2);
    if (candidate >= 3) {
      return candidate;
    }
    const MAX_SEQ_WALK = 100;
    let current = Math.max(candidate, 2);
    for (let next = current + 1; next <= current + MAX_SEQ_WALK; next++) {
      try {
        const testUrl = buildPageUrl(normalizedBase, next);
        const testResponse = await fetch(testUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        if (!testResponse.ok || testResponse.status === 404) {
          return candidate;
        }
        const testHtml = await testResponse.text();
        const items = parseEntriesFromHTML(testHtml, 1);
        if (items.length === 0) {
          return candidate;
        }
        candidate = next;
      } catch (e) {
        return candidate;
      }
    }
    return candidate;
  } catch (error) {
    console.error("Last page discovery error:", error);
    return 1;
  }
}
__name(discoverLastPage, "discoverLastPage");
async function scrapeAllPages(baseUrl, slug, id, lastPage) {
  const allEntries = [];
  const normalizedBase = normalizeBaseUrl(baseUrl);
  for (let p = 1; p <= lastPage; p++) {
    try {
      const pageUrl = buildPageUrl(normalizedBase, p);
      const response = await fetch(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      if (!response.ok) {
        console.error(`Page ${p} failed: ${response.status}`);
        continue;
      }
      const html = await response.text();
      const entries = parseEntriesFromHTML(html, 1e3);
      allEntries.push(...entries);
      if (p < lastPage) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`Error scraping page ${p}:`, error);
      continue;
    }
  }
  return allEntries;
}
__name(scrapeAllPages, "scrapeAllPages");
async function summarizeEntries(entries, env) {
  if (!entries || entries.length === 0) {
    return "No entries to summarize";
  }
  const allText = entries.map((entry, idx) => `Entry ${idx + 1}: ${entry.content}`).join("\n\n");
  const maxLength = 25e3;
  const textToSummarize = allText.length > maxLength ? allText.substring(0, maxLength) + "\n\n[... truncated ...]" : allText;
  const prompt = `You are analyzing entries from Ek\u015Fi S\xF6zl\xFCk (a Turkish online dictionary/forum). 
Analyze the following ${entries.length} entries and provide a comprehensive summary in Turkish.

The summary should:
1. Identify the main topics and themes discussed
2. Highlight key points and opinions
3. Note any interesting patterns, controversies, or consensus
4. Be concise but informative
5. Write in Turkish

Entries:
${textToSummarize}

Summary:`;
  try {
    if (env && env.AI) {
      const models = [
        "@cf/meta/llama-2-7b-chat-int8",
        "@cf/mistral/mistral-7b-instruct-v0.1",
        "@cf/meta/llama-3-8b-instruct"
      ];
      let lastError = null;
      for (const model of models) {
        try {
          const aiResponse = await env.AI.run(model, {
            messages: [
              {
                role: "system",
                content: "You are a helpful assistant that summarizes Turkish forum discussions in Turkish. Always respond in Turkish."
              },
              {
                role: "user",
                content: prompt
              }
            ]
          });
          let summary = "";
          if (typeof aiResponse === "string") {
            summary = aiResponse;
          } else if (aiResponse.response) {
            summary = aiResponse.response;
          } else if (aiResponse.description) {
            summary = aiResponse.description;
          } else if (aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message) {
            summary = aiResponse.choices[0].message.content;
          } else if (aiResponse.content) {
            summary = aiResponse.content;
          }
          if (summary && summary.trim().length > 0) {
            return summary.trim();
          }
        } catch (modelError) {
          console.error(`AI model ${model} failed:`, modelError);
          lastError = modelError;
          continue;
        }
      }
      console.error("All AI models failed, using fallback:", lastError);
      return generateSimpleSummary(entries);
    } else {
      return generateSimpleSummary(entries);
    }
  } catch (error) {
    console.error("AI summarization error:", error);
    return generateSimpleSummary(entries);
  }
}
__name(summarizeEntries, "summarizeEntries");
function generateSimpleSummary(entries) {
  const totalEntries = entries.length;
  const avgLength = entries.reduce((sum, e) => sum + (e.content?.length || 0), 0) / totalEntries;
  const allWords = entries.map((e) => e.content?.toLowerCase() || "").join(" ").match(/\b\w{4,}\b/g) || [];
  const wordFreq = {};
  allWords.forEach((word) => {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  });
  const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([word]) => word);
  return `\xD6zet:
- Toplam ${totalEntries} entry analiz edildi
- Ortalama entry uzunlu\u011Fu: ${Math.round(avgLength)} karakter
- En s\u0131k ge\xE7en kelimeler: ${topWords.join(", ")}

Not: AI \xF6zeti i\xE7in Cloudflare Workers AI yap\u0131land\u0131rmas\u0131 gerekli. \u015Eu anda basit \xF6zet g\xF6steriliyor.`;
}
__name(generateSimpleSummary, "generateSimpleSummary");

// ../Users/ozank/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../Users/ozank/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-0Vmjji/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = cloudflare_worker_default;

// ../Users/ozank/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-0Vmjji/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=cloudflare-worker.js.map
