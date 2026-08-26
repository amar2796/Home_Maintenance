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
    // [FIX] This used to measure every tab against bar.getBoundingClientRect()
    // — the bar's OUTER frame, which stays fixed on screen even while its
    // contents scroll (overflow-x:auto on .wave-bar). But the curve is
    // drawn inside .wave-bar-svg, which is a normal child of that same
    // scrolling bar — confirmed directly: scrolling the bar by 194px moved
    // the SVG's own on-screen position by exactly -194px too. So the SVG
    // does NOT stay pinned to the bar's outer frame; it scrolls right along
    // with the tabs. Measuring tabs against the bar's static frame instead
    // of the SVG's own (also-scrolling) frame meant every path coordinate
    // was off by the current scroll amount whenever the bar wasn't at
    // scrollLeft 0 — invisible before because nothing ever auto-scrolled
    // the bar during a switch, but immediately visible once
    // scrollActiveIntoView (above) started doing exactly that: the curve
    // would render at the pre-scroll position while the tabs themselves
    // had already moved, landing the curve on the wrong tab (Calendar
    // instead of Predict, in the reported case). Using the SVG's own rect
    // as the reference point is scroll-position-invariant: both the SVG
    // and every tab move by the same amount when the bar scrolls, so their
    // difference stays correct at any scroll position.
    var svg = ensureSvg(bar);
    var r = svg.getBoundingClientRect();
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
      // [FIX] easeOutSoftBack intentionally overshoots slightly past 1.0
      // for the "soft landing" feel (see its own comment above). For a
      // tab near the middle of the bar that overshoot has room on both
      // sides and is invisible. For the FIRST or LAST tab — especially
      // after a long jump, e.g. Tracker's Overview→Predict — it pushes
      // the interpolated x1 below 0 or x2 past the bar's real width W.
      // legFor()'s clamp (Math.max(4, ..., W - x2)) then sees a negative
      // "room" value and snaps the curve's corner to its 4px floor for
      // that instant, producing a visible glitch right as the animation
      // settles — confirmed by replaying the real easing math: on
      // Tracker's 6-tab bar, jumping to the last tab overshoots x2 by
      // ~5px past W. Clamping the interpolated position (not the easing
      // curve itself) keeps the intended bounce feel everywhere except
      // the last ~5px at each edge, where it now holds flush against
      // the boundary instead of snapping the corner radius.
      var ix1 = Math.max(0, from.x1 + (to.x1 - from.x1) * e);
      var ix2 = Math.min(to.W, from.x2 + (to.x2 - from.x2) * e);
      paint(bar, { x1: ix1, x2: ix2, W: to.W, H: to.H }, color);
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

  var FADE_PX = 14;

  function updateScrollable(bar) {
    var overflowing = bar.scrollWidth > bar.clientWidth + 1;
    bar.classList.toggle("wave-scrollable", overflowing);
    // [FIX — root cause of the "curve lands on the wrong tab after
    // scrolling" bug] .wave-bar-svg is CSS-sized to width:100%, which
    // resolves to the bar's VISIBLE width (clientWidth) — but the SVG is
    // a normal scrolling child of .wave-bar (confirmed directly: scrolling
    // the bar by 194px moved the SVG's own on-screen position by exactly
    // -194px too, i.e. it's pinned to a fixed spot in the CONTENT, not to
    // the viewport). A 350px-wide SVG pinned at content-position 0 can only
    // ever draw a curve for tabs that live in that first 0-350px slice of
    // content — any tab further along (like "Predict", sitting out past
    // 450px of content) falls completely outside the SVG's own box, so no
    // correct curve can be drawn there at all no matter how the coordinates
    // are computed. Sizing the SVG to the FULL scrollable width instead of
    // just the visible width means it always spans every tab regardless of
    // scroll position, and — since it then scrolls in lockstep with the
    // tabs it overlays — a tab's offset from the SVG's own edge stays
    // correct at any scroll position. Only touches bars that actually
    // overflow; bars that already fit (Home's 3 tabs) are untouched, same
    // scope as wave-scrollable above.
    var svg = ensureSvg(bar);
    svg.style.width = overflowing ? bar.scrollWidth + "px" : "";
    if (!overflowing) return;
    updateFadeEdges(bar);
  }

  function updateFadeEdges(bar) {
    // Only fade a side if there's actually more content to scroll to on
    // that side — otherwise the first/last tab gets needlessly faded
    // even though it's already fully visible and there's nowhere
    // further to scroll (this is what was washing out "Overview" on the
    // Tracker bar even at rest, scrolled all the way to the start).
    var atStart = bar.scrollLeft <= 1;
    var atEnd = bar.scrollLeft >= bar.scrollWidth - bar.clientWidth - 1;
    bar.style.setProperty("--fade-l", atStart ? "0px" : FADE_PX + "px");
    bar.style.setProperty("--fade-r", atEnd ? "0px" : FADE_PX + "px");
  }

  function scrollActiveIntoView(bar, tab) {
    // [FIX] The bug you're seeing: on mobile the tab bar overflows (6
    // Tracker tabs don't fit in ~350px), so tapping an off-screen tab
    // like "Predict" activates it correctly, but nothing ever scrolls
    // the bar so you can see it — confirmed the bar's scrollLeft simply
    // stays at 0 before and after the tap. The curve then animates to
    // Predict's real position, which is off past the visible edge, so
    // every tab still on screen (Overview/Analytics/Email/Calendar)
    // shows no active indicator at all — looking exactly like the
    // switch got "stuck mid-transition" on whichever tab you can see.
    // This brings the newly active tab into view first — instantly,
    // not smoothly, since measure() runs right after this and needs
    // the tab's FINAL position up front rather than a still-moving
    // target from a separate smooth-scroll animation racing the
    // curve's own animation (that would just reintroduce the same
    // class of desync bug fixed above for the sidebar-collapse case).
    // The curve's existing 340ms animation still supplies all the
    // visible motion the user perceives. No-ops when the bar doesn't
    // overflow (desktop, or any bar where every tab already fits).
    if (bar.scrollWidth <= bar.clientWidth + 1) return;
    var barRect = bar.getBoundingClientRect();
    var tabRect = tab.getBoundingClientRect();
    var tabLeft = tabRect.left - barRect.left + bar.scrollLeft;
    var tabRight = tabLeft + tabRect.width;
    var visibleLeft = bar.scrollLeft;
    var visibleRight = bar.scrollLeft + bar.clientWidth;
    if (tabLeft < visibleLeft || tabRight > visibleRight) {
      var target = tabLeft - (bar.clientWidth - tabRect.width) / 2;
      target = Math.max(0, Math.min(target, bar.scrollWidth - bar.clientWidth));
      bar.scrollLeft = target;
    }
  }

  function refresh(barOrId, animate) {
    var bar = typeof barOrId === "string" ? document.getElementById(barOrId) : barOrId;
    if (!bar) return;
    var active = findActive(bar);
    if (!active) return;
    syncColors(bar, active);
    updateScrollable(bar);
    if (animate) {
      // Only for real tab-switch calls (see the function above) — not
      // on passive resize/sidebar-collapse refreshes, where suddenly
      // auto-scrolling an unrelated tab bar would itself be jarring.
      scrollActiveIntoView(bar, active);
      animateTo(bar, active);
    } else {
      // [FIX] This branch runs on every ResizeObserver firing — including
      // when the sidebar is collapsed/expanded, which changes every bar's
      // width. It used to overwrite stateByBar with a brand-new object
      // (`raf: null`) without ever reading the OLD state first, so if a
      // tab-switch animation was still mid-flight (its `requestAnimationFrame`
      // already scheduled) when the sidebar was toggled, that old animation
      // frame was never actually cancelled — just orphaned. It would still
      // fire on the next frame and repaint with its own stale interpolated
      // position, immediately overwriting the correct resize-driven paint
      // this branch just drew, producing a visible jump/flicker right after
      // collapsing the sidebar mid-animation. Reading the existing state and
      // cancelling its pending frame first closes that race.
      var existing = stateByBar.get(bar);
      if (existing && existing.raf) cancelAnimationFrame(existing.raf);
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

    // Keep the fade in sync as the user actually scrolls the bar (e.g.
    // scrolling Tracker's 6 tabs left/right) — passive for scroll
    // performance, and only touches the two CSS custom properties, not
    // a full repaint.
    bar.addEventListener("scroll", function () { updateFadeEdges(bar); }, { passive: true });

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