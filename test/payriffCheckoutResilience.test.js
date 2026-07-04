const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

test("Payriff checkout uses a bounded timeout and safe public network errors", () => {
  assert.match(serverSource, /const PAYRIFF_REQUEST_TIMEOUT_MS = 15000;/);
  assert.match(serverSource, /signal: AbortSignal\.timeout\(PAYRIFF_REQUEST_TIMEOUT_MS\)/);
  assert.match(serverSource, /Payriff is temporarily unavailable because the secure checkout request timed out/);
  assert.match(serverSource, /category: timedOut \? "timeout" : "network_error"/);
  assert.doesNotMatch(serverSource, /throw new Error\(`Payriff network error:/);
});

test("Payriff diagnostics are useful without logging credential values", () => {
  assert.match(serverSource, /endpointHostname: safeUrlHostname\(`\$\{config\.baseUrl\}\$\{config\.createPath\}`\)/);
  assert.match(serverSource, /secretExists: Boolean\(config\.secretKey\)/);
  assert.match(serverSource, /callbackUrlHost: safeUrlHostname\(callbackUrl\)/);
  assert.match(serverSource, /status: response\.status/);
  assert.match(serverSource, /errorMessage: responseErrorMessage/);
  assert.doesNotMatch(serverSource, /console\.(?:info|warn|error)\([^\n]*config\.secretKey/);
});

test("Payriff application errors preserve a provider support ticket", () => {
  assert.match(serverSource, /Payment provider returned: Application not found\. Please contact support with ticket \$\{ticket\}\./);
  assert.match(serverSource, /support\\s\+ticket/);
});
