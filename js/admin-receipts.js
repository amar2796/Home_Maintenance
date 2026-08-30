    window._retryExpenseAsIs = _retryExpenseAsIs;

    /* ═══ EXPENSE RECEIPT ATTACHMENT ════════════════════════════════
 Opens a modal to manage multiple receipt photos for an expense.
 Supports upload, view and delete of individual photos.
 ═══════════════════════════════════════════════════════════════ */

    var _rcptB64 = null;  // base64 of selected image
    var _rcptFileName = "";    // filename for upload
    var _rcptExpId = null;  // which expense we are attaching to

    /* ── Convert a Google Drive URL to a reliable thumbnail src for <img> tags ──
       lh3.googleusercontent.com/d/FILE_ID can fail for newly-uploaded files.
       drive.google.com/thumbnail?id=FILE_ID&sz=w400 is always reliable.       ── */
    function _driveImgSrc(url) {
      if (!url) return "";
      // Already a thumbnail URL — return as-is
      if (url.includes("drive.google.com/thumbnail")) return url;
      // Extract file ID from lh3.googleusercontent.com/d/FILE_ID
      if (url.includes("lh3.googleusercontent.com/d/")) {
        const id = url.split("/d/")[1].split("?")[0].split("=")[0].trim();
        if (id) return "https://drive.google.com/thumbnail?id=" + id + "&sz=w400";
      }
      // Extract file ID from drive.google.com/uc?id=FILE_ID
      if (url.includes("drive.google.com/uc")) {
        const m = url.match(/[?&]id=([^&]+)/);
        if (m) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w400";
      }
      return url;
    }

    /* ═══════════════════════════════════════════════════════════
       SHARED MEMBER AVATAR HELPER (new)
       Used anywhere a member's name/detail is shown (Home status list,
       Dashboard table/cards/month-grid, Tracker grid, Requests table)
       so every avatar looks the same and shares ONE photo cache.
       Does NOT touch the Users-page avatar code — that already has its
       own working implementation and is left exactly as-is.
       Real photos are lazy-loaded via the EXISTING window._lazyLoadDriveImgs()
       + window._adminPhotoB64Cache mechanism, so a given member's photo is
       downloaded from Drive at most once per session no matter how many of
       these sections show it — every other section reads it from cache.
       ═══════════════════════════════════════════════════════════ */
    var _AVATAR_FALLBACK_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%230F766E'/%3E%3Ctext x='16' y='21' text-anchor='middle' fill='white' font-size='14' font-family='Arial'%3E%26%23128100%3B%3C/text%3E%3C/svg%3E";
    function _avatarHtml(u, size) {
      size = size || 26;
      var sizeStyle = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;background:#eee;flex-shrink:0;border:1.5px solid #e2e8f0;';
      if (!u || !u.PhotoURL) {
        return '<img src="' + _AVATAR_FALLBACK_SVG + '" style="' + sizeStyle + '" alt=""/>';
      }
      var thumb = _driveImgSrc(u.PhotoURL);
      return '<img data-rawphoto="' + escapeHtml(u.PhotoURL) + '" data-drivesrc="' + escapeHtml(thumb) + '" ' +
        'src="' + _AVATAR_FALLBACK_SVG + '" style="' + sizeStyle + '" ' +
        'onerror="this.onerror=null;this.src=\'' + _AVATAR_FALLBACK_SVG + '\';" alt=""/>';
    }

    /* ── Parse ReceiptURLs from expense object (JSON array or legacy single URL) ── */
    function _getReceiptUrls(e) {
      if (!e) return [];
      // New format: ReceiptURLs is a JSON array string e.g. '["url1","url2"]'
      if (e.ReceiptURLs) {
        try {
          const parsed = JSON.parse(e.ReceiptURLs);
          if (Array.isArray(parsed)) return parsed.filter(Boolean);
        } catch (ex) {
          if (String(e.ReceiptURLs).startsWith("http")) return [e.ReceiptURLs];
        }
      }
      // Legacy fallback: single ReceiptURL
      if (e.ReceiptURL && String(e.ReceiptURL).startsWith("http")) return [e.ReceiptURL];
      return [];
    }

    /* ── Open multi-receipt manager modal ── */
    function openReceiptAttach(expId) {
      const e = expenses.find(function (x) { return String(x.Id) === String(expId); });
      if (!e) return;
      _rcptExpId = expId;
      _rcptB64 = null;
      _rcptFileName = "";
      _renderReceiptModal(e);
    }

    function _renderReceiptModal(e) {
      const expId = String(e.Id);
      const urls = _getReceiptUrls(e);

      const photosHTML = urls.length === 0
        ? `<div style="text-align:center;padding:18px 0;color:#94a3b8;font-size:13px;">
        <i class="fa-solid fa-image" style="font-size:2rem;display:block;margin-bottom:8px;opacity:0.4;"></i>
        No receipts attached yet.
      </div>`
        : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-bottom:16px;">
        ${urls.map((url, i) => `
          <div style="position:relative;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#f8fafc;">
            <a href="${escapeHtml(url)}" target="_blank">
              <img src="${_driveImgSrc(url)}"
                style="width:100%;height:90px;object-fit:cover;display:block;"
                onerror="this.src='${_driveImgSrc(url)}&t='+Date.now();this.onerror=function(){this.parentElement.parentElement.style.opacity='0.5';this.style.display='none';};"/>
            </a>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 6px;background:#fff;border-top:1px solid #f1f5f9;">
              <span style="font-size:10px;color:#64748b;">Photo ${i + 1}</span>
              <button onclick="_deleteOneReceipt('${expId}','${escapeHtml(url)}')"
                style="background:#ef4444;border:none;border-radius:4px;color:#fff;
                  cursor:pointer;padding:2px 6px;font-size:11px;line-height:1.6;">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>`).join("")}
      </div>`;

      const html = `
    <div class="_mhdr">
      <h3><i class="fa-solid fa-paperclip" style="color:#27ae60;"></i>
        Receipt Photos ${urls.length > 0 ? '<span style="font-size:13px;font-weight:500;color:#94a3b8;margin-left:6px;">(' + urls.length + ' attached)</span>' : ""}
      </h3>
      <button class="_mcls" onclick="closeModal()">×</button>
    </div>
    <div class="_mbdy">
      <p style="font-size:12px;color:#64748b;margin:0 0 14px;line-height:1.6;">
        <b style="color:#334155;">${escapeHtml(e.Title || "Expense")}</b><br>
        ${APP.currency||"₹"}${fmt(e.Amount)} · ${escapeHtml(e.ForMonth || "")} ${escapeHtml(String(e.Year || ""))}
      </p>
      ${photosHTML}
      <div style="border-top:1px dashed #e2e8f0;padding-top:14px;margin-top:4px;">
        <label class="_fl" style="margin-bottom:6px;">Add another photo</label>
        <input type="file" id="rcpt_file" accept="image/*" multiple
          style="display:block;width:100%;padding:10px;border:1.5px dashed #e2e8f0;
            border-radius:8px;font-size:13px;cursor:pointer;background:#fafafa;margin-bottom:10px;box-sizing:border-box;"
          onchange="rcptPreviewSelected(this)"/>
        <div id="rcpt_preview_wrap" style="display:none;text-align:center;margin-bottom:10px;">
          <img id="rcpt_preview_img"
            style="max-width:100%;max-height:160px;border-radius:8px;
              border:1px solid #e2e8f0;object-fit:contain;"/>
          <p style="font-size:11px;color:#94a3b8;margin:4px 0 0;">Preview — tap Upload to save</p>
        </div>
        <div id="rcpt_msg" style="font-size:12px;min-height:16px;color:#ef4444;margin-bottom:4px;"></div>
      </div>
    </div>
    <div class="_mft">
      <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()">Close</button>
      <button class="_mbtn" id="rcpt_upload_btn" style="background:#27ae60;" disabled
        onclick="uploadExpenseReceipt('${expId}')">
        <i class="fa-solid fa-upload"></i> Upload Photo
      </button>
    </div>`;

      openModal(html, "500px");
    }

    /* Preview selected image before upload */
    function rcptPreviewSelected(input) {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        document.getElementById("rcpt_msg").textContent = "File too large. Please use an image under 8MB.";
        return;
      }
      _rcptFileName = "Receipt_" + _rcptExpId + "_" + Date.now() + "." + (file.name.split(".").pop() || "jpg");
      const reader = new FileReader();
      reader.onload = function (ev) {
        _rcptB64 = ev.target.result;
        const prev = document.getElementById("rcpt_preview_img");
        const wrap = document.getElementById("rcpt_preview_wrap");
        if (prev) prev.src = _rcptB64;
        if (wrap) wrap.style.display = "block";
        const btn = document.getElementById("rcpt_upload_btn");
        if (btn) btn.disabled = false;
        document.getElementById("rcpt_msg").textContent = "";
      };
      reader.readAsDataURL(file);
    }

    /* Upload photo → appends to ReceiptURLs array */
    async function uploadExpenseReceipt(expId) {
      if (!_rcptB64) {
        document.getElementById("rcpt_msg").textContent = "Please select a photo first.";
        return;
      }
      const btn = document.getElementById("rcpt_upload_btn");
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'; }

      try {
        const s = JSON.parse(localStorage.getItem("session") || "{}");
        const e = expenses.find(function (x) { return String(x.Id) === String(expId); });
        const existingUrls = _getReceiptUrls(e);

        const response = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "uploadExpenseReceipt",
            expenseId: expId,
            base64: _rcptB64,
            fileName: _rcptFileName,
            existingURLs: JSON.stringify(existingUrls),
            AdminName: s.name || "Admin",
            userId: s.userId || "",
            sessionToken: s.sessionToken || ""
          })
        });
        if (!response.ok) throw new Error("Server error: " + response.status);
        const res = await response.json();

        if (res.status === "success") {
          const idx = expenses.findIndex(function (x) { return String(x.Id) === String(expId); });
          if (idx !== -1) {
            expenses[idx].ReceiptURLs = res.receiptUrls;
            expenses[idx].ReceiptURL = res.receiptUrl; // keep legacy field too
          }
          toast("✅ Receipt photo uploaded.", "");
          renderExpenses();
          // Re-open modal to show updated photos
          const updatedExp = expenses.find(function (x) { return String(x.Id) === String(expId); });
          _rcptB64 = null; _rcptFileName = "";
          _renderReceiptModal(updatedExp);
        } else {
          document.getElementById("rcpt_msg").textContent = "Upload failed: " + (res.message || "Unknown error");
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload Photo'; }
        }
      } catch (err) {
        document.getElementById("rcpt_msg").textContent = "Error: " + err.message;
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload Photo'; }
      }
    }

    /* Delete one specific photo from the receipt list */
    async function _deleteOneReceipt(expId, urlToDelete) {
      confirmModal("Remove this receipt photo?", async function () {
        try {
          const s = JSON.parse(localStorage.getItem("session") || "{}");
          const res = await postData({
            action: "removeOneExpenseReceipt",
            Id: expId,
            ReceiptURL: urlToDelete,
            AdminName: s.name || "Admin"
          });
          if (res.status === "success") {
            const idx = expenses.findIndex(function (x) { return String(x.Id) === String(expId); });
            if (idx !== -1) {
              expenses[idx].ReceiptURLs = res.receiptUrls;
              expenses[idx].ReceiptURL = res.receiptUrl;
            }
            toast("Receipt photo removed.", "");
            renderExpenses();
            const updatedExp = expenses.find(function (x) { return String(x.Id) === String(expId); });
            _renderReceiptModal(updatedExp);
          } else {
            toast("❌ " + (res.message || "Failed to remove photo."), "error");
          }
        } catch (err) {
          toast("❌ " + err.message, "error");
        }
      });
    }

    /* Legacy: remove ALL receipts (kept for any existing references) */
    async function removeExpenseReceipt(expId) {
      const e = expenses.find(function (x) { return String(x.Id) === String(expId); });
      const urls = _getReceiptUrls(e);
      confirmModal("Remove all receipt photos from this expense?", async function () {
        try {
          const s = JSON.parse(localStorage.getItem("session") || "{}");
          const res = await postData({
            action: "removeAllExpenseReceipts",
            Id: expId,
            AdminName: s.name || "Admin",
            OldReceiptURLs: JSON.stringify(urls)
          });
          if (res.status === "success") {
            const idx = expenses.findIndex(function (x) { return String(x.Id) === String(expId); });
            if (idx !== -1) { expenses[idx].ReceiptURLs = "[]"; expenses[idx].ReceiptURL = ""; }
            closeModal();
            toast("All receipts removed.", "");
            renderExpenses();
          } else {
            toast("❌ " + (res.message || "Failed to remove receipts."), "error");
          }
        } catch (err) {
          toast("❌ " + err.message, "error");
        }
      });
    }

    async function deleteExpense(id) {
      if (!checkSession()) return;
      // Capture expense record before confirm so undo can restore it
      const _undoE = (typeof expenses !== "undefined") ? expenses.find(function(e){ return String(e.Id) === String(id); }) : null;
      const _expTitle  = _undoE ? escapeHtml(_undoE.Title || "Expense") : "Expense";
      const _expAmt    = _undoE ? "₹" + Number(_undoE.Amount||0).toLocaleString(APP.locale||"en-IN") : "";
      const _expMonth  = _undoE ? ((_undoE.ForMonth ? _undoE.ForMonth + " " : "") + (_undoE.Year || "")) : "";
      const _undoLabel = _expAmt ? (_expAmt + " — " + _expTitle) : _expTitle;
      const _undoSaved = _undoE ? JSON.parse(JSON.stringify(_undoE)) : null;

      // Rich confirm: show exactly what is being deleted
      const _detailHtml = _undoE
        ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin:0 0 4px;text-align:left;font-size:12.5px;color:#7f1d1d;">' +
          '<span style="font-weight:700;color:#dc2626;">' + _expTitle + '</span>' +
          (_expAmt    ? ' &nbsp;·&nbsp; <span style="color:#b91c1c;">' + _expAmt + '</span>' : '') +
          (_expMonth  ? ' &nbsp;·&nbsp; <span style="color:#9b1b1b;">' + _expMonth + '</span>' : '') +
          '</div>'
        : '';

      confirmModal(
        "Delete this expense?" + (_detailHtml ? '<br><br>' + _detailHtml : ''),
        async function() {
          try {
            const _s = JSON.parse(localStorage.getItem("session") || "{}");
            const res = await postData({ action: "deleteExpense", Id: id, AdminName: _s.name || "Admin", sessionToken: _s.sessionToken || "", userId: _s.userId || "" });
            if (res.status === "deleted" || res.status === "success") {
              smartRefresh("expenses");
              if (_undoSaved && typeof _showUndoToast === "function") {
                _showUndoToast(_undoLabel, function() {
                  var payload = Object.assign({ action: "addExpense" }, _undoSaved);
                  postData(payload).then(function() {
                    smartRefresh("expenses");
                    toast("↩ Expense restored.");
                  });
                });
              } else {
                toast("✅ Expense deleted.");
              }
            } else {
              toast("❌ Delete failed: " + (res.message || ""), "error");
            }
          } catch (err) {
            toast("❌ " + err.message, "error");
          }
        }
      );
    }

    // _confirmCorrectionEntry kept as no-op stub so _wrapFn spinner list doesn't break
    async function _confirmCorrectionEntry() {}
    async function addUser() {
      if (!checkSession()) return;
      let name   = document.getElementById("u_name").value.trim(),
          mobile = document.getElementById("u_mobile").value.trim(),
          email  = document.getElementById("u_email").value.trim(),
          role   = document.getElementById("u_role").value;
      // [DEFAULT-PWD] Password is no longer entered by admin — it is hardcoded
      // server-side as "JaiShreeRam". User is forced to change on first login.
      if (!name || !mobile || !email)
        return toast("Name, Mobile, and Email are required.", "error");
      if (!/^\d{10}$/.test(mobile))
        return toast("Mobile must be exactly 10 digits.", "error");
      try {
        // [FIX-DOB] <input type="date"> always gives yyyy-MM-dd.
        // Convert to dd-MM-yyyy before sending — same as saveEditUser uses _inputValToDob.
        let dob = _inputValToDob((document.getElementById("u_dob")?.value || "").trim());
        let contribStart = _inputValToDob((document.getElementById("u_contrib_start")?.value || "").trim());
        let res = await postData({
          action: "addUser",
          // [ID] UserId is now generated server-side (USER-NNNNN / ADMIN-NNNNN)
          // Do NOT send UserId from frontend — backend ignores it and generates its own
          // [DEFAULT-PWD] Password not sent — backend sets "JaiShreeRam" automatically
          Name:   name,
          Mobile: mobile,
          Email:  email,
          Role:   role,
          DOB:    dob,
          ContribStartDate: contribStart,
        });
        if (res.status === "error") toast("❌ " + res.message, "error");
        else {
          toast("✅ User added. Default password: JaiShreeRam");
          document.getElementById("u_name").value = "";
          document.getElementById("u_mobile").value = "";
          document.getElementById("u_email").value = "";
          const _dobEl = document.getElementById("u_dob");
          if (_dobEl) _dobEl.value = "";
          const _csEl = document.getElementById("u_contrib_start");
          if (_csEl) _csEl.value = "";
          smartRefresh("users");
        }
      } catch (err) {
        toast("❌ " + err.message, "error");
      }
    }
    async function deleteUser(id) {
      if (!checkSession()) return;
      const _u = users.find(u => String(u.UserId) === String(id));
      const _uName = _u ? `"${_u.Name}"` : "this user";
      const _undoSaved = _u ? JSON.parse(JSON.stringify(_u)) : null;
      confirmModal(`Delete ${_uName}? This cannot be undone.`, async () => {
        try {
          const _s = JSON.parse(localStorage.getItem("session") || "{}");
          let res = await postData({ action: "deleteUser", UserId: id, PhotoURL: _u?.PhotoURL || "", sessionToken: _s.sessionToken || "", userId: _s.userId || "" });
          if (res.status === "deleted") {
            // [UNDO-FIX] deleteUser now returns passwordHash so restoreUser can
            // write the exact original hash back. getAllData strips Password for
            // security so _undoSaved never has it without this step.
            if (res.passwordHash && _undoSaved) {
              _undoSaved.Password = res.passwordHash;
            }
            smartRefresh("users");
            if (_undoSaved && typeof _showUndoToast === "function") {
              _showUndoToast(_uName.replace(/"/g, ""), function() {
                // [UNDO-FIX 1] Use restoreUser — addUser always generates a new
                // UserId server-side and ignores whatever UserId is in the payload.
                // [UNDO-FIX 2] Session creds auto-injected by postData() from
                // localStorage — no need to manually add them here.
                // [UNDO-FIX 3] Password is stripped from getAllData response for
                // security (server deletes it before sending). Pass a sentinel so
                // the backend knows to look up and preserve the existing hash
                // from the backup rather than writing an empty password.
                var payload = Object.assign({}, _undoSaved, { action: "restoreUser" });
                postData(payload).then(function(r) {
                  if (r && r.status === "success") {
                    // [FIX] restoreUser is now in _CACHE_BUST_ON_WRITE so postData()
                    // auto-clears the getAllData cache. Bust manually too as a safety
                    // net, then smartRefresh fetches fresh from server.
                    if (typeof mandirCacheBust === "function") mandirCacheBust("getAllData");
                    smartRefresh("users");
                    setTimeout(function() {
                      if (typeof renderUsers === "function") renderUsers();
                    }, 400);
                    toast("↩ User restored.");
                  } else {
                    toast("❌ Restore failed: " + ((r && r.message) || "unknown error"), "error");
                  }
                }).catch(function(err) {
                  toast("❌ " + err.message, "error");
                });
              });
            } else {
              toast("✅ Deleted.");
            }
          } else {
            toast("❌ Failed.", "error");
          }
        } catch (err) {
          toast("❌ " + err.message, "error");
        }
      });
    }
    async function addType() {
      let v = document.getElementById("t_name").value.trim();
      if (!v) return;
      try {
        let r = await postData({ action: "addType", TypeName: v });
        toast(
          r.status === "success" ? "✅ Added." : "❌ Failed.",
          r.status === "success" ? "" : "error"
        );
        document.getElementById("t_name").value = "";
        smartRefresh("types");
      } catch (e) {
        toast("❌ " + e.message, "error");
      }
    }
    async function deleteType(id) {
      const _t = (types || []).find(t => String(t.TypeId) === String(id));
      const _undoLabel = _t ? (_t.TypeName || "Type") : "Type";
      const _undoSaved = _t ? JSON.parse(JSON.stringify(_t)) : null;
      confirmModal("Delete this contribution type?", async () => {
        try {
          let r = await postData({ action: "deleteType", TypeId: id });
          if (r.status === "deleted") {
            smartRefresh("types");
            if (_undoSaved && typeof _showUndoToast === "function") {
              _showUndoToast(_undoLabel, function() {
                postData({ action: "addType", TypeName: _undoSaved.TypeName }).then(function() {
                  smartRefresh("types");
                  toast("↩ Type restored.");
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
    async function addOccasion() {
      let v = document.getElementById("o_name").value.trim();
      if (!v) return;
      try {
        let r = await postData({ action: "addOccasion", OccasionName: v });
        toast(
          r.status === "success" ? "✅ Added." : "❌ Failed.",
          r.status === "success" ? "" : "error"
        );
        document.getElementById("o_name").value = "";
        smartRefresh("occasions");
      } catch (e) {
        toast("❌ " + e.message, "error");
      }
    }
    async function deleteOccasion(id) {
      const _o = (occasions || []).find(o => String(o.OccasionId) === String(id));
      const _undoLabel = _o ? (_o.OccasionName || "Occasion") : "Occasion";
      const _undoSaved = _o ? JSON.parse(JSON.stringify(_o)) : null;
      confirmModal("Delete this occasion?", async () => {
        try {
          let r = await postData({ action: "deleteOccasion", OccasionId: id });
          if (r.status === "deleted") {
            smartRefresh("occasions");
            if (_undoSaved && typeof _showUndoToast === "function") {
              _showUndoToast(_undoLabel, function() {
                postData({ action: "addOccasion", OccasionName: _undoSaved.OccasionName }).then(function() {
                  smartRefresh("occasions");
                  toast("↩ Occasion restored.");
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
    async function addExpenseType() {
      let v = document.getElementById("e_name").value.trim();
      if (!v) return;
      try {
        let r = await postData({ action: "addExpenseType", Name: v });
        toast(
          r.status === "success" ? "✅ Added." : "❌ Failed.",
          r.status === "success" ? "" : "error"
        );
        document.getElementById("e_name").value = "";
        smartRefresh("expenseTypes");
      } catch (e) {
        toast("❌ " + e.message, "error");
      }
    }
    async function deleteExpenseType(id) {
      const _et = (expenseTypes || []).find(e => String(e.ExpenseTypeId) === String(id));
      const _undoLabel = _et ? (_et.Name || "Expense Type") : "Expense Type";
      const _undoSaved = _et ? JSON.parse(JSON.stringify(_et)) : null;
      confirmModal("Delete this expense type?", async () => {
        try {
          let r = await postData({ action: "deleteExpenseType", ExpenseTypeId: id });
          if (r.status === "deleted") {
            smartRefresh("expenseTypes");
            if (_undoSaved && typeof _showUndoToast === "function") {
              _showUndoToast(_undoLabel, function() {
                postData({ action: "addExpenseType", Name: _undoSaved.Name }).then(function() {
                  smartRefresh("expenseTypes");
                  toast("↩ Expense type restored.");
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

    /* ── GOALS MANAGEMENT ── */
    let goals = [];
    window._goalStore = {};
    let _goalIdx = 0;
    function _storeGoalId(goalId) {
      const k = "g" + ++_goalIdx;
      window._goalStore[k] = String(goalId);
      return k;
    }

    function renderGoals() {
      window._goalList = goals;
      window._goalsPage = 1;
      _renderGoalsPaged();
    }

    function _gotoGoalsPage(p) {
      const total = Math.ceil((window._goalList || []).length / PAGE_SIZE);
      window._goalsPage = Math.max(1, Math.min(p, total));
      _renderGoalsPaged();
    }

    function _renderGoalsPaged() {
      const list = window._goalList || [];
      const page = window._goalsPage || 1;
      const start = (page - 1) * PAGE_SIZE;
      const items = list.slice(start, start + PAGE_SIZE);
      const total = Math.ceil(list.length / PAGE_SIZE);
      document.getElementById("goalTableBody").innerHTML =
        list.length === 0
          ? `<tr><td colspan="7" style="text-align:center;padding:36px 20px;">
              <div class="rt-empty-msg">
                <div style="font-size:2rem;margin-bottom:8px;">🎯</div>
                <div style="font-weight:600;color:#334155;font-size:14px;margin-bottom:4px;">No goals yet</div>
                <div style="color:#94a3b8;font-size:12px;margin-bottom:14px;">Set a fundraising target to track progress</div>
                <button onclick="document.getElementById('g_name').focus()" style="background:#0F766E;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;">
                  <i class="fa-solid fa-plus"></i> Add First Goal
                </button>
              </div>
            </td></tr>`
          : items
            .map((g, idx) => {
              const i = start + idx;
              let collected = Number(g.CurrentAmount || 0);
              let autoCalc = data.reduce((sum, c) => {
                let tName = (
                  types.find((x) => String(x.TypeId) === String(c.TypeId))
                    ?.TypeName || ""
                ).toLowerCase();
                let gName = (g.GoalName || "").toLowerCase();
                return (
                  sum +
                  (tName === gName ||
                    (c.Note || "").toLowerCase().includes(gName)
                    ? Number(c.Amount || 0)
                    : 0)
                );
              }, 0);
              let syncWarning =
                autoCalc > 0 && Math.abs(autoCalc - collected) > 1
                  ? `<span title="Auto-calculated from contributions: ${APP.currency||"₹"}${fmt(
                    autoCalc
                  )}" style="cursor:help;font-size:10px;color:#e67e22;margin-left:4px;">⚠️ Auto: ${APP.currency||"₹"}${fmt(
                    autoCalc
                  )}</span>`
                  : "";
              let pct =
                g.TargetAmount > 0
                  ? Math.min(
                    100,
                    Math.round((collected / Number(g.TargetAmount)) * 100)
                  )
                  : 0;
              let barColor =
                /* PREVIEW: red read as "something's wrong" for a goal
                   that's simply early-stage, not actually broken — a
                   fundraising goal at 20% isn't an error condition.
                   Now: gold while in progress (any %<100), green only
                   once actually complete. */
                pct >= 100 ? "#27ae60" : "#C8860D";
              let _gk = _storeGoalId(g.GoalId);
              return `<tr>
                <td>${i + 1}</td>
                <td><b>${escapeHtml(g.GoalName || "—")}</b></td>
                <td>₹ ${fmt(g.TargetAmount)}</td>
                <td class="amt-green">₹ ${fmt(collected)}${syncWarning}</td>
                <td style="min-width:120px;">
                  <div style="background:#eee;border-radius:10px;height:14px;overflow:hidden;">
                    <div class="goal-bar-fill" style="background:${barColor};width:${pct}%;height:100%;border-radius:10px;"></div>
                  </div>
                  <span style="font-size:10px;color:#888;">${pct}%</span>
                </td>
                <td><span class="badge ${g.Status === "Enabled" ? "badge-green" : "badge-red"
                }">${g.Status || "Disabled"}</span></td>
                <td onclick="event.stopPropagation()">
                  <div class="action-btns">
                    <button class="btn-sm" onclick="openEditGoal(_goalStore['${_gk}'])"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-sm btn-danger" onclick="deleteGoal(_goalStore['${_gk}'])"><i class="fa-solid fa-trash"></i></button>
                  </div>
                </td>
              </tr>`;
            })
            .join("");
      _buildPagination("goals_pagination", page, total, "_gotoGoalsPage");
    }

    /* ═══════════════════════════════════════════════════════════════
 EVENT MANAGEMENT — all functions self-contained
 Uses global: data, expenses, expenseTypes, MONTHS
 New globals: _events (array), _eventExpenses (array)
 ═══════════════════════════════════════════════════════════════ */
