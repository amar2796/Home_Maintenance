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
      const cur = new Date().getFullYear();
      for (let y = _getProjectStartYear(); y <= cur + 1; y++) years.add(y);
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
            const _rowUser = isWalkIn ? null : dash_users.find(x => String(x.UserId) === String(c.UserId));
            const tName = dash_types.find(x => String(x.TypeId) === String(c.TypeId))?.TypeName || "Contribution";
            const oName = dash_occasions.find(x => String(x.OccasionId) === String(c.OccasionId))?.OccasionName || "—";
            const rid   = (c.ReceiptID || "").replace(new RegExp("^" + (APP.legacyReceiptPrefix||"TRX") + "-"), (APP.receiptPrefix||"REC") + "-");
            const _drid = _storeReceipt(c, name, tName, oName);
            const streak = isWalkIn
              ? `<div class="ct-streak" style="opacity:.25;">${"<div class='ct-sd ct-sd-off'></div>".repeat(12)}</div>`
              : `<div class="ct-streak">${_ct_streak(c.UserId)}</div>`;
            return `<tr class="clickable-row" style="cursor:pointer;" onclick="viewDashboardEntry('${_drid}')">
              <td>${escapeHtml(_ct_fmtDate(c.PaymentDate))}</td>
              <td><span style="background:#F0FDFA;color:#115E59;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;font-family:monospace;">${escapeHtml(rid||"—")}</span></td>
              <td><div style="display:flex;align-items:center;gap:6px;">${_avatarHtml(_rowUser,20)}<b>${escapeHtml(name)}</b></div></td>
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
              <td><div style="display:flex;align-items:center;gap:6px;">${_avatarHtml(u,20)}<b style="color:#c2410c;">${escapeHtml(u.Name||"")}</b></div></td>
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
      if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(tbody);

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
        const uObj    = dash_users.find(x => String(x.UserId) === String(uid));
        const streak  = _ct_streak(uid);
        return `<div style="background:#fff;border-radius:10px;border:1px solid #e2e8f0;padding:13px 14px;">
          <div style="margin-bottom:7px;">${_avatarHtml(uObj, 36)}</div>
          <div style="font-size:12px;font-weight:600;color:#1e293b;margin-bottom:2px;">${escapeHtml(name)}</div>
          <div style="font-size:16px;font-weight:700;color:#15803d;">${APP.currency||"₹"}${fmt(map[uid])}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px;">12-month streak</div>
          <div class="ct-streak" style="margin-top:5px;">${streak}</div>
        </div>`;
      }).join("");
      if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(el);
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
        return `<tr><td style="font-weight:600;font-size:11px;"><div style="display:flex;align-items:center;gap:6px;">${_avatarHtml(u,18)}<span>${escapeHtml(u.Name||"")}</span></div></td>${cells}<td style="font-weight:700;color:#15803d;font-size:11px;">${APP.currency||"₹"}${fmt(total)}</td></tr>`;
      }).join("");

      tbl.innerHTML = hdr + `<tbody>${rows}</tbody>`;
      if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(tbl);
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
      // NOTE: pop is `position:fixed` — top/left must be viewport-relative only.
      // Do NOT add window.scrollX/scrollY (that was double-counting scroll offset).
      const popH = 320;
      let top = rect.bottom + 4;
      if (top + popH > window.innerHeight) top = Math.max(8, rect.top - popH - 4);
      let left = rect.left;
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
      // Range band: when both a start and end are picked, dates strictly between
      // them get a soft teal-tint background so the selected span reads at a glance.
      const rangeLo = startVal && endVal ? (startVal < endVal ? startVal : endVal) : "";
      const rangeHi = startVal && endVal ? (startVal < endVal ? endVal : startVal) : "";
      const g = document.getElementById("dash_calGrid");
      if (!g) return;
      const _calParts = ["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => `<div style="text-align:center;font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.03em;padding:4px 0 8px;">${d}</div>`);
      for (let i = 0; i < firstDay; i++) _calParts.push(`<div class="dc-day dc-empty"></div>`);
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = _dash_calYear + "-" + String(_dash_calMonth+1).padStart(2,"0") + "-" + String(d).padStart(2,"0");
        const isToday = d===today.getDate() && _dash_calMonth===today.getMonth() && _dash_calYear===today.getFullYear();
        const isSel   = dateStr===startVal || dateStr===endVal;
        const inRange = rangeLo && dateStr > rangeLo && dateStr < rangeHi;
        let cls = "dc-day", bg = "transparent", co = "#334155", fw = 400, extra = "";
        if (inRange) { bg = "#F0FDFA"; co = "#0F766E"; }
        if (isToday && !isSel) { extra = "box-shadow:inset 0 0 0 1.5px #0F766E;"; co = "#0F766E"; fw = 700; }
        if (isSel) { cls += " dc-sel"; bg = "#0F766E"; co = "#fff"; fw = 700; }
        _calParts.push(`<div class="${cls}" onclick="dash_pickDate('${dateStr}')" style="text-align:center;font-size:12px;line-height:28px;height:28px;width:28px;margin:0 auto;border-radius:9px;cursor:pointer;background:${bg};color:${co};font-weight:${fw};${extra}transition:background .12s;">${d}</div>`);
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

    /* ── Reusable single-date calendar (Add/Edit User → DOB, ContribStartDate) ──
       Field itself stores/display dd-MM-yyyy directly (the sheet's native format) —
       no yyyy-mm-dd round-trip needed. _inputValToDob() already passes dd-MM-yyyy
       straight through unchanged (its yyyy-mm-dd regex won't match), so save code
       needs zero changes. ────────────────────────────────────────────────────── */
    var _fld_calTargetId = "";
    var _fld_calYear  = new Date().getFullYear();
    var _fld_calMonth = new Date().getMonth();
    var _fld_calMin   = 1900;
    var _fld_calMax   = new Date().getFullYear() + 1;
    var _fld_closeCalBound = null; // currently-attached outside-click listener, if any

    function fld_openCal(inputId, minYear, maxYear) {
      // Clear any listener left over from a previously-open field's calendar —
      // otherwise switching fields (e.g. ContribStartDate → DOB) lets that stale
      // listener see this same click as "clicked outside" and re-close the popup
      // right after it opens.
      if (_fld_closeCalBound) { document.removeEventListener("click", _fld_closeCalBound); _fld_closeCalBound = null; }
      _fld_calTargetId = inputId;
      _fld_calMin = minYear || 1900;
      _fld_calMax = maxYear || (new Date().getFullYear() + 1);
      const inp = document.getElementById(inputId);
      const pop = document.getElementById("fld_calPop");
      if (!inp || !pop) return;
      const existing = _trParseDMY(inp.value || "");
      const now = new Date();
      if (existing) { _fld_calYear = existing.y; _fld_calMonth = existing.m; }
      else { _fld_calYear = Math.min(Math.max(now.getFullYear(), _fld_calMin), _fld_calMax); _fld_calMonth = now.getMonth(); }
      const rect = inp.getBoundingClientRect();
      pop.style.display = "block";
      // NOTE: pop is `position:fixed`, so its top/left are already relative to the
      // viewport — do NOT add window.scrollX/scrollY here (that double-counts scroll
      // and pushes the popup far past where the field actually is on longer/scrolled pages).
      const popH = 300; // approx popup height incl. selects + grid + footer
      let top = rect.bottom + 4;
      if (top + popH > window.innerHeight) top = Math.max(8, rect.top - popH - 4); // flip above if no room below
      let left = rect.left;
      if (left + 250 > window.innerWidth) left = window.innerWidth - 256;
      pop.style.top = top + "px";
      pop.style.left = left + "px";
      _fld_buildMYSelects();
      fld_renderCal();
      setTimeout(() => {
        _fld_closeCalBound = _fld_closeCal;
        document.addEventListener("click", _fld_closeCalBound, {once:true});
      }, 10);
    }
    function _fld_closeCal(e) {
      _fld_closeCalBound = null;
      const pop = document.getElementById("fld_calPop");
      if (pop && !pop.contains(e.target)) pop.style.display = "none";
    }
    function _fld_buildMYSelects() {
      const mSel = document.getElementById("fld_calMonthSel");
      const ySel = document.getElementById("fld_calYearSel");
      if (mSel) mSel.innerHTML = MONTHS.map((m,i) => `<option value="${i}"${i===_fld_calMonth?" selected":""}>${m}</option>`).join("");
      if (ySel) {
        let opts = "";
        for (let y = _fld_calMax; y >= _fld_calMin; y--) opts += `<option value="${y}"${y===_fld_calYear?" selected":""}>${y}</option>`;
        ySel.innerHTML = opts;
      }
    }
    function fld_calChangeMY() {
      const mSel = document.getElementById("fld_calMonthSel");
      const ySel = document.getElementById("fld_calYearSel");
      if (mSel) _fld_calMonth = Number(mSel.value);
      if (ySel) _fld_calYear  = Number(ySel.value);
      fld_renderCal();
    }
    function fld_renderCal() {
      const g = document.getElementById("fld_calGrid");
      if (!g) return;
      const today = new Date();
      const firstDay = new Date(_fld_calYear, _fld_calMonth, 1).getDay();
      const daysInMonth = new Date(_fld_calYear, _fld_calMonth+1, 0).getDate();
      const inp = document.getElementById(_fld_calTargetId);
      const existing = _trParseDMY(inp && inp.value || "");
      const parts = ["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => `<div style="text-align:center;font-size:10px;color:#94a3b8;font-weight:700;letter-spacing:.03em;padding:4px 0 8px;">${d}</div>`);
      for (let i = 0; i < firstDay; i++) parts.push(`<div class="dc-day dc-empty"></div>`);
      for (let d = 1; d <= daysInMonth; d++) {
        const isToday = d===today.getDate() && _fld_calMonth===today.getMonth() && _fld_calYear===today.getFullYear();
        const isSel   = existing && existing.y===_fld_calYear && existing.m===_fld_calMonth && d===existing.d;
        let bg = "transparent", co = "#334155", fw = 400, extra = "";
        if (isToday && !isSel) { extra = "box-shadow:inset 0 0 0 1.5px #0F766E;"; co = "#0F766E"; fw = 700; }
        if (isSel) { bg = "#0F766E"; co = "#fff"; fw = 700; }
        parts.push(`<div class="dc-day" onclick="fld_pickDate(${d})" style="text-align:center;font-size:12px;line-height:28px;height:28px;width:28px;margin:0 auto;border-radius:9px;cursor:pointer;background:${bg};color:${co};font-weight:${fw};${extra}transition:background .12s;">${d}</div>`);
      }
      g.innerHTML = parts.join("");
    }
    function fld_pickDate(day) {
      const dd = String(day).padStart(2,"0");
      const mm = String(_fld_calMonth+1).padStart(2,"0");
      const display = dd + "-" + mm + "-" + _fld_calYear;
      const el = document.getElementById(_fld_calTargetId);
      if (el) el.value = display;
      const pop = document.getElementById("fld_calPop");
      if (pop) pop.style.display = "none";
    }
    function fld_clearDate() {
      const el = document.getElementById(_fld_calTargetId);
      if (el) el.value = "";
      const pop = document.getElementById("fld_calPop");
      if (pop) pop.style.display = "none";
    }
    function fld_todayDate() {
      const now = new Date();
      const display = String(now.getDate()).padStart(2,"0") + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + now.getFullYear();
      const el = document.getElementById(_fld_calTargetId);
      if (el) el.value = display;
      const pop = document.getElementById("fld_calPop");
      if (pop) pop.style.display = "none";
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
      'triggerManualMonthlyReport','triggerManualAdminSummary',
      'runHealthCheck','loadTrafficStats',
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
      triggerManualMonthlyReport: 'Sending…', triggerManualAdminSummary: 'Sending…',
      runHealthCheck: 'Checking…', loadTrafficStats: 'Loading…',
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
              + 'background:#0F766E;color:#fff;border:none;cursor:pointer;'
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
      inp.addEventListener('focus', function () { this.style.borderColor = '#0F766E'; });
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
        '<div style="border:1px solid #5EEAD4;border-radius:10px;overflow:hidden;">'
        + '<div style="background:linear-gradient(90deg,#0F766E,#f5b942);padding:9px 13px;'
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
        + '<div style="padding:10px 13px;background:#fffdf5;border-top:1px solid #5EEAD4;">'
          + '<button id="grsViewBtn" style="width:100%;padding:11px 0;'
          + 'background:linear-gradient(135deg,#0F766E,#e8920a);color:#fff;border:none;'
          + 'border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;'
          + 'font-family:Poppins,sans-serif;box-shadow:0 3px 10px rgba(15, 118, 110,0.3);'
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
