/**
 * Cyberpunk login palettes.
 * Runs only when --cyberpunk-theme is on or 1.
 * One palette per login. Refresh and in-app navigation keep it.
 * Logout clears the login marker so the next sign-in rolls again.
 * Console prefix: [cyberpunk-palette]
 */
(function () {
  var PREFIX = "[cyberpunk-palette]";
  var STORE = "cyberpunk-palette";
  var LAST = "cyberpunk-palette-last";

  function rgba(hex, alpha) {
    var n = parseInt(String(hex).replace("#", ""), 16);
    return "rgba(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ", " + alpha + ")";
  }

  function expand(p) {
    return {
      id: p.id,
      vars: {
        "--cp-accent": p.accent,
        "--cp-accent-ink": p.accentInk,
        "--cp-ink": p.ink,
        "--cp-muted": rgba(p.ink, 0.78),
        "--cp-faint": rgba(p.ink, 0.52),
        "--cp-line": rgba(p.peach, 0.28),
        "--cp-line-strong": rgba(p.peach, 0.55),
        "--cp-glow": rgba(p.accent, 0.36),
        "--cp-fill": rgba(p.accent, 0.12),
        "--cp-halo-warm": rgba(p.warm, 0.7),
        "--cp-halo-peach": rgba(p.peach, 0.55),
        "--cp-halo-cool": rgba(p.cool, 0.42),
        "--cp-halo-hot": rgba(p.hot, 0.32),
        "--cp-halo-peach-dim": rgba(p.peach, 0.24),
        "--cp-halo-cool-dim": rgba(p.cool, 0.16),
        "--cp-halo-warm-dim": rgba(p.warm, 0.1),
        "--cp-halo-cool-faint": rgba(p.cool, 0.06),
        "--cp-bloom-warm": rgba(p.peach, 0.14),
        "--cp-bloom-cool": rgba(p.cool, 0.16)
      }
    };
  }

  /* Void stays #000 in CSS. These sets only recolor accent, ink, hairline, halo, and blooms. */
  var PALETTES = [
    expand({ id: "idle-peach", accent: "#f7b685", accentInk: "#1a1008", ink: "#f3f0ff", warm: "#ff5420", peach: "#f7b685", cool: "#5ce1e6", hot: "#ff461e" }),
    expand({ id: "acid-lime", accent: "#d6ff3c", accentInk: "#101800", ink: "#f4ffe6", warm: "#c6ff00", peach: "#e4ff7a", cool: "#3dffe0", hot: "#9dff00" }),
    expand({ id: "ice-cyan", accent: "#7af0ff", accentInk: "#041418", ink: "#eefcff", warm: "#3de0ff", peach: "#b8fbff", cool: "#6d7dff", hot: "#00c2ff" }),
    expand({ id: "magenta", accent: "#ff4fd8", accentInk: "#1a0614", ink: "#ffe9f8", warm: "#ff2f9a", peach: "#ff9ad8", cool: "#7af0ff", hot: "#ff1f6a" }),
    expand({ id: "amber", accent: "#ffc14a", accentInk: "#1a1204", ink: "#fff6e4", warm: "#ff8a00", peach: "#ffd27a", cool: "#5ce1e6", hot: "#ff5a00" }),
    expand({ id: "blood-orange", accent: "#ff5a2a", accentInk: "#1a0804", ink: "#fff1ea", warm: "#ff2a00", peach: "#ff8a5a", cool: "#ffd0a8", hot: "#e01010" }),
    expand({ id: "electric-blue", accent: "#4d7dff", accentInk: "#060a18", ink: "#eef2ff", warm: "#7aa2ff", peach: "#b7c8ff", cool: "#3df0ff", hot: "#2450ff" }),
    expand({ id: "toxic-green", accent: "#39ff6a", accentInk: "#041408", ink: "#eafff0", warm: "#b6ff00", peach: "#7dff9a", cool: "#2ee6c8", hot: "#00ff66" }),
    expand({ id: "violet", accent: "#b06bff", accentInk: "#120818", ink: "#f6eeff", warm: "#ff4fd8", peach: "#d2a6ff", cool: "#7af0ff", hot: "#8a2bff" }),
    expand({ id: "hot-pink", accent: "#ff3d8a", accentInk: "#1a0610", ink: "#ffe8f1", warm: "#ff1f6a", peach: "#ff9ab8", cool: "#ffd0ea", hot: "#ff0044" }),
    expand({ id: "gold-teal", accent: "#e6c15a", accentInk: "#161204", ink: "#fff8e6", warm: "#ffb020", peach: "#ffe08a", cool: "#2ee6c8", hot: "#d48a00" }),
    expand({ id: "crimson-ice", accent: "#ff3355", accentInk: "#18060a", ink: "#ffecee", warm: "#ff1030", peach: "#ff8a9a", cool: "#9af6ff", hot: "#c40022" }),
    expand({ id: "chartreuse-blue", accent: "#c8ff2e", accentInk: "#101800", ink: "#f6ffe4", warm: "#e0ff40", peach: "#f2ff9a", cool: "#3d8bff", hot: "#9dff00" }),
    expand({ id: "ultraviolet", accent: "#8a7dff", accentInk: "#0c0a18", ink: "#f2f0ff", warm: "#c06bff", peach: "#d2c6ff", cool: "#5ce1e6", hot: "#6a3dff" })
  ];

  var byId = {};
  for (var i = 0; i < PALETTES.length; i++) byId[PALETTES[i].id] = PALETTES[i];

  var currentId = "";
  var hadUser = "";
  var applied = false;

  function themeOn() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--cyberpunk-theme").trim().toLowerCase();
    return v === "on" || v === "1";
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (e) {
      return null;
    }
  }

  function tokenFrom(node) {
    if (!node || typeof node !== "object") return null;
    var token = node.AccessToken || node.accessToken || "";
    var userId = node.UserId || node.userId || "";
    if (token && userId) return { userId: String(userId), token: String(token) };
    return null;
  }

  function readAuth() {
    var api = window.ApiClient;
    if (api && typeof api.accessToken === "function" && typeof api.getCurrentUserId === "function") {
      try {
        var apiToken = api.accessToken();
        var apiUser = api.getCurrentUserId();
        if (apiToken && apiUser) return { userId: String(apiUser), token: String(apiToken) };
      } catch (e) { /* credentials below */ }
    }

    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    } catch (e) {
      return null;
    }

    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (!key || key === STORE || key === LAST) continue;
      var data = readJson(key);
      var direct = tokenFrom(data);
      if (direct) return direct;
      var servers = data && (data.Servers || data.servers);
      if (!servers || !servers.length) continue;
      for (var s = 0; s < servers.length; s++) {
        var hit = tokenFrom(servers[s]);
        if (hit) return hit;
      }
    }
    return null;
  }

  function onLoginPage() {
    if (/#\/(login|startup)\b/.test(location.hash || "")) return true;
    return !!document.querySelector("#loginPage:not(.hide), .loginPage:not(.hide)");
  }

  function apply(palette) {
    var root = document.documentElement;
    var names = Object.keys(palette.vars);
    for (var i = 0; i < names.length; i++) {
      root.style.setProperty(names[i], palette.vars[names[i]]);
    }
    root.setAttribute("data-cp-palette", palette.id);
    currentId = palette.id;
    applied = true;
  }

  function pick(exceptId) {
    var pool = [];
    for (var i = 0; i < PALETTES.length; i++) {
      if (PALETTES[i].id !== exceptId) pool.push(PALETTES[i]);
    }
    if (!pool.length) pool = PALETTES;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function clearLogin() {
    try { localStorage.removeItem(STORE); } catch (e) { /* private mode */ }
  }

  function sync() {
    if (!themeOn()) return;
    var auth = readAuth();
    if (!auth) {
      if (hadUser || onLoginPage()) clearLogin();
      hadUser = "";
      return;
    }

    hadUser = auth.userId;
    var saved = readJson(STORE);
    if (saved && saved.userId === auth.userId && saved.loginId && byId[saved.paletteId]) {
      if (currentId !== saved.paletteId) {
        apply(byId[saved.paletteId]);
        console.info(PREFIX, "kept", saved.paletteId, "login", saved.loginId);
      }
      return;
    }

    var previous = "";
    try { previous = localStorage.getItem(LAST) || (saved && saved.paletteId) || ""; } catch (e) { previous = ""; }
    var palette = pick(previous);
    var loginId = Date.now().toString(36) + "-" + Math.random().toString(16).slice(2, 10);
    try {
      localStorage.setItem(STORE, JSON.stringify({
        userId: auth.userId,
        loginId: loginId,
        paletteId: palette.id
      }));
      localStorage.setItem(LAST, palette.id);
    } catch (e) { /* still apply for this document */ }
    apply(palette);
    console.info(PREFIX, "login", auth.userId, "palette", palette.id);
  }

  function hookEvents() {
    var events = window.Events;
    var api = window.ApiClient;
    if (!events || !api || hookEvents.done || typeof events.on !== "function") return;
    hookEvents.done = true;
    events.on(api, "localusersignedout", function () {
      hadUser = hadUser || "signed-out";
      clearLogin();
      hadUser = "";
      console.info(PREFIX, "logout");
    });
  }

  function boot() {
    hookEvents();
    sync();
  }

  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    boot();
    if (applied || tries > 80) {
      if (!applied && tries > 80 && !themeOn()) clearInterval(timer);
      if (applied) clearInterval(timer);
    }
  }, 250);

  window.addEventListener("hashchange", boot);
  document.addEventListener("visibilitychange", boot);

  window.cyberpunkPalette = {
    current: function () { return currentId; },
    palettes: PALETTES.map(function (p) { return p.id; }),
    forgetLogin: function () { clearLogin(); }
  };

  console.info(PREFIX, "loaded", PALETTES.length);
})();
