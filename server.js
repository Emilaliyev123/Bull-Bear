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
  const days = 30;
  const now = Date.now();
  const existing = db.subscriptions.find((item) => item.userId === userId && item.planId === planId && item.status === "active");
  const expiresAt = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
  if (existing) {
    existing.expiresAt = expiresAt;
    existing.autoRenew = true;
    existing.paymentId = paymentId || existing.paymentId;
    existing.updatedAt = nowIso();
    return existing;
  }
  const subscription = {
    id: `sub-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    userId,
    planId,
    status: "active",
    autoRenew: true,
    currentPeriodStart: nowIso(),
    expiresAt,
    paymentId,
    createdAt: nowIso()
  };
  db.subscriptions.unshift(subscription);
  return subscription;
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

function serializeContent(db) {
  const { users, signals, ...publicDb } = db;
  return {
    ...publicDb,
    products: [
      {
        id: "course",
        title: "Courses + Trading Book",
        subtitle: "Complete Education Bundle",
        description: "One bundle with the full video course library and Bull & Bear Trading Mastery book.",
        price: 49.9,
        cadence: "one-time"
      },
      {
        id: "signals",
        title: "Premium Discord Signals",
        subtitle: "Private Discord Membership",
        description: "Premium Discord access with signals, live streams, trade discussions, and member-only rooms.",
        price: 19.9,
        cadence: "monthly"
      },
      {
        id: "arbitrage",
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
        id: "arbitrage-only",
        name: "Arbitrage Scanner Only",
        price: 39.9,
        cadence: "monthly",
        features: ["Live scanner", "Advanced filters", "Browser alerts", "Saved coins", "Cancel anytime"]
      },
      {
        id: "bull-bear-premium",
        name: "Bull & Bear Premium",
        price: 79.9,
        cadence: "monthly",
        features: ["Arbitrage scanner", "VIP Discord signals", "Course videos", "Book access", "Discord premium access"]
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

app.post("/api/payments/checkout", requireAuth, (req, res) => {
  const { planId, provider = "manual" } = req.body || {};
  const supported = ["payriff", "epoint", "yigim", "crypto", "card", "manual"];
  if (!supported.includes(provider)) return res.status(400).json({ error: "Unsupported payment provider" });
  const payment = {
    id: `pay-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    userId: req.auth.userId || "admin",
    planId,
    provider,
    status: provider === "manual" ? "pending_review" : "configuration_required",
    amount: planId === "bull-bear-premium" ? 79.9 : 39.9,
    currency: "USD",
    checkoutUrl: provider === "manual" ? "/payment/success" : null,
    createdAt: nowIso()
  };
  const db = readDb();
  db.payments.unshift(payment);
  writeDb(db);
  addAuditLog("payment.checkout.created", req.auth.email || req.auth.username, { planId, provider, paymentId: payment.id });
  res.status(201).json({
    payment,
    message: provider === "manual"
      ? "Manual checkout record created."
      : "Provider adapter is ready. Add merchant credentials in environment variables to enable live checkout."
  });
});

app.post("/api/payments/webhook/:provider", express.raw({ type: "*/*" }), (req, res) => {
  const db = readDb();
  let payload = req.body || {};
  if (Buffer.isBuffer(payload)) {
    try {
      payload = JSON.parse(payload.toString("utf8") || "{}");
    } catch {
      payload = {};
    }
  }
  const paymentId = payload.paymentId || payload.payment_id || payload.orderId || payload.order_id;
  const status = String(payload.status || payload.payment_status || "").toLowerCase();
  const payment = paymentId ? db.payments.find((item) => item.id === paymentId) : null;
  let subscription = null;
  if (payment) {
    payment.status = ["paid", "success", "succeeded", "completed", "approved"].includes(status) ? "paid" : status || payment.status;
    payment.providerPayload = payload;
    payment.updatedAt = nowIso();
    if (payment.status === "paid") {
      subscription = activateSubscription(db, payment.userId, payment.planId, payment.id);
      const user = db.users.find((item) => item.id === payment.userId);
      if (payment.planId === "bull-bear-premium") {
        syncDiscordRole(user, true).catch((error) => console.warn("Discord role sync failed:", error.message));
      }
      db.notifications.unshift({
        id: `note-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        userId: payment.userId,
        type: "subscription",
        title: "Subscription activated",
        body: `Your ${payment.planId} subscription is active.`,
        createdAt: nowIso()
      });
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
    const hasPremium = db.subscriptions.some((item) => item.userId === user.id && item.status === "active" && item.planId === "bull-bear-premium");
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
      premiumRole: db.subscriptions.some((item) => item.userId === userId && item.status === "active" && item.planId === "bull-bear-premium")
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
  if (subscription.planId === "bull-bear-premium") {
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
    providers: {
      payriff: Boolean(process.env.PAYRIFF_SECRET_KEY),
      epoint: Boolean(process.env.EPOINT_PRIVATE_KEY),
      yigim: Boolean(process.env.YIGIM_MERCHANT_ID),
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
  console.log(`Admin login: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
});
