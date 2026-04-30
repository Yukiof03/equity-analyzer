import Head from "next/head";
import Script from "next/script";

export default function Home() {
  return (
    <>
      <Head>
        <title>Equity Growth Analyzer | 企業成長分析ダッシュボード</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content="企業名または証券コードから、SOTP加重平均成長率と市場予測との乖離を自動分析するWebアプリ" />
      </Head>

      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
        strategy="beforeInteractive"
      />

      <div className="wrap">
        <header className="app-head">
          <div className="brand">
            Equity Growth Analyzer
            <small>企業成長分析ダッシュボード · SOTP乖離分析</small>
          </div>
          <div className="head-actions">
            <button className="link-btn" id="sample-btn" type="button">サンプル表示</button>
          </div>
        </header>

        <section className="input-card" id="input-section">
          <label htmlFor="company-input">企業名 または 証券コード</label>
          <div className="input-row">
            <input
              id="company-input"
              type="text"
              placeholder="例：武田薬品工業 / 4502 / Apple / AAPL"
              autoComplete="off"
            />
            <button id="run-btn" type="button">分析開始</button>
          </div>
          <div className="hint">
            日本株（4桁の東証コード）・米国株（NYSE/NASDAQティッカー）に対応。Enterキーでも実行できます。
          </div>

          <details className="settings" id="settings-details">
            <summary>設定（モデル選択・アクセストークン）</summary>
            <div className="row" style={{ marginTop: 8 }}>
              <label htmlFor="model-select" style={{ fontSize: 11, color: "var(--text-soft)" }}>
                モデル：
              </label>
              <select id="model-select" style={{ flex: 1 }}></select>
            </div>
            <div className="row" id="token-row" style={{ display: "none", marginTop: 8 }}>
              <label htmlFor="token-input" style={{ fontSize: 11, color: "var(--text-soft)" }}>
                アクセストークン：
              </label>
              <input id="token-input" type="password" style={{ flex: 1 }} placeholder="管理者から共有されたトークン" />
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              APIキーはサーバー側で管理されています。ユーザー側での設定は不要です。
            </div>
          </details>
        </section>

        <section className="progress-card" id="progress-section" style={{ display: "none" }}>
          <div className="progress-bar"><div id="progress-bar-inner" /></div>
          <div className="steps">
            <div className="step" data-step="1">財務データ収集</div>
            <div className="step" data-step="2">セグメント分析</div>
            <div className="step" data-step="3">業界比較</div>
            <div className="step" data-step="4">予測収集</div>
            <div className="step" data-step="5">レポート生成</div>
          </div>
        </section>

        <div id="error-box" className="err-box" style={{ display: "none" }} />

        <section className="report" id="report-section">
          <div className="meta" id="meta-row" />

          <h2>KPIサマリー</h2>
          <div className="section-sub">主要4指標の比較</div>
          <div className="kpi-grid" id="kpi-grid" />

          <h2>財務推移（過去3年）</h2>
          <div className="section-sub">売上高・営業利益（棒）／純利益（線）／売上成長率（破線・第2軸）</div>
          <div className="chart-card"><canvas id="financial-chart" /></div>

          <h2>セグメント別成長率</h2>
          <div className="section-sub">SOTP加重平均（破線）と各セグメントを比較</div>
          <div className="chart-card"><canvas id="segment-chart" /></div>

          <table className="seg-table" id="segment-table">
            <thead>
              <tr>
                <th>セグメント</th>
                <th className="num">構成比</th>
                <th className="num">成長率</th>
                <th className="num">寄与度</th>
                <th>評価</th>
              </tr>
            </thead>
            <tbody />
          </table>

          <h2>乖離分析（4軸スコアカード）</h2>
          <div className="section-sub">SOTP・アナリスト・ガイダンス・業界平均の差分（±4%pt超で過大／過小評価）</div>
          <div className="div-grid" id="div-grid" />

          <h2>総合評価</h2>
          <div className="summary-card" id="summary-card" />
          <div className="tags-row" id="tags-row" />
          <div className="notes-card" id="notes-card" style={{ display: "none" }} />

          <h2>ドリルダウン</h2>
          <div className="section-sub">追加分析をClaudeにリクエスト</div>
          <div className="drill-row">
            <button className="drill-btn" data-drill="detail" type="button">詳細評価を依頼</button>
            <button className="drill-btn" data-drill="competitor" type="button">競合比較</button>
            <button className="drill-btn" data-drill="scenario" type="button">中期シナリオ</button>
          </div>
          <div className="drill-output" id="drill-output" />

          <div className="reset-row">
            <button className="link-btn" id="reset-btn" type="button">↻ 別企業を分析</button>
          </div>
        </section>

        <footer>
          Powered by Anthropic Claude API · Chart.js 4.4.1<br />
          本ツールの分析結果はClaudeのWeb検索能力に依存します。投資判断は必ず公式IR資料との照合を行ってください。
        </footer>
      </div>

      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}

export async function getServerSideProps() {
  // Pass server config (whether token is required) to client via cookie/meta
  // Simpler: expose at /api/config and let client fetch.
  return { props: {} };
}
