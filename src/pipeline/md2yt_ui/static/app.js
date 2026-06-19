// app.js — MD2YT UI client. Vanilla JS, no build step.
//
// Responsibilities:
//   1. Submit the upload form via fetch() (not a real form post).
//   2. Poll /runs/<brief_id> every 2s for any active (queued/running)
//      or recently-finished brief; update status badge, log panel,
//      and download links.
//
// We poll every row, not just the latest. Simple, robust, and the
// cost is trivial (a 25-min render produces maybe 500-2000 lines;
// each poll returns the tail of that).
//
// The form is disabled while a render is active, matching the
// server's "one render at a time" rule.

(() => {
  "use strict";

  const POLL_MS = 2000;
  const active = new Set();   // brief_ids currently being polled
  let serverBusy = false;     // mirrors the index page's is_busy

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────
  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function setBusy(isBusy) {
    serverBusy = isBusy;
    const btn = $("#upload-btn");
    if (btn) btn.disabled = isBusy;
  }

  function setMsg(text, kind) {
    const el = $("#upload-msg");
    if (!el) return;
    el.textContent = text || "";
    el.className = kind || "";
  }

  // ─────────────────────────────────────────────────────────────────
  // Polling
  // ─────────────────────────────────────────────────────────────────
  function pollRow(briefId) {
    return fetch(`/runs/${encodeURIComponent(briefId)}?tail=400`)
      .then(r => r.ok ? r.json() : null)
      .then(state => {
        if (!state) return;  // gone; stop polling
        renderState(state);
        if (state.status === "ok" || state.status === "failed") {
          active.delete(briefId);
          // Server-side "is_busy" drops back to false once the active
          // run finishes. We re-enable the form when this is the active
          // run.
          if ($(`tr[data-brief-id="${cssEscape(briefId)}"]`)) {
            // Keep polling once more after done to confirm cleanup,
            // then stop.
            setTimeout(() => active.delete(briefId), POLL_MS);
          }
        }
      })
      .catch(() => { /* network blip; retry next tick */ });
  }

  function cssEscape(s) {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function renderState(state) {
    const row = document.querySelector(`tr[data-brief-id="${cssEscape(state.brief_id)}"]`);
    if (!row) return;  // row removed (page reload); ignore

    // Update status badge.
    const badge = row.querySelector(".badge");
    if (badge) {
      badge.textContent = state.status;
      badge.className = `badge badge-${state.status}`;
    }

    // Update timestamps.
    const cells = row.querySelectorAll("td.muted.small");
    if (cells[0]) cells[0].textContent = state.started_at || "—";
    if (cells[1]) cells[1].textContent = state.finished_at || "—";

    // Update artifacts cell when run finishes ok.
    const artCell = row.querySelector("td.artifacts");
    if (state.status === "ok" && artCell && !artCell.dataset.ready) {
      artCell.innerHTML =
        `<a href="/runs/${encodeURIComponent(state.brief_id)}/mp4">MP4</a> ` +
        `<a href="/runs/${encodeURIComponent(state.brief_id)}/spec.json" download>spec.json</a>`;
      artCell.dataset.ready = "1";
    }

    // Append log lines into the log <pre> if we have one.
    const log = document.querySelector(`pre.log[data-brief-id="${cssEscape(state.brief_id)}"]`);
    if (log && state.log && state.log.length) {
      // The server returns the full tail each poll; we only append the
      // delta (lines we haven't seen yet).
      const seen = Number(log.dataset.seen || 0);
      const newLines = state.log.slice(seen);
      if (newLines.length) {
        // If the pre is still showing "…", replace it with the first chunk.
        if (log.textContent === "…") log.textContent = "";
        log.textContent += newLines.map(escapeHtml).join("\n") + "\n";
        log.dataset.seen = String(seen + newLines.length);
        // Auto-scroll if the user hasn't scrolled up.
        if (log.dataset.userScrolled !== "1") {
          log.scrollTop = log.scrollHeight;
        }
      }
    }

    // Hide the busy flag once nothing is running.
    if (state.status === "ok" || state.status === "failed") {
      // If no other row is queued/running, the server is free.
      const anyActive = Array.from(active).some(id => {
        const r = document.querySelector(`tr[data-brief-id="${cssEscape(id)}"] .badge`);
        return r && (r.textContent === "running" || r.textContent === "queued");
      });
      if (!anyActive) setBusy(false);
    }
  }

  function startPolling() {
    // Seed the active set from the server-rendered page: any row that
    // doesn't show artifacts is mid-flight (or failed) and needs polling.
    $$("#briefs-tbody tr[data-brief-id]").forEach(row => {
      const badge = row.querySelector(".badge");
      if (!badge) return;
      const status = badge.textContent.trim();
      const briefId = row.dataset.briefId;
      if (status === "queued" || status === "running" || status === "failed") {
        active.add(briefId);
        // Also ensure the log <pre> exists for failed runs (template
        // already includes one for running/queued/failed).
      }
      if (status === "running" || status === "queued") setBusy(true);
    });

    setInterval(() => {
      active.forEach(id => pollRow(id));
    }, POLL_MS);
  }

  // ─────────────────────────────────────────────────────────────────
  // Upload
  // ─────────────────────────────────────────────────────────────────
  function wireUpload() {
    const form = $("#upload-form");
    if (!form) return;
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const input = $("#brief-input");
      const file = input.files[0];
      if (!file) {
        setMsg("Pick a .md file first.", "err");
        return;
      }
      const fd = new FormData();
      fd.append("brief", file);
      setMsg("Uploading…");
      try {
        const res = await fetch("/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.status === 202) {
          setMsg(`Queued: ${data.brief_id}. Reload to track progress.`, "ok");
          // The server's busy flag flipped to true; reflect it so the
          // form is disabled until the run finishes. Polling on the
          // new row will pick up the queued→running→ok transition.
          setBusy(true);
          // Add the new brief_id to the active set so we poll it on
          // the next tick.
          active.add(data.brief_id);
          // We don't dynamically inject the new row — a refresh is the
          // simplest way to get the server-rendered template (and a
          // fresh log <pre>) in place. But to give the user immediate
          // feedback, force a poll right now.
          pollRow(data.brief_id);
        } else if (res.status === 409) {
          setMsg(data.error || "A render is already running.", "err");
        } else {
          setMsg(`Upload failed: ${res.status} ${data.error || ""}`, "err");
        }
      } catch (e) {
        setMsg(`Upload failed: ${e.message}`, "err");
      }
    });
  }

  // Pause auto-scroll when the user scrolls the log up so they can read.
  document.addEventListener("scroll", (ev) => {
    const el = ev.target;
    if (el && el.classList && el.classList.contains("log")) {
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
      el.dataset.userScrolled = atBottom ? "0" : "1";
    }
  }, true);

  // ─────────────────────────────────────────────────────────────────
  // Boot
  // ─────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    wireUpload();
    startPolling();
  });
})();
