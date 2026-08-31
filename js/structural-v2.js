/* ══════════════════════════════════════════════════════════════════
   STRUCTURAL PATTERNS v2 — Global search (Cmd+K) + sparklines
   PREVIEW ONLY.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  // ── Global search / command palette ──
  var PAGES = [
    { label: "Home", page: "home", icon: "fa-house" },
    { label: "Dashboard", page: "dashboard", icon: "fa-chart-pie" },
    { label: "Contribution", page: "contributionPage", icon: "fa-hand-holding-dollar" },
    { label: "Expense", page: "expensePage", icon: "fa-receipt" },
    { label: "Tracker", page: "trackerPage", icon: "fa-chart-line" },
    { label: "Goals", page: "goalsPage", icon: "fa-bullseye" },
    { label: "Year Summary", page: "yearSummaryPage", icon: "fa-calendar" },
    { label: "Requests", page: "contributionRequestsPage", icon: "fa-inbox" },
    { label: "Events", page: "eventsPage", icon: "fa-calendar-days" },
    { label: "Users", page: "usersPage", icon: "fa-users" },
    { label: "Master Data", page: "masterPage", icon: "fa-database" },
    { label: "Gallery", page: "galleryAdminPage", icon: "fa-images" },
    { label: "Announcement", page: "announcementPage", icon: "fa-bullhorn" },
    { label: "Broadcast", page: "broadcastPage", icon: "fa-tower-broadcast" },
    { label: "Chatbot", page: "chatbotPage", icon: "fa-robot" },
    { label: "Feedback", page: "feedbackAdminPage", icon: "fa-comment" },
    { label: "Email Automation", page: "emailAutoPage", icon: "fa-envelope" },
    { label: "Audit Log", page: "auditPage", icon: "fa-clipboard-list" },
    { label: "System Health", page: "healthCheckPage", icon: "fa-heart-pulse" }
  ];

  function ensureOverlay() {
    if (document.getElementById("cmdkOverlayV2")) return;
    var el = document.createElement("div");
    el.id = "cmdkOverlayV2";
    el.innerHTML =
      '<div class="cmdk-v2">' +
      '<div class="cmdk-v2-input-row"><i class="fa-solid fa-magnifying-glass" style="color:#94A3B8;"></i>' +
      '<input id="cmdkInputV2" placeholder="Jump to a page or search members..." />' +
      '<kbd>Esc</kbd></div>' +
      '<div class="cmdk-v2-results" id="cmdkResultsV2"></div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener("click", function (e) { if (e.target === el) closeCmdk(); });
    document.getElementById("cmdkInputV2").addEventListener("input", renderResults);
  }

  function renderResults() {
    var q = document.getElementById("cmdkInputV2").value.trim().toLowerCase();
    var matches = PAGES.filter(function (p) { return p.label.toLowerCase().indexOf(q) !== -1; });
    var html = matches.map(function (p, i) {
      return '<div class="cmdk-v2-item' + (i === 0 ? ' active' : '') + '" data-page="' + p.page + '">' +
        '<i class="fa-solid ' + p.icon + '" style="width:18px;color:#0F766E;"></i>' +
        '<span>' + p.label + '</span><span class="kicker">Page</span></div>';
    }).join("");
    document.getElementById("cmdkResultsV2").innerHTML = html || '<div style="padding:16px;color:#94A3B8;text-align:center;">No matches</div>';
    document.querySelectorAll(".cmdk-v2-item").forEach(function (el) {
      el.addEventListener("click", function () {
        var pid = el.getAttribute("data-page");
        closeCmdk();
        if (pid === "dashboard") {
          if (typeof openDashboard === "function") openDashboard();
        } else if (typeof showPage === "function") {
          showPage(pid, document.querySelector('[onclick*="' + pid + '"]'));
        }
      });
    });
  }

  function openCmdk() {
    ensureOverlay();
    var overlay = document.getElementById("cmdkOverlayV2");
    overlay.classList.add("open");
    var input = document.getElementById("cmdkInputV2");
    input.value = "";
    renderResults();
    setTimeout(function () { input.focus(); }, 30);
  }
  function closeCmdk() {
    var overlay = document.getElementById("cmdkOverlayV2");
    if (overlay) overlay.classList.remove("open");
  }

  document.addEventListener("keydown", function (e) {
    var isTyping = ["INPUT", "TEXTAREA", "SELECT"].indexOf(document.activeElement.tagName) !== -1;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      var overlay = document.getElementById("cmdkOverlayV2");
      if (overlay && overlay.classList.contains("open")) closeCmdk(); else openCmdk();
    } else if (e.key === "Escape") {
      closeCmdk();
    } else if (e.key === "/" && !isTyping) {
      e.preventDefault();
      openCmdk();
    }
  });

  window.openCmdkV2 = openCmdk;

  // ── Sparkline mini-chart: tiny inline SVG line, no library needed ──
  window.renderSparklineV2 = function (values, color) {
    if (!values || values.length < 2) return "";
    var w = 64, h = 24, pad = 2;
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    var range = (max - min) || 1;
    var step = (w - pad * 2) / (values.length - 1);
    var pts = values.map(function (v, i) {
      var x = pad + i * step;
      var y = h - pad - ((v - min) / range) * (h - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    var last = pts[pts.length - 1].split(",");
    return '<svg class="sparkline" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.5" fill="' + color + '"/>' +
      '</svg>';
  };

  // [REAL DATA] Aggregates actual contribution/expense records by month,
  // for the current calendar year, Jan through the current month —
  // replacing the earlier random mockTrend() placeholder. Uses the same
  // global `data` (contributions) and `expenses` arrays, and the same
  // ForMonth/Year field names, that every other Contribution/Expense
  // view in the app already reads from — no new backend call, no new
  // data source, just a real aggregation of what's already loaded.
  var MONTH_NAMES_V2 = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  function monthlyTotalsThisYear(records) {
    var year = new Date().getFullYear();
    var uptoMonth = new Date().getMonth(); // 0=Jan ... so this includes the current month
    var totals = [];
    for (var m = 0; m <= uptoMonth; m++) {
      var monthName = MONTH_NAMES_V2[m];
      var sum = records
        .filter(function (r) { return String(r.Year) === String(year) && r.ForMonth === monthName; })
        .reduce(function (s, r) { return s + (parseFloat(r.Amount) || 0); }, 0);
      totals.push(sum);
    }
    return totals;
  }
  function populateSparklines() {
    var cSpark = document.getElementById("kpi_monthC_spark");
    var eSpark = document.getElementById("kpi_monthE_spark");
    // `data` (contributions) and `expenses` are the same globals every
    // other Contribution/Expense view in the app reads from — set by
    // smartRefresh() once the initial getAllData call resolves.
    var haveData = typeof data !== "undefined" && Array.isArray(data) && data.length > 0;
    var haveExpenses = typeof expenses !== "undefined" && Array.isArray(expenses) && expenses.length > 0;
    if (cSpark && !cSpark.dataset.done && haveData) {
      var cTotals = monthlyTotalsThisYear(data);
      // renderSparklineV2 itself no-ops below 2 points (e.g. viewing
      // January, only one month exists yet) — nothing extra needed here.
      cSpark.innerHTML = renderSparklineV2(cTotals, "#27ae60");
      cSpark.dataset.done = "1";
    }
    if (eSpark && !eSpark.dataset.done && haveExpenses) {
      var eTotals = monthlyTotalsThisYear(expenses);
      eSpark.innerHTML = renderSparklineV2(eTotals, "#e74c3c");
      eSpark.dataset.done = "1";
    }
  }
  setInterval(populateSparklines, 500);

  // ── PREVIEW→REAL: bulk export & bulk delete for Contributions ──
  // Reuses your existing single-record functions/backend action exactly —
  // no new backend endpoint. Delete loops one Id at a time, matching how
  // deleteContribution already works, and tracks each result individually.
  function _selectedContribIds() {
    return Array.from(document.querySelectorAll("#tb .cr2-row-check:checked"))
      .map(function (cb) { return cb.getAttribute("data-id"); })
      .filter(Boolean);
  }

  window.exportSelectedContribCSV = function () {
    var ids = _selectedContribIds();
    if (!ids.length) { toast("No rows selected.", "warn"); return; }
    // [FIX] This button used to call exportContribCSV() with no argument,
    // which ignores selection entirely and exports every record matching
    // the current search/date filters instead — confirmed directly:
    // 3 checked rows produced a 396-row file. Passing the actual selected
    // records fixes that; exportContribCSV() itself is unchanged for the
    // main "Export CSV" button.
    var selectedRecords = data.filter(function (c) { return ids.indexOf(String(c.Id)) !== -1; });
    exportContribCSV(selectedRecords);
  };

  window.deleteSelectedContribs = function () {
    var ids = _selectedContribIds();
    if (!ids.length) { toast("No rows selected.", "warn"); return; }
    var records = ids.map(function (id) { return data.find(function (c) { return String(c.Id) === String(id); }); }).filter(Boolean);

    var listHtml = records.map(function (c) {
      var user = (typeof users !== "undefined" ? users.find(function (u) { return String(u.UserId) === String(c.UserId); }) : null) || {};
      return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #fecaca;font-size:12.5px;">' +
        '<span><b style="color:#dc2626;">' + (user.Name || "Unknown") + '</b> — ' + (c.ForMonth || "") + ' ' + (c.Year || "") + '</span>' +
        '<span style="color:#b91c1c;">₹' + Number(c.Amount || 0).toLocaleString(APP.locale || "en-IN") + '</span></div>';
    }).join("");
    var detailHtml = '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin:0 0 4px;text-align:left;max-height:220px;overflow-y:auto;">' + listHtml + '</div>';

    confirmModal(
      "Delete " + records.length + " contribution" + (records.length > 1 ? "s" : "") + "?<br><br>" + detailHtml,
      async function () {
        var succeeded = [], failed = [];
        var _s = JSON.parse(localStorage.getItem("session") || "{}");
        // Sequential, one at a time — matches deleteContribution's own
        // pattern (and the backend's single-Id-per-call action) rather
        // than firing all requests in parallel, which is gentler on the
        // Apps Script quota and makes the per-item result unambiguous.
        for (var i = 0; i < records.length; i++) {
          var c = records[i];
          try {
            var res = await postData({ action: "deleteContribution", Id: c.Id, AdminName: _s.name || "Admin", sessionToken: _s.sessionToken || "", userId: _s.userId || "" });
            if (res && res.status === "deleted") succeeded.push(c); else failed.push(c);
          } catch (err) {
            failed.push(c);
          }
        }
        smartRefresh("contributions");
        // [FIX] The table's re-render doesn't reset the bulk bar (it's
        // driven by checkbox change events, which a full innerHTML
        // replace doesn't fire) — without this, "2 selected" and the
        // Export/Delete buttons stay on screen after the delete already
        // finished, even though every checkbox underneath is now fresh
        // and unchecked. Confirmed by testing the actual delete flow.
        var bar = document.getElementById("cr_bulkBar");
        if (bar) bar.classList.remove("visible");
        if (failed.length === 0) {
          toast("✅ " + succeeded.length + " of " + records.length + " deleted");
        } else {
          toast("⚠️ " + succeeded.length + " of " + records.length + " deleted — " + failed.length + " failed", "warn");
        }
      },
      "Delete " + records.length,
      "#e74c3c"
    );
  };

  // tbodyId: the <tbody> id whose rows have .cr2-row-check checkboxes
  // barId/countId: the bulk bar + its count span for that table
  window._bulkToggleAll = function (checkbox, tbodyId, barId, countId) {
    document.querySelectorAll("#" + tbodyId + " .cr2-row-check").forEach(function (cb) {
      cb.checked = checkbox.checked;
      cb.closest("tr").classList.toggle("selected", checkbox.checked);
    });
    window._bulkOnRowCheck(tbodyId, barId, countId);
  };
  window._bulkOnRowCheck = function (tbodyId, barId, countId) {
    var checked = document.querySelectorAll("#" + tbodyId + " .cr2-row-check:checked");
    var bar = document.getElementById(barId);
    var count = document.getElementById(countId);
    if (!bar || !count) return;
    count.textContent = checked.length;
    bar.classList.toggle("visible", checked.length > 0);
    document.querySelectorAll("#" + tbodyId + " .cr2-row-check").forEach(function (cb) {
      cb.closest("tr").classList.toggle("selected", cb.checked);
    });
  };
  // Back-compat wrappers for the Contribution page's original hookup
  window._cr2ToggleAll = function (checkbox) { window._bulkToggleAll(checkbox, "tb", "cr_bulkBar", "cr_bulkCount"); };
  window._cr2OnRowCheck = function () { window._bulkOnRowCheck("tb", "cr_bulkBar", "cr_bulkCount"); };

  // ── PREVIEW: collapsible filter panel — generic open/close, used by
  // any page with a .filter-v2 wrapper (class toggle only, CSS handles
  // the rest via .filter-v2.open) ──
  window._filterV2Toggle = function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle("open");
  };
})();
