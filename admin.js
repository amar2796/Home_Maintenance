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
                  : q.remaining < 30 ? "#fbbf24" : "#60a5fa";
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

    /* ── Helper: rebuild bulk-insert user dropdown ── */
    function _rebuildBkUserDropdown() {
      var bkUser = document.getElementById("bk_user");
      if (bkUser && typeof users !== "undefined") {
        bkUser.innerHTML = users
          .filter(function(u) {
            return u.Role !== "Admin" && String(u.Status || "").toLowerCase() === "active";
          })
          .map(function(u) {
            return '<option value="' + u.UserId + '">' + escapeHtml(u.Name) + '</option>';
          })
          .join("");
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
        // Contribution tracker (ct_) dropdowns
        _sr_call(_ct_buildYearSelect);
        _sr_call(_ct_buildTypeSelect);
        _sr_call(_ct_buildOccasionSelect);
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
        if (typeof runTracker === "function") {
          var trPage = document.getElementById("trackerPage");
          if (trPage && trPage.classList.contains("active")) _sr_call(runTracker);
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
        // Tracker type select (stale after a new type is added)
        _sr_call(_ct_buildTypeSelect);
        // FIX-10: Also rebuild the contribution FORM type <select>
        _rebuildContribFormDropdowns();
      },

      occasions: function() {
        // Contribution records occasion-filter dropdown
        _sr_call(_cr_buildFilterDropdowns);
        // Tracker occasion select (stale after a new occasion is added)
        _sr_call(_ct_buildOccasionSelect);
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
        _sr_call(_ct_buildYearSelect);
        _sr_call(_ct_buildTypeSelect);
        _sr_call(_ct_buildOccasionSelect);
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

      // [DEBUG] Log every admin session check — visible in browser DevTools console
      if (!s) {
      } else {
        var _timeLeftSec = Math.round((s.expiry - Date.now()) / 1000);
      }

      if (!s || Date.now() > s.expiry || s.role !== "Admin") {
        // H12: try remember-me token before redirecting to login
        try {
          var rt = getRememberToken();
          if (rt && rt.role === "Admin" && Date.now() < rt.expiry) {
            s = {
              userId: rt.userId, name: rt.name, role: rt.role, email: rt.email || "",
              sessionToken: rt.sessionToken || "", expiry: Date.now() + 30 * 60 * 1000
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
      // Slide client-side expiry forward 30 min (mirrors server sliding window)
      s.expiry = Date.now() + 30 * 60 * 1000;
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

    // ── [SEC] TAB / BROWSER CLOSE — clear session on server via sendBeacon
    // sendBeacon is the only reliable way to fire a request on page unload.
    // Regular fetch/XHR gets cancelled when the tab closes.
    // _navFlag is set by logout() so we don't double-clear on intentional logout.
    window.addEventListener("beforeunload", function () {
      if (window._navFlag) return; // logout already cleared token — skip
      try {
        var s = JSON.parse(localStorage.getItem("session") || "{}");
        if (s && s.userId && s.sessionToken) {
          // [FIX-B] sendBeacon always POSTs → hits doPost, not doGet.
          // clearSessionToken was only in doGet so beacon was silently dropped.
          // postData (JSON body → doPost) is correct path. Beacon as fallback only.
          postData({
            action:       "clearSessionToken",
            userId:       s.userId,
            sessionToken: s.sessionToken || "",
            reason:       "Admin tab or browser closed"
          }).then(function(r){
          }).catch(function(){
            // Browser cancelled postData on unload — beacon as last resort
            try {
              var p = new URLSearchParams({ action:"clearSessionToken", userId:s.userId, reason:"unload-beacon-fallback", callback:"cb_unload" });
              navigator.sendBeacon(API_URL + "?" + p.toString());
            } catch(be){}
          });
        }
      } catch(e) { console.error("[ADMIN SESSION] beforeunload error:", e); }
    });

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
            // [FIX] Same race-condition fix as logout(): wait for clearSessionToken
            // JSONP to resolve before wiping localStorage + redirecting.
            try {
              var s = JSON.parse(localStorage.getItem("session") || "{}");
              if (s && s.userId) {
                var _visDone = false;
                function _visFinish() {
                  if (_visDone) return; _visDone = true;
                  localStorage.clear(); sessionStorage.clear(); location.replace("login.html");
                }
                postData({
                  action:       "clearSessionToken",
                  userId:       s.userId,
                  sessionToken: s.sessionToken || "",
                  reason:       "Session expired - 30 min screen lock / inactivity"
                }).then(function(){ _visFinish(); }).catch(function(){ _visFinish(); });
                setTimeout(_visFinish, 3000); // safety net
                return;
              }
            } catch(e) {}
            localStorage.clear(); sessionStorage.clear(); location.replace("login.html");
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
      // [FIX] postData is JSONP (async script tag). We must WAIT for clearSessionToken
      // to complete before calling localStorage.clear() + location.replace().
      // Previously localStorage.clear() ran synchronously right after postData() was
      // called — the page unloaded before the JSONP script tag even got a response,
      // so the token was never cleared in the sheet.
      function _doRedirect() {
        window._navFlag = true;
        clearRememberToken();
        localStorage.clear();
        sessionStorage.clear();
        history.replaceState(null, "", "login.html");
        location.replace("login.html");
      }
      try {
        var s = JSON.parse(localStorage.getItem("session") || "{}");
        if (s && s.userId) {
          var devInfo = typeof window._getDeviceInfo === "function" ? window._getDeviceInfo() : "";
          // Fire audit log (fire-and-forget, do not await)
          postData({ action: "logout", userId: s.userId, userName: s.name || "Admin",
                     deviceInfo: devInfo, logoutReason: "Admin clicked logout button" }).catch(function(){});
          // Clear server-side token FIRST, then redirect when done (or after 3s timeout)
          var _done = false;
          function _finish() { if (_done) return; _done = true; _doRedirect(); }
          postData({
            action:       "clearSessionToken",
            userId:       s.userId,
            sessionToken: s.sessionToken || "",
            reason:       "Admin clicked logout button"
          }).then(function(r) {
            _finish();
          }).catch(function(err) {
            _finish();
          });
          // Safety net: redirect after 3s even if postData never resolves
          setTimeout(_finish, 3000);
          return; // _doRedirect called by _finish above
        }
      } catch (e) { console.error("[ADMIN SESSION] logout error:", e); }
      _doRedirect(); // no session — redirect immediately
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
      let photoSrc = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='88' height='88'><circle cx='44' cy='44' r='44' fill='%23f7a01a'/><text x='44' y='56' text-anchor='middle' fill='white' font-size='36' font-family='Arial'>&#128100;</text></svg>";
      let fb = photoSrc;
      let st = String(myProfile.Status || "Active");
      let stC = st.toLowerCase() === "active" ? "#22c55e" : st.toLowerCase() === "pending" ? "#f59e0b" : "#ef4444";
      let rowStyle = "border-bottom:1px solid #fef3e2;";
      let rlStyle = "color:#64748b;font-size:12.5px;display:flex;align-items:center;gap:7px;";
      let iconBox = (icon) => `<span style="width:24px;height:24px;background:#fff7ed;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;"><i class="${icon}" style="color:#f7a01a;font-size:11px;"></i></span>`;
      let html = `
        <div class="_mhdr" style="background:linear-gradient(135deg,#141b2d 0%,#2a0f00 60%,#3c1a00 100%);border-bottom:2px solid rgba(247,160,26,0.35);">
          <h3 style="color:#fff;display:flex;align-items:center;gap:8px;">
            <span style="width:28px;height:28px;background:rgba(247,160,26,0.18);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid fa-id-card" style="color:#f7a01a;font-size:13px;"></i></span> My Profile
          </h3>
          <button class="_mcls" onclick="closeModal()" style="color:rgba(255,255,255,0.6);font-size:20px;line-height:1;background:none;border:none;cursor:pointer;padding:0;">×</button>
        </div>
        <div class="_mbdy" style="padding:0;">
          <div style="background:linear-gradient(180deg,#141b2d 0%,#2a0f00 60%,#3c1a00 100%);padding:26px 20px 20px;text-align:center;position:relative;overflow:hidden;">
            <div style="position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:radial-gradient(circle,rgba(247,160,26,0.15),transparent 70%);border-radius:50%;pointer-events:none;"></div>
            <div style="position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(247,160,26,0.4),transparent);"></div>
            <img id="_adminProfileModalPhoto" src="${escapeHtml(photoSrc)}" onerror="this.src='${fb}'"
              style="width:82px;height:82px;border-radius:50%;object-fit:cover;border:3px solid #f7a01a;background:#eee;display:block;margin:0 auto 10px;box-shadow:0 4px 20px rgba(247,160,26,0.45);"/>
            <div style="color:#f7a01a;font-size:1.05rem;font-weight:700;margin-bottom:8px;">${escapeHtml(myProfile.Name || "—")}</div>
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
        <div class="_mft" style="flex-wrap:wrap;gap:8px;border-top:2px solid rgba(247,160,26,0.15);background:linear-gradient(90deg,rgba(247,160,26,0.04),transparent);">
          <button class="_mbtn" style="background:#64748b;box-shadow:none;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Close</button>
          <button class="_mbtn" style="background:linear-gradient(135deg,#2a0f00,#3c1a00);box-shadow:0 3px 10px rgba(42,15,0,0.3);" onclick="closeModal();openAdminChangePassword()"><i class="fa-solid fa-key" style="color:#f7a01a;"></i> Change Password</button>
          <button class="_mbtn" style="background:linear-gradient(135deg,#f7a01a,#e8920a);box-shadow:0 3px 10px rgba(247,160,26,0.35);" onclick="closeModal();openAdminEditProfileForm()"><i class="fa-solid fa-user-pen"></i> Edit Profile</button>
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
      let fb = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='88' height='88'><circle cx='44' cy='44' r='44' fill='%23f7a01a'/><text x='44' y='56' text-anchor='middle' fill='white' font-size='36' font-family='Arial'>&#128100;</text></svg>";
      let html = `
        <div class="_mhdr" style="background:linear-gradient(135deg,#141b2d 0%,#2a0f00 60%,#3c1a00 100%);border-bottom:2px solid rgba(247,160,26,0.35);">
          <h3 style="color:#fff;display:flex;align-items:center;gap:8px;">
            <span style="width:28px;height:28px;background:rgba(247,160,26,0.18);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid fa-user-pen" style="color:#f7a01a;font-size:13px;"></i></span> Edit Profile
          </h3>
          <button class="_mcls" onclick="closeModal()" style="color:rgba(255,255,255,0.6);font-size:20px;line-height:1;background:none;border:none;cursor:pointer;padding:0;">×</button>
        </div>
        <div class="_mbdy" style="text-align:center;">
          <div style="position:relative;width:88px;margin:0 auto 10px;">
            <img id="adminPhotoPreview" src="${escapeHtml(photoSrc)}" onerror="this.src='${fb}'"
              style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid #f7a01a;background:#faeeda;display:block;margin-bottom:0;box-shadow:0 4px 14px rgba(247,160,26,0.25);"/>
            <div onclick="document.getElementById('adminPhotoFile').click()" style="position:absolute;bottom:2px;right:2px;width:28px;height:28px;background:#f7a01a;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2);border:2.5px solid white;" title="Change Photo">
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
                <i class="fa-solid fa-mobile-screen" style="color:#f7a01a;font-size:13px;"></i>
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
        <div class="_mft" style="border-top:2px solid rgba(247,160,26,0.15);background:linear-gradient(90deg,rgba(247,160,26,0.04),transparent);">
          <button class="_mbtn" style="background:#64748b;box-shadow:none;" onclick="closeModal();_adminSelfCroppedB64='';">Cancel</button>
          <button class="_mbtn" style="background:linear-gradient(135deg,#f7a01a,#e8920a);box-shadow:0 3px 10px rgba(247,160,26,0.35);" onclick="saveAdminProfile()"><i class="fa-solid fa-check"></i> Save Changes</button>
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
        <div class="_mhdr" style="background:linear-gradient(135deg,#141b2d 0%,#2a0f00 60%,#3c1a00 100%);border-bottom:2px solid rgba(247,160,26,0.35);">
          <h3 style="color:#fff;display:flex;align-items:center;gap:8px;">
            <span style="width:28px;height:28px;background:rgba(247,160,26,0.18);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid fa-key" style="color:#f7a01a;font-size:13px;"></i></span> Change Password
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
        <div class="_mft" style="border-top:2px solid rgba(247,160,26,0.15);background:linear-gradient(90deg,rgba(247,160,26,0.04),transparent);">
          <button class="_mbtn" style="background:#64748b;box-shadow:none;" onclick="closeModal()">Cancel</button>
          <button class="_mbtn" id="adm_cp_save_btn" style="background:linear-gradient(135deg,#f7a01a,#e8920a);box-shadow:0 3px 10px rgba(247,160,26,0.35);" onclick="saveAdminNewPassword()">
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
        let myProfile = users.find(u => String(u.UserId) === String(s.userId));
        if (!myProfile) { _admCpMsg("Profile not loaded. Please refresh."); if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-key"></i> Update Password'; } return; }
        let currentHash = await sha256(currentVal);
        let storedHash  = String(myProfile.Password || "").toLowerCase();
        if (storedHash && storedHash.length === 64 && currentHash !== storedHash) {
          _admCpMsg("Current password is incorrect.");
          if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-key"></i> Update Password'; }
          return;
        }
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
          s.expiry = Date.now() + 30 * 60 * 1000;
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
      // DRAFT: restore contribution draft when navigating to contribution page
      if (id === "contributionPage") {
        setTimeout(function() { if (typeof _restoreDraft === "function") _restoreDraft(); }, 250);
        setTimeout(function() { if (typeof _cr_buildFilterDropdowns === "function") _cr_buildFilterDropdowns(); }, 300);
      }
    }

    /* ══════════════════════════════
       GALLERY ADMIN — CROP & UPLOAD
       ══════════════════════════════ */
    var _glryB64 = null, _glryFileName = "";
    var _glrySrcImg = null;   // HTMLImageElement of original
    var _glrySrcFile = null;
    var _glryCropRatioW = 4, _glryCropRatioH = 3;
    /* crop frame in CANVAS pixel coords */
    var _gcf = { x: 0, y: 0, w: 0, h: 0 };
    /* active drag: null or { handle, sx,sy, fx,fy,fw,fh } */
    var _gcDrag = null;
    var _gcCanvasOffX = 0, _gcCanvasOffY = 0; // canvas top-left inside wrap

    /* ── helpers ── */
    function _gcClamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    /* ── Drop zone ── */
    function glryHandleDrop(e) {
      e.preventDefault();
      var dz = document.getElementById("glryDropZone");
      dz.style.borderColor = "#ddd"; dz.style.background = "rgba(247,160,26,0.04)";
      var f = e.dataTransfer.files[0];
      if (f) _glryProcessFile(f);
    }
    function handleGlryFileSelect(inp) {
      var f = inp.files[0];
      if (f) _glryProcessFile(f);
    }
    function _glryProcessFile(file) {
      if (!file.type.startsWith("image/")) { toast("Please select an image file.", "error"); return; }
      if (file.size > 5 * 1024 * 1024) { toast("Photo must be under 5MB.", "error"); return; }
      _glrySrcFile = file; _glryFileName = file.name;
      var r = new FileReader();
      r.onload = function (ev) {
        var img = new Image();
        img.onload = function () { _glrySrcImg = img; glryOpenCrop(); };
        img.src = ev.target.result;
      };
      r.readAsDataURL(file);
    }

    /* ── Re-crop ── */
    function glryReCrop() { if (_glrySrcImg) glryOpenCrop(); }

    /* ── Ratio picker ── */
    function glrySetRatio(w, h, btn) {
      _glryCropRatioW = w; _glryCropRatioH = h;
      document.querySelectorAll(".gcr-ratio-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      if (_glrySrcImg && document.getElementById("glryCropOverlay").classList.contains("open")) {
        _glryInitFrame();
      }
    }

    /* ── Open crop modal ── */
    function glryOpenCrop() {
      document.getElementById("glryCropOverlay").classList.add("open");
      document.body.style.overflow = "hidden";
      // Wait one frame for modal to be visible so offsetWidth is correct
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          _glryDrawCanvas();
          _glryInitFrame();
          _glryAttachCropEvents();
        });
      });
    }

    /* ── Draw source image onto canvas ── */
    function _glryDrawCanvas() {
      var canvas = document.getElementById("glryCropCanvas");
      var wrap = document.getElementById("glryCropCanvasWrap");
      var maxW = wrap.clientWidth || 520;
      var maxH = 330;
      var iw = _glrySrcImg.naturalWidth, ih = _glrySrcImg.naturalHeight;
      var scale = Math.min(maxW / iw, maxH / ih, 1);
      canvas.width = Math.round(iw * scale);
      canvas.height = Math.round(ih * scale);
      var ctx = canvas.getContext("2d");
      ctx.drawImage(_glrySrcImg, 0, 0, canvas.width, canvas.height);
      /* record canvas offset inside wrap (centred by flexbox) */
      var cr = canvas.getBoundingClientRect();
      var wr = wrap.getBoundingClientRect();
      _gcCanvasOffX = cr.left - wr.left;
      _gcCanvasOffY = cr.top - wr.top;
    }

    /* ── Init frame centred, filling maximum space at chosen ratio ── */
    function _glryInitFrame() {
      var canvas = document.getElementById("glryCropCanvas");
      var cw = canvas.width, ch = canvas.height;
      var rw = _glryCropRatioW, rh = _glryCropRatioH;
      var fw, fh;
      if (cw / rw * rh <= ch) { fw = cw; fh = Math.round(fw * rh / rw); }
      else { fh = ch; fw = Math.round(fh * rw / rh); }
      _gcf = { x: Math.round((cw - fw) / 2), y: Math.round((ch - fh) / 2), w: fw, h: fh };
      _glryRenderFrame();
    }

    /* ── Position frame div + update SVG darken + info label ── */
    function _glryRenderFrame() {
      var canvas = document.getElementById("glryCropCanvas");
      var wrap = document.getElementById("glryCropCanvasWrap");

      /* re-measure canvas offset (may change on resize) */
      var cr = canvas.getBoundingClientRect();
      var wr = wrap.getBoundingClientRect();
      _gcCanvasOffX = cr.left - wr.left;
      _gcCanvasOffY = cr.top - wr.top;

      var frame = document.getElementById("glryCropFrame");
      frame.style.left = (_gcCanvasOffX + _gcf.x) + "px";
      frame.style.top = (_gcCanvasOffY + _gcf.y) + "px";
      frame.style.width = _gcf.w + "px";
      frame.style.height = _gcf.h + "px";

      /* SVG darken — 4 rects around the crop window */
      var totalW = wrap.clientWidth, totalH = wrap.clientHeight;
      var fx = _gcCanvasOffX + _gcf.x, fy = _gcCanvasOffY + _gcf.y, fw = _gcf.w, fh = _gcf.h;
      var svg = document.getElementById("glryCropDarken");
      svg.setAttribute("width", totalW);
      svg.setAttribute("height", totalH);
      svg.setAttribute("viewBox", "0 0 " + totalW + " " + totalH);
      var fill = "rgba(0,0,0,0.55)";
      svg.innerHTML =
          /* top    */ "<rect x='0' y='0'       width='" + totalW + "' height='" + fy + "'           fill='" + fill + "'/>" +
          /* bottom */ "<rect x='0' y='" + (fy + fh) + "' width='" + totalW + "' height='" + (totalH - fy - fh) + "' fill='" + fill + "'/>" +
          /* left   */ "<rect x='0' y='" + fy + "'  width='" + fx + "'     height='" + fh + "'           fill='" + fill + "'/>" +
          /* right  */ "<rect x='" + (fx + fw) + "' y='" + fy + "' width='" + (totalW - fx - fw) + "' height='" + fh + "' fill='" + fill + "'/>";

      /* info */
      var nat = _glrySrcImg ? _glrySrcImg.naturalWidth : 0;
      var scale = nat ? (canvas.width / nat) : 1;
      var nw = Math.round(_gcf.w / scale), nh = Math.round(_gcf.h / scale);
      document.getElementById("glryCropInfo").textContent =
        "Selection: " + nw + " × " + nh + " px  →  output: 1200 × " + Math.round(1200 * _glryCropRatioH / _glryCropRatioW) + " px";
    }

    /* ── Attach mouse/touch drag & resize on frame and handles ── */
    function _glryAttachCropEvents() {
      var wrap = document.getElementById("glryCropCanvasWrap");
      /* cleanup previous listeners */
      if (wrap._gcClean) { wrap._gcClean(); }

      var frame = document.getElementById("glryCropFrame");

      function ptInCanvas(clientX, clientY) {
        var canvas = document.getElementById("glryCropCanvas");
        var cr = canvas.getBoundingClientRect();
        return { x: clientX - cr.left, y: clientY - cr.top };
      }

      function startDrag(handle, e) {
        e.preventDefault(); e.stopPropagation();
        var pt = e.touches ? e.touches[0] : e;
        _gcDrag = {
          handle: handle, sx: pt.clientX, sy: pt.clientY,
          fx: _gcf.x, fy: _gcf.y, fw: _gcf.w, fh: _gcf.h
        };
      }

      /* frame body = move */
      frame.addEventListener("mousedown", function (e) { if (e.target === frame || e.target.tagName === "svg") startDrag("move", e); });
      frame.addEventListener("touchstart", function (e) { if (e.target === frame) startDrag("move", e); }, { passive: false });

      /* all handles */
      frame.querySelectorAll("[data-handle]").forEach(function (el) {
        el.addEventListener("mousedown", function (e) { startDrag(el.dataset.handle, e); }, { passive: false });
        el.addEventListener("touchstart", function (e) { startDrag(el.dataset.handle, e); }, { passive: false });
      });

      function onMove(e) {
        if (!_gcDrag) return;
        if (e.cancelable) e.preventDefault();
        var pt = e.touches ? e.touches[0] : e;
        var dx = pt.clientX - _gcDrag.sx;
        var dy = pt.clientY - _gcDrag.sy;
        var canvas = document.getElementById("glryCropCanvas");
        var cw = canvas.width, ch = canvas.height;
        var MIN = 50;
        var rw = _glryCropRatioW, rh = _glryCropRatioH;
        var h = _gcDrag.handle;
        var fx = _gcDrag.fx, fy = _gcDrag.fy, fw = _gcDrag.fw, fh = _gcDrag.fh;
        var nx = _gcf.x, ny = _gcf.y, nw = _gcf.w, nh = _gcf.h;

        if (h === "move") {
          nx = _gcClamp(fx + dx, 0, cw - fw);
          ny = _gcClamp(fy + dy, 0, ch - fh);
          nw = fw; nh = fh;

          /* ── corner handles: lock aspect ratio ── */
        } else if (h === "br") {
          nw = _gcClamp(fw + dx, MIN, cw - fx);
          nw = Math.min(nw, Math.round((ch - fy) * rw / rh));
          nh = Math.round(nw * rh / rw);
          nx = fx; ny = fy;
        } else if (h === "bl") {
          nw = _gcClamp(fw - dx, MIN, fx + fw);
          nw = Math.min(nw, Math.round((ch - fy) * rw / rh));
          nh = Math.round(nw * rh / rw);
          nx = fx + fw - nw; ny = fy;
        } else if (h === "tr") {
          nw = _gcClamp(fw + dx, MIN, cw - fx);
          nw = Math.min(nw, Math.round((fy + fh) * rw / rh));
          nh = Math.round(nw * rh / rw);
          nx = fx; ny = fy + fh - nh;
        } else if (h === "tl") {
          nw = _gcClamp(fw - dx, MIN, fx + fw);
          nw = Math.min(nw, Math.round((fy + fh) * rw / rh));
          nh = Math.round(nw * rh / rw);
          nx = fx + fw - nw; ny = fy + fh - nh;

          /* ── edge handles: lock aspect ratio too ── */
        } else if (h === "r") {
          nw = _gcClamp(fw + dx, MIN, cw - fx);
          nh = Math.round(nw * rh / rw);
          nx = fx; ny = _gcClamp(fy + (fh - nh) / 2, 0, ch - nh);
        } else if (h === "l") {
          nw = _gcClamp(fw - dx, MIN, fx + fw);
          nh = Math.round(nw * rh / rw);
          nx = fx + fw - nw; ny = _gcClamp(fy + (fh - nh) / 2, 0, ch - nh);
        } else if (h === "b") {
          nh = _gcClamp(fh + dy, MIN, ch - fy);
          nw = Math.round(nh * rw / rh);
          ny = fy; nx = _gcClamp(fx + (fw - nw) / 2, 0, cw - nw);
        } else if (h === "t") {
          nh = _gcClamp(fh - dy, MIN, fy + fh);
          nw = Math.round(nh * rw / rh);
          ny = fy + fh - nh; nx = _gcClamp(fx + (fw - nw) / 2, 0, cw - nw);
        }

        /* final clamp to canvas bounds */
        nx = _gcClamp(nx, 0, cw - nw);
        ny = _gcClamp(ny, 0, ch - nh);
        _gcf = { x: nx, y: ny, w: nw, h: nh };
        _glryRenderFrame();
      }

      function onUp() { _gcDrag = null; }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);

      /* also re-render on window resize */
      function onResize() { if (_glrySrcImg && document.getElementById("glryCropOverlay").classList.contains("open")) { _glryDrawCanvas(); _glryRenderFrame(); } }
      window.addEventListener("resize", onResize);

      wrap._gcClean = function () {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onUp);
        window.removeEventListener("resize", onResize);
      };
    }

    /* ── Confirm crop → produce fixed-size base64 JPEG ── */
    function glryConfirmCrop() {
      var srcCanvas = document.getElementById("glryCropCanvas");
      var scaleX = _glrySrcImg.naturalWidth / srcCanvas.width;
      var scaleY = _glrySrcImg.naturalHeight / srcCanvas.height;
      var sx = Math.round(_gcf.x * scaleX);
      var sy = Math.round(_gcf.y * scaleY);
      var sw = Math.round(_gcf.w * scaleX);
      var sh = Math.round(_gcf.h * scaleY);
      /* always output 1200 wide, height locked to ratio */
      var outW = 1200, outH = Math.round(1200 * _glryCropRatioH / _glryCropRatioW);
      var out = document.createElement("canvas");
      out.width = outW; out.height = outH;
      var ctx = out.getContext("2d");
      /* sharpen with high-quality downscale */
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(_glrySrcImg, sx, sy, sw, sh, 0, 0, outW, outH);
      _glryB64 = out.toDataURL("image/jpeg", 0.90);

      /* show cropped preview */
      var prev = document.getElementById("glryCroppedPreviewImg");
      prev.src = _glryB64;
      document.getElementById("glryCroppedPreviewWrap").style.display = "block";
      document.getElementById("glryCroppedDimLabel").textContent =
        "✔ Output: " + outW + " × " + outH + " px  (" + _glryCropRatioW + ":" + _glryCropRatioH + ")  · JPEG 90%";

      /* enable upload button */
      var btn = document.getElementById("glryUploadBtn");
      btn.disabled = false;
      btn.style.cssText = "background:#f7a01a;color:#fff;border:none;padding:11px 28px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;width:100%;transition:background 0.2s;";
      btn.innerHTML = '<i class="fa-solid fa-upload"></i>&nbsp; Upload to Gallery';

      glryCloseCrop();
    }

    /* ── Close crop modal ── */
    function glryCloseCrop() {
      document.getElementById("glryCropOverlay").classList.remove("open");
      document.body.style.overflow = "";
      var wrap = document.getElementById("glryCropCanvasWrap");
      if (wrap._gcClean) { wrap._gcClean(); wrap._gcClean = null; }
      _gcDrag = null;
    }

    /* ── Upload ── */
    async function uploadGalleryPhoto() {
      if (!_glryB64) { toast("Please select and crop a photo first.", "warn"); return; }
      var caption = document.getElementById("glryCaptionInput").value.trim();
      var tags = document.getElementById("glryTagsInput") ? document.getElementById("glryTagsInput").value.trim() : "";
      var session = JSON.parse(localStorage.getItem("session") || "{}");
      var btn = document.getElementById("glryUploadBtn");
      btn.disabled = true;
      btn._noAutoLoad = true; // [FIX-2] Tell _wrapFn to skip auto-reset — we manage this button manually
      btn.style.cssText = "background:#ccc;color:#fff;border:none;padding:11px 28px;border-radius:8px;font-weight:600;font-size:14px;cursor:not-allowed;width:100%;";
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp; Uploading...';
      try {
        var response = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "uploadGalleryPhoto",
            base64: _glryB64,
            fileName: _glryFileName,
            caption: caption,
            tags: tags,
            priority: 999,
            AdminName: session.name || "Admin",
            userId: session.userId || "",
            sessionToken: session.sessionToken || ""
          })
        });
        if (!response.ok) throw new Error("Server error: " + response.status);
        var res = await response.json();
        if (res.status === "success") {
          toast("Photo uploaded to gallery!", "success");
          _glryB64 = null; _glryFileName = ""; _glrySrcFile = null; _glrySrcImg = null;
          document.getElementById("glryFileInput").value = "";
          document.getElementById("glryCaptionInput").value = "";
          var tagsEl = document.getElementById("glryTagsInput"); if (tagsEl) tagsEl.value = "";
          document.getElementById("glryCroppedPreviewWrap").style.display = "none";
          document.getElementById("glryCroppedPreviewImg").src = "";
          // [FIX-2] Re-enable button after success so admin can upload another photo
          btn.disabled = false;
          btn.style.cssText = "background:#f7a01a;color:#fff;border:none;padding:11px 28px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;width:100%;";
          btn.innerHTML = '<i class="fa-solid fa-upload"></i>&nbsp; Upload to Gallery';
          // [FIX-2] Bust getGallery cache — upload used raw fetch (not postData) so
          // _CACHE_BUST_ON_WRITE didn't fire; without this, loadGalleryAdmin shows stale data
          if (typeof mandirCacheBust === "function") mandirCacheBust("getGallery");
          loadGalleryAdmin();
        } else {
          toast("Upload failed: " + (res.message || "Unknown error"), "error");
          btn.disabled = false;
          btn.style.cssText = "background:#f7a01a;color:#fff;border:none;padding:11px 28px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;width:100%;";
          btn.innerHTML = '<i class="fa-solid fa-upload"></i>&nbsp; Upload to Gallery';
        }
      } catch (err) {
        toast("Upload error: " + err.message, "error");
        btn.disabled = false;
        btn.style.cssText = "background:#f7a01a;color:#fff;border:none;padding:11px 28px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;width:100%;";
        btn.innerHTML = '<i class="fa-solid fa-upload"></i>&nbsp; Upload to Gallery';
      }
    }

    async function loadGalleryAdmin() {
      var grid = document.getElementById("glryPhotoGrid");
      var noPhotos = document.getElementById("glryNoPhotos");
      if (!grid) return;
      grid.innerHTML = "<p style='color:#aaa;font-size:13px;'><i class='fa-solid fa-spinner fa-spin'></i> Loading...</p>";
      noPhotos.style.display = "none";
      try {
        var photos = await getCached("getGallery");
        grid.innerHTML = "";
        if (!Array.isArray(photos) || photos.length === 0) { noPhotos.style.display = "block"; return; }
        photos.forEach(function (p) {
          var card = document.createElement("div");
          card.className = "glry-card";
          card.dataset.caption = (p.Caption || "").toLowerCase();
          card.dataset.tags = (p.Tags || "").toLowerCase();
          const tagsHtml = p.Tags
            ? p.Tags.split(",").map(t => t.trim()).filter(Boolean)
              .map(t => '<span style="background:#fef3c7;color:#92400e;border-radius:20px;padding:1px 8px;font-size:10px;font-weight:600;white-space:nowrap;">' + escapeHtml(t) + '</span>')
              .join(" ")
            : "";
          // [FIX-1] Use data-drivesrc + data-rawphoto so _lazyLoadDriveImgs()
          // fetches via base64 proxy — avoids NS_BINDING_ABORTED on Drive URLs
          card.innerHTML =
            '<img data-drivesrc="' + escapeHtml(p.PhotoURL) + '" data-rawphoto="' + escapeHtml(p.PhotoURL) + '" alt="' + escapeHtml(p.Caption || "") + '" loading="lazy" src="" style="background:#f1f5f9;">' +
            '<div style="padding:8px 10px 10px;">' +
            '<div style="font-size:12px;font-weight:600;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            escapeHtml(p.Caption || "—") +
            '</div>' +
            (tagsHtml ? '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;">' + tagsHtml + '</div>' : '') +
            '<div style="font-size:11px;color:#bbb;margin-top:3px;">' + escapeHtml(p.AddedAt) + '</div>' +
            '</div>' +
            '<button onclick="deleteGalleryPhoto(\'' + escapeHtml(p.PhotoId) + '\')" ' +
            'title="Delete photo" ' +
            'style="position:absolute;top:6px;right:6px;background:rgba(231,76,60,0.85);color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:11px;cursor:pointer;box-shadow:none;">' +
            '<i class="fa-solid fa-trash"></i></button>';
          grid.appendChild(card);
        });
        // [FIX-1] Trigger lazy Drive image loader after all cards are in DOM
        if (typeof window._lazyLoadDriveImgs === "function") window._lazyLoadDriveImgs(grid);
      } catch (err) {
        grid.innerHTML = "<p style='color:#e74c3c;font-size:13px;'>Error loading gallery.</p>";
      }
    }

    async function deleteGalleryPhoto(photoId) {
      confirmModal("Delete this photo from the gallery? This cannot be undone.", async function() {
        var session = JSON.parse(localStorage.getItem("session") || "{}");
        try {
          var res = await postData({ action: "deleteGalleryPhoto", PhotoId: photoId, AdminName: session.name || "Admin" });
          if (res.status === "deleted") { toast("Photo deleted from gallery.", "success"); loadGalleryAdmin(); }
          else toast("Delete failed: " + (res.message || "Not found"), "error");
        } catch (err) { toast("Error: " + err.message, "error"); }
      }, "Delete", "#e74c3c");
    }

    /* ══════════════════════════════
       ANNOUNCEMENT ADMIN
       ══════════════════════════════ */
    /* ── Announcement color map ── */
    var _annColorMap = {
      purple: "linear-gradient(90deg,#4c1a6e,#6b21a8,#4c1a6e)",
      orange: "linear-gradient(90deg,#c2410c,#ea580c,#c2410c)",
      red: "linear-gradient(90deg,#991b1b,#dc2626,#991b1b)",
      green: "linear-gradient(90deg,#14532d,#16a34a,#14532d)",
      blue: "linear-gradient(90deg,#1e3a8a,#2563eb,#1e3a8a)",
      teal: "linear-gradient(90deg,#134e4a,#0d9488,#134e4a)",
      pink: "linear-gradient(90deg,#831843,#db2777,#831843)",
      dark: "linear-gradient(90deg,#0f172a,#334155,#0f172a)"
    };
    function selectAnnColor(color, el) {
      document.getElementById("ann_color").value = color;
      document.querySelectorAll("#ann_color_picker div").forEach(function (d) {
        d.style.border = "3px solid transparent";
        d.style.boxShadow = "none";
        d.style.transform = "scale(1)";
      });
      el.style.border = "3px solid #fff";
      el.style.boxShadow = "0 0 0 3px " + (el.style.background.includes("7c3aed") ? "#7c3aed" :
        el.style.background.includes("d35400") ? "#f7a01a" :
          el.style.background.includes("991b1b") ? "#dc2626" :
            el.style.background.includes("15803d") ? "#16a34a" :
              el.style.background.includes("1d4ed8") ? "#2563eb" :
                el.style.background.includes("0f766e") ? "#0d9488" :
                  el.style.background.includes("be185d") ? "#db2777" : "#334155");
      el.style.transform = "scale(1.18)";
      updateAnnPreview();
    }
    function updateAnnPreview() {
      var msg = (document.getElementById("ann_message").value || "").trim();
      var badge = (document.getElementById("ann_badge").value || "").trim();
      var icon = (document.getElementById("ann_icon").value || "").trim();
      var color = (document.getElementById("ann_color")?.value || "purple");
      var prev = document.getElementById("annAdminPreview");
      if (!msg) { prev.style.display = "none"; return; }
      prev.style.display = "block";
      document.getElementById("annPrevText").textContent = msg;
      document.getElementById("annPrevIcon").textContent = icon || "🔔";
      // Apply selected color to preview bar
      var bar = prev.querySelector(".ann-preview-bar");
      if (bar) bar.style.background = _annColorMap[color] || _annColorMap["purple"];
      var b = document.getElementById("annPrevBadge");
      if (badge) { b.textContent = badge; b.style.display = "inline-block"; }
      else { b.style.display = "none"; }
    }

    async function saveAnnouncement() {
      if (!checkSession()) return;
      var msg = (document.getElementById("ann_message").value || "").trim();
      var badge = (document.getElementById("ann_badge").value || "").trim();
      var icon = (document.getElementById("ann_icon").value || "").trim();
      var color = (document.getElementById("ann_color").value || "purple");
      if (!msg) { toast("Please enter an announcement message.", "error"); return; }
      var session = JSON.parse(localStorage.getItem("session") || "{}");
      try {
        var res = await postData({
          action: "saveAnnouncement",
          Message: msg,
          Badge: badge,
          Icon: icon || "🔔",
          Color: color,
          AdminName: session.name || "Admin"
        });
        if (res && (res.status === "success" || res.status === "saved")) {
          toast("✅ Announcement published!", "success");
          document.getElementById("ann_message").value = "";
          document.getElementById("ann_badge").value = "";
          document.getElementById("ann_icon").value = "";
          document.getElementById("annAdminPreview").style.display = "none";
          loadAnnouncementAdmin();
        } else {
          toast("Failed: " + (res && res.message ? res.message : "Unknown error"), "error");
        }
      } catch (e) { toast("Error: " + e.message, "error"); }
    }

    async function clearAnnouncement() {
      if (!checkSession()) return;
      confirmModal("Remove the current announcement banner from the home page?", async function() {
        var session = JSON.parse(localStorage.getItem("session") || "{}");
        try {
          var res = await postData({ action: "clearAnnouncement", AdminName: session.name || "Admin" });
          toast("Banner removed.", "success");
          loadAnnouncementAdmin();
        } catch (e) { toast("Error: " + e.message, "error"); }
      }, "Remove", "#f7a01a");
    }

    async function loadAnnouncementAdmin() {
      var list = document.getElementById("annHistoryList");
      if (!list) return;
      list.innerHTML = "<p style='color:#aaa;font-size:13px;'><i class='fa-solid fa-spinner fa-spin'></i> Loading...</p>";
      try {
        var data = await getData("getAnnouncementHistory");
        if (!Array.isArray(data) || data.length === 0) {
          list.innerHTML = "<p style='color:#aaa;font-size:13px;'><i class='fa-solid fa-inbox'></i> No announcements yet.</p>";
          return;
        }
        list.innerHTML = data.map(function (a, i) {
          var isActive = String(a.Status || "").toLowerCase() === "active" || i === 0 && !a.Status;
          var dotColor = isActive ? "#22c55e" : "#94a3b8";
          var dotTitle = isActive ? "Active" : "Past";
          return '<div class="ann-history-item' + (isActive ? " active-ann" : "") + '">' +
            '<div class="ann-status-dot" style="background:' + dotColor + ';" title="' + dotTitle + '"></div>' +
            '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:13px;font-weight:600;color:#334155;line-height:1.4;">' +
            (a.Icon ? '<span style="margin-right:5px;">' + escapeHtml(a.Icon) + '</span>' : '') +
            escapeHtml(a.Message || "—") +
            '</div>' +
            (a.Badge ? '<span style="display:inline-block;margin-top:4px;background:#f0f4ff;color:#6366f1;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;">' + escapeHtml(a.Badge) + '</span>' : '') +
            '<div style="font-size:11px;color:#aaa;margin-top:4px;">' +
            escapeHtml(a.AdminName || "Admin") + ' · ' + escapeHtml(a.CreatedAt || "—") +
            '</div>' +
            '</div>' +
            (isActive ?
              '<button onclick="clearAnnouncement()" title="Remove" style="background:rgba(231,76,60,0.1);color:#e74c3c;border:1px solid rgba(231,76,60,0.25);border-radius:7px;padding:5px 10px;font-size:12px;cursor:pointer;box-shadow:none;flex-shrink:0;">' +
              '<i class="fa-solid fa-ban"></i></button>' : '') +
            '</div>';
        }).join("");
      } catch (e) {
        list.innerHTML = "<p style='color:#e74c3c;font-size:13px;'>Error loading history. Make sure ANNOUNCEMENT sheet exists.</p>";
      }
    }

    function openDashboard(el) {
      showPage("dashboardPage", el);
      // Initialize dashboard view using already-loaded admin data (no extra API call)
      if (!window._dashInitialized) {
        initDashboardView();
        window._dashInitialized = true;
      }
    }

    // Called on walk-in save / contribution add to keep dashboard in sync
    // without a full API reload (updates in-memory dash data from admin globals)
    function _dashSyncFromAdmin() {
      if (!window._dashInitialized) return;
      dash_contributions = data.slice();
      dash_expenses      = expenses.slice();
      dash_users         = users.filter(u => (u.Role || "").toLowerCase() !== "admin");
      dash_types         = types.slice();
      dash_expenseTypes  = expenseTypes.slice();
      dash_occasions     = occasions.slice();
      dash_yearConfig    = yearConfig.slice();
      dash_applyFilter();
    }

    // Manual refresh button: re-fetches from API then re-renders
    async function refreshDashboardData() {
      const btn = document.querySelector('[onclick="refreshDashboardData()"]');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing...'; }
      document.getElementById("dash_loadingMsg").style.display = "block";
      try {
        mandirCacheBust("getAllData");
        const allData = (await getCached("getAllData")) || {};
        // Update admin globals too so rest of panel stays fresh
        users        = allData.users        || [];
        types        = allData.types        || [];
        expenseTypes = allData.expenseTypes || [];
        occasions    = allData.occasions    || [];
        data         = allData.contributions || [];
        expenses     = allData.expenses     || [];
        goals        = allData.goals        || [];
        yearConfig   = allData.yearConfig   || [];
        // Sync dashboard local copies
        _dashSyncFromAdmin();
        // Refresh Contribution Records filter dropdowns (Year / Type / Occasion)
        if (typeof _cr_buildFilterDropdowns === "function") _cr_buildFilterDropdowns();
        // Refresh admin summary panels too
        loadSummary();
        const now = new Date().toLocaleTimeString(APP.locale||"en-IN");
        const lbl = document.getElementById("dash_lastLoaded");
        if (lbl) lbl.textContent = "Last refreshed: " + now;
        toast("✅ Dashboard data refreshed.");
      } catch (err) {
        const c = _classifyNetworkError(err);
        toast("❌ Refresh failed: " + c.icon + " " + c.title + " — " + c.detail, "error");
      } finally {
        document.getElementById("dash_loadingMsg").style.display = "none";
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Refresh'; }
      }
    }
    /* ── Classify network errors into human-readable reason strings ── */
    function _classifyNetworkError(err) {
      const msg = (err && err.message ? err.message : String(err || "")).toLowerCase();
      if (!navigator.onLine) {
        return { icon: "📴", title: "No Internet Connection", detail: "You appear to be offline. Please check your Wi-Fi or mobile data and try again." };
      }
      if (msg.includes("timed out") || msg.includes("timeout") || msg.includes("time out")) {
        return { icon: "⏱️", title: "Request Timed Out", detail: "The server took too long to respond. This can happen when the server is under load or your connection is slow. Please try again." };
      }
      if (msg.includes("network") || msg.includes("failed to fetch") || msg.includes("networkerror")) {
        return { icon: "📶", title: "Network Error", detail: "A network error occurred while contacting the server. Check your internet connection and try again." };
      }
      if (msg.includes("load") || msg.includes("script") || msg.includes("onerror")) {
        return { icon: "🌐", title: "Server Unreachable", detail: "Could not reach the server. You may have a weak connection, or the server may be temporarily unavailable." };
      }
      if (msg.includes("quota") || msg.includes("rate limit") || msg.includes("429")) {
        return { icon: "🚦", title: "Too Many Requests", detail: "The server has temporarily limited requests. Please wait a moment and try again." };
      }
      if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden")) {
        return { icon: "🔒", title: "Access Denied", detail: "Your session may have expired or you don't have permission. Try logging in again." };
      }
      if (msg.includes("500") || msg.includes("server error")) {
        return { icon: "🔧", title: "Server Error", detail: "The server encountered an internal error. Please try again in a moment." };
      }
      return { icon: "⚠️", title: "Connection Error", detail: "An unexpected error occurred: " + (err && err.message ? err.message : String(err || "Unknown error")) + ". Please try again." };
    }

    /* ══ ADMIN RETRY ENGINE — improved ══ */
    var _aloRetryCount    = 0;
    var _aloCountdownTimer = null;
    var _aloCountdownSec   = 0;

    function _aloClearCountdown() {
      if (_aloCountdownTimer) { clearInterval(_aloCountdownTimer); _aloCountdownTimer = null; }
      var wrap = document.getElementById("alo_countdown_wrap");
      if (wrap) wrap.classList.remove("active");
    }

    function _aloStartCountdown(seconds, onDone) {
      _aloClearCountdown();
      var wrap = document.getElementById("alo_countdown_wrap");
      var bar  = document.getElementById("alo_countdown_bar");
      var txt  = document.getElementById("alo_countdown_txt");
      if (!wrap || !bar || !txt) { onDone && onDone(); return; }
      wrap.classList.add("active");
      _aloCountdownSec = seconds;
      bar.style.transition = "none";
      bar.style.width = "100%";
      void bar.offsetWidth;
      bar.style.transition = "width " + seconds + "s linear";
      bar.style.width = "0%";
      txt.textContent = seconds + "s";
      _aloCountdownTimer = setInterval(function() {
        _aloCountdownSec--;
        if (txt) txt.textContent = _aloCountdownSec + "s";
        if (_aloCountdownSec <= 0) {
          _aloClearCountdown();
          onDone && onDone();
        }
      }, 1000);
    }

    function _aloUpdateAttemptDots(count) {
      var container = document.getElementById("alo_attempt_dots");
      if (!container) return;
      var maxDots = 5;
      container.innerHTML = "";
      for (var i = 0; i < Math.min(count, maxDots); i++) {
        var d = document.createElement("span");
        d.className = "alo-adot used";
        container.appendChild(d);
      }
      if (count > maxDots) {
        var more = document.createElement("span");
        more.style.cssText = "font-size:9px;font-weight:700;color:#b45309;font-family:Poppins,sans-serif;margin-left:2px;";
        more.textContent = "+" + (count - maxDots);
        container.appendChild(more);
      }
    }

    /* ── Show error state inside loadingOverlay with specific reason ── */
    function _showLoadingError(err) {
      const classified = _classifyNetworkError(err);
      const loadEl   = document.getElementById("loadingOverlay_loading");
      const errEl    = document.getElementById("loadingOverlay_error");
      const reasonEl = document.getElementById("loadingOverlay_reason");
      const iconEl   = document.getElementById("alo_err_icon");
      const titleEl  = document.getElementById("alo_err_title");
      const subtitleEl = document.getElementById("alo_err_subtitle");
      const pill     = document.getElementById("alo_attempt_pill");
      const pillTxt  = document.getElementById("alo_pill_text");
      const btn      = document.getElementById("loadingOverlay_retryBtn");

      if (loadEl)  loadEl.style.display = "none";
      if (errEl)   errEl.style.display  = "flex";

      if (iconEl)    iconEl.textContent = classified.icon;
      if (titleEl)   titleEl.textContent = classified.title;
      if (subtitleEl) subtitleEl.textContent = _aloRetryCount > 0
        ? "Attempt " + _aloRetryCount + " failed — tap Retry"
        : "Something went wrong — tap Retry";

      if (reasonEl) reasonEl.innerHTML =
        "<span style='font-size:12px;line-height:1.65;'>" + classified.detail + "</span>";

      if (_aloRetryCount > 0) {
        if (pill)    pill.classList.add("show");
        if (pillTxt) pillTxt.textContent = "Attempt " + _aloRetryCount + " failed";
        _aloUpdateAttemptDots(_aloRetryCount);
      }

      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Retry Now'; btn.style.opacity = "1"; }

      // Auto-retry countdown for first 2 failures only, then manual
      if (_aloRetryCount < 3) {
        _aloStartCountdown(8, function() {
          var retryBtn = document.getElementById("loadingOverlay_retryBtn");
          _doRetry(retryBtn);
        });
      }

      const overlay = document.getElementById("loadingOverlay");
      if (overlay && !overlay.classList.contains("show")) overlay.classList.add("show");
    }

    /* ── Retry handler — prevents double-fire, busts cache, shows feedback ── */
    window._doRetry = function(btn) {
      if (btn && btn.disabled) return;
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Retrying…';
        btn.style.opacity = '0.8';
      }
      _aloClearCountdown();
      _aloRetryCount++;
      // Bust cache — primary via app.js helper, fallback manual clear
      if (typeof mandirCacheBust === "function") {
        mandirCacheBust("getAllData");
      } else {
        try {
          ["getAllData", "mandir_cache_getAllData"].forEach(function(k) {
            sessionStorage.removeItem(k); localStorage.removeItem(k);
          });
        } catch(e) {}
      }
      setTimeout(function() {
        _resetLoadingOverlay();
        init();
      }, 180);
    };

    /* ── Back to Login — clears session so guard doesn't bounce back ── */
    window._doAdminBackToLogin = function() {
      _aloClearCountdown();
      try {
        var _rmKey = ((typeof APP !== "undefined" && APP.shortName) ? APP.shortName.toLowerCase() : "mandir") + "_remember_token";
        ["session", _rmKey, "adminSession"].forEach(function(k) {
          localStorage.removeItem(k);
        });
      } catch(e) {}
      _aloRetryCount = 0;
      location.replace("login.html");
    };

    /* ── Reset loadingOverlay back to normal loading/spinner state ── */
    function _resetLoadingOverlay() {
      const loadEl = document.getElementById("loadingOverlay_loading");
      const errEl  = document.getElementById("loadingOverlay_error");
      const pill   = document.getElementById("alo_attempt_pill");
      if (loadEl) { loadEl.style.display = "flex"; loadEl.style.flexDirection = "column"; loadEl.style.alignItems = "center"; loadEl.style.gap = "15px"; }
      if (errEl)  errEl.style.display = "none";
      if (pill)   pill.classList.remove("show");
      var btn = document.getElementById("loadingOverlay_retryBtn");
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Retry Now'; btn.style.opacity = "1"; }
    }

    function setLoading(show) {
      if (show) _resetLoadingOverlay(); // reset to spinner when starting fresh
      document
        .getElementById("loadingOverlay")
        .classList.toggle("show", show);
      const shimmerRow =
        `<tr class="shimmer-row">${"<td>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>".repeat(
          9
        )}</tr>`.repeat(4);
      if (show) {
        ["tb", "expenseRecordsBody", "userTable", "goalTableBody", "reqTbody", "ys_tbody"].forEach((id) => {
          let el = document.getElementById(id);
          if (el && el.innerHTML.trim() === "") el.innerHTML = shimmerRow;
        });
      }
    }

    /* ── DATA ── */
    let users = [],
      data = [],
      types = [],
      expenseTypes = [],
      occasions = [],
      expenses = [],
      yearConfig = [];
    const MONTHS = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    /* PERF: shared year-options builder — replaces repeated inline loops */
    function _buildYearOpts(selectedYear, minYear, maxYear) {
      minYear = minYear || 2023;
      maxYear = maxYear || (new Date().getFullYear() + 1);
      selectedYear = selectedYear || new Date().getFullYear();
      var opts = '';
      for (var y = maxYear; y >= minYear; y--) {
        opts += '<option value="' + y + '"' + (y === Number(selectedYear) ? ' selected' : '') + '>' + y + '</option>';
      }
      return opts;
    }

    function loadYearSummary() {
      // Show loading, hide everything else
      _ysShow("ys_loading");

      getCached("getYearlySummary")
        .then(function (res) {
          if (!res || res.status === "error") {
            _ysShow("ys_error");
            document.getElementById("ys_error").textContent =
              "Error loading summary: " + ((res && res.message) || "Unknown error");
            return;
          }

          const rows = res.rows || [];

          if (rows.length === 0) {
            _ysShow("ys_empty");
            return;
          }

          // ── Populate totals row
          let sumCollection = 0, sumExpense = 0;
          rows.forEach(function (r) {
            sumCollection += Number(r.totalCollection || 0);
            sumExpense += Number(r.totalExpense || 0);
          });
          const lastRow = rows[rows.length - 1];
          const finalBalance = Number(lastRow.closingBalance || 0);

          document.getElementById("ys_t_years").textContent = rows.length;
          document.getElementById("ys_t_collection").textContent = "₹" + fmt(sumCollection);
          document.getElementById("ys_t_expense").textContent = "₹" + fmt(sumExpense);
          document.getElementById("ys_t_balance").textContent =
            (finalBalance < 0 ? "−" : "") + "₹" + fmt(Math.abs(finalBalance));
          document.getElementById("ys_t_balance").style.color =
            finalBalance >= 0 ? "#27ae60" : "#e74c3c";

          // ── Populate table body
          const tbody = document.getElementById("ys_tbody");
          tbody.innerHTML = "";

          const curYear = new Date().getFullYear();

          rows.forEach(function (r, idx) {
            const isCurrentYear = Number(r.year) === curYear;
            const closing = Number(r.closingBalance || 0);
            const isLastRow = idx === rows.length - 1;

            // Carry-forward column: show for all rows except last (which is the "current" balance)
            const cfText = isLastRow
              ? '<span style="color:#94a3b8;font-size:11px;">Current year</span>'
              : (closing < 0 ? "−" : "") + "₹" + fmt(Math.abs(closing));

            const tr = document.createElement("tr");
            if (isCurrentYear) {
              tr.style.background = "rgba(247,160,26,0.07)";
              tr.style.fontWeight = "600";
            }

            tr.innerHTML =
              '<td style="text-align:center;">' +
              '<span style="font-weight:700;color:#334155;">' + r.year + '</span>' +
              (isCurrentYear ? ' <span style="font-size:10px;background:#f7a01a;color:#fff;border-radius:4px;padding:1px 6px;vertical-align:middle;">Current</span>' : '') +
              '</td>' +
              '<td style="text-align:right;color:#64748b;">₹' + fmt(Number(r.openingBalance || 0)) + '</td>' +
              '<td style="text-align:right;color:#27ae60;font-weight:600;">₹' + fmt(Number(r.totalCollection || 0)) + '</td>' +
              '<td style="text-align:right;color:#e74c3c;font-weight:600;">₹' + fmt(Number(r.totalExpense || 0)) + '</td>' +
              '<td style="text-align:right;font-weight:700;color:' + (closing >= 0 ? "#27ae60" : "#e74c3c") + ';">' +
              (closing < 0 ? "−" : "") + "₹" + fmt(Math.abs(closing)) +
              '</td>' +
              '<td style="text-align:right;color:#6366f1;">' + cfText + '</td>' +
              '<td style="text-align:right;color:#334155;">' + (r.receiptCount || 0) + '</td>' +
              '<td style="text-align:right;color:#334155;">' + (r.memberCount || 0) + '</td>' +
              '<td style="text-align:right;color:#64748b;">₹' + fmt(r.avgContribution || 0) + '</td>';

            tbody.appendChild(tr);
          });

          // ── Totals footer row
          const tfoot = document.getElementById("ys_tfoot");
          tfoot.innerHTML =
            '<tr style="background:#f1f5f9;font-weight:700;border-top:2px solid #e2e8f0;">' +
            '<td style="text-align:center;color:#334155;">All Years</td>' +
            '<td style="text-align:right;color:#64748b;">—</td>' +
            '<td style="text-align:right;color:#27ae60;">₹' + fmt(sumCollection) + '</td>' +
            '<td style="text-align:right;color:#e74c3c;">₹' + fmt(sumExpense) + '</td>' +
            '<td style="text-align:right;color:' + (finalBalance >= 0 ? "#27ae60" : "#e74c3c") + ';">' +
            (finalBalance < 0 ? "−" : "") + "₹" + fmt(Math.abs(finalBalance)) +
            '</td>' +
            '<td style="text-align:right;color:#94a3b8;font-size:11px;">Final balance</td>' +
            '<td style="text-align:right;color:#94a3b8;">—</td>' +
            '<td style="text-align:right;color:#94a3b8;">—</td>' +
            '<td style="text-align:right;color:#94a3b8;">—</td>' +
            '</tr>';

          // Show table + totals
          _ysShow("ys_table_card");
          document.getElementById("ys_totals").style.display = "grid";

        })
        .catch(function (err) {
          _ysShow("ys_error");
          const c = _classifyNetworkError(err);
          const el = document.getElementById("ys_error");
          if (el) el.innerHTML =
            "<div style='text-align:center;padding:8px 0;'>" +
            "<div style='font-size:1.8rem;margin-bottom:6px;'>" + c.icon + "</div>" +
            "<div style='font-weight:700;color:#78350f;margin-bottom:4px;'>" + c.title + "</div>" +
            "<div style='font-size:12px;color:#555;margin-bottom:12px;'>" + c.detail + "</div>" +
            "<button onclick='loadYearSummary()' style='background:#f7a01a;color:#fff;border:none;border-radius:8px;padding:8px 20px;font-family:Poppins,sans-serif;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 3px 8px rgba(247,160,26,0.3);'>" +
            "<i class=\"fa-solid fa-rotate-right\"></i> Retry</button>" +
            "</div>";
        });
    }

    /* Helper: hide all ys_ state panels, then show the one needed */
    function _ysShow(visibleId) {
      ["ys_loading", "ys_error", "ys_empty", "ys_table_card"].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
      });
      // Also hide totals grid unless showing table
      const totals = document.getElementById("ys_totals");
      if (totals && visibleId !== "ys_table_card") totals.style.display = "none";

      const show = document.getElementById(visibleId);
      if (show) show.style.display = visibleId === "ys_table_card" ? "block" : (visibleId === "ys_loading" || visibleId === "ys_error" || visibleId === "ys_empty" ? "block" : "block");
    }

    /* ── countUp: animates a numeric string from 0 to target over ~600ms ── */
    function _countUp(el, targetText, color) {
      if (!el) return;
      const prefix = targetText.replace(/[\d,]+/, "").split(/\d/)[0] || "";
      const numStr = targetText.replace(/[^0-9]/g, "");
      const target = parseInt(numStr, 10);
      if (isNaN(target) || target === 0) { el.innerText = targetText; return; }
      const duration = 600;
      const start = performance.now();
      function step(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(eased * target);
        el.innerText = prefix + current.toLocaleString(APP.locale||"en-IN");
        if (progress < 1) requestAnimationFrame(step);
        else el.innerText = targetText;
      }
      requestAnimationFrame(step);
      if (color) el.style.color = color;
    }

    // ── loadSummary cache ──────────────────────────────────────────
    // Stores last-computed totals and the array references they came from.
    // If data/expenses/users arrays haven't changed since last call,
    // we skip all .reduce()/.filter() loops and jump straight to DOM updates.
    var _summaryCache = { data: null, expenses: null, users: null, result: null };

    function loadSummary() {
      // Fast path: if all three source arrays are the same references as last time,
      // skip recompute and re-apply the cached result directly to the DOM.
      if (
        _summaryCache.result &&
        _summaryCache.data     === data &&
        _summaryCache.expenses === expenses &&
        _summaryCache.users    === users
      ) {
        _applySummaryResult(_summaryCache.result);
        updateSidebarSummary();
        _hmInitSelectors();
        _hmOnPeriodChange();
        return;
      }

      // Total Members = ACTIVE users only (not Admins, not Pending, not Inactive)
      let memberCount = users.filter(
        (u) => u.Role !== "Admin" && String(u.Status || "Active").toLowerCase() === "active"
      ).length;

      // This-month vs last-month trend
      const now = new Date();
      const MOS = MONTHS; // PERF: reuse global
      const curMonth = MOS[now.getMonth()];
      const curYear = now.getFullYear();
      const lastMonthIdx = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const lastMonth = MOS[lastMonthIdx];
      const lastMonthYear = now.getMonth() === 0 ? curYear - 1 : curYear;

      const thisMonthC = data.filter(c => String(c.Year) === String(curYear) && c.ForMonth === curMonth)
        .reduce((a, b) => a + Number(b.Amount || 0), 0);
      const lastMonthC = data.filter(c => String(c.Year) === String(lastMonthYear) && c.ForMonth === lastMonth)
        .reduce((a, b) => a + Number(b.Amount || 0), 0);
      const thisMonthE = expenses.filter(e => String(e.Year) === String(curYear) && e.ForMonth === curMonth)
        .reduce((a, b) => a + Number(b.Amount || 0), 0);
      const lastMonthE = expenses.filter(e => String(e.Year) === String(lastMonthYear) && e.ForMonth === lastMonth)
        .reduce((a, b) => a + Number(b.Amount || 0), 0);

      // FIX #5 & #14: Include walk-in entries in all totals
      let totalC = data.reduce((a, b) => a + Number(b.Amount || 0), 0);
      let totalE = expenses.reduce((a, b) => a + Number(b.Amount || 0), 0);

      // totalOpening: kept in _res for cache-shape compatibility but not rendered anywhere.
      // Summing ALL years' opening balances is meaningless — each year's opening already
      // equals the previous year's closing. Per-year opening is looked up correctly in
      // _hmRenderYearTracker via yearConfig.find(). So we set 0 here.
      let totalOpening = 0;

      // Store computed result and source references for fast-path reuse
      var _res = {
        memberCount, totalC, totalE, totalOpening,
        thisMonthC, lastMonthC, thisMonthE, lastMonthE, lastMonth
      };
      _summaryCache = { data, expenses, users, result: _res };
      _applySummaryResult(_res);

      updateSidebarSummary();
      _hmInitSelectors();
      _hmOnPeriodChange();
    }

    // Applies pre-computed summary result to DOM — used by both full and fast paths
    function _applySummaryResult(r) {
      // Hide the entire summary-grid section (contains the 4 all-time cards that show ₹0)
      // Year Balance section already shows selected-year totals correctly
      var _hide = function(sel) {
        var els = document.querySelectorAll(sel);
        els.forEach(function(el) { el.style.setProperty("display","none","important"); });
      };

      // Hide the grid container itself — catches all 4 cards in one shot
      _hide(".summary-grid");

      // Fallback: hide individual card-boxes by their known element IDs
      // (in case summary-grid class name differs in their HTML)
      ["totalContribution","totalExpense","totalUsers","netBalance"].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        // Try closest with every possible card wrapper class
        var card = typeof el.closest === "function"
          ? (el.closest(".card-box") || el.closest(".card") || el.closest("[class*='box']"))
          : null;
        if (card) {
          card.style.setProperty("display","none","important");
        } else {
          // Last resort: hide the element's grandparent (label → value → card wrapper)
          var gp = el.parentNode && el.parentNode.parentNode;
          if (gp) gp.style.setProperty("display","none","important");
        }
      });

      // Store member count for downstream renders (pending donut ring etc.)
      window._hmActiveMemberCount = r.memberCount;
    }

    /* ═══════════════════════════════════════════════════════════
       HOME DASHBOARD — render all new panels
       Called from loadSummary() after data is ready.
    ═══════════════════════════════════════════════════════════ */
    var _hmMemberFilter = "all";

    /* ══════════════════════════════════════════════════
       VIEWING PERIOD BAR — fully interactive
    ══════════════════════════════════════════════════ */
    var _hmSelMonth = MONTHS[new Date().getMonth()];
    var _hmSelYear  = new Date().getFullYear();

    function _hmInitSelectors() {
      var mSel = document.getElementById("hm_sel_month");
      var ySel = document.getElementById("hm_sel_year");
      if (!mSel || !ySel) return;

      // Build hidden month options only once
      if (!mSel.options.length) {
        MONTHS.forEach(function(m) {
          var o = document.createElement("option"); o.value = m; o.textContent = m; mSel.appendChild(o);
        });
      }

      // Build year options from data + span 2023 to current year
      var years = new Set();
      data.forEach(function(c) { var y = Number(c.Year); if (!isNaN(y) && y > 2000) years.add(y); });
      expenses.forEach(function(e) { var y = Number(e.Year); if (!isNaN(y) && y > 2000) years.add(y); });
      var cur = new Date().getFullYear();
      for (var y = 2023; y <= cur; y++) years.add(y);
      var sortedYears = Array.from(years).sort(function(a,b){ return b-a; });

      // Populate visible year dropdown
      var ydrop = document.getElementById("hm_year_dropdown");
      if (ydrop) {
        ydrop.innerHTML = sortedYears.map(function(y) {
          return '<div onclick="_hmSelectYear(' + y + ')" style="padding:8px 16px;font-size:13px;font-weight:600;color:#e2e8f0;cursor:pointer;transition:background 0.15s;white-space:nowrap;" onmouseover="this.style.background=\'rgba(247,160,26,0.15)\'" onmouseout="this.style.background=\'\'">' + y + '</div>';
        }).join("");
      }

      // Populate hidden select
      ySel.innerHTML = sortedYears.map(function(y) {
        return '<option value="' + y + '">' + y + '</option>';
      }).join("");
      ySel.value = String(_hmSelYear);
      mSel.value = _hmSelMonth;
    }

    function _hmSelectMonth(monthName) {
      _hmSelMonth = monthName;
      var mSel = document.getElementById("hm_sel_month");
      if (mSel) mSel.value = monthName;
      _hmRefreshBar();
      _hmRenderDashboard(_hmSelMonth, _hmSelYear);
    }

    function _hmSelectYear(y) {
      _hmSelYear = y;
      var ySel = document.getElementById("hm_sel_year");
      if (ySel) ySel.value = String(y);
      _hmToggleYearDropdown(false);
      _hmRefreshBar();
      _hmRenderDashboard(_hmSelMonth, _hmSelYear);
    }

    function _hmToggleYearDropdown(forceClose) {
      var drop = document.getElementById("hm_year_dropdown");
      var caret = document.getElementById("hm_year_caret");
      if (!drop) return;
      var open = forceClose === false ? false : (drop.style.display === "none" || drop.style.display === "");
      drop.style.display = open ? "block" : "none";
      if (caret) caret.style.transform = open ? "rotate(180deg)" : "";
      if (open) {
        // Highlight active year
        Array.from(drop.children).forEach(function(el) {
          el.style.color = el.textContent.trim() === String(_hmSelYear) ? "#f7a01a" : "#e2e8f0";
          el.style.fontWeight = el.textContent.trim() === String(_hmSelYear) ? "700" : "600";
        });
        setTimeout(function() {
          document.addEventListener("click", function _closeYearDrop(e) {
            var d = document.getElementById("hm_year_dropdown");
            if (d && !d.contains(e.target) && !e.target.closest("#hm_year_dropdown")) {
              _hmToggleYearDropdown(false);
            }
            document.removeEventListener("click", _closeYearDrop);
          });
        }, 10);
      }
    }

    /* ── Refresh bar label + pills + year display (no data reload) ── */
    function _hmRefreshBar() {
      var now = new Date();
      var isCurrent = _hmSelMonth === MONTHS[now.getMonth()] && _hmSelYear === now.getFullYear();

      var lblText = document.getElementById("hm_period_label_text");
      var lbl = document.getElementById("hm_period_label");
      if (lblText) lblText.textContent = (isCurrent ? "Current — " : "") + _hmSelMonth + " " + _hmSelYear;
      if (lbl) {
        lbl.style.background = isCurrent
          ? "linear-gradient(90deg,#f7a01a,#f59e0b)"
          : "linear-gradient(90deg,#6366f1,#4f46e5)";
      }

      var yrDisp = document.getElementById("hm_year_display");
      if (yrDisp) yrDisp.textContent = _hmSelYear;

      _hmRenderMonthPills(_hmSelMonth);
    }

    function _hmOnPeriodChange() {
      // Called on init — reset to current month/year
      var now = new Date();
      _hmSelMonth = MONTHS[now.getMonth()];
      _hmSelYear  = now.getFullYear();
      var mSel = document.getElementById("hm_sel_month");
      var ySel = document.getElementById("hm_sel_year");
      if (mSel) mSel.value = _hmSelMonth;
      if (ySel) ySel.value = String(_hmSelYear);
      _hmRefreshBar();
      _hmRenderDashboard(_hmSelMonth, _hmSelYear);
    }

    /* ── Render clickable month pills ── */
    var _hmShortMonths = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    function _hmRenderMonthPills(activeMonth) {
      var container = document.getElementById("hm_month_pills");
      if (!container) return;
      container.innerHTML = _hmShortMonths.map(function(m, i) {
        var fullName = MONTHS[i];
        var isActive = fullName === activeMonth;
        return '<div onclick="_hmSelectMonth(\'' + fullName + '\')" style="' +
          'padding:6px 15px;border-radius:20px;font-size:12px;font-weight:' + (isActive ? '700' : '500') + ';' +
          'background:' + (isActive ? 'linear-gradient(135deg,#f7a01a,#f59e0b)' : 'rgba(255,255,255,0.06)') + ';' +
          'color:' + (isActive ? '#fff' : '#94a3b8') + ';' +
          'border:1.5px solid ' + (isActive ? 'rgba(247,160,26,0.6)' : 'rgba(255,255,255,0.09)') + ';' +
          'cursor:pointer;user-select:none;transition:all 0.18s;white-space:nowrap;' +
          'box-shadow:' + (isActive ? '0 2px 12px rgba(247,160,26,0.35)' : 'none') + ';' +
          '" onmouseover="if(this.dataset.active!==\'1\'){this.style.background=\'rgba(255,255,255,0.12)\';this.style.color=\'#e2e8f0\';}" ' +
          'onmouseout="if(this.dataset.active!==\'1\'){this.style.background=\'rgba(255,255,255,0.06)\';this.style.color=\'#94a3b8\';}" ' +
          'data-active="' + (isActive ? '1' : '0') + '">' + m + '</div>';
      }).join("");
    }

    /* ── Live clock ── */
    (function _startLiveClock() {
      var _days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      var _mos  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      function _tick() {
        var el = document.getElementById("hm_live_clock");
        if (!el) return;
        var n = new Date();
        var d = _days[n.getDay()];
        var dt = n.getDate();
        var mo = _mos[n.getMonth()];
        var h = n.getHours(), mi = String(n.getMinutes()).padStart(2,"0");
        var ampm = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;
        el.textContent = d + " " + dt + " " + mo + " — " + h + ":" + mi + " " + ampm;
      }
      _tick();
      setInterval(_tick, 1000);
    })();

    function _hmGoToCurrentMonth() {
      var now = new Date();
      _hmSelMonth = MONTHS[now.getMonth()];
      _hmSelYear  = now.getFullYear();
      _hmRefreshBar();
      _hmRenderDashboard(_hmSelMonth, _hmSelYear);
    }

    function _hmRenderDashboard(overrideMonth, overrideYear) {
      var now        = new Date();
      var curYear    = overrideYear  ? Number(overrideYear)  : now.getFullYear();
      var curMonth   = overrideMonth ? overrideMonth : MONTHS[now.getMonth()];

      // Trend: previous month relative to selected period
      var curMonthIdx   = MONTHS.indexOf(curMonth);
      var lastMonthIdx  = curMonthIdx === 0 ? 11 : curMonthIdx - 1;
      var lastMonth     = MONTHS[lastMonthIdx];
      var lastMonthYear = curMonthIdx === 0 ? curYear - 1 : curYear;

      const isWalkIn   = function(c) { return String(c.UserId).startsWith("WALKIN_"); };

      // ── Month contribution split
      var monthContribs = data.filter(function(c) {
        return String(c.Year) === String(curYear) && c.ForMonth === curMonth;
      });
      var monthMembers  = monthContribs.filter(function(c) { return !isWalkIn(c); });
      var monthWalkIns  = monthContribs.filter(function(c) { return isWalkIn(c); });
      var monthMemberC  = monthMembers.reduce(function(s,c) { return s + Number(c.Amount||0); }, 0);
      var monthWalkInC  = monthWalkIns.reduce(function(s,c) { return s + Number(c.Amount||0); }, 0);
      var monthE        = expenses.filter(function(e) {
        return String(e.Year) === String(curYear) && e.ForMonth === curMonth;
      }).reduce(function(s,e) { return s + Number(e.Amount||0); }, 0);

      // Previous month for trends
      var lastMonthC = data.filter(function(c) {
        return String(c.Year) === String(lastMonthYear) && c.ForMonth === lastMonth && !isWalkIn(c);
      }).reduce(function(s,c) { return s + Number(c.Amount||0); }, 0);
      var lastMonthE = expenses.filter(function(e) {
        return String(e.Year) === String(lastMonthYear) && e.ForMonth === lastMonth;
      }).reduce(function(s,e) { return s + Number(e.Amount||0); }, 0);

      // Active non-admin members
      var activeMembers = users.filter(function(u) {
        return u.Role !== "Admin" && String(u.Status||"Active").toLowerCase() === "active";
      });

      // Who has paid this selected month (member only, no walk-ins)
      var paidUserIds  = new Set(monthMembers.map(function(c) { return String(c.UserId); }));
      var paidCount    = activeMembers.filter(function(u) { return paidUserIds.has(String(u.UserId)); }).length;
      var pendingCount = activeMembers.length - paidCount;

      // ── KPI Cards
      var el;
      el = document.getElementById("kpi_monthC");
      if (el) _countUp(el, "₹" + fmt(monthMemberC + monthWalkInC), "#27ae60");
      el = document.getElementById("kpi_monthC_trend");
      if (el) {
        if (lastMonthC === 0 && monthMemberC === 0) {
          el.innerHTML = '<span style="color:#94a3b8;">— No data</span>';
        } else if (lastMonthC === 0) {
          el.innerHTML = '<span style="color:#27ae60;">New this month</span>';
        } else {
          var diff = monthMemberC - lastMonthC;
          var pct  = Math.abs(Math.round((diff / lastMonthC) * 100));
          var col  = diff >= 0 ? "#27ae60" : "#e74c3c";
          var arrow = diff >= 0 ? "▲" : "▼";
          el.innerHTML = '<span style="color:' + col + ';">' + arrow + ' ' + pct + '% vs ' + lastMonth + '</span>';
        }
      }

      el = document.getElementById("kpi_walkinC");
      if (el) _countUp(el, "₹" + fmt(monthWalkInC), "#d97706");
      el = document.getElementById("kpi_walkinC_sub");
      if (el) el.textContent = monthWalkIns.length + " entr" + (monthWalkIns.length === 1 ? "y" : "ies");

      el = document.getElementById("kpi_monthE");
      if (el) _countUp(el, "₹" + fmt(monthE), "#e74c3c");
      el = document.getElementById("kpi_monthE_trend");
      if (el) {
        if (lastMonthE === 0 && monthE === 0) {
          el.innerHTML = '<span style="color:#94a3b8;">— No data</span>';
        } else if (lastMonthE === 0) {
          el.innerHTML = '<span style="color:#94a3b8;">New this month</span>';
        } else {
          var diffE = monthE - lastMonthE;
          var pctE  = Math.abs(Math.round((diffE / lastMonthE) * 100));
          var colE  = diffE <= 0 ? "#27ae60" : "#e74c3c";
          var arrowE = diffE >= 0 ? "▲" : "▼";
          el.innerHTML = '<span style="color:' + colE + ';">' + arrowE + ' ' + pctE + '% vs ' + lastMonth + '</span>';
        }
      }

      el = document.getElementById("kpi_pending");
      if (el) _countUp(el, String(pendingCount), pendingCount > 0 ? "#e74c3c" : "#27ae60");
      el = document.getElementById("kpi_total_members");
      if (el) el.textContent = activeMembers.length;
      el = document.getElementById("kpi_pending_sub");
      if (el) {
        var paidPct = activeMembers.length > 0 ? Math.round((paidCount / activeMembers.length) * 100) : 0;
        el.innerHTML = 'of ' + activeMembers.length + ' members &nbsp;·&nbsp; <b style="color:#27ae60;">' + paidPct + '% paid</b>';
      }

      // ── Member badge (show selected period)
      el = document.getElementById("hm_member_badge");
      if (el) el.textContent = curMonth + " " + curYear;

      // ── Render member list (store selected period for tab re-renders)
      window._hmMemberData = { activeMembers: activeMembers, paidUserIds: paidUserIds, monthMembers: monthMembers, curMonth: curMonth, curYear: curYear };
      _hmRenderMemberList();

      // ── Member summary
      el = document.getElementById("hm_member_summary");
      if (el) el.textContent = paidCount + " paid · " + pendingCount + " pending";

      // ── Walk-in list
      _hmRenderWalkinList(monthWalkIns);

      // ── Walk-in summary
      el = document.getElementById("hm_walkin_summary");
      if (el) el.textContent = monthWalkIns.length + " entries · ₹" + fmt(monthWalkInC) + " total";

      // ── Bar chart
      _hmRenderBarChart(curYear, curMonth);

      // ── Smart alerts
      _hmRenderAlerts(pendingCount, monthE, activeMembers, curMonth, curYear);

      // ── Year tracker
      _hmRenderYearTracker(curYear, curMonth);
    }

    function _hmMemberTab(filter, btn) {
      _hmMemberFilter = filter;
      // Update tab button styles
      ["hm_tab_all", "hm_tab_paid", "hm_tab_pending"].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.style.background = "#f1f5f9"; el.style.color = "#334155"; }
      });
      if (btn) { btn.style.background = "#334155"; btn.style.color = "#fff"; }
      _hmRenderMemberList();
    }

    function _hmRenderMemberList() {
      var d = window._hmMemberData;
      if (!d) return;
      var el = document.getElementById("hm_member_list");
      if (!el) return;

      var list = d.activeMembers;
      if (_hmMemberFilter === "paid")    list = list.filter(function(u) { return d.paidUserIds.has(String(u.UserId)); });
      if (_hmMemberFilter === "pending") list = list.filter(function(u) { return !d.paidUserIds.has(String(u.UserId)); });

      if (list.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:12px;">' +
          (_hmMemberFilter === "paid" ? '🎉 No paid members yet' : '🎉 All members have paid!') + '</div>';
        return;
      }

      el.innerHTML = list.map(function(u) {
        var paid   = d.paidUserIds.has(String(u.UserId));
        var dotCol = paid ? "#22c55e" : "#e74c3c";
        var initials = (u.Name || "?").split(" ").map(function(w) { return w[0]; }).join("").substring(0,2).toUpperCase();
        var bgCol  = paid ? "rgba(34,197,94,0.1)" : "rgba(231,76,60,0.1)";
        var txtCol = paid ? "#15803d" : "#dc2626";

        // Find contributions for this member this month
        var myContribs = d.monthMembers.filter(function(c) { return String(c.UserId) === String(u.UserId); });
        var myAmt      = myContribs.reduce(function(s,c) { return s + Number(c.Amount||0); }, 0);

        var subLine = paid
          ? "Paid · ₹" + fmt(myAmt)
          : (String(u.Status||"").toLowerCase() === "inactive" ? "Inactive" : "Pending");

        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9;">' +
          '<div style="width:8px;height:8px;border-radius:50%;background:' + dotCol + ';flex-shrink:0;"></div>' +
          '<div style="width:28px;height:28px;border-radius:50%;background:' + bgCol + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:' + txtCol + ';flex-shrink:0;">' + initials + '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:12px;font-weight:600;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(u.Name||"—") + '</div>' +
            '<div style="font-size:10px;color:#94a3b8;">' + subLine + '</div>' +
          '</div>' +
          '<span style="font-size:11px;font-weight:700;color:' + (paid ? "#27ae60" : "#e74c3c") + ';">' + (paid ? "₹" + fmt(myAmt) : "—") + '</span>' +
        '</div>';
      }).join("");
    }

    function _hmRenderWalkinList(walkIns) {
      var el = document.getElementById("hm_walkin_list");
      if (!el) return;
      if (!walkIns || walkIns.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:12px;">No walk-in entries this month</div>';
        return;
      }
      // Show most recent 8
      var recent = walkIns.slice().sort(function(a,b) {
        return String(b.PaymentDate||"").localeCompare(String(a.PaymentDate||""));
      }).slice(0, 8);

      el.innerHTML = recent.map(function(c) {
        var nameRaw = String(c.Note||"").match(/Walk-in:\s*([^|]+)/);
        var visitorName = nameRaw ? nameRaw[1].trim() : "Visitor";
        var typeName = (types.find(function(t) { return String(t.TypeId) === String(c.TypeId); }) || {}).TypeName || "Daan";
        var dateStr = c.PaymentDate
          ? (c.PaymentDate instanceof Date
              ? c.PaymentDate.toLocaleDateString(APP.locale||"en-IN")
              : String(c.PaymentDate).split(" ")[0])
          : "—";
        return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#fffbeb;margin-bottom:5px;">' +
          '<div style="width:28px;height:28px;border-radius:50%;background:#fde68a;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#92400e;flex-shrink:0;">W</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:12px;font-weight:600;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(visitorName) + '</div>' +
            '<div style="font-size:10px;color:#94a3b8;">' + escapeHtml(typeName) + ' · ' + dateStr + '</div>' +
          '</div>' +
          '<span style="font-size:12px;font-weight:700;color:#d97706;">₹' + fmt(c.Amount) + '</span>' +
        '</div>';
      }).join("");
    }

    function _hmRenderBarChart(curYear, selMonth) {
      var el = document.getElementById("hm_bar_chart");
      if (!el) return;

      var mapC = {}, mapE = {};
      data.filter(function(c) { return String(c.Year) === String(curYear); }).forEach(function(c) {
        var m = c.ForMonth || "";
        if (m) mapC[m] = (mapC[m] || 0) + Number(c.Amount || 0);
      });
      expenses.filter(function(e) { return String(e.Year) === String(curYear); }).forEach(function(e) {
        var m = e.ForMonth || "";
        if (m) mapE[m] = (mapE[m] || 0) + Number(e.Amount || 0);
      });

      var active = MONTHS.filter(function(m) { return (mapC[m]||0) > 0 || (mapE[m]||0) > 0; });
      if (active.length === 0) {
        el.innerHTML = '<div style="color:#94a3b8;font-size:12px;padding:16px;text-align:center;">No data for ' + curYear + '</div>';
        return;
      }

      var maxC = Math.max.apply(null, active.map(function(m) { return mapC[m]||0; }).concat([1]));
      var maxE = Math.max.apply(null, active.map(function(m) { return mapE[m]||0; }).concat([1]));
      var selIdx = active.indexOf(selMonth);
      var prevM  = selIdx > 0 ? active[selIdx - 1] : null;
      var selC   = mapC[selMonth] || 0, selE = mapE[selMonth] || 0;
      var netSel = selC - selE;

      // Legend once
      var legId = "_hm_cmp_legend";
      if (!document.getElementById(legId)) {
        var leg = document.createElement("div");
        leg.id  = legId;
        leg.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";
        leg.innerHTML =
          '<span style="font-size:12px;font-weight:600;color:#334155;">Monthly comparison · ' + curYear + '</span>' +
          '<div style="display:flex;gap:10px;">' +
            '<span style="font-size:10px;display:flex;align-items:center;gap:4px;color:#64748b;"><span style="width:10px;height:10px;background:#22c55e;border-radius:2px;display:inline-block;"></span>Income</span>' +
            '<span style="font-size:10px;display:flex;align-items:center;gap:4px;color:#64748b;"><span style="width:10px;height:10px;background:#f97316;border-radius:2px;display:inline-block;"></span>Expense</span>' +
          '</div>';
        el.parentNode && el.parentNode.insertBefore(leg, el);
      } else {
        var t = document.querySelector("#_hm_cmp_legend span");
        if (t) t.textContent = "Monthly comparison · " + curYear;
      }

      var rows = active.map(function(m) {
        var cV = mapC[m]||0, eV = mapE[m]||0;
        var sel = m === selMonth;
        var cW  = Math.round((cV / maxC) * 100);
        var eW  = Math.round((eV / maxE) * 100);
        return '<div onclick="_hmSelectMonth(\'' + m + '\')" ' +
          'style="display:grid;grid-template-columns:32px 1fr 1fr;gap:6px;align-items:center;cursor:pointer;' +
          (sel ? 'background:rgba(247,160,26,0.07);border-radius:7px;padding:4px;' : 'padding:3px 4px;') + '">' +
          '<span style="font-size:10px;font-weight:' + (sel?'600':'400') + ';color:' + (sel?'#d97706':'#64748b') + ';">' + m.slice(0,3) + '</span>' +
          '<div style="display:flex;align-items:center;gap:5px;">' +
            '<div style="flex:1;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;">' +
              '<div style="height:100%;width:' + cW + '%;background:' + (sel?'#16a34a':'#22c55e') + ';border-radius:4px;transition:width .3s;"></div>' +
            '</div>' +
            '<span style="font-size:10px;font-weight:' + (sel?'600':'400') + ';color:' + (sel?'#15803d':'#16a34a') + ';white-space:nowrap;min-width:38px;text-align:right;">₹' + _fmtK(cV) + '</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:5px;">' +
            '<div style="flex:1;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;">' +
              '<div style="height:100%;width:' + eW + '%;background:' + (sel?'#ea580c':'#f97316') + ';border-radius:4px;transition:width .3s;"></div>' +
            '</div>' +
            '<span style="font-size:10px;font-weight:' + (sel?'600':'400') + ';color:' + (sel?'#ea580c':'#f97316') + ';white-space:nowrap;min-width:38px;text-align:right;">₹' + _fmtK(eV) + '</span>' +
          '</div>' +
        '</div>';
      }).join('<div style="height:1px;background:#f1f5f9;margin:1px 4px;"></div>');

      function _chip(label, delta, invert) {
        var good  = invert ? delta <= 0 : delta >= 0;
        var bg    = delta === 0 ? "#f8fafc" : good ? "#f0fdf4" : "#fef2f2";
        var col   = delta === 0 ? "#94a3b8" : good ? "#16a34a" : "#dc2626";
        var arrow = delta === 0 ? "—" : delta > 0 ? "▲" : "▼";
        return '<div style="flex:1;background:' + bg + ';border-radius:8px;padding:7px 10px;text-align:center;min-width:0;">' +
          '<div style="font-size:10px;color:#64748b;margin-bottom:2px;">' + label + '</div>' +
          '<div style="font-size:12px;font-weight:600;color:' + col + ';white-space:nowrap;">' +
            arrow + ' ₹' + _fmtK(Math.abs(delta)) + (prevM ? ' vs ' + prevM.slice(0,3) : '') +
          '</div>' +
        '</div>';
      }

      var chips = prevM
        ? '<div style="display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:0.5px solid #f1f5f9;">' +
            _chip("Income", selC - (mapC[prevM]||0), false) +
            _chip("Expense", selE - (mapE[prevM]||0), true) +
            '<div style="flex:1;background:#eff6ff;border-radius:8px;padding:7px 10px;text-align:center;min-width:0;">' +
              '<div style="font-size:10px;color:#64748b;margin-bottom:2px;">Net · ' + selMonth.slice(0,3) + '</div>' +
              '<div style="font-size:12px;font-weight:600;color:' + (netSel>=0?'#2563eb':'#dc2626') + ';white-space:nowrap;">' +
                (netSel<0?'−':'') + '₹' + _fmtK(Math.abs(netSel)) +
              '</div>' +
            '</div>' +
          '</div>'
        : '';

      el.style.display = "block";
      el.innerHTML = rows + chips;
    }

    function _fmtK(v) {
      v = Math.round(v);
      if (v >= 100000) return (v/100000).toFixed(1).replace(/\.0$/,"") + "L";
      if (v >= 1000)   return (v/1000).toFixed(1).replace(/\.0$/,"") + "k";
      return String(v);
    }

    function _hmRenderAlerts(pendingCount, monthE, activeMembers, curMonth, curYear) {
      var el = document.getElementById("hm_alerts_list");
      var badgeEl = document.getElementById("hm_alert_badge");
      if (!el) return;

      var alerts = [];

      // Alert 1: pending members
      if (pendingCount > 0) {
        alerts.push({
          type: "warn",
          text: pendingCount + " member" + (pendingCount > 1 ? "s haven't" : " hasn't") + " paid this month",
          sub: "Go to Tracker to send reminders →",
          action: "showPage('trackerPage',document.querySelector('[onclick*=trackerPage]'))"
        });
      }

      // Alert 2: expenses vs contributions (selected period)
      var monthC = data.filter(function(c) {
        return String(c.Year) === String(curYear) && c.ForMonth === curMonth;
      }).reduce(function(s,c) { return s + Number(c.Amount||0); }, 0);
      if (monthE > monthC && monthC > 0) {
        alerts.push({
          type: "warn",
          text: "Expenses (₹" + fmt(monthE) + ") exceed income (₹" + fmt(monthC) + ")",
          sub: "Review expense page →",
          action: "showPage('expensePage',document.querySelector('[onclick*=expensePage]'))"
        });
      }

      // Alert 3: month progress (up to selected month)
      var selMonthIdx = MONTHS.indexOf(curMonth);
      var doneMonths = MONTHS.slice(0, selMonthIdx + 1).filter(function(m) {
        // Only count months that have at least one real MEMBER contribution (not walk-in-only)
        return data.some(function(c) {
          return String(c.Year) === String(curYear) && c.ForMonth === m &&
                 !String(c.UserId).startsWith("WALKIN_");
        });
      }).length;
      var totalMonths = selMonthIdx + 1;
      if (doneMonths < totalMonths) {
        var missing = totalMonths - doneMonths;
        alerts.push({
          type: "info",
          text: missing + " month" + (missing>1?"s":"") + " with no contributions recorded",
          sub: "Check contribution records →",
          action: "showPage('contributionPage',document.querySelector('[onclick*=contributionPage]'))"
        });
      }

      // BIRTHDAY: inject upcoming birthdays
      // FIX: midnight-normalised comparison so diff===0 always means today
      (function() {
        if (!users || !users.length) return;
        var now   = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var bdayAlerts = [];
        users.forEach(function(u) {
          if (!u.DOB || String(u.Role||"").toLowerCase() === "admin") return;
          var dob = String(u.DOB||"").trim();
          var dd, mm, parts;
          if      (/^\d{2}-\d{2}-\d{4}$/.test(dob)) { parts=dob.split("-"); dd=Number(parts[0]); mm=Number(parts[1]); }
          else if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) { parts=dob.split("-"); dd=Number(parts[2]); mm=Number(parts[1]); }
          else if (dob.indexOf("T")>=0||dob.indexOf("Z")>=0) {
            var _d=new Date(dob); if(isNaN(_d)) return;
            dd=_d.getUTCDate(); mm=_d.getUTCMonth()+1;
          } else return;
          var bday = new Date(today.getFullYear(), mm-1, dd);
          if (bday < today) bday = new Date(today.getFullYear()+1, mm-1, dd);
          var diff = Math.round((bday - today) / 86400000);
          if (diff === 0)      bdayAlerts.push({ type:"birthday", diff:0, text:"🎂 Today is " + escapeHtml(u.Name) + "'s birthday!", sub:"Birthday email will be sent automatically if enabled" });
          else if (diff === 1) bdayAlerts.push({ type:"birthday", diff:1, text:"🎂 " + escapeHtml(u.Name) + "'s birthday is tomorrow!", sub:"" });
          else if (diff <= 7)  bdayAlerts.push({ type:"birthday", diff:diff, text:"🎂 " + escapeHtml(u.Name) + "'s birthday in " + diff + " days", sub:"" });
        });
        // Sort by diff ascending, then prepend to alerts so birthdays show first
        bdayAlerts.sort(function(a,b){ return a.diff - b.diff; });
        bdayAlerts.forEach(function(a){ alerts.unshift(a); });
      })();

      // All clear
      if (alerts.length === 0) {
        alerts.push({ type: "ok", text: "All clear — everything looks good!", sub: "" });
      }

      if (badgeEl) {
        var warnCount = alerts.filter(function(a) { return a.type === "warn"; }).length;
        if (warnCount > 0) {
          badgeEl.textContent = warnCount + " warning" + (warnCount > 1 ? "s" : "");
          badgeEl.style.display = "inline-block";
        } else {
          badgeEl.style.display = "none";
        }
      }

      el.innerHTML = alerts.map(function(a) {
        var bg  = a.type === "warn" ? "#fffbeb" : a.type === "info" ? "#eff6ff" : a.type === "birthday" ? "#fdf4ff" : "#f0fdf4";
        var bc  = a.type === "warn" ? "#fde68a" : a.type === "info" ? "#bfdbfe" : a.type === "birthday" ? "#e9d5ff" : "#bbf7d0";
        var ic  = a.type === "warn" ? "fa-triangle-exclamation" : a.type === "info" ? "fa-circle-info" : a.type === "birthday" ? "fa-cake-candles" : "fa-circle-check";
        var ic2 = a.type === "warn" ? "#d97706" : a.type === "info" ? "#2563eb" : a.type === "birthday" ? "#9333ea" : "#16a34a";
        var cursor = a.action ? "cursor:pointer;" : "";
        var onclick = a.action ? ' onclick="' + a.action + '"' : "";
        return '<div style="background:' + bg + ';border:1px solid ' + bc + ';border-radius:8px;padding:9px 12px;margin-bottom:7px;' + cursor + '"' + onclick + '>' +
          '<div style="display:flex;align-items:flex-start;gap:8px;">' +
            '<i class="fa-solid ' + ic + '" style="color:' + ic2 + ';font-size:13px;margin-top:1px;flex-shrink:0;"></i>' +
            '<div>' +
              '<div style="font-size:12px;font-weight:600;color:#334155;">' + a.text + '</div>' +
              (a.sub ? '<div style="font-size:11px;color:#64748b;margin-top:2px;">' + a.sub + '</div>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
      }).join("");
    }

    function _hmRenderYearTracker(curYear, curMonth) {
      var el = document.getElementById("hm_yr_label");
      if (el) el.textContent = curYear;

      var selMonthIdx = curMonth ? MONTHS.indexOf(curMonth) : new Date().getMonth();
      var pct = Math.round((selMonthIdx + 1) / 12 * 100);

      el = document.getElementById("hm_yr_months_done");
      if (el) el.textContent = selMonthIdx + 1;
      el = document.getElementById("hm_yr_pct");
      if (el) el.textContent = pct + "%";
      el = document.getElementById("hm_yr_progress_fill");
      if (el) {
        el.style.width = pct + "%";
        el.style.transition = "width .4s ease";
        el.style.background = pct >= 75 ? "#27ae60" : pct >= 40 ? "#f7a01a" : "#e74c3c";
      }

      // ── Year totals for selected year (the numbers that were ₹0 before) ──
      var yearC = data.filter(function(c) {
        return String(c.Year) === String(curYear);
      }).reduce(function(s,c) { return s + Number(c.Amount||0); }, 0);

      var yearE = expenses.filter(function(e) {
        return String(e.Year) === String(curYear);
      }).reduce(function(s,e) { return s + Number(e.Amount||0); }, 0);

      // Opening balance for selected year — use dash_getOpeningBalance() so that if no
      // yearConfig row exists yet for this year (e.g. brand-new year), it correctly
      // computes the carry-forward from the previous year's closing balance recursively,
      // instead of silently falling back to 0.
      var opening = (typeof dash_getOpeningBalance === "function" && Array.isArray(dash_yearConfig) && dash_yearConfig.length)
        ? dash_getOpeningBalance(curYear, dash_yearConfig, data, expenses)
        : 0;
      var net = opening + yearC - yearE;
      var netCol = net >= 0 ? "#16a34a" : "#dc2626";

      // Status badge
      el = document.getElementById("hm_yr_status_badge");
      if (el) {
        if (yearC > yearE) {
          el.textContent = "On track";
          el.style.background = "#f0fdf4"; el.style.color = "#166534"; el.style.border = "1px solid #bbf7d0";
        } else if (yearE > yearC) {
          el.textContent = "Deficit";
          el.style.background = "#fef2f2"; el.style.color = "#991b1b"; el.style.border = "1px solid #fca5a5";
        } else {
          el.textContent = "Balanced";
          el.style.background = "#f8fafc"; el.style.color = "#475569"; el.style.border = "1px solid #e2e8f0";
        }
      }

      // ── Inject year stat cells below status badge (idempotent) ──────────
      // Shows: collected · expenses · net · members for the SELECTED year
      (function _renderYearStatCells() {
        var cellsId = "_hm_yr_cells";
        var wrap = document.getElementById(cellsId);
        if (!wrap) {
          wrap = document.createElement("div");
          wrap.id = cellsId;
          wrap.style.cssText = "display:flex;gap:6px;margin-top:10px;";
          var badge = document.getElementById("hm_yr_status_badge");
          if (badge && badge.parentNode) badge.parentNode.appendChild(wrap);
        }
        var memberCount = users.filter(function(u) {
          return String(u.Status||"").toLowerCase() === "active";
        }).length || (window._hmActiveMemberCount || 0);

        function cell(label, val, col) {
          return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;' +
            'padding:8px 4px;background:#f8fafc;border:0.5px solid #e2e8f0;border-radius:8px;">' +
            '<div style="font-size:14px;font-weight:600;color:' + (col||"#334155") + ';line-height:1.2;">' + val + '</div>' +
            '<div style="font-size:9px;color:#94a3b8;margin-top:3px;text-align:center;white-space:nowrap;">' + label + '</div>' +
          '</div>';
        }
        wrap.innerHTML =
          cell("Collected",   "₹" + fmt(yearC), "#16a34a") +
          cell("Expenses",    "₹" + fmt(yearE), "#dc2626") +
          cell("Net balance", (net < 0 ? "−" : "") + "₹" + fmt(Math.abs(net)), netCol) +
          cell("Members",     String(memberCount), "#6366f1");
      })();
    }

    /* Also call _hmRenderDashboard after _dashSyncFromAdmin so
       Walk-in and member lists refresh after any contribution is added */
    // L2: removed unused _origDashSync variable (was captured at parse-time, never referenced)
    document.addEventListener("DOMContentLoaded", function() {
      var origSync = window._dashSyncFromAdmin;
      if (typeof origSync === "function") {
        window._dashSyncFromAdmin = function() {
          origSync();
          setTimeout(_hmRenderDashboard, 400);
        };
      }
    });

    function updateSidebarSummary() {
      const now = new Date();
      const curYear = now.getFullYear();
      const MOS = MONTHS; // PERF: reuse global
      const curMonth = MOS[now.getMonth()];

      // All contributions this month/year
      const monthContribs = data.filter(c => String(c.Year) === String(curYear) && c.ForMonth === curMonth);
      const yearContribs = data.filter(c => String(c.Year) === String(curYear));

      // Separate regular vs walk-in
      const isWalkIn = c => String(c.UserId).startsWith("WALKIN_");
      let monthC = monthContribs.filter(c => !isWalkIn(c)).reduce((s, c) => s + Number(c.Amount || 0), 0);
      let monthWalkIn = monthContribs.filter(c => isWalkIn(c)).reduce((s, c) => s + Number(c.Amount || 0), 0);
      let yearC = yearContribs.filter(c => !isWalkIn(c)).reduce((s, c) => s + Number(c.Amount || 0), 0);
      let yearWalkIn = yearContribs.filter(c => isWalkIn(c)).reduce((s, c) => s + Number(c.Amount || 0), 0);
      let yearE = expenses.filter(e => String(e.Year) === String(curYear)).reduce((s, e) => s + Number(e.Amount || 0), 0);

      let sb = document.getElementById("sb_members");
      if (sb) sb.innerText = users.filter(u => u.Role !== "Admin" && String(u.Status || "Active").toLowerCase() === "active").length;

      let sbm = document.getElementById("sb_month");
      if (sbm) sbm.innerText = "₹" + fmt(monthC + monthWalkIn);

      // Walk-in month
      let sbwm = document.getElementById("sb_walkin_month");
      if (sbwm) sbwm.innerText = monthWalkIn > 0 ? "₹" + fmt(monthWalkIn) : "—";

      let sby = document.getElementById("sb_year");
      if (sby) sby.innerText = "₹" + fmt(yearC + yearWalkIn);

      // Walk-in year
      let sbwy = document.getElementById("sb_walkin_year");
      if (sbwy) sbwy.innerText = yearWalkIn > 0 ? "₹" + fmt(yearWalkIn) : "—";

      let sbe = document.getElementById("sb_exp");
      if (sbe) sbe.innerText = "₹" + fmt(yearE);

      // Email quota is NOT read here anymore.
      // Reason: updateSidebarSummary() is called inside an async chain (after getCached resolves),
      // so any flag-based skip logic races and fails. Instead:
      //   • Page load:  init() calls _refreshEmailQuotaUI() once to populate the counter.
      //   • After save: _submitContributionFromPreview calls _refreshEmailQuotaUI() when emailSent=true.
      //   • All other quota refreshes: _refreshEmailQuotaUI() is called explicitly at each call site.
      // This ensures the counter is ALWAYS updated by a single controlled path that busts the cache first.
      // Populate WA selectors
      let waMonth = document.getElementById("wa_month");
      let waYear = document.getElementById("wa_year");
      if (waMonth && waMonth.options.length === 0) {
        MOS.forEach((m, i) => {
          let o = document.createElement("option");
          o.value = m;
          o.textContent = m;
          if (i === now.getMonth()) o.selected = true;
          waMonth.appendChild(o);
        });
        waMonth.addEventListener("change", _updateWaPreview);
      }
      if (waYear && waYear.options.length === 0) {
        let years = new Set();
        data.forEach((c) => {
          let y = Number(c.Year);
          if (!isNaN(y) && y > 2000) years.add(y);
        });
        for (let y = 2023; y <= curYear; y++) years.add(y);
        Array.from(years)
          .sort((a, b) => b - a)
          .forEach((y) => {
            let o = document.createElement("option");
            o.value = y;
            o.textContent = y;
            if (y === curYear) o.selected = true;
            waYear.appendChild(o);
          });
        waYear.addEventListener("change", _updateWaPreview);
      }
      _updateWaPreview();
    }

    function _updateWaPreview() {
      let waMonth = document.getElementById("wa_month");
      let waYear = document.getElementById("wa_year");
      let prev = document.getElementById("wa_preview");
      if (!prev) return;
      const selMonth = waMonth ? waMonth.value : "";
      const selYear = waYear
        ? Number(waYear.value)
        : new Date().getFullYear();
      // Quick stats for selected period
      let mc = data
        .filter(
          (c) => String(c.Year) === String(selYear) && c.ForMonth === selMonth
        )
        .reduce((s, c) => s + Number(c.Amount || 0), 0);
      let me = expenses
        .filter(
          (e) => String(e.Year) === String(selYear) && e.ForMonth === selMonth
        )
        .reduce((s, e) => s + Number(e.Amount || 0), 0);
      let yc = data
        .filter((c) => String(c.Year) === String(selYear))
        .reduce((s, c) => s + Number(c.Amount || 0), 0);
      let ye = expenses
        .filter((e) => String(e.Year) === String(selYear))
        .reduce((s, e) => s + Number(e.Amount || 0), 0);
      prev.innerHTML = `<span style="color:#f7a01a;font-weight:700;">${selMonth} ${selYear}</span><br>📥 ${APP.currency||"₹"}${fmt(
        mc
      )} in &nbsp;|&nbsp; 💸 ${APP.currency||"₹"}${fmt(
        me
      )} out<br><span style="color:#cbd5e1;">Year: ${APP.currency||"₹"}${fmt(
        yc
      )} in &nbsp;|&nbsp; ${APP.currency||"₹"}${fmt(ye)} out</span>`;
    }

    function sendWhatsAppReport(type) {
      const MOS = MONTHS; // PERF: reuse global
      let waMonth = document.getElementById("wa_month");
      let waYear = document.getElementById("wa_year");
      const selMonth = waMonth ? waMonth.value : MOS[new Date().getMonth()];
      const selYear = waYear
        ? Number(waYear.value)
        : new Date().getFullYear();
      const genDate = new Date().toLocaleDateString(APP.locale||"en-IN");
      let msg = "";
      if (type === "month") {
        let monthContribs = data.filter(
          (c) => String(c.Year) === String(selYear) && c.ForMonth === selMonth
        );
        let monthTotal = monthContribs.reduce(
          (s, c) => s + Number(c.Amount || 0),
          0
        );
        let monthExp = expenses
          .filter(
            (e) =>
              String(e.Year) === String(selYear) && e.ForMonth === selMonth
          )
          .reduce((s, e) => s + Number(e.Amount || 0), 0);
        // FIX #12: Include walk-in entries in member lines
        let walkInTotal = monthContribs
          .filter((c) => String(c.UserId).startsWith("WALKIN_"))
          .reduce((s, c) => s + Number(c.Amount || 0), 0);
        let memberLines = users
          .filter((u) => u.Role !== "Admin" && String(u.Status || "").toLowerCase() === "active")
          .map((u) => {
            let paid = monthContribs
              .filter((c) => String(c.UserId) === String(u.UserId))
              .reduce((s, c) => s + Number(c.Amount || 0), 0);
            return paid > 0
              ? `  ✅ ${u.Name}: ${APP.currency||"₹"}${fmt(paid)}`
              : `  ⬜ ${u.Name}: ₹0`;
          })
          .join("\n");
        if (walkInTotal > 0)
          memberLines += `\n  🚶 Walk-in Donors: ${APP.currency||"₹"}${fmt(walkInTotal)}`;
        msg = `${APP.symbol||"🕉️"} *${APP.name.toUpperCase()}*\n📍 ${APP.location}\n\n📅 *Monthly Report — ${selMonth} ${selYear}*\n━━━━━━━━━━━━━━━━━━━━\n👥 *Member Contributions:*\n${memberLines}\n\n━━━━━━━━━━━━━━━━━━━━\n💰 Total Collected: ${APP.currency||"₹"}${fmt(
          monthTotal
        )}\n💸 Total Expenses: ${APP.currency||"₹"}${fmt(
          monthExp
        )}\n━━━━━━━━━━━━━━━━━━━━\n_System Generated — ${genDate}_`;
      } else {
        let yearContribs = data.filter(
          (c) => String(c.Year) === String(selYear)
        );
        let yearTotal = yearContribs.reduce(
          (s, c) => s + Number(c.Amount || 0),
          0
        );
        let yearExp = expenses
          .filter((e) => String(e.Year) === String(selYear))
          .reduce((s, e) => s + Number(e.Amount || 0), 0);
        let walkInTotalYr = yearContribs
          .filter((c) => String(c.UserId).startsWith("WALKIN_"))
          .reduce((s, c) => s + Number(c.Amount || 0), 0);
        let memberLines = users
          .filter((u) => u.Role !== "Admin" && String(u.Status || "").toLowerCase() === "active")
          .map((u) => {
            let paid = yearContribs
              .filter((c) => String(c.UserId) === String(u.UserId))
              .reduce((s, c) => s + Number(c.Amount || 0), 0);
            let mos = [
              ...new Set(
                yearContribs
                  .filter((c) => String(c.UserId) === String(u.UserId))
                  .map((c) => c.ForMonth)
              ),
            ].join(", ");
            return paid > 0
              ? `  ✅ ${u.Name}: ${APP.currency||"₹"}${fmt(paid)} (${mos})`
              : `  ⬜ ${u.Name}: ₹0`;
          })
          .join("\n");
        // FIX #12: Add walk-in total to yearly report
        if (walkInTotalYr > 0)
          memberLines += `\n  🚶 Walk-in Donors: ${APP.currency||"₹"}${fmt(walkInTotalYr)}`;
        let monthLines = MOS.map((m) => {
          let mc = yearContribs
            .filter((c) => c.ForMonth === m)
            .reduce((s, c) => s + Number(c.Amount || 0), 0);
          let me = expenses
            .filter(
              (e) => String(e.Year) === String(selYear) && e.ForMonth === m
            )
            .reduce((s, e) => s + Number(e.Amount || 0), 0);
          if (mc === 0 && me === 0) return "";
          return `  ${m}: Collected ${APP.currency||"₹"}${fmt(mc)}  |  Expense ${APP.currency||"₹"}${fmt(me)}`;
        })
          .filter(Boolean)
          .join("\n");
        msg = `${APP.symbol||"🕉️"} *${APP.name.toUpperCase()}*\n📍 ${APP.location}\n\n📆 *Annual Report — ${selYear}*\n━━━━━━━━━━━━━━━━━━━━\n👥 *Member Contributions:*\n${memberLines}\n\n📅 *Month-wise Breakdown:*\n${monthLines || "  No data"
          }\n\n━━━━━━━━━━━━━━━━━━━━\n💰 Total Collected: ${APP.currency||"₹"}${fmt(
            yearTotal
          )}\n💸 Total Expenses: ${APP.currency||"₹"}${fmt(
            yearExp
          )}\n━━━━━━━━━━━━━━━━━━━━\n_System Generated — ${genDate}_`;
      }
      window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
    }

    function sendWhatsAppPDFReport() {
      // Generate dashboard PDF then open WhatsApp with summary text
      let waMonth = document.getElementById("wa_month");
      let waYear = document.getElementById("wa_year");
      const MOS = MONTHS;
      const selMonth = waMonth ? waMonth.value : MOS[new Date().getMonth()];
      const selYear = waYear
        ? Number(waYear.value)
        : new Date().getFullYear();
      const genDate = new Date().toLocaleDateString(APP.locale||"en-IN");
      if (typeof window.jspdf === "undefined") {
        toast("PDF library not loaded.", "error");
        return;
      }

      // Data for report
      const yearContribs = data.filter(c => String(c.Year) === String(selYear));
      const monthContribs = data.filter(c => String(c.Year) === String(selYear) && c.ForMonth === selMonth);
      const yrTotal = yearContribs.reduce((s, c) => s + Number(c.Amount || 0), 0);
      const yrExp = expenses.filter(e => String(e.Year) === String(selYear)).reduce((s, e) => s + Number(e.Amount || 0), 0);
      const moTotal = monthContribs.reduce((s, c) => s + Number(c.Amount || 0), 0);
      const moExp = expenses.filter(e => String(e.Year) === String(selYear) && e.ForMonth === selMonth).reduce((s, e) => s + Number(e.Amount || 0), 0);
      const { jsPDF } = window.jspdf;
      let doc = new jsPDF("p", "mm", "a4");
      let w = doc.internal.pageSize.getWidth();
      let ph = doc.internal.pageSize.getHeight();

      // ── Gold top accent bar
      doc.setFillColor(247, 160, 26); doc.rect(0, 0, w, 3, "F");

      // ── Header band
      doc.setFillColor(30, 41, 59); doc.rect(0, 3, w, 34, "F");
      doc.setFillColor(51, 65, 85); doc.rect(0, 20, w, 17, "F");

      // Logo in header
      let logoPlaced = false;
      if (typeof window._logoB64 !== "undefined" && window._logoB64) {
        try {
          doc.setFillColor(255, 255, 255); doc.circle(20, 14, 8, "F");
          doc.addImage(window._logoB64, "PNG", 12, 6, 16, 16);
          logoPlaced = true;
        } catch (e) { }
      }

      // Mandir name
      doc.setTextColor(247, 160, 26); doc.setFontSize(16); doc.setFont(undefined, "bold");
      doc.text(APP.name.toUpperCase(), w / 2, 14, { align: "center" });
      doc.setTextColor(200, 215, 230); doc.setFontSize(8); doc.setFont(undefined, "normal");
      doc.text(APP.address.toUpperCase() + "  |  CONFIDENTIAL FINANCIAL REPORT", w / 2, 21, { align: "center" });
      // Report title bar
      doc.setFillColor(247, 160, 26); doc.roundedRect(w / 2 - 45, 24, 90, 8, 2, 2, "F");
      doc.setTextColor(30, 41, 59); doc.setFontSize(8); doc.setFont(undefined, "bold");
      doc.text(`FINANCIAL REPORT — ${selMonth.toUpperCase()} ${selYear}`, w / 2, 29.2, { align: "center" });
      doc.setTextColor(180, 195, 210); doc.setFontSize(7); doc.setFont(undefined, "normal");
      doc.text("Generated: " + genDate, w / 2, 35.5, { align: "center" });

      // ── Summary cards row
      const cardY = 42;
      const cardH = 22;
      const cardW = (w - 20) / 4;
      const cards = [
        { label: "Month Collected", value: (APP.currency||"₹") + moTotal.toLocaleString(APP.locale||"en-IN"), color: [240, 253, 244], border: [134, 239, 172], text: [21, 128, 61] },
        { label: "Month Expenses", value: (APP.currency||"₹") + moExp.toLocaleString(APP.locale||"en-IN"), color: [254, 242, 242], border: [252, 165, 165], text: [185, 28, 28] },
        { label: "Year Collected", value: (APP.currency||"₹") + yrTotal.toLocaleString(APP.locale||"en-IN"), color: [239, 246, 255], border: [147, 197, 253], text: [37, 99, 235] },
        { label: "Net Balance", value: (APP.currency||"₹") + (yrTotal - yrExp).toLocaleString(APP.locale||"en-IN"), color: [254, 249, 238], border: [253, 211, 77], text: [146, 64, 14] },
      ];
      cards.forEach((card, i) => {
        const cx = 10 + i * (cardW + 2);
        doc.setFillColor(...card.color); doc.roundedRect(cx, cardY, cardW, cardH, 2, 2, "F");
        doc.setDrawColor(...card.border); doc.setLineWidth(0.4); doc.roundedRect(cx, cardY, cardW, cardH, 2, 2, "S");
        doc.setTextColor(...card.text); doc.setFontSize(9); doc.setFont(undefined, "bold");
        doc.text(card.value, cx + cardW / 2, cardY + 11, { align: "center" });
        doc.setFontSize(6); doc.setFont(undefined, "normal"); doc.setTextColor(100, 116, 139);
        doc.text(card.label, cx + cardW / 2, cardY + 17.5, { align: "center" });
      });

      // ── Period summary table
      doc.autoTable({
        head: [["Period", "Contributions (Rs.)", "Expenses (Rs.)", "Net (Rs.)"]],
        body: [
          [selMonth + " " + selYear, moTotal.toLocaleString(APP.locale||"en-IN"), moExp.toLocaleString(APP.locale||"en-IN"), (moTotal - moExp).toLocaleString(APP.locale||"en-IN")],
          ["Full Year " + selYear, yrTotal.toLocaleString(APP.locale||"en-IN"), yrExp.toLocaleString(APP.locale||"en-IN"), (yrTotal - yrExp).toLocaleString(APP.locale||"en-IN")],
        ],
        startY: cardY + cardH + 6,
        theme: "grid",
        headStyles: { fillColor: [51, 65, 85], textColor: [247, 160, 26], fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 3.5, halign: "center" },
        columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      // ── Member-wise table
      let memberRows = users
        .filter(u => u.Role !== "Admin" && String(u.Status || "").toLowerCase() === "active")
        .map((u, i) => {
          let paid = yearContribs.filter(c => String(c.UserId) === String(u.UserId)).reduce((s, c) => s + Number(c.Amount || 0), 0);
          let moPaid = monthContribs.filter(c => String(c.UserId) === String(u.UserId)).reduce((s, c) => s + Number(c.Amount || 0), 0);
          return [
            String(i + 1),
            u.Name,
            moPaid > 0 ? (APP.currency||"₹") + moPaid.toLocaleString(APP.locale||"en-IN") : "—",
            (APP.currency||"₹") + paid.toLocaleString(APP.locale||"en-IN"),
            moPaid > 0 ? "✓ Paid" : "Pending"
          ];
        });

      doc.autoTable({
        head: [["#", "Member Name", "This Month (Rs.)", "Year Total (Rs.)", "Status"]],
        body: memberRows,
        startY: doc.lastAutoTable.finalY + 6,
        theme: "grid",
        headStyles: { fillColor: [247, 160, 26], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          2: { halign: "right" },
          3: { halign: "right", fontStyle: "bold" },
          4: { halign: "center", fontStyle: "bold" }
        },
        alternateRowStyles: { fillColor: [253, 251, 247] },
        didParseCell: function (data) {
          if (data.column.index === 4 && data.section === "body") {
            const v = String(data.cell.raw || "");
            if (v === "✓ Paid") { data.cell.styles.textColor = [21, 128, 61]; }
            if (v === "Pending") { data.cell.styles.textColor = [185, 28, 28]; }
          }
        }
      });

      // ── Footer on every page
      let pages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFillColor(51, 65, 85); doc.rect(0, ph - 10, w, 10, "F");
        doc.setFontSize(6.5); doc.setTextColor(180, 195, 210); doc.setFont(undefined, "normal");
        doc.text(APP.name.toUpperCase() + ", " + APP.address.toUpperCase() + "  |  Confidential — For Internal Use Only", w / 2, ph - 5.5, { align: "center" });
        doc.setTextColor(247, 160, 26); doc.setFont(undefined, "bold");
        doc.text(`Page ${i} of ${pages}`, w - 8, ph - 5.5, { align: "right" });
      }

      doc.save("Mandir_Report_" + selYear + "_" + selMonth + ".pdf");
      setTimeout(() => {
        let msg = `${APP.symbol||"🕉️"} *${APP.name.toUpperCase()}*\n📍 ${APP.location}\n\n📊 *Financial Report — ${selMonth} ${selYear}*\n━━━━━━━━━━━━━━━━━━━━\n💰 Month Collected: ${APP.currency||"₹"}${fmt(
          moTotal
        )}\n💸 Month Expenses: ${APP.currency||"₹"}${fmt(moExp)}\n📅 Year Collected: ${APP.currency||"₹"}${fmt(
          yrTotal
        )}\n📅 Year Expenses: ${APP.currency||"₹"}${fmt(
          yrExp
        )}\n━━━━━━━━━━━━━━━━━━━━\nPlease find the attached PDF report.\n_${genDate}_`;
        toast("📥 PDF downloaded — attach it in WhatsApp", "");
        window.open(
          "https://wa.me/?text=" + encodeURIComponent(msg),
          "_blank"
        );
      }, 900);
    }

    async function init() {
      // SESSION GUARD: Check session BEFORE firing any backend call.
      // Without this, if _forceLogout() cleared localStorage (session expiry, cross-device kick),
      // getCached("getAllData") fires immediately with no userId/token → REJECTED_NO_TOKEN logged
      // as "Unknown". This guard stops all backend calls and lets _forceLogout handle the redirect.
      try {
        const _initSess = JSON.parse(localStorage.getItem("session") || "null");
        if (!_initSess || !_initSess.userId || !_initSess.sessionToken || Date.now() > (_initSess.expiry || 0)) {
          if (typeof _forceLogout === "function") {
            _forceLogout("Session expired. Please login again.", "Session expired - init guard");
          } else {
            location.replace("login.html");
          }
          return;
        }
      } catch(_e) { /* storage error — let init proceed, getData will get rejected cleanly */ }
      // Preserve scroll position so saves don't jump user to top
      const _scrollY = window.scrollY;
      _resetLoadingOverlay();
      setLoading(true);
      try {
        let allData = (await getCached("getAllData")) || {};
        users = allData.users || [];
        types = allData.types || [];
        expenseTypes = allData.expenseTypes || [];
        occasions = allData.occasions || [];
        data = allData.contributions || [];
        expenses = allData.expenses || [];
        goals = allData.goals || [];
        yearConfig = allData.yearConfig || [];
        showUser();
        loadMonths();
        loadYears();
        loadUsers();
        loadTypes();
        loadExpenseTypes();
        loadOccasions();
        render();
        renderUsers();
        updateUserTabCounts(users);
        renderTypes();
        renderOccasions();
        renderExpenseTypes();
        renderExpenses();
        loadExpenseFilters();
        renderGoals();
        loadSummary();
        // Populate Contribution Records filter dropdowns on initial load
        setTimeout(function() { if (typeof _cr_buildFilterDropdowns === "function") _cr_buildFilterDropdowns(); }, 400);
        // Load contribution request badge count — use cache so rapid init() calls don't stack requests
        getCached("getContributionRequests").then(function (res) {
          window._allRequests = Array.isArray(res) ? res : [];
          _updateReqBadge();
        }).catch(function () { });
        // Auto-refresh pending requests badge every 2 minutes.
        // Busts cache first so each scheduled tick always hits the server (not stale cache),
        // while ad-hoc reads within the 60s window still benefit from dedup.
        if (!window._reqBadgeTimer) {
          window._reqBadgeTimer = setInterval(function() {
            mandirCacheBust("getContributionRequests");
            getCached("getContributionRequests").then(function(res) {
              window._allRequests = Array.isArray(res) ? res : [];
              _updateReqBadge();
            }).catch(function(){});
          }, 2 * 60 * 1000);
        }
        // Populate email quota sidebar counter on page load.
        // FIX: Delay by 3s so the session token write from login has time to complete
        // before hitting getEmailQuota. Previously caused VERIFY_SESSION_ERROR in audit log.
        // _refreshEmailQuotaUI is the single owner of sb_email_quota —
        // updateSidebarSummary no longer reads quota to avoid async race.
        setTimeout(function() {
          if (typeof _refreshEmailQuotaUI === "function") _refreshEmailQuotaUI();
        }, 3000);
        // Auto-run health check once after data loads so the header
        // heartbeat dot shows the correct status colour from login
        if (!window._hcRanOnce && typeof runHealthCheck === "function") {
          window._hcRanOnce = true;
          setTimeout(runHealthCheck, 1500);
        }
      } catch (err) {
        // Show specific error reason in the loading overlay with a Retry button
        _showLoadingError(err);
        return; // keep overlay open — user will click Retry
      } finally {
        // Only hide overlay if we didn't hit an error (error path returns early above)
        const errEl = document.getElementById("loadingOverlay_error");
        if (!errEl || errEl.style.display === "none") {
          _aloRetryCount = 0;   // reset on success
          _aloClearCountdown(); // cancel any auto-retry timer
          setLoading(false);
        }
        // Restore scroll position after re-render
        requestAnimationFrame(() => window.scrollTo(0, _scrollY));
      }
    }

    function loadMonths() {
      const opts = MONTHS.map(
        (x) => `<option value="${x}">${x}</option>`
      ).join("");
      ["month", "expMonth"].forEach((id) => {
        let el = document.getElementById(id);
        if (el)
          el.innerHTML =
            (id !== "month" ? '<option value="">None</option>' : "") + opts;
      });
    }
    function loadYears() {
      let years = new Set();
      data.forEach((c) => {
        let y = Number(c.Year);
        if (!isNaN(y) && y > 2000) years.add(y);
      });
      expenses.forEach((e) => {
        let y = Number(e.Year);
        if (!isNaN(y) && y > 2000) years.add(y);
      });
      let cur = new Date().getFullYear();
      // Always include from 2023 (collection start year) to next year
      for (let y = 2023; y <= cur + 1; y++) years.add(y);

      const sortedYears = Array.from(years).sort((a, b) => b - a);

      // contribYear — shows label hint for past/future years so admin knows
      // the receipt ID will use the selected year (MNR-YYYY-NNNNN)
      const contribEl = document.getElementById("contribYear");
      if (contribEl) {
        contribEl.innerHTML = sortedYears.map((y) => {
          let label = String(y);
          if (y === cur)      label = y + " (Current)";
          else if (y < cur)   label = y + " (Old Entry)";
          else if (y > cur)   label = y + " (Advance)";
          return `<option value="${y}">${label}</option>`;
        }).join("");
        contribEl.value = cur;
      }

      // expYear — expense year dropdown (same year range, plain labels)
      // FIX: was never populated, leaving the dropdown empty on the Add Expense form
      const expYearEl = document.getElementById("expYear");
      if (expYearEl) {
        expYearEl.innerHTML = sortedYears.map((y) =>
          `<option value="${y}"${y === cur ? " selected" : ""}>${y}</option>`
        ).join("");
      }

      // Initialize receipt year hint display
      const hintEl = document.getElementById("contribYearHint");
      if (hintEl) hintEl.textContent = "Receipt will be: " + (APP.receiptPrefix||"REC") + "-" + cur + "-NNNNN";
    }
    function loadUsers() {
      const _luEl = document.getElementById("user");
      if (_luEl) _luEl.innerHTML = users
        .filter((u) => u.Role !== "Admin" && String(u.Status || "").toLowerCase() === "active")
        .map((u) => `<option value="${u.UserId}">${u.Name}</option>`)
        .join("");
    }
    function loadTypes() {
      const _ltEl = document.getElementById("type");
      if (_ltEl) _ltEl.innerHTML = types
        .map((t) => `<option value="${t.TypeId}">${t.TypeName}</option>`)
        .join("");
    }
    function loadExpenseTypes() {
      const _letEl = document.getElementById("expenseType");
      if (_letEl) _letEl.innerHTML = expenseTypes
        .map((e) => `<option value="${e.ExpenseTypeId}">${e.Name}</option>`)
        .join("");
      if (typeof _exp_populateTypeDropdown === "function") _exp_populateTypeDropdown();
    }
    function loadOccasions() {
      const _loEl = document.getElementById("occasion");
      if (_loEl) _loEl.innerHTML =
        '<option value="">None</option>' +
        occasions
          .map(
            (o) =>
              `<option value="${o.OccasionId}">${o.OccasionName}</option>`
          )
          .join("");
    }

    /* ══ PAGINATION UTILITY ══════════════════════════════════════════
       _renderPagination(containerId, totalPages, currentPage, onPageFn)
       Renders Previous / numbered / Next buttons into the given container.
    ═══════════════════════════════════════════════════════════════════ */
    function _renderPagination(containerId, totalPages, currentPage, onPageFn) {
      var el = document.getElementById(containerId);
      if (!el) return;
      if (totalPages <= 1) { el.innerHTML = ""; return; }
      var html = "";
      html += '<button class="pg-btn" onclick="(' + onPageFn.toString() + ')(' + (currentPage - 1) + ')" ' + (currentPage <= 1 ? "disabled" : "") + '>&#8249; Prev</button>';
      var start = Math.max(1, currentPage - 2);
      var end = Math.min(totalPages, currentPage + 2);
      if (start > 1) { html += '<button class="pg-btn" onclick="(' + onPageFn.toString() + ')(1)">1</button>'; if (start > 2) html += '<span class="pg-info">…</span>'; }
      for (var p = start; p <= end; p++) {
        html += '<button class="pg-btn' + (p === currentPage ? " active" : "") + '" onclick="(' + onPageFn.toString() + ')(' + p + ')">' + p + '</button>';
      }
      if (end < totalPages) { if (end < totalPages - 1) html += '<span class="pg-info">…</span>'; html += '<button class="pg-btn" onclick="(' + onPageFn.toString() + ')(' + totalPages + ')">' + totalPages + '</button>'; }
      html += '<button class="pg-btn" onclick="(' + onPageFn.toString() + ')(' + (currentPage + 1) + ')" ' + (currentPage >= totalPages ? "disabled" : "") + '>Next &#8250;</button>';
      html += '<span class="pg-info">Page ' + currentPage + ' of ' + totalPages + '</span>';
      el.innerHTML = html;
    }

    /* — Pagination state — */
    var _contribPage = 1, _contribList = [];
    var _expensePage = 1, _expenseList = [];
    var _goalsPage = 1, _goalsList = [];
    var _usersPage = 1, _usersList = [];
    var _reqPage = 1, _reqList = [];
    var _feedbackPage = 1, _feedbackList = [];
    var _PG = 10; /* records per page for all sections */

    /* PAGE_SIZE alias used by pre-existing code */
    var PAGE_SIZE = 10;

    /* _buildPagination — wrapper used by pre-existing paged functions.
       fnName is a string (e.g. "_gotoReqPage") callable from inline onclick. */
    function _buildPagination(containerId, currentPage, totalPages, fnName) {
      var el = document.getElementById(containerId);
      if (!el) return;
      if (!totalPages || totalPages <= 1) { el.innerHTML = ""; return; }
      var html = "";
      html += '<button class="pg-btn" onclick="' + fnName + '(' + (currentPage - 1) + ')" ' + (currentPage <= 1 ? "disabled" : "") + '>&#8249; Prev</button>';
      var start = Math.max(1, currentPage - 2);
      var end = Math.min(totalPages, currentPage + 2);
      if (start > 1) { html += '<button class="pg-btn" onclick="' + fnName + '(1)">1</button>'; if (start > 2) html += '<span class="pg-info">…</span>'; }
      for (var p = start; p <= end; p++) {
        html += '<button class="pg-btn' + (p === currentPage ? " active" : "") + '" onclick="' + fnName + '(' + p + ')">' + p + '</button>';
      }
      if (end < totalPages) { if (end < totalPages - 1) html += '<span class="pg-info">…</span>'; html += '<button class="pg-btn" onclick="' + fnName + '(' + totalPages + ')">' + totalPages + '</button>'; }
      html += '<button class="pg-btn" onclick="' + fnName + '(' + (currentPage + 1) + ')" ' + (currentPage >= totalPages ? "disabled" : "") + '>Next &#8250;</button>';
      html += '<span class="pg-info">Page ' + currentPage + ' of ' + totalPages + '</span>';
      el.innerHTML = html;
    }

    /* ── RENDER CONTRIBUTIONS — view-only rows, edit via popup ── */
    function render(list) {
      if (!list) list = data;
      _contribList = list;
      _contribPage = 1;
      _renderContribPage(1);
    }

    function _renderContribPage(page) {
      _contribPage = page;
      var totalPages = Math.ceil(_contribList.length / _PG);
      if (page > totalPages && totalPages > 0) { _contribPage = totalPages; page = totalPages; }
      var start = (page - 1) * _PG;
      var items = _contribList.slice(start, start + _PG);
      var n = start;
      document.getElementById("tb").innerHTML = items.length === 0
        ? `<tr><td colspan="9" style="text-align:center;padding:36px 20px;">
            <div style="font-size:2rem;margin-bottom:8px;">🤲</div>
            <div style="font-weight:600;color:#334155;font-size:14px;margin-bottom:4px;">No contributions yet</div>
            <div style="color:#94a3b8;font-size:12px;margin-bottom:14px;">Add the first contribution using the form above</div>
            <button onclick="document.getElementById('user').focus()" style="background:#f7a01a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;">
              <i class="fa-solid fa-plus"></i> Add First Contribution
            </button>
          </td></tr>`
        : items
        .map((c) => {
          n++;
          let isWalkIn = String(c.UserId).startsWith("WALKIN_");
          let name =
            users.find((u) => String(u.UserId) === String(c.UserId))?.Name ||
            (isWalkIn
              ? String(c.Note || "")
                .match(/Walk-in:\s*([^|]+)/)?.[1]
                ?.trim() || "Walk-in Donor"
              : "Unknown");
          let tName =
            types.find((t) => String(t.TypeId) === String(c.TypeId))
              ?.TypeName || "—";
          let oName =
            occasions.find(
              (o) => String(o.OccasionId) === String(c.OccasionId)
            )?.OccasionName || "";
          const _rid = _storeReceipt(c, name, tName, oName);
          let displayRID = (c.ReceiptID || "").replace(new RegExp("^" + (APP.legacyReceiptPrefix||"TRX") + "-"), (APP.receiptPrefix||"REC") + "-");
          let walkInBadge = String(c.UserId).startsWith("WALKIN_")
            ? `<span style="font-size:9px;background:#946c44;color:#fff;border-radius:4px;padding:1px 5px;margin-left:4px;vertical-align:middle;">WALK-IN</span>`
            : "";
          return `<tr style="cursor:default;">
        <td>${n}</td>
        <td><b>${escapeHtml(name)}</b>${walkInBadge}</td>
        <td class="amt-green">₹ ${fmt(c.Amount)}</td>
        <td>${escapeHtml(c.ForMonth || "—")}</td>
        <td>${escapeHtml(String(c.Year || "—"))}</td>
        <td><span class="badge badge-green">${escapeHtml(tName)}</span></td>
        <td style="font-size:11px;color:#888;font-family:monospace;">${escapeHtml(
            displayRID || "—"
          )}</td>
        <td style="font-size:12px;color:#888;">${formatPaymentDate(c.PaymentDate)}</td>
        <td>
          <div class="action-btns">
            <button class="btn-sm btn-info" onclick="viewContrib_receipt('${_rid}')" title="View Receipt"><i class="fa-solid fa-receipt"></i></button>
            <button class="btn-sm" onclick="openEditContrib('${c.Id
            }')" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-sm btn-danger" onclick="deleteContribution('${c.Id
            }')" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
        })
        .join("");
      _renderPagination("contrib_pagination", totalPages, page, function(p){ _renderContribPage(p); });
    }

    /* VIEW contribution detail popup */
    function viewContribution(id) {
      let c = data.find((x) => String(x.Id) === String(id));
      if (!c) return;
      let isWalkIn = String(c.UserId).startsWith("WALKIN_");
      let name =
        users.find((u) => String(u.UserId) === String(c.UserId))?.Name ||
        (isWalkIn
          ? String(c.Note || "")
            .match(/Walk-in:\s*([^|]+)/)?.[1]
            ?.trim() || "Walk-in Donor"
          : "Unknown");
      let tName =
        types.find((t) => String(t.TypeId) === String(c.TypeId))?.TypeName ||
        "—";
      let oName =
        occasions.find((o) => String(o.OccasionId) === String(c.OccasionId))
          ?.OccasionName || "—";
      showDetailPopup(
        "Contribution Details",
        [
          ["Receipt ID", escapeHtml(c.ReceiptID || "—")],
          ["Donor Name", escapeHtml(name)],
          [
            "Amount",
            "<span style='color:#27ae60;font-size:1.1rem;font-weight:700;'>₹ " +
            fmt(c.Amount) +
            "</span>",
          ],
          ["For Month", escapeHtml(c.ForMonth || "—")],
          ["Year", escapeHtml(String(c.Year || "—"))],
          [
            "Type",
            `<span class="badge badge-green">${escapeHtml(tName)}</span>`,
          ],
          ["Occasion", escapeHtml(oName)],
          ["Note", escapeHtml(c.Note || "—")],
          ["Date Recorded", escapeHtml(formatPaymentDate(c.PaymentDate))],
        ],
        `openEditContrib('${id}')`
      );
    }

    /* EDIT contribution popup */
    function openEditContrib(id) {
      let c = data.find((x) => String(x.Id) === String(id));
      if (!c) return;
      let oOpts = `<option value="">— None —</option>` + occasions
        .map(o => `<option value="${o.OccasionId}" ${String(o.OccasionId) === String(c.OccasionId) ? "selected" : ""}>${escapeHtml(o.OccasionName)}</option>`)
        .join("");
      let mOpts = MONTHS.map(
        (x) => `<option ${x === c.ForMonth ? "selected" : ""}>${x}</option>`
      ).join("");
      let tOpts = types
        .map(
          (t) =>
            `<option value="${t.TypeId}" ${String(t.TypeId) === String(c.TypeId) ? "selected" : ""
            }>${t.TypeName}</option>`
        )
        .join("");
      let yOpts = Array.from(
        new Set([
          ...data.map((d) => Number(d.Year)),
          new Date().getFullYear(),
          new Date().getFullYear() + 1,
        ])
      )
        .filter((y) => y > 2000)
        .sort((a, b) => b - a)
        .map(
          (y) =>
            `<option ${String(c.Year) === String(y) ? "selected" : ""
            }>${y}</option>`
        )
        .join("");
      const modeOpts = ["UPI", "Cash", "Cheque", "Online Transfer"].map(m =>
        `<option ${(c.PaymentMode || "UPI") === m ? "selected" : ""}>${m}</option>`).join("");
      let html = `
      <div class="_mhdr"><h3><i class="fa-solid fa-pen"></i> Edit Contribution</h3><button class="_mcls" onclick="closeModal()">×</button></div>
      <div class="_mbdy">
        <label class="_fl">Amount (₹)</label><input class="_fi" type="number" id="ec_amt" value="${c.Amount}"/>
        <label class="_fl">Month</label><select class="_fi" id="ec_mon">${mOpts}</select>
        <label class="_fl">Year</label><select class="_fi" id="ec_yr">${yOpts}</select>
        <label class="_fl">Type</label><select class="_fi" id="ec_typ">${tOpts}</select>
        <label class="_fl">Occasion</label><select class="_fi" id="ec_occ">${oOpts}</select>
        <label class="_fl">Payment Mode</label><select class="_fi" id="ec_mode">${modeOpts}</select>
        <label class="_fl">Note</label><input class="_fi" id="ec_note" value="${escapeHtml(c.Note || "")}"/>
      </div>
      <div class="_mft">
        <button class="_mbtn" style="background:#999;" onclick="closeModal()">Cancel</button>
        <button class="_mbtn" style="background:#f7a01a;" onclick="saveEditContrib('${id}')"><i class="fa-solid fa-check"></i> Save Changes</button>
      </div>`;
      openModal(html, "460px");
    }
    async function saveEditContrib(id) {
      let amt  = document.getElementById("ec_amt").value;
      let mon  = document.getElementById("ec_mon").value;
      let yr   = document.getElementById("ec_yr").value;
      let typ  = document.getElementById("ec_typ").value;
      let occ  = (document.getElementById("ec_occ")  || {}).value || "";
      let note = (document.getElementById("ec_note") || {}).value || "";
      let mode = (document.getElementById("ec_mode") || {}).value || "UPI";
      if (!amt || amt <= 0) {
        toast("Please enter a valid amount.", "error");
        return;
      }
      let res = await postData({
        action: "updateContribution",
        Id: id,
        Amount: amt,
        ForMonth: mon,
        Year: yr,
        TypeId: typ,
        OccasionId: occ,
        Note: note,
        PaymentMode: mode,
      });
      if (res.status === "updated") {
        toast("✅ Contribution updated.");
        closeModal();
        // smartRefresh fetches authoritative server data and re-renders completely.
        smartRefresh("contributions");
      } else {
        toast("❌ Update failed.", "error");
        throw new Error("Update failed");
      }
    }

    function filterContributions() {
      var yearVal  = (document.getElementById("cr_filterYear")       || {}).value || "";
      var monthVal = (document.getElementById("cr_filterMonth")      || {}).value || "";
      var nameTxt  = ((document.getElementById("cr_filterName")      || {}).value || "").toLowerCase().trim();
      var trackTxt = ((document.getElementById("cr_filterTrackID")   || {}).value || "").toLowerCase().trim();
      var typeVal  = (document.getElementById("filterContribType")   || {}).value || "";
      var occVal   = (document.getElementById("cr_filterOccasion")   || {}).value || "";
      var memType  = (document.getElementById("cr_filterMemberType") || {}).value || "";

      var filtered = data.filter(function(c) {
        var user = users.find(function(u) { return String(u.UserId) === String(c.UserId); });
        var isWalkIn = String(c.UserId).startsWith("WALKIN_");
        var displayRID = (c.ReceiptID || "").replace(new RegExp("^" + (APP.legacyReceiptPrefix||"TRX") + "-"), (APP.receiptPrefix||"REC") + "-");
        var walkInName = isWalkIn
          ? (String(c.Note || "").match(/Walk-in:\s*([^|]+)/)?.[1]?.trim() || "").toLowerCase()
          : "";
        var memberName   = (user ? user.Name || "" : "").toLowerCase();
        var memberMobile = String(user ? user.Mobile || "" : "");

        if (yearVal  && String(c.Year) !== yearVal) return false;
        if (monthVal && (c.ForMonth || "") !== monthVal) return false;
        if (nameTxt  && !memberName.includes(nameTxt) && !walkInName.includes(nameTxt) && !memberMobile.includes(nameTxt)) return false;
        if (trackTxt && !displayRID.toLowerCase().includes(trackTxt) && !(c.ReceiptID || "").toLowerCase().includes(trackTxt)) return false;
        if (typeVal  && String(c.TypeId) !== typeVal) return false;
        if (occVal   && String(c.OccasionId) !== occVal) return false;
        if (memType === "member" && isWalkIn) return false;
        if (memType === "walkin" && !isWalkIn) return false;
        return true;
      });

      var activeCount = [yearVal, monthVal, nameTxt, trackTxt, typeVal, occVal, memType].filter(Boolean).length;
      var countEl = document.getElementById("cr_filterCount");
      if (countEl) countEl.textContent = activeCount ? "(" + activeCount + " active)" : "";

      // Build active filter tags (like dashboard tracker)
      var tagsEl = document.getElementById("cr_activeTags");
      if (tagsEl) {
        var tags = [];
        if (yearVal)  tags.push({ label: "Year: " + yearVal,   clear: function(){ document.getElementById("cr_filterYear").value = ""; filterContributions(); } });
        if (monthVal) tags.push({ label: "Month: " + monthVal, clear: function(){ document.getElementById("cr_filterMonth").value = ""; filterContributions(); } });
        if (nameTxt)  tags.push({ label: "Name: " + nameTxt,   clear: function(){ document.getElementById("cr_filterName").value = ""; filterContributions(); } });
        if (trackTxt) tags.push({ label: "ID: " + trackTxt,    clear: function(){ document.getElementById("cr_filterTrackID").value = ""; filterContributions(); } });
        if (typeVal) {
          var allT = window.dash_types && window.dash_types.length ? window.dash_types : (window.types || []);
          var tn = (allT.find(function(t){ return String(t.TypeId) === typeVal; }) || {}).TypeName || typeVal;
          tags.push({ label: "Type: " + tn, clear: function(){ document.getElementById("filterContribType").value = ""; filterContributions(); } });
        }
        if (occVal) {
          var allO = window.dash_occasions && window.dash_occasions.length ? window.dash_occasions : (window.occasions || []);
          var on = (allO.find(function(o){ return String(o.OccasionId) === occVal; }) || {}).OccasionName || occVal;
          tags.push({ label: "Occasion: " + on, clear: function(){ document.getElementById("cr_filterOccasion").value = ""; filterContributions(); } });
        }
        if (memType) tags.push({ label: "Type: " + (memType === "member" ? "Members Only" : "Walk-in Only"), clear: function(){ document.getElementById("cr_filterMemberType").value = ""; filterContributions(); } });

        if (tags.length === 0) {
          tagsEl.innerHTML = "";
        } else {
          tagsEl.innerHTML = tags.map(function(tag, i) {
            return '<span class="ct-tag" style="display:inline-flex;align-items:center;gap:5px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;color:#334155;margin-right:4px;margin-bottom:4px;">' +
              escapeHtml(tag.label) +
              '<span onclick="window._cr_tags[' + i + ']()" style="cursor:pointer;color:#94a3b8;font-size:13px;line-height:1;font-weight:700;">×</span></span>';
          }).join("");
          window._cr_tags = tags.map(function(t){ return t.clear; });
        }
      }

      window._contribList = filtered;
      window._contribPage = 1;
      render(filtered);
    }
    /* debounce text inputs — select inputs call filterContributions() directly (instant) */
    var _filterContribDebounced = debounce(filterContributions, 280);
    var _debouncedFilterContrib = _filterContribDebounced;
    document.addEventListener("DOMContentLoaded", function () {
      ["cr_filterName", "cr_filterTrackID"].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.removeAttribute("oninput"); el.addEventListener("input", _filterContribDebounced); }
      });
    });

    /* ── RENDER EXPENSES — view-only rows ── */
    function renderExpenses(list) {
      if (!list) list = expenses;
      _expenseList = list;
      _expensePage = 1;
      _renderExpensePage(1);
    }

    function _renderExpensePage(page) {
      _expensePage = page;
      var totalPages = Math.ceil(_expenseList.length / _PG);
      if (page > totalPages && totalPages > 0) { _expensePage = totalPages; page = totalPages; }
      var start = (page - 1) * _PG;
      var items = _expenseList.slice(start, start + _PG);
      var n = start;
      document.getElementById("expenseRecordsBody").innerHTML = items.length === 0
        ? `<tr><td colspan="8" style="text-align:center;padding:36px 20px;">
            <div style="font-size:2rem;margin-bottom:8px;">📋</div>
            <div style="font-weight:600;color:#334155;font-size:14px;margin-bottom:4px;">No expenses yet</div>
            <div style="color:#94a3b8;font-size:12px;margin-bottom:14px;">Add an expense using the form above</div>
            <button onclick="document.getElementById('title').focus()" style="background:#f7a01a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;">
              <i class="fa-solid fa-plus"></i> Add First Expense
            </button>
          </td></tr>`
        : items
        .map((e) => {
          n++;
          let tName =
            expenseTypes.find(
              (t) => String(t.ExpenseTypeId) === String(e.ExpenseTypeId)
            )?.Name || "—";
          let mn = e.ForMonth || e.Note || "—";
          var isCorr = String(e.Id).startsWith("CORR_") || String(e.Title||"").startsWith("↩ VOID:");
          var corrStyle = isCorr ? "background:#f0fdf4;opacity:0.85;" : "";
          var amtStyle  = isCorr ? "color:#16a34a;font-weight:600;" : "";
          return `<tr class="clickable-row" onclick="viewExpense('${e.Id
            }')" title="Click to view details" style="${corrStyle}">
        <td>${n}</td>
        <td><b>${isCorr ? '<i class="fa-solid fa-rotate-left" style="color:#16a34a;margin-right:4px;font-size:10px;"></i>' : ''}${escapeHtml(e.Title || "")}</b></td>
        <td>${escapeHtml(tName)}</td>
        <td>${escapeHtml(mn)}</td>
        <td>${escapeHtml(String(e.Year || "—"))}</td>
        <td class="${isCorr ? '' : 'amt-red'}" style="${amtStyle}">₹ ${fmt(e.Amount)}</td>
        <td style="font-size:12px;color:#888;">${formatPaymentDate(e.PaymentDate)}</td>
            <td onclick="event.stopPropagation()">
      <div class="action-btns">
        <button class="btn-sm ${(_getReceiptUrls(e).length > 0) ? 'btn-green' : ''}"
          onclick="openReceiptAttach('${e.Id}')"
          title="${(_getReceiptUrls(e).length > 0) ? 'Manage Receipts (' + _getReceiptUrls(e).length + ')' : 'Attach Receipt Photo'}"
          style="${(_getReceiptUrls(e).length > 0) ? 'background:#27ae60;' : 'background:#94a3b8;'}">
          <i class="fa-solid fa-paperclip"></i>
          ${_getReceiptUrls(e).length > 1 ? `<span style="font-size:10px;margin-left:2px;">${_getReceiptUrls(e).length}</span>` : ''}
        </button>
        <button class="btn-sm" onclick="openEditExpense('${e.Id}')" title="Edit">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn-sm btn-danger" onclick="deleteExpense('${e.Id}')" title="Delete">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </td>
      </tr>`;
        })
        .join("");
      _renderPagination("expense_pagination", totalPages, page, function(p){ _renderExpensePage(p); });
    }

    function loadExpenseFilters() {
      let years = new Set();
      expenses.forEach((e) => {
        let y = Number(e.Year);
        if (!isNaN(y) && y > 2000) years.add(y);
      });
      let cur = new Date().getFullYear();
      for (let y = 2023; y <= cur + 1; y++) years.add(y);
      let yOpts =
        `<option value="">All Years</option>` +
        Array.from(years)
          .sort((a, b) => b - a)
          .map((y) => `<option value="${y}">${y}</option>`)
          .join("");
      let ey = document.getElementById("expFilterYear");
      if (ey) {
        ey.innerHTML = yOpts;
        ey.value = String(cur);
      }
      // PERF: reuse global MONTHS
      let mOpts =
        `<option value="">All Months</option>` +
        MONTHS.map((m) => `<option value="${m}">${m}</option>`).join("");
      let em = document.getElementById("expFilterMonth");
      if (em) em.innerHTML = mOpts;
    }

    function filterExpenses() {
      const txt = (document.getElementById("searchExpense")?.value || "").toLowerCase();
      const yr  = document.getElementById("expFilterYear")?.value || "";
      const mo  = document.getElementById("expFilterMonth")?.value || "";
      const tp  = document.getElementById("expFilterType")?.value || "";
      const amtMin = parseFloat(document.getElementById("expFilterAmtMin")?.value) || 0;
      const amtMax = parseFloat(document.getElementById("expFilterAmtMax")?.value) || Infinity;

      const filtered = expenses.filter((e) => {
        let tName = expenseTypes.find((t) => String(t.ExpenseTypeId) === String(e.ExpenseTypeId))?.Name || "";
        let mn = e.ForMonth || e.Note || "";
        const amt = Number(e.Amount || 0);
        const textMatch  = !txt || (e.Title||"").toLowerCase().includes(txt) || tName.toLowerCase().includes(txt) || mn.toLowerCase().includes(txt) || String(e.Amount).includes(txt);
        const yearMatch  = !yr || String(e.Year) === yr;
        const monthMatch = !mo || mn.toLowerCase() === mo.toLowerCase();
        const typeMatch  = !tp || String(e.ExpenseTypeId) === tp;
        const amtMatch   = amt >= amtMin && amt <= amtMax;
        return textMatch && yearMatch && monthMatch && typeMatch && amtMatch;
      });

      renderExpenses(filtered);
      _exp_renderActiveTags({ txt, yr, mo, tp, amtMin: document.getElementById("expFilterAmtMin")?.value || "", amtMax: document.getElementById("expFilterAmtMax")?.value || "" });
    }

    function _exp_renderActiveTags(f) {
      var box = document.getElementById("exp_activeTags");
      var cnt = document.getElementById("exp_filterCount");
      if (!box) return;
      var tags = [];
      if (f.txt)    tags.push({ label: "Search: " + f.txt,     clear: function(){ document.getElementById("searchExpense").value=""; filterExpenses(); } });
      if (f.yr)     tags.push({ label: "Year: " + f.yr,         clear: function(){ document.getElementById("expFilterYear").value=""; filterExpenses(); } });
      if (f.mo)     tags.push({ label: "Month: " + f.mo,        clear: function(){ document.getElementById("expFilterMonth").value=""; filterExpenses(); } });
      if (f.tp) {
        var tpName = expenseTypes.find(function(t){ return String(t.ExpenseTypeId)===f.tp; })?.Name || f.tp;
        tags.push({ label: "Type: " + tpName, clear: function(){ document.getElementById("expFilterType").value=""; filterExpenses(); } });
      }
      if (f.amtMin) tags.push({ label: "Min ₹" + f.amtMin,     clear: function(){ document.getElementById("expFilterAmtMin").value=""; filterExpenses(); } });
      if (f.amtMax) tags.push({ label: "Max ₹" + f.amtMax,     clear: function(){ document.getElementById("expFilterAmtMax").value=""; filterExpenses(); } });
      if (cnt) cnt.textContent = tags.length ? "(" + tags.length + " active)" : "";
      box.innerHTML = tags.map(function(t, i){
        return '<span style="display:inline-flex;align-items:center;gap:4px;background:#fef9ec;border:1px solid #fde68a;border-radius:20px;padding:3px 10px;font-size:10px;font-weight:600;color:#92400e;cursor:pointer;" onclick="window._expClearTag(' + i + ')">' +
               escapeHtml(t.label) + ' <i class="fa-solid fa-xmark" style="font-size:9px;"></i></span>';
      }).join("");
      window._expClearTag = function(i){ if(tags[i]) tags[i].clear(); };
    }

    function clearExpenseFilters() {
      ["searchExpense","expFilterYear","expFilterMonth","expFilterType","expFilterAmtMin","expFilterAmtMax"].forEach(function(id){
        var el = document.getElementById(id); if(el) el.value = "";
      });
      filterExpenses();
    }

    function _exp_populateTypeDropdown() {
      var sel = document.getElementById("expFilterType");
      if (!sel) return;
      var cur = sel.value;
      sel.innerHTML = '<option value="">All Types</option>' +
        expenseTypes.map(function(t){ return '<option value="' + escapeHtml(String(t.ExpenseTypeId)) + '">' + escapeHtml(t.Name || "") + '</option>'; }).join("");
      if (cur) sel.value = cur;
    }

    /* debounce for text/amount inputs */
    var _filterExpensesDebounced = debounce(filterExpenses, 280);
    document.addEventListener("DOMContentLoaded", function () {
      var expSrch = document.getElementById("searchExpense");
      if (expSrch) expSrch.removeAttribute("onkeyup");
    });

    function viewExpense(id) {
      let e = expenses.find((x) => String(x.Id) === String(id));
      if (!e) return;
      let tName =
        expenseTypes.find(
          (t) => String(t.ExpenseTypeId) === String(e.ExpenseTypeId)
        )?.Name || "—";
      showDetailPopup(
        "Expense Details",
        [
          ["Title", escapeHtml(e.Title || "—")],
          [
            "Amount",
            "<span style='color:#e74c3c;font-size:1.1rem;font-weight:700;'>₹ " +
            fmt(e.Amount) +
            "</span>",
          ],
          ["Type", escapeHtml(tName)],
          ["Month", escapeHtml(e.ForMonth || e.Note || "—")],
          ["Year", escapeHtml(String(e.Year || "—"))],
          ["Date", escapeHtml(formatPaymentDate(e.PaymentDate))],
          ...(_getReceiptUrls(e).length > 0 ? [["Receipts", _getReceiptUrls(e).map((url, i) => `<a href="${escapeHtml(url)}" target="_blank"
      style="display:inline-flex;align-items:center;gap:6px;color:#27ae60;font-weight:600;font-size:12px;margin-right:8px;">
      <i class="fa-solid fa-image"></i> Photo ${i + 1}</a>`).join("")]] : []),
        ],
        `openEditExpense('${id}')`
      );
    }

    function openEditExpense(id) {
      let e = expenses.find((x) => String(x.Id) === String(id));
      if (!e) return;
      let tOpts = expenseTypes
        .map(
          (t) =>
            `<option value="${t.ExpenseTypeId}" ${String(t.ExpenseTypeId) === String(e.ExpenseTypeId)
              ? "selected"
              : ""
            }>${t.Name}</option>`
        )
        .join("");
      let mn = e.ForMonth || e.Note || "";
      let mOpts = MONTHS.map(
        (x) => `<option ${x === mn ? "selected" : ""}>${x}</option>`
      ).join("");
      let html = `
      <div class="_mhdr"><h3><i class="fa-solid fa-pen"></i> Edit Expense</h3><button class="_mcls" onclick="closeModal()">×</button></div>
      <div class="_mbdy">
        <label class="_fl">Title</label><input class="_fi" id="ee_title" value="${escapeHtml(
        e.Title || ""
      )}"/>
        <label class="_fl">Amount (₹)</label><input class="_fi" type="number" id="ee_amt" value="${e.Amount
        }"/>
        <label class="_fl">Expense Type</label><select class="_fi" id="ee_type">${tOpts}</select>
        <label class="_fl">Month</label><select class="_fi" id="ee_mon"><option value="">None</option>${mOpts}</select>
      </div>
      <div class="_mft">
        <button class="_mbtn" style="background:#999;" onclick="closeModal()">Cancel</button>
        <button class="_mbtn" style="background:#f7a01a;" onclick="saveEditExpense('${id}','${e.Year || new Date().getFullYear()
        }')"><i class="fa-solid fa-check"></i> Save Changes</button>
      </div>`;
      openModal(html, "460px");
    }
    async function saveEditExpense(id, yr) {
      try {
        let res = await postData({
          action: "updateExpense",
          Id: id,
          Title: document.getElementById("ee_title").value,
          Amount: document.getElementById("ee_amt").value,
          ExpenseTypeId: document.getElementById("ee_type").value,
          ForMonth: document.getElementById("ee_mon").value,
          Year: yr,
        });
        toast(
          res.status === "updated"
            ? "✅ Expense updated."
            : "❌ Update failed.",
          res.status === "updated" ? "" : "error"
        );
        if (res.status === "updated") {
          closeModal();
          smartRefresh("expenses");
        }
      } catch (err) {
        toast("❌ " + err.message, "error");
      }
    }

    /* ── RENDER USERS — view-only rows ── */
    function renderUsers() {
      let sv = (document.getElementById("userSearchInput")?.value || "").toLowerCase();
      let filtered = users.filter(u => {
        const matchSearch = (u.Name || "").toLowerCase().includes(sv) || String(u.Mobile || "").includes(sv);
        if (!matchSearch) return false;
        if (!window._userFilterStatus || window._userFilterStatus === "all") return true;
        return String(u.Status || "Active").toLowerCase() === window._userFilterStatus;
      });
      updateUserTabCounts(users);
      window._userList = filtered;
      window._usersPage = 1;
      _renderUsersPaged();
    }
    /* debounce user search — status tab clicks still call renderUsers() directly (instant) */
    var _renderUsersDebounced = debounce(renderUsers, 280);
    document.addEventListener("DOMContentLoaded", function () {
      var usrSrch = document.getElementById("userSearchInput");
      if (usrSrch) {
        usrSrch.removeAttribute("onkeyup");
        usrSrch.addEventListener("input", _renderUsersDebounced);
      }
    });

    function _gotoUsersPage(p) {
      const total = Math.ceil((window._userList || []).length / PAGE_SIZE);
      window._usersPage = Math.max(1, Math.min(p, total));
      _renderUsersPaged();
    }

    function _renderUsersPaged() {
      const filtered = window._userList || [];
      const page = window._usersPage || 1;
      const start = (page - 1) * PAGE_SIZE;
      const items = filtered.slice(start, start + PAGE_SIZE);
      const total = Math.ceil(filtered.length / PAGE_SIZE);
      const statusBadge = (u) => {
        const st = String(u.Status || "Active").toLowerCase();
        if (st === "pending") return `<span class="badge" style="background:#fff3e0;color:#e67e22;border:1px solid #f7a01a;">Pending</span>`;
        if (st === "active") return `<span class="badge badge-green">Active</span>`;
        if (st === "rejected") return `<span class="badge badge-red">Rejected</span>`;
        if (st === "inactive") return `<span class="badge badge-red">Inactive</span>`;
        return `<span class="badge badge-green">${escapeHtml(u.Status || "Active")}</span>`;
      };
      if (items.length === 0) {
        const sv = (document.getElementById("userSearchInput")?.value || "").trim();
        document.getElementById("userTable").innerHTML = sv
          ? `<tr><td colspan="6" style="text-align:center;padding:36px 20px;">
              <div style="font-size:2rem;margin-bottom:8px;">🔍</div>
              <div style="font-weight:600;color:#334155;font-size:14px;margin-bottom:4px;">No members match "${sv}"</div>
              <div style="color:#94a3b8;font-size:12px;">Try a different name or mobile number</div>
            </td></tr>`
          : `<tr><td colspan="6" style="text-align:center;padding:36px 20px;">
              <div style="font-size:2rem;margin-bottom:8px;">👥</div>
              <div style="font-weight:600;color:#334155;font-size:14px;margin-bottom:4px;">No members yet</div>
              <div style="color:#94a3b8;font-size:12px;margin-bottom:14px;">Add a member using the form above</div>
            </td></tr>`;
        _buildPagination("users_pagination", 1, 0, "_gotoUsersPage");
        return;
      }
      document.getElementById("userTable").innerHTML = items.map(u => {
        const st = String(u.Status || "Active").toLowerCase();
        const isPending = st === "pending";
        const rowClass = isPending ? "row-pending" : st === "rejected" ? "row-rejected" : "";
        const approveRejectBtns = isPending ? `
            <button class="btn-sm btn-green" onclick="event.stopPropagation();approveUser('${u.UserId}','${escapeHtml(u.Name || '')}')" title="Approve Registration" style="background:#27ae60;">
              <i class="fa-solid fa-check"></i> Approve
            </button>
            <button class="btn-sm btn-danger" onclick="event.stopPropagation();rejectUser('${u.UserId}','${escapeHtml(u.Name || '')}')" title="Reject Registration">
              <i class="fa-solid fa-xmark"></i> Reject
            </button>` : `
            <button class="btn-sm" onclick="event.stopPropagation();openEditUser('${u.UserId}')"><i class="fa-solid fa-pen"></i></button>
            ` + (function(){
              var ct = (typeof data !== "undefined" ? data : [])
                .filter(function(c){ return String(c.UserId) === String(u.UserId); })
                .reduce(function(s,c){ return s + Number(c.Amount||0); }, 0);
              return ct === 0
                ? '<button class="btn-sm btn-danger" onclick="event.stopPropagation();deleteUser(\'' + u.UserId + '\')" title="Delete User"><i class="fa-solid fa-trash"></i></button>'
                : '<button class="btn-sm btn-danger" style="background:#cbd5e1;cursor:not-allowed;opacity:0.55;" disabled title="Cannot delete: user has \u20b9' + fmt(ct) + ' in contributions. Set status to Inactive instead."><i class="fa-solid fa-trash"></i></button>';
            })() + `
            `;
        const _fbSvg = "Image/logo.PNG";
        const _fbSvgFallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23f7a01a'/%3E%3Ctext x='16' y='21' text-anchor='middle' fill='white' font-size='14' font-family='Arial'%3E%26%23128100%3B%3C/text%3E%3C/svg%3E";
        return `
      <tr class="${rowClass}" onclick="viewUser('${u.UserId}')" title="Click to view details">
        <td onclick="event.stopPropagation();openEditUser('${u.UserId}')" title="Click to edit user" style="cursor:pointer;">
          <img src="${u.PhotoURL ? '' : _fbSvg}"
               data-userid="${escapeHtml(String(u.UserId))}"
               onerror="this.onerror=null;this.src='${_fbSvgFallback}'"
               width="32" height="32" style="border-radius:50%;object-fit:cover;background:#eee;border:2px solid #f7a01a;display:block;"/>
        </td>
        <td><b>${escapeHtml(u.Name || "")}</b></td>
        <td>${escapeHtml(String(u.Mobile || ""))}</td>
        <td><span class="badge ${u.Role === "Admin" ? "badge-red" : "badge-green"}">${u.Role || "User"}</span></td>
        <td>${statusBadge(u)}</td>
        <td onclick="event.stopPropagation()">
          <div class="action-btns">${approveRejectBtns}</div>
        </td>
      </tr>`;
      }).join("");
      _buildPagination("users_pagination", page, total, "_gotoUsersPage");
      // Lazy-load photos via Apps Script proxy to avoid Drive CORS/429 issues
      items.forEach(function(u) {
        if (!u.PhotoURL) return;
        var fileId = _adminExtractDriveFileId(u.PhotoURL);
        if (!fileId) return;
        _fetchAdminPhotoBase64(u.PhotoURL).then(function(b64) {
          if (!b64) return;
          var img = document.querySelector('img[data-userid="' + u.UserId + '"]');
          if (img) img.src = b64;
        }).catch(function(){});
      });
    }

    function viewUser(id) {
      let u = users.find((x) => String(x.UserId) === String(id));
      if (!u) return;
      let contribTotal = data
        .filter((c) => String(c.UserId) === String(id))
        .reduce((s, c) => s + Number(c.Amount || 0), 0);
      // FIX: Use openModal directly instead of showDetailPopup.
      // showDetailPopup (app.js) escapes values as plain text, so HTML strings for
      // Role, Status and Total Contributions were rendered as raw markup in the popup.
      const roleClass  = u.Role === "Admin" ? "badge-red" : "badge-green";
      const statClass  = u.Status === "Active" ? "badge-green" : "badge-red";
      const rows = [
        ["Name",               escapeHtml(u.Name || "—")],
        ["Mobile",             escapeHtml(String(u.Mobile || "—"))],
        ["Email",              escapeHtml(u.Email || "—")],
        ["Role",               '<span class="badge ' + roleClass + '">' + escapeHtml(u.Role || "User") + '</span>'],
        ["Status",             '<span class="badge ' + statClass + '">' + escapeHtml(u.Status || "Active") + '</span>'],
        ["Total Contributions",'<span style="color:#27ae60;font-weight:700;">' + (APP.currency||'₹') + ' ' + fmt(contribTotal) + '</span>'],
      ];
      const tableRows = rows.map(function(r) {
        return '<tr>'
          + '<td style="padding:10px 14px;font-size:13px;color:#64748b;white-space:nowrap;border-bottom:1px solid #f1f5f9;">' + r[0] + '</td>'
          + '<td style="padding:10px 14px;font-size:13px;color:#1e293b;font-weight:600;border-bottom:1px solid #f1f5f9;text-align:right;">' + r[1] + '</td>'
          + '</tr>';
      }).join("");
      const _safeId = String(id).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const _canDelete = contribTotal === 0;
      const _deleteBtnStyle = _canDelete
        ? 'background:#e74c3c;cursor:pointer;'
        : 'background:#cbd5e1;cursor:not-allowed;opacity:0.55;';
      const _deleteBtnTitle = _canDelete
        ? 'Delete User'
        : 'Cannot delete: user has contributions. Set status to Inactive instead.';
      const _deleteBtnOnclick = _canDelete
        ? 'onclick="closeModal();deleteUser(\'' + _safeId + '\')"'
        : '';
      const html = '<div class="_mhdr"><h3><i class="fa-solid fa-eye" style="color:#f7a01a;margin-right:6px;"></i> Member Details</h3><button class="_mcls" onclick="closeModal()">×</button></div>'
        + '<div class="_mbdy" style="padding:10px 16px;">'
        + '<table style="width:100%;border-collapse:collapse;">' + tableRows + '</table>'
        + '</div>'
        + '<div class="_mft">'
        + '<button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Close</button>'
        + '<button class="_mbtn" style="' + _deleteBtnStyle + '" ' + _deleteBtnOnclick + ' title="' + _deleteBtnTitle + '" ' + (_canDelete ? '' : 'disabled') + '><i class="fa-solid fa-trash"></i> Delete</button>'
        + '<button class="_mbtn" style="background:linear-gradient(135deg,#f7a01a,#e8920a);" onclick="closeModal();openEditUser(\'' + _safeId + '\')"><i class="fa-solid fa-pen"></i> Edit</button>'
        + '</div>';
      openModal(html, "460px");
    }

    /* ── DOB format helpers ──────────────────────────────────────────────
       Sheet stores DOB as DD-MM-YYYY.  <input type="date"> needs YYYY-MM-DD.
       These two functions convert between the formats safely.
    ──────────────────────────────────────────────────────────────────── */
    function _dobToInputVal(dob) {
      if (!dob) return "";
      // DD-MM-YYYY → YYYY-MM-DD
      if (/^\d{2}-\d{2}-\d{4}$/.test(dob)) {
        var p = dob.split("-");
        return p[2] + "-" + p[1] + "-" + p[0];
      }
      // Already YYYY-MM-DD — return as-is
      if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) return dob;
      return "";
    }
    function _inputValToDob(val) {
      if (!val) return "";
      // YYYY-MM-DD → DD-MM-YYYY
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        var p = val.split("-");
        return p[2] + "-" + p[1] + "-" + p[0];
      }
      return val;
    }

    function openEditUser(id) {
      _adminPendingCroppedB64 = ""; // clear any pending crop on fresh open
      openEditUserWithPreview(
        id,
        "",
        undefined,
        undefined,
        undefined,
        undefined
      );
    }

    /* Admin: photo crop handler — uses JS variable (not DOM) to survive modal swap */
    let _adminPendingCroppedB64 = "";
    let _adminPendingUserId = "";

    function handleAdminPhotoSelected(input, userId) {
      let file = input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        toast("Photo must be under 5MB.", "error");
        return;
      }
      // Save current form values before crop modal replaces the edit modal
      let savedName = document.getElementById("eu_name")?.value || "";
      let savedEmail = document.getElementById("eu_email")?.value || "";
      let savedRole = document.getElementById("eu_role")?.value || "";
      let savedStatus = document.getElementById("eu_status")?.value || "";
      _adminPendingUserId = userId;
      openCropModal(file, function (base64) {
        _adminPendingCroppedB64 = base64;
        // Re-open edit user modal with cropped preview and preserved values
        let u = users.find((x) => String(x.UserId) === String(userId));
        if (!u) return;
        openEditUserWithPreview(
          userId,
          base64,
          savedName,
          savedEmail,
          savedRole,
          savedStatus
        );
      });
    }

    function openEditUserWithPreview(
      id,
      previewB64,
      prefName,
      prefEmail,
      prefRole,
      prefStatus
    ) {
      let u = users.find((x) => String(x.UserId) === String(id));
      if (!u) return;
      let photoSrc = previewB64 || ""; // Drive URL loaded async to avoid NS_BINDING_ABORTED
      let _euRawPhotoURL = u.PhotoURL || "";
      let html = `
      <div class="_mhdr"><h3><i class="fa-solid fa-user-pen"></i> Edit User</h3><button class="_mcls" onclick="closeModal()">×</button></div>
      <div class="_mbdy">
        <div style="text-align:center;margin-bottom:14px;">
          <div style="position:relative;width:72px;margin:0 auto 8px;">
            <img id="eu_photoPreview" src="${escapeHtml(photoSrc)}"
              onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'72\' height=\\'72\\'><circle cx=\\'36\\' cy=\\'36\\' r=\\'36\\' fill=\\'%23f7a01a\\'/></svg>'"
              style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid #f7a01a;background:#faeeda;display:block;margin-bottom:0;"/>
            <div onclick="document.getElementById('eu_photoFile').click()" style="position:absolute;bottom:1px;right:1px;width:22px;height:22px;background:#f7a01a;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.2);" title="Change Photo">
              <i class="fa-solid fa-camera" style="color:white;font-size:9px;"></i>
            </div>
          </div>
          <input type="file" id="eu_photoFile" accept="image/*" style="display:none;" onchange="handleAdminPhotoSelected(this,'${id}')"/>
        </div>
        <label class="_fl">Full Name</label><input class="_fi" id="eu_name" value="${escapeHtml(
        prefName !== undefined ? prefName : u.Name
      )}"/>
        <label class="_fl">Mobile <span style="color:#999;font-weight:400;">(read-only)</span></label>
        <input class="_fi" value="${escapeHtml(
        String(u.Mobile || "")
      )}" readonly style="background:#f5f5f5;color:#999;cursor:not-allowed;"/>
        <label class="_fl">Email</label><input class="_fi" id="eu_email" value="${escapeHtml(
        prefEmail !== undefined ? prefEmail : u.Email || ""
      )}"/>
        <label class="_fl">Role</label>
        <select class="_fi" id="eu_role">
          <option ${(prefRole || u.Role) === "User" ? "selected" : ""
        }>User</option>
          <option ${(prefRole || u.Role) === "Admin" ? "selected" : ""
        }>Admin</option>
        </select>
        <label class="_fl">Status</label>
        <select class="_fi" id="eu_status">
          <option ${(prefStatus || u.Status) === "Active" ? "selected" : ""
        }>Active</option>
          <option ${(prefStatus || u.Status) === "Inactive" ? "selected" : ""
        }>Inactive</option>
        </select>
            <label class="_fl">Monthly Target (₹)
          <span style="color:#bbb;font-weight:400;font-size:10px;">
            — optional, used in tracker shortfall view
          </span>
        </label>
        <input class="_fi" id="eu_monthly_target" type="number" min="0"
          placeholder="e.g. 500 (leave 0 for no target)"
          value="${Number(u.MonthlyTarget || 0) || 0}"/>
        <label class="_fl">Date of Birth
          <span style="color:#bbb;font-weight:400;font-size:10px;">— for birthday alerts on dashboard</span>
        </label>
        <input class="_fi" type="date" id="eu_dob" value="${escapeHtml(_dobToInputVal(u.DOB || ''))}" style="margin-bottom:0;"/>
      </div>
      <div class="_mft">
        <button class="_mbtn" style="background:#999;" onclick="closeModal();_adminPendingCroppedB64='';">Cancel</button>
        <button class="_mbtn" style="background:#f7a01a;" onclick="saveEditUser('${id}')"><i class="fa-solid fa-check"></i> Save Changes</button>
      </div>`;
      openModal(html, "460px");
      // Async-load user avatar — avoids NS_BINDING_ABORTED on Drive URLs
      if (!previewB64 && _euRawPhotoURL) {
        setTimeout(async function() {
          var imgEl = document.getElementById('eu_photoPreview');
          if (!imgEl || !imgEl.isConnected) return;
          try {
            var b64 = await _fetchAdminPhotoBase64(_euRawPhotoURL);
            if (b64 && imgEl.isConnected) { imgEl.src = b64; return; }
          } catch(e) {}
          var thumb = _driveImgSrc(_euRawPhotoURL);
          if (thumb && imgEl.isConnected) imgEl.src = thumb;
        }, 80);
      }
    }

    async function saveEditUser(id) {
      let s = JSON.parse(localStorage.getItem("session"));
      if (!s) { toast("Session expired. Please log in again.", "error"); return; }
      let u = users.find((x) => String(x.UserId) === String(id));
      let photoURL = u?.PhotoURL || "";

      // Use memory variable (DOM is gone after crop modal swap)
      if (_adminPendingCroppedB64) {
        toast("Uploading photo...", "warn");
        try {
          let response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
              action: "uploadAndSaveProfile",
              UserId: id,
              Name: document.getElementById("eu_name").value,
              Mobile: u?.Mobile || "",
              Role: document.getElementById("eu_role").value,
              Password: "",
              Email: document.getElementById("eu_email").value,
              Status: document.getElementById("eu_status").value,
              MonthlyTarget: Number(document.getElementById("eu_monthly_target")?.value || 0),
              DOB: _inputValToDob(document.getElementById("eu_dob")?.value || ""),
              AdminName: s.name,
              base64: _adminPendingCroppedB64,
              fileName: "User_" + id + "_" + Date.now() + ".jpg",
              oldPhotoURL: u?.PhotoURL || "",
              userId: s.userId || "",
              sessionToken: s.sessionToken || ""
            }),
          });
          if (!response.ok) throw new Error("Server error: " + response.status);
          let res = await response.json();
          if (res.status === "success") {
            photoURL = res.photoUrl;
            toast("✅ Photo uploaded!");
          } else {
            toast("Photo upload failed, profile still updating.", "warn");
          }
        } catch (e) {
          toast("Photo upload error: " + e.message, "warn");
        }
      }

      try {
        let res = await postData({
          action: "updateUser",
          UserId: id,
          Name: document.getElementById("eu_name").value,
          Mobile: u?.Mobile || "",
          Role: document.getElementById("eu_role").value,
          Status: document.getElementById("eu_status").value,
          Email: document.getElementById("eu_email").value,
          Password: "",
          PhotoURL: photoURL,
          MonthlyTarget: Number(document.getElementById("eu_monthly_target")?.value || 0),
          DOB: _inputValToDob(document.getElementById("eu_dob")?.value || ""),
          AdminName: s.name,
        });
        toast(
          res.status === "updated" ? "✅ User updated." : "❌ Update failed.",
          res.status === "updated" ? "" : "error"
        );
        if (res.status === "updated") {
          _adminPendingCroppedB64 = ""; // clear after success
          closeModal();
          smartRefresh("users");
        }
      } catch (err) {
        toast("❌ " + err.message, "error");
      }
    }

    /* ── MASTER DATA TABLES ── */
    /* ── shared inline-edit state ── */
    window._mdEditing = null; // { listName, idx, id }

    function _mdFlashSaved(listName) {
      var spanId = { types:'md_typesSaved', occasions:'md_occasionsSaved', expenseTypes:'md_expSaved' }[listName];
      var el = document.getElementById(spanId);
      if (!el) return;
      el.style.opacity = '1';
      setTimeout(function(){ el.style.opacity = '0'; }, 2200);
    }

    function _mdRenderRow(listName, item, idx, total, isEditing) {
      var id, name;
      if (listName === 'types')        { id = item.TypeId;       name = item.TypeName; }
      else if (listName === 'occasions'){ id = item.OccasionId;   name = item.OccasionName; }
      else                              { id = item.ExpenseTypeId; name = item.Name; }
      var safeId   = escapeHtml(String(id));
      var safeName = escapeHtml(String(name));

      if (isEditing) {
        return '<div class="md-row md-edit-active">'
          + '<div class="md-drag"><span></span><span></span><span></span></div>'
          + '<span class="md-num">' + (idx+1) + '</span>'
          + '<input class="md-edit-input" id="md_editInput" value="' + safeName + '" '
          +   'onkeydown="if(event.key===\'Enter\')_mdSaveEdit(\'' + listName + '\',' + idx + ',\'' + safeId + '\');'
          +             'if(event.key===\'Escape\')_mdCancelEdit(\'' + listName + '\');" />'
          + '<div class="md-actions" style="opacity:1;">'
          +   '<button class="md-ibtn save" title="Save" onclick="_mdSaveEdit(\'' + listName + '\',' + idx + ',\'' + safeId + '\')"><i class="fa-solid fa-check" style="font-size:10px;"></i></button>'
          +   '<button class="md-ibtn cancel" title="Cancel" onclick="_mdCancelEdit(\'' + listName + '\')"><i class="fa-solid fa-xmark" style="font-size:10px;"></i></button>'
          + '</div>'
          + '</div>';
      }

      return '<div class="md-row">'
        + '<div class="md-drag"><span></span><span></span><span></span></div>'
        + '<span class="md-num">' + (idx+1) + '</span>'
        + '<span class="md-name" title="' + safeName + '">' + safeName + '</span>'
        + '<div class="md-actions">'
        +   '<button class="md-ibtn" title="Move up" onclick="_moveItem(\'' + listName + '\',' + idx + ',-1)" ' + (idx===0?'disabled':'') + '><i class="fa-solid fa-chevron-up" style="font-size:9px;"></i></button>'
        +   '<button class="md-ibtn" title="Move down" onclick="_moveItem(\'' + listName + '\',' + idx + ',1)" ' + (idx===total-1?'disabled':'') + '><i class="fa-solid fa-chevron-down" style="font-size:9px;"></i></button>'
        +   '<button class="md-ibtn" title="Edit" onclick="_mdEdit(\'' + listName + '\',' + idx + ',\'' + safeId + '\')"><i class="fa-solid fa-pen" style="font-size:10px;"></i></button>'
        +   '<button class="md-ibtn del" title="Delete" onclick="' + ({types:'deleteType',occasions:'deleteOccasion',expenseTypes:'deleteExpenseType'}[listName]) + '(\'' + safeId + '\')"><i class="fa-solid fa-trash" style="font-size:10px;"></i></button>'
        + '</div>'
        + '</div>';
    }

    function renderTypes() {
      var el = document.getElementById('typeList');
      if (!el) return;
      var countEl = document.getElementById('md_typesCount');
      if (countEl) countEl.textContent = types.length + ' item' + (types.length===1?'':'s');
      if (!types.length) { el.innerHTML = '<div class="md-empty">No types yet. Add one above.</div>'; return; }
      el.innerHTML = types.map(function(t, idx) {
        var isEditing = window._mdEditing && window._mdEditing.listName==='types' && window._mdEditing.idx===idx;
        return _mdRenderRow('types', t, idx, types.length, isEditing);
      }).join('');
      if (window._mdEditing && window._mdEditing.listName==='types') {
        var inp = document.getElementById('md_editInput');
        if (inp) { inp.focus(); inp.select(); }
      }
    }

    function renderOccasions() {
      var el = document.getElementById('occasionList');
      if (!el) return;
      var countEl = document.getElementById('md_occasionsCount');
      if (countEl) countEl.textContent = occasions.length + ' item' + (occasions.length===1?'':'s');
      if (!occasions.length) { el.innerHTML = '<div class="md-empty">No occasions yet. Add one above.</div>'; return; }
      el.innerHTML = occasions.map(function(o, idx) {
        var isEditing = window._mdEditing && window._mdEditing.listName==='occasions' && window._mdEditing.idx===idx;
        return _mdRenderRow('occasions', o, idx, occasions.length, isEditing);
      }).join('');
      if (window._mdEditing && window._mdEditing.listName==='occasions') {
        var inp = document.getElementById('md_editInput');
        if (inp) { inp.focus(); inp.select(); }
      }
    }

    function renderExpenseTypes() {
      var el = document.getElementById('expenseList');
      if (!el) return;
      var countEl = document.getElementById('md_expCount');
      if (countEl) countEl.textContent = expenseTypes.length + ' item' + (expenseTypes.length===1?'':'s');
      if (!expenseTypes.length) { el.innerHTML = '<div class="md-empty">No expense types yet. Add one above.</div>'; return; }
      el.innerHTML = expenseTypes.map(function(e, idx) {
        var isEditing = window._mdEditing && window._mdEditing.listName==='expenseTypes' && window._mdEditing.idx===idx;
        return _mdRenderRow('expenseTypes', e, idx, expenseTypes.length, isEditing);
      }).join('');
      if (window._mdEditing && window._mdEditing.listName==='expenseTypes') {
        var inp = document.getElementById('md_editInput');
        if (inp) { inp.focus(); inp.select(); }
      }
    }

    /* ── inline edit helpers ── */
    function _mdEdit(listName, idx, id) {
      window._mdEditing = { listName: listName, idx: idx, id: id };
      var renderFn = { types: renderTypes, occasions: renderOccasions, expenseTypes: renderExpenseTypes }[listName];
      if (renderFn) renderFn();
    }

    function _mdCancelEdit(listName) {
      window._mdEditing = null;
      var renderFn = { types: renderTypes, occasions: renderOccasions, expenseTypes: renderExpenseTypes }[listName];
      if (renderFn) renderFn();
    }

    async function _mdSaveEdit(listName, idx, id) {
      var inp = document.getElementById('md_editInput');
      var newVal = inp ? inp.value.trim() : '';
      if (!newVal) { toast('Name cannot be empty.', 'warn'); return; }
      var res;
      try {
        if (listName === 'types') {
          res = await postData({ action: 'updateType', TypeId: id, TypeName: newVal });
          if (res && res.status === 'updated') types[idx].TypeName = newVal;
        } else if (listName === 'occasions') {
          res = await postData({ action: 'updateOccasion', OccasionId: id, OccasionName: newVal });
          if (res && res.status === 'updated') occasions[idx].OccasionName = newVal;
        } else {
          res = await postData({ action: 'updateExpenseType', ExpenseTypeId: id, Name: newVal });
          if (res && res.status === 'updated') expenseTypes[idx].Name = newVal;
        }
      } catch(err) { toast('❌ ' + err.message, 'error'); return; }
      window._mdEditing = null;
      if (res && res.status === 'updated') {
        toast('✅ Updated.');
        // Refresh dropdowns that use types/occasions/expenseTypes
        if (listName === 'types') loadTypes();
        if (listName === 'occasions') loadOccasions();
        if (listName === 'expenseTypes') loadExpenseTypes();
      } else {
        toast('❌ Update failed.', 'error');
      }
      var renderFn = { types: renderTypes, occasions: renderOccasions, expenseTypes: renderExpenseTypes }[listName];
      if (renderFn) renderFn();
    }

    function _moveItem(listName, idx, dir) {
      const map = { types: [types, renderTypes], occasions: [occasions, renderOccasions], expenseTypes: [expenseTypes, renderExpenseTypes] };
      const [arr, renderFn] = map[listName] || [];
      if (!arr) return;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return;

      // Cancel any open inline edit before moving
      if (window._mdEditing && window._mdEditing.listName === listName) {
        window._mdEditing = null;
      }

      // Swap in memory instantly
      const tmp = arr[idx]; arr[idx] = arr[newIdx]; arr[newIdx] = tmp;
      renderFn();
      if (listName === 'types') loadTypes();
      if (listName === 'expenseTypes') loadExpenseTypes();

      // Show saving indicator in footer
      const savedSpanMap = { types: 'md_typesSaved', occasions: 'md_occasionsSaved', expenseTypes: 'md_expSaved' };
      const savedEl = document.getElementById(savedSpanMap[listName]);
      if (savedEl) { savedEl.textContent = '⏳ Saving…'; savedEl.style.opacity = '1'; savedEl.style.color = '#f7a01a'; }

      // Build id-keyed sort order and persist to sheet
      const idField = { types: 'TypeId', occasions: 'OccasionId', expenseTypes: 'ExpenseTypeId' }[listName];
      const orderArr = arr.map(function(item, i) { return { id: item[idField], sort: i + 1 }; });

      postData({ action: 'updateSortOrder', sheet: listName, order: JSON.stringify(orderArr) })
        .then(function(res) {
          if (res && res.status === 'success') {
            if (savedEl) { savedEl.textContent = '✓ Saved'; savedEl.style.color = '#27ae60'; setTimeout(function(){ savedEl.style.opacity = '0'; }, 2200); }
            mandirCacheBust('getAllData');
          } else {
            if (savedEl) savedEl.style.opacity = '0';
            toast('⚠️ Order saved locally but failed to persist — try again.', 'warn');
          }
        })
        .catch(function() {
          if (savedEl) savedEl.style.opacity = '0';
          toast('⚠️ Could not save order to server. Check connection.', 'warn');
        });
    }

    /* ── BULK INSERT v2: per-row (month + custom amount) ── */
    const _BK_MONTHS = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    function _bkRenderRows() {
      let rows = document.querySelectorAll(".bk-row");
      let total = 0;
      rows.forEach((r) => {
        let a = parseFloat(r.querySelector(".bk-amt").value) || 0;
        total += a;
      });
      let t = document.getElementById("bk_total");
      if (t) t.textContent = "Total: ₹" + total.toLocaleString(APP.locale||"en-IN");
    }

    function bkAddRow(month, amount) {
      let container = document.getElementById("bk_rows");
      if (!container) return;
      let mOpts = _BK_MONTHS
        .map(
          (m) =>
            `<option value="${m}" ${m === (month || "") ? "selected" : ""
            }>${m}</option>`
        )
        .join("");
      let idx = container.children.length;
      let row = document.createElement("div");
      row.className = "bk-row";
      row.style.cssText =
        "display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;margin-bottom:8px;background:#f8f8f8;border-radius:8px;padding:8px 10px;";
      row.innerHTML = `
          <div><label style="font-size:11px;font-weight:600;color:#666;margin-bottom:3px;display:block;">Month</label>
            <select class="bk-mon _fi" style="margin-bottom:0;">${mOpts}</select></div>
          <div><label style="font-size:11px;font-weight:600;color:#666;margin-bottom:3px;display:block;">Amount (₹)</label>
            <input class="bk-amt _fi" type="number" min="1" placeholder="e.g. 500" value="${amount || ""
        }" oninput="_bkRenderRows()" style="margin-bottom:0;"/></div>
          <div style="padding-top:18px;"><button type="button" onclick="this.closest('.bk-row').remove();_bkRenderRows();" style="background:#e74c3c;box-shadow:none;padding:6px 10px;font-size:13px;" title="Remove"><i class="fa-solid fa-xmark"></i></button></div>`;
      container.appendChild(row);
      _bkRenderRows();
    }

    function bkFillAllMonths() {
      let defAmt =
        parseFloat(document.getElementById("bk_default_amt")?.value) || 0;
      let container = document.getElementById("bk_rows");
      if (!container) return;
      // Clear existing rows
      container.innerHTML = "";
      _BK_MONTHS.forEach((m) => bkAddRow(m, defAmt || ""));
    }

    function openBulkInsert() {
      if (!checkSession()) return;
      let userOpts = users
        .filter((u) => u.Role !== "Admin" && String(u.Status || "").toLowerCase() === "active")
        .map(
          (u) => `<option value="${u.UserId}">${escapeHtml(u.Name)}</option>`
        )
        .join("");
      let typeOpts = types
        .map(
          (t) =>
            `<option value="${t.TypeId}">${escapeHtml(t.TypeName)}</option>`
        )
        .join("");
      // [FIX-3] Show ALL years from 2020 to current+1 regardless of existing data.
      // Previously only years found in contributions data were shown — if no entries
      // existed for a year (e.g. new year or past year), it was missing from the list.
      var _bkCurYear = new Date().getFullYear();
      // Use the earliest year from yearConfig (same as contribution records), fallback to current year
      var _bkStartYear = _bkCurYear;
      if (typeof yearConfig !== "undefined" && yearConfig.length) {
        var _ycYears = yearConfig.map(function(r){ return Number(r.Year); }).filter(function(y){ return y > 2000; });
        if (_ycYears.length) _bkStartYear = Math.min.apply(null, _ycYears);
      }
      var _bkYearPool = new Set([...(data||[]).map(function(d){ return Number(d.Year); })]);
      for (var _y = _bkStartYear; _y <= _bkCurYear + 1; _y++) _bkYearPool.add(_y);
      let yearOpts = Array.from(_bkYearPool)
        .filter(function(y){ return y > 2000; })
        .sort(function(a,b){ return b - a; })
        .map(function(y){
          return '<option value="' + y + '"' + (y === _bkCurYear ? ' selected' : '') + '>' + y + '</option>';
        })
        .join("");

      // Populate the slide panel body
      const panelBody = document.getElementById("sp-bulk-body");
      if (!panelBody) return;
      panelBody.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
          <div><label class="_fl">Member <span style="color:#e74c3c">*</span></label><select class="_fi" id="bk_user">${userOpts}</select></div>
          <div><label class="_fl">Year <span style="color:#e74c3c">*</span></label><select class="_fi" id="bk_year">${yearOpts}</select></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
          <div><label class="_fl">Contribution Type <span style="color:#e74c3c">*</span></label><select class="_fi" id="bk_type">${typeOpts}</select></div>
          <div><label class="_fl">Note <span style="font-size:10px;color:#94a3b8;font-weight:400;">(optional)</span></label><input class="_fi" id="bk_note" placeholder="e.g. Annual"/></div>
        </div>
        <div style="display:flex;align-items:flex-end;gap:10px;margin-bottom:16px;background:#fdf8ee;border-radius:10px;padding:12px 14px;border:1px solid #fde68a;">
          <div style="flex:1;">
            <label class="_fl" style="margin-top:0;">Default Amount (₹) <span style="font-size:10px;color:#94a3b8;font-weight:400;">— fill all 12 months at once</span></label>
            <input class="_fi" id="bk_default_amt" type="number" min="1" placeholder="e.g. 500" oninput="_bkRenderRows()"/>
          </div>
          <button type="button" onclick="bkFillAllMonths()" style="background:#334155;box-shadow:none;padding:10px 14px;white-space:nowrap;flex-shrink:0;border-radius:9px;font-size:12px;color:#fff;border:none;cursor:pointer;font-family:Poppins,sans-serif;font-weight:600;">
            <i class="fa-solid fa-calendar-check"></i> Fill All 12
          </button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:12px;font-weight:700;color:#334155;"><i class="fa-solid fa-list-ul" style="color:#f7a01a;margin-right:5px;"></i> Month Entries</span>
          <div style="display:flex;gap:8px;align-items:center;">
            <span id="bk_total" style="font-size:12px;font-weight:700;color:#27ae60;"></span>
            <button type="button" onclick="bkAddRow('','')" style="background:#f7a01a;box-shadow:none;padding:6px 13px;font-size:12px;border-radius:8px;color:#fff;border:none;cursor:pointer;font-family:Poppins,sans-serif;font-weight:600;">
              <i class="fa-solid fa-plus"></i> Add Row
            </button>
          </div>
        </div>
        <div id="bk_rows" style="flex:1;overflow-y:auto;padding-right:2px;"></div>
        <div id="bk_status" style="font-size:12px;color:#27ae60;font-weight:600;min-height:18px;margin-top:8px;"></div>
        <div class="sp-actions" style="margin-top:16px;">
          <button class="sp-save-btn" style="background:#334155;color:#fff;" onclick="runBulkInsert()">
            <i class="fa-solid fa-check"></i> Insert All
          </button>
          <button class="sp-cancel-btn" onclick="spClose()">Cancel</button>
        </div>`;

      spOpen("bulk");
      // Add one empty row to start
      bkAddRow("", "");
    }

    async function runBulkInsert() {
      if (!checkSession()) return;
      let userId = document.getElementById("bk_user").value;
      let year = document.getElementById("bk_year").value;
      let typeId = document.getElementById("bk_type").value;
      let note = document.getElementById("bk_note").value;
      // Collect all rows
      let rows = [...document.querySelectorAll(".bk-row")]
        .map(r => ({ month: r.querySelector(".bk-mon").value, amount: r.querySelector(".bk-amt").value }))
        .filter(r => r.month && r.amount && Number(r.amount) > 0);
      if (!userId) return toast("Please select a user.", "error");
      if (!typeId) return toast("Please select a contribution type.", "error");
      if (rows.length === 0) return toast("Please add at least one month entry with amount.", "error");

      const usr = users.find(u => String(u.UserId) === userId);
      const memberName = usr ? escapeHtml(usr.Name) : userId;
      const typeObj = types.find(t => String(t.TypeId) === typeId) || {};
      const typeName = escapeHtml(typeObj.TypeName || "—");
      const totalAmt = rows.reduce((s, r) => s + Number(r.amount), 0);

      const previewRows = rows.map((r, i) =>
        `<tr style="border-bottom:1px solid #f0f0f0;" data-bk-idx="${i}">
            <td style="padding:6px 10px;font-size:12px;color:#64748b;">${i + 1}</td>
            <td style="padding:6px 10px;font-size:12px;font-weight:600;">${escapeHtml(r.month)}</td>
            <td style="padding:4px 8px;font-size:12px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="color:#64748b;font-weight:600;">₹</span>
                <input type="number" min="1" class="bkprev-amt" data-idx="${i}" value="${Number(r.amount)}"
                  style="width:90px;border:1.5px solid #e2e8f0;border-radius:6px;padding:4px 7px;font-size:12px;font-weight:700;color:#15803d;font-family:inherit;"
                  oninput="_bkPrevUpdateTotal()" />
                <button onclick="this.closest('tr').remove();_bkPrevUpdateTotal();" style="background:#fef2f2;border:1px solid #fca5a5;color:#e74c3c;padding:3px 8px;font-size:11px;border-radius:5px;box-shadow:none;transform:none;" title="Remove row">✕</button>
              </div>
            </td>
          </tr>`
      ).join("");

      const previewHtml = `
          <div class="_mhdr"><h3><i class="fa-solid fa-eye" style="color:#f7a01a;margin-right:6px;"></i> Preview & Confirm Bulk Insert</h3><button class="_mcls" onclick="closeModal()">&#xd7;</button></div>
          <div class="_mbdy">
            <div style="background:linear-gradient(135deg,#fef9ee,#fff8e1);border:1.5px solid #f7a01a44;border-radius:12px;padding:12px 16px;margin-bottom:14px;font-size:12.5px;color:#946c44;">
              <i class="fa-solid fa-circle-info"></i> Review details below. <b>Edit amounts inline</b> or remove a row before confirming.
            </div>
            <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:12.5px;">
              <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 16px;">
                <span style="color:#64748b;">Member</span><strong style="color:#15803d;">${memberName}</strong>
                <span style="color:#64748b;">Type</span><strong>${typeName}</strong>
                <span style="color:#64748b;">Year</span><strong>${escapeHtml(year)}</strong>
                ${note ? `<span style="color:#64748b;">Note</span><strong>${escapeHtml(note)}</strong>` : ""}
              </div>
            </div>
            <table style="width:100%;border-collapse:collapse;" id="bkprev_table">
              <thead><tr style="background:#f1f5f9;">
                <th style="padding:7px 10px;font-size:11px;text-align:left;color:#64748b;">#</th>
                <th style="padding:7px 10px;font-size:11px;text-align:left;color:#64748b;">Month</th>
                <th style="padding:7px 10px;font-size:11px;text-align:left;color:#64748b;">Amount (editable)</th>
              </tr></thead>
              <tbody>${previewRows}</tbody>
              <tfoot><tr style="background:#fef9ee;">
                <td colspan="2" style="padding:8px 10px;font-size:13px;font-weight:700;color:#78350f;" id="bkprev_countLabel">Total (${rows.length} entr${rows.length === 1 ? "y" : "ies"})</td>
                <td style="padding:8px 10px;font-size:13px;font-weight:700;color:#15803d;" id="bkprev_total">${APP.currency||'₹'}${totalAmt.toLocaleString(APP.locale||"en-IN")}</td>
              </tr></tfoot>
            </table>
            <p style="font-size:11.5px;color:#94a3b8;margin:10px 0 0;">Each entry generates a separate receipt. This cannot be undone.</p>
          </div>
          <div class="_mft">
            <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal();openBulkInsert()"><i class="fa-solid fa-arrow-left"></i> Back &amp; Edit</button>
            <button class="_mbtn" id="bkprev_confirmBtn" style="background:#22c55e;" onclick="_executeBulkInsert()"><i class="fa-solid fa-check"></i> Confirm &amp; Insert All</button>
          </div>`;
      window._pendingBulkRows = { rows, userId, year, typeId, note };

      // Show preview in the same slide panel (replace body content)
      const bkPanelBody = document.getElementById("sp-bulk-body");
      if (!bkPanelBody) { openModal(previewHtml, "520px"); return; }
      bkPanelBody.innerHTML = `
        <div style="background:linear-gradient(135deg,#fef9ee,#fff8e1);border:1.5px solid #f7a01a55;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:12.5px;color:#946c44;">
          <i class="fa-solid fa-circle-info"></i> Review details below. <b>Edit amounts inline</b> or remove a row before confirming.
        </div>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:12.5px;">
          <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 16px;">
            <span style="color:#64748b;font-size:12px;">Member</span><strong style="color:#15803d;">${memberName}</strong>
            <span style="color:#64748b;font-size:12px;">Type</span><strong style="font-size:13px;">${typeName}</strong>
            <span style="color:#64748b;font-size:12px;">Year</span><strong style="font-size:13px;">${escapeHtml(year)}</strong>
            ${note ? `<span style="color:#64748b;font-size:12px;">Note</span><strong style="font-size:13px;">${escapeHtml(note)}</strong>` : ""}
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:12px;font-weight:700;color:#334155;"><i class="fa-solid fa-list-ul" style="color:#f7a01a;margin-right:5px;"></i> Month Entries</span>
          <span id="bkprev_countLabel" style="font-size:12px;color:#78350f;font-weight:600;">Total (${rows.length} entr${rows.length === 1 ? "y" : "ies"})</span>
        </div>
        <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;" id="bkprev_table">
          <thead><tr style="background:#f1f5f9;">
            <th style="padding:8px 10px;font-size:11px;text-align:left;color:#64748b;font-weight:600;">#</th>
            <th style="padding:8px 10px;font-size:11px;text-align:left;color:#64748b;font-weight:600;">Month</th>
            <th style="padding:8px 10px;font-size:11px;text-align:left;color:#64748b;font-weight:600;">Amount (editable)</th>
          </tr></thead>
          <tbody>${previewRows}</tbody>
          <tfoot><tr style="background:#fef9ee;border-top:2px solid #fde68a;">
            <td colspan="2" style="padding:9px 10px;font-size:13px;font-weight:700;color:#78350f;" id="bkprev_countLabel2">Total (${rows.length} entr${rows.length === 1 ? "y" : "ies"})</td>
            <td style="padding:9px 10px;font-size:14px;font-weight:700;color:#15803d;" id="bkprev_total">${APP.currency||'₹'}${totalAmt.toLocaleString(APP.locale||"en-IN")}</td>
          </tr></tfoot>
        </table>
        <p style="font-size:11.5px;color:#94a3b8;margin:10px 0 0;"><i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;margin-right:4px;"></i> Each entry generates a separate receipt. This cannot be undone.</p>
        <div class="sp-actions" style="margin-top:16px;">
          <button class="sp-save-btn" style="background:#22c55e;color:#fff;" id="bkprev_confirmBtn" onclick="_executeBulkInsert()">
            <i class="fa-solid fa-check"></i> Confirm &amp; Insert All
          </button>
          <button class="sp-cancel-btn" onclick="openBulkInsert()">
            <i class="fa-solid fa-arrow-left"></i> Back
          </button>
        </div>`;
      spOpen("bulk");
    }
    function _bkPrevUpdateTotal() {
      const inputs = document.querySelectorAll(".bkprev-amt");
      const rows = document.querySelectorAll("#bkprev_table tbody tr");
      let total = 0, count = 0;
      inputs.forEach(inp => { const v = Number(inp.value); if(v>0){total+=v;count++;} });
      const totEl = document.getElementById("bkprev_total");
      const lblEl = document.getElementById("bkprev_countLabel");
      if (totEl) totEl.innerHTML = `${APP.currency||'₹'}${total.toLocaleString(APP.locale||'en-IN')}`;
      if (lblEl) lblEl.textContent = `Total (${rows.length} entr${rows.length===1?"y":"ies"})`;
    }

    var _bulkInFlight = false; // [DUP-FIX-4] guard: prevents double-submit on bulk insert
    async function _executeBulkInsert() {
      // [DUP-FIX-4] Reject if already in flight — modal close removes the button so
      // btn.disabled alone cannot guard a second click fired before closeModal() runs
      if (_bulkInFlight) return;
      _bulkInFlight = true;
      const btn = document.getElementById("bkprev_confirmBtn");
      if (btn) { btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Inserting...'; }

      // Read from editable preview if open, otherwise fall back to stored data
      const tableRows = document.querySelectorAll("#bkprev_table tbody tr");
      let finalRows, userId, year, typeId, note;
      if (tableRows.length > 0) {
        // Read live data from the preview table
        const monthCells = document.querySelectorAll("#bkprev_table tbody tr td:nth-child(2)");
        const amtInputs  = document.querySelectorAll("#bkprev_table tbody .bkprev-amt");
        finalRows = [];
        monthCells.forEach((cell, i) => {
          const amt = amtInputs[i] ? Number(amtInputs[i].value) : 0;
          if (cell.textContent.trim() && amt > 0) {
            finalRows.push({ month: cell.textContent.trim(), amount: amt });
          }
        });
        const stored = window._pendingBulkRows || {};
        userId = stored.userId; year = stored.year; typeId = stored.typeId; note = stored.note;
      } else {
        const stored = window._pendingBulkRows || {};
        finalRows = stored.rows; userId = stored.userId; year = stored.year; typeId = stored.typeId; note = stored.note;
      }

      if (!finalRows || !userId) {
        _bulkInFlight = false;
        if(btn){btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm &amp; Insert All';}
        return toast("No pending bulk data.", "error");
      }
      if (finalRows.length === 0) {
        _bulkInFlight = false;
        if(btn){btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm &amp; Insert All';}
        return toast("No valid entries to insert.", "error");
      }
      // [DUP-FIX-4b] Deduplicate by month — last-one-wins if month appears twice in table
      finalRows = Array.from(new Map(finalRows.map(function(r) { return [r.month, r]; })).values());
      // Show inserting spinner in panel
      const bkBodySpin = document.getElementById("sp-bulk-body");
      if (bkBodySpin) {
        bkBodySpin.innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
            '<i class="fa-solid fa-spinner fa-spin" style="font-size:2.5rem;color:#334155;margin-bottom:18px;"></i>' +
            '<div style="font-size:16px;font-weight:600;color:#1e293b;">Inserting ' + finalRows.length + ' entries…</div>' +
            '<div style="font-size:12px;color:#64748b;margin-top:6px;">Please wait, do not close.</div>' +
          '</div>';
      }
      const s = JSON.parse(localStorage.getItem("session") || "{}");

      /* ── Helper: check if an entry already exists in the local data cache ──
         Prevents duplicate inserts when a request succeeded on the backend
         but returned an error response (Google Sheets write-race condition).    */
      function _bulkEntryExists(uid, month, yr, tid) {
        if (typeof data === "undefined" || !Array.isArray(data)) return false;
        return data.some(function(c) {
          return String(c.UserId) === String(uid) &&
                 String(c.ForMonth || "").toLowerCase() === String(month).toLowerCase() &&
                 String(c.Year) === String(yr) &&
                 String(c.TypeId) === String(tid);
        });
      }

      /* ── Sequential insert with progress — prevents Google Sheets write-race ──
         Parallel (Promise.all) caused backend to save entries but return errors
         under concurrent load, leading to duplicates on retry.
         Sequential with 250ms gap gives Sheets time to commit each row.          */
      const results = [];
      const bkProgEl = document.getElementById("sp-bulk-body");
      for (var _bi = 0; _bi < finalRows.length; _bi++) {
        var _br = finalRows[_bi];
        // Update progress counter
        if (bkProgEl) {
          var _progPct = Math.round((_bi / finalRows.length) * 100);
          bkProgEl.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<i class="fa-solid fa-spinner fa-spin" style="font-size:2.5rem;color:#334155;margin-bottom:18px;"></i>' +
              '<div style="font-size:16px;font-weight:600;color:#1e293b;">Inserting entry ' + (_bi + 1) + ' of ' + finalRows.length + '…</div>' +
              '<div style="font-size:13px;color:#64748b;margin-top:4px;">' + escapeHtml(_br.month) + ' — Rs.' + Number(_br.amount).toLocaleString(APP.locale||"en-IN") + '</div>' +
              '<div style="width:200px;height:6px;background:#e2e8f0;border-radius:3px;margin-top:14px;overflow:hidden;">' +
                '<div style="height:100%;width:' + _progPct + '%;background:#334155;border-radius:3px;transition:width 0.3s;"></div>' +
              '</div>' +
              '<div style="font-size:12px;color:#94a3b8;margin-top:6px;">Please wait, do not close.</div>' +
            '</div>';
        }
        var _bres = await postData({
          action: "addContribution",
          UserId: userId, Amount: _br.amount, ForMonth: _br.month,
          Year: year, TypeId: typeId, OccasionId: "", Note: note,
          sessionToken: s.sessionToken || "", userId: s.userId || ""
        }).catch(function() { return { status: "error" }; });
        results.push(_bres);
        // 250ms gap between requests — lets Google Sheets commit each row before next write
        if (_bi < finalRows.length - 1) {
          await new Promise(function(res) { setTimeout(res, 250); });
        }
      }

      // After all inserts, do a fresh data fetch so dedup check in retry is accurate
      if (typeof mandirCacheBust === "function") mandirCacheBust("getAllData");

      const done   = results.filter(function(r) { return r && r.status === "success"; }).length;
      const failed = results.length - done;

      // Identify truly-failed rows (exclude any that the dedup check shows already exist)
      // This guards against the race where backend saved but returned error
      var failedRows = finalRows.filter(function(r, i) {
        if (results[i] && results[i].status === "success") return false; // clearly succeeded
        // Check if it actually exists in sheet despite error response
        if (_bulkEntryExists(userId, r.month, year, typeId)) return false; // silently saved
        return true; // genuinely failed
      });

      // Count as "actually saved" = success responses + already-existed-despite-error
      var actuallySaved = finalRows.length - failedRows.length;

      if (failedRows.length > 0) {
        window._bulkFailedRows = { rows: failedRows, userId: userId, year: year, typeId: typeId, note: note };
      } else {
        window._bulkFailedRows = null;
      }

      _bulkInFlight = false;
      smartRefresh("contributions");

      const bkBodyResult = document.getElementById("sp-bulk-body");
      if (actuallySaved > 0 && bkBodyResult) {
        const failedMonthsHtml = failedRows.length > 0
          ? '<div style="margin:8px auto 0;max-width:300px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;">' +
              '<div style="font-size:11px;font-weight:700;color:#dc2626;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Failed Entries</div>' +
              failedRows.map(function(r) {
                return '<div style="font-size:12px;color:#7f1d1d;display:flex;justify-content:space-between;padding:2px 0;">' +
                  '<span>' + escapeHtml(r.month) + '</span><span style="font-weight:600;">Rs.' + Number(r.amount).toLocaleString(APP.locale||"en-IN") + '</span></div>';
              }).join("") +
            '</div>'
          : '';
        bkBodyResult.innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:340px;text-align:center;padding:20px;">' +
            '<div style="width:72px;height:72px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #6ee7b7;animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
              '<i class="fa-solid fa-circle-check" style="color:#16a34a;font-size:2rem;"></i>' +
            '</div>' +
            '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Bulk Insert Complete!</div>' +
            '<div style="font-size:13px;font-weight:600;color:#15803d;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:7px 16px;margin-bottom:6px;">' + actuallySaved + ' of ' + finalRows.length + ' entries added</div>' +
            (failedRows.length > 0 ? '<div style="font-size:12px;color:#dc2626;margin-bottom:4px;">' + failedRows.length + ' entr' + (failedRows.length > 1 ? 'ies' : 'y') + ' failed</div>' + failedMonthsHtml : '') +
          '</div>' +
          '<div class="sp-actions" style="margin-top:auto;">' +
            (failedRows.length > 0
              ? '<button class="sp-save-btn" style="background:#e74c3c;color:#fff;" onclick="_retryBulkFailed()">' +
                  '<i class="fa-solid fa-rotate-right"></i> Retry Failed (' + failedRows.length + ')' +
                '</button>'
              : '<button class="sp-save-btn" style="background:#334155;color:#fff;" onclick="openBulkInsert()">' +
                  '<i class="fa-solid fa-plus"></i> Insert More' +
                '</button>') +
            '<button class="sp-cancel-btn" onclick="spClose()">' +
              '<i class="fa-solid fa-xmark"></i> Close' +
            '</button>' +
          '</div>';
      } else if (bkBodyResult) {
        window._bulkFailedRows = { rows: finalRows, userId: userId, year: year, typeId: typeId, note: note };
        const allFailedHtml =
          '<div style="margin:8px auto 0;max-width:300px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;">' +
            '<div style="font-size:11px;font-weight:700;color:#dc2626;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Failed Entries</div>' +
            finalRows.map(function(r) {
              return '<div style="font-size:12px;color:#7f1d1d;display:flex;justify-content:space-between;padding:2px 0;">' +
                '<span>' + escapeHtml(r.month) + '</span><span style="font-weight:600;">Rs.' + Number(r.amount).toLocaleString(APP.locale||"en-IN") + '</span></div>';
            }).join("") +
          '</div>';
        bkBodyResult.innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
            '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
              '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
            '</div>' +
            '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">All Inserts Failed</div>' +
            '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;margin-bottom:4px;">Check your connection and try again.</div>' +
            allFailedHtml +
          '</div>' +
          '<div class="sp-actions" style="margin-top:auto;">' +
            '<button class="sp-save-btn" style="background:#e74c3c;color:#fff;" onclick="_retryBulkFailed()">' +
              '<i class="fa-solid fa-rotate-right"></i> Retry All (' + finalRows.length + ')' +
            '</button>' +
            '<button class="sp-cancel-btn" onclick="spClose()">' +
              '<i class="fa-solid fa-xmark"></i> Close' +
            '</button>' +
          '</div>';
      }
    }

    /* ════════════════════════════════════════════════════════
       RETRY BULK — re-sends only genuinely-failed rows,
       skips any that already exist (dedup safety net)
    ════════════════════════════════════════════════════════ */
    async function _retryBulkFailed() {
      const stored = window._bulkFailedRows;
      if (!stored || !stored.rows || stored.rows.length === 0) return toast("No failed entries to retry.", "error");
      if (_bulkInFlight) return;
      _bulkInFlight = true;

      // Dedup: filter out any rows that already exist in the sheet
      // (catches the race-condition case where backend saved but returned error)
      var rowsToRetry = stored.rows.filter(function(r) {
        if (typeof data === "undefined" || !Array.isArray(data)) return true;
        var exists = data.some(function(c) {
          return String(c.UserId) === String(stored.userId) &&
                 String(c.ForMonth || "").toLowerCase() === String(r.month).toLowerCase() &&
                 String(c.Year) === String(stored.year) &&
                 String(c.TypeId) === String(stored.typeId);
        });
        return !exists; // only retry rows that genuinely don't exist yet
      });

      const bkBody = document.getElementById("sp-bulk-body");

      // If dedup found all rows already saved — show success, no retry needed
      if (rowsToRetry.length === 0) {
        window._bulkFailedRows = null;
        _bulkInFlight = false;
        smartRefresh("contributions");
        if (bkBody) {
          bkBody.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<div style="width:72px;height:72px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #6ee7b7;animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
                '<i class="fa-solid fa-circle-check" style="color:#16a34a;font-size:2rem;"></i>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">All Entries Already Saved!</div>' +
              '<div style="font-size:12.5px;color:#64748b;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">The previously failed entries were saved successfully. No duplicates inserted.</div>' +
            '</div>' +
            '<div class="sp-actions" style="margin-top:auto;">' +
              '<button class="sp-save-btn" style="background:#334155;color:#fff;" onclick="openBulkInsert()">' +
                '<i class="fa-solid fa-plus"></i> Insert More' +
              '</button>' +
              '<button class="sp-cancel-btn" onclick="spClose()">' +
                '<i class="fa-solid fa-xmark"></i> Close' +
              '</button>' +
            '</div>';
        }
        return;
      }

      // Sequential retry with progress
      const retryResults = [];
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      for (var _ri = 0; _ri < rowsToRetry.length; _ri++) {
        var _rr = rowsToRetry[_ri];
        if (bkBody) {
          bkBody.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<i class="fa-solid fa-spinner fa-spin" style="font-size:2.5rem;color:#334155;margin-bottom:18px;"></i>' +
              '<div style="font-size:16px;font-weight:600;color:#1e293b;">Retrying ' + (_ri + 1) + ' of ' + rowsToRetry.length + '…</div>' +
              '<div style="font-size:13px;color:#64748b;margin-top:4px;">' + escapeHtml(_rr.month) + ' — Rs.' + Number(_rr.amount).toLocaleString(APP.locale||"en-IN") + '</div>' +
              '<div style="width:200px;height:6px;background:#e2e8f0;border-radius:3px;margin-top:14px;overflow:hidden;">' +
                '<div style="height:100%;width:' + Math.round((_ri / rowsToRetry.length) * 100) + '%;background:#e74c3c;border-radius:3px;"></div>' +
              '</div>' +
              '<div style="font-size:12px;color:#94a3b8;margin-top:6px;">Please wait, do not close.</div>' +
            '</div>';
        }
        var _rres = await postData({
          action: "addContribution",
          UserId: stored.userId, Amount: _rr.amount, ForMonth: _rr.month,
          Year: stored.year, TypeId: stored.typeId, OccasionId: "", Note: stored.note,
          sessionToken: s.sessionToken || "", userId: s.userId || ""
        }).catch(function() { return { status: "error" }; });
        retryResults.push(_rres);
        if (_ri < rowsToRetry.length - 1) {
          await new Promise(function(res) { setTimeout(res, 250); });
        }
      }

      // Bust cache and re-check what actually saved
      if (typeof mandirCacheBust === "function") mandirCacheBust("getAllData");

      const retryDone = retryResults.filter(function(r) { return r && r.status === "success"; }).length;
      const stillFailed = rowsToRetry.filter(function(r, i) {
        return !retryResults[i] || retryResults[i].status !== "success";
      });

      window._bulkFailedRows = stillFailed.length > 0
        ? { rows: stillFailed, userId: stored.userId, year: stored.year, typeId: stored.typeId, note: stored.note }
        : null;

      _bulkInFlight = false;
      if (retryDone > 0) smartRefresh("contributions");

      if (!bkBody) return;
      const stillFailedHtml = stillFailed.length > 0
        ? '<div style="margin:8px auto 0;max-width:300px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;">' +
            '<div style="font-size:11px;font-weight:700;color:#dc2626;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Still Failed</div>' +
            stillFailed.map(function(r) {
              return '<div style="font-size:12px;color:#7f1d1d;display:flex;justify-content:space-between;padding:2px 0;">' +
                '<span>' + escapeHtml(r.month) + '</span><span style="font-weight:600;">Rs.' + Number(r.amount).toLocaleString(APP.locale||"en-IN") + '</span></div>';
            }).join("") +
          '</div>'
        : '';

      bkBody.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
          '<div style="width:72px;height:72px;background:linear-gradient(135deg,' + (retryDone > 0 ? '#ecfdf5,#d1fae5' : '#fef2f2,#fecaca') + ');border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid ' + (retryDone > 0 ? '#6ee7b7' : '#fca5a5') + ';animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
            '<i class="fa-solid ' + (retryDone > 0 ? 'fa-circle-check" style="color:#16a34a' : 'fa-circle-xmark" style="color:#dc2626') + ';font-size:2rem;"></i>' +
          '</div>' +
          '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">' + (retryDone > 0 ? 'Retry Complete!' : 'Retry Failed') + '</div>' +
          (retryDone > 0 ? '<div style="font-size:13px;font-weight:600;color:#15803d;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:7px 16px;margin-bottom:6px;">' + retryDone + ' of ' + rowsToRetry.length + ' entries added</div>' : '') +
          (stillFailed.length > 0 ? '<div style="font-size:12px;color:#dc2626;margin-bottom:4px;">' + stillFailed.length + ' still failed</div>' + stillFailedHtml : '') +
        '</div>' +
        '<div class="sp-actions" style="margin-top:auto;">' +
          (stillFailed.length > 0
            ? '<button class="sp-save-btn" style="background:#e74c3c;color:#fff;" onclick="_retryBulkFailed()">' +
                '<i class="fa-solid fa-rotate-right"></i> Retry Again (' + stillFailed.length + ')' +
              '</button>'
            : '<button class="sp-save-btn" style="background:#334155;color:#fff;" onclick="openBulkInsert()">' +
                '<i class="fa-solid fa-plus"></i> Insert More' +
              '</button>') +
          '<button class="sp-cancel-btn" onclick="spClose()">' +
            '<i class="fa-solid fa-xmark"></i> Close' +
          '</button>' +
        '</div>';
    }
    window._retryBulkFailed = _retryBulkFailed;

    // #17 — Auto-suggest last contribution amount when member is selected
    function _suggestLastAmount(userId) {
      if (!userId || !data || data.length === 0) return;
      const amtEl = document.getElementById("amount");
      const typeEl = document.getElementById("type");
      if (!amtEl) return;
      const userContribs = data
        .filter(c => String(c.UserId) === String(userId))
        .sort((a, b) => new Date(b.PaymentDate || 0) - new Date(a.PaymentDate || 0));
      if (userContribs.length === 0) return;
      const last = userContribs[0];
      if (!amtEl.value) {
        amtEl.value = last.Amount || "";
        amtEl.style.borderColor = "#f7a01a";
        amtEl.title = "Auto-filled from last contribution";
        setTimeout(() => { amtEl.style.borderColor = ""; amtEl.title = ""; }, 2000);
      }
      if (typeEl && last.TypeId && !typeEl.value) typeEl.value = String(last.TypeId);
    }

    async function addContribution() {
      if (!checkSession()) return;
      let userId = document.getElementById("user").value;
      let selectedUser = users.find((u) => String(u.UserId) === String(userId));
      if (selectedUser && selectedUser.Role === "Admin") {
        return toast("⚠️ Admin accounts cannot make contributions. Select a member.", "warn");
      }
      let amount = document.getElementById("amount").value;
      let year = document.getElementById("contribYear").value;
      if (!userId || !amount || Number(amount) <= 0)
        return toast("Please select a user and enter a valid amount.", "error");

      // Collect all values for preview
      const forMonth = document.getElementById("month").value;
      const typeId = document.getElementById("type").value;
      const occasionId = document.getElementById("occasion").value;
      const note = document.getElementById("note").value;
      const paymentMode = document.getElementById("paymentMode") ? document.getElementById("paymentMode").value : "UPI";

      const memberName = selectedUser ? escapeHtml(selectedUser.Name) : userId;
      const typeObj = types.find(t => String(t.TypeId) === typeId);
      const typeName = escapeHtml(typeObj?.TypeName || "—");
      const occasionObj = occasions.find(o => String(o.OccasionId) === occasionId);
      const occasionName = escapeHtml(occasionObj?.OccasionName || "— None —");

      // Build month options
      const monthOpts = MONTHS.map(m => `<option value="${m}"${m===forMonth?" selected":""}>${m}</option>`).join("");
      const curY = new Date().getFullYear();
      let yearOptsP = "";
      for (let y = curY+1; y >= 2023; y--) {
        let yLbl = y === curY ? y + " (Current)" : y < curY ? y + " (Old Entry)" : y + " (Advance)";
        yearOptsP += `<option value="${y}"${y===Number(year)?" selected":""}>${yLbl}</option>`;
      }
      const typeOptsP = types.map(t => `<option value="${t.TypeId}"${String(t.TypeId)===typeId?" selected":""}>${escapeHtml(t.TypeName)}</option>`).join("");
      const occasionOptsP = `<option value="">— None —</option>` + occasions.map(o => `<option value="${o.OccasionId}"${String(o.OccasionId)===occasionId?" selected":""}>${escapeHtml(o.OccasionName)}</option>`).join("");
      const modeOpts = ["UPI","Cash","Cheque","Online Transfer"].map(m => `<option value="${m}"${m===paymentMode?" selected":""}>${m}</option>`).join("");
      const userOptsP = users.filter(u=>u.Role!=="Admin").map(u=>`<option value="${u.UserId}"${String(u.UserId)===userId?" selected":""}>${escapeHtml(u.Name)}</option>`).join("");

      const previewHtml = `
        <div class="_mhdr">
          <h3><i class="fa-solid fa-eye" style="color:#f7a01a;margin-right:8px;"></i> Preview & Confirm Contribution</h3>
          <button class="_mcls" onclick="closeModal()">×</button>
        </div>
        <div class="_mbdy">
          <div style="background:linear-gradient(135deg,#fef9ee,#fff8e1);border:1.5px solid #f7a01a44;border-radius:12px;padding:14px 16px;margin-bottom:16px;font-size:12.5px;color:#946c44;">
            <i class="fa-solid fa-circle-info"></i> Review the details below. You can <b>edit any field inline</b> before submitting.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label class="_fl">Member</label>
              <select class="_fi" id="prev_user" style="margin-bottom:0;">${userOptsP}</select>
            </div>
            <div>
              <label class="_fl">Amount (₹)</label>
              <input class="_fi" id="prev_amount" type="number" min="1" value="${escapeHtml(amount)}" style="margin-bottom:0;" />
            </div>
            <div>
              <label class="_fl">Month</label>
              <select class="_fi" id="prev_month" style="margin-bottom:0;"><option value="">— General —</option>${monthOpts}</select>
            </div>
            <div>
              <label class="_fl">Year</label>
              <select class="_fi" id="prev_year" style="margin-bottom:0;">${yearOptsP}</select>
            </div>
            <div>
              <label class="_fl">Contribution Type</label>
              <select class="_fi" id="prev_type" style="margin-bottom:0;">${typeOptsP}</select>
            </div>
            <div>
              <label class="_fl">Payment Mode</label>
              <select class="_fi" id="prev_mode" style="margin-bottom:0;">${modeOpts}</select>
            </div>
          </div>
          <div style="margin-top:12px;">
            <label class="_fl">Occasion</label>
            <select class="_fi" id="prev_occasion" style="margin-bottom:0;">${occasionOptsP}</select>
          </div>
          <div style="margin-top:12px;">
            <label class="_fl">Note</label>
            <input class="_fi" id="prev_note" value="${escapeHtml(note)}" placeholder="Optional note" style="margin-bottom:0;" />
          </div>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 14px;margin-top:14px;font-size:12px;color:#15803d;">
            <i class="fa-solid fa-circle-check"></i> <b>Summary:</b> <span id="prev_summary">${memberName} · ₹${Number(amount).toLocaleString(APP.locale||"en-IN")} · ${forMonth||"General"} ${year}</span>
          </div>
        </div>
        <div class="_mft">
          <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()"><i class="fa-solid fa-arrow-left"></i> Back & Edit</button>
          <button class="_mbtn" id="prev_submitBtn" style="background:#22c55e;" onclick="_submitContributionFromPreview()"><i class="fa-solid fa-check"></i> Confirm & Submit</button>
        </div>`;

      // Show preview in the contrib slide panel (replace body content)
      const contribPanelBody = document.getElementById("sp-contrib-body");
      if (contribPanelBody) {
        contribPanelBody.innerHTML = `
          <div style="background:linear-gradient(135deg,#fef9ee,#fff8e1);border:1.5px solid #f7a01a55;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#946c44;">
            <i class="fa-solid fa-circle-info"></i> Review the details below. <b>Edit any field inline</b> before submitting.
          </div>
          <div class="sp-row2">
            <div class="sp-field-group">
              <label class="sp-label">Member</label>
              <select class="sp-input" id="prev_user">${userOptsP}</select>
            </div>
            <div class="sp-field-group">
              <label class="sp-label">Amount (₹)</label>
              <input class="sp-input" id="prev_amount" type="number" min="1" value="${escapeHtml(amount)}" />
            </div>
            <div class="sp-field-group">
              <label class="sp-label">Month</label>
              <select class="sp-input" id="prev_month"><option value="">— General —</option>${monthOpts}</select>
            </div>
            <div class="sp-field-group">
              <label class="sp-label">Year</label>
              <select class="sp-input" id="prev_year">${yearOptsP}</select>
            </div>
            <div class="sp-field-group">
              <label class="sp-label">Contribution Type</label>
              <select class="sp-input" id="prev_type">${typeOptsP}</select>
            </div>
            <div class="sp-field-group">
              <label class="sp-label">Payment Mode</label>
              <select class="sp-input" id="prev_mode">${modeOpts}</select>
            </div>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Occasion</label>
            <select class="sp-input" id="prev_occasion">${occasionOptsP}</select>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Note</label>
            <input class="sp-input" id="prev_note" value="${escapeHtml(note)}" placeholder="Optional note" />
          </div>
          <div id="_dupWarnBannerSP" style="display:none;background:linear-gradient(90deg,#fff7ed,#ffedd5);border:1.5px solid #fb923c;border-radius:10px;padding:10px 14px;font-size:12px;color:#9a3412;display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;">
            <i class="fa-solid fa-triangle-exclamation" style="margin-top:1px;flex-shrink:0;color:#ea580c;"></i>
            <span id="_dupWarnTextSP"></span>
          </div>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 14px;font-size:12px;color:#15803d;">
            <i class="fa-solid fa-circle-check"></i> <b>Summary:</b>
            <span id="prev_summary">${memberName} · ₹${Number(amount).toLocaleString(APP.locale||"en-IN")} · ${forMonth||"General"} ${year}</span>
          </div>
          <div class="sp-actions" style="margin-top:16px;">
            <button class="sp-save-btn sp-save-green" id="prev_submitBtn" onclick="_submitContributionFromPreview()">
              <i class="fa-solid fa-check"></i> Confirm &amp; Submit
            </button>
            <button class="sp-cancel-btn" onclick="_contribReset()">
              <i class="fa-solid fa-arrow-left"></i> Back
            </button>
          </div>`;
        // Panel is already open — do NOT call spOpen() here, it would trigger _contribReset() and wipe the preview
      } else {
        openModal(previewHtml, "560px");
      }

      // [DUP-FIX-5] Check if a contribution for this user+month+year+type already exists
      // and warn the admin — purely advisory, does not block submission
      (function _checkDuplicateContrib() {
        if (!Array.isArray(data) || !userId || !forMonth || !year) return;
        var existing = data.find(function(c) {
          return String(c.UserId) === String(userId) &&
                 (c.ForMonth || "") === forMonth &&
                 String(c.Year) === String(year) &&
                 String(c.TypeId) === String(typeId);
        });
        if (!existing) return;
        // Show in slide panel banner
        var spWarn = document.getElementById("_dupWarnBannerSP");
        var spWarnTxt = document.getElementById("_dupWarnTextSP");
        if (spWarn && spWarnTxt) {
          spWarnTxt.innerHTML = '<b>Possible duplicate:</b> A contribution for <b>' + forMonth + ' ' + year + '</b> already exists for this member (Receipt: ' + escapeHtml(existing.ReceiptID || "—") + '). Submit only if intentional.';
          spWarn.style.display = 'flex';
          return;
        }
        // Fallback: modal footer (if panel not available)
        var footer = document.querySelector("._mft");
        if (!footer || document.getElementById("_dupWarnBanner")) return;
        var warn = document.createElement("div");
        warn.id = "_dupWarnBanner";
        warn.style.cssText =
          "background:linear-gradient(90deg,#fff7ed,#ffedd5);border:1.5px solid #fb923c;" +
          "border-radius:10px;padding:10px 14px;margin:0 16px 14px;font-size:12px;color:#9a3412;" +
          "display:flex;align-items:flex-start;gap:8px;";
        warn.innerHTML =
          '<i class="fa-solid fa-triangle-exclamation" style="margin-top:1px;flex-shrink:0;color:#ea580c;"></i>' +
          '<span><b>Possible duplicate:</b> A contribution for <b>' + forMonth + ' ' + year + '</b> ' +
          'already exists for this member (Receipt: ' + escapeHtml(existing.ReceiptID || "—") + '). ' +
          'Submit only if this is intentional.</span>';
        footer.parentNode.insertBefore(warn, footer);
      })();


      function _updatePrevSummary() {
        const u = users.find(x=>String(x.UserId)===document.getElementById("prev_user")?.value);
        const nm = u ? u.Name : document.getElementById("prev_user")?.value || "";
        const amt = document.getElementById("prev_amount")?.value || "0";
        const mo = document.getElementById("prev_month")?.value || "General";
        const yr = document.getElementById("prev_year")?.value || "";
        const el = document.getElementById("prev_summary");
        if (el) el.textContent = `${nm} · ₹${Number(amt).toLocaleString(APP.locale||"en-IN")} · ${mo} ${yr}`;
      }
      ["prev_user","prev_amount","prev_month","prev_year","prev_type","prev_mode","prev_occasion"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("change", _updatePrevSummary);
        if (el && el.tagName==="INPUT") el.addEventListener("input", _updatePrevSummary);
      });
    }

    var _contribSubmitInFlight = false; // guard: prevents double-submit
    async function _submitContributionFromPreview() {
      if (_contribSubmitInFlight) return;
      _contribSubmitInFlight = true;

      // CRITICAL: Snapshot all DOM values NOW before any panel/async call.
      // spOpen() re-renders sp-contrib-body, destroying all prev_* elements.
      const _userId     = (document.getElementById("prev_user")     || {}).value || "";
      const _amount     = (document.getElementById("prev_amount")   || {}).value || "";
      const _year       = (document.getElementById("prev_year")     || {}).value || "";
      const _forMonth   = (document.getElementById("prev_month")    || {}).value || "";
      const _typeId     = (document.getElementById("prev_type")     || {}).value || "";
      const _occasionId = (document.getElementById("prev_occasion") || {}).value || "";
      const _note       = (document.getElementById("prev_note")     || {}).value || "";
      const _payMode    = (document.getElementById("prev_mode")     || {}).value || "UPI";

      const btn = document.getElementById("prev_submitBtn");
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }

      if (!_userId || !_amount || Number(_amount) <= 0) {
        _contribSubmitInFlight = false;
        if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm &amp; Submit'; }
        return toast("Please select a user and enter a valid amount.", "error");
      }
      try {
        const _ps = JSON.parse(localStorage.getItem("session") || "{}");
        const payload = {
          action:       "addContribution",
          UserId:       _userId,
          Amount:       _amount,
          ForMonth:     _forMonth,
          Year:         _year,
          TypeId:       _typeId,
          OccasionId:   _occasionId,
          Note:         _note,
          PaymentMode:  _payMode,
          sessionToken: _ps.sessionToken || "",
          userId:       _ps.userId || "",
          AdminName:    _ps.name || "Admin",
        };
        window._contribFailedPayload = payload; // store for retry
        let res = await postData(payload);
        if (res.status === "success") {
          _contribSubmitInFlight = false;
          const rid = res.receiptId || "";
          const emailNote = res.emailSent
            ? "\u{1F4E7} Receipt email sent to member."
            : (res.emailSkipped ? "\u26A0\uFE0F Email quota reached \u2014 email not sent." : "");

          // Reset original form fields before switching state
          try {
            const _now2 = new Date();
            const _g = (id) => document.getElementById(id);
            if (_g("amount"))      _g("amount").value = "";
            if (_g("note"))        _g("note").value = "";
            if (_g("month"))       _g("month").value = MONTHS[_now2.getMonth()];
            if (_g("paymentMode")) _g("paymentMode").value = "UPI";
            if (_g("occasion"))    _g("occasion").selectedIndex = 0;
            if (_g("contribYear")) _g("contribYear").value = String(_now2.getFullYear());
            if (_g("type"))        _g("type").selectedIndex = 0;
            try { localStorage.removeItem("_contrib_draft"); } catch(e) {}
          } catch(e) {}

          // Show success state in panel body (panel stays open)
          const cpBody = document.getElementById("sp-contrib-body");
          if (cpBody) {
            cpBody.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:340px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #6ee7b7;animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
                  '<i class="fa-solid fa-circle-check" style="color:#16a34a;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:6px;">Contribution Saved!</div>' +
                (rid ? '<div style="font-size:13px;font-weight:600;color:#15803d;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:7px 16px;margin-bottom:10px;">Receipt: ' + escapeHtml(rid) + '</div>' : '') +
                (emailNote ? '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">' + emailNote + '</div>' : '<div style="margin-bottom:14px;"></div>') +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;">' +
                '<button class="sp-save-btn sp-save-green" onclick="spOpen(\'contrib\')">' +
                  '<i class="fa-solid fa-plus"></i> Add Another' +
                '</button>' +
                '<button class="sp-cancel-btn" onclick="spClose()">' +
                  '<i class="fa-solid fa-xmark"></i> Close' +
                '</button>' +
              '</div>';
          }
          smartRefresh("contributions");
          if (res.emailSent) setTimeout(_refreshEmailQuotaUI, 800);
        } else {
          _contribSubmitInFlight = false;
          const errMsg = res.message || res.error || "Something went wrong. Please try again.";
          const cpBodyErr = document.getElementById("sp-contrib-body");
          if (cpBodyErr) {
            cpBodyErr.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                  '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
                '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;">' +
                '<button class="sp-save-btn" style="background:#e74c3c;color:#fff;" onclick="_retryContribFailed()">' +
                  '<i class="fa-solid fa-rotate-right"></i> Retry' +
                '</button>' +
                '<button class="sp-cancel-btn" onclick="spClose()">' +
                  '<i class="fa-solid fa-xmark"></i> Close' +
                '</button>' +
              '</div>';
          } else {
            toast("\u274C " + errMsg, "error");
            if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm &amp; Submit'; }
          }
        }
      } catch (err) {
        _contribSubmitInFlight = false;
        const errMsg = err.message || "Network error. Please try again.";
        const cpBodyCatch = document.getElementById("sp-contrib-body");
        if (cpBodyCatch) {
          cpBodyCatch.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
              '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
            '</div>' +
            '<div class="sp-actions" style="margin-top:auto;">' +
              '<button class="sp-save-btn" style="background:#e74c3c;color:#fff;" onclick="_retryContribFailed()">' +
                '<i class="fa-solid fa-rotate-right"></i> Retry' +
              '</button>' +
              '<button class="sp-cancel-btn" onclick="spClose()">' +
                '<i class="fa-solid fa-xmark"></i> Close' +
              '</button>' +
            '</div>';
        } else {
          toast("\u274C " + errMsg, "error");
          if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm &amp; Submit'; }
        }
      }
    }

    /* ── Retry failed contribution with the exact same payload ── */
    async function _retryContribFailed() {
      const payload = window._contribFailedPayload;
      if (!payload) return toast("No failed contribution to retry.", "error");
      if (_contribSubmitInFlight) return;
      _contribSubmitInFlight = true;
      const cpBody = document.getElementById("sp-contrib-body");
      if (cpBody) {
        cpBody.innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
            '<i class="fa-solid fa-spinner fa-spin" style="font-size:2.5rem;color:#334155;margin-bottom:18px;"></i>' +
            '<div style="font-size:16px;font-weight:600;color:#1e293b;">Retrying…</div>' +
            '<div style="font-size:12px;color:#64748b;margin-top:6px;">Please wait, do not close.</div>' +
          '</div>';
      }
      try {
        const res = await postData(payload);
        _contribSubmitInFlight = false;
        if (res.status === "success") {
          window._contribFailedPayload = null;
          const rid = res.receiptId || "";
          const emailNote = res.emailSent ? "\u{1F4E7} Receipt email sent to member."
            : (res.emailSkipped ? "\u26A0\uFE0F Email quota reached \u2014 email not sent." : "");
          try {
            const _now2 = new Date(); const _g = (id) => document.getElementById(id);
            if (_g("amount"))      _g("amount").value = "";
            if (_g("note"))        _g("note").value = "";
            if (_g("month"))       _g("month").value = MONTHS[_now2.getMonth()];
            if (_g("paymentMode")) _g("paymentMode").value = "UPI";
            if (_g("occasion"))    _g("occasion").selectedIndex = 0;
            if (_g("contribYear")) _g("contribYear").value = String(_now2.getFullYear());
            if (_g("type"))        _g("type").selectedIndex = 0;
            try { localStorage.removeItem("_contrib_draft"); } catch(e) {}
          } catch(e) {}
          if (cpBody) {
            cpBody.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:340px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #6ee7b7;animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
                  '<i class="fa-solid fa-circle-check" style="color:#16a34a;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:6px;">Contribution Saved!</div>' +
                (rid ? '<div style="font-size:13px;font-weight:600;color:#15803d;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:7px 16px;margin-bottom:10px;">Receipt: ' + escapeHtml(rid) + '</div>' : '') +
                (emailNote ? '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">' + emailNote + '</div>' : '<div style="margin-bottom:14px;"></div>') +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;">' +
                '<button class="sp-save-btn sp-save-green" onclick="spOpen(\'contrib\')">' +
                  '<i class="fa-solid fa-plus"></i> Add Another' +
                '</button>' +
                '<button class="sp-cancel-btn" onclick="spClose()">' +
                  '<i class="fa-solid fa-xmark"></i> Close' +
                '</button>' +
              '</div>';
          }
          smartRefresh("contributions");
          if (res.emailSent) setTimeout(_refreshEmailQuotaUI, 800);
        } else {
          const errMsg = res.message || res.error || "Something went wrong. Please try again.";
          if (cpBody) {
            cpBody.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                  '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
                '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;">' +
                '<button class="sp-save-btn" style="background:#e74c3c;color:#fff;" onclick="_retryContribFailed()">' +
                  '<i class="fa-solid fa-rotate-right"></i> Retry' +
                '</button>' +
                '<button class="sp-cancel-btn" onclick="spClose()">' +
                  '<i class="fa-solid fa-xmark"></i> Close' +
                '</button>' +
              '</div>';
          }
        }
      } catch(err) {
        _contribSubmitInFlight = false;
        const errMsg = err.message || "Network error.";
        if (cpBody) {
          cpBody.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
              '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
            '</div>' +
            '<div class="sp-actions" style="margin-top:auto;">' +
              '<button class="sp-save-btn" style="background:#e74c3c;color:#fff;" onclick="_retryContribFailed()">' +
                '<i class="fa-solid fa-rotate-right"></i> Retry' +
              '</button>' +
              '<button class="sp-cancel-btn" onclick="spClose()">' +
                '<i class="fa-solid fa-xmark"></i> Close' +
              '</button>' +
            '</div>';
        }
      }
    }
    window._retryContribFailed = _retryContribFailed;
    async function deleteContribution(id) {
      if (!checkSession()) return;
      // UNDO: capture contribution before confirm dialog
      const _undoC = (typeof data !== "undefined") ? data.find(c => String(c.Id) === String(id)) : null;
      const _undoLabel = _undoC ? ("₹" + Number(_undoC.Amount||0).toLocaleString(APP.locale||"en-IN") + " — " + (_undoC.ForMonth||"") + " " + (_undoC.Year||"")) : "Contribution";
      const _undoSaved = _undoC ? JSON.parse(JSON.stringify(_undoC)) : null;
      // Rich confirm: show exactly which contribution is being deleted
      const _cMemberName = _undoC ? (typeof users !== "undefined" ? (users.find(function(u){ return String(u.UserId) === String(_undoC.UserId); }) || {}) : {}) : {};
      const _cName = _cMemberName.Name ? escapeHtml(_cMemberName.Name) : "";
      const _cDetailHtml = _undoC
        ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin:0 0 4px;text-align:left;font-size:12.5px;color:#7f1d1d;">' +
          (_cName ? '<span style="font-weight:700;color:#dc2626;">' + _cName + '</span> &nbsp;·&nbsp; ' : '') +
          '<span style="color:#b91c1c;">₹' + Number(_undoC.Amount||0).toLocaleString(APP.locale||"en-IN") + '</span>' +
          (_undoC.ForMonth ? ' &nbsp;·&nbsp; <span style="color:#9b1b1b;">' + escapeHtml(_undoC.ForMonth) + ' ' + (_undoC.Year||"") + '</span>' : '') +
          '</div>'
        : '';
      confirmModal(
        "Delete this contribution?" + (_cDetailHtml ? '<br><br>' + _cDetailHtml : ''),
        async () => {
        try {
          const _s = JSON.parse(localStorage.getItem("session") || "{}");
          let res = await postData({ action: "deleteContribution", Id: id, AdminName: _s.name || "Admin", sessionToken: _s.sessionToken || "", userId: _s.userId || "" });
          if (res.status === "deleted") {
            smartRefresh("contributions");
            // UNDO: show toast with undo option
            if (typeof _showUndoToast === "function") {
              _showUndoToast(_undoLabel, function() {
                if (_undoSaved) {
                  // FIX: Keep ALL original fields (Id, ReceiptID, PaymentDate) so the
                  // restored record is byte-for-byte identical to what was deleted.
                  // Old code deleted payload.Id causing backend to generate a new Id,
                  // new PaymentDate and new ReceiptID. Record is already gone — no duplicate risk.
                  var payload = Object.assign({ action: "addContribution" }, _undoSaved);
                  payload.Id          = _undoSaved.Id;
                  payload.ReceiptID   = _undoSaved.ReceiptID;
                  payload.PaymentDate = _undoSaved.PaymentDate;
                  postData(payload).then(function() {
                    smartRefresh("contributions");
                    toast("↩ Contribution restored.");
                  });
                }
              });
            }
          } else {
            toast("❌ Delete failed.", "error");
          }
        } catch (err) {
          toast("❌ " + err.message, "error");
        }
      });
    }
    async function addExpense() {
      if (!checkSession()) return;
      // [DUP-FIX-2] Prevent double-submit on expense form
      var _expBtn = document.querySelector("#expensePage button[onclick*='addExpense']");
      if (_expBtn) {
        if (_expBtn._inFlight) return;
        _expBtn._inFlight = true;
        _expBtn.disabled = true;
        _expBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding...';
      }
      let title = document.getElementById("title").value,
        amount = document.getElementById("expAmount").value,
        year = document.getElementById("expYear").value;
      if (!title || !amount || amount <= 0) {
        toast("Please enter a title and amount.", "error");
        if (_expBtn) { _expBtn._inFlight = false; _expBtn.disabled = false; _expBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Expense'; }
        return;
      }
      try {
        let res = await postData({
          action: "addExpense",
          // [ID] FIX: No Id passed — backend generates EXP-YYYY-NNNNN sequentially
          Title: title,
          Amount: amount,
          Year: year,
          ForMonth: document.getElementById("expMonth").value,
          ExpenseTypeId: document.getElementById("expenseType").value,
        });
        toast(
          res.status === "success" ? "✅ Expense added." : "❌ Failed.",
          res.status === "success" ? "" : "error"
        );
        document.getElementById("title").value = "";
        document.getElementById("expAmount").value = "";
        smartRefresh("expenses");
      } catch (err) {
        toast("❌ " + err.message, "error");
      } finally {
        if (_expBtn) { _expBtn._inFlight = false; _expBtn.disabled = false; _expBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Expense'; }
      }
    }

    /* ═══ EXPENSE RECEIPT ATTACHMENT ════════════════════════════════
 Opens a modal to manage multiple receipt photos for an expense.
 Supports upload, view and delete of individual photos.
 ═══════════════════════════════════════════════════════════════ */

    var _rcptB64 = null;  // base64 of selected image
    var _rcptFileName = "";    // filename for upload
    var _rcptExpId = null;  // which expense we are attaching to

    /* ── Convert a Google Drive URL to a reliable thumbnail src for <img> tags ──
       lh3.googleusercontent.com/d/FILE_ID can fail for newly-uploaded files.
       drive.google.com/thumbnail?id=FILE_ID&sz=w400 is always reliable.       ── */
    function _driveImgSrc(url) {
      if (!url) return "";
      // Already a thumbnail URL — return as-is
      if (url.includes("drive.google.com/thumbnail")) return url;
      // Extract file ID from lh3.googleusercontent.com/d/FILE_ID
      if (url.includes("lh3.googleusercontent.com/d/")) {
        const id = url.split("/d/")[1].split("?")[0].split("=")[0].trim();
        if (id) return "https://drive.google.com/thumbnail?id=" + id + "&sz=w400";
      }
      // Extract file ID from drive.google.com/uc?id=FILE_ID
      if (url.includes("drive.google.com/uc")) {
        const m = url.match(/[?&]id=([^&]+)/);
        if (m) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w400";
      }
      return url;
    }

    /* ── Parse ReceiptURLs from expense object (JSON array or legacy single URL) ── */
    function _getReceiptUrls(e) {
      if (!e) return [];
      // New format: ReceiptURLs is a JSON array string e.g. '["url1","url2"]'
      if (e.ReceiptURLs) {
        try {
          const parsed = JSON.parse(e.ReceiptURLs);
          if (Array.isArray(parsed)) return parsed.filter(Boolean);
        } catch (ex) {
          if (String(e.ReceiptURLs).startsWith("http")) return [e.ReceiptURLs];
        }
      }
      // Legacy fallback: single ReceiptURL
      if (e.ReceiptURL && String(e.ReceiptURL).startsWith("http")) return [e.ReceiptURL];
      return [];
    }

    /* ── Open multi-receipt manager modal ── */
    function openReceiptAttach(expId) {
      const e = expenses.find(function (x) { return String(x.Id) === String(expId); });
      if (!e) return;
      _rcptExpId = expId;
      _rcptB64 = null;
      _rcptFileName = "";
      _renderReceiptModal(e);
    }

    function _renderReceiptModal(e) {
      const expId = String(e.Id);
      const urls = _getReceiptUrls(e);

      const photosHTML = urls.length === 0
        ? `<div style="text-align:center;padding:18px 0;color:#94a3b8;font-size:13px;">
        <i class="fa-solid fa-image" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.4;"></i>
        No receipts attached yet.
      </div>`
        : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:16px;">
        ${urls.map((url, i) => `
          <div style="position:relative;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f8fafc;">
            <a href="${escapeHtml(url)}" target="_blank">
              <img src="${_driveImgSrc(url)}"
                style="width:100%;height:90px;object-fit:cover;display:block;"
                onerror="this.src='${_driveImgSrc(url)}&t='+Date.now();this.onerror=function(){this.parentElement.parentElement.style.opacity='0.5';this.style.display='none';};"/>
            </a>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 6px;background:#fff;border-top:1px solid #f1f5f9;">
              <span style="font-size:10px;color:#64748b;">Photo ${i + 1}</span>
              <button onclick="_deleteOneReceipt('${expId}','${escapeHtml(url)}')"
                style="background:#ef4444;border:none;border-radius:4px;color:#fff;
                  cursor:pointer;padding:2px 6px;font-size:11px;line-height:1.6;">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>`).join("")}
      </div>`;

      const html = `
    <div class="_mhdr">
      <h3><i class="fa-solid fa-paperclip" style="color:#27ae60;"></i>
        Receipt Photos ${urls.length > 0 ? '<span style="font-size:13px;font-weight:500;color:#94a3b8;margin-left:6px;">(' + urls.length + ' attached)</span>' : ""}
      </h3>
      <button class="_mcls" onclick="closeModal()">×</button>
    </div>
    <div class="_mbdy">
      <p style="font-size:12px;color:#64748b;margin:0 0 14px;line-height:1.6;">
        <b style="color:#334155;">${escapeHtml(e.Title || "Expense")}</b><br>
        ${APP.currency||"₹"}${fmt(e.Amount)} · ${escapeHtml(e.ForMonth || "")} ${escapeHtml(String(e.Year || ""))}
      </p>
      ${photosHTML}
      <div style="border-top:1px dashed #e2e8f0;padding-top:14px;margin-top:4px;">
        <label class="_fl" style="margin-bottom:6px;">Add another photo</label>
        <input type="file" id="rcpt_file" accept="image/*" multiple
          style="display:block;width:100%;padding:10px;border:1.5px dashed #e2e8f0;
            border-radius:8px;font-size:13px;cursor:pointer;background:#fafafa;margin-bottom:10px;box-sizing:border-box;"
          onchange="rcptPreviewSelected(this)"/>
        <div id="rcpt_preview_wrap" style="display:none;text-align:center;margin-bottom:10px;">
          <img id="rcpt_preview_img"
            style="max-width:100%;max-height:160px;border-radius:8px;
              border:1px solid #e2e8f0;object-fit:contain;"/>
          <p style="font-size:11px;color:#94a3b8;margin:4px 0 0;">Preview — tap Upload to save</p>
        </div>
        <div id="rcpt_msg" style="font-size:12px;min-height:16px;color:#ef4444;margin-bottom:4px;"></div>
      </div>
    </div>
    <div class="_mft">
      <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()">Close</button>
      <button class="_mbtn" id="rcpt_upload_btn" style="background:#27ae60;" disabled
        onclick="uploadExpenseReceipt('${expId}')">
        <i class="fa-solid fa-upload"></i> Upload Photo
      </button>
    </div>`;

      openModal(html, "500px");
    }

    /* Preview selected image before upload */
    function rcptPreviewSelected(input) {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        document.getElementById("rcpt_msg").textContent = "File too large. Please use an image under 8MB.";
        return;
      }
      _rcptFileName = "Receipt_" + _rcptExpId + "_" + Date.now() + "." + (file.name.split(".").pop() || "jpg");
      const reader = new FileReader();
      reader.onload = function (ev) {
        _rcptB64 = ev.target.result;
        const prev = document.getElementById("rcpt_preview_img");
        const wrap = document.getElementById("rcpt_preview_wrap");
        if (prev) prev.src = _rcptB64;
        if (wrap) wrap.style.display = "block";
        const btn = document.getElementById("rcpt_upload_btn");
        if (btn) btn.disabled = false;
        document.getElementById("rcpt_msg").textContent = "";
      };
      reader.readAsDataURL(file);
    }

    /* Upload photo → appends to ReceiptURLs array */
    async function uploadExpenseReceipt(expId) {
      if (!_rcptB64) {
        document.getElementById("rcpt_msg").textContent = "Please select a photo first.";
        return;
      }
      const btn = document.getElementById("rcpt_upload_btn");
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'; }

      try {
        const s = JSON.parse(localStorage.getItem("session") || "{}");
        const e = expenses.find(function (x) { return String(x.Id) === String(expId); });
        const existingUrls = _getReceiptUrls(e);

        const response = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "uploadExpenseReceipt",
            expenseId: expId,
            base64: _rcptB64,
            fileName: _rcptFileName,
            existingURLs: JSON.stringify(existingUrls),
            AdminName: s.name || "Admin",
            userId: s.userId || "",
            sessionToken: s.sessionToken || ""
          })
        });
        if (!response.ok) throw new Error("Server error: " + response.status);
        const res = await response.json();

        if (res.status === "success") {
          const idx = expenses.findIndex(function (x) { return String(x.Id) === String(expId); });
          if (idx !== -1) {
            expenses[idx].ReceiptURLs = res.receiptUrls;
            expenses[idx].ReceiptURL = res.receiptUrl; // keep legacy field too
          }
          toast("✅ Receipt photo uploaded.", "");
          renderExpenses();
          // Re-open modal to show updated photos
          const updatedExp = expenses.find(function (x) { return String(x.Id) === String(expId); });
          _rcptB64 = null; _rcptFileName = "";
          _renderReceiptModal(updatedExp);
        } else {
          document.getElementById("rcpt_msg").textContent = "Upload failed: " + (res.message || "Unknown error");
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload Photo'; }
        }
      } catch (err) {
        document.getElementById("rcpt_msg").textContent = "Error: " + err.message;
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload Photo'; }
      }
    }

    /* Delete one specific photo from the receipt list */
    async function _deleteOneReceipt(expId, urlToDelete) {
      confirmModal("Remove this receipt photo?", async function () {
        try {
          const s = JSON.parse(localStorage.getItem("session") || "{}");
          const res = await postData({
            action: "removeOneExpenseReceipt",
            Id: expId,
            ReceiptURL: urlToDelete,
            AdminName: s.name || "Admin"
          });
          if (res.status === "success") {
            const idx = expenses.findIndex(function (x) { return String(x.Id) === String(expId); });
            if (idx !== -1) {
              expenses[idx].ReceiptURLs = res.receiptUrls;
              expenses[idx].ReceiptURL = res.receiptUrl;
            }
            toast("Receipt photo removed.", "");
            renderExpenses();
            const updatedExp = expenses.find(function (x) { return String(x.Id) === String(expId); });
            _renderReceiptModal(updatedExp);
          } else {
            toast("❌ " + (res.message || "Failed to remove photo."), "error");
          }
        } catch (err) {
          toast("❌ " + err.message, "error");
        }
      });
    }

    /* Legacy: remove ALL receipts (kept for any existing references) */
    async function removeExpenseReceipt(expId) {
      const e = expenses.find(function (x) { return String(x.Id) === String(expId); });
      const urls = _getReceiptUrls(e);
      confirmModal("Remove all receipt photos from this expense?", async function () {
        try {
          const s = JSON.parse(localStorage.getItem("session") || "{}");
          const res = await postData({
            action: "removeAllExpenseReceipts",
            Id: expId,
            AdminName: s.name || "Admin",
            OldReceiptURLs: JSON.stringify(urls)
          });
          if (res.status === "success") {
            const idx = expenses.findIndex(function (x) { return String(x.Id) === String(expId); });
            if (idx !== -1) { expenses[idx].ReceiptURLs = "[]"; expenses[idx].ReceiptURL = ""; }
            closeModal();
            toast("All receipts removed.", "");
            renderExpenses();
          } else {
            toast("❌ " + (res.message || "Failed to remove receipts."), "error");
          }
        } catch (err) {
          toast("❌ " + err.message, "error");
        }
      });
    }

    async function deleteExpense(id) {
      if (!checkSession()) return;
      // Capture expense record before confirm so undo can restore it
      const _undoE = (typeof expenses !== "undefined") ? expenses.find(function(e){ return String(e.Id) === String(id); }) : null;
      const _expTitle  = _undoE ? escapeHtml(_undoE.Title || "Expense") : "Expense";
      const _expAmt    = _undoE ? "₹" + Number(_undoE.Amount||0).toLocaleString(APP.locale||"en-IN") : "";
      const _expMonth  = _undoE ? ((_undoE.ForMonth ? _undoE.ForMonth + " " : "") + (_undoE.Year || "")) : "";
      const _undoLabel = _expAmt ? (_expAmt + " — " + _expTitle) : _expTitle;
      const _undoSaved = _undoE ? JSON.parse(JSON.stringify(_undoE)) : null;

      // Rich confirm: show exactly what is being deleted
      const _detailHtml = _undoE
        ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin:0 0 4px;text-align:left;font-size:12.5px;color:#7f1d1d;">' +
          '<span style="font-weight:700;color:#dc2626;">' + _expTitle + '</span>' +
          (_expAmt    ? ' &nbsp;·&nbsp; <span style="color:#b91c1c;">' + _expAmt + '</span>' : '') +
          (_expMonth  ? ' &nbsp;·&nbsp; <span style="color:#9b1b1b;">' + _expMonth + '</span>' : '') +
          '</div>'
        : '';

      confirmModal(
        "Delete this expense?" + (_detailHtml ? '<br><br>' + _detailHtml : ''),
        async function() {
          try {
            const _s = JSON.parse(localStorage.getItem("session") || "{}");
            const res = await postData({ action: "deleteExpense", Id: id, AdminName: _s.name || "Admin", sessionToken: _s.sessionToken || "", userId: _s.userId || "" });
            if (res.status === "deleted" || res.status === "success") {
              smartRefresh("expenses");
              if (_undoSaved && typeof _showUndoToast === "function") {
                _showUndoToast(_undoLabel, function() {
                  var payload = Object.assign({ action: "addExpense" }, _undoSaved);
                  postData(payload).then(function() {
                    smartRefresh("expenses");
                    toast("↩ Expense restored.");
                  });
                });
              } else {
                toast("✅ Expense deleted.");
              }
            } else {
              toast("❌ Delete failed: " + (res.message || ""), "error");
            }
          } catch (err) {
            toast("❌ " + err.message, "error");
          }
        }
      );
    }

    // _confirmCorrectionEntry kept as no-op stub so _wrapFn spinner list doesn't break
    async function _confirmCorrectionEntry() {}
    async function addUser() {
      if (!checkSession()) return;
      let name   = document.getElementById("u_name").value.trim(),
          mobile = document.getElementById("u_mobile").value.trim(),
          email  = document.getElementById("u_email").value.trim(),
          role   = document.getElementById("u_role").value;
      // [DEFAULT-PWD] Password is no longer entered by admin — it is hardcoded
      // server-side as "JaiShreeRam". User is forced to change on first login.
      if (!name || !mobile || !email)
        return toast("Name, Mobile, and Email are required.", "error");
      if (!/^\d{10}$/.test(mobile))
        return toast("Mobile must be exactly 10 digits.", "error");
      try {
        // [FIX-DOB] <input type="date"> always gives yyyy-MM-dd.
        // Convert to dd-MM-yyyy before sending — same as saveEditUser uses _inputValToDob.
        let dob = _inputValToDob((document.getElementById("u_dob")?.value || "").trim());
        let res = await postData({
          action: "addUser",
          // [ID] UserId is now generated server-side (USER-NNNNN / ADMIN-NNNNN)
          // Do NOT send UserId from frontend — backend ignores it and generates its own
          // [DEFAULT-PWD] Password not sent — backend sets "JaiShreeRam" automatically
          Name:   name,
          Mobile: mobile,
          Email:  email,
          Role:   role,
          DOB:    dob,
        });
        if (res.status === "error") toast("❌ " + res.message, "error");
        else {
          toast("✅ User added. Default password: JaiShreeRam");
          document.getElementById("u_name").value = "";
          document.getElementById("u_mobile").value = "";
          document.getElementById("u_email").value = "";
          const _dobEl = document.getElementById("u_dob");
          if (_dobEl) _dobEl.value = "";
          smartRefresh("users");
        }
      } catch (err) {
        toast("❌ " + err.message, "error");
      }
    }
    async function deleteUser(id) {
      if (!checkSession()) return;
      const _u = users.find(u => String(u.UserId) === String(id));
      const _uName = _u ? `"${_u.Name}"` : "this user";
      const _undoSaved = _u ? JSON.parse(JSON.stringify(_u)) : null;
      confirmModal(`Delete ${_uName}? This cannot be undone.`, async () => {
        try {
          const _s = JSON.parse(localStorage.getItem("session") || "{}");
          let res = await postData({ action: "deleteUser", UserId: id, PhotoURL: _u?.PhotoURL || "", sessionToken: _s.sessionToken || "", userId: _s.userId || "" });
          if (res.status === "deleted") {
            // [UNDO-FIX] deleteUser now returns passwordHash so restoreUser can
            // write the exact original hash back. getAllData strips Password for
            // security so _undoSaved never has it without this step.
            if (res.passwordHash && _undoSaved) {
              _undoSaved.Password = res.passwordHash;
            }
            smartRefresh("users");
            if (_undoSaved && typeof _showUndoToast === "function") {
              _showUndoToast(_uName.replace(/"/g, ""), function() {
                // [UNDO-FIX 1] Use restoreUser — addUser always generates a new
                // UserId server-side and ignores whatever UserId is in the payload.
                // [UNDO-FIX 2] Session creds auto-injected by postData() from
                // localStorage — no need to manually add them here.
                // [UNDO-FIX 3] Password is stripped from getAllData response for
                // security (server deletes it before sending). Pass a sentinel so
                // the backend knows to look up and preserve the existing hash
                // from the backup rather than writing an empty password.
                var payload = Object.assign({}, _undoSaved, { action: "restoreUser" });
                postData(payload).then(function(r) {
                  if (r && r.status === "success") {
                    // [FIX] restoreUser is now in _CACHE_BUST_ON_WRITE so postData()
                    // auto-clears the getAllData cache. Bust manually too as a safety
                    // net, then smartRefresh fetches fresh from server.
                    if (typeof mandirCacheBust === "function") mandirCacheBust("getAllData");
                    smartRefresh("users");
                    setTimeout(function() {
                      if (typeof renderUsers === "function") renderUsers();
                    }, 400);
                    toast("↩ User restored.");
                  } else {
                    toast("❌ Restore failed: " + ((r && r.message) || "unknown error"), "error");
                  }
                }).catch(function(err) {
                  toast("❌ " + err.message, "error");
                });
              });
            } else {
              toast("✅ Deleted.");
            }
          } else {
            toast("❌ Failed.", "error");
          }
        } catch (err) {
          toast("❌ " + err.message, "error");
        }
      });
    }
    async function addType() {
      let v = document.getElementById("t_name").value.trim();
      if (!v) return;
      try {
        let r = await postData({ action: "addType", TypeName: v });
        toast(
          r.status === "success" ? "✅ Added." : "❌ Failed.",
          r.status === "success" ? "" : "error"
        );
        document.getElementById("t_name").value = "";
        smartRefresh("types");
      } catch (e) {
        toast("❌ " + e.message, "error");
      }
    }
    async function deleteType(id) {
      const _t = (types || []).find(t => String(t.TypeId) === String(id));
      const _undoLabel = _t ? (_t.TypeName || "Type") : "Type";
      const _undoSaved = _t ? JSON.parse(JSON.stringify(_t)) : null;
      confirmModal("Delete this contribution type?", async () => {
        try {
          let r = await postData({ action: "deleteType", TypeId: id });
          if (r.status === "deleted") {
            smartRefresh("types");
            if (_undoSaved && typeof _showUndoToast === "function") {
              _showUndoToast(_undoLabel, function() {
                postData({ action: "addType", TypeName: _undoSaved.TypeName }).then(function() {
                  smartRefresh("types");
                  toast("↩ Type restored.");
                });
              });
            } else {
              toast("✅ Deleted.");
            }
          } else {
            toast("❌ Failed.", "error");
          }
        } catch (e) {
          toast("❌ " + e.message, "error");
        }
      });
    }
    async function addOccasion() {
      let v = document.getElementById("o_name").value.trim();
      if (!v) return;
      try {
        let r = await postData({ action: "addOccasion", OccasionName: v });
        toast(
          r.status === "success" ? "✅ Added." : "❌ Failed.",
          r.status === "success" ? "" : "error"
        );
        document.getElementById("o_name").value = "";
        smartRefresh("occasions");
      } catch (e) {
        toast("❌ " + e.message, "error");
      }
    }
    async function deleteOccasion(id) {
      const _o = (occasions || []).find(o => String(o.OccasionId) === String(id));
      const _undoLabel = _o ? (_o.OccasionName || "Occasion") : "Occasion";
      const _undoSaved = _o ? JSON.parse(JSON.stringify(_o)) : null;
      confirmModal("Delete this occasion?", async () => {
        try {
          let r = await postData({ action: "deleteOccasion", OccasionId: id });
          if (r.status === "deleted") {
            smartRefresh("occasions");
            if (_undoSaved && typeof _showUndoToast === "function") {
              _showUndoToast(_undoLabel, function() {
                postData({ action: "addOccasion", OccasionName: _undoSaved.OccasionName }).then(function() {
                  smartRefresh("occasions");
                  toast("↩ Occasion restored.");
                });
              });
            } else {
              toast("✅ Deleted.");
            }
          } else {
            toast("❌ Failed.", "error");
          }
        } catch (e) {
          toast("❌ " + e.message, "error");
        }
      });
    }
    async function addExpenseType() {
      let v = document.getElementById("e_name").value.trim();
      if (!v) return;
      try {
        let r = await postData({ action: "addExpenseType", Name: v });
        toast(
          r.status === "success" ? "✅ Added." : "❌ Failed.",
          r.status === "success" ? "" : "error"
        );
        document.getElementById("e_name").value = "";
        smartRefresh("expenseTypes");
      } catch (e) {
        toast("❌ " + e.message, "error");
      }
    }
    async function deleteExpenseType(id) {
      const _et = (expenseTypes || []).find(e => String(e.ExpenseTypeId) === String(id));
      const _undoLabel = _et ? (_et.Name || "Expense Type") : "Expense Type";
      const _undoSaved = _et ? JSON.parse(JSON.stringify(_et)) : null;
      confirmModal("Delete this expense type?", async () => {
        try {
          let r = await postData({ action: "deleteExpenseType", ExpenseTypeId: id });
          if (r.status === "deleted") {
            smartRefresh("expenseTypes");
            if (_undoSaved && typeof _showUndoToast === "function") {
              _showUndoToast(_undoLabel, function() {
                postData({ action: "addExpenseType", Name: _undoSaved.Name }).then(function() {
                  smartRefresh("expenseTypes");
                  toast("↩ Expense type restored.");
                });
              });
            } else {
              toast("✅ Deleted.");
            }
          } else {
            toast("❌ Failed.", "error");
          }
        } catch (e) {
          toast("❌ " + e.message, "error");
        }
      });
    }

    /* ── GOALS MANAGEMENT ── */
    let goals = [];
    window._goalStore = {};
    let _goalIdx = 0;
    function _storeGoalId(goalId) {
      const k = "g" + ++_goalIdx;
      window._goalStore[k] = String(goalId);
      return k;
    }

    function renderGoals() {
      window._goalList = goals;
      window._goalsPage = 1;
      _renderGoalsPaged();
    }

    function _gotoGoalsPage(p) {
      const total = Math.ceil((window._goalList || []).length / PAGE_SIZE);
      window._goalsPage = Math.max(1, Math.min(p, total));
      _renderGoalsPaged();
    }

    function _renderGoalsPaged() {
      const list = window._goalList || [];
      const page = window._goalsPage || 1;
      const start = (page - 1) * PAGE_SIZE;
      const items = list.slice(start, start + PAGE_SIZE);
      const total = Math.ceil(list.length / PAGE_SIZE);
      document.getElementById("goalTableBody").innerHTML =
        list.length === 0
          ? `<tr><td colspan="7" style="text-align:center;padding:36px 20px;">
              <div style="font-size:2rem;margin-bottom:8px;">🎯</div>
              <div style="font-weight:600;color:#334155;font-size:14px;margin-bottom:4px;">No goals yet</div>
              <div style="color:#94a3b8;font-size:12px;margin-bottom:14px;">Set a fundraising target to track progress</div>
              <button onclick="document.getElementById('g_name').focus()" style="background:#f7a01a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;">
                <i class="fa-solid fa-plus"></i> Add First Goal
              </button>
            </td></tr>`
          : items
            .map((g, idx) => {
              const i = start + idx;
              let collected = Number(g.CurrentAmount || 0);
              let autoCalc = data.reduce((sum, c) => {
                let tName = (
                  types.find((x) => String(x.TypeId) === String(c.TypeId))
                    ?.TypeName || ""
                ).toLowerCase();
                let gName = (g.GoalName || "").toLowerCase();
                return (
                  sum +
                  (tName === gName ||
                    (c.Note || "").toLowerCase().includes(gName)
                    ? Number(c.Amount || 0)
                    : 0)
                );
              }, 0);
              let syncWarning =
                autoCalc > 0 && Math.abs(autoCalc - collected) > 1
                  ? `<span title="Auto-calculated from contributions: ${APP.currency||"₹"}${fmt(
                    autoCalc
                  )}" style="cursor:help;font-size:10px;color:#e67e22;margin-left:4px;">⚠️ Auto: ${APP.currency||"₹"}${fmt(
                    autoCalc
                  )}</span>`
                  : "";
              let pct =
                g.TargetAmount > 0
                  ? Math.min(
                    100,
                    Math.round((collected / Number(g.TargetAmount)) * 100)
                  )
                  : 0;
              let barColor =
                pct >= 100 ? "#27ae60" : pct >= 60 ? "#f7a01a" : "#e74c3c";
              let _gk = _storeGoalId(g.GoalId);
              return `<tr>
                <td>${i + 1}</td>
                <td><b>${escapeHtml(g.GoalName || "—")}</b></td>
                <td>₹ ${fmt(g.TargetAmount)}</td>
                <td class="amt-green">₹ ${fmt(collected)}${syncWarning}</td>
                <td style="min-width:120px;">
                  <div style="background:#eee;border-radius:10px;height:14px;overflow:hidden;">
                    <div class="goal-bar-fill" style="background:${barColor};width:${pct}%;height:100%;border-radius:10px;"></div>
                  </div>
                  <span style="font-size:10px;color:#888;">${pct}%</span>
                </td>
                <td><span class="badge ${g.Status === "Enabled" ? "badge-green" : "badge-red"
                }">${g.Status || "Disabled"}</span></td>
                <td onclick="event.stopPropagation()">
                  <div class="action-btns">
                    <button class="btn-sm" onclick="openEditGoal(_goalStore['${_gk}'])"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-sm btn-danger" onclick="deleteGoal(_goalStore['${_gk}'])"><i class="fa-solid fa-trash"></i></button>
                  </div>
                </td>
              </tr>`;
            })
            .join("");
      _buildPagination("goals_pagination", page, total, "_gotoGoalsPage");
    }

    /* ═══════════════════════════════════════════════════════════════
 EVENT MANAGEMENT — all functions self-contained
 Uses global: data, expenses, expenseTypes, MONTHS
 New globals: _events (array), _eventExpenses (array)
 ═══════════════════════════════════════════════════════════════ */

    var _events = [];
    var _eventExpenses = [];
    var _evLoaded = false;

    /* ── Load events + event expenses from API ── */
    async function loadEvents() {
      if (_evLoaded) return;
      try {
        const res = await getCached("getEventData");
        _events = (res && res.events) || [];
        _eventExpenses = (res && res.eventExpenses) || [];
        _evLoaded = true;
        renderEvents();
      } catch (err) {
        document.getElementById("ev_list").innerHTML =
          `<div style="text-align:center;padding:32px;color:#ef4444;font-size:13px;">
        Error loading events: ${escapeHtml(err.message)}
      </div>`;
      }
    }

    /* ── Bust event cache after any write ── */
    function _evBust() {
      _evLoaded = false;
      mandirCacheBust("getEventData");
    }

    /* ── Render event cards ── */
    function renderEvents() {
      const filterStatus = document.getElementById("ev_filter_status")?.value || "";
      const filterCat = document.getElementById("ev_filter_cat")?.value || "";

      const list = _events.filter(function (e) {
        const matchStatus = !filterStatus || e.Status === filterStatus;
        const matchCat = !filterCat || e.Category === filterCat;
        return matchStatus && matchCat;
      });

      const container = document.getElementById("ev_list");
      if (!container) return;

      if (list.length === 0) {
        container.innerHTML =
          `<div style="text-align:center;padding:40px;color:#94a3b8;">
        <i class="fa-solid fa-calendar-xmark" style="font-size:2rem;display:block;margin-bottom:10px;"></i>
        No events found. Create one above.
      </div>`;
        return;
      }

      // Sort: Active first, then Upcoming, then Completed
      const order = { Active: 0, Upcoming: 1, Completed: 2 };
      list.sort(function (a, b) { return (order[a.Status] || 3) - (order[b.Status] || 3); });

      container.innerHTML = list.map(function (ev) {
        // Sum expenses for this event
        const evExps = _eventExpenses.filter(function (x) { return String(x.EventId) === String(ev.EventId); });
        const spent = evExps.reduce(function (s, x) { return s + Number(x.Amount || 0); }, 0);
        const budget = Number(ev.Budget || 0);
        const remaining = budget > 0 ? budget - spent : 0;
        const pct = budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0;
        const barColor = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#27ae60";

        const statusClass = {
          Upcoming: "ev-status-upcoming",
          Active: "ev-status-active",
          Completed: "ev-status-completed"
        }[ev.Status] || "ev-status-upcoming";

        const budgetSection = budget > 0 ? `
      <div style="margin-top:14px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px;">
          <span>Budget used: ${pct}%</span>
          <span>${APP.currency||"₹"}${fmt(spent)} / ${APP.currency||"₹"}${fmt(budget)}</span>
        </div>
        <div class="ev-budget-bar-bg">
          <div class="ev-budget-bar-fill" style="width:${pct}%;background:${barColor};"></div>
        </div>
      </div>` : "";

        const dateStr = [ev.StartDate, ev.EndDate].filter(Boolean).join(" → ") || "—";

        return `<div class="ev-card">
      <div class="ev-card-header">
        <div>
          <div class="ev-card-title">${escapeHtml(ev.EventName || "Untitled")}</div>
          <div class="ev-card-cat">
            <i class="fa-solid fa-tag" style="font-size:10px;"></i>
            ${escapeHtml(ev.Category || "—")} &nbsp;·&nbsp;
            <i class="fa-regular fa-calendar" style="font-size:10px;"></i>
            ${escapeHtml(dateStr)}
          </div>
        </div>
        <span class="badge ${statusClass}" style="border-radius:20px;padding:4px 14px;font-size:11px;font-weight:700;">
          ${escapeHtml(ev.Status || "—")}
        </span>
      </div>
 
      ${ev.Description ? `<p style="font-size:12.5px;color:#64748b;margin:0 0 12px;line-height:1.6;">${escapeHtml(ev.Description)}</p>` : ""}
 
      <div class="ev-card-body">
        <div class="ev-stat">
          <div class="ev-stat-val" style="color:#f59e0b;">${APP.currency||"₹"}${fmt(budget || 0)}</div>
          <div class="ev-stat-lbl">Budget</div>
        </div>
        <div class="ev-stat">
          <div class="ev-stat-val" style="color:#e74c3c;">${APP.currency||"₹"}${fmt(spent)}</div>
          <div class="ev-stat-lbl">Spent (${evExps.length} items)</div>
        </div>
        <div class="ev-stat">
          <div class="ev-stat-val" style="color:${remaining >= 0 ? '#27ae60' : '#ef4444'};">
            ${remaining < 0 ? "−" : ""}${APP.currency||"₹"}${fmt(Math.abs(remaining))}
          </div>
          <div class="ev-stat-lbl">${remaining < 0 ? "Over Budget" : "Remaining"}</div>
        </div>
      </div>
 
      ${budgetSection}
 
      <div class="ev-card-footer">
        <button onclick="openAddEventExpense('${ev.EventId}','${escapeHtml(ev.EventName || '')}')"
          style="padding:7px 14px;font-size:12px;background:#fb923c;box-shadow:none;">
          <i class="fa-solid fa-plus"></i> Add Expense
        </button>
        <button onclick="viewEventExpenses('${ev.EventId}','${escapeHtml(ev.EventName || '')}')"
          style="padding:7px 14px;font-size:12px;background:#334155;box-shadow:none;">
          <i class="fa-solid fa-list"></i> View Expenses (${evExps.length})
        </button>
        <button onclick="shareEventWhatsApp('${ev.EventId}')"
          style="padding:7px 14px;font-size:12px;background:#25d366;box-shadow:none;">
          <i class="fa-brands fa-whatsapp"></i> Share
        </button>
        <button onclick="openEditEvent('${ev.EventId}')"
          style="padding:7px 14px;font-size:12px;background:#64748b;box-shadow:none;">
          <i class="fa-solid fa-pen"></i> Edit
        </button>
        <button onclick="deleteEvent('${ev.EventId}')"
          style="padding:7px 14px;font-size:12px;background:#ef4444;box-shadow:none;">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>`;
      }).join("");
    }

    /* ── Add new event ── */
    async function addEvent() {
      const name = document.getElementById("ev_name")?.value.trim();
      const cat = document.getElementById("ev_cat")?.value;
      const status = document.getElementById("ev_status")?.value;
      const start = document.getElementById("ev_start")?.value;
      const end = document.getElementById("ev_end")?.value;
      const budget = document.getElementById("ev_budget")?.value || "0";
      const desc = document.getElementById("ev_desc")?.value.trim() || "";
      const s = JSON.parse(localStorage.getItem("session") || "{}");

      if (!name) { toast("Event name is required.", "warn"); return; }

      try {
        const res = await postData({
          action: "addEvent",
          // [ID] FIX: No EventId passed — backend generates EVT-NNNNN sequentially
          EventName: name,
          Category: cat,
          Status: status,
          StartDate: start,
          EndDate: end,
          Budget: Number(budget),
          Description: desc,
          AdminName: s.name || "Admin"
        });
        if (res.status === "success") {
          toast("✅ Event created.", "");
          document.getElementById("ev_name").value = "";
          document.getElementById("ev_budget").value = "";
          document.getElementById("ev_desc").value = "";
          // FIX-3: Use smartRefresh so sidebar + expense tracker also update
          smartRefresh("events");
        } else {
          toast("❌ " + (res.message || "Failed to create event."), "error");
        }
      } catch (err) {
        toast("❌ " + err.message, "error");
      }
    }

    /* ── Edit event modal ── */
    function openEditEvent(eventId) {
      const ev = _events.find(function (x) { return String(x.EventId) === String(eventId); });
      if (!ev) return;

      const catOpts = ["Festival", "Pooja", "Maintenance", "Community", "Other"]
        .map(function (c) { return `<option ${c === ev.Category ? "selected" : ""}>${c}</option>`; }).join("");
      const stOpts = ["Upcoming", "Active", "Completed"]
        .map(function (s) { return `<option ${s === ev.Status ? "selected" : ""}>${s}</option>`; }).join("");

      const html = `
    <div class="_mhdr">
      <h3><i class="fa-solid fa-calendar-pen"></i> Edit Event</h3>
      <button class="_mcls" onclick="closeModal()">×</button>
    </div>
    <div class="_mbdy">
      <label class="_fl">Event Name</label>
      <input class="_fi" id="ee_name" value="${escapeHtml(ev.EventName || '')}"/>
      <label class="_fl">Category</label>
      <select class="_fi" id="ee_cat">${catOpts}</select>
      <label class="_fl">Status</label>
      <select class="_fi" id="ee_status">${stOpts}</select>
      <label class="_fl">Start Date</label>
      <input class="_fi" type="date" id="ee_start" value="${escapeHtml((ev.StartDate || '').slice(0, 10))}"/>
      <label class="_fl">End Date</label>
      <input class="_fi" type="date" id="ee_end" value="${escapeHtml((ev.EndDate || '').slice(0, 10))}"/>
      <label class="_fl">Budget (₹)</label>
      <input class="_fi" type="number" id="ee_budget" value="${Number(ev.Budget || 0)}" min="0"/>
      <label class="_fl">Description</label>
      <input class="_fi" id="ee_desc" value="${escapeHtml(ev.Description || '')}"/>
    </div>
    <div class="_mft">
      <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()">Cancel</button>
      <button class="_mbtn" style="background:#fb923c;" onclick="saveEditEvent('${eventId}')">
        <i class="fa-solid fa-check"></i> Save
      </button>
    </div>`;
      openModal(html, "480px");
    }

    async function saveEditEvent(eventId) {
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      try {
        const res = await postData({
          action: "updateEvent",
          EventId: eventId,
          EventName: document.getElementById("ee_name").value.trim(),
          Category: document.getElementById("ee_cat").value,
          Status: document.getElementById("ee_status").value,
          StartDate: document.getElementById("ee_start").value,
          EndDate: document.getElementById("ee_end").value,
          Budget: Number(document.getElementById("ee_budget").value || 0),
          Description: document.getElementById("ee_desc").value.trim(),
          AdminName: s.name || "Admin"
        });
        toast(res.status === "updated" ? "✅ Event updated." : "❌ Update failed.",
          res.status === "updated" ? "" : "error");
        if (res.status === "updated") {
          closeModal();
          // FIX-3: Use smartRefresh so sidebar + expense tracker also update
          smartRefresh("events");
        }
      } catch (err) { toast("❌ " + err.message, "error"); }
    }

    /* ── Delete event ── */
    function deleteEvent(eventId) {
      const ev = _events.find(function (x) { return String(x.EventId) === String(eventId); });
      const evExps = _eventExpenses.filter(function (x) { return String(x.EventId) === String(eventId); });
      const warn = evExps.length > 0
        ? ` This will also delete ${evExps.length} expense record(s) linked to this event.`
        : "";
      confirmModal("Delete this event?" + warn, async function () {
        try {
          const s = JSON.parse(localStorage.getItem("session") || "{}");
          const res = await postData({ action: "deleteEvent", EventId: eventId, AdminName: s.name || "Admin" });
          toast(res.status === "deleted" ? "✅ Event deleted." : "❌ " + (res.message || "Failed."),
            res.status === "deleted" ? "" : "error");
          // FIX-3: Use smartRefresh so sidebar + expense tracker also update
          if (res.status === "deleted") { smartRefresh("events"); }
        } catch (err) { toast("❌ " + err.message, "error"); }
      });
    }

    /* ── Add expense to event ── */
    function openAddEventExpense(eventId, eventName) {
      const typeOpts = (typeof expenseTypes !== "undefined" ? expenseTypes : [])
        .map(function (t) { return `<option value="${t.ExpenseTypeId}">${escapeHtml(t.Name)}</option>`; }).join("");
      const monOpts = [""].concat(MONTHS)
        .map(function (m) { return `<option value="${m}">${m || "None"}</option>`; }).join("");

      const html = `
    <div class="_mhdr">
      <h3><i class="fa-solid fa-receipt" style="color:#fb923c;"></i> Add Event Expense</h3>
      <button class="_mcls" onclick="closeModal()">×</button>
    </div>
    <div class="_mbdy">
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 14px;
        font-size:12px;color:#92400e;margin-bottom:14px;">
        <i class="fa-solid fa-calendar-star"></i> ${escapeHtml(eventName)}
      </div>
      <label class="_fl">Title</label>
      <input class="_fi" id="eev_title" placeholder="e.g. Decorations, Prasad, Sound System"/>
      <label class="_fl">Amount (₹)</label>
      <input class="_fi" type="number" id="eev_amt" min="1" placeholder="Amount"/>
      <label class="_fl">Expense Type</label>
      <select class="_fi" id="eev_type">${typeOpts}</select>
      <label class="_fl">Month</label>
      <select class="_fi" id="eev_month">${monOpts}</select>
      <label class="_fl">Note <span style="color:#bbb;font-weight:400;font-size:10px;">(optional)</span></label>
      <input class="_fi" id="eev_note" placeholder="Vendor name or details"/>
    </div>
    <div class="_mft">
      <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()">Cancel</button>
      <button class="_mbtn" style="background:#fb923c;" onclick="saveEventExpense('${eventId}')">
        <i class="fa-solid fa-check"></i> Save Expense
      </button>
    </div>`;
      openModal(html, "460px");
    }

    async function saveEventExpense(eventId) {
      const title = document.getElementById("eev_title")?.value.trim();
      const amt = document.getElementById("eev_amt")?.value;
      if (!title || !amt || Number(amt) <= 0) {
        toast("Title and amount are required.", "warn"); return;
      }
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      try {
        const res = await postData({
          action: "addEventExpense",
          // [ID] FIX: No Id passed — backend generates EEXP-NNNNN sequentially
          EventId: eventId,
          Title: title,
          Amount: Number(amt),
          ExpenseTypeId: document.getElementById("eev_type")?.value || "",
          ForMonth: document.getElementById("eev_month")?.value || "",
          Note: document.getElementById("eev_note")?.value.trim() || "",
          AdminName: s.name || "Admin"
        });
        if (res.status === "success") {
          closeModal();
          toast("✅ Expense added to event.", "");
          // FIX-4: Use dedicated entity so expense tracker + dashboard also update
          smartRefresh("expenses_from_event");
        } else {
          toast("❌ " + (res.message || "Failed."), "error");
        }
      } catch (err) { toast("❌ " + err.message, "error"); }
    }

    /* ── View all expenses for one event ── */
    function viewEventExpenses(eventId, eventName) {
      const evExps = _eventExpenses.filter(function (x) { return String(x.EventId) === String(eventId); });
      const total = evExps.reduce(function (s, x) { return s + Number(x.Amount || 0); }, 0);

      const rows = evExps.length === 0
        ? `<tr><td colspan="5" style="text-align:center;color:#aaa;padding:20px;">No expenses yet</td></tr>`
        : evExps.map(function (x, i) {
          const tName = (typeof expenseTypes !== "undefined" ? expenseTypes : [])
            .find(function (t) { return String(t.ExpenseTypeId) === String(x.ExpenseTypeId); })?.Name || "—";
          return `<tr>
          <td>${i + 1}</td>
          <td><b>${escapeHtml(x.Title || "—")}</b>${x.Note ? `<br><span style="font-size:10px;color:#94a3b8;">${escapeHtml(x.Note)}</span>` : ""}</td>
          <td>${escapeHtml(tName)}</td>
          <td>${escapeHtml(x.ForMonth || "—")}</td>
          <td class="amt-red">${APP.currency||"₹"}${fmt(x.Amount)}</td>
        </tr>`;
        }).join("");

      const html = `
    <div class="_mhdr">
      <h3><i class="fa-solid fa-list-ul"></i> Event Expenses</h3>
      <button class="_mcls" onclick="closeModal()">×</button>
    </div>
    <div class="_mbdy" style="padding:0;">
      <div style="background:#fff7ed;padding:12px 20px;font-size:13px;font-weight:600;color:#92400e;
        border-bottom:1px solid #fed7aa;">
        <i class="fa-solid fa-calendar-star"></i> ${escapeHtml(eventName)}
        &nbsp;·&nbsp; Total: <span style="color:#e74c3c;">${APP.currency||"₹"}${fmt(total)}</span>
      </div>
      <div style="overflow-x:auto;max-height:400px;overflow-y:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;position:sticky;top:0;">
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:#334155;">#</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:#334155;">Title</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:#334155;">Type</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:#334155;">Month</th>
              <th style="padding:10px 12px;text-align:right;font-weight:600;color:#334155;">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <div class="_mft">
      <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()">Close</button>
      <button class="_mbtn" style="background:#fb923c;" onclick="closeModal();openAddEventExpense('${eventId}','${escapeHtml(eventName)}')">
        <i class="fa-solid fa-plus"></i> Add Expense
      </button>
    </div>`;
      openModal(html, "580px");
    }

    /* ── WhatsApp share ── */
    function shareEventWhatsApp(eventId) {
      const ev = _events.find(function (x) { return String(x.EventId) === String(eventId); });
      if (!ev) return;
      const evExps = _eventExpenses.filter(function (x) { return String(x.EventId) === String(eventId); });
      const spent = evExps.reduce(function (s, x) { return s + Number(x.Amount || 0); }, 0);
      const budget = Number(ev.Budget || 0);
      const lines = evExps.map(function (x) { return `  • ${x.Title}: ${APP.currency||"₹"}${fmt(x.Amount)}`; }).join("\n") || "  No expenses yet";

      const msg = `${APP.symbol||"🕉️"} *${ev.EventName}*\n` +
        `📅 ${[ev.StartDate, ev.EndDate].filter(Boolean).join(" → ") || "Date TBD"}\n` +
        `🏷️ ${ev.Category} · ${ev.Status}\n` +
        `━━━━━━━━━━━━━━\n` +
        (budget > 0 ? `💰 Budget: ${APP.currency||"₹"}${fmt(budget)}\n` : "") +
        `💸 Spent: ${APP.currency||"₹"}${fmt(spent)}\n` +
        (budget > 0 ? `📊 Remaining: ${APP.currency||"₹"}${fmt(budget - spent)}\n` : "") +
        `━━━━━━━━━━━━━━\n` +
        `*Expense Breakdown:*\n${lines}\n` +
        `━━━━━━━━━━━━━━\n` +
        `_${new Date().toLocaleDateString(APP.locale||"en-IN")} · ${APP.name}_`;

      window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
    }

    async function addGoal() {
      let name = document.getElementById("g_name").value.trim();
      let target = document.getElementById("g_target").value;
      let current = document.getElementById("g_current").value || "0";
      let status = document.getElementById("g_status").value;
      if (!name || !target || Number(target) <= 0)
        return toast("Please enter goal name and target amount.", "error");
      try {
        let res = await postData({
          action: "addGoal",
          // [ID] FIX: No GoalId passed — backend generates GOAL-NNNNN sequentially
          GoalName: name,
          TargetAmount: target,
          CurrentAmount: current,
          Status: status,
        });
        if (res.status === "success") {
          toast("✅ Goal saved!");
          document.getElementById("g_name").value = "";
          document.getElementById("g_target").value = "";
          document.getElementById("g_current").value = "";
          // FIX-1: Use smartRefresh instead of optimistic local mutation
          // so the goals table always reflects server-confirmed data.
          smartRefresh("goals");
        } else toast("❌ Failed: " + (res.message || ""), "error");
      } catch (e) {
        toast("❌ " + e.message, "error");
      }
    }

    function openEditGoal(id) {
      let g = goals.find((x) => String(x.GoalId) === String(id));
      if (!g) return;
      const _gk = _storeGoalId(id);
      let html = `
          <div class="_mhdr"><h3><i class="fa-solid fa-pen"></i> Edit Goal</h3><button class="_mcls" onclick="closeModal()">×</button></div>
          <div class="_mbdy">
            <label class="_fl">Goal Name</label><input class="_fi" id="eg_name" value="${escapeHtml(
        g.GoalName || ""
      )}"/>
            <label class="_fl">Target Amount (₹)</label><input class="_fi" type="number" id="eg_target" value="${g.TargetAmount || 0
        }"/>
            <label class="_fl">Collected So Far (₹) <span style="color:#aaa;font-size:10px;font-weight:400;">update each time funds received</span></label>
            <input class="_fi" type="number" id="eg_current" value="${g.CurrentAmount || 0
        }"/>
            <label class="_fl">Status</label>
            <select class="_fi" id="eg_status">
              <option ${g.Status === "Enabled" ? "selected" : ""
        }>Enabled</option>
              <option ${g.Status === "Disabled" ? "selected" : ""
        }>Disabled</option>
            </select>
          </div>
          <div class="_mft">
            <button class="_mbtn" style="background:#999;" onclick="closeModal()">Cancel</button>
            <button class="_mbtn" style="background:#f7a01a;" onclick="saveEditGoal(_goalStore['${_gk}'])"><i class="fa-solid fa-check"></i> Save</button>
          </div>`;
      openModal(html, "420px");
    }

    async function saveEditGoal(id) {
      const nameVal = document.getElementById("eg_name").value.trim();
      const targetVal = document.getElementById("eg_target").value;
      const currentVal = document.getElementById("eg_current").value || "0";
      const statusVal = document.getElementById("eg_status").value;
      if (!nameVal) return toast("Goal name required.", "error");
      try {
        let res = await postData({
          action: "updateGoal",
          GoalId: id,
          GoalName: nameVal,
          TargetAmount: targetVal,
          CurrentAmount: currentVal,
          Status: statusVal,
        });
        if (res.status === "updated") {
          toast("✅ Goal updated.");
          closeModal();
          // FIX-2: Use smartRefresh instead of optimistic local mutation
          // so the goals table always reflects server-confirmed data.
          smartRefresh("goals");
        } else {
          toast("❌ Failed: " + (res.message || ""), "error");
        }
      } catch (e) {
        toast("❌ " + e.message, "error");
      }
    }

    async function deleteGoal(id) {
      const _undoG = (goals || []).find(g => String(g.GoalId) === String(id));
      const _undoLabel = _undoG ? (_undoG.GoalName || "Goal") : "Goal";
      const _undoSaved = _undoG ? JSON.parse(JSON.stringify(_undoG)) : null;
      confirmModal("Delete this goal?", async () => {
        try {
          let res = await postData({ action: "deleteGoal", GoalId: id });
          if (res.status === "deleted") {
            smartRefresh("goals");
            if (_undoSaved && typeof _showUndoToast === "function") {
              _showUndoToast(_undoLabel, function() {
                var payload = Object.assign({ action: "addGoal" }, _undoSaved);
                postData(payload).then(function() {
                  smartRefresh("goals");
                  toast("↩ Goal restored.");
                });
              });
            } else {
              toast("✅ Deleted.");
            }
          } else {
            toast("❌ Failed.", "error");
          }
        } catch (e) {
          toast("❌ " + e.message, "error");
        }
      });
    }

    function showReceiptById(rid) {
      const d = window._rcptStore[rid];
      if (!d) return;
      showReceipt(d.c, d.userName, d.typeName, d.occasionName, true);
    }

    // Called when clicking a row in the inline dashboard transaction log
    function viewDashboardEntry(rid) {
      const d = window._rcptStore ? window._rcptStore[rid] : null;
      if (!d) { showReceiptById(rid); return; }
      const { c, userName, typeName, occasionName } = d;
      const displayRID = (c.ReceiptID || "—").replace(new RegExp("^" + (APP.legacyReceiptPrefix||"TRX") + "-"), (APP.receiptPrefix||"REC") + "-");
      const html = `
        <div class="_mhdr"><h3><i class="fa-solid fa-eye"></i> Contribution Details</h3><button class="_mcls" onclick="closeModal()">×</button></div>
        <div class="_mbdy">
          <div style="border:1px solid #f0f0f0;border-radius:10px;padding:4px 16px;">
            <div class="_row"><span class="_rl">Tracking ID</span><span class="_rv" style="color:#f7a01a;font-family:monospace;">${escapeHtml(displayRID)}</span></div>
            <div class="_row"><span class="_rl">Donor</span><span class="_rv">${escapeHtml(userName)}</span></div>
            <div class="_row"><span class="_rl">Amount</span><span class="_rv" style="color:#27ae60;font-size:1.1rem;">₹ ${fmt(c.Amount)}</span></div>
            <div class="_row"><span class="_rl">Month / Year</span><span class="_rv">${escapeHtml(c.ForMonth || "—")} ${escapeHtml(String(c.Year || ""))}</span></div>
            <div class="_row"><span class="_rl">Type</span><span class="_rv">${escapeHtml(typeName || "—")}</span></div>
            <div class="_row"><span class="_rl">Occasion</span><span class="_rv">${escapeHtml(occasionName || "—")}</span></div>
            <div class="_row"><span class="_rl">Date Recorded</span><span class="_rv">${escapeHtml(c.PaymentDate || "—")}</span></div>
          </div>
        </div>
        <div class="_mft">
          <button class="_mbtn" style="background:#999;" onclick="closeModal()">Close</button>
          <button class="_mbtn" style="background:#27ae60;" onclick="closeModal();showReceiptById('${rid}')"><i class="fa-solid fa-receipt"></i> View Receipt</button>
        </div>`;
      openModal(html, "480px");
    }

    // FIX #13: viewContrib_receipt — only show receipt when explicitly requested
    function viewContrib_receipt(rid) {
      showReceiptById(rid);
    }

    /* ── Receipt Email Send — Quota Counter Hook ────────────────────────────
       app.js showReceipt() renders a modal that may include a "Send Email"
       button (action: resendReceipt / sendReceiptEmail).  When the admin
       clicks it, an email is consumed from the daily quota — but because the
       receipt view does NOT call smartRefresh("contributions"), the sidebar
       counter was never updated.

       Fix: use a MutationObserver on the modal container to detect when a
       receipt modal is opened, then attach a one-time click listener to any
       button whose text/action is "Send Email" or "Resend".  On click, wait
       1.5 s (Apps Script commit time) then call _refreshEmailQuotaUI().

       This is intentionally decoupled from smartRefresh so that ONLY the
       quota counter updates — no table re-render, no cache bust, no full
       data reload — because the contribution data itself did NOT change.
    ──────────────────────────────────────────────────────────────────────── */
    (function _hookReceiptEmailQuota() {
      var _modalEl = null;
      // Find the modal container — app.js typically uses id="modal" or class="_modal"
      function _getModal() {
        if (_modalEl && _modalEl.isConnected) return _modalEl;
        _modalEl = document.getElementById("modal") ||
                   document.querySelector("._modal-wrap") ||
                   document.querySelector("[id*='modal']");
        return _modalEl;
      }

      function _attachEmailBtnListener(root) {
        if (!root) return;
        // Match buttons by their label text or title — covers various receipt modal designs
        // ✅ FIX: Also match plain "email" — the receipt modal button text is just "Email" (with icon),
        //         not "send email" or "resend", so those checks were never matching.
        var btns = root.querySelectorAll("button, [role='button']");
        btns.forEach(function(btn) {
          var txt = (btn.textContent || btn.innerText || btn.title || "").toLowerCase().trim();
          var matches = txt.includes("send email") || txt.includes("resend") ||
                        txt.includes("email receipt") || txt === "email" ||
                        txt.includes("📧") || (btn.onclick && String(btn.onclick).includes("sendReceiptEmail"));
          if (matches) {
            if (btn._quotaHooked) return; // don't attach twice
            btn._quotaHooked = true;
            btn.addEventListener("click", function() {
              // Delay to let Apps Script commit the quota increment
              setTimeout(function() {
                if (typeof _refreshEmailQuotaUI === "function") {
                  _refreshEmailQuotaUI();
                }
              }, 1500);
            }, { once: false });
          }
        });
      }

      // Observe modal DOM for when receipt modals open (content injected dynamically)
      document.addEventListener("DOMContentLoaded", function() {
        var observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
              if (node.nodeType !== 1) return;
              var txt = (node.textContent || "").toLowerCase();
              // Only process nodes that look like a receipt modal
              if (txt.includes("receipt") || txt.includes("send email") || txt.includes("resend")) {
                _attachEmailBtnListener(node);
                // Also check descendants already rendered
                setTimeout(function() { _attachEmailBtnListener(node); }, 200);
              }
            });
          });
        });

        var target = document.body;
        observer.observe(target, { childList: true, subtree: true });
      });
    }());

    /* ═══ BROADCAST FUNCTIONS ═══ */
    let _bcHistory = [];

    (function () {
      const bcTypeEl = document.getElementById("bc_type");
      if (bcTypeEl)
        bcTypeEl.addEventListener("change", function () {
          const pollOpts = document.getElementById("bc_poll_options");
          if (pollOpts)
            pollOpts.style.display = this.value === "poll" ? "block" : "none";
        });
    })();

    function previewBroadcast() {
      const typeEl = document.getElementById("bc_type");
      const prioEl = document.getElementById("bc_priority");
      const titleEl = document.getElementById("bc_title");
      const msgEl = document.getElementById("bc_message");
      if (!typeEl || !titleEl || !msgEl) {
        toast("Broadcast form not found.", "error");
        return;
      }
      const type = typeEl.value;
      const priority = prioEl ? prioEl.value : "normal";
      const title = titleEl.value.trim();
      const message = msgEl.value.trim();
      if (!title && !message) {
        toast("Please enter a title and message first.", "warn");
        return;
      }
      const typeLabels = {
        announcement: "📢 Announcement",
        poll: "🗳️ Poll",
        innovation: "💡 New Idea",
      };
      const prioLabels = {
        normal: "",
        important: "⚠️ IMPORTANT — ",
        urgent: "🚨 URGENT — ",
      };
      const preview = `${APP.symbol||"🕉️"} *${APP.name.toUpperCase()}*\n📍 ${APP.location}\n━━━━━━━━━━━━━━━━━━━━\n${prioLabels[priority]
        }${typeLabels[type] || type
        }\n\n*${title}*\n\n${message}\n━━━━━━━━━━━━━━━━━━━━\n_${new Date().toLocaleDateString(
          APP.locale||"en-IN"
        )}_`;
      openModal(
        `<div class="_mhdr"><h3><i class="fa-solid fa-eye"></i> Broadcast Preview</h3><button class="_mcls" onclick="closeModal()">×</button></div>
          <div class="_mbdy">
            <div style="background:#1e293b;color:#e2e8f0;padding:16px;border-radius:10px;font-family:monospace;font-size:13px;white-space:pre-wrap;line-height:1.7;">${escapeHtml(
          preview
        )}</div>
          </div>
          <div class="_mft">
            <button class="_mbtn" style="background:#999;" onclick="closeModal()">Close</button>
            <button class="_mbtn" style="background:#25d366;" onclick="closeModal();sendBroadcast()"><i class="fa-brands fa-whatsapp"></i> Send Now</button>
          </div>`,
        "540px"
      );
    }

    async function sendBroadcast() {
      const typeEl = document.getElementById("bc_type");
      const prioEl = document.getElementById("bc_priority");
      const titleEl = document.getElementById("bc_title");
      const msgEl = document.getElementById("bc_message");
      if (!typeEl || !titleEl || !msgEl) {
        toast("Broadcast form not found.", "error");
        return;
      }
      const type = typeEl.value;
      const priority = prioEl ? prioEl.value : "normal";
      const title = titleEl.value.trim();
      const message = msgEl.value.trim();
      if (!title) {
        toast("Please enter a title/subject.", "warn");
        return;
      }
      if (!message) {
        toast("Please enter a message.", "warn");
        return;
      }
      const typeLabels = {
        announcement: "📢 Announcement",
        poll: "🗳️ Poll",
        innovation: "💡 New Idea",
      };
      const prioLabels = {
        normal: "",
        important: "⚠️ IMPORTANT — ",
        urgent: "🚨 URGENT — ",
      };
      const pollBlock =
        type === "poll"
          ? "\n\nRespond with:\n✅ Yes  |  ❌ No  |  💬 Suggestion"
          : "";
      const msg = `${APP.symbol||"🕉️"} *${APP.name.toUpperCase()}*\n📍 ${APP.location}\n━━━━━━━━━━━━━━━━━━━━\n${prioLabels[priority]
        }${typeLabels[type] || type
        }\n\n*${title}*\n\n${message}${pollBlock}\n━━━━━━━━━━━━━━━━━━━━\n_${new Date().toLocaleDateString(
          APP.locale||"en-IN"
        )}_`;
      window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
      // Add to session history
      _bcHistory.unshift({
        type,
        priority,
        title,
        message,
        time: new Date().toLocaleString(APP.locale||"en-IN"),
      });
      renderBroadcastHistory();
      // Store broadcast in backend sheet so all users can read it
      try {
        await postData({
          action: "saveBroadcast",
          type,
          priority,
          title,
          message,
          time: new Date().toLocaleString(APP.locale||"en-IN"),
        });
      } catch (e) {
      }
      titleEl.value = "";
      msgEl.value = "";
      toast("✅ WhatsApp opened with broadcast message!");
    }

    function renderBroadcastHistory() {
      const container = document.getElementById("broadcastHistory");
      if (!container) return;
      if (_bcHistory.length === 0) {
        container.innerHTML =
          '<div style="font-size:13px;color:#888;text-align:center;padding:20px;">No broadcasts sent yet in this session.</div>';
        return;
      }
      const typeColors = {
        announcement: "#2980b9",
        poll: "#8e44ad",
        innovation: "#27ae60",
      };
      container.innerHTML = _bcHistory
        .map(
          (b) =>
            `<div style="background:#f8fafc;border-radius:10px;padding:12px 16px;margin-bottom:10px;border-left:4px solid ${typeColors[b.type] || "#ccc"
            };">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
              <b style="font-size:13px;">${escapeHtml(b.title)}</b>
              <span style="font-size:11px;color:#aaa;">${b.time}</span>
            </div>
            <div style="font-size:12px;color:#555;">${escapeHtml(
              b.message.substring(0, 120)
            )}${b.message.length > 120 ? "…" : ""}</div>
          </div>`
        )
        .join("");
    }

    /* ═══ AUDIT LOG FUNCTIONS — ENHANCED ═══ */
    let _auditData = [];
    let _auditPage = 1;
    const AUDIT_PAGE_SIZE = 10;

    // ── Collect device/browser info for audit logging
    function _getDeviceInfo() {
      try {
        const ua = navigator.userAgent || "";
        let device = "Desktop";
        if (/Android/i.test(ua)) device = "Android";
        else if (/iPhone|iPad/i.test(ua)) device = "iOS";
        else if (/Mobile/i.test(ua)) device = "Mobile";
        let browser = "Unknown";
        if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = "Chrome";
        else if (/Firefox\//.test(ua)) browser = "Firefox";
        else if (/Edg\//.test(ua)) browser = "Edge";
        else if (/Safari\//.test(ua)) browser = "Safari";
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
        const lang = navigator.language || "";
        const sw = window.screen ? window.screen.width + "x" + window.screen.height : "";
        return device + " | " + browser + " | " + tz + " | " + lang + " | " + sw;
      } catch (e) { return ""; }
    }
    window._getDeviceInfo = _getDeviceInfo;

    async function loadAuditLog() {
      const tbody = document.getElementById("auditTableBody");
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:20px;"><div class="spinner" style="margin:0 auto;width:28px;height:28px;"></div><br>Loading audit log...</td></tr>';
      try {
        const res = await getData("getAuditLog");
        _auditData = Array.isArray(res) ? res : [];
        _auditPage = 1;
        _renderAuditStats(_auditData);
        _renderAuditPaged(_auditData, _auditPage);
        if (_auditData.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:20px;">No audit log entries found.</td></tr>';
        }
      } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#e74c3c;padding:20px;">Failed to load: ${escapeHtml(e.message)}</td></tr>`;
      }
    }

    function _renderAuditStats(list) {
      const statsEl = document.getElementById("audit_stats");
      const badge = document.getElementById("audit_count_badge");
      if (!statsEl) return;
      if (!list || list.length === 0) {
        statsEl.style.display = "none";
        if (badge) badge.style.display = "none";
        return;
      }
      statsEl.style.display = "grid";
      if (badge) { badge.textContent = list.length + " entries"; badge.style.display = "inline-block"; }
      const d = new Date();
      const todayFmt = String(d.getDate()).padStart(2, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + d.getFullYear();
      const todayISO = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
      const todayE = list.filter(r => { const ts = String(r.Timestamp||""); return ts.startsWith(todayFmt) || ts.startsWith(todayISO); });
      const logins = todayE.filter(r => /login/i.test(r.Action || "") && !/logout/i.test(r.Action || "")).length;
      const actions = todayE.filter(r => !/login/i.test(r.Action || "") && !/logout/i.test(r.Action || "")).length;
      const uniqueU = new Set(list.map(r => String(r.UserAdmin || ""))).size;
      const sl = document.getElementById("audit_stat_logins");
      const sa = document.getElementById("audit_stat_actions");
      const st = document.getElementById("audit_stat_total");
      const su = document.getElementById("audit_stat_users");
      if (sl) sl.textContent = logins;
      if (sa) sa.textContent = actions;
      if (st) st.textContent = list.length;
      if (su) su.textContent = uniqueU;
    }

    function _getFilteredAudit() {
      const txt = (document.getElementById("auditSearch")?.value || "").toLowerCase().trim();
      const act = (document.getElementById("auditFilterAction")?.value || "").toLowerCase();
      let list = _auditData;
      if (txt) list = list.filter(r =>
        [r.Timestamp, r.UserAdmin, r.Action, r.Details, r.Reason, r.DeviceInfo]
          .some(v => String(v || "").toLowerCase().includes(txt))
      );
      if (act) list = list.filter(r => String(r.Action || "").toLowerCase().includes(act));
      return list;
    }

    function _renderAuditPaged(list, page) {
      const tbody = document.getElementById("auditTableBody");
      const pagEl = document.getElementById("audit_pagination");
      if (!tbody) return;
      if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:20px;">No entries found.</td></tr>';
        if (pagEl) pagEl.innerHTML = "";
        return;
      }
      const totalPages = Math.ceil(list.length / AUDIT_PAGE_SIZE);
      const start = (page - 1) * AUDIT_PAGE_SIZE;
      const items = list.slice(start, start + AUDIT_PAGE_SIZE);
      tbody.innerHTML = items.map((row, i) => {
        const idx = start + i + 1;
        // ── Format timestamp → two-line human-readable display
        // Handles: "11-Apr-2026 09:03 AM" and "2026-04-11T09:03:00.000Z" (ISO from Sheets)
        const tsRaw = String(row.Timestamp || "—");
        let tsHtml = `<span style="font-family:monospace;font-size:11px;color:#64748b;">${escapeHtml(tsRaw)}</span>`;
        try {
          const _MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const tsParts = tsRaw.match(/^(\d{2}-\w{3}-\d{4})\s+(.+)$/);
          if (tsParts) {
            tsHtml = `<div style="line-height:1.5;">
              <div style="font-weight:600;font-size:11.5px;color:#334155;">${escapeHtml(tsParts[1])}</div>
              <div style="font-size:10.5px;color:#94a3b8;">${escapeHtml(tsParts[2])}</div>
            </div>`;
          } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(tsRaw)) {
            const _d = new Date(tsRaw);
            const _ist = new Date(_d.getTime() + (5*60+30)*60000);
            const _dd = String(_ist.getUTCDate()).padStart(2,"0");
            const _mm = _MON[_ist.getUTCMonth()];
            const _yyyy = _ist.getUTCFullYear();
            let _hh = _ist.getUTCHours();
            const _min = String(_ist.getUTCMinutes()).padStart(2,"0");
            const _ap = _hh >= 12 ? "PM" : "AM";
            _hh = _hh % 12 || 12;
            tsHtml = `<div style="line-height:1.5;">
              <div style="font-weight:600;font-size:11.5px;color:#334155;">${_dd}-${_mm}-${_yyyy}</div>
              <div style="font-size:10.5px;color:#94a3b8;">${_hh}:${_min} ${_ap}</div>
            </div>`;
          }
        } catch(e2){}
        const user    = String(row.UserAdmin || "—");
        const action  = String(row.Action   || "—");
        const details = String(row.Details  || "—");
        const reason  = String(row.Reason   || "");
        const devRaw  = String(row.DeviceInfo || "");
        const aLow = action.toLowerCase();
        const isLogin  = aLow.includes("login")  && !aLow.includes("logout");
        const isLogout = aLow.includes("logout");
        const isEmail  = aLow.includes("email")  || aLow.includes("receipt");
        const isDelete = aLow.includes("delete");
        const isPwd    = aLow.includes("password");
        const badgeSt = isLogin  ? "background:#dcfce7;color:#16a34a;border:1px solid #86efac;"
          : isLogout ? "background:#fef3c7;color:#d97706;border:1px solid #fde68a;"
          : isEmail  ? "background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd;"
          : isDelete ? "background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;"
          : isPwd    ? "background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;"
          :            "background:#f0f4f8;color:#334155;border:1px solid #cbd5e1;";
        const rowBg = isLogin ? "#f0fdf4" : isLogout ? "#fefce8" : "";
        // ── Reason cell
        const reasonHtml = reason
          ? `<span style="font-size:11px;color:#475569;">${escapeHtml(reason)}</span>`
          : `<span style="color:#cbd5e1;font-size:11px;">—</span>`;
        // ── Device info cell
        let devHtml = "<span style='color:#94a3b8;font-size:11px;'>—</span>";
        if (devRaw) {
          const parts = devRaw.split("|").map(s => s.trim()).filter(Boolean);
          const dIcon = /android/i.test(parts[0] || "")       ? "fa-android"
            : /ios|iphone|ipad/i.test(parts[0] || "")         ? "fa-apple"
            : /mobile/i.test(parts[0] || "")                   ? "fa-mobile-screen-button"
            :                                                     "fa-desktop";
          devHtml = `<div style="line-height:1.5;">
              <div style="font-weight:600;color:#334155;font-size:11px;"><i class="fa-brands ${dIcon}" style="margin-right:3px;"></i>${escapeHtml(parts[0] || "")} ${parts[1] ? "· " + escapeHtml(parts[1]) : ""}</div>
              ${parts[2] ? `<div style="font-size:10px;color:#64748b;">${escapeHtml(parts[2])}</div>` : ""}
              ${parts[4] ? `<div style="font-size:10px;color:#94a3b8;">${escapeHtml(parts[4])}</div>` : ""}
            </div>`;
        }
        return `<tr style="background:${rowBg};">
            <td style="color:#94a3b8;font-size:11px;">${idx}</td>
            <td style="white-space:nowrap;">${tsHtml}</td>
            <td style="font-weight:600;font-size:12px;color:#1e293b;">${escapeHtml(user)}</td>
            <td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;${badgeSt}">${escapeHtml(action)}</span></td>
            <td style="font-size:11.5px;color:#475569;white-space:normal;max-width:180px;">${escapeHtml(details)}</td>
            <td style="white-space:normal;max-width:160px;">${reasonHtml}</td>
            <td style="font-size:11px;min-width:130px;">${devHtml}</td>
          </tr>`;
      }).join("");
      // Pagination
      if (pagEl && totalPages > 1) {
        let phtml = '<span class="pg-info">Page ' + page + '/' + totalPages + ' &middot; ' + list.length + ' entries</span>';
        phtml += '<button class="pg-btn" onclick="_goAuditPage(' + Math.max(1, page - 1) + ')" ' + (page <= 1 ? 'disabled' : '') + '>&#8249; Prev</button>';
        var pgStart = Math.max(1, page - 2), pgEnd = Math.min(totalPages, page + 2);
        if (pgStart > 1) { phtml += '<button class="pg-btn" onclick="_goAuditPage(1)">1</button>'; if (pgStart > 2) phtml += '<span class="pg-info">…</span>'; }
        for (let p = pgStart; p <= pgEnd; p++) {
          phtml += '<button class="pg-btn' + (p === page ? ' active' : '') + '" onclick="_goAuditPage(' + p + ')">' + p + '</button>';
        }
        if (pgEnd < totalPages) { if (pgEnd < totalPages - 1) phtml += '<span class="pg-info">…</span>'; phtml += '<button class="pg-btn" onclick="_goAuditPage(' + totalPages + ')">' + totalPages + '</button>'; }
        phtml += '<button class="pg-btn" onclick="_goAuditPage(' + Math.min(totalPages, page + 1) + ')" ' + (page >= totalPages ? 'disabled' : '') + '>Next &#8250;</button>';
        pagEl.innerHTML = phtml;
      } else if (pagEl) { pagEl.innerHTML = ""; }
    }

    function _goAuditPage(p) {
      _auditPage = p;
      _renderAuditPaged(_getFilteredAudit(), p);
      document.getElementById("auditPage")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderAuditTable(list) { _auditPage = 1; _renderAuditPaged(list, 1); }

    function filterAuditLog() {
      _auditPage = 1;
      // Reset Today button style when user manually filters
      const tb = document.getElementById("auditTodayBtn");
      if (tb) { tb.style.background = "#f7a01a"; tb.innerHTML = '<i class="fa-solid fa-calendar-day"></i> Today'; }
      _renderAuditPaged(_getFilteredAudit(), 1);
    }
    function _auditFilterToday() {
      const d = new Date();
      const todayFmt = String(d.getDate()).padStart(2,"0") + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + d.getFullYear();
      const todayISO = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
      const todayList = _auditData.filter(r => { const ts = String(r.Timestamp||""); return ts.startsWith(todayFmt) || ts.startsWith(todayISO); });
      _auditPage = 1;
      _renderAuditPaged(todayList, 1);
      // Highlight Today button to show filter is active
      const tb = document.getElementById("auditTodayBtn");
      if (tb) { tb.style.background = "#334155"; tb.innerHTML = '<i class="fa-solid fa-xmark"></i> Clear Today'; tb.onclick = function(){ tb.onclick = _auditFilterToday; filterAuditLog(); }; }
    }
    /* debounced version wired to onkeyup — replaces direct call after DOM ready */
    var _filterAuditLogDebounced = debounce(filterAuditLog, 280);
    document.addEventListener("DOMContentLoaded", function () {
      var auditSrch = document.getElementById("auditSearch");
      if (auditSrch) {
        auditSrch.removeAttribute("onkeyup");
        auditSrch.addEventListener("input", _filterAuditLogDebounced);
      }
    });

    function exportAuditCSV() {
      if (!_auditData || _auditData.length === 0) { toast("No audit data to export", "warn"); return; }
      toast("⏳ Preparing audit CSV...", "warn");
      setTimeout(function() {
        const hdrs = ["#", "Timestamp", "User/Admin", "Action", "Details", "Reason", "Device Info"];
        const rows = _auditData.map((r, i) =>
          [i + 1, r.Timestamp || "", r.UserAdmin || "", r.Action || "", r.Details || "", r.Reason || "", r.DeviceInfo || ""]
            .map(v => '"' + String(v).replace(/"/g, '""') + '"').join(",")
        );
        const csv = [hdrs.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "audit_log_" + new Date().toISOString().slice(0, 10) + ".csv";
        a.click(); URL.revokeObjectURL(url);
        toast("✅ Audit log exported as CSV", "");
      }, 50);
    }

    /* ═══ CSV EXPORT — CONTRIBUTIONS ════════════════════════════════
 Exports whatever is currently visible after filters are applied.
 Falls back to full data if filter function has not run yet.
 ═══════════════════════════════════════════════════════════════ */
    function exportContribCSV() {
      toast("⏳ Preparing contributions CSV...", "warn");
      setTimeout(function() {
      const txt = (document.getElementById("searchContrib")?.value || "").toLowerCase();
      const start = document.getElementById("contribStart")?.value || "";
      const end = document.getElementById("contribEnd")?.value || "";

      const list = data.filter(function (c) {
        const user = users.find(u => String(u.UserId) === String(c.UserId));
        const displayRID = (c.ReceiptID || "").replace(new RegExp("^" + (APP.legacyReceiptPrefix||"TRX") + "-"), (APP.receiptPrefix||"REC") + "-");
        const walkInName = String(c.UserId).startsWith("WALKIN_")
          ? (String(c.Note || "").match(/Walk-in:\s*([^|]+)/)?.[1]?.trim() || "").toLowerCase()
          : "";
        const nameMatch = !txt ||
          (user?.Name.toLowerCase() || "").includes(txt) ||
          walkInName.includes(txt) ||
          String(user?.Mobile || "").includes(txt) ||
          String(c.Amount).includes(txt) ||
          displayRID.toLowerCase().includes(txt) ||
          (c.ReceiptID || "").toLowerCase().includes(txt);
        let dateMatch = true;
        if ((start || end) && c.PaymentDate) {
          const _fmtD = formatPaymentDate(c.PaymentDate).split(" ")[0].split("-");
          if (_fmtD.length === 3) {
            const cDate = _fmtD[2] + "-" + _fmtD[1] + "-" + _fmtD[0];
            dateMatch = (!start || cDate >= start) && (!end || cDate <= end);
          }
        }
        return nameMatch && dateMatch;
      });

      if (!list || list.length === 0) {
        toast("No contribution records to export", "warn");
        return;
      }

      // Column headers — matches table + extra useful fields
      const headers = [
        "#", "Name", "Mobile", "Amount (₹)", "Month", "Year",
        "Type", "Occasion", "Receipt ID", "Payment Mode",
        "Payment Date", "Note", "Walk-in"
      ];

      const rows = list.map(function (c, i) {
        const user = users.find(u => String(u.UserId) === String(c.UserId));
        const isWalkIn = String(c.UserId).startsWith("WALKIN_");
        const name = user?.Name ||
          (isWalkIn
            ? (String(c.Note || "").match(/Walk-in:\s*([^|]+)/)?.[1]?.trim() || "Walk-in Donor")
            : "Unknown");
        const mobile = user?.Mobile || (isWalkIn ? (String(c.Note || "").match(/\|\s*(\d+)/)?.[1] || "") : "");
        const typeName = types.find(t => String(t.TypeId) === String(c.TypeId))?.TypeName || "";
        const occName = occasions.find(o => String(o.OccasionId) === String(c.OccasionId))?.OccasionName || "";
        const rid = (c.ReceiptID || "").replace(new RegExp("^" + (APP.legacyReceiptPrefix||"TRX") + "-"), (APP.receiptPrefix||"REC") + "-");
        const pDate = formatPaymentDate(c.PaymentDate);

        return [
          i + 1,
          name,
          mobile,
          Number(c.Amount || 0),
          c.ForMonth || "",
          c.Year || "",
          typeName,
          occName,
          rid,
          c.PaymentMode || "",
          pDate,
          c.Note || "",
          isWalkIn ? "Yes" : "No"
        ].map(function (v) {
          return '"' + String(v).replace(/"/g, '""') + '"';
        }).join(",");
      });

      // Build summary rows at bottom
      const total = list.reduce(function (s, c) { return s + Number(c.Amount || 0); }, 0);
      rows.push(""); // blank line before summary
      rows.push('"Total Records","' + list.length + '"');
      rows.push('"Total Amount (₹)","' + total.toLocaleString(APP.locale||"en-IN") + '"');

      // Filter context in filename
      const dateTag = new Date().toISOString().slice(0, 10);
      const filterTag = (start && end) ? ("_" + start + "_to_" + end)
        : start ? ("_from_" + start)
          : end ? ("_upto_" + end)
            : "";
      const filename = "contributions" + filterTag + "_exported_" + dateTag + ".csv";

      _downloadCSV([headers.join(","), ...rows].join("\n"), filename);
      toast("✅ " + list.length + " contribution records exported", "");
      }, 50);
    }


    /* ═══ CSV EXPORT — EXPENSES ══════════════════════════════════════
       Exports whatever is currently visible after filters are applied.
       ═══════════════════════════════════════════════════════════════ */
    function exportExpenseCSV() {
      toast("⏳ Preparing expenses CSV...", "warn");
      setTimeout(function() {
      const txt = (document.getElementById("searchExpense")?.value || "").toLowerCase(); // FIX: was undefined
      const yr = document.getElementById("expFilterYear")?.value || "";
      const mo = document.getElementById("expFilterMonth")?.value || "";

      const list = expenses.filter(function (e) {
        const tName = expenseTypes.find(t => String(t.ExpenseTypeId) === String(e.ExpenseTypeId))?.Name || "";
        const mn = e.ForMonth || e.Note || "";
        const textMatch = !txt ||
          (e.Title || "").toLowerCase().includes(txt) ||
          tName.toLowerCase().includes(txt) ||
          mn.toLowerCase().includes(txt) ||
          String(e.Amount).includes(txt);
        const yearMatch = !yr || String(e.Year) === yr;
        const monthMatch = !mo || mn === mo;
        return textMatch && yearMatch && monthMatch;
      });

      if (!list || list.length === 0) {
        toast("No expense records to export", "warn");
        return;
      }

      const headers = ["#", "Title", "Expense Type", "Month", "Year", "Amount (₹)", "Payment Date"];

      const rows = list.map(function (e, i) {
        const tName = expenseTypes.find(t => String(t.ExpenseTypeId) === String(e.ExpenseTypeId))?.Name || "";
        const mn = e.ForMonth || e.Note || "";
        return [
          i + 1,
          e.Title || "",
          tName,
          mn,
          e.Year || "",
          Number(e.Amount || 0),
          formatPaymentDate(e.PaymentDate)
        ].map(function (v) {
          return '"' + String(v).replace(/"/g, '""') + '"';
        }).join(",");
      });

      // Summary rows
      const total = list.reduce(function (s, e) { return s + Number(e.Amount || 0); }, 0);
      rows.push("");
      rows.push('"Total Records","' + list.length + '"');
      rows.push('"Total Amount (₹)","' + total.toLocaleString(APP.locale||"en-IN") + '"');

      // Filename with filter context
      const dateTag = new Date().toISOString().slice(0, 10);
      const filterTag = yr ? ("_" + yr + (mo ? "_" + mo : "")) : (mo ? "_" + mo : "");
      const filename = "expenses" + filterTag + "_exported_" + dateTag + ".csv";

      _downloadCSV([headers.join(","), ...rows].join("\n"), filename);
      toast("✅ " + list.length + " expense records exported", "");
      }, 50);
    }


    /* ═══ SHARED CSV DOWNLOAD HELPER ════════════════════════════════
       Creates a blob, triggers browser download, cleans up URL.
       ═══════════════════════════════════════════════════════════════ */
    function _downloadCSV(csvString, filename) {
      // Add BOM for Excel to correctly read UTF-8 (handles ₹ and Hindi text)
      const bom = "\uFEFF";
      const blob = new Blob([bom + csvString], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    /* ═══ FEEDBACK ADMIN FUNCTIONS ═══ */
    /* ══════════ FEEDBACK CONFIRM MODAL ══════════ */
    (function injectFbModal() {
      if (document.getElementById('_fbModalOverlay')) return;
      const style = document.createElement('style');
      style.textContent = `
          #_fbModalOverlay {
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(15,23,42,0.55);
            backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            opacity: 0; pointer-events: none;
            transition: opacity 0.22s ease;
          }
          #_fbModalOverlay.show { opacity: 1; pointer-events: all; }
          #_fbModalBox {
            background: #fff; border-radius: 20px;
            padding: 32px 28px 24px; max-width: 360px; width: 90%;
            box-shadow: 0 24px 60px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.04);
            transform: scale(0.88) translateY(16px);
            transition: transform 0.26s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease;
            opacity: 0; text-align: center;
          }
          #_fbModalOverlay.show #_fbModalBox { transform: scale(1) translateY(0); opacity: 1; }
          #_fbModalIcon {
            width: 66px; height: 66px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 1.7rem; margin: 0 auto 16px;
          }
          #_fbModalIcon.done { background: #d1fae5; color: #059669; }
          #_fbModalIcon.del  { background: #fee2e2; color: #dc2626; }
          #_fbModalTitle {
            font-size: 1.12rem; font-weight: 700; color: #0f172a;
            margin: 0 0 8px; font-family: Poppins, sans-serif;
          }
          #_fbModalMsg {
            font-size: 0.855rem; color: #64748b; line-height: 1.65;
            margin: 0 0 24px; font-family: Poppins, sans-serif;
          }
          #_fbModalMsg strong { color: #334155; }
          #_fbModalMeta {
            background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
            padding: 10px 14px; margin: -10px 0 20px;
            font-size: 12px; color: #475569; font-family: Poppins, sans-serif;
            text-align: left; line-height: 1.7; display: none;
          }
          #_fbModalMeta.show { display: block; }
          #_fbModalMeta span { font-weight: 600; color: #0f172a; }
          ._fbModalBtns { display: flex; gap: 10px; justify-content: center; }
          ._fbModalBtns button {
            flex: 1; max-width: 148px; padding: 11px 0;
            border-radius: 10px; border: none;
            font-size: 0.88rem; font-weight: 700; cursor: pointer;
            font-family: Poppins, sans-serif;
            transition: transform 0.15s, box-shadow 0.15s;
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          }
          ._fbModalBtns button:hover { transform: translateY(-2px); }
          #_fbModalCancel { background: #f1f5f9; color: #475569; }
          #_fbModalCancel:hover { background: #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
          #_fbModalConfirm.done { background: linear-gradient(135deg,#34d399,#059669); color:#fff; box-shadow:0 4px 14px rgba(5,150,105,0.3); }
          #_fbModalConfirm.done:hover { box-shadow:0 8px 20px rgba(5,150,105,0.45); }
          #_fbModalConfirm.del  { background: linear-gradient(135deg,#f87171,#dc2626); color:#fff; box-shadow:0 4px 14px rgba(220,38,38,0.3); }
          #_fbModalConfirm.del:hover  { box-shadow:0 8px 20px rgba(220,38,38,0.45); }
        `;
      document.head.appendChild(style);
      const overlay = document.createElement('div');
      overlay.id = '_fbModalOverlay';
      overlay.innerHTML = `
          <div id="_fbModalBox">
            <div id="_fbModalIcon"><i id="_fbModalIconI"></i></div>
            <div id="_fbModalTitle"></div>
            <div id="_fbModalMsg"></div>
            <div id="_fbModalMeta"></div>
            <div class="_fbModalBtns">
              <button id="_fbModalCancel" onclick="_fbModalClose()">
                <i class="fa-solid fa-xmark"></i> Cancel
              </button>
              <button id="_fbModalConfirm">Confirm</button>
            </div>
          </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) _fbModalClose(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _fbModalClose(); });
    })();

    window._fbModalClose = function () {
      const ov = document.getElementById('_fbModalOverlay');
      if (ov) ov.classList.remove('show');
    };

    function _fbShowConfirm({ type, title, msg, meta, onConfirm }) {
      const ov = document.getElementById('_fbModalOverlay');
      const icon = document.getElementById('_fbModalIcon');
      const iconI = document.getElementById('_fbModalIconI');
      const tit = document.getElementById('_fbModalTitle');
      const msgEl = document.getElementById('_fbModalMsg');
      const metaEl = document.getElementById('_fbModalMeta');
      const conf = document.getElementById('_fbModalConfirm');
      icon.className = type; icon.id = '_fbModalIcon';
      iconI.className = type === 'done' ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation';
      tit.textContent = title;
      msgEl.innerHTML = msg;
      if (meta) { metaEl.innerHTML = meta; metaEl.classList.add('show'); }
      else { metaEl.innerHTML = ''; metaEl.classList.remove('show'); }
      conf.className = type; conf.id = '_fbModalConfirm';
      conf.innerHTML = type === 'done'
        ? '<i class="fa-solid fa-check"></i> Mark Done'
        : '<i class="fa-solid fa-trash-can"></i> Delete';
      conf.onclick = function () { _fbModalClose(); onConfirm(); };
      ov.classList.add('show');
    }

    let _fbAdminData = [];

    async function loadFeedbackAdmin() {
      const tbody = document.getElementById("fbAdminTableBody");
      if (!tbody) return;
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:20px;">Loading...</td></tr>';
      try {
        const res = await getData("getFeedback");
        _fbAdminData = Array.isArray(res) ? res : [];
        renderFeedbackAdmin(_fbAdminData);
        if (_fbAdminData.length === 0)
          tbody.innerHTML =
            '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:20px;">No feedback yet.<br><small style="font-size:11px;">Feedback from the Home page will appear here.</small></td></tr>';
      } catch (e) {
        tbody.innerHTML =
          '<tr><td colspan="8" style="text-align:center;color:#e74c3c;padding:20px;">Could not load feedback. Make sure FEEDBACK sheet exists.</td></tr>';
      }
    }

    function fbMarkResolved(rowIndex, btnEl) {
      const row = _fbAdminData.find(r => r.RowIndex === rowIndex) || {};
      _fbShowConfirm({
        type: 'done',
        title: 'Mark as Resolved?',
        msg: 'This will update the status to <strong>Resolved</strong> in your Google Sheet permanently.',
        meta: `👤 <span>${escapeHtml(row.Name || '—')}</span> &nbsp;·&nbsp; 💬 ${escapeHtml(row.Message || '—')}`,
        onConfirm: async function () {
          if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
          try {
            const res = await postData({ action: "updateFeedbackStatus", RowIndex: rowIndex, Status: "Resolved" });
            if (res && res.status === "updated") {
              toast("✅ Marked as Resolved!", "success");
              await loadFeedbackAdmin();
            } else {
              toast("Failed to update. Try again.", "error");
              if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fa-solid fa-check"></i> Done'; }
            }
          } catch (e) {
            toast("Network error. Try again.", "error");
            if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fa-solid fa-check"></i> Done'; }
          }
        }
      });
    }

    function fbDeleteRow(rowIndex, btnEl) {
      const row = _fbAdminData.find(r => r.RowIndex === rowIndex) || {};
      _fbShowConfirm({
        type: 'del',
        title: 'Delete Feedback?',
        msg: 'This will <strong>permanently remove</strong> this entry from your Google Sheet. This cannot be undone.',
        meta: `👤 <span>${escapeHtml(row.Name || '—')}</span> &nbsp;·&nbsp; 💬 ${escapeHtml(row.Message || '—')}`,
        onConfirm: async function () {
          if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
          try {
            const res = await postData({ action: "deleteFeedback", RowIndex: rowIndex });
            if (res && res.status === "deleted") {
              toast("🗑️ Feedback deleted!", "success");
              await loadFeedbackAdmin();
            } else {
              toast("Failed to delete. Try again.", "error");
              if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fa-solid fa-trash-can"></i> Del'; }
            }
          } catch (e) {
            toast("Network error. Try again.", "error");
            if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fa-solid fa-trash-can"></i> Del'; }
          }
        }
      });
    }

    function renderFeedbackAdmin(list) {
      const tbody = document.getElementById("fbAdminTableBody");
      if (!tbody) return;
      if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:20px;">No entries found.</td></tr>';
        _buildPagination("fb_pagination", 1, 0, "_gotoFbPage");
        return;
      }
      window._fbList = list;
      window._fbPage = 1;
      _renderFbPaged();
    }

    function _gotoFbPage(p) {
      const total = Math.ceil((window._fbList || []).length / PAGE_SIZE);
      window._fbPage = Math.max(1, Math.min(p, total));
      _renderFbPaged();
    }

    function _renderFbPaged() {
      const tbody = document.getElementById("fbAdminTableBody");
      if (!tbody) return;
      const list = window._fbList || [];
      const page = window._fbPage || 1;
      const start = (page - 1) * PAGE_SIZE;
      const items = list.slice(start, start + PAGE_SIZE);
      const total = Math.ceil(list.length / PAGE_SIZE);
      let visibleIdx = start;
      tbody.innerHTML = items.map((row, idx) => {
        visibleIdx++;
        const ts = String(row.Timestamp || row[0] || '—');
        const name = String(row.Name || row[1] || '—');
        const mobile = String(row.Mobile || row[2] || '—');
        const address = String(row.Address || row[3] || '—');
        const message = String(row.Message || row[4] || '—');
        const status = String(row.Status || 'Pending');
        const rowIdx = row.RowIndex;
        const isDone = status === 'Resolved';
        const badge = isDone
          ? '<span style="background:#d1fae5;color:#065f46;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;">✓ Resolved</span>'
          : '<span style="background:#fef3c7;color:#92400e;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;">Pending</span>';
        return `<tr style="${isDone ? 'opacity:0.6;' : ''}">
            <td style="color:#888;">${visibleIdx}</td>
            <td style="font-size:12px;color:#888;font-family:monospace;">${escapeHtml(ts)}</td>
            <td style="font-weight:600;">${escapeHtml(name)}</td>
            <td>${escapeHtml(mobile)}</td>
            <td style="font-size:12px;color:#666;">${escapeHtml(address)}</td>
            <td style="font-size:12px;color:#333;white-space:normal;max-width:200px;">${escapeHtml(message)}</td>
            <td>${badge}</td>
            <td>
              <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
                ${!isDone ? `<button onclick="replyToFeedback(${rowIdx}, '${escapeHtml(name)}', '${escapeHtml(mobile)}')" style="background:#25d366;margin-right:4px;"><i class="fa-brands fa-whatsapp"></i> Reply</button>
              <button class="btn-sm" onclick="fbMarkResolved(${rowIdx}, this)"
                  style="background:#d1fae5;color:#065f46;border:1px solid #6ee7b7;border-radius:8px;padding:4px 9px;font-size:11px;cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;"><i class="fa-solid fa-check"></i> Done</button>` : ''}
                <button onclick="fbDeleteRow(${rowIdx}, this)"
                  style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;border-radius:8px;padding:4px 9px;font-size:11px;cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;"><i class="fa-solid fa-trash-can"></i> Del</button>
              </div>
            </td>
          </tr>`;
      }).join('');
      _buildPagination("fb_pagination", page, total, "_gotoFbPage");
    }

    function filterFeedbackAdmin() {
      const txt = (
        document.getElementById("fbAdminSearch")?.value || ""
      ).toLowerCase();
      if (!txt) {
        renderFeedbackAdmin(_fbAdminData);
        return;
      }
      const filtered = _fbAdminData.filter((r) =>
        [r.Name || r[1], r.Mobile || r[2], r.Message || r[4]].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(txt)
        )
      );
      window._fbList = filtered;
      window._fbPage = 1;
      _renderFbPaged();
    }
    /* debounced version — replaces inline onkeyup after DOM ready */
    var _filterFeedbackDebounced = debounce(filterFeedbackAdmin, 280);
    document.addEventListener("DOMContentLoaded", function () {
      var fbSrch = document.getElementById("fbAdminSearch");
      if (fbSrch) {
        fbSrch.removeAttribute("onkeyup");
        fbSrch.addEventListener("input", _filterFeedbackDebounced);
      }
    });

    // N5: init() is async — a bare try/catch does NOT catch Promise rejections.
    // _showLoadingError() inside init() handles errors correctly; this .catch()
    // is a last-resort safety net for any unhandled rejection that escapes it.
    init().catch(function(e) { console.warn('init() unhandled rejection:', e); });

    /* FIX #4: Header always stays visible (sticky), scroll-hide removed */
    /* No scroll-hide for admin header — menu stays accessible always */

    /* ═══ FIX 3: BROADCAST SESSION REVOKE TO OTHER TABS on load ═══ */
    (function () {
      const s = JSON.parse(localStorage.getItem("session") || "null");
      if (s && s.userId) broadcastSessionRevoke(s.userId);
    })();

    /* ═══ FIX 5: MANUAL WALK-IN CONTRIBUTION (no user account) ═══ */
    function openWalkInContribution() {
      const months = MONTHS; // PERF: reuse global
      const curY = new Date().getFullYear();
      let yearOpts = "";
      for (let y = curY + 1; y >= 2023; y--) {
        let yLbl = y === curY ? y + " (Current)" : y < curY ? y + " (Old Entry)" : y + " (Advance)";
        yearOpts += `<option value="${y}"${y === curY ? " selected" : ""}>${yLbl}</option>`;
      }
      let monthOpts = months
        .map((m) => `<option value="${m}">${m}</option>`)
        .join("");
      let typeOpts = types
        .map(
          (t) =>
            `<option value="${t.TypeId}">${escapeHtml(t.TypeName)}</option>`
        )
        .join("");
      let occasionOpts =
        `<option value="">— None —</option>` +
        occasions
          .map(
            (o) =>
              `<option value="${o.OccasionId}">${escapeHtml(
                o.OccasionName
              )}</option>`
          )
          .join("");
      const wiPanelBody = document.getElementById("sp-walkin-body");
      if (!wiPanelBody) return;
      wiPanelBody.innerHTML = `
        <div style="background:#fff8e8;border:1px solid #f7a01a44;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#946c44;">
          <i class="fa-solid fa-circle-info"></i> Use this for donors who visit in person and do <b>not</b> have a registered account.
        </div>
        <div class="sp-field-group">
          <label class="sp-label">Donor Full Name <span class="sp-required">*</span></label>
          <input class="sp-input" id="wi_name" placeholder="e.g. Ramesh Kumar" />
        </div>
        <div class="sp-row2">
          <div class="sp-field-group">
            <label class="sp-label">Mobile <span class="sp-optional">(optional)</span></label>
            <input class="sp-input" id="wi_mobile" placeholder="e.g. 9876543210" maxlength="15" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Email <span class="sp-optional">(receipt if provided)</span></label>
            <input class="sp-input" id="wi_email" type="email" placeholder="donor@email.com" />
          </div>
        </div>
        <div class="sp-row2">
          <div class="sp-field-group">
            <label class="sp-label">Amount (₹) <span class="sp-required">*</span></label>
            <input class="sp-input" id="wi_amount" type="number" min="1" placeholder="Enter amount" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Year <span class="sp-required">*</span></label>
            <select class="sp-input" id="wi_year">${yearOpts}</select>
          </div>
        </div>
        <div class="sp-row2">
          <div class="sp-field-group">
            <label class="sp-label">Month</label>
            <select class="sp-input" id="wi_month"><option value="">— All / General —</option>${monthOpts}</select>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Type</label>
            <select class="sp-input" id="wi_type">${typeOpts}</select>
          </div>
        </div>
        <div class="sp-field-group">
          <label class="sp-label">Occasion</label>
          <select class="sp-input" id="wi_occasion">${occasionOpts}</select>
        </div>
        <div class="sp-field-group">
          <label class="sp-label">Note / Purpose <span class="sp-optional">(optional)</span></label>
          <input class="sp-input" id="wi_note" placeholder="e.g. Prasad, Pooja, Birthday" />
        </div>
        <div class="sp-actions">
          <button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="saveWalkIn()">
            <i class="fa-solid fa-check"></i> Save &amp; Get Receipt
          </button>
          <button class="sp-cancel-btn" onclick="spClose()">Cancel</button>
        </div>`;

      spOpen("walkin");
    }

    async function saveWalkIn() {
      const name = document.getElementById("wi_name").value.trim();
      const mobile = document.getElementById("wi_mobile").value.trim();
      const email = (document.getElementById("wi_email")?.value || "").trim();
      const amount = document.getElementById("wi_amount").value;
      const year = document.getElementById("wi_year").value;
      const month = document.getElementById("wi_month").value;
      const typeId = document.getElementById("wi_type").value;
      const occasionId = document.getElementById("wi_occasion").value;
      const note = document.getElementById("wi_note").value.trim();
      if (!name) return toast("Please enter donor name.", "error");
      if (!amount || Number(amount) <= 0) return toast("Please enter a valid amount.", "error");

      // Build options for inline editing in preview
      const MOS2 = MONTHS; // PERF: reuse global
      const monthOptsWI = `<option value="">— All / General —</option>` + MOS2.map(m=>`<option value="${m}"${m===month?" selected":""}>${m}</option>`).join("");
      const curY2 = new Date().getFullYear();
      let yearOptsWI = "";
      for (let y=curY2+1;y>=2023;y--) { let yLbl2=y===curY2?y+" (Current)":y<curY2?y+" (Old Entry)":y+" (Advance)"; yearOptsWI+=`<option value="${y}"${y===Number(year)?" selected":""}>${yLbl2}</option>`; }
      const typeOptsWI = types.map(t=>`<option value="${t.TypeId}"${String(t.TypeId)===typeId?" selected":""}>${escapeHtml(t.TypeName)}</option>`).join("");
      const occasionOptsWI = `<option value="">— None —</option>`+occasions.map(o=>`<option value="${o.OccasionId}"${String(o.OccasionId)===occasionId?" selected":""}>${escapeHtml(o.OccasionName)}</option>`).join("");
      const typeNameWI = types.find(t=>String(t.TypeId)===typeId)?.TypeName || "Contribution";

      const previewHtml = `
        <div class="_mhdr">
          <h3><i class="fa-solid fa-eye" style="color:#946c44;margin-right:8px;"></i> Preview Walk-in Entry</h3>
          <button class="_mcls" onclick="closeModal()">×</button>
        </div>
        <div class="_mbdy">
          <div style="background:linear-gradient(135deg,#fff8e8,#fef3cd);border:1.5px solid #f7a01a44;border-radius:12px;padding:12px 16px;margin-bottom:14px;font-size:12px;color:#946c44;">
            <i class="fa-solid fa-circle-info"></i> Review all details. <b>Edit any field inline</b> before confirming.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="_fl">Donor Full Name <span style="color:#e74c3c">*</span></label>
              <input class="_fi" id="wprev_name" value="${escapeHtml(name)}" placeholder="Donor name" style="margin-bottom:0;" />
            </div>
            <div>
              <label class="_fl">Mobile</label>
              <input class="_fi" id="wprev_mobile" value="${escapeHtml(mobile)}" placeholder="Mobile number" style="margin-bottom:0;" />
            </div>
            <div>
              <label class="_fl">Email <span style="font-size:10px;color:#888;font-weight:400;">(optional)</span></label>
              <input class="_fi" id="wprev_email" type="email" value="${escapeHtml(email)}" placeholder="donor@email.com" style="margin-bottom:0;" />
            </div>
            <div>
              <label class="_fl">Amount (₹) <span style="color:#e74c3c">*</span></label>
              <input class="_fi" id="wprev_amount" type="number" min="1" value="${escapeHtml(amount)}" style="margin-bottom:0;" />
            </div>
            <div>
              <label class="_fl">Month</label>
              <select class="_fi" id="wprev_month" style="margin-bottom:0;">${monthOptsWI}</select>
            </div>
            <div>
              <label class="_fl">Year</label>
              <select class="_fi" id="wprev_year" style="margin-bottom:0;">${yearOptsWI}</select>
            </div>
            <div>
              <label class="_fl">Type</label>
              <select class="_fi" id="wprev_type" style="margin-bottom:0;">${typeOptsWI}</select>
            </div>
            <div>
              <label class="_fl">Occasion</label>
              <select class="_fi" id="wprev_occasion" style="margin-bottom:0;">${occasionOptsWI}</select>
            </div>
          </div>
          <div style="margin-top:10px;">
            <label class="_fl">Note / Purpose</label>
            <input class="_fi" id="wprev_note" value="${escapeHtml(note)}" placeholder="e.g. Prasad, Pooja, Birthday" style="margin-bottom:0;" />
          </div>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 14px;margin-top:14px;font-size:12px;color:#15803d;">
            <i class="fa-solid fa-circle-check"></i> <b>Summary:</b>
            <span id="wprev_summary">${escapeHtml(name)} · ₹${Number(amount).toLocaleString(APP.locale||"en-IN")} · ${month||"General"} ${year} · ${typeNameWI}</span>
          </div>
        </div>
        <div class="_mft">
          <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal();openWalkInContribution()"><i class="fa-solid fa-arrow-left"></i> Back & Edit</button>
          <button class="_mbtn" id="wprev_submitBtn" style="background:#946c44;" onclick="_submitWalkInFromPreview()"><i class="fa-solid fa-check"></i> Confirm & Save</button>
        </div>`;
      // Show preview in the same slide panel (replace body content)
      const wiPrevBody = document.getElementById("sp-walkin-body");
      if (!wiPrevBody) { openModal(previewHtml, "560px"); return; }
      wiPrevBody.innerHTML = `
        <div style="background:linear-gradient(135deg,#fff8e8,#fef3cd);border:1.5px solid #f7a01a44;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#946c44;">
          <i class="fa-solid fa-circle-info"></i> Review all details. <b>Edit any field inline</b> before confirming.
        </div>
        <div class="sp-row2">
          <div class="sp-field-group">
            <label class="sp-label">Donor Full Name <span class="sp-required">*</span></label>
            <input class="sp-input" id="wprev_name" value="${escapeHtml(name)}" placeholder="Donor name" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Mobile</label>
            <input class="sp-input" id="wprev_mobile" value="${escapeHtml(mobile)}" placeholder="Mobile number" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Email <span class="sp-optional">(optional)</span></label>
            <input class="sp-input" id="wprev_email" type="email" value="${escapeHtml(email)}" placeholder="donor@email.com" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Amount (₹) <span class="sp-required">*</span></label>
            <input class="sp-input" id="wprev_amount" type="number" min="1" value="${escapeHtml(amount)}" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Month</label>
            <select class="sp-input" id="wprev_month">${monthOptsWI}</select>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Year</label>
            <select class="sp-input" id="wprev_year">${yearOptsWI}</select>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Type</label>
            <select class="sp-input" id="wprev_type">${typeOptsWI}</select>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Occasion</label>
            <select class="sp-input" id="wprev_occasion">${occasionOptsWI}</select>
          </div>
        </div>
        <div class="sp-field-group">
          <label class="sp-label">Note / Purpose</label>
          <input class="sp-input" id="wprev_note" value="${escapeHtml(note)}" placeholder="e.g. Prasad, Pooja, Birthday" />
        </div>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 14px;margin-top:4px;font-size:12px;color:#15803d;">
          <i class="fa-solid fa-circle-check"></i> <b>Summary:</b>
          <span id="wprev_summary">${escapeHtml(name)} · ₹${Number(amount).toLocaleString(APP.locale||"en-IN")} · ${month||"General"} ${year} · ${typeNameWI}</span>
        </div>
        <div class="sp-actions" style="margin-top:16px;">
          <button class="sp-save-btn" style="background:#b45309;color:#fff;" id="wprev_submitBtn" onclick="_submitWalkInFromPreview()">
            <i class="fa-solid fa-check"></i> Confirm &amp; Save
          </button>
          <button class="sp-cancel-btn" onclick="openWalkInContribution()">
            <i class="fa-solid fa-arrow-left"></i> Back
          </button>
        </div>`;
      spOpen("walkin");

      // Live summary updater — wire up after DOM is populated
      function _updateWISummary() {
        const nm = document.getElementById("wprev_name")?.value||"";
        const amt = document.getElementById("wprev_amount")?.value||"0";
        const mo = document.getElementById("wprev_month")?.value||"General";
        const yr = document.getElementById("wprev_year")?.value||"";
        const tid = document.getElementById("wprev_type")?.value;
        const tn = types.find(t=>String(t.TypeId)===tid)?.TypeName||"";
        const el = document.getElementById("wprev_summary");
        if (el) el.textContent = `${nm} · ₹${Number(amt).toLocaleString(APP.locale||"en-IN")} · ${mo} ${yr} · ${tn}`;
      }
      ["wprev_name","wprev_amount","wprev_month","wprev_year","wprev_type","wprev_occasion"].forEach(id=>{
        const el=document.getElementById(id);
        if(el) el.addEventListener("change",_updateWISummary);
        if(el&&el.tagName==="INPUT") el.addEventListener("input",_updateWISummary);
      });
    }

    var _walkInInFlight = false; // [DUP-FIX-3] guard: prevents double-submit on walk-in form
    async function _submitWalkInFromPreview() {
      // [DUP-FIX-3] Reject if already in flight — btn.disabled alone isn't enough on mobile fast-tap
      if (_walkInInFlight) return;
      _walkInInFlight = true;
      const btn = document.getElementById("wprev_submitBtn");
      if (btn) { btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; btn._noAutoLoad = true; }
      const name = (document.getElementById("wprev_name")?.value||"").trim();
      const mobile = (document.getElementById("wprev_mobile")?.value||"").trim();
      const email = (document.getElementById("wprev_email")?.value||"").trim();
      const amount = document.getElementById("wprev_amount")?.value;
      const year = document.getElementById("wprev_year")?.value;
      const month = document.getElementById("wprev_month")?.value;
      const typeId = document.getElementById("wprev_type")?.value;
      const occasionId = document.getElementById("wprev_occasion")?.value;
      const note = (document.getElementById("wprev_note")?.value||"").trim();
      if (!name) { _walkInInFlight=false; if(btn){btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm & Save';} return toast("Please enter donor name.", "error"); }
      if (!amount || Number(amount) <= 0) { _walkInInFlight=false; if(btn){btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm & Save';} return toast("Please enter a valid amount.", "error"); }
      // [ID] Send "WALKIN" as signal — backend generates WALKIN_YYYY_NNNNN (year-wise sequential)
      // [FIX-1] Also pass WalkInYear so backend uses the form's selected year (not server clock year)
      const walkInUserId = "WALKIN";
      try {
        let payload = {
          action: "addContribution",
          // [ID] FIX: No Id passed — backend generates CONT-NNNNN sequentially
          UserId: walkInUserId,
          WalkInYear: year,   // [FIX-1] Backend uses this year for WALKIN_YYYY_NNNNN
          Amount: amount,
          ForMonth: month || "General",
          Year: year,
          TypeId: typeId,
          OccasionId: occasionId,
          Note: (note ? note + " | " : "") + "Walk-in: " + name + (mobile ? " | " + mobile : ""),
        };
        if (email) payload.WalkInEmail = email;
        window._walkInFailedPayload = { payload, name, mobile, email, amount, month, year, typeId };
        let res = await postData(payload);
        if (res.status === "success") {
          _walkInInFlight = false;
          const rid = res.receiptId || ("TRX-wi" + Date.now());
          const tName = types.find(t => String(t.TypeId) === String(typeId));
          const typeLbl  = tName ? tName.TypeName : "Contribution";
          const monthLbl = month || "General";
          const emailNote = email
            ? (res.emailSent
                ? "Receipt emailed to " + escapeHtml(email) + "."
                : (res.emailSkipped ? "Email quota reached - email not sent." : ""))
            : "";

          // Show receipt card inside the walk-in slide panel
          const wiBody = document.getElementById("sp-walkin-body");
          if (wiBody) {
            wiBody.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;' +
              'justify-content:center;min-height:300px;text-align:center;padding:20px 16px 10px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);' +
                'border-radius:50%;display:flex;align-items:center;justify-content:center;' +
                'margin-bottom:16px;border:2px solid #6ee7b7;' +
                'animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
                  '<i class="fa-solid fa-circle-check" style="color:#16a34a;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:4px;">Walk-in Entry Saved!</div>' +
                '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">Entry recorded successfully</div>' +
              '</div>' +
              '<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;' +
              'padding:14px 16px;margin:0 4px 14px;font-size:12.5px;">' +
                '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px;text-align:left;">' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Receipt</span>' +
                  '<strong style="color:#15803d;font-size:13px;">' + escapeHtml(rid) + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Donor</span>' +
                  '<strong style="color:#1e293b;">' + escapeHtml(name) + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Amount</span>' +
                  '<strong style="color:#1e293b;">Rs.' + Number(amount).toLocaleString(APP.locale||"en-IN") + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Period</span>' +
                  '<strong style="color:#1e293b;">' + escapeHtml(monthLbl) + ' ' + escapeHtml(year || "") + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Type</span>' +
                  '<strong style="color:#1e293b;">' + escapeHtml(typeLbl) + '</strong>' +
                  (mobile ? '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Mobile</span>' +
                            '<strong style="color:#1e293b;">' + escapeHtml(mobile) + '</strong>' : '') +
                '</div>' +
                (emailNote ? '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;' +
                             'font-size:11.5px;color:#64748b;">' + emailNote + '</div>' : '') +
              '</div>' +
              '<div class="sp-actions">' +
                '<button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="openWalkInContribution()">' +
                  '<i class="fa-solid fa-plus"></i> Add Another' +
                '</button>' +
                '<button class="sp-cancel-btn" onclick="spClose()">' +
                  '<i class="fa-solid fa-xmark"></i> Close' +
                '</button>' +
              '</div>';
          }
          smartRefresh("contributions");
          if (res.emailSent) setTimeout(_refreshEmailQuotaUI, 800);
        } else {
          _walkInInFlight = false;
          const errMsg = res.message || "Something went wrong.";
          const wiBodyErr = document.getElementById("sp-walkin-body");
          if (wiBodyErr) {
            wiBodyErr.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                  '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
                '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;">' +
                '<button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="_retryWalkInFailed()">' +
                  '<i class="fa-solid fa-rotate-right"></i> Retry' +
                '</button>' +
                '<button class="sp-cancel-btn" onclick="spClose()">' +
                  '<i class="fa-solid fa-xmark"></i> Close' +
                '</button>' +
              '</div>';
          } else {
            toast("Failed: " + errMsg, "error");
            if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm & Save'; }
          }
        }
      } catch (e) {
        _walkInInFlight = false;
        const errMsg = e.message || "Network error.";
        const wiBodyCatch = document.getElementById("sp-walkin-body");
        if (wiBodyCatch) {
          wiBodyCatch.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
              '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
            '</div>' +
            '<div class="sp-actions" style="margin-top:auto;">' +
              '<button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="_retryWalkInFailed()">' +
                '<i class="fa-solid fa-rotate-right"></i> Retry' +
              '</button>' +
              '<button class="sp-cancel-btn" onclick="spClose()">' +
                '<i class="fa-solid fa-xmark"></i> Close' +
              '</button>' +
            '</div>';
        } else {
          toast(errMsg, "error");
          if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm & Save'; }
        }
      }
    }

    /* ── Retry failed walk-in using the exact same payload ── */
    async function _retryWalkInFailed() {
      const stored = window._walkInFailedPayload;
      if (!stored) return toast("No failed walk-in entry to retry.", "error");
      if (_walkInInFlight) return;
      _walkInInFlight = true;
      const wiBody = document.getElementById("sp-walkin-body");
      if (wiBody) {
        wiBody.innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
            '<i class="fa-solid fa-spinner fa-spin" style="font-size:2.5rem;color:#334155;margin-bottom:18px;"></i>' +
            '<div style="font-size:16px;font-weight:600;color:#1e293b;">Retrying…</div>' +
            '<div style="font-size:12px;color:#64748b;margin-top:6px;">Please wait, do not close.</div>' +
          '</div>';
      }
      try {
        const res = await postData(stored.payload);
        _walkInInFlight = false;
        if (res.status === "success") {
          window._walkInFailedPayload = null;
          const rid = res.receiptId || ("TRX-wi" + Date.now());
          const tName = types.find(t => String(t.TypeId) === String(stored.typeId));
          const typeLbl = tName ? tName.TypeName : "Contribution";
          const monthLbl = stored.month || "General";
          const emailNote = stored.email
            ? (res.emailSent ? "Receipt emailed to " + escapeHtml(stored.email) + "."
                : (res.emailSkipped ? "Email quota reached - email not sent." : ""))
            : "";
          if (wiBody) {
            wiBody.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px 16px 10px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px;border:2px solid #6ee7b7;animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
                  '<i class="fa-solid fa-circle-check" style="color:#16a34a;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:4px;">Walk-in Entry Saved!</div>' +
                '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">Entry recorded successfully</div>' +
              '</div>' +
              '<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:0 4px 14px;font-size:12.5px;">' +
                '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px;text-align:left;">' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Receipt</span>' +
                  '<strong style="color:#15803d;font-size:13px;">' + escapeHtml(rid) + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Donor</span>' +
                  '<strong style="color:#1e293b;">' + escapeHtml(stored.name) + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Amount</span>' +
                  '<strong style="color:#1e293b;">Rs.' + Number(stored.amount).toLocaleString(APP.locale||"en-IN") + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Period</span>' +
                  '<strong style="color:#1e293b;">' + escapeHtml(monthLbl) + ' ' + escapeHtml(stored.year || "") + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Type</span>' +
                  '<strong style="color:#1e293b;">' + escapeHtml(typeLbl) + '</strong>' +
                  (stored.mobile ? '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Mobile</span><strong style="color:#1e293b;">' + escapeHtml(stored.mobile) + '</strong>' : '') +
                '</div>' +
                (emailNote ? '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:11.5px;color:#64748b;">' + emailNote + '</div>' : '') +
              '</div>' +
              '<div class="sp-actions">' +
                '<button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="openWalkInContribution()">' +
                  '<i class="fa-solid fa-plus"></i> Add Another' +
                '</button>' +
                '<button class="sp-cancel-btn" onclick="spClose()">' +
                  '<i class="fa-solid fa-xmark"></i> Close' +
                '</button>' +
              '</div>';
          }
          smartRefresh("contributions");
          if (res.emailSent) setTimeout(_refreshEmailQuotaUI, 800);
        } else {
          const errMsg = res.message || "Something went wrong.";
          if (wiBody) {
            wiBody.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                  '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
                '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;">' +
                '<button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="_retryWalkInFailed()">' +
                  '<i class="fa-solid fa-rotate-right"></i> Retry' +
                '</button>' +
                '<button class="sp-cancel-btn" onclick="spClose()">' +
                  '<i class="fa-solid fa-xmark"></i> Close' +
                '</button>' +
              '</div>';
          }
        }
      } catch(e) {
        _walkInInFlight = false;
        const errMsg = e.message || "Network error.";
        if (wiBody) {
          wiBody.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
              '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
            '</div>' +
            '<div class="sp-actions" style="margin-top:auto;">' +
              '<button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="_retryWalkInFailed()">' +
                '<i class="fa-solid fa-rotate-right"></i> Retry' +
              '</button>' +
              '<button class="sp-cancel-btn" onclick="spClose()">' +
                '<i class="fa-solid fa-xmark"></i> Close' +
              '</button>' +
            '</div>';
        }
      }
    }
    window._retryWalkInFailed = _retryWalkInFailed;

    /* ═══════════════════════════════════════════════════════
       IMPROVEMENT #6 — CONTRIBUTION TRACKER
       Shows paid vs pending members per type/month/year.
       Walk-in donors are excluded from pending (anonymous).
       ═══════════════════════════════════════════════════════ */
    function initTrackerDropdowns() {
      const MOS = MONTHS; // PERF: reuse global
      const now = new Date();

      // Type dropdown
      const trType = document.getElementById("tr_type");
      if (trType && trType.options.length <= 1) {
        types.forEach(t => {
          let o = document.createElement("option");
          o.value = t.TypeId; o.textContent = t.TypeName;
          trType.appendChild(o);
        });
      }

      // Month dropdown
      const trMonth = document.getElementById("tr_month");
      if (trMonth && trMonth.options.length === 0) {
        MOS.forEach((m, i) => {
          let o = document.createElement("option");
          o.value = m; o.textContent = m;
          if (i === now.getMonth()) o.selected = true;
          trMonth.appendChild(o);
        });
      }

      // Year dropdown
      const trYear = document.getElementById("tr_year");
      if (trYear && trYear.options.length === 0) {
        let years = new Set();
        data.forEach(c => { let y = Number(c.Year); if (!isNaN(y) && y > 2000) years.add(y); });
        let cur = now.getFullYear();
        for (let y = 2023; y <= cur; y++) years.add(y);
        Array.from(years).sort((a, b) => b - a).forEach(y => {
          let o = document.createElement("option");
          o.value = y; o.textContent = y;
          if (y === cur) o.selected = true;
          trYear.appendChild(o);
        });
      }
    }

    /* ═══ ENHANCED runTracker() WITH TARGET + SHORTFALL ═════════════
 Drop-in replacement for the existing runTracker() function.
 Find runTracker() in admin.html and replace the entire function
 body with this one.
 ═══════════════════════════════════════════════════════════════ */
    function runTracker() {
      const trType = document.getElementById("tr_type");
      const trMonth = document.getElementById("tr_month");
      const trYear = document.getElementById("tr_year");
      if (!trType || !trMonth || !trYear) return;

      const selTypeId = trType.value;
      const selMonth = trMonth.value;
      const selYear = String(trYear.value);

      // All active non-admin members
      const members = users.filter(u =>
        u.Role !== "Admin" &&
        String(u.Status || "").toLowerCase() === "active"
      );

      // Contributions matching current filter
      let contribs = data.filter(c =>
        String(c.Year) === selYear &&
        c.ForMonth === selMonth &&
        !String(c.UserId).startsWith("WALKIN_")
      );
      if (selTypeId) contribs = contribs.filter(c => String(c.TypeId) === selTypeId);

      // Paid member IDs
      const paidUserIds = new Set(contribs.map(c => String(c.UserId)));

      const paidMembers = members.filter(u => paidUserIds.has(String(u.UserId)));
      const pendingMembers = members.filter(u => !paidUserIds.has(String(u.UserId)));
      const paidAmt = contribs.reduce((s, c) => s + Number(c.Amount || 0), 0);
      const pctComplete = members.length > 0
        ? Math.round((paidMembers.length / members.length) * 100) : 0;

      // ── Target calculations
      // Total expected = sum of MonthlyTarget for all members who have one set
      const totalExpected = members.reduce((s, u) => s + Number(u.MonthlyTarget || 0), 0);
      const totalShortfall = Math.max(0, totalExpected - paidAmt);
      const hasAnyTarget = members.some(u => Number(u.MonthlyTarget || 0) > 0);

      // ── Update existing badges
      document.getElementById("tr_summary").style.display = "flex";
      document.getElementById("tr_paid_count").innerText = paidMembers.length;
      document.getElementById("tr_paid_amt").innerText = "₹" + fmt(paidAmt);
      document.getElementById("tr_pending_count").innerText = pendingMembers.length;
      document.getElementById("tr_pending_pct").innerText = pctComplete + "% complete";
      document.getElementById("tr_total_members").innerText = members.length;

      // ── Add / update target summary badges (only if any target is set)
      let tgtBadgeWrap = document.getElementById("tr_target_badges");
      if (hasAnyTarget) {
        if (!tgtBadgeWrap) {
          tgtBadgeWrap = document.createElement("div");
          tgtBadgeWrap.id = "tr_target_badges";
          tgtBadgeWrap.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;";
          // Insert after tr_summary
          const summary = document.getElementById("tr_summary");
          if (summary && summary.parentNode) {
            summary.parentNode.insertBefore(tgtBadgeWrap, summary.nextSibling);
          }
        }
        tgtBadgeWrap.style.display = "flex";
        tgtBadgeWrap.innerHTML =
          `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 20px;text-align:center;min-width:120px;">
        <div style="font-size:1.4rem;font-weight:700;color:#2563eb;">${APP.currency||"₹"}${fmt(totalExpected)}</div>
        <div style="font-size:11px;color:#1d4ed8;font-weight:600;">🎯 Expected Total</div>
        <div style="font-size:11px;color:#3b82f6;">${members.filter(u => Number(u.MonthlyTarget || 0) > 0).length} members with target</div>
      </div>` +
          (totalShortfall > 0
            ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 20px;text-align:center;min-width:120px;">
            <div style="font-size:1.4rem;font-weight:700;color:#ea580c;">${APP.currency||"₹"}${fmt(totalShortfall)}</div>
            <div style="font-size:11px;color:#c2410c;font-weight:600;">⚠ Total Shortfall</div>
            <div style="font-size:11px;color:#ea580c;">vs expected this month</div>
          </div>`
            : `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 20px;text-align:center;min-width:120px;">
            <div style="font-size:1.4rem;font-weight:700;color:#16a34a;">₹0</div>
            <div style="font-size:11px;color:#166534;font-weight:600;">✅ No Shortfall</div>
            <div style="font-size:11px;color:#22c55e;">Target met or exceeded</div>
          </div>`
          );
      } else if (tgtBadgeWrap) {
        tgtBadgeWrap.style.display = "none";
      }

      const pw = document.getElementById("tr_progress_wrap");
      if (pw) pw.style.display = "block";

      // ── Render PAID list (with target comparison)
      const paidList = document.getElementById("tr_paid_list");
      paidList.innerHTML = paidMembers.length === 0
        ? '<div style="padding:20px;text-align:center;color:#aaa;font-size:12px;"><i class="fa-solid fa-inbox" style="font-size:1.5rem;display:block;margin-bottom:6px;"></i>No paid members</div>'
        : paidMembers.map(function (u, i) {
          const userContribs = contribs.filter(c => String(c.UserId) === String(u.UserId));
          const paid = userContribs.reduce((s, c) => s + Number(c.Amount || 0), 0);
          const target = Number(u.MonthlyTarget || 0);
          const metTarget = target > 0 && paid >= target;
          const underTarget = target > 0 && paid < target;

          // Badge: show "₹paid / ₹target" if under target, else just "₹paid"
          const badgeText = underTarget
            ? `${APP.currency||"₹"}${fmt(paid)} / ${APP.currency||"₹"}${fmt(target)}`
            : `${APP.currency||"₹"}${fmt(paid)}`;
          const badgeBg = underTarget
            ? "linear-gradient(135deg,#fff7ed,#fed7aa)"
            : "linear-gradient(135deg,#dcfce7,#bbf7d0)";
          const badgeColor = underTarget ? "#c2410c" : "#15803d";

          // Small target-met tick
          const targetTick = metTarget
            ? `<span style="font-size:10px;color:#16a34a;margin-left:4px;" title="Target met">🎯</span>`
            : "";

          return `<div class="tr-member-row" style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;border-bottom:1px solid #f0fdf4;font-size:12.5px;gap:8px;min-height:48px;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#dcfce7,#bbf7d0);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#16a34a;flex-shrink:0;">${i + 1}</div>
            <div style="min-width:0;">
              <div style="font-weight:600;color:#166534;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${escapeHtml(u.Name || "—")}${targetTick}
              </div>
              <div style="color:#94a3b8;font-size:10.5px;">${escapeHtml(u.Mobile || "")}</div>
            </div>
          </div>
          <span style="background:${badgeBg};color:${badgeColor};padding:4px 10px;border-radius:20px;font-weight:700;font-size:11px;white-space:nowrap;flex-shrink:0;">${badgeText}</span>
        </div>`;
        }).join("");

      // ── Render PENDING list (with shortfall)
      const pendingList = document.getElementById("tr_pending_list");
      pendingList.innerHTML = pendingMembers.length === 0
        ? '<div style="padding:20px;text-align:center;color:#aaa;font-size:12px;"><i class="fa-solid fa-party-horn" style="font-size:1.5rem;display:block;margin-bottom:6px;color:#22c55e;"></i>🎉 All members have paid!</div>'
        : pendingMembers.map(function (u, i) {
          const target = Number(u.MonthlyTarget || 0);
          const shortfall = target > 0 ? target : 0;

          const badgeText = shortfall > 0 ? `${APP.currency||"₹"}${fmt(shortfall)} due` : "Pending";
          const badgeBg = shortfall > 0
            ? "linear-gradient(135deg,#fff7ed,#fed7aa)"
            : "linear-gradient(135deg,#fee2e2,#fecaca)";
          const badgeColor = shortfall > 0 ? "#c2410c" : "#dc2626";

          return `<div class="tr-member-row" style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;border-bottom:1px solid #fef2f2;font-size:12.5px;gap:8px;min-height:48px;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#fee2e2,#fecaca);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#dc2626;flex-shrink:0;">${i + 1}</div>
            <div style="min-width:0;">
              <div style="font-weight:600;color:#991b1b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(u.Name || "—")}</div>
              <div style="color:#94a3b8;font-size:10.5px;">${escapeHtml(u.Mobile || "")}</div>
            </div>
          </div>
          <span style="background:${badgeBg};color:${badgeColor};padding:4px 10px;border-radius:20px;font-weight:700;font-size:11px;white-space:nowrap;flex-shrink:0;">${badgeText}</span>
        </div>`;
        }).join("");

      document.getElementById("tr_empty").style.display = "none";

      // Progress bar — unchanged
      let pbEl = document.getElementById("tr_progress_bar");
      if (pbEl) {
        pbEl.style.width = pctComplete + "%";
        pbEl.style.background = pctComplete >= 100 ? "#16a34a" : pctComplete >= 60 ? "#f7a01a" : "#dc2626";
      }

      // Store state for WhatsApp send functions — unchanged
      window._trackerState = {
        selTypeId, selMonth, selYear,
        paidMembers, pendingMembers, paidAmt, pctComplete
      };
    }

    function sendTrackerMsg(which) {
      const state = window._trackerState;
      if (!state) { toast("Run the filter first.", "warn"); return; }

      const typeName = (() => {
        if (!state.selTypeId) return "All Types";
        const t = types.find(t => String(t.TypeId) === state.selTypeId);
        return t ? t.TypeName : "—";
      })();

      let msg;
      if (which === "paid") {
        msg =
          `${APP.symbol} *${APP.name}*\n📍 ${APP.location}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `✅ *PAID MEMBERS REPORT*\n` +
          `📅 ${state.selMonth} ${state.selYear} | 🏷️ ${typeName}\n\n` +
          state.paidMembers.map((u, i) => `${i + 1}. ${u.Name}`).join("\n") +
          `\n\n💰 Total Collected: ${APP.currency||"₹"}${fmt(state.paidAmt)}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n_${APP.tagline}_`;
      } else {
        msg =
          `${APP.symbol} *${APP.name}*\n📍 ${APP.location}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ *CONTRIBUTION REMINDER*\n` +
          `📅 ${state.selMonth} ${state.selYear} | 🏷️ ${typeName}\n\n` +
          `The following members have not yet submitted their contribution:\n\n` +
          state.pendingMembers.map((u, i) => `${i + 1}. ${u.Name} — ${u.Mobile || "—"}`).join("\n") +
          `\n\n📊 Completion: ${state.pctComplete}% (${state.paidMembers.length}/${state.paidMembers.length + state.pendingMembers.length})\n` +
          `━━━━━━━━━━━━━━━━━━━━\n_Please submit at your earliest. ${APP.tagline}_`;
      }
      window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
    }

    // ══ EMAIL AUTOMATION JS ══
    function loadEmailSettings() {
      // Show spinner immediately so toggles are visibly "loading"
      ["ea_receipt_status", "ea_monthly_status"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = "<span style='color:#94a3b8;'>Loading status...</span>";
      });

      getCached("getEmailSettings").then(function (s) {
        // FIX: use strict === true (Apps Script now returns proper booleans)
        var receiptOn  = s === true || (s && s.auto_receipt    === true);
        var monthlyOn  = s === true || (s && s.monthly_report  === true);
        var birthdayOn = s && s.birthday_email === true;
        var tReceipt  = document.getElementById("toggle_auto_receipt");
        var tMonthly  = document.getElementById("toggle_monthly_report");
        var tBirthday = document.getElementById("toggle_birthday_email");
        if (tReceipt)  { tReceipt.checked  = receiptOn;  tReceipt.disabled  = false; }
        if (tMonthly)  { tMonthly.checked  = monthlyOn;  tMonthly.disabled  = false; }
        if (tBirthday) { tBirthday.checked = birthdayOn; tBirthday.disabled = false; }
        _updateToggleStatus("auto_receipt",   receiptOn);
        _updateToggleStatus("monthly_report", monthlyOn);
        _updateToggleStatus("birthday_email", birthdayOn);
        _updateCardStyle("ea_card_receipt",  receiptOn);
        _updateCardStyle("ea_card_monthly",  monthlyOn);
        _updateCardStyle("ea_card_birthday", birthdayOn);
        // logo_email_url removed from settings — logo now auto-loaded from CFG.folderLogo
        // Load live preview: call getLogoPreview action on Apps Script
        _loadEmailLogoPreview();
        if (!s || typeof s !== "object") {
          var el = document.getElementById("ea_quota_display");
          if (el) el.innerHTML = "<span style='color:#f87171;'>Could not load settings — check Apps Script deployment &amp; redeploy</span>";
        }
      }).catch(function () {
        // Fetch failed — show OFF state, re-enable toggles
        ["toggle_auto_receipt", "toggle_monthly_report", "toggle_birthday_email"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) { el.checked = false; el.disabled = false; }
        });
        _updateToggleStatus("auto_receipt",   false);
        _updateToggleStatus("monthly_report", false);
        _updateToggleStatus("birthday_email", false);
        var el = document.getElementById("ea_quota_display");
        if (el) el.innerHTML = "<span style='color:#f87171;'>Cannot reach server — check Apps Script deployment</span>";
      });

      // Load quota
      getEmailQuotaCached().then(function (q) {
        var el = document.getElementById("ea_quota_display");
        if (el && q && q.limit) {
          var pct = Math.round((q.used / q.limit) * 100);
          var col = pct > 80 ? "#f87171" : pct > 50 ? "#fbbf24" : "#34d399";
          el.innerHTML = "<strong style='color:" + col + ";'>" + q.used + "</strong> used of <strong>" + q.limit + "</strong> today &nbsp;&middot;&nbsp; <strong style='color:#34d399;'>" + q.remaining + " remaining</strong>";
        }
      }).catch(function () { });
    }

    // Extract a bare Drive File ID from whatever the admin pastes:
    // Accepts: bare ID, https://drive.google.com/file/d/ID/view, https://drive.google.com/open?id=ID
    // ── Email logo live preview — fetches the logo the server will use in emails
    // Calls getPhotoBase64 with action=getEmailLogoPreview so it reads CFG.folderLogo
    // and returns the first image found. Shows it in the admin card instantly.
    function _loadEmailLogoPreview() {
      var statusEl = document.getElementById("ea_logo_status_text");
      var img      = document.getElementById("ea_logo_preview_img");
      var fallback = document.getElementById("ea_logo_fallback");
      if (statusEl) statusEl.textContent = "Loading logo from Drive folder…";
      postData({ action: "getEmailLogoPreview" })
        .then(function (res) {
          if (res && res.status === "success" && res.base64) {
            if (img) {
              img.src = res.base64;
              img.style.display = "block";
            }
            if (fallback) fallback.style.display = "none";
            if (statusEl) statusEl.innerHTML = "✅ <strong>Logo found</strong> — used in all emails";
          } else {
            // No image in folder — Om symbol shows by default via CSS
            if (img) img.style.display = "none";
            if (fallback) fallback.style.display = "block";
            if (statusEl) statusEl.innerHTML =
              "🕉️ <span style='color:#64748b;'>No logo image found in folder — Om symbol used as fallback.<br>" +
              "Add a logo.png to your Drive <strong>Logo folder</strong> (<code>CFG.folderLogo</code>) to use a custom logo.</span>";
          }
        }).catch(function () {
          if (statusEl) statusEl.innerHTML = "<span style='color:#f87171;'>❌ Could not reach server — check Apps Script deployment.</span>";
        });
    }
    function _updateToggleStatus(key, isOn) {
      var statusMap = {
        "auto_receipt":   "ea_receipt_status",
        "monthly_report": "ea_monthly_status",
        "birthday_email": "ea_birthday_status"
      };
      var el = document.getElementById(statusMap[key]);
      if (!el) return;
      var dot = isOn
        ? "<span style='display:inline-block;width:10px;height:10px;border-radius:50%;background:#10b981;margin-right:5px;vertical-align:middle;'></span>"
        : "<span style='display:inline-block;width:10px;height:10px;border-radius:50%;background:#94a3b8;margin-right:5px;vertical-align:middle;'></span>";
      var label = isOn
        ? "<strong style='color:#059669;'>Active</strong> — emails will be sent automatically"
        : "<strong style='color:#94a3b8;'>Inactive</strong> — no automatic emails";
      el.innerHTML = dot + label;
    }

    function _updateCardStyle(cardId, isOn) {
      const card = document.getElementById(cardId);
      if (!card) return;
      card.style.borderColor = isOn ? "#6ee7b7" : "#e2e8f0";
      card.style.background = isOn ? "#f0fdf9" : "#fff";
    }

    function saveEmailToggle(key, value) {
      // Show saving indicator
      var cardMap = { "auto_receipt": "ea_card_receipt", "monthly_report": "ea_card_monthly", "birthday_email": "ea_card_birthday" };
      var labelMap = { "auto_receipt": "Auto Receipt Email", "monthly_report": "Monthly Report", "birthday_email": "Birthday Email" };
      const cardId = cardMap[key] || "ea_card_receipt";
      const card = document.getElementById(cardId);
      if (card) card.style.opacity = "0.6";

      postData({ action: "saveEmailSettings", key: key, value: value ? "1" : "0" })
        .then(function (res) {
          if (card) card.style.opacity = "1";
          if (res && res.status === "ok") {
            toast(value ? "✅ " + (labelMap[key] || key) + " enabled" : "⭕ Disabled", "");
            _updateToggleStatus(key, value);
            _updateCardStyle(cardMap[key] || cardId, value);
            // FIX-14: bust settings cache so next loadEmailSettings() reads fresh state
            if (typeof mandirCacheBust === "function") mandirCacheBust("getEmailSettings");
            // Refresh quota counter — enabling auto-receipt can affect quota estimate
            setTimeout(_refreshEmailQuotaUI, 600);
          } else {
            toast("❌ Save failed — check Apps Script deployment", "error");
            const el = document.getElementById("toggle_" + key);
            if (el) el.checked = !value;
          }
        })
        .catch(function () {
          if (card) card.style.opacity = "1";
          toast("❌ Network error saving setting", "error");
          const el = document.getElementById("toggle_" + key);
          if (el) el.checked = !value;
        });
    }

    function initEmailAutoPage() {
      // Populate month/year dropdowns for manual send
      const now = new Date();
      const mSel = document.getElementById("ea_test_month");
      const ySel = document.getElementById("ea_test_year");
      if (mSel && mSel.options.length === 0) {
        MONTHS.forEach((m, i) => {
          const o = document.createElement("option");
          o.value = m; o.textContent = m;
          if (i === now.getMonth()) o.selected = true;
          mSel.appendChild(o);
        });
      }
      if (ySel && ySel.options.length === 0) {
        const cur = now.getFullYear();
        for (let y = cur; y >= cur - 2; y--) {
          const o = document.createElement("option");
          o.value = y; o.textContent = y;
          if (y === cur) o.selected = true;
          ySel.appendChild(o);
        }
      }
      loadEmailSettings();
      // Populate birthday user dropdown
      var bSel = document.getElementById("ea_birthday_user");
      if (bSel && bSel.options.length <= 1) {
        var members = (typeof users !== "undefined" ? users : []).filter(function(u) {
          return String(u.Role||"").toLowerCase() !== "admin" &&
                 String(u.Status||"Active").toLowerCase() === "active";
        });
        members.sort(function(a,b){ return (a.Name||"").localeCompare(b.Name||""); });
        members.forEach(function(u) {
          var o = document.createElement("option");
          o.value = u.UserId;
          o.textContent = (u.Name||"Unknown") + (u.DOB ? " 🎂" : " (no DOB)") + (u.Email ? "" : " — no email");
          if (!u.Email || !u.DOB) o.style.color = "#94a3b8";
          bSel.appendChild(o);
        });
      }
    }

    function triggerTestBirthdayEmail() {
      var userId = (document.getElementById("ea_birthday_user")||{}).value || "";
      var res = document.getElementById("ea_birthday_result");
      var btn = document.querySelector("[onclick='triggerTestBirthdayEmail()']");
      if (!userId) { toast("Please select a member first", "warn"); return; }
      if (res) { res.style.display = "block"; res.style.background = "#eff6ff"; res.style.borderLeftColor = "#3b82f6"; res.style.color = "#1e40af"; res.textContent = "⏳ Sending test birthday email..."; }
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...'; }
      postData({ action: "sendBirthdayEmails", isTest: "1", userId: userId })
        .then(function(data) {
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Test'; }
          var ok = data && (data.status === "success" || data.sent > 0);
          if (res) {
            res.style.background = ok ? "#f0fdf4" : "#fef2f2";
            res.style.borderLeftColor = ok ? "#22c55e" : "#ef4444";
            res.style.color = ok ? "#166534" : "#991b1b";
            res.textContent = data ? data.message : "❌ Unknown error";
          }
          if (ok) { toast("✅ Birthday test email sent!", ""); _refreshEmailQuotaUI(); }
          else toast("❌ Failed: " + (data&&data.message||"error"), "error");
        })
        .catch(function(err) {
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Test'; }
          if (res) { res.style.background = "#fef2f2"; res.style.borderLeftColor = "#ef4444"; res.style.color = "#991b1b"; res.textContent = "❌ Network error: " + err.message; }
          toast("❌ Network error", "error");
        });
    }

    function triggerManualMonthlyReport() {
      const month = document.getElementById("ea_test_month")?.value;
      const year = document.getElementById("ea_test_year")?.value;
      const mode = document.getElementById("ea_send_mode")?.value || "reminders_only";
      if (!month || !year) { toast("Select month and year", "warn"); return; }
      const res = document.getElementById("ea_manual_result");
      const btn = document.querySelector("[onclick='triggerManualMonthlyReport()']");

      // Disable button while running
      if (btn) { btn.disabled = true; btn.textContent = "⏳ Sending..."; }
      if (res) {
        res.style.display = "block";
        res.innerHTML = "⏳ Sending emails... this may take 1–3 minutes for large member lists. Please wait.";
        res.style.color = "#64748b";
      }

      // FIX: Google Apps Script CDN cuts off JSONP responses >30s.
      // Solution: fire-and-forget trigger, then poll getMonthlyReportStatus every 5s.
      // Apps Script stores result in PropertiesService; poll reads it when ready.
      const jobKey = "mreport_" + Date.now();
      let pollCount = 0;
      const MAX_POLLS = 36; // 36 × 5s = 3 minutes max wait

      // Step 1 — Fire the job (fire-and-forget, ignore response)
      (function () {
        const cbFire = "cb_mrf_" + Date.now();
        const script = document.createElement("script");
        window[cbFire] = function () { try { delete window[cbFire]; script.remove(); } catch (e) { } };
        script.onerror = function () { try { delete window[cbFire]; script.remove(); } catch (e) { } };
        const action = (mode === "reminders_only") ? "triggerMonthlyReminder" : "triggerMonthlyReport";
        script.src = API_URL + "?action=" + action + "&month=" + encodeURIComponent(month) +
          "&year=" + encodeURIComponent(year) + "&jobKey=" + encodeURIComponent(jobKey) + "&callback=" + cbFire;
        document.body.appendChild(script);
      })();

      // Step 2 — Poll every 5s for result
      function _pollResult() {
        pollCount++;
        const cbPoll = "cb_mrp_" + Date.now();
        const script = document.createElement("script");
        const timer = setTimeout(function () {
          try { delete window[cbPoll]; script.remove(); } catch (e) { }
          if (pollCount < MAX_POLLS) {
            setTimeout(_pollResult, 5000);
          } else {
            _reportDone(null, true);
          }
        }, 8000);
        window[cbPoll] = function (r) {
          clearTimeout(timer);
          try { delete window[cbPoll]; script.remove(); } catch (e) { }
          if (r && r.status === "ok") {
            _reportDone(r, false);
          } else if (r && r.status === "pending") {
            // Still running — keep polling
            if (pollCount < MAX_POLLS) setTimeout(_pollResult, 5000);
            else _reportDone(null, true);
          } else if (r && r.status === "error") {
            _reportDone(r, false);
          } else {
            // No result yet — keep polling
            if (pollCount < MAX_POLLS) setTimeout(_pollResult, 5000);
            else _reportDone(null, true);
          }
        };
        script.onerror = function () {
          clearTimeout(timer);
          try { delete window[cbPoll]; script.remove(); } catch (e) { }
          if (pollCount < MAX_POLLS) setTimeout(_pollResult, 5000);
          else _reportDone(null, true);
        };
        script.src = API_URL + "?action=getMonthlyReportStatus&jobKey=" + encodeURIComponent(jobKey) + "&callback=" + cbPoll;
        document.body.appendChild(script);
      }

      // FIX: bust quota cache and refresh sidebar + email auto page counters on success
      function _reportDone(r, timedOut) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Now';
        }
        if (!res) return;
        if (timedOut) {
          res.innerHTML = "⚠️ Still running in the background — check your Apps Script execution log. Emails may still be sent successfully.";
          res.style.color = "#92400e";
        } else if (r && r.status === "ok") {
          res.innerHTML = "✅ Done — sent to <strong>" + (r.sent || 0) + "</strong> members, skipped <strong>" + (r.skipped || 0) + "</strong>";
          res.style.color = "#065f46";
          // Bust quota cache and refresh sidebar + email auto page counters
          _refreshEmailQuotaUI();
        } else {
          res.innerHTML = "❌ Failed: " + (r && r.message ? r.message : "Unknown error. Check Apps Script logs.");
          res.style.color = "#991b1b";
        }
      }

      // Start polling after 8s (give the job time to start)
      setTimeout(_pollResult, 8000);
    }
    // showPage lazy-init hooks handled by DOMContentLoaded listener below

    /* ══════════════════════════════════════════════════════════════
   ADDON: PENDING USERS + CHATBOT SETTINGS
   ══════════════════════════════════════════════════════════════ */

    /* ── User filter state ── */
    var _userFilterStatus = "all";

    function filterUsers(status, tabEl) {
      window._userFilterStatus = status;
      document.querySelectorAll(".status-tab").forEach(t => t.classList.remove("active"));
      if (tabEl) tabEl.classList.add("active");
      renderUsers();
    }

    /* ── Update tab counts + sidebar badge ── */
    function updateUserTabCounts(users) {
      if (!users) return;
      const all = users.length;
      const pending = users.filter(u => String(u.Status || "Active").toLowerCase() === "pending").length;
      const approved = users.filter(u => String(u.Status || "Active").toLowerCase() === "active").length;
      const rejected = users.filter(u => String(u.Status || "Active").toLowerCase() === "rejected").length;
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl("ct_all", all); setEl("ct_pending", pending);
      setEl("ct_approved", approved); setEl("ct_rejected", rejected);
      // Sidebar badge
      const badge = document.getElementById("pendingBadge");
      if (badge) {
        badge.textContent = pending;
        badge.classList.toggle("show", pending > 0);
      }
    }

    /* ── Wrap existing renderUsers to support filtering ── */
    /* This function intercepts the existing render. Find your existing
       renderUsers (or whatever renders the users table) and add this call
       at the TOP of that function:
           if (applyUserFilter(users)) return;
       OR simply call updateUserTabCounts(_users) after data loads.
       The filterUsers() function already calls renderUsersTable()
       which should be your existing render function.
       Rename it renderUsersTable if it has a different name. */

    /* ── APPROVE USER ── */
    function approveUser(userId, userName) {
      const html = `
     <div class="_mhdr">
       <h3><i class="fa-solid fa-circle-check" style="color:#27ae60;"></i> Approve Registration</h3>
       <button class="_mcls" onclick="closeModal()">×</button>
     </div>
     <div class="_mbdy" style="text-align:center;padding:20px 16px 10px;">
       <div style="width:56px;height:56px;border-radius:50%;background:#eafaf1;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:26px;">✅</div>
       <p style="font-size:15px;color:#334155;font-weight:600;margin:0 0 6px;">${escapeHtml(userName)}</p>
       <p style="font-size:13px;color:#64748b;margin:0 0 20px;">This will activate their account and send an approval email with login details.</p>
       <div style="display:flex;gap:10px;justify-content:center;">
         <button class="_mbtn" style="background:#999;min-width:90px;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Cancel</button>
         <button class="_mbtn" style="background:#27ae60;min-width:120px;" id="_approveOkBtn"><i class="fa-solid fa-check"></i> Approve</button>
       </div>
     </div>`;
      openModal(html, "380px");
      setTimeout(() => {
        const btn = document.getElementById("_approveOkBtn");
        if (btn) btn.addEventListener("click", () => {
          if (btn._inFlight) return; // double-submit guard
          btn._inFlight = true;
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Approving...';
          closeModal();
          const s = JSON.parse(localStorage.getItem("session") || "{}");
          postData({ action: "approveUser", UserId: userId, AdminName: s.name || "Admin" })
            .then(res => {
              btn._inFlight = false;
              if (res && res.status === "success") {
                toast("✅ " + userName + " approved! Approval email sent.");
                setTimeout(() => { try { smartRefresh("users"); } catch (e) { } }, 300);
              } else {
                toast("❌ " + (res && res.message ? res.message : "Approval failed."), "error");
              }
            })
            .catch(err => { btn._inFlight = false; toast("❌ " + err.message, "error"); });
        });
      }, 50);
    }

    /* ── REJECT USER ── */
    function rejectUser(userId, userName) {
      // Build reason modal inline using existing modal system
      const html = `
     <div class="_mhdr"><h3><i class="fa-solid fa-circle-xmark"></i> Reject Registration</h3>
       <button class="_mcls" onclick="closeModal()">×</button></div>
     <div class="_mbdy">
       <p style="font-size:13px;color:#475569;margin:0 0 14px;">
         You are about to reject <strong>${escapeHtml(userName)}</strong>'s registration request.
         A rejection email will be sent.
       </p>
       <label class="_fl">Reason <span style="color:#aaa;font-weight:400;">(optional — shown in email)</span></label>
       <textarea class="_fi" id="rejectReason" placeholder="e.g. Could not verify identity. Please contact temple admin." rows="3"
         style="resize:vertical;min-height:70px;"></textarea>
     </div>
     <div class="_mft">
       <button class="_mbtn" style="background:#999;" onclick="closeModal()">
         <i class="fa-solid fa-xmark"></i> Cancel
       </button>
       <button class="_mbtn" style="background:#e74c3c;" onclick="confirmRejectUser('${escapeHtml(userId)}','${escapeHtml(userName)}')">
         <i class="fa-solid fa-circle-xmark"></i> Reject & Send Email
       </button>
     </div>`;
      openModal(html, "500px");
    }

    function confirmRejectUser(userId, userName) {
      const reason = (document.getElementById("rejectReason") || {}).value || "";
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      closeModal();
      postData({ action: "rejectUser", UserId: userId, Reason: reason, AdminName: s.name || "Admin" })
        .then(res => {
          if (res && res.status === "success") {
            toast("Registration for " + userName + " rejected. Email sent.", "warn");
            setTimeout(() => { try { smartRefresh("users"); } catch (e) { } }, 300);
          } else {
            toast("❌ " + (res && res.message ? res.message : "Rejection failed."), "error");
          }
        })
        .catch(err => toast("❌ " + err.message, "error"));
    }

    /* ── CHATBOT SETTINGS ── */
    function loadChatbotSettings() {
      const cbMsg = document.getElementById("cbotMsg");
      if (cbMsg) { cbMsg.textContent = "Loading..."; cbMsg.className = "msg-box"; }
      getCached("getChatbotConfig")
        .then(cfg => {
          if (!cfg) { if (cbMsg) { cbMsg.textContent = "Could not load settings."; cbMsg.className = "msg-box error"; } return; }
          const fields = [
            "welcome_en", "welcome_hi", "timings_en", "timings_hi",
            "location_en", "location_hi", "donate_en", "donate_hi",
            "bank_name", "bank_account", "bank_ifsc", "bank_branch",
            "upi_id", "contact_phone", "contact_email", "contact_whatsapp",
            "custom_q1_en", "custom_q1_hi", "custom_a1_en", "custom_a1_hi",
            "custom_q2_en", "custom_q2_hi", "custom_a2_en", "custom_a2_hi"
          ];
          fields.forEach(f => {
            const el = document.getElementById("cbot_" + f);
            if (el) el.value = (cfg[f] || "").replace(/\\n/g, "\n");
          });
          const tog = document.getElementById("cbot_enabled");
          // FIX: use ?? not || — "0" is falsy so ("0" || "1") = "1" wrongly shows toggle as ON
          if (tog) tog.checked = String(cfg.enabled ?? "1") !== "0";
          if (cbMsg) { cbMsg.textContent = ""; cbMsg.className = "msg-box"; }
        })
        .catch(err => {
          if (cbMsg) { cbMsg.textContent = "❌ " + err.message; cbMsg.className = "msg-box error"; }
        });
    }

    function saveChatbotSettings() {
      const cbMsg = document.getElementById("cbotMsg");
      const btn = document.querySelector('[onclick="saveChatbotSettings()"]');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }
      if (cbMsg) { cbMsg.textContent = ""; cbMsg.className = "msg-box"; }

      const fields = [
        "welcome_en", "welcome_hi", "timings_en", "timings_hi",
        "location_en", "location_hi", "donate_en", "donate_hi",
        "bank_name", "bank_account", "bank_ifsc", "bank_branch",
        "upi_id", "contact_phone", "contact_email", "contact_whatsapp",
        "custom_q1_en", "custom_q1_hi", "custom_a1_en", "custom_a1_hi",
        "custom_q2_en", "custom_q2_hi", "custom_a2_en", "custom_a2_hi"
      ];
      const data = { action: "saveChatbotConfig" };
      const togEl = document.getElementById("cbot_enabled");
      data["enabled"] = (togEl && togEl.checked) ? "1" : "0";
      fields.forEach(f => {
        const el = document.getElementById("cbot_" + f);
        if (el) data[f] = el.value.trim().replace(/\n/g, "\\n");
      });

      postData(data)
        .then(res => {
          if (res && res.status === "success") {
            toast("✅ Chatbot settings saved successfully!", "success");
            if (cbMsg) { cbMsg.textContent = "✓ Settings saved."; cbMsg.className = "msg-box success"; setTimeout(() => { cbMsg.textContent = ""; cbMsg.className = "msg-box"; }, 3000); }
            // FIX-5: Bust cache first so loadChatbotSettings always reads fresh data from server
            if (typeof mandirCacheBust === "function") mandirCacheBust("getChatbotConfig");
            if (typeof loadChatbotSettings === "function") setTimeout(loadChatbotSettings, 300);
          } else {
            toast("❌ " + (res && res.message ? res.message : "Save failed."), "error");
          }
        })
        .catch(err => toast("❌ " + err.message, "error"))
        .finally(() => {
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save All Settings'; }
        });
    }

    /* ── Hook showPage to auto-init lazy pages ── */
    document.addEventListener("DOMContentLoaded", function () {
      if (typeof showPage === "function") {
        var _spOrig = showPage;
        window.showPage = function (id, el) {
          _spOrig(id, el);
          if (id === "chatbotPage" && typeof loadChatbotSettings === "function")
            loadChatbotSettings();
          if (id === "trackerPage" && typeof initTrackerDropdowns === "function")
            setTimeout(initTrackerDropdowns, 100);
          if (id === "yearSummaryPage" && typeof loadYearSummary === "function")
            loadYearSummary();
          if (id === "emailAutoPage" && typeof initEmailAutoPage === "function")
            setTimeout(initEmailAutoPage, 100);
          if (id === "eventsPage" && typeof loadEvents === "function")
            loadEvents();
        };
      }
    });

// ════════════════════════════════════════════════════════════════
    //  ALL PRIORITY CHANGES — admin.html additions
    // ════════════════════════════════════════════════════════════════

    // ── M18: Show version in sidebar
    document.addEventListener("DOMContentLoaded", function () {
      const vEl = document.getElementById("sidebarVersion");
      if (vEl && typeof APP !== "undefined" && APP.version) {
        vEl.textContent = "v" + APP.version;
        vEl.title = "System version " + APP.version;
      }

      // ── H10: Local download reminder
      _checkLocalDownloadReminder();

      // ── L3: Keyboard shortcuts
      document.addEventListener("keydown", function (e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
        if (e.altKey) {
          if (e.key === "c" || e.key === "C") { e.preventDefault(); document.querySelector("[onclick*=\"showPage('contributionPage'\"]") && showPage("contributionPage", null); }
          if (e.key === "e" || e.key === "E") { e.preventDefault(); showPage("expensePage", null); }
          if (e.key === "u" || e.key === "U") { e.preventDefault(); showPage("usersPage", null); }
          if (e.key === "d" || e.key === "D") { e.preventDefault(); showPage("dashboardPage", null); }
          if (e.key === "?" || e.key === "/") { e.preventDefault(); _showShortcutHelp(); }
        }
      });

      // ── M15: Broadcast quota info — populate on page show
      // Hook into showPage for broadcastPage
      const _origShowPage = window.showPage;
      if (typeof _origShowPage === "function") {
        window.showPage = function (id, el) {
          _origShowPage(id, el);
          if (id === "broadcastPage") _loadBroadcastQuotaInfo();
          if (id === "healthCheckPage" && !window._hcRanOnce) { window._hcRanOnce = true; runHealthCheck(); }
          if (id === "healthCheckPage") { loadTrafficStats(); }
          if (id === "contributionRequestsPage") loadContributionRequests();
        };
      }
      // ── H14: Run silent health check ~3s after login (non-blocking, no spinner) ──
      setTimeout(function() {
        if (typeof _hcSilentLoginCheck === "function") _hcSilentLoginCheck();
      }, 3000);

      // FIX: Ensure _uniModal always renders above loadingOverlay (which can have
      // a high z-index in admin.css). Without this, approve/reject modals open
      // behind the overlay and appear invisible / unclickable.
      var modalZFix = document.createElement("style");
      modalZFix.textContent = "#_uniModal { z-index: 999990 !important; }";
      document.head.appendChild(modalZFix);
    });

    // ── L3: Shortcut help popup
    function _showShortcutHelp() {
      const html = `<div class="_mhdr"><h3><i class="fa-solid fa-keyboard"></i> Keyboard Shortcuts</h3><button class="_mcls" onclick="closeModal()">×</button></div>
  <div class="_mbdy" style="font-size:13px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px;color:#64748b;">Alt + C</td><td style="padding:8px;font-weight:600;">Contributions</td></tr>
      <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px;color:#64748b;">Alt + E</td><td style="padding:8px;font-weight:600;">Expenses</td></tr>
      <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px;color:#64748b;">Alt + U</td><td style="padding:8px;font-weight:600;">Users</td></tr>
      <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px;color:#64748b;">Alt + D</td><td style="padding:8px;font-weight:600;">Dashboard</td></tr>
      <tr><td style="padding:8px;color:#64748b;">Alt + ?</td><td style="padding:8px;font-weight:600;">This help</td></tr>
    </table>
  </div>
  <div class="_mft"><button class="_mbtn" style="background:#999;" onclick="closeModal()">Close</button></div>`;
      openModal(html, "380px");
    }

    // ════════════════════════════════════════════════════════════════
    // CONTRIBUTION REQUESTS — Admin view, approve, reject
    // ════════════════════════════════════════════════════════════════
    window._allRequests = [];

    async function loadContributionRequests() {
      const tbody = document.getElementById("reqTbody");
      if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#aaa;padding:24px;"><div class="spinner" style="margin:0 auto;width:24px;height:24px;"></div></td></tr>';
      try {
        // Bust first so the page-open fetch is always live, then use getCached for dedup
        mandirCacheBust("getContributionRequests");
        const res = await getCached("getContributionRequests");
        window._allRequests = Array.isArray(res) ? res : [];
        renderContributionRequests();
        _updateReqBadge();
      } catch (err) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#e74c3c;padding:24px;">Failed to load: ' + escapeHtml(err.message) + '</td></tr>';
      }
    }

    function _updateReqBadge() {
      const pending = (window._allRequests || []).filter(function (r) { return String(r.Status || "Pending") === "Pending"; }).length;
      ["reqBadge", "reqPageBadge"].forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = pending;
        if (id === "reqBadge") { el.classList.toggle("show", pending > 0); }
        else { el.style.display = pending > 0 ? "inline-block" : "none"; }
      });
    }

    function renderContributionRequests() {
      const tbody = document.getElementById("reqTbody");
      if (!tbody) return;
      const filterStatus = (document.getElementById("reqFilterStatus") || {}).value || "";
      const q = ((document.getElementById("reqFilterSearch") || {}).value || "").toLowerCase();

      let list = (window._allRequests || []).slice();
      if (filterStatus) list = list.filter(function (r) { return String(r.Status || "Pending") === filterStatus; });
      if (q) list = list.filter(function (r) {
        const u = (users || []).find(function (u) { return String(u.UserId) === String(r.UserId); });
        const name = u ? (u.Name || "").toLowerCase() : "";
        return name.includes(q) || String(r.Amount || "").includes(q) ||
          String(r.ForMonth || "").toLowerCase().includes(q) ||
          String(r.UtrRef || "").toLowerCase().includes(q);
      });

      window._reqList = list;
      window._reqListRendered = list;
      window._reqPage = 1;
      _renderReqPaged();
    }
    /* debounce text search; status select calls renderContributionRequests() directly (instant) */
    var _renderContribReqDebounced = debounce(renderContributionRequests, 280);
    document.addEventListener("DOMContentLoaded", function () {
      var reqSrch = document.getElementById("reqFilterSearch");
      if (reqSrch) {
        reqSrch.removeAttribute("onkeyup");
        reqSrch.addEventListener("input", _renderContribReqDebounced);
      }
    });

    function _gotoReqPage(p) {
      const total = Math.ceil((window._reqList || []).length / PAGE_SIZE);
      window._reqPage = Math.max(1, Math.min(p, total));
      _renderReqPaged();
    }

    function _renderReqPaged() {
      const tbody = document.getElementById("reqTbody");
      if (!tbody) return;
      const list = window._reqList || [];
      const page = window._reqPage || 1;
      const start = (page - 1) * PAGE_SIZE;
      const items = list.slice(start, start + PAGE_SIZE);
      const total = Math.ceil(list.length / PAGE_SIZE);

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:36px 20px;"><div style="font-size:2rem;margin-bottom:8px;">📭</div><div style="font-weight:600;color:#334155;font-size:14px;margin-bottom:4px;">No requests found</div><div style="color:#94a3b8;font-size:12px;">Member contribution requests will appear here once submitted</div></td></tr>';
        _buildPagination("req_pagination", 1, 0, "_gotoReqPage");
        return;
      }

      const statusColor = { Pending: "#92400e", Approved: "#14532d", Rejected: "#7f1d1d" };
      const statusBg = { Pending: "#fef3c7", Approved: "#dcfce7", Rejected: "#fee2e2" };

      tbody.innerHTML = items.map(function (r, idx) {
        const i = start + idx;
        const u = (users || []).find(function (u) { return String(u.UserId) === String(r.UserId); });
        const name = u ? escapeHtml(u.Name || "Unknown") : "Unknown";
        const mobile = u ? escapeHtml(u.Mobile || "") : "";
        const st = String(r.Status || "Pending");
        const slipHtml = r.SlipURL
          ? '<a href="' + escapeHtml(r.SlipURL) + '" target="_blank" style="color:#3b82f6;font-size:11px;text-decoration:none;"><i class="fa-solid fa-image"></i> View</a>'
          : '<span style="color:#aaa;font-size:11px;">—</span>';
        const rejNote = r.RejectionNote ? '<br><span style="font-size:10px;color:#ef4444;">Reason: ' + escapeHtml(r.RejectionNote) + '</span>' : "";
        const _safeReqId = String(r.ReqId).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        const actBtns = st === "Pending"
          ? '<button onclick="_approveContribRequest(\'' + _safeReqId + '\')" style="background:#22c55e;padding:5px 10px;font-size:11px;border-radius:6px;margin-right:4px;"><i class="fa-solid fa-check"></i> Approve</button>'
          + '<button onclick="_rejectContribRequest(\'' + _safeReqId + '\')" style="background:#ef4444;padding:5px 10px;font-size:11px;border-radius:6px;"><i class="fa-solid fa-xmark"></i> Reject</button>'
          : '<span style="font-size:11px;color:#94a3b8;">' + st + '</span>';
        return '<tr>'
          + '<td>' + (i + 1) + '</td>'
          + '<td><strong>' + name + '</strong><br><span style="font-size:11px;color:#94a3b8;">' + mobile + '</span></td>'
          + '<td><strong style="color:#15803d;">' + (APP.currency||'₹') + fmt(r.Amount) + '</strong></td>'
          + '<td>' + escapeHtml(r.ForMonth || "") + ' ' + escapeHtml(String(r.Year || "")) + '</td>'
          + '<td>' + escapeHtml(r.PaymentMode || "UPI") + '</td>'
          + '<td style="font-size:12px;font-family:monospace;">' + escapeHtml(r.UtrRef || "—") + '</td>'
          + '<td>' + slipHtml + '</td>'
          + '<td><span style="background:' + (statusBg[st] || "#f1f5f9") + ';color:' + (statusColor[st] || "#334155") + ';padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">' + st + '</span>' + rejNote + '</td>'
          + '<td style="font-size:11px;color:#64748b;">' + escapeHtml(formatPaymentDate(r.RequestedAt || "").split(" ")[0] || "") + '</td>'
          + '<td style="white-space:nowrap;">' + actBtns + '</td>'
          + '</tr>';
      }).join("");
      _buildPagination("req_pagination", page, total, "_gotoReqPage");
    }

    function _approveContribRequest(reqId) {
      // FIX: Search _allRequests (full unfiltered list) instead of _reqListRendered
      // (which could be an empty/stale filtered subset), causing silent no-op on button click.
      const r = (window._allRequests || []).find(function(x) { return String(x.ReqId) === String(reqId); });
      if (!r) { toast("Request not found. Please refresh the page.", "error"); return; }
      // FIX: Guard against types not loaded yet — dropdown would be empty and
      // the admin would be stuck unable to select a type or proceed.
      if (!types || types.length === 0) {
        toast("Contribution types not loaded yet. Please wait a moment and try again.", "warn");
        return;
      }
      const u = (users || []).find(function (u) { return String(u.UserId) === String(r.UserId); });
      const name = u ? u.Name : "this member";
      const typeOpts = (types || []).map(function (t) {
        return '<option value="' + escapeHtml(String(t.TypeId || "")) + '">' + escapeHtml(t.TypeName || "") + '</option>';
      }).join("");
      const html = '<div class="_mhdr"><h3><i class="fa-solid fa-circle-check" style="color:#22c55e;"></i> Approve Request</h3><button class="_mcls" onclick="closeModal()">×</button></div>'
        + '<div class="_mbdy" style="padding:18px 20px;">'
        + '<p style="margin:0 0 14px;font-size:14px;color:#334155;">Approve contribution request from <strong>' + escapeHtml(name) + '</strong>?</p>'
        + '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px 16px;margin-bottom:14px;font-size:13px;">'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;">'
        + '<span style="color:#64748b;">Amount</span><strong>' + (APP.currency||'₹') + fmt(r.Amount) + '</strong>'
        + '<span style="color:#64748b;">Month</span><strong>' + escapeHtml(r.ForMonth || "") + ' ' + (r.Year || "") + '</strong>'
        + '<span style="color:#64748b;">Mode</span><strong>' + escapeHtml(r.PaymentMode || "UPI") + '</strong>'
        + '<span style="color:#64748b;">UTR / Ref</span><strong>' + escapeHtml(r.UtrRef || "—") + '</strong>'
        + '</div></div>'
        + '<div style="margin-bottom:14px;">'
        + '<label style="font-size:13px;font-weight:600;color:#334155;display:block;margin-bottom:6px;"><i class="fa-solid fa-tag" style="color:#f7a01a;margin-right:4px;"></i> Contribution Type <span style="font-weight:400;color:#e74c3c;">*</span></label>'
        + '<select id="_approveTypeSelect" style="width:100%;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;outline:none;">'
        + '<option value="">— Select Type —</option>' + typeOpts + '</select>'
        + '</div>'
        + '<p style="font-size:12px;color:#64748b;margin:0;">This will record a contribution entry and send a receipt email if auto-receipt is enabled.</p>'
        + '</div>'
        + '<div class="_mft"><button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()">Cancel</button>'
        + '<button class="_mbtn" style="background:#22c55e;" id="_approveReqBtn"><i class="fa-solid fa-check"></i> Approve &amp; Record</button></div>';
      openModal(html, "460px");
      setTimeout(function () {
        const btn = document.getElementById("_approveReqBtn");
        if (btn) btn.addEventListener("click", async function () {
          if (btn._inFlight) return; // double-submit guard
          const selTypeId = (document.getElementById("_approveTypeSelect") || {}).value || "";
          if (!selTypeId) { toast("Please select a contribution type.", "warn"); return; }
          // Keep modal open — show spinner until processing finishes
          btn._inFlight = true;
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Approving...';
          var cancelBtn = btn.parentElement ? btn.parentElement.querySelector("button:not(#_approveReqBtn)") : null;
          if (cancelBtn) cancelBtn.disabled = true;
          await _doApproveContribRequest(r, selTypeId, btn, cancelBtn);
        });
      }, 150);
    }

    async function _doApproveContribRequest(r, selTypeId, _btn, _cancelBtn) {
      if (!checkSession()) {
        // Re-enable buttons if session check fails
        if (_btn) { _btn._inFlight = false; _btn.disabled = false; _btn.innerHTML = '<i class="fa-solid fa-check"></i> Approve &amp; Record'; }
        if (_cancelBtn) _cancelBtn.disabled = false;
        return;
      }
      if (window._approveReqInFlight) return; // double-submit guard
      window._approveReqInFlight = true;
      const s = JSON.parse(localStorage.getItem("session") || "{}");

      function _resetApproveBtn() {
        if (_btn) { _btn._inFlight = false; _btn.disabled = false; _btn.innerHTML = '<i class="fa-solid fa-check"></i> Approve &amp; Record'; }
        if (_cancelBtn) _cancelBtn.disabled = false;
        window._approveReqInFlight = false;
      }

      try {
        const contribRes = await postData({
          action: "addContribution",
          // [ID] FIX: Do NOT pass Id — backend generates CONT-NNNNN sequentially.
          // Previously "REQ_" + r.ReqId was passed, bypassing sequential ID generation
          // and causing duplicate/malformed IDs like REQ_REQ-00001.
          UserId: r.UserId,
          Amount: r.Amount,
          ForMonth: r.ForMonth,
          Year: r.Year || new Date().getFullYear(),
          TypeId: selTypeId || r.TypeId || "",
          OccasionId: r.OccasionId || "",
          Note: (r.Note ? r.Note + " " : "") + "[Approved Request: " + (r.ReqId || "") + "]",
          PaymentMode: r.PaymentMode || "UPI",
        });
        if (!contribRes || contribRes.status !== "success") {
          toast("Failed to record contribution.", "error");
          _resetApproveBtn();
          return;
        }
        let resolveRes;
        try {
          resolveRes = await postData({
            action: "resolveContributionRequest",
            ReqId: r.ReqId,
            Status: "Approved",
            AdminName: s.Name || s.name || "Admin",
            RejectionNote: ""
          });
        } catch (resolveErr) {
          // FIX: addContribution already succeeded — warn admin rather than silently failing.
          // The contribution is recorded but the request stays "Pending" until manually resolved.
          toast("⚠️ Contribution recorded but request status update failed. Please re-open this request and approve again to resolve it.", "warn");
          closeModal();
          loadContributionRequests();
          _resetApproveBtn();
          return;
        }
        if (resolveRes && resolveRes.status === "already_resolved") {
          toast("⚠️ This request was already approved by another admin.", "warn");
          closeModal();
          loadContributionRequests();
          _resetApproveBtn();
          return;
        }
        let msg = "Request approved! Receipt: " + (contribRes.receiptId || "");
        if (contribRes.emailSent) msg += " · Receipt email sent";
        if (contribRes.emailSkipped) msg += " · Email quota reached";
        // Close modal only after full success
        closeModal();
        toast(msg);
        // D7: removed manual mandirCacheBust("getAllData") — addContribution is in
        // _CACHE_BUST_ON_WRITE so postData() already busted it automatically.
        smartRefresh("contributions");
        loadContributionRequests();
        _resetApproveBtn();
      } catch (err) {
        toast("Error: " + err.message, "error");
        _resetApproveBtn();
      }
    }

    function _rejectContribRequest(reqId) {
      // FIX: Search _allRequests (full unfiltered list) instead of _reqListRendered.
      const r = (window._allRequests || []).find(function(x) { return String(x.ReqId) === String(reqId); });
      if (!r) { toast("Request not found. Please refresh the page.", "error"); return; }
      const u = (users || []).find(function (u) { return String(u.UserId) === String(r.UserId); });
      const name = u ? u.Name : "this member";
      const html = '<div class="_mhdr"><h3><i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i> Reject Request</h3><button class="_mcls" onclick="closeModal()">×</button></div>'
        + '<div class="_mbdy" style="padding:18px 20px;">'
        + '<p style="margin:0 0 12px;font-size:14px;color:#334155;">Reject contribution request from <strong>' + escapeHtml(name) + '</strong> (' + (APP.currency||'₹') + fmt(r.Amount) + ', ' + escapeHtml(r.ForMonth || "") + ' ' + (r.Year || "") + ')?</p>'
        + '<label style="font-size:13px;font-weight:600;color:#64748b;display:block;margin-bottom:6px;">Rejection Reason <span style="font-weight:400;color:#aaa;">(optional — visible to member)</span></label>'
        + '<textarea id="_rejectReasonInput" rows="3" placeholder="e.g. Payment proof unclear, please resubmit..." style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;"></textarea>'
        + '</div>'
        + '<div class="_mft"><button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()">Cancel</button>'
        + '<button class="_mbtn" style="background:#ef4444;" id="_rejectReqBtn"><i class="fa-solid fa-xmark"></i> Reject Request</button></div>';
      openModal(html, "460px");
      setTimeout(function () {
        const btn = document.getElementById("_rejectReqBtn");
        if (btn) btn.addEventListener("click", async function () {
          if (btn._inFlight) return; // double-submit guard
          btn._inFlight = true;
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rejecting...';
          var cancelBtn = btn.parentElement ? btn.parentElement.querySelector("button:not(#_rejectReqBtn)") : null;
          if (cancelBtn) cancelBtn.disabled = true;
          const reason = (document.getElementById("_rejectReasonInput") || {}).value || "";
          await _doRejectContribRequest(r, reason, btn, cancelBtn);
        });
      }, 150);
    }

    async function _doRejectContribRequest(r, reason, _btn, _cancelBtn) {
      if (!checkSession()) {
        if (_btn) { _btn._inFlight = false; _btn.disabled = false; _btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Reject Request'; }
        if (_cancelBtn) _cancelBtn.disabled = false;
        return;
      }
      const s = JSON.parse(localStorage.getItem("session") || "{}");

      function _resetRejectBtn() {
        if (_btn) { _btn._inFlight = false; _btn.disabled = false; _btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Reject Request'; }
        if (_cancelBtn) _cancelBtn.disabled = false;
      }

      try {
        await postData({
          action: "resolveContributionRequest",
          ReqId: r.ReqId,
          Status: "Rejected",
          AdminName: s.Name || "Admin",
          RejectionNote: reason
        });
        // Close modal only after success
        closeModal();
        toast("Request rejected" + (reason ? " with reason." : "."), "warn");
        loadContributionRequests();
        smartRefresh("requests"); // C3: update badge + contributions list (mirrors approve flow)
        _resetRejectBtn();
      } catch (err) {
        toast("Error: " + err.message, "error");
        _resetRejectBtn();
      }
    }

    // FIX: Expose contribution request handlers on window so inline onclick="..." in
    // dynamically-rendered table rows always resolves them, regardless of JS execution scope.
    window._approveContribRequest = _approveContribRequest;
    window._rejectContribRequest  = _rejectContribRequest;

    // ── L2: Dark mode toggle
    function toggleDarkMode() {
      const isDark = document.body.classList.toggle("dark-mode");
      localStorage.setItem("mandir_dark_mode", isDark ? "1" : "0");
      const btn = document.getElementById("darkModeBtn");
      if (btn) {
        btn.textContent = isDark ? "☀️" : "🌙";
        btn.style.transform = "scale(1.3) rotate(20deg)";
        setTimeout(function(){ btn.style.transform = "scale(1) rotate(0deg)"; }, 250);
      }
    }
    // Apply saved preference on load
    (function () {
      if (localStorage.getItem("mandir_dark_mode") === "1") {
        document.body.classList.add("dark-mode");
        const btn = document.getElementById("darkModeBtn");
        if (btn) btn.textContent = "☀️";
      }
    })();

    // ── H10: Local download reminder
    const _DL_KEY = "mandir_last_local_download";
    function _checkLocalDownloadReminder() {
      const banner = document.getElementById("localDownloadBanner");
      const msg = document.getElementById("lastDownloadMsg");
      if (!banner || !msg) return;
      const last = localStorage.getItem(_DL_KEY);
      if (!last) {
        msg.textContent = "No local backup recorded yet. Recommended: download monthly.";
        banner.style.display = "flex";
      } else {
        const daysSince = Math.floor((Date.now() - parseInt(last)) / 86400000);
        if (daysSince >= 30) {
          msg.textContent = "Last local download: " + daysSince + " days ago. Time for a fresh backup!";
          banner.style.display = "flex";
        } else {
          msg.textContent = "Last local download: " + daysSince + " day(s) ago. ✅";
          banner.style.display = "flex";
        }
      }
    }

    function downloadLocalBackup() {
      // Download all contributions as CSV — FIX: use 'data' global directly
      const _backupData = (typeof data !== "undefined" && data && data.length) ? data :
        (typeof window._allContributions !== "undefined" && window._allContributions ? window._allContributions : []);
      if (_backupData.length === 0) { toast("No data to download. Load the page first.", "warn"); return; }
      const headers = Object.keys(_backupData[0]).join(",");
      const rows = _backupData.map(r => Object.values(r).map(v => '"' + String(v || "").replace(/"/g, '""') + '"').join(",")).join("\n");
      const csv = headers + "\n" + rows;
      const bom = "\uFEFF";
      const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "Mandir_Backup_" + new Date().toISOString().slice(0, 10) + ".csv";
      a.click(); URL.revokeObjectURL(url);
      localStorage.setItem(_DL_KEY, String(Date.now()));
      toast("✅ Local backup downloaded!", "success");
      _checkLocalDownloadReminder();
    }

    // ── H5: Annual Year Report PDF export
    function exportAnnualReportPDF() {
      if (typeof jspdf === "undefined" && typeof window.jspdf === "undefined" && typeof jsPDF === "undefined") {
        toast("PDF library not loaded.", "error"); return;
      }
      const tbody = document.getElementById("ys_tbody");
      if (!tbody || tbody.children.length === 0) { toast("Load year summary first.", "warn"); return; }
      const { jsPDF } = window.jspdf || window;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210, margin = 14;
      let Y = 18;
      // Header
      doc.setFillColor(30, 41, 64); doc.rect(0, 0, W, 28, "F");
      doc.setTextColor(247, 160, 26); doc.setFontSize(14); doc.setFont(undefined, "bold");
      doc.text((typeof APP !== "undefined" ? APP.name : "Mandir").toUpperCase(), W / 2, 12, { align: "center" });
      doc.setTextColor(148, 163, 184); doc.setFontSize(9); doc.setFont(undefined, "normal");
      doc.text("Annual Financial Report", W / 2, 20, { align: "center" });
      Y = 36;
      doc.setTextColor(30, 41, 64); doc.setFontSize(11); doc.setFont(undefined, "bold");
      doc.text("Year-by-Year Summary", margin, Y); Y += 8;
      // Table
      const rows = Array.from(tbody.querySelectorAll("tr")).map(tr =>
        Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim())
      );
      const heads = ["Year", "Opening", "Collection", "Expenses", "Closing", "Carry →"];
      if (typeof doc.autoTable === "function") {
        doc.autoTable({
          head: [heads], body: rows, startY: Y, margin: { left: margin, right: margin },
          headStyles: { fillColor: [30, 41, 64], textColor: [247, 160, 26], fontSize: 9 },
          bodyStyles: { fontSize: 9 }, alternateRowStyles: { fillColor: [250, 248, 243] }
        });
      } else {
        doc.setFontSize(9); doc.text("(Install jspdf-autotable for formatted table)", margin, Y);
      }
      const genDate = new Date().toLocaleDateString(APP.locale||"en-IN");
      doc.setFontSize(8); doc.setTextColor(148, 163, 184);
      doc.text("Generated: " + genDate + " | " + (typeof APP !== "undefined" ? APP.name : ""), margin, 285);
      doc.save("AnnualReport_" + genDate.replace(/\//g, "-") + ".pdf");
      toast("✅ Annual report PDF downloaded.");
    }

    // ── H14: Run health check (enhanced)
    function runHealthCheck() {
      var loading = document.getElementById("hc_loading");
      var results = document.getElementById("hc_results");
      var banner  = document.getElementById("hc_overall_banner");
      if (loading) loading.style.display = "block";
      if (results) results.style.display = "none";
      if (banner)  banner.style.display  = "none";
      getData("getHealthCheck").then(function(res) {
        if (loading) loading.style.display = "none";
        if (!res || res.status !== "ok") {
          toast("Health check failed: " + (res && res.message || "Unknown error"), "error");
          return;
        }
        if (results) results.style.display = "block";
        var checks = res.checks || {};

        // ── Last checked timestamp ──
        var lcEl = document.getElementById("hc_last_checked");
        if (lcEl) lcEl.textContent = "Last checked: " + new Date().toLocaleTimeString(APP.locale||"en-IN", {hour:"2-digit", minute:"2-digit"});

        // ── Sheet Status (with optional row counts if backend returns sheet_rows_<name>) ──
        var sheetsEl = document.getElementById("hc_sheets");
        if (sheetsEl) {
          sheetsEl.innerHTML = "";
          Object.keys(checks)
            .filter(function(k) { return k.startsWith("sheet_") && !k.startsWith("sheet_rows_") && !k.startsWith("sheet_col"); })
            .forEach(function(k) {
              var name   = k.replace("sheet_", "");
              var ok     = checks[k];
              var rows   = checks["sheet_rows_" + name];
              var rowTxt = (rows !== undefined) ? " · " + rows + " rows" : "";
              var div = document.createElement("div");
              div.style.cssText = "background:" + (ok ? "#f0fdf4" : "#fef2f2") + ";border:1px solid " +
                (ok ? "#86efac" : "#fca5a5") + ";border-radius:8px;padding:8px 12px;" +
                "font-size:12px;font-weight:600;color:" + (ok ? "#15803d" : "#991b1b") + ";";
              div.textContent = (ok ? "✅ " : "❌ ") + name + rowTxt;
              sheetsEl.appendChild(div);
            });
        }

        // ── Column Integrity (only if backend returns sheet_col_<name> keys) ──
        var colSection = document.getElementById("hc_col_section");
        var colDetails = document.getElementById("hc_col_details");
        var colKeys    = Object.keys(checks).filter(function(k) { return k.startsWith("sheet_col_"); });
        if (colKeys.length > 0 && colSection && colDetails) {
          colSection.style.display = "block";
          colDetails.innerHTML = "";
          colKeys.forEach(function(k) {
            var name    = k.replace("sheet_col_", "");
            var colOk   = (checks[k] === true || checks[k] === "ok");
            var detail  = (typeof checks[k] === "string" && checks[k] !== "ok") ? checks[k] : null;
            var div = document.createElement("div");
            div.style.cssText = "background:" + (colOk ? "#f5f3ff" : "#fff7ed") + ";border:1px solid " +
              (colOk ? "#c4b5fd" : "#fed7aa") + ";border-radius:8px;padding:8px 12px;" +
              "font-size:12px;font-weight:600;color:" + (colOk ? "#5b21b6" : "#92400e") + ";";
            div.innerHTML = (colOk ? "✅ " : "⚠️ ") + name +
              (detail ? '<div style="font-weight:400;font-size:11px;margin-top:3px;">' + detail + "</div>" : "");
            colDetails.appendChild(div);
          });
        } else if (colSection) {
          colSection.style.display = "none";
        }

        // ── Receipt + Backup + Version ──
        var set = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
        set("hc_receipt", checks.receipt_counter + " (" + checks.receipt_year + ")");
        set("hc_backup",  checks.last_backup || "Never");
        set("hc_version", checks.version || "—");

        // ── Email with color coding + progress bar ──
        var emailEl   = document.getElementById("hc_email");
        var emailCard = document.getElementById("hc_email_card");
        var emailBar  = document.getElementById("hc_email_bar");
        var emailBarW = document.getElementById("hc_email_bar_wrap");
        if (emailEl) emailEl.textContent = checks.email_used + " / " + checks.email_limit + " used, " + checks.email_remaining + " remaining";
        if (checks.email_limit && checks.email_used !== undefined) {
          var pct = Math.min(100, Math.round((checks.email_used / checks.email_limit) * 100));
          var emailBg  = pct >= 90 ? "#fef2f2" : pct >= 70 ? "#fffbeb" : "#f0fdf4";
          var emailBdr = pct >= 90 ? "#fca5a5" : pct >= 70 ? "#fde68a" : "#86efac";
          var barClr   = pct >= 90 ? "#ef4444"  : pct >= 70 ? "#f59e0b" : "#22c55e";
          if (emailCard) { emailCard.style.background = emailBg; emailCard.style.border = "1px solid " + emailBdr; emailCard.style.borderRadius = "10px"; }
          if (emailBarW) emailBarW.style.display = "block";
          if (emailBar)  { emailBar.style.background = barClr; setTimeout(function(){ emailBar.style.width = pct + "%"; }, 50); }
        }

        // ── Compute issues & warnings for banner + badge ──
        var issues   = [], warnings = [];
        var missingSheets = Object.keys(checks).filter(function(k) {
          return k.startsWith("sheet_") && !k.startsWith("sheet_rows_") && !k.startsWith("sheet_col") && !checks[k];
        }).length;
        var colMismatch = colKeys.filter(function(k) { return checks[k] !== true && checks[k] !== "ok"; }).length;
        if (missingSheets > 0) issues.push(missingSheets + " sheet" + (missingSheets > 1 ? "s" : "") + " missing");
        if (colMismatch   > 0) issues.push(colMismatch   + " column mismatch" + (colMismatch > 1 ? "es" : ""));
        if (checks.email_limit && checks.email_used !== undefined) {
          var ep = Math.round((checks.email_used / checks.email_limit) * 100);
          if (ep >= 90) issues.push("email quota critical (" + checks.email_remaining + " left)");
          else if (ep >= 70) warnings.push("email quota " + ep + "% used");
        }
        if (!checks.last_backup || checks.last_backup === "Never") warnings.push("no backup on record");

        _hcRenderBanner(issues, warnings);
        _hcSetBadge(issues, warnings);
      }).catch(function(err) {
        if (loading) loading.style.display = "none";
        toast("Health check error: " + err.message, "error");
      });
    }

    // ── H14: Render overall status banner ──
    function _hcRenderBanner(issues, warnings) {
      var banner = document.getElementById("hc_overall_banner");
      var icon   = document.getElementById("hc_overall_icon");
      var title  = document.getElementById("hc_overall_title");
      var detail = document.getElementById("hc_overall_detail");
      if (!banner) return;
      var cfg;
      if (issues.length > 0) {
        cfg = { bg:"#fef2f2", border:"#fca5a5", ico:"🔴", ttl:"Critical Issues Found", dtl: issues.join(" · ") };
      } else if (warnings.length > 0) {
        cfg = { bg:"#fffbeb", border:"#fde68a", ico:"🟡", ttl:"Warnings", dtl: warnings.join(" · ") };
      } else {
        cfg = { bg:"#f0fdf4", border:"#86efac", ico:"🟢", ttl:"All Systems Healthy", dtl:"All sheets exist, columns match, email quota is fine." };
      }
      banner.style.cssText = "display:flex;align-items:center;gap:12px;background:" + cfg.bg + ";border:1px solid " + cfg.border + ";border-radius:12px;padding:14px 18px;margin-bottom:14px;";
      if (icon)   icon.textContent   = cfg.ico;
      if (title)  title.textContent  = cfg.ttl;
      if (detail) detail.textContent = cfg.dtl;
    }

    // ── H14: Update sidebar nav badge + header indicator ──
    function _hcSetBadge(issues, warnings) {
      var level  = issues.length > 0 ? "critical" : warnings.length > 0 ? "warning" : "ok";
      var colors = { ok:"#22c55e", warning:"#f59e0b", critical:"#ef4444" };
      var navEl  = document.getElementById("nav_health");
      var dot    = document.getElementById("hc_hdr_dot");
      var wrap   = document.getElementById("hc_hdr_wrap");
      // Sidebar: small color dot appended to "System Health" nav item
      if (navEl) {
        var badge = navEl.querySelector("._hc_nav_badge");
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "_hc_nav_badge";
          badge.style.cssText = "margin-left:auto;width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0;box-shadow:0 0 4px rgba(0,0,0,0.2);";
          navEl.appendChild(badge);
        }
        badge.style.background = colors[level];
        badge.title = level === "ok" ? "All healthy" : (issues.concat(warnings)).join(", ");
      }
      // Header heartbeat icon
      if (wrap) wrap.style.display = "flex";
      if (dot)  { dot.style.display = "block"; dot.style.background = colors[level]; }
    }

    // ── H14: Auto-refresh toggle ──
    var _hcRefreshTimer = null;
    function hcToggleAutoRefresh() {
      var cb  = document.getElementById("hc_autorefresh");
      var sel = document.getElementById("hc_interval");
      if (!cb) return;
      if (_hcRefreshTimer) { clearInterval(_hcRefreshTimer); _hcRefreshTimer = null; }
      if (cb.checked) {
        if (sel) sel.style.display = "inline-block";
        var ms = sel ? parseInt(sel.value, 10) : 300000;
        _hcRefreshTimer = setInterval(function() { runHealthCheck(); }, ms);
      } else {
        if (sel) sel.style.display = "none";
      }
    }

    // ══════════════════════════════════════════════════════════
    //  TRAFFIC STATS — loadTrafficStats, tcToggleAutoRefresh,
    //  confirmResetTraffic
    //  Quota facts (gmail.com free account):
    //    doGet / URL Fetch : 20,000 / day
    //    PropertiesService : 50,000 / day  (2 calls/request after batch fix)
    //    Email recipients  : 100 / day (CFG.emailDailyLimit = 90 with buffer)
    // ══════════════════════════════════════════════════════════
    var _tcRefreshTimer = null;

    // ── Inject reset confirmation modal (matches _fbModalOverlay style) ──
    (function injectTcResetModal() {
      if (document.getElementById("_tcResetOverlay")) return;
      var style = document.createElement("style");
      style.textContent =
        "#_tcResetOverlay{position:fixed;inset:0;z-index:999995;background:rgba(15,23,42,0.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.22s ease;}" +
        "#_tcResetOverlay.show{opacity:1;pointer-events:all;}" +
        "#_tcResetBox{background:#fff;border-radius:20px;padding:32px 28px 24px;max-width:360px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,0.22),0 0 0 1px rgba(0,0,0,0.04);transform:scale(0.88) translateY(16px);transition:transform 0.26s cubic-bezier(0.34,1.56,0.64,1),opacity 0.22s ease;opacity:0;text-align:center;}" +
        "#_tcResetOverlay.show #_tcResetBox{transform:scale(1) translateY(0);opacity:1;}" +
        "#_tcResetIconWrap{width:66px;height:66px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;font-size:1.7rem;color:#dc2626;margin:0 auto 16px;}" +
        "#_tcResetTitle{font-size:1.1rem;font-weight:700;color:#0f172a;margin:0 0 8px;font-family:Poppins,sans-serif;}" +
        "#_tcResetMsg{font-size:0.85rem;color:#64748b;line-height:1.65;margin:0 0 16px;font-family:Poppins,sans-serif;}" +
        "#_tcResetWarn{background:#fef9ec;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;margin:0 0 22px;font-size:11.5px;color:#92400e;font-family:Poppins,sans-serif;text-align:left;line-height:1.6;}" +
        "._tcResetBtns{display:flex;gap:10px;justify-content:center;}" +
        "._tcResetBtns button{flex:1;max-width:148px;padding:11px 0;border-radius:10px;border:none;font-size:0.88rem;font-weight:700;cursor:pointer;font-family:Poppins,sans-serif;transition:transform 0.15s,box-shadow 0.15s;display:inline-flex;align-items:center;justify-content:center;gap:6px;}" +
        "._tcResetBtns button:hover{transform:translateY(-2px);}" +
        "#_tcResetCancel{background:#f1f5f9;color:#475569;}" +
        "#_tcResetCancel:hover{background:#e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.08);}" +
        "#_tcResetConfirm{background:linear-gradient(135deg,#f87171,#dc2626);color:#fff;box-shadow:0 4px 14px rgba(220,38,38,0.3);}" +
        "#_tcResetConfirm:hover{box-shadow:0 8px 20px rgba(220,38,38,0.45);}";
      document.head.appendChild(style);
      var ov = document.createElement("div");
      ov.id = "_tcResetOverlay";
      ov.innerHTML =
        '<div id="_tcResetBox">' +
          '<div id="_tcResetIconWrap"><i class="fa-solid fa-rotate-left"></i></div>' +
          '<div id="_tcResetTitle">Reset Traffic Stats?</div>' +
          '<div id="_tcResetMsg">This will permanently clear all counters, bar charts, and action breakdown data.</div>' +
          '<div id="_tcResetWarn">⚠️ <strong>Cannot be undone.</strong> Peak records, daily totals, and hourly history will all be erased. Only do this to start fresh.</div>' +
          '<div class="_tcResetBtns">' +
            '<button id="_tcResetCancel" onclick="_tcResetClose()"><i class="fa-solid fa-xmark"></i> Cancel</button>' +
            '<button id="_tcResetConfirm" onclick="_tcDoReset()"><i class="fa-solid fa-trash"></i> Yes, Reset</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      ov.addEventListener("click", function(e) { if (e.target === ov) _tcResetClose(); });
      document.addEventListener("keydown", function(e) { if (e.key === "Escape") _tcResetClose(); });
    })();

    window._tcResetClose = function() {
      var ov = document.getElementById("_tcResetOverlay");
      if (ov) ov.classList.remove("show");
    };

    window._tcDoReset = function() {
      _tcResetClose();
      getData("resetTrafficStats").then(function(res) {
        if (res && res.status === "ok") {
          toast("✅ " + (res.message || "Traffic stats reset."));
          loadTrafficStats();
        } else {
          toast("❌ Reset failed: " + (res && res.message || "Unknown error"), "error");
        }
      }).catch(function() {
        toast("❌ Reset failed. Check console.", "error");
      });
    };

    function loadTrafficStats() {
      var loading = document.getElementById("tc_loading");
      var content = document.getElementById("tc_content");
      if (loading) loading.style.display = "block";
      if (content) content.style.display = "none";

      // Always live — no cache, same pattern as runHealthCheck
      getData("getTrafficStats").then(function(d) {
        if (loading) loading.style.display = "none";
        if (!d || d.status !== "ok") {
          if (loading) loading.innerHTML = "<span style='color:#dc2626;'>Failed to load traffic data.</span>";
          return;
        }
        if (content) content.style.display = "block";

        // ── Quota bars (doGet + Email) ──
        var limitWrap = document.getElementById("tc_limit_wrap");
        if (limitWrap) limitWrap.style.display = "block";

        // doGet bar
        var doGetPct   = Math.min(100, d.usedPct || 0);
        var doGetColor = doGetPct >= 90 ? "#dc2626" : doGetPct >= 70 ? "#f7a01a" : "#22c55e";
        var doGetRemaining = (d.dailyLimit || 20000) - (d.today || 0);
        var doGetBar = document.getElementById("tc_limit_bar");
        var doGetLbl = document.getElementById("tc_limit_label");
        var doGetSts = document.getElementById("tc_limit_status");
        if (doGetBar) { doGetBar.style.width = doGetPct + "%"; doGetBar.style.background = doGetColor; }
        if (doGetLbl) doGetLbl.textContent = (d.today || 0).toLocaleString(APP.locale||"en-IN") + " / " + (d.dailyLimit || 20000).toLocaleString(APP.locale||"en-IN");
        if (doGetSts) {
          var doGetMsg = doGetPct >= 90 ? "⚠️ Critical — " + doGetRemaining.toLocaleString(APP.locale||"en-IN") + " requests left today"
                       : doGetPct >= 70 ? "🟡 Moderate — " + doGetRemaining.toLocaleString(APP.locale||"en-IN") + " requests left today"
                       : "🟢 Healthy — " + doGetRemaining.toLocaleString(APP.locale||"en-IN") + " requests left today";
          doGetSts.textContent = doGetMsg;
          doGetSts.style.color = doGetPct >= 90 ? "#dc2626" : doGetPct >= 70 ? "#b45309" : "#15803d";
        }

        // Email bar
        var emailPct   = Math.min(100, d.emailPct || 0);
        var emailColor = emailPct >= 90 ? "#dc2626" : emailPct >= 70 ? "#f7a01a" : "#22c55e";
        var emailRemaining = (d.emailLimit || 90) - (d.emailUsed || 0);
        var emailBar = document.getElementById("tc_email_bar");
        var emailLbl = document.getElementById("tc_email_label");
        var emailSts = document.getElementById("tc_email_status");
        if (emailBar) { emailBar.style.width = emailPct + "%"; emailBar.style.background = emailColor; }
        if (emailLbl) emailLbl.textContent = (d.emailUsed || 0) + " / " + (d.emailLimit || 90) + " emails";
        if (emailSts) {
          var emailMsg = emailPct >= 90 ? "⚠️ Critical — " + emailRemaining + " emails left today (bulk trigger may fail!)"
                       : emailPct >= 70 ? "🟡 Moderate — " + emailRemaining + " emails left today"
                       : "🟢 Healthy — " + emailRemaining + " emails remaining today";
          emailSts.textContent = emailMsg;
          emailSts.style.color = emailPct >= 90 ? "#dc2626" : emailPct >= 70 ? "#b45309" : "#15803d";
        }

        // ── Summary pills ──
        var pills = [
          { label: "Total Ever",  val: d.total,    color: "#334155", icon: "fa-infinity" },
          { label: "Today",       val: d.today,    color: "#2563eb", icon: "fa-calendar-day" },
          { label: "This Hour",   val: d.thisHour, color: "#16a34a", icon: "fa-clock" },
          { label: "Peak Hour",   val: d.peakHour, color: "#f7a01a", icon: "fa-bolt" },
          { label: "Peak Day",    val: d.peakDay,  color: "#7c3aed", icon: "fa-crown" },
        ];
        var summaryEl = document.getElementById("tc_summary");
        if (summaryEl) {
          summaryEl.innerHTML = pills.map(function(p) {
            return '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;text-align:center;min-width:90px;flex:1;">' +
              '<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;"><i class="fa-solid ' + p.icon + '"></i></div>' +
              '<div style="font-size:1.35rem;font-weight:700;color:' + p.color + ';">' + (p.val || 0).toLocaleString(APP.locale||"en-IN") + '</div>' +
              '<div style="font-size:10px;color:#94a3b8;margin-top:3px;">' + p.label + '</div>' +
            '</div>';
          }).join("");
        }

        // ── Bar chart helper ──
        function renderBars(containerId, data, labelKey, countKey, barColor) {
          var el = document.getElementById(containerId);
          if (!el) return;
          var max = Math.max(1, Math.max.apply(null, data.map(function(x){ return x[countKey]; })));
          el.innerHTML = data.map(function(item) {
            var h   = Math.max(4, Math.round((item[countKey] / max) * 64));
            var has = item[countKey] > 0;
            return '<div title="' + item[labelKey] + ": " + item[countKey] + " requests" + '" ' +
              'style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:default;">' +
              '<div style="font-size:8px;color:#94a3b8;line-height:1;">' + (has ? item[countKey] : "") + '</div>' +
              '<div style="width:100%;height:' + h + 'px;background:' + (has ? barColor : "#e2e8f0") + ';border-radius:3px 3px 0 0;transition:height .3s;"></div>' +
              '<div style="font-size:7px;color:#94a3b8;white-space:nowrap;overflow:hidden;max-width:30px;text-overflow:ellipsis;text-align:center;">' + item[labelKey] + '</div>' +
            '</div>';
          }).join("");
        }

        renderBars("tc_hour_chart", d.last24Hours, "hour", "count", "#f7a01a");
        renderBars("tc_day_chart",  d.last14Days,  "date", "count", "#2563eb");

        // ── Top actions table ──
        var actEl = document.getElementById("tc_actions");
        if (actEl) {
          if (!d.topActions || d.topActions.length === 0) {
            actEl.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:8px 0;text-align:center;">No actions tracked yet — data appears after first request.</div>';
          } else {
            actEl.innerHTML =
              '<table style="width:100%;border-collapse:collapse;">' +
              d.topActions.map(function(a, i) {
                var pct = Math.round(a.count / Math.max(1, d.total) * 100);
                var medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
                return '<tr style="border-bottom:1px solid #f1f5f9;">' +
                  '<td style="padding:6px 4px 6px 0;color:#94a3b8;font-size:11px;width:20px;">' + (medal || (i+1)) + '</td>' +
                  '<td style="padding:6px 0;color:#334155;font-size:12px;font-weight:600;">' + a.action + '</td>' +
                  '<td style="padding:6px 0;text-align:right;font-size:12px;font-weight:700;color:#334155;white-space:nowrap;padding-right:10px;">' + a.count.toLocaleString(APP.locale||"en-IN") + '</td>' +
                  '<td style="padding:6px 0;width:90px;">' +
                    '<div style="height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;">' +
                      '<div style="height:6px;width:' + pct + '%;background:linear-gradient(90deg,#f7a01a,#f59e0b);border-radius:3px;transition:width .4s;"></div>' +
                    '</div>' +
                    '<div style="font-size:9px;color:#94a3b8;margin-top:1px;">' + pct + '%</div>' +
                  '</td>' +
                '</tr>';
              }).join("") +
              '</table>';
          }
        }

        var genEl = document.getElementById("tc_generated");
        if (genEl) genEl.textContent = "Generated: " + (d.generatedAt || "");

      }).catch(function() {
        var loading2 = document.getElementById("tc_loading");
        if (loading2) loading2.innerHTML = "<span style='color:#dc2626;'><i class='fa-solid fa-triangle-exclamation'></i> Error loading traffic data.</span>";
      });
    }

    function tcToggleAutoRefresh() {
      var cb  = document.getElementById("tc_autorefresh");
      var sel = document.getElementById("tc_interval");
      if (!cb) return;
      if (_tcRefreshTimer) { clearInterval(_tcRefreshTimer); _tcRefreshTimer = null; }
      if (cb.checked) {
        if (sel) sel.style.display = "inline-block";
        var ms = sel ? parseInt(sel.value, 10) : 60000;
        _tcRefreshTimer = setInterval(function() { loadTrafficStats(); }, ms);
      } else {
        if (sel) sel.style.display = "none";
      }
    }

    function confirmResetTraffic() {
      var ov = document.getElementById("_tcResetOverlay");
      if (ov) ov.classList.add("show");
    }
    // ══════════════════════════════════════════════════════════

    // ── H14: Silent health check on login — no spinner, just badge + one toast ──
    function _hcSilentLoginCheck() {
      if (typeof getData !== "function") return;
      getData("getHealthCheck").then(function(res) {
        if (!res || res.status !== "ok") return; // fail silently
        var checks        = res.checks || {};
        var colKeys       = Object.keys(checks).filter(function(k) { return k.startsWith("sheet_col_"); });
        var issues        = [], warnings = [];
        var missingSheets = Object.keys(checks).filter(function(k) {
          return k.startsWith("sheet_") && !k.startsWith("sheet_rows_") && !k.startsWith("sheet_col") && !checks[k];
        }).length;
        var colMismatch   = colKeys.filter(function(k) { return checks[k] !== true && checks[k] !== "ok"; }).length;
        if (missingSheets > 0) issues.push(missingSheets + " sheet" + (missingSheets > 1 ? "s" : "") + " missing");
        if (colMismatch   > 0) issues.push(colMismatch   + " column mismatch" + (colMismatch > 1 ? "es" : ""));
        if (checks.email_limit && checks.email_used !== undefined) {
          var ep = Math.round((checks.email_used / checks.email_limit) * 100);
          if (ep >= 90) issues.push("email quota critical");
          else if (ep >= 70) warnings.push("email quota " + ep + "% used");
        }
        if (!checks.last_backup || checks.last_backup === "Never") warnings.push("no backup on record");
        _hcSetBadge(issues, warnings);
        // One brief toast so admin knows status without visiting the page
        if (typeof toast === "function") {
          var msg = issues.length > 0
            ? "⚠️ System Health: " + issues[0] + (issues.length > 1 ? " (+" + (issues.length - 1) + " more)" : "")
            : warnings.length > 0
            ? "🟡 System Health: " + warnings[0]
            : "🟢 System Health: All systems healthy";
          toast(msg, issues.length > 0 ? "error" : warnings.length > 0 ? "warning" : "success");
        }
      }).catch(function() { /* silent — do not interrupt admin if network unavailable */ });
    }

    // ── M15: Broadcast quota info
    function _loadBroadcastQuotaInfo() {
      const infoEl = document.getElementById("bcQuotaInfo");
      if (!infoEl) return;
      const memberCount = (window._allUsers || []).filter(function (u) {
        return String(u.Role || "").toLowerCase() !== "admin" &&
          String(u.Status || "Active").toLowerCase() === "active" &&
          String(u.Email || "").trim() !== "";
      }).length;
      getEmailQuotaCached().then(function (q) {
        if (!q) return;
        const cntEl = document.getElementById("bcMemberCount");
        const remEl = document.getElementById("bcQuotaRemaining");
        const warnEl = document.getElementById("bcQuotaWarn");
        if (cntEl) cntEl.textContent = memberCount;
        if (remEl) remEl.textContent = q.remaining;
        if (warnEl) warnEl.style.display = memberCount > q.remaining ? "inline" : "none";
        infoEl.style.display = "block";
      }).catch(function () { });
    }

    // ── H7: Populate Contribution Records filter dropdowns (year, type, occasion)
    // Called from showPage() when contributionPage is opened — dash_ arrays are already populated by then
    function _cr_buildFilterDropdowns() {
      // Year
      var yrSel = document.getElementById("cr_filterYear");
      if (yrSel) {
        var years = new Set();
        (window.dash_contributions || data || []).forEach(function(c) {
          var y = Number(c.Year); if (y > 2000) years.add(y);
        });
        var sorted = Array.from(years).sort(function(a,b){ return b - a; });
        yrSel.innerHTML = '<option value="">All Years</option>' +
          sorted.map(function(y){ return '<option value="' + y + '">' + y + '</option>'; }).join("");
      }

      // Contribution Type
      var typeSel = document.getElementById("filterContribType");
      if (typeSel) {
        var curTypeVal = typeSel.value;
        var allT = window.dash_types && window.dash_types.length ? window.dash_types : (window.types || []);
        typeSel.innerHTML = '<option value="">All Types</option>' +
          allT.map(function(t){ return '<option value="' + t.TypeId + '">' + escapeHtml(t.TypeName) + '</option>'; }).join("");
        if (curTypeVal) typeSel.value = curTypeVal;
      }

      // Occasion
      var occSel = document.getElementById("cr_filterOccasion");
      if (occSel) {
        var curOccVal = occSel.value;
        var allO = window.dash_occasions && window.dash_occasions.length ? window.dash_occasions : (window.occasions || []);
        occSel.innerHTML = '<option value="">All Occasions</option>' +
          allO.map(function(o){ return '<option value="' + o.OccasionId + '">' + escapeHtml(o.OccasionName) + '</option>'; }).join("");
        if (curOccVal) occSel.value = curOccVal;
      }
    }

    function _applyExtraContribFilters() { /* no-op — logic now inside filterContributions() */ }

    function clearContribFilters() {
      ["cr_filterYear","cr_filterMonth","cr_filterName","cr_filterTrackID","filterContribType","cr_filterOccasion","cr_filterMemberType"]
        .forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ""; });
      if (typeof filterContributions === "function") filterContributions();
    }


    // ── M5: Chatbot Q&A — limit 20 pairs + character counters
    function _initChatbotQALimits() {
      // Max 20 custom Q&A pairs (only 2 pairs exist in current UI — backend already enforces via allowedKeys)
      // Add live char counters to question/answer fields
      const limits = {
        'cbot_custom_q1_en': 200, 'cbot_custom_q1_hi': 200,
        'cbot_custom_a1_en': 500, 'cbot_custom_a1_hi': 500,
        'cbot_custom_q2_en': 200, 'cbot_custom_q2_hi': 200,
        'cbot_custom_a2_en': 500, 'cbot_custom_a2_hi': 500,
      };
      Object.keys(limits).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.maxLength = limits[id];
        const counter = document.createElement("div");
        counter.style.cssText = "font-size:10px;color:#94a3b8;text-align:right;margin-top:2px;";
        counter.textContent = "0 / " + limits[id];
        el.parentNode.insertBefore(counter, el.nextSibling);
        el.addEventListener("input", () => {
          const len = el.value.length;
          counter.textContent = len + " / " + limits[id];
          counter.style.color = len > limits[id] * 0.9 ? "#e74c3c" : "#94a3b8";
        });
      });
    }
    document.addEventListener("DOMContentLoaded", _initChatbotQALimits);

    // ── M11: Reply to feedback member
    function replyToFeedback(rowIndex, memberName, memberMobile) {
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      const html = `
          <div class="_mhdr"><h3><i class="fa-solid fa-reply"></i> Reply to ${escapeHtml(memberName || "Member")}</h3><button class="_mcls" onclick="closeModal()">×</button></div>
          <div class="_mbdy">
            <p style="font-size:12px;color:#64748b;margin-bottom:12px;">This will send a WhatsApp message to <strong>${escapeHtml(memberName)}</strong> (${escapeHtml(memberMobile || "")}).</p>
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">Your Reply</label>
            <textarea id="fbReplyMsg" placeholder="Type your response..." style="width:100%;min-height:100px;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none;box-sizing:border-box;"></textarea>
          </div>
          <div class="_mft">
            <button class="_mbtn" style="background:#999;" onclick="closeModal()">Cancel</button>
            <button class="_mbtn" style="background:#25d366;" onclick="_sendFeedbackReply('${rowIndex}','${encodeURIComponent(memberMobile || "")}')">
              <i class="fa-brands fa-whatsapp"></i> Send via WhatsApp
            </button>
          </div>`;
      openModal(html, "460px");
    }

    function _sendFeedbackReply(rowIndex, encodedMobile) {
      const msg = (document.getElementById("fbReplyMsg") || {}).value || "";
      if (!msg.trim()) { toast("Please type a reply message.", "warn"); return; }
      const mobile = decodeURIComponent(encodedMobile).replace(/\D/g, "");
      if (!mobile || mobile.length < 10) { toast("No valid mobile number for this member.", "warn"); return; }
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      const waText = encodeURIComponent(APP.name + " — Admin Reply:\n\n" + msg + "\n\n— " + (s.name || "Temple Admin"));
      window.open("https://wa.me/91" + mobile + "?text=" + waText, "_blank");
      // Mark as replied
      postData({
        action: "updateFeedbackStatus", RowIndex: rowIndex, Status: "Replied",
        sessionToken: s.sessionToken || "", userId: s.userId || ""
      })
        .then(() => { closeModal(); toast("Marked as Replied."); if (typeof loadFeedback === "function") loadFeedback(); })
        .catch(() => closeModal());
    }

    // ── L5: Gallery tag filter
    function filterGalleryByTag(tag) {
      const q = (tag || "").toLowerCase().trim();
      const items = document.querySelectorAll(".glry-card, .gallery-item, [data-caption]");
      items.forEach(item => {
        if (!q) { item.style.display = ""; return; }
        const caption = (item.dataset.caption || "").toLowerCase();
        const tags = (item.dataset.tags || "").toLowerCase();
        item.style.display = (caption.includes(q) || tags.includes(q)) ? "" : "none";
      });
    }

    // ── M10: Drag reorder for Types, Occasions, Expense Types
    let _dragReorderSrc = null;
    let _dragReorderListId = null;
    function _initTypeReorder(listId) {
      const list = document.getElementById(listId);
      if (!list) return;
      list.querySelectorAll("[data-sortable]").forEach(item => {
        item.setAttribute("draggable", "true");
        item.addEventListener("dragstart", e => {
          _dragReorderSrc = item;
          _dragReorderListId = listId;
          item.style.opacity = "0.5";
        });
        item.addEventListener("dragend", e => {
          item.style.opacity = "";
          _saveDragOrder(listId);
        });
        item.addEventListener("dragover", e => {
          e.preventDefault();
          const after = _getDragAfterElement(list, e.clientY);
          if (after) list.insertBefore(_dragReorderSrc, after);
          else list.appendChild(_dragReorderSrc);
        });
      });
    }
    function _saveDragOrder(listId) {
      const list = document.getElementById(listId);
      if (!list) return;
      const sheetMap = { typeList: "types", occasionList: "occasions", expenseList: "expenseTypes" };
      const sheet = sheetMap[listId];
      if (!sheet) return;
      const items = list.querySelectorAll("[data-sortable]");
      const orderArr = [];
      items.forEach(function (item, i) {
        const id = item.dataset.id || item.getAttribute("data-id");
        if (id) orderArr.push({ id: id, sort: i + 1 });
      });
      if (!orderArr.length) return;
      const savedEl = document.getElementById({ typeList: "md_typesSaved", occasionList: "md_occasionsSaved", expenseList: "md_expSaved" }[listId]);
      if (savedEl) { savedEl.textContent = "⏳ Saving…"; savedEl.style.opacity = "1"; savedEl.style.color = "#f7a01a"; }
      postData({ action: "updateSortOrder", sheet: sheet, order: JSON.stringify(orderArr) })
        .then(function (res) {
          if (res && res.status === "success") {
            if (savedEl) { savedEl.textContent = "✓ Saved"; savedEl.style.color = "#27ae60"; setTimeout(function () { savedEl.style.opacity = "0"; }, 2200); }
            mandirCacheBust("getAllData");
          } else {
            if (savedEl) savedEl.style.opacity = "0";
            toast("⚠️ Drag order not saved — try again.", "warn");
          }
        })
        .catch(function () {
          if (savedEl) savedEl.style.opacity = "0";
          toast("⚠️ Could not save drag order. Check connection.", "warn");
        });
    }
    function _getDragAfterElement(container, y) {
      const els = [...container.querySelectorAll("[data-sortable]:not(.dragging)")];
      return els.reduce((closest, el) => {
        const box = el.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        return (offset < 0 && offset > closest.offset) ? { offset, el } : closest;
      }, { offset: Number.NEGATIVE_INFINITY }).el;
    }

    // ── L8: Scheduled broadcast (queue for next available quota slot)
    function scheduleBroadcast() {
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      const title = (document.getElementById("bc_title") || {}).value || "";
      const message = (document.getElementById("bc_message") || {}).value || "";
      const type = (document.getElementById("bc_type") || {}).value || "announcement";
      const priority = (document.getElementById("bc_priority") || {}).value || "normal";
      if (!message.trim()) { toast("Please enter a message.", "warn"); return; }
      // Queue it: save to localStorage with a scheduled timestamp (next day reset)
      const scheduled = new Date(); scheduled.setHours(23, 59, 0, 0); // tonight at 23:59
      const queue = JSON.parse(localStorage.getItem("mandir_bc_queue") || "[]");
      queue.push({ title, message, type, priority, scheduled: scheduled.toISOString(), adminName: s.name || "Admin" });
      localStorage.setItem("mandir_bc_queue", JSON.stringify(queue));
      toast("⚠️ Broadcast saved locally only. Auto-send is not yet implemented — please send manually using the Send Now button.", "warn");
    }

    // ════════════════════════════════════════════════════════════════
    //  INLINE DASHBOARD — all logic below replaces dashboard.html
    //  Uses admin globals: data, expenses, users, types, expenseTypes,
    //  occasions, yearConfig, selectedYear (from app.js)
    //  Private copies prefixed dash_ to avoid any variable collision.
    // ════════════════════════════════════════════════════════════════

    // Dashboard-local data copies (populated from admin globals on init/refresh)
    var dash_contributions = [];
    var dash_expenses      = [];
    var dash_users         = [];
    var dash_types         = [];
    var dash_expenseTypes  = [];
    var dash_occasions     = [];
    var dash_yearConfig    = [];

    // Dashboard filter state
    var dash_filteredC = [];
    var dash_filteredE = [];
    var dash_selectedYear = new Date().getFullYear();
    var _dash_txnRows = [];
    var _dash_txnPage = 1;
    var _DASH_TXN_PG  = 10;

    // Calendar state
    var _dash_calTarget = "start";
    var _dash_calYear   = new Date().getFullYear();
    var _dash_calMonth  = new Date().getMonth();
    var _dash_months    = MONTHS; // PERF: reuse global

    // ── Called once when admin first opens Dashboard page
    function initDashboardView() {
      // Copy from admin globals — exclude Admin role so dashboard only counts members
      dash_contributions = data.slice();
      dash_expenses      = expenses.slice();
      dash_users         = users.filter(u => (u.Role || "").toLowerCase() !== "admin");
      dash_types         = types.slice();
      dash_expenseTypes  = expenseTypes.slice();
      dash_occasions     = occasions.slice();
      dash_yearConfig    = (yearConfig || []).slice();

      dash_loadYearDropdown();
      dash_applyFilter();

      const now = new Date().toLocaleTimeString(APP.locale||"en-IN");
      const lbl = document.getElementById("dash_lastLoaded");
      if (lbl) lbl.textContent = "Showing data as of " + now + " (use Refresh to get latest).";
    }

    function dash_loadYearDropdown() {
      const sel = document.getElementById("dash_yearSelect");
      if (!sel) return;
      const yr = new Date().getFullYear();
      const years = new Set();
      dash_contributions.forEach(c => { const y = Number(c.Year); if (y > 2000) years.add(y); });
      dash_expenses.forEach(e => { const y = Number(e.Year); if (y > 2000) years.add(y); });
      for (let y = 2023; y <= yr; y++) years.add(y);
      sel.innerHTML = Array.from(years).sort((a,b) => b-a)
        .map(y => `<option value="${y}"${y === yr ? " selected" : ""}>${y}</option>`).join("");
      dash_selectedYear = yr;
      sel.onchange = function() { dash_selectedYear = Number(this.value); dash_applyFilter(); };
    }

    // ── Opening balance (mirrors dashboard.html getOpeningBalance exactly)
    function dash_getOpeningBalance(year, yc, contribs, exps) {
      if (!yc || yc.length === 0) return 0;
      const found = yc.find(y => Number(y.Year) === Number(year));
      if (found && found.OpeningBalance !== "" && found.OpeningBalance !== undefined)
        return Number(found.OpeningBalance);
      const minYear = Math.min(...yc.map(y => Number(y.Year)));
      if (year <= minYear) return 0;
      const prevY  = year - 1;
      const prevO  = dash_getOpeningBalance(prevY, yc, contribs, exps);
      const prevC  = contribs.filter(c => Number(c.Year) === prevY).reduce((s,c) => s + Number(c.Amount||0), 0);
      const prevE  = exps.filter(e => Number(e.Year) === prevY).reduce((s,e) => s + Number(e.Amount||0), 0);
      return prevO + prevC - prevE;
    }

    function dash_applyFilter() {
      const txt      = (document.getElementById("dash_userSearch")?.value || "").toLowerCase();
      const trackTxt = (document.getElementById("dash_trackingSearch")?.value || "").toLowerCase();
      const startRaw = document.getElementById("dash_startDate")?.dataset.val || "";
      const endRaw   = document.getElementById("dash_endDate")?.dataset.val || "";
      const targetYear = Number(dash_selectedYear);

      dash_filteredC = dash_contributions.filter(c => {
        if (Number(c.Year) !== targetYear) return false;
        const user = dash_users.find(u => String(u.UserId) === String(c.UserId));
        const uMatch = !txt ||
          (user?.Name.toLowerCase() || "").includes(txt) ||
          String(user?.Mobile || "").includes(txt);
        const displayRID = (c.ReceiptID || "").replace(new RegExp("^" + (APP.legacyReceiptPrefix||"TRX") + "-"), (APP.receiptPrefix||"REC") + "-");
        const trkMatch = !trackTxt ||
          (c.ReceiptID || "").toLowerCase().includes(trackTxt) ||
          displayRID.toLowerCase().includes(trackTxt);
        let dMatch = true;
        if ((startRaw || endRaw) && c.PaymentDate) {
          const parts = String(c.PaymentDate).split(" ")[0].split("-");
          if (parts.length === 3) {
            const cd = `${parts[2]}-${parts[1]}-${parts[0]}`;
            dMatch = (!startRaw || cd >= startRaw) && (!endRaw || cd <= endRaw);
          }
        }
        return uMatch && trkMatch && dMatch;
      });

      dash_filteredE = dash_expenses.filter(e => {
        if (Number(e.Year) !== targetYear) return false;
        let dMatch = true;
        if ((startRaw || endRaw) && e.PaymentDate) {
          const parts = String(e.PaymentDate).split(" ")[0].split("-");
          if (parts.length === 3) {
            const ed = `${parts[2]}-${parts[1]}-${parts[0]}`;
            dMatch = (!startRaw || ed >= startRaw) && (!endRaw || ed <= endRaw);
          }
        }
        return dMatch;
      });

      dash_renderAll();
    }

    /* attach debounced listeners for all inputs marked data-debounce="dash_applyFilter" */
    (function () {
      var _debouncedDashFilter = debounce(dash_applyFilter, 280);
      document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("[data-debounce='dash_applyFilter']").forEach(function (el) {
          el.addEventListener("input", _debouncedDashFilter);
        });
      });
    })();

    function dash_clearDates() {
      ["dash_startDate","dash_endDate"].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.value = ""; el.dataset.val = ""; }
      });
      ["dash_userSearch","dash_trackingSearch"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      dash_applyFilter();
    }

    function dash_renderAll() {
      dash_summary();
      dash_renderMonthWise();
      dash_renderUserWise();
      dash_renderDetails();
      dash_renderMonthlyBarChart();
    }

    function dash_summary() {
      const yr      = dash_selectedYear;
      const titleEl = document.getElementById("dash_yearTitle");
      if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-wallet"></i> Year Summary (${yr})`;

      const totalC  = dash_filteredC.reduce((s,c) => s + Number(c.Amount||0), 0);
      const totalE  = dash_filteredE.reduce((s,e) => s + Number(e.Amount||0), 0);
      const opening = dash_getOpeningBalance(yr, dash_yearConfig, dash_contributions, dash_expenses);
      const yrAllC  = dash_contributions.filter(c => Number(c.Year) === yr).reduce((s,c) => s + Number(c.Amount||0), 0);
      const yrAllE  = dash_expenses.filter(e => Number(e.Year) === yr).reduce((s,e) => s + Number(e.Amount||0), 0);
      const closing = opening + yrAllC - yrAllE;

      const oldest  = [...dash_yearConfig].sort((a,b) => Number(a.Year) - Number(b.Year))[0];
      const initO   = oldest ? Number(oldest.OpeningBalance) : 0;
      const grandTotal = initO
        + dash_contributions.reduce((s,c) => s + Number(c.Amount||0), 0)
        - dash_expenses.reduce((s,e) => s + Number(e.Amount||0), 0);

      const fullYearC = dash_contributions.filter(c => Number(c.Year) === yr).reduce((s,c) => s + Number(c.Amount||0), 0);

      _setTxt("dash_opening",    fmt(opening));
      _setTxt("dash_yearFullC",  fmt(fullYearC));
      _setTxt("dash_yearTotalC", fmt(totalC));
      _setTxt("dash_yearTotalE", fmt(totalE));
      _setTxt("dash_closing",    fmt(closing));
      _setTxt("dash_grandTotal", fmt(grandTotal));

      const filtLbl = document.getElementById("dash_filteredCountLabel");
      if (filtLbl) {
        const n = dash_filteredC.length;
        filtLbl.textContent = "↳ " + (n > 0 ? n + " Filtered Contribution" + (n !== 1 ? "s" : "") : "Filtered Contributions") + ":";
      }
    }

    function _setTxt(id, val) {
      const el = document.getElementById(id);
      if (el) el.innerText = val;
    }

    function dash_renderMonthWise() {
      const mapC = {}, mapE = {};
      dash_filteredC.forEach(c => { mapC[c.ForMonth] = (mapC[c.ForMonth] || 0) + Number(c.Amount||0); });
      dash_filteredE.forEach(e => {
        let mn = e.ForMonth || e.Note;
        if (!mn && e.PaymentDate) {
          const p = String(e.PaymentDate).split(" ")[0].split("-");
          if (p.length >= 2) { const mi = parseInt(p[1]) - 1; if (_dash_months[mi]) mn = _dash_months[mi]; }
        }
        mn = mn || "Unknown";
        mapE[mn] = (mapE[mn] || 0) + Number(e.Amount||0);
      });
      const html = _dash_months.map(m => {
        const cA = mapC[m] || 0, eA = mapE[m] || 0;
        if (cA === 0 && eA === 0) return "";
        return `<tr><td><b>${m}</b></td><td class="amt-green">₹ ${fmt(cA)}</td><td style="color:#e74c3c;font-weight:600;">₹ ${fmt(eA)}</td></tr>`;
      }).join("");
      const el = document.getElementById("dash_monthWiseBody");
      if (el) el.innerHTML = html || `<tr><td colspan="3" style="text-align:center;color:#aaa;">No data</td></tr>`;
    }

    function dash_getDisplayName(uid, note) {
      if (!String(uid).startsWith("WALKIN_"))
        return dash_users.find(x => String(x.UserId) === String(uid))?.Name || "Unknown";
      const match = String(note || "").match(/Walk-in:\s*([^|]+)/);
      return match ? match[1].trim() : "Walk-in Donor";
    }

    function dash_getDisplayHTML(uid, note) {
      const name = dash_getDisplayName(uid, note);
      const isWalkIn = String(uid).startsWith("WALKIN_");
      const badge = isWalkIn
        ? `<span style="font-size:9px;background:#946c44;color:#fff;border-radius:4px;padding:1px 5px;margin-left:4px;vertical-align:middle;">WALK-IN</span>`
        : "";
      return `<b>${escapeHtml(name)}</b>${badge}`;
    }

    function dash_renderUserWise() {
      const map = {}, noteMap = {};
      dash_filteredC.forEach(c => {
        map[c.UserId] = (map[c.UserId] || 0) + Number(c.Amount||0);
        if (!noteMap[c.UserId]) noteMap[c.UserId] = c.Note || "";
      });
      const html = Object.keys(map).sort((a,b) => map[b]-map[a])
        .map(uid => `<tr><td>${dash_getDisplayHTML(uid, noteMap[uid])}</td><td class="amt-green">₹ ${fmt(map[uid])}</td></tr>`)
        .join("");
      const el = document.getElementById("dash_userWiseBody");
      if (el) el.innerHTML = html || `<tr><td colspan="2" style="text-align:center;color:#aaa;">No data</td></tr>`;
    }

    function dash_renderDetails() {
      const rows = [];
      dash_filteredC.forEach(c => {
        const uName  = dash_getDisplayName(c.UserId, c.Note);
        const uHTML  = dash_getDisplayHTML(c.UserId, c.Note);
        const tName  = dash_types.find(x => String(x.TypeId) === String(c.TypeId))?.TypeName || "Contribution";
        const oName  = dash_occasions.find(x => String(x.OccasionId) === String(c.OccasionId))?.OccasionName || "—";
        const _drid  = _storeReceipt(c, uName, tName, oName);
        rows.push({
          date: c.PaymentDate || "0",
          html: `<tr class="clickable-row" style="cursor:pointer;" onclick="viewDashboardEntry('${_drid}')">
            <td>${escapeHtml(String(c.PaymentDate || "N/A"))}</td>
            <td><i class="fa-solid fa-user" style="color:#aaa;margin-right:4px;font-size:11px;"></i>${uHTML}</td>
            <td><span class="badge badge-green">${escapeHtml(tName)}</span></td>
            <td>${escapeHtml(c.ForMonth || "—")}</td>
            <td>${escapeHtml(oName)}</td>
            <td class="amt-green">+ ₹ ${fmt(c.Amount)}</td>
            <td><button class="btn-sm btn-info" style="box-shadow:none;" onclick="event.stopPropagation();showReceiptById('${_drid}')"><i class="fa-solid fa-receipt"></i> Receipt</button></td>
          </tr>`
        });
      });
      dash_filteredE.forEach(e => {
        const tName = dash_expenseTypes.find(x => String(x.ExpenseTypeId) === String(e.ExpenseTypeId))?.Name || "Expense";
        rows.push({
          date: e.PaymentDate || "0",
          html: `<tr>
            <td>${escapeHtml(String(e.PaymentDate || "N/A"))}</td>
            <td><i class="fa-solid fa-file-invoice-dollar" style="color:#aaa;margin-right:4px;font-size:11px;"></i>${escapeHtml(e.Title || "")}</td>
            <td><span class="badge badge-red">${escapeHtml(tName)}</span></td>
            <td>${escapeHtml(e.ForMonth || "—")}</td>
            <td>—</td>
            <td style="color:#e74c3c;font-weight:600;">- ₹ ${fmt(e.Amount)}</td>
            <td>—</td>
          </tr>`
        });
      });
      rows.sort((a,b) => _dash_parseDateSort(b.date).localeCompare(_dash_parseDateSort(a.date)));
      _dash_txnRows = rows;
      _dash_txnPage = 1;
      _dash_renderTxnPage();
    }

    // ── Shared helper: convert "dd-mm-yyyy hh:mm" → "yyyy-mm-dd" for sorting
    function _dash_parseDateSort(str) {
      const p = String(str || "").split(" ")[0].split("-");
      return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : "0";
    }

    function _dash_renderTxnPage() {
      const totalPages = Math.ceil(_dash_txnRows.length / _DASH_TXN_PG);
      const start  = (_dash_txnPage - 1) * _DASH_TXN_PG;
      const items  = _dash_txnRows.slice(start, start + _DASH_TXN_PG);
      const el     = document.getElementById("dash_detailBody");
      if (el) el.innerHTML = items.map(r => r.html).join("") ||
        '<tr><td colspan="7" style="text-align:center;color:#aaa;">No records</td></tr>';
      _dash_buildTxnPagination(totalPages, _dash_txnPage);
    }

    function _dash_gotoTxnPage(p) {
      const total = Math.ceil(_dash_txnRows.length / _DASH_TXN_PG);
      _dash_txnPage = Math.max(1, Math.min(p, total));
      _dash_renderTxnPage();
    }

    function _dash_buildTxnPagination(totalPages, currentPage) {
      const el = document.getElementById("dash_txnPagination");
      if (!el) return;
      if (!totalPages || totalPages <= 1) { el.innerHTML = ""; return; }
      let html = "";
      html += `<button class="pg-btn" onclick="_dash_gotoTxnPage(${currentPage-1})" ${currentPage<=1?"disabled":""}>&#8249; Prev</button>`;
      const start = Math.max(1, currentPage-2), end = Math.min(totalPages, currentPage+2);
      if (start > 1) { html += `<button class="pg-btn" onclick="_dash_gotoTxnPage(1)">1</button>`; if (start > 2) html += `<span style="font-size:12px;color:#94a3b8;">…</span>`; }
      for (let p = start; p <= end; p++) html += `<button class="pg-btn${p===currentPage?" active":""}" onclick="_dash_gotoTxnPage(${p})">${p}</button>`;
      if (end < totalPages) { if (end < totalPages-1) html += `<span style="font-size:12px;color:#94a3b8;">…</span>`; html += `<button class="pg-btn" onclick="_dash_gotoTxnPage(${totalPages})">${totalPages}</button>`; }
      html += `<button class="pg-btn" onclick="_dash_gotoTxnPage(${currentPage+1})" ${currentPage>=totalPages?"disabled":""}>Next &#8250;</button>`;
      html += `<span style="font-size:12px;color:#94a3b8;">Page ${currentPage} of ${totalPages} (${_dash_txnRows.length} records)</span>`;
      el.innerHTML = html;
    }

    // ── Monthly bar chart
    function dash_renderMonthlyBarChart() {
      const el = document.getElementById("dash_monthlyBarChart");
      if (!el) return;
      const mapC = {}, mapE = {};
      dash_filteredC.forEach(c => { const m = c.ForMonth||""; if(m) mapC[m]=(mapC[m]||0)+Number(c.Amount||0); });
      dash_filteredE.forEach(e => { const m = e.ForMonth||""; if(m) mapE[m]=(mapE[m]||0)+Number(e.Amount||0); });
      const active = _dash_months.filter(m => (mapC[m]||0) > 0 || (mapE[m]||0) > 0);
      if (active.length === 0) { el.innerHTML = '<div style="color:#aaa;font-size:12px;padding:10px;">No data for selected period.</div>'; return; }
      const maxVal = Math.max(...active.map(m => Math.max(mapC[m]||0, mapE[m]||0)), 1);
      el.innerHTML = active.map(m => {
        const cH = Math.round(((mapC[m]||0)/maxVal)*120);
        const eH = Math.round(((mapE[m]||0)/maxVal)*120);
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:28px;flex:1;">
          <div style="display:flex;align-items:flex-end;gap:2px;height:120px;">
            <div title="Income: ₹${(mapC[m]||0).toLocaleString(APP.locale||"en-IN")}" style="width:10px;height:${cH}px;background:#22c55e;border-radius:3px 3px 0 0;min-height:2px;cursor:pointer;"></div>
            <div title="Expense: ₹${(mapE[m]||0).toLocaleString(APP.locale||"en-IN")}" style="width:10px;height:${eH}px;background:#f97316;border-radius:3px 3px 0 0;min-height:2px;cursor:pointer;"></div>
          </div>
          <div style="font-size:9px;color:#64748b;font-weight:600;">${m.slice(0,3)}</div>
        </div>`;
      }).join("");
    }


    // ── Active tab: "contrib" or "expense"
    var _dash_activeTab = "contrib";

    function dash_switchTab(tab) {
      _dash_activeTab = tab;
      // Toggle tab button styles
      document.getElementById("dash_tab_contrib").classList.toggle("dash-tab-active", tab === "contrib");
      document.getElementById("dash_tab_expense").classList.toggle("dash-tab-active", tab === "expense");
      // Show/hide panels
      document.getElementById("dash_panel_contrib").style.display = tab === "contrib" ? "" : "none";
      document.getElementById("dash_panel_expense").style.display = tab === "expense" ? "" : "none";
      // Re-render active tab
      if (tab === "contrib") ct_applyFilter();
      else                   _et_applyFilter();
    }

    // ── WhatsApp — active tab data
    function dash_whatsApp() {
      const genDate = new Date().toLocaleDateString(APP.locale||"en-IN");
      const fYear   = _dash_activeTab === "contrib"
        ? (document.getElementById("ct_filterYear")?.value  || dash_selectedYear)
        : (document.getElementById("et_filterYear")?.value  || dash_selectedYear);
      const fMonth  = _dash_activeTab === "contrib"
        ? (document.getElementById("ct_filterMonth")?.value || "")
        : (document.getElementById("et_filterMonth")?.value || "");
      const period  = fMonth ? `${_cap(fMonth)} ${fYear}` : String(fYear);

      if (_dash_activeTab === "contrib") {
        const paidRows = _ct_filtered.filter(r => r._type === "paid");
        const totalC   = paidRows.reduce((s,r) => s + Number(r._data.Amount||0), 0);
        const walkinC  = paidRows.filter(r => String(r._data.UserId).startsWith("WALKIN_"))
                                 .reduce((s,r) => s + Number(r._data.Amount||0), 0);
        const map = {}, noteMap = {};
        paidRows.forEach(r => {
          const uid = r._data.UserId;
          map[uid] = (map[uid]||0) + Number(r._data.Amount||0);
          if (!noteMap[uid]) noteMap[uid] = r._data.Note || "";
        });
        const lines = Object.keys(map).map(uid => {
          const name  = dash_getDisplayName(uid, noteMap[uid]);
          const label = String(uid).startsWith("WALKIN_") ? `${name} (Walk-In)` : name;
          return `  ✅ ${label}: ${APP.currency||"₹"}${Number(map[uid]).toLocaleString(APP.locale||"en-IN")}`;
        }).join("\n") || "  No contributions found";
        const msg = `${APP.symbol||"🕉️"} *${APP.name.toUpperCase()}*\n📍 ${APP.location}\n\n📊 *Contribution Report — ${period}*\n━━━━━━━━━━━━━━━━━━━━\n💰 Total: ${APP.currency||"₹"}${Number(totalC).toLocaleString(APP.locale||"en-IN")}\n🚶 Walk-in: ${APP.currency||"₹"}${Number(walkinC).toLocaleString(APP.locale||"en-IN")}\n━━━━━━━━━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━━━━━━━━━\n_Generated — ${genDate}_`;
        window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
      } else {
        const rows  = _et_filtered;
        const totalE = rows.reduce((s,e) => s + Number(e.Amount||0), 0);
        const lines  = rows.map(e => {
          const tName = dash_expenseTypes.find(x => String(x.ExpenseTypeId) === String(e.ExpenseTypeId))?.Name || "Expense";
          return `  💸 ${escapeHtml(e.Title||"—")} (${tName}): ${APP.currency||"₹"}${Number(e.Amount||0).toLocaleString(APP.locale||"en-IN")}`;
        }).join("\n") || "  No expenses found";
        const msg = `${APP.symbol||"🕉️"} *${APP.name.toUpperCase()}*\n📍 ${APP.location}\n\n📋 *Expense Report — ${period}*\n━━━━━━━━━━━━━━━━━━━━\n💸 Total: ${APP.currency||"₹"}${Number(totalE).toLocaleString(APP.locale||"en-IN")}\n━━━━━━━━━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━━━━━━━━━\n_Generated — ${genDate}_`;
        window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
      }
    }

    // ── Email — active tab data
    function dash_email() {
      const genDate = new Date().toLocaleDateString(APP.locale||"en-IN");
      const fYear   = _dash_activeTab === "contrib"
        ? (document.getElementById("ct_filterYear")?.value  || dash_selectedYear)
        : (document.getElementById("et_filterYear")?.value  || dash_selectedYear);
      const fMonth  = _dash_activeTab === "contrib"
        ? (document.getElementById("ct_filterMonth")?.value || "")
        : (document.getElementById("et_filterMonth")?.value || "");
      const period  = fMonth ? `${_cap(fMonth)} ${fYear}` : String(fYear);

      if (_dash_activeTab === "contrib") {
        const paidRows = _ct_filtered.filter(r => r._type === "paid");
        const totalC   = paidRows.reduce((s,r) => s + Number(r._data.Amount||0), 0);
        const map = {}, noteMap = {};
        paidRows.forEach(r => {
          const uid = r._data.UserId; map[uid] = (map[uid]||0) + Number(r._data.Amount||0);
          if (!noteMap[uid]) noteMap[uid] = r._data.Note || "";
        });
        const lines = Object.keys(map).map(uid => {
          const name = dash_getDisplayName(uid, noteMap[uid]);
          return `  ${String(uid).startsWith("WALKIN_") ? name+" (Walk-In)" : name}: Rs.${Number(map[uid]).toLocaleString(APP.locale||"en-IN")}`;
        }).join("\n") || "  No contributions found";
        const subject = encodeURIComponent(`Contribution Report ${period} — ${APP.name}`);
        const body    = encodeURIComponent(`${APP.name.toUpperCase()} — CONTRIBUTION REPORT ${period}\n${APP.location}\n\nTotal: Rs.${Number(totalC).toLocaleString(APP.locale||"en-IN")}\n\nDETAILS:\n${lines}\n\nGenerated — ${genDate}`);
        window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
      } else {
        const rows   = _et_filtered;
        const totalE = rows.reduce((s,e) => s + Number(e.Amount||0), 0);
        const lines  = rows.map(e => {
          const tName = dash_expenseTypes.find(x => String(x.ExpenseTypeId) === String(e.ExpenseTypeId))?.Name || "Expense";
          return `  ${e.Title||"—"} (${tName}): Rs.${Number(e.Amount||0).toLocaleString(APP.locale||"en-IN")}`;
        }).join("\n") || "  No expenses found";
        const subject = encodeURIComponent(`Expense Report ${period} — ${APP.name}`);
        const body    = encodeURIComponent(`${APP.name.toUpperCase()} — EXPENSE REPORT ${period}\n${APP.location}\n\nTotal: Rs.${Number(totalE).toLocaleString(APP.locale||"en-IN")}\n\nDETAILS:\n${lines}\n\nGenerated — ${genDate}`);
        window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
      }
    }

    // ── PDF export — active tab data
    function dash_exportPDF() {
      if (typeof window.jspdf === "undefined") { toast("PDF library not loaded.", "error"); return; }
      const { jsPDF } = window.jspdf;
      const doc  = new jsPDF("p","mm","a4");
      const w    = doc.internal.pageSize.getWidth();
      const fYear  = _dash_activeTab === "contrib"
        ? (document.getElementById("ct_filterYear")?.value  || dash_selectedYear)
        : (document.getElementById("et_filterYear")?.value  || dash_selectedYear);
      const fMonth = _dash_activeTab === "contrib"
        ? (document.getElementById("ct_filterMonth")?.value || "")
        : (document.getElementById("et_filterMonth")?.value || "");
      const period = fMonth ? `${_cap(fMonth)} ${fYear}` : String(fYear);
      const label  = _dash_activeTab === "contrib" ? "CONTRIBUTION" : "EXPENSE";

      doc.setFillColor(51,65,85); doc.rect(0,0,w,22,"F");
      doc.setTextColor(247,160,26); doc.setFontSize(14); doc.setFont(undefined,"bold");
      doc.text(`${APP.name.toUpperCase()} — ${label} REPORT ${period}`, w/2, 13, {align:"center"});

      let rows = [];
      if (_dash_activeTab === "contrib") {
        const paidRows = _ct_filtered.filter(r => r._type === "paid");
        const totalC   = paidRows.reduce((s,r) => s + Number(r._data.Amount||0), 0);
        doc.setFontSize(8); doc.setTextColor(50,50,50); doc.setFont(undefined,"normal");
        doc.text(`Total: ${APP.currency||"₹"}${Number(totalC).toLocaleString(APP.locale||"en-IN")}  |  Records: ${paidRows.length}  |  Generated: ${new Date().toLocaleDateString(APP.locale||"en-IN")}`, 14, 30);
        rows = paidRows.map(r => {
          const c = r._data;
          const name  = dash_getDisplayName(c.UserId, c.Note);
          const wk    = String(c.UserId).startsWith("WALKIN_");
          const tName = dash_types.find(x => String(x.TypeId) === String(c.TypeId))?.TypeName || "Contribution";
          const oName = dash_occasions.find(x => String(x.OccasionId) === String(c.OccasionId))?.OccasionName || "—";
          return [_ct_fmtDate(c.PaymentDate), wk ? name+" (Walk-In)" : name, tName, c.ForMonth||"—", oName, `+${APP.currency||"₹"}${Number(c.Amount||0).toLocaleString(APP.locale||"en-IN")}`];
        });
        doc.autoTable({ head:[["Date","Name","Type","Month","Occasion","Amount"]], body:rows, startY:35, theme:"grid", headStyles:{fillColor:[51,65,85],fontStyle:"bold"}, styles:{fontSize:8}, alternateRowStyles:{fillColor:[253,251,247]} });
      } else {
        const totalE = _et_filtered.reduce((s,e) => s + Number(e.Amount||0), 0);
        doc.setFontSize(8); doc.setTextColor(50,50,50); doc.setFont(undefined,"normal");
        doc.text(`Total: ${APP.currency||"₹"}${Number(totalE).toLocaleString(APP.locale||"en-IN")}  |  Records: ${_et_filtered.length}  |  Generated: ${new Date().toLocaleDateString(APP.locale||"en-IN")}`, 14, 30);
        rows = _et_filtered.map(e => {
          const tName = dash_expenseTypes.find(x => String(x.ExpenseTypeId) === String(e.ExpenseTypeId))?.Name || "Expense";
          return [_ct_fmtDate(e.PaymentDate), e.Title||"—", tName, e.ForMonth||"—", `-${APP.currency||"₹"}${Number(e.Amount||0).toLocaleString(APP.locale||"en-IN")}`];
        });
        doc.autoTable({ head:[["Date","Title","Type","Month","Amount"]], body:rows, startY:35, theme:"grid", headStyles:{fillColor:[231,76,60],fontStyle:"bold"}, styles:{fontSize:8}, alternateRowStyles:{fillColor:[255,250,250]} });
      }

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const ph = doc.internal.pageSize.getHeight();
        doc.setFontSize(7); doc.setTextColor(170,170,170);
        doc.text(`${APP.name.toUpperCase()}, ${APP.address.toUpperCase()}  |  System Generated`, w/2, ph-5, {align:"center"});
        doc.text(`Page ${i} of ${pageCount}`, w-14, ph-5, {align:"right"});
      }
      doc.save(`Mandir_${label}_${period.replace(/ /g,"_")}_${Date.now()}.pdf`);
    }

    // ═══════════════════════════════════════════════════════════
    // 💸 EXPENSE TRACKER — Power Filter (mirrors Contribution Tracker)
    // ═══════════════════════════════════════════════════════════
    var _et_filtered  = [];
    var _et_page      = 1;
    var _et_perPage   = 15;
    var _et_sortBy    = "date_desc";
    var _et_debTimer  = null;

    function _et_init() {
      _et_buildYearSelect();
      _et_buildTypeSelect();
      _et_applyFilter();
    }

    function _et_buildYearSelect() {
      const sel = document.getElementById("et_filterYear");
      if (!sel) return;
      const years = new Set();
      dash_expenses.forEach(e => { const y = Number(e.Year); if (y > 2000) years.add(y); });
      const sorted = [...years].sort((a,b) => b-a);
      sel.innerHTML = '<option value="">All Years</option>' +
        sorted.map(y => `<option value="${y}"${y === dash_selectedYear ? " selected" : ""}>${y}</option>`).join("");
      sel.onchange = _et_applyFilter;
    }

    function _et_buildTypeSelect() {
      const sel = document.getElementById("et_filterType");
      if (!sel || !dash_expenseTypes.length) return;
      sel.innerHTML = '<option value="">All Types</option>' +
        dash_expenseTypes.map(t => `<option value="${t.ExpenseTypeId}">${escapeHtml(t.Name)}</option>`).join("");
    }

    function _et_debounceFilter() {
      clearTimeout(_et_debTimer);
      _et_debTimer = setTimeout(_et_applyFilter, 280);
    }

    function _et_applyFilter() {
      _et_sortBy = document.getElementById("et_sortBy")?.value || "date_desc";
      const fYear   = document.getElementById("et_filterYear")?.value   || "";
      const fMonth  = (document.getElementById("et_filterMonth")?.value  || "").toLowerCase();
      const fTitle  = (document.getElementById("et_filterTitle")?.value  || "").toLowerCase();
      const fType   = document.getElementById("et_filterType")?.value   || "";
      const fAmtMin = parseFloat(document.getElementById("et_filterAmtMin")?.value) || 0;
      const fAmtMax = parseFloat(document.getElementById("et_filterAmtMax")?.value) || Infinity;

      _et_filtered = dash_expenses.filter(e => {
        if (fYear  && Number(e.Year) !== Number(fYear)) return false;
        if (fMonth && (e.ForMonth||"").toLowerCase() !== fMonth) return false;
        if (fTitle && !(e.Title||"").toLowerCase().includes(fTitle)) return false;
        if (fType  && String(e.ExpenseTypeId) !== String(fType)) return false;
        const amt = Number(e.Amount||0);
        if (amt < fAmtMin || amt > fAmtMax) return false;
        return true;
      });

      // Sort
      _et_filtered.sort((a,b) => {
        const da = _ct_fmtDate(a.PaymentDate), db = _ct_fmtDate(b.PaymentDate);
        if (_et_sortBy === "date_desc")   return db < da ? -1 : 1;
        if (_et_sortBy === "date_asc")    return da < db ? -1 : 1;
        if (_et_sortBy === "amount_desc") return Number(b.Amount||0) - Number(a.Amount||0);
        if (_et_sortBy === "amount_asc")  return Number(a.Amount||0) - Number(b.Amount||0);
        if (_et_sortBy === "title_asc")   return (a.Title||"").localeCompare(b.Title||"");
        return 0;
      });

      _et_page = 1;
      _et_renderSummary();
      _et_renderTable();
      _et_renderActiveTags(fYear, fMonth, fTitle, fType, fAmtMin, fAmtMax);
    }

    function _et_renderSummary() {
      const total    = _et_filtered.reduce((s,e) => s + Number(e.Amount||0), 0);
      const count    = _et_filtered.length;
      const avg      = count > 0 ? Math.round(total / count) : 0;
      // highest month
      const monthMap = {};
      _et_filtered.forEach(e => { const m = e.ForMonth||""; if(m) monthMap[m]=(monthMap[m]||0)+Number(e.Amount||0); });
      const highEntry = Object.entries(monthMap).sort((a,b)=>b[1]-a[1])[0];
      // by type
      const typeMap = {};
      _et_filtered.forEach(e => {
        const t = dash_expenseTypes.find(x => String(x.ExpenseTypeId)===String(e.ExpenseTypeId))?.Name||"Other";
        typeMap[t] = (typeMap[t]||0) + Number(e.Amount||0);
      });
      const topType = Object.entries(typeMap).sort((a,b)=>b[1]-a[1])[0];

      _setTxt("et_totalExpense",  "₹"+fmt(total));
      _setTxt("et_count",         count+" entries");
      _setTxt("et_avgExpense",    "₹"+fmt(avg));
      _setTxt("et_highMonth",     highEntry ? highEntry[0].slice(0,3) : "—");
      _setTxt("et_highMonthAmt",  highEntry ? "₹"+fmt(highEntry[1]) : "");
      _setTxt("et_topType",       topType   ? topType[0] : "—");
      _setTxt("et_topTypeAmt",    topType   ? "₹"+fmt(topType[1]) : "");
      _setTxt("et_filterCount",   count+" records");
    }

    function _et_renderTable() {
      const total = _et_filtered.length;
      const pages = Math.ceil(total / _et_perPage) || 1;
      _et_page    = Math.min(_et_page, pages);
      const slice = _et_filtered.slice((_et_page-1)*_et_perPage, _et_page*_et_perPage);
      const tbody = document.getElementById("et_tableBody");
      if (!tbody) return;
      if (!slice.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:20px;">No expenses match the current filters.</td></tr>';
      } else {
        tbody.innerHTML = slice.map(e => {
          const tName = dash_expenseTypes.find(x => String(x.ExpenseTypeId)===String(e.ExpenseTypeId))?.Name || "Expense";
          return `<tr>
            <td>${escapeHtml(_ct_fmtDate(e.PaymentDate))}</td>
            <td><b>${escapeHtml(e.Title||"—")}</b></td>
            <td><span class="ct-badge" style="background:#fff1f2;color:#be123c;border:1px solid #fecdd3;">${escapeHtml(tName)}</span></td>
            <td>${escapeHtml(e.ForMonth||"—")}</td>
            <td>${escapeHtml(String(e.Year||"—"))}</td>
            <td style="font-weight:600;color:#dc2626;">−${APP.currency||"₹"}${fmt(e.Amount)}</td>
            <td><span class="ct-badge ct-b-paid" style="background:#fff1f2;color:#dc2626;">Expense</span></td>
          </tr>`;
        }).join("");
      }
      // pagination
      const pgEl = document.getElementById("et_pagination");
      const piEl = document.getElementById("et_pageInfo");
      if (piEl) piEl.textContent = total ? `Showing ${Math.min((_et_page-1)*_et_perPage+1,total)}–${Math.min(_et_page*_et_perPage,total)} of ${total}` : "No records";
      if (!pgEl) return;
      if (pages <= 1) { pgEl.innerHTML = ""; return; }
      let ph = `<button class="pg-btn" onclick="_et_goPage(${_et_page-1})" ${_et_page<=1?"disabled":""}>&#8249; Prev</button>`;
      const s2=Math.max(1,_et_page-2), e2=Math.min(pages,_et_page+2);
      if(s2>1){ph+=`<button class="pg-btn" onclick="_et_goPage(1)">1</button>`;if(s2>2)ph+=`<span style="font-size:11px;color:#94a3b8;">…</span>`;}
      for(let p=s2;p<=e2;p++) ph+=`<button class="pg-btn${p===_et_page?" active":""}" onclick="_et_goPage(${p})">${p}</button>`;
      if(e2<pages){if(e2<pages-1)ph+=`<span style="font-size:11px;color:#94a3b8;">…</span>`;ph+=`<button class="pg-btn" onclick="_et_goPage(${pages})">${pages}</button>`;}
      ph+=`<button class="pg-btn" onclick="_et_goPage(${_et_page+1})" ${_et_page>=pages?"disabled":""}>Next &#8250;</button>`;
      pgEl.innerHTML = ph;
    }

    function _et_goPage(p) {
      const pages = Math.ceil(_et_filtered.length / _et_perPage);
      _et_page = Math.max(1, Math.min(p, pages));
      _et_renderTable();
    }

    function _et_renderActiveTags(fYear, fMonth, fTitle, fType, fAmtMin, fAmtMax) {
      const tags = [];
      if (fYear)  tags.push({label:"Year: "+fYear,   clear:()=>{document.getElementById("et_filterYear").value="";_et_applyFilter();}});
      if (fMonth) tags.push({label:"Month: "+_cap(fMonth), clear:()=>{document.getElementById("et_filterMonth").value="";_et_applyFilter();}});
      if (fTitle) tags.push({label:"Title: "+fTitle, clear:()=>{document.getElementById("et_filterTitle").value="";_et_applyFilter();}});
      if (fType)  {
        const tn = dash_expenseTypes.find(t=>String(t.ExpenseTypeId)===fType)?.Name||fType;
        tags.push({label:"Type: "+tn, clear:()=>{document.getElementById("et_filterType").value="";_et_applyFilter();}});
      }
      if (fAmtMin) tags.push({label:"Min ₹"+fAmtMin, clear:()=>{document.getElementById("et_filterAmtMin").value="";_et_applyFilter();}});
      if (fAmtMax!==Infinity) tags.push({label:"Max ₹"+fAmtMax, clear:()=>{document.getElementById("et_filterAmtMax").value="";_et_applyFilter();}});
      const el = document.getElementById("et_activeTags");
      if (!el) return;
      el.innerHTML = tags.map((t,i)=>`<span class="ct-tag">${escapeHtml(t.label)} <span class="ct-tag-x" onclick="_et_removeTag(${i})">✕</span></span>`).join("");
      el._tagClears = tags.map(t=>t.clear);
    }

    function _et_removeTag(i) {
      const el = document.getElementById("et_activeTags");
      if (el && el._tagClears && el._tagClears[i]) el._tagClears[i]();
    }

    function _et_clearFilter() {
      ["et_filterYear","et_filterMonth","et_filterType"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
      ["et_filterTitle","et_filterAmtMin","et_filterAmtMax"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
      _et_applyFilter();
    }

    // ═══════════════════════════════════════════════════════════════════
    // ⚡ CONTRIBUTION TRACKER — Power Filter & Full Track
    // ═══════════════════════════════════════════════════════════════════

    var _ct_filtered   = [];   // filtered contribution rows (with pending injected)
    var _ct_page       = 1;
    var _ct_perPage    = 15;
    var _ct_view       = "table";
    var _ct_sortBy     = "date_desc";
    var _ct_debTimer   = null;
    var _ct_allMembers = [];   // cached active members for streak + pending logic

    /* Called from dash_renderAll after data loads */
    function ct_init() {
      _ct_buildYearSelect();
      _ct_buildTypeSelect();
      _ct_buildOccasionSelect();
      ct_applyFilter();
    }

    function _ct_buildYearSelect() {
      const sel = document.getElementById("ct_filterYear");
      if (!sel) return;
      const years = new Set();
      dash_contributions.forEach(c => { const y = Number(c.Year); if (y > 2000) years.add(y); });
      const sorted = [...years].sort((a,b) => b-a);
      sel.innerHTML = '<option value="">All Years</option>' +
        sorted.map(y => `<option value="${y}"${y === dash_selectedYear ? " selected" : ""}>${y}</option>`).join("");
      sel.onchange = ct_applyFilter;
    }

    function _ct_buildTypeSelect() {
      const sel = document.getElementById("ct_filterType");
      if (!sel || !dash_types.length) return;
      sel.innerHTML = '<option value="">All Types</option>' +
        dash_types.map(t => `<option value="${t.TypeId}">${escapeHtml(t.TypeName)}</option>`).join("");
    }

    function _ct_buildOccasionSelect() {
      const sel = document.getElementById("ct_filterOccasion");
      if (!sel || !dash_occasions.length) return;
      sel.innerHTML = '<option value="">All Occasions</option>' +
        dash_occasions.map(o => `<option value="${o.OccasionId}">${escapeHtml(o.OccasionName)}</option>`).join("");
    }

    function ct_debounceFilter() {
      clearTimeout(_ct_debTimer);
      _ct_debTimer = setTimeout(ct_applyFilter, 280);
    }

    function ct_applyFilter() {
      _ct_sortBy = document.getElementById("ct_sortBy")?.value || "date_desc";

      const fYear    = document.getElementById("ct_filterYear")?.value || "";
      const fMonth   = (document.getElementById("ct_filterMonth")?.value || "").toLowerCase();
      const fName    = (document.getElementById("ct_filterName")?.value || "").toLowerCase();
      const fTrack   = (document.getElementById("ct_filterTrackID")?.value || "").toLowerCase();
      const fType    = document.getElementById("ct_filterType")?.value || "";
      const fOcc     = document.getElementById("ct_filterOccasion")?.value || "";
      const fKind    = document.getElementById("ct_filterMemberType")?.value || "";
      const fStatus  = document.getElementById("ct_filterStatus")?.value || "";
      const fAmtMin  = parseFloat(document.getElementById("ct_filterAmtMin")?.value) || 0;
      const fAmtMax  = parseFloat(document.getElementById("ct_filterAmtMax")?.value) || Infinity;

      /* Build paid rows from contributions */
      var paidRows = dash_contributions.filter(c => {
        if (fYear && Number(c.Year) !== Number(fYear)) return false;
        if (fMonth && (c.ForMonth || "").toLowerCase() !== fMonth) return false;
        const user = dash_users.find(u => String(u.UserId) === String(c.UserId));
        const isWalkIn = String(c.UserId).startsWith("WALKIN_");
        if (fKind === "member" && isWalkIn) return false;
        if (fKind === "walkin" && !isWalkIn) return false;
        if (fStatus === "pending") return false; // pending = no row in contributions
        const name = dash_getDisplayName(c.UserId, c.Note);
        const mobile = user?.Mobile || "";
        if (fName && !name.toLowerCase().includes(fName) && !String(mobile).includes(fName)) return false;
        const rid = (c.ReceiptID || "");
        const dispRid = rid.replace(new RegExp("^" + (APP.legacyReceiptPrefix||"TRX") + "-"), (APP.receiptPrefix||"REC") + "-");
        if (fTrack && !rid.toLowerCase().includes(fTrack) && !dispRid.toLowerCase().includes(fTrack)) return false;
        if (fType && String(c.TypeId) !== String(fType)) return false;
        if (fOcc && String(c.OccasionId) !== String(fOcc)) return false;
        const amt = Number(c.Amount || 0);
        if (amt < fAmtMin || amt > fAmtMax) return false;
        return true;
      }).map(c => ({ _type: "paid", _data: c }));

      /* Build pending rows — members who have no contribution for the filtered month/year */
      var pendingRows = [];
      if (fStatus !== "paid" && fKind !== "walkin") {
        const filterYear  = fYear  ? Number(fYear)  : null;
        const filterMonth = fMonth ? fMonth          : null;
        if (filterYear && filterMonth) {
          var paidUserIds = new Set(
            dash_contributions
              .filter(c => Number(c.Year) === filterYear && (c.ForMonth || "").toLowerCase() === filterMonth)
              .map(c => String(c.UserId))
          );
          dash_users.forEach(u => {
            if (String(u.Status || "active").toLowerCase() === "inactive") return;
            if (paidUserIds.has(String(u.UserId))) return;
            if (fName && !u.Name.toLowerCase().includes(fName) && !String(u.Mobile||"").includes(fName)) return;
            if (fStatus === "paid") return;
            pendingRows.push({ _type: "pending", _data: u, _year: filterYear, _month: filterMonth });
          });
        }
      }

      /* Combine */
      var combined = [...paidRows, ...pendingRows];

      /* Sort */
      combined.sort((a, b) => {
        const getDate = r => r._type === "paid" ? _dash_parseDateSort(r._data.PaymentDate) : "0";
        const getAmt  = r => r._type === "paid" ? Number(r._data.Amount || 0) : 0;
        const getName = r => r._type === "paid"
          ? dash_getDisplayName(r._data.UserId, r._data.Note).toLowerCase()
          : (r._data.Name || "").toLowerCase();
        if (_ct_sortBy === "date_desc") return getDate(b).localeCompare(getDate(a));
        if (_ct_sortBy === "date_asc")  return getDate(a).localeCompare(getDate(b));
        if (_ct_sortBy === "amount_desc") return getAmt(b) - getAmt(a);
        if (_ct_sortBy === "amount_asc")  return getAmt(a) - getAmt(b);
        if (_ct_sortBy === "name_asc")    return getName(a).localeCompare(getName(b));
        if (_ct_sortBy === "name_desc")   return getName(b).localeCompare(getName(a));
        return 0;
      });

      _ct_filtered = combined;
      _ct_page = 1;

      ct_renderSummary(fYear, fMonth, paidRows, pendingRows);
      ct_renderActiveTags(fYear, fMonth, fName, fTrack, fType, fOcc, fKind, fStatus, fAmtMin, fAmtMax);
      ct_renderCurrentView();
    }

    function ct_renderSummary(fYear, fMonth, paidRows, pendingRows) {
      const totalC = paidRows.reduce((s,r) => s + Number(r._data.Amount||0), 0);
      const walkinRows = paidRows.filter(r => String(r._data.UserId).startsWith("WALKIN_"));
      const walkinAmt  = walkinRows.reduce((s,r) => s + Number(r._data.Amount||0), 0);

      // memberPaidSet from filtered rows — used for avg calc
      const memberPaidSet = new Set(
        paidRows.filter(r => !String(r._data.UserId).startsWith("WALKIN_")).map(r => r._data.UserId)
      );
      const totalMembers = dash_users.filter(u => String(u.Status||"active").toLowerCase() !== "inactive").length;
      // True paid count: unique members who paid in the selected year+month across ALL contributions
      // (not just filtered rows) so name/type/amount filters don't distort the X/Y display
      const truePaidSet = new Set(
        dash_contributions
          .filter(c => {
            if (String(c.UserId).startsWith("WALKIN_")) return false;
            if (fYear && Number(c.Year) !== Number(fYear)) return false;
            if (fMonth && (c.ForMonth||"").toLowerCase() !== fMonth) return false;
            return true;
          })
          .map(c => String(c.UserId))
      );

      // highest month
      const monthMap = {};
      dash_contributions.forEach(c => {
        if (fYear && Number(c.Year) !== Number(fYear)) return;
        const m = c.ForMonth || ""; if (!m) return;
        monthMap[m] = (monthMap[m] || 0) + Number(c.Amount || 0);
      });
      const highEntry = Object.entries(monthMap).sort((a,b) => b[1]-a[1])[0];

      // Divide by payment row count so multiple payments in one month are each counted
      const memberPaidRows = paidRows.filter(r => !String(r._data.UserId).startsWith("WALKIN_"));
      const memberPaidTotal = memberPaidRows.reduce((s,r) => s + Number(r._data.Amount||0), 0);
      const avgPerMember = memberPaidRows.length > 0 ? Math.round(memberPaidTotal / memberPaidRows.length) : 0;

      _setTxt("ct_totalCollected", "₹" + fmt(totalC));
      _setTxt("ct_membersPaid", truePaidSet.size + " / " + totalMembers);
      _setTxt("ct_pending", pendingRows.length);
      _setTxt("ct_walkinTotal", "₹" + fmt(walkinAmt));
      _setTxt("ct_walkinCount", walkinRows.length + " entries");
      _setTxt("ct_avgMember", "₹" + fmt(avgPerMember));
      _setTxt("ct_highMonth", highEntry ? highEntry[0].slice(0,3) : "—");
      _setTxt("ct_highMonthAmt", highEntry ? "₹" + fmt(highEntry[1]) : "");
      _setTxt("ct_filterCount", _ct_filtered.length + " records");
    }

    function ct_renderActiveTags(fYear, fMonth, fName, fTrack, fType, fOcc, fKind, fStatus, fAmtMin, fAmtMax) {
      const tags = [];
      if (fYear)   tags.push({ label: "Year: " + fYear,   clear: () => { document.getElementById("ct_filterYear").value = ""; ct_applyFilter(); } });
      if (fMonth)  tags.push({ label: "Month: " + _cap(fMonth), clear: () => { document.getElementById("ct_filterMonth").value = ""; ct_applyFilter(); } });
      if (fName)   tags.push({ label: "Name: " + fName,   clear: () => { document.getElementById("ct_filterName").value = ""; ct_applyFilter(); } });
      if (fTrack)  tags.push({ label: "ID: " + fTrack,    clear: () => { document.getElementById("ct_filterTrackID").value = ""; ct_applyFilter(); } });
      if (fType) {
        const tn = dash_types.find(t => String(t.TypeId) === fType)?.TypeName || fType;
        tags.push({ label: "Type: " + tn, clear: () => { document.getElementById("ct_filterType").value = ""; ct_applyFilter(); } });
      }
      if (fOcc) {
        const on = dash_occasions.find(o => String(o.OccasionId) === fOcc)?.OccasionName || fOcc;
        tags.push({ label: "Occasion: " + on, clear: () => { document.getElementById("ct_filterOccasion").value = ""; ct_applyFilter(); } });
      }
      if (fKind)   tags.push({ label: _cap(fKind) + " Only", clear: () => { document.getElementById("ct_filterMemberType").value = ""; ct_applyFilter(); } });
      if (fStatus) tags.push({ label: _cap(fStatus),          clear: () => { document.getElementById("ct_filterStatus").value = ""; ct_applyFilter(); } });
      if (fAmtMin) tags.push({ label: "Min ₹" + fAmtMin,      clear: () => { document.getElementById("ct_filterAmtMin").value = ""; ct_applyFilter(); } });
      if (fAmtMax !== Infinity) tags.push({ label: "Max ₹" + fAmtMax, clear: () => { document.getElementById("ct_filterAmtMax").value = ""; ct_applyFilter(); } });

      const el = document.getElementById("ct_activeTags");
      if (!el) return;
      el.innerHTML = tags.map((t, i) =>
        `<span class="ct-tag">${escapeHtml(t.label)} <span class="ct-tag-x" onclick="ct_removeTag(${i})">✕</span></span>`
      ).join("");
      el._tagClears = tags.map(t => t.clear);
    }

    function ct_removeTag(i) {
      const el = document.getElementById("ct_activeTags");
      if (el && el._tagClears && el._tagClears[i]) el._tagClears[i]();
    }

    function _cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

    /* ── Date formatter: ISO "2026-03-04T06:00:46.000Z" → "04-03-2026" ── */
    function _ct_fmtDate(raw) {
      if (!raw) return "N/A";
      const s = String(raw).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const p = s.substring(0,10).split("-");
        return p[2]+"-"+p[1]+"-"+p[0];
      }
      return s.split(" ")[0].split("T")[0];
    }

    function ct_clearFilter() {
      ["ct_filterYear","ct_filterMonth","ct_filterType","ct_filterOccasion","ct_filterMemberType","ct_filterStatus"]
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
      ["ct_filterName","ct_filterTrackID","ct_filterAmtMin","ct_filterAmtMax"]
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
      ct_applyFilter();
    }

    function ct_switchView(view, btn) {
      _ct_view = view;
      document.querySelectorAll(".ct-vbtn").forEach(b => b.classList.remove("active"));
      if (btn) btn.classList.add("active");
      ["table","cards","grid"].forEach(v => {
        const el = document.getElementById("ct_view_" + v);
        if (el) el.style.display = v === view ? "" : "none";
      });
      ct_renderCurrentView();
    }

    function ct_setSort(asc, desc) {
      const sel = document.getElementById("ct_sortBy");
      if (!sel) return;
      sel.value = sel.value === asc ? desc : asc;
      ct_applyFilter();
    }

    function ct_renderCurrentView() {
      if (_ct_view === "table")  ct_renderTable();
      if (_ct_view === "cards")  ct_renderCards();
      if (_ct_view === "grid")   ct_renderGrid();
    }

    /* ── Build 12-month streak dots for a userId ── */
    function _ct_streak(userId) {
      const yr = Number(document.getElementById("ct_filterYear")?.value) || dash_selectedYear;
      return _dash_months.map((m, i) => {
        const hasPaid = dash_contributions.some(c =>
          String(c.UserId) === String(userId) &&
          Number(c.Year) === yr &&
          (c.ForMonth || "") === m
        );
        return `<div class="ct-sd ${hasPaid ? "ct-sd-on" : "ct-sd-off"}" title="${m}: ${hasPaid ? "Paid" : "Not paid"}"></div>`;
      }).join("");
    }

    /* ── TABLE VIEW ── */
    function ct_renderTable() {
      const total = _ct_filtered.length;
      const pages = Math.ceil(total / _ct_perPage) || 1;
      _ct_page    = Math.min(_ct_page, pages);
      const slice = _ct_filtered.slice((_ct_page-1)*_ct_perPage, _ct_page*_ct_perPage);

      const visAmt = _ct_filtered
        .filter(r => r._type === "paid")
        .reduce((s,r) => s + Number(r._data.Amount||0), 0);
      _setTxt("ct_visibleAmt", "Showing ₹" + fmt(visAmt) + " of ₹" + fmt(
        _ct_filtered.filter(r=>r._type==="paid").reduce((s,r)=>s+Number(r._data.Amount||0),0)
      ));

      const tbody = document.getElementById("ct_tableBody");
      if (!tbody) return;

      if (slice.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#aaa;padding:20px;">No records match the current filters.</td></tr>';
      } else {
        tbody.innerHTML = slice.map(row => {
          if (row._type === "paid") {
            const c = row._data;
            const isWalkIn = String(c.UserId).startsWith("WALKIN_");
            const name  = dash_getDisplayName(c.UserId, c.Note);
            const tName = dash_types.find(x => String(x.TypeId) === String(c.TypeId))?.TypeName || "Contribution";
            const oName = dash_occasions.find(x => String(x.OccasionId) === String(c.OccasionId))?.OccasionName || "—";
            const rid   = (c.ReceiptID || "").replace(new RegExp("^" + (APP.legacyReceiptPrefix||"TRX") + "-"), (APP.receiptPrefix||"REC") + "-");
            const _drid = _storeReceipt(c, name, tName, oName);
            const streak = isWalkIn
              ? `<div class="ct-streak" style="opacity:.25;">${"<div class='ct-sd ct-sd-off'></div>".repeat(12)}</div>`
              : `<div class="ct-streak">${_ct_streak(c.UserId)}</div>`;
            return `<tr class="clickable-row" style="cursor:pointer;" onclick="viewDashboardEntry('${_drid}')">
              <td>${escapeHtml(_ct_fmtDate(c.PaymentDate))}</td>
              <td><span style="background:#eff6ff;color:#1d4ed8;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;font-family:monospace;">${escapeHtml(rid||"—")}</span></td>
              <td><b>${escapeHtml(name)}</b></td>
              <td>${escapeHtml(tName)}</td>
              <td>${escapeHtml(oName)}</td>
              <td>${escapeHtml(c.ForMonth||"—")}</td>
              <td><span class="ct-badge ${isWalkIn?"ct-b-wk":"ct-b-mem"}">${isWalkIn?"Walk-in":"Member"}</span></td>
              <td style="font-weight:600;color:#15803d;">+${APP.currency||"₹"}${fmt(c.Amount)}</td>
              <td>${streak}</td>
              <td><span class="ct-badge ct-b-paid">Paid</span></td>
              <td class="ct-act">
                <button class="ct-act-btn ct-act-view" onclick="event.stopPropagation();showReceiptById('${_drid}')">🧾 Receipt</button>
              </td>
            </tr>`;
          } else {
            const u = row._data;
            const streak = `<div class="ct-streak">${_ct_streak(u.UserId)}</div>`;
            return `<tr class="ct-pend">
              <td style="color:#94a3b8;">—</td>
              <td>—</td>
              <td><b style="color:#c2410c;">${escapeHtml(u.Name||"")}</b></td>
              <td>Monthly</td>
              <td>—</td>
              <td>${escapeHtml(row._month ? _cap(row._month) : "—")} ${row._year||""}</td>
              <td><span class="ct-badge ct-b-mem">Member</span></td>
              <td style="color:#94a3b8;">₹0</td>
              <td>${streak}</td>
              <td><span class="ct-badge ct-b-pend">Pending</span></td>
              <td class="ct-act">
                <button class="ct-act-btn ct-act-remind" onclick="event.stopPropagation();_quickNav('contributionPage','[onclick*=contributionPage]')">🔔 Remind</button>
              </td>
            </tr>`;
          }
        }).join("");
      }

      // pagination
      const pgEl = document.getElementById("ct_pagination");
      const piEl = document.getElementById("ct_pageInfo");
      if (piEl) piEl.textContent = "Showing " + (Math.min((_ct_page-1)*_ct_perPage+1, total)) + "–" + Math.min(_ct_page*_ct_perPage, total) + " of " + total + " records";
      if (!pgEl) return;
      if (pages <= 1) { pgEl.innerHTML = ""; return; }
      let ph = `<button class="pg-btn" onclick="_ct_goPage(${_ct_page-1})" ${_ct_page<=1?"disabled":""}>&#8249; Prev</button>`;
      const s2 = Math.max(1, _ct_page-2), e2 = Math.min(pages, _ct_page+2);
      if (s2>1) { ph+=`<button class="pg-btn" onclick="_ct_goPage(1)">1</button>`; if(s2>2) ph+=`<span style="font-size:11px;color:#94a3b8;">…</span>`; }
      for (let p=s2;p<=e2;p++) ph+=`<button class="pg-btn${p===_ct_page?" active":""}" onclick="_ct_goPage(${p})">${p}</button>`;
      if (e2<pages) { if(e2<pages-1) ph+=`<span style="font-size:11px;color:#94a3b8;">…</span>`; ph+=`<button class="pg-btn" onclick="_ct_goPage(${pages})">${pages}</button>`; }
      ph+=`<button class="pg-btn" onclick="_ct_goPage(${_ct_page+1})" ${_ct_page>=pages?"disabled":""}>Next &#8250;</button>`;
      pgEl.innerHTML = ph;
    }

    function _ct_goPage(p) {
      const pages = Math.ceil(_ct_filtered.length / _ct_perPage);
      _ct_page = Math.max(1, Math.min(p, pages));
      ct_renderTable();
    }

    /* ── MEMBER CARDS VIEW ── */
    function ct_renderCards() {
      const el = document.getElementById("ct_cardsBody");
      if (!el) return;
      const map = {}, noteMap = {};
      _ct_filtered.filter(r => r._type === "paid" && !String(r._data.UserId).startsWith("WALKIN_"))
        .forEach(r => {
          const uid = r._data.UserId;
          map[uid]  = (map[uid]||0) + Number(r._data.Amount||0);
          if (!noteMap[uid]) noteMap[uid] = r._data.Note || "";
        });
      const sorted = Object.keys(map).sort((a,b) => map[b]-map[a]);
      if (!sorted.length) { el.innerHTML = '<div style="color:#aaa;padding:20px;text-align:center;">No member contributions match filters.</div>'; return; }
      el.innerHTML = sorted.map(uid => {
        const name    = dash_getDisplayName(uid, noteMap[uid]);
        const initials = name.split(" ").map(w=>w[0]||"").join("").slice(0,2).toUpperCase();
        const streak  = _ct_streak(uid);
        return `<div style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;padding:13px 14px;">
          <div style="width:36px;height:36px;border-radius:50%;background:#fef3c7;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#92400e;margin-bottom:7px;">${initials}</div>
          <div style="font-size:12px;font-weight:600;color:#1e293b;margin-bottom:2px;">${escapeHtml(name)}</div>
          <div style="font-size:16px;font-weight:700;color:#15803d;">${APP.currency||"₹"}${fmt(map[uid])}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px;">12-month streak</div>
          <div class="ct-streak" style="margin-top:5px;">${streak}</div>
        </div>`;
      }).join("");
    }

    /* ── MONTH GRID VIEW ── */
    function ct_renderGrid() {
      const tbl = document.getElementById("ct_gridTable");
      if (!tbl) return;
      const fYear = document.getElementById("ct_filterYear")?.value;
      const yr = fYear ? Number(fYear) : dash_selectedYear;
      const members = dash_users.filter(u => String(u.Status||"active").toLowerCase() !== "inactive");
      if (!members.length) { tbl.innerHTML = '<tr><td style="color:#aaa;padding:16px;">No members found.</td></tr>'; return; }

      let hdr = '<thead><tr><th style="min-width:130px;">Member</th>';
      _dash_months.forEach(m => { hdr += `<th style="min-width:60px;text-align:center;">${m.slice(0,3)}</th>`; });
      hdr += '<th style="min-width:80px;">Total</th></tr></thead>';

      const rows = members.map(u => {
        let total = 0;
        let cells = _dash_months.map(m => {
          // Use filter+reduce to sum ALL contributions for this member+month (handles multiple payments same month)
          const contribs = dash_contributions.filter(c =>
            String(c.UserId) === String(u.UserId) && Number(c.Year) === yr && (c.ForMonth||"") === m
          );
          if (contribs.length > 0) {
            const monthTotal = contribs.reduce((s, c) => s + Number(c.Amount||0), 0);
            total += monthTotal;
            return `<td style="text-align:center;"><span style="background:#dcfce7;color:#15803d;padding:2px 5px;border-radius:4px;font-size:10px;font-weight:600;">${APP.currency||"₹"}${fmt(monthTotal)}</span></td>`;
          }
          return `<td style="text-align:center;"><span style="color:#e2e8f0;font-size:12px;">—</span></td>`;
        }).join("");
        return `<tr><td style="font-weight:600;font-size:11px;">${escapeHtml(u.Name||"")}</td>${cells}<td style="font-weight:700;color:#15803d;font-size:11px;">${APP.currency||"₹"}${fmt(total)}</td></tr>`;
      }).join("");

      tbl.innerHTML = hdr + `<tbody>${rows}</tbody>`;
    }

    /* Hook into existing dash_renderAll so both trackers auto-refresh with dashboard */
    const _orig_dash_renderAll = dash_renderAll;
    dash_renderAll = function() {
      _orig_dash_renderAll();
      if (dash_contributions.length || dash_users.length) ct_init();
      if (dash_expenses.length || dash_contributions.length) _et_init();
    };

    // ── Calendar picker (all prefixed dash_ to avoid collision with any other cal)
    function dash_openCal(target) {
      _dash_calTarget = target;
      const pop = document.getElementById("dash_calPop");
      const inp = document.getElementById(target === "start" ? "dash_startDate" : "dash_endDate");
      const rect = inp.getBoundingClientRect();
      pop.style.display = "block";
      let top = rect.bottom + window.scrollY + 4;
      let left = rect.left + window.scrollX;
      if (left + 270 > window.innerWidth) left = window.innerWidth - 276;
      pop.style.top = top + "px";
      pop.style.left = left + "px";
      dash_renderCal();
      setTimeout(() => document.addEventListener("click", _dash_closeCal, {once:true}), 10);
    }
    function _dash_closeCal(e) {
      const pop = document.getElementById("dash_calPop");
      if (pop && !pop.contains(e.target)) pop.style.display = "none";
    }
    function dash_calNav(dir) {
      _dash_calMonth += dir;
      if (_dash_calMonth > 11) { _dash_calMonth = 0; _dash_calYear++; }
      if (_dash_calMonth < 0)  { _dash_calMonth = 11; _dash_calYear--; }
      dash_renderCal();
    }
    function dash_renderCal() {
      const titleEl = document.getElementById("dash_calTitle");
      if (titleEl) titleEl.textContent = _dash_months[_dash_calMonth].substring(0,3) + " " + _dash_calYear;
      const today = new Date();
      const firstDay = new Date(_dash_calYear, _dash_calMonth, 1).getDay();
      const daysInMonth = new Date(_dash_calYear, _dash_calMonth+1, 0).getDate();
      const startVal = document.getElementById("dash_startDate")?.dataset.val || "";
      const endVal   = document.getElementById("dash_endDate")?.dataset.val || "";
      const g = document.getElementById("dash_calGrid");
      if (!g) return;
      const _calParts = ["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => `<div style="text-align:center;font-size:10px;color:#aaa;font-weight:600;padding:4px 0;">${d}</div>`);
      for (let i = 0; i < firstDay; i++) _calParts.push(`<div></div>`);
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = _dash_calYear + "-" + String(_dash_calMonth+1).padStart(2,"0") + "-" + String(d).padStart(2,"0");
        const isToday = d===today.getDate() && _dash_calMonth===today.getMonth() && _dash_calYear===today.getFullYear();
        const isSel   = dateStr===startVal || dateStr===endVal;
        const bg = isSel ? "#334155" : isToday ? "#f7a01a" : "transparent";
        const co = (isSel || isToday) ? "#fff" : "#333";
        _calParts.push(`<div onclick="dash_pickDate('${dateStr}')" style="text-align:center;font-size:12px;padding:5px 2px;border-radius:6px;cursor:pointer;background:${bg};color:${co};font-weight:${(isSel||isToday)?700:400};">${d}</div>`);
      }
      g.innerHTML = _calParts.join("");
    }
    function dash_pickDate(dateStr) {
      const parts = dateStr.split("-");
      const display = parts[2]+"-"+parts[1]+"-"+parts[0];
      const el = document.getElementById(_dash_calTarget === "start" ? "dash_startDate" : "dash_endDate");
      if (el) { el.value = display; el.dataset.val = dateStr; }
      const pop = document.getElementById("dash_calPop");
      if (pop) pop.style.display = "none";
      dash_applyFilter();
    }

(function() {

    /* ── 1. RIPPLE on every button click ── */
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('button');
      if (!btn || btn.disabled || btn.classList.contains('btn-loading')) return;
      const rect   = btn.getBoundingClientRect();
      const size   = Math.max(rect.width, rect.height) * 1.8;
      const x      = e.clientX - rect.left - size / 2;
      const y      = e.clientY - rect.top  - size / 2;
      const ripple = document.createElement('span');
      ripple.className = 'btn-ripple';
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    }, true);

    /* ── 2. Loading-state helpers ── */
    // Functions that do async work (network/sheet calls) — we wrap these
    const ASYNC_FNS = [
      'addContribution','addUser','addExpense','addEvent','addGoal','addOccasion',
      'addType','addExpenseType',
      'saveEditContrib','saveEditUser','saveEditEvent','saveEventExpense','saveEditGoal',
      'saveAnnouncement','clearAnnouncement','saveChatbotSettings',
      'saveWalkIn','saveAdminProfile','saveAdminNewPassword',
      // delete* functions are intentionally excluded from ASYNC_FNS:
      // they call confirmModal() which has its own "Processing…" spinner on the confirm button.
      // Adding _wrapFn spinner on the trash button too causes a double-spinner (see bug fix).
      'uploadGalleryPhoto','uploadExpenseReceipt','openReceiptAttach',
      'exportContribCSV','exportExpenseCSV','exportAuditCSV','exportAnnualReportPDF',
      'dash_exportPDF',
      'sendBroadcast','scheduleBroadcast','previewBroadcast',
      'sendTrackerMsg','sendWhatsAppReport','sendWhatsAppPDFReport',
      'triggerManualMonthlyReport',
      'runHealthCheck','runTracker','loadTrafficStats',
      'runBulkInsert','_executeBulkInsert','_retryBulkFailed',
      'loadContributionRequests','loadFeedbackAdmin','loadAuditLog','loadYearSummary',
      'refreshDashboardData',
      'fbMarkResolved','fbDeleteRow',
      'replyToFeedback','_sendFeedbackReply',
      '_approveContribRequest','_rejectContribRequest','confirmRejectUser',
      'loadChatbotSettings',
      'downloadLocalBackup',
      '_submitContributionFromPreview','_submitWalkInFromPreview',
      '_retryContribFailed','_retryWalkInFailed',
      '_confirmCorrectionEntry'
    ];

    // Loading label overrides — what to show while processing
    const LOADING_LABELS = {
      addContribution: 'Saving…', addUser: 'Adding…', addExpense: 'Saving…',
      addEvent: 'Adding…', saveEditContrib: 'Saving…', saveEditUser: 'Saving…',
      saveEditEvent: 'Saving…', saveAnnouncement: 'Saving…', saveChatbotSettings: 'Saving…',
      saveWalkIn: 'Saving…', saveAdminProfile: 'Saving…',
      saveAdminNewPassword: 'Updating…',
      deleteGalleryPhoto: 'Deleting…',
      uploadGalleryPhoto: 'Uploading…', uploadExpenseReceipt: 'Uploading…',
      exportContribCSV: 'Exporting…', exportExpenseCSV: 'Exporting…',
      exportAuditCSV: 'Exporting…', exportAnnualReportPDF: 'Generating PDF…',
      dash_exportPDF: 'Generating PDF…',
      sendBroadcast: 'Sending…', sendTrackerMsg: 'Sending…',
      sendWhatsAppReport: 'Preparing…', sendWhatsAppPDFReport: 'Preparing PDF…',
      triggerManualMonthlyReport: 'Sending…',
      runHealthCheck: 'Checking…', runTracker: 'Loading…', loadTrafficStats: 'Loading…',
      runBulkInsert: 'Inserting…',
      loadContributionRequests: 'Loading…', loadFeedbackAdmin: 'Loading…',
      loadAuditLog: 'Loading…', loadYearSummary: 'Loading…',
      refreshDashboardData: 'Refreshing…',
      fbMarkResolved: 'Updating…', fbDeleteRow: 'Deleting…',
      _approveContribRequest: 'Approving…', _rejectContribRequest: 'Rejecting…',
      confirmRejectUser: 'Rejecting…',
      downloadLocalBackup: 'Preparing…',
      _submitContributionFromPreview: 'Saving…', _submitWalkInFromPreview: 'Saving…',
      clearAnnouncement: 'Clearing…', scheduleBroadcast: 'Scheduling…',
      addGoal:'Saving…', addOccasion:'Saving…', addType:'Saving…', addExpenseType:'Saving…',
      saveEditGoal:'Saving…', saveEventExpense:'Saving…',
      replyToFeedback:'Sending…', _sendFeedbackReply:'Sending…',
      previewBroadcast:'Loading…', loadChatbotSettings:'Loading…',
      openReceiptAttach:'Loading…', _confirmCorrectionEntry:'Saving…'
    };

    function _setBtnLoading(btn, fnName) {
      if (!btn || btn.classList.contains('btn-loading')) return;
      // Wrap current inner HTML
      const inner = btn.innerHTML;
      btn.dataset._origHtml = inner;
      btn.innerHTML = `<span class="btn-original-content" style="display:none">${inner}</span>`;
      btn.classList.add('btn-loading');
      btn.disabled = true;
      // Insert loading text after the spinner (::after pseudo handles spinner)
      const label = LOADING_LABELS[fnName] || 'Processing…';
      const txt = document.createElement('span');
      txt.className = 'btn-loading-txt';
      txt.textContent = ' ' + label;
      btn.appendChild(txt);
    }

    function _resetBtn(btn) {
      if (!btn) return;
      btn.classList.remove('btn-loading');
      btn.disabled = false;
      const saved = btn.dataset._origHtml;
      if (saved) { btn.innerHTML = saved; delete btn.dataset._origHtml; }
    }

    function _flashSuccess(btn) {
      if (!btn) return;
      btn.classList.add('btn-success-flash');
      btn.addEventListener('animationend', () => btn.classList.remove('btn-success-flash'), {once:true});
    }

    // Wrap a global function with loading state
    function _wrapFn(fnName) {
      if (typeof window[fnName] !== 'function') return;
      const orig = window[fnName];
      window[fnName] = function(...args) {
        // Find the button that triggered this — look at the event target chain
        const btn = (window._lastClickedBtn && window._lastClickedBtn._fnName === fnName)
          ? window._lastClickedBtn.el : null;

        // [FIX-4] Double-click prevention: if this button already has a request in-flight,
        // silently ignore the second click. Resets automatically when the promise settles.
        if (btn && btn._inFlight) return;
        if (btn) btn._inFlight = true;

        const result = orig.apply(this, args);

        if (result && typeof result.then === 'function') {
          // It's async — show loading
          // _noAutoLoad flag: set by functions that manage their own spinner manually
          // (saveAdminNewPassword, _submitContributionFromPreview, _submitWalkInFromPreview)
          // Skipping _setBtnLoading for these prevents a double-spinner conflict.
          if (btn && !btn._noAutoLoad) _setBtnLoading(btn, fnName);
          result.then(() => {
            if (btn) btn._inFlight = false;
            if (btn && !btn._noAutoLoad) { _resetBtn(btn); _flashSuccess(btn); }
          }).catch(() => {
            if (btn) btn._inFlight = false;
            if (btn && !btn._noAutoLoad) _resetBtn(btn);
          });
        } else {
          // Sync function — clear flag immediately
          if (btn) btn._inFlight = false;
        }
        return result;
      };
    }

    // Track which button was last clicked, map to which fn it calls
    document.addEventListener('mousedown', function(e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      const oc = btn.getAttribute('onclick') || '';
      // Extract function name from onclick attribute
      const m = oc.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
      if (m) {
        window._lastClickedBtn = { el: btn, _fnName: m[1] };
      }
    }, true);

    // Apply wrapping after page fully loads
    function _applyWraps() {
      ASYNC_FNS.forEach(fn => _wrapFn(fn));
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _applyWraps);
    } else {
      // Small delay to let inline scripts define their functions first
      setTimeout(_applyWraps, 800);
    }

    /* ── 3. Sidebar nav tap ripple ── */
    document.addEventListener('click', function(e) {
      const li = e.target.closest('.sidebar li:not(.nav-section-label)');
      if (!li) return;
      li.style.transition = 'background 0.08s';
    });

  })();

(function () {
    "use strict";

    /*
      GLOBAL RECEIPT SEARCH — clean modal approach
      Works on desktop and mobile.
      Opens as a centered overlay. Closes ONLY via ✕ button,
      Escape key, or tapping the dark backdrop — never on input focus/type.
    */

    var _found = null;

    /* Build modal DOM once */
    function _build() {
      if (document.getElementById('grsModal')) return;

      var el = document.createElement('div');
      el.id = 'grsModal';
      el.style.cssText = [
        'display:none',
        'position:fixed',
        'inset:0',
        'z-index:999999',
        'background:rgba(0,0,0,0.5)',
        'align-items:center',
        'justify-content:center',
        'padding:16px',
        'box-sizing:border-box'
      ].join(';');

      el.innerHTML =
        '<div id="grsPanel" style="'
          + 'background:#fff;border-radius:16px;width:100%;max-width:420px;'
          + 'box-shadow:0 24px 64px rgba(0,0,0,0.35);overflow:hidden;'
          + 'font-family:Poppins,sans-serif;'
        + '">'
          /* title bar */
          + '<div style="background:#fdf8f0;border-bottom:1px solid #f0e8d8;'
          + 'padding:13px 16px;display:flex;align-items:center;justify-content:space-between;">'
            + '<span style="font-size:11px;font-weight:700;color:#b0935a;'
            + 'text-transform:uppercase;letter-spacing:1px;">&#x1F9FE; Receipt Lookup</span>'
            + '<button id="grsCloseBtn" style="background:none;border:none;cursor:pointer;'
            + 'color:#aaa;font-size:22px;line-height:1;padding:0;box-shadow:none;'
            + 'width:30px;height:30px;display:flex;align-items:center;justify-content:center;'
            + 'border-radius:50%;">&#x2715;</button>'
          + '</div>'
          /* input row */
          + '<div style="padding:16px 16px 8px;">'
            + '<div style="display:flex;gap:8px;align-items:center;">'
              + '<input id="grsInput" type="text"'
              + ' placeholder="Enter Tracking ID e.g. ' + (APP.receiptPrefix||'REC') + '-001"'
              + ' autocomplete="off" autocorrect="off"'
              + ' autocapitalize="characters" spellcheck="false"'
              + ' style="flex:1;min-width:0;padding:11px 13px;'
              + 'border:1.5px solid #e0dbd4;border-radius:9px;'
              + 'font-size:14px;font-family:Poppins,sans-serif;outline:none;'
              + 'color:#334155;background:#fdfcfa;box-sizing:border-box;margin:0;"/>'
              + '<button id="grsSearchBtn" style="padding:11px 15px;border-radius:9px;'
              + 'background:#f7a01a;color:#fff;border:none;cursor:pointer;'
              + 'font-size:15px;box-shadow:none;flex-shrink:0;">'
              + '<i class="fa-solid fa-magnifying-glass"></i></button>'
            + '</div>'
            + '<div id="grsResult" style="margin-top:12px;margin-bottom:4px;"></div>'
          + '</div>'
        + '</div>';

      document.body.appendChild(el);

      /* ── wire events via addEventListener — no inline onclick ── */

      /* close button */
      document.getElementById('grsCloseBtn').addEventListener('click', function () {
        window.grsClose();
      });

      /* search button */
      document.getElementById('grsSearchBtn').addEventListener('click', function () {
        _lookup();
      });

      /* input: Enter = search, Escape = close. stopPropagation on all input events
         so NOTHING outside this listener ever sees them */
      var inp = document.getElementById('grsInput');
      ['click','mousedown','touchstart','touchend','focus','blur','keyup','input'].forEach(function (ev) {
        inp.addEventListener(ev, function (e) { e.stopPropagation(); }, ev === 'touchstart' || ev === 'touchend' ? {passive:true} : false);
      });
      inp.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter')  _lookup();
        if (e.key === 'Escape') window.grsClose();
      });
      inp.addEventListener('focus', function () { this.style.borderColor = '#f7a01a'; });
      inp.addEventListener('blur',  function () { this.style.borderColor = '#e0dbd4'; });

      /* panel: stop all propagation so backdrop click only fires outside panel */
      var panel = document.getElementById('grsPanel');
      ['click','mousedown','touchstart','touchend'].forEach(function (ev) {
        panel.addEventListener(ev, function (e) { e.stopPropagation(); }, ev === 'touchstart' || ev === 'touchend' ? {passive:true} : false);
      });

      /* backdrop click closes */
      el.addEventListener('mousedown', function (e) {
        if (e.target === el) window.grsClose();
      });
      el.addEventListener('touchend', function (e) {
        if (e.target === el) { e.preventDefault(); window.grsClose(); }
      });

      /* Escape key closes */
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && el.style.display !== 'none') window.grsClose();
      });
    }

    /* ── Open ── */
    window.grsOpen = function () {
      _build();
      var modal = document.getElementById('grsModal');
      var inp   = document.getElementById('grsInput');
      var res   = document.getElementById('grsResult');
      _found = null;
      if (inp) inp.value = '';
      if (res) res.innerHTML = '';
      modal.style.display = 'flex';
      /* longer delay on mobile so keyboard doesn't fight with the opening animation */
      setTimeout(function () { if (inp) inp.focus(); }, window.innerWidth <= 768 ? 350 : 80);
    };

    /* ── Close ── */
    window.grsClose = function () {
      var modal = document.getElementById('grsModal');
      if (modal) modal.style.display = 'none';
    };

    /* ── Lookup ── */
    function _lookup() {
      var inp = document.getElementById('grsInput');
      var res = document.getElementById('grsResult');
      if (!inp || !res) return;
      var val = (inp.value || '').trim();
      if (!val) {
        res.innerHTML = '<p style="font-size:12px;color:#e67e22;margin:4px 0;">&#x26A0; Please enter a Tracking ID.</p>';
        return;
      }

      var PREFIX = (typeof APP !== 'undefined' && APP.receiptPrefix) ? APP.receiptPrefix : 'MNR';
      var vl    = val.toLowerCase();
      var toTrx = vl.replace(new RegExp('^' + PREFIX.toLowerCase() + '-'), 'trx-');
      var toMnr = vl.replace(/^trx-/, PREFIX.toLowerCase() + '-');
      var hit   = null;

      /* search _rcptStore */
      var store = window._rcptStore || window._receiptStore || {};
      Object.keys(store).forEach(function (rid) {
        if (hit) return;
        var d = store[rid]; if (!d) return;
        var rl = (rid || '').toLowerCase();
        var cl = ((d.c && d.c.ReceiptID) || '').toLowerCase();
        if (rl===vl||cl===vl||rl===toTrx||cl===toTrx||rl===toMnr||cl===toMnr)
          hit = { rid:rid, c:d.c, userName:d.userName, typeName:d.typeName };
      });

      /* fallback: main data array */
      if (!hit && typeof data !== 'undefined') {
        data.forEach(function (c) {
          if (hit || !c.ReceiptID) return;
          var rl = c.ReceiptID.toLowerCase();
          var rd = rl.replace(/^trx-/, PREFIX.toLowerCase() + '-');
          if (rl===vl||rd===vl||rl===toTrx||rd===toTrx||rl===toMnr||rd===toMnr) {
            var u = (typeof users !== 'undefined') ? users.find(function (x) { return String(x.UserId) === String(c.UserId); }) : null;
            var t = (typeof contribTypes !== 'undefined') ? contribTypes.find(function (x) { return String(x.TypeId) === String(c.TypeId); }) : null;
            hit = { rid:c.ReceiptID, c:c,
              userName: u ? u.Name : (c.WalkInName || 'Walk-in'),
              typeName: t ? t.TypeName : (c.TypeId || '--') };
          }
        });
      }

      /* not found */
      if (!hit) {
        res.innerHTML =
          '<div style="background:#fff8f8;border:1px solid #fcd4d4;border-radius:10px;padding:14px;text-align:center;">'
          + '<div style="font-size:22px;margin-bottom:6px;">&#x274C;</div>'
          + '<div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:4px;">Receipt Not Found</div>'
          + '<div style="font-size:11px;color:#94a3b8;margin-bottom:10px;">No record for <b style="color:#475569;">' + val + '</b></div>'
          + '<button id="grsTryBtn" style="background:#f1f5f9;color:#475569;border:none;padding:7px 18px;'
          + 'border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;box-shadow:none;'
          + 'font-family:Poppins,sans-serif;">&#x1F504; Try Again</button>'
          + '</div>';
        document.getElementById('grsTryBtn').addEventListener('click', function () {
          var i = document.getElementById('grsInput');
          var r = document.getElementById('grsResult');
          if (i) { i.value = ''; i.focus(); }
          if (r) r.innerHTML = '';
        });
        return;
      }

      /* found */
      _found = hit;
      var c2   = hit.c;
      var dRID = (c2.ReceiptID || hit.rid).replace(new RegExp("^" + (APP.legacyReceiptPrefix||"TRX") + "-", "i"), PREFIX + '-').toUpperCase();
      var amt  = c2.Amount ? (APP.currency||'₹') + Number(c2.Amount).toLocaleString(APP.locale||'en-IN') : '--';
      var mon  = (c2.ForMonth || '') + (c2.Year ? ' ' + c2.Year : '');

      res.innerHTML =
        '<div style="border:1px solid #fde68a;border-radius:10px;overflow:hidden;">'
        + '<div style="background:linear-gradient(90deg,#f7a01a,#f5b942);padding:9px 13px;'
        + 'display:flex;align-items:center;justify-content:space-between;">'
          + '<span style="font-family:monospace;font-size:12px;font-weight:800;color:#fff;">&#x1F9FE; ' + dRID + '</span>'
          + '<span style="font-size:12px;font-weight:700;color:#fff;">' + amt + '</span>'
        + '</div>'
        + '<div style="background:#fffdf5;padding:10px 13px;font-size:12px;color:#334155;line-height:2;">'
          + '<div style="display:flex;"><span style="color:#a09070;min-width:56px;">Donor</span><b>' + (hit.userName || '--') + '</b></div>'
          + '<div style="display:flex;"><span style="color:#a09070;min-width:56px;">Period</span>' + (mon || '--') + '</div>'
          + '<div style="display:flex;"><span style="color:#a09070;min-width:56px;">Date</span>' + (c2.PaymentDate || '--') + '</div>'
          + '<div style="display:flex;"><span style="color:#a09070;min-width:56px;">Type</span>' + (hit.typeName || '--') + '</div>'
        + '</div>'
        + '<div style="padding:10px 13px;background:#fffdf5;border-top:1px solid #fde68a;">'
          + '<button id="grsViewBtn" style="width:100%;padding:11px 0;'
          + 'background:linear-gradient(135deg,#f7a01a,#e8920a);color:#fff;border:none;'
          + 'border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;'
          + 'font-family:Poppins,sans-serif;box-shadow:0 3px 10px rgba(247,160,26,0.3);'
          + 'display:flex;align-items:center;justify-content:center;gap:8px;">'
          + '<i class="fa-solid fa-receipt"></i> View Receipt</button>'
        + '</div>'
        + '</div>';

      document.getElementById('grsViewBtn').addEventListener('click', function () { _open(); });
    }

    /* ── Open receipt modal ── */
    function _open() {
      if (!_found) return;
      window.grsClose();
      var store = window._rcptStore || {};
      if (store[_found.rid] && typeof showReceiptById === 'function') { showReceiptById(_found.rid); return; }
      if (typeof showReceipt === 'function') { showReceipt(_found.c, _found.userName, _found.typeName, _found.occasionName, true); return; }
      if (!window._rcptStore) window._rcptStore = {};
      window._rcptStore[_found.rid] = { c:_found.c, userName:_found.userName, typeName:_found.typeName };
      if (typeof showReceiptById === 'function') showReceiptById(_found.rid);
    }

  }());

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
            '<circle cx="19" cy="19" r="' + R + '" fill="none" stroke="rgba(247,160,26,0.18)" stroke-width="3"/>' +
            '<circle id="_undoRing" cx="19" cy="19" r="' + R + '" fill="none" stroke="#f7a01a" stroke-width="3"' +
            ' stroke-dasharray="' + CIRC + '" stroke-dashoffset="0" stroke-linecap="round"' +
            ' style="transition:stroke-dashoffset 0.1s linear;"/>' +
          '</svg>' +
          '<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#f7a01a;" id="_undoSec">30</span>' +
        '</div>' +
        // Text
        '<div style="flex:1;min-width:0;line-height:1.4;">' +
          '<div style="font-size:11px;font-weight:600;color:#f7a01a;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:1px;">Deleted</div>' +
          '<div style="font-size:12.5px;font-weight:600;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + label + '">' + label + '</div>' +
        '</div>' +
        // Undo button
        '<button id="_undoBtn" onclick="_doUndo()" style="' +
          'background:linear-gradient(135deg,#f7a01a,#f59e0b);border:none;color:#fff;' +
          'padding:7px 16px;border-radius:10px;cursor:pointer;font-weight:700;font-size:12px;' +
          'font-family:Poppins,sans-serif;box-shadow:0 4px 12px rgba(247,160,26,0.4);' +
          'white-space:nowrap;flex-shrink:0;transition:transform 0.1s,box-shadow 0.1s;' +
          'display:flex;align-items:center;gap:6px;">' +
          '<i class="fa-solid fa-rotate-left"></i> Undo' +
        '</button>';

      document.body.appendChild(toastEl);

      // Hover effects on undo button
      var btn = document.getElementById("_undoBtn");
      if (btn) {
        btn.onmouseenter = function(){ this.style.transform="scale(1.06)"; this.style.boxShadow="0 6px 18px rgba(247,160,26,0.55)"; };
        btn.onmouseleave = function(){ this.style.transform=""; this.style.boxShadow="0 4px 12px rgba(247,160,26,0.4)"; };
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
        if (ring) ring.style.stroke = elapsed > DURATION * 0.83 ? "#ef4444" : "#f7a01a";
        if (sec)  sec.style.color   = elapsed > DURATION * 0.83 ? "#ef4444" : "#f7a01a";
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
              "background:linear-gradient(90deg,#fef9ec,#fef3c7);border:1px solid #fde68a;" +
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