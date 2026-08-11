let h1h2TrendChart = null;
let optTrendChart = null;
let allHistory = [];
let optLoaded = false;

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

async function loadHistory() {
    try {
        const response = await fetch("./data/history.json");
        if (!response.ok) return;

        allHistory = await response.json();

        if (allHistory.length === 0) {
            return;
        }

        const ctx = document.getElementById("h1h2TrendChart").getContext("2d");
        const labels = allHistory.map(h => formatDate(h.run_date));

        if (h1h2TrendChart) {
            h1h2TrendChart.destroy();
        }

        h1h2TrendChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "≥ 90% ähnlich (kritisch)",
                        data: allHistory.map(h => h.h1_h2?.pct_above_90 ?? null),
                        borderColor: "#FF6B6B",
                        backgroundColor: "rgba(255, 107, 107, 0.1)",
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointBackgroundColor: "#FF6B6B",
                        pointBorderColor: "#fff",
                        pointBorderWidth: 2,
                        pointHoverRadius: 7
                    },
                    {
                        label: "≥ 80% ähnlich (auffällig)",
                        data: allHistory.map(h => h.h1_h2?.pct_above_80_plus ?? null),
                        borderColor: "#e6a817",
                        backgroundColor: "rgba(230, 168, 23, 0.1)",
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointBackgroundColor: "#e6a817",
                        pointBorderColor: "#fff",
                        pointBorderWidth: 2,
                        pointHoverRadius: 7
                    }
                ]
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
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.parsed.y + "%"
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

        if (threshold) {
            articles = articles.filter(a => a.h1_h2_similarity >= threshold);
        }

        document.getElementById("h1h2StatTotal").textContent = stats.total;
        document.getElementById("h1h2StatAbove90").textContent = stats.above_90;
        document.getElementById("h1h2StatAbove80").textContent = stats.above_80;
        document.getElementById("h1h2StatAverage").textContent = stats.average_similarity + "%";

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
        updateLastUpdated(dataFile);
    } catch (error) {
        console.error("Error loading H1/H2 stats:", error);
        document.getElementById("h1h2Table").style.display = "none";
        document.getElementById("h1h2NoDataMsg").style.display = "block";
    }
}

function setDateAndLoad(date) {
    document.getElementById("dateInput").value = date;
    document.querySelectorAll(".date-filter-btn").forEach(btn => btn.classList.remove("active"));
    document.getElementById("h1h2FilterSelect").value = "";

    loadH1H2Stats();
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

function renderOptTrendChart() {
    const histWithScore = allHistory.filter(h => h.seo_score && h.seo_score.avg != null);
    if (histWithScore.length === 0) return;

    const ctx = document.getElementById("optTrendChart").getContext("2d");
    if (optTrendChart) optTrendChart.destroy();

    optTrendChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: histWithScore.map(h => formatDate(h.run_date)),
            datasets: [{
                label: "Ø SEO Score",
                data: histWithScore.map(h => h.seo_score.avg),
                borderColor: "#ff8c42",
                backgroundColor: "rgba(255, 140, 66, 0.1)",
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointBackgroundColor: "#ff8c42",
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, labels: { font: { size: 12 } } },
                tooltip: { callbacks: { label: ctx => "Ø " + ctx.parsed.y.toFixed(1) + " Punkte" } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => v + " Pkt." } }
            }
        }
    });
}

function buildCriteriaCells(c) {
    if (!c) return { h3: "—", links: "—", media: "—", tech: "—" };

    const h3Pts = (c.h3_count?.points || 0) + (c.keyword_in_h3?.points || 0) + (c.unique_h3?.points || 0);
    const h3Title = `H3-Anzahl: ${c.h3_count?.value || 0}P | KW in H3: ${c.keyword_in_h3?.value || 0}P | Einzigartig: ${c.unique_h3?.value || 0}P`;

    const linkPts = (c.links?.points || 0) + (c.no_first_para_link?.points || 0) + (c.no_duplicate_links?.points || 0) + (c.anchor_texts?.points || 0);
    const linkTitle = `Links ${c.links?.value || 0} (max 8): ${c.links?.points || 0}P | Kein Link 1.Abs.: ${c.no_first_para_link?.points || 0}P | Keine Duplikate: ${c.no_duplicate_links?.points || 0}P | Ankertexte: ${c.anchor_texts?.points || 0}P`;

    const mediaPts = c.rich_media?.points || 0;
    const d = c.rich_media?.detail || {};
    const mediaItems = ["table","video","widget","list","infographic"].filter(k => d[k]).join(", ");
    const mediaTitle = `Media: ${mediaItems || "keine"}`;

    const techPts = (c.keyword_in_title?.points || 0) + (c.title_length?.points || 0) + (c.meta_desc_length?.points || 0) + (c.meta_desc_extra?.points || 0) + (c.keyword_in_caption?.points || 0);
    const techTitle = `KW in Seitentitel: ${c.keyword_in_title?.points || 0}P | Titel-Länge (${c.title_length?.value || 0}): ${c.title_length?.points || 0}P | Meta (${c.meta_desc_length?.value || 0}): ${c.meta_desc_length?.points || 0}P | Meta-Zusatz: ${c.meta_desc_extra?.points || 0}P | KW Caption: ${c.keyword_in_caption?.points || 0}P`;

    return {
        h3:    `<span class="criteria-pts" title="${escapeHtml(h3Title)}">${h3Pts}P</span>`,
        links: `<span class="criteria-pts" title="${escapeHtml(linkTitle)}">${linkPts}P</span>`,
        media: `<span class="criteria-pts" title="${escapeHtml(mediaTitle)}">${mediaPts}P</span>`,
        tech:  `<span class="criteria-pts" title="${escapeHtml(techTitle)}">${techPts}P</span>`,
    };
}

