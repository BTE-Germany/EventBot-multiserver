// EventBot admin dashboard. Vanilla JS, no build step.
// Every user-provided string goes through esc() before it is put into HTML.
"use strict";

(() => {
  const API = "/admin/api";
  const EVENT_STATUSES = ["DRAFT", "RUNNING", "ENDED", "ARCHIVED"];
  const BUILD_STATUSES = ["PENDING", "IN_REVIEW", "COMPLETE", "REJECTED"];
  const PAGE_SIZE = 50;
  const ACTIVITY_LIMIT = 100;
  const MC_NAME = /^[A-Za-z0-9_]{3,16}$/;
  const SNOWFLAKE = /^\d{17,20}$/;

  const state = {
    me: null,
    overview: null,
    guilds: null,
    timer: null,
    seq: 0,
    loggedOut: false,
    builds: { eventId: null, status: "", page: 0 },
    partSearch: "",
  };

  // ======================================================================
  // Helpers
  // ======================================================================
  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : "#888888");
  const intColor = (n) => (n ? `#${Number(n).toString(16).padStart(6, "0")}` : null);
  const safeUrl = (u) => {
    try {
      const url = new URL(u);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
  };
  const pad = (n) => String(n).padStart(2, "0");
  const fmtNum = (n, digits = 2) =>
    typeof n === "number" && Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";
  const fmtBytes = (b) => {
    if (typeof b !== "number") return "—";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
    return `${b.toFixed(i ? 1 : 0)} ${units[i]}`;
  };
  const fmtDuration = (s) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
  };
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

  // datetime-local value (local time) <-> ISO 8601 with explicit offset
  function toLocalInput(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fromLocalInput(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? "+" : "-";
    const abs = Math.abs(off);
    return `${toLocalInput(d)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  }

  const badge = (status) => `<span class="badge badge-${esc(status)}">${esc(String(status).replace(/_/g, " "))}</span>`;
  const loadingHtml = () => `<div class="loading"><div class="spinner" aria-label="Loading"></div></div>`;
  const errorHtml = (msg) => `<div class="alert alert-error" role="alert"><strong>Something went wrong</strong>${esc(msg)}</div>`;
  const teamName = (team) => (team ? `${team.emoji ? `${team.emoji} ` : ""}${team.name}` : "Neutral");
  const teamChip = (team) =>
    team ? `<span class="dot" style="background:${safeColor(team.color)}"></span>${esc(teamName(team))}` : `<span class="muted">Neutral</span>`;
  const teamOptions = (teams, selected, { neutral = "Neutral", none = false } = {}) =>
    (none ? `<option value="">${esc(none)}</option>` : neutral ? `<option value="">${esc(neutral)}</option>` : "") +
    teams.map((t) => `<option value="${t.id}"${String(t.id) === String(selected ?? "") ? " selected" : ""}>${esc(teamName(t))}</option>`).join("");
  const guildIcon = (g, cls = "") => {
    const url = g && safeUrl(g.icon);
    if (url) return `<img class="guild-icon ${cls}" src="${esc(url)}" alt="" loading="lazy">`;
    const initials = String(g?.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 3);
    return `<span class="guild-icon ${cls}" aria-hidden="true">${esc(initials)}</span>`;
  };

  // Renders into a fresh wrapper so listeners from earlier views never pile up
  function mount(target, html) {
    const view = document.createElement("div");
    view.innerHTML = html;
    target.replaceChildren(view);
    return view;
  }

  // ======================================================================
  // API
  // ======================================================================
  class AuthError extends Error {}

  async function api(method, path, body) {
    const opts = { method, credentials: "same-origin", headers: { Accept: "application/json" } };
    if (method !== "GET") {
      opts.headers["X-Requested-With"] = "dashboard";
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body ?? {});
    }
    let res;
    try {
      res = await fetch(path.startsWith("/auth/") ? path : API + path, opts);
    } catch {
      throw new Error("Network error — is the bot running?");
    }
    if (res.status === 401) {
      showLoggedOut();
      throw new AuthError("Not logged in");
    }
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (HTTP ${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const qs = (params) =>
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

  function report(err) {
    if (err instanceof AuthError) return;
    toast(err.message || String(err), "error");
  }

  // Runs an action while the button is disabled; returns the result or undefined on error
  async function busy(btn, fn) {
    if (btn) btn.disabled = true;
    try {
      return await fn();
    } catch (err) {
      report(err);
      return undefined;
    } finally {
      if (btn && btn.isConnected) btn.disabled = false;
    }
  }

  async function getGuilds(force = false) {
    if (!state.guilds || force) state.guilds = await api("GET", "/guilds");
    return state.guilds;
  }
  async function getLocales() {
    if (!state.overview) state.overview = await api("GET", "/overview");
    return state.overview.locales || [];
  }

  // ======================================================================
  // Toasts & dialogs
  // ======================================================================
  function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.setAttribute("role", type === "error" ? "alert" : "status");
    el.textContent = message;
    $("#toasts").append(el);
    setTimeout(() => {
      el.classList.add("hide");
      setTimeout(() => el.remove(), 350);
    }, type === "error" ? 7000 : 3500);
  }

  // Generic modal. With `input` it resolves to the entered string, otherwise to true; null on cancel.
  function dialog({ title, message = "", input = null, expect = null, confirmLabel = "Confirm", danger = false, validate = null }) {
    return new Promise((resolve) => {
      const dlg = document.createElement("dialog");
      dlg.className = "modal";
      dlg.setAttribute("aria-labelledby", "dlg-title");
      const fieldHtml = input
        ? `<label class="field"><span>${esc(input.label)}</span>
             ${input.multiline
               ? `<textarea name="value" maxlength="${input.maxLength || 500}" placeholder="${esc(input.placeholder || "")}">${esc(input.value || "")}</textarea>`
               : `<input type="text" name="value" autocomplete="off" value="${esc(input.value || "")}" placeholder="${esc(input.placeholder || "")}">`}
           </label>`
        : "";
      dlg.innerHTML = `<form method="dialog" novalidate>
          <h2 id="dlg-title">${esc(title)}</h2>
          ${message ? `<p>${esc(message)}</p>` : ""}
          ${expect ? `<p>Type <code>${esc(expect)}</code> to confirm.</p>` : ""}
          ${fieldHtml}
          <div class="field-error" aria-live="polite"></div>
          <div class="form-actions">
            <button type="button" class="btn" data-cancel>Cancel</button>
            <button type="submit" class="btn ${danger ? "btn-danger" : "btn-primary"}">${esc(confirmLabel)}</button>
          </div>
        </form>`;
      document.body.append(dlg);
      const field = $("[name=value]", dlg);
      const errorEl = $(".field-error", dlg);
      const finish = (value) => {
        dlg.close();
        dlg.remove();
        resolve(value);
      };
      $("[data-cancel]", dlg).addEventListener("click", () => finish(null));
      dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(null); });
      $("form", dlg).addEventListener("submit", (e) => {
        e.preventDefault();
        if (!field) return finish(true);
        const value = field.value.trim();
        if (expect && value !== expect) { errorEl.textContent = `Please type exactly "${expect}".`; return; }
        const problem = validate ? validate(value) : null;
        if (problem) { errorEl.textContent = problem; return; }
        finish(value);
      });
      dlg.showModal();
      (field || $("[type=submit]", dlg)).focus();
    });
  }
  const confirmDialog = (title, message, opts = {}) => dialog({ title, message, ...opts });
  const typedConfirm = (title, message, expect) =>
    dialog({ title, message, expect, danger: true, confirmLabel: "I understand, do it", input: { label: "Confirmation", placeholder: expect } });

  // ======================================================================
  // Session
  // ======================================================================
  function showLoggedOut(message) {
    state.loggedOut = true;
    clearInterval(state.timer);
    state.timer = null;
    $("#boot").hidden = true;
    $("#app").hidden = true;
    $("#logged-out").hidden = false;
    $("#logged-out-msg").innerHTML = message
      ? `${esc(message)} Run <code>/dashboard</code> in Discord to get a new login link.`
      : "Not logged in — run <code>/dashboard</code> in Discord to get a login link.";
  }

  async function logout(btn) {
    const ok = await busy(btn, () => api("POST", "/auth/logout"));
    if (ok !== undefined) showLoggedOut("You have been logged out.");
  }

  // ======================================================================
  // Router
  // ======================================================================
  const isStale = (seq) => seq !== state.seq || state.loggedOut;

  async function route({ quiet = false } = {}) {
    if (state.loggedOut) return;
    clearInterval(state.timer);
    state.timer = null;
    const seq = ++state.seq;
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    const [view = "overview", id, tab] = parts;

    $$("[data-nav]").forEach((a) => {
      const active = a.dataset.nav === view;
      a.classList.toggle("active", active);
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    $("#sidebar").classList.remove("open");
    $("#menu-toggle").setAttribute("aria-expanded", "false");

    const main = $("#main");
    if (!quiet) main.innerHTML = loadingHtml();
    try {
      switch (view) {
        case "overview": await renderOverview(main, seq); break;
        case "settings": await renderSettings(main, seq); break;
        case "servers": await renderServers(main, seq, id); break;
        case "events":
          if (id) await renderEvent(main, seq, Number(id), tab || "general");
          else await renderEvents(main, seq);
          break;
        default:
          location.hash = "#/overview";
      }
    } catch (err) {
      if (err instanceof AuthError || isStale(seq)) return;
      main.innerHTML = errorHtml(err.message);
    }
  }
  const refresh = () => route({ quiet: true });

  // ======================================================================
  // Overview
  // ======================================================================
  async function renderOverview(main, seq) {
    const o = await api("GET", "/overview");
    if (isStale(seq)) return;
    state.overview = o;
    const tiles = [
      ["Uptime", fmtDuration(o.uptime), ""],
      ["Memory (RSS)", fmtBytes(o.memory?.rss), `heap ${fmtBytes(o.memory?.heapUsed)}`],
      ["Node", o.node, ""],
      ["Events", fmtNum(o.counts?.events, 0), ""],
      ["Participants", fmtNum(o.counts?.participants, 0), ""],
      ["Builds", fmtNum(o.counts?.builds, 0), ""],
      ["Servers", fmtNum(o.counts?.guilds, 0), "configured"],
    ];
    const pool = o.pool || {};
    const shards = o.shards || [];
    const events = o.events || [];
    const view = mount(main, `
      <div class="page-head">
        <div><h1>Overview</h1><div class="sub">Updated ${esc(new Date().toLocaleTimeString())} · refreshes every 15 s</div></div>
        <button type="button" class="btn" data-refresh>Refresh</button>
      </div>
      <div class="tiles">
        ${tiles.map(([label, value, hint]) => `<div class="tile"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${hint ? `<div class="hint">${esc(hint)}</div>` : ""}</div>`).join("")}
      </div>
      <div class="grid grid-2">
        <section class="card">
          <h2>Shards</h2>
          ${shards.length ? `<div class="table-wrap"><table>
            <thead><tr><th>ID</th><th class="num">Guilds</th><th class="num">Ping</th><th>Status</th></tr></thead>
            <tbody>${shards.map((s) => `<tr><td>#${esc(s.id)}</td><td class="num">${fmtNum(s.guilds, 0)}</td>
              <td class="num">${s.ping >= 0 ? `${fmtNum(s.ping, 0)} ms` : "—"}</td>
              <td>${s.ready ? `<span class="badge badge-ok">Ready</span>` : `<span class="badge badge-danger">Not ready</span>`}</td></tr>`).join("")}
            </tbody></table></div>` : `<div class="empty">No shard information available.</div>`}
        </section>
        <section class="card">
          <h2>Worker pool</h2>
          <dl class="kv">
            ${["size", "started", "busy", "queued", "completed", "failed", "restarts"].map((k) => `<div><dt>${esc(k)}</dt><dd>${fmtNum(pool[k], 0)}</dd></div>`).join("")}
          </dl>
        </section>
      </div>
      <section class="card">
        <div class="card-head"><h2>Events</h2><a class="btn btn-sm" href="#/events">Manage events</a></div>
        ${events.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Event</th><th>Status</th><th class="num">Teams</th><th class="num">Participants</th><th class="num">Builds</th></tr></thead>
          <tbody>${events.map((e) => `<tr>
            <td><a href="#/events/${e.id}">${esc(e.name)}</a> <span class="muted small">#${e.id}</span></td>
            <td>${badge(e.status)}</td>
            <td class="num">${fmtNum(e.counts?.teams, 0)}</td>
            <td class="num">${fmtNum(e.counts?.participants, 0)}</td>
            <td class="num">${fmtNum(e.counts?.builds, 0)}</td></tr>`).join("")}
          </tbody></table></div>` : `<div class="empty">No events yet.</div>`}
      </section>`);
    $("[data-refresh]", view).addEventListener("click", (e) => busy(e.currentTarget, () => renderOverview(main, seq)));
    if (!state.timer) {
      state.timer = setInterval(() => {
        if (isStale(seq)) return;
        renderOverview(main, seq).catch(report);
      }, 15000);
    }
  }

  // ======================================================================
  // Settings
  // ======================================================================
  async function renderSettings(main, seq) {
    const [s, locales] = await Promise.all([api("GET", "/settings"), getLocales()]);
    if (isStale(seq)) return;
    const owner = !!state.me?.owner;
    const storage = s.storage || {};
    const legal = s.legal || {};
    const view = mount(main, `
      <div class="page-head"><h1>Settings</h1></div>
      <form class="form" id="settings-form">
        <section class="card">
          <h2>Access</h2>
          <label class="field">
            <span>Dashboard admins</span>
            <textarea name="admins" rows="4" ${owner ? "" : "disabled"} placeholder="One Discord user ID per line">${esc((s.admins || []).join("\n"))}</textarea>
            <span class="help">${owner ? "Discord user IDs (17–20 digits), one per line. The bot owner always has access." : "Only the bot owner can change the admin list."}</span>
          </label>
        </section>
        <section class="card">
          <h2>General</h2>
          <div class="form-grid">
            <label class="field"><span>Default language</span>
              <select name="defaultLocale">${locales.map((l) => `<option value="${esc(l.code)}"${l.code === s.defaultLocale ? " selected" : ""}>${esc(l.name || l.code)} (${esc(l.code)})</option>`).join("")}
              ${locales.some((l) => l.code === s.defaultLocale) ? "" : `<option value="${esc(s.defaultLocale)}" selected>${esc(s.defaultLocale)}</option>`}</select>
            </label>
            <label class="field"><span>Brand color</span>
              <input type="color" name="brandColor" value="${esc(safeColor(s.brandColor))}">
              <span class="help">Used for embeds in Discord.</span>
            </label>
            <label class="field"><span>Board update interval (minutes)</span>
              <input type="number" name="boardIntervalMinutes" min="1" max="60" step="1" value="${esc(s.boardIntervalMinutes)}" required>
            </label>
          </div>
          <label class="field"><span>Stats webhook URL</span>
            <input type="url" name="webhookUrl" value="${esc(s.webhookUrl)}" placeholder="https://…">
            <span class="help">Receives the event stats as JSON every minute. Leave empty to disable.</span>
          </label>
        </section>
        <section class="card">
          <h2>Image storage</h2>
          <div class="alert alert-info">The Azure connection string itself is not stored here — it stays in <code>.env</code> as <code>AZURE_STORAGE_CONNECTION_STRING</code>.</div>
          <div class="form-grid">
            <label class="field"><span>CDN URL</span><input type="url" name="cdnUrl" value="${esc(storage.cdnUrl)}" placeholder="https://cdn.example.com"></label>
            <label class="field"><span>Container</span><input type="text" name="container" maxlength="63" value="${esc(storage.container)}"></label>
            <label class="field"><span>Keep prefix</span><input type="text" name="keepPrefix" value="${esc(storage.keepPrefix)}">
              <span class="help">Blobs below this prefix survive "clear images".</span></label>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Legal</h2>
            ${legal.hostingProvider ? "" : `<span class="badge badge-warn">Hosting provider missing</span>`}</div>
          <p class="muted small">Users must accept the Terms when registering. Changing the version makes everyone accept again before their next submission.</p>
          <div class="form-grid">
            <label class="field"><span>Operator name</span><input type="text" name="operatorName" value="${esc(legal.operatorName)}"></label>
            <label class="field"><span>Operator email</span><input type="text" inputmode="email" autocomplete="off" name="operatorEmail" value="${esc(legal.operatorEmail)}" placeholder="name@example.com"></label>
            <label class="field"><span>Hosting provider</span><input type="text" name="hostingProvider" value="${esc(legal.hostingProvider)}" placeholder="e.g. Microsoft Azure (West Europe)">
              ${legal.hostingProvider ? "" : `<span class="help"><span class="badge badge-warn">Empty</span> Shown as 'our hosting provider' in the Privacy Policy — please fill in.</span>`}</label>
            <label class="field"><span>Data retention (months)</span><input type="number" name="retentionMonths" min="1" max="60" step="1" value="${esc(legal.retentionMonths)}" required></label>
            <label class="field"><span>Terms version</span><input type="text" name="legalVersion" maxlength="40" value="${esc(legal.version)}" placeholder="e.g. 2026-11-15" required>
              <span class="help">Letters, digits, dot, dash, underscore (max 40).</span></label>
          </div>
          <label class="field"><span>Operator address</span><textarea name="operatorAddress" rows="3">${esc(legal.operatorAddress)}</textarea></label>
          <div class="form-grid">
            <label class="field"><span>Imprint URL</span><input type="url" name="imprintUrl" value="${esc(legal.imprintUrl)}" placeholder="https://…"></label>
            <label class="field"><span>External Privacy Policy URL (optional)</span><input type="url" name="privacyUrl" value="${esc(legal.privacyUrl)}" placeholder="https://…"></label>
            <label class="field"><span>External Terms URL (optional)</span><input type="url" name="termsUrl" value="${esc(legal.termsUrl)}" placeholder="https://…"></label>
          </div>
          <div class="btn-row">
            <span class="muted small">Preview Privacy Policy:</span>
            <a class="btn btn-sm" href="/legal/privacy?lang=de" target="_blank" rel="noopener">Deutsch</a>
            <a class="btn btn-sm" href="/legal/privacy?lang=en" target="_blank" rel="noopener">English</a>
            <span class="muted small">Preview Terms:</span>
            <a class="btn btn-sm" href="/legal/terms?lang=de" target="_blank" rel="noopener">Deutsch</a>
            <a class="btn btn-sm" href="/legal/terms?lang=en" target="_blank" rel="noopener">English</a>
          </div>
        </section>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Save settings</button></div>
      </form>`);
    const form = $("#settings-form", view);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = form.elements;
      const patch = {
        defaultLocale: f.defaultLocale.value,
        brandColor: f.brandColor.value,
        boardIntervalMinutes: Number(f.boardIntervalMinutes.value),
        webhookUrl: f.webhookUrl.value.trim(),
        storage: { cdnUrl: f.cdnUrl.value.trim(), container: f.container.value.trim(), keepPrefix: f.keepPrefix.value },
      };
      // Legal fields are merged server-side, so only changed ones are sent
      const nextLegal = {
        operatorName: f.operatorName.value.trim(),
        operatorAddress: f.operatorAddress.value.trim(),
        operatorEmail: f.operatorEmail.value.trim(),
        hostingProvider: f.hostingProvider.value.trim(),
        retentionMonths: Number(f.retentionMonths.value),
        version: f.legalVersion.value.trim(),
        imprintUrl: f.imprintUrl.value.trim(),
        privacyUrl: f.privacyUrl.value.trim(),
        termsUrl: f.termsUrl.value.trim(),
      };
      if (!/^[\w.-]{1,40}$/.test(nextLegal.version)) return toast("Terms version: 1–40 letters, digits, dots, dashes or underscores", "error");
      if (!Number.isInteger(nextLegal.retentionMonths) || nextLegal.retentionMonths < 1 || nextLegal.retentionMonths > 60) {
        return toast("Retention must be a whole number of months between 1 and 60", "error");
      }
      if (nextLegal.operatorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextLegal.operatorEmail)) return toast("Operator email is not a valid email address", "error");
      const legalPatch = {};
      for (const [k, v] of Object.entries(nextLegal)) if (v !== (legal[k] ?? (typeof v === "number" ? null : ""))) legalPatch[k] = v;
      if (Object.keys(legalPatch).length) patch.legal = legalPatch;
      if (owner) {
        const admins = f.admins.value.split(/[\s,]+/).filter(Boolean);
        const bad = admins.find((a) => !SNOWFLAKE.test(a));
        if (bad) return toast(`"${bad}" is not a valid Discord user ID`, "error");
        patch.admins = [...new Set(admins)];
      }
      const saved = await busy(e.submitter, () => api("PUT", "/settings", patch));
      if (saved) { toast("Settings saved", "success"); refresh(); }
    });
  }

  // ======================================================================
  // Servers
  // ======================================================================
  const GUILD_CHANNEL_FIELDS = [
    ["submissionChannelId", "Submission channel", "Where players submit builds."],
    ["judgeChannelId", "Judge channel", "Where judge panels are posted."],
    ["leaderboardChannelId", "Leaderboard channel", "Changing it posts a new leaderboard message."],
    ["announcementChannelId", "Announcement channel", "Start/end/wrap-up announcements."],
  ];

  async function renderServers(main, seq, guildId) {
    const [guilds, locales] = await Promise.all([getGuilds(true), getLocales()]);
    if (isStale(seq)) return;
    const selected = guildId ? guilds.find((g) => g.id === guildId) : null;
    const view = mount(main, `
      <div class="page-head"><div><h1>Servers</h1><div class="sub">Servers the bot is in. Select one to configure it.</div></div></div>
      ${guilds.length ? `<div class="guild-grid">${guilds.map((g) => `
        <a class="guild-card${g.id === guildId ? " active" : ""}" href="#/servers/${esc(g.id)}">
          ${guildIcon(g)}<div class="min0"><div class="name">${esc(g.name)}</div>
          <div class="muted small">${g.config ? "Configured" : "Not configured"}</div></div>
        </a>`).join("")}</div>` : `<div class="empty">The bot is not in any server.</div>`}
      <div id="guild-detail">${guildId ? loadingHtml() : ""}</div>`);
    if (!guildId) return;
    const detail = $("#guild-detail", view);
    if (!selected) { detail.innerHTML = errorHtml("The bot is not in this server."); return; }

    let discord;
    try {
      discord = await api("GET", `/guilds/${encodeURIComponent(guildId)}/discord`);
    } catch (err) {
      if (!(err instanceof AuthError) && !isStale(seq)) detail.innerHTML = errorHtml(err.message);
      return;
    }
    if (isStale(seq)) return;

    const cfg = selected.config || {};
    const orig = {
      locale: cfg.locale ?? null,
      submissionChannelId: cfg.submissionChannelId ?? null,
      judgeChannelId: cfg.judgeChannelId ?? null,
      leaderboardChannelId: cfg.leaderboardChannelId ?? null,
      announcementChannelId: cfg.announcementChannelId ?? null,
      judgeRoleId: cfg.judgeRoleId ?? null,
      messageSubmissions: cfg.messageSubmissions ?? true,
    };
    const idOptions = (items, current, prefix) => {
      let html = `<option value="">— none —</option>`;
      html += items.map((c) => `<option value="${esc(c.id)}"${c.id === current ? " selected" : ""}>${esc(prefix + c.name)}</option>`).join("");
      if (current && !items.some((c) => c.id === current)) html += `<option value="${esc(current)}" selected>Unknown (${esc(current)})</option>`;
      return html;
    };
    detail.innerHTML = `
      <section class="card">
        <div class="card-head"><h2>${guildIcon(selected, "sm")}${esc(selected.name)}</h2><span class="muted small mono">${esc(selected.id)}</span></div>
        <form class="form" id="guild-form">
          <div class="form-grid">
            <label class="field"><span>Language</span>
              <select name="locale"><option value="">Default (global setting)</option>
                ${locales.map((l) => `<option value="${esc(l.code)}"${l.code === orig.locale ? " selected" : ""}>${esc(l.name || l.code)} (${esc(l.code)})</option>`).join("")}
              </select></label>
            ${GUILD_CHANNEL_FIELDS.map(([key, label, help]) => `
              <label class="field"><span>${esc(label)}</span>
                <select name="${key}">${idOptions(discord.channels, orig[key], "#")}</select>
                <span class="help">${esc(help)}</span></label>`).join("")}
            <label class="field"><span>Judge ping role</span>
              <select name="judgeRoleId">${idOptions(discord.roles, orig.judgeRoleId, "@")}</select>
              <span class="help">Pinged when new builds need judging.</span></label>
          </div>
          <label class="check"><input type="checkbox" name="messageSubmissions"${orig.messageSubmissions ? " checked" : ""}> Allow submissions by posting a message in the submission channel</label>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Save server</button></div>
        </form>
      </section>`;
    const form = $("#guild-form", detail);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = form.elements;
      const next = { locale: f.locale.value || null, messageSubmissions: f.messageSubmissions.checked };
      for (const [key] of GUILD_CHANNEL_FIELDS) next[key] = f[key].value || null;
      next.judgeRoleId = f.judgeRoleId.value || null;
      const patch = {};
      for (const key of Object.keys(next)) if (next[key] !== orig[key]) patch[key] = next[key];
      if (!Object.keys(patch).length) return toast("No changes to save");
      const saved = await busy(e.submitter, () => api("PUT", `/guilds/${encodeURIComponent(guildId)}`, patch));
      if (saved) { toast("Server saved", "success"); refresh(); }
    });
  }

  // ======================================================================
  // Events list
  // ======================================================================
  async function renderEvents(main, seq) {
    const events = await api("GET", "/events");
    if (isStale(seq)) return;
    const view = mount(main, `
      <div class="page-head"><h1>Events</h1></div>
      <details class="card" ${events.length ? "" : "open"}>
        <summary><strong>New event</strong></summary>
        <form class="form" id="new-event" style="margin-top:14px">
          <div class="form-grid">
            <label class="field"><span>Name</span><input type="text" name="name" maxlength="100" required></label>
            <label class="field"><span>Starts</span><input type="datetime-local" name="startsAt"></label>
            <label class="field"><span>Ends</span><input type="datetime-local" name="endsAt"></label>
          </div>
          <label class="field"><span>Description / rules</span><textarea name="description" maxlength="1024"></textarea></label>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Create event</button></div>
          <p class="muted small">New events start as DRAFT with default scoring. Add teams and judges before starting.</p>
        </form>
      </details>
      <section class="card">
        ${events.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Event</th><th>Status</th><th>Starts</th><th>Ends</th><th class="num">Teams</th><th class="num">Participants</th><th class="num">Builds</th></tr></thead>
          <tbody>${events.map((e) => `<tr>
            <td><a href="#/events/${e.id}">${esc(e.name)}</a> <span class="muted small">#${e.id}</span></td>
            <td>${badge(e.status)}</td>
            <td class="nowrap small">${esc(fmtDate(e.startsAt))}</td>
            <td class="nowrap small">${esc(fmtDate(e.endsAt))}</td>
            <td class="num">${fmtNum(e._count?.teams, 0)}</td>
            <td class="num">${fmtNum(e._count?.participants, 0)}</td>
            <td class="num">${fmtNum(e._count?.builds, 0)}</td></tr>`).join("")}
          </tbody></table></div>` : `<div class="empty">No events yet — create one above.</div>`}
      </section>`);
    const form = $("#new-event", view);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = form.elements;
      const body = {
        name: f.name.value.trim(),
        description: f.description.value.trim() || null,
        startsAt: fromLocalInput(f.startsAt.value),
        endsAt: fromLocalInput(f.endsAt.value),
      };
      const created = await busy(e.submitter, () => api("POST", "/events", body));
      if (created) { toast("Event created", "success"); location.hash = `#/events/${created.id}/general`; }
    });
  }

  // ======================================================================
  // Event detail
  // ======================================================================
  const TABS = [
    ["general", "General"], ["teams", "Teams"], ["servers", "Servers"], ["judges", "Judges"],
    ["participants", "Participants"], ["builds", "Builds"], ["leaderboard", "Leaderboard"],
    ["activity", "Activity"], ["actions", "Actions"],
  ];

  async function renderEvent(main, seq, eventId, tab) {
    if (!Number.isInteger(eventId) || eventId <= 0) throw new Error("Invalid event ID");
    if (!TABS.some(([k]) => k === tab)) tab = "general";
    const d = await api("GET", `/events/${eventId}`);
    if (isStale(seq)) return;
    d.teamById = new Map(d.teams.map((t) => [t.id, t]));
    const ev = d.event;
    const missing = d.coverage && !d.coverage.ok;
    const view = mount(main, `
      <div class="page-head">
        <div>
          <div class="small"><a href="#/events">← Events</a></div>
          <h1>${esc(ev.name)} ${badge(ev.status)}</h1>
          <div class="sub">#${ev.id} · ${d.teams.length} teams · ${d.judges.length} judges · ${d.guilds.length} servers</div>
        </div>
      </div>
      <nav class="tabs" aria-label="Event sections">
        ${TABS.map(([k, label]) => `<a href="#/events/${eventId}/${k}"${k === tab ? ` class="active" aria-current="page"` : ""}>${esc(label)}${k === "judges" && missing ? ` <span class="badge badge-danger">!</span>` : ""}</a>`).join("")}
      </nav>
      <div id="tab"></div>`);
    const host = $("#tab", view);
    await TAB_RENDERERS[tab](host, d, seq);
  }

  // ---------- General ----------
  function tabGeneral(host, d) {
    const ev = d.event;
    const sc = ev.scoring || {};
    host.innerHTML = `
      <form class="form" id="general-form">
        <div id="general-error"></div>
        <section class="card">
          <h2>Event</h2>
          <div class="form-grid">
            <label class="field"><span>Name</span><input type="text" name="name" maxlength="100" required value="${esc(ev.name)}"></label>
            <label class="field"><span>Status</span>
              <select name="status">${EVENT_STATUSES.map((s) => `<option${s === ev.status ? " selected" : ""}>${s}</option>`).join("")}</select>
              <span class="help">RUNNING requires full judge coverage (teams + 1).</span></label>
            <label class="field"><span>Starts</span><input type="datetime-local" name="startsAt" value="${esc(toLocalInput(ev.startsAt))}"></label>
            <label class="field"><span>Ends</span><input type="datetime-local" name="endsAt" value="${esc(toLocalInput(ev.endsAt))}"></label>
          </div>
          <label class="field"><span>Description / rules</span><textarea name="description" maxlength="1024" rows="6">${esc(ev.description)}</textarea></label>
          <label class="field"><span>Image URL</span><input type="url" name="imageUrl" value="${esc(ev.imageUrl)}" placeholder="https://…"></label>
          ${safeUrl(ev.imageUrl) ? `<img src="${esc(safeUrl(ev.imageUrl))}" alt="Event image" style="max-width:320px;max-height:160px;border-radius:8px;object-fit:cover">` : ""}
        </section>
        <section class="card">
          <h2>Scoring</h2>
          <div class="form-grid">
            <label class="field"><span>Base point options</span><input type="text" name="baseOptions" value="${esc((sc.baseOptions || []).join(", "))}" required>
              <span class="help">Comma separated, e.g. 0, 1, 2</span></label>
            <label class="field"><span>Effort max</span><input type="number" name="effortMax" min="0.01" max="100" step="any" value="${esc(sc.effortMax)}" required></label>
            <label class="field"><span>Detail max</span><input type="number" name="detailMax" min="0.01" max="100" step="any" value="${esc(sc.detailMax)}" required></label>
            <label class="field"><span>Step</span><input type="number" name="step" min="0.01" max="10" step="any" value="${esc(sc.step)}" required></label>
            <label class="field"><span>Base vote mode</span>
              <select name="baseVoteMode">
                <option value="majority"${sc.baseVoteMode === "majority" ? " selected" : ""}>Majority (ties → nearest to average)</option>
                <option value="average"${sc.baseVoteMode === "average" ? " selected" : ""}>Average</option>
              </select></label>
          </div>
          <label class="check"><input type="checkbox" name="judgesCanWin"${sc.judgesCanWin ? " checked" : ""}> Judges can win (appear in the ranking)</label>
          <p class="muted small">Builds by judges always count for their team; judges can never score their own builds.</p>
          <p class="muted small">After changing scoring rules, use "Recalculate scores" in the Actions tab.</p>
        </section>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Save event</button></div>
      </form>`;
    const form = $("#general-form", host);
    const errBox = $("#general-error", host);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errBox.innerHTML = "";
      const f = form.elements;
      const baseOptions = f.baseOptions.value.split(/[,;\s]+/).filter(Boolean).map(Number);
      if (!baseOptions.length || baseOptions.some((n) => !Number.isFinite(n))) return toast("Base point options must be numbers separated by commas", "error");
      const body = {
        name: f.name.value.trim(),
        description: f.description.value.trim() || null,
        imageUrl: f.imageUrl.value.trim() || null,
        status: f.status.value,
        startsAt: fromLocalInput(f.startsAt.value),
        endsAt: fromLocalInput(f.endsAt.value),
        scoring: {
          baseOptions,
          effortMax: Number(f.effortMax.value),
          detailMax: Number(f.detailMax.value),
          step: Number(f.step.value),
          baseVoteMode: f.baseVoteMode.value,
          judgesCanWin: f.judgesCanWin.checked,
        },
      };
      const btn = e.submitter;
      btn.disabled = true;
      try {
        await api("PUT", `/events/${d.event.id}`, body);
        toast("Event saved", "success");
        refresh();
      } catch (err) {
        if (err instanceof AuthError) return;
        if (err.status === 409) {
          errBox.innerHTML = `<div class="alert alert-error" role="alert"><strong>Cannot start the event</strong>${esc(err.message)}.
            <a href="#/events/${d.event.id}/judges">Open the Judges tab</a> to fix the coverage.</div>`;
          errBox.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        report(err);
      } finally {
        if (btn.isConnected) btn.disabled = false;
      }
    });
  }

  // ---------- Teams ----------
  function tabTeams(host, d) {
    let editing = null;
    host.innerHTML = `
      <section class="card">
        <h2 id="team-form-title">New team</h2>
        <form class="inline-form" id="team-form">
          <label class="field"><span>Name</span><input type="text" name="name" maxlength="60" required></label>
          <label class="field" style="flex:0 1 110px"><span>Emoji</span><input type="text" name="emoji" maxlength="64" placeholder="🔥"></label>
          <label class="field" style="flex:0 0 auto"><span>Color</span><input type="color" name="color" value="#5865f2"></label>
          <label class="field"><span>Location</span><input type="text" name="location" maxlength="100" placeholder="e.g. Germany"></label>
          <div class="form-actions"><button type="submit" class="btn btn-primary" data-submit>Add team</button>
            <button type="button" class="btn" data-cancel hidden>Cancel</button></div>
        </form>
      </section>
      <section class="card">
        <h2>Teams (${d.teams.length})</h2>
        ${d.teams.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Team</th><th>Color</th><th>Location</th><th class="num">ID</th><th></th></tr></thead>
          <tbody>${d.teams.map((t) => `<tr>
            <td>${teamChip(t)}</td><td class="mono">${esc(safeColor(t.color))}</td><td>${esc(t.location || "—")}</td>
            <td class="num muted">${t.id}</td>
            <td class="right nowrap"><button type="button" class="btn btn-sm" data-edit="${t.id}">Edit</button>
              <button type="button" class="btn btn-sm btn-danger" data-delete="${t.id}">Delete</button></td></tr>`).join("")}
          </tbody></table></div>` : `<div class="empty">No teams yet. Every event needs at least one team.</div>`}
      </section>`;
    const form = $("#team-form", host);
    const f = form.elements;
    const setEditing = (team) => {
      editing = team;
      $("#team-form-title", host).textContent = team ? `Edit team "${team.name}"` : "New team";
      $("[data-submit]", form).textContent = team ? "Save team" : "Add team";
      $("[data-cancel]", form).hidden = !team;
      f.name.value = team?.name || "";
      f.emoji.value = team?.emoji || "";
      f.color.value = safeColor(team?.color || "#5865f2").toLowerCase();
      f.location.value = team?.location || "";
      if (team) f.name.focus();
    };
    $("[data-cancel]", form).addEventListener("click", () => setEditing(null));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = { name: f.name.value.trim(), emoji: f.emoji.value.trim() || null, color: f.color.value, location: f.location.value.trim() || null };
      const res = await busy(e.submitter, () =>
        editing ? api("PUT", `/teams/${editing.id}`, body) : api("POST", `/events/${d.event.id}/teams`, body));
      if (res) { toast(editing ? "Team saved" : "Team added", "success"); refresh(); }
    });
    host.addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-edit]");
      if (edit) return setEditing(d.teamById.get(Number(edit.dataset.edit)));
      const del = e.target.closest("[data-delete]");
      if (!del) return;
      const team = d.teamById.get(Number(del.dataset.delete));
      const ok = await confirmDialog(`Delete team "${team.name}"?`,
        "Judges of this team are removed, participants and builds lose their team, and linked servers become neutral. This cannot be undone.",
        { danger: true, confirmLabel: "Delete team" });
      if (!ok) return;
      if (await busy(del, () => api("DELETE", `/teams/${team.id}`))) { toast("Team deleted", "success"); refresh(); }
    });
  }

  // ---------- Servers in the event ----------
  async function tabServers(host, d, seq) {
    const guilds = await getGuilds();
    if (isStale(seq)) return;
    const byId = new Map(guilds.map((g) => [g.id, g]));
    const linked = new Set(d.guilds.map((g) => String(g.guildId)));
    const free = guilds.filter((g) => !linked.has(g.id));
    host.innerHTML = `
      <section class="card">
        <h2>Link a server</h2>
        <p class="muted small">Each server belongs to one team, or is neutral (e.g. a server for neutral judges).</p>
        ${free.length ? `<form class="inline-form" id="link-form">
          <label class="field"><span>Server</span><select name="guildId" required>${free.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("")}</select></label>
          <label class="field"><span>Team</span><select name="teamId">${teamOptions(d.teams, null)}</select></label>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Link server</button></div>
        </form>` : `<div class="empty">All servers the bot is in are already linked.</div>`}
      </section>
      <section class="card">
        <h2>Linked servers (${d.guilds.length})</h2>
        ${d.guilds.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Server</th><th>Team</th><th></th></tr></thead>
          <tbody>${d.guilds.map((link) => {
            const gid = String(link.guildId);
            const g = byId.get(gid);
            return `<tr><td>${g ? `${guildIcon(g, "sm")}${esc(g.name)}` : `<span class="muted">Unknown server</span>`} <span class="muted small mono">${esc(gid)}</span></td>
              <td><select data-team="${esc(gid)}" aria-label="Team for this server">${teamOptions(d.teams, link.teamId)}</select></td>
              <td class="right"><button type="button" class="btn btn-sm btn-danger" data-unlink="${esc(gid)}">Unlink</button></td></tr>`;
          }).join("")}</tbody></table></div>` : `<div class="empty">No servers linked yet.</div>`}
      </section>`;
    const link = (guildId, teamId) =>
      api("PUT", `/events/${d.event.id}/guilds/${encodeURIComponent(guildId)}`, { teamId: teamId ? Number(teamId) : null });
    const form = $("#link-form", host);
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (await busy(e.submitter, () => link(form.elements.guildId.value, form.elements.teamId.value))) { toast("Server linked", "success"); refresh(); }
    });
    host.addEventListener("change", async (e) => {
      const sel = e.target.closest("[data-team]");
      if (!sel) return;
      if (await busy(sel, () => link(sel.dataset.team, sel.value))) { toast("Server team updated", "success"); refresh(); }
    });
    host.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-unlink]");
      if (!btn) return;
      const name = byId.get(btn.dataset.unlink)?.name || btn.dataset.unlink;
      if (!(await confirmDialog(`Unlink "${name}"?`, "The server will no longer take part in this event.", { danger: true, confirmLabel: "Unlink" }))) return;
      if (await busy(btn, () => api("DELETE", `/events/${d.event.id}/guilds/${encodeURIComponent(btn.dataset.unlink)}`))) { toast("Server unlinked", "success"); refresh(); }
    });
  }

  // ---------- Judges ----------
  function slotLabel(d, slot) {
    if (slot === "neutral") return "Neutral";
    const team = d.teamById.get(Number(String(slot).replace(/^team:/, "")));
    return team ? teamName(team) : slot;
  }

  function tabJudges(host, d) {
    const c = d.coverage || { required: d.teams.length + 1, total: d.judges.length, slots: [], missing: [], fragile: [], ok: false };
    const filled = c.slots.filter((s) => s.judges > 0).length;
    const slotClass = (s) => (s.judges === 0 ? "missing" : s.judges === 1 ? "fragile" : "good");
    const slotText = (s) => (s.judges === 0 ? "Missing — no judge" : s.judges === 1 ? "1 judge (fragile)" : `${s.judges} judges`);
    const slotKey = (j) => (j.teamId == null ? "neutral" : `team:${j.teamId}`);
    host.innerHTML = `
      <section class="card coverage ${c.ok ? "ok" : "bad"}" aria-labelledby="cov-title">
        <h2 id="cov-title">Judge coverage</h2>
        <div class="coverage-head">
          <span class="coverage-count">${filled} / ${c.required}</span>
          <span>slots filled · ${c.total} judge${c.total === 1 ? "" : "s"} total</span>
          ${c.ok ? `<span class="badge badge-ok">Ready to run</span>` : `<span class="badge badge-danger">Cannot start</span>`}
        </div>
        ${d.teams.length === 0 ? `<div class="alert alert-error"><strong>No teams yet</strong>Add at least one team before judges can be assigned.</div>` : ""}
        ${c.missing.length ? `<div class="alert alert-error"><strong>${c.missing.length} slot${c.missing.length === 1 ? "" : "s"} without a judge</strong>
          ${c.missing.map((s) => esc(slotLabel(d, s.slot))).join(", ")} — the event cannot be set to RUNNING until every slot has a judge.</div>` : ""}
        ${c.fragile.length ? `<div class="alert alert-warn"><strong>${c.fragile.length} fragile slot${c.fragile.length === 1 ? "" : "s"}</strong>
          ${c.fragile.map((s) => esc(slotLabel(d, s.slot))).join(", ")} only ${c.fragile.length === 1 ? "has" : "have"} one judge. That judge can't judge their own builds, so those builds would stay incomplete. Add a second judge.</div>` : ""}
        <div class="slots">${c.slots.map((s) => `<div class="slot ${slotClass(s)}">
          <div class="slot-name">${esc(slotLabel(d, s.slot))}</div><div class="slot-count">${slotText(s)}</div></div>`).join("")}</div>
        <p class="muted small">Every build needs one vote from each team's judges plus one neutral vote, so ${c.required} judges is the minimum
          (teams + 1). A judge can't judge their own builds — give each slot at least two judges if judges also build.</p>
      </section>
      <section class="card">
        <h2>Add judge</h2>
        <form class="inline-form" id="judge-form">
          <label class="field"><span>Discord user ID</span><input type="text" name="userId" inputmode="numeric" pattern="\\d{17,20}" required placeholder="e.g. 804386907244462141"></label>
          <label class="field"><span>Slot</span><select name="teamId">${teamOptions(d.teams, null, { neutral: "Neutral" })}</select></label>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Add judge</button></div>
        </form>
        <p class="muted small">Adding an existing judge again moves them to the selected slot.</p>
      </section>
      <section class="card">
        <h2>Judges by slot</h2>
        ${c.slots.map((s) => {
          const list = d.judges.filter((j) => slotKey(j) === s.slot);
          const team = s.teamId != null ? d.teamById.get(s.teamId) : null;
          return `<div class="judge-group"><h3>${team ? teamChip(team) : "Neutral"} <span class="slot-badge badge badge-${slotClass(s) === "good" ? "ok" : slotClass(s) === "fragile" ? "warn" : "danger"}">${list.length}</span></h3>
            ${list.length ? `<ul class="judge-list">${list.map((j) => `<li><span>${esc(j.displayName || "Unknown user")} <span class="muted small mono">${esc(j.userId)}</span></span>
              <button type="button" class="btn btn-sm btn-danger" data-remove="${j.id}">Remove</button></li>`).join("")}</ul>` : `<div class="empty">No judges in this slot.</div>`}</div>`;
        }).join("")}
      </section>`;
    const form = $("#judge-form", host);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userId = form.elements.userId.value.trim();
      if (!SNOWFLAKE.test(userId)) return toast("Enter a valid Discord user ID (17–20 digits)", "error");
      const teamId = form.elements.teamId.value;
      const res = await busy(e.submitter, () => api("POST", `/events/${d.event.id}/judges`, { userId, teamId: teamId ? Number(teamId) : null }));
      if (res) { toast(`Judge ${res.displayName || userId} added`, "success"); refresh(); }
    });
    host.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-remove]");
      if (!btn) return;
      const judge = d.judges.find((j) => j.id === Number(btn.dataset.remove));
      if (!(await confirmDialog(`Remove judge ${judge?.displayName || judge?.userId}?`, "Their existing votes stay; they can no longer vote.", { danger: true, confirmLabel: "Remove" }))) return;
      if (await busy(btn, () => api("DELETE", `/judges/${btn.dataset.remove}`))) { toast("Judge removed", "success"); refresh(); }
    });
  }

  // ---------- Participants ----------
  async function tabParticipants(host, d, seq) {
    const participants = await api("GET", `/events/${d.event.id}/participants`);
    if (isStale(seq)) return;
    const judgeIds = new Set(d.judges.map((j) => String(j.userId)));
    host.innerHTML = `
      <section class="card">
        <div class="card-head"><h2>Participants (${participants.length})</h2>
          <input type="search" id="part-search" placeholder="Search name or user ID" aria-label="Search participants" value="${esc(state.partSearch)}" style="max-width:280px"></div>
        ${participants.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Minecraft name</th><th>Discord ID</th><th>Team</th><th class="num">Points</th><th>Terms</th><th>Status</th><th></th></tr></thead>
          <tbody id="part-body"></tbody></table></div>` : `<div class="empty">Nobody has registered yet.</div>`}
      </section>`;
    const tbody = $("#part-body", host);
    if (!tbody) return;
    const draw = () => {
      const q = state.partSearch.trim().toLowerCase();
      const rows = participants.filter((p) => !q || p.minecraftName.toLowerCase().includes(q) || String(p.userId).includes(q));
      tbody.innerHTML = rows.length ? rows.map((p) => `<tr class="${p.banned ? "banned" : ""}">
          <td><strong>${esc(p.minecraftName)}</strong>${judgeIds.has(String(p.userId)) ? ` <span class="badge badge-info">Judge</span>` : ""}</td>
          <td class="mono small">${esc(p.userId)}</td>
          <td><select data-team="${p.id}" aria-label="Team of ${esc(p.minecraftName)}">${teamOptions(d.teams, p.teamId, { neutral: "No team" })}</select></td>
          <td class="num">${fmtNum(p.points)}</td>
          <td class="small nowrap">${p.termsAcceptedAt
            ? `v${esc(p.termsVersion || "?")} · ${esc(new Date(p.termsAcceptedAt).toLocaleDateString())}`
            : `<span class="badge badge-warn">Not accepted</span>`}</td>
          <td>${p.banned ? `<span class="badge badge-danger">Banned</span>` : `<span class="badge badge-ok">Active</span>`}</td>
          <td class="right nowrap"><button type="button" class="btn btn-sm" data-rename="${p.id}">Rename</button>
            <button type="button" class="btn btn-sm ${p.banned ? "" : "btn-danger"}" data-ban="${p.id}">${p.banned ? "Unban" : "Ban"}</button>
            <button type="button" class="btn btn-sm btn-danger" data-erase="${p.id}">Delete (GDPR)</button></td>
        </tr>`).join("") : `<tr><td colspan="7" class="muted">No participant matches.</td></tr>`;
    };
    draw();
    $("#part-search", host).addEventListener("input", (e) => { state.partSearch = e.target.value; draw(); });
    const byId = (id) => participants.find((p) => p.id === Number(id));
    const update = (p, body) => api("PUT", `/participants/${p.id}`, body).then((res) => { Object.assign(p, body); return res; });
    host.addEventListener("change", async (e) => {
      const sel = e.target.closest("[data-team]");
      if (!sel) return;
      const p = byId(sel.dataset.team);
      if (await busy(sel, () => update(p, { teamId: sel.value ? Number(sel.value) : null }))) toast(`${p.minecraftName} moved`, "success");
      else sel.value = p.teamId ?? "";
    });
    host.addEventListener("click", async (e) => {
      const ban = e.target.closest("[data-ban]");
      const ren = e.target.closest("[data-rename]");
      const erase = e.target.closest("[data-erase]");
      if (erase) {
        const p = byId(erase.dataset.erase);
        const reason = await dialog({
          title: `Delete ${p.minecraftName} (GDPR)?`, danger: true, confirmLabel: "Continue",
          message: "For erasure requests: the participant is deleted together with all their builds and points. Team and leaderboard totals change accordingly.",
          input: { label: "Reason (e.g. erasure request via email, date)", multiline: true, maxLength: 500 },
          validate: (v) => (v ? null : "A reason is required"),
        });
        if (!reason) return;
        if (!(await confirmDialog(`Permanently delete ${p.minecraftName}?`,
          "All their builds, votes on those builds and points are removed. This cannot be undone.",
          { danger: true, confirmLabel: "Delete participant" }))) return;
        if (await busy(erase, () => api("DELETE", `/participants/${p.id}`, { reason }))) {
          participants.splice(participants.indexOf(p), 1);
          toast(`${p.minecraftName} and all their builds deleted`, "success");
          draw();
        }
      } else if (ban) {
        const p = byId(ban.dataset.ban);
        const banned = !p.banned;
        if (banned && !(await confirmDialog(`Ban ${p.minecraftName}?`, "Banned participants can't submit builds and are hidden from leaderboards.", { danger: true, confirmLabel: "Ban" }))) return;
        if (await busy(ban, () => update(p, { banned }))) { toast(`${p.minecraftName} ${banned ? "banned" : "unbanned"}`, "success"); draw(); }
      } else if (ren) {
        const p = byId(ren.dataset.rename);
        const name = await dialog({
          title: `Rename ${p.minecraftName}`, confirmLabel: "Rename",
          input: { label: "New Minecraft name", value: p.minecraftName },
          validate: (v) => (MC_NAME.test(v) ? null : "3–16 characters: letters, digits and underscore"),
        });
        if (!name || name === p.minecraftName) return;
        if (await busy(ren, () => update(p, { minecraftName: name }))) { toast("Participant renamed", "success"); draw(); }
      }
    });
  }

  // ---------- Builds ----------
  async function tabBuilds(host, d, seq) {
    const f = state.builds;
    if (f.eventId !== d.event.id) Object.assign(f, { eventId: d.event.id, status: "", page: 0 });
    const [builds, participants] = await Promise.all([
      api("GET", `/events/${d.event.id}/builds?${qs({ status: f.status, page: f.page })}`),
      api("GET", `/events/${d.event.id}/participants`),
    ]);
    if (isStale(seq)) return;
    const pById = new Map(participants.map((p) => [p.id, p]));
    host.innerHTML = `
      <section class="card">
        <div class="card-head">
          <h2>Builds</h2>
          <div class="btn-row">
            <select id="build-status" aria-label="Filter by status" style="width:auto">
              <option value="">All statuses</option>
              ${BUILD_STATUSES.map((s) => `<option value="${s}"${s === f.status ? " selected" : ""}>${s.replace("_", " ")}</option>`).join("")}
            </select>
          </div>
        </div>
        ${builds.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Image</th><th>Build</th><th>Builder</th><th>Status</th><th>Votes</th><th class="num">Total</th><th></th></tr></thead>
          <tbody>${builds.map((b) => buildRow(b, d, pById)).join("")}</tbody></table></div>`
        : `<div class="empty">No builds${f.status ? ` with status ${esc(f.status)}` : ""}${f.page ? " on this page" : ""}.</div>`}
        <div class="btn-row" style="justify-content:space-between;margin-top:12px">
          <button type="button" class="btn btn-sm" data-page="-1"${f.page === 0 ? " disabled" : ""}>← Previous</button>
          <span class="muted small">Page ${f.page + 1}</span>
          <button type="button" class="btn btn-sm" data-page="1"${builds.length < PAGE_SIZE ? " disabled" : ""}>Next →</button>
        </div>
      </section>`;
    $("#build-status", host).addEventListener("change", (e) => { f.status = e.target.value; f.page = 0; refresh(); });
    host.addEventListener("click", async (e) => {
      const pg = e.target.closest("[data-page]");
      if (pg) { f.page = Math.max(0, f.page + Number(pg.dataset.page)); return refresh(); }
      const rf = e.target.closest("[data-refresh-build]");
      if (rf) {
        const res = await busy(rf, () => api("POST", `/builds/${rf.dataset.refreshBuild}/refresh`));
        if (res) toast(`Build #${rf.dataset.refreshBuild}: ${res.updated ?? 0} panel(s) updated, ${res.missing ?? 0} missing`, "success");
        return;
      }
      const del = e.target.closest("[data-delete-build]");
      if (del) {
        const id = del.dataset.deleteBuild;
        const reason = await dialog({
          title: `Delete build #${id}?`, danger: true, confirmLabel: "Delete build",
          message: "The build, its votes and its panels are removed and the builder's points recalculated.",
          input: { label: "Reason (shown in the activity log)", multiline: true, maxLength: 500 },
          validate: (v) => (v ? null : "A reason is required"),
        });
        if (!reason) return;
        if (await busy(del, () => api("DELETE", `/builds/${id}`, { reason }))) { toast(`Build #${id} deleted`, "success"); refresh(); }
      }
    });
  }

  function buildRow(b, d, pById) {
    const p = pById.get(b.participantId);
    const team = b.teamId != null ? d.teamById.get(b.teamId) : null;
    const img = safeUrl(b.images?.[0]);
    const ref = safeUrl(b.referenceLink);
    const votes = b.votes || [];
    return `<tr>
      <td>${img ? `<a href="${esc(img)}" target="_blank" rel="noopener noreferrer"><img class="thumb" src="${esc(img)}" alt="Build #${b.id}" loading="lazy"></a>` : `<span class="thumb-empty">no image</span>`}</td>
      <td><strong>#${b.id}</strong> ${esc(b.location)}<div class="muted small">${esc(b.referenceType)}${ref ? ` · <a href="${esc(ref)}" target="_blank" rel="noopener noreferrer">reference</a>` : ""}
        ${b.area != null ? ` · ${fmtNum(b.area)} area` : ""} · ${esc(fmtDate(b.createdAt))}</div></td>
      <td>${esc(p ? p.minecraftName : `#${b.participantId}`)}<div class="small">${team ? teamChip(team) : `<span class="muted">No team</span>`}</div></td>
      <td>${badge(b.status)}${b.status === "REJECTED" && b.rejectReason ? `<div class="muted small">${esc(b.rejectReason)}</div>` : ""}
        ${b.override ? `<div class="small"><span class="badge badge-warn">Corrected</span></div>` : ""}</td>
      <td>${votes.length ? `<ul class="votes">${votes.map((v) => `<li><strong>${esc(slotLabel(d, v.slot))}</strong>: ${esc(v.judgeName || v.judgeId)}
        — ${fmtNum(v.basePoints)} / ${fmtNum(v.effort)} / ${fmtNum(v.detail)}</li>`).join("")}</ul>
        <div class="muted small">${votes.length} / ${d.teams.length + 1} votes · base / effort / detail</div>` : `<span class="muted small">No votes</span>`}</td>
      <td class="num"><strong>${fmtNum(b.total)}</strong></td>
      <td class="right nowrap"><button type="button" class="btn btn-sm" data-refresh-build="${b.id}">Refresh panels</button>
        <button type="button" class="btn btn-sm btn-danger" data-delete-build="${b.id}">Delete</button></td>
    </tr>`;
  }

  // ---------- Leaderboard ----------
  async function tabLeaderboard(host, d, seq) {
    const lb = await api("GET", `/events/${d.event.id}/leaderboard`);
    if (isStale(seq)) return;
    const totals = lb.totals || {};
    const totalPoints = totals.points || 0;
    const share = (t) => (totalPoints > 0 ? (t.points / totalPoints) * 100 : 0);
    const rankById = new Map((lb.ranking || []).map((p) => [p.participantId, p.rank]));
    const players = (lb.players || []).filter((p) => p.points > 0 || p.builds > 0)
      .sort((a, b) => b.points - a.points || b.builds - a.builds || a.minecraftName.localeCompare(b.minecraftName));
    const tiles = [["Points", fmtNum(totals.points)], ["Complete builds", fmtNum(totals.builds, 0)], ["Submitted", fmtNum(totals.submitted, 0)],
      ["Pending", fmtNum(totals.pending, 0)], ["Rejected", fmtNum(totals.rejected, 0)], ["Area", fmtNum(totals.area)], ["Participants", fmtNum(totals.participants, 0)]];
    host.innerHTML = `
      <div class="tiles">${tiles.map(([l, v]) => `<div class="tile"><div class="label">${esc(l)}</div><div class="value">${esc(v)}</div></div>`).join("")}</div>
      ${lb.teams?.length ? `
      <section class="card">
        <div class="card-head"><h2>Points share</h2>
          ${lb.winner ? `<span class="badge badge-ok winner">Leader: ${esc(teamName(lb.winner))}</span>` : lb.draw ? `<span class="badge badge-warn winner">Draw</span>` : ""}</div>
        <div class="share-bar" role="img" aria-label="${esc(lb.teams.map((t) => `${t.name} ${Math.round(share(t))}%`).join(", "))}">
          ${lb.teams.filter((t) => t.points > 0).map((t) => `<span style="width:${share(t).toFixed(2)}%;background:${safeColor(t.color)}" title="${esc(t.name)}: ${fmtNum(t.points)}"></span>`).join("")}
        </div>
        ${totalPoints ? "" : `<p class="muted small">No points yet.</p>`}
      </section>
      <div class="team-cards">${lb.teams.map((t) => `
        <section class="card team-card" style="border-left-color:${safeColor(t.color)}">
          <div class="rank">#${t.rank}</div>
          <h3>${esc(teamName(t))}</h3>
          ${t.location ? `<div class="muted small">${esc(t.location)}</div>` : ""}
          <div class="points">${fmtNum(t.points)} <span class="muted small">pts · ${share(t).toFixed(1)}%</span></div>
          <div class="mini-bar"><span style="width:${share(t).toFixed(2)}%;background:${safeColor(t.color)}"></span></div>
          <dl><div><dt>Builds</dt><dd>${fmtNum(t.builds, 0)}</dd></div><div><dt>Area</dt><dd>${fmtNum(t.area)}</dd></div><div><dt>Members</dt><dd>${fmtNum(t.members, 0)}</dd></div></dl>
        </section>`).join("")}</div>` : `<div class="empty" style="margin-bottom:18px">No teams.</div>`}
      <section class="card">
        <h2>Overall ranking</h2>
        ${players.length ? `<div class="table-wrap"><table>
          <thead><tr><th class="num">Rank</th><th>Name</th><th>Team</th><th class="num">Points</th><th class="num">Builds</th><th class="num">Area</th></tr></thead>
          <tbody>${players.map((p) => {
            const team = p.teamId != null ? d.teamById.get(p.teamId) : null;
            const rank = rankById.get(p.participantId);
            return `<tr><td class="num">${rank ? `#${rank}` : `<span class="muted" title="Not eligible to win">—</span>`}</td>
              <td>${esc(p.minecraftName)}${p.isJudge ? ` <span class="badge badge-info">Judge</span>` : ""}</td>
              <td>${team ? teamChip(team) : `<span class="muted">No team</span>`}</td>
              <td class="num"><strong>${fmtNum(p.points)}</strong></td><td class="num">${fmtNum(p.builds, 0)}</td><td class="num">${fmtNum(p.area)}</td></tr>`;
          }).join("")}</tbody></table></div>
          <p class="muted small">${d.event.scoring?.judgesCanWin ? "Judges can win in this event." : "Judges are listed but not ranked, since judges cannot win in this event."}</p>`
        : `<div class="empty">Nobody has points yet.</div>`}
      </section>`;
  }

  // ---------- Activity ----------
  async function tabActivity(host, d, seq) {
    host.innerHTML = `<section class="card"><h2>Activity</h2><ul class="feed" id="feed"></ul>
      <div id="feed-empty"></div>
      <div class="btn-row" style="justify-content:center;margin-top:12px"><button type="button" class="btn" id="more" hidden>Load more</button></div></section>`;
    const feed = $("#feed", host);
    const more = $("#more", host);
    let lastId = null;
    const load = async () => {
      const items = await api("GET", `/activity?${qs({ eventId: d.event.id, limit: ACTIVITY_LIMIT, before: lastId })}`);
      if (isStale(seq)) return;
      if (!items.length && lastId == null) $("#feed-empty", host).innerHTML = `<div class="empty">No activity yet.</div>`;
      feed.insertAdjacentHTML("beforeend", items.map(activityItem).join(""));
      if (items.length) lastId = items[items.length - 1].id;
      more.hidden = items.length < ACTIVITY_LIMIT;
    };
    more.addEventListener("click", () => busy(more, load));
    await load();
  }

  function activityItem(a) {
    const bits = [];
    if (a.actor) bits.push(`<strong>${esc(a.actor)}</strong>`);
    else if (a.userId) bits.push(`<span class="mono">${esc(a.userId)}</span>`);
    if (a.buildId) bits.push(`build #${esc(a.buildId)}`);
    if (typeof a.points === "number") bits.push(`${a.points > 0 ? "+" : ""}${fmtNum(a.points)} pts`);
    return `<li><div class="when">${esc(fmtDate(a.createdAt))}</div>
      <div class="what">${badge(a.type)} ${bits.join(" · ")}${a.details ? `<div class="muted small">${esc(a.details)}</div>` : ""}</div></li>`;
  }

  // ---------- Actions ----------
  function tabActions(host, d) {
    const id = d.event.id;
    host.innerHTML = `
      <section class="card">
        <h2>Announcements</h2>
        <p class="muted small">Posts to the announcement channel of every linked server.</p>
        <div class="btn-row">
          <button type="button" class="btn" data-announce="start">Announce start</button>
          <button type="button" class="btn" data-announce="end">Announce end</button>
          <button type="button" class="btn" data-announce="wrapup">Post wrap-up</button>
        </div>
      </section>
      <section class="card">
        <h2>Maintenance</h2>
        <div class="btn-row">
          <button type="button" class="btn" data-act="boards">Update leaderboards now</button>
          <button type="button" class="btn" data-act="recalculate">Recalculate scores</button>
        </div>
        <p class="muted small">Recalculating re-evaluates every build, e.g. after teams, judges or scoring rules changed.</p>
      </section>
      <section class="card danger-zone">
        <h2>Danger zone</h2>
        <div class="danger-item"><div><strong>Clear builds</strong><p class="muted small">Deletes every build and vote of this event and resets all points to 0.</p></div>
          <button type="button" class="btn btn-danger" data-danger="clear">Clear builds</button></div>
        <div class="danger-item"><div><strong>Delete event</strong><p class="muted small">Deletes the event with all teams, judges, participants and builds.</p></div>
          <button type="button" class="btn btn-danger" data-danger="delete">Delete event</button></div>
        <div class="danger-item"><div><strong>Clear image storage</strong><p class="muted small">Deletes all stored images (for every event) except those below the keep prefix.</p></div>
          <button type="button" class="btn btn-danger" data-danger="storage">Clear images</button></div>
      </section>`;
    const count = (v) => (Array.isArray(v) ? v.length : typeof v === "number" ? v : v ? 1 : 0);
    host.addEventListener("click", async (e) => {
      const ann = e.target.closest("[data-announce]");
      const act = e.target.closest("[data-act]");
      const danger = e.target.closest("[data-danger]");
      if (ann) {
        const kind = ann.dataset.announce;
        if (!(await confirmDialog(`Post the ${kind} announcement?`, "This posts a message in every linked server.", { confirmLabel: "Post" }))) return;
        const res = await busy(ann, () => api("POST", `/events/${id}/announce`, { kind }));
        if (res) toast(`Announcement posted in ${count(res.posted)} channel(s)`, "success");
      } else if (act?.dataset.act === "boards") {
        const res = await busy(act, () => api("POST", `/events/${id}/boards`));
        if (res) toast(`${count(res.updated)} leaderboard(s) updated`, "success");
      } else if (act?.dataset.act === "recalculate") {
        if (!(await confirmDialog("Recalculate all scores?", "Every build of this event is re-evaluated. This may take a moment.", { confirmLabel: "Recalculate" }))) return;
        const res = await busy(act, () => api("POST", `/events/${id}/recalculate`));
        if (res) toast(`${res.builds} build(s) recalculated`, "success");
      } else if (danger?.dataset.danger === "clear") {
        const confirm = await typedConfirm(`Clear all builds of "${d.event.name}"?`, "All builds and votes are deleted and points reset. This cannot be undone.", `clear ${id}`);
        if (!confirm) return;
        if (await busy(danger, () => api("POST", `/events/${id}/clear-builds`, { confirm }))) toast("All builds cleared", "success");
      } else if (danger?.dataset.danger === "delete") {
        const confirm = await typedConfirm(`Delete "${d.event.name}"?`, "The event and everything in it is deleted permanently.", `delete ${id}`);
        if (!confirm) return;
        if (await busy(danger, () => api("DELETE", `/events/${id}`, { confirm }))) { toast("Event deleted", "success"); location.hash = "#/events"; }
      } else if (danger?.dataset.danger === "storage") {
        const confirm = await typedConfirm("Clear image storage?", "Deletes every stored image of all events except those below the keep prefix.", "clear images");
        if (!confirm) return;
        const res = await busy(danger, () => api("POST", "/storage/clear", { confirm }));
        if (res) toast(res.configured === false ? "Image storage is not configured" : `${res.deleted ?? 0} image(s) deleted`, res.configured === false ? "info" : "success");
      }
    });
  }

  const TAB_RENDERERS = {
    general: tabGeneral,
    teams: tabTeams,
    servers: tabServers,
    judges: tabJudges,
    participants: tabParticipants,
    builds: tabBuilds,
    leaderboard: tabLeaderboard,
    activity: tabActivity,
    actions: tabActions,
  };

  // ======================================================================
  // Boot
  // ======================================================================
  async function init() {
    $("#menu-toggle").addEventListener("click", (e) => {
      const open = $("#sidebar").classList.toggle("open");
      e.currentTarget.setAttribute("aria-expanded", String(open));
    });
    $("#logout").addEventListener("click", (e) => logout(e.currentTarget));
    window.addEventListener("hashchange", () => route());
    try {
      state.me = await api("GET", "/me");
    } catch (err) {
      if (err instanceof AuthError) return;
      $("#boot").hidden = true;
      $("#app").hidden = false;
      $("#main").innerHTML = errorHtml(err.message);
      return;
    }
    $("#whoami").textContent = `Logged in as ${state.me.userId}${state.me.owner ? " (owner)" : ""}`;
    $("#boot").hidden = true;
    $("#app").hidden = false;
    if (!location.hash) history.replaceState(null, "", "#/overview");
    route();
  }

  init();
})();
