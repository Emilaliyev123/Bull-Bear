const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_URL = String(process.env.APP_URL || "").replace(/\/+$/, "");
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const SEED_FILE = path.join(DATA_DIR, "seed.json");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const PUBLIC_DIR = path.join(ROOT, "public");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "BullBearAdmin#2026!Q7";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "bull-bear-academy-session-secret-2026";
const SCANNER_REFRESH_MS = Number(process.env.SCANNER_REFRESH_MS || 12000);
const DEFAULT_NOTIONAL_USD = Number(process.env.SCANNER_NOTIONAL_USD || 1000);
const MAX_REASONABLE_SPREAD_PCT = Number(process.env.SCANNER_MAX_SPREAD_PCT || 25);
const MIN_SCANNER_PRICE = Number(process.env.SCANNER_MIN_PRICE || 0.00000001);
const PAYMENT_PLANS = {
  "education-bundle": {
    name: "Courses + Trading Book",
    amount: 49.9,
    cadence: "one-time",
    accessDays: 3650
  },
  "premium-discord-signals": {
    name: "AI + Premium Discord Signals",
    amount: 49.9,
    cadence: "monthly",
    accessDays: 30
  },
  "investor-trader-ai": {
    name: "Investor & Trader AI",
    amount: 19.9,
    cadence: "monthly",
    accessDays: 30
  },
  "arbitrage-only": {
    name: "Arbitrage Scanner Only",
    amount: 39.9,
    cadence: "monthly",
    accessDays: 30
  }
};
const AI_ACCESS_PLAN_IDS = new Set(["premium-discord-signals", "investor-trader-ai"]);
const PAYMENT_DEFAULT_PROVIDER = process.env.PAYMENT_DEFAULT_PROVIDER || "payriff";
const PAYRIFF_BASE_URL = (process.env.PAYRIFF_BASE_URL || "https://api.payriff.com").replace(/\/+$/, "");
const PAYRIFF_CREATE_PATH = process.env.PAYRIFF_CREATE_PATH || "/api/v3/orders";
const PAYRIFF_ORDER_PATH = process.env.PAYRIFF_ORDER_PATH || "/api/v3/orders/:orderId";
const PAYRIFF_CURRENCY = process.env.PAYRIFF_CURRENCY || "USD";
const PAYRIFF_LANGUAGE = process.env.PAYRIFF_LANGUAGE || "EN";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const AI_USE_OPENAI = String(process.env.AI_USE_OPENAI || "false").toLowerCase() === "true";
const AI_MAX_REQUESTS_PER_WINDOW = Number(process.env.AI_MAX_REQUESTS_PER_WINDOW || 10);
const AI_RATE_WINDOW_MS = Number(process.env.AI_RATE_WINDOW_MS || 10 * 60 * 1000);

app.set("trust proxy", true);

const uploadFolders = {
  videoFile: "videos",
  thumbnailFile: "images",
  coverFile: "images",
  bookFile: "books",
  imageFile: "images"
};

function ensureProjectFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const folder of Object.values(uploadFolders)) {
    fs.mkdirSync(path.join(UPLOAD_DIR, folder), { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.copyFileSync(SEED_FILE, DATA_FILE);
  }
}

function readDb() {
  ensureProjectFiles();
  const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  db.users = Array.isArray(db.users) ? db.users : [];
  db.subscriptions = Array.isArray(db.subscriptions) ? db.subscriptions : [];
  db.payments = Array.isArray(db.payments) ? db.payments : [];
  db.paymentLogs = Array.isArray(db.paymentLogs) ? db.paymentLogs : [];
  db.auditLogs = Array.isArray(db.auditLogs) ? db.auditLogs : [];
  db.announcements = Array.isArray(db.announcements) ? db.announcements : [];
  db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
  db.scannerControls = db.scannerControls || {
    enabled: true,
    minSpread: 0.25,
    notionalUsd: DEFAULT_NOTIONAL_USD,
    refreshMs: SCANNER_REFRESH_MS
  };
  return db;
}

function writeDb(db) {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(db, null, 2)}\n`);
  fs.renameSync(tmp, DATA_FILE);
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "item";
}

function safeFileName(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const base = slug(path.basename(file.originalname || "upload", ext));
  return `${Date.now()}-${crypto.randomBytes(5).toString("hex")}-${base}${ext}`;
}

function publicFileUrl(file) {
  if (!file) return "";
  const rel = path.relative(ROOT, file.path).split(path.sep).join("/");
  return `/${rel}`;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const attempted = hashPassword(password, salt).split(":")[1];
  const attemptedBuffer = Buffer.from(attempted, "hex");
  const hashBuffer = Buffer.from(hash, "hex");
  return attemptedBuffer.length === hashBuffer.length && crypto.timingSafeEqual(attemptedBuffer, hashBuffer);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || "user",
    isAdmin: user.role === "admin"
  };
}

function nowIso() {
  return new Date().toISOString();
}

function addAuditLog(action, actor, meta = {}) {
  try {
    const db = readDb();
    db.auditLogs.unshift({
      id: `audit-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      action,
      actor: actor || "system",
      meta,
      createdAt: nowIso()
    });
    db.auditLogs = db.auditLogs.slice(0, 500);
    writeDb(db);
  } catch (error) {
    console.warn("Audit log failed:", error.message);
  }
}

function activateSubscription(db, userId, planId, paymentId) {
  const plan = PAYMENT_PLANS[planId] || PAYMENT_PLANS["arbitrage-only"];
  const days = plan.accessDays || 30;
  const now = Date.now();
  const existing = db.subscriptions.find((item) => item.userId === userId && item.planId === planId && item.status === "active");
  const expiresAt = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
  if (existing) {
    existing.expiresAt = expiresAt;
    existing.autoRenew = plan.cadence === "monthly";
    existing.paymentId = paymentId || existing.paymentId;
    existing.updatedAt = nowIso();
    return existing;
  }
  const subscription = {
    id: `sub-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    userId,
    planId,
    status: "active",
    autoRenew: plan.cadence === "monthly",
    currentPeriodStart: nowIso(),
    expiresAt,
    paymentId,
    createdAt: nowIso()
  };
  db.subscriptions.unshift(subscription);
  return subscription;
}

function isPremiumDiscordPlan(planId) {
  return planId === "premium-discord-signals";
}

function hasActiveSubscription(db, userId, planIds) {
  if (!userId) return false;
  const now = Date.now();
  return db.subscriptions.some((item) => (
    item.userId === userId
    && item.status === "active"
    && planIds.has(item.planId)
    && (!item.expiresAt || new Date(item.expiresAt).getTime() > now)
  ));
}

function hasAiAccess(db, auth = {}) {
  return Boolean(auth.admin || hasActiveSubscription(db, auth.userId, AI_ACCESS_PLAN_IDS));
}

function notifySubscriptionActivated(db, payment) {
  const alreadyExists = db.notifications.some((item) => item.paymentId === payment.id && item.type === "subscription");
  if (alreadyExists) return;
  const plan = PAYMENT_PLANS[payment.planId] || { name: payment.planId };
  db.notifications.unshift({
    id: `note-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    userId: payment.userId,
    paymentId: payment.id,
    type: "subscription",
    title: "Access activated",
    body: `Your ${plan.name} access is active.`,
    createdAt: nowIso()
  });
}

function finalizePaidPayment(db, payment, providerPayload = {}) {
  const wasPaid = payment.status === "paid";
  payment.status = "paid";
  payment.providerPayload = providerPayload;
  payment.paidAt = payment.paidAt || nowIso();
  payment.updatedAt = nowIso();
  const subscription = activateSubscription(db, payment.userId, payment.planId, payment.id);
  if (!wasPaid) {
    notifySubscriptionActivated(db, payment);
    const user = db.users.find((item) => item.id === payment.userId);
    if (isPremiumDiscordPlan(payment.planId)) {
      syncDiscordRole(user, true).catch((error) => console.warn("Discord role sync failed:", error.message));
    }
  }
  return subscription;
}

function findCheckoutUrl(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/https?:\/\/[^\s"'<>]+/i);
    return match ? match[0] : "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCheckoutUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    const preferredKeys = [
      "url",
      "redirectUrl",
      "redirect_url",
      "paymentUrl",
      "payment_url",
      "checkoutUrl",
      "checkout_url",
      "link",
      "href"
    ];
    for (const key of preferredKeys) {
      const found = findCheckoutUrl(value[key]);
      if (found) return found;
    }
    for (const item of Object.values(value)) {
      const found = findCheckoutUrl(item);
      if (found) return found;
    }
  }
  return "";
}

function payriffConfig() {
  return {
    baseUrl: PAYRIFF_BASE_URL,
    secretKey: process.env.PAYRIFF_SECRET_KEY,
    createPath: PAYRIFF_CREATE_PATH,
    orderPath: PAYRIFF_ORDER_PATH,
    currency: PAYRIFF_CURRENCY,
    language: PAYRIFF_LANGUAGE
  };
}

function isPayriffConfigured() {
  const config = payriffConfig();
  return Boolean(config.baseUrl && config.secretKey);
}

function payriffAmount(amount) {
  return Number(Number(amount || 0).toFixed(2));
}

function payriffMessage(payload = {}, fallback = "Payriff request failed") {
  return payload?.message
    || payload?.error
    || payload?.payload?.message
    || payload?.payload?.error
    || fallback;
}

function payriffReference(payload = {}) {
  return String(
    payload?.payload?.orderId
    || payload?.payload?.id
    || payload?.orderId
    || payload?.id
    || payload?.order_id
    || payload?.transactionId
    || ""
  );
}

function payriffStatus(payload = {}) {
  const value = payload?.payload?.paymentStatus
    || payload?.payload?.status
    || payload?.payload?.orderStatus
    || payload?.paymentStatus
    || payload?.status
    || payload?.orderStatus
    || payload?.transactionStatus
    || "";
  return String(value).trim().toUpperCase();
}

function isPayriffPaid(payload = {}) {
  return ["PAID", "APPROVED", "COMPLETED", "SUCCESS", "SUCCEEDED"].includes(payriffStatus(payload));
}

function applyPayriffStatusToPayment(db, payment, payload = {}) {
  if (isPayriffPaid(payload)) {
    return finalizePaidPayment(db, payment, payload);
  }
  const status = payriffStatus(payload);
  const failedStatuses = new Set(["CANCELED", "CANCELLED", "DECLINED", "EXPIRED", "FAILED", "REJECTED"]);
  const pendingStatuses = new Set(["", "CREATED", "PENDING", "PREAUTH", "PROCESSING", "WAITING"]);
  payment.status = failedStatuses.has(status)
    ? "failed"
    : pendingStatuses.has(status) ? "pending" : status.toLowerCase();
  payment.providerPayload = payload;
  payment.updatedAt = nowIso();
  return null;
}

