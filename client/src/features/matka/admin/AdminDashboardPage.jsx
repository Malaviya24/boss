import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMatkaRealtime } from '../../../hooks/matka/useMatkaRealtime.js';
import {
  addManualMarketChartRow,
  createAdminMarket,
  deleteAdminMarket,
  getAdminAuditLogs,
  getAdminMarkets,
  getAdminMe,
  getAdminToken,
  getReadableErrorMessage,
  logoutAdmin,
  patchAdminMarket,
  seedMarketChartData,
  setAdminToken,
  toggleAdminMarket,
  updateClosePanel,
  updateOpenPanel,
} from '../../../services/matka/matka-api.js';

const LOGIN_PATH = '/admin-x-secure-portal';
const DEFAULT_OPEN_TIME = '11:15';
const DEFAULT_CLOSE_TIME = '12:15';
const AUTO_CHART_START_YEAR = 2023;
const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const CHART_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DELAYED_LOADER_MS = 2000;

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

function normalizePanelInput(value = '') {
  return String(value ?? '').replace(/[^0-9]/g, '').trim();
}

function isValidPanel(value = '') {
  return /^\d{3}$/.test(String(value ?? '').trim());
}

function createEmptyManualDays() {
  return {
    mon: '',
    tue: '',
    wed: '',
    thu: '',
    fri: '',
    sat: '',
    sun: '',
  };
}

function toDateInputValue(date = new Date()) {
  const safeDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(safeDate.getTime())) {
    return '';
  }

  return [
    safeDate.getFullYear(),
    String(safeDate.getMonth() + 1).padStart(2, '0'),
    String(safeDate.getDate()).padStart(2, '0'),
  ].join('-');
}

function addDaysToDateInput(value, daysToAdd) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  date.setDate(date.getDate() + daysToAdd);
  return toDateInputValue(date);
}

function formatDateInputForChart(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear(),
  ].join('/');
}

function formatManualDateRange(startDate, endDate) {
  const start = formatDateInputForChart(startDate);
  const end = formatDateInputForChart(endDate);
  if (!start || !end) {
    return '';
  }

  return `${start} to ${end}`;
}

function useDelayedFlag(active, delayMs = DELAYED_LOADER_MS) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return visible;
}

