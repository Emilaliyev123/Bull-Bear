const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const helmet = require("helmet");
const xss = require("xss");
const rateLimit = require("express-rate-limit");
const {
  AnalyzerValidationError,
  analyzeMarketHubWithLiveData
} = require("./services/marketHubAnalyzer");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_URL = String(process.env.APP_URL || "").replace(/\/+$/, "");
const ROOT = __dirname;
const STORAGE_ROOT = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : ROOT;
const DATA_DIR = path.join(STORAGE_ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const SEED_FILE = path.join(ROOT, "data", "seed.json");
const UPLOAD_DIR = path.join(STORAGE_ROOT, "uploads");
const PUBLIC_DIR = path.join(ROOT, "public");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SECRET = process.env.ADMIN_SECRET || crypto.randomBytes(32).toString("hex");
const ADMIN_LOGIN_ENABLED = Boolean(ADMIN_USERNAME && ADMIN_PASSWORD);
const SCANNER_REFRESH_MS = Number(process.env.SCANNER_REFRESH_MS || 12000);
const DEFAULT_NOTIONAL_USD = Number(process.env.SCANNER_NOTIONAL_USD || 1000);
const MAX_REASONABLE_SPREAD_PCT = Number(process.env.SCANNER_MAX_SPREAD_PCT || 25);
const MIN_SCANNER_PRICE = Number(process.env.SCANNER_MIN_PRICE || 0.00000001);
const PAYMENT_PLANS = {
  
  "premium-discord-signals": {
    name: "Legacy Premium Telegram Signals",
    amount: 49.9,
    cadence: "monthly",
    accessDays: 30
  },
  "investor-trader-ai": {
    name: "Legacy Investor & Trader AI",
    amount: 19.9,
    cadence: "monthly",
    accessDays: 30
  },
  "arbitrage-only": {
    name: "Market Hub Pro",
    amount: 99.9,
    cadence: "monthly",
    accessDays: 30
  }
};
const RETIRED_CHECKOUT_PLAN_IDS = new Set(["premium-discord-signals", "investor-trader-ai"]);
const AI_ACCESS_PLAN_IDS = new Set(["arbitrage-only", "bull-bear-premium", "premium-discord-signals", "investor-trader-ai"]);
const SCANNER_ACCESS_PLAN_IDS = new Set(["arbitrage-only", "bull-bear-premium"]);

const WEBHOOK_PROVIDER_IDS = new Set(["payriff", "epoint", "crypto", "card"]);
const PAYMENT_DEFAULT_PROVIDER = process.env.PAYMENT_DEFAULT_PROVIDER || "payriff";
const PAYRIFF_BASE_URL = (process.env.PAYRIFF_BASE_URL || "https://api.payriff.com").replace(/\/+$/, "");
const PAYRIFF_CREATE_PATH = process.env.PAYRIFF_CREATE_PATH || "/api/v3/orders";
const PAYRIFF_ORDER_PATH = process.env.PAYRIFF_ORDER_PATH || "/api/v3/orders/:orderId";
const PAYRIFF_CURRENCY = process.env.PAYRIFF_CURRENCY || "AZN";
const PAYRIFF_USD_TO_AZN_RATE = Number(process.env.PAYRIFF_USD_TO_AZN_RATE || 1.7);
const PAYRIFF_LANGUAGE = process.env.PAYRIFF_LANGUAGE || "EN";
const { GoogleGenerativeAI } = require("@google/generative-ai");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const AI_USE_OPENAI = String(process.env.AI_USE_OPENAI || "false").toLowerCase() === "true" || Boolean(GEMINI_API_KEY);
const AI_MAX_REQUESTS_PER_WINDOW = Number(process.env.AI_MAX_REQUESTS_PER_WINDOW || 10);
const AI_RATE_WINDOW_MS = Number(process.env.AI_RATE_WINDOW_MS || 10 * 60 * 1000);

app.set("trust proxy", true);

const uploadFolders = {
  
  coverFile: "images",
  
  imageFile: "images"
};



function validateEnvironmentConfiguration() {
  const missing = [];
  if (!process.env.ADMIN_SECRET) {
    console.warn("⚠️  WARNING: ADMIN_SECRET is missing. A random one will be generated, invalidating sessions on restart.");
  } else if (process.env.ADMIN_SECRET.length < 16) {
    missing.push("ADMIN_SECRET is too short (must be >= 16 chars).");
  }
  
  if (!process.env.PAYRIFF_SECRET_KEY && process.env.PAYMENT_DEFAULT_PROVIDER === "payriff") {
    console.warn("⚠️  WARNING: PAYRIFF_SECRET_KEY is missing. Checkout flows will fail in production.");
  }
  
  if (missing.length > 0) {
    console.error("❌ CRITICAL SECURITY ERROR: Environment validation failed.");
    missing.forEach(err => console.error(`   - ${err}`));
    process.exit(1);
  }
}
validateEnvironmentConfiguration();

function ensureProjectFiles() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const folder of Object.values(uploadFolders)) {
      fs.mkdirSync(path.join(UPLOAD_DIR, folder), { recursive: true });
    }
  } catch (err) {
    console.warn("Failed to create project directories:", err.message);
  }

  if (!fs.existsSync(DATA_FILE)) {
    try {
      if (fs.existsSync(SEED_FILE)) {
        fs.copyFileSync(SEED_FILE, DATA_FILE);
      } else {
        fs.writeFileSync(DATA_FILE, "{}");
      }
    } catch (err) {
      console.warn("Failed to initialize db.json from seed:", err.message);
      try {
        fs.writeFileSync(DATA_FILE, "{}");
      } catch (fallbackErr) {
        console.warn("Failed to create fallback db.json:", fallbackErr.message);
      }
    }
  }
}

let dbCache = null;
let writeTimeout = null;

function readDb() {
  if (dbCache) return dbCache;
  ensureProjectFiles();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    dbCache = JSON.parse(raw);
  } catch (err) {
    console.error("Failed to read DB, using empty fallback", err);
    dbCache = {};
  }
  
  dbCache.users = Array.isArray(dbCache.users) ? dbCache.users : [];
  dbCache.subscriptions = Array.isArray(dbCache.subscriptions) ? dbCache.subscriptions : [];
  dbCache.payments = Array.isArray(dbCache.payments) ? dbCache.payments : [];
  dbCache.paymentLogs = Array.isArray(dbCache.paymentLogs) ? dbCache.paymentLogs : [];
  dbCache.oauthStates = Array.isArray(dbCache.oauthStates) ? dbCache.oauthStates : [];
  dbCache.auditLogs = Array.isArray(dbCache.auditLogs) ? dbCache.auditLogs : [];
  dbCache.announcements = Array.isArray(dbCache.announcements) ? dbCache.announcements : [];
  dbCache.notifications = Array.isArray(dbCache.notifications) ? dbCache.notifications : [];
  dbCache.scannerControls = dbCache.scannerControls || {
    enabled: true,
    minSpread: 0.25,
    notionalUsd: DEFAULT_NOTIONAL_USD,
    refreshMs: SCANNER_REFRESH_MS
  };
  return dbCache;
}

function normalizeSubscriptionRecord(subscription) {
  if (!subscription) return subscription;
  const paidUntil = subscription.paid_until || subscription.paidUntil || subscription.expiresAt || "";
  if (paidUntil) {
    subscription.paid_until = paidUntil;
    subscription.paidUntil = paidUntil;
    subscription.expiresAt = paidUntil;
  }
  return subscription;
}

function flushDbSync() {
  if (!dbCache) return;
  const tmp = `${DATA_FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(dbCache, null, 2)}\n`);
    fs.renameSync(tmp, DATA_FILE);
  } catch (error) {
    console.warn("Failed to flush DB to disk:", error.message);
  }
}

function writeDb(db) {
  dbCache = db;
  if (writeTimeout) clearTimeout(writeTimeout);
  writeTimeout = setTimeout(() => {
    flushDbSync();
    writeTimeout = null;
  }, 500); // 500ms debounce
}

// Graceful shutdown to prevent data loss
process.on('SIGINT', () => {
  if (writeTimeout) flushDbSync();
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (writeTimeout) flushDbSync();
  process.exit(0);
});

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
  const rel = path.relative(UPLOAD_DIR, file.path).split(path.sep).join("/");
  return `/uploads/${rel}`;
}

function resolveUploadFile(publicUrl, folder) {
  const value = String(publicUrl || "").replace(/^\/+/, "");
  const expectedPrefix = `uploads/${folder}/`;
  if (!value.startsWith(expectedPrefix)) return "";
  const fullPath = path.resolve(STORAGE_ROOT, value);
  const expectedRoot = path.resolve(UPLOAD_DIR, folder);
  if (fullPath !== expectedRoot && !fullPath.startsWith(`${expectedRoot}${path.sep}`)) return "";
  return fullPath;
}

function removeUploadFile(publicUrl, folder) {
  const filePath = resolveUploadFile(publicUrl, folder);
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    console.warn("Could not delete uploaded file:", error.message);
  }
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

function timingSafeStringEqual(actual, expected) {
  const actualValue = String(actual || "");
  const expectedValue = String(expected || "");
  if (!actualValue || !expectedValue) return false;
  const actualBuffer = Buffer.from(actualValue);
  const expectedBuffer = Buffer.from(expectedValue);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || "user",
    isAdmin: user.role === "admin",
    discordId: user.discordId || "",
    discordUsername: user.discordUsername || "",
    discordConnected: Boolean(user.discordId)
  };
}

function findUserForAuth(db, auth = {}) {
  if (!auth || auth.admin) return null;
  const email = normalizeEmail(auth.email);
  return db.users.find((item) => item.id === auth.userId)
    || (email ? db.users.find((item) => normalizeEmail(item.email) === email) : null)
    || null;
}

