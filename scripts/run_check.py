import os
import json
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import pytz
from urllib.parse import urlparse
import logging
from difflib import SequenceMatcher

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TIMEOUT = 10
MAX_WORKERS = 10
USER_AGENT = "SitemapLinkChecker/1.0 (Firefox)"
TZ_BERLIN = pytz.timezone("Europe/Berlin")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

GERMAN_STOP_WORDS = {
    "dass", "oder", "aber", "auch", "nach", "beim", "sein", "ihre", "ihren",
    "haben", "hatte", "wird", "wurden", "wurde", "durch", "über", "unter",
    "von", "vom", "dem", "den", "der", "die", "das", "eine", "einen", "einer",
    "eines", "wenn", "weil", "nicht", "noch", "mehr", "sehr", "schon",
    "bereits", "immer", "wieder", "dann", "sind", "diese", "diesem", "diesen",
    "dieser", "dieses", "für", "mit", "und", "sich", "zum", "zur", "wie",
    "hier", "dort", "alle", "alles", "kein", "keine", "keinen", "keiner",
    "keines", "ohne", "gegen", "wegen", "trotz", "doch", "damit", "dabei",
    "dazu", "davon", "darum", "daher", "daran", "darauf", "darüber",
    "darunter", "habe", "konnte", "konnten", "musste", "mussten", "sollte",
    "sollten", "wollte", "wollten", "durfte", "durften", "werden", "war",
    "waren", "wäre", "wären", "beim", "kann",
}

GENERIC_ANCHOR_TEXTS = {
    "hier", "hier klicken", "mehr", "mehr lesen", "weiter", "weiter lesen",
    "lesen", "öffnen", "zum artikel", "artikel", "click here", "read more",
    "jetzt", "jetzt lesen", "jetzt klicken", "bitte", "link", "weiterlesen",
    "zum beitrag", "zum thema", "mehr dazu", "alle infos", "hier informieren",
    ">>>", "»", "«",
}


def _extract_keywords(text):
    keywords = set()
    for word in text.lower().split():
        word = word.strip('.,!?:;-"\'()[]{}»«')
        if len(word) >= 4 and word not in GERMAN_STOP_WORDS:
            keywords.add(word)
    return keywords


def _calculate_seo_score(article):
    h2_text = article.get("h2_full_text", "") or article.get("h1_text", "")
    keywords = _extract_keywords(h2_text)
    score = 0
    criteria = {}

    h3_headings = article.get("h3_headings", [])

    # H3 count: 1 per H3
    h3_pts = len(h3_headings)
    criteria["h3_count"] = {"points": h3_pts, "value": h3_pts}
    score += h3_pts

    # Links: 1 per link, max 8
    link_count = article.get("link_count", 0)
    link_pts = min(link_count, 8)
    criteria["links"] = {"points": link_pts, "value": link_count, "max": 8}
    score += link_pts

    # Keyword in H3: 1 per H3 with keyword
    kw_h3 = sum(1 for h3 in h3_headings if keywords and any(kw in h3.lower() for kw in keywords))
    criteria["keyword_in_h3"] = {"points": kw_h3, "value": kw_h3}
    score += kw_h3

    # Rich media: 1 per type (table, video, widget, list, infographic)
    rich_pts = 0
    rich_detail = {}
    for key, label in [
        ("has_table", "table"), ("embedded_video_count", "video"),
        ("has_widget", "widget"), ("has_list", "list"), ("has_infographic", "infographic"),
    ]:
        present = bool(article.get(key, 0))
        if present:
            rich_pts += 1
        rich_detail[label] = present
    criteria["rich_media"] = {"points": rich_pts, "detail": rich_detail}
    score += rich_pts

    # No link in first paragraph: 1 point
    no_fp = 1 if article.get("first_paragraph_link_count", 0) == 0 else 0
    criteria["no_first_para_link"] = {"points": no_fp}
    score += no_fp

    # No duplicate links: 1 point
    links_detail = article.get("links_detail", [])
    hrefs = [l.get("href", "") for l in links_detail]
    no_dupes = 1 if not hrefs or len(hrefs) == len(set(hrefs)) else 0
    criteria["no_duplicate_links"] = {"points": no_dupes}
    score += no_dupes

    # Keyword in image captions: 1 point
    img_captions = article.get("img_captions", [])
    caption_text = " ".join(img_captions).lower()
    kw_caption = 1 if keywords and img_captions and any(kw in caption_text for kw in keywords) else 0
    criteria["keyword_in_caption"] = {"points": kw_caption}
    score += kw_caption

    # Good anchor texts: 1 per specific, non-generic anchor
    anchor_pts = sum(
        1 for l in links_detail
        if l.get("anchor_text", "").strip().lower() not in GENERIC_ANCHOR_TEXTS
        and len(l.get("anchor_text", "").strip()) >= 3
    )
    criteria["anchor_texts"] = {"points": anchor_pts, "value": anchor_pts}
    score += anchor_pts

    # Main keyword in page title: 1 point
    page_title = article.get("page_title", "").lower()
    kw_in_title = 1 if keywords and page_title and any(kw in page_title for kw in keywords) else 0
    criteria["keyword_in_title"] = {"points": kw_in_title}
    score += kw_in_title

    # Page title < 100 chars: 1 point
    title_len = len(article.get("page_title", ""))
    title_ok = 1 if 0 < title_len < 100 else 0
    criteria["title_length"] = {"points": title_ok, "value": title_len}
    score += title_ok

    # Meta description < 160 chars: 1 point
    meta_desc = article.get("meta_description", "")
    meta_len = len(meta_desc)
    meta_ok = 1 if 0 < meta_len < 160 else 0
    criteria["meta_desc_length"] = {"points": meta_ok, "value": meta_len}
    score += meta_ok

    # Meta description adds info beyond title: 1 point
    meta_extra = 0
    if meta_desc and page_title:
        title_words = {w.strip(".,!?") for w in page_title.lower().split()}
        desc_words = {w.strip(".,!?") for w in meta_desc.lower().split()}
        extra_words = desc_words - title_words - GERMAN_STOP_WORDS
        meta_extra = 1 if len(extra_words) >= 3 else 0
    criteria["meta_desc_extra"] = {"points": meta_extra}
    score += meta_extra

    # Unique H3s (≥3 words or contains digit): 1 each
    unique_h3 = sum(
        1 for h3 in h3_headings
        if len(h3.split()) >= 3 or any(c.isdigit() for c in h3)
    )
    criteria["unique_h3"] = {"points": unique_h3, "value": unique_h3}
    score += unique_h3

    return {"total": score, "criteria": criteria}