async function callPayriff(method, pathname, body = null) {
  const config = payriffConfig();
  if (!isPayriffConfigured()) {
    throw new Error("Payriff is not configured. Add PAYRIFF_SECRET_KEY in Render environment variables.");
  }
  const targetUrl = `${config.baseUrl}${pathname}`;
  let response;
  try {
    response = await fetch(targetUrl, {
      method,
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "Authorization": config.secretKey
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    const detail = error.cause?.code || error.cause?.message || error.name || "network_error";
    console.warn("Payriff network request failed:", { targetUrl, detail });
    throw new Error(`Payriff network error: ${detail}`);
  }
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(payriffMessage(payload, `Payriff returned ${response.status}`));
  }
  if (payload?.code && !["00000", "0", "success", "SUCCESS"].includes(String(payload.code))) {
    throw new Error(payriffMessage(payload));
  }
  return payload;
}

async function createPayriffCheckout(req, payment, plan, planId) {
  const config = payriffConfig();
  const baseUrl = requestBaseUrl(req);
  const callbackUrl = `${baseUrl}/api/payments/webhook/payriff`;
  const payload = await callPayriff("POST", config.createPath, {
    amount: payriffAmount(plan.amount),
    currency: config.currency,
    description: `Bull & Bear - ${plan.name}`,
    callbackUrl,
    cardSave: false,
    operation: "PURCHASE",
    language: config.language,
    metadata: {
      paymentId: payment.id,
      planId,
      userId: payment.userId
    }
  });
  const checkoutUrl = findCheckoutUrl(payload);
  if (!checkoutUrl) throw new Error(payriffMessage(payload, "Payriff did not return a checkout URL"));
  payment.status = "checkout_created";
  payment.checkoutUrl = checkoutUrl;
  payment.providerReference = payriffReference(payload) || payment.id;
  payment.providerPayload = payload;
  payment.updatedAt = nowIso();
  return payload;
}

async function getPayriffPaymentStatus(reference) {
  const config = payriffConfig();
  const encoded = encodeURIComponent(reference);
  const pathname = config.orderPath
    .replace(":orderId", encoded)
    .replace("{orderId}", encoded)
    .replace(":id", encoded)
    .replace("{id}", encoded);
  return callPayriff("GET", pathname);
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", ADMIN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [body, sig] = String(token || "").split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", ADMIN_SECRET).update(body).digest("base64url");
    const sigBuffer = Buffer.from(sig);
    const expectedBuffer = Buffer.from(expected);
    if (sigBuffer.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = verifyToken(token);
  if (!payload?.admin) {
    return res.status(401).json({ error: "Admin login required" });
  }
  req.admin = payload;
  return next();
}

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Login required" });
  }
  req.auth = payload;
  return next();
}

function optionalAuth(req, _res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = token ? verifyToken(token) : null;
  req.auth = payload || { role: "guest", guest: true };
  return next();
}

function requestBaseUrl(req) {
  return APP_URL || `${req.protocol}://${req.get("host")}`;
}

function oauthRedirectUrl(req, provider) {
  return `${requestBaseUrl(req)}/api/auth/oauth/${provider}/callback`;
}

function oauthConfig(provider, req) {
  if (provider === "google") {
    return {
      provider,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
      scope: "openid email profile",
      redirectUri: oauthRedirectUrl(req, provider)
    };
  }
  if (provider === "discord") {
    return {
      provider,
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorizeUrl: "https://discord.com/oauth2/authorize",
      tokenUrl: "https://discord.com/api/oauth2/token",
      userUrl: "https://discord.com/api/users/@me",
      scope: "identify email guilds.join",
      redirectUri: oauthRedirectUrl(req, provider)
    };
  }
  return null;
}

async function syncDiscordRole(user, shouldHaveRole) {
  if (!user?.discordId || !process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_GUILD_ID || !process.env.DISCORD_PREMIUM_ROLE_ID) return false;
  const method = shouldHaveRole ? "PUT" : "DELETE";
  const url = `https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${user.discordId}/roles/${process.env.DISCORD_PREMIUM_ROLE_ID}`;
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
  });
  return response.ok;
}

