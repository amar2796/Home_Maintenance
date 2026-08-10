    var _events = [];
    var _eventExpenses = [];
    var _evLoaded = false;

    /* ── Load events + event expenses from API ── */
    async function loadEvents() {
      if (_evLoaded) return;
      try {
        const res = await getCached("getEventData");
        _events = (res && res.events) || [];
        _eventExpenses = (res && res.eventExpenses) || [];
        _evLoaded = true;
        renderEvents();
      } catch (err) {
        document.getElementById("ev_list").innerHTML =
          `<div style="text-align:center;padding:32px;color:#ef4444;font-size:13px;">
        Error loading events: ${escapeHtml(err.message)}
      </div>`;
      }
    }

    /* ── Bust event cache after any write ── */
    function _evBust() {
      _evLoaded = false;
      mandirCacheBust("getEventData");
    }

    /* ── Render event cards ── */
    function renderEvents() {
      const filterStatus = document.getElementById("ev_filter_status")?.value || "";
      const filterCat = document.getElementById("ev_filter_cat")?.value || "";

      const list = _events.filter(function (e) {
        const matchStatus = !filterStatus || e.Status === filterStatus;
        const matchCat = !filterCat || e.Category === filterCat;
        return matchStatus && matchCat;
      });

      const container = document.getElementById("ev_list");
      if (!container) return;

      if (list.length === 0) {
        container.innerHTML =
          `<div style="text-align:center;padding:40px;color:#94a3b8;">
        <i class="fa-solid fa-calendar-xmark" style="font-size:2rem;display:block;margin-bottom:10px;"></i>
        No events found. Create one above.
      </div>`;
        return;
      }

      // Sort: Active first, then Upcoming, then Completed
      const order = { Active: 0, Upcoming: 1, Completed: 2 };
      list.sort(function (a, b) { return (order[a.Status] || 3) - (order[b.Status] || 3); });

      container.innerHTML = list.map(function (ev) {
        // Sum expenses for this event
        const evExps = _eventExpenses.filter(function (x) { return String(x.EventId) === String(ev.EventId); });
        const spent = evExps.reduce(function (s, x) { return s + Number(x.Amount || 0); }, 0);
        const budget = Number(ev.Budget || 0);
        const remaining = budget > 0 ? budget - spent : 0;
        const pct = budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0;
        const barColor = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#27ae60";

        const statusClass = {
          Upcoming: "ev-status-upcoming",
          Active: "ev-status-active",
          Completed: "ev-status-completed"
        }[ev.Status] || "ev-status-upcoming";

        const budgetSection = budget > 0 ? `
      <div style="margin-top:14px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px;">
          <span>Budget used: ${pct}%</span>
          <span>${APP.currency||"₹"}${fmt(spent)} / ${APP.currency||"₹"}${fmt(budget)}</span>
        </div>
        <div class="ev-budget-bar-bg">
          <div class="ev-budget-bar-fill" style="width:${pct}%;background:${barColor};"></div>
        </div>
      </div>` : "";

        const dateStr = [ev.StartDate, ev.EndDate].filter(Boolean).join(" → ") || "—";

        return `<div class="ev-card">
      <div class="ev-card-header">
        <div>
          <div class="ev-card-title">${escapeHtml(ev.EventName || "Untitled")}</div>
          <div class="ev-card-cat">
            <i class="fa-solid fa-tag" style="font-size:10px;"></i>
            ${escapeHtml(ev.Category || "—")} &nbsp;·&nbsp;
            <i class="fa-regular fa-calendar" style="font-size:10px;"></i>
            ${escapeHtml(dateStr)}
          </div>
        </div>
        <span class="badge ${statusClass}" style="border-radius:20px;padding:4px 14px;font-size:11px;font-weight:700;">
          ${escapeHtml(ev.Status || "—")}
        </span>
      </div>
 
      ${ev.Description ? `<p style="font-size:12.5px;color:#64748b;margin:0 0 12px;line-height:1.6;">${escapeHtml(ev.Description)}</p>` : ""}
 
      <div class="ev-card-body">
        <div class="ev-stat">
          <div class="ev-stat-val" style="color:#f59e0b;">${APP.currency||"₹"}${fmt(budget || 0)}</div>
          <div class="ev-stat-lbl">Budget</div>
        </div>
        <div class="ev-stat">
          <div class="ev-stat-val" style="color:#e74c3c;">${APP.currency||"₹"}${fmt(spent)}</div>
          <div class="ev-stat-lbl">Spent (${evExps.length} items)</div>
        </div>
        <div class="ev-stat">
          <div class="ev-stat-val" style="color:${remaining >= 0 ? '#27ae60' : '#ef4444'};">
            ${remaining < 0 ? "−" : ""}${APP.currency||"₹"}${fmt(Math.abs(remaining))}
          </div>
          <div class="ev-stat-lbl">${remaining < 0 ? "Over Budget" : "Remaining"}</div>
        </div>
      </div>
 
      ${budgetSection}
 
      <div class="ev-card-footer">
        <button onclick="openAddEventExpense('${ev.EventId}','${escapeHtml(ev.EventName || '')}')"
          style="padding:7px 14px;font-size:12px;background:#fb923c;box-shadow:none;">
          <i class="fa-solid fa-plus"></i> Add Expense
        </button>
        <button onclick="viewEventExpenses('${ev.EventId}','${escapeHtml(ev.EventName || '')}')"
          style="padding:7px 14px;font-size:12px;background:#334155;box-shadow:none;">
          <i class="fa-solid fa-list"></i> View Expenses (${evExps.length})
        </button>
        <button onclick="shareEventWhatsApp('${ev.EventId}')"
          style="padding:7px 14px;font-size:12px;background:#25d366;box-shadow:none;">
          <i class="fa-brands fa-whatsapp"></i> Share
        </button>
        <button onclick="openEditEvent('${ev.EventId}')"
          style="padding:7px 14px;font-size:12px;background:#64748b;box-shadow:none;">
          <i class="fa-solid fa-pen"></i> Edit
        </button>
        <button onclick="deleteEvent('${ev.EventId}')"
          style="padding:7px 14px;font-size:12px;background:#ef4444;box-shadow:none;">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>`;
      }).join("");
    }

    /* ── Add new event ── */
    async function addEvent() {
      const name = document.getElementById("ev_name")?.value.trim();
      const cat = document.getElementById("ev_cat")?.value;
      const status = document.getElementById("ev_status")?.value;
      const start = document.getElementById("ev_start")?.value;
      const end = document.getElementById("ev_end")?.value;
      const budget = document.getElementById("ev_budget")?.value || "0";
      const desc = document.getElementById("ev_desc")?.value.trim() || "";
      const s = JSON.parse(localStorage.getItem("session") || "{}");

      if (!name) { toast("Event name is required.", "warn"); return; }

      try {
        const res = await postData({
          action: "addEvent",
          // [ID] FIX: No EventId passed — backend generates EVT-NNNNN sequentially
          EventName: name,
          Category: cat,
          Status: status,
          StartDate: start,
          EndDate: end,
          Budget: Number(budget),
          Description: desc,
          AdminName: s.name || "Admin"
        });
        if (res.status === "success") {
          toast("✅ Event created.", "");
          document.getElementById("ev_name").value = "";
          document.getElementById("ev_budget").value = "";
          document.getElementById("ev_desc").value = "";
          // FIX-3: Use smartRefresh so sidebar + expense tracker also update
          smartRefresh("events");
        } else {
          toast("❌ " + (res.message || "Failed to create event."), "error");
        }
      } catch (err) {
        toast("❌ " + err.message, "error");
      }
    }

    /* ── Edit event modal ── */
    function openEditEvent(eventId) {
      const ev = _events.find(function (x) { return String(x.EventId) === String(eventId); });
      if (!ev) return;

      const catOpts = ["Festival", "Pooja", "Maintenance", "Community", "Other"]
        .map(function (c) { return `<option ${c === ev.Category ? "selected" : ""}>${c}</option>`; }).join("");
      const stOpts = ["Upcoming", "Active", "Completed"]
        .map(function (s) { return `<option ${s === ev.Status ? "selected" : ""}>${s}</option>`; }).join("");

      const html = `
    <div class="_mhdr">
      <h3><i class="fa-solid fa-calendar-pen"></i> Edit Event</h3>
      <button class="_mcls" onclick="closeModal()">×</button>
    </div>
    <div class="_mbdy">
      <label class="_fl">Event Name</label>
      <input class="_fi" id="ee_name" value="${escapeHtml(ev.EventName || '')}"/>
      <label class="_fl">Category</label>
      <select class="_fi" id="ee_cat">${catOpts}</select>
      <label class="_fl">Status</label>
      <select class="_fi" id="ee_status">${stOpts}</select>
      <label class="_fl">Start Date</label>
      <input class="_fi" type="date" id="ee_start" value="${escapeHtml((ev.StartDate || '').slice(0, 10))}"/>
      <label class="_fl">End Date</label>
      <input class="_fi" type="date" id="ee_end" value="${escapeHtml((ev.EndDate || '').slice(0, 10))}"/>
      <label class="_fl">Budget (₹)</label>
      <input class="_fi" type="number" id="ee_budget" value="${Number(ev.Budget || 0)}" min="0"/>
      <label class="_fl">Description</label>
      <input class="_fi" id="ee_desc" value="${escapeHtml(ev.Description || '')}"/>
    </div>
    <div class="_mft">
      <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()">Cancel</button>
      <button class="_mbtn" style="background:#fb923c;" onclick="saveEditEvent('${eventId}')">
        <i class="fa-solid fa-check"></i> Save
      </button>
    </div>`;
      openModal(html, "480px");
    }

    async function saveEditEvent(eventId) {
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      try {
        const res = await postData({
          action: "updateEvent",
          EventId: eventId,
          EventName: document.getElementById("ee_name").value.trim(),
          Category: document.getElementById("ee_cat").value,
          Status: document.getElementById("ee_status").value,
          StartDate: document.getElementById("ee_start").value,
          EndDate: document.getElementById("ee_end").value,
          Budget: Number(document.getElementById("ee_budget").value || 0),
          Description: document.getElementById("ee_desc").value.trim(),
          AdminName: s.name || "Admin"
        });
        toast(res.status === "updated" ? "✅ Event updated." : "❌ Update failed.",
          res.status === "updated" ? "" : "error");
        if (res.status === "updated") {
          closeModal();
          // FIX-3: Use smartRefresh so sidebar + expense tracker also update
          smartRefresh("events");
        }
      } catch (err) { toast("❌ " + err.message, "error"); }
    }

    /* ── Delete event ── */
    function deleteEvent(eventId) {
      const ev = _events.find(function (x) { return String(x.EventId) === String(eventId); });
      const evExps = _eventExpenses.filter(function (x) { return String(x.EventId) === String(eventId); });
      const warn = evExps.length > 0
        ? ` This will also delete ${evExps.length} expense record(s) linked to this event.`
        : "";
      confirmModal("Delete this event?" + warn, async function () {
        try {
          const s = JSON.parse(localStorage.getItem("session") || "{}");
          const res = await postData({ action: "deleteEvent", EventId: eventId, AdminName: s.name || "Admin" });
          toast(res.status === "deleted" ? "✅ Event deleted." : "❌ " + (res.message || "Failed."),
            res.status === "deleted" ? "" : "error");
          // FIX-3: Use smartRefresh so sidebar + expense tracker also update
          if (res.status === "deleted") { smartRefresh("events"); }
        } catch (err) { toast("❌ " + err.message, "error"); }
      });
    }

    /* ── Add expense to event ── */
    function openAddEventExpense(eventId, eventName) {
      const typeOpts = (typeof expenseTypes !== "undefined" ? expenseTypes : [])
        .map(function (t) { return `<option value="${t.ExpenseTypeId}">${escapeHtml(t.Name)}</option>`; }).join("");
      const monOpts = [""].concat(MONTHS)
        .map(function (m) { return `<option value="${m}">${m || "None"}</option>`; }).join("");

      const html = `
    <div class="_mhdr">
      <h3><i class="fa-solid fa-receipt" style="color:#fb923c;"></i> Add Event Expense</h3>
      <button class="_mcls" onclick="closeModal()">×</button>
    </div>
    <div class="_mbdy">
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 14px;
        font-size:12px;color:#92400e;margin-bottom:14px;">
        <i class="fa-solid fa-calendar-star"></i> ${escapeHtml(eventName)}
      </div>
      <label class="_fl">Title</label>
      <input class="_fi" id="eev_title" placeholder="e.g. Decorations, Prasad, Sound System"/>
      <label class="_fl">Amount (₹)</label>
      <input class="_fi" type="number" id="eev_amt" min="1" placeholder="Amount"/>
      <label class="_fl">Expense Type</label>
      <select class="_fi" id="eev_type">${typeOpts}</select>
      <label class="_fl">Month</label>
      <select class="_fi" id="eev_month">${monOpts}</select>
      <label class="_fl">Note <span style="color:#bbb;font-weight:400;font-size:10px;">(optional)</span></label>
      <input class="_fi" id="eev_note" placeholder="Vendor name or details"/>
    </div>
    <div class="_mft">
      <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()">Cancel</button>
      <button class="_mbtn" style="background:#fb923c;" onclick="saveEventExpense('${eventId}')">
        <i class="fa-solid fa-check"></i> Save Expense
      </button>
    </div>`;
      openModal(html, "460px");
    }

    async function saveEventExpense(eventId) {
      const title = document.getElementById("eev_title")?.value.trim();
      const amt = document.getElementById("eev_amt")?.value;
      if (!title || !amt || Number(amt) <= 0) {
        toast("Title and amount are required.", "warn"); return;
      }
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      try {
        const res = await postData({
          action: "addEventExpense",
          // [ID] FIX: No Id passed — backend generates EEXP-NNNNN sequentially
          EventId: eventId,
          Title: title,
          Amount: Number(amt),
          ExpenseTypeId: document.getElementById("eev_type")?.value || "",
          ForMonth: document.getElementById("eev_month")?.value || "",
          Note: document.getElementById("eev_note")?.value.trim() || "",
          AdminName: s.name || "Admin"
        });
        if (res.status === "success") {
          closeModal();
          toast("✅ Expense added to event.", "");
          // FIX-4: Use dedicated entity so expense tracker + dashboard also update
          smartRefresh("expenses_from_event");
        } else {
          toast("❌ " + (res.message || "Failed."), "error");
        }
      } catch (err) { toast("❌ " + err.message, "error"); }
    }

    /* ── View all expenses for one event ── */
    function viewEventExpenses(eventId, eventName) {
      const evExps = _eventExpenses.filter(function (x) { return String(x.EventId) === String(eventId); });
      const total = evExps.reduce(function (s, x) { return s + Number(x.Amount || 0); }, 0);

      const rows = evExps.length === 0
        ? `<tr><td colspan="5" style="text-align:center;color:#aaa;padding:20px;">No expenses yet</td></tr>`
        : evExps.map(function (x, i) {
          const tName = (typeof expenseTypes !== "undefined" ? expenseTypes : [])
            .find(function (t) { return String(t.ExpenseTypeId) === String(x.ExpenseTypeId); })?.Name || "—";
          return `<tr>
          <td>${i + 1}</td>
          <td><b>${escapeHtml(x.Title || "—")}</b>${x.Note ? `<br><span style="font-size:10px;color:#94a3b8;">${escapeHtml(x.Note)}</span>` : ""}</td>
          <td>${escapeHtml(tName)}</td>
          <td>${escapeHtml(x.ForMonth || "—")}</td>
          <td class="amt-red">${APP.currency||"₹"}${fmt(x.Amount)}</td>
        </tr>`;
        }).join("");

      const html = `
    <div class="_mhdr">
      <h3><i class="fa-solid fa-list-ul"></i> Event Expenses</h3>
      <button class="_mcls" onclick="closeModal()">×</button>
    </div>
    <div class="_mbdy" style="padding:0;">
      <div style="background:#fff7ed;padding:12px 20px;font-size:13px;font-weight:600;color:#92400e;
        border-bottom:1px solid #fed7aa;">
        <i class="fa-solid fa-calendar-star"></i> ${escapeHtml(eventName)}
        &nbsp;·&nbsp; Total: <span style="color:#e74c3c;">${APP.currency||"₹"}${fmt(total)}</span>
      </div>
      <div style="overflow-x:auto;max-height:400px;overflow-y:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;position:sticky;top:0;">
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:#334155;">#</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:#334155;">Title</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:#334155;">Type</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:#334155;">Month</th>
              <th style="padding:10px 12px;text-align:right;font-weight:600;color:#334155;">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <div class="_mft">
      <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()">Close</button>
      <button class="_mbtn" style="background:#fb923c;" onclick="closeModal();openAddEventExpense('${eventId}','${escapeHtml(eventName)}')">
        <i class="fa-solid fa-plus"></i> Add Expense
      </button>
    </div>`;
      openModal(html, "580px");
    }

    /* ── WhatsApp share ── */
    function shareEventWhatsApp(eventId) {
      const ev = _events.find(function (x) { return String(x.EventId) === String(eventId); });
      if (!ev) return;
      const evExps = _eventExpenses.filter(function (x) { return String(x.EventId) === String(eventId); });
      const spent = evExps.reduce(function (s, x) { return s + Number(x.Amount || 0); }, 0);
      const budget = Number(ev.Budget || 0);
      const lines = evExps.map(function (x) { return `  • ${x.Title}: ${APP.currency||"₹"}${fmt(x.Amount)}`; }).join("\n") || "  No expenses yet";

      const msg = `${APP.symbol||"🕉️"} *${ev.EventName}*\n` +
        `📅 ${[ev.StartDate, ev.EndDate].filter(Boolean).join(" → ") || "Date TBD"}\n` +
        `🏷️ ${ev.Category} · ${ev.Status}\n` +
        `━━━━━━━━━━━━━━\n` +
        (budget > 0 ? `💰 Budget: ${APP.currency||"₹"}${fmt(budget)}\n` : "") +
        `💸 Spent: ${APP.currency||"₹"}${fmt(spent)}\n` +
        (budget > 0 ? `📊 Remaining: ${APP.currency||"₹"}${fmt(budget - spent)}\n` : "") +
        `━━━━━━━━━━━━━━\n` +
        `*Expense Breakdown:*\n${lines}\n` +
        `━━━━━━━━━━━━━━\n` +
        `_${new Date().toLocaleDateString(APP.locale||"en-IN")} · ${APP.name}_`;

      window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
    }

    async function addGoal() {
      let name = document.getElementById("g_name").value.trim();
      let target = document.getElementById("g_target").value;
      let current = document.getElementById("g_current").value || "0";
      let status = document.getElementById("g_status").value;
      if (!name || !target || Number(target) <= 0)
        return toast("Please enter goal name and target amount.", "error");
      try {
        let res = await postData({
          action: "addGoal",
          // [ID] FIX: No GoalId passed — backend generates GOAL-NNNNN sequentially
          GoalName: name,
          TargetAmount: target,
          CurrentAmount: current,
          Status: status,
        });
        if (res.status === "success") {
          toast("✅ Goal saved!");
          document.getElementById("g_name").value = "";
          document.getElementById("g_target").value = "";
          document.getElementById("g_current").value = "";
          // FIX-1: Use smartRefresh instead of optimistic local mutation
          // so the goals table always reflects server-confirmed data.
          smartRefresh("goals");
        } else toast("❌ Failed: " + (res.message || ""), "error");
      } catch (e) {
        toast("❌ " + e.message, "error");
      }
    }

    function openEditGoal(id) {
      let g = goals.find((x) => String(x.GoalId) === String(id));
      if (!g) return;
      const _gk = _storeGoalId(id);
      let html = `
          <div class="_mhdr"><h3><i class="fa-solid fa-pen"></i> Edit Goal</h3><button class="_mcls" onclick="closeModal()">×</button></div>
          <div class="_mbdy">
            <label class="_fl">Goal Name</label><input class="_fi" id="eg_name" value="${escapeHtml(
        g.GoalName || ""
      )}"/>
            <label class="_fl">Target Amount (₹)</label><input class="_fi" type="number" id="eg_target" value="${g.TargetAmount || 0
        }"/>
            <label class="_fl">Collected So Far (₹) <span style="color:#aaa;font-size:10px;font-weight:400;">update each time funds received</span></label>
            <input class="_fi" type="number" id="eg_current" value="${g.CurrentAmount || 0
        }"/>
            <label class="_fl">Status</label>
            <select class="_fi" id="eg_status">
              <option ${g.Status === "Enabled" ? "selected" : ""
        }>Enabled</option>
              <option ${g.Status === "Disabled" ? "selected" : ""
        }>Disabled</option>
            </select>
          </div>
          <div class="_mft">
            <button class="_mbtn" style="background:#999;" onclick="closeModal()">Cancel</button>
            <button class="_mbtn" style="background:#0F766E;" onclick="saveEditGoal(_goalStore['${_gk}'])"><i class="fa-solid fa-check"></i> Save</button>
          </div>`;
      openModal(html, "420px");
    }

    async function saveEditGoal(id) {
      const nameVal = document.getElementById("eg_name").value.trim();
      const targetVal = document.getElementById("eg_target").value;
      const currentVal = document.getElementById("eg_current").value || "0";
      const statusVal = document.getElementById("eg_status").value;
      if (!nameVal) return toast("Goal name required.", "error");
      try {
        let res = await postData({
          action: "updateGoal",
          GoalId: id,
          GoalName: nameVal,
          TargetAmount: targetVal,
          CurrentAmount: currentVal,
          Status: statusVal,
        });
        if (res.status === "updated") {
          toast("✅ Goal updated.");
          closeModal();
          // FIX-2: Use smartRefresh instead of optimistic local mutation
          // so the goals table always reflects server-confirmed data.
          smartRefresh("goals");
        } else {
          toast("❌ Failed: " + (res.message || ""), "error");
        }
      } catch (e) {
        toast("❌ " + e.message, "error");
      }
    }

    async function deleteGoal(id) {
      const _undoG = (goals || []).find(g => String(g.GoalId) === String(id));
      const _undoLabel = _undoG ? (_undoG.GoalName || "Goal") : "Goal";
      const _undoSaved = _undoG ? JSON.parse(JSON.stringify(_undoG)) : null;
      confirmModal("Delete this goal?", async () => {
        try {
          let res = await postData({ action: "deleteGoal", GoalId: id });
          if (res.status === "deleted") {
            smartRefresh("goals");
            if (_undoSaved && typeof _showUndoToast === "function") {
              _showUndoToast(_undoLabel, function() {
                var payload = Object.assign({ action: "addGoal" }, _undoSaved);
                postData(payload).then(function() {
                  smartRefresh("goals");
                  toast("↩ Goal restored.");
                });
              });
            } else {
              toast("✅ Deleted.");
            }
          } else {
            toast("❌ Failed.", "error");
          }
        } catch (e) {
          toast("❌ " + e.message, "error");
        }
      });
    }

    function showReceiptById(rid) {
      const d = window._rcptStore[rid];
      if (!d) return;
      showReceipt(d.c, d.userName, d.typeName, d.occasionName, true);
    }

    // Called when clicking a row in the inline dashboard transaction log
    function viewDashboardEntry(rid) {
      const d = window._rcptStore ? window._rcptStore[rid] : null;
      if (!d) { showReceiptById(rid); return; }
      const { c, userName, typeName, occasionName } = d;
      const displayRID = (c.ReceiptID || "—").replace(new RegExp("^" + (APP.legacyReceiptPrefix||"TRX") + "-"), (APP.receiptPrefix||"REC") + "-");
      const html = `
        <div class="_mhdr"><h3><i class="fa-solid fa-eye"></i> Contribution Details</h3><button class="_mcls" onclick="closeModal()">×</button></div>
        <div class="_mbdy">
          <div style="border:1px solid #f0f0f0;border-radius:10px;padding:4px 16px;">
            <div class="_row"><span class="_rl">Tracking ID</span><span class="_rv" style="color:#0F766E;font-family:monospace;">${escapeHtml(displayRID)}</span></div>
            <div class="_row"><span class="_rl">Donor</span><span class="_rv">${escapeHtml(userName)}</span></div>
            <div class="_row"><span class="_rl">Amount</span><span class="_rv" style="color:#27ae60;font-size:1.1rem;">₹ ${fmt(c.Amount)}</span></div>
            <div class="_row"><span class="_rl">Month / Year</span><span class="_rv">${escapeHtml(c.ForMonth || "—")} ${escapeHtml(String(c.Year || ""))}</span></div>
            <div class="_row"><span class="_rl">Type</span><span class="_rv">${escapeHtml(typeName || "—")}</span></div>
            <div class="_row"><span class="_rl">Occasion</span><span class="_rv">${escapeHtml(occasionName || "—")}</span></div>
            <div class="_row"><span class="_rl">Date Recorded</span><span class="_rv">${escapeHtml(c.PaymentDate || "—")}</span></div>
          </div>
        </div>
        <div class="_mft">
          <button class="_mbtn" style="background:#999;" onclick="closeModal()">Close</button>
          <button class="_mbtn" style="background:#27ae60;" onclick="closeModal();showReceiptById('${rid}')"><i class="fa-solid fa-receipt"></i> View Receipt</button>
        </div>`;
      openModal(html, "480px");
    }

    // FIX #13: viewContrib_receipt — only show receipt when explicitly requested
    function viewContrib_receipt(rid) {
      showReceiptById(rid);
    }

    /* ── Receipt Email Send — Quota Counter Hook ────────────────────────────
       app.js showReceipt() renders a modal that may include a "Send Email"
       button (action: resendReceipt / sendReceiptEmail).  When the admin
       clicks it, an email is consumed from the daily quota — but because the
       receipt view does NOT call smartRefresh("contributions"), the sidebar
       counter was never updated.

       Fix: use a MutationObserver on the modal container to detect when a
       receipt modal is opened, then attach a one-time click listener to any
       button whose text/action is "Send Email" or "Resend".  On click, wait
       1.5 s (Apps Script commit time) then call _refreshEmailQuotaUI().

       This is intentionally decoupled from smartRefresh so that ONLY the
       quota counter updates — no table re-render, no cache bust, no full
       data reload — because the contribution data itself did NOT change.
    ──────────────────────────────────────────────────────────────────────── */
    (function _hookReceiptEmailQuota() {
      var _modalEl = null;
      // Find the modal container — app.js typically uses id="modal" or class="_modal"
      function _getModal() {
        if (_modalEl && _modalEl.isConnected) return _modalEl;
        _modalEl = document.getElementById("modal") ||
                   document.querySelector("._modal-wrap") ||
                   document.querySelector("[id*='modal']");
        return _modalEl;
      }

      function _attachEmailBtnListener(root) {
        if (!root) return;
        // Match buttons by their label text or title — covers various receipt modal designs
        // ✅ FIX: Also match plain "email" — the receipt modal button text is just "Email" (with icon),
        //         not "send email" or "resend", so those checks were never matching.
        var btns = root.querySelectorAll("button, [role='button']");
        btns.forEach(function(btn) {
          var txt = (btn.textContent || btn.innerText || btn.title || "").toLowerCase().trim();
          var matches = txt.includes("send email") || txt.includes("resend") ||
                        txt.includes("email receipt") || txt === "email" ||
                        txt.includes("📧") || (btn.onclick && String(btn.onclick).includes("sendReceiptEmail"));
          if (matches) {
            if (btn._quotaHooked) return; // don't attach twice
            btn._quotaHooked = true;
            btn.addEventListener("click", function() {
              // Delay to let Apps Script commit the quota increment
              setTimeout(function() {
                if (typeof _refreshEmailQuotaUI === "function") {
                  _refreshEmailQuotaUI();
                }
              }, 1500);
            }, { once: false });
          }
        });
      }

      // Observe modal DOM for when receipt modals open (content injected dynamically)
      document.addEventListener("DOMContentLoaded", function() {
        var observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
              if (node.nodeType !== 1) return;
              var txt = (node.textContent || "").toLowerCase();
              // Only process nodes that look like a receipt modal
              if (txt.includes("receipt") || txt.includes("send email") || txt.includes("resend")) {
                _attachEmailBtnListener(node);
                // Also check descendants already rendered
                setTimeout(function() { _attachEmailBtnListener(node); }, 200);
              }
            });
          });
        });

        var target = document.body;
        observer.observe(target, { childList: true, subtree: true });
      });
    }());

    /* ═══ BROADCAST FUNCTIONS ═══ */