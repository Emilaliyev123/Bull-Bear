const { getMockMarketData } = require("./mockDataProvider");

/**
 * FMP Free Plan (post-Aug 2025) Endpoint Map
 *
 * WORKING on free tier:
 *   - /stable/historical-chart/{interval}?symbol=BTCUSD  → intraday OHLCV (crypto)
 *   - /stable/historical-chart/{interval}?symbol=EURUSD  → intraday OHLCV (forex)
 *   - /stable/historical-price-eod/full?symbol=SPY       → daily EOD (stocks)
 *   - /stable/quote?symbol=SPY                           → real-time quote
 *
 * PREMIUM ONLY (blocked on free):
 *   - XAUUSD (Gold) — requires paid subscription
 *   - Any v3/historical-chart/* (legacy, fully removed)
 */

const FMP_BASE_URL = "https://financialmodelingprep.com/stable";
const DEFAULT_TIMEOUT_MS = 6000;
const MIN_VALID_CANDLES = 60;

// ─── Symbol Mapping ───────────────────────────────────────────────────────────

function mapFmpSymbol(market, asset) {
  if (market === "gold") return "XAUUSD";  // premium-only on free plan
  if (market === "forex") {
    return String(asset).replace(/[^A-Z]/gi, "").toUpperCase();
  }
  if (market === "commodities") {
    const a = String(asset).toUpperCase();
    if (a === "SILVER") return "XAGUSD";
    if (a === "OIL") return "USOIL";
    if (a === "NATURAL GAS") return "NATGAS";
  }
  if (market === "crypto") {
    const a = String(asset).toUpperCase().replace("/", "").replace("USD", "");
    return a + "USD";  // BTC → BTCUSD, ETH → ETHUSD
  }
  return String(asset).toUpperCase();
}

// ─── Interval Mapping ─────────────────────────────────────────────────────────

function mapFmpInterval(timeframe) {
  const map = {
    "5m": "5min",
    "15m": "15min",
    "1h": "1hour",
    "4h": "4hour",
    "1d": "1day",
    "1w": "1day"   // request daily bars and take last 200 for weekly context
  };
  return map[String(timeframe).toLowerCase()] || "1hour";
}

// ─── URL Builder ──────────────────────────────────────────────────────────────

function buildFmpUrl(market, symbol, timeframe, apiKey) {
  const interval = mapFmpInterval(timeframe);

  if (market === "stocks" && (timeframe === "1d" || timeframe === "1w" || interval === "1day")) {
    // EOD daily for stocks
    return `${FMP_BASE_URL}/historical-price-eod/full?symbol=${symbol}&apikey=${apiKey}`;
  }

  if (interval === "1day") {
    // Daily for anything else (weeky timeframe fallback)
    return `${FMP_BASE_URL}/historical-price-eod/full?symbol=${symbol}&apikey=${apiKey}`;
  }

  // Intraday: crypto and forex work on free tier
  return `${FMP_BASE_URL}/historical-chart/${interval}?symbol=${symbol}&apikey=${apiKey}`;
}

// ─── Candle Parser ────────────────────────────────────────────────────────────

/**
 * Parses a single FMP candle from either the intraday or EOD format.
 * Returns null (instead of throwing) if the row is malformed so callers
 * can filter-and-continue rather than aborting the entire fetch.
 */
function parseFmpCandle(c) {
  // Support both intraday ({ date, open, high, low, close, volume })
  // and EOD ({ date, open, high, low, close, volume, symbol, ... }) formats
  const dateStr = c.date || c.timestamp;
  const time = dateStr ? new Date(dateStr).toISOString() : null;
  const open = Number(c.open);
  const high = Number(c.high);
  const low = Number(c.low);
  const close = Number(c.close);
  const volume = Number(c.volume) || 0;

  if (!time || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) return null;
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0) return null;
  if (low > high) return null;

  return { time, open, high, low, close, volume };
}

// ─── Main Fetch ───────────────────────────────────────────────────────────────

async function fetchFmpCandles(market, asset, timeframe) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) throw new Error("FMP_API_KEY_MISSING");

  const symbol = mapFmpSymbol(market, asset);
  const url = buildFmpUrl(market, symbol, timeframe, apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);

    const raw = await response.json();

    // Detect premium/subscription error
    if (raw && (raw["Error Message"] || (typeof raw === "string" && raw.includes("Premium")))) {
      throw new Error("PREMIUM_ENDPOINT_REQUIRED");
    }

    // Detect legacy endpoint error
    if (raw && raw["Error Message"]) {
      throw new Error("LEGACY_ENDPOINT_REMOVED");
    }

    let rawCandles = Array.isArray(raw) ? raw : (raw.historical || []);

    // FMP intraday returns newest-first — sort to oldest-first (ascending)
    rawCandles.sort((a, b) => new Date(a.date || a.timestamp).getTime() - new Date(b.date || b.timestamp).getTime());

    // Defensive parsing: filter bad rows with a warning instead of throwing
    const skipped = [];
    const candles = rawCandles.reduce((acc, c, i) => {
      const parsed = parseFmpCandle(c);
      if (parsed) acc.push(parsed);
      else skipped.push(i);
      return acc;
    }, []);

    if (skipped.length > 0) {
      console.warn(`[fmpDataProvider] Skipped ${skipped.length} malformed candle(s) for ${symbol}`);
    }

    if (candles.length < MIN_VALID_CANDLES) throw new Error("INSUFFICIENT_CANDLES");

    const interval = mapFmpInterval(timeframe);
    return {
      candles,
      symbol,
      fmpInterval: interval,
      weeklyContext: timeframe === "1w"
    };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function getFmpMarketData(request) {
  try {
    const { candles, symbol, fmpInterval, weeklyContext } = await fetchFmpCandles(
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
        reason: "ATR-based volatility will be computed from live FMP candles."
      },
      dataStatus: {
        status: "live",
        provider: "Financial Modeling Prep",
        message: `Live OHLCV for ${symbol} @ ${fmpInterval}${weeklyContext ? " (daily bars for weekly context)" : ""}. No live news feed connected.`
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
    const reasonCode = String(error.message || "PROVIDER_UNAVAILABLE").replace(/[^A-Z0-9_]/gi, "_").toUpperCase();

    return {
      ...fallback,
      dataStatus: {
        status: "fallback-demo",
        provider: "Deterministic demo fallback",
        message: `FMP live data unavailable (${reasonCode}). Using deterministic educational demo candles — not a live signal.`
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

module.exports = { getFmpMarketData, fetchFmpCandles, mapFmpSymbol, mapFmpInterval, parseFmpCandle };
