/**
 * connector.js – Registers the Time Tracker Power-Up with Trello.
 *
 * This file runs as a plain script (no ES modules) so we use
 * fetch() against the Supabase REST API to read time data for badges.
 *
 * IMPORTANT: SUPABASE_URL and SUPABASE_KEY are replaced at build time
 * or must be set here manually for local dev. See instructions below.
 */

var BASE = window.location.origin;

// ── Supabase config ──────────────────────────────────────────────
// These will be set by the build-time injection script.
// For local dev, replace these values with your actual Supabase credentials.
var SUPABASE_URL = "%%VITE_SUPABASE_URL%%";
var SUPABASE_KEY = "%%VITE_SUPABASE_ANON_KEY%%";

// ---------------------------------------------------------------------------
// Supabase REST helpers (no SDK needed)
// ---------------------------------------------------------------------------

function supabaseGet(table, params) {
  var url = SUPABASE_URL + "/rest/v1/" + table + "?" + params;
  return fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
      Accept: "application/json",
    },
  })
    .then(function (res) {
      return res.json();
    })
    .catch(function (err) {
      console.error("[TimeTracker] Supabase fetch error:", err);
      return [];
    });
}

function getCardTimeData(cardId) {
  return Promise.all([
    supabaseGet(
      "time_entries",
      "select=member_id,member_name,duration_ms&card_id=eq." + cardId,
    ),
    supabaseGet(
      "active_timers",
      "select=member_id,member_name,started_at&card_id=eq." + cardId,
    ),
  ]).then(function (results) {
    var entries = results[0] || [];
    var actives = results[1] || [];
    var data = {};

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!data[e.member_id]) {
        data[e.member_id] = {
          name: e.member_name,
          totalMs: 0,
          activeStart: null,
        };
      }
      data[e.member_id].totalMs += e.duration_ms || 0;
    }

    for (var j = 0; j < actives.length; j++) {
      var a = actives[j];
      if (!data[a.member_id]) {
        data[a.member_id] = {
          name: a.member_name,
          totalMs: 0,
          activeStart: null,
        };
      }
      data[a.member_id].activeStart = new Date(a.started_at).getTime();
    }

    return data;
  });
}

function getCardEstimateTotal(cardId) {
  return supabaseGet(
    "time_estimates",
    "select=estimated_ms&card_id=eq." + cardId,
  ).then(function (estimates) {
    var total = 0;
    for (var i = 0; i < estimates.length; i++) {
      total += estimates[i].estimated_ms || 0;
    }
    return total;
  });
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDuration(ms, short) {
  if (!ms || ms < 0) return short ? "0m" : "0m 0s";
  var totalSeconds = Math.floor(ms / 1000);
  var hours = Math.floor(totalSeconds / 3600);
  var minutes = Math.floor((totalSeconds % 3600) / 60);
  var seconds = totalSeconds % 60;

  if (short) {
    if (hours > 0) return hours + "t " + minutes + "m";
    if (minutes > 0) return minutes + "m";
    return seconds + "s";
  }
  var parts = [];
  if (hours > 0) parts.push(hours + "t");
  if (minutes > 0) parts.push(minutes + "m");
  if (seconds > 0 || parts.length === 0) parts.push(seconds + "s");
  return parts.join(" ");
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

console.log("[TimeTracker] Connector loading, BASE =", BASE);
console.log(
  "[TimeTracker] Supabase URL =",
  SUPABASE_URL ? "configured" : "MISSING",
);

if (!window.TrelloPowerUp) {
  console.error("[TimeTracker] FATAL: window.TrelloPowerUp not found!");
} else {
  window.TrelloPowerUp.initialize(
    {
      "card-badges": function (t) {
        return t
          .card("id")
          .then(function (card) {
            return Promise.all([
              getCardTimeData(card.id),
              getCardEstimateTotal(card.id),
            ]).then(function (results) {
              var data = results[0];
              var estimateTotal = results[1];
              var total = cardTotalMs(data);
              var active = hasActiveTimer(data);

              var text =
                formatDuration(total, true) +
                " / " +
                (estimateTotal > 0
                  ? formatDuration(estimateTotal, true)
                  : "Ikke estimert");

              var color = null;
              if (active) {
                color = "green";
              } else if (estimateTotal > 0 && total > estimateTotal) {
                color = "red";
              }

              return [
                {
                  icon: BASE + "/clock-icon.svg",
                  text: text,
                  color: color,
                  refresh: 30,
                },
              ];
            });
          })
          .catch(function (e) {
            console.error("[TimeTracker] card-badges error:", e);
            return [];
          });
      },

      "card-detail-badges": function (t) {
        return t
          .card("id")
          .then(function (card) {
            return Promise.all([
              getCardTimeData(card.id),
              getCardEstimateTotal(card.id),
            ]).then(function (results) {
              var data = results[0];
              var estimateTotal = results[1];
              var total = cardTotalMs(data);
              var active = hasActiveTimer(data);

              var badges = [
                {
                  title: "Registrert tid",
                  text: formatDuration(total, false),
                  color: active ? "green" : null,
                  callback: function (tc) {
                    return tc.popup({
                      title: "Tidstracker",
                      url: BASE + "/timer.html",
                      height: 400,
                    });
                  },
                },
              ];

              var isOver = estimateTotal > 0 && total > estimateTotal;
              badges.push({
                title: "Estimert tid",
                text:
                  estimateTotal > 0
                    ? formatDuration(estimateTotal, false)
                    : "Ikke estimert",
                color: isOver ? "red" : null,
                callback: function (tc) {
                  return tc.popup({
                    title: "Tidsestimat",
                    url: BASE + "/estimate-card.html",
                    height: 400,
                  });
                },
              });

              return badges;
            });
          })
          .catch(function (e) {
            console.error("[TimeTracker] card-detail-badges error:", e);
            return [];
          });
      },

      "card-buttons": function (t) {
        return [
          {
            icon: BASE + "/clock-icon.svg",
            text: "Tidstracker",
            callback: function (tc) {
              return tc.popup({
                title: "Tidstracker",
                url: BASE + "/timer.html",
                height: 460,
              });
            },
          },
          {
            icon: BASE + "/clock-icon.svg",
            text: "Tidsestimat",
            callback: function (tc) {
              return tc.popup({
                title: "Tidsestimat",
                url: BASE + "/estimate-card.html",
                height: 400,
              });
            },
          },
        ];
      },

      "board-buttons": function (t) {
        return [
          {
            icon: BASE + "/clock-icon.svg",
            text: "Tidsrapport",
            callback: function (tc) {
              return tc.modal({
                title: "Tidsrapport",
                url: BASE + "/report.html",
                fullscreen: true,
              });
            },
          },
        ];
      },

      "show-settings": function (t) {
        return t.popup({
          title: "Tidstracker - Innstillinger",
          url: BASE + "/settings.html",
          height: 300,
        });
      },
    },
    { appKey: "", appName: "Time Tracker" },
  );

  console.log("[TimeTracker] Initialization complete!");
}
