import React, { useState, useEffect } from 'react';

/**
 * SettingsApp – Power-Up settings panel.
 *
 * Current settings:
 * - Show badge on card front (default: on)
 * - Badge refresh interval
 *
 * Settings are stored at board level, shared scope, so they apply to all members.
 */
export default function SettingsApp({ t }) {
  const [showBadge, setShowBadge] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const settings = await t.get('board', 'shared', 'ttSettings');
        if (settings) {
          setShowBadge(settings.showBadge !== false);
        }
      } catch {
        // defaults are fine
      }
      setLoaded(true);
    }
    load();
  }, [t]);

  const handleSave = async () => {
    await t.set('board', 'shared', 'ttSettings', { showBadge });
    t.closePopup();
  };

  if (!loaded) return <div style={{ padding: 16 }}>Laster...</div>;

  return (
    <div style={{ padding: '4px 0', fontSize: 14 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#172B4D' }}>
        Tidstracker – Innstillinger
      </h3>

      <label style={styles.checkLabel}>
        <input
          type="checkbox"
          checked={showBadge}
          onChange={(e) => setShowBadge(e.target.checked)}
          style={{ marginRight: 8 }}
        />
        Vis tids-badge på kortoversikten
      </label>

      <p style={styles.hint}>
        Data lagres i Trellos egen lagring (t.set / t.get). Ingen ekstern server brukes.
        Alle teammedlemmer på boardet kan se sporet tid.
      </p>

      <button onClick={handleSave} style={styles.saveBtn}>
        Lagre innstillinger
      </button>
    </div>
  );
}

const styles = {
  checkLabel: { display: 'flex', alignItems: 'center', marginBottom: 12, cursor: 'pointer' },
  hint: { fontSize: 12, color: '#5E6C84', lineHeight: 1.5, margin: '12px 0' },
  saveBtn: {
    padding: '8px 20px',
    border: 'none',
    borderRadius: 4,
    backgroundColor: '#0079BF',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
};
