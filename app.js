let trendChart = null;
let linkDistributionChart = null;
let internalExternalChart = null;

let allHistory = [];

async function loadStats(date = null) {
    try {
        let dataFile = date;
        if (!date) {
            if (allHistory.length === 0) {
                await loadHistory();
            }
            if (allHistory.length > 0) {
                dataFile = allHistory[allHistory.length - 1].run_date;
            }
        }

        if (!dataFile) {
            showNoData();
            return;
        }

        const response = await fetch(`./data/${dataFile}.json`);
        if (!response.ok) {
            showNoData();
            return;
        }

        const data = await response.json();
        const stats = data.stats;
        const articles = data.articles_without_links;

        document.getElementById("statDate").textContent = formatDate(stats.run_date);
        document.getElementById("statTotal").textContent = stats.total;
        document.getElementById("statWithLinks").textContent = stats.with_links;
        document.getElementById("statWithoutLinks").textContent = stats.without_links;
        document.getElementById("statPercent").textContent = stats.pct_without_links.toFixed(1) + "%";

        const tbody = document.getElementById("articlesBody");
        tbody.innerHTML = "";

        if (articles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #999;">Alle Artikel haben Links</td></tr>';
        } else {
            articles.forEach(article => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td><strong>${escapeHtml(article.title)}</strong></td>
                    <td>${escapeHtml(article.category || 'unknown')}</td>
                    <td>${formatDateTimeShort(article.published_date)}</td>
                    <td><a href="${article.url}" target="_blank">Link ↗</a></td>
                `;
                tbody.appendChild(row);
            });
        }

        document.getElementById("noDataMsg").style.display = "none";
        document.getElementById("articlesTable").style.display = "table";

        updateLastUpdated(stats.run_date);
    } catch (error) {
        console.error("Error loading stats:", error);
        showNoData();
    }
}

async function loadHistory() {
    try {
        const response = await fetch("./data/history.json");
        if (!response.ok) return;

        allHistory = await response.json();

        if (allHistory.length === 0) {
            return;
        }

        const ctx = document.getElementById("trendChart").getContext("2d");

        const labels = allHistory.map(h => formatDate(h.run_date));
        const data = allHistory.map(h => h.pct_without_links);

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

async function loadFirstParaStats(category = null) {
    try {
        const dateInput = document.getElementById("dateInput");
        const date = dateInput.value || null;

        let dataFile = date;
        if (!date) {
            if (allHistory.length === 0) {
                await loadHistory();
            }
            if (allHistory.length > 0) {
                dataFile = allHistory[allHistory.length - 1].run_date;
            }
        }

        if (!dataFile) return;

        const response = await fetch(`./data/${dataFile}.json`);
        if (!response.ok) return;

        const data = await response.json();
        const stats = data.first_paragraph.stats;
        const categories = data.first_paragraph.categories;

        document.getElementById("fpStatDate").textContent = formatDate(stats.run_date);
        document.getElementById("fpStatTotal").textContent = stats.total;
        document.getElementById("fpStatWithLinks").textContent = stats.with_links;
        document.getElementById("fpStatWithoutLinks").textContent = stats.without_links;
        document.getElementById("fpStatPercent").textContent = stats.pct_with_links.toFixed(1) + "%";

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

async function loadLinkStatistics() {
    try {
        const dateInput = document.getElementById("dateInput");
        const date = dateInput.value || null;

        let dataFile = date;
        if (!date) {
            if (allHistory.length === 0) {
                await loadHistory();
            }
            if (allHistory.length > 0) {
                dataFile = allHistory[allHistory.length - 1].run_date;
            }
        }

        if (!dataFile) return;

        const response = await fetch(`./data/${dataFile}.json`);
        if (!response.ok) return;

        const data = await response.json();
        const dist = data.link_distribution;
        const ie = data.internal_external;
        const totals = data.totals;

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

        // Chart for external links tab
        const ctx3 = document.getElementById("internalExternalChart2");
        if (ctx3) {
            if (window.internalExternalChart2) window.internalExternalChart2.destroy();

            window.internalExternalChart2 = new Chart(ctx3, {
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

            document.getElementById("articlesMoreInternal2").textContent = ie.more_internal;
            document.getElementById("articlesMoreExternal2").textContent = ie.more_external;
            document.getElementById("articlesEqual2").textContent = ie.equal;

            document.getElementById("externalNoDataMsg").style.display = "none";
            document.getElementById("externalArticlesTable").style.display = "table";
        }

    } catch (error) {
        console.error("Error loading link statistics:", error);
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

function updateLastUpdated(dateStr) {
    const date = new Date(dateStr);
    const formatted = date.toLocaleDateString("de-DE", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
    document.getElementById("lastUpdated").textContent = `Zuletzt aktualisiert: ${formatted}`;
}

async function loadH1H2Stats(threshold = null) {
    try {
        const dateInput = document.getElementById("dateInput");
        const date = dateInput.value || null;

        let dataFile = date;
        if (!date) {
            if (allHistory.length === 0) {
                await loadHistory();
            }
            if (allHistory.length > 0) {
                dataFile = allHistory[allHistory.length - 1].run_date;
            }
        }

        if (!dataFile) {
            document.getElementById("h1h2Table").style.display = "none";
            document.getElementById("h1h2NoDataMsg").style.display = "block";
            return;
        }

        const response = await fetch(`./data/${dataFile}.json`);
        if (!response.ok) {
            document.getElementById("h1h2Table").style.display = "none";
            document.getElementById("h1h2NoDataMsg").style.display = "block";
            return;
        }

        const data = await response.json();
        const stats = data.h1_h2.stats;
        let articles = data.h1_h2.articles;

        // Filtern nach Schwellenwert
        if (threshold) {
            articles = articles.filter(a => a.h1_h2_similarity >= threshold);
        }

        // Stats-Karten füllen
        document.getElementById("h1h2StatTotal").textContent = stats.total;
        document.getElementById("h1h2StatAbove90").textContent = stats.above_90;
        document.getElementById("h1h2StatAbove80").textContent = stats.above_80;
        document.getElementById("h1h2StatAverage").textContent = stats.average_similarity + "%";

        // Tabelle füllen
        const tbody = document.getElementById("h1h2Body");
        tbody.innerHTML = "";

        if (articles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">Keine Artikel mit dieser Ähnlichkeit</td></tr>';
        } else {
            articles.forEach(article => {
                const similarity = article.h1_h2_similarity;
                let badgeClass = "similarity-badge--green";
                if (similarity >= 90) badgeClass = "similarity-badge--red";
                else if (similarity >= 80) badgeClass = "similarity-badge--yellow";

                const row = document.createElement("tr");
                row.innerHTML = `
                    <td><strong>${escapeHtml(article.title)}</strong></td>
                    <td style="font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(article.h1_text)}</td>
                    <td style="font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(article.h2_full_text)}</td>
                    <td><span class="similarity-badge ${badgeClass}">${similarity}%</span></td>
                    <td><a href="${article.url}" target="_blank">Link ↗</a></td>
                `;
                tbody.appendChild(row);
            });
        }

        document.getElementById("h1h2NoDataMsg").style.display = "none";
        document.getElementById("h1h2Table").style.display = "table";
    } catch (error) {
        console.error("Error loading H1/H2 stats:", error);
        document.getElementById("h1h2Table").style.display = "none";
        document.getElementById("h1h2NoDataMsg").style.display = "block";
    }
}

document.querySelectorAll(".main-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const tabName = btn.getAttribute("data-tab");

        document.querySelectorAll(".main-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        document.querySelectorAll(".main-tab-content").forEach(c => c.classList.remove("active"));
        document.getElementById(tabName).classList.add("active");
    });
});

document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const tabName = btn.getAttribute("data-tab");

        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        document.getElementById(tabName).classList.add("active");

        if (tabName === "tab-first-para") {
            loadFirstParaStats();
        } else if (tabName === "tab-h1-h2") {
            loadH1H2Stats();
        }
    });
});

function setDateAndLoad(date) {
    document.getElementById("dateInput").value = date;

    // Remove active class from all filter buttons
    document.querySelectorAll(".date-filter-btn").forEach(btn => btn.classList.remove("active"));

    // Reset H1/H2 filter dropdown
    document.getElementById("h1h2FilterSelect").value = "";

    if (date) {
        loadStats(date);
        loadFirstParaStats();
        loadLinkStatistics();
        loadAutorenseiten(date);
        loadH1H2Stats();
    } else {
        loadStats();
        loadFirstParaStats();
        loadLinkStatistics();
        loadAutorenseiten();
        loadH1H2Stats();
    }
}

function getDateForFilter(filterType) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch(filterType) {
        case "yesterday": {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            return yesterday.toISOString().split('T')[0];
        }
        case "week": {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return weekAgo.toISOString().split('T')[0];
        }
        case "month": {
            const monthAgo = new Date(today);
            monthAgo.setDate(monthAgo.getDate() - 30);
            return monthAgo.toISOString().split('T')[0];
        }
        case "all":
            return null;
    }
}

document.getElementById("yesterdayBtn").addEventListener("click", () => {
    const date = getDateForFilter("yesterday");
    setDateAndLoad(date);
    document.getElementById("yesterdayBtn").classList.add("active");
});

document.getElementById("weekBtn").addEventListener("click", () => {
    const date = getDateForFilter("week");
    setDateAndLoad(date);
    document.getElementById("weekBtn").classList.add("active");
});

document.getElementById("monthBtn").addEventListener("click", () => {
    const date = getDateForFilter("month");
    setDateAndLoad(date);
    document.getElementById("monthBtn").classList.add("active");
});

document.getElementById("allBtn").addEventListener("click", () => {
    setDateAndLoad(null);
    document.getElementById("allBtn").classList.add("active");
});

document.getElementById("dateInput").addEventListener("change", (e) => {
    document.querySelectorAll(".date-filter-btn").forEach(btn => btn.classList.remove("active"));

    // Reset H1/H2 filter dropdown
    document.getElementById("h1h2FilterSelect").value = "";

    if (e.target.value) {
        loadStats(e.target.value);
        loadFirstParaStats();
        loadLinkStatistics();
        loadAutorenseiten(e.target.value);
        loadH1H2Stats();
    } else {
        loadStats();
        loadFirstParaStats();
        loadLinkStatistics();
        loadAutorenseiten();
        loadH1H2Stats();
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

document.getElementById("h1h2FilterSelect").addEventListener("change", (e) => {
    const threshold = e.target.value ? parseInt(e.target.value) : null;
    loadH1H2Stats(threshold);
});

async function loadAutorenseiten(date = null) {
    try {
        let dataFile = date;
        if (!date) {
            if (allHistory.length === 0) {
                await loadHistory();
            }
            if (allHistory.length > 0) {
                dataFile = allHistory[allHistory.length - 1].run_date;
            }
        }

        if (!dataFile) {
            document.getElementById("autorArticlesTable").style.display = "none";
            document.getElementById("autorNoDataMsg").style.display = "block";
            return;
        }

        const response = await fetch(`./data/${dataFile}.json`);
        if (!response.ok) {
            document.getElementById("autorArticlesTable").style.display = "none";
            document.getElementById("autorNoDataMsg").style.display = "block";
            return;
        }

        const data = await response.json();
        const stats = data.autorenseiten.stats;
        const articles = data.autorenseiten.articles_without_links;

        document.getElementById("autorStatDate").textContent = formatDate(stats.run_date);
        document.getElementById("autorStatTotal").textContent = stats.total;
        document.getElementById("autorStatWithLinks").textContent = stats.total - stats.without_links;
        document.getElementById("autorStatWithoutLinks").textContent = stats.without_links;
        document.getElementById("autorStatPercent").textContent = stats.pct_without_links.toFixed(1) + "%";

        const tbody = document.getElementById("autorArticlesBody");
        tbody.innerHTML = "";

        if (articles.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #999;">Alle Autorenseiten haben Links</td></tr>';
        } else {
            articles.forEach(article => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td><strong>${escapeHtml(article.title)}</strong></td>
                    <td>${escapeHtml(article.category || 'unknown')}</td>
                    <td>${formatDateTimeShort(article.published_date)}</td>
                    <td><a href="${article.url}" target="_blank">Link ↗</a></td>
                `;
                tbody.appendChild(row);
            });
        }

        document.getElementById("autorNoDataMsg").style.display = "none";
        document.getElementById("autorArticlesTable").style.display = "table";
    } catch (error) {
        console.error("Error loading autorenseiten:", error);
        document.getElementById("autorArticlesTable").style.display = "none";
        document.getElementById("autorNoDataMsg").style.display = "block";
    }
}

window.addEventListener("load", () => {
    loadStats();
    loadHistory();
    loadFirstParaStats();
    loadLinkStatistics();
    loadAutorenseiten();
});
