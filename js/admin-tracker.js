// ════════════════════════════════════════════════════════════════════════════
// CONTRIBUTION TRACKER - COMPLETE VERSION WITH DATA LOADING
// Replace: js/admin-tracker.js
// ════════════════════════════════════════════════════════════════════════════

// Same month-name convention the rest of the app already uses for ForMonth
// (e.g. "January", not "Jan" or "01") — see admin.js MONTHS constant.
const TRACKER_MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

// Global state for tracker
let trackerModuleState = {
  allMembers: [],
  paidMembers: [],
  pendingMembers: [],
  yearContribs: [],
  // FIX: was left undefined until a select with this value was found, which
  // made every "which month is selected" check silently compare against
  // undefined. Default to the real current month, same as the old tracker did.
  currentMonth: TRACKER_MONTH_NAMES[new Date().getMonth()],
  // Tracks which tab is on screen right now, so a global filter change can
  // refresh whichever tab the admin is actually looking at (see
  // _trRefreshActiveTabVisuals below) instead of only updating Overview.
  activeTab: 'overview',
  filters: {
    type: '',
    year: new Date().getFullYear(),
    hideInactive: false
  }
};

// FIX: member fields (Name, Mobile) were being interpolated straight into
// innerHTML template strings all over this file with no escaping. A member
// record with a stray "<" or a copy-pasted "<script>" in their name would
// execute in the admin panel. Every place that writes a member field into
// innerHTML now runs it through this first.
function _trEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

// [FIX-MOBILE] Tap-to-view detail for a calendar day — replaces relying only
// on hover/title tooltips, which don't work on touch devices. Reuses the
// shared openModal() so this matches the look of Member Details etc.
// instead of introducing a new UI pattern.
function _trShowDayDetail(day, monthName, year, namesJson) {
  let names = [];
  try { names = JSON.parse(namesJson.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')); } catch (e) {}
  const dateLabel = day + ' ' + monthName + ' ' + year;
  const body = names.length > 0
    ? '<ul style="margin:0;padding-left:20px;">' + names.map(n => '<li style="padding:5px 0;font-size:14px;color:#1e293b;">' + _trEsc(n) + '</li>').join('') + '</ul>'
    : '<p style="text-align:center;color:#94a3b8;padding:20px 0;margin:0;">No collections on this day.</p>';
  const html = '<div class="_mhdr"><h3><i class="fa-solid fa-calendar-day" style="color:#0F766E;margin-right:6px;"></i> ' + _trEsc(dateLabel) + '</h3><button class="_mcls" onclick="closeModal()">×</button></div>'
    + '<div class="_mbdy" style="padding:14px 20px;">'
    + '<div style="font-size:13px;color:#64748b;margin-bottom:10px;">' + names.length + ' ' + (names.length === 1 ? 'member' : 'members') + ' contributed' + '</div>'
    + body
    + '</div>'
    + '<div class="_mft"><button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Close</button></div>';
  openModal(html, "380px");
}

// [FIX-MOBILE] Tap-to-view detail for Total Pending — shows exactly which
// months (with year) are pending instead of just a bare count.
function _trShowPendingDetail(userId, memberName) {
  const list = (window._trPendingLists && window._trPendingLists[userId]) || [];
  const body = list.length > 0
    ? '<ul style="margin:0;padding-left:20px;">' + list.map(p => '<li style="padding:5px 0;font-size:14px;color:#1e293b;">' + _trEsc(p.month) + ' ' + p.year + '</li>').join('') + '</ul>'
    : '<p style="text-align:center;color:#94a3b8;padding:20px 0;margin:0;">No pending months.</p>';
  const html = '<div class="_mhdr"><h3><i class="fa-solid fa-circle-exclamation" style="color:#ef4444;margin-right:6px;"></i> ' + _trEsc(memberName) + ' — Pending Months</h3><button class="_mcls" onclick="closeModal()">×</button></div>'
    + '<div class="_mbdy" style="padding:14px 20px;max-height:340px;overflow-y:auto;">'
    + '<div style="font-size:13px;color:#64748b;margin-bottom:10px;">' + list.length + ' month' + (list.length === 1 ? '' : 's') + ' pending, from their start date to now</div>'
    + body
    + '</div>'
    + '<div class="_mft"><button class="_mbtn" style="background:#94a3b8;" onclick="closeModal()"><i class="fa-solid fa-xmark"></i> Close</button></div>';
  openModal(html, "360px");
}

// ═══ ACTIVE/INACTIVE + START-DATE LOGIC (ported from the old tracker) ═══
// This whole block was missing from the restructure. Without it, a member
// who joined mid-year shows every earlier month as "pending" (they never
// contributed then because they weren't a member yet), and an inactive
// member keeps racking up "pending" months forever instead of freezing at
// the date they went inactive.

// Case-insensitive Status check, matching the old tracker's convention.
function _trIsInactive(u) {
  return String(u.Status || '').toLowerCase() === 'inactive';
}

// dd-MM-yyyy (optionally with a time suffix) → {y, m, d} (m is 0-indexed) or null
function _trParseDMY(s) {
  if (!s) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})/.exec(String(s).trim());
  if (!m) return null;
  const y = Number(m[3]), mo = Number(m[2]) - 1, d = Number(m[1]);
  if (isNaN(y) || isNaN(mo) || mo < 0 || mo > 11) return null;
  return { y, m: mo, d };
}

function _trYM(y, m) { return y * 12 + m; }

// Effective month a member's pending-tracking should start from:
// 1) admin-set ContribStartDate, else
// 2) their earliest recorded (non walk-in) contribution, else
// 3) their RegisteredAt date, else
// 4) null — no restriction, always countable
// Then clamped forward to ReactivatedAt if they were ever reactivated after a
// spell inactive — otherwise a reactivated member's pending would re-count
// their whole inactive gap as unpaid months, since InactiveSince alone can't
// tell us "resume counting from here" once Status is active again.
function _trEffectiveStart(u) {
  let start = _trParseDMY(u.ContribStartDate);
  if (!start) {
    const allContribs = trackerModuleState.yearContribs || [];
    const mine = allContribs.filter(c =>
      String(c.UserId) === String(u.UserId) && !String(c.UserId).startsWith('WALKIN_')
    );
    let best = null;
    mine.forEach(c => {
      const y = Number(c.Year), mi = TRACKER_MONTH_NAMES.indexOf(c.ForMonth);
      if (isNaN(y) || mi === -1) return;
      if (!best || y < best.y || (y === best.y && mi < best.m)) best = { y, m: mi };
    });
    start = best || _trParseDMY(u.RegisteredAt);
  }
  const reactivated = _trParseDMY(u.ReactivatedAt);
  if (reactivated && (!start || _trYM(reactivated.y, reactivated.m) > _trYM(start.y, start.m))) {
    return reactivated;
  }
  return start;
}

// Month a now-inactive member's pending tracking should freeze at, or null
function _trInactiveFreeze(u) {
  if (!_trIsInactive(u)) return null;
  return _trParseDMY(u.InactiveSince);
}

// Splits members into paid/pending for one month, the same way the old
// tracker did: members are skipped entirely (counted as neither paid nor
// pending) if the month is before their start date, after their inactive
// freeze date, or still in the future.
// yearOverride lets callers compute this for a year other than the current
// filter (used by the multi-year stats below) without touching global state.
function _trackerSplitPaidPending(members, contribs, monthName, yearOverride) {
  const focusMonthIdx = TRACKER_MONTH_NAMES.indexOf(monthName);
  const paid = [], pending = [];
  if (focusMonthIdx === -1) return { paid, pending };

  const selYearNum = yearOverride != null ? Number(yearOverride) : Number(trackerModuleState.filters.year);
  const now = new Date();
  const curYM = _trYM(now.getFullYear(), now.getMonth());
  const ym = _trYM(selYearNum, focusMonthIdx);
  const paidIds = _trackerPaidUserIdSet(contribs, monthName);

  members.forEach(m => {
    const start = _trEffectiveStart(m);
    const freeze = _trInactiveFreeze(m);
    const beforeStart = start && ym < _trYM(start.y, start.m);
    const closed = freeze && ym > _trYM(freeze.y, freeze.m);
    const future = ym > curYM;
    if (beforeStart || closed || future) return;
    if (paidIds.has(String(m.UserId))) paid.push(m);
    else pending.push(m);
  });
  return { paid, pending };
}

// ═══ POPULATE DROPDOWNS ═══

// Only auto-select the current month once — later calls to
// populateTrackerDropdowns() (e.g. after saving a contribution elsewhere)
// must NOT keep resetting whatever month the admin has manually picked.
let _trMonthDefaulted = false;

