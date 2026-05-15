(function () {
  const provider = "yigim";
  const productPlans = {
    course: "education-bundle",
    signals: "premium-discord-signals",
    arbitrage: "arbitrage-only"
  };

  function userToken() {
    return localStorage.getItem("bb_token") || "";
  }

  function isLoggedIn() {
    return Boolean(userToken());
  }

  function buttonLabel(planId) {
    if (!isLoggedIn()) return planId.includes("premium") || planId.includes("arbitrage") ? "Log In to Subscribe" : "Log In to Buy";
    if (planId === "education-bundle") return "Buy Now";
    return "Subscribe Now";
  }

  function makeBuyButton(planId) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn primary bb-buy-button";
    button.dataset.bbCheckoutPlan = planId;
    button.textContent = buttonLabel(planId);
    return button;
  }

  function addBeforeSecondary(container, planId) {
    if (!container || container.querySelector(`[data-bb-checkout-plan="${planId}"]`)) return;
    const button = makeBuyButton(planId);
    const secondary = container.querySelector(".btn.secondary, a[data-link]");
    if (secondary) container.insertBefore(button, secondary);
    else container.appendChild(button);
  }

  function syncButtons() {
    document.querySelectorAll(".product-card").forEach((card) => {
      const productId = card.getAttribute("data-product");
      const planId = productPlans[productId];
      if (!planId) return;
      const body = card.querySelector(".body") || card;
      addBeforeSecondary(body, planId);
    });

    const bundle = document.querySelector(".bundle-callout");
    if (bundle) addBeforeSecondary(bundle.lastElementChild || bundle, "education-bundle");

    const bookActions = document.querySelector(".book-layout .hero-actions");
    if (bookActions) addBeforeSecondary(bookActions, "education-bundle");

    const signalsActions = document.querySelector(".discord-hero .hero-actions");
    if (signalsActions) {
      signalsActions.querySelectorAll('a[href="/login"]').forEach((link) => {
        if (isLoggedIn() && /purchase/i.test(link.textContent || "")) link.remove();
      });
      addBeforeSecondary(signalsActions, "premium-discord-signals");
    }

    document.querySelectorAll("[data-checkout-plan]").forEach((button) => {
      const planId = button.getAttribute("data-checkout-plan");
      if (planId) button.textContent = buttonLabel(planId);
    });
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
    const checkoutUrl = payload.payment?.checkoutUrl || "/payment/success";
    window.location.href = checkoutUrl;
  }

  document.addEventListener("click", async (event) => {
    const checkout = event.target.closest("[data-bb-checkout-plan], [data-checkout-plan]");
    if (!checkout) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const planId = checkout.getAttribute("data-bb-checkout-plan") || checkout.getAttribute("data-checkout-plan");
    checkout.setAttribute("disabled", "disabled");
    checkout.textContent = "Creating checkout...";
    try {
      await startCheckout(planId);
    } catch (error) {
      alert(error.message);
      checkout.removeAttribute("disabled");
      checkout.textContent = buttonLabel(planId);
    }
  }, true);

  const observer = new MutationObserver(syncButtons);
  window.addEventListener("DOMContentLoaded", () => {
    syncButtons();
    const app = document.getElementById("app") || document.body;
    observer.observe(app, { childList: true, subtree: true });
  });
})();
