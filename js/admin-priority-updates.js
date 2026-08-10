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

      // ── Hook into showPage to run page-specific init logic on navigation
      const _origShowPage = window.showPage;
      if (typeof _origShowPage === "function") {
        window.showPage = function (id, el) {
          _origShowPage(id, el);
          if (id === "broadcastPage") _loadBroadcastHistory();
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