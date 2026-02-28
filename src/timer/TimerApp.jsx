import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  getCardTimeData,
  startTimer,
  stopTimer,
  adjustTime,
} from "../utils/storage.js";
import {
  formatTimer,
  formatDuration,
  getTotalWithActive,
  parseDuration,
} from "../utils/time.js";
import {
  getCardEstimates,
  setEstimate,
  removeEstimate,
} from "../utils/estimateStorage.js";

/**
 * TimerApp – The popup shown when a user clicks "Tidstracker" on a card.
 */
export default function TimerApp({ t }) {
  const [timeData, setTimeData] = useState({});
  const [memberId, setMemberId] = useState(null);
  const [memberName, setMemberName] = useState(""); // reserved for future use
  const [now, setNow] = useState(Date.now());
  const [manualInput, setManualInput] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [selectedMembers, setSelectedMembers] = useState(["self"]);
  const [boardMembers, setBoardMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [estimates, setEstimates] = useState({});
  const [estimateInput, setEstimateInput] = useState("");
  const [estimateExpanded, setEstimateExpanded] = useState(false);
  const [savingEstimate, setSavingEstimate] = useState(false);
  const tickRef = useRef(null);
  const pollRef = useRef(null);

  // Toggle a member in the multi-select
  const toggleMember = useCallback((id) => {
    setSelectedMembers((prev) => {
      if (prev.includes(id)) {
        return prev.filter((m) => m !== id);
      }
      return [...prev, id];
    });
  }, []);

  // Fetch fresh data from Supabase
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

  const refreshEstimates = useCallback(async () => {
    try {
      const data = await getCardEstimates(t);
      setEstimates(data);
    } catch (e) {
      console.error("[TimeTracker] refreshEstimates error:", e);
    }
  }, [t]);

  // Load data on mount
  useEffect(() => {
    async function init() {
      const member = await t.member("id", "fullName");
      setMemberId(member.id);
      setMemberName(member.fullName);
      // Fetch board members for the multi-select
      let members = [];
      try {
        const board = await t.board("members");
        members = board.members || [];
        setBoardMembers(members);
      } catch (e) {
        console.warn("[TimeTracker] Could not fetch board members:", e);
      }
      const data = await refreshData();
      await refreshEstimates();

      // Pre-select members that have active timers on this card
      const activeIds = Object.keys(data).filter(
        (id) => data[id]?.activeStart != null,
      );
      if (activeIds.length > 0) {
        const selected = activeIds.map((id) =>
          id === member.id ? "self" : id,
        );
        // Ensure "self" is included if current user has an active timer
        setSelectedMembers(selected);
      }
      // else: keep default ["self"]

      setLoading(false);
    }
    init();
  }, [t, refreshData]);

  // Tick every second when any member has an active timer
  useEffect(() => {
    const hasActiveTimer = Object.values(timeData).some(
      (d) => d.activeStart != null,
    );

    if (hasActiveTimer) {
      tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    } else {
      clearInterval(tickRef.current);
    }
    return () => clearInterval(tickRef.current);
  }, [timeData]);

  // Poll Supabase every 5s to detect changes from other users
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
        refreshData(); // Refresh immediately when tab becomes visible
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

  // Derived state for current user
  const myData = memberId ? timeData[memberId] : null;
  const myTotal = myData ? getTotalWithActive(myData) : 0;
  const isRunning = myData?.activeStart != null;
  const displayTotal = isRunning
    ? (myData.totalMs || 0) + (now - myData.activeStart)
    : myTotal;

  // Get target members from checkbox selection (returns array of { id, fullName } or undefined for self)
  const getTargetMembers = useCallback(() => {
    return selectedMembers
      .map((id) => {
        if (id === "self") return undefined; // undefined = current user
        const m = boardMembers.find((bm) => bm.id === id);
        return m ? { id: m.id, fullName: m.fullName } : null;
      })
      .filter((m) => m !== null);
  }, [selectedMembers, boardMembers]);

  // Check if ALL selected members have active timers
  const allSelectedRunning =
    selectedMembers.length > 0 &&
    selectedMembers.every((id) => {
      const mId = id === "self" ? memberId : id;
      return timeData[mId]?.activeStart != null;
    });

  // Check if ANY selected member has an active timer
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
        // All are running — stop all selected
        for (const target of targets) {
          await stopTimer(t, target);
        }
      } else {
        // Start those that aren't running yet
        for (const target of targets) {
          const mId = target ? target.id : memberId;
          if (!timeData[mId]?.activeStart) {
            await startTimer(t, target);
          }
        }
      }
      await refreshData();
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
      setManualInput("");
      setSaving(false);
    }
  }, [t, manualInput, manualDate, getTargetMembers, refreshData]);

  const handleManualSubtract = useCallback(async () => {
    const ms = parseDuration(manualInput);
    const targets = getTargetMembers();
    if (ms > 0 && targets.length > 0) {
      setSaving(true);
      for (const target of targets) {
        await adjustTime(t, -ms, manualDate || undefined, target);
      }
      await refreshData();
      setManualInput("");
      setSaving(false);
    }
  }, [t, manualInput, manualDate, getTargetMembers, refreshData]);

  const handleSetEstimate = useCallback(
    async (input) => {
      const ms = parseDuration(input);
      if (!ms || ms <= 0) return;

      setSavingEstimate(true);
      try {
        const targets =
          selectedMembers.includes("self") && selectedMembers.length === 1
            ? [null]
            : selectedMembers
                .map((id) => {
                  if (id === "self")
                    return { id: memberId, fullName: memberName };
                  const bm = boardMembers.find((m) => m.id === id);
                  return bm ? { id: bm.id, fullName: bm.fullName } : null;
                })
                .filter(Boolean);

        for (const target of targets) {
          await setEstimate(t, ms, target);
        }

        setEstimateInput("");
        await refreshEstimates();
      } catch (e) {
        console.error("[TimeTracker] handleSetEstimate error:", e);
      } finally {
        setSavingEstimate(false);
      }
    },
    [t, selectedMembers, memberId, memberName, boardMembers, refreshEstimates],
  );

  const handleRemoveEstimate = useCallback(
    async (targetMemberId) => {
      setSavingEstimate(true);
      try {
        const target =
          targetMemberId === memberId ? null : { id: targetMemberId };
        await removeEstimate(t, target);
        await refreshEstimates();
      } catch (e) {
        console.error("[TimeTracker] handleRemoveEstimate error:", e);
      } finally {
        setSavingEstimate(false);
      }
    },
    [t, memberId, refreshEstimates],
  );

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

  // Button label logic
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
                <th style={{ ...styles.th, textAlign: "right", width: 120 }}>
                  Tid
                </th>
                <th style={{ ...styles.th, textAlign: "center", width: 40 }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td style={styles.td}>{m.name}</td>
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontFamily: "monospace, sans-serif",
                      whiteSpace: "nowrap",
                      width: 120,
                    }}
                  >
                    {formatDuration(m.total)}
                  </td>
                  <td style={{ ...styles.td, textAlign: "center" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: m.active ? "#61BD4F" : "#D3D3D3",
                      }}
                      title={m.active ? "Timer kjører" : "Inaktiv"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderBottom: "1px solid #DFE1E6" }}>
                <td
                  style={{
                    ...styles.td,
                    borderBottom: "none",
                    fontWeight: 600,
                  }}
                >
                  Totalt
                </td>
                <td
                  style={{
                    ...styles.td,
                    borderBottom: "none",
                    textAlign: "right",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: "monospace, sans-serif",
                    whiteSpace: "nowrap",
                    width: 120,
                  }}
                >
                  {formatDuration(grandTotal)}
                </td>
                <td style={{ ...styles.td, borderBottom: "none" }} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Estimat-seksjon ─────────────────────────────────── */}
      <div style={styles.section}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
          }}
          onClick={() => setEstimateExpanded(!estimateExpanded)}
        >
          <span style={styles.sectionTitle}>
            Estimat{" "}
            {Object.keys(estimates).length > 0
              ? `(${Object.keys(estimates).length})`
              : ""}
          </span>
          <span style={{ fontSize: 12, color: "#5E6C84" }}>
            {estimateExpanded ? "▲" : "▼"}
          </span>
        </div>

        {estimateExpanded && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              <input
                type="text"
                placeholder="f.eks. 2t 30m"
                value={estimateInput}
                onChange={(e) => setEstimateInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSetEstimate(estimateInput);
                }}
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  border: "1px solid #DFE1E6",
                  borderRadius: 4,
                  fontSize: 13,
                }}
                disabled={savingEstimate}
              />
              <button
                onClick={() => handleSetEstimate(estimateInput)}
                disabled={savingEstimate || !estimateInput.trim()}
                style={{
                  ...styles.smallBtn,
                  backgroundColor: "#0079BF",
                  opacity: savingEstimate || !estimateInput.trim() ? 0.5 : 1,
                }}
                title="Sett estimat"
              >
                ✓
              </button>
            </div>

            <div style={{ fontSize: 11, color: "#8993A4", marginBottom: 8 }}>
              Settes for valgte person(er) over.
            </div>

            {Object.keys(estimates).length > 0 && (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, fontSize: 10 }}>Person</th>
                    <th
                      style={{
                        ...styles.th,
                        fontSize: 10,
                        textAlign: "right",
                      }}
                    >
                      Estimat
                    </th>
                    <th
                      style={{
                        ...styles.th,
                        fontSize: 10,
                        textAlign: "right",
                      }}
                    >
                      Faktisk
                    </th>
                    <th style={{ ...styles.th, fontSize: 10, width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(estimates).map(([mId, est]) => {
                    const actual = timeData[mId]
                      ? getTotalWithActive(timeData[mId])
                      : 0;
                    const isOver = actual > est.estimatedMs;
                    return (
                      <tr key={mId}>
                        <td style={{ ...styles.td, fontSize: 12 }}>
                          {est.name || mId}
                          {mId === memberId ? " (deg)" : ""}
                        </td>
                        <td
                          style={{
                            ...styles.td,
                            fontSize: 12,
                            textAlign: "right",
                            fontWeight: 600,
                            fontFamily: "monospace",
                          }}
                        >
                          {formatDuration(est.estimatedMs, true)}
                        </td>
                        <td
                          style={{
                            ...styles.td,
                            fontSize: 12,
                            textAlign: "right",
                            fontFamily: "monospace",
                            color: isOver ? "#EB5A46" : "#172B4D",
                          }}
                        >
                          {formatDuration(actual, true)}
                        </td>
                        <td
                          style={{
                            ...styles.td,
                            textAlign: "center",
                            padding: "2px",
                          }}
                        >
                          <button
                            onClick={() => handleRemoveEstimate(mId)}
                            disabled={savingEstimate}
                            style={{
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              fontSize: 12,
                              color: "#B04632",
                              padding: "2px 4px",
                            }}
                            title="Fjern estimat"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
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
