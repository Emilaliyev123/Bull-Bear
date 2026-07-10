const { determineSignalStatus, scoreConfluence } = require("./scoring");
const { assessRiskLevel, highRiskWarning } = require("./risk");
const { round } = require("./mockDataProvider");

const EDUCATIONAL_DISCLAIMER = "Educational market analysis only, not financial advice. No result guarantees profit, and Analyzer V2 never places or routes trades.";

// Maps internal bias direction to market structure label for safe comparisons
const DIRECTION_TO_STRUCTURE = { long: "bullish", short: "bearish" };

const STOP_MULTIPLIERS = {
  scalping: 0.9,
  dayTrading: 1.2,
  swingTrading: 1.8,
  longTermInvestment: 2.4,
  marketSummary: 1.5,
  sectorAnalysis: 1.5
};

// ─── Utility ─────────────────────────────────────────────────────────────────

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Spike / bad-print filter.
 * Drops any candle whose high-low range exceeds 5x the median range of
 * all candles. Prevents a single erroneous tick from corrupting ATR,
 * support/resistance, and VWAP calculations.
 */
function spikeFilter(candles) {
  if (candles.length < 5) return candles;
  const ranges = candles.map((c) => c.high - c.low);
  const sorted = [...ranges].sort((a, b) => a - b);
  const medianRange = sorted[Math.floor(sorted.length / 2)];
  const threshold = medianRange * 5;
  return candles.filter((c) => (c.high - c.low) <= threshold);
}

// ─── Indicators ───────────────────────────────────────────────────────────────

/**
 * Exponential Moving Average — properly seeded from SMA.
 * Seeds the EMA from the SMA of the first `period` bars, then applies
 * the multiplier iteratively over the rest. Requires at least `period` values.
 * @param {number[]} values  Oldest-to-newest close prices
 * @param {number}   period  EMA period (e.g., 20 or 50)
 */
function ema(values, period) {
  if (values.length < period) return average(values);
  const multiplier = 2 / (period + 1);
  // Seed: SMA of the first `period` bars
  let current = average(values.slice(0, period));
  // Apply EMA smoothing over the remaining bars
  for (let i = period; i < values.length; i++) {
    current = (values[i] - current) * multiplier + current;
  }
  return current;
}

/**
 * RSI using Wilder's smoothing (industry-standard method).
 * 1. Seed: SMA of the first `period` gains and losses.
 * 2. Smooth: avgGain = (prevAvgGain * (period-1) + currentGain) / period
 * Matches TradingView, MT4, and Bloomberg RSI values.
 */
function rsi(values, period = 14) {
  if (values.length <= period) return 50;
  // Seed from the first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;
  // Wilder's smoothing over remaining bars
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (!avgLoss) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Average True Range — corrected previous-candle lookup.
 * Takes `period + 1` candles so every bar in the sample has a prior candle.
 * Previous candle is sample[i-1], not a computed global offset.
 */
function atr(candles, period = 14) {
  if (candles.length < period + 1) {
    return average(candles.slice(-period).map((c) => c.high - c.low));
  }
  const sample = candles.slice(-(period + 1));
  const trValues = [];
  for (let i = 1; i < sample.length; i++) {
    const c = sample[i];
    const prev = sample[i - 1];
    trValues.push(Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    ));
  }
  return average(trValues);
}

/**
 * Volume-Weighted Average Price over the last 30 candles.
 * Falls back to last close if total volume is zero (e.g., Forex tick-volume).
 */
function vwap(candles) {
  const totals = candles.slice(-30).reduce((result, candle) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    result.value += typicalPrice * candle.volume;
    result.volume += candle.volume;
    return result;
  }, { value: 0, volume: 0 });
  return totals.volume ? totals.value / totals.volume : candles.at(-1)?.close || 0;
}

/**
 * Bollinger Bands (20-period, configurable stddev multiplier).
 */
function bollingerBands(closes, period = 20, multiplier = 2) {
  if (closes.length < period) {
    const mid = average(closes);
    return { upper: mid, middle: mid, lower: mid };
  }
  const recent = closes.slice(-period);
  const middle = average(recent);
  const variance = recent.reduce((sum, v) => sum + (v - middle) ** 2, 0) / period;
  const stddev = Math.sqrt(variance);
  return {
    upper: middle + multiplier * stddev,
    middle,
    lower: middle - multiplier * stddev
  };
}

