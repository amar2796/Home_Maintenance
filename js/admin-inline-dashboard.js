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
      for (let y = _getProjectStartYear(); y <= yr; y++) years.add(y);
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
      // Toggle which folder tab is "open" (color comes from the button's
      // static tab-type-contrib/tab-type-expense class + this is-active flag)
      document.getElementById("dash_tab_contrib").classList.toggle("is-active", tab === "contrib");
      document.getElementById("dash_tab_expense").classList.toggle("is-active", tab === "expense");
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
      doc.setTextColor(15, 118, 110); doc.setFontSize(14); doc.setFont(undefined,"bold");
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