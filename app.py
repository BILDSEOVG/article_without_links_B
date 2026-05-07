import os
import logging
from flask import Flask, render_template, jsonify, request
from apscheduler.schedulers.background import BackgroundScheduler
import pytz
from threading import Thread
import checker

app = Flask(__name__)
app.config["JSONIFY_PRETTYPRINT_REGULAR"] = True

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize database on app startup
checker._init_db()

# Prevent scheduler from starting twice in debug mode
scheduler = None

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/stats")
def get_stats():
    date_str = request.args.get("date")

    if date_str:
        stats = checker.get_stats_for_date(date_str)
    else:
        stats = checker.get_latest_stats()

    if not stats:
        return jsonify({"error": "No data available"}), 404

    run_id = stats["id"]
    articles = checker.get_articles_for_run(run_id)
    no_link_articles = [a for a in articles if a["link_count"] == 0]

    return jsonify({
        "stats": stats,
        "articles_without_links": no_link_articles
    })

@app.route("/api/history")
def get_history():
    history = checker.get_history(days=30)
    return jsonify(history)

@app.route("/api/run", methods=["POST"])
def trigger_run():
    def run_in_background():
        try:
            checker.run_check()
        except Exception as e:
            logger.error(f"Error in background run: {e}")

    thread = Thread(target=run_in_background)
    thread.daemon = True
    thread.start()

    return jsonify({"status": "started"})

@app.route("/api/progress")
def get_progress():
    progress = checker.get_progress()
    return jsonify(progress)

def scheduled_check():
    logger.info("Running scheduled check at 6 AM")
    try:
        result = checker.run_check()
        logger.info(f"Scheduled check completed: {result}")
    except Exception as e:
        logger.error(f"Error in scheduled check: {e}")

def init_scheduler():
    global scheduler
    if scheduler is not None:
        return

    checker._init_db()
    scheduler = BackgroundScheduler(timezone="Europe/Berlin")
    scheduler.add_job(
        scheduled_check,
        "cron",
        hour=6,
        minute=0,
        id="daily_check"
    )
    scheduler.start()
    logger.info("Scheduler started, daily check scheduled for 06:00 Berlin time")

if __name__ == "__main__":
    init_scheduler()
    app.run(host="0.0.0.0", port=5002, debug=False, use_reloader=False)
