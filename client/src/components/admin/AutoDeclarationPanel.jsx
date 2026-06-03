import { useState, useEffect } from 'react';

const S = {
  container: {
    background: 'linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%)',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '16px',
    marginTop: '12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
    gap: '8px',
    flexWrap: 'wrap',
  },
  headerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: 0,
  },
  icon: {
    fontSize: '18px',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#3b82f6',
    borderRadius: '8px',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
  },
  subtitle: {
    margin: '2px 0 0 0',
    fontSize: '12px',
    color: '#64748b',
  },
  actions: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
  },
  btnBase: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  btnPrimary: {
    background: '#3b82f6',
    color: 'white',
  },
  btnSecondary: {
    background: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
  },
  btnSmall: {
    padding: '5px 10px',
    fontSize: '12px',
  },
  btnFull: {
    width: '100%',
  },
  btnDanger: {
    background: '#fee2e2',
    color: '#b91c1c',
    border: '1px solid #fca5a5',
  },
  resultsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '12px',
  },
  resultCard: {
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '12px',
  },
  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  timeLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#475569',
  },
  autoBadge: {
    background: '#10b981',
    color: 'white',
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.05em',
  },
  resultValue: {
    fontSize: '20px',
    fontWeight: 700,
    textAlign: 'center',
    padding: '8px',
    background: '#f8fafc',
    borderRadius: '6px',
    color: '#1e293b',
    fontFamily: 'monospace',
  },
  activeIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: '#dcfce7',
    border: '1px solid #bbf7d0',
    borderRadius: '6px',
    padding: '8px 12px',
    marginBottom: '10px',
    fontSize: '12px',
    color: '#166534',
  },
  activeDot: {
    width: '8px',
    height: '8px',
    background: '#22c55e',
    borderRadius: '50%',
    flexShrink: 0,
  },
  overridePanel: {
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '14px',
    marginBottom: '12px',
  },
  overrideTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
  },
  formRow: {
    marginBottom: '10px',
  },
  formLabel: {
    display: 'block',
    marginBottom: '4px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#374151',
  },
  formSelect: {
    width: '100%',
    padding: '7px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '13px',
    background: 'white',
  },
  formInput: {
    flex: 1,
    padding: '7px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'monospace',
    fontWeight: 600,
    textAlign: 'center',
    width: '100%',
    boxSizing: 'border-box',
  },
  panelInputRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  formActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
  },
  helpText: {
    fontSize: '11px',
    color: '#94a3b8',
    lineHeight: 1.5,
    borderTop: '1px solid #f1f5f9',
    paddingTop: '10px',
    marginTop: '4px',
  },
  helpItem: {
    marginBottom: '2px',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px',
    background: '#f8fafc',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#64748b',
  },
};

