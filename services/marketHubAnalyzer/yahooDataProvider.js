/**
 * Yahoo Finance Data Provider
 * Free, no API key required.
 * Supports: Forex (all major pairs), Gold (GC=F), Commodities, Stocks.
 *
 * Yahoo Finance v8 chart API returns OHLCV in unix-timestamp arrays.
 * Endpoint: https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=X&range=Y
 */

const { getMockMarketData } = require("./mockDataProvider");

const BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const TIMEOUT_MS = 6000;
const MIN_VALID_CANDLES = 60;

// ─── Symbol Map ───────────────────────────────────────────────────────────────

// Map our internal asset names → Yahoo Finance ticker symbols
const YAHOO_SYMBOL_MAP = {
  // Forex pairs (append =X for CCY pairs)
  "EUR/USD": "EURUSD=X", "GBP/USD": "GBPUSD=X", "USD/JPY": "USDJPY=X",
  "AUD/USD": "AUDUSD=X", "USD/CAD": "USDCAD=X", "USD/CHF": "USDCHF=X",
  "NZD/USD": "NZDUSD=X", "EUR/GBP": "EURGBP=X", "EUR/JPY": "EURJPY=X",
  "GBP/JPY": "GBPJPY=X", "EUR/CHF": "EURCHF=X", "AUD/JPY": "AUDJPY=X",
  "USD/SGD": "USDSGD=X", "EUR/AUD": "EURAUD=X",
  // Gold & commodities
  "XAU/USD": "GC=F",   // Gold futures (COMEX) — most reliable free source
  "GOLD":    "GC=F",
  "XAG/USD": "SI=F",   // Silver futures
  "OIL":     "CL=F",   // WTI Crude futures
  "USOIL":   "CL=F",
  "NATURAL GAS": "NG=F",
};

function resolveYahooSymbol(market, asset) {
  const key = String(asset).toUpperCase();
  if (YAHOO_SYMBOL_MAP[asset]) return YAHOO_SYMBOL_MAP[asset];
  if (YAHOO_SYMBOL_MAP[key]) return YAHOO_SYMBOL_MAP[key];

  // Forex fallback: "EURUSD" → "EURUSD=X"
  if (market === "forex") {
    const clean = key.replace("/", "").replace(/[^A-Z]/g, "");
    return clean + "=X";
  }
  // Gold fallback
  if (market === "gold") return "GC=F";
  // Commodities
  if (market === "commodities") return key.includes("OIL") ? "CL=F" : key + "=F";
  // Stocks — use symbol directly
  return key;
}

// ─── Interval Map ─────────────────────────────────────────────────────────────

// Yahoo interval → range needed to get enough bars for our MIN_VALID_CANDLES
const INTERVAL_CONFIG = {
  "5m":  { yahooInterval: "5m",   range: "5d"  },
  "15m": { yahooInterval: "15m",  range: "5d"  },
  "1h":  { yahooInterval: "1h",   range: "5d"  },
  "4h":  { yahooInterval: "60m",  range: "1mo" }, // Yahoo has no 4h; use 60m over 1mo
  "1d":  { yahooInterval: "1d",   range: "6mo" },
  "1w":  { yahooInterval: "1wk",  range: "2y"  },
};

function resolveYahooInterval(timeframe) {
  return INTERVAL_CONFIG[timeframe] || INTERVAL_CONFIG["1h"];
}

// ─── Candle Builder ───────────────────────────────────────────────────────────

/**
 * Converts Yahoo Finance's parallel arrays into our standard candle format.
 * Skips bars with null/NaN values (Yahoo includes nulls for pre/after-hours gaps).
 */
