"""
Ekşi Sözlük entries-only scraper (URL sürümü)

- Cloudflare için cloudscraper + BeautifulSoup
- Sadece entry metinlerini çeker: #pinned-entry .content ve #entry-item-list .content
- Her entry'nin başına madde işareti (•) koyar
- SON SAYFA TESPİTİ geliştirilmiş:
    1) p=1 HTML içindeki tüm linklerden aynı path'e ait en yüksek p değeri
    2) p=2 için de aynısı (bazı başlıklarda "son sayfa" linki p=2'de görünür)
    3) Hâlâ düşükse: sıralı yürüyerek (3,4,5,...) sayfa keşfi (ilk boş/404'te durur)

GEREKENLER: pip install cloudscraper beautifulsoup4
"""

import os
import time
import random
import re
import html
from datetime import datetime
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

try:
    import cloudscraper
except ModuleNotFoundError:
    raise SystemExit("cloudscraper yüklü değil. Kurulum: pip install cloudscraper beautifulsoup4")

from bs4 import BeautifulSoup


# ----------------------------
# AYARLAR
# ----------------------------
BASE_URL = "https://eksisozluk.com/2-kasim-2025-besiktas-fenerbahce-maci--8000065?a=popular"
TIMEOUT = 25
RETRIES_PER_MODE = 2
DELAY_BETWEEN_PAGES = (0.08, 0.20)
OUT_DIR = "output"  # çıktılar için klasör
BULLET = "• "
ENCODING = "utf-8-sig"  # Excel uyumu için BOM'lu
VERBOSE_RETRIES = True
MAX_SEQ_WALK = 1000  # sıralı yürüyüş üst sınırı (güvenlik)


# ----------------------------
# LOG YARDIMCILARI
# ----------------------------
def _ts():
    """Timestamp string döndürür."""
    return time.strftime("%H:%M:%S")


def _log(msg):
    """Bilgi mesajı yazdırır."""
    try:
        print(f"[{_ts()}] SYSTEM: {msg}")
    except UnicodeEncodeError:
        # Windows console encoding sorunu için fallback
        msg_safe = msg.encode('ascii', errors='replace').decode('ascii')
        print(f"[{_ts()}] SYSTEM: {msg_safe}")


def _err(msg):
    """Hata mesajı yazdırır."""
    try:
        print(f"[{_ts()}] ERROR: {msg}")
    except UnicodeEncodeError:
        # Windows console encoding sorunu için fallback
        msg_safe = msg.encode('ascii', errors='replace').decode('ascii')
        print(f"[{_ts()}] ERROR: {msg_safe}")


# ----------------------------
# URL & İSTEK
# ----------------------------
def _normalize_base_without_p(url: str) -> str:
    """URL'den p parametresini kaldırır."""
    u = urlsplit(url)
    q = [(k, v) for (k, v) in parse_qsl(u.query, keep_blank_values=True) if k.lower() != "p"]
    return urlunsplit((u.scheme, u.netloc, u.path, urlencode(q), u.fragment))


def _build_page_url(base_url: str, page: int) -> str:
    """Base URL'e p parametresi ekler."""
    u = urlsplit(base_url)
    q = dict(parse_qsl(u.query, keep_blank_values=True))
    q["p"] = str(page)
    return urlunsplit((u.scheme, u.netloc, u.path, urlencode(q), u.fragment))


def _cloudscraper_session(mobile: bool = False):
    """Cloudscraper session oluşturur."""
    return cloudscraper.create_scraper(
        browser={
            "browser": "chrome",
            "mobile": mobile,
            "platform": "android" if mobile else "windows",
        }
    )


def _fetch_html(url: str, timeout: int = TIMEOUT) -> str:
    """
    URL'yi iki modda (web & mobile) dene; 200 gelirse html döndür.
    404/403 vb durumlarda tekrar dener; sonunda hata fırlatır.
    """
    last_exc = None
    for mobile in (False, True):
        session = _cloudscraper_session(mobile=mobile)
        for i in range(1, RETRIES_PER_MODE + 1):
            try:
                r = session.get(url, timeout=timeout)
                if r.status_code == 200 and r.text:
                    return r.text
                last_exc = RuntimeError(f"HTTP {r.status_code}")
                if VERBOSE_RETRIES:
                    _err(f"GET failed ({'mob' if mobile else 'web'}) try {i}/{RETRIES_PER_MODE} -> HTTP {r.status_code}")
            except Exception as e:
                last_exc = e
                if VERBOSE_RETRIES:
                    _err(f"GET failed ({'mob' if mobile else 'web'}) try {i}/{RETRIES_PER_MODE} -> {repr(e)}")
            time.sleep(min(0.8 * (2 ** (i - 1)) + random.uniform(0.05, 0.25), 2.5))
    raise last_exc if last_exc else RuntimeError("GET failed (unknown)")


# ----------------------------
# PARSE & TEMİZLEME
# ----------------------------
def _extract_entries(html_text: str) -> list[str]:
    """HTML'den entry metinlerini çıkarır."""
    soup = BeautifulSoup(html_text, "html.parser")
    nodes = soup.select("#pinned-entry .content, #entry-item-list .content")
    out = []
    for n in nodes:
        txt = n.get_text(separator="\n", strip=True)
        txt = html.unescape(txt or "").strip()
        if not txt:
            continue
        txt = re.sub(r"\r\n?", "\n", txt)
        txt = re.sub(r"\n{3,}", "\n\n", txt).strip()
        if txt:
            out.append(txt)
    return out


def _format_entries(entries: list[str], bullet: str = BULLET) -> str:
    """Entry listesini formatlanmış string'e çevirir."""
    return "\n\n".join(f"{bullet}{e}" for e in entries)