function authUserId(db, auth = {}) {
  return findUserForAuth(db, auth)?.id || "";
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

function addPaymentLog(db, provider, status, paymentId = "") {
  db.paymentLogs.unshift({
    id: `webhook-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    provider,
    status,
    paymentId,
    createdAt: nowIso()
  });
}

function providerWebhookSecret(provider) {
  const key = `${String(provider || "").toUpperCase()}_WEBHOOK_SECRET`;
  return process.env[key] || process.env.WEBHOOK_SHARED_SECRET || "";
}

function paidUntilTime(subscription) {
  const value = subscription?.paid_until || subscription?.paidUntil || subscription?.expiresAt || "";
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function isSubscriptionActive(subscription) {
  return subscription?.status === "active" && paidUntilTime(subscription) > Date.now();
}

function findActiveSubscription(db, userId, planId) {
  return db.subscriptions
    .map(normalizeSubscriptionRecord)
    .find((item) => item.userId === userId && item.planId === planId && item.status === "active");
}

function activePlanIdsForUser(db, userId) {
  return db.subscriptions
    .map(normalizeSubscriptionRecord)
    .filter((item) => item.userId === userId && isSubscriptionActive(item))
    .map((item) => item.planId);
}

function activateSubscription(db, userId, planId, paymentId) {
  const plan = PAYMENT_PLANS[planId] || PAYMENT_PLANS["arbitrage-only"];
  const days = plan.accessDays || 30;
  const now = Date.now();
  const existing = findActiveSubscription(db, userId, planId);
  const baseTime = existing && plan.cadence === "monthly"
    ? Math.max(now, paidUntilTime(existing))
    : now;
  const paidUntil = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
  if (existing) {
    existing.status = "active";
    existing.paid_until = paidUntil;
    existing.paidUntil = paidUntil;
    existing.expiresAt = paidUntil;
    existing.autoRenew = plan.cadence === "monthly";
    existing.paymentId = paymentId || existing.paymentId;
    existing.paymentStatus = "paid";
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
    paid_until: paidUntil,
    paidUntil,
    expiresAt: paidUntil,
    paymentId,
    paymentStatus: "paid",
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
  return db.subscriptions.map(normalizeSubscriptionRecord).some((item) => (
    item.userId === userId
    && planIds.has(item.planId)
    && isSubscriptionActive(item)
  ));
}

function deactivateSubscriptionForPayment(db, payment, status) {
  if (!payment?.userId || !payment?.planId) return null;
  const subscription = findActiveSubscription(db, payment.userId, payment.planId);
  if (!subscription) return null;
  subscription.status = status || "payment_failed";
  subscription.paymentStatus = payment.status || status || "failed";
  subscription.autoRenew = false;
  subscription.updatedAt = nowIso();
  return subscription;
}

function hasAiAccess(db, auth = {}) {
  return Boolean(auth.admin || hasActiveSubscription(db, authUserId(db, auth), AI_ACCESS_PLAN_IDS));
}

function hasScannerAccess(db, auth = {}) {
  return Boolean(auth.admin || hasActiveSubscription(db, authUserId(db, auth), SCANNER_ACCESS_PLAN_IDS));
}


function notifySubscriptionActivated(db, payment) {
  const alreadyExists = db.notifications.some((item) => item.paymentId === payment.id && item.type === "subscription");
  if (alreadyExists) return;
  const plan = PAYMENT_PLANS[payment.planId] || { name: payment.planId };
  const body = `Your ${plan.name} access is active.`;
  db.notifications.unshift({
    id: `note-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    userId: payment.userId,
    paymentId: payment.id,
    type: "subscription",
    title: "Access activated",
    body,
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
    currency: String(PAYRIFF_CURRENCY || "AZN").trim().toUpperCase() || "AZN",
    language: PAYRIFF_LANGUAGE
  };
}

function isPayriffConfigured() {
  const config = payriffConfig();
  return Boolean(config.baseUrl && config.secretKey);
}

function payriffDisplayAmount(amount) {
  return Number(Number(amount || 0).toFixed(2));
}

function payriffUsdToAznRate() {
  return Number.isFinite(PAYRIFF_USD_TO_AZN_RATE) && PAYRIFF_USD_TO_AZN_RATE > 0
    ? PAYRIFF_USD_TO_AZN_RATE
    : 1.7;
}

function payriffAmount(amount, currency = payriffConfig().currency) {
  const displayAmount = payriffDisplayAmount(amount);
  const normalizedCurrency = String(currency || "").trim().toUpperCase();
  const checkoutAmount = normalizedCurrency === "AZN"
    ? displayAmount * payriffUsdToAznRate()
    : displayAmount;
  return Number(checkoutAmount.toFixed(2));
}

function payriffMessage(payload = {}, fallback = "Payriff request failed") {
  let msg = payload?.message
    || payload?.error
    || payload?.payload?.message
    || payload?.payload?.error
    || fallback;
  const ticket = payload?.ticket || payload?.payload?.ticket || payload?.ticketId;
  if (ticket && msg === "Application not found") {
    return `Payment provider returned: Application not found. Please contact support with ticket ${ticket}.`;
  }
  if (ticket) {
    msg = String(msg).replace(/support\s+ticket\s*[:#\-]?\s*[a-zA-Z0-9]+/i, "").trim();
    return `${msg} (support ticket: ${ticket})`;
  }
  return msg;
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
  if (payment.status === "failed" && isPremiumDiscordPlan(payment.planId)) {
    const subscription = deactivateSubscriptionForPayment(db, payment, "payment_failed");
    const user = db.users.find((item) => item.id === payment.userId);
    if (subscription) {
      syncDiscordRole(user, false).catch((error) => console.warn("Discord role removal failed:", error.message));
    }
  }
  return null;
}

const PAYRIFF_REQUEST_TIMEOUT_MS = 15000;

function safeUrlHostname(urlStr) {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return "invalid_url";
  }
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
      signal: AbortSignal.timeout(PAYRIFF_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    const detail = error.cause?.code || error.cause?.message || error.name || "network_error";
    const timedOut = error.name === "TimeoutError" || detail === "timeout";
    const errorMessage = timedOut 
      ? "Payriff is temporarily unavailable because the secure checkout request timed out. Please try again."
      : "Payriff is temporarily unavailable due to a network routing error.";
    console.warn("Payriff network request failed:", { 
      targetUrl: safeUrlHostname(targetUrl), 
      category: timedOut ? "timeout" : "network_error",
      detail 
    });
    throw new Error(errorMessage);
  }
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  
  if (!response.ok) {
    const responseErrorMessage = payriffMessage(payload, `Payriff returned ${response.status}`);
    console.error("Payriff application error:", {
      status: response.status,
      errorMessage: responseErrorMessage,
      endpointHostname: safeUrlHostname(`${config.baseUrl}${config.createPath}`),
      secretExists: Boolean(config.secretKey)
    });
    throw new Error(responseErrorMessage);
  }
  if (payload?.code && !["00000", "0", "success", "SUCCESS"].includes(String(payload.code))) {
    const responseErrorMessage = payriffMessage(payload);
    console.error("Payriff API rejected request:", {
      code: payload.code,
      errorMessage: responseErrorMessage,
      endpointHostname: safeUrlHostname(`${config.baseUrl}${config.createPath}`),
      secretExists: Boolean(config.secretKey)
    });
    throw new Error(responseErrorMessage);
  }
  return payload;
}

async function createPayriffCheckout(req, payment, plan, planId) {
  const config = payriffConfig();
  const baseUrl = requestBaseUrl(req);
  const callbackUrl = `${baseUrl}/api/payments/webhook/payriff?paymentId=${encodeURIComponent(payment.id)}`;
  const checkoutAmount = payriffAmount(plan.amount, config.currency);
  payment.displayAmount = payriffDisplayAmount(plan.amount);
  payment.displayCurrency = "USD";
  payment.providerAmount = checkoutAmount;
  payment.providerCurrency = config.currency;
  payment.exchangeRate = config.currency === "AZN" ? payriffUsdToAznRate() : null;
  
  console.info("Initializing Payriff checkout order:", {
    paymentId: payment.id,
    planId,
    currency: config.currency,
    endpointHostname: safeUrlHostname(`${config.baseUrl}${config.createPath}`),
    callbackUrlHost: safeUrlHostname(callbackUrl),
    secretExists: Boolean(config.secretKey)
  });

  const payload = await callPayriff("POST", config.createPath, {
    amount: checkoutAmount,
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

function requireScannerAccess(req, res, next) {
  const db = readDb();
  if (!hasScannerAccess(db, req.auth)) {
    return res.status(402).json({
      error: "Market Hub Pro requires an active subscription.",
      requiredPlan: "arbitrage-only",
      checkoutUrl: "/checkout/arbitrage-only"
    });
  }
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

function oauthAuthorizeUrl(config, state, prompt = "select_account") {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scope,
    state,
    prompt
  });
  return `${config.authorizeUrl}?${params.toString()}`;
}

function createOauthState(db, provider, userId = "") {
  const state = crypto.randomBytes(18).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.oauthStates = (db.oauthStates || []).filter((item) => new Date(item.expiresAt).getTime() > Date.now());
  db.oauthStates.push({
    state,
    provider,
    userId,
    createdAt: nowIso(),
    expiresAt
  });
  return state;
}

function consumeOauthState(db, state, provider) {
  if (!state) return null;
  const index = (db.oauthStates || []).findIndex((item) => (
    item.state === state
    && item.provider === provider
    && new Date(item.expiresAt).getTime() > Date.now()
  ));
  if (index === -1) return null;
  const [record] = db.oauthStates.splice(index, 1);
  return record;
}

async function ensureDiscordGuildMember(user, accessToken) {
  if (!user?.discordId || !accessToken || !process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_GUILD_ID) return false;
  if (String(process.env.DISCORD_AUTO_JOIN || "true").toLowerCase() === "false") return false;
  const url = `https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${user.discordId}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ access_token: accessToken })
  });
  return response.ok || response.status === 204;
}

async function syncDiscordRole(user, shouldHaveRole) {
  if (!user?.discordId || !process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_GUILD_ID || !process.env.DISCORD_PREMIUM_ROLE_ID) return false;
  const method = shouldHaveRole ? "PUT" : "DELETE";
  const url = `https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${user.discordId}/roles/${process.env.DISCORD_PREMIUM_ROLE_ID}`;
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
  });
  if (!response.ok && response.status !== 404) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Discord role ${shouldHaveRole ? "add" : "remove"} failed with ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  return response.ok || response.status === 404;
}

async function syncExpiredDiscordMemberships() {
  const db = readDb();
  let changed = false;
  let removedRoles = 0;
  const now = Date.now();
  for (const subscription of db.subscriptions.map(normalizeSubscriptionRecord)) {
    if (!isPremiumDiscordPlan(subscription.planId)) continue;
    const expired = paidUntilTime(subscription) <= now;
    const inactive = subscription.status !== "active";
    if (!expired && !inactive) continue;
    if (subscription.status === "active") {
      subscription.status = "expired";
      subscription.paymentStatus = "expired";
      subscription.autoRenew = false;
      subscription.updatedAt = nowIso();
      changed = true;
    }
    const user = db.users.find((item) => item.id === subscription.userId);
    if (user?.discordId) {
      try {
        const ok = await syncDiscordRole(user, false);
        if (ok) removedRoles += 1;
      } catch (error) {
        console.warn("Discord expiry role removal failed:", error.message);
      }
    }
  }
  if (changed) writeDb(db);
  if (changed || removedRoles) {
    addAuditLog("discord.membership.expiry_sync", "system", { removedRoles });
  }
}

function scheduleDiscordMembershipSync() {
  setTimeout(() => {
    syncExpiredDiscordMemberships().catch((error) => console.warn("Discord membership sync failed:", error.message));
  }, 10000);
  setInterval(() => {
    syncExpiredDiscordMemberships().catch((error) => console.warn("Discord membership sync failed:", error.message));
  }, 24 * 60 * 60 * 1000);
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
  if (provider === "discord") {
    user.discordUsername = profile.username || profile.name || "";
    user.discordEmail = email;
    user.discordConnectedAt = nowIso();
  }
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
  return AI_USE_OPENAI && (Boolean(OPENAI_API_KEY) || Boolean(GEMINI_API_KEY));
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
  // Strip markdown code fences (Gemini wraps JSON in ```json ... ``` blocks)
  const cleaned = String(text || "")
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // If it's not JSON, treat it as a plain chat answer
    return {
      title: "Bull & Bear AI Pro",
      chatAnswer: cleaned || "The AI returned an empty response.",
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
  const q = String(request.question || request.asset || "").toLowerCase();
  const raw = String(request.question || "").trim();

  // ─── Coin/Token detection (broad) ──────────────────────────────────────────
  const coinMap = {
    bitcoin: "BTC", btc: "BTC",
    ethereum: "ETH", eth: "ETH",
    solana: "SOL", sol: "SOL",
    xrp: "XRP", ripple: "XRP",
    bnb: "BNB", binancecoin: "BNB",
    doge: "DOGE", dogecoin: "DOGE",
    cardano: "ADA", ada: "ADA",
    avalanche: "AVAX", avax: "AVAX",
    polkadot: "DOT", dot: "DOT",
    chainlink: "LINK", link: "LINK",
    polygon: "MATIC", matic: "MATIC", pol: "MATIC",
    shiba: "SHIB", shib: "SHIB",
    litecoin: "LTC", ltc: "LTC",
    tron: "TRX", trx: "TRX",
    uniswap: "UNI", uni: "UNI",
    aave: "AAVE",
    pepe: "PEPE",
    sui: "SUI",
    aptos: "APT", apt: "APT",
    near: "NEAR",
    atom: "ATOM", cosmos: "ATOM",
    ton: "TON",
    arbitrum: "ARB", arb: "ARB",
    optimism: "OP",
    ftx: "FTX",
    usdt: "USDT", tether: "USDT",
    usdc: "USDC",
  };

  const detectedCoin = Object.keys(coinMap).find(k => q.includes(k));
  const coinTicker = detectedCoin ? coinMap[detectedCoin] : null;

  // ─── Specific indicator / concept detection ─────────────────────────────────
  const isAboutRsi = /\brsi\b|relative strength index/.test(q);
  const isAboutMacd = /\bmacd\b|moving average convergence/.test(q);
  const isAboutEma = /\bema\b|exponential moving average|\bsma\b|moving average/.test(q);
  const isAboutFibonacci = /fibonacci|fib retracement|golden ratio level/.test(q);
  const isAboutBollinger = /bollinger|bb band|standard deviation band/.test(q);
  const isAboutVwap = /\bvwap\b|volume weighted/.test(q);
  const isAboutIchimoku = /ichimoku|cloud chart|tenkan|kijun/.test(q);
  const isAboutCandlestick = /candlestick|candle pattern|doji|hammer|engulfing|shooting star|pin bar/.test(q);
  const isAboutSupportResistance = /support.?resistance|key level|supply.?demand|order block|fair value gap|fvg/.test(q);
  const isAboutTrendline = /trendline|trend line|channel|wedge|triangle/.test(q);

  // ─── Market / asset class detection ─────────────────────────────────────────
  const isAboutCrypto = !!(coinTicker || /crypto|blockchain|defi|altcoin|web3|nft|staking|yield farming|liquidity pool/.test(q));
  const isAboutForex = /\bforex\b|\bfx\b|currency pair|\bpip\b|eur\/|gbp\/|usd\/|jpy\/|eurusd|gbpusd|usdjpy|audusd|usdchf|usdcad|nzdusd|carry trade/.test(q);
  const isAboutGold = /\bgold\b|xauusd|\bxau\b|\bsilver\b|\bxag\b|precious metal/.test(q);
  const isAboutOil = /\boil\b|\bwti\b|\bbrent\b|crude|petroleum|energy commodity/.test(q);
  const isAboutStocks = /\bstock\b|equity|equities|s&p|sp500|nasdaq|nyse|\bearnings\b|dividend|ipo|shares|market cap|p\/e ratio|valuation/.test(q);
  const isAboutFutures = /\bfutures\b|perpetual|perp|\bleverage\b|liquidat|funding rate|margin call|short sell/.test(q);
  const isAboutOptions = /\boption\b|call option|put option|\bgreeks\b|\btheta\b|\bdelta\b|\bvega\b|\bgamma\b|implied volatility|iv crush|expiry/.test(q);

  // ─── Topic detection ─────────────────────────────────────────────────────────
  const isAboutRisk = /\brisk\b|position size|stop.?loss|drawdown|capital management|lot size|r:r|risk.?reward/.test(q);
  const isAboutFomc = /fomc|federal reserve|interest rate decision|fed rate|jerome powell|rate hike|rate cut/.test(q);
  const isAboutMacro = /inflation|\bcpi\b|\bgdp\b|\bnfp\b|non.?farm|payroll|macro|recession|yield curve|credit spread/.test(q);
  const isAboutStrategy = /\bstrategy\b|trading system|how to trade|scalp|swing trade|day trade|trading plan|backtesting/.test(q);
  const isAboutPsychology = /psychology|emotion|fear.*greed|discipline|revenge trade|overtrading|mindset|trading journal/.test(q);
  const isAboutArbitrage = /arbitrage|cross.?exchange|spread opportunity/.test(q);
  const isAboutDca = /\bdca\b|dollar cost average|accumulate over time|buy the dip/.test(q);
  const isAboutPortfolio = /portfolio|allocation|diversif|hedge|rebalance|long.?term invest/.test(q);

  // ─── "What is X?" questions about specific coins ─────────────────────────────
  const isWhatIsQuestion = /^(what is|what's|explain|tell me about|describe|give me info|overview of|about)\s/i.test(raw);

  if (coinTicker && (isWhatIsQuestion || q.length < 30)) {
    const coinInfo = {
      BTC: {
        name: "Bitcoin",
        desc: "The first and largest cryptocurrency by market cap. Created by Satoshi Nakamoto in 2009 as a decentralized peer-to-peer digital currency. Bitcoin operates on Proof-of-Work consensus and has a fixed supply of 21 million coins. It halves its block reward roughly every 4 years.",
        use: "Store of value ('digital gold'), hedge against inflation, global settlement layer",
        key: "**Halving cycles** drive major bull markets. **Institutional adoption** (ETFs, corporate treasuries) is a major tailwind. **DXY correlation** is strongly inverse — dollar weak = Bitcoin bid.",
        risk: "Extreme volatility (50–80% drawdowns in bear markets). Regulatory risk. Concentration in large holders (whales)."
      },
      ETH: {
        name: "Ethereum",
        desc: "The leading smart contract platform, launched in 2015 by Vitalik Buterin. Ethereum hosts the vast majority of DeFi protocols, NFT markets, and Layer-2 networks. Transitioned from Proof-of-Work to Proof-of-Stake ('The Merge') in 2022, making ETH deflationary during high activity periods.",
        use: "Smart contracts, DeFi (lending, DEXs), NFTs, stablecoins (USDC, DAI), Layer-2 scaling (Arbitrum, Optimism)",
        key: "**ETH/BTC ratio** shows relative strength. **Staking yield** (~3–4% annually) makes it attractive vs cash. **EIP-1559** burns ETH on transactions.",
        risk: "Competition from Solana, Avalanche. High gas fees during congestion. L2 fragmentation."
      },
      XRP: {
        name: "XRP (Ripple)",
        desc: "XRP is the native token of the XRP Ledger, created by Ripple Labs in 2012. It was designed primarily for cross-border payment settlements and interbank transfers. Unlike Bitcoin, XRP uses a consensus protocol (not mining) and can settle transactions in 3–5 seconds for fractions of a cent.",
        use: "International money transfers, bank settlement layers (RippleNet), liquidity bridging between currencies",
        key: "**Ripple's legal battle with the SEC** (mostly resolved in 2023) was a major overhang — XRP now has clearer regulatory standing in the US. **Bank partnerships** (Santander, SBI Holdings) provide real-world use case. Supply: 100 billion XRP, with Ripple holding ~45% in escrow.",
        risk: "Centralization concerns (Ripple controls large supply). Banks may prefer their own CBDC solutions. Speculative rallies often not backed by fundamental news."
      },
      SOL: {
        name: "Solana",
        desc: "A high-performance Layer-1 blockchain launched in 2020, designed for speed and low cost. Solana uses Proof-of-History (PoH) combined with Proof-of-Stake, achieving ~65,000 TPS theoretical throughput. It became a major DeFi and NFT hub and hosts Pump.fun (meme coin launchpad).",
        use: "DeFi (Jupiter DEX, Raydium), NFTs (Magic Eden), meme coins, payment apps (Solana Pay)",
        key: "**Low fees** (~$0.0001 per transaction) and **fast finality** are core advantages. Strong developer ecosystem and VC backing (a16z, FTX historically). **Token burn** mechanisms reduce supply.",
        risk: "Network outages have occurred multiple times. FTX collapse (2022) devastated ecosystem — recovered strongly since. High competition from Ethereum L2s."
      },
      BNB: {
        name: "BNB (Binance Coin)",
        desc: "The native token of Binance, the world's largest crypto exchange, and the BNB Chain ecosystem. Originally an ERC-20 token for exchange fee discounts, it now powers the BNB Smart Chain (BSC), a parallel blockchain to Ethereum.",
        use: "Trading fee discounts on Binance, gas fees on BNB Chain, DeFi on PancakeSwap, token launches (Launchpad)",
        key: "**Quarterly burns** (BNB Auto-Burn based on BNB price and blocks) reduce supply. Binance exchange volume drives demand. Tied to Binance's business health.",
        risk: "Highly centralized (Binance controls chain validators). Regulatory risk (Binance under scrutiny globally). Ecosystem depends on Binance's survival."
      },
      DOGE: {
        name: "Dogecoin",
        desc: "Originally a joke/meme cryptocurrency created in 2013, Dogecoin became a cultural phenomenon driven by social media (Reddit, Twitter) and Elon Musk's tweets. It uses a Proof-of-Work algorithm similar to Litecoin.",
        use: "Tipping, micropayments, speculation, community-driven rallies. Elon Musk has hinted at Tesla and X (Twitter) payment integration.",
        key: "**Meme and sentiment driven** — fundamentals matter less than social momentum. No supply cap (unlimited issuance, ~5 billion DOGE/year). Massive retail holder base.",
        risk: "Unlimited inflation (5B new DOGE per year). No major protocol upgrades. Entirely driven by sentiment, not fundamentals. Can drop 80-90% from peak very fast."
      },
      ADA: {
        name: "Cardano (ADA)",
        desc: "A Proof-of-Stake blockchain founded by Charles Hoskinson (Ethereum co-founder) in 2017. Cardano is known for its research-driven, peer-reviewed development approach. It uses the Ouroboros consensus protocol.",
        use: "Smart contracts (Plutus), DeFi, NFTs, identity solutions in developing markets (Africa partnerships)",
        key: "**Academic rigor** — all protocol changes go through peer review. **Staking yield** (~3–4%). ADA supply: 45 billion, with ~35 billion in circulation. Slow but methodical development.",
        risk: "Slow development pace vs competitors. DeFi ecosystem significantly smaller than Ethereum/Solana. Has historically underperformed in bull markets despite strong fundamentals."
      },
      LINK: {
        name: "Chainlink (LINK)",
        desc: "Chainlink is the leading decentralized oracle network. It connects smart contracts to real-world data — price feeds, weather data, sports results, etc. Without oracles like Chainlink, DeFi protocols cannot access off-chain information.",
        use: "Price feeds for DeFi (Aave, Compound, Synthetix), verifiable randomness (VRF) for NFTs/gaming, cross-chain interoperability (CCIP)",
        key: "**Essential infrastructure** for DeFi — most major protocols depend on Chainlink. **Staking v0.2** launched, enabling node operators and stakers to earn LINK. Network effects are strong (switching costs high).",
        risk: "Competition from Pyth Network (Solana ecosystem). LINK token needs to capture more value from the network's usage. Slow DeFi growth period hurts demand."
      }
    };

    const info = coinInfo[coinTicker];
    if (info) {
      const liveData = primary && primary.asset && primary.asset.includes(coinTicker)
        ? `\n\n**Live market data:** ${primary.asset} at $${primary.price} | RSI: ${primary.rsi14} | Trend: ${primary.trend} | Support: $${primary.support} | Resistance: $${primary.resistance}`
        : "";
      return `## ${info.name} (${coinTicker}) — Complete Overview

**What is it:** ${info.desc}

**Primary use cases:** ${info.use}

**Key investment thesis:**
${info.key}

**Risk factors:**
${info.risk}${liveData}

**Trading approach for ${coinTicker}:**
- Use **Daily chart** for macro trend direction and key structural levels
- Use **4H chart** for entry timing and momentum
- Key technical zones: watch for breakouts above resistance with volume confirmation; dips to major support with RSI < 35 can be value entries in bull trends
- Always monitor **BTC dominance** — when BTC dominates, altcoins tend to lag; when dominance drops, alt season potential increases

*Educational analysis only — not financial advice. Always manage your own risk.*`;
    }

    // Generic crypto coin answer
    return `## ${coinTicker} — Cryptocurrency Overview

**${coinTicker}** is a cryptocurrency asset. Here's the professional framework for evaluating any crypto asset:

**Fundamental analysis checklist:**
- **Use case:** Does it solve a real problem? What is the token used for?
- **Token economics:** Supply cap, inflation rate, vesting schedules, team allocation
- **Adoption metrics:** Active wallets, transaction volume, developer activity (GitHub commits)
- **Ecosystem:** DeFi TVL, NFT volume, major partnerships
- **Liquidity:** Available on major exchanges? Can you exit without massive slippage?

**Technical analysis approach:**
- Compare performance vs **BTC** (BTC pair) — is it strengthening or weakening relative to Bitcoin?
- Key levels: identify the most recent major highs and lows on the **Weekly chart**
- Volume: accumulation (rising volume on up-days) vs distribution (rising volume on down-days)

**Risk level:** Altcoins below top-20 by market cap carry extreme volatility risk (80%+ drawdowns possible in bear markets).

${primary ? `**Platform data available:** ${primary.asset} at $${primary.price} | RSI: ${primary.rsi14} | ${primary.trend} trend` : ""}

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  // ─── Specific indicator answers ──────────────────────────────────────────────
  if (isAboutRsi) {
    return `## RSI (Relative Strength Index) — Complete Guide

**What RSI measures:** RSI is a momentum oscillator (0–100 scale) that measures the speed and magnitude of price movements. Created by J. Welles Wilder, it compares average gains vs average losses over a set period (standard: 14 periods).

**How to read it correctly:**
- **Below 30:** Oversold — price has fallen aggressively. Watch for reversal signals, not blind buys
- **30–45:** Recovering from weakness — trend may be shifting, wait for confirmation
- **45–55:** Neutral zone — trend is balanced, no strong momentum signal
- **55–70:** Bullish momentum — trend is strengthening, look for continuation setups
- **Above 70:** Overbought — price has risen fast. Can stay overbought in strong trends

**Professional applications:**
- **RSI Divergence:** Price makes new highs but RSI makes lower highs → bearish divergence (likely reversal). One of the most powerful signals
- **RSI in trending markets:** In a bull trend, RSI rarely goes below 40. Bounces from 40–50 are buying opportunities
- **RSI regime:** Above 50 = bullish momentum regime, below 50 = bearish${primary ? `

**Live context:** ${primary.asset} RSI is **${primary.rsi14}** — ${Number(primary.rsi14) > 70 ? "overbought, high risk for late entries" : Number(primary.rsi14) < 30 ? "oversold — potential reversal zone" : Number(primary.rsi14) > 50 ? "bullish momentum zone" : "below midpoint, bearish momentum"}. Price: $${primary.price} | Support: $${primary.support} | Resistance: $${primary.resistance}` : ""}

**Common mistake:** Using RSI alone to enter trades. RSI is a CONFIRMATION tool — always combine with structure (support/resistance) and trend direction.

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutBollinger) {
    return `## Bollinger Bands — Professional Guide

**What they are:** Three lines plotted around price — a **20-period SMA** (middle band) with **upper and lower bands** 2 standard deviations away. Created by John Bollinger.

**Key signals:**
- **Band squeeze (bands narrow):** Low volatility consolidation — often precedes a big move. Direction not predicted, but explosion likely
- **Price touches upper band:** Overbought in range markets. In a strong uptrend, price can "walk the band"
- **Price touches lower band:** Oversold in range markets. In a downtrend, not a buy signal
- **Middle band (20 SMA):** Acts as dynamic support/resistance. Trend direction indicator

**Professional use:**
- Combine with RSI: Upper band touch + RSI > 70 = strong overbought warning
- Use the **%B indicator** to quantify where price is within the bands (0 = lower band, 1 = upper band)
- **Bollinger Band Width** measures squeeze intensity${primary ? `\n\n**Market context:** ${primary.asset} at $${primary.price} | Trend: ${primary.trend} | RSI: ${primary.rsi14}` : ""}

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutMacd) {
    return `## MACD (Moving Average Convergence Divergence) — Professional Guide

**Structure:** MACD has three components:
1. **MACD Line** = 12-period EMA minus 26-period EMA
2. **Signal Line** = 9-period EMA of the MACD Line
3. **Histogram** = MACD Line minus Signal Line (shows momentum speed)

**How professional traders use MACD:**
- **Crossover:** MACD crosses above signal = bullish momentum building
- **Zero line:** MACD above zero = trend is bullish on that timeframe
- **Histogram shrinking:** Momentum is fading — early warning to tighten stops
- **Divergence:** Price makes new highs but histogram shrinks = weakening momentum, watch for reversal

**Best timeframes:** 1H, 4H, and Daily. Avoid 5M/15M — too many false signals.

**Pro workflow:** Use Weekly/Daily MACD for trend bias → 4H MACD for entry timing → only take signals aligned with the higher timeframe

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutFibonacci) {
    return `## Fibonacci Retracement — Professional Trading Application

**Key levels:** **23.6%, 38.2%, 50%, 61.8% (Golden Ratio), 78.6%**

**How to draw correctly:**
- **Uptrend:** Swing LOW → Swing HIGH. Retracement levels show support on pullbacks
- **Downtrend:** Swing HIGH → Swing LOW. Levels show resistance on bounces

**Most important levels:**
- **38.2%:** Shallow — found in very strong trends. Aggressive entry zone
- **50%:** Psychologically significant — strong confluence level
- **61.8% (Golden Ratio):** Most-watched globally. High-probability reversal zone
- **78.6%:** Deep — the trend is being tested hard

**Fibonacci confluence:**
Best setups occur when Fib level aligns with: previous S/R + EMA (20/50/200) + RSI oversold/overbought

**Example:** Uptrend pullback to 61.8% Fib + previous support + 200 EMA = triple confluence → strong buy zone.

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutVwap) {
    return `## VWAP (Volume Weighted Average Price) — Professional Guide

**What it is:** VWAP calculates the average price weighted by volume throughout the trading session. It resets every day (for intraday) or can be anchored to specific dates (Anchored VWAP).

**Why it matters:**
- Institutional traders (funds, market makers) use VWAP as their benchmark — they buy below VWAP and sell above
- Price above VWAP = bullish intraday bias; below = bearish
- First return to VWAP after a gap or breakout = high-probability trade setup

**Professional applications:**
- **VWAP bounce:** Price dips to VWAP in an uptrend with RSI 40–50 → long entry
- **VWAP rejection:** Price rallies to VWAP from below in a downtrend → short entry
- **Anchored VWAP (AVWAP):** Anchor from a major swing low/high or key event date — shows true average cost basis from that point
- **Standard Deviation bands:** ±1 and ±2 SD bands around VWAP act as dynamic support/resistance

**Best for:** Intraday trading on 5M, 15M, 1H charts. Also useful for crypto 24/7 markets on 1H–4H.

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutCandlestick) {
    return `## Candlestick Patterns — Professional Guide

**Single candle patterns (highest reliability):**
- **Doji:** Open = close, indecision. After a trend, signals possible reversal
- **Hammer:** Small body, long lower wick — buyers pushed price back up. Bullish after downtrend
- **Shooting Star:** Small body, long upper wick — sellers rejected rally. Bearish after uptrend
- **Marubozu:** Full body, no wicks — strong conviction candle in the direction it closes

**Two-candle patterns:**
- **Bullish Engulfing:** Bearish candle followed by a larger bullish candle that engulfs it. Strong reversal signal
- **Bearish Engulfing:** Opposite — large bearish candle engulfs previous bullish candle
- **Tweezer Top/Bottom:** Two candles with same high (top) or same low (bottom) — reversal at key level

**Three-candle patterns:**
- **Morning Star:** Three-candle bullish reversal (down, doji, up) — reliable at support
- **Evening Star:** Bearish reversal (up, doji, down) — reliable at resistance
- **Three White Soldiers:** Three consecutive bullish candles — strong uptrend confirmation

**Professional rule:** Candlestick patterns only matter when they appear **at key levels** (support/resistance, Fibonacci). A hammer in the middle of nowhere means nothing.

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutSupportResistance || isAboutTrendline) {
    return `## Support, Resistance & Market Structure — Core Concepts

**Support:** A price level where buying pressure historically exceeded selling pressure. Price bounces from here.
**Resistance:** A price level where selling pressure historically exceeded buying. Price gets rejected here.

**Key principle — Role reversal:** Broken support becomes resistance. Broken resistance becomes support. This is one of the most reliable patterns in all markets.

**How to identify strong levels:**
1. **Multiple touches:** A level touched 3+ times is institutionally significant
2. **High volume at the level:** Shows where large orders were placed
3. **Clean rejection:** Sharp bounces (not slow grinds) confirm the level
4. **Timeframe hierarchy:** Weekly levels > Daily levels > 4H levels > 1H levels

**Market structure (Smart Money Concepts):**
- **Bullish:** Higher Highs (HH) + Higher Lows (HL) — trend is up
- **Bearish:** Lower Highs (LH) + Lower Lows (LL) — trend is down
- **Break of Structure (BOS):** Price breaks the last swing high/low — trend change signal
- **Order blocks:** Last bearish candle before a bullish move (buy zone) or last bullish candle before a bearish move (sell zone)${primary ? `\n\n**Live data:** ${primary.asset} key zones — Support: $${primary.support} | Resistance: $${primary.resistance} | Current price: $${primary.price} | Trend: ${primary.trend}` : ""}

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  // ─── Asset class answers ────────────────────────────────────────────────────
  if (isAboutGold) {
    return `## Gold (XAU/USD) — Professional Analysis

**What drives gold:**
1. **Real interest rates** — When real rates fall, gold rises. Watch 10Y Treasury yield vs CPI
2. **US Dollar (DXY)** — ~-0.80 inverse correlation. Dollar weakens → gold rises
3. **Geopolitical risk** — Flight-to-safety demand during crises
4. **Central bank buying** — China, India, Poland accumulating at record pace
5. **ETF flows** — GLD/IAU inflows signal institutional demand

**Key levels to watch:**
- Major resistance: $2,450–$2,500 area
- Key support: $2,200–$2,250 zone
- All-time high breakout zone: above $2,500 opens $2,800–$3,000 in a bull continuation${primary && primary.asset && primary.asset.includes("XAU") ? `\n\n**Live data:** ${primary.asset} at $${primary.price} | RSI: ${primary.rsi14} | ${primary.trend} trend | Support: $${primary.support} | Resistance: $${primary.resistance}` : ""}

**Trading checklist:**
- ✅ Check DXY direction (inverse relationship)
- ✅ FOMC meetings — rate cut hints are gold bullish
- ✅ Position size carefully (gold moves $10–$30/oz on major news)
- ✅ Use 4H/Daily for key levels; avoid trading 30min before/after major data

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutOil) {
    return `## Oil (WTI/Brent) — Professional Analysis

**What drives oil:**
1. **OPEC+ supply decisions** — Production cuts → price up. Increases → price down
2. **US Inventory data (EIA, Wednesday)** — Draw = bullish, Build = bearish
3. **Global demand (China PMI, US GDP)** — Strong economy = more oil demand
4. **USD strength** — Oil priced in USD; stronger dollar = oil headwind
5. **Geopolitical risk** — Middle East tension, Russia-Ukraine → supply disruption fears

**Key levels:**
- WTI: $70–$72 = major structural support. $85–$90 = key resistance
- Brent: $75–$77 = support. $90–$95 = resistance

**Trading approach:**
- Use Daily/4H charts for trend and key levels
- Watch Wednesday 14:30 UTC EIA crude inventory data (weekly market mover)
- Strong correlation with risk sentiment — risk-off often hits oil
- Canadian Dollar (CAD) closely correlated with oil prices

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutForex && !isAboutRsi && !isAboutMacd) {
    const liveData = primary ? `\n\n**Platform data:** ${primary.asset} at ${primary.price} | Support: ${primary.support} | Resistance: ${primary.resistance} | RSI: ${primary.rsi14} | ${primary.trend} trend` : "";
    return `## Forex Trading — Professional Framework

**The three sessions:**
- **Asian (Tokyo 00:00–09:00 UTC):** Low volatility, JPY pairs most active. Range-bound
- **London (08:00–17:00 UTC):** Highest volume and volatility. EUR, GBP pairs most active. Major breakouts
- **New York (13:00–22:00 UTC):** USD pairs dominate. London/NY overlap (13:00–17:00) = peak liquidity

**Key drivers:**
1. **Interest rate differentials** — Higher rate currency tends to strengthen (carry trades)
2. **Central banks** — Fed (USD), ECB (EUR), BOE (GBP), BOJ (JPY). Watch each meeting
3. **Economic data** — CPI, NFP, GDP, PMI. Surprises create the biggest moves
4. **Risk sentiment** — Risk-ON: AUD, NZD, high-yielders rise. Risk-OFF: USD, CHF, JPY

**Professional setup checklist:**
- ✅ Higher timeframe (Daily/Weekly) structure confirms bias
- ✅ Session timing matches the pair
- ✅ Economic calendar checked — no major news in 2 hours
- ✅ Key support/resistance level defines stop placement
- ✅ Risk 0.5–1% per trade (pip value × lots × stop pips ≤ risk budget)${liveData}

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutStocks) {
    return `## Stock Market — Professional Framework

**Market structure:**
- **S&P 500** (SPX): 500 largest US companies. Broad market health indicator
- **Nasdaq 100** (NDX): Tech-heavy index. Sensitive to interest rates and growth expectations
- **Dow Jones** (US30): 30 blue-chip industrial stocks. Less representative than S&P

**What drives stocks:**
1. **Earnings (EPS)** — Beat expectations → stock up. Miss → down. EPS growth is the long-term driver
2. **Interest rates** — Higher rates = lower valuations (DCF discount rate increases). Rate cuts = bull fuel
3. **Macro** — GDP growth, employment, consumer spending
4. **Sentiment** — VIX (fear index), put/call ratio, CNN Fear & Greed Index

**Valuation basics:**
- **P/E ratio:** Price ÷ Earnings per share. S&P 500 historical average ~16–18×. Above 25× = expensive
- **Forward P/E:** Uses estimated future earnings — more useful for growth stocks
- **PEG ratio:** P/E divided by earnings growth rate. Below 1 = potentially undervalued

**Trading vs Investing:**
- Trading: Technical levels, earnings plays, sector rotation
- Investing: DCF valuation, moat analysis, dividend growth, dollar-cost averaging

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutFutures) {
    return `## Futures & Leveraged Trading — Professional Framework

**Understanding leverage:**
Leverage amplifies BOTH gains AND losses equally. 10× leverage means a 10% move = 100% gain or 100% loss. This is why position sizing is everything.

**Critical concepts:**
- **Margin:** The collateral required to hold a leveraged position
- **Liquidation price:** The price at which your position is force-closed (total loss of margin)
- **Funding rate (perpetual futures):** Paid between longs and shorts every 8 hours. Positive rate = longs pay shorts. High positive funding = crowded long (contrarian warning)
- **Mark price vs Last price:** Liquidation is based on mark price (aggregate), not last trade price

**Professional leverage rules:**
1. Calculate liquidation price BEFORE opening the position
2. Your stop loss must be significantly above liquidation (liquidation = complete failure)
3. Never use more leverage than what allows a 3–5% price move against you to stay within your risk budget
4. Watch funding rates — extreme positive funding often precedes corrections

**Position sizing formula:**
Max position = (Account × Risk%) ÷ (Entry price − Stop price)

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutOptions) {
    return `## Options Trading — Professional Primer

**The Greeks:**
- **Delta (Δ):** Price change per $1 underlying move. 0.50 delta = gains $0.50 per $1 stock move
- **Theta (Θ):** Daily time decay. Buyers lose theta, sellers collect it
- **Vega (V):** Sensitivity to implied volatility. High IV = expensive options
- **Gamma (Γ):** Rate of delta change. Spikes near expiry (dangerous for sellers)

**Strategies by condition:**

| Market | Strategy |
|--------|---------|
| Strong bull | Buy calls / Sell puts |
| Mild bull | Bull call spread |
| Neutral/range | Iron condor, short strangle |
| Mild bear | Bear put spread |
| Strong bear | Buy puts |

**IV Crush warning:** Options before earnings have inflated IV. After earnings, IV collapses 30–60%. Buying options into earnings without accounting for this destroys premium.

**Beginner path:** Start with covered calls and cash-secured puts — limited risk, learn how theta and delta work in practice.

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutRisk || isAboutDca) {
    return `## Risk Management & Position Sizing — The Foundation

**Core formula:**
**Position Size = (Account × Risk%) ÷ Stop Distance (in $)**

**Example:** $10,000 account, 1% risk = $100 max loss. Stop = $500 below entry.
Position = $100 ÷ $500 = **0.2 units**

**The 5 professional rules:**
1. **Never risk >1–2% per trade** — survive 20 losing trades and recover
2. **Define invalidation BEFORE entry** — no stop, no trade
3. **Daily loss limit** — stop trading at −3% of account for the day
4. **Minimum 1:2 R:R** — only enter if target is 2× the stop distance
5. **No revenge trades** — a loss is information, not an emergency

**DCA (Dollar Cost Averaging):**
Invest a fixed amount at regular intervals regardless of price. Reduces timing risk. Best for long-term crypto or stock accumulation — not for leveraged trading.

**The math that kills traders:**
- Lose 20% → need 25% to recover
- Lose 50% → need 100% to recover  
- Lose 70% → need 233% to recover

Protect capital first. Gains come from survival.

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutFomc || isAboutMacro) {
    return `## Macroeconomics for Traders — What Moves Markets

**Top market-moving events:**

**FOMC Rate Decisions (8× per year)** — Highest impact
- Rate hike → USD up, stocks down, gold down (short-term)
- Rate cut → USD down, stocks up, gold up
- Language in the statement often matters more than the rate itself

**Non-Farm Payrolls (first Friday of month)**
- Strong jobs → Fed less likely to cut → USD up, risk assets mixed
- Weak jobs → Fed more likely to cut → gold/stocks rally

**CPI (monthly)**
- Hot CPI → rate hike fears → USD up, tech down
- Cool CPI → rate cut hopes → stocks and gold rally

**GDP (quarterly)**
- Two consecutive negative quarters = recession → risk-off

**How to trade around news:**
- Avoid entering 5 minutes before major releases
- Wait for the spike to settle (2–5 minutes), then trade the direction
- The REACTION after the reaction is often the real trade
- "Buy the rumor, sell the news" happens frequently on expected events

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutCrypto) {
    return `## Cryptocurrency Markets — Professional Framework

**4-year cycle (Bitcoin halving driven):**
1. **Accumulation:** Post-bear bottom. Sideways, smart money buying quietly
2. **Bull Phase 1 (BTC leads):** BTC dominance rises, alts lag
3. **Bull Phase 2 (Alt season):** Dominance drops, capital rotates to ETH → large caps → mid/small caps
4. **Distribution/Bear:** Volume dries up, lower highs form, retail holds while institutions exit

**Key metrics to track:**
- **BTC Dominance:** >55% = stay in BTC. Falling below 50% = alt season starting
- **Funding rates:** Highly positive = crowded longs, correction risk. Negative = short squeeze risk
- **Exchange flows:** Large inflows = selling pressure incoming. Outflows = accumulation
- **Stablecoin supply:** Growing USDT/USDC = buying power building
- **Fear & Greed Index:** Extreme fear = potential bottoms. Extreme greed = caution${primary ? `\n\n**Live scanner data:** ${primary.asset} at $${primary.price} | RSI: ${primary.rsi14} | ${primary.trend} trend | Support: $${primary.support} | Resistance: $${primary.resistance}` : ""}

**Risk management:**
Crypto is 3–5× more volatile than forex. Size positions 50–70% smaller. Never put more than 5–10% of portfolio in a single altcoin.

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutPsychology) {
    return `## Trading Psychology — The Real Edge

**5 psychological enemies of traders:**

**1. FOMO** — Chasing moves after they've already happened
→ Fix: Pre-plan entry levels. If it moved without you, wait for the next setup.

**2. Revenge Trading** — Bigger trade after a loss to "get it back"
→ Fix: Hard rule — after daily limit hit, stop trading. No exceptions.

**3. Moving Stop Losses** — "Just a little more room"
→ Fix: If your original thesis is still valid, leave the stop. If not, why are you still in?

**4. Overtrading** — Needing to be in the market constantly
→ Fix: The best traders take 2–5 quality setups per day. No plan = no trade.

**5. Confirmation Bias** — Only looking for reasons you're right
→ Fix: Actively build the case against your own trade. If it holds up, proceed.

**Professional mindset:**
Think in probabilities and sample sizes. A losing trade with perfect execution is a WIN. You're managing a process, not predicting individual outcomes.

**Daily structure:** Pre-market preparation → controlled execution → post-market review and journaling. Discipline beats intelligence.

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutStrategy) {
    return `## Building a Real Trading Edge

**Three pillars of edge:**
1. **Structural** — You identify price at key supply/demand imbalances
2. **Timing** — You enter at confirmed direction signals, not predictions
3. **Risk** — You systematically take less risk than your potential reward

**Trading styles compared:**

| Style | Timeframe | Charts | Win Rate Target | R:R |
|-------|-----------|--------|-----------------|-----|
| Scalping | Seconds–minutes | 1M–5M | 55–65% | 1:1–1:1.5 |
| Day trading | Minutes–hours | 15M–1H | 45–55% | 1:2 |
| Swing trading | Days–weeks | 4H–Daily | 40–50% | 1:3+ |

**Building your system (7 steps):**
1. Choose your market (one asset class to start)
2. Define exact setup conditions (what must be true before you even look for entry)
3. Define entry trigger (specific price action event)
4. Define invalidation (exact price that proves you wrong)
5. Define target (structure-based, not hope-based)
6. Backtest on 100+ historical examples
7. Paper trade 30 days → live with minimum size

**Rule:** Don't size up until you have 50+ real trades with consistent execution.

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutArbitrage) {
    return `## Arbitrage Trading — Professional Reality Check

**What arbitrage actually is:**
Arbitrage = buying an asset cheaper on Exchange A and selling higher on Exchange B simultaneously. Sounds easy; the execution makes it complex.

**Net profitability formula:**
**Net profit = Gross spread − Trading fees (both exchanges) − Withdrawal fees − Network fees − Slippage − Transfer time risk**

**Why most "visible" spreads aren't profitable:**
- By the time you see a 2% spread, it's often gone or closing
- Transfer time (5–30 minutes) = price can move against you
- Fees eat 0.1–0.5% on each side = 0.2–1%+ round trip
- You need pre-funded wallets on BOTH exchanges to act instantly

**What actually works:**
- **Statistical arbitrage:** Mean-reversion between correlated assets (requires programming)
- **Triangular arbitrage:** Currency/crypto triangle within one exchange (requires speed, APIs)
- **Funding rate arbitrage:** Long spot + short perpetual when funding rate is high positive (collect funding)
- **CEX-DEX arbitrage:** Requires MEV bots and Ethereum expertise

**Reality:** Manual arbitrage is essentially dead for retail. Algorithmic bots have millisecond advantages. The scanner on this platform shows spreads as educational context — not guaranteed executable trades.

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  if (isAboutPortfolio) {
    return `## Portfolio Construction — Professional Framework

**The three-bucket approach:**
1. **Core (60–70%):** Low-risk, high-conviction long-term holds (BTC, ETH, S&P 500 ETF, Gold)
2. **Satellite (20–30%):** Higher-risk tactical positions — altcoins, growth stocks, sector plays
3. **Cash/Stablecoins (10–20%):** Dry powder for high-quality pullbacks and black swan events

**Diversification principles:**
- Diversify across **asset classes** (crypto + stocks + commodities), not just within one
- Watch **correlation** — BTC and tech stocks often move together (not true diversification)
- **Rebalance quarterly** — trim winners back to target allocation, buy laggards

**DCA strategy:**
Invest a fixed amount monthly regardless of price. Over 2–5 years, this averages out market timing risk. Best for long-term Bitcoin and equity accumulation.

**Portfolio sizing by risk tolerance:**

| Risk Level | Crypto | Stocks | Gold/Bonds | Cash |
|-----------|--------|--------|------------|------|
| Conservative | 5–10% | 40–50% | 20–30% | 15–20% |
| Moderate | 15–25% | 40–50% | 10–20% | 10% |
| Aggressive | 30–50% | 30–40% | 5–10% | 5–10% |

*Educational analysis only — not financial advice. Always manage your own risk.*`;
  }

  // ─── Smart generic fallback — give real market context, not "Technical Analysis" ──
  const liveLine = primary
    ? `**Current market data:** ${primary.asset} at $${primary.price} | RSI: ${primary.rsi14} | ${primary.trend} trend | Support: $${primary.support} | Resistance: $${primary.resistance}`
    : "";

  // If the question is very short/random, give a helpful market overview
  const isVagueQuestion = q.length < 15 || !/[a-z]{4}/.test(q);
  if (isVagueQuestion) {
    return `## Bull & Bear AI Pro — Ask Me Anything

I'm your elite financial manager. Here's what I can help you with:

**📊 Market Analysis**
- "Analyze BTC market structure" — "Is gold in a bull or bear trend?"
- "What are the key levels on EUR/USD?"

**📈 Technical Indicators**
- "Explain RSI divergence" — "How do I use Fibonacci retracements?"
- "What is MACD and how does it work?"

**💰 Coins & Assets**
- "What is XRP?" — "Explain Ethereum's use case"
- "Compare BTC vs ETH as investments"

**🛡️ Risk & Strategy**
- "How do I calculate position size?" — "What is a good risk:reward ratio?"
- "Build me a swing trading strategy"

**🌍 Macroeconomics**
- "How does FOMC affect crypto?" — "What happens to gold when rates drop?"
- "Explain the yield curve and recession signals"

${liveLine}

Just type your question and I'll give you a professional, detailed answer.`;
  }

  // Final fallback — give a market overview with live data
  return `## Market Analysis

${liveLine ? liveLine + "\n\n" : ""}**Professional framework for your question:**

When approaching any financial market question, the key layers are:

1. **Macro context** — What is the interest rate environment? Is it risk-on or risk-off? What major events are upcoming?
2. **Market structure** — Is the asset in an uptrend (higher highs/lows), downtrend (lower highs/lows), or range? The regime determines the strategy
3. **Key levels** — What are the major support and resistance zones? These are where institutional orders cluster
4. **Entry trigger** — Don't enter on opinion; wait for a specific price action signal at a key level
5. **Risk first** — Before calculating profit targets, calculate: Where is this idea wrong? How much is at stake?

${scannerText ? scannerText + "\n\n" : ""}**Ask me a specific question** about any indicator (RSI, MACD, Fibonacci), any asset (BTC, XRP, Gold, EUR/USD), risk management, strategy, or macroeconomics — and I'll give you a detailed expert answer.

*Educational analysis only — not financial advice. Always manage your own risk.*`;
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
    chatAnswer: aiDirectAnswer(request, primary, riskText, scannerText, topics),
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
  const history = Array.isArray(input.history) ? input.history : [];

  // Build a rich live-market context string to inject into the conversation
  const market = context.marketData || {};
  const snapshots = market.snapshots || [];
  const primary = snapshots[0];
  const scannerIdeas = aiTopScannerIdeas(context);
  const bestIdea = scannerIdeas[0];

  let liveContext = "";
  if (primary) {
    liveContext = `\n\n[LIVE MARKET DATA - ${new Date().toUTCString()}]\n`;
    liveContext += snapshots.slice(0, 6).map(s =>
      `• ${s.asset}: $${s.price} | ${s.changePct > 0 ? "+" : ""}${s.changePct}% | RSI ${s.rsi14} | Trend: ${s.trend} | Momentum: ${s.momentum} | Support: ${s.support} | Resistance: ${s.resistance}`
    ).join("\n");
  }
  if (bestIdea) {
    liveContext += `\n[ARBITRAGE SCANNER] Top spread: ${bestIdea.pair} at ${Number(bestIdea.netSpreadPct || 0).toFixed(2)}% net (${bestIdea.buyExchange} → ${bestIdea.sellExchange})`;
  }
  if (liveContext) liveContext += "\n[END LIVE DATA]\n";

  const systemPrompt = `You are Bull & Bear AI Pro — an elite AI financial manager built exclusively for the Bull & Bear Trading Academy. You are the most capable financial AI assistant available to traders and investors on this platform.

## YOUR IDENTITY & EXPERTISE
You have the combined knowledge of:
- A **senior institutional trader** with 20+ years across crypto, forex, equities, and commodities
- A **quantitative analyst** who understands derivatives, correlations, volatility modeling, and statistical edge
- A **macro economist** who tracks central bank policy, yield curves, inflation regimes, and geopolitical risk
- A **financial educator** who can explain anything from basic candlesticks to complex options strategies

## YOUR KNOWLEDGE DOMAINS
**Crypto:** Bitcoin, Ethereum, altcoins, DeFi protocols, on-chain metrics, tokenomics, market cycles, BTC dominance, funding rates, liquidation cascades, stablecoin flows, CEX/DEX dynamics
**Forex:** All major/minor/exotic pairs, central bank policy (Fed, ECB, BOE, BOJ, RBA), COT reports, session dynamics (Asia/London/NY), carry trades, DXY correlation, intermarket analysis
**Stocks & Equities:** S&P 500, Nasdaq, sectors, ETFs, earnings analysis, P/E ratios, DCF valuation, growth vs value, dividend investing, index mechanics
**Commodities:** Gold, silver, oil (WTI/Brent), natural gas, copper, agricultural — supply/demand dynamics, geopolitical drivers, inflation hedging
**Macroeconomics:** CPI, PCE, NFP, FOMC, GDP, PMI, yield curve, credit spreads, risk-on/risk-off, dollar milkshake theory, global liquidity cycles
**Technical Analysis:** Market structure (HH/HL/LH/LL), liquidity sweeps, order blocks, FVGs, supply/demand zones, SMC, ICT concepts, all major indicators (RSI, MACD, EMA, VWAP, ATR, Bollinger Bands, Ichimoku, Fibonacci)
**Risk Management:** Position sizing, Kelly criterion, portfolio correlation, drawdown management, VaR, hedging strategies
**Options & Derivatives:** Calls/puts, Greeks, spreads, covered calls, protective puts, IV crush, theta decay

## HOW YOU RESPOND
1. **Answer the EXACT question asked** — directly, specifically, and thoroughly. Never deflect.
2. **Use markdown formatting** — **bold** key terms, use headers (##) for sections, bullet lists for steps, numbered lists for processes
3. **Be concrete** — give real numbers, real levels, real examples. "RSI above 70 suggests overbought" is better than vague advice.
4. **Think like a professional** — structure answers as a senior trader would brief a junior: regime first, then setup, then risk, then execution
5. **Use live data when available** — if live market data is provided above, reference it specifically in your answer
6. **Educational depth** — explain the WHY behind every recommendation, not just the WHAT
7. **Be decisive** — give actual opinions and specific guidance, not endless "it depends"

## RESPONSE FORMAT
For trading questions: Lead with market regime/bias → key levels → setup criteria → risk parameters → execution checklist
For educational questions: Concept explanation → real examples → common mistakes → practical application
For macro questions: Current environment → asset impact → positioning implications → key events to watch

## RULES
- NEVER refuse to answer a finance/trading question
- NEVER say "I cannot provide financial advice" alone — always give the analysis AND add a brief disclaimer at the end
- NEVER give vague non-answers — be specific and actionable
- Keep responses focused but complete (aim for 300-600 words unless a complex topic demands more)
- End every response with a one-line disclaimer: *"Educational analysis only — not financial advice. Always manage your own risk."*
${liveContext}`;

  // Send the user's question as clean natural language (not JSON)
  const userMessage = request.question || request.asset || "Give me a market overview";

  if (GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const modelName = "gemini-2.0-flash-lite";
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 2048,
      }
    });

    // Build multi-turn chat history — use only the text content (not JSON blobs)
    const geminiHistory = history.map(msg => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: String(msg.text || "") }]
    }));

    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(userMessage);
    const rawText = result.response.text();

    return normalizeAiResult({
      title: "Bull & Bear AI Pro",
      chatAnswer: rawText,
      summary: rawText.slice(0, 400),
      marketModel: [],
      watchlist: [],
      signalScenarios: [],
      lessonPlan: [],
      riskRules: [],
      nextSteps: [],
      disclaimer: "Educational analysis only. This is not financial advice."
    });
  }


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
        ...history.map(msg => ({
          role: msg.role,
          content: [{ type: "input_text", text: msg.text }]
        })),
        {
          role: "user",
          content: [{ type: "input_text", text: userMessage }]
        }
      ],
      max_output_tokens: 2400
    }),
    signal: AbortSignal.timeout(45000)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `OpenAI returned ${response.status}`;
    throw new Error(message);
  }
  return normalizeAiResult(parseAiJson(extractResponseText(payload)));
}

