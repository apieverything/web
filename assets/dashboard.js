/* API Everything — dashboard. No dependencies, no analytics, no third parties.
   Two credentials, never mixed:
     - 16-digit unlock code  -> X-Unlock-Code (opens the account, never an API key)
     - ae_… API key          -> X-API-Key    (what your code actually uses)
   Both stay in the browser; the gateway stores only their hashes. */
(() => {
  "use strict";

  const cfg = window.AE_CONFIG || {};
  const $ = (s) => document.querySelector(s);

  const UNLOCK_STORE = "ae_unlock";
  const APIKEY_STORE = "ae_api_key";
  const GW_STORE = "ae_gateway";

  const VIEWS = ["#viewIntro", "#viewKey", "#viewApiKey", "#viewDash"];

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

  /* ---------- intro ---------- */
  const createBtn = $("#createBtn");
  const gatewayInput = $("#gatewayInput");
  const introError = $("#introError");
  const unlockError = $("#unlockError");
  const rememberCheck = $("#rememberCheck");

  function syncGatewayField() {
    if (gatewayParam() === "none") {
      gatewayInput.value = "";
      $("#notLive").hidden = false;
      createBtn.disabled = false;
      return;
    }
    const explicit =
      gatewayFromQuery() ||
      localStorage.getItem(GW_STORE) ||
      normalizeGateway(cfg.GATEWAY_URL);
    gatewayInput.value = explicit || "";
    // Honest banner: hide only when an actual gateway is reachable/configured.
    $("#notLive").hidden = Boolean(gateway());
    createBtn.disabled = false;
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
    createBtn.disabled = true;
    createBtn.textContent = "Creating…";
    clearMessage(introError);
    try {
      const result = await api("POST", "/v1/signup");
      if (!result?.unlockCode) throw new Error("The gateway did not return an unlock code.");
      pendingUnlock = result.unlockCode;
      pendingCredits = result.credits ?? 50;
      $("#keyValue").textContent = String(pendingUnlock).replace(/(\d{4})(\d{4})(\d{4})(\d{4})/, "$1 $2 $3 $4");
      $("#keyCredits").textContent = String(pendingCredits);
      $("#savedCheck").checked = false;
      $("#enterBtn").disabled = true;
      clearMessage($("#enterError"));
      show("#viewKey");
    } catch (e) {
      setMessage(introError, e.message, "err");
    } finally {
      createBtn.disabled = false;
      createBtn.innerHTML = 'Create my account <span aria-hidden="true">↗</span>';
    }
  });

  $("#unlockBtn").addEventListener("click", async (e) => {
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
    btn.disabled = true;
    clearMessage(unlockError);
    try {
      await api("POST", "/v1/unlock", { unlockCode: code, body: { unlockCode: code } });
      writeStore(UNLOCK_STORE, code, rememberCheck.checked);
      sessionStorage.removeItem(APIKEY_STORE);
      localStorage.removeItem(APIKEY_STORE);
      show("#viewDash");
      refreshDashboard();
    } catch (err) {
      setMessage(unlockError, err.message, "err");
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------- unlock code reveal ---------- */
  $("#savedCheck").addEventListener("change", (e) => { $("#enterBtn").disabled = !e.target.checked; });
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
  $("#enterBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (!pendingUnlock) { show("#viewIntro"); return; }
    btn.disabled = true;
    clearMessage($("#enterError"));
    try {
      writeStore(UNLOCK_STORE, pendingUnlock, rememberCheck.checked);
      const created = await api("POST", "/v1/keys", { unlockCode: pendingUnlock, body: { name: "first" } });
      if (!created?.apiKey) throw new Error("The gateway did not return an API key.");
      writeStore(APIKEY_STORE, created.apiKey, rememberCheck.checked);
      revealApiKey(created.apiKey, "first key");
    } catch (err) {
      setMessage($("#enterError"), `Could not create your first API key: ${err.message}`, "err");
      btn.disabled = false;
    }
  });

  /* ---------- API key reveal ---------- */
  function revealApiKey(raw, reason) {
    pendingApiKey = raw;
    $("#apiKeyValue").textContent = raw;
    $("#apiKeyReason").textContent = `· ${reason}`;
    $("#apiKeySaved").checked = false;
    $("#apiKeyDoneBtn").disabled = true;
    show("#viewApiKey");
  }
  $("#apiKeySaved").addEventListener("change", (e) => { $("#apiKeyDoneBtn").disabled = !e.target.checked; });
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
  $("#apiKeyDoneBtn").addEventListener("click", () => {
    show("#viewDash");
    refreshDashboard();
  });

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

  async function refreshDashboard() {
    const unlockCode = readUnlock();
    if (!unlockCode) { show("#viewIntro"); return; }
    const auth = { unlockCode };
    $("#maskedUnlock").textContent = `•••• •••• •••• ${unlockCode.slice(-4)}`;
    $("#creditsValue").textContent = "—";
    $("#statusList").innerHTML = '<p class="muted">Checking…</p>';

    try {
      const usage = await api("GET", "/v1/usage", auth);
      const credits = usage?.credits ?? 0;
      $("#creditsValue").textContent = String(credits);
      const pct = Math.min(100, Math.round((credits / 5000) * 100));
      $("#creditsBar").style.width = `${Math.max(2, pct)}%`;
      $("#rateValue").textContent = `${usage?.rateLimitRemaining ?? "—"} / min`;
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

    try {
      const out = await api("GET", "/v1/keys", auth);
      renderKeys(out?.keys || []);
    } catch (e) {
      $("#keysList").innerHTML = `<p class="muted">Keys unavailable — ${escapeHtml(e.message)}</p>`;
    }

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
  }

  $("#refreshBtn").addEventListener("click", refreshDashboard);
  $("#forgetBtn").addEventListener("click", () => {
    forgetAll();
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
