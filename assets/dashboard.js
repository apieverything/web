/* API Everything — dashboard. No dependencies, no analytics, no third parties.
   Two credentials, never mixed:
     - 16-digit unlock code  -> X-Unlock-Code (opens the account, never an API key)
     - ae_… API key          -> X-API-Key    (what your code actually uses)
   Both stay in the browser; the gateway stores only their hashes. */
(() => {
  "use strict";

  const cfg = window.AE_CONFIG || {};
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const UNLOCK_STORE = "ae_unlock";
  const APIKEY_STORE = "ae_api_key";
  const GW_STORE = "ae_gateway";

  const VIEWS = ["#viewIntro", "#viewKey", "#viewApiKey", "#viewDash"];
  const BTN_ARROW = ' <span aria-hidden="true">↗</span>';

  const STATUS_LABELS = {
    200: "OK",
    201: "Created",
    204: "No Content",
    400: "Bad Request",
    401: "Unauthorized",
    402: "Insufficient Credits",
    403: "Forbidden",
    404: "Not Found",
    429: "Rate Limited",
    500: "Server Error",
    502: "Bad Gateway",
    503: "Unavailable",
  };

  /* ---------- gateway resolution ---------- */
  function gatewayParam() { return new URLSearchParams(location.search).get("gateway"); }
  function normalizeGateway(raw) {
    let value = String(raw || "").trim().replace(/\/$/, "");
    if (!value) return null;
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    // Only http(s), no credentials embedded in the URL.
    if (!/^https?:\/\/[^@\s]+$/i.test(value)) return null;
    return value;
  }
  function gatewayFromQuery() {
    const raw = gatewayParam();
    if (!raw || raw === "none") return null;
    return normalizeGateway(raw);
  }
  function gateway() {
    // ?gateway=none forces the honest "not launched" state (also used for tests).
    if (gatewayParam() === "none") return null;
    const fromQuery = gatewayFromQuery();
    if (fromQuery) return fromQuery;
    const saved = sessionStorage.getItem(GW_STORE) || localStorage.getItem(GW_STORE);
    if (saved) return normalizeGateway(saved);
    if (cfg.GATEWAY_URL) return normalizeGateway(cfg.GATEWAY_URL);
    // Local preview: auto-point at a locally running core gateway.
    if (["localhost", "127.0.0.1"].includes(location.hostname)) return "http://localhost:9000";
    return null;
  }
  function setGateway(raw) {
    const value = normalizeGateway(raw);
    if (value) {
      sessionStorage.setItem(GW_STORE, value);
      localStorage.setItem(GW_STORE, value);
    }
    return value;
  }

  /* ---------- credential storage ---------- */
  function readStore(name) {
    return sessionStorage.getItem(name) || localStorage.getItem(name) || null;
  }
  function writeStore(name, value, remember) {
    sessionStorage.setItem(name, value);
    if (remember) localStorage.setItem(name, value);
    else localStorage.removeItem(name);
  }
  function readUnlock() { return readStore(UNLOCK_STORE); }
  function readApiKey() { return readStore(APIKEY_STORE); }
  function forgetAll() {
    for (const name of [UNLOCK_STORE, APIKEY_STORE]) {
      sessionStorage.removeItem(name);
      localStorage.removeItem(name);
    }
  }
  const cleanUnlock = (raw) => String(raw || "").replace(/\D/g, "").slice(0, 16);

  /**
   * Client-side guard: strictly block 16-digit unlock codes from ever being
   * sent in X-API-Key (even if pasted with spaces or hyphens).
   */
  function looksLikeUnlockCode(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return false;
    if (/^ae_/i.test(trimmed)) return false;
    const compact = trimmed.replace(/[\s-]+/g, "");
    if (/^\d{16}$/.test(compact)) return true;
    const currentUnlock = readUnlock();
    return Boolean(currentUnlock && compact === currentUnlock);
  }

  /* ---------- button label / markup preservation ---------- */
  function rememberButtonMarkup(btn) {
    if (btn && !btn.dataset.defaultHtml) {
      btn.dataset.defaultHtml = btn.innerHTML;
    }
  }
  function setButtonBusy(btn, busyText) {
    if (!btn) return;
    rememberButtonMarkup(btn);
    btn.disabled = true;
    if (busyText) btn.textContent = busyText;
  }
  function resetButton(btn, disabled = false) {
    if (!btn) return;
    rememberButtonMarkup(btn);
    btn.innerHTML = btn.dataset.defaultHtml;
    btn.disabled = disabled;
  }

  /* ---------- api ---------- */
  async function api(method, path, { body = null, apiKey = null, unlockCode = null } = {}) {
    const base = gateway();
    if (!base) throw new Error("No gateway configured. Set the Gateway URL field above.");
    const headers = {};
    if (apiKey) headers["X-API-Key"] = apiKey;
    if (unlockCode) headers["X-Unlock-Code"] = unlockCode;
    if (body) headers["Content-Type"] = "application/json";
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error(`Cannot reach the gateway (${e.message}). Check the URL and that CORS is allowed.`);
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    if (!res.ok) {
      const code = json?.error?.code || `HTTP_${res.status}`;
      const hint = json?.error?.hint ? ` — ${json.error.hint}` : "";
      throw new Error(`${code}${hint}`);
    }
    return json;
  }

  /* ---------- views / helpers ---------- */
  function show(id) {
    VIEWS.forEach((v) => { $(v).hidden = v !== id; });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function setMessage(el, text, kind) {
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("is-ok", kind === "ok");
    el.classList.toggle("is-err", kind === "err");
  }
  function clearMessage(el) { el.hidden = true; el.textContent = ""; }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function highlightJson(value) {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    const escaped = escapeHtml(text);
    return escaped.replace(
      /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:)|("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      (match, key, str, bool, num) => {
        if (key) return `<span class="j-key">${key.replace(/\s*:$/, "")}</span><span class="j-punc">:</span>`;
        if (str) return `<span class="j-str">${str}</span>`;
        if (bool) return `<span class="j-${bool === "null" ? "null" : "bool"}">${bool}</span>`;
        if (num) return `<span class="j-num">${num}</span>`;
        return match;
      }
    );
  }
  async function copy(text, btn) {
    let ok = false;
    const legacy = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        const done = document.execCommand("copy"); ta.remove(); return done;
      } catch { return false; }
    };
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = legacy(); }
    } else ok = legacy();
    if (btn) {
      const original = btn.dataset.original || btn.textContent;
      btn.dataset.original = original;
      btn.textContent = ok ? "Copied ✓" : "Select manually";
      setTimeout(() => { btn.textContent = original; }, 1500);
    }
    return ok;
  }
  function download(text, filename) {
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function formatInt(n) {
    const num = Number(n);
    return Number.isFinite(num) ? num.toLocaleString("en-US") : String(n ?? "—");
  }
  function updateQuotaDisplay(credits, rateLimitRemaining) {
    if (credits !== null && credits !== undefined && !Number.isNaN(Number(credits))) {
      const c = Number(credits);
      $("#creditsValue").textContent = String(c);
      const pct = Math.min(100, Math.round((c / 5000) * 100));
      $("#creditsBar").style.width = `${Math.max(2, pct)}%`;
    }
    if (rateLimitRemaining !== null && rateLimitRemaining !== undefined && rateLimitRemaining !== "") {
      $("#rateValue").textContent = `${rateLimitRemaining} / min`;
    }
  }

  /* ---------- intro ---------- */
  const createBtn = $("#createBtn");
  const unlockBtn = $("#unlockBtn");
  const enterBtn = $("#enterBtn");
  const apiKeyDoneBtn = $("#apiKeyDoneBtn");
  [createBtn, unlockBtn, enterBtn, apiKeyDoneBtn].forEach(rememberButtonMarkup);

  const gatewayInput = $("#gatewayInput");
  const introError = $("#introError");
  const unlockError = $("#unlockError");
  const rememberCheck = $("#rememberCheck");

  function syncGatewayField() {
    if (gatewayParam() === "none") {
      gatewayInput.value = "";
      $("#notLive").hidden = false;
      resetButton(createBtn, false);
      return;
    }
    const explicit =
      gatewayFromQuery() ||
      localStorage.getItem(GW_STORE) ||
      normalizeGateway(cfg.GATEWAY_URL);
    gatewayInput.value = explicit || "";
    // Honest banner: hide only when an actual gateway is reachable/configured.
    $("#notLive").hidden = Boolean(gateway());
    resetButton(createBtn, false);
  }

  let pendingUnlock = null;
  let pendingCredits = 50;
  let pendingApiKey = null;

  createBtn.addEventListener("click", async () => {
    const typed = gatewayInput.value.trim();
    const resolved = typed ? setGateway(typed) : gateway();
    if (!resolved) {
      setMessage(introError, "Enter a Gateway URL first (e.g. http://localhost:9000) to create an account. The hosted service is not launched yet — see the notice above.", "err");
      return;
    }
    setButtonBusy(createBtn, "Creating…");
    clearMessage(introError);
    try {
      const result = await api("POST", "/v1/signup");
      if (!result?.unlockCode) throw new Error("The gateway did not return an unlock code.");
      pendingUnlock = result.unlockCode;
      pendingCredits = result.credits ?? 50;
      $("#keyValue").textContent = String(pendingUnlock).replace(/(\d{4})(\d{4})(\d{4})(\d{4})/, "$1 $2 $3 $4");
      $("#keyCredits").textContent = String(pendingCredits);
      $("#savedCheck").checked = false;
      enterBtn.innerHTML = `Unlock my account${BTN_ARROW}`;
      enterBtn.disabled = true;
      clearMessage($("#enterError"));
      show("#viewKey");
    } catch (e) {
      setMessage(introError, e.message, "err");
    } finally {
      createBtn.innerHTML = `Create my account${BTN_ARROW}`;
      createBtn.disabled = false;
    }
  });

  unlockBtn.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const code = cleanUnlock($("#unlockInput").value);
    if (code.length !== 16) {
      setMessage(unlockError, "Enter the 16 digits of your unlock code.", "err");
      return;
    }
    const typed = gatewayInput.value.trim();
    if (!gateway() && typed) setGateway(typed);
    if (!gateway()) {
      setMessage(unlockError, "Enter a Gateway URL first.", "err");
      return;
    }
    setButtonBusy(btn, "Unlocking…");
    clearMessage(unlockError);
    try {
      await api("POST", "/v1/unlock", { unlockCode: code, body: { unlockCode: code } });
      writeStore(UNLOCK_STORE, code, rememberCheck.checked);
      sessionStorage.removeItem(APIKEY_STORE);
      localStorage.removeItem(APIKEY_STORE);
      $("#playApiKey").value = "";
      show("#viewDash");
      refreshDashboard();
    } catch (err) {
      setMessage(unlockError, err.message, "err");
    } finally {
      btn.innerHTML = `Unlock my account${BTN_ARROW}`;
      btn.disabled = false;
    }
  });

  /* ---------- unlock code reveal ---------- */
  $("#savedCheck").addEventListener("change", (e) => { enterBtn.disabled = !e.target.checked; });
  $("#copyKeyBtn").addEventListener("click", (e) => copy(pendingUnlock, e.currentTarget));
  $("#downloadKeyBtn").addEventListener("click", () => {
    if (!pendingUnlock) return;
    download(
      `API Everything — your 16-digit UNLOCK CODE\n\n${pendingUnlock}\n\n` +
      `This code OPENS your account (X-Unlock-Code). It is NOT an API key.\n` +
      `Save it: shown once, cannot be recovered.\n` +
      `Unlock your account to create rotatable API keys (X-API-Key).\n` +
      `Model: PayAsYouGo · No subscription · No expiry\n` +
      `Docs: https://github.com/apieverything/core\n`,
      "api-everything-unlock-code.txt"
    );
  });
  enterBtn.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (!pendingUnlock) { show("#viewIntro"); return; }
    setButtonBusy(btn, "Creating key…");
    clearMessage($("#enterError"));
    try {
      writeStore(UNLOCK_STORE, pendingUnlock, rememberCheck.checked);
      const created = await api("POST", "/v1/keys", { unlockCode: pendingUnlock, body: { name: "first" } });
      if (!created?.apiKey) throw new Error("The gateway did not return an API key.");
      writeStore(APIKEY_STORE, created.apiKey, rememberCheck.checked);
      revealApiKey(created.apiKey, "first key");
    } catch (err) {
      setMessage($("#enterError"), `Could not create your first API key: ${err.message}`, "err");
    } finally {
      btn.innerHTML = `Unlock my account${BTN_ARROW}`;
      btn.disabled = !$("#savedCheck").checked;
    }
  });

  /* ---------- API key reveal ---------- */
  function revealApiKey(raw, reason) {
    pendingApiKey = raw;
    $("#apiKeyValue").textContent = raw;
    $("#apiKeyReason").textContent = `· ${reason}`;
    $("#apiKeySaved").checked = false;
    apiKeyDoneBtn.innerHTML = `Go to dashboard${BTN_ARROW}`;
    apiKeyDoneBtn.disabled = true;
    show("#viewApiKey");
  }
  $("#apiKeySaved").addEventListener("change", (e) => { apiKeyDoneBtn.disabled = !e.target.checked; });
  $("#copyApiKeyBtn").addEventListener("click", (e) => copy(pendingApiKey, e.currentTarget));
  $("#downloadApiKeyBtn").addEventListener("click", () => {
    if (!pendingApiKey) return;
    download(
      `API Everything — your API key\n\n${pendingApiKey}\n\n` +
      `Use it in the X-API-Key header. Shown once.\n` +
      `Create / reset / revoke keys from your dashboard without losing credits.\n` +
      `Your 16-digit unlock code is different — never send it as X-API-Key.\n` +
      `Docs: https://github.com/apieverything/core\n`,
      "api-everything-api-key.txt"
    );
  });
  apiKeyDoneBtn.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    setButtonBusy(btn, "Opening…");
    try {
      $("#playApiKey").value = readApiKey() || "";
      show("#viewDash");
      await refreshDashboard();
    } finally {
      btn.innerHTML = `Go to dashboard${BTN_ARROW}`;
      btn.disabled = !$("#apiKeySaved").checked;
    }
  });

  /* ---------- Live API Playground ---------- */
  const playPreset = $("#playPreset");
  const playPath = $("#playPath");
  const playApiKey = $("#playApiKey");
  const playKeyHint = $("#playKeyHint");
  const playNoCache = $("#playNoCache");
  const playSendBtn = $("#playSendBtn");
  const playError = $("#playError");
  const playStatusPill = $("#playStatusPill");
  const playCachePill = $("#playCachePill");
  const playCostPill = $("#playCostPill");
  const playLatency = $("#playLatency");
  const playOutput = $("#playOutput");
  const playCopyBtn = $("#playCopyBtn");
  const playReqLine = $("#playReqLine");
  const playMetaFoot = $("#playMetaFoot");
  rememberButtonMarkup(playSendBtn);

  let lastPlayRawText = playOutput.textContent;

  function syncPlaygroundKey(forceFromStore = false) {
    const storedKey = readApiKey();
    if (forceFromStore && storedKey) {
      playApiKey.value = storedKey;
    } else if (!playApiKey.value.trim() && storedKey) {
      playApiKey.value = storedKey;
    }
    updatePlaygroundKeyHint();
  }

  function updatePlaygroundKeyHint() {
    const typed = playApiKey.value.trim();
    playKeyHint.classList.remove("is-warn", "is-err", "is-ok");
    if (looksLikeUnlockCode(typed)) {
      playKeyHint.textContent = "Blocked: this looks like a 16-digit account unlock code. Never use it as X-API-Key — paste or mint an ae_… key.";
      playKeyHint.classList.add("is-err");
      return;
    }
    if (typed) {
      playKeyHint.textContent = "Ready — sent in X-API-Key to your configured gateway.";
      playKeyHint.classList.add("is-ok");
      return;
    }
    if (readUnlock() && !readApiKey()) {
      playKeyHint.textContent = "Unlocked an existing account? Raw API keys are shown once — paste an ae_… key here or click “New API key” above.";
      playKeyHint.classList.add("is-warn");
      return;
    }
    playKeyHint.textContent = "Paste an ae_… API key or create one in API KEYS above.";
  }

  playPreset.addEventListener("change", () => {
    playPath.value = playPreset.value;
    playReqLine.textContent = `GET ${playPath.value}`;
    clearMessage(playError);
  });

  playPath.addEventListener("input", () => {
    const val = playPath.value.trim();
    playReqLine.textContent = `GET ${val || "/"}`;
    const matching = $$("option", playPreset).find((o) => o.value === val);
    if (matching) playPreset.value = val;
  });

  playApiKey.addEventListener("input", () => {
    updatePlaygroundKeyHint();
    if (!looksLikeUnlockCode(playApiKey.value)) clearMessage(playError);
  });

  function setPill(el, text, tone) {
    el.textContent = text;
    el.className = "pill" + (tone ? ` pill--${tone}` : "");
  }

  playSendBtn.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    clearMessage(playError);
    const base = gateway();
    if (!base) {
      setMessage(playError, "No gateway configured. Return to setup or pass ?gateway=http://localhost:9000.", "err");
      return;
    }

    let path = playPath.value.trim();
    if (!path) {
      setMessage(playError, "Enter an API route path (e.g. /v1/youtube/@mkbhd/posts?limit=2).", "err");
      return;
    }
    if (/^https?:\/\//i.test(path)) {
      setMessage(playError, "Enter a relative path starting with /v1/… rather than a full URL.", "err");
      return;
    }
    if (!path.startsWith("/")) path = `/${path}`;
    playPath.value = path;
    playReqLine.textContent = `GET ${path}`;

    const candidateKey = (playApiKey.value.trim() || readApiKey() || "").trim();
    if (looksLikeUnlockCode(candidateKey)) {
      setPill(playStatusPill, "BLOCKED", "err");
      updatePlaygroundKeyHint();
      setMessage(
        playError,
        "Refusing to send a 16-digit unlock code in X-API-Key. Paste or create a rotatable ae_… API key instead.",
        "err"
      );
      return;
    }
    if (!candidateKey) {
      setPill(playStatusPill, "NO API KEY", "warn");
      updatePlaygroundKeyHint();
      setMessage(
        playError,
        "Paste your ae_… API key above (or click “New API key” in the API KEYS panel) to send a request.",
        "err"
      );
      return;
    }

    const headers = { "X-API-Key": candidateKey };
    if (playNoCache.checked) headers["Cache-Control"] = "no-cache";

    setButtonBusy(btn, "Sending…");
    const t0 = performance.now();
    try {
      const res = await fetch(base + path, { method: "GET", headers });
      const elapsed = Math.max(1, Math.round(performance.now() - t0));
      const rawText = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(rawText); } catch { /* plain text */ }

      const statusWord = res.statusText || STATUS_LABELS[res.status] || (res.ok ? "OK" : "ERROR");
      setPill(playStatusPill, `${res.status} ${statusWord}`, res.ok ? "ok" : "err");
      playLatency.textContent = `${elapsed} ms`;

      const xCache = (res.headers.get("x-cache") || "").toUpperCase();
      if (xCache) {
        const cacheTone = xCache === "HIT" || xCache === "COALESCED"
          ? "hit"
          : xCache === "BYPASS" ? "warn" : "ok";
        setPill(playCachePill, xCache, cacheTone);
      } else {
        setPill(playCachePill, "DIRECT", "");
      }

      const rawCost = res.headers.get("x-credits-cost");
      const rawCharged = res.headers.get("x-charged");
      const costNum = rawCost !== null && rawCost !== "" ? Number(rawCost) : null;
      let chargedNum = 0;
      if (rawCharged !== null && rawCharged !== "") {
        if (rawCharged === "true") chargedNum = costNum ?? 0;
        else if (rawCharged === "false") chargedNum = 0;
        else chargedNum = Number(rawCharged) || 0;
      } else if (res.ok && costNum) {
        chargedNum = costNum;
      }

      if (chargedNum > 0) {
        setPill(playCostPill, `-${chargedNum} cr`, "warn");
      } else {
        setPill(playCostPill, "0 cr · uncharged", "ok");
      }

      const remCredits = res.headers.get("x-credits-remaining");
      const remRate = res.headers.get("x-ratelimit-remaining");
      if (remCredits !== null && remCredits !== "") {
        updateQuotaDisplay(Number(remCredits), remRate);
      } else if (path.startsWith("/v1/usage") && parsed && typeof parsed.credits === "number") {
        updateQuotaDisplay(parsed.credits, parsed.rateLimitRemaining);
      }

      const footParts = [];
      if (remCredits !== null && remCredits !== "") footParts.push(`${remCredits} cr remaining`);
      if (remRate !== null && remRate !== "") footParts.push(`${remRate}/min left`);
      if (playNoCache.checked) footParts.push("no-cache");
      playMetaFoot.textContent = footParts.join(" · ") || "accounting headers synced";

      if (parsed !== null) {
        lastPlayRawText = JSON.stringify(parsed, null, 2);
        playOutput.innerHTML = highlightJson(parsed);
      } else {
        lastPlayRawText = rawText;
        playOutput.textContent = rawText || "(empty response body)";
      }
    } catch (err) {
      setPill(playStatusPill, "NETWORK ERR", "err");
      setMessage(playError, `Request failed (${err.message}). Verify the gateway is running and exposes CORS.`, "err");
    } finally {
      resetButton(btn, false);
    }
  });

  playCopyBtn.addEventListener("click", (e) => copy(lastPlayRawText, e.currentTarget));

  /* ---------- PayAsYouGo Credit Packs & Sandbox Checkout ---------- */
  const packsBox = $("#packsBox");
  const noPaymentNotice = $("#noPaymentNotice");
  const packsModeBadge = $("#packsModeBadge");
  const packsGrid = $("#packsGrid");
  const buyPackBtn = $("#buyPackBtn");
  const invoiceBox = $("#invoiceBox");
  rememberButtonMarkup(buyPackBtn);

  let currentPacks = [];
  let currentPaymentMode = "disabled";
  let selectedPackId = null;
  let activeInvoice = null;

  function renderPackCards() {
    if (!currentPacks.length) {
      packsGrid.innerHTML = "";
      return;
    }
    if (!selectedPackId || !currentPacks.some((p) => p.id === selectedPackId)) {
      selectedPackId = currentPacks[0].id;
    }
    packsGrid.innerHTML = currentPacks.map((p) => {
      const selected = p.id === selectedPackId;
      const deal = `${formatInt(p.credits)} cr · $${p.priceUsd}`;
      return `
        <button type="button" class="packcard ${selected ? "is-selected" : ""}" role="radio" aria-checked="${selected}" data-pack-id="${escapeHtml(p.id)}">
          <span class="packcard__name">${escapeHtml(p.name || "Pack")}</span>
          <span class="packcard__deal">${escapeHtml(deal)}</span>
          <span class="packcard__meta">one-time · never expires</span>
        </button>`;
    }).join("");
  }

  packsGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".packcard[data-pack-id]");
    if (!card) return;
    selectedPackId = card.dataset.packId;
    renderPackCards();
  });

  function renderInvoice() {
    if (!activeInvoice) {
      invoiceBox.hidden = true;
      invoiceBox.innerHTML = "";
      return;
    }
    invoiceBox.hidden = false;
    const inv = activeInvoice;
    const packLabel = inv.pack
      ? `${formatInt(inv.pack.credits)} cr · $${inv.pack.priceUsd} USD`
      : `${formatInt(inv.credits || 0)} cr`;
    const settled = inv.status === "settled" || inv.redeemed;
    const pillTone = settled ? "ok" : "warn";
    const pillText = inv.redeemed ? "SETTLED & REDEEMED" : String(inv.status || "pending").toUpperCase();

    let actionsHtml = "";
    if (!settled && inv.mode === "sandbox") {
      actionsHtml = `
        <div class="invoicebox__actions">
          <button class="btn btn--line btn--block" id="settleSandboxBtn" type="button">Simulate crypto settlement (local)</button>
        </div>`;
    } else if (!settled && inv.mode === "btcpay") {
      const safeCheckout = /^https?:\/\//i.test(String(inv.checkoutUrl || "")) ? inv.checkoutUrl : "";
      actionsHtml = `
        <div class="invoicebox__actions">
          ${safeCheckout ? `<a class="btn btn--primary btn--block" href="${escapeHtml(safeCheckout)}" target="_blank" rel="noopener noreferrer">Open crypto checkout <span aria-hidden="true">↗</span></a>` : ""}
          <button class="btn btn--line btn--block" id="checkInvoiceBtn" type="button">Check payment status</button>
        </div>`;
    }

    invoiceBox.innerHTML = `
      <div class="invoicebox__top">
        <span class="invoicebox__id">${escapeHtml(inv.invoiceId)}</span>
        <span class="pill pill--${pillTone}">${escapeHtml(pillText)}</span>
      </div>
      <p class="invoicebox__desc">${escapeHtml(packLabel)} · zero account metadata stored on invoice.</p>
      ${actionsHtml}`;
  }

  async function autoRedeemVoucher(voucherCode, fallbackCredits) {
    const unlockCode = readUnlock();
    if (!unlockCode) throw new Error("Unlock code missing from session — unlock your account to redeem.");
    const redeemed = await api("POST", "/v1/redeem", { body: { code: voucherCode, unlockCode } });
    const added = redeemed?.added ?? fallbackCredits ?? 0;
    activeInvoice = { ...activeInvoice, status: "settled", voucherCode, redeemed: true };
    renderInvoice();
    setMessage(
      $("#redeemMsg"),
      `Settled & redeemed +${formatInt(added)} cr. You now have ${formatInt(redeemed.credits)} credits.`,
      "ok"
    );
    updateQuotaDisplay(redeemed.credits, null);
    await refreshUsageAndStatusOnly();
  }

  buyPackBtn.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (!selectedPackId) return;
    setButtonBusy(btn, "Creating invoice…");
    clearMessage($("#redeemMsg"));
    try {
      const inv = await api("POST", "/v1/payments/checkout", { body: { packId: selectedPackId } });
      activeInvoice = { ...inv, mode: inv.mode || currentPaymentMode, redeemed: false };
      renderInvoice();
    } catch (err) {
      setMessage($("#redeemMsg"), err.message, "err");
    } finally {
      resetButton(btn, false);
    }
  });

  invoiceBox.addEventListener("click", async (e) => {
    const settleBtn = e.target.closest("#settleSandboxBtn");
    const checkBtn = e.target.closest("#checkInvoiceBtn");
    if (!settleBtn && !checkBtn) return;
    if (!activeInvoice?.invoiceId) return;

    const btn = settleBtn || checkBtn;
    setButtonBusy(btn, settleBtn ? "Settling & redeeming…" : "Checking…");
    clearMessage($("#redeemMsg"));
    try {
      if (settleBtn) {
        const settled = await api("POST", `/v1/payments/sandbox/${encodeURIComponent(activeInvoice.invoiceId)}/settle`, { body: {} });
        if (!settled?.voucherCode) throw new Error("Sandbox settlement did not return a voucher code.");
        await autoRedeemVoucher(settled.voucherCode, settled.credits || activeInvoice.pack?.credits);
      } else {
        const latest = await api("GET", `/v1/payments/invoices/${encodeURIComponent(activeInvoice.invoiceId)}`);
        activeInvoice = { ...activeInvoice, ...latest };
        if (latest?.voucherCode) {
          await autoRedeemVoucher(latest.voucherCode, latest.pack?.credits);
        } else {
          renderInvoice();
          setMessage($("#redeemMsg"), `Invoice status: ${latest?.status || "pending"}. Complete payment, then check again.`, "ok");
        }
      }
    } catch (err) {
      setMessage($("#redeemMsg"), err.message, "err");
      if (btn.isConnected) resetButton(btn, false);
    }
  });

  async function probePaymentPacks() {
    try {
      const info = await api("GET", "/v1/payments/packs");
      if (info && info.enabled === true && Array.isArray(info.packs) && info.packs.length > 0) {
        currentPaymentMode = info.mode || "sandbox";
        currentPacks = info.packs;
        packsModeBadge.textContent = currentPaymentMode === "sandbox" ? "SANDBOX · PAY AS YOU GO" : "CRYPTO · PAY AS YOU GO";
        noPaymentNotice.hidden = true;
        packsBox.hidden = false;
        renderPackCards();
        renderInvoice();
        return;
      }
    } catch {
      /* Gateway unreachable or payments route absent: show honest fallback */
    }
    currentPaymentMode = "disabled";
    currentPacks = [];
    packsBox.hidden = true;
    noPaymentNotice.hidden = false;
  }

  /* ---------- dashboard ---------- */
  function renderKeys(keys) {
    const list = $("#keysList");
    if (!keys.length) {
      list.innerHTML = '<p class="muted">No API keys yet. Create one to start calling the APIs.</p>';
      return;
    }
    list.innerHTML = keys.map((k) => {
      const created = k.createdAt ? new Date(k.createdAt).toLocaleDateString() : "—";
      const used = k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "never";
      const state = k.revoked ? "revoked" : "active";
      return `
        <div class="keysrow">
          <span class="keysrow__dot ${k.revoked ? "is-revoked" : ""}" aria-hidden="true"></span>
          <div class="keysrow__main">
            <span class="keysrow__name">${escapeHtml(k.name)} · ${state}</span>
            <span class="keysrow__meta">${escapeHtml(k.hint)} · created ${escapeHtml(created)} · used ${escapeHtml(used)}</span>
          </div>
          <div class="keysrow__actions">
            ${k.revoked ? "" : `<button class="btn btn--ghost" type="button" data-action="reset" data-id="${escapeHtml(k.keyId)}">Reset</button>`}
            ${k.revoked ? "" : `<button class="btn btn--ghost" type="button" data-action="revoke" data-id="${escapeHtml(k.keyId)}">Revoke</button>`}
          </div>
        </div>`;
    }).join("");
  }

  async function refreshUsageAndStatusOnly() {
    const unlockCode = readUnlock();
    if (!unlockCode) return;
    const auth = { unlockCode };
    try {
      const usage = await api("GET", "/v1/usage", auth);
      updateQuotaDisplay(usage?.credits ?? 0, usage?.rateLimitRemaining ?? "—");
      $("#activeKeysValue").textContent = String(usage?.activeApiKeys ?? 0);
      $("#accountValue").textContent = String(usage?.accountHash ?? "").slice(0, 8) || "—";
      const base = gateway();
      $("#usageCurl").textContent = `"${base}/v1/instagram/kametolol/posts?limit=12"`;
      $("#usageCurl2").textContent = `"${base}/v1/usage"`;
      const shownKey = readApiKey() || "ae_YOUR_API_KEY";
      $("#usageKey").textContent = shownKey;
      $("#usageKey2").textContent = shownKey;
    } catch (e) {
      $("#creditsValue").textContent = "—";
      setMessage($("#redeemMsg"), `Cannot read usage: ${e.message}`, "err");
    }
  }

  async function refreshDashboard() {
    const unlockCode = readUnlock();
    if (!unlockCode) { show("#viewIntro"); return; }
    const auth = { unlockCode };
    $("#maskedUnlock").textContent = `•••• •••• •••• ${unlockCode.slice(-4)}`;
    $("#creditsValue").textContent = "—";
    $("#statusList").innerHTML = '<p class="muted">Checking…</p>';
    syncPlaygroundKey(false);

    await Promise.all([
      refreshUsageAndStatusOnly(),
      (async () => {
        try {
          const out = await api("GET", "/v1/keys", auth);
          renderKeys(out?.keys || []);
        } catch (e) {
          $("#keysList").innerHTML = `<p class="muted">Keys unavailable — ${escapeHtml(e.message)}</p>`;
        }
      })(),
      (async () => {
        try {
          const status = await api("GET", "/v1/status");
          const rows = (status?.services || []).map((s) => `
            <div class="statusrow">
              <span class="statusrow__dot ${s.ok ? "is-ok" : "is-down"}"></span>
              <span class="statusrow__name">${escapeHtml(s.service)}</span>
              <span class="statusrow__meta">${s.ok ? `${s.latencyMs} ms · 200` : "unavailable"}</span>
            </div>`).join("");
          $("#statusList").innerHTML = rows || '<p class="muted">No connectors configured.</p>';
          $("#statusTime").textContent = `Checked ${new Date(status.checkedAt).toLocaleTimeString()} · ${status.healthy}/${status.total} healthy · ${status.cached ? "cached" : "live"}`;
        } catch (e) {
          $("#statusList").innerHTML = `<p class="muted">Status unavailable — ${escapeHtml(e.message)}</p>`;
        }
      })(),
      probePaymentPacks(),
    ]);
  }

  $("#refreshBtn").addEventListener("click", refreshDashboard);
  $("#forgetBtn").addEventListener("click", () => {
    forgetAll();
    activeInvoice = null;
    playApiKey.value = "";
    renderInvoice();
    show("#viewIntro");
    syncGatewayField();
  });

  async function createOrReset(path, body, reason) {
    const unlockCode = readUnlock();
    if (!unlockCode) { show("#viewIntro"); return; }
    try {
      const out = await api("POST", path, { unlockCode, body: body || {} });
      if (!out?.apiKey) throw new Error("The gateway did not return an API key.");
      writeStore(APIKEY_STORE, out.apiKey, rememberCheck.checked);
      playApiKey.value = out.apiKey;
      revealApiKey(out.apiKey, reason);
    } catch (e) {
      setMessage($("#keysMsg"), e.message, "err");
    }
  }
  $("#newKeyBtn").addEventListener("click", (e) => {
    const btn = e.currentTarget; // capture: currentTarget is null after the async handler returns
    btn.disabled = true;
    clearMessage($("#keysMsg"));
    createOrReset("/v1/keys", { name: "dashboard" }, "new key").finally(() => { btn.disabled = false; });
  });
  $("#resetAllBtn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    clearMessage($("#keysMsg"));
    createOrReset("/v1/keys/reset", null, "all keys reset").finally(() => { btn.disabled = false; });
  });
  $("#keysList").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const unlockCode = readUnlock();
    const id = btn.dataset.id;
    btn.disabled = true;
    clearMessage($("#keysMsg"));
    try {
      if (btn.dataset.action === "reset") {
        const out = await api("POST", `/v1/keys/${id}/reset`, { unlockCode, body: {} });
        writeStore(APIKEY_STORE, out.apiKey, rememberCheck.checked);
        playApiKey.value = out.apiKey;
        revealApiKey(out.apiKey, "rotated key");
      } else {
        await api("DELETE", `/v1/keys/${id}`, { unlockCode });
        setMessage($("#keysMsg"), "API key revoked. It can no longer call the APIs.", "ok");
        await refreshDashboard();
      }
    } catch (err) {
      setMessage($("#keysMsg"), err.message, "err");
      btn.disabled = false;
    }
  });

  $("#redeemBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const code = $("#voucherInput").value.trim();
    const unlockCode = readUnlock();
    if (!code || !unlockCode) {
      setMessage($("#redeemMsg"), "Paste a voucher code and make sure your unlock code is still in this browser.", "err");
      return;
    }
    btn.disabled = true;
    try {
      const out = await api("POST", "/v1/redeem", { body: { code, unlockCode } });
      setMessage($("#redeemMsg"), `Added. You now have ${out.credits} credits.`, "ok");
      $("#voucherInput").value = "";
      await refreshDashboard();
    } catch (err) {
      setMessage($("#redeemMsg"), err.message, "err");
    } finally {
      btn.disabled = false;
    }
  });

  $("#copyCurlBtn").addEventListener("click", (e) => {
    const key = readApiKey() || "ae_YOUR_API_KEY";
    const base = gateway() || "https://your-gateway";
    copy(`curl "${base}/v1/instagram/kametolol/posts?limit=12" -H "X-API-Key: ${key}"`, e.currentTarget);
  });

  /* ---------- costs table ---------- */
  const costs = cfg.COSTS || [
    ["Instagram / TikTok posts", 3],
    ["YouTube videos / search / transcript", 2],
    ["LinkedIn aggregate signals", 2],
    ["LinkedIn people (blocked)", 5],
    ["Profile / job / company metadata", 1],
  ];
  $("#costsBody").innerHTML = costs.map(([name, cost]) =>
    `<tr><td>${escapeHtml(name)}</td><td>${cost} cr</td></tr>`
  ).join("");

  /* ---------- boot ---------- */
  $("#year").textContent = String(new Date().getFullYear());
  syncGatewayField();
  if (readUnlock()) {
    show("#viewDash");
    refreshDashboard();
  } else {
    show("#viewIntro");
  }
})();