function upsertOauthUser(db, provider, profile) {
  const email = normalizeEmail(profile.email);
  if (!email) throw new Error(`${provider} did not return an email address`);
  let user = db.users.find((item) => item.email === email);
  if (!user) {
    user = {
      id: `user-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      name: profile.name || profile.username || email.split("@")[0],
      email,
      passwordHash: hashPassword(crypto.randomBytes(18).toString("hex")),
      role: "user",
      createdAt: nowIso()
    };
    db.users.push(user);
  }
  user.name = user.name || profile.name || profile.username || email.split("@")[0];
  user[`${provider}Id`] = profile.id;
  user.emailVerified = true;
  user.updatedAt = nowIso();
  return user;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const folder = uploadFolders[file.fieldname] || "images";
    cb(null, path.join(UPLOAD_DIR, folder));
  },
  filename(req, file, cb) {
    cb(null, safeFileName(file));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 900 * 1024 * 1024
  },
  fileFilter(req, file, cb) {
    const name = file.fieldname;
    const type = file.mimetype || "";
    const original = file.originalname || "";
    if (name === "videoFile" && type.startsWith("video/")) return cb(null, true);
    if (name === "bookFile" && (type === "application/pdf" || original.toLowerCase().endsWith(".pdf"))) return cb(null, true);
    if (["thumbnailFile", "coverFile", "imageFile"].includes(name) && type.startsWith("image/")) return cb(null, true);
    return cb(new Error(`Unsupported file type for ${name}`));
  }
});

const exchangeAdapters = [
  {
    id: "binance",
    name: "Binance",
    url: "https://api.binance.com/api/v3/ticker/24hr",
    parse: (data) => data.map((item) => ({
      pair: item.symbol,
      price: item.lastPrice,
      bid: item.bidPrice,
      ask: item.askPrice,
      volume: item.quoteVolume
    }))
  },
  {
    id: "bybit",
    name: "Bybit",
    url: "https://api.bybit.com/v5/market/tickers?category=spot",
    parse: (data) => (data.result?.list || []).map((item) => ({
      pair: item.symbol,
      price: item.lastPrice,
      bid: item.bid1Price,
      ask: item.ask1Price,
      volume: item.turnover24h
    }))
  },
  {
    id: "okx",
    name: "OKX",
    url: "https://www.okx.com/api/v5/market/tickers?instType=SPOT",
    parse: (data) => (data.data || []).map((item) => ({
      pair: item.instId,
      price: item.last,
      bid: item.bidPx,
      ask: item.askPx,
      volume: item.volCcy24h
    }))
  },
  {
    id: "kucoin",
    name: "KuCoin",
    url: "https://api.kucoin.com/api/v1/market/allTickers",
    parse: (data) => (data.data?.ticker || []).map((item) => ({
      pair: item.symbol,
      price: item.last,
      bid: item.buy,
      ask: item.sell,
      volume: item.volValue
    }))
  },
  {
    id: "gate",
    name: "Gate.io",
    url: "https://api.gateio.ws/api/v4/spot/tickers",
    parse: (data) => data.map((item) => ({
      pair: item.currency_pair,
      price: item.last,
      bid: item.highest_bid,
      ask: item.lowest_ask,
      volume: item.quote_volume
    }))
  },
  {
    id: "mexc",
    name: "MEXC",
    url: "https://api.mexc.com/api/v3/ticker/24hr",
    parse: (data) => data.map((item) => ({
      pair: item.symbol,
      price: item.lastPrice,
      bid: item.bidPrice,
      ask: item.askPrice,
      volume: item.quoteVolume
    }))
  },
  {
    id: "bitget",
    name: "Bitget",
    url: "https://api.bitget.com/api/v2/spot/market/tickers",
    parse: (data) => (data.data || []).map((item) => ({
      pair: item.symbol,
      price: item.lastPr,
      bid: item.bidPr,
      ask: item.askPr,
      volume: item.usdtVolume || item.quoteVolume
    }))
  }
];

const scannerState = {
  running: false,
  lastUpdated: null,
  nextRunAt: null,
  exchanges: {},
  opportunities: [],
  errors: {},
  timer: null
};

function normalizePair(rawPair) {
  const compact = String(rawPair || "").toUpperCase().replace(/[-_/]/g, "");
  const quotes = ["USDT", "USDC", "FDUSD", "BUSD", "DAI"];
  const quote = quotes.find((item) => compact.endsWith(item));
  if (!quote) return null;
  const base = compact.slice(0, -quote.length);
  if (!base || base.length > 12 || /[^A-Z0-9]/.test(base)) return null;
  return { pair: `${base}/${quote}`, base, quote, compact };
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function networkEstimate(pair) {
  const base = pair.split("/")[0];
  if (base === "BTC") return { network: "Bitcoin", feeUsd: 4.8, transferMinutes: 45 };
  if (base === "ETH") return { network: "Ethereum", feeUsd: 5.6, transferMinutes: 18 };
  if (["USDT", "USDC"].includes(base)) return { network: "Stablecoin", feeUsd: 1.2, transferMinutes: 8 };
  if (["SOL", "XRP", "TRX", "DOGE", "TON"].includes(base)) return { network: "Fast L1", feeUsd: 0.35, transferMinutes: 5 };
  return { network: "Exchange Network", feeUsd: 0.85, transferMinutes: 12 };
}

function riskLevel(netSpread, volume, transferMinutes) {
  if (netSpread >= 1.2 && volume >= 250000 && transferMinutes <= 12) return "low";
  if (netSpread >= 0.45 && volume >= 50000 && transferMinutes <= 30) return "medium";
  return "high";
}

async function fetchExchange(adapter) {
  const response = await fetch(adapter.url, {
    headers: { "accept": "application/json", "user-agent": "BullBearArbitrageScanner/1.0" },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`${adapter.name} returned ${response.status}`);
  const raw = await response.json();
  const parsed = adapter.parse(raw);
  const map = new Map();
  for (const item of parsed) {
    const normalized = normalizePair(item.pair);
    if (!normalized) continue;
    const price = numberValue(item.price);
    if (!price) continue;
    const bid = numberValue(item.bid) || price;
    const ask = numberValue(item.ask) || price;
    const volume = numberValue(item.volume) || 0;
    map.set(normalized.pair, {
      exchangeId: adapter.id,
      exchange: adapter.name,
      pair: normalized.pair,
      base: normalized.base,
      quote: normalized.quote,
      price,
      bid,
      ask,
      volume,
      marketType: "spot",
      timestamp: nowIso()
    });
  }
  return map;
}

function computeOpportunities(exchangeMaps) {
  const grouped = new Map();
  for (const quotes of exchangeMaps) {
    for (const quote of quotes.values()) {
      if (!grouped.has(quote.pair)) grouped.set(quote.pair, []);
      grouped.get(quote.pair).push(quote);
    }
  }

  const opportunities = [];
  for (const [pair, quotes] of grouped.entries()) {
    if (quotes.length < 2) continue;
    for (const buy of quotes) {
      for (const sell of quotes) {
        if (buy.exchangeId === sell.exchangeId) continue;
        const buyPrice = buy.ask || buy.price;
        const sellPrice = sell.bid || sell.price;
        if (!buyPrice || !sellPrice || sellPrice <= buyPrice) continue;
        if (buyPrice < MIN_SCANNER_PRICE || sellPrice < MIN_SCANNER_PRICE) continue;
        const grossSpread = ((sellPrice - buyPrice) / buyPrice) * 100;
        if (grossSpread > MAX_REASONABLE_SPREAD_PCT) continue;
        const volume24h = Math.min(buy.volume || 0, sell.volume || 0);
        const network = networkEstimate(pair);
        const tradingFeePct = 0.2;
        const networkFeePct = (network.feeUsd / DEFAULT_NOTIONAL_USD) * 100;
        const netSpread = grossSpread - tradingFeePct - networkFeePct;
        const estimatedProfit = (DEFAULT_NOTIONAL_USD * netSpread) / 100;
        const risk = riskLevel(netSpread, volume24h, network.transferMinutes);
        const premium = netSpread >= 1 && volume24h >= 100000;
        opportunities.push({
          id: `${pair}-${buy.exchangeId}-${sell.exchangeId}`,
          pair,
          coin: buy.base,
          quote: buy.quote,
          marketType: "spot",
          buyExchange: buy.exchange,
          sellExchange: sell.exchange,
          buyExchangeId: buy.exchangeId,
          sellExchangeId: sell.exchangeId,
          buyPrice,
          sellPrice,
          spreadPct: Number(grossSpread.toFixed(4)),
          netSpreadPct: Number(netSpread.toFixed(4)),
          estimatedProfit: Number(estimatedProfit.toFixed(2)),
          volume24h: Number(volume24h.toFixed(2)),
          networkFeeUsd: Number(network.feeUsd.toFixed(2)),
          network: network.network,
          transferMinutes: network.transferMinutes,
          risk,
          status: netSpread > 0 ? "profitable" : "not_profitable",
          premium,
          timestamp: nowIso()
        });
      }
    }
  }
  return opportunities
    .filter((item) => item.spreadPct > 0)
    .sort((a, b) => b.netSpreadPct - a.netSpreadPct)
    .slice(0, 600);
}

async function refreshScanner() {
  if (scannerState.running) return;
  scannerState.running = true;
  const exchangeMaps = [];
  const errors = {};
  const results = await Promise.allSettled(exchangeAdapters.map(async (adapter) => {
    const map = await fetchExchange(adapter);
    exchangeMaps.push(map);
    scannerState.exchanges[adapter.id] = {
      id: adapter.id,
      name: adapter.name,
      status: "online",
      pairs: map.size,
      updatedAt: nowIso()
    };
  }));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const adapter = exchangeAdapters[index];
      errors[adapter.id] = result.reason?.message || "Fetch failed";
      scannerState.exchanges[adapter.id] = {
        id: adapter.id,
        name: adapter.name,
        status: "error",
        pairs: 0,
        error: errors[adapter.id],
        updatedAt: nowIso()
      };
    }
  });
  scannerState.opportunities = computeOpportunities(exchangeMaps);
  scannerState.errors = errors;
  scannerState.lastUpdated = nowIso();
  scannerState.nextRunAt = new Date(Date.now() + SCANNER_REFRESH_MS).toISOString();
  scannerState.running = false;
}

function scheduleScanner() {
  if (scannerState.timer) return;
  refreshScanner().catch((error) => console.warn("Scanner refresh failed:", error.message));
  scannerState.timer = setInterval(() => {
    refreshScanner().catch((error) => console.warn("Scanner refresh failed:", error.message));
  }, SCANNER_REFRESH_MS);
}

function filteredOpportunities(query = {}) {
  let rows = scannerState.opportunities.slice();
  const minSpread = Number(query.minSpread || 0);
  const exchange = String(query.exchange || "all").toLowerCase();
  const coin = String(query.coin || "").trim().toUpperCase();
  const stableOnly = String(query.stableOnly || "false") === "true";
  const marketType = String(query.marketType || "all");
  const minVolume = Number(query.minVolume || 0);
  const risk = String(query.risk || "all").toLowerCase();
  const network = String(query.network || "all").toLowerCase();
  const transferSpeed = String(query.transferSpeed || "all");
  const sort = String(query.sort || "highest-spread");

  rows = rows.filter((item) => item.netSpreadPct >= minSpread);
  if (exchange !== "all") {
    rows = rows.filter((item) => item.buyExchangeId === exchange || item.sellExchangeId === exchange);
  }
  if (coin) rows = rows.filter((item) => item.coin.includes(coin) || item.pair.replace("/", "").includes(coin));
  if (stableOnly) rows = rows.filter((item) => ["USDT", "USDC", "FDUSD", "DAI"].includes(item.quote));
  if (marketType !== "all") rows = rows.filter((item) => item.marketType === marketType);
  if (minVolume > 0) rows = rows.filter((item) => item.volume24h >= minVolume);
  if (risk !== "all") rows = rows.filter((item) => item.risk === risk);
  if (network !== "all") rows = rows.filter((item) => item.network.toLowerCase().includes(network));
  if (transferSpeed === "fast") rows = rows.filter((item) => item.transferMinutes <= 10);
  if (transferSpeed === "medium") rows = rows.filter((item) => item.transferMinutes <= 30);

  const sorters = {
    "highest-spread": (a, b) => b.netSpreadPct - a.netSpreadPct,
    "most-volume": (a, b) => b.volume24h - a.volume24h,
    "lowest-risk": (a, b) => ({ low: 0, medium: 1, high: 2 }[a.risk] - { low: 0, medium: 1, high: 2 }[b.risk]),
    newest: (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  };
  rows.sort(sorters[sort] || sorters["highest-spread"]);
  return rows.slice(0, Number(query.limit || 100));
}

const aiUsage = new Map();
const aiModes = new Set(["investor", "trader", "lesson", "signal", "portfolio", "risk", "forex", "futures", "arbitrage"]);

function isOpenAiConfigured() {
  return AI_USE_OPENAI && Boolean(OPENAI_API_KEY);
}

function trimText(value, max = 1200) {
  return String(value || "").trim().slice(0, max);
}

function consumeAiQuota(userKey) {
  const now = Date.now();
  const usage = (aiUsage.get(userKey) || []).filter((time) => now - time < AI_RATE_WINDOW_MS);
  if (usage.length >= AI_MAX_REQUESTS_PER_WINDOW) {
    aiUsage.set(userKey, usage);
    return false;
  }
  usage.push(now);
  aiUsage.set(userKey, usage);
  return true;
}

function extractResponseText(payload = {}) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const parts = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
      if (typeof content.output_text === "string") parts.push(content.output_text);
    }
  }
  return parts.join("\n").trim();
}

function parseAiJson(text) {
  const cleaned = String(text || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      title: "Bull & Bear AI Analysis",
      summary: cleaned || "The AI returned an empty response.",
      marketModel: [],
      watchlist: [],
      signalScenarios: [],
      lessonPlan: [],
      riskRules: ["Risk no more than a small fixed percentage of capital per idea.", "Wait for confirmation instead of chasing moves."],
      nextSteps: ["Refine the question with asset, timeframe, and risk profile."],
      disclaimer: "Educational analysis only. This is not financial advice."
    };
  }
}

function normalizeAiResult(result = {}) {
  const list = (value) => Array.isArray(value) ? value.slice(0, 8) : [];
  const snapshots = Array.isArray(result.marketSnapshot) ? result.marketSnapshot.slice(0, 8) : [];
  const graphics = Array.isArray(result.teachingGraphics) ? result.teachingGraphics.slice(0, 6) : [];
  const chartData = result.chartData && typeof result.chartData === "object" ? result.chartData : null;
  const riskCalculator = result.riskCalculator && typeof result.riskCalculator === "object" ? result.riskCalculator : null;
  return {
    title: trimText(result.title || "Bull & Bear Investor & Trader AI", 120),
    summary: trimText(result.summary, 1600),
    chatAnswer: trimText(result.chatAnswer || result.summary, 3600),
    marketSnapshot: snapshots,
    chartData,
    teachingGraphics: graphics,
    marketModel: list(result.marketModel),
    watchlist: list(result.watchlist),
    signalScenarios: list(result.signalScenarios),
    lessonPlan: list(result.lessonPlan),
    strategyPlaybook: list(result.strategyPlaybook),
    macroChecklist: list(result.macroChecklist).map((item) => trimText(item, 240)),
    journalChecklist: list(result.journalChecklist).map((item) => trimText(item, 240)),
    riskCalculator,
    riskRules: list(result.riskRules).map((item) => trimText(item, 240)),
    nextSteps: list(result.nextSteps).map((item) => trimText(item, 240)),
    disclaimer: trimText(result.disclaimer || "Educational analysis only. This is not financial advice, investment advice, or a guarantee of results.", 280)
  };
}

function aiContextFromDb(db, userId) {
  const subscriptions = db.subscriptions
    .filter((item) => item.userId === userId && item.status === "active")
    .map((item) => ({ planId: item.planId, expiresAt: item.expiresAt }));
  return {
    subscriptions,
    courses: db.courses.slice(0, 12).map((course) => ({
      title: course.title,
      category: course.category,
      description: course.description,
      duration: course.duration,
      isFree: Boolean(course.isFree)
    })),
    book: db.book ? {
      title: db.book.title,
      description: db.book.description,
      price: db.book.price
    } : null,
    recentScannerOpportunities: scannerState.opportunities.slice(0, 12).map((item) => ({
      pair: item.pair,
      buyExchange: item.buyExchange,
      sellExchange: item.sellExchange,
      netSpreadPct: item.netSpreadPct,
      estimatedProfit: item.estimatedProfit,
      volume24h: item.volume24h,
      risk: item.risk,
      transferMinutes: item.transferMinutes,
      timestamp: item.timestamp
    }))
  };
}

function normalizeAiAdvisorRequest(input = {}) {
  const mode = aiModes.has(input.mode) ? input.mode : "trader";
  return {
    mode,
    market: trimText(input.market || "Crypto and public markets", 180),
    asset: trimText(input.asset, 80),
    timeframe: trimText(input.timeframe || "swing", 80),
    riskProfile: trimText(input.riskProfile || "balanced", 80),
    experienceLevel: trimText(input.experienceLevel || "intermediate", 80),
    capitalRange: trimText(input.capitalRange || "not specified", 80),
    question: trimText(input.question, 1400)
  };
}

function aiAssetsFromRequest(request, context = {}) {
  const typedAssets = request.asset
    .split(/[,\s]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  const scannerAssets = (context.recentScannerOpportunities || [])
    .map((item) => String(item.pair || item.coin || "").split("/")[0].toUpperCase())
    .filter(Boolean);
  return Array.from(new Set([...typedAssets, ...scannerAssets, "BTC", "ETH", "SOL"])).slice(0, 6);
}

function aiTopScannerIdeas(context = {}) {
  return (context.recentScannerOpportunities || [])
    .slice()
    .sort((a, b) => Number(b.netSpreadPct || 0) - Number(a.netSpreadPct || 0))
    .slice(0, 4);
}

function aiIntervalForTimeframe(timeframe) {
  const value = String(timeframe || "").toLowerCase();
  if (value.includes("intra")) return "15m";
  if (value.includes("weekly") || value.includes("long")) return "1d";
  return "4h";
}

function aiSymbolFromAsset(asset) {
  const cleaned = String(asset || "")
    .toUpperCase()
    .replace(/[^A-Z0-9/]/g, "")
    .replace(/\/USDT$/, "")
    .replace(/USDT$/, "");
  if (!cleaned || cleaned.length > 12) return "";
  return `${cleaned}USDT`;
}

function detectAiMarketType(request = {}) {
  const text = `${request.mode || ""} ${request.market || ""} ${request.asset || ""} ${request.question || ""}`.toLowerCase();
  if (/\b(forex|fx|eurusd|gbpusd|usdjpy|usdchf|audusd|nzdusd|usdcad|xauusd|gold|xagusd|silver|dxy|london|new york session)\b/.test(text)) {
    return "forex";
  }
  if (/\b(futures|perp|perpetual|leverage|liquidation|funding|margin|nas100|us100|spx|sp500|dow|oil)\b/.test(text)) {
    return "futures";
  }
  if (/\b(stock|stocks|equity|shares|nasdaq|s&p|spx|apple|tesla|nvidia)\b/.test(text)) {
    return "stocks";
  }
  return "crypto";
}

function normalizeForexAsset(asset) {
  const raw = String(asset || "")
    .toUpperCase()
    .replace(/[^A-Z0-9/]/g, "")
    .replace("/", "");
  const aliases = {
    GOLD: "XAUUSD",
    XAU: "XAUUSD",
    SILVER: "XAGUSD",
    XAG: "XAGUSD",
    DOLLAR: "DXY",
    USDINDEX: "DXY"
  };
  if (aliases[raw]) return aliases[raw];
  if (/^[A-Z]{6}$/.test(raw)) return raw;
  if (/^(XAUUSD|XAGUSD|DXY)$/.test(raw)) return raw;
  return "";
}

function normalizeIndexOrFutureAsset(asset) {
  const raw = String(asset || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const aliases = {
    BTC: "BTCUSDT",
    ETH: "ETHUSDT",
    SOL: "SOLUSDT",
    NASDAQ: "NAS100",
    US100: "NAS100",
    NQ: "NAS100",
    SPX: "SPX500",
    SP500: "SPX500",
    ES: "SPX500",
    DOW: "US30",
    YM: "US30",
    OIL: "WTI",
    GOLD: "XAUUSD"
  };
  return aliases[raw] || raw || "";
}

function aiRequestedSymbols(request, context = {}) {
  const marketType = detectAiMarketType(request);
  const typed = String(request.asset || "")
    .split(/[\s,;/]+/)
    .map((asset) => {
      if (marketType === "forex") return normalizeForexAsset(asset);
      if (marketType === "futures" || marketType === "stocks") return normalizeIndexOrFutureAsset(asset);
      return aiSymbolFromAsset(asset);
    })
    .filter(Boolean);
  if (marketType === "forex") {
    return Array.from(new Set([...typed, "EURUSD", "XAUUSD", "GBPUSD"])).slice(0, 4);
  }
  if (marketType === "futures" || marketType === "stocks") {
    return Array.from(new Set([...typed, "BTCUSDT", "NAS100", "XAUUSD"])).slice(0, 4);
  }
  const scanner = (context.recentScannerOpportunities || [])
    .map((item) => aiSymbolFromAsset(String(item.pair || "").split("/")[0]))
    .filter(Boolean);
  return Array.from(new Set([...typed, ...scanner, "BTCUSDT", "ETHUSDT"])).slice(0, 4);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function sma(values, period) {
  if (values.length < period) return mean(values);
  return mean(values.slice(-period));
}

function rsi(values, period = 14) {
  if (values.length <= period) return 50;
  const changes = [];
  for (let index = 1; index < values.length; index += 1) {
    changes.push(values[index] - values[index - 1]);
  }
  const recent = changes.slice(-period);
  const gains = recent.map((change) => Math.max(0, change));
  const losses = recent.map((change) => Math.max(0, -change));
  const avgGain = mean(gains);
  const avgLoss = mean(losses);
  if (!avgLoss) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function atr(candles, period = 14) {
  if (candles.length < 2) return 0;
  const ranges = [];
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const previousClose = candles[index - 1].close;
    ranges.push(Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    ));
  }
  return mean(ranges.slice(-period));
}

function supportResistance(candles) {
  const recent = candles.slice(-30);
  if (!recent.length) return { support: 0, resistance: 0 };
  const lows = recent.map((item) => item.low).sort((a, b) => a - b);
  const highs = recent.map((item) => item.high).sort((a, b) => b - a);
  return {
    support: lows[Math.min(3, lows.length - 1)] || lows[0] || 0,
    resistance: highs[Math.min(3, highs.length - 1)] || highs[0] || 0
  };
}

function analyzeAiCandles(symbol, interval, candles, marketType = "crypto", source = "Binance spot candles") {
  const closes = candles.map((item) => item.close);
  const volumes = candles.map((item) => item.volume);
  const last = candles[candles.length - 1] || {};
  const first = candles[Math.max(0, candles.length - 25)] || candles[0] || {};
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, Math.min(50, closes.length));
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);
  const levels = supportResistance(candles);
  const changePct = first.close ? ((last.close - first.close) / first.close) * 100 : 0;
  const volumeNow = mean(volumes.slice(-6));
  const volumeBase = mean(volumes.slice(-24));
  const trend = last.close > sma20 && sma20 >= sma50
    ? "bullish"
    : last.close < sma20 && sma20 <= sma50 ? "bearish" : "range";
  const momentum = rsi14 >= 68 ? "extended" : rsi14 <= 35 ? "washed out" : rsi14 >= 52 ? "constructive" : "soft";
  return {
    asset: marketType === "crypto" ? symbol.replace(/USDT$/, "") : symbol,
    symbol,
    marketType,
    source,
    interval,
    price: Number(last.close || 0),
    changePct: Number(changePct.toFixed(2)),
    rsi14: Number(rsi14.toFixed(1)),
    sma20: Number(sma20.toFixed(4)),
    sma50: Number(sma50.toFixed(4)),
    atrPct: last.close ? Number(((atr14 / last.close) * 100).toFixed(2)) : 0,
    support: Number(levels.support.toFixed(4)),
    resistance: Number(levels.resistance.toFixed(4)),
    trend,
    momentum,
    volumeBias: volumeNow > volumeBase * 1.15 ? "above average" : volumeNow < volumeBase * 0.85 ? "below average" : "normal",
    updatedAt: nowIso(),
    candles: candles.slice(-52).map((item) => ({
      time: item.time,
      open: Number(item.open.toFixed(4)),
      high: Number(item.high.toFixed(4)),
      low: Number(item.low.toFixed(4)),
      close: Number(item.close.toFixed(4)),
      volume: Number(item.volume.toFixed(4))
    }))
  };
}

async function fetchBinanceCandles(symbol, interval, limit = 80) {
  const url = new URL("https://api.binance.com/api/v3/klines");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(limit));
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "BullBearInvestorAI/1.0" },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`Binance returned ${response.status} for ${symbol}`);
  const data = await response.json();
  return data.map((item) => ({
    time: Number(item[0]),
    open: Number(item[1]),
    high: Number(item[2]),
    low: Number(item[3]),
    close: Number(item[4]),
    volume: Number(item[5])
  })).filter((item) => Number.isFinite(item.close) && item.close > 0);
}

function marketProfile(symbol, marketType) {
  const profiles = {
    EURUSD: { base: 1.085, volatility: 0.004, volume: 180000 },
    GBPUSD: { base: 1.272, volatility: 0.005, volume: 150000 },
    USDJPY: { base: 156.4, volatility: 0.006, volume: 170000 },
    USDCHF: { base: 0.91, volatility: 0.004, volume: 100000 },
    AUDUSD: { base: 0.665, volatility: 0.005, volume: 120000 },
    NZDUSD: { base: 0.61, volatility: 0.005, volume: 90000 },
    USDCAD: { base: 1.36, volatility: 0.004, volume: 110000 },
    XAUUSD: { base: 2360, volatility: 0.011, volume: 220000 },
    XAGUSD: { base: 30.5, volatility: 0.014, volume: 120000 },
    DXY: { base: 104.2, volatility: 0.0035, volume: 80000 },
    NAS100: { base: 18850, volatility: 0.012, volume: 210000 },
    SPX500: { base: 5250, volatility: 0.009, volume: 200000 },
    US30: { base: 39200, volatility: 0.008, volume: 180000 },
    WTI: { base: 79, volatility: 0.018, volume: 160000 },
    BTCUSDT: { base: 68000, volatility: 0.018, volume: 800000 },
    ETHUSDT: { base: 3500, volatility: 0.02, volume: 650000 },
    SOLUSDT: { base: 165, volatility: 0.025, volume: 420000 }
  };
  return profiles[symbol] || {
    base: marketType === "forex" ? 1.1 : 100,
    volatility: marketType === "forex" ? 0.005 : 0.018,
    volume: 100000
  };
}

function symbolSeed(symbol) {
  return String(symbol || "").split("").reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 3), 17);
}

function syntheticCandles(symbol, interval, marketType, limit = 80) {
  const profile = marketProfile(symbol, marketType);
  const seed = symbolSeed(`${symbol}:${interval}:${marketType}`);
  const candles = [];
  let last = profile.base * (1 + ((seed % 17) - 8) * 0.0015);
  const intervalMs = interval === "15m" ? 15 * 60 * 1000 : interval === "1d" ? 24 * 60 * 60 * 1000 : 4 * 60 * 60 * 1000;
  const start = Date.now() - limit * intervalMs;
  for (let index = 0; index < limit; index += 1) {
    const wave = Math.sin((index + seed % 13) / 5) * profile.volatility;
    const cycle = Math.cos((index + seed % 11) / 9) * profile.volatility * 0.55;
    const drift = ((seed % 9) - 4) * profile.volatility * 0.018;
    const open = last;
    const close = Math.max(profile.base * 0.35, open * (1 + wave * 0.14 + cycle * 0.09 + drift));
    const spread = profile.volatility * (0.22 + (index % 5) * 0.03);
    const high = Math.max(open, close) * (1 + spread);
    const low = Math.min(open, close) * (1 - spread);
    candles.push({
      time: start + index * intervalMs,
      open,
      high,
      low,
      close,
      volume: profile.volume * (0.75 + ((index + seed) % 9) * 0.07)
    });
    last = close;
  }
  return candles;
}

async function aiMarketContext(request, context) {
  const interval = aiIntervalForTimeframe(request.timeframe);
  const marketType = detectAiMarketType(request);
  const symbols = aiRequestedSymbols(request, context);
  if (marketType !== "crypto") {
    const snapshots = symbols.map((symbol) => (
      analyzeAiCandles(
        symbol,
        interval,
        syntheticCandles(symbol, interval, marketType),
        marketType,
        marketType === "forex" ? "Forex teaching model" : "Futures and index teaching model"
      )
    ));
    return {
      source: marketType === "forex" ? "Forex teaching model" : "Futures and index teaching model",
      marketType,
      interval,
      snapshots,
      errors: []
    };
  }
  const settled = await Promise.allSettled(symbols.map(async (symbol) => {
    const candles = await fetchBinanceCandles(symbol, interval);
    return analyzeAiCandles(symbol, interval, candles, "crypto", "Binance spot candles");
  }));
  const snapshots = settled
    .filter((item) => item.status === "fulfilled")
    .map((item) => item.value);
  const fallbackSnapshots = snapshots.length ? [] : symbols.map((symbol) => (
    analyzeAiCandles(symbol, interval, syntheticCandles(symbol, interval, "crypto"), "crypto", "Crypto teaching model")
  ));
  return {
    source: snapshots.length ? "Binance spot candles" : "Crypto teaching model",
    marketType,
    interval,
    snapshots: snapshots.length ? snapshots : fallbackSnapshots,
    errors: settled
      .filter((item) => item.status === "rejected")
      .map((item) => item.reason?.message || "Market fetch failed")
      .slice(0, 4)
  };
}

function aiRiskSentence(riskProfile) {
  if (riskProfile === "conservative") return "Use smaller sizing, wait for extra confirmation, and skip unclear setups.";
  if (riskProfile === "aggressive") return "Aggressive ideas still need fixed risk, hard invalidation, and no averaging down.";
  return "Use balanced sizing, define invalidation before entry, and avoid chasing candles after expansion.";
}

function aiQuestionTopics(request) {
  const text = `${request.mode} ${request.market} ${request.asset} ${request.question}`.toLowerCase();
  const checks = [
    ["risk", ["risk", "stop", "loss", "size", "drawdown", "manage"]],
    ["portfolio", ["portfolio", "invest", "long term", "long-term", "allocation", "hold", "dca"]],
    ["signal", ["signal", "entry", "buy", "sell", "setup", "trigger"]],
    ["lesson", ["lesson", "learn", "teach", "course", "beginner", "explain"]],
    ["technical", ["rsi", "support", "resistance", "trend", "candle", "chart", "indicator"]],
    ["psychology", ["psychology", "emotion", "fear", "greed", "discipline", "revenge"]],
    ["arbitrage", ["arbitrage", "spread", "exchange", "fee", "transfer"]],
    ["forex", ["forex", "fx", "eurusd", "gbpusd", "usdjpy", "xauusd", "gold", "dxy", "london", "new york", "session", "pips"]],
    ["futures", ["futures", "perp", "perpetual", "leverage", "liquidation", "funding", "margin", "nas100", "spx", "oil"]]
  ];
  const topics = checks.filter(([, words]) => words.some((word) => text.includes(word))).map(([topic]) => topic);
  if (!topics.length) topics.push(request.mode === "investor" ? "portfolio" : "technical");
  return Array.from(new Set(topics)).slice(0, 4);
}

function aiDirectAnswer(request, primary, riskText, scannerText, topics) {
  const topicAdvice = {
    risk: "For risk management, start with invalidation first. A setup is professional only when you know exactly where the idea is wrong, how much capital is at risk, and when you will stop trading for the day.",
    portfolio: "For investing, build around allocation, time horizon, and review rules. A clean model is core positions first, smaller tactical positions second, and cash reserved for high-quality pullbacks.",
    signal: "For signal-style work, avoid blind calls. Use trigger, confirmation, invalidation, target zone, and risk size. If one piece is missing, the signal is not ready.",
    lesson: "For learning, the best path is structure first, then risk, then psychology, then execution review. Do not jump into advanced indicators before you can mark clean levels.",
    technical: "For technical analysis, read the regime before indicators. Trend, support, resistance, volume, and candle location matter more than one RSI print.",
    psychology: "For psychology, the edge is process discipline. Your job is to repeat high-quality decisions, avoid revenge trading, and review mistakes calmly after the market closes.",
    arbitrage: "For arbitrage, spread is only the first filter. The usable edge depends on liquidity, trading fees, withdrawal fees, network choice, transfer time, and whether the price gap survives execution.",
    forex: "For forex, separate session context from setup quality. London and New York liquidity can create clean moves, but every idea still needs trend, level, catalyst awareness, invalidation, and pip risk.",
    futures: "For futures, leverage is the risk amplifier. Build the plan around liquidation distance, margin buffer, funding or rollover context, and a hard daily loss limit before thinking about targets."
  };
  const liveLine = primary
    ? `Live chart context: ${primary.asset} is near ${primary.price}, RSI ${primary.rsi14}, trend ${primary.trend}, support ${primary.support}, resistance ${primary.resistance}.`
    : "Live chart context is limited for this request, so the answer uses the academy model and scanner context.";
  return [
    `Direct answer: ${topics.map((topic) => topicAdvice[topic]).join(" ")}`,
    liveLine,
    scannerText,
    `Best professional next move: write a plan with four lines: market regime, valid trigger, invalidation, and maximum risk. ${riskText}`
  ].join("\n\n");
}

function aiTeachingGraphicsForTopics(topics) {
  const graphics = [
    {
      title: "Trend Decision Model",
      type: "flow",
      steps: ["Regime", "Level", "Trigger", "Invalidation", "Size", "Review"],
      note: "This is the core workflow before any signal-style idea."
    }
  ];
  if (topics.includes("risk")) {
    graphics.push({
      title: "Risk Box",
      type: "risk",
      steps: ["Entry zone", "Stop zone", "Target zone"],
      note: "A trade idea is incomplete until the downside is defined first."
    });
  }
  if (topics.includes("technical")) {
    graphics.push({
      title: "RSI Teaching Map",
      type: "momentum",
      steps: ["Below 35: washed out", "45-60: balanced", "Above 68: extended"],
      note: "RSI is context, not a standalone entry button."
    });
  }
  if (topics.includes("portfolio")) {
    graphics.push({
      title: "Investor Allocation Map",
      type: "portfolio",
      steps: ["Core", "Satellite", "Cash", "Review"],
      note: "Long-term investing should be planned before volatility arrives."
    });
  }
  if (topics.includes("arbitrage")) {
    graphics.push({
      title: "Arbitrage Reality Check",
      type: "execution",
      steps: ["Spread", "Fees", "Liquidity", "Transfer", "Final net"],
      note: "The visible spread is not the same as realized profit."
    });
  }
  if (topics.includes("forex")) {
    graphics.push({
      title: "Forex Session Map",
      type: "forex",
      steps: ["Asia range", "London break", "NY confirmation", "Risk close"],
      note: "Use sessions to understand liquidity, not to force entries."
    });
  }
  if (topics.includes("futures")) {
    graphics.push({
      title: "Futures Leverage Guard",
      type: "futures",
      steps: ["Margin", "Liquidation", "Stop", "Daily limit"],
      note: "Leverage should shrink position size, not increase emotional risk."
    });
  }
  if (topics.includes("psychology")) {
    graphics.push({
      title: "Discipline Loop",
      type: "psychology",
      steps: ["Plan", "Wait", "Execute", "Journal", "Improve"],
      note: "A calm repeatable process beats emotional prediction."
    });
  }
  return graphics.slice(0, 4);
}

function generatePaidAdvisorResponse(input, context = {}) {
  const request = normalizeAiAdvisorRequest(input);
  const assets = aiAssetsFromRequest(request, context);
  const scannerIdeas = aiTopScannerIdeas(context);
  const market = context.marketData || {};
  const snapshots = market.snapshots || [];
  const primary = snapshots[0];
  const topics = aiQuestionTopics(request);
  const marketType = market.marketType || detectAiMarketType(request);
  const bestIdea = scannerIdeas[0];
  const timeframeText = request.timeframe || "swing";
  const riskText = aiRiskSentence(request.riskProfile);
  const scannerText = bestIdea
    ? `Current scanner context is led by ${bestIdea.pair} with about ${Number(bestIdea.netSpreadPct || 0).toFixed(2)}% net spread between ${bestIdea.buyExchange} and ${bestIdea.sellExchange}. Treat this as context, not a guaranteed trade.`
    : "Scanner context is limited right now, so the plan focuses on structure, confirmation, and risk process.";

  const watchlist = (snapshots.length ? snapshots : assets.slice(0, 5).map((asset) => ({ asset }))).slice(0, 5).map((item, index) => ({
    asset: item.asset || item.symbol?.replace(/USDT$/, "") || assets[index],
    bias: item.trend ? `${item.trend} / ${item.momentum}` : "structure watch",
    setup: index === 0 ? "Primary focus. Wait for a clean break and retest before planning risk." : marketType === "forex" ? "Secondary pair. Wait for session liquidity to choose direction." : "Secondary watch. Let price prove strength before entry.",
    trigger: item.resistance ? `A close above ${item.resistance} with normal or rising volume, then a retest that holds.` : timeframeText === "intraday" ? "Momentum candle closes above the last local high with volume." : "Daily or 4H structure holds higher low, then breaks the reaction high.",
    invalidation: item.support ? `Invalid below ${item.support} or if price accepts back under the retest zone.` : "The setup is invalid if price closes back below the prior support or breaks the planned higher low.",
    risk: "Risk only a small fixed percentage per idea and avoid adding to losing positions."
  }));

  const signalScenarios = (scannerIdeas.length ? scannerIdeas : watchlist).slice(0, 4).map((item, index) => {
    const pair = item.pair || `${item.asset}/USDT`;
    const spread = item.netSpreadPct ? `${Number(item.netSpreadPct).toFixed(2)}%` : "not available";
    return {
      pair,
      scenario: index % 2 === 0 ? "Continuation after confirmation" : "Pullback into support",
      trigger: index % 2 === 0 ? "Break above resistance, retest holds, then continuation candle forms." : "Price returns to support, rejection appears, and the next candle confirms demand.",
      invalidation: "Close below support or failed retest cancels the idea.",
      notes: item.buyExchange ? `Scanner spread context: ${spread} from ${item.buyExchange} to ${item.sellExchange}. Confirm fees, liquidity, and transfer time first.` : "Use this as an education scenario only."
    };
  });

  return normalizeAiResult({
    title: "Bull & Bear Investor & Trader AI",
    summary: `${scannerText} For ${request.market} on a ${timeframeText} plan, the premium model is patience first: define trend, wait for confirmation, then manage downside. ${riskText}`,
    chatAnswer: [
      `I read your question as a ${request.mode} request for ${request.market} using a ${timeframeText} plan.`,
      aiDirectAnswer(request, primary, riskText, scannerText, topics),
      primary
        ? `${primary.source || "Market"} context: ${primary.asset} is around ${primary.price}, ${primary.changePct}% over the sampled window, with RSI ${primary.rsi14}. The structure reads ${primary.trend}, momentum is ${primary.momentum}, and the practical teaching zone is support ${primary.support} / resistance ${primary.resistance}.`
        : "Live Binance context is not available for the requested asset right now, so the answer uses academy models and scanner context.",
      `Professional model: decide the market regime first, then create conditional scenarios. Do not ask “buy or sell now”; ask “what would need to happen for this setup to become valid?”`,
      `Best answer: build the trade plan around trigger, confirmation, invalidation, and position size. ${riskText}`
    ].join("\n\n"),
    marketSnapshot: snapshots.map((item) => ({
      asset: item.asset,
      price: item.price,
      changePct: `${item.changePct}%`,
      rsi14: item.rsi14,
      trend: item.trend,
      momentum: item.momentum,
      support: item.support,
      resistance: item.resistance,
      volumeBias: item.volumeBias,
      source: item.source,
      marketType: item.marketType,
      interval: item.interval
    })),
    chartData: primary ? {
      symbol: primary.symbol,
      interval: primary.interval,
      support: primary.support,
      resistance: primary.resistance,
      sma20: primary.sma20,
      source: primary.source,
      candles: primary.candles
    } : null,
    teachingGraphics: aiTeachingGraphicsForTopics(topics),
    marketModel: [
      {
        model: "Structure First",
        read: "Map trend with higher highs/higher lows for bullish structure or lower highs/lower lows for bearish structure.",
        confirmation: "Do not act on one candle only. Wait for retest, volume, and clear invalidation.",
        warning: "No model guarantees profit. If market data is stale or thin, reduce size or stand aside."
      },
      {
        model: "Liquidity And Fees",
        read: "For crypto and arbitrage ideas, spread alone is not enough. Volume, fees, network, and transfer time decide whether the idea is usable.",
        confirmation: bestIdea ? `${bestIdea.pair} currently needs fee and execution checks before any decision.` : "Use the scanner page to confirm live spreads before acting.",
        warning: "Avoid low-volume pairs where a good-looking spread can disappear during execution."
      },
      {
        model: marketType === "forex" ? "Forex Liquidity Sessions" : marketType === "futures" ? "Futures Leverage Control" : "Multi-Timeframe Alignment",
        read: marketType === "forex"
          ? "Check Asia range, London expansion, New York continuation or reversal, and major news timing before planning risk."
          : marketType === "futures"
            ? "Map leverage, liquidation distance, funding or rollover context, and daily loss limits before selecting a setup."
            : "Use higher timeframe direction for bias and lower timeframe structure for execution.",
        confirmation: "The setup becomes valid only when direction, level, trigger, invalidation, and position size agree.",
        warning: "If the plan depends on hope, the trade is not ready."
      }
    ],
    watchlist,
    signalScenarios,
    lessonPlan: [
      {
        lesson: "Market Structure",
        focus: "Trend, support and resistance, retest behavior, and candle confirmation.",
        practice: "Mark three clean levels before looking for an entry."
      },
      {
        lesson: "Risk Management",
        focus: "Position sizing, invalidation, stop placement, and maximum daily loss.",
        practice: "Write risk before reward on every paper-trade idea."
      },
      {
        lesson: "Trading Psychology",
        focus: "Patience, avoiding revenge trades, and respecting the planned invalidation.",
        practice: "Review screenshots after each setup and score discipline, not profit."
      }
    ],
    strategyPlaybook: [
      {
        module: "Regime Map",
        action: "Classify trend, range, or distribution before choosing strategy.",
        output: "One sentence market thesis plus the level that proves it wrong."
      },
      {
        module: "Execution Plan",
        action: "Build conditional scenarios instead of instant predictions.",
        output: "Trigger, confirmation, invalidation, target zone, and position size."
      },
      {
        module: marketType === "forex" ? "Session Plan" : marketType === "futures" ? "Leverage Plan" : "Market Tool Plan",
        action: marketType === "forex"
          ? "Separate Asia, London, and New York behavior before selecting the pair."
          : marketType === "futures"
            ? "Reduce position size until stop distance and liquidation distance are both acceptable."
            : "Check scanner data, volume, fees, and chart levels before using any opportunity.",
        output: "A written go/no-go checklist before entry."
      }
    ],
    macroChecklist: [
      "Check high-impact economic news before forex, gold, index, or futures trades.",
      "Avoid entering directly into major data releases unless the plan is specifically built for event risk.",
      "Compare dollar strength, risk appetite, and session liquidity before trusting one chart.",
      "For crypto, compare BTC dominance, stablecoin flows, and major exchange liquidity before altcoin setups."
    ],
    journalChecklist: [
      "Screenshot before entry, after entry, and after exit.",
      "Write why the setup is valid and the exact condition that cancels it.",
      "Score discipline separately from profit or loss.",
      "Review whether the entry was planned, chased, or emotional."
    ],
    riskCalculator: {
      capitalRange: request.capitalRange,
      suggestedRiskPerIdea: request.riskProfile === "conservative" ? "0.25% - 0.5%" : request.riskProfile === "aggressive" ? "0.75% - 1.25%" : "0.5% - 1%",
      maxDailyLoss: request.riskProfile === "aggressive" ? "2% - 3%" : "1% - 2%",
      positionRule: marketType === "futures" ? "Lower leverage until liquidation is far beyond the planned stop." : marketType === "forex" ? "Convert stop distance into pip value before placing the order." : "Use stop distance to calculate size before entry."
    },
    riskRules: [
      "Education only. This is not financial advice and not a guaranteed signal.",
      "Risk a small fixed percentage per idea and define invalidation before entry.",
      marketType === "forex"
        ? "For forex, check economic calendar and session liquidity before taking any setup."
        : marketType === "futures" ? "For futures, never use leverage without knowing liquidation distance and maximum daily loss." : "For crypto, confirm liquidity, spreads, fees, and BTC market context before altcoin entries.",
      "Skip trades when spread, volume, fees, or transfer time are unclear.",
      "Do not chase after a large candle. Wait for a retest or a new setup.",
      "Use demo or paper trading when testing a new model."
    ],
    nextSteps: [
      "Open the scanner and compare spread with volume and risk level.",
      "Choose one primary asset and one backup asset instead of watching everything.",
      "Write trigger, invalidation, and position size before entering any trade.",
      "Study the course lessons on structure and risk before using signal scenarios live."
    ],
    disclaimer: "Premium educational analysis only. This is not financial advice, investment advice, or a promise of profit."
  });
}

async function generateAiAdvisorResponse(input, context, auth) {
  const request = normalizeAiAdvisorRequest(input);

  const systemPrompt = [
    "You are Bull & Bear Investor & Trader AI for a premium trading education website.",
    "Give professional but cautious educational analysis for investing, trading, market models, risk management, and lesson recommendations.",
    "You may create watchlists and signal-style scenarios, but never promise profit, never claim certainty, and never tell the user that they must buy or sell immediately.",
    "Use conditional language: trigger, confirmation, invalidation, risk notes, and education next steps.",
    "Support crypto, forex, index, and futures education. For forex, include session/liquidity/news awareness. For futures, include leverage, margin, liquidation, funding, and daily loss limits.",
    "If market data is insufficient or stale, say so and explain what data is needed.",
    "Do not provide legal, tax, or personalized financial advice. Keep answers suitable for education.",
    "Return only valid JSON with these keys: title, summary, chatAnswer, marketSnapshot, chartData, teachingGraphics, marketModel, watchlist, signalScenarios, lessonPlan, strategyPlaybook, macroChecklist, journalChecklist, riskCalculator, riskRules, nextSteps, disclaimer.",
    "chartData should include symbol, interval, support, resistance, and candles when supplied by platform context.",
    "teachingGraphics should be simple arrays of objects with title, type, steps, and note.",
    "marketModel, watchlist, signalScenarios, lessonPlan, and strategyPlaybook must be arrays of objects. macroChecklist, journalChecklist, riskRules, and nextSteps must be arrays of short strings."
  ].join(" ");

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: systemPrompt }]
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({
              user: {
                id: auth.userId || "admin",
                role: auth.role || (auth.admin ? "admin" : "user")
              },
              request,
              platformContext: context
            })
          }]
        }
      ],
      max_output_tokens: 1800
    }),
    signal: AbortSignal.timeout(30000)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `OpenAI returned ${response.status}`;
    throw new Error(message);
  }
  return normalizeAiResult(parseAiJson(extractResponseText(payload)));
}

function serializeContent(db) {
  const { users, signals, ...publicDb } = db;
  return {
    ...publicDb,
    products: [
      {
        id: "course",
        planId: "education-bundle",
        title: "Courses + Trading Book",
        subtitle: "Complete Education Bundle",
        description: "One bundle with the full video course library and Bull & Bear Trading Mastery book.",
        price: 49.9,
        cadence: "one-time"
      },
      {
        id: "signals",
        planId: "premium-discord-signals",
        title: "AI + Premium Discord Signals",
        subtitle: "AI Market Coach + Private Discord",
        description: "Premium Discord access with signals, live streams, trade discussions, and Investor & Trader AI for crypto, forex, futures, lessons, and risk models.",
        price: 49.9,
        cadence: "monthly"
      },
      {
        id: "arbitrage",
        planId: "arbitrage-only",
        title: "Arbitrage Scanner",
        subtitle: "Find Price Differences",
        description: "Scan crypto opportunities across leading exchanges with clean net-spread views.",
        price: 39.9,
        cadence: "monthly"
      }
    ]
  };
}

ensureProjectFiles();

app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/content", (req, res) => {
  res.json(serializeContent(readDb()));
});

app.get("/api/plans", (req, res) => {
  res.json({
    plans: [
      {
        id: "premium-discord-signals",
        name: "AI + Premium Discord Signals",
        price: 49.9,
        cadence: "monthly",
        features: ["Investor & Trader AI", "Crypto and forex analysis", "Premium Discord signals", "Live streams", "Teaching charts", "Risk and lesson builder"]
      },
      {
        id: "arbitrage-only",
        name: "Arbitrage Scanner Only",
        price: 39.9,
        cadence: "monthly",
        features: ["Live scanner", "Advanced filters", "Browser alerts", "Saved coins", "Cancel anytime"]
      }
    ]
  });
});

app.get("/api/scanner/status", (req, res) => {
  res.json({
    running: scannerState.running,
    lastUpdated: scannerState.lastUpdated,
    nextRunAt: scannerState.nextRunAt,
    exchanges: Object.values(scannerState.exchanges),
    errors: scannerState.errors,
    refreshMs: SCANNER_REFRESH_MS
  });
});

app.get("/api/scanner/opportunities", async (req, res) => {
  if (!scannerState.lastUpdated && !scannerState.running) {
    await refreshScanner().catch((error) => console.warn("Initial scanner refresh failed:", error.message));
  }
  res.json({
    lastUpdated: scannerState.lastUpdated,
    nextRunAt: scannerState.nextRunAt,
    notionalUsd: DEFAULT_NOTIONAL_USD,
    exchanges: Object.values(scannerState.exchanges),
    opportunities: filteredOpportunities(req.query)
  });
});

app.get("/api/scanner/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = () => {
    res.write(`data: ${JSON.stringify({
      lastUpdated: scannerState.lastUpdated,
      opportunities: filteredOpportunities({ ...req.query, limit: 50 }),
      exchanges: Object.values(scannerState.exchanges)
    })}\n\n`);
  };
  send();
  const timer = setInterval(send, SCANNER_REFRESH_MS);
  req.on("close", () => clearInterval(timer));
});

app.post("/api/ai/advisor", requireAuth, async (req, res) => {
  try {
    const db = readDb();
    if (!hasAiAccess(db, req.auth)) {
      return res.status(402).json({
        error: "Investor & Trader AI requires AI + Premium Discord Signals.",
        requiredPlan: "premium-discord-signals",
        checkoutUrl: "/checkout/premium-discord-signals"
      });
    }

    const userKey = req.auth.userId || req.auth.username || req.ip;
    if (!consumeAiQuota(userKey)) {
      return res.status(429).json({
        error: "AI request limit reached. Please wait a few minutes and try again."
      });
    }

    const normalizedRequest = normalizeAiAdvisorRequest(req.body || {});
    const context = aiContextFromDb(db, req.auth.userId || "");
    context.marketData = await aiMarketContext(normalizedRequest, context).catch((error) => ({
      source: "Academy model only",
      marketType: detectAiMarketType(normalizedRequest),
      interval: aiIntervalForTimeframe(normalizedRequest.timeframe),
      snapshots: [],
      errors: [error.message]
    }));
    let model = "Bull & Bear AI Pro";
    let result = generatePaidAdvisorResponse(normalizedRequest, context);

    if (isOpenAiConfigured()) {
      try {
        result = await generateAiAdvisorResponse(normalizedRequest, context, req.auth);
        model = OPENAI_MODEL;
      } catch (error) {
        console.warn("OpenAI advisor unavailable, using paid advisor model:", error.message);
      }
    }

    db.auditLogs.unshift({
      id: `audit-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      action: "ai.advisor.generated",
      actor: req.auth.email || req.auth.username || "guest",
      meta: {
        mode: normalizedRequest.mode || "trader",
        model
      },
      createdAt: nowIso()
    });
    db.auditLogs = db.auditLogs.slice(0, 500);
    writeDb(db);
    res.json({
      result,
      meta: {
        model,
        generatedAt: nowIso(),
        marketSource: context.marketData.source,
        marketInterval: context.marketData.interval,
        scannerUpdatedAt: scannerState.lastUpdated
      }
    });
  } catch (error) {
    console.warn("AI advisor failed:", error.message);
    res.status(502).json({ error: error.message || "AI analysis failed" });
  }
});

