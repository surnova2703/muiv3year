"use strict";

(function () {
  const mapViewBtn = document.getElementById("mapViewBtn");
  const graphViewBtn = document.getElementById("graphViewBtn");
  const analysisViewBtn = document.getElementById("analysisViewBtn");
  const mapView = document.getElementById("mapView");
  const graphView = document.getElementById("graphView");
  const analysisView = document.getElementById("analysisView");

  let dataLoaded = false;
  let analysisData = null;

  function showAnalysis() {
    mapView.hidden = true;
    graphView.hidden = true;
    analysisView.hidden = false;
    mapViewBtn.classList.add("secondary");
    graphViewBtn.classList.add("secondary");
    analysisViewBtn.classList.remove("secondary");
    if (!dataLoaded) loadAndRender();
  }

  analysisViewBtn.addEventListener("click", showAnalysis);

  // Patch existing buttons to deactivate analysis tab
  mapViewBtn.addEventListener("click", () => {
    analysisView.hidden = true;
    analysisViewBtn.classList.add("secondary");
  });
  graphViewBtn.addEventListener("click", () => {
    analysisView.hidden = true;
    analysisViewBtn.classList.add("secondary");
  });

  function loadAndRender() {
    fetch("analysis_data.json")
      .then(r => r.json())
      .then(data => {
        analysisData = data;
        dataLoaded = true;
        renderYearChart(data);
        renderShiftChart(data);
        renderJournalChart(data);
        renderJournalSelector(data);
      })
      .catch(err => {
        console.error("Failed to load analysis_data.json", err);
        document.getElementById("yearChart").textContent = "Ошибка загрузки данных анализа.";
      });
  }

  // --- 1. Year activity bar chart ---
  function renderYearChart(data) {
    const years = Object.keys(data.year_activity).map(Number);
    const counts = Object.values(data.year_activity);
    const colors = counts.map(c => c === Math.max(...counts) ? "#23613f" : "#6aad8a");

    Plotly.newPlot("yearChart", [{
      type: "bar",
      x: years,
      y: counts,
      marker: { color: colors },
      hovertemplate: "<b>%{x}</b>: %{y} публикаций<extra></extra>"
    }], {
      margin: { t: 10, r: 10, b: 40, l: 40 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      font: { family: "Segoe UI, Arial, sans-serif", size: 12, color: getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#122017" },
      xaxis: { gridcolor: "rgba(0,0,0,0.07)", title: "Год" },
      yaxis: { gridcolor: "rgba(0,0,0,0.07)", title: "Публикаций" },
      height: 240,
      annotations: [{
        x: data.summary.peak_year,
        y: data.summary.peak_count,
        text: `Пик: ${data.summary.peak_count}`,
        showarrow: true,
        arrowhead: 2,
        arrowcolor: "#23613f",
        font: { color: "#23613f", size: 11 },
        bgcolor: "rgba(255,255,255,0.8)",
        bordercolor: "#23613f",
        borderwidth: 1,
        ax: 30, ay: -30
      }]
    }, { responsive: true, displayModeBar: false });
  }

  // --- 2. Topic shifts chart ---
  function renderShiftChart(data) {
    const growing = data.growing_topics.slice(0, 8);
    const names = growing.map(t => t.name.length > 35 ? t.name.slice(0, 33) + "…" : t.name);

    Plotly.newPlot("shiftChart", [
      {
        type: "bar",
        name: "2000–2012",
        x: growing.map(t => t.early),
        y: names,
        orientation: "h",
        marker: { color: "#6aad8a" },
        hovertemplate: "<b>%{y}</b><br>2000–2012: %{x}<extra></extra>"
      },
      {
        type: "bar",
        name: "2013–2024",
        x: growing.map(t => t.late),
        y: names,
        orientation: "h",
        marker: { color: "#23613f" },
        hovertemplate: "<b>%{y}</b><br>2013–2024: %{x}<extra></extra>"
      }
    ], {
      barmode: "group",
      margin: { t: 10, r: 10, b: 40, l: 240 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      font: { family: "Segoe UI, Arial, sans-serif", size: 11 },
      xaxis: { gridcolor: "rgba(0,0,0,0.07)", title: "Публикаций" },
      yaxis: { automargin: true },
      height: 300,
      legend: { orientation: "h", y: -0.15 }
    }, { responsive: true, displayModeBar: false });
  }

  // --- 3. Journal topics overview chart ---
  function renderJournalChart(data) {
    const journals = Object.keys(data.journal_analysis);
    const stableCount = journals.map(j => data.journal_analysis[j].stable.length);
    const coreCount   = journals.map(j => data.journal_analysis[j].core.length);
    const periCount   = journals.map(j => Math.min(data.journal_analysis[j].peripheral_count, 30));
    const pubCount    = journals.map(j => data.journal_analysis[j].pubs);
    const shortNames  = journals.map(j => j.length > 28 ? j.slice(0, 26) + "…" : j);

    Plotly.newPlot("journalChart", [
      {
        type: "bar", name: "Устойчивые (≥20%)",
        x: shortNames, y: stableCount,
        marker: { color: "#23613f" },
        hovertemplate: "<b>%{x}</b><br>Устойчивых тем: %{y}<extra></extra>"
      },
      {
        type: "bar", name: "Ядерные (10–19%)",
        x: shortNames, y: coreCount,
        marker: { color: "#6aad8a" },
        hovertemplate: "<b>%{x}</b><br>Ядерных тем: %{y}<extra></extra>"
      },
      {
        type: "bar", name: "Периферийные (1 упом.)",
        x: shortNames, y: periCount,
        marker: { color: "#b0cfc0" },
        hovertemplate: "<b>%{x}</b><br>Периферийных: %{y}+<extra></extra>"
      }
    ], {
      barmode: "group",
      margin: { t: 10, r: 10, b: 100, l: 40 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      font: { family: "Segoe UI, Arial, sans-serif", size: 11 },
      xaxis: { tickangle: -25, gridcolor: "rgba(0,0,0,0.07)" },
      yaxis: { gridcolor: "rgba(0,0,0,0.07)", title: "Кол-во тем" },
      height: 310,
      legend: { orientation: "h", y: -0.35 }
    }, { responsive: true, displayModeBar: false });
  }

  // --- 4. Journal detail selector ---
  function renderJournalSelector(data) {
    const sel = document.getElementById("journalDetailSelect");
    Object.keys(data.journal_analysis).forEach(jname => {
      const opt = document.createElement("option");
      opt.value = jname;
      opt.textContent = jname;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => renderJournalDetail(data, sel.value));
    renderJournalDetail(data, sel.value);
  }

  function renderJournalDetail(data, jname) {
    const j = data.journal_analysis[jname];
    if (!j) return;
    const el = document.getElementById("journalDetailContent");

    const typeLabel = j.stable.length >= 2 ? "Монотематический" :
                      j.stable.length === 1 ? "Профильный" :
                      j.unique_topics > j.pubs * 0.9 ? "Обзорный" : "Мультидисциплинарный";

    function topicRows(list, pctClass) {
      return list.map(t => `
        <div class="topic-row">
          <span class="topic-row-name">${t.name}</span>
          <span class="topic-row-pct ${pctClass}">${"pct" in t ? t.pct + "%" : "×1"}</span>
        </div>`).join("");
    }

    el.innerHTML = `
      <div class="journal-stat-row">
        <span>Публикаций: <strong>${j.pubs}</strong></span>
        <span>Уникальных тем: <strong>${j.unique_topics}</strong></span>
        <span>Периферийных: <strong>${j.peripheral_count}</strong></span>
        <span>Тип: <strong>${typeLabel}</strong></span>
      </div>
      <div class="journal-detail-grid">
        <div class="journal-topic-col stable">
          <h4>Устойчивые (≥20%)</h4>
          ${j.stable.length ? topicRows(j.stable, "") : '<div class="topic-row"><span class="topic-row-name" style="color:var(--muted)">Нет устойчивых тем</span></div>'}
        </div>
        <div class="journal-topic-col core">
          <h4>Ядерные (10–19%)</h4>
          ${j.core.length ? topicRows(j.core, "core-pct") : '<div class="topic-row"><span class="topic-row-name" style="color:var(--muted)">—</span></div>'}
        </div>
        <div class="journal-topic-col peri">
          <h4>Периферийные (×1) — примеры</h4>
          ${topicRows(j.peripheral_sample.map(n => ({ name: n })), "peri-pct")}
          ${j.peripheral_count > j.peripheral_sample.length
            ? `<div class="topic-row"><span class="topic-row-name" style="color:var(--muted)">… ещё ${j.peripheral_count - j.peripheral_sample.length}</span></div>`
            : ""}
        </div>
      </div>`;
  }
})();
