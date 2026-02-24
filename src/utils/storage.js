/**
 * storage.js – Abstraction over Trello Power-Up storage.
 *
 * DATA MODEL
 * ----------
 * We store time-tracking data at the CARD level in "shared" scope so that
 * every board member can see everyone's tracked time.
 *
 * Key: "timeTracking"
 * Value: {
 *   [memberId: string]: {
 *     name: string,          // Display name of the member
 *     totalMs: number,       // Accumulated completed time in ms
 *     activeStart: number|null, // Timestamp (ms) when current session started, or null
 *   }
 * }
 *
 * Trello shared storage limit is 4096 chars per key per card.
 * This compact format keeps us well within limits for typical teams (< 20 members).
 *
 * SESSION HISTORY (optional, private scope per member):
 * Key: "timeSessions"
 * Value: [{ start: number, end: number, durationMs: number }]
 * Kept for detailed per-user history. Trimmed to last 50 entries to stay within limits.
 */

const TRACKING_KEY = 'timeTracking';
const SESSIONS_KEY = 'timeSessions';
const MAX_SESSIONS = 50;

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Get all time-tracking data for a card.
 * @param {object} t – Trello Power-Up client instance
 * @returns {Promise<Object>} { [memberId]: { name, totalMs, activeStart } }
 */
export async function getCardTimeData(t) {
  try {
    const data = await t.get('card', 'shared', TRACKING_KEY);
    return data || {};
  } catch {
    return {};
  }
}

/**
 * Get session history for the current member on a card.
 * @param {object} t
 * @returns {Promise<Array>}
 */
export async function getMySessions(t) {
  try {
    const data = await t.get('card', 'private', SESSIONS_KEY);
    return data || [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

/**
 * Start the timer for the current member on this card.
 * @param {object} t
 */
export async function startTimer(t) {
  const member = await t.member('id', 'fullName');
  const data = await getCardTimeData(t);

  const entry = data[member.id] || { name: member.fullName, totalMs: 0, activeStart: null };

  // Don't restart if already running
  if (entry.activeStart) return data;

  entry.name = member.fullName; // keep name in sync
  entry.activeStart = Date.now();
  data[member.id] = entry;

  await t.set('card', 'shared', TRACKING_KEY, data);
  return data;
}

/**
 * Stop the timer for the current member, accumulating elapsed time.
 * @param {object} t
 */
export async function stopTimer(t) {
  const member = await t.member('id', 'fullName');
  const data = await getCardTimeData(t);
  const entry = data[member.id];

  if (!entry || !entry.activeStart) return data;

  const elapsed = Date.now() - entry.activeStart;
  entry.totalMs = (entry.totalMs || 0) + elapsed;
  entry.activeStart = null;
  data[member.id] = entry;

  await t.set('card', 'shared', TRACKING_KEY, data);

  // Also save session to private history
  await _appendSession(t, { start: Date.now() - elapsed, end: Date.now(), durationMs: elapsed });

  return data;
}

/**
 * Toggle timer: start if stopped, stop if running.
 * @param {object} t
 * @returns {Promise<{ data: Object, running: boolean }>}
 */
export async function toggleTimer(t) {
  const member = await t.member('id');
  const data = await getCardTimeData(t);
  const entry = data[member.id];
  const isRunning = entry?.activeStart != null;

  if (isRunning) {
    const newData = await stopTimer(t);
    return { data: newData, running: false };
  } else {
    const newData = await startTimer(t);
    return { data: newData, running: true };
  }
}

/**
 * Manually adjust time for the current member.
 * @param {object} t
 * @param {number} deltaMs – Positive to add, negative to subtract
 */
export async function adjustTime(t, deltaMs) {
  const member = await t.member('id', 'fullName');
  const data = await getCardTimeData(t);

  const entry = data[member.id] || { name: member.fullName, totalMs: 0, activeStart: null };
  entry.name = member.fullName;
  entry.totalMs = Math.max(0, (entry.totalMs || 0) + deltaMs);
  data[member.id] = entry;

  await t.set('card', 'shared', TRACKING_KEY, data);
  return data;
}

/**
 * Set total time for a specific member directly (admin override).
 * @param {object} t
 * @param {string} memberId
 * @param {number} totalMs
 */
export async function setMemberTime(t, memberId, totalMs) {
  const data = await getCardTimeData(t);
  if (data[memberId]) {
    data[memberId].totalMs = Math.max(0, totalMs);
    await t.set('card', 'shared', TRACKING_KEY, data);
  }
  return data;
}

/**
 * Clear all time data for a card (use with caution).
 * @param {object} t
 */
export async function clearCardTime(t) {
  await t.set('card', 'shared', TRACKING_KEY, {});
}

// ---------------------------------------------------------------------------
// Board-level aggregation (for reports)
// ---------------------------------------------------------------------------

/**
 * Fetch time data for ALL cards on the board.
 * Reads each card's shared storage individually since pluginData
 * is not accessible via t.cards() in the iframe context.
 *
 * @param {object} t
 * @returns {Promise<Array<{ cardId, cardName, listName, labels, timeData }>>}
 */
export async function getBoardTimeReport(t) {
  const cards = await t.cards('id', 'name', 'idList', 'labels');
  const lists = await t.lists('id', 'name');
  const listMap = Object.fromEntries(lists.map((l) => [l.id, l.name]));

  const results = [];

  // Read time data for each card individually
  // Process in batches of 10 to avoid overwhelming the API
  const BATCH_SIZE = 10;
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = cards.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (card) => {
        try {
          const timeData = await t.get(card.id, 'shared', TRACKING_KEY);
          return { card, timeData: timeData || {} };
        } catch {
          return { card, timeData: {} };
        }
      })
    );

    for (const { card, timeData } of batchResults) {
      if (Object.keys(timeData).length > 0) {
        results.push({
          cardId: card.id,
          cardName: card.name,
          listName: listMap[card.idList] || 'Ukjent',
          labels: card.labels || [],
          timeData,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function _appendSession(t, session) {
  try {
    const sessions = await getMySessions(t);
    sessions.push(session);
    // Trim to keep within storage limits
    const trimmed = sessions.slice(-MAX_SESSIONS);
    await t.set('card', 'private', SESSIONS_KEY, trimmed);
  } catch {
    // Non-critical – don't break the timer if session save fails
  }
}
