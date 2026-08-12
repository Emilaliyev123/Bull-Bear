(function () {
  // Read lazily off window: app.js owns the list and may not have run yet.
  const retiredPlans = () => window.retiredCheckoutPlanIds || new Set();
  const productPlans = {
    signals: "",
    arbitrage: "arbitrage-only"
  };

  let observer = null;
  let syncQueued = false;

  function userToken() {
    try {
      return localStorage.getItem("bb_token") || "";
    } catch (error) {
      return "";
    }
  }

  function isLoggedIn() {
    return Boolean(userToken());
  }

  function buttonLabel() {
    return isLoggedIn() ? "Subscribe Now" : "Log In to Subscribe";
  }

  function setText(element, text) {
    if (element && element.textContent !== text) {
      element.textContent = text;
    }
  }

  function makeBuyButton(planId) {
    if (!planId || retiredPlans().has(planId)) return null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn primary bb-buy-button";
    button.setAttribute("data-checkout-plan", planId);
    button.textContent = buttonLabel();
    return button;
  }

  function addButton(container, planId) {
    if (!container || !planId || retiredPlans().has(planId)) return;
    const selector = `[data-bb-checkout-plan="${planId}"], [data-checkout-plan="${planId}"]`;
    if (container.querySelector(selector)) return;

    const button = makeBuyButton(planId);
    if (!button) return;
    const secondary = container.querySelector(".btn.secondary, a[data-link]");
    if (secondary && secondary.parentElement === container) {
      container.insertBefore(button, secondary);
    } else {
      container.appendChild(button);
    }
  }

  function removeRetiredCheckoutButtons() {
    retiredPlans().forEach((planId) => {
      document
        .querySelectorAll(`[data-bb-checkout-plan="${planId}"], [data-checkout-plan="${planId}"], a[href="/checkout/${planId}"]`)
        .forEach((button) => button.remove());
    });
  }

  function syncButtonsNow() {
    syncQueued = false;
    if (observer) observer.disconnect();

    try {
      removeRetiredCheckoutButtons();

      document.querySelectorAll(".product-card").forEach((card) => {
        const planId = productPlans[card.getAttribute("data-product")];
        if (planId) addButton(card.querySelector(".body") || card, planId);
      });

      document.querySelectorAll("[data-bb-checkout-plan], [data-checkout-plan]").forEach((button) => {
        const planId = button.getAttribute("data-bb-checkout-plan") || button.getAttribute("data-checkout-plan");
        if (retiredPlans().has(planId)) {
          button.remove();
        } else if (planId && !button.disabled) {
          setText(button, buttonLabel());
        }
      });
    } finally {
      const target = document.getElementById("app") || document.body;
      if (observer && target) observer.observe(target, { childList: true });
    }
  }

  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    window.requestAnimationFrame(syncButtonsNow);
  }

  window.addEventListener("DOMContentLoaded", () => {
    observer = new MutationObserver(queueSync);
    queueSync();
  });

  window.addEventListener("popstate", queueSync);
})();
