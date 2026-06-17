const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data", "db.json");
const PAYMENT_PLANS = {
  "education-bundle": { name: "Courses + Trading Book", amount: 49.9, cadence: "one-time", accessDays: 3650 },
  "premium-discord-signals": { name: "AI + Premium Discord Signals", amount: 49.9, cadence: "monthly", accessDays: 30 },
  "investor-trader-ai": { name: "Investor & Trader AI", amount: 19.9, cadence: "monthly", accessDays: 30 },
  "arbitrage-only": { name: "Arbitrage Scanner Only", amount: 39.9, cadence: "monthly", accessDays: 30 }
};
const PAYRIFF_USD_TO_AZN_RATE = Number(process.env.PAYRIFF_USD_TO_AZN_RATE || 1.7);

function nowIso() {
  return new Date().toISOString();
}

function readDb() {
  const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  db.users = Array.isArray(db.users) ? db.users : [];
  db.payments = Array.isArray(db.payments) ? db.payments : [];
  db.paymentLogs = Array.isArray(db.paymentLogs) ? db.paymentLogs : [];
  db.subscriptions = Array.isArray(db.subscriptions) ? db.subscriptions : [];
  db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
  return db;
}

function writeDb(db) {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(db, null, 2)}\n`);
  fs.renameSync(tmp, DATA_FILE);
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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function findUserForAuth(db, auth = {}) {
  if (!auth || auth.admin) return null;
  const email = normalizeEmail(auth.email);
  return db.users.find((item) => item.id === auth.userId)
    || (email ? db.users.find((item) => normalizeEmail(item.email) === email) : null)
    || null;
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

function paidUntilTime(subscription) {
  const value = subscription?.paid_until || subscription?.paidUntil || subscription?.expiresAt || "";
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function findActiveSubscription(db, userId, planId) {
  return db.subscriptions
    .map(normalizeSubscriptionRecord)
    .find((item) => item.userId === userId && item.planId === planId && item.status === "active");
}

function isPremiumDiscordPlan(planId) {
  return planId === "premium-discord-signals";
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

function requestBaseUrl(req) {
  const appUrl = String(process.env.APP_URL || "").replace(/\/+$/, "");
  return appUrl || `${req.protocol}://${req.get("host")}`;
}

function payriffConfig() {
  return {
    baseUrl: String(process.env.PAYRIFF_BASE_URL || "https://api.payriff.com").replace(/\/+$/, ""),
    secretKey: process.env.PAYRIFF_SECRET_KEY,
    createPath: process.env.PAYRIFF_CREATE_PATH || "/api/v3/orders",
    orderPath: process.env.PAYRIFF_ORDER_PATH || "/api/v3/orders/:orderId",
    currency: String(process.env.PAYRIFF_CURRENCY || "AZN").trim().toUpperCase() || "AZN",
    language: process.env.PAYRIFF_LANGUAGE || "EN"
  };
}

