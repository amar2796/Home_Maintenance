/* ═══════════════════════════════════════════════════════════════
   MANDIR CHATBOT WIDGET — chatbot_widget.js
   Include this file on: index.html, login.html, user.html
   Requires: config.js (for API_URL) and constants.js (for APP)
   to be loaded BEFORE this script.
   Usage: <script src="chatbot_widget.js"></script>
   ═══════════════════════════════════════════════════════════════ */

   (function () {
    "use strict";
  
    /* ── CONFIG CACHE ── */
    var _botConfig = null;
    var _botConfigTime = 0;
    var _botLang = "en";
    var _botOpen = false;
  
    /* ── QRCode lib (load on demand) ── */
    var _qrLoaded = false;
    function _loadQR(cb) {
      if (_qrLoaded || window.QRCode) { _qrLoaded = true; cb(); return; }
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      s.onload = function () { _qrLoaded = true; cb(); };
      s.onerror = function () { cb(); };
      document.head.appendChild(s);
    }
  
    /* ── JSONP helper (self-contained, no dependency on app.js) ── */
    var _cbIdx = 0;
    function _fetchJSON(url, cb) {
      _cbIdx++;
      var name = "_botCb_" + _cbIdx + "_" + Date.now();
      var script = document.createElement("script");
      var done = false;
  
      // [IMPROVEMENT] Extracted duplicate cleanup logic into a single inner function
      function _cleanup() {
        try { delete window[name]; script.remove(); } catch (e) {}
      }
  
      window[name] = function (data) {
        if (done) return; done = true;
        clearTimeout(timer);
        _cleanup();
        cb(null, data);
      };
      var timer = setTimeout(function () {
        if (done) return; done = true;
        window[name] = _cleanup;
        cb(new Error("timeout"), null);
      }, 25000);
      script.onerror = function () {
        if (done) return; done = true;
        clearTimeout(timer);
        window[name] = _cleanup;
        cb(new Error("network"), null);
      };
      script.src = url + (url.indexOf("?") === -1 ? "?" : "&") + "callback=" + name;
      document.body.appendChild(script);
    }
  
    /* ── LOAD CHATBOT CONFIG ── */
    function _loadConfig(cb) {
      var now = Date.now();
      if (_botConfig && (now - _botConfigTime) < 30000) { cb(_botConfig); return; }
      var apiUrl = (typeof API_URL !== "undefined" ? API_URL : "") || (window.API_URL || "");
      if (!apiUrl) { _botConfig = { enabled: "0" }; cb(_botConfig); return; }
      _fetchJSON(apiUrl + "?action=getChatbotConfig", function (err, data) {
        // FIX: On error/bad response, use { enabled:"0" } so chatbot does NOT render
      // when config can't be fetched. Previously {} caused enabled || "1" = "1" → always shown.
      _botConfig = (!err && data && !data.error) ? data : { enabled: "0" };
        _botConfigTime = Date.now();

        // ── Auto-fill bank/UPI from server when chatbot config fields are blank.
        // getPublicPaymentDetails needs no session — works for all visitors.
        // Admin can always override these via the Chatbot Config panel in admin.html.
        var needsBankFill = !_botConfig.bank_name && !_botConfig.bank_account && !_botConfig.upi_id;
        // Always fall back contact fields from APP constants (already in constants.js)
        if (!_botConfig.contact_phone && window.APP && APP.phone) _botConfig.contact_phone = APP.phone;
        if (!_botConfig.contact_email && window.APP && APP.email) _botConfig.contact_email = APP.email;

        if (needsBankFill) {
          _fetchJSON(apiUrl + "?action=getPublicPaymentDetails", function(err2, pay) {
            if (!err2 && pay && pay.status === "ok") {
              if (!_botConfig.upi_id)       _botConfig.upi_id       = pay.upiId       || "";
              if (!_botConfig.bank_name)    _botConfig.bank_name    = pay.bankName    || "";
              if (!_botConfig.bank_account) _botConfig.bank_account = pay.accountNo   || "";
              if (!_botConfig.bank_ifsc)    _botConfig.bank_ifsc    = pay.ifscCode    || "";
              if (!_botConfig.bank_branch)  _botConfig.bank_branch  = pay.bankBranch  || "";
            }
            cb(_botConfig);
          });
        } else {
          // Config already has bank fields set by admin — use as-is
          cb(_botConfig);
        }
      });
    }
  
    function _cfg(key) {
      if (!_botConfig) return "";
      return String(_botConfig[key] || "").replace(/\\n/g, "\n");
    }
  
    function _t(key) { return _cfg(key + "_" + _botLang) || _cfg(key + "_en") || ""; }
  
    /* ── [IMPROVEMENT] Bilingual helper — replaces 15+ inline ternaries ── */
    function _bi(en, hi) { return _botLang === "en" ? en : hi; }
  
    /* ══════════════ INJECT CSS ══════════════ */
    function _injectCSS() {
      if (document.getElementById("_mbotCSS")) return;
      var chatBtnBottom = "24px";
      var chatWinBottom = "94px";
      var css = `
  /* ── Chatbot help bubble tooltip ── */
  #_mbotHelpBubble {
    position: fixed; z-index: 99991;
    right: 86px;
    background: #fff;
    color: #334155;
    font-family: Poppins, sans-serif;
    font-size: 12.5px;
    font-weight: 600;
    padding: 8px 14px;
    border-radius: 20px 20px 4px 20px;
    box-shadow: 0 4px 18px rgba(0,0,0,0.14);
    border: 1.5px solid rgba(247,160,26,0.35);
    white-space: nowrap;
    pointer-events: none;
    transition: opacity 0.4s ease, transform 0.4s ease;
    transform: translateX(6px);
  }
  #_mbotHelpBubble.show {
    opacity: 1 !important;
    transform: translateX(0);
  }
  #_mbotHelpBubble::after {
    content: '';
    position: absolute;
    right: -9px; top: 50%;
    transform: translateY(-50%);
    border: 5px solid transparent;
    border-left-color: rgba(247,160,26,0.35);
  }
  @media (max-width: 420px) {
    #_mbotHelpBubble { right: 70px; font-size: 11.5px; padding: 7px 12px; }
  }
  
  #_mbotBtn {
    position: fixed; bottom: ${chatBtnBottom}; right: 24px; z-index: 99990;
    width: 54px; height: 54px; border-radius: 50%;
    background: linear-gradient(135deg, #f7a01a, #e08e12);
    box-shadow: 0 6px 22px rgba(247,160,26,0.45);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: 24px; border: 3px solid #fff;
    transition: transform 0.22s ease, box-shadow 0.22s ease;
    user-select: none;
  }
  #_mbotBtn:hover { transform: scale(1.1); box-shadow: 0 8px 28px rgba(247,160,26,0.55); }
  #_mbotBtn._open { transform: rotate(90deg) scale(1.05); }
  
  #_mbotWin {
    position: fixed; bottom: ${chatWinBottom}; right: 24px; z-index: 99989;
    width: 335px; max-height: 530px;
    background: #fff; border-radius: 18px;
    box-shadow: 0 12px 48px rgba(0,0,0,0.18);
    display: flex; flex-direction: column;
    overflow: hidden;
    transform: scale(0.85) translateY(30px); opacity: 0;
    pointer-events: none;
    transition: transform 0.28s cubic-bezier(0.21,1.02,0.73,1), opacity 0.22s ease;
  }
  #_mbotWin._show {
    transform: scale(1) translateY(0); opacity: 1; pointer-events: all;
  }
  #_mbotHdr {
    background: linear-gradient(135deg, #1e293b, #334155);
    padding: 13px 14px 11px;
    display: flex; align-items: center; gap: 10px;
    border-top: 3px solid #f7a01a; flex-shrink: 0;
  }
  
  /* login logo */
  #_mbotHdr .mbot-logo {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(247,160,26,0.55);
    box-shadow: 0 0 10px rgba(247,160,26,0.35);
    flex-shrink: 0;
    background: #78501e;
  }
  
  #_mbotHdr .mbot-avatar {
    width: 34px; height: 34px; border-radius: 50%;
    background: #f7a01a; display: flex; align-items: center;
    justify-content: center; font-size: 17px; flex-shrink: 0;
  }
  #_mbotHdr .mbot-title { flex: 1; }
  #_mbotHdr .mbot-title div:first-child { color: #f7a01a; font-size: 13px; font-weight: 700; font-family: Poppins, sans-serif; }
  #_mbotHdr .mbot-title div:last-child { color: #94a3b8; font-size: 10px; font-family: Poppins, sans-serif; }
  .mbot-hbtn {
    background: rgba(255,255,255,0.12); border: none; cursor: pointer;
    color: #cbd5e1; border-radius: 7px; padding: 4px 8px;
    font-size: 11px; font-weight: 700; font-family: Poppins, sans-serif;
    transition: background 0.18s;
  }
  .mbot-hbtn:hover { background: rgba(255,255,255,0.22); color: #fff; }
  #_mbotMsgs {
    flex: 1; overflow-y: auto; padding: 14px 12px 8px;
    display: flex; flex-direction: column; gap: 10px;
    background: #f8fafc;
  }
  #_mbotMsgs::-webkit-scrollbar { width: 4px; }
  #_mbotMsgs::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
  .mbot-msg {
    max-width: 86%; background: #fff;
    border: 1px solid #e8edf5; border-radius: 14px 14px 14px 4px;
    padding: 10px 13px; font-size: 12.5px; font-family: Poppins, sans-serif;
    line-height: 1.6; color: #334155;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    white-space: pre-wrap; word-break: break-word;
  }
  .mbot-msg.user {
    align-self: flex-end; background: #f7a01a; color: #fff;
    border: none; border-radius: 14px 14px 4px 14px;
  }
  .mbot-msg.bot { align-self: flex-start; }
  .mbot-qr-wrap {
    background: #fff; border: 1px solid #e8edf5; border-radius: 14px;
    padding: 12px; display: flex; flex-direction: column; align-items: center;
    gap: 8px; align-self: flex-start;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  }
  .mbot-qr-wrap .mbot-qr-label { font-size: 11px; color: #64748b; font-family: Poppins, sans-serif; }
  .mbot-qr-wrap .mbot-qr-id { font-size: 11.5px; font-weight: 700; color: #334155; font-family: monospace; letter-spacing: 0.5px; }
  .mbot-replies {
    display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 0 2px;
    align-self: flex-start; max-width: 100%;
  }
  .mbot-pill {
    background: #fff; border: 1.5px solid #e2e8f0;
    border-radius: 20px; padding: 5px 12px;
    font-size: 11.5px; font-family: Poppins, sans-serif; font-weight: 600;
    color: #334155; cursor: pointer;
    transition: all 0.18s ease;
    white-space: nowrap;
  }
  .mbot-pill:hover { background: #f7a01a; border-color: #f7a01a; color: #fff; }
  .mbot-typing { display: flex; align-items: center; gap: 4px; padding: 10px 14px; }
  .mbot-typing span {
    width: 7px; height: 7px; background: #cbd5e1; border-radius: 50%;
    animation: mbotDot 1.2s infinite; display: inline-block;
  }
  .mbot-typing span:nth-child(2) { animation-delay: 0.2s; }
  .mbot-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes mbotDot { 0%,80%,100%{transform:scale(0.7);opacity:0.5} 40%{transform:scale(1);opacity:1} }
  #_mbotFoot {
    display: flex; gap: 6px; padding: 8px 10px;
    background: #fff; border-top: 1px solid #f0f4f8; flex-shrink: 0;
  }
  #_mbotInput {
    flex: 1; border: 1.5px solid #e2e8f0; border-radius: 22px;
    padding: 8px 14px; font-size: 12.5px; font-family: Poppins, sans-serif;
    outline: none; color: #334155; background: #f8fafc;
    transition: border-color 0.18s;
  }
  #_mbotInput:focus { border-color: #f7a01a; background: #fff; }
  #_mbotSend {
    width: 36px; height: 36px; border-radius: 50%; border: none;
    background: #f7a01a; cursor: pointer; display: flex;
    align-items: center; justify-content: center;
    font-size: 15px; flex-shrink: 0; color: #fff;
    transition: background 0.18s, transform 0.15s;
  }
  #_mbotSend:hover { background: #d35400; transform: scale(1.08); }
  #_mbotUnread {
    position: absolute; top: -4px; right: -4px;
    background: #e74c3c; color: #fff; border-radius: 50%;
    width: 16px; height: 16px; font-size: 9px; font-weight: 700;
    display: none; align-items: center; justify-content: center;
    font-family: Poppins, sans-serif;
  }
  @media (max-width: 420px) {
    #_mbotWin { width: calc(100vw - 20px); right: 10px; bottom: ${chatWinBottom}; }
    #_mbotBtn { right: 14px; bottom: 24px; width: 48px; height: 48px; font-size: 21px; }
  }
      `;
      var el = document.createElement("style");
      el.id = "_mbotCSS"; el.textContent = css;
      document.head.appendChild(el);
    }
  
    /* ══════════════ BUILD DOM ══════════════ */
  
    // [IMPROVEMENT] Extracted _alignBubble to module scope so the resize listener
    // references a stable function (avoids a new closure per _buildDOM call).
    function _alignBubble() {
      var btnEl = document.getElementById("_mbotBtn");
      var bub = document.getElementById("_mbotHelpBubble");
      if (!btnEl || !bub) return;
      var rect = btnEl.getBoundingClientRect();
      bub.style.bottom = (window.innerHeight - rect.bottom + (rect.height / 2) - 18) + "px";
    }
  
    function _buildDOM() {
      if (document.getElementById("_mbotBtn")) return;
  
      /* Help bubble tooltip */
      var bubble = document.createElement("div");
      bubble.id = "_mbotHelpBubble";
      bubble.innerHTML = "How can I help you? 🙏";
      bubble.style.cssText = "opacity:0;";
      document.body.appendChild(bubble);
  
      /* Floating button */
      var btn = document.createElement("div");
      btn.id = "_mbotBtn";
      btn.innerHTML = '🙏<div id="_mbotUnread"></div>';
      btn.onclick = _toggleChat;
      document.body.appendChild(btn);
  
      _alignBubble();
      window.addEventListener("resize", _alignBubble);
  
      /* Show bubble after 1.8s, hide after 6s or on first click */
      setTimeout(function () {
        var bub = document.getElementById("_mbotHelpBubble");
        if (bub && !_botOpen) {
          bub.classList.add("show");
          setTimeout(function () {
            if (bub) { bub.classList.remove("show"); setTimeout(function(){ if(bub) bub.style.display="none"; }, 500); }
          }, 5000);
        }
      }, 1800);
  
      /* Chat window */
      var win = document.createElement("div");
      win.id = "_mbotWin";
      win.innerHTML = `
        <div id="_mbotHdr">
          <div class="mbot-avatar">
             <img src="Image/logo.PNG" alt="Mandir Logo" class="mbot-logo" onerror="this.style.display='none';document.getElementById('hdrIcon').style.display='inline';">
            <i id="hdrIcon" class="fa-solid fa-place-of-worship" style="display:none;color:#f7a01a;font-size:1.4rem;filter:drop-shadow(0 0 6px rgba(247,160,26,0.6));"></i>
          </div>
          <div class="mbot-title">
            <div>Mandir Assistant</div>
            <div>Online · <span id="_mbotTagline">Jai Shree Ram</span></div>
          </div>
          <button class="mbot-hbtn" id="_mbotLangBtn" onclick="_mbotToggleLang()">EN</button>
          <button class="mbot-hbtn" onclick="_mbotClose()" style="padding:4px 9px;font-size:14px;">×</button>
        </div>
        <div id="_mbotMsgs"></div>
        <div id="_mbotFoot">
          <input id="_mbotInput" placeholder="Type a message..." />
          <button id="_mbotSend">➤</button>
        </div>
      `;
      document.body.appendChild(win);

      // Set header tagline from APP constants
      var _tglEl = document.getElementById("_mbotTagline");
      if (_tglEl && window.APP && APP.tagline) _tglEl.textContent = APP.tagline;
  
      document.getElementById("_mbotInput").addEventListener("keydown", function (e) {
        if (e.key === "Enter") _mbotHandleInput();
      });
      document.getElementById("_mbotSend").addEventListener("click", _mbotHandleInput);
    }
  
    /* ══════════════ OPEN / CLOSE ══════════════ */
    window._mbotClose = function () {
      _botOpen = false;
      document.getElementById("_mbotBtn").classList.remove("_open");
      document.getElementById("_mbotWin").classList.remove("_show");
    };
  
    function _toggleChat() {
      if (_botOpen) { window._mbotClose(); return; }
      _botOpen = true;
      /* Hide help bubble permanently once user interacts */
      var bub = document.getElementById("_mbotHelpBubble");
      if (bub) { bub.classList.remove("show"); bub.style.display = "none"; }
      document.getElementById("_mbotBtn").classList.add("_open");
      document.getElementById("_mbotUnread").style.display = "none";
      var win = document.getElementById("_mbotWin");
      win.classList.add("_show");
      var msgs = document.getElementById("_mbotMsgs");
      if (msgs.children.length === 0) {
        // Force fresh config load (bust cache) to pick up latest admin settings
        _botConfig = null;
        _showTyping();
        _loadConfig(function (cfg) {
          _removeTyping();
          if (String(cfg.enabled ?? "0") === "0") {
            // Admin disabled after page load (or config load failed) — close and hide button
            window._mbotClose();
            var btn = document.getElementById("_mbotBtn");
            if (btn) btn.style.display = "none";
            return;
          }
          _addBotMsg(_t("welcome") || (window.APP && APP.tagline ? APP.tagline + "! How can I help you?" : "How can I help you?"));
          setTimeout(function () { _showMainMenu(); }, 200);
        });
      }
    }
  
    /* ══════════════ MESSAGES ══════════════ */
    function _scrollBottom() {
      var el = document.getElementById("_mbotMsgs");
      if (el) setTimeout(function () { el.scrollTop = el.scrollHeight; }, 50);
    }
  
    // [IMPROVEMENT] Unified _addBotMsg / _addUserMsg into a single _addMsg function.
    // Both were identical except for the CSS class; zero behaviour change.
    function _addMsg(text, role) {
      var div = document.createElement("div");
      div.className = "mbot-msg " + role;
      div.textContent = text;
      document.getElementById("_mbotMsgs").appendChild(div);
      _scrollBottom();
      return div;
    }
    function _addBotMsg(text)  { return _addMsg(text, "bot"); }
    function _addUserMsg(text) { _addMsg(text, "user"); }
  
    function _showTyping() {
      var div = document.createElement("div");
      div.className = "mbot-msg bot mbot-typing";
      div.id = "_mbotTyping";
      div.innerHTML = "<span></span><span></span><span></span>";
      document.getElementById("_mbotMsgs").appendChild(div);
      _scrollBottom();
    }
  
    function _removeTyping() {
      var el = document.getElementById("_mbotTyping");
      if (el) el.remove();
    }
  
    // [IMPROVEMENT] Extracted the repeated _showTyping + setTimeout + _removeTyping
    // pattern into a single _withTyping helper. Delay stays at 600 ms.
    function _withTyping(fn) {
      _showTyping();
      setTimeout(function () { _removeTyping(); fn(); }, 600);
    }
  
    function _addReplies(pills) {
      var wrap = document.createElement("div");
      wrap.className = "mbot-replies";
      pills.forEach(function (p) {
        var btn = document.createElement("button");
        btn.className = "mbot-pill";
        btn.textContent = p.label;
        btn.onclick = function () { wrap.remove(); p.action(); };
        wrap.appendChild(btn);
      });
      document.getElementById("_mbotMsgs").appendChild(wrap);
      _scrollBottom();
    }
  
    /* ══════════════ MAIN MENU ══════════════ */
    function _showMainMenu() {
      var pills = [
        { label: _bi("🕒 Timings", "🕒 समय"),             action: function () { _answer("timings"); } },
        { label: _bi("📍 Location", "📍 स्थान"),            action: function () { _answer("location"); } },
        { label: _bi("💰 How to Donate", "💰 दान कैसे करें"), action: function () { _answer("donate"); } },
        { label: _bi("🏦 Bank Details", "🏦 बैंक विवरण"),    action: function () { _answer("bank"); } },
        { label: "📱 UPI / QR",                            action: function () { _answer("upi"); } },
        { label: _bi("📞 Contact", "📞 संपर्क"),             action: function () { _answer("contact"); } }
      ];
      // Add custom questions if set
      var q1 = _t("custom_q1");
      var q2 = _t("custom_q2");
      if (q1) pills.push({ label: q1, action: function () { _answer("custom1"); } });
      if (q2) pills.push({ label: q2, action: function () { _answer("custom2"); } });
      _addReplies(pills);
    }
  
    function _showBackMenu() {
      _addReplies([
        { label: _bi("⬅ Main Menu", "⬅ मुख्य मेनू"), action: function () { _addBotMsg(_t("welcome") || "How else can I help?"); _showMainMenu(); } }
      ]);
    }
  
    /* ══════════════ ANSWERS ══════════════ */
    function _answer(topic) {
      _addUserMsg(_topicLabel(topic));
      // [IMPROVEMENT] Uses _withTyping — no more duplicate _showTyping/setTimeout/
      // _removeTyping blocks. Early-return cases (bank/upi/contact) call _showBackMenu
      // themselves, so we gate _showBackMenu only for the remaining cases.
      _withTyping(function () {
        switch (topic) {
          case "timings":
            _addBotMsg(_t("timings") || "Please contact the temple for timings.");
            break;
          case "location":
            _addBotMsg(_t("location") || "Please contact the temple for location details.");
            break;
          case "donate":
            _addBotMsg(_t("donate") || "Please contact the temple to learn how to donate.");
            break;
          case "bank":    _answerBank();    return;
          case "upi":     _answerUPI();     return;
          case "contact": _answerContact(); return;
          case "custom1":
            _addBotMsg(_t("custom_a1") || "Please contact the temple for more information.");
            break;
          case "custom2":
            _addBotMsg(_t("custom_a2") || "Please contact the temple for more information.");
            break;
        }
        _showBackMenu();
      });
    }
  
    function _topicLabel(topic) {
      var labels = {
        timings:  _bi("Timings", "समय"),
        location: _bi("Location", "स्थान"),
        donate:   _bi("How to Donate", "दान कैसे करें"),
        bank:     _bi("Bank Details", "बैंक विवरण"),
        upi:      "UPI / QR",
        contact:  _bi("Contact", "संपर्क"),
        custom1:  _t("custom_q1") || "Question",
        custom2:  _t("custom_q2") || "Question"
      };
      return labels[topic] || topic;
    }
  
    // [IMPROVEMENT] Shared bilingual line builder used by _answerBank and _answerContact.
    // Eliminates repeated pattern: if (val) lines += (_bi(en, hi)) + val + "\n"
    function _biLine(en, hi, val) {
      return val ? (_bi(en, hi) + val + "\n") : "";
    }
  
    function _answerBank() {
      var bn = _cfg("bank_name"), ba = _cfg("bank_account"),
          bi = _cfg("bank_ifsc"), bb = _cfg("bank_branch");
      if (!bn && !ba) {
        _addBotMsg(_bi(
          "Bank details have not been set yet. Please contact the temple admin.",
          "बैंक विवरण अभी उपलब्ध नहीं है। कृपया मंदिर प्रशासक से संपर्क करें।"
        ));
      } else {
        var lines = _bi("Bank Details:\n\n", "बैंक विवरण:\n\n");
        lines += _biLine("Bank: ",    "बैंक: ",    bn);
        lines += _biLine("Account: ", "खाता नं: ", ba);
        lines += bi ? "IFSC: " + bi + "\n" : "";
        lines += _biLine("Branch: ",  "शाखा: ",    bb);
        _addBotMsg(lines.trim());
      }
      _showBackMenu();
    }
  
    function _answerUPI() {
      var upiId = _cfg("upi_id");
      if (!upiId) {
        _addBotMsg(_bi(
          "UPI details have not been set yet. Please contact the temple admin.",
          "UPI विवरण अभी उपलब्ध नहीं है।"
        ));
        _showBackMenu();
        return;
      }
      _addBotMsg(_bi("Scan the QR code to donate via UPI:", "दान के लिए QR कोड स्कैन करें:"));
      // QR card
      var qrWrap = document.createElement("div");
      qrWrap.className = "mbot-qr-wrap";
      var qrDiv = document.createElement("div");
      qrDiv.style.cssText = "width:130px;height:130px;";
      qrWrap.appendChild(qrDiv);
      var idDiv = document.createElement("div");
      idDiv.className = "mbot-qr-id";
      idDiv.textContent = upiId;
      qrWrap.appendChild(idDiv);
      var lbl = document.createElement("div");
      lbl.className = "mbot-qr-label";
      lbl.textContent = _bi("Any UPI app", "कोई भी UPI ऐप");
      qrWrap.appendChild(lbl);
      document.getElementById("_mbotMsgs").appendChild(qrWrap);
      _scrollBottom();
      // Generate QR
      var appName = (window.APP && APP.name) ? APP.name : "Mandir";
      var upiLink = "upi://pay?pa=" + encodeURIComponent(upiId) + "&pn=" + encodeURIComponent(appName) + "&cu=INR";
      _loadQR(function () {
        try {
          if (window.QRCode) {
            new QRCode(qrDiv, { text: upiLink, width: 130, height: 130, correctLevel: QRCode.CorrectLevel.M });
          }
        } catch (e) {
          qrDiv.textContent = upiId;
        }
      });
      _showBackMenu();
    }
  
    function _answerContact() {
      var ph = _cfg("contact_phone"), em = _cfg("contact_email"), wa = _cfg("contact_whatsapp");
      // Fall back to APP constants if config empty
      if (!ph && window.APP && APP.phone) ph = APP.phone;
      if (!em && window.APP && APP.email) em = APP.email;
      if (!ph && !em && !wa) {
        _addBotMsg(_bi(
          "Contact details have not been set yet. Please visit the temple directly.",
          "संपर्क विवरण उपलब्ध नहीं है।"
        ));
      } else {
        var lines = _bi("Contact Us:\n\n", "संपर्क करें:\n\n");
        lines += _biLine("Phone: ",     "फोन: ",   ph);
        lines += _biLine("Email: ",     "ईमेल: ",  em);
        lines += wa ? "WhatsApp: " + wa : "";
        _addBotMsg(lines.trim());
      }
      _showBackMenu();
    }
  
    /* ══════════════ TYPED MESSAGE (KEYWORD MATCHING) ══════════════ */
    window._mbotHandleInput = function () {
      var input = document.getElementById("_mbotInput");
      var text = (input.value || "").trim();
      if (!text) return;
      input.value = "";
      _addUserMsg(text);
      var lower = text.toLowerCase();
      var matched = null;
      var kw = {
        timings:  ["timing","time","open","close","hour","samay","waqt","baje","khul","band"],
        location: ["location","address","where","kahan","jagah","pata","place","map"],
        donate:   ["donat","daan","contribute","contribution","how to","kaise","paisa","money"],
        bank:     ["bank","account","transfer","ifsc","neft","rtgs"],
        upi:      ["upi","qr","scan","pay","bhim","gpay","phonepe","paytm","bhugtan"],
        contact:  ["contact","phone","call","number","email","whatsapp","sampark"]
      };
      for (var topic in kw) {
        if (kw[topic].some(function (w) { return lower.indexOf(w) !== -1; })) {
          matched = topic; break;
        }
      }
      // [IMPROVEMENT] Removed the duplicate switch block that mirrored _answer().
      // Now we just delegate to _answer() for matched topics, and use _withTyping
      // for the "not understood" fallback — both use the same 600 ms delay.
      if (matched) {
        _answer(matched);
      } else {
        _withTyping(function () {
          _addBotMsg(_bi(
            "I'm not sure about that. Please choose from the options below:",
            "मुझे समझ नहीं आया। नीचे से चुनें:"
          ));
          _showMainMenu();
        });
      }
    };
  
    /* ══════════════ LANGUAGE TOGGLE ══════════════ */
    window._mbotToggleLang = function () {
      _botLang = _botLang === "en" ? "hi" : "en";
      document.getElementById("_mbotLangBtn").textContent = _bi("EN", "HI");
      // Clear and restart
      document.getElementById("_mbotMsgs").innerHTML = "";
      _addBotMsg(_t("welcome") || (window.APP && APP.tagline ? APP.tagline + "!" : "Welcome!"));
      setTimeout(_showMainMenu, 150);
    };
  
    /* ══════════════ INIT ══════════════ */
    function _init() {
      _injectCSS();
      // Pre-load config first — only render button if chatbot is enabled
      _loadConfig(function (cfg) {
        if (String(cfg.enabled ?? "0") === "0") return; // disabled — render nothing
        _buildDOM();
      });
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", _init);
    } else {
      _init();
    }
  })();