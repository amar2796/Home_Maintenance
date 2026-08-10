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
      const cur = new Date().getFullYear();
      for (let y = _getProjectStartYear(); y <= cur + 1; y++) years.add(y);
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
        const da = _dash_parseDateSort(a.PaymentDate), db = _dash_parseDateSort(b.PaymentDate);
        if (_et_sortBy === "date_desc")   return db.localeCompare(da);
        if (_et_sortBy === "date_asc")    return da.localeCompare(db);
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
