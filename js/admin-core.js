/* ═══════════════════════════════════════════════════════════════════
       ADMIN SMART REFRESH — extends app.js smartRefresh
       ─────────────────────────────────────────────────────────────────
       HOW IT WORKS (zero duplication with app.js):
         1. app.js smartRefresh already handles:
              getCached("getAllData") → updates all globals → calls basic
              render fns → calls _dashSyncFromAdmin at the end.
            It also has _CACHE_BUST_ON_WRITE which auto-busts the right
            cache keys the moment any postData() succeeds — so we never
            need to manually bust cache here.

         2. This wrapper runs AFTER app.js's version completes and adds
            the admin-specific UI calls that app.js doesn't know about:
              contributions → _cr_buildFilterDropdowns, ct_ tracker dropdowns,
                              renderGoals (goals show collected totals),
                              updateSidebarSummary, request badge, YearlySummary bust
              expenses      → _exp_populateTypeDropdown, _et_buildTypeSelect,
                              _et_buildYearSelect, updateSidebarSummary, YearlySummary bust
              users         → loadSummary (total-members card),
                              bk_user bulk-insert dropdown rebuild
              types         → _cr_buildFilterDropdowns (type filter in records)
              occasions     → _cr_buildFilterDropdowns (occasion filter in records)
              expenseTypes  → _exp_populateTypeDropdown, _et_buildTypeSelect,
                              _et_buildYearSelect
              all           → everything above + _ct_buildOccasionSelect

         3. Falls back to init() if app.js original is unavailable.
    ═══════════════════════════════════════════════════════════════════ */

    /* ── Save the app.js original BEFORE overriding ── */
    window._origSmartRefresh = (typeof smartRefresh === "function") ? smartRefresh : null;

    /* ── Safe no-op caller: only invokes fn if it exists, swallows errors ── */
    function _sr_call(fn) {
      if (typeof fn === "function") {
        try { fn(); } catch(e) { console.warn("[smartRefresh] " + (fn.name || "?") + ":", e); }
      }
    }

    /* ── Centralized email quota UI refresh ──────────────────────────────
       Call this any time an email may have been consumed (contribution save,
       monthly report, birthday test send, bulk insert, walk-in save).
       Busts the quota cache then updates all 3 quota UI elements:
         • sb_email_quota   — sidebar "Email Today" counter
         • sb_quota_warn    — sidebar low-quota warning banner
         • ea_quota_display — Email Automation page quota bar
       Always busts cache first so the counter is live, not cached.
    ─────────────────────────────────────────────────────────────────── */
    function _refreshEmailQuotaUI() {
      // Bust both the app.js quota cache vars and the perf-cache layer
      window._quotaCache = null;
      window._quotaCacheTime = 0;
      if (typeof mandirCacheBust === "function") mandirCacheBust("getEmailQuota");
      if (typeof getEmailQuotaCached !== "function") return;

      getEmailQuotaCached().then(function(q) {
        if (!q || typeof q.used === "undefined") { console.warn("[QUOTA] Invalid quota response."); return; }
        var pct   = Math.round((q.used / q.limit) * 100);
        var color = q.remaining < 10 ? "#f87171"
                  : q.remaining < 30 ? "#fbbf24" : "#2DD4BF";
        var col2  = pct > 80 ? "#f87171" : pct > 50 ? "#fbbf24" : "#34d399";

        // 1. Sidebar — Email Today counter + warning banner
        var sbEq = document.getElementById("sb_email_quota");
        if (sbEq) { sbEq.style.color = color; sbEq.innerText = q.used + " / " + q.limit + " used"; }
        var warnEl = document.getElementById("sb_quota_warn");
        if (warnEl) warnEl.style.display = q.remaining < 10 ? "block" : "none";

        // 2. Email Automation page quota display (only updates if page is open)
        var eaEl = document.getElementById("ea_quota_display");
        if (eaEl) {
          eaEl.innerHTML = "<strong style='color:" + col2 + ";'>" + q.used +
            "</strong> used of <strong>" + q.limit +
            "</strong> today &nbsp;&middot;&nbsp; <strong style='color:#34d399;'>" +
            q.remaining + " remaining</strong>";
        }
      }).catch(function() {});
    }

    /* ─────────────────────────────────────────────────────────────────
       Extra UI calls per entity — these are what app.js is missing.
       Each function is called AFTER app.js's own render calls finish.
    ───────────────────────────────────────────────────────────────── */
    /* ── Helper: rebuild the contribution-form type & occasion <select> dropdowns ── */
    /* ── Shared idempotency-key generator ──
       Used across contrib/expense/walkin/bulk so a resend can never create a
       duplicate if the original attempt actually reached the backend but the
       response was lost (network blip). Rule of thumb used everywhere below:
         • "Retry as-is" (no edits) → REUSE the same key → backend safely no-ops
           if it already has that key, so the exact failed data is sent again.
         • "Edit & Retry" (data changed) → a FRESH key is generated because the
           payload is now genuinely different data, not a resend of the same one. */
    function _genIdemKey(prefix) {
      return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    }

    function _rebuildContribFormDropdowns() {
      var typeEl = document.getElementById("type");
      if (typeEl && typeof types !== "undefined") {
        var curType = typeEl.value;
        typeEl.innerHTML = '<option value="">-- Select Type --</option>' +
          types.map(function(t) {
            return '<option value="' + t.TypeId + '"' + (String(t.TypeId) === curType ? ' selected' : '') + '>' + escapeHtml(t.TypeName) + '</option>';
          }).join("");
      }
      var occEl = document.getElementById("occasion");
      if (occEl && typeof occasions !== "undefined") {
        var curOcc = occEl.value;
        occEl.innerHTML = '<option value="">-- None --</option>' +
          occasions.map(function(o) {
            return '<option value="' + o.OccasionId + '"' + (String(o.OccasionId) === curOcc ? ' selected' : '') + '>' + escapeHtml(o.OccasionName) + '</option>';
          }).join("");
      }
    }

    /* ── Helper: rebuild the expense-form type <select> dropdown ──
       Needed now that Add Expense also has an editable Review step (see
       addExpense()/_submitExpenseFromPreview()), which replaces the panel
       body the same way contribution's does, so the dropdown has to be
       rebuilt when the form is restored. */
    function _rebuildExpenseFormDropdowns() {
      var typeEl = document.getElementById("expenseType");
      if (typeEl && typeof expenseTypes !== "undefined") {
        var curType = typeEl.value;
        typeEl.innerHTML = expenseTypes.map(function(t) {
          return '<option value="' + t.ExpenseTypeId + '"' + (String(t.ExpenseTypeId) === curType ? ' selected' : '') + '>' + escapeHtml(t.Name || "") + '</option>';
        }).join("");
      }
    }
    window._rebuildExpenseFormDropdowns = _rebuildExpenseFormDropdowns;

    /* ── Helper: rebuild bulk-insert user dropdown ── */
    function _rebuildBkUserDropdown() {
      var bkUser = document.getElementById("bk_user");
      if (bkUser && typeof users !== "undefined") {
        bkUser.innerHTML = '<option value="">-- Select Member --</option>' + users
          .filter(function(u) {
            return u.Role !== "Admin" && String(u.Status || "").toLowerCase() === "active";
          })
          .map(function(u) {
            return '<option value="' + u.UserId + '">' + escapeHtml(u.Name) + '</option>';
          })
          .join("");
        if (typeof _cmbSyncLabel === "function") _cmbSyncLabel("bk_user");
        if (typeof _updateBkMemberPreview === "function") _updateBkMemberPreview("");
      }
    }

    /* ── Helper: sync Dashboard private data copies from updated admin globals ── */
    function _dashSyncAndRender() {
      if (typeof dash_contributions === "undefined") return;
      try {
        dash_contributions = (typeof data !== "undefined")         ? data.slice()        : dash_contributions;
        dash_expenses      = (typeof expenses !== "undefined")     ? expenses.slice()    : dash_expenses;
        dash_users         = (typeof users !== "undefined")        ? users.filter(function(u){ return (u.Role||"").toLowerCase() !== "admin"; }) : dash_users;
        dash_types         = (typeof types !== "undefined")        ? types.slice()       : dash_types;
        dash_expenseTypes  = (typeof expenseTypes !== "undefined") ? expenseTypes.slice(): dash_expenseTypes;
        dash_occasions     = (typeof occasions !== "undefined")    ? occasions.slice()   : dash_occasions;
        dash_yearConfig    = (typeof yearConfig !== "undefined")   ? yearConfig.slice()  : dash_yearConfig;
        // Re-apply filter and re-render all dashboard panels
        if (typeof dash_applyFilter === "function") dash_applyFilter();
      } catch(e) { console.warn("[_dashSyncAndRender]", e); }
    }

    var _srExtra = {

      contributions: function() {
        // Contribution records: power-filter dropdowns (type, occasion, year, user)
        _sr_call(_cr_buildFilterDropdowns);
        // REMOVED: _ct_buildYearSelect/_ct_buildTypeSelect/_ct_buildOccasionSelect
        // were undefined (not present in any tracker file) and were throwing a
        // ReferenceError here, which silently killed everything below in this
        // handler (renderGoals, cache-bust, badge refresh never ran).
        // Goals table shows collected totals from contributions
        _sr_call(renderGoals);
        // NOTE: app.js "contributions" case calls loadSummary() → updateSidebarSummary()
        //       → _hmOnPeriodChange() internally. Do NOT call any of them again here.
        // Bust yearly summary so next open is fresh
        mandirCacheBust("getYearlySummary");
        // NOTE: email quota is NOT refreshed here — receipt open/send has its own
        // dedicated hook (_refreshEmailQuotaUI). smartRefresh("contributions") is called
        // after SAVING a contribution, not after merely viewing/sending a receipt email.
        // Refresh pending-request badge quietly using getCached to avoid extra network hit
        getCached("getAllData").then(function(res) {
          if (res && Array.isArray(res.requests)) {
            window._allRequests = res.requests;
            _sr_call(_updateReqBadge);
          }
        }).catch(function(){});
        // D6: _dashSyncFromAdmin() is already called by app.js at end of smartRefresh.
      },

      expenses: function() {
        // Expense-form type dropdown
        _sr_call(_exp_populateTypeDropdown);
        // Expense tracker (et_) dropdowns
        _sr_call(_et_buildTypeSelect);
        _sr_call(_et_buildYearSelect);
        // NOTE: app.js "expenses" case calls loadSummary() already.
        // Bust yearly summary
        mandirCacheBust("getYearlySummary");
        // D6: _dashSyncFromAdmin() already called by app.js at end of smartRefresh.
      },

      users: function() {
        // NOTE: app.js "users" case does NOT call loadSummary — do it here.
        _sr_call(loadSummary);
        // D4: loadSummary() already calls updateSidebarSummary() internally — removed duplicate.
        // FIX-8: Payment Tracker uses users[] — re-render if tracker is open
        // Calls the single consolidated refreshTrackerData() (admin-tracker.js)
        // instead of duplicating the copy logic here — was calling the old dead
        // mock runTracker() (admin-features-misc.js) before.
        if (typeof refreshTrackerData === "function") {
          var trPage = document.getElementById("trackerPage");
          if (trPage && trPage.classList.contains("active")) _sr_call(refreshTrackerData);
        }
        // FIX-15: Re-fetch pending-request badge after user approve/reject
        getCached("getAllData").then(function(res) {
          if (res && Array.isArray(res.requests)) {
            window._allRequests = res.requests;
            _sr_call(_updateReqBadge);
          }
        }).catch(function(){});
        // approveUser and rejectUser both send an email — refresh quota counter
        setTimeout(_refreshEmailQuotaUI, 1200);
        // FIX: rebuild bulk-insert user dropdown
        _rebuildBkUserDropdown();
        // D6: _dashSyncFromAdmin() already called by app.js at end of smartRefresh.
      },

      types: function() {
        // Contribution records type-filter dropdown
        _sr_call(_cr_buildFilterDropdowns);
        // REMOVED: _ct_buildTypeSelect was undefined and threw, killing the line below.
        // FIX-10: Also rebuild the contribution FORM type <select>
        _rebuildContribFormDropdowns();
        // Tracker's own Type filter dropdown + re-render (real fix — single
        // consolidated refreshTrackerData(), safe to call repeatedly)
        _sr_call(refreshTrackerData);
      },

      occasions: function() {
        // Contribution records occasion-filter dropdown
        _sr_call(_cr_buildFilterDropdowns);
        // REMOVED: _ct_buildOccasionSelect was undefined and threw, killing the line below.
        // FIX-10: Also rebuild the contribution FORM occasion <select>
        _rebuildContribFormDropdowns();
      },

      expenseTypes: function() {
        // Expense-form type dropdown + tracker dropdowns
        _sr_call(_exp_populateTypeDropdown);
        _sr_call(_et_buildTypeSelect);
        _sr_call(_et_buildYearSelect);
      },

      goals: function() {
        // app.js "goals" case now calls renderGoals() + loadSummary().
        // D6: _dashSyncFromAdmin() already called by app.js at end of smartRefresh.
        // updateSidebarSummary is called internally by loadSummary — no extra call needed.
      },

      events: function() {
        // FIX-3: bust event cache and reload
        mandirCacheBust("getEventData");
        // L1: mandirCacheBust("getEvents") removed — "getEvents" is never fetched/cached.
        // Use _evBust() if available (defined in same block as _events),
        // otherwise fall back to direct flag (same-block access only)
        if (typeof _evBust === "function") _evBust();
        _sr_call(loadEvents);
        // FIX-4: event expenses are a subset of expenses — bust expense tracker too
        _sr_call(_et_buildYearSelect);
        // app.js "events" case now calls loadSummary() directly.
        // D6: _dashSyncFromAdmin() already called by app.js at end of smartRefresh.
      },

      expenses_from_event: function() {
        // FIX-4: Used after saveEventExpense — refreshes both event and expense views
        mandirCacheBust("getEventData");
        // L1: mandirCacheBust("getEvents") removed — "getEvents" is never fetched/cached.
        if (typeof _evBust === "function") _evBust();
        _sr_call(loadEvents);
        _sr_call(_exp_populateTypeDropdown);
        _sr_call(_et_buildTypeSelect);
        _sr_call(_et_buildYearSelect);
        // app.js "expenses_from_event" case now calls loadSummary() directly.
        mandirCacheBust("getYearlySummary");
        // D6: _dashSyncFromAdmin() already called by app.js at end of smartRefresh.
      },

      summary: function() {
        // D3: app.js "summary" case now calls loadSummary() directly — removed duplicate.
        // FIX-13: bust yearly summary cache so Dashboard re-reads fresh data
        mandirCacheBust("getYearlySummary");
        // D6: _dashSyncFromAdmin() already called by app.js at end of smartRefresh.
      },

      yearConfig: function() {
        // FIX-19: After saving year config / opening balance — re-render Dashboard
        // D8: single bust (removed duplicate inside the if block below)
        mandirCacheBust("getYearlySummary");
        // D3: app.js "yearConfig" case now calls loadSummary() directly — removed duplicate.
        // D6: _dashSyncFromAdmin() already called by app.js at end of smartRefresh.
        if (typeof loadYearSummary === "function") {
          var ysPage = document.getElementById("yearSummaryPage");
          if (ysPage && ysPage.classList.contains("active")) {
            loadYearSummary(); // cache already busted above — no second mandirCacheBust
          }
        }
      },

      requests: function() {
        // FIX-17: Dedicated entity for contribution request approve/reject
        // W1: use getCached instead of raw getData to avoid unnecessary network hit
        getCached("getAllData").then(function(res) {
          if (res && Array.isArray(res.requests)) {
            window._allRequests = res.requests;
            _sr_call(_updateReqBadge);
          }
        }).catch(function(){});
        // D3: app.js "requests" case now calls loadSummary() directly — removed duplicate.
        setTimeout(_refreshEmailQuotaUI, 1200);
        // D6: _dashSyncFromAdmin() already called by app.js at end of smartRefresh.
      },

      feedback: function() {
        // FIX-16: Feedback resolve/delete — re-render feedback admin table
        // app.js "feedback" case is now a no-op break, so no duplicate loadSummary here.
        if (typeof _fbAdminRender === "function") _sr_call(_fbAdminRender);
        else if (typeof renderFeedbackAdmin === "function") _sr_call(renderFeedbackAdmin);
      },

      broadcast: function() {
        // FIX-18: After sending broadcast — re-render broadcast history
        // app.js "broadcast" case is now a no-op break, so no duplicate loadSummary here.
        if (typeof renderBroadcastHistory === "function") _sr_call(renderBroadcastHistory);
        else if (typeof _bcRenderHistory === "function") _sr_call(_bcRenderHistory);
      },

      all: function() {
        // FIX-22: Run ALL extras including previously missing ones
        // D1: removed _sr_call(loadSummary)  — app.js "all" default already calls it.
        // D2: removed _sr_call(renderGoals)  — app.js "all" default already calls it.
        // D6: removed _sr_call(_dashSyncAndRender) — _dashSyncFromAdmin() fires via app.js.
        // L1: removed mandirCacheBust("getEvents") — "getEvents" is never fetched/cached.
        _sr_call(_cr_buildFilterDropdowns);
        // REMOVED: _ct_buildYearSelect/_ct_buildTypeSelect/_ct_buildOccasionSelect
        // were undefined and threw, silently killing everything below in "all".
        _sr_call(_exp_populateTypeDropdown);
        _sr_call(_et_buildTypeSelect);
        _sr_call(_et_buildYearSelect);
        _sr_call(loadEvents);
        // NOTE: loadSummary() calls _hmOnPeriodChange() internally — no extra call needed.
        _rebuildContribFormDropdowns();
        _rebuildBkUserDropdown();
        mandirCacheBust("getYearlySummary");
        mandirCacheBust("getEventData");
        // FIX-22: loadChatbotSettings was missing from "all"
        if (typeof loadChatbotSettings === "function") {
          var cbPage = document.getElementById("chatbotPage");
          if (cbPage && cbPage.classList.contains("active")) _sr_call(loadChatbotSettings);
        }
        // Refresh email quota counter in sidebar + EA page
        setTimeout(_refreshEmailQuotaUI, 1200);
        // W1: use getCached instead of raw getData
        getCached("getAllData").then(function(res) {
          if (res && Array.isArray(res.requests)) {
            window._allRequests = res.requests;
            _sr_call(_updateReqBadge);
          }
        }).catch(function(){});
      }
    };

    /**
     * window.smartRefresh(entity)
     *
     * Overrides app.js version to add admin-panel extras.
     * Execution order:
     *   1. app.js smartRefresh  → getCached → globals update → basic renders
     *                          → _dashSyncFromAdmin (dashboard cascade)
     *   2. _srExtra[entity]    → admin-specific dropdowns, sidebar, badge, etc.
     *
     * Cache busting is handled automatically by _CACHE_BUST_ON_WRITE in app.js
     * the moment postData() resolves — no manual busting needed here.
     *
     * All 28 call-sites (smartRefresh("contributions") etc.) work unchanged.
     */
    // ── Debounced smartRefresh ─────────────────────────────────────
    // When multiple callers fire smartRefresh() in quick succession
    // (e.g. bulk insert loop, cascade of postData writes), this collapses
    // them into a single render after 150 ms of silence.
    // Scoped-entity calls win: if "contributions" and then "all" both fire
    // within the window, the last call wins — which is always correct since
    // "all" is a superset. Zero change to any calling code.
    var _srDebounceTimer = null;
    var _srPendingEntity = null;

    window.smartRefresh = function(entity) {
      entity = entity || "all";

      // Accumulate entity — "all" is a superset so it always wins
      if (!_srPendingEntity || entity === "all") {
        _srPendingEntity = entity;
      }

      clearTimeout(_srDebounceTimer);
      _srDebounceTimer = setTimeout(function() {
        var resolvedEntity = _srPendingEntity || "all";
        _srPendingEntity   = null;
        _srDebounceTimer   = null;

        // Step 1 — run app.js original (async, returns a Promise)
        var origResult = (typeof window._origSmartRefresh === "function")
          ? window._origSmartRefresh(resolvedEntity)
          : (typeof init === "function" ? init() : Promise.resolve());

        // Step 2 — after original finishes, fire admin extras
        Promise.resolve(origResult).then(function() {
          var extraFn = _srExtra[resolvedEntity] || _srExtra["all"];
          try { extraFn(); } catch(e) {}
        }).catch(function(e) {
          var extraFn = _srExtra[resolvedEntity] || _srExtra["all"];
          try { extraFn(); } catch(e2) { console.warn("[smartRefresh extra fallback]", e2); }
          if (typeof init === "function") setTimeout(init, 200);
        });
      }, 150);
    };
    /* ═══════════════════════════════════════════════════════════════
       PERFORMANCE UTILITIES
       ─ debounce : prevents search functions firing on every keystroke
       ─ _apiCache: avoids duplicate API calls within the same session
    ═══════════════════════════════════════════════════════════════ */

    /**
     * debounce(fn, delay)
     * Returns a version of fn that only fires after 'delay' ms of silence.
     * Drop-in: anywhere you previously called fn() immediately on keyup,
     * assign the debounced wrapper once and call that instead.
     */
    function debounce(fn, delay) {
      delay = delay || 280;
      var _t;
      return function () {
        var ctx = this, args = arguments;
        clearTimeout(_t);
        _t = setTimeout(function () { fn.apply(ctx, args); }, delay);
      };
    }

    /**
     * _apiCache — lightweight TTL cache for getCached() results.
     * Data is stored in memory (not localStorage) so it's always fresh
     * after a hard reload, and busted via mandirCacheBust() as before.
     * TTL default: 60 s.  No logic change — getCached() still calls the
     * real API on miss; this layer just deduplicates repeat calls.
     */
    (function () {
      var _store = {};
      var TTL = 60000; // 60 s per entry
      window._perfCacheGet = function (key) {
        var e = _store[key];
        if (e && Date.now() < e.exp) return e.val;
        return undefined;
      };
      window._perfCacheSet = function (key, val) {
        _store[key] = { val: val, exp: Date.now() + TTL };
      };
      window._perfCacheDel = function (key) {
        delete _store[key];
      };
      // Hook into mandirCacheBust so our layer is also invalidated
      var _origBust = window.mandirCacheBust;
      window.mandirCacheBust = function (key) {
        _perfCacheDel(key);
        if (typeof _origBust === "function") _origBust(key);
      };
    })();

    /* ── SESSION — security: prevents back-button bypass + URL copy ── */
    function _checkAdminSession() {
      var s = JSON.parse(localStorage.getItem("session") || "null");

      // [FIX] This block claimed to "log every admin session check" but
      // never actually called console.log anywhere — pure dead code, so
      // the one diagnostic tool built for exactly this kind of "why did
      // my session just expire" report never produced any output. Now it
      // actually logs what this check saw, so a real failure shows
      // precisely which condition tripped (missing session, already-past
      // expiry, or a role mismatch) instead of leaving it a mystery.
      if (!s) {
        console.log("[session-check] no session object in localStorage");
      } else {
        var _timeLeftSec = Math.round((s.expiry - Date.now()) / 1000);
        console.log("[session-check] role=" + s.role + " timeLeftSec=" + _timeLeftSec +
          " expiry=" + new Date(s.expiry).toISOString() + " now=" + new Date().toISOString());
      }

      if (!s || Date.now() > s.expiry || s.role !== "Admin") {
        console.log("[session-check] FAILED — reason: " +
          (!s ? "no session" : Date.now() > s.expiry ? "expired (timeLeftSec was " + Math.round((s.expiry - Date.now()) / 1000) + ")" : "role was '" + s.role + "', expected 'Admin'"));
        // H12: try remember-me token before redirecting to login
        try {
          var rt = getRememberToken();
          console.log("[session-check] trying remember-token fallback: " +
            (rt ? ("found, role=" + rt.role + " timeLeftSec=" + Math.round((rt.expiry - Date.now()) / 1000)) : "no remember-token found"));
          if (rt && rt.role === "Admin" && Date.now() < rt.expiry) {
            // [FIX-24H] Previously hardcoded expiry:Date.now()+30*60*1000 here,
            // which silently capped a 24h "remember me" session back down to
            // 30 min on every restore — even though rt.expiry (the remember
            // token's own real expiry) still had up to 24h left. Reuse it
            // directly so this matches what "remember me" actually promised
            // and what the server now grants (see setSessionToken/rememberMe
            // in login.js and appscript.txt).
            s = {
              userId: rt.userId, name: rt.name, role: rt.role, email: rt.email || "",
              sessionToken: rt.sessionToken || "", expiry: rt.expiry, ttlMs: 24*60*60*1000
            };
            localStorage.setItem("session", JSON.stringify(s));
            return true;
          }
        } catch (e) { console.error("[ADMIN SESSION] remember-me restore error:", e); }
        localStorage.clear();
        history.replaceState(null, "", "login.html");
        location.replace("login.html");
        return false;
      }
      // Slide client-side expiry forward (mirrors server sliding window — 30 min
      // normal, 24h remember-me). [BUG FIX] Was hardcoded to 30 min regardless of
      // ttlMs, silently capping every "remember me" session's inactivity tolerance
      // to 30 min instead of the promised 24h. Falls back to 30 min for older
      // sessions that predate the ttlMs field.
      s.expiry = Date.now() + (s.ttlMs || 30 * 60 * 1000);
      localStorage.setItem("session", JSON.stringify(s));
      return true;
    }
    // checkSession() is defined in app.js (line 620) — no alias needed here.
    // The earlier alias (var checkSession = _checkAdminSession) was WRONG:
    // it overrode the working app.js function with undefined. Removed.

    if (!_checkAdminSession()) {
      /* stop */
    }
    // Block back-button re-entry after logout.
    // FIX: Only run on e.persisted (back/forward cache restore), NOT on fresh page load.
    // Previously fired on every load, causing a second getAllData → double login log entry.
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) _checkAdminSession();
    });
    // Block tab re-use with copied URL after session expires.
    // FIX: Guard with a 2s delay so this doesn't fire on the initial page load,
    // which was causing a second session-verify call and duplicate login log entries.
    var _vcReady = false;
    setTimeout(function () { _vcReady = true; }, 2000);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && _vcReady) _checkAdminSession();
    });

    // ── [SEC] TAB / BROWSER CLOSE — handled by the shared beforeunload
    // listener in app.js (uses sendLogoutBeacon(), a real sendBeacon() with a
    // JSON body — the only version of this that actually survives page
    // unload). This file used to register its own SEPARATE beforeunload here
    // that called postData() (a JSONP <script> request) as its primary path —
    // but browsers cancel any pending <script> request the instant the page
    // unloads, so that almost never actually ran, and its sendBeacon fallback
    // (inside .catch()) never fired either since the promise never settles on
    // a real close. Removed rather than left as a second, broken, duplicate
    // handler alongside the one that already works.

    // ── [SEC] SCREEN LOCK / APP SWITCH — Visibility API hidden-duration check
    // When a user locks their phone, switches apps, or minimises the browser,
    // the page becomes "hidden". If it stays hidden > 30 min we force logout on return.
    // This covers the scenario that beforeunload misses (screen lock never unloads page).
    var _pageHiddenAt = null;
    var _VISIBILITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        // Page just became hidden — record the time
        _pageHiddenAt = Date.now();
      } else {
        // Page became visible again — check how long it was hidden
        if (_pageHiddenAt !== null) {
          var hiddenDuration = Date.now() - _pageHiddenAt;
          _pageHiddenAt = null;
          if (hiddenDuration >= _VISIBILITY_TIMEOUT_MS) {
            // Hidden for 30+ min — treat as session timeout, force logout
            // [FIX] This still had the same postData()+3s-race pattern that
            // logout() just above was fixed to remove — same bug, same fix:
            // use the sendBeacon-based endSessionAndRedirect() instead of
            // racing a JSONP call against a timer.
            endSessionAndRedirect("Session expired - 30 min screen lock / inactivity", { clearAll: true });
            return;
          }
        }
        // Visible again within timeout — re-check session validity (existing behaviour)
        if (_vcReady) _checkAdminSession();
      }
    });

    // FIX: Show session-expiry warning banner if admin leaves tab open long
    (function _sessionExpiryBannerInit() {
      var _bannerShown = false;
      function _checkExpiry() {
        var s = JSON.parse(localStorage.getItem("session") || "null");
        var banner = document.getElementById("_sessionExpiryBanner");
        if (!banner) return;
        if (!s || !s.expiry) return;
        var remaining = s.expiry - Date.now();
        var msgEl = document.getElementById("_sessionExpiryBannerMsg");
        if (remaining > 0 && remaining < 5 * 60 * 1000) {
          if (!_bannerShown) {
            _bannerShown = true;
            banner.style.display = "flex";
            var minsLeft = Math.ceil(remaining / 60000);
            if (msgEl) msgEl.textContent = "⚠️ Session expires in ~" + minsLeft + " min. Save your work before it logs out.";
          }
        } else if (remaining <= 0) {
          banner.style.display = "none";
          _bannerShown = false;
        } else {
          // More than 5 mins remaining — hide if previously shown
          if (_bannerShown) {
            banner.style.display = "none";
            _bannerShown = false;
          }
        }
      }
      setInterval(_checkExpiry, 30000); // check every 30s
    })();

    function showUser() {
      let s = JSON.parse(localStorage.getItem("session"));
      if (!s) return;
      document.getElementById("welcomeUser").innerText = s.name || "Admin";
      // Populate brand text and dynamic placeholders from APP constants
      if (typeof APP !== "undefined") {
        const sb = document.getElementById("sidebarBrandSub");
        const ch = document.getElementById("chartHeaderBrand");
        if (sb) sb.textContent = APP.name;
        if (ch) ch.textContent = APP.name.toUpperCase();
        // Receipt prefix placeholders
        const ts = document.getElementById("dash_trackingSearch");
        const sc = document.getElementById("searchContrib");
        if (ts) ts.placeholder = APP.receiptPrefix + "-... or TRX-...";
        if (sc) sc.placeholder = "🔍 Search name, mobile, amount, " + APP.receiptPrefix + "-...";
      }
      // Set admin avatar if profile photo exists — loaded via proxy (fixes CORS/429 block)
      let myProfile = users.find(
        (u) => String(u.UserId) === String(s.userId)
      );
      if (myProfile?.PhotoURL) {
        _fetchAdminPhotoBase64(myProfile.PhotoURL).then(function(b64) {
          if (!b64) return;
          const av = document.getElementById("adminAvatar");
          if (av) { av.style.transition = "opacity 0.35s ease"; av.style.opacity = "0"; setTimeout(function() { av.src = b64; av.style.opacity = "1"; }, 160); }
        });
      }
    }

    // ── Extract Drive file ID from any Drive URL format ──────────────────────
    function _adminExtractDriveFileId(url) {
      if (!url) return "";
      const s = String(url).trim();
      if (s.includes("drive.google.com/thumbnail")) {
        const m = s.match(/[?&]id=([^&]+)/); if (m) return m[1].trim();
      } else if (s.includes("drive.google.com/uc")) {
        const m = s.match(/[?&]id=([^&]+)/); if (m) return m[1].trim();
      } else if (s.includes("lh3.googleusercontent.com/d/")) {
        return s.split("/d/")[1].split("?")[0].split("=")[0].trim();
      } else if (s.includes("drive.google.com/file/d/")) {
        return s.split("/file/d/")[1].split("/")[0].split("?")[0].trim();
      }
      return "";
    }

    // ── Fetch Drive photo as base64 via Apps Script proxy (solves CORS/429 block) ─
    // Caches per PhotoURL so header + profile modal share 1 backend request per session
    window._adminPhotoB64Cache = {};

    // Lazy-load Drive images set with data-drivesrc (avoids NS_BINDING_ABORTED)
    window._lazyLoadDriveImgs = function(container) {
      var imgs = (container || document).querySelectorAll('img[data-drivesrc]');
      imgs.forEach(function(img) {
        if (img.dataset.loaded) return;
        img.dataset.loaded = '1';
        var rawURL = img.dataset.rawphoto || '';
        var thumb  = img.dataset.drivesrc  || '';
        if (!rawURL && !thumb) return;
        (async function() {
          try {
            if (rawURL) {
              var b64 = await _fetchAdminPhotoBase64(rawURL);
              if (b64 && img.isConnected) { img.src = b64; return; }
            }
          } catch(e) {}
          if (thumb && img.isConnected) img.src = thumb;
        })();
      });
    };

    async function _fetchAdminPhotoBase64(photoURL) {
      if (!photoURL) return null;
      if (window._adminPhotoB64Cache[photoURL]) return window._adminPhotoB64Cache[photoURL];
      const fileId = _adminExtractDriveFileId(photoURL);
      if (!fileId) return null;
      try {
        const _s = JSON.parse(localStorage.getItem("session") || "{}");
        const res = await postData({ action: "getPhotoBase64", fileId: fileId, sessionToken: _s.sessionToken || "", userId: _s.userId || "" });
        if (res && res.status === "success" && res.base64) {
          window._adminPhotoB64Cache[photoURL] = res.base64;
          return res.base64;
        }
      } catch (e) { /* fall through — keep initials/default avatar */ }
      return null;
    }

    function logout() {
      // [FIX] This used the OLD postData()+setTimeout race pattern — the
      // exact bug endSessionAndRedirect() (app.js) was already built to fix
      // (see its comment block for the full explanation). user.js was
      // migrated to it already; this admin version never was. Now uses the
      // same proven sendBeacon-based helper — no race, and it also merges
      // what used to be two separate calls (a "logout" audit log call, plus
      // a separate "clearSessionToken" call) into the ONE combined backend
      // action (doPost, action:"logout") that already does both.
      endSessionAndRedirect("Admin clicked logout button", { clearAll: true });
    }

    function toggleAdminDropdown() {
      let d = document.getElementById("adminDropdown");
      if (!d.classList.contains("open")) {
        try {
          let s = JSON.parse(localStorage.getItem("session") || "{}");
          let nameEl = document.getElementById("adminDropName");
          let roleEl = document.getElementById("adminDropRole");
          let avEl   = document.getElementById("adminDropAvatar");
          if (nameEl) nameEl.textContent = s.name || "Admin";
          if (roleEl) roleEl.textContent = s.role || "Admin";
          if (avEl)   avEl.src = document.getElementById("adminAvatar")?.src || "";
        } catch(e) {}
        d.classList.add("open");
      } else {
        d.classList.remove("open");
      }
    }
    function closeAdminDropdown() {
      document.getElementById("adminDropdown").classList.remove("open");
    }

    // ── Admin activity notifications — sourced from the Audit Log, so
    // every add/update/delete (success or error) shows up automatically,
    // without needing to be wired into each individual function. Also
    // covers backend/system events (e.g. backup failures) the same way.
    window._adminNotifStore = window._adminNotifStore || [];
    const _ADMIN_NOTIF_SEEN_KEY = "admin_notif_seen_ids";

    function _adminNotifIdOf(n) {
      return String(n.time || "") + "|" + String(n.action || "") + "|" + String(n.actor || "");
    }

    function _getSeenAdminNotifIds() {
      try { return new Set(JSON.parse(localStorage.getItem(_ADMIN_NOTIF_SEEN_KEY) || "[]")); }
      catch (e) { return new Set(); }
    }

    function _markAdminNotifsSeen(ids) {
      try {
        const seen = _getSeenAdminNotifIds();
        ids.forEach(function (id) { seen.add(id); });
        const trimmed = Array.from(seen).slice(-400);
        localStorage.setItem(_ADMIN_NOTIF_SEEN_KEY, JSON.stringify(trimmed));
      } catch (e) { /* ignore storage errors */ }
    }

    const _ADMIN_NOTIF_DISMISSED_KEY = "admin_notif_dismissed_ids";

    function _getDismissedAdminNotifIds() {
      try { return new Set(JSON.parse(localStorage.getItem(_ADMIN_NOTIF_DISMISSED_KEY) || "[]")); }
      catch (e) { return new Set(); }
    }

    function _saveDismissedAdminNotifIds(set) {
      try {
        const trimmed = Array.from(set).slice(-400); // cap so this never grows unbounded
        localStorage.setItem(_ADMIN_NOTIF_DISMISSED_KEY, JSON.stringify(trimmed));
      } catch (e) { /* ignore storage errors */ }
    }

    // Removes one notification from view and remembers it so it doesn't
    // reappear on the next refresh (the Audit Log keeps growing, so this
    // dismissal has to persist by ID, not just by clearing the list).
    window._dismissAdminNotif = function (id) {
      const d = _getDismissedAdminNotifIds();
      d.add(id);
      _saveDismissedAdminNotifIds(d);
      _renderAdminNotifDropdown();
    };

    // Clears every notification currently in the tray at once.
    window._clearAllAdminNotifs = function () {
      const d = _getDismissedAdminNotifIds();
      window._adminNotifStore.forEach(function (n) { d.add(_adminNotifIdOf(n)); });
      _saveDismissedAdminNotifIds(d);
      _renderAdminNotifDropdown();
    };

    // Turns "SESSION_EXPIRED" / "SaveContribution" / "Delete Contribution"
    // into a readable title, whatever naming style was used when logged.
    function _prettifyAuditAction(action) {
      if (!action) return "Activity";
      if (/^[A-Z0-9_]+$/.test(action)) {
        return action.split("_").map(function (w) { return w.charAt(0) + w.slice(1).toLowerCase(); }).join(" ");
      }
      if (/\s/.test(action)) return action; // already "Delete Contribution" style
      return action.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, function (c) { return c.toUpperCase(); });
    }

    async function _loadAdminActivityNotifications() {
      const list = document.getElementById("adminNotifList");
      try {
        const res = await getData("getAuditLog");
        const rows = Array.isArray(res) ? res : [];
        window._adminNotifStore = rows
          .filter(function (r) {
            // Skip login/session security housekeeping (a separate concern),
            // keep everything else: real successes, failures, and system errors/warnings.
            if (r.Result === "BLOCKED") return false;
            const isRealActivity = r.Result === "SUCCESS" || r.Result === "FAILURE";
            const isSystemProblem = r.Severity === "ERROR" || r.Severity === "CRITICAL";
            return isRealActivity || isSystemProblem;
          })
          .slice(0, 60)
          .map(function (r) {
            const isError = r.Result === "FAILURE" || r.Severity === "ERROR" || r.Severity === "CRITICAL";
            return {
              action: r.Action || "",
              kind: isError ? "error" : "success",
              title: _prettifyAuditAction(r.Action),
              message: r.Error || r.Details || r.Reason || "",
              time: r.Timestamp || "",
              actor: r.UserAdmin || "",
            };
          });
      } catch (e) {
        window._adminNotifStore = [];
        if (list) list.innerHTML = '<div class="adm-notif-empty">Could not load activity.</div>';
        return;
      }
      _renderAdminNotifDropdown();
    }

    function _updateAdminNotifBadge() {
      const badge = document.getElementById("adminNotifBadge");
      if (!badge) return;
      const seen = _getSeenAdminNotifIds();
      const dismissed = _getDismissedAdminNotifIds();
      const unread = window._adminNotifStore.filter(function (n) { return !dismissed.has(_adminNotifIdOf(n)) && !seen.has(_adminNotifIdOf(n)); }).length;
      if (unread > 0) {
        badge.textContent = unread > 9 ? "9+" : String(unread);
        badge.style.display = "";
      } else {
        badge.style.display = "none";
      }
    }

    function _renderAdminNotifDropdown() {
      const list = document.getElementById("adminNotifList");
      if (!list) return;
      const dismissed = _getDismissedAdminNotifIds();
      const visible = window._adminNotifStore.filter(function (n) { return !dismissed.has(_adminNotifIdOf(n)); });
      if (visible.length === 0) {
        list.innerHTML = '<div class="adm-notif-empty">No recent activity</div>';
        _updateAdminNotifBadge();
        return;
      }
      const seen = _getSeenAdminNotifIds();
      list.innerHTML = visible.map(function (n) {
        const isUnread = !seen.has(_adminNotifIdOf(n));
        const nid = _adminNotifIdOf(n).replace(/'/g, "");
        return '<div class="adm-notif-item' + (isUnread ? ' unread' : '') + '">'
          + '<span class="adm-notif-icon">' + (n.kind === "error" ? "❌" : "✅") + '</span>'
          + '<div class="adm-notif-body">'
          + '<div class="adm-notif-title' + (n.kind === "error" ? ' error' : '') + '">' + escapeHtml(n.title) + '</div>'
          + (n.message ? '<div class="adm-notif-msg">' + escapeHtml(n.message) + '</div>' : '')
          + '<div class="adm-notif-meta">' + escapeHtml(n.actor || "Admin") + ' · ' + escapeHtml(_formatBcTime(n.time)) + '</div>'
          + '</div>'
          + '<button type="button" class="adm-notif-item-close" title="Clear this notification" onclick="event.stopPropagation();_dismissAdminNotif(\'' + nid + '\')">✕</button>'
          + '</div>';
      }).join("");
      _updateAdminNotifBadge();
    }

    function toggleAdminNotifDropdown() {
      const dd = document.getElementById("adminNotifDropdown");
      const wrap = document.getElementById("adminNotifWrap");
      if (!dd) return;
      const isOpen = dd.classList.toggle("open");
      if (isOpen) {
        // Reset any previous clamp before measuring fresh
        dd.style.left = "";
        dd.style.right = "0";
        requestAnimationFrame(function () {
          const rect = dd.getBoundingClientRect();
          const margin = 8;
          if (rect.left < margin && wrap) {
            const wrapRect = wrap.getBoundingClientRect();
            dd.style.right = "auto";
            dd.style.left = (margin - wrapRect.left) + "px";
          }
        });
        _markAdminNotifsSeen(window._adminNotifStore.map(_adminNotifIdOf));
        _renderAdminNotifDropdown();
      }
    }

    function closeAdminNotifDropdown() {
      const dd = document.getElementById("adminNotifDropdown");
      if (dd) dd.classList.remove("open");
    }

    document.addEventListener("click", function (e) {
      if (!e.target.closest("#adminNotifWrap")) closeAdminNotifDropdown();
    });

    // Load on startup, then refresh periodically so new activity (from this
    // admin or anyone else) shows up without needing a manual hook in every
    // add/update/delete function.
    _loadAdminActivityNotifications();
    setInterval(_loadAdminActivityNotifications, 45000);

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#adminAvatar") && !e.target.closest("#adminDropdown")) {
        closeAdminDropdown();
      }
    });
    let _adminSelfCroppedB64 = "";

    /* ── My Profile modal (view-only with action buttons) ── */
    function openAdminMyProfile() {
      let s = JSON.parse(localStorage.getItem("session") || "null");
      if (!s) { toast("Session expired.", "error"); return; }
      let myProfile = users.find((u) => String(u.UserId) === String(s.userId));
      if (!myProfile) { toast("Profile data not loaded yet.", "warn"); return; }
      let photoSrc = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='88' height='88'><circle cx='44' cy='44' r='44' fill='%230F766E'/><text x='44' y='56' text-anchor='middle' fill='white' font-size='36' font-family='Arial'>&#128100;</text></svg>";
      let fb = photoSrc;
      let st = String(myProfile.Status || "Active");
      let stC = st.toLowerCase() === "active" ? "#22c55e" : st.toLowerCase() === "pending" ? "#f59e0b" : "#ef4444";
      let rowStyle = "border-bottom:1px solid #fef3e2;";
      let rlStyle = "color:#64748b;font-size:12.5px;display:flex;align-items:center;gap:7px;";
      let iconBox = (icon) => `<span style="width:24px;height:24px;background:#fff7ed;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;"><i class="${icon}" style="color:#0F766E;font-size:11px;"></i></span>`;
      let html = `
        <div class="_mhdr" style="background:linear-gradient(135deg,#141b2d 0%,#2a0f00 60%,#3c1a00 100%);border-bottom:2px solid rgba(15, 118, 110,0.35);">
          <h3 style="color:#fff;display:flex;align-items:center;gap:8px;">
            <span style="width:28px;height:28px;background:rgba(15, 118, 110,0.18);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid fa-id-card" style="color:#0F766E;font-size:13px;"></i></span> My Profile
          </h3>
          <button class="_mcls" onclick="closeModal()" style="color:rgba(255,255,255,0.6);font-size:20px;line-height:1;background:none;border:none;cursor:pointer;padding:0;">×</button>
        </div>
        <div class="_mbdy" style="padding:0;">
          <div style="background:linear-gradient(180deg,#141b2d 0%,#2a0f00 60%,#3c1a00 100%);padding:26px 20px 20px;text-align:center;position:relative;overflow:hidden;">
            <div style="position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:radial-gradient(circle,rgba(15, 118, 110,0.15),transparent 70%);border-radius:50%;pointer-events:none;"></div>
            <div style="position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(15, 118, 110,0.4),transparent);"></div>
            <img id="_adminProfileModalPhoto" src="${escapeHtml(photoSrc)}" onerror="this.src='${fb}'"
              style="width:82px;height:82px;border-radius:50%;object-fit:cover;border:3px solid #0F766E;background:#eee;display:block;margin:0 auto 10px;box-shadow:0 4px 20px rgba(15, 118, 110,0.45);"/>
            <div style="color:#0F766E;font-size:1.05rem;font-weight:700;margin-bottom:8px;">${escapeHtml(myProfile.Name || "—")}</div>
            <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
              <span style="background:${stC};color:#fff;border-radius:20px;padding:3px 14px;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.2);">${escapeHtml(st)}</span>
              <span style="background:rgba(255,255,255,.1);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:3px 14px;font-size:11px;font-weight:600;">${escapeHtml(myProfile.Role || "Admin")}</span>
            </div>
          </div>
          <div style="padding:10px 20px 16px;background:#fff;">
            <div class="_row" style="${rowStyle}"><span class="_rl" style="${rlStyle}">${iconBox("fa-solid fa-mobile-screen")} Mobile</span><span class="_rv" style="font-weight:600;color:#1e293b;">${escapeHtml(String(myProfile.Mobile || "—"))}</span></div>
            <div class="_row" style="${rowStyle}"><span class="_rl" style="${rlStyle}">${iconBox("fa-solid fa-envelope")} Email</span><span class="_rv" style="word-break:break-all;font-weight:600;color:#1e293b;">${escapeHtml(myProfile.Email || "—")}</span></div>
            ${myProfile.Village ? `<div class="_row" style="${rowStyle}"><span class="_rl" style="${rlStyle}">${iconBox("fa-solid fa-map-pin")} Village</span><span class="_rv" style="font-weight:600;color:#1e293b;">${escapeHtml(myProfile.Village)}</span></div>` : ""}
            ${myProfile.Address ? `<div class="_row" style="${rowStyle}"><span class="_rl" style="${rlStyle}">${iconBox("fa-solid fa-location-dot")} Address</span><span class="_rv" style="white-space:pre-wrap;text-align:right;max-width:220px;font-weight:600;color:#1e293b;">${escapeHtml(myProfile.Address)}</span></div>` : ""}
            <div class="_row"><span class="_rl" style="${rlStyle}">${iconBox("fa-solid fa-id-card")} Admin ID</span><span class="_rv" style="font-family:monospace;font-size:12px;font-weight:700;color:#3c1a00;letter-spacing:.5px;">${escapeHtml(String(myProfile.UserId || "—"))}</span></div>
          </div>
        </div>
        <div class="_mft" style="flex-wrap:wrap;gap:8px;border-top:2px solid rgba(15, 118, 110,0.15);background:linear-gradient(90deg,rgba(15, 118, 110,0.04),transparent);">
          <button class="_mbtn" style="background:#64748b;box-shadow:none;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Close</button>
          <button class="_mbtn" style="background:linear-gradient(135deg,#2a0f00,#3c1a00);box-shadow:0 3px 10px rgba(42,15,0,0.3);" onclick="closeModal();openAdminChangePassword()"><i class="fa-solid fa-key" style="color:#0F766E;"></i> Change Password</button>
          <button class="_mbtn" style="background:linear-gradient(135deg,#0F766E,#e8920a);box-shadow:0 3px 10px rgba(15, 118, 110,0.35);" onclick="closeModal();openAdminEditProfileForm()"><i class="fa-solid fa-user-pen"></i> Edit Profile</button>
        </div>`;
      openModal(html, "460px");
      // Load real photo via proxy after modal is in DOM (avoids CORS/429 on Drive URLs)
      if (myProfile.PhotoURL) {
        _fetchAdminPhotoBase64(myProfile.PhotoURL).then(function(b64) {
          const imgEl = document.getElementById("_adminProfileModalPhoto");
          if (imgEl && b64) {
            imgEl.style.transition = "opacity 0.35s ease";
            imgEl.style.opacity = "0";
            setTimeout(function() { imgEl.src = b64; imgEl.style.opacity = "1"; }, 160);
          }
        });
      }
    }

    /* ── Edit Profile modal ── */
    function openAdminEditProfileForm(previewB64, prefillName, prefillEmail, prefillVillage, prefillAddress) {
      let s = JSON.parse(localStorage.getItem("session") || "null");
      if (!s) { toast("Session expired.", "error"); return; }
      let myProfile = users.find((u) => String(u.UserId) === String(s.userId));
      // Use previewB64 directly if available; for Drive URLs load async after modal opens
      let photoSrc = previewB64 || ""; // Drive photo loaded async below to avoid NS_BINDING_ABORTED
      let _rawPhotoURL = myProfile?.PhotoURL || "";
      let dN = prefillName     !== undefined ? prefillName     : myProfile?.Name    || s.name  || "";
      let dE = prefillEmail    !== undefined ? prefillEmail    : myProfile?.Email   || s.email || "";
      let dV = prefillVillage  !== undefined ? prefillVillage  : myProfile?.Village || "";
      let dA = prefillAddress  !== undefined ? prefillAddress  : myProfile?.Address || "";
      let fb = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='88' height='88'><circle cx='44' cy='44' r='44' fill='%230F766E'/><text x='44' y='56' text-anchor='middle' fill='white' font-size='36' font-family='Arial'>&#128100;</text></svg>";
      let html = `
        <div class="_mhdr" style="background:linear-gradient(135deg,#141b2d 0%,#2a0f00 60%,#3c1a00 100%);border-bottom:2px solid rgba(15, 118, 110,0.35);">
          <h3 style="color:#fff;display:flex;align-items:center;gap:8px;">
            <span style="width:28px;height:28px;background:rgba(15, 118, 110,0.18);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid fa-user-pen" style="color:#0F766E;font-size:13px;"></i></span> Edit Profile
          </h3>
          <button class="_mcls" onclick="closeModal()" style="color:rgba(255,255,255,0.6);font-size:20px;line-height:1;background:none;border:none;cursor:pointer;padding:0;">×</button>
        </div>
        <div class="_mbdy" style="text-align:center;">
          <div style="position:relative;width:88px;margin:0 auto 10px;">
            <img id="adminPhotoPreview" src="${escapeHtml(photoSrc)}" onerror="this.src='${fb}'"
              style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid #0F766E;background:#faeeda;display:block;margin-bottom:0;box-shadow:0 4px 14px rgba(15, 118, 110,0.25);"/>
            <div onclick="document.getElementById('adminPhotoFile').click()" style="position:absolute;bottom:2px;right:2px;width:28px;height:28px;background:#0F766E;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2);border:2.5px solid white;" title="Change Photo">
              <i class="fa-solid fa-camera" style="color:white;font-size:11px;"></i>
            </div>
          </div>
          <p style="font-size:11px;color:#aaa;margin:0 0 14px;">Tap the camera icon to change photo</p>
          <input type="file" id="adminPhotoFile" accept="image/*" style="display:none;" onchange="handleAdminSelfPhotoSelected(this)"/>
          <div style="text-align:left;">
            <label class="_fl">Full Name</label>
            <input class="_fi" id="asp_name" value="${escapeHtml(dN)}" placeholder="Your name"/>
            <label class="_fl">Email</label>
            <input class="_fi" id="asp_email" type="email" value="${escapeHtml(dE)}" placeholder="your@email.com"/>
            <label class="_fl">Mobile Number</label>
            <div style="background:#f8f8f8;border:1.5px solid #eee;border-radius:8px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <i class="fa-solid fa-mobile-screen" style="color:#0F766E;font-size:13px;"></i>
                <span style="color:#555;font-size:13px;font-weight:600;letter-spacing:1px;">${escapeHtml(String(myProfile?.Mobile || "—"))}</span>
              </div>
              <span style="color:#aaa;font-size:11px;font-weight:500;">(read-only)</span>
            </div>
            <label class="_fl">Village</label>
            <input class="_fi" id="asp_village" value="${escapeHtml(dV)}" placeholder="Village name"/>
            <label class="_fl">Address</label>
            <textarea class="_fi" id="asp_address" rows="2" placeholder="Full address" style="resize:vertical;min-height:52px;display:block;background:#fafafa;color:#333;cursor:text;">${escapeHtml(dA)}</textarea>
            <label class="_fl">Password</label>
            <div style="background:#f8f8f8;border:1.5px solid #eee;border-radius:8px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
              <span style="color:#aaa;letter-spacing:2px;font-size:14px;">••••••••</span>
              <span onclick="closeModal();openAdminChangePassword()" style="color:#3b82f6;font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline;white-space:nowrap;">
                <i class="fa-solid fa-key" style="margin-right:3px;"></i>Change
              </span>
            </div>
          </div>
        </div>
        <div class="_mft" style="border-top:2px solid rgba(15, 118, 110,0.15);background:linear-gradient(90deg,rgba(15, 118, 110,0.04),transparent);">
          <button class="_mbtn" style="background:#64748b;box-shadow:none;" onclick="closeModal();_adminSelfCroppedB64='';">Cancel</button>
          <button class="_mbtn" style="background:linear-gradient(135deg,#0F766E,#e8920a);box-shadow:0 3px 10px rgba(15, 118, 110,0.35);" onclick="saveAdminProfile()"><i class="fa-solid fa-check"></i> Save Changes</button>
        </div>`;
      openModal(html, "460px");
      // Async-load avatar after modal is in DOM — avoids NS_BINDING_ABORTED
      if (!previewB64 && _rawPhotoURL) {
        setTimeout(async function() {
          var imgEl = document.getElementById("adminPhotoPreview");
          if (!imgEl) return;
          // Try base64 proxy first
          try {
            var b64 = await _fetchAdminPhotoBase64(_rawPhotoURL);
            if (b64 && imgEl.isConnected) { imgEl.src = b64; return; }
          } catch(e) {}
          // Fallback: thumbnail URL (may work if user has Google cookies)
          var thumb = _driveImgSrc(_rawPhotoURL);
          if (thumb && imgEl.isConnected) imgEl.src = thumb;
        }, 80);
      }
    }

    function handleAdminSelfPhotoSelected(input) {
      let file = input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast("Photo must be under 5MB.", "error"); return; }
      let savedName    = document.getElementById("asp_name")?.value    || "";
      let savedEmail   = document.getElementById("asp_email")?.value   || "";
      let savedVillage = document.getElementById("asp_village")?.value || "";
      let savedAddress = document.getElementById("asp_address")?.value || "";
      openCropModal(file, function (base64) {
        _adminSelfCroppedB64 = base64;
        openAdminEditProfileForm(base64, savedName, savedEmail, savedVillage, savedAddress);
      });
    }

    /* ── Change Password modal ── */
    function openAdminChangePassword() {
      const html = `
        <div class="_mhdr" style="background:linear-gradient(135deg,#141b2d 0%,#2a0f00 60%,#3c1a00 100%);border-bottom:2px solid rgba(15, 118, 110,0.35);">
          <h3 style="color:#fff;display:flex;align-items:center;gap:8px;">
            <span style="width:28px;height:28px;background:rgba(15, 118, 110,0.18);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid fa-key" style="color:#0F766E;font-size:13px;"></i></span> Change Password
          </h3>
          <button class="_mcls" onclick="closeModal()" style="color:rgba(255,255,255,0.6);font-size:20px;line-height:1;background:none;border:none;cursor:pointer;padding:0;">×</button>
        </div>
        <div class="_mbdy">
          <p style="font-size:12.5px;color:#64748b;margin:0 0 16px;line-height:1.6;">
            Enter your current password to verify, then set a new one.<br>Minimum 6 characters.
          </p>
          <label class="_fl">Current Password</label>
          <div style="position:relative;margin-bottom:14px;">
            <input class="_fi" type="password" id="adm_cp_current" placeholder="Your current password" style="margin-bottom:0;padding-right:54px;"/>
            <span onclick="_admCpToggle('adm_cp_current',this)" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:12px;color:#888;cursor:pointer;font-weight:600;">Show</span>
          </div>
          <label class="_fl">New Password</label>
          <div style="position:relative;margin-bottom:6px;">
            <input class="_fi" type="password" id="adm_cp_new" placeholder="New password (min 6 chars)" style="margin-bottom:0;padding-right:54px;" oninput="_admCpStrength(this.value)"/>
            <span onclick="_admCpToggle('adm_cp_new',this)" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:12px;color:#888;cursor:pointer;font-weight:600;">Show</span>
          </div>
          <div id="adm_cp_strength" style="height:4px;border-radius:2px;background:#f1f5f9;margin:4px 0 12px;overflow:hidden;">
            <div id="adm_cp_strength_bar" style="height:100%;width:0%;border-radius:2px;transition:width .3s,background .3s;"></div>
          </div>
          <label class="_fl">Confirm New Password</label>
          <div style="position:relative;margin-bottom:6px;">
            <input class="_fi" type="password" id="adm_cp_confirm" placeholder="Repeat new password" style="margin-bottom:0;padding-right:54px;"/>
            <span onclick="_admCpToggle('adm_cp_confirm',this)" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:12px;color:#888;cursor:pointer;font-weight:600;">Show</span>
          </div>
          <div id="adm_cp_msg" style="font-size:12px;min-height:18px;margin-bottom:4px;"></div>
        </div>
        <div class="_mft" style="border-top:2px solid rgba(15, 118, 110,0.15);background:linear-gradient(90deg,rgba(15, 118, 110,0.04),transparent);">
          <button class="_mbtn" style="background:#64748b;box-shadow:none;" onclick="closeModal()">Cancel</button>
          <button class="_mbtn" id="adm_cp_save_btn" style="background:linear-gradient(135deg,#0F766E,#e8920a);box-shadow:0 3px 10px rgba(15, 118, 110,0.35);" onclick="saveAdminNewPassword()">
            <i class="fa-solid fa-key"></i> Update Password
          </button>
        </div>`;
      openModal(html, "420px");
      setTimeout(() => { let el = document.getElementById("adm_cp_current"); if (el) el.focus(); }, 120);
    }

    function _admCpToggle(inputId, btn) {
      let inp = document.getElementById(inputId);
      if (!inp) return;
      inp.type = inp.type === "password" ? "text" : "password";
      btn.textContent = inp.type === "text" ? "Hide" : "Show";
    }

    function _admCpStrength(val) {
      let bar = document.getElementById("adm_cp_strength_bar");
      if (!bar) return;
      let score = 0;
      if (val.length >= 6)           score++;
      if (val.length >= 10)          score++;
      if (/[A-Z]/.test(val))         score++;
      if (/[0-9]/.test(val))         score++;
      if (/[^A-Za-z0-9]/.test(val))  score++;
      let pct   = [0,25,50,70,85,100][Math.min(score,5)];
      let color = score<=1?"#ef4444":score<=2?"#f59e0b":score<=3?"#3b82f6":"#22c55e";
      bar.style.width = pct + "%";
      bar.style.background = color;
    }

    function _admCpMsg(msg, color) {
      let el = document.getElementById("adm_cp_msg");
      if (el) { el.textContent = msg; el.style.color = color || "#ef4444"; }
    }

    async function saveAdminNewPassword() {
      let currentVal = document.getElementById("adm_cp_current")?.value || "";
      let newVal     = document.getElementById("adm_cp_new")?.value     || "";
      let confirmVal = document.getElementById("adm_cp_confirm")?.value || "";
      if (!currentVal)            { _admCpMsg("Please enter your current password."); return; }
      if (newVal.length < 6)      { _admCpMsg("New password must be at least 6 characters."); return; }
      if (newVal !== confirmVal)  { _admCpMsg("New passwords do not match."); return; }
      if (newVal === currentVal)  { _admCpMsg("New password must be different from current."); return; }
      let btn = document.getElementById("adm_cp_save_btn");
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...'; btn._noAutoLoad = true; }
      try {
        let s = JSON.parse(localStorage.getItem("session") || "null");
        if (!s) { _admCpMsg("Session expired."); if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-key"></i> Update Password'; } return; }
        // [FIX] Removed a client-side "is current password right?" pre-check here.
        // It compared against myProfile.Password, but getUsers() strips Password
        // server-side for security — so that field is always empty and the check
        // could never actually fire. The server's changePassword action already
        // validates the old password correctly and returns a real error message
        // via res.message below, so nothing is lost by removing the dead check.
        let currentHash = await sha256(currentVal);
        let newHash = await sha256(newVal);
        let res = await postData({ action: "changePassword", UserId: s.userId, OldPassword: currentHash, NewPassword: newHash });
        if (res && res.status === "success") {
          closeModal();
          toast("✅ Password updated successfully!", "");
        } else {
          _admCpMsg(res?.message || "Current password is incorrect or update failed.");
          if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-key"></i> Update Password'; }
        }
      } catch(err) {
        _admCpMsg("Error: " + err.message);
        let b = document.getElementById("adm_cp_save_btn");
        if (b) { b.disabled=false; b.innerHTML='<i class="fa-solid fa-key"></i> Update Password'; }
      }
    }

    async function saveAdminProfile() {
      let s = JSON.parse(localStorage.getItem("session"));
      if (!s) { toast("Session expired. Please log in again.", "error"); return; }
      let myProfile = users.find((u) => String(u.UserId) === String(s.userId));
      let name    = (document.getElementById("asp_name")?.value    || "").trim();
      let email   = (document.getElementById("asp_email")?.value   || "").trim();
      let village = (document.getElementById("asp_village")?.value || "").trim();
      let address = (document.getElementById("asp_address")?.value || "").trim();
      if (!name) { toast("Name cannot be empty.", "error"); return; }
      let photoURL = myProfile?.PhotoURL || "";
      if (_adminSelfCroppedB64) {
        toast("Uploading photo...", "warn");
        try {
          let response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
              action: "uploadAndSaveProfile",
              UserId: s.userId, Name: name,
              Mobile: myProfile?.Mobile || "", Role: s.role,
              Password: "", Email: email,
              Village: village, Address: address,
              Status: myProfile?.Status || "Active",
              AdminName: name,
              base64: _adminSelfCroppedB64,
              fileName: "Admin_" + s.userId + "_" + Date.now() + ".jpg",
              oldPhotoURL: myProfile?.PhotoURL || "",
              userId: s.userId || "",
              sessionToken: s.sessionToken || ""
            }),
          });
          if (!response.ok) throw new Error("Server error: " + response.status);
          let res = await response.json();
          if (res.status === "success") { photoURL = res.photoUrl; toast("✅ Photo uploaded!"); }
          else toast("Photo upload failed, profile still updating.", "warn");
        } catch (e) { toast("Photo upload error: " + e.message, "warn"); }
      }
      try {
        let res = await postData({
          action: "updateUser",
          UserId: s.userId, Name: name,
          Mobile: myProfile?.Mobile || "", Role: s.role,
          Status: myProfile?.Status || "Active",
          Email: email, Village: village, Address: address,
          Password: "", PhotoURL: photoURL, AdminName: name,
        });
        if (res.status === "updated") {
          s.name = name; s.email = email;
          // [BUG FIX] Same ttlMs fix as _checkAdminSession() above — see comment there.
          s.expiry = Date.now() + (s.ttlMs || 30 * 60 * 1000);
          localStorage.setItem("session", JSON.stringify(s));
          _adminSelfCroppedB64 = "";
          toast("✅ Profile updated!");
          closeModal();
          smartRefresh("users");
        } else {
          toast("❌ Update failed.", "error");
        }
      } catch (err) {
        toast("❌ " + err.message, "error");
      }
    }

    function toggleSidebar() {
      document.querySelector(".sidebar").classList.toggle("active");
      document.querySelector(".overlay").classList.toggle("active");
      document.body.style.overflow = document
        .querySelector(".sidebar")
        .classList.contains("active")
        ? "hidden"
        : "auto";
    }
    function _quickNav(pageId, navSelector) {
      showPage(pageId, document.querySelector(navSelector));
      setTimeout(function() {
        var pg = document.getElementById(pageId);
        if (pg) pg.scrollIntoView({ behavior: "smooth", block: "start" });
        else window.scrollTo({ top: 0, behavior: "smooth" });
      }, 140);
    }

    function showPage(id, el) {
      const current = document.querySelector(".page.active");
      const next = document.getElementById(id);
      if (current && current !== next) {
        current.classList.add("page-exit");
        setTimeout(function () {
          current.classList.remove("active", "page-exit");
          next.classList.add("active");
        }, 120);
      } else {
        document.querySelectorAll(".page").forEach(function (p) { p.classList.remove("active", "page-exit"); });
        next.classList.add("active");
      }
      if (el) {
        document.querySelectorAll(".sidebar li").forEach(function (l) { l.classList.remove("active-nav"); });
        el.classList.add("active-nav");
      }
      if (window.innerWidth < 768) {
        document.querySelector(".sidebar").classList.remove("active");
        document.querySelector(".overlay").classList.remove("active");
        document.body.style.overflow = "auto";
      }
      if (id === "galleryAdminPage") loadGalleryAdmin();
      if (id === "announcementPage") loadAnnouncementAdmin();
      // Tracker: re-render with current live data every time the tab is opened,
      // instead of relying only on the one-time DOMContentLoaded poll (which
      // can miss data that loads after that poll gives up).
      if (id === "trackerPage" && typeof refreshTrackerData === "function") {
        refreshTrackerData();
      }
      // DRAFT: restore contribution draft when navigating to contribution page
      if (id === "contributionPage") {
        setTimeout(function() { if (typeof _restoreDraft === "function") _restoreDraft(); }, 250);
        setTimeout(function() { if (typeof _cr_buildFilterDropdowns === "function") _cr_buildFilterDropdowns(); }, 300);
      }
    }

    /* ══════════════════════════════
       GALLERY ADMIN — CROP & UPLOAD
       ══════════════════════════════ */