/**
 * MACD (12, 26, 9) — returns { macdLine, signalLine, histogram }.
 * Requires at least 35 closes for a meaningful result.
 */
function macd(closes) {
  if (closes.length < 35) {
    return { macdLine: 0, signalLine: 0, histogram: 0 };
  }
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12 - ema26;
  // Build a series of macd values to compute the signal EMA-9
  const macdSeries = [];
  const startIndex = Math.max(26, closes.length - 60);
  for (let i = startIndex; i < closes.length; i++) {
    const slice = closes.slice(0, i + 1);
    if (slice.length < 26) continue;
    macdSeries.push(ema(slice, 12) - ema(slice, 26));
  }
  const signalLine = macdSeries.length >= 9 ? ema(macdSeries, 9) : macdLine;
  return {
    macdLine: round(macdLine, 6),
    signalLine: round(signalLine, 6),
    histogram: round(macdLine - signalLine, 6)
  };
}

// ─── Price Formatting ─────────────────────────────────────────────────────────

/**
 * Decimal precision by price level:
 * - >= 100: 2dp (equities, gold, JPY cross at ~150-200 treated as 2dp)
 * - >= 10: 3dp (JPY pairs like USD/JPY at 144, EUR/JPY at 169)
 * - >= 0.1: 5dp (standard FX pairs: EUR/USD, GBP/USD, NZD/USD, AUD/USD)
 * - >= 0.01: 5dp (standard FX pairs, sub-dollar crypto (DOGE 0.07, ADA 0.14))
 * - < 0.01: 6dp (True micro-prices only (Shiba Inu, etc.))
 */
function pricePrecision(price) {
  const abs = Math.abs(price);
  if (abs >= 100) return 2;
  if (abs >= 10) return 3;
  if (abs >= 0.01) return 5;
  return 6;
}

function formatPrice(value) {
  return round(value, pricePrecision(Math.abs(value)));
}

// ─── Market Structure ─────────────────────────────────────────────────────────

function marketStructure(candles) {
  const recent = candles.slice(-24);
  if (recent.length < 24) return "range";
  const first = recent.slice(0, 12);
  const second = recent.slice(12);
  const firstHigh = Math.max(...first.map((c) => c.high));
  const firstLow = Math.min(...first.map((c) => c.low));
  const secondHigh = Math.max(...second.map((c) => c.high));
  const secondLow = Math.min(...second.map((c) => c.low));
  if (secondHigh > firstHigh && secondLow > firstLow) return "bullish";
  if (secondHigh < firstHigh && secondLow < firstLow) return "bearish";
  return "range";
}

function liquidityState(candles) {
  if (candles.length < 19) return "no confirmed liquidity sweep";
  const latest = candles.at(-1);
  const prior = candles.slice(-18, -1);
  const priorHigh = Math.max(...prior.map((c) => c.high));
  const priorLow = Math.min(...prior.map((c) => c.low));
  if (latest.high > priorHigh && latest.close < priorHigh) return "bearish sweep above prior liquidity";
  if (latest.low < priorLow && latest.close > priorLow) return "bullish sweep below prior liquidity";
  return "no confirmed liquidity sweep";
}

// ─── Technical Snapshot ───────────────────────────────────────────────────────

