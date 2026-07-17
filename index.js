/* ── Gallery + Announcement ── */
      /* ── Gallery — Swiper.js ── */
      var _gcPhotos = [], _gcLbIdx = 0;
      var _swiperInstance = null;

      function loadGallery() {
        // Show skeleton on start
        var loadEl = document.getElementById("galleryLoading");
        if (loadEl) loadEl.style.display = "block";

        getData("getGallery").then(function(photos) {
          if (loadEl) loadEl.style.display = "none";
          if (!Array.isArray(photos) || photos.length === 0) {
            document.getElementById("galleryEmpty").style.display = "block";
            return;
          }
          _gcPhotos = photos;
          _buildSwiper();
          document.getElementById("galleryCarouselWrap").style.display = "block";
        }).catch(function() {
          if (loadEl) loadEl.style.display = "none";
          document.getElementById("galleryEmpty").style.display = "block";
        });
      }

      function _buildSwiper() {
        var track = document.getElementById("galleryCarousel");
        track.innerHTML = "";

        _gcPhotos.forEach(function(p, i) {
          var slide = document.createElement("div");
          slide.className = "swiper-slide swiper-slide-gallery";
          slide.setAttribute("data-idx", i);
          slide.innerHTML =
            '<img src="' + p.PhotoURL + '" alt="' + (p.Caption || "Photo") + '" loading="lazy">' +
            '<div class="gc-overlay"></div>' +
            '<div class="gc-view-icon"><i class="fa-solid fa-expand"></i></div>' +
            (p.Caption ? '<div class="gc-caption">' + p.Caption + '</div>' : '');
          track.appendChild(slide);
        });

        if (_swiperInstance) { _swiperInstance.destroy(true, true); }

        _swiperInstance = new Swiper("#gallerySwiper", {
          slidesPerView: 3,
          spaceBetween: 20,
          loop: _gcPhotos.length >= 3,
          autoplay: {
            delay: 4000,
            disableOnInteraction: false,
            pauseOnMouseEnter: true,
            waitForTransition: true,
          },
          pagination: {
            el: "#gcDots",
            clickable: true,
          },
          navigation: {
            nextEl: "#gcNext",
            prevEl: "#gcPrev",
          },
          breakpoints: {
            0:   { slidesPerView: 1, spaceBetween: 14 },
            521: { slidesPerView: 2, spaceBetween: 16 },
            769: { slidesPerView: 3, spaceBetween: 20 },
          },
          grabCursor: true,
          effect: "slide",
          observer: true,
          observeParents: true,
          resizeObserver: true,
          on: {
            click: function(swiper, event) {
              /* Find the slide element that was clicked */
              var slideEl = event.target.closest(".swiper-slide-gallery");
              if (!slideEl) return;
              /* Get the real (non-duplicated) index from data-idx */
              var idx = parseInt(slideEl.getAttribute("data-idx"), 10);
              if (!isNaN(idx)) openLightbox(idx);
            }
          }
        });
        /* Force autoplay restart after init to fix intermittent no-scroll bug */
        setTimeout(function(){ if(_swiperInstance && _swiperInstance.autoplay) _swiperInstance.autoplay.start(); }, 400);
      }

      /* stubs kept so nothing else breaks */
      function gallerySlide(dir) { if(_swiperInstance){ dir>0?_swiperInstance.slideNext():_swiperInstance.slidePrev(); } }
      function galleryGoTo(idx) { if(_swiperInstance){ _swiperInstance.slideTo(idx); } }

      /* ── Lightbox ── */
      var _lbScrollY = 0;
      var _lbNavBusy = false;
      function openLightbox(idx) {
        _gcLbIdx = idx; _lbRender();
        document.getElementById("gcLightbox").classList.add("open");
        document.getElementById("gcLbPanel").classList.remove("closing");
        /* Lock body scroll — overflow:hidden only (no position:fixed to avoid page jump) */
        _lbScrollY = window.scrollY;
        document.body.style.overflow = "hidden";
        document.body.style.paddingRight = (window.innerWidth - document.documentElement.clientWidth) + "px";
        if (_swiperInstance && _swiperInstance.autoplay) _swiperInstance.autoplay.stop();
      }
      function closeLightbox() {
        var p = document.getElementById("gcLbPanel");
        p.classList.add("closing");
        setTimeout(function(){
          document.getElementById("gcLightbox").classList.remove("open");
          p.classList.remove("closing");
          /* Restore scroll */
          document.body.style.overflow = "";
          document.body.style.paddingRight = "";
          window.scrollTo(0, _lbScrollY);
          if (_gcPhotos.length && _swiperInstance && _swiperInstance.autoplay) _swiperInstance.autoplay.start();
        }, 240);
      }
      /* Close when clicking outside the image frame */
      function _lbOutsideClick(e) {
        var frame = document.getElementById("gcLbFrame");
        if (frame && !frame.contains(e.target)) { closeLightbox(); }
      }
      function lbNav(dir) {
        if (_lbNavBusy) return;
        _lbNavBusy = true;
        var img = document.getElementById("gcLightboxImg");
        /* Step 1: animate current image out */
        img.classList.remove("lb-out-l","lb-out-r","lb-in-l","lb-in-r");
        img.classList.add(dir > 0 ? "lb-out-l" : "lb-out-r");
        setTimeout(function(){
          /* Step 2: update index + src */
          _gcLbIdx = ((_gcLbIdx + dir) + _gcPhotos.length) % _gcPhotos.length;
          _lbRender();
          /* Step 3: animate new image in */
          img.classList.remove("lb-out-l","lb-out-r");
          img.classList.add(dir > 0 ? "lb-in-l" : "lb-in-r");
          setTimeout(function(){
            img.classList.remove("lb-in-l","lb-in-r");
            _lbNavBusy = false;
          }, 300);
        }, 160);
      }
      function _lbRender() {
        var p = _gcPhotos[_gcLbIdx];
        var img = document.getElementById("gcLightboxImg");
        img.src = p.PhotoURL; img.alt = p.Caption||"Photo";
        document.getElementById("gcLbCounter").textContent = (_gcLbIdx+1)+" / "+_gcPhotos.length;
        // Show / update caption
        var cap = document.getElementById("gcLbCaption");
        if (cap) { cap.textContent = p.Caption || ""; cap.style.display = p.Caption ? "block" : "none"; }
      }
      document.addEventListener("keydown", function(e){
        var lb = document.getElementById("gcLightbox");
        if (!lb||!lb.classList.contains("open")) return;
        if (e.key==="Escape") closeLightbox();
        if (e.key==="ArrowRight") lbNav(1);
        if (e.key==="ArrowLeft")  lbNav(-1);
      });
      /* Touch swipe inside lightbox */
      (function(){
        var touchStartX = 0;
        document.addEventListener("touchstart", function(e){
          var lb = document.getElementById("gcLightbox");
          if (!lb || !lb.classList.contains("open")) return;
          touchStartX = e.touches[0].clientX;
        }, {passive: true});
        document.addEventListener("touchend", function(e){
          var lb = document.getElementById("gcLightbox");
          if (!lb || !lb.classList.contains("open")) return;
          var dx = e.changedTouches[0].clientX - touchStartX;
          if (Math.abs(dx) > 50) lbNav(dx < 0 ? 1 : -1);
        }, {passive: true});
      })();
      window.addEventListener("resize", function(){ if(_swiperInstance) _swiperInstance.update(); });
      /* ── Community Stats — members only from getUsers ── */
      function _animateMemberCount(el, target, duration) {
        if (!el) return;
        var frames = Math.max(60, Math.round(duration / 16));
        var f = 0;
        function tick() {
          f++;
          var ease = 1 - Math.pow(1 - f / frames, 3);
          el.textContent = Math.round(ease * target).toLocaleString("en-IN");
          if (f < frames) requestAnimationFrame(tick);
          else el.textContent = target.toLocaleString("en-IN");
        }
        requestAnimationFrame(tick);
      }
      var _statsAnimated = false;
      function loadCommunityStats() {
        if (typeof getData !== "function") return;
        // getPublicStats is public — no session needed. Returns memberCount directly.
        getData("getPublicStats").then(function(res) {
          if (!res || res.status === "error") return;
          _animateMemberCount(document.getElementById("csMembers"), Number(res.memberCount || 0), 1800);
        }).catch(function() {});
      }

      /* ══ Household Finances JS — DISABLED
         To re-enable: remove the opening slash-star and closing star-slash
         around this entire block (match with CSS and HTML blocks above).

var _trLoaded = false;
 
 function loadTransparency() {
   if (_trLoaded) return; // load once per page visit
   if (typeof getData !== "function") return;
  
   getData("getPublicStats").then(function(res) {
     if (!res || res.status === "error") return;
     _trLoaded = true;
     _renderTransparency(res);
   }).catch(function() {});
 }
  
 function _renderTransparency(res) {
   var f = function(n) { return "₹" + Number(n||0).toLocaleString("en-IN"); };
   var curYear = new Date().getFullYear();
  
   // ── Updated timestamp
   var upd = document.getElementById("tr_updated");
   if (upd && res.updatedAt) upd.textContent = "Last updated: " + res.updatedAt;
  
   // ── Summary cards
   var cards = document.getElementById("tr_cards");
   var balance = Number(res.balance || 0);
   var balColor = balance >= 0 ? "green" : "red";
   if (cards) {
     cards.innerHTML =
       '<div class="tr-card green">'  +
         '<div class="tr-card-label">This Year Collection</div>' +
         '<div class="tr-card-value">' + f(res.thisYearCollection) + '</div>' +
       '</div>' +
       '<div class="tr-card red">'    +
         '<div class="tr-card-label">This Year Expenses</div>' +
         '<div class="tr-card-value">' + f(res.thisYearExpense) + '</div>' +
       '</div>' +
       '<div class="tr-card ' + balColor + '">' +
         '<div class="tr-card-label">Current Balance</div>' +
         '<div class="tr-card-value">' + f(balance) + '</div>' +
       '</div>' +
       '<div class="tr-card blue">' +
         '<div class="tr-card-label">Active Members</div>' +
         '<div class="tr-card-value">' + Number(res.memberCount||0) + '</div>' +
       '</div>';
   }
  
   // ── Year table
   var rows = res.yearRows || [];
   if (rows.length > 0) {
     var tbody = document.getElementById("tr_tbody");
     var tfoot = document.getElementById("tr_tfoot");
     var sumC = 0, sumE = 0;
  
     if (tbody) {
       tbody.innerHTML = rows.map(function(r) {
         sumC += Number(r.totalCollection||0);
         sumE += Number(r.totalExpense||0);
         var isCur = Number(r.year) === curYear;
         var cls   = isCur ? " class=\"tr-current-year\"" : "";
         var closing = Number(r.closingBalance||0);
         return "<tr" + cls + ">" +
           "<td>" + r.year + (isCur ? " 🟡" : "") + "</td>" +
           "<td>" + f(r.openingBalance) + "</td>" +
           "<td style=\"color:#27ae60;\">" + f(r.totalCollection) + "</td>" +
           "<td style=\"color:#e74c3c;\">" + f(r.totalExpense) + "</td>" +
           "<td style=\"color:" + (closing >= 0 ? "#27ae60" : "#e74c3c") + ";\">" + f(closing) + "</td>" +
         "</tr>";
       }).join("");
     }
  
     if (tfoot) {
       tfoot.innerHTML = "<tr>" +
         "<td>All Years</td>" +
         "<td>—</td>" +
         "<td style=\"color:#27ae60;\">" + f(sumC) + "</td>" +
         "<td style=\"color:#e74c3c;\">" + f(sumE) + "</td>" +
         "<td style=\"color:#334155;\">" + f(balance) + "</td>" +
       "</tr>";
     }
  
     var wrap = document.getElementById("tr_table_wrap");
     if (wrap) wrap.style.display = "block";
   }
  
   // ── Goals
   var goals = res.goals || [];
   var activeGoals = goals.filter(function(g) {
     return String(g.Status||"").toLowerCase() !== "disabled" && Number(g.Target||0) > 0;
   });
   if (activeGoals.length > 0) {
     var list = document.getElementById("tr_goals_list");
     if (list) {
       list.innerHTML = activeGoals.map(function(g) {
         var pct = Math.min(100, Math.round(Number(g.Current||0) / Number(g.Target) * 100));
         return '<div class="tr-goal-item">' +
           '<div class="tr-goal-top">' +
             '<span class="tr-goal-name">' + _trEsc(g.Name||"Goal") + '</span>' +
             '<span class="tr-goal-pct">' + pct + '%</span>' +
           '</div>' +
           '<div class="tr-goal-bar-bg">' +
             '<div class="tr-goal-bar-fill" style="width:' + pct + '%"></div>' +
           '</div>' +
           '<div class="tr-goal-amounts">' +
             '<span>₹' + Number(g.Current||0).toLocaleString("en-IN") + ' raised</span>' +
             '<span>Target: ₹' + Number(g.Target).toLocaleString("en-IN") + '</span>' +
           '</div>' +
         '</div>';
       }).join("");
     }
     var goalsEl = document.getElementById("tr_goals");
     if (goalsEl) goalsEl.style.display = "block";
   }
 }
  
 function _trEsc(s) {
   return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
 }
  
 // Lazy-load on scroll — fires once when section enters viewport
 var _trObserved = false;
 function _watchTransparency() {
   if (_trObserved) return;
   var el = document.getElementById("financesSection");
   if (!el) return;
   if ("IntersectionObserver" in window) {
     var obs = new IntersectionObserver(function(entries) {
       if (entries[0].isIntersecting) { loadTransparency(); obs.disconnect(); }
     }, { threshold: 0.1 });
     obs.observe(el);
     _trObserved = true;
   } else {
     // Fallback for older browsers
     loadTransparency();
     _trObserved = true;
   }
 }
 document.addEventListener("DOMContentLoaded", _watchTransparency);
 ══ END Household Finances JS ══ */

      function _checkStatsVisible() {
        if (_statsAnimated) return;
        var el = document.getElementById("communityStats");
        if (!el) return;
        if (el.getBoundingClientRect().top < window.innerHeight - 60) {
          _statsAnimated = true;
          loadCommunityStats();
        }
      }
      window.addEventListener("scroll", _checkStatsVisible, { passive: true });
      document.addEventListener("DOMContentLoaded", function(){ setTimeout(_checkStatsVisible, 800); });

      /* ── Announcement Banner ── */
      var _annDismissedId = null;

      function _syncSiteTopHeight() {
        var siteTop = document.getElementById("siteTop");
        if (!siteTop) return;
        var h = siteTop.offsetHeight;
        document.body.style.paddingTop = h + "px";
        var navMenu = document.getElementById("navMenu");
        if (navMenu) navMenu.style.top = h + "px";
      }

      function dismissBanner() {
        var banner = document.getElementById("announcementBanner");
        banner.style.transition = "max-height 0.35s ease, opacity 0.3s ease";
        banner.style.opacity = "0";
        banner.style.maxHeight = "0";
        banner.style.overflow = "hidden";
        setTimeout(function(){ banner.classList.remove("open"); banner.style = ""; _syncSiteTopHeight(); }, 360);
        try { sessionStorage.setItem("ann_dismissed", _annDismissedId || "1"); } catch(e){}
      }
      function loadAnnouncement() {
        if (typeof getData !== "function") return;
        getData("getAnnouncement").then(function(data) {
          if (!data || !data.Message) return;
          var dismissed = "";
          try { dismissed = sessionStorage.getItem("ann_dismissed") || ""; } catch(e){}
          var annId = String(data.Id || data.Message).substring(0, 40);
          if (dismissed === annId) return;
          _annDismissedId = annId;
          document.getElementById("annText").textContent = data.Message;
          var badge = document.getElementById("annBadge");
          if (data.Badge) { badge.textContent = data.Badge; badge.style.display = "inline-block"; }
          if (data.Icon) document.querySelector(".ann-icon").textContent = data.Icon;
          document.getElementById("announcementBanner").classList.add("open");
          _syncSiteTopHeight();
        }).catch(function(){});
      }
      document.addEventListener("DOMContentLoaded", function(){ setTimeout(loadAnnouncement, 600); });
      document.addEventListener("DOMContentLoaded", function(){ _syncSiteTopHeight(); });
      window.addEventListener("resize", _syncSiteTopHeight);
      document.addEventListener("DOMContentLoaded", loadGallery);

      /* Hamburger nav menu toggle */
      function toggleNavMenu() {
        const menu = document.getElementById("navMenu");
        const icon = document.getElementById("hamburgerIcon");
        const isOpen = menu.classList.toggle("open");
        icon.className = isOpen ? "fa-solid fa-xmark" : "fa-solid fa-bars";
        // Lock body scroll when menu is open (mobile)
        document.body.classList.toggle("nav-open", isOpen);
      }
      function closeNavMenu() {
        const menu = document.getElementById("navMenu");
        const icon = document.getElementById("hamburgerIcon");
        menu.classList.remove("open");
        icon.className = "fa-solid fa-bars";
        document.body.classList.remove("nav-open");
      }
      // Close menu when clicking outside
      document.addEventListener("click", function (e) {
        const menu = document.getElementById("navMenu");
        const btn = document.getElementById("hamburgerBtn");
        if (btn && !menu.contains(e.target) && !btn.contains(e.target)) {
          closeNavMenu();
        }
      });

      /* Scroll Reveal */
      function reveal() {
        var reveals = document.querySelectorAll(".reveal");
        for (var i = 0; i < reveals.length; i++) {
          var windowHeight = window.innerHeight;
          var elementTop = reveals[i].getBoundingClientRect().top;
          if (elementTop < windowHeight - 100)
            reveals[i].classList.add("active");
        }
      }
      window.addEventListener("scroll", reveal);
      reveal();

      /* ── Input validation helpers ── */
      function _fbSetError(id, msg) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.add('input-error');
        el.classList.remove('input-ok');
        // Show inline error message if sibling .field-error-msg exists
        var next = el.nextElementSibling;
        if (next && next.classList.contains('field-error-msg')) {
          next.textContent = msg;
          next.classList.add('show');
        }
      }
      function _fbClearError(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('input-error');
        el.classList.add('input-ok');
        var next = el.nextElementSibling;
        if (next && next.classList.contains('field-error-msg')) {
          next.classList.remove('show');
        }
      }
      function _fbClearAll() {
        ['fb_name','fb_mobile','fb_address','fb_message'].forEach(function(id) {
          var el = document.getElementById(id);
          if (!el) return;
          el.classList.remove('input-error','input-ok');
          var next = el.nextElementSibling;
          if (next && next.classList.contains('field-error-msg')) next.classList.remove('show');
        });
      }
      // Live clear error on input
      document.addEventListener('DOMContentLoaded', function() {
        ['fb_name','fb_mobile','fb_message'].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) el.addEventListener('input', function() {
            if (el.value.trim()) _fbClearError(id);
          });
        });
      });

      /* FIX #1 & #3: Feedback submit — with inline validation */
      function submitFeedback() {
        _fbClearAll();
        var name    = (document.getElementById("fb_name").value    || "").trim();
        var mobile  = (document.getElementById("fb_mobile").value  || "").trim();
        var address = (document.getElementById("fb_address").value || "").trim();
        var message = (document.getElementById("fb_message").value || "").trim();

        var valid = true;
        if (!name) {
          _fbSetError('fb_name', 'Please enter your full name.');
          valid = false;
        }
        if (!mobile) {
          _fbSetError('fb_mobile', 'Please enter your mobile number.');
          valid = false;
        } else if (!/^\d{10}$/.test(mobile.replace(/\s/g,''))) {
          _fbSetError('fb_mobile', 'Enter a valid 10-digit mobile number.');
          valid = false;
        }
        if (!message) {
          _fbSetError('fb_message', 'Please enter your message.');
          valid = false;
        }
        if (!valid) {
          // Scroll to first error
          var firstErr = document.querySelector('.feedback-form .input-error');
          if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }

        // Show loading state on button
        var btn = document.querySelector('.feedback-submit-btn');
        if (btn) btn.classList.add('loading');

        function _fbShowThanks() {
          // Mark fields as OK
          _fbClearError('fb_name'); _fbClearError('fb_mobile'); _fbClearError('fb_message');

          // Show thank you message
          const thanksEl = document.getElementById("feedbackThanks");
          thanksEl.style.display = "block";
          thanksEl.scrollIntoView({ behavior: "smooth", block: "center" });

          // Auto-hide after 6 seconds and clear form
          setTimeout(() => {
            thanksEl.style.opacity = "0";
            thanksEl.style.transition = "opacity 0.5s ease";
            setTimeout(() => {
              thanksEl.style.display = "none";
              thanksEl.style.opacity = "";
              thanksEl.style.transition = "";
              document.getElementById("fb_name").value = "";
              document.getElementById("fb_mobile").value = "";
              document.getElementById("fb_address").value = "";
              document.getElementById("fb_message").value = "";
              _fbClearAll();
            }, 500);
          }, 6000);
        }

        function _fbShowError(msg) {
          var box = document.getElementById("fbSubmitError");
          if (!box) {
            box = document.createElement("div");
            box.id = "fbSubmitError";
            box.style.cssText = "margin-top:14px;padding:12px 16px;border-radius:10px;" +
              "background:rgba(231,76,60,0.08);border:1.5px solid rgba(231,76,60,0.35);" +
              "color:#c0392b;font-size:0.85rem;line-height:1.5;text-align:center;";
            var formBox = document.getElementById("feedbackFormBox");
            if (formBox) formBox.appendChild(box);
          }
          box.textContent = msg || "Something went wrong sending your feedback. Please check your connection and try again.";
          box.style.display = "block";
        }

        // Send feedback via postData to backend (stored as audit/feedback log).
        // The thank-you state (and form clear) now only fires once the backend
        // actually confirms — previously it showed unconditionally even if the
        // request failed, silently swallowed via .catch(() => {}).
        if (typeof postData === "function") {
          postData({
            action: "submitFeedback",
            Name: name,
            Mobile: mobile,
            Address: address,
            Message: message,
            Status: "Pending",
            SubmittedAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
          }).then(function(res) {
            if (btn) btn.classList.remove('loading');
            if (res && res.status === "error") {
              _fbShowError(res.message || undefined);
            } else {
              _fbShowThanks();
            }
          }).catch(function() {
            if (btn) btn.classList.remove('loading');
            _fbShowError();
          });
        } else {
          // No backend function available on this page — can't confirm delivery,
          // so don't claim success.
          if (btn) btn.classList.remove('loading');
          _fbShowError("Feedback couldn't be sent right now. Please try again shortly.");
        }
      }

