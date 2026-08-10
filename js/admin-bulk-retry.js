    async function _retryBulkFailed() {
      const stored = window._bulkFailedRows;
      if (!stored || !stored.rows || stored.rows.length === 0) return toast("No failed entries to retry.", "error");
      if (_bulkInFlight) return;
      _bulkInFlight = true;

      // Dedup: filter out any rows that already exist in the sheet
      // (catches the race-condition case where backend saved but returned error)
      var rowsToRetry = stored.rows.filter(function(r) {
        if (typeof data === "undefined" || !Array.isArray(data)) return true;
        var exists = data.some(function(c) {
          return String(c.UserId) === String(stored.userId) &&
                 String(c.ForMonth || "").toLowerCase() === String(r.month).toLowerCase() &&
                 String(c.Year) === String(stored.year) &&
                 String(c.TypeId) === String(stored.typeId);
        });
        return !exists; // only retry rows that genuinely don't exist yet
      });

      const bkBody = document.getElementById("sp-bulk-body");

      // If dedup found all rows already saved — show success, no retry needed
      if (rowsToRetry.length === 0) {
        window._bulkFailedRows = null;
        _bulkInFlight = false;
        smartRefresh("contributions");
        if (bkBody) {
          bkBody.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<div style="width:72px;height:72px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #6ee7b7;animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
                '<i class="fa-solid fa-circle-check" style="color:#16a34a;font-size:2rem;"></i>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">All Entries Already Saved!</div>' +
              '<div style="font-size:12.5px;color:#64748b;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">The previously failed entries were saved successfully. No duplicates inserted.</div>' +
            '</div>' +
            '<div class="sp-actions" style="margin-top:auto;">' +
              '<button class="sp-save-btn" style="background:#334155;color:#fff;" onclick="openBulkInsert()">' +
                '<i class="fa-solid fa-plus"></i> Insert More' +
              '</button>' +
              '<button class="sp-cancel-btn" onclick="spClose()">' +
                '<i class="fa-solid fa-xmark"></i> Close' +
              '</button>' +
            '</div>';
        }
        return;
      }

      // Sequential retry with progress
      const retryResults = [];
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      for (var _ri = 0; _ri < rowsToRetry.length; _ri++) {
        var _rr = rowsToRetry[_ri];
        if (bkBody) {
          bkBody.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<i class="fa-solid fa-spinner fa-spin" style="font-size:2.5rem;color:#334155;margin-bottom:18px;"></i>' +
              '<div style="font-size:16px;font-weight:600;color:#1e293b;">Retrying ' + (_ri + 1) + ' of ' + rowsToRetry.length + '…</div>' +
              '<div style="font-size:13px;color:#64748b;margin-top:4px;">' + escapeHtml(_rr.month) + ' — Rs.' + Number(_rr.amount).toLocaleString(APP.locale||"en-IN") + '</div>' +
              '<div style="width:200px;height:6px;background:#e2e8f0;border-radius:3px;margin-top:14px;overflow:hidden;">' +
                '<div style="height:100%;width:' + Math.round((_ri / rowsToRetry.length) * 100) + '%;background:#e74c3c;border-radius:3px;"></div>' +
              '</div>' +
              '<div style="font-size:12px;color:#94a3b8;margin-top:6px;">Please wait, do not close.</div>' +
            '</div>';
        }
        var _rres = await postData({
          action: "addContribution",
          UserId: stored.userId, Amount: _rr.amount, ForMonth: _rr.month,
          Year: stored.year, TypeId: stored.typeId, OccasionId: "", Note: stored.note,
          sessionToken: s.sessionToken || "", userId: s.userId || "",
          // [GUARANTEE] Reuse the SAME key this row was given when it was first
          // built in _executeBulkInsert (survives here via the object reference
          // through stored.rows → rowsToRetry). If that first attempt actually
          // succeeded on the backend and only the response was lost, the backend
          // replays that original success instead of inserting a duplicate row.
          IdempotencyKey: _rr.idemKey
        }).catch(function() { return { status: "error" }; });
        retryResults.push(_rres);
        if (_ri < rowsToRetry.length - 1) {
          await new Promise(function(res) { setTimeout(res, 250); });
        }
      }

      // Bust cache and re-check what actually saved
      if (typeof mandirCacheBust === "function") mandirCacheBust("getAllData");

      const retryDone = retryResults.filter(function(r) { return r && r.status === "success"; }).length;
      const stillFailed = rowsToRetry.filter(function(r, i) {
        return !retryResults[i] || retryResults[i].status !== "success";
      });

      window._bulkFailedRows = stillFailed.length > 0
        ? { rows: stillFailed, userId: stored.userId, year: stored.year, typeId: stored.typeId, note: stored.note }
        : null;

      _bulkInFlight = false;
      if (retryDone > 0) smartRefresh("contributions");

      if (!bkBody) return;
      const stillFailedHtml = stillFailed.length > 0
        ? '<div style="margin:8px auto 0;max-width:300px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;">' +
            '<div style="font-size:11px;font-weight:700;color:#dc2626;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;">Still Failed</div>' +
            stillFailed.map(function(r) {
              return '<div style="font-size:12px;color:#7f1d1d;display:flex;justify-content:space-between;padding:2px 0;">' +
                '<span>' + escapeHtml(r.month) + '</span><span style="font-weight:600;">Rs.' + Number(r.amount).toLocaleString(APP.locale||"en-IN") + '</span></div>';
            }).join("") +
          '</div>'
        : '';

      bkBody.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
          '<div style="width:72px;height:72px;background:linear-gradient(135deg,' + (retryDone > 0 ? '#ecfdf5,#d1fae5' : '#fef2f2,#fecaca') + ');border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid ' + (retryDone > 0 ? '#6ee7b7' : '#fca5a5') + ';animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
            '<i class="fa-solid ' + (retryDone > 0 ? 'fa-circle-check" style="color:#16a34a' : 'fa-circle-xmark" style="color:#dc2626') + ';font-size:2rem;"></i>' +
          '</div>' +
          '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">' + (retryDone > 0 ? 'Retry Complete!' : 'Retry Failed') + '</div>' +
          (retryDone > 0 ? '<div style="font-size:13px;font-weight:600;color:#15803d;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:7px 16px;margin-bottom:6px;">' + retryDone + ' of ' + rowsToRetry.length + ' entries added</div>' : '') +
          (stillFailed.length > 0 ? '<div style="font-size:12px;color:#dc2626;margin-bottom:4px;">' + stillFailed.length + ' still failed</div>' + stillFailedHtml : '') +
        '</div>' +
        '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
          (stillFailed.length > 0
            ? '<button class="sp-save-btn" style="background:#e74c3c;color:#fff;" onclick="_editRetryBulk()">' +
                '<i class="fa-solid fa-pen"></i> Edit &amp; Retry (' + stillFailed.length + ')' +
              '</button>' +
              '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryBulkFailed()" title="Resend the exact same amounts">' +
                '<i class="fa-solid fa-rotate-right"></i> Retry Again as-is' +
              '</button>'
            : '<button class="sp-save-btn" style="background:#334155;color:#fff;" onclick="openBulkInsert()">' +
                '<i class="fa-solid fa-plus"></i> Insert More' +
              '</button>') +
          '<button class="sp-cancel-btn" onclick="spClose()">' +
            '<i class="fa-solid fa-xmark"></i> Close' +
          '</button>' +
        '</div>';
    }
    window._retryBulkFailed = _retryBulkFailed;

    /* ── Edit & Retry for bulk: shows ONLY the rows that are currently in
       window._bulkFailedRows (already maintained by _retryBulkFailed's dedup
       logic to be exactly the still-failed subset — nothing that already
       saved is ever in this list), lets the admin fix an amount or uncheck a
       row to skip it, then hands the edited list back to _retryBulkFailed()
       so the existing dedup + sequential-send + result rendering is reused
       as-is rather than duplicated. ── */
    function _editRetryBulk() {
      const stored = window._bulkFailedRows;
      if (!stored || !stored.rows || stored.rows.length === 0) return toast("No failed entries to edit.", "error");
      const bkBody = document.getElementById("sp-bulk-body");
      if (!bkBody) return;
      const rowsHtml = stored.rows.map(function(r, i) {
        return '<tr>' +
          '<td style="padding:7px 8px;font-size:12.5px;">' + escapeHtml(r.month) + '</td>' +
          '<td style="padding:7px 8px;"><input type="number" min="1" class="_fi" style="margin:0;padding:6px 8px;" id="editretry_amt_' + i + '" value="' + escapeHtml(String(r.amount)) + '"/></td>' +
          '<td style="padding:7px 8px;text-align:center;"><input type="checkbox" id="editretry_inc_' + i + '" checked/></td>' +
        '</tr>';
      }).join("");
      bkBody.innerHTML = `
        <div class="sp-steps">${spStepsBar(2)}</div>
        <div style="background:linear-gradient(135deg,#fef2f2,#fee2e2);border:1.5px solid #e74c3c44;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#991b1b;">
          <i class="fa-solid fa-circle-info"></i> Fix any amount below, or uncheck a row to skip it. <b>Only these ${stored.rows.length} failed entr${stored.rows.length===1?"y":"ies"} are affected</b> — entries that already saved are untouched.
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <thead><tr style="background:#f1f5f9;">
            <th style="padding:7px 8px;text-align:left;font-size:11px;color:#64748b;">Month</th>
            <th style="padding:7px 8px;text-align:left;font-size:11px;color:#64748b;">Amount</th>
            <th style="padding:7px 8px;text-align:center;font-size:11px;color:#64748b;">Retry?</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="sp-actions">
          <button class="sp-save-btn" style="background:#e74c3c;color:#fff;" onclick="_confirmEditRetryBulk()">
            <i class="fa-solid fa-check"></i> Confirm &amp; Retry
          </button>
          <button class="sp-cancel-btn" onclick="spClose()">Cancel</button>
        </div>`;
    }
    window._editRetryBulk = _editRetryBulk;

    function _confirmEditRetryBulk() {
      const stored = window._bulkFailedRows;
      if (!stored) return;
      const editedRows = [];
      stored.rows.forEach(function(r, i) {
        const inc = document.getElementById("editretry_inc_" + i);
        if (inc && !inc.checked) return; // admin chose to skip this one
        const amtEl = document.getElementById("editretry_amt_" + i);
        const newAmt = amtEl ? Number(amtEl.value) : r.amount;
        if (!newAmt || newAmt <= 0) return; // invalid — skip rather than send bad data
        editedRows.push({
          month: r.month,
          amount: newAmt,
          // Always a fresh key here: the admin explicitly went through
          // Edit & Retry, so treat it as a new submission even if the
          // amount ends up unchanged after review.
          idemKey: _genIdemKey("bulk_edit"),
        });
      });
      if (editedRows.length === 0) return toast("No rows selected to retry.", "error");
      window._bulkFailedRows = { rows: editedRows, userId: stored.userId, year: stored.year, typeId: stored.typeId, note: stored.note };
      _retryBulkFailed();
    }
    window._confirmEditRetryBulk = _confirmEditRetryBulk;

    // #17 — Auto-suggest last contribution amount when member is selected
    function _suggestLastAmount(userId) {
      if (!userId || !data || data.length === 0) return;
      const amtEl = document.getElementById("amount");
      const typeEl = document.getElementById("type");
      if (!amtEl) return;
      const userContribs = data
        .filter(c => String(c.UserId) === String(userId))
        .sort((a, b) => _dash_parseDateSort(b.PaymentDate).localeCompare(_dash_parseDateSort(a.PaymentDate)));
      if (userContribs.length === 0) return;
      const last = userContribs[0];
      if (!amtEl.value) {
        amtEl.value = last.Amount || "";
        amtEl.style.borderColor = "#0F766E";
        amtEl.title = "Auto-filled from last contribution";
        setTimeout(() => { amtEl.style.borderColor = ""; amtEl.title = ""; }, 2000);
      }
      if (typeEl && last.TypeId && !typeEl.value) typeEl.value = String(last.TypeId);
    }

    async function addContribution() {
      if (!checkSession()) return;
      let userId = document.getElementById("user").value;
      let selectedUser = users.find((u) => String(u.UserId) === String(userId));
      if (selectedUser && selectedUser.Role === "Admin") {
        return toast("⚠️ Admin accounts cannot make contributions. Select a member.", "warn");
      }
      let amount = document.getElementById("amount").value;
      let year = document.getElementById("contribYear").value;
      if (!userId || !amount || Number(amount) <= 0)
        return toast("Please select a user and enter a valid amount.", "error");

      // Collect all values for preview
      const forMonth = document.getElementById("month").value;
      const typeId = document.getElementById("type").value;
      const occasionId = document.getElementById("occasion").value;
      // Default Note to "Jai Shree Ram" when admin leaves it blank; if admin
      // typed something, that's used as-is.
      let note = document.getElementById("note").value;
      if (!note || !note.trim()) note = "Jai Shree Ram";
      const paymentMode = document.getElementById("paymentMode") ? document.getElementById("paymentMode").value : "UPI";

      const memberName = selectedUser ? escapeHtml(selectedUser.Name) : userId;
      const typeObj = types.find(t => String(t.TypeId) === typeId);
      const typeName = escapeHtml(typeObj?.TypeName || "—");
      const occasionObj = occasions.find(o => String(o.OccasionId) === occasionId);
      const occasionName = escapeHtml(occasionObj?.OccasionName || "— None —");

      // Build month options
      const monthOpts = MONTHS.map(m => `<option value="${m}"${m===forMonth?" selected":""}>${m}</option>`).join("");
      const curY = new Date().getFullYear();
      let yearOptsP = "";
      for (let y = curY+1; y >= _getProjectStartYear(); y--) {
        let yLbl = y === curY ? y + " (Current)" : y < curY ? y + " (Old Entry)" : y + " (Advance)";
        yearOptsP += `<option value="${y}"${y===Number(year)?" selected":""}>${yLbl}</option>`;
      }
      const typeOptsP = types.map(t => `<option value="${t.TypeId}"${String(t.TypeId)===typeId?" selected":""}>${escapeHtml(t.TypeName)}</option>`).join("");
      const occasionOptsP = `<option value="">— None —</option>` + occasions.map(o => `<option value="${o.OccasionId}"${String(o.OccasionId)===occasionId?" selected":""}>${escapeHtml(o.OccasionName)}</option>`).join("");
      const modeOpts = ["UPI","Cash","Cheque","Online Transfer"].map(m => `<option value="${m}"${m===paymentMode?" selected":""}>${m}</option>`).join("");
      const userOptsP = users.filter(u=>u.Role!=="Admin").map(u=>`<option value="${u.UserId}"${String(u.UserId)===userId?" selected":""}>${escapeHtml(u.Name)}</option>`).join("");

      const previewHtml = `
        <div class="_mhdr">
          <h3><i class="fa-solid fa-eye" style="color:#0F766E;margin-right:8px;"></i> Preview & Confirm Contribution</h3>
          <button class="_mcls" onclick="closeModal()">×</button>
        </div>
        <div class="_mbdy">
          <div style="background:linear-gradient(135deg,#fef9ee,#fff8e1);border:1.5px solid #0F766E44;border-radius:12px;padding:14px 16px;margin-bottom:16px;font-size:12.5px;color:#946c44;">
            <i class="fa-solid fa-circle-info"></i> Review the details below. You can <b>edit any field inline</b> before submitting.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label class="_fl">Member</label>
              <div id="prev_user_cmbWrap" style="position:relative;">
                <div id="prev_user_cmbBtn" class="_fi" onclick="_cmbToggle('prev_user')" tabindex="0" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;margin-bottom:0;">
                  <span id="prev_user_cmbBtnLabel" style="color:#1e293b;">-- Select Member --</span>
                  <i class="fa-solid fa-chevron-down" style="font-size:12px;color:#94a3b8;"></i>
                </div>
                <div id="prev_user_cmbList" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:50;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:220px;overflow-y:auto;"></div>
              </div>
              <select class="_fi" id="prev_user" style="display:none;">${userOptsP}</select>
            </div>
            <div>
              <label class="_fl">Amount (₹)</label>
              <input class="_fi" id="prev_amount" type="number" min="1" value="${escapeHtml(amount)}" style="margin-bottom:0;" />
            </div>
            <div>
              <label class="_fl">Month</label>
              <select class="_fi" id="prev_month" style="margin-bottom:0;"><option value="">— General —</option>${monthOpts}</select>
            </div>
            <div>
              <label class="_fl">Year</label>
              <select class="_fi" id="prev_year" style="margin-bottom:0;">${yearOptsP}</select>
            </div>
            <div>
              <label class="_fl">Contribution Type</label>
              <select class="_fi" id="prev_type" style="margin-bottom:0;">${typeOptsP}</select>
            </div>
            <div>
              <label class="_fl">Payment Mode</label>
              <select class="_fi" id="prev_mode" style="margin-bottom:0;">${modeOpts}</select>
            </div>
          </div>
          <div style="margin-top:12px;">
            <label class="_fl">Occasion</label>
            <select class="_fi" id="prev_occasion" style="margin-bottom:0;">${occasionOptsP}</select>
          </div>
          <div style="margin-top:12px;">
            <label class="_fl">Note</label>
            <input class="_fi" id="prev_note" value="${escapeHtml(note)}" placeholder="Optional note" style="margin-bottom:0;" />
          </div>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 14px;margin-top:14px;font-size:12px;color:#15803d;">
            <i class="fa-solid fa-circle-check"></i> <b>Summary:</b> <span id="prev_summary">${memberName} · ₹${Number(amount).toLocaleString(APP.locale||"en-IN")} · ${forMonth||"General"} ${year}</span>
          </div>
        </div>
        <div class="_mft">
          <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()"><i class="fa-solid fa-arrow-left"></i> Back & Edit</button>
          <button class="_mbtn" id="prev_submitBtn" style="background:#22c55e;" onclick="_submitContributionFromPreview()"><i class="fa-solid fa-check"></i> Confirm & Submit</button>
        </div>`;

      // Show preview in the contrib slide panel (replace body content)
      const contribPanelBody = document.getElementById("sp-contrib-body");
      if (contribPanelBody) {
        contribPanelBody.innerHTML = `
          <div class="sp-steps">${spStepsBar(2)}</div>
          <div style="background:linear-gradient(135deg,#fef9ee,#fff8e1);border:1.5px solid #0F766E55;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#946c44;">
            <i class="fa-solid fa-circle-info"></i> Review the details below. <b>Edit any field inline</b> before submitting.
          </div>
          <div class="sp-row2">
            <div class="sp-field-group">
              <label class="sp-label">Member</label>
              <div id="prev_user_cmbWrap" style="position:relative;">
                <div id="prev_user_cmbBtn" class="sp-input" onclick="_cmbToggle('prev_user')" tabindex="0" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;">
                  <span id="prev_user_cmbBtnLabel" style="color:#1e293b;">-- Select Member --</span>
                  <i class="fa-solid fa-chevron-down" style="font-size:12px;color:#94a3b8;"></i>
                </div>
                <div id="prev_user_cmbList" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:50;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:240px;overflow-y:auto;"></div>
              </div>
              <select class="sp-input" id="prev_user" style="display:none;">${userOptsP}</select>
            </div>
            <div class="sp-field-group">
              <label class="sp-label">Amount (₹)</label>
              <input class="sp-input" id="prev_amount" type="number" min="1" value="${escapeHtml(amount)}" />
            </div>
            <div class="sp-field-group">
              <label class="sp-label">Month</label>
              <select class="sp-input" id="prev_month"><option value="">— General —</option>${monthOpts}</select>
            </div>
            <div class="sp-field-group">
              <label class="sp-label">Year</label>
              <select class="sp-input" id="prev_year">${yearOptsP}</select>
            </div>
            <div class="sp-field-group">
              <label class="sp-label">Contribution Type</label>
              <select class="sp-input" id="prev_type">${typeOptsP}</select>
            </div>
            <div class="sp-field-group">
              <label class="sp-label">Payment Mode</label>
              <select class="sp-input" id="prev_mode">${modeOpts}</select>
            </div>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Occasion</label>
            <select class="sp-input" id="prev_occasion">${occasionOptsP}</select>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Note</label>
            <input class="sp-input" id="prev_note" value="${escapeHtml(note)}" placeholder="Optional note" />
          </div>
          <div id="_dupWarnBannerSP" style="display:none;background:linear-gradient(90deg,#fff7ed,#ffedd5);border:1.5px solid #fb923c;border-radius:10px;padding:10px 14px;font-size:12px;color:#9a3412;align-items:flex-start;gap:8px;margin-bottom:4px;">
            <i class="fa-solid fa-triangle-exclamation" style="margin-top:1px;flex-shrink:0;color:#ea580c;"></i>
            <span id="_dupWarnTextSP"></span>
          </div>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 14px;font-size:12px;color:#15803d;">
            <i class="fa-solid fa-circle-check"></i> <b>Summary:</b>
            <span id="prev_summary">${memberName} · ₹${Number(amount).toLocaleString(APP.locale||"en-IN")} · ${forMonth||"General"} ${year}</span>
          </div>
          <div class="sp-actions" style="margin-top:16px;">
            <button class="sp-save-btn sp-save-green" id="prev_submitBtn" onclick="_submitContributionFromPreview()">
              <i class="fa-solid fa-check"></i> Confirm &amp; Submit
            </button>
            <button class="sp-cancel-btn" onclick="_contribReset()">
              <i class="fa-solid fa-arrow-left"></i> Back
            </button>
          </div>`;
        // Panel is already open — do NOT call spOpen() here, it would trigger _contribReset() and wipe the preview
      } else {
        openModal(previewHtml, "560px");
      }

      // [DUP-FIX-5] Check if a contribution for this user+month+year+type already exists
      // and warn the admin — purely advisory, does not block submission
      (function _checkDuplicateContrib() {
        if (!Array.isArray(data) || !userId || !forMonth || !year) return;
        var existing = data.find(function(c) {
          return String(c.UserId) === String(userId) &&
                 (c.ForMonth || "") === forMonth &&
                 String(c.Year) === String(year) &&
                 String(c.TypeId) === String(typeId);
        });
        if (!existing) return;
        // Show in slide panel banner
        var spWarn = document.getElementById("_dupWarnBannerSP");
        var spWarnTxt = document.getElementById("_dupWarnTextSP");
        if (spWarn && spWarnTxt) {
          spWarnTxt.innerHTML = '<b>Possible duplicate:</b> A contribution for <b>' + forMonth + ' ' + year + '</b> already exists for this member (Receipt: ' + escapeHtml(existing.ReceiptID || "—") + '). Submit only if intentional.';
          spWarn.style.display = 'flex';
          return;
        }
        // Fallback: modal footer (if panel not available)
        var footer = document.querySelector("._mft");
        if (!footer || document.getElementById("_dupWarnBanner")) return;
        var warn = document.createElement("div");
        warn.id = "_dupWarnBanner";
        warn.style.cssText =
          "background:linear-gradient(90deg,#fff7ed,#ffedd5);border:1.5px solid #fb923c;" +
          "border-radius:10px;padding:10px 14px;margin:0 16px 14px;font-size:12px;color:#9a3412;" +
          "display:flex;align-items:flex-start;gap:8px;";
        warn.innerHTML =
          '<i class="fa-solid fa-triangle-exclamation" style="margin-top:1px;flex-shrink:0;color:#ea580c;"></i>' +
          '<span><b>Possible duplicate:</b> A contribution for <b>' + forMonth + ' ' + year + '</b> ' +
          'already exists for this member (Receipt: ' + escapeHtml(existing.ReceiptID || "—") + '). ' +
          'Submit only if this is intentional.</span>';
        footer.parentNode.insertBefore(warn, footer);
      })();


      function _updatePrevSummary() {
        const u = users.find(x=>String(x.UserId)===document.getElementById("prev_user")?.value);
        const nm = u ? u.Name : document.getElementById("prev_user")?.value || "";
        const amt = document.getElementById("prev_amount")?.value || "0";
        const mo = document.getElementById("prev_month")?.value || "General";
        const yr = document.getElementById("prev_year")?.value || "";
        const el = document.getElementById("prev_summary");
        if (el) el.textContent = `${nm} · ₹${Number(amt).toLocaleString(APP.locale||"en-IN")} · ${mo} ${yr}`;
      }
      ["prev_user","prev_amount","prev_month","prev_year","prev_type","prev_mode","prev_occasion"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("change", _updatePrevSummary);
        if (el && el.tagName==="INPUT") el.addEventListener("input", _updatePrevSummary);
      });
      if (typeof _cmbSyncLabel === "function") _cmbSyncLabel("prev_user");
    }

    var _contribSubmitInFlight = false; // guard: prevents double-submit
    async function _submitContributionFromPreview() {
      if (_contribSubmitInFlight) return;
      _contribSubmitInFlight = true;

      // CRITICAL: Snapshot all DOM values NOW before any panel/async call.
      // spOpen() re-renders sp-contrib-body, destroying all prev_* elements.
      const _userId     = (document.getElementById("prev_user")     || {}).value || "";
      const _amount     = (document.getElementById("prev_amount")   || {}).value || "";
      const _year       = (document.getElementById("prev_year")     || {}).value || "";
      const _forMonth   = (document.getElementById("prev_month")    || {}).value || "";
      const _typeId     = (document.getElementById("prev_type")     || {}).value || "";
      const _occasionId = (document.getElementById("prev_occasion") || {}).value || "";
      const _note       = (document.getElementById("prev_note")     || {}).value || "";
      const _payMode    = (document.getElementById("prev_mode")     || {}).value || "UPI";

      const btn = document.getElementById("prev_submitBtn");
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }

      if (!_userId || !_amount || Number(_amount) <= 0) {
        _contribSubmitInFlight = false;
        if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm &amp; Submit'; }
        return toast("Please select a user and enter a valid amount.", "error");
      }
      try {
        const _ps = JSON.parse(localStorage.getItem("session") || "{}");
        const payload = {
          action:       "addContribution",
          UserId:       _userId,
          Amount:       _amount,
          ForMonth:     _forMonth,
          Year:         _year,
          TypeId:       _typeId,
          OccasionId:   _occasionId,
          Note:         _note,
          PaymentMode:  _payMode,
          sessionToken: _ps.sessionToken || "",
          userId:       _ps.userId || "",
          AdminName:    _ps.name || "Admin",
          // Fresh key each time this function runs — a rerun always means either
          // a brand-new entry or an edited resend, both genuinely new submissions.
          // Blind "Retry as-is" (see _retryContribFailed) reuses the stored
          // payload object directly instead of calling this function again,
          // which is what keeps that path's key identical to the failed attempt.
          IdempotencyKey: _genIdemKey("contrib"),
        };
        window._contribFailedPayload = payload; // store for retry
        let res = await postData(payload);
        if (res.status === "success") {
          _contribSubmitInFlight = false;
          const rid = res.receiptId || "";
          const emailNote = res.emailSent
            ? "\u{1F4E7} Receipt email sent to member."
            : (res.emailSkipped ? "\u26A0\uFE0F Email quota reached \u2014 email not sent." : "");

          // Reset original form fields before switching state
          try {
            const _now2 = new Date();
            const _g = (id) => document.getElementById(id);
            if (_g("amount"))      _g("amount").value = "";
            if (_g("note"))        _g("note").value = "";
            if (_g("month"))       _g("month").value = MONTHS[_now2.getMonth()];
            if (_g("paymentMode")) _g("paymentMode").value = "UPI";
            if (_g("occasion"))    _g("occasion").selectedIndex = 0;
            if (_g("contribYear")) _g("contribYear").value = String(_now2.getFullYear());
            if (_g("type"))        _g("type").selectedIndex = 0;
            try { localStorage.removeItem("_contrib_draft"); } catch(e) {}
          } catch(e) {}

          // Show success state in panel body (panel stays open)
          const cpBody = document.getElementById("sp-contrib-body");
          if (cpBody) {
            cpBody.innerHTML =
              '<div class="sp-steps">' + spStepsBar(3) + '</div>' +
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:340px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #6ee7b7;animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
                  '<i class="fa-solid fa-circle-check" style="color:#16a34a;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:6px;">Contribution Saved!</div>' +
                (rid ? '<div style="font-size:13px;font-weight:600;color:#15803d;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:7px 16px;margin-bottom:10px;">Receipt: ' + escapeHtml(rid) + '</div>' : '') +
                (emailNote ? '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">' + emailNote + '</div>' : '<div style="margin-bottom:14px;"></div>') +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;">' +
                '<button class="sp-save-btn sp-save-green" onclick="spOpen(\'contrib\')">' +
                  '<i class="fa-solid fa-plus"></i> Add Another' +
                '</button>' +
                '<button class="sp-cancel-btn" onclick="spClose()">' +
                  '<i class="fa-solid fa-xmark"></i> Close' +
                '</button>' +
              '</div>';
          }
          smartRefresh("contributions");
          if (res.emailSent) setTimeout(_refreshEmailQuotaUI, 800);
        } else {
          _contribSubmitInFlight = false;
          const errMsg = res.message || res.error || "Something went wrong. Please try again.";
          const cpBodyErr = document.getElementById("sp-contrib-body");
          if (cpBodyErr) {
            cpBodyErr.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                  '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
                '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
                '<button class="sp-save-btn sp-save-green" onclick="_editRetryContrib()">' +
                  '<i class="fa-solid fa-pen"></i> Edit &amp; Retry' +
                '</button>' +
                '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryContribFailed()" title="Resend the exact same details">' +
                  '<i class="fa-solid fa-rotate-right"></i> Retry as-is' +
                '</button>' +
              '</div>' +
              '<div style="text-align:center;margin-top:8px;">' +
                '<a href="javascript:void(0)" onclick="spClose()" style="font-size:11.5px;color:#94a3b8;text-decoration:underline;">Close without saving</a>' +
              '</div>';
          } else {
            toast("\u274C " + errMsg, "error");
            if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm &amp; Submit'; }
          }
        }
      } catch (err) {
        _contribSubmitInFlight = false;
        const errMsg = err.message || "Network error. Please try again.";
        const cpBodyCatch = document.getElementById("sp-contrib-body");
        if (cpBodyCatch) {
          cpBodyCatch.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
              '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
            '</div>' +
            '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
              '<button class="sp-save-btn sp-save-green" onclick="_editRetryContrib()">' +
                '<i class="fa-solid fa-pen"></i> Edit &amp; Retry' +
              '</button>' +
              '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryContribFailed()" title="Resend the exact same details">' +
                '<i class="fa-solid fa-rotate-right"></i> Retry as-is' +
              '</button>' +
            '</div>' +
            '<div style="text-align:center;margin-top:8px;">' +
              '<a href="javascript:void(0)" onclick="spClose()" style="font-size:11.5px;color:#94a3b8;text-decoration:underline;">Close without saving</a>' +
            '</div>';
        } else {
          toast("\u274C " + errMsg, "error");
          if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm &amp; Submit'; }
        }
      }
    }

    /* ── Retry failed contribution with the exact same payload ── */
    async function _retryContribFailed() {
      const payload = window._contribFailedPayload;
      if (!payload) return toast("No failed contribution to retry.", "error");
      if (_contribSubmitInFlight) return;
      _contribSubmitInFlight = true;
      const cpBody = document.getElementById("sp-contrib-body");
      if (cpBody) {
        cpBody.innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
            '<i class="fa-solid fa-spinner fa-spin" style="font-size:2.5rem;color:#334155;margin-bottom:18px;"></i>' +
            '<div style="font-size:16px;font-weight:600;color:#1e293b;">Retrying…</div>' +
            '<div style="font-size:12px;color:#64748b;margin-top:6px;">Please wait, do not close.</div>' +
          '</div>';
      }
      try {
        const res = await postData(payload);
        _contribSubmitInFlight = false;
        if (res.status === "success") {
          window._contribFailedPayload = null;
          const rid = res.receiptId || "";
          const emailNote = res.emailSent ? "\u{1F4E7} Receipt email sent to member."
            : (res.emailSkipped ? "\u26A0\uFE0F Email quota reached \u2014 email not sent." : "");
          try {
            const _now2 = new Date(); const _g = (id) => document.getElementById(id);
            if (_g("amount"))      _g("amount").value = "";
            if (_g("note"))        _g("note").value = "";
            if (_g("month"))       _g("month").value = MONTHS[_now2.getMonth()];
            if (_g("paymentMode")) _g("paymentMode").value = "UPI";
            if (_g("occasion"))    _g("occasion").selectedIndex = 0;
            if (_g("contribYear")) _g("contribYear").value = String(_now2.getFullYear());
            if (_g("type"))        _g("type").selectedIndex = 0;
            try { localStorage.removeItem("_contrib_draft"); } catch(e) {}
          } catch(e) {}
          if (cpBody) {
            cpBody.innerHTML =
              '<div class="sp-steps">' + spStepsBar(3) + '</div>' +
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:340px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #6ee7b7;animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
                  '<i class="fa-solid fa-circle-check" style="color:#16a34a;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:6px;">Contribution Saved!</div>' +
                (rid ? '<div style="font-size:13px;font-weight:600;color:#15803d;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:7px 16px;margin-bottom:10px;">Receipt: ' + escapeHtml(rid) + '</div>' : '') +
                (emailNote ? '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">' + emailNote + '</div>' : '<div style="margin-bottom:14px;"></div>') +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;">' +
                '<button class="sp-save-btn sp-save-green" onclick="spOpen(\'contrib\')">' +
                  '<i class="fa-solid fa-plus"></i> Add Another' +
                '</button>' +
                '<button class="sp-cancel-btn" onclick="spClose()">' +
                  '<i class="fa-solid fa-xmark"></i> Close' +
                '</button>' +
              '</div>';
          }
          smartRefresh("contributions");
          if (res.emailSent) setTimeout(_refreshEmailQuotaUI, 800);
        } else {
          const errMsg = res.message || res.error || "Something went wrong. Please try again.";
          if (cpBody) {
            cpBody.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                  '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
                '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
                '<button class="sp-save-btn sp-save-green" onclick="_editRetryContrib()">' +
                  '<i class="fa-solid fa-pen"></i> Edit &amp; Retry' +
                '</button>' +
                '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryContribFailed()" title="Resend the exact same details">' +
                  '<i class="fa-solid fa-rotate-right"></i> Retry as-is' +
                '</button>' +
              '</div>' +
              '<div style="text-align:center;margin-top:8px;">' +
                '<a href="javascript:void(0)" onclick="spClose()" style="font-size:11.5px;color:#94a3b8;text-decoration:underline;">Close without saving</a>' +
              '</div>';
          }
        }
      } catch(err) {
        _contribSubmitInFlight = false;
        const errMsg = err.message || "Network error.";
        if (cpBody) {
          cpBody.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
              '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
            '</div>' +
            '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
              '<button class="sp-save-btn sp-save-green" onclick="_editRetryContrib()">' +
                '<i class="fa-solid fa-pen"></i> Edit &amp; Retry' +
              '</button>' +
              '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryContribFailed()" title="Resend the exact same details">' +
                '<i class="fa-solid fa-rotate-right"></i> Retry as-is' +
              '</button>' +
            '</div>' +
            '<div style="text-align:center;margin-top:8px;">' +
              '<a href="javascript:void(0)" onclick="spClose()" style="font-size:11.5px;color:#94a3b8;text-decoration:underline;">Close without saving</a>' +
            '</div>';
        }
      }
    }
    window._retryContribFailed = _retryContribFailed;

    /* ── Edit & Retry: restore the form with the failed entry's values so the
       admin can fix whatever caused the failure, then re-run addContribution()
       to rebuild the Review step from those (possibly edited) values. Confirming
       from there calls _submitContributionFromPreview() normally, which always
       mints a fresh IdempotencyKey — correct, since edited data is a genuinely
       new submission, not a resend of the failed one. ── */
    function _editRetryContrib() {
      const payload = window._contribFailedPayload;
      if (!payload) { spClose(); return; }
      if (typeof window._contribReset === "function") window._contribReset();
      const _s = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; };
      _s("user", payload.UserId);
      if (typeof _updateContribMemberPreview === "function") _updateContribMemberPreview(payload.UserId);
      if (typeof _cmbSyncLabel === "function") _cmbSyncLabel('user');
      _s("amount", payload.Amount);
      _s("month", payload.ForMonth);
      _s("contribYear", payload.Year);
      _s("type", payload.TypeId);
      _s("occasion", payload.OccasionId);
      _s("note", payload.Note);
      _s("paymentMode", payload.PaymentMode);
      addContribution(); // rebuilds the Review (step 2) screen from these values
    }
    window._editRetryContrib = _editRetryContrib;

    async function deleteContribution(id) {
      if (!checkSession()) return;
      // UNDO: capture contribution before confirm dialog
      const _undoC = (typeof data !== "undefined") ? data.find(c => String(c.Id) === String(id)) : null;
      const _undoLabel = _undoC ? ("₹" + Number(_undoC.Amount||0).toLocaleString(APP.locale||"en-IN") + " — " + (_undoC.ForMonth||"") + " " + (_undoC.Year||"")) : "Contribution";
      const _undoSaved = _undoC ? JSON.parse(JSON.stringify(_undoC)) : null;
      // Rich confirm: show exactly which contribution is being deleted
      const _cMemberName = _undoC ? (typeof users !== "undefined" ? (users.find(function(u){ return String(u.UserId) === String(_undoC.UserId); }) || {}) : {}) : {};
      const _cName = _cMemberName.Name ? escapeHtml(_cMemberName.Name) : "";
      const _cDetailHtml = _undoC
        ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin:0 0 4px;text-align:left;font-size:12.5px;color:#7f1d1d;">' +
          (_cName ? '<span style="font-weight:700;color:#dc2626;">' + _cName + '</span> &nbsp;·&nbsp; ' : '') +
          '<span style="color:#b91c1c;">₹' + Number(_undoC.Amount||0).toLocaleString(APP.locale||"en-IN") + '</span>' +
          (_undoC.ForMonth ? ' &nbsp;·&nbsp; <span style="color:#9b1b1b;">' + escapeHtml(_undoC.ForMonth) + ' ' + (_undoC.Year||"") + '</span>' : '') +
          '</div>'
        : '';
      confirmModal(
        "Delete this contribution?" + (_cDetailHtml ? '<br><br>' + _cDetailHtml : ''),
        async () => {
        try {
          const _s = JSON.parse(localStorage.getItem("session") || "{}");
          let res = await postData({ action: "deleteContribution", Id: id, AdminName: _s.name || "Admin", sessionToken: _s.sessionToken || "", userId: _s.userId || "" });
          if (res.status === "deleted") {
            smartRefresh("contributions");
            // UNDO: show toast with undo option
            if (typeof _showUndoToast === "function") {
              _showUndoToast(_undoLabel, function() {
                if (_undoSaved) {
                  // FIX: Keep ALL original fields (Id, ReceiptID, PaymentDate) so the
                  // restored record is byte-for-byte identical to what was deleted.
                  // Old code deleted payload.Id causing backend to generate a new Id,
                  // new PaymentDate and new ReceiptID. Record is already gone — no duplicate risk.
                  var payload = Object.assign({ action: "addContribution" }, _undoSaved);
                  payload.Id          = _undoSaved.Id;
                  payload.ReceiptID   = _undoSaved.ReceiptID;
                  payload.PaymentDate = _undoSaved.PaymentDate;
                  postData(payload).then(function() {
                    smartRefresh("contributions");
                    toast("↩ Contribution restored.");
                  });
                }
              });
            }
          } else {
            toast("❌ Delete failed.", "error");
          }
        } catch (err) {
          toast("❌ " + err.message, "error");
        }
      });
    }
    function addExpense() {
      if (!checkSession()) return;
      let title  = document.getElementById("title").value.trim();
      let amount = document.getElementById("expAmount").value;
      let year   = document.getElementById("expYear").value;
      if (!title || !amount || Number(amount) <= 0) {
        return toast("Please enter a title and a valid amount.", "error");
      }

      const forMonth  = document.getElementById("expMonth").value;
      const typeId    = document.getElementById("expenseType").value;
      const typeObj   = (typeof expenseTypes !== "undefined" ? expenseTypes : []).find(t => String(t.ExpenseTypeId) === String(typeId));
      const typeName  = escapeHtml(typeObj?.Name || "—");

      // Build editable options for the Review step (same approach as addContribution)
      const monthOpts = MONTHS.map(m => `<option value="${m}"${m===forMonth?" selected":""}>${m}</option>`).join("");
      const curY = new Date().getFullYear();
      let yearOptsP = "";
      for (let y = curY+1; y >= _getProjectStartYear(); y--) {
        let yLbl = y === curY ? y + " (Current)" : y < curY ? y + " (Old Entry)" : y + " (Advance)";
        yearOptsP += `<option value="${y}"${y===Number(year)?" selected":""}>${yLbl}</option>`;
      }
      const typeOptsP = (typeof expenseTypes !== "undefined" ? expenseTypes : []).map(t =>
        `<option value="${t.ExpenseTypeId}"${String(t.ExpenseTypeId)===typeId?" selected":""}>${escapeHtml(t.Name || "")}</option>`
      ).join("");

      const expPanelBody = document.getElementById("sp-expense-body");
      if (!expPanelBody) return; // panel not present — nothing to show a review in

      expPanelBody.innerHTML = `
        <div class="sp-steps">${spStepsBar(2)}</div>
        <div style="background:linear-gradient(135deg,#fef2f2,#fee2e2);border:1.5px solid #e74c3c44;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#991b1b;">
          <i class="fa-solid fa-circle-info"></i> Review the details below. <b>Edit any field inline</b> before submitting.
        </div>
        <div class="sp-field-group">
          <label class="sp-label">Title</label>
          <input class="sp-input" id="prev_exp_title" value="${escapeHtml(title)}" placeholder="e.g. Electricity Bill" />
        </div>
        <div class="sp-row2">
          <div class="sp-field-group">
            <label class="sp-label">Amount (₹)</label>
            <input class="sp-input" id="prev_exp_amount" type="number" min="1" value="${escapeHtml(String(amount))}" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Expense Type</label>
            <select class="sp-input" id="prev_exp_type">${typeOptsP}</select>
          </div>
        </div>
        <div class="sp-row2">
          <div class="sp-field-group">
            <label class="sp-label">Month</label>
            <select class="sp-input" id="prev_exp_month"><option value="">None</option>${monthOpts}</select>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Year</label>
            <select class="sp-input" id="prev_exp_year">${yearOptsP}</select>
          </div>
        </div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;font-size:12px;color:#991b1b;">
          <i class="fa-solid fa-circle-check"></i> <b>Summary:</b>
          <span id="prev_exp_summary">${escapeHtml(title)} · ₹${Number(amount).toLocaleString(APP.locale||"en-IN")} · ${forMonth||"General"} ${year} · ${typeName}</span>
        </div>
        <div class="sp-actions" style="margin-top:16px;">
          <button class="sp-save-btn sp-save-red" id="prev_exp_submitBtn" onclick="_submitExpenseFromPreview()">
            <i class="fa-solid fa-check"></i> Confirm &amp; Save
          </button>
          <button class="sp-cancel-btn" onclick="_expenseReset()">
            <i class="fa-solid fa-arrow-left"></i> Back
          </button>
        </div>`;
      // Panel is already open — do NOT call spOpen() here, it would trigger
      // _expenseReset() and wipe the review state we just built.
    }

    var _expenseSubmitInFlight = false; // guard: prevents double-submit
    async function _submitExpenseFromPreview() {
      if (_expenseSubmitInFlight) return;
      _expenseSubmitInFlight = true;

      // Snapshot DOM values now — spOpen()/_expenseReset() will destroy prev_exp_* elements.
      const _title    = (document.getElementById("prev_exp_title")  || {}).value || "";
      const _amount   = (document.getElementById("prev_exp_amount") || {}).value || "";
      const _year     = (document.getElementById("prev_exp_year")   || {}).value || "";
      const _forMonth = (document.getElementById("prev_exp_month")  || {}).value || "";
      const _typeId   = (document.getElementById("prev_exp_type")   || {}).value || "";

      const btn = document.getElementById("prev_exp_submitBtn");
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }

      if (!_title.trim() || !_amount || Number(_amount) <= 0) {
        _expenseSubmitInFlight = false;
        if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm &amp; Save'; }
        return toast("Please enter a title and a valid amount.", "error");
      }

      const payload = {
        action: "addExpense",
        // [ID] FIX: No Id passed — backend generates EXP-YYYY-NNNNN sequentially
        Title: _title.trim(),
        Amount: _amount,
        Year: _year,
        ForMonth: _forMonth,
        ExpenseTypeId: _typeId,
        // Fresh key each call — first attempts and "Edit & Retry" resubmits are
        // both genuinely new data. "Retry as-is" (_retryExpenseAsIs) resends this
        // exact stored payload object instead of calling this function again,
        // which is what keeps that path's key identical to the failed attempt.
        IdempotencyKey: _genIdemKey("expense"),
      };
      window._expenseFailedPayload = payload; // store for retry

      try {
        let res = await postData(payload);
        if (res.status === "success") {
          _expenseSubmitInFlight = false;
          const expBody = document.getElementById("sp-expense-body");
          if (expBody) {
            expBody.innerHTML =
              '<div class="sp-steps">' + spStepsBar(3) + '</div>' +
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
                  '<i class="fa-solid fa-circle-check" style="color:#dc2626;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:10px;">Expense Saved!</div>' +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;">' +
                '<button class="sp-save-btn sp-save-red" onclick="spOpen(\'expense\')">' +
                  '<i class="fa-solid fa-plus"></i> Add Another' +
                '</button>' +
                '<button class="sp-cancel-btn" onclick="spClose()">' +
                  '<i class="fa-solid fa-xmark"></i> Close' +
                '</button>' +
              '</div>';
          }
          smartRefresh("expenses");
        } else {
          _expenseSubmitInFlight = false;
          const errMsg = res.message || res.error || "Something went wrong. Please try again.";
          const expBodyErr = document.getElementById("sp-expense-body");
          if (expBodyErr) {
            expBodyErr.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                  '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
                '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
                '<button class="sp-save-btn sp-save-red" onclick="_retryExpenseFailed()">' +
                  '<i class="fa-solid fa-pen"></i> Edit &amp; Retry' +
                '</button>' +
                '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryExpenseAsIs()" title="Resend the exact same details">' +
                  '<i class="fa-solid fa-rotate-right"></i> Retry as-is' +
                '</button>' +
              '</div>' +
              '<div style="text-align:center;margin-top:8px;">' +
                '<a href="javascript:void(0)" onclick="spClose()" style="font-size:11.5px;color:#94a3b8;text-decoration:underline;">Close without saving</a>' +
              '</div>';
          } else {
            toast("❌ " + errMsg, "error");
            if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm &amp; Save'; }
          }
        }
      } catch (err) {
        _expenseSubmitInFlight = false;
        const errMsg = err.message || "Network error. Please try again.";
        const expBodyCatch = document.getElementById("sp-expense-body");
        if (expBodyCatch) {
          expBodyCatch.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
              '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
            '</div>' +
            '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
              '<button class="sp-save-btn sp-save-red" onclick="_retryExpenseFailed()">' +
                '<i class="fa-solid fa-pen"></i> Edit &amp; Retry' +
              '</button>' +
              '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryExpenseAsIs()" title="Resend the exact same details">' +
                '<i class="fa-solid fa-rotate-right"></i> Retry as-is' +
              '</button>' +
            '</div>' +
            '<div style="text-align:center;margin-top:8px;">' +
              '<a href="javascript:void(0)" onclick="spClose()" style="font-size:11.5px;color:#94a3b8;text-decoration:underline;">Close without saving</a>' +
            '</div>';
        } else {
          toast("❌ " + errMsg, "error");
          if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm &amp; Save'; }
        }
      }
    }

    function _retryExpenseFailed() {
      if (!window._expenseFailedPayload) { spClose(); return; }
      const p = window._expenseFailedPayload;
      const expPanelBody = document.getElementById("sp-expense-body");
      if (!expPanelBody) return;
      const typeObj  = (typeof expenseTypes !== "undefined" ? expenseTypes : []).find(t => String(t.ExpenseTypeId) === String(p.ExpenseTypeId));
      const typeName = escapeHtml(typeObj?.Name || "—");
      const monthOpts = MONTHS.map(m => `<option value="${m}"${m===p.ForMonth?" selected":""}>${m}</option>`).join("");
      const curY = new Date().getFullYear();
      let yearOptsP = "";
      for (let y = curY+1; y >= _getProjectStartYear(); y--) {
        let yLbl = y === curY ? y + " (Current)" : y < curY ? y + " (Old Entry)" : y + " (Advance)";
        yearOptsP += `<option value="${y}"${y===Number(p.Year)?" selected":""}>${yLbl}</option>`;
      }
      const typeOptsP = (typeof expenseTypes !== "undefined" ? expenseTypes : []).map(t =>
        `<option value="${t.ExpenseTypeId}"${String(t.ExpenseTypeId)===String(p.ExpenseTypeId)?" selected":""}>${escapeHtml(t.Name || "")}</option>`
      ).join("");
      expPanelBody.innerHTML = `
        <div class="sp-steps">${spStepsBar(2)}</div>
        <div style="background:linear-gradient(135deg,#fef2f2,#fee2e2);border:1.5px solid #e74c3c44;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#991b1b;">
          <i class="fa-solid fa-circle-info"></i> Review the details below. <b>Edit any field inline</b> before submitting.
        </div>
        <div class="sp-field-group">
          <label class="sp-label">Title</label>
          <input class="sp-input" id="prev_exp_title" value="${escapeHtml(p.Title)}" />
        </div>
        <div class="sp-row2">
          <div class="sp-field-group">
            <label class="sp-label">Amount (₹)</label>
            <input class="sp-input" id="prev_exp_amount" type="number" min="1" value="${escapeHtml(String(p.Amount))}" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Expense Type</label>
            <select class="sp-input" id="prev_exp_type">${typeOptsP}</select>
          </div>
        </div>
        <div class="sp-row2">
          <div class="sp-field-group">
            <label class="sp-label">Month</label>
            <select class="sp-input" id="prev_exp_month"><option value="">None</option>${monthOpts}</select>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Year</label>
            <select class="sp-input" id="prev_exp_year">${yearOptsP}</select>
          </div>
        </div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px 14px;font-size:12px;color:#991b1b;">
          <i class="fa-solid fa-circle-check"></i> <b>Summary:</b>
          <span id="prev_exp_summary">${escapeHtml(p.Title)} · ₹${Number(p.Amount).toLocaleString(APP.locale||"en-IN")} · ${p.ForMonth||"General"} ${p.Year} · ${typeName}</span>
        </div>
        <div class="sp-actions" style="margin-top:16px;">
          <button class="sp-save-btn sp-save-red" id="prev_exp_submitBtn" onclick="_submitExpenseFromPreview()">
            <i class="fa-solid fa-check"></i> Confirm &amp; Save
          </button>
          <button class="sp-cancel-btn" onclick="_expenseReset()">
            <i class="fa-solid fa-arrow-left"></i> Back
          </button>
        </div>`;
    }

    /* ── Retry as-is: resend the exact failed payload unchanged (same
       IdempotencyKey), for when the failure was clearly transient (network
       blip) rather than bad data. Use "Edit & Retry" (_retryExpenseFailed)
       instead if the data itself needs fixing. ── */
    async function _retryExpenseAsIs() {
      const payload = window._expenseFailedPayload;
      if (!payload) { spClose(); return; }
      if (_expenseSubmitInFlight) return;
      _expenseSubmitInFlight = true;
      const expBody = document.getElementById("sp-expense-body");
      if (expBody) {
        expBody.innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
            '<i class="fa-solid fa-spinner fa-spin" style="font-size:2.5rem;color:#334155;margin-bottom:18px;"></i>' +
            '<div style="font-size:16px;font-weight:600;color:#1e293b;">Retrying…</div>' +
            '<div style="font-size:12px;color:#64748b;margin-top:6px;">Please wait, do not close.</div>' +
          '</div>';
      }
      try {
        const res = await postData(payload);
        _expenseSubmitInFlight = false;
        if (res.status === "success") {
          window._expenseFailedPayload = null;
          if (expBody) {
            expBody.innerHTML =
              '<div class="sp-steps">' + spStepsBar(3) + '</div>' +
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
                  '<i class="fa-solid fa-circle-check" style="color:#dc2626;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:10px;">Expense Saved!</div>' +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;">' +
                '<button class="sp-save-btn sp-save-red" onclick="spOpen(\'expense\')">' +
                  '<i class="fa-solid fa-plus"></i> Add Another' +
                '</button>' +
                '<button class="sp-cancel-btn" onclick="spClose()">' +
                  '<i class="fa-solid fa-xmark"></i> Close' +
                '</button>' +
              '</div>';
          }
          smartRefresh("expenses");
        } else {
          const errMsg = res.message || res.error || "Something went wrong. Please try again.";
          if (expBody) {
            expBody.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                  '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
                '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
                '<button class="sp-save-btn sp-save-red" onclick="_retryExpenseFailed()">' +
                  '<i class="fa-solid fa-pen"></i> Edit &amp; Retry' +
                '</button>' +
                '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryExpenseAsIs()" title="Resend the exact same details">' +
                  '<i class="fa-solid fa-rotate-right"></i> Retry as-is' +
                '</button>' +
              '</div>' +
              '<div style="text-align:center;margin-top:8px;">' +
                '<a href="javascript:void(0)" onclick="spClose()" style="font-size:11.5px;color:#94a3b8;text-decoration:underline;">Close without saving</a>' +
              '</div>';
          }
        }
      } catch (err) {
        _expenseSubmitInFlight = false;
        const errMsg = err.message || "Network error. Please try again.";
        if (expBody) {
          expBody.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
              '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
            '</div>' +
            '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
              '<button class="sp-save-btn sp-save-red" onclick="_retryExpenseFailed()">' +
                '<i class="fa-solid fa-pen"></i> Edit &amp; Retry' +
              '</button>' +
              '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryExpenseAsIs()" title="Resend the exact same details">' +
                '<i class="fa-solid fa-rotate-right"></i> Retry as-is' +
              '</button>' +
            '</div>' +
            '<div style="text-align:center;margin-top:8px;">' +
              '<a href="javascript:void(0)" onclick="spClose()" style="font-size:11.5px;color:#94a3b8;text-decoration:underline;">Close without saving</a>' +
            '</div>';
        }
      }
    }