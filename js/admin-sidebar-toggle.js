/* ╔══════════════════════════════════════════════════════════╗
   ║  SIDEBAR COLLAPSE TOGGLE & MOBILE GLASS MENUBAR         ║
   ║  Desktop: Toggle sidebar width                          ║
   ║  Mobile: Glass menubar navigation                       ║
   ╚══════════════════════════════════════════════════════════╝ */

// ── SIDEBAR COLLAPSE FUNCTIONALITY (DESKTOP) ──
class SidebarToggle {
  constructor() {
    this.sidebar = document.querySelector('.sidebar');
    this.toggleBtn = document.getElementById('sidebarToggleBtn');
    this.isCollapsed = this.loadCollapseState();
    this.init();
  }

  init() {
    if (!this.toggleBtn) return;

    // Apply saved/default state on page load WITHOUT persisting it — see
    // applyInitialCollapseState(). Only an actual click or the keyboard
    // shortcut (collapseSidebar/expandSidebar below) should ever write to
    // localStorage; this just paints the correct starting visual.
    if (this.isCollapsed) {
      this.applyInitialCollapseState();
    }

    // Add click event listener
    this.toggleBtn.addEventListener('click', () => this.toggleSidebar());

    // Keyboard shortcut: "[" toggles the sidebar on desktop, same idea as
    // VS Code/Notion. Ignored while typing in an input/textarea/select or
    // any contenteditable so it never hijacks normal typing.
    // [CHANGED] Was window.innerWidth < 1024 — the collapse feature itself
    // now works from 769px up (see admin-sidebar-collapse.css), so this
    // guard needs to match or the shortcut would silently do nothing on
    // tablets even though the toggle button and CSS both work there.
    document.addEventListener('keydown', (e) => {
      if (e.key !== '[' || window.innerWidth < 769) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      this.toggleSidebar();
    });

    // Handle window resize to show/hide button based on breakpoint
    window.addEventListener('resize', () => this.handleResize());

    // Flyout label tooltip for collapsed items — see initFlyoutTooltip()
    this.initFlyoutTooltip();
  }

  // ── FLYOUT TOOLTIP (collapsed sidebar item labels) ──
  // A single reusable element positioned with getBoundingClientRect() on
  // hover, appended to <body> so `position: fixed` isn't clipped by the
  // sidebar's own overflow-x:hidden. Sits to the right of the icon,
  // vertically centered on it, instead of overlapping the item below.
  initFlyoutTooltip() {
    if (!this.sidebar) return;

    this.flyoutTooltip = document.getElementById('sidebarFlyoutTooltip');
    if (!this.flyoutTooltip) {
      this.flyoutTooltip = document.createElement('div');
      this.flyoutTooltip.id = 'sidebarFlyoutTooltip';
      document.body.appendChild(this.flyoutTooltip);
    }

    this.sidebar.addEventListener('mouseenter', (e) => {
      const li = e.target.closest && e.target.closest('li[data-label]');
      if (!li || !this.sidebar.classList.contains('collapsed') || window.innerWidth < 769) return;
      this.showFlyoutTooltip(li);
    }, true);

    this.sidebar.addEventListener('mouseleave', (e) => {
      const li = e.target.closest && e.target.closest('li[data-label]');
      if (!li) return;
      this.hideFlyoutTooltip();
    }, true);

    // Also hide it immediately if a click navigates away or the sidebar expands
    this.sidebar.addEventListener('click', () => this.hideFlyoutTooltip());
  }

  showFlyoutTooltip(li) {
    const rect = li.getBoundingClientRect();
    const sidebarRect = this.sidebar.getBoundingClientRect();
    this.flyoutTooltip.textContent = li.getAttribute('data-label') || '';
    this.flyoutTooltip.style.top = (rect.top + rect.height / 2) + 'px';
    this.flyoutTooltip.style.left = (sidebarRect.right + 10) + 'px';
    this.flyoutTooltip.classList.add('visible');
  }

  hideFlyoutTooltip() {
    if (this.flyoutTooltip) this.flyoutTooltip.classList.remove('visible');
  }

  toggleSidebar() {
    if (this.isCollapsed) {
      this.expandSidebar();
    } else {
      this.collapseSidebar();
    }
  }

