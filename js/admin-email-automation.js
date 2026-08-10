/* ═══════════════════════════════════════════════════════════════════
   EMAIL AUTOMATION — Admin controls for automated member emails
   (Auto Receipt, Monthly End-of-Month Report, Birthday Email,
   Admin Monthly Summary) on pages/emailAutoPage.html.

   Restored from the pre-split production admin.js — this entire
   controller was missing after the per-section file split, which is
   why the page was stuck on "Loading status..." and every control on
   it (toggles + the 3 manual "Send Now"/"Send Test" buttons) threw
   "not defined" errors. Logic below is unchanged from the working
   production version; only the surrounding file is new.

   Depends on (all present elsewhere in the app):
     app.js         → postData, getCached, getEmailQuotaCached,
                       mandirCacheBust, toast, API_URL, MONTHS
     admin-core.js  → _refreshEmailQuotaUI

   NOTE: initEmailAutoPage() below populates a birthday-member dropdown
   from a global `users` array. That global is not currently declared
   anywhere in the split codebase (separate, pre-existing issue — not
   part of this fix), so that specific dropdown will render empty until
   that's addressed. Everything else in this file does not depend on
   `users` and is unaffected.
   ═══════════════════════════════════════════════════════════════════ */

    // ══ EMAIL AUTOMATION JS ══
    function loadEmailSettings() {
      // Show spinner immediately so toggles are visibly "loading"
      ["ea_receipt_status", "ea_monthly_status"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = "<span style='color:#94a3b8;'>Loading status...</span>";
      });

      getCached("getEmailSettings").then(function (s) {
        // FIX: use strict === true (Apps Script now returns proper booleans)
        var receiptOn  = s === true || (s && s.auto_receipt    === true);
        var monthlyOn  = s === true || (s && s.monthly_report  === true);
        var birthdayOn = s && s.birthday_email === true;
        var adminSummaryOn = s && s.admin_monthly_summary === true;
        var tReceipt  = document.getElementById("toggle_auto_receipt");
        var tMonthly  = document.getElementById("toggle_monthly_report");
        var tBirthday = document.getElementById("toggle_birthday_email");
        var tAdminSummary = document.getElementById("toggle_admin_monthly_summary");
        if (tReceipt)  { tReceipt.checked  = receiptOn;  tReceipt.disabled  = false; }
        if (tMonthly)  { tMonthly.checked  = monthlyOn;  tMonthly.disabled  = false; }
        if (tBirthday) { tBirthday.checked = birthdayOn; tBirthday.disabled = false; }
        if (tAdminSummary) { tAdminSummary.checked = adminSummaryOn; tAdminSummary.disabled = false; }
        _updateToggleStatus("auto_receipt",   receiptOn);
        _updateToggleStatus("monthly_report", monthlyOn);
        _updateToggleStatus("birthday_email", birthdayOn);
        _updateToggleStatus("admin_monthly_summary", adminSummaryOn);
        _updateCardStyle("ea_card_receipt",  receiptOn);
        _updateCardStyle("ea_card_monthly",  monthlyOn);
        _updateCardStyle("ea_card_birthday", birthdayOn);
        _updateCardStyle("ea_card_admin_summary", adminSummaryOn);
        // logo_email_url removed from settings — logo now auto-loaded from CFG.folderLogo
        // Load live preview: call getLogoPreview action on Apps Script
        _loadEmailLogoPreview();
        if (!s || typeof s !== "object") {
          var el = document.getElementById("ea_quota_display");
          if (el) el.innerHTML = "<span style='color:#f87171;'>Could not load settings — check Apps Script deployment &amp; redeploy</span>";
        }
      }).catch(function () {
        // Fetch failed — show OFF state, re-enable toggles
        ["toggle_auto_receipt", "toggle_monthly_report", "toggle_birthday_email", "toggle_admin_monthly_summary"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) { el.checked = false; el.disabled = false; }
        });
        _updateToggleStatus("auto_receipt",   false);
        _updateToggleStatus("monthly_report", false);
        _updateToggleStatus("birthday_email", false);
        _updateToggleStatus("admin_monthly_summary", false);
        var el = document.getElementById("ea_quota_display");
        if (el) el.innerHTML = "<span style='color:#f87171;'>Cannot reach server — check Apps Script deployment</span>";
      });

      // Load quota
      getEmailQuotaCached().then(function (q) {
        var el = document.getElementById("ea_quota_display");
        if (el && q && q.limit) {
          var pct = Math.round((q.used / q.limit) * 100);
          var col = pct > 80 ? "#f87171" : pct > 50 ? "#fbbf24" : "#34d399";
          el.innerHTML = "<strong style='color:" + col + ";'>" + q.used + "</strong> used of <strong>" + q.limit + "</strong> today &nbsp;&middot;&nbsp; <strong style='color:#34d399;'>" + q.remaining + " remaining</strong>";
        }
      }).catch(function () { });
    }

    // Extract a bare Drive File ID from whatever the admin pastes:
    // Accepts: bare ID, https://drive.google.com/file/d/ID/view, https://drive.google.com/open?id=ID
    // ── Email logo live preview — fetches the logo the server will use in emails
    // Calls getPhotoBase64 with action=getEmailLogoPreview so it reads CFG.folderLogo
    // and returns the first image found. Shows it in the admin card instantly.
    function _loadEmailLogoPreview() {
      var statusEl = document.getElementById("ea_logo_status_text");
      var img      = document.getElementById("ea_logo_preview_img");
      var fallback = document.getElementById("ea_logo_fallback");
      if (statusEl) statusEl.textContent = "Loading logo from Drive folder…";
      postData({ action: "getEmailLogoPreview" })
        .then(function (res) {
          if (res && res.status === "success" && res.base64) {
            if (img) {
              img.src = res.base64;
              img.style.display = "block";
            }
            if (fallback) fallback.style.display = "none";
            if (statusEl) statusEl.innerHTML = "✅ <strong>Logo found</strong> — used in all emails";
          } else {
            // No image in folder — Om symbol shows by default via CSS
            if (img) img.style.display = "none";
            if (fallback) fallback.style.display = "block";
            if (statusEl) statusEl.innerHTML =
              "🕉️ <span style='color:#64748b;'>No logo image found in folder — Om symbol used as fallback.<br>" +
              "Add a logo.png to your Drive <strong>Logo folder</strong> (<code>CFG.folderLogo</code>) to use a custom logo.</span>";
          }
        }).catch(function () {
          if (statusEl) statusEl.innerHTML = "<span style='color:#f87171;'>❌ Could not reach server — check Apps Script deployment.</span>";
        });
    }
    function _updateToggleStatus(key, isOn) {
      var statusMap = {
        "auto_receipt":   "ea_receipt_status",
        "monthly_report": "ea_monthly_status",
        "birthday_email": "ea_birthday_status",
        "admin_monthly_summary": "ea_admin_summary_status"
      };
      var el = document.getElementById(statusMap[key]);
      if (!el) return;
      var dot = isOn
        ? "<span style='display:inline-block;width:10px;height:10px;border-radius:50%;background:#10b981;margin-right:5px;vertical-align:middle;'></span>"
        : "<span style='display:inline-block;width:10px;height:10px;border-radius:50%;background:#94a3b8;margin-right:5px;vertical-align:middle;'></span>";
      var label = isOn
        ? "<strong style='color:#059669;'>Active</strong> — emails will be sent automatically"
        : "<strong style='color:#94a3b8;'>Inactive</strong> — no automatic emails";
      el.innerHTML = dot + label;
    }

    function _updateCardStyle(cardId, isOn) {
      const card = document.getElementById(cardId);
      if (!card) return;
      card.style.borderColor = isOn ? "#6ee7b7" : "#e2e8f0";
      card.style.background = isOn ? "#f0fdf9" : "#fff";
    }

    function saveEmailToggle(key, value) {
      // Show saving indicator
      var cardMap = { "auto_receipt": "ea_card_receipt", "monthly_report": "ea_card_monthly", "birthday_email": "ea_card_birthday", "admin_monthly_summary": "ea_card_admin_summary" };
      var labelMap = { "auto_receipt": "Auto Receipt Email", "monthly_report": "Monthly Report", "birthday_email": "Birthday Email", "admin_monthly_summary": "Admin Monthly Summary" };
      const cardId = cardMap[key] || "ea_card_receipt";
      const card = document.getElementById(cardId);
      if (card) card.style.opacity = "0.6";

      postData({ action: "saveEmailSettings", key: key, value: value ? "1" : "0" })
        .then(function (res) {
          if (card) card.style.opacity = "1";
          if (res && res.status === "ok") {
            toast(value ? "✅ " + (labelMap[key] || key) + " enabled" : "⭕ Disabled", "");
            _updateToggleStatus(key, value);
            _updateCardStyle(cardMap[key] || cardId, value);
            // FIX-14: bust settings cache so next loadEmailSettings() reads fresh state
            if (typeof mandirCacheBust === "function") mandirCacheBust("getEmailSettings");
            // Refresh quota counter — enabling auto-receipt can affect quota estimate
            setTimeout(_refreshEmailQuotaUI, 600);
          } else {
            toast("❌ Save failed — check Apps Script deployment", "error");
            const el = document.getElementById("toggle_" + key);
            if (el) el.checked = !value;
          }
        })
        .catch(function () {
          if (card) card.style.opacity = "1";
          toast("❌ Network error saving setting", "error");
          const el = document.getElementById("toggle_" + key);
          if (el) el.checked = !value;
        });
    }

    function initEmailAutoPage() {
      // Populate month/year dropdowns for manual send
      const now = new Date();
      const mSel = document.getElementById("ea_test_month");
      const ySel = document.getElementById("ea_test_year");
      if (mSel && mSel.options.length === 0) {
        MONTHS.forEach((m, i) => {
          const o = document.createElement("option");
          o.value = m; o.textContent = m;
          if (i === now.getMonth()) o.selected = true;
          mSel.appendChild(o);
        });
      }
      if (ySel && ySel.options.length === 0) {
        const cur = now.getFullYear();
        for (let y = cur; y >= cur - 2; y--) {
          const o = document.createElement("option");
          o.value = y; o.textContent = y;
          if (y === cur) o.selected = true;
          ySel.appendChild(o);
        }
      }
      loadEmailSettings();
      // Populate birthday user dropdown
      var bSel = document.getElementById("ea_birthday_user");
      if (bSel && bSel.options.length <= 1) {
        var members = (typeof users !== "undefined" ? users : []).filter(function(u) {
          return String(u.Role||"").toLowerCase() !== "admin" &&
                 String(u.Status||"Active").toLowerCase() === "active";
        });
        members.sort(function(a,b){ return (a.Name||"").localeCompare(b.Name||""); });
        members.forEach(function(u) {
          var o = document.createElement("option");
          o.value = u.UserId;
          o.textContent = (u.Name||"Unknown") + (u.DOB ? " 🎂" : " (no DOB)") + (u.Email ? "" : " — no email");
          if (!u.Email || !u.DOB) o.style.color = "#94a3b8";
          bSel.appendChild(o);
        });
      }
    }

    function triggerTestBirthdayEmail() {
      var userId = (document.getElementById("ea_birthday_user")||{}).value || "";
      var res = document.getElementById("ea_birthday_result");
      var btn = document.querySelector("[onclick='triggerTestBirthdayEmail()']");
      if (!userId) { toast("Please select a member first", "warn"); return; }
      if (res) { res.style.display = "block"; res.style.background = "#F0FDFA"; res.style.borderLeftColor = "#3b82f6"; res.style.color = "#1e40af"; res.textContent = "⏳ Sending test birthday email..."; }
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...'; }
      postData({ action: "sendBirthdayEmails", isTest: "1", userId: userId })
        .then(function(data) {
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Test'; }
          var ok = data && (data.status === "success" || data.sent > 0);
          if (res) {
            res.style.background = ok ? "#f0fdf4" : "#fef2f2";
            res.style.borderLeftColor = ok ? "#22c55e" : "#ef4444";
            res.style.color = ok ? "#166534" : "#991b1b";
            res.textContent = data ? data.message : "❌ Unknown error";
          }
          if (ok) { toast("✅ Birthday test email sent!", ""); _refreshEmailQuotaUI(); }
          else toast("❌ Failed: " + (data&&data.message||"error"), "error");
        })
        .catch(function(err) {
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Test'; }
          if (res) { res.style.background = "#fef2f2"; res.style.borderLeftColor = "#ef4444"; res.style.color = "#991b1b"; res.textContent = "❌ Network error: " + err.message; }
          toast("❌ Network error", "error");
        });
    }

    function triggerManualMonthlyReport() {
      const month = document.getElementById("ea_test_month")?.value;
      const year = document.getElementById("ea_test_year")?.value;
      const mode = document.getElementById("ea_send_mode")?.value || "reminders_only";
      if (!month || !year) { toast("Select month and year", "warn"); return; }
      const res = document.getElementById("ea_manual_result");
      const btn = document.querySelector("[onclick='triggerManualMonthlyReport()']");

      // Disable button while running
      if (btn) { btn.disabled = true; btn.textContent = "⏳ Sending..."; }
      if (res) {
        res.style.display = "block";
        res.innerHTML = "⏳ Sending emails... this may take 1–3 minutes for large member lists. Please wait.";
        res.style.color = "#64748b";
      }

      // FIX: Google Apps Script CDN cuts off JSONP responses >30s.
      // Solution: fire-and-forget trigger, then poll getMonthlyReportStatus every 5s.
      // Apps Script stores result in PropertiesService; poll reads it when ready.
      const jobKey = "mreport_" + Date.now();
      let pollCount = 0;
      const MAX_POLLS = 36; // 36 × 5s = 3 minutes max wait

      // Step 1 — Fire the job (fire-and-forget, ignore response)
      // [FIX] This request was missing sessionToken/userId entirely, so the
      // backend's _verifySession() (required for triggerMonthlyReport /
      // triggerMonthlyReminder) always rejected it with "Session expired."
      // — regardless of whether the admin was actually logged in.
      const _mrSess = JSON.parse(localStorage.getItem("session") || "{}");
      (function () {
        const cbFire = "cb_mrf_" + Date.now();
        const script = document.createElement("script");
        window[cbFire] = function () { try { delete window[cbFire]; script.remove(); } catch (e) { } };
        script.onerror = function () { try { delete window[cbFire]; script.remove(); } catch (e) { } };
        const action = (mode === "reminders_only") ? "triggerMonthlyReminder" : "triggerMonthlyReport";
        script.src = API_URL + "?action=" + action + "&month=" + encodeURIComponent(month) +
          "&year=" + encodeURIComponent(year) + "&jobKey=" + encodeURIComponent(jobKey) +
          "&sessionToken=" + encodeURIComponent(_mrSess.sessionToken || "") +
          "&userId=" + encodeURIComponent(_mrSess.userId || "") +
          "&callback=" + cbFire;
        document.body.appendChild(script);
      })();

      // Step 2 — Poll every 5s for result
      function _pollResult() {
        pollCount++;
        const cbPoll = "cb_mrp_" + Date.now();
        const script = document.createElement("script");
        const timer = setTimeout(function () {
          try { delete window[cbPoll]; script.remove(); } catch (e) { }
          if (pollCount < MAX_POLLS) {
            setTimeout(_pollResult, 5000);
          } else {
            _reportDone(null, true);
          }
        }, 8000);
        window[cbPoll] = function (r) {
          clearTimeout(timer);
          try { delete window[cbPoll]; script.remove(); } catch (e) { }
          if (r && r.status === "ok") {
            _reportDone(r, false);
          } else if (r && r.status === "pending") {
            // Still running — keep polling
            if (pollCount < MAX_POLLS) setTimeout(_pollResult, 5000);
            else _reportDone(null, true);
          } else if (r && r.status === "error") {
            _reportDone(r, false);
          } else {
            // No result yet — keep polling
            if (pollCount < MAX_POLLS) setTimeout(_pollResult, 5000);
            else _reportDone(null, true);
          }
        };
        script.onerror = function () {
          clearTimeout(timer);
          try { delete window[cbPoll]; script.remove(); } catch (e) { }
          if (pollCount < MAX_POLLS) setTimeout(_pollResult, 5000);
          else _reportDone(null, true);
        };
        script.src = API_URL + "?action=getMonthlyReportStatus&jobKey=" + encodeURIComponent(jobKey) +
          "&sessionToken=" + encodeURIComponent(_mrSess.sessionToken || "") +
          "&userId=" + encodeURIComponent(_mrSess.userId || "") +
          "&callback=" + cbPoll;
        document.body.appendChild(script);
      }

      // FIX: bust quota cache and refresh sidebar + email auto page counters on success
      function _reportDone(r, timedOut) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Now';
        }
        if (!res) return;
        if (timedOut) {
          res.innerHTML = "⚠️ Still running in the background — check your Apps Script execution log. Emails may still be sent successfully.";
          res.style.color = "#92400e";
        } else if (r && r.status === "ok") {
          res.innerHTML = "✅ Done — sent to <strong>" + (r.sent || 0) + "</strong> members, skipped <strong>" + (r.skipped || 0) + "</strong>";
          res.style.color = "#065f46";
          // Bust quota cache and refresh sidebar + email auto page counters
          _refreshEmailQuotaUI();
        } else {
          res.innerHTML = "❌ Failed: " + (r && r.message ? r.message : "Unknown error. Check Apps Script logs.");
          res.style.color = "#991b1b";
        }
      }

      // Start polling after 8s (give the job time to start)
      setTimeout(_pollResult, 8000);
    }

    // Manual "Send Now" for Admin Monthly Summary — same fire-and-poll pattern,
    // reuses ea_test_month/ea_test_year selects from the Monthly Report block above.
    function triggerManualAdminSummary() {
      const month = document.getElementById("ea_test_month")?.value;
      const year = document.getElementById("ea_test_year")?.value;
      const withPdf = document.getElementById("ea_admin_summary_pdf")?.checked !== false;
      if (!month || !year) { toast("Select month and year", "warn"); return; }
      const res = document.getElementById("ea_admin_summary_result");
      const btn = document.querySelector("[onclick='triggerManualAdminSummary()']");

      if (btn) { btn.disabled = true; btn.textContent = "⏳ Sending..."; }
      if (res) {
        res.style.display = "block";
        res.innerHTML = "⏳ " + (withPdf ? "Building summary + PDF and emailing" : "Emailing") + " admins... this can take up to a minute. Please wait.";
        res.style.color = "#64748b";
      }

      // Same 30s-JSONP-cutoff workaround as the monthly report: fire-and-forget,
      // then poll getAdminSummaryStatus every 5s until the stored result appears.
      const jobKey = "admsum_" + Date.now();
      let pollCount = 0;
      const MAX_POLLS = 36; // 36 × 5s = 3 minutes max wait

      const _asSess = JSON.parse(localStorage.getItem("session") || "{}");

      // Step 1 — Fire the job.
      // [FIX] Previously this ignored the response entirely — if the backend rejected
      // the request (e.g. session expired, or the old 1-hour cooldown), the job was
      // never actually started/stored, but the UI still polled forever showing
      // "Sending...". Now we read the fire response: if it's an immediate error,
      // stop right here instead of polling a jobKey that will never exist.
      (function () {
        const cbFire = "cb_asf_" + Date.now();
        const script = document.createElement("script");
        window[cbFire] = function (r) {
          try { delete window[cbFire]; script.remove(); } catch (e) { }
          if (r && r.status === "error") {
            _summaryDone(r, false); // stop immediately, don't start polling
          }
          // status "ok" here just means the request was accepted/ran synchronously —
          // the real result still comes from polling below either way.
        };
        script.onerror = function () {
          try { delete window[cbFire]; script.remove(); } catch (e) { }
          _summaryDone({ status: "error", message: "Could not reach server to start the job. Check your connection / Apps Script deployment." }, false);
        };
        script.src = API_URL + "?action=triggerAdminSummary&month=" + encodeURIComponent(month) +
          "&year=" + encodeURIComponent(year) + "&jobKey=" + encodeURIComponent(jobKey) +
          "&withPdf=" + (withPdf ? "1" : "0") +
          "&sessionToken=" + encodeURIComponent(_asSess.sessionToken || "") +
          "&userId=" + encodeURIComponent(_asSess.userId || "") +
          "&callback=" + cbFire;
        document.body.appendChild(script);
      })();

      // Step 2 — Poll every 5s for result
      let _stopped = false;
      function _pollResult() {
        if (_stopped) return;
        pollCount++;
        const cbPoll = "cb_asp_" + Date.now();
        const script = document.createElement("script");
        const timer = setTimeout(function () {
          try { delete window[cbPoll]; script.remove(); } catch (e) { }
          if (_stopped) return;
          if (pollCount < MAX_POLLS) {
            setTimeout(_pollResult, 5000);
          } else {
            _summaryDone(null, true);
          }
        }, 8000);
        window[cbPoll] = function (r) {
          clearTimeout(timer);
          try { delete window[cbPoll]; script.remove(); } catch (e) { }
          if (_stopped) return;
          if (r && r.status === "ok") {
            _summaryDone(r, false);
          } else if (r && r.status === "pending") {
            if (pollCount < MAX_POLLS) setTimeout(_pollResult, 5000);
            else _summaryDone(null, true);
          } else if (r && r.status === "error") {
            _summaryDone(r, false);
          } else {
            if (pollCount < MAX_POLLS) setTimeout(_pollResult, 5000);
            else _summaryDone(null, true);
          }
        };
        script.onerror = function () {
          clearTimeout(timer);
          try { delete window[cbPoll]; script.remove(); } catch (e) { }
          if (_stopped) return;
          if (pollCount < MAX_POLLS) setTimeout(_pollResult, 5000);
          else _summaryDone(null, true);
        };
        script.src = API_URL + "?action=getAdminSummaryStatus&jobKey=" + encodeURIComponent(jobKey) +
          "&sessionToken=" + encodeURIComponent(_asSess.sessionToken || "") +
          "&userId=" + encodeURIComponent(_asSess.userId || "") +
          "&callback=" + cbPoll;
        document.body.appendChild(script);
      }

      function _summaryDone(r, timedOut) {
        _stopped = true;
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Now';
        }
        if (!res) return;
        if (timedOut) {
          res.innerHTML = "⚠️ Still running in the background — check your Apps Script execution log. The email may still send successfully.";
          res.style.color = "#92400e";
        } else if (r && r.status === "ok") {
          res.innerHTML = "✅ Done — sent to <strong>" + (r.sent || 0) + "</strong> admin(s). Paid: <strong>" +
            (r.paidCount || 0) + "</strong>, Not paid: <strong>" + (r.unpaidCount || 0) +
            "</strong>, Total collected: <strong>" + (r.totalCollected || 0) + "</strong>";
          res.style.color = "#065f46";
          _refreshEmailQuotaUI();
        } else {
          res.innerHTML = "❌ Failed: " + (r && r.message ? r.message : "Unknown error. Check Apps Script logs.");
          res.style.color = "#991b1b";
        }
      }

      setTimeout(_pollResult, 8000);
    }
