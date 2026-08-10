// ════════════════════════════════════════════════════════════════════════════
// DEPRECATED — no longer loaded (see admin.html).
//
// This file's job was to expose the app's user/contribution data as
// window.allUsers / window.allContributions for the tracker. That fallback
// chain is now fully covered by refreshTrackerData() in admin-tracker.js,
// which checks the same identifiers (users/data → window.allUsers →
// window.users → window.members → window.USER_DATA) on its own. Nothing
// else in the codebase reads window.allUsers or window.allContributions, so
// this file was a second, slightly different copy of logic that already
// lived in admin-tracker.js — kept here only for reference in case that
// changes. Safe to delete once you're comfortable it's not needed.
// ════════════════════════════════════════════════════════════════════════════