function buildTechnicalSnapshot(data) {
  // 1. Sanitize: drop bad-print / spike candles before any calculation
  const candles = spikeFilter(data.candles);
  if (candles.length < 26) {
    const latest = data.candles.at(-1);
    return {
      price: latest.close, atr: 0, atrPercent: 0,
      fastEma: latest.close, slowEma: latest.close, rsi: 50,
      vwap: latest.close, support: latest.low, resistance: latest.high,
      relativeVolume: 1, structure: "range", liquidity: "no confirmed liquidity sweep",
      direction: "long", biasScore: 0,
      bollingerBands: { upper: latest.close, middle: latest.close, lower: latest.close },
      macd: { macdLine: 0, signalLine: 0, histogram: 0 }
    };
  }

  const closes = candles.map((c) => c.close);
  const latest = candles.at(-1);

  // 2. ATR — corrected
  const currentAtr = atr(candles);

  // 3. EMAs — each receives period + adequate buffer for proper SMA seeding
  //    EMA-20: last 60 candles (3x buffer)
  //    EMA-50: last 100 candles (2x buffer)
  const fastEma = ema(closes.slice(-Math.min(60, closes.length)), 20);
  const slowEma = ema(closes.slice(-Math.min(100, closes.length)), 50);

  // 4. RSI — Wilder's smoothing on all available closes
  const currentRsi = rsi(closes);

  // 5. VWAP
  const currentVwap = vwap(candles);

  // 6. Support / Resistance
  const recent = candles.slice(-30);
  const support = Math.min(...recent.map((c) => c.low));
  const resistance = Math.max(...recent.map((c) => c.high));

  // 7. Relative Volume
  const baselineVolume = average(candles.slice(-40, -5).map((c) => c.volume));
  const recentVolume = average(candles.slice(-5).map((c) => c.volume));
  const relativeVolume = baselineVolume ? recentVolume / baselineVolume : 1;

  // 8. Market Structure & Liquidity
  const structure = marketStructure(candles);
  const liquidity = liquidityState(candles);

  // 9. Bollinger Bands (20, 2)
  const bb = bollingerBands(closes);

  // 10. MACD (12, 26, 9)
  const currentMacd = macd(closes);

  // 11. Bias scoring — 5 independent signals
  const biasSignals = [
    latest.close >= fastEma ? 1 : -1,
    fastEma >= slowEma ? 1 : -1,
    latest.close >= currentVwap ? 1 : -1,
    currentRsi >= 50 ? 1 : -1,
    structure === "bullish" ? 1 : structure === "bearish" ? -1 : 0
  ];
  const biasScore = biasSignals.reduce((sum, v) => sum + v, 0);

  return {
    price: latest.close,
    atr: currentAtr,
    atrPercent: latest.close ? (currentAtr / latest.close) * 100 : 0,
    fastEma,
    slowEma,
    rsi: currentRsi,
    vwap: currentVwap,
    support,
    resistance,
    relativeVolume,
    structure,
    liquidity,
    direction: biasScore < 0 ? "short" : "long",
    biasScore,
    bollingerBands: { upper: bb.upper, middle: bb.middle, lower: bb.lower },
    macd: currentMacd
  };
}

// ─── R:R & Components ─────────────────────────────────────────────────────────

function riskRewardScore(riskReward) {
  if (riskReward >= 3) return 10;
  if (riskReward >= 2.5) return 8;
  if (riskReward >= 2) return 6;
  return 2;
}

