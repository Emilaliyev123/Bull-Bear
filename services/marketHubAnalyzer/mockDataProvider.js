const TIMEFRAME_MINUTES = {
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
  "1w": 10080
};

const BASE_PRICES = {
  BTC: 59520,
  ETH: 1561.9,
  XRP: 1.033,
  SOL: 66.34,
  BNB: 555.98,
  DOGE: 0.073788,
  ADA: 0.141842,
  AVAX: 6.15,
  LINK: 7.2,
  TON: 1.56,
  "EUR/USD": 1.169,
  "GBP/USD": 1.372,
  "USD/JPY": 144.6,
  "USD/CHF": 0.793,
  "AUD/USD": 0.653,
  "USD/CAD": 1.366,
  "NZD/USD": 0.604,
  "EUR/JPY": 169,
  "GBP/JPY": 198.3,
  "XAU/USD": 4026.92,
  SILVER: 47.8,
  OIL: 68.1,
  "NATURAL GAS": 3.43,
  SPY: 612,
  QQQ: 548,
  DIA: 438,
  AAPL: 214,
  MSFT: 486,
  NVDA: 158,
  AMZN: 224,
  META: 689,
  TSLA: 364
};

const MARKET_VOLATILITY = {
  crypto: 1.8,
  forex: 0.45,
  gold: 0.9,
  stocks: 1.05,
  commodities: 1.2
};

const TIMEFRAME_VOLATILITY = {
  "5m": 0.0015,
  "15m": 0.0022,
  "1h": 0.0035,
  "4h": 0.006,
  "1d": 0.012,
  "1w": 0.025
};

function hashSeed(parts) {
  const value = parts.join("|");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value, decimals = 4) {
  const power = 10 ** decimals;
  return Math.round(value * power) / power;
}

function basePrice(asset) {
  return BASE_PRICES[asset] || 100;
}

function simulatedNewsRisk(market, seed) {
  const event = seed % 23;
  if (market === "gold" && event <= 2) return { level: "extreme", event: "Simulated CPI/FOMC/NFP risk window" };
  if (market === "forex" && event === 0) return { level: "extreme", event: "Simulated central-bank or tier-one data window" };
  if (market === "commodities" && event <= 1) return { level: "extreme", event: "Simulated inventory or supply-shock window" };
  if (event <= 6) return { level: "elevated", event: "Simulated scheduled-news risk" };
  return { level: "normal", event: "No simulated major event in the current demo window" };
}

function getMockMarketData({ market, asset, mode, timeframe }) {
  const seed = hashSeed([market, asset, mode, timeframe]);
  const random = seededRandom(seed);
  const intervalMinutes = TIMEFRAME_MINUTES[timeframe];
  const volatility = TIMEFRAME_VOLATILITY[timeframe] * MARKET_VOLATILITY[market];
  const anchor = basePrice(asset);
  const driftDirection = (seed % 3) - 1;
  const drift = driftDirection * volatility * (0.035 + random() * 0.025);
  const candles = [];
  let previousClose = anchor * (1 - drift * 60);
  const endTime = Date.now();

  for (let index = 0; index < 120; index += 1) {
    const open = previousClose;
    const cycle = Math.sin((index + (seed % 17)) / 8) * volatility * 0.12;
    const noise = (random() - 0.5) * volatility * 1.35;
    const eventShock = index === 103 && seed % 11 === 0 ? (random() - 0.5) * volatility * 3.2 : 0;
    const close = Math.max(open * (1 + drift + cycle + noise + eventShock), anchor * 0.01);
    const wick = volatility * (0.15 + random() * 0.45);
    const high = Math.max(open, close) * (1 + wick);
    const low = Math.min(open, close) * (1 - wick);
    const volumePulse = index > 112 ? 1 + (seed % 5) * 0.12 : 1;
    const volume = (800000 + random() * 1200000) * volumePulse * (market === "forex" ? 2.5 : 1);
    candles.push({
      timestamp: new Date(endTime - (119 - index) * intervalMinutes * 60 * 1000).toISOString(),
      open: round(open, 8),
      high: round(high, 8),
      low: round(low, 8),
      close: round(close, 8),
      volume: round(volume, 2)
    });
    previousClose = close;
  }

  const newsRisk = simulatedNewsRisk(market, seed);
  const volatilityRisk = seed % 29 === 0
    ? { level: "extreme", reason: "Simulated abnormal volatility expansion" }
    : seed % 7 === 0
      ? { level: "elevated", reason: "Simulated above-normal volatility" }
      : { level: "normal", reason: "Simulated volatility is within its expected range" };

  return {
    market,
    asset,
    mode,
    timeframe,
    candles,
    seed,
    newsRisk,
    volatilityRisk,
    session: ["Asian", "London", "New York"][seed % 3],
    dxyBias: ["bullish", "neutral", "bearish"][Math.floor(seed / 3) % 3],
    btcTrend: ["bullish", "neutral", "bearish"][Math.floor(seed / 7) % 3],
    inventoryRisk: ["normal", "elevated", "unknown"][Math.floor(seed / 11) % 3],
    seasonality: ["supportive", "mixed", "unfavorable"][Math.floor(seed / 13) % 3],
    fundamentals: {
      quality: 45 + (seed % 51),
      value: 35 + (Math.floor(seed / 5) % 61),
      growth: 40 + (Math.floor(seed / 9) % 56),
      dividend: 25 + (Math.floor(seed / 17) % 66)
    },
    dataStatus: {
      status: "demo",
      provider: "deterministicMockOHLCV",
      message: "Server-generated educational demo data. No live market feed is connected to Analyzer V2."
    }
  };
}

module.exports = {
  getMockMarketData,
  hashSeed,
  round
};
