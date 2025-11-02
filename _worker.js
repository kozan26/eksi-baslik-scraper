// Cloudflare Pages _worker.js adaptation of scraper.py logic.
// Scrapes Ekşi Sözlük entries for a given topic and returns bullet-prefixed text.

const BASE_URL = "https://eksisozluk.com/2-kasim-2025-besiktas-fenerbahce-maci--8000065?a=popular";
const TIMEOUT_MS = 25_000;
const RETRIES_PER_MODE = 2;
const DELAY_BETWEEN_PAGES = [80, 200]; // milliseconds
const BULLET = "• ";
const MAX_SEQ_WALK = 1000;

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ekşi Sözlük Scraper</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 800px;
            width: 100%;
            padding: 40px;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2rem;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 1rem;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
        }
        input[type="url"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.3s;
        }
        input[type="url"]:focus {
            outline: none;
            border-color: #667eea;
        }
        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 32px;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        button:active {
            transform: translateY(0);
        }
        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        .example {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
            font-size: 0.9rem;
            color: #666;
        }
        .example strong {
            color: #333;
        }
        #result {
            margin-top: 30px;
            display: none;
        }
        #result.show {
            display: block;
        }
        #result-content {
            background: #f9f9f9;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 20px;
            max-height: 500px;
            overflow-y: auto;
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
            font-size: 0.9rem;
            line-height: 1.6;
        }
        .loading {
            text-align: center;
            padding: 20px;
            color: #666;
        }
        .error {
            background: #fee;
            border: 1px solid #fcc;
            color: #c33;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 Ekşi Sözlük Scraper</h1>
        <p class="subtitle">Extract entries from any Ekşi Sözlük topic page</p>
        
        <form id="scraper-form">
            <div class="form-group">
                <label for="url-input">Ekşi Sözlük URL:</label>
                <input 
                    type="url" 
                    id="url-input" 
                    placeholder="https://eksisozluk.com/..." 
                    required
                >
            </div>
            <button type="submit" id="submit-btn">Scrape Entries</button>
        </form>

        <div class="example">
            <strong>Example:</strong> https://eksisozluk.com/2-kasim-2025-besiktas-fenerbahce-maci--8000065?a=popular
        </div>

        <div id="result"></div>
    </div>

    <script>
        const form = document.getElementById('scraper-form');
        const urlInput = document.getElementById('url-input');
        const submitBtn = document.getElementById('submit-btn');
        const resultDiv = document.getElementById('result');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const url = urlInput.value.trim();
            if (!url) return;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Scraping...';
            
            resultDiv.className = 'loading';
            resultDiv.innerHTML = 'Fetching entries, please wait...';
            resultDiv.classList.add('show');

            try {
                const response = await fetch(\`/?url=\${encodeURIComponent(url)}\`);
                const text = await response.text();

                if (!response.ok) {
                    throw new Error(text || \`HTTP \${response.status}\`);
                }

                resultDiv.className = 'show';
                resultDiv.innerHTML = \`<div id="result-content">\${escapeHtml(text)}</div>\`;
            } catch (error) {
                resultDiv.className = 'error show';
                resultDiv.innerHTML = \`Error: \${escapeHtml(error.message)}\`;
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Scrape Entries';
            }
        });

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;

const USER_AGENTS = {
  web: {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "sec-ch-ua":
      '"Google Chrome";v="120", "Not(A:Brand";v="24", "Chromium";v="120"',
    "sec-ch-ua-platform": '"Windows"',
  },
  mobile: {
    "user-agent":
      "Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "sec-ch-ua":
      '"Google Chrome";v="120", "Not(A:Brand";v="24", "Chromium";v="120"',
    "sec-ch-ua-platform": '"Android"',
    "sec-ch-ua-mobile": "?1",
  },
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // If there's a url query parameter, run the scraper
    const urlParam = url.searchParams.get("url");
    if (urlParam) {
      return handleScrapeRequest(urlParam);
    }
    
    // Otherwise, serve static files (let Pages handle it) or return HTML for root
    // For Cloudflare Pages Functions, we intercept all requests, so we need to
    // forward to the asset handler if it's not the root path
    if (url.pathname === "/" || url.pathname === "") {
      // Serve the HTML page for root
      return new Response(HTML_PAGE, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    
    // For other paths, forward to Pages asset handler
    // In Pages Functions, we can't easily forward, so return 404
    return new Response("Not Found", { status: 404 });
  },
};

async function handleScrapeRequest(urlParam) {
  try {
    const baseUrl = normalizeBaseWithoutP(urlParam || BASE_URL);
    console.log(`Job started | base=${baseUrl}`);

    const lastPage = await discoverLastPageSafely(baseUrl);
    console.log(`Last page resolved=${lastPage}`);

    if (lastPage < 1) {
      return new Response("No entries were discovered.\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const entries = [];
    for (let page = 1; page <= lastPage; page += 1) {
      const pageUrl = buildPageUrl(baseUrl, page);
      console.log(`Fetching p=${page} url=${pageUrl}`);
      try {
        const html = await fetchHtml(pageUrl);
        const items = await extractEntries(html);
        entries.push(...items);
        console.log(`p=${page} entries=${items.length} total=${entries.length}`);
      } catch (err) {
        console.error(`Failed page=${page}:`, err);
      }
      await sleep(randomBetween(...DELAY_BETWEEN_PAGES));
    }

    const payload = formatEntries(entries);
    console.log(`Done pages=1..${lastPage} entries=${entries.length}`);
    return new Response(payload, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("Fatal error:", err);
    return new Response(`Error: ${(err && err.message) || String(err)}\n`, {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

function normalizeBaseWithoutP(url) {
  const u = new URL(url);
  u.searchParams.delete("p");
  return u.toString();
}

function buildPageUrl(baseUrl, page) {
  const u = new URL(baseUrl);
  u.searchParams.set("p", String(page));
  return u.toString();
}

async function fetchHtml(url) {
  let lastErr;
  for (const mode of ["web", "mobile"]) {
    for (let counter = 1; counter <= RETRIES_PER_MODE; counter += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const headers = {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
          "cache-control": "no-cache",
          pragma: "no-cache",
          referer: "https://eksisozluk.com/",
          "upgrade-insecure-requests": "1",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
          "sec-fetch-user": "?1",
          ...USER_AGENTS[mode],
        };
        const resp = await fetch(url, {
          signal: controller.signal,
          headers,
          redirect: "follow",
          cf: {
            cacheEverything: false,
            scrapeShield: false,
          },
        });
        clearTimeout(timeout);
        if (resp.status === 200) {
          const text = await resp.text();
          if (text) {
            return text;
          }
        }
        const body = await resp.text();
        lastErr = new Error(
          `HTTP ${resp.status}${
            body && body.includes("cf-chl")
              ? " (Cloudflare challenge detected)"
              : ""
          }`,
        );
        console.warn(
          `GET fail mode=${mode} try=${counter}/${RETRIES_PER_MODE} status=${resp.status}`,
        );
      } catch (err) {
        lastErr = err;
        console.warn(
          `GET fail mode=${mode} try=${counter}/${RETRIES_PER_MODE} err=${
            err && err.message
          }`,
        );
      }
      await sleep(backoff(counter));
    }
  }
  throw lastErr || new Error("Fetch failed");
}

async function extractEntries(html) {
  if (typeof HTMLRewriter === "function") {
    return extractEntriesWithHTMLRewriter(html);
  }
  return extractEntriesWithRegex(html);
}

function stripHtml(fragment) {
  const withoutTags = fragment.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  return decodeEntities(withoutTags.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n"));
}

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = parseInt(entity.slice(2), 16);
      return safeFromCodePoint(code);
    }
    if (entity.startsWith("#")) {
      const code = parseInt(entity.slice(1), 10);
      return safeFromCodePoint(code);
    }
    const mapped = HTML_ENTITIES[entity];
    return mapped !== undefined ? mapped : `&${entity};`;
  });
}

function safeFromCodePoint(code) {
  if (!Number.isFinite(code) || code <= 0) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function formatEntries(entries) {
  if (!entries.length) {
    return "No entries scraped. The topic may be empty or the source blocked the request.\n";
  }
  return entries.map((entry) => `${BULLET}${entry.replace(/\r?\n/g, "\n  ")}`).join("\n\n") + "\n";
}

async function discoverLastPageSafely(baseUrl) {
  // 1) p=1 scan
  const html1 = await fetchHtml(buildPageUrl(baseUrl, 1));
  let candidate = maxPFromLinksForSamePath(baseUrl, html1);

  // 2) p=2 scan
  if (candidate < 3) {
    try {
      const html2 = await fetchHtml(buildPageUrl(baseUrl, 2));
      candidate = Math.max(candidate, maxPFromLinksForSamePath(baseUrl, html2));
    } catch (err) {
      console.warn("p=2 discovery failed:", err && err.message);
    }
  }

  if (candidate >= 3) {
    return candidate;
  }

  let current = Math.max(candidate, 2);
  for (let page = current + 1; page <= current + MAX_SEQ_WALK; page += 1) {
    try {
      const html = await fetchHtml(buildPageUrl(baseUrl, page));
      const items = await extractEntries(html);
      if (!items.length) {
        console.log(`Walk stop: p=${page} empty -> last=${page - 1}`);
        return page - 1;
      }
      candidate = page;
      console.log(`Walk: p=${page} populated`);
    } catch (err) {
      console.log(`Walk stop: p=${page} err=${err && err.message} -> last=${candidate}`);
      return candidate;
    }
    await sleep(randomBetween(40, 120));
  }
  return candidate;
}

function maxPFromLinksForSamePath(baseUrl, html) {
  const root = new URL(baseUrl);
  let max = 1;
  const hrefRegex = /href\s*=\s*"(.*?)"/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const rawHref = match[1];
    if (!rawHref) continue;
    let candidateUrl;
    try {
      candidateUrl = new URL(rawHref, root);
    } catch {
      continue;
    }
    if (candidateUrl.pathname !== root.pathname) continue;
    const p = parseInt(candidateUrl.searchParams.get("p") || "0", 10);
    if (!Number.isNaN(p)) {
      max = Math.max(max, p);
    }
  }
  return max;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(attempt) {
  const base = Math.min(800 * 2 ** (attempt - 1), 2500);
  return base + randomBetween(50, 250);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

const HTML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: `"`,
  apos: "'",
  nbsp: " ",
  tab: "\t",
};

function extractEntriesWithRegex(html) {
  const results = [];
  const contentRegex =
    /<div\b[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>((?:.|\n)*?)<\/div>/gi;
  let match;
  while ((match = contentRegex.exec(html)) !== null) {
    const raw = match[1];
    const txt = stripHtml(raw).trim();
    if (txt) {
      results.push(txt);
    }
  }
  return results;
}

function extractEntriesWithHTMLRewriter(html) {
  const entries = [];
  const selectors = ["#pinned-entry .content", "#entry-item-list .content"];
  const handlers = selectors.map(() => createContentCollector(entries));
  let rewriter = new HTMLRewriter();
  selectors.forEach((selector, idx) => {
    rewriter = rewriter.on(selector, handlers[idx]);
  });
  return rewriter
    .transform(new Response(html))
    .arrayBuffer()
    .then(() => entries)
    .catch((err) => {
      console.warn("HTMLRewriter failed, falling back to regex:", err);
      return extractEntriesWithRegex(html);
    });
}

function createContentCollector(entries) {
  let buffer = "";
  return {
    element() {
      buffer = "";
    },
    text(textChunk) {
      buffer += textChunk.text;
    },
    end() {
      const cleaned = normalizeWhitespace(buffer);
      if (cleaned) {
        entries.push(cleaned);
      }
    },
  };
}

function normalizeWhitespace(text) {
  return decodeEntities(
    text
      .replace(/\u00a0/g, " ")
      .replace(/\r?\n\s*/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
}
