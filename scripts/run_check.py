import os
import json
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import pytz
from urllib.parse import urlparse
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TIMEOUT = 10
MAX_WORKERS = 10
USER_AGENT = "SitemapLinkChecker/1.0 (Firefox)"
TZ_BERLIN = pytz.timezone("Europe/Berlin")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

def _get_category_from_url(url):
    path = urlparse(url).path
    parts = path.split('/')
    if len(parts) > 1:
        if parts[1] == "autor":
            return "autor"
        elif parts[1]:
            return parts[1]
    return "other"

def _is_autor_page(url):
    path = urlparse(url).path
    return "/autor/" in path

def _scrape_url(url):
    try:
        resp = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT})
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "lxml")

        title_tag = soup.find("meta", property="og:title")
        title = title_tag.get("content", "Unknown") if title_tag else "Unknown"

        og_type = soup.find("meta", property="og:type")
        is_video = og_type and og_type.get("content") == "video"

        main = soup.find("main", id="main")
        if not main:
            main = soup.find("main")

        is_plus_article = False
        if soup:
            paywall = soup.find("div", class_="paywall")
            plus_logo = soup.find("span", class_="plus-logo")
            is_plus_article = paywall is not None or plus_logo is not None

            if not is_plus_article:
                ob_extras = soup.find("meta", attrs={"name": "ob:extras"})
                if ob_extras:
                    content = ob_extras.get("content", "")
                    is_plus_article = "isPremium=true" in content

        link_count = 0
        first_paragraph_link_count = 0
        internal_links = 0
        external_links = 0

        if main and not is_video:
            text_links = main.find_all("a", class_="text-link")

            for link in text_links:
                href = link.get("href", "").lower()

                if "images." in href or "bildstatic.de" in href:
                    continue

                parent = link.find_parent("div", class_="video-centre")
                if parent:
                    continue

                link_count += 1

                if href.startswith("/") or "bild.de" in href:
                    internal_links += 1
                else:
                    external_links += 1

            first_paragraph = main.find("p")
            if first_paragraph:
                para_links = first_paragraph.find_all("a", class_="text-link")
                for link in para_links:
                    href = link.get("href", "").lower()
                    if "images." not in href and "bildstatic.de" not in href:
                        parent = link.find_parent("div", class_="video-centre")
                        if not parent:
                            first_paragraph_link_count += 1

        return {
            "url": url,
            "title": title,
            "link_count": link_count,
            "first_paragraph_link_count": first_paragraph_link_count,
            "is_video": 1 if is_video else 0,
            "is_plus_article": 1 if is_plus_article else 0,
            "internal_links": internal_links,
            "external_links": external_links,
            "error": None
        }
    except Exception as e:
        logger.error(f"Error scraping {url}: {e}")
        return {
            "url": url,
            "title": "Unknown",
            "link_count": 0,
            "first_paragraph_link_count": 0,
            "is_video": 0,
            "is_plus_article": 0,
            "internal_links": 0,
            "external_links": 0,
            "error": str(e)
        }

def _fetch_sitemap():
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

def _scrape_articles_parallel(articles):
    results = {}

    def scrape_wrapper(article):
        result = _scrape_url(article["url"])
        result["title"] = article["title"]
        result["published_date"] = article["published_date"]
        return article["url"], result

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        for url, result in executor.map(scrape_wrapper, articles):
            results[url] = result

    return results

