const { createTechnicalAnalysis } = require("./strategies");

const JPY_PAIRS = new Set(["USD/JPY", "EUR/JPY", "GBP/JPY", "AUD/JPY", "CHF/JPY", "CAD/JPY"]);

/**
 * Returns the correct pip decimal precision for a Forex pair.
 * - JPY crosses: 3 decimal places (e.g., 144.123)
 * - All others:  5 decimal places (e.g., 1.08542)
 */
function forexPipPrecision(pair) {
  return JPY_PAIRS.has(pair) ? 3 : 5;
}

/**
 * Weekend gap note: Forex markets are closed Fri 17:00 ET → Sun 17:00 ET.
 * When analysis is run during the Asian session on short timeframes there is
 * an elevated probability that the open reflects a gap from Friday's close.
 */
function weekendGapNote(session, timeframe) {
  const shortTimeframes = new Set(["5m", "15m", "1h", "4h"]);
  if (session === "Asian" && shortTimeframes.has(timeframe)) {
    return "Asian session opens may carry a weekend gap vs. Friday's close. Verify the current candle is not a gap-open outlier before trading.";
  }
  return null;
}

function analyzeForex(request, data) {
  const pairBenefitsFromDollarStrength = request.asset.startsWith("USD/");
  const dxyAligned = data.dxyBias === "neutral"
    || (pairBenefitsFromDollarStrength && data.dxyBias === "bullish")
    || (!pairBenefitsFromDollarStrength && data.dxyBias === "bearish");

  const pipPrecision = forexPipPrecision(request.asset);
  const pipLabel = JPY_PAIRS.has(request.asset) ? "3-decimal JPY pip" : "5-decimal standard pip";

  const notes = [
    `Tier-one news and session inputs are simulated; extreme news risk blocks the setup.`,
    `Price levels shown at ${pipLabel} precision (${pipPrecision} decimal places).`
  ];

  const gapNote = weekendGapNote(data.session, request.timeframe);
  if (gapNote) notes.push(gapNote);

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
    notes
  });
}

module.exports = { analyzeForex, forexPipPrecision, weekendGapNote };
