const { STATIC_EVENTS, PROVIDER_REGISTRY } = require("./economicCalendarProvider");

async function fetchCurrentCalendarData() {
  const providerKey = process.env.ECONOMIC_CALENDAR_PROVIDER;
  const calendarApiKey = process.env.ECONOMIC_CALENDAR_API_KEY;
  const newsApiKey = process.env.NEWS_API_KEY;

  if (!providerKey || (!calendarApiKey && !newsApiKey)) {
    return {
      events: STATIC_EVENTS,
      dataStatus: "static-calendar",
      message: "Static event-risk rules active. Live economic calendar API not connected yet."
    };
  }

  // Attempt to use the provider if it is registered
  if (providerKey && PROVIDER_REGISTRY[providerKey]) {
    try {
      // In a real implementation, we would call the provider adapter here.
      // e.g., const liveEvents = await PROVIDER_REGISTRY[providerKey].fetch(calendarApiKey);
      // For now, this branch is unimplemented live logic.
      throw new Error("Live provider adapter not fully implemented");
    } catch (err) {
      return {
        events: STATIC_EVENTS, // fallback to static events even if disconnected, to keep baseline rules
        dataStatus: "not-connected",
        message: "Live economic calendar API connection failed or timed out. Falling back to static events."
      };
    }
  }

  // Keys exist but provider isn't supported/registered or fails
  return {
    events: STATIC_EVENTS,
    dataStatus: "not-connected",
    message: "Live economic calendar API connection failed or timed out. Falling back to static events."
  };
}

module.exports = {
  fetchCurrentCalendarData
};
