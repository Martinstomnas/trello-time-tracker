import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  getBoardTimeReport,
  resetCardTimeById,
  stopActiveTimersByIds,
} from "../utils/storage.js";
import { formatDuration, getTotalWithActive } from "../utils/time.js";
import { downloadCSV, downloadJSON } from "../utils/export.js";
import ReportChart from "../components/ReportChart.jsx";

/**
 * ReportApp – Full-screen modal showing time data aggregated across all board cards.
 *
 * Supports:
 * - Date range filtering (presets + custom)
 * - Grouping by card / person / label
 * - Sorting by name or time
 * - Bar and pie chart visualization
 * - CSV & JSON export (respects active filters)
 */

// ── Date range presets ────────────────────────────────────────────
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
      const diff = day === 0 ? 6 : day - 1; // Monday as start of week
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

function formatDateInput(isoString) {
  if (!isoString) return "";
  return isoString.slice(0, 10); // YYYY-MM-DD
}

export default function ReportApp({ t }) {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupBy, setGroupBy] = useState("card");
  const [sortBy, setSortBy] = useState("time");
  const [chartType, setChartType] = useState("bar");
  const [view, setView] = useState("table");

  // Date filtering
  const [datePreset, setDatePreset] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [activeLabel, setActiveLabel] = useState("Totalt");
  const [confirmReset, setConfirmReset] = useState(null); // { cardId, cardName }
  const [confirmStop, setConfirmStop] = useState(null); // { activeMembers, label }
  const [cardInfoMap, setCardInfoMap] = useState({});
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef(null);
  const pollRef = useRef(null);

  // Build filters from state
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

  // Fetch data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = getFilters();
      const result = await getBoardTimeReport(t, filters);
      setReportData(result.cards);
      setCardInfoMap(result.cardInfoMap);
    } catch (err) {
      console.error("Report load error:", err);
      setError("Kunne ikke laste tidsdata. Prøv igjen.");
    } finally {
      setLoading(false);
    }
  }, [t, getFilters]);

  // Silent reload (no loading spinner) for polling
  const silentReload = useCallback(async () => {
    try {
      const filters = getFilters();
      const result = await getBoardTimeReport(t, filters);
      setReportData(result.cards);
      setCardInfoMap(result.cardInfoMap);
    } catch (err) {
      console.error("Silent reload error:", err);
    }
  }, [t, getFilters]);

  // Load on mount and when filters change
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tick every second when any timer is active
  useEffect(() => {
    const hasActive = reportData.some((card) =>
      Object.values(card.timeData).some((d) => d.activeStart != null),
    );
    if (hasActive) {
      tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    } else {
      clearInterval(tickRef.current);
    }
    return () => clearInterval(tickRef.current);
  }, [reportData]);

  // Poll Supabase every 5s to detect changes from other users
  useEffect(() => {
    const POLL_INTERVAL = 5000;

    const startPolling = () => {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          silentReload();
        }
      }, POLL_INTERVAL);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        silentReload(); // Refresh immediately when tab becomes visible
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

  // Handle preset change
  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    const range = getPresetRange(preset);
    setActiveLabel(range.label);
    if (preset !== "custom") {
      setCustomFrom("");
      setCustomTo("");
    }
  };

  // ── Aggregate data based on groupBy ──────────────────────────────
  const aggregated = useMemo(() => {
    const map = new Map();

    for (const card of reportData) {
      for (const [memberId, mData] of Object.entries(card.timeData)) {
        const ms = getTotalWithActive(mData);
        if (ms === 0) continue;

        const activeMember = mData.activeTimerId
          ? {
              timerId: mData.activeTimerId,
              memberId,
              memberName: mData.name || memberId,
              cardId: card.cardId,
              cardName: card.cardName,
            }
          : null;

        if (groupBy === "card") {
          const key = card.cardId;
          const existing = map.get(key) || {
            cardId: card.cardId,
            label: card.cardName,
            totalMs: 0,
            sublabel: card.listName,
            activeMembers: [],
          };
          existing.totalMs += ms;
          if (activeMember) existing.activeMembers.push(activeMember);
          map.set(key, existing);
        } else if (groupBy === "person") {
          const key = memberId;
          const existing = map.get(key) || {
            label: mData.name || memberId,
            totalMs: 0,
            activeMembers: [],
          };
          existing.totalMs += ms;
          if (activeMember) existing.activeMembers.push(activeMember);
          map.set(key, existing);
        } else if (groupBy === "label") {
          const labels =
            card.labels.length > 0
              ? card.labels
              : [{ name: "Uten label", color: "gray" }];
          for (const lbl of labels) {
            const key = lbl.name || lbl.color;
            const existing = map.get(key) || {
              label: key,
              totalMs: 0,
              color: lbl.color,
              activeMembers: [],
            };
            existing.totalMs += ms;
            if (activeMember) existing.activeMembers.push(activeMember);
            map.set(key, existing);
          }
        }
      }
    }

    let results = Array.from(map.values());
    if (sortBy === "time") {
      results.sort((a, b) => b.totalMs - a.totalMs);
    } else {
      results.sort((a, b) => a.label.localeCompare(b.label));
    }
    return results;
  }, [reportData, groupBy, sortBy, now]);

  const grandTotal = aggregated.reduce((s, r) => s + r.totalMs, 0);

  const handleReset = useCallback(
    async (cardId) => {
      await resetCardTimeById(cardId);
      setConfirmReset(null);
      await loadData();
    },
    [loadData],
  );

  const handleStop = useCallback(
    async (activeMembers) => {
      const timerIds = activeMembers.map((m) => m.timerId);
      await stopActiveTimersByIds(timerIds, cardInfoMap);
      setConfirmStop(null);
      await loadData();
    },
    [loadData, cardInfoMap],
  );

  if (loading) {
    return <div style={styles.center}>Laster rapport...</div>;
  }

  if (error) {
    return <div style={{ ...styles.center, color: "#EB5A46" }}>{error}</div>;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Tidsrapport</h2>
        <div style={styles.totalBadge}>
          {activeLabel}:{" "}
          <strong style={styles.totalBadgeTime}>
            {formatDuration(grandTotal)}
          </strong>
        </div>
      </div>

      {/* Date filter bar */}
      <div style={styles.dateBar}>
        <div style={styles.datePresets}>
          {[
            ["all", "Alt"],
            ["today", "I dag"],
            ["yesterday", "I går"],
            ["this-week", "Denne uken"],
            ["last-week", "Forrige uke"],
            ["this-month", "Denne mnd"],
            ["last-month", "Forrige mnd"],
            ["this-year", "I år"],
            ["custom", "Egendefinert"],
          ].map(([key, label]) => (
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
          <label style={styles.label}>Grupper etter:</label>
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
          <label style={styles.label}>Sorter etter:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={styles.select}
          >
            <option value="time">Tid (mest først)</option>
            <option value="name">Navn (A-Å)</option>
          </select>
        </div>

        <div style={styles.controlGroup}>
          <label style={{ ...styles.label, position: "relative", top: 8 }}>
            Visning:
          </label>
          <div style={styles.toggleGroup}>
            <button
              onClick={() => setView("table")}
              style={view === "table" ? styles.toggleActive : styles.toggle}
            >
              Tabell
            </button>
            <button
              onClick={() => setView("chart")}
              style={view === "chart" ? styles.toggleActive : styles.toggle}
            >
              Graf
            </button>
          </div>
        </div>

        {view === "chart" && (
          <div style={{ ...styles.controlGroup, marginLeft: -4 }}>
            <label style={styles.label}>Graftype:</label>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value)}
              style={styles.select}
            >
              <option value="bar">Stolpediagram</option>
              <option value="pie">Sektordiagram</option>
            </select>
          </div>
        )}

        <div style={{ ...styles.controlGroup, marginLeft: "auto" }}>
          <button
            onClick={() => downloadCSV(reportData)}
            style={styles.exportBtn}
          >
            Eksporter CSV
          </button>
          <button
            onClick={() => downloadJSON(reportData)}
            style={styles.exportBtn}
          >
            Eksporter JSON
          </button>
        </div>
      </div>

      {/* Content */}
      {aggregated.length === 0 ? (
        <div style={styles.empty}>
          Ingen tidsdata funnet
          {datePreset !== "all" ? " for valgt periode" : " på dette boardet"}.
        </div>
      ) : view === "table" ? (
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
              {groupBy === "person" && <th style={styles.th}>Aktive kort</th>}
              <th style={styles.thTime}>Tid</th>
              <th
                style={{
                  ...styles.th,
                  textAlign: "right",
                  whiteSpace: "nowrap",
                }}
              >
                Andel
              </th>
              {groupBy === "card" && (
                <th
                  style={{
                    ...styles.th,
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                ></th>
              )}
            </tr>
          </thead>
          <tbody>
            {aggregated.map((row, i) => (
              <tr
                key={i}
                style={i % 2 === 0 ? {} : { backgroundColor: "#FAFBFC" }}
              >
                <td style={styles.td}>
                  {groupBy === "label" && row.color && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        backgroundColor: trelloLabelColor(row.color),
                        marginRight: 6,
                        verticalAlign: "middle",
                      }}
                    />
                  )}
                  {row.label}
                </td>
                {groupBy === "card" && (
                  <td style={styles.tdSub}>{row.sublabel || ""}</td>
                )}
                {groupBy === "person" && (
                  <td style={styles.tdSub}>
                    {row.activeMembers?.length > 0
                      ? row.activeMembers.map((m) => m.cardName).join(", ")
                      : "—"}
                  </td>
                )}
                <td style={styles.tdTime}>
                  {row.activeMembers?.length > 0 ? (
                    <span
                      onClick={() =>
                        setConfirmStop({
                          activeMembers: row.activeMembers,
                          label: row.label,
                        })
                      }
                      style={styles.activeTimeText}
                      title="Klikk for å stoppe aktiv tracking"
                    >
                      {formatDuration(row.totalMs)}
                    </span>
                  ) : (
                    formatDuration(row.totalMs)
                  )}
                </td>
                <td
                  style={{
                    ...styles.td,
                    textAlign: "right",
                    color: "#5E6C84",
                    whiteSpace: "nowrap",
                  }}
                >
                  {grandTotal > 0
                    ? ((row.totalMs / grandTotal) * 100).toFixed(1) + "%"
                    : "—"}
                </td>
                {groupBy === "card" && (
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "center",
                      padding: "4px 6px",
                      verticalAlign: "middle",
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <button
                      onClick={() =>
                        setConfirmReset({
                          cardId: row.cardId,
                          cardName: row.label,
                        })
                      }
                      style={styles.resetBtn}
                    >
                      Tilbakestill tid
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr
              style={{
                borderTop: "2px solid #DFE1E6",
                borderBottom: "2px solid #DFE1E6",
              }}
            >
              <td style={{ ...styles.td, fontWeight: 700 }}>Totalt</td>
              {groupBy === "card" && <td />}
              {groupBy === "person" && <td style={styles.td} />}
              <td style={{ ...styles.tdTime, fontWeight: 700 }}>
                {formatDuration(grandTotal)}
              </td>
              <td style={{ ...styles.td, textAlign: "right" }}>100%</td>
              {groupBy === "card" && <td />}
            </tr>
          </tfoot>
        </table>
      ) : (
        <div style={styles.chartContainer}>
          <ReportChart data={aggregated} chartType={chartType} />
        </div>
      )}
      {/* Reset confirmation dialog */}
      {confirmReset && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <p style={styles.dialogText}>
              Er du sikker på at du vil tilbakestille all tid for{" "}
              <strong>{confirmReset.cardName}</strong>? Dette kan ikke angres.
            </p>
            <div style={styles.dialogButtons}>
              <button
                onClick={() => setConfirmReset(null)}
                style={styles.dialogCancel}
              >
                Avbryt
              </button>
              <button
                onClick={() => handleReset(confirmReset.cardId)}
                style={styles.dialogConfirm}
              >
                Tilbakestill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop timer confirmation dialog */}
      {confirmStop && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <p style={styles.dialogText}>
              Stopp aktiv tidstracking for <strong>{confirmStop.label}</strong>?
            </p>
            <div style={styles.activeList}>
              {confirmStop.activeMembers.map((m, i) => (
                <div key={i} style={styles.activeListItem}>
                  <span style={styles.activeDot} />
                  <span>{m.memberName}</span>
                  {groupBy !== "card" && (
                    <span style={styles.activeCardName}> – {m.cardName}</span>
                  )}
                </div>
              ))}
            </div>
            <div style={styles.dialogButtons}>
              <button
                onClick={() => setConfirmStop(null)}
                style={styles.dialogCancel}
              >
                Avbryt
              </button>
              <button
                onClick={() => handleStop(confirmStop.activeMembers)}
                style={styles.dialogStopBtn}
              >
                Stopp tid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Trello label color mapping
function trelloLabelColor(color) {
  const map = {
    // Green
    green_light: "#BAF3DB",
    green: "#4BCE97",
    green_dark: "#1F845A",
    // Yellow
    yellow_light: "#F5E989",
    yellow: "#EED12B",
    yellow_dark: "#946F00",
    // Orange
    orange_light: "#FCE4A6",
    orange: "#FCA700",
    orange_dark: "#BD5B00",
    // Red
    red_light: "#FFD5D2",
    red: "#F87168",
    red_dark: "#C9372C",
    // Purple
    purple_light: "#EED7FC",
    purple: "#C97CF4",
    purple_dark: "#964AC0",
    // Blue
    blue_light: "#CFE1FD",
    blue: "#669DF1",
    blue_dark: "#1868DB",
    // Sky (teal i Atlassian)
    sky_light: "#C6EDFB",
    sky: "#6CC3E0",
    sky_dark: "#227D9B",
    // Lime
    lime_light: "#D3F1A7",
    lime: "#94C748",
    lime_dark: "#5B7F24",
    // Pink (magenta i Atlassian)
    pink_light: "#FDD0EC",
    pink: "#E774BB",
    pink_dark: "#AE4787",
    // Black (gray i Atlassian)
    black_light: "#DDDEE1",
    black: "#8C8F97",
    black_dark: "#6B6E76",
  };
  return map[color] || "#8C8F97";
}

// Styles
const styles = {
  container: {
    maxWidth: 960,
    margin: "0 auto",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
  },
  center: { textAlign: "center", padding: 48, fontSize: 16, color: "#5E6C84" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { margin: 0, fontSize: 22, color: "#172B4D" },
  totalBadge: {
    backgroundColor: "#E4F0F6",
    color: "#0079BF",
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: 15,
  },
  totalBadgeTime: {
    fontVariantNumeric: "tabular-nums",
    fontFamily: "monospace, sans-serif",
  },

  // Date filter bar
  dateBar: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "1px solid #DFE1E6",
  },
  datePresets: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
  },
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
  label: {
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
    verticalAlign: "middle",
  },
  toggleGroup: { display: "flex", gap: 0, height: 50 },
  toggle: {
    padding: "0 14px",
    border: "1px solid #DFE1E6",
    backgroundColor: "#fff",
    cursor: "pointer",
    fontSize: 13,
    height: 34,
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    verticalAlign: "middle",
  },
  toggleActive: {
    padding: "0 14px",
    border: "1px solid #0079BF",
    backgroundColor: "#E4F0F6",
    color: "#0079BF",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    height: 34,
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    verticalAlign: "middle",
  },
  exportBtn: {
    padding: "0 14px",
    border: "1px solid #DFE1E6",
    borderRadius: 4,
    backgroundColor: "#fff",
    cursor: "pointer",
    fontSize: 13,
    marginLeft: 4,
    height: 34,
    boxSizing: "border-box",
    verticalAlign: "middle",
  },

  // Content
  empty: { textAlign: "center", padding: 48, color: "#5E6C84", fontSize: 15 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: "#5E6C84",
    textTransform: "uppercase",
    padding: "8px 10px",
    borderBottom: "2px solid #DFE1E6",
    backgroundColor: "#fff",
  },
  thTime: {
    textAlign: "right",
    fontSize: 11,
    fontWeight: 600,
    color: "#5E6C84",
    textTransform: "uppercase",
    padding: "8px 10px",
    borderBottom: "2px solid #DFE1E6",
    backgroundColor: "#fff",
    whiteSpace: "nowrap",
    width: 140,
  },
  td: {
    padding: "8px 10px",
    fontSize: 14,
    borderBottom: "1px solid #F4F5F7",
    color: "#172B4D",
    backgroundColor: "inherit",
  },
  tdTime: {
    padding: "8px 10px",
    fontSize: 14,
    borderBottom: "1px solid #F4F5F7",
    color: "#172B4D",
    backgroundColor: "inherit",
    textAlign: "right",
    fontWeight: 600,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    fontFamily: "monospace, sans-serif",
    width: 140,
  },
  tdSub: {
    padding: "8px 10px",
    fontSize: 13,
    borderBottom: "1px solid #F4F5F7",
    color: "#5E6C84",
    backgroundColor: "inherit",
  },
  chartContainer: { padding: "16px 0", maxHeight: 420 },

  resetBtn: {
    padding: "2px 8px",
    border: "1px solid #DFE1E6",
    borderRadius: 4,
    backgroundColor: "#fff",
    cursor: "pointer",
    fontSize: 12,
    color: "#5E6C84",
    display: "block",
    margin: "0 auto",
  },

  // Confirmation dialog
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 24,
    maxWidth: 400,
    width: "90%",
    boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
  },
  dialogText: {
    fontSize: 15,
    color: "#172B4D",
    margin: "0 0 16px 0",
    lineHeight: 1.5,
  },
  dialogButtons: { display: "flex", justifyContent: "flex-end", gap: 8 },
  dialogCancel: {
    padding: "8px 16px",
    border: "1px solid #DFE1E6",
    borderRadius: 4,
    backgroundColor: "#fff",
    cursor: "pointer",
    fontSize: 14,
    color: "#172B4D",
  },
  dialogConfirm: {
    padding: "8px 16px",
    border: "none",
    borderRadius: 4,
    backgroundColor: "#EB5A46",
    cursor: "pointer",
    fontSize: 14,
    color: "#fff",
    fontWeight: 600,
  },
  dialogStopBtn: {
    padding: "8px 16px",
    border: "none",
    borderRadius: 4,
    backgroundColor: "#EB5A46",
    cursor: "pointer",
    fontSize: 14,
    color: "#fff",
    fontWeight: 600,
  },

  // Active time
  activeTimeText: {
    color: "#61BD4F",
    cursor: "pointer",
    textDecoration: "none",
    borderBottom: "1px dashed #61BD4F",
    paddingBottom: 1,
  },
  activeList: {
    margin: "12px 0",
    padding: "8px 12px",
    backgroundColor: "#FAFBFC",
    borderRadius: 4,
    border: "1px solid #DFE1E6",
  },
  activeListItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 0",
    fontSize: 14,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#61BD4F",
    flexShrink: 0,
  },
  activeCardName: {
    color: "#5E6C84",
    fontSize: 13,
  },
};
