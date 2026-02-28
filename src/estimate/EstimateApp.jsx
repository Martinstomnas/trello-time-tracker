import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { getBoardEstimateReport } from "../utils/estimateStorage.js";
import { formatDuration, getTotalWithActive } from "../utils/time.js";

/**
 * EstimateApp – Estimation report tab showing estimated vs actual time.
 *
 * Changes:
 * - Gjenstående is always auto-calculated: estimat − faktisk
 * - Removed remaining_override / remaining_ms logic
 * - Shows original estimate when estimate was re-estimated
 */

// ── Date range presets (shared logic with ReportApp) ──────────────
function getPresetRange(preset) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "today":
      return {
        from: startOfDay.toISOString(),
        to: now.toISOString(),
        label: "I dag",
      };
    case "yesterday": {
      const yesterday = new Date(startOfDay);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        from: yesterday.toISOString(),
        to: startOfDay.toISOString(),
        label: "I går",
      };
    }
    case "this-week": {
      const day = startOfDay.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const monday = new Date(startOfDay);
      monday.setDate(monday.getDate() - diff);
      return {
        from: monday.toISOString(),
        to: now.toISOString(),
        label: "Denne uken",
      };
    }
    case "last-week": {
      const day = startOfDay.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(startOfDay);
      thisMonday.setDate(thisMonday.getDate() - diff);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(lastMonday.getDate() - 7);
      return {
        from: lastMonday.toISOString(),
        to: thisMonday.toISOString(),
        label: "Forrige uke",
      };
    }
    case "this-month": {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        from: firstOfMonth.toISOString(),
        to: now.toISOString(),
        label: "Denne måneden",
      };
    }
    case "last-month": {
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstOfLastMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      );
      return {
        from: firstOfLastMonth.toISOString(),
        to: firstOfThisMonth.toISOString(),
        label: "Forrige måned",
      };
    }
    case "this-year": {
      const firstOfYear = new Date(now.getFullYear(), 0, 1);
      return {
        from: firstOfYear.toISOString(),
        to: now.toISOString(),
        label: "I år",
      };
    }
    case "all":
    default:
      return { from: null, to: null, label: "Totalt" };
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function getActualMs(member) {
  let total = member.actualMs || 0;
  if (member.activeStart) {
    total += Date.now() - member.activeStart;
  }
  return total;
}

/** Gjenstående: always auto-calculated (estimated − actual), min 0 */
function getRemainingMs(member) {
  const actual = getActualMs(member);
  return Math.max(0, (member.estimatedMs || 0) - actual);
}

function deviationMs(estimated, actual) {
  return actual - estimated;
}

function deviationPct(estimated, actual) {
  if (!estimated) return null;
  return ((actual - estimated) / estimated) * 100;
}

function accuracyScore(estimated, actual) {
  if (!estimated) return null;
  const ratio = actual / estimated;
  return Math.max(0, 100 - Math.abs(ratio - 1) * 100);
}

function formatDeviation(ms) {
  if (ms === 0) return "0m";
  const prefix = ms > 0 ? "+" : "−";
  return prefix + formatDuration(Math.abs(ms));
}

function formatPct(pct) {
  if (pct === null || pct === undefined) return "—";
  const prefix = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return prefix + Math.abs(pct).toFixed(0) + "%";
}

function deviationColor(pct) {
  if (pct === null || pct === undefined) return "#5E6C84";
  if (Math.abs(pct) <= 10) return "#61BD4F";
  if (Math.abs(pct) <= 25) return "#F2D600";
  return "#EB5A46";
}

// ── CSV export ───────────────────────────────────────────────────