function isPayriffConfigured() {
  const config = payriffConfig();
  return Boolean(config.baseUrl && config.secretKey);
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
    for (const key of ["url", "redirectUrl", "redirect_url", "paymentUrl", "payment_url", "checkoutUrl", "checkout_url", "link", "href"]) {
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

function payriffMessage(payload = {}, fallback = "Payriff request failed") {
  return payload?.message
    || payload?.error
    || payload?.payload?.message
    || payload?.payload?.error
    || fallback;
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

function isPayriffPaid(payload = {}) {
  return ["PAID", "APPROVED", "COMPLETED", "SUCCESS", "SUCCEEDED"].includes(payriffStatus(payload));
}

function activateSubscription(db, payment) {
  const plan = PAYMENT_PLANS[payment.planId] || PAYMENT_PLANS["arbitrage-only"];
  const now = Date.now();
  let subscription = findActiveSubscription(db, payment.userId, payment.planId);
  const baseTime = subscription && plan.cadence === "monthly"
    ? Math.max(now, paidUntilTime(subscription))
    : now;
  const paidUntil = new Date(baseTime + (plan.accessDays || 30) * 24 * 60 * 60 * 1000).toISOString();
  if (subscription) {
    subscription.status = "active";
    subscription.paid_until = paidUntil;
    subscription.paidUntil = paidUntil;
    subscription.expiresAt = paidUntil;
    subscription.autoRenew = plan.cadence === "monthly";
    subscription.paymentId = payment.id;
    subscription.paymentStatus = "paid";
    subscription.updatedAt = nowIso();
    return subscription;
  }
  subscription = {
    id: `sub-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    userId: payment.userId,
    planId: payment.planId,
    status: "active",
    autoRenew: plan.cadence === "monthly",
    currentPeriodStart: nowIso(),
    paid_until: paidUntil,
    paidUntil,
    expiresAt: paidUntil,
    paymentId: payment.id,
    paymentStatus: "paid",
    createdAt: nowIso()
  };
  db.subscriptions.unshift(subscription);
  return subscription;
}

function finalizePaidPayment(db, payment, payload = {}) {
  const wasPaid = payment.status === "paid";
  payment.status = "paid";
  payment.providerPayload = payload;
  payment.paidAt = payment.paidAt || nowIso();
  payment.updatedAt = nowIso();
  const subscription = activateSubscription(db, payment);
  if (!wasPaid && !db.notifications.some((item) => item.paymentId === payment.id && item.type === "subscription")) {
    const plan = PAYMENT_PLANS[payment.planId] || { name: payment.planId };
    const body = payment.planId === "education-bundle"
      ? "Your Courses + Trading Book access is active. Open your dashboard or Courses page to enter the private Telegram course channel."
      : `Your ${plan.name} access is active.`;
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
  if (!wasPaid && isPremiumDiscordPlan(payment.planId)) {
    const user = db.users.find((item) => item.id === payment.userId);
    syncDiscordRole(user, true).catch((error) => console.warn("Discord role sync failed:", error.message));
  }
  return subscription;
}

function applyPayriffStatusToPayment(db, payment, payload = {}) {
  if (isPayriffPaid(payload)) return finalizePaidPayment(db, payment, payload);
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

async function callPayriff(method, pathname, body = null) {
  const config = payriffConfig();
  if (!isPayriffConfigured()) {
    throw new Error("Payriff is not configured. Add PAYRIFF_SECRET_KEY in Render environment variables.");
  }
  const response = await fetch(`${config.baseUrl}${pathname}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      Authorization: config.secretKey
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) throw new Error(payriffMessage(payload, `Payriff returned ${response.status}`));
  if (payload?.code && !["00000", "0", "success", "SUCCESS"].includes(String(payload.code))) {
    throw new Error(payriffMessage(payload));
  }
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
  return payment;
}

async function settlePayriffPayment(req, payment, fallbackPayload = {}) {
  if (!isPayriffConfigured()) {
    throw new Error("Payriff is not configured. Cannot verify payment status.");
  }
  const fallbackReference = fallbackPayload.paymentId
    || fallbackPayload.payment_id
    || fallbackPayload.orderId
    || fallbackPayload.order_id
    || fallbackPayload.reference
    || req.query.paymentId
    || req.query.orderId
    || req.query.order_id
    || req.query.reference
    || req.query.id;
  return getPayriffPaymentStatus(payment.providerReference || fallbackReference);
}

function installRoutes(app, express) {
  if (app.__bbPayriffPatchRoutes) return;
  app.__bbPayriffPatchRoutes = true;

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
      return res.redirect(`/payment/failed?reason=${encodeURIComponent("Payment reference was not found")}`);
    }
    if (payment.provider && payment.provider !== "payriff") {
      addPaymentLog(db, "payriff", "provider_mismatch", payment.id);
      writeDb(db);
      return res.status(409).json({ ok: false, error: "Payment provider mismatch" });
    }
    try {
      const statusPayload = await settlePayriffPayment(req, payment, req.query);
      const subscription = applyPayriffStatusToPayment(db, payment, statusPayload);
      addPaymentLog(db, "payriff", `matched:${payment.status}`, payment.id);
      writeDb(db);
      const destination = payment.status === "failed" ? "failed" : "success";
      if (req.accepts("html")) return res.redirect(`/payment/${destination}?paymentId=${encodeURIComponent(payment.id)}`);
      return res.json({ ok: true, payment, subscription });
    } catch (error) {
      payment.status = payment.status === "paid" ? "paid" : "status_check_failed";
      payment.error = error.message;
      payment.updatedAt = nowIso();
      addPaymentLog(db, "payriff", "status_check_failed", payment.id);
      writeDb(db);
      return res.status(isPayriffConfigured() ? 502 : 503).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/payments/webhook/payriff", express.raw({ type: "*/*" }), async (req, res) => {
    const db = readDb();
    let payload = req.body || {};
    if (Buffer.isBuffer(payload)) {
      try {
        payload = JSON.parse(payload.toString("utf8") || "{}");
      } catch {
        payload = {};
      }
    }
    const reference = payload.paymentId
      || payload.payment_id
      || payload.metadata?.paymentId
      || payload.payload?.metadata?.paymentId
      || payload.orderId
      || payload.order_id
      || payload.payload?.orderId
      || payload.payload?.id
      || payload.reference
      || req.query.paymentId
      || req.query.orderId
      || req.query.order_id
      || req.query.reference
      || req.query.id;
    const payment = reference
      ? db.payments.find((item) => item.id === reference || item.providerReference === reference)
      : null;
    let subscription = null;
    if (payment) {
      if (payment.provider && payment.provider !== "payriff") {
        addPaymentLog(db, "payriff", "provider_mismatch", payment.id);
        writeDb(db);
        return res.status(409).json({ ok: false, error: "Payment provider mismatch" });
      }
      try {
        const statusPayload = await settlePayriffPayment(req, payment, payload);
        subscription = applyPayriffStatusToPayment(db, payment, statusPayload);
      } catch (error) {
        addPaymentLog(db, "payriff", "status_check_failed", payment.id);
        writeDb(db);
        return res.status(isPayriffConfigured() ? 502 : 503).json({ ok: false, error: error.message });
      }
    }
    addPaymentLog(db, "payriff", payment ? `matched:${payment.status}` : "received", payment?.id || "");
    writeDb(db);
    res.json({ ok: true, payment: payment || null, subscription });
  });
}

const express = require("express");
const appProto = express.application;
const originalUse = appProto.use;
const originalPost = appProto.post;

appProto.use = function patchedUse(...args) {
  installRoutes(this, express);
  return originalUse.apply(this, args);
};

appProto.post = function patchedPost(route, ...handlers) {
  if (route === "/api/payments/checkout") {
    const authHandler = handlers[0];
    const originalCheckoutHandler = handlers[1];
    return originalPost.call(this, route, authHandler, async (req, res, next) => {
      const { planId, provider = process.env.PAYMENT_DEFAULT_PROVIDER || "payriff" } = req.body || {};
      if (provider !== "payriff" && typeof originalCheckoutHandler === "function") {
        return originalCheckoutHandler(req, res, next);
      }
      const plan = PAYMENT_PLANS[planId];
      if (!plan) return res.status(404).json({ error: "Plan not found" });
      const db = readDb();
      const checkoutUser = req.auth?.admin ? null : findUserForAuth(db, req.auth);
      if (!req.auth?.admin && !checkoutUser) {
        return res.status(401).json({ error: "Session expired. Please log in again." });
      }
      const config = payriffConfig();
      const payment = {
        id: `pay-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        userId: req.auth?.admin ? "admin" : checkoutUser.id,
        planId,
        provider: "payriff",
        amount: payriffDisplayAmount(plan.amount),
        currency: "USD",
        displayAmount: payriffDisplayAmount(plan.amount),
        displayCurrency: "USD",
        providerAmount: payriffAmount(plan.amount, config.currency),
        providerCurrency: config.currency,
        exchangeRate: config.currency === "AZN" ? payriffUsdToAznRate() : null,
        status: "checkout_creating",
        createdAt: nowIso()
      };
      db.payments.unshift(payment);
      try {
        await createPayriffCheckout(req, payment, plan, planId);
        writeDb(db);
        return res.status(201).json({
          payment,
          message: "Payriff checkout is ready. You will be redirected to the secure payment page."
        });
      } catch (error) {
        payment.status = isPayriffConfigured() ? "checkout_failed" : "configuration_required";
        payment.error = error.message;
        payment.updatedAt = nowIso();
        writeDb(db);
        return res.status(isPayriffConfigured() ? 502 : 503).json({ error: error.message, payment });
      }
    });
  }
  return originalPost.call(this, route, ...handlers);
};