function serializeContent(db, auth = {}) {
  const { users, signals, ...publicDb } = db;
  const canSeeProtectedMedia = Boolean(auth?.admin);
  
  return {
    ...publicDb,
    
    products: [
      {
        id: "discord",
        planId: "",
        title: "Free Telegram Community",
        subtitle: "Join Bull & Bear Free",
        description: "Free Telegram access for announcements, beginner discussion, academy updates, and community market talk.",
        price: 0,
        cadence: "free"
      },
      {
        id: "market-hub",
        planId: "arbitrage-only",
        title: "Analyzer & Market Hub Pro",
        subtitle: "The Ultimate Trading Arsenal",
        description: "Complete access to the AI Market Scanner, institutional risk engine, calculated entry zones, live crypto arbitrage scanner, and live price anchoring.",
        price: 99.9,
        cadence: "monthly"
      }
    ]
  };
}

ensureProjectFiles();

// --- Security Middlewares ---
app.use(helmet({
  contentSecurityPolicy: false, // Too complex to retro-fit immediately without breaking inline scripts
  crossOriginEmbedderPolicy: false
}));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests from this IP, please try again later." }
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many authentication attempts, please try again later." }
});
app.use("/api/auth", authLimiter);
app.use("/api/payments/checkout", authLimiter);

