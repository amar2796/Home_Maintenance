/* ══════════════════════════════════════════════════════════════════
   WAVE TABS — draws the curved "which tab is active" indicator.

   Design goals:
   - Zero changes required to existing tab-switch functions
     (_hmMemberTab, switchTrackerTab, dash_switchTab, filterUsers).
     Those already do `el.classList.add/remove('active' | 'is-active')`
     — this file just watches for that and repaints.
   - Safe to include on every page: it only touches elements with the
     `.wave-bar` class, so it can't affect any unrelated UI.
   - Handles bars that start hidden (e.g. Tracker/Users tabs, which
     are inside a `.page` that isn't visible on first load) via
     ResizeObserver — the curve repaints itself the moment the bar
     actually gets laid out, instead of freezing at 0-width.
   ══════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var CURVE_W = 20;   // how far the curve's leg extends past the tab edge
  var TOP_Y = 14;      // plateau height from the top of the bar. With the
                        // bar now a fixed 54/50px tall and .wave-tab using
                        // EQUAL top/bottom padding (see admin-wave-tabs.css
                        // — this used to differ between active/inactive,
                        // which is what caused the plateau line to cut
                        // through the label), this leaves a verified ~8px
                        // gap between the plateau and the label's top edge
                        // in both states, so the curve never crosses text.
  var ANIM_MS = 340;   // was 260 — a touch slower reads as smoother/more
                        // deliberate rather than snappy-abrupt
  var gradCounter = 0;

  // Gentle "ease-out-back" — the curve eases in fast then settles with a
  // very slight overshoot before coming to rest, like a soft landing
  // rather than a hard stop. Subtler than the classic overshoot formula
  // (small c1) so it reads as smooth/polished, not bouncy/playful.
  function easeOutSoftBack(t) {
    var c1 = 0.7, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function legFor(x1, x2, W) {
    // Symmetric clamp: if either side is tight on room, shrink BOTH legs
    // equally so the curve stays a symmetric dome instead of turning
    // lopsided (a full curve on one side, an abrupt near-vertical edge
    // on the other) for tabs sitting at the very start/end of the bar.
    return Math.max(4, Math.min(CURVE_W, x1, W - x2));
  }

  function pathD(x1, x2, W, H) {
    var baseline = H - 1;
    var leg = legFor(x1, x2, W);
    return "M0," + baseline +
      " L" + (x1 - leg) + "," + baseline +
      " C" + (x1 - leg * 0.55) + "," + baseline + " " + (x1 - leg * 0.55) + "," + TOP_Y + " " + x1 + "," + TOP_Y +
      " L" + x2 + "," + TOP_Y +
      " C" + (x2 + leg * 0.55) + "," + TOP_Y + " " + (x2 + leg * 0.55) + "," + baseline + " " + (x2 + leg) + "," + baseline +
      " L" + W + "," + baseline;
  }

  function fillD(x1, x2, W, H) {
    var baseline = H - 1;
    var leg = legFor(x1, x2, W);
    return "M" + (x1 - leg) + "," + baseline +
      " C" + (x1 - leg * 0.55) + "," + baseline + " " + (x1 - leg * 0.55) + "," + TOP_Y + " " + x1 + "," + TOP_Y +
      " L" + x2 + "," + TOP_Y +
      " C" + (x2 + leg * 0.55) + "," + TOP_Y + " " + (x2 + leg * 0.55) + "," + baseline + " " + (x2 + leg) + "," + baseline +
      " Z";
  }

  function ensureSvg(bar) {
    var svg = bar.querySelector(":scope > svg.wave-bar-svg");
    if (svg) return svg;
    svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "wave-bar-svg");

    // Subtle top-to-bottom gradient on the fill (instead of a flat tint)
    // for a softer, less "flat sticker" look — more glow near the
    // plateau, fading out toward the baseline.
    var gradId = "wave-grad-" + (++gradCounter);
    var defs = document.createElementNS(SVG_NS, "defs");
    var grad = document.createElementNS(SVG_NS, "linearGradient");
    grad.setAttribute("id", gradId);
    grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
    var stop1 = document.createElementNS(SVG_NS, "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("class", "wave-grad-stop-top");
    var stop2 = document.createElementNS(SVG_NS, "stop");
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("class", "wave-grad-stop-bottom");
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);

    var fill = document.createElementNS(SVG_NS, "path");
    fill.setAttribute("class", "wave-fill");
    fill.setAttribute("fill", "url(#" + gradId + ")");
    var stroke = document.createElementNS(SVG_NS, "path");
    stroke.setAttribute("class", "wave-stroke");
    stroke.setAttribute("fill", "none");
    stroke.setAttribute("stroke-width", "2.5");
    stroke.setAttribute("stroke-linecap", "round");
    stroke.setAttribute("stroke-linejoin", "round");
    svg.appendChild(defs);
    svg.appendChild(fill);
    svg.appendChild(stroke);
    bar.insertBefore(svg, bar.firstChild);
    return svg;
  }

  function activeClassFor(bar) {
    return bar.getAttribute("data-wave-active-class") || null;
  }

  function findActive(bar) {
    var cls = activeClassFor(bar);
    if (cls) {
      var el = bar.querySelector(".wave-tab." + cls);
      if (el) return el;
    }
    return bar.querySelector(".wave-tab.active") ||
           bar.querySelector(".wave-tab.is-active") ||
           bar.querySelector(".wave-tab");
  }

  function measure(bar, tab) {
    var r = bar.getBoundingClientRect();
    var tr = tab.getBoundingClientRect();
    return { x1: tr.left - r.left, x2: tr.right - r.left, W: r.width, H: r.height };
  }

  function syncColors(bar, active) {
    var tabs = bar.querySelectorAll(".wave-tab");
    tabs.forEach(function (t) {
      var isActive = t === active;
      var color = t.getAttribute("data-color") || "#0f766e";
      // setProperty(..., "important") rather than t.style.color = ... —
      // several legacy stylesheets still carry `!important` rules for the
      // old pill design on these same elements (kept only so existing
      // querySelectorAll(".status-tab") etc. still work, e.g.
      // `body.dark-mode .status-tab.active { color:#fff !important }`).
      // A plain inline style loses to any external !important rule;
      // this wins regardless of what else is defined for these classes.
      t.style.setProperty("color", isActive ? color : "#94a3b8", "important");
      var badge = t.querySelector(".tab-ct, .ct");
      if (badge) {
        badge.style.setProperty("background", isActive ? color : "#e2e8f0", "important");
        badge.style.setProperty("color", isActive ? "#fff" : "#64748b", "important");
      }
    });
  }

  function paint(bar, geo, color) {
    var svg = ensureSvg(bar);
    var stroke = svg.querySelector(".wave-stroke");
    var fill = svg.querySelector(".wave-fill");
    var stopTop = svg.querySelector(".wave-grad-stop-top");
    var stopBottom = svg.querySelector(".wave-grad-stop-bottom");
    if (!geo.W || !geo.H) return; // bar not laid out yet (hidden page) — wait for ResizeObserver
    stroke.setAttribute("d", pathD(geo.x1, geo.x2, geo.W, geo.H));
    fill.setAttribute("d", fillD(geo.x1, geo.x2, geo.W, geo.H));
    // Set color via the `style` (CSS) property rather than a plain SVG
    // attribute — CSS transitions (see .wave-stroke/.wave-fill/.wave-grad-*
    // in admin-wave-tabs.css) only animate style-driven changes, so this is
    // what makes the color crossfade smoothly between tabs instead of
    // snapping instantly when e.g. Paid (green) → Pending (red).
    stroke.style.stroke = color;
    stopTop.style.stopColor = color;
    stopTop.style.stopOpacity = "0.24";
    stopBottom.style.stopColor = color;
    stopBottom.style.stopOpacity = "0.04";
  }

  var stateByBar = new WeakMap(); // bar -> { current: geo, raf: id }

  function animateTo(bar, tab) {
    var color = tab.getAttribute("data-color") || "#0f766e";
    var state = stateByBar.get(bar) || {};
    if (state.raf) cancelAnimationFrame(state.raf);
    var from = state.current || measure(bar, tab);
    var to = measure(bar, tab);
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / ANIM_MS);
      var e = easeOutSoftBack(p);
      paint(bar, {
        x1: from.x1 + (to.x1 - from.x1) * e,
        x2: from.x2 + (to.x2 - from.x2) * e,
        W: to.W, H: to.H
      }, color);
      if (p < 1) {
        state.raf = requestAnimationFrame(step);
        stateByBar.set(bar, state);
      } else {
        state.current = to;
        state.raf = null;
        stateByBar.set(bar, state);
      }
    }
    state.raf = requestAnimationFrame(step);
    stateByBar.set(bar, state);
  }

  function updateScrollable(bar) {
    var overflowing = bar.scrollWidth > bar.clientWidth + 1;
    bar.classList.toggle("wave-scrollable", overflowing);
  }

  function refresh(barOrId, animate) {
    var bar = typeof barOrId === "string" ? document.getElementById(barOrId) : barOrId;
    if (!bar) return;
    var active = findActive(bar);
    if (!active) return;
    syncColors(bar, active);
    updateScrollable(bar);
    if (animate) {
      animateTo(bar, active);
    } else {
      var geo = measure(bar, active);
      stateByBar.set(bar, { current: geo, raf: null });
      paint(bar, geo, active.getAttribute("data-color") || "#0f766e");
    }
  }

  function initBar(bar) {
    if (bar.__waveInit) return;
    bar.__waveInit = true;
    ensureSvg(bar);

    // Repaint whenever any .wave-tab's class list changes (this is how
    // every existing switch function already signals "this is now active" —
    // no changes needed to _hmMemberTab / switchTrackerTab / dash_switchTab /
    // filterUsers).
    var mo = new MutationObserver(function () { refresh(bar, true); });
    bar.querySelectorAll(".wave-tab").forEach(function (t) {
      mo.observe(t, { attributes: true, attributeFilter: ["class"] });
    });

    // Repaint whenever the bar's own size changes — covers the case where
    // the bar lives inside a `.page` / `display:none` panel that isn't
    // visible yet on first load (Tracker, Users, Dashboard tabs), plus
    // sidebar collapse / window resize.
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(function () { refresh(bar, false); });
      ro.observe(bar);
    } else {
      global.addEventListener("resize", function () { refresh(bar, false); });
    }

    refresh(bar, false);
  }

  function initAll() {
    document.querySelectorAll(".wave-bar").forEach(initBar);
  }

  global.WaveTabs = { initAll: initAll, initBar: initBar, refresh: refresh };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})(window);
