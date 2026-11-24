#!/usr/bin/env node
/**
 * Offline integrity check for the static site. No dependencies, no network.
 *   node scripts/check.js
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

/* 1. JavaScript syntax */
for (const file of fs.readdirSync(path.join(ROOT, "assets")).filter((f) => f.endsWith(".js"))) {
  const full = path.join(ROOT, "assets", file);
  try {
    cp.execFileSync(process.execPath, ["--check", full], { stdio: "pipe" });
    console.log(`  ✓ ${file} syntax`);
  } catch (e) {
    errors.push(`assets/${file}: ${String(e.stderr || e.message).slice(0, 200)}`);
  }
}

/* 2. Every local asset referenced by the HTML pages exists, and zero external requests */
for (const page of ["index.html", "app.html"]) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((r) => !/^(https?:|#|mailto:|data:)/.test(r));
  for (const ref of new Set(refs)) {
    check(fs.existsSync(path.join(ROOT, ref)), `${page}: missing asset ${ref}`);
  }
  check(!/<script[^>]+src="https?:/i.test(html), `${page}: external script (no CDN allowed)`);
  check(!/<link[^>]+href="https?:/i.test(html), `${page}: external link/font stylesheet (no CDN allowed)`);
  check(!/<img[^>]+src="https?:/i.test(html), `${page}: external image request not allowed`);
  console.log(`  ✓ ${page} local assets & zero-CDN rule`);
}

/* 3. The image must ship BOTH pages (a regression once shipped only index.html). */
const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
check(/\bapp\.html\b/.test(dockerfile), "Dockerfile must copy app.html");
check(/\bindex\.html\b/.test(dockerfile), "Dockerfile must copy index.html");
console.log("  ✓ Dockerfile ships index.html + app.html");

/* 4. Honesty guard: the public config must NOT point at a hosted gateway.
   A real deployment sets GATEWAY_URL at deploy time via ./deploy.sh. */
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const appHtml = fs.readFileSync(path.join(ROOT, "app.html"), "utf8");
const appJs = fs.readFileSync(path.join(ROOT, "assets", "app.js"), "utf8");
const config = fs.readFileSync(path.join(ROOT, "assets", "config.js"), "utf8");
const dash = fs.readFileSync(path.join(ROOT, "assets", "dashboard.js"), "utf8");

check(
  /GATEWAY_URL\s*:\s*""/.test(config),
  "assets/config.js: GATEWAY_URL must stay empty in the public repository"
);
check(
  /<span class="badge badge--plan">PLANNED<\/span>/.test(indexHtml),
  "index.html: hosted tier must stay marked PLANNED"
);
check(
  /id="noPaymentNotice"/.test(appHtml) && /NO PAYMENT PROVIDER YET/.test(appHtml),
  "app.html: must keep honest #noPaymentNotice fallback when payments are disabled"
);
console.log("  ✓ hosted tier stays marked PLANNED / GATEWAY_URL empty / honest payment fallback");

/* 5. Four connectors including YouTube on landing page + costs */
check(/data-count="4">4<\/strong>/.test(indexHtml), "index.html: stats must report 4 live connectors");
check(/data-count="160">160<\/strong>/.test(indexHtml), "index.html: stats must report 170 offline tests");
check(/Four services\./.test(indexHtml), "index.html: must read 'Four services. One contract.'");
check(/<button role="tab"[^>]*>youtube<\/button>/.test(indexHtml), "index.html: #terminalTabs must include youtube tab");
check(/data-conn="youtube"/.test(indexHtml), "index.html: #connectorList must include youtube tab");
check(/\/v1\/youtube\/@mkbhd\/posts\?limit=2/.test(appJs), "assets/app.js: must include YouTube @mkbhd sample");
check(/innertube_browse/.test(appJs), "assets/app.js: YouTube sample must report innertube_browse strategy");
check(/YouTube videos \/ search \/ transcript/.test(config), "assets/config.js: COSTS must include YouTube 2-cr entry");
check(/YouTube videos \/ search \/ transcript/.test(dash), "assets/dashboard.js: fallback COSTS must include YouTube 2-cr entry");
console.log("  ✓ 4 connectors (Instagram, YouTube, LinkedIn, TikTok) & 170 offline tests");

/* 6. Honesty guard for the two-credential model: the 16-digit unlock code
   must never be sent as X-API-Key. A leaked API key is rotatable; a leaked
   unlock code is the account itself, so the dashboard must keep them apart. */
check(/UNLOCK CODE/.test(appHtml), "app.html: must label the 16-digit unlock code");
check(/NOT an API key/i.test(appHtml), "app.html: must state the unlock code is not an API key");
check(/X-Unlock-Code/.test(dash), "dashboard.js: management calls must use X-Unlock-Code");
check(/X-API-Key/.test(dash), "dashboard.js: API calls must use X-API-Key");
check(
  !/headers\["X-API-Key"\]\s*=\s*unlockCode/.test(dash),
  "dashboard.js: the unlock code must NEVER be sent as X-API-Key"
);
check(
  /looksLikeUnlockCode/.test(dash) && /\\d\{16\}/.test(dash),
  "dashboard.js: playground must block 16-digit unlock codes client-side"
);
check(
  !/\.finally\([^)]*currentTarget/.test(dash),
  "dashboard.js: never read e.currentTarget inside an async .finally() (it is null by then)"
);
console.log("  ✓ unlock code and API key stay strictly separated (including Playground guard)");

/* 7. Live API Playground & PayAsYouGo Credit Packs / Sandbox Checkout */
for (const id of ["playPreset", "playPath", "playApiKey", "playNoCache", "playSendBtn", "playOutput", "playCopyBtn", "packsBox", "buyPackBtn", "invoiceBox"]) {
  check(new RegExp(`id="${id}"`).test(appHtml), `app.html: missing #${id}`);
}
check(/LIVE PLAYGROUND/.test(appHtml) && /TRY AN API CALL/.test(appHtml), "app.html: must include LIVE PLAYGROUND / TRY AN API CALL panel");
check(/x-credits-remaining/i.test(dash) && /x-cache/i.test(dash), "dashboard.js: playground must read X-Credits-Remaining and X-Cache headers");
check(/\/v1\/payments\/packs/.test(dash) && /\/v1\/payments\/checkout/.test(dash) && /\/v1\/payments\/sandbox\//.test(dash), "dashboard.js: must wire PayAsYouGo packs, checkout, and sandbox settlement");
console.log("  ✓ Live API Playground & PayAsYouGo credit packs wired");

if (errors.length) {
  console.error("\n  FAILED:\n" + errors.map((e) => `    ✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log("\n  All checks passed.");
