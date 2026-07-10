const { getMockMarketData } = require("./mockDataProvider");

const FMP_BASE_URL = "https://financialmodelingprep.com/api/v3";
const DEFAULT_TIMEOUT_MS = 4000;
const MIN_VALID_CANDLES = 60;

function mapFmpSymbol(market, asset) {
  if (market === "gold") return "XAUUSD";
  if (market === "forex") return String(asset).replace(/[^A-Z]/gi, "").toUpperCase();
  if (market === "commodities") {
    const a = String(asset).toUpperCase();
    if (a === "SILVER") return "XAGUSD";
    if (a === "OIL") return "CLUSD";
    if (a === "NATURAL GAS") return "NGUSD";
  }
  return String(asset).toUpperCase();
}

function mapFmpTimeframe(timeframe) {
  const map = {
    "5m": "5m",
    "15m": "15m",
    "1h": "1hour",
    "4h": "4hour",
    "1d": "1d",
    // 1w: FMP does not have a dedicated weekly endpoint.
    // We use daily bars and return enough bars (200) for weekly-context analysis.
    "1w": "1d"
  };
  return map[String(timeframe).toLowerCase()] || "1hour";
}

/**
 * Tries to parse a single raw FMP candle row.
 * Returns null (instead of throwing) if the row is malformed or out-of-range,
 * so callers can filter-and-continue rather than aborting the entire fetch.
 */
function parseFmpCandle(c) {
  const time = new Date(c.date).toISOString();
  const open = Number(c.open);
  const high = Number(c.high);
  const low = Number(c.low);
  const close = Number(c.close);
  const volume = Number(c.volume) || 0;

  if (!time || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) return null;
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0) return null;
  if (low > high || open < low || open > high || close < low || close > high) return null;

  return { time, open, high, low, close, volume };
}

async function fetchFmpCandles(market, asset, timeframe) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    throw new Error("FMP_API_KEY_MISSING");
  }

  const symbol = mapFmpSymbol(market, asset);
  const fmpTimeframe = mapFmpTimeframe(timeframe);

  // For weekly timeframe we request 200 daily bars to give enough context
  const limitParam = timeframe === "1w" ? "&limit=200" : "";
  let url;
  if (fmpTimeframe === "1d") {
    url = `${FMP_BASE_URL}/historical-price-full/${symbol}?apikey=${apiKey}${limitParam}`;
  } else {
    url = `${FMP_BASE_URL}/historical-chart/${fmpTimeframe}/${symbol}?apikey=${apiKey}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const fetchImpl = globalThis.fetch;
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }

    const data = await response.json();
    let rawCandles = [];

    if (fmpTimeframe === "1d") {
      if (!data || !Array.isArray(data.historical)) {
        throw new Error("INVALID_FMP_RESPONSE_1D");
      }
      rawCandles = data.historical;
    } else {
      if (!Array.isArray(data)) {
        throw new Error("INVALID_FMP_RESPONSE_INTRADAY");
      }
      rawCandles = data;
    }

    // FMP returns newest first (descending). Sort to oldest-first (ascending).
    rawCandles.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Defensive parsing: filter bad rows rather than throwing on a single bad candle
    const skipped = [];
    const candles = rawCandles.reduce((acc, c, i) => {
      const parsed = parseFmpCandle(c);
      if (parsed) {
        acc.push(parsed);
      } else {
        skipped.push(i);
      }
      return acc;
    }, []);

    if (skipped.length > 0) {
      console.warn(`[fmpDataProvider] Skipped ${skipped.length} malformed candle(s) for ${symbol}`);
    }

    if (candles.length < MIN_VALID_CANDLES) {
      throw new Error("INSUFFICIENT_CANDLES");
    }

    return { candles, symbol, fmpTimeframe };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getFmpMarketData(request, options = {}) {
  try {
    const { candles, symbol, fmpTimeframe } = await fetchFmpCandles(request.market, request.asset, request.timeframe);
    const context = getMockMarketData(request);

    return {
      ...context,
      candles,
      newsRisk: {
        level: "unknown",
        event: "Live news feed is not connected. Check major events independently."
      },
      volatilityRisk: {
        level: "normal",
        reason: "ATR-based volatility risk will be calculated from live FMP candles."
      },
      btcTrend: "unavailable",
      dataStatus: {
        status: "live",
        provider: "Financial Modeling Prep",
        message: `Live OHLCV candles for ${symbol} at ${fmpTimeframe}${request.timeframe === "1w" ? " (daily bars used for weekly context)" : ""}. No live news feed is currently connected.`
      },
      dataSource: "Financial Modeling Prep",
      isDemo: false,
      lastUpdated: candles.at(-1).time,
      liveDataStatus: {
        attempted: true,
        available: true,
        fallbackUsed: false
      }
    };
  } catch (error) {
    const fallback = getMockMarketData(request);
    const reasonCode = String(error.message || "PROVIDER_UNAVAILABLE").toUpperCase().replace(/[^A-Z0-9_]/g, "_");

    return {
      ...fallback,
      dataStatus: {
        status: "fallback-demo",
        provider: "Deterministic demo fallback",
        message: "Live FMP data was unavailable. This result uses deterministic educational demo candles and is not a live market signal."
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

module.exports = { getFmpMarketData, fetchFmpCandles, mapFmpSymbol, mapFmpTimeframe, parseFmpCandle };
