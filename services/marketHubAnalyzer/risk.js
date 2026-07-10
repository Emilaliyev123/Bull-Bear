/**
 * Risk level taxonomy (lowest to highest severity):
 *   normal  →  medium  →  high  →  extreme
 *
 * The newsRisk engine outputs "normal", "medium", "high", or "extreme".
 * The volatilityRisk assessors output "normal", "elevated", or "extreme".
 * We normalise "elevated" → "high" here so downstream consumers only
 * ever see the four canonical levels.
 */
function normalizeRiskLevel(level) {
  if (level === "elevated") return "high";
  return level || "normal";
}

function assessRiskLevel({ confidenceScore, newsRisk, volatilityRisk, mode }) {
  const news = normalizeRiskLevel(newsRisk);
  const vol = normalizeRiskLevel(volatilityRisk);

  if (news === "extreme" || vol === "extreme") return "extreme";
  if (news === "high" && vol === "high") return "extreme";
  if (news === "high" || vol === "high" || mode === "scalping") return "high";
  if (news === "medium" || vol === "medium") return "medium";
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
  highRiskWarning,
  normalizeRiskLevel
};
