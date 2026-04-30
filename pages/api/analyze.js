// Server-side proxy to the Anthropic API.
// The API key lives in process.env and never reaches the browser.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const ALLOWED_MODELS_DEFAULT = [
  "claude-sonnet-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5-20251001",
];

const SYSTEM_PROMPT_ANALYZE_JA = `あなたは株式アナリスト・アシスタントです。ユーザーが指定した上場企業について、以下5項目をWeb検索で収集し、必ず指定のJSONフォーマットで返してください。

【収集項目】
1. 過去3年の財務推移（売上高・営業利益・純利益、それぞれ億円単位、米国株は$M単位でも可）と売上のYoY成長率(%)
2. 直近年度のセグメント別売上構成比(%)とYoY成長率(%)（事業セグメント、または地域・疾患領域などの主要区分。合計100%に正規化）
3. その企業が属する業界の市場成長率（CAGR、年率%）と出典名
4. 来期売上アナリストコンセンサス成長率(%)
5. 来期会社公式ガイダンス成長率(%)

【SOTP計算】
sotp_growth = Σ(segments[i].share × segments[i].growth) / 100  をあなた自身が計算して入れてください。

【出力言語】
JSON内のテキスト（company, industry, segment name, notes 等）は **日本語** で記載してください。

【出力フォーマット】
返答の最後に、必ず以下の形式で出力してください。説明文は前半に書いてもよいですが、JSONブロックは最後に1つだけ、改行を含めて以下の形で出力してください：

REPORT_DATA: {
  "company": "企業名",
  "code": "証券コード",
  "industry": "業界名",
  "currency": "億円" or "$M",
  "fiscal_year": "FY2024",
  "generated": "2026/4/30",
  "financials": [
    {"year": "FY2022", "revenue": 12345, "op_profit": 1234, "net_profit": 800, "rev_growth": null},
    {"year": "FY2023", "revenue": 13000, "op_profit": 1300, "net_profit": 850, "rev_growth": 5.3},
    {"year": "FY2024", "revenue": 14000, "op_profit": 1400, "net_profit": 900, "rev_growth": 7.7}
  ],
  "segments": [
    {"name": "セグメントA", "share": 60, "growth": 8},
    {"name": "セグメントB", "share": 40, "growth": 15}
  ],
  "benchmarks": {
    "industry_growth": 6.5,
    "industry_source": "Grand View Research",
    "analyst_consensus": 7.0,
    "company_guidance": 6.0
  },
  "sotp_growth": 10.8,
  "notes": "特記事項・注意点があれば記載"
}

数値は数値型で、不明な場合のみ null を入れてください。すべてのフィールドは必須です。`;

const SYSTEM_PROMPT_ANALYZE_EN = `You are an equity research assistant. For the listed company specified by the user, gather the following 5 items via web search and return them in the exact JSON format specified.

[Items to collect]
1. Past 3 years of financials (revenue, operating profit, net profit; use $M for US stocks, 億円 for Japanese stocks if natural) and YoY revenue growth (%)
2. Latest fiscal year segment revenue mix (%) and YoY growth (%) (business segments, or geography / therapeutic areas — normalize to 100%)
3. Industry market growth rate (CAGR, annual %) and source name
4. Next fiscal year analyst consensus revenue growth (%)
5. Next fiscal year official company guidance growth (%)

[SOTP calculation]
sotp_growth = Σ(segments[i].share × segments[i].growth) / 100 — calculate this yourself and include it.

[Output language]
All text fields in the JSON (company, industry, segment name, notes, etc.) must be in **English**.

[Output format]
At the end of your response, output the JSON in exactly this form. You may write explanatory text first, but include exactly one JSON block at the end with newlines:

REPORT_DATA: {
  "company": "Company Name",
  "code": "Ticker",
  "industry": "Industry name",
  "currency": "$M" or "億円",
  "fiscal_year": "FY2024",
  "generated": "2026/4/30",
  "financials": [
    {"year": "FY2022", "revenue": 12345, "op_profit": 1234, "net_profit": 800, "rev_growth": null},
    {"year": "FY2023", "revenue": 13000, "op_profit": 1300, "net_profit": 850, "rev_growth": 5.3},
    {"year": "FY2024", "revenue": 14000, "op_profit": 1400, "net_profit": 900, "rev_growth": 7.7}
  ],
  "segments": [
    {"name": "Segment A", "share": 60, "growth": 8},
    {"name": "Segment B", "share": 40, "growth": 15}
  ],
  "benchmarks": {
    "industry_growth": 6.5,
    "industry_source": "Grand View Research",
    "analyst_consensus": 7.0,
    "company_guidance": 6.0
  },
  "sotp_growth": 10.8,
  "notes": "Any caveats or supplementary notes"
}

Numeric fields must be numbers (use null only when unknown). All fields are required.`;

