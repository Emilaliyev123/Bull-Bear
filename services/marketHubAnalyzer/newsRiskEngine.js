const { isEventRelevant } = require("./economicCalendarProvider");
const { fetchCurrentCalendarData } = require("./newsRiskProvider");

const RESEARCH_MODES = new Set(["longTermInvestment", "marketSummary", "sectorAnalysis"]);

async function evaluateNewsRisk(market, asset, mode, injectedTime = null) {
  const currentTime = injectedTime ? new Date(injectedTime) : new Date();
  const calendarData = await fetchCurrentCalendarData();
  const events = calendarData.events;

  let highestRiskLevel = "normal";
  let totalScoreImpact = 0;
  let shouldBlockTrade = false;
  const activeEvents = [];
  const upcomingEvents = [];

  for (const event of events) {
    if (!isEventRelevant(event, market, asset)) continue;

    const eventTime = new Date(event.scheduledTime);
    const diffMs = currentTime.getTime() - eventTime.getTime();
    const diffMinutes = diffMs / (1000 * 60);
    const absDiffMinutes = Math.abs(diffMinutes);

    // Track upcoming events within the next 24 hours
    if (diffMinutes < 0 && absDiffMinutes <= 24 * 60) {
      upcomingEvents.push(event);
    }

    let eventRiskLevel = "normal";
    let eventScoreImpact = 0;
    let eventBlocksTrade = false;

    if (event.importance === "extreme" && absDiffMinutes <= 60) {
      // FOMC, CPI, NFP
      eventRiskLevel = "extreme";
      eventScoreImpact = -40;
      if (!RESEARCH_MODES.has(mode)) {
        eventBlocksTrade = true;
      }
    } else if (event.importance === "high" && absDiffMinutes <= 30) {
      // PPI, GDP, Retail Sales, PMI, Powell Speeches, EIA
      eventRiskLevel = "high";
      eventScoreImpact = -20;
    } else if (event.importance === "medium" && absDiffMinutes <= 15) {
      // minor events
      eventRiskLevel = "medium";
      eventScoreImpact = -10;
    }

    if (eventRiskLevel !== "normal") {
      activeEvents.push({ ...event, riskLevel: eventRiskLevel, diffMinutes: Math.round(diffMinutes) });
      
      // Update overall risk
      if (eventRiskLevel === "extreme") {
        highestRiskLevel = "extreme";
        shouldBlockTrade = eventBlocksTrade || shouldBlockTrade;
      } else if (eventRiskLevel === "high" && highestRiskLevel !== "extreme") {
        highestRiskLevel = "high";
      } else if (eventRiskLevel === "medium" && highestRiskLevel === "normal") {
        highestRiskLevel = "medium";
      }

      totalScoreImpact += eventScoreImpact;
    }
  }

  // Cap score impact
  const scoreImpact = Math.max(-100, totalScoreImpact);
  
  let explanation = "No active news or macroeconomic risk detected within immediate windows.";
  if (highestRiskLevel === "extreme") {
    explanation = `Extreme risk detected due to major macroeconomic events. ${shouldBlockTrade ? "Trading is blocked." : "Research warnings apply."}`;
  } else if (highestRiskLevel === "high") {
    explanation = "High risk detected due to elevated macroeconomic events.";
  } else if (highestRiskLevel === "medium") {
    explanation = "Medium risk detected due to minor macroeconomic events.";
  }

  return {
    level: highestRiskLevel,
    scoreImpact,
    shouldBlockTrade,
    activeEvents,
    upcomingEvents,
    explanation,
    dataStatus: calendarData.dataStatus
  };
}

module.exports = {
  evaluateNewsRisk
};
