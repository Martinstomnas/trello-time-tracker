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
      {/* Timer display */}
      <div style={styles.timerSection}>
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
          Din totale tid: <strong>{formatDuration(displayTotal)}</strong>
        </div>
      </div>

      {/* Manual adjustment */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Manuell registrering</div>
        <div style={styles.manualRow}>
          <input
            type="text"
            placeholder="f.eks. 1t 30m"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            style={styles.input}
            disabled={saving}
          />
          <button
            onClick={handleManualAdd}
            style={styles.smallBtn}
            disabled={saving || selectedMembers.length === 0}
            title="Legg til tid"
          >
            +
          </button>
          <button
            onClick={handleManualSubtract}
            style={styles.smallBtnRed}
            disabled={saving || selectedMembers.length === 0}
            title="Trekk fra tid"
          >
            −
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
        {boardMembers.length > 1 && (
          <div style={{ marginTop: 6 }}>
            <span style={styles.label}>Personer</span>
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
      </div>

      {/* Per-person breakdown */}
      {members.length > 0 && (
        <div style={styles.section}>
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
                    }}
                  >
                    {formatDuration(m.total)}
                  </td>
                </tr>
              ))}
              {members.length > 1 && (
                <tr>
                  <td style={{ ...styles.td, fontWeight: 600 }}>Totalt</td>
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "right",
                      fontFamily: "monospace",
                      fontWeight: 600,
                    }}
                  >
                    {formatDuration(grandTotal)}
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
  container: { padding: "4px 0", fontSize: 14 },
  center: { textAlign: "center", padding: 24 },
  timerSection: { textAlign: "center", marginBottom: 16 },
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
  section: { marginTop: 12, borderTop: "1px solid #DFE1E6", paddingTop: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#5E6C84",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  manualRow: { display: "flex", alignItems: "baseline" },
  dateRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 6 },
  dateInput: {
    padding: "5px 8px",
    border: "1px solid #DFE1E6",
    borderRadius: 4,
    fontSize: 13,
    color: "#172B4D",
  },
  input: {
    flex: 1,
    padding: "5px 8px",
    border: "1px solid #DFE1E6",
    borderRadius: 4,
    fontSize: 13,
  },
  label: { fontSize: 12, color: "#5E6C84" },
  smallBtn: {
    width: 40,
    height: 32,
    padding: 0,
    border: "1px solid transparent",
    borderRadius: 4,
    backgroundColor: "#61BD4F",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    marginLeft: 6,
  },
  smallBtnRed: {
    width: 40,
    height: 32,
    padding: 0,
    border: "1px solid transparent",
    borderRadius: 4,
    backgroundColor: "#EB5A46",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    marginLeft: 1,
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
};
