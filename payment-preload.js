const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "data", "db.json");
const PAYMENT_PLANS = {
  "education-bundle": { name: "Courses + Trading Book", amount: 49.9, cadence: "one-time", accessDays: 3650 },
  "premium-discord-signals": { name: "Premium Discord Signals", amount: 19.9, cadence: "monthly", accessDays: 30 },
  "arbitrage-only": { name: "Arbitrage Scanner Only", amount: 39.9, cadence: "monthly", accessDays: 30 },
  "bull-bear-premium": { name: "Bull & Bear Premium", amount: 79.9, cadence: "monthly", accessDays: 30 }
};

function nowIso() {
  return new Date().toISOString();
}

function readDb() {
  const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  db.payments = Array.isArray(db.payments) ? db.payments : [];
  db.paymentLogs = Array.isArray(db.paymentLogs) ? db.paymentLogs : [];
  db.subscriptions = Array.isArray(db.subscriptions) ? db.subscriptions : [];
  db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
  db.users = Array.isArray(db.users) ? db.users : [];
  return db;
}

function writeDb(db) {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(db, null, 2)}\n`);
  fs.renameSync(tmp, DATA_FILE);
}

function requestBaseUrl(req) {
  const appUrl = String(process.env.APP_URL || "").replace(/\/+$/, "");
  return appUrl || `${req.protocol}://${req.get("host")}`;
}

function yigimConfig() {
  return {
    baseUrl: (process.env.YIGIM_BASE_URL || "https://sandbox.api.pay.yigim.az").replace(/\/+$/, ""),
    merchantId: process.env.YIGIM_MERCHANT_ID,
    secretKey: process.env.YIGIM_SECRET_KEY,
    billerId: process.env.YIGIM_BILLER_ID,
    templateId: process.env.YIGIM_TEMPLATE_ID || "TPL0002",
    language: process.env.YIGIM_LANGUAGE || "az",
    paymentType: process.env.YIGIM_PAYMENT_TYPE || "SMS",
    currency: process.env.YIGIM_CURRENCY || "944"
  };
}