async function loadOptimierungsrate() {
    try {
        const dateInput = document.getElementById("optDateInput");
        const date = dateInput.value || null;

        let dataFile = date;
        if (!date) {
            if (allHistory.length === 0) await loadHistory();
            if (allHistory.length > 0) dataFile = allHistory[allHistory.length - 1].run_date;
        }

        if (!dataFile) {
            document.getElementById("optTable").style.display = "none";
            document.getElementById("optNoDataMsg").style.display = "block";
            return;
        }

        const response = await fetch(`./data/${dataFile}.json`);
        if (!response.ok) {
            document.getElementById("optTable").style.display = "none";
            document.getElementById("optNoDataMsg").style.display = "block";
            return;
        }

        const data = await response.json();
        const articles = (data.h1_h2?.articles || []).filter(a => a.seo_score);

        if (articles.length === 0) {
            document.getElementById("optTable").style.display = "none";
            const msg = document.getElementById("optNoDataMsg");
            msg.textContent = "SEO Score noch nicht verfügbar – nach dem nächsten Crawl-Lauf erneut aufrufen.";
            msg.style.display = "block";
            renderOptTrendChart();
            return;
        }

        const scores = articles.map(a => a.seo_score.total);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        document.getElementById("optStatAvg").textContent = avg.toFixed(1);
        document.getElementById("optStatMax").textContent = Math.max(...scores);
        document.getElementById("optStatMin").textContent = Math.min(...scores);
        document.getElementById("optStatTotal").textContent = articles.length;

        const sorted = [...articles].sort((a, b) => a.seo_score.total - b.seo_score.total);
        const tbody = document.getElementById("optBody");
        tbody.innerHTML = "";

        sorted.forEach(article => {
            const total = article.seo_score.total;
            const scoreClass = total >= 20 ? "score-badge--green" : total >= 10 ? "score-badge--yellow" : "score-badge--red";
            const cells = buildCriteriaCells(article.seo_score.criteria);
            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${escapeHtml(article.title)}</strong></td>
                <td><span class="score-badge ${scoreClass}">${total}</span></td>
                <td class="criteria-pts-cell">${cells.h3}</td>
                <td class="criteria-pts-cell">${cells.links}</td>
                <td class="criteria-pts-cell">${cells.media}</td>
                <td class="criteria-pts-cell">${cells.tech}</td>
                <td><a href="${article.url}" target="_blank">Link ↗</a></td>
            `;
            tbody.appendChild(row);
        });

        document.getElementById("optNoDataMsg").style.display = "none";
        document.getElementById("optTable").style.display = "table";

        const date2 = new Date(dataFile);
        document.getElementById("optLastUpdated").textContent = "Zuletzt aktualisiert: " + date2.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" });

        renderOptTrendChart();

    } catch (error) {
        console.error("Error loading Optimierungsrate:", error);
        document.getElementById("optTable").style.display = "none";
        document.getElementById("optNoDataMsg").style.display = "block";
    }
}

function setOptDateAndLoad(date) {
    document.getElementById("optDateInput").value = date || "";
    document.querySelectorAll("#tab-optimierung .date-filter-btn").forEach(b => b.classList.remove("active"));
    loadOptimierungsrate();
}

document.getElementById("optYesterdayBtn").addEventListener("click", () => {
    setOptDateAndLoad(getDateForFilter("yesterday"));
    document.getElementById("optYesterdayBtn").classList.add("active");
});
document.getElementById("optWeekBtn").addEventListener("click", () => {
    setOptDateAndLoad(getDateForFilter("week"));
    document.getElementById("optWeekBtn").classList.add("active");
});
document.getElementById("optMonthBtn").addEventListener("click", () => {
    setOptDateAndLoad(getDateForFilter("month"));
    document.getElementById("optMonthBtn").classList.add("active");
});
document.getElementById("optAllBtn").addEventListener("click", () => {
    setOptDateAndLoad(null);
    document.getElementById("optAllBtn").classList.add("active");
});
document.getElementById("optDateInput").addEventListener("change", () => {
    document.querySelectorAll("#tab-optimierung .date-filter-btn").forEach(b => b.classList.remove("active"));
    loadOptimierungsrate();
});

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
    document.getElementById("h1h2FilterSelect").value = "";
    loadH1H2Stats();
});

document.getElementById("h1h2FilterSelect").addEventListener("change", (e) => {
    const threshold = e.target.value ? parseInt(e.target.value) : null;
    loadH1H2Stats(threshold);
});

document.querySelectorAll(".titles-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const tabName = btn.getAttribute("data-tab");

        document.querySelectorAll(".titles-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        document.querySelectorAll(".titles-tab-content").forEach(c => c.classList.remove("active"));
        document.getElementById(tabName).classList.add("active");

        if (tabName === "tab-optimierung" && !optLoaded) {
            optLoaded = true;
            loadOptimierungsrate();
        }
    });
});

window.addEventListener("load", () => {
    loadHistory();
    loadH1H2Stats();
});
