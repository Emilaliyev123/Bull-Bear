const { analyzeCommodity } = require("./commodityAnalyzer");
const { analyzeCrypto } = require("./cryptoAnalyzer");
const { analyzeForex } = require("./forexAnalyzer");
const { analyzeGold } = require("./goldAnalyzer");
const { getMockMarketData } = require("./mockDataProvider");
const { analyzeStocks } = require("./stockAnalyzer");
const { getCryptoMarketData } = require("./cryptoDataProvider");

const ALLOWED_MARKETS = new Set(["crypto", "forex", "gold", "stocks", "commodities"]);
const ALLOWED_MODES = new Set([
  "scalping",
  "dayTrading",
  "swingTrading",
  "longTermInvestment",
  "marketSummary",
  "sectorAnalysis"
]);
const ALLOWED_TIMEFRAMES = new Set(["5m", "15m", "1h", "4h", "1d", "1w"]);
const CRYPTO_ASSETS = new Set(["BTC", "ETH", "XRP", "SOL", "BNB", "DOGE", "ADA", "AVAX", "LINK", "TON"]);
const FOREX_ASSETS = new Set(["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD", "EUR/JPY", "GBP/JPY"]);

const MODE_ALIASES = {
  scalping: "scalping",
  daytrading: "dayTrading",
  swingtrading: "swingTrading",
  longterminvestment: "longTermInvestment",
  marketsummary: "marketSummary",
  sectoranalysis: "sectorAnalysis"
};

const DEFAULT_ASSETS = {
  crypto: "BTC",
  forex: "EUR/USD",
  gold: "XAU/USD",
  stocks: "SPY",
  commodities: "OIL"
};

class AnalyzerValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "AnalyzerValidationError";
    this.statusCode = 400;
    this.details = details;
  }
}

function requiredString(payload, key) {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new AnalyzerValidationError(`${key} is required`, { field: key });
  }
  return value.trim();
}

function normalizedKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");
}

function normalizeMarket(value) {
  const market = String(value || "").trim().toLowerCase();
  if (!ALLOWED_MARKETS.has(market)) {
    throw new AnalyzerValidationError("Unsupported market", {
      field: "market",
      allowed: Array.from(ALLOWED_MARKETS)
    });
  }
  return market;
}

function normalizeMode(value) {
  const mode = MODE_ALIASES[normalizedKey(value)];
  if (!mode || !ALLOWED_MODES.has(mode)) {
    throw new AnalyzerValidationError("Unsupported mode", {
      field: "mode",
      allowed: Array.from(ALLOWED_MODES)
    });
  }
  return mode;
}

function normalizeTimeframe(value) {
  const timeframe = String(value || "").trim().toLowerCase();
  if (!ALLOWED_TIMEFRAMES.has(timeframe)) {
    throw new AnalyzerValidationError("Unsupported timeframe", {
      field: "timeframe",
      allowed: Array.from(ALLOWED_TIMEFRAMES)
    });
  }
  return timeframe;
}

function normalizeAsset(market, value) {
  const raw = String(value || DEFAULT_ASSETS[market]).trim().toUpperCase();
  if (!raw || raw.length > 24 || !/^[A-Z0-9./ -]+$/.test(raw)) {
    throw new AnalyzerValidationError("Invalid asset", { field: "asset" });
  }
  if (market === "crypto") {
    const symbol = raw.replace(/[/ -]?(USD|USDT)$/, "");
    if (!CRYPTO_ASSETS.has(symbol)) {
      throw new AnalyzerValidationError("Unsupported crypto asset", { field: "asset", allowed: Array.from(CRYPTO_ASSETS) });
    }
    return symbol;
  }
  if (market === "forex") {
    const compact = raw.replace(/[^A-Z]/g, "");
    const pair = compact.length === 6 ? `${compact.slice(0, 3)}/${compact.slice(3)}` : raw;
    if (!FOREX_ASSETS.has(pair)) {
      throw new AnalyzerValidationError("Unsupported forex pair", { field: "asset", allowed: Array.from(FOREX_ASSETS) });
    }
    return pair;
  }
  if (market === "gold") {
    if (!["GOLD", "XAUUSD", "XAU/USD"].includes(raw.replace(/\s/g, ""))) {
      throw new AnalyzerValidationError("Gold market supports XAU/USD", { field: "asset", allowed: ["XAU/USD"] });
    }
    return "XAU/USD";
  }
  if (market === "commodities") {
    const key = raw.replace(/[^A-Z]/g, "");
    const aliases = {
      SILVER: "SILVER",
      XAGUSD: "SILVER",
      OIL: "OIL",
      WTI: "OIL",
      CRUDEOIL: "OIL",
      NATURALGAS: "NATURAL GAS",
      NG: "NATURAL GAS"
    };
    if (!aliases[key]) {
      throw new AnalyzerValidationError("Unsupported commodity", { field: "asset", allowed: ["SILVER", "OIL", "NATURAL GAS"] });
    }
    return aliases[key];
  }
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(raw)) {
    throw new AnalyzerValidationError("Invalid stock symbol", { field: "asset" });
  }
  return raw;
}

function validateAnalysisRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AnalyzerValidationError("Request body must be a JSON object");
  }
  const market = normalizeMarket(requiredString(payload, "market"));
  const mode = normalizeMode(requiredString(payload, "mode"));
  const timeframe = normalizeTimeframe(requiredString(payload, "timeframe"));
  const asset = normalizeAsset(market, payload.asset);
  return { market, asset, mode, timeframe };
}

function analyzeMarketHub(payload) {
  const request = validateAnalysisRequest(payload);
  const data = getMockMarketData(request);
  const analyzers = {
    crypto: analyzeCrypto,
    forex: analyzeForex,
    gold: analyzeGold,
    stocks: analyzeStocks,
    commodities: analyzeCommodity
  };
  return analyzers[request.market](request, data);
}

async function analyzeMarketHubWithLiveData(payload, options = {}) {
  const request = validateAnalysisRequest(payload);
  const data = request.market === "crypto"
    ? await getCryptoMarketData(request, options.crypto || {})
    : getMockMarketData(request);
  const analyzers = {
    crypto: analyzeCrypto,
    forex: analyzeForex,
    gold: analyzeGold,
    stocks: analyzeStocks,
    commodities: analyzeCommodity
  };
  return analyzers[request.market](request, data);
}

module.exports = {
  ALLOWED_MARKETS,
  ALLOWED_MODES,
  ALLOWED_TIMEFRAMES,
  AnalyzerValidationError,
  analyzeMarketHub,
  analyzeMarketHubWithLiveData,
  validateAnalysisRequest
};
