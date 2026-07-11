let selectedYear;
let _cbId = 0;

/* ── Suppress JSONP noise from Apps Script HTML error pages ──────────────────
   When Apps Script returns an HTML page instead of JS (cold start / rate limit),
   Firefox throws "Uncaught SyntaxError: unexpected token: identifier" and
   falsely attributes it to "admin.html:1:42" — NOT to the Google script URL.
   So filename-based filters are useless. The correct detection strategy:
     • Any SyntaxError whose filename ends in ".html" is JSONP parse noise —
       HTML files are never valid JS, so this can never be a real app error.
     • Also suppress errors from known Google domains as a belt-and-suspenders.
   TWO layers: window.onerror (suppresses "Uncaught" in Firefox) +
               addEventListener (suppresses in Chrome / other browsers). ── */
window._activeJsonpCount = 0;

window.onerror = (function (_prev) {
  return function (msg, src, line, col, error) {
    // HTML file attributed error = JSONP parse noise (Firefox quirk)
    if (src && /\.html(\?.*)?$/i.test(src)) return true;
    // Known Google/Apps Script domain
    if (src && (src.indexOf('script.google.com') !== -1 ||
                src.indexOf('macros/s/') !== -1 ||
                src.indexOf('googleusercontent.com') !== -1)) return true;
    // SyntaxError while JSONP in-flight = Apps Script HTML response
    if (error instanceof SyntaxError && window._activeJsonpCount > 0) return true;
    // "unexpected token" message while JSONP in-flight
    if (window._activeJsonpCount > 0 && typeof msg === 'string' &&
        msg.toLowerCase().indexOf('unexpected token') !== -1) return true;
    return _prev ? _prev.call(this, msg, src, line, col, error) : false;
  };
}(window.onerror));

window.addEventListener('error', function (e) {
  if (!e) return;
  var src = e.filename || '';
  if (/\.html(\?.*)?$/i.test(src)) { e.preventDefault(); return true; }
  if (src.indexOf('script.google.com') !== -1 ||
      src.indexOf('macros/s/') !== -1 ||
      src.indexOf('googleusercontent.com') !== -1) { e.preventDefault(); return true; }
  if (e.error instanceof SyntaxError && window._activeJsonpCount > 0) { e.preventDefault(); return true; }
  if (!e.error && window._activeJsonpCount > 0 && e.message &&
      e.message.toLowerCase().indexOf('unexpected token') !== -1) { e.preventDefault(); return true; }
}, true);

/* ═══ SHARED EMAIL QUOTA CACHE ═══
   Both sidebar and Email Automation page use this so they always
   show the same number and only ONE API call fires per refresh. */
window._quotaCache = null;
window._quotaCacheTime = 0;
const QUOTA_CACHE_MS = 60000; // cache for 60 seconds

