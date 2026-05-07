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

    # Split "without links" into videos, plus articles, and normal articles
    videos_without_links = [a for a in no_link_articles if a.get("is_video", 0) == 1]
    plus_articles_without_links = [a for a in no_link_articles if a.get("is_plus_article", 0) == 1 and a.get("is_video", 0) == 0]
    normal_articles_without_links = [a for a in no_link_articles if a.get("is_video", 0) == 0 and a.get("is_plus_article", 0) == 0]

    return jsonify({
        "stats": stats,
        "breakdown": {
            "videos": len(videos_without_links),
            "plus_articles": len(plus_articles_without_links),
            "normal_articles": len(normal_articles_without_links),
            "total_without_links": len(no_link_articles)
        },
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

@app.route("/api/link-statistics")
def get_link_statistics():
    date_str = request.args.get("date")

    if date_str:
        stats = checker.get_stats_for_date(date_str)
    else:
        stats = checker.get_latest_stats()

    if not stats:
        return jsonify({"error": "No data available"}), 404

    run_id = stats["id"]
    articles = checker.get_articles_for_run(run_id)

    # Link count distribution (pie chart data)
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

    for article in articles:
        if article.get("is_video", 0) == 1:
            continue

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

        # Count internal vs external
        internal = article.get("internal_links", 0)
        external = article.get("external_links", 0)
        if internal > external:
            internal_external_count["more_internal"] += 1
        elif external > internal:
            internal_external_count["more_external"] += 1
        else:
            internal_external_count["equal"] += 1

    # Calculate totals for internal/external
    total_internal = sum(a.get("internal_links", 0) for a in articles if a.get("is_video", 0) == 0)
    total_external = sum(a.get("external_links", 0) for a in articles if a.get("is_video", 0) == 0)

    return jsonify({
        "link_distribution": link_distribution,
        "internal_external": internal_external_count,
        "totals": {
            "total_internal": total_internal,
            "total_external": total_external,
            "pct_internal": (total_internal / (total_internal + total_external) * 100) if (total_internal + total_external) > 0 else 0,
            "pct_external": (total_external / (total_internal + total_external) * 100) if (total_internal + total_external) > 0 else 0
        }
    })

@app.route("/api/first-paragraph-stats")
def get_first_paragraph_stats():
    date_str = request.args.get("date")
    category_filter = request.args.get("category")

    if date_str:
        stats = checker.get_stats_for_date(date_str)
    else:
        stats = checker.get_latest_stats()

    if not stats:
        return jsonify({"error": "No data available"}), 404

    run_id = stats["id"]
    articles = checker.get_articles_for_run(run_id)

    # Filter by category if specified
    if category_filter and category_filter != "all":
        articles = [a for a in articles if a["category"] == category_filter]

    total = len(articles)
    with_links_in_first_para = sum(1 for a in articles if a["first_paragraph_link_count"] > 0)
    without_links_in_first_para = total - with_links_in_first_para
    pct_with_links = (with_links_in_first_para / total * 100) if total > 0 else 0

    # Get category breakdown
    category_breakdown = {}
    for article in checker.get_articles_for_run(run_id):  # Use all articles for categories
        cat = article["category"]
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

    # Calculate percentages for categories
    for cat in category_breakdown:
        if category_breakdown[cat]["total"] > 0:
            category_breakdown[cat]["pct_with_links"] = (
                category_breakdown[cat]["with_links"] / category_breakdown[cat]["total"] * 100
            )

    return jsonify({
        "stats": {
            "run_date": stats["run_date"],
            "total": total,
            "with_links": with_links_in_first_para,
            "without_links": without_links_in_first_para,
            "pct_with_links": pct_with_links
        },
        "categories": category_breakdown,
        "selected_category": category_filter or "all"
    })

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