app.post("/api/payments/checkout", requireAuth, async (req, res) => {
  const { planId, provider = PAYMENT_DEFAULT_PROVIDER } = req.body || {};
  const supported = ["payriff", "epoint", "crypto", "card", "manual"];
  if (!supported.includes(provider)) return res.status(400).json({ error: "Unsupported payment provider" });
  const plan = PAYMENT_PLANS[planId];
  if (!plan) return res.status(400).json({ error: "Unknown payment plan" });
  const db = readDb();
  const payment = {
    id: `pay-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    userId: req.auth.userId || "admin",
    planId,
    provider,
    status: provider === "manual" ? "pending_review" : "checkout_creating",
    amount: plan.amount,
    currency: provider === "payriff" ? PAYRIFF_CURRENCY : "USD",
    checkoutUrl: provider === "manual" ? "/payment/success" : null,
    createdAt: nowIso()
  };

  if (provider === "payriff") {
    db.payments.unshift(payment);
    try {
      await createPayriffCheckout(req, payment, plan, planId);
      writeDb(db);
      addAuditLog("payment.checkout.created", req.auth.email || req.auth.username, { planId, provider, paymentId: payment.id });
      return res.status(201).json({
        payment,
        message: "Payriff checkout is ready. You will be redirected to the secure payment page."
      });
    } catch (error) {
      payment.status = isPayriffConfigured() ? "checkout_failed" : "configuration_required";
      payment.error = error.message;
      payment.updatedAt = nowIso();
      writeDb(db);
      return res.status(isPayriffConfigured() ? 502 : 503).json({
        error: error.message,
        payment
      });
    }
  }

  db.payments.unshift(payment);
  payment.status = provider === "manual" ? "pending_review" : "configuration_required";
  writeDb(db);
  addAuditLog("payment.checkout.created", req.auth.email || req.auth.username, { planId, provider, paymentId: payment.id });
  res.status(201).json({
    payment,
    message: provider === "manual"
      ? "Manual checkout record created."
      : "Provider adapter is ready. Add merchant credentials in environment variables to enable live checkout."
  });
});

app.get("/api/payments/webhook/payriff", async (req, res) => {
  const reference = String(
    req.query.paymentId
    || req.query.orderId
    || req.query.order_id
    || req.query.reference
    || req.query.id
    || ""
  ).trim();
  const db = readDb();
  const payment = reference
    ? db.payments.find((item) => item.id === reference || item.providerReference === reference)
    : null;

  if (!reference || !payment) {
    db.paymentLogs.unshift({
      id: `webhook-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      provider: "payriff",
      status: reference ? "unknown_reference" : "missing_reference",
      paymentId: reference || "",
      createdAt: nowIso()
    });
    writeDb(db);
    return res.status(reference ? 404 : 400).json({ ok: false, error: "Payment reference was not found" });
  }

  try {
    const statusPayload = payment.providerReference && isPayriffConfigured()
      ? await getPayriffPaymentStatus(payment.providerReference)
      : req.query;
    const subscription = applyPayriffStatusToPayment(db, payment, statusPayload);
    db.paymentLogs.unshift({
      id: `webhook-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      provider: "payriff",
      status: `matched:${payment.status}`,
      paymentId: payment.id,
      createdAt: nowIso()
    });
    writeDb(db);
    if (req.accepts("html")) {
      const destination = payment.status === "failed" ? "failed" : "success";
      return res.redirect(`/payment/${destination}?paymentId=${encodeURIComponent(payment.id)}`);
    }
    return res.json({ ok: true, payment, subscription });
  } catch (error) {
    payment.status = payment.status === "paid" ? "paid" : "status_check_failed";
    payment.error = error.message;
    payment.updatedAt = nowIso();
    db.paymentLogs.unshift({
      id: `webhook-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      provider: "payriff",
      status: "status_check_failed",
      paymentId: payment.id,
      createdAt: nowIso()
    });
    writeDb(db);
    return res.status(502).json({ ok: false, error: error.message });
  }
});