function populateTrackerDropdowns() {

  // Populate Type dropdown
  const typeSelect = document.getElementById('tr_type_filter');
  if (typeSelect && typeof types !== 'undefined' && types.length > 0) {
    // Clear any previously-added options (keep the first "All" option) so this
    // is safe to call again once real data arrives, without creating duplicates.
    while (typeSelect.options.length > 1) typeSelect.remove(1);
    types.forEach(t => {
      const option = document.createElement('option');
      option.value = t.TypeId || t.type_id || t;
      option.textContent = t.TypeName || t.type_name || t;
      typeSelect.appendChild(option);
    });
    // Set Type to first position (All)
    typeSelect.value = '';
  }

  // Populate Year dropdown
  const yearSelect = document.getElementById('tr_year_filter');
  if (yearSelect && yearSelect.options.length <= 0) {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 5; y <= currentYear; y++) {
      const option = document.createElement('option');
      option.value = y;
      option.textContent = y;
      yearSelect.appendChild(option);
    }
    yearSelect.value = currentYear;
  }

  // Set GLOBAL Month to current month
  const monthSelectGlobal = document.getElementById('tr_month_select_global');
  if (monthSelectGlobal) {
    const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    monthSelectGlobal.value = currentMonth;
  }

  // FIX: #tr_month_select's options already exist in the HTML (values
  // "01".."12"), but nothing ever selected the current month — it silently
  // defaulted to January. Set it once, without touching Type/Year's own
  // independent guards above.
  const monthSelect = document.getElementById('tr_month_select');
  if (monthSelect && !_trMonthDefaulted) {
    monthSelect.value = String(new Date().getMonth() + 1).padStart(2, '0');
    _trMonthDefaulted = true;
  }
}

// ═══ GLOBAL FILTER FUNCTIONS ═══

function applyGlobalTrackerFilters() {
  const monthGlobalSelect = document.getElementById('tr_month_select_global');
  const monthSelect = document.getElementById('tr_month_select');
  
  trackerModuleState.filters.type = document.getElementById('tr_type_filter')?.value || '';
  trackerModuleState.filters.year = parseInt(document.getElementById('tr_year_filter')?.value) || new Date().getFullYear();
  trackerModuleState.filters.hideInactive = document.getElementById('tr_hide_inactive_filter')?.checked || false;
  
  // Sync global month filter with overview month select
  if (monthGlobalSelect && monthGlobalSelect.value && monthSelect) {
    monthSelect.value = monthGlobalSelect.value;
  }
  
  runTrackerMain();
  // FIX: Type/Year/Hide-Inactive only ever refreshed Overview (via
  // runTrackerMain). If the admin changed a filter while sitting on
  // Analytics, Calendar, Leaderboard, or Predictions, that tab kept showing
  // stale data from before the filter change until they clicked away and
  // back. Now the currently visible tab is re-rendered too.
  _trRefreshActiveTabVisuals();
}

// Re-renders whichever tab is currently on screen, so a global filter change
// is reflected everywhere immediately — not just in Overview.
function _trRefreshActiveTabVisuals() {
  const tab = trackerModuleState.activeTab;
  if (tab === 'analytics') renderTrackerAnalytics();
  else if (tab === 'calendar') renderTrackerCalendar();
  else if (tab === 'leaderboard') renderTrackerLeaderboard();
  else if (tab === 'predictions') renderTrackerPredictions();
  else if (tab === 'email') renderTrackerIndividualMembersList();
}

function resetTrackerGlobalFilters() {
  // FIX: this cleared the month select to blank instead of defaulting it
  // back to the current month — Type (blank = "All", its first option) and
  // Year (current year) already reset correctly; Month didn't.
  document.getElementById('tr_month_select_global').value = String(new Date().getMonth() + 1).padStart(2, '0');
  document.getElementById('tr_type_filter').value = '';
  document.getElementById('tr_year_filter').value = new Date().getFullYear();
  document.getElementById('tr_hide_inactive_filter').checked = false;
  applyGlobalTrackerFilters();
}

// ═══ TAB SWITCHING ═══

// FIX: this used to read the implicit global `event` object to find which
// button to highlight. That only works when called directly from an inline
// onclick="..." handler — it silently fails to highlight anything (no error,
// just no highlight) the moment this is triggered any other way (a deep
// link, a test, a future keyboard-nav handler, etc). Now takes the button
// explicitly, and falls back to looking it up by tab name if no button is
// passed, so it works correctly no matter how it's called.
function switchTrackerTab(tabName, btn) {
  trackerModuleState.activeTab = tabName;

  // Hide all tabs
  document.querySelectorAll('[id^="tracker-tab-"]').forEach(tab => tab.style.display = 'none');

  // Reset active state — was toggling inline color/border-bottom styles,
  // left over from an older underline-tab design. The CSS was restyled to
  // a filled-pill design driven entirely by the .active class, which this
  // never touched, so whichever tab started with .active in the HTML
  // (Overview) stayed visually "on" no matter which tab was actually open.
  document.querySelectorAll('.tracker-tab-btn').forEach(b => b.classList.remove('active'));

  // Show selected tab
  const activeTab = document.getElementById(`tracker-tab-${tabName}`);
  if (activeTab) {
    activeTab.style.display = 'block';
  }

  // Highlight active button — use the passed-in button if we have one,
  // otherwise fall back to matching by its onclick target so this still
  // works when called without an event (e.g. programmatically).
  const activeBtn = btn || Array.from(document.querySelectorAll('.tracker-tab-btn'))
    .find(b => b.getAttribute('onclick')?.includes(`'${tabName}'`));
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Load tab content
  if (tabName === 'analytics') renderTrackerAnalytics();
  else if (tabName === 'calendar') renderTrackerCalendar();
  else if (tabName === 'leaderboard') renderTrackerLeaderboard();
  else if (tabName === 'predictions') renderTrackerPredictions();
  // FIX: was calling switchTrackerEmailTab('bulk', null) — that function (and
  // the whole Bulk/Template sub-tab system) is gone now that Email is just
  // the User-Wise list. Render it directly instead.
  else if (tabName === 'email') renderTrackerIndividualMembersList();
}

// ═══ SHARED HELPERS — single source of truth for "who paid" ═══
// Consolidated here so the summary cards, the grid, and the paid/pending
// lists can never disagree with each other again.

function _trackerSelectedMonth() {
  // Priority: use global month filter first
  const globalMonth = document.getElementById('tr_month_select_global')?.value;
  if (globalMonth) {
    const idx = parseInt(globalMonth, 10) - 1;
    if (idx >= 0 && idx < 12) return TRACKER_MONTH_NAMES[idx];
  }
  // Fallback: check if local month select exists (for backward compatibility)
  const raw = document.getElementById('tr_month_select')?.value;
  if (raw) {
    const idx = parseInt(raw, 10) - 1;
    if (idx >= 0 && idx < 12) return TRACKER_MONTH_NAMES[idx];
  }
  return trackerModuleState.currentMonth;
}

// Narrows contribution records to the selected Year + Type filters.
// FIX: this used to only filter by Type. The Year filter was captured in
// trackerModuleState.filters.year but never actually applied, so contributions
// from every year were mixed together. Also restored the walk-in exclusion
// the old tracker (runTracker() in admin.js) always did.
function _trackerFilteredContribs() {
  let contribs = trackerModuleState.yearContribs || [];
  const year = trackerModuleState.filters.year;
  contribs = contribs.filter(c =>
    String(c.Year) === String(year) && !String(c.UserId).startsWith('WALKIN_')
  );
  const type = trackerModuleState.filters.type;
  if (type) {
    contribs = contribs.filter(c => {
      const cType = (c.TypeId !== undefined && c.TypeId !== null) ? c.TypeId : c.Type;
      return String(cType) === String(type);
    });
  }
  return contribs;
}

function _trackerPaidUserIdSet(contribs, monthNum) {
  const set = new Set();
  contribs.forEach(c => {
    if (String(c.ForMonth) === String(monthNum)) set.add(String(c.UserId));
  });
  return set;
}

// ═══ MAIN TRACKER FUNCTION ═══

