# BILD Sitemap Link Checker

A daily monitoring tool that checks articles from the BILD news sitemap and reports which ones have no internal links.

## What This App Does

Every morning at 6 AM (Berlin time), this app:

1. **Fetches** the BILD news sitemap (`https://www.bild.de/sitemap-news.xml`)
2. **Filters** for articles published yesterday
3. **Scrapes** each article's HTML (325 articles in ~13 seconds)
4. **Counts** articles that have zero `class="text-link"` elements (links to other content)
5. **Stores** results in a local SQLite database
6. **Displays** statistics via a beautiful dashboard

The dashboard shows:
- Total articles checked
- How many have links vs. don't have links
- A 14-day trend chart
- Detailed table of articles without links
- Historical data you can browse by date

## Why This Matters

Internal links between articles are important for:
- **SEO**: Linking to related articles helps search engines crawl and rank content
- **User engagement**: Readers can discover related stories
- **Editorial quality**: Articles should reference and contextualize related news

Articles with no links might be:
- Breaking news written quickly (no time to link)
- Low-priority content
- Accidentally published without links
- Written by new staff unfamiliar with linking standards

## Technical Architecture

```
┌─ checker.py ──────────────────────────┐
│ • Fetch sitemap                        │
│ • Filter yesterday's articles          │
│ • Parallel scrape (10 workers)        │
│ • Count text-link elements            │
│ • Store in SQLite                     │
└────────────────────────────────────────┘
         ↓
    SQLite DB
         ↓
┌─ app.py ───────────────────────────────┐
│ • Flask web server (port 5002)         │
│ • APScheduler (6 AM daily)             │
│ • REST API endpoints                   │
│ • Static files & templates             │
└────────────────────────────────────────┘
         ↓
    Browser Dashboard
    (HTML + CSS + JS)
```

## Key Features

- **Automatic Scheduling**: Runs at 6 AM daily without manual intervention
- **Fast Scraping**: 325 articles in ~13 seconds using ThreadPoolExecutor
- **Persistent Storage**: SQLite database for historical analysis
- **Beautiful Dashboard**: Modern UI with trend charts and data tables
- **Manual Trigger**: Run checks on-demand from the dashboard
- **Date Navigation**: View historical data for any past run
- **Production Ready**: Includes launchd config for background operation

## Technology Stack

- **Backend**: Python 3 + Flask
- **Scraping**: requests + BeautifulSoup4
- **Scheduling**: APScheduler
- **Database**: SQLite3
- **Frontend**: Vanilla HTML + CSS + JavaScript
- **Charts**: Chart.js for trend visualization

## Data Model

### `runs` Table
```
id                    - Primary key
run_date              - Date articles were checked (YYYY-MM-DD)
total                 - Total articles found
with_links            - Articles with at least one link
without_links         - Articles with zero links
pct_without_links     - Percentage without links
created_at            - Timestamp of check
```

### `articles` Table
```
id                    - Primary key
run_id                - Foreign key to runs table
url                   - Full article URL
title                 - Article headline
link_count            - Number of text-link elements found
category              - Section (sport, politik, etc.)
published_date        - Article publication date
```

## Performance

- Sitemap fetch: ~1 second
- Per-article scrape: ~40ms average (with 10 parallel workers)
- Total for 325 articles: ~13-15 seconds
- Database operations: Negligible

## Deployment Options

### Manual (Development)
```bash
python3 app.py
```

### Automated (Production)
```bash
cp com.bild.linkchecker.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.bild.linkchecker.plist
```

The app will then:
- Start automatically on login
- Run checks at 6 AM daily
- Keep running 24/7 in the background
- Be accessible at `http://localhost:5002`

## Files

- `checker.py` - Core logic (sitemap fetch, scraping, analysis)
- `app.py` - Flask app with APScheduler integration
- `templates/index.html` - Dashboard UI
- `static/style.css` - Dashboard styling
- `static/app.js` - Dashboard interactivity
- `requirements.txt` - Python dependencies
- `com.bild.linkchecker.plist` - macOS launchd config
- `README.md` - Full documentation
- `DEPLOYMENT.md` - Deployment instructions
- `QUICKSTART.txt` - Quick reference guide

## Browser Compatibility

The dashboard works in any modern browser:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Links & References

- **BILD Sitemap**: https://www.bild.de/sitemap-news.xml
- **APScheduler**: https://apscheduler.readthedocs.io/
- **Flask**: https://flask.palletsprojects.com/
- **BeautifulSoup4**: https://www.crummy.com/software/BeautifulSoup/

---

**Status**: ✅ Production Ready

**Last Updated**: 2026-05-07

**License**: Internal Use
