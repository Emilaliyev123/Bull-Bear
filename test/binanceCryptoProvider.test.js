const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BINANCE_KLINES_PATH,
  fetchBinanceCryptoCandles,
  mapTimeframeToBinanceInterval,
  toBinanceSymbol
} = require("../services/marketHubAnalyzer/binanceCryptoProvider");
const { analyzeMarketHubWithLiveData } = require("../services/marketHubAnalyzer");

function normalizedCandles(count = 120, base = 60000) {
  const start = Date.UTC(2026, 5, 25, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const open = base + index * 8 + Math.sin(index / 5) * 80;
    const close = open + Math.sin(index / 3) * 35 + 12;
    return {
      time: new Date(start + index * 15 * 60 * 1000).toISOString(),
      open,
      high: Math.max(open, close) + 55,
      low: Math.min(open, close) - 55,
      close,
      volume: 1000 + index * 7
    };
  });
}

function binanceKlines(count = 120, base = 60000) {
  return normalizedCandles(count, base).map((candle) => [
    new Date(candle.time).getTime(),
    String(candle.open),
    String(candle.high),
    String(candle.low),
    String(candle.close),
    String(candle.volume),
    new Date(candle.time).getTime() + 899999,
    "0",
    100,
    "0",
    "0",
    "0"
  ]);
}

test("maps every supported analyzer timeframe to a Binance interval", () => {
  for (const timeframe of ["5m", "15m", "1h", "4h", "1d", "1w"]) {
    assert.equal(mapTimeframeToBinanceInterval(timeframe), timeframe);
  }
  assert.throws(() => mapTimeframeToBinanceInterval("30m"), /Unsupported Binance candle timeframe/);
});

test("normalizes supported V1 assets to read-only USDT market symbols", () => {
  const assets = ["BTC", "ETH", "XRP", "SOL", "BNB", "DOGE", "ADA", "AVAX", "LINK", "TON"];
  for (const asset of assets) {
    assert.equal(toBinanceSymbol(asset), `${asset}USDT`);
    assert.equal(toBinanceSymbol(`${asset}/USDT`), `${asset}USDT`);
  }
});

test("fetches and validates normalized public Binance OHLCV candles", async () => {
  let requestedUrl = "";
  let requestedOptions = null;
  const response = await fetchBinanceCryptoCandles(
    { asset: "BTC", timeframe: "15m" },
    {
      fetchImpl: async (url, options) => {
        requestedUrl = url;
        requestedOptions = options;
        return { ok: true, status: 200, json: async () => binanceKlines() };
      }
    }
  );

  const parsedUrl = new URL(requestedUrl);
  assert.equal(parsedUrl.origin, "https://api.binance.com");
  assert.equal(parsedUrl.pathname, "/api/v3/klines");
  assert.equal(parsedUrl.searchParams.get("symbol"), "BTCUSDT");
  assert.equal(parsedUrl.searchParams.get("interval"), "15m");
  assert.equal(requestedOptions.method, "GET");
  assert.deepEqual(Object.keys(response.candles[0]), ["time", "open", "high", "low", "close", "volume"]);
  assert.equal(response.candles.length, 120);
  assert.equal(response.dataSource, "Binance public market data");
});

test("crypto analyzer uses injected live candles and returns a live read-only result", async () => {
  const candles = normalizedCandles();
  const result = await analyzeMarketHubWithLiveData(
    { market: "crypto", asset: "BTCUSDT", mode: "dayTrading", timeframe: "15m" },
    {
      crypto: {
        provider: async () => ({
          symbol: "BTCUSDT",
          interval: "15m",
          candles,
          dataSource: "Binance public market data",
          lastUpdated: candles.at(-1).time
        })
      }
    }
  );

  assert.equal(result.dataStatus.status, "live");
  assert.equal(result.dataStatus.provider, "Binance public market data");
  assert.equal(result.dataSource, "Binance public market data");
  assert.equal(result.isDemo, false);
  assert.equal(result.lastUpdated, candles.at(-1).time);
  assert.equal(result.metadata.executionEnabled, false);
  assert.equal(result.metadata.orderPlacementSupported, false);
  assert.deepEqual(result.metadata.marketData, { attempted: true, available: true, fallbackUsed: false });
  assert.ok(Number.isFinite(result.strategyBreakdown.technicalSnapshot.ema20));
  assert.ok(Number.isFinite(result.strategyBreakdown.technicalSnapshot.ema50));
  assert.ok(Number.isFinite(result.strategyBreakdown.technicalSnapshot.rsi));
  assert.ok(Number.isFinite(result.strategyBreakdown.technicalSnapshot.atr));
  assert.match(result.explanation, /live-data confluence/);
});

test("crypto analyzer falls back to deterministic demo data when Binance fails", async () => {
  const result = await analyzeMarketHubWithLiveData(
    { market: "crypto", asset: "SOLUSDT", mode: "dayTrading", timeframe: "15m" },
    {
      crypto: {
        provider: async () => {
          const error = new Error("Network unavailable");
          error.code = "NETWORK_ERROR";
          throw error;
        }
      }
    }
  );

  assert.equal(result.dataStatus.status, "fallback-demo");
  assert.equal(result.dataStatus.provider, "Deterministic demo fallback");
  assert.equal(result.dataSource, "Deterministic demo fallback");
  assert.equal(result.isDemo, true);
  assert.deepEqual(result.metadata.marketData, {
    attempted: true,
    available: false,
    fallbackUsed: true,
    reasonCode: "NETWORK_ERROR"
  });
  assert.match(result.dataStatus.message, /not a live market signal/i);
  assert.match(result.explanation, /demo confluence/);
});

test("Binance provider contains no private, account, or trade endpoint URL", () => {
  const providerPath = path.join(__dirname, "..", "services", "marketHubAnalyzer", "binanceCryptoProvider.js");
  const source = fs.readFileSync(providerPath, "utf8");
  assert.equal(BINANCE_KLINES_PATH, "/api/v3/klines");
  assert.doesNotMatch(source, /["'`]\/api\/(?:v\d+\/)?(?:order|account|myTrades|openOrders|allOrders)[^"'`]*/i);
  assert.doesNotMatch(source, /X-MBX-APIKEY|secretKey|apiKey/);
});
