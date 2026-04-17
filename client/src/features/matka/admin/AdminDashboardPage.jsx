import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatkaRealtime } from '../../../hooks/matka/useMatkaRealtime.js';
import {
  createAdminMarket,
  deleteAdminMarket,
  getAdminAuditLogs,
  getAdminMarkets,
  getAdminMe,
  getAdminToken,
  logoutAdmin,
  patchAdminMarket,
  setAdminToken,
  toggleAdminMarket,
  updateClosePanel,
  updateOpenPanel,
} from '../../../services/matka/matka-api.js';

const LOGIN_PATH = '/admin-x-secure-portal';
const DEFAULT_OPEN_TIME = '11:15';
const DEFAULT_CLOSE_TIME = '12:15';
const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

function ensureNoIndexMeta() {
  const existing = document.querySelector('meta[name="robots"]');
  if (existing) {
    existing.setAttribute('content', 'noindex,nofollow');
    return;
  }

  const meta = document.createElement('meta');
  meta.setAttribute('name', 'robots');
  meta.setAttribute('content', 'noindex,nofollow');
  document.head.appendChild(meta);
}

function toTimeParts(time24 = '') {
  const [rawHour, rawMinute] = String(time24).split(':');
  const hour24 = Number.parseInt(rawHour, 10);
  const minuteValue = Number.parseInt(rawMinute, 10);

  if (!Number.isFinite(hour24) || !Number.isFinite(minuteValue)) {
    return {
      hour: '11',
      minute: '15',
      meridiem: 'AM',
    };
  }

  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;

  return {
    hour: String(hour12).padStart(2, '0'),
    minute: String(Math.max(0, Math.min(59, minuteValue))).padStart(2, '0'),
    meridiem,
  };
}

function toTime24(parts) {
  const baseHour = Number.parseInt(String(parts?.hour ?? ''), 10);
  const baseMinute = Number.parseInt(String(parts?.minute ?? ''), 10);
  const safeHour = Number.isFinite(baseHour) ? Math.max(1, Math.min(12, baseHour)) : 12;
  const safeMinute = Number.isFinite(baseMinute) ? Math.max(0, Math.min(59, baseMinute)) : 0;
  const meridiem = String(parts?.meridiem ?? 'AM').toUpperCase() === 'PM' ? 'PM' : 'AM';

  let hour24 = safeHour % 12;
  if (meridiem === 'PM') {
    hour24 += 12;
  }

  return `${String(hour24).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`;
}