/* ── Payment Modal ── */
      /* ── Payment Modal ── */
      /* ── Payment details cache — fetched once per page load, public for all visitors ── */
      var _payDetails = null;

      function _initPayModalFields() {
        // Already cached this page load — fill instantly
        if (_payDetails) { _applyPayDetails(_payDetails); return; }
        // Fetch from server — getPublicPaymentDetails requires no session
        if (typeof getData === "function") {
          getData("getPublicPaymentDetails").then(function(res) {
            if (res && res.status === "ok") {
              _payDetails = res;
              _applyPayDetails(res);
            }
          }).catch(function() {});
        }
      }

      function _applyPayDetails(p) {
        var set = function(id, val) {
          var el = document.getElementById(id);
          if (el) el.textContent = val || "—";
        };
        // accountName from server = the account holder name
        // fallback: APP.accountHolderName (from constants.js)
        var holderName = p.accountName
          || ((typeof APP !== 'undefined' && APP.accountHolderName) ? APP.accountHolderName : '');
        set("payAccName",  holderName);
        set("payAccNo",    p.accountNo);
        set("payIfsc",     p.ifscCode);
        set("payBankName", p.bankName);
        set("payBranch",   p.bankBranch);
        set("payAccType",  p.accountType);
        set("payUpiId",    p.upiId);
      }

      /* Data is fetched lazily on first openPayModal() click — no need to pre-fetch
         on every page load since most visitors never open the donate modal.
         _initPayModalFields() caches the result in _payDetails so the second
         open is instant. The DOMContentLoaded pre-fetch was an unnecessary backend
         call on every index page visit. */

      function _generatePayQR() {
        var upiId = (_payDetails && _payDetails.upiId)
          ? _payDetails.upiId
          : ((typeof APP !== "undefined" && APP.upiId) ? APP.upiId : "");
        var name  = (typeof APP !== "undefined" && APP.name) ? APP.name : 'Mandir';
        var box   = document.getElementById("payQrBox");
        if (!box) return;
        box.innerHTML = "";

        // If UPI is blank or explicitly "Not Available", show a friendly message
        var isUpiMissing = !upiId || upiId.trim() === "" || upiId.trim().toLowerCase() === "not available";
        if (isUpiMissing) {
          box.innerHTML =
            "<div class=\"pay-qr-placeholder\" style=\"gap:10px;\">" +
              "<i class=\"fa-solid fa-qrcode\" style=\"font-size:2rem;opacity:0.4;\"></i>" +
              "<span style=\"font-size:0.78rem;color:#888;line-height:1.4;\">QR not available.<br>Please use bank transfer.</span>" +
            "</div>";
          // Also update the UPI ID display
          var upiEl = document.getElementById("payUpiId");
          if (upiEl) upiEl.textContent = "Not available";
          var copyBtn = document.getElementById("copyUpiBtn");
          if (copyBtn) copyBtn.style.display = "none";
          return;
        }

        var upiStr = "upi://pay?pa=" + encodeURIComponent(upiId) + "&pn=" + encodeURIComponent(name) + "&cu=INR";
        if (window.QRCode) {
          try {
            new window.QRCode(box, {
              text: upiStr,
              width: 148, height: 148,
              colorDark: "#1a0800", colorLight: "#ffffff",
              correctLevel: window.QRCode.CorrectLevel.M
            });
          } catch(e) {
            box.innerHTML = "<div class=\"pay-qr-placeholder\"><i class=\"fa-solid fa-qrcode\"></i><span>QR Ready<br>" + upiId + "</span></div>";
          }
        } else {
          var s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
          s.onload = function() { _generatePayQR(); };
          s.onerror = function() {
            box.innerHTML = "<div class=\"pay-qr-placeholder\"><i class=\"fa-solid fa-qrcode\"></i><span>" + upiId + "</span></div>";
          };
          document.head.appendChild(s);
        }
      }

      function openPayModal() {
        var m = document.getElementById("payModal");
        m.classList.add("open");
        document.body.style.overflow = "hidden";
        m.scrollTop = 0;
        // Fields pre-fetched on DOMContentLoaded — should already be filled.
        // Call again in case the first fetch hadn't completed yet.
        _initPayModalFields();
        // QR uses the cached UPI ID. Small delay ensures _payDetails is populated first.
        setTimeout(_generatePayQR, 100);
        spawnPayParticles();
      }
      function closePayModal() {
        var m = document.getElementById('payModal');
        m.classList.remove('open');
        document.body.style.overflow = '';
        stopPayParticles();
      }
      /* Close on Escape key */
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closePayModal();
      });

      /* ── Floating divine particles ── */
      var _payParticleInterval = null;
      var _payParticles = ['🏠','✨','🔧','💰','⭐','🌟','👍'];
      function spawnPayParticles() {
        _payParticleInterval = setInterval(function() {
          var modal = document.getElementById('payModal');
          if (!modal || !modal.classList.contains('open')) return;
          var el = document.createElement('div');
          el.className = 'pay-particle';
          el.textContent = _payParticles[Math.floor(Math.random() * _payParticles.length)];
          var dur = 4 + Math.random() * 5;
          el.style.cssText = 'left:' + (5 + Math.random()*88) + '%;bottom:0;animation-duration:' + dur + 's;animation-delay:' + (Math.random()*1.5) + 's;font-size:' + (0.85 + Math.random()*0.7) + 'rem;opacity:0;';
          modal.appendChild(el);
          setTimeout(function(){ el.remove(); }, (dur + 2) * 1000);
        }, 900);
      }
      function stopPayParticles() {
        clearInterval(_payParticleInterval);
        var old = document.querySelectorAll('.pay-particle');
        old.forEach(function(el){ el.remove(); });
      }

      /* ── Copy bank details ── */
      function copyBankDetails() {
        var accNo   = document.getElementById('payAccNo').innerText;
        var ifsc    = document.getElementById('payIfsc').innerText;
        var bank    = document.getElementById('payBankName').innerText;
        var branch  = document.getElementById('payBranch').innerText;
        var accName = document.getElementById('payAccName').innerText;
        var name    = (typeof APP !== 'undefined' && APP.name) ? APP.name : 'Mandir';
        // Account holder name: use fetched accountName, or APP.accountHolderName, or fall back to APP.name
        var holderName = (accName && accName !== '—') ? accName
                       : ((typeof APP !== 'undefined' && APP.accountHolderName) ? APP.accountHolderName : name);
        var text    = name + '\nAccount Holder: ' + holderName + '\nAccount No: ' + accNo + '\nIFSC: ' + ifsc + '\nBank: ' + bank + ', ' + branch;
        navigator.clipboard.writeText(text).then(function() {
          var btn = document.getElementById('copyBankBtn');
          btn.classList.add('copied');
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
          setTimeout(function() {
            btn.classList.remove('copied');
            btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy Details';
          }, 2500);
        }).catch(function() {});
      }
      /* ── Copy UPI ID ── */
      function copyUpiId() {
        var upi = document.getElementById('payUpiId').innerText;
        navigator.clipboard.writeText(upi).then(function() {
          var btn = document.getElementById('copyUpiBtn');
          btn.classList.add('copied');
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
          setTimeout(function() {
            btn.classList.remove('copied');
            btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy UPI ID';
          }, 2500);
        }).catch(function() {});
      }