app.post("/api/payments/webhook/:provider", express.raw({ type: "*/*" }), async (req, res) => {
  const db = readDb();
  let payload = req.body || {};
  if (Buffer.isBuffer(payload)) {
    try {
      payload = JSON.parse(payload.toString("utf8") || "{}");
    } catch {
      payload = {};
    }
  }
  const paymentId = payload.paymentId
    || payload.payment_id
    || payload.metadata?.paymentId
    || payload.payload?.metadata?.paymentId
    || payload.orderId
    || payload.order_id
    || payload.payload?.orderId
    || payload.payload?.id
    || payload.reference;
  const status = String(
    payload.status
    || payload.payment_status
    || payload.paymentStatus
    || payload.orderStatus
    || payload.transactionStatus
    || payload.payload?.status
    || payload.payload?.paymentStatus
    || ""
  ).toLowerCase();
  const payment = paymentId
    ? db.payments.find((item) => item.id === paymentId || item.providerReference === paymentId)
    : null;
  let subscription = null;
  if (payment) {
    if (req.params.provider === "payriff") {
      const statusPayload = payment.providerReference && isPayriffConfigured()
        ? await getPayriffPaymentStatus(payment.providerReference).catch(() => payload)
        : payload;
      subscription = applyPayriffStatusToPayment(db, payment, statusPayload);
    } else {
      payment.status = ["paid", "success", "succeeded", "completed", "approved"].includes(status) ? "paid" : status || payment.status;
      payment.providerPayload = payload;
      payment.updatedAt = nowIso();
      if (payment.status === "paid") {
        subscription = finalizePaidPayment(db, payment, payload);
      }
    }
  }
  db.paymentLogs.unshift({
    id: `webhook-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    provider: req.params.provider,
    status: payment ? `matched:${payment.status}` : "received",
    paymentId: payment?.id || "",
    createdAt: nowIso()
  });
  writeDb(db);
  res.json({ ok: true, payment: payment || null, subscription });
});

app.get("/api/integrations/discord/status", requireAuth, (req, res) => {
  res.json({
    oauthConfigured: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
    botConfigured: Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_PREMIUM_ROLE_ID && process.env.DISCORD_GUILD_ID),
    freeInvite: process.env.DISCORD_FREE_INVITE || "https://discord.gg/zcXkSV34H",
    premiumRoleId: process.env.DISCORD_PREMIUM_ROLE_ID ? "configured" : "missing"
  });
});

app.get("/api/auth/oauth/:provider", (req, res) => {
  const config = oauthConfig(req.params.provider, req);
  if (!config) return res.status(404).json({ error: "OAuth provider not supported" });
  if (!config.clientId || !config.clientSecret) {
    return res.redirect(`/login?oauth=${encodeURIComponent(`${config.provider}-not-configured`)}`);
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scope,
    state: crypto.randomBytes(12).toString("hex"),
    prompt: "select_account"
  });
  res.redirect(`${config.authorizeUrl}?${params.toString()}`);
});

app.get("/api/auth/oauth/:provider/callback", async (req, res) => {
  const config = oauthConfig(req.params.provider, req);
  if (!config || !req.query.code) return res.redirect("/login?oauth=failed");
  try {
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: String(req.query.code),
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri
      })
    });
    if (!tokenResponse.ok) throw new Error(`${config.provider} token exchange failed`);
    const tokenData = await tokenResponse.json();
    const profileResponse = await fetch(config.userUrl, {
      headers: { authorization: `Bearer ${tokenData.access_token}`, accept: "application/json" }
    });
    if (!profileResponse.ok) throw new Error(`${config.provider} profile request failed`);
    const profileData = await profileResponse.json();
    const profile = config.provider === "google"
      ? { id: profileData.id, email: profileData.email, name: profileData.name }
      : { id: profileData.id, email: profileData.email, name: profileData.global_name || profileData.username, username: profileData.username };
    const db = readDb();
    const user = upsertOauthUser(db, config.provider, profile);
    const hasPremium = db.subscriptions.some((item) => item.userId === user.id && item.status === "active" && isPremiumDiscordPlan(item.planId));
    writeDb(db);
    if (config.provider === "discord" && hasPremium) {
      syncDiscordRole(user, true).catch((error) => console.warn("Discord role sync failed:", error.message));
    }
    const publicProfile = publicUser(user);
    const token = signToken({
      admin: false,
      userId: user.id,
      email: user.email,
      role: user.role || "user",
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7
    });
    const encodedUser = Buffer.from(JSON.stringify(publicProfile)).toString("base64url");
    res.redirect(`/profile?token=${encodeURIComponent(token)}&user=${encodeURIComponent(encodedUser)}`);
  } catch (error) {
    console.warn("OAuth callback failed:", error.message);
    res.redirect("/login?oauth=failed");
  }
});

app.post("/api/auth/register", (req, res) => {
  const db = readDb();
  const name = String(req.body?.name || "").trim();
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (name.length < 2) return res.status(400).json({ error: "Name is required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Valid email is required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  if (db.users.some((user) => user.email === email)) return res.status(409).json({ error: "This email is already registered" });

  const user = {
    id: `user-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    name,
    email,
    passwordHash: hashPassword(password),
    role: "user",
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  writeDb(db);

  const token = signToken({
    admin: false,
    userId: user.id,
    email: user.email,
    role: "user",
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7
  });
  res.status(201).json({ token, user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const identifier = String(req.body?.identifier || req.body?.email || "").trim();
  const password = String(req.body?.password || "");

  if (identifier === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = signToken({
      admin: true,
      username: ADMIN_USERNAME,
      role: "admin",
      exp: Date.now() + 1000 * 60 * 60 * 12
    });
    return res.json({
      token,
      user: { id: "admin", name: "Admin", email: ADMIN_USERNAME, role: "admin", isAdmin: true }
    });
  }

  const email = normalizeEmail(identifier);
  const db = readDb();
  const user = db.users.find((item) => item.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid login details" });
  }

  const token = signToken({
    admin: false,
    userId: user.id,
    email: user.email,
    role: user.role || "user",
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7
  });
  return res.json({ token, user: publicUser(user) });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  if (req.auth.admin) {
    return res.json({ user: { id: "admin", name: "Admin", email: ADMIN_USERNAME, role: "admin", isAdmin: true } });
  }
  const db = readDb();
  const user = db.users.find((item) => item.id === req.auth.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ user: publicUser(user) });
});

app.get("/api/dashboard", requireAuth, (req, res) => {
  if (req.auth.admin) {
    return res.json({
      subscriptions: [],
      payments: [],
      notifications: [],
      discord: { connected: false, premiumRole: false },
      recentOpportunities: scannerState.opportunities.slice(0, 8)
    });
  }
  const db = readDb();
  const userId = req.auth.userId;
  res.json({
    subscriptions: db.subscriptions.filter((item) => item.userId === userId),
    payments: db.payments.filter((item) => item.userId === userId).slice(0, 20),
    notifications: db.notifications.filter((item) => item.userId === userId).slice(0, 20),
    discord: {
      connected: false,
      premiumRole: db.subscriptions.some((item) => item.userId === userId && item.status === "active" && isPremiumDiscordPlan(item.planId))
    },
    recentOpportunities: scannerState.opportunities.slice(0, 8)
  });
});

app.post("/api/subscriptions/cancel", requireAuth, (req, res) => {
  const db = readDb();
  const subscription = db.subscriptions.find((item) => item.id === req.body?.subscriptionId && item.userId === req.auth.userId);
  if (!subscription) return res.status(404).json({ error: "Subscription not found" });
  subscription.status = "cancelled";
  subscription.autoRenew = false;
  subscription.cancelledAt = nowIso();
  subscription.updatedAt = nowIso();
  const user = db.users.find((item) => item.id === req.auth.userId);
  if (isPremiumDiscordPlan(subscription.planId)) {
    syncDiscordRole(user, false).catch((error) => console.warn("Discord role removal failed:", error.message));
  }
  writeDb(db);
  addAuditLog("subscription.cancelled", req.auth.email, { subscriptionId: subscription.id });
  res.json(subscription);
});

app.get("/api/admin/dashboard", requireAdmin, (req, res) => {
  const db = readDb();
  res.json({
    courses: db.courses.length,
    uploadedVideos: db.courses.filter((course) => course.videoUrl).length,
    bookUploaded: Boolean(db.book?.pdfUrl),
    users: db.users.length,
    activeSubscriptions: db.subscriptions.filter((item) => item.status === "active").length,
    revenue: db.payments.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.amount || 0), 0),
    payments: db.payments.length,
    scanner: {
      opportunities: scannerState.opportunities.length,
      lastUpdated: scannerState.lastUpdated,
      exchangesOnline: Object.values(scannerState.exchanges).filter((item) => item.status === "online").length
    },
    storage: {
      videos: "/uploads/videos",
      images: "/uploads/images",
      books: "/uploads/books"
    }
  });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const db = readDb();
  res.json({
    users: db.users.map(publicUser),
    subscriptions: db.subscriptions,
    payments: db.payments.slice(0, 100)
  });
});

app.get("/api/admin/platform", requireAdmin, (req, res) => {
  const db = readDb();
  res.json({
    users: db.users.map(publicUser),
    subscriptions: db.subscriptions,
    payments: db.payments.slice(0, 100),
    paymentLogs: db.paymentLogs.slice(0, 100),
    auditLogs: db.auditLogs.slice(0, 100),
    announcements: db.announcements.slice(0, 100),
    scannerControls: db.scannerControls,
    discord: {
      oauthConfigured: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
      botConfigured: Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_PREMIUM_ROLE_ID && process.env.DISCORD_GUILD_ID)
    },
    ai: {
      configured: isOpenAiConfigured(),
      model: OPENAI_MODEL,
      rateLimit: AI_MAX_REQUESTS_PER_WINDOW
    },
    providers: {
      payriff: isPayriffConfigured(),
      epoint: Boolean(process.env.EPOINT_PRIVATE_KEY),
      crypto: Boolean(process.env.CRYPTO_PAYMENT_WALLET),
      card: Boolean(process.env.CARD_PROVIDER_SECRET)
    }
  });
});

