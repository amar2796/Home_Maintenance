/* ══════════════════════════════════════════════════════════════════
   HOUSEHOLD FEATURES — household-features.js
   ──────────────────────────────────────────────────────────────────
   Frontend-only additions for the Home Maintenance dashboard:
     • Repair / maintenance issue log
     • Bill due-date reminders
   Data is stored in the browser's localStorage only — this file makes
   no calls to the Apps Script backend and does not touch any existing
   contribution/expense logic. Safe to remove this file (and its
   <script> tag + the "Maintenance & Bills" panel) without affecting
   anything else in the app.
   ══════════════════════════════════════════════════════════════════ */

   (function () {
    var ISSUE_KEY = "hm_maintenance_issues";
    var BILL_KEY  = "hm_bill_reminders";
  
    function _load(key) {
      try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }
  
    function _save(key, arr) {
      try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
    }
  
    function _esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }
  
    /* ── Maintenance / repair log ─────────────────────────────────── */
  
    function hmAddIssue() {
      var titleEl = document.getElementById("mtIssueTitle");
      var catEl   = document.getElementById("mtIssueCategory");
      var statEl  = document.getElementById("mtIssueStatus");
      var title = (titleEl.value || "").trim();
      if (!title) { titleEl.focus(); return; }
  
      var issues = _load(ISSUE_KEY);
      issues.unshift({
        id: "iss_" + Date.now(),
        title: title,
        category: catEl.value,
        status: statEl.value,
        createdAt: new Date().toISOString()
      });
      _save(ISSUE_KEY, issues);
      titleEl.value = "";
      hmRenderIssues();
    }
  
    function hmSetIssueStatus(id, status) {
      var issues = _load(ISSUE_KEY);
      for (var i = 0; i < issues.length; i++) {
        if (issues[i].id === id) { issues[i].status = status; break; }
      }
      _save(ISSUE_KEY, issues);
      hmRenderIssues();
    }
  
    function hmDeleteIssue(id) {
      var issues = _load(ISSUE_KEY).filter(function (x) { return x.id !== id; });
      _save(ISSUE_KEY, issues);
      hmRenderIssues();
    }
  
    var _statusColor = {
      "Open": { bg: "rgba(239,68,68,0.1)", fg: "#b91c1c" },
      "In progress": { bg: "rgba(245,158,11,0.12)", fg: "#a16207" },
      "Resolved": { bg: "rgba(15, 118, 110,0.12)", fg: "#115E59" }
    };
  
    function hmRenderIssues() {
      var list = document.getElementById("hmIssueList");
      if (!list) return;
      var issues = _load(ISSUE_KEY);
  
      if (!issues.length) {
        list.innerHTML = '<div style="font-size:12.5px;color:var(--ink-faint);padding:10px 2px;">No open repairs logged. Add one above when something needs fixing.</div>';
        return;
      }
  
      list.innerHTML = issues.map(function (it) {
        var col = _statusColor[it.status] || _statusColor.Open;
        var date = new Date(it.createdAt);
        var dateStr = isNaN(date) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
        return (
          '<div class="card" style="padding:0;">' +
            '<div class="card-body" style="padding:12px 14px;display:flex;align-items:center;gap:10px;">' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:13.5px;font-weight:600;color:var(--ink);">' + _esc(it.title) + '</div>' +
                '<div style="font-size:11.5px;color:var(--ink-faint);margin-top:2px;">' + _esc(it.category) + (dateStr ? " · Logged " + dateStr : "") + '</div>' +
              '</div>' +
              '<select onchange="hmSetIssueStatus(\'' + it.id + '\', this.value)" style="font-size:11.5px;font-weight:600;border:none;border-radius:20px;padding:5px 10px;background:' + col.bg + ';color:' + col.fg + ';outline:none;cursor:pointer;">' +
                ['Open', 'In progress', 'Resolved'].map(function (s) {
                  return '<option ' + (s === it.status ? 'selected' : '') + '>' + s + '</option>';
                }).join('') +
              '</select>' +
              '<button onclick="hmDeleteIssue(\'' + it.id + '\')" aria-label="Delete" style="background:none;border:none;color:var(--ink-faint);cursor:pointer;font-size:14px;padding:4px;">' +
                '<i class="fa-solid fa-trash"></i>' +
              '</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    }
  
    /* ── Bill reminders ────────────────────────────────────────────── */
  
    function hmAddBill() {
      var nameEl = document.getElementById("mtBillName");
      var dueEl  = document.getElementById("mtBillDue");
      var amtEl  = document.getElementById("mtBillAmount");
      var name = (nameEl.value || "").trim();
      if (!name || !dueEl.value) { (name ? dueEl : nameEl).focus(); return; }
  
      var bills = _load(BILL_KEY);
      bills.push({
        id: "bill_" + Date.now(),
        name: name,
        dueDate: dueEl.value,
        amount: amtEl.value ? Number(amtEl.value) : null
      });
      _save(BILL_KEY, bills);
      nameEl.value = ""; dueEl.value = ""; amtEl.value = "";
      hmRenderBills();
    }
  
    function hmDeleteBill(id) {
      var bills = _load(BILL_KEY).filter(function (x) { return x.id !== id; });
      _save(BILL_KEY, bills);
      hmRenderBills();
    }
  
    function hmRenderBills() {
      var list = document.getElementById("hmBillList");
      if (!list) return;
      var bills = _load(BILL_KEY);
      bills.sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; });
  
      if (!bills.length) {
        list.innerHTML = '<div style="font-size:12.5px;color:var(--ink-faint);padding:10px 2px;">No bill reminders yet. Add a due date above and it will show up here.</div>';
        updateMaintenanceBadge(0);
        return;
      }
  
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var dueSoonCount = 0;
  
      list.innerHTML = bills.map(function (b) {
        var due = new Date(b.dueDate + "T00:00:00");
        var days = Math.round((due - today) / 86400000);
        var tag, tagColor;
        if (days < 0) { tag = "Overdue"; tagColor = { bg: "rgba(239,68,68,0.12)", fg: "#b91c1c" }; dueSoonCount++; }
        else if (days === 0) { tag = "Due today"; tagColor = { bg: "rgba(239,68,68,0.12)", fg: "#b91c1c" }; dueSoonCount++; }
        else if (days <= 7) { tag = "Due in " + days + "d"; tagColor = { bg: "rgba(245,158,11,0.12)", fg: "#a16207" }; dueSoonCount++; }
        else { tag = due.toLocaleDateString(undefined, { day: "numeric", month: "short" }); tagColor = { bg: "rgba(15, 118, 110,0.12)", fg: "#115E59" }; }
  
        return (
          '<div class="card" style="padding:0;">' +
            '<div class="card-body" style="padding:12px 14px;display:flex;align-items:center;gap:10px;">' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:13.5px;font-weight:600;color:var(--ink);">' + _esc(b.name) + '</div>' +
                '<div style="font-size:11.5px;color:var(--ink-faint);margin-top:2px;">' + (b.amount != null ? "₹" + b.amount.toLocaleString("en-IN") : "Amount not set") + '</div>' +
              '</div>' +
              '<span style="font-size:11.5px;font-weight:600;border-radius:20px;padding:5px 10px;background:' + tagColor.bg + ';color:' + tagColor.fg + ';white-space:nowrap;">' + tag + '</span>' +
              '<button onclick="hmDeleteBill(\'' + b.id + '\')" aria-label="Delete" style="background:none;border:none;color:var(--ink-faint);cursor:pointer;font-size:14px;padding:4px;">' +
                '<i class="fa-solid fa-trash"></i>' +
              '</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');
  
      updateMaintenanceBadge(dueSoonCount);
    }
  
    function updateMaintenanceBadge(count) {
      var badge = document.getElementById("menuBadgeMaintenance");
      if (!badge) return;
      if (count > 0) {
        badge.style.display = "inline-flex";
        badge.textContent = count;
      } else {
        badge.style.display = "none";
      }
    }
  
    // Expose to global scope — called from inline onclick handlers in user.html
    window.hmAddIssue = hmAddIssue;
    window.hmSetIssueStatus = hmSetIssueStatus;
    window.hmDeleteIssue = hmDeleteIssue;
    window.hmRenderIssues = hmRenderIssues;
    window.hmAddBill = hmAddBill;
    window.hmDeleteBill = hmDeleteBill;
    window.hmRenderBills = hmRenderBills;
  
    // Update the sidebar badge once on load (in case bills are already overdue)
    window.addEventListener("load", function () {
      try { hmRenderBills(); } catch (e) {}
    });
  })();