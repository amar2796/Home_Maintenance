    var _tcRefreshTimer = null;

    // ── Inject reset confirmation modal (matches _fbModalOverlay style) ──
    (function injectTcResetModal() {
      if (document.getElementById("_tcResetOverlay")) return;
      var style = document.createElement("style");
      style.textContent =
        "#_tcResetOverlay{position:fixed;inset:0;z-index:999995;background:rgba(15,23,42,0.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.22s ease;}" +
        "#_tcResetOverlay.show{opacity:1;pointer-events:all;}" +
        "#_tcResetBox{background:#fff;border-radius:20px;padding:32px 28px 24px;max-width:360px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,0.22),0 0 0 1px rgba(0,0,0,0.04);transform:scale(0.88) translateY(16px);transition:transform 0.26s cubic-bezier(0.34,1.56,0.64,1),opacity 0.22s ease;opacity:0;text-align:center;}" +
        "#_tcResetOverlay.show #_tcResetBox{transform:scale(1) translateY(0);opacity:1;}" +
        "#_tcResetIconWrap{width:66px;height:66px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;font-size:1.7rem;color:#dc2626;margin:0 auto 16px;}" +
        "#_tcResetTitle{font-size:1.1rem;font-weight:700;color:#0f172a;margin:0 0 8px;font-family:Poppins,sans-serif;}" +
        "#_tcResetMsg{font-size:0.85rem;color:#64748b;line-height:1.65;margin:0 0 16px;font-family:Poppins,sans-serif;}" +
        "#_tcResetWarn{background:#fef9ec;border:1px solid #5EEAD4;border-radius:10px;padding:10px 14px;margin:0 0 22px;font-size:11.5px;color:#92400e;font-family:Poppins,sans-serif;text-align:left;line-height:1.6;}" +
        "._tcResetBtns{display:flex;gap:10px;justify-content:center;}" +
        "._tcResetBtns button{flex:1;max-width:148px;padding:11px 0;border-radius:10px;border:none;font-size:0.88rem;font-weight:700;cursor:pointer;font-family:Poppins,sans-serif;transition:transform 0.15s,box-shadow 0.15s;display:inline-flex;align-items:center;justify-content:center;gap:6px;}" +
        "._tcResetBtns button:hover{transform:translateY(-2px);}" +
        "#_tcResetCancel{background:#f1f5f9;color:#475569;}" +
        "#_tcResetCancel:hover{background:#e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.08);}" +
        "#_tcResetConfirm{background:linear-gradient(135deg,#f87171,#dc2626);color:#fff;box-shadow:0 4px 14px rgba(220,38,38,0.3);}" +
        "#_tcResetConfirm:hover{box-shadow:0 8px 20px rgba(220,38,38,0.45);}";
      document.head.appendChild(style);
      var ov = document.createElement("div");
      ov.id = "_tcResetOverlay";
      ov.innerHTML =
        '<div id="_tcResetBox">' +
          '<div id="_tcResetIconWrap"><i class="fa-solid fa-rotate-left"></i></div>' +
          '<div id="_tcResetTitle">Reset Traffic Stats?</div>' +
          '<div id="_tcResetMsg">This will permanently clear all counters, bar charts, and action breakdown data.</div>' +
          '<div id="_tcResetWarn">⚠️ <strong>Cannot be undone.</strong> Peak records, daily totals, and hourly history will all be erased. Only do this to start fresh.</div>' +
          '<div class="_tcResetBtns">' +
            '<button id="_tcResetCancel" onclick="_tcResetClose()"><i class="fa-solid fa-xmark"></i> Cancel</button>' +
            '<button id="_tcResetConfirm" onclick="_tcDoReset()"><i class="fa-solid fa-trash"></i> Yes, Reset</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      ov.addEventListener("click", function(e) { if (e.target === ov) _tcResetClose(); });
      document.addEventListener("keydown", function(e) { if (e.key === "Escape") _tcResetClose(); });
    })();

    window._tcResetClose = function() {
      var ov = document.getElementById("_tcResetOverlay");
      if (ov) ov.classList.remove("show");
    };

    window._tcDoReset = function() {
      _tcResetClose();
      getData("resetTrafficStats").then(function(res) {
        if (res && res.status === "ok") {
          toast("✅ " + (res.message || "Traffic stats reset."));
          loadTrafficStats();
        } else {
          toast("❌ Reset failed: " + (res && res.message || "Unknown error"), "error");
        }
      }).catch(function() {
        toast("❌ Reset failed. Check console.", "error");
      });
    };

    function loadTrafficStats() {
      var loading = document.getElementById("tc_loading");
      var content = document.getElementById("tc_content");
      if (loading) loading.style.display = "block";
      if (content) content.style.display = "none";

      // Always live — no cache, same pattern as runHealthCheck
      getData("getTrafficStats").then(function(d) {
        if (loading) loading.style.display = "none";
        if (!d || d.status !== "ok") {
          if (loading) loading.innerHTML = "<span style='color:#dc2626;'>Failed to load traffic data.</span>";
          return;
        }
        if (content) content.style.display = "block";

        // ── Quota bars (doGet + Email) ──
        var limitWrap = document.getElementById("tc_limit_wrap");
        if (limitWrap) limitWrap.style.display = "block";

        // doGet bar
        var doGetPct   = Math.min(100, d.usedPct || 0);
        var doGetColor = doGetPct >= 90 ? "#dc2626" : doGetPct >= 70 ? "#0F766E" : "#22c55e";
        var doGetRemaining = (d.dailyLimit || 20000) - (d.today || 0);
        var doGetBar = document.getElementById("tc_limit_bar");
        var doGetLbl = document.getElementById("tc_limit_label");
        var doGetSts = document.getElementById("tc_limit_status");
        if (doGetBar) { doGetBar.style.width = doGetPct + "%"; doGetBar.style.background = doGetColor; }
        if (doGetLbl) doGetLbl.textContent = (d.today || 0).toLocaleString(APP.locale||"en-IN") + " / " + (d.dailyLimit || 20000).toLocaleString(APP.locale||"en-IN");
        if (doGetSts) {
          var doGetMsg = doGetPct >= 90 ? "⚠️ Critical — " + doGetRemaining.toLocaleString(APP.locale||"en-IN") + " requests left today"
                       : doGetPct >= 70 ? "🟡 Moderate — " + doGetRemaining.toLocaleString(APP.locale||"en-IN") + " requests left today"
                       : "🟢 Healthy — " + doGetRemaining.toLocaleString(APP.locale||"en-IN") + " requests left today";
          doGetSts.textContent = doGetMsg;
          doGetSts.style.color = doGetPct >= 90 ? "#dc2626" : doGetPct >= 70 ? "#b45309" : "#15803d";
        }

        // Email bar
        var emailPct   = Math.min(100, d.emailPct || 0);
        var emailColor = emailPct >= 90 ? "#dc2626" : emailPct >= 70 ? "#0F766E" : "#22c55e";
        var emailRemaining = (d.emailLimit || 90) - (d.emailUsed || 0);
        var emailBar = document.getElementById("tc_email_bar");
        var emailLbl = document.getElementById("tc_email_label");
        var emailSts = document.getElementById("tc_email_status");
        if (emailBar) { emailBar.style.width = emailPct + "%"; emailBar.style.background = emailColor; }
        if (emailLbl) emailLbl.textContent = (d.emailUsed || 0) + " / " + (d.emailLimit || 90) + " emails";
        if (emailSts) {
          var emailMsg = emailPct >= 90 ? "⚠️ Critical — " + emailRemaining + " emails left today (bulk trigger may fail!)"
                       : emailPct >= 70 ? "🟡 Moderate — " + emailRemaining + " emails left today"
                       : "🟢 Healthy — " + emailRemaining + " emails remaining today";
          emailSts.textContent = emailMsg;
          emailSts.style.color = emailPct >= 90 ? "#dc2626" : emailPct >= 70 ? "#b45309" : "#15803d";
        }

        // ── Summary pills ──
        var pills = [
          { label: "Total Ever",  val: d.total,    color: "#334155", icon: "fa-infinity" },
          { label: "Today",       val: d.today,    color: "#0F766E", icon: "fa-calendar-day" },
          { label: "This Hour",   val: d.thisHour, color: "#16a34a", icon: "fa-clock" },
          { label: "Peak Hour",   val: d.peakHour, color: "#0F766E", icon: "fa-bolt" },
          { label: "Peak Day",    val: d.peakDay,  color: "#7c3aed", icon: "fa-crown" },
        ];
        var summaryEl = document.getElementById("tc_summary");
        if (summaryEl) {
          summaryEl.innerHTML = pills.map(function(p) {
            return '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;text-align:center;min-width:90px;flex:1;">' +
              '<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;"><i class="fa-solid ' + p.icon + '"></i></div>' +
              '<div style="font-size:1.35rem;font-weight:700;color:' + p.color + ';">' + (p.val || 0).toLocaleString(APP.locale||"en-IN") + '</div>' +
              '<div style="font-size:10px;color:#94a3b8;margin-top:3px;">' + p.label + '</div>' +
            '</div>';
          }).join("");
        }

        // ── Bar chart helper ──
        function renderBars(containerId, data, labelKey, countKey, barColor) {
          var el = document.getElementById(containerId);
          if (!el) return;
          var max = Math.max(1, Math.max.apply(null, data.map(function(x){ return x[countKey]; })));
          el.innerHTML = data.map(function(item) {
            var h   = Math.max(4, Math.round((item[countKey] / max) * 64));
            var has = item[countKey] > 0;
            return '<div title="' + item[labelKey] + ": " + item[countKey] + " requests" + '" ' +
              'style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:default;">' +
              '<div style="font-size:8px;color:#94a3b8;line-height:1;">' + (has ? item[countKey] : "") + '</div>' +
              '<div style="width:100%;height:' + h + 'px;background:' + (has ? barColor : "#e2e8f0") + ';border-radius:3px 3px 0 0;transition:height .3s;"></div>' +
              '<div style="font-size:7px;color:#94a3b8;white-space:nowrap;overflow:hidden;max-width:30px;text-overflow:ellipsis;text-align:center;">' + item[labelKey] + '</div>' +
            '</div>';
          }).join("");
        }

        renderBars("tc_hour_chart", d.last24Hours, "hour", "count", "#0F766E");
        renderBars("tc_day_chart",  d.last14Days,  "date", "count", "#0F766E");

        // ── Top actions table ──
        var actEl = document.getElementById("tc_actions");
        if (actEl) {
          if (!d.topActions || d.topActions.length === 0) {
            actEl.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:8px 0;text-align:center;">No actions tracked yet — data appears after first request.</div>';
          } else {
            actEl.innerHTML =
              '<table style="width:100%;border-collapse:collapse;">' +
              d.topActions.map(function(a, i) {
                var pct = Math.round(a.count / Math.max(1, d.total) * 100);
                var medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
                return '<tr style="border-bottom:1px solid #f1f5f9;">' +
                  '<td style="padding:6px 4px 6px 0;color:#94a3b8;font-size:11px;width:20px;">' + (medal || (i+1)) + '</td>' +
                  '<td style="padding:6px 0;color:#334155;font-size:12px;font-weight:600;">' + a.action + '</td>' +
                  '<td style="padding:6px 0;text-align:right;font-size:12px;font-weight:700;color:#334155;white-space:nowrap;padding-right:10px;">' + a.count.toLocaleString(APP.locale||"en-IN") + '</td>' +
                  '<td style="padding:6px 0;width:90px;">' +
                    '<div style="height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;">' +
                      '<div style="height:6px;width:' + pct + '%;background:linear-gradient(90deg,#0F766E,#f59e0b);border-radius:3px;transition:width .4s;"></div>' +
                    '</div>' +
                    '<div style="font-size:9px;color:#94a3b8;margin-top:1px;">' + pct + '%</div>' +
                  '</td>' +
                '</tr>';
              }).join("") +
              '</table>';
          }
        }

        var genEl = document.getElementById("tc_generated");
        if (genEl) genEl.textContent = "Generated: " + (d.generatedAt || "");

      }).catch(function() {
        var loading2 = document.getElementById("tc_loading");
        if (loading2) loading2.innerHTML = "<span style='color:#dc2626;'><i class='fa-solid fa-triangle-exclamation'></i> Error loading traffic data.</span>";
      });
    }

    function tcToggleAutoRefresh() {
      var cb  = document.getElementById("tc_autorefresh");
      var sel = document.getElementById("tc_interval");
      if (!cb) return;
      if (_tcRefreshTimer) { clearInterval(_tcRefreshTimer); _tcRefreshTimer = null; }
      if (cb.checked) {
        if (sel) sel.style.display = "inline-block";
        var ms = sel ? parseInt(sel.value, 10) : 60000;
        _tcRefreshTimer = setInterval(function() { loadTrafficStats(); }, ms);
      } else {
        if (sel) sel.style.display = "none";
      }
    }

    function confirmResetTraffic() {
      var ov = document.getElementById("_tcResetOverlay");
      if (ov) ov.classList.add("show");
    }
    // ══════════════════════════════════════════════════════════

    // ── H14: Silent health check on login — no spinner, just badge + one toast ──
    function _hcSilentLoginCheck() {
      if (typeof getData !== "function") return;
      getData("getHealthCheck").then(function(res) {
        if (!res || res.status !== "ok") return; // fail silently
        var checks        = res.checks || {};
        var colKeys       = Object.keys(checks).filter(function(k) { return k.startsWith("sheet_col_"); });
        var issues        = [], warnings = [];
        var missingSheets = Object.keys(checks).filter(function(k) {
          return k.startsWith("sheet_") && !k.startsWith("sheet_rows_") && !k.startsWith("sheet_col") && !checks[k];
        }).length;
        var colMismatch   = colKeys.filter(function(k) { return checks[k] !== true && checks[k] !== "ok"; }).length;
        if (missingSheets > 0) issues.push(missingSheets + " sheet" + (missingSheets > 1 ? "s" : "") + " missing");
        if (colMismatch   > 0) issues.push(colMismatch   + " column mismatch" + (colMismatch > 1 ? "es" : ""));
        if (checks.email_limit && checks.email_used !== undefined) {
          var ep = Math.round((checks.email_used / checks.email_limit) * 100);
          if (ep >= 90) issues.push("email quota critical");
          else if (ep >= 70) warnings.push("email quota " + ep + "% used");
        }
        if (!checks.last_backup || checks.last_backup === "Never") warnings.push("no backup on record");
        _hcSetBadge(issues, warnings);
        // One brief toast so admin knows status without visiting the page
        if (typeof toast === "function") {
          var msg = issues.length > 0
            ? "⚠️ System Health: " + issues[0] + (issues.length > 1 ? " (+" + (issues.length - 1) + " more)" : "")
            : warnings.length > 0
            ? "🟡 System Health: " + warnings[0]
            : "🟢 System Health: All systems healthy";
          toast(msg, issues.length > 0 ? "error" : warnings.length > 0 ? "warning" : "success");
        }
      }).catch(function() { /* silent — do not interrupt admin if network unavailable */ });
    }

    // ── H7: Populate Contribution Records filter dropdowns (year, type, occasion)
    // Called from showPage() when contributionPage is opened — dash_ arrays are already populated by then
    function _cr_buildFilterDropdowns() {
      // Year
      var yrSel = document.getElementById("cr_filterYear");
      if (yrSel) {
        var years = new Set();
        (window.dash_contributions || data || []).forEach(function(c) {
          var y = Number(c.Year); if (y > 2000) years.add(y);
        });
        var _cur = new Date().getFullYear();
        for (var _y = _getProjectStartYear(); _y <= _cur + 1; _y++) years.add(_y);
        var sorted = Array.from(years).sort(function(a,b){ return b - a; });
        yrSel.innerHTML = '<option value="">All Years</option>' +
          sorted.map(function(y){ return '<option value="' + y + '">' + y + '</option>'; }).join("");
      }

      // Contribution Type
      var typeSel = document.getElementById("filterContribType");
      if (typeSel) {
        var curTypeVal = typeSel.value;
        var allT = window.dash_types && window.dash_types.length ? window.dash_types : (window.types || []);
        typeSel.innerHTML = '<option value="">All Types</option>' +
          allT.map(function(t){ return '<option value="' + t.TypeId + '">' + escapeHtml(t.TypeName) + '</option>'; }).join("");
        if (curTypeVal) typeSel.value = curTypeVal;
      }

      // Occasion
      var occSel = document.getElementById("cr_filterOccasion");
      if (occSel) {
        var curOccVal = occSel.value;
        var allO = window.dash_occasions && window.dash_occasions.length ? window.dash_occasions : (window.occasions || []);
        occSel.innerHTML = '<option value="">All Occasions</option>' +
          allO.map(function(o){ return '<option value="' + o.OccasionId + '">' + escapeHtml(o.OccasionName) + '</option>'; }).join("");
        if (curOccVal) occSel.value = curOccVal;
      }
    }

    function _applyExtraContribFilters() { /* no-op — logic now inside filterContributions() */ }

    function clearContribFilters() {
      ["cr_filterYear","cr_filterMonth","cr_filterName","cr_filterTrackID","filterContribType","cr_filterOccasion","cr_filterMemberType"]
        .forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ""; });
      if (typeof filterContributions === "function") filterContributions();
    }


    // ── M5: Chatbot Q&A — limit 20 pairs + character counters
    function _initChatbotQALimits() {
      // Max 20 custom Q&A pairs (only 2 pairs exist in current UI — backend already enforces via allowedKeys)
      // Add live char counters to question/answer fields
      const limits = {
        'cbot_custom_q1_en': 200, 'cbot_custom_q1_hi': 200,
        'cbot_custom_a1_en': 500, 'cbot_custom_a1_hi': 500,
        'cbot_custom_q2_en': 200, 'cbot_custom_q2_hi': 200,
        'cbot_custom_a2_en': 500, 'cbot_custom_a2_hi': 500,
      };
      Object.keys(limits).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.maxLength = limits[id];
        const counter = document.createElement("div");
        counter.style.cssText = "font-size:10px;color:#94a3b8;text-align:right;margin-top:2px;";
        counter.textContent = "0 / " + limits[id];
        el.parentNode.insertBefore(counter, el.nextSibling);
        el.addEventListener("input", () => {
          const len = el.value.length;
          counter.textContent = len + " / " + limits[id];
          counter.style.color = len > limits[id] * 0.9 ? "#e74c3c" : "#94a3b8";
        });
      });
    }
    document.addEventListener("DOMContentLoaded", _initChatbotQALimits);

    // ── M11: Reply to feedback member
    function replyToFeedback(rowIndex, memberName, memberMobile) {
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      const html = `
          <div class="_mhdr"><h3><i class="fa-solid fa-reply"></i> Reply to ${escapeHtml(memberName || "Member")}</h3><button class="_mcls" onclick="closeModal()">×</button></div>
          <div class="_mbdy">
            <p style="font-size:12px;color:#64748b;margin-bottom:12px;">This will send a WhatsApp message to <strong>${escapeHtml(memberName)}</strong> (${escapeHtml(memberMobile || "")}).</p>
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">Your Reply</label>
            <textarea id="fbReplyMsg" placeholder="Type your response..." style="width:100%;min-height:100px;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none;box-sizing:border-box;"></textarea>
          </div>
          <div class="_mft">
            <button class="_mbtn" style="background:#999;" onclick="closeModal()">Cancel</button>
            <button class="_mbtn" style="background:#25d366;" onclick="_sendFeedbackReply('${rowIndex}','${encodeURIComponent(memberMobile || "")}')">
              <i class="fa-brands fa-whatsapp"></i> Send via WhatsApp
            </button>
          </div>`;
      openModal(html, "460px");
    }

    function _sendFeedbackReply(rowIndex, encodedMobile) {
      const msg = (document.getElementById("fbReplyMsg") || {}).value || "";
      if (!msg.trim()) { toast("Please type a reply message.", "warn"); return; }
      const mobile = decodeURIComponent(encodedMobile).replace(/\D/g, "");
      if (!mobile || mobile.length < 10) { toast("No valid mobile number for this member.", "warn"); return; }
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      const waText = encodeURIComponent(APP.name + " — Admin Reply:\n\n" + msg + "\n\n— " + (s.name || "Household Admin"));
      window.open("https://wa.me/91" + mobile + "?text=" + waText, "_blank");
      // Mark as replied
      postData({
        action: "updateFeedbackStatus", RowIndex: rowIndex, Status: "Replied",
        sessionToken: s.sessionToken || "", userId: s.userId || ""
      })
        .then(() => { closeModal(); toast("Marked as Replied."); if (typeof loadFeedback === "function") loadFeedback(); })
        .catch(() => closeModal());
    }

    // ── L5: Gallery tag filter
    function filterGalleryByTag(tag) {
      const q = (tag || "").toLowerCase().trim();
      const items = document.querySelectorAll(".glry-card, .gallery-item, [data-caption]");
      items.forEach(item => {
        if (!q) { item.style.display = ""; return; }
        const caption = (item.dataset.caption || "").toLowerCase();
        const tags = (item.dataset.tags || "").toLowerCase();
        item.style.display = (caption.includes(q) || tags.includes(q)) ? "" : "none";
      });
    }

    // ── M10: Drag reorder for Types, Occasions, Expense Types
    let _dragReorderSrc = null;
    let _dragReorderListId = null;
    function _initTypeReorder(listId) {
      const list = document.getElementById(listId);
      if (!list) return;
      list.querySelectorAll("[data-sortable]").forEach(item => {
        item.setAttribute("draggable", "true");
        item.addEventListener("dragstart", e => {
          _dragReorderSrc = item;
          _dragReorderListId = listId;
          item.style.opacity = "0.5";
        });
        item.addEventListener("dragend", e => {
          item.style.opacity = "";
          _saveDragOrder(listId);
        });
        item.addEventListener("dragover", e => {
          e.preventDefault();
          const after = _getDragAfterElement(list, e.clientY);
          if (after) list.insertBefore(_dragReorderSrc, after);
          else list.appendChild(_dragReorderSrc);
        });
      });
    }
    function _saveDragOrder(listId) {
      const list = document.getElementById(listId);
      if (!list) return;
      const sheetMap = { typeList: "types", occasionList: "occasions", expenseList: "expenseTypes" };
      const sheet = sheetMap[listId];
      if (!sheet) return;
      const items = list.querySelectorAll("[data-sortable]");
      const orderArr = [];
      items.forEach(function (item, i) {
        const id = item.dataset.id || item.getAttribute("data-id");
        if (id) orderArr.push({ id: id, sort: i + 1 });
      });
      if (!orderArr.length) return;
      const savedEl = document.getElementById({ typeList: "md_typesSaved", occasionList: "md_occasionsSaved", expenseList: "md_expSaved" }[listId]);
      if (savedEl) { savedEl.textContent = "⏳ Saving…"; savedEl.style.opacity = "1"; savedEl.style.color = "#0F766E"; }
      postData({ action: "updateSortOrder", sheet: sheet, order: JSON.stringify(orderArr) })
        .then(function (res) {
          if (res && res.status === "success") {
            if (savedEl) { savedEl.textContent = "✓ Saved"; savedEl.style.color = "#27ae60"; setTimeout(function () { savedEl.style.opacity = "0"; }, 2200); }
            mandirCacheBust("getAllData");
          } else {
            if (savedEl) savedEl.style.opacity = "0";
            toast("⚠️ Drag order not saved — try again.", "warn");
          }
        })
        .catch(function () {
          if (savedEl) savedEl.style.opacity = "0";
          toast("⚠️ Could not save drag order. Check connection.", "warn");
        });
    }
    function _getDragAfterElement(container, y) {
      const els = [...container.querySelectorAll("[data-sortable]:not(.dragging)")];
      return els.reduce((closest, el) => {
        const box = el.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        return (offset < 0 && offset > closest.offset) ? { offset, el } : closest;
      }, { offset: Number.NEGATIVE_INFINITY }).el;
    }

    // ── L8: Scheduled broadcast (queue for next available quota slot)
    // ════════════════════════════════════════════════════════════════
    //  INLINE DASHBOARD — all logic below replaces dashboard.html
    //  Uses admin globals: data, expenses, users, types, expenseTypes,
    //  occasions, yearConfig, selectedYear (from app.js)
    //  Private copies prefixed dash_ to avoid any variable collision.
    // ════════════════════════════════════════════════════════════════

    // Dashboard-local data copies (populated from admin globals on init/refresh)