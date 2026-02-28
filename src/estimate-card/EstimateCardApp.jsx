import React, { useState, useEffect, useCallback, useRef } from "react";
import { getCardTimeData } from "../utils/storage.js";
import {
  getCardEstimates,
  setEstimate,
  removeEstimate,
} from "../utils/estimateStorage.js";
import {
  formatDuration,
  parseDuration,
  getTotalWithActive,
} from "../utils/time.js";

/**
 * EstimateCardApp – Card-level estimate popup.
 * Separate window for managing time estimates per person on a card.
 */
export default function EstimateCardApp({ t }) {
  const [timeData, setTimeData] = useState({});
  const [memberId, setMemberId] = useState(null);
  const [memberName, setMemberName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState(["self"]);
  const [boardMembers, setBoardMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [estimates, setEstimates] = useState({});
  const [estimateInput, setEstimateInput] = useState("");
  const [savingEstimate, setSavingEstimate] = useState(false);
  const [now, setNow] = useState(Date.now());
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
    } catch (e) {
      console.error("[TimeTracker] refreshData error:", e);
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

  const touchBadges = useCallback(async () => {
    try {
      await t.set("card", "shared", "lastUpdate", Date.now());
    } catch (e) {
      // ignore
    }
  }, [t]);

  // Load data on mount
  useEffect(() => {
    async function init() {
      const member = await t.member("id", "fullName");
      setMemberId(member.id);
      setMemberName(member.fullName);
      try {
        const board = await t.board("members");
        setBoardMembers(board.members || []);
      } catch (e) {
        console.warn("[TimeTracker] Could not fetch board members:", e);
      }
      await refreshData();
      await refreshEstimates();
      setLoading(false);
    }
    init();
  }, [t, refreshData, refreshEstimates]);

  // Tick for active timers (to keep Faktisk column live)
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

  // Poll every 5s
  useEffect(() => {
    const POLL_INTERVAL = 5000;
    const startPolling = () => {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          refreshData();
          refreshEstimates();
        }
      }, POLL_INTERVAL);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshData();
        refreshEstimates();
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
  }, [refreshData, refreshEstimates]);

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
        await touchBadges();
      } catch (e) {
        console.error("[TimeTracker] handleSetEstimate error:", e);
      } finally {
        setSavingEstimate(false);
      }
    },
    [
      t,
      selectedMembers,
      memberId,
      memberName,
      boardMembers,
      refreshEstimates,
      touchBadges,
    ],
  );

  const handleRemoveEstimate = useCallback(
    async (targetMemberId) => {
      setSavingEstimate(true);
      try {
        const target =
          targetMemberId === memberId ? null : { id: targetMemberId };
        await removeEstimate(t, target);
        await refreshEstimates();
        await touchBadges();
      } catch (e) {
        console.error("[TimeTracker] handleRemoveEstimate error:", e);
      } finally {
        setSavingEstimate(false);
      }
    },
    [t, memberId, refreshEstimates, touchBadges],
  );

  if (loading) {
    return <div style={styles.center}>Laster...</div>;
  }

  return (
    <div style={styles.container}>
      {/* Estimate input */}
      <div style={{ marginBottom: 12 }}>
        <div style={styles.sectionTitle}>Sett tidsestimat</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          <input
            type="text"
            placeholder="f.eks. 2t 30m"
            value={estimateInput}
            onChange={(e) => setEstimateInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSetEstimate(estimateInput);
            }}
            style={styles.input}
            disabled={savingEstimate}
          />
          <button
            onClick={() => handleSetEstimate(estimateInput)}
            disabled={savingEstimate || !estimateInput.trim()}
            style={{
              ...styles.smallBtn,
              opacity: savingEstimate || !estimateInput.trim() ? 0.5 : 1,
            }}
            title="Sett estimat"
          >
            ✓
          </button>
        </div>

        {/* Member selection */}
        {boardMembers.length > 1 && (
          <div style={{ marginTop: 6 }}>
            <span style={styles.label}>Personer</span>
            <div style={styles.memberCheckboxList}>
              <label style={styles.memberCheckbox}>
                <input
                  type="checkbox"
                  checked={selectedMembers.includes("self")}
                  onChange={() => toggleMember("self")}
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
                      style={{ margin: 0 }}
                    />
                    <span>{m.fullName}</span>
                  </label>
                ))}
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, color: "#8993A4", marginTop: 6 }}>
          Settes for valgte person(er) over.
        </div>
      </div>

      {/* Estimate table */}
      {Object.keys(estimates).length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Person</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Estimat</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Faktisk</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Gjenstående</th>
              <th style={{ ...styles.th, width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(estimates).map(([mId, est]) => {
              const actual = timeData[mId]
                ? getTotalWithActive(timeData[mId])
                : 0;
              const remaining = Math.max(0, est.estimatedMs - actual);
              const isOver = actual > est.estimatedMs;
              const hasOriginal =
                est.originalMs !== null && est.originalMs !== est.estimatedMs;
              return (
                <tr key={mId}>
                  <td style={styles.td}>
                    {est.name || mId}
                    {mId === memberId ? " (deg)" : ""}
                  </td>
                  <td
                    style={{
                      ...styles.td,
                      textAlign: "right",
                      fontWeight: 600,
                      fontFamily: "monospace",
                    }}
                  >
                    {formatDuration(est.estimatedMs, true)}
                    {hasOriginal && (
                      <span
                        style={styles.originalHint}
                        title={`Opprinnelig estimat: ${formatDuration(est.originalMs, true)}`}
                      >
                        (oppr. {formatDuration(est.originalMs, true)})
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      ...styles.td,
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
                      textAlign: "right",
                      fontFamily: "monospace",
                      color:
                        remaining === 0 && actual > 0 ? "#EB5A46" : "#5E6C84",
                    }}
                  >
                    {formatDuration(remaining, true)}
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
                      style={styles.removeBtn}
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
  );
}

const styles = {
  container: { padding: "4px 0", fontSize: 14 },
  center: { textAlign: "center", padding: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#5E6C84",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    flex: 1,
    padding: "5px 8px",
    border: "1px solid #DFE1E6",
    borderRadius: 4,
    fontSize: 13,
  },
  smallBtn: {
    width: 40,
    height: 32,
    padding: 0,
    border: "1px solid transparent",
    borderRadius: 4,
    backgroundColor: "#0079BF",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
  },
  label: { fontSize: 12, color: "#5E6C84" },
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
    padding: "2px 0",
    margin: 0,
    minHeight: 24,
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: 11,
    color: "#5E6C84",
    padding: "4px 6px",
    borderBottom: "1px solid #DFE1E6",
  },
  td: {
    padding: "5px 6px",
    fontSize: 13,
    borderBottom: "1px solid #F4F5F7",
  },
  originalHint: {
    fontWeight: 400,
    fontSize: 10,
    color: "#8993A4",
    marginLeft: 4,
  },
  removeBtn: {
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: 12,
    color: "#B04632",
    padding: "2px 4px",
  },
};
