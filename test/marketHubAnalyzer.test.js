const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AnalyzerValidationError,
  analyzeMarketHub,
  validateAnalysisRequest
} = require("../services/marketHubAnalyzer");

const REQUIRED_RESULT_FIELDS = [
  "market",
  "asset",
  "mode",
  "timeframe",
  "signalStatus",
  "confidenceScore",
  "riskLevel",
  "marketBias",
  "entryZone",
  "stopLoss",
  "takeProfits",
  "riskReward",
  "strategyBreakdown",
  "explanation",
  "invalidationRule",
  "noSignalReason",
  "highRiskWarning",
  "dataStatus",
  "isDemo",
  "lastUpdated"
];

const SAMPLES = [
  { market: "crypto", asset: "BTC", mode: "dayTrading", timeframe: "15m" },
  { market: "forex", asset: "EUR/USD", mode: "swingTrading", timeframe: "4h" },
  { market: "gold", asset: "XAU/USD", mode: "dayTrading", timeframe: "1h" },
  { market: "stocks", asset: "AAPL", mode: "longTermInvestment", timeframe: "1w" },
  { market: "commodities", asset: "OIL", mode: "swingTrading", timeframe: "4h" }
];

test("returns a complete, non-executable demo result for every market", () => {
  for (const sample of SAMPLES) {
    const result = analyzeMarketHub(sample);
    for (const field of REQUIRED_RESULT_FIELDS) {
      assert.ok(Object.hasOwn(result, field), `${sample.market} is missing ${field}`);
    }
    assert.equal(result.isDemo, true);
    assert.equal(result.dataStatus.status, "demo");
    assert.equal(result.metadata.executionEnabled, false);
    assert.equal(result.metadata.orderPlacementSupported, false);
    assert.match(result.explanation, /Educational market analysis only/);
    assert.ok(result.invalidationRule.length > 0);
  }
});

test("long-term stock research does not return trading levels", () => {
  const result = analyzeMarketHub(SAMPLES[3]);
  assert.equal(result.signalStatus, "neutral");
  assert.equal(result.entryZone, null);
  assert.equal(result.stopLoss, null);
  assert.deepEqual(result.takeProfits, []);
  assert.equal(result.riskReward, null);
});

test("risk/reward below 2 blocks an otherwise directional setup", () => {
  const result = analyzeMarketHub(SAMPLES[1]);
  assert.ok(result.riskReward < 2);
  assert.equal(result.signalStatus, "noSignal");
  assert.equal(result.entryZone, null);
});

test("extreme simulated risk returns highRisk and suppresses levels", () => {
  const result = analyzeMarketHub(SAMPLES[4]);
  assert.equal(result.riskLevel, "extreme");
  assert.equal(result.signalStatus, "highRisk");
  assert.equal(result.entryZone, null);
  assert.ok(result.highRiskWarning);
});

test("normalizes supported aliases and rejects unsupported input", () => {
  assert.deepEqual(
    validateAnalysisRequest({ market: "crypto", asset: "btcusdt", mode: "Day Trading", timeframe: "1H" }),
    { market: "crypto", asset: "BTC", mode: "dayTrading", timeframe: "1h" }
  );
  assert.throws(
    () => validateAnalysisRequest({ market: "options", mode: "dayTrading", timeframe: "1h" }),
    AnalyzerValidationError
  );
  assert.throws(
    () => validateAnalysisRequest({ market: "crypto", asset: "UNKNOWN", mode: "dayTrading", timeframe: "1h" }),
    AnalyzerValidationError
  );
});
