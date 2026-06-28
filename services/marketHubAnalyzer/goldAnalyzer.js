const { createTechnicalAnalysis } = require("./strategies");

function analyzeGold(request, data) {
  const inverseDxySupport = data.dxyBias === "bearish" ? 9 : data.dxyBias === "neutral" ? 6 : 3;
  return createTechnicalAnalysis({
    request,
    data,
    marketSpecific: {
      score: inverseDxySupport,
      detail: `${data.session} session with ${data.dxyBias} DXY inverse-filter and CPI/FOMC/NFP placeholders`
    },
    strategies: [
      "XAU/USD market structure",
      "Asian range breakout placeholder",
      "London/New York session logic",
      "Liquidity sweep reversal",
      "DXY inverse filter placeholder",
      "CPI/FOMC/NFP risk gate",
      "ATR volatility stop"
    ],
    notes: ["A simulated major macro event forces highRisk and suppresses all active levels."]
  });
}

module.exports = { analyzeGold };
