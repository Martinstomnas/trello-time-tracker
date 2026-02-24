/**
 * connector.js – Registers the Time Tracker Power-Up with Trello.
 *
 * IMPORTANT: This file must NOT use ES module imports because it runs
 * directly in the Trello iframe context via a <script type="module"> tag.
 * In Vite dev mode, module imports trigger HMR client injection which can
 * interfere with TrelloPowerUp initialization timing.
 *
 * All helper functions are inlined here to avoid import issues.
 */

// Base URL – in dev this is the ngrok/localhost URL
var BASE = window.location.origin;

// ---------------------------------------------------------------------------
// Storage helpers (inlined to avoid import issues in connector context)
// ---------------------------------------------------------------------------

var TRACKING_KEY = 'timeTracking';

function getCardTimeData(t) {
  return t.get('card', 'shared', TRACKING_KEY)
    .then(function(data) { return data || {}; })
    .catch(function() { return {}; });
}

function formatDuration(ms, short) {
  if (!ms || ms < 0) return short ? '0m' : '0m 0s';
  var totalSeconds = Math.floor(ms / 1000);
  var hours = Math.floor(totalSeconds / 3600);
  var minutes = Math.floor((totalSeconds % 3600) / 60);
  var seconds = totalSeconds % 60;

  if (short) {
    if (hours > 0) return hours + 't ' + minutes + 'm';
    if (minutes > 0) return minutes + 'm';
    return seconds + 's';
  }
  var parts = [];
  if (hours > 0) parts.push(hours + 't');
  if (minutes > 0) parts.push(minutes + 'm');
  if (seconds > 0 || parts.length === 0) parts.push(seconds + 's');
  return parts.join(' ');
}

function getTotalWithActive(memberData) {
  if (!memberData) return 0;
  var total = memberData.totalMs || 0;
  if (memberData.activeStart) {
    total += Date.now() - memberData.activeStart;
  }
  return total;
}

function cardTotalMs(timeData) {
  var sum = 0;
  var values = Object.values(timeData);
  for (var i = 0; i < values.length; i++) {
    sum += getTotalWithActive(values[i]);
  }
  return sum;
}

function hasActiveTimer(timeData) {
  var values = Object.values(timeData);
  for (var i = 0; i < values.length; i++) {
    if (values[i].activeStart != null) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Initialize Power-Up
// ---------------------------------------------------------------------------

console.log('[TimeTracker] Connector loading, BASE =', BASE);

if (!window.TrelloPowerUp) {
  console.error('[TimeTracker] FATAL: window.TrelloPowerUp not found!');
} else {
  console.log('[TimeTracker] TrelloPowerUp found, initializing...');

  window.TrelloPowerUp.initialize(
    {
      // ── Card Badges (front of card in board view) ───────────
      'card-badges': function(t) {
        return getCardTimeData(t).then(function(data) {
          var total = cardTotalMs(data);
          var active = hasActiveTimer(data);
          if (total === 0 && !active) return [];
          return [{
            icon: BASE + '/clock-icon.svg',
            text: formatDuration(total, true),
            color: active ? 'red' : 'green',
            refresh: 30,
          }];
        }).catch(function(e) {
          console.error('[TimeTracker] card-badges error:', e);
          return [];
        });
      },

      // ── Card Detail Badges (inside card view) ──────────────
      'card-detail-badges': function(t) {
        return getCardTimeData(t).then(function(data) {
          var total = cardTotalMs(data);
          var active = hasActiveTimer(data);
          if (total === 0 && !active) return [];
          return [{
            title: 'Tid sporet',
            text: formatDuration(total, false),
            color: active ? 'red' : 'green',
            callback: function(tc) {
              return tc.popup({
                title: 'Tidstracker',
                url: BASE + '/timer.html',
                height: 400,
              });
            },
          }];
        }).catch(function(e) {
          console.error('[TimeTracker] card-detail-badges error:', e);
          return [];
        });
      },

      // ── Card Buttons (sidebar in card detail) ──────────────
      'card-buttons': function(t) {
        return [{
          icon: BASE + '/clock-icon.svg',
          text: 'Tidstracker',
          callback: function(tc) {
            return tc.popup({
              title: 'Tidstracker',
              url: BASE + '/timer.html',
              height: 460,
            });
          },
        }];
      },

      // ── Board Buttons (board header bar) ───────────────────
      'board-buttons': function(t) {
        return [{
          icon: BASE + '/clock-icon.svg',
          text: 'Tidsrapport',
          callback: function(tc) {
            return tc.modal({
              title: 'Tidsrapport – Hele boardet',
              url: BASE + '/report.html',
              fullscreen: true,
            });
          },
        }];
      },

      // ── Settings ───────────────────────────────────────────
      'show-settings': function(t) {
        return t.popup({
          title: 'Tidstracker – Innstillinger',
          url: BASE + '/settings.html',
          height: 300,
        });
      },
    },
    {
      appKey: '',
      appName: 'Time Tracker',
    }
  );

  console.log('[TimeTracker] Initialization complete!');
}