function runTrackerMain() {
  trackerModuleState.currentMonth = _trackerSelectedMonth();

  // Base member list — Type filter does NOT remove members (it isn't a
  // member field; it narrows which contributions count as "paid" below).
  let members = trackerModuleState.allMembers || [];
  if (trackerModuleState.filters.hideInactive) {
    members = members.filter(m => !_trIsInactive(m));
  }

  const filteredContribs = _trackerFilteredContribs();
  // FIX (Leaderboard): "YearAmount" was referenced but never computed
  // anywhere in the app, so the Leaderboard always showed ₹0 for everyone.
  // Compute real per-member totals here, from the same year/type-filtered
  // contributions used everywhere else in this module.
  const yearAmounts = {};
  filteredContribs.forEach(c => {
    const uid = String(c.UserId);
    yearAmounts[uid] = (yearAmounts[uid] || 0) + Number(c.Amount || 0);
  });
  trackerModuleState.memberYearAmounts = yearAmounts;

  // FIX: was a flat "did they pay this month" split with no regard for
  // whether the member had even started, or had already gone inactive, by
  // that month — restored the old start-date/inactive-freeze aware split.
  const { paid: paidMembers, pending: pendingMembers } =
    _trackerSplitPaidPending(members, filteredContribs, trackerModuleState.currentMonth);
  trackerModuleState.paidMembers = paidMembers;
  trackerModuleState.pendingMembers = pendingMembers;

  const total = members.length;
  // FIX: rate is now paid / (paid+pending) — i.e. of members the month
  // actually applies to — same basis the old tracker used, instead of
  // paid / all-members (which counted "not applicable yet" members against
  // the rate).
  const applicableTotal = paidMembers.length + pendingMembers.length;
  const rate = applicableTotal > 0 ? Math.round((paidMembers.length / applicableTotal) * 100) : 0;
  const inactive = (trackerModuleState.allMembers || []).filter(m => _trIsInactive(m)).length;

  // Update UI
  const totalEl = document.getElementById('tr_total_members');
  const pendingEl = document.getElementById('tr_pending_count');
  const rateEl = document.getElementById('tr_collection_rate');
  const inactiveEl = document.getElementById('tr_inactive_count');

  if (totalEl) totalEl.textContent = total;
  if (pendingEl) pendingEl.textContent = pendingMembers.length;
  if (rateEl) rateEl.textContent = rate + '%';
  if (inactiveEl) inactiveEl.textContent = inactive;

  // Render grid and lists — same filteredContribs and paid/pending split
  // used everywhere, so nothing can drift out of sync again.
  renderTrackerGrid(members, filteredContribs);
  renderTrackerMembers(paidMembers, pendingMembers);
}

// All of this member's real (non walk-in) contributions, across EVERY year —
// unlike _trackerFilteredContribs() this deliberately ignores the Year
// filter (Total Pending is a lifetime count, not a per-year one), but still
// respects the Type filter so it stays consistent with what "paid" means
// everywhere else on this page.
function _trackerFilteredContribsAllYears() {
  let contribs = (trackerModuleState.yearContribs || []).filter(c =>
    !String(c.UserId).startsWith('WALKIN_')
  );
  const type = trackerModuleState.filters.type;
  if (type) {
    contribs = contribs.filter(c => {
      const cType = (c.TypeId !== undefined && c.TypeId !== null) ? c.TypeId : c.Type;
      return String(cType) === String(type);
    });
  }
  return contribs;
}

// Counts how many months are genuinely "pending" for one member across their
// WHOLE membership — from their effective start date (ContribStartDate, or
// earliest contribution, or RegisteredAt) up to the current month, not just
// the Year filter's selected year. If they've since gone inactive, counting
// stops at their inactive-freeze month, same as everywhere else in this file.
// [FIX-DETAIL] Now also returns the actual list of pending {year, month}
// entries (not just the count) so the UI can show WHICH months are pending,
// not just a number — pass `withList:true` to get it.
function _trPendingCountAllTime(member, allContribs, withList) {
  const start = _trEffectiveStart(member);
  const freeze = _trInactiveFreeze(member);
  const now = new Date();
  const curYM = _trYM(now.getFullYear(), now.getMonth());

  // Lower bound to count from. Normally `start` always resolves to
  // something (ContribStartDate → earliest contribution → RegisteredAt),
  // but if a member record is missing all three, fall back to the same
  // "current year - 5" window the Year filter dropdown itself offers,
  // instead of counting back to year zero.
  const startYM = start ? _trYM(start.y, start.m) : _trYM(now.getFullYear() - 5, 0);
  const endYM = freeze ? Math.min(curYM, _trYM(freeze.y, freeze.m)) : curYM;

  let count = 0;
  const list = [];
  for (let ym = startYM; ym <= endYM; ym++) {
    const y = Math.floor(ym / 12), mi = ym % 12;
    const paid = allContribs.some(c =>
      String(c.UserId) === String(member.UserId) &&
      String(c.Year) === String(y) &&
      c.ForMonth === TRACKER_MONTH_NAMES[mi]
    );
    if (!paid) {
      count++;
      if (withList) list.push({ year: y, month: TRACKER_MONTH_NAMES[mi] });
    }
  }
  return withList ? { count, list } : count;
}

// ═══ GRID RENDERING ═══

function renderTrackerGrid(members, contribs) {
  const container = document.getElementById('tr_grid_table');
  if (!container) return;
  contribs = contribs || trackerModuleState.yearContribs || [];

  // Short labels for the column headers, but matched against ForMonth using
  // the FULL month name (TRACKER_MONTH_NAMES) — that's the actual format
  // ForMonth is stored in (e.g. "January"), not "Jan" and not a zero-padded
  // number. This mismatch was why every cell showed as unpaid before.
  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const selYearNum = Number(trackerModuleState.filters.year);
  const now = new Date();
  const curYM = _trYM(now.getFullYear(), now.getMonth());

  let html = '<table style="width:100%;border-collapse:separate;border-spacing:0;font-size:11px;">';
  html += '<tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0;">';
  html += '<th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--tr-text);">Member</th>';
  
  monthLabels.forEach(m => {
    html += `<th style="padding:8px;text-align:center;font-weight:600;border-left:1px solid #e2e8f0;color:#1e293b;">${m}</th>`;
  });
  html += '<th style="padding:8px;text-align:center;font-weight:600;border-left:2px solid #e2e8f0;color:#1e293b;" title="Pending months from their join/start date to now, ignoring the Year filter above">Total<br>Pending</th>';

  html += '</tr>';

  if (members.length === 0) {
    html += '<tr><td colspan="14" style="padding:16px;text-align:center;color:#999;">No members found</td></tr>';
  } else {
    // Computed once here (not per-row) since it's the same all-years,
    // type-filtered contribution list for every member in the grid.
    const allYearsContribs = _trackerFilteredContribsAllYears();
    members.forEach(m => {
      // FIX: restored the old tracker's per-cell states. Before this, a
      // member who joined in June showed Jan–May as "pending" (red ✕), and
      // an inactive member kept accruing "pending" months forever past the
      // date they actually went inactive.
      const start = _trEffectiveStart(m);
      const freeze = _trInactiveFreeze(m);

      html += '<tr style="border-bottom:1px solid #e2e8f0;">';
      html += `<td style="padding:8px 12px;font-weight:500;color:var(--tr-text);">
        <div style="display:flex;align-items:center;gap:7px;min-width:150px;max-width:220px;">
          ${_avatarHtml(m, 20)}
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_trEsc(m.Name) || '—'}</span>
        </div>
      </td>`;
      
      monthLabels.forEach((label, i) => {
        const ym = _trYM(selYearNum, i);
        let color, icon;
        if (ym > curYM) {
          color = '#cbd5e1'; icon = '·';   // future month — hasn't happened yet
        } else if (start && ym < _trYM(start.y, start.m)) {
          color = '#cbd5e1'; icon = '—';   // before this member's start date
        } else if (freeze && ym > _trYM(freeze.y, freeze.m)) {
          color = '#94a3b8'; icon = '⊘';   // inactive — frozen after this point
        } else {
          const paid = contribs.find(c => 
            String(c.UserId) === String(m.UserId) && c.ForMonth === TRACKER_MONTH_NAMES[i]
          );
          color = paid ? '#10b981' : '#ef4444';
          icon = paid ? '✓' : '✕';
        }
        html += `<td style="padding:8px;text-align:center;background:${color}20;border-left:1px solid #e2e8f0;color:${color};font-weight:600;">${icon}</td>`;
      });

      // Total Pending — lifetime count from this member's start date to now
      // (NOT limited to the Year filter above), still freeze-aware if they've
      // since gone inactive. See _trPendingCountAllTime.
      const _pendingResult = _trPendingCountAllTime(m, allYearsContribs, /*withList*/true);
      const pendingCount = _pendingResult.count;
      const pendingColor = pendingCount > 0 ? '#ef4444' : '#10b981';
      // [FIX-MOBILE] Previously just a static number — no way to see WHICH
      // months were pending without opening the member and cross-checking
      // manually. Stash the list on window (keyed by UserId) rather than
      // embedding it in the onclick attribute — this table can have many
      // rows, and a JSON blob per row bloats the HTML for no benefit since
      // only one gets viewed at a time.
      window._trPendingLists = window._trPendingLists || {};
      window._trPendingLists[m.UserId] = _pendingResult.list;
      const _pendingOnclick = pendingCount > 0 ? `onclick="_trShowPendingDetail('${String(m.UserId).replace(/'/g,"\\'")}', '${_trEsc(m.Name||'')}')" style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted;"` : '';
      html += `<td style="padding:8px;text-align:center;border-left:2px solid #e2e8f0;color:${pendingColor};font-weight:700;" ${_pendingOnclick}>${pendingCount}</td>`;

      html += '</tr>';
    });
  }

  html += '</table>';
  container.innerHTML = html;
  if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(container);
}

// ═══ MEMBER LISTS ═══

