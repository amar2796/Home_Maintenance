    (function () {
      const s = JSON.parse(localStorage.getItem("session") || "null");
      if (s && s.userId) broadcastSessionRevoke(s.userId);
    })();

    /* ═══ FIX 5: MANUAL WALK-IN CONTRIBUTION (no user account) ═══ */
    function openWalkInContribution() {
      const months = MONTHS; // PERF: reuse global
      const curY = new Date().getFullYear();
      let yearOpts = "";
      for (let y = curY + 1; y >= _getProjectStartYear(); y--) {
        let yLbl = y === curY ? y + " (Current)" : y < curY ? y + " (Old Entry)" : y + " (Advance)";
        yearOpts += `<option value="${y}"${y === curY ? " selected" : ""}>${yLbl}</option>`;
      }
      let monthOpts = months
        .map((m) => `<option value="${m}">${m}</option>`)
        .join("");
      let typeOpts = types
        .map(
          (t) =>
            `<option value="${t.TypeId}">${escapeHtml(t.TypeName)}</option>`
        )
        .join("");
      let occasionOpts =
        `<option value="">— None —</option>` +
        occasions
          .map(
            (o) =>
              `<option value="${o.OccasionId}">${escapeHtml(
                o.OccasionName
              )}</option>`
          )
          .join("");
      const wiPanelBody = document.getElementById("sp-walkin-body");
      if (!wiPanelBody) return;
      wiPanelBody.innerHTML = `
        <div class="sp-steps" id="sp-walkin-steps"></div>
        <div style="background:#fff8e8;border:1px solid #0F766E44;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#946c44;">
          <i class="fa-solid fa-circle-info"></i> Use this for donors who visit in person and do <b>not</b> have a registered account.
        </div>
        <div class="sp-field-group">
          <label class="sp-label">Donor Full Name <span class="sp-required">*</span></label>
          <input class="sp-input" id="wi_name" placeholder="e.g. Ramesh Kumar" />
        </div>
        <div class="sp-row2">
          <div class="sp-field-group">
            <label class="sp-label">Mobile <span class="sp-optional">(optional)</span></label>
            <input class="sp-input" id="wi_mobile" placeholder="e.g. 9876543210" maxlength="15" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Email <span class="sp-optional">(receipt if provided)</span></label>
            <input class="sp-input" id="wi_email" type="email" placeholder="donor@email.com" />
          </div>
        </div>
        <div class="sp-row2">
          <div class="sp-field-group">
            <label class="sp-label">Amount (₹) <span class="sp-required">*</span></label>
            <input class="sp-input" id="wi_amount" type="number" min="1" placeholder="Enter amount" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Year <span class="sp-required">*</span></label>
            <select class="sp-input" id="wi_year">${yearOpts}</select>
          </div>
        </div>
        <div class="sp-row2">
          <div class="sp-field-group">
            <label class="sp-label">Month</label>
            <select class="sp-input" id="wi_month"><option value="">— All / General —</option>${monthOpts}</select>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Type</label>
            <select class="sp-input" id="wi_type">${typeOpts}</select>
          </div>
        </div>
        <div class="sp-field-group">
          <label class="sp-label">Occasion</label>
          <select class="sp-input" id="wi_occasion">${occasionOpts}</select>
        </div>
        <div class="sp-field-group">
          <label class="sp-label">Note / Purpose <span class="sp-optional">(optional)</span></label>
          <input class="sp-input" id="wi_note" placeholder="e.g. Prasad, Pooja, Birthday" />
        </div>
        <div class="sp-actions">
          <button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="saveWalkIn()">
            <i class="fa-solid fa-check"></i> Save &amp; Get Receipt
          </button>
          <button class="sp-cancel-btn" onclick="spClose()">Cancel</button>
        </div>`;

      spOpen("walkin");
      spRenderSteps("sp-walkin-steps", 1);
    }

    async function saveWalkIn() {
      const name = document.getElementById("wi_name").value.trim();
      const mobile = document.getElementById("wi_mobile").value.trim();
      const email = (document.getElementById("wi_email")?.value || "").trim();
      const amount = document.getElementById("wi_amount").value;
      const year = document.getElementById("wi_year").value;
      const month = document.getElementById("wi_month").value;
      const typeId = document.getElementById("wi_type").value;
      const occasionId = document.getElementById("wi_occasion").value;
      const note = document.getElementById("wi_note").value.trim();
      if (!name) return toast("Please enter donor name.", "error");
      if (!amount || Number(amount) <= 0) return toast("Please enter a valid amount.", "error");

      // Build options for inline editing in preview
      const MOS2 = MONTHS; // PERF: reuse global
      const monthOptsWI = `<option value="">— All / General —</option>` + MOS2.map(m=>`<option value="${m}"${m===month?" selected":""}>${m}</option>`).join("");
      const curY2 = new Date().getFullYear();
      let yearOptsWI = "";
      for (let y=curY2+1;y>=_getProjectStartYear();y--) { let yLbl2=y===curY2?y+" (Current)":y<curY2?y+" (Old Entry)":y+" (Advance)"; yearOptsWI+=`<option value="${y}"${y===Number(year)?" selected":""}>${yLbl2}</option>`; }
      const typeOptsWI = types.map(t=>`<option value="${t.TypeId}"${String(t.TypeId)===typeId?" selected":""}>${escapeHtml(t.TypeName)}</option>`).join("");
      const occasionOptsWI = `<option value="">— None —</option>`+occasions.map(o=>`<option value="${o.OccasionId}"${String(o.OccasionId)===occasionId?" selected":""}>${escapeHtml(o.OccasionName)}</option>`).join("");
      const typeNameWI = types.find(t=>String(t.TypeId)===typeId)?.TypeName || "Contribution";

      const previewHtml = `
        <div class="_mhdr">
          <h3><i class="fa-solid fa-eye" style="color:#946c44;margin-right:8px;"></i> Preview Walk-in Entry</h3>
          <button class="_mcls" onclick="closeModal()">×</button>
        </div>
        <div class="_mbdy">
          <div style="background:linear-gradient(135deg,#fff8e8,#fef3cd);border:1.5px solid #0F766E44;border-radius:12px;padding:12px 16px;margin-bottom:14px;font-size:12px;color:#946c44;">
            <i class="fa-solid fa-circle-info"></i> Review all details. <b>Edit any field inline</b> before confirming.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="_fl">Donor Full Name <span style="color:#e74c3c">*</span></label>
              <input class="_fi" id="wprev_name" value="${escapeHtml(name)}" placeholder="Donor name" style="margin-bottom:0;" />
            </div>
            <div>
              <label class="_fl">Mobile</label>
              <input class="_fi" id="wprev_mobile" value="${escapeHtml(mobile)}" placeholder="Mobile number" style="margin-bottom:0;" />
            </div>
            <div>
              <label class="_fl">Email <span style="font-size:10px;color:#888;font-weight:400;">(optional)</span></label>
              <input class="_fi" id="wprev_email" type="email" value="${escapeHtml(email)}" placeholder="donor@email.com" style="margin-bottom:0;" />
            </div>
            <div>
              <label class="_fl">Amount (₹) <span style="color:#e74c3c">*</span></label>
              <input class="_fi" id="wprev_amount" type="number" min="1" value="${escapeHtml(amount)}" style="margin-bottom:0;" />
            </div>
            <div>
              <label class="_fl">Month</label>
              <select class="_fi" id="wprev_month" style="margin-bottom:0;">${monthOptsWI}</select>
            </div>
            <div>
              <label class="_fl">Year</label>
              <select class="_fi" id="wprev_year" style="margin-bottom:0;">${yearOptsWI}</select>
            </div>
            <div>
              <label class="_fl">Type</label>
              <select class="_fi" id="wprev_type" style="margin-bottom:0;">${typeOptsWI}</select>
            </div>
            <div>
              <label class="_fl">Occasion</label>
              <select class="_fi" id="wprev_occasion" style="margin-bottom:0;">${occasionOptsWI}</select>
            </div>
          </div>
          <div style="margin-top:10px;">
            <label class="_fl">Note / Purpose</label>
            <input class="_fi" id="wprev_note" value="${escapeHtml(note)}" placeholder="e.g. Prasad, Pooja, Birthday" style="margin-bottom:0;" />
          </div>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 14px;margin-top:14px;font-size:12px;color:#15803d;">
            <i class="fa-solid fa-circle-check"></i> <b>Summary:</b>
            <span id="wprev_summary">${escapeHtml(name)} · ₹${Number(amount).toLocaleString(APP.locale||"en-IN")} · ${month||"General"} ${year} · ${typeNameWI}</span>
          </div>
        </div>
        <div class="_mft">
          <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal();openWalkInContribution()"><i class="fa-solid fa-arrow-left"></i> Back & Edit</button>
          <button class="_mbtn" id="wprev_submitBtn" style="background:#946c44;" onclick="_submitWalkInFromPreview()"><i class="fa-solid fa-check"></i> Confirm & Save</button>
        </div>`;
      // Show preview in the same slide panel (replace body content)
      const wiPrevBody = document.getElementById("sp-walkin-body");
      if (!wiPrevBody) { openModal(previewHtml, "560px"); return; }
      wiPrevBody.innerHTML = `
        <div class="sp-steps">${spStepsBar(2)}</div>
        <div style="background:linear-gradient(135deg,#fff8e8,#fef3cd);border:1.5px solid #0F766E44;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#946c44;">
          <i class="fa-solid fa-circle-info"></i> Review all details. <b>Edit any field inline</b> before confirming.
        </div>
        <div class="sp-row2">
          <div class="sp-field-group">
            <label class="sp-label">Donor Full Name <span class="sp-required">*</span></label>
            <input class="sp-input" id="wprev_name" value="${escapeHtml(name)}" placeholder="Donor name" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Mobile</label>
            <input class="sp-input" id="wprev_mobile" value="${escapeHtml(mobile)}" placeholder="Mobile number" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Email <span class="sp-optional">(optional)</span></label>
            <input class="sp-input" id="wprev_email" type="email" value="${escapeHtml(email)}" placeholder="donor@email.com" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Amount (₹) <span class="sp-required">*</span></label>
            <input class="sp-input" id="wprev_amount" type="number" min="1" value="${escapeHtml(amount)}" />
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Month</label>
            <select class="sp-input" id="wprev_month">${monthOptsWI}</select>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Year</label>
            <select class="sp-input" id="wprev_year">${yearOptsWI}</select>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Type</label>
            <select class="sp-input" id="wprev_type">${typeOptsWI}</select>
          </div>
          <div class="sp-field-group">
            <label class="sp-label">Occasion</label>
            <select class="sp-input" id="wprev_occasion">${occasionOptsWI}</select>
          </div>
        </div>
        <div class="sp-field-group">
          <label class="sp-label">Note / Purpose</label>
          <input class="sp-input" id="wprev_note" value="${escapeHtml(note)}" placeholder="e.g. Prasad, Pooja, Birthday" />
        </div>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 14px;margin-top:4px;font-size:12px;color:#15803d;">
          <i class="fa-solid fa-circle-check"></i> <b>Summary:</b>
          <span id="wprev_summary">${escapeHtml(name)} · ₹${Number(amount).toLocaleString(APP.locale||"en-IN")} · ${month||"General"} ${year} · ${typeNameWI}</span>
        </div>
        <div class="sp-actions" style="margin-top:16px;">
          <button class="sp-save-btn" style="background:#b45309;color:#fff;" id="wprev_submitBtn" onclick="_submitWalkInFromPreview()">
            <i class="fa-solid fa-check"></i> Confirm &amp; Save
          </button>
          <button class="sp-cancel-btn" onclick="openWalkInContribution()">
            <i class="fa-solid fa-arrow-left"></i> Back
          </button>
        </div>`;
      spOpen("walkin");

      // Live summary updater — wire up after DOM is populated
      function _updateWISummary() {
        const nm = document.getElementById("wprev_name")?.value||"";
        const amt = document.getElementById("wprev_amount")?.value||"0";
        const mo = document.getElementById("wprev_month")?.value||"General";
        const yr = document.getElementById("wprev_year")?.value||"";
        const tid = document.getElementById("wprev_type")?.value;
        const tn = types.find(t=>String(t.TypeId)===tid)?.TypeName||"";
        const el = document.getElementById("wprev_summary");
        if (el) el.textContent = `${nm} · ₹${Number(amt).toLocaleString(APP.locale||"en-IN")} · ${mo} ${yr} · ${tn}`;
      }
      ["wprev_name","wprev_amount","wprev_month","wprev_year","wprev_type","wprev_occasion"].forEach(id=>{
        const el=document.getElementById(id);
        if(el) el.addEventListener("change",_updateWISummary);
        if(el&&el.tagName==="INPUT") el.addEventListener("input",_updateWISummary);
      });
    }

    var _walkInInFlight = false; // [DUP-FIX-3] guard: prevents double-submit on walk-in form
    async function _submitWalkInFromPreview() {
      // [DUP-FIX-3] Reject if already in flight — btn.disabled alone isn't enough on mobile fast-tap
      if (_walkInInFlight) return;
      _walkInInFlight = true;
      const btn = document.getElementById("wprev_submitBtn");
      if (btn) { btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; btn._noAutoLoad = true; }
      const name = (document.getElementById("wprev_name")?.value||"").trim();
      const mobile = (document.getElementById("wprev_mobile")?.value||"").trim();
      const email = (document.getElementById("wprev_email")?.value||"").trim();
      const amount = document.getElementById("wprev_amount")?.value;
      const year = document.getElementById("wprev_year")?.value;
      const month = document.getElementById("wprev_month")?.value;
      const typeId = document.getElementById("wprev_type")?.value;
      const occasionId = document.getElementById("wprev_occasion")?.value;
      const note = (document.getElementById("wprev_note")?.value||"").trim();
      if (!name) { _walkInInFlight=false; if(btn){btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm & Save';} return toast("Please enter donor name.", "error"); }
      if (!amount || Number(amount) <= 0) { _walkInInFlight=false; if(btn){btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm & Save';} return toast("Please enter a valid amount.", "error"); }
      // [ID] Send "WALKIN" as signal — backend generates WALKIN_YYYY_NNNNN (year-wise sequential)
      // [FIX-1] Also pass WalkInYear so backend uses the form's selected year (not server clock year)
      const walkInUserId = "WALKIN";
      try {
        let payload = {
          action: "addContribution",
          // [ID] FIX: No Id passed — backend generates CONT-NNNNN sequentially
          UserId: walkInUserId,
          WalkInYear: year,   // [FIX-1] Backend uses this year for WALKIN_YYYY_NNNNN
          Amount: amount,
          ForMonth: month || "General",
          Year: year,
          TypeId: typeId,
          OccasionId: occasionId,
          Note: (note ? note + " | " : "") + "Walk-in: " + name + (mobile ? " | " + mobile : ""),
          // Fresh key each call — see _genIdemKey comment near its definition.
          // "Retry as-is" (_retryWalkInFailed) resends this exact stored payload
          // object instead of calling this function again, keeping that path's
          // key identical to the failed attempt.
          IdempotencyKey: _genIdemKey("walkin"),
        };
        if (email) payload.WalkInEmail = email;
        window._walkInFailedPayload = { payload, name, mobile, email, amount, month, year, typeId, occasionId, note };
        let res = await postData(payload);
        if (res.status === "success") {
          _walkInInFlight = false;
          const rid = res.receiptId || ((APP.receiptPrefix||"REC") + "-wi" + Date.now());
          const tName = types.find(t => String(t.TypeId) === String(typeId));
          const typeLbl  = tName ? tName.TypeName : "Contribution";
          const monthLbl = month || "General";
          const emailNote = email
            ? (res.emailSent
                ? "Receipt emailed to " + escapeHtml(email) + "."
                : (res.emailSkipped ? "Email quota reached - email not sent." : ""))
            : "";

          // Show receipt card inside the walk-in slide panel
          const wiBody = document.getElementById("sp-walkin-body");
          if (wiBody) {
            wiBody.innerHTML =
              '<div class="sp-steps">' + spStepsBar(3) + '</div>' +
              '<div style="display:flex;flex-direction:column;align-items:center;' +
              'justify-content:center;min-height:300px;text-align:center;padding:20px 16px 10px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);' +
                'border-radius:50%;display:flex;align-items:center;justify-content:center;' +
                'margin-bottom:16px;border:2px solid #6ee7b7;' +
                'animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
                  '<i class="fa-solid fa-circle-check" style="color:#16a34a;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:4px;">Walk-in Entry Saved!</div>' +
                '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">Entry recorded successfully</div>' +
              '</div>' +
              '<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;' +
              'padding:14px 16px;margin:0 4px 14px;font-size:12.5px;">' +
                '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px;text-align:left;">' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Receipt</span>' +
                  '<strong style="color:#15803d;font-size:13px;">' + escapeHtml(rid) + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Donor</span>' +
                  '<strong style="color:#1e293b;">' + escapeHtml(name) + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Amount</span>' +
                  '<strong style="color:#1e293b;">Rs.' + Number(amount).toLocaleString(APP.locale||"en-IN") + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Period</span>' +
                  '<strong style="color:#1e293b;">' + escapeHtml(monthLbl) + ' ' + escapeHtml(year || "") + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Type</span>' +
                  '<strong style="color:#1e293b;">' + escapeHtml(typeLbl) + '</strong>' +
                  (mobile ? '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Mobile</span>' +
                            '<strong style="color:#1e293b;">' + escapeHtml(mobile) + '</strong>' : '') +
                '</div>' +
                (emailNote ? '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;' +
                             'font-size:11.5px;color:#64748b;">' + emailNote + '</div>' : '') +
              '</div>' +
              '<div class="sp-actions">' +
                '<button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="openWalkInContribution()">' +
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
          _walkInInFlight = false;
          const errMsg = res.message || "Something went wrong.";
          const wiBodyErr = document.getElementById("sp-walkin-body");
          if (wiBodyErr) {
            wiBodyErr.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                  '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
                '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
                '<button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="_editRetryWalkIn()">' +
                  '<i class="fa-solid fa-pen"></i> Edit &amp; Retry' +
                '</button>' +
                '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryWalkInFailed()" title="Resend the exact same details">' +
                  '<i class="fa-solid fa-rotate-right"></i> Retry as-is' +
                '</button>' +
              '</div>' +
              '<div style="text-align:center;margin-top:8px;">' +
                '<a href="javascript:void(0)" onclick="spClose()" style="font-size:11.5px;color:#94a3b8;text-decoration:underline;">Close without saving</a>' +
              '</div>';
          } else {
            toast("Failed: " + errMsg, "error");
            if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm & Save'; }
          }
        }
      } catch (e) {
        _walkInInFlight = false;
        const errMsg = e.message || "Network error.";
        const wiBodyCatch = document.getElementById("sp-walkin-body");
        if (wiBodyCatch) {
          wiBodyCatch.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
              '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
            '</div>' +
            '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
              '<button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="_editRetryWalkIn()">' +
                '<i class="fa-solid fa-pen"></i> Edit &amp; Retry' +
              '</button>' +
              '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryWalkInFailed()" title="Resend the exact same details">' +
                '<i class="fa-solid fa-rotate-right"></i> Retry as-is' +
              '</button>' +
            '</div>' +
            '<div style="text-align:center;margin-top:8px;">' +
              '<a href="javascript:void(0)" onclick="spClose()" style="font-size:11.5px;color:#94a3b8;text-decoration:underline;">Close without saving</a>' +
            '</div>';
        } else {
          toast(errMsg, "error");
          if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-check"></i> Confirm & Save'; }
        }
      }
    }

    /* ── Retry failed walk-in using the exact same payload ── */
    async function _retryWalkInFailed() {
      const stored = window._walkInFailedPayload;
      if (!stored) return toast("No failed walk-in entry to retry.", "error");
      if (_walkInInFlight) return;
      _walkInInFlight = true;
      const wiBody = document.getElementById("sp-walkin-body");
      if (wiBody) {
        wiBody.innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
            '<i class="fa-solid fa-spinner fa-spin" style="font-size:2.5rem;color:#334155;margin-bottom:18px;"></i>' +
            '<div style="font-size:16px;font-weight:600;color:#1e293b;">Retrying…</div>' +
            '<div style="font-size:12px;color:#64748b;margin-top:6px;">Please wait, do not close.</div>' +
          '</div>';
      }
      try {
        const res = await postData(stored.payload);
        _walkInInFlight = false;
        if (res.status === "success") {
          window._walkInFailedPayload = null;
          const rid = res.receiptId || ((APP.receiptPrefix||"REC") + "-wi" + Date.now());
          const tName = types.find(t => String(t.TypeId) === String(stored.typeId));
          const typeLbl = tName ? tName.TypeName : "Contribution";
          const monthLbl = stored.month || "General";
          const emailNote = stored.email
            ? (res.emailSent ? "Receipt emailed to " + escapeHtml(stored.email) + "."
                : (res.emailSkipped ? "Email quota reached - email not sent." : ""))
            : "";
          if (wiBody) {
            wiBody.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px 16px 10px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px;border:2px solid #6ee7b7;animation:_csBounce 0.5s cubic-bezier(0.34,1.56,0.64,1) both;">' +
                  '<i class="fa-solid fa-circle-check" style="color:#16a34a;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:4px;">Walk-in Entry Saved!</div>' +
                '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">Entry recorded successfully</div>' +
              '</div>' +
              '<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:0 4px 14px;font-size:12.5px;">' +
                '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px;text-align:left;">' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Receipt</span>' +
                  '<strong style="color:#15803d;font-size:13px;">' + escapeHtml(rid) + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Donor</span>' +
                  '<strong style="color:#1e293b;">' + escapeHtml(stored.name) + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Amount</span>' +
                  '<strong style="color:#1e293b;">Rs.' + Number(stored.amount).toLocaleString(APP.locale||"en-IN") + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Period</span>' +
                  '<strong style="color:#1e293b;">' + escapeHtml(monthLbl) + ' ' + escapeHtml(stored.year || "") + '</strong>' +
                  '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Type</span>' +
                  '<strong style="color:#1e293b;">' + escapeHtml(typeLbl) + '</strong>' +
                  (stored.mobile ? '<span style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;">Mobile</span><strong style="color:#1e293b;">' + escapeHtml(stored.mobile) + '</strong>' : '') +
                '</div>' +
                (emailNote ? '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:11.5px;color:#64748b;">' + emailNote + '</div>' : '') +
              '</div>' +
              '<div class="sp-actions">' +
                '<button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="openWalkInContribution()">' +
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
          const errMsg = res.message || "Something went wrong.";
          if (wiBody) {
            wiBody.innerHTML =
              '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
                '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                  '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
                '</div>' +
                '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
                '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
              '</div>' +
              '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
                '<button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="_editRetryWalkIn()">' +
                  '<i class="fa-solid fa-pen"></i> Edit &amp; Retry' +
                '</button>' +
                '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryWalkInFailed()" title="Resend the exact same details">' +
                  '<i class="fa-solid fa-rotate-right"></i> Retry as-is' +
                '</button>' +
              '</div>' +
              '<div style="text-align:center;margin-top:8px;">' +
                '<a href="javascript:void(0)" onclick="spClose()" style="font-size:11.5px;color:#94a3b8;text-decoration:underline;">Close without saving</a>' +
              '</div>';
          }
        }
      } catch(e) {
        _walkInInFlight = false;
        const errMsg = e.message || "Network error.";
        if (wiBody) {
          wiBody.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;text-align:center;padding:20px;">' +
              '<div style="width:72px;height:72px;background:linear-gradient(135deg,#fef2f2,#fecaca);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:18px;border:2px solid #fca5a5;">' +
                '<i class="fa-solid fa-circle-xmark" style="color:#dc2626;font-size:2rem;"></i>' +
              '</div>' +
              '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Save Failed</div>' +
              '<div style="font-size:12.5px;color:#64748b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;max-width:320px;line-height:1.6;">' + escapeHtml(errMsg) + '</div>' +
            '</div>' +
            '<div class="sp-actions" style="margin-top:auto;flex-wrap:wrap;">' +
              '<button class="sp-save-btn" style="background:#b45309;color:#fff;" onclick="_editRetryWalkIn()">' +
                '<i class="fa-solid fa-pen"></i> Edit &amp; Retry' +
              '</button>' +
              '<button class="sp-cancel-btn" style="flex:0 0 auto;" onclick="_retryWalkInFailed()" title="Resend the exact same details">' +
                '<i class="fa-solid fa-rotate-right"></i> Retry as-is' +
              '</button>' +
            '</div>' +
            '<div style="text-align:center;margin-top:8px;">' +
              '<a href="javascript:void(0)" onclick="spClose()" style="font-size:11.5px;color:#94a3b8;text-decoration:underline;">Close without saving</a>' +
            '</div>';
        }
      }
    }
    window._retryWalkInFailed = _retryWalkInFailed;

    /* ── Edit & Retry: reopen the walk-in form pre-filled with the failed
       entry's values, then rebuild the Review step from those (possibly
       edited) values. Confirming from there calls _submitWalkInFromPreview()
       normally, which always mints a fresh IdempotencyKey. ── */
    function _editRetryWalkIn() {
      const stored = window._walkInFailedPayload;
      if (!stored) { spClose(); return; }
      openWalkInContribution(); // rebuilds a fresh wi_* form
      const _s = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; };
      _s("wi_name", stored.name);
      _s("wi_mobile", stored.mobile);
      _s("wi_email", stored.email);
      _s("wi_amount", stored.amount);
      _s("wi_year", stored.year);
      _s("wi_month", stored.month);
      _s("wi_type", stored.typeId);
      if (stored.occasionId) _s("wi_occasion", stored.occasionId);
      // Original note had "Walk-in: name | mobile" appended server-side —
      // don't try to reverse-parse that back out, leave note blank to re-enter.
      saveWalkIn(); // rebuilds the Review (step 2) screen from these values
    }