function buildComponents(data, snapshot, riskReward, marketSpecific) {
  const sourceLabel = data.dataStatus?.status === "live" ? "live" : "demo";
  const trendDistance = snapshot.atr ? Math.abs(snapshot.fastEma - snapshot.slowEma) / snapshot.atr : 0;
  const trendAligned = snapshot.direction === "long"
    ? snapshot.fastEma >= snapshot.slowEma
    : snapshot.fastEma < snapshot.slowEma;
  const momentumAligned = snapshot.direction === "long" ? snapshot.rsi >= 50 : snapshot.rsi < 50;
  // Safe structure comparison via constant map (fixes fragile string replacement)
  const expectedStructure = DIRECTION_TO_STRUCTURE[snapshot.direction];
  const structureAligned = snapshot.structure === expectedStructure;
  const liquidityAligned = snapshot.direction === "long"
    ? snapshot.liquidity.startsWith("bullish")
    : snapshot.liquidity.startsWith("bearish");
  const nearestLevelDistance = Math.min(
    Math.abs(snapshot.price - snapshot.support),
    Math.abs(snapshot.resistance - snapshot.price)
  );

  return {
    trend: {
      score: clamp(5 + (trendAligned ? 2 : -2) + trendDistance, 0, 10),
      detail: `EMA20 ${snapshot.fastEma >= snapshot.slowEma ? "above" : "below"} EMA50`
    },
    marketStructure: {
      score: structureAligned ? 9 : snapshot.structure === "range" ? 4 : 2,
      detail: `${snapshot.structure} ${sourceLabel} market structure`
    },
    supportResistance: {
      score: nearestLevelDistance <= snapshot.atr * 2.5 ? 8 : 5,
      detail: `Support ${formatPrice(snapshot.support)} / resistance ${formatPrice(snapshot.resistance)}`
    },
    liquidity: {
      score: liquidityAligned ? 9 : snapshot.liquidity.startsWith("no") ? 5 : 3,
      detail: snapshot.liquidity
    },
    momentum: {
      score: momentumAligned ? clamp(7 + Math.abs(snapshot.rsi - 50) / 10, 0, 10) : 3,
      detail: `RSI(14) ${round(snapshot.rsi, 1)} with ${snapshot.direction} model bias`
    },
    volume: {
      score: snapshot.relativeVolume >= 1.25 ? 9 : snapshot.relativeVolume >= 0.9 ? 6 : 3,
      detail: `Relative ${sourceLabel} volume ${round(snapshot.relativeVolume, 2)}x`
    },
    volatility: {
      score: data.volatilityRisk.level === "extreme" ? 0 : data.volatilityRisk.level === "elevated" ? 4 : 8,
      detail: data.volatilityRisk.reason
    },
    newsRisk: {
      score: data.newsRisk.level === "extreme" ? 0
        : data.newsRisk.level === "high" ? 4
          : data.newsRisk.level === "medium" ? 6
            : data.newsRisk.level === "unknown" ? 5 : 9,
      detail: data.newsRisk.explanation || data.newsRisk.event || "No immediate news risk"
    },
    riskReward: {
      score: riskRewardScore(riskReward),
      detail: `Projected ${sourceLabel} risk/reward ${round(riskReward, 2)}`
    },
    marketSpecific: {
      score: marketSpecific.score,
      detail: marketSpecific.detail
    }
  };
}

// ─── Trade Levels ─────────────────────────────────────────────────────────────

function buildTradeLevels(snapshot, mode, direction, riskReward) {
  const stopDistance = Math.max(
    snapshot.atr * (STOP_MULTIPLIERS[mode] || 1.2),
    snapshot.price * 0.001
  );
  const zoneWidth = Math.max(snapshot.atr * 0.18, snapshot.price * 0.0002);
  const sign = direction === "long" ? 1 : -1;
  const entry = snapshot.price;
  const stop = entry - sign * stopDistance;
  // TP progression is always monotonically increasing from entry
  // TP1: 2R minimum, TP2: max(riskReward, 2.5)R, TP3: TP2 + 1R
  const tp2Multiple = Math.max(riskReward, 2.5);
  const tp3Multiple = tp2Multiple + 1;
  return {
    entryZone: {
      low: formatPrice(entry - zoneWidth),
      high: formatPrice(entry + zoneWidth)
    },
    stopLoss: formatPrice(stop),
    takeProfits: [
      { level: "TP1", price: formatPrice(entry + sign * stopDistance * 2), riskMultiple: 2 },
      { level: "TP2", price: formatPrice(entry + sign * stopDistance * tp2Multiple), riskMultiple: round(tp2Multiple, 2) },
      { level: "TP3", price: formatPrice(entry + sign * stopDistance * tp3Multiple), riskMultiple: round(tp3Multiple, 2) }
    ],
    invalidationRule: `Invalid if price closes ${direction === "long" ? "below" : "above"} ${formatPrice(stop)} with confirming momentum.`
  };
}

function calculateLevelRiskReward(snapshot, mode) {
  const stopDistance = Math.max(
    snapshot.atr * (STOP_MULTIPLIERS[mode] || 1.2),
    snapshot.price * 0.001
  );
  const targetDistance = snapshot.direction === "long"
    ? Math.max(0, snapshot.resistance - snapshot.price)
    : Math.max(0, snapshot.price - snapshot.support);
  return round(Math.min(5, targetDistance / (stopDistance || 1)), 2);
}

// ─── Main Analysis Builder ────────────────────────────────────────────────────

