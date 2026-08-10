    var _annColorMap = {
      purple: "linear-gradient(90deg,#4c1a6e,#6b21a8,#4c1a6e)",
      orange: "linear-gradient(90deg,#c2410c,#ea580c,#c2410c)",
      red: "linear-gradient(90deg,#991b1b,#dc2626,#991b1b)",
      green: "linear-gradient(90deg,#14532d,#16a34a,#14532d)",
      blue: "linear-gradient(90deg,#1e3a8a,#0F766E,#1e3a8a)",
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
        el.style.background.includes("d35400") ? "#0F766E" :
          el.style.background.includes("991b1b") ? "#dc2626" :
            el.style.background.includes("15803d") ? "#16a34a" :
              el.style.background.includes("1d4ed8") ? "#0F766E" :
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
      }, "Remove", "#0F766E");
    }

    // Toggles a single history item between Active/Past. Activating one
    // automatically deactivates whichever other item was active (enforced
    // server-side too), so only one announcement is ever live at a time.
    function toggleAnnouncementItem(annId, isActive) {
      if (!checkSession() || !annId) return;
      var goingTo = isActive ? "Disable" : "Enable";
      var warnLine = isActive
        ? "This removes the banner from the home page."
        : "This will show it on the home page and disable any other active announcement.";
      confirmModal(goingTo + ' this announcement?<br><span style="font-size:12px;color:#94a3b8;">' + warnLine + '</span>', async function () {
        var session = JSON.parse(localStorage.getItem("session") || "{}");
        try {
          var res = await postData({ action: "toggleAnnouncementStatus", AnnId: annId, AdminName: session.name || "Admin" });
          if (res && res.status === "success") {
            toast("Announcement " + (res.newStatus === "Active" ? "enabled" : "disabled") + ".", "success");
            loadAnnouncementAdmin();
          } else {
            toast((res && res.message) || "This isn't available yet — the Apps Script backend needs to be redeployed with the latest code.", "warn");
          }
        } catch (e) { toast("Error: " + e.message, "error"); }
      }, goingTo, isActive ? "#e74c3c" : "#16a34a");
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
            (a.Badge ? '<span style="display:inline-block;margin-top:4px;background:#f0f4ff;color:#14B8A6;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;">' + escapeHtml(a.Badge) + '</span>' : '') +
            '<div style="font-size:11px;color:#aaa;margin-top:4px;">' +
            escapeHtml(a.AdminName || "Admin") + ' · ' + escapeHtml(a.CreatedAt || "—") +
            '</div>' +
            '</div>' +
            '<button onclick="toggleAnnouncementItem(\'' + escapeHtml(a.AnnId || "") + '\', ' + isActive + ')" title="' + (isActive ? "Disable" : "Enable") + '" style="background:' +
              (isActive ? 'rgba(231,76,60,0.1);color:#e74c3c;border:1px solid rgba(231,76,60,0.25);' : 'rgba(22,163,74,0.1);color:#16a34a;border:1px solid rgba(22,163,74,0.25);') +
              'border-radius:7px;padding:5px 10px;font-size:12px;cursor:pointer;box-shadow:none;flex-shrink:0;">' +
              '<i class="fa-solid ' + (isActive ? 'fa-ban' : 'fa-check') + '"></i></button>' +
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
      minYear = minYear || _getProjectStartYear();
      maxYear = maxYear || (new Date().getFullYear() + 1);
      selectedYear = selectedYear || new Date().getFullYear();
      var opts = '';
      for (var y = maxYear; y >= minYear; y--) {
        opts += '<option value="' + y + '"' + (y === Number(selectedYear) ? ' selected' : '') + '>' + y + '</option>';
      }
      return opts;
    }

    /* ── Single source of truth for "project start year" (points 2/3/4) ──────
       Every year dropdown in the app should call this instead of hardcoding
       a start year. Priority:
         1) earliest year found in YEAR_CONFIG (yearConfig / dash_yearConfig)
         2) else earliest year found in recorded contributions/expenses
         3) else _PROJECT_START_YEAR_FLOOR — a last-resort fallback that should
            almost never be hit once #1/#2 have any rows.
       If this org/project is ever handed to someone else, or reused for a
       different group, nothing here needs editing — it self-adjusts from
       whatever data already exists. The only manual override, if ever
       needed, is the floor constant below.
    ─────────────────────────────────────────────────────────────────────── */
    var _PROJECT_START_YEAR_FLOOR = 2023;
    function _getProjectStartYear() {
      var years = [];
      function addFrom(arr, field) {
        if (Array.isArray(arr)) arr.forEach(function (r) {
          var y = Number(r && r[field]);
          if (!isNaN(y) && y > 2000) years.push(y);
        });
      }
      addFrom(typeof yearConfig !== "undefined" ? yearConfig : null, "Year");
      addFrom(typeof dash_yearConfig !== "undefined" ? dash_yearConfig : null, "Year");
      addFrom(typeof data !== "undefined" ? data : null, "Year");
      addFrom(typeof dash_contributions !== "undefined" ? dash_contributions : null, "Year");
      addFrom(typeof expenses !== "undefined" ? expenses : null, "Year");
      addFrom(typeof dash_expenses !== "undefined" ? dash_expenses : null, "Year");
      return years.length ? Math.min.apply(null, years) : _PROJECT_START_YEAR_FLOOR;
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
              tr.style.background = "rgba(15, 118, 110,0.07)";
              tr.style.fontWeight = "600";
            }

            tr.innerHTML =
              '<td style="text-align:center;">' +
              '<span style="font-weight:700;color:#334155;">' + r.year + '</span>' +
              (isCurrentYear ? ' <span style="font-size:10px;background:#0F766E;color:#fff;border-radius:4px;padding:1px 6px;vertical-align:middle;">Current</span>' : '') +
              '</td>' +
              '<td style="text-align:right;color:#64748b;">₹' + fmt(Number(r.openingBalance || 0)) + '</td>' +
              '<td style="text-align:right;color:#27ae60;font-weight:600;">₹' + fmt(Number(r.totalCollection || 0)) + '</td>' +
              '<td style="text-align:right;color:#e74c3c;font-weight:600;">₹' + fmt(Number(r.totalExpense || 0)) + '</td>' +
              '<td style="text-align:right;font-weight:700;color:' + (closing >= 0 ? "#27ae60" : "#e74c3c") + ';">' +
              (closing < 0 ? "−" : "") + "₹" + fmt(Math.abs(closing)) +
              '</td>' +
              '<td style="text-align:right;color:#14B8A6;">' + cfText + '</td>' +
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
            "<button onclick='loadYearSummary()' style='background:#0F766E;color:#fff;border:none;border-radius:8px;padding:8px 20px;font-family:Poppins,sans-serif;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 3px 8px rgba(15, 118, 110,0.3);'>" +
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