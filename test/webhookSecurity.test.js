const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const http = require("node:http");
const { spawn } = require("node:child_process");

test("Webhook HMAC signature validation rejects spoofed payloads", async (t) => {
  // Start server on a specific port
  const port = 3015;
  const env = Object.assign({}, process.env, {
    PORT: port,
    PAYRIFF_SECRET_KEY: "test-secret",
    PAYRIFF_WEBHOOK_SECRET: "test-webhook-secret",
    ADMIN_SECRET: "0123456789abcdef0123456789abcdef",
    PAYMENT_DEFAULT_PROVIDER: "payriff"
  });
  
  const server = spawn("node", ["server.js"], { env });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    const payload = JSON.stringify({
      status: "PAID",
      paymentId: "spoofed-id",
      orderId: "spoofed-order"
    });

    const sendWebhook = (signature) => {
      return new Promise((resolve) => {
        const req = http.request({
          hostname: "localhost",
          port,
          path: "/api/payments/webhook/payriff",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            ...(signature ? { "x-webhook-signature": signature } : {})
          }
        }, res => {
          let data = "";
          res.on("data", chunk => data += chunk);
          res.on("end", () => {
            resolve({ status: res.statusCode, data });
          });
        });
        req.write(payload);
        req.end();
      });
    };

    // 1. Missing signature
    const missingRes = await sendWebhook(null);
    assert.strictEqual(missingRes.status, 401, "Should reject missing signature with 401");

    // 2. Invalid signature
    const invalidRes = await sendWebhook("invalid-sig");
    assert.strictEqual(invalidRes.status, 401, "Should reject invalid signature with 401");

    // 3. Valid signature
    const validSig = crypto.createHmac("sha256", "test-webhook-secret").update(Buffer.from(payload)).digest("hex");
    const validRes = await sendWebhook(validSig);
    
    assert.notStrictEqual(validRes.status, 401, "Should accept valid signature");

  } finally {
    server.kill();
  }
});