function createTechnicalAnalysis({ request, data, marketSpecific, strategies, notes = [], riskReward }) {
  const snapshot = buildTechnicalSnapshot(data);
  const resolvedRiskReward = Number.isFinite(riskReward)
    ? round(riskReward, 2)
    : round(1.6 + (data.seed % 20) / 10, 2);
  const confluence = scoreConfluence(buildComponents(data, snapshot, resolvedRiskReward, marketSpecific));

  if (data.newsRisk && data.newsRisk.scoreImpact) {
    confluence.total = Math.max(0, confluence.total + data.newsRisk.scoreImpact);
  }

  const riskLevel = assessRiskLevel({
    confidenceScore: confluence.total,
    newsRisk: data.newsRisk.level,
    volatilityRisk: data.volatilityRisk.level,
    mode: request.mode
  });
  const signal = determineSignalStatus({
    score: confluence.total,
    direction: snapshot.direction,
    riskReward: resolvedRiskReward,
    extremeRisk: riskLevel === "extreme"
  });
  const activeSetup = ["long", "short", "strongBuy", "strongSell"].includes(signal.signalStatus);
  const levels = buildTradeLevels(snapshot, request.mode, snapshot.direction, resolvedRiskReward);
  const warning = highRiskWarning(riskLevel, confluence.total);
  const isDemo = data.dataStatus?.status !== "live";
  const analysisLabel = isDemo ? "demo" : "live-data";

  return {
    market: request.market,
    asset: request.asset,
    mode: request.mode,
    timeframe: request.timeframe,
    signalStatus: signal.signalStatus,
    signalStrength: signal.signalStrength,
    confidenceScore: confluence.total,
    riskLevel,
    marketBias: snapshot.direction === "long" ? "bullish" : "bearish",
    entryZone: activeSetup ? levels.entryZone : null,
    stopLoss: activeSetup ? levels.stopLoss : null,
    takeProfits: activeSetup ? levels.takeProfits : [],
    riskReward: resolvedRiskReward,
    strategyBreakdown: {
      setupQuality: confluence.quality,
      components: confluence.components,
      strategies,
      technicalSnapshot: {
        ema20: formatPrice(snapshot.fastEma),
        ema50: formatPrice(snapshot.slowEma),
        vwap: formatPrice(snapshot.vwap),
        rsi: round(snapshot.rsi, 1),
        atr: formatPrice(snapshot.atr),
        bollingerBands: {
          upper: formatPrice(snapshot.bollingerBands.upper),
          middle: formatPrice(snapshot.bollingerBands.middle),
          lower: formatPrice(snapshot.bollingerBands.lower)
        },
        macd: snapshot.macd,
        support: formatPrice(snapshot.support),
        resistance: formatPrice(snapshot.resistance),
        relativeVolume: round(snapshot.relativeVolume, 2),
        marketStructure: snapshot.structure,
        liquidity: snapshot.liquidity
      },
      notes
    },
    explanation: `${confluence.quality} ${analysisLabel} confluence (${confluence.total}/100) with a ${snapshot.direction} model bias. ${EDUCATIONAL_DISCLAIMER}`,
    invalidationRule: activeSetup
      ? levels.invalidationRule
      : "No active setup. Re-run analysis only after price confirms a new structure break or rejection at a key level.",
    noSignalReason: signal.reason,
    highRiskWarning: warning,
    dataStatus: data.dataStatus,
    dataSource: data.dataSource || data.dataStatus?.provider || "Unknown market data source",
    isDemo,
    lastUpdated: data.lastUpdated || new Date().toISOString(),
    metadata: {
      educationalDisclaimer: EDUCATIONAL_DISCLAIMER,
      executionEnabled: false,
      orderPlacementSupported: false,
      modelVersion: "market-hub-analyzer-v2",
      marketData: data.liveDataStatus || { attempted: false, available: false, fallbackUsed: false },
      newsRiskMetrics: data.newsRisk
    }
  };
}

module.exports = {
  DIRECTION_TO_STRUCTURE,
  EDUCATIONAL_DISCLAIMER,
  atr,
  bollingerBands,
  buildTechnicalSnapshot,
  calculateLevelRiskReward,
  createTechnicalAnalysis,
  ema,
  formatPrice,
  macd,
  pricePrecision,
  rsi,
  spikeFilter
};
