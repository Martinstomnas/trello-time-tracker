/**
 * export.js – Generate CSV and JSON downloads from report data.
 */

import { formatDuration } from "./time.js";

/**
 * Convert report data to a flat array of rows suitable for CSV/table.
 * Each row = one (card, member) pair.
 * @param {Array} reportData – from getBoardTimeReport()
 * @returns {Array<Object>}
 */
export function flattenReportData(reportData) {
  const rows = [];
  for (const card of reportData) {
    for (const [memberId, mData] of Object.entries(card.timeData)) {
      rows.push({
        cardName: card.cardName,
        listName: card.listName,
        labels: card.labels.map((l) => l.name || l.color).join(", "),
        memberName: mData.name || memberId,
        memberId,
        totalMs: mData.totalMs || 0,
        totalFormatted: formatDuration(mData.totalMs || 0),
        isActive: mData.activeStart != null,
      });
    }
  }
  return rows;
}

/**
 * Download data as a CSV file.
 * @param {Array} reportData
 * @param {string} filename
 */
export function downloadCSV(reportData, filename = "time-report.csv") {
  const rows = flattenReportData(reportData);
  if (rows.length === 0) {
    alert("Ingen data å eksportere.");
    return;
  }

  const headers = [
    "Kort",
    "Liste",
    "Labels",
    "Person",
    "Tid (ms)",
    "Tid",
    "Aktiv",
  ];
  const csvLines = [
    headers.join(";"),
    ...rows.map((r) =>
      [
        _esc(r.cardName),
        _esc(r.listName),
        _esc(r.labels),
        _esc(r.memberName),
        r.totalMs,
        _esc(r.totalFormatted),
        r.isActive ? "Ja" : "Nei",
      ].join(";"),
    ),
  ];

  _downloadBlob(csvLines.join("\n"), filename, "text/csv;charset=utf-8;");
}

/**
 * Download data as a JSON file.
 * @param {Array} reportData
 * @param {string} filename
 */
export function downloadJSON(reportData, filename = "time-report.json") {
  const rows = flattenReportData(reportData);
  const json = JSON.stringify(rows, null, 2);
  _downloadBlob(json, filename, "application/json");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _esc(value) {
  const str = String(value ?? "");
  // Wrap in quotes if it contains the delimiter or quotes
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function _downloadBlob(content, filename, mimeType) {
  const blob = new Blob(["\uFEFF" + content], { type: mimeType }); // BOM for Excel UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
