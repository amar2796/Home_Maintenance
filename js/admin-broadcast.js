    let _bcHistory = [];

    function previewBroadcast() {
      const typeEl = document.getElementById("bc_type");
      const prioEl = document.getElementById("bc_priority");
      const titleEl = document.getElementById("bc_title");
      const msgEl = document.getElementById("bc_message");
      if (!typeEl || !titleEl || !msgEl) {
        toast("Broadcast form not found.", "error");
        return;
      }
      const type = typeEl.value;
      const priority = prioEl ? prioEl.value : "normal";
      const title = titleEl.value.trim();
      const message = msgEl.value.trim();
      if (!title && !message) {
        toast("Please enter a title and message first.", "warn");
        return;
      }
      const typeIcon = { announcement: "📢", innovation: "💡", event: "🎉", maintenance: "🔧" };
      const prioColor = { urgent: "#ef4444", important: "#0F766E", normal: "#94a3b8", low: "#cbd5e1" };
      const prioBg = { urgent: "#fee2e2", important: "#F0FDFA", normal: "#f1f5f9", low: "#f8fafc" };
      const preview = `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;border-left:4px solid ${prioColor[priority] || "#ccc"};">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="font-size:1.1rem;">${typeIcon[type] || "📢"}</span>
          <span style="background:${prioBg[priority] || "#f1f5f9"};color:${prioColor[priority] || "#334155"};padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;">${priority.toUpperCase()}</span>
        </div>
        <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:4px;">${escapeHtml(title || "(no title)")}</div>
        <div style="font-size:13px;color:#555;line-height:1.5;">${escapeHtml(message || "(no message)")}</div>
      </div>`;
      openModal(
        `<div class="_mhdr"><h3><i class="fa-solid fa-eye"></i> Broadcast Preview</h3><button class="_mcls" onclick="closeModal()">×</button></div>
          <div class="_mbdy">
            <p style="font-size:12px;color:#94a3b8;margin:0 0 12px;">This is how it will look on each member's dashboard and notification bell:</p>
            ${preview}
          </div>
          <div class="_mft">
            <button class="_mbtn" style="background:#999;" onclick="closeModal()">Close</button>
            <button class="_mbtn" style="background:#0F766E;" onclick="closeModal();sendBroadcast()"><i class="fa-solid fa-paper-plane"></i> Send Now</button>
          </div>`,
        "480px"
      );
    }

    async function sendBroadcast() {
      const typeEl = document.getElementById("bc_type");
      const prioEl = document.getElementById("bc_priority");
      const titleEl = document.getElementById("bc_title");
      const msgEl = document.getElementById("bc_message");
      if (!typeEl || !titleEl || !msgEl) {
        toast("Broadcast form not found.", "error");
        return;
      }
      const type = typeEl.value;
      const priority = prioEl ? prioEl.value : "normal";
      const title = titleEl.value.trim();
      const message = msgEl.value.trim();
      if (!title) {
        toast("Please enter a title/subject.", "warn");
        return;
      }
      if (!message) {
        toast("Please enter a message.", "warn");
        return;
      }
      const session = JSON.parse(localStorage.getItem("session") || "{}");
      const adminName = session.name || "Admin";
      const time = new Date().toLocaleString(APP.locale||"en-IN");
      // Store broadcast in backend sheet so all users can read it
      try {
        const res = await postData({
          action: "saveBroadcast",
          type,
          priority,
          title,
          message,
          time,
          AdminName: adminName,
        });
        if (!res || res.status !== "success") {
          toast((res && res.message) || "Could not send broadcast.", "warn");
          return;
        }
      } catch (e) {
        toast("Could not send broadcast — check your connection.", "warn");
        return;
      }
      _loadBroadcastHistory(); // re-fetch so the new entry has its real BcId (needed for delete)
      titleEl.value = "";
      msgEl.value = "";
      toast("✅ Broadcast sent — now visible on member dashboards.");
    }

    // Loads existing broadcasts from the backend so history survives
    // reloads/re-logins, instead of only showing what was sent this session.
    // Defensive formatter: the backend now formats Time itself, but this
    // covers the gap until that's redeployed, and any other odd values —
    // reformats ISO-looking strings, leaves already-good strings untouched.
    function _formatBcTime(t) {
      if (!t) return "";
      const s = String(t);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) return s;
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      try {
        return d.toLocaleString(APP.locale || "en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      } catch (e) { return s; }
    }

    async function _loadBroadcastHistory() {
      const container = document.getElementById("broadcastHistory");
      try {
        // Admin view: includes disabled broadcasts too (so they can be
        // re-enabled), unlike getBroadcasts which only returns enabled ones.
        const res = await getData("getBroadcastsAdmin");
        const list = Array.isArray(res) ? res : [];
        _bcHistory = list.map(function (b) {
          return {
            bcId: b.BcId || b.bcId || "",
            type: b.Type || b.type || "announcement",
            priority: b.Priority || b.priority || "normal",
            title: b.Title || b.title || "",
            message: b.Message || b.message || "",
            time: b.Time || b.time || "",
            adminName: b.AdminName || b.adminName || "Admin",
            status: b.Status || b.status || "Enabled",
          };
        });
      } catch (e) {
        _bcHistory = [];
        if (container) {
          container.innerHTML = '<div style="font-size:13px;color:#c0392b;text-align:center;padding:20px;">Could not load broadcast history — check your connection.</div>';
          return;
        }
      }
      renderBroadcastHistory();
    }

    // Flips a broadcast between Enabled/Disabled instead of deleting it.
    // Disabled broadcasts stay in history (dimmed, admin-only) and can be
    // re-enabled later; they disappear from every member's dashboard/bell
    // the moment they're disabled.
    function _toggleBroadcastItem(bcId, title, currentlyEnabled) {
      if (!bcId) return;
      const goingTo = currentlyEnabled ? "Disable" : "Enable";
      const warnLine = currentlyEnabled
        ? 'This hides it from all members too.'
        : 'This makes it visible to all members again.';
      confirmModal(
        goingTo + ' broadcast "' + escapeHtml(title) + '"?<br><span style="font-size:12px;color:#94a3b8;">' + warnLine + '</span>',
        function () {
          const session = JSON.parse(localStorage.getItem("session") || "{}");
          return postData({ action: "toggleBroadcast", BcId: bcId, AdminName: session.name || "Admin" })
            .then(function (res) {
              if (res && res.status === "success") {
                const item = _bcHistory.find(function (b) { return b.bcId === bcId; });
                if (item) item.status = res.newStatus || (currentlyEnabled ? "Disabled" : "Enabled");
                renderBroadcastHistory();
                toast("Broadcast " + (res.newStatus === "Disabled" ? "disabled" : "enabled") + ".", "success");
              } else if (res && res.message) {
                toast(res.message, "warn");
              } else {
                // Empty/unrecognized result usually means the deployed Apps Script
                // backend doesn't have the toggleBroadcast action yet — needs redeploy.
                toast("This isn't available yet — the Apps Script backend needs to be redeployed with the latest code.", "warn");
              }
            })
            .catch(function () {
              toast("Could not update broadcast — check your connection.", "warn");
            });
        },
        goingTo,
        currentlyEnabled ? "#e74c3c" : "#16a34a"
      );
    }

    function renderBroadcastHistory() {
      const container = document.getElementById("broadcastHistory");
      if (!container) return;
      if (_bcHistory.length === 0) {
        container.innerHTML =
          '<div style="font-size:13px;color:#888;text-align:center;padding:20px;">No broadcasts sent yet.</div>';
        return;
      }
      const typeIcon = { announcement: "📢", innovation: "💡", event: "🎉", maintenance: "🔧" };
      const prioColor = { urgent: "#ef4444", important: "#0F766E", normal: "#94a3b8", low: "#cbd5e1" };
      const prioBg = { urgent: "#fee2e2", important: "#F0FDFA", normal: "#f1f5f9", low: "#f8fafc" };
      container.innerHTML = _bcHistory
        .map(
          (b) => {
            const enabled = String(b.status || "Enabled").toLowerCase() !== "disabled";
            const dimStyle = enabled ? "" : "opacity:0.55;";
            const btnTitle = enabled ? "Disable (hide from members)" : "Enable (show to members)";
            return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;margin-bottom:10px;border-left:4px solid ${prioColor[b.priority] || "#ccc"};${dimStyle}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:6px;">
              <span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;">
                <span>${typeIcon[b.type] || "📢"}</span>
                <span style="background:${prioBg[b.priority] || "#f1f5f9"};color:${prioColor[b.priority] || "#334155"};padding:2px 9px;border-radius:12px;font-size:10.5px;font-weight:700;">${(b.priority || "normal").toUpperCase()}</span>
                <b style="font-size:13px;">${escapeHtml(b.title)}</b>
              </span>
              <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                <span style="font-size:11px;color:#aaa;white-space:nowrap;">${escapeHtml(_formatBcTime(b.time))}</span>
                ${!enabled ? '<span style="font-size:9.5px;font-weight:700;color:#94a3b8;background:#f1f5f9;border-radius:8px;padding:1px 7px;white-space:nowrap;">DISABLED</span>' : ""}
                <label class="ea-toggle" title="${btnTitle}">
                  <input type="checkbox" ${enabled ? "checked" : ""} onclick="event.preventDefault(); _toggleBroadcastItem('${b.bcId}', '${escapeHtml(b.title).replace(/'/g, "&#39;")}', ${enabled})">
                  <span class="ea-slider"></span>
                </label>
              </div>
            </div>
            <div style="font-size:12px;color:#555;margin-bottom:4px;">${escapeHtml(
              b.message.substring(0, 120)
            )}${b.message.length > 120 ? "…" : ""}</div>
            <div style="font-size:10.5px;color:#aaa;">Sent by ${escapeHtml(b.adminName || "Admin")}</div>
          </div>`;
          }
        )
        .join("");
    }

    /* ═══ AUDIT LOG FUNCTIONS — ENHANCED ═══ */