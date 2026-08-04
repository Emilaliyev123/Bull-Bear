const CONTACT_EMAIL = "bullbearacademy.su@gmail.com";
const FREE_TELEGRAM_URL = "https://t.me/bullandbeartradingcomm";
const DISCORD_COURSE_URL = "https://t.me/bullandbeartradingcomm";
const CHECKOUT_PROVIDER = "payriff";
const productPlanIds = {
  
  signals: "",
  arbitrage: "arbitrage-only"
};
const retiredCheckoutPlanIds = new Set(["premium-discord-signals", "investor-trader-ai"]);

const state = {
  content: null,
  route: window.location.pathname,
  token: localStorage.getItem("bb_token") || "",
  user: readStoredUser(),
  adminTab: "dashboard",
  selectedCategory: "all",
  selectedCourseId: "",
  userDashboard: null,
  scanner: {
    loading: false,
    lastFetch: 0,
    lastUpdated: "",
    opportunities: [],
    exchanges: [],
    error: "",
    filters: {
      minSpread: "0.25",
      exchange: "all",
      coin: "",
      stableOnly: false,
      marketType: "spot",
      minVolume: "50000",
      risk: "all",
      network: "all",
      transferSpeed: "all",
      sort: "highest-spread"
    }
  },
  marketHub: {
    activeTab: "arbitrage",
    loading: false,
    error: null,
    requestId: 0,
    result: null,
    stockResult: null,
    forms: {
      crypto: {
        asset: "BTC",
        style: "Day Trading",
        timeframe: "15m"
      },
      forex: {
        pair: "EUR/USD",
        style: "Day Trading",
        timeframe: "4H"
      },
      commodities: {
        asset: "XAU/USD",
        style: "Day Trading",
        timeframe: "4H"
      },
      stocks: {
        asset: "SPY",
        mode: "Market Summary",
        selectedOption: "US Market",
        timeframe: "1D"
      }
    }
  },
  ai: {
    loading: false,
    result: null,
    meta: null,
    error: "",
    messages: [
      {
        role: "assistant",
        text: "Ask me anything about crypto, forex, futures, investing, market structure, risk management, portfolio planning, or lessons. I can build a structured professional answer with charts and teaching models."
      }
    ],
    form: {
      mode: "trader",
      market: "Crypto, Forex, Futures",
      asset: "BTC, ETH, EURUSD, XAUUSD",
      timeframe: "swing",
      riskProfile: "balanced",
      experienceLevel: "intermediate",
      capitalRange: "$500 - $2,000",
      question: "Analyze BTC, EURUSD, and XAUUSD with a disciplined watchlist, support/resistance, scenarios, and risk rules."
    }
  },
  adminPlatform: null,
  message: ""
};

let canvasFrame = 0;
let scannerPollTimer = null;
let scannerFilterTimer = null;
let adminPlatformLoadedAt = 0;
let userDashboardLoadedAt = 0;
let checkoutRouteStarted = "";

const categories = [
  ["all", "All Courses"],
  ["beginner", "Beginner"],
  ["advanced", "Advanced"],
  ["technical-analysis", "Technical Analysis"],
  ["risk-management", "Risk Management"],
  ["psychology", "Psychology"]
];

const productFeatures = {
  discord: [
    "Free public Telegram community",
    "Academy announcements",
    "Beginner discussion rooms",
    "Community market talk",
    "No subscription required"
  ],
  "market-hub": [
    "AI Market Scanner & Risk Engine",
    "Calculated Entry Zones",
    "Market Hub Pro dashboard",
    "Live crypto arbitrage scanner",
    "Crypto, forex, gold, and stocks analyzers",
    "How to Use crash course",
    "Advanced risk and confidence models"
  ],
  ai: []
};

const legalPolicies = {
  "/privacy-policy": {
    eyebrow: "Privacy Policy",
    title: "Privacy Policy",
    updated: "May 14, 2026",
    intro: "This policy explains how Bull & Bear Trading Academy collects, uses, and protects information when visitors use the website, create an account, purchase digital products, or contact support.",
    sections: [
      ["Information We Collect", "We may collect account details, contact information, payment confirmation data, support messages, technical usage data, and product access records. Card details are handled by payment processors and are not stored by this website."],
      ["How We Use Information", "Information is used to provide Discord membership, and scanner access; process purchases; improve the platform; respond to support requests; protect accounts; and comply with legal obligations."],
      ["Files and Digital Content", "Videos, thumbnails, book covers, and PDF files are stored for the purpose of displaying and delivering academy content on the platform."],
      ["Data Sharing", "We do not sell personal information. Limited information may be shared with trusted service providers such as hosting, analytics, support, and payment partners when required to operate the service."],
      ["Security", "We use reasonable technical and administrative safeguards to protect data. No internet service is perfectly secure, so users should keep account credentials confidential."],
      ["Contact", `For privacy questions or data requests, contact ${CONTACT_EMAIL}.`]
    ]
  },
  "/terms-and-conditions": {
    eyebrow: "Terms of Service",
    title: "Terms of Service",
    updated: "May 14, 2026",
    intro: "These terms govern access to Bull & Bear Trading Academy, including free Discord community access, Market Hub tools, AI education tools, and related digital content.",
    sections: [
      ["Educational Purpose", "All content is provided for education and market analysis. It is not financial, investment, legal, or tax advice. Trading involves risk and users are responsible for their own decisions."],
      ["Accounts and Access", "Users must provide accurate account information and keep credentials secure. Access to paid products is personal and may not be resold, shared, copied, or redistributed."],
      ["Digital Products", "Courses, books, the AI education tool, and Market Hub Pro subscriptions are delivered digitally. Discord community access is free and no signal is guaranteed."],
      ["Acceptable Use", "Users may not attempt to bypass access controls, scrape protected content, upload harmful files, disrupt the service, or misuse academy materials."],
      ["Intellectual Property", "All academy content, branding, design, text, videos, PDFs, and platform materials belong to Bull & Bear Trading Academy or its licensors unless otherwise stated."],
      ["Limitation of Liability", "The platform is provided on an as-available basis. Bull & Bear Trading Academy is not responsible for trading losses, market outcomes, or indirect damages."]
    ]
  },
  "/refund-policy": {
    eyebrow: "Refund & Exchange Policy",
    title: "Refund & Exchange Policy",
    updated: "May 14, 2026",
    intro: "This policy explains refund and exchange rules for digital products and subscriptions purchased through Bull & Bear Trading Academy.",
    sections: [
      ["Digital Product Sales", "One-time purchases provide digital access. Because digital products can be accessed immediately, purchases are generally final and non-refundable."],
      ["Subscription Services", "Market Hub Pro subscriptions may be cancelled before the next billing cycle. Access continues until the end of the current paid period."],
      ["No Trading Result Refunds", "Refunds are not issued because of trading losses, market outcomes, or dissatisfaction with personal trading results. The products are educational and analytical tools."],
      ["Duplicate or Incorrect Purchases", "If a duplicate charge or accidental purchase occurs, contact support within 24 hours with account and order details so the request can be reviewed."],
      ["Exchange Requests", "Exchanges between different products are not guaranteed. Where appropriate, we may offer account credit or access adjustments at our discretion."],
      ["How to Request Review", `Email ${CONTACT_EMAIL} with your registered email address, product name, payment date, and reason for review.`]
    ]
  },
  "/cancellation-policy": {
    eyebrow: "Cancellation & Payment Policy",
    title: "Cancellation & Payment Policy",
    updated: "May 14, 2026",
    intro: "This policy describes payment processing, subscription cancellation, failed payments, and access timing for Bull & Bear Trading Academy products.",
    sections: [
      ["Payment Processing", "Payments are processed through secure third-party payment providers. The website does not store user card numbers or full payment credentials."],
      ["One-Time Purchases", "Courses and books are one-time digital purchases. After payment confirmation, access is granted through the user account or relevant download/view page."],
      ["Recurring Subscriptions", "Market Hub Pro may be billed monthly. Renewal occurs automatically unless cancelled before the next billing date."],
      ["Cancellation", `Users may request cancellation by contacting ${CONTACT_EMAIL}. Cancellation stops future renewals but does not automatically refund the current active billing period.`],
      ["Failed Payments", "If a recurring payment fails, access may be paused until payment is completed. No penalty fee is charged by the platform for failed payment attempts."],
      ["Price Changes", "Prices may change over time. Existing subscribers should be notified before a material subscription price change takes effect."]
    ]
  }
};

const legalPolicyAliases = {
  "/privacy": "/privacy-policy",
  "/terms": "/terms-and-conditions",
  "/terms-of-service": "/terms-and-conditions",
  "/refund": "/refund-policy",
  "/cancellation": "/cancellation-policy"
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function media(url) {
  return url || "";
}

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("bb_user") || "null");
  } catch {
    return null;
  }
}

function isAdmin() {
  return state.user?.role === "admin" || state.user?.isAdmin === true;
}

function activeSubscriptionPlanIds() {
  const now = Date.now();
  return (state.userDashboard?.subscriptions || [])
    .filter((item) => {
      const paidUntil = item.paid_until || item.paidUntil || item.expiresAt;
      return item.status === "active" && (!paidUntil || new Date(paidUntil).getTime() > now);
    })
    .map((item) => item.planId);
}

function hasAiAccess() {
  if (isAdmin()) return true;
  const plans = activeSubscriptionPlanIds();
  return plans.includes("premium-discord-signals") || plans.includes("investor-trader-ai") || plans.includes("arbitrage-only");
}

function hasScannerAccess() {
  if (isAdmin()) return true;
  const plans = activeSubscriptionPlanIds();
  return plans.includes("arbitrage-only") || plans.includes("bull-bear-premium");
}

function hasEducationAccess() { return false; }

function setSession(token, user) {
  state.token = token;
  state.user = user;
  state.userDashboard = null;
  state.adminPlatform = null;
  localStorage.setItem("bb_token", token);
  localStorage.setItem("bb_user", JSON.stringify(user));
  localStorage.removeItem("bb_admin_token");
  localStorage.removeItem("bb_admin_user");
}

function applySessionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const encodedUser = params.get("user");
  if (!token || !encodedUser) return;
  try {
    const normalized = encodedUser.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    const user = JSON.parse(atob(padded));
    setSession(token, user);
    history.replaceState({}, "", window.location.pathname);
    state.route = window.location.pathname;
  } catch {
    history.replaceState({}, "", window.location.pathname);
  }
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers, cache: "no-store" });
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await response.json() : await response.text();
  if (path.startsWith("/api/") && !isJson) {
    throw new Error("The running server is outdated. Please open the latest local server URL.");
  }
  if (!response.ok) {
    if (response.status === 401) logout(false);
    throw new Error(body?.error || body || "Request failed");
  }
  return body;
}

async function fetchProtectedFile(path) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { headers, cache: "no-store" });
  if (!response.ok) {
    const isJson = (response.headers.get("content-type") || "").includes("application/json");
    const body = isJson ? await response.json() : await response.text();
    throw new Error(body?.error || body || "File access denied");
  }
  return response.blob();
}

async function loadContent() {
  state.content = await api("/api/content");
}

function navigate(path) {
  if (window.location.pathname !== path) {
    history.pushState({}, "", path);
  }
  state.route = path;
  state.selectedCourseId = "";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setMessage(message, type = "") {
  state.message = message ? `<div class="status ${type}">${esc(message)}</div>` : "";
  const holder = document.querySelector("[data-status]");
  if (holder) {
    holder.innerHTML = state.message;
  } else if (message && type === "err") {
    alert(message);
  }
}

function checkoutCta(planId, label, className = "btn primary") {
  if (!planId || retiredCheckoutPlanIds.has(planId)) return "";
  return `<a href="/checkout/${encodeURIComponent(planId)}" class="${className}" data-checkout-plan="${esc(planId)}">${esc(label)}</a>`;
}

async function startPlanCheckout(planId, button = null) {
  if (!planId || retiredCheckoutPlanIds.has(planId)) {
    setMessage("Discord is free now. Please use the Join Free Discord button.", "err");
    if (button) button.remove();
    return;
  }
  if (!state.user) {
    navigate("/login");
    return;
  }
  const originalText = button?.textContent || "";
  if (button) {
    if (button.tagName === "BUTTON") button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    button.textContent = "Creating checkout...";
  }
  setMessage("Creating checkout...");
  try {
    const result = await api("/api/payments/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, provider: CHECKOUT_PROVIDER })
    });
    state.message = `<div class="status ok">${esc(result.message || "Checkout created.")}</div>`;
    const checkoutUrl = result.payment?.checkoutUrl || "/payment/success";
    if (/^https?:\/\//i.test(checkoutUrl)) {
      window.location.href = checkoutUrl;
      return;
    }
    navigate(checkoutUrl);
  } catch (error) {
    setMessage(error.message, "err");
    if (button) {
      if (button.tagName === "BUTTON") button.disabled = false;
      button.removeAttribute("aria-disabled");
      button.textContent = originalText || "Subscribe Now";
    }
  }
}

async function connectDiscordAccount(button = null) {
  if (!state.user) {
    navigate("/login");
    return;
  }
  setMessage("Opening Discord authorization...");
  const originalText = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = "Opening Discord...";
  }
  try {
    const result = await api("/api/integrations/discord/connect", { method: "POST" });
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    throw new Error("Discord connect link was not created.");
  } catch (error) {
    setMessage(error.message, "err");
    alert(error.message);
    if (button) {
      button.disabled = false;
      button.textContent = originalText || "Connect Discord";
    }
  }
}

function bindCheckoutButtons() {
  document.querySelectorAll("[data-checkout-plan]").forEach((button) => {
    const planId = button.getAttribute("data-checkout-plan");
    if (!planId || retiredCheckoutPlanIds.has(planId)) {
      button.remove();
      return;
    }
    if (button.dataset.checkoutBound === "true") return;
    if (button.tagName === "BUTTON") button.type = "button";
    button.dataset.checkoutBound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (planId) startPlanCheckout(planId, button);
    });
  });
}

