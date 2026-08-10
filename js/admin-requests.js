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

    // ── Duplicate UTR/reference-number detection ──────────────────────
    // Flags when the same UPI/cheque reference number has been submitted
    // more than once (by the same member or different members), so admin
    // can double-check before approving instead of relying on eyeballing.
    function _findDuplicateUtrMatches(utr, excludeReqId) {
      const norm = String(utr || "").trim().toLowerCase();
      if (!norm) return [];
      return (window._allRequests || []).filter(function (r) {
        return String(r.ReqId) !== String(excludeReqId) &&
          String(r.UtrRef || "").trim().toLowerCase() === norm;
      });
    }

    function _utrDuplicateBadgeHtml(utr, excludeReqId) {
      const matches = _findDuplicateUtrMatches(utr, excludeReqId);
      if (matches.length === 0) return "";
      const names = matches.map(function (m) {
        const u = (users || []).find(function (u) { return String(u.UserId) === String(m.UserId); });
        return escapeHtml(u ? u.Name : "Unknown") + " (" + escapeHtml(String(m.Status || "Pending")) + ")";
      }).join(", ");
      return '<div title="Same reference number also used by: ' + names + '" '
        + 'style="margin-top:3px;display:inline-flex;align-items:center;gap:4px;background:#fef2f2;color:#991b1b;'
        + 'border:1px solid #fca5a5;border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700;cursor:help;">'
        + '<i class="fa-solid fa-triangle-exclamation"></i> Ref used ' + (matches.length + 1) + '×</div>';
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
          + '<td><div style="display:flex;align-items:center;gap:8px;">' + _avatarHtml(u,26) + '<div><strong>' + name + '</strong><br><span style="font-size:11px;color:#94a3b8;">' + mobile + '</span></div></div></td>'
          + '<td><strong style="color:#15803d;">' + (APP.currency||'₹') + fmt(r.Amount) + '</strong></td>'
          + '<td>' + escapeHtml(r.ForMonth || "") + ' ' + escapeHtml(String(r.Year || "")) + '</td>'
          + '<td>' + escapeHtml(r.PaymentMode || "UPI") + '</td>'
          + '<td style="font-size:12px;"><span style="font-family:monospace;">' + escapeHtml(r.UtrRef || "—") + '</span><br>' + _utrDuplicateBadgeHtml(r.UtrRef, r.ReqId) + '</td>'
          + '<td>' + slipHtml + '</td>'
          + '<td><span style="background:' + (statusBg[st] || "#f1f5f9") + ';color:' + (statusColor[st] || "#334155") + ';padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">' + st + '</span>' + rejNote + '</td>'
          + '<td style="font-size:11px;color:#64748b;">' + escapeHtml(formatPaymentDate(r.RequestedAt || "").split(" ")[0] || "") + '</td>'
          + '<td style="white-space:nowrap;">' + actBtns + '</td>'
          + '</tr>';
      }).join("");
      if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(tbody);
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
        + (_findDuplicateUtrMatches(r.UtrRef, r.ReqId).length > 0
            ? '<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#991b1b;">'
              + '<i class="fa-solid fa-triangle-exclamation"></i> This reference number has also been used by: '
              + escapeHtml(_findDuplicateUtrMatches(r.UtrRef, r.ReqId).map(function (m) {
                  const u2 = (users || []).find(function (u2) { return String(u2.UserId) === String(m.UserId); });
                  return (u2 ? u2.Name : "Unknown") + " (" + (m.Status || "Pending") + ")";
                }).join(", "))
              + '. Please verify before approving.</div>'
            : '')
        + '<div style="margin-bottom:14px;">'
        + '<label style="font-size:13px;font-weight:600;color:#334155;display:block;margin-bottom:6px;"><i class="fa-solid fa-tag" style="color:#0F766E;margin-right:4px;"></i> Contribution Type <span style="font-weight:400;color:#e74c3c;">*</span></label>'
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
          // [GUARANTEE] Unlike bulk/single-add, this flow builds a brand-new
          // payload object on every click (no stored-payload retry), so
          // postData()'s auto-generated key would be different each time —
          // a re-click after a false "failed" would create a duplicate.
          // Deriving the key from the request's own ReqId instead makes
          // approving the same request idempotent no matter how many times
          // the admin clicks "Approve & Record" after a timeout.
          IdempotencyKey: "approve_" + (r.ReqId || "")
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
      a.href = url; a.download = "Home_Backup_" + new Date().toISOString().slice(0, 10) + ".csv";
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
      doc.setTextColor(15, 118, 110); doc.setFontSize(14); doc.setFont(undefined, "bold");
      doc.text((typeof APP !== "undefined" ? APP.name : "Home").toUpperCase(), W / 2, 12, { align: "center" });
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
          headStyles: { fillColor: [30, 41, 64], textColor: [15, 118, 110], fontSize: 9 },
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
          var emailBdr = pct >= 90 ? "#fca5a5" : pct >= 70 ? "#5EEAD4" : "#86efac";
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
        cfg = { bg:"#fffbeb", border:"#5EEAD4", ico:"🟡", ttl:"Warnings", dtl: warnings.join(" · ") };
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