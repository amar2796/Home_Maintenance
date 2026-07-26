/* ══════════════════════════════════════════════════════════════════
   HOME PAGE FEATURES — home-features.js
   ──────────────────────────────────────────────────────────────────
   Frontend-only additions for index.html:
     • Dark mode toggle (preference saved in localStorage)
     • Quick-Pay floating action button (reuses existing openPayModal())
     • WhatsApp share button for the announcement banner
     • FAQ accordion
   This file makes NO calls to the Apps Script backend and does not
   touch any existing contribution/expense/gallery/feedback logic.
   Safe to remove this file (and its <link>/<script> tags + the new
   HTML blocks marked "HOME FEATURES") without affecting anything else.
   ══════════════════════════════════════════════════════════════════ */

   (function () {
    var DARK_KEY = "hf_dark_mode";
  
    /* ── Dark mode ─────────────────────────────────────────────────── */
  
    function hfApplyDarkPref() {
      var on = localStorage.getItem(DARK_KEY) === "1";
      document.body.classList.toggle("dark-mode", on);
      var btn = document.getElementById("hfDarkToggle");
      if (btn) {
        btn.innerHTML = on
          ? '<i class="fa-solid fa-sun"></i>'
          : '<i class="fa-solid fa-moon"></i>';
        btn.setAttribute("aria-label", on ? "Switch to light mode" : "Switch to dark mode");
      }
    }
  
    function hfToggleDarkMode() {
      var on = document.body.classList.toggle("dark-mode");
      try { localStorage.setItem(DARK_KEY, on ? "1" : "0"); } catch (e) {}
      hfApplyDarkPref();
      hfPlayHeroSweep();
    }
    window.hfToggleDarkMode = hfToggleDarkMode;
  
    /* ── Hero reflection sweep ────────────────────────────────────────
       Plays a soft light sweep across the hero section each time the
       dark-mode toggle fires, so the hero visibly "reacts" too instead
       of silently staying the same dark teal it always was. The sweep
       element is created once and reused; see .hero-mode-sweep in
       home-features.css. */
    function hfPlayHeroSweep() {
      var hero = document.getElementById("hero");
      if (!hero) return;
      var sweep = hero.querySelector(".hero-mode-sweep");
      if (!sweep) {
        sweep = document.createElement("div");
        sweep.className = "hero-mode-sweep";
        hero.appendChild(sweep);
      }
      sweep.classList.remove("play");
      void sweep.offsetWidth; // force reflow so the animation restarts on rapid re-toggles
      sweep.classList.add("play");
    }
  
    /* ── Quick-Pay floating action button ─────────────────────────── */
  
    function hfInitPayFab() {
      var fab = document.getElementById("hfPayFab");
      if (!fab) return;
      var hero = document.getElementById("hero");
      function onScroll() {
        var showAfter = hero ? hero.offsetTop + hero.offsetHeight * 0.5 : 300;
        fab.classList.toggle("hf-visible", window.scrollY > showAfter);
      }
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
  
    /* ── WhatsApp share for the announcement banner ───────────────── */
  
    function hfShareAnnouncement() {
      var textEl = document.getElementById("annText");
      var msg = (textEl && textEl.textContent.trim())
        ? textEl.textContent.trim()
        : "Check out the latest update from our household portal.";
      var url = window.location.href;
      var waUrl = "https://wa.me/?text=" + encodeURIComponent(msg + "\n" + url);
      window.open(waUrl, "_blank", "noopener");
    }
    window.hfShareAnnouncement = hfShareAnnouncement;
  
    /* ── FAQ accordion ─────────────────────────────────────────────── */
  
    function hfToggleFaq(btn) {
      var item = btn.closest(".hf-faq-item");
      if (!item) return;
      var wasOpen = item.classList.contains("open");
      item.parentElement.querySelectorAll(".hf-faq-item.open").forEach(function (el) {
        if (el !== item) el.classList.remove("open");
      });
      item.classList.toggle("open", !wasOpen);
    }
    window.hfToggleFaq = hfToggleFaq;
  
    /* ── Init ─────────────────────────────────────────────────────── */
  
    document.addEventListener("DOMContentLoaded", function () {
      hfApplyDarkPref();
      hfInitPayFab();
    });
  })();