let trendChart = null;
let linkDistributionChart = null;
let internalExternalChart = null;

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

        // Update breakdown
        if (data.breakdown) {
            document.getElementById("breakdownVideos").textContent = data.breakdown.videos;
            document.getElementById("breakdownPlus").textContent = data.breakdown.plus_articles;
            document.getElementById("breakdownNormal").textContent = data.breakdown.normal_articles;
        }

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

// Tab switching
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const tabName = btn.getAttribute("data-tab");

        // Update active button
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        // Update active content
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        document.getElementById(tabName).classList.add("active");

        // Load content
        if (tabName === "tab-first-para") {
            loadFirstParaStats();
        }
    });
});

async function loadFirstParaStats(category = null) {
    try {
        const dateInput = document.getElementById("dateInput");
        const date = dateInput.value || null;

        let url = "/api/first-paragraph-stats";
        const params = new URLSearchParams();
        if (date) params.append("date", date);
        if (category) params.append("category", category);

        if (params.toString()) {
            url += "?" + params.toString();
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const stats = data.stats;
        const categories = data.categories;

        // Update stats cards
        document.getElementById("fpStatDate").textContent = formatDate(stats.run_date);
        document.getElementById("fpStatTotal").textContent = stats.total;
        document.getElementById("fpStatWithLinks").textContent = stats.with_links;
        document.getElementById("fpStatWithoutLinks").textContent = stats.without_links;
        document.getElementById("fpStatPercent").textContent = stats.pct_with_links.toFixed(1) + "%";

        // Update category dropdown
        const select = document.getElementById("categorySelect");
        const currentValue = select.value;
        const options = select.querySelectorAll("option:not(:first-child)");
        options.forEach(o => o.remove());

        Object.keys(categories).sort().forEach(cat => {
            const option = document.createElement("option");
            option.value = cat;
            option.textContent = `${cat} (${categories[cat].total})`;
            select.appendChild(option);
        });

        if (select.querySelector(`option[value="${currentValue}"]`)) {
            select.value = currentValue;
        }

        // Render category breakdown
        renderCategoryBreakdown(categories);

    } catch (error) {
        console.error("Error loading first paragraph stats:", error);
    }
}

function renderCategoryBreakdown(categories) {
    const container = document.getElementById("categoryList");
    container.innerHTML = "";

    Object.keys(categories).sort().forEach(cat => {
        const data = categories[cat];
        const item = document.createElement("div");
        item.className = "category-item";
        item.innerHTML = `
            <div class="category-item-name">${escapeHtml(cat)}</div>
            <div></div>
            <div class="category-item-stat">
                <span class="category-item-stat-label">Gesamt</span>
                <span class="category-item-stat-value">${data.total}</span>
            </div>
            <div class="category-item-stat">
                <span class="category-item-stat-label">Mit Links</span>
                <span class="category-item-stat-value">${data.with_links}</span>
            </div>
            <div class="category-item-stat">
                <span class="category-item-stat-label">%</span>
                <span class="category-item-stat-value">${data.pct_with_links.toFixed(1)}%</span>
            </div>
        `;
        container.appendChild(item);
    });
}

// Event listeners
document.getElementById("runBtn").addEventListener("click", triggerRun);

document.getElementById("dateInput").addEventListener("change", (e) => {
    if (e.target.value) {
        loadStats(e.target.value);
        loadFirstParaStats();
        loadLinkStatistics();
    } else {
        loadStats();
        loadFirstParaStats();
        loadLinkStatistics();
    }
});

document.getElementById("categorySelect").addEventListener("change", (e) => {
    loadFirstParaStats(e.target.value === "all" ? null : e.target.value);
});

document.getElementById("expandBtn").addEventListener("click", () => {
    const select = document.getElementById("categorySelect");
    select.value = "all";
    loadFirstParaStats();
});

async function loadLinkStatistics() {
    try {
        const dateInput = document.getElementById("dateInput");
        const date = dateInput.value || null;

        let url = "/api/link-statistics";
        if (date) {
            url += "?date=" + date;
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const dist = data.link_distribution;
        const ie = data.internal_external;
        const totals = data.totals;

        // Update summary stats
        document.getElementById("totalInternalLinks").textContent = totals.total_internal;
        document.getElementById("totalExternalLinks").textContent = totals.total_external;
        document.getElementById("pctInternalLinks").textContent = totals.pct_internal.toFixed(1) + "%";
        document.getElementById("articlesMoreInternal").textContent = ie.more_internal;

        // Link distribution pie chart
        const ctx1 = document.getElementById("linkDistributionChart");
        if (linkDistributionChart) linkDistributionChart.destroy();

        linkDistributionChart = new Chart(ctx1, {
            type: "doughnut",
            data: {
                labels: ["0 Links", "1 Link", "2 Links", "3 Links", "4 Links", "5+ Links"],
                datasets: [{
                    data: [
                        dist["0_links"],
                        dist["1_link"],
                        dist["2_links"],
                        dist["3_links"],
                        dist["4_links"],
                        dist["5plus_links"]
                    ],
                    backgroundColor: [
                        "#FF6B6B",
                        "#FFD93D",
                        "#6BCB77",
                        "#4D96FF",
                        "#9D84B7",
                        "#FF8FB1"
                    ],
                    borderColor: "white",
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom"
                    }
                }
            }
        });

        // Internal vs external pie chart
        const ctx2 = document.getElementById("internalExternalChart");
        if (internalExternalChart) internalExternalChart.destroy();

        internalExternalChart = new Chart(ctx2, {
            type: "doughnut",
            data: {
                labels: ["Mehr interne", "Mehr externe", "Gleich"],
                datasets: [{
                    data: [
                        ie.more_internal,
                        ie.more_external,
                        ie.equal
                    ],
                    backgroundColor: [
                        "#667eea",
                        "#764ba2",
                        "#ddd"
                    ],
                    borderColor: "white",
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom"
                    }
                }
            }
        });

    } catch (error) {
        console.error("Error loading link statistics:", error);
    }
}

// Initial load
window.addEventListener("load", () => {
    loadStats();
    loadHistory();
    loadFirstParaStats();
    loadLinkStatistics();
});
