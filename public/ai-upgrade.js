(function () {
  function addCss() {
    if (document.getElementById("bb-ai-pro-css")) return;
    const style = document.createElement("style");
    style.id = "bb-ai-pro-css";
    style.textContent = `
      .bb-ai-pro-note{border:1px solid rgba(245,158,11,.24);border-radius:8px;padding:14px 16px;margin-bottom:16px;background:linear-gradient(135deg,rgba(245,158,11,.12),transparent 55%),rgba(255,255,255,.025);color:#f8fafc;line-height:1.55}
      .bb-ai-pro-note strong{color:#facc15}
    `;
    document.head.appendChild(style);
  }

  function enhance() {
    if (location.pathname.replace(/\/$/, "") !== "/ai") return;
    if (document.querySelector(".bb-ai-pro-note")) return;
    const formCard = document.querySelector(".ai-layout > .card");
    const paywall = document.querySelector(".ai-paywall");
    const target = formCard || paywall;
    if (!target) return;
    addCss();
    const note = document.createElement("div");
    note.className = "bb-ai-pro-note";
    note.innerHTML = "<strong>AI + Discord:</strong> crypto, forex, futures, premium signal planning, strategy playbooks, teaching charts, risk rules, macro checklist, and journal workflow.";
    target.parentNode.insertBefore(note, target);
  }

  const observer = new MutationObserver(() => requestAnimationFrame(enhance));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", enhance);
  window.addEventListener("popstate", () => setTimeout(enhance, 80));
  document.addEventListener("click", () => setTimeout(enhance, 120));
  setTimeout(enhance, 300);
})();
