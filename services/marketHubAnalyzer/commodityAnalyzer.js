const { createTechnicalAnalysis } = require("./strategies");

function analyzeCommodity(request, data) {
  const inventoryScore = data.inventoryRisk === "normal" ? 8 : data.inventoryRisk === "elevated" ? 4 : 5;
  return createTechnicalAnalysis({
    request,
    data,
    marketSpecific: {
      score: inventoryScore,
      detail: `${data.inventoryRisk} inventory-risk placeholder and ${data.seasonality} seasonality placeholder`
    },
    strategies: [
      "Trend following",
      "Support and resistance",
      "Compression breakout",
      "ATR stop",
      "Supply/demand placeholder",
      "Inventory-risk placeholder",
      "Dollar-sensitivity placeholder",
      "Seasonality placeholder"
    ],
    notes: ["Macro and inventory risks are simulated; extreme risk blocks active levels."]
  });
}

module.exports = { analyzeCommodity };
