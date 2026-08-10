    var _userFilterStatus = "all";

    function filterUsers(status, tabEl) {
      window._userFilterStatus = status;
      document.querySelectorAll(".status-tab").forEach(t => t.classList.remove("active"));
      if (tabEl) tabEl.classList.add("active");
      renderUsers();
    }

    /* ── Update tab counts + sidebar badge ── */
    function updateUserTabCounts(users) {
      if (!users) return;
      const all = users.length;
      const pending = users.filter(u => String(u.Status || "Active").toLowerCase() === "pending").length;
      const approved = users.filter(u => String(u.Status || "Active").toLowerCase() === "active").length;
      const rejected = users.filter(u => String(u.Status || "Active").toLowerCase() === "rejected").length;
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl("ct_all", all); setEl("ct_pending", pending);
      setEl("ct_approved", approved); setEl("ct_rejected", rejected);
      // Sidebar badge
      const badge = document.getElementById("pendingBadge");
      if (badge) {
        badge.textContent = pending;
        badge.classList.toggle("show", pending > 0);
      }
    }

    /* ── Wrap existing renderUsers to support filtering ── */
    /* This function intercepts the existing render. Find your existing
       renderUsers (or whatever renders the users table) and add this call
       at the TOP of that function:
           if (applyUserFilter(users)) return;
       OR simply call updateUserTabCounts(_users) after data loads.
       The filterUsers() function already calls renderUsersTable()
       which should be your existing render function.
       Rename it renderUsersTable if it has a different name. */

    /* ── APPROVE USER ── */
    function approveUser(userId, userName) {
      const html = `
     <div class="_mhdr">
       <h3><i class="fa-solid fa-circle-check" style="color:#27ae60;"></i> Approve Registration</h3>
       <button class="_mcls" onclick="closeModal()">×</button>
     </div>
     <div class="_mbdy" style="text-align:center;padding:20px 16px 10px;">
       <div style="width:56px;height:56px;border-radius:50%;background:#eafaf1;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:26px;">✅</div>
       <p style="font-size:15px;color:#334155;font-weight:600;margin:0 0 6px;">${escapeHtml(userName)}</p>
       <p style="font-size:13px;color:#64748b;margin:0 0 20px;">This will activate their account and send an approval email with login details.</p>
       <div style="display:flex;gap:10px;justify-content:center;">
         <button class="_mbtn" style="background:#999;min-width:90px;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Cancel</button>
         <button class="_mbtn" style="background:#27ae60;min-width:120px;" id="_approveOkBtn"><i class="fa-solid fa-check"></i> Approve</button>
       </div>
     </div>`;
      openModal(html, "380px");
      setTimeout(() => {
        const btn = document.getElementById("_approveOkBtn");
        if (btn) btn.addEventListener("click", () => {
          if (btn._inFlight) return; // double-submit guard
          btn._inFlight = true;
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Approving...';
          closeModal();
          const s = JSON.parse(localStorage.getItem("session") || "{}");
          postData({ action: "approveUser", UserId: userId, AdminName: s.name || "Admin" })
            .then(res => {
              btn._inFlight = false;
              if (res && res.status === "success") {
                toast("✅ " + userName + " approved! Approval email sent.");
                setTimeout(() => { try { smartRefresh("users"); } catch (e) { } }, 300);
              } else {
                toast("❌ " + (res && res.message ? res.message : "Approval failed."), "error");
              }
            })
            .catch(err => { btn._inFlight = false; toast("❌ " + err.message, "error"); });
        });
      }, 50);
    }

    /* ── REJECT USER ── */
    function rejectUser(userId, userName) {
      // Build reason modal inline using existing modal system
      const html = `
     <div class="_mhdr"><h3><i class="fa-solid fa-circle-xmark"></i> Reject Registration</h3>
       <button class="_mcls" onclick="closeModal()">×</button></div>
     <div class="_mbdy">
       <p style="font-size:13px;color:#475569;margin:0 0 14px;">
         You are about to reject <strong>${escapeHtml(userName)}</strong>'s registration request.
         A rejection email will be sent.
       </p>
       <label class="_fl">Reason <span style="color:#aaa;font-weight:400;">(optional — shown in email)</span></label>
       <textarea class="_fi" id="rejectReason" placeholder="e.g. Could not verify identity. Please contact household admin." rows="3"
         style="resize:vertical;min-height:70px;"></textarea>
     </div>
     <div class="_mft">
       <button class="_mbtn" style="background:#999;" onclick="closeModal()">
         <i class="fa-solid fa-xmark"></i> Cancel
       </button>
       <button class="_mbtn" style="background:#e74c3c;" onclick="confirmRejectUser('${escapeHtml(userId)}','${escapeHtml(userName)}')">
         <i class="fa-solid fa-circle-xmark"></i> Reject & Send Email
       </button>
     </div>`;
      openModal(html, "500px");
    }

    function confirmRejectUser(userId, userName) {
      const reason = (document.getElementById("rejectReason") || {}).value || "";
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      closeModal();
      postData({ action: "rejectUser", UserId: userId, Reason: reason, AdminName: s.name || "Admin" })
        .then(res => {
          if (res && res.status === "success") {
            toast("Registration for " + userName + " rejected. Email sent.", "warn");
            setTimeout(() => { try { smartRefresh("users"); } catch (e) { } }, 300);
          } else {
            toast("❌ " + (res && res.message ? res.message : "Rejection failed."), "error");
          }
        })
        .catch(err => toast("❌ " + err.message, "error"));
    }

    /* ── CHATBOT SETTINGS ── */
    function loadChatbotSettings() {
      const cbMsg = document.getElementById("cbotMsg");
      if (cbMsg) { cbMsg.textContent = "Loading..."; cbMsg.className = "msg-box"; }
      getCached("getChatbotConfig")
        .then(cfg => {
          if (!cfg) { if (cbMsg) { cbMsg.textContent = "Could not load settings."; cbMsg.className = "msg-box error"; } return; }
          const fields = [
            "welcome_en", "welcome_hi", "timings_en", "timings_hi",
            "location_en", "location_hi", "donate_en", "donate_hi",
            "bank_name", "bank_account", "bank_ifsc", "bank_branch",
            "upi_id", "contact_phone", "contact_email", "contact_whatsapp",
            "custom_q1_en", "custom_q1_hi", "custom_a1_en", "custom_a1_hi",
            "custom_q2_en", "custom_q2_hi", "custom_a2_en", "custom_a2_hi"
          ];
          fields.forEach(f => {
            const el = document.getElementById("cbot_" + f);
            if (el) el.value = (cfg[f] || "").replace(/\\n/g, "\n");
          });
          const tog = document.getElementById("cbot_enabled");
          // FIX: use ?? not || — "0" is falsy so ("0" || "1") = "1" wrongly shows toggle as ON
          if (tog) tog.checked = String(cfg.enabled ?? "1") !== "0";
          if (cbMsg) { cbMsg.textContent = ""; cbMsg.className = "msg-box"; }
        })
        .catch(err => {
          if (cbMsg) { cbMsg.textContent = "❌ " + err.message; cbMsg.className = "msg-box error"; }
        });
    }

    function saveChatbotSettings() {
      const cbMsg = document.getElementById("cbotMsg");
      const btn = document.querySelector('[onclick="saveChatbotSettings()"]');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }
      if (cbMsg) { cbMsg.textContent = ""; cbMsg.className = "msg-box"; }

      const fields = [
        "welcome_en", "welcome_hi", "timings_en", "timings_hi",
        "location_en", "location_hi", "donate_en", "donate_hi",
        "bank_name", "bank_account", "bank_ifsc", "bank_branch",
        "upi_id", "contact_phone", "contact_email", "contact_whatsapp",
        "custom_q1_en", "custom_q1_hi", "custom_a1_en", "custom_a1_hi",
        "custom_q2_en", "custom_q2_hi", "custom_a2_en", "custom_a2_hi"
      ];
      const data = { action: "saveChatbotConfig" };
      const togEl = document.getElementById("cbot_enabled");
      data["enabled"] = (togEl && togEl.checked) ? "1" : "0";
      fields.forEach(f => {
        const el = document.getElementById("cbot_" + f);
        if (el) data[f] = el.value.trim().replace(/\n/g, "\\n");
      });

      postData(data)
        .then(res => {
          if (res && res.status === "success") {
            toast("✅ Chatbot settings saved successfully!", "success");
            if (cbMsg) { cbMsg.textContent = "✓ Settings saved."; cbMsg.className = "msg-box success"; setTimeout(() => { cbMsg.textContent = ""; cbMsg.className = "msg-box"; }, 3000); }
            // FIX-5: Bust cache first so loadChatbotSettings always reads fresh data from server
            if (typeof mandirCacheBust === "function") mandirCacheBust("getChatbotConfig");
            if (typeof loadChatbotSettings === "function") setTimeout(loadChatbotSettings, 300);
          } else {
            toast("❌ " + (res && res.message ? res.message : "Save failed."), "error");
          }
        })
        .catch(err => toast("❌ " + err.message, "error"))
        .finally(() => {
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save All Settings'; }
        });
    }

    /* ── Hook showPage to auto-init lazy pages ── */
    document.addEventListener("DOMContentLoaded", function () {
      if (typeof showPage === "function") {
        var _spOrig = showPage;
        window.showPage = function (id, el) {
          _spOrig(id, el);
          if (id === "chatbotPage" && typeof loadChatbotSettings === "function")
            loadChatbotSettings();
          if (id === "trackerPage" && typeof initTrackerDropdowns === "function")
            setTimeout(initTrackerDropdowns, 100);
          if (id === "yearSummaryPage" && typeof loadYearSummary === "function")
            loadYearSummary();
          if (id === "emailAutoPage" && typeof initEmailAutoPage === "function")
            setTimeout(initEmailAutoPage, 100);
          if (id === "eventsPage" && typeof loadEvents === "function")
            loadEvents();
        };
      }
    });

// ════════════════════════════════════════════════════════════════
    //  ALL PRIORITY CHANGES — admin.html additions
    // ════════════════════════════════════════════════════════════════

    // ── M18: Show version in sidebar