(function () {
  const productPlans = {
    course: "education-bundle",
    signals: "premium-discord-signals",
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

  function buttonLabel(planId) {
    if (!isLoggedIn()) {
      return planId === "education-bundle" ? "Log In to Buy" : "Log In to Subscribe";
    }
    return planId === "education-bundle" ? "Buy Now" : "Subscribe Now";
  }

  function setText(element, text) {
    if (element && element.textContent !== text) {
      element.textContent = text;
    }
  }

  function makeBuyButton(planId) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn primary bb-buy-button";
    button.setAttribute("data-checkout-plan", planId);
    button.textContent = buttonLabel(planId);
    return button;
  }

  function addButton(container, planId) {
    if (!container) return;
    const selector = `[data-bb-checkout-plan="${planId}"], [data-checkout-plan="${planId}"]`;
    if (container.querySelector(selector)) return;

    const button = makeBuyButton(planId);
    const secondary = container.querySelector(".btn.secondary, a[data-link]");
    if (secondary && secondary.parentElement === container) {
      container.insertBefore(button, secondary);
    } else {
      container.appendChild(button);
    }
  }

  function syncButtonsNow() {
    syncQueued = false;
    if (observer) observer.disconnect();

    try {
      document.querySelectorAll(".product-card").forEach((card) => {
        const planId = productPlans[card.getAttribute("data-product")];
        if (planId) addButton(card.querySelector(".body") || card, planId);
      });

      const bundle = document.querySelector(".bundle-callout");
      if (bundle) addButton(bundle.lastElementChild || bundle, "education-bundle");

      const bookActions = document.querySelector(".book-layout .hero-actions");
      if (bookActions) addButton(bookActions, "education-bundle");

      const signalsActions = document.querySelector(".discord-hero .hero-actions");
      if (signalsActions) addButton(signalsActions, "premium-discord-signals");

      document.querySelectorAll("[data-bb-checkout-plan], [data-checkout-plan]").forEach((button) => {
        const planId = button.getAttribute("data-bb-checkout-plan") || button.getAttribute("data-checkout-plan");
        if (planId && !button.disabled) setText(button, buttonLabel(planId));
      });
    } finally {
      const target = document.getElementById("app") || document.body;
      if (observer && target) observer.observe(target, { childList: true, subtree: true });
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