function renderTrackerMembers(paid, pending) {
  const paidDiv = document.getElementById('tr_paid_list');
  const pendingDiv = document.getElementById('tr_pending_list');

  // Same avatar treatment as the Contribution section — real member photo
  // via the shared _avatarHtml() helper (falls back to the initials icon
  // until the real photo lazy-loads from Drive), instead of name-only rows.
  if (paidDiv) {
    paidDiv.innerHTML = paid.length === 0 
      ? '<div style="padding:12px;text-align:center;color:#999;">No paid members</div>'
      : paid.map(m => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid #e2e8f0;">
          ${_avatarHtml(m, 32)}
          <div style="min-width:0;">
            <div style="font-weight:500;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_trEsc(m.Name) || '—'}</div>
            <div style="font-size:10px;color:#64748b;">${_trEsc(m.Mobile) || '—'}</div>
          </div>
        </div>
      `).join('');
    if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(paidDiv);
  }

  if (pendingDiv) {
    pendingDiv.innerHTML = pending.length === 0 
      ? '<div style="padding:12px;text-align:center;color:#999;">No pending members</div>'
      : pending.map(m => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid #e2e8f0;">
          ${_avatarHtml(m, 32)}
          <div style="min-width:0;">
            <div style="font-weight:500;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_trEsc(m.Name) || '—'}</div>
            <div style="font-size:10px;color:#64748b;">${_trEsc(m.Mobile) || '—'}</div>
          </div>
        </div>
      `).join('');
    if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(pendingDiv);
  }
}

function filterTrackerMembers() {
  const search = document.getElementById('tr_search_members')?.value.toLowerCase() || '';
  const members = (trackerModuleState.allMembers || []).filter(m =>
    (m.Name || '').toLowerCase().includes(search) ||
    (m.Mobile || '').includes(search)
  );
  const filteredContribs = _trackerFilteredContribs();
  // FIX: was using the flat "paid this month or not" split, out of sync with
  // the start-date/inactive-freeze aware split runTrackerMain() now uses —
  // searching used to show different pending members than the main view.
  const { paid, pending } = _trackerSplitPaidPending(members, filteredContribs, trackerModuleState.currentMonth);
  renderTrackerGrid(members, filteredContribs);
  renderTrackerMembers(paid, pending);
}

// ═══ EMAIL — USER-WISE SEND ONLY ═══
// FIX: this used to be a 3-tab system (Bulk Send / User-Wise / Template
// Editor). Removed per request — Bulk Send had no working backend for 2 of
// its 3 buttons (see the FIX comment history below) and the Template Editor
// only edited a local JS object that the actual send functions never read
// from, so it never did anything real. User-Wise is the only path that
// genuinely sends mail, so that's what's left.

// INDIVIDUAL EMAIL SENDING
function renderTrackerIndividualMembersList() {
  const month = document.getElementById('tr_month_select_global')?.value;
  if (!month) {
    document.getElementById('tr_individual_members_list').innerHTML = '<div style="padding:12px;color:#94a3b8;">Select a month first</div>';
    return;
  }
  
  const monthIdx = parseInt(month) - 1;
  const monthName = TRACKER_MONTH_NAMES[monthIdx];
  const filteredContribs = _trackerFilteredContribs();
  const allMembers = trackerModuleState.allMembers || [];
  
  let displayMembers = allMembers;
  if (trackerModuleState.filters.hideInactive) {
    displayMembers = displayMembers.filter(m => !_trIsInactive(m));
  }
  
  const { paid, pending } = _trackerSplitPaidPending(displayMembers, filteredContribs, monthName);
  const allMemersList = [...paid, ...pending];
  
  let html = '';
  allMemersList.forEach(member => {
    const isPaid = paid.find(p => String(p.UserId) === String(member.UserId));
    const status = isPaid ? 'Paid ✓' : 'Pending';
    const statusColor = isPaid ? '#10b981' : '#f43f5e';
    const checkboxId = `tr_member_${member.UserId}`;
    
    html += `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid #e2e8f0;">
        <input type="checkbox" id="${checkboxId}" data-userid="${member.UserId}" data-ispaid="${isPaid ? '1' : '0'}" style="width:16px;height:16px;cursor:pointer;accent-color:#0F766E;flex-shrink:0;">
        ${_avatarHtml(member, 28)}
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_trEsc(member.Name)}</div>
          <div style="font-size:10px;color:#64748b;">${_trEsc(member.Mobile || '')}</div>
        </div>
        <span style="background:${statusColor}20;color:${statusColor};padding:3px 8px;border-radius:4px;font-size:9px;font-weight:600;flex-shrink:0;">${status}</span>
      </div>
    `;
  });
  
  document.getElementById('tr_individual_members_list').innerHTML = html || '<div style="padding:12px;color:#94a3b8;">No members found</div>';
  if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(document.getElementById('tr_individual_members_list'));
}

function getTrackerIndividualSelections() {
  const selected = [];
  document.querySelectorAll('#tr_individual_members_list input[type="checkbox"]:checked').forEach(cb => {
    selected.push({
      userId: cb.getAttribute('data-userid'),
      isPaid: cb.getAttribute('data-ispaid') === '1'
    });
  });
  return selected;
}

function clearTrackerIndividualSelection() {
  document.querySelectorAll('#tr_individual_members_list input[type="checkbox"]').forEach(cb => cb.checked = false);
}

// Custom confirm dialog for email sending — reuses the .modal/.modal-content
// classes already sitting unused in admin-tracker-v4.css, instead of the
// browser's native confirm() popup (the "127.0.0.1:5501 says..." box).
// Promise-based so call sites can just `await _trShowConfirm(...)`.
let _trConfirmResolve = null;
function _trShowConfirm(message) {
  return new Promise(resolve => {
    _trConfirmResolve = resolve;
    const msgEl = document.getElementById('tr_confirm_modal_message');
    const modal = document.getElementById('tr_confirm_modal');
    if (msgEl) msgEl.textContent = message;
    if (modal) modal.style.display = 'block';
  });
}
function _trCloseConfirmModal(result) {
  const modal = document.getElementById('tr_confirm_modal');
  if (modal) modal.style.display = 'none';
  if (_trConfirmResolve) {
    _trConfirmResolve(result);
    _trConfirmResolve = null;
  }
}

async function sendTrackerIndividualEmails() {
  const selected = getTrackerIndividualSelections();
  if (selected.length === 0) {
    alert('Please select at least one member');
    return;
  }
  
  const month = document.getElementById('tr_month_select_global')?.value;
  const monthIdx = parseInt(month) - 1;
  const monthName = TRACKER_MONTH_NAMES[monthIdx];
  const year = trackerModuleState.filters.year;
  
  const ok = await _trShowConfirm(`Send emails to ${selected.length} selected member(s)?`);
  if (!ok) {
    return;
  }
  
  const statusEl = document.getElementById('tr_individual_status');
  const detailEl = document.getElementById('tr_individual_status_detail');
  statusEl.style.display = 'block';
  detailEl.innerHTML = '<div style="color:#64748b;">Sending emails...</div>';
  
  let sentCount = 0, failedCount = 0;
  const statusDetails = [];
  let completed = 0;

// FIX: reset the checkbox selection once every send in the batch has
// finished, so the list doesn't stay showing 5 checked boxes after you've
// already sent to those 5 — matches how a "Send" action should feel done.
function updateStatusIfAllComplete() {
    if (completed === selected.length) {
      detailEl.innerHTML = `
        <strong>Summary:</strong><br>
        ✓ Sent: ${sentCount}<br>
        ✗ Failed: ${failedCount}<br>
        <br>
        ${statusDetails.join('<br>')}
      `;
      clearTrackerIndividualSelection();
    }
  }

  // This app talks to Apps Script via postData() (JSONP, defined in app.js —
  // used the same way by every other write action in admin-core.js), not
  // google.script.run (that only exists when a page is served through Apps
  // Script's HtmlService directly, which this app never does). Fired
  // concurrently rather than awaited one-at-a-time, so selecting many
  // members still sends them all in parallel rather than serially.
  //
  // Also: postData() doesn't attach the session automatically, and the
  // target member's id and the logged-in admin's id need distinct keys
  // (UserId vs userId — see the matching FIX comment on the backend route)
  // or they overwrite each other and _verifySession rejects the whole
  // request as "Session expired", regardless of which member you picked.
  const _s = JSON.parse(localStorage.getItem('session') || '{}');

  selected.forEach(async item => {
    const member = trackerModuleState.allMembers.find(m => String(m.UserId) === item.userId);
    if (!member || !member.Email) {
      statusDetails.push(`<span style="color:#dc2626;">✗ ${_trEsc(member?.Name || 'Unknown')} - No email</span>`);
      failedCount++;
      completed++;
      updateStatusIfAllComplete();
      return;
    }

    try {
      const response = await postData({
        action: 'sendIndividualTrackerEmail',
        UserId: item.userId,        // target member (capital — matches this app's UserId-vs-userId convention)
        monthName: monthName,
        year: String(year),
        userId: _s.userId || '',    // authenticated admin, for _verifySession
        sessionToken: _s.sessionToken || ''
      });
      completed++;

      if (response.status === 'ok') {
        const emailType = response.type === 'receipt' ? '📜 Receipt' : '📧 Reminder';
        statusDetails.push(`<span style="color:#10b981;">✓ ${_trEsc(response.name)} - ${emailType} sent</span>`);
        sentCount++;
      } else {
        statusDetails.push(`<span style="color:#dc2626;">✗ ${_trEsc(response.name)} - ${_trEsc(response.message)}</span>`);
        failedCount++;
      }
    } catch (error) {
      completed++;
      statusDetails.push(`<span style="color:#dc2626;">✗ ${_trEsc(member.Name)} - Error: ${_trEsc(error?.message || error)}</span>`);
      failedCount++;
    }

    updateStatusIfAllComplete();
  });
}