def run_check():
    os.makedirs(DATA_DIR, exist_ok=True)

    sitemap_soup = _fetch_sitemap()
    yesterday_articles = _get_yesterday_articles(sitemap_soup)

    logger.info(f"Found {len(yesterday_articles)} articles from yesterday")

    scraped = _scrape_articles_parallel(yesterday_articles)

    # Separate autor pages from regular articles
    autor_articles = {url: data for url, data in scraped.items() if _is_autor_page(url)}
    regular_articles = {url: data for url, data in scraped.items() if not _is_autor_page(url)}

    # Free-Artikel statistics (excluding videos and plus articles)
    free_articles = {url: data for url, data in regular_articles.items()
                     if data.get("is_video", 0) == 0 and data.get("is_plus_article", 0) == 0}
    free_total = len(free_articles)
    free_with_links = sum(1 for r in free_articles.values() if r["link_count"] > 0)
    free_without_links = free_total - free_with_links
    free_pct_without_links = (free_without_links / free_total * 100) if free_total > 0 else 0

    # Keep old variable names for compatibility
    total = free_total
    with_links = free_with_links
    without_links = free_without_links
    pct_without_links = free_pct_without_links

    # Autor pages statistics
    autor_total = len(autor_articles)
    autor_with_links = sum(1 for r in autor_articles.values() if r["link_count"] > 0)
    autor_without_links = autor_total - autor_with_links
    autor_pct_without_links = (autor_without_links / autor_total * 100) if autor_total > 0 else 0

    yesterday = datetime.now(TZ_BERLIN) - timedelta(days=1)
    run_date = yesterday.date().isoformat()

    # Free-Artikel without links
    no_link_articles = [a for a in free_articles.values() if a["link_count"] == 0]

    # Link distribution for regular articles (excluding videos)
    link_distribution = {
        "0_links": 0,
        "1_link": 0,
        "2_links": 0,
        "3_links": 0,
        "4_links": 0,
        "5plus_links": 0
    }

    internal_external_count = {
        "more_internal": 0,
        "more_external": 0,
        "equal": 0
    }

    for article in free_articles.values():
        link_count = article.get("link_count", 0)
        if link_count == 0:
            link_distribution["0_links"] += 1
        elif link_count == 1:
            link_distribution["1_link"] += 1
        elif link_count == 2:
            link_distribution["2_links"] += 1
        elif link_count == 3:
            link_distribution["3_links"] += 1
        elif link_count == 4:
            link_distribution["4_links"] += 1
        else:
            link_distribution["5plus_links"] += 1

        internal = article.get("internal_links", 0)
        external = article.get("external_links", 0)
        if internal > external:
            internal_external_count["more_internal"] += 1
        elif external > internal:
            internal_external_count["more_external"] += 1
        else:
            internal_external_count["equal"] += 1

    total_internal = sum(a.get("internal_links", 0) for a in free_articles.values())
    total_external = sum(a.get("external_links", 0) for a in free_articles.values())

    # Category breakdown for free articles only
    category_breakdown = {}
    for article in free_articles.values():
        cat = article.get("category", _get_category_from_url(article["url"]))
        if cat not in category_breakdown:
            category_breakdown[cat] = {
                "total": 0,
                "with_links": 0,
                "without_links": 0,
                "pct_with_links": 0
            }
        category_breakdown[cat]["total"] += 1
        if article["first_paragraph_link_count"] > 0:
            category_breakdown[cat]["with_links"] += 1
        else:
            category_breakdown[cat]["without_links"] += 1

    for cat in category_breakdown:
        if category_breakdown[cat]["total"] > 0:
            category_breakdown[cat]["pct_with_links"] = (
                category_breakdown[cat]["with_links"] / category_breakdown[cat]["total"] * 100
            )

    # First paragraph stats for free articles only
    first_para_with_links = sum(1 for a in free_articles.values() if a["first_paragraph_link_count"] > 0)
    first_para_without_links = len(free_articles) - first_para_with_links
    first_para_pct = (first_para_with_links / len(free_articles) * 100) if len(free_articles) > 0 else 0

    # Autor pages without links
    autor_no_link_articles = [a for a in autor_articles.values() if a["link_count"] == 0]

    daily_data = {
        "stats": {
            "run_date": run_date,
            "total": total,
            "with_links": with_links,
            "without_links": without_links,
            "pct_without_links": pct_without_links
        },
        "articles_without_links": no_link_articles,
        "link_distribution": link_distribution,
        "internal_external": internal_external_count,
        "totals": {
            "total_internal": total_internal,
            "total_external": total_external,
            "pct_internal": (total_internal / (total_internal + total_external) * 100) if (total_internal + total_external) > 0 else 0
        },
        "first_paragraph": {
            "stats": {
                "run_date": run_date,
                "total": len(free_articles),
                "with_links": first_para_with_links,
                "without_links": first_para_without_links,
                "pct_with_links": first_para_pct
            },
            "categories": category_breakdown
        },
        "autorenseiten": {
            "stats": {
                "run_date": run_date,
                "total": autor_total,
                "with_links": autor_with_links,
                "without_links": autor_without_links,
                "pct_without_links": autor_pct_without_links
            },
            "articles_without_links": autor_no_link_articles
        }
    }

    daily_file = os.path.join(DATA_DIR, f"{run_date}.json")
    with open(daily_file, "w") as f:
        json.dump(daily_data, f, indent=2, ensure_ascii=False)
    logger.info(f"Wrote daily data to {daily_file}")

    history_file = os.path.join(DATA_DIR, "history.json")
    history = []
    if os.path.exists(history_file):
        with open(history_file, "r") as f:
            history = json.load(f)

    summary = {
        "run_date": run_date,
        "total": total,
        "with_links": with_links,
        "without_links": without_links,
        "pct_without_links": pct_without_links
    }

    history.append(summary)
    history = history[-30:]

    with open(history_file, "w") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)
    logger.info(f"Updated history file with {len(history)} entries")

    logger.info(f"Check complete: {total} articles, {without_links} without links ({pct_without_links:.1f}%)")

    return {
        "run_date": run_date,
        "total": total,
        "with_links": with_links,
        "without_links": without_links,
        "pct_without_links": pct_without_links
    }

if __name__ == "__main__":
    run_check()
