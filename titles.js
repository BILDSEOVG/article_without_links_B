let h1h2TrendChart = null;
let allHistory = [];

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

window.addEventListener("load", () => {
    loadHistory();
    loadH1H2Stats();
});
