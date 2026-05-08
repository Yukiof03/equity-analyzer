// Server-side proxy to the Anthropic API.
// The API key lives in process.env and never reaches the browser.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const ALLOWED_MODELS_DEFAULT = [
  "claude-sonnet-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5-20251001",
];

const SYSTEM_PROMPT_ANALYZE_JA = `株式アナリストとして、指定企業をWeb検索で調査し、応答末尾に必ず下記JSONを1ブロックだけ出力。

収集: ①過去3年の売上/営業利益/純利益（億円or$M）と売上YoY% ②直近年度セグメント別売上構成比%とYoY%（合計100%に正規化）③業界CAGR%と出典 ④来期アナリストコンセンサス成長% ⑤来期会社ガイダンス成長%
sotp_growth = Σ(share×growth)/100 を計算。テキスト値は日本語、数値は数値型、不明はnull、全フィールド必須。

REPORT_DATA: {"company":"","code":"","industry":"","currency":"億円|$M","fiscal_year":"FY2024","generated":"YYYY/M/D","financials":[{"year":"FY2022","revenue":0,"op_profit":0,"net_profit":0,"rev_growth":null},{"year":"FY2023","revenue":0,"op_profit":0,"net_profit":0,"rev_growth":0},{"year":"FY2024","revenue":0,"op_profit":0,"net_profit":0,"rev_growth":0}],"segments":[{"name":"","share":0,"growth":0}],"benchmarks":{"industry_growth":0,"industry_source":"","analyst_consensus":0,"company_guidance":0},"sotp_growth":0,"notes":""}`;

const SYSTEM_PROMPT_ANALYZE_EN = `As an equity research assistant, research the company via web search and output exactly one JSON block at the end of your reply.

Collect: ①Past 3yr revenue/op_profit/net_profit ($M or 億円) and revenue YoY% ②Latest FY segment revenue mix% and YoY% (normalize to 100%) ③Industry CAGR% with source ④Next-FY analyst consensus growth% ⑤Next-FY company guidance growth%
sotp_growth = Σ(share×growth)/100. Text fields in English, numbers as numeric type, null when unknown, all fields required.

REPORT_DATA: {"company":"","code":"","industry":"","currency":"$M|億円","fiscal_year":"FY2024","generated":"YYYY/M/D","financials":[{"year":"FY2022","revenue":0,"op_profit":0,"net_profit":0,"rev_growth":null},{"year":"FY2023","revenue":0,"op_profit":0,"net_profit":0,"rev_growth":0},{"year":"FY2024","revenue":0,"op_profit":0,"net_profit":0,"rev_growth":0}],"segments":[{"name":"","share":0,"growth":0}],"benchmarks":{"industry_growth":0,"industry_source":"","analyst_consensus":0,"company_guidance":0},"sotp_growth":0,"notes":""}`;

const SYSTEM_PROMPT_DRILLDOWN_JA = "経験豊富な株式アナリスト。簡潔・具体的な日本語マークダウンで回答。";
const SYSTEM_PROMPT_DRILLDOWN_EN = "Experienced equity analyst. Reply in concise, specific English markdown.";

function buildUserPromptAnalyze(query, lang) {
  if (lang === "en") {
    return `Company: ${query}\nResearch via web search (prefer 10-K/10-Q/Investor Presentation for US, 決算説明資料/有価証券報告書 for JP) and return REPORT_DATA.`;
  }
  return `企業：${query}\nWeb検索で調査し（米国株は10-K/10-Q/Investor Presentation、日本株は決算説明資料/有価証券報告書を優先）、REPORT_DATAを返す。`;
}

// Build a mode-specific compact context — strips fields the drilldown does not
// need and removes pretty-print whitespace. Cuts ~50–70% of context tokens.
function compactContext(ctx, mode) {
  if (!ctx || typeof ctx !== "object") return "{}";
  const out = {
    company: ctx.company,
    code: ctx.code,
    industry: ctx.industry,
    sotp_growth: ctx.sotp_growth,
  };
  if (mode === "detail") {
    out.financials = (ctx.financials || []).map((f) => ({
      year: f.year, revenue: f.revenue, op_profit: f.op_profit,
      net_profit: f.net_profit, rev_growth: f.rev_growth,
    }));
    out.segments = (ctx.segments || []).map((s) => ({
      name: s.name, share: s.share, growth: s.growth,
    }));
    out.benchmarks = ctx.benchmarks;
    if (ctx.notes) out.notes = String(ctx.notes).slice(0, 200);
  } else if (mode === "competitor") {
    // Competitor pulls fresh data from the web — only need identity + segment shape
    const last = (ctx.financials || []).slice(-1)[0];
    if (last) out.latest = { year: last.year, revenue: last.revenue, rev_growth: last.rev_growth };
    out.segments = (ctx.segments || []).map((s) => ({ name: s.name, share: s.share }));
  } else if (mode === "scenario") {
    out.financials = (ctx.financials || []).map((f) => ({ year: f.year, rev_growth: f.rev_growth }));
    out.segments = (ctx.segments || []).map((s) => ({
      name: s.name, share: s.share, growth: s.growth,
    }));
    out.benchmarks = ctx.benchmarks;
  }
  return JSON.stringify(out); // compact, no indent
}

