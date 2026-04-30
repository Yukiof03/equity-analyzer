/* ===========================================================
   Equity Growth Analyzer — client script (with i18n)
   API key is held server-side; this script calls /api/analyze.
   =========================================================== */
(function () {
  const STORAGE_KEY_MODEL = "egA_model";
  const STORAGE_KEY_TOKEN = "egA_token";
  const STORAGE_KEY_LANG = "egA_lang";

  let appConfig = {
    require_token: false,
    allowed_models: ["claude-sonnet-4-5"],
    default_model: "claude-sonnet-4-5",
  };

  let lastReport = null;
  let financialChart = null;
  let segmentChart = null;
  let isRunning = false;

  /* ---------- i18n ---------- */
  const I18N = {
    ja: {
      brand_subtitle: "企業成長分析ダッシュボード · SOTP乖離分析",
      sample_btn: "サンプル表示",
      input_label: "企業名 または 証券コード",
      input_placeholder: "例：武田薬品工業 / 4502 / Apple / AAPL",
      run_btn: "分析開始",
      input_hint: "日本株（4桁の東証コード）・米国株（NYSE/NASDAQティッカー）に対応。Enterキーでも実行できます。",
      settings_summary: "設定（モデル選択・アクセストークン）",
      settings_model: "モデル：",
      settings_token: "アクセストークン：",
      settings_token_placeholder: "管理者から共有されたトークン",
      settings_hint: "APIキーはサーバー側で管理されています。ユーザー側での設定は不要です。",
      step1: "財務データ収集",
      step2: "セグメント分析",
      step3: "業界比較",
      step4: "予測収集",
      step5: "レポート生成",
      h2_kpi: "KPIサマリー",
      sub_kpi: "主要4指標の比較",
      h2_fin: "財務推移（過去3年）",
      sub_fin: "売上高・営業利益（棒）／純利益（線）／売上成長率（破線・第2軸）",
      h2_seg: "セグメント別成長率",
      sub_seg: "SOTP加重平均（破線）と各セグメントを比較",
      seg_th_seg: "セグメント",
      seg_th_share: "構成比",
      seg_th_growth: "成長率",
      seg_th_contrib: "寄与度",
      seg_th_tag: "評価",
      h2_div: "乖離分析（4軸スコアカード）",
      sub_div: "SOTP・アナリスト・ガイダンス・業界平均の差分（±4%pt超で過大／過小評価）",
      h2_summary: "総合評価",
      h2_drill: "ドリルダウン",
      sub_drill: "追加分析をClaudeにリクエスト",
      drill_detail: "詳細評価を依頼",
      drill_competitor: "競合比較",
      drill_scenario: "中期シナリオ",
      reset_btn: "↻ 別企業を分析",
      footer_disclaimer: "本ツールの分析結果はClaudeのWeb検索能力に依存します。投資判断は必ず公式IR資料との照合を行ってください。",
      // KPI
      kpi_sotp: "SOTP加重平均成長率",
      kpi_3yr: "3年平均売上成長率",
      kpi_industry: "業界平均成長率",
      kpi_analyst: "アナリスト予測",
      kpi_sotp_sub: "セグメント積み上げ",
      kpi_3yr_sub: "実績ベース",
      kpi_industry_sub_default: "市場調査",
      kpi_analyst_sub: "コンセンサス",
      // Meta
      meta_company: "企業",
      meta_code: "コード",
      meta_industry: "業界",
      meta_fy: "対象年度",
      meta_currency: "通貨",
      meta_generated: "生成",
      // Tags
      tag_high: "高成長",
      tag_shrink: "縮小",
      tag_grow: "成長",
      tag_stable: "安定",
      // Divergence
      div_sotp_vs_analyst: "SOTP vs アナリスト予測",
      div_sotp_vs_guidance: "SOTP vs 会社ガイダンス",
      div_sotp_vs_industry: "SOTP vs 業界平均",
      div_analyst_vs_industry: "アナリスト vs 業界平均",
      formula_sotp_analyst: "SOTP − アナリスト",
      formula_sotp_guidance: "SOTP − ガイダンス",
      formula_sotp_industry: "SOTP − 業界平均",
      formula_analyst_industry: "アナリスト − 業界平均",
      verdict_over: "過大評価シグナル（+4%pt超）",
      verdict_under: "過小評価シグナル（−4%pt超）",
      verdict_neutral: "中立（±4%pt以内）",
      verdict_no_data: "データ不足のため判定不可",
      // Summary tags
      stag_above_industry: "業界平均を上回る成長力",
      stag_below_industry: "業界平均を下回る成長力",
      stag_aligned_analyst: "アナリスト予測と整合",
      stag_under_market: "市場が過小評価",
      stag_over_market: "市場が過大評価",
      stag_guidance_conservative: "ガイダンス保守的",
      stag_guidance_aggressive: "ガイダンス積極的",
      stag_high_segments: "高成長セグメント {n}件",
      // Misc
      summary_no_data: "データ不足のため定量的な評価コメントを生成できませんでした。",
      drill_loading: "Claudeにリクエスト中…",
      drill_label_detail: "詳細評価コメント",
      drill_label_competitor: "競合比較",
      drill_label_scenario: "中期シナリオ（3〜5年）",
      err_prefix: "分析エラー：",
      err_no_company: "企業名または証券コードを入力してください。",
      err_no_token: "アクセストークンが未設定です。設定から登録してください。",
      err_drill: "エラー：",
      // Summary lines
      sum_above_industry_strong: "SOTPは業界平均を <b>+{d}%pt</b> 上回り、業界平均以上の成長力を示しています。",
      sum_below_industry_strong: "SOTPは業界平均を <b>{d}%pt</b> 下回り、相対的な成長力に課題があります。",
      sum_industry_aligned: "SOTPは業界平均と概ね整合（差 {d}%pt）しています。",
      sum_analyst_under: "アナリスト予測（{a}）に対しSOTPは <b>+{d}%pt</b> 高く、市場が成長を過小評価している可能性があります。",
      sum_analyst_over: "アナリスト予測（{a}）に対しSOTPは <b>{d}%pt</b> 低く、市場が一部セグメントの高成長で過大評価している可能性があります。",
      sum_analyst_aligned: "SOTPはアナリスト予測（{a}）と整合（差 {d}%pt）しています。",
      sum_guidance_conservative: "会社ガイダンス（{g}）はSOTP（{s}）より保守的（差 {d}%pt）で、上振れ余地が示唆されます。",
      sum_guidance_aggressive: "会社ガイダンス（{g}）はSOTP（{s}）より積極的（差 {d}%pt）で、達成リスクに留意が必要です。",
      sum_guidance_aligned: "SOTPは会社ガイダンス（{g}）と整合（差 {d}%pt）しています。",
    },
    en: {
      brand_subtitle: "Corporate Growth Dashboard · SOTP Divergence Analysis",
      sample_btn: "Show Sample",
      input_label: "Company Name or Ticker",
      input_placeholder: "e.g., Apple / AAPL / Takeda / 4502",
      run_btn: "Analyze",
      input_hint: "Supports US (NYSE/NASDAQ tickers) and Japanese (4-digit TSE codes) listed companies. Press Enter to run.",
      settings_summary: "Settings (model & access token)",
      settings_model: "Model:",
      settings_token: "Access Token:",
      settings_token_placeholder: "Token shared by admin",
      settings_hint: "API key is managed server-side. No setup required for users.",
      step1: "Financials",
      step2: "Segments",
      step3: "Industry",
      step4: "Forecasts",
      step5: "Report",
      h2_kpi: "KPI Summary",
      sub_kpi: "Comparison of four key metrics",
      h2_fin: "Financial Trend (Past 3 Years)",
      sub_fin: "Revenue & operating profit (bars) / Net profit (line) / Revenue growth (dashed, 2nd axis)",
      h2_seg: "Segment Growth",
      sub_seg: "Each segment compared to SOTP weighted average (dashed line)",
      seg_th_seg: "Segment",
      seg_th_share: "Share",
      seg_th_growth: "Growth",
      seg_th_contrib: "Contribution",
      seg_th_tag: "Tag",
      h2_div: "Divergence (4-Axis Scorecard)",
      sub_div: "Differences vs analyst, guidance, and industry average (>±4%pt = over/undervalued)",
      h2_summary: "Summary",
      h2_drill: "Drill Down",
      sub_drill: "Request additional analysis from Claude",
      drill_detail: "Request detailed evaluation",
      drill_competitor: "Competitor comparison",
      drill_scenario: "Mid-term scenarios",
      reset_btn: "↻ Analyze another company",
      footer_disclaimer: "Results depend on Claude's web search capability. Always verify against official IR materials before making investment decisions.",
      kpi_sotp: "SOTP Weighted Avg Growth",
      kpi_3yr: "3-Yr Avg Revenue Growth",
      kpi_industry: "Industry Avg Growth",
      kpi_analyst: "Analyst Forecast",
      kpi_sotp_sub: "Bottom-up by segment",
      kpi_3yr_sub: "Actuals-based",
      kpi_industry_sub_default: "Market research",
      kpi_analyst_sub: "Consensus",
      meta_company: "Company",
      meta_code: "Ticker",
      meta_industry: "Industry",
      meta_fy: "Fiscal year",
      meta_currency: "Currency",
      meta_generated: "Generated",
      tag_high: "High growth",
      tag_shrink: "Shrinking",
      tag_grow: "Growing",
      tag_stable: "Stable",
      div_sotp_vs_analyst: "SOTP vs Analyst forecast",
      div_sotp_vs_guidance: "SOTP vs Company guidance",
      div_sotp_vs_industry: "SOTP vs Industry average",
      div_analyst_vs_industry: "Analyst vs Industry average",
      formula_sotp_analyst: "SOTP − Analyst",
      formula_sotp_guidance: "SOTP − Guidance",
      formula_sotp_industry: "SOTP − Industry",
      formula_analyst_industry: "Analyst − Industry",
      verdict_over: "Overvalued signal (>+4%pt)",
      verdict_under: "Undervalued signal (<−4%pt)",
      verdict_neutral: "Neutral (within ±4%pt)",
      verdict_no_data: "Insufficient data for verdict",
      stag_above_industry: "Above industry growth",
      stag_below_industry: "Below industry growth",
      stag_aligned_analyst: "Aligned with analysts",
      stag_under_market: "Market undervaluing",
      stag_over_market: "Market overvaluing",
      stag_guidance_conservative: "Guidance conservative",
      stag_guidance_aggressive: "Guidance aggressive",
      stag_high_segments: "High-growth segments: {n}",
      summary_no_data: "Insufficient data to generate a quantitative evaluation.",
      drill_loading: "Requesting Claude…",
      drill_label_detail: "Detailed evaluation",
      drill_label_competitor: "Competitor comparison",
      drill_label_scenario: "Mid-term scenarios (3–5 years)",
      err_prefix: "Analysis error: ",
      err_no_company: "Please enter a company name or ticker.",
      err_no_token: "Access token is required. Please set it in Settings.",
      err_drill: "Error: ",
      sum_above_industry_strong: "SOTP exceeds the industry average by <b>+{d}%pt</b>, indicating above-industry growth potential.",
      sum_below_industry_strong: "SOTP is <b>{d}%pt</b> below the industry average, indicating relative growth concerns.",
      sum_industry_aligned: "SOTP is broadly aligned with the industry average (gap {d}%pt).",
      sum_analyst_under: "Versus the analyst forecast ({a}), SOTP is <b>+{d}%pt</b> higher — the market may be undervaluing the company's growth.",
      sum_analyst_over: "Versus the analyst forecast ({a}), SOTP is <b>{d}%pt</b> lower — the market may be overvaluing on the back of a few high-growth segments.",
      sum_analyst_aligned: "SOTP is aligned with the analyst forecast ({a}) (gap {d}%pt).",
      sum_guidance_conservative: "Company guidance ({g}) is more conservative than SOTP ({s}) (gap {d}%pt), suggesting upside potential.",
      sum_guidance_aggressive: "Company guidance ({g}) is more aggressive than SOTP ({s}) (gap {d}%pt) — execution risk to monitor.",
      sum_guidance_aligned: "SOTP is aligned with company guidance ({g}) (gap {d}%pt).",
    },
  };

  function currentLang() {
    const saved = localStorage.getItem(STORAGE_KEY_LANG);
    if (saved === "ja" || saved === "en") return saved;
    // Default: detect from browser
    const nav = (navigator.language || "ja").toLowerCase();
    return nav.startsWith("ja") ? "ja" : "en";
  }
  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY_LANG, lang);
    document.documentElement.lang = lang;
    applyTranslations();
    updateLangButtons();
    // Re-render any displayed report so dynamic strings update
    if (lastReport) renderReport(lastReport);
  }
  function t(key, vars) {
    const lang = currentLang();
    const dict = I18N[lang] || I18N.ja;
    let s = dict[key] !== undefined ? dict[key] : I18N.ja[key];
    if (s === undefined) return key;
    if (vars) {
      for (const k of Object.keys(vars)) {
        s = s.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
      }
    }
    return s;
  }

  function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      el.textContent = t(key);
    });
    document.querySelectorAll("*").forEach((el) => {
      for (const attr of el.attributes || []) {
        const m = /^data-i18n-attr-(.+)$/.exec(attr.name);
        if (m) {
          const targetAttr = m[1];
          el.setAttribute(targetAttr, t(attr.value));
        }
      }
    });
  }

  function updateLangButtons() {
    const lang = currentLang();
    document.querySelectorAll(".lang-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.lang === lang);
    });
  }

  /* ---------- Utils ---------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

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
    if (!bar) return;
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
      const tok = currentToken();
      if (!tok) throw new Error(t("err_no_token"));
      headers["x-access-token"] = tok;
    }
    const resp = await fetch("/api/analyze", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...payload, model: currentModel(), lang: currentLang() }),
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
      throw new Error("REPORT_DATA: JSON not found in response.");
    }
    const after = text.slice(idx + "REPORT_DATA:".length);
    const start = after.indexOf("{");
    if (start < 0) throw new Error("No JSON object after REPORT_DATA:.");
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
    if (end < 0) throw new Error("Unterminated JSON in REPORT_DATA.");
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
      [t("meta_company"), r.company || "—"],
      [t("meta_code"), r.code || "—"],
      [t("meta_industry"), r.industry || "—"],
      [t("meta_fy"), r.fiscal_year || "—"],
      [t("meta_currency"), r.currency || "—"],
      [t("meta_generated"), r.generated || "—"],
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
    kpi.appendChild(kpiCard(t("kpi_sotp"), sotp, t("kpi_sotp_sub"), "primary"));
    kpi.appendChild(kpiCard(t("kpi_3yr"), threeYr, t("kpi_3yr_sub"), threeYr === null ? "" : threeYr >= 0 ? "positive" : "negative"));
    kpi.appendChild(kpiCard(t("kpi_industry"), ind, r.benchmarks?.industry_source || t("kpi_industry_sub_default"), ""));
    kpi.appendChild(kpiCard(t("kpi_analyst"), ana, t("kpi_analyst_sub"), ""));

    drawFinancialChart(r);
    drawSegmentChart(r);

    const tbody = $("#segment-table tbody");
    tbody.innerHTML = "";
    (r.segments || []).forEach((s) => {
      const tr = document.createElement("tr");
      let tag = `<span class="tag mid">${t("tag_stable")}</span>`;
      if (s.growth >= 15) tag = `<span class="tag high">${t("tag_high")}</span>`;
      else if (s.growth < 0) tag = `<span class="tag low">${t("tag_shrink")}</span>`;
      else if (s.growth >= 5) tag = `<span class="tag info">${t("tag_grow")}</span>`;
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

    const lang = currentLang();
    const labelRev = lang === "ja" ? `売上高 (${r.currency || ""})` : `Revenue (${r.currency || ""})`;
    const labelOp = lang === "ja" ? `営業利益 (${r.currency || ""})` : `Operating profit (${r.currency || ""})`;
    const labelNet = lang === "ja" ? `純利益 (${r.currency || ""})` : `Net profit (${r.currency || ""})`;
    const labelGrowth = lang === "ja" ? "売上成長率(%)" : "Revenue growth (%)";
    const yTitle = lang === "ja" ? "成長率(%)" : "Growth (%)";

    const primary = getCSSVar("--primary");
    const positive = getCSSVar("--positive");
    const neutral = getCSSVar("--neutral");
    const text = getCSSVar("--text-soft");
    const grid = getCSSVar("--border");

    financialChart = new Chart(ctx, {
      data: {
        labels,
        datasets: [
          { type: "bar", label: labelRev, data: rev, backgroundColor: primary + "cc", borderColor: primary, borderWidth: 1, yAxisID: "y", order: 3 },
          { type: "bar", label: labelOp, data: op, backgroundColor: positive + "cc", borderColor: positive, borderWidth: 1, yAxisID: "y", order: 2 },
          { type: "line", label: labelNet, data: net, borderColor: neutral, backgroundColor: neutral, borderWidth: 2, tension: 0.25, yAxisID: "y", order: 1 },
          { type: "line", label: labelGrowth, data: grw, borderColor: text, backgroundColor: text, borderWidth: 2, borderDash: [6, 4], tension: 0.25, yAxisID: "y1", order: 0 },
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
          y1: { position: "right", title: { display: true, text: yTitle, color: text, font: { size: 10 } }, ticks: { color: text, callback: (v) => v + "%" }, grid: { drawOnChartArea: false } },
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
    const lang = currentLang();
    const segLabel = lang === "ja" ? "セグメント成長率(%)" : "Segment growth (%)";

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
      data: { labels, datasets: [{ label: segLabel, data, backgroundColor: colors.map((c) => c + "cc"), borderColor: colors, borderWidth: 1 }] },
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
      { name: t("div_sotp_vs_analyst"), a: sotp, b: ana, formula: t("formula_sotp_analyst") },
      { name: t("div_sotp_vs_guidance"), a: sotp, b: gui, formula: t("formula_sotp_guidance") },
      { name: t("div_sotp_vs_industry"), a: sotp, b: ind, formula: t("formula_sotp_industry") },
      { name: t("div_analyst_vs_industry"), a: ana, b: ind, formula: t("formula_analyst_industry") },
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
        if (gap > 4) { cls = "over"; verdict = t("verdict_over"); }
        else if (gap < -4) { cls = "under"; verdict = t("verdict_under"); }
        else verdict = t("verdict_neutral");
      } else {
        verdict = t("verdict_no_data");
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
      const dStr = d.toFixed(1);
      lines.push(
        d > 4 ? t("sum_above_industry_strong", { d: dStr })
          : d < -4 ? t("sum_below_industry_strong", { d: dStr })
          : t("sum_industry_aligned", { d: dStr })
      );
    }
    if (sotp !== null && ana !== null) {
      const d = sotp - ana;
      const dStr = d.toFixed(1);
      const aStr = fmtPct(ana, 1, true);
      lines.push(
        d > 4 ? t("sum_analyst_under", { d: dStr, a: aStr })
          : d < -4 ? t("sum_analyst_over", { d: dStr, a: aStr })
          : t("sum_analyst_aligned", { d: dStr, a: aStr })
      );
    }
    if (sotp !== null && gui !== null) {
      const d = sotp - gui;
      const dStr = d.toFixed(1);
      const gStr = fmtPct(gui, 1, true);
      const sStr = fmtPct(sotp, 1, true);
      lines.push(
        d > 4 ? t("sum_guidance_conservative", { d: dStr, g: gStr, s: sStr })
          : d < -4 ? t("sum_guidance_aggressive", { d: dStr, g: gStr, s: sStr })
          : t("sum_guidance_aligned", { d: dStr, g: gStr, s: sStr })
      );
    }

    $("#summary-card").innerHTML = lines.length ? lines.join("<br />") : t("summary_no_data");

    const tags = [];
    if (sotp !== null && ind !== null && sotp - ind > 4) tags.push([t("stag_above_industry"), "high"]);
    if (sotp !== null && ind !== null && sotp - ind < -4) tags.push([t("stag_below_industry"), "low"]);
    if (sotp !== null && ana !== null) {
      const d = Math.abs(sotp - ana);
      if (d <= 2) tags.push([t("stag_aligned_analyst"), "info"]);
      else if (sotp - ana > 4) tags.push([t("stag_under_market"), "under"]);
      else if (sotp - ana < -4) tags.push([t("stag_over_market"), "low"]);
    }
    if (sotp !== null && gui !== null) {
      if (sotp > gui + 4) tags.push([t("stag_guidance_conservative"), "info"]);
      else if (sotp < gui - 4) tags.push([t("stag_guidance_aggressive"), "mid"]);
    }
    const segs = r.segments || [];
    const high = segs.filter((s) => s.growth >= 15).length;
    if (high > 0) tags.push([t("stag_high_segments", { n: high }), "high"]);

    const row = $("#tags-row");
    row.innerHTML = "";
    tags.forEach(([txt, c]) => {
      const span = document.createElement("span");
      span.className = "tag " + c;
      span.textContent = txt;
      row.appendChild(span);
    });
  }

  /* ---------- Markdown ---------- */
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
    return kind === "detail" ? t("drill_label_detail")
      : kind === "competitor" ? t("drill_label_competitor")
      : t("drill_label_scenario");
  }
  async function runDrilldown(kind) {
    if (!lastReport) return;
    const out = $("#drill-output");
    out.classList.add("visible");
    out.innerHTML = `<h4>${labelForDrill(kind)}</h4><div class="muted">${t("drill_loading")}</div>`;
    try {
      const text = await callApi({ mode: kind, context: lastReport });
      out.innerHTML = `<h4>${labelForDrill(kind)}</h4>` + renderMarkdown(text);
    } catch (e) {
      out.innerHTML = `<h4>${labelForDrill(kind)}</h4><div class="neg">${t("err_drill")}${escapeHTML(e.message)}</div>`;
    }
  }

  /* ---------- Main run ---------- */
  async function runAnalysis() {
    if (isRunning) return;
    const query = $("#company-input").value.trim();
    if (!query) { showError(t("err_no_company")); return; }
    if (appConfig.require_token && !currentToken()) {
      showError(t("err_no_token"));
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
      showError(t("err_prefix") + e.message);
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
    const lang = currentLang();
    const sample = lang === "ja"
      ? {
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
        }
      : {
          company: "Sample Pharma Inc.",
          code: "9999",
          industry: "Pharmaceuticals",
          currency: "$M",
          fiscal_year: "FY2024",
          generated: "2026/4/30",
          financials: [
            { year: "FY2022", revenue: 38000, op_profit: 4500, net_profit: 3200, rev_growth: null },
            { year: "FY2023", revenue: 41000, op_profit: 5100, net_profit: 3600, rev_growth: 7.9 },
            { year: "FY2024", revenue: 44500, op_profit: 5800, net_profit: 4100, rev_growth: 8.5 },
          ],
          segments: [
            { name: "Oncology", share: 28, growth: 22 },
            { name: "Rare Diseases", share: 18, growth: 35 },
            { name: "GI / Neuro", share: 24, growth: 5 },
            { name: "Vaccines", share: 12, growth: -3 },
            { name: "Other", share: 18, growth: 4 },
          ],
          benchmarks: {
            industry_growth: 6.5,
            industry_source: "Grand View Research (Pharma 2025)",
            analyst_consensus: 9.2,
            company_guidance: 7.5,
          },
          sotp_growth: 0,
          notes: "Sample data for UI verification only — not real company information.",
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
    if (!sel) return;
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
      const tokInput = $("#token-input");
      tokInput.value = currentToken();
      tokInput.addEventListener("change", () => {
        if (tokInput.value) localStorage.setItem(STORAGE_KEY_TOKEN, tokInput.value.trim());
        else localStorage.removeItem(STORAGE_KEY_TOKEN);
      });
    }
  }

  async function loadConfig() {
    try {
      const r = await fetch("/api/config");
      if (r.ok) {
        const cfg = await r.json();
        appConfig = { ...appConfig, ...cfg };
      }
    } catch (_) {}
  }

  function bindLanguageToggle() {
    document.querySelectorAll(".lang-btn").forEach((b) => {
      b.addEventListener("click", () => setLang(b.dataset.lang));
    });
  }

  async function init() {
    document.documentElement.lang = currentLang();
    applyTranslations();
    updateLangButtons();
    bindLanguageToggle();

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
  }

  // Run init whether or not DOMContentLoaded already fired.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
