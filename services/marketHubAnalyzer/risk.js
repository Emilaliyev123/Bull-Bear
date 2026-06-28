function assessRiskLevel({ confidenceScore, newsRisk, volatilityRisk, mode }) {
  if (newsRisk === "extreme" || volatilityRisk === "extreme") return "extreme";
  if (newsRisk === "elevated" && volatilityRisk === "elevated") return "high";
  if (newsRisk === "elevated" || volatilityRisk === "elevated" || mode === "scalping") return "high";
  if (confidenceScore >= 75 && !["scalping", "dayTrading"].includes(mode)) return "low";
  return "medium";
}

function highRiskWarning(riskLevel, score) {
  if (riskLevel === "extreme") {
    return "Extreme market risk: no setup should be acted on until the event and volatility window has passed.";
  }
  if (riskLevel === "high") {
    return "High-risk conditions: reduce exposure, avoid leverage, and wait for stronger confirmation.";
  }
  if (score >= 90) {
    return "Very strong model confluence is not certainty. The setup can still fail, so risk controls remain mandatory.";
  }
  return null;
}

module.exports = {
  assessRiskLevel,
  highRiskWarning
};
