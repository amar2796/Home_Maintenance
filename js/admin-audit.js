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
          : isLogout ? "background:#fef3c7;color:#d97706;border:1px solid #5EEAD4;"
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
      if (tb) { tb.style.background = "#0F766E"; tb.innerHTML = '<i class="fa-solid fa-calendar-day"></i> Today'; }
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