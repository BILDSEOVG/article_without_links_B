# Migration Complete: Flask → GitHub Pages + GitHub Actions

## Summary of Changes

### New Architecture
- **GitHub Actions** (`.github/workflows/daily_check.yml`): Runs cron job daily at 4:00 UTC (6:00 Berlin CET / 7:00 Berlin CEST)
- **JSON Data Files** (`data/YYYY-MM-DD.json`, `data/history.json`): Replace SQLite database
- **Static HTML/CSS/JS** (root directory): Replace Flask + Jinja2 templates
- **No Local Dependencies**: Dashboard works entirely via GitHub Pages

### Files Created

#### Core Infrastructure
- ✅ `.github/workflows/daily_check.yml` - Daily scheduled workflow (cron + manual trigger)
- ✅ `scripts/run_check.py` - Pure Python scraper (ported from checker.py)
- ✅ `data/YYYY-MM-DD.json` - Daily statistics (all four API responses combined)
- ✅ `data/history.json` - Historical run summaries (last 30 days)

#### Frontend (Static)
- ✅ `index.html` - Removed Jinja2, uses relative paths, removed "Jetzt prüfen" button
- ✅ `app.js` - Fetch JSON instead of API calls, removed triggerRun() and pollProgress()
- ✅ `style.css` - Copied from static/, removed unused button styles

### Files Deleted
- ✅ `app.py` - Flask server (no longer needed)
- ✅ `checker.py` - SQLite-based scraper (replaced by scripts/run_check.py)
- ✅ `requirements.txt` - Flask/APScheduler dependencies
- ✅ `templates/` - Jinja2 templates (replaced by static index.html)
- ✅ `static/` - Old CSS/JS files (replaced by root-level versions)

## Data Format

Each daily file (`data/2026-05-06.json`) contains:

```json
{
  "stats": {
    "run_date": "2026-05-06",
    "total": 324,
    "with_links": 167,
    "without_links": 157,
    "pct_without_links": 48.5
  },
  "breakdown": {
    "videos": 67,
    "plus_articles": 0,
    "normal_articles": 90
  },
  "articles_without_links": [ ... ],
  "link_distribution": { "0_links": ..., "5plus_links": ... },
  "internal_external": { "more_internal": ..., "more_external": ..., "equal": ... },
  "totals": { "total_internal": ..., "total_external": ..., "pct_internal": ... },
  "first_paragraph": {
    "stats": { ... },
    "categories": { ... }
  }
}
```

## Next Steps: GitHub Configuration

1. **Push to GitHub** (if not already done):
   ```bash
   git push origin main
   ```

2. **Configure GitHub Pages**:
   - Go to Repository Settings → Pages
   - Source: Deploy from branch
   - Branch: main
   - Folder: / (root)
   - Save

3. **Test Workflow**:
   - Go to Actions tab
   - Click "Daily Link Check" workflow
   - Click "Run workflow" (workflow_dispatch)
   - Wait ~30 seconds for completion
   - Verify `data/YYYY-MM-DD.json` is created and committed

4. **Verify Dashboard**:
   - Dashboard URL: `https://bildseovg.github.io/article_without_links_B/`
   - Should display latest data with all statistics
   - Date picker should work for historical data

## How It Works

### Daily Execution (4:00 UTC = 6:00 Berlin)
1. GitHub Actions runner starts
2. Clones repository
3. Installs Python dependencies (requests, beautifulsoup4, lxml, pytz)
4. Runs `scripts/run_check.py`
   - Fetches yesterday's articles from bild.de sitemap
   - Scrapes each article (10 parallel workers)
   - Generates `data/YYYY-MM-DD.json` with all statistics
   - Appends summary to `data/history.json` (keeps last 30 days)
5. Commits changes with git bot account
6. Pushes to main branch
7. GitHub Pages automatically rebuilds

### Frontend Display
1. User opens `https://bildseovg.github.io/article_without_links_B/`
2. `index.html` loads
3. `app.js` initializes:
   - Fetches `data/history.json` for trend chart
   - Fetches latest daily file (or selected date) for all statistics
   - Renders charts, tables, and statistics
4. User can pick a date with date picker
5. All data loads from JSON files in `data/` directory

## Benefits

| Before | After |
|--------|-------|
| ❌ Only works when Mac is on | ✅ Runs reliably on GitHub servers |
| ❌ Local SQLite database | ✅ JSON files in repository (version controlled) |
| ❌ Manual Flask server | ✅ Static hosting (GitHub Pages) |
| ❌ APScheduler limited | ✅ GitHub Actions cron (CRON_TZ aware) |
| ❌ Complex deployment | ✅ Simple: just push to main |
| ❌ No execution history | ✅ All data in git history |

## Reusable Code (from checker.py)

The following functions were ported as-is to `scripts/run_check.py`:
- `_scrape_url()` - Article scraping with link detection
- `_fetch_sitemap()` - Sitemap fetching
- `_get_yesterday_articles()` - Date filtering
- `_scrape_articles_parallel()` - Parallel scraping with ThreadPoolExecutor
- `_get_category_from_url()` - Category extraction from URL

All link detection logic (text-link class, filter images/bildstatic/video-centre, internal/external classification) preserved exactly.

## Initial Test Run

Completed: 2026-05-06
- Found 324 articles
- Completed in ~15 seconds (10 parallel workers)
- Generated `data/2026-05-06.json` (75 KB)
- Generated `data/history.json` (151 B)
