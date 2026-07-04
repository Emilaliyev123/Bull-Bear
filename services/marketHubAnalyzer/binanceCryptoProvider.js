const BINANCE_PUBLIC_BASE_URL = "https://api.binance.com";
const BINANCE_KLINES_PATH = "/api/v3/klines";
const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_CANDLE_LIMIT = 120;

const BINANCE_INTERVALS = Object.freeze({
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "1w": "1w"
});

const BINANCE_SYMBOLS = Object.freeze({
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  XRP: "XRPUSDT",
  SOL: "SOLUSDT",
  BNB: "BNBUSDT",
  DOGE: "DOGEUSDT",
  ADA: "ADAUSDT",
  AVAX: "AVAXUSDT",
  LINK: "LINKUSDT",
  TON: "TONUSDT"
});

class BinanceCryptoProviderError extends Error {
  constructor(message, code = "BINANCE_PROVIDER_ERROR") {
    super(message);
    this.name = "BinanceCryptoProviderError";
    this.code = code;
  }
}

function mapTimeframeToBinanceInterval(timeframe) {
  const interval = BINANCE_INTERVALS[String(timeframe || "").toLowerCase()];
  if (!interval) {
    throw new BinanceCryptoProviderError("Unsupported Binance candle timeframe", "UNSUPPORTED_TIMEFRAME");
  }
  return interval;
}

function toBinanceSymbol(asset) {
  const normalized = String(asset || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/USDT$/, "");
  const symbol = BINANCE_SYMBOLS[normalized];
  if (!symbol) {
    throw new BinanceCryptoProviderError("Unsupported Binance crypto symbol", "UNSUPPORTED_SYMBOL");
  }
  return symbol;
}

function normalizedNumber(value, label, index) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new BinanceCryptoProviderError(`Invalid ${label} in Binance candle ${index}`, "INVALID_RESPONSE");
  }
  return number;
}

function normalizeBinanceKline(row, index) {
  if (!Array.isArray(row) || row.length < 6) {
    throw new BinanceCryptoProviderError(`Malformed Binance candle ${index}`, "INVALID_RESPONSE");
  }
  const openTime = normalizedNumber(row[0], "time", index);
  const open = normalizedNumber(row[1], "open", index);
  const high = normalizedNumber(row[2], "high", index);
  const low = normalizedNumber(row[3], "low", index);
  const close = normalizedNumber(row[4], "close", index);
  const volume = normalizedNumber(row[5], "volume", index);
  if (openTime <= 0 || open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) {
    throw new BinanceCryptoProviderError(`Out-of-range Binance candle ${index}`, "INVALID_RESPONSE");
  }
  if (low > high || open < low || open > high || close < low || close > high) {
    throw new BinanceCryptoProviderError(`Inconsistent Binance candle ${index}`, "INVALID_RESPONSE");
  }
  return {
    time: new Date(openTime).toISOString(),
    open,
    high,
    low,
    close,
    volume
  };
}

function validateNormalizedCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 60) {
    throw new BinanceCryptoProviderError("Binance returned too few candles for EMA50 analysis", "INVALID_RESPONSE");
  }
  return candles.map((candle, index) => {
    if (!candle || typeof candle !== "object") {
      throw new BinanceCryptoProviderError(`Malformed normalized candle ${index}`, "INVALID_RESPONSE");
    }
    const time = new Date(candle.time).getTime();
    const open = normalizedNumber(candle.open, "open", index);
    const high = normalizedNumber(candle.high, "high", index);
    const low = normalizedNumber(candle.low, "low", index);
    const close = normalizedNumber(candle.close, "close", index);
    const volume = normalizedNumber(candle.volume, "volume", index);
    if (!Number.isFinite(time) || time <= 0 || open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) {
      throw new BinanceCryptoProviderError(`Out-of-range normalized candle ${index}`, "INVALID_RESPONSE");
    }
    if (low > high || open < low || open > high || close < low || close > high) {
      throw new BinanceCryptoProviderError(`Inconsistent normalized candle ${index}`, "INVALID_RESPONSE");
    }
    return { time: new Date(time).toISOString(), open, high, low, close, volume };
  });
}

async function fetchBinanceCryptoCandles(request, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new BinanceCryptoProviderError("Fetch is unavailable in this server runtime", "FETCH_UNAVAILABLE");
  }
  const symbol = toBinanceSymbol(request.asset);
  const interval = mapTimeframeToBinanceInterval(request.timeframe);
  const requestedLimit = Number(options.limit || DEFAULT_CANDLE_LIMIT);
  const limit = Math.max(60, Math.min(500, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : DEFAULT_CANDLE_LIMIT));
  const timeoutMs = Math.max(1000, Math.min(5000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS)));
  const url = new URL(BINANCE_KLINES_PATH, BINANCE_PUBLIC_BASE_URL);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(limit));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response || !response.ok) {
      throw new BinanceCryptoProviderError(`Binance public data request failed with status ${response?.status || "unknown"}`, "HTTP_ERROR");
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new BinanceCryptoProviderError("Binance returned an unexpected response", "INVALID_RESPONSE");
    }
    const candles = validateNormalizedCandles(payload.map(normalizeBinanceKline));
    return {
      symbol,
      interval,
      candles,
      dataSource: "Binance public market data",
      lastUpdated: candles.at(-1).time
    };
  } catch (error) {
    if (error instanceof BinanceCryptoProviderError) throw error;
    if (error?.name === "AbortError") {
      throw new BinanceCryptoProviderError("Binance public data request timed out", "TIMEOUT");
    }
    throw new BinanceCryptoProviderError("Binance public data is unavailable", "NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  BINANCE_INTERVALS,
  BINANCE_KLINES_PATH,
  BINANCE_PUBLIC_BASE_URL,
  BINANCE_SYMBOLS,
  BinanceCryptoProviderError,
  fetchBinanceCryptoCandles,
  mapTimeframeToBinanceInterval,
  normalizeBinanceKline,
  toBinanceSymbol,
  validateNormalizedCandles
};
