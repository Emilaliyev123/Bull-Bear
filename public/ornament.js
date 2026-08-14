/**
 * Bull & Bear — classical ornament primitives
 *
 * Inline SVG generators for the antique layer. Everything here is drawn as
 * vector paths rather than shipped as images: ornament sits behind and beside
 * text at large sizes, where a raster would either blur or cost hundreds of
 * kilobytes, and vectors recolour through currentColor for free.
 *
 * Every generator returns an SVG string and is decorative, so each one is
 * marked aria-hidden — a screen reader announcing "laurel wreath" between
 * every section would be noise, not information.
 */
(function () {
  "use strict";

  /** Greek key / meander border, tiled horizontally as a repeating pattern. */
  function meander(options) {
    const opts = options || {};
    const height = opts.height || 18;
    const id = "meander-" + (opts.id || "default");
    // One unit of the key drawn on a 24x18 grid, then tiled by <pattern> so a
    // divider of any width costs the same markup.
    return `
      <svg class="orn orn-meander" height="${height}" width="100%" viewBox="0 0 240 18"
           preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="${id}" x="0" y="0" width="24" height="18" patternUnits="userSpaceOnUse">
            <path d="M0 17 L0 4 L16 4 L16 13 L8 13 L8 8.5 L12 8.5"
                  fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="square" stroke-linejoin="miter" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="240" height="18" fill="url(#${id})" />
      </svg>`;
  }

  /** Laurel branch. Mirrored by the caller to form a wreath around a number. */
  function laurelBranch(direction) {
    const flip = direction === "right" ? ' transform="scale(-1,1) translate(-60,0)"' : "";
    let leaves = "";
    // Leaves scale down along the stem so the branch tapers like a real one;
    // a constant leaf size reads as a machine part rather than foliage.
    for (let i = 0; i < 7; i += 1) {
      const t = i / 6;
      const x = 8 + t * 44;
      const y = 46 - t * 34;
      const scale = 1 - t * 0.42;
      const rot = -32 - t * 16;
      leaves +=
        `<ellipse cx="${x.toFixed(1)}" cy="${(y - 7 * scale).toFixed(1)}" ` +
        `rx="${(9 * scale).toFixed(1)}" ry="${(3.6 * scale).toFixed(1)}" ` +
        `transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" ` +
        `fill="currentColor" opacity="${(0.95 - t * 0.25).toFixed(2)}" />`;
      leaves +=
        `<ellipse cx="${(x - 2).toFixed(1)}" cy="${(y + 6 * scale).toFixed(1)}" ` +
        `rx="${(8 * scale).toFixed(1)}" ry="${(3.2 * scale).toFixed(1)}" ` +
        `transform="rotate(${(rot + 58).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" ` +
        `fill="currentColor" opacity="${(0.8 - t * 0.2).toFixed(2)}" />`;
    }
    return `
      <svg class="orn orn-laurel" viewBox="0 0 60 56" aria-hidden="true" focusable="false">
        <g${flip}>
          <path d="M6 50 Q26 40 54 14" fill="none" stroke="currentColor"
                stroke-width="2.2" stroke-linecap="round" opacity="0.9" />
          ${leaves}
        </g>
      </svg>`;
  }

  /** Full wreath: two mirrored branches enclosing whatever the caller slots in. */
  function wreath(inner) {
    return `
      <span class="orn-wreath">
        ${laurelBranch("left")}
        <span class="orn-wreath-core">${inner || ""}</span>
        ${laurelBranch("right")}
      </span>`;
  }

  /**
   * Doric column, drawn flat for use as a section frame.
   * Entasis — the slight outward curve of a real Doric shaft — is what stops
   * it reading as a plain rectangle, so the shaft edges are quadratic curves.
   */
  function column(options) {
    const opts = options || {};
    const flutes = opts.flutes === undefined ? 7 : opts.flutes;
    let fluting = "";
    for (let i = 1; i < flutes; i += 1) {
      const x = 14 + (i * 32) / flutes;
      fluting += `<line x1="${x.toFixed(1)}" y1="34" x2="${x.toFixed(1)}" y2="196"
                        stroke="currentColor" stroke-width="0.9" opacity="0.28" />`;
    }
    return `
      <svg class="orn orn-column" viewBox="0 0 60 220" preserveAspectRatio="none"
           aria-hidden="true" focusable="false">
        <rect x="2" y="0" width="56" height="9" fill="currentColor" opacity="0.92" />
        <rect x="6" y="9" width="48" height="7" fill="currentColor" opacity="0.72" />
        <path d="M10 16 Q30 26 50 16 L50 30 L10 30 Z" fill="currentColor" opacity="0.85" />
        <path d="M14 30 Q17 115 14 196 L46 196 Q43 115 46 30 Z"
              fill="currentColor" opacity="0.5" />
        ${fluting}
        <rect x="8" y="196" width="44" height="8" fill="currentColor" opacity="0.78" />
        <rect x="2" y="204" width="56" height="10" fill="currentColor" opacity="0.92" />
      </svg>`;
  }

  /** Pediment — the triangular gable over a temple front. Used as a card crown. */
  function pediment() {
    return `
      <svg class="orn orn-pediment" viewBox="0 0 200 44" preserveAspectRatio="none"
           aria-hidden="true" focusable="false">
        <path d="M0 44 L100 4 L200 44 Z" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linejoin="miter" opacity="0.75" />
        <path d="M14 44 L100 12 L186 44" fill="none" stroke="currentColor"
              stroke-width="1" opacity="0.35" />
      </svg>`;
  }

  /** Ionic volute — the scroll of an Ionic capital, as a corner flourish. */
  function volute() {
    return `
      <svg class="orn orn-volute" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M44 6 C22 6 6 18 6 30 C6 38 12 43 19 43 C25 43 30 38 30 32
                 C30 27 26 24 22 24 C19 24 17 26 17 29"
              fill="none" stroke="currentColor" stroke-width="2.4"
              stroke-linecap="round" opacity="0.9" />
      </svg>`;
  }

  /**
   * Guilloche — the engine-turned rosette engraved on banknotes and share
   * certificates. Carries "this is a financial instrument" more directly than
   * any other classical motif, which is why it earns a place beside the
   * temple vocabulary.
   */
  function guilloche(options) {
    const opts = options || {};
    const loops = opts.loops || 28;
    const rOuter = 46;
    const rInner = 26;
    let path = "";
    for (let i = 0; i < loops; i += 1) {
      const a = (i / loops) * Math.PI * 2;
      const x1 = 50 + Math.cos(a) * rOuter;
      const y1 = 50 + Math.sin(a) * rOuter;
      const x2 = 50 + Math.cos(a + 2.2) * rInner;
      const y2 = 50 + Math.sin(a + 2.2) * rInner;
      path += `<path d="M${x1.toFixed(2)} ${y1.toFixed(2)} Q50 50 ${x2.toFixed(2)} ${y2.toFixed(2)}"
                     fill="none" stroke="currentColor" stroke-width="0.55" opacity="0.55" />`;
    }
    return `
      <svg class="orn orn-guilloche" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor"
                stroke-width="0.8" opacity="0.5" />
        <circle cx="50" cy="50" r="25" fill="none" stroke="currentColor"
                stroke-width="0.8" opacity="0.5" />
        ${path}
      </svg>`;
  }

  /** Divider: a rule broken by a centred rosette, for between sections. */
  function divider() {
    return `
      <div class="orn-divider" aria-hidden="true">
        <span class="orn-rule"></span>
        <svg viewBox="0 0 24 24" class="orn orn-rosette" aria-hidden="true" focusable="false">
          <path d="M12 2 L14.4 9.6 L22 12 L14.4 14.4 L12 22 L9.6 14.4 L2 12 L9.6 9.6 Z"
                fill="currentColor" opacity="0.85" />
        </svg>
        <span class="orn-rule"></span>
      </div>`;
  }

  window.Ornament = {
    meander,
    laurelBranch,
    wreath,
    column,
    pediment,
    volute,
    guilloche,
    divider
  };
})();
