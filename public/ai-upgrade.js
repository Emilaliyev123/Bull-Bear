(function () {
  const realFetch = window.fetch.bind(window);
  const messages = [{
    role: "assistant",
    text: "Ask me anything about trading, investing, risk, psychology, arbitrage, or lessons. I will answer with a professional education plan, scenarios, and a teaching chart."
  }];
  let latest = null;
  let lastKey = "";

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function avg(values) {
    return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
  }

  function sma(values, period) {
    return values.length < period ? avg(values) : avg(values.slice(-period));
  }

  function rsi(values, period = 14) {
    if (values.length <= period) return 50;
    const changes = values.slice(1).map((value, index) => value - values[index]);
    const recent = changes.slice(-period);
    const gains = recent.map((value) => Math.max(0, value));
    const losses = recent.map((value) => Math.max(0, -value));
    const loss = avg(losses);
    return loss ? 100 - (100 / (1 + avg(gains) / loss)) : 100;
  }

  function money(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: Number(value) > 1000 ? 2 : 4 });
  }

  function symbolFromRequest(request) {
    const first = String(request.asset || "BTC").split(/[\s,;/]+/).filter(Boolean)[0] || "BTC";
    return `${first.toUpperCase().replace(/[^A-Z0-9/]/g, "").replace(/\/USDT$/, "").replace(/USDT$/, "") || "BTC"}USDT`;
  }

  function intervalFromRequest(request) {
    const value = String(request.timeframe || "").toLowerCase();
    if (value.includes("intra")) return "15m";
    if (value.includes("long") || value.includes("weekly")) return "1d";
    return "4h";
  }

  function fallbackCandles(symbol) {
    const base = symbol.startsWith("BTC") ? 78000 : symbol.startsWith("ETH") ? 3600 : symbol.startsWith("SOL") ? 165 : 100;
    const candles = [];
    let last = base;
    for (let index = 0; index < 72; index += 1) {
      const wave = Math.sin(index / 5) * base * 0.008;
      const drift = (index - 36) * base * 0.0002;
      const close = Math.max(base * 0.55, last + wave * 0.08 + drift * 0.04);
      const open = last;
      const high = Math.max(open, close) * (1 + 0.003 + (index % 5) * 0.0007);
      const low = Math.min(open, close) * (1 - 0.003 - (index % 4) * 0.0006);
      candles.push({ open, high, low, close });
      last = close;
    }
    return candles;
  }

  async function getMarket(request) {
    const symbol = symbolFromRequest(request);
    const interval = intervalFromRequest(request);
    let source = "Binance live candles";
    let candles;
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=72`;
      const response = await realFetch(url);
      if (!response.ok) throw new Error("Binance unavailable");
      candles = (await response.json()).map((item) => ({
        open: Number(item[1]),
        high: Number(item[2]),
        low: Number(item[3]),
        close: Number(item[4])
      }));
    } catch {
      source = "Internal teaching chart";
      candles = fallbackCandles(symbol);
    }
    const closes = candles.map((item) => item.close);
    const last = candles[candles.length - 1];
    const first = candles[Math.max(0, candles.length - 25)];
    const ma20 = sma(closes, 20);
    const ma50 = sma(closes, Math.min(50, closes.length));
    const rsi14 = rsi(closes);
    const support = Math.min(...candles.slice(-30).map((item) => item.low));
    const resistance = Math.max(...candles.slice(-30).map((item) => item.high));
    const trend = last.close > ma20 && ma20 >= ma50 ? "bullish" : last.close < ma20 && ma20 <= ma50 ? "bearish" : "range";
    return {
      source,
      symbol,
      interval,
      asset: symbol.replace(/USDT$/, ""),
      price: Number(last.close.toFixed(4)),
      changePct: Number((((last.close - first.close) / first.close) * 100).toFixed(2)),
      rsi14: Number(rsi14.toFixed(1)),
      momentum: rsi14 >= 68 ? "extended" : rsi14 <= 35 ? "washed out" : rsi14 >= 52 ? "constructive" : "soft",
      trend,
      support: Number(support.toFixed(4)),
      resistance: Number(resistance.toFixed(4)),
      candles: candles.slice(-52).map((item) => ({
        open: Number(item.open.toFixed(4)),
        high: Number(item.high.toFixed(4)),
        low: Number(item.low.toFixed(4)),
        close: Number(item.close.toFixed(4))
      }))
    };
  }

  function topics(request) {
    const text = `${request.mode || ""} ${request.market || ""} ${request.asset || ""} ${request.question || ""}`.toLowerCase();
    const map = [
      ["risk", ["risk", "stop", "loss", "size", "drawdown"]],
      ["portfolio", ["invest", "portfolio", "allocation", "long term", "dca"]],
      ["signal", ["signal", "entry", "buy", "sell", "setup", "trigger"]],
      ["lesson", ["lesson", "learn", "teach", "course", "beginner"]],
      ["technical", ["rsi", "support", "resistance", "trend", "candle", "chart"]],
      ["psychology", ["emotion", "fear", "greed", "discipline", "revenge"]],
      ["arbitrage", ["arbitrage", "spread", "exchange", "fee", "transfer"]]
    ];
    const found = map.filter(([, words]) => words.some((word) => text.includes(word))).map(([name]) => name);
    return found.length ? found : [request.mode === "investor" ? "portfolio" : "technical"];
  }

  function buildResult(request, market) {
    const topicText = {
      risk: "Risk first: define invalidation before entry, cap loss per idea, and stop when discipline breaks.",
      portfolio: "Investor model: split capital into core positions, tactical positions, and cash for high-quality pullbacks.",
      signal: "Signal model: no blind calls. Every idea needs trigger, confirmation, invalidation, target zone, and risk size.",
      lesson: "Lesson model: learn structure first, risk second, psychology third, and execution review fourth.",
      technical: "Technical model: trend, support, resistance, volume, and candle location matter more than one indicator.",
      psychology: "Psychology model: the edge is calm repetition, not emotional prediction.",
      arbitrage: "Arbitrage model: spread is only useful after fees, liquidity, network cost, and transfer time."
    };
    const picked = topics(request);
    const riskLine = request.riskProfile === "conservative"
      ? "Use smaller size and require extra confirmation."
      : request.riskProfile === "aggressive" ? "Aggressive plans still need hard invalidation and fixed risk." : "Use balanced size and do not chase after expansion.";
    const answer = [
      `Direct answer: ${picked.map((topic) => topicText[topic]).join(" ")}`,
      `Market context: ${market.asset} is near $${money(market.price)}, RSI ${market.rsi14}, structure ${market.trend}, support ${market.support}, resistance ${market.resistance}.`,
      "Professional plan: decide the regime first, wait for a valid trigger, confirm with retest or volume, then define invalidation before entry.",
      `Risk rule: ${riskLine} This is educational analysis, not guaranteed financial advice.`
    ].join("\n\n");
    const assets = String(request.asset || "BTC, ETH, SOL").split(/[\s,;/]+/).filter(Boolean).slice(0, 5);
    return {
      title: "Bull & Bear Investor & Trader AI",
      summary: answer,
      chatAnswer: answer,
      marketSnapshot: [{
        asset: market.asset,
        price: market.price,
        changePct: `${market.changePct}%`,
        rsi14: market.rsi14,
        trend: market.trend,
        momentum: market.momentum
      }],
      chartData: {
        symbol: market.symbol,
        interval: market.interval,
        support: market.support,
        resistance: market.resistance,
        candles: market.candles
      },
      teachingGraphics: [
        { title: "Trend Decision Model", type: "flow", steps: ["Regime", "Level", "Trigger", "Invalidation", "Size", "Review"], note: "Use this before any signal-style idea." },
        { title: "Risk Box", type: "risk", steps: ["Entry", "Stop", "Target"], note: "Downside comes before upside." },
        { title: "Learning Path", type: "lesson", steps: ["Structure", "Risk", "Psychology", "Journal"], note: "Study in this order for cleaner progress." }
      ],
      marketModel: [
        { model: "Regime First", read: "Classify the market as bullish, bearish, or range before any setup.", confirmation: "Retest and volume should confirm the level.", warning: "No model guarantees profit." },
        { model: "Liquidity And Fees", read: "For crypto and arbitrage, spread alone is not enough.", confirmation: "Check liquidity, fees, transfer time, and final net result.", warning: "Avoid low-volume pairs." }
      ],
      watchlist: assets.map((asset, index) => ({
        asset: asset.toUpperCase(),
        bias: index === 0 ? `${market.trend} / ${market.momentum}` : "structure watch",
        setup: "Wait for a clean level break, retest, and continuation confirmation.",
        trigger: index === 0 ? `Close above ${market.resistance}, then hold retest.` : "Break local resistance with rising volume.",
        invalidation: index === 0 ? `Invalid below ${market.support}.` : "Invalid if price loses the prior higher low.",
        risk: "Small fixed risk only."
      })),
      signalScenarios: [
        { pair: `${market.asset}/USDT`, scenario: "Continuation after confirmation", trigger: `Break above ${market.resistance} and retest holds.`, invalidation: `Close below ${market.support}.`, notes: "Educational scenario only." },
        { pair: `${market.asset}/USDT`, scenario: "Pullback into support", trigger: `Price rejects near ${market.support} and closes back above demand.`, invalidation: "Support fails with acceptance below it.", notes: "Wait for confirmation." }
      ],
      lessonPlan: [
        { lesson: "Market Structure", focus: "Trend, levels, retests, and candle location.", practice: "Mark three levels before planning entry." },
        { lesson: "Risk Management", focus: "Position size, invalidation, and maximum daily loss.", practice: "Write risk before reward." },
        { lesson: "Psychology", focus: "Patience, discipline, and review.", practice: "Journal each setup with screenshots." }
      ],
      riskRules: ["Educational analysis only, not financial advice.", "Risk a small fixed percentage per idea.", "Do not enter without trigger, confirmation, and invalidation.", "Avoid chasing after large candles."],
      nextSteps: ["Choose one primary asset and one backup asset.", "Write trigger and invalidation before entry.", "Check volume, fees, and exchange conditions.", "Review the trade after completion."],
      disclaimer: "Free educational analysis only. This is not financial advice, investment advice, or a promise of profit."
    };
  }

  function jsonResponse(body) {
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }

  window.fetch = async function (resource, options = {}) {
    const url = typeof resource === "string" ? resource : resource?.url || "";
    if (!url.includes("/api/ai/advisor")) return realFetch(resource, options);
    let request = {};
    try {
      request = JSON.parse(options.body || "{}");
    } catch {
      request = {};
    }
    const market = await getMarket(request);
    const result = buildResult(request, market);
    latest = { result, meta: { model: "Bull & Bear Free AI", marketSource: market.source, generatedAt: new Date().toISOString() } };
    messages.push({ role: "user", text: request.question || "Analyze the market." }, { role: "assistant", text: result.chatAnswer });
    while (messages.length > 8) messages.shift();
    setTimeout(enhance, 40);
    return jsonResponse(latest);
  };

  function addCss() {
    if (document.getElementById("bb-ai-upgrade-css")) return;
    const style = document.createElement("style");
    style.id = "bb-ai-upgrade-css";
    style.textContent = `
      .bb-ai-enhanced{margin-bottom:18px}.bb-ai-box{border:1px solid rgba(245,158,11,.2);border-radius:8px;background:linear-gradient(145deg,rgba(245,158,11,.08),transparent 58%),rgba(255,255,255,.025);padding:22px}.bb-ai-badge{display:inline-flex;border:1px solid rgba(245,158,11,.35);border-radius:999px;padding:8px 12px;color:#facc15;background:rgba(245,158,11,.08);font-size:12px;font-weight:900;text-transform:uppercase}.bb-ai-thread{display:grid;gap:12px;max-height:420px;overflow:auto}.bb-ai-msg{width:min(100%,760px);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:14px;color:#f8fafc;background:rgba(255,255,255,.025);line-height:1.65;white-space:pre-line}.bb-ai-msg.user{justify-self:end;border-color:rgba(245,158,11,.32);background:rgba(245,158,11,.08)}.bb-ai-msg span,.bb-ai-card span{display:block;margin-bottom:6px;color:#facc15;font-size:11px;font-weight:900;text-transform:uppercase}.bb-ai-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.bb-ai-card{border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:16px;background:rgba(255,255,255,.025)}.bb-ai-card strong{display:block;color:#fff;font-size:24px}.bb-ai-chart svg{width:100%;min-height:300px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#070707}.bb-ai-flow{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.bb-ai-flow strong{border:1px solid rgba(245,158,11,.25);border-radius:999px;padding:8px 10px;color:#fff;background:rgba(245,158,11,.08);font-size:12px}@media(max-width:980px){.bb-ai-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.bb-ai-grid{grid-template-columns:1fr}.bb-ai-box{padding:18px}}
    `;
    document.head.appendChild(style);
  }

  function chartSvg(data) {
    const candles = (data?.candles || []).slice(-42);
    if (!candles.length) return "";
    const width = 720;
    const height = 320;
    const pad = 28;
    const min = Math.min(...candles.map((item) => item.low), Number(data.support || Infinity));
    const max = Math.max(...candles.map((item) => item.high), Number(data.resistance || -Infinity));
    const range = Math.max(1, max - min);
    const step = (width - pad * 2) / Math.max(1, candles.length - 1);
    const y = (value) => pad + ((max - Number(value)) / range) * (height - pad * 2);
    const supportY = y(data.support || min);
    const resistanceY = y(data.resistance || max);
    const line = candles.map((item, index) => `${pad + index * step},${y(item.close).toFixed(2)}`).join(" ");
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(data.symbol)} teaching chart">
      <line x1="${pad}" y1="${resistanceY.toFixed(2)}" x2="${width - pad}" y2="${resistanceY.toFixed(2)}" stroke="#ef4444" stroke-dasharray="6 6"/>
      <line x1="${pad}" y1="${supportY.toFixed(2)}" x2="${width - pad}" y2="${supportY.toFixed(2)}" stroke="#10b981" stroke-dasharray="6 6"/>
      ${candles.map((item, index) => {
        const x = pad + index * step;
        const color = item.close >= item.open ? "#10b981" : "#ef4444";
        const top = y(Math.max(item.open, item.close));
        const bottom = y(Math.min(item.open, item.close));
        return `<line x1="${x.toFixed(2)}" y1="${y(item.high).toFixed(2)}" x2="${x.toFixed(2)}" y2="${y(item.low).toFixed(2)}" stroke="${color}" opacity=".78"/><rect x="${(x - 4).toFixed(2)}" y="${top.toFixed(2)}" width="8" height="${Math.max(3, bottom - top).toFixed(2)}" fill="${color}" opacity=".86"/>`;
      }).join("")}
      <polyline points="${line}" fill="none" stroke="#facc15" stroke-width="2.4"/>
      <text x="${pad + 8}" y="${Math.max(16, resistanceY - 8).toFixed(2)}" fill="#ef4444" font-size="12" font-weight="800">Resistance ${esc(data.resistance)}</text>
      <text x="${pad + 8}" y="${Math.min(height - 8, supportY + 18).toFixed(2)}" fill="#10b981" font-size="12" font-weight="800">Support ${esc(data.support)}</text>
    </svg>`;
  }

  function blocks() {
    const result = latest?.result;
    return `
      <div class="bb-ai-enhanced bb-ai-box">
        <div class="bb-ai-badge">Free AI active</div>
        <h2 class="h3" style="margin-top:14px;">Professional Market Chat</h2>
        <div class="bb-ai-thread">${messages.map((message) => `<article class="bb-ai-msg ${message.role === "user" ? "user" : "assistant"}"><span>${message.role === "user" ? "You" : "Bull & Bear AI"}</span>${esc(message.text)}</article>`).join("")}</div>
      </div>
      ${result ? `<div class="bb-ai-enhanced bb-ai-grid">${(result.marketSnapshot || []).map((item) => `<article class="bb-ai-card"><span>${esc(item.asset)}</span><strong>$${money(item.price)}</strong><small>${esc(item.trend)} / ${esc(item.momentum)} | RSI ${esc(item.rsi14)} | ${esc(item.changePct)}</small></article>`).join("")}</div>
      <div class="bb-ai-enhanced bb-ai-box bb-ai-chart"><h2 class="h3">${esc(result.chartData?.symbol || "Market")} Teaching Chart</h2><p class="muted">Support, resistance, candle structure, and closing path for education.</p>${chartSvg(result.chartData)}</div>
      <div class="bb-ai-enhanced bb-ai-grid">${(result.teachingGraphics || []).map((item) => `<article class="bb-ai-card"><span>${esc(item.type)}</span><h3 class="h3">${esc(item.title)}</h3><div class="bb-ai-flow">${(item.steps || []).map((step) => `<strong>${esc(step)}</strong>`).join("")}</div><p class="muted">${esc(item.note)}</p></article>`).join("")}</div>` : ""}
    `;
  }

  function enhance() {
    if (location.pathname.replace(/\/$/, "") !== "/ai") return;
    if (document.querySelector(".ai-chat-card")) return;
    addCss();
    const target = document.querySelector(".ai-output") || document.querySelector(".ai-empty-panel") || document.querySelector(".ai-layout");
    if (!target) return;
    const key = `${location.pathname}:${latest?.meta?.generatedAt || "empty"}:${messages.length}`;
    if (key === lastKey && document.querySelector(".bb-ai-enhanced")) return;
    lastKey = key;
    document.querySelectorAll(".bb-ai-enhanced").forEach((node) => node.remove());
    const holder = document.createElement("div");
    holder.innerHTML = blocks();
    Array.from(holder.children).reverse().forEach((node) => target.parentNode.insertBefore(node, target));
  }

  const observer = new MutationObserver(() => requestAnimationFrame(enhance));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", enhance);
  window.addEventListener("popstate", () => setTimeout(enhance, 80));
  document.addEventListener("click", () => setTimeout(enhance, 120));
  setTimeout(enhance, 300);
})();