def _get_category_from_url(url):
    path = urlparse(url).path
    parts = path.split('/')

    ressort_mapping = {
        "sport": "Sport",
        "unterhaltung": "Unterhaltung",
        "leben": "Leben",
        "politik": "Politik",
        "wirtschaft": "Wirtschaft",
        "news": "News",
        "us": "News",
        "world": "News",
        "bild-plus": "News",
        "regional": "Regional",
        "bayern": "Regional",
        "berlin": "Regional",
        "hamburg": "Regional",
        "köln": "Regional",
        "duesseldorf": "Regional",
        "frankfurt": "Regional",
        "muenchen": "Regional",
        "schleswig-holstein": "Regional",
        "niedersachsen": "Regional",
        "nrw": "Regional",
        "sachsen": "Regional",
        "author": "News",
        "autor": "News"
    }

    if len(parts) > 1 and parts[1]:
        segment = parts[1].lower()
        return ressort_mapping.get(segment, "News")

    return "News"

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

        # H1 vs. H2 Ähnlichkeit
        h1_text = ""
        h2_kicker = ""
        h2_headline = ""
        h2_full_text = ""
        h1_h2_similarity = 0.0

        h1_tag = soup.find("h1")
        h1_text = h1_tag.get_text(strip=True) if h1_tag else ""

        h2 = soup.find("h2", class_=lambda c: c and "document-title" in c) if not is_video else None
        if h2:
            kicker_span = h2.find("span", class_="kicker")
            headline_span = h2.find("span", class_="headline")
            h2_kicker = kicker_span.get_text(strip=True) if kicker_span else ""
            h2_headline = headline_span.get_text(strip=True) if headline_span else ""
            h2_full_text = h2.get_text(strip=True)

            if h1_text and h2_full_text:
                similarity = SequenceMatcher(None, h1_text.lower(), h2_full_text.lower()).ratio()
                h1_h2_similarity = round(similarity * 100, 1)

        link_count = 0
        first_paragraph_link_count = 0
        internal_links = 0
        external_links = 0
        links_detail = []

        if main and not is_video:
            text_links = main.find_all("a", class_="text-link")

            for link in text_links:
                href = link.get("href", "")
                href_lower = href.lower()

                if "images." in href_lower or "bildstatic.de" in href_lower:
                    continue

                parent = link.find_parent("div", class_="video-centre")
                if parent:
                    continue

                link_count += 1
                links_detail.append({"href": href, "anchor_text": link.get_text(strip=True)})

                if href_lower.startswith("/") or "bild.de" in href_lower:
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

        # H3 headings
        h3_headings = []
        if main:
            for h3 in main.find_all("h3"):
                text = h3.get_text(strip=True)
                if text:
                    h3_headings.append(text)

        # Meta description
        meta_description = ""
        meta_desc_tag = (
            soup.find("meta", attrs={"name": "description"}) or
            soup.find("meta", property="og:description")
        )
        if meta_desc_tag:
            meta_description = meta_desc_tag.get("content", "")

        # Page title tag
        page_title = ""
        title_tag_el = soup.find("title")
        if title_tag_el:
            page_title = title_tag_el.get_text(strip=True)

        # Image captions
        img_captions = []
        if main:
            for figcaption in main.find_all("figcaption"):
                text = figcaption.get_text(strip=True)
                if text:
                    img_captions.append(text)

        # Rich media detection via HTML string
        has_table = False
        has_list = False
        embedded_video_count = 0
        has_widget = False
        has_infographic = False
        if main and not is_video:
            main_html = str(main).lower()
            has_table = "<table" in main_html
            has_list = "<ul" in main_html or "<ol" in main_html
            embedded_video_count = main_html.count("video-centre")
            has_widget = "<iframe" in main_html or "twitter-tweet" in main_html or "instagram-media" in main_html
            has_infographic = "<svg" in main_html or "infografik" in main_html or "infographic" in main_html

        return {
            "url": url,
            "title": title,
            "link_count": link_count,
            "first_paragraph_link_count": first_paragraph_link_count,
            "is_video": 1 if is_video else 0,
            "is_plus_article": 1 if is_plus_article else 0,
            "internal_links": internal_links,
            "external_links": external_links,
            "h1_text": h1_text,
            "h2_kicker": h2_kicker,
            "h2_headline": h2_headline,
            "h2_full_text": h2_full_text,
            "h1_h2_similarity": h1_h2_similarity,
            "links_detail": links_detail,
            "h3_headings": h3_headings,
            "meta_description": meta_description,
            "page_title": page_title,
            "img_captions": img_captions,
            "has_table": has_table,
            "has_list": has_list,
            "embedded_video_count": embedded_video_count,
            "has_widget": has_widget,
            "has_infographic": has_infographic,
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
            "h1_text": "",
            "h2_kicker": "",
            "h2_headline": "",
            "h2_full_text": "",
            "links_detail": [],
            "h3_headings": [],
            "meta_description": "",
            "page_title": "",
            "img_captions": [],
            "has_table": False,
            "has_list": False,
            "embedded_video_count": 0,
            "has_widget": False,
            "has_infographic": False,
            "h1_h2_similarity": 0.0,
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

    # Free-Artikel without links (add category)
    no_link_articles = []
    for url, a in free_articles.items():
        if a["link_count"] == 0:
            a["category"] = _get_category_from_url(url)
            no_link_articles.append(a)

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

    # Autor pages without links (add category)
    autor_no_link_articles = []
    for url, a in autor_articles.items():
        if a["link_count"] == 0:
            a["category"] = _get_category_from_url(url)
            autor_no_link_articles.append(a)

    # H1 vs. H2 Ähnlichkeit für Free-Artikel
    h1_h2_stats = {
        "total": len(free_articles),
        "above_90": sum(1 for a in free_articles.values() if a.get("h1_h2_similarity", 0) >= 90),
        "above_80": sum(1 for a in free_articles.values() if 80 <= a.get("h1_h2_similarity", 0) < 90),
        "below_80": sum(1 for a in free_articles.values() if a.get("h1_h2_similarity", 0) < 80),
        "average_similarity": round(
            sum(a.get("h1_h2_similarity", 0) for a in free_articles.values()) / len(free_articles), 1
        ) if free_articles else 0.0
    }
    h1_h2_stats["pct_above_90"] = round(h1_h2_stats["above_90"] / h1_h2_stats["total"] * 100, 1) if h1_h2_stats["total"] else 0.0
    h1_h2_stats["pct_above_80_plus"] = round((h1_h2_stats["above_90"] + h1_h2_stats["above_80"]) / h1_h2_stats["total"] * 100, 1) if h1_h2_stats["total"] else 0.0
    h1_h2_articles = sorted(
        list(free_articles.values()),
        key=lambda a: a.get("h1_h2_similarity", 0),
        reverse=True
    )

    # SEO score per article
    for article in h1_h2_articles:
        article["seo_score"] = _calculate_seo_score(article)

    seo_scores = [a["seo_score"]["total"] for a in h1_h2_articles]
    avg_seo_score = round(sum(seo_scores) / len(seo_scores), 1) if seo_scores else 0.0

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
        },
        "h1_h2": {
            "stats": h1_h2_stats,
            "articles": h1_h2_articles
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
        "pct_without_links": pct_without_links,
        "h1_h2": {
            "pct_above_90": h1_h2_stats["pct_above_90"],
            "pct_above_80_plus": h1_h2_stats["pct_above_80_plus"]
        },
        "seo_score": {
            "avg": avg_seo_score
        }
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
