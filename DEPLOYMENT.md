# Deployment Guide

## Manual Operation

### Start the app in terminal (easiest for testing)

```bash
cd /Users/vivienne.goizet/Applications/sitemap-link-checker
python3 app.py
```

Open `http://localhost:5002` in your browser.

The app will:
1. Start a Flask web server on port 5002
2. Initialize APScheduler to run checks at 6 AM daily (Berlin time)
3. Show a dashboard with articles that have no links

Click "Jetzt prüfen" to manually trigger a check at any time.

### Stop the app

Press `Ctrl+C` in the terminal.

---

## Automated Startup (macOS Launchd)

To make the app run automatically at login and keep running in the background:

### 1. Install as a launchd service

```bash
cp /Users/vivienne.goizet/Applications/sitemap-link-checker/com.bild.linkchecker.plist \
    ~/Library/LaunchAgents/
```

### 2. Load the service

```bash
launchctl load ~/Library/LaunchAgents/com.bild.linkchecker.plist
```

### 3. Verify it's running

```bash
launchctl list | grep linkchecker
```

You should see output like:
```
12345   0   com.bild.linkchecker
```

### 4. Check logs

The app logs to:
- Stdout: `/var/log/bild-linkchecker-stdout.log`
- Stderr: `/var/log/bild-linkchecker-stderr.log`

View logs:
```bash
tail -f /var/log/bild-linkchecker-stdout.log
```

### 5. Access the dashboard

Even when running in the background, the dashboard is accessible at:
```
http://localhost:5002
```

### 6. Stop the service

```bash
launchctl unload ~/Library/LaunchAgents/com.bild.linkchecker.plist
```

### 7. Restart after changes

```bash
launchctl unload ~/Library/LaunchAgents/com.bild.linkchecker.plist
launchctl load ~/Library/LaunchAgents/com.bild.linkchecker.plist
```

---

## Scheduled Check Details

- **Time**: 6:00 AM daily (Berlin/Europe timezone)
- **What it does**: Fetches the sitemap, checks yesterday's articles, counts articles without links
- **Duration**: ~10-15 seconds (for ~325 articles)
- **Storage**: Results saved to SQLite database, viewable in dashboard

---

## Troubleshooting

### App won't start

Check for port 5002 conflicts:
```bash
lsof -i :5002
```

If something is using the port, either change the port in `app.py` or kill the process.

### Scheduler not running

If checks aren't running at 6 AM, make sure:
1. The app is running (check `ps aux | grep app.py`)
2. Your system clock is correct
3. Check timezone: should be Europe/Berlin (UTC+1 or UTC+2 depending on DST)

### Database errors

If you get database errors, delete the old database:
```bash
rm /Users/vivienne.goizet/Applications/sitemap-link-checker/data/link_checker.db
```

A new one will be created on the next run.

### Check sitemap manually

```bash
curl -s https://www.bild.de/sitemap-news.xml | head -50
```

### Run a check manually in Python

```bash
python3 -c "
import sys
sys.path.insert(0, '/Users/vivienne.goizet/Applications/sitemap-link-checker')
import checker
result = checker.run_check()
print('Check result:', result)
"
```

---

## Updating the app

If you make changes to the code:

1. **Stop the app** (if running):
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.bild.linkchecker.plist
   ```

2. **Make your changes** to the Python files

3. **Restart the app**:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.bild.linkchecker.plist
   ```

Or just reload it without stopping:
```bash
launchctl unload ~/Library/LaunchAgents/com.bild.linkchecker.plist
sleep 2
launchctl load ~/Library/LaunchAgents/com.bild.linkchecker.plist
```