function updateTrackerEmailPreview() {}

// ═══ LIGHTWEIGHT SVG CHARTS (no external chart library — this app doesn't
// load one, so these build plain inline SVG instead of pulling in a CDN
// dependency for a handful of bars/lines) ═══

function _trRenderBarChart(items, opts) {
  opts = opts || {};
  const w = opts.width || 640, h = opts.height || 170;
  const padLeft = 28, padBottom = 22, padTop = 18, padRight = 8;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;
  const n = items.length || 1;
  const barGap = 6;
  const barW = Math.max(4, (chartW - barGap * (n - 1)) / n);
  const maxVal = 100;

  let grid = '';
  [0, 50, 100].forEach(g => {
    const gy = padTop + chartH - (g / maxVal) * chartH;
    grid += `<line x1="${padLeft}" y1="${gy.toFixed(1)}" x2="${w - padRight}" y2="${gy.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`;
    grid += `<text x="${padLeft - 4}" y="${(gy + 3).toFixed(1)}" font-size="8" fill="#94a3b8" text-anchor="end">${g}</text>`;
  });

  let bars = '';
  items.forEach((it, i) => {
    const x = padLeft + i * (barW + barGap);
    const applicable = it.value !== null;
    const val = applicable ? it.value : 0;
    const barH = Math.max(applicable ? 2 : 0, (val / maxVal) * chartH);
    const y = padTop + (chartH - barH);
    const color = !applicable ? '#e2e8f0' : val >= 80 ? '#10b981' : val >= 50 ? '#f59e0b' : '#ef4444';
    // Animated grow-in from the baseline — transform-box:fill-box lets a
    // plain scaleY animate correctly around each bar's own bottom edge.
    bars += `<rect class="tr-bar" style="animation-delay:${i * 35}ms" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${color}"><title>${_trEsc(it.label)}: ${applicable ? val + '%' : 'n/a'}</title></rect>`;
    if (applicable) {
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="9" fill="#1e293b" text-anchor="middle" font-weight="600">${val}%</text>`;
    }
    bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(padTop + chartH + 12).toFixed(1)}" font-size="9" fill="#64748b" text-anchor="middle">${_trEsc(it.label)}</text>`;
  });

  return `
    <style>
      @keyframes trBarGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
      .tr-bar { transform-box: fill-box; transform-origin: bottom; animation: trBarGrow .5s ease-out backwards; }
    </style>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px;display:block;">${grid}${bars}</svg>`;
}

function _trRenderLineChart(items, opts) {
  opts = opts || {};
  const w = opts.width || 640, h = opts.height || 160;
  const padLeft = 28, padBottom = 20, padTop = 18, padRight = 12;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;
  const n = items.length;
  const maxVal = 100;
  const stepX = n > 1 ? chartW / (n - 1) : 0;

  let grid = '';
  [0, 50, 100].forEach(g => {
    const gy = padTop + chartH - (g / maxVal) * chartH;
    grid += `<line x1="${padLeft}" y1="${gy.toFixed(1)}" x2="${w - padRight}" y2="${gy.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`;
    grid += `<text x="${padLeft - 4}" y="${(gy + 3).toFixed(1)}" font-size="8" fill="#94a3b8" text-anchor="end">${g}</text>`;
  });

  const points = items.map((it, i) => ({
    x: padLeft + i * stepX,
    y: padTop + chartH - ((it.value || 0) / maxVal) * chartH,
    ...it
  }));
  const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');

  const dots = points.map((p, i) => `
    <circle class="tr-dot" style="animation-delay:${600 + i * 60}ms" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="#0F766E"><title>${_trEsc(p.label)}: ${p.value}%</title></circle>
    <text x="${p.x.toFixed(1)}" y="${(padTop + chartH + 14).toFixed(1)}" font-size="9" fill="#64748b" text-anchor="middle">${_trEsc(p.label)}</text>
    <text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" font-size="9" fill="#1e293b" text-anchor="middle" font-weight="600">${p.value}%</text>
  `).join('');

  // Classic SVG "draw the line" trick: a dasharray longer than the path,
  // animated from a large offset down to 0, with no need to measure the
  // actual path length at runtime.
  return `
    <style>
      @keyframes trLineDraw { from { stroke-dashoffset: 2000; } to { stroke-dashoffset: 0; } }
      @keyframes trDotPop { from { opacity: 0; transform: scale(0); } to { opacity: 1; transform: scale(1); } }
      .tr-line-draw { stroke-dasharray: 2000; animation: trLineDraw 1.1s ease-out forwards; }
      .tr-dot { transform-box: fill-box; transform-origin: center; opacity: 0; animation: trDotPop .35s ease-out forwards; }
    </style>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px;display:block;">${grid}<path class="tr-line-draw" d="${pathD}" fill="none" stroke="#0F766E" stroke-width="2"/>${dots}</svg>`;
}

// Animated donut chart — used for Paid/Pending in Analytics and the risk
// split in Predictions. Pure SVG (stroke-dasharray segments), pops in with a
// CSS animation on insert so no chart library or JS timing hacks are needed.
function _trRenderDonutChart(segments, opts) {
  opts = opts || {};
  const size = opts.size || 150;
  const strokeWidth = opts.strokeWidth || 20;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0);

  let cumulative = 0;
  const arcs = segments.filter(s => s.value > 0).map(s => {
    const frac = total > 0 ? s.value / total : 0;
    const dash = frac * circumference;
    const gap = circumference - dash;
    const offset = -cumulative;
    cumulative += dash;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${strokeWidth}" stroke-dasharray="${dash.toFixed(1)} ${gap.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"><title>${_trEsc(s.label)}: ${s.value} (${Math.round(frac * 100)}%)</title></circle>`;
  }).join('');

  const centerLabel = opts.centerLabel != null ? opts.centerLabel : total;
  const legend = segments.map(s => `
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#475569;">
      <span style="width:10px;height:10px;border-radius:3px;background:${s.color};display:inline-block;flex-shrink:0;"></span>
      ${_trEsc(s.label)} <span style="color:#94a3b8;">(${s.value})</span>
    </div>`).join('');

  return `
    <style>
      @keyframes trDonutPop { 0% { transform: scale(.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      .tr-donut-anim { transform-box: fill-box; transform-origin: center; animation: trDonutPop .55s cubic-bezier(.34,1.56,.64,1) both; }
    </style>
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <g class="tr-donut-anim">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="${strokeWidth}"/>
          ${arcs}
          <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="22" font-weight="700" fill="#1e293b">${centerLabel}</text>
        </g>
      </svg>
      <div style="display:flex;flex-direction:column;gap:8px;">${legend}</div>
    </div>
  `;
}

// Collection rate for every month of the currently selected year (respects
// the Type filter, matches whatever's already on screen elsewhere).
function _trMonthlyRatesForSelectedYear() {
  const members = trackerModuleState.allMembers || [];
  const filteredContribs = _trackerFilteredContribs();
  return TRACKER_MONTH_NAMES.map(monthName => {
    const { paid, pending } = _trackerSplitPaidPending(members, filteredContribs, monthName);
    const total = paid.length + pending.length;
    return { label: monthName.slice(0, 3), value: total > 0 ? Math.round(paid.length / total * 100) : null, paid: paid.length, total };
  });
}

// Collection rate per year across the WHOLE project's history — independent
// of the Year filter, since the point here is the multi-year trend, not one
// selected year. Only years with at least one applicable member-month are
// kept (skips years before the group existed / after everyone went inactive).
function _trYearlyCollectionStats() {
  const members = trackerModuleState.allMembers || [];
  const type = trackerModuleState.filters.type;
  const allContribs = trackerModuleState.yearContribs || [];

  const yearsSet = new Set(allContribs.map(c => Number(c.Year)).filter(y => !isNaN(y)));
  yearsSet.add(new Date().getFullYear());
  const years = Array.from(yearsSet).sort((a, b) => a - b);

  return years.map(y => {
    let contribs = allContribs.filter(c =>
      String(c.Year) === String(y) && !String(c.UserId).startsWith('WALKIN_')
    );
    if (type) {
      contribs = contribs.filter(c => {
        const cType = (c.TypeId !== undefined && c.TypeId !== null) ? c.TypeId : c.Type;
        return String(cType) === String(type);
      });
    }
    let paidTotal = 0, applicableTotal = 0;
    TRACKER_MONTH_NAMES.forEach(monthName => {
      const { paid, pending } = _trackerSplitPaidPending(members, contribs, monthName, y);
      paidTotal += paid.length;
      applicableTotal += paid.length + pending.length;
    });
    return { year: y, rate: applicableTotal > 0 ? Math.round(paidTotal / applicableTotal * 100) : null, applicableTotal };
  }).filter(r => r.applicableTotal > 0);
}

// Naive next-year projection: average year-over-year change in collection
// rate, applied to the latest year. Good enough to flag "trending down" —
// not a real forecasting model, and the label makes that clear.
function _trProjectNextYear(yearlyStats) {
  if (yearlyStats.length < 2) return null;
  const deltas = [];
  for (let i = 1; i < yearlyStats.length; i++) {
    if (yearlyStats[i].rate != null && yearlyStats[i - 1].rate != null) {
      deltas.push(yearlyStats[i].rate - yearlyStats[i - 1].rate);
    }
  }
  if (deltas.length === 0) return null;
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const lastRate = yearlyStats[yearlyStats.length - 1].rate;
  const projected = Math.max(0, Math.min(100, Math.round(lastRate + avgDelta)));
  const trend = avgDelta > 2 ? 'Improving' : avgDelta < -2 ? 'Declining' : 'Steady';
  return { projected, avgDelta: Math.round(avgDelta), trend, nextYear: yearlyStats[yearlyStats.length - 1].year + 1 };
}

// Collection rate per contribution Type, for the selected year — only
// meaningful (and only rendered) when the app actually has more than one
// Type configured. Reads the same global `types` list populateTrackerDropdowns()
// already uses, so it stays in sync with however Types are actually named.
function _trTypeBreakdownForSelectedYear() {
  if (typeof types === 'undefined' || !types || types.length <= 1) return null;

  const members = trackerModuleState.allMembers || [];
  const year = trackerModuleState.filters.year;
  const yearContribs = (trackerModuleState.yearContribs || []).filter(c =>
    String(c.Year) === String(year) && !String(c.UserId).startsWith('WALKIN_')
  );

  return types.map(t => {
    const typeId = t.TypeId || t.type_id || t;
    const typeName = t.TypeName || t.type_name || String(t);
    const contribs = yearContribs.filter(c => {
      const cType = (c.TypeId !== undefined && c.TypeId !== null) ? c.TypeId : c.Type;
      return String(cType) === String(typeId);
    });
    let paidTotal = 0, applicableTotal = 0;
    TRACKER_MONTH_NAMES.forEach(monthName => {
      const { paid, pending } = _trackerSplitPaidPending(members, contribs, monthName, year);
      paidTotal += paid.length;
      applicableTotal += paid.length + pending.length;
    });
    return { label: typeName, value: applicableTotal > 0 ? Math.round(paidTotal / applicableTotal * 100) : null };
  });
}

// ═══ CALENDAR ═══

// NOTE: contribution records only carry Year + ForMonth (a month name) —
// there's no day-level payment date anywhere in the data model (checked
// admin-core.js and admin.html; no PaidDate/PaymentDate/Timestamp field on
// contributions). So a literal day-grid calendar isn't something this data
// can support honestly. This instead shows a month-by-month heatmap for the
// selected year — collection rate + paid/total per month, click to jump
// straight to that month in Overview. If day-level payment dates get added
// to the data later, this is the function to extend into a real day grid.
function renderTrackerCalendar() {
  const container = document.getElementById('tracker_calendar_content');
  if (!container) return;

  const filteredContribs = trackerModuleState.yearContribs || [];
  const allMembers = trackerModuleState.allMembers || [];
  const selMonth = document.getElementById('tr_month_select_global')?.value;
  const selYear = trackerModuleState.filters.year;

  if (!selMonth) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;">Select a month from global filters to view calendar</div>';
    return;
  }

  const monthIdx = parseInt(selMonth) - 1;
  const monthName = TRACKER_MONTH_NAMES[monthIdx];

  // Get first day of month and number of days
  const firstDay = new Date(selYear, monthIdx, 1).getDay();
  const lastDay = new Date(selYear, monthIdx + 1, 0).getDate();

  // Group contributions by day using PaymentDate
  const dayCollections = {};
  for (let d = 1; d <= lastDay; d++) {
    dayCollections[d] = [];
  }

  filteredContribs.forEach(c => {
    if (Number(c.Year) === Number(selYear)) {
      // Extract day from PaymentDate (DD-MM-YYYY format)
      let day = null;
      if (c.PaymentDate) {
        const dateMatch = String(c.PaymentDate).match(/^(\d{2})-(\d{2})-(\d{4})/);
        if (dateMatch) {
          const parsedDay = parseInt(dateMatch[1]);
          const parsedMonth = parseInt(dateMatch[2]);
          const parsedYear = parseInt(dateMatch[3]);
          // Check if payment date is in the selected month/year
          if (parsedDay >= 1 && parsedDay <= lastDay && parsedMonth === (monthIdx + 1) && parsedYear === Number(selYear)) {
            day = parsedDay;
          }
        }
      }

      if (day !== null) {
        const memberName = allMembers.find(m => String(m.UserId) === String(c.UserId))?.Name || 'Unknown';
        dayCollections[day].push(memberName);
      }
    }
  });

  // Apply type filter if selected
  const typeFilter = trackerModuleState.filters.type;
  if (typeFilter) {
    Object.keys(dayCollections).forEach(day => {
      const contributions = filteredContribs.filter(c => {
        if (Number(c.Year) !== Number(selYear)) return false;
        if (c.PaymentDate) {
          const dateMatch = String(c.PaymentDate).match(/^(\d{2})-(\d{2})-(\d{4})/);
          if (dateMatch) {
            const parsedDay = parseInt(dateMatch[1]);
            const parsedMonth = parseInt(dateMatch[2]);
            const parsedYear = parseInt(dateMatch[3]);
            return parsedDay === parseInt(day) && parsedMonth === (monthIdx + 1) && parsedYear === Number(selYear);
          }
        }
        return false;
      });
      dayCollections[day] = dayCollections[day].filter(name => {
        return contributions.some(c => {
          const cType = (c.TypeId !== undefined && c.TypeId !== null) ? c.TypeId : c.Type;
          return String(cType) === String(typeFilter) && allMembers.find(m => String(m.UserId) === String(c.UserId))?.Name === name;
        });
      });
    });
  }

  // Build calendar header
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let calendarHtml = `
    <div class="tr-cal-wrap">
      <h4 class="tr-cal-title">${monthName} ${selYear}</h4>

      <div class="tr-cal-grid tr-cal-headrow">
        ${dayNames.map(d => `<div class="tr-cal-headcell">${d}</div>`).join('')}
      </div>

      <div class="tr-cal-grid tr-cal-days">
  `;

  // Empty cells for days before month starts
  for (let i = 0; i < firstDay; i++) {
    calendarHtml += `<div class="tr-cal-cell tr-cal-cell-empty"></div>`;
  }

  // Days of month
  for (let day = 1; day <= lastDay; day++) {
    const collections = dayCollections[day] || [];
    const count = collections.length;
    
    // Color coding based on collection count
    let bgColor = '#fff';
    let textColor = '#94a3b8';
    let countColor = '#64748b';

    if (count === 0) {
      bgColor = '#fff';
      textColor = '#cbd5e1';
      countColor = '#cbd5e1';
    } else if (count <= 2) {
      bgColor = '#fef3c7';
      textColor = '#92400e';
      countColor = '#b45309';
    } else if (count <= 5) {
      bgColor = '#dbeafe';
      textColor = '#1e40af';
      countColor = '#1e3a8a';
    } else {
      bgColor = '#bbf7d0';
      textColor = '#166534';
      countColor = '#0b5d33';
    }

    const tooltip = collections.length > 0 
      ? collections.join(', ')
      : 'No collections';

    // [FIX-MOBILE] title="" tooltips and onmouseover never fire on touch
    // devices, so this data was completely inaccessible on mobile before —
    // tapping a day did nothing. Now every cell also opens a modal with the
    // same info on click/tap, which works on both mobile and desktop.
    const _dayNamesJson = _trEsc(JSON.stringify(collections));
    calendarHtml += `
      <div class="tr-cal-cell" style="background:${bgColor};cursor:pointer;"
           onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)';"
           onmouseout="this.style.transform='scale(1)';this.style.boxShadow='none';"
           onclick="_trShowDayDetail(${day}, '${_trEsc(monthName)}', ${selYear}, '${_dayNamesJson}')"
           title="${_trEsc(tooltip)}">
        <div class="tr-cal-daynum" style="color:${textColor};">${day}</div>
        <div class="tr-cal-count" style="color:${countColor};">${count}</div>
        ${count > 0 ? `<div class="tr-cal-countlabel" style="color:${textColor};">${count} ${count === 1 ? 'member' : 'members'}</div>` : ''}
      </div>
    `;
  }

  calendarHtml += `
      </div>

      <div class="tr-cal-legend">
        <strong>Legend:</strong><br>
        🟡 1-2 members paid | 🔵 3-5 members paid | 🟢 6+ members paid<br>
        <em>Hover over any day to see member names who paid</em>
      </div>
    </div>
  `;

  container.innerHTML = calendarHtml;
}

