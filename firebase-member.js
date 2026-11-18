/* Firebase (Firestore) data loader for the MEMBER and ADMIN dashboards.
   Members: only their own profile + contributions and the shared lists. Admins: all tables.
   If anything is not ready (not signed in to Firebase, offline, rules, etc.) it quietly
   falls back to the old Apps Script getAllData, so the dashboard always still works. */
(function () {
  var V = "10.12.2", B = "https://www.gstatic.com/firebasejs/" + V + "/", _p = null, _cache = null, _cacheAt = 0;
  var _imp = function (u) { return import(u); };
  var _skipHook = false;                               // set while the normal Apps Script fallback is being started (stops a loop)

  function sdk() {
    if (_p) return _p;
    if (typeof FIREBASE_CONFIG === "undefined" || !FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey) return Promise.reject(new Error("no firebase config"));
    _p = Promise.all([_imp(B + "firebase-app.js"), _imp(B + "firebase-auth.js"), _imp(B + "firebase-firestore.js")]).then(function (m) {
      var app = m[0].initializeApp(FIREBASE_CONFIG);
      return { auth: m[1].getAuth(app), db: m[2].getFirestore(app), A: m[1], F: m[2] };
    });
    _p.catch(function () { _p = null; });
    return _p;
  }

  // Wait for Firebase to restore the saved login (usually a fraction of a second)
  function who(s, ms) {
    return new Promise(function (res) {
      var off = function () {};
      var t = setTimeout(function () { off(); res(s.auth.currentUser || null); }, ms);
      off = s.A.onAuthStateChanged(s.auth, function (u) { clearTimeout(t); off(); res(u); });
    });
  }

  // ── tiny profile photos kept in Firestore (never allowed to break the main data load) ──
  window._fbThumbs = window._fbThumbs || {};
  window.mandirThumb = function (fileId) { return (window._fbThumbs && window._fbThumbs[fileId]) || null; };
  function loadThumbs(s, userId, admin) {
    var F = s.F;
    var p = admin
      ? F.getDocs(F.collection(s.db, "photoThumbs")).then(function (q) { return q.docs.map(function (d) { return d.data(); }); })
      : F.getDoc(F.doc(s.db, "photoThumbs", String(userId))).then(function (d) { return d.exists() ? [d.data()] : []; });
    return p.then(function (list) {
      var m = {};
      list.forEach(function (x) { if (x && x.FileId && x.Thumb) { window._fbThumbs[x.FileId] = x.Thumb; m[x.FileId] = x.Thumb; } });
      return m;
    }, function () { return {}; });
  }

  var byNum = function (a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true }); };
  var bySort = function (k) { return function (x, y) { return (Number(x.SortOrder) || 0) - (Number(y.SortOrder) || 0) || byNum(x[k], y[k]); }; };

  window.fbLoadMemberData = async function (userId, force) {
    userId = String(userId);
    if (!force && _cache && _cache.uid === userId && Date.now() - _cacheAt < 300000) return _cache.data;
    var t0 = Date.now();
    var s = await sdk(), u = await who(s, 7000);
    if (!u || u.uid !== userId) throw new Error("not signed in to Firebase");
    var thP = loadThumbs(s, userId, false);
    var F = s.F, db = s.db, col = function (c) { return F.collection(db, c); };
    var r = await Promise.all([
      F.getDoc(F.doc(db, "users", userId)),
      F.getDocs(F.query(col("contributions"), F.where("UserId", "==", userId))),
      F.getDocs(col("types")), F.getDocs(col("occasions")), F.getDocs(col("goals"))
    ]);
    var list = function (q) { return q.docs.map(function (d) { return d.data(); }); };
    if (!r[0].exists()) throw new Error("profile not found in Firestore");
    await thP;
    var data = {
      users: [r[0].data()],
      types: list(r[2]).sort(bySort("TypeId")),
      occasions: list(r[3]).sort(bySort("OccasionId")),
      contributions: list(r[1]).sort(function (x, y) { return byNum(x.Id, y.Id); }),
      goals: list(r[4]).sort(function (x, y) { return byNum(x.GoalId, y.GoalId); }),
      expenses: [], expenseTypes: [], yearConfig: []
    };
    _cache = { uid: userId, data: data }; _cacheAt = Date.now();
    try { console.info("[firebase] dashboard data loaded from Firestore in " + (Date.now() - t0) + " ms"); } catch (e) {}
    return data;
  };


  // ── Admin: the whole getAllData shape, read from Firestore (admins only; rules enforce it) ──
  var _acache = null, _acacheAt = 0;
  window.fbLoadAdminData = async function (userId, force) {
    userId = String(userId);
    if (!force && _acache && _acache.uid === userId && Date.now() - _acacheAt < 300000) return _acache.data;
    // Reload / second tab within 2 minutes: reuse the copy kept for this browser session (saves ~600 Firestore reads)
    if (!force) {
      try {
        var sc = JSON.parse(sessionStorage.getItem("fb_admin_cache") || "null");
        if (sc && sc.uid === userId && Date.now() - sc.at < 120000 && sc.data && sc.data.users) { try { var tm = sc.thumbs || {}; for (var k in tm) window._fbThumbs[k] = tm[k]; } catch (e2) {} _acache = { uid: userId, data: sc.data }; _acacheAt = sc.at; return sc.data; }
      } catch (e) {}
    }
    var t0 = Date.now();
    var s = await sdk(), u = await who(s, 7000);
    if (!u || u.uid !== userId) throw new Error("not signed in to Firebase");
    var thP = loadThumbs(s, userId, true);
    var F = s.F, db = s.db, all = function (c) { return F.getDocs(F.collection(db, c)); };
    var r = await Promise.all([all("users"), all("contributions"), all("types"), all("occasions"), all("expenses"), all("expenseTypes"), all("goals"), all("yearConfig")]);
    var thumbs = await thP;
    var list = function (q) { return q.docs.map(function (d) { return d.data(); }); };
    var users = list(r[0]).sort(function (x, y) { return byNum(x.UserId, y.UserId); });
    if (!users.some(function (x) { return String(x.UserId) === userId; })) throw new Error("admin profile not found in Firestore");
    users.forEach(function (x) { if (String(x.UserId) !== userId) x.IsDefaultPwd = false; });   // same as the old getAllData: flag only for the requester
    var byName = function (x, y) { return (Number(x.SortOrder) || 0) - (Number(y.SortOrder) || 0) || byNum(x.Name || x.ExpenseTypeId || "", y.Name || y.ExpenseTypeId || ""); };
    var data = {
      users: users,
      types: list(r[2]).sort(bySort("TypeId")),
      occasions: list(r[3]).sort(bySort("OccasionId")),
      contributions: list(r[1]).sort(function (x, y) { return byNum(x.Id, y.Id); }),
      expenses: list(r[4]).sort(function (x, y) { return byNum(x.Id, y.Id); }),
      expenseTypes: list(r[5]).sort(byName),
      goals: list(r[6]).sort(function (x, y) { return byNum(x.GoalId, y.GoalId); }),
      yearConfig: list(r[7]).sort(function (x, y) { return Number(x.Year) - Number(y.Year); })
    };
    _acache = { uid: userId, data: data }; _acacheAt = Date.now();
    try { sessionStorage.setItem("fb_admin_cache", JSON.stringify({ uid: userId, at: _acacheAt, data: data, thumbs: thumbs })); } catch (e) {}   // too big / blocked: just skip
    try { console.info("[firebase] admin data loaded from Firestore in " + (Date.now() - t0) + " ms (" + (users.length + data.contributions.length + data.expenses.length) + " main records)"); } catch (e) {}
    return data;
  };


  // ── Contribution requests straight from Firestore (small table) ──
  // Admin: pending requests only. Member: only their own. Called through getData() in app.js.
  var _rq = {};
  function fbLoadRequests(kind, userId) {
    var key = kind + "|" + userId, hit = _rq[key];
    if (hit && Date.now() - hit.at < 60000) return Promise.resolve(hit.data);
    return sdk().then(function (s) {
      return who(s, 7000).then(function (u) {
        if (!u || u.uid !== String(userId)) throw new Error("not signed in to Firebase");
        var F = s.F, col = F.collection(s.db, "contributionRequests");
        var q = kind === "getContributionRequests"
          ? F.query(col, F.where("Status", "==", "Pending"))
          : F.query(col, F.where("UserId", "==", String(userId)));
        return F.getDocs(q).then(function (snap) {
          var data = snap.docs.map(function (d) { return d.data(); }).sort(function (x, y) { return byNum(y.ReqId, x.ReqId); });  // newest first, like the old reply
          _rq[key] = { at: Date.now(), data: data };
          return data;
        });
      });
    });
  }
  // ── small shared lists: broadcasts, today's birthdays, birthday wishes ──
  var _fc = {};
  function cached(key, ssMs, fn) {                    // 60 s in memory, optional copy for this browser session
    var hit = _fc[key];
    if (hit && Date.now() - hit.at < 60000) return Promise.resolve(hit.data);
    if (ssMs) { try { var r = JSON.parse(sessionStorage.getItem("fbc_" + key) || "null"); if (r && Date.now() - r.at < ssMs) { _fc[key] = r; return Promise.resolve(r.data); } } catch (e) {} }
    return fn().then(function (data) {
      var rec = { at: Date.now(), data: data }; _fc[key] = rec;
      if (ssMs) { try { sessionStorage.setItem("fbc_" + key, JSON.stringify(rec)); } catch (e) {} }
      return data;
    });
  }
  function signedInAs(userId) { return sdk().then(function (s) { return who(s, 7000).then(function (u) { if (!u || u.uid !== String(userId)) throw new Error("not signed in to Firebase"); return s; }); }); }
  function istNow() { var d = new Date(Date.now() + 19800000), p = function (n) { return ("0" + n).slice(-2); }; return { year: d.getUTCFullYear(), key: d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) }; }

  function fbBroadcasts(userId, admin) {
    return cached("bc|" + (admin ? "a" : "m"), 120000, function () {
      return signedInAs(userId).then(function (s) {
        var F = s.F;
        return F.getDocs(F.query(F.collection(s.db, "broadcasts"), F.orderBy("BcId", "desc"), F.limit(20))).then(function (snap) {
          var rows = snap.docs.map(function (d) { var x = d.data(); return { BcId: x.BcId || "", Type: x.Type || "", Priority: x.Priority || "normal", Title: x.Title || "", Message: x.Message || "", Time: x.Time || "", AdminName: x.AdminName || "", Status: x.Status || "Enabled" }; });
          return admin ? rows : rows.filter(function (b) { return String(b.Status || "Enabled").toLowerCase() !== "disabled"; });   // same order of steps as the old reply
        });
      });
    });
  }

  function fbBirthdays(userId) {
    var n = istNow();
    return cached("bd|" + userId + "|" + n.key, 120000, function () {
      return signedInAs(userId).then(function (s) {
        var F = s.F;
        return Promise.all([
          F.getDoc(F.doc(s.db, "meta", "birthdays")),
          F.getDocs(F.query(F.collection(s.db, "wishes"), F.where("FromUserId", "==", String(userId))))
        ]).then(function (r) {
          if (!r[0].exists()) throw new Error("no birthday list yet");
          var b = r[0].data();
          if (b.date !== n.key) throw new Error("birthday list not refreshed for today yet");      // -> normal Apps Script call
          var wished = {};
          r[1].docs.forEach(function (d) { var w = d.data(); if (String(w.Year) === String(n.year)) wished[String(w.ToUserId)] = true; });
          var mine = false, others = [];
          (b.people || []).forEach(function (x) {
            if (String(x.UserId) === String(userId)) mine = true;
            else others.push({ UserId: x.UserId, Name: x.Name, PhotoURL: x.PhotoURL || "", alreadyWished: !!wished[String(x.UserId)] });
          });
          return { status: "success", isMyBirthdayToday: mine, others: others };
        });
      });
    });
  }

  function fbMyWishes(userId) {
    var n = istNow();
    return cached("mw|" + userId + "|" + n.key, 0, function () {
      return signedInAs(userId).then(function (s) {
        var F = s.F;
        return F.getDocs(F.query(F.collection(s.db, "wishes"), F.where("ToUserId", "==", String(userId)))).then(function (snap) {
          var wishes = snap.docs.map(function (d) { return d.data(); })
            .filter(function (w) { return String(w.Year) === String(n.year); })
            .sort(function (a, b) { return byNum(b.WishId, a.WishId); })                        // newest first
            .map(function (w) { return { WishId: w.WishId, FromName: w.FromName, Message: w.Message, Timestamp: w.Timestamp }; });
          return { status: "success", wishes: wishes, count: wishes.length };
        });
      });
    });
  }

  // Health check: the server prepares it in the background (about every 15 minutes) and every admin reads the same snapshot instantly.
  function fbHealth(userId) {
    return cached("hc", 0, function () {
      return signedInAs(userId).then(function (s) {
        var F = s.F;
        return F.getDoc(F.doc(s.db, "adminMeta", "health")).then(function (d) {
          if (!d.exists()) throw new Error("no health snapshot yet");
          var x = d.data();
          if (!x.at || Date.now() - Number(x.at) > 30 * 60 * 1000) throw new Error("health snapshot is old");   // -> normal Apps Script call
          return JSON.parse(x.json);
        });
      });
    });
  }

  // Returns a Promise of the answer, or null when this action is not handled here (-> normal Apps Script call).
  var _FB_READS = { getHealthCheck: 1, getAllData: 1, getUsers: 1, getContributionRequests: 1, getUserContributionRequests: 1, getBroadcasts: 1, getBroadcastsAdmin: 1, getTodayBirthdays: 1, getMyBirthdayWishes: 1 };
  window.mandirFirebaseFetch = function (action) {
    var a = String(action || "").split("&")[0];
    if (!_FB_READS[a] || _skipHook) return null;
    try {
      var s = JSON.parse(localStorage.getItem("session") || "null");
      if (!s || !s.userId) return null;
      if (a !== "getHealthCheck" && Number(localStorage.getItem("fb_stale_until") || 0) > Date.now()) return null;   // just changed something: live sheet (the health snapshot does not depend on it)
      var role = String(s.role || "").toLowerCase();
      if ((a === "getContributionRequests" || a === "getBroadcastsAdmin" || a === "getUsers" || a === "getHealthCheck") && role !== "admin") return null;
      if (a === "getHealthCheck") return fbHealth(s.userId);
      if (a === "getAllData") {                                                       // every "load all data" call, wherever it comes from
        if (role === "admin") return window.fbLoadAdminData(s.userId, false);
        if (role === "user") return window.fbLoadMemberData(s.userId, false);
        return null;
      }
      if (a === "getUsers") return window.fbLoadAdminData(s.userId, false).then(function (d) { return d.users; });
      if (a === "getContributionRequests" || a === "getUserContributionRequests") return fbLoadRequests(a, s.userId);
      if (a === "getBroadcasts") return fbBroadcasts(s.userId, false);
      if (a === "getBroadcastsAdmin") return fbBroadcasts(s.userId, true);
      if (a === "getTodayBirthdays") return fbBirthdays(s.userId);
      return fbMyWishes(s.userId);
    } catch (e) { return null; }
  };

  // Used by user.js instead of getCached("getAllData")
  window.mandirLoadAllData = async function (force) {
    try {
      var s = JSON.parse(localStorage.getItem("session") || "null");
      var stale = Number(localStorage.getItem("fb_stale_until") || 0) > Date.now();   // member just changed something: use the live sheet for 3 min
      var role = s ? String(s.role || "").toLowerCase() : "";
      if (s && s.userId && !stale) {
        if (role === "user") return await window.fbLoadMemberData(s.userId, force);
        if (role === "admin") return await window.fbLoadAdminData(s.userId, force);
      }
    } catch (e) { try { console.warn("[firebase] using Apps Script instead:", e && e.message); } catch (x) {} }
    _skipHook = true;                                  // we already tried Firestore: go straight to Apps Script
    try { return getCached("getAllData"); } finally { _skipHook = false; }
  };

  // Called when something was saved: forget every saved Firestore copy so the next read is fresh.
  window.mandirFbInvalidate = function () {
    _cache = null; _acache = null; _fc = {}; _rq = {};
    try {
      sessionStorage.removeItem("fb_admin_cache");
      for (var i = sessionStorage.length - 1; i >= 0; i--) { var k = sessionStorage.key(i); if (k && k.indexOf("fbc_") === 0) sessionStorage.removeItem(k); }
    } catch (e) {}
  };

  window.fbSignOut = function () { return sdk().then(function (s) { return s.A.signOut(s.auth); }).catch(function () {}); };
})();