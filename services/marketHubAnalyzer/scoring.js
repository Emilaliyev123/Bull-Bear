const COMPONENT_NAMES = [
  "trend",
  "marketStructure",
  "supportResistance",
  "liquidity",
  "momentum",
  "volume",
  "volatility",
  "newsRisk",
  "riskReward",
  "marketSpecific"
];

function clampScore(value) {
  return Math.max(0, Math.min(10, Math.round(Number(value) || 0)));
}

function scoreConfluence(components) {
  const normalized = {};
  for (const name of COMPONENT_NAMES) {
    const component = components[name] || {};
    normalized[name] = {
      score: clampScore(component.score),
      detail: String(component.detail || "No additional confirmation")
    };
  }
  const total = COMPONENT_NAMES.reduce((sum, name) => sum + normalized[name].score, 0);
  return {
    total,
    quality: total < 40
      ? "no setup"
      : total < 60
        ? "wait for confirmation"
        : total < 75
          ? "moderate"
          : total < 90
            ? "strong"
            : "very strong",
    components: normalized
  };
}

/**
 * Determines signal status with a 5-tier system:
 * - highRisk:  extreme news or volatility blocks all setups
 * - noSignal:  confluence < 40 or R:R below minimum threshold
 * - neutral:   confluence 40–59, wait for confirmation
 * - buy/sell:  confluence 60–74, standard setup
 * - strongBuy/strongSell: confluence >= 75, high-confidence setup
 *
 * Also returns `signalStrength` ("strong", "standard", "neutral", "noSignal", "highRisk")
 * and a plain-English `reason` for all states including active signals.
 */
function determineSignalStatus({ score, direction, riskReward, extremeRisk }) {
  if (extremeRisk) {
    return {
      signalStatus: "highRisk",
      signalStrength: "highRisk",
      reason: "Analysis is blocked because news or volatility risk is extreme."
    };
  }
  if (Number.isFinite(riskReward) && riskReward < 2) {
    return {
      signalStatus: "noSignal",
      signalStrength: "noSignal",
      reason: `Projected risk/reward of ${riskReward.toFixed(2)} is below the required 2.0 minimum.`
    };
  }
  if (score < 40) {
    return {
      signalStatus: "noSignal",
      signalStrength: "noSignal",
      reason: `Confluence score of ${score}/100 is below the 40-point threshold for a valid setup.`
    };
  }
  if (score < 60) {
    return {
      signalStatus: "neutral",
      signalStrength: "neutral",
      reason: `Confluence score of ${score}/100 is between 40 and 59. Wait for confirmation near key levels.`
    };
  }
  const isLong = direction !== "short";
  if (score >= 75) {
    return {
      signalStatus: isLong ? "strongBuy" : "strongSell",
      signalStrength: "strong",
      reason: `Strong confluence of ${score}/100 with aligned trend, momentum, and structure. High-confidence ${isLong ? "long" : "short"} setup.`
    };
  }
  return {
    signalStatus: isLong ? "long" : "short",
    signalStrength: "standard",
    reason: `Moderate confluence of ${score}/100 with a ${isLong ? "long" : "short"} bias. Standard ${isLong ? "buy" : "sell"} setup — confirm at entry zone.`
  };
}

module.exports = {
  COMPONENT_NAMES,
  determineSignalStatus,
  scoreConfluence
};
