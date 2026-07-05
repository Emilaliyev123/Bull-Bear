const { getMockMarketData } = require("./mockDataProvider");

const FMP_BASE_URL = "https://financialmodelingprep.com/api/v3";
const DEFAULT_TIMEOUT_MS = 4000;

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
    "1d": "1d"
  };
  return map[String(timeframe).toLowerCase()] || "1hour";
}

async function fetchFmpCandles(market, asset, timeframe) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    throw new Error("FMP_API_KEY_MISSING");
  }

  const symbol = mapFmpSymbol(market, asset);
  const fmpTimeframe = mapFmpTimeframe(timeframe);

  let url;
  if (fmpTimeframe === "1d") {
    url = `${FMP_BASE_URL}/historical-price-full/${symbol}?apikey=${apiKey}`;
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

    if (rawCandles.length < 60) {
      throw new Error("INSUFFICIENT_CANDLES");
    }

    // FMP returns newest first (descending). We sort by time to get oldest first (ascending).
    rawCandles.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const candles = rawCandles.map(c => {
      const time = new Date(c.date).toISOString();
      const open = Number(c.open);
      const high = Number(c.high);
      const low = Number(c.low);
      const close = Number(c.close);
      const volume = Number(c.volume) || 0;

      if (!time || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
        throw new Error("MALFORMED_CANDLE");
      }

      return { time, open, high, low, close, volume };
    });

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
        message: `Live OHLCV candles for ${symbol} at ${fmpTimeframe}. No live news feed is currently connected.`
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

module.exports = { getFmpMarketData, fetchFmpCandles, mapFmpSymbol, mapFmpTimeframe };
