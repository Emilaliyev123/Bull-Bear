/**
 * Bull & Bear — motion layer
 *
 * Scroll choreography, text reveals, and the intro sequence. Deliberately
 * dependency-free: IntersectionObserver plus CSS transitions cover everything
 * here, so the page does not pay for an animation library on first paint.
 *
 * app.js replaces #app wholesale on every route change, so every observer is
 * torn down and rebuilt through refresh(). Nothing may outlive a render.
 */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Data-tool routes stay calm: a trader reading an entry zone should not wait
  // for content to animate in. Reveals are skipped, polish is kept.
  const CALM_ROUTES = ["/market-hub", "/arbitrage", "/scanner", "/ai", "/admin"];

  let revealTargets = [];
  let parallaxItems = [];
  let parallaxTicking = false;
  let magneticCleanups = [];

  function isCalmRoute() {
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    return CALM_ROUTES.includes(path);
  }

  /* ── Text splitting ──────────────────────────────────────────────────────
     Wraps each word in a masked span so it can rise into view. Words, not
     characters: character splitting shreds the accessibility tree and reads
     as gimmicky at heading sizes. */
  function splitHeading(element) {
    if (element.dataset.splitDone === "true") return;
    const text = element.textContent.trim();
    if (!text) return;

    element.setAttribute("aria-label", text);
    element.textContent = "";

    text.split(/\s+/).forEach((word, index) => {
      const mask = document.createElement("span");
      mask.className = "split-mask";
      mask.setAttribute("aria-hidden", "true");

      const inner = document.createElement("span");
      inner.className = "split-word";
      inner.style.transitionDelay = `${index * 55}ms`;
      inner.textContent = word;

      mask.appendChild(inner);
      element.appendChild(mask);
      element.appendChild(document.createTextNode(" "));
    });

    element.dataset.splitDone = "true";
  }

  /* ── Scroll reveals ─────────────────────────────────────────────────────
     Deliberately geometry-based rather than IntersectionObserver.

     A reveal hides content until something says otherwise, so the failure mode
     matters more than the mechanism. IO callbacks can be deferred or dropped
     when a tab is backgrounded or throttled, and a missed callback leaves the
     element at opacity 0 forever — an invisible page with no error. Measuring
     rects inside the scroll/rAF loop we already run means the same pass that
     drives parallax also settles reveals, and any scroll, resize, or visibility
     change re-checks from scratch. */
  function revealVisible() {
    if (!revealTargets.length) return;
    const limit = window.innerHeight * 0.92;
    let remaining = false;

    for (const el of revealTargets) {
      if (el.classList.contains("is-revealed")) continue;
      if (!el.isConnected) continue;
      const rect = el.getBoundingClientRect();
      // Reveal once the element's top edge enters the lower viewport band, and
      // always reveal anything already scrolled past.
      if (rect.top < limit) {
        el.classList.add("is-revealed");
      } else {
        remaining = true;
      }
    }

    if (!remaining) revealTargets = revealTargets.filter((el) => !el.classList.contains("is-revealed"));
  }

  function setupReveals() {
    revealTargets = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!revealTargets.length) return;

    if (reduceMotion.matches || isCalmRoute()) {
      revealTargets.forEach((el) => el.classList.add("is-revealed"));
      revealTargets = [];
      return;
    }

    revealTargets.forEach((el, index) => {
      if (el.dataset.revealDelay === undefined) {
        el.style.transitionDelay = `${Math.min(index, 6) * 70}ms`;
      } else {
        el.style.transitionDelay = `${el.dataset.revealDelay}ms`;
      }
      if (el.dataset.reveal === "split") splitHeading(el);
    });

    revealVisible();
  }

  /* ── Parallax ───────────────────────────────────────────────────────────── */
  function applyParallax() {
    parallaxTicking = false;
    const viewportHeight = window.innerHeight;
    for (const item of parallaxItems) {
      const rect = item.el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > viewportHeight) continue;
      const progress = (rect.top + rect.height / 2 - viewportHeight / 2) / viewportHeight;
      item.el.style.setProperty("--parallax-y", `${(progress * item.depth * -60).toFixed(2)}px`);
    }
  }

  function onScroll() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const offset = window.scrollY || doc.scrollTop || 0;
    doc.style.setProperty("--scroll-progress", max > 0 ? String(offset / max) : "0");

    revealVisible();

    if (parallaxItems.length && !parallaxTicking) {
      parallaxTicking = true;
      requestAnimationFrame(applyParallax);
    }
  }

  function setupParallax() {
    parallaxItems = [];
    if (reduceMotion.matches || isCalmRoute()) return;
    document.querySelectorAll("[data-parallax]").forEach((el) => {
      parallaxItems.push({ el, depth: Number(el.dataset.parallax) || 1 });
    });
    applyParallax();
  }

  /* ── Magnetic buttons ────────────────────────────────────────────────────
     Pointer-driven only. Touch devices get nothing, which is correct: there is
     no hover to respond to. */
  function setupMagnetic() {
    magneticCleanups.forEach((fn) => fn());
    magneticCleanups = [];
    if (reduceMotion.matches || !window.matchMedia("(hover: hover)").matches) return;

    document.querySelectorAll("[data-magnetic]").forEach((el) => {
      const strength = Number(el.dataset.magnetic) || 0.28;

      const move = (event) => {
        const rect = el.getBoundingClientRect();
        const x = (event.clientX - rect.left - rect.width / 2) * strength;
        const y = (event.clientY - rect.top - rect.height / 2) * strength;
        el.style.setProperty("--magnet-x", `${x.toFixed(2)}px`);
        el.style.setProperty("--magnet-y", `${y.toFixed(2)}px`);
      };
      const reset = () => {
        el.style.setProperty("--magnet-x", "0px");
        el.style.setProperty("--magnet-y", "0px");
      };

      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", reset);
      magneticCleanups.push(() => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", reset);
        reset();
      });
    });
  }

  /* ── Intro sequence ─────────────────────────────────────────────────────
     Once per tab, not once per page load. A returning visitor sitting through
     the same curtain on every visit is an annoyance, not a brand moment. */
  function runIntro() {
    if (reduceMotion.matches) return;
    try {
      if (sessionStorage.getItem("bb_intro_shown") === "1") return;
      sessionStorage.setItem("bb_intro_shown", "1");
    } catch (error) {
      return; // Private mode: skip rather than replay on every navigation.
    }

    const intro = document.createElement("div");
    intro.className = "bb-intro";
    intro.setAttribute("role", "presentation");
    intro.innerHTML =
      '<div class="bb-intro-inner">' +
      '<div class="bb-intro-mark">Bull &amp; Bear</div>' +
      '<div class="bb-intro-sub">Trading Academy</div>' +
      '<div class="bb-intro-bar"><i></i></div>' +
      '<div class="bb-intro-count">0</div>' +
      "</div>";
    document.body.appendChild(intro);
    document.documentElement.classList.add("bb-intro-active");

    const counter = intro.querySelector(".bb-intro-count");
    const bar = intro.querySelector(".bb-intro-bar i");
    const started = performance.now();
    const duration = 1400;

    const step = (now) => {
      const linear = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - linear, 3);
      const value = Math.round(eased * 100);
      counter.textContent = String(value);
      bar.style.transform = `scaleX(${eased})`;

      if (linear < 1) {
        requestAnimationFrame(step);
        return;
      }
      intro.classList.add("is-done");
      document.documentElement.classList.remove("bb-intro-active");
      setTimeout(() => intro.remove(), 900);
    };

    requestAnimationFrame(step);
  }

  /* ── Lifecycle ──────────────────────────────────────────────────────────── */
  function teardown() {
    revealTargets = [];
    parallaxItems = [];
    magneticCleanups.forEach((fn) => fn());
    magneticCleanups = [];
  }

  function refresh() {
    teardown();
    setupReveals();
    setupParallax();
    setupMagnetic();
    onScroll();
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  // A tab restored from the background may have skipped every scroll frame while
  // hidden; re-settle so nothing is left mid-reveal.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) onScroll();
  });
  window.addEventListener("load", onScroll);
  reduceMotion.addEventListener("change", refresh);

  // Gates the hidden state in CSS. If this script fails to parse or never runs,
  // the class is absent, [data-reveal] keeps its natural opacity, and the page
  // reads as a normal static site instead of a blank one.
  document.documentElement.classList.add("motion-ready");

  window.BullBearMotion = { refresh, teardown, splitHeading };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runIntro, { once: true });
  } else {
    runIntro();
  }
})();
