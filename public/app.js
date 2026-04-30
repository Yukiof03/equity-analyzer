/* ===========================================================
   Equity Growth Analyzer — client script
   API key is held server-side; this script calls /api/analyze.
   =========================================================== */
(function () {
  const STORAGE_KEY_MODEL = "egA_model";
  const STORAGE_KEY_TOKEN = "egA_token";

  let appConfig = {
    require_token: false,
    allowed_models: ["claude-sonnet-4-5"],
    default_model: "claude-sonnet-4-5",
  };

  let lastReport = null;
  let financialChart = null;
  let segmentChart = null;
  let isRunning = false;

  /* ---------- Utils ---------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function fmtNum(n, digits = 1) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return Number(n).toLocaleString("ja-JP", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  function fmtPct(n, digits = 1, sign = false) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    const v = Number(n).toFixed(digits);
    const s = sign && Number(v) > 0 ? "+" : "";
    return `${s}${v}%`;
  }
  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ---------- Storage helpers ---------- */
  function currentModel() {
    return localStorage.getItem(STORAGE_KEY_MODEL) || appConfig.default_model;
  }
  function currentToken() {
    return localStorage.getItem(STORAGE_KEY_TOKEN) || "";
  }

  /* ---------- Progress ---------- */
  function setProgress(stepIdx) {
    const bar = $("#progress-bar-inner");
    bar.style.width = (stepIdx / 5) * 100 + "%";
    $$(".step").forEach((s) => {
      const i = parseInt(s.dataset.step, 10);
      s.classList.remove("active", "done");
      if (i < stepIdx) s.classList.add("done");
      else if (i === stepIdx) s.classList.add("active");
    });
  }
  function showError(msg) {
    const box = $("#error-box");
    box.textContent = msg;
    box.style.display = "block";
  }
  function clearError() {
    const box = $("#error-box");
    box.style.display = "none";
    box.textContent = "";
  }

  /* ---------- Server call ---------- */
  async function callApi(payload) {
    const headers = { "Content-Type": "application/json" };
    if (appConfig.require_token) {
      const t = currentToken();
      if (!t) throw new Error("アクセストークンが必要です。設定から登録してください。");
      headers["x-access-token"] = t;
    }
    const resp = await fetch("/api/analyze", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...payload, model: currentModel() }),
    });
    let data = {};
    try { data = await resp.json(); } catch (_) {}
    if (!resp.ok) {
      throw new Error(data.error || `Error ${resp.status}`);
    }
    return data.text || "";
  }

  /* ---------- JSON extraction ---------- */
  function extractReportJson(text) {
    const idx = text.indexOf("REPORT_DATA:");
    if (idx < 0) {
      const m = text.match(/\{[\s\S]*"company"[\s\S]*"segments"[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error("REPORT_DATA: のJSONが見つかりませんでした。");
    }
    const after = text.slice(idx + "REPORT_DATA:".length);
    const start = after.indexOf("{");
    if (start < 0) throw new Error("REPORT_DATA: の後にJSONが見つかりませんでした。");
    let depth = 0, end = -1, inStr = false, esc = false;
    for (let i = start; i < after.length; i++) {
      const ch = after[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end < 0) throw new Error("REPORT_DATA: のJSONが閉じていません。");
    return JSON.parse(after.slice(start, end + 1));
  }

  /* ---------- Normalize ---------- */
  function normalizeReport(r) {
    if (Array.isArray(r.segments) && r.segments.length) {
      const total = r.segments.reduce((a, s) => a + (Number(s.share) || 0), 0);
      if (total > 0 && Math.abs(total - 100) > 0.01) {
        r.segments = r.segments.map((s) => ({
          ...s,
          share: (Number(s.share) || 0) * (100 / total),
        }));
      }
      r.segments = r.segments.map((s) => ({
        ...s,
        share: Number(s.share) || 0,
        growth: Number(s.growth) || 0,
        contribution: ((Number(s.share) || 0) * (Number(s.growth) || 0)) / 100,
      }));
      const sotp = r.segments.reduce((a, s) => a + s.contribution, 0);
      r.sotp_growth = Math.round(sotp * 100) / 100;
    }
    if (Array.isArray(r.financials) && r.financials.length >= 2) {
      const growths = r.financials.map((f) => f.rev_growth).filter((g) => g !== null && g !== undefined && !isNaN(g));
      if (growths.length) {
        r.three_yr_avg = growths.reduce((a, b) => a + b, 0) / growths.length;
      }
    }
    return r;
  }

  function clampNum(x, def = null) {
    if (x === null || x === undefined || isNaN(Number(x))) return def;
    return Number(x);
  }

  /* ---------- Render ---------- */
  function renderReport(r) {
    $("#report-section").style.display = "block";

    const meta = $("#meta-row");
    meta.innerHTML = "";
    [
      ["企業", r.company || "—"],
      ["コード", r.code || "—"],
      ["業界", r.industry || "—"],
      ["対象年度", r.fiscal_year || "—"],
      ["通貨", r.currency || "—"],
      ["生成", r.generated || "—"],
    ].forEach(([k, v]) => {
      const span = document.createElement("span");
      span.innerHTML = `${k}：<b>${v}</b>`;
      meta.appendChild(span);
    });

    const kpi = $("#kpi-grid");
    kpi.innerHTML = "";
    const sotp = clampNum(r.sotp_growth);
    const threeYr = clampNum(r.three_yr_avg);
    const ind = clampNum(r.benchmarks?.industry_growth);
    const ana = clampNum(r.benchmarks?.analyst_consensus);

    function kpiCard(label, value, sub, cls) {
      const div = document.createElement("div");
      div.className = "kpi " + (cls || "");
      div.innerHTML = `
        <div class="label">${label}</div>
        <div class="value">${value === null ? "—" : fmtPct(value, 1, true)}</div>
        <div class="sub">${sub}</div>
      `;
      return div;
    }
    kpi.appendChild(kpiCard("SOTP加重平均成長率", sotp, "セグメント積み上げ", "primary"));
    kpi.appendChild(kpiCard("3年平均売上成長率", threeYr, "実績ベース", threeYr === null ? "" : threeYr >= 0 ? "positive" : "negative"));
    kpi.appendChild(kpiCard("業界平均成長率", ind, r.benchmarks?.industry_source || "市場調査", ""));
    kpi.appendChild(kpiCard("アナリスト予測", ana, "コンセンサス", ""));

    drawFinancialChart(r);
    drawSegmentChart(r);

    const tbody = $("#segment-table tbody");
    tbody.innerHTML = "";
    (r.segments || []).forEach((s) => {
      const tr = document.createElement("tr");
      let tag = '<span class="tag mid">安定</span>';
      if (s.growth >= 15) tag = '<span class="tag high">高成長</span>';
      else if (s.growth < 0) tag = '<span class="tag low">縮小</span>';
      else if (s.growth >= 5) tag = '<span class="tag info">成長</span>';
      tr.innerHTML = `
        <td>${s.name}</td>
        <td class="num">${fmtPct(s.share, 1)}</td>
        <td class="num ${s.growth >= 0 ? "pos" : "neg"}">${fmtPct(s.growth, 1, true)}</td>
        <td class="num">${fmtPct(s.contribution, 2, true)}</td>
        <td>${tag}</td>
      `;
      tbody.appendChild(tr);
    });

    drawDivergenceCards(r);
    drawSummary(r);

    if (r.notes) {
      $("#notes-card").style.display = "block";
      $("#notes-card").textContent = "📝 " + r.notes;
    } else {
      $("#notes-card").style.display = "none";
    }

    $("#drill-output").classList.remove("visible");
    $("#drill-output").innerHTML = "";

    $("#report-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function drawFinancialChart(r) {
    const ctx = document.getElementById("financial-chart").getContext("2d");
    if (financialChart) financialChart.destroy();
    const labels = (r.financials || []).map((f) => f.year);
    const rev = (r.financials || []).map((f) => clampNum(f.revenue, 0));
    const op = (r.financials || []).map((f) => clampNum(f.op_profit, 0));
    const net = (r.financials || []).map((f) => clampNum(f.net_profit, 0));
    const grw = (r.financials || []).map((f) => clampNum(f.rev_growth));

    const primary = getCSSVar("--primary");
    const positive = getCSSVar("--positive");
    const neutral = getCSSVar("--neutral");
    const text = getCSSVar("--text-soft");
    const grid = getCSSVar("--border");

    financialChart = new Chart(ctx, {
      data: {
        labels,
        datasets: [
          { type: "bar", label: `売上高 (${r.currency || ""})`, data: rev, backgroundColor: primary + "cc", borderColor: primary, borderWidth: 1, yAxisID: "y", order: 3 },
          { type: "bar", label: `営業利益 (${r.currency || ""})`, data: op, backgroundColor: positive + "cc", borderColor: positive, borderWidth: 1, yAxisID: "y", order: 2 },
          { type: "line", label: `純利益 (${r.currency || ""})`, data: net, borderColor: neutral, backgroundColor: neutral, borderWidth: 2, tension: 0.25, yAxisID: "y", order: 1 },
          { type: "line", label: "売上成長率(%)", data: grw, borderColor: text, backgroundColor: text, borderWidth: 2, borderDash: [6, 4], tension: 0.25, yAxisID: "y1", order: 0 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: text, font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: text }, grid: { color: grid } },
          y: { position: "left", title: { display: true, text: r.currency || "", color: text, font: { size: 10 } }, ticks: { color: text }, grid: { color: grid } },
          y1: { position: "right", title: { display: true, text: "成長率(%)", color: text, font: { size: 10 } }, ticks: { color: text, callback: (v) => v + "%" }, grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  function drawSegmentChart(r) {
    const ctx = document.getElementById("segment-chart").getContext("2d");
    if (segmentChart) segmentChart.destroy();
    const segs = r.segments || [];
    const labels = segs.map((s) => s.name);
    const data = segs.map((s) => s.growth);
    const sotp = clampNum(r.sotp_growth, 0);

    const primary = getCSSVar("--primary");
    const positive = getCSSVar("--positive");
    const negative = getCSSVar("--negative");
    const neutral = getCSSVar("--neutral");
    const text = getCSSVar("--text-soft");
    const grid = getCSSVar("--border");

    const colors = data.map((v) => (v >= 15 ? positive : v < 0 ? negative : v >= 5 ? primary : neutral));

    const sotpLine = {
      id: "sotpLine",
      afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const x = scales.x.getPixelForValue(sotp);
        ctx.save();
        ctx.strokeStyle = primary;
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.fillStyle = primary;
        ctx.font = "bold 11px system-ui";
        ctx.textAlign = "left";
        ctx.fillText(`SOTP ${fmtPct(sotp, 1, true)}`, x + 6, chartArea.top + 12);
        ctx.restore();
      },
    };

    segmentChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "セグメント成長率(%)", data, backgroundColor: colors.map((c) => c + "cc"), borderColor: colors, borderWidth: 1 }] },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: text, callback: (v) => v + "%" }, grid: { color: grid } },
          y: { ticks: { color: text }, grid: { color: grid } },
        },
      },
      plugins: [sotpLine],
    });
  }

  function drawDivergenceCards(r) {
    const sotp = clampNum(r.sotp_growth);
    const ind = clampNum(r.benchmarks?.industry_growth);
    const ana = clampNum(r.benchmarks?.analyst_consensus);
    const gui = clampNum(r.benchmarks?.company_guidance);

    const axes = [
      { name: "SOTP vs アナリスト予測", a: sotp, b: ana, formula: "SOTP − アナリスト" },
      { name: "SOTP vs 会社ガイダンス", a: sotp, b: gui, formula: "SOTP − ガイダンス" },
      { name: "SOTP vs 業界平均", a: sotp, b: ind, formula: "SOTP − 業界平均" },
      { name: "アナリスト vs 業界平均", a: ana, b: ind, formula: "アナリスト − 業界平均" },
    ];

    const grid = $("#div-grid");
    grid.innerHTML = "";
    axes.forEach((ax) => {
      const div = document.createElement("div");
      let cls = "neutral";
      let verdict = "—";
      let gap = null;
      if (ax.a !== null && ax.b !== null) {
        gap = ax.a - ax.b;
        if (gap > 4) { cls = "over"; verdict = "過大評価シグナル（+4%pt超）"; }
        else if (gap < -4) { cls = "under"; verdict = "過小評価シグナル（−4%pt超）"; }
        else verdict = "中立（±4%pt以内）";
      } else {
        verdict = "データ不足のため判定不可";
      }
      div.className = "div-card " + cls;
      div.innerHTML = `
        <div class="axis">${ax.name}<br /><span style="font-size:10px;">(${ax.formula})</span></div>
        <div class="gap">${gap === null ? "—" : fmtPct(gap, 1, true) + "pt"}</div>
        <div class="verdict">${verdict}</div>
      `;
      grid.appendChild(div);
    });
  }

  function drawSummary(r) {
    const sotp = clampNum(r.sotp_growth);
    const ind = clampNum(r.benchmarks?.industry_growth);
    const ana = clampNum(r.benchmarks?.analyst_consensus);
    const gui = clampNum(r.benchmarks?.company_guidance);

    const lines = [];
    if (sotp !== null && ind !== null) {
      const d = sotp - ind;
      lines.push(
        d > 4
          ? `SOTPは業界平均を <b>+${d.toFixed(1)}%pt</b> 上回り、業界平均以上の成長力を示しています。`
          : d < -4
            ? `SOTPは業界平均を <b>${d.toFixed(1)}%pt</b> 下回り、相対的な成長力に課題があります。`
            : `SOTPは業界平均と概ね整合（差 ${d.toFixed(1)}%pt）しています。`
      );
    }
    if (sotp !== null && ana !== null) {
      const d = sotp - ana;
      lines.push(
        d > 4
          ? `アナリスト予測（${fmtPct(ana, 1, true)}）に対しSOTPは <b>+${d.toFixed(1)}%pt</b> 高く、市場が成長を過小評価している可能性があります。`
          : d < -4
            ? `アナリスト予測（${fmtPct(ana, 1, true)}）に対しSOTPは <b>${d.toFixed(1)}%pt</b> 低く、市場が一部セグメントの高成長で過大評価している可能性があります。`
            : `SOTPはアナリスト予測（${fmtPct(ana, 1, true)}）と整合（差 ${d.toFixed(1)}%pt）しています。`
      );
    }
    if (sotp !== null && gui !== null) {
      const d = sotp - gui;
      lines.push(
        d > 4
          ? `会社ガイダンス（${fmtPct(gui, 1, true)}）はSOTP（${fmtPct(sotp, 1, true)}）より保守的（差 ${d.toFixed(1)}%pt）で、上振れ余地が示唆されます。`
          : d < -4
            ? `会社ガイダンス（${fmtPct(gui, 1, true)}）はSOTP（${fmtPct(sotp, 1, true)}）より積極的（差 ${d.toFixed(1)}%pt）で、達成リスクに留意が必要です。`
            : `SOTPは会社ガイダンス（${fmtPct(gui, 1, true)}）と整合（差 ${d.toFixed(1)}%pt）しています。`
      );
    }

    $("#summary-card").innerHTML = lines.length ? lines.join("<br />") : "データ不足のため定量的な評価コメントを生成できませんでした。";

    const tags = [];
    if (sotp !== null && ind !== null && sotp - ind > 4) tags.push(["業界平均を上回る成長力", "high"]);
    if (sotp !== null && ind !== null && sotp - ind < -4) tags.push(["業界平均を下回る成長力", "low"]);
    if (sotp !== null && ana !== null) {
      const d = Math.abs(sotp - ana);
      if (d <= 2) tags.push(["アナリスト予測と整合", "info"]);
      else if (sotp - ana > 4) tags.push(["市場が過小評価", "under"]);
      else if (sotp - ana < -4) tags.push(["市場が過大評価", "low"]);
    }
    if (sotp !== null && gui !== null) {
      if (sotp > gui + 4) tags.push(["ガイダンス保守的", "info"]);
      else if (sotp < gui - 4) tags.push(["ガイダンス積極的", "mid"]);
    }
    const segs = r.segments || [];
    const high = segs.filter((s) => s.growth >= 15).length;
    if (high > 0) tags.push([`高成長セグメント ${high}件`, "high"]);

    const row = $("#tags-row");
    row.innerHTML = "";
    tags.forEach(([t, c]) => {
      const span = document.createElement("span");
      span.className = "tag " + c;
      span.textContent = t;
      row.appendChild(span);
    });
  }

  /* ---------- Markdown (minimal) ---------- */
  function renderMarkdown(md) {
    let s = escapeHTML(md);
    s = s.replace(/```([\s\S]*?)```/g, (_, c) => `<pre style="background:var(--bg-soft);padding:10px;border-radius:6px;overflow:auto;font-size:12px;">${c}</pre>`);
    s = s.replace(/^###\s+(.+)$/gm, "<h4 style='margin:10px 0 6px'>$1</h4>");
    s = s.replace(/^##\s+(.+)$/gm, "<h3 style='margin:12px 0 6px;font-size:14px'>$1</h3>");
    s = s.replace(/^#\s+(.+)$/gm, "<h3 style='margin:12px 0 6px;font-size:14px'>$1</h3>");
    s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    s = s.replace(/`([^`]+)`/g, "<code style='background:var(--bg-soft);padding:1px 4px;border-radius:3px;font-size:12px;'>$1</code>");
    s = s.replace(/((?:^\|.*\|\s*\n)+)/gm, (block) => {
      const rows = block.trim().split("\n").map((r) => r.trim());
      if (rows.length < 2) return block;
      const sep = rows[1];
      if (!/^\|[\s\-:|]+\|$/.test(sep)) return block;
      const head = rows[0].split("|").slice(1, -1).map((c) => `<th style="border:1px solid var(--border);padding:4px 6px;background:var(--bg-soft);text-align:left;font-size:12px;">${c.trim()}</th>`).join("");
      const body = rows.slice(2).map((r) => "<tr>" + r.split("|").slice(1, -1).map((c) => `<td style="border:1px solid var(--border);padding:4px 6px;font-size:12px;">${c.trim()}</td>`).join("") + "</tr>").join("");
      return `<table style="border-collapse:collapse;margin:8px 0;width:100%;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    });
    s = s.replace(/(^|\n)((?:[-*]\s+.+(?:\n|$))+)/g, (m, pre, block) => {
      const items = block.trim().split("\n").map((l) => "<li>" + l.replace(/^[-*]\s+/, "") + "</li>").join("");
      return pre + "<ul style='margin:6px 0 6px 18px;padding:0;'>" + items + "</ul>";
    });
    s = s.replace(/(^|\n)((?:\d+\.\s+.+(?:\n|$))+)/g, (m, pre, block) => {
      const items = block.trim().split("\n").map((l) => "<li>" + l.replace(/^\d+\.\s+/, "") + "</li>").join("");
      return pre + "<ol style='margin:6px 0 6px 22px;padding:0;'>" + items + "</ol>";
    });
    s = s.replace(/\n{2,}/g, "</p><p>");
    s = s.replace(/(?<!>)\n(?!<)/g, "<br />");
    return "<p>" + s + "</p>";
  }

  /* ---------- Drilldown ---------- */
  function labelForDrill(kind) {
    return kind === "detail" ? "詳細評価コメント"
      : kind === "competitor" ? "競合比較"
      : "中期シナリオ（3〜5年）";
  }
  async function runDrilldown(kind) {
    if (!lastReport) return;
    const out = $("#drill-output");
    out.classList.add("visible");
    out.innerHTML = `<h4>${labelForDrill(kind)}</h4><div class="muted">Claudeにリクエスト中…</div>`;
    try {
      const text = await callApi({ mode: kind, context: lastReport });
      out.innerHTML = `<h4>${labelForDrill(kind)}</h4>` + renderMarkdown(text);
    } catch (e) {
      out.innerHTML = `<h4>${labelForDrill(kind)}</h4><div class="neg">エラー：${escapeHTML(e.message)}</div>`;
    }
  }

  /* ---------- Main run ---------- */
  async function runAnalysis() {
    if (isRunning) return;
    const query = $("#company-input").value.trim();
    if (!query) {
      showError("企業名または証券コードを入力してください。");
      return;
    }
    if (appConfig.require_token && !currentToken()) {
      showError("アクセストークンが未設定です。設定から登録してください。");
      $("#settings-details").open = true;
      return;
    }

    clearError();
    isRunning = true;
    $("#run-btn").disabled = true;
    $("#progress-section").style.display = "block";
    $("#report-section").style.display = "none";

    let cur = 1;
    setProgress(cur);
    const interval = setInterval(() => {
      if (cur < 4) { cur++; setProgress(cur); }
    }, 7000);

    try {
      const text = await callApi({ mode: "analyze", query });
      clearInterval(interval);
      setProgress(5);
      const json = extractReportJson(text);
      if (!json.generated) {
        const d = new Date();
        json.generated = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
      }
      const report = normalizeReport(json);
      lastReport = report;
      renderReport(report);
      setTimeout(() => { $("#progress-section").style.display = "none"; }, 600);
    } catch (e) {
      clearInterval(interval);
      showError("分析エラー：" + e.message);
      $("#progress-section").style.display = "none";
    } finally {
      isRunning = false;
      $("#run-btn").disabled = false;
    }
  }

  /* ---------- Reset ---------- */
  function resetAnalysis() {
    $("#company-input").value = "";
    $("#report-section").style.display = "none";
    $("#progress-section").style.display = "none";
    clearError();
    $("#drill-output").classList.remove("visible");
    $("#drill-output").innerHTML = "";
    lastReport = null;
    if (financialChart) { financialChart.destroy(); financialChart = null; }
    if (segmentChart) { segmentChart.destroy(); segmentChart = null; }
    $("#company-input").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- Sample ---------- */
  function loadSample() {
    const sample = {
      company: "サンプル製薬株式会社",
      code: "9999",
      industry: "医薬品",
      currency: "億円",
      fiscal_year: "FY2024",
      generated: "2026/4/30",
      financials: [
        { year: "FY2022", revenue: 38000, op_profit: 4500, net_profit: 3200, rev_growth: null },
        { year: "FY2023", revenue: 41000, op_profit: 5100, net_profit: 3600, rev_growth: 7.9 },
        { year: "FY2024", revenue: 44500, op_profit: 5800, net_profit: 4100, rev_growth: 8.5 },
      ],
      segments: [
        { name: "オンコロジー", share: 28, growth: 22 },
        { name: "希少疾患", share: 18, growth: 35 },
        { name: "消化器・神経", share: 24, growth: 5 },
        { name: "ワクチン", share: 12, growth: -3 },
        { name: "その他", share: 18, growth: 4 },
      ],
      benchmarks: {
        industry_growth: 6.5,
        industry_source: "Grand View Research (Pharma 2025)",
        analyst_consensus: 9.2,
        company_guidance: 7.5,
      },
      sotp_growth: 0,
      notes: "本データはUI確認用のサンプルです。実際の企業情報ではありません。",
    };
    const r = normalizeReport(sample);
    lastReport = r;
    renderReport(r);
    $("#progress-section").style.display = "none";
    clearError();
  }

  /* ---------- Init ---------- */
  function initSettings() {
    const sel = $("#model-select");
    sel.innerHTML = "";
    appConfig.allowed_models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      sel.appendChild(opt);
    });
    sel.value = currentModel();
    sel.addEventListener("change", () => {
      localStorage.setItem(STORAGE_KEY_MODEL, sel.value);
    });

    if (appConfig.require_token) {
      $("#token-row").style.display = "flex";
      const t = $("#token-input");
      t.value = currentToken();
      t.addEventListener("change", () => {
        if (t.value) localStorage.setItem(STORAGE_KEY_TOKEN, t.value.trim());
        else localStorage.removeItem(STORAGE_KEY_TOKEN);
      });
    }
  }

  async function loadConfig() {
    try {
      const r = await fetch("/api/config");
      if (r.ok) {
        appConfig = await r.json();
      }
    } catch (_) {}
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await loadConfig();
    initSettings();
    $("#run-btn").addEventListener("click", runAnalysis);
    $("#company-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") runAnalysis();
    });
    $("#reset-btn").addEventListener("click", resetAnalysis);
    $("#sample-btn").addEventListener("click", loadSample);
    $$(".drill-btn").forEach((b) => {
      b.addEventListener("click", () => runDrilldown(b.dataset.drill));
    });
  });
})();