  collapseSidebar(animate = true) {
    if (!this.sidebar || !this.toggleBtn) return;

    this.isCollapsed = true;
    this.sidebar.classList.add('collapsed');
    this.toggleBtn.classList.add('collapsed');
    this.hideFlyoutTooltip();

    // Save state to localStorage
    this.saveCollapseState(true);
  }

  // [ADDED] Paints the initial collapsed visual on page load without
  // writing to localStorage — used for both an actual saved "true"
  // preference (which is already in storage, so re-saving is harmless
  // but pointless) and the tablet width auto-default in
  // loadCollapseState() below (which must NOT be saved, or a tablet
  // visitor's one-time auto-default would wrongly follow them to a
  // later desktop session as if they'd explicitly chosen it).
  applyInitialCollapseState() {
    if (!this.sidebar || !this.toggleBtn) return;
    this.sidebar.classList.add('collapsed');
    this.toggleBtn.classList.add('collapsed');
  }

  expandSidebar() {
    if (!this.sidebar || !this.toggleBtn) return;

    this.isCollapsed = false;
    this.sidebar.classList.remove('collapsed');
    this.toggleBtn.classList.remove('collapsed');
    this.hideFlyoutTooltip();

    // Save state to localStorage
    this.saveCollapseState(false);
  }

  saveCollapseState(isCollapsed) {
    try {
      localStorage.setItem('adminSidebarCollapsed', isCollapsed ? 'true' : 'false');
    } catch (e) {
      console.warn('Could not save sidebar state:', e);
    }
  }

  loadCollapseState() {
    try {
      const saved = localStorage.getItem('adminSidebarCollapsed');
      if (saved !== null) return saved === 'true';
      // [ADDED] No explicit preference saved yet (first visit, or this
      // browser has never touched the toggle) — default to collapsed
      // specifically in the narrow band that's actually measured to need
      // it. Testing every width from 769-1023px with a FULL (uncollapsed)
      // sidebar showed content squeezed to a 2-column card layout only
      // from 769-840px; by 850px it's already back to 3 columns on its
      // own. Scoping the auto-default to just 769-849 (rather than the
      // whole 769-1023 tablet band) also avoids trading one boundary
      // problem for another: defaulting the *entire* band to collapsed
      // would create a new dip exactly at the 1023→1024 seam (60px
      // sidebar suddenly jumping to the normal 245px default at 1024),
      // which doesn't exist with this narrower range since 900-1023
      // already matches 1024+'s natural expanded default.
      const w = window.innerWidth;
      return w >= 769 && w <= 849;
    } catch (e) {
      console.warn('Could not load sidebar state:', e);
      return false;
    }
  }

  handleResize() {
    this.hideFlyoutTooltip();

    // Hide toggle button below the bottom-nav breakpoint (see
    // admin-mobile-glass-menubar.css / mobileGlassMenubar) — that's the
    // real boundary for "does this device get a sidebar at all", not
    // 1024px. [CHANGED] Was window.innerWidth < 1024, which also matched
    // the whole 769-1023px tablet band — stripping the collapsed class
    // and hiding the toggle button there even though that's exactly the
    // range that most needs the icon-only option (full sidebar, no
    // bottom-nav, confirmed to squeeze content down to 2-column card
    // layouts that recover to 3 columns only once the viewport widens
    // well past 900px).
    if (window.innerWidth < 769) {
      if (this.toggleBtn) this.toggleBtn.style.display = 'none';
      if (this.sidebar) this.sidebar.classList.remove('collapsed');
    } else {
      if (this.toggleBtn) this.toggleBtn.style.display = 'flex';
      if (this.isCollapsed && this.sidebar) {
        this.sidebar.classList.add('collapsed');
      }
    }
  }
}

// ── MOBILE GLASS MENUBAR FUNCTIONALITY ──
class MobileGlassMenubar {
  constructor() {
    this.menubar = document.getElementById('mobileGlassMenubar');
    this.menuItems = [];
    this.currentActive = null;
    this.init();
  }

