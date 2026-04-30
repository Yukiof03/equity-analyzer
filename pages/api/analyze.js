// Server-side proxy to the Anthropic API.
// The API key lives in process.env and never reaches the browser.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const ALLOWED_MODELS_DEFAULT = [
  "claude-sonnet-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5-20251001",
];

const SYSTEM_PROMPT_ANALYZE = `あなたは株式アナリスト・アシスタントです。ユーザーが指定した上場企業について、以下5項目をWeb検索で収集し、必ず指定のJSONフォーマットで返してください。

【収集項目】
1. 過去3年の財務推移（売上高・営業利益・純利益、それぞれ億円単位、米国株は$M単位でも可）と売上のYoY成長率(%)
2. 直近年度のセグメント別売上構成比(%)とYoY成長率(%)（事業セグメント、または地域・疾患領域などの主要区分。合計100%に正規化）
3. その企業が属する業界の市場成長率（CAGR、年率%）と出典名
4. 来期売上アナリストコンセンサス成長率(%)
5. 来期会社公式ガイダンス成長率(%)

【SOTP計算】
sotp_growth = Σ(segments[i].share × segments[i].growth) / 100  をあなた自身が計算して入れてください。

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

const SYSTEM_PROMPT_DRILLDOWN = "あなたは経験豊富な株式アナリストです。マークダウンで簡潔かつ具体的に書いてください。";

function buildUserPromptAnalyze(query) {
  return `次の企業について、上記の5項目をWeb検索で調査し、SOTP加重平均成長率を計算してREPORT_DATA形式で返してください。

企業：${query}

最新の決算資料・IR情報・市場調査レポートを参照してください。日本株なら日本語のIR資料を、米国株なら10-K/10-QまたはInvestor Presentationを優先してください。`;
}

function buildUserPromptDrilldown(mode, context) {
  const ctx = `\n\n【参考データ】\n${JSON.stringify(context, null, 2)}`;
  if (mode === "detail") {
    return (
      "以下の企業データに基づき、投資家向けに3〜5パラグラフで詳細評価コメントを書いてください。" +
      "成長ドライバー、リスク、SOTPと市場予測の乖離の意味、注目すべきセグメントを論じてください。" +
      ctx
    );
  }
  if (mode === "competitor") {
    return (
      "以下の企業の主要な競合他社2〜3社をWeb検索で特定し、それぞれの直近売上成長率（YoY %）と" +
      "注目セグメントの簡潔な比較表（マークダウン）を作成し、最後にコメントを付けてください。" +
      ctx
    );
  }
  if (mode === "scenario") {
    return (
      "以下の企業について、今後3〜5年の中期シナリオを「強気・中立・弱気」の3つで作成してください。" +
      "各シナリオで売上成長率レンジ・想定される事業環境・主要前提・注目すべきリスクを箇条書きで示してください。" +
      ctx
    );
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
export const config = {
  maxDuration: 60,
};

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

  const { mode, query, context, model } = req.body || {};

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
      return res.status(400).json({ error: "query が不正です（1〜200文字）。" });
    }
    system = SYSTEM_PROMPT_ANALYZE;
    user = buildUserPromptAnalyze(query);
    useWebSearch = true;
    maxTokens = 4000;
  } else if (mode === "detail" || mode === "competitor" || mode === "scenario") {
    if (!context || typeof context !== "object") {
      return res.status(400).json({ error: "context が不足しています。" });
    }
    system = SYSTEM_PROMPT_DRILLDOWN;
    user = buildUserPromptDrilldown(mode, context);
    useWebSearch = mode === "competitor";
    maxTokens = 2000;
  } else {
    return res.status(400).json({ error: "mode が不正です。" });
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

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

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
    return res.status(500).json({ error: `サーバーエラー: ${e.message}` });
  }
}