function TimePickerField({ label, value, onChange, idPrefix }) {
  const current = value ?? toTimeParts(DEFAULT_OPEN_TIME);

  return (
    <div className="matka-time-field">
      <span className="matka-time-label">{label}</span>
      <div className="matka-time-row">
        <select
          aria-label={`${label} hour`}
          value={current.hour}
          onChange={(event) => onChange((state) => ({ ...state, hour: event.target.value }))}
        >
          {HOURS.map((hour) => (
            <option key={`${idPrefix}-hour-${hour}`} value={hour}>
              {hour}
            </option>
          ))}
        </select>
        <span className="matka-time-separator">:</span>
        <select
          aria-label={`${label} minute`}
          value={current.minute}
          onChange={(event) => onChange((state) => ({ ...state, minute: event.target.value }))}
        >
          {MINUTES.map((minute) => (
            <option key={`${idPrefix}-minute-${minute}`} value={minute}>
              {minute}
            </option>
          ))}
        </select>
        <div className="matka-meridiem-toggle" role="group" aria-label={`${label} meridiem`}>
          <button
            type="button"
            className={current.meridiem === 'AM' ? 'active' : ''}
            onClick={() => onChange((state) => ({ ...state, meridiem: 'AM' }))}
          >
            AM
          </button>
          <button
            type="button"
            className={current.meridiem === 'PM' ? 'active' : ''}
            onClick={() => onChange((state) => ({ ...state, meridiem: 'PM' }))}
          >
            PM
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminMarketRow({
  market,
  token,
  onMutateComplete,
  setFeedback,
}) {
  const [name, setName] = useState(market.name);
  const [openTimeParts, setOpenTimeParts] = useState(() => toTimeParts(market.openTime));
  const [closeTimeParts, setCloseTimeParts] = useState(() => toTimeParts(market.closeTime));
  const [openPanel, setOpenPanel] = useState(market.todayResult?.openPanel ?? '');
  const [closePanel, setClosePanel] = useState(market.todayResult?.closePanel ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(market.name);
    setOpenTimeParts(toTimeParts(market.openTime));
    setCloseTimeParts(toTimeParts(market.closeTime));
    setOpenPanel(market.todayResult?.openPanel ?? '');
    setClosePanel(market.todayResult?.closePanel ?? '');
  }, [market]);

  const saveMarket = async () => {
    setBusy(true);
    try {
      await patchAdminMarket({
        token,
        marketId: market.id,
        payload: {
          name,
          openTime: toTime24(openTimeParts),
          closeTime: toTime24(closeTimeParts),
        },
      });
      setFeedback('Market updated');
      await onMutateComplete();
    } catch (error) {
      setFeedback(error.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const saveOpenPanel = async () => {
    setBusy(true);
    try {
      await updateOpenPanel({
        token,
        marketId: market.id,
        panel: openPanel,
      });
      setFeedback('Open panel saved. It will show in live result at Open Time.');
      await onMutateComplete();
    } catch (error) {
      setFeedback(error.message || 'Open panel update failed');
    } finally {
      setBusy(false);
    }
  };

  const saveClosePanel = async () => {
    setBusy(true);
    try {
      await updateClosePanel({
        token,
        marketId: market.id,
        panel: closePanel,
      });
      setFeedback('Close panel saved. It will show in live result at Close Time.');
      await onMutateComplete();
    } catch (error) {
      setFeedback(error.message || 'Close panel update failed');
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async () => {
    setBusy(true);
    try {
      await toggleAdminMarket({ token, marketId: market.id });
      setFeedback('Market active state changed');
      await onMutateComplete();
    } catch (error) {
      setFeedback(error.message || 'Toggle failed');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    const shouldDelete = window.confirm(`Delete market "${market.name}"?`);
    if (!shouldDelete) {
      return;
    }
    setBusy(true);
    try {
      await deleteAdminMarket({ token, marketId: market.id });
      setFeedback('Market deleted');
      await onMutateComplete();
    } catch (error) {
      setFeedback(error.message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="matka-admin-market-row">
      <div className="market-row-top">
        <h3>{market.name}</h3>
        <span className={`market-flag ${market.isActive ? 'on' : 'off'}`}>
          {market.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="market-edit-grid">
        <label className="matka-field-block">
          <span>Market Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <TimePickerField
          label="Open Time"
          value={openTimeParts}
          onChange={setOpenTimeParts}
          idPrefix={`market-${market.id}-open`}
        />
        <TimePickerField
          label="Close Time"
          value={closeTimeParts}
          onChange={setCloseTimeParts}
          idPrefix={`market-${market.id}-close`}
        />
      </div>
      <div className="market-row-actions">
        <button type="button" onClick={saveMarket} disabled={busy}>
          Save Market
        </button>
        <button type="button" onClick={onToggle} disabled={busy}>
          Toggle Active
        </button>
        <button type="button" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </div>
      <div className="market-panel-grid">
        <input
          value={openPanel}
          onChange={(event) => setOpenPanel(event.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Open Panel (3-digit)"
          maxLength={3}
        />
        <button type="button" onClick={saveOpenPanel} disabled={busy}>
          Save Open
        </button>
        <input
          value={closePanel}
          onChange={(event) => setClosePanel(event.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Close Panel (3-digit)"
          maxLength={3}
        />
        <button type="button" onClick={saveClosePanel} disabled={busy}>
          Save Close
        </button>
      </div>
      <p className="market-result-preview">
        Today: {market.todayResult?.displayResult || market.todayResult?.openPanel || 'Result Coming'}
      </p>
    </article>
  );
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => getAdminToken());
  const [admin, setAdmin] = useState('');
  const [markets, setMarkets] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [status, setStatus] = useState('loading');
  const [feedback, setFeedback] = useState('');

  const [createForm, setCreateForm] = useState({
    name: '',
    openTimeParts: toTimeParts(DEFAULT_OPEN_TIME),
    closeTimeParts: toTimeParts(DEFAULT_CLOSE_TIME),
  });

  useEffect(() => {
    document.title = 'Admin Dashboard';
    ensureNoIndexMeta();
  }, []);

  const loadAll = async (currentToken) => {
    const auth = await getAdminMe({ token: currentToken });
    const [marketList, logs] = await Promise.all([
      getAdminMarkets({ token: currentToken }),
      getAdminAuditLogs({ token: currentToken, limit: 80 }),
    ]);
    setAdmin(auth.username || '');
    setMarkets(Array.isArray(marketList) ? marketList : []);
    setAuditLogs(Array.isArray(logs) ? logs : []);
  };

  useEffect(() => {
    const init = async () => {
      if (!token) {
        navigate(LOGIN_PATH, { replace: true });
        return;
      }

      try {
        await loadAll(token);
        setStatus('ready');
      } catch {
        setAdminToken('');
        setToken('');
        navigate(LOGIN_PATH, { replace: true });
      }
    };

    void init();
  }, [navigate, token]);

  useMatkaRealtime({
    enabled: Boolean(token),
    onMarketsUpdated: async () => {
      if (!token) {
        return;
      }
      try {
        const marketList = await getAdminMarkets({ token });
        setMarkets(Array.isArray(marketList) ? marketList : []);
      } catch {
        // Ignore realtime fetch failures.
      }
    },
  });

  const sortedMarkets = useMemo(
    () =>
      [...markets].sort(
        (left, right) =>
          (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
          String(left.name ?? '').localeCompare(String(right.name ?? '')),
      ),
    [markets],
  );

  const onCreateMarket = async (event) => {
    event.preventDefault();
    try {
      await createAdminMarket({
        token,
        payload: {
          name: createForm.name,
          openTime: toTime24(createForm.openTimeParts),
          closeTime: toTime24(createForm.closeTimeParts),
        },
      });
      setCreateForm({
        name: '',
        openTimeParts: toTimeParts(DEFAULT_OPEN_TIME),
        closeTimeParts: toTimeParts(DEFAULT_CLOSE_TIME),
      });
      setFeedback('Market created');
      await loadAll(token);
    } catch (error) {
      setFeedback(error.message || 'Create market failed');
    }
  };

  const onLogout = async () => {
    try {
      if (token) {
        await logoutAdmin({ token });
      }
    } catch {
      // Ignore logout API errors.
    } finally {
      setAdminToken('');
      setToken('');
      navigate(LOGIN_PATH, { replace: true });
    }
  };

  if (status === 'loading') {
    return (
      <div className="matka-page-shell">
        <div className="clone-spinner" aria-hidden="true" />
        <p>Loading admin dashboard...</p>
      </div>
    );
  }

  return (
    <main className="matka-admin-shell">
      <section className="matka-admin-topbar">
        <h1>Admin Dashboard</h1>
        <div>
          <span>{admin}</span>
          <button type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </section>

      {feedback ? <p className="matka-admin-feedback">{feedback}</p> : null}

      <section className="matka-admin-create">
        <h2>Create Market</h2>
        <form onSubmit={onCreateMarket} className="matka-admin-form-inline">
          <label className="matka-field-block">
            <span>Market Name</span>
            <input
              placeholder="Market Name"
              value={createForm.name}
              onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </label>
          <TimePickerField
            label="Open Time"
            value={createForm.openTimeParts}
            onChange={(updater) =>
              setCreateForm((current) => ({
                ...current,
                openTimeParts: typeof updater === 'function' ? updater(current.openTimeParts) : updater,
              }))
            }
            idPrefix="create-open"
          />
          <TimePickerField
            label="Close Time"
            value={createForm.closeTimeParts}
            onChange={(updater) =>
              setCreateForm((current) => ({
                ...current,
                closeTimeParts: typeof updater === 'function' ? updater(current.closeTimeParts) : updater,
              }))
            }
            idPrefix="create-close"
          />
          <button type="submit">Create</button>
        </form>
        <p className="matka-admin-note">
          Open/Close panel values are shown to users in Live Result only when those market times are reached.
        </p>
      </section>

      <section className="matka-admin-markets">
        <h2>Markets</h2>
        {sortedMarkets.map((market) => (
          <AdminMarketRow
            key={market.id}
            market={market}
            token={token}
            onMutateComplete={() => loadAll(token)}
            setFeedback={setFeedback}
          />
        ))}
      </section>

      <section className="matka-admin-audit">
        <h2>Recent Audit Logs</h2>
        <div className="audit-log-list">
          {auditLogs.map((log) => (
            <div key={log._id} className="audit-log-item">
              <strong>{log.action}</strong> | {log.adminUser} |{' '}
              {new Date(log.createdAt).toLocaleString()}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
