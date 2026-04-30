# Equity Growth Analyzer (Next.js / Vercel 版)

企業名・証券コードから SOTP 加重平均成長率と市場予測との乖離を自動分析する Web アプリ。
Anthropic API キーをサーバー側で管理し、URL を共有するだけで誰でも使える構成です。

---

## 1. 仕組みの概要

```
[Browser]  →  /api/analyze (Vercel Serverless Function)  →  Anthropic API
                  ↑ ANTHROPIC_API_KEY をサーバー環境変数で保持
```

- ユーザーは URL を開くだけ。API キー入力は不要。
- API キーは Vercel の環境変数に保管され、ブラウザに送信されない。
- 1 IP あたり 1 時間 10 リクエストの簡易レート制限を内蔵（環境変数で変更可能）。
- オプションで「アクセストークン」を設定して社内限定公開も可能。

---

## 2. 必要なもの

- [GitHub](https://github.com/) アカウント（無料）
- [Vercel](https://vercel.com/) アカウント（無料 Hobby プランで OK）
- [Anthropic API キー](https://console.anthropic.com/)（クレジットカード登録必須・課金は使用量分のみ）

---

## 3. デプロイ手順（5〜10分）

### A. このフォルダを GitHub に push

1. GitHub で新しいリポジトリを作成（例：`equity-analyzer`）。Public でも Private でも OK。
2. このフォルダ全体を push：

```bash
cd equity-analyzer-nextjs
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/equity-analyzer.git
git push -u origin main
```

### B. Vercel にインポート

1. [vercel.com/new](https://vercel.com/new) にアクセス
2. 作成したリポジトリを選択 → 「Import」
3. **Environment Variables** セクションで以下を追加：

| 変数名 | 値 | 必須 |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...`（Anthropic コンソールで発行） | ✅ |
| `RATE_LIMIT_PER_HOUR` | `10`（任意、デフォルト10） | – |
| `ACCESS_TOKEN` | 社内限定にしたい場合の共有トークン（任意） | – |

4. 「Deploy」をクリック
5. 1〜2分でビルド完了 → `https://your-app.vercel.app` のような URL が払い出される

これで完了です。URL を共有すれば誰でも使えます。

### C. （任意）独自ドメイン

Vercel ダッシュボード → Project → Settings → Domains で独自ドメインを追加できます。

---

## 4. ローカル開発

```bash
cp .env.local.example .env.local
# .env.local を開いて ANTHROPIC_API_KEY を設定

npm install
npm run dev
# http://localhost:3000 を開く
```

---

## 5. コスト管理（重要）

Anthropic API は使用量課金です。以下を把握しておいてください。

- **1 分析あたりの概算コスト**: Claude Sonnet + Web検索込みで $0.10〜$0.30 程度
- **月 100 ユーザー × 5 分析 → $50〜$150 程度**

### 対策

1. **レート制限**: デフォルトで 1 IP 10 req/h。`RATE_LIMIT_PER_HOUR` で変更可。
2. **アクセストークン**: `ACCESS_TOKEN` を設定すると、トークンを持つ人しか使えなくなります（社内配布向け）。
3. **Anthropic コンソールの Usage Limit**: コンソールで月次の使用上限金額を設定しておくと暴走防止になります。
4. **Vercel の使用量監視**: Vercel ダッシュボードで関数呼び出し数・帯域を確認。

### 本番運用で推奨される追加対策

- **Upstash Redis** によるグローバル分散レート制限（現在の in-memory はインスタンスごとにリセットされます）
- **Cloudflare Turnstile** や **hCaptcha** で bot 対策
- **NextAuth** などでログイン必須化
- **Stripe** と組み合わせた課金モデル

---

## 6. ファイル構成

```
equity-analyzer-nextjs/
├── package.json
├── next.config.mjs
├── vercel.json              ← maxDuration=60s 設定
├── .env.local.example
├── .gitignore
├── README.md
├── pages/
│   ├── _app.js              ← グローバル CSS 読み込み
│   ├── index.js             ← トップページ（UI）
│   └── api/
│       ├── analyze.js       ← Anthropic 呼び出しプロキシ（メイン）
│       └── config.js        ← 公開設定（許可モデル等）を返す
├── public/
│   └── app.js               ← クライアント側ロジック
└── styles/
    └── globals.css
```

---

## 7. UI で選択できるモデル

サーバーは以下のモデルのみを許可しています（クライアントから送られてきた値を検証）。
変更したい場合は環境変数 `ALLOWED_MODELS` をカンマ区切りで設定してください。

- `claude-sonnet-4-5`（デフォルト・推奨）
- `claude-sonnet-4-6`
- `claude-opus-4-6`（高品質・低速・高コスト）
- `claude-haiku-4-5-20251001`（最速・低コスト）

---

## 8. トラブルシューティング

| 症状 | 原因と対処 |
|---|---|
| `ANTHROPIC_API_KEY が設定されていません` | Vercel の Environment Variables に追加し再デプロイ |
| `model: ... 404` | 該当モデルがアカウントで未開放。別モデルを選択 |
| 関数タイムアウト（10秒） | Vercel Hobby は 10s デフォルト。`vercel.json` で `maxDuration: 60` 設定済み。Pro なら 300s まで延長可 |
| `429 レート制限超過` | 1 時間後に再試行、または `RATE_LIMIT_PER_HOUR` を上げる |
| Web 検索が動かない | Anthropic API の web_search ツールはアカウントレベルで有効化が必要な場合あり |

---

## 9. 既知の制約・今後の拡張候補

- 現状 in-memory レートリミットなので、Vercel の異なるリージョンにスケールアウトすると独立にカウントされる。Upstash KV を導入推奨。
- Web 検索精度は Claude のモデル能力に依存。公式 IR 資料との照合を推奨。
- 分析履歴の保存・PDF エクスポート・複数企業比較などは未実装（仕様書 §7.2 参照）。
- Pro プラン以上なら関数 maxDuration を 300s まで上げられ、より複雑なクエリ対応可。

---

Powered by Anthropic Claude API · Chart.js 4.4.1