  init() {
    if (!this.menubar) return;

    // Get all menu items
    this.menuItems = Array.from(this.menubar.querySelectorAll('.mobile-menu-item'));

    // Restore active state from localStorage
    this.restoreActiveState();

    // Add click event listeners
    this.menuItems.forEach((item, index) => {
      item.addEventListener('click', () => this.handleMenuClick(item, index));
    });

    // Handle window resize to show/hide menubar
    window.addEventListener('resize', () => this.handleResize());
  }

  handleMenuClick(item, index) {
    // "More" isn't a real page — it opens the extra-options sheet instead.
    // Routing it through showPage() looked for a #moreMenu element that
    // doesn't exist, which is what threw "Cannot read properties of null
    // (reading 'classList')" and left the page mid-transition (black screen).
    const pageToShow = item.getAttribute('data-page');
    if (pageToShow === 'moreMenu') {
      this.toggleMoreSheet();
      return;
    }

    // Remove active class from all items
    this.menuItems.forEach(menuItem => {
      menuItem.classList.remove('active');
    });

    // Add active class to clicked item
    item.classList.add('active');
    this.currentActive = index;

    // Save active state
    this.saveActiveState(index);

    if (pageToShow && window.showPage) {
      window.showPage(pageToShow, null);
    }
  }

  setActiveItem(pageId) {
    const item = this.menuItems.find(m => m.getAttribute('data-page') === pageId);
    this.menuItems.forEach(m => m.classList.remove('active'));
    if (item) {
      item.classList.add('active');
      this.currentActive = this.menuItems.indexOf(item);
      this.saveActiveState(this.currentActive);
      return;
    }
    // Page isn't one of the 3 pinned tabs (it was opened from the "More"
    // sheet) — highlight "More" itself instead of leaving nothing active.
    const moreItem = this.menuItems.find(m => m.getAttribute('data-page') === 'moreMenu');
    if (moreItem) moreItem.classList.add('active');
  }

  // ── "MORE" SHEET (extra sidebar pages that don't fit in the 4-slot bar) ──

  ensureMoreSheet() {
    if (this.moreOverlay) return;

    const overlay = document.createElement('div');
    overlay.id = 'mobileMoreOverlay';
    overlay.addEventListener('click', () => this.closeMoreSheet());

    const sheet = document.createElement('div');
    sheet.id = 'mobileMoreSheet';
    sheet.innerHTML = '<div class="more-sheet-handle"><i class="fa-solid fa-chevron-down"></i></div><div class="more-sheet-grid"></div>';

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    this.moreOverlay = overlay;
    this.moreSheet = sheet;
    this.moreGrid = sheet.querySelector('.more-sheet-grid');

    this.populateMoreSheet();
  }

  // Reuse the desktop sidebar's own <li> items instead of duplicating the
  // page list — skips whichever pages already have a dedicated bottom-bar
  // slot, and clicking a tile just replays the sidebar item's own click
  // handler so behavior (showPage / openDashboard / badges) never drifts.
  populateMoreSheet() {
    const pinned = ['home', 'contributionPage', 'trackerPage'];
    const sidebarItems = Array.from(document.querySelectorAll('.sidebar li[onclick]'));

    // Reuse the sidebar's own category classes (nav-finance, nav-members,
    // nav-content, nav-system, nav-event) so each tile picks up the same
    // color grouping already established there — items with no matching
    // category (e.g. Dashboard) fall back to a neutral slate tile.
    const categoryTints = {
      'nav-finance': 'tint-finance',
      'nav-members': 'tint-members',
      'nav-content': 'tint-content',
      'nav-system': 'tint-system',
      'nav-event': 'tint-events'
    };

    this.moreGrid.innerHTML = '';
    sidebarItems.forEach(li => {
      const onclickAttr = li.getAttribute('onclick') || '';
      const isPinned = pinned.some(id => onclickAttr.includes(`'${id}'`));
      if (isPinned) return;

      const iconClass = li.querySelector('i') ? li.querySelector('i').className : 'fa-solid fa-circle';
      const label = li.getAttribute('data-label') || li.textContent.trim();
      const tint = Object.keys(categoryTints).find(cls => li.classList.contains(cls));
      const tintClass = tint ? categoryTints[tint] : 'tint-more';

      const tile = document.createElement('button');
      tile.className = 'more-sheet-item';
      tile.innerHTML = `<span class="more-tile ${tintClass}"><i class="${iconClass}"></i></span><span>${label}</span>`;
      tile.addEventListener('click', () => {
        li.click();
        this.closeMoreSheet();
      });
      this.moreGrid.appendChild(tile);
    });
  }