function compactMoney(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(2)}B`;
  if (number >= 1_000_000) return `$${(number / 1_000_000).toFixed(2)}M`;
  if (number >= 1_000) return `$${(number / 1_000).toFixed(1)}K`;
  return `$${number.toFixed(2)}`;
}

function fmtPrice(value) {
  const number = Number(value || 0);
  if (number >= 100) return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (number >= 1) return number.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return number.toPrecision(6);
}

function scannerQuery(limit = 100) {
  const params = new URLSearchParams();
  Object.entries(state.scanner.filters).forEach(([key, value]) => {
    params.set(key, value === true ? "true" : value === false ? "false" : String(value ?? ""));
  });
  params.set("limit", String(limit));
  return params.toString();
}

async function loadScannerData(force = false) {
  if (!hasScannerAccess()) return;
  if (state.scanner.loading) return;
  if (!force && Date.now() - state.scanner.lastFetch < 8000) return;
  state.scanner.loading = true;
  state.scanner.error = "";
  render();
  try {
    const data = await api(`/api/scanner/opportunities?${scannerQuery()}`);
    state.scanner.opportunities = data.opportunities || [];
    state.scanner.exchanges = data.exchanges || [];
    state.scanner.lastUpdated = data.lastUpdated || "";
    state.scanner.lastFetch = Date.now();
    state.scanner.error = "";
  } catch (error) {
    state.scanner.error = error.message;
  } finally {
    state.scanner.loading = false;
    render();
  }
}

async function loadAdminPlatform(force = false) {
  if (!state.token || !isAdmin()) return;
  if (!force && state.adminPlatform && Date.now() - adminPlatformLoadedAt < 12000) return;
  try {
    state.adminPlatform = await api("/api/admin/platform");
    adminPlatformLoadedAt = Date.now();
    render();
  } catch (error) {
    state.adminPlatform = { error: error.message };
  }
}

async function loadUserDashboard(force = false) {
  if (!state.token || !state.user || isAdmin()) return;
  if (!force && state.userDashboard && Date.now() - userDashboardLoadedAt < 12000) return;
  try {
    state.userDashboard = await api("/api/dashboard");
    userDashboardLoadedAt = Date.now();
    render();
  } catch (error) {
    state.userDashboard = { error: error.message };
  }
}

function mountRouteEffects() {
  const path = state.route.replace(/\/$/, "") || "/";
  const checkoutMatch = path.match(/^\/checkout\/([^/]+)$/);
  if (path === "/arbitrage" || path === "/scanner" || path === "/market-hub") {
    if (state.token && state.user && !isAdmin()) loadUserDashboard();
    if (hasScannerAccess()) {
      loadScannerData();
    } else {
      state.scanner.error = "";
      state.scanner.loading = false;
    }
    if (hasScannerAccess() && !scannerPollTimer) {
      scannerPollTimer = setInterval(() => loadScannerData(true), 12000);
    } else if (!hasScannerAccess() && scannerPollTimer) {
      clearInterval(scannerPollTimer);
      scannerPollTimer = null;
    }
  } else if (scannerPollTimer) {
    clearInterval(scannerPollTimer);
    scannerPollTimer = null;
  }
  if (path === "/ai") {
    if (state.token && state.user && !isAdmin()) loadUserDashboard();
    if (hasScannerAccess()) loadScannerData();
  }
  
  if (path === "/admin" && state.token && isAdmin()) loadAdminPlatform();
  if ((path === "/profile" || path === "/dashboard") && state.token && state.user && !isAdmin()) loadUserDashboard();
  if (checkoutMatch) {
    if (checkoutRouteStarted !== path) {
      checkoutRouteStarted = path;
      const planId = decodeURIComponent(checkoutMatch[1] || "");
      setTimeout(() => startPlanCheckout(planId), 0);
    }
  } else {
    checkoutRouteStarted = "";
  }
}

function header() {
  const links = [
    ["/products", "Products"],
    ["/how-to-use", "How to Use"],
    ["/signals", "Telegram"],
    ["/market-hub", "Market Hub"],
    ["/ai", "AI"],
    ["/support", "Support"]
  ];
  const actions = state.user
    ? `
      <a href="${FREE_TELEGRAM_URL}" target="_blank" rel="noopener">Free Telegram</a>
      ${isAdmin() ? `<a href="/admin" data-link class="admin-link">Admin</a>` : ""}
      <a href="/profile" data-link>${esc(state.user.name || "Profile")}</a>
      <button type="button" data-logout>Logout</button>
    `
    : `
      <a href="${FREE_TELEGRAM_URL}" target="_blank" rel="noopener">Free Telegram</a>
      <a href="/login" data-link class="${state.route === "/login" ? "active" : ""}">Log in</a>
      <a href="/register" data-link class="admin-link ${state.route === "/register" ? "active" : ""}">Sign up</a>
    `;

  return `
    <header class="site-header">
      <div class="header-inner">
        <a href="/" data-link class="brand" aria-label="Bull and Bear home">
          <img src="/assets/logo.png" alt="Bull & Bear logo">
          <span>Bull & Bear<small>Trading Academy</small></span>
        </a>
        <nav class="nav" aria-label="Main navigation">
          ${links.map(([path, label]) => `<a href="${path}" data-link class="${state.route === path ? "active" : ""}">${label}</a>`).join("")}
        </nav>
        <div class="header-actions">
          ${actions}
        </div>
      </div>
    </header>
  `;
}

function footer() {
  const productLinks = [
    ["/products", "Products"],
    
    
    ["/signals", "Free Telegram"],
    ["/market-hub", "Market Hub"],
    ["/ai", "Investor AI"]
  ];
  const policyLinks = [
    ["/privacy-policy", "Privacy Policy"],
    ["/terms-and-conditions", "Terms of Service"],
    ["/refund-policy", "Refund & Exchange Policy"],
    ["/cancellation-policy", "Cancellation & Payment Policy"]
  ];
  return `
    <footer class="footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <a href="/" data-link class="brand" aria-label="Bull and Bear home">
            <img src="/assets/logo.png" alt="Bull & Bear logo">
            <span>Bull & Bear<small>Trading Academy</small></span>
          </a>
          <p>Professional trading education, market tools, and digital products for disciplined traders.</p>
        </div>
        <div class="footer-column">
          <strong>Products</strong>
          ${productLinks.map(([path, label]) => `<a href="${path}" data-link>${label}</a>`).join("")}
        </div>
        <div class="footer-column">
          <strong>Legal</strong>
          ${policyLinks.map(([path, label]) => `<a href="${path}" data-link>${label}</a>`).join("")}
        </div>
        <div class="footer-column">
          <strong>Contact</strong>
          <span>${CONTACT_EMAIL}</span>
          <span>+994 55 388 66 10</span>
          <a href="${FREE_TELEGRAM_URL}" target="_blank" rel="noopener">Join Free Telegram</a>
        </div>
      </div>
    </footer>
  `;
}

function ticker() {
  const items = (state.scanner.exchanges.length ? state.scanner.exchanges : [
    { name: "Binance", status: "ready" },
    { name: "Bybit", status: "ready" },
    { name: "OKX", status: "ready" },
    { name: "KuCoin", status: "ready" },
    { name: "Gate.io", status: "ready" },
    { name: "MEXC", status: "ready" },
    { name: "Bitget", status: "ready" }
  ]).map((exchange) => [exchange.name, exchange.status === "online" ? "online" : "API ready", exchange.status === "online" ? "up" : ""]);
  const row = items.map(([asset, move, cls]) => `<span class="ticker-item"><strong>${asset}</strong><span class="${cls}">${move}</span></span>`).join("");
  return `<div class="ticker"><div class="ticker-track">${row}${row}</div></div>`;
}

function productCard(product) {
  const cls = product.id === "analyzer" ? "blue" : product.id === "discord" || product.id === "signals" ? "gold" : product.id === "market-hub" ? "green" : "red";
  const mark = product.id === "analyzer" ? "AI" : product.id === "discord" || product.id === "signals" ? "TG" : "M";
  const badge = product.id === "discord" || product.id === "signals" ? `<div class="badge" style="background:#0088cc;color:#fff;">FREE TELEGRAM</div>` : product.id === "market-hub" ? `<div class="badge" style="background: var(--green); color:#03130e;">MARKET HUB PRO</div>` : `<div class="badge">AI PRO</div>`;
  const href = product.id === "analyzer" ? "/how-to-use" : product.id === "discord" || product.id === "signals" ? "/signals" : "/market-hub";
  const planId = product.id === "discord" || product.id === "signals" ? "" : product.planId || productPlanIds[product.id];
  const primaryLabel = planId === "education-bundle"
    ? (state.user ? "Buy Now" : "Log In to Buy")
    : (state.user ? "Subscribe Now" : "Log In to Subscribe");
  const primaryAction = product.id === "discord" || product.id === "signals"
    ? `<a href="${FREE_TELEGRAM_URL}" target="_blank" rel="noopener" class="btn primary glowing-btn">Join Free Telegram</a>`
    : planId
      ? checkoutCta(planId, primaryLabel)
      : "";
  const priceMarkup = Number(product.price || 0) > 0
    ? `<div class="price">$${money(product.price)} <span>/ ${esc(product.cadence)}</span></div>`
    : `<div class="price">Free <span>/ community</span></div>`;

  return `
    <article class="card product-card" data-product="${esc(product.id)}">
      ${badge}
      <div class="body">
        <div class="product-top">
          <div class="icon-box ${cls}">${mark}</div>
          <span>${esc(product.cadence)}</span>
        </div>
        <h3 class="h3">${esc(product.title.replace(/Discord/gi, "Telegram"))}</h3>
        <p class="product-subtitle">${esc(product.subtitle.replace(/Discord/gi, "Telegram"))}</p>
        <p class="muted" style="line-height:1.55;margin:0;">${esc(product.description.replace(/Discord/gi, "Telegram"))}</p>
        ${priceMarkup}
        <ul class="feature-list">
          ${(productFeatures[product.id] || []).map((item) => `<li>${esc(item.replace(/Discord/gi, "Telegram"))}</li>`).join("")}
        </ul>
        ${primaryAction}
        <a href="${href}" data-link class="btn secondary" style="margin-top:auto;">${product.id === "signals" || product.id === "discord" ? "View Free Telegram" : "View Product"}</a>
      </div>
    </article>
  `;
}

function scannerPricingCards() {
  const plans = [
    {
      id: "arbitrage-only",
      name: "Market Hub Pro",
      price: 99.9,
      badge: "Market Hub Pro",
      features: ["Live arbitrage scanner", "Crypto, forex, gold, and stocks analyzer UI", "Live crypto price anchoring", "How to Use mini-course", "Risk management guide"]
    }
  ];
  return `
    <div class="pricing-grid">
      ${plans.map((plan) => `
        <article class="pricing-card">
          <span>${esc(plan.badge)}</span>
          <h3 class="h3">${esc(plan.name)}</h3>
          <div class="price">$${money(plan.price)} <span>/ monthly</span></div>
          <ul class="feature-list">${plan.features.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
          ${checkoutCta(plan.id, state.user ? "Start Subscription" : "Log In to Subscribe", "btn secondary")}
        </article>
      `).join("")}
    </div>
  `;
}

function courseCard(course) {
  const image = course.thumbnailUrl
    ? `<img src="${esc(media(course.thumbnailUrl))}" alt="${esc(course.title)}">`
    : course.videoUrl
      ? `<video src="${esc(media(course.videoUrl))}" muted preload="metadata" playsinline aria-label="${esc(course.title)} preview"></video>`
    : `<div class="media-placeholder">Video Lesson</div>`;
  return `
    <article class="card course-card" data-course-id="${esc(course.id)}" tabindex="0">
      <div class="media-frame">
        ${image}
        ${course.isFree ? `<span class="direction buy" style="position:absolute;top:10px;right:10px;">FREE</span>` : ""}
      </div>
      <div class="course-body">
        <p class="gold-text" style="margin:0 0 8px;font-size:12px;font-weight:900;text-transform:uppercase;">${esc(String(course.category || "").replaceAll("-", " "))}</p>
        <h3 class="h3">${esc(course.title)}</h3>
        <p class="muted" style="line-height:1.55;">${esc(course.description)}</p>
        <p class="faint" style="margin-bottom:0;">${esc(course.duration || "Self paced")}</p>
      </div>
    </article>
  `;
}

function heroSection() {
  return `
    <section class="hero">
      <canvas class="hero-canvas" id="marketCanvas" aria-hidden="true"></canvas>
      <div class="hero-3d-stage" id="market3dStage" aria-hidden="true"></div>
      <div class="hero-inner">
        <div class="hero-copy">
          <h1 class="h1">Bull & Bear <span class="gold-text">Market Command</span></h1>
          <p class="lead">
            The ultimate AI Market Analyzer for disciplined traders. Scan Forex, Crypto, Stocks, and Gold with institutional-grade risk engines. Join our 100% Free Telegram community today.
          </p>
          <div class="hero-kpis" aria-label="Platform highlights">
            <span><strong>AI Market Scanner</strong><small>Institutional Risk Engine</small></span>
            <span><strong>Free Telegram</strong><small>Trading Community</small></span>
            <span><strong>Market Hub Pro</strong><small>$99.90 monthly</small></span>
          </div>
          <div class="hero-actions">
            <a href="/products" data-link class="btn primary glowing-btn">Unlock Market Hub</a>
            <a href="${FREE_TELEGRAM_URL}" target="_blank" rel="noopener" class="btn secondary">Join Free Telegram</a>
          </div>
        </div>
        <aside class="hero-console" aria-label="Bull and Bear platform preview">
          <div class="console-top">
            <span>Market Command</span>
            <strong>Live Desk</strong>
          </div>
          <div class="console-grid">
            <div><small>BTC</small><strong>Breakout Watch</strong><em>Risk 0.8%</em></div>
            <div><small>XAUUSD</small><strong>Trend Retest</strong><em>London session</em></div>
            <div><small>EURUSD</small><strong>Liquidity Sweep</strong><em>Wait for close</em></div>
          </div>
          <div class="console-wave" aria-hidden="true">
            <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
          </div>
          <div class="console-foot">
            <span>AI model</span>
            <strong>Scenario-based, risk-first analysis</strong>
          </div>
        </aside>
      </div>
      ${ticker()}
    </section>
  `;
}

function howToUsePage() {
  document.title = "How to Use - Bull & Bear Trading Academy";
  return `
    <div class="pad layout-center">
      <div class="glass-card pad" style="max-width: 900px; width: 100%; border: 1px solid rgba(16, 185, 129, 0.4); box-shadow: 0 0 40px rgba(16, 185, 129, 0.1);">
        <div class="text-center">
          <h1 class="h2 neon-text">How to Use the Analyzer Pro</h1>
          <p class="lead muted">Master the AI Market Scanner in 4 Simple Steps.</p>
        </div>
        
        <div class="spacer"></div>
        
        <div class="grid-2">
          <div class="card pad glassmorphism">
            <h3 class="h3" style="color: var(--blue);">1. Choose Your Market</h3>
            <p class="muted">Select from Crypto, Forex, Gold, Stocks, or Commodities. Our live nodes connect to real-world financial data in milliseconds.</p>
          </div>
          <div class="card pad glassmorphism">
            <h3 class="h3" style="color: var(--blue);">2. Read the Risk Engine</h3>
            <p class="muted">The AI scans global economic calendars (FOMC, NFP) to determine real-time volatility. If risk is <strong style="color: var(--red);">EXTREME</strong>, do not trade.</p>
          </div>
          <div class="card pad glassmorphism">
            <h3 class="h3" style="color: var(--green);">3. Analyze the Signal</h3>
            <p class="muted">Review the calculated Entry Zones and Stop Losses. We calculate optimal risk/reward ratios based on structural liquidity.</p>
          </div>
          <div class="card pad glassmorphism">
            <h3 class="h3" style="color: var(--green);">4. Follow the Invalidation</h3>
            <p class="muted">If a candle closes beyond the Stop Loss, the setup is dead. The market structure has shifted. <strong>Do not hold onto hope.</strong></p>
          </div>
        </div>

        <div class="spacer"></div>
        
        <div class="card pad" style="background: rgba(16, 185, 129, 0.05); border: 1px solid var(--green);">
          <h3 class="h3 neon-text-green text-center">Ready to Dominate?</h3>
          <p class="lead text-center">Stop trading on emotion. Use the data.</p>
          <div style="display: flex; justify-content: center; gap: 1rem; margin-top: 1rem;">
            <a href="/analyzer" data-link class="btn primary glowing-btn">Open Analyzer</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

function homePage() {
  const { products } = state.content;
  return `
    ${heroSection()}
    <section class="section compact">
      <div class="metric-strip">
        <div><strong>2</strong><span>Core products</span></div>
        <div><strong>Live</strong><span>Market Analyzer</span></div>
        <div><strong>Telegram</strong><span>100% Free Community</span></div>
        <div><strong>24/7</strong><span>Digital access</span></div>
      </div>
    </section>
    <section class="section compact">
      <div class="ai-home-band">
        <div>
          <div class="eyebrow">AI Included</div>
          <h2 class="h2" style="margin-top:12px;">AI Trading Desk</h2>
          <p class="lead">The platform includes the AI desk, full crypto and forex analysis support, risk rules, and signal-style scenarios.</p>
        </div>
        <a href="/ai" data-link class="btn primary">Open AI Desk</a>
      </div>
    </section>
    <section class="section">
      <div class="section-head">
        <div>
          <div class="eyebrow">Products</div>
          <h2 class="h2" style="margin-top:12px;">Choose Your Trading Journey</h2>
        </div>
        <a href="/products" data-link class="btn secondary small">All Products</a>
      </div>
      <div class="grid products">${products.map(productCard).join("")}</div>
    </section>
    <section class="section compact">
      <div class="academy-panel">
        <div>
          <div class="eyebrow">Method</div>
          <h2 class="h2" style="margin-top:12px;">Built for Repeatable Trading Workflows</h2>
          <p class="lead">The AI tool and Market Hub are now one bundle. Telegram is 100% free for community updates, daily signals, and lectures.</p>
        </div>
        <div class="academy-stats">
          <div class="stat"><span class="h3">5+</span><span class="muted">Live Markets</span></div>
          <div class="stat"><span class="h3">AI</span><span class="muted">Risk Engine</span></div>
        </div>
        <div class="process-list">
          <div><strong>01</strong><span>Learn structure and risk rules</span></div>
          <div><strong>02</strong><span>Practice with the AI Desk</span></div>
          <div><strong>03</strong><span>Join the free Telegram channel</span></div>
        </div>
      </div>
    </section>
    <section class="section compact">
      <div class="discord-panel" style="border-color: rgba(0, 136, 204, 0.4); background: linear-gradient(135deg, rgba(0, 136, 204, 0.1) 0%, rgba(9, 9, 11, 0.95) 100%);">
        <div>
          <div class="eyebrow" style="border-color: rgba(0, 136, 204, 0.4); background: rgba(0, 136, 204, 0.15); color: #38bdf8;">Telegram Community</div>
          <h2 class="h2" style="margin-top:12px;">100% Free Telegram Channel</h2>
          <p class="lead">Here is what we drop in this channel 100% Free:</p>
          <div class="telegram-features-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin: 16px 0 24px 0;">
            <div class="card pad compact" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(56, 189, 248, 0.2);">
              <strong>🔹 1 Free Signal Daily</strong>
              <p class="muted" style="font-size: 0.88rem; margin: 4px 0 0 0;">Market opportunities delivered every day</p>
            </div>
            <div class="card pad compact" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(56, 189, 248, 0.2);">
              <strong>🔹 2–3 Video/Text Lectures Weekly</strong>
              <p class="muted" style="font-size: 0.88rem; margin: 4px 0 0 0;">Step-by-step trading & investing lessons</p>
            </div>
            <div class="card pad compact" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(56, 189, 248, 0.2);">
              <strong>🔹 Latest Financial News</strong>
              <p class="muted" style="font-size: 0.88rem; margin: 4px 0 0 0;">Stay ahead of market-moving events</p>
            </div>
            <div class="card pad compact" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(56, 189, 248, 0.2);">
              <strong>🔹 Investment Ideas</strong>
              <p class="muted" style="font-size: 0.88rem; margin: 4px 0 0 0;">Curated insights on top assets to buy</p>
            </div>
          </div>
          <div class="hero-actions">
            <a href="${FREE_TELEGRAM_URL}" target="_blank" rel="noopener" class="btn primary glowing-btn" style="background: #0088cc; color: #fff;">Join Free Telegram (@bullandbeartradingcomm)</a>
            <a href="/signals" data-link class="btn secondary">View Telegram Details</a>
          </div>
        </div>
      </div>
    </section>

  `;
}

function productsPage() {
  return `
    <section class="section">
      <div class="section-head center">
        <div class="eyebrow">Analyzer Access</div>
        <h1 class="h2">Choose Your <span class="neon-text-green">Trading Arsenal</span></h1>
        <p class="lead">Unlock the AI Market Scanner, join our 100% free Telegram channel, or upgrade to Market Hub Pro.</p>
      </div>
      <div class="grid products">${state.content.products.map(productCard).join("")}</div>
      <div class="discord-mini" style="border-color: rgba(0, 136, 204, 0.3);">
        <span>Free Telegram community (@bullandbeartradingcomm) is open to everyone.</span>
        <a href="${FREE_TELEGRAM_URL}" target="_blank" rel="noopener" class="btn primary small" style="background: #0088cc;">Join Free Telegram</a>
      </div>
    </section>
  `;
}

function courseModal() {
  const course = state.content.courses.find((item) => item.id === state.selectedCourseId);
  if (!course) return "";
  const video = course.videoUrl
    ? `<video src="${esc(media(course.videoUrl))}" controls controlsList="nodownload" playsinline></video>`
    : `<div class="media-placeholder">Lesson coming soon</div>`;
  return `
    <div class="modal-backdrop" data-close-modal>
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(course.title)}" data-modal>
        <div class="modal-head">
          <div>
            <p class="gold-text" style="margin:0 0 4px;font-size:12px;font-weight:900;text-transform:uppercase;">${esc(String(course.category || "").replaceAll("-", " "))}</p>
            <h2 class="h3">${esc(course.title)}</h2>
          </div>
          <button class="btn secondary small" data-close-modal>Close</button>
        </div>
        <div class="modal-body">
          <div class="media-frame" style="border:1px solid var(--line);border-radius:8px;">${video}</div>
          <p class="muted" style="line-height:1.65;">${esc(course.description)}</p>
        </div>
      </div>
    </div>
  `;
}


function signalsPage() {
  return `
    <section class="section">
      <div class="discord-hero" style="border-color: rgba(0, 136, 204, 0.4); background: linear-gradient(135deg, rgba(0, 136, 204, 0.12) 0%, rgba(9, 9, 11, 0.95) 100%);">
        <div>
          <div class="eyebrow" style="border-color: rgba(0, 136, 204, 0.4); background: rgba(0, 136, 204, 0.15); color: #38bdf8;">100% Free Telegram</div>
          <h1 class="h2" style="margin-top:12px;">Bull & Bear Telegram Channel</h1>
          <p class="lead">Join our official Telegram community (@bullandbeartradingcomm) for daily market signals, video & text lectures, financial news, and curated investment ideas—completely free.</p>
          <div class="hero-actions" style="margin-top:20px;">
            <a href="${FREE_TELEGRAM_URL}" target="_blank" rel="noopener" class="btn primary glowing-btn" style="background: #0088cc; color: #fff;">Join Free Telegram</a>
            <a href="/products" data-link class="btn secondary">View Market Hub Pro</a>
          </div>
        </div>
        <div class="card pad" style="border-color: rgba(0, 136, 204, 0.3);">
          <div class="price" style="color: #38bdf8;">100% Free <span>/ channel</span></div>
          <ul class="feature-list" style="margin-top: 16px;">
            <li>🔹 <strong>1 Free Signal Daily</strong> (Market opportunities delivered every day)</li>
            <li>🔹 <strong>2–3 Video/Text Lectures Weekly</strong> (Step-by-step trading & investing lessons)</li>
            <li>🔹 <strong>Latest Financial News</strong> (Stay ahead of market-moving events)</li>
            <li>🔹 <strong>Investment Ideas</strong> (Curated insights on top assets to buy)</li>
          </ul>
        </div>
      </div>
      <div class="grid four" style="margin-top:24px;">
        <div class="card pad glassmorphism">
          <h2 class="h3" style="color: #38bdf8;">🔹 Daily Free Signal</h2>
          <p class="muted" style="margin-top: 8px;">1 high-probability market opportunity delivered straight to your phone every day.</p>
          <a href="${FREE_TELEGRAM_URL}" target="_blank" rel="noopener" class="btn primary small" style="margin-top:14px; background: #0088cc;">Join Telegram</a>
        </div>
        <div class="card pad glassmorphism">
          <h2 class="h3" style="color: var(--gold);">🔹 Weekly Lectures</h2>
          <p class="muted" style="margin-top: 8px;">2–3 educational video & text lessons weekly covering technicals, macro, and risk management.</p>
        </div>
        <div class="card pad glassmorphism">
          <h2 class="h3" style="color: var(--green);">🔹 Breaking News</h2>
          <p class="muted" style="margin-top: 8px;">Real-time analysis of central bank decisions, CPI releases, and geopolitical events.</p>
        </div>
        <div class="card pad glassmorphism">
          <h2 class="h3" style="color: #a855f7;">🔹 Investment Ideas</h2>
          <p class="muted" style="margin-top: 8px;">Deep-dive research and trade ideas on high-performing Crypto, Forex, and Stock assets.</p>
        </div>
      </div>
    </section>
  `;
}

