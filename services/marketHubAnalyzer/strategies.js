const { determineSignalStatus, scoreConfluence } = require("./scoring");
const { assessRiskLevel, highRiskWarning } = require("./risk");
const { round } = require("./mockDataProvider");

const EDUCATIONAL_DISCLAIMER = "Educational market analysis only, not financial advice. No result guarantees profit, and Analyzer V2 never places or routes trades.";

const STOP_MULTIPLIERS = {
  scalping: 0.9,
  dayTrading: 1.2,
  swingTrading: 1.8,
  longTermInvestment: 2.4,
  marketSummary: 1.5,
  sectorAnalysis: 1.5
};

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function ema(values, period) {
  if (!values.length) return 0;
  const multiplier = 2 / (period + 1);
  return values.slice(1).reduce((current, value) => ((value - current) * multiplier) + current, values[0]);
}

function rsi(values, period = 14) {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  const sample = values.slice(-(period + 1));
  for (let index = 1; index < sample.length; index += 1) {
    const change = sample[index] - sample[index - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }
  if (!losses) return 70;
  const relativeStrength = (gains / period) / (losses / period);
  return 100 - (100 / (1 + relativeStrength));
}

function atr(candles, period = 14) {
  const sample = candles.slice(-period);
  const ranges = sample.map((candle, index) => {
    const previous = candles[candles.length - sample.length + index - 1];
    if (!previous) return candle.high - candle.low;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previous.close),
      Math.abs(candle.low - previous.close)
    );
  });
  return average(ranges);
}

function vwap(candles) {
  const totals = candles.slice(-30).reduce((result, candle) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    result.value += typicalPrice * candle.volume;
    result.volume += candle.volume;
    return result;
  }, { value: 0, volume: 0 });
  return totals.volume ? totals.value / totals.volume : candles.at(-1)?.close || 0;
}

function pricePrecision(price) {
  if (price >= 100) return 2;
  if (price >= 1) return 4;
  return 6;
}

function marketStructure(candles) {
  const recent = candles.slice(-24);
  const first = recent.slice(0, 12);
  const second = recent.slice(12);
  const firstHigh = Math.max(...first.map((candle) => candle.high));
  const firstLow = Math.min(...first.map((candle) => candle.low));
  const secondHigh = Math.max(...second.map((candle) => candle.high));
  const secondLow = Math.min(...second.map((candle) => candle.low));
  if (secondHigh > firstHigh && secondLow > firstLow) return "bullish";
  if (secondHigh < firstHigh && secondLow < firstLow) return "bearish";
  return "range";
}

function liquidityState(candles) {
  const latest = candles.at(-1);
  const prior = candles.slice(-18, -1);
  const priorHigh = Math.max(...prior.map((candle) => candle.high));
  const priorLow = Math.min(...prior.map((candle) => candle.low));
  if (latest.high > priorHigh && latest.close < priorHigh) return "bearish sweep above prior liquidity";
  if (latest.low < priorLow && latest.close > priorLow) return "bullish sweep below prior liquidity";
  return "no confirmed liquidity sweep";
}

function buildTechnicalSnapshot(data) {
  const closes = data.candles.map((candle) => candle.close);
  const latest = data.candles.at(-1);
  const currentAtr = atr(data.candles);
  const fastEma = ema(closes.slice(-60), 20);
  const slowEma = ema(closes, 50);
  const currentRsi = rsi(closes);
  const currentVwap = vwap(data.candles);
  const recent = data.candles.slice(-30);
  const support = Math.min(...recent.map((candle) => candle.low));
  const resistance = Math.max(...recent.map((candle) => candle.high));
  const baselineVolume = average(data.candles.slice(-40, -5).map((candle) => candle.volume));
  const recentVolume = average(data.candles.slice(-5).map((candle) => candle.volume));
  const relativeVolume = baselineVolume ? recentVolume / baselineVolume : 1;
  const structure = marketStructure(data.candles);
  const liquidity = liquidityState(data.candles);
  const biasSignals = [
    latest.close >= fastEma ? 1 : -1,
    fastEma >= slowEma ? 1 : -1,
    latest.close >= currentVwap ? 1 : -1,
    currentRsi >= 50 ? 1 : -1,
    structure === "bullish" ? 1 : structure === "bearish" ? -1 : 0
  ];
  const biasScore = biasSignals.reduce((sum, value) => sum + value, 0);
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
    biasScore
  };
}

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
  const structureAligned = snapshot.structure === snapshot.direction.replace("long", "bullish").replace("short", "bearish");
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
      score: data.newsRisk.level === "extreme" ? 0 : data.newsRisk.level === "elevated" ? 4 : data.newsRisk.level === "unknown" ? 5 : 9,
      detail: data.newsRisk.event
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

function formatPrice(value) {
  return round(value, pricePrecision(Math.abs(value)));
}

function buildTradeLevels(snapshot, mode, direction, riskReward) {
  const stopDistance = Math.max(snapshot.atr * (STOP_MULTIPLIERS[mode] || 1.2), snapshot.price * 0.001);
  const zoneWidth = Math.max(snapshot.atr * 0.18, snapshot.price * 0.0002);
  const sign = direction === "long" ? 1 : -1;
  const entry = snapshot.price;
  const stop = entry - sign * stopDistance;
  return {
    entryZone: {
      low: formatPrice(entry - zoneWidth),
      high: formatPrice(entry + zoneWidth)
    },
    stopLoss: formatPrice(stop),
    takeProfits: [
      { level: "TP1", price: formatPrice(entry + sign * stopDistance * 2), riskMultiple: 2 },
      { level: "TP2", price: formatPrice(entry + sign * stopDistance * riskReward), riskMultiple: round(riskReward, 2) },
      { level: "TP3", price: formatPrice(entry + sign * stopDistance * (riskReward + 1)), riskMultiple: round(riskReward + 1, 2) }
    ],
    invalidationRule: `Invalid if price closes ${direction === "long" ? "below" : "above"} ${formatPrice(stop)} with confirming momentum.`
  };
}

function calculateLevelRiskReward(snapshot, mode) {
  const stopDistance = Math.max(snapshot.atr * (STOP_MULTIPLIERS[mode] || 1.2), snapshot.price * 0.001);
  const targetDistance = snapshot.direction === "long"
    ? Math.max(0, snapshot.resistance - snapshot.price)
    : Math.max(0, snapshot.price - snapshot.support);
  return round(Math.min(5, targetDistance / stopDistance), 2);
}

function createTechnicalAnalysis({ request, data, marketSpecific, strategies, notes = [], riskReward }) {
  const snapshot = buildTechnicalSnapshot(data);
  const resolvedRiskReward = Number.isFinite(riskReward)
    ? round(riskReward, 2)
    : round(1.6 + (data.seed % 20) / 10, 2);
  const confluence = scoreConfluence(buildComponents(data, snapshot, resolvedRiskReward, marketSpecific));
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
  const activeSetup = signal.signalStatus === "long" || signal.signalStatus === "short";
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
      marketData: data.liveDataStatus || {
        attempted: false,
        available: false,
        fallbackUsed: false
      }
    }
  };
}

module.exports = {
  EDUCATIONAL_DISCLAIMER,
  buildTechnicalSnapshot,
  calculateLevelRiskReward,
  createTechnicalAnalysis,
  formatPrice
};
