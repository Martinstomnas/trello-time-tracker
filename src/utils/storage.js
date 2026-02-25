/**
 * storage.js – Time tracking data operations backed by Supabase.
 *
 * DATA MODEL
 * ----------
 * Two tables:
 *
 * time_entries: Completed sessions (one row per start->stop)
 *   - board_id, card_id, card_name, list_name, member_id, member_name
 *   - started_at, ended_at, duration_ms, labels (jsonb)
 *
 * active_timers: Currently running timers (max one per member per card)
 *   - board_id, card_id, member_id, member_name, started_at
 */

import { supabase } from './supabase.js';

// ---------------------------------------------------------------------------
// Timer operations (per card, per member)
// ---------------------------------------------------------------------------

/**
 * Start a timer for the current member on a card.
 */
export async function startTimer(t) {
  const member = await t.member('id', 'fullName');
  const card = await t.card('id', 'name');
  const board = await t.board('id');

  // Check if already running
  const { data: existing } = await supabase
    .from('active_timers')
    .select('id')
    .eq('card_id', card.id)
    .eq('member_id', member.id)
    .maybeSingle();

  if (existing) return;

  const { error } = await supabase.from('active_timers').insert({
    board_id: board.id,
    card_id: card.id,
    member_id: member.id,
    member_name: member.fullName,
    started_at: new Date().toISOString(),
  });

  if (error) console.error('[TimeTracker] startTimer error:', error);
}

/**
 * Stop the timer for the current member on a card.
 * Moves the active timer into a completed time_entry.
 */
export async function stopTimer(t) {
  const member = await t.member('id', 'fullName');
  const card = await t.card('id', 'name');
  const board = await t.board('id');
  const list = await t.list('id', 'name');
  const cardData = await t.card('labels');

  // Find active timer
  const { data: active } = await supabase
    .from('active_timers')
    .select('*')
    .eq('card_id', card.id)
    .eq('member_id', member.id)
    .maybeSingle();

  if (!active) return;

  const endedAt = new Date();
  const startedAt = new Date(active.started_at);
  const durationMs = endedAt.getTime() - startedAt.getTime();

  // Insert completed entry
  const { error: insertError } = await supabase.from('time_entries').insert({
    board_id: board.id,
    card_id: card.id,
    card_name: card.name,
    list_name: list.name,
    member_id: member.id,
    member_name: member.fullName,
    started_at: active.started_at,
    ended_at: endedAt.toISOString(),
    duration_ms: durationMs,
    labels: cardData.labels || [],
  });

  if (insertError) {
    console.error('[TimeTracker] stopTimer insert error:', insertError);
    return;
  }

  // Remove active timer
  await supabase.from('active_timers').delete().eq('id', active.id);
}

/**
 * Toggle timer: start if stopped, stop if running.
 */
export async function toggleTimer(t) {
  const member = await t.member('id');
  const card = await t.card('id');

  const { data: active } = await supabase
    .from('active_timers')
    .select('id')
    .eq('card_id', card.id)
    .eq('member_id', member.id)
    .maybeSingle();

  if (active) {
    await stopTimer(t);
    return { running: false };
  } else {
    await startTimer(t);
    return { running: true };
  }
}

/**
 * Manually add or subtract time for a member.
 * @param {object} t
 * @param {number} deltaMs – Positive to add, negative to subtract
 * @param {string} [dateStr] – Optional date string (YYYY-MM-DD). Defaults to today.
 * @param {{ id: string, fullName: string }} [targetMember] – Optional member to adjust for. Defaults to current user.
 */
export async function adjustTime(t, deltaMs, dateStr, targetMember) {
  const member = targetMember || await t.member('id', 'fullName');
  const card = await t.card('id', 'name');
  const board = await t.board('id');
  const list = await t.list('id', 'name');
  const cardData = await t.card('labels');

  // Use provided date at noon, or current time
  const now = dateStr
    ? new Date(dateStr + 'T12:00:00').toISOString()
    : new Date().toISOString();

  const { error } = await supabase.from('time_entries').insert({
    board_id: board.id,
    card_id: card.id,
    card_name: card.name,
    list_name: list.name,
    member_id: member.id,
    member_name: member.fullName,
    started_at: now,
    ended_at: now,
    duration_ms: deltaMs,
    labels: cardData.labels || [],
  });

  if (error) console.error('[TimeTracker] adjustTime error:', error);
}

