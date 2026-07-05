const assert = require("node:assert");
const { test, describe, before, after } = require("node:test");
const { evaluateNewsRisk } = require("../services/marketHubAnalyzer/newsRiskEngine");
const { fetchCurrentCalendarData } = require("../services/marketHubAnalyzer/newsRiskProvider");
const { isEventRelevant, STATIC_EVENTS } = require("../services/marketHubAnalyzer/economicCalendarProvider");

describe("News & Economic Calendar Risk Engine", () => {
  let originalEnv;

  before(() => {
    originalEnv = { ...process.env };
  });

  after(() => {
    process.env = { ...originalEnv };
  });

  test("returns static-calendar when API keys are missing", async () => {
    delete process.env.ECONOMIC_CALENDAR_PROVIDER;
    delete process.env.ECONOMIC_CALENDAR_API_KEY;
    delete process.env.NEWS_API_KEY;

    const data = await fetchCurrentCalendarData();
    assert.strictEqual(data.dataStatus, "static-calendar");
    assert.strictEqual(data.events, STATIC_EVENTS);
  });

  test("FOMC extreme risk blocks day trading setups within ±60 minutes", async () => {
    // FOMC July 2026 is at 2026-07-29T18:00:00.000Z
    const injectedTime = "2026-07-29T18:30:00.000Z"; // +30 minutes
    const result = await evaluateNewsRisk("crypto", "BTC", "dayTrading", injectedTime);
    
    assert.strictEqual(result.level, "extreme");
    assert.strictEqual(result.scoreImpact, -40);
    assert.strictEqual(result.shouldBlockTrade, true);
    assert.ok(result.activeEvents.some(e => e.id === "fomc-jul-2026"));
  });

  test("FOMC extreme risk allows research modes (marketSummary)", async () => {
    const injectedTime = "2026-07-29T18:30:00.000Z"; // +30 minutes
    const result = await evaluateNewsRisk("crypto", "BTC", "marketSummary", injectedTime);
    
    assert.strictEqual(result.level, "extreme");
    assert.strictEqual(result.scoreImpact, -40);
    assert.strictEqual(result.shouldBlockTrade, false); // Block trade is false for research mode
  });

  test("currency pair matching handles cross-market filters accurately", async () => {
    // ECB is EU/EUR, July 16, 2026 12:15 UTC
    const injectedTime = "2026-07-16T12:00:00.000Z"; // -15 minutes

    const eurResult = await evaluateNewsRisk("forex", "EUR/USD", "dayTrading", injectedTime);
    assert.strictEqual(eurResult.level, "extreme");
    assert.strictEqual(eurResult.shouldBlockTrade, true);

    const gbpResult = await evaluateNewsRisk("forex", "GBP/JPY", "dayTrading", injectedTime);
    // GBP/JPY is NOT directly affected by EUR, unless it's a USD extreme event
    assert.strictEqual(gbpResult.level, "normal");
    assert.strictEqual(gbpResult.shouldBlockTrade, false);
  });

  test("gold flags Fed events safely", async () => {
    // Powell Speech is high importance (US/USD/fed), July 17, 2026 14:00 UTC
    const injectedTime = "2026-07-17T14:10:00.000Z"; // +10 minutes

    const goldResult = await evaluateNewsRisk("gold", "XAU/USD", "swingTrading", injectedTime);
    assert.strictEqual(goldResult.level, "high");
    assert.strictEqual(goldResult.scoreImpact, -20);
    assert.ok(goldResult.activeEvents.some(e => e.id === "powell-speech-1"));
  });

  test("stocks sensitive to corporate earnings", async () => {
    // AAPL earnings on July 23, 2026 20:00 UTC
    const injectedTime = "2026-07-23T20:20:00.000Z"; // +20 minutes
    
    const aaplResult = await evaluateNewsRisk("stocks", "AAPL", "dayTrading", injectedTime);
    assert.strictEqual(aaplResult.level, "high");
    assert.strictEqual(aaplResult.scoreImpact, -20);
    
    const tslaResult = await evaluateNewsRisk("stocks", "TSLA", "dayTrading", injectedTime);
    assert.strictEqual(tslaResult.level, "normal");
    assert.strictEqual(tslaResult.scoreImpact, 0);
  });

  test("commodities OIL must match EIA inventory", async () => {
    // EIA on July 8, 2026 14:30 UTC
    const injectedTime = "2026-07-08T14:45:00.000Z"; // +15 minutes
    
    const oilResult = await evaluateNewsRisk("commodities", "OIL", "scalping", injectedTime);
    assert.strictEqual(oilResult.level, "high");
    assert.strictEqual(oilResult.scoreImpact, -20);
    
    const silverResult = await evaluateNewsRisk("commodities", "SILVER", "scalping", injectedTime);
    assert.strictEqual(silverResult.level, "normal");
    assert.strictEqual(silverResult.scoreImpact, 0);
  });
});