function isYigimConfigured() {
  const config = yigimConfig();
  return Boolean(config.merchantId && config.secretKey && config.billerId);
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

async function callYigim(pathname, params = {}) {
  const config = yigimConfig();
  if (!isYigimConfigured()) throw new Error("Yigim is not configured in Render environment variables yet.");
  const url = new URL(`${config.baseUrl}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "X-Merchant": config.merchantId,
      "X-API-Key": config.secretKey,
      "X-Type": "JSON"
    },
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) throw new Error(payload?.message || payload?.error || payload?.raw || `Yigim returned ${response.status}`);
  return payload;
}

function activateSubscription(db, payment) {
  const plan = PAYMENT_PLANS[payment.planId] || PAYMENT_PLANS["arbitrage-only"];
  const expiresAt = new Date(Date.now() + (plan.accessDays || 30) * 24 * 60 * 60 * 1000).toISOString();
  let subscription = db.subscriptions.find((item) => item.userId === payment.userId && item.planId === payment.planId && item.status === "active");
  if (subscription) {
    subscription.expiresAt = expiresAt;
    subscription.paymentId = payment.id;
    subscription.autoRenew = plan.cadence === "monthly";
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
    expiresAt,
    paymentId: payment.id,
    createdAt: nowIso()
  };
  db.subscriptions.unshift(subscription);
  return subscription;
}

function isYigimPaid(payload = {}) {
  return String(payload.code ?? "") === "00" && String(payload.status ?? "") === "0";
}

function markPaymentFromYigimStatus(db, payment, payload = {}) {
  if (isYigimPaid(payload)) {
    payment.status = "paid";
    payment.providerPayload = payload;
    payment.paidAt = payment.paidAt || nowIso();
    payment.updatedAt = nowIso();
    const subscription = activateSubscription(db, payment);
    if (!db.notifications.some((item) => item.paymentId === payment.id)) {
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
    return subscription;
  }
  payment.status = payload.code && String(payload.code) !== "00" ? "failed" : "pending";
  payment.providerPayload = payload;
  payment.updatedAt = nowIso();
  return null;
}

function installRoutes(app) {
  if (app.__bbPaymentPatchRoutes) return;
  app.__bbPaymentPatchRoutes = true;
  app.get("/api/payments/webhook/yigim", async (req, res) => {
    const reference = String(req.query.reference || req.query.paymentId || req.query.orderId || "").trim();
    const db = readDb();
    const payment = reference ? db.payments.find((item) => item.id === reference || item.providerReference === reference) : null;
    if (!reference) return res.status(400).json({ ok: false, error: "Missing payment reference" });
    try {
      const statusPayload = await callYigim("/payment/status", { reference });
      const subscription = payment ? markPaymentFromYigimStatus(db, payment, statusPayload) : null;
      db.paymentLogs.unshift({
        id: `webhook-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        provider: "yigim",
        status: payment ? `matched:${payment.status}` : "unknown_reference",
        paymentId: payment?.id || reference,
        createdAt: nowIso()
      });
      writeDb(db);
      res.json({ ok: true, payment: payment || null, subscription });
    } catch (error) {
      if (payment) {
        payment.status = payment.status === "paid" ? "paid" : "status_check_failed";
        payment.error = error.message;
        payment.updatedAt = nowIso();
      }
      db.paymentLogs.unshift({
        id: `webhook-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        provider: "yigim",
        status: "status_check_failed",
        paymentId: payment?.id || reference,
        createdAt: nowIso()
      });
      writeDb(db);
      res.status(502).json({ ok: false, error: error.message });
    }
  });
}

const express = require("express");
const appProto = express.application;
const originalUse = appProto.use;
const originalPost = appProto.post;

appProto.use = function patchedUse(...args) {
  installRoutes(this);
  return originalUse.apply(this, args);
};

appProto.post = function patchedPost(route, ...handlers) {
  if (route === "/api/payments/checkout") {
    const authHandler = handlers[0];
    return originalPost.call(this, route, authHandler, async (req, res) => {
      const { planId, provider = process.env.PAYMENT_DEFAULT_PROVIDER || "yigim" } = req.body || {};
      if (provider !== "yigim") return handlers[1](req, res);
      const plan = PAYMENT_PLANS[planId];
      if (!plan) return res.status(400).json({ error: "Unknown payment plan" });
      const db = readDb();
      const payment = {
        id: `pay-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        userId: req.auth.userId || "admin",
        planId,
        provider: "yigim",
        status: "checkout_creating",
        amount: plan.amount,
        currency: process.env.YIGIM_CURRENCY_LABEL || "USD",
        checkoutUrl: null,
        createdAt: nowIso()
      };
      db.payments.unshift(payment);
      try {
        const config = yigimConfig();
        const baseUrl = requestBaseUrl(req);
        const payload = await callYigim("/payment/create", {
          reference: payment.id,
          type: config.paymentType,
          amount: Math.round(Number(plan.amount) * 100),
          currency: config.currency,
          biller: config.billerId,
          description: `Bull & Bear - ${plan.name}`,
          template: config.templateId,
          language: config.language,
          callback: `${baseUrl}/api/payments/webhook/yigim`,
          extra: `paymentId=${payment.id};planId=${planId};back-url=${baseUrl}/payment/success?paymentId=${payment.id};fail-url=${baseUrl}/payment/failed?paymentId=${payment.id}`
        });
        const checkoutUrl = findCheckoutUrl(payload);
        if (!checkoutUrl) throw new Error("Yigim did not return a checkout URL");
        payment.status = "checkout_created";
        payment.checkoutUrl = checkoutUrl;
        payment.providerReference = payment.id;
        payment.providerPayload = payload;
        payment.updatedAt = nowIso();
        writeDb(db);
        return res.status(201).json({ payment, message: "Yigim checkout is ready." });
      } catch (error) {
        payment.status = isYigimConfigured() ? "checkout_failed" : "configuration_required";
        payment.error = error.message;
        payment.updatedAt = nowIso();
        writeDb(db);
        return res.status(isYigimConfigured() ? 502 : 503).json({ error: error.message, payment });
      }
    });
  }
  return originalPost.call(this, route, ...handlers);
};
