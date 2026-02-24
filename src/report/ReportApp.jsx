import React, { useState, useEffect, useMemo } from 'react';
import { getBoardTimeReport } from '../utils/storage.js';
import { formatDuration, getTotalWithActive } from '../utils/time.js';
import { downloadCSV, downloadJSON, flattenReportData } from '../utils/export.js';
import ReportChart from '../components/ReportChart.jsx';

/**
 * ReportApp – Full-screen modal showing time data aggregated across all board cards.
 *
 * Supports:
 * - Grouping by card / person / label
 * - Sorting by name or time
 * - Bar and pie chart visualization
 * - CSV & JSON export
 */
export default function ReportApp({ t }) {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [groupBy, setGroupBy] = useState('card'); // card | person | label
  const [sortBy, setSortBy] = useState('time');   // time | name
  const [chartType, setChartType] = useState('bar'); // bar | pie
  const [view, setView] = useState('table'); // table | chart

  // Fetch data on mount
  useEffect(() => {
    async function load() {
      try {
        const data = await getBoardTimeReport(t);
        setReportData(data);
      } catch (err) {
        console.error('Report load error:', err);
        setError('Kunne ikke laste tidsdata. Prøv igjen.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [t]);

  // ── Aggregate data based on groupBy ──────────────────────────────
  const aggregated = useMemo(() => {
    const map = new Map(); // key → { label, totalMs, items }

    for (const card of reportData) {
      for (const [memberId, mData] of Object.entries(card.timeData)) {
        const ms = getTotalWithActive(mData);
        if (ms === 0) continue;

        if (groupBy === 'card') {
          const key = card.cardId;
          const existing = map.get(key) || { label: card.cardName, totalMs: 0, sublabel: card.listName };
          existing.totalMs += ms;
          map.set(key, existing);
        } else if (groupBy === 'person') {
          const key = memberId;
          const existing = map.get(key) || { label: mData.name || memberId, totalMs: 0 };
          existing.totalMs += ms;
          map.set(key, existing);
        } else if (groupBy === 'label') {
          const labels = card.labels.length > 0 ? card.labels : [{ name: 'Uten label', color: 'gray' }];
          for (const lbl of labels) {
            const key = lbl.name || lbl.color;
            const existing = map.get(key) || { label: key, totalMs: 0, color: lbl.color };
            existing.totalMs += ms;
            map.set(key, existing);
          }
        }
      }
    }

    let results = Array.from(map.values());

    // Sort
    if (sortBy === 'time') {
      results.sort((a, b) => b.totalMs - a.totalMs);
    } else {
      results.sort((a, b) => a.label.localeCompare(b.label));
    }

    return results;
  }, [reportData, groupBy, sortBy]);

  // Grand total
  const grandTotal = aggregated.reduce((s, r) => s + r.totalMs, 0);

  if (loading) {
    return <div style={styles.center}>Laster rapport...</div>;
  }

  if (error) {
    return <div style={{ ...styles.center, color: '#EB5A46' }}>{error}</div>;
  }

  return (
    <div style={styles.container}>
      {/* ── Header ─────────────────────────────── */}
      <div style={styles.header}>
        <h2 style={styles.title}>Tidsrapport</h2>
        <div style={styles.totalBadge}>
          Totalt: <strong>{formatDuration(grandTotal)}</strong>
        </div>
      </div>

      {/* ── Controls ───────────────────────────── */}
      <div style={styles.controls}>
        <div style={styles.controlGroup}>
          <label style={styles.label}>Grupper etter:</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={styles.select}>
            <option value="card">Kort</option>
            <option value="person">Person</option>
            <option value="label">Label/Kategori</option>
          </select>
        </div>

        <div style={styles.controlGroup}>
          <label style={styles.label}>Sorter etter:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={styles.select}>
            <option value="time">Tid (mest først)</option>
            <option value="name">Navn (A-Å)</option>
          </select>
        </div>

        <div style={styles.controlGroup}>
          <label style={styles.label}>Visning:</label>
          <div style={styles.toggleGroup}>
            <button
              onClick={() => setView('table')}
              style={view === 'table' ? styles.toggleActive : styles.toggle}
            >
              Tabell
            </button>
            <button
              onClick={() => setView('chart')}
              style={view === 'chart' ? styles.toggleActive : styles.toggle}
            >
              Graf
            </button>
          </div>
        </div>

        {view === 'chart' && (
          <div style={styles.controlGroup}>
            <label style={styles.label}>Graftype:</label>
            <select value={chartType} onChange={(e) => setChartType(e.target.value)} style={styles.select}>
              <option value="bar">Stolpediagram</option>
              <option value="pie">Sektordiagram</option>
            </select>
          </div>
        )}

        <div style={{ ...styles.controlGroup, marginLeft: 'auto' }}>
          <button onClick={() => downloadCSV(reportData)} style={styles.exportBtn}>
            Eksporter CSV
          </button>
          <button onClick={() => downloadJSON(reportData)} style={styles.exportBtn}>
            Eksporter JSON
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────────── */}
      {aggregated.length === 0 ? (
        <div style={styles.empty}>Ingen tidsdata funnet på dette boardet.</div>
      ) : view === 'table' ? (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>
                {groupBy === 'card' ? 'Kort' : groupBy === 'person' ? 'Person' : 'Label'}
              </th>
              {groupBy === 'card' && <th style={styles.th}>Liste</th>}
              <th style={{ ...styles.th, textAlign: 'right' }}>Tid</th>
              <th style={{ ...styles.th, textAlign: 'right', width: 80 }}>Andel</th>
            </tr>
          </thead>
          <tbody>
            {aggregated.map((row, i) => (
              <tr key={i} style={i % 2 === 0 ? {} : { backgroundColor: '#FAFBFC' }}>
                <td style={styles.td}>
                  {groupBy === 'label' && row.color && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        backgroundColor: trelloLabelColor(row.color),
                        marginRight: 6,
                        verticalAlign: 'middle',
                      }}
                    />
                  )}
                  {row.label}
                </td>
                {groupBy === 'card' && <td style={styles.tdSub}>{row.sublabel || ''}</td>}
                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>
                  {formatDuration(row.totalMs)}
                </td>
                <td style={{ ...styles.td, textAlign: 'right', color: '#5E6C84' }}>
                  {grandTotal > 0 ? ((row.totalMs / grandTotal) * 100).toFixed(1) + '%' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #DFE1E6' }}>
              <td style={{ ...styles.td, fontWeight: 700 }}>Totalt</td>
              {groupBy === 'card' && <td />}
              <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>
                {formatDuration(grandTotal)}
              </td>
              <td style={{ ...styles.td, textAlign: 'right' }}>100%</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <div style={styles.chartContainer}>
          <ReportChart data={aggregated} chartType={chartType} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trello label color mapping
// ---------------------------------------------------------------------------
function trelloLabelColor(color) {
  const map = {
    green: '#61BD4F',
    yellow: '#F2D600',
    orange: '#FF9F1A',
    red: '#EB5A46',
    purple: '#C377E0',
    blue: '#0079BF',
    sky: '#00C2E0',
    lime: '#51E898',
    pink: '#FF78CB',
    black: '#344563',
    gray: '#B3BAC5',
  };
  return map[color] || '#B3BAC5';
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = {
  container: { maxWidth: 960, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif' },
  center: { textAlign: 'center', padding: 48, fontSize: 16, color: '#5E6C84' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { margin: 0, fontSize: 22, color: '#172B4D' },
  totalBadge: {
    backgroundColor: '#E4F0F6',
    color: '#0079BF',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 15,
  },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'flex-end',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid #DFE1E6',
  },
  controlGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 11, fontWeight: 600, color: '#5E6C84', textTransform: 'uppercase' },
  select: {
    padding: '6px 10px',
    border: '1px solid #DFE1E6',
    borderRadius: 4,
    fontSize: 14,
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  toggleGroup: { display: 'flex', gap: 0 },
  toggle: {
    padding: '6px 14px',
    border: '1px solid #DFE1E6',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  },
  toggleActive: {
    padding: '6px 14px',
    border: '1px solid #0079BF',
    backgroundColor: '#E4F0F6',
    color: '#0079BF',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  exportBtn: {
    padding: '6px 14px',
    border: '1px solid #DFE1E6',
    borderRadius: 4,
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    marginLeft: 4,
  },
  empty: { textAlign: 'center', padding: 48, color: '#5E6C84', fontSize: 15 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: '#5E6C84',
    textTransform: 'uppercase',
    padding: '8px 10px',
    borderBottom: '2px solid #DFE1E6',
  },
  td: { padding: '8px 10px', fontSize: 14, borderBottom: '1px solid #F4F5F7', color: '#172B4D' },
  tdSub: { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #F4F5F7', color: '#5E6C84' },
  chartContainer: { padding: '16px 0', maxHeight: 420 },
};
