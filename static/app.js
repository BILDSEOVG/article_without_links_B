let trendChart = null;

async function loadStats(date = null) {
    try {
        const url = date ? `/api/stats?date=${date}` : "/api/stats";
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 404) {
                showNoData();
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const stats = data.stats;
        const articles = data.articles_without_links;

        // Update stats cards
        document.getElementById("statDate").textContent = formatDate(stats.run_date);
        document.getElementById("statTotal").textContent = stats.total;
        document.getElementById("statWithLinks").textContent = stats.with_links;
        document.getElementById("statWithoutLinks").textContent = stats.without_links;
        document.getElementById("statPercent").textContent = stats.pct_without_links.toFixed(1) + "%";

        // Update articles table
        const tbody = document.getElementById("articlesBody");
        tbody.innerHTML = "";

        if (articles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #999;">Alle Artikel haben Links</td></tr>';
        } else {
            articles.forEach(article => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td><strong>${escapeHtml(article.title)}</strong></td>
                    <td>${escapeHtml(article.category)}</td>
                    <td>${formatDateTimeShort(article.published_date)}</td>
                    <td><a href="${article.url}" target="_blank">Link ↗</a></td>
                `;
                tbody.appendChild(row);
            });
        }

        document.getElementById("noDataMsg").style.display = "none";
        document.getElementById("articlesTable").style.display = "table";
    } catch (error) {
        console.error("Error loading stats:", error);
        showNoData();
    }
}

async function loadHistory() {
    try {
        const response = await fetch("/api/history");
        const history = await response.json();

        if (history.length === 0) {
            return;
        }

        const ctx = document.getElementById("trendChart").getContext("2d");

        const labels = history.map(h => formatDate(h.run_date));
        const data = history.map(h => h.pct_without_links);

        if (trendChart) {
            trendChart.destroy();
        }

        trendChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [{
                    label: "% Artikel ohne Links",
                    data: data,
                    borderColor: "#667eea",
                    backgroundColor: "rgba(102, 126, 234, 0.1)",
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointBackgroundColor: "#667eea",
                    pointBorderColor: "#fff",
                    pointBorderWidth: 2,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            font: { size: 12 }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: value => value + "%"
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error loading history:", error);
    }
}

async function pollProgress() {
    const maxWait = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();

    return new Promise((resolve) => {
        const interval = setInterval(async () => {
            try {
                const response = await fetch("/api/progress");
                const progress = await response.json();

                const { done, total, phase } = progress;
                const percent = total > 0 ? Math.round((done / total) * 100) : 0;

                document.getElementById("progressSpan").textContent = `${phase}: ${done}/${total} (${percent}%)`;

                if (done >= total && phase === "processing") {
                    clearInterval(interval);
                    document.getElementById("progressSpan").style.display = "none";
                    document.getElementById("runBtn").disabled = false;
                    await loadStats();
                    await loadHistory();
                    resolve();
                }

                if (Date.now() - startTime > maxWait) {
                    clearInterval(interval);
                    document.getElementById("progressSpan").textContent = "Timeout - bitte warten Sie...";
                    document.getElementById("runBtn").disabled = false;
                    resolve();
                }
            } catch (error) {
                console.error("Error polling progress:", error);
            }
        }, 500);
    });
}

async function triggerRun() {
    const btn = document.getElementById("runBtn");
    btn.disabled = true;
    document.getElementById("progressSpan").style.display = "inline";
    document.getElementById("progressSpan").textContent = "Startet...";

    try {
        const response = await fetch("/api/run", { method: "POST" });
        if (response.ok) {
            await pollProgress();
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error("Error triggering run:", error);
        document.getElementById("progressSpan").textContent = "Fehler beim Starten der Prüfung";
        btn.disabled = false;
    }
}

function showNoData() {
    document.getElementById("articlesTable").style.display = "none";
    document.getElementById("noDataMsg").style.display = "block";
    document.getElementById("statDate").textContent = "—";
    document.getElementById("statTotal").textContent = "—";
    document.getElementById("statWithLinks").textContent = "—";
    document.getElementById("statWithoutLinks").textContent = "—";
    document.getElementById("statPercent").textContent = "—";
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatDateTimeShort(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(text) {
    const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Event listeners
document.getElementById("runBtn").addEventListener("click", triggerRun);

document.getElementById("dateInput").addEventListener("change", (e) => {
    if (e.target.value) {
        loadStats(e.target.value);
    } else {
        loadStats();
    }
});

// Initial load
window.addEventListener("load", () => {
    loadStats();
    loadHistory();
});
