/**
 * Bull & Bear — first-party page tracking
 *
 * Sends a pageview to our own server. No cookies, no third-party script, no
 * identifier stored on the device, which is why the site needs no consent
 * banner for it.
 *
 * The site is a single-page app, so a route change never triggers a browser
 * navigation — every view after the first has to be reported explicitly, or the
 * numbers would only ever show the landing page.
 */
(function () {
  "use strict";

  let lastPath = null;

  function send(payload) {
    try {
      const body = JSON.stringify(payload);
      // sendBeacon survives the page being closed mid-request, which a plain
      // fetch does not — it is the difference between counting a bounce and
      // losing it.
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/analytics/collect", new Blob([body], { type: "application/json" }));
        return;
      }
      fetch("/api/analytics/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true
      }).catch(() => {});
    } catch (error) {
      // Never let measurement break the page.
    }
  }

  function trackView(path) {
    const clean = (path || window.location.pathname || "/").split("?")[0];
    if (clean === lastPath) return;      // guard against double renders
    const isFirst = lastPath === null;
    lastPath = clean;
    send({
      path: clean,
      // Only the first view of a session has a meaningful referrer; on later
      // in-app views document.referrer still points at the original source and
      // would inflate that source's count on every click.
      referrer: isFirst ? document.referrer : ""
    });
  }

  function trackEvent(name) {
    if (name) send({ event: String(name) });
  }

  window.BullBearAnalytics = { trackView, trackEvent };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => trackView(), { once: true });
  } else {
    trackView();
  }

  window.addEventListener("popstate", () => trackView());
})();