function buildCandlesFromYahoo(result) {
  const timestamps = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const opens   = q.open   || [];
  const highs   = q.high   || [];
  const lows    = q.low    || [];
  const closes  = q.close  || [];
  const volumes = q.volume || [];

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open   = Number(opens[i]);
    const high   = Number(highs[i]);
    const low    = Number(lows[i]);
    const close  = Number(closes[i]);
    const volume = Number(volumes[i]) || 0;

    // Skip null/NaN bars (weekend gaps, holidays)
    if (!closes[i] || isNaN(close) || close <= 0) continue;
    if (isNaN(open) || isNaN(high) || isNaN(low)) continue;
    if (low > high) continue;

    candles.push({
      time:   new Date(timestamps[i] * 1000).toISOString(),
      open:   open  || close,
      high:   high  || close,
      low:    low   || close,
      close,
      volume,
      // Mark Forex candles — Yahoo provides no real FX volume
      ...(volume === 0 && { isTickVolume: true })
    });
  }
  return candles;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchYahooCandles(market, asset, timeframe) {
  const symbol = resolveYahooSymbol(market, asset);
  const { yahooInterval, range } = resolveYahooInterval(timeframe);
  const url = `${BASE_URL}/${encodeURIComponent(symbol)}?interval=${yahooInterval}&range=${range}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);

    const json = await response.json();
    const result = json?.chart?.result?.[0];
    const error  = json?.chart?.error;

    if (error) throw new Error(`YAHOO_${error.code || "ERROR"}: ${error.description || ""}`);
    if (!result) throw new Error("YAHOO_EMPTY_RESULT");

    const candles = buildCandlesFromYahoo(result);
    if (candles.length < MIN_VALID_CANDLES) throw new Error("INSUFFICIENT_CANDLES");

    const meta = result.meta || {};
    return {
      candles,
      symbol,
      yahooInterval,
      meta: {
        currency:      meta.currency,
        exchangeName:  meta.fullExchangeName || meta.exchangeName,
        regularMarket: meta.regularMarketPrice,
        timezone:      meta.timezone
      }
    };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function getYahooMarketData(request) {
  try {
    const { candles, symbol, yahooInterval, meta } = await fetchYahooCandles(
      request.market, request.asset, request.timeframe
    );
    const context = getMockMarketData(request);

    return {
      ...context,
      candles,
      newsRisk: {
        level: "unknown",
        explanation: "Live news feed is not connected. Check major events independently before trading.",
        scoreImpact: 0,
        shouldBlockTrade: false,
        activeEvents: [],
        upcomingEvents: []
      },
      volatilityRisk: {
        level: "normal",
        reason: "ATR-based volatility computed from live Yahoo Finance candles."
      },
      dataStatus: {
        status: "live",
        provider: "Yahoo Finance",
        message: `Live OHLCV for ${symbol} (${meta.exchangeName || "market"}) @ ${yahooInterval}. No live news feed connected.`
      },
      dataSource: "Yahoo Finance (free, no key required)",
      isDemo: false,
      lastUpdated: candles.at(-1).time,
      liveDataStatus: {
        attempted: true,
        available: true,
        fallbackUsed: false,
        symbol,
        exchange: meta.exchangeName,
        currency: meta.currency
      }
    };
  } catch (error) {
    const fallback = getMockMarketData(request);
    const reasonCode = String(error.message || "YAHOO_UNAVAILABLE")
      .replace(/[^A-Z0-9_]/gi, "_").toUpperCase().slice(0, 60);

    console.warn(`[yahooDataProvider] Fallback for ${request.market}/${request.asset}: ${reasonCode}`);

    return {
      ...fallback,
      dataStatus: {
        status: "fallback-demo",
        provider: "Deterministic demo fallback",
        message: `Yahoo Finance unavailable (${reasonCode}). Using deterministic demo candles — not a live signal.`
      },
      dataSource: "Deterministic demo fallback",
      isDemo: true,
      lastUpdated: new Date().toISOString(),
      liveDataStatus: {
        attempted: true,
        available: false,
        fallbackUsed: true,
        reasonCode
      }
    };
  }
}

module.exports = {
  getYahooMarketData,
  fetchYahooCandles,
  resolveYahooSymbol,
  resolveYahooInterval,
  YAHOO_SYMBOL_MAP
};
