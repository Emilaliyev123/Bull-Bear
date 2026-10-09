const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

// GET /api/content is reachable without a token. It used to be built by
// removing `users` and `signals` from the database and spreading the rest, so
// it answered anonymous callers with payments, paymentLogs, auditLogs,
// subscriptions, notifications, analytics, scannerControls and unexpired
// oauthStates. The handler now names its public fields, which also means a
// collection added to the database later stays private by default -- this test
// fails if anything goes back to publishing the database wholesale.

const PRIVATE_COLLECTIONS = [
  "users",
  "signals",
  "payments",
  "paymentLogs",
  "auditLogs",
  "oauthStates",
  "subscriptions",
  "notifications",
  "analytics",
  "scannerControls",
  "announcements"
];

// Distinctive strings, so the assertion catches a value that survives under
// some other key as well as a whole collection coming back.
const CANARIES = [
  "canary-order-reference",
  "canary-provider-payload",
  "canary-oauth-state",
  "canary-audit-detail",
  "canary-user-notification",
  "canary-visitor-hash",
  "canary@example.invalid",
  "canary-password-hash"
];

function seedDb(storageDir) {
  fs.mkdirSync(path.join(storageDir, "data"), { recursive: true });
  fs.writeFileSync(path.join(storageDir, "data", "db.json"), JSON.stringify({
    courses: [{
      id: "course-1",
      title: "Public lesson",
      description: "Visible to anonymous visitors",
      category: "basics",
      duration: "10m",
      isFree: true,
      videoUrl: "",
      thumbnailUrl: "/uploads/images/thumb.png",
      createdAt: "2026-01-01T00:00:00.000Z"
    }],
    book: {
      title: "Public book",
      description: "Free through the Telegram channel",
      price: 0,
      coverUrl: "/uploads/images/cover.png",
      pdfUrl: "/uploads/book.pdf",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    users: [{ id: "u1", email: "canary@example.invalid", passwordHash: "canary-password-hash" }],
    subscriptions: [{ id: "s1", userId: "u1", planId: "arbitrage-only", status: "active" }],
    payments: [{ id: "p1", userId: "u1", orderId: "canary-order-reference", checkoutUrl: "https://example.invalid/pay" }],
    paymentLogs: [{ id: "pl1", provider: "payriff", raw: "canary-provider-payload" }],
    oauthStates: [{ state: "canary-oauth-state", provider: "google", expiresAt: "2099-01-01T00:00:00.000Z" }],
    auditLogs: [{ id: "a1", action: "admin.login", detail: "canary-audit-detail" }],
    announcements: [],
    notifications: [{ id: "n1", userId: "u1", message: "canary-user-notification" }],
    reviews: [],
    analytics: { days: { "2026-10-09": { views: {}, referrers: {}, visitors: ["canary-visitor-hash"], events: {} } } },
    scannerControls: { enabled: true }
  }, null, 2));
}

function get(port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: requestPath, method: "GET" }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("GET /api/content exposes no private collection to anonymous callers", async () => {
  const port = 3016;
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "bullbear-content-"));
  seedDb(storageDir);

  const server = spawn("node", ["server.js"], {
    env: Object.assign({}, process.env, {
      PORT: port,
      STORAGE_DIR: storageDir,
      ADMIN_SECRET: "0123456789abcdef0123456789abcdef"
    }),
    stdio: "ignore"
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const response = await get(port, "/api/content");
    assert.equal(response.status, 200, "public content must stay reachable");

    const payload = JSON.parse(response.body);

    for (const key of PRIVATE_COLLECTIONS) {
      assert.ok(
        !(key in payload),
        `/api/content must not return the "${key}" collection to an anonymous caller`
      );
    }

    for (const canary of CANARIES) {
      assert.ok(
        !response.body.includes(canary),
        `a private value ("${canary}") reached the public /api/content response`
      );
    }

    // The anonymous flows the page actually depends on.
    assert.equal(payload.courses.length, 1, "public lessons must still be served");
    assert.equal(payload.courses[0].title, "Public lesson");
    assert.equal(payload.courses[0].description, "Visible to anonymous visitors");
    assert.ok("videoUrl" in payload.courses[0], "courseModal() reads videoUrl");
    assert.equal(payload.book.title, "Public book", "public book metadata must still be served");
    assert.deepEqual(payload.products.map((p) => p.id), ["discord", "market-hub"]);

    // A cached copy on a shared proxy would outlive the response itself.
    assert.match(response.headers["cache-control"] || "", /no-store/);
  } finally {
    server.kill();
    fs.rmSync(storageDir, { recursive: true, force: true });
  }
});

test("the unauthenticated payment status route reports status without internal fields", async () => {
  // Exercised directly: the success branch needs a configured provider and a
  // live order, but the serializers are what decide what leaves the process.
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const lift = (name) => {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} should exist in server.js`);
    return source.slice(start, source.indexOf("\n}\n", start) + 3);
  };
  const scope = {};
  new Function(`${lift("publicPaymentStatus")}${lift("publicSubscriptionStatus")}
    this.publicPaymentStatus = publicPaymentStatus;
    this.publicSubscriptionStatus = publicSubscriptionStatus;`).call(scope);

  const payment = scope.publicPaymentStatus({
    id: "pay-1",
    userId: "u1",
    planId: "arbitrage-only",
    status: "paid",
    amount: 24.9,
    displayAmount: 24.9,
    displayCurrency: "USD",
    providerAmount: 42.33,
    providerCurrency: "AZN",
    exchangeRate: 1.7,
    providerReference: "canary-provider-reference",
    checkoutUrl: "https://example.invalid/pay",
    error: "canary-internal-error"
  });
  const subscription = scope.publicSubscriptionStatus({
    id: "s1",
    userId: "u1",
    planId: "arbitrage-only",
    status: "active",
    paid_until: "2026-11-09T00:00:00.000Z",
    internalNote: "canary-internal-note"
  });

  assert.deepEqual(Object.keys(payment).sort(), [
    "createdAt", "displayAmount", "displayCurrency", "id", "planId", "status", "updatedAt"
  ]);
  assert.deepEqual(Object.keys(subscription).sort(), ["paidUntil", "planId", "status"]);
  assert.equal(payment.status, "paid", "the payer still learns the outcome");
  assert.equal(subscription.paidUntil, "2026-11-09T00:00:00.000Z");

  const serialized = JSON.stringify({ payment, subscription });
  for (const canary of ["canary-provider-reference", "canary-internal-error", "canary-internal-note", "u1", "example.invalid"]) {
    assert.ok(!serialized.includes(canary), `internal value "${canary}" must not be published`);
  }

  assert.equal(scope.publicPaymentStatus(null), null);
  assert.equal(scope.publicSubscriptionStatus(null), null);
});
