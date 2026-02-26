/**
 * time.js – Helpers for formatting and calculating time durations.
 */

/**
 * Format milliseconds into a human-readable string.
 * @param {number} ms – Duration in milliseconds
 * @param {boolean} short – If true, use compact format (2t 34m)
 * @returns {string}
 */
export function formatDuration(ms, short = false) {
  if (!ms || ms < 0) return short ? "0m" : "0m 0s";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (short) {
    if (hours > 0) return `${hours}t ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  const parts = [];
  if (hours > 0) parts.push(`${hours}t`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

/**
 * Format milliseconds as HH:MM:SS for the live timer display.
 * @param {number} ms
 * @returns {string}
 */
export function formatTimer(ms) {
  if (!ms || ms < 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/**
 * Parse a duration string like "1t 30m" or "90m" into milliseconds.
 * Supports: Xt, Xm, Xs (Norwegian-style) and Xh, Xm, Xs (English-style).
 * @param {string} str
 * @returns {number} milliseconds
 */
export function parseDuration(str) {
  let ms = 0;
  const hours = str.match(/(\d+)\s*[th]/i);
  const minutes = str.match(/(\d+)\s*m/i);
  const seconds = str.match(/(\d+)\s*s/i);
  if (hours) ms += parseInt(hours[1], 10) * 3600000;
  if (minutes) ms += parseInt(minutes[1], 10) * 60000;
  if (seconds) ms += parseInt(seconds[1], 10) * 1000;
  return ms;
}

/**
 * Calculate total tracked time for a member from their time data.
 * Includes elapsed time from any active (running) session.
 * @param {{ totalMs: number, activeStart: number|null }} memberData
 * @returns {number} total milliseconds
 */
export function getTotalWithActive(memberData) {
  if (!memberData) return 0;
  let total = memberData.totalMs || 0;
  if (memberData.activeStart) {
    total += Date.now() - memberData.activeStart;
  }
  return total;
}
