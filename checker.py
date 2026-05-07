import os
import sqlite3
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import pytz
from urllib.parse import urlparse
import logging

logger = logging.getLogger(__name__)

TIMEOUT = 10
MAX_WORKERS = 10
USER_AGENT = "SitemapLinkChecker/1.0 (Firefox)"
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "link_checker.db")
TZ_BERLIN = pytz.timezone("Europe/Berlin")

_progress = {"done": 0, "total": 0, "phase": "fetching"}

def _init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_date TEXT,
            total INTEGER,
            with_links INTEGER,
            without_links INTEGER,
            pct_without_links REAL,
            created_at TEXT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER,
            url TEXT,
            title TEXT,
            link_count INTEGER,
            category TEXT,
            published_date TEXT,
            FOREIGN KEY(run_id) REFERENCES runs(id)
        )
    """)

    conn.commit()
    conn.close()

def _get_category_from_url(url):
    path = urlparse(url).path
    parts = path.split('/')
    if len(parts) > 1 and parts[1]:
        return parts[1]
    return "other"

def _scrape_url(url):
    try:
        resp = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT})
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "lxml")

        title_tag = soup.find("meta", property="og:title")
        title = title_tag.get("content", "Unknown") if title_tag else "Unknown"

        # Find main article content
        main = soup.find("main", id="main")
        if not main:
            main = soup.find("main")

        if main:
            # Check if article is primarily a video (detected by video-teaser in first figure)
            first_figure = main.find("figure")
            is_video_article = False
            if first_figure:
                video_teaser = first_figure.find("div", class_="video-teaser")
                if video_teaser:
                    is_video_article = True

            # If it's a video article, skip link counting
            if is_video_article:
                link_count = 0
            else:
                # Find all text-link elements in main content
                text_links = main.find_all("a", class_="text-link")

                # Filter out:
                # 1. Image links (contain "images.")
                # 2. bildstatic.de links
                # 3. Links inside video-centre divs
                link_count = 0
                for link in text_links:
                    href = link.get("href", "").lower()

                    # Skip image and bildstatic links
                    if "images." in href or "bildstatic.de" in href:
                        continue

                    # Skip links inside video-centre divs
                    parent = link.find_parent("div", class_="video-centre")
                    if parent:
                        continue

                    link_count += 1
        else:
            link_count = 0

        return {"url": url, "title": title, "link_count": link_count, "error": None}
    except Exception as e:
        logger.error(f"Error scraping {url}: {e}")
        return {"url": url, "title": "Unknown", "link_count": 0, "error": str(e)}

def _fetch_sitemap():
    """Fetch and parse the bild.de news sitemap."""
    try:
        resp = requests.get(
            "https://www.bild.de/sitemap-news.xml",
            timeout=TIMEOUT,
            headers={"User-Agent": USER_AGENT}
        )
        resp.raise_for_status()
        return BeautifulSoup(resp.content, "xml")
    except Exception as e:
        logger.error(f"Error fetching sitemap: {e}")
        return None

def _get_yesterday_articles(sitemap_soup):
    """Extract articles from yesterday's date (Berlin timezone)."""
    if not sitemap_soup:
        return []

    yesterday = datetime.now(TZ_BERLIN) - timedelta(days=1)
    yesterday_date = yesterday.date()

    articles = []
    for url_elem in sitemap_soup.find_all("url"):
        loc_tag = url_elem.find("loc")
        news_elem = url_elem.find("news:news")

        if not loc_tag or not news_elem:
            continue

        date_tag = news_elem.find("news:publication_date")
        if not date_tag:
            continue

        try:
            pub_date_str = date_tag.string
            pub_dt = datetime.fromisoformat(pub_date_str.replace("Z", "+00:00"))
            pub_dt_berlin = pub_dt.astimezone(TZ_BERLIN)

            if pub_dt_berlin.date() == yesterday_date:
                title_tag = news_elem.find("news:title")
                title = title_tag.string if title_tag else "Unknown"
                articles.append({
                    "url": loc_tag.string,
                    "title": title,
                    "published_date": pub_date_str
                })
        except Exception as e:
            logger.error(f"Error parsing date: {e}")
            continue

    return articles

def _scrape_articles_parallel(articles, progress_callback=None):
    """Scrape articles in parallel."""
    results = {}
    total = len(articles)

    def scrape_with_callback(article):
        result = _scrape_url(article["url"])
        result["title"] = article["title"]
        result["published_date"] = article["published_date"]
        if progress_callback:
            progress_callback()
        return article["url"], result

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        for url, result in executor.map(scrape_with_callback, articles):
            results[url] = result

    return results

def run_check(progress_callback=None):
    """Main check routine. Returns summary dict."""
    global _progress
    _init_db()

    _progress = {"done": 0, "total": 0, "phase": "fetching"}

    sitemap_soup = _fetch_sitemap()
    yesterday_articles = _get_yesterday_articles(sitemap_soup)

    _progress = {"done": 0, "total": len(yesterday_articles), "phase": "scraping"}

    def cb():
        global _progress
        _progress["done"] += 1

    scraped = _scrape_articles_parallel(yesterday_articles, cb)

    _progress = {"done": len(yesterday_articles), "total": len(yesterday_articles), "phase": "processing"}

    total = len(scraped)
    with_links = sum(1 for r in scraped.values() if r["link_count"] > 0)
    without_links = total - with_links
    pct_without_links = (without_links / total * 100) if total > 0 else 0

    yesterday = datetime.now(TZ_BERLIN) - timedelta(days=1)
    run_date = yesterday.date().isoformat()
    now = datetime.now(TZ_BERLIN).isoformat()

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute("""
        INSERT INTO runs (run_date, total, with_links, without_links, pct_without_links, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (run_date, total, with_links, without_links, pct_without_links, now))

    run_id = c.lastrowid

    for url, result in scraped.items():
        category = _get_category_from_url(url)
        c.execute("""
            INSERT INTO articles (run_id, url, title, link_count, category, published_date)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (run_id, url, result["title"], result["link_count"], category, result.get("published_date", "")))

    conn.commit()
    conn.close()

    logger.info(f"Check complete: {total} articles, {without_links} without links ({pct_without_links:.1f}%)")

    return {
        "run_id": run_id,
        "run_date": run_date,
        "total": total,
        "with_links": with_links,
        "without_links": without_links,
        "pct_without_links": pct_without_links
    }

def get_latest_stats():
    """Get the latest run stats."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT * FROM runs ORDER BY run_date DESC LIMIT 1")
    row = c.fetchone()
    conn.close()

    if not row:
        return None
    return dict(row)

def get_stats_for_date(date_str):
    """Get run stats for a specific date."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT * FROM runs WHERE run_date = ? LIMIT 1", (date_str,))
    row = c.fetchone()
    conn.close()

    if not row:
        return None
    return dict(row)

def get_articles_for_run(run_id):
    """Get all articles for a specific run."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("SELECT * FROM articles WHERE run_id = ? ORDER BY title", (run_id,))
    rows = c.fetchall()
    conn.close()

    return [dict(row) for row in rows]

def get_history(days=14):
    """Get run history for the last N days."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("""
        SELECT * FROM runs
        ORDER BY run_date DESC
        LIMIT ?
    """, (days,))
    rows = c.fetchall()
    conn.close()

    return [dict(row) for row in reversed(rows)]

def get_progress():
    """Get current progress."""
    return _progress