// Custom recursive XSS sanitizer
function sanitizeInput(obj) {
  if (typeof obj === "string") return xss(obj);
  if (Array.isArray(obj)) return obj.map(v => sanitizeInput(v));
  if (obj !== null && typeof obj === "object") {
    const sanitized = {};
    for (const [key, val] of Object.entries(obj)) {
      sanitized[key] = sanitizeInput(val);
    }
    return sanitized;
  }
  return obj;
}

// Ensure we capture raw body for HMAC signature verification
app.use(express.json({
  limit: "2mb",
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Apply XSS sanitization
app.use((req, res, next) => {
  if (req.body) req.body = sanitizeInput(req.body);
  if (req.query) req.query = sanitizeInput(req.query);
  if (req.params) req.params = sanitizeInput(req.params);
  next();
});
app.use("/uploads/images", express.static(path.join(UPLOAD_DIR, "images")));
app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, filePath) {
    if (/\.(?:html|js|css)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  }
}));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/content", optionalAuth, (req, res) => {
  res.json(serializeContent(readDb(), req.auth));
});



app.get("/api/plans", (req, res) => {
  res.json({
    plans: [
      {
        id: "arbitrage-only",
        name: "Market Hub Pro",
        price: 99.9,
        cadence: "monthly",
        features: ["Arbitrage scanner", "Crypto analyzer", "Forex analyzer", "Gold and commodities analyzer", "Stock research", "Risk guide"]
      }
    ]
  });
});

