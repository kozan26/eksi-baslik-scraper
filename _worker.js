// Cloudflare Pages _worker.js adaptation of scraper.py logic.
// Scrapes Ekşi Sözlük entries for a given topic and returns bullet-prefixed text.

const BASE_URL = "https://eksisozluk.com/2-kasim-2025-besiktas-fenerbahce-maci--8000065?a=popular";
const TIMEOUT_MS = 25_000;
const RETRIES_PER_MODE = 2;
const DELAY_BETWEEN_PAGES = [80, 200]; // milliseconds
const BULLET = "• ";
const MAX_SEQ_WALK = 1000;

const USER_AGENTS = {
  web: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  mobile: "Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};

export default {
  async fetch(request) {
    try {
      const urlParam = new URL(request.url).searchParams.get("url");
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
          const items = extractEntries(html);
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
  },
};

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
    const ua = USER_AGENTS[mode];
    for (let counter = 1; counter <= RETRIES_PER_MODE; counter += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: {
            "user-agent": ua,
            "accept-language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });
        clearTimeout(timeout);
        if (resp.status === 200) {
          const text = await resp.text();
          if (text) {
            return text;
          }
        }
        lastErr = new Error(`HTTP ${resp.status}`);
        console.warn(`GET fail mode=${mode} try=${counter}/${RETRIES_PER_MODE} status=${resp.status}`);
      } catch (err) {
        lastErr = err;
        console.warn(`GET fail mode=${mode} try=${counter}/${RETRIES_PER_MODE} err=${err && err.message}`);
      }
      await sleep(backoff(counter));
    }
  }
  throw lastErr || new Error("Fetch failed");
}

function extractEntries(html) {
  const results = [];
  const contentRegex = /<div\b[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>((?:.|\n)*?)<\/div>/gi;
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
      const items = extractEntries(html);
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