function AdminProgressNotice({ visible, label = 'Working...' }) {
  if (!visible) {
    return null;
  }

  return (
    <div className="matka-admin-progress" role="status" aria-live="polite">
      <span className="matka-admin-progress-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
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
  const [manualType, setManualType] = useState('jodi');
  const [manualStartDate, setManualStartDate] = useState('');
  const [manualEndDate, setManualEndDate] = useState('');
  const [manualDays, setManualDays] = useState(() => createEmptyManualDays());
  const [busy, setBusy] = useState(false);
  const showBusyLoader = useDelayedFlag(busy);

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
      setFeedback(getReadableErrorMessage(error, 'Update failed'));
    } finally {
      setBusy(false);
    }
  };

  const saveOpenPanel = async () => {
    const normalizedPanel = normalizePanelInput(openPanel);
    if (!isValidPanel(normalizedPanel)) {
      setFeedback('Open panel must be exactly 3 digits');
      return;
    }

    setBusy(true);
    try {
      await updateOpenPanel({
        token,
        marketId: market.id,
        panel: normalizedPanel,
      });
      setFeedback('Open panel saved. It will show in live result at Open Time.');
      await onMutateComplete();
    } catch (error) {
      setFeedback(getReadableErrorMessage(error, 'Open panel update failed'));
    } finally {
      setBusy(false);
    }
  };

  const saveClosePanel = async () => {
    const normalizedPanel = normalizePanelInput(closePanel);
    if (!isValidPanel(normalizedPanel)) {
      setFeedback('Close panel must be exactly 3 digits');
      return;
    }

    setBusy(true);
    try {
      await updateClosePanel({
        token,
        marketId: market.id,
        panel: normalizedPanel,
      });
      setFeedback('Close panel saved. It will show in live result at Close Time.');
      await onMutateComplete();
    } catch (error) {
      setFeedback(getReadableErrorMessage(error, 'Close panel update failed'));
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
      setFeedback(getReadableErrorMessage(error, 'Toggle failed'));
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
      setFeedback(getReadableErrorMessage(error, 'Delete failed'));
    } finally {
      setBusy(false);
    }
  };

  const onAutoSeed = async (chartType) => {
    setBusy(true);
    try {
      const result = await seedMarketChartData({
        token,
        marketId: market.id,
        type: chartType,
        startYear: AUTO_CHART_START_YEAR,
        replace: true,
      });
      setFeedback(
        `${String(chartType).toUpperCase()} random history generated and synced (${result.generatedRows} rows from ${result.startYear})`,
      );
      await onMutateComplete();
    } catch (error) {
      setFeedback(getReadableErrorMessage(error, `Auto ${chartType} data generation failed`));
    } finally {
      setBusy(false);
    }
  };

  const onSaveManualRow = async () => {
    const safeDateRange = formatManualDateRange(manualStartDate, manualEndDate);
    if (!safeDateRange) {
      setFeedback('Manual row start and end date are required');
      return;
    }

    if (manualEndDate < manualStartDate) {
      setFeedback('Manual row end date must be after start date');
      return;
    }

    const nextDays = {};
    for (const dayKey of CHART_DAY_KEYS) {
      const value = String(manualDays?.[dayKey] ?? '').trim();
      if (!value) {
        setFeedback(`Manual ${dayKey.toUpperCase()} value is required`);
        return;
      }
      nextDays[dayKey] = value;
    }

    setBusy(true);
    try {
      const saved = await addManualMarketChartRow({
        token,
        marketId: market.id,
        type: manualType,
        dateRange: safeDateRange,
        days: nextDays,
      });
      setFeedback(
        `${String(saved.type).toUpperCase()} manual row saved at index ${saved.rowIndex}`,
      );
      setManualStartDate('');
      setManualEndDate('');
      setManualDays(createEmptyManualDays());
      await onMutateComplete();
    } catch (error) {
      setFeedback(getReadableErrorMessage(error, 'Manual chart row save failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="matka-admin-market-row">
      <AdminProgressNotice visible={showBusyLoader} label={`Updating ${market.name}...`} />
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
          onChange={(event) => setOpenPanel(normalizePanelInput(event.target.value))}
          placeholder="Open Panel (3-digit)"
          maxLength={3}
        />
        <button type="button" onClick={saveOpenPanel} disabled={busy}>
          Save Open
        </button>
        <input
          value={closePanel}
          onChange={(event) => setClosePanel(normalizePanelInput(event.target.value))}
          placeholder="Close Panel (3-digit)"
          maxLength={3}
        />
        <button type="button" onClick={saveClosePanel} disabled={busy}>
          Save Close
        </button>
      </div>
      <div className="market-row-actions">
        <button type="button" onClick={() => onAutoSeed('jodi')} disabled={busy}>
          Auto Jodi Data (2023+)
        </button>
        <button type="button" onClick={() => onAutoSeed('panel')} disabled={busy}>
          Auto Panel Data (2023+)
        </button>
      </div>
      <div className="market-chart-manual">
        <h4>Manual Chart Row</h4>
        <div className="market-chart-manual-head">
          <select
            value={manualType}
            onChange={(event) => setManualType(event.target.value === 'panel' ? 'panel' : 'jodi')}
          >
            <option value="jodi">Jodi</option>
            <option value="panel">Panel</option>
          </select>
          <label className="matka-field-block">
            <span>Start Date</span>
            <input
              type="date"
              value={manualStartDate}
              onChange={(event) => {
                const nextStartDate = event.target.value;
                setManualStartDate(nextStartDate);
                setManualEndDate((currentEndDate) => {
                  if (!nextStartDate) {
                    return currentEndDate;
                  }

                  if (!currentEndDate || currentEndDate < nextStartDate) {
                    return addDaysToDateInput(nextStartDate, 6);
                  }

                  return currentEndDate;
                });
              }}
            />
          </label>
          <label className="matka-field-block">
            <span>End Date</span>
            <input
              type="date"
              value={manualEndDate}
              min={manualStartDate || undefined}
              onChange={(event) => setManualEndDate(event.target.value)}
            />
          </label>
        </div>
        <div className="market-chart-manual-grid">
          {CHART_DAY_KEYS.map((dayKey) => (
            <label key={`${market.id}-${manualType}-${dayKey}`} className="matka-field-block">
              <span>{dayKey.toUpperCase()}</span>
              <input
                value={manualDays[dayKey]}
                onChange={(event) =>
                  setManualDays((current) => ({
                    ...current,
                    [dayKey]: event.target.value,
                  }))
                }
                placeholder={manualType === 'panel' ? '123-45-678' : '12'}
              />
            </label>
          ))}
        </div>
        <button type="button" onClick={onSaveManualRow} disabled={busy}>
          Add Manual Row
        </button>
        <p className="matka-admin-note">
          Panel format: 123-45-678 for each day. Jodi is calculated from panel open/close.
        </p>
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
  const [createBusy, setCreateBusy] = useState(false);
  const showCreateLoader = useDelayedFlag(createBusy);

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
    setCreateBusy(true);
    try {
      const created = await createAdminMarket({
        token,
        payload: {
          name: createForm.name,
          openTime: toTime24(createForm.openTimeParts),
          closeTime: toTime24(createForm.closeTimeParts),
        },
      });

      const createdId = String(created?.id ?? '');
      if (createdId) {
        try {
          await seedMarketChartData({
            token,
            marketId: createdId,
            type: 'panel',
            startYear: AUTO_CHART_START_YEAR,
            replace: true,
          });
          setFeedback('Market created with synced random Jodi + Panel chart data (2023+)');
        } catch (seedError) {
          setFeedback(
            `Market created, but auto chart seed failed: ${getReadableErrorMessage(seedError, 'Try auto buttons manually')}`,
          );
        }
      } else {
        setFeedback('Market created');
      }

      setCreateForm({
        name: '',
        openTimeParts: toTimeParts(DEFAULT_OPEN_TIME),
        closeTimeParts: toTimeParts(DEFAULT_CLOSE_TIME),
      });
      await loadAll(token);
    } catch (error) {
      setFeedback(getReadableErrorMessage(error, 'Create market failed'));
    } finally {
      setCreateBusy(false);
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
          <button type="submit" disabled={createBusy}>
            {createBusy ? 'Creating...' : 'Create'}
          </button>
        </form>
        <AdminProgressNotice visible={showCreateLoader} label="Creating market and chart history..." />
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
