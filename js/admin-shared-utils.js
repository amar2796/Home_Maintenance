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
            <button onclick="document.getElementById('user').focus()" style="background:#0F766E;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;">
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
        <td><div style="display:flex;align-items:center;gap:8px;">${_avatarHtml(isWalkIn ? null : users.find((u) => String(u.UserId) === String(c.UserId)), 24)}<b>${escapeHtml(name)}</b>${walkInBadge}</div></td>
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
      if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(document.getElementById("tb"));
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
        <button class="_mbtn" style="background:#0F766E;" onclick="saveEditContrib('${id}')"><i class="fa-solid fa-check"></i> Save Changes</button>
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
            <button onclick="document.getElementById('title').focus()" style="background:#0F766E;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;">
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
      for (let y = _getProjectStartYear(); y <= cur + 1; y++) years.add(y);
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
        return '<span style="display:inline-flex;align-items:center;gap:4px;background:#fef9ec;border:1px solid #5EEAD4;border-radius:20px;padding:3px 10px;font-size:10px;font-weight:600;color:#92400e;cursor:pointer;" onclick="window._expClearTag(' + i + ')">' +
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
        <button class="_mbtn" style="background:#0F766E;" onclick="saveEditExpense('${id}','${e.Year || new Date().getFullYear()
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
    // [FIX-SEARCH] The Users tab is loaded from a separate file (pages/usersPage.html)
    // AFTER this script's DOMContentLoaded already fired, so a one-time
    // getElementById + addEventListener setup here could never reach it — it was
    // left running on its raw, un-debounced onkeyup="renderUsers()" (still in that
    // file), which didn't reliably fire on the very first keystroke depending on
    // exactly when the fragment got injected. Event delegation on document instead
    // works no matter when the tab's HTML is loaded or reloaded — the browser
    // checks e.target itself, no reference to the specific element needed.
    document.addEventListener("input", function (e) {
      if (e.target && e.target.id === "userSearchInput") _renderUsersDebounced();
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
        if (st === "pending") return `<span class="badge" style="background:#fff3e0;color:#e67e22;border:1px solid #0F766E;">Pending</span>`;
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
              // [FIX] Previously ONLY checked contribution total — an Admin
              // account with ₹0 contributions (e.g. a freshly created admin,
              // or one who never personally contributed) could be deleted
              // outright via this button. Admin accounts should never be
              // deletable at all — Enable/Disable (already available via
              // status) is the correct way to remove admin access safely.
              var isAdmin = String(u.Role || "").toLowerCase() === "admin";
              var ct = (typeof data !== "undefined" ? data : [])
                .filter(function(c){ return String(c.UserId) === String(u.UserId); })
                .reduce(function(s,c){ return s + Number(c.Amount||0); }, 0);
              if (isAdmin) {
                return '<button class="btn-sm btn-danger" style="background:#cbd5e1;cursor:not-allowed;opacity:0.55;" disabled title="Admin accounts cannot be deleted. Use Enable/Disable instead."><i class="fa-solid fa-trash"></i></button>';
              }
              return ct === 0
                ? '<button class="btn-sm btn-danger" onclick="event.stopPropagation();deleteUser(\'' + u.UserId + '\')" title="Delete User"><i class="fa-solid fa-trash"></i></button>'
                : '<button class="btn-sm btn-danger" style="background:#cbd5e1;cursor:not-allowed;opacity:0.55;" disabled title="Cannot delete: user has \u20b9' + fmt(ct) + ' in contributions. Set status to Inactive instead."><i class="fa-solid fa-trash"></i></button>';
            })() + `
            `;
        const _fbSvg = "Image/logo.PNG";
        const _fbSvgFallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%230F766E'/%3E%3Ctext x='16' y='21' text-anchor='middle' fill='white' font-size='14' font-family='Arial'%3E%26%23128100%3B%3C/text%3E%3C/svg%3E";
        return `
      <tr class="${rowClass}" onclick="viewUser('${u.UserId}')" title="Click to view details">
        <td onclick="event.stopPropagation();openEditUser('${u.UserId}')" title="Click to edit user" style="cursor:pointer;">
          <img src="${u.PhotoURL ? '' : _fbSvg}"
               data-userid="${escapeHtml(String(u.UserId))}"
               onerror="this.onerror=null;this.src='${_fbSvgFallback}'"
               width="32" height="32" style="border-radius:50%;object-fit:cover;background:#eee;border:2px solid #0F766E;display:block;"/>
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
        // [FIX] These three existed on the user record (used in the Edit form)
        // but were never shown in the read-only Member Details view.
        ["Monthly Target",     (APP.currency||'₹') + ' ' + fmt(Number(u.MonthlyTarget || 0))],
        ["Date of Birth",      escapeHtml(u.DOB || "—")],
        ["Contribution Start", escapeHtml(u.ContribStartDate || "—")],
        ["Total Contributions",'<span style="color:#27ae60;font-weight:700;">' + (APP.currency||'₹') + ' ' + fmt(contribTotal) + '</span>'],
      ];
      const tableRows = rows.map(function(r) {
        return '<tr>'
          + '<td style="padding:10px 14px;font-size:13px;color:#64748b;white-space:nowrap;border-bottom:1px solid #f1f5f9;vertical-align:top;width:38%;">' + r[0] + '</td>'
          // [FIX-SAFARI] word-break/overflow-wrap directly on a <td> — especially
          // combined with text-align:right + table-layout:fixed — is a known
          // WebKit/Safari rendering gap: it's spec-correct CSS but Safari's table
          // engine doesn't reliably act on it, so the cell just overflows past the
          // modal instead of wrapping (confirmed: happened only for the one value
          // long enough to actually NEED wrapping — Name/Mobile just happened to
          // fit already). Wrapping the value in an inner <div> forces Safari to
          // treat it as a normal block box constrained by the cell's fixed width,
          // which it DOES wrap correctly — this is the standard fix for this
          // specific Safari table-cell gap, not just re-hiding the overflow.
          + '<td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;vertical-align:top;width:62%;">'
          +   '<div style="font-size:13px;color:#1e293b;font-weight:600;text-align:right;overflow-wrap:anywhere;word-break:break-word;">' + r[1] + '</div>'
          + '</td>'
          + '</tr>';
      }).join("");
      const _safeId = String(id).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      // [FIX] Admin accounts can never be deleted, regardless of contribution
      // total — same rule as the table row's delete button. Use Enable/Disable
      // (Status) instead, which already exists for exactly this purpose.
      const _isAdmin = String(u.Role || "").toLowerCase() === "admin";
      const _canDelete = !_isAdmin && contribTotal === 0;
      const _deleteBtnStyle = _canDelete
        ? 'background:#e74c3c;cursor:pointer;'
        : 'background:#cbd5e1;cursor:not-allowed;opacity:0.55;';
      const _deleteBtnTitle = _isAdmin
        ? 'Admin accounts cannot be deleted. Use Enable/Disable instead.'
        : (_canDelete
            ? 'Delete User'
            : 'Cannot delete: user has contributions. Set status to Inactive instead.');
      const _deleteBtnOnclick = _canDelete
        ? 'onclick="closeModal();deleteUser(\'' + _safeId + '\')"'
        : '';
      const html = '<div class="_mhdr"><h3><i class="fa-solid fa-eye" style="color:#0F766E;margin-right:6px;"></i> Member Details</h3><button class="_mcls" onclick="closeModal()">×</button></div>'
        + '<div class="_mbdy" style="padding:10px 16px;">'
        + '<table style="width:100%;table-layout:fixed;border-collapse:collapse;">' + tableRows + '</table>'
        + '</div>'
        + '<div class="_mft">'
        + '<button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Close</button>'
        + '<button class="_mbtn" style="' + _deleteBtnStyle + '" ' + _deleteBtnOnclick + ' title="' + _deleteBtnTitle + '" ' + (_canDelete ? '' : 'disabled') + '><i class="fa-solid fa-trash"></i> Delete</button>'
        + '<button class="_mbtn" style="background:linear-gradient(135deg,#0F766E,#e8920a);" onclick="closeModal();openEditUser(\'' + _safeId + '\')"><i class="fa-solid fa-pen"></i> Edit</button>'
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
              onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'72\' height=\\'72\\'><circle cx=\\'36\\' cy=\\'36\\' r=\\'36\\' fill=\\'%230F766E\\'/></svg>'"
              style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid #0F766E;background:#faeeda;display:block;margin-bottom:0;"/>
            <div onclick="document.getElementById('eu_photoFile').click()" style="position:absolute;bottom:1px;right:1px;width:22px;height:22px;background:#0F766E;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.2);" title="Change Photo">
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
        <input class="_fi" type="text" id="eu_dob" readonly placeholder="dd-mm-yyyy — tap to select" style="cursor:pointer;" value="${escapeHtml(u.DOB || '')}" onclick="fld_openCal('eu_dob',1900,new Date().getFullYear())"/>
        <label class="_fl">Contribution Start Date
          <span style="color:#bbb;font-weight:400;font-size:10px;">
            — used by Tracker for late-joining members; leave blank to use their first contribution
          </span>
        </label>
        <!-- min-year computed live at click time via _getProjectStartYear() -->
        <input class="_fi" type="text" id="eu_contrib_start" readonly placeholder="dd-mm-yyyy — tap to select" style="cursor:pointer;margin-bottom:0;" value="${escapeHtml(u.ContribStartDate || '')}" onclick="fld_openCal('eu_contrib_start',_getProjectStartYear(),new Date().getFullYear()+1)"/>
        ${String(u.InactiveSince||'').trim() ? `<div style="font-size:11px;color:#94a3b8;margin-top:6px;"><i class="fa-solid fa-circle-info"></i> Inactive since ${escapeHtml(u.InactiveSince)} — Tracker stopped counting pending for this member from that date.</div>` : ''}
      </div>
      <div class="_mft">
        <button class="_mbtn" style="background:#999;" onclick="closeModal();_adminPendingCroppedB64='';">Cancel</button>
        <button class="_mbtn" style="background:#0F766E;" onclick="saveEditUser('${id}')"><i class="fa-solid fa-check"></i> Save Changes</button>
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
              ContribStartDate: _inputValToDob(document.getElementById("eu_contrib_start")?.value || ""),
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
          ContribStartDate: _inputValToDob(document.getElementById("eu_contrib_start")?.value || ""),
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
      if (savedEl) { savedEl.textContent = '⏳ Saving…'; savedEl.style.opacity = '1'; savedEl.style.color = '#0F766E'; }

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
      let total = 0, count = 0;
      rows.forEach((r) => {
        let a = parseFloat(r.querySelector(".bk-amt").value) || 0;
        if (a > 0) { total += a; count++; }
      });
      let t = document.getElementById("bk_total");
      if (t) t.textContent = (APP.currency||"₹") + total.toLocaleString(APP.locale||"en-IN");
      let c = document.getElementById("bk_total_count");
      if (c) c.textContent = count + (count === 1 ? " entry added" : " entries added");
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
      // [MOBILE-FIX] Some mobile WebKit builds fail to repaint a flex/scroll
      // container after many children are appended in a tight loop — the rows
      // exist in the DOM (totals calculate correctly) but don't visually paint
      // until something forces a reflow. This forces one with no visible flicker.
      void container.offsetHeight;
      container.style.display = "none";
      void container.offsetHeight;
      container.style.display = "";
    }

    function openBulkInsert() {
      if (!checkSession()) return;
      let userOpts = '<option value="">-- Select Member --</option>' + users
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
        <div class="sp-steps" id="sp-bulk-steps"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
          <div><label class="_fl">Member <span style="color:#e74c3c">*</span></label>
            <div id="bk_user_cmbWrap" style="position:relative;">
              <div id="bk_user_cmbBtn" class="_fi" onclick="_cmbToggle('bk_user')" tabindex="0" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;margin-bottom:0;">
                <span id="bk_user_cmbBtnLabel" style="color:#94a3b8;">-- Select Member --</span>
                <i class="fa-solid fa-chevron-down" style="font-size:12px;color:#94a3b8;"></i>
              </div>
              <div id="bk_user_cmbList" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:50;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:240px;overflow-y:auto;"></div>
            </div>
            <select class="_fi" id="bk_user" onchange="_updateBkMemberPreview(this.value)" style="display:none;">${userOpts}</select>
            <div id="bk-member-preview" style="display:none;align-items:center;gap:8px;margin-top:8px;padding:7px 10px;background:#f8fafc;border:1px solid #eef2f6;border-radius:8px;"></div>
          </div>
          <div><label class="_fl">Year <span style="color:#e74c3c">*</span></label><select class="_fi" id="bk_year">${yearOpts}</select></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
          <div><label class="_fl">Contribution Type <span style="color:#e74c3c">*</span></label><select class="_fi" id="bk_type">${typeOpts}</select></div>
          <div><label class="_fl">Note <span style="font-size:10px;color:#94a3b8;font-weight:400;">(optional)</span></label><input class="_fi" id="bk_note" placeholder="e.g. Annual"/></div>
        </div>

        <!-- Running total, pinned above the row list so it's always visible -->
        <div class="bk-total-bar">
          <span id="bk_total_count">0 entries added</span>
          <b id="bk_total">₹0</b>
        </div>

        <div style="display:flex;align-items:flex-end;gap:10px;margin-bottom:14px;background:#fdf8ee;border-radius:10px;padding:12px 14px;border:1px solid #5EEAD4;">
          <div style="flex:1;">
            <label class="_fl" style="margin-top:0;">Default Amount (₹) <span style="font-size:10px;color:#94a3b8;font-weight:400;">— fill all 12 months at once</span></label>
            <input class="_fi" id="bk_default_amt" type="number" min="1" placeholder="e.g. 500" oninput="_bkRenderRows()"/>
          </div>
          <button type="button" onclick="bkFillAllMonths()" style="background:#0F766E;box-shadow:none;padding:11px 16px;white-space:nowrap;flex-shrink:0;border-radius:9px;font-size:12.5px;color:#fff;border:none;cursor:pointer;font-family:Poppins,sans-serif;font-weight:700;">
            <i class="fa-solid fa-calendar-check"></i> Fill All 12
          </button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:12px;font-weight:700;color:#334155;"><i class="fa-solid fa-list-ul" style="color:#0F766E;margin-right:5px;"></i> Month Entries</span>
          <button type="button" onclick="bkAddRow('','')" style="background:#334155;box-shadow:none;padding:7px 14px;font-size:12px;border-radius:8px;color:#fff;border:none;cursor:pointer;font-family:Poppins,sans-serif;font-weight:600;">
            <i class="fa-solid fa-plus"></i> Add Row
          </button>
        </div>
        <div id="bk_rows" style="flex:1;min-height:220px;overflow-y:auto;padding-right:2px;"></div>
        <div id="bk_status" style="font-size:12px;color:#27ae60;font-weight:600;min-height:18px;margin-top:8px;"></div>
        <div class="sp-actions" style="margin-top:16px;">
          <button class="sp-save-btn" style="background:#334155;color:#fff;" onclick="runBulkInsert()">
            <i class="fa-solid fa-arrow-right"></i> Review Entries
          </button>
          <button class="sp-cancel-btn" onclick="spClose()">Cancel</button>
        </div>`;

      spOpen("bulk");
      spRenderSteps("sp-bulk-steps", 1);
      if (typeof _cmbSyncLabel === "function") _cmbSyncLabel("bk_user");
      if (typeof _updateBkMemberPreview === "function") _updateBkMemberPreview("");
      // Add one empty row to start
      bkAddRow("", "");
    }

    async function runBulkInsert() {
      if (!checkSession()) return;
      let userId = document.getElementById("bk_user").value;
      let year = document.getElementById("bk_year").value;
      let typeId = document.getElementById("bk_type").value;
      // Default Note to "Jai Shree Ram" when admin leaves it blank; if admin
      // typed something, that's used as-is. (Same behavior as Add Contribution.)
      let note = document.getElementById("bk_note").value;
      if (!note || !note.trim()) note = "Jai Shree Ram";
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
            <td style="padding:6px 6px;font-size:12px;color:#64748b;">${i + 1}</td>
            <td style="padding:6px 6px;font-size:12px;font-weight:600;white-space:nowrap;">${escapeHtml(r.month)}</td>
            <td style="padding:4px 6px;font-size:12px;">
              <div style="display:flex;align-items:center;gap:4px;">
                <span style="color:#64748b;font-weight:600;">₹</span>
                <input type="number" min="1" class="bkprev-amt" data-idx="${i}" value="${Number(r.amount)}"
                  style="width:64px;min-width:0;border:1.5px solid #e2e8f0;border-radius:6px;padding:4px 5px;font-size:12px;font-weight:700;color:#15803d;font-family:inherit;"
                  oninput="_bkPrevUpdateTotal()" />
                <button onclick="this.closest('tr').remove();_bkPrevUpdateTotal();" style="background:#fef2f2;border:1px solid #fca5a5;color:#e74c3c;padding:3px 7px;font-size:11px;border-radius:5px;box-shadow:none;transform:none;flex-shrink:0;" title="Remove row">✕</button>
              </div>
            </td>
          </tr>`
      ).join("");

      const previewHtml = `
          <div class="_mhdr"><h3><i class="fa-solid fa-eye" style="color:#0F766E;margin-right:6px;"></i> Preview & Confirm Bulk Insert</h3><button class="_mcls" onclick="closeModal()">&#xd7;</button></div>
          <div class="_mbdy">
            <div style="background:linear-gradient(135deg,#fef9ee,#fff8e1);border:1.5px solid #0F766E44;border-radius:12px;padding:12px 16px;margin-bottom:14px;font-size:12.5px;color:#946c44;">
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
            <!-- [MOBILE-FIX] Wrapped in its own scroll container: .sp-panel/modal ancestors use
                 overflow:hidden, so on narrow phones a table wider than the screen was silently
                 clipping the amount input / remove button off-screen instead of scrolling to them.
                 min-width keeps columns from over-compressing; overflow-x:auto makes the rest
                 reachable by a swipe if a phone is still too narrow after the size reductions above. -->
            <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #e2e8f0;border-radius:10px;">
            <table style="width:100%;min-width:300px;border-collapse:collapse;" id="bkprev_table">
              <thead><tr style="background:#f1f5f9;">
                <th style="padding:7px 6px;font-size:11px;text-align:left;color:#64748b;">#</th>
                <th style="padding:7px 6px;font-size:11px;text-align:left;color:#64748b;">Month</th>
                <th style="padding:7px 6px;font-size:11px;text-align:left;color:#64748b;">Amount (editable)</th>
              </tr></thead>
              <tbody>${previewRows}</tbody>
              <tfoot><tr style="background:#fef9ee;">
                <td colspan="2" style="padding:8px 6px;font-size:13px;font-weight:700;color:#78350f;" id="bkprev_countLabel">Total (${rows.length} entr${rows.length === 1 ? "y" : "ies"})</td>
                <td style="padding:8px 6px;font-size:13px;font-weight:700;color:#15803d;" id="bkprev_total">${APP.currency||'₹'}${totalAmt.toLocaleString(APP.locale||"en-IN")}</td>
              </tr></tfoot>
            </table>
            </div>
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
        <div class="sp-steps">${spStepsBar(2)}</div>
        <div style="background:linear-gradient(135deg,#fef9ee,#fff8e1);border:1.5px solid #0F766E55;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:12.5px;color:#946c44;">
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
          <span style="font-size:12px;font-weight:700;color:#334155;"><i class="fa-solid fa-list-ul" style="color:#0F766E;margin-right:5px;"></i> Month Entries</span>
          <span id="bkprev_countLabel" style="font-size:12px;color:#78350f;font-weight:600;">Total (${rows.length} entr${rows.length === 1 ? "y" : "ies"})</span>
        </div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:10px;border:1px solid #e2e8f0;">
        <table style="width:100%;min-width:300px;border-collapse:collapse;" id="bkprev_table">
          <thead><tr style="background:#f1f5f9;">
            <th style="padding:8px 6px;font-size:11px;text-align:left;color:#64748b;font-weight:600;">#</th>
            <th style="padding:8px 6px;font-size:11px;text-align:left;color:#64748b;font-weight:600;">Month</th>
            <th style="padding:8px 6px;font-size:11px;text-align:left;color:#64748b;font-weight:600;">Amount (editable)</th>
          </tr></thead>
          <tbody>${previewRows}</tbody>
          <tfoot><tr style="background:#fef9ee;border-top:2px solid #5EEAD4;">
            <td colspan="2" style="padding:9px 6px;font-size:13px;font-weight:700;color:#78350f;" id="bkprev_countLabel2">Total (${rows.length} entr${rows.length === 1 ? "y" : "ies"})</td>
            <td style="padding:9px 6px;font-size:14px;font-weight:700;color:#15803d;" id="bkprev_total">${APP.currency||'₹'}${totalAmt.toLocaleString(APP.locale||"en-IN")}</td>
          </tr></tfoot>
        </table>
        </div>
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
      // [GUARANTEE] Give each row a stable idempotency key, once, right here.
      // This is the ONLY place finalRows is built fresh from _pendingBulkRows —
      // _retryBulkFailed() below only ever filters THESE same row objects, so
      // the key survives into every retry of this same row untouched. postData()
      // sends this key to the backend; a retried row is recognized as "the same
      // request again" instead of becoming a second row in the sheet.
      finalRows.forEach(function(r) {
        if (!r.idemKey) r.idemKey = "bulk_" + Date.now() + "_" + Math.random().toString(36).slice(2) + "_" + r.month;
      });
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
          sessionToken: s.sessionToken || "", userId: s.userId || "",
          IdempotencyKey: _br.idemKey
        }).catch(function() { return { status: "error" }; });
        results.push(_bres);
        // 250ms gap between requests — lets Google Sheets commit each row before next write
        if (_bi < finalRows.length - 1) {
          await new Promise(function(res) { setTimeout(res, 250); });
        }
      }

      // [ORDER-FIX] Fetch fresh data BEFORE the dedup check below, not after.
      // mandirCacheBust() only invalidates the cache — it doesn't refresh the
      // `data` array the dedup check reads. Previously `data` still held
      // whatever was loaded before this bulk run started, so _bulkEntryExists()
      // could never see rows this very run had just (silently) saved on the
      // backend despite an error response — it was checking against stale data.
      if (typeof mandirCacheBust === "function") mandirCacheBust("getAllData");
      try {
        if (typeof getCached === "function") {
          var _freshAllData = await getCached("getAllData");
          if (_freshAllData && Array.isArray(_freshAllData.contributions)) {
            data = _freshAllData.contributions;
          }
        }
      } catch (_e) { /* fall back to whatever `data` already had — best effort only */ }

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
          '<div class="sp-steps">' + spStepsBar(3) + '</div>' +
          '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:340px;text-align:center;padding:20px;">' +
            '<div style="width:72px;height:72px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #6ee7b7;animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
              '<i class="fa-solid fa-circle-check" style="color:#16a34a;font-size:2rem;"></i>' +
            '</div>' +
            '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Bulk Insert Complete!</div>' +
            '<div style="font-size:13px;font-weight:600;color:#15803d;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:7px 16px;margin-bottom:6px;">' + actuallySaved + ' of ' + finalRows.length + ' entries added</div>' +
            (failedRows.length > 0 ? '<div style="font-size:12px;color:#dc2626;margin-bottom:4px;">' + failedRows.length + ' entr' + (failedRows.length > 1 ? 'ies' : 'y') + ' failed</div>' + failedMonthsHtml : '') +
          '</div>' +
          '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
            (failedRows.length > 0
              ? '<button class="sp-save-btn" style="background:#e74c3c;color:#fff;" onclick="_editRetryBulk()">' +
                  '<i class="fa-solid fa-pen"></i> Edit &amp; Retry (' + failedRows.length + ')' +
                '</button>' +
                '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryBulkFailed()" title="Resend the exact same amounts">' +
                  '<i class="fa-solid fa-rotate-right"></i> Retry as-is' +
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
          '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
            '<button class="sp-save-btn" style="background:#e74c3c;color:#fff;" onclick="_editRetryBulk()">' +
              '<i class="fa-solid fa-pen"></i> Edit &amp; Retry (' + finalRows.length + ')' +
            '</button>' +
            '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryBulkFailed()" title="Resend the exact same amounts">' +
              '<i class="fa-solid fa-rotate-right"></i> Retry All as-is' +
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