export function AutoDeclarationPanel({ marketId, marketName, openTime, closeTime }) {
  const [autoResults, setAutoResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ session: 'open', panel: '' });

  const todayStr = (() => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric', month: 'numeric', day: 'numeric'
    });
    const parts = formatter.formatToParts(new Date());
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value.padStart(2, '0');
    const d = parts.find(p => p.type === 'day').value.padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  const fetchAutoResults = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/auto-results?marketId=${marketId}&date=${todayStr}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('matka_admin_token')}`,
          'X-CSRF-Token': import.meta.env.VITE_CSRF_TOKEN || '',
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAutoResults(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch auto results:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOverride = async (e) => {
    e.preventDefault();
    setOverriding(true);
    try {
      const response = await fetch('/api/v1/admin/auto-results/override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('matka_admin_token')}`,
          'X-CSRF-Token': import.meta.env.VITE_CSRF_TOKEN || '',
        },
        body: JSON.stringify({
          marketId,
          date: todayStr,
          session: overrideForm.session,
          panel: overrideForm.panel,
        }),
      });
      if (response.ok) {
        fetchAutoResults();
        setShowOverride(false);
        setOverrideForm({ session: 'open', panel: '' });
      } else {
        const error = await response.json();
        alert(`Failed to override: ${error.message}`);
      }
    } catch (error) {
      console.error('Failed to override result:', error);
      alert('Failed to override result');
    } finally {
      setOverriding(false);
    }
  };

  const generateRandomPanel = async () => {
    try {
      const response = await fetch('/api/v1/admin/generate-panel', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('matka_admin_token')}`,
          'X-CSRF-Token': import.meta.env.VITE_CSRF_TOKEN || '',
        },
      });
      if (response.ok) {
        const data = await response.json();
        setOverrideForm((prev) => ({ ...prev, panel: data.data.panel }));
      }
    } catch (error) {
      console.error('Failed to generate random panel:', error);
    }
  };

  const triggerAutoCheck = async () => {
    try {
      const response = await fetch('/api/v1/admin/auto-results/trigger', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('matka_admin_token')}`,
          'X-CSRF-Token': import.meta.env.VITE_CSRF_TOKEN || '',
        },
      });
      if (response.ok) {
        fetchAutoResults();
      }
    } catch (error) {
      console.error('Failed to trigger auto check:', error);
    }
  };

  useEffect(() => {
    fetchAutoResults();
    const interval = setInterval(fetchAutoResults, 30000);
    return () => clearInterval(interval);
  }, [marketId]);

  if (loading && !autoResults) {
    return (
      <div style={S.loading}>
        <span style={{
          width: '14px',
          height: '14px',
          border: '2px solid #e2e8f0',
          borderTop: '2px solid #3b82f6',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'adp-spin 0.8s linear infinite',
          flexShrink: 0,
        }} />
        <span>Loading auto-declaration status...</span>
        <style>{`@keyframes adp-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const hasAutoResults = autoResults?.openPanel || autoResults?.closePanel;

  return (
    <div style={S.container}>
      {/* Header row */}
      <div style={S.header}>
        <div style={S.headerInfo}>
          <div style={S.icon}>🤖</div>
          <div>
            <h4 style={S.title}>Auto Declaration — {marketName}</h4>
            <p style={S.subtitle}>Auto-generates results 1 min before time</p>
          </div>
        </div>
        <div style={S.actions}>
          <button
            type="button"
            onClick={triggerAutoCheck}
            style={{ ...S.btnBase, ...S.btnSecondary }}
          >
            Check Now
          </button>
          <button
            type="button"
            onClick={() => setShowOverride((v) => !v)}
            style={{ ...S.btnBase, ...S.btnPrimary }}
          >
            {showOverride ? 'Cancel' : 'Override'}
          </button>
        </div>
      </div>

      {/* Result cards */}
      <div style={S.resultsGrid}>
        <div style={S.resultCard}>
          <div style={S.resultHeader}>
            <span style={S.timeLabel}>Open — {openTime}</span>
            {autoResults?.isAutoGenerated?.open && (
              <span style={S.autoBadge}>AUTO</span>
            )}
          </div>
          <div style={S.resultValue}>
            {autoResults?.openPanel || '---'}
          </div>
        </div>

        <div style={S.resultCard}>
          <div style={S.resultHeader}>
            <span style={S.timeLabel}>Close — {closeTime}</span>
            {autoResults?.isAutoGenerated?.close && (
              <span style={S.autoBadge}>AUTO</span>
            )}
          </div>
          <div style={S.resultValue}>
            {autoResults?.closePanel || '---'}
          </div>
        </div>
      </div>

      {/* Active indicator — replaces the huge ✅ emoji block */}
      {hasAutoResults && (
        <div style={S.activeIndicator}>
          <span style={S.activeDot} />
          Auto-declaration active — results auto-generated 1 min before time.
        </div>
      )}

      {/* Override form */}
      {showOverride && (
        <div style={S.overridePanel}>
          <h4 style={S.overrideTitle}>Override Auto-Declared Result</h4>
          <form onSubmit={handleOverride}>
            <div style={S.formRow}>
              <label style={S.formLabel}>Session</label>
              <select
                style={S.formSelect}
                value={overrideForm.session}
                onChange={(e) => setOverrideForm((prev) => ({ ...prev, session: e.target.value }))}
              >
                <option value="open">Open</option>
                <option value="close">Close</option>
              </select>
            </div>
            <div style={S.formRow}>
              <label style={S.formLabel}>Panel (3 digits)</label>
              <div style={S.panelInputRow}>
                <input
                  type="text"
                  style={S.formInput}
                  value={overrideForm.panel}
                  onChange={(e) => setOverrideForm((prev) => ({ ...prev, panel: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                  placeholder="000"
                  pattern="[0-9]{3}"
                  maxLength={3}
                  required
                />
                <button
                  type="button"
                  onClick={generateRandomPanel}
                  style={{ ...S.btnBase, ...S.btnSecondary, ...S.btnSmall, flexShrink: 0 }}
                >
                  Random
                </button>
              </div>
            </div>
            <div style={S.formActions}>
              <button
                type="submit"
                disabled={overriding}
                style={{ ...S.btnBase, ...S.btnPrimary, flex: 1, opacity: overriding ? 0.7 : 1 }}
              >
                {overriding ? 'Overriding...' : 'Override Result'}
              </button>
              <button
                type="button"
                onClick={() => setShowOverride(false)}
                style={{ ...S.btnBase, ...S.btnSecondary }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Help text */}
      <div style={S.helpText}>
        <div style={S.helpItem}>• Auto-generates results 1 minute before declaration time</div>
        <div style={S.helpItem}>• Auto-generated results show <strong>AUTO</strong> badge</div>
        <div style={S.helpItem}>• Admin can override at any time — manual results take priority</div>
      </div>
    </div>
  );
}