function downloadEstimateCSV(aggregated, groupBy) {
  if (aggregated.length === 0) {
    alert("Ingen data å eksportere.");
    return;
  }

  const headers = [
    groupBy === "card" ? "Kort" : groupBy === "person" ? "Person" : "Label",
    ...(groupBy === "card" ? ["Liste"] : []),
    "Estimert",
    "Estimert (ms)",
    "Opprinnelig estimert",
    "Opprinnelig (ms)",
    "Faktisk",
    "Faktisk (ms)",
    "Gjenstående",
    "Avvik",
    "Avvik %",
    "Accuracy",
  ];

  const csvLines = [
    headers.join(";"),
    ...aggregated.map((row) => {
      const fields = [
        _esc(row.label),
        ...(groupBy === "card" ? [_esc(row.listName || "")] : []),
        _esc(formatDuration(row.estimatedMs)),
        row.estimatedMs,
        _esc(row.originalMs != null ? formatDuration(row.originalMs) : ""),
        row.originalMs ?? "",
        _esc(formatDuration(row.actualMs)),
        row.actualMs,
        _esc(formatDuration(row.remainingMs)),
        _esc(formatDeviation(row.deviationMs)),
        formatPct(row.deviationPct),
        row.accuracy !== null ? row.accuracy.toFixed(0) + "%" : "—",
      ];
      return fields.join(";");
    }),
  ];

  const blob = new Blob(["\uFEFF" + csvLines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "estimate-report.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _esc(value) {
  const str = String(value ?? "");
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ── Component ────────────────────────────────────────────────────

export default function EstimateApp({ t }) {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupBy, setGroupBy] = useState("card");
  const [sortBy, setSortBy] = useState("deviation");
  const [now, setNow] = useState(Date.now());

  // Date filtering
  const [datePreset, setDatePreset] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [activeLabel, setActiveLabel] = useState("Totalt");

  const tickRef = useRef(null);
  const pollRef = useRef(null);

  const getFilters = useCallback(() => {
    if (datePreset === "custom") {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : null,
        to: customTo ? new Date(customTo + "T23:59:59").toISOString() : null,
      };
    }
    const range = getPresetRange(datePreset);
    return { from: range.from, to: range.to };
  }, [datePreset, customFrom, customTo]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = getFilters();
      const result = await getBoardEstimateReport(t, filters);
      setReportData(result.cards);
    } catch (err) {
      console.error("Estimate report load error:", err);
      setError("Kunne ikke laste estimeringsdata. Prøv igjen.");
    } finally {
      setLoading(false);
    }
  }, [t, getFilters]);

  const silentReload = useCallback(async () => {
    try {
      const filters = getFilters();
      const result = await getBoardEstimateReport(t, filters);
      setReportData(result.cards);
    } catch (err) {
      console.error("Silent reload error:", err);
    }
  }, [t, getFilters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tick for active timers
  useEffect(() => {
    const hasActive = reportData.some((card) =>
      Object.values(card.members).some((m) => m.activeStart != null),
    );
    if (hasActive) {
      tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    } else {
      clearInterval(tickRef.current);
    }
    return () => clearInterval(tickRef.current);
  }, [reportData]);

  // Poll every 5s
  useEffect(() => {
    const POLL_INTERVAL = 5000;
    const startPolling = () => {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        if (document.visibilityState === "visible") silentReload();
      }, POLL_INTERVAL);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        silentReload();
        startPolling();
      } else {
        clearInterval(pollRef.current);
      }
    };
    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [silentReload]);

  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    const range = getPresetRange(preset);
    setActiveLabel(range.label);
    if (preset !== "custom") {
      setCustomFrom("");
      setCustomTo("");
    }
  };

  // ── Aggregate ──────────────────────────────────────────────────

  const aggregated = useMemo(() => {
    const map = new Map();

    for (const card of reportData) {
      for (const [memberId, m] of Object.entries(card.members)) {
        if (!m.estimatedMs && !getActualMs(m)) continue;

        const actual = getActualMs(m);
        const estimated = m.estimatedMs || 0;
        const remaining = getRemainingMs(m);
        const originalMs = m.originalMs ?? null;

        let key, label, listName;
        if (groupBy === "card") {
          key = card.cardId;
          label = card.cardName;
          listName = card.listName;
        } else if (groupBy === "person") {
          key = memberId;
          label = m.name;
        } else {
          // label grouping
          const labels = card.labels?.length
            ? card.labels
            : [{ name: "Uten label", color: "gray" }];
          for (const lbl of labels) {
            const lKey = lbl.name || lbl.color;
            const existing = map.get(lKey) || {
              label: lKey,
              estimatedMs: 0,
              originalMs: null,
              actualMs: 0,
              remainingMs: 0,
              color: lbl.color,
            };
            existing.estimatedMs += estimated;
            existing.actualMs += actual;
            existing.remainingMs += remaining;
            // For label grouping, originalMs aggregation: sum if available
            if (originalMs != null) {
              existing.originalMs = (existing.originalMs || 0) + originalMs;
            }
            map.set(lKey, existing);
          }
          continue;
        }

        const existing = map.get(key) || {
          label,
          listName,
          cardId: groupBy === "card" ? card.cardId : undefined,
          estimatedMs: 0,
          originalMs: null,
          actualMs: 0,
          remainingMs: 0,
        };
        existing.estimatedMs += estimated;
        existing.actualMs += actual;
        existing.remainingMs += remaining;
        if (originalMs != null) {
          existing.originalMs = (existing.originalMs || 0) + originalMs;
        }
        map.set(key, existing);
      }
    }

    // Calculate deviation and accuracy for each row
    let results = Array.from(map.values()).map((row) => ({
      ...row,
      deviationMs: deviationMs(row.estimatedMs, row.actualMs),
      deviationPct: deviationPct(row.estimatedMs, row.actualMs),
      accuracy: accuracyScore(row.estimatedMs, row.actualMs),
    }));

    // Sort
    if (sortBy === "deviation") {
      results.sort((a, b) => Math.abs(b.deviationMs) - Math.abs(a.deviationMs));
    } else if (sortBy === "estimated") {
      results.sort((a, b) => b.estimatedMs - a.estimatedMs);
    } else if (sortBy === "accuracy") {
      results.sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1));
    } else {
      results.sort((a, b) => a.label.localeCompare(b.label));
    }

    return results;
  }, [reportData, groupBy, sortBy, now]);

  // ── Summary stats ──────────────────────────────────────────────

  const summary = useMemo(() => {
    const totalEstimated = aggregated.reduce((s, r) => s + r.estimatedMs, 0);
    const totalActual = aggregated.reduce((s, r) => s + r.actualMs, 0);
    const totalRemaining = aggregated.reduce((s, r) => s + r.remainingMs, 0);
    const totalOriginal = aggregated.reduce(
      (s, r) => s + (r.originalMs || 0),
      0,
    );
    const hasOriginal = aggregated.some((r) => r.originalMs != null);
    const avgAccuracy =
      aggregated.filter((r) => r.accuracy !== null).length > 0
        ? aggregated
            .filter((r) => r.accuracy !== null)
            .reduce((s, r) => s + r.accuracy, 0) /
          aggregated.filter((r) => r.accuracy !== null).length
        : null;

    const withDeviation = aggregated.filter((r) => r.deviationPct !== null);
    const mostOver = withDeviation.length
      ? withDeviation.reduce(
          (max, r) => (r.deviationPct > max.deviationPct ? r : max),
          withDeviation[0],
        )
      : null;
    const mostUnder = withDeviation.length
      ? withDeviation.reduce(
          (min, r) => (r.deviationPct < min.deviationPct ? r : min),
          withDeviation[0],
        )
      : null;

    return {
      totalEstimated,
      totalActual,
      totalRemaining,
      totalOriginal: hasOriginal ? totalOriginal : null,
      avgAccuracy,
      mostOver,
      mostUnder,
    };
  }, [aggregated]);

  // ── Render ─────────────────────────────────────────────────────

  if (loading) {
    return <div style={styles.center}>Laster estimeringsdata...</div>;
  }

  if (error) {
    return <div style={{ ...styles.center, color: "#EB5A46" }}>{error}</div>;
  }

  const datePresets = [
    { key: "all", label: "Totalt" },
    { key: "today", label: "I dag" },
    { key: "yesterday", label: "I går" },
    { key: "this-week", label: "Denne uken" },
    { key: "last-week", label: "Forrige uke" },
    { key: "this-month", label: "Denne mnd" },
    { key: "last-month", label: "Forrige mnd" },
    { key: "this-year", label: "I år" },
    { key: "custom", label: "Egendefinert" },
  ];

  return (
    <div>
      {/* Summary cards */}
      <div style={styles.summaryRow}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Totalt estimert</div>
          <div style={styles.summaryValue}>
            {formatDuration(summary.totalEstimated)}
            {summary.totalOriginal != null &&
              summary.totalOriginal !== summary.totalEstimated && (
                <span style={styles.originalHint}>
                  (oppr. {formatDuration(summary.totalOriginal)})
                </span>
              )}
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Totalt brukt</div>
          <div style={styles.summaryValue}>
            {formatDuration(summary.totalActual)}
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Gjenstående</div>
          <div style={styles.summaryValue}>
            {formatDuration(summary.totalRemaining)}
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Avvik</div>
          <div
            style={{
              ...styles.summaryValue,
              color: deviationColor(
                deviationPct(summary.totalEstimated, summary.totalActual),
              ),
            }}
          >
            {formatDeviation(summary.totalActual - summary.totalEstimated)} (
            {formatPct(
              deviationPct(summary.totalEstimated, summary.totalActual),
            )}
            )
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Snitt accuracy</div>
          <div
            style={{
              ...styles.summaryValue,
              color:
                summary.avgAccuracy !== null
                  ? deviationColor(100 - summary.avgAccuracy)
                  : "#5E6C84",
            }}
          >
            {summary.avgAccuracy !== null
              ? summary.avgAccuracy.toFixed(0) + "%"
              : "—"}
          </div>
        </div>
      </div>

      {/* Date filter bar */}
      <div style={styles.dateBar}>
        <div style={styles.datePresets}>
          {datePresets.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handlePresetChange(key)}
              style={
                datePreset === key
                  ? styles.datePresetActive
                  : styles.datePresetBtn
              }
            >
              {label}
            </button>
          ))}
        </div>

        {datePreset === "custom" && (
          <div style={styles.customDateRow}>
            <label style={styles.dateLabel}>
              Fra:
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={styles.dateInput}
              />
            </label>
            <label style={styles.dateLabel}>
              Til:
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={styles.dateInput}
              />
            </label>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <div style={styles.controlGroup}>
          <label style={styles.controlLabel}>Grupper etter:</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            style={styles.select}
          >
            <option value="card">Kort</option>
            <option value="person">Person</option>
            <option value="label">Label/Kategori</option>
          </select>
        </div>

        <div style={styles.controlGroup}>
          <label style={styles.controlLabel}>Sorter etter:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={styles.select}
          >
            <option value="deviation">Avvik (størst først)</option>
            <option value="estimated">Estimert tid (mest først)</option>
            <option value="accuracy">Accuracy (lavest først)</option>
            <option value="name">Navn (A-Å)</option>
          </select>
        </div>

        <div style={{ ...styles.controlGroup, marginLeft: "auto" }}>
          <button
            onClick={() => downloadEstimateCSV(aggregated, groupBy)}
            style={styles.exportBtn}
          >
            Eksporter CSV
          </button>
        </div>
      </div>

      {/* Table */}
      {aggregated.length === 0 ? (
        <div style={styles.empty}>
          Ingen estimeringsdata funnet
          {datePreset !== "all" ? " for valgt periode" : " på dette boardet"}.
          <br />
          <span style={{ fontSize: 13, color: "#8993A4" }}>
            Legg inn estimater via Tidstracker-knappen på hvert kort.
          </span>
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>
                {groupBy === "card"
                  ? "Kort"
                  : groupBy === "person"
                    ? "Person"
                    : "Label"}
              </th>
              {groupBy === "card" && <th style={styles.th}>Liste</th>}
              <th style={styles.thRight}>Estimert</th>
              <th style={styles.thRight}>Faktisk</th>
              <th style={styles.thRight}>Gjenstående</th>
              <th style={styles.thRight}>Avvik</th>
              <th style={styles.thRight}>Avvik %</th>
              <th style={styles.thRight}>Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {aggregated.map((row, i) => {
              const hasOriginal =
                row.originalMs != null && row.originalMs !== row.estimatedMs;
              return (
                <tr
                  key={i}
                  style={i % 2 === 0 ? {} : { backgroundColor: "#FAFBFC" }}
                >
                  <td style={styles.td}>{row.label}</td>
                  {groupBy === "card" && (
                    <td style={styles.tdSub}>{row.listName}</td>
                  )}
                  <td style={styles.tdTime}>
                    {formatDuration(row.estimatedMs)}
                    {hasOriginal && (
                      <span
                        style={styles.originalHint}
                        title={`Opprinnelig: ${formatDuration(row.originalMs)}`}
                      >
                        {" "}
                        (oppr. {formatDuration(row.originalMs)})
                      </span>
                    )}
                  </td>
                  <td style={styles.tdTime}>{formatDuration(row.actualMs)}</td>
                  <td style={styles.tdTime}>
                    {formatDuration(row.remainingMs)}
                  </td>
                  <td
                    style={{
                      ...styles.tdTime,
                      color: deviationColor(row.deviationPct),
                    }}
                  >
                    {formatDeviation(row.deviationMs)}
                  </td>
                  <td
                    style={{
                      ...styles.tdTime,
                      color: deviationColor(row.deviationPct),
                    }}
                  >
                    {formatPct(row.deviationPct)}
                  </td>
                  <td
                    style={{
                      ...styles.tdTime,
                      color:
                        row.accuracy !== null
                          ? deviationColor(100 - row.accuracy)
                          : "#5E6C84",
                    }}
                  >
                    {row.accuracy !== null
                      ? row.accuracy.toFixed(0) + "%"
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #DFE1E6" }}>
              <td style={{ ...styles.td, fontWeight: 700 }}>Totalt</td>
              {groupBy === "card" && <td />}
              <td style={{ ...styles.tdTime, fontWeight: 700 }}>
                {formatDuration(summary.totalEstimated)}
              </td>
              <td style={{ ...styles.tdTime, fontWeight: 700 }}>
                {formatDuration(summary.totalActual)}
              </td>
              <td style={{ ...styles.tdTime, fontWeight: 700 }}>
                {formatDuration(summary.totalRemaining)}
              </td>
              <td
                style={{
                  ...styles.tdTime,
                  fontWeight: 700,
                  color: deviationColor(
                    deviationPct(summary.totalEstimated, summary.totalActual),
                  ),
                }}
              >
                {formatDeviation(summary.totalActual - summary.totalEstimated)}
              </td>
              <td
                style={{
                  ...styles.tdTime,
                  fontWeight: 700,
                  color: deviationColor(
                    deviationPct(summary.totalEstimated, summary.totalActual),
                  ),
                }}
              >
                {formatPct(
                  deviationPct(summary.totalEstimated, summary.totalActual),
                )}
              </td>
              <td style={{ ...styles.tdTime, fontWeight: 700 }}>
                {summary.avgAccuracy !== null
                  ? summary.avgAccuracy.toFixed(0) + "%"
                  : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

const styles = {
  center: { textAlign: "center", padding: 24, color: "#5E6C84" },
  empty: {
    textAlign: "center",
    padding: 32,
    color: "#5E6C84",
    fontSize: 15,
  },

  // Summary row
  summaryRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flex: "1 1 140px",
    backgroundColor: "#F4F5F7",
    borderRadius: 6,
    padding: "12px 14px",
    minWidth: 120,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#5E6C84",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 700,
    color: "#172B4D",
    fontVariantNumeric: "tabular-nums",
    fontFamily: "monospace, sans-serif",
  },

  // Original estimate hint
  originalHint: {
    fontWeight: 400,
    fontSize: 11,
    color: "#8993A4",
  },

  // Date filter bar
  dateBar: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "1px solid #DFE1E6",
  },
  datePresets: { display: "flex", flexWrap: "wrap", gap: 4 },
  datePresetBtn: {
    padding: "6px 12px",
    border: "1px solid #DFE1E6",
    borderRadius: 4,
    backgroundColor: "#fff",
    cursor: "pointer",
    fontSize: 13,
    color: "#172B4D",
  },
  datePresetActive: {
    padding: "6px 12px",
    border: "1px solid #0079BF",
    borderRadius: 4,
    backgroundColor: "#E4F0F6",
    cursor: "pointer",
    fontSize: 13,
    color: "#0079BF",
    fontWeight: 600,
  },
  customDateRow: {
    display: "flex",
    gap: 12,
    marginTop: 8,
    alignItems: "center",
  },
  dateLabel: {
    fontSize: 13,
    color: "#5E6C84",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  dateInput: {
    padding: "6px 10px",
    border: "1px solid #DFE1E6",
    borderRadius: 4,
    fontSize: 14,
  },

  // Controls
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-end",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "1px solid #DFE1E6",
  },
  controlGroup: { display: "flex", flexDirection: "column", gap: 4 },
  controlLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#5E6C84",
    textTransform: "uppercase",
  },
  select: {
    padding: "6px 10px",
    border: "1px solid #DFE1E6",
    borderRadius: 4,
    fontSize: 14,
    backgroundColor: "#fff",
    cursor: "pointer",
    height: 34,
    boxSizing: "border-box",
  },
  exportBtn: {
    padding: "0 14px",
    border: "1px solid #DFE1E6",
    borderRadius: 4,
    backgroundColor: "#fff",
    cursor: "pointer",
    fontSize: 13,
    color: "#172B4D",
    height: 34,
    boxSizing: "border-box",
  },

  // Table
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: "#5E6C84",
    padding: "8px 8px",
    borderBottom: "2px solid #DFE1E6",
    whiteSpace: "nowrap",
  },
  thRight: {
    textAlign: "right",
    fontSize: 11,
    fontWeight: 600,
    color: "#5E6C84",
    padding: "8px 8px",
    borderBottom: "2px solid #DFE1E6",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "8px 8px",
    borderBottom: "1px solid #F4F5F7",
    color: "#172B4D",
  },
  tdSub: {
    padding: "8px 8px",
    borderBottom: "1px solid #F4F5F7",
    color: "#5E6C84",
    fontSize: 12,
  },
  tdTime: {
    padding: "8px 8px",
    borderBottom: "1px solid #F4F5F7",
    textAlign: "right",
    fontFamily: "monospace, sans-serif",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
};
