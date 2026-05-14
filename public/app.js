const CONTACT_EMAIL = "bullbearacademy.su@gmail.com";
const FREE_DISCORD_URL = "https://discord.gg/zcXkSV34H";

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
  adminPlatform: null,
  message: ""
};

let canvasFrame = 0;
let scannerPollTimer = null;
let scannerFilterTimer = null;
let adminPlatformLoadedAt = 0;
let userDashboardLoadedAt = 0;

const categories = [
  ["all", "All Courses"],
  ["beginner", "Beginner"],
  ["advanced", "Advanced"],
  ["technical-analysis", "Technical Analysis"],
  ["risk-management", "Risk Management"],
  ["psychology", "Psychology"]
];

const productFeatures = {
  course: [
    "Trading courses + book",
    "HD video lesson library",
    "Premium PDF guide",
    "Beginner to advanced content",
    "Lifetime bundle access"
  ],
  signals: [
    "Premium Discord rooms",
    "Signals delivered in Discord",
    "Live streams and voice sessions",
    "Member trade discussions",
    "Free Discord community available"
  ],
  arbitrage: [
    "Crypto opportunity scanner",
    "Clean table view",
    "Net spread focus",
    "Major exchanges",
    "Fast refresh workflow"
  ]
};

const legalPolicies = {
  "/privacy-policy": {
    eyebrow: "Privacy Policy",
    title: "Privacy Policy",
    updated: "May 14, 2026",
    intro: "This policy explains how Bull & Bear Trading Academy collects, uses, and protects information when visitors use the website, create an account, purchase digital products, or contact support.",
    sections: [
      ["Information We Collect", "We may collect account details, contact information, payment confirmation data, support messages, technical usage data, and product access records. Card details are handled by payment processors and are not stored by this website."],
      ["How We Use Information", "Information is used to provide course, book, Discord membership, and scanner access; process purchases; improve the platform; respond to support requests; protect accounts; and comply with legal obligations."],
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
    intro: "These terms govern access to Bull & Bear Trading Academy, including courses, books, Discord memberships, scanner tools, and related digital content.",
    sections: [
      ["Educational Purpose", "All content is provided for education and market analysis. It is not financial, investment, legal, or tax advice. Trading involves risk and users are responsible for their own decisions."],
      ["Accounts and Access", "Users must provide accurate account information and keep credentials secure. Access to paid products is personal and may not be resold, shared, copied, or redistributed."],
      ["Digital Products", "Courses, books, Discord memberships, and scanner subscriptions are delivered digitally. Premium signals are delivered inside Discord, not published publicly on the website."],
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
      ["Digital Product Sales", "One-time purchases such as courses and books provide digital access. Because digital products can be accessed immediately, purchases are generally final and non-refundable."],
      ["Subscription Services", "Premium Discord Signals and scanner subscriptions may be cancelled before the next billing cycle. Access continues until the end of the current paid period."],
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
      ["Recurring Subscriptions", "Premium Discord Signals and scanner products may be billed monthly. Renewal occurs automatically unless cancelled before the next billing date."],
      ["Cancellation", `Users may request cancellation by contacting ${CONTACT_EMAIL}. Cancellation stops future renewals but does not automatically refund the current active billing period.`],
      ["Failed Payments", "If a recurring payment fails, access may be paused until payment is completed. No penalty fee is charged by the platform for failed payment attempts."],
      ["Price Changes", "Prices may change over time. Existing subscribers should be notified before a material subscription price change takes effect."]
    ]
  }
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
  const response = await fetch(path, { ...options, headers });
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
  if (holder) holder.innerHTML = state.message;
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
  if (path === "/arbitrage") {
    loadScannerData();
    if (!scannerPollTimer) {
      scannerPollTimer = setInterval(() => loadScannerData(true), 12000);
    }
  } else if (scannerPollTimer) {
    clearInterval(scannerPollTimer);
    scannerPollTimer = null;
  }
  if (path === "/admin" && state.token && isAdmin()) loadAdminPlatform();
  if (path === "/profile" && state.token && state.user && !isAdmin()) loadUserDashboard();
}

function header() {
  const links = [
    ["/products", "Products"],
    ["/courses", "Courses"],
    ["/book", "Book"],
    ["/signals", "Discord"],
    ["/arbitrage", "Scanner"],
    ["/support", "Support"]
  ];
  const actions = state.user
    ? `
      <a href="${FREE_DISCORD_URL}" target="_blank" rel="noopener">Free Discord</a>
      ${isAdmin() ? `<a href="/admin" data-link class="admin-link">Admin</a>` : ""}
      <a href="/profile" data-link>${esc(state.user.name || "Profile")}</a>
      <button type="button" data-logout>Logout</button>
    `
    : `
      <a href="${FREE_DISCORD_URL}" target="_blank" rel="noopener">Free Discord</a>
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
    ["/courses", "Courses + Book"],
    ["/book", "Book"],
    ["/signals", "Discord Signals"],
    ["/arbitrage", "Scanner"]
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
          <a href="${FREE_DISCORD_URL}" target="_blank" rel="noopener">Join Free Discord</a>
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
  const cls = product.id === "course" ? "blue" : product.id === "signals" ? "gold" : product.id === "arbitrage" ? "green" : "red";
  const mark = product.id === "course" ? "2" : product.id === "signals" ? "D" : "A";
  const badge = product.id === "signals" ? `<div class="badge">MOST POPULAR</div>` : product.id === "arbitrage" ? `<div class="badge" style="background: var(--green); color:#03130e;">NEW FEATURE</div>` : "";
  const href = product.id === "course" ? "/courses" : product.id === "signals" ? "/signals" : "/arbitrage";

  return `
    <article class="card product-card" data-product="${esc(product.id)}">
      ${badge}
      <div class="body">
        <div class="product-top">
          <div class="icon-box ${cls}">${mark}</div>
          <span>${esc(product.cadence)}</span>
        </div>
        <h3 class="h3">${esc(product.title)}</h3>
        <p class="product-subtitle">${esc(product.subtitle)}</p>
        <p class="muted" style="line-height:1.55;margin:0;">${esc(product.description)}</p>
        <div class="price">$${money(product.price)} <span>/ ${esc(product.cadence)}</span></div>
        <ul class="feature-list">
          ${(productFeatures[product.id] || []).map((item) => `<li>${esc(item)}</li>`).join("")}
        </ul>
        <a href="${href}" data-link class="btn secondary" style="margin-top:auto;">${product.id === "signals" ? "View Discord Access" : "View Product"}</a>
      </div>
    </article>
  `;
}

function scannerPricingCards() {
  const plans = [
    {
      id: "arbitrage-only",
      name: "Arbitrage Scanner Only",
      price: 39.9,
      badge: "Scanner",
      features: ["Live exchange scanner", "Advanced filters", "Browser alerts", "Saved opportunities", "Monthly subscription"]
    },
    {
      id: "bull-bear-premium",
      name: "Bull & Bear Premium",
      price: 79.9,
      badge: "Best Value",
      features: ["Arbitrage scanner", "VIP Discord signals", "Course videos", "Trading book", "Premium Discord access"]
    }
  ];
  return `
    <div class="pricing-grid">
      ${plans.map((plan) => `
        <article class="pricing-card ${plan.id === "bull-bear-premium" ? "featured" : ""}">
          <span>${esc(plan.badge)}</span>
          <h3 class="h3">${esc(plan.name)}</h3>
          <div class="price">$${money(plan.price)} <span>/ monthly</span></div>
          <ul class="feature-list">${plan.features.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
          <button class="btn ${plan.id === "bull-bear-premium" ? "primary" : "secondary"}" data-checkout-plan="${esc(plan.id)}">${state.user ? "Start Subscription" : "Log In to Subscribe"}</button>
        </article>
      `).join("")}
    </div>
  `;
}

function courseCard(course) {
  const image = course.thumbnailUrl
    ? `<img src="${esc(media(course.thumbnailUrl))}" alt="${esc(course.title)}">`
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
      <div class="hero-inner">
        <div class="hero-copy">
          <div class="eyebrow">Premium Trading Education</div>
          <h1 class="h1" style="margin-top:18px;">Master The <span class="gold-text">Markets</span></h1>
          <p class="lead">
            Professional trading courses, the Bull & Bear trading book, premium Discord signals, live streams, and market tools built for disciplined traders.
          </p>
          <div class="hero-badges" aria-label="Academy highlights">
            <span>Video academy</span>
            <span>2-in-1 trading bundle</span>
            <span>Premium Discord</span>
            <span>Crypto scanner</span>
          </div>
          <div class="hero-actions">
            <a href="/products" data-link class="btn primary">Start Learning</a>
            <a href="${FREE_DISCORD_URL}" target="_blank" rel="noopener" class="btn secondary">Join Free Discord</a>
          </div>
        </div>
      </div>
      ${ticker()}
    </section>
  `;
}

function homePage() {
  const { products, courses, book } = state.content;
  return `
    ${heroSection()}
    <section class="section compact">
      <div class="metric-strip">
        <div><strong>3</strong><span>Core products</span></div>
        <div><strong>${courses.length}</strong><span>Video lessons ready</span></div>
        <div><strong>Discord</strong><span>Signals and live streams</span></div>
        <div><strong>24/7</strong><span>Digital access</span></div>
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
          <p class="lead">Courses and the trading book are now one bundle. Signals and community activity live inside Discord, where members can follow premium rooms, live streams, and discussions.</p>
        </div>
        <div class="process-list">
          <div><strong>01</strong><span>Learn structure and risk rules</span></div>
          <div><strong>02</strong><span>Study the included trading book</span></div>
          <div><strong>03</strong><span>Join Discord for signals and live streams</span></div>
        </div>
      </div>
    </section>
    <section class="section compact">
      <div class="discord-panel">
        <div>
          <div class="eyebrow">Discord Community</div>
          <h2 class="h2" style="margin-top:12px;">Signals Are Delivered in Discord</h2>
          <p class="lead">We do not publish private signals on the website. Free members can join the public Discord, while premium members receive access to private signal rooms, live streams, voice sessions, and more.</p>
          <div class="hero-actions">
            <a href="${FREE_DISCORD_URL}" target="_blank" rel="noopener" class="btn primary">Join Free Discord</a>
            <a href="/signals" data-link class="btn secondary">View Premium Discord</a>
          </div>
        </div>
        <div class="process-list">
          <div><strong>Free</strong><span>Community chat and announcements</span></div>
          <div><strong>Pro</strong><span>Private signals and trade ideas</span></div>
          <div><strong>Live</strong><span>Streams, voice rooms, and member Q&A</span></div>
        </div>
      </div>
    </section>
    <section class="section compact">
      <div class="card pad">
        <div class="book-layout">
          <div class="book-cover">${bookCover(book)}</div>
          <div>
            <div class="eyebrow">Included in Bundle</div>
            <h2 class="h2" style="margin-top:12px;">Courses + ${esc(book.title)}</h2>
            <p class="lead">${esc(book.description)}</p>
            <div class="hero-actions">
              <a href="/courses" data-link class="btn primary">View $49.90 Bundle</a>
              <a href="/book" data-link class="btn secondary">View Book</a>
            </div>
          </div>
        </div>
      </div>
    </section>
    <section class="section compact">
      <div class="section-head">
        <div>
          <div class="eyebrow">Education Library</div>
          <h2 class="h2" style="margin-top:12px;">Featured Lessons</h2>
        </div>
        <a href="/courses" data-link class="btn secondary small">All Courses</a>
      </div>
      <div class="grid three">${courses.slice(0, 3).map(courseCard).join("")}</div>
    </section>
  `;
}

function productsPage() {
  return `
    <section class="section">
      <div class="section-head center">
        <div class="eyebrow">Premium Products</div>
        <h1 class="h2">Choose Your <span class="gold-text">Trading Journey</span></h1>
        <p class="lead">Start with the 2-in-1 academy bundle, join premium Discord, or subscribe to the live arbitrage scanner.</p>
      </div>
      <div class="grid products">${state.content.products.map(productCard).join("")}</div>
      <div class="section-head center" style="margin-top:44px;">
        <div class="eyebrow">Scanner SaaS Plans</div>
        <h2 class="h2">Subscription Access</h2>
      </div>
      ${scannerPricingCards()}
      <div class="discord-mini">
        <span>Free Discord community is open to everyone.</span>
        <a href="${FREE_DISCORD_URL}" target="_blank" rel="noopener" class="btn secondary small">Join Free Discord</a>
      </div>
    </section>
  `;
}

function coursesPage() {
  const filtered = state.selectedCategory === "all"
    ? state.content.courses
    : state.content.courses.filter((course) => course.category === state.selectedCategory);
  return `
    <section class="section">
      <div class="section-head center">
        <div class="eyebrow">2-in-1 Bundle</div>
        <h1 class="h2">Trading Courses + Book</h1>
        <p class="lead">One $49.90 product includes the video course library and the Game of Candles trading book.</p>
      </div>
      <div class="card pad bundle-callout">
        <div>
          <h2 class="h3">Complete Education Bundle</h2>
          <p class="muted">A focused trading education package with practical lessons, structured market concepts, risk frameworks, and the included Game of Candles PDF.</p>
        </div>
        <div class="price">$49.90 <span>/ one-time</span></div>
      </div>
      <div class="pill-row">
        ${categories.map(([id, label]) => `<button class="pill ${state.selectedCategory === id ? "active" : ""}" data-category="${id}">${label}</button>`).join("")}
      </div>
      ${filtered.length ? `<div class="grid three">${filtered.map(courseCard).join("")}</div>` : `<div class="empty">No lessons in this category yet.</div>`}
      ${courseModal()}
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

function bookCover(book) {
  if (book?.coverUrl) return `<img src="${esc(media(book.coverUrl))}" alt="${esc(book.title)} cover">`;
  return `<div class="book-cover-fallback"><strong>Bull & Bear</strong><span>Trading Mastery</span></div>`;
}

function bookPage() {
  const book = state.content.book;
  const pdfActions = book.pdfUrl
    ? `<a href="${esc(media(book.pdfUrl))}" target="_blank" rel="noopener" class="btn primary">Read Online</a>
       <a href="${esc(media(book.pdfUrl))}" download class="btn secondary">Download PDF</a>`
    : `<button class="btn secondary" disabled>PDF Coming Soon</button>`;
  return `
    <section class="section">
      <div class="card pad">
        <div class="book-layout">
          <div class="book-cover">${bookCover(book)}</div>
          <div>
            <div class="eyebrow">Included in Academy Bundle</div>
            <h1 class="h2" style="margin-top:12px;">${esc(book.title)}</h1>
            <p class="lead">${esc(book.description)} This book is included together with all trading courses in the $49.90 education bundle.</p>
            <ul class="feature-list">
              <li>Included with all trading courses</li>
              <li>Complete trading methodology</li>
              <li>Risk management frameworks</li>
              <li>Trading psychology mastery</li>
              <li>Real chart examples</li>
              <li>Lifetime updates</li>
            </ul>
            <div class="price">$49.90 <span>/ courses + book</span></div>
            <div class="hero-actions">
              <a href="/courses" data-link class="btn primary">View Bundle</a>
              ${pdfActions}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function signalsPage() {
  return `
    <section class="section">
      <div class="discord-hero">
        <div>
          <div class="eyebrow">Discord Signals</div>
          <h1 class="h2" style="margin-top:12px;">Premium Signals Live Inside Discord</h1>
          <p class="lead">We do not publish private signals on the website. After purchasing the Signals product, members receive premium Discord access for private signal rooms, live streams, market discussions, and more.</p>
          <div class="hero-actions">
            <a href="${FREE_DISCORD_URL}" target="_blank" rel="noopener" class="btn secondary">Join Free Discord</a>
            <a href="/login" data-link class="btn primary">${state.user ? "Purchase Premium Access" : "Log In to Purchase"}</a>
          </div>
        </div>
        <div class="card pad">
          <div class="price">$19.90 <span>/ monthly</span></div>
          <ul class="feature-list">
            <li>Premium Discord membership after purchase</li>
            <li>Private signal rooms and trade ideas</li>
            <li>Live streams and voice sessions</li>
            <li>Market watchlists and member discussions</li>
            <li>Free Discord community link available to everyone</li>
          </ul>
        </div>
      </div>
      <div class="grid three" style="margin-top:24px;">
        <div class="card pad">
          <h2 class="h3">Free Discord</h2>
          <p class="muted">Join the public community for announcements, beginner discussion, and academy updates.</p>
          <a href="${FREE_DISCORD_URL}" target="_blank" rel="noopener" class="btn secondary small" style="margin-top:14px;">Join Free</a>
        </div>
        <div class="card pad">
          <h2 class="h3">Premium Signals</h2>
          <p class="muted">Paid members get private Discord rooms where signals and trade planning are delivered.</p>
        </div>
        <div class="card pad">
          <h2 class="h3">Live Streams</h2>
          <p class="muted">Premium Discord also includes live streams, voice rooms, Q&A sessions, and more member activity.</p>
        </div>
      </div>
    </section>
  `;
}

function arbitragePage() {
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
    <section class="section">
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
            <p class="muted">Checkout records, provider webhooks, subscription activation, cancellation, and payment logs are prepared for Payriff, ePoint, Yigim, crypto, and card payments.</p>
          </div>
          <div class="card pad">
            <h2 class="h3">Discord Membership</h2>
            <p class="muted">Premium plans include the structure for Discord OAuth, bot role syncing, premium role removal after expiry, and the free community invite.</p>
          </div>
          <div class="card pad">
            <h2 class="h3">Alerts</h2>
            <p class="muted">The platform is ready for browser, email, Telegram, and Discord alerts when high-spread opportunities or membership events appear.</p>
          </div>
        </div>

        <div class="section-head center" style="margin-top:34px;">
          <div class="eyebrow">Pricing</div>
          <h2 class="h2">Scanner Subscriptions</h2>
          <p class="lead">Choose scanner-only access or unlock the full Bull & Bear premium membership.</p>
        </div>
        ${scannerPricingCards()}
      </div>
    </section>
  `;
}

function supportPage() {
  return `
    <section class="section">
      <div class="support-hero">
        <div>
          <div class="eyebrow">Support</div>
          <h1 class="h2" style="margin-top:12px;">Contact Support</h1>
          <p class="lead">For product access, payments, course videos, book downloads, or account support, use the contact details here.</p>
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
        <div class="card pad"><h2 class="h3">Product Access</h2><p class="muted">Help with courses, book PDF access, signals, and scanner subscriptions.</p></div>
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
              ? "Your checkout record has been created. Live provider credentials and webhooks activate subscriptions automatically after confirmed payment."
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
  const payments = dashboard.payments || [];
  const recent = dashboard.recentOpportunities || state.scanner.opportunities.slice(0, 5);
  return `
    <section class="section">
      <div class="section-head">
        <div>
          <div class="eyebrow">Account</div>
          <h1 class="h2" style="margin-top:12px;">Welcome, ${esc(state.user.name || "Trader")}</h1>
          <p class="lead">Your dashboard tracks subscription access, billing, Discord connection, notifications, and recent scanner opportunities.</p>
        </div>
        <button class="btn secondary small" data-logout>Logout</button>
      </div>
      <div class="grid three">
        <div class="card pad">
          <h2 class="h3">Active Subscription</h2>
          <p class="muted">${activeSubscription ? `${esc(activeSubscription.planId)} until ${new Date(activeSubscription.expiresAt).toLocaleDateString()}` : "No active subscription yet."}</p>
          ${activeSubscription ? `<button class="btn danger small" data-cancel-subscription="${esc(activeSubscription.id)}">Cancel Auto-Renew</button>` : `<a href="/products" data-link class="btn primary small">View Plans</a>`}
        </div>
        <div class="card pad">
          <h2 class="h3">Discord</h2>
          <p class="muted">${dashboard.discord?.premiumRole ? "Premium role ready after Discord connection." : "Connect Discord after purchasing premium access."}</p>
          <a href="${FREE_DISCORD_URL}" target="_blank" rel="noopener" class="btn secondary small">Free Discord</a>
        </div>
        <div class="card pad">
          <h2 class="h3">Billing History</h2>
          <p class="muted">${payments.length ? `${payments.length} payment record${payments.length === 1 ? "" : "s"} saved.` : "No payment records yet."}</p>
          <a href="/products" data-link class="btn secondary small">Plans</a>
        </div>
      </div>
      <div class="grid two" style="margin-top:24px;">
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
          ${adminTabButton("book", "Book")}
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
  if (state.adminTab === "courses") return adminCoursesPanel();
  if (state.adminTab === "book") return adminBookPanel();
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
          ${["payriff", "epoint", "yigim", "crypto", "card"].map((name) => `
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

function adminCoursesPanel() {
  return `
    <div class="grid">
      <div class="card pad">
        <h2 class="h3">Upload Video Lesson</h2>
        <form class="form-grid" onsubmit="return submitCourse(event)" enctype="multipart/form-data">
          <div class="form-grid two">
            <div class="field">
              <label>Lesson Title</label>
              <input name="title" required placeholder="Market Structure Foundations">
            </div>
            <div class="field">
              <label>Category</label>
              <select name="category">
                ${categories.filter(([id]) => id !== "all").map(([id, label]) => `<option value="${id}">${label}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="field">
            <label>Description</label>
            <textarea name="description" required placeholder="Describe what this lesson teaches"></textarea>
          </div>
          <div class="form-grid two">
            <div class="field">
              <label>Duration</label>
              <input name="duration" placeholder="42 min">
            </div>
            <label class="checkbox-row" style="align-self:end;margin-bottom:10px;">
              <input type="checkbox" name="isFree">
              Free preview lesson
            </label>
          </div>
          <div class="form-grid two">
            <div class="field">
              <label>Video File</label>
              <input type="file" name="videoFile" accept="video/*" required>
            </div>
            <div class="field">
              <label>Thumbnail Image</label>
              <input type="file" name="thumbnailFile" accept="image/*">
            </div>
          </div>
          <button class="btn primary" type="submit">Upload Video Lesson</button>
          <div data-status>${state.message}</div>
        </form>
      </div>
      <div class="card pad">
        <h2 class="h3">Existing Lessons</h2>
        <div class="table-list" style="margin-top:14px;">
          ${state.content.courses.map((course) => `
            <div class="table-row">
              <div>
                <strong>${esc(course.title)}</strong>
                <div class="faint">${esc(course.category)} ${course.videoUrl ? " / video uploaded" : " / no video yet"}</div>
              </div>
              <button class="btn danger small" data-delete-course="${esc(course.id)}">Delete</button>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function adminBookPanel() {
  const book = state.content.book;
  return `
    <div class="card pad">
      <h2 class="h3">Upload Trading Book</h2>
      <form class="form-grid" onsubmit="return submitBook(event)" enctype="multipart/form-data">
        <div class="form-grid two">
          <div class="field">
            <label>Book Title</label>
            <input name="title" required value="${esc(book.title)}">
          </div>
          <div class="field">
            <label>Bundle Price</label>
            <input name="price" type="number" step="0.01" min="0" value="${esc(book.price)}">
          </div>
        </div>
        <div class="field">
          <label>Description</label>
          <textarea name="description" required>${esc(book.description)}</textarea>
        </div>
        <div class="form-grid two">
          <div class="field">
            <label>PDF File</label>
            <input type="file" name="bookFile" accept="application/pdf,.pdf">
            <small class="faint">Upload a PDF file. Existing PDF stays active if you only edit text or cover.</small>
          </div>
          <div class="field">
            <label>Cover Image</label>
            <input type="file" name="coverFile" accept="image/*">
            <small class="faint">Optional JPG, PNG, or WebP cover.</small>
          </div>
        </div>
        <button class="btn primary" type="submit">Save Book</button>
        <div data-status>${state.message}</div>
      </form>
      <div class="table-list" style="margin-top:18px;">
        <div class="table-row">
          <div>
            <strong>Current PDF</strong>
            <div class="faint">${book.pdfUrl ? esc(book.pdfUrl) : "No PDF uploaded yet"}</div>
          </div>
          ${book.pdfUrl ? `<a class="btn secondary small" href="${esc(book.pdfUrl)}" target="_blank" rel="noopener">Open</a>` : ""}
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
  if (path === "/") return homePage();
  if (path === "/products") return productsPage();
  if (path === "/courses") return coursesPage();
  if (path === "/book") return bookPage();
  if (path === "/signals") return signalsPage();
  if (path === "/arbitrage") return arbitragePage();
  if (path === "/support") return supportPage();
  if (path === "/login") return authPage("login");
  if (path === "/register") return authPage("register");
  if (path === "/payment/success") return paymentStatusPage("success");
  if (path === "/payment/failed") return paymentStatusPage("failed");
  if (path === "/profile") return profilePage();
  if (path === "/admin") return adminPage();
  if (legalPolicies[path]) return policyPage(path);
  return notFoundPage();
}

function render() {
  const app = document.getElementById("app");
  if (!state.content) {
    app.innerHTML = `<main class="main"><section class="section"><div class="empty">Loading...</div></section></main>`;
    return;
  }
  app.innerHTML = `<div class="app">${header()}<main class="main">${page()}</main>${footer()}</div>`;
  initMarketCanvas();
  mountRouteEffects();
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
    navigate("/profile");
  } catch (error) {
    setMessage(error.message, "err");
  }
  return false;
};

window.submitCourse = async function submitCourse(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  data.set("isFree", form.elements.isFree.checked ? "true" : "false");
  setMessage("Uploading video lesson...");
  try {
    await api("/api/admin/courses", { method: "POST", body: data });
    await refreshAfterAdmin("Video lesson uploaded.");
  } catch (error) {
    setMessage(error.message, "err");
  }
  return false;
};

window.submitBook = async function submitBook(event) {
  event.preventDefault();
  setMessage("Saving book files...");
  try {
    await api("/api/admin/book", { method: "POST", body: new FormData(event.currentTarget) });
    await refreshAfterAdmin("Book saved.");
  } catch (error) {
    setMessage(error.message, "err");
  }
  return false;
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
  const link = event.target.closest("a[data-link]");
  if (link) {
    event.preventDefault();
    navigate(link.getAttribute("href"));
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

  const checkout = event.target.closest("[data-checkout-plan]");
  if (checkout) {
    if (!state.user) {
      navigate("/login");
      return;
    }
    const planId = checkout.getAttribute("data-checkout-plan");
    setMessage("Creating checkout...");
    try {
      const result = await api("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, provider: "manual" })
      });
      state.message = `<div class="status ok">${esc(result.message || "Checkout created.")}</div>`;
      navigate(result.payment?.checkoutUrl || "/payment/success");
    } catch (error) {
      setMessage(error.message, "err");
    }
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