function scannerAccessGate(checking = false) {
  const dashboardError = state.userDashboard?.error || "";
  const action = !state.user
    ? `<a href="/login" data-link class="btn primary">Log In to Subscribe</a>`
    : checkoutCta("arbitrage-only", "Subscribe to Market Hub Pro");
  return `
    <section class="section">
      <div class="section-head center">
        <div class="eyebrow">Premium Market Hub</div>
        <h1 class="h2">Market Hub Pro Is A Paid Product</h1>
        <p class="lead">The premium dashboard is locked for customers with active Market Hub Pro access. Admin users can open it for management and testing.</p>
      </div>
      <div class="scanner-lock-grid">
        <div class="card pad glow-card scanner-lock-card">
          <div class="badge" style="width:max-content;">MARKET HUB</div>
          <h2 class="h3" style="margin-top:18px;">Market Hub Pro</h2>
          <div class="price">$99.90 <span>/ monthly</span></div>
          <ul class="feature-list">
            <li>Live crypto arbitrage scanner</li>
            <li>Crypto, forex, gold, commodities, and stock analysis modules</li>
            <li>Mini-course and risk management education</li>
            <li>Advanced filters, levels, confidence, and risk views</li>
            <li>Paid member access only</li>
          </ul>
          <div class="hero-actions" style="margin-top:22px;">
            ${checking ? `<button class="btn primary" type="button" disabled>Checking access...</button>` : action}
            <a href="/products" data-link class="btn secondary">View Products</a>
          </div>
          ${dashboardError ? `<div class="status err" style="margin-top:18px;">${esc(dashboardError)}</div>` : ""}
        </div>
      </div>
    </section>
  `;
}

function marketHubService() {
  return window.BullBearMarketHub || {};
}

function hubTabs() {
  return [
    ["arbitrage", "Arbitrage", "Live spread scanner"],
    ["ai", "AI Manager", "Complete Financial AI"],
    ["crypto", "Crypto", "BTC, ETH, SOL and more"],
    ["forex", "Forex", "Majors and crosses"],
    ["commodities", "Gold & Commodities", "Gold, silver, oil, gas"],
    ["stocks", "Stocks", "Research and strategy"],
    ["how-to-use", "How to Use", "Mini course"],
    ["risk-guide", "Risk Guide", "Capital protection"]
  ];
}

function selectedOptionTags(items = [], selected = "") {
  return items.map((item) => `<option value="${esc(item)}" ${item === selected ? "selected" : ""}>${esc(item)}</option>`).join("");
}

function meter(value = 0, cls = "") {
  const safeValue = Math.max(0, Math.min(100, Number(value || 0)));
  return `<div class="hub-meter ${cls}"><i style="width:${safeValue}%"></i></div>`;
}

