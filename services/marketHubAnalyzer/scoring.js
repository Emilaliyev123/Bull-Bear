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

function determineSignalStatus({ score, direction, riskReward, extremeRisk }) {
  if (extremeRisk) {
    return {
      signalStatus: "highRisk",
      reason: "Analysis is blocked because news or volatility risk is extreme."
    };
  }
  if (Number.isFinite(riskReward) && riskReward < 2) {
    return {
      signalStatus: "noSignal",
      reason: "Projected risk/reward is below the required 2.0 threshold."
    };
  }
  if (score < 40) {
    return {
      signalStatus: "noSignal",
      reason: "Confluence is below 40, so there is no high-quality setup."
    };
  }
  if (score < 60) {
    return {
      signalStatus: "neutral",
      reason: "Confluence is between 40 and 59. Wait for confirmation near key levels."
    };
  }
  return {
    signalStatus: direction === "short" ? "short" : "long",
    reason: null
  };
}

module.exports = {
  COMPONENT_NAMES,
  determineSignalStatus,
  scoreConfluence
};