/* ══ HOME TIPS TICKER ══
   Moved here from inline <script> in index.html.
   Runs on DOMContentLoaded — requires #chaupaiDisplay and #chaupaiSpacer in DOM. */
(function _initChaupai() {
  var chaupais = [
    'हर महीने की पहली तारीख को घर के खर्चों का हिसाब जरूर देखें।',
    'समय पर योगदान देने से घर की व्यवस्था सुचारु रहती है।'
  ];

  function init() {
    var container = document.getElementById('chaupaiDisplay');
    var spacer    = document.getElementById('chaupaiSpacer');
    if (!container || !spacer) return;

    var ci = 0;

    /* Spacer always = longest string → layout is permanently locked */
    spacer.textContent = chaupais.reduce(function(a, b) {
      return b.length > a.length ? b : a;
    }, '');

    /* Split string into Unicode-aware grapheme clusters (handles Hindi matras correctly) */
    function getChars(str) {
      if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        var seg = new Intl.Segmenter('hi', { granularity: 'grapheme' });
        return Array.from(seg.segment(str), function(s) { return s.segment; });
      }
      return Array.from(str); /* fallback */
    }

    /* Build one <span class="cp-char"><span>c</span></span> per grapheme */
    function buildCharEls(chars) {
      container.innerHTML = '';
      var els = [];
      chars.forEach(function(ch) {
        var wrap  = document.createElement('span');
        wrap.className = 'cp-char';
        var inner = document.createElement('span');
        inner.textContent = ch;
        wrap.appendChild(inner);
        container.appendChild(wrap);
        els.push(inner);
      });
      return els;
    }

    function showChaupai() {
      var chars = getChars(chaupais[ci]);
      var els   = buildCharEls(chars);
      var i = 0;

      /* Reveal one character at a time, left → right */
      function revealNext() {
        if (i < els.length) {
          els[i].classList.add('cp-in');
          i++;
          setTimeout(revealNext, 55); /* 55 ms per character */
        } else {
          /* Hold fully visible, then hide */
          setTimeout(function() { hideFrom(els.length - 1); }, 2600);
        }
      }

      /* Hide one character at a time, right → left */
      function hideFrom(j) {
        if (j >= 0) {
          els[j].classList.remove('cp-in');
          els[j].classList.add('cp-out');
          j--;
          setTimeout(function() { hideFrom(j); }, 40); /* 40 ms per character */
        } else {
          /* Next chaupai — spacer stays, no layout shift */
          ci = (ci + 1) % chaupais.length;
          setTimeout(showChaupai, 500);
        }
      }

      revealNext();
    }

    showChaupai();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init(); /* DOM already ready */
  }
}());