function getEmailQuotaCached() {
  const now = Date.now();
  if (window._quotaCache && (now - window._quotaCacheTime) < QUOTA_CACHE_MS) {
    return Promise.resolve(window._quotaCache);
  }
  return getData("getEmailQuota").then(function(q) {
    window._quotaCache = q;
    window._quotaCacheTime = Date.now();
    return q;
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function fmt(n) { return Number(n||0).toLocaleString("en-IN"); }

/* ═══ FORMAT PAYMENT DATE ═══
   Converts ISO (2026-02-04T02:44:12.000Z) → DD-MM-YYYY HH:MM:SS (IST).
   Already-formatted dates (28-03-2026 00:45:20) returned as-is. */
function formatPaymentDate(raw) {
  if (!raw || raw === "\u2014") return "\u2014";
  const s = String(raw).trim();
  // Already in dd-MM-yyyy format — return as-is
  if (/^\d{2}-\d{2}-\d{4}/.test(s)) return s;
  // Slash format from admin toLocaleDateString('en-IN'): "d/M/yyyy h:mm:ss am/pm"
  // Must parse as DD/MM/YYYY — never pass directly to new Date() which reads as MM/DD
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?)?/i);
  if (slash) {
    var D=+slash[1], M=+slash[2]-1, Y=+slash[3];
    var hh=+(slash[4]||0), mi=+(slash[5]||0), ss2=+(slash[6]||0);
    var ap=(slash[7]||"").toLowerCase();
    if(ap==="pm"&&hh<12)hh+=12; if(ap==="am"&&hh===12)hh=0;
    var fd=new Date(Y,M,D,hh,mi,ss2);
    return String(fd.getDate()).padStart(2,"0")+"-"+String(fd.getMonth()+1).padStart(2,"0")+"-"+fd.getFullYear()
          +" "+String(fd.getHours()).padStart(2,"0")+":"+String(fd.getMinutes()).padStart(2,"0")+":"+String(fd.getSeconds()).padStart(2,"0");
  }
  try {
    // ISO or other unambiguous formats only reach here
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const ist = new Date(d.getTime() + 5.5*60*60*1000);
    const dd  = String(ist.getUTCDate()).padStart(2,"0");
    const mm  = String(ist.getUTCMonth()+1).padStart(2,"0");
    const hh2  = String(ist.getUTCHours()).padStart(2,"0");
    const mi2  = String(ist.getUTCMinutes()).padStart(2,"0");
    const ss  = String(ist.getUTCSeconds()).padStart(2,"0");
    return dd+"-"+mm+"-"+ist.getUTCFullYear()+" "+hh2+":"+mi2+":"+ss;
  } catch(e){ return s; }
}

/* ═══ ANIMATED BOTTOM-UP TOAST ═══ */
function toast(msg, type) {
  if (!document.getElementById("_toastCSS")) {
    let s = document.createElement("style"); s.id = "_toastCSS";
    s.textContent = `
      #_tw{position:fixed;bottom:24px;right:24px;z-index:999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:340px;}
      .ti{display:flex;align-items:center;gap:10px;padding:13px 18px;border-radius:10px;font-family:Poppins,sans-serif;font-size:13.5px;font-weight:600;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,0.18);min-width:220px;pointer-events:all;animation:tUp .35s cubic-bezier(.21,1.02,.73,1) both;position:relative;overflow:hidden;line-height:1.4;}
      .tb{position:absolute;bottom:0;left:0;height:3px;background:rgba(255,255,255,0.4);animation:tBar 3.5s linear forwards;}
      @keyframes tUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
      @keyframes tBar{from{width:100%}to{width:0%}}
      .to{animation:tDn .3s ease forwards!important;}
      @keyframes tDn{to{opacity:0;transform:translateY(12px)}}
    `;
    document.head.appendChild(s);
  }
  let wrap = document.getElementById("_tw");
  if (!wrap) { wrap = document.createElement("div"); wrap.id = "_tw"; document.body.appendChild(wrap); }
  const bg   = type==="error"?"#e74c3c":type==="warn"?"#e67e22":"#27ae60";
  const icon = type==="error"?"✕":type==="warn"?"⚠":"✓";
  let item = document.createElement("div"); item.className = "ti"; item.style.background = bg;
  let iconSpan = document.createElement("span"); iconSpan.style.fontSize = "16px"; iconSpan.textContent = icon;
  let msgSpan = document.createElement("span"); msgSpan.style.flex = "1"; msgSpan.textContent = msg;
  let bar = document.createElement("div"); bar.className = "tb";
  item.appendChild(iconSpan); item.appendChild(msgSpan); item.appendChild(bar);
  wrap.appendChild(item);
  setTimeout(()=>{ item.classList.add("to"); setTimeout(()=>item.remove(),320); },3500);
}

/* ═══ SHA-256 ═══ */
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

/* ═══ JSONP GET ═══ */
function getData(action) {
  return new Promise((resolve,reject)=>{
    _cbId++; const cb="cb_"+_cbId+"_"+Date.now(); const script=document.createElement("script"); let done=false;
    window._activeJsonpCount = (window._activeJsonpCount||0) + 1;
    function _fin(){ if(!done){ done=true; window._activeJsonpCount = Math.max(0,(window._activeJsonpCount||1)-1); } }
    window[cb]=function(data){ _fin(); clearTimeout(timer); delete window[cb]; script.remove(); resolve(data); };
    const timer=setTimeout(()=>{ _fin(); window[cb]=function(){try{delete window[cb];script.remove();}catch(e){}}; try{script.remove();}catch(e){} reject(new Error("Request timed out.")); },20000);
    script.onerror=function(){ _fin(); clearTimeout(timer); window[cb]=function(){try{delete window[cb];}catch(e){}}; try{script.remove();}catch(e){} reject(new Error("Network error. Check Apps Script deployment.")); };
    let _url=API_URL+"?action="+action+"&callback="+cb;
    try{const _sess=JSON.parse(localStorage.getItem("session")||"{}");if(_sess.sessionToken)_url+="&sessionToken="+encodeURIComponent(_sess.sessionToken);if(_sess.userId)_url+="&userId="+encodeURIComponent(_sess.userId);}catch(_e){}
    script.src=_url; document.body.appendChild(script);
  });
}

/* ═══ JSONP POST ═══ */
function postData(data) {
  return new Promise((resolve,reject)=>{
    _cbId++; const cb="cb_post_"+_cbId+"_"+Date.now(); const script=document.createElement("script"); let done=false;
    window._activeJsonpCount = (window._activeJsonpCount||0) + 1;
    function _fin(){ if(!done){ done=true; window._activeJsonpCount = Math.max(0,(window._activeJsonpCount||1)-1); } }
    window[cb]=function(res){ _fin(); clearTimeout(timer); delete window[cb]; script.remove(); resolve(res); };
    const timer=setTimeout(()=>{
      _fin();
      window[cb]=function(){try{delete window[cb];script.remove();}catch(e){}};
      try{script.remove();}catch(e){}
      // ── Read-back verify for contribution writes ──────────────────
      // Apps Script may have committed the write even though the JSONP
      // response was lost (cold start, network blip). For addContribution
      // only: wait 3s then check if a new receipt appeared in getAllData.
      // If yes → resolve as success instead of rejecting with timeout.
      // For all other actions: reject normally (safe, no double-write risk).
      const _action = data && data.action;
      if (_action === "addContribution") {
        const _sentId = String(data.Id || "");
        setTimeout(function() {
          // SESSION GUARD: If session was cleared (force logout, cross-device kick) during the
          // 23-second window (20s timeout + 3s delay), getData("getAllData") would fire with no
          // userId/token → REJECTED_NO_TOKEN logged as "Unknown". Skip fallback if session gone.
          try {
            var _fb_sess = JSON.parse(localStorage.getItem("session") || "null");
            if (!_fb_sess || !_fb_sess.userId || !_fb_sess.sessionToken) return;
          } catch(_fbe) { return; }
          mandirCacheBust("getAllData");
          getData("getAllData").then(function(fresh) {
            const contribs = (fresh && fresh.contributions) || [];
            const found = contribs.find(function(c) { return String(c.Id) === _sentId; });
            if (found) {
              // Write committed on server — treat as success
              resolve({ status: "success", receiptId: found.ReceiptID || "", _recoveredFromTimeout: true });
            } else {
              reject(new Error("Request timed out."));
            }
          }).catch(function() { reject(new Error("Request timed out.")); });
        }, 3000);
      } else {
        reject(new Error("Request timed out."));
      }
    },20000);
    script.onerror=function(){ _fin(); clearTimeout(timer); window[cb]=function(){try{delete window[cb];}catch(e){}}; try{script.remove();}catch(e){} reject(new Error("Network error.")); };
    // ── AUTO-INJECT session token + userId so every write action is authenticated.
    // Only fills in missing fields — never overwrites values the caller already set.
    try {
      var _sess = JSON.parse(localStorage.getItem("session") || "{}");
      if (_sess && (_sess.sessionToken || _sess.token)) {
        if (!data.sessionToken && !data.token) data.sessionToken = _sess.sessionToken || _sess.token || "";
        if (!data.userId)                       data.userId      = _sess.userId || "";
      }
    } catch(_e) { /* never block the call on a storage error */ }
    script.src=API_URL+"?"+new URLSearchParams(data).toString()+"&callback="+cb; document.body.appendChild(script);
  });
}

/* ═══════════════════════════════════════════════════════════════
   IMPROVEMENT #5 — CLIENT CACHE + REQUEST DEDUPLICATION
   ═══════════════════════════════════════════════════════════════
   PASTE LOCATION: In app.js, immediately after the postData()
   function block (around line 148).

   WHAT THIS DOES:
   ┌─────────────────────────────────────────────────────────────┐
   │ 1. In-memory cache (window._mandirCache)                    │
   │    • getAllData cached for 5 minutes in memory              │
   │    • Slow-changing actions (getTypes, getOccasions,         │
   │      getExpenseTypes) cached for 10 minutes                 │
   │    • Cache auto-invalidated when a write (postData) happens │
   │      for that data type (e.g. addType clears types cache)   │
   │                                                             │
   │ 2. Request deduplication (window._mandirPending)            │
   │    • If getData("getAllData") is already in-flight and       │
   │      another call fires (double-click, rapid navigation),   │
   │      the second call gets the same Promise — zero extra     │
   │      network request                                        │
   │                                                             │
   │ 3. Manual cache busting                                     │
   │    • mandirCacheBust("getAllData") — clears one key         │
   │    • mandirCacheBust() — clears everything                  │
   │    • init() already calls this automatically after writes   │
   └─────────────────────────────────────────────────────────────┘

   ZERO changes to existing getData() or postData().
   getCached() wraps getData() — all existing calls still work.
   ═══════════════════════════════════════════════════════════════ */

/* ── Cache store: { action → { data, ts } } ── */
window._mandirCache   = {};
window._mandirPending = {}; // in-flight deduplication map

/* ── TTL config per action (milliseconds) ── */
const _CACHE_TTL = {
  getAllData:                5 * 60 * 1000,  // 5 min  — contributions/expenses change on writes
  getTypes:                10 * 60 * 1000,  // 10 min — rarely changes
  getOccasions:            10 * 60 * 1000,  // 10 min
  getExpenseTypes:         10 * 60 * 1000,  // 10 min
  getEventData:             2 * 60 * 1000,  // 2 min
  getGallery:               5 * 60 * 1000,  // 5 min
  getEmailSettings:         5 * 60 * 1000,  // 5 min
  getChatbotConfig:         5 * 60 * 1000,  // 5 min
  getYearlySummary:         5 * 60 * 1000,  // 5 min
  // N1: Requests badge — 60s TTL so rapid badge re-reads hit cache, but
  //     resolveContributionRequest busts it immediately on every approve/reject.
  getContributionRequests:  1 * 60 * 1000,  // 60 s
  // Actions NOT listed here are never cached (audit log, feedback, session checks etc.)
};

/* ── Which cache keys to bust when a write action fires ──
   Key = write action name, Value = array of cache keys to clear */
const _CACHE_BUST_ON_WRITE = {
  addContribution:    ["getAllData", "getYearlySummary"],
  updateContribution: ["getAllData", "getYearlySummary"],
  deleteContribution: ["getAllData", "getYearlySummary"],
  addExpense:         ["getAllData", "getYearlySummary"],
  updateExpense:      ["getAllData", "getYearlySummary"],
  deleteExpense:      ["getAllData", "getYearlySummary"],
  addUser:            ["getAllData"],
  deleteUser:         ["getAllData"],
  restoreUser:        ["getAllData"],  // [FIX] undo-delete must also bust cache
  updateUser:         ["getAllData"],
  addType:            ["getAllData", "getTypes"],
  deleteType:         ["getAllData", "getTypes"],
  updateType:         ["getAllData", "getTypes"],
  addOccasion:        ["getAllData", "getOccasions"],
  deleteOccasion:     ["getAllData", "getOccasions"],
  updateOccasion:     ["getAllData", "getOccasions"],
  addExpenseType:     ["getAllData", "getExpenseTypes"],
  deleteExpenseType:  ["getAllData", "getExpenseTypes"],
  updateExpenseType:  ["getAllData", "getExpenseTypes"],
  addGoal:            ["getAllData"],
  updateGoal:         ["getAllData"],
  deleteGoal:         ["getAllData"],
  addEvent:                  ["getEventData"],
  updateEvent:               ["getEventData"],
  deleteEvent:               ["getEventData"],
  addEventExpense:           ["getEventData", "getAllData", "getYearlySummary"], // C4: event expenses also appear in getAllData.expenses
  // C1: approveUser / rejectUser mutate user rows in getAllData
  approveUser:               ["getAllData"],
  rejectUser:                ["getAllData"],
  // C2: resolveContributionRequest mutates request rows (badge + contributions list)
  resolveContributionRequest:["getAllData", "getContributionRequests"],
  // C5: receipt uploads mutate expense rows stored in getAllData
  uploadExpenseReceipt:      ["getAllData"],
  removeOneExpenseReceipt:   ["getAllData"],
  removeAllExpenseReceipts:  ["getAllData"],
  deleteGalleryPhoto:        ["getGallery"],
  sendReceiptEmail:          ["getEmailSettings"],
  saveChatbotConfig:         ["getChatbotConfig"],
  saveEmailSettings:         ["getEmailSettings"],
};

/* ═══ getCached(action) ═══════════════════════════════════════
   Drop-in replacement for getData(action) with cache + dedup.
   Usage: getCached("getAllData")  instead of  getData("getAllData")
   Falls back to getData() transparently on cache miss.
   ═══════════════════════════════════════════════════════════ */
function getCached(action) {
  const ttl = _CACHE_TTL[action];

  // 1. Return from in-memory cache if still fresh
  if (ttl) {
    const entry = window._mandirCache[action];
    if (entry && (Date.now() - entry.ts) < ttl) {
      return Promise.resolve(entry.data);
    }
  }

  // 2. Deduplication — return existing in-flight Promise if one exists
  if (window._mandirPending[action]) {
    return window._mandirPending[action];
  }

  // 3. Cache miss — fire real network request, store Promise for dedup
  const promise = getData(action).then(function(result) {
    // Store result in cache if this action has a TTL
    if (ttl) {
      window._mandirCache[action] = { data: result, ts: Date.now() };
    }
    // Remove from pending map once resolved
    delete window._mandirPending[action];
    return result;
  }).catch(function(err) {
    // On error: remove from pending so next call retries fresh
    delete window._mandirPending[action];
    throw err;
  });

  // Register as in-flight
  window._mandirPending[action] = promise;
  return promise;
}

/* ═══ mandirCacheBust(action?) ════════════════════════════════
   Call with no args to clear everything.
   Call with an action name to clear just that one.
   Already called automatically by postData wrapping below.
   ═══════════════════════════════════════════════════════════ */
function mandirCacheBust(action) {
  if (action) {
    delete window._mandirCache[action];
    delete window._mandirPending[action];
  } else {
    window._mandirCache   = {};
    window._mandirPending = {};
  }
}

/* ═══ Wrap postData to auto-bust cache on writes ═══════════════
   Intercepts every postData() call. After a successful write,
   clears only the cache keys that are affected by that action.
   The original postData() function is untouched.
   ═══════════════════════════════════════════════════════════ */
(function() {
  var _origPostData = postData;
  postData = function(payload) {
    return _origPostData(payload).then(function(result) {
      // Auto-bust relevant caches based on write action
      var writeAction = payload && payload.action;
      if (writeAction && _CACHE_BUST_ON_WRITE[writeAction]) {
        _CACHE_BUST_ON_WRITE[writeAction].forEach(function(key) {
          mandirCacheBust(key);
        });
      }
      return result;
    });
    // Note: on postData error we do NOT bust cache — the write failed,
    // so existing cached data is still valid.
  };
})();

/* ═══ SMART REFRESH ══════════════════════════════════════════════
   Fetches only the data that changed, updates global arrays,
   then calls only the render functions that need updating.
   Falls back to full init() if anything goes wrong.
   ═══════════════════════════════════════════════════════════════ */
   async function smartRefresh(scope) {
    try {
      // Always re-fetch getAllData from cache (cache was busted by postData wrapper)
      // This is fast — cache miss re-fetches, cache hit is instant
      const allData = (await getCached("getAllData")) || {};
   
      // Update global arrays — same as init() does
      if (typeof users       !== "undefined") users       = allData.users         || users;
      if (typeof data        !== "undefined") data        = allData.contributions  || data;
      if (typeof expenses    !== "undefined") expenses    = allData.expenses       || expenses;
      if (typeof types       !== "undefined") types       = allData.types          || types;
      if (typeof expenseTypes!== "undefined") expenseTypes= allData.expenseTypes   || expenseTypes;
      if (typeof occasions   !== "undefined") occasions   = allData.occasions      || occasions;
      if (typeof goals       !== "undefined") goals       = allData.goals          || goals;
      if (typeof yearConfig  !== "undefined") yearConfig  = allData.yearConfig     || yearConfig;
   
      // Render only what this scope affects
      switch (scope) {
   
        case "contributions":
          if (typeof render          === "function") render();
          if (typeof loadSummary     === "function") loadSummary();
          if (typeof loadYears       === "function") loadYears();
          break;
   
        case "expenses":
          if (typeof renderExpenses  === "function") renderExpenses();
          if (typeof loadSummary     === "function") loadSummary();
          if (typeof loadYears       === "function") loadYears();
          if (typeof loadExpenseFilters === "function") loadExpenseFilters();
          break;
   
        case "users":
          if (typeof renderUsers         === "function") renderUsers();
          if (typeof updateUserTabCounts === "function") updateUserTabCounts(users);
          if (typeof loadUsers           === "function") loadUsers();
          break;
   
        case "types":
          if (typeof renderTypes === "function") renderTypes();
          if (typeof loadTypes   === "function") loadTypes();
          break;
   
        case "occasions":
          if (typeof renderOccasions === "function") renderOccasions();
          if (typeof loadOccasions   === "function") loadOccasions();
          break;
   
        case "expenseTypes":
          if (typeof renderExpenseTypes === "function") renderExpenseTypes();
          if (typeof loadExpenseTypes   === "function") loadExpenseTypes();
          break;
   
        case "goals":
          if (typeof renderGoals === "function") renderGoals();
          if (typeof loadSummary === "function") loadSummary();
          break;

        // Lightweight scopes — only what each entity actually needs
        case "events":
          if (typeof loadSummary === "function") loadSummary();
          break;

        case "expenses_from_event":
          if (typeof renderExpenses     === "function") renderExpenses();
          if (typeof loadSummary        === "function") loadSummary();
          if (typeof loadExpenseFilters === "function") loadExpenseFilters();
          break;

        case "requests":
          // Requests only affect the badge and contributions view
          if (typeof render      === "function") render();
          if (typeof loadSummary === "function") loadSummary();
          break;

        case "summary":
          if (typeof loadSummary === "function") loadSummary();
          break;

        case "yearConfig":
          if (typeof loadSummary === "function") loadSummary();
          break;

        case "feedback":
        case "broadcast":
          // No data globals change — _srExtra handles UI-only re-renders
          break;

        case "all":
        default:
          // Full re-render — same as original init() minus the data fetch
          if (typeof showUser           === "function") showUser();
          if (typeof loadMonths         === "function") loadMonths();
          if (typeof loadYears          === "function") loadYears();
          if (typeof loadUsers          === "function") loadUsers();
          if (typeof loadTypes          === "function") loadTypes();
          if (typeof loadExpenseTypes   === "function") loadExpenseTypes();
          if (typeof loadOccasions      === "function") loadOccasions();
          if (typeof render             === "function") render();
          if (typeof renderUsers        === "function") renderUsers();
          if (typeof updateUserTabCounts=== "function") updateUserTabCounts(users);
          if (typeof renderTypes        === "function") renderTypes();
          if (typeof renderOccasions    === "function") renderOccasions();
          if (typeof renderExpenseTypes === "function") renderExpenseTypes();
          if (typeof renderExpenses     === "function") renderExpenses();
          if (typeof loadExpenseFilters === "function") loadExpenseFilters();
          if (typeof renderGoals        === "function") renderGoals();
          if (typeof loadSummary        === "function") loadSummary();
          break;
      }
   
    } catch(err) {
      // On any error: fall back silently to full init()
      if (typeof init === "function") init();
    }
    // Keep inline dashboard in sync after every data refresh
    if (typeof _dashSyncFromAdmin === "function") _dashSyncFromAdmin();
  }

/* ═══════════════════════════════════════════════════════════
   ONE SESSION PER USER — Cross-device single session system
   ═══════════════════════════════════════════════════════════
   HOW IT WORKS:
   1. On login: a random sessionToken is generated, saved to
      localStorage AND written to the USERS sheet (setSessionToken).
   2. Every 90 seconds: checkSession polls the sheet. If the token
      stored on sheet no longer matches localStorage (because another
      device logged in and overwrote it), this tab is logged out.
   3. BroadcastChannel still handles same-browser/same-device tabs
      instantly without waiting for the 90s poll.
   ═══════════════════════════════════════════════════════════ */

// FIX SEC-4: Use crypto.getRandomValues() — Math.random() is not cryptographically secure
window._myTabToken = (function() {
  try {
    var arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('') + Date.now();
  } catch(e) {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now();
  }
}());

/* ── Same-browser tab kick (instant) ── */
(function(){
  if(typeof BroadcastChannel !== "undefined"){
    window._sessionBC = new BroadcastChannel("mandir_session");
    window._sessionBC.onmessage = function(e){
      if(e.data && e.data.type === "SESSION_REVOKED"){
        const s = JSON.parse(localStorage.getItem("session") || "null");
        if(s && String(s.userId) === String(e.data.userId) &&
           e.data.newTabToken !== window._myTabToken){
          _forceLogout("⚠️ Logged in from another tab. This session has ended.",
                       "Kicked - another tab opened");
        }
      }
    };
  }
})();

function broadcastSessionRevoke(userId){
  if(typeof BroadcastChannel !== "undefined" && window._sessionBC){
    window._sessionBC.postMessage({
      type:"SESSION_REVOKED",
      userId: String(userId),
      newTabToken: window._myTabToken
    });
  }
}

/* ── Write session token to sheet after login ── */
function setSessionTokenOnServer(userId, token){
  // Best-effort fire-and-forget. Wrapped in try/catch so a non-redeployed
  // Apps Script returning an HTML error page never causes a SyntaxError crash.
  try {
    const cb = "cb_sst_" + Date.now();
    const script = document.createElement("script");
    window[cb] = function(){ try{ delete window[cb]; script.remove(); }catch(e){} };
    script.onerror = function(){ try{ delete window[cb]; script.remove(); }catch(e){} };
    // Send token to sheet — no expiry written server-side (managed client-side only)
    script.src = API_URL + "?action=setSessionToken&userId=" +
      encodeURIComponent(userId) + "&token=" + encodeURIComponent(token) +
      "&callback=" + cb;
    document.body.appendChild(script);
    setTimeout(function(){
      try{ if(window[cb]){ delete window[cb]; } }catch(e){}
    }, 12000);
  } catch(e){ /* silent — token write is best-effort */ }
}

/* ── Cross-device poll: role-based interval (Admin 60s, User 10min) ── */
/* WHY: 42 active users × 60s = 60,480 reads/day → over free quota (20,000).   */
/* Role-split: Admins polled every 60s (security critical), Users every 10min.  */
/* Result: 2×60s + 40×600s = 2,880 + 5,760 = 8,640 reads/day → 43% of quota.  */
(function(){
  const PROTECTED = ["admin.html","user.html","dashboard.html"];
  const isProtected = PROTECTED.some(p => window.location.pathname.includes(p.replace(".html","")));
  if(!isProtected) return;

  // Read role from session — Admin gets strict 60s, User gets relaxed 10min
  // Role is read once at page load; changes only on re-login
  const _sessionRaw = JSON.parse(localStorage.getItem("session") || "null");
  const _isAdmin    = _sessionRaw && _sessionRaw.role === "Admin";
  const POLL_MS     = _isAdmin ? 60000 : 600000; // 60s for Admin, 10min for User

  function _poll(){
    try {
      const s = JSON.parse(localStorage.getItem("session") || "null");
      // Skip poll entirely if session has no token (old session before redeployment,
      // or Apps Script not yet updated — never log out in this case)
      if(!s || !s.userId) return;
      if(!s.sessionToken) return; // token not set yet — skip silently
      if(Date.now() > s.expiry) return; // expiry timer handles this separately

      const cb = "cb_cs_" + Date.now();
      const script = document.createElement("script");
      let done = false;

      window[cb] = function(res){
        if(done) return; done = true;
        try{ delete window[cb]; script.remove(); }catch(e){}
        // Only force logout on explicit { valid: false } — not on errors or missing fields
        if(res && res.valid === false){
          _forceLogout("⚠️ Your account was logged in from another device. This session has ended.",
                       "Kicked - login from another device");
        }
        // res.valid === true → do nothing, session is valid
        // res is undefined/error → do nothing, skip this poll safely
      };

      const timer = setTimeout(function(){
        if(done) return; done = true;
        // On timeout: leave a stub so a late JSONP response doesn't throw ReferenceError
        window[cb] = function(){ try{ delete window[cb]; script.remove(); }catch(e){} };
        try{ script.remove(); }catch(e){}
        // Timeout — network issue, skip this poll, never log out
      }, 15000);

      script.onerror = function(){
        if(done) return; done = true;
        clearTimeout(timer);
        try{ delete window[cb]; script.remove(); }catch(e){}
        // Script load error (e.g. HTML error page) — skip poll, never crash
      };

      script.src = API_URL + "?action=checkSession&userId=" +
        encodeURIComponent(s.userId) + "&token=" +
        encodeURIComponent(s.sessionToken) + "&callback=" + cb;
      document.body.appendChild(script);
    } catch(e){ /* silent — poll is best-effort */ }
  }

  // Start polling after 30s (extra time for setSessionToken to settle on slow connections)
  // Interval stored in window._pollInterval so visibilitychange can pause/resume it
  setTimeout(function(){
    _poll();
    window._pollInterval = setInterval(_poll, POLL_MS);

    // ── Pause poll when tab hidden, resume when user returns (~40% extra quota saving)
    // Zero impact on session logic — _poll() fires immediately on tab return
    document.addEventListener("visibilitychange", function(){
      if(document.hidden){
        clearInterval(window._pollInterval);
      } else {
        _poll(); // immediate check when user returns to tab
        window._pollInterval = setInterval(_poll, POLL_MS);
      }
    });
  }, 30000);
})();

/* ── Shared forced-logout helper ── */
function _forceLogout(message, logoutReason){
  // Stop session poll immediately so no further API calls fire after logout
  if(window._pollInterval){ clearInterval(window._pollInterval); window._pollInterval = null; }
  const s = JSON.parse(localStorage.getItem("session") || "null");
  try {
    if(s && s.userId){
      const devInfo = typeof window._getDeviceInfo==="function" ? window._getDeviceInfo() : "";
      const reason = logoutReason || message || "Session ended";
      postData({ action:"logout", userId:s.userId, userName:s.name||"User",
                 deviceInfo:devInfo, logoutReason:reason }).catch(()=>{});
    }
  } catch(e){}
  // Set nav flag so beforeunload does NOT fire another clearSessionToken beacon
  // (logout already handles token clearing via postData above)
  window._navFlag = true;
  localStorage.clear();
  sessionStorage.clear();
  toast(message || "Session ended. Please login again.", "warn");
  setTimeout(()=>{ window._navFlag=false; location.replace("login.html"); }, 2200);
}

/* ── Auto-clear token on browser/tab close ── */
/* FIX: ALWAYS clear on tab/browser close so sheet token never stays stale.      */
/* In-page navigation (page reloads within the app) is detected by a flag set    */
/* on every <a> click and programmatic navigation — those skip the beacon.       */
/* Only fires on protected pages.                                                 */
(function(){
  const PROTECTED = ["admin.html","user.html","dashboard.html"];
  const isProtected = PROTECTED.some(p => window.location.pathname.includes(p.replace(".html","")));
  if(!isProtected) return;

  // _navFlag: set true for ~500ms when navigating within the app (not closing)
  // Cleared immediately after beforeunload if navigation is within the same app.
  window._navFlag = false;

  // Intercept all in-app link clicks and programmatic navigations
  document.addEventListener("click", function(e){
    const a = e.target.closest("a[href]");
    if(a && !a.getAttribute("target")) { window._navFlag = true; setTimeout(()=>{ window._navFlag=false; },500); }
  }, true);

  window.addEventListener("beforeunload", function(){
    try {
      // Skip if this is an in-app navigation (not a true close/refresh)
      if(window._navFlag) return;
      const s = JSON.parse(localStorage.getItem("session") || "null");
      if(!s || !s.userId) return;
      const params = new URLSearchParams({
        action:   "clearSessionToken",
        userId:   String(s.userId),
        callback: "cb_beacon"
      });
      navigator.sendBeacon(API_URL + "?" + params.toString());
    } catch(e){ /* silent */ }
  });
})();



function checkSession() {
  let s=JSON.parse(localStorage.getItem("session"));
  if(!s||Date.now()>s.expiry){
    _forceLogout("Session expired. Please login again.",
                 "Session expired - missing or corrupted");
    return false;
  }
  // Refresh sliding expiry window on activity
  s.expiry=Date.now()+30*60*1000;
  localStorage.setItem("session",JSON.stringify(s));
  return true;
}

/* ── Auto 30-min session expiry — activity-based sliding window ── */
(function(){
  function _touchSession(){
    let s=JSON.parse(localStorage.getItem("session")||"null");
    if(!s) return;
    s.expiry=Date.now()+30*60*1000;
    localStorage.setItem("session",JSON.stringify(s));
  }
  ["click","keydown","touchstart","scroll"].forEach(evt=>{
    document.addEventListener(evt, _touchSession, {passive:true});
  });
  // Poll every 60s — if expired on a protected page, force logout
  setInterval(function(){
    let s=JSON.parse(localStorage.getItem("session")||"null");
    if(s && Date.now()>s.expiry){
      const isProtected = window.location.pathname.includes("admin") ||
                          window.location.pathname.includes("user");
      if(isProtected){
        _forceLogout("⏰ Session expired after 30 minutes of inactivity.",
                     "Session expired - 30 min inactivity");
      }
    }
  }, 60000);
})();

/* ═══ LOCAL UPDATE ═══ */
function updateLocalData(category,id,newData){
  if(category==="contributions"){
    let i=data.findIndex(x=>String(x.Id)===String(id));
    if(i!==-1)data[i]={...data[i],...newData};
    if(typeof render==="function")render();
  } else if(category==="expenses"){
    let i=expenses.findIndex(x=>String(x.Id)===String(id));
    if(i!==-1)expenses[i]={...expenses[i],...newData};
    if(typeof renderExpenses==="function")renderExpenses();
  }
  loadSummary();
}

/* ═══ YEAR DROPDOWN ═══ */
function loadYearDropdown(){
  const yearSelect=document.getElementById("yearSelect"); if(!yearSelect)return;
  let years=new Set();
  if(typeof data!=="undefined")data.forEach(c=>{let y=Number(c.Year);if(!isNaN(y)&&y>2000)years.add(y);});
  if(typeof expenses!=="undefined")expenses.forEach(e=>{let y=Number(e.Year);if(!isNaN(y)&&y>2000)years.add(y);});
  let curY=new Date().getFullYear();
  for(let y=2023;y<=curY+1;y++) years.add(y);
  let sorted=Array.from(years).filter(y=>!isNaN(y)).sort((a,b)=>b-a);
  yearSelect.innerHTML=sorted.map(y=>`<option value="${y}"${y===curY?" selected":""}>${y}</option>`).join("");
  yearSelect.value=curY;
  selectedYear=curY;
  yearSelect.onchange=function(){selectedYear=Number(this.value);if(typeof applyFilter==="function")applyFilter();};
}

/* ═══ UNIVERSAL MODAL SYSTEM ═══ */
function _ensureModalCSS(){
  if(document.getElementById("_mCSS"))return;
  let st=document.createElement("style");st.id="_mCSS";
  st.textContent=`
    @keyframes _mF{from{opacity:0}to{opacity:1}}
    @keyframes _mS{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
    #_uniModal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);z-index:88888;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;animation:_mF .2s ease;}
    ._mbox{background:#fff;border-radius:16px;width:100%;max-height:92vh;overflow-y:auto;animation:_mS .3s cubic-bezier(.21,1.02,.73,1);box-shadow:0 20px 60px rgba(0,0,0,0.25);}
    ._mbox::-webkit-scrollbar{width:5px}._mbox::-webkit-scrollbar-thumb{background:#ddd;border-radius:3px;}
    ._mhdr{background:#334155;color:#fff;padding:16px 22px;border-radius:16px 16px 0 0;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:2;}
    ._mhdr h3{margin:0;font-size:1.05rem;font-weight:700;color:#2563EB;display:flex;align-items:center;gap:8px;}
    ._mcls{background:none!important;border:none!important;color:#fff!important;font-size:24px;cursor:pointer;padding:0!important;box-shadow:none!important;line-height:1;transform:none!important;width:auto!important;}
    ._mbdy{padding:22px;}
    ._mft{padding:14px 22px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;background:#fafafa;border-radius:0 0 16px 16px;flex-wrap:wrap;}
    ._row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f4f4f4;align-items:center;gap:8px;}
    ._row:last-child{border-bottom:none;}
    ._rl{color:#888;font-size:12.5px;flex-shrink:0;}
    ._rv{font-size:13px;font-weight:600;color:#334155;text-align:right;}
    ._fi{width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-family:Poppins,sans-serif;font-size:13px;outline:none;transition:border-color .2s;box-sizing:border-box;margin-bottom:14px;}
    ._fi:focus{border-color:#2563EB;}
    ._fl{display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:5px;}
    ._mbtn{padding:9px 20px;border:none;border-radius:8px;cursor:pointer;font-family:Poppins,sans-serif;font-size:13px;font-weight:600;color:#fff;transition:all .2s;}
    ._mbtn:hover{filter:brightness(1.1);transform:translateY(-1px);}
    @media(max-width:520px){#_uniModal{padding:8px;}._mbdy{padding:16px;}._mft{padding:12px 16px;}}
    /* CROP MODAL */
    #_cropWrap{position:relative;overflow:hidden;background:#111;width:100%;height:300px;cursor:grab;user-select:none;touch-action:none;}
    #_cropWrap:active{cursor:grabbing;}
    #_cropImg{position:absolute;top:0;left:0;transform-origin:top left;transition:none;}
    #_cropBox{position:absolute;border:2.5px solid #2563EB;box-shadow:0 0 0 9999px rgba(0,0,0,0.55);pointer-events:none;border-radius:2px;}
    #_zoomSlider{width:100%;accent-color:#2563EB;cursor:pointer;}
    #_zoomLabel{font-size:11px;color:#888;text-align:center;display:block;margin:2px 0 8px;}
  `;
  document.head.appendChild(st);
}

function openModal(html, maxWidth){
  _ensureModalCSS();
  let old=document.getElementById("_uniModal"); if(old)old.remove();
  let overlay=document.createElement("div"); overlay.id="_uniModal";
  overlay.innerHTML=`<div class="_mbox" style="max-width:${maxWidth||"530px"};">${html}</div>`;
  overlay.addEventListener("click",e=>{
    if(e.target===overlay && !overlay._confirmInProgress) closeModal();
  });
  document.body.appendChild(overlay); document.body.style.overflow="hidden";
}
function closeModal(){
  let m=document.getElementById("_uniModal");
  if(m){m.style.opacity="0";m.style.transition="opacity .2s";setTimeout(()=>{m.remove();document.body.style.overflow="";},200);}
}
/* ═══ CONFIRM MODAL ═══ */
// Usage: confirmModal("Delete this item?", () => { /* confirmed */ }, "Delete", "#e74c3c")
// confirmColor: "#e74c3c" = danger red (default), "#2563EB" = warning orange, "#22c55e" = safe green
function confirmModal(message, onConfirm, confirmLabel, confirmColor) {
  var label = confirmLabel || "Delete";
  var color = confirmColor || "#e74c3c";
  // Icon and ring colour — red for danger, orange for warn, green for safe
  var icon  = color === "#22c55e" ? "fa-circle-check"
            : color === "#2563EB" ? "fa-triangle-exclamation"
            : "fa-triangle-exclamation";
  var ringRgb = color === "#22c55e" ? "34,197,94"
              : color === "#2563EB" ? "37,99,235"
              : "231,76,60";
  var html = `
    <div class="_mhdr" style="background:#fff;border-bottom:1px solid #f1f5f9;padding:18px 20px 14px;">
      <span></span>
      <button class="_mcls" onclick="closeModal()" style="color:#94a3b8!important;font-size:20px;line-height:1;">&#xd7;</button>
    </div>
    <div class="_mbdy" style="text-align:center;padding:8px 28px 28px;">
      <div style="
        width:64px;height:64px;border-radius:50%;margin:0 auto 18px;
        background:rgba(${ringRgb},0.1);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 0 8px rgba(${ringRgb},0.07);
        animation:_cmIconPop .35s cubic-bezier(.34,1.56,.64,1) both;
      ">
        <i class="fa-solid ${icon}" style="font-size:28px;color:${color};"></i>
      </div>
      <p style="font-size:15px;font-weight:600;color:#1e293b;margin:0 0 6px;line-height:1.4;">${message}</p>
      <p style="font-size:12.5px;color:#94a3b8;margin:0 0 24px;">This action cannot be undone.</p>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button class="_mbtn _cmCancel" style="
          background:#f1f5f9;color:#475569;min-width:100px;
          border:1.5px solid #e2e8f0;font-size:13.5px;
        " onclick="closeModal()">
          <i class="fa-solid fa-xmark" style="margin-right:5px;"></i>Cancel
        </button>
        <button class="_mbtn" id="_confirmOkBtn" style="
          background:${color};min-width:100px;font-size:13.5px;
          box-shadow:0 4px 14px rgba(${ringRgb},0.35);
        ">
          <i class="fa-solid fa-check" style="margin-right:5px;"></i>${label}
        </button>
      </div>
    </div>
    <style>
      @keyframes _cmIconPop{
        from{opacity:0;transform:scale(.5) rotate(-10deg)}
        to{opacity:1;transform:scale(1) rotate(0deg)}
      }
      ._cmCancel:hover{background:#e2e8f0!important;}
      #_confirmOkBtn:hover{filter:brightness(1.08);transform:translateY(-1px);}
      #_confirmOkBtn:active{transform:scale(0.97) translateY(0);}
      #_confirmOkBtn.btn-loading{cursor:wait;pointer-events:none;opacity:0.8;}
    </style>`;
  openModal(html, "340px");
  setTimeout(function() {
    var btn = document.getElementById("_confirmOkBtn");
    if (!btn) return;
    btn.addEventListener("click", function() {
      // [FIX-1] Keep modal open while action runs — spin confirm button, block cancel,
      // close modal ONLY after onConfirm() resolves. Previously modal closed immediately
      // so user saw a flash of old data before the entry disappeared.
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:5px;"></i>Processing…';
      btn.classList.add("btn-loading");
      // Also disable cancel button and backdrop click so user can't dismiss mid-action
      var cancelBtn = document.querySelector("._cmCancel");
      if (cancelBtn) { cancelBtn.disabled = true; cancelBtn.style.opacity = "0.4"; }
      var overlay = document.getElementById("_uniModal");
      if (overlay) overlay._confirmInProgress = true;
      // Run the action — close modal when done (or after error)
      var result = onConfirm();
      var done = function() {
        if (overlay) overlay._confirmInProgress = false;
        closeModal();
      };
      if (result && typeof result.then === "function") {
        result.then(done).catch(done);
      } else {
        done(); // sync callback
      }
    });
  }, 50);
}

/* ═══ PHOTO CROP SYSTEM ═══ */
// Opens a square-crop + resize modal. Calls onDone(croppedBase64) when user confirms.
function openCropModal(file, onDone) {
  _ensureModalCSS();
  let old=document.getElementById("_uniModal"); if(old)old.remove();
  let overlay=document.createElement("div"); overlay.id="_uniModal";
  overlay.innerHTML=`
    <div class="_mbox" style="max-width:420px;">
      <div class="_mhdr"><h3><i class="fa-solid fa-crop"></i> Crop Photo</h3></div>
      <div class="_mbdy" style="padding:14px;">
        <div id="_cropWrap">
          <img id="_cropImg" src="" draggable="false"/>
          <div id="_cropBox"></div>
        </div>
        <div style="margin:10px 0 2px;">
          <label id="_zoomLabel">Zoom: 100%</label>
          <input id="_zoomSlider" type="range" min="100" max="400" value="100" step="5"/>
        </div>
        <p style="font-size:11px;color:#999;margin:4px 0 0;text-align:center;">Drag to reposition · Use slider or pinch to zoom · Square crop</p>
      </div>
      <div class="_mft">
        <button class="_mbtn" style="background:#999;" onclick="closeModal()">Cancel</button>
        <button class="_mbtn" style="background:#2563EB;" onclick="confirmCrop()"><i class="fa-solid fa-check"></i> Use Photo</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow="hidden";

  const reader=new FileReader();
  reader.onload=function(e){
    const img=document.getElementById("_cropImg");
    img.src=e.target.result;
    img.onload=function(){
      initCrop(img, e.target.result, onDone);
    };
  };
  reader.readAsDataURL(file);
}

function initCrop(imgEl, origSrc, onDone) {
  const wrap=document.getElementById("_cropWrap");
  const cropBox=document.getElementById("_cropBox");
  const zoomSlider=document.getElementById("_zoomSlider");
  const zoomLabel=document.getElementById("_zoomLabel");
  const wW=wrap.clientWidth, wH=wrap.clientHeight;
  const iW=imgEl.naturalWidth, iH=imgEl.naturalHeight;

  // Base scale: fit image into wrap
  const baseScale=Math.min(wW/iW, wH/iH);
  let zoom=1; // multiplier on top of baseScale
  let imgX=0, imgY=0;

  // Square crop box = 80% of min(wW,wH), centered
  const side=Math.min(wW,wH)*0.82;
  const boxL=(wW-side)/2, boxT=(wH-side)/2;
  cropBox.style.left=boxL+"px"; cropBox.style.top=boxT+"px";
  cropBox.style.width=side+"px"; cropBox.style.height=side+"px";

  function clampImg() {
    const dW=iW*baseScale*zoom, dH=iH*baseScale*zoom;
    // clamp so crop box is always fully inside image
    const minX=boxL+side-dW, maxX=boxL;
    const minY=boxT+side-dH, maxY=boxT;
    imgX=Math.max(minX,Math.min(maxX,imgX));
    imgY=Math.max(minY,Math.min(maxY,imgY));
  }

  function applyTransform() {
    const dW=iW*baseScale*zoom, dH=iH*baseScale*zoom;
    imgEl.style.width=dW+"px"; imgEl.style.height=dH+"px";
    imgEl.style.left=imgX+"px"; imgEl.style.top=imgY+"px";
  }

  // Init position: center image, crop box inside it
  zoom=1;
  imgX=(wW-iW*baseScale)/2; imgY=(wH-iH*baseScale)/2;
  clampImg(); applyTransform();

  // Zoom slider
  if(zoomSlider){
    zoomSlider.addEventListener("input",function(){
      zoom=Number(this.value)/100;
      zoomLabel.textContent="Zoom: "+this.value+"%";
      clampImg(); applyTransform();
    });
  }

  // Mouse drag
  let dragging=false, lastX, lastY;
  wrap.addEventListener("mousedown",e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;e.preventDefault();});
  window.addEventListener("mousemove",e=>{
    if(!dragging)return;
    imgX+=e.clientX-lastX; imgY+=e.clientY-lastY;
    lastX=e.clientX; lastY=e.clientY;
    clampImg(); applyTransform();
  });
  window.addEventListener("mouseup",()=>{dragging=false;});

  // Touch drag + pinch zoom
  let lastDist=null, lastTX, lastTY;
  wrap.addEventListener("touchstart",e=>{
    if(e.touches.length===1){lastTX=e.touches[0].clientX;lastTY=e.touches[0].clientY;}
    if(e.touches.length===2){lastDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}
  },{passive:true});
  wrap.addEventListener("touchmove",e=>{
    if(e.touches.length===1){
      imgX+=e.touches[0].clientX-lastTX; imgY+=e.touches[0].clientY-lastTY;
      lastTX=e.touches[0].clientX; lastTY=e.touches[0].clientY;
      clampImg(); applyTransform();
    } else if(e.touches.length===2&&lastDist){
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      const ratio=d/lastDist;
      zoom=Math.max(1,Math.min(4,zoom*ratio));
      if(zoomSlider){zoomSlider.value=Math.round(zoom*100);zoomLabel.textContent="Zoom: "+Math.round(zoom*100)+"%";}
      lastDist=d;
      clampImg(); applyTransform();
    }
  },{passive:true});
  wrap.addEventListener("touchend",e=>{if(e.touches.length<2)lastDist=null;},{passive:true});

  window._doCrop=function(){
    // Convert screen crop box coords back to image natural coords
    const dW=iW*baseScale*zoom;
    const naturalScale=iW/dW; // px per natural pixel
    const cropNatX=(boxL-imgX)*naturalScale;
    const cropNatY=(boxT-imgY)*naturalScale;
    const cropNatS=side*naturalScale;
    const out=400;
    const canvas=document.createElement("canvas"); canvas.width=out; canvas.height=out;
    const ctx=canvas.getContext("2d");
    const temp=new Image(); temp.src=origSrc;
    temp.onload=function(){
      ctx.drawImage(temp,cropNatX,cropNatY,cropNatS,cropNatS,0,0,out,out);
      const b64=canvas.toDataURL("image/jpeg",0.80);
      closeModal(); onDone(b64);
    };
  };
}

function confirmCrop(){
  if(window._doCrop) window._doCrop();
}

/* ═══ RECEIPT DATA REGISTRY (FIX: avoids inline-JSON-in-onclick SyntaxError) ═══ */
window._rcptStore = {};
let _rcptIdx = 0;

function _storeReceipt(c, userName, typeName, occasionName) {
  const id = "r" + (++_rcptIdx);
  window._rcptStore[id] = {c, userName, typeName, occasionName};
  return id;
}

/* ═══ LOGO HELPER — loads Image/logo.PNG as base64 for PDF/print use ═══ */
/* Falls back gracefully if image is unavailable                            */
window._logoB64 = null;
window._logoLoadAttempted = false;
function _getLogoB64(cb) {
  if (window._logoB64) { cb(window._logoB64); return; }
  if (window._logoLoadAttempted) { cb(null); return; }
  window._logoLoadAttempted = true;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function() {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 120;
        canvas.height = img.naturalHeight || 120;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        window._logoB64 = canvas.toDataURL("image/png");
        cb(window._logoB64);
      } catch(e) { cb(null); }
    };
    img.onerror = function() { cb(null); };
    img.src = "Image/logo.PNG?" + Date.now();
  } catch(e) { cb(null); }
}
/* Pre-load logo as soon as app.js runs */
setTimeout(function(){ _getLogoB64(function(){}); }, 500);

/* ═══ RECEIPT POPUP — Enhanced with logo, improved design ═══ */
/* ── Receipt helpers (shared by all receipt functions) ───────────────────── */

/** Normalises a ReceiptID: migrates legacy TRX- prefix to APP.receiptPrefix */
function _displayRID(c) {
  const prefix = (typeof APP !== "undefined" && APP.receiptPrefix) ? APP.receiptPrefix : "REC";
  return (c.ReceiptID || "—").replace(/^TRX-/, prefix + "-");
}

/** Builds the WhatsApp text body for a contribution receipt (no duplicates) */
function _buildReceiptWAMsg(c, userName, typeName, occasionName, displayRID) {
  const genDate = new Date().toLocaleDateString("en-IN");
  const payMode = c.PaymentMode || "—";
  return (
    `${APP.symbol} *${APP.name.toUpperCase()}*\n` +
    `📍 ${APP.location}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ *CONTRIBUTION RECEIPT*\n\n` +
    `🔖 Receipt No: *${displayRID}*\n` +
    `👤 Donor: *${userName}*\n` +
    `💰 Amount: *${APP.currency} ${Number(c.Amount || 0).toLocaleString("en-IN")}*\n` +
    `💳 Payment: ${payMode}\n` +
    `📅 Month: ${c.ForMonth || "—"} ${c.Year || ""}\n` +
    `🏷️ Type: ${typeName || "Contribution"}\n` +
    (occasionName && occasionName !== "—" ? `🎉 Occasion: ${occasionName}\n` : "") +
    (c.Note ? `📝 Note: ${c.Note}\n` : "") +
    `📆 Date: ${formatPaymentDate(c.PaymentDate)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `_🙏 ${APP.thankYouMsg}_\n` +
    `_${APP.tagline} | System Generated — ${genDate}_`
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function showReceipt(c, userName, typeName, occasionName, isAdmin){
  const rid        = _storeReceipt(c, userName, typeName, occasionName);
  const displayRID = _displayRID(c);
  const payMode    = c.PaymentMode || "—";
  const payIcon    = payMode==="Cash" ? "money-bill-wave" : payMode==="Cheque" ? "file-invoice" : "mobile-screen-button";
  const shareButtons = isAdmin ? `
      <button class="_mbtn" style="background:#27ae60;" onclick="exportReceiptPDF('${rid}')"><i class="fa-solid fa-file-pdf"></i> PDF</button>
      <button class="_mbtn" style="background:#25d366;" onclick="sendReceiptWhatsApp('${rid}')"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
      <button class="_mbtn" style="background:#128c7e;" onclick="exportReceiptPDFForWhatsApp('${rid}')"><i class="fa-brands fa-whatsapp"></i> WA+PDF</button>
      <button class="_mbtn" style="background:#2980b9;" onclick="sendReceiptEmailDirect('${rid}')"><i class="fa-solid fa-envelope"></i> Email</button>
      <button class="_mbtn" style="background:#7c3aed;" onclick="printReceipt('${rid}')"><i class="fa-solid fa-print"></i> Print</button>`
    : `<button class="_mbtn" style="background:#27ae60;" onclick="exportReceiptPDF('${rid}')"><i class="fa-solid fa-file-pdf"></i> Download PDF</button>`;

  // Logo HTML — show actual logo if available, else styled OM
  const logoHtml = window._logoB64
    ? `<img src="${window._logoB64}" alt="Logo" style="width:54px;height:54px;border-radius:50%;border:2.5px solid rgba(37, 99, 235,0.7);object-fit:cover;background:#78501e;display:block;margin:0 auto 8px;">`
    : `<div style="font-size:2.6rem;margin-bottom:8px;filter:drop-shadow(0 0 8px rgba(37, 99, 235,0.5));">${APP.symbol}</div>`;

  let html=`
    <div class="_mhdr"><h3><i class="fa-solid fa-receipt"></i> Contribution Receipt</h3><button class="_mcls" onclick="closeModal()">×</button></div>
    <div class="_mbdy" style="padding:0;">

      <!-- Header Band -->
      <div class="rcpt-hdr-band" style="background:linear-gradient(135deg,#1e293b 0%,#334155 60%,#3d5068 100%);padding:22px 24px 18px;text-align:center;position:relative;overflow:hidden;">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#2563EB,#fbbf24,#2563EB);"></div>
        ${logoHtml}
        <div style="font-size:1.15rem;font-weight:700;color:#2563EB;letter-spacing:.8px;text-shadow:0 1px 4px rgba(0,0,0,0.3);">${escapeHtml(APP.name.toUpperCase())}</div>
        <div style="font-size:0.72rem;color:#94a3b8;margin-top:3px;letter-spacing:.3px;">${escapeHtml(APP.location)}</div>
        <div style="margin-top:12px;">
          <span style="background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;border-radius:20px;padding:4px 16px;font-size:10.5px;font-weight:700;letter-spacing:.6px;box-shadow:0 2px 8px rgba(34,197,94,0.35);">✓ OFFICIAL RECEIPT</span>
        </div>
      </div>

      <!-- Receipt ID Band -->
      <div class="rcpt-id-band" style="background:linear-gradient(90deg,#fef3c7,#93C5FD,#fef3c7);padding:10px 24px;text-align:center;border-bottom:2px solid #fcd34d;">
        <span class="rcpt-id-label" style="color:#78350f;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Receipt No: </span>
        <span class="rcpt-id-value" style="color:#92400e;font-size:15px;font-weight:700;font-family:monospace;letter-spacing:1.5px;">${escapeHtml(displayRID)}</span>
      </div>

      <!-- Amount Hero -->
      <div class="rcpt-amt-zone" style="padding:20px 24px 14px;text-align:center;border-bottom:1px dashed #e2e8f0;background:#fafffe;">
        <div class="rcpt-amt-label" style="color:#64748b;font-size:10.5px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Amount Received</div>
        <div class="rcpt-amt-num" style="color:#15803d;font-size:2.2rem;font-weight:800;margin:4px 0;letter-spacing:-0.5px;">₹ ${fmt(c.Amount)}</div>
        <div class="rcpt-pay-pill" style="display:inline-flex;align-items:center;gap:6px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:20px;padding:5px 14px;font-size:12px;color:#166534;font-weight:600;margin-top:4px;">
          <i class="fa-solid fa-${payIcon}" style="color:#16a34a;"></i>
          ${escapeHtml(payMode)}
        </div>
      </div>

      <!-- Details -->
      <div class="rcpt-details" style="padding:4px 24px 12px;">
        <div class="_row"><span class="_rl">Donor Name</span><span class="_rv" style="color:#1e293b;font-weight:700;">${escapeHtml(userName)}</span></div>
        <div class="_row"><span class="_rl">For Month / Year</span><span class="_rv">${escapeHtml(c.ForMonth||"—")} ${escapeHtml(String(c.Year||""))}</span></div>
        <div class="_row"><span class="_rl">Contribution Type</span><span class="_rv">${escapeHtml(typeName||"Contribution")}</span></div>
        ${occasionName && occasionName!=="—" ? `<div class="_row"><span class="_rl">Occasion</span><span class="_rv">${escapeHtml(occasionName)}</span></div>` : ""}
        ${c.Note ? `<div class="_row"><span class="_rl">Note</span><span class="_rv">${escapeHtml(c.Note)}</span></div>` : ""}
        <div class="_row"><span class="_rl">Date Recorded</span><span class="_rv">${escapeHtml(formatPaymentDate(c.PaymentDate))}</span></div>
      </div>

      <!-- Signature -->
      <div class="rcpt-sig-strip" style="display:flex;justify-content:space-between;padding:12px 24px;border-top:1px solid #e8eef4;background:#f8fafc;font-size:11px;">
        <div>
          <div class="rcpt-sig-name" style="font-weight:700;color:#334155;font-size:12px;">${escapeHtml(APP.signatory)}</div>
          <div class="rcpt-sig-desig" style="color:#64748b;">${escapeHtml(APP.designation)}</div>
          <div class="rcpt-sig-temple" style="color:#94a3b8;font-size:10px;">${escapeHtml(APP.name)}</div>
        </div>
        <div style="text-align:right;color:#94a3b8;font-size:10px;">
          <div>System-generated receipt</div>
          <div>No signature required</div>
        </div>
      </div>

      <!-- Thank You -->
      <div class="rcpt-thankyou" style="background:linear-gradient(135deg,#fef9ee,#fef3c7);padding:14px 24px;text-align:center;border-top:2px solid #93C5FD;">
        <div class="rcpt-ty-msg" style="color:#92400e;font-size:13px;font-weight:700;">🙏 ${escapeHtml(APP.thankYouMsg)}</div>
        <div class="rcpt-ty-tag" style="color:#a16207;font-size:11px;margin-top:3px;font-style:italic;">${escapeHtml(APP.tagline)}</div>
      </div>
    </div>

    <div class="_mft" style="flex-wrap:wrap;gap:8px;">
      <button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Close</button>
      ${shareButtons}
    </div>`;
  openModal(html,"540px");
}

function sendReceiptWhatsApp(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  const dRID = _displayRID(c);
  const msg  = _buildReceiptWAMsg(c, userName, typeName, occasionName, dRID);
  window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank");
}

function exportReceiptPDFForWhatsApp(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  const dRID = _displayRID(c);
  const baseMsg = _buildReceiptWAMsg(c, userName, typeName, occasionName, dRID);
  // Insert PDF-attach note before the last closing line
  const lastLine = `_${APP.tagline}`;
  const msg = baseMsg.replace(
    lastLine,
    `_PDF Receipt also downloaded — please attach it_\n${lastLine}`
  );
  exportReceiptPDF(rid);
  setTimeout(()=>{
    toast("📥 PDF downloaded — attach it in WhatsApp along with this message","");
    window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank");
  }, 600);
}

/* sendReceiptEmailDirect — calls server-side MailApp (real delivery, quota-guarded) */
async function sendReceiptEmailDirect(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}

  // Disable button immediately to prevent double-send
  var _emailBtn = document.querySelector("button[onclick*=\"sendReceiptEmailDirect('" + rid + "')\"]")
                || document.querySelector("button[onclick*='sendReceiptEmailDirect(\"" + rid + "\")']");
  if(_emailBtn){
    if(_emailBtn._inFlight) return; // already sending
    _emailBtn._inFlight = true;
    _emailBtn.disabled = true;
    _emailBtn._origHtml = _emailBtn.innerHTML;
    _emailBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
  }
  function _resetBtn(){ if(_emailBtn){ _emailBtn.disabled=false; _emailBtn._inFlight=false; _emailBtn.innerHTML=_emailBtn._origHtml||'<i class="fa-solid fa-envelope"></i> Email'; } }

  const {c,userName,typeName,occasionName} = stored;
  const displayRID = _displayRID(c);
  toast("📧 Sending receipt email...","");
  try {
    const _s = JSON.parse(localStorage.getItem("session")||"null");
    const res = await postData({
      action:        "sendContribReceiptEmail",
      receiptId:     c.ReceiptID||displayRID,
      userName:      userName,
      amount:        c.Amount||0,
      forMonth:      c.ForMonth||"",
      year:          c.Year||"",
      typeName:      typeName||"",
      occasionName:  occasionName||"",
      note:          c.Note||"",
      paymentDate:   c.PaymentDate||"",
      paymentMode:   c.PaymentMode||"",
      donorUserId:   c.UserId||"",
      userId:        _s?.userId||"",
      sessionToken:  _s?.sessionToken||""
    });
    _resetBtn();
    if(res && res.status==="sent"){
      toast("✅ Receipt email sent successfully!","");
      setTimeout(function(){ if(typeof _refreshEmailQuotaUI==="function") _refreshEmailQuotaUI(); }, 1000);
    }
    else if(res && res.status==="no_email") toast("⚠️ No email address on record for this donor.","warn");
    else if(res && res.status==="quota")    toast("⚠️ Daily email limit reached. Try again tomorrow.","warn");
    else toast("❌ Email send failed.","error");
  } catch(err){ _resetBtn(); toast("❌ "+err.message,"error"); }
}

/* Legacy alias kept for backward compatibility */
function triggerReceiptEmail(rid){
  sendReceiptEmailDirect(rid);
}

/* printReceipt — opens print dialog for the receipt modal */
function printReceipt(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  const displayRID = _displayRID(c);
  const payMode    = c.PaymentMode||"—";
  const logoTag    = window._logoB64
    ? `<img src="${window._logoB64}" alt="Logo" style="width:60px;height:60px;border-radius:50%;border:3px solid rgba(37, 99, 235,0.7);object-fit:cover;display:block;margin:0 auto 10px;">`
    : `<div class="om">${APP.symbol}</div>`;
  const win = window.open("","_blank","width=620,height=800");
  win.document.write(`<!DOCTYPE html><html><head><title>Receipt ${displayRID}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
    *{box-sizing:border-box;}
    body{font-family:'Poppins',Arial,sans-serif;margin:0;padding:20px;color:#333;background:#f4f6f9;}
    .card{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.12);max-width:520px;margin:0 auto;}
    .header{background:linear-gradient(135deg,#1e293b 0%,#334155 60%,#3d5068 100%);color:#fff;padding:24px 20px 18px;text-align:center;position:relative;}
    .header::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#2563EB,#fbbf24,#2563EB);}
    .header .om{font-size:2.2rem;margin-bottom:8px;}
    .header h1{margin:4px 0;font-size:1.15rem;color:#2563EB;font-weight:700;letter-spacing:1px;}
    .header p{margin:2px 0;font-size:0.75rem;color:#94a3b8;letter-spacing:.3px;}
    .receipt-badge{margin-top:12px;}
    .receipt-badge span{background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;padding:4px 18px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;}
    .rid-band{background:linear-gradient(90deg,#fef3c7,#93C5FD,#fef3c7);padding:11px 20px;text-align:center;border-bottom:2px solid #fcd34d;}
    .rid-label{color:#78350f;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;}
    .rid-value{color:#92400e;font-size:15px;font-weight:700;font-family:monospace;letter-spacing:1.5px;margin-left:6px;}
    .amount-section{padding:18px 20px;text-align:center;border-bottom:1px dashed #e2e8f0;background:#fafffe;}
    .amount-label{font-size:10.5px;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;}
    .amount{font-size:2.4rem;color:#15803d;font-weight:800;letter-spacing:-0.5px;}
    .pay-mode{font-size:12px;color:#166534;margin-top:6px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:20px;display:inline-block;padding:3px 14px;font-weight:600;}
    table{width:100%;border-collapse:collapse;margin:4px 0;}
    td{padding:9px 16px;border-bottom:1px solid #f1f5f9;font-size:13px;}
    td:first-child{color:#64748b;width:44%;}
    td:last-child{font-weight:600;text-align:right;color:#1e293b;}
    .sig{display:flex;justify-content:space-between;padding:14px 16px;border-top:1px solid #e2e8f0;font-size:11px;background:#f8fafc;}
    .footer{background:linear-gradient(135deg,#fef9ee,#fef3c7);padding:14px 20px;text-align:center;border-top:2px solid #93C5FD;font-size:12.5px;color:#92400e;font-weight:700;}
    .footer-sub{font-size:11px;color:#a16207;margin-top:3px;font-style:italic;font-weight:400;}
    @media print{body{padding:0;background:#fff;}.card{box-shadow:none;border-radius:0;}}
  </style></head><body>
  <div class="card">
  <div class="header">
    ${logoTag}
    <h1>${escapeHtml(APP.name.toUpperCase())}</h1>
    <p>${escapeHtml(APP.location)}</p>
    <div class="receipt-badge"><span>✓ OFFICIAL RECEIPT</span></div>
  </div>
  <div class="rid-band"><span class="rid-label">Receipt No:</span><span class="rid-value">${escapeHtml(displayRID)}</span></div>
  <div class="amount-section">
    <div class="amount-label">Amount Received</div>
    <div class="amount">₹ ${fmt(c.Amount)}</div>
    <div class="pay-mode">💳 ${escapeHtml(payMode)}</div>
  </div>
  <table>
    <tr><td>Donor Name</td><td>${escapeHtml(userName)}</td></tr>
    <tr><td>For Month / Year</td><td>${escapeHtml(c.ForMonth||"—")} ${escapeHtml(String(c.Year||""))}</td></tr>
    <tr><td>Contribution Type</td><td>${escapeHtml(typeName||"—")}</td></tr>
    ${occasionName&&occasionName!=="—"?`<tr><td>Occasion</td><td>${escapeHtml(occasionName)}</td></tr>`:""}
    ${c.Note?`<tr><td>Note</td><td>${escapeHtml(c.Note)}</td></tr>`:""}
    <tr><td>Date Recorded</td><td>${escapeHtml(formatPaymentDate(c.PaymentDate))}</td></tr>
  </table>
  <div class="sig">
    <div><strong style="color:#334155;">${escapeHtml(APP.signatory)}</strong><br/><span style="color:#64748b;">${escapeHtml(APP.designation)}</span><br/><span style="color:#94a3b8;font-size:10px;">${escapeHtml(APP.name)}</span></div>
    <div style="text-align:right;color:#94a3b8;font-size:10px;">System-generated receipt<br/>No signature required</div>
  </div>
  <div class="footer">🙏 ${escapeHtml(APP.thankYouMsg)}<div class="footer-sub">${escapeHtml(APP.tagline)}</div></div>
  </div>
  <script>setTimeout(function(){window.print();},300);<\/script></body></html>`);
  win.document.close();
}

async function exportReceiptPDF(rid){
  const stored = window._rcptStore[rid];
  if(!stored){toast("Receipt data not found.","error");return;}
  const {c,userName,typeName,occasionName} = stored;
  if(typeof window.jspdf==="undefined"){toast("PDF library not loaded.","error");return;}

  function _pdf(str){
    return String(str||"")
      .replace(/[\u{1F000}-\u{1FFFF}]/gu,"")
      .replace(/[\u2600-\u26FF]/g,"")
      .replace(/[\u2700-\u27BF]/g,"")
      .replace(/[\uD800-\uDFFF]/g,"")
      .replace(/\s+/g," ").trim();
  }

  const displayRID  = _displayRID(c);
  const payMode     = _pdf(c.PaymentMode || "—");
  const {jsPDF}     = window.jspdf;
  const pdfName     = _pdf(APP.name);
  const pdfLocation = _pdf(APP.location);
  const pdfTagline  = _pdf(APP.tagline);
  const pdfThankYou = _pdf(APP.thankYouMsg);
  const pdfDesig    = _pdf(APP.designation);
  const amtNum      = Number(c.Amount||0);
  const amtFmt      = "Rs. " + amtNum.toLocaleString("en-IN");

  /* QR text: single pipe-separated line — DO NOT CHANGE — tested working */
  const qrText = displayRID
    + " | " + _pdf(userName)
    + " | Rs." + amtNum.toLocaleString("en-IN")
    + " | " + _pdf((c.ForMonth||"") + " " + (c.Year||""))
    + " | " + formatPaymentDate(c.PaymentDate)
    + " | " + pdfName;

  /* Pre-generate QR before any drawing */
  let _qrDataUrl = null;
  try { _qrDataUrl = await _generateQRDataUrl(qrText, 200); } catch(e){}

  const doc = new jsPDF({format:"a4", unit:"mm"});
  const W   = doc.internal.pageSize.getWidth();   /* 210mm */
  let   Y   = 0;

  /* 1. GOLD BAND — starts flush at Y=0, no stripe above, no white gap.
        "OFFICIAL RECEIPT" left, Receipt No right */
  const BAND_H = 10;
  doc.setFillColor(37,99,235); doc.rect(0,0,W,BAND_H,"F");
  doc.setTextColor(26,10,0); doc.setFontSize(8); doc.setFont(undefined,"bold");
  doc.text("OFFICIAL RECEIPT", 10, 6.8);
  doc.text(displayRID, W-10, 6.8, {align:"right"});
  Y = BAND_H;

  /* 2. DARK HEADER — logo+name+location centered on FULL PAGE WIDTH,
        QR independently placed top-right (absolute, does not affect centering) */
  const HDR_H = 58;
  const CX    = W / 2;   /* true page center = 105mm */

  doc.setFillColor(20,30,50); doc.rect(0,Y,W,HDR_H,"F");

  /* QR — white card pinned top-right, 26mm at 200px = ~195 DPI, scans well */
  const QR_MM  = 26;
  const QR_PAD = 3;
  const QR_CARD_W = QR_MM + QR_PAD*2;
  const QR_CARD_H = QR_MM + QR_PAD*2 + 5;
  const QR_CARD_X = W - QR_CARD_W - 5;
  const QR_CARD_Y = Y + 4;

  if(_qrDataUrl){
    doc.setFillColor(255,255,255);
    doc.roundedRect(QR_CARD_X, QR_CARD_Y, QR_CARD_W, QR_CARD_H, 2, 2, "F");
    doc.addImage(_qrDataUrl, "PNG", QR_CARD_X+QR_PAD, QR_CARD_Y+QR_PAD, QR_MM, QR_MM);
    doc.setFontSize(5.5); doc.setTextColor(80,80,80); doc.setFont(undefined,"normal");
    doc.text("Scan to verify", QR_CARD_X+QR_CARD_W/2, QR_CARD_Y+QR_PAD+QR_MM+3.5, {align:"center"});
  }

  /* Logo — centered on full page width */
  const LOGO_CY = Y + 16;
  const LOGO_R  = 13;
  doc.setFillColor(37,99,235); doc.circle(CX, LOGO_CY, LOGO_R+2, "F");
  doc.setFillColor(255,255,255); doc.circle(CX, LOGO_CY, LOGO_R, "F");
  let logoOk = false;
  if(window._logoB64){
    try{
      const lr = LOGO_R - 1;
      doc.addImage(window._logoB64,"PNG", CX-lr, LOGO_CY-lr, lr*2, lr*2);
      logoOk = true;
    }catch(e){}
  }
  if(!logoOk){
    doc.setTextColor(120,53,15); doc.setFontSize(12); doc.setFont(undefined,"bold");
    doc.text("OM", CX, LOGO_CY+4, {align:"center"});
  }

  /* Temple name — centered on full page width */
  doc.setTextColor(37,99,235); doc.setFontSize(16); doc.setFont(undefined,"bold");
  doc.text(pdfName.toUpperCase(), CX, Y+38, {align:"center"});

  /* Location — centered on full page width */
  doc.setTextColor(148,163,184); doc.setFontSize(8); doc.setFont(undefined,"normal");
  doc.text(pdfLocation, CX, Y+46, {align:"center"});

  Y += HDR_H;

  /* 3. GOLD DIVIDER */
  doc.setFillColor(37,99,235); doc.rect(0,Y,W,2,"F"); Y+=2;

  /* 4. AMOUNT HERO */
  const AMT_H=32;
  doc.setFillColor(237,253,244); doc.rect(0,Y,W,AMT_H,"F");
  doc.setFillColor(187,247,208); doc.rect(0,Y,W,1.5,"F");
  doc.setTextColor(100,116,139); doc.setFontSize(8); doc.setFont(undefined,"normal");
  doc.text("AMOUNT RECEIVED",W/2,Y+10,{align:"center"});
  doc.setTextColor(21,128,61); doc.setFontSize(28); doc.setFont(undefined,"bold");
  doc.text(amtFmt,W/2,Y+22,{align:"center"});
  const pillTxt="Payment Mode: "+payMode, pillW=72;
  doc.setFillColor(255,255,255);
  doc.roundedRect(W/2-pillW/2,Y+24,pillW,7,3,3,"F");
  doc.setDrawColor(134,239,172); doc.setLineWidth(0.4);
  doc.roundedRect(W/2-pillW/2,Y+24,pillW,7,3,3,"S");
  doc.setTextColor(22,101,52); doc.setFontSize(7.5); doc.setFont(undefined,"bold");
  doc.text(pillTxt,W/2,Y+29,{align:"center"});
  Y+=AMT_H;

  /* 5. DETAILS TABLE */
  doc.setFillColor(37,99,235); doc.rect(0,Y,W,0.6,"F"); Y+=2;

  const tableRows=[
    ["Donor Name",     _pdf(userName)||"—"],
    ["For Month/Year", _pdf((c.ForMonth||"—")+" "+(c.Year||""))],
    ["Type",           _pdf(typeName)||"—"],
  ];
  if(occasionName&&occasionName!=="—") tableRows.push(["Occasion",_pdf(occasionName)]);
  if(c.Note) tableRows.push(["Note",_pdf(c.Note)]);
  tableRows.push(["Date Recorded",formatPaymentDate(c.PaymentDate)]);
  tableRows.push(["Receipt No",displayRID]);

  doc.autoTable({
    body:tableRows, startY:Y, theme:"plain",
    columnStyles:{
      0:{fontStyle:"bold",cellWidth:52,fillColor:[255,247,237],textColor:[120,56,14],fontSize:8},
      1:{cellWidth:W-68,textColor:[20,30,55],fontSize:8,fillColor:[255,255,255]}
    },
    styles:{cellPadding:{top:5,bottom:5,left:8,right:5},font:"helvetica",lineColor:[235,240,250],lineWidth:0.3},
    alternateRowStyles:{fillColor:[249,250,255]},
    margin:{left:8,right:8},
    didParseCell:function(d){
      if(d.row.index===0&&d.column.index===1){
        d.cell.styles.fontStyle="bold";
        d.cell.styles.fontSize=10;
        d.cell.styles.textColor=[15,30,55];
      }
    },
    didDrawCell:function(d){
      if(d.column.index===0){
        doc.setFillColor(37,99,235);
        doc.rect(d.cell.x,d.cell.y+1.5,3,d.cell.height-3,"F");
      }
    }
  });

  Y=doc.lastAutoTable.finalY+1;
  doc.setFillColor(37,99,235); doc.rect(0,Y,W,0.6,"F"); Y+=1;

  /* 6. SIGNATURE */
  const SIG_H=20;
  doc.setFillColor(248,250,252); doc.rect(0,Y,W,SIG_H,"F");
  doc.setDrawColor(226,232,240); doc.setLineWidth(0.3); doc.line(0,Y,W,Y);
  doc.setFontSize(9); doc.setFont(undefined,"bold"); doc.setTextColor(30,41,59);
  doc.text(pdfName,10,Y+7);
  doc.setFont(undefined,"normal"); doc.setFontSize(7.5); doc.setTextColor(100,116,139);
  doc.text(pdfDesig,10,Y+12);
  doc.text(pdfLocation,10,Y+17);
  doc.setFontSize(6.5); doc.setTextColor(148,163,184);
  doc.text("System-generated receipt",W-10,Y+7,{align:"right"});
  doc.text("No signature required",W-10,Y+12,{align:"right"});
  Y+=SIG_H;

  /* 7. THANK YOU FOOTER */
  const FTR_H=20;
  doc.setFillColor(255,249,235); doc.rect(0,Y,W,FTR_H,"F");
  doc.setFillColor(37,99,235);  doc.rect(0,Y,W,2,"F");
  doc.setFontSize(11); doc.setTextColor(146,64,14); doc.setFont(undefined,"bold");
  doc.text(pdfThankYou,W/2,Y+11,{align:"center"});
  doc.setFont(undefined,"normal"); doc.setFontSize(7.5); doc.setTextColor(161,98,7);
  doc.text(pdfName+" | "+pdfLocation+" | "+pdfTagline,W/2,Y+17,{align:"center"});
  Y+=FTR_H;

  /* 8. GOLD BOTTOM STRIPE */
  doc.setFillColor(37,99,235); doc.rect(0,Y,W,3,"F");

  doc.save("Receipt_"+displayRID+".pdf");
}


/* ── Generate QR code as PNG dataURL using qrcodejs ──
   Loads qrcodejs from cdnjs if not already loaded.
   Returns a dataURL string, or null on failure. */
async function _generateQRDataUrl(text, sizePx) {
  return new Promise(function(resolve) {
    function _render() {
      try {
        const container = document.createElement("div");
        container.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:"+sizePx+"px;height:"+sizePx+"px;";
        document.body.appendChild(container);
        new QRCode(container, {
          text:         text,
          width:        sizePx,
          height:       sizePx,
          colorDark:    "#1e293b",
          colorLight:   "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
        // QRCode renders asynchronously into a canvas
        setTimeout(function() {
          try {
            const canvas = container.querySelector("canvas");
            const dataUrl = canvas ? canvas.toDataURL("image/png") : null;
            document.body.removeChild(container);
            resolve(dataUrl);
          } catch(e) { try{document.body.removeChild(container);}catch(e2){} resolve(null); }
        }, 120);
      } catch(e) { resolve(null); }
    }
    if (typeof QRCode !== "undefined") { _render(); return; }
    // Lazy-load qrcodejs
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    s.onload  = _render;
    s.onerror = function() { resolve(null); };
    document.head.appendChild(s);
  });
}


/* ═══ VIEW-ONLY DETAIL POPUP ═══ */
function showDetailPopup(title, rows, editFn){
  let rowsHtml = rows.map(r=>`<div class="_row"><span class="_rl">${escapeHtml(String(r[0]||""))}</span><span class="_rv">${escapeHtml(String(r[1]||""))}</span></div>`).join("");
  let editBtn = editFn ? `<button class="_mbtn" style="background:#2563EB;" onclick="${editFn}"><i class="fa-solid fa-pen"></i> Edit</button>` : "";
  let html=`
    <div class="_mhdr"><h3><i class="fa-solid fa-eye"></i> ${title}</h3><button class="_mcls" onclick="closeModal()">×</button></div>
    <div class="_mbdy"><div style="border:1px solid #f0f0f0;border-radius:10px;padding:4px 16px;">${rowsHtml}</div></div>
    <div class="_mft">
      <button class="_mbtn" style="background:#999;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Close</button>
      ${editBtn}
    </div>`;
  openModal(html,"500px");
}

// ════════════════════════════════════════════════════════════════
//  VERSION DISPLAY HELPER (M18)
//  Call showVersionInSidebar() after page load in admin.html / user.html
// ════════════════════════════════════════════════════════════════
function showVersionInSidebar(containerId) {
  try {
    const el = document.getElementById(containerId);
    if (el && typeof APP !== "undefined" && APP.version) {
      el.textContent = "v" + APP.version;
      el.title = APP.name + " — System Version " + APP.version;
    }
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════════
//  REMEMBER ME HELPERS (H12) — shared by admin.html & user.html
//  login.html has its own copy; these are for the protected pages
//  to validate and clear the remember-me token on logout.
// ════════════════════════════════════════════════════════════════
const REMEMBER_TOKEN_KEY = ((typeof APP !== "undefined" && APP.shortName) ? APP.shortName.toLowerCase() : "mandir") + "_remember_token";

function getRememberToken() {
  try {
    const raw = localStorage.getItem(REMEMBER_TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (!t || Date.now() > t.expiry) { localStorage.removeItem(REMEMBER_TOKEN_KEY); return null; }
    return t;
  } catch(e) { return null; }
}

function clearRememberToken() {
  try { localStorage.removeItem(REMEMBER_TOKEN_KEY); } catch(e) {}
}

// ════════════════════════════════════════════════════════════════
//  RETRY WRAPPER — getData with auto-retry on timeout (H2)
//  Usage: getDataWithRetry("getAllData").then(...)
//  Retries once automatically after 3 seconds on timeout.
//  Shows a toast on first timeout, resets it on retry success.
// ════════════════════════════════════════════════════════════════
function getDataWithRetry(action, retryCount) {
  const attempt = retryCount || 0;
  // FIX PERF-8: Use getCached() so warm cache is returned without a network hit on retry
  return getCached(action).catch(function(err) {
    if ((err.message || "").toLowerCase().includes("timed out") && attempt < 1) {
      if (typeof toast === "function") toast("⟳ Network slow — retrying...", "warn");
      mandirCacheBust(action); // bust stale pending entry so retry fires fresh
      return new Promise(function(resolve, reject) {
        setTimeout(function() {
          getDataWithRetry(action, attempt + 1).then(resolve).catch(reject);
        }, 3000);
      });
    }
    throw err;
  });
}