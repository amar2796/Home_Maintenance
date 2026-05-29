// ── Storage keys derived from APP.shortName — change once in constants.js, updates everywhere
const _U_PREFIX  = ((typeof APP !== "undefined" && APP.shortName) ? APP.shortName.toLowerCase() : "mandir");
const _U_RMK     = _U_PREFIX + "_remember_token";   // remember-me token
const _U_DARK    = _U_PREFIX + "_user_dark";         // dark mode preference
const _U_LANG    = _U_PREFIX + "_lang";              // language preference

// ── Session guard — with Remember Me restore (H12)
(function () {
    let s = JSON.parse(localStorage.getItem("session") || "null");
    if (!s || Date.now() > s.expiry) {
      // Try remember-me token before redirecting to login
      try {
        const rt = JSON.parse(localStorage.getItem(_U_RMK) || "null");
        if (rt && rt.role === "User" && Date.now() < rt.expiry) {
          s = {
            userId: rt.userId, name: rt.name, role: rt.role, email: rt.email || "",
            sessionToken: rt.sessionToken || "", expiry: Date.now() + 30 * 60 * 1000
          };
          localStorage.setItem("session", JSON.stringify(s));
        } else {
          ["session",_U_RMK].forEach(k=>localStorage.removeItem(k)); history.replaceState(null, "", "login.html"); location.replace("login.html"); return;
        }
      } catch (e) { ["session",_U_RMK].forEach(k=>localStorage.removeItem(k)); history.replaceState(null, "", "login.html"); location.replace("login.html"); return; }
    }
    if (s.role !== "User") { location.replace("admin.html"); return; }
    s.expiry = Date.now() + 30 * 60 * 1000; localStorage.setItem("session", JSON.stringify(s));
    // ── Show name instantly from session — no API wait needed
    try {
      const nameEl = document.getElementById("hdr_name");
      const dropNameEl = document.getElementById("hdr_drop_name");
      if (nameEl && s.name) nameEl.innerText = s.name;
      if (dropNameEl && s.name) dropNameEl.innerText = s.name;
      if (s.name) {
        // hdr_photo already has src="Image/logo.PNG" from HTML — leave it (logo shows).
        // hdr_drop_photo starts as "data:," — set it to logo too so both are consistent.
        const av34 = document.getElementById("hdr_drop_photo");
        if (av34) av34.src = "Image/logo.PNG";
      }
    } catch(e) {}
  })();
  window.addEventListener("pageshow", () => {
    let s = JSON.parse(localStorage.getItem("session") || "null");
    if (!s || Date.now() > s.expiry || s.role !== "User") { ["session",_U_RMK].forEach(k=>localStorage.removeItem(k)); history.replaceState(null, "", "login.html"); location.replace("login.html"); }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { let s = JSON.parse(localStorage.getItem("session") || "null"); if (!s || Date.now() > s.expiry || s.role !== "User") { ["session",_U_RMK].forEach(k=>localStorage.removeItem(k)); history.replaceState(null, "", "login.html"); location.replace("login.html"); } }
  });


  // ── SESSION CACHE — avoids 27x repeated _sess()
  const _sCache = { v: null, t: 0 };
  function _sess() {
    const now = Date.now();
    if (_sCache.v && now - _sCache.t < 25000) return _sCache.v; // 25s cache
    try {
      _sCache.v = JSON.parse(localStorage.getItem("session") || "null");
      _sCache.t = now;
    } catch(e) { _sCache.v = null; }
    return _sCache.v;
  }
  function _sessInvalidate() { _sCache.v = null; _sCache.t = 0; }
  // Invalidate on storage changes from other tabs
  window.addEventListener("storage", function(e) {
    if (e.key === "session") _sessInvalidate();
  });

  // ── Device info collector (for audit logging — works on all mobile browsers)
  function _getDeviceInfo() {
    try {
      const ua = navigator.userAgent || "";
      let device = "Desktop";
      if (/Android/i.test(ua))          device = "Android";
      else if (/iPhone|iPad/i.test(ua)) device = "iOS";
      else if (/Mobile/i.test(ua))      device = "Mobile";
      let browser = "Unknown";
      if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = "Chrome";
      else if (/Firefox\//.test(ua))    browser = "Firefox";
      else if (/Edg\//.test(ua))        browser = "Edge";
      else if (/Safari\//.test(ua))     browser = "Safari";
      const tz   = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      const lang = navigator.language || "";
      const sw   = window.screen ? window.screen.width + "x" + window.screen.height : "";
      return device + " | " + browser + " | " + tz + " | " + lang + " | " + sw;
    } catch (e) { return ""; }
  }
  window._getDeviceInfo = _getDeviceInfo;

  function logout() {
    // Show immediate visual feedback
    (function() {
      var _lo = document.createElement('div');
      _lo.id = '_logoutOverlay';
      _lo.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(42,15,0,0.82);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
      _lo.innerHTML = '<div style="width:42px;height:42px;border:3px solid rgba(247,160,26,0.3);border-top-color:#f7a01a;border-radius:50%;animation:spin .7s linear infinite;"></div><div style="color:#f7a01a;font-family:sans-serif;font-size:14px;font-weight:600;letter-spacing:.5px;">Logging out…</div>';
      document.body.appendChild(_lo);
    })();
    // [FIX] postData is JSONP (async script tag). Must WAIT for clearSessionToken
    // to complete before wiping localStorage + redirecting — otherwise the page
    // unloads before JSONP fires and TokenExpiry is never cleared in the sheet.
    function _doRedirect() {
      try { localStorage.removeItem(_U_RMK); } catch (e) { }
      ["session",_U_RMK,_U_DARK,_U_LANG].forEach(k=>{try{localStorage.removeItem(k);}catch(e){}});
      sessionStorage.clear();
      history.replaceState(null, "", "login.html");
      location.replace("login.html");
    }
    try {
      var s = _sess();
      if (s && s.userId) {
        var devInfo = typeof window._getDeviceInfo === "function" ? window._getDeviceInfo() : "";
        // Audit log — fire-and-forget, do not await
        postData({ action: "logout", userId: s.userId, userName: s.name || "User",
                   deviceInfo: devInfo, logoutReason: "User clicked logout button" }).catch(function(){});
        // Clear server token FIRST, then redirect when done (or after 3s safety timeout)
        var _done = false;
        function _finish() { if (_done) return; _done = true; _doRedirect(); }
        postData({
          action:       "clearSessionToken",
          userId:       s.userId,
          sessionToken: s.sessionToken || "",
          reason:       "User clicked logout button"
        }).then(function() { _finish(); }).catch(function() { _finish(); });
        // Safety net: redirect after 1.5s even if postData never resolves (reduced from 3s)
        setTimeout(_finish, 1500);
        return; // _doRedirect called by _finish above
      }
    } catch (e) { }
    _doRedirect(); // no session — redirect immediately
  }

  function toggleUserDropdown() {
    const dd = document.getElementById("userDropdown");
    const isOpen = dd.classList.toggle("open");
    const avatar = document.getElementById("hdr_photo");
    if (avatar) avatar.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
  function closeDropdown() {
    document.getElementById("userDropdown").classList.remove("open");
    const avatar = document.getElementById("hdr_photo");
    if (avatar) avatar.setAttribute("aria-expanded", "false");
  }
  document.addEventListener("click", (e) => { if (!e.target.closest(".hdr-avatar-wrap")) closeDropdown(); });

  let users = [], types = [], occasions = [], data = [], allContributions = [], allGoals = [];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // Use PAYMENT_MODES from constants.js if loaded; fall back to local copy so the
  // payment modal always has values even if constants.js is updated independently.
  const PAYMENT_MODES = (typeof window.PAYMENT_MODES !== "undefined" ? window.PAYMENT_MODES : ["UPI", "Cash", "Bank Transfer", "Cheque"]);

  function _fixDrivePhotoUrl(url) {
    if (!url) return "";
    const s = String(url).trim();
    let fileId = "";
    // Extract file ID from any known Drive URL format
    if (s.includes("drive.google.com/thumbnail")) {
      const m = s.match(/[?&]id=([^&]+)/); if (m) fileId = m[1].trim();
    } else if (s.includes("drive.google.com/uc")) {
      const m = s.match(/[?&]id=([^&]+)/); if (m) fileId = m[1].trim();
    } else if (s.includes("lh3.googleusercontent.com/d/")) {
      fileId = s.split("/d/")[1].split("?")[0].split("=")[0].trim();
    } else if (s.includes("drive.google.com/file/d/")) {
      fileId = s.split("/file/d/")[1].split("/")[0].split("?")[0].trim();
    }
    // drive.google.com/thumbnail avoids OpaqueResponseBlocking caused by lh3.googleusercontent.com
    if (fileId) return "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w400";
    return s;
  }

  // ── Extract raw Drive file ID from any Drive URL format ──────────────────
  function _extractDriveFileId(url) {
    if (!url) return "";
    const s = String(url).trim();
    if (s.includes("drive.google.com/thumbnail")) {
      const m = s.match(/[?&]id=([^&]+)/); if (m) return m[1].trim();
    } else if (s.includes("drive.google.com/uc")) {
      const m = s.match(/[?&]id=([^&]+)/); if (m) return m[1].trim();
    } else if (s.includes("lh3.googleusercontent.com/d/")) {
      return s.split("/d/")[1].split("?")[0].split("=")[0].trim();
    } else if (s.includes("drive.google.com/file/d/")) {
      return s.split("/file/d/")[1].split("/")[0].split("?")[0].trim();
    }
    return "";
  }

  // ── Fetch Drive photo as base64 via Apps Script proxy (solves CORS block) ─
  // Caches per PhotoURL so repeated calls (header + ID card) cost only 1 request
  // Max 10 entries — FIFO eviction to prevent unbounded heap growth
  window._photoB64Cache = {};
  window._photoB64CacheKeys = [];
  async function _fetchPhotoBase64(photoURL) {
    if (!photoURL) return null;
    if (window._photoB64Cache[photoURL]) return window._photoB64Cache[photoURL];
    const fileId = _extractDriveFileId(photoURL);
    if (!fileId) return null;
    try {
      const _s = JSON.parse(localStorage.getItem("session") || "null");
      const res = await postData({ action: "getPhotoBase64", fileId: fileId, userId: _s?.userId || "", sessionToken: _s?.sessionToken || "" });
      if (res && res.status === "success" && res.base64) {
        // Evict oldest entry if cache is full
        if (window._photoB64CacheKeys.length >= 10) {
          var oldest = window._photoB64CacheKeys.shift();
          delete window._photoB64Cache[oldest];
        }
        window._photoB64Cache[photoURL] = res.base64;
        window._photoB64CacheKeys.push(photoURL);
        return res.base64;
      }
    } catch (e) { /* fall through — initials will show */ }
    return null;
  }

  // ── Smooth photo load: show initials instantly, fade in real photo when ready
  function _loadPhotoSmooth(imgEl, photoUrl, name, size) {
    const initials = _initialsAvatar(name, size);
    imgEl.src = initials; // instant placeholder
    imgEl.style.opacity = "1";
    if (!photoUrl) return;
    const tmp = new Image();
    tmp.onload = function() {
      imgEl.style.transition = "opacity 0.35s ease";
      imgEl.style.opacity = "0";
      setTimeout(function() {
        imgEl.src = photoUrl;
        imgEl.style.opacity = "1";
      }, 160);
    };
    tmp.onerror = function() { /* keep initials avatar — already set */ };
    tmp.src = photoUrl;
  }

  function updateHeader(myProfile, s) {
    const name = myProfile?.Name || s.name;
    document.getElementById("hdr_name").innerText = name;
    document.getElementById("hdr_drop_name").innerText = name;
    const roleEl = document.getElementById("hdr_drop_role");
    if (roleEl) roleEl.textContent = myProfile?.Role || s.role || "Member";
    // Show logo instantly as placeholder, then fade in real photo if user has one.
    // If no PhotoURL (or photo fails to load) → logo stays. Never show initials/alphabet here.
    const hdrPhoto = document.getElementById("hdr_photo");
    const dropPhoto = document.getElementById("hdr_drop_photo");
    const LOGO_SRC = "Image/logo.PNG";
    if (hdrPhoto) hdrPhoto.src = LOGO_SRC;
    if (dropPhoto) dropPhoto.src = LOGO_SRC;
    const rawUrl = myProfile?.PhotoURL || s.photoURL || "";
    if (rawUrl) {
      _fetchPhotoBase64(rawUrl).then(function(b64) {
        if (!b64) return; // keep logo on failure
        if (hdrPhoto) {
          hdrPhoto.style.transition = "opacity 0.35s ease";
          hdrPhoto.style.opacity = "0";
          setTimeout(function() { hdrPhoto.src = b64; hdrPhoto.style.opacity = "1"; }, 160);
        }
        if (dropPhoto) {
          dropPhoto.style.transition = "opacity 0.35s ease";
          dropPhoto.style.opacity = "0";
          setTimeout(function() { dropPhoto.src = b64; dropPhoto.style.opacity = "1"; }, 160);
        }
      });
    }
  }

  let _pendingCroppedB64 = "";

  function openMyProfile() {
    let s = _sess();
    if (!s) { toast("Session expired. Please log in again.", "error"); return; }
    let myProfile = users.find(u => String(u.UserId) === String(s.userId));
    if (!myProfile) { toast("Profile data not loaded yet.", "warn"); return; }
    // Use initials as placeholder; real photo loads via proxy after modal opens
    const _profName = myProfile.Name || s.name || "?";
    let photoSrc = _initialsAvatar(_profName, 82);
    let fb = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='88' height='88'><circle cx='44' cy='44' r='44' fill='%23f7a01a'/><text x='44' y='56' text-anchor='middle' fill='white' font-size='36' font-family='Arial'>&#128100;</text></svg>";
    let st = String(myProfile.Status || "Active");
    let stC = st.toLowerCase() === "active" ? "#22c55e" : st.toLowerCase() === "pending" ? "#f59e0b" : "#ef4444";
    let html = `
        <div class="_mhdr" style="background:linear-gradient(135deg,#2a0f00 0%,#3c1a00 60%,#2a0f00 100%);border-bottom:2px solid rgba(247,160,26,0.35);"><h3 style="color:#fff;display:flex;align-items:center;gap:8px;"><span class="_u-icon-md"><i class="fa-solid fa-id-card" style="color:#f7a01a;font-size:13px;"></i></span> My Profile</h3><button class="_mcls" onclick="closeModal()" style="color:rgba(255,255,255,0.6);font-size:20px;line-height:1;background:none;border:none;cursor:pointer;padding:0;">×</button></div>
        <div class="_mbdy" style="padding:0;">
          <div style="background:linear-gradient(180deg,#2a0f00 0%,#3c1a00 60%,#2a0f00 100%);padding:26px 20px 20px;text-align:center;position:relative;overflow:hidden;">
            <div style="position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:radial-gradient(circle,rgba(247,160,26,0.15),transparent 70%);border-radius:50%;pointer-events:none;"></div>
            <div style="position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(247,160,26,0.4),transparent);"></div>
            <img id="_profileModalPhoto" src="${escapeHtml(photoSrc)}" onerror="this.src='${fb}'"
              style="width:82px;height:82px;border-radius:50%;object-fit:cover;border:3px solid #f7a01a;background:#eee;display:block;margin:0 auto 10px;box-shadow:0 4px 20px rgba(247,160,26,0.45);"/>
            <div style="font-family:'Sora',sans-serif;color:#f7a01a;font-size:1.05rem;font-weight:700;margin-bottom:8px;">${escapeHtml(myProfile.Name || "—")}</div>
            <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
              <span style="background:${stC};color:#fff;border-radius:20px;padding:3px 14px;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.2);">${escapeHtml(st)}</span>
              <span style="background:rgba(255,255,255,.1);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:3px 14px;font-size:11px;font-weight:600;">${escapeHtml(myProfile.Role || "User")}</span>
            </div>
          </div>
          <div style="padding:10px 20px 16px;background:var(--white);">
            <div class="_row" style="border-bottom:1px solid rgba(247,160,26,0.12);display:flex;align-items:center;justify-content:space-between;gap:8px;"><span class="_rl" class="_u-meta-ns"><span class="_u-icon-sm"><i class="fa-solid fa-mobile-screen" class="_u-gold-icon"></i></span> Mobile</span><span class="_rv" style="font-weight:600;color:#1e293b;">${escapeHtml(String(myProfile.Mobile || "—"))}</span></div>
            <div class="_row" style="border-bottom:1px solid rgba(247,160,26,0.12);display:flex;align-items:center;justify-content:space-between;gap:8px;"><span class="_rl" class="_u-meta-ns"><span class="_u-icon-sm"><i class="fa-solid fa-envelope" class="_u-gold-icon"></i></span> Email</span><span class="_rv" style="word-break:break-all;font-weight:600;color:#1e293b;">${escapeHtml(myProfile.Email || "—")}</span></div>
            ${myProfile.Village ? `<div class="_row" style="border-bottom:1px solid rgba(247,160,26,0.12);display:flex;align-items:center;justify-content:space-between;gap:8px;"><span class="_rl" class="_u-meta-ns"><span class="_u-icon-sm"><i class="fa-solid fa-map-pin" class="_u-gold-icon"></i></span> Village</span><span class="_rv" style="font-weight:600;color:#1e293b;">${escapeHtml(myProfile.Village)}</span></div>` : ""}
            ${myProfile.Address ? `<div class="_row" style="border-bottom:1px solid rgba(247,160,26,0.12);display:flex;align-items:center;justify-content:space-between;gap:8px;"><span class="_rl" class="_u-meta-ns"><span class="_u-icon-sm"><i class="fa-solid fa-location-dot" class="_u-gold-icon"></i></span> Address</span><span class="_rv" style="white-space:pre-wrap;font-weight:600;color:#1e293b;">${escapeHtml(myProfile.Address)}</span></div>` : ""}
            ${myProfile.DOB ? `<div class="_row" style="border-bottom:1px solid rgba(247,160,26,0.12);display:flex;align-items:center;justify-content:space-between;gap:8px;"><span class="_rl" class="_u-meta-ns"><span class="_u-icon-sm"><i class="fa-solid fa-cake-candles" class="_u-gold-icon"></i></span> Date of Birth</span><span class="_rv" style="font-weight:600;color:#1e293b;white-space:nowrap;">${(function(d){if(!d)return"—";var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];if(/^\d{2}-\d{2}-\d{4}$/.test(d)){var p=d.split("-");return p[0]+" "+M[parseInt(p[1],10)-1]+" "+p[2];}if(/^\d{4}-\d{2}-\d{2}$/.test(d)){var p=d.split("-");return p[2]+" "+M[parseInt(p[1],10)-1]+" "+p[0];}if(d.indexOf("T")>=0||d.indexOf("Z")>=0){var pt=d.split("T")[0].split("-");if(pt.length===3)return pt[2]+" "+M[parseInt(pt[1],10)-1]+" "+pt[0];}return d;})(myProfile.DOB)}</span></div>` : ""}
            <div class="_row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><span class="_rl" class="_u-meta-ns"><span class="_u-icon-sm"><i class="fa-solid fa-id-card" class="_u-gold-icon"></i></span> Member ID</span><span class="_rv" style="font-family:monospace;font-size:12px;font-weight:700;color:#3c1a00;letter-spacing:.5px;">${escapeHtml(String(myProfile.UserId || "—"))}</span></div>
          </div>
        </div>
            <div class="_mft" style="gap:8px;border-top:2px solid rgba(247,160,26,0.15);background:linear-gradient(90deg,rgba(247,160,26,0.04),transparent);">
    <button class="_mbtn" style="background:#64748b;box-shadow:none;" onclick="closeModal()">
      <i class="fa-solid fa-xmark"></i> Close
    </button>
    <button class="_mbtn" style="background:linear-gradient(135deg,#2a0f00,#3c1a00);box-shadow:0 3px 10px rgba(42,15,0,0.3);" onclick="closeModal();openChangePassword()">
      <i class="fa-solid fa-key" style="color:#f7a01a;"></i> Change Password
    </button>
    <button class="_mbtn" style="background:linear-gradient(135deg,#f7a01a,#e8920a);box-shadow:0 3px 10px rgba(247,160,26,0.35);" onclick="closeModal();openEditProfile()">
      <i class="fa-solid fa-user-pen"></i> Edit Profile
    </button>
  </div>`;
    openModal(html, "min(460px, 96vw)");
    // Load real photo via proxy after modal is in DOM
    if (myProfile.PhotoURL) {
      _fetchPhotoBase64(myProfile.PhotoURL).then(function(b64) {
        const imgEl = document.getElementById("_profileModalPhoto");
        if (imgEl && b64) {
          imgEl.style.transition = "opacity 0.35s ease";
          imgEl.style.opacity = "0";
          setTimeout(function() { imgEl.src = b64; imgEl.style.opacity = "1"; }, 160);
        }
      });
    }
  }

  function toggleProfilePassword() {
    let val = document.getElementById("_pwdVal"), btn = document.getElementById("_pwdToggle");
    if (!val || !btn) return;
    if (btn.textContent === "Show") { val.textContent = window._myProfilePwdHash || "(not available)"; val.style.color = "#334155"; val.style.letterSpacing = "0.5px"; btn.textContent = "Hide"; btn.style.background = "#fff3e0"; btn.style.borderColor = "#f7a01a"; btn.style.color = "#c0580a"; }
    else { val.textContent = "••••••••"; val.style.color = "#94a3b8"; val.style.letterSpacing = "1px"; btn.textContent = "Show"; btn.style.background = "none"; btn.style.borderColor = "#ddd"; btn.style.color = "#666"; }
  }

  function openEditProfile(previewB64, prefillName, prefillEmail, prefillVillage, prefillAddress, prefillDob) {
    let s = _sess();
    if (!s) { toast("Session expired. Please log in again.", "error"); return; }
    let myProfile = users.find(u => String(u.UserId) === String(s.userId));
    let dN = prefillName    !== undefined ? prefillName    : myProfile?.Name    || s.name || "";
    let dE = prefillEmail   !== undefined ? prefillEmail   : myProfile?.Email   || s.email || "";
    let dV = prefillVillage !== undefined ? prefillVillage : myProfile?.Village || "";
    let dA = prefillAddress !== undefined ? prefillAddress : myProfile?.Address || "";
    // DOB may be ISO (2026-04-14T18:30:00.000Z), DD-MM-YYYY, or YYYY-MM-DD; normalise to YYYY-MM-DD for <input type="date">
    let rawDob = prefillDob !== undefined ? prefillDob : (myProfile?.DOB || "");
    let dDob = "";
    if (rawDob) {
      if (/^\d{2}-\d{2}-\d{4}$/.test(rawDob)) {
        const p = rawDob.split("-"); dDob = p[2] + "-" + p[1] + "-" + p[0]; // DD-MM-YYYY → YYYY-MM-DD
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDob)) {
        dDob = rawDob; // already YYYY-MM-DD
      } else if (rawDob.includes("T") || rawDob.includes("Z")) {
        // ISO 8601 — use UTC date parts to avoid timezone shift
        const _dp = rawDob.split("T")[0]; if (/^\d{4}-\d{2}-\d{2}$/.test(_dp)) dDob = _dp;
      }
    }
    // Use initials as placeholder; load real photo via proxy (same as header)
    let photoSrc = previewB64 || _initialsAvatar(dN || "?", 88);
    let fb = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='88' height='88'><circle cx='44' cy='44' r='44' fill='%23f7a01a'/><text x='44' y='56' text-anchor='middle' fill='white' font-size='36' font-family='Arial'>&#128100;</text></svg>";
    let html = `
        <div class="_mhdr" style="background:linear-gradient(135deg,#2a0f00 0%,#3c1a00 60%,#2a0f00 100%);border-bottom:2px solid rgba(247,160,26,0.35);"><h3 style="color:#fff;display:flex;align-items:center;gap:8px;"><span class="_u-icon-md"><i class="fa-solid fa-user-pen" style="color:#f7a01a;font-size:13px;"></i></span> Edit Profile</h3><button class="_mcls" onclick="closeModal()" style="color:rgba(255,255,255,0.6);font-size:20px;line-height:1;background:none;border:none;cursor:pointer;padding:0;">×</button></div>
        <div class="_mbdy" style="padding:0;">

          <!-- Hero banner — matches My Profile exactly -->
          <div style="background:linear-gradient(180deg,#2a0f00 0%,#3c1a00 60%,#2a0f00 100%);padding:22px 20px 18px;text-align:center;position:relative;overflow:hidden;">
            <div style="position:absolute;top:-40px;right:-40px;width:160px;height:160px;background:radial-gradient(circle,rgba(247,160,26,0.15),transparent 70%);border-radius:50%;pointer-events:none;"></div>
            <div style="position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(247,160,26,0.4),transparent);"></div>
            <div style="position:relative;width:82px;margin:0 auto 8px;">
              <img id="photoPreview" src="${escapeHtml(photoSrc)}" onerror="this.src='${fb}'"
                style="width:82px;height:82px;border-radius:50%;object-fit:cover;border:3px solid #f7a01a;background:#eee;display:block;box-shadow:0 4px 20px rgba(247,160,26,0.45);"/>
              <div onclick="pickPhoto()" title="Change Photo"
                style="position:absolute;bottom:2px;right:2px;width:26px;height:26px;background:#f7a01a;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);border:2px solid #fff;">
                <i class="fa-solid fa-camera" style="color:#fff;font-size:10px;"></i>
              </div>
            </div>
            <div style="font-size:11px;color:rgba(247,160,26,0.65);margin:0;">Tap camera to change photo</div>
          </div>
          <input type="file" id="photoFile" accept="image/*" style="display:none;" onchange="handlePhotoSelected(this)"/>

          <!-- Editable rows — same _row style as My Profile -->
          <div style="padding:6px 20px 14px;background:var(--white);">

            <!-- Full Name -->
            <div class="_row" style="border-bottom:1px solid rgba(247,160,26,0.12);align-items:center;">
              <span class="_rl" class="_u-meta">
                <span class="_u-icon-sm">
                  <i class="fa-solid fa-user" class="_u-gold-icon"></i>
                </span> Full Name
              </span>
              <input id="ep_name" value="${escapeHtml(dN)}" placeholder="Your name"
                style="border:none;outline:none;background:transparent;font-size:13px;font-weight:600;color:var(--ink);text-align:left;width:100%;min-width:0;font-family:var(--font-b);padding:0;"/>
            </div>

            <!-- Email -->
            <div class="_row" style="border-bottom:1px solid rgba(247,160,26,0.12);align-items:center;">
              <span class="_rl" class="_u-meta">
                <span class="_u-icon-sm">
                  <i class="fa-solid fa-envelope" class="_u-gold-icon"></i>
                </span> Email
              </span>
              <input id="ep_email" type="email" value="${escapeHtml(dE)}" placeholder="your@email.com"
                style="border:none;outline:none;background:transparent;font-size:13px;font-weight:600;color:var(--ink);text-align:left;width:100%;min-width:0;font-family:var(--font-b);padding:0;"/>
            </div>

            <!-- Mobile (read-only with update link) -->
            <div class="_row" style="border-bottom:1px solid rgba(247,160,26,0.12);align-items:center;">
              <span class="_rl" class="_u-meta">
                <span class="_u-icon-sm">
                  <i class="fa-solid fa-mobile-screen" class="_u-gold-icon"></i>
                </span> Mobile
              </span>
              <div style="display:flex;align-items:center;gap:8px;justify-content:flex-start;flex:1;min-width:0;">
                <span style="font-size:13px;font-weight:600;color:var(--ink);letter-spacing:.5px;">${escapeHtml(String(myProfile?.Mobile || "—"))}</span>
                <span onclick="openUpdateMobileConfirm()" style="color:#3b82f6;font-size:11px;font-weight:600;cursor:pointer;text-decoration:underline;white-space:nowrap;flex-shrink:0;">
                  <i class="fa-solid fa-pen-to-square" style="font-size:10px;margin-right:2px;"></i>Update
                </span>
              </div>
            </div>

            <!-- Village -->
            <div class="_row" style="border-bottom:1px solid rgba(247,160,26,0.12);align-items:center;">
              <span class="_rl" class="_u-meta">
                <span class="_u-icon-sm">
                  <i class="fa-solid fa-map-pin" class="_u-gold-icon"></i>
                </span> Village
              </span>
              <input id="ep_village" value="${escapeHtml(dV)}" placeholder="Village name"
                style="border:none;outline:none;background:transparent;font-size:13px;font-weight:600;color:var(--ink);text-align:left;width:100%;min-width:0;font-family:var(--font-b);padding:0;"/>
            </div>

            <!-- Address -->
            <div class="_row" style="border-bottom:1px solid rgba(247,160,26,0.12);align-items:flex-start;padding-top:11px;padding-bottom:11px;">
              <span class="_rl" style="color:#64748b;font-size:12.5px;display:flex;align-items:center;gap:7px;flex-shrink:0;margin-top:1px;">
                <span class="_u-icon-sm">
                  <i class="fa-solid fa-location-dot" class="_u-gold-icon"></i>
                </span> Address
              </span>
              <textarea id="ep_address" rows="2" placeholder="Full address"
                style="border:none;outline:none;background:transparent;font-size:13px;font-weight:600;color:var(--ink);text-align:left;width:100%;min-width:0;font-family:var(--font-b);padding:0;resize:none;line-height:1.5;">${escapeHtml(dA)}</textarea>
            </div>

            <!-- Date of Birth -->
            <div class="_row" style="border-bottom:1px solid rgba(247,160,26,0.12);align-items:center;position:relative;overflow:hidden;">
              <span class="_rl" class="_u-meta">
                <span class="_u-icon-sm">
                  <i class="fa-solid fa-cake-candles" class="_u-gold-icon"></i>
                </span> Date of Birth
              </span>
              <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;flex:1;pointer-events:none;">
                <span id="ep_dob_display" style="font-size:13px;font-weight:600;color:var(--ink);font-family:var(--font-b);white-space:nowrap;">${dDob ? (function(v){var p=v.split('-');var m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return p[2]+' '+m[parseInt(p[1],10)-1]+' '+p[0];})(dDob) : 'Select date'}</span>
                <i class="fa-solid fa-calendar-days" style="color:var(--gold,#f7a01a);font-size:13px;flex-shrink:0;"></i>
              </div>
              <input id="ep_dob" type="date" value="${escapeHtml(dDob)}" max="${new Date().toISOString().slice(0,10)}"
                style="position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;z-index:10;font-size:16px;"
                onchange="(function(v){if(!v)return;var p=v.split('-');var m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];document.getElementById('ep_dob_display').textContent=p[2]+' '+m[parseInt(p[1],10)-1]+' '+p[0];})(this.value)"/>
            </div>

            <!-- Password -->
            <div class="_row" style="align-items:center;">
              <span class="_rl" class="_u-meta">
                <span class="_u-icon-sm">
                  <i class="fa-solid fa-lock" class="_u-gold-icon"></i>
                </span> Password
              </span>
              <div style="display:flex;align-items:center;gap:8px;justify-content:flex-start;flex:1;">
                <span style="color:#aaa;letter-spacing:2px;font-size:13px;">••••••••</span>
                <span onclick="closeModal();openChangePassword()" style="color:#3b82f6;font-size:11px;font-weight:600;cursor:pointer;text-decoration:underline;white-space:nowrap;flex-shrink:0;">
                  <i class="fa-solid fa-key" style="font-size:10px;margin-right:2px;"></i>Change
                </span>
              </div>
            </div>

          </div>
        </div>
        <div class="_mft" style="border-top:2px solid rgba(247,160,26,0.15);background:linear-gradient(90deg,rgba(247,160,26,0.04),transparent);">
          <button class="_mbtn" style="background:#64748b;box-shadow:none;" onclick="closeModal();_pendingCroppedB64='';">Cancel</button>
          <button class="_mbtn" style="background:linear-gradient(135deg,#f7a01a,#e8920a);box-shadow:0 3px 10px rgba(247,160,26,0.35);" onclick="saveProfile()"><i class="fa-solid fa-check"></i> Save Changes</button>
        </div>`;
    openModal(html, "min(460px, 96vw)");
    // Load real photo via proxy after modal opens (avoids CORS block)
    if (!previewB64 && myProfile?.PhotoURL) {
      _fetchPhotoBase64(myProfile.PhotoURL).then(function(b64) {
        const imgEl = document.getElementById("photoPreview");
        if (imgEl && b64) {
          imgEl.style.transition = "opacity 0.35s ease";
          imgEl.style.opacity = "0";
          setTimeout(function() { imgEl.src = b64; imgEl.style.opacity = "1"; }, 160);
        }
      });
    }
  }

  function pickPhoto() { let f = document.getElementById("photoFile"); if (f) f.click(); }

  function handlePhotoSelected(input) {
    let file = input.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast("Photo must be under 5MB.", "error"); return; }
    let sN = document.getElementById("ep_name")?.value || "", sE = document.getElementById("ep_email")?.value || "", sV = document.getElementById("ep_village")?.value || "", sA = document.getElementById("ep_address")?.value || "", sDob = document.getElementById("ep_dob")?.value || "";
    openCropModal(file, function (b64) { _pendingCroppedB64 = b64; openEditProfile(b64, sN, sE, sV, sA, sDob); });
  }

  // M16: Mobile OTP verification flow — 3-step: Confirm → OTP → New Number
  let _mobileOtpPending = null;
  let _mobileOtpVerified = false;

  // STEP 1: Show confirmation popup before doing anything
  function openUpdateMobileConfirm() {
    // Close the Edit Profile modal first so it doesn't show behind/below
    closeModal();

    // Remove any existing mobile popup
    const existing = document.getElementById("_mobileConfirmOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "_mobileConfirmOverlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;";
    overlay.innerHTML = `
        <div style="background:var(--white);border-radius:18px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;animation:dropFade .2s ease;">

          <!-- HEADER — warm brown gradient matching hero -->
          <div style="background:linear-gradient(135deg,#2a0f00 0%,#3c1a00 60%,#2a0f00 100%);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid rgba(247,160,26,0.35);">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="width:32px;height:32px;background:rgba(247,160,26,0.18);border-radius:9px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid fa-mobile-screen-button" style="color:#f7a01a;font-size:14px;"></i>
              </span>
              <span style="font-family:var(--font-h);font-weight:700;font-size:15px;color:#fff;">Update Mobile Number</span>
            </div>
            <button onclick="document.getElementById('_mobileConfirmOverlay').remove()" style="background:rgba(255,255,255,0.1);border:none;color:rgba(255,255,255,0.7);width:28px;height:28px;border-radius:7px;cursor:pointer;font-size:16px;line-height:1;display:flex;align-items:center;justify-content:center;box-shadow:none;padding:0;">×</button>
          </div>

          <!-- BODY -->
          <div style="padding:20px 20px 16px;">

            <!-- Verification info card -->
            <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:16px;background:var(--bg);border:1.5px solid rgba(247,160,26,0.22);border-radius:10px;padding:12px 14px;">
              <div style="width:36px;height:36px;background:rgba(247,160,26,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">
                <i class="fa-solid fa-shield-halved" style="color:#f7a01a;font-size:15px;"></i>
              </div>
              <div>
                <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:3px;">Verification Required</div>
                <div style="font-size:12px;color:var(--ink-soft);line-height:1.65;">Mobile number is important for your account. To change it, we need to verify your identity using your registered <b style="color:var(--ink-mid);">email OTP</b>.</div>
              </div>
            </div>

            <!-- Current number display -->
            <div style="background:var(--bg);border:1.5px solid rgba(247,160,26,0.22);border-radius:9px;padding:10px 14px;display:flex;align-items:center;gap:10px;margin-bottom:16px;">
              <i class="fa-solid fa-mobile-screen" style="color:#f7a01a;font-size:14px;"></i>
              <span style="font-size:12px;color:var(--ink-faint);font-weight:500;">Current number</span>
              <span style="font-size:14px;font-weight:700;color:var(--ink);letter-spacing:1.5px;margin-left:auto;">${(() => { let s = (_sess() || {}); let mp = users.find(u => String(u.UserId) === String(s.userId)); return mp?.Mobile || "—"; })()}</span>
            </div>

            <!-- Message area -->
            <div id="_mobilePopupMsg" style="display:none;font-size:12px;padding:9px 13px;border-radius:8px;border-left:3px solid;margin-bottom:14px;font-weight:500;"></div>

            <!-- ── STEP 1: Confirm ── -->
            <div id="_mobileStep1">
              <div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:14px;line-height:1.6;">Click <b style="color:var(--ink);">Yes, Continue</b> to proceed. An OTP will be sent to your registered email to confirm the change.</div>
              <div style="display:flex;gap:8px;">
                <button onclick="document.getElementById('_mobileConfirmOverlay').remove()" style="flex:1;padding:10px;background:var(--bg2);color:var(--ink-soft);border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:none;">Cancel</button>
                <button onclick="_mobileGoToStep2()" style="flex:2;padding:10px;background:linear-gradient(135deg,#f7a01a,#e8920a);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 3px 10px rgba(247,160,26,0.35);display:inline-flex;align-items:center;justify-content:center;gap:7px;">
                  <i class="fa-solid fa-arrow-right"></i> Yes, Continue
                </button>
              </div>
            </div>

            <!-- ── STEP 2: Enter new number ── -->
            <div id="_mobileStep2" style="display:none;">
              <!-- Step indicator -->
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;">
                <span style="width:22px;height:22px;background:linear-gradient(135deg,#f7a01a,#e8920a);border-radius:50%;color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">1</span>
                <span style="font-size:11.5px;font-weight:600;color:#f7a01a;">Enter new number</span>
                <span style="flex:1;height:1.5px;background:linear-gradient(90deg,rgba(247,160,26,0.4),transparent);"></span>
                <span style="width:22px;height:22px;background:#e2e8f0;border-radius:50%;color:#94a3b8;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">2</span>
                <span style="font-size:11.5px;font-weight:500;color:#94a3b8;">Verify OTP</span>
              </div>
              <label style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px;">New Mobile Number</label>
              <!-- Input full width -->
              <input id="_mobileNewInput" type="tel" inputmode="numeric" maxlength="10" placeholder="Enter 10-digit mobile number" class="f-input-gold"
                style="width:100%;padding:11px 14px;border:1.5px solid #e2e8f0;border-radius:9px;font-size:15px;font-weight:600;letter-spacing:1.5px;outline:none;box-sizing:border-box;margin-bottom:10px;"
                onkeydown="if(event.key==='Enter') _mobileSendOTP()"/>
              <!-- Button full width below -->
              <button id="_mobileSendOtpBtn" onclick="_mobileSendOTP()" style="width:100%;padding:11px;background:linear-gradient(135deg,#f7a01a,#e8920a);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 3px 10px rgba(247,160,26,0.35);display:flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;margin-bottom:8px;">
                <i class="fa-solid fa-envelope"></i> Send OTP to Email
              </button>
              <div style="text-align:center;">
                <button onclick="document.getElementById('_mobileConfirmOverlay').remove()" style="padding:6px 14px;background:none;color:#94a3b8;border:none;font-size:12px;cursor:pointer;box-shadow:none;text-decoration:underline;">Cancel</button>
              </div>
            </div>

            <!-- ── STEP 3: Verify OTP ── -->
            <div id="_mobileStep3" style="display:none;">
              <!-- Step indicator -->
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;">
                <span style="width:22px;height:22px;background:rgba(34,197,94,0.15);border-radius:50%;color:#16a34a;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;"><i class="fa-solid fa-check" style="font-size:9px;"></i></span>
                <span style="font-size:11.5px;font-weight:600;color:#16a34a;">Number set</span>
                <span style="flex:1;height:1.5px;background:linear-gradient(90deg,rgba(247,160,26,0.4),transparent);"></span>
                <span style="width:22px;height:22px;background:linear-gradient(135deg,#f7a01a,#e8920a);border-radius:50%;color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;">2</span>
                <span style="font-size:11.5px;font-weight:600;color:#f7a01a;">Verify OTP</span>
              </div>
              <!-- Email sent-to banner -->
              <div id="_mobileOtpEmailBanner" style="background:rgba(34,197,94,0.08);border:1.5px solid rgba(74,222,128,0.25);border-radius:9px;padding:9px 13px;display:flex;align-items:center;gap:9px;margin-bottom:12px;">
                <i class="fa-solid fa-envelope-circle-check" style="color:#16a34a;font-size:1rem;flex-shrink:0;"></i>
                <div>
                  <div style="font-size:11px;color:#15803d;font-weight:700;">OTP sent to your email</div>
                  <div id="_mobileOtpEmailDisplay" style="font-size:12.5px;color:#166534;font-weight:600;"></div>
                </div>
              </div>
              <label style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px;">Enter OTP from your email</label>
              <!-- OTP input full width -->
              <input id="_mobileOtpInput" type="text" inputmode="numeric" maxlength="6" placeholder="— — — — — —" class="f-input-gold"
                style="width:100%;padding:13px 14px;border:1.5px solid #e2e8f0;border-radius:9px;font-size:22px;font-weight:700;letter-spacing:8px;text-align:center;outline:none;box-sizing:border-box;margin-bottom:10px;"
                onkeydown="if(event.key==='Enter') _mobileVerifyOTP()"/>
              <!-- Verify button full width -->
              <button id="_mobileVerifyBtn" onclick="_mobileVerifyOTP()" style="width:100%;padding:11px;background:linear-gradient(135deg,#27ae60,#1e9e52);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 3px 10px rgba(39,174,96,0.3);display:flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;margin-bottom:10px;">
                <i class="fa-solid fa-check-circle"></i> Verify & Update Mobile
              </button>
              <!-- Resend row: countdown then resend button -->
              <div style="text-align:center;margin-bottom:4px;">
                <span id="_mobileResendCountdown" style="font-size:12px;color:#94a3b8;"></span>
                <button id="_mobileResendBtn" onclick="_mobileResendOTP()" style="display:none;padding:5px 14px;background:none;color:#f7a01a;border:1.5px solid #f7a01a;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:none;transition:background .2s;">
                  <i class="fa-solid fa-rotate-right" style="font-size:10px;"></i> Resend OTP
                </button>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <button onclick="_mobileGoToStep2()" style="padding:6px 12px;background:none;color:#3b82f6;border:none;font-size:12px;cursor:pointer;box-shadow:none;text-decoration:underline;display:inline-flex;align-items:center;gap:4px;"><i class="fa-solid fa-arrow-left" style="font-size:10px;"></i> Change number</button>
                <button onclick="document.getElementById('_mobileConfirmOverlay').remove()" style="padding:6px 12px;background:none;color:#94a3b8;border:none;font-size:12px;cursor:pointer;box-shadow:none;text-decoration:underline;">Cancel</button>
              </div>
            </div>

          </div>
        </div>`;
    document.body.appendChild(overlay);
    // Close on backdrop click
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
  }

  // Move from Step 1 to Step 2
  function _mobileGoToStep2() {
    const s1 = document.getElementById("_mobileStep1");
    const s2 = document.getElementById("_mobileStep2");
    const s3 = document.getElementById("_mobileStep3");
    if (s1) s1.style.display = "none";
    if (s2) s2.style.display = "block";
    if (s3) s3.style.display = "none";
    // Clear any previous messages
    const msg = document.getElementById("_mobilePopupMsg");
    if (msg) msg.style.display = "none";
    setTimeout(() => { const inp = document.getElementById("_mobileNewInput"); if (inp) inp.focus(); }, 100);
  }

  // Helper: show message inside the mobile popup
  function _mobilePopupMsg(msg, ok) {
    const el = document.getElementById("_mobilePopupMsg");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
    el.classList.toggle("msg-ok",  !!ok);
    el.classList.toggle("msg-err", !ok);
  }

  // STEP 2: Validate new number and send OTP
  async function _mobileSendOTP() {
    const s = (_sess() || {});
    const newMobile = (document.getElementById("_mobileNewInput") || {}).value || "";
    // Validate mobile number format first (same regex as Apps Script)
    if (!newMobile || !/^[6-9]\d{9}$/.test(newMobile)) {
      _mobilePopupMsg("Enter a valid 10-digit Indian mobile number (starting with 6-9).", false); return;
    }
    const mp = users.find(u => String(u.UserId) === String(s.userId));
    if (newMobile === (mp?.Mobile || "")) {
      _mobilePopupMsg("New number is same as current — no change needed.", false); return;
    }
    const btn = document.getElementById("_mobileSendOtpBtn");
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…'; }
    try {
      // Pass newMobile to Apps Script — it validates, stores in cache, sends OTP email
      const res = await getData("sendMobileChangeOTP&userId=" + encodeURIComponent(s.userId) + "&newMobile=" + encodeURIComponent(newMobile));
      if (res && res.status === "success") {
        _mobileOtpPending = newMobile;
        _mobileOtpVerified = false;
        // Hide step 2, show step 3
        const s2 = document.getElementById("_mobileStep2");
        const s3 = document.getElementById("_mobileStep3");
        if (s2) s2.style.display = "none";
        if (s3) s3.style.display = "block";
        // Show masked email address in banner
        const emailDisplay = document.getElementById("_mobileOtpEmailDisplay");
        if (emailDisplay) {
          const userEmail = mp?.Email || s.email || "";
          if (userEmail) {
            const parts = userEmail.split("@");
            const masked = parts[0].slice(0,2) + "*".repeat(Math.max(2, parts[0].length-2)) + "@" + parts[1];
            emailDisplay.textContent = masked;
          } else {
            emailDisplay.textContent = "your registered email";
          }
        }
        _mobilePopupMsg("✅ OTP sent to your registered email.", true);
        setTimeout(() => { const inp = document.getElementById("_mobileOtpInput"); if (inp) inp.focus(); }, 100);
        // Start 5-minute resend countdown
        _startMobileOtpCountdown(5 * 60);
      } else {
        _mobilePopupMsg("❌ " + (res?.message || "Failed to send OTP."), false);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-envelope"></i> Send OTP'; }
      }
    } catch (e) {
      _mobilePopupMsg("❌ " + e.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-envelope"></i> Send OTP'; }
    }
  }

  // STEP 3: Verify OTP — Apps Script updates sheet automatically on success
  async function _mobileVerifyOTP() {
    const s = (_sess() || {});
    const otp = (document.getElementById("_mobileOtpInput") || {}).value || "";
    if (!otp || otp.length < 6) { _mobilePopupMsg("Enter the 6-digit OTP.", false); return; }
    const btn = document.getElementById("_mobileVerifyBtn");
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying…'; }
    try {
      const res = await getData("verifyMobileChangeOTP&userId=" + encodeURIComponent(s.userId) + "&otp=" + encodeURIComponent(otp));
      if (res && res.status === "success") {
        _mobileOtpVerified = true;
        _mobileOtpPending = null;
        // Update local profile cache so UI shows new number immediately
        const mp = users.find(u => String(u.UserId) === String(s.userId));
        const newMobileVal = (document.getElementById("_mobileNewInput") || {}).value || "";
        if (mp && newMobileVal) mp.Mobile = newMobileVal;
        toast("✅ Mobile number updated successfully!");
        const overlay = document.getElementById("_mobileConfirmOverlay");
        if (overlay) overlay.remove();
        // Reopen Edit Profile so user can see updated number and continue editing
        const sN = s.name || mp?.Name || "";
        const sE = mp?.Email || s.email || "";
        const sV = mp?.Village || "";
        const sA = mp?.Address || "";
        const sDob = mp?.DOB || "";
        openEditProfile(null, sN, sE, sV, sA, sDob);
      } else {
        _mobilePopupMsg("❌ " + (res?.message || "Invalid OTP. Try again."), false);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Verify'; }
      }
    } catch (e) {
      _mobilePopupMsg("❌ " + e.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Verify'; }
    }
  }

  // Legacy stubs kept so any old references don't break
  async function requestMobileChangeOTP() { openUpdateMobileConfirm(); }
  async function verifyMobileOTP() { _mobileVerifyOTP(); }

  // ── Resend OTP: 5-minute countdown then show resend button
  let _mobileOtpCountdownTimer = null;
  function _startMobileOtpCountdown(totalSec) {
    if (_mobileOtpCountdownTimer) clearInterval(_mobileOtpCountdownTimer);
    const countdownEl = document.getElementById("_mobileResendCountdown");
    const resendBtn = document.getElementById("_mobileResendBtn");
    if (!countdownEl || !resendBtn) return;
    resendBtn.style.display = "none";
    let remaining = totalSec;
    function _tick() {
      if (!document.getElementById("_mobileResendCountdown")) { clearInterval(_mobileOtpCountdownTimer); return; }
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      countdownEl.textContent = "Resend OTP in " + m + ":" + (s < 10 ? "0" : "") + s;
      if (remaining <= 0) {
        clearInterval(_mobileOtpCountdownTimer);
        countdownEl.style.display = "none";
        resendBtn.style.display = "inline-block";
      }
      remaining--;
    }
    _tick();
    _mobileOtpCountdownTimer = setInterval(_tick, 1000);
  }
  async function _mobileResendOTP() {
    const resendBtn = document.getElementById("_mobileResendBtn");
    const countdownEl = document.getElementById("_mobileResendCountdown");
    if (resendBtn) { resendBtn.disabled = true; resendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:10px;"></i> Sending…'; }
    if (countdownEl) { countdownEl.style.display = ""; }
    // Go back to step 2 state briefly, then re-trigger send
    const newMobile = (document.getElementById("_mobileNewInput") || {}).value || "";
    if (!newMobile) { _mobilePopupMsg("Please go back and re-enter mobile number.", false); if (resendBtn) { resendBtn.disabled = false; resendBtn.style.display = "inline-block"; resendBtn.innerHTML = '<i class="fa-solid fa-rotate-right" style="font-size:10px;"></i> Resend OTP'; } return; }
    const s = (_sess() || {});
    _mobilePopupMsg("", true);
    try {
      const res = await getData("sendMobileChangeOTP&userId=" + encodeURIComponent(s.userId) + "&newMobile=" + encodeURIComponent(newMobile));
      if (res && res.status === "success") {
        _mobilePopupMsg("✅ OTP resent to your registered email.", true);
        if (resendBtn) { resendBtn.style.display = "none"; resendBtn.disabled = false; resendBtn.innerHTML = '<i class="fa-solid fa-rotate-right" style="font-size:10px;"></i> Resend OTP'; }
        _startMobileOtpCountdown(5 * 60);
      } else {
        _mobilePopupMsg("❌ " + (res?.message || "Failed to resend OTP."), false);
        if (resendBtn) { resendBtn.disabled = false; resendBtn.style.display = "inline-block"; resendBtn.innerHTML = '<i class="fa-solid fa-rotate-right" style="font-size:10px;"></i> Resend OTP'; }
      }
    } catch(e) {
      _mobilePopupMsg("❌ " + e.message, false);
      if (resendBtn) { resendBtn.disabled = false; resendBtn.style.display = "inline-block"; resendBtn.innerHTML = '<i class="fa-solid fa-rotate-right" style="font-size:10px;"></i> Resend OTP'; }
    }
  }

  async function saveProfile() {
    let s = _sess();
    let myProfile = users.find(u => String(u.UserId) === String(s.userId));
    let name = document.getElementById("ep_name").value.trim();
    let email = document.getElementById("ep_email").value.trim();
    let village = (document.getElementById("ep_village")?.value || "").trim();
    let address = (document.getElementById("ep_address")?.value || "").trim();
    // ep_dob is YYYY-MM-DD (native date input); store as DD-MM-YYYY in sheet
    const rawDob = (document.getElementById("ep_dob")?.value || "").trim();
    const dob = rawDob ? rawDob.split("-").reverse().join("-") : (myProfile?.DOB || "");
    if (!name) { toast("Name cannot be empty.", "error"); return; }

    // Lock the Save button for the full duration of the async operation
    const _saveBtn = document.querySelector("._mbtn[onclick='saveProfile()']") ||
                     document.querySelector("._mft ._mbtn:last-child");
    if (_saveBtn) { _saveBtn.disabled = true; _saveBtn.dataset.origHtml = _saveBtn.innerHTML; _saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }

    let photoURL = myProfile?.PhotoURL || "";
    if (_pendingCroppedB64) {
      if (_saveBtn) _saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading photo…';
      try {
        const _uploadCtrl = new AbortController();
        const _uploadTimer = setTimeout(function() { _uploadCtrl.abort(); }, 60000);
        let resp = await fetch(API_URL, { method: "POST", signal: _uploadCtrl.signal, body: JSON.stringify({ action: "uploadAndSaveProfile", UserId: s.userId, Name: name, Mobile: myProfile?.Mobile || "", Role: s.role, Password: "", Email: email, Village: village, Address: address, DOB: dob, Status: "Active", AdminName: name, base64: _pendingCroppedB64, fileName: "User_" + s.userId + "_" + Date.now() + ".jpg", oldPhotoURL: myProfile?.PhotoURL || "", sessionToken: s.sessionToken || "" }) });
        clearTimeout(_uploadTimer);
        let res = await resp.json(); if (res.status === "success") { photoURL = res.photoUrl; if (myProfile?.PhotoURL) delete window._photoB64Cache[myProfile.PhotoURL]; } else toast("Photo upload failed, profile still updating.", "warn");
      } catch (e) {
        if (e.name === "AbortError") { toast("Upload timed out. Try a smaller photo.", "error"); if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.innerHTML = _saveBtn.dataset.origHtml; } return; }
        toast("Photo upload error: " + e.message, "warn");
      }
    }
    try {
      if (_saveBtn) _saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
      let res = await postData({ action: "updateUser", UserId: s.userId, Name: name, Mobile: myProfile?.Mobile || "", Role: s.role, Status: myProfile?.Status || "Active", Email: email, Village: village, Address: address, DOB: dob, Password: "", PhotoURL: photoURL, AdminName: name, sessionToken: s.sessionToken || "" });
      if (res.status === "updated") { s.name = name; s.email = email; s.photoURL = photoURL; s.expiry = Date.now() + 30 * 60 * 1000; localStorage.setItem("session", JSON.stringify(s)); _pendingCroppedB64 = ""; toast("✅ Profile updated!"); closeModal(); _refreshAfterProfileSave(); }
      else { toast("❌ Update failed.", "error"); if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.innerHTML = _saveBtn.dataset.origHtml; } }
    } catch (err) { toast("❌ " + err.message, "error"); if (_saveBtn) { _saveBtn.disabled = false; _saveBtn.innerHTML = _saveBtn.dataset.origHtml; } }
  }

  /* Silent refresh after a successful profile save — avoids triggering
     the full-screen loading overlay that init() would show.
     Patches the in-memory users array directly (no API call needed —
     the session already has the updated values). Falls back to a full
     getData only if the local patch cannot find the user record. */
  async function _refreshAfterProfileSave() {
    // Lightweight post-save refresh: patches in-memory data and re-renders
    // visible UI without showing the full loading overlay.
    const s = _sess();
    if (!s) return;
    try {
      // Patch in-memory user record directly — avoids a full round-trip
      const uIdx = (users || []).findIndex(function(u) { return String(u.UserId) === String(s.userId); });
      if (uIdx !== -1) {
        users[uIdx].Name  = s.name  || users[uIdx].Name;
        users[uIdx].Email = s.email || users[uIdx].Email;
        // Patch all edited fields immediately so every panel shows fresh data
        var _fv = function(id){ var el=document.getElementById(id); return el?el.value.trim():""; };
        var _epVillage = _fv("ep_village"), _epAddress = _fv("ep_address"), _epDobRaw = _fv("ep_dob");
        if (_epVillage) users[uIdx].Village = _epVillage;
        if (_epAddress) users[uIdx].Address = _epAddress;
        if (_epDobRaw)  users[uIdx].DOB     = _epDobRaw.split("-").reverse().join("-"); // YYYY-MM-DD → DD-MM-YYYY
        if (s.photoURL) users[uIdx].PhotoURL = s.photoURL;
      } else {
        // Record not found locally — full re-fetch as fallback
        if (typeof mandirCacheBust === "function") mandirCacheBust("getAllData");
        const fresh = (await getCached("getAllData")) || {};
        users            = fresh.users            || users;
        allContributions = fresh.contributions    || allContributions;
        allGoals         = fresh.goals            || allGoals;
        data = allContributions.filter(function(c) { return String(c.UserId) === String(s.userId); });
      }
      // Re-render header name/avatar and hero stats
      const myProfile = (users || []).find(function(u) { return String(u.UserId) === String(s.userId); });
      if (myProfile) updateHeader(myProfile, s);
      calculateTotal();
      _renderRecentActivity();
      renderGoals(allGoals);
    } catch (e) {
      console.error("[_refreshAfterProfileSave] Failed:", e);
      toast("❌ Could not refresh data. Please pull to refresh.", "error");
    }
    // Reset all lazy-load flags so every panel reloads fresh data on next open
    _recordsLoaded = false; _statsLoaded = false; _eventsLoaded = false; _contribReqsLoaded = false;
  }

  /* ═══ CHANGE PASSWORD ════════════════════════════════════════════
Opens a modal with 3 fields: current password, new password,
confirm new password. Verifies current, then updates via
existing updateUser action. No new Apps Script action needed.
═══════════════════════════════════════════════════════════════ */
  function openChangePassword() {
    const html = `
  <div class="_mhdr" style="background:linear-gradient(135deg,#2a0f00 0%,#3c1a00 60%,#2a0f00 100%);border-bottom:2px solid rgba(247,160,26,0.35);">
    <h3 style="color:#fff;display:flex;align-items:center;gap:8px;"><span class="_u-icon-md"><i class="fa-solid fa-key" style="color:#f7a01a;font-size:13px;"></i></span> Change Password</h3>
    <button class="_mcls" onclick="closeModal()" style="color:rgba(255,255,255,0.6);font-size:20px;line-height:1;background:none;border:none;cursor:pointer;padding:0;">×</button>
  </div>
  <div class="_mbdy">
    <p style="font-size:12.5px;color:#64748b;margin:0 0 16px;line-height:1.6;">
      Enter your current password to verify, then set a new one.<br>
      Minimum 6 characters.
    </p>
    <label class="_fl" for="cp_current">Current Password</label>
    <div style="position:relative;margin-bottom:14px;">
      <input class="_fi" type="password" id="cp_current"
        placeholder="Your current password"
        style="margin-bottom:0;padding-right:44px;"/>
      <span onclick="_cpToggle('cp_current',this)"
        style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
        font-size:12px;color:#888;cursor:pointer;font-weight:600;">Show</span>
    </div>
    <label class="_fl" for="cp_new">New Password</label>
    <div style="position:relative;margin-bottom:14px;">
      <input class="_fi" type="password" id="cp_new"
        placeholder="New password (min 6 chars)"
        style="margin-bottom:0;padding-right:44px;"
        oninput="_cpStrength(this.value)"/>
      <span onclick="_cpToggle('cp_new',this)"
        style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
        font-size:12px;color:#888;cursor:pointer;font-weight:600;">Show</span>
    </div>
    <div id="cp_strength" style="height:4px;border-radius:2px;background:var(--bg2);
      margin:-8px 0 12px;overflow:hidden;">
      <div id="cp_strength_bar"
        style="height:100%;width:0%;border-radius:2px;transition:width .3s,background .3s;"></div>
    </div>
    <label class="_fl" for="cp_confirm">Confirm New Password</label>
    <div style="position:relative;margin-bottom:6px;">
      <input class="_fi" type="password" id="cp_confirm"
        placeholder="Repeat new password"
        style="margin-bottom:0;padding-right:44px;"/>
      <span onclick="_cpToggle('cp_confirm',this)"
        style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
        font-size:12px;color:#888;cursor:pointer;font-weight:600;">Show</span>
    </div>
    <div id="cp_msg" style="font-size:12px;min-height:18px;margin-bottom:4px;"></div>
  </div>
  <div class="_mft" style="border-top:2px solid rgba(247,160,26,0.15);background:linear-gradient(90deg,rgba(247,160,26,0.04),transparent);">
    <button class="_mbtn" style="background:#64748b;box-shadow:none;" onclick="closeModal()">
      Cancel
    </button>
    <button class="_mbtn" id="cp_save_btn" style="background:linear-gradient(135deg,#f7a01a,#e8920a);box-shadow:0 3px 10px rgba(247,160,26,0.35);"
      onclick="saveNewPassword()">
      <i class="fa-solid fa-key"></i> Update Password
    </button>
  </div>`;
    openModal(html, "420px");
    // Focus current password field after modal opens
    setTimeout(function () {
      var el = document.getElementById("cp_current");
      if (el) el.focus();
    }, 120);
  }

  /* Toggle show/hide for password fields */
  function _cpToggle(inputId, btn) {
    var inp = document.getElementById(inputId);
    if (!inp) return;
    if (inp.type === "password") {
      inp.type = "text";
      btn.textContent = "Hide";
    } else {
      inp.type = "password";
      btn.textContent = "Show";
    }
  }

  /* Strength bar under new password field */
  function _cpStrength(val) {
    var bar = document.getElementById("cp_strength_bar");
    if (!bar) return;
    var score = 0;
    if (val.length >= 6) score++;
    if (val.length >= 10) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    var pct = [0, 25, 50, 70, 85, 100][Math.min(score, 5)];
    var color = score <= 1 ? "#ef4444" : score <= 2 ? "#f59e0b" : score <= 3 ? "#3b82f6" : "#22c55e";
    bar.style.width = pct + "%";
    bar.style.background = color;
  }

  /* Set message inside modal */
  function _cpMsg(msg, color) {
    var el = document.getElementById("cp_msg");
    if (el) { el.textContent = msg; el.style.color = color || "#ef4444"; }
  }

  /* Main save function */
  async function saveNewPassword() {
    var currentVal = (document.getElementById("cp_current")?.value || "");
    var newVal = (document.getElementById("cp_new")?.value || "");
    var confirmVal = (document.getElementById("cp_confirm")?.value || "");

    // Client-side validation
    if (!currentVal) { _cpMsg("Please enter your current password."); return; }
    if (newVal.length < 6) { _cpMsg("New password must be at least 6 characters."); return; }
    if (newVal !== confirmVal) { _cpMsg("New passwords do not match."); return; }
    if (newVal === currentVal) { _cpMsg("New password must be different from current password."); return; }

    var btn = document.getElementById("cp_save_btn");
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...'; }

    try {
      var s = _sess();
      if (!s) {
        _cpMsg("Session expired. Please log in again.");
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-key"></i> Update Password'; }
        return;
      }
      var myProfile = (typeof users !== "undefined" ? users : [])
        .find(function (u) { return String(u.UserId) === String(s.userId); });

      if (!myProfile) {
        _cpMsg("Profile not loaded. Please refresh and try again.");
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-key"></i> Update Password'; }
        return;
      }

      // Verify current password — hash and compare against stored hash
      var currentHash = await sha256(currentVal);
      var storedHash = String(myProfile.Password || "").toLowerCase();

      // Note: allData strips Password from users for security.
      // If Password is not available in loaded users, fall back to server verification.
      if (storedHash && storedHash.length === 64) {
        // Password hash is available — verify client-side (faster, no extra API call)
        if (currentHash !== storedHash) {
          _cpMsg("Current password is incorrect.");
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-key"></i> Update Password'; }
          return;
        }
      }
      // If storedHash not available (getAllData strips it) — server will reject
      // wrong current password because updateUser compares on the sheet side.
      // We send currentHash as OldPassword for server-side verification.

      var newHash = await sha256(newVal);

      // updateUser already handles password update when Password param is non-empty
      // We send OldPassword so the server can optionally verify it (see appscript note below)
      var res = await postData({
        action: "changePassword",
        UserId: s.userId,
        OldPassword: currentHash,
        NewPassword: newHash,
        sessionToken: s.sessionToken || ""
      });

      if (res && res.status === "success") {
        closeModal();
        toast("✅ Password updated successfully. Please use new password next time you log in.", "");
      } else {
        _cpMsg(res?.message || "Current password is incorrect or update failed.");
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-key"></i> Update Password'; }
      }

    } catch (err) {
      _cpMsg("Error: " + err.message);
      var b = document.getElementById("cp_save_btn");
      if (b) { b.disabled = false; b.innerHTML = '<i class="fa-solid fa-key"></i> Update Password'; }
    }
  }

  /* ══════════════════════════════════════════════════════════════
     RETRY ENGINE  — user.html
     Mirrors the admin panel pattern but tuned for the user portal.
     Key features:
       • 12-second fetch timeout via AbortController
       • Exponential back-off between auto-retries (0 → 3 → 7 s)
       • Human-readable error classification (offline, timeout, 4xx, 5xx…)
       • Full-page overlay with Spinner → Error+Retry transition
       • Retry attempt counter shown to user
       • _doUserRetry() exposed globally for overlay button
       • Pull-to-refresh resets retry state before re-running init()
  ══════════════════════════════════════════════════════════════ */

  /* ── 1. Fetch with timeout (AbortController) ─────────────────
     Wraps the existing getData / getCached calls indirectly.
     getCached / getData in app.js use fetch() internally.
     We patch window.fetch here so ALL requests get the timeout.   */
  (function() {
    var _nativeFetch = window.fetch;
    var TIMEOUT_MS   = 12000; // 12 s — generous for slow App Script
    window.fetch = function(input, init) {
      // Only add timeout if caller hasn't already set a signal
      if (init && init.signal) return _nativeFetch.call(this, input, init);
      var controller = new AbortController();
      var tid = setTimeout(function() { controller.abort(); }, TIMEOUT_MS);
      var merged = Object.assign({}, init, { signal: controller.signal });
      return _nativeFetch.call(this, input, merged).then(function(r) {
        clearTimeout(tid); return r;
      }, function(err) {
        clearTimeout(tid);
        // Translate AbortError → friendlier TimeoutError
        if (err && err.name === "AbortError") {
          var te = new Error("Request timed out after " + (TIMEOUT_MS/1000) + "s — server did not respond.");
          te.name = "TimeoutError";
          throw te;
        }
        throw err;
      });
    };
  })();

  /* ── 2. Error classifier — produces human-readable title + detail ── */
  function _classifyUserNetworkError(err) {
    var msg = (err && err.message ? err.message : String(err || "")).toLowerCase();
    var name = (err && err.name ? err.name : "").toLowerCase();
    if (!navigator.onLine) {
      return { icon: "📴", title: "No Internet Connection",
        detail: "You appear to be offline. Please check your Wi-Fi or mobile data, then tap Retry." };
    }
    if (msg.includes("empty or incomplete data") || msg.includes("profile could not be found")) {
      return { icon: "🔄", title: "Data Not Ready",
        detail: "The server responded but your data wasn't ready yet. This is usually temporary — please tap Retry." };
    }
    if (name === "timeouterror" || msg.includes("timed out") || msg.includes("timeout") || msg.includes("time out")) {
      return { icon: "⏱️", title: "Request Timed Out",
        detail: "The server took too long to respond. This can happen on slow connections or when the server is busy. Please try again." };
    }
    if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network")) {
      return { icon: "📶", title: "Network Error",
        detail: "Could not reach the server. Check your internet connection and try again." };
    }
    if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("forbidden")) {
      return { icon: "🔒", title: "Session Expired",
        detail: "Your session has expired or you don't have access. Please log in again." };
    }
    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("quota")) {
      return { icon: "🚦", title: "Too Many Requests",
        detail: "The server is temporarily limiting requests. Please wait a moment and try again." };
    }
    if (msg.includes("500") || msg.includes("server error") || msg.includes("internal")) {
      return { icon: "🔧", title: "Server Error",
        detail: "The server encountered an internal error. Please try again in a moment." };
    }
    if (msg.includes("script") || msg.includes("load") || msg.includes("unreachable")) {
      return { icon: "🌐", title: "Server Unreachable",
        detail: "Could not reach the server. You may have a weak connection, or the server may be temporarily unavailable." };
    }
    return { icon: "⚠️", title: "Connection Error",
      detail: "An unexpected error occurred" + (err && err.message ? ": " + err.message : "") + ". Please try again." };
  }

  /* ── 3. Overlay helpers ───────────────────────────────────────── */
  var _uloRetryCount = 0;

  /* ── Step-progress engine ──────────────────────────────────────
     Steps (0-based):
       0  Connecting to server
       1  Fetching member data
       2  Processing your records
       3  Building your dashboard
       4  Loading recent activity
       5  Almost there!
  ──────────────────────────────────────────────────────────────── */
  var _ULO_STEPS = [
    "Connecting to server…",
    "Fetching member data…",
    "Processing your records…",
    "Building your dashboard…",
    "Loading recent activity…",
    "Almost there…"
  ];
  function _uloStep(stepIndex) {
    var total = _ULO_STEPS.length;
    var pct   = Math.round((stepIndex / total) * 100);

    // label
    var lbl = document.getElementById("ulo_step_label");
    if (lbl) { lbl.style.opacity = "0"; setTimeout(function() { lbl.textContent = _ULO_STEPS[stepIndex] || ""; lbl.style.opacity = "1"; }, 150); }

    // progress bar
    var bar = document.getElementById("ulo_prog_bar");
    if (bar) bar.style.width = pct + "%";

    // pct badge
    var badge = document.getElementById("ulo_pct_badge");
    if (badge) badge.textContent = pct + "%";

    // dots (now pill-style)
    var dots = document.querySelectorAll("#ulo_step_dots .ulo-sdot");
    dots.forEach(function(d, i) {
      d.classList.remove("done", "active");
      if (i < stepIndex)       d.classList.add("done");
      else if (i === stepIndex) d.classList.add("active");
    });

    // counter
    var doneEl   = document.getElementById("ulo_step_done");
    var remainEl = document.getElementById("ulo_step_remain");
    var done     = stepIndex;
    var remain   = total - stepIndex;
    if (doneEl)   doneEl.textContent   = done + " of " + total + " done";
    if (remainEl) remainEl.textContent = remain + " remaining";
  }

  function _uloStepComplete() {
    var total = _ULO_STEPS.length;
    var bar   = document.getElementById("ulo_prog_bar");
    if (bar) { bar.style.width = "100%"; bar.classList.remove("active"); }
    var badge = document.getElementById("ulo_pct_badge");
    if (badge) badge.textContent = "100%";
    var dots = document.querySelectorAll("#ulo_step_dots .ulo-sdot");
    dots.forEach(function(d) { d.classList.remove("active"); d.classList.add("done"); });
    var lbl = document.getElementById("ulo_step_label");
    if (lbl) { lbl.style.opacity = "0"; setTimeout(function() { lbl.textContent = "Ready! ✓"; lbl.style.opacity = "1"; }, 100); }
    var doneEl   = document.getElementById("ulo_step_done");
    var remainEl = document.getElementById("ulo_step_remain");
    if (doneEl)   doneEl.textContent   = total + " of " + total + " done";
    if (remainEl) remainEl.textContent = "0 remaining";
  }

  function _showUserLoadingOverlay() {
    // Reset to spinner state
    var loadEl = document.getElementById("ulo_loading");
    var errEl  = document.getElementById("ulo_error");
    var pill   = document.getElementById("ulo_attempt_pill");
    var btn    = document.getElementById("ulo_retryBtn");
    if (loadEl) { loadEl.style.display = "flex"; loadEl.style.flexDirection = "column"; loadEl.style.alignItems = "center"; loadEl.style.gap = "10px"; }
    if (errEl)  errEl.classList.remove("show");
    if (pill)   pill.style.display = "none";
    if (btn)    { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Retry'; btn.style.opacity = "1"; }
    // Reset step progress + pct badge + progress bar active glow
    var bar = document.getElementById("ulo_prog_bar");
    if (bar) bar.classList.add("active");
    var badge = document.getElementById("ulo_pct_badge");
    if (badge) badge.textContent = "0%";
    _uloStep(0);
    var overlay = document.getElementById("userLoadingOverlay");
    if (overlay) overlay.classList.add("show");
  }

  function _hideUserLoadingOverlay() {
    var overlay = document.getElementById("userLoadingOverlay");
    if (overlay) overlay.classList.remove("show");
  }

  // ── [DEFAULT-PWD] Forced password change screen
  //    Shown when user still has the default "JaiShreeRam" password set by admin.
  //    Full-screen overlay — cannot be dismissed without changing the password.
  //    On success: calls changePassword API → auto-logout → redirect to login.
  function _showForceChangePassword(session) {
    // Build the overlay
    var ov = document.createElement("div");
    ov.id = "forcePwdOverlay";
    ov.style.cssText = [
      "position:fixed;inset:0;z-index:99999",
      "background:linear-gradient(135deg,#1a0800 0%,#2d1200 50%,#1a0800 100%)",
      "display:flex;align-items:center;justify-content:center",
      "padding:20px;box-sizing:border-box",
      "animation:fadeIn .35s ease"
    ].join(";");

    ov.innerHTML = [
      '<style>',
      '@keyframes fadeIn{from{opacity:0}to{opacity:1}}',
      '@keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}',
      '#forcePwdCard{background:linear-gradient(160deg,#2d1a00,#1e1000);border:1.5px solid rgba(247,160,26,0.35);border-radius:24px;padding:32px 28px 28px;max-width:400px;width:100%;box-shadow:0 24px 80px rgba(0,0,0,0.6);animation:slideUp .4s cubic-bezier(.22,1,.36,1);}',
      '#forcePwdCard input{width:100%;box-sizing:border-box;background:rgba(255,255,255,0.07);border:1.5px solid rgba(247,160,26,0.25);border-radius:12px;color:#f1e8d8;font-size:15px;padding:12px 44px 12px 14px;outline:none;transition:border .2s;}',
      '#forcePwdCard input:focus{border-color:rgba(247,160,26,0.7);}',
      '#forcePwdCard input::placeholder{color:rgba(241,232,216,0.35);}',
      '.fpwd-eye{position:absolute;right:13px;top:50%;transform:translateY(-50%);cursor:pointer;color:rgba(247,160,26,0.6);font-size:14px;}',
      '.fpwd-eye:hover{color:#f7a01a;}',
      '#fpwd_strength_bar{height:5px;border-radius:3px;transition:width .3s,background .3s;width:0%;}',
      '#fpwd_save_btn{width:100%;padding:14px;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#f7a01a,#e8920a);color:#1a0800;box-shadow:0 4px 16px rgba(247,160,26,0.35);transition:opacity .2s;letter-spacing:.3px;}',
      '#fpwd_save_btn:disabled{opacity:.5;cursor:not-allowed;}',
      '#fpwd_save_btn:not(:disabled):hover{opacity:.88;}',
      '</style>',
      '<div id="forcePwdCard">',
        // Header
        '<div style="text-align:center;margin-bottom:24px;">',
          '<div style="width:56px;height:56px;background:rgba(247,160,26,0.15);border:2px solid rgba(247,160,26,0.4);border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">',
            '<i class="fa-solid fa-shield-halved" style="color:#f7a01a;font-size:24px;"></i>',
          '</div>',
          '<div style="color:#f7a01a;font-size:20px;font-weight:700;margin-bottom:6px;">Set Your Password</div>',
          '<div style="color:rgba(241,232,216,0.65);font-size:13px;line-height:1.6;">',
            'Your account is using a temporary password.<br>',
            'Please set a new secure password to continue.',
          '</div>',
        '</div>',
        // New Password
        '<div style="margin-bottom:6px;color:rgba(241,232,216,0.7);font-size:12px;font-weight:600;letter-spacing:.4px;">NEW PASSWORD</div>',
        '<div style="position:relative;margin-bottom:6px;">',
          '<input type="password" id="fpwd_new" placeholder="Enter new password" autocomplete="new-password" oninput="_fpwdStrength(this.value);_fpwdMatchCheck()" />',
          '<span class="fpwd-eye" onclick="_fpwdToggle(\'fpwd_new\',this)"><i class="fa-solid fa-eye"></i></span>',
        '</div>',
        // Strength bar
        '<div style="background:rgba(255,255,255,0.08);border-radius:3px;margin-bottom:4px;overflow:hidden;">',
          '<div id="fpwd_strength_bar"></div>',
        '</div>',
        '<div id="fpwd_strength_label" style="font-size:11px;color:rgba(241,232,216,0.45);margin-bottom:16px;min-height:16px;"></div>',
        // Confirm Password
        '<div style="margin-bottom:6px;color:rgba(241,232,216,0.7);font-size:12px;font-weight:600;letter-spacing:.4px;">CONFIRM PASSWORD</div>',
        '<div style="position:relative;margin-bottom:6px;">',
          '<input type="password" id="fpwd_confirm" placeholder="Repeat new password" autocomplete="new-password" oninput="_fpwdMatchCheck()" />',
          '<span class="fpwd-eye" onclick="_fpwdToggle(\'fpwd_confirm\',this)"><i class="fa-solid fa-eye"></i></span>',
        '</div>',
        '<div id="fpwd_match_label" style="font-size:12px;min-height:18px;margin-bottom:18px;"></div>',
        // Error message
        '<div id="fpwd_error" style="font-size:13px;color:#f87171;min-height:18px;margin-bottom:12px;text-align:center;"></div>',
        // Submit button
        '<button id="fpwd_save_btn" onclick="_fpwdSave()">',
          '<i class="fa-solid fa-key"></i> Set New Password',
        '</button>',
        '<div style="text-align:center;margin-top:14px;color:rgba(241,232,216,0.3);font-size:11px;">',
          '🔒 You will be logged out after changing your password.',
        '</div>',
      '</div>'
    ].join("");

    document.body.appendChild(ov);

    // Store session for the save handler
    window._fpwdSession = session;

    // ── Password strength checker
    window._fpwdStrength = function(val) {
      var bar   = document.getElementById("fpwd_strength_bar");
      var label = document.getElementById("fpwd_strength_label");
      if (!bar || !label) return;
      if (!val) { bar.style.width = "0%"; label.textContent = ""; return; }
      var score = 0;
      if (val.length >= 8)                        score++;
      if (val.length >= 12)                       score++;
      if (/[A-Z]/.test(val))                      score++;
      if (/[0-9]/.test(val))                      score++;
      if (/[^A-Za-z0-9]/.test(val))               score++;
      var levels = [
        { pct:"20%", color:"#ef4444", text:"Very Weak"  },
        { pct:"40%", color:"#f97316", text:"Weak"       },
        { pct:"60%", color:"#eab308", text:"Fair"       },
        { pct:"80%", color:"#22c55e", text:"Strong"     },
        { pct:"100%",color:"#16a34a", text:"Very Strong"}
      ];
      var lv = levels[Math.min(score, 4)];
      bar.style.width       = lv.pct;
      bar.style.background  = lv.color;
      label.textContent     = lv.text;
      label.style.color     = lv.color;
    };

    // ── Confirm match checker
    window._fpwdMatchCheck = function() {
      var newVal  = (document.getElementById("fpwd_new")     || {}).value || "";
      var confVal = (document.getElementById("fpwd_confirm") || {}).value || "";
      var ml      = document.getElementById("fpwd_match_label");
      if (!ml || !confVal) { if(ml) ml.textContent = ""; return; }
      if (newVal === confVal) {
        ml.textContent = "✅ Passwords match";
        ml.style.color = "#4ade80";
      } else {
        ml.textContent = "❌ Passwords do not match";
        ml.style.color = "#f87171";
      }
    };

    // ── Toggle eye icon
    window._fpwdToggle = function(inputId, el) {
      var inp = document.getElementById(inputId);
      if (!inp) return;
      inp.type = inp.type === "password" ? "text" : "password";
      var ic = el.querySelector("i");
      if (ic) { ic.className = inp.type === "password" ? "fa-solid fa-eye" : "fa-solid fa-eye-slash"; }
    };

    // ── Save handler
    window._fpwdSave = async function() {
      var newVal  = (document.getElementById("fpwd_new")     || {}).value || "";
      var confVal = (document.getElementById("fpwd_confirm") || {}).value || "";
      var errEl   = document.getElementById("fpwd_error");
      var btn     = document.getElementById("fpwd_save_btn");
      var setErr  = function(msg) { if (errEl) errEl.textContent = msg; };
      setErr("");

      if (!newVal || newVal.length < 6) { setErr("Password must be at least 6 characters."); return; }
      if (newVal === "JaiShreeRam")     { setErr("You cannot use the default password. Please choose a new one."); return; }
      if (newVal !== confVal)           { setErr("Passwords do not match."); return; }

      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating…';

      try {
        var s        = window._fpwdSession;
        var oldHash  = await sha256("JaiShreeRam");
        var newHash  = await sha256(newVal);

        var res = await postData({
          action:       "changePassword",
          UserId:       s.userId,
          OldPassword:  oldHash,
          NewPassword:  newHash,
          sessionToken: s.sessionToken || ""
        });

        if (res && res.status === "success") {
          btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Password Changed!';
          btn.style.background = "linear-gradient(135deg,#22c55e,#16a34a)";
          if (errEl) {
            errEl.style.color = "#4ade80";
            errEl.textContent = "✅ Password updated! Logging you out…";
          }
          // Logout after short delay so user sees success message
          setTimeout(function() {
            try {
              var _s = window._fpwdSession || {};
              postData({ action: "logout", userId: _s.userId || "", userName: _s.name || "User",
                         sessionToken: _s.sessionToken || "" }).catch(function(){});
            } catch(e) {}
            ["session", _U_RMK].forEach(function(k) {
              try { localStorage.removeItem(k); } catch(e) {}
            });
            sessionStorage.clear();
            history.replaceState(null, "", "login.html");
            location.replace("login.html");
          }, 1800);
        } else {
          setErr(res && res.message ? res.message : "Failed to update password. Please try again.");
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-key"></i> Set New Password';
        }
      } catch (err) {
        setErr("Error: " + err.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-key"></i> Set New Password';
      }
    };
  }

  /* Auto-retry countdown state */
  var _uloCountdownTimer = null;
  var _uloCountdownSec   = 0;

  function _clearCountdown() {
    if (_uloCountdownTimer) { clearInterval(_uloCountdownTimer); _uloCountdownTimer = null; }
    var wrap = document.getElementById("ulo_countdown_wrap");
    if (wrap) wrap.classList.remove("active");
  }

  function _startCountdown(seconds, onDone) {
    _clearCountdown();
    var wrap  = document.getElementById("ulo_countdown_wrap");
    var bar   = document.getElementById("ulo_countdown_bar");
    var txt   = document.getElementById("ulo_countdown_txt");
    if (!wrap || !bar || !txt) { onDone && onDone(); return; }
    wrap.classList.add("active");
    _uloCountdownSec = seconds;
    bar.style.transition = "none";
    bar.style.width = "100%";
    void bar.offsetWidth;
    bar.style.transition = "width " + seconds + "s linear";
    bar.style.width = "0%";
    txt.textContent = seconds + "s";
    _uloCountdownTimer = setInterval(function() {
      _uloCountdownSec--;
      if (txt) txt.textContent = _uloCountdownSec + "s";
      if (_uloCountdownSec <= 0) {
        _clearCountdown();
        onDone && onDone();
      }
    }, 1000);
  }

  function _updateAttemptDots(count) {
    var container = document.getElementById("ulo_attempt_dots");
    if (!container) return;
    var maxDots = 5;
    container.innerHTML = "";
    for (var i = 0; i < Math.min(count, maxDots); i++) {
      var d = document.createElement("span");
      d.className = "ulo-adot used";
      container.appendChild(d);
    }
    if (count > maxDots) {
      var more = document.createElement("span");
      more.style.cssText = "font-size:9px;font-weight:700;color:#b45309;font-family:var(--font-b);margin-left:2px;";
      more.textContent = "+" + (count - maxDots);
      container.appendChild(more);
    }
  }

  function _showUserLoadingError(err) {
    var classified = _classifyUserNetworkError(err);
    var loadEl     = document.getElementById("ulo_loading");
    var errEl      = document.getElementById("ulo_error");
    var reasonEl   = document.getElementById("ulo_reason");
    var pill       = document.getElementById("ulo_attempt_pill");
    var pillTxt    = document.getElementById("ulo_pill_text");
    var iconEl     = document.getElementById("ulo_err_icon");
    var titleEl    = document.getElementById("ulo_err_title");
    var subtitleEl = document.getElementById("ulo_err_subtitle");
    var btn        = document.getElementById("ulo_retryBtn");

    if (loadEl)  loadEl.style.display = "none";
    if (errEl)   errEl.classList.add("show");

    if (iconEl)    iconEl.textContent = classified.icon;
    if (titleEl)   titleEl.textContent = classified.title;
    if (subtitleEl) subtitleEl.textContent = _uloRetryCount > 0
      ? "Attempt " + _uloRetryCount + " failed — tap Retry"
      : "Something went wrong — tap Retry";

    if (reasonEl) reasonEl.innerHTML =
      "<span style='font-size:12px;line-height:1.65;'>" + classified.detail + "</span>";

    if (_uloRetryCount > 0) {
      if (pill)    pill.classList.add("show");
      if (pillTxt) pillTxt.textContent = "Attempt " + _uloRetryCount + " failed";
      _updateAttemptDots(_uloRetryCount);
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Retry Now'; btn.style.opacity = "1"; }

    // Auto-retry countdown for first 2 failures only
    if (_uloRetryCount < 3) {
      _startCountdown(8, function() {
        var retryBtn = document.getElementById("ulo_retryBtn");
        _doUserRetry(retryBtn);
      });
    }

    var overlay = document.getElementById("userLoadingOverlay");
    if (overlay && !overlay.classList.contains("show")) overlay.classList.add("show");
  }

  /* ── 4. Retry handler (called by overlay button) ─────────────── */
  window._doUserRetry = function(btn) {
    if (btn && btn.disabled) return;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Retrying…';
      btn.style.opacity = "0.8";
    }
    // Cancel any running auto-retry countdown
    _clearCountdown();
    _uloRetryCount++;
    // Bust cache — primary method via app.js helper
    if (typeof mandirCacheBust === "function") {
      mandirCacheBust("getAllData");
    } else {
      // Fallback: clear known cache keys directly
      try {
        ["getAllData", "mandir_cache_getAllData"].forEach(function(k) {
          sessionStorage.removeItem(k);
          localStorage.removeItem(k);
        });
      } catch(e) {}
    }
    setTimeout(function() {
      _showUserLoadingOverlay(); // reset to spinner state
      init();
    }, 180);
  };

  /* ── Back to Login — clears session so guard doesn't bounce back ── */
  window._doBackToLogin = function() {
    _clearCountdown();
    try {
      ["session", _U_RMK].forEach(function(k) {
        localStorage.removeItem(k);
      });
    } catch(e) {}
    _uloRetryCount = 0;
    location.replace("login.html");
  };

  /* ── 5. Main init — now with overlay + error handling ─────────── */
  async function init() {
    // _showUserLoadingOverlay() is called by caller (_doUserRetry / initial load), not here
    try {
      _uloStep(0); // Connecting to server…
      let allData = (await getCached("getAllData")) || {};

      // ── Guard: treat missing or structurally empty response as an error
      //    so the retry overlay is shown instead of a blank/zero dashboard.
      //    "users" array must exist and be non-empty — it's the minimum proof
      //    that the server returned real data (not a timeout stub or empty obj).
      if (!allData || typeof allData !== "object" || !Array.isArray(allData.users) || allData.users.length === 0) {
        throw new Error("Server returned empty or incomplete data. Please retry.");
      }

      _uloStep(1); // Fetching member data…
      let s = _sess();
      if (!s) { location.replace("login.html"); return; }
      _uloStep(2); // Processing your records…
      users = allData.users || []; types = allData.types || []; occasions = allData.occasions || [];
      allContributions = allData.contributions || []; allGoals = allData.goals || [];
      data = allContributions.filter(c => String(c.UserId) === String(s.userId));
      // Reset lazy-load flags so panels rebuild with fresh data on every init()
      // (covers retry after error, and the edge case of page staying open across midnight/new year)
      _recordsLoaded = false; _statsLoaded = false; _eventsLoaded = false;

      // ── Guard: current user must exist in the users list
      //    If profile is missing, data is partial — show retry rather than a broken dashboard.
      var _myProfile = users.find(u => String(u.UserId) === String(s.userId));
      if (!_myProfile) {
        throw new Error("Your profile could not be found. Please retry.");
      }

      // ── Load header photo from sheet data on every dashboard entry.
      // The page-load block sets only initials from session (no photoURL in session).
      // updateHeader() was only called after edit-profile save — never on first load.
      updateHeader(_myProfile, s);

      // ── [DEFAULT-PWD] Force password change if still using default "JaiShreeRam" password.
      //    getAllData strips Password hashes for security, but returns IsDefaultPwd:true
      //    for the requesting user when their stored hash matches the default "JaiShreeRam" hash.
      //    This flag is set server-side — no hash is ever exposed to the frontend.
      if (_myProfile.IsDefaultPwd === true) {
        // Overlay complete → hide it, show the forced change password screen
        _uloStepComplete();
        setTimeout(function() {
          _hideUserLoadingOverlay();
          _showForceChangePassword(s);
        }, 400);
        return; // do NOT continue loading the dashboard
      }

      _uloStep(3); // Building your dashboard…
      calculateTotal();

      // ── Reveal hero FIRST — user sees their data immediately
      const heroSkel = document.getElementById("heroSkeleton");
      const heroContent = document.getElementById("heroContent");
      if (heroSkel) heroSkel.style.display = "none";
      if (heroContent) { heroContent.style.display = "block"; heroContent.style.animation = "slideUp .35s ease"; }

      _uloStep(4); // Loading recent activity…
      // ── Only render what is visible on home screen
      _renderRecentActivity();
      renderGoals(allGoals);

      // ── Re-apply Hindi translation to newly rendered content
      if (typeof _ULANG !== "undefined" && _ULANG.current === "HI") {
        setTimeout(function() { _applyUserLang("HI"); }, 50);
      }

      // ── Birthday celebration — once per birthday, 30s after login
      (function() {
        try {
          var mp = users.find(function(u){ return String(u.UserId) === String(s.userId); }) || _myProfile;
          if (!mp || !mp.DOB) return;
          var dobStr = String(mp.DOB || "");
          var dobDay, dobMonth;
          // Parse ISO (2026-04-14T18:30:00.000Z), DD-MM-YYYY, or YYYY-MM-DD
          if (dobStr.indexOf("T") >= 0 || dobStr.indexOf("Z") >= 0) {
            var _dISO = new Date(dobStr); if (isNaN(_dISO)) return;
            dobDay = _dISO.getUTCDate(); dobMonth = _dISO.getUTCMonth() + 1;
          } else if (/^\d{2}-\d{2}-\d{4}$/.test(dobStr)) {
            var _p = dobStr.split("-"); dobDay = parseInt(_p[0],10); dobMonth = parseInt(_p[1],10);
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(dobStr)) {
            var _p2 = dobStr.split("-"); dobDay = parseInt(_p2[2],10); dobMonth = parseInt(_p2[1],10);
          } else { return; }
          var now = new Date();
          if (now.getDate() !== dobDay || (now.getMonth()+1) !== dobMonth) return;
          // Check if already shown today for this user
          var bdayKey = "bday_shown_" + now.getFullYear() + "_" + s.userId;
          if (localStorage.getItem(bdayKey)) return;
          _showBirthdayCelebration(mp.Name || s.name || "Friend", bdayKey);
        } catch(e) { /* silently ignore any birthday logic error */ }
      })();

      _uloStep(5); // Almost there…
      // ── Broadcasts in background — separate API call, don't block UI
      renderBroadcasts();

      // ── Success: mark complete, reset retry counter, hide overlay
      _uloRetryCount = 0;
      _uloStepComplete();
      setTimeout(_hideUserLoadingOverlay, 400);

      // ── Everything else is deferred to panel open (records, stats, filters)

    } catch (err) {
      console.error("[init] Failed to load dashboard data:", err);
      _showUserLoadingError(err);
      // overlay stays open — user will click Retry
    }
  }

  function renderGoals(goals) {
    let c = document.getElementById("goalsContainer");
    if (!goals || goals.length === 0) { c.innerHTML = ""; return; }
    let enabled = goals.filter(g => g.Status === "Enabled");
    if (enabled.length === 0) { c.innerHTML = ""; return; }
    c.innerHTML = `<div class="sec-lbl"><i class="fa-solid fa-bullseye"></i> Mandir Goals</div>` +
      enabled.map(g => {
        let col = Number(g.CurrentAmount || 0), tgt = Number(g.TargetAmount || 1), pct = Math.min(100, Math.round(col / tgt * 100));
        let bc = pct >= 100 ? "#22c55e" : pct >= 60 ? "#f7a01a" : "#ef4444";
        let sp = pct >= 100 ? `<span class="goal-pill" style="background:rgba(34,197,94,0.13);color:#16a34a;">✓ Achieved</span>` : `<span class="goal-pill" style="background:rgba(247,160,26,0.12);color:#f7a01a;">${pct}% funded</span>`;
        return `<div class="goal-item" style="border-left-color:${bc};">
            <div class="goal-top"><div class="goal-name"><i class="fa-solid fa-bullseye" style="color:${bc};font-size:11px;"></i> ${escapeHtml(g.GoalName)}</div>${sp}</div>
            <div class="goal-track"><div class="goal-fill${pct >= 100 ? ' goal-fill--done' : ''}" style="width:${pct}%;background:linear-gradient(90deg,${bc}cc,${bc});"></div></div>
            <div class="goal-nums"><span>Collected: <b style="color:${bc};">₹${fmt(col)}</b></span><span>Target: <b>₹${fmt(tgt)}</b></span></div>
          </div>`;
      }).join("");
  }

  async function renderBroadcasts() {
    const c = document.getElementById("broadcastContainer"); if (!c) return;
    // Use cached data if available and not requesting a re-fetch
    let bs = [];
    if (c.dataset.bsCached) {
      try { bs = JSON.parse(c.dataset.bsCached); } catch(e) { bs = []; }
    } else {
      try { const r = await getData("getBroadcasts"); bs = Array.isArray(r) ? r : []; } catch (e) { console.error("[renderBroadcasts] Fetch error:", e); bs = []; }
      // Filter out blank entries before caching
      bs = bs.filter(function (b) { return (b.title || "").trim() || (b.message || "").trim(); });
      // Only cache if fetch actually returned data — avoids persisting an empty
      // array on network error (which would prevent future retries from re-fetching)
      if (bs.length > 0) c.dataset.bsCached = JSON.stringify(bs);
    }
    if (bs.length === 0) { c.innerHTML = ""; return; }
    const showAll = c.dataset.showAll === "1";
    const recent = showAll ? bs : bs.slice(0, 5);
    const tIco = { announcement: "📢", poll: "🗳️", innovation: "💡" };
    const tLbl = { announcement: "Announcement", poll: "Poll", innovation: "New Idea" };
    const pC = { urgent: "#ef4444", important: "#f7a01a", normal: "#334155" };
    const pB = { urgent: "#fee2e2", important: "#fef9ee", normal: "#f1f5f9" };
    const viewAllBtn = bs.length > 5
      ? '<button onclick="document.getElementById(\'broadcastContainer\').dataset.showAll=document.getElementById(\'broadcastContainer\').dataset.showAll===\'1\'?\'0\':\'1\';renderBroadcasts();" style="font-size:11px;background:none;border:1px solid var(--gold);color:var(--gold);border-radius:6px;padding:3px 10px;cursor:pointer;">' + (showAll ? 'Show Less' : 'View All (' + bs.length + ')') + '</button>'
      : '';
    const header = '<div class="sec-lbl" style="display:flex;align-items:center;justify-content:space-between;"><span><i class="fa-solid fa-bullhorn"></i> Announcements</span>' + viewAllBtn + '</div>';
    const items = recent.map(function (b) {
      const bPriority = b.priority || "normal";
      const cls = b.type === "poll" ? "poll" : b.type === "innovation" ? "innovation" : bPriority === "urgent" ? "urgent" : bPriority === "important" ? "important" : "";
      const pollBtns = b.type === "poll"
        ? '<div style="margin-top:9px;display:flex;gap:7px;flex-wrap:wrap;"><span style="background:rgba(34,197,94,0.12);color:#16a34a;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">✅ Yes</span><span style="background:rgba(239,68,68,0.10);color:#ef4444;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">❌ No</span><span style="background:rgba(247,160,26,0.10);color:#f7a01a;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">💬 Suggestion</span></div>'
        : '';
      return '<div class="bc-item ' + cls + '">'
        + '<div class="bc-meta">'
        + '<span style="font-size:1rem;">' + (tIco[b.type] || "📢") + '</span>'
        + '<span class="bc-pill" style="background:' + (pB[bPriority] || "#f1f5f9") + ';color:' + (pC[bPriority] || "#334155") + ';">' + (tLbl[b.type] || b.type) + (bPriority !== "normal" ? " · " + bPriority.toUpperCase() : "") + '</span>'
        + '<span class="bc-time">' + (b.time || "") + '</span>'
        + '</div>'
        + '<div class="bc-title">' + escapeHtml(b.title || "") + '</div>'
        + '<div class="bc-msg">' + escapeHtml(b.message || "") + '</div>'
        + pollBtns
        + '</div>';
    }).join("");
    c.innerHTML = header + items;
  }

  function loadSummaryYears() {
    let yrs = new Set(); data.forEach(c => { let y = Number(c.Year); if (!isNaN(y) && y > 2000) yrs.add(y); });
    // Fill any gap between earliest data year and current year so no year is missing
    const curY = new Date().getFullYear();
    const minY = yrs.size > 0 ? Math.min(...yrs) : curY;
    for (let y = minY; y <= curY; y++) yrs.add(y);
    let sorted = Array.from(yrs).sort((a, b) => b - a);
    let sel = document.getElementById("summaryYear");
    sel.innerHTML = sorted.map(y => `<option value="${y}">${y}</option>`).join("");
    sel.value = String(curY);
  }

  function renderSummaries() {
    let yr = document.getElementById("summaryYear")?.value || String(new Date().getFullYear());
    let yd = data.filter(c => String(c.Year) === String(yr));
    let mM = {}; yd.forEach(c => { mM[c.ForMonth] = (mM[c.ForMonth] || 0) + Number(c.Amount || 0); });
    let maxMonthAmt = Math.max(...months.filter(m => mM[m]).map(m => mM[m]), 1);
    document.getElementById("monthSummary").innerHTML =
      months.filter(m => mM[m]).map(m => {
        const pct = Math.round(mM[m] / maxMonthAmt * 100);
        return `<div class="s-item" style="flex-direction:column;align-items:stretch;gap:4px;padding:8px 0;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="s-lbl">${m}</span><span class="s-val" style="font-size:12px;">₹ ${fmt(mM[m])}</span>
          </div>
          <div style="background:var(--bg2);border-radius:4px;height:5px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--gold),#e8920a);border-radius:4px;transition:width 1s cubic-bezier(.4,0,.2,1);"></div>
          </div>
        </div>`;
      }).join("") ||
      `<div class="empty"><i class="fa-solid fa-calendar-xmark"></i><p>No data for ${yr}</p></div>`;
    let tM = {}; yd.forEach(c => { let t = types.find(x => String(x.TypeId) === String(c.TypeId))?.TypeName || "Other"; tM[t] = (tM[t] || 0) + Number(c.Amount || 0); });
    document.getElementById("typeSummary").innerHTML =
      Object.keys(tM).map(t => `<div class="s-item"><span class="s-lbl">${escapeHtml(t)}</span><span class="s-val">₹ ${fmt(tM[t])}</span></div>`).join("") ||
      `<div class="empty"><i class="fa-solid fa-chart-pie"></i><p>No data for ${yr}</p></div>`;
  }

  function loadFilters() {
    let yrs = new Set(); data.forEach(c => { let y = Number(c.Year); if (!isNaN(y) && y > 2000) yrs.add(y); });
    const curY = new Date().getFullYear();
    const minY = yrs.size > 0 ? Math.min(...yrs) : curY;
    for (let y = minY; y <= curY; y++) yrs.add(y);
    document.getElementById("filterYear").innerHTML = `<option value="">All Years</option>` + Array.from(yrs).sort((a, b) => b - a).map(y => `<option value="${y}">${y}</option>`).join("");
    document.getElementById("filterMonth").innerHTML = `<option value="">All Months</option>` + months.map(m => `<option value="${m}">${m}</option>`).join("");
    document.getElementById("filterType").innerHTML = `<option value="">All Types</option>` + types.map(t => `<option value="${escapeHtml(String(t.TypeId))}">${escapeHtml(t.TypeName)}</option>`).join("");
  }

  let _pgList = [], _pgPage = 1;
  const _pgSize = 10;

  // ── Shared date parser: handles dd-MM-yyyy and dd-MM-yyyy H:mm:ss / HH:mm:ss ──
  // _parseDMY: parse PaymentDate string from AppScript backend (always "dd-MM-yyyy HH:mm:ss" IST).
  // Also guards against raw JS Date objects (rare Sheets auto-parse edge case).
  function _parseDMY(s) {
    if (!s) return 0;
    // Guard: Date object (Sheets auto-parsed the cell)
    if (s instanceof Date) { const t = s.getTime(); return isNaN(t) ? 0 : t; }
    const str = String(s).trim();
    if (!str) return 0;
    // dd-MM-yyyy HH:mm:ss (AppScript standard)
    const mD = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?/);
    if (mD) {
      const D=+mD[1], M=+mD[2]-1, Y=+mD[3], hh=+(mD[4]||0), mi=+(mD[5]||0), ss=+(mD[6]||0);
      if (D<1||D>31||M<0||M>11) { console.error("[_parseDMY] Bad date in sheet — raw:", str, "| Check CONTRIBUTIONS PaymentDate row with this value."); return 0; }
      return new Date(Y,M,D,hh,mi,ss).getTime();
    }
    // d/M/yyyy h:mm am/pm (admin locale)
    const mS = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?)?/i);
    if (mS) {
      const D=+mS[1], M=+mS[2]-1, Y=+mS[3];
      var hh=+(mS[4]||0), mi=+(mS[5]||0), ss=+(mS[6]||0), ap=(mS[7]||"").toLowerCase();
      if(ap==="pm"&&hh<12)hh+=12; if(ap==="am"&&hh===12)hh=0;
      if (D<1||D>31||M<0||M>11) { console.error("[_parseDMY] Bad date — raw:", str); return 0; }
      return new Date(Y,M,D,hh,mi,ss).getTime();
    }
    const t = new Date(str).getTime();
    return isNaN(t) ? 0 : t;
  }

  function renderTable(list) {
    _pgList = list;
    _pgPage = 1;
    _renderPage();
  }

  function _renderPage() {
    const list = _pgList;
    const totalPages = Math.max(1, Math.ceil(list.length / _pgSize));
    if (_pgPage < 1) _pgPage = 1;
    if (_pgPage > totalPages) _pgPage = totalPages;

    const ce = document.getElementById("recordsCount"); if (ce) ce.textContent = list.length;

    const start = (_pgPage - 1) * _pgSize;
    const pageItems = list.slice(start, start + _pgSize);

    document.getElementById("tableBody").innerHTML = list.length === 0
      ? `<tr><td colspan="7"><div class="empty"><i class="fa-solid fa-receipt"></i><p>No records found</p></div></td></tr>`
      : pageItems.map((c, i) => {
        const globalIdx = start + i;
        let type = types.find(t => String(t.TypeId) === String(c.TypeId))?.TypeName || "Contribution";
        let oName = occasions.find(o => String(o.OccasionId) === String(c.OccasionId))?.OccasionName || "—";
        let uName = users.find(u => String(u.UserId) === String(c.UserId))?.Name || "Me";
        const rid = _storeReceipt(c, uName, type, oName);
        let dRID = (c.ReceiptID || "").replace(new RegExp("^" + APP.legacyReceiptPrefix + "-"), APP.receiptPrefix + "-");
        return `<tr onclick="showReceiptById('${rid}')" title="Click for receipt">
            <td style="color:var(--ink-faint);font-size:12px;">${globalIdx + 1}</td>
            <td class="amt-col">₹ ${fmt(c.Amount)}</td>
            <td><b>${escapeHtml(c.ForMonth || "—")}</b></td>
            <td class="col-year" style="color:var(--ink-soft);">${c.Year || "—"}</td>
            <td><span class="rid-mono">${escapeHtml(dRID)}</span><span class="type-chip">${escapeHtml(type)}</span></td>
            <td style="font-size:11.5px;color:var(--ink-soft);">${escapeHtml(formatPaymentDate(c.PaymentDate))}</td>
            <td class="col-rcpt"><button class="btn-blue btn-sm" onclick="event.stopPropagation();showReceiptById('${rid}')"><i class="fa-solid fa-receipt"></i></button></td>
          </tr>`;
      }).join("");

    // ── Mobile card list ──
    const mobList = document.getElementById("mobCardList");
    if (mobList) {
      mobList.innerHTML = list.length === 0
        ? `<div class="empty" style="padding:28px 16px;"><i class="fa-solid fa-receipt"></i><p>No records found</p></div>`
        : pageItems.map((c, i) => {
          const globalIdx = start + i;
          let type = types.find(t => String(t.TypeId) === String(c.TypeId))?.TypeName || "Contribution";
          let oName = occasions.find(o => String(o.OccasionId) === String(c.OccasionId))?.OccasionName || "—";
          let uName = users.find(u => String(u.UserId) === String(c.UserId))?.Name || "Me";
          const rid = _storeReceipt(c, uName, type, oName);
          let dRID = (c.ReceiptID || "").replace(new RegExp("^" + APP.legacyReceiptPrefix + "-"), APP.receiptPrefix + "-");
          return `<div class="mob-c-card" onclick="showReceiptById('${rid}')">
              <div class="mob-c-top">
                <span class="mob-c-amt">₹ ${fmt(c.Amount)}</span>
                <span class="mob-c-date">${escapeHtml(formatPaymentDate(c.PaymentDate))}</span>
              </div>
              <div class="mob-c-bottom">
                <span class="mob-c-month">${escapeHtml(c.ForMonth || "—")} ${c.Year || ""}</span>
                <span class="type-chip">${escapeHtml(type)}</span>
                <span class="rid-mono" style="font-size:10px;color:var(--ink-faint);">${escapeHtml(dRID)}</span>
              </div>
            </div>`;
        }).join("");
    }

    // Pagination bar
    const bar = document.getElementById("paginationBar");
    if (!bar) return;
    if (list.length <= _pgSize) { bar.innerHTML = ""; return; }

    let pages = "";
    // Always show first, last, current ±1
    const show = new Set([1, totalPages, _pgPage, _pgPage - 1, _pgPage + 1].filter(p => p >= 1 && p <= totalPages));
    const sorted = Array.from(show).sort((a, b) => a - b);
    let prev = -1;
    for (const p of sorted) {
      if (prev !== -1 && p - prev > 1) pages += `<span class="pg-info">…</span>`;
      pages += `<button class="pg-btn${p === _pgPage ? " active" : ""}" onclick="_goPage(${p})">${p}</button>`;
      prev = p;
    }

    bar.innerHTML = `<div class="pagination">
        <button class="pg-btn" onclick="_goPage(${_pgPage - 1})" ${_pgPage === 1 ? "disabled" : ""}>‹</button>
        ${pages}
        <button class="pg-btn" onclick="_goPage(${_pgPage + 1})" ${_pgPage === totalPages ? "disabled" : ""}>›</button>
        <span class="pg-info">${start + 1}–${Math.min(start + _pgSize, list.length)} of ${list.length}</span>
      </div>`;
  }

  function _goPage(p) {
    const totalPages = Math.max(1, Math.ceil(_pgList.length / _pgSize));
    if (p < 1 || p > totalPages) return;
    _pgPage = p;
    const scrollY = window.scrollY;
    _renderPage();
    window.scrollTo({ top: scrollY, behavior: "instant" });
  }

  function showReceiptById(rid) { const d = window._rcptStore[rid]; if (!d) return; showReceipt(d.c, d.userName, d.typeName, d.occasionName, false); }

  function calculateTotal() {
    const total = data.reduce((s, c) => s + Number(c.Amount || 0), 0);
    document.getElementById("totalAmount").innerText = fmt(total);
    const now = new Date(), curY = now.getFullYear(), curM = months[now.getMonth()];

    // ── This-year hero number ──
    const thisYear = data.filter(c => String(c.Year) === String(curY)).reduce((s, c) => s + Number(c.Amount || 0), 0);
    const tyEl = document.getElementById("thisYearAmount");
    if (tyEl) tyEl.innerText = fmt(thisYear);
    const ylEl = document.getElementById("heroYearLabel");
    if (ylEl) ylEl.textContent = curY;

    // ── Last donation row ──
    const approvedData = data.filter(c => (String(c.Status || "Approved")).toLowerCase() === "approved");
    const sorted = approvedData.slice().sort((a, b) => _parseDMY(b.PaymentDate) - _parseDMY(a.PaymentDate));
    const last = sorted[0];
    const ldrEl = document.getElementById("lastDonationRow");
    if (last && ldrEl) {
      document.getElementById("lastDonationAmt").textContent = "₹" + fmt(last.Amount);
      (function() {
        var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        var rawVal = last.PaymentDate;
        var dateStr = "—";
        // Case A: Date object (rare — Sheets auto-parsed the cell)
        if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
          var fd=rawVal, fh=fd.getHours(), fm=fd.getMinutes();
          dateStr=fd.getDate()+" "+MONTHS[fd.getMonth()]+" "+fd.getFullYear()+", "+(fh%12||12)+":"+(fm<10?"0"+fm:fm)+" "+(fh>=12?"PM":"AM");
        } else {
          var raw = String(rawVal || "").trim();
          // Case B: dd-MM-yyyy or d/M/yyyy string (AppScript standard)
          var m = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?)?/i);
          if (m) {
            var D=+m[1], M=+m[2]-1, Y=+m[3], hh=+(m[4]||0), mi=+(m[5]||0);
            var ap=(m[7]||"").toLowerCase();
            if(ap==="pm"&&hh<12)hh+=12; if(ap==="am"&&hh===12)hh=0;
            if (D>=1&&D<=31&&M>=0&&M<=11) {
              var fd=new Date(Y,M,D,hh,mi), fh=fd.getHours(), fm=fd.getMinutes();
              dateStr=D+" "+MONTHS[M]+" "+Y+", "+(fh%12||12)+":"+(fm<10?"0"+fm:fm)+" "+(fh>=12?"PM":"AM");
            } else {
              console.error("[LastDonation] Bad PaymentDate:", raw, "| ReceiptID:", last.ReceiptID||"?", "| Fix dd-MM-yyyy in Google Sheet.");
            }
          } else {
            // Case C: ISO fallback
            var fd2=new Date(raw);
            if(!isNaN(fd2)){var fh2=fd2.getHours(),fm2=fd2.getMinutes();dateStr=fd2.getDate()+" "+MONTHS[fd2.getMonth()]+" "+fd2.getFullYear()+", "+(fh2%12||12)+":"+(fm2<10?"0"+fm2:fm2)+" "+(fh2>=12?"PM":"AM");}
          }
        }
        document.getElementById("lastDonationDate").textContent = dateStr;
      })();
      ldrEl.style.display = "flex";
    }

    // ── Quick stats: This Month + Records ──
    const thisMonth = data.filter(c => String(c.Year) === String(curY) && c.ForMonth === curM).reduce((s, c) => s + Number(c.Amount || 0), 0);
    const noContrib = thisMonth === 0;
    const qs = document.getElementById("quickStats");
    if (qs) {
      const monthCard = noContrib
        ? `<div class="hero-stat hero-stat--no-contrib">
             <div class="hero-stat-l">📅 This Month</div>
             <div class="hero-stat-v">₹0</div>
             <span class="hero-stat-hint">No contribution yet</span>
           </div>`
        : `<div class="hero-stat">
             <div class="hero-stat-l">📅 This Month</div>
             <div class="hero-stat-v">₹${fmt(thisMonth)}</div>
           </div>`;
      const recordsCard = `<div class="hero-stat">
             <div class="hero-stat-l">🧾 Records</div>
             <div class="hero-stat-v">${data.length}</div>
           </div>`;
      qs.innerHTML = monthCard + recordsCard;
    }
  }

  function applyFilter() { _applyAllFilters(); }
  function searchData() { _applyAllFilters(); }
  function resetFilter() {
    ["filterYear", "filterMonth", "filterType"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("searchInput").value = "";
    _pgPage = 1;
    renderTable(data);
  }

  // ── Collapsible filter on mobile
  let _filterOpen = true;
  function _toggleFilter() {
    const body = document.getElementById("filterBody");
    const icon = document.getElementById("filterToggleIcon");
    if (!body) return;
    _filterOpen = !_filterOpen;
    body.style.display = _filterOpen ? "block" : "none";
    if (icon) icon.textContent = _filterOpen ? "▾" : "▸";
  }
  // Auto-collapse filter on mobile when sheet opens
  function _initFilterState() {
    if (window.innerWidth <= 600) {
      _filterOpen = false;
      const body = document.getElementById("filterBody");
      const icon = document.getElementById("filterToggleIcon");
      if (body) body.style.display = "none";
      if (icon) icon.textContent = "▸";
    } else {
      _filterOpen = true;
      const body = document.getElementById("filterBody");
      const icon = document.getElementById("filterToggleIcon");
      if (body) body.style.display = "block";
      if (icon) icon.textContent = "▾";
    }
  }

  // ── Lazy load flags
  let _recordsLoaded = false;
  let _statsLoaded = false;
  let _eventsLoaded = false;

  // ── Accordion toggle for Menu section
  let _accActivePanel = null;

  // ── Shared lazy-load triggers — called by both _toggleAccordion and _openMenuSection
  function _lazyLoadPanel(id) {
    if (id === "panelRecords") {
      if (!_recordsLoaded) { loadFilters(); _recordsLoaded = true; }
      _initFilterState();
      try { renderTable(data); } catch(e) { console.error("[panelRecords] renderTable failed:", e); }
    }
    if (id === "panelStats") {
      if (!_statsLoaded) { loadSummaryYears(); _statsLoaded = true; }
      try { renderSummaries(); } catch(e) { console.error("[panelStats] renderSummaries failed:", e); }
    }
    if (id === "panelEvents" && !_eventsLoaded) {
      _loadUserEvents(); _eventsLoaded = true;
    }
    if (id === "panelPayment") {
      try { _loadUserContribRequests(); } catch(e) { console.error("[panelPayment] _loadUserContribRequests failed:", e); }
    }
    if (id === "panelContact") {
      // Lazy-inject Google Maps iframe only on first open
      var placeholder = document.getElementById("mapPlaceholder");
      if (placeholder) {
        var mapContainer = placeholder.parentNode;
        var iframe = document.createElement("iframe");
        iframe.src = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3576.167950147388!2d82.20519597492734!3d26.321060585267084!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x399a790bd4e8dff3%3A0x93c61c2049ae55f2!2sHanuman%20Mandir!5e0!3m2!1sen!2sin!4v1776331902479!5m2!1sen!2sin";
        iframe.width = "100%";
        iframe.height = "100%";
        iframe.style.cssText = "border:0;vertical-align:middle;";
        iframe.allowFullscreen = true;
        iframe.loading = "lazy";
        iframe.referrerPolicy = "no-referrer-when-downgrade";
        mapContainer.replaceChild(iframe, placeholder);
      }
    }
  }

  function _toggleAccordion(id) {
    const panel     = document.getElementById(id);
    const accBody   = document.getElementById("accBody-" + id);
    const accInner  = document.getElementById("accInner-" + id);
    const accBtn    = document.getElementById("accBtn-" + id);
    if (!panel || !accBody || !accInner || !accBtn) return;

    const isOpen = accBtn.classList.contains("acc-open");

    // Close any currently open accordion first
    if (_accActivePanel && _accActivePanel !== id) {
      const prevBtn   = document.getElementById("accBtn-"  + _accActivePanel);
      const prevBody  = document.getElementById("accBody-" + _accActivePanel);
      const prevInner = document.getElementById("accInner-"+ _accActivePanel);
      if (prevBtn)   { prevBtn.classList.remove("acc-open"); prevBtn.setAttribute("aria-expanded", "false"); }
      if (prevBody)  { prevBody.style.maxHeight = "0"; prevBody.classList.remove("acc-open"); }
      if (prevInner) {
        // Put the panel back in its hidden holding spot
        const prevPanel = document.getElementById(_accActivePanel);
        if (prevPanel) {
          prevPanel.style.display = "none";
          const footer = document.getElementById("userVersionFooter");
          const main   = document.querySelector(".main");
          if (main) { if (footer) main.insertBefore(prevPanel, footer); else main.appendChild(prevPanel); }
        }
        prevInner.innerHTML = "";
      }
      _accActivePanel = null;
    }

    if (isOpen) {
      // Close this one
      accBtn.classList.remove("acc-open");
      accBtn.setAttribute("aria-expanded", "false");
      accBody.style.maxHeight = "0";
      accBody.classList.remove("acc-open");
      // Move panel back to hidden area
      panel.style.display = "none";
      const footer = document.getElementById("userVersionFooter");
      const main   = document.querySelector(".main");
      if (main) { if (footer) main.insertBefore(panel, footer); else main.appendChild(panel); }
      accInner.innerHTML = "";
      _accActivePanel = null;
    } else {
      // Open this one — move panel content into accordion body
      accInner.innerHTML = "";
      accInner.appendChild(panel);
      panel.style.display = "block";
      accBtn.classList.add("acc-open");
      accBtn.setAttribute("aria-expanded", "true");
      accBody.classList.add("acc-open");
      // Read scrollHeight once to avoid multiple forced reflows
      var _accH = accInner.scrollHeight + 80;
      accBody.style.maxHeight = _accH + "px";
      _accActivePanel = id;

      // Scroll the header into view smoothly
      setTimeout(function() {
        accBtn.scrollIntoView({ behavior: "smooth", block: "start" });
        // Re-measure after any synchronous layout shift
        accBody.style.maxHeight = accInner.scrollHeight + 80 + "px";
      }, 60);

      // Lazy load triggers — via shared helper
      _lazyLoadPanel(id);

      // ResizeObserver: auto-expand height whenever inner content grows (e.g. after async fetch)
      if (window.ResizeObserver) {
        if (accInner._roInstance) accInner._roInstance.disconnect();
        const ro = new ResizeObserver(function() {
          if (_accActivePanel === id) {
            accBody.style.maxHeight = accInner.scrollHeight + 80 + "px";
          } else {
            ro.disconnect();
          }
        });
        ro.observe(accInner);
        accInner._roInstance = ro;
      } else {
        // Fallback for browsers without ResizeObserver
        setTimeout(function() {
          if (_accActivePanel === id) accBody.style.maxHeight = accInner.scrollHeight + 80 + "px";
        }, 800);
        setTimeout(function() {
          if (_accActivePanel === id) accBody.style.maxHeight = accInner.scrollHeight + 80 + "px";
        }, 2000);
      }
    }
  }

  // Keep _openMenuSection working (used by quick-action buttons & recent activity)
  // ── Bottom sheet panel config (title + icon per panel)
  const _bsPanelMeta = {
    panelRecords:  { icon: "fa-receipt",             title: "My Contributions" },
    panelStats:    { icon: "fa-chart-bar",            title: "Statistics" },
    panelEvents:   { icon: "fa-calendar-star",        title: "Events & Festivals" },
    panelPayment:  { icon: "fa-hand-holding-dollar",  title: "Submit Payment" },
    panelFeedback: { icon: "fa-comment-dots",         title: "Feedback" },
    panelContact:  { icon: "fa-phone",                title: "Temple Contact" },
  };

  // ── Open bottom sheet with panel content
  function _openMenuSection(id) {
    const panel = document.getElementById(id);
    if (!panel) return;

    // Move panel content into sheet body
    const body = document.getElementById("bsBody");
    const titleEl = document.getElementById("bsTitle");
    const meta = _bsPanelMeta[id] || { icon: "fa-list-ul", title: "Menu" };

    titleEl.innerHTML = `<i class="fa-solid ${meta.icon}"></i> <span>${meta.title}</span>`;
    body.innerHTML = "";
    body.appendChild(panel);
    panel.style.display = "block";
    body.scrollTop = 0;

    // Show overlay + slide sheet up
    const overlay = document.getElementById("bsOverlay");
    const sheet = document.getElementById("bsSheet");
    overlay.classList.add("open");
    overlay.removeAttribute("aria-hidden");
    // force reflow so transition plays
    sheet.offsetHeight;
    sheet.classList.add("open");
    document.body.style.overflow = "hidden";

    // Lazy load triggers — via shared helper
    _lazyLoadPanel(id);

    // Store which panel is open so we can put it back on close
    sheet._activePanelId = id;
  }

  // ── Close bottom sheet — put panel back in DOM so it stays available
  function _closeSheet() {
    const sheet = document.getElementById("bsSheet");
    const overlay = document.getElementById("bsOverlay");
    sheet.classList.remove("open");
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";

    // After animation ends, move panel back to main and hide it
    setTimeout(function() {
      const activePanelId = sheet._activePanelId;
      if (!activePanelId) return;
      const panel = document.getElementById(activePanelId);
      const main = document.querySelector(".main");
      if (panel && main) {
        panel.style.display = "none";
        // Put it back before version footer
        const footer = document.getElementById("userVersionFooter");
        if (footer) main.insertBefore(panel, footer);
        else main.appendChild(panel);
      }
      document.getElementById("bsBody").innerHTML = "";
      sheet._activePanelId = null;
    }, 360);
  }

  // Keep old _closeMenuSection as alias (called by back buttons inside panels)
  function _closeMenuSection(id) { _closeSheet(); }

  // ── Haptic feedback (silent fail on unsupported devices)
  function _haptic(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch(e) {}
  }

  // ── Button loading state helpers
  function _btnLoad(btn, goldSpinner) {
    if (!btn) return;
    btn._origHTML = btn.innerHTML;
    btn._origDisabled = btn.disabled;
    btn.classList.add("btn-loading");
    if (goldSpinner) btn.classList.add("btn-loading-gold");
    btn.disabled = true;
  }
  function _btnDone(btn) {
    if (!btn) return;
    btn.classList.remove("btn-loading", "btn-loading-gold");
    btn.disabled = btn._origDisabled || false;
    if (btn._origHTML !== undefined) btn.innerHTML = btn._origHTML;
  }

  // ── Tap ripple — call on any button/menu tap
  function _ripple(e) {
    const el = e.currentTarget;
    if (!el) return;
    el.classList.add("ripple-host");
    const r = document.createElement("div");
    r.className = "ripple-circle";
    const rect = el.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    r.style.left = x + "px";
    r.style.top = y + "px";
    el.appendChild(r);
    r.addEventListener("animationend", function() { r.remove(); });
  }

  // ── Attach ripple + haptic to menu items and qa-btns
  (function() {
    function _attach(el) {
      el.addEventListener("click", function(e) { _ripple(e); _haptic(8); });
    }
    document.querySelectorAll(".menu-item, .qa-btn").forEach(_attach);
  })();

  // ── Pull to refresh
  (function() {
    let startY = 0, pulling = false, triggered = false;
    const indicator = document.getElementById("ptr-indicator");
    const spinner = document.getElementById("ptrSpinner");
    const ptrText = document.getElementById("ptrText");
    if (!indicator) return;

    document.addEventListener("touchstart", function(e) {
      // Only activate when at top of page and sheet is closed
      const sheet = document.getElementById("bsSheet");
      if (sheet && sheet.classList.contains("open")) return;
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
        triggered = false;
      }
    }, { passive: true })

    document.addEventListener("touchmove", function(e) {
      if (!pulling) return;
      const dist = e.touches[0].clientY - startY;
      if (dist < 0) { pulling = false; return; }
      if (dist > 20 && dist < 90) {
        indicator.classList.add("ptr-visible");
        ptrText.textContent = "Pull to refresh";
        spinner.classList.remove("spinning");
      }
      if (dist >= 90 && !triggered) {
        triggered = true;
        ptrText.textContent = "Release to refresh";
      }
    }, { passive: true })

    document.addEventListener("touchend", function() {
      if (!pulling) return;
      pulling = false;
      if (triggered) {
        // Show spinning state
        spinner.classList.add("spinning");
        ptrText.textContent = "Refreshing…";
        _haptic(12);
        // Re-run init to refresh data
        try {
          // Reset lazy flags — filters + stats year selector rebuild, events refetch
          _recordsLoaded = false;
          _statsLoaded = false;
          _eventsLoaded = false;
          _contribReqsLoaded = false;
          // Reset retry counter so fresh pull-to-refresh starts from attempt 1
          _uloRetryCount = 0;
          _clearCountdown();
          _showUserLoadingOverlay();
          if (typeof init === "function") init().then(function() {
            indicator.classList.remove("ptr-visible");
            spinner.classList.remove("spinning");
          }).catch(function() {
            indicator.classList.remove("ptr-visible");
            spinner.classList.remove("spinning");
            // Overlay already shows error state from inside init()
          });
        } catch(e) {
          indicator.classList.remove("ptr-visible");
        }
      } else {
        indicator.classList.remove("ptr-visible");
      }
      triggered = false;
    }, { passive: true })
  })();

  // ── Swipe down to close gesture
  (function() {
    const handle = document.getElementById("bsHandle");
    const sheet = document.getElementById("bsSheet");
    if (!handle || !sheet) return;
    let startY = 0, currentY = 0, dragging = false;

    function onStart(e) {
      if (!sheet.classList.contains("open")) return;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      dragging = true;
      sheet.style.transition = "none";
    }
    function onMove(e) {
      if (!dragging) return;
      currentY = (e.touches ? e.touches[0].clientY : e.clientY) - startY;
      if (currentY < 0) currentY = 0;
      sheet.style.transform = `translateY(${currentY}px)`;
    }
    function onEnd() {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = "transform .35s cubic-bezier(.32,1,.23,1)";
      if (currentY > 120) {
        _closeSheet();
        sheet.style.transform = "";
      } else {
        sheet.style.transform = "translateY(0)";
      }
      currentY = 0;
    }
    handle.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    handle.addEventListener("mousedown", onStart);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
  })();

  // ── Close sheet on Escape key
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") _closeSheet();
  });

  // ── Recent Activity strip (last 5 records) ──
  function _renderRecentActivity() {
    var el = document.getElementById("recentActivityList");
    if (!el || !data || data.length === 0) {
      if (el) el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--ink-faint);font-size:13px;"><i class="fa-solid fa-receipt" style="opacity:.3;font-size:1.6rem;display:block;margin-bottom:6px;"></i>No records yet</div>';
      return;
    }
    var sorted = data.slice().sort(function(a, b) { return _parseDMY(b.PaymentDate) - _parseDMY(a.PaymentDate); });
    var recent = sorted.slice(0, 5);
    el.innerHTML = recent.map(function(c) {
      var type = (types.find(function(t) { return String(t.TypeId) === String(c.TypeId); }) || {}).TypeName || "Contribution";
      var status = String(c.Status || "Approved");
      var statusColor = status.toLowerCase() === "approved" ? "var(--green)" : status.toLowerCase() === "pending" ? "#f59e0b" : "var(--red)";
      // Build tooltip rows for full transaction details
      var tipRows = [
        ["Month", escapeHtml(c.ForMonth || "—") + (c.Year ? " " + c.Year : "")],
        ["Amount", "₹ " + fmt(c.Amount)],
        ["Type", escapeHtml(type)],
        ["Status", escapeHtml(status)],
        ["Date", escapeHtml(c.PaymentDate || "—")],
        ["Mode", escapeHtml(c.PaymentMode || "—")],
        ["Receipt", escapeHtml(c.ReceiptID || "—")],
      ];
      if (c.UtrRef) tipRows.push(["UTR/Ref", escapeHtml(c.UtrRef)]);
      if (c.Note) tipRows.push(["Note", escapeHtml(c.Note)]);
      var tipHtml = tipRows.map(function(r) {
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;border-bottom:1px solid rgba(247,160,26,0.08);">'
          + '<span style="color:var(--ink-faint);font-size:10px;white-space:nowrap;">' + r[0] + '</span>'
          + '<span style="font-weight:600;font-size:11px;color:var(--ink);">' + r[1] + '</span>'
          + '</div>';
      }).join("");
      return '<div class="ra-item ra-item-noclk" style="cursor:default;position:relative;">'
        + '<div class="ra-dot ra-dot-gold"></div>'
        + '<div class="_u-flex-1">'
        + '<div class="ra-month">' + escapeHtml(c.ForMonth || "—") + " " + (c.Year || "") + '</div>'
        + '<div class="ra-type">' + escapeHtml(type) + '</div>'
        + '</div>'
        + '<div class="ra-right">'
        + '<div class="ra-amt">₹ ' + fmt(c.Amount) + '</div>'
        + '<div class="ra-status" style="color:' + statusColor + ';font-size:10px;">' + escapeHtml(status) + '</div>'
        + '</div>'
        + '<div class="ra-tooltip">'
        + '<div style="font-family:var(--font-h);font-size:11px;font-weight:700;color:var(--gold);margin-bottom:6px;padding-bottom:5px;border-bottom:1.5px solid rgba(247,160,26,0.2);">Transaction Details</div>'
        + tipHtml
        + '</div>'
        + '</div>';
    }).join("");
    // Update records menu badge
    var mb = document.getElementById("menuBadgeRecords");
    if (mb && data.length > 0) { mb.textContent = data.length + " records"; mb.style.display = "inline"; }
  }
  // FIX 3: Click-to-show details on recent activity — clean modal
  function _raItemClick(el) {
    // Read data from tooltip rows
    var tooltip = el.querySelector('.ra-tooltip');
    if (!tooltip) return;
    var rows = tooltip.querySelectorAll('[style*="justify-content:space-between"]');
    if (!rows.length) return;

    var rowsHtml = Array.from(rows).map(function(r) {
      var label = r.children[0] ? r.children[0].textContent : '';
      var value = r.children[1] ? r.children[1].textContent : '';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid rgba(247,160,26,0.1);">'
        + '<span style="font-size:12px;color:var(--ink-faint);font-weight:500;">' + label + '</span>'
        + '<span style="font-size:13px;font-weight:700;color:var(--ink);max-width:60%;word-break:break-word;">' + value + '</span>'
        + '</div>';
    }).join('');

    var isDark = document.body.classList.contains('user-dark');
    var bgCard = isDark ? '#111827' : '#ffffff';
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.55);display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);animation:fadeInBg .2s ease;';
    overlay.innerHTML = '<div style="background:' + bgCard + ';width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:0 0 20px;box-shadow:0 -8px 40px rgba(0,0,0,0.3);animation:slideUpSheet .22s ease;">'
      + '<div style="width:40px;height:4px;background:rgba(247,160,26,0.35);border-radius:2px;margin:10px auto 0;"></div>'
      + '<div style="background:linear-gradient(135deg,#2a0f00,#3c1a00);padding:13px 16px 11px;margin:8px 0 0;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid rgba(247,160,26,0.3);">'
      + '<div style="display:flex;align-items:center;gap:9px;">'
      + '<div style="width:30px;height:30px;background:rgba(247,160,26,0.18);border-radius:8px;display:flex;align-items:center;justify-content:center;">'
      + '<i class="fa-solid fa-receipt" style="color:#f7a01a;font-size:0.8rem;"></i></div>'
      + '<span style="font-family:var(--font-h);font-weight:700;font-size:14px;color:#fff;">Transaction Details</span>'
      + '</div>'
      + '<button onclick="document.querySelector(\\"[data-ra-modal]\\").remove()" style="background:rgba(255,255,255,0.1);border:none;color:rgba(255,255,255,0.7);width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">&#x2715;</button>'
      + '</div>'
      + '<div style="padding:4px 16px 0;">' + rowsHtml + '</div>'
      + '</div>';
    overlay.setAttribute('data-ra-modal', '1');
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function _applyAllFilters() {
    let y = document.getElementById("filterYear").value, m = document.getElementById("filterMonth").value,
      t = document.getElementById("filterType").value, txt = document.getElementById("searchInput").value.toLowerCase();
    renderTable(data.filter(c => {
      if (y && String(c.Year) !== y) return false; if (m && (c.ForMonth||"").toLowerCase() !== m.toLowerCase()) return false; if (t && String(c.TypeId) !== String(t)) return false;
      if (txt) {
        let tn = types.find(x => String(x.TypeId) === String(c.TypeId))?.TypeName || "", dR = (c.ReceiptID || "").replace(new RegExp("^" + APP.legacyReceiptPrefix + "-"), APP.receiptPrefix + "-");
        return tn.toLowerCase().includes(txt) || (c.ForMonth || "").toLowerCase().includes(txt) || String(c.Amount).includes(txt) || (c.PaymentDate || "").toLowerCase().includes(txt) || String(c.Year || "").includes(txt) || dR.toLowerCase().includes(txt) || (c.ReceiptID || "").toLowerCase().includes(txt);
      }
      return true;
    }));
  }

  // ── Lazy-load jsPDF + autotable on first export click (saves ~450KB on page load)
  let _jspdfLoading = null;
  function _loadJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (_jspdfLoading) return _jspdfLoading;
    function _addScript(src) {
      return new Promise(function(resolve, reject) {
        var s = document.createElement("script");
        s.src = src; s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    _jspdfLoading = _addScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js")
      .then(function() { return _addScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js"); })
      .then(function() { _jspdfLoading = null; });
    return _jspdfLoading;
  }

  async function exportPDF() {
    await _loadJsPDF();
    const { jsPDF } = window.jspdf;
    let doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    let s = _sess(), w = doc.internal.pageSize.getWidth();

    // ── BROWN/GOLD header matching dashboard theme
    // Header bg — brown gradient approximated as solid
    doc.setFillColor(42, 15, 0);
    doc.rect(0, 0, w, 32, "F");
    // Gold accent line
    doc.setFillColor(247, 160, 26);
    doc.rect(0, 32, w, 1.2, "F");

    // Temple name
    doc.setTextColor(247, 160, 26);
    doc.setFontSize(15); doc.setFont(undefined, "bold");
    doc.text(APP.name.toUpperCase(), w / 2, 10, { align: "center" });

    // Subtitle
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5); doc.setFont(undefined, "normal");
    doc.text(APP.address, w / 2, 16, { align: "center" });
    doc.text("CONTRIBUTION STATEMENT — OFFICIAL DOCUMENT", w / 2, 21, { align: "center" });

    // Gold Om symbol right side
    // OM removed per user request

    // ── Member info block
    let Y = 40;
    doc.setFillColor(253, 248, 240);
    doc.rect(10, Y - 5, w - 20, 22, "F");
    doc.setDrawColor(247, 160, 26);
    doc.setLineWidth(0.4);
    doc.rect(10, Y - 5, w - 20, 22);

    doc.setTextColor(42, 15, 0);
    doc.setFontSize(10); doc.setFont(undefined, "bold");
    doc.text("Member:", 14, Y + 2);
    doc.setFont(undefined, "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(s.name.toUpperCase(), 38, Y + 2);

    let fY = document.getElementById("filterYear")?.value || "",
        fM = document.getElementById("filterMonth")?.value || "",
        fT = document.getElementById("filterType")?.value || "",
        srch = document.getElementById("searchInput")?.value?.toLowerCase() || "";
    const fLbl = [fY ? `Year: ${fY}` : "", fM ? `Month: ${fM}` : "",
      fT ? `Type: ${(types.find(t => String(t.TypeId) === fT) || {}).TypeName || ""}` : "",
      srch ? `Search: "${srch}"` : ""].filter(Boolean).join("  ·  ") || "All Records";

    doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text(`Filter: ${fLbl}`, 14, Y + 8);
    doc.text(`Generated: ${new Date().toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}`, 14, Y + 13);
    doc.setFont(undefined, "italic");
    doc.text(APP.footerNote, w - 14, Y + 13, { align: "right" });

    Y += 28;

    // ── Filtered data
    let filtered = data.filter(c => {
      let t = types.find(x => String(x.TypeId) === String(c.TypeId))?.TypeName || "",
          dR = (c.ReceiptID || "").replace(new RegExp("^" + APP.legacyReceiptPrefix + "-"), APP.receiptPrefix + "-");
      let base = (!fY || String(c.Year) === fY) && (!fM || c.ForMonth === fM) && (!fT || String(c.TypeId) === String(fT));
      if (!base) return false; if (!srch) return true;
      return t.toLowerCase().includes(srch) || String(c.Amount).includes(srch) ||
        (c.ForMonth || "").toLowerCase().includes(srch) || dR.toLowerCase().includes(srch);
    });
    let tot = filtered.reduce((s, c) => s + Number(c.Amount || 0), 0);

    // Total summary pill
    doc.setFillColor(42, 15, 0);
    doc.roundedRect(14, Y - 4, 80, 10, 2, 2, "F");
    doc.setTextColor(247, 160, 26);
    doc.setFontSize(9); doc.setFont(undefined, "bold");
    doc.text(`Total: Rs. ${tot.toLocaleString("en-IN")}  (${filtered.length} record${filtered.length !== 1 ? "s" : ""})`, 18, Y + 2.5);

    Y += 10;

    // ── Table with brown/gold theme
    let rows = filtered.map((c, i) => {
      let tN = types.find(x => String(x.TypeId) === String(c.TypeId))?.TypeName || "—",
          dR = (c.ReceiptID || "").replace(new RegExp("^" + APP.legacyReceiptPrefix + "-"), APP.receiptPrefix + "-");
      return [String(i + 1), "Rs." + Number(c.Amount || 0).toLocaleString("en-IN"),
        c.ForMonth || "—", String(c.Year || "—"), tN, dR, formatPaymentDate(c.PaymentDate)];
    });

    if (rows.length > 0) {
      doc.autoTable({
        head: [["#", "Amount (Rs.)", "Month", "Year", "Type", "Tracking ID", "Date"]],
        body: rows, startY: Y,
        theme: "grid",
        headStyles: { fillColor: [42, 15, 0], textColor: [247, 160, 26], fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59] },
        columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 26 }, 5: { cellWidth: 36 } },
        alternateRowStyles: { fillColor: [253, 248, 240] },
        rowPageBreak: "auto",
      });
    } else {
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(10);
      doc.text("No records found for selected filters.", 14, Y + 6);
    }

    // QR code removed per user request

    // ── Footer on every page
    let pc = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pc; i++) {
      doc.setPage(i);
      let ph = doc.internal.pageSize.getHeight();
      doc.setFillColor(42, 15, 0);
      doc.rect(0, ph - 10, w, 10, "F");
      doc.setFillColor(247, 160, 26);
      doc.rect(0, ph - 10, w, 0.8, "F");
      doc.setFontSize(6.5); doc.setTextColor(180, 140, 80); doc.setFont(undefined, "normal");
      doc.text((APP.name + ", " + APP.location + "  ·  " + APP.footerNote).toUpperCase(), w / 2, ph - 4, { align: "center" });
      doc.setTextColor(120, 100, 60);
      doc.text(`Page ${i} of ${pc}`, w - 10, ph - 4, { align: "right" });
    }

    doc.save(`${APP.shortName}_Statement_${s.name.replace(/\s+/g, "_")}_${Date.now()}.pdf`);
  }

  /* ═══ MEMBER ID CARD PDF ═════════════════════════════════════════
Generates a CR80 landscape ID card (85.6 × 54 mm).
Uses jsPDF already loaded. No server call needed.
═══════════════════════════════════════════════════════════════ */
  // ✅ Helper: load image → base64
  function loadImageAsBase64(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";

      img.onload = function () {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        resolve(canvas.toDataURL("image/png"));
      };

      img.onerror = reject;
      img.src = url;
    });
  }

  async function downloadMemberIDCard() {
    try {
      await _loadJsPDF();
      const { jsPDF } = window.jspdf;

      const s = (_sess() || {});
      const myProfile = (typeof users !== "undefined" ? users : [])
        .find(u => String(u.UserId) === String(s.userId));

      if (!myProfile) {
        toast("Profile not loaded", "warn");
        return;
      }

      const W = 85.6;
      const H = 54;

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: [H, W]
      });

      const INK = [30, 41, 59];
      const GOLD = [247, 160, 26];
      const WHITE = [255, 255, 255];
      const LIGHT = [248, 250, 252];
      const MUTED = [100, 116, 139];

      // ✅ Load logo — try multiple path/case variants
      let LOGO = null;
      const _logoPaths = ["Image/logo.PNG", "image/logo.png", "Image/logo.png", "image/logo.PNG"];
      for (const _lp of _logoPaths) {
        try { LOGO = await loadImageAsBase64(_lp); if (LOGO) break; } catch (e) { /* try next */ }
      }

      // ✅ Load profile photo via Apps Script proxy (solves CORS block on Drive URLs)
      let PHOTO = null;
      if (myProfile.PhotoURL) {
        try {
          PHOTO = await _fetchPhotoBase64(myProfile.PhotoURL);
        } catch (e) { PHOTO = null; }
      }

      // Background
      doc.setFillColor(...LIGHT);
      doc.rect(0, 0, W, H, "F");

      // Header
      doc.setFillColor(...INK);
      doc.rect(0, 0, W, 14, "F");

      // Logo — aligned with photo column (x=4), vertically centered in header
      if (LOGO) {
        const logoSize = 10;
        const logoX = 4;          // aligned with photoX below
        const logoY = 2;          // (14 - 10) / 2 = 2
        // Gold ring around logo
        doc.setDrawColor(...GOLD);
        doc.setLineWidth(0.6);
        doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 0.7, "S");
        doc.addImage(LOGO, "PNG", logoX, logoY, logoSize, logoSize);
      }

      // Gold line
      doc.setFillColor(...GOLD);
      doc.rect(0, 14, W, 1.2, "F");

      // Temple name — centered across full card width
      doc.setTextColor(...GOLD);
      doc.setFontSize(9.5);
      doc.setFont(undefined, "bold");
      doc.text(APP.name.toUpperCase(), W / 2, 6.5, { align: "center" });

      // Address — centered across full card width
      doc.setTextColor(...WHITE);
      doc.setFontSize(5.5);
      doc.setFont(undefined, "normal");
      doc.text(APP.address, W / 2, 11.5, { align: "center" });

      // 🔲 Square Photo area
      const photoSize = 20;
      const photoX = 4;
      const photoY = 22;

      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.8);
      doc.rect(photoX, photoY, photoSize, photoSize, "S");

      const initials = (myProfile.Name || "?")
        .split(" ")
        .map(w => w[0] || "")
        .slice(0, 2)
        .join("")
        .toUpperCase();

      if (PHOTO) {
        // Clip to square and draw actual photo
        try {
          doc.addImage(PHOTO, "JPEG", photoX + 0.4, photoY + 0.4, photoSize - 0.8, photoSize - 0.8);
        } catch (e) {
          // Fall back to initials if addImage fails
          doc.setFillColor(...INK);
          doc.rect(photoX + 0.5, photoY + 0.5, photoSize - 1, photoSize - 1, "F");
          doc.setTextColor(...GOLD);
          doc.setFontSize(10);
          doc.setFont(undefined, "bold");
          doc.text(initials, photoX + photoSize / 2, photoY + photoSize / 2 + 3, { align: "center" });
        }
      } else {
        doc.setFillColor(...INK);
        doc.rect(photoX + 0.5, photoY + 0.5, photoSize - 1, photoSize - 1, "F");
        doc.setTextColor(...GOLD);
        doc.setFontSize(10);
        doc.setFont(undefined, "bold");
        doc.text(initials, photoX + photoSize / 2, photoY + photoSize / 2 + 3, { align: "center" });
      }

      // Details
      const detX = photoX + photoSize + 4;

      doc.setTextColor(...INK);
      doc.setFontSize(10);
      doc.setFont(undefined, "bold");
      doc.text(String(myProfile.Name || "—"), detX, 22);

      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(String(myProfile.Role || "User"), detX, 27);

      doc.setDrawColor(226, 232, 240);
      doc.line(detX, 29, W - 4, 29);

      doc.setFontSize(7);
      doc.setFont(undefined, "bold");
      doc.setTextColor(...MUTED);
      doc.text("MEMBER ID", detX, 34);

      doc.setFont(undefined, "normal");
      doc.setTextColor(...INK);
      doc.text(String(myProfile.UserId || "—"), detX + 22, 34);

      doc.setFont(undefined, "bold");
      doc.setTextColor(...MUTED);
      doc.text("MOBILE", detX, 39);

      doc.setFont(undefined, "normal");
      doc.setTextColor(...INK);
      doc.text(String(myProfile.Mobile || "—"), detX + 22, 39);

      if (myProfile.Village) {
        doc.setFont(undefined, "bold");
        doc.setTextColor(...MUTED);
        doc.text("VILLAGE", detX, 44);

        doc.setFont(undefined, "normal");
        doc.setTextColor(...INK);
        doc.text(String(myProfile.Village), detX + 22, 44);
      }

      // Footer
      doc.setFillColor(...INK);
      doc.rect(0, H - 8, W, 8, "F");

      doc.setTextColor(...GOLD);
      doc.setFontSize(6);
      doc.setFont(undefined, "bold");
      doc.text(APP.tagline, 4, H - 3);

      doc.setTextColor(148, 163, 184);
      doc.setFontSize(5.5);
      const issued = "Issued: " + new Date().toLocaleDateString("en-IN");
      doc.text(issued, W - 4, H - 3, { align: "right" });

      // Border
      doc.setDrawColor(203, 213, 225);
      doc.rect(0.2, 0.2, W - 0.4, H - 0.4);

      doc.save("IDCard_" + (myProfile.Name || "member") + ".pdf");

    } catch (err) {
      toast("❌ Error: " + err.message, "error");
    }
  }

  // ── Safe init() bootstrap
  // init() handles all its own errors via the overlay.
  // This outer guard fires if app.js itself failed to load, or an unexpected throw escapes.
  if (typeof init === "function") {
    _showUserLoadingOverlay(); // Show overlay before first init() run
    init().catch(function(e) {
      // Should not normally reach here — init() catches internally.
      console.error("[startup] Unhandled rejection from init():", e);
      if (typeof _showUserLoadingError === "function") { _showUserLoadingError(e); }
    });
  } else {
    // app.js failed to load — show error directly in the overlay
    console.error("[startup] init() not defined — app.js may have failed to load.");
    (function() {
      var ov = document.getElementById("userLoadingOverlay");
      var reason = document.getElementById("ulo_reason");
      var loadEl = document.getElementById("ulo_loading");
      var errEl  = document.getElementById("ulo_error");
      if (ov && errEl) {
        if (loadEl) loadEl.style.display = "none";
        errEl.classList.add("show");
        if (reason) reason.innerHTML = "<strong style='color:#78350f;'>⚠️ App Failed to Load</strong><br/><span>A required script could not be loaded. Check your connection and tap Retry, or try a hard refresh.</span>";
        ov.classList.add("show");
      }
    })();
  }
  // ── broadcastSessionRevoke — guarded so a missing app.js doesn't crash the page
  (function () { try { const s = _sess(); if (s && s.userId && typeof broadcastSessionRevoke === "function") broadcastSessionRevoke(s.userId); } catch(e) {} })();
  //    1. Auto-load jsPDF if not loaded (fixes "PDF library not loaded" error)
  //    2. Enhance QR data to include name + amount + date
  //    3. Sync receipt header to brown/gold dashboard theme
  const _origExportReceiptPDF = window.exportReceiptPDF;
  window.exportReceiptPDF = async function(rid) {
    // Ensure jsPDF is loaded before calling app.js version
    try { await _loadJsPDF(); } catch(e) {}
    // Ensure QRCode lib is loaded
    if (!window.QRCode) {
      await new Promise(function(res) {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
        s.onload = res; s.onerror = res;
        document.head.appendChild(s);
      });
    }
    // Patch _generateQRDataUrl to embed richer data
    const _origQR = window._generateQRDataUrl;
    window._generateQRDataUrl = async function(text, sizePx) {
      // text is displayRID — enrich it with user context
      const stored = window._rcptStore && Object.values(window._rcptStore).find(function(v) {
        return v && v.c && ((v.c.ReceiptID || "").replace(new RegExp("^" + APP.legacyReceiptPrefix + "-"), APP.receiptPrefix + "-") === text || text === (v.c.ReceiptID || "").replace(new RegExp("^" + APP.legacyReceiptPrefix + "-"), APP.receiptPrefix + "-"));
      });
      let richText = text;
      if (stored) {
        const s = (_sess() || {});
        richText = "Receipt: " + text
          + " | Member: " + (stored.userName || s.name || "")
          + " | Amount: Rs." + Number(stored.c.Amount || 0).toLocaleString("en-IN")
          + " | Month: " + (stored.c.ForMonth || "") + " " + (stored.c.Year || "")
          + " | Date: " + formatPaymentDate(stored.c.PaymentDate)
          + " | Mandir: " + APP.name + ", " + APP.location;
      }
      if (_origQR) return _origQR(richText, sizePx);
      return null;
    };
    if (_origExportReceiptPDF) await _origExportReceiptPDF(rid);
    // Restore original
    window._generateQRDataUrl = _origQR;
  };

  // ── Override showReceipt to sync header color to brown/gold theme
  const _origShowReceipt = window.showReceipt;
  window.showReceipt = function(c, userName, typeName, occasionName, isAdmin) {
    _origShowReceipt(c, userName, typeName, occasionName, isAdmin);
    // After modal renders, find the header band by data attribute set by app.js,
    // or fall back to first child div of ._mbdy that has a dark background.
    // Using firstElementChild is more reliable than colour-string matching.
    setTimeout(function() {
      const modal = document.querySelector("._mbdy");
      if (!modal) return;
      const hdrBand = modal.querySelector("[data-receipt-header]") ||
                      modal.firstElementChild;
      if (hdrBand) {
        hdrBand.style.background = "linear-gradient(135deg,#2a0f00 0%,#3c1a00 60%,#2a0f00 100%)";
      }
    }, 30);
  };

  // ════════════════════════════════════════════════════════════
  //  USER.HTML — All priority changes JS
  // ════════════════════════════════════════════════════════════

  // NOTE: H12 remember-me restore is handled by the session guard IIFE immediately
  // after app.js loads. The duplicate here has been removed to avoid redundant
  // localStorage reads on every page load.

  // ── Hook into init to populate hero pill after data loads
  // _origInit() is the retry-aware init(). It never rejects — errors go to the overlay.
  const _origInit = window.init;
  if (typeof _origInit === "function") {
    window.init = async function () {
      await _origInit();
      // Skip post-init work if the overlay is still visible (error state)
      var _ov = document.getElementById("userLoadingOverlay");
      if (_ov && _ov.classList.contains("show")) return;
      _setUserVersion();
      // Hero pill — show member status
      try {
        const s2 = (_sess() || {});
        const pill = document.getElementById("heroPill");
        if (pill && typeof users !== "undefined") {
          const mp = users.find(u => String(u.UserId) === String(s2.userId));
          if (mp) {
            const st = String(mp.Status || "Active");
            const isActive = st.toLowerCase() === "active";
            const yr = mp.Year || new Date().getFullYear();
            pill.textContent = (isActive ? "✦ Active" : "⏳ " + st) + (yr ? " · " + yr : "");
            pill.style.color = isActive ? "var(--gold)" : "#f59e0b";
            pill.style.display = "block";
          }
        }
      } catch(e) {}
    };
  }

  // ── M18: Version footer
  function _setUserVersion() {
    const el = document.getElementById("userVersionFooter");
    if (el) el.textContent = "v" + APP.version + " · " + APP.name;
    document.title = "My Dashboard — " + APP.name;
    // Inject APP.symbol into hero ::after CSS variable
    document.documentElement.style.setProperty("--hero-symbol", '"' + (APP.symbol || "🕉️") + '"');
    // Inject APP.receiptPrefix into search placeholder
    const si = document.getElementById("searchInput");
    if (si) si.placeholder = "Amount, " + APP.receiptPrefix + "-…";
  }

  // ── Helper: re-measure accBody maxHeight after dynamic content loads
  function _remeasureAccordion(panelId) {
    const accBody  = document.getElementById("accBody-"  + panelId);
    const accInner = document.getElementById("accInner-" + panelId);
    if (!accBody || !accInner) return;
    if (_accActivePanel !== panelId) return;
    // Use requestAnimationFrame so browser has painted the new content first
    requestAnimationFrame(function() {
      accBody.style.maxHeight = accInner.scrollHeight + 80 + "px";
    });
  }

  // ── M14: Load upcoming events for user portal
  function _loadUserEvents() {
    const container = document.getElementById("eventsContainer");
    if (!container) return;
    getData("getEventData").then(function (res) {
      const events = (res && res.events) || [];
      // Show only Upcoming or Active events
      const visible = events.filter(function (ev) {
        const status = String(ev.Status || "Upcoming");
        return status === "Upcoming" || status === "Active";
      }).sort(function (a, b) {
        return new Date(a.StartDate || 0) - new Date(b.StartDate || 0);
      });
      if (visible.length === 0) {
        container.innerHTML = '<div class="card" style="text-align:center;color:var(--ink-faint);padding:20px;font-size:13px;">No upcoming events at the moment.</div>';
        _remeasureAccordion("panelEvents");
        return;
      }
      // Helper: format date nicely
      function fmtEvDate(d) {
        if (!d) return "";
        try {
          const dt = new Date(d);
          if (isNaN(dt)) return String(d);
          return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
        } catch (e) { return String(d); }
      }
      const catColors = { Festival: "#f7a01a", Pooja: "#8b5cf6", Maintenance: "#64748b", Community: "#22c55e", Other: "#3b82f6" };
      const catIcons = { Festival: "fa-holly-berry", Pooja: "fa-hands-praying", Maintenance: "fa-screwdriver-wrench", Community: "fa-people-group", Other: "fa-calendar-day" };
      container.innerHTML = visible.map(function (ev) {
        // Whitelist category — only use known keys, fall back to "Other" for unknown server values
        const cat = catColors.hasOwnProperty(ev.Category) ? ev.Category : "Other";
        const color = catColors[cat];
        const icon = catIcons[cat];
        const start = fmtEvDate(ev.StartDate);
        const end = fmtEvDate(ev.EndDate);
        const dateStr = start + (end && end !== start ? " — " + end : "");
        return '<div class="card" style="margin-bottom:10px;border-left:3px solid ' + color + ';">'
          + '<div style="display:flex;gap:13px;align-items:flex-start;padding:14px 16px;">'
          + '<div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,' + color + '22,' + color + '11);border:1.5px solid ' + color + '44;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
          + '<i class="fa-solid ' + icon + '" style="color:' + color + ';font-size:17px;"></i></div>'
          + '<div class="_u-flex-1">'
          + '<div style="font-family:var(--font-h);font-weight:700;font-size:14px;color:var(--ink);margin-bottom:3px;">' + escapeHtml(ev.EventName || ev.Name || "") + '</div>'
          + '<div style="font-size:11.5px;color:var(--ink-soft);margin-bottom:4px;display:flex;align-items:center;gap:5px;">'
          + '<i class="fa-solid fa-calendar" style="color:' + color + ';font-size:10px;"></i>'
          + '<span>' + escapeHtml(dateStr) + '</span>'
          + ' <span style="background:' + color + '18;color:' + color + ';font-size:10px;font-weight:700;padding:1px 8px;border-radius:10px;border:1px solid ' + color + '33;">' + escapeHtml(cat) + '</span>'
          + '</div>'
          + (ev.Description ? '<div style="font-size:12px;color:var(--ink-soft);line-height:1.55;">' + escapeHtml(ev.Description) + '</div>' : "")
          + '</div></div></div>';
      }).join("");
      // Re-measure accordion height now that real content has been injected
      _remeasureAccordion("panelEvents");
    }).catch(function () {
      container.innerHTML = '<div class="card" style="text-align:center;padding:20px 16px;">'
        + '<i class="fa-solid fa-triangle-exclamation" style="font-size:1.4rem;color:#f59e0b;display:block;margin-bottom:8px;"></i>'
        + '<div style="font-size:13px;color:var(--ink-soft);font-weight:500;margin-bottom:10px;">Could not load events. Tap to retry.</div>'
        + '<button onclick="_eventsLoaded=false;_loadUserEvents()" style="background:var(--gold);color:#fff;border:none;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer;">'
        + '<i class="fa-solid fa-rotate-right"></i> Retry</button>'
        + '</div>';
      _remeasureAccordion("panelEvents");
    });
  }

  // ── L12: Submit feedback
  function submitFeedback() {
    const subject = (document.getElementById("fb_subject") || {}).value || "";
    const message = (document.getElementById("fb_message") || {}).value || "";
    const msgEl = document.getElementById("fbMsg");
    if (!message.trim()) {
      if (msgEl) { msgEl.textContent = "❌ Please enter a message."; msgEl.style.color = "#e74c3c"; msgEl.style.display = "block"; }
      return;
    }
    const s = _sess();
    if (!s) return;
    if (msgEl) { msgEl.textContent = "Submitting…"; msgEl.style.color = "var(--ink-soft)"; msgEl.style.display = "block"; }
    postData({
      action: "submitFeedback",
      Name: s.name || "",
      Mobile: "",
      Address: "",
      Message: (subject ? "[" + subject + "] " : "") + message
    }).then(function (res) {
      if (res && res.status === "success") {
        if (msgEl) { msgEl.textContent = "✅ Feedback submitted! Thank you."; msgEl.style.color = "#22c55e"; }
        document.getElementById("fb_subject").value = "";
        document.getElementById("fb_message").value = "";
        setTimeout(function () { if (msgEl) msgEl.style.display = "none"; }, 3000);
      } else {
        if (msgEl) { msgEl.textContent = "❌ Could not submit. Please try again."; msgEl.style.color = "#e74c3c"; }
      }
    }).catch(function (err) {
      if (msgEl) { msgEl.textContent = "❌ " + err.message; msgEl.style.color = "#e74c3c"; }
    });
  }

  // ── M16: Direct edit profile shortcut
  function openEditProfileDirect() {
    const s = _sess();
    if (!s) return;
    const myProfile = users.find(u => String(u.UserId) === String(s.userId));
    openEditProfile(null, s.name, s.email || "", myProfile?.Village || "", myProfile?.Address || "", myProfile?.DOB || "");
  }

  // ── H6: Export Year Statement PDF
  // ── PDF Download Confirmation dialog
  function _confirmPdfDownload(type) {
    const existing = document.getElementById("_pdfConfirmOverlay");
    if (existing) existing.remove();

    const isDark = document.body.classList.contains("user-dark");
    const bgCard = isDark ? "#111827" : "#ffffff";
    const bgPage = isDark ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.55)";
    const txtSub  = isDark ? "#94a3b8" : "#64748b";
    const txtMain = isDark ? "#f1f5f9" : "#141b2d";
    const borderC = isDark ? "rgba(247,160,26,0.22)" : "rgba(247,160,26,0.18)";
    const dividerC = isDark ? "rgba(255,255,255,0.07)" : "#f1f5f9";
    const isAnnual = type === "annual";
    const iconClass = isAnnual ? "fa-file-invoice" : "fa-file-pdf";
    const title = isAnnual ? "Annual Contribution Statement" : "Full Contribution History";

    const ov = document.createElement("div");
    ov.id = "_pdfConfirmOverlay";
    ov.style.cssText = "position:fixed;inset:0;z-index:9999;background:" + bgPage + ";display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);";
    ov.innerHTML = `
      <div style="background:${bgCard};border-radius:20px;max-width:370px;width:100%;box-shadow:0 24px 80px rgba(0,0,0,0.45);border:1.5px solid ${borderC};overflow:hidden;animation:dropFade .2s ease;">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,#2a0f00 0%,#3c1a00 60%,#2a0f00 100%);padding:16px 18px;display:flex;align-items:center;gap:11px;border-bottom:2px solid rgba(247,160,26,0.35);">
          <div style="width:38px;height:38px;background:rgba(247,160,26,0.18);border-radius:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="fa-solid ${iconClass}" style="color:#f7a01a;font-size:1rem;"></i>
          </div>
          <div class="_u-flex-1">
            <div style="font-weight:700;font-size:13.5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>
            <div style="font-size:10px;color:rgba(247,160,26,0.65);margin-top:1px;">Download confirmation</div>
          </div>
          <button onclick="document.getElementById('_pdfConfirmOverlay').remove()" style="background:none;border:none;color:rgba(255,255,255,0.45);font-size:17px;cursor:pointer;padding:0;margin-left:4px;box-shadow:none;line-height:1;flex-shrink:0;">✕</button>
        </div>

        <!-- Confirmation message -->
        <div style="padding:20px 18px 6px;text-align:center;">
          <div style="width:52px;height:52px;background:rgba(247,160,26,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
            <i class="fa-solid fa-file-arrow-down" style="color:#f7a01a;font-size:1.4rem;"></i>
          </div>
          <div style="font-size:15px;font-weight:700;color:${txtMain};margin-bottom:8px;">Download PDF?</div>
          <div style="font-size:12.5px;color:${txtSub};line-height:1.7;margin-bottom:4px;">
            ${isAnnual
              ? `Your <strong style="color:${txtMain};">Annual Contribution Statement</strong> for the current year will be downloaded. This official document is useful for tax records and personal reference.`
              : `Your <strong style="color:${txtMain};">Full Contribution History</strong> will be downloaded as a PDF — includes all records based on your current filters. Useful for auditing or personal archives.`
            }
          </div>
          <div style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;background:rgba(247,160,26,0.08);border:1px solid rgba(247,160,26,0.18);border-radius:8px;padding:5px 11px;">
            <i class="fa-solid fa-shield-halved" class="_u-gold-icon-xs"></i>
            <span style="font-size:10.5px;color:${txtSub};font-weight:500;">Saved directly to your device</span>
          </div>
        </div>

        <!-- Yes / No buttons -->
        <div style="padding:18px 18px 22px;display:flex;gap:10px;justify-content:center;">
          <button onclick="document.getElementById('_pdfConfirmOverlay').remove()"
            style="min-width:120px;padding:12px 20px;background:${isDark ? "#1e293b" : "#f1f5f9"};color:${txtSub};border:1.5px solid ${isDark ? "#334155" : "#e2e8f0"};border-radius:11px;font-family:var(--font-b);font-size:14px;font-weight:700;cursor:pointer;box-shadow:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;">
            <i class="fa-solid fa-xmark" style="font-size:12px;"></i> No
          </button>
          <button id="_pdfConfirmBtn" onclick="_doPdfDownload('${type}')"
            style="min-width:140px;padding:12px 20px;background:linear-gradient(135deg,#f7a01a,#e8920a);color:#fff;border:none;border-radius:11px;font-family:var(--font-b);font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(247,160,26,0.38);display:inline-flex;align-items:center;justify-content:center;gap:6px;">
            <i class="fa-solid fa-download" style="font-size:12px;"></i> Yes, Download
          </button>
        </div>

      </div>`;
    ov.addEventListener("click", function(e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }

  function _doPdfDownload(type) {
    const ov = document.getElementById("_pdfConfirmOverlay");
    const btn = document.getElementById("_pdfConfirmBtn");
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating…'; }
    if (type === "annual") {
      exportYearStatementPDF().finally(function() {
        if (ov) ov.remove();
        _btnDone(document.getElementById("btnAnnualReceipt"));
      });
      _btnLoad(document.getElementById("btnAnnualReceipt"));
    } else {
      exportPDF().finally(function() {
        if (ov) ov.remove();
        _btnDone(document.getElementById("btnFullPDF"));
      });
      _btnLoad(document.getElementById("btnFullPDF"));
    }
  }

  async function exportYearStatementPDF() {
    await _loadJsPDF();
    const { jsPDF } = window.jspdf;
    let s = _sess();
    if (!s) { toast("Not logged in.", "error"); return; }

    const yr = String(new Date().getFullYear());
    const allData = typeof data !== "undefined" ? data : [];
    // Filter to current year only — same as exportPDF but year-locked
    let filtered = allData.filter(c => String(c.Year) === yr);
    if (filtered.length === 0) { toast("No records for " + yr, "warn"); return; }

    try {
      let doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let w = doc.internal.pageSize.getWidth();

      // ── EXACT SAME header as exportPDF ──
      doc.setFillColor(42, 15, 0);
      doc.rect(0, 0, w, 32, "F");
      doc.setFillColor(247, 160, 26);
      doc.rect(0, 32, w, 1.2, "F");

      doc.setTextColor(247, 160, 26);
      doc.setFontSize(15); doc.setFont(undefined, "bold");
      doc.text(APP.name.toUpperCase(), w / 2, 10, { align: "center" });

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8.5); doc.setFont(undefined, "normal");
      doc.text(APP.address, w / 2, 16, { align: "center" });
      doc.text("ANNUAL CONTRIBUTION STATEMENT — " + yr + " — OFFICIAL DOCUMENT", w / 2, 21, { align: "center" });

      doc.setTextColor(247, 160, 26);
      doc.setFontSize(18);
      // OM symbol removed per user request

      // ── EXACT SAME member info block as exportPDF ──
      let Y = 40;
      doc.setFillColor(253, 248, 240);
      doc.rect(10, Y - 5, w - 20, 22, "F");
      doc.setDrawColor(247, 160, 26);
      doc.setLineWidth(0.4);
      doc.rect(10, Y - 5, w - 20, 22);

      doc.setTextColor(42, 15, 0);
      doc.setFontSize(10); doc.setFont(undefined, "bold");
      doc.text("Member:", 14, Y + 2);
      doc.setFont(undefined, "normal");
      doc.setTextColor(30, 41, 59);
      doc.text(s.name.toUpperCase(), 38, Y + 2);

      doc.setFontSize(8); doc.setTextColor(100, 116, 139);
      doc.text("Period: January " + yr + " – December " + yr, 14, Y + 8);
      doc.text("Generated: " + new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), 14, Y + 13);
      doc.setFont(undefined, "italic");
      doc.text(APP.footerNote, w - 14, Y + 13, { align: "right" });

      Y += 28;

      let tot = filtered.reduce((acc, c) => acc + Number(c.Amount || 0), 0);

      // ── EXACT SAME total summary pill as exportPDF ──
      doc.setFillColor(42, 15, 0);
      doc.roundedRect(14, Y - 4, 80, 10, 2, 2, "F");
      doc.setTextColor(247, 160, 26);
      doc.setFontSize(9); doc.setFont(undefined, "bold");
      doc.text(`Total: Rs. ${tot.toLocaleString("en-IN")}  (${filtered.length} record${filtered.length !== 1 ? "s" : ""})`, 18, Y + 2.5);

      Y += 10;

      // ── EXACT SAME table columns as exportPDF ──
      let rows = filtered.map((c, i) => {
        let tN = types.find(x => String(x.TypeId) === String(c.TypeId))?.TypeName || "—",
            dR = (c.ReceiptID || "").replace(new RegExp("^" + APP.legacyReceiptPrefix + "-"), APP.receiptPrefix + "-");
        return [String(i + 1), "Rs." + Number(c.Amount || 0).toLocaleString("en-IN"),
          c.ForMonth || "—", String(c.Year || yr), tN, dR, formatPaymentDate(c.PaymentDate)];
      });

      if (rows.length > 0) {
        doc.autoTable({
          head: [["#", "Amount (Rs.)", "Month", "Year", "Type", "Tracking ID", "Date"]],
          body: rows, startY: Y,
          theme: "grid",
          headStyles: { fillColor: [42, 15, 0], textColor: [247, 160, 26], fontStyle: "bold", fontSize: 9 },
          styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59] },
          columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 26 }, 5: { cellWidth: 36 } },
          alternateRowStyles: { fillColor: [253, 248, 240] },
          rowPageBreak: "auto",
        });
      }

      // QR code removed per user request

      // ── EXACT SAME footer as exportPDF ──
      let pc = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pc; i++) {
        doc.setPage(i);
        let ph = doc.internal.pageSize.getHeight();
        doc.setFillColor(42, 15, 0);
        doc.rect(0, ph - 10, w, 10, "F");
        doc.setFillColor(247, 160, 26);
        doc.rect(0, ph - 10, w, 0.8, "F");
        doc.setFontSize(6.5); doc.setTextColor(180, 140, 80); doc.setFont(undefined, "normal");
        doc.text((APP.name + ", " + APP.location + "  ·  " + APP.footerNote).toUpperCase(), w / 2, ph - 4, { align: "center" });
        doc.setTextColor(120, 100, 60);
        doc.text(`Page ${i} of ${pc}`, w - 10, ph - 4, { align: "right" });
      }

      doc.save("AnnualStatement_" + yr + "_" + s.name.replace(/\s+/g, "_") + ".pdf");
      toast("✅ Annual statement downloaded!");
    } catch (err) {
      toast("❌ PDF error: " + err.message, "error");
    }
  }

  // ── L2: Dark mode
  // Remove anti-FOUC inline style once real dark mode CSS is active
  (function() {
    var fouc = document.getElementById('_dark_fouc');
    if (fouc) fouc.remove();
  })();

  function toggleUserDarkMode() {
const isDark = document.body.classList.toggle("user-dark");
const btn = document.getElementById("userDarkBtn");

if (isDark) {
  localStorage.setItem(_U_DARK, "1");
  if (btn) {
    btn.classList.add("is-dark");
    btn.setAttribute("aria-checked", "true");
    btn.setAttribute("title", "Switch to light mode");
  }
  const mt = document.getElementById("metaThemeColor");
  if (mt) mt.content = "#08090f";
} else {
  localStorage.setItem(_U_DARK, "0");
  if (btn) {
    btn.classList.remove("is-dark");
    btn.setAttribute("aria-checked", "false");
    btn.setAttribute("title", "Switch to dark mode");
  }
  const mt = document.getElementById("metaThemeColor");
  if (mt) mt.content = "#ffffff";
}
}
  (function () {
    const stored = localStorage.getItem(_U_DARK);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldBeDark = stored === "1" || (stored === null && prefersDark);
    if (shouldBeDark) {
      document.body.classList.add("user-dark");
      const mt = document.getElementById("metaThemeColor");
      if (mt) mt.content = "#08090f";
      const btn = document.getElementById("userDarkBtn");
      if (btn) {
        btn.classList.add("is-dark");
        btn.setAttribute("aria-checked", "true");
        btn.setAttribute("aria-label", "Switch to light mode");
        btn.setAttribute("title", "Switch to light mode");
      }
    }
    // Listen for system preference changes
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function(e) {
        if (localStorage.getItem(_U_DARK) === null) {
          document.body.classList.toggle("user-dark", e.matches);
          const btn = document.getElementById("userDarkBtn");
          if (btn) btn.classList.toggle("is-dark", e.matches);
        }
      });
    }
  })();

  // ── L1: Hindi toggle — full page translation
  const _ULANG = { current: localStorage.getItem(_U_LANG) || "EN" };

  // Selector-based translation map: CSS selector → [EN text, HI text]
  // Covers every visible static label on the page
  const _HI_MAP = [
    // Header
    [".hdr-welcome",                        "Welcome back,",              "नमस्ते,"],
    // Hero
    [".hero-label",                          null,                         null], // dynamic, handled separately
    // Quick action buttons
    ["#btnAnnualReceipt",                   "Annual Contribution Statement",  "वार्षिक योगदान विवरण"],
    ["#btnFullPDF",                         "Full Contribution History PDF",   "पूर्ण योगदान इतिहास PDF"],
    // Recent Activity
    ["#recentActivitySection",              "Recent Activity",            "हाल की गतिविधि"],
    // RA hint text
    [".ra-hint-txt",                        null,                         null], // handled in JS
    // Menu section label
    ["#menuSectionLabel",                   "Menu",                       "मेनू"],
    // Menu items — titles
    ["#menuTitle-panelRecords",             "My Contributions",           "मेरा योगदान"],
    ["#menuDesc-panelRecords",              "Full history · filter by year, month, type", "पूरा इतिहास · वर्ष, माह, प्रकार से फ़िल्टर"],
    ["#menuTitle-panelPayment",             "Submit Payment",             "भुगतान जमा करें"],
    ["#menuDesc-panelPayment",              "Submit & track your payment requests",       "भुगतान अनुरोध जमा करें और ट्रैक करें"],
    ["#menuTitle-panelStats",               "Statistics",                 "आंकड़े"],
    ["#menuDesc-panelStats",                "Month-wise & type breakdown","माहवार और प्रकार अनुसार विवरण"],
    ["#menuTitle-panelEvents",              "Events & Festivals",         "कार्यक्रम और त्योहार"],
    ["#menuDesc-panelEvents",               "Upcoming · ongoing temple events","आगामी · चल रहे मंदिर कार्यक्रम"],
    ["#menuTitle-panelFeedback",            "Feedback",                   "सुझाव / प्रतिक्रिया"],
    ["#menuDesc-panelFeedback",             "Share suggestions with temple admin","मंदिर प्रशासन को सुझाव दें"],
    ["#menuTitle-panelContact",             "Temple Contact",             "मंदिर संपर्क"],
    ["#menuDesc-panelContact",              "Phone, email & address",     "फ़ोन, ईमेल और पता"],
    // Dropdown menu items
    ["#dropItem-profile",                   "My Profile",                 "मेरी प्रोफ़ाइल"],
    ["#dropItem-edit",                      "Edit Profile",               "प्रोफ़ाइल संपादित करें"],
    ["#dropItem-idcard",                    "ID Card",                    "पहचान पत्र"],
    ["#dropItem-logout",                    "Logout",                     "लॉगआउट"],
  ];

  // Text-node map for elements that contain icon + text (sec-lbl, card-title, etc.)
  // key = trimmed text content (without icon), value = Hindi
  const _HI_TEXT = {
    // Section labels
    "Recent Activity":          "हाल की गतिविधि",
    "Menu":                     "मेनू",
    "Contribution Records":     "योगदान रिकॉर्ड",
    "Statistics":               "आंकड़े",
    "Upcoming Events":          "आगामी कार्यक्रम",
    "Submit Payment Request":   "भुगतान अनुरोध जमा करें",
    "My Payment Requests":      "मेरे भुगतान अनुरोध",
    "Submit Feedback":          "सुझाव / प्रतिक्रिया दें",
    "Temple Contact":           "मंदिर संपर्क",
    "Mandir Goals":             "मंदिर लक्ष्य",
    "Filter & Search":          "फ़िल्टर और खोज",
    // Card titles
    "Records":                  "रिकॉर्ड",
    "Month-wise":               "माहवार",
    "By Type":                  "प्रकार अनुसार",
    // Quick action search button
    "Search":                   "खोजें",
    // Panel back button
    "Back":                     "वापस",
    // Dropdown
    "My Profile":               "मेरी प्रोफ़ाइल",
    "Edit Profile":             "प्रोफ़ाइल संपादित करें",
    "ID Card":                  "पहचान पत्र",
    "Logout":                   "लॉगआउट",
    // Header welcome
    "Welcome back,":            "नमस्ते,",
    // Hero
    "All time":                 "अब तक",
    // Buttons
    "Annual Contribution Statement":  "वार्षिक योगदान विवरण",
    "Full Contribution History PDF":  "पूर्ण योगदान इतिहास PDF",
    "Submit to Admin for Verification": "व्यवस्थापक को सत्यापन हेतु भेजें",
    "Submit Feedback":          "सुझाव भेजें",
    // Form labels
    "Payment Mode":             "भुगतान विधि",
    "UTR / Reference No.":      "UTR / संदर्भ नं.",
    "Note":                     "नोट",
    "Payment Slip / Screenshot":"भुगतान पर्ची / स्क्रीनशॉट",
    "Subject":                  "विषय",
    "Message":                  "संदेश",
    "Phone":                    "फ़ोन",
    "Email":                    "ईमेल",
    "Address":                  "पता",
    // Filter labels
    "Year":                     "वर्ष",
    "Month":                    "माह",
    "Type":                     "प्रकार",
    // Misc
    "Loading activity…":        "गतिविधि लोड हो रही है…",
    "No records yet":           "अभी कोई रिकॉर्ड नहीं",
    "My Contribution":          "मेरा योगदान",
    // Tooltip header
    "Transaction Details":      "लेनदेन विवरण",
    // Tooltip row labels
    "Amount":                   "राशि",
    "Status":                   "स्थिति",
    "Date":                     "तिथि",
    "Mode":                     "विधि",
    "Receipt":                  "रसीद",
    // Status values
    "Approved":                 "स्वीकृत",
    "Pending":                  "लंबित",
    "Rejected":                 "अस्वीकृत",
    // Hero label
    "Donated This Year":        "इस वर्ष दान",
    // Hint text
    "To see complete data, click":  "पूरा डेटा देखने के लिए",
    "in the menu below":            "मेनू में क्लिक करें",
    // Placeholder texts — handled via _HI_PLACEHOLDER
    "Tap to attach payment slip":   "भुगतान पर्ची जोड़ने के लिए टैप करें",
    "JPG, PNG · Max 5 MB":          "JPG, PNG · अधिकतम 5 MB",
  };

  const _HI_PLACEHOLDER = {
    "Amount, …":                       "राशि, …",
    "UPI transaction ID or cheque number": "UPI लेनदेन ID या चेक नंबर",
    "Any additional info for admin...":    "व्यवस्थापक के लिए कोई अतिरिक्त जानकारी...",
    "e.g. Suggestion about prasad timing": "उदा. प्रसाद समय के बारे में सुझाव",
    "Write your feedback here…":           "यहाँ अपना सुझाव लिखें…",
  };

  function toggleUserLang() {
    _ULANG.current = _ULANG.current === "EN" ? "HI" : "EN";
    localStorage.setItem(_U_LANG, _ULANG.current);
    const btn = document.getElementById("userLangBtn");
    if (btn) {
      btn.classList.remove("lang-flip");
      void btn.offsetWidth; // reflow to restart animation
      btn.classList.add("lang-flip");
      btn.addEventListener("animationend", function() { btn.classList.remove("lang-flip"); }, { once: true });
      btn.textContent = _ULANG.current === "HI" ? "हिं" : "EN";
    }
    document.documentElement.lang = _ULANG.current === "HI" ? "hi" : "en";
    _applyUserLang(_ULANG.current);
  }

  function _hiText(en) { return _HI_TEXT[en] || en; }

  function _applyUserLang(lang) {
    const isHI = lang === "HI";

    // ── 1. Walk ALL text nodes in body, translate leaf text
    function _walkTranslate(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      let node;
      while ((node = walker.nextNode())) {
        const par = node.parentElement;
        if (!par) continue;
        const tag = par.tagName;
        // Skip script, style, input, textarea
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "INPUT" || tag === "TEXTAREA") continue;
        const raw = node.textContent;
        const trimmed = raw.trim();
        if (!trimmed) continue;

        if (isHI) {
          if (!node._origText) node._origText = raw;
          const hi = _HI_TEXT[trimmed];
          if (hi) node.textContent = raw.replace(trimmed, hi);
        } else {
          if (node._origText !== undefined) node.textContent = node._origText;
        }
      }
    }
    _walkTranslate(document.body);

    // ── 2. Translate placeholder attributes
    document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach(function(el) {
      if (isHI) {
        if (!el._origPH) el._origPH = el.placeholder;
        el.placeholder = _HI_PLACEHOLDER[el._origPH] || el._origPH;
      } else {
        if (el._origPH) el.placeholder = el._origPH;
      }
    });

    // ── 3. Translate title / aria-label on key buttons
    const btnMap = {
      "btnAnnualReceipt": ["Download your annual contribution statement — useful for tax records", "वार्षिक योगदान विवरण डाउनलोड करें"],
      "btnFullPDF":       ["Download full contributions PDF", "पूर्ण योगदान इतिहास PDF डाउनलोड करें"],
      "userDarkBtn":      ["Toggle dark mode", "डार्क मोड बदलें"],
    };
    Object.keys(btnMap).forEach(function(id) {
      const el = document.getElementById(id);
      if (!el) return;
      if (isHI) {
        if (!el._origTitle) el._origTitle = el.title;
        if (!el._origAria) el._origAria = el.getAttribute("aria-label");
        el.title = btnMap[id][1];
        el.setAttribute("aria-label", btnMap[id][1]);
      } else {
        if (el._origTitle) el.title = el._origTitle;
        if (el._origAria) el.setAttribute("aria-label", el._origAria);
      }
    });

    // ── 4. Hero label — contains a <span> for year, handle carefully
    const heroLabel = document.querySelector(".hero-label");
    if (heroLabel) {
      const yearSpan = heroLabel.querySelector("span");
      const yearVal = yearSpan ? yearSpan.outerHTML : "";
      if (isHI) {
        heroLabel.innerHTML = _hiText("Donated This Year") + " (" + yearVal + ")";
      } else {
        heroLabel.innerHTML = "Donated This Year (" + yearVal + ")";
      }
    }

    // ── 5. "All time" label inside hero (inline style div)
    document.querySelectorAll(".hero div[style]").forEach(function(el) {
      if (el.textContent.trim() === "All time" || el.textContent.trim() === "अब तक") {
        if (isHI) { if (!el._origText) el._origText = el.textContent; el.textContent = "अब तक"; }
        else { if (el._origText) el.textContent = el._origText; }
      }
    });

    // ── 6. RA hint bar — update "My Contribution" emphasis
    const raHint = document.querySelector(".ra-view-all");
    if (raHint) {
      raHint.innerHTML = isHI
        ? '<i class="fa-solid fa-circle-info" style="font-size:10px;color:var(--ink-faint);opacity:0.7;"></i> पूरा डेटा देखने के लिए नीचे <strong style="color:var(--ink-soft);font-weight:600;">मेरा योगदान</strong> पर क्लिक करें'
        : '<i class="fa-solid fa-circle-info" style="font-size:10px;color:var(--ink-faint);opacity:0.7;"></i> To see complete data, click <strong style="color:var(--ink-soft);font-weight:600;">My Contribution</strong> in the menu below';
    }

    // ── 7. Quick stats hero labels (injected by JS — translate after render)
    document.querySelectorAll(".hero-stat-l").forEach(function(el) {
      const t = el.textContent.trim();
      if (isHI) {
        if (!el._origText) el._origText = t;
        el.textContent = _HI_TEXT[t] || t;
      } else {
        if (el._origText) el.textContent = el._origText;
      }
    });

    // ── 8. Recent activity tooltip "Transaction Details" header & row labels (dynamic)
    document.querySelectorAll(".ra-tooltip").forEach(function(tip) {
      tip.querySelectorAll("div[style]").forEach(function(row) {
        const spans = row.querySelectorAll("span");
        spans.forEach(function(sp) {
          const t = sp.textContent.trim();
          if (isHI) {
            if (!sp._origText) sp._origText = t;
            sp.textContent = _HI_TEXT[t] || t;
          } else {
            if (sp._origText) sp.textContent = sp._origText;
          }
        });
      });
      // Header text node
      const hdr = tip.querySelector("div:first-child");
      if (hdr && !hdr.querySelector("span")) {
        const t = hdr.textContent.trim();
        if (isHI) { if (!hdr._origText) hdr._origText = t; hdr.textContent = _HI_TEXT[t] || t; }
        else { if (hdr._origText) hdr.textContent = hdr._origText; }
      }
    });
  }

  if (_ULANG.current === "HI") {
    document.documentElement.lang = "hi";
    const btn = document.getElementById("userLangBtn");
    if (btn) btn.textContent = "हिं";
    // Translation is applied in init() after data loads — no extra DOMContentLoaded needed
  }

  // ── Scroll to top button + page progress bar (rAF-throttled for performance)
  (function() {
    const btn = document.getElementById("scrollTopBtn");
    const bar = document.getElementById("page-progress");
    let _rafPending = false;
    function _onScroll() {
      if (_rafPending) return;
      _rafPending = true;
      requestAnimationFrame(function() {
        _rafPending = false;
        if (btn) btn.classList.toggle("visible", window.scrollY > 320);
        if (bar) {
          const doc = document.documentElement;
          const scrolled = doc.scrollTop || document.body.scrollTop;
          const total = doc.scrollHeight - doc.clientHeight;
          bar.style.transform = total > 0 ? `scaleX(${Math.min(scrolled / total, 1)})` : 'scaleX(0)';
        }
      });
    }
    window.addEventListener("scroll", _onScroll, { passive: true });
  })();

  // NOTE: _setUserVersion() is called inside the wrapped init() in the next script block.
  // The duplicate window.load listener was removed to prevent double DOM writes.


  function _populateTempleContact() {
    const ph = document.getElementById("templePhone");
    const em = document.getElementById("templeEmail");
    const ad = document.getElementById("templeAddress");
    if (ph && APP.phone) { ph.textContent = APP.phone; ph.href = "tel:" + APP.phone; }
    if (em && APP.email) { em.textContent = APP.email; em.href = "mailto:" + APP.email; }
    if (ad && APP.address) {
      const adText = document.getElementById("templeAddressText");
      if (adText) adText.textContent = APP.address;
      ad.href = "https://www.google.com/maps/search/" + encodeURIComponent(APP.address);
    }
    // Also populate payment request month dropdown
    // Populate payment month dropdown
    const prMonth = document.getElementById("pr_month");
    if (prMonth && prMonth.options.length <= 1) {
      months.forEach(m => { const o = document.createElement("option"); o.value = m; o.textContent = m; prMonth.appendChild(o); });
    }
    // Populate payment year dropdown — from earliest data year up to current year
    const prYear = document.getElementById("pr_year");
    if (prYear && prYear.options.length === 0) {
      const curY = new Date().getFullYear();
      // Find earliest year in loaded contributions, floor at 2023
      let minY = curY;
      if (typeof data !== "undefined" && data.length > 0) {
        data.forEach(function(c) { var y = Number(c.Year); if (!isNaN(y) && y > 2000 && y < minY) minY = y; });
      }
      minY = Math.min(minY, 2023);
      for (let y = curY; y >= minY; y--) {
        const o = document.createElement("option");
        o.value = String(y); o.textContent = String(y);
        if (y === curY) o.selected = true;
        prYear.appendChild(o);
      }
    }
    // Populate payment mode dropdown — uses PAYMENT_MODES (sourced from constants.js if available)
    const prMode = document.getElementById("pr_mode");
    if (prMode && prMode.options.length === 0) {
      PAYMENT_MODES.forEach(m => { const o = document.createElement("option"); o.value = m; o.textContent = m; prMode.appendChild(o); });
    }
  }
  window.addEventListener("load", _populateTempleContact);

  // ── M4: Handle payment slip file selection
  let _prSlipB64 = "";
  function handlePrSlip(input) {
    const file = input.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast("Slip image must be under 5MB.", "error"); input.value = ""; return; }
    const nameEl = document.getElementById("pr_slip_name");
    const prevWrap = document.getElementById("pr_slip_preview_wrap");
    const prevImg = document.getElementById("pr_slip_preview");
    if (nameEl) nameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = function (e) {
      _prSlipB64 = e.target.result;
      if (prevImg) prevImg.src = _prSlipB64;
      if (prevWrap) prevWrap.style.display = "block";
    };
    reader.readAsDataURL(file);
  }

  // ── M4: Submit payment request
  async function submitPaymentRequest() {
    const s = (_sess() || {});
    const month = (document.getElementById("pr_month") || {}).value || "";
    const year = (document.getElementById("pr_year") || {}).value || String(new Date().getFullYear());
    const amount = (document.getElementById("pr_amount") || {}).value || "";
    const mode = (document.getElementById("pr_mode") || {}).value || "UPI";
    const utr = (document.getElementById("pr_utr") || {}).value || "";
    const note = (document.getElementById("pr_note") || {}).value || "";
    const msgEl = document.getElementById("prMsg");
    const show = (msg, ok) => {
      if (msgEl) {
        msgEl.textContent = msg;
        msgEl.style.display = "block";
        msgEl.classList.toggle("msg-ok",  !!ok);
        msgEl.classList.toggle("msg-err", !ok);
      }
    };
    if (!month) { show("Please select a month.", false); return; }
    if (!amount || Number(amount) <= 0) { show("Please enter a valid amount.", false); return; }

    // Upload slip if attached
    let slipUrl = "";
    if (_prSlipB64) {
      show("⏳ Uploading payment slip...", true);
      try {
        const _slipCtrl1 = new AbortController();
        const _slipTid1 = setTimeout(function() { _slipCtrl1.abort(); }, 60000);
        const slipRes = await fetch(API_URL, {
          method: "POST", signal: _slipCtrl1.signal,
          body: JSON.stringify({
            action: "uploadPaymentSlip",
            UserId: s.userId,
            base64: _prSlipB64,
            fileName: "Slip_" + s.userId + "_" + Date.now() + ".jpg",
            sessionToken: s.sessionToken || ""
          })
        });
        clearTimeout(_slipTid1);
        const slipData = await slipRes.json();
        if (slipData && slipData.status === "success") slipUrl = slipData.slipUrl || "";
      } catch (e) {
        console.error("[submitPaymentRequest] Slip upload error:", e);
        show(e.name === "AbortError" ? "❌ Slip upload timed out. Submitting without slip." : "❌ Slip upload failed. Submitting without slip.", false);
      }
    }

    try {
      const res = await postData({
        action: "submitContributionRequest",
        UserId: s.userId, Amount: amount, PaymentMode: mode,
        ForMonth: month, Year: year,
        UtrRef: utr, Note: note, SlipURL: slipUrl,
        sessionToken: s.sessionToken || "", userId: s.userId || ""
      });
      if (res && res.status === "success") {
        show("✅ Request submitted! Admin will verify and record it soon.", true);
        // Reset form after 5 seconds
        setTimeout(() => {
          ["pr_month", "pr_amount", "pr_utr", "pr_note"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; }); const prYearEl = document.getElementById("pr_year"); if (prYearEl) prYearEl.value = String(new Date().getFullYear());
          const slipInput = document.getElementById("pr_slip"); if (slipInput) slipInput.value = "";
          const slipName = document.getElementById("pr_slip_name"); if (slipName) slipName.textContent = "Tap to attach payment slip or screenshot";
          const slipPrev = document.getElementById("pr_slip_preview_wrap"); if (slipPrev) slipPrev.style.display = "none";
          _prSlipB64 = "";
          if (msgEl) msgEl.style.display = "none";
        }, 5000);
        // Refresh request status
        _loadUserContribRequests();
      } else {
        show("❌ " + (res?.message || "Submission failed."), false);
      }
    } catch (err) { show("❌ " + err.message, false); }
  }

  // ── Load & display user's own contribution requests (lazy — only on first panel open)
  let _contribReqsLoaded = false;
  async function _loadUserContribRequests() {
    const s = (_sess() || {});
    const section = document.getElementById("myContribRequestsSection");
    const listEl = document.getElementById("myContribRequestsList");
    if (!section || !listEl || !s.userId) return;
    // Show spinner while fetching
    section.style.display = "block";
    listEl.innerHTML = `<div class="card" style="margin-bottom:10px;">
      <div class="card-body" style="text-align:center;padding:22px 16px;color:var(--ink-faint);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:1.4rem;display:block;margin-bottom:8px;color:var(--gold);"></i>
        <div style="font-size:13px;">Loading your requests…</div>
      </div>
    </div>`;
    let dismissed = [];
    try { dismissed = JSON.parse(localStorage.getItem("dismissed_contrib_reqs") || "[]"); } catch (e) { }
    try {
      const res = await getData("getUserContributionRequests&userId=" + encodeURIComponent(s.userId));
      const reqs = Array.isArray(res) ? res : [];
      const visible = reqs.filter(function (r) {
        const st = String(r.Status || "Pending");
        if (st === "Pending") return true;
        return !dismissed.includes(String(r.ReqId || ""));
      });
      if (visible.length === 0) {
        _contribReqsLoaded = true;
        section.style.display = "block";
        listEl.innerHTML = `<div class="card" style="margin-bottom:10px;">
          <div class="card-body" style="text-align:center;padding:24px 16px;">
            <i class="fa-solid fa-file-lines" style="font-size:2rem;color:var(--ink-faint);opacity:0.4;display:block;margin-bottom:10px;"></i>
            <div style="font-size:13px;color:var(--ink-faint);font-weight:500;">No payment requests yet — submit one below ↓</div>
          </div>
        </div>`;
        return;
      }
      _contribReqsLoaded = true;
      section.style.display = "block";
      listEl.innerHTML = visible.map(function (r) {
        const st = String(r.Status || "Pending");
        const isPending = st === "Pending";
        const isRejected = st === "Rejected";
        const isApproved = st === "Approved";
        const stColor = isPending ? "#f59e0b" : isRejected ? "#ef4444" : "#22c55e";
        const stBg = isPending ? "#fffbeb" : isRejected ? "#fef2f2" : "#f0fdf4";
        const stIcon = isPending ? '<i class="fa-solid fa-clock"></i>' : isRejected ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-check"></i>';
        const reqId = escapeHtml(String(r.ReqId || ""));
        const slipUrl = r.SlipURL ? escapeHtml(r.SlipURL) : "";
        const dateStr = escapeHtml(formatPaymentDate(r.RequestedAt || "").split(" ")[0] || "");

        let actionBtns = "";
        if (isPending) {
          actionBtns = `
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
                ${slipUrl ? `<button class="btn-sm btn-blue" onclick="previewContribSlip('${slipUrl}')" style="font-size:11px;padding:6px 12px;border-radius:20px;"><i class="fa-solid fa-image"></i> Preview Slip</button>` : ""}
                <button class="btn-sm req-edit-btn" onclick="_editBtnClick(this,'${reqId}')" style="font-size:11px;padding:6px 14px;border-radius:20px;background:linear-gradient(135deg,#2a0f00,#3c1a00);color:#f7a01a;border:1.5px solid rgba(247,160,26,0.35);font-weight:700;box-shadow:0 2px 8px rgba(42,15,0,0.2);transition:all 0.18s;"><i class="fa-solid fa-pen-to-square"></i> Edit Request</button>
              </div>`;
        } else {
          actionBtns = "";
        }

        return `<div class="card" style="margin-bottom:10px;border-left:4px solid ${stColor};">
            <div class="card-body" style="padding:12px 16px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">
                <div class="_u-flex-1">
                  <div style="font-size:13px;font-weight:700;color:var(--ink);">₹ ${fmt(r.Amount || 0)} — ${escapeHtml(r.ForMonth || "")} ${escapeHtml(String(r.Year || ""))}</div>
                  <div style="font-size:11px;color:var(--ink-faint);margin-top:2px;">${escapeHtml(r.PaymentMode || "")} · ${dateStr}</div>
                  ${r.UtrRef ? `<div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">Ref: ${escapeHtml(r.UtrRef)}</div>` : ""}
                </div>
                <div style="display:flex;flex-direction:row;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
                ${!isPending ? `<span id="del-wrap-${reqId}" style="display:inline-flex;align-items:center;gap:4px;">
                  <button onclick="_confirmDelete('${reqId}')" class="req-del-btn" style="background:rgba(239,68,68,0.09);border:none;color:#ef4444;font-size:11px;padding:4px 12px;border-radius:20px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-weight:700;box-shadow:none;transition:background 0.18s,color 0.18s,transform 0.15s;"><i class="fa-solid fa-trash"></i> Delete</button>
                </span>` : ""}
                <span style="background:${stBg};color:${stColor};border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;">${stIcon} ${escapeHtml(st)}</span>
                </div>
              </div>
              ${actionBtns}
              ${isRejected ? `<div style="margin-top:8px;padding:8px 12px;background:rgba(239,68,68,0.09);border-radius:8px;border:1px solid rgba(248,113,113,0.3);">
                <div style="font-size:11px;font-weight:700;color:#991b1b;margin-bottom:${r.RejectionNote ? "4px" : "0"};">❌ This request was rejected by admin.</div>
                ${r.RejectionNote ? `<div style="font-size:12px;color:#b91c1c;"><b>Reason:</b> ${escapeHtml(r.RejectionNote)}</div>` : `<div style="font-size:11px;color:#b91c1c;">No reason provided. Please contact admin.</div>`}
              </div>` : ""}
              ${isPending ? `<div style="margin-top:6px;font-size:11.5px;color:#92400e;background:rgba(247,160,26,0.1);padding:6px 10px;border-radius:6px;">Admin will review and record this payment soon.</div>` : ""}
              ${isApproved ? `<div style="margin-top:6px;font-size:11.5px;color:#166534;background:rgba(34,197,94,0.1);padding:6px 10px;border-radius:6px;">✅ Verified and added to your Contribution Records above.</div>` : ""}
            </div>
          </div>`;
      }).join("");
    } catch (e) {
      console.error("[loadUserContribRequests] Error:", e);
      section.style.display = "block";
      listEl.innerHTML = `<div class="card" style="margin-bottom:10px;">
        <div class="card-body" style="text-align:center;padding:22px 16px;">
          <i class="fa-solid fa-circle-exclamation" style="font-size:1.4rem;color:#ef4444;display:block;margin-bottom:8px;"></i>
          <div style="font-size:13px;color:#ef4444;font-weight:600;margin-bottom:10px;">Could not load requests.</div>
          <button onclick="_contribReqsLoaded=false;_loadUserContribRequests();" style="background:linear-gradient(135deg,#f7a01a,#e8920a);color:#fff;border:none;border-radius:20px;padding:7px 18px;font-size:12px;font-weight:700;cursor:pointer;">
            <i class="fa-solid fa-rotate-right"></i> Retry
          </button>
        </div>
      </div>`;
      // _contribReqsLoaded intentionally left false so retry is possible
    }
  }

  // ── Edit button with loading state
  async function _editBtnClick(btn, reqId) {
    _btnLoad(btn);
    try { await openEditContribRequest(reqId); } catch(e) {}
    setTimeout(function() { _btnDone(btn); }, 400);
  }

  function _confirmDelete(reqId) {
    const wrap = document.getElementById("del-wrap-" + reqId);
    if (!wrap) return;
    wrap.innerHTML = `<span style="font-size:11px;color:var(--ink-soft);font-weight:600;white-space:nowrap;">Sure?</span>
      <button id="_delYes_${reqId}" onclick="_deleteContribRequest('${reqId}', this)" style="background:#ef4444;border:none;color:#fff;font-size:11px;padding:4px 10px;border-radius:20px;cursor:pointer;font-weight:700;box-shadow:none;display:inline-flex;align-items:center;gap:4px;"><i class="fa-solid fa-check"></i> Yes</button>
      <button onclick="_loadUserContribRequests()" style="background:var(--bg2);border:none;color:var(--ink-mid);font-size:11px;padding:4px 10px;border-radius:20px;cursor:pointer;font-weight:700;box-shadow:none;">No</button>`;
  }

  async function _deleteContribRequest(reqId, yesBtn) {
    const s = (_sess() || {});
    if (yesBtn) { yesBtn.disabled = true; yesBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
    try {
      const res = await postData({ action: "deleteContributionRequest", ReqId: reqId, userId: s.userId, sessionToken: s.sessionToken || "" });
      if (res?.status === "success" || res?.status === "deleted") {
        _loadUserContribRequests();
      } else {
        toast("Could not delete: " + (res?.message || "Unknown error"), "error");
        if (yesBtn) { yesBtn.disabled = false; yesBtn.innerHTML = '<i class="fa-solid fa-check"></i> Yes'; }
      }
    } catch (err) { console.error("[deleteContribRequest] Error:", err); toast("Error deleting request. Please try again.", "error"); if (yesBtn) { yesBtn.disabled = false; yesBtn.innerHTML = '<i class="fa-solid fa-check"></i> Yes'; } }
  }

  // ── Preview slip in fullscreen modal — handles Google Drive thumbnail URLs
  function previewContribSlip(url) {
    const existing = document.getElementById("_slipPreviewModal");
    if (existing) existing.remove();

    // Convert Drive thumbnail URL → embeddable viewer URL
    function _driveViewUrl(u) {
      let id = "";
      if (u.includes("drive.google.com/thumbnail?id=")) id = u.split("id=")[1].split("&")[0];
      else if (u.includes("lh3.googleusercontent.com/d/")) id = u.split("/d/")[1].split("?")[0];
      return id ? "https://drive.google.com/file/d/" + id + "/preview" : u;
    }
    const isGDrive = url.includes("drive.google.com") || url.includes("googleusercontent.com");
    const viewUrl = isGDrive ? _driveViewUrl(url) : url;
    // Direct open link (always works)
    const openUrl = isGDrive && url.includes("thumbnail?id=")
      ? "https://drive.google.com/file/d/" + url.split("id=")[1].split("&")[0] + "/view"
      : url;

    const m = document.createElement("div");
    m.id = "_slipPreviewModal";
    m.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:20px;";
    m.innerHTML = `<div style="background:var(--white);border-radius:16px;max-width:540px;width:100%;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.45);">
        <div style="padding:13px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(247,160,26,0.15);background:var(--bg);">
          <span style="font-weight:700;font-size:14px;color:var(--ink);display:flex;align-items:center;gap:7px;"><i class="fa-solid fa-image" style="color:var(--gold);"></i> Payment Slip Preview</span>
          <button onclick="document.getElementById('_slipPreviewModal').remove()" style="background:none;border:none;font-size:20px;color:var(--ink-faint);cursor:pointer;padding:0;box-shadow:none;line-height:1;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;" onmouseover="this.style.background=document.body.classList.contains('user-dark')?'rgba(247,160,26,0.10)':'#f1f5f9'" onmouseout="this.style.background='none'">✕</button>
        </div>
        <div style="background:#f8fafc;min-height:320px;display:flex;align-items:center;justify-content:center;position:relative;">
          ${isGDrive
        ? `<iframe src="${viewUrl}" style="width:100%;height:380px;border:none;display:block;" allowfullscreen></iframe>`
        : `<img src="${url}" style="max-width:100%;max-height:380px;display:block;border-radius:4px;" onerror="this.outerHTML='<div style=\\'padding:30px;text-align:center;\\'><div style=\\'font-size:2rem;margin-bottom:8px;\\'>⚠️</div><div style=\\'color:#ef4444;font-size:13px;font-weight:600;\\'>Unable to load slip image.</div><div style=\\'color:#94a3b8;font-size:11px;margin-top:4px;\\'>Try opening in a new tab.</div></div>'"/>`
      }
        </div>
        <div style="padding:11px 16px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #f0f3f9;">
          <a href="${openUrl}" target="_blank" rel="noopener" style="font-size:12px;font-weight:600;color:#3b82f6;text-decoration:none;display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border:1px solid #bfdbfe;border-radius:7px;background:#eff6ff;"><i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px;"></i> Open in Drive</a>
          <button onclick="document.getElementById('_slipPreviewModal').remove()" style="background:var(--ink-mid);color:#fff;font-size:12px;padding:7px 18px;border-radius:8px;">Close</button>
        </div>
      </div>`;
    m.addEventListener("click", function (e) { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
  }

  // ── Edit contribution request modal (Pending only)
  let _editReqData = {};
  async function openEditContribRequest(reqId) {
    const s = (_sess() || {});
    let req = null;
    try {
      const res = await getData("getUserContributionRequests&userId=" + encodeURIComponent(s.userId));
      const reqs = Array.isArray(res) ? res : [];
      req = reqs.find(r => String(r.ReqId) === String(reqId));
    } catch (e) { }
    if (!req) { toast("Could not load request details.", "error"); return; }
    if (String(req.Status) !== "Pending") { toast("Only pending requests can be edited.", "error"); return; }
    _editReqData = req;

    const existing = document.getElementById("_editContribModal");
    if (existing) existing.remove();

    const moOptions = months.map(m => `<option value="${m}" ${m === req.ForMonth ? "selected" : ""}>${m}</option>`).join("");
    const modeOptions = PAYMENT_MODES.map(m => `<option value="${m}" ${m === req.PaymentMode ? "selected" : ""}>${m}</option>`).join("");

    const m = document.createElement("div");
    m.id = "_editContribModal";
    m.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;padding:16px;";
    m.innerHTML = `<div style="background:var(--white);border-radius:16px;max-width:480px;width:100%;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
        <div style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(247,160,26,0.15);background:var(--bg);">
          <span style="font-weight:700;font-size:14px;color:var(--ink);"><i class="fa-solid fa-pen-to-square" style="color:var(--gold);margin-right:6px;"></i>Edit Payment Request</span>
          <button onclick="document.getElementById('_editContribModal').remove()" style="background:none;border:none;font-size:18px;color:var(--ink-faint);cursor:pointer;padding:0;box-shadow:none;line-height:1;">✕</button>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:11px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label for="_ecr_month" class="_u-field-label">Month *</label>
              <select id="_ecr_month" class="_u-input"><option value="">Select</option>${moOptions}</select>
            </div>
            <div>
              <label for="_ecr_amount" class="_u-field-label">Amount (₹) *</label>
              <input type="number" id="_ecr_amount" value="${escapeHtml(String(req.Amount || ""))}" min="1" class="_u-input"/>
            </div>
          </div>
          <div>
            <label for="_ecr_mode" class="_u-field-label">Payment Mode</label>
            <select id="_ecr_mode" class="_u-input">${modeOptions}</select>
          </div>
          <div>
            <label for="_ecr_utr" class="_u-field-label">UTR / Reference (optional)</label>
            <input type="text" id="_ecr_utr" value="${escapeHtml(String(req.UtrRef || ""))}" placeholder="UPI transaction ID or cheque number" class="_u-input"/>
          </div>
          <div>
            <label for="_ecr_note" class="_u-field-label">Note (optional)</label>
            <input type="text" id="_ecr_note" value="${escapeHtml(String(req.Note || ""))}" maxlength="200" placeholder="Any additional info..." class="_u-input"/>
          </div>
          <div>
            <label class="_u-field-label">Replace Payment Slip (optional)</label>
            <div style="border:1.5px dashed #e2e8f0;border-radius:8px;padding:9px 12px;display:flex;align-items:center;gap:10px;background:var(--bg);cursor:pointer;" onclick="document.getElementById('_ecr_slip').click()">
              <i class="fa-solid fa-image" style="color:var(--gold);font-size:1rem;"></i>
              <div style="flex:1;">
                <div id="_ecr_slip_name" style="font-size:12px;color:var(--ink-soft);">${req.SlipURL ? "Current slip attached — tap to replace" : "Tap to attach new slip"}</div>
                <div id="_ecr_slip_preview_wrap" style="display:none;margin-top:5px;"><img id="_ecr_slip_preview" style="max-height:50px;border-radius:5px;" src="data:,"/></div>
              </div>
              <input type="file" id="_ecr_slip" accept="image/*" style="display:none;" onchange="handleEditSlip(this)"/>
            </div>
            ${req.SlipURL ? `<div style="margin-top:5px;"><button onclick="previewContribSlip('${escapeHtml(req.SlipURL)}')" style="background:none;border:1px solid #bfdbfe;color:#3b82f6;font-size:11px;padding:4px 10px;border-radius:6px;box-shadow:none;"><i class="fa-solid fa-eye"></i> Preview current slip</button></div>` : ""}
          </div>
          <div id="_ecr_msg" style="font-size:12px;display:none;padding:8px 12px;border-radius:7px;border-left:3px solid;"></div>
        </div>
        <div style="padding:12px 16px;border-top:1px solid #f0f3f9;display:flex;gap:8px;justify-content:flex-end;">
          <button onclick="document.getElementById('_editContribModal').remove()" style="background:var(--ink-mid);color:#fff;font-size:13px;padding:9px 18px;border-radius:8px;">Cancel</button>
          <button id="_ecr_save_btn" onclick="saveEditContribRequest('${reqId}')" style="background:var(--gold);color:#fff;font-size:13px;padding:9px 20px;border-radius:8px;"><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>
        </div>
      </div>`;
    m.addEventListener("click", function (e) { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
  }

  /* ═══ BIRTHDAY CELEBRATION ══════════════════════════════════════
     Shows a fullscreen confetti + message overlay once per birthday.
     Called from init() with a 30-second delay. No external library.
  ═══════════════════════════════════════════════════════════════ */
  function _showBirthdayCelebration(userName, bdayKey) {
    if (document.getElementById("_bdayCelebOverlay")) return;
    if (bdayKey) localStorage.setItem(bdayKey, "1");

    var firstName = _escHtml((userName || "Friend").split(" ")[0]);

    var overlay = document.createElement("div");
    overlay.id = "_bdayCelebOverlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;overflow:hidden;";

    overlay.innerHTML = [
      '<style>',
      '@keyframes _bdayFadeIn{from{opacity:0}to{opacity:1}}',
      '@keyframes _bdayFadeOut{from{opacity:1}to{opacity:0}}',
      '@keyframes _bdayCardIn{from{opacity:0;transform:translateY(60px) scale(0.88)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '@keyframes _bdayGlow{0%,100%{box-shadow:0 0 35px rgba(247,160,26,0.3),0 20px 60px rgba(0,0,0,0.8)}50%{box-shadow:0 0 70px rgba(247,160,26,0.55),0 20px 60px rgba(0,0,0,0.8)}}',
      '@keyframes _bdayFlicker{0%,100%{transform:scaleY(1) scaleX(1);opacity:1}30%{transform:scaleY(1.12) scaleX(0.9);opacity:0.9}60%{transform:scaleY(0.92) scaleX(1.08);opacity:1}80%{transform:scaleY(1.06) scaleX(0.95);opacity:0.85}}',
      '@keyframes _bdayShine{0%{left:-120%}100%{left:220%}}',
      '@keyframes _bdayTimerShrink{from{width:100%}to{width:0%}}',
      '@keyframes _bdayPetal{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(105vh) rotate(400deg);opacity:0}}',
      '@keyframes _bdaySpark{0%{transform:translateY(0) scale(1);opacity:1}100%{transform:translateY(-90vh) scale(0.2);opacity:0}}',
      '@keyframes _bdayOrbPulse{0%,100%{transform:scale(1);opacity:0.18}50%{transform:scale(1.3);opacity:0.32}}',
      '@keyframes _bdayStarTwinkle{0%,100%{opacity:0.1;transform:scale(0.7)}50%{opacity:0.9;transform:scale(1.2)}}',
      /* ── Canvas BG ── */
      '#_bdayCelebCanvas{position:absolute;inset:0;width:100%;height:100%;}',
      /* ── Deep BG gradient ── */
      '#_bdayCelebBg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 20%,#3c1500 0%,#1e0a00 45%,#0d0400 100%);}',
      /* ── Glowing orbs in BG ── */
      '._bday-orb{position:absolute;border-radius:50%;pointer-events:none;animation:_bdayOrbPulse ease-in-out infinite;}',
      /* ── Scroll wrapper for small screens ── */
      '#_bdayCelebScroll{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;-webkit-overflow-scrolling:touch;}',
      /* ── Card ── */
      '#_bdayCelebCard{position:relative;z-index:2;background:linear-gradient(170deg,#3d1a00 0%,#260e00 55%,#160700 100%);border:1.5px solid rgba(247,160,26,0.5);border-radius:26px;padding:28px 24px 22px;max-width:370px;width:100%;text-align:center;animation:_bdayCardIn 0.65s cubic-bezier(.22,1,.36,1) 0.1s both,_bdayGlow 3s ease 0.8s infinite;flex-shrink:0;}',
      /* ── Shine sweep ── */
      '#_bdayCelebCard::after{content:"";position:absolute;top:0;left:-120%;width:55%;height:100%;background:linear-gradient(90deg,transparent,rgba(247,160,26,0.06),transparent);border-radius:26px;animation:_bdayShine 4s ease 1.2s infinite;pointer-events:none;}',
      /* ── Content styles ── */
      '._bday-om{font-size:1rem;color:rgba(247,160,26,0.65);letter-spacing:8px;margin-bottom:8px;display:block;}',
      '._bday-divider{width:90px;height:1px;background:linear-gradient(90deg,transparent,rgba(247,160,26,0.55),transparent);margin:8px auto;}',
      '._bday-diyas{display:flex;justify-content:center;align-items:flex-end;gap:14px;margin:10px 0 4px;}',
      '._bday-diya{display:inline-block;line-height:1;}',
      '._bday-diya span{display:inline-block;animation:_bdayFlicker ease-in-out infinite;}',
      '._bday-diya:nth-child(1) span{font-size:1.8rem;animation-duration:1.4s;}',
      '._bday-diya:nth-child(2) span{font-size:2.3rem;animation-duration:1.1s;animation-delay:0.2s;}',
      '._bday-diya:nth-child(3) span{font-size:1.8rem;animation-duration:1.6s;animation-delay:0.5s;}',
      '._bday-title{font-family:\'Sora\',sans-serif;font-size:1.5rem;font-weight:800;background:linear-gradient(135deg,#f7a01a 0%,#fde68a 50%,#f7a01a 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.25;margin:10px 0 2px;padding:0 4px;}',
      '._bday-sub{font-size:0.72rem;font-weight:700;color:rgba(247,160,26,0.6);letter-spacing:2.5px;margin-bottom:10px;}',
      '._bday-name{font-family:\'Sora\',sans-serif;font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:3px;}',
      '._bday-sanskrit{font-size:10.5px;color:rgba(247,160,26,0.6);letter-spacing:0.8px;margin-bottom:10px;font-style:italic;line-height:1.5;}',
      '._bday-msg{font-size:12.5px;color:rgba(255,255,255,0.8);line-height:1.78;margin-bottom:5px;padding:0 2px;}',
      '._bday-msg2{font-size:11.5px;color:rgba(247,160,26,0.72);line-height:1.65;margin-bottom:18px;padding:0 2px;}',
      '._bday-btn{background:linear-gradient(135deg,#f7a01a,#e8920a);color:#fff;border:none;border-radius:50px;padding:13px 40px;font-family:\'DM Sans\',sans-serif;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 22px rgba(247,160,26,0.55);transition:transform 0.15s;}',
      '._bday-btn:active{transform:scale(0.95);}',
      '._bday-timer-wrap{height:3px;background:rgba(255,255,255,0.08);border-radius:3px;margin-top:16px;overflow:hidden;}',
      '._bday-timer-fill{height:100%;background:linear-gradient(90deg,#f7a01a,#fde68a);border-radius:3px;animation:_bdayTimerShrink 18s linear forwards;}',
      '._bday-petal{position:fixed;pointer-events:none;animation:_bdayPetal linear forwards;}',
      '._bday-spark{position:fixed;pointer-events:none;border-radius:50%;animation:_bdaySpark linear forwards;}',
      '</style>',

      /* ── Background layers ── */
      '<div id="_bdayCelebBg"></div>',
      /* Glowing orbs */
      '<div class="_bday-orb" style="width:320px;height:320px;top:-80px;left:-80px;background:radial-gradient(circle,rgba(247,160,26,0.22),transparent 70%);animation-duration:5s;"></div>',
      '<div class="_bday-orb" style="width:260px;height:260px;bottom:-60px;right:-60px;background:radial-gradient(circle,rgba(180,60,0,0.28),transparent 70%);animation-duration:4s;animation-delay:1s;"></div>',
      '<div class="_bday-orb" style="width:180px;height:180px;top:40%;left:60%;background:radial-gradient(circle,rgba(247,160,26,0.16),transparent 70%);animation-duration:6s;animation-delay:2s;"></div>',

      /* ── Scroll wrapper ── */
      '<div id="_bdayCelebScroll">',
      '<div id="_bdayCelebCard">',
      '  <span class="_bday-om">🕉</span>',
      '  <div class="_bday-divider"></div>',
      '  <div class="_bday-diyas">',
      '    <div class="_bday-diya"><span>🪔</span></div>',
      '    <div class="_bday-diya"><span>🪔</span></div>',
      '    <div class="_bday-diya"><span>🪔</span></div>',
      '  </div>',
      '  <div class="_bday-title">जन्मदिन मुबारक हो!</div>',
      '  <div class="_bday-sub">✦ HAPPY BIRTHDAY ✦</div>',
      '  <div class="_bday-divider"></div>',
      '  <div class="_bday-name" style="margin-top:10px;">🌸 ' + firstName + ' जी 🌸</div>',
      '  <div class="_bday-sanskrit">~ ईश्वर की असीम कृपा सदा आप पर बनी रहे ~</div>',
      '  <div class="_bday-divider"></div>',
      '  <div class="_bday-msg" style="margin-top:10px;">भगवान की असीम कृपा और आशीर्वाद से आपका यह जन्मदिन मंगलमय हो। जीवन में सुख, समृद्धि और ईश्वर भक्ति सदैव बनी रहे। 🙏</div>',
      '  <div class="_bday-msg2">मंदिर परिवार की ओर से हार्दिक शुभकामनाएं।<br>आप स्वस्थ रहें, प्रसन्न रहें, धन्य रहें। 🌺</div>',
      '  <div class="_bday-divider"></div>',
      '  <button class="_bday-btn" style="margin-top:16px;" onclick="(function(){var o=document.getElementById(\'_bdayCelebOverlay\');if(o){o.style.animation=\'_bdayFadeOut 0.5s ease forwards\';setTimeout(function(){o.remove();},500);}})()">🙏 Jai Shri Ram &nbsp;🚩</button>',
      '  <div class="_bday-timer-wrap"><div class="_bday-timer-fill"></div></div>',
      '</div>',
      '</div>'
    ].join("");

    document.body.appendChild(overlay);

    // Fade in the overlay itself
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.6s ease";
    requestAnimationFrame(function(){ overlay.style.opacity = "1"; });

    // ── Canvas: twinkling stars + floating diya dots in background ──
    (function() {
      var canvas = document.createElement("canvas");
      canvas.id = "_bdayCelebCanvas";
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
      overlay.insertBefore(canvas, overlay.firstChild);
      var ctx = canvas.getContext("2d");
      var W, H;
      function resize() { W = canvas.width = overlay.offsetWidth; H = canvas.height = overlay.offsetHeight; }
      resize();

      // Stars
      var stars = [];
      for (var i = 0; i < 80; i++) {
        stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.5 + 0.4, phase: Math.random() * Math.PI * 2, speed: Math.random() * 0.02 + 0.008 });
      }
      // Floating particles
      var particles = [];
      for (var j = 0; j < 25; j++) {
        particles.push({ x: Math.random() * 1, y: Math.random() * 1, vy: -(Math.random() * 0.0008 + 0.0003), r: Math.random() * 3 + 1.5, alpha: Math.random() * 0.5 + 0.3, color: Math.random() > 0.5 ? [247,160,26] : [253,230,138] });
      }

      var frame = 0;
      var animId;
      function draw() {
        if (!document.getElementById("_bdayCelebOverlay")) { cancelAnimationFrame(animId); return; }
        ctx.clearRect(0, 0, W, H);
        frame++;

        // Stars
        for (var i = 0; i < stars.length; i++) {
          var s = stars[i];
          s.phase += s.speed;
          var alpha = (Math.sin(s.phase) + 1) / 2 * 0.7 + 0.1;
          ctx.beginPath();
          ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(253,230,138," + alpha + ")";
          ctx.fill();
        }

        // Floating gold particles
        for (var j = 0; j < particles.length; j++) {
          var p = particles[j];
          p.y += p.vy;
          p.alpha -= 0.0015;
          if (p.y < -0.05 || p.alpha <= 0) {
            p.y = 1.05; p.x = Math.random(); p.alpha = Math.random() * 0.5 + 0.3;
          }
          var c = p.color;
          ctx.beginPath();
          ctx.arc(p.x * W, p.y * H, p.r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + p.alpha + ")";
          ctx.fill();
        }
        animId = requestAnimationFrame(draw);
      }
      draw();
      window.addEventListener("resize", resize);
    })();

    // ── Petals + sparks: single canvas draw loop (replaces 75 DOM nodes) ──
    // Cap particle count on low-end devices (< 4 CPU cores)
    var _isLowEnd = (navigator.hardwareConcurrency || 4) < 4;
    var _petalCount = _isLowEnd ? 12 : 30;
    var _sparkCount = _isLowEnd ? 18 : 45;
    var _petalEmoji = ["🌸","🌺","🌼","🪷","🌹","✨","🌻"];
    var _sparkRgb = [[247,160,26],[253,230,138],[251,191,36],[255,255,255],[251,146,60]];

    (function() {
      var pc = document.createElement("canvas");
      pc.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100001;";
      document.body.appendChild(pc);
      var pctx = pc.getContext("2d");
      var PW, PH;
      function _pcResize() { PW = pc.width = window.innerWidth; PH = pc.height = window.innerHeight; }
      _pcResize();
      window.addEventListener("resize", _pcResize, { passive: true });

      // Build petal objects
      var _petals = [];
      for (var i = 0; i < _petalCount; i++) {
        _petals.push({
          emoji: _petalEmoji[Math.floor(Math.random() * _petalEmoji.length)],
          x: Math.random() * PW,
          y: -30 - Math.random() * 200,
          vy: Math.random() * 1.2 + 0.8,
          vx: (Math.random() - 0.5) * 0.6,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.06,
          size: Math.random() * 10 + 13,
          alpha: 1,
          delay: Math.random() * 180   // frames of delay before appearing
        });
      }
      // Build spark objects (rise from bottom)
      var _sparks = [];
      for (var k = 0; k < _sparkCount; k++) {
        var sc = _sparkRgb[Math.floor(Math.random() * _sparkRgb.length)];
        _sparks.push({
          x: Math.random() * PW,
          y: PH + Math.random() * 80,
          vy: -(Math.random() * 1.8 + 0.8),
          r: Math.random() * 4 + 1.5,
          alpha: Math.random() * 0.5 + 0.5,
          color: sc,
          delay: Math.floor(Math.random() * 120)
        });
      }

      var _pcId;
      var _pcFrame = 0;
      function _pcDraw() {
        if (!document.getElementById("_bdayCelebOverlay")) {
          cancelAnimationFrame(_pcId);
          pc.remove();
          return;
        }
        _pcFrame++;
        pctx.clearRect(0, 0, PW, PH);

        // Draw petals
        for (var i = 0; i < _petals.length; i++) {
          var p = _petals[i];
          if (_pcFrame < p.delay) continue;
          p.x += p.vx; p.y += p.vy; p.rot += p.vrot;
          if (p.y > PH + 40) { p.y = -30; p.x = Math.random() * PW; p.alpha = 1; }
          pctx.save();
          pctx.globalAlpha = p.alpha;
          pctx.translate(p.x, p.y);
          pctx.rotate(p.rot);
          pctx.font = p.size + "px serif";
          pctx.textAlign = "center";
          pctx.textBaseline = "middle";
          pctx.fillText(p.emoji, 0, 0);
          pctx.restore();
        }
        // Draw sparks
        for (var k = 0; k < _sparks.length; k++) {
          var s = _sparks[k];
          if (_pcFrame < s.delay) continue;
          s.y += s.vy;
          s.alpha -= 0.004;
          if (s.alpha <= 0 || s.y < -20) {
            s.y = PH + Math.random() * 60;
            s.x = Math.random() * PW;
            s.alpha = Math.random() * 0.5 + 0.5;
          }
          pctx.beginPath();
          pctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          pctx.fillStyle = "rgba(" + s.color[0] + "," + s.color[1] + "," + s.color[2] + "," + s.alpha + ")";
          pctx.fill();
        }
        _pcId = requestAnimationFrame(_pcDraw);
      }
      _pcDraw();

      // Cancel and clean up particle canvas on overlay dismiss
      var _origDismiss = overlay.querySelector("._bday-btn");
      if (_origDismiss) {
        _origDismiss.addEventListener("click", function() {
          cancelAnimationFrame(_pcId);
          setTimeout(function() { pc.remove(); }, 600);
        }, { once: true });
      }
    })();

    // ── Auto-dismiss after 18 seconds ──
    setTimeout(function(){
      var o = document.getElementById("_bdayCelebOverlay");
      if (o) { o.style.transition = "opacity 0.8s ease"; o.style.opacity = "0"; setTimeout(function(){ o.remove(); }, 800); }
      // Particle canvas cleans itself up on next rAF tick once overlay is gone
      // Force-remove it after the fade so it never lingers
      setTimeout(function(){
        var pc = document.querySelector("canvas[style*='z-index:100001']");
        if (pc) pc.remove();
      }, 1000);
    }, 18000);
  }

  // _escHtml: alias to escapeHtml (defined in app.js) — kept for birthday overlay compatibility
  function _escHtml(s) { return escapeHtml(s); }

  /* ══════════════════════════════════════════════════════════════
     UNIVERSAL BUTTON ANIMATION ENGINE  v2
     Covers ALL interactive element types found in this dashboard:
       1. <button> — all variants (gold, secondary, danger, green, blue, ghost, sm)
       2. .qa-btn  — quick action pills (qa-gold, qa-green, qa-dark, qa-ghost)
       3. .pg-btn  — pagination buttons
       4. .menu-item — accordion menu rows
       5. .hdr-drop-item — header dropdown items (Profile, Edit, ID Card, Logout)
       6. ._mbtn   — modal footer action buttons
       7. .bs-close — bottom sheet ✕ close button
       8. #scrollTopBtn — scroll-to-top FAB
       9. .req-edit-btn / .req-del-btn — contribution row edit/delete
      10. ._bday-btn — birthday overlay dismiss button
     Strategy: single event-delegated capture-phase listener,
     unified ripple factory, per-type animation class.
  ══════════════════════════════════════════════════════════════ */
  (function() {

    /* ── 1. Unified ripple factory ─────────────────────────────── */
    function _spawnRipple(el, e) {
      // Ensure element can clip the ripple
      var cs = window.getComputedStyle(el);
      if (cs.overflow !== "hidden" && cs.overflow !== "clip") {
        el.style.overflow = "hidden";
      }
      var rect = el.getBoundingClientRect();
      // Use touch coords on mobile, mouse coords on desktop
      var cx = e.clientX;
      var cy = e.clientY;
      if (e.touches && e.touches.length) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
      cx = cx || rect.left + rect.width / 2;
      cy = cy || rect.top  + rect.height / 2;
      var size = Math.max(rect.width, rect.height) * 2.2;
      var x = cx - rect.left - size / 2;
      var y = cy - rect.top  - size / 2;
      var r = document.createElement("span");
      r.className = "btn-ripple";
      r.style.cssText = "width:"+size+"px;height:"+size+"px;left:"+x+"px;top:"+y+"px;";
      el.appendChild(r);
      r.addEventListener("animationend", function() { r.remove(); }, { once: true });
    }

    /* ── 2. Determine the correct animation class per element type ── */
    function _animClass(el) {
      if (el.classList.contains("qa-btn"))       return "btn-bounce";
      if (el.classList.contains("pg-btn"))       return "pg-clicked";
      if (el.classList.contains("menu-item"))    return "menu-clicked";
      if (el.classList.contains("hdr-drop-item"))return "menu-clicked";
      if (el.id === "scrollTopBtn")              return "btn-clicked";
      if (el.classList.contains("bs-close"))     return "pg-clicked";  // small circle pop
      return "btn-clicked"; // default: pulse ring
    }

    /* ── 3. Apply pulse-ring — existing stylesheet handles colour via compound selectors ── */
    function _applyPulse(el) {
      var cls = _animClass(el);
      el.classList.remove(cls);
      void el.offsetWidth; // force reflow → restart animation
      el.classList.add(cls);
      setTimeout(function() { el.classList.remove(cls); }, 520);
    }

    /* ── 4. Single capture-phase delegated listener ───────────────
           Selector covers ALL button types in one shot.            */
    var SELECTOR = [
      "button",
      ".qa-btn",
      ".pg-btn",
      ".menu-item",
      ".hdr-drop-item",
      "._mbtn",
      ".bs-close",
      "#scrollTopBtn",
      ".req-edit-btn",
      ".req-del-btn",
      "._bday-btn"
    ].join(", ");

    document.addEventListener("click", function(e) {
      var el = e.target.closest(SELECTOR);
      if (!el) return;
      // Skip disabled / already-loading buttons
      if (el.disabled || el.dataset.loading === "true" || el.classList.contains("btn-loading")) return;

      _spawnRipple(el, e);
      _applyPulse(el);
      // Haptic on mobile (silently ignored on desktop)
      try { if (navigator.vibrate) navigator.vibrate(7); } catch(_) {}
    }, true /* capture = fires before onclick, prevents conflicts */);

    /* ── 5. Colour-specific pulse keyframes live in the main <style> block above ── */

    /* ── 6. Global helpers (used by existing async submit handlers) ── */
    window._btnSetLoading = function(btn, on, label) {
      if (!btn) return;
      if (on) {
        btn.dataset.loading = "true";
        btn.dataset.origHtml = btn.innerHTML;
        btn.innerHTML = '<span class="btn-loading-spinner"></span> ' + (label || "Working…");
      } else {
        btn.dataset.loading = "";
        if (btn.dataset.origHtml) { btn.innerHTML = btn.dataset.origHtml; }
      }
    };

  })();
  /* ══ END UNIVERSAL BUTTON ANIMATION ENGINE v2 ══ */

  let _editSlipB64 = "";
  function handleEditSlip(input) {
    const file = input.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast("Slip image must be under 5MB.", "error"); input.value = ""; return; }
    const nameEl = document.getElementById("_ecr_slip_name");
    const prevWrap = document.getElementById("_ecr_slip_preview_wrap");
    const prevImg = document.getElementById("_ecr_slip_preview");
    if (nameEl) nameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = function (e) {
      _editSlipB64 = e.target.result;
      if (prevImg) prevImg.src = _editSlipB64;
      if (prevWrap) prevWrap.style.display = "block";
    };
    reader.readAsDataURL(file);
  }

  async function saveEditContribRequest(reqId) {
    const s = (_sess() || {});
    const month = (document.getElementById("_ecr_month") || {}).value || "";
    const amount = (document.getElementById("_ecr_amount") || {}).value || "";
    const mode = (document.getElementById("_ecr_mode") || {}).value || "UPI";
    const utr = (document.getElementById("_ecr_utr") || {}).value || "";
    const note = (document.getElementById("_ecr_note") || {}).value || "";
    const msgEl = document.getElementById("_ecr_msg");
    const btn = document.getElementById("_ecr_save_btn");

    const show = (msg, ok) => {
      if (msgEl) {
        msgEl.textContent = msg; msgEl.style.display = "block";
        msgEl.classList.toggle("msg-ok",  !!ok);
        msgEl.classList.toggle("msg-err", !ok);
      }
    };
    if (!month) { show("Please select a month.", false); return; }
    if (!amount || Number(amount) <= 0) { show("Please enter a valid amount.", false); return; }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }

    // Upload new slip if provided — pass oldSlipURL so server deletes old file from Drive
    let slipUrl = _editReqData.SlipURL || "";
    if (_editSlipB64) {
      show("⏳ Uploading new slip...", true);
      try {
        const _slipCtrl2 = new AbortController();
        const _slipTid2 = setTimeout(function() { _slipCtrl2.abort(); }, 60000);
        const slipRes = await fetch(API_URL, {
          method: "POST", signal: _slipCtrl2.signal,
          body: JSON.stringify({
            action: "uploadPaymentSlip",
            UserId: s.userId,
            base64: _editSlipB64,
            fileName: "Slip_" + s.userId + "_" + Date.now() + ".jpg",
            oldSlipURL: _editReqData.SlipURL || "",   // ← server will delete old file
            sessionToken: s.sessionToken || ""
          })
        });
        clearTimeout(_slipTid2);
        const slipData = await slipRes.json();
        if (slipData && slipData.status === "success") slipUrl = slipData.slipUrl || slipUrl;
      } catch (e) {
        console.error("[saveEditContribRequest] Slip upload error:", e);
        show(e.name === "AbortError" ? "❌ Slip upload timed out. Saving without new slip." : "❌ Slip upload failed. Keeping existing slip.", false);
      }
    }

    try {
      const res = await postData({
        action: "editContributionRequest",
        ReqId: reqId, UserId: s.userId,
        Amount: amount, PaymentMode: mode,
        ForMonth: month, UtrRef: utr, Note: note,
        SlipURL: slipUrl,
        sessionToken: s.sessionToken || ""
      });
      if (res && res.status === "success") {
        show("✅ Request updated successfully.", true);
        _editSlipB64 = "";
        setTimeout(() => {
          const modal = document.getElementById("_editContribModal");
          if (modal) modal.remove();
          _loadUserContribRequests();
        }, 1500);
      } else {
        show("❌ " + (res?.message || "Update failed."), false);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes'; }
      }
    } catch (err) {
      show("❌ " + err.message, false);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes'; }
    }
  }