# ----------------------------
# SON SAYFA TESPİTİ (GELİŞTİRİLMİŞ)
# ----------------------------
def _max_p_from_links_for_same_path(base_url: str, html_text: str) -> int:
    """
    HTML içindeki tüm <a href> linklerinden, BASE_URL ile aynı path'e sahip olanların
    query'sindeki p parametresinin en büyüğünü döner. Bulunamazsa 1.
    """
    u_base = urlsplit(base_url)
    base_path = u_base.path
    soup = BeautifulSoup(html_text, "html.parser")
    max_p = 1
    for a in soup.find_all("a", href=True):
        href = a["href"]
        # relatif -> mutlak
        if href.startswith("/"):
            href = f"{u_base.scheme}://{u_base.netloc}{href}"
        try:
            u = urlsplit(href)
            if u.path != base_path:
                continue
            qs = dict(parse_qsl(u.query, keep_blank_values=True))
            if "p" in qs:
                p = int(qs["p"])
                if p > max_p:
                    max_p = p
        except Exception:
            continue
    return max_p


def _discover_last_page_safely(base_url: str) -> int:
    """
    1) p=1'de link taraması
    2) p=2'de link taraması (bazı başlıklarda 'son sayfa' burada belirir)
    3) Hâlâ küçükse: sırayla p=3,4,5... boş/404 olana kadar yürü
    """
    # p=1
    html1 = _fetch_html(_build_page_url(base_url, 1))
    m1 = _max_p_from_links_for_same_path(base_url, html1)

    # p=2 (varsa)
    m2 = m1
    if m1 < 3:  # sadece kapsamı genişletmek için yük
        try:
            html2 = _fetch_html(_build_page_url(base_url, 2))
            m2 = max(m1, _max_p_from_links_for_same_path(base_url, html2))
        except Exception:
            pass

    candidate = max(m1, m2)
    _log(f"Last page (from links): {candidate}")

    if candidate >= 3:
        return candidate

    # 3) Sıralı yürüyüş: 3,4,5...
    # Not: Bazı başlıklarda gerçekten 1-2 sayfa olabilir; 404/boş görünürse dur.
    current = max(candidate, 2)
    for nxt in range(current + 1, current + 1 + MAX_SEQ_WALK):
        url = _build_page_url(base_url, nxt)
        try:
            htmlx = _fetch_html(url)
            items = _extract_entries(htmlx)
            if not items:
                # sayfa var ama entry yok => son dolu sayfa current
                _log(f"Walk stop: p={nxt} boş (last full={nxt-1})")
                return nxt - 1
            candidate = nxt
            _log(f"Walk: p={nxt} dolu -> candidate={candidate}")
            # küçük bir nefes
            time.sleep(random.uniform(0.05, 0.12))
        except Exception as e:
            # 404/403 vb: daha ileri yok
            _log(f"Walk stop: p={nxt} hata ({e}) -> last={candidate}")
            return candidate

    return candidate


# ----------------------------
# KAYIT
# ----------------------------
def _safe_makedirs(path: str) -> str:
    """Dizin oluşturur, hata olursa '.' döndürür."""
    try:
        os.makedirs(path, exist_ok=True)
        return path
    except Exception as e:
        _err(f"OUT_DIR oluşturulamadı ({path}): {repr(e)} -> '.' kullanılacak")
        return "."


def _slug_from_url(base_url: str) -> str:
    """URL'den slug çıkarır (dosya adı için)."""
    u = urlsplit(base_url)
    return (os.path.basename(u.path) or "eksi").strip("/")


# ----------------------------
# ANA AKIŞ
# ----------------------------
def main():
    """Ana scraping fonksiyonu."""
    start = time.time()
    _log("Job started (auto last page)")

    base_url = _normalize_base_without_p(BASE_URL)
    _log(f"URL base: {base_url}")

    out_dir = _safe_makedirs(OUT_DIR)

    # Son sayfa tespiti
    try:
        last_page = _discover_last_page_safely(base_url)
    except Exception as e:
        _err(f"Last page discovery failed: {repr(e)}")
        last_page = 2  # makul bir varsayılan

    if last_page < 1:
        _log("Hiç entry bulunamadı. Çıkılıyor.")
        return

    _log(f"Taranacak aralık: 1..{last_page}")

    # Topla
    all_entries = []
    for p in range(1, last_page + 1):
        t0 = time.time()
        page_url = _build_page_url(base_url, p)
        try:
            html_text = _fetch_html(page_url)
        except Exception as e:
            _err(f"GET failed for {page_url} (last: {repr(e)})")
            continue
        items = _extract_entries(html_text)
        all_entries.extend(items)
        dt = time.time() - t0
        _log(f"[OK] p={p} +{len(items)} entries (TOTAL={len(all_entries)}) | {dt:.2f}s")
        time.sleep(random.uniform(*DELAY_BETWEEN_PAGES))

    # Kaydet
    slug = _slug_from_url(base_url)
    date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    fname = f"{slug}_p1-{last_page}_{date_str}.txt"
    fpath = os.path.join(out_dir, fname)

    try:
        with open(fpath, "w", encoding=ENCODING, errors="ignore") as f:
            f.write(_format_entries(all_entries, bullet=BULLET))
        _log(f"Saved TXT: {fpath} | entries={len(all_entries)} | encoding={ENCODING}")
    except Exception as e:
        _err(f"Save failed: {repr(e)}")

    elapsed = time.time() - start
    _log(f"Done in {elapsed:.2f}s (pages=1..{last_page}, entries={len(all_entries)})")


if __name__ == "__main__":
    main()
