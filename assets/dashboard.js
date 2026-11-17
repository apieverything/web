/* API Everything — dashboard. No dependencies, no analytics, no third parties.
   The key never leaves the browser except in the X-API-Key header. */
(() => {
  "use strict";

  const cfg = window.AE_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const KEY_STORE = "ae_key";
  const GW_STORE = "ae_gateway";

  function safeParse(json, fallback) {
    try { return JSON.parse(json) ?? fallback; } catch { return fallback; }
  }

  /* ---------- gateway resolution ---------- */
  function gatewayParam() {
    return new URLSearchParams(location.search).get("gateway");
  }
  function gatewayFromQuery() {
    const raw = gatewayParam();
    if (!raw || raw === "none") return null;
    return normalizeGateway(raw);
  }
  function normalizeGateway(raw) {
    let value = String(raw || "").trim().replace(/\/$/, "");
    if (!value) return null;
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    // Only http(s), no credentials embedded in the URL.
    if (!/^https?:\/\/[^@\s]+$/i.test(value)) return null;
    return value;
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

  /* ---------- key storage ---------- */
  function readKey() {
    return sessionStorage.getItem(KEY_STORE) || localStorage.getItem(KEY_STORE) || null;
  }
  function storeKey(key, remember) {
    sessionStorage.setItem(KEY_STORE, key);
    if (remember) localStorage.setItem(KEY_STORE, key);
    else localStorage.removeItem(KEY_STORE);
  }
  function forgetKey() {
    sessionStorage.removeItem(KEY_STORE);
    localStorage.removeItem(KEY_STORE);
  }

  /* ---------- api ---------- */
  async function api(method, path, { body = null, key = null } = {}) {
    const base = gateway();
    if (!base) throw new Error("No gateway configured. Set the Gateway URL field above.");
    const headers = {};
    if (key) headers["X-API-Key"] = key;
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

  /* ---------- views ---------- */
  function show(id) {
    ["#viewIntro", "#viewKey", "#viewDash"].forEach((v) => { $(v).hidden = v !== id; });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function setMessage(el, text, kind) {
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("is-ok", kind === "ok");
    el.classList.toggle("is-err", kind === "err");
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

  /* ---------- intro ---------- */
  const createBtn = $("#createBtn");
  const gatewayInput = $("#gatewayInput");
  const introError = $("#introError");
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
    // Honest banner: hide only when an actual gateway is reachable/configured
    // (including the auto-detected local one), never on the public site.
    $("#notLive").hidden = Boolean(gateway());
    createBtn.disabled = false;
  }

  createBtn.addEventListener("click", async () => {
    const typed = gatewayInput.value.trim();
    const resolved = typed ? setGateway(typed) : gateway();
    if (!resolved) {
      setMessage(introError, "Enter a Gateway URL first (e.g. http://localhost:9000) to create a key. The hosted service is not launched yet — see the notice above.", "err");
      return;
    }
    createBtn.disabled = true;
    createBtn.textContent = "Creating…";
    introError.hidden = true;
    try {
      const result = await api("POST", "/v1/signup");
      if (!result?.key) throw new Error("The gateway did not return a key.");
      currentKey = result.key;
      pendingCredits = result.credits ?? 50;
      $("#keyValue").textContent = String(result.key).replace(/(\d{4})(\d{4})(\d{4})(\d{4})/, "$1 $2 $3 $4");
      $("#keyCredits").textContent = String(pendingCredits);
      $("#savedCheck").checked = false;
      $("#enterBtn").disabled = true;
      show("#viewKey");
    } catch (e) {
      setMessage(introError, e.message, "err");
    } finally {
      createBtn.disabled = false;
      createBtn.innerHTML = 'Create my key <span aria-hidden="true">↗</span>';
    }
  });

  /* ---------- key reveal ---------- */
  let currentKey = null;
  let pendingCredits = 50;

  $("#savedCheck").addEventListener("change", (e) => { $("#enterBtn").disabled = !e.target.checked; });
  $("#copyKeyBtn").addEventListener("click", (e) => copy(currentKey, e.currentTarget));
  $("#downloadKeyBtn").addEventListener("click", () => {
    if (!currentKey) return;
    const blob = new Blob([
      `API Everything — your API key\n\n${currentKey}\n\nSave this file. This key is shown once and cannot be recovered.\nModel: PayAsYouGo · No subscription · No expiry\nDocs: https://github.com/apieverything/core\n`,
    ], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "api-everything-key.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#enterBtn").addEventListener("click", () => {
    storeKey(currentKey, rememberCheck.checked);
    show("#viewDash");
    refreshDashboard();
  });

  /* ---------- dashboard ---------- */
  async function refreshDashboard() {
    const key = readKey();
    if (!key) { show("#viewIntro"); return; }
    $("#maskedKey").textContent = `•••• •••• •••• ${key.slice(-4)}`;
    $("#creditsValue").textContent = "—";
    $("#statusList").innerHTML = '<p class="muted">Checking…</p>';

    try {
      const usage = await api("GET", "/v1/usage", { key });
      const credits = usage?.credits ?? 0;
      $("#creditsValue").textContent = String(credits);
      const pct = Math.min(100, Math.round((credits / 5000) * 100));
      $("#creditsBar").style.width = `${Math.max(2, pct)}%`;
      $("#rateValue").textContent = `${usage?.rateLimitRemaining ?? "—"} / min`;
      const base = gateway();
      $("#usageCurl").textContent = `"${base}/v1/instagram/kametolol/posts?limit=12"`;
    } catch (e) {
      $("#creditsValue").textContent = "—";
      setMessage($("#redeemMsg"), `Cannot read usage: ${e.message}`, "err");
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

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  $("#refreshBtn").addEventListener("click", refreshDashboard);
  $("#forgetBtn").addEventListener("click", () => {
    forgetKey();
    show("#viewIntro");
    syncGatewayField();
  });

  $("#redeemBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const code = $("#voucherInput").value.trim();
    const key = readKey();
    if (!code || !key) {
      setMessage($("#redeemMsg"), "Paste a voucher code and make sure your key is still in this browser.", "err");
      return;
    }
    btn.disabled = true;
    try {
      const out = await api("POST", "/v1/redeem", { body: { code, key } });
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
    const key = readKey() || "YOUR_KEY";
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
  if (readKey()) {
    pendingCredits = 50;
    show("#viewDash");
    refreshDashboard();
  } else {
    show("#viewIntro");
  }
})();
