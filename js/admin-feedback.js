    (function injectFbModal() {
      if (document.getElementById('_fbModalOverlay')) return;
      const style = document.createElement('style');
      style.textContent = `
          #_fbModalOverlay {
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(15,23,42,0.55);
            backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            opacity: 0; pointer-events: none;
            transition: opacity 0.22s ease;
          }
          #_fbModalOverlay.show { opacity: 1; pointer-events: all; }
          #_fbModalBox {
            background: #fff; border-radius: 20px;
            padding: 32px 28px 24px; max-width: 360px; width: 90%;
            box-shadow: 0 24px 60px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.04);
            transform: scale(0.88) translateY(16px);
            transition: transform 0.26s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease;
            opacity: 0; text-align: center;
          }
          #_fbModalOverlay.show #_fbModalBox { transform: scale(1) translateY(0); opacity: 1; }
          #_fbModalIcon {
            width: 66px; height: 66px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 1.7rem; margin: 0 auto 16px;
          }
          #_fbModalIcon.done { background: #d1fae5; color: #059669; }
          #_fbModalIcon.del  { background: #fee2e2; color: #dc2626; }
          #_fbModalTitle {
            font-size: 1.12rem; font-weight: 700; color: #0f172a;
            margin: 0 0 8px; font-family: Poppins, sans-serif;
          }
          #_fbModalMsg {
            font-size: 0.855rem; color: #64748b; line-height: 1.65;
            margin: 0 0 24px; font-family: Poppins, sans-serif;
          }
          #_fbModalMsg strong { color: #334155; }
          #_fbModalMeta {
            background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
            padding: 10px 14px; margin: -10px 0 20px;
            font-size: 12px; color: #475569; font-family: Poppins, sans-serif;
            text-align: left; line-height: 1.7; display: none;
          }
          #_fbModalMeta.show { display: block; }
          #_fbModalMeta span { font-weight: 600; color: #0f172a; }
          ._fbModalBtns { display: flex; gap: 10px; justify-content: center; }
          ._fbModalBtns button {
            flex: 1; max-width: 148px; padding: 11px 0;
            border-radius: 10px; border: none;
            font-size: 0.88rem; font-weight: 700; cursor: pointer;
            font-family: Poppins, sans-serif;
            transition: transform 0.15s, box-shadow 0.15s;
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          }
          ._fbModalBtns button:hover { transform: translateY(-2px); }
          #_fbModalCancel { background: #f1f5f9; color: #475569; }
          #_fbModalCancel:hover { background: #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
          #_fbModalConfirm.done { background: linear-gradient(135deg,#34d399,#059669); color:#fff; box-shadow:0 4px 14px rgba(5,150,105,0.3); }
          #_fbModalConfirm.done:hover { box-shadow:0 8px 20px rgba(5,150,105,0.45); }
          #_fbModalConfirm.del  { background: linear-gradient(135deg,#f87171,#dc2626); color:#fff; box-shadow:0 4px 14px rgba(220,38,38,0.3); }
          #_fbModalConfirm.del:hover  { box-shadow:0 8px 20px rgba(220,38,38,0.45); }
        `;
      document.head.appendChild(style);
      const overlay = document.createElement('div');
      overlay.id = '_fbModalOverlay';
      overlay.innerHTML = `
          <div id="_fbModalBox">
            <div id="_fbModalIcon"><i id="_fbModalIconI"></i></div>
            <div id="_fbModalTitle"></div>
            <div id="_fbModalMsg"></div>
            <div id="_fbModalMeta"></div>
            <div class="_fbModalBtns">
              <button id="_fbModalCancel" onclick="_fbModalClose()">
                <i class="fa-solid fa-xmark"></i> Cancel
              </button>
              <button id="_fbModalConfirm">Confirm</button>
            </div>
          </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) _fbModalClose(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') _fbModalClose(); });
    })();

    window._fbModalClose = function () {
      const ov = document.getElementById('_fbModalOverlay');
      if (ov) ov.classList.remove('show');
    };

    function _fbShowConfirm({ type, title, msg, meta, onConfirm }) {
      const ov = document.getElementById('_fbModalOverlay');
      const icon = document.getElementById('_fbModalIcon');
      const iconI = document.getElementById('_fbModalIconI');
      const tit = document.getElementById('_fbModalTitle');
      const msgEl = document.getElementById('_fbModalMsg');
      const metaEl = document.getElementById('_fbModalMeta');
      const conf = document.getElementById('_fbModalConfirm');
      icon.className = type; icon.id = '_fbModalIcon';
      iconI.className = type === 'done' ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation';
      tit.textContent = title;
      msgEl.innerHTML = msg;
      if (meta) { metaEl.innerHTML = meta; metaEl.classList.add('show'); }
      else { metaEl.innerHTML = ''; metaEl.classList.remove('show'); }
      conf.className = type; conf.id = '_fbModalConfirm';
      conf.innerHTML = type === 'done'
        ? '<i class="fa-solid fa-check"></i> Mark Done'
        : '<i class="fa-solid fa-trash-can"></i> Delete';
      conf.onclick = function () { _fbModalClose(); onConfirm(); };
      ov.classList.add('show');
    }

    let _fbAdminData = [];

    async function loadFeedbackAdmin() {
      const tbody = document.getElementById("fbAdminTableBody");
      if (!tbody) return;
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:20px;">Loading...</td></tr>';
      try {
        const res = await getData("getFeedback");
        _fbAdminData = Array.isArray(res) ? res : [];
        renderFeedbackAdmin(_fbAdminData);
        if (_fbAdminData.length === 0)
          tbody.innerHTML =
            '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:20px;">No feedback yet.<br><small style="font-size:11px;">Feedback from the Home page will appear here.</small></td></tr>';
      } catch (e) {
        tbody.innerHTML =
          '<tr><td colspan="8" style="text-align:center;color:#e74c3c;padding:20px;">Could not load feedback. Make sure FEEDBACK sheet exists.</td></tr>';
      }
    }

    function fbMarkResolved(rowIndex, btnEl) {
      const row = _fbAdminData.find(r => r.RowIndex === rowIndex) || {};
      _fbShowConfirm({
        type: 'done',
        title: 'Mark as Resolved?',
        msg: 'This will update the status to <strong>Resolved</strong> in your Google Sheet permanently.',
        meta: `👤 <span>${escapeHtml(row.Name || '—')}</span> &nbsp;·&nbsp; 💬 ${escapeHtml(row.Message || '—')}`,
        onConfirm: async function () {
          if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
          try {
            const res = await postData({ action: "updateFeedbackStatus", RowIndex: rowIndex, Status: "Resolved" });
            if (res && res.status === "updated") {
              toast("✅ Marked as Resolved!", "success");
              await loadFeedbackAdmin();
            } else {
              toast("Failed to update. Try again.", "error");
              if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fa-solid fa-check"></i> Done'; }
            }
          } catch (e) {
            toast("Network error. Try again.", "error");
            if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fa-solid fa-check"></i> Done'; }
          }
        }
      });
    }

    function fbDeleteRow(rowIndex, btnEl) {
      const row = _fbAdminData.find(r => r.RowIndex === rowIndex) || {};
      _fbShowConfirm({
        type: 'del',
        title: 'Delete Feedback?',
        msg: 'This will <strong>permanently remove</strong> this entry from your Google Sheet. This cannot be undone.',
        meta: `👤 <span>${escapeHtml(row.Name || '—')}</span> &nbsp;·&nbsp; 💬 ${escapeHtml(row.Message || '—')}`,
        onConfirm: async function () {
          if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
          try {
            const res = await postData({ action: "deleteFeedback", RowIndex: rowIndex });
            if (res && res.status === "deleted") {
              toast("🗑️ Feedback deleted!", "success");
              await loadFeedbackAdmin();
            } else {
              toast("Failed to delete. Try again.", "error");
              if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fa-solid fa-trash-can"></i> Del'; }
            }
          } catch (e) {
            toast("Network error. Try again.", "error");
            if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '<i class="fa-solid fa-trash-can"></i> Del'; }
          }
        }
      });
    }

    function renderFeedbackAdmin(list) {
      const tbody = document.getElementById("fbAdminTableBody");
      if (!tbody) return;
      if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:20px;">No entries found.</td></tr>';
        _buildPagination("fb_pagination", 1, 0, "_gotoFbPage");
        return;
      }
      window._fbList = list;
      window._fbPage = 1;
      _renderFbPaged();
    }

    function _gotoFbPage(p) {
      const total = Math.ceil((window._fbList || []).length / PAGE_SIZE);
      window._fbPage = Math.max(1, Math.min(p, total));
      _renderFbPaged();
    }

    function _renderFbPaged() {
      const tbody = document.getElementById("fbAdminTableBody");
      if (!tbody) return;
      const list = window._fbList || [];
      const page = window._fbPage || 1;
      const start = (page - 1) * PAGE_SIZE;
      const items = list.slice(start, start + PAGE_SIZE);
      const total = Math.ceil(list.length / PAGE_SIZE);
      let visibleIdx = start;
      tbody.innerHTML = items.map((row, idx) => {
        visibleIdx++;
        const ts = String(row.Timestamp || row[0] || '—');
        const name = String(row.Name || row[1] || '—');
        const mobile = String(row.Mobile || row[2] || '—');
        const address = String(row.Address || row[3] || '—');
        const message = String(row.Message || row[4] || '—');
        const status = String(row.Status || 'Pending');
        const rowIdx = row.RowIndex;
        const isDone = status === 'Resolved';
        const badge = isDone
          ? '<span style="background:#d1fae5;color:#065f46;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;">✓ Resolved</span>'
          : '<span style="background:#fef3c7;color:#92400e;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;">Pending</span>';
        return `<tr style="${isDone ? 'opacity:0.6;' : ''}">
            <td style="color:#888;">${visibleIdx}</td>
            <td style="font-size:12px;color:#888;font-family:monospace;">${escapeHtml(ts)}</td>
            <td style="font-weight:600;">${escapeHtml(name)}</td>
            <td>${escapeHtml(mobile)}</td>
            <td style="font-size:12px;color:#666;">${escapeHtml(address)}</td>
            <td style="font-size:12px;color:#333;white-space:normal;max-width:200px;">${escapeHtml(message)}</td>
            <td>${badge}</td>
            <td>
              <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
                ${!isDone ? `<button onclick="replyToFeedback(${rowIdx}, '${escapeHtml(name)}', '${escapeHtml(mobile)}')" style="background:#25d366;margin-right:4px;"><i class="fa-brands fa-whatsapp"></i> Reply</button>
              <button class="btn-sm" onclick="fbMarkResolved(${rowIdx}, this)"
                  style="background:#d1fae5;color:#065f46;border:1px solid #6ee7b7;border-radius:8px;padding:4px 9px;font-size:11px;cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;"><i class="fa-solid fa-check"></i> Done</button>` : ''}
                <button onclick="fbDeleteRow(${rowIdx}, this)"
                  style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;border-radius:8px;padding:4px 9px;font-size:11px;cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;"><i class="fa-solid fa-trash-can"></i> Del</button>
              </div>
            </td>
          </tr>`;
      }).join('');
      _buildPagination("fb_pagination", page, total, "_gotoFbPage");
    }

    function filterFeedbackAdmin() {
      const txt = (
        document.getElementById("fbAdminSearch")?.value || ""
      ).toLowerCase();
      if (!txt) {
        renderFeedbackAdmin(_fbAdminData);
        return;
      }
      const filtered = _fbAdminData.filter((r) =>
        [r.Name || r[1], r.Mobile || r[2], r.Message || r[4]].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(txt)
        )
      );
      window._fbList = filtered;
      window._fbPage = 1;
      _renderFbPaged();
    }
    /* debounced version — replaces inline onkeyup after DOM ready */
    var _filterFeedbackDebounced = debounce(filterFeedbackAdmin, 280);
    document.addEventListener("DOMContentLoaded", function () {
      var fbSrch = document.getElementById("fbAdminSearch");
      if (fbSrch) {
        fbSrch.removeAttribute("onkeyup");
        fbSrch.addEventListener("input", _filterFeedbackDebounced);
      }
    });

    // N5: init() is async — a bare try/catch does NOT catch Promise rejections.
    // _showLoadingError() inside init() handles errors correctly; this .catch()
    // is a last-resort safety net for any unhandled rejection that escapes it.
    init().catch(function(e) { console.warn('init() unhandled rejection:', e); });

    /* FIX #4: Header always stays visible (sticky), scroll-hide removed */
    /* No scroll-hide for admin header — menu stays accessible always */

    /* ═══ FIX 3: BROADCAST SESSION REVOKE TO OTHER TABS on load ═══ */