  openMoreSheet() {
    this.ensureMoreSheet();
    this.moreOverlay.classList.add('open');
    this.moreSheet.classList.add('open');
  }

  closeMoreSheet() {
    if (!this.moreOverlay) return;
    this.moreOverlay.classList.remove('open');
    this.moreSheet.classList.remove('open');
  }

  toggleMoreSheet() {
    this.ensureMoreSheet();
    if (this.moreSheet.classList.contains('open')) {
      this.closeMoreSheet();
    } else {
      this.openMoreSheet();
    }
  }

  saveActiveState(index) {
    try {
      localStorage.setItem('mobileMenuActive', index.toString());
    } catch (e) {
      console.warn('Could not save menu state:', e);
    }
  }

  restoreActiveState() {
    try {
      const savedIndex = localStorage.getItem('mobileMenuActive');
      if (savedIndex !== null) {
        const index = parseInt(savedIndex, 10);
        if (this.menuItems[index]) {
          this.menuItems[index].classList.add('active');
          this.currentActive = index;
        }
      } else {
        // Set Home as default active
        if (this.menuItems.length > 0) {
          this.menuItems[0].classList.add('active');
          this.currentActive = 0;
        }
      }
    } catch (e) {
      console.warn('Could not restore menu state:', e);
    }
  }

  handleResize() {
    if (!this.menubar) return;

    if (window.innerWidth <= 768) {
      this.menubar.style.display = 'flex';
    } else {
      this.menubar.style.display = 'none';
    }
  }
}

// ── INITIALIZE ON PAGE LOAD ──
document.addEventListener('DOMContentLoaded', () => {
  // Initialize sidebar toggle (desktop)
  window.sidebarToggle = new SidebarToggle();

  // Initialize mobile glass menubar
  window.mobileMenubar = new MobileGlassMenubar();

  // Expose global functions for HTML onclick handlers
  window.toggleSidebar = () => {
    if (window.sidebarToggle) {
      window.sidebarToggle.toggleSidebar();
    }
  };

  // Override showPage to update active menubar item
  const originalShowPage = window.showPage;
  if (typeof originalShowPage === 'function') {
    window.showPage = function(pageId, element) {
      // Call original function
      originalShowPage.call(this, pageId, element);

      // Update mobile menubar active state
      if (window.mobileMenubar) {
        window.mobileMenubar.setActiveItem(pageId);
      }

      // Update desktop sidebar active state
      if (element) {
        const sidebarItems = document.querySelectorAll('.sidebar li:not(.nav-section-label)');
        sidebarItems.forEach(item => {
          item.classList.remove('active-nav');
        });
        if (element.classList) {
          element.classList.add('active-nav');
        }
      }
    };
  }
});

// ── GLOBAL HELPER FUNCTIONS ──

/**
 * Toggle sidebar collapse state
 */
window.toggleSidebar = function() {
  if (window.sidebarToggle) {
    window.sidebarToggle.toggleSidebar();
  }
};

/**
 * Set specific mobile menu item as active
 * @param {string} pageId - The page ID to activate
 */
window.setMobileMenuActive = function(pageId) {
  if (window.mobileMenubar) {
    window.mobileMenubar.setActiveItem(pageId);
  }
};

/**
 * Programmatically collapse sidebar
 */
window.collapseSidebar = function() {
  if (window.sidebarToggle) {
    window.sidebarToggle.collapseSidebar();
  }
};

/**
 * Programmatically expand sidebar
 */
window.expandSidebar = function() {
  if (window.sidebarToggle) {
    window.sidebarToggle.expandSidebar();
  }
};

/**
 * Check if sidebar is currently collapsed
 * @returns {boolean}
 */
window.isSidebarCollapsed = function() {
  return window.sidebarToggle ? window.sidebarToggle.isCollapsed : false;
};