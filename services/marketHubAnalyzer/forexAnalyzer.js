const { createTechnicalAnalysis } = require("./strategies");

function analyzeForex(request, data) {
  const pairBenefitsFromDollarStrength = request.asset.startsWith("USD/");
  const dxyAligned = data.dxyBias === "neutral"
    || (pairBenefitsFromDollarStrength && data.dxyBias === "bullish")
    || (!pairBenefitsFromDollarStrength && data.dxyBias === "bearish");
  return createTechnicalAnalysis({
    request,
    data,
    marketSpecific: {
      score: dxyAligned ? 8 : 4,
      detail: `${data.session} session placeholder with a ${data.dxyBias} DXY filter placeholder`
    },
    strategies: [
      "Daily and 4H bias",
      "Support and resistance",
      "Liquidity sweep and market structure shift",
      "London/New York session logic",
      "Asian range placeholder",
      "DXY filter placeholder",
      "News-risk gate"
    ],
    notes: ["Tier-one news and session inputs are simulated; extreme news risk blocks the setup."]
  });
}

module.exports = { analyzeForex };