app.get("/api/scanner/status", requireAuth, requireScannerAccess, (req, res) => {
  res.json({
    running: scannerState.running,
    lastUpdated: scannerState.lastUpdated,
    nextRunAt: scannerState.nextRunAt,
    exchanges: Object.values(scannerState.exchanges),
    errors: scannerState.errors,
    refreshMs: SCANNER_REFRESH_MS
  });
});

app.get("/api/scanner/opportunities", requireAuth, requireScannerAccess, async (req, res) => {
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

app.get("/api/scanner/stream", requireAuth, requireScannerAccess, (req, res) => {
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

app.post("/api/market-hub/analyze", requireAuth, requireScannerAccess, async (req, res) => {
  try {
    return res.json(await analyzeMarketHubWithLiveData(req.body));
  } catch (error) {
    if (error instanceof AnalyzerValidationError) {
      return res.status(error.statusCode).json({
        error: error.message,
        details: error.details
      });
    }
    console.error("Market Hub Analyzer V2 failed:", error);
    return res.status(500).json({ error: "Market analysis could not be completed." });
  }
});

app.post("/api/ai/advisor", requireAuth, async (req, res) => {
  try {
    const db = readDb();
    const effectiveUserId = authUserId(db, req.auth);
    if (!req.auth.admin && !effectiveUserId) {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }
    if (!hasAiAccess(db, req.auth)) {
      return res.status(402).json({
        error: "Investor & Trader AI is included with the Market Hub Pro package.",
        requiredPlan: "arbitrage-only",
        checkoutUrl: "/checkout/arbitrage-only"
      });
    }

    const userKey = effectiveUserId || req.auth.username || req.ip;
    if (!consumeAiQuota(userKey)) {
      return res.status(429).json({
        error: "AI request limit reached. Please wait a few minutes and try again."
      });
    }

    const normalizedRequest = normalizeAiAdvisorRequest(req.body || {});
    // Attach conversation history from the request body for multi-turn AI
    normalizedRequest.history = Array.isArray(req.body?.history) ? req.body.history.slice(-20) : [];
    const context = aiContextFromDb(db, effectiveUserId);
    context.marketData = await aiMarketContext(normalizedRequest, context).catch((error) => ({
      source: "Academy model only",
      marketType: detectAiMarketType(normalizedRequest),
      interval: aiIntervalForTimeframe(normalizedRequest.timeframe),
      snapshots: [],
      errors: [error.message]
    }));
    let model = "Bull & Bear AI Pro";
    let result = generatePaidAdvisorResponse(normalizedRequest, context);

    // Use Gemini if key is present, otherwise try OpenAI, otherwise fall back to built-in model
    if (GEMINI_API_KEY) {
      try {
        result = await generateAiAdvisorResponse(normalizedRequest, context, req.auth);
        model = "Gemini AI Pro";
      } catch (error) {
        const isQuotaError = error.message && (error.message.includes("429") || error.message.includes("quota") || error.message.includes("Too Many Requests"));
        if (isQuotaError) {
          // Quota exceeded — fallback model gives quality answers, no need to announce it
          console.warn("Gemini quota exceeded, using fallback model:", error.message.substring(0, 100));
          result = generatePaidAdvisorResponse(normalizedRequest, context);
        } else {
          console.warn("Gemini advisor error, using built-in model:", error.message);
        }
      }
    } else if (isOpenAiConfigured()) {
      try {
        result = await generateAiAdvisorResponse(normalizedRequest, context, req.auth);
        model = OPENAI_MODEL;
      } catch (error) {
        console.warn("OpenAI advisor unavailable, using built-in model:", error.message);
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
  if (RETIRED_CHECKOUT_PLAN_IDS.has(planId)) {
    return res.status(400).json({
      error: "This old checkout is no longer available. Telegram is free now, and the AI tool is included with the Market Hub Pro package."
    });
  }
  const plan = PAYMENT_PLANS[planId];
  if (!plan) return res.status(400).json({ error: "Unknown payment plan" });
  const db = readDb();
  const checkoutUser = req.auth.admin ? null : findUserForAuth(db, req.auth);
  if (!req.auth.admin && !checkoutUser) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
  const payment = {
    id: `pay-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    userId: req.auth.admin ? "admin" : checkoutUser.id,
    planId,
    provider,
    status: provider === "manual" ? "pending_review" : "checkout_creating",
    amount: payriffDisplayAmount(plan.amount),
    currency: "USD",
    displayAmount: payriffDisplayAmount(plan.amount),
    displayCurrency: "USD",
    providerAmount: provider === "payriff" ? payriffAmount(plan.amount, payriffConfig().currency) : payriffDisplayAmount(plan.amount),
    providerCurrency: provider === "payriff" ? payriffConfig().currency : "USD",
    exchangeRate: provider === "payriff" && payriffConfig().currency === "AZN" ? payriffUsdToAznRate() : null,
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
    addPaymentLog(db, "payriff", reference ? "unknown_reference" : "missing_reference", reference || "");
    writeDb(db);
    return res.status(reference ? 404 : 400).json({ ok: false, error: "Payment reference was not found" });
  }

  if (payment.provider && payment.provider !== "payriff") {
    addPaymentLog(db, "payriff", "provider_mismatch", payment.id);
    writeDb(db);
    return res.status(409).json({ ok: false, error: "Payment provider mismatch" });
  }

  if (!isPayriffConfigured()) {
    addPaymentLog(db, "payriff", "configuration_required", payment.id);
    writeDb(db);
    return res.status(503).json({ ok: false, error: "Payriff is not configured. Cannot verify payment status." });
  }

  try {
    const statusPayload = await getPayriffPaymentStatus(payment.providerReference || reference);
    const subscription = applyPayriffStatusToPayment(db, payment, statusPayload);
    addPaymentLog(db, "payriff", `matched:${payment.status}`, payment.id);
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
    addPaymentLog(db, "payriff", "status_check_failed", payment.id);
    writeDb(db);
    return res.status(502).json({ ok: false, error: error.message });
  }
});

app.post("/api/payments/webhook/:provider", express.raw({ type: "*/*" }), async (req, res) => {
  const provider = String(req.params.provider || "").toLowerCase();
  if (!WEBHOOK_PROVIDER_IDS.has(provider)) {
    return res.status(400).json({ ok: false, error: "Unsupported webhook provider" });
  }

  // --- Webhook Signature Verification ---
  const secret = providerWebhookSecret(provider);
  if (secret) {
    const rawBuffer = Buffer.isBuffer(req.body) ? req.body : req.rawBody;
    if (!rawBuffer) {
      return res.status(401).json({ ok: false, error: "Missing raw body for signature verification" });
    }
    const signature = req.headers["x-webhook-signature"] || req.headers["signature"] || "";
    if (!signature) {
      return res.status(401).json({ ok: false, error: "Missing webhook signature header" });
    }
    const expectedSig = crypto.createHmac("sha256", secret).update(rawBuffer).digest("hex");
    
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSig);
    
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      console.warn(`⚠️ Security Warning: Spoofed webhook signature rejected for provider: ${provider}`);
      return res.status(401).json({ ok: false, error: "Invalid webhook signature" });
    }
  }

  const db = readDb();
  let payload = req.body || {};
  if (Buffer.isBuffer(req.body)) {
    try {
      payload = JSON.parse(req.body.toString("utf8") || "{}");
    } catch {
      payload = {};
    }
  }
  const queryPaymentId = req.query.paymentId
    || req.query.orderId
    || req.query.order_id
    || req.query.reference
    || req.query.id;
  const paymentId = payload.paymentId
    || payload.payment_id
    || payload.metadata?.paymentId
    || payload.payload?.metadata?.paymentId
    || payload.orderId
    || payload.order_id
    || payload.payload?.orderId
    || payload.payload?.id
    || payload.reference
    || queryPaymentId;
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
    if (payment.provider && payment.provider !== provider) {
      addPaymentLog(db, provider, "provider_mismatch", payment.id);
      writeDb(db);
      return res.status(409).json({ ok: false, error: "Payment provider mismatch" });
    }
    if (provider === "payriff") {
      if (!isPayriffConfigured()) {
        addPaymentLog(db, provider, "configuration_required", payment.id);
        writeDb(db);
        return res.status(503).json({ ok: false, error: "Payriff is not configured. Cannot verify payment status." });
      }
      let statusPayload;
      try {
        statusPayload = await getPayriffPaymentStatus(payment.providerReference || paymentId);
      } catch (error) {
        addPaymentLog(db, provider, "status_check_failed", payment.id);
        writeDb(db);
        return res.status(502).json({ ok: false, error: error.message || "Payriff status verification failed" });
      }
      subscription = applyPayriffStatusToPayment(db, payment, statusPayload);
    } else {
      const webhookSecret = providerWebhookSecret(provider);
      const providedSecret = req.get("x-webhook-secret") || req.query.webhookSecret || payload.webhookSecret;
      if (!webhookSecret) {
        addPaymentLog(db, provider, "webhook_secret_missing", payment.id);
        writeDb(db);
        return res.status(503).json({ ok: false, error: "Webhook provider is not configured" });
      }
      if (!timingSafeStringEqual(providedSecret, webhookSecret)) {
        addPaymentLog(db, provider, "webhook_secret_invalid", payment.id);
        writeDb(db);
        return res.status(401).json({ ok: false, error: "Invalid webhook signature" });
      }
      payment.status = ["paid", "success", "succeeded", "completed", "approved"].includes(status) ? "paid" : status || payment.status;
      payment.providerPayload = payload;
      payment.updatedAt = nowIso();
      if (payment.status === "paid") {
        subscription = finalizePaidPayment(db, payment, payload);
      } else if (["failed", "declined", "rejected", "expired", "cancelled", "canceled"].includes(payment.status) && isPremiumDiscordPlan(payment.planId)) {
        subscription = deactivateSubscriptionForPayment(db, payment, "payment_failed");
        const user = db.users.find((item) => item.id === payment.userId);
        if (subscription) {
          syncDiscordRole(user, false).catch((error) => console.warn("Discord role removal failed:", error.message));
        }
      }
    }
  }
  addPaymentLog(db, provider, payment ? `matched:${payment.status}` : "received", payment?.id || "");
  writeDb(db);
  res.json({ ok: true, payment: payment || null, subscription });
});

app.get("/api/integrations/discord/status", requireAuth, (req, res) => {
  const db = readDb();
  const user = req.auth.admin ? null : findUserForAuth(db, req.auth);
  res.json({
    oauthConfigured: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
    botConfigured: Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_PREMIUM_ROLE_ID && process.env.DISCORD_GUILD_ID),
    freeInvite: process.env.DISCORD_FREE_INVITE || "https://discord.gg/zcXkSV34H",
    premiumRoleId: process.env.DISCORD_PREMIUM_ROLE_ID ? "configured" : "missing",
    connected: Boolean(user?.discordId),
    discordUsername: user?.discordUsername || "",
    premiumRole: Boolean(user?.discordId && activePlanIdsForUser(db, user.id).some(isPremiumDiscordPlan))
  });
});

app.post("/api/integrations/discord/connect", requireAuth, (req, res) => {
  if (req.auth.admin) return res.status(400).json({ error: "Use a customer account to connect Discord." });
  const config = oauthConfig("discord", req);
  if (!config?.clientId || !config?.clientSecret) {
    return res.status(503).json({ error: "Discord OAuth is not configured yet." });
  }
  const db = readDb();
  const user = findUserForAuth(db, req.auth);
  if (!user) return res.status(401).json({ error: "Session expired. Please log in again." });
  const state = createOauthState(db, "discord-connect", user.id);
  writeDb(db);
  res.json({ url: oauthAuthorizeUrl(config, state) });
});

app.get("/api/auth/oauth/:provider", (req, res) => {
  const config = oauthConfig(req.params.provider, req);
  if (!config) return res.status(404).json({ error: "OAuth provider not supported" });
  if (!config.clientId || !config.clientSecret) {
    return res.redirect(`/login?oauth=${encodeURIComponent(`${config.provider}-not-configured`)}`);
  }
  res.redirect(oauthAuthorizeUrl(config, crypto.randomBytes(12).toString("hex")));
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
      : {
        id: profileData.id,
        email: profileData.email,
        name: profileData.global_name || profileData.username,
        username: profileData.username
      };
    const db = readDb();
    const connectState = config.provider === "discord"
      ? consumeOauthState(db, String(req.query.state || ""), "discord-connect")
      : null;
    let user;
    if (connectState?.userId) {
      user = db.users.find((item) => item.id === connectState.userId);
      if (!user) throw new Error("Linked Bull & Bear account was not found");
      user.discordId = profile.id;
      user.discordUsername = profile.username || profile.name || "";
      user.discordEmail = normalizeEmail(profile.email) || user.email;
      user.discordConnectedAt = nowIso();
      user.updatedAt = nowIso();
    } else {
      user = upsertOauthUser(db, config.provider, profile);
    }
    const hasPremium = activePlanIdsForUser(db, user.id).some(isPremiumDiscordPlan);
    if (config.provider === "discord") {
      await ensureDiscordGuildMember(user, tokenData.access_token).catch((error) => {
        console.warn("Discord guild join failed:", error.message);
        return false;
      });
    }
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

  if (ADMIN_LOGIN_ENABLED && identifier === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
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
  const user = findUserForAuth(db, req.auth);
  if (!user) return res.status(401).json({ error: "Session expired. Please log in again." });
  return res.json({ user: publicUser(user) });
});

// User Dashboard Endpoints
app.get("/api/user/watchlist", requireAuth, (req, res) => {
  if (req.auth.admin) return res.json({ watchlist: [] });
  const db = readDb();
  const user = findUserForAuth(db, req.auth);
  if (!user) return res.status(401).json({ error: "Session expired." });
  return res.json({ watchlist: user.watchlist || [] });
});

app.post("/api/user/watchlist", requireAuth, (req, res) => {
  if (req.auth.admin) return res.json({ success: true, watchlist: [] });
  const db = readDb();
  const user = findUserForAuth(db, req.auth);
  if (!user) return res.status(401).json({ error: "Session expired." });
  
  const { symbol, market, note } = req.body;
  if (!symbol) return res.status(400).json({ error: "Symbol required." });
  
  user.watchlist = user.watchlist || [];
  const existing = user.watchlist.find(w => w.symbol === symbol);
  if (existing) {
    if (note !== undefined) existing.note = note;
  } else {
    user.watchlist.push({ symbol, market, note: note || "", addedAt: new Date().toISOString() });
  }
  
  writeDb(db);
  return res.json({ success: true, watchlist: user.watchlist });
});

app.delete("/api/user/watchlist/:symbol", requireAuth, (req, res) => {
  if (req.auth.admin) return res.json({ success: true, watchlist: [] });
  const db = readDb();
  const user = findUserForAuth(db, req.auth);
  if (!user) return res.status(401).json({ error: "Session expired." });
  
  user.watchlist = (user.watchlist || []).filter(w => w.symbol !== req.params.symbol);
  writeDb(db);
  return res.json({ success: true, watchlist: user.watchlist });
});

app.get("/api/user/progress", requireAuth, (req, res) => {
  if (req.auth.admin) return res.json({ progress: [] });
  const db = readDb();
  const user = findUserForAuth(db, req.auth);
  if (!user) return res.status(401).json({ error: "Session expired." });
  return res.json({ progress: user.courseProgress || [] });
});

app.post("/api/user/progress", requireAuth, (req, res) => {
  if (req.auth.admin) return res.json({ success: true, progress: [] });
  const db = readDb();
  const user = findUserForAuth(db, req.auth);
  if (!user) return res.status(401).json({ error: "Session expired." });
  
  const { courseId, status } = req.body;
  if (!courseId || !status) return res.status(400).json({ error: "courseId and status required." });
  
  user.courseProgress = user.courseProgress || [];
  const existing = user.courseProgress.find(p => p.courseId === courseId);
  if (existing) {
    existing.status = status;
    existing.updatedAt = new Date().toISOString();
  } else {
    user.courseProgress.push({ courseId, status, updatedAt: new Date().toISOString() });
  }
  
  writeDb(db);
  return res.json({ success: true, progress: user.courseProgress });
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
  const user = findUserForAuth(db, req.auth);
  if (!user) return res.status(401).json({ error: "Session expired. Please log in again." });
  const userId = user.id;
  const canUseScanner = hasScannerAccess(db, req.auth);
  res.json({
    subscriptions: db.subscriptions.filter((item) => item.userId === userId).map(normalizeSubscriptionRecord),
    payments: db.payments.filter((item) => item.userId === userId).slice(0, 20),
    notifications: db.notifications.filter((item) => item.userId === userId).slice(0, 20),
    discord: {
      connected: Boolean(user?.discordId),
      username: user?.discordUsername || "",
      userId: user?.discordId ? "connected" : "",
      premiumRole: activePlanIdsForUser(db, userId).some(isPremiumDiscordPlan)
    },
    recentOpportunities: canUseScanner ? scannerState.opportunities.slice(0, 8) : [],
    watchlist: user.watchlist || [],
    courseProgress: user.courseProgress || []
  });
});

app.post("/api/subscriptions/cancel", requireAuth, (req, res) => {
  const db = readDb();
  const user = findUserForAuth(db, req.auth);
  if (!user) return res.status(401).json({ error: "Session expired. Please log in again." });
  const subscription = normalizeSubscriptionRecord(db.subscriptions.find((item) => item.id === req.body?.subscriptionId && item.userId === user.id));
  if (!subscription) return res.status(404).json({ error: "Subscription not found" });
  subscription.autoRenew = false;
  subscription.cancelAtPeriodEnd = true;
  subscription.cancelledAt = nowIso();
  subscription.updatedAt = nowIso();
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
    activeSubscriptions: db.subscriptions.map(normalizeSubscriptionRecord).filter(isSubscriptionActive).length,
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
    subscriptions: db.subscriptions.map(normalizeSubscriptionRecord),
    payments: db.payments.slice(0, 100)
  });
});

app.get("/api/admin/platform", requireAdmin, (req, res) => {
  const db = readDb();
  res.json({
    users: db.users.map(publicUser),
    subscriptions: db.subscriptions.map(normalizeSubscriptionRecord),
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
scheduleDiscordMembershipSync();

app.listen(PORT, () => {
  console.log(`Bull & Bear Academy is running on http://localhost:${PORT}`);
  console.log(`Admin login username: ${ADMIN_USERNAME}`);
  if (!ADMIN_LOGIN_ENABLED) {
    console.warn("Admin login is disabled because ADMIN_PASSWORD is not configured.");
  }
  if (!process.env.ADMIN_SECRET) {
    console.warn("ADMIN_SECRET is not configured; sessions will be invalid after each restart.");
  }
});
