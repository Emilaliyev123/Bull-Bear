(() => {
  const setStatus = (message, type = "") => {
    const holder = document.querySelector("[data-status]");
    if (holder) {
      holder.textContent = message;
      holder.className = type === "err" ? "status err" : "status";
    }
  };

  const parseResponse = async (response) => {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  };

  const connectDiscord = async (button) => {
    const token = localStorage.getItem("bb_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Opening Discord...";
    setStatus("Opening Discord authorization...");

    try {
      const response = await fetch("/api/integrations/discord/connect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await parseResponse(response);

      if (!response.ok) {
        throw new Error(result.error || result.message || `Discord failed with status ${response.status}.`);
      }
      if (!result.url) {
        throw new Error("Discord connect link was not created.");
      }

      window.location.href = result.url;
    } catch (error) {
      const message = error?.message || "Discord connection failed.";
      setStatus(message, "err");
      alert(`Discord connect failed: ${message}`);
      button.disabled = false;
      button.textContent = originalText || "Connect Discord";
    }
  };

  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest("[data-connect-discord]");
      if (!button) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      connectDiscord(button);
    },
    true
  );
})();