function formatDateTime(value) {
  if (!value) return "Not updated";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function signalClass(status = "") {
  const value = status.toLowerCase();
  if (value.includes("long") || value.includes("bull")) return "long";
  if (value.includes("short") || value.includes("bear")) return "short";
  if (value.includes("highrisk") || value.includes("high risk")) return "high-risk";
  if (value.includes("neutral")) return "neutral";
  if (value.includes("research")) return "research";
  return "none";
}

function humanizeAnalyzerKey(value = "") {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function analyzerSignalLabel(status = "neutral") {
  const labels = {
    long: "Long",
    short: "Short",
    neutral: "Neutral",
    noSignal: "No Signal",
    highRisk: "Entry Suppressed"
  };
  return labels[status] || humanizeAnalyzerKey(status);
}

function analyzerConfidenceBand(value = 0) {
  const score = Math.max(0, Math.min(100, Number(value || 0)));
  if (score <= 39) return { label: "No Setup", detail: "Confluence is too weak for a quality scenario.", className: "no-setup" };
  if (score <= 59) return { label: "Weak / Wait", detail: "More confirmation is required before planning a trade.", className: "weak" };
  if (score <= 74) return { label: "Moderate", detail: "A developing setup with meaningful conditions still to verify.", className: "moderate" };
  if (score <= 89) return { label: "Strong", detail: "Multiple strategy factors align, but risk controls still apply.", className: "strong" };
  return { label: "Very Strong, Still Risky", detail: "High confluence never removes market risk or guarantees profit.", className: "very-strong" };
}

function formatAnalyzerEntryZone(entryZone) {
  if (!entryZone) return "Not issued";
  if (typeof entryZone === "object") {
    return `${entryZone.low ?? "-"} - ${entryZone.high ?? "-"}`;
  }
  return String(entryZone);
}

function formatAnalyzerValue(value) {
  if (value === null || value === undefined || value === "") return "Not available";
  if (Array.isArray(value)) {
    return value.map((item) => formatAnalyzerValue(item)).join("; ");
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${humanizeAnalyzerKey(key)}: ${formatAnalyzerValue(item)}`)
      .join("; ");
  }
  return String(value);
}

function strategyTone(name, component = {}) {
  const explicitTone = String(component.tone || component.signal || "").toLowerCase();
  if (["bullish", "bearish", "neutral", "risk"].includes(explicitTone)) return explicitTone;
  const detail = String(component.detail || component.explanation || component.status || "").toLowerCase();
  if (["newsRisk", "volatility"].includes(name) && Number(component.score || 0) < 5) return "risk";
  if (/bearish|below|short|unfavorable|lower/.test(detail)) return "bearish";
  if (/bullish|above|long|supportive|higher/.test(detail)) return "bullish";
  return "neutral";
}

function renderStrategyBreakdown(breakdown = {}, metadata = {}) {
  const components = breakdown.components || {};
  const newsRiskMetrics = metadata.newsRiskMetrics;
  const componentOrder = [
    "trend",
    "marketStructure",
    "supportResistance",
    "liquidity",
    "momentum",
    "volume",
    "volatility",
    "newsRisk",
    "riskReward",
    "marketSpecific"
  ];
  const componentRows = componentOrder
    .filter((name) => components[name])
    .map((name) => {
      const component = components[name];
      const tone = strategyTone(name, component);
      
      if (name === "newsRisk" && newsRiskMetrics) {
        const rLevel = (newsRiskMetrics.level || "normal").toLowerCase();
        let badgeColor = "green";
        if (rLevel === "medium") badgeColor = "yellow";
        if (rLevel === "high") badgeColor = "orange";
        if (rLevel === "extreme") badgeColor = "flashing-crimson";
        
        let eventsHtml = "";
        const drawEvents = (title, events) => {
          if (!events || !events.length) return "";
          return `
            <div class="event-group">
              <h5>${esc(title)}</h5>
              <ul>
                ${events.map(ev => `<li><strong>${esc(ev.title)}</strong> (${esc(ev.country || "Global")}) - <span class="event-importance ${esc(ev.importance)}">${esc(ev.importance)}</span></li>`).join("")}
              </ul>
            </div>
          `;
        };
        
        if (newsRiskMetrics.activeEvents?.length || newsRiskMetrics.upcomingEvents?.length) {
          eventsHtml += drawEvents("Active Risk Window", newsRiskMetrics.activeEvents);
          eventsHtml += drawEvents("Upcoming (24h)", newsRiskMetrics.upcomingEvents);
        }
        
        let dataStatusHtml = "";
        if (newsRiskMetrics.dataStatus === "static-calendar") {
          dataStatusHtml = `<p class="data-status-warning">Static event-risk rules active. Live economic calendar API not connected yet.</p>`;
        }

        return `
          <div class="strategy-item news-risk-card">
            <div class="strategy-item-head">
              <strong>News & Macro Risk</strong>
              <span class="strategy-status badge-${badgeColor}">${esc(newsRiskMetrics.level.toUpperCase())}</span>
            </div>
            <div class="strategy-item-copy">
              <p>${esc(newsRiskMetrics.explanation)}</p>
              ${eventsHtml}
              ${dataStatusHtml}
            </div>
          </div>
        `;
      }

      return `
        <div class="strategy-item">
          <div class="strategy-item-head">
            <strong>${esc(humanizeAnalyzerKey(name))}</strong>
            <span class="strategy-status ${tone}">${esc(component.signal || component.status || tone)}</span>
          </div>
          <div class="strategy-score"><i class="bg-${tone}" style="width:${Math.max(0, Math.min(100, Number(component.score || 0) * 10))}%"></i></div>
          <div class="strategy-item-copy"><span>${Number(component.score || 0)}/10</span><p>${esc(component.detail || component.explanation || "No additional confirmation")}</p></div>
        </div>
      `;
    }).join("");
  const researchEntries = Object.entries(breakdown.research || {});
  const snapshotEntries = Object.entries(breakdown.technicalSnapshot || {});
  return `
    <section class="strategy-breakdown" aria-label="Strategy breakdown">
      <div class="strategy-section-head">
        <div><span>Strategy breakdown</span><h4>Why This Result?</h4><p>Ten independent checks explain what supports the result and what holds it back.</p></div>
        <strong>${esc(humanizeAnalyzerKey(breakdown.setupQuality || "research"))}</strong>
      </div>
      <div class="strategy-grid">${componentRows}</div>
      ${breakdown.newsCalendar ? `
        <div class="strategy-news-calendar">
          <div class="news-calendar-header">
            <strong>Calendar & Events</strong>
            ${breakdown.newsCalendar.dataStatus === 'static-calendar' ? '<span class="status-badge warning">Static Mock Data</span>' : '<span class="status-badge live">Live Calendar Data</span>'}
          </div>
          <p>${esc(breakdown.newsCalendar.explanation)}</p>
          ${breakdown.newsCalendar.activeEvents?.length ? `
            <div class="event-group active">
              <h5>Active Risk Window</h5>
              <ul>
                ${breakdown.newsCalendar.activeEvents.map(ev => `<li><strong>${esc(ev.title)}</strong> <span class="event-importance ${esc(ev.importance)}">${esc(ev.importance)}</span><br><small>${esc(ev.relevanceReason)}</small></li>`).join("")}
              </ul>
            </div>
          ` : ''}
          ${breakdown.newsCalendar.upcomingEvents?.length ? `
            <div class="event-group upcoming">
              <h5>Upcoming (24h)</h5>
              <ul>
                ${breakdown.newsCalendar.upcomingEvents.map(ev => `<li><strong>${esc(ev.title)}</strong> <span class="event-importance ${esc(ev.importance)}">${esc(ev.importance)}</span><br><small>${esc(ev.relevanceReason)}</small></li>`).join("")}
              </ul>
            </div>
          ` : ''}
        </div>
      ` : ""}
      ${(breakdown.strategies || []).length ? `
        <div class="strategy-checklist">
          <strong>Models reviewed</strong>
          <ul>${breakdown.strategies.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
        </div>
      ` : ""}
      ${snapshotEntries.length ? `
        <div class="market-detail-grid analyzer-snapshot-grid">
          ${snapshotEntries.map(([key, value]) => `<div><span>${esc(humanizeAnalyzerKey(key))}</span><p>${esc(formatAnalyzerValue(value))}</p></div>`).join("")}
        </div>
      ` : ""}
      ${researchEntries.length ? `
        <div class="market-detail-grid analyzer-research-grid">
          ${researchEntries.map(([key, value]) => `<div><span>${esc(humanizeAnalyzerKey(key))}</span><p>${esc(formatAnalyzerValue(value))}</p></div>`).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderStockResearchSummary(result) {
  const research = result.strategyBreakdown?.research || {};
  const thesis = research.thesis || result.explanation || "A research framework for evaluating quality, valuation, and market regime.";
  const portfolioRole = research.portfolioRole || `Potential ${humanizeAnalyzerKey(result.mode || "long-term").toLowerCase()} research candidate; position size should reflect diversification and personal risk tolerance.`;
  const riskFactors = research.riskFactors || result.highRiskWarning || "Company, sector, valuation, rate, and broad-market risks can change the thesis.";
  const dcaApproach = research.dcaIdea || research.dcaApproach || "Consider staged purchases over time only after independent fundamental research. DCA reduces timing pressure but does not prevent losses.";
  return `
    <section class="stock-research-summary" aria-label="Long-term stock research summary">
      <div class="research-summary-head">
        <div><span>Investment research</span><h4>Long-Term Research View</h4></div>
        <strong>Not a day-trade signal</strong>
      </div>
      <div class="research-summary-grid">
        <div><span>Thesis</span><p>${esc(formatAnalyzerValue(thesis))}</p></div>
        <div><span>Portfolio Role</span><p>${esc(formatAnalyzerValue(portfolioRole))}</p></div>
        <div><span>Risk Factors</span><p>${esc(formatAnalyzerValue(riskFactors))}</p></div>
        <div><span>DCA / Long-Term Approach</span><p>${esc(formatAnalyzerValue(dcaApproach))}</p></div>
      </div>
    </section>
  `;
}

function renderAnalyzerError(error) {
  const status = Number(error?.status || 0);
  const messages = {
    400: "The analyzer could not validate these selections. Review the market, asset, mode, and timeframe.",
    401: "Your session has expired. Log in again to use protected analysis.",
    402: "Market Hub Pro access is required for protected analysis.",
    403: "Your account does not currently have permission to use this analyzer.",
    500: "The protected analyzer is temporarily unavailable. Please try again shortly."
  };
  const action = status === 401
    ? `<a href="/login" data-link class="btn primary small">Log In</a>`
    : [402, 403].includes(status)
      ? `<a href="/products" data-link class="btn primary small">View Market Hub Pro</a>`
      : "";
  return `
    <div class="hub-error-state" role="alert">
      <span>Analysis unavailable</span>
      <strong>${esc(messages[status] || "The protected analyzer could not be reached.")}</strong>
      <p>${esc(error?.message || "Please try again.")}</p>
      ${action}
    </div>
  `;
}

function renderAnalyzerResult(result) {
  if (state.marketHub.loading) {
    return `
      <div class="hub-loading-state" role="status" aria-live="polite">
        <i></i>
        <strong>Running protected analysis</strong>
        <span>Scoring market structure, liquidity, momentum, volatility, and risk controls.</span>
      </div>
    `;
  }
  if (state.marketHub.error && !result) return renderAnalyzerError(state.marketHub.error);
  if (!result) {
    return `
      <div class="hub-empty-state">
        <strong>Run an analyzer to build a scenario.</strong>
        <span>Select market, style, and timeframe. Protected Analyzer V2 uses server-side demo data until a live provider is connected.</span>
      </div>
    `;
  }
  const status = result.signalStatus || "neutral";
  const noSignal = status === "noSignal";
  const highRisk = status === "highRisk";
  const researchMode = result.market === "stocks" && !["dayTrading", "swingTrading"].includes(result.mode);
  const source = result._analysisSource || "backend";
  const dataStatus = result.dataStatus || { status: result.isDemo ? "demo" : "live", message: "Market data status unavailable" };
  const riskValue = String(result.riskLevel || "medium").toLowerCase();
  const disclaimer = result.metadata?.educationalDisclaimer || "Educational market analysis only, not financial advice. No result guarantees profit.";
  const confidence = analyzerConfidenceBand(result.confidenceScore);
  const tradeLevelsSuppressed = !researchMode && (!result.entryZone || result.stopLoss === null || result.stopLoss === undefined || !result.takeProfits?.length);
  return `
    <div class="analyzer-result ${noSignal ? "no-signal" : ""} ${highRisk ? "high-risk-result" : ""} ${researchMode ? "research-result" : ""}">
      <div class="result-topline">
        <div>
          <div class="analysis-badge-row">
            <span class="analysis-source-badge ${source}">${source === "backend" ? "Protected Backend Analysis" : "Browser Fallback Demo"}</span>
            <span class="data-status-badge ${esc(dataStatus.status || "demo")}">${esc(dataStatus.status || "demo")} data</span>
          </div>
          <h3 class="h3">${esc(result.asset || "Market")} ${esc(humanizeAnalyzerKey(result.market || result.marketType || ""))}</h3>
          <p class="result-context">${esc(humanizeAnalyzerKey(result.mode || "analysis"))} · ${esc(result.timeframe || "Timeframe unavailable")} · Updated ${esc(formatDateTime(result.lastUpdated))}</p>
        </div>
        <div class="hero-actions small-actions">
          <button class="btn secondary small" onclick="addToWatchlist('${esc(result.asset)}', '${esc(result.market)}')">Watch</button>
          <div class="signal-badge ${signalClass(status)}">${esc(analyzerSignalLabel(status))}</div>
        </div>
      </div>
      ${result.chartData ? renderAiChart(result.chartData) : ""}
      ${source === "fallback" ? `<div class="fallback-warning">Protected backend analysis was unavailable. This is a browser-generated fallback demo and must not be treated as a live signal.</div>` : ""}
      ${noSignal ? `
        <div class="no-signal-panel">
          <strong>No high-quality setup right now.</strong>
          <span>The best trade is sometimes no trade.</span>
          <div><b>What to wait for</b><p>${esc(result.noSignalReason || "Wait for price to confirm a key level, structure to improve, volume to support the move, and projected risk/reward to reach at least 1:2.")}</p></div>
        </div>
      ` : ""}
      ${highRisk ? `
        <div class="high-risk-panel">
          <strong>High-risk market conditions detected.</strong>
          <span>Avoid impulsive trades and wait for volatility to stabilize.</span>
          <div><b>Why high risk?</b><p>${esc(result.highRiskWarning || "The volatility or news-risk filter is extreme. That can widen spreads, increase slippage, and invalidate technical levels without warning.")}</p></div>
        </div>
      ` : ""}
      ${result.noSignalReason && !noSignal ? `<div class="analysis-reason"><strong>Model decision</strong><p>${esc(result.noSignalReason)}</p></div>` : ""}
      ${result.highRiskWarning && !highRisk ? `<div class="analysis-warning"><strong>Risk warning</strong><p>${esc(result.highRiskWarning)}</p></div>` : ""}
      <div class="result-grid">
        <div class="result-tile"><span>Market Bias</span><strong>${esc(humanizeAnalyzerKey(result.marketBias || "neutral"))}</strong></div>
        ${researchMode ? `<div class="result-tile"><span>Analysis Type</span><strong>Research View</strong><small>No short-term trade levels</small></div>` : `<div class="result-tile"><span>Entry Zone</span><strong>${esc(formatAnalyzerEntryZone(result.entryZone))}</strong></div>`}
        ${researchMode ? "" : `<div class="result-tile"><span>Stop Loss</span><strong>${esc(result.stopLoss ?? "Not issued")}</strong></div>`}
        <div class="result-tile"><span>Risk / Reward</span><strong>${esc(result.riskReward ?? "Not applicable")}</strong></div>
        <div class="result-tile"><span>Risk Level</span><strong class="risk-${esc(riskValue)}">${esc(humanizeAnalyzerKey(riskValue))}</strong></div>
      </div>
      <div class="confidence-card">
        <div><span>Confidence Score</span><strong>${Number(result.confidenceScore || 0)}%</strong></div>
        ${meter(result.confidenceScore, ["high", "extreme"].includes(riskValue) ? "risk" : "")}
        <div class="confidence-band-copy ${confidence.className}"><strong>${esc(confidence.label)}</strong><span>${esc(confidence.detail)}</span></div>
        <div class="confidence-scale" aria-label="Confidence score bands">
          <span class="no-setup">0-39<small>No Setup</small></span>
          <span class="weak">40-59<small>Weak / Wait</small></span>
          <span class="moderate">60-74<small>Moderate</small></span>
          <span class="strong">75-89<small>Strong</small></span>
          <span class="very-strong">90-100<small>Very Strong</small></span>
        </div>
      </div>
      ${result.takeProfits?.length ? `
        <div class="tp-stack">
          ${result.takeProfits.map((tp) => `<div><span>${esc(tp.level || tp.label)}</span><strong>${esc(tp.price)}</strong><small>${tp.riskMultiple ? `${esc(tp.riskMultiple)}R target` : esc(tp.note || "Target level")}</small></div>`).join("")}
        </div>
      ` : ""}
      ${tradeLevelsSuppressed ? `
        <div class="risk-reward-gate">
          <div><span>Risk filter</span><strong>Trade levels withheld</strong></div>
          <p>Market Hub rejects scenarios below the minimum 1:2 risk/reward requirement. Wait for a cleaner entry, a better invalidation level, or stronger confirmation instead of forcing a trade.</p>
        </div>
      ` : ""}
      ${researchMode ? renderStockResearchSummary(result) : ""}
      ${renderStrategyBreakdown(result.strategyBreakdown || {}, result.metadata || {})}
      <div class="result-explain">
        <div class="explanation-copy"><strong>Explanation</strong><p>${esc(result.explanation || "Educational research framework.")}</p></div>
        <div class="invalidation-card"><span>Invalidation Rule</span><strong>${esc(result.invalidationRule || "If the thesis breaks, stand aside and wait for a new setup.")}</strong><small>A disciplined plan defines what proves the idea wrong before any position is considered.</small></div>
        <div class="data-status-note">
          <div><strong>${esc(dataStatus.provider || "Market data provider")}</strong><small>${esc(String(dataStatus.status || "demo").toUpperCase())} STATUS</small></div>
          <span>${esc(dataStatus.message || "Data status unavailable")} Demo means the interface uses educational market scenarios. Live means a backend provider supplied current market data.</span>
        </div>
        <small class="educational-disclaimer">${esc(disclaimer)}</small>
      </div>
    </div>
  `;
}

function renderCryptoAnalyzer() {
  const service = marketHubService();
  const form = state.marketHub.forms.crypto;
  return `
    <div class="hub-workspace">
      <form class="hub-control-panel" onsubmit="return submitCryptoAnalyzer(event)">
        <span class="demo-label">Protected Analyzer V2 · Demo Data</span>
        <h2 class="h3">Crypto Analyzer</h2>
        <p class="muted">Server-side confluence analysis for top crypto assets. Results remain educational demo scenarios until a live data provider is connected.</p>
        <div class="form-grid">
          <div class="field"><label>Asset</label><select name="asset">${selectedOptionTags(service.cryptoAssets || [], form.asset)}</select></div>
          <div class="field"><label>Trading Style</label><select name="style">${selectedOptionTags(["Scalping", "Day Trading", "Swing Trading", "Long-Term Investment"], form.style)}</select></div>
          <div class="field"><label>Timeframe</label><select name="timeframe">${selectedOptionTags(["5m", "15m", "1H", "4H", "1D", "1W"], form.timeframe)}</select></div>
        </div>
        <button class="btn primary" type="submit" ${state.marketHub.loading ? `disabled aria-busy="true"` : ""}>${state.marketHub.loading ? "Analyzing..." : "Analyze Crypto"}</button>
      </form>
      <div class="hub-right-column">
        <div id="tv-advanced-chart" style="height: 250px; width: 100%; margin-bottom: 24px; border-radius: 8px; overflow: hidden; background: #050505;"></div>
        ${renderAnalyzerResult(state.marketHub.result)}
      </div>
    </div>
  `;
}

function renderForexAnalyzer() {
  const service = marketHubService();
  const form = state.marketHub.forms.forex;
  return `
    <div class="hub-workspace">
      <form class="hub-control-panel" onsubmit="return submitForexAnalyzer(event)">
        <span class="demo-label">Protected Analyzer V2 · Demo Data</span>
        <h2 class="h3">Forex Analyzer</h2>
        <p class="muted">Read bias, key levels, liquidity zones, session context, dollar strength, and news-risk placeholders.</p>
        <div class="form-grid">
          <div class="field"><label>Pair</label><select name="pair">${selectedOptionTags(service.forexPairs || [], form.pair)}</select></div>
          <div class="field"><label>Trading Style</label><select name="style">${selectedOptionTags(["Day Trading", "Swing Trading", "Long-Term Macro View"], form.style)}</select></div>
          <div class="field"><label>Timeframe</label><select name="timeframe">${selectedOptionTags(["15m", "1H", "4H", "1D", "1W"], form.timeframe)}</select></div>
        </div>
        <button class="btn primary" type="submit" ${state.marketHub.loading ? `disabled aria-busy="true"` : ""}>${state.marketHub.loading ? "Analyzing..." : "Analyze Forex"}</button>
      </form>
      <div class="hub-right-column">
        <div id="tv-advanced-chart" style="height: 250px; width: 100%; margin-bottom: 24px; border-radius: 8px; overflow: hidden; background: #050505;"></div>
        ${renderAnalyzerResult(state.marketHub.result)}
      </div>
    </div>
  `;
}

function renderCommoditiesAnalyzer() {
  const service = marketHubService();
  const form = state.marketHub.forms.commodities;
  return `
    <div class="hub-workspace">
      <form class="hub-control-panel" onsubmit="return submitCommodityAnalyzer(event)">
        <span class="demo-label">Protected Analyzer V2 · Demo Data</span>
        <h2 class="h3">Gold & Commodities Analyzer</h2>
        <p class="muted">Focus on trend, volatility, key levels, macro/news risk, and long/short scenario quality.</p>
        <div class="form-grid">
          <div class="field"><label>Asset</label><select name="asset">${selectedOptionTags(service.commodityAssets || [], form.asset)}</select></div>
          <div class="field"><label>Trading Style</label><select name="style">${selectedOptionTags(["Day Trading", "Swing Trading", "Long-Term Macro View"], form.style)}</select></div>
          <div class="field"><label>Timeframe</label><select name="timeframe">${selectedOptionTags(["15m", "1H", "4H", "1D", "1W"], form.timeframe)}</select></div>
        </div>
        <button class="btn primary" type="submit" ${state.marketHub.loading ? `disabled aria-busy="true"` : ""}>${state.marketHub.loading ? "Analyzing..." : "Analyze Gold / Commodity"}</button>
      </form>
      <div class="hub-right-column">
        <div id="tv-advanced-chart" style="height: 250px; width: 100%; margin-bottom: 24px; border-radius: 8px; overflow: hidden; background: #050505;"></div>
        ${renderAnalyzerResult(state.marketHub.result)}
      </div>
    </div>
  `;
}

function stockAnalyzerOptionsForMode(mode) {
  const optionMap = {
    "Day Trading": ["Relative Strength", "Opening Range", "High Relative Volume"],
    "Swing Trading": ["Trend Continuation", "Breakout", "Mean Reversion"],
    "Long-Term Investment": ["Quality", "Value", "Growth", "Dividend", "DCA"],
    "Market Summary": ["US Market", "Risk-On / Risk-Off", "Macro Watch"],
    "Sector Analysis": ["Technology", "Energy", "Financials", "Healthcare", "Consumer", "AI-related stocks", "Defensive stocks"]
  };
  return optionMap[mode] || optionMap["Market Summary"];
}

function renderStockAnalyzer() {
  const form = state.marketHub.forms.stocks;
  const stockModes = ["Day Trading", "Swing Trading", "Long-Term Investment", "Market Summary", "Sector Analysis"];
  const options = stockAnalyzerOptionsForMode(form.mode);
  const result = state.marketHub.stockResult;
  return `
    <div class="hub-workspace">
      <form class="hub-control-panel" onsubmit="return submitStockAnalyzer(event)">
        <span class="demo-label">Protected Analyzer V2 · Demo Data</span>
        <h2 class="h3">Stock Market Analyzer</h2>
        <p class="muted">Trading modes provide structured levels. Investment, market, and sector modes remain research-only without short-term trade targets.</p>
        <div class="form-grid">
          <div class="field"><label>Asset</label><select name="asset">${selectedOptionTags(["SPY", "QQQ", "DIA", "AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA"], form.asset)}</select></div>
          <div class="field"><label>Mode</label><select name="mode" data-stock-mode>${selectedOptionTags(stockModes, form.mode)}</select></div>
          <div class="field"><label>Research Focus</label><select name="selectedOption">${selectedOptionTags(options, form.selectedOption)}</select></div>
          <div class="field"><label>Timeframe</label><select name="timeframe">${selectedOptionTags(["15m", "1H", "4H", "1D", "1W"], form.timeframe)}</select></div>
        </div>
        <button class="btn primary" type="submit" ${state.marketHub.loading ? `disabled aria-busy="true"` : ""}>${state.marketHub.loading ? "Analyzing..." : "Analyze Stock Market"}</button>
      </form>
      <div class="hub-right-column">
        <div id="tv-advanced-chart" style="height: 250px; width: 100%; margin-bottom: 24px; border-radius: 8px; overflow: hidden; background: #050505;"></div>
        ${renderAnalyzerResult(result)}
      </div>
    </div>
  `;
}

function renderEducationHub() {
  const lessons = [
    {
      title: "What is Market Hub?",
      summary: "Market Hub brings the arbitrage scanner and educational analysis for crypto, forex, gold, stocks, and commodities into one protected workspace.",
      meaning: "It compares several strategy checks, scores their agreement, applies risk filters, and explains the result in plain language.",
      use: "Choose a market, asset, trading style, and timeframe. Read the data badge first, then review the result and every risk warning.",
      risks: "A dashboard cannot predict the future. Demo analysis is not current market data, and live data still cannot guarantee an outcome.",
      points: ["Start with the market and timeframe you understand", "Read the full strategy breakdown", "Treat No Signal as a valid result"]
    },
    {
      title: "What is Arbitrage?",
      summary: "Arbitrage looks for the same asset trading at different prices on different exchanges: buy at the lower price and sell at the higher price.",
      meaning: "The visible spread is only the starting point. Fees, withdrawal limits, transfer time, slippage, and available liquidity determine whether an opportunity is practical.",
      use: "Compare net spread, exchange status, pair liquidity, and execution limits before making any independent decision.",
      risks: "Prices can converge before a transfer completes. Network delays, frozen withdrawals, low liquidity, and exchange risk can remove the spread.",
      points: ["Calculate all trading and transfer fees", "Check both order books, not only the last price", "Never assume a displayed spread is guaranteed profit"]
    },
    {
      title: "What is Day Trading?",
      summary: "Day trading opens and closes short-term positions within the same trading day, often using intraday structure and session momentum.",
      meaning: "Decisions happen quickly, so a written entry, stop loss, invalidation rule, and maximum risk are essential before considering a trade.",
      use: "Use 15m or 1H analysis, check session and news risk, and wait for price confirmation near key levels.",
      risks: "Fast markets create slippage and emotional decisions. Overtrading, high leverage, and moving a stop loss are common beginner mistakes.",
      points: ["No Signal is normal", "Use a predefined stop loss", "Stop trading after reaching your daily loss limit"]
    },
    {
      title: "What is Swing Trading?",
      summary: "Swing trading holds a position for several days or weeks to capture a larger move between important market levels.",
      meaning: "The focus is usually 4H and 1D structure, trend direction, support and resistance, momentum, and room for at least 1:2 risk/reward.",
      use: "Build the idea from the higher timeframe, then use the lower timeframe only to refine confirmation and invalidation.",
      risks: "Overnight gaps, weekend moves, funding costs, and unexpected news can change the setup while the market is closed or thin.",
      points: ["Respect the higher-timeframe trend", "Size for a wider stop", "Do not turn a failed swing trade into a long-term hold"]
    },
    {
      title: "What is Long-Term Investing?",
      summary: "Long-term investing builds a diversified portfolio around business quality, valuation, risk, and a multi-year time horizon.",
      meaning: "DCA spreads purchases over time. Diversification reduces dependence on one company or sector, but neither technique removes the possibility of loss.",
      use: "Use stock research mode for thesis, portfolio role, risk factors, and a possible DCA framework instead of a day-trade entry.",
      risks: "Weak fundamentals, excessive valuation, concentration, changing rates, and emotional selling can damage long-term results.",
      points: ["Research the asset independently", "Diversify by sector and risk", "Review the thesis, not every price tick"]
    },
    {
      title: "How to Read Analyzer Signals",
      summary: "The result is a structured educational scenario, not an instruction to buy or sell.",
      meaning: "Long and Short describe directional bias. No Signal means quality is insufficient. High Risk means volatility or news conditions override the technical setup.",
      use: "Start with signal status and risk level, then review confidence, entry zone, stop loss, take profits, invalidation, and every strategy score.",
      risks: "A high confidence score describes model agreement, not the probability of profit. Ignoring invalidation or risk level defeats the purpose of the analysis.",
      points: ["Confidence measures confluence, not certainty", "Entry Zone is an area, not an automatic order", "Invalidation explains what proves the idea wrong", "Strategy Breakdown shows bullish, bearish, neutral, and risk factors"]
    },
    {
      title: "How to Use Risk Management",
      summary: "Risk management decides how much can be lost before thinking about how much might be gained.",
      meaning: "Risk only 1-2% of account value per trade, use a logical stop loss, avoid excessive leverage, and reject weak risk/reward.",
      use: "Define position risk, invalidation, and maximum daily loss before considering an entry. Step away after emotional or revenge-trading impulses.",
      risks: "Leverage magnifies small price moves. Major news can jump over stops, widen spreads, and invalidate an otherwise reasonable setup.",
      points: ["Never widen a stop to avoid a loss", "Avoid revenge trading", "Respect no-signal and high-risk states", "Do not trade major news you do not understand"]
    },
    {
      title: "Demo Data vs Live Data",
      summary: "Demo data powers the interface and educational scoring logic until a live market provider is connected for that market.",
      meaning: "A Demo badge means prices and scenarios are simulated. A Live badge will mean current data came through the protected backend, with its source and update time shown.",
      use: "Always check the data-status badge and Last Updated time before reading any result. Live providers will be added market by market later.",
      risks: "Demo values must never be treated as current prices. Even live feeds can be delayed, unavailable, or different from a broker's executable price.",
      points: ["Demo is for learning and interface testing", "Live data still needs risk controls", "Never compare stale analysis with a current chart"]
    }
  ];
  return `
    <div class="education-hub">
      <header class="education-header">
        <div><span>Market Hub Mini Course</span><h2>Learn the tools before using the tools.</h2></div>
        <p>Eight short lessons explain what each analysis mode means, when it can help, and where beginners most often take unnecessary risk.</p>
      </header>
      <div class="lesson-grid">
        ${lessons.map((lesson, index) => `
          <article class="lesson-card">
            <div class="lesson-card-head"><span>${String(index + 1).padStart(2, "0")}</span><small>Lesson ${index + 1} of ${lessons.length}</small></div>
            <h3>${esc(lesson.title)}</h3>
            <p class="lesson-summary">${esc(lesson.summary)}</p>
            <div class="lesson-section"><strong>What it means</strong><p>${esc(lesson.meaning)}</p></div>
            <div class="lesson-section"><strong>How to use it</strong><p>${esc(lesson.use)}</p></div>
            <div class="lesson-section risk"><strong>Risks to understand</strong><p>${esc(lesson.risks)}</p></div>
            <div class="lesson-takeaways"><strong>Beginner checklist</strong><ul>${lesson.points.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function renderRiskGuide() {
  const riskSections = [
    ["Why no signal can be the best signal", "Standing aside protects capital when structure is unclear, confirmation is missing, or risk/reward is weak. Activity is not the same as opportunity."],
    ["Why leverage is dangerous", "Leverage magnifies both gains and losses. A small move can trigger liquidation or a loss larger than expected, especially when volatility and spreads expand."],
    ["Why news events are high risk", "CPI, FOMC, NFP, earnings, and unexpected headlines can create gaps, slippage, and violent reversals. Technical levels may fail without warning."],
    ["Why risk/reward below 1:2 is rejected", "Risking one unit to make less than two leaves little room for normal losing trades. Market Hub withholds trade levels when the projected reward does not justify the risk."],
    ["Why crypto, forex, and futures are high risk", "These markets can trade around the clock, use leverage, and move quickly when liquidity changes. Futures and some forex products can create losses beyond a simple spot position."],
    ["Why the analyzer is not a guarantee", "The score measures agreement between model components. It cannot predict news, execution quality, slippage, or human behavior, and it never promises profit."],
    ["Why users should journal trades", "Record the setup, screenshot, risk, emotions, result, and whether rules were followed. A journal reveals repeated mistakes more clearly than memory does."]
  ];
  return `
    <div class="risk-command-center">
      <div class="risk-warning-card">
        <span>Capital Protection First</span>
        <h2 class="h2">Professional traders survive before they optimize.</h2>
        <p>Market Hub is designed for education, planning, and disciplined scenario building. It must never be treated as guaranteed profit or automatic execution.</p>
      </div>
      <div class="risk-foundation-strip" aria-label="Core risk limits">
        <div><strong>1-2%</strong><span>Maximum account risk per trade</span></div>
        <div><strong>1:2</strong><span>Minimum planned risk/reward</span></div>
        <div><strong>Stop</strong><span>Every trade needs invalidation</span></div>
        <div><strong>Pause</strong><span>No revenge trading after a loss</span></div>
      </div>
      <div class="risk-rule-grid">
        ${riskSections.map(([title, copy], index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><strong>${esc(title)}</strong><p>${esc(copy)}</p></div>`).join("")}
      </div>
      <div class="result-explain high-risk-note">
        <strong>Non-negotiable risk rules</strong>
        <p>This is educational market analysis, not financial advice. No signal is guaranteed. Always use a stop loss, avoid high leverage, and do not trade major news unless you understand the risk. Past performance does not guarantee future results.</p>
      </div>
    </div>
  `;
}

function renderArbitrageScanner() {
  const scanner = state.scanner;
  const filters = scanner.filters;
  const exchanges = scanner.exchanges.length ? scanner.exchanges : [
    { id: "binance", name: "Binance", status: "loading", pairs: 0 },
    { id: "bybit", name: "Bybit", status: "loading", pairs: 0 },
    { id: "okx", name: "OKX", status: "loading", pairs: 0 },
    { id: "kucoin", name: "KuCoin", status: "loading", pairs: 0 },
    { id: "gate", name: "Gate.io", status: "loading", pairs: 0 },
    { id: "mexc", name: "MEXC", status: "loading", pairs: 0 },
    { id: "bitget", name: "Bitget", status: "loading", pairs: 0 }
  ];
  return `
    <div class="scanner-shell">
        <div class="scanner-hero">
          <div>
            <div class="eyebrow">Bull & Bear Arbitrage Scanner</div>
            <h1 class="h2" style="margin-top:12px;">Real-Time Crypto Arbitrage Scanner</h1>
            <p class="lead">Live spot-market spreads from Binance, Bybit, OKX, KuCoin, Gate.io, MEXC, and Bitget. Filter opportunities by spread, volume, risk, exchange, coin, network, and transfer speed.</p>
            <div class="hero-actions">
              <button class="btn primary" data-refresh-scanner>${scanner.loading ? "Scanning..." : "Refresh Scanner"}</button>
              <a href="/products" data-link class="btn secondary">View Subscription Plans</a>
            </div>
          </div>
          <div class="scanner-status-card">
            <span>Live Data</span>
            <strong>${scanner.opportunities.length}</strong>
            <small>opportunities shown</small>
            <small>Updated: ${scanner.lastUpdated ? new Date(scanner.lastUpdated).toLocaleTimeString() : "loading..."}</small>
          </div>
        </div>

        <div class="exchange-strip">
          ${exchanges.map((exchange) => `
            <div class="exchange-chip ${exchange.status === "online" ? "online" : exchange.status === "error" ? "error" : ""}">
              <strong>${esc(exchange.name)}</strong>
              <span>${esc(exchange.status || "loading")} ${exchange.pairs ? `/ ${exchange.pairs} pairs` : ""}</span>
            </div>
          `).join("")}
        </div>

        <form class="scanner-filters" data-scanner-form>
          <div class="field">
            <label>Min Spread %</label>
            <input type="number" step="0.01" min="0" name="minSpread" value="${esc(filters.minSpread)}" data-scanner-filter>
          </div>
          <div class="field">
            <label>Exchange</label>
            <select name="exchange" data-scanner-filter>
              <option value="all">All exchanges</option>
              ${["binance", "bybit", "okx", "kucoin", "gate", "mexc", "bitget"].map((id) => `<option value="${id}" ${filters.exchange === id ? "selected" : ""}>${id.toUpperCase()}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Coin</label>
            <input name="coin" placeholder="BTC, ETH, SOL" value="${esc(filters.coin)}" data-scanner-filter>
          </div>
          <div class="field">
            <label>Market</label>
            <select name="marketType" data-scanner-filter>
              <option value="spot" ${filters.marketType === "spot" ? "selected" : ""}>Spot</option>
              <option value="all" ${filters.marketType === "all" ? "selected" : ""}>Spot + Futures</option>
            </select>
          </div>
          <div class="field">
            <label>Min Volume</label>
            <input type="number" step="1000" min="0" name="minVolume" value="${esc(filters.minVolume)}" data-scanner-filter>
          </div>
          <div class="field">
            <label>Risk</label>
            <select name="risk" data-scanner-filter>
              ${["all", "low", "medium", "high"].map((item) => `<option value="${item}" ${filters.risk === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Network</label>
            <select name="network" data-scanner-filter>
              <option value="all" ${filters.network === "all" ? "selected" : ""}>All networks</option>
              <option value="bitcoin" ${filters.network === "bitcoin" ? "selected" : ""}>Bitcoin</option>
              <option value="ethereum" ${filters.network === "ethereum" ? "selected" : ""}>Ethereum</option>
              <option value="fast" ${filters.network === "fast" ? "selected" : ""}>Fast L1</option>
              <option value="exchange" ${filters.network === "exchange" ? "selected" : ""}>Exchange Network</option>
            </select>
          </div>
          <div class="field">
            <label>Transfer Speed</label>
            <select name="transferSpeed" data-scanner-filter>
              ${["all", "fast", "medium"].map((item) => `<option value="${item}" ${filters.transferSpeed === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Sort</label>
            <select name="sort" data-scanner-filter>
              <option value="highest-spread" ${filters.sort === "highest-spread" ? "selected" : ""}>Highest spread</option>
              <option value="most-volume" ${filters.sort === "most-volume" ? "selected" : ""}>Most volume</option>
              <option value="lowest-risk" ${filters.sort === "lowest-risk" ? "selected" : ""}>Lowest risk</option>
              <option value="newest" ${filters.sort === "newest" ? "selected" : ""}>Newest</option>
            </select>
          </div>
          <label class="checkbox-row scanner-checkbox">
            <input type="checkbox" name="stableOnly" ${filters.stableOnly ? "checked" : ""} data-scanner-filter>
            Stablecoin quotes only
          </label>
        </form>

        ${scanner.error ? `<div class="status err">${esc(scanner.error)}</div>` : ""}

        <div class="scanner-table">
          <div class="scanner-row scanner-row-head">
            <span>Pair</span><span>Route</span><span>Prices</span><span>Spread</span><span>Profit</span><span>Volume</span><span>Fees / Time</span><span>Risk</span>
          </div>
          ${scanner.opportunities.length ? scanner.opportunities.map((item) => `
            <div class="scanner-row ${item.status === "profitable" ? "profitable" : "not-profitable"} ${item.premium ? "premium" : ""}">
              <span><strong>${esc(item.coin)}</strong><small>${esc(item.quote)} / ${esc(item.marketType)}${item.premium ? " / premium" : ""}</small></span>
              <span><strong>${esc(item.buyExchange)} -> ${esc(item.sellExchange)}</strong><small>${new Date(item.timestamp).toLocaleTimeString()}</small></span>
              <span><strong>${fmtPrice(item.buyPrice)} -> ${fmtPrice(item.sellPrice)}</strong><small>buy / sell</small></span>
              <span><strong>${item.netSpreadPct.toFixed(2)}%</strong><small>gross ${item.spreadPct.toFixed(2)}%</small></span>
              <span><strong class="${item.estimatedProfit > 0 ? "up" : "down"}">${compactMoney(item.estimatedProfit)}</strong><small>per $1,000</small></span>
              <span><strong>${compactMoney(item.volume24h)}</strong><small>24h volume</small></span>
              <span><strong>${compactMoney(item.networkFeeUsd)}</strong><small>${esc(item.network)} / ~${item.transferMinutes}m</small></span>
              <span><strong class="risk-${item.risk}">${esc(item.risk)}</strong><small>${item.status.replace("_", " ")}</small></span>
            </div>
          `).join("") : `<div class="empty">No live opportunities match these filters yet. Lower the minimum spread or volume filter.</div>`}
        </div>

        <div class="scanner-saas-grid">
          <div class="card pad">
            <h2 class="h3">Payment Ready</h2>
            <p class="muted">Checkout records, Payriff webhooks, subscription activation, cancellation, and payment logs are prepared for secure card payments.</p>
          </div>
          <div class="card pad">
            <h2 class="h3">Discord Membership</h2>
            <p class="muted">Premium plans include the structure for Discord OAuth, bot role syncing, premium role removal after expiry, and the free community invite.</p>
          </div>
          <div class="card pad">
            <h2 class="h3">Alerts</h2>
            <p class="muted">The platform is ready for browser, email, Discord, and Discord alerts when high-spread opportunities or membership events appear.</p>
          </div>
        </div>

        <div class="section-head center" style="margin-top:34px;">
          <div class="eyebrow">Pricing</div>
          <h2 class="h2">Market Hub Subscription</h2>
          <p class="lead">Activate premium access for the arbitrage scanner, analysis modules, mini-course, and risk guide.</p>
        </div>
        ${scannerPricingCards()}
      </div>
  `;
}

function renderMarketHubTab() {
  const activeTab = state.marketHub.activeTab;
  if (activeTab === "ai") return renderAiManager();
  if (activeTab === "crypto") return renderCryptoAnalyzer();
  if (activeTab === "forex") return renderForexAnalyzer();
  if (activeTab === "commodities") return renderCommoditiesAnalyzer();
  if (activeTab === "stocks") return renderStockAnalyzer();
  if (activeTab === "how-to-use") return renderEducationHub();
  if (activeTab === "risk-guide") return renderRiskGuide();
  return renderArbitrageScanner();
}

function arbitragePage() {
  if (!state.user) return scannerAccessGate(false);
  if (!isAdmin() && !state.userDashboard) return scannerAccessGate(true);
  if (!hasScannerAccess()) return scannerAccessGate(false);

  const activeTab = state.marketHub.activeTab;
  const activeMeta = hubTabs().find(([id]) => id === activeTab) || hubTabs()[0];
  return `
    <section class="section market-hub-section">
      <div class="market-hub-shell">
        <div class="market-hub-hero">
          <div>
            <span class="demo-label">Demo analysis until live market data API is connected</span>
            <h1 class="h2">Bull & Bear Market Hub</h1>
            <p class="lead">Arbitrage scanner, multi-market analyzer, strategy breakdowns, and risk education in one premium dashboard.</p>
          </div>
          <div class="hub-hero-panel">
            <span>Premium Area</span>
            <strong>${esc(activeMeta[1])}</strong>
            <small>${esc(activeMeta[2])}</small>
            <small>Educational market analysis, no guaranteed results.</small>
          </div>
        </div>
        <div class="market-hub-status-grid" aria-label="Market Hub status">
          <div><span class="status-mark protected">01</span><strong>Protected Backend Analyzer</strong><small>Authentication and Market Hub access required.</small></div>
          <div><span class="status-mark data">02</span><strong>Demo / Live Data Status</strong><small>Every result identifies its source and update time.</small></div>
          <div><span class="status-mark risk">03</span><strong>Risk-Managed Signals</strong><small>News, volatility, confidence, and 1:2 filters applied.</small></div>
          <div><span class="status-mark scanner">04</span><strong>Arbitrage Scanner Active</strong><small>Existing seven-exchange spread scanner remains available.</small></div>
        </div>
        <div class="analyzer-workflow" aria-label="How this analyzer works">
          <div class="workflow-intro"><span>How this analyzer works</span><strong>From market input to a risk-filtered result</strong></div>
          <ol>
            ${["Data", "Strategies", "Scoring", "Risk Filters", "Result"].map((step, index) => `<li><span>${index + 1}</span><strong>${step}</strong></li>`).join("")}
          </ol>
        </div>
        <div class="market-hub-disclaimer"><strong>Educational analysis only.</strong><span>Not financial advice. No signal is guaranteed, and Market Hub never places trades.</span></div>
        <div class="market-hub-tabs" role="tablist" aria-label="Market Hub sections">
          ${hubTabs().map(([id, label, desc]) => `
            <button type="button" data-market-tab="${id}" class="${activeTab === id ? "active" : ""}">
              <strong>${esc(label)}</strong>
              <span>${esc(desc)}</span>
            </button>
          `).join("")}
        </div>
        ${renderMarketHubTab()}
      </div>
    </section>
  `;
}

function aiTemplates() {
  return [
    {
      label: "Market Model",
      mode: "trader",
      question: "Build a market model for BTC, ETH, EURUSD, and XAUUSD. Include trend, confirmation signals, invalidation, and lessons I should study."
    },
    {
      label: "Investor Plan",
      mode: "investor",
      question: "Create an educational long-term investor framework for crypto and US stocks with risk controls and weekly review rules."
    },
    {
      label: "Signal Scenario",
      mode: "signal",
      question: "Create signal-style scenarios for high-probability crypto setups. Use trigger, confirmation, invalidation, and position risk notes."
    },
    {
      label: "Forex Desk",
      mode: "forex",
      question: "Analyze EURUSD, GBPUSD, and XAUUSD with session logic, support/resistance, pip risk, and news-aware rules."
    },
    {
      label: "Futures Risk",
      mode: "futures",
      question: "Build a futures plan for BTC, NAS100, and gold with leverage limits, liquidation buffer, and daily loss rules."
    },
    {
      label: "Lesson Path",
      mode: "lesson",
      question: "Recommend the best lessons and practice plan for improving technical analysis, psychology, and risk management."
    }
  ];
}

function aiFieldValue(name) {
  return esc(state.ai.form[name] || "");
}

function aiValueText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "object" ? Object.values(item).join(" - ") : item).join(", ");
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join(" | ");
  }
  return value;
}

function aiPriceText(item = {}) {
  const price = Number(item.price || 0);
  if (!price) return "Market model";
  const asset = String(item.asset || "").toUpperCase();
  const decimals = price >= 1000 ? 2 : price >= 10 ? 3 : 5;
  const formatted = price.toLocaleString(undefined, { maximumFractionDigits: decimals });
  return /^[A-Z]{6}$/.test(asset) || asset === "DXY" ? formatted : `$${formatted}`;
}

function renderAiObject(item) {
  if (!item || typeof item !== "object") return `<p>${esc(item)}</p>`;
  return `
    <div class="ai-kv">
      ${Object.entries(item).map(([key, value]) => `
        <div>
          <span>${esc(String(key).replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()))}</span>
          <strong>${esc(aiValueText(value))}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAiSection(title, items, emptyText) {
  return `
    <div class="card pad ai-result-card">
      <h3 class="h3">${esc(title)}</h3>
      <div class="ai-list">
        ${items?.length ? items.map((item) => `<article>${renderAiObject(item)}</article>`).join("") : `<div class="empty compact-empty">${esc(emptyText)}</div>`}
      </div>
    </div>
  `;
}

function renderAiChat() {
  return `
    <div class="ai-chat-card card pad">
      <div class="ai-chat-head">
        <div>
          <div class="eyebrow">AI Chat</div>
          <h2 class="h3" style="margin-top:10px;">Professional Market Assistant</h2>
        </div>
        <span>${state.ai.loading ? "thinking..." : "AI + Signals"}</span>
      </div>
      <div class="ai-chat-thread">
        ${(state.ai.messages || []).map((message) => `
          <article class="ai-message ${message.role === "user" ? "user" : "assistant"}">
            <span>${message.role === "user" ? "You" : "Bull & Bear AI"}</span>
            <p>${esc(message.text)}</p>
          </article>
        `).join("")}
        ${state.ai.loading ? `
          <article class="ai-message assistant">
            <span>Bull & Bear AI</span>
            <p>Reading market structure, scanner context, and risk model...</p>
          </article>
        ` : ""}
      </div>
    </div>
  `;
}

function renderAiMarketSnapshot(items = []) {
  if (!items.length) return "";
  return `
    <div class="ai-snapshot-grid">
      ${items.map((item) => `
        <article>
          <span>${esc(item.asset || "Asset")}</span>
          <strong>${aiPriceText(item)}</strong>
          <small>${esc(item.trend || "structure")} · RSI ${esc(item.rsi14 || "-")} · ${esc(item.changePct || "0%")}</small>
        </article>
      `).join("")}
    </div>
  `;
}

window._tvChartsToInit = [];

function renderAiChart(chartData) {
  const candles = Array.isArray(chartData?.candles) ? chartData.candles.slice(-80) : [];
  if (!candles.length) {
    return `
      <div class="card pad ai-chart-card">
        <h3 class="h3">Teaching Chart</h3>
        <div class="ai-chart-empty">Ask about BTC, ETH, SOL, or another Binance-listed USDT pair to build a teaching chart.</div>
      </div>
    `;
  }

  const containerId = "tv-chart-" + Math.random().toString(36).substr(2, 9);
  
  window._tvChartsToInit.push({
    id: containerId,
    data: chartData
  });

  return `
    <div class="card pad ai-chart-card">
      <div class="ai-chart-head">
        <div>
          <h3 class="h3">${esc(chartData.symbol || "Market")} Teaching Chart</h3>
          <p class="muted">${esc(chartData.interval || "live")} candles with support & resistance.</p>
        </div>
        <span>${esc(chartData.source || "Teaching context")}</span>
      </div>
      <div id="${containerId}" class="bb-chart-container" style="height: 250px; width: 100%; border-radius: 8px; overflow: hidden; background: #050505;"></div>
    </div>
  `;
}

window.initTradingViewCharts = function() {
  if (!window._tvChartsToInit || !window._tvChartsToInit.length) return;
  if (!window.LightweightCharts) {
    console.warn("TradingView Lightweight Charts script not loaded yet.");
    return;
  }

  const pending = window._tvChartsToInit;
  window._tvChartsToInit = []; // clear queue

  for (const item of pending) {
    const container = document.getElementById(item.id);
    if (!container) continue; // might have been unmounted
    try {
      const data = item.data;
    const candles = Array.isArray(data.candles) ? data.candles.map(c => ({
      time: Math.floor(new Date(c.time || c.timestamp).getTime() / 1000), // TV expects Unix seconds
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close)
    })).sort((a, b) => a.time - b.time) : [];

    const chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 320,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    series.setData(candles);

    if (data.support) {
      series.createPriceLine({
        price: Number(data.support),
        color: '#10b981',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Support',
      });
    }

    if (data.resistance) {
      series.createPriceLine({
        price: Number(data.resistance),
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Resistance',
      });
    }

    chart.timeScale().fitContent();
    
    // Handle resize
    const ro = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== container) { return; }
      const newRect = entries[0].contentRect;
      chart.applyOptions({ width: newRect.width, height: newRect.height });
    });
    ro.observe(container);
    } catch (e) {
      container.innerHTML = `<div style="color: #ef4444; padding: 20px; font-family: monospace;"><b>Chart Error:</b> ${e.message}<br>${e.stack}</div>`;
      console.error("TV Chart Error:", e);
    }
  }
};

function renderAiTeachingGraphics(items = []) {
  if (!items.length) return "";
  return `
    <div class="ai-teaching-grid">
      ${items.map((item) => `
        <article class="card pad ai-teaching-card">
          <span>${esc(item.type || "model")}</span>
          <h3 class="h3">${esc(item.title || "Teaching Model")}</h3>
          <div class="ai-flow">
            ${(item.steps || []).map((step) => `<strong>${esc(step)}</strong>`).join("")}
          </div>
          <p class="muted">${esc(item.note || "")}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderAiRiskCalculator(calculator) {
  if (!calculator) return "";
  return `
    <div class="card pad ai-result-card ai-risk-panel">
      <h3 class="h3">Risk Calculator</h3>
      <div class="ai-kv" style="margin-top:14px;">
        ${Object.entries(calculator).map(([key, value]) => `
          <div>
            <span>${esc(String(key).replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()))}</span>
            <strong>${esc(aiValueText(value))}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAiResult() { return ""; }

function aiAccessPanel() {
  const checking = state.user && !isAdmin() && !state.userDashboard;
  return `
    <div class="ai-paywall card pad">
      <div>
        <div class="eyebrow">${checking ? "Checking Access" : "Included With Education Bundle"}</div>
        <h2 class="h2" style="margin-top:12px;">Investor & Trader AI Tool</h2>
        <p class="lead">${checking
          ? "Loading your account access..."
          : "The AI market coach is included with Market Hub Pro. Upgrade to access."}</p>
      </div>
      
      <div class="ai-paywall-grid">
        <div><strong>Forex desk</strong><span>EURUSD, GBPUSD, XAUUSD, DXY, session logic, pip risk.</span></div>
        <div><strong>Futures risk</strong><span>Leverage, liquidation buffer, funding, daily loss limits.</span></div>
        <div><strong>Teaching charts</strong><span>Support/resistance, candle path, RSI, trend model.</span></div>
        <div><strong>Professional workflow</strong><span>Watchlist, scenarios, macro checklist, journal checklist.</span></div>
      </div>
    </div>
  `;
}
// Render basic markdown: **bold**, ## headers, - bullets, newlines
function renderMarkdown(text) {
  if (!text) return "";
  return String(text)
    // Escape HTML first (only the raw characters, not our later tags)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headers: ## Heading → <h3>
    .replace(/^###\s+(.+)$/gm, "<h4 class=\"ai-h4\">$1</h4>")
    .replace(/^##\s+(.+)$/gm, "<h3 class=\"ai-h3\">$1</h3>")
    .replace(/^#\s+(.+)$/gm, "<h2 class=\"ai-h2\">$1</h2>")
    // Bold: **text**
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Italic: *text*
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    // Bullet lists: - item
    .replace(/^[\-*]\s+(.+)$/gm, "<li>$1</li>")
    // Wrap consecutive <li> elements in a <ul>
    .replace(/(<li>.*<\/li>\n?)+/g, m => "<ul>" + m + "</ul>")
    // Horizontal rule
    .replace(/^---+$/gm, "<hr/>")
    // Inline code: `code`
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Convert double newlines to paragraph breaks
    .replace(/\n\n/g, "</p><p>")
    // Convert single newlines to <br>
    .replace(/\n/g, "<br/>")
    // Wrap everything in a paragraph
    .replace(/^(.+)$/, "<p>$1</p>");
}

function renderAiManager() {
  const messages = state.ai.messages || [];
  const hasChat = messages.length > 1 || state.ai.loading; // exclude initial greeting

  return `
    <div class="bb-ai-layout">
      <div class="bb-ai-messages" id="gemini-messages">
        ${!hasChat && messages.length === 0 ? `
          <div class="bb-ai-welcome">
            <div class="bb-ai-logo">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="28" r="28" fill="url(#aigrad)"/>
                <path d="M28 14 L32 24 L42 24 L34 30 L37 40 L28 34 L19 40 L22 30 L14 24 L24 24 Z" fill="white" opacity="0.9"/>
                <defs><radialGradient id="aigrad" cx="30%" cy="30%"><stop offset="0%" stop-color="#f5a623"/><stop offset="100%" stop-color="#c47c00"/></radialGradient></defs>
              </svg>
            </div>
            <h1 class="bb-ai-greeting">Bull &amp; Bear AI Pro</h1>
            <p class="bb-ai-sub">Your elite financial manager. Ask me anything about crypto, forex, stocks, commodities, and macroeconomics.</p>
            <div class="bb-ai-chips">
              <button type="button" class="bb-chip" onclick="document.querySelector('.bb-ai-input').value='Analyze BTC market structure and give me a trading plan'; document.querySelector('.bb-ai-input').focus()">📊 Analyze BTC</button>
              <button type="button" class="bb-chip" onclick="document.querySelector('.bb-ai-input').value='What is the best forex strategy for beginners?'; document.querySelector('.bb-ai-input').focus()">💱 Forex Strategy</button>
              <button type="button" class="bb-chip" onclick="document.querySelector('.bb-ai-input').value='Explain risk management and position sizing'; document.querySelector('.bb-ai-input').focus()">🛡️ Risk Management</button>
              <button type="button" class="bb-chip" onclick="document.querySelector('.bb-ai-input').value='What is happening with gold and the US dollar?'; document.querySelector('.bb-ai-input').focus()">🥇 Gold &amp; DXY</button>
            </div>
          </div>
        ` : messages.map(m => `
          <div class="bb-ai-msg ${m.role === 'user' ? 'user' : 'assistant'}">
            ${m.role === 'assistant' ? `<div class="bb-ai-avatar">
              <svg width="22" height="22" viewBox="0 0 56 56" fill="none"><circle cx="28" cy="28" r="28" fill="url(#ag2)"/><path d="M28 14 L32 24 L42 24 L34 30 L37 40 L28 34 L19 40 L22 30 L14 24 L24 24 Z" fill="white" opacity="0.9"/><defs><radialGradient id="ag2" cx="30%" cy="30%"><stop offset="0%" stop-color="#f5a623"/><stop offset="100%" stop-color="#c47c00"/></radialGradient></defs></svg>
            </div>` : ""}
            <div class="bb-bubble">
              ${m.role === 'assistant' ? renderMarkdown(m.text) : esc(m.text)}
              ${m.chartData ? renderAiChart(m.chartData) : ""}
            </div>
          </div>
        `).join("")}
        ${state.ai.loading ? `
          <div class="bb-ai-msg assistant">
            <div class="bb-ai-avatar">
              <svg width="22" height="22" viewBox="0 0 56 56" fill="none"><circle cx="28" cy="28" r="28" fill="url(#ag3)"/><path d="M28 14 L32 24 L42 24 L34 30 L37 40 L28 34 L19 40 L22 30 L14 24 L24 24 Z" fill="white" opacity="0.9"/><defs><radialGradient id="ag3" cx="30%" cy="30%"><stop offset="0%" stop-color="#f5a623"/><stop offset="100%" stop-color="#c47c00"/></radialGradient></defs></svg>
            </div>
            <div class="bb-bubble typing">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </div>
          </div>
        ` : ""}
        ${state.ai.error ? `
          <div class="bb-ai-msg assistant">
            <div class="bb-bubble error">${esc(state.ai.error)}</div>
          </div>
        ` : ""}
      </div>
      <div class="bb-ai-input-wrap">
        <form class="bb-ai-bar" onsubmit="return submitAiAdvisor(event)">
          <button type="button" class="bb-bar-icon" title="Clear chat" onclick="state.ai.messages=[]; state.ai.error=''; render(); return false;">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
          </button>
          <input class="bb-ai-input" type="text" name="question" placeholder="Ask Bull &amp; Bear AI Pro about markets, trading, or finance..." required autocomplete="off" ${state.ai.loading ? "disabled" : ""} />
          <button type="submit" class="bb-send-btn" ${state.ai.loading ? "disabled" : ""} title="Send">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </form>
        <p class="bb-ai-disclaimer">Bull &amp; Bear AI Pro &bull; For education only &bull; Not financial advice</p>
      </div>
    </div>
  `;
}

function supportPage() {
  return `
    <section class="section">
      <div class="support-hero">
        <div>
          <div class="eyebrow">Support</div>
          <h1 class="h2" style="margin-top:12px;">Contact Support</h1>
          <p class="lead">For product access, payments, or account support, use the contact details here.</p>
        </div>
        <div class="card pad contact-card">
          <div class="kv">
            <div><span>Email</span><strong>${CONTACT_EMAIL}</strong></div>
            <div><span>Phone</span><strong>+994 55 388 66 10</strong></div>
            <div><span>Location</span><strong>Azerbaijan</strong></div>
          </div>
        </div>
      </div>
      <div class="grid three" style="margin-top:22px;">
        <div class="card pad"><h2 class="h3">Product Access</h2><p class="muted">Help with AI bundle access, free Discord, and Market Hub Pro subscriptions.</p></div>
        <div class="card pad"><h2 class="h3">Payments</h2><p class="muted">Questions about checkout, subscription cancellation, and digital purchase records.</p></div>
        <div class="card pad"><h2 class="h3">Account Help</h2><p class="muted">Support for login, access, billing, and member dashboard questions.</p></div>
      </div>
    </section>
  `;
}

function policyPage(path) {
  const policy = legalPolicies[path] || legalPolicies["/privacy-policy"];
  const links = Object.entries(legalPolicies);
  return `
    <section class="section">
      <div class="legal-layout">
        <aside class="legal-nav">
          ${links.map(([href, item]) => `<a href="${href}" data-link class="${path === href ? "active" : ""}">${esc(item.eyebrow)}</a>`).join("")}
        </aside>
        <article class="card pad legal-doc">
          <div class="eyebrow">${esc(policy.eyebrow)}</div>
          <h1 class="h2" style="margin-top:12px;">${esc(policy.title)}</h1>
          <p class="faint">Last updated: ${esc(policy.updated)}</p>
          <p class="lead">${esc(policy.intro)}</p>
          ${policy.sections.map(([title, body]) => `
            <section>
              <h2>${esc(title)}</h2>
              <p>${esc(body)}</p>
            </section>
          `).join("")}
        </article>
      </div>
    </section>
  `;
}

function paymentStatusPage(status) {
  const success = status === "success";
  return `
    <section class="section">
      <div class="login-wrap">
        <div class="card pad">
          <div class="eyebrow">${success ? "Payment Success" : "Payment Failed"}</div>
          <h1 class="h3" style="margin-top:12px;">${success ? "Payment request received" : "Payment was not completed"}</h1>
          <p class="muted" style="line-height:1.65;">
            ${success
              ? "Your payment result is being checked. Access activates automatically after Payriff confirms the payment."
              : "Please try checkout again or contact support if your bank charged the payment."}
          </p>
          <div class="hero-actions">
            <a href="/profile" data-link class="btn primary">Open Dashboard</a>
            <a href="/support" data-link class="btn secondary">Contact Support</a>
          </div>
        </div>
      </div>
    </section>
  `;
}

function checkoutPage(planId) {
  const product = Object.values(productPlanIds).includes(planId)
    ? Object.entries(productPlanIds).find(([, value]) => value === planId)?.[0]
    : "";
  const productName = product
    ? state.content.products.find((item) => item.id === product)?.title
    : "Selected product";
  return `
    <section class="section">
      <div class="login-wrap">
        <div class="card pad">
          <div class="eyebrow">Secure Checkout</div>
          <h1 class="h3" style="margin-top:12px;">${state.user ? "Creating your Payriff payment link" : "Log in to continue"}</h1>
          <p class="muted" style="line-height:1.65;">
            ${state.user
              ? `Preparing secure card payment for ${esc(productName || "your product")}.`
              : "Please log in first, then choose your product again to start payment."}
          </p>
          <div data-status>${state.user ? `<div class="status">Creating checkout...</div>` : ""}</div>
          <div class="hero-actions">
            ${state.user ? `<a href="/products" data-link class="btn secondary">Back to Products</a>` : `<a href="/login" data-link class="btn primary">Log In</a>`}
            <a href="/support" data-link class="btn secondary">Contact Support</a>
          </div>
        </div>
      </div>
    </section>
  `;
}

function authPage(mode = "login") {
  const isRegister = mode === "register";
  const oauth = new URLSearchParams(window.location.search).get("oauth");
  const oauthNotice = oauth
    ? `<div class="status err">${oauth.includes("not-configured") ? "OAuth credentials are not configured yet. Add provider keys on the server to enable this login." : "OAuth login could not be completed."}</div>`
    : "";
  return `
    <section class="section">
      <div class="login-wrap">
        <div class="card pad">
          <div class="eyebrow">${isRegister ? "Sign Up" : "Log In"}</div>
          <h1 class="h3" style="margin-top:12px;">${isRegister ? "Create your academy account" : "Enter your account"}</h1>
          <p class="muted" style="line-height:1.6;">
            ${isRegister
              ? "Create a student account for product access and future purchases."
              : "Use your email to enter your member account and access your products."}
          </p>
          <form class="form-grid" onsubmit="return ${isRegister ? "handleRegister" : "handleLogin"}(event)">
            ${isRegister ? `
              <div class="field">
                <label for="name">Full name</label>
                <input id="name" name="name" autocomplete="name" required placeholder="Your name">
              </div>
            ` : ""}
            <div class="field">
              <label for="${isRegister ? "email" : "identifier"}">Email</label>
              <input id="${isRegister ? "email" : "identifier"}" name="${isRegister ? "email" : "identifier"}" autocomplete="username" required placeholder="you@example.com">
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" required placeholder="At least 8 characters">
            </div>
            <button class="btn primary" type="submit">${isRegister ? "Create Account" : "Log In"}</button>
            <div data-status>${state.message}</div>
          </form>
          <div class="oauth-row">
            <a class="btn secondary small" href="/api/auth/oauth/google">Google</a>
            <a class="btn secondary small" href="/api/auth/oauth/discord">Discord</a>
          </div>
          ${oauthNotice}
          <p class="muted" style="margin:18px 0 0;">
            ${isRegister
              ? `Already have an account? <a href="/login" data-link class="gold-text">Log in</a>`
              : `Need an account? <a href="/register" data-link class="gold-text">Sign up</a>`}
          </p>
        </div>
      </div>
    </section>
  `;
}

function profilePage() {
  if (!state.user) return authPage("login");
  const dashboard = state.userDashboard || {};
  const activeSubscription = (dashboard.subscriptions || []).find((item) => item.status === "active");
  const activeUntil = activeSubscription?.paid_until || activeSubscription?.paidUntil || activeSubscription?.expiresAt;
  const payments = dashboard.payments || [];
  const recent = dashboard.recentOpportunities || state.scanner.opportunities.slice(0, 5);
  const watchlist = dashboard.watchlist || [];
  const courseProgress = dashboard.courseProgress || [];
  return `
    <section class="section">
      <div class="section-head">
        <div>
          <div class="eyebrow">Account</div>
          <h1 class="h2" style="margin-top:12px;">Welcome, ${esc(state.user.name || "Trader")}</h1>
          <p class="lead">Your dashboard tracks subscription access, billing, Discord connection, notifications, and recent scanner opportunities.</p>
          <div data-status>${state.message}</div>
        </div>
        <button class="btn secondary small" data-logout>Logout</button>
      </div>
      <div class="grid three">
        <div class="card pad">
          <h2 class="h3">Active Subscription</h2>
          <p class="muted">${activeSubscription ? `${esc(activeSubscription.planId)} until ${new Date(activeUntil).toLocaleDateString()}` : "No active subscription yet."}</p>
          ${activeSubscription ? `<button class="btn danger small" data-cancel-subscription="${esc(activeSubscription.id)}">Cancel Auto-Renew</button>` : `<a href="/products" data-link class="btn primary small">View Plans</a>`}
        </div>
        <div class="card pad">
          <h2 class="h3">Discord</h2>
          <p class="muted">${
            dashboard.discord?.connected
              ? `Connected${dashboard.discord?.username ? ` as ${esc(dashboard.discord.username)}` : ""}. Free Discord stays open to the community.`
              : "Connect Discord for account linking, community access, and academy updates."
          }</p>
          <div class="hero-actions small-actions">
            <button class="btn primary small" type="button" data-connect-discord>${dashboard.discord?.connected ? "Reconnect Discord" : "Connect Discord"}</button>
            <a href="${FREE_DISCORD_URL}" target="_blank" rel="noopener" class="btn secondary small">Free Discord</a>
          </div>
        </div>
        <div class="card pad">
          <h2 class="h3">Billing History</h2>
          <p class="muted">${payments.length ? `${payments.length} payment record${payments.length === 1 ? "" : "s"} saved.` : "No payment records yet."}</p>
          <a href="/products" data-link class="btn secondary small">Plans</a>
        </div>
      </div>
      ${hasEducationAccess() ? `
        <div class="card pad" style="margin-top:24px;">
          <div class="discord-access-row">
            <div>
              <div class="eyebrow">Education Bundle</div>
              <h2 class="h3" style="margin-top:10px;">Your Discord channel is unlocked</h2>
              <p class="muted">Use Discord for premium discussion and VIP market updates.</p>
            </div>
            <div class="hero-actions">
              <a href="${DISCORD_COURSE_URL}" target="_blank" rel="noopener" class="btn primary">Open Discord Course Channel</a>
              <a href="/book" data-link class="btn secondary">Open Book</a>
            </div>
          </div>
        </div>
      ` : ""}
      <div class="grid two" style="margin-top:24px;">
        <div class="card pad">
          <h2 class="h3">Your Watchlist</h2>
          <div class="table-list">
            ${watchlist.length ? watchlist.map(w => `
              <div class="table-row">
                <div><strong>${esc(w.symbol)}</strong><div class="faint">${esc(w.market)} ${w.note ? `- ${esc(w.note)}` : ''}</div></div>
                <button class="btn small icon" onclick="removeWatchlist('${esc(w.symbol)}')">✕</button>
              </div>
            `).join("") : `<div class="empty compact-empty">Your watchlist is empty. Add assets from the scanner or analyzer.</div>`}
          </div>
        </div>

        <div class="card pad">
          <h2 class="h3">Recent Opportunities</h2>
          <div class="table-list">
            ${recent.length ? recent.map((item) => `
              <div class="table-row">
                <div><strong>${esc(item.pair)}</strong><div class="faint">${esc(item.buyExchange)} -> ${esc(item.sellExchange)}</div></div>
                <span class="${item.netSpreadPct > 0 ? "up" : "down"}">${Number(item.netSpreadPct || 0).toFixed(2)}%</span>
              </div>
            `).join("") : `<div class="empty compact-empty">Open the scanner to load recent opportunities.</div>`}
          </div>
        </div>
        <div class="card pad">
          <h2 class="h3">Notifications</h2>
          <div class="table-list">
            ${(dashboard.notifications || []).length ? dashboard.notifications.map((item) => `
              <div class="table-row"><div><strong>${esc(item.title)}</strong><div class="faint">${esc(item.body)}</div></div></div>
            `).join("") : `<div class="empty compact-empty">No alerts yet. High-spread scanner, subscription, Discord, course, and VIP updates will appear here.</div>`}
          </div>
        </div>
      </div>
    </section>
  `;
}

function adminPage() {
  if (!state.token || !isAdmin()) {
    return `
      <section class="section">
        <div class="login-wrap">
          <div class="card pad">
            <div class="eyebrow">Admin Access</div>
            <h1 class="h3" style="margin-top:12px;">Log in as admin</h1>
            <p class="muted" style="line-height:1.6;">This is a restricted area. Please log in with an authorized account.</p>
            <a href="/login" data-link class="btn primary">Go to Log In</a>
          </div>
        </div>
      </section>
    `;
  }
  return `
    <section class="section">
      <div class="section-head">
        <div>
          <div class="eyebrow">Admin Panel</div>
          <h1 class="h2" style="margin-top:12px;">SaaS Management</h1>
          <p class="lead">Manage users, subscriptions, payments, scanner controls, announcements, videos, and book PDF uploads.</p>
        </div>
        <button class="btn secondary small" data-logout>Logout</button>
      </div>
      <div class="admin-layout">
        <aside class="admin-tabs">
          ${adminTabButton("dashboard", "Dashboard")}
          ${adminTabButton("users", "Users")}
          ${adminTabButton("subscriptions", "Subscriptions")}
          ${adminTabButton("payments", "Payments")}
          ${adminTabButton("scanner", "Scanner")}
          ${adminTabButton("announcements", "Announcements")}
          ${adminTabButton("courses", "Videos")}
          
        </aside>
        <div>
          ${adminActivePanel()}
        </div>
      </div>
    </section>
  `;
}

function adminTabButton(id, label) {
  return `<button class="${state.adminTab === id ? "active" : ""}" data-admin-tab="${id}">${label}</button>`;
}

function adminActivePanel() {
  if (state.adminTab === "users") return adminUsersPanel();
  if (state.adminTab === "subscriptions") return adminSubscriptionsPanel();
  if (state.adminTab === "payments") return adminPaymentsPanel();
  if (state.adminTab === "scanner") return adminScannerPanel();
  if (state.adminTab === "announcements") return adminAnnouncementsPanel();
  
  
  return adminDashboardPanel();
}

function adminDashboardPanel() {
  const content = state.content;
  const platform = state.adminPlatform || {};
  const users = platform.users || [];
  const subscriptions = platform.subscriptions || [];
  const payments = platform.payments || [];
  const revenue = payments.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return `
    <div class="grid">
      <div class="stat-grid">
        <div class="stat"><strong>${content.courses.length}</strong><span>Total lessons</span></div>
        <div class="stat"><strong>${users.length}</strong><span>Users</span></div>
        <div class="stat"><strong>${subscriptions.filter((item) => item.status === "active").length}</strong><span>Active subscriptions</span></div>
        <div class="stat"><strong>${compactMoney(revenue)}</strong><span>Revenue</span></div>
      </div>
      <div class="card pad">
        <h2 class="h3">Fast Actions</h2>
        <div class="hero-actions">
          <button class="btn primary" data-admin-tab="scanner">Scanner Controls</button>
          <button class="btn secondary" data-admin-tab="payments">Payment Logs</button>
          <button class="btn primary" data-admin-tab="courses">Upload Video</button>
          <button class="btn secondary" data-admin-tab="book">Upload Book</button>
        </div>
      </div>
      <div class="grid three">
        <div class="card pad">
          <h2 class="h3">Scanner</h2>
          <p class="muted">${state.scanner.exchanges.filter((item) => item.status === "online").length || "Live"} exchanges online. ${state.scanner.lastUpdated ? `Updated ${new Date(state.scanner.lastUpdated).toLocaleTimeString()}.` : "Open scanner to refresh live data."}</p>
        </div>
        <div class="card pad">
          <h2 class="h3">Book PDF</h2>
          <p class="muted">${content.book.pdfUrl ? "A PDF is uploaded and visible on the book page." : "No PDF uploaded yet."}</p>
        </div>
        <div class="card pad">
          <h2 class="h3">Discord Bot</h2>
          <p class="muted">${platform.discord?.botConfigured ? "Discord premium role sync configured." : "Add Discord bot environment values to enable role sync."}</p>
        </div>
      </div>
    </div>
  `;
}

function adminUsersPanel() {
  const platform = state.adminPlatform || {};
  const users = platform.users || [];
  return `
    <div class="card pad">
      <h2 class="h3">User Management</h2>
      <div class="table-list">
        ${users.length ? users.map((user) => `
          <div class="table-row">
            <div><strong>${esc(user.name)}</strong><div class="faint">${esc(user.email)}</div></div>
            <span>${esc(user.role || "user")}</span>
          </div>
        `).join("") : `<div class="empty compact-empty">No users registered yet.</div>`}
      </div>
    </div>
  `;
}

function adminSubscriptionsPanel() {
  const platform = state.adminPlatform || {};
  const subscriptions = platform.subscriptions || [];
  return `
    <div class="card pad">
      <h2 class="h3">Subscription Management</h2>
      <div class="table-list">
        ${subscriptions.length ? subscriptions.map((item) => `
          <div class="table-row">
            <div><strong>${esc(item.planId)}</strong><div class="faint">${esc(item.userId)} / expires ${new Date(item.expiresAt).toLocaleDateString()}</div></div>
            <span class="${item.status === "active" ? "up" : "down"}">${esc(item.status)}</span>
          </div>
        `).join("") : `<div class="empty compact-empty">No subscriptions yet. Webhooks will activate subscriptions after paid checkout.</div>`}
      </div>
    </div>
  `;
}

function adminPaymentsPanel() {
  const platform = state.adminPlatform || {};
  const payments = platform.payments || [];
  const logs = platform.paymentLogs || [];
  const providers = platform.providers || {};
  return `
    <div class="grid">
      <div class="card pad">
        <h2 class="h3">Payment Providers</h2>
        <div class="provider-grid">
          ${["payriff", "epoint", "crypto", "card"].map((name) => `
            <div class="provider-chip ${providers[name] ? "online" : ""}">
              <strong>${esc(name)}</strong>
              <span>${providers[name] ? "configured" : "needs keys"}</span>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="card pad">
        <h2 class="h3">Payment Logs</h2>
        <div class="table-list">
          ${payments.length ? payments.map((payment) => `
            <div class="table-row">
              <div><strong>${esc(payment.planId)}</strong><div class="faint">${esc(payment.provider)} / ${esc(payment.id)}</div></div>
              <span>${esc(payment.status)}</span>
            </div>
          `).join("") : `<div class="empty compact-empty">No checkout records yet.</div>`}
        </div>
      </div>
      <div class="card pad">
        <h2 class="h3">Webhook Events</h2>
        <div class="table-list">
          ${logs.length ? logs.map((log) => `
            <div class="table-row">
              <div><strong>${esc(log.provider)}</strong><div class="faint">${new Date(log.createdAt).toLocaleString()}</div></div>
              <span>${esc(log.status)}</span>
            </div>
          `).join("") : `<div class="empty compact-empty">Provider webhooks will appear here.</div>`}
        </div>
      </div>
    </div>
  `;
}

function adminScannerPanel() {
  const controls = state.adminPlatform?.scannerControls || {};
  return `
    <div class="grid">
      <div class="card pad">
        <h2 class="h3">Scanner Controls</h2>
        <form class="form-grid" onsubmit="return submitScannerControls(event)">
          <label class="checkbox-row">
            <input type="checkbox" name="enabled" ${controls.enabled !== false ? "checked" : ""}>
            Scanner enabled
          </label>
          <div class="form-grid two">
            <div class="field">
              <label>Minimum Spread %</label>
              <input name="minSpread" type="number" step="0.01" min="0" value="${esc(controls.minSpread ?? 0.25)}">
            </div>
            <div class="field">
              <label>Notional USD</label>
              <input name="notionalUsd" type="number" step="100" min="100" value="${esc(controls.notionalUsd ?? 1000)}">
            </div>
          </div>
          <button class="btn primary" type="submit">Save Scanner Controls</button>
          <div data-status>${state.message}</div>
        </form>
      </div>
      <div class="card pad">
        <h2 class="h3">Exchange Health</h2>
        <div class="exchange-strip admin-exchanges">
          ${(state.scanner.exchanges.length ? state.scanner.exchanges : []).map((exchange) => `
            <div class="exchange-chip ${exchange.status === "online" ? "online" : "error"}">
              <strong>${esc(exchange.name)}</strong>
              <span>${esc(exchange.status)} ${exchange.pairs ? `/ ${exchange.pairs} pairs` : ""}</span>
            </div>
          `).join("") || `<div class="empty compact-empty">Open the public scanner once to load exchange health.</div>`}
        </div>
      </div>
    </div>
  `;
}

function adminAnnouncementsPanel() {
  const announcements = state.adminPlatform?.announcements || [];
  return `
    <div class="grid two">
      <div class="card pad">
        <h2 class="h3">Send Announcement</h2>
        <form class="form-grid" onsubmit="return submitAnnouncement(event)">
          <div class="field">
            <label>Title</label>
            <input name="title" required placeholder="New live stream tonight">
          </div>
          <div class="field">
            <label>Message</label>
            <textarea name="body" required placeholder="Write the update for members"></textarea>
          </div>
          <button class="btn primary" type="submit">Send Announcement</button>
          <div data-status>${state.message}</div>
        </form>
      </div>
      <div class="card pad">
        <h2 class="h3">Recent Announcements</h2>
        <div class="table-list">
          ${announcements.length ? announcements.map((item) => `
            <div class="table-row"><div><strong>${esc(item.title)}</strong><div class="faint">${esc(item.body)}</div></div></div>
          `).join("") : `<div class="empty compact-empty">No announcements yet.</div>`}
        </div>
      </div>
    </div>
  `;
}

function notFoundPage() {
  return `
    <section class="section">
      <div class="empty">
        <h1 class="h3">Page not found</h1>
        <p class="muted">The page you opened does not exist.</p>
        <a href="/" data-link class="btn primary">Go Home</a>
      </div>
    </section>
  `;
}

function page() {
  const path = state.route.replace(/\/$/, "") || "/";
  const legalPath = legalPolicyAliases[path] || path;
  if (path === "/") return homePage();
  if (path === "/products") return productsPage();
  if (path === "/how-to-use") return howToUsePage();
  if (path === "/signals" || path === "/discord") return signalsPage();
  if (path === "/arbitrage" || path === "/scanner" || path === "/market-hub") return arbitragePage();
  if (path === "/ai") {
    state.marketHub.activeTab = "ai";
    return arbitragePage();
  }
  if (path === "/support") return supportPage();
  if (path === "/login") return authPage("login");
  if (path === "/register") return authPage("register");
  if (path.startsWith("/checkout/")) return checkoutPage(decodeURIComponent(path.split("/").pop() || ""));
  if (path === "/payment/success") return paymentStatusPage("success");
  if (path === "/payment/failed") return paymentStatusPage("failed");
  if (path === "/profile" || path === "/dashboard") return profilePage();
  if (path === "/admin") return adminPage();
  if (legalPolicies[legalPath]) return policyPage(legalPath);
  return notFoundPage();
}

function render() {
  const app = document.getElementById("app");
  if (!state.content) {
    app.innerHTML = `<main class="main"><section class="section"><div class="empty">Loading...</div></section></main>`;
    return;
  }
  
  const updateDOM = () => {
    app.innerHTML = `<div class="app">${header()}<main class="main scroll-reveal">${page()}</main>${footer()}</div>`;
    bindCheckoutButtons();
    initMarketCanvas();
    mountRouteEffects();
    bindInteractiveEffects();
    if (typeof initTradingViewCharts === "function") initTradingViewCharts();
    if (typeof initAdvancedTradingViewWidget === "function") initAdvancedTradingViewWidget();
  };

  if (document.startViewTransition) {
    document.startViewTransition(updateDOM);
  } else {
    updateDOM();
  }
}

function bindInteractiveEffects() {
  // Find all cards and panels to make them interactive
  const interactiveElements = document.querySelectorAll('.card, .panel, .academy-panel, .hub-hero-panel, .price-card');
  
  interactiveElements.forEach(el => {
    // Add the class required for the glow effect
    el.classList.add('interactive-card');
    
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left; // x position within the element.
      const y = e.clientY - rect.top;  // y position within the element.
      
      // Update CSS variables for the spotlight glow
      el.style.setProperty('--x', `${x}px`);
      el.style.setProperty('--y', `${y}px`);
      
      // Calculate 3D tilt
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -5; // max 5 degrees
      const rotateY = ((x - centerX) / centerX) * 5;  // max 5 degrees
      
      el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });
    
    el.addEventListener('mouseleave', () => {
      // Reset transform when mouse leaves
      el.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    });
  });
}

function initMarketCanvas() {
  cancelAnimationFrame(canvasFrame);
  const canvas = document.getElementById("marketCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const candles = Array.from({ length: 56 }, (_, index) => {
    const base = 0.45 + Math.sin(index * 0.42) * 0.18 + Math.cos(index * 0.19) * 0.12;
    const open = base + (Math.random() - 0.5) * 0.18;
    const close = base + (Math.random() - 0.5) * 0.18;
    return { open, close, high: Math.max(open, close) + Math.random() * 0.16, low: Math.min(open, close) - Math.random() * 0.16 };
  });
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize, { once: true });

  const draw = (time) => {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.055)";
    ctx.lineWidth = 1;
    for (let x = (time / 24) % 44; x < width; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 44) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    const candleWidth = Math.max(8, width / 96);
    const gap = candleWidth * 1.7;
    const startX = width * 0.38 - ((time / 38) % gap);
    candles.forEach((candle, index) => {
      const x = startX + index * gap;
      const wave = Math.sin(time / 900 + index * 0.35) * 0.04;
      const toY = (value) => height * (0.82 - Math.max(0.05, Math.min(0.95, value + wave)) * 0.62);
      const openY = toY(candle.open);
      const closeY = toY(candle.close);
      const highY = toY(candle.high);
      const lowY = toY(candle.low);
      const up = closeY < openY;
      ctx.strokeStyle = up ? "rgba(16,185,129,0.78)" : "rgba(239,68,68,0.7)";
      ctx.fillStyle = up ? "rgba(16,185,129,0.76)" : "rgba(239,68,68,0.72)";
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();
      ctx.fillRect(x - candleWidth / 2, Math.min(openY, closeY), candleWidth, Math.max(3, Math.abs(closeY - openY)));
    });
    ctx.strokeStyle = "rgba(245,158,11,0.42)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = width * 0.32, i = 0; x < width; x += 18, i++) {
      const y = height * 0.48 + Math.sin(i * 0.34 + time / 700) * 34 + Math.cos(i * 0.09) * 46;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    canvasFrame = requestAnimationFrame(draw);
  };
  canvasFrame = requestAnimationFrame(draw);
}

async function refreshAfterAdmin(message) {
  await loadContent();
  state.message = `<div class="status ok">${esc(message)}</div>`;
  render();
}

window.handleLogin = async function handleLogin(event) {
  event.preventDefault();
  setMessage("Checking login...");
  const form = new FormData(event.currentTarget);
  try {
    const res = await api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: form.get("identifier"),
        password: form.get("password")
      })
    });
    setSession(res.token, res.user);
    state.message = "";
    navigate(isAdmin() ? "/admin" : "/profile");
  } catch (error) {
    setMessage(error.message, "err");
  }
  return false;
};

window.handleRegister = async function handleRegister(event) {
  event.preventDefault();
  setMessage("Creating account...");
  const form = new FormData(event.currentTarget);
  try {
    const res = await api("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password")
      })
    });
    setSession(res.token, res.user);
    state.message = "";
    navigate(isAdmin() ? "/admin" : "/profile");
  } catch (error) {
    setMessage(error.message, "err");
  }
  return false;
};

window.removeWatchlist = async function removeWatchlist(symbol) {
  if (!confirm(`Remove ${symbol} from your watchlist?`)) return;
  try {
    const res = await api(`/api/user/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE" });
    if (state.userDashboard) state.userDashboard.watchlist = res.watchlist;
    render();
  } catch (err) {
    console.error("Failed to remove from watchlist:", err);
  }
};

window.addToWatchlist = async function addToWatchlist(symbol, market) {
  try {
    const res = await api("/api/user/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, market, note: "Added from Analyzer" })
    });
    if (state.userDashboard) state.userDashboard.watchlist = res.watchlist;
    alert(`${symbol} added to Watchlist!`);
    render();
  } catch (err) {
    console.error("Failed to add to watchlist:", err);
    if (err.message.includes("Session")) {
       navigate("/login");
    } else {
       alert("Failed to add to watchlist.");
    }
  }
};


window.submitScannerControls = async function submitScannerControls(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  setMessage("Saving scanner controls...");
  try {
    await api("/api/admin/scanner-controls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: form.elements.enabled.checked,
        minSpread: data.get("minSpread"),
        notionalUsd: data.get("notionalUsd")
      })
    });
    await loadAdminPlatform(true);
    setMessage("Scanner controls saved.", "ok");
  } catch (error) {
    setMessage(error.message, "err");
  }
  return false;
};

window.submitAnnouncement = async function submitAnnouncement(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  setMessage("Sending announcement...");
  try {
    await api("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.get("title"),
        body: data.get("body"),
        channels: ["dashboard", "email", "discord"]
      })
    });
    event.currentTarget.reset();
    await loadAdminPlatform(true);
    setMessage("Announcement saved.", "ok");
  } catch (error) {
    setMessage(error.message, "err");
  }
  return false;
};

window.submitAiAdvisor = async function submitAiAdvisor(event) {
  event.preventDefault();
  if (!hasAiAccess()) {
    state.ai.error = state.user
      ? "Investor & Trader AI is included with Market Hub Pro."
      : "Please log in and subscribe to Market Hub Pro to unlock the AI tool.";
    render();
    return false;
  }
  const form = event.currentTarget;
  const data = new FormData(form);
  const question = (data.get("question") || "").trim();
  
  if (!question) return false;

  // Build history from current messages (exclude the initial greeting)
  const currentMessages = state.ai.messages || [];
  const historyForApi = currentMessages
    .filter(m => !(m.role === "assistant" && currentMessages.indexOf(m) === 0))
    .map(m => ({ role: m.role, text: m.text }));

  const payload = {
    question,
    history: historyForApi
  };

  state.ai.loading = true;
  state.ai.error = "";
  state.ai.messages = [
    ...(state.ai.messages || []),
    { role: "user", text: question }
  ];
  
  // Reset form immediately
  form.reset();
  render();
  
  setTimeout(() => {
    const msgs = document.getElementById("gemini-messages");
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }, 50);

  try {
    const response = await api("/api/ai/advisor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const r = response.result || {};
    // The real AI returns chatAnswer as clean prose/markdown text
    const answerText = r.chatAnswer || r.summary || "I wasn't able to generate a response. Please try again.";

    state.ai.messages = [
      ...state.ai.messages,
      { role: "assistant", text: answerText, chartData: r.chartData }
    ];
    state.ai.loading = false;
    state.ai.error = "";
    render();
    
    setTimeout(() => {
      const msgs = document.getElementById("gemini-messages");
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 50);
  } catch (error) {
    state.ai.loading = false;
    state.ai.error = error.message;
    render();
  }
  return false;
};

function analyzerModeFromLabel(value = "") {
  const key = String(value).toLowerCase().replace(/[^a-z]/g, "");
  const modes = {
    scalping: "scalping",
    daytrading: "dayTrading",
    swingtrading: "swingTrading",
    longterminvestment: "longTermInvestment",
    longterminvestmentstrategy: "longTermInvestment",
    longtermmacroview: "longTermInvestment",
    marketsummary: "marketSummary",
    sectoranalysis: "sectorAnalysis"
  };
  return modes[key] || "marketSummary";
}

function analyzerTimeframe(value = "4H") {
  return String(value).trim().toLowerCase();
}

async function requestProtectedMarketHubAnalysis(payload) {
  const headers = { "Content-Type": "application/json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let response;
  try {
    response = await fetch("/api/market-hub/analyze", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store"
    });
  } catch (cause) {
    const error = new Error("The protected analyzer could not be reached.");
    error.status = 0;
    error.cause = cause;
    throw error;
  }
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const body = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401) logout(false);
    const isHtml = typeof body === "string" && body.trim().startsWith("<");
    const errorMessage = isHtml ? "The server returned an invalid response. It may be temporarily unavailable." : (body?.error || body || "Protected analysis failed");
    const error = new Error(errorMessage);
    error.status = response.status;
    error.details = body?.details || null;
    throw error;
  }
  return { ...body, _analysisSource: "backend" };
}

function fallbackRiskReward(value) {
  const match = String(value || "").match(/1\s*:\s*([\d.]+)/);
  return match ? Number(match[1]) : null;
}

function normalizeBrowserFallback(legacy = {}, request) {
  const confidence = Math.max(0, Math.min(100, Number(legacy.confidenceScore || 0)));
  const componentScore = Math.max(0, Math.min(10, Math.round(confidence / 10)));
  const legacyStatus = String(legacy.signalStatus || "").toLowerCase();
  const signalStatus = legacyStatus.includes("long")
    ? "long"
    : legacyStatus.includes("short")
      ? "short"
      : legacyStatus.includes("research")
        ? "neutral"
        : "noSignal";
  const riskLevel = String(legacy.riskLevel || "high").toLowerCase();
  const supportResistance = legacy.supportResistance
    ? `${legacy.supportResistance.support} / ${legacy.supportResistance.resistance}`
    : "Browser fallback levels only";
  const component = (detail, score = componentScore) => ({ score, detail });
  return {
    market: request.market,
    asset: request.asset,
    mode: request.mode,
    timeframe: request.timeframe,
    signalStatus,
    confidenceScore: confidence,
    riskLevel: ["low", "medium", "high", "extreme"].includes(riskLevel) ? riskLevel : "high",
    marketBias: legacy.bias || legacy.trend || signalStatus,
    entryZone: legacy.entryZone || legacy.entryIdea || null,
    stopLoss: legacy.stopLoss === "Not active" ? null : legacy.stopLoss ?? null,
    takeProfits: (legacy.takeProfits || []).map((target, index) => ({
      level: target.level || target.label || `TP${index + 1}`,
      price: target.price,
      riskMultiple: target.riskMultiple || null
    })),
    riskReward: fallbackRiskReward(legacy.riskRewardRatio),
    strategyBreakdown: {
      setupQuality: "browser fallback demo",
      components: {
        trend: component(legacy.trend || "Fallback trend placeholder"),
        marketStructure: component("Browser fallback market-structure placeholder"),
        supportResistance: component(supportResistance),
        liquidity: component((legacy.liquidityZones || []).join("; ") || "Fallback liquidity placeholder"),
        momentum: component(legacy.indicatorSummary?.rsi || "Fallback momentum placeholder"),
        volume: component(legacy.volumeSummary || "Fallback volume placeholder"),
        volatility: component(legacy.volatility || "Fallback volatility placeholder", riskLevel === "high" ? 3 : componentScore),
        newsRisk: component(legacy.newsRisk || legacy.macroNewsRisk || "Live news is not connected", 3),
        riskReward: component(legacy.riskRewardRatio || "Fallback risk/reward unavailable"),
        marketSpecific: component("Legacy browser analyzer model")
      },
      strategies: ["Legacy browser fallback model"],
      research: legacy.summary || legacy.strategy || legacy.sectors
        ? { summary: legacy.summary || {}, strategy: legacy.strategy || {}, sectors: legacy.sectors || [] }
        : undefined
    },
    explanation: `${legacy.explanation || legacy.summary?.overall || "Browser fallback educational scenario."} This fallback is not protected backend analysis and is not a live signal.`,
    invalidationRule: legacy.invalidationRule || legacy.invalidation || "Do not act on fallback output without independent confirmation.",
    noSignalReason: signalStatus === "noSignal" ? "Protected analysis was unavailable and the fallback found no high-quality setup." : null,
    highRiskWarning: riskLevel === "high" ? "Browser fallback risk is high. Wait for protected analysis and independent confirmation." : null,
    dataStatus: {
      status: "demo",
      provider: "browserFallback",
      message: legacy.dataSource || "Legacy browser-generated demo. No live Analyzer V2 provider was used."
    },
    isDemo: true,
    lastUpdated: legacy.lastUpdated || new Date().toISOString(),
    metadata: {
      educationalDisclaimer: "Educational browser fallback only, not financial advice. No result guarantees profit.",
      executionEnabled: false,
      orderPlacementSupported: false,
      modelVersion: "legacy-browser-fallback"
    },
    _analysisSource: "fallback"
  };
}

async function runMarketHubAnalysis({ request, fallback, resultKey = "result" }) {
  const requestId = state.marketHub.requestId + 1;
  state.marketHub.requestId = requestId;
  state.marketHub.loading = true;
  state.marketHub.error = null;
  state.marketHub[resultKey] = null;
  render();
  try {
    state.marketHub[resultKey] = await requestProtectedMarketHubAnalysis(request);
  } catch (error) {
    state.marketHub.error = { status: error.status || 500, message: error.message };
  } finally {
    if (state.marketHub.requestId === requestId) {
      state.marketHub.loading = false;
      render();
    }
  }
}

window.submitCryptoAnalyzer = function submitCryptoAnalyzer(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const payload = {
    asset: String(data.get("asset") || "BTC"),
    style: String(data.get("style") || "Day Trading"),
    timeframe: String(data.get("timeframe") || "15m")
  };
  state.marketHub.activeTab = "crypto";
  state.marketHub.forms.crypto = payload;
  const request = {
    market: "crypto",
    asset: payload.asset,
    mode: analyzerModeFromLabel(payload.style),
    timeframe: analyzerTimeframe(payload.timeframe)
  };
  runMarketHubAnalysis({
    request,
    fallback: () => {
      const service = marketHubService();
      if (!service.analyzeCryptoMarket) throw new Error("Crypto fallback service is not loaded.");
      return service.analyzeCryptoMarket(payload.asset, payload.style, payload.timeframe);
    }
  });
  return false;
};

window.submitForexAnalyzer = function submitForexAnalyzer(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const payload = {
    pair: String(data.get("pair") || "EUR/USD"),
    style: String(data.get("style") || "Day Trading"),
    timeframe: String(data.get("timeframe") || "4H")
  };
  state.marketHub.activeTab = "forex";
  state.marketHub.forms.forex = payload;
  const request = {
    market: payload.pair === "XAU/USD" ? "gold" : "forex",
    asset: payload.pair,
    mode: analyzerModeFromLabel(payload.style),
    timeframe: analyzerTimeframe(payload.timeframe)
  };
  runMarketHubAnalysis({
    request,
    fallback: () => {
      const service = marketHubService();
      if (!service.analyzeForexMarket) throw new Error("Forex fallback service is not loaded.");
      return service.analyzeForexMarket(payload.pair, payload.style);
    }
  });
  return false;
};

window.submitCommodityAnalyzer = function submitCommodityAnalyzer(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const payload = {
    asset: String(data.get("asset") || "XAU/USD"),
    style: String(data.get("style") || "Day Trading"),
    timeframe: String(data.get("timeframe") || "4H")
  };
  state.marketHub.activeTab = "commodities";
  state.marketHub.forms.commodities = payload;
  const request = {
    market: payload.asset === "XAU/USD" ? "gold" : "commodities",
    asset: payload.asset,
    mode: analyzerModeFromLabel(payload.style),
    timeframe: analyzerTimeframe(payload.timeframe)
  };
  runMarketHubAnalysis({
    request,
    fallback: () => {
      const service = marketHubService();
      if (!service.analyzeCommodityMarket) throw new Error("Commodity fallback service is not loaded.");
      return service.analyzeCommodityMarket(payload.asset, payload.style);
    }
  });
  return false;
};

window.submitStockAnalyzer = function submitStockAnalyzer(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const mode = String(data.get("mode") || "Market Summary");
  const selectedOption = String(data.get("selectedOption") || "US Market");
  const payload = {
    asset: String(data.get("asset") || "SPY"),
    mode,
    selectedOption,
    timeframe: String(data.get("timeframe") || "1D")
  };
  state.marketHub.activeTab = "stocks";
  state.marketHub.forms.stocks = payload;
  const request = {
    market: "stocks",
    asset: payload.asset,
    mode: analyzerModeFromLabel(payload.mode),
    timeframe: analyzerTimeframe(payload.timeframe)
  };
  runMarketHubAnalysis({
    request,
    resultKey: "stockResult",
    fallback: () => {
      const service = marketHubService();
      if (!service.analyzeStockMarket) throw new Error("Stock fallback service is not loaded.");
      return service.analyzeStockMarket(payload.mode, payload.selectedOption);
    }
  });
  return false;
};

function logout(shouldRender = true) {
  state.token = "";
  state.user = null;
  state.userDashboard = null;
  state.adminPlatform = null;
  state.message = "";
  localStorage.removeItem("bb_token");
  localStorage.removeItem("bb_user");
  localStorage.removeItem("bb_admin_token");
  localStorage.removeItem("bb_admin_user");
  if (shouldRender) navigate("/login");
}

document.addEventListener("click", async (event) => {
  const bookPdf = event.target.closest("[data-book-pdf]");
  if (bookPdf) {
    event.preventDefault();
    await openBookPdf(bookPdf.getAttribute("data-book-pdf") === "download");
    return;
  }

  const link = event.target.closest("a[data-link]");
  if (link) {
    event.preventDefault();
    navigate(link.getAttribute("href"));
    return;
  }

  const marketTab = event.target.closest("[data-market-tab]");
  if (marketTab) {
    const nextTab = marketTab.getAttribute("data-market-tab") || "arbitrage";
    
    // If the user is on the /ai route but clicks another tab, switch the route back to /market-hub
    // so the page() router doesn't force the activeTab back to 'ai' on render()
    if (state.route.replace(/\/$/, "") === "/ai") {
      history.replaceState({}, "", "/market-hub");
      state.route = "/market-hub";
    }

    const changedTab = nextTab !== state.marketHub.activeTab;
    state.marketHub.activeTab = nextTab;
    state.marketHub.loading = false;
    state.marketHub.error = null;
    state.marketHub.requestId += 1;
    if (changedTab) {
      state.marketHub.result = null;
      if (state.marketHub.activeTab !== "stocks") state.marketHub.stockResult = null;
    }
    render();
    return;
  }

  const tab = event.target.closest("[data-admin-tab]");
  if (tab) {
    state.adminTab = tab.getAttribute("data-admin-tab");
    state.message = "";
    render();
    return;
  }

  const category = event.target.closest("[data-category]");
  if (category) {
    state.selectedCategory = category.getAttribute("data-category");
    render();
    return;
  }

  const course = event.target.closest("[data-course-id]");
  if (course) {
    state.selectedCourseId = course.getAttribute("data-course-id");
    render();
    return;
  }

  if (event.target.closest("[data-close-modal]") && !event.target.closest("[data-modal]")) {
    state.selectedCourseId = "";
    render();
    return;
  }

  if (event.target.closest("[data-close-modal]") && event.target.tagName === "BUTTON") {
    state.selectedCourseId = "";
    render();
    return;
  }

  if (event.target.closest("[data-logout]")) {
    logout();
    return;
  }

  if (event.target.closest("[data-refresh-scanner]")) {
    await loadScannerData(true);
    return;
  }

  const connectDiscord = event.target.closest("[data-connect-discord]");
  if (connectDiscord) {
    await connectDiscordAccount(connectDiscord);
    return;
  }

  const aiTemplate = event.target.closest("[data-ai-template]");
  if (aiTemplate) {
    state.ai.form.mode = aiTemplate.getAttribute("data-ai-template") || state.ai.form.mode;
    state.ai.form.question = aiTemplate.getAttribute("data-ai-question") || state.ai.form.question;
    const form = document.querySelector(".ai-layout form");
    if (form) {
      if (form.mode) form.mode.value = state.ai.form.mode;
      if (form.question) form.question.value = state.ai.form.question;
    }
    render();
    return;
  }

  const checkout = event.target.closest("[data-checkout-plan]");
  if (checkout) {
    event.preventDefault();
    const planId = checkout.getAttribute("data-checkout-plan");
    if (!planId || retiredCheckoutPlanIds.has(planId)) {
      checkout.remove();
      setMessage("Discord is free now. Please use the Join Free Discord button.", "err");
      return;
    }
    await startPlanCheckout(planId, checkout);
    return;
  }

  const cancelSubscription = event.target.closest("[data-cancel-subscription]");
  if (cancelSubscription) {
    const subscriptionId = cancelSubscription.getAttribute("data-cancel-subscription");
    if (!confirm("Cancel this subscription renewal?")) return;
    try {
      await api("/api/subscriptions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId })
      });
      await loadUserDashboard(true);
    } catch (error) {
      setMessage(error.message, "err");
    }
    return;
  }

  const deleteBtn = event.target.closest("[data-delete-course]");
  if (deleteBtn) {
    const id = deleteBtn.getAttribute("data-delete-course");
    if (!confirm("Delete this lesson?")) return;
    try {
      await api(`/api/admin/courses/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refreshAfterAdmin("Lesson deleted.");
    } catch (error) {
      setMessage(error.message, "err");
    }
  }
});

document.addEventListener("input", (event) => {
  const filter = event.target.closest("[data-scanner-filter]");
  if (!filter) return;
  const key = filter.name;
  state.scanner.filters[key] = filter.type === "checkbox" ? filter.checked : filter.value;
  clearTimeout(scannerFilterTimer);
  scannerFilterTimer = setTimeout(() => loadScannerData(true), 450);
});

document.addEventListener("change", (event) => {
  const stockMode = event.target.closest("[data-stock-mode]");
  if (stockMode) {
    const mode = stockMode.value || "Market Summary";
    state.marketHub.forms.stocks.mode = mode;
    state.marketHub.forms.stocks.selectedOption = stockAnalyzerOptionsForMode(mode)[0];
    state.marketHub.forms.stocks.timeframe = mode === "Day Trading"
      ? "1H"
      : mode === "Swing Trading"
        ? "4H"
        : mode === "Long-Term Investment"
          ? "1W"
          : "1D";
    state.marketHub.stockResult = null;
    render();
    return;
  }

  const filter = event.target.closest("[data-scanner-filter]");
  if (!filter) return;
  const key = filter.name;
  state.scanner.filters[key] = filter.type === "checkbox" ? filter.checked : filter.value;
  clearTimeout(scannerFilterTimer);
  loadScannerData(true);
});

window.addEventListener("popstate", () => {
  state.route = window.location.pathname;
  render();
});

(async function init() {
  try {
    applySessionFromUrl();
    await loadContent();
    render();
  } catch (error) {
    document.getElementById("app").innerHTML = `<section class="section"><div class="empty">Could not load site content: ${esc(error.message)}</div></section>`;
  }
})();

function howToUsePage() {
  document.title = "How to Use - Bull & Bear Trading Academy";
  return `
    <div class="pad layout-center">
      <div class="glass-card pad" style="max-width: 900px; width: 100%; border: 1px solid rgba(16, 185, 129, 0.4); box-shadow: 0 0 40px rgba(16, 185, 129, 0.1);">
        <div class="text-center">
          <h1 class="h2 neon-text">How to Use the Analyzer Pro</h1>
          <p class="lead muted">Master the AI Market Scanner in 4 Simple Steps.</p>
        </div>
        
        <div class="spacer"></div>
        
        <div class="grid-2">
          <div class="card pad glassmorphism">
            <h3 class="h3" style="color: var(--blue);">1. Choose Your Market</h3>
            <p class="muted">Select from Crypto, Forex, Gold, Stocks, or Commodities. Our live nodes connect to real-world financial data in milliseconds.</p>
          </div>
          <div class="card pad glassmorphism">
            <h3 class="h3" style="color: var(--blue);">2. Read the Risk Engine</h3>
            <p class="muted">The AI scans global economic calendars (FOMC, NFP) to determine real-time volatility. If risk is <strong style="color: var(--red);">EXTREME</strong>, do not trade.</p>
          </div>
          <div class="card pad glassmorphism">
            <h3 class="h3" style="color: var(--green);">3. Analyze the Signal</h3>
            <p class="muted">Review the calculated Entry Zones and Stop Losses. We calculate optimal risk/reward ratios based on structural liquidity.</p>
          </div>
          <div class="card pad glassmorphism">
            <h3 class="h3" style="color: var(--green);">4. Follow the Invalidation</h3>
            <p class="muted">If a candle closes beyond the Stop Loss, the setup is dead. The market structure has shifted. <strong>Do not hold onto hope.</strong></p>
          </div>
        </div>

        <div class="spacer"></div>
        
        <div class="card pad" style="background: rgba(16, 185, 129, 0.05); border: 1px solid var(--green);">
          <h3 class="h3 neon-text-green text-center">Ready to Dominate?</h3>
          <p class="lead text-center">Stop trading on emotion. Use the data.</p>
          <div style="display: flex; justify-content: center; gap: 1rem; margin-top: 1rem;">
            <a href="/analyzer" data-link class="btn primary glowing-btn">Open Analyzer</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.initAdvancedTradingViewWidget = function() {
  const container = document.getElementById("tv-advanced-chart");
  if (!container) return;
  if (container.hasChildNodes()) return;

  let symbol = "BINANCE:BTCUSDT";
  if (state.marketHub.activeTab === "crypto" && state.marketHub.forms.crypto.asset) {
    symbol = "BINANCE:" + state.marketHub.forms.crypto.asset.replace("/", "") + "USDT";
  } else if (state.marketHub.activeTab === "forex" && state.marketHub.forms.forex.pair) {
    symbol = "FX:" + state.marketHub.forms.forex.pair.replace("/", "");
  } else if (state.marketHub.activeTab === "commodities" && state.marketHub.forms.commodities.asset) {
    symbol = "OANDA:" + state.marketHub.forms.commodities.asset.replace("/", "");
  } else if (state.marketHub.activeTab === "stocks" && state.marketHub.forms.stocks.asset) {
    symbol = state.marketHub.forms.stocks.asset;
  }

  if (!window.TradingView) {
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.onload = () => createWidget(container.id, symbol);
    document.head.appendChild(script);
  } else {
    createWidget(container.id, symbol);
  }

  function createWidget(cid, sym) {
    new window.TradingView.widget({
      "width": "100%",
      "height": "250",
      "symbol": sym,
      "interval": "15",
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "backgroundColor": "rgba(5, 5, 5, 1)",
      "gridColor": "rgba(255, 255, 255, 0.04)",
      "hide_top_toolbar": false,
      "hide_legend": false,
      "save_image": false,
      "container_id": cid,
      "support_host": "https://www.tradingview.com"
    });
  }
};
