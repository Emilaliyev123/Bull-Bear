const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

function loadFrontend() {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const source = fs.readFileSync(appPath, "utf8").replace(/\n\(async function init\(\)[\s\S]*$/, "");
  const appElement = { innerHTML: "" };
  const storage = new Map();
  const sandbox = {
    URL,
    URLSearchParams,
    clearInterval,
    clearTimeout,
    console,
    confirm: () => false,
    document: {
      addEventListener() {},
      body: { classList: { add() {}, remove() {} } },
      getElementById: () => appElement,
      querySelector: () => null,
      querySelectorAll: () => []
    },
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    FormData,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, String(value))
    },
    setInterval: () => 0,
    setTimeout: () => 0,
    window: {
      addEventListener() {},
      BullBearMarketHub: {
        cryptoAssets: ["BTC", "ETH", "SOL"],
        forexPairs: ["EUR/USD", "GBP/USD", "XAU/USD"],
        commodityAssets: ["XAU/USD", "Silver", "Oil", "Natural Gas"]
      },
      history: { pushState() {} },
      location: { href: "http://localhost/market-hub", pathname: "/market-hub", search: "" },
      scrollTo() {}
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: appPath });
  return {
    evaluate: (expression) => vm.runInContext(expression, sandbox),
    source
  };
}

function analyzerResult(overrides = {}) {
  const components = Object.fromEntries([
    "trend",
    "marketStructure",
    "supportResistance",
    "liquidity",
    "momentum",
    "volume",
    "volatility",
    "newsRisk",
    "riskReward",
    "marketSpecific"
  ].map((name) => [name, { score: 7, status: "bullish", detail: `${name} confirmation` }]));
  return {
    market: "crypto",
    asset: "BTC",
    mode: "dayTrading",
    timeframe: "1h",
    signalStatus: "long",
    confidenceScore: 78,
    riskLevel: "medium",
    marketBias: "bullish",
    entryZone: { low: 60000, high: 60500 },
    stopLoss: 59000,
    takeProfits: [{ level: "TP1", price: 62500, riskMultiple: 2 }],
    riskReward: 2.2,
    strategyBreakdown: { setupQuality: "strong", components },
    explanation: "Educational market analysis only.",
    invalidationRule: "Stand aside below 59000.",
    noSignalReason: null,
    highRiskWarning: null,
    dataStatus: { status: "demo", provider: "Mock provider", message: "Educational scenario." },
    isDemo: true,
    lastUpdated: "2026-06-27T00:00:00.000Z",
    metadata: { educationalDisclaimer: "Educational analysis only. Not financial advice." },
    _analysisSource: "backend",
    ...overrides
  };
}

test("Market Hub education and risk guide include every requested section", () => {
  const frontend = loadFrontend();
  const lessons = frontend.evaluate("renderEducationHub()");
  const riskGuide = frontend.evaluate("renderRiskGuide()");

  assert.equal((lessons.match(/class="lesson-card"/g) || []).length, 8);
  assert.match(lessons, /What is Market Hub\?/);
  assert.match(lessons, /How to Read Analyzer Signals/);
  assert.match(lessons, /Demo Data vs Live Data/);
  assert.equal((riskGuide.match(/<div><span>\d{2}<\/span><strong>/g) || []).length, 7);
  assert.match(riskGuide, /Why risk\/reward below 1:2 is rejected/);
  assert.match(riskGuide, /Why users should journal trades/);
});

test("analyzer results explain confidence, confluence, invalidation, and data status", () => {
  const frontend = loadFrontend();
  const html = frontend.evaluate(`renderAnalyzerResult(${JSON.stringify(analyzerResult())})`);

  assert.match(html, /Protected Backend Analysis/);
  assert.match(html, /Why This Result\?/);
  assert.equal((html.match(/class="strategy-item"/g) || []).length, 10);
  assert.match(html, /75-89<small>Strong/);
  assert.match(html, /Invalidation Rule/);
  assert.match(html, /Demo means the interface uses educational market scenarios/);
});

test("no-signal, high-risk, and stock research states give appropriate guidance", () => {
  const frontend = loadFrontend();
  const noSignal = frontend.evaluate(`renderAnalyzerResult(${JSON.stringify(analyzerResult({
    signalStatus: "noSignal",
    confidenceScore: 35,
    entryZone: null,
    stopLoss: null,
    takeProfits: [],
    riskReward: 1.4,
    noSignalReason: "Wait for structure and volume confirmation."
  }))})`);
  const highRisk = frontend.evaluate(`renderAnalyzerResult(${JSON.stringify(analyzerResult({
    signalStatus: "highRisk",
    riskLevel: "extreme",
    entryZone: null,
    stopLoss: null,
    takeProfits: [],
    highRiskWarning: "Major simulated news risk is active."
  }))})`);
  const stock = frontend.evaluate(`renderAnalyzerResult(${JSON.stringify(analyzerResult({
    market: "stocks",
    asset: "AAPL",
    mode: "longTermInvestment",
    timeframe: "1w",
    signalStatus: "neutral",
    entryZone: null,
    stopLoss: null,
    takeProfits: [],
    riskReward: null,
    strategyBreakdown: {
      setupQuality: "research",
      components: analyzerResult().strategyBreakdown.components,
      research: { dcaIdea: "Build exposure in stages.", riskFactors: ["Valuation", "Rates"] }
    }
  }))})`);

  assert.match(noSignal, /What to wait for/);
  assert.match(noSignal, /Trade levels withheld/);
  assert.match(highRisk, /Why high risk\?/);
  assert.match(stock, /Long-Term Research View/);
  assert.match(stock, /Not a day-trade signal/);
  assert.match(stock, /DCA \/ Long-Term Approach/);
});

test("premium shell and arbitrage scanner remain present", () => {
  const frontend = loadFrontend();
  const scanner = frontend.evaluate("renderArbitrageScanner()");
  const crypto = frontend.evaluate("renderCryptoAnalyzer()");
  const forex = frontend.evaluate("renderForexAnalyzer()");
  const commodities = frontend.evaluate("renderCommoditiesAnalyzer()");
  const stocks = frontend.evaluate("renderStockAnalyzer()");

  assert.match(frontend.source, /Protected Backend Analyzer/);
  assert.match(frontend.source, /Demo \/ Live Data Status/);
  assert.match(frontend.source, /Live crypto data enabled\. Forex, gold, stocks, and commodities remain demo\/research until their APIs are connected\./);
  assert.match(frontend.source, /Data", "Strategies", "Scoring", "Risk Filters", "Result/);
  assert.match(frontend.source, /fetch\("\/api\/market-hub\/analyze"/);
  assert.match(crypto, /Protected Analyzer V2 · Live Crypto Data/);
  assert.match(forex, /Protected Analyzer V2 · Demo \/ Research/);
  assert.match(commodities, /Protected Analyzer V2 · Demo \/ Research/);
  assert.match(stocks, /Protected Analyzer V2 · Demo \/ Research/);
  assert.match(scanner, /Real-Time Crypto Arbitrage Scanner/);
  assert.match(scanner, /data-refresh-scanner/);
});

test("products page provides inline checkout status feedback", () => {
  const frontend = loadFrontend();
  assert.match(frontend.source, /<div data-status aria-live="polite">\$\{state\.message\}<\/div>/);
});