// ---------------------------------------------------------------------------
// Read operations (per card)
// ---------------------------------------------------------------------------

/**
 * Get all time data for a specific card, grouped by member.
 * Returns same shape as before: { [memberId]: { name, totalMs, activeStart } }
 */
export async function getCardTimeData(t) {
  const card = await t.card('id');
  const result = {};

  // Get completed time per member
  const { data: entries } = await supabase
    .from('time_entries')
    .select('member_id, member_name, duration_ms')
    .eq('card_id', card.id);

  if (entries) {
    for (const entry of entries) {
      if (!result[entry.member_id]) {
        result[entry.member_id] = { name: entry.member_name, totalMs: 0, activeStart: null };
      }
      result[entry.member_id].totalMs += entry.duration_ms || 0;
      result[entry.member_id].name = entry.member_name;
    }
  }

  // Get active timers
  const { data: actives } = await supabase
    .from('active_timers')
    .select('member_id, member_name, started_at')
    .eq('card_id', card.id);

  if (actives) {
    for (const active of actives) {
      if (!result[active.member_id]) {
        result[active.member_id] = { name: active.member_name, totalMs: 0, activeStart: null };
      }
      result[active.member_id].activeStart = new Date(active.started_at).getTime();
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Board-level report
// ---------------------------------------------------------------------------

/**
 * Fetch time report for the entire board.
 * Supports optional date filtering.
 * Labels are fetched live from Trello (not from stored data) so changes are always reflected.
 */
export async function getBoardTimeReport(t, filters = {}) {
  const board = await t.board('id');

  // Fetch current card data from Trello for live labels and names
  const trelloCards = await t.cards('id', 'name', 'idList', 'labels');
  const trelloLists = await t.lists('id', 'name');
  const listMap = Object.fromEntries(trelloLists.map((l) => [l.id, l.name]));
  const cardInfoMap = Object.fromEntries(
    trelloCards.map((c) => [c.id, {
      name: c.name,
      listName: listMap[c.idList] || '',
      labels: c.labels || [],
    }])
  );

  let query = supabase
    .from('time_entries')
    .select('card_id, card_name, list_name, member_id, member_name, duration_ms, started_at')
    .eq('board_id', board.id)
    .order('started_at', { ascending: false });

  if (filters.from) query = query.gte('started_at', filters.from);
  if (filters.to) query = query.lte('started_at', filters.to);

  const { data: entries, error } = await query;
  if (error) throw error;

  // Also get active timers
  const { data: actives } = await supabase
    .from('active_timers')
    .select('card_id, member_id, member_name, started_at')
    .eq('board_id', board.id);

  // Group by card
  const cardMap = new Map();

  for (const entry of entries || []) {
    if (!cardMap.has(entry.card_id)) {
      // Use live Trello data if available, fall back to stored data
      const live = cardInfoMap[entry.card_id];
      cardMap.set(entry.card_id, {
        cardId: entry.card_id,
        cardName: live?.name || entry.card_name,
        listName: live?.listName || entry.list_name,
        labels: live?.labels || [],
        timeData: {},
      });
    }
    const card = cardMap.get(entry.card_id);
    if (!card.timeData[entry.member_id]) {
      card.timeData[entry.member_id] = { name: entry.member_name, totalMs: 0, activeStart: null };
    }
    card.timeData[entry.member_id].totalMs += entry.duration_ms || 0;
  }

  for (const active of actives || []) {
    if (!cardMap.has(active.card_id)) {
      const live = cardInfoMap[active.card_id];
      cardMap.set(active.card_id, {
        cardId: active.card_id,
        cardName: live?.name || '(aktiv)',
        listName: live?.listName || '',
        labels: live?.labels || [],
        timeData: {},
      });
    }
    const card = cardMap.get(active.card_id);
    if (!card.timeData[active.member_id]) {
      card.timeData[active.member_id] = { name: active.member_name, totalMs: 0, activeStart: null };
    }
    card.timeData[active.member_id].activeStart = new Date(active.started_at).getTime();
  }

  return Array.from(cardMap.values());
}

/**
 * Clear all time data for a card.
 */
export async function clearCardTime(t) {
  const card = await t.card('id');
  await supabase.from('time_entries').delete().eq('card_id', card.id);
  await supabase.from('active_timers').delete().eq('card_id', card.id);
}