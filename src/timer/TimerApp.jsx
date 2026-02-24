import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getCardTimeData, startTimer, stopTimer, adjustTime } from '../utils/storage.js';
import { formatTimer, formatDuration, getTotalWithActive, parseDuration } from '../utils/time.js';

/**
 * TimerApp – The popup shown when a user clicks "Tidstracker" on a card.
 */
export default function TimerApp({ t }) {
  const [timeData, setTimeData] = useState({});
  const [memberId, setMemberId] = useState(null);
  const [memberName, setMemberName] = useState('');
  const [now, setNow] = useState(Date.now());
  const [manualInput, setManualInput] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const tickRef = useRef(null);

  // Fetch fresh data from Supabase
  const refreshData = useCallback(async () => {
    try {
      const data = await getCardTimeData(t);
      setTimeData(data);
      setNow(Date.now());
    } catch (e) {
      console.error('[TimeTracker] refreshData error:', e);
    }
  }, [t]);

  // Load data on mount
  useEffect(() => {
    async function init() {
      const member = await t.member('id', 'fullName');
      setMemberId(member.id);
      setMemberName(member.fullName);
      await refreshData();
      setLoading(false);
    }
    init();
  }, [t, refreshData]);

  // Tick every second when a timer is active
  useEffect(() => {
    const myData = memberId ? timeData[memberId] : null;
    const isRunning = myData?.activeStart != null;

    if (isRunning) {
      tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    } else {
      clearInterval(tickRef.current);
    }
    return () => clearInterval(tickRef.current);
  }, [timeData, memberId]);

  // Derived state
  const myData = memberId ? timeData[memberId] : null;
  const isRunning = myData?.activeStart != null;
  const myTotal = myData ? getTotalWithActive(myData) : 0;
  const displayTotal = isRunning ? (myData.totalMs || 0) + (now - myData.activeStart) : myTotal;

  const handleToggle = useCallback(async () => {
    setSaving(true);
    try {
      if (isRunning) {
        await stopTimer(t);
      } else {
        await startTimer(t);
      }
      await refreshData();
    } catch (e) {
      console.error('[TimeTracker] toggle error:', e);
    }
    setSaving(false);
  }, [t, isRunning, refreshData]);

  const handleManualAdd = useCallback(async () => {
    const ms = parseDuration(manualInput);
    if (ms > 0) {
      setSaving(true);
      await adjustTime(t, ms, manualDate || undefined);
      await refreshData();
      setManualInput('');
      setSaving(false);
    }
  }, [t, manualInput, manualDate, refreshData]);

  const handleManualSubtract = useCallback(async () => {
    const ms = parseDuration(manualInput);
    if (ms > 0) {
      setSaving(true);
      await adjustTime(t, -ms, manualDate || undefined);
      await refreshData();
      setManualInput('');
      setSaving(false);
    }
  }, [t, manualInput, manualDate, refreshData]);

  if (loading) {
    return <div style={styles.center}>Laster...</div>;
  }

  const members = Object.entries(timeData).map(([id, d]) => ({
    id,
    name: d.name || id,
    total: getTotalWithActive(d),
    active: d.activeStart != null,
  }));

  const grandTotal = members.reduce((s, m) => s + m.total, 0);

  return (
    <div style={styles.container}>
      {/* Timer display */}
      <div style={styles.timerSection}>
        <div style={styles.timerDisplay}>{formatTimer(displayTotal)}</div>

        <button
          onClick={handleToggle}
          disabled={saving}
          style={{
            ...styles.toggleBtn,
            backgroundColor: saving ? '#A5ADBA' : isRunning ? '#EB5A46' : '#61BD4F',
          }}
        >
          {saving ? '...' : isRunning ? '⏹ Stopp' : '▶ Start'}
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
          <button onClick={handleManualAdd} style={styles.smallBtn} disabled={saving} title="Legg til tid">
            +
          </button>
          <button onClick={handleManualSubtract} style={styles.smallBtnRed} disabled={saving} title="Trekk fra tid">
            −
          </button>
        </div>
        <div style={styles.dateRow}>
          <input
            type="date"
            value={manualDate}
            onChange={(e) => setManualDate(e.target.value)}
            style={styles.dateInput}
            disabled={saving}
          />
          <span style={styles.dateHint}>{manualDate ? '' : 'Dato (valgfritt – standard er i dag)'}</span>
        </div>
      </div>

      {/* Per-person breakdown */}
      {members.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Alle på dette kortet</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Person</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Tid</th>
                <th style={{ ...styles.th, textAlign: 'center', width: 40 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td style={styles.td}>{m.name}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{formatDuration(m.total)}</td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: m.active ? '#EB5A46' : '#61BD4F',
                      }}
                      title={m.active ? 'Timer kjører' : 'Inaktiv'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...styles.td, fontWeight: 600 }}>Totalt</td>
                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>
                  {formatDuration(grandTotal)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '4px 0', fontSize: 14 },
  center: { textAlign: 'center', padding: 24 },
  timerSection: { textAlign: 'center', marginBottom: 16 },
  timerDisplay: {
    fontSize: 36,
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: 2,
    margin: '8px 0',
    color: '#172B4D',
  },
  toggleBtn: {
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
    padding: '10px 32px',
    cursor: 'pointer',
    marginBottom: 8,
  },
  myTotal: { fontSize: 13, color: '#5E6C84', marginTop: 4 },
  section: { marginTop: 12, borderTop: '1px solid #DFE1E6', paddingTop: 10 },
  sectionTitle: { fontSize: 12, fontWeight: 600, color: '#5E6C84', textTransform: 'uppercase', marginBottom: 6 },
  manualRow: { display: 'flex', gap: 6, alignItems: 'center' },
  dateRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 },
  dateInput: {
    padding: '5px 8px',
    border: '1px solid #DFE1E6',
    borderRadius: 4,
    fontSize: 13,
    color: '#172B4D',
  },
  dateHint: { fontSize: 12, color: '#A5ADBA' },
  input: {
    flex: 1,
    padding: '6px 8px',
    border: '1px solid #DFE1E6',
    borderRadius: 4,
    fontSize: 14,
    outline: 'none',
  },
  smallBtn: {
    width: 32,
    height: 32,
    border: 'none',
    borderRadius: 4,
    backgroundColor: '#61BD4F',
    color: '#fff',
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
  },
  smallBtnRed: {
    width: 32,
    height: 32,
    border: 'none',
    borderRadius: 4,
    backgroundColor: '#EB5A46',
    color: '#fff',
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontSize: 11, color: '#5E6C84', padding: '4px 6px', borderBottom: '1px solid #DFE1E6' },
  td: { padding: '5px 6px', fontSize: 13, borderBottom: '1px solid #F4F5F7' },
};