(function() {
    "use strict";
    /* ════════════════════════════════════════════════════════
       FEATURE 3 — UNDO LAST DELETE (30-second window)
       Works for contributions and goals. In-memory only.
       Wraps del() and deleteGoal() — no API change needed.
    ════════════════════════════════════════════════════════ */
    var _undoQueue = null; // { type, payload, label, timer }

    function _showUndoToast(label, undoFn) {
      // Remove existing undo toast if any
      var ex = document.getElementById("_undoToast");
      if (ex) { ex.style.animation = "_undoSlideOut 0.2s ease forwards"; setTimeout(function(){ if(ex.parentNode) ex.remove(); }, 200); }
      if (_undoQueue && _undoQueue.timer) clearTimeout(_undoQueue.timer);
      if (_undoQueue && _undoQueue.rafId) cancelAnimationFrame(_undoQueue.rafId);

      var DURATION = 30000; // 30 seconds
      var _startTime = Date.now();

      var toastEl = document.createElement("div");
      toastEl.id = "_undoToast";
      toastEl.style.cssText =
        "position:fixed;top:68px;right:16px;" +
        "background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);" +
        "color:#fff;padding:14px 16px 14px 14px;border-radius:16px;" +
        "font-size:13px;font-family:Poppins,sans-serif;z-index:99999;" +
        "display:flex;align-items:center;gap:12px;" +
        "box-shadow:0 12px 40px rgba(0,0,0,0.45),0 0 0 1px rgba(255,255,255,0.06);" +
        "max-width:calc(100vw - 32px);box-sizing:border-box;" +
        "animation:_undoSlideIn 0.3s cubic-bezier(.34,1.56,.64,1);";

      // SVG countdown ring (38px circle, 30s drain)
      var R = 15, CIRC = 2 * Math.PI * R;
      toastEl.innerHTML =
        // Ring container
        '<div style="position:relative;flex-shrink:0;width:38px;height:38px;">' +
          '<svg width="38" height="38" viewBox="0 0 38 38" style="transform:rotate(-90deg);">' +
            '<circle cx="19" cy="19" r="' + R + '" fill="none" stroke="rgba(15, 118, 110,0.18)" stroke-width="3"/>' +
            '<circle id="_undoRing" cx="19" cy="19" r="' + R + '" fill="none" stroke="#0F766E" stroke-width="3"' +
            ' stroke-dasharray="' + CIRC + '" stroke-dashoffset="0" stroke-linecap="round"' +
            ' style="transition:stroke-dashoffset 0.1s linear;"/>' +
          '</svg>' +
          '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#0F766E;" id="_undoSec">30</span>' +
        '</div>' +
        // Text
        '<div style="flex:1;min-width:0;line-height:1.4;">' +
          '<div style="font-size:11px;font-weight:600;color:#0F766E;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:1px;">Deleted</div>' +
          '<div style="font-size:12.5px;font-weight:600;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + label + '">' + label + '</div>' +
        '</div>' +
        // Undo button
        '<button id="_undoBtn" onclick="_doUndo()" style="' +
          'background:linear-gradient(135deg,#0F766E,#f59e0b);border:none;color:#fff;' +
          'padding:7px 16px;border-radius:10px;cursor:pointer;font-weight:700;font-size:12px;' +
          'font-family:Poppins,sans-serif;box-shadow:0 4px 12px rgba(15, 118, 110,0.4);' +
          'white-space:nowrap;flex-shrink:0;transition:transform 0.1s,box-shadow 0.1s;' +
          'display:flex;align-items:center;gap:6px;">' +
          '<i class="fa-solid fa-rotate-left"></i> Undo' +
        '</button>';

      document.body.appendChild(toastEl);

      // Hover effects on undo button
      var btn = document.getElementById("_undoBtn");
      if (btn) {
        btn.onmouseenter = function(){ this.style.transform="scale(1.06)"; this.style.boxShadow="0 6px 18px rgba(15, 118, 110,0.55)"; };
        btn.onmouseleave = function(){ this.style.transform=""; this.style.boxShadow="0 4px 12px rgba(15, 118, 110,0.4)"; };
      }

      // Animate ring drain frame-by-frame
      function _animateRing() {
        var elapsed = Date.now() - _startTime;
        var progress = Math.min(elapsed / DURATION, 1);
        var ring = document.getElementById("_undoRing");
        var sec  = document.getElementById("_undoSec");
        if (ring) ring.style.strokeDashoffset = String(CIRC * progress);
        if (sec)  sec.textContent = String(Math.max(0, Math.ceil((DURATION - elapsed) / 1000)));
        // Change ring color to red in last 5s
        if (ring) ring.style.stroke = elapsed > DURATION * 0.83 ? "#ef4444" : "#0F766E";
        if (sec)  sec.style.color   = elapsed > DURATION * 0.83 ? "#ef4444" : "#0F766E";
        if (progress < 1 && document.getElementById("_undoToast")) {
          _undoQueue.rafId = requestAnimationFrame(_animateRing);
        }
      }

      _undoQueue = {
        undoFn: undoFn,
        rafId: requestAnimationFrame(_animateRing),
        timer: setTimeout(function() {
          var t = document.getElementById("_undoToast");
          if (t) { t.style.animation = "_undoSlideOut 0.25s ease forwards"; setTimeout(function(){ if(t.parentNode) t.remove(); }, 250); }
          _undoQueue = null;
        }, DURATION)
      };
    }

    window._doUndo = function() {
      if (!_undoQueue) return;
      clearTimeout(_undoQueue.timer);
      if (_undoQueue.rafId) cancelAnimationFrame(_undoQueue.rafId);
      var fn = _undoQueue.undoFn;
      _undoQueue = null;
      var t = document.getElementById("_undoToast");
      if (t) {
        // Flash green before dismissing
        t.style.background = "linear-gradient(135deg,#14532d,#166534)";
        t.style.boxShadow = "0 12px 40px rgba(34,197,94,0.35)";
        t.style.transition = "background 0.2s,box-shadow 0.2s";
        setTimeout(function(){ t.style.animation = "_undoSlideOut 0.25s ease forwards"; setTimeout(function(){ if(t.parentNode) t.remove(); }, 250); }, 200);
      }
      if (typeof fn === "function") fn();
    };

    // FIX: Expose _showUndoToast on window so del(), deleteGoal() and other
    // functions in outer scopes can reach it. Without this the typeof check
    // always returned false and the undo toast never appeared.
    window._showUndoToast = _showUndoToast;

    // Inject undo animation keyframes
    var undoStyle = document.createElement("style");
    undoStyle.textContent =
      "@keyframes _undoSlideIn { from{opacity:0;transform:translateX(30px) scale(0.95)} to{opacity:1;transform:translateX(0) scale(1)} }" +
      "@keyframes _undoSlideOut { from{opacity:1;transform:translateX(0) scale(1)} to{opacity:0;transform:translateX(30px) scale(0.92)} }";
    document.head.appendChild(undoStyle);


    /* ════════════════════════════════════════════════════════
       FEATURE 5 — PRINT RECEIPT
       app.js showReceipt() already includes a Print button (purple,
       calls printReceipt(rid)) that opens a full styled print window.
       The showReceipt wrapper injection has been removed to prevent a
       duplicate grey Print button alongside the existing one.
    ════════════════════════════════════════════════════════ */


        /* ════════════════════════════════════════════════════════
       FEATURE 6 — OFFLINE NETWORK STATUS BANNER
    ════════════════════════════════════════════════════════ */
    function _updateOfflineBanner() {
      var b = document.getElementById("_offlineBanner");
      if (!b) return;
      if (!navigator.onLine) {
        b.style.display = "flex";
        // Push sticky header down so banner is visible above it
        var hdr = document.querySelector(".header");
        if (hdr) hdr.style.top = "36px";
      } else {
        b.style.display = "none";
        var hdr = document.querySelector(".header");
        if (hdr) hdr.style.top = "";
      }
    }
    window.addEventListener("online",  _updateOfflineBanner);
    window.addEventListener("offline", _updateOfflineBanner);
    document.addEventListener("DOMContentLoaded", _updateOfflineBanner);


    /* ════════════════════════════════════════════════════════
       FEATURE 7 — AUTO-SAVE DRAFT FOR CONTRIBUTION FORM
       Saves: user, amount, month, year, type, occasion, note, paymentMode
       Restores on page load. Clears on successful save.
    ════════════════════════════════════════════════════════ */
    var _DRAFT_KEY = "_contrib_draft";
    var _DRAFT_FIELDS = ["user","amount","month","contribYear","type","occasion","note","paymentMode"];

    function _saveDraft() {
      var draft = {};
      _DRAFT_FIELDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) draft[id] = el.value;
      });
      // Save if any meaningful field is filled (not just amount/note)
      if (draft.amount || draft.note || draft.user || draft.type || draft.month) {
        try { localStorage.setItem(_DRAFT_KEY, JSON.stringify(draft)); } catch(e) {}
      }
    }

    function _restoreDraft() {
      try {
        var raw = localStorage.getItem(_DRAFT_KEY);
        if (!raw) return;
        var draft = JSON.parse(raw);
        var hasData = false;
        _DRAFT_FIELDS.forEach(function(id) {
          if (draft[id]) {
            var el = document.getElementById(id);
            if (el) { el.value = draft[id]; hasData = true; }
          }
        });
        if (hasData) {
          // Show a subtle banner that draft was restored
          var contribPage = document.getElementById("contributionPage");
          if (contribPage && !document.getElementById("_draftBanner")) {
            var banner = document.createElement("div");
            banner.id = "_draftBanner";
            banner.style.cssText =
              "background:linear-gradient(90deg,#fef9ec,#fef3c7);border:1px solid #5EEAD4;" +
              "border-radius:8px;padding:8px 14px;font-size:12px;color:#92400e;" +
              "display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;";
            banner.innerHTML =
              '<span><i class="fa-solid fa-clock-rotate-left" style="margin-right:6px;"></i>' +
              'Draft restored from your last session</span>' +
              '<button onclick="localStorage.removeItem(\'' + _DRAFT_KEY + '\');this.parentElement.remove();"' +
              'style="background:none;border:none;color:#92400e;cursor:pointer;font-size:12px;' +
              'font-weight:700;padding:0;box-shadow:none;">✕ Clear</button>';
            var firstCard = contribPage.querySelector(".card");
            if (firstCard) firstCard.insertBefore(banner, firstCard.firstChild);
          }
        }
      } catch(e) {}
    }

    // Wire up auto-save on input — FIX: use load event so all fields exist
    function _initDraftWatcher() {
      var debouncedSave = null;
      function _draftDebounce() {
        clearTimeout(debouncedSave);
        debouncedSave = setTimeout(_saveDraft, 800);
      }
      _DRAFT_FIELDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
          el.addEventListener("input",  _draftDebounce);
          el.addEventListener("change", _draftDebounce);
        }
      });

      // Draft restore is called directly in showPage() — no wrapper needed here
    }
    if (document.readyState === "complete") {
      setTimeout(_initDraftWatcher, 200);
    } else {
      window.addEventListener("load", function() { setTimeout(_initDraftWatcher, 200); });
    }


    /* ════════════════════════════════════════════════════════
       FEATURE 8 — BIRTHDAY ALERTS ON DASHBOARD
       Reads u.DOB from users array, shows in Smart Alerts.
    ════════════════════════════════════════════════════════ */
    function _getBirthdayAlerts() {
      if (typeof users === "undefined" || !users.length) return [];
      var today = new Date();
      var todayMM = today.getMonth() + 1;
      var todayDD = today.getDate();
      var alerts = [];

      users.forEach(function(u) {
        if (!u.DOB || String(u.Role || "").toLowerCase() === "admin") return;
        // DOB format: DD-MM-YYYY or YYYY-MM-DD
        var parts, mm, dd;
        if (/^\d{2}-\d{2}-\d{4}$/.test(u.DOB)) {
          parts = u.DOB.split("-"); dd = Number(parts[0]); mm = Number(parts[1]);
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(u.DOB)) {
          parts = u.DOB.split("-"); dd = Number(parts[2]); mm = Number(parts[1]);
        } else { return; }

        var daysUntil = 0;
        var thisBday = new Date(today.getFullYear(), mm - 1, dd);
        if (thisBday < today) thisBday.setFullYear(today.getFullYear() + 1);
        daysUntil = Math.round((thisBday - today) / 86400000);

        if (daysUntil === 0) {
          alerts.push({ type: "birthday", days: 0, name: u.Name, text: "🎂 Today is " + escapeHtml(u.Name) + "'s birthday! Consider sending a greeting." });
        } else if (daysUntil <= 7) {
          alerts.push({ type: "birthday", days: daysUntil, name: u.Name, text: "🎂 " + escapeHtml(u.Name) + "'s birthday in " + daysUntil + " day" + (daysUntil > 1 ? "s" : "") + "." });
        }
      });

      // Sort by days
      alerts.sort(function(a, b) { return a.days - b.days; });
      return alerts;
    }

    // Birthday alerts are injected directly inside _hmRenderAlerts — no patch needed here

  })();