const SYSTEM_PROMPT_DRILLDOWN_JA = "あなたは経験豊富な株式アナリストです。マークダウンで日本語で、簡潔かつ具体的に書いてください。";
const SYSTEM_PROMPT_DRILLDOWN_EN = "You are an experienced equity analyst. Write in English, in concise and specific markdown.";

function buildUserPromptAnalyze(query, lang) {
  if (lang === "en") {
    return `Research the company below across the 5 items above via web search, calculate the SOTP weighted average growth, and return REPORT_DATA in the specified format.

Company: ${query}

Reference the latest earnings materials, IR information, and market research reports. For US stocks prefer 10-K / 10-Q / Investor Presentation; for Japanese stocks prefer the latest 決算説明資料 / 有価証券報告書.`;
  }
  return `次の企業について、上記の5項目をWeb検索で調査し、SOTP加重平均成長率を計算してREPORT_DATA形式で返してください。

企業：${query}

最新の決算資料・IR情報・市場調査レポートを参照してください。日本株なら日本語のIR資料を、米国株なら10-K/10-QまたはInvestor Presentationを優先してください。`;
}

function buildUserPromptDrilldown(mode, context, lang) {
  const ctx = `\n\n${lang === "en" ? "[Reference data]" : "【参考データ】"}\n${JSON.stringify(context, null, 2)}`;
  if (mode === "detail") {
    return (lang === "en"
      ? "Based on the company data below, write a detailed evaluation in 3-5 paragraphs for investors. Discuss growth drivers, risks, the meaning of the SOTP-vs-market divergence, and segments to watch."
      : "以下の企業データに基づき、投資家向けに3〜5パラグラフで詳細評価コメントを書いてください。" +
        "成長ドライバー、リスク、SOTPと市場予測の乖離の意味、注目すべきセグメントを論じてください."
    ) + ctx;
  }
  if (mode === "competitor") {
    return (lang === "en"
      ? "Identify 2-3 major competitors of the company below via web search, build a concise markdown comparison table of recent revenue growth (YoY %) and key segments for each, and end with a brief commentary."
      : "以下の企業の主要な競合他社2〜3社をWeb検索で特定し、それぞれの直近売上成長率（YoY %）と" +
        "注目セグメントの簡潔な比較表（マークダウン）を作成し、最後にコメントを付けてください。"
    ) + ctx;
  }
  if (mode === "scenario") {
    return (lang === "en"
      ? "For the company below, build three medium-term scenarios for the next 3-5 years: bull / base / bear. For each, list as bullets: revenue growth range, expected business environment, key assumptions, and risks to watch."
      : "以下の企業について、今後3〜5年の中期シナリオを「強気・中立・弱気」の3つで作成してください。" +
        "各シナリオで売上成長率レンジ・想定される事業環境・主要前提・注目すべきリスクを箇条書きで示してください。"
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
// Vercel Hobby cap: 60s. We bail at 55s with a clean error.
export const maxDuration = 60;
export const config = {
  maxDuration: 60,
};
const FETCH_TIMEOUT_MS = 55000;

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
        ? "Request timed out (>55s). Tip: try a more specific company name, switch to Claude Haiku in Settings, or retry."
        : "リクエストがタイムアウトしました（55秒超）。対処：より具体的な企業名で試す／設定からClaude Haikuに切替／時間をおいて再試行してください。";
      return res.status(504).json({ error: msg });
    }
    return res.status(500).json({ error: lang === "en" ? `Server error: ${e.message}` : `サーバーエラー: ${e.message}` });
  }
}
