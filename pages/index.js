import Head from "next/head";
import Script from "next/script";

export default function Home() {
  return (
    <>
      <Head>
        <title>Equity Growth Analyzer</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="description"
          content="Auto-analyze SOTP-weighted growth and divergence from market forecasts for any listed company."
        />
      </Head>

      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
        strategy="beforeInteractive"
      />

      <div className="wrap">
        <header className="app-head">
          <div className="brand">
            Equity Growth Analyzer
            <small data-i18n="brand_subtitle">企業成長分析ダッシュボード · SOTP乖離分析</small>
          </div>
          <div className="head-actions">
            <div className="lang-toggle" role="group" aria-label="Language">
              <button className="lang-btn" data-lang="ja" type="button">JA</button>
              <button className="lang-btn" data-lang="en" type="button">EN</button>
            </div>
            <button className="link-btn" id="sample-btn" type="button" data-i18n="sample_btn">サンプル表示</button>
          </div>
        </header>

        <section className="input-card" id="input-section">
          <label htmlFor="company-input" data-i18n="input_label">企業名 または 証券コード</label>
          <div className="input-row">
            <input
              id="company-input"
              type="text"
              placeholder="例：武田薬品工業 / 4502 / Apple / AAPL"
              data-i18n-attr-placeholder="input_placeholder"
              autoComplete="off"
            />
            <button id="run-btn" type="button" data-i18n="run_btn">分析開始</button>
          </div>
          <div className="hint" data-i18n="input_hint">
            日本株（4桁の東証コード）・米国株（NYSE/NASDAQティッカー）に対応。Enterキーでも実行できます。
          </div>

          <details className="settings" id="settings-details">
            <summary data-i18n="settings_summary">設定（モデル選択・アクセストークン）</summary>
            <div className="row" style={{ marginTop: 8 }}>
              <label htmlFor="model-select" style={{ fontSize: 11, color: "var(--text-soft)" }} data-i18n="settings_model">
                モデル：
              </label>
              <select id="model-select" style={{ flex: 1 }}></select>
            </div>
            <div className="row" id="token-row" style={{ display: "none", marginTop: 8 }}>
              <label htmlFor="token-input" style={{ fontSize: 11, color: "var(--text-soft)" }} data-i18n="settings_token">
                アクセストークン：
              </label>
              <input
                id="token-input"
                type="password"
                style={{ flex: 1 }}
                placeholder="管理者から共有されたトークン"
                data-i18n-attr-placeholder="settings_token_placeholder"
              />
            </div>
            <div className="hint" style={{ marginTop: 8 }} data-i18n="settings_hint">
              APIキーはサーバー側で管理されています。ユーザー側での設定は不要です。
            </div>
          </details>
        </section>

        <section className="progress-card" id="progress-section" style={{ display: "none" }}>
          <div className="progress-bar"><div id="progress-bar-inner" /></div>
          <div className="steps">
            <div className="step" data-step="1" data-i18n="step1">財務データ収集</div>
            <div className="step" data-step="2" data-i18n="step2">セグメント分析</div>
            <div className="step" data-step="3" data-i18n="step3">業界比較</div>
            <div className="step" data-step="4" data-i18n="step4">予測収集</div>
            <div className="step" data-step="5" data-i18n="step5">レポート生成</div>
          </div>
        </section>

        <div id="error-box" className="err-box" style={{ display: "none" }} />

        <section className="report" id="report-section">
          <div className="meta" id="meta-row" />

          <h2 data-i18n="h2_kpi">KPIサマリー</h2>
          <div className="section-sub" data-i18n="sub_kpi">主要4指標の比較</div>
          <div className="kpi-grid" id="kpi-grid" />

          <h2 data-i18n="h2_fin">財務推移（過去3年）</h2>
          <div className="section-sub" data-i18n="sub_fin">売上高・営業利益（棒）／純利益（線）／売上成長率（破線・第2軸）</div>
          <div className="chart-card"><canvas id="financial-chart" /></div>

          <h2 data-i18n="h2_seg">セグメント別成長率</h2>
          <div className="section-sub" data-i18n="sub_seg">SOTP加重平均（破線）と各セグメントを比較</div>
          <div className="chart-card"><canvas id="segment-chart" /></div>

          <table className="seg-table" id="segment-table">
            <thead>
              <tr>
                <th data-i18n="seg_th_seg">セグメント</th>
                <th className="num" data-i18n="seg_th_share">構成比</th>
                <th className="num" data-i18n="seg_th_growth">成長率</th>
                <th className="num" data-i18n="seg_th_contrib">寄与度</th>
                <th data-i18n="seg_th_tag">評価</th>
              </tr>
            </thead>
            <tbody />
          </table>

          <h2 data-i18n="h2_div">乖離分析（4軸スコアカード）</h2>
          <div className="section-sub" data-i18n="sub_div">SOTP・アナリスト・ガイダンス・業界平均の差分（±4%pt超で過大／過小評価）</div>
          <div className="div-grid" id="div-grid" />

          <h2 data-i18n="h2_summary">総合評価</h2>
          <div className="summary-card" id="summary-card" />
          <div className="tags-row" id="tags-row" />
          <div className="notes-card" id="notes-card" style={{ display: "none" }} />

          <h2 data-i18n="h2_drill">ドリルダウン</h2>
          <div className="section-sub" data-i18n="sub_drill">追加分析をClaudeにリクエスト</div>
          <div className="drill-row">
            <button className="drill-btn" data-drill="detail" type="button" data-i18n="drill_detail">詳細評価を依頼</button>
            <button className="drill-btn" data-drill="competitor" type="button" data-i18n="drill_competitor">競合比較</button>
            <button className="drill-btn" data-drill="scenario" type="button" data-i18n="drill_scenario">中期シナリオ</button>
          </div>
          <div className="drill-output" id="drill-output" />

          <div className="reset-row">
            <button className="link-btn" id="reset-btn" type="button" data-i18n="reset_btn">↻ 別企業を分析</button>
          </div>
        </section>

        <footer>
          Powered by Anthropic Claude API · Chart.js 4.4.1<br />
          <span data-i18n="footer_disclaimer">本ツールの分析結果はClaudeのWeb検索能力に依存します。投資判断は必ず公式IR資料との照合を行ってください。</span>
        </footer>
      </div>

      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