app.post("/api/admin/scanner-controls", requireAdmin, (req, res) => {
  const db = readDb();
  db.scannerControls = {
    ...db.scannerControls,
    enabled: req.body?.enabled !== false,
    minSpread: Number(req.body?.minSpread ?? db.scannerControls.minSpread ?? 0.25),
    notionalUsd: Number(req.body?.notionalUsd ?? db.scannerControls.notionalUsd ?? DEFAULT_NOTIONAL_USD),
    refreshMs: Number(req.body?.refreshMs ?? db.scannerControls.refreshMs ?? SCANNER_REFRESH_MS)
  };
  writeDb(db);
  addAuditLog("scanner.controls.updated", req.admin.username, db.scannerControls);
  res.json(db.scannerControls);
});

app.post("/api/admin/announcements", requireAdmin, (req, res) => {
  const db = readDb();
  const announcement = {
    id: `ann-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    title: String(req.body?.title || "Announcement").trim(),
    body: String(req.body?.body || "").trim(),
    channels: Array.isArray(req.body?.channels) ? req.body.channels : ["dashboard"],
    createdAt: nowIso()
  };
  db.announcements.unshift(announcement);
  writeDb(db);
  addAuditLog("announcement.created", req.admin.username, { announcementId: announcement.id });
  res.status(201).json(announcement);
});

app.post(
  "/api/admin/courses",
  requireAdmin,
  upload.fields([
    { name: "videoFile", maxCount: 1 },
    { name: "thumbnailFile", maxCount: 1 }
  ]),
  (req, res) => {
    const db = readDb();
    const id = `course-${slug(req.body.title)}-${Date.now()}`;
    const course = {
      id,
      title: req.body.title || "Untitled Course",
      description: req.body.description || "",
      category: req.body.category || "beginner",
      duration: req.body.duration || "",
      isFree: req.body.isFree === "true" || req.body.isFree === "on",
      videoUrl: publicFileUrl(req.files?.videoFile?.[0]),
      thumbnailUrl: publicFileUrl(req.files?.thumbnailFile?.[0]),
      createdAt: new Date().toISOString()
    };
    db.courses.unshift(course);
    writeDb(db);
    res.status(201).json(course);
  }
);

app.put(
  "/api/admin/courses/:id",
  requireAdmin,
  upload.fields([
    { name: "videoFile", maxCount: 1 },
    { name: "thumbnailFile", maxCount: 1 }
  ]),
  (req, res) => {
    const db = readDb();
    const course = db.courses.find((item) => item.id === req.params.id);
    if (!course) return res.status(404).json({ error: "Course not found" });
    course.title = req.body.title || course.title;
    course.description = req.body.description ?? course.description;
    course.category = req.body.category || course.category;
    course.duration = req.body.duration ?? course.duration;
    course.isFree = req.body.isFree === "true" || req.body.isFree === "on";
    course.videoUrl = publicFileUrl(req.files?.videoFile?.[0]) || course.videoUrl;
    course.thumbnailUrl = publicFileUrl(req.files?.thumbnailFile?.[0]) || course.thumbnailUrl;
    course.updatedAt = new Date().toISOString();
    writeDb(db);
    res.json(course);
  }
);

app.delete("/api/admin/courses/:id", requireAdmin, (req, res) => {
  const db = readDb();
  const before = db.courses.length;
  db.courses = db.courses.filter((item) => item.id !== req.params.id);
  if (db.courses.length === before) return res.status(404).json({ error: "Course not found" });
  writeDb(db);
  res.json({ ok: true });
});

app.post(
  "/api/admin/book",
  requireAdmin,
  upload.fields([
    { name: "bookFile", maxCount: 1 },
    { name: "coverFile", maxCount: 1 }
  ]),
  (req, res) => {
    const db = readDb();
    db.book = {
      ...db.book,
      title: req.body.title || db.book?.title || "Bull & Bear Trading Mastery",
      description: req.body.description ?? db.book?.description ?? "",
      price: Number(req.body.price || db.book?.price || 49.9),
      coverUrl: publicFileUrl(req.files?.coverFile?.[0]) || db.book?.coverUrl || "",
      pdfUrl: publicFileUrl(req.files?.bookFile?.[0]) || db.book?.pdfUrl || "",
      updatedAt: new Date().toISOString()
    };
    writeDb(db);
    res.json(db.book);
  }
);

app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message || "Request failed" });
  }
  return next();
});

app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

scheduleScanner();

app.listen(PORT, () => {
  console.log(`Bull & Bear Academy is running on http://localhost:${PORT}`);
  console.log(`Admin login username: ${ADMIN_USERNAME}`);
});
