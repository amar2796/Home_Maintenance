    var _hmMemberFilter = "all";

    /* ══════════════════════════════════════════════════
       VIEWING PERIOD BAR — fully interactive
    ══════════════════════════════════════════════════ */
    var _hmSelMonth = MONTHS[new Date().getMonth()];
    var _hmSelYear  = new Date().getFullYear();

    function _hmInitSelectors() {
      var mSel = document.getElementById("hm_sel_month");
      var ySel = document.getElementById("hm_sel_year");
      if (!mSel || !ySel) return;

      // Build hidden month options only once
      if (!mSel.options.length) {
        MONTHS.forEach(function(m) {
          var o = document.createElement("option"); o.value = m; o.textContent = m; mSel.appendChild(o);
        });
      }

      // Build year options from data + span project start to current year
      var years = new Set();
      data.forEach(function(c) { var y = Number(c.Year); if (!isNaN(y) && y > 2000) years.add(y); });
      expenses.forEach(function(e) { var y = Number(e.Year); if (!isNaN(y) && y > 2000) years.add(y); });
      var cur = new Date().getFullYear();
      for (var y = _getProjectStartYear(); y <= cur; y++) years.add(y);
      var sortedYears = Array.from(years).sort(function(a,b){ return b-a; });

      // Populate visible year dropdown
      var ydrop = document.getElementById("hm_year_dropdown");
      if (ydrop) {
        ydrop.innerHTML = sortedYears.map(function(y) {
          return '<div onclick="_hmSelectYear(' + y + ')" style="padding:8px 16px;font-size:13px;font-weight:600;color:#e2e8f0;cursor:pointer;transition:background 0.15s;white-space:nowrap;" onmouseover="this.style.background=\'rgba(15, 118, 110,0.15)\'" onmouseout="this.style.background=\'\'">' + y + '</div>';
        }).join("");
      }

      // Populate hidden select
      ySel.innerHTML = sortedYears.map(function(y) {
        return '<option value="' + y + '">' + y + '</option>';
      }).join("");
      ySel.value = String(_hmSelYear);
      mSel.value = _hmSelMonth;
    }

    function _hmSelectMonth(monthName) {
      _hmSelMonth = monthName;
      var mSel = document.getElementById("hm_sel_month");
      if (mSel) mSel.value = monthName;
      _hmRefreshBar();
      _hmRenderDashboard(_hmSelMonth, _hmSelYear);
    }

    function _hmSelectYear(y) {
      _hmSelYear = y;
      var ySel = document.getElementById("hm_sel_year");
      if (ySel) ySel.value = String(y);
      _hmToggleYearDropdown(false);
      _hmRefreshBar();
      _hmRenderDashboard(_hmSelMonth, _hmSelYear);
    }

    function _hmToggleYearDropdown(forceClose) {
      var drop = document.getElementById("hm_year_dropdown");
      var caret = document.getElementById("hm_year_caret");
      if (!drop) return;
      var open = forceClose === false ? false : (drop.style.display === "none" || drop.style.display === "");
      drop.style.display = open ? "block" : "none";
      if (caret) caret.style.transform = open ? "rotate(180deg)" : "";
      if (open) {
        // Highlight active year
        Array.from(drop.children).forEach(function(el) {
          el.style.color = el.textContent.trim() === String(_hmSelYear) ? "#0F766E" : "#e2e8f0";
          el.style.fontWeight = el.textContent.trim() === String(_hmSelYear) ? "700" : "600";
        });
        setTimeout(function() {
          document.addEventListener("click", function _closeYearDrop(e) {
            var d = document.getElementById("hm_year_dropdown");
            if (d && !d.contains(e.target) && !e.target.closest("#hm_year_dropdown")) {
              _hmToggleYearDropdown(false);
            }
            document.removeEventListener("click", _closeYearDrop);
          });
        }, 10);
      }
    }

    /* ── Refresh bar label + pills + year display (no data reload) ── */
    function _hmRefreshBar() {
      var now = new Date();
      var isCurrent = _hmSelMonth === MONTHS[now.getMonth()] && _hmSelYear === now.getFullYear();

      var lblText = document.getElementById("hm_period_label_text");
      var lbl = document.getElementById("hm_period_label");
      if (lblText) lblText.textContent = (isCurrent ? "Current — " : "") + _hmSelMonth + " " + _hmSelYear;
      if (lbl) {
        lbl.style.background = isCurrent
          ? "linear-gradient(90deg,#0F766E,#f59e0b)"
          : "linear-gradient(90deg,#14B8A6,#0F766E)";
      }

      var yrDisp = document.getElementById("hm_year_display");
      if (yrDisp) yrDisp.textContent = _hmSelYear;

      _hmRenderMonthPills(_hmSelMonth);
    }

    function _hmOnPeriodChange() {
      // Called on init — reset to current month/year
      var now = new Date();
      _hmSelMonth = MONTHS[now.getMonth()];
      _hmSelYear  = now.getFullYear();
      var mSel = document.getElementById("hm_sel_month");
      var ySel = document.getElementById("hm_sel_year");
      if (mSel) mSel.value = _hmSelMonth;
      if (ySel) ySel.value = String(_hmSelYear);
      _hmRefreshBar();
      _hmRenderDashboard(_hmSelMonth, _hmSelYear);
    }

    /* ── Render clickable month pills ── */
    var _hmShortMonths = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    function _hmRenderMonthPills(activeMonth) {
      var container = document.getElementById("hm_month_pills");
      if (!container) return;
      container.innerHTML = _hmShortMonths.map(function(m, i) {
        var fullName = MONTHS[i];
        var isActive = fullName === activeMonth;
        return '<div onclick="_hmSelectMonth(\'' + fullName + '\')" style="' +
          'padding:6px 15px;border-radius:20px;font-size:12px;font-weight:' + (isActive ? '700' : '500') + ';' +
          'background:' + (isActive ? 'linear-gradient(135deg,#0F766E,#f59e0b)' : 'rgba(255,255,255,0.06)') + ';' +
          'color:' + (isActive ? '#fff' : '#94a3b8') + ';' +
          'border:1.5px solid ' + (isActive ? 'rgba(15, 118, 110,0.6)' : 'rgba(255,255,255,0.09)') + ';' +
          'cursor:pointer;user-select:none;transition:all 0.18s;white-space:nowrap;' +
          'box-shadow:' + (isActive ? '0 2px 12px rgba(15, 118, 110,0.35)' : 'none') + ';' +
          '" onmouseover="if(this.dataset.active!==\'1\'){this.style.background=\'rgba(255,255,255,0.12)\';this.style.color=\'#e2e8f0\';}" ' +
          'onmouseout="if(this.dataset.active!==\'1\'){this.style.background=\'rgba(255,255,255,0.06)\';this.style.color=\'#94a3b8\';}" ' +
          'data-active="' + (isActive ? '1' : '0') + '">' + m + '</div>';
      }).join("");
    }

    /* ── Live clock ── */
    (function _startLiveClock() {
      var _days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      var _mos  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      function _tick() {
        var el = document.getElementById("hm_live_clock");
        if (!el) return;
        var n = new Date();
        var d = _days[n.getDay()];
        var dt = n.getDate();
        var mo = _mos[n.getMonth()];
        var h = n.getHours(), mi = String(n.getMinutes()).padStart(2,"0");
        var ampm = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;
        el.textContent = d + " " + dt + " " + mo + " — " + h + ":" + mi + " " + ampm;
      }
      _tick();
      setInterval(_tick, 1000);
    })();

    function _hmGoToCurrentMonth() {
      var now = new Date();
      _hmSelMonth = MONTHS[now.getMonth()];
      _hmSelYear  = now.getFullYear();
      _hmRefreshBar();
      _hmRenderDashboard(_hmSelMonth, _hmSelYear);
    }

    function _hmRenderDashboard(overrideMonth, overrideYear) {
      var now        = new Date();
      var curYear    = overrideYear  ? Number(overrideYear)  : now.getFullYear();
      var curMonth   = overrideMonth ? overrideMonth : MONTHS[now.getMonth()];

      // Trend: previous month relative to selected period
      var curMonthIdx   = MONTHS.indexOf(curMonth);
      var lastMonthIdx  = curMonthIdx === 0 ? 11 : curMonthIdx - 1;
      var lastMonth     = MONTHS[lastMonthIdx];
      var lastMonthYear = curMonthIdx === 0 ? curYear - 1 : curYear;

      const isWalkIn   = function(c) { return String(c.UserId).startsWith("WALKIN_"); };

      // ── Month contribution split
      var monthContribs = data.filter(function(c) {
        return String(c.Year) === String(curYear) && c.ForMonth === curMonth;
      });
      var monthMembers  = monthContribs.filter(function(c) { return !isWalkIn(c); });
      var monthWalkIns  = monthContribs.filter(function(c) { return isWalkIn(c); });
      var monthMemberC  = monthMembers.reduce(function(s,c) { return s + Number(c.Amount||0); }, 0);
      var monthWalkInC  = monthWalkIns.reduce(function(s,c) { return s + Number(c.Amount||0); }, 0);
      var monthE        = expenses.filter(function(e) {
        return String(e.Year) === String(curYear) && e.ForMonth === curMonth;
      }).reduce(function(s,e) { return s + Number(e.Amount||0); }, 0);

      // Previous month for trends
      var lastMonthC = data.filter(function(c) {
        return String(c.Year) === String(lastMonthYear) && c.ForMonth === lastMonth && !isWalkIn(c);
      }).reduce(function(s,c) { return s + Number(c.Amount||0); }, 0);
      var lastMonthE = expenses.filter(function(e) {
        return String(e.Year) === String(lastMonthYear) && e.ForMonth === lastMonth;
      }).reduce(function(s,e) { return s + Number(e.Amount||0); }, 0);

      // Active non-admin members
      var activeMembers = users.filter(function(u) {
        return u.Role !== "Admin" && String(u.Status||"Active").toLowerCase() === "active";
      });

      // Who has paid this selected month (member only, no walk-ins)
      var paidUserIds  = new Set(monthMembers.map(function(c) { return String(c.UserId); }));
      var paidCount    = activeMembers.filter(function(u) { return paidUserIds.has(String(u.UserId)); }).length;
      var pendingCount = activeMembers.length - paidCount;

      // ── KPI Cards
      var el;
      el = document.getElementById("kpi_monthC");
      if (el) _countUp(el, "₹" + fmt(monthMemberC + monthWalkInC), "#27ae60");
      el = document.getElementById("kpi_monthC_trend");
      if (el) {
        if (lastMonthC === 0 && monthMemberC === 0) {
          el.innerHTML = '<span style="color:#94a3b8;">— No data</span>';
        } else if (lastMonthC === 0) {
          el.innerHTML = '<span style="color:#27ae60;">New this month</span>';
        } else {
          var diff = monthMemberC - lastMonthC;
          var pct  = Math.abs(Math.round((diff / lastMonthC) * 100));
          var col  = diff >= 0 ? "#27ae60" : "#e74c3c";
          var arrow = diff >= 0 ? "▲" : "▼";
          el.innerHTML = '<span style="color:' + col + ';">' + arrow + ' ' + pct + '% vs ' + lastMonth + '</span>';
        }
      }

      el = document.getElementById("kpi_walkinC");
      if (el) _countUp(el, "₹" + fmt(monthWalkInC), "#d97706");
      el = document.getElementById("kpi_walkinC_sub");
      if (el) el.textContent = monthWalkIns.length + " entr" + (monthWalkIns.length === 1 ? "y" : "ies");

      el = document.getElementById("kpi_monthE");
      if (el) _countUp(el, "₹" + fmt(monthE), "#e74c3c");
      el = document.getElementById("kpi_monthE_trend");
      if (el) {
        if (lastMonthE === 0 && monthE === 0) {
          el.innerHTML = '<span style="color:#94a3b8;">— No data</span>';
        } else if (lastMonthE === 0) {
          el.innerHTML = '<span style="color:#94a3b8;">New this month</span>';
        } else {
          var diffE = monthE - lastMonthE;
          var pctE  = Math.abs(Math.round((diffE / lastMonthE) * 100));
          var colE  = diffE <= 0 ? "#27ae60" : "#e74c3c";
          var arrowE = diffE >= 0 ? "▲" : "▼";
          el.innerHTML = '<span style="color:' + colE + ';">' + arrowE + ' ' + pctE + '% vs ' + lastMonth + '</span>';
        }
      }

      el = document.getElementById("kpi_pending");
      if (el) _countUp(el, String(pendingCount), pendingCount > 0 ? "#e74c3c" : "#27ae60");
      el = document.getElementById("kpi_total_members");
      if (el) el.textContent = activeMembers.length;
      el = document.getElementById("kpi_pending_sub");
      if (el) {
        var paidPct = activeMembers.length > 0 ? Math.round((paidCount / activeMembers.length) * 100) : 0;
        el.innerHTML = 'of ' + activeMembers.length + ' members &nbsp;·&nbsp; <b style="color:#27ae60;">' + paidPct + '% paid</b>';
      }
      // Estimated ₹ outstanding: there's no fixed per-member due amount in the
      // data model, so this is an estimate based on what paid members actually
      // gave this month (clearly labelled "est." so it isn't read as exact).
      el = document.getElementById("kpi_pending_amt");
      if (el) {
        if (pendingCount > 0 && paidCount > 0) {
          var avgPaidAmt = monthMemberC / paidCount;
          var estPending = Math.round(avgPaidAmt * pendingCount);
          el.innerHTML = '~₹' + fmt(estPending) + ' outstanding <span style="color:#94a3b8;font-weight:400;">(est.)</span>';
        } else {
          el.innerHTML = '&nbsp;';
        }
      }

      // ── Member badge (show selected period)
      el = document.getElementById("hm_member_badge");
      if (el) el.textContent = curMonth + " " + curYear;

      // ── Render member list (store selected period for tab re-renders)
      window._hmMemberData = { activeMembers: activeMembers, paidUserIds: paidUserIds, monthMembers: monthMembers, curMonth: curMonth, curYear: curYear };
      _hmRenderMemberList();

      // ── Member summary (now includes avg + top contributor for the period,
      // computed from monthMembers which is already available here)
      el = document.getElementById("hm_member_summary");
      if (el) {
        var summaryHtml = paidCount + ' paid · ' + pendingCount + ' pending';
        if (paidCount > 0) {
          var avgAmt = monthMemberC / paidCount;
          summaryHtml += ' · Avg ₹' + fmt(Math.round(avgAmt));
          var byMember = {};
          monthMembers.forEach(function(c) {
            var uid = String(c.UserId);
            byMember[uid] = (byMember[uid] || 0) + Number(c.Amount || 0);
          });
          var topUid = null, topAmt = 0;
          Object.keys(byMember).forEach(function(uid) {
            if (byMember[uid] > topAmt) { topAmt = byMember[uid]; topUid = uid; }
          });
          if (topUid) {
            var topUser = activeMembers.find(function(u) { return String(u.UserId) === topUid; });
            if (topUser) summaryHtml += ' · Top: ' + escapeHtml(topUser.Name) + ' ₹' + fmt(topAmt);
          }
        }
        el.innerHTML = summaryHtml;
        el.title = summaryHtml.replace(/<[^>]*>/g, "");
      }

      // ── Walk-in list
      _hmRenderWalkinList(monthWalkIns);

      // ── Walk-in summary
      el = document.getElementById("hm_walkin_summary");
      if (el) el.textContent = monthWalkIns.length + " entries · ₹" + fmt(monthWalkInC) + " total";

      // ── Bar chart
      _hmRenderBarChart(curYear, curMonth);

      // ── Smart alerts
      _hmRenderAlerts(pendingCount, monthE, activeMembers, curMonth, curYear);

      // ── Occasion breakdown (this month, includes walk-ins)
      _hmRenderOccasionBreakdown(monthContribs);

      // ── Backup status (independent of period — only needs to run once per
      // page load, not on every month/year change)
      if (!window._hmBackupChecked) {
        window._hmBackupChecked = true;
        _hmLoadBackupStatus();
      }

      // ── Year tracker
      _hmRenderYearTracker(curYear, curMonth);
    }

    function _hmRenderOccasionBreakdown(monthContribs) {
      var card = document.getElementById("hm_occasion_card");
      var el   = document.getElementById("hm_occasion_list");
      if (!card || !el) return;

      var byOcc = {};
      var total = 0;
      monthContribs.forEach(function(c) {
        var amt = Number(c.Amount || 0);
        var key = c.OccasionId ? String(c.OccasionId) : "_none";
        byOcc[key] = (byOcc[key] || 0) + amt;
        total += amt;
      });

      var keys = Object.keys(byOcc).filter(function(k) { return k !== "_none"; });
      // Hide the whole card when there's nothing occasion-tagged this month,
      // rather than showing an empty/confusing widget.
      if (keys.length === 0 || total === 0) {
        card.style.display = "none";
        return;
      }
      card.style.display = "block";

      var rows = keys.map(function(k) {
        var occ  = (occasions || []).find(function(o) { return String(o.OccasionId) === k; });
        var name = occ ? occ.OccasionName : "Other";
        var amt  = byOcc[k];
        var pct  = total > 0 ? Math.round((amt / total) * 100) : 0;
        return { name: name, amt: amt, pct: pct };
      }).sort(function(a, b) { return b.amt - a.amt; });

      // Untagged contributions, if any, shown as a neutral trailing chip
      if (byOcc["_none"] > 0) {
        rows.push({ name: "Not tagged", amt: byOcc["_none"], pct: Math.round((byOcc["_none"] / total) * 100), neutral: true });
      }

      el.innerHTML = rows.map(function(r) {
        var bg  = r.neutral ? "#f1f5f9" : "#f0fdfa";
        var bd  = r.neutral ? "#e2e8f0" : "#99f6e4";
        var col = r.neutral ? "#64748b" : "#0F766E";
        return '<div style="background:' + bg + ';border:1px solid ' + bd + ';border-radius:10px;padding:8px 12px;min-width:110px;">' +
          '<div style="font-size:11px;font-weight:600;color:' + col + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;">' + escapeHtml(r.name) + '</div>' +
          '<div style="font-size:13px;font-weight:700;color:#334155;margin-top:2px;">₹' + fmt(r.amt) + '</div>' +
          '<div style="font-size:10px;color:#94a3b8;">' + r.pct + '% of month</div>' +
        '</div>';
      }).join("");
    }

    function _hmLoadBackupStatus() {
      var el = document.getElementById("hm_backup_status");
      if (!el) return;
      getData("getHealthCheck").then(function(res) {
        if (!res || res.status !== "ok" || !res.checks) {
          el.innerHTML = '<span style="color:#94a3b8;">Backup status unavailable</span>';
          return;
        }
        var last = res.checks.last_backup;
        if (!last || last === "Never") {
          el.innerHTML = '<span style="color:#e74c3c;font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> No backup on record</span>';
          return;
        }
        var d = new Date(last);
        var daysAgo = isNaN(d) ? null : Math.floor((new Date() - d) / 86400000);
        var dateLabel = isNaN(d) ? String(last) : d.toLocaleDateString(APP.locale||"en-IN");
        var col = "#94a3b8";
        if (daysAgo !== null) {
          if (daysAgo > 35) col = "#e74c3c";
          else if (daysAgo > 14) col = "#d97706";
          else col = "#27ae60";
        }
        el.innerHTML = '<span style="color:' + col + ';font-weight:600;">Last backup: ' + dateLabel +
          (daysAgo !== null ? ' (' + daysAgo + 'd ago)' : '') + '</span>';
      }).catch(function() {
        el.innerHTML = '<span style="color:#94a3b8;">Backup status unavailable</span>';
      });
    }

    function _hmMemberTab(filter, btn) {
      _hmMemberFilter = filter;
      // Update tab button styles
      ["hm_tab_all", "hm_tab_paid", "hm_tab_pending"].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.style.background = "#f1f5f9"; el.style.color = "#334155"; }
      });
      if (btn) { btn.style.background = "#334155"; btn.style.color = "#fff"; }
      _hmRenderMemberList();
    }

    function _hmRenderMemberList() {
      var d = window._hmMemberData;
      if (!d) return;
      var el = document.getElementById("hm_member_list");
      if (!el) return;

      var list = d.activeMembers;
      if (_hmMemberFilter === "paid")    list = list.filter(function(u) { return d.paidUserIds.has(String(u.UserId)); });
      if (_hmMemberFilter === "pending") list = list.filter(function(u) { return !d.paidUserIds.has(String(u.UserId)); });

      if (list.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:12px;">' +
          (_hmMemberFilter === "paid" ? '🎉 No paid members yet' : '🎉 All members have paid!') + '</div>';
        return;
      }

      el.innerHTML = list.map(function(u) {
        var paid   = d.paidUserIds.has(String(u.UserId));
        var dotCol = paid ? "#22c55e" : "#e74c3c";
        var initials = (u.Name || "?").split(" ").map(function(w) { return w[0]; }).join("").substring(0,2).toUpperCase();
        var bgCol  = paid ? "rgba(34,197,94,0.1)" : "rgba(231,76,60,0.1)";
        var txtCol = paid ? "#15803d" : "#dc2626";

        // Find contributions for this member this month
        var myContribs = d.monthMembers.filter(function(c) { return String(c.UserId) === String(u.UserId); });
        var myAmt      = myContribs.reduce(function(s,c) { return s + Number(c.Amount||0); }, 0);

        var isInactive = String(u.Status||"").toLowerCase() === "inactive";
        var subLine = paid ? "Paid · ₹" + fmt(myAmt) : (isInactive ? "Inactive" : "Pending");

        var rightHtml = paid
          ? '<span style="font-size:11px;font-weight:700;color:#27ae60;white-space:nowrap;flex-shrink:0;">₹' + fmt(myAmt) + '</span>'
          : isInactive
            ? '<span style="font-size:10px;font-weight:700;color:#64748b;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:20px;padding:3px 10px;white-space:nowrap;flex-shrink:0;">Inactive</span>'
            : '<span style="font-size:10px;font-weight:700;color:#dc2626;background:rgba(231,76,60,0.1);border:1px solid rgba(231,76,60,0.35);border-radius:20px;padding:3px 10px;white-space:nowrap;flex-shrink:0;">Pending</span>';

        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9;">' +
          '<div style="width:8px;height:8px;border-radius:50%;background:' + dotCol + ';flex-shrink:0;"></div>' +
          _avatarHtml(u, 28) +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:12px;font-weight:600;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(u.Name||"—") + '</div>' +
            '<div style="font-size:10px;color:#94a3b8;">' + subLine + '</div>' +
          '</div>' +
          rightHtml +
        '</div>';
      }).join("");
      if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(el);
    }

    function _hmRenderWalkinList(walkIns) {
      var el = document.getElementById("hm_walkin_list");
      if (!el) return;
      if (!walkIns || walkIns.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;font-size:12px;">No walk-in entries this month</div>';
        return;
      }
      // Show most recent 8
      var recent = walkIns.slice().sort(function(a,b) {
        return _dash_parseDateSort(b.PaymentDate).localeCompare(_dash_parseDateSort(a.PaymentDate));
      }).slice(0, 8);

      el.innerHTML = recent.map(function(c) {
        var nameRaw = String(c.Note||"").match(/Walk-in:\s*([^|]+)/);
        var visitorName = nameRaw ? nameRaw[1].trim() : "Visitor";
        var typeName = (types.find(function(t) { return String(t.TypeId) === String(c.TypeId); }) || {}).TypeName || "Daan";
        var dateStr = c.PaymentDate
          ? (c.PaymentDate instanceof Date
              ? c.PaymentDate.toLocaleDateString(APP.locale||"en-IN")
              : String(c.PaymentDate).split(" ")[0])
          : "—";
        return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:#fffbeb;margin-bottom:5px;">' +
          '<div style="width:28px;height:28px;border-radius:50%;background:#5EEAD4;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#92400e;flex-shrink:0;">W</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:12px;font-weight:600;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(visitorName) + '</div>' +
            '<div style="font-size:10px;color:#94a3b8;">' + escapeHtml(typeName) + ' · ' + dateStr + '</div>' +
          '</div>' +
          '<span style="font-size:12px;font-weight:700;color:#d97706;white-space:nowrap;flex-shrink:0;">₹' + fmt(c.Amount) + '</span>' +
        '</div>';
      }).join("");
    }

    function _hmRenderBarChart(curYear, selMonth) {
      var el = document.getElementById("hm_bar_chart");
      if (!el) return;

      var mapC = {}, mapE = {};
      data.filter(function(c) { return String(c.Year) === String(curYear); }).forEach(function(c) {
        var m = c.ForMonth || "";
        if (m) mapC[m] = (mapC[m] || 0) + Number(c.Amount || 0);
      });
      expenses.filter(function(e) { return String(e.Year) === String(curYear); }).forEach(function(e) {
        var m = e.ForMonth || "";
        if (m) mapE[m] = (mapE[m] || 0) + Number(e.Amount || 0);
      });

      var active = MONTHS.filter(function(m) { return (mapC[m]||0) > 0 || (mapE[m]||0) > 0; });
      if (active.length === 0) {
        el.innerHTML = '<div style="color:#94a3b8;font-size:12px;padding:16px;text-align:center;">No data for ' + curYear + '</div>';
        return;
      }

      var maxC = Math.max.apply(null, active.map(function(m) { return mapC[m]||0; }).concat([1]));
      var maxE = Math.max.apply(null, active.map(function(m) { return mapE[m]||0; }).concat([1]));
      var selIdx = active.indexOf(selMonth);
      var prevM  = selIdx > 0 ? active[selIdx - 1] : null;
      var selC   = mapC[selMonth] || 0, selE = mapE[selMonth] || 0;
      var netSel = selC - selE;

      // Legend once
      var legId = "_hm_cmp_legend";
      if (!document.getElementById(legId)) {
        var leg = document.createElement("div");
        leg.id  = legId;
        leg.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";
        leg.innerHTML =
          '<span style="font-size:12px;font-weight:600;color:#334155;">Monthly comparison · ' + curYear + '</span>' +
          '<div style="display:flex;gap:10px;">' +
            '<span style="font-size:10px;display:flex;align-items:center;gap:4px;color:#64748b;"><span style="width:10px;height:10px;background:#22c55e;border-radius:2px;display:inline-block;"></span>Income</span>' +
            '<span style="font-size:10px;display:flex;align-items:center;gap:4px;color:#64748b;"><span style="width:10px;height:10px;background:#f97316;border-radius:2px;display:inline-block;"></span>Expense</span>' +
          '</div>';
        el.parentNode && el.parentNode.insertBefore(leg, el);
      } else {
        var t = document.querySelector("#_hm_cmp_legend span");
        if (t) t.textContent = "Monthly comparison · " + curYear;
      }

      var rows = active.map(function(m) {
        var cV = mapC[m]||0, eV = mapE[m]||0;
        var sel = m === selMonth;
        var cW  = Math.round((cV / maxC) * 100);
        var eW  = Math.round((eV / maxE) * 100);
        return '<div onclick="_hmSelectMonth(\'' + m + '\')" ' +
          'style="display:grid;grid-template-columns:32px 1fr 1fr;gap:6px;align-items:center;cursor:pointer;' +
          (sel ? 'background:rgba(15, 118, 110,0.07);border-radius:7px;padding:4px;' : 'padding:3px 4px;') + '">' +
          '<span style="font-size:10px;font-weight:' + (sel?'600':'400') + ';color:' + (sel?'#d97706':'#64748b') + ';">' + m.slice(0,3) + '</span>' +
          '<div style="display:flex;align-items:center;gap:5px;">' +
            '<div style="flex:1;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;">' +
              '<div style="height:100%;width:' + cW + '%;background:' + (sel?'#16a34a':'#22c55e') + ';border-radius:4px;transition:width .3s;"></div>' +
            '</div>' +
            '<span style="font-size:10px;font-weight:' + (sel?'600':'400') + ';color:' + (sel?'#15803d':'#16a34a') + ';white-space:nowrap;min-width:38px;text-align:right;">₹' + _fmtK(cV) + '</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:5px;">' +
            '<div style="flex:1;height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;">' +
              '<div style="height:100%;width:' + eW + '%;background:' + (sel?'#ea580c':'#f97316') + ';border-radius:4px;transition:width .3s;"></div>' +
            '</div>' +
            '<span style="font-size:10px;font-weight:' + (sel?'600':'400') + ';color:' + (sel?'#ea580c':'#f97316') + ';white-space:nowrap;min-width:38px;text-align:right;">₹' + _fmtK(eV) + '</span>' +
          '</div>' +
        '</div>';
      }).join('<div style="height:1px;background:#f1f5f9;margin:1px 4px;"></div>');

      function _chip(label, delta, invert) {
        var good  = invert ? delta <= 0 : delta >= 0;
        var bg    = delta === 0 ? "#f8fafc" : good ? "#f0fdf4" : "#fef2f2";
        var col   = delta === 0 ? "#94a3b8" : good ? "#16a34a" : "#dc2626";
        var arrow = delta === 0 ? "—" : delta > 0 ? "▲" : "▼";
        return '<div style="flex:1;background:' + bg + ';border-radius:8px;padding:7px 10px;text-align:center;min-width:0;">' +
          '<div style="font-size:10px;color:#64748b;margin-bottom:2px;">' + label + '</div>' +
          '<div style="font-size:12px;font-weight:600;color:' + col + ';white-space:nowrap;">' +
            arrow + ' ₹' + _fmtK(Math.abs(delta)) + (prevM ? ' vs ' + prevM.slice(0,3) : '') +
          '</div>' +
        '</div>';
      }

      var chips = prevM
        ? '<div style="display:flex;gap:6px;margin-top:10px;padding-top:8px;border-top:0.5px solid #f1f5f9;">' +
            _chip("Income", selC - (mapC[prevM]||0), false) +
            _chip("Expense", selE - (mapE[prevM]||0), true) +
            '<div style="flex:1;background:#F0FDFA;border-radius:8px;padding:7px 10px;text-align:center;min-width:0;">' +
              '<div style="font-size:10px;color:#64748b;margin-bottom:2px;">Net · ' + selMonth.slice(0,3) + '</div>' +
              '<div style="font-size:12px;font-weight:600;color:' + (netSel>=0?'#0F766E':'#dc2626') + ';white-space:nowrap;">' +
                (netSel<0?'−':'') + '₹' + _fmtK(Math.abs(netSel)) +
              '</div>' +
            '</div>' +
          '</div>'
        : '';

      el.style.display = "block";
      el.innerHTML = rows + chips;
    }

    function _fmtK(v) {
      v = Math.round(v);
      if (v >= 100000) return (v/100000).toFixed(1).replace(/\.0$/,"") + "L";
      if (v >= 1000)   return (v/1000).toFixed(1).replace(/\.0$/,"") + "k";
      return String(v);
    }

    function _hmRenderAlerts(pendingCount, monthE, activeMembers, curMonth, curYear) {
      var el = document.getElementById("hm_alerts_list");
      var badgeEl = document.getElementById("hm_alert_badge");
      if (!el) return;

      var alerts = [];

      // Alert 1: pending members
      if (pendingCount > 0) {
        alerts.push({
          type: "warn",
          text: pendingCount + " member" + (pendingCount > 1 ? "s haven't" : " hasn't") + " paid this month",
          sub: "Go to Tracker to send reminders →",
          action: "showPage('trackerPage',document.querySelector('[onclick*=trackerPage]'))"
        });
      }

      // Alert 2: expenses vs contributions (selected period)
      var monthC = data.filter(function(c) {
        return String(c.Year) === String(curYear) && c.ForMonth === curMonth;
      }).reduce(function(s,c) { return s + Number(c.Amount||0); }, 0);
      if (monthE > monthC && monthC > 0) {
        alerts.push({
          type: "warn",
          text: "Expenses (₹" + fmt(monthE) + ") exceed income (₹" + fmt(monthC) + ")",
          sub: "Review expense page →",
          action: "showPage('expensePage',document.querySelector('[onclick*=expensePage]'))"
        });
      }

      // Alert 3: month progress (up to selected month)
      var selMonthIdx = MONTHS.indexOf(curMonth);
      var doneMonths = MONTHS.slice(0, selMonthIdx + 1).filter(function(m) {
        // Only count months that have at least one real MEMBER contribution (not walk-in-only)
        return data.some(function(c) {
          return String(c.Year) === String(curYear) && c.ForMonth === m &&
                 !String(c.UserId).startsWith("WALKIN_");
        });
      }).length;
      var totalMonths = selMonthIdx + 1;
      if (doneMonths < totalMonths) {
        var missing = totalMonths - doneMonths;
        alerts.push({
          type: "info",
          text: missing + " month" + (missing>1?"s":"") + " with no contributions recorded",
          sub: "Check contribution records →",
          action: "showPage('contributionPage',document.querySelector('[onclick*=contributionPage]'))"
        });
      }

      // BIRTHDAY: inject upcoming birthdays
      // FIX: midnight-normalised comparison so diff===0 always means today
      (function() {
        if (!users || !users.length) return;
        var now   = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var bdayAlerts = [];
        users.forEach(function(u) {
          if (!u.DOB || String(u.Role||"").toLowerCase() === "admin") return;
          var dob = String(u.DOB||"").trim();
          var dd, mm, parts;
          if      (/^\d{2}-\d{2}-\d{4}$/.test(dob)) { parts=dob.split("-"); dd=Number(parts[0]); mm=Number(parts[1]); }
          else if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) { parts=dob.split("-"); dd=Number(parts[2]); mm=Number(parts[1]); }
          else if (dob.indexOf("T")>=0||dob.indexOf("Z")>=0) {
            var _d=new Date(dob); if(isNaN(_d)) return;
            dd=_d.getUTCDate(); mm=_d.getUTCMonth()+1;
          } else return;
          var bday = new Date(today.getFullYear(), mm-1, dd);
          if (bday < today) bday = new Date(today.getFullYear()+1, mm-1, dd);
          var diff = Math.round((bday - today) / 86400000);
          if (diff === 0)      bdayAlerts.push({ type:"birthday", diff:0, text:"🎂 Today is " + escapeHtml(u.Name) + "'s birthday!", sub:"Birthday email will be sent automatically if enabled" });
          else if (diff === 1) bdayAlerts.push({ type:"birthday", diff:1, text:"🎂 " + escapeHtml(u.Name) + "'s birthday is tomorrow!", sub:"" });
          else if (diff <= 7)  bdayAlerts.push({ type:"birthday", diff:diff, text:"🎂 " + escapeHtml(u.Name) + "'s birthday in " + diff + " days", sub:"" });
        });
        // Sort by diff ascending, then prepend to alerts so birthdays show first
        bdayAlerts.sort(function(a,b){ return a.diff - b.diff; });
        bdayAlerts.forEach(function(a){ alerts.unshift(a); });
      })();

      // All clear
      if (alerts.length === 0) {
        alerts.push({ type: "ok", text: "All clear — everything looks good!", sub: "" });
      }

      if (badgeEl) {
        var warnCount = alerts.filter(function(a) { return a.type === "warn"; }).length;
        if (warnCount > 0) {
          badgeEl.textContent = warnCount + " warning" + (warnCount > 1 ? "s" : "");
          badgeEl.style.display = "inline-block";
        } else {
          badgeEl.style.display = "none";
        }
      }

      el.innerHTML = alerts.map(function(a) {
        var bg  = a.type === "warn" ? "#fffbeb" : a.type === "info" ? "#F0FDFA" : a.type === "birthday" ? "#fdf4ff" : "#f0fdf4";
        var bc  = a.type === "warn" ? "#5EEAD4" : a.type === "info" ? "#bfdbfe" : a.type === "birthday" ? "#e9d5ff" : "#bbf7d0";
        var ic  = a.type === "warn" ? "fa-triangle-exclamation" : a.type === "info" ? "fa-circle-info" : a.type === "birthday" ? "fa-cake-candles" : "fa-circle-check";
        var ic2 = a.type === "warn" ? "#d97706" : a.type === "info" ? "#0F766E" : a.type === "birthday" ? "#9333ea" : "#16a34a";
        var cursor = a.action ? "cursor:pointer;" : "";
        var onclick = a.action ? ' onclick="' + a.action + '"' : "";
        return '<div style="background:' + bg + ';border:1px solid ' + bc + ';border-radius:8px;padding:9px 12px;margin-bottom:7px;' + cursor + '"' + onclick + '>' +
          '<div style="display:flex;align-items:flex-start;gap:8px;">' +
            '<i class="fa-solid ' + ic + '" style="color:' + ic2 + ';font-size:13px;margin-top:1px;flex-shrink:0;"></i>' +
            '<div>' +
              '<div style="font-size:12px;font-weight:600;color:#334155;">' + a.text + '</div>' +
              (a.sub ? '<div style="font-size:11px;color:#64748b;margin-top:2px;">' + a.sub + '</div>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
      }).join("");
    }

    function _hmRenderYearTracker(curYear, curMonth) {
      var el = document.getElementById("hm_yr_label");
      if (el) el.textContent = curYear;

      var selMonthIdx = curMonth ? MONTHS.indexOf(curMonth) : new Date().getMonth();
      var pct = Math.round((selMonthIdx + 1) / 12 * 100);

      el = document.getElementById("hm_yr_months_done");
      if (el) el.textContent = selMonthIdx + 1;
      el = document.getElementById("hm_yr_pct");
      if (el) el.textContent = pct + "%";
      el = document.getElementById("hm_yr_progress_fill");
      if (el) {
        el.style.width = pct + "%";
        el.style.transition = "width .4s ease";
        el.style.background = pct >= 75 ? "#27ae60" : pct >= 40 ? "#0F766E" : "#e74c3c";
      }

      // ── Year totals for selected year (the numbers that were ₹0 before) ──
      var yearC = data.filter(function(c) {
        return String(c.Year) === String(curYear);
      }).reduce(function(s,c) { return s + Number(c.Amount||0); }, 0);

      var yearE = expenses.filter(function(e) {
        return String(e.Year) === String(curYear);
      }).reduce(function(s,e) { return s + Number(e.Amount||0); }, 0);

      // Opening balance for selected year — use dash_getOpeningBalance() so that if no
      // yearConfig row exists yet for this year (e.g. brand-new year), it correctly
      // computes the carry-forward from the previous year's closing balance recursively,
      // instead of silently falling back to 0.
      var opening = (typeof dash_getOpeningBalance === "function" && Array.isArray(dash_yearConfig) && dash_yearConfig.length)
        ? dash_getOpeningBalance(curYear, dash_yearConfig, data, expenses)
        : 0;
      var net = opening + yearC - yearE;
      var netCol = net >= 0 ? "#16a34a" : "#dc2626";

      // Status badge
      el = document.getElementById("hm_yr_status_badge");
      if (el) {
        if (yearC > yearE) {
          el.textContent = "On track";
          el.style.background = "#f0fdf4"; el.style.color = "#166534"; el.style.border = "1px solid #bbf7d0";
        } else if (yearE > yearC) {
          el.textContent = "Deficit";
          el.style.background = "#fef2f2"; el.style.color = "#991b1b"; el.style.border = "1px solid #fca5a5";
        } else {
          el.textContent = "Balanced";
          el.style.background = "#f8fafc"; el.style.color = "#475569"; el.style.border = "1px solid #e2e8f0";
        }
      }

      // ── Inject year stat cells below status badge (idempotent) ──────────
      // Shows: collected · expenses · net · members for the SELECTED year
      (function _renderYearStatCells() {
        var cellsId = "_hm_yr_cells";
        var wrap = document.getElementById(cellsId);
        if (!wrap) {
          wrap = document.createElement("div");
          wrap.id = cellsId;
          wrap.style.cssText = "display:flex;gap:6px;margin-top:10px;";
          var badge = document.getElementById("hm_yr_status_badge");
          if (badge && badge.parentNode) badge.parentNode.appendChild(wrap);
        }
        var memberCount = users.filter(function(u) {
          return String(u.Status||"").toLowerCase() === "active";
        }).length || (window._hmActiveMemberCount || 0);

        function cell(label, val, col) {
          return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;' +
            'padding:8px 4px;background:#f8fafc;border:0.5px solid #e2e8f0;border-radius:8px;">' +
            '<div style="font-size:14px;font-weight:600;color:' + (col||"#334155") + ';line-height:1.2;">' + val + '</div>' +
            '<div style="font-size:9px;color:#94a3b8;margin-top:3px;text-align:center;white-space:nowrap;">' + label + '</div>' +
          '</div>';
        }
        wrap.innerHTML =
          cell("Collected",   "₹" + fmt(yearC), "#16a34a") +
          cell("Expenses",    "₹" + fmt(yearE), "#dc2626") +
          cell("Net balance", (net < 0 ? "−" : "") + "₹" + fmt(Math.abs(net)), netCol) +
          cell("Members",     String(memberCount), "#14B8A6");
      })();
    }

    /* Also call _hmRenderDashboard after _dashSyncFromAdmin so
       Walk-in and member lists refresh after any contribution is added */
    // L2: removed unused _origDashSync variable (was captured at parse-time, never referenced)
    document.addEventListener("DOMContentLoaded", function() {
      var origSync = window._dashSyncFromAdmin;
      if (typeof origSync === "function") {
        window._dashSyncFromAdmin = function() {
          origSync();
          setTimeout(_hmRenderDashboard, 400);
        };
      }
    });

    async function init() {
      // SESSION GUARD: Check session BEFORE firing any backend call.
      // Without this, if _forceLogout() cleared localStorage (session expiry, cross-device kick),
      // getCached("getAllData") fires immediately with no userId/token → REJECTED_NO_TOKEN logged
      // as "Unknown". This guard stops all backend calls and lets _forceLogout handle the redirect.
      try {
        const _initSess = JSON.parse(localStorage.getItem("session") || "null");
        if (!_initSess || !_initSess.userId || !_initSess.sessionToken || Date.now() > (_initSess.expiry || 0)) {
          if (typeof _forceLogout === "function") {
            _forceLogout("Session expired. Please login again.", "Session expired - init guard");
          } else {
            location.replace("login.html");
          }
          return;
        }
      } catch(_e) { /* storage error — let init proceed, getData will get rejected cleanly */ }
      // Preserve scroll position so saves don't jump user to top
      const _scrollY = window.scrollY;
      _resetLoadingOverlay();
      setLoading(true);
      try {
        let allData = (await getCached("getAllData")) || {};
        users = allData.users || [];
        types = allData.types || [];
        expenseTypes = allData.expenseTypes || [];
        occasions = allData.occasions || [];
        data = allData.contributions || [];
        expenses = allData.expenses || [];
        goals = allData.goals || [];
        yearConfig = allData.yearConfig || [];
        showUser();
        loadMonths();
        loadYears();
        loadUsers();
        loadTypes();
        loadExpenseTypes();
        loadOccasions();
        render();
        renderUsers();
        updateUserTabCounts(users);
        renderTypes();
        renderOccasions();
        renderExpenseTypes();
        renderExpenses();
        loadExpenseFilters();
        renderGoals();
        loadSummary();
        // Populate Contribution Records filter dropdowns on initial load
        setTimeout(function() { if (typeof _cr_buildFilterDropdowns === "function") _cr_buildFilterDropdowns(); }, 400);
        // Load contribution request badge count — use cache so rapid init() calls don't stack requests
        getCached("getContributionRequests").then(function (res) {
          window._allRequests = Array.isArray(res) ? res : [];
          _updateReqBadge();
        }).catch(function () { });
        // Auto-refresh pending requests badge every 2 minutes.
        // Busts cache first so each scheduled tick always hits the server (not stale cache),
        // while ad-hoc reads within the 60s window still benefit from dedup.
        if (!window._reqBadgeTimer) {
          window._reqBadgeTimer = setInterval(function() {
            mandirCacheBust("getContributionRequests");
            getCached("getContributionRequests").then(function(res) {
              window._allRequests = Array.isArray(res) ? res : [];
              _updateReqBadge();
            }).catch(function(){});
          }, 2 * 60 * 1000);
        }
        // Populate email quota sidebar counter on page load.
        // FIX: Delay by 3s so the session token write from login has time to complete
        // before hitting getEmailQuota. Previously caused VERIFY_SESSION_ERROR in audit log.
        // _refreshEmailQuotaUI is the single owner of sb_email_quota —
        // updateSidebarSummary no longer reads quota to avoid async race.
        setTimeout(function() {
          if (typeof _refreshEmailQuotaUI === "function") _refreshEmailQuotaUI();
        }, 3000);
        // Auto-run health check once after data loads so the header
        // heartbeat dot shows the correct status colour from login
        if (!window._hcRanOnce && typeof runHealthCheck === "function") {
          window._hcRanOnce = true;
          setTimeout(runHealthCheck, 1500);
        }
        // Today's birthdays — lets admin send a wish too, same as members
        _loadAdminBirthdayWidget();
      } catch (err) {
        // Show specific error reason in the loading overlay with a Retry button
        _showLoadingError(err);
        return; // keep overlay open — user will click Retry
      } finally {
        // Only hide overlay if we didn't hit an error (error path returns early above)
        const errEl = document.getElementById("loadingOverlay_error");
        if (!errEl || errEl.style.display === "none") {
          _aloRetryCount = 0;   // reset on success
          _aloClearCountdown(); // cancel any auto-retry timer
          setLoading(false);
        }
        // Restore scroll position after re-render
        requestAnimationFrame(() => window.scrollTo(0, _scrollY));
      }
    }

    /* ═══ ADMIN — TODAY'S BIRTHDAYS WIDGET ═══════════════════════════
       Lets an admin send the same fixed-reply / custom wishes members
       can send each other. Reuses getTodayBirthdays / sendBirthdayWish
       as-is — an admin account is just another row in USERS with its
       own UserId, so no backend changes were needed for this.
    ═══════════════════════════════════════════════════════════════ */
    async function _loadAdminBirthdayWidget() {
      const card = document.getElementById("adm_bday_card");
      const list = document.getElementById("adm_bday_list");
      if (!card || !list) return;
      try {
        const today = await getData("getTodayBirthdays");
        if (!today || today.status !== "success" || !today.others || !today.others.length) {
          card.style.display = "none";
          return;
        }
        _renderAdminBirthdayList(today.others);
        card.style.display = "";
      } catch (e) {
        card.style.display = "none"; // silent — widget just doesn't show if the check fails
      }
    }

    function _renderAdminBirthdayList(others) {
      const list = document.getElementById("adm_bday_list");
      if (!list) return;
      const replies = (typeof APP !== "undefined" && Array.isArray(APP.birthdayWishes) && APP.birthdayWishes.length) ? APP.birthdayWishes : ["🎉 Happy Birthday!"];
      list.innerHTML = others.map(function (o) {
        const uid = String(o.UserId).replace(/'/g, "");
        const name = escapeHtml(o.Name || "A member");
        const actionsHtml = o.alreadyWished
          ? '<div class="adm-bday-sent">✓ Wish sent</div>'
          : '<div class="adm-bday-actions">' + replies.map(function (r) {
              return '<button class="adm-bday-btn" onclick="_sendAdminBirthdayWish(this,\'' + uid + '\',\'' + r.replace(/'/g, "\\'") + '\')">' + escapeHtml(r) + '</button>';
            }).join("") + '<button class="adm-bday-btn" onclick="_openAdminCustomWish(this,\'' + uid + '\')">✏️ Custom</button></div>';
        return '<div class="adm-bday-card">'
          + '<div class="adm-bday-head"><div><div class="adm-bday-name">' + name + '\'s birthday today! 🎂</div>'
          + (o.alreadyWished ? '' : '<div class="adm-bday-sub">Send a quick wish:</div>')
          + '</div></div>'
          + actionsHtml
          + '</div>';
      }).join("");
    }

    window._sendAdminBirthdayWish = function (btnEl, toUserId, message) {
      const cardEl = btnEl ? btnEl.closest(".adm-bday-card") : null;
      if (cardEl) cardEl.querySelectorAll("button, input").forEach(function (b) { b.disabled = true; });
      postData({ action: "sendBirthdayWish", ToUserId: toUserId, Message: message })
        .then(function (res) {
          if (res && (res.status === "success" || res.status === "already_sent")) {
            _loadAdminBirthdayWidget(); // refresh from server so state stays accurate
          } else {
            toast((res && res.message) || "Could not send wish. Please try again.", "error");
            if (cardEl) cardEl.querySelectorAll("button, input").forEach(function (b) { b.disabled = false; });
          }
        })
        .catch(function () {
          toast("Network error. Please try again.", "error");
          if (cardEl) cardEl.querySelectorAll("button, input").forEach(function (b) { b.disabled = false; });
        });
    };

    window._openAdminCustomWish = function (btnEl, toUserId) {
      const cardEl = btnEl ? btnEl.closest(".adm-bday-card") : null;
      const actionsRow = cardEl ? cardEl.querySelector(".adm-bday-actions") : null;
      if (!actionsRow || cardEl.querySelector(".adm-bday-custom-row")) return;
      const row = document.createElement("div");
      row.className = "adm-bday-custom-row";
      row.innerHTML = '<input type="text" class="adm-bday-custom-input" maxlength="120" placeholder="Write your own wish…" />'
        + '<button class="adm-bday-btn adm-bday-custom-send">Send</button>'
        + '<button type="button" class="adm-bday-custom-cancel" title="Cancel">✕</button>';
      actionsRow.parentNode.insertBefore(row, actionsRow.nextSibling);
      const input = row.querySelector(".adm-bday-custom-input");
      const sendBtn = row.querySelector(".adm-bday-custom-send");
      const cancelBtn = row.querySelector(".adm-bday-custom-cancel");
      input.focus();
      function doSend() {
        const val = input.value.trim();
        if (!val) { input.focus(); return; }
        window._sendAdminBirthdayWish(sendBtn, toUserId, val);
      }
      sendBtn.addEventListener("click", doSend);
      cancelBtn.addEventListener("click", function () { row.remove(); });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") doSend();
        else if (e.key === "Escape") row.remove();
      });
    };

    function loadMonths() {
      const opts = MONTHS.map(
        (x) => `<option value="${x}">${x}</option>`
      ).join("");
      ["month", "expMonth"].forEach((id) => {
        let el = document.getElementById(id);
        if (el)
          el.innerHTML =
            (id !== "month" ? '<option value="">None</option>' : "") + opts;
      });
    }
    function loadYears() {
      let years = new Set();
      data.forEach((c) => {
        let y = Number(c.Year);
        if (!isNaN(y) && y > 2000) years.add(y);
      });
      expenses.forEach((e) => {
        let y = Number(e.Year);
        if (!isNaN(y) && y > 2000) years.add(y);
      });
      let cur = new Date().getFullYear();
      // Always include from project start year to next year
      for (let y = _getProjectStartYear(); y <= cur + 1; y++) years.add(y);

      const sortedYears = Array.from(years).sort((a, b) => b - a);

      // contribYear — shows label hint for past/future years so admin knows
      // the receipt ID will use the selected year (MNR-YYYY-NNNNN)
      const contribEl = document.getElementById("contribYear");
      if (contribEl) {
        contribEl.innerHTML = sortedYears.map((y) => {
          let label = String(y);
          if (y === cur)      label = y + " (Current)";
          else if (y < cur)   label = y + " (Old Entry)";
          else if (y > cur)   label = y + " (Advance)";
          return `<option value="${y}">${label}</option>`;
        }).join("");
        contribEl.value = cur;
      }

      // expYear — expense year dropdown (same year range, plain labels)
      // FIX: was never populated, leaving the dropdown empty on the Add Expense form
      const expYearEl = document.getElementById("expYear");
      if (expYearEl) {
        expYearEl.innerHTML = sortedYears.map((y) =>
          `<option value="${y}"${y === cur ? " selected" : ""}>${y}</option>`
        ).join("");
      }

      // Initialize receipt year hint display
      const hintEl = document.getElementById("contribYearHint");
      if (hintEl) hintEl.textContent = "Receipt will be: " + (APP.receiptPrefix||"REC") + "-" + cur + "-NNNNN";
    }
    function loadUsers() {
      const _luEl = document.getElementById("user");
      if (_luEl) {
        _luEl.innerHTML = '<option value="">-- Select Member --</option>' + users
          .filter((u) => u.Role !== "Admin" && String(u.Status || "").toLowerCase() === "active")
          .map((u) => `<option value="${u.UserId}">${u.Name}</option>`)
          .join("");
        if (typeof _updateContribMemberPreview === "function") _updateContribMemberPreview(_luEl.value);
        if (typeof _cmbSyncLabel === "function") _cmbSyncLabel('user');
      }
    }

    /* ── Reusable avatar dropdown for ANY member-picker <select> ──
       Works on top of any real <select> whose id is passed in as `selId`.
       Expects matching wrapper elements named {selId}_cmbWrap / _cmbBtn /
       _cmbBtnLabel / _cmbList right next to the real (hidden) select.
       The real select stays fully functional — every selection here just
       sets its value and fires its normal "change" event, so whatever
       logic already listens to that select (inline onchange or
       addEventListener) keeps working exactly as before, untouched. */
    function _cmbSyncLabel(selId) {
      var sel = document.getElementById(selId);
      var lbl = document.getElementById(selId + "_cmbBtnLabel");
      if (!sel || !lbl) return;
      var opt = sel.options[sel.selectedIndex];
      var hasValue = opt && opt.value !== "";
      lbl.textContent = opt ? opt.textContent : "-- Select Member --";
      lbl.style.color = hasValue ? "#1e293b" : "#94a3b8";
    }
    function _cmbToggle(selId) {
      var list = document.getElementById(selId + "_cmbList");
      if (!list) return;
      var opening = list.style.display === "none" || !list.style.display;
      // Close any other open avatar-dropdown lists first
      document.querySelectorAll('[id$="_cmbList"]').forEach(function(l) { if (l !== list) l.style.display = "none"; });
      if (opening) { _cmbBuildList(selId); list.style.display = "block"; }
      else { list.style.display = "none"; }
    }
    function _cmbBuildList(selId) {
      var list = document.getElementById(selId + "_cmbList");
      var sel = document.getElementById(selId);
      if (!list || !sel) return;
      var opts = Array.prototype.slice.call(sel.options).filter(function(o) { return o.value !== ""; });
      list.innerHTML = opts.map(function(o) {
        var u = (typeof users !== "undefined" ? users : []).find(function(x) { return String(x.UserId) === String(o.value); });
        var isSel = String(sel.value) === String(o.value);
        return '<div class="_cmbItem" onclick="_cmbSelect(\'' + selId + '\',\'' + o.value + '\')" style="display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;' + (isSel ? "background:#eff6ff;" : "") + '" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'' + (isSel ? "#eff6ff" : "transparent") + '\'">' +
          _avatarHtml(u, 26) +
          '<span style="font-size:13px;color:#334155;">' + escapeHtml(o.textContent) + '</span>' +
          '</div>';
      }).join("");
      if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(list);
    }
    function _cmbSelect(selId, uid) {
      var sel = document.getElementById(selId);
      if (!sel) return;
      sel.value = uid;
      _cmbSyncLabel(selId);
      var list = document.getElementById(selId + "_cmbList");
      if (list) list.style.display = "none";
      sel.dispatchEvent(new Event("change"));
    }
    document.addEventListener("click", function(e) {
      document.querySelectorAll('[id$="_cmbWrap"]').forEach(function(wrap) {
        var selId = wrap.id.replace(/_cmbWrap$/, "");
        var list = document.getElementById(selId + "_cmbList");
        if (list && list.style.display !== "none" && !wrap.contains(e.target)) list.style.display = "none";
      });
    });

    /* ── Contribution form: avatar preview shown under the Member dropdown ──
       Native <select><option> can't render images, so instead we show a
       small "who is selected" strip below the dropdown once a member is
       picked. Called on dropdown change, and from _editRetryContrib() when
       the user is set programmatically (onchange doesn't fire in that case). */
    function _updateContribMemberPreview(userId) {
      var el = document.getElementById("sp-contrib-member-preview");
      if (!el) return;
      var u = (typeof users !== "undefined" ? users : []).find(function(x) { return String(x.UserId) === String(userId); });
      if (!userId || !u) { el.style.display = "none"; el.innerHTML = ""; return; }
      el.style.display = "flex";
      el.innerHTML = _avatarHtml(u, 30) +
        '<div style="min-width:0;">' +
          '<div style="font-size:12.5px;font-weight:600;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(u.Name||"") + '</div>' +
          '<div style="font-size:10.5px;color:#94a3b8;">' + escapeHtml(u.Mobile||"") + '</div>' +
        '</div>';
      if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(el);
    }

    /* ── Same preview box, for the Bulk Insert Member dropdown ── */
    function _updateBkMemberPreview(userId) {
      var el = document.getElementById("bk-member-preview");
      if (!el) return;
      var u = (typeof users !== "undefined" ? users : []).find(function(x) { return String(x.UserId) === String(userId); });
      if (!userId || !u) { el.style.display = "none"; el.innerHTML = ""; return; }
      el.style.display = "flex";
      el.innerHTML = _avatarHtml(u, 30) +
        '<div style="min-width:0;">' +
          '<div style="font-size:12.5px;font-weight:600;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(u.Name||"") + '</div>' +
          '<div style="font-size:10.5px;color:#94a3b8;">' + escapeHtml(u.Mobile||"") + '</div>' +
        '</div>';
      if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(el);
    }
    function loadTypes() {
      const _ltEl = document.getElementById("type");
      if (_ltEl) _ltEl.innerHTML = types
        .map((t) => `<option value="${t.TypeId}">${t.TypeName}</option>`)
        .join("");
    }
    function loadExpenseTypes() {
      const _letEl = document.getElementById("expenseType");
      if (_letEl) _letEl.innerHTML = expenseTypes
        .map((e) => `<option value="${e.ExpenseTypeId}">${e.Name}</option>`)
        .join("");
      if (typeof _exp_populateTypeDropdown === "function") _exp_populateTypeDropdown();
    }
    function loadOccasions() {
      const _loEl = document.getElementById("occasion");
      if (_loEl) _loEl.innerHTML =
        '<option value="">None</option>' +
        occasions
          .map(
            (o) =>
              `<option value="${o.OccasionId}">${o.OccasionName}</option>`
          )
          .join("");
    }

    /* ══ PAGINATION UTILITY ══════════════════════════════════════════
       _renderPagination(containerId, totalPages, currentPage, onPageFn)
       Renders Previous / numbered / Next buttons into the given container.
    ═══════════════════════════════════════════════════════════════════ */