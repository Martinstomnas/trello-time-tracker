/**
 * Estimate management for Trello Time Tracker
 *
 * DATA MODEL
 * ----------
 * Two tables in Supabase:
 *
 * time_estimates: One row per member per card
 *   - board_id, card_id, member_id, member_name
 *   - estimated_ms
 *   - created_at, updated_at
 *
 * estimate_history: Log of re-estimations (scope changes)
 *   - estimate_id (FK), board_id, card_id, member_id, member_name
 *   - previous_ms, new_ms, reason, changed_at
 *
 * GRACE PERIOD: If estimate is changed within 2 minutes of last update,
 * it's treated as a correction (overwrite, no history log).
 */

import { supabase } from "./supabase.js";

// Grace period in milliseconds (2 minutes)
const GRACE_PERIOD_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// Card-level estimate operations
// ---------------------------------------------------------------------------

/**
 * Get all estimates for a specific card, grouped by member.
 * Includes original estimate (first previous_ms from history) when available.
 *
 * @param {object} t – Trello Power-Up iframe context
 * @returns {Object} { [memberId]: { name, estimatedMs, originalMs, updatedAt } }
 */
export async function getCardEstimates(t) {
  const card = await t.card("id");
  const result = {};

  const { data: estimates, error } = await supabase
    .from("time_estimates")
    .select("id, member_id, member_name, estimated_ms, updated_at")
    .eq("card_id", card.id);

  if (error) {
    console.error("[TimeTracker] getCardEstimates error:", error);
    return result;
  }

  if (!estimates || estimates.length === 0) return result;

  // Fetch history for all estimates on this card to find original values
  const estimateIds = estimates.map((e) => e.id);
  const { data: history } = await supabase
    .from("estimate_history")
    .select("estimate_id, previous_ms, changed_at")
    .in("estimate_id", estimateIds)
    .order("changed_at", { ascending: true });

  // Build a map of estimate_id → first previous_ms (= original estimate)
  const originalMap = {};
  for (const h of history || []) {
    if (!originalMap[h.estimate_id]) {
      originalMap[h.estimate_id] = h.previous_ms;
    }
  }

  for (const est of estimates) {
    const originalMs = originalMap[est.id] ?? null;
    result[est.member_id] = {
      name: est.member_name,
      estimatedMs: est.estimated_ms,
      originalMs, // null if never re-estimated
      updatedAt: est.updated_at,
    };
  }

  return result;
}

/**
 * Set or update estimate for a member on a card.
 * If estimate already exists and value changes:
 *   - Within grace period (2 min): overwrite without logging history
 *   - Outside grace period: log to estimate_history, then update
 *
 * @param {object} t – Trello Power-Up iframe context
 * @param {number} estimatedMs – Estimated time in milliseconds
 * @param {{ id: string, fullName: string }} [targetMember] – Defaults to current user
 * @param {string} [reason] – Optional reason for re-estimation
 */
export async function setEstimate(t, estimatedMs, targetMember, reason) {
  const member = targetMember || (await t.member("id", "fullName"));
  const card = await t.card("id");
  const board = await t.board("id");

  // Check if estimate already exists
  const { data: existing } = await supabase
    .from("time_estimates")
    .select("id, estimated_ms, updated_at")
    .eq("card_id", card.id)
    .eq("member_id", member.id)
    .maybeSingle();

  if (existing) {
    // Only act if value actually changed
    if (existing.estimated_ms !== estimatedMs) {
      // Check grace period: if updated_at is within 2 minutes, skip history
      const lastUpdate = new Date(existing.updated_at).getTime();
      const now = Date.now();
      const withinGrace = now - lastUpdate < GRACE_PERIOD_MS;

      if (!withinGrace) {
        // Log the change to history
        await supabase.from("estimate_history").insert({
          estimate_id: existing.id,
          board_id: board.id,
          card_id: card.id,
          member_id: member.id,
          member_name: member.fullName,
          previous_ms: existing.estimated_ms,
          new_ms: estimatedMs,
          reason: reason || null,
        });
      }
      // else: within grace period – just overwrite, no history entry
    }

    // Update existing estimate
    const { error } = await supabase
      .from("time_estimates")
      .update({
        estimated_ms: estimatedMs,
        member_name: member.fullName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) console.error("[TimeTracker] setEstimate update error:", error);
  } else {
    // Insert new estimate
    const { error } = await supabase.from("time_estimates").insert({
      board_id: board.id,
      card_id: card.id,
      member_id: member.id,
      member_name: member.fullName,
      estimated_ms: estimatedMs,
    });

    if (error) console.error("[TimeTracker] setEstimate insert error:", error);
  }
}

/**
 * Remove estimate for a member on a card.
 * @param {object} t – Trello Power-Up iframe context
 * @param {{ id: string }} [targetMember] – Defaults to current user
 */
export async function removeEstimate(t, targetMember) {
  const member = targetMember || (await t.member("id"));
  const card = await t.card("id");

  const { error } = await supabase
    .from("time_estimates")
    .delete()
    .eq("card_id", card.id)
    .eq("member_id", member.id);

  if (error) console.error("[TimeTracker] removeEstimate error:", error);
}

// ---------------------------------------------------------------------------
// Board-level estimate report
// ---------------------------------------------------------------------------

/**
 * Fetch estimation report for the entire board.
 * Combines estimates with actual time data for comparison.
 * Gjenstående is always auto-calculated (estimated − actual).
 *
 * @param {object} t – Trello Power-Up iframe context
 * @param {object} [filters] – { from, to } date filters for actual time
 * @returns {{ cards: Array, cardInfoMap: Object }}
 */
export async function getBoardEstimateReport(t, filters = {}) {
  const board = await t.board("id");

  // Fetch current card data from Trello for live labels and names
  const trelloCards = await t.cards("id", "name", "idList", "labels");
  const trelloLists = await t.lists("id", "name");
  const listMap = Object.fromEntries(trelloLists.map((l) => [l.id, l.name]));
  const cardInfoMap = Object.fromEntries(
    trelloCards.map((c) => [
      c.id,
      {
        name: c.name,
        listName: listMap[c.idList] || "",
        labels: c.labels || [],
      },
    ]),
  );

  // 1. Fetch all estimates for this board
  const { data: estimates, error: estError } = await supabase
    .from("time_estimates")
    .select("id, card_id, member_id, member_name, estimated_ms")
    .eq("board_id", board.id);

  if (estError) throw estError;

  // 1b. Fetch original estimates from history
  const estimateIds = (estimates || []).map((e) => e.id);
  let originalMap = {};
  if (estimateIds.length > 0) {
    const { data: history } = await supabase
      .from("estimate_history")
      .select("estimate_id, previous_ms, changed_at")
      .in("estimate_id", estimateIds)
      .order("changed_at", { ascending: true });

    for (const h of history || []) {
      if (!originalMap[h.estimate_id]) {
        originalMap[h.estimate_id] = h.previous_ms;
      }
    }
  }

  // 2. Fetch actual time entries (with optional date filter)
  let query = supabase
    .from("time_entries")
    .select("card_id, member_id, member_name, duration_ms, started_at")
    .eq("board_id", board.id)
    .order("started_at", { ascending: false });

  if (filters.from) query = query.gte("started_at", filters.from);
  if (filters.to) query = query.lte("started_at", filters.to);

  const { data: entries, error: entError } = await query;
  if (entError) throw entError;

  // 3. Fetch active timers
  const { data: actives } = await supabase
    .from("active_timers")
    .select("card_id, member_id, member_name, started_at")
    .eq("board_id", board.id);

  // 4. Build card map with both estimate and actual data
  const cardMap = new Map();

  const getOrCreateCard = (cardId) => {
    if (!cardMap.has(cardId)) {
      const live = cardInfoMap[cardId];
      cardMap.set(cardId, {
        cardId,
        cardName: live?.name || cardId,
        listName: live?.listName || "",
        labels: live?.labels || [],
        members: {},
      });
    }
    return cardMap.get(cardId);
  };

  const getOrCreateMember = (card, memberId, memberName) => {
    if (!card.members[memberId]) {
      card.members[memberId] = {
        name: memberName || memberId,
        estimatedMs: 0,
        originalMs: null,
        actualMs: 0,
        activeStart: null,
      };
    }
    return card.members[memberId];
  };

  // Fill in estimates
  for (const est of estimates || []) {
    const card = getOrCreateCard(est.card_id);
    const member = getOrCreateMember(card, est.member_id, est.member_name);
    member.estimatedMs = est.estimated_ms;
    member.originalMs = originalMap[est.id] ?? null;
  }

  // Fill in actual time
  for (const entry of entries || []) {
    const card = getOrCreateCard(entry.card_id);
    const member = getOrCreateMember(card, entry.member_id, entry.member_name);
    member.actualMs += entry.duration_ms || 0;
  }

  // Fill in active timers
  for (const active of actives || []) {
    const card = getOrCreateCard(active.card_id);
    const member = getOrCreateMember(
      card,
      active.member_id,
      active.member_name,
    );
    member.activeStart = new Date(active.started_at).getTime();
  }

  // Only return cards that have at least one estimate
  const cards = Array.from(cardMap.values()).filter((c) =>
    Object.values(c.members).some((m) => m.estimatedMs > 0),
  );

  return { cards, cardInfoMap };
}

/**
 * Fetch estimate history for a card (re-estimations log).
 * @param {string} cardId
 * @returns {Array}
 */
export async function getEstimateHistory(cardId) {
  const { data, error } = await supabase
    .from("estimate_history")
    .select("*")
    .eq("card_id", cardId)
    .order("changed_at", { ascending: false });

  if (error) {
    console.error("[TimeTracker] getEstimateHistory error:", error);
    return [];
  }

  return data || [];
}

/**
 * Clear all estimates for a card.
 * @param {string} cardId
 */
export async function clearCardEstimates(cardId) {
  // History is cascade-deleted via FK
  const { error } = await supabase
    .from("time_estimates")
    .delete()
    .eq("card_id", cardId);

  if (error) console.error("[TimeTracker] clearCardEstimates error:", error);
}
