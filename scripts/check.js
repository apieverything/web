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

/* 2. Every local asset referenced by the HTML pages exists */
for (const page of ["index.html", "app.html"]) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((r) => !/^(https?:|#|mailto:|data:)/.test(r));
  for (const ref of new Set(refs)) {
    check(fs.existsSync(path.join(ROOT, ref)), `${page}: missing asset ${ref}`);
  }
  check(!/<script[^>]+src="https?:/i.test(html), `${page}: external script (no CDN allowed)`);
  console.log(`  ✓ ${page} local assets`);
}

/* 3. The image must ship BOTH pages (a regression once shipped only index.html). */
const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
check(/\bapp\.html\b/.test(dockerfile), "Dockerfile must copy app.html");
check(/\bindex\.html\b/.test(dockerfile), "Dockerfile must copy index.html");
console.log("  ✓ Dockerfile ships index.html + app.html");

/* 4. Honesty guard: the public config must NOT point at a hosted gateway.
   A real deployment sets GATEWAY_URL at deploy time via ./deploy.sh. */
const config = fs.readFileSync(path.join(ROOT, "assets", "config.js"), "utf8");
check(
  /GATEWAY_URL\s*:\s*""/.test(config),
  "assets/config.js: GATEWAY_URL must stay empty in the public repository"
);
check(
  /PLANNED/.test(fs.readFileSync(path.join(ROOT, "index.html"), "utf8")),
  "index.html: hosted tier must stay marked PLANNED"
);
console.log("  ✓ hosted tier stays marked PLANNED / GATEWAY_URL empty");

if (errors.length) {
  console.error("\n  FAILED:\n" + errors.map((e) => `    ✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log("\n  All checks passed.");
