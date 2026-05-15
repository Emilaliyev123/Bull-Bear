(function () {
  const provider = "yigim";
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
    button.setAttribute("data-bb-checkout-plan", planId);
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

  async function startCheckout(planId) {
    if (!isLoggedIn()) {
      window.location.href = "/login";
      return;
    }

    const response = await fetch("/api/payments/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken()}`
      },
      body: JSON.stringify({ planId, provider })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Checkout could not be created.");
    window.location.href = payload.payment?.checkoutUrl || "/payment/success";
  }

  document.addEventListener("click", async (event) => {
    if (!(event.target instanceof Element)) return;

    const checkout = event.target.closest("[data-bb-checkout-plan], [data-checkout-plan]");
    if (!checkout) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const planId = checkout.getAttribute("data-bb-checkout-plan") || checkout.getAttribute("data-checkout-plan");
    if (!planId) return;

    checkout.disabled = true;
    checkout.textContent = "Creating checkout...";

    try {
      await startCheckout(planId);
    } catch (error) {
      alert(error.message || "Checkout could not be created.");
      checkout.disabled = false;
      checkout.textContent = buttonLabel(planId);
    }
  }, true);

  window.addEventListener("DOMContentLoaded", () => {
    observer = new MutationObserver(queueSync);
    queueSync();
  });

  window.addEventListener("popstate", queueSync);
})();
