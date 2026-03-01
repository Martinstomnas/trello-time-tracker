import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  getCardTimeData,
  startTimer,
  stopTimer,
  adjustTime,
} from "../utils/storage.js";
import {
  formatDuration,
  formatTimer,
  parseDuration,
  getTotalWithActive,
} from "../utils/time.js";

/**
 * TimerApp – Card-level timer popup.
 * Only time tracking: start/stop, manual entry, per-person breakdown.
 * Estimates are managed in a separate popup (EstimateCardApp).
 */
export default function TimerApp({ t }) {
  const [timeData, setTimeData] = useState({});
  const [memberId, setMemberId] = useState(null);
  const [memberName, setMemberName] = useState("");
  const [now, setNow] = useState(Date.now());
  const [manualInput, setManualInput] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [selectedMembers, setSelectedMembers] = useState(["self"]);
  const [boardMembers, setBoardMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const tickRef = useRef(null);
  const pollRef = useRef(null);

  const toggleMember = useCallback((id) => {
    setSelectedMembers((prev) => {
      if (prev.includes(id)) {
        return prev.filter((m) => m !== id);
      }
      return [...prev, id];
    });
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const data = await getCardTimeData(t);
      setTimeData(data);
      setNow(Date.now());
      return data;
    } catch (e) {
      console.error("[TimeTracker] refreshData error:", e);
      return {};
    }
  }, [t]);

  const touchBadges = useCallback(async () => {
    try {
      await t.set("card", "shared", "lastUpdate", Date.now());
    } catch (e) {
      // ignore
    }
  }, [t]);

  useEffect(() => {
    async function init() {
      const member = await t.member("id", "fullName");
      setMemberId(member.id);
      setMemberName(member.fullName);
      let members = [];
      try {
        const board = await t.board("members");
        members = board.members || [];
        setBoardMembers(members);
      } catch (e) {
        console.warn("[TimeTracker] Could not fetch board members:", e);
      }
      const data = await refreshData();

      const activeIds = Object.keys(data).filter(
        (id) => data[id]?.activeStart != null,
      );
      if (activeIds.length > 0) {
        const selected = activeIds.map((id) =>
          id === member.id ? "self" : id,
        );
        setSelectedMembers(selected);
      }
      setLoading(false);
    }
    init();
  }, [t, refreshData]);

  useEffect(() => {
    const hasActive = Object.values(timeData).some(
      (d) => d.activeStart != null,
    );
    if (hasActive) {
      tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    } else {
      clearInterval(tickRef.current);
    }
    return () => clearInterval(tickRef.current);
  }, [timeData]);

  useEffect(() => {
    const POLL_INTERVAL = 5000;
    const startPolling = () => {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          refreshData();
        }
      }, POLL_INTERVAL);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshData();
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
  }, [refreshData]);

  const displayTotal = useMemo(() => {
    if (!memberId || !timeData[memberId]) return 0;
    return getTotalWithActive(timeData[memberId]);
  }, [memberId, timeData, now]);

  const getTargetMembers = useCallback(() => {
    return selectedMembers
      .map((id) => {
        if (id === "self") return null;
        const bm = boardMembers.find((m) => m.id === id);
        return bm ? { id: bm.id, fullName: bm.fullName } : null;
      })
      .filter((m) => m !== undefined);
  }, [selectedMembers, boardMembers]);

  const allSelectedRunning =
    selectedMembers.length > 0 &&
    selectedMembers.every((id) => {
      const mId = id === "self" ? memberId : id;
      return timeData[mId]?.activeStart != null;
    });

  const anySelectedRunning = selectedMembers.some((id) => {
    const mId = id === "self" ? memberId : id;
    return timeData[mId]?.activeStart != null;
  });

  const handleToggle = useCallback(async () => {
    if (selectedMembers.length === 0) return;
    setSaving(true);
    try {
      const targets = getTargetMembers();
      if (allSelectedRunning) {
        for (const target of targets) {
          await stopTimer(t, target);
        }
      } else {
        for (const target of targets) {
          const mId = target ? target.id : memberId;
          if (!timeData[mId]?.activeStart) {
            await startTimer(t, target);
          }
        }
      }
      await refreshData();
      await touchBadges();
    } catch (e) {
      console.error("[TimeTracker] toggle error:", e);
    }
    setSaving(false);
  }, [
    t,
    selectedMembers,
    allSelectedRunning,
    getTargetMembers,
    memberId,
    timeData,
    refreshData,
    touchBadges,
  ]);

  const handleManualAdd = useCallback(async () => {
    const ms = parseDuration(manualInput);
    const targets = getTargetMembers();
    if (ms > 0 && targets.length > 0) {
      setSaving(true);
      for (const target of targets) {
        await adjustTime(t, ms, manualDate || undefined, target);
      }
      await refreshData();
      await touchBadges();
      setManualInput("");
      setSaving(false);
    }
  }, [t, manualInput, manualDate, getTargetMembers, refreshData, touchBadges]);

  const handleManualSubtract = useCallback(async () => {
    const ms = parseDuration(manualInput);
    const targets = getTargetMembers();
    if (ms > 0 && targets.length > 0) {
      setSaving(true);
      for (const target of targets) {
        await adjustTime(t, -ms, manualDate || undefined, target);
      }
      await refreshData();
      await touchBadges();
      setManualInput("");
      setSaving(false);
    }
  }, [t, manualInput, manualDate, getTargetMembers, refreshData, touchBadges]);

  if (loading) {
    return <div style={styles.center}>Laster...</div>;
  }

  const members = Object.entries(timeData)
    .map(([id, d]) => ({
      id,
      name: d.name || id,
      total: getTotalWithActive(d),
      active: d.activeStart != null,
    }))
    .filter((m) => m.total > 0 || m.active)
    .sort((a, b) => b.total - a.total);

  const grandTotal = members.reduce((s, m) => s + m.total, 0);

  const getToggleLabel = () => {
    if (saving) return "...";
    if (selectedMembers.length === 0) return "▶ Start";
    if (allSelectedRunning) return "⏹ Stopp";
    if (anySelectedRunning) return "▶ Start";
    return "▶ Start";
  };

  const getToggleColor = () => {
    if (saving || selectedMembers.length === 0) return "#A5ADBA";
    if (allSelectedRunning) return "#EB5A46";
    return "#61BD4F";
  };

  return (
    <div style={styles.container}>
      {/* ── Top row: 3-column layout ── */}
      <div style={styles.topRow}>
        {/* LEFT: Person checkboxes */}
        {boardMembers.length > 1 && (
          <div style={styles.leftCol}>
            <div style={styles.sectionTitle}>Personer</div>
            <div style={styles.memberCheckboxList}>
              <label style={styles.memberCheckbox}>
                <input
                  type="checkbox"
                  checked={selectedMembers.includes("self")}
                  onChange={() => toggleMember("self")}
                  disabled={saving}
                  style={{ margin: 0 }}
                />
                <span>Meg selv</span>
              </label>
              {boardMembers
                .filter((m) => m.id !== memberId)
                .map((m) => (
                  <label key={m.id} style={styles.memberCheckbox}>
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(m.id)}
                      onChange={() => toggleMember(m.id)}
                      disabled={saving}
                      style={{ margin: 0 }}
                    />
                    <span>{m.fullName}</span>
                  </label>
                ))}
            </div>
          </div>
        )}

        {/* CENTER: Timer display + toggle + total */}
        <div style={styles.centerCol}>
          <div style={styles.timerDisplay}>{formatTimer(displayTotal)}</div>
          <button
            onClick={handleToggle}
            disabled={saving || selectedMembers.length === 0}
            style={{
              ...styles.toggleBtn,
              backgroundColor: getToggleColor(),
            }}
          >
            {getToggleLabel()}
          </button>
          <div style={styles.myTotal}>
            Din totale tid:{" "}
            <strong>{formatDuration(displayTotal, true)}</strong>
          </div>
        </div>

        {/* RIGHT: Manual registration */}
        <div style={styles.rightCol}>
          <div style={styles.sectionTitle}>Manuell registrering</div>
          <div style={styles.manualRow}>
            <button
              onClick={handleManualSubtract}
              style={styles.smallBtnRed}
              disabled={saving || selectedMembers.length === 0}
              title="Trekk fra tid"
            >
              Trekk
              <br />
              fra
            </button>
            <input
              type="text"
              placeholder="f.eks. 2t"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleManualAdd();
              }}
              style={styles.input}
              disabled={saving}
            />
            <button
              onClick={handleManualAdd}
              style={styles.smallBtn}
              disabled={saving || selectedMembers.length === 0}
              title="Legg til tid"
            >
              Legg
              <br />
              til
            </button>
          </div>
          <div style={{ marginTop: 6 }}>
            <span style={styles.label}>Dato</span>
            <div style={styles.dateRow}>
              <input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                style={styles.dateInput}
                disabled={saving}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Table: Per-person breakdown (full width) ── */}
      {members.length > 0 && (
        <div style={styles.tableSection}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Person</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Tid</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td style={styles.td}>
                    {m.name}
                    {m.id === memberId ? " (deg)" : ""}
                    {m.active ? " 🟢" : ""}
                  </td>
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "right",
                      fontFamily: "monospace",
                      fontWeight: 600,
                    }}
                  >
                    {m.active ? (
                      <span style={styles.activeTimeText}>
                        {formatDuration(m.total, false)}
                      </span>
                    ) : (
                      formatDuration(m.total, true)
                    )}
                  </td>
                </tr>
              ))}
              {members.length > 1 && (
                <tr>
                  <td
                    style={{ ...styles.td, ...styles.totalTd, fontWeight: 600 }}
                  >
                    Totalt
                  </td>
                  <td
                    style={{
                      ...styles.td,
                      ...styles.totalTd,
                      textAlign: "right",
                      fontFamily: "monospace",
                      fontWeight: 600,
                    }}
                  >
                    {members.some((m) => m.active) ? (
                      <span style={styles.activeTimeText}>
                        {formatDuration(grandTotal, false)}
                      </span>
                    ) : (
                      formatDuration(grandTotal, true)
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { padding: "4px 20px", fontSize: 14 },
  center: { textAlign: "center", padding: 24 },

  /* ── 3-column top row ── */
  topRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    padding: "8px 0",
  },
  leftCol: {
    flex: "0 0 auto",
    minWidth: 130,
  },
  centerCol: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
  },
  rightCol: {
    flex: "0 0 auto",
    width: 160,
  },

  /* ── Timer ── */
  timerDisplay: {
    fontSize: 36,
    fontWeight: 700,
    fontFamily: "monospace",
    letterSpacing: 2,
    margin: "8px 0",
    color: "#172B4D",
  },
  toggleBtn: {
    border: "none",
    borderRadius: 6,
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
    padding: "10px 32px",
    cursor: "pointer",
    marginBottom: 8,
  },
  myTotal: { fontSize: 13, color: "#5E6C84", marginTop: 4 },

  /* ── Section titles ── */
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#5E6C84",
    textTransform: "uppercase",
    marginBottom: 6,
  },

  /* ── Manual registration ── */
  manualRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  input: {
    flex: 1,
    height: 32,
    padding: "5px 8px",
    border: "1px solid #DFE1E6",
    borderRadius: 4,
    fontSize: 13,
    lineHeight: 1,
    minWidth: 0,
    boxSizing: "border-box",
    margin: 0,
  },
  smallBtn: {
    width: 40,
    height: 32,
    padding: 0,
    margin: 0,
    border: "1px solid transparent",
    borderRadius: 4,
    backgroundColor: "#61BD4F",
    color: "#fff",
    fontSize: 9,
    lineHeight: 1.1,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    flexShrink: 0,
    textAlign: "center",
  },
  smallBtnRed: {
    width: 40,
    height: 32,
    padding: 0,
    margin: 0,
    border: "1px solid transparent",
    borderRadius: 4,
    backgroundColor: "#EB5A46",
    color: "#fff",
    fontSize: 9,
    lineHeight: 1.1,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    flexShrink: 0,
    textAlign: "center",
  },
  dateRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 4 },
  dateInput: {
    padding: "5px 8px",
    border: "1px solid #DFE1E6",
    borderRadius: 4,
    fontSize: 13,
    color: "#172B4D",
    width: "100%",
    boxSizing: "border-box",
  },
  label: { fontSize: 12, color: "#5E6C84" },

  /* ── Person checkboxes ── */
  memberCheckboxList: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
    marginTop: 4,
    padding: "0",
  },
  memberCheckbox: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "#172B4D",
    cursor: "pointer",
    margin: 0,
    padding: "2px 0",
    minHeight: 24,
  },

  /* ── Table section ── */
  tableSection: {
    marginTop: 16,
    borderTop: "1px solid #DFE1E6",
    paddingTop: 10,
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: 11,
    color: "#5E6C84",
    padding: "4px 6px",
    borderBottom: "1px solid #DFE1E6",
  },
  td: { padding: "5px 6px", fontSize: 13, borderBottom: "1px solid #F4F5F7" },
  totalTd: { borderTop: "2px solid #DFE1E6" },

  activeTimeText: {
    color: "#61BD4F",
    textDecoration: "none",
    borderBottom: "1px dashed #61BD4F",
    paddingBottom: 1,
  },
};
