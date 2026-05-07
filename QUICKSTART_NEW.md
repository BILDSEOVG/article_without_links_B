# Quick Start Guide: GitHub Pages Dashboard

## What Changed?

Your BILD Link Checker has been transformed from a Mac-dependent local app to a cloud-hosted dashboard:

- ✅ **Dashboard URL**: `https://bildseovg.github.io/article_without_links_B/`
- ✅ **Runs daily**: Automatically at 6:00 AM Berlin time (via GitHub Actions)
- ✅ **No Mac required**: Works even when your computer is off
- ✅ **Data stored**: JSON files in GitHub (version-controlled)

## Setup (One-time)

1. **Push to GitHub** (execute in terminal):
   ```bash
   git push origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository on GitHub
   - Settings → Pages
   - Source: "Deploy from branch"
   - Branch: main
   - Folder: / (root)
   - Click Save

3. **Test manually** (optional):
   - Go to Actions tab
   - Click "Daily Link Check"
   - Click "Run workflow"
   - Wait ~30 seconds
   - Check that new JSON files were created

## How to Use

### View Dashboard
- Open: `https://bildseovg.github.io/article_without_links_B/`
- Displays today's statistics automatically
- All features work: charts, category breakdown, internal/external link analysis

### View Historical Data
- Use the date picker at the top
- Select any date to view that day's statistics
- Trend chart shows last 30 days automatically

### Dashboard Features

**Free-Artikel Tab** (active by default):
- `Alle Links` - Statistics for all articles with links
  - Total articles, with links, without links
  - Breakdown: Videos / Plus-Artikel / Normal articles
  - Link distribution chart (0-5+ links)
  - Internal vs external link chart
  - Table of articles without links
  
- `Links im 1. Absatz` - First paragraph link statistics
  - Category dropdown (filter by "Ressort")
  - Category breakdown table
  - Percentage of articles with links in first paragraph

**Plus-Artikel / Videos Tabs**:
- Coming soon (placeholder)

## How It Works Behind the Scenes

Every day at 6 AM Berlin time:
1. GitHub Actions starts automatically
2. Python script fetches yesterday's articles from bild.de sitemap
3. Analyzes each article (10 in parallel) for links
4. Saves results as JSON file: `data/YYYY-MM-DD.json`
5. Updates history file: `data/history.json`
6. Commits changes to GitHub automatically
7. GitHub Pages rebuilds the site instantly

## Troubleshooting

### Dashboard shows "Keine Daten verfügbar"
- **First time**: Give workflow 30 seconds to run after setup
- **Manually trigger**: Go to Actions → Daily Link Check → Run workflow

### Date picker not showing historical data
- JSON files must exist in `data/YYYY-MM-DD.json` format
- Workflow must have run successfully
- Check git history: `git log --oneline`

### Data not updating
- Check Actions tab for any workflow errors
- Verify workflow file: `.github/workflows/daily_check.yml`
- Manual trigger: Actions → Daily Link Check → Run workflow

## File Locations

```
Root (served via GitHub Pages):
├── index.html           ← Dashboard (static HTML)
├── app.js               ← Dashboard logic (static JS)
├── style.css            ← Dashboard styling
└── data/
    ├── 2026-05-06.json  ← Daily data files
    └── history.json     ← Historical summaries (30 days)

Behind the scenes (GitHub Actions):
└── .github/workflows/daily_check.yml  ← Scheduler config
└── scripts/run_check.py                ← Python scraper
```

## Support

For issues or questions:
- Check git history: `git log --oneline -20`
- Review workflow logs: GitHub → Actions → Daily Link Check (latest run)
- Read: `MIGRATION_COMPLETE.md` (technical details)

---

**Note**: All data and statistics are now cloud-based. Your Mac is no longer required for daily execution!