function buildUserPromptDrilldown(mode, context, lang) {
  const ctxStr = compactContext(context, mode);
  const ctx = `\n${lang === "en" ? "[data]" : "【データ】"}${ctxStr}`;
  if (mode === "detail") {
    return (lang === "en"
      ? "Write a 3-5 paragraph investor evaluation. Cover growth drivers, risks, the meaning of SOTP-vs-market divergence, and segments to watch."
      : "投資家向けに3〜5段落で詳細評価。成長ドライバー、リスク、SOTPと市場予測の乖離の意味、注目セグメントを論じる。"
    ) + ctx;
  }
  if (mode === "competitor") {
    return (lang === "en"
      ? "Web-search 2-3 major competitors. Build a concise markdown table of recent revenue YoY% and key segments, end with brief commentary."
      : "主要競合2〜3社をWeb検索で特定。直近売上YoY%と注目セグメントの簡潔なマークダウン表を作り、最後に短評を添える。"
    ) + ctx;
  }
  if (mode === "scenario") {
    return (lang === "en"
      ? "Build 3 medium-term (3-5yr) scenarios: bull / base / bear. For each, bullet: revenue growth range, business environment, key assumptions, risks."
      : "今後3〜5年の中期シナリオ「強気・中立・弱気」を作成。各シナリオで売上成長率レンジ・事業環境・主要前提・リスクを箇条書きで示す。"
    ) + ctx;
  }
  return "";
}

// ---------- Simple in-memory rate limit ----------
// Note: This resets on cold start and is not shared across regions.
// For production hardening, use Upstash Redis or Vercel KV.
const rateLimits = new Map();
const RATE_LIMIT_PER_HOUR = parseInt(process.env.RATE_LIMIT_PER_HOUR || "10", 10);
const WINDOW_MS = 60 * 60 * 1000;

function getIP(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function checkRateLimit(ip) {
  const now = Date.now();
  const data = rateLimits.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > data.resetAt) {
    data.count = 0;
    data.resetAt = now + WINDOW_MS;
  }
  if (data.count >= RATE_LIMIT_PER_HOUR) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((data.resetAt - now) / 1000)),
    };
  }
  data.count++;
  rateLimits.set(ip, data);
  return { ok: true };
}

// ---------- Handler ----------
// On Render (long-running server) there is no platform timeout — we just guard
// against runaway upstream calls. On Vercel the maxDuration export caps at 60s.
export const maxDuration = 300;
export const config = {
  maxDuration: 300,
};
const FETCH_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "サーバー側でANTHROPIC_API_KEYが設定されていません。Vercelの環境変数を確認してください。",
    });
  }

  // Optional shared-secret access token
  const requiredToken = process.env.ACCESS_TOKEN;
  if (requiredToken) {
    const provided = req.headers["x-access-token"];
    if (provided !== requiredToken) {
      return res.status(401).json({ error: "アクセストークンが無効です。" });
    }
  }

  // Rate limit
  const ip = getIP(req);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    res.setHeader("Retry-After", rl.retryAfter);
    return res.status(429).json({
      error: `レート制限を超過しました。${Math.ceil(rl.retryAfter / 60)}分後に再試行してください。`,
    });
  }

  const { mode, query, context, model, lang: rawLang } = req.body || {};
  const lang = rawLang === "en" ? "en" : "ja";

  const allowedModels = (process.env.ALLOWED_MODELS || ALLOWED_MODELS_DEFAULT.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const chosenModel = allowedModels.includes(model) ? model : allowedModels[0];

  let system;
  let user;
  let useWebSearch;
  let maxTokens;

  if (mode === "analyze") {
    if (!query || typeof query !== "string" || query.length < 1 || query.length > 200) {
      return res.status(400).json({ error: lang === "en" ? "Invalid query (1–200 chars)." : "query が不正です（1〜200文字）。" });
    }
    system = lang === "en" ? SYSTEM_PROMPT_ANALYZE_EN : SYSTEM_PROMPT_ANALYZE_JA;
    user = buildUserPromptAnalyze(query, lang);
    useWebSearch = true;
    maxTokens = 3000;
  } else if (mode === "detail" || mode === "competitor" || mode === "scenario") {
    if (!context || typeof context !== "object") {
      return res.status(400).json({ error: lang === "en" ? "Missing context." : "context が不足しています。" });
    }
    system = lang === "en" ? SYSTEM_PROMPT_DRILLDOWN_EN : SYSTEM_PROMPT_DRILLDOWN_JA;
    user = buildUserPromptDrilldown(mode, context, lang);
    useWebSearch = mode === "competitor";
    maxTokens = 2000;
  } else {
    return res.status(400).json({ error: lang === "en" ? "Invalid mode." : "mode が不正です。" });
  }

  const body = {
    model: chosenModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (useWebSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const msg = data?.error?.message || `Upstream API error ${upstream.status}`;
      return res.status(upstream.status >= 500 ? 502 : upstream.status).json({ error: msg });
    }

    const text = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    return res.status(200).json({ text, model: chosenModel });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") {
      const msg = lang === "en"
        ? "Request timed out (>5min). The upstream call took unusually long. Try retrying, or switch to Claude Haiku in Settings."
        : "リクエストがタイムアウトしました（5分超）。Anthropic API側で異常に時間がかかっています。再試行するか、設定からClaude Haikuに切り替えてみてください。";
      return res.status(504).json({ error: msg });
    }
    return res.status(500).json({ error: lang === "en" ? `Server error: ${e.message}` : `サーバーエラー: ${e.message}` });
  }
}