// ═══ ANALYTICS ═══

function renderTrackerAnalytics() {
  const container = document.getElementById('tracker_analytics_content');
  if (!container) return;

  const paid = (trackerModuleState.paidMembers || []).length;
  const pending = (trackerModuleState.pendingMembers || []).length;
  const total = paid + pending;
  const rate = total > 0 ? Math.round((paid / total) * 100) : 0;
  const selYear = trackerModuleState.filters.year;

  const monthlyRates = _trMonthlyRatesForSelectedYear();
  const yearlyStats = _trYearlyCollectionStats();
  const typeBreakdown = _trTypeBreakdownForSelectedYear();

  // USER-WISE CHART ADDON
  const allMembers = trackerModuleState.allMembers || [];
  const contribs = trackerModuleState.yearContribs || [];

  // Filter contributions by selected filters
  let filteredContribs = contribs;
  
  const typeSelect = document.getElementById('tr_type_filter');
  const selectedType = typeSelect?.value || '';
  
  if (selectedType) {
    filteredContribs = filteredContribs.filter(c => c.Type === selectedType);
  }
  
  if (selYear) {
    filteredContribs = filteredContribs.filter(c => Number(c.Year) === Number(selYear));
  }

  // Calculate user-wise contribution counts
  const userStats = {};
  allMembers.forEach(m => {
    userStats[String(m.UserId)] = {
      name: m.Name,
      mobile: m.Mobile,
      count: 0
    };
  });

  filteredContribs.forEach(c => {
    const userId = String(c.UserId);
    if (userStats[userId]) {
      userStats[userId].count++;
    }
  });

  const userArray = Object.values(userStats)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10 users

  const maxCount = userArray.length > 0 ? Math.max(...userArray.map(u => u.count)) : 0;

  let userChartHtml = '';
  if (userArray.length > 0) {
    userChartHtml = `
    <div style="background:#f8fafc;border-radius:8px;padding:16px;border:1px solid #e2e8f0;margin-bottom:16px;">
      <h4 style="margin:0 0 16px 0;font-size:12px;font-weight:600;color:#1e293b;text-transform:uppercase;">👥 User-Wise Contributions</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;">
        ${userArray.map((user, idx) => {
          const percentage = maxCount > 0 ? (user.count / maxCount) * 100 : 0;
          const colors = ['#0F766E', '#0d9488', '#0891b2', '#0369a1', '#2563eb', '#7c3aed', '#d946ef', '#ec4899', '#f43f5e', '#f97316'];
          const color = colors[idx % colors.length];
          return `
            <div style="background:#fff;border-radius:6px;padding:12px;border:1px solid #e2e8f0;text-align:center;">
              <div style="font-size:10px;font-weight:600;color:#1e293b;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${user.name}">${user.name}</div>
              <div style="height:50px;background:${color};border-radius:4px;margin:8px 0;display:flex;align-items:center;justify-content:center;">
                <div style="color:#fff;font-size:14px;font-weight:700;">${user.count}</div>
              </div>
              <div style="font-size:9px;color:#64748b;">${percentage.toFixed(0)}% of max</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    `;
  }

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
      <div style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:12px;color:#166534;font-weight:600;">Collection Rate</div>
        <div style="font-size:24px;font-weight:700;color:#0b5d33;">${rate}%</div>
      </div>
      <div style="background:linear-gradient(135deg,#fee2e2,#fecaca);border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:12px;color:#991b1b;font-weight:600;">Pending</div>
        <div style="font-size:24px;font-weight:700;color:#7f1d1d;">${pending}</div>
      </div>
      <div style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:12px;color:#166534;font-weight:600;">Paid</div>
        <div style="font-size:24px;font-weight:700;color:#0b5d33;">${paid}</div>
      </div>
      <div style="background:linear-gradient(135deg,#e0e7ff,#c7d2fe);border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:12px;color:#3730a3;font-weight:600;">Total</div>
        <div style="font-size:24px;font-weight:700;color:#4c1d95;">${total}</div>
      </div>
    </div>

    ${userChartHtml}

    <div style="background:#f8fafc;border-radius:8px;padding:16px;border:1px solid #e2e8f0;margin-bottom:16px;">
      <h4 style="margin:0 0 12px 0;font-size:12px;font-weight:600;color:#1e293b;text-transform:uppercase;">Paid vs Pending — ${trackerModuleState.currentMonth} ${selYear}</h4>
      ${total > 0
        ? _trRenderDonutChart(
            [{ label: 'Paid', value: paid, color: '#10b981' }, { label: 'Pending', value: pending, color: '#ef4444' }],
            { centerLabel: rate + '%' }
          )
        : '<div style="padding:16px;text-align:center;color:#94a3b8;font-size:11px;">No applicable members for this month.</div>'
      }
    </div>

    <div style="background:#f8fafc;border-radius:8px;padding:16px;border:1px solid #e2e8f0;margin-bottom:16px;">
      <h4 style="margin:0 0 12px 0;font-size:12px;font-weight:600;color:#1e293b;text-transform:uppercase;">Monthly Collection Rate — ${selYear}</h4>
      ${_trRenderBarChart(monthlyRates)}
    </div>

    ${typeBreakdown ? `
      <div style="background:#f8fafc;border-radius:8px;padding:16px;border:1px solid #e2e8f0;margin-bottom:16px;">
        <h4 style="margin:0 0 12px 0;font-size:12px;font-weight:600;color:#1e293b;text-transform:uppercase;">Collection Rate by Type — ${selYear}</h4>
        ${_trRenderBarChart(typeBreakdown)}
      </div>
    ` : ''}

    <div style="background:#f8fafc;border-radius:8px;padding:16px;border:1px solid #e2e8f0;">
      <h4 style="margin:0 0 12px 0;font-size:12px;font-weight:600;color:#1e293b;text-transform:uppercase;">Collection Rate by Year — Whole Project</h4>
      ${yearlyStats.length >= 2
        ? _trRenderLineChart(yearlyStats.map(y => ({ label: String(y.year), value: y.rate })))
        : '<div style="padding:16px;text-align:center;color:#94a3b8;font-size:11px;">Need at least 2 years of data to show a trend.</div>'
      }
    </div>
  `;
}

// ═══ LEADERBOARD ═══

function renderTrackerLeaderboard() {
  const container = document.getElementById('tracker_leaderboard_content');
  if (!container) return;

  // FIX: m.YearAmount never existed on member records (always undefined,
  // hence everyone showing ₹0) — use the totals computed in runTrackerMain()
  // from actual contribution records instead.
  const amounts = trackerModuleState.memberYearAmounts || {};
  const members = (trackerModuleState.allMembers || [])
    .map(m => ({ member: m, amount: amounts[String(m.UserId)] || 0 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  container.innerHTML = `
    <div style="background:#f8fafc;border-radius:8px;padding:16px;border:1px solid #e2e8f0;">
      <h4 style="margin:0 0 12px 0;font-size:12px;font-weight:600;color:#1e293b;">🏆 Top Contributors</h4>
      ${members.map(({ member: m, amount }, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:#fff;border-radius:6px;margin-bottom:8px;">
          <div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#0F766E,#14b8a6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0;">${i+1}</div>
          ${_avatarHtml(m, 32)}
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:12px;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_trEsc(m.Name) || '—'}</div>
            <div style="font-size:11px;color:#64748b;">₹${amount}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(container);
}

// ═══ PREDICTIONS ═══

// FIX: this whole tab was dead — it filtered on m.RiskLevel, but nothing in
// the app ever set that field on a member, so highRisk/mediumRisk/lowRisk
// were always 0. Replaced with a real calculation: for each member, walk
// backward from the current (or most recent applicable) month within the
// selected year and count consecutive unpaid months, using the same
// start-date/inactive-freeze logic (_trEffectiveStart) and filtered
// contributions (_trackerFilteredContribs) the rest of the tracker already
// relies on, so this can't drift out of sync with the grid/analytics either.
// Inactive members and members who haven't started yet this year are
// excluded — this tab is about members still active but trending toward
// missing payments, not members who've already left.
function _trComputeRiskLevel(member, contribs) {
  if (_trIsInactive(member)) return null;

  const start = _trEffectiveStart(member);
  const selYearNum = Number(trackerModuleState.filters.year);
  const now = new Date();
  const curYM = _trYM(now.getFullYear(), now.getMonth());

  let consecutiveMissed = 0;
  let hasApplicableMonth = false;

  for (let i = 11; i >= 0; i--) {
    const ym = _trYM(selYearNum, i);
    if (ym > curYM) continue; // future month — not applicable yet
    if (start && ym < _trYM(start.y, start.m)) break; // before this member's start — stop walking back
    hasApplicableMonth = true;
    const paid = contribs.some(c =>
      String(c.UserId) === String(member.UserId) && c.ForMonth === TRACKER_MONTH_NAMES[i]
    );
    if (paid) break; // most recent applicable month they paid — streak ends here
    consecutiveMissed++;
  }

  if (!hasApplicableMonth) return null; // hasn't started yet this year
  if (consecutiveMissed === 0) return 'Low';
  if (consecutiveMissed === 1) return 'Medium';
  return 'High';
}

function renderTrackerPredictions() {
  const container = document.getElementById('tracker_predictions_content');
  if (!container) return;

  const members = trackerModuleState.allMembers || [];
  const contribs = _trackerFilteredContribs();

  let highRisk = 0, mediumRisk = 0, lowRisk = 0;
  const flagged = []; // High/Medium members, for the list below the cards

  members.forEach(m => {
    const level = _trComputeRiskLevel(m, contribs);
    if (level === 'High') { highRisk++; flagged.push({ member: m, level }); }
    else if (level === 'Medium') { mediumRisk++; flagged.push({ member: m, level }); }
    else if (level === 'Low') lowRisk++;
  });

  // Worst-first
  flagged.sort((a, b) => (a.level === b.level) ? 0 : (a.level === 'High' ? -1 : 1));

  const levelStyle = {
    High: { bg: '#fee2e2', fg: '#7f1d1d', label: '⚠ High' },
    Medium: { bg: '#fef3c7', fg: '#92400e', label: '⚡ Medium' }
  };

  // Whole-project, multi-year view — this tracker runs across many years, so
  // "predict" here means the year-over-year trend and a naive next-year
  // projection, not just this month's snapshot.
  const yearlyStats = _trYearlyCollectionStats();
  const projection = _trProjectNextYear(yearlyStats);
  const trendStyle = {
    Improving: { bg: '#dcfce7', fg: '#166534' },
    Declining: { bg: '#fee2e2', fg: '#991b1b' },
    Steady: { bg: '#f1f5f9', fg: '#475569' }
  };

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
      <div style="background:linear-gradient(135deg,#fee2e2,#fecaca);border-radius:8px;padding:16px;text-align:center;border:1px solid #fecaca;">
        <div style="font-size:12px;color:#991b1b;font-weight:600;">⚠ High Risk</div>
        <div style="font-size:24px;font-weight:700;color:#7f1d1d;">${highRisk}</div>
      </div>
      <div style="background:linear-gradient(135deg,#fef3c7,#fcd34d);border-radius:8px;padding:16px;text-align:center;border:1px solid #fcd34d;">
        <div style="font-size:12px;color:#92400e;font-weight:600;">⚡ Medium Risk</div>
        <div style="font-size:24px;font-weight:700;color:#b45309;">${mediumRisk}</div>
      </div>
      <div style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);border-radius:8px;padding:16px;text-align:center;border:1px solid #bbf7d0;">
        <div style="font-size:12px;color:#166534;font-weight:600;">✓ Low Risk</div>
        <div style="font-size:24px;font-weight:700;color:#0b5d33;">${lowRisk}</div>
      </div>
    </div>

    <div style="background:#f8fafc;border-radius:8px;padding:16px;border:1px solid #e2e8f0;margin-bottom:16px;">
      <h4 style="margin:0 0 12px 0;font-size:12px;font-weight:600;color:#1e293b;text-transform:uppercase;">Risk Distribution — Active Members</h4>
      ${(highRisk + mediumRisk + lowRisk) > 0
        ? _trRenderDonutChart([
            { label: 'High', value: highRisk, color: '#ef4444' },
            { label: 'Medium', value: mediumRisk, color: '#f59e0b' },
            { label: 'Low', value: lowRisk, color: '#10b981' }
          ])
        : '<div style="padding:16px;text-align:center;color:#94a3b8;font-size:11px;">No active members with applicable months yet.</div>'
      }
    </div>

    <div style="background:#f8fafc;border-radius:8px;padding:16px;border:1px solid #e2e8f0;">
      <h4 style="margin:0 0 12px 0;font-size:12px;font-weight:600;color:#1e293b;text-transform:uppercase;">Members to follow up with</h4>
      ${flagged.length === 0
        ? '<div style="padding:8px;text-align:center;color:#64748b;font-size:12px;">No active members currently trending toward missed payments.</div>'
        : flagged.map(({ member: m, level }) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:#fff;border-radius:6px;margin-bottom:8px;border-left:3px solid ${levelStyle[level].fg};">
            <div style="display:flex;align-items:center;gap:10px;min-width:0;">
              ${_avatarHtml(m, 30)}
              <div style="min-width:0;">
                <div style="font-weight:600;font-size:12px;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_trEsc(m.Name) || '—'}</div>
                <div style="font-size:10px;color:#64748b;">${_trEsc(m.Mobile) || '—'}</div>
              </div>
            </div>
            <div style="font-size:11px;font-weight:600;padding:4px 8px;border-radius:4px;background:${levelStyle[level].bg};color:${levelStyle[level].fg};flex-shrink:0;">${levelStyle[level].label}</div>
          </div>
        `).join('')
      }
    </div>

    <div style="background:#f8fafc;border-radius:8px;padding:16px;border:1px solid #e2e8f0;margin-top:16px;">
      <h4 style="margin:0 0 12px 0;font-size:12px;font-weight:600;color:#1e293b;text-transform:uppercase;">Collection Rate — Whole Project, Year by Year</h4>
      ${yearlyStats.length >= 2
        ? `${_trRenderLineChart(yearlyStats.map(y => ({ label: String(y.year), value: y.rate })))}
           ${projection ? `
            <div style="margin-top:12px;padding:12px;border-radius:8px;background:${trendStyle[projection.trend].bg};display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <div style="font-size:12px;color:${trendStyle[projection.trend].fg};">
                <strong>${projection.trend}</strong> trend — averaging ${projection.avgDelta >= 0 ? '+' : ''}${projection.avgDelta}%/year
              </div>
              <div style="font-size:12px;color:${trendStyle[projection.trend].fg};">
                Projected ${projection.nextYear}: <strong>${projection.projected}%</strong>
              </div>
            </div>
            <div style="margin-top:8px;font-size:10px;color:#94a3b8;">Simple trend projection from past years' data — not a guarantee, just a heads-up if collection is drifting down.</div>
           ` : ''}`
        : '<div style="padding:8px;text-align:center;color:#94a3b8;font-size:11px;">Need at least 2 years of data for a whole-project trend.</div>'
      }
    </div>
  `;
  if (window._lazyLoadDriveImgs) window._lazyLoadDriveImgs(container);
}

// ═══ INITIALIZATION ═══

// Single source of truth for pulling live data into the tracker and
// re-rendering. Every caller (the init poll below, and the admin-core.js
// refresh hooks) should call THIS instead of duplicating the copy logic —
// that duplication is exactly what caused the last two bugs to slip through.
function refreshTrackerData() {
  const liveUsers = (typeof users !== 'undefined' && users.length > 0)
    ? users
    : (window.allUsers && window.allUsers.length > 0 ? window.allUsers : null);
  const liveContribs = (typeof data !== 'undefined' && data.length > 0)
    ? data
    : (window.allContributions && window.allContributions.length > 0 ? window.allContributions : null);

  // FIX: old tracker always excluded the Admin account from the member list
  // (users.filter(u => u.Role !== "Admin")); the new version was including it.
  if (liveUsers) trackerModuleState.allMembers = liveUsers.filter(u => u.Role !== 'Admin');
  if (liveContribs) trackerModuleState.yearContribs = liveContribs;
  // FIX: was gated behind "types must already be loaded", which meant the
  // Year and Month dropdown defaults never got set if Type data happened to
  // arrive later. populateTrackerDropdowns() already guards its own Type
  // section internally, so it's safe to always call.
  populateTrackerDropdowns();

  if (trackerModuleState.allMembers.length > 0) {
    // Apply the default global filters (month, year, type)
    applyGlobalTrackerFilters();
    updateTrackerEmailPreview();
    return true;
  }
  return false;
}
window.refreshTrackerData = refreshTrackerData;

function initTrackerModule() {

  // Try immediately in case data is already there
  if (refreshTrackerData()) return;

  // Otherwise keep polling until the backend data actually arrives.
  const maxWaitMs = 20000;
  const pollEveryMs = 300;
  let waited = 0;

  const poll = setInterval(() => {
    if (refreshTrackerData()) {
      clearInterval(poll);
      return;
    }
    waited += pollEveryMs;
    if (waited >= maxWaitMs) {
      clearInterval(poll);
      console.warn('✗ Tracker: user data never became available after 20s');
    }
  }, pollEveryMs);
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTrackerModule);
} else {
  initTrackerModule();
}