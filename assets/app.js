/* API Everything — static site behaviour. No dependencies, no network calls. */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- JSON syntax highlighting ---------- */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function highlightJson(value) {
    const text = JSON.stringify(value, null, 2);
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
  function highlightShell(text) {
    return escapeHtml(text)
      .split("\n")
      .map((line) => {
        if (line.trimStart().startsWith("#")) return `<span class="c-dim">${line}</span>`;
        const m = /^(\s*)(\$\s?)(.*)$/.exec(line);
        if (m) return `${m[1]}<span class="c-key">${m[2]}</span><span class="c-str">${m[3]}</span>`;
        return line;
      })
      .join("\n");
  }

  /* ---------- data: real sample responses from the connectors ---------- */
  const FRAMES = [
    {
      cmd: 'curl "localhost:3000/v1/instagram/kametolol/posts?limit=2"',
      out: {
        username: "kametolol",
        profile: { followers: 401268, following: 368, posts: 35, fullName: "Kameto", source: "anon_user_info" },
        count: 2,
        posts: [{
          url: "https://www.instagram.com/p/DfpVTKbxkfX/",
          shortcode: "DfpVTKbxkfX",
          userPosted: "ez.store_officiel",
          description: "UNE CUSTOM À LA HAUTEUR DE MY CEO 🔥",
          hashtags: ["#ezstore", "#kameto", "#pokemon"],
          numComments: 15,
          datePosted: "2026-11-12T15:07:23.000Z",
          likes: 1995,
          photos: ["https://scontent.cdninstagram.com/...jpg"],
          type: "reel",
        }],
        strategy: "anon_grid",
        source: "anon_grid",
        hasMore: true,
      },
    },
    {
      cmd: 'curl "localhost:3000/v1/linkedin/jobs/search?keywords=python&location=France&limit=3"',
      out: {
        query: { keywords: "python", location: "France", start: 0 },
        count: 3,
        jobs: [{
          id: "4418974011",
          title: "Développeur Python Confirmé F/H",
          company: "ITrust",
          location: "Labège, Occitanie, France",
          city: "Labège",
          country: "France",
          datePosted: "2026-10-19",
          source: "jobs_guest",
        }],
        nextStart: 10,
        hasMore: true,
        strategy: "jobs_guest",
        failures: [],
      },
    },
    {
      cmd: 'curl "localhost:3000/v1/tiktok/khaby.lame"',
      out: {
        username: "khaby.lame",
        profileId: "127905465618821121",
        followers: 162912515,
        following: 82,
        posts: 1358,
        likes: 2693517927,
        fullName: "Khabane lame",
        isVerified: true,
        countryCode: null,
        createdAt: "2016-08-10T22:02:34.000Z",
        source: "user_detail",
      },
    },
  ];

  const CONNECTORS = {
    instagram: {
      label: "GET /v1/instagram/kametolol/posts?limit=2",
      note: "anon_grid · 200 · ~1.3 s · no session, no proxy",
      json: FRAMES[0].out,
    },
    linkedin: {
      label: "GET /v1/linkedin/jobs/search?keywords=python&location=France&limit=3",
      note: "jobs_guest · 200 · ~0.5 s · no personal data",
      json: FRAMES[1].out,
    },
    tiktok: {
      label: "GET /v1/tiktok/khaby.lame",
      note: "user_detail · 200 · exact counts · no session",
      json: FRAMES[2].out,
    },
  };

  const RUNS = {
    docker: `# 1. clone the connectors repository
$ git clone https://github.com/apieverything/connectors.git
$ cd connectors/socials/instagram

# 2. configure (optional for public data)
$ cp .env.example .env

# 3. run it
$ docker compose up -d

# 4. use it
$ curl "http://localhost:3000/v1/instagram/kametolol/posts?limit=12"`,
    node: `# Node.js 22+ / no Docker needed
$ git clone https://github.com/apieverything/connectors.git
$ cd connectors/socials/linkedin
$ npm install
$ cp .env.example .env

$ node --env-file=.env server.js

# in another terminal
$ curl "http://localhost:3000/v1/linkedin/jobs/search?keywords=python&location=France"`,
    check: `# one script audits .env, starts every connector, exercises every route
$ cd connectors
$ ./scripts/demo.sh

# or check config only
$ ./scripts/demo.sh --audit-only

# 51 checks · 0 failures · secrets never printed
$ ./scripts/demo.sh --fast`,
  };

  /* ---------- copy helper ---------- */
  function legacyCopy(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch { return false; }
  }

  async function copy(text, button) {
    let ok = false;
    // Clipboard API can be present but denied (permissions, non-secure context).
    // Always fall back to execCommand rather than reporting a false failure.
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch { ok = legacyCopy(text); }
    } else {
      ok = legacyCopy(text);
    }
    if (button) {
      const original = button.dataset.original || button.textContent;
      button.dataset.original = original;
      button.textContent = ok ? "copied ✓" : "select manually";
      button.classList.add("is-done");
      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("is-done");
      }, 1500);
    }
  }

  /* ---------- terminal ---------- */
  const terminal = $("#terminal");
  const typed = $("#typed");
  const out = $("#terminalOut");
  const tabs = $$("#terminalTabs button");
  let frameIndex = 0;
  let typeTimer = null;
  let holdTimer = null;
  let paused = false;

  function selectFrame(index, animate = true) {
    if (typeTimer) { window.clearInterval(typeTimer); typeTimer = null; }
    if (holdTimer) { window.clearTimeout(holdTimer); holdTimer = null; }
    frameIndex = (index + FRAMES.length) % FRAMES.length;
    const frame = FRAMES[frameIndex];
    tabs.forEach((t, i) => t.setAttribute("aria-selected", String(i === frameIndex)));
    out.classList.remove("is-in");
    out.innerHTML = "";

    const render = () => {
      out.innerHTML = highlightJson(frame.out);
      out.classList.add("is-in");
      if (!reduceMotion && !paused) {
        holdTimer = window.setTimeout(() => selectFrame(frameIndex + 1, true), 4600);
      }
    };

    if (!animate || reduceMotion) {
      typed.textContent = frame.cmd;
      render();
      return;
    }
    typed.textContent = "";
    let i = 0;
    typeTimer = window.setInterval(() => {
      typed.textContent = frame.cmd.slice(0, ++i);
      if (i >= frame.cmd.length) {
        window.clearInterval(typeTimer);
        typeTimer = null;
        window.setTimeout(render, 220);
      }
    }, 20);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      paused = true;
      selectFrame(Number(tab.dataset.frame), true);
    });
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next = (frameIndex + (e.key === "ArrowRight" ? 1 : -1) + FRAMES.length) % FRAMES.length;
      tabs[next].focus();
      tabs[next].click();
    });
  });
  if (terminal) {
    terminal.addEventListener("mouseenter", () => { paused = true; if (holdTimer) { window.clearTimeout(holdTimer); holdTimer = null; } });
    terminal.addEventListener("mouseleave", () => {
      paused = false;
      if (!typeTimer && !holdTimer && !reduceMotion) holdTimer = window.setTimeout(() => selectFrame(frameIndex + 1, true), 2200);
    });
    terminal.addEventListener("focusin", () => { paused = true; });
  }
  selectFrame(0, !reduceMotion);

  const copyTerminal = $("#copyTerminal");
  if (copyTerminal) copyTerminal.addEventListener("click", () => copy(FRAMES[frameIndex].cmd, copyTerminal));

  /* ---------- connector explorer ---------- */
  const connButtons = $$("#connectorList .conn");
  const panelLabel = $("#panelLabel");
  const panelJson = $("#panelJson");
  const panelNote = $("#panelNote");
  let activeConn = "instagram";

  function setConnector(name, focus = false) {
    const data = CONNECTORS[name];
    if (!data) return;
    activeConn = name;
    connButtons.forEach((b) => {
      const on = b.dataset.conn === name;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
      if (on && focus) b.focus();
    });
    panelLabel.textContent = data.label;
    panelNote.textContent = data.note;
    panelJson.innerHTML = highlightJson(data.json);
  }
  connButtons.forEach((btn) => {
    btn.addEventListener("click", () => setConnector(btn.dataset.conn));
    btn.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const i = connButtons.indexOf(btn);
      const next = connButtons[(i + (e.key === "ArrowDown" ? 1 : -1) + connButtons.length) % connButtons.length];
      next.click();
      next.focus();
    });
  });
  setConnector("instagram");
  const copyPanel = $("#copyPanel");
  if (copyPanel) copyPanel.addEventListener("click", () => copy(JSON.stringify(CONNECTORS[activeConn].json, null, 2), copyPanel));

  /* ---------- run tabs ---------- */
  const runTabs = $$(".runbox__tabs button");
  const runCode = $("#runCode code");
  let activeRun = "docker";
  function setRun(name) {
    activeRun = name;
    runTabs.forEach((b) => {
      const on = b.dataset.run === name;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });
    runCode.innerHTML = highlightShell(RUNS[name]);
  }
  runTabs.forEach((b) => b.addEventListener("click", () => setRun(b.dataset.run)));
  setRun("docker");
  const copyRun = $("#copyRun");
  if (copyRun) copyRun.addEventListener("click", () => copy(RUNS[activeRun], copyRun));

  /* ---------- reveal on scroll ---------- */
  if (!reduceMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    $$(".reveal").forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`;
      observer.observe(el);
    });
  } else {
    $$(".reveal").forEach((el) => el.classList.add("is-in"));
  }

  /* ---------- nav ---------- */
  const burger = $("#burger");
  const navLinks = $("#navLinks");
  if (burger && navLinks) {
    burger.addEventListener("click", () => {
      const open = navLinks.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", String(open));
    });
    $$("a", navLinks).forEach((a) => a.addEventListener("click", () => {
      navLinks.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
    }));
  }
  if ("IntersectionObserver" in window) {
    const navObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        $$(".nav__links a").forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${entry.target.id}`));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$("main section[id]").forEach((s) => navObserver.observe(s));
  }

  /* ---------- counters ---------- */
  const stats = $(".stats");
  if (stats && !reduceMotion && "IntersectionObserver" in window) {
    const counter = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        $$(".stat strong[data-count]").forEach((el) => {
          const target = Number(el.dataset.count);
          if (!target) return;
          const start = performance.now();
          const duration = 900;
          const tick = (now) => {
            const p = Math.min((now - start) / duration, 1);
            el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        counter.disconnect();
      });
    }, { threshold: 0.4 });
    counter.observe(stats);
  }

  /* ---------- subtle pointer glow ---------- */
  const glow = $(".hero__glow");
  if (glow && !reduceMotion && window.matchMedia("(pointer: fine)").matches) {
    const hero = $(".hero");
    hero.addEventListener("pointermove", (e) => {
      const rect = hero.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 60;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 40;
      glow.style.transform = `translate(${x}px, ${y}px)`;
    });
  }

  const year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
