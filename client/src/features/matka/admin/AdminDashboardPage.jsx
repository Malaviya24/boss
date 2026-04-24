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

function calculatePanelSingle(panel = '') {
  const sum = String(panel)
    .replace(/\D/g, '')
    .split('')
    .reduce((total, digit) => total + Number.parseInt(digit, 10), 0);
  return String(sum % 10);
}

function normalizeManualPanelValue(value = '') {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8);

  if (digits.length >= 6) {
    const openPanel = digits.slice(0, 3);
    const closePanel = digits.slice(-3);
    const middleJodi = `${calculatePanelSingle(openPanel)}${calculatePanelSingle(closePanel)}`;
    return `${openPanel}-${middleJodi}-${closePanel}`;
  }

  if (digits.length > 3) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return digits;
}

function isCompleteManualPanelValue(value = '') {
  return /^\d{3}-\d{2}-\d{3}$/.test(String(value ?? '').trim());
}

function normalizeManualJodiValue(value = '') {
  return String(value ?? '').replace(/\D/g, '').slice(0, 2);
}

function isCompleteManualJodiValue(value = '') {
  return /^\d{2}$/.test(String(value ?? '').trim());
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

function formatAdminTime(parts) {
  return `${parts?.hour ?? '--'}:${parts?.minute ?? '--'} ${parts?.meridiem ?? ''}`.trim();
}

function titleCase(value = '') {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatAuditValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'empty';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function getAuditMarketName(log) {
  return (
    log?.after?.marketName ||
    log?.after?.name ||
    log?.after?.market?.name ||
    log?.before?.marketName ||
    log?.before?.name ||
    log?.before?.market?.name ||
    log?.after?.slug ||
    log?.before?.slug ||
    log?.entityId ||
    'Unknown'
  );
}

function describeAuditLog(log) {
  const action = String(log?.action ?? '');
  const before = log?.before ?? {};
  const after = log?.after ?? {};
  const changedKeys = Object.keys(after || {}).filter((key) => {
    if (['id', '_id', 'slug', 'createdAt', 'updatedAt'].includes(key)) {
      return false;
    }
    return formatAuditValue(before?.[key]) !== formatAuditValue(after?.[key]);
  });

  const changedText = changedKeys
    .slice(0, 5)
    .map((key) => `${titleCase(key)}: ${formatAuditValue(before?.[key])} -> ${formatAuditValue(after?.[key])}`)
    .join(', ');

  if (action === 'market_create') {
    return {
      title: `Created market ${getAuditMarketName(log)}`,
      detail: `Open ${after?.openTime ?? '-'} | Close ${after?.closeTime ?? '-'}`,
    };
  }

  if (action === 'market_update') {
    return {
      title: `Updated market ${getAuditMarketName(log)}`,
      detail: changedText || 'Market details updated',
    };
  }

  if (action === 'market_toggle_active') {
    return {
      title: `Changed active status for ${getAuditMarketName(log)}`,
      detail: `Active: ${formatAuditValue(after?.isActive)}`,
    };
  }

  if (action === 'market_delete') {
    return {
      title: `Deleted market ${getAuditMarketName(log)}`,
      detail: before?.slug ? `Slug: ${before.slug}` : 'Market removed',
    };
  }

  if (action === 'result_open_update') {
    return {
      title: `Saved open result for ${getAuditMarketName(log)}`,
      detail: `Open panel ${after?.openPanel ?? '-'} | Single ${after?.openSingle ?? '-'} | Jodi ${after?.middleJodi ?? '-'}`,
    };
  }

  if (action === 'result_close_update') {
    return {
      title: `Saved close result for ${getAuditMarketName(log)}`,
      detail: `Close panel ${after?.closePanel ?? '-'} | Final ${after?.displayResult ?? after?.middleJodi ?? '-'}`,
    };
  }

  if (action === 'market_chart_seed_random') {
    return {
      title: `Generated ${String(after?.type ?? '').toUpperCase()} chart data for ${getAuditMarketName(log)}`,
      detail: `${after?.generatedRows ?? 0} rows from ${after?.startYear ?? AUTO_CHART_START_YEAR}`,
    };
  }

  if (action === 'market_chart_manual_row_add') {
    return {
      title: `Added manual ${String(after?.type ?? '').toUpperCase()} row for ${getAuditMarketName(log)}`,
      detail: `${after?.dateRange ?? 'Date range'} | Row ${after?.rowIndex ?? '-'}`,
    };
  }

  if (action === 'admin_login') {
    return {
      title: `${log?.adminUser ?? 'Admin'} logged in`,
      detail: 'Admin session started',
    };
  }

  return {
    title: `${titleCase(action)} by ${log?.adminUser ?? 'admin'}`,
    detail: changedText || `${log?.entityType ?? 'entity'} ${log?.entityId ?? ''}`,
  };
}

function ActionButton({ loading = false, children, className = '', disabled = false, ...props }) {
  return (
    <button
      {...props}
      className={`${className} ${loading ? 'is-loading' : ''}`.trim()}
      disabled={disabled || loading}
    >
      {loading ? <span className="button-loader" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
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
  const [manualType, setManualType] = useState('panel');
  const [manualStartDate, setManualStartDate] = useState('');
  const [manualEndDate, setManualEndDate] = useState('');
  const [manualDays, setManualDays] = useState(() => createEmptyManualDays());
  const [busyAction, setBusyAction] = useState('');
  const busy = Boolean(busyAction);
  const showBusyLoader = useDelayedFlag(busy);

  useEffect(() => {
    setName(market.name);
    setOpenTimeParts(toTimeParts(market.openTime));
    setCloseTimeParts(toTimeParts(market.closeTime));
    setOpenPanel(market.todayResult?.openPanel ?? '');
    setClosePanel(market.todayResult?.closePanel ?? '');
  }, [market]);

  const saveMarket = async () => {
    if (busy) {
      return;
    }

    setBusyAction('saveMarket');
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
      setBusyAction('');
    }
  };

  const saveOpenPanel = async () => {
    if (busy) {
      return;
    }

    const normalizedPanel = normalizePanelInput(openPanel);
    if (!isValidPanel(normalizedPanel)) {
      setFeedback('Open panel must be exactly 3 digits');
      return;
    }

    setBusyAction('saveOpen');
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
      setBusyAction('');
    }
  };

  const saveClosePanel = async () => {
    if (busy) {
      return;
    }

    const normalizedPanel = normalizePanelInput(closePanel);
    if (!isValidPanel(normalizedPanel)) {
      setFeedback('Close panel must be exactly 3 digits');
      return;
    }

    setBusyAction('saveClose');
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
      setBusyAction('');
    }
  };

  const onToggle = async () => {
    if (busy) {
      return;
    }

    setBusyAction('toggle');
    try {
      await toggleAdminMarket({ token, marketId: market.id });
      setFeedback('Market active state changed');
      await onMutateComplete();
    } catch (error) {
      setFeedback(getReadableErrorMessage(error, 'Toggle failed'));
    } finally {
      setBusyAction('');
    }
  };

  const onDelete = async () => {
    if (busy) {
      return;
    }

    const shouldDelete = window.confirm(`Delete market "${market.name}"?`);
    if (!shouldDelete) {
      return;
    }
    setBusyAction('delete');
    try {
      await deleteAdminMarket({ token, marketId: market.id });
      setFeedback('Market deleted');
      await onMutateComplete();
    } catch (error) {
      setFeedback(getReadableErrorMessage(error, 'Delete failed'));
    } finally {
      setBusyAction('');
    }
  };

  const onAutoSeed = async (chartType) => {
    if (busy) {
      return;
    }

    setBusyAction(`seed-${chartType}`);
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
      setBusyAction('');
    }
  };

  const onSaveManualRow = async () => {
    if (busy) {
      return;
    }

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
      if (manualType === 'panel' && !isCompleteManualPanelValue(value)) {
        setFeedback(`Manual ${dayKey.toUpperCase()} panel must be like 356-46-259`);
        return;
      }
      if (manualType !== 'panel' && !isCompleteManualJodiValue(value)) {
        setFeedback(`Manual ${dayKey.toUpperCase()} jodi must be 2 digits`);
        return;
      }
      nextDays[dayKey] = value;
    }

    setBusyAction('manualRow');
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
      setBusyAction('');
    }
  };

  return (
    <article className="matka-admin-market-row">
      <AdminProgressNotice visible={showBusyLoader} label={`Updating ${market.name}...`} />
      <div className="market-row-top">
        <div>
          <span className="market-eyebrow">Market Control</span>
          <h3>{market.name}</h3>
          <p>
            Open {formatAdminTime(openTimeParts)} | Close {formatAdminTime(closeTimeParts)}
          </p>
        </div>
        <div className="market-status-stack">
          <span className={`market-flag ${market.isActive ? 'on' : 'off'}`}>
            {market.isActive ? 'Active' : 'Inactive'}
          </span>
          <span className="market-id-pill">ID {String(market.id ?? '').slice(-6) || 'local'}</span>
        </div>
      </div>

      <div className="market-management-grid">
        <section className="market-admin-panel">
          <div className="market-section-title">
            <h4>Market Settings</h4>
            <span>Name and daily timing</span>
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
            <ActionButton type="button" onClick={saveMarket} disabled={busy} loading={busyAction === 'saveMarket'}>
              Save Market
            </ActionButton>
            <ActionButton type="button" onClick={onToggle} disabled={busy} loading={busyAction === 'toggle'}>
              Toggle Active
            </ActionButton>
            <ActionButton
              type="button"
              className="danger-action"
              onClick={onDelete}
              disabled={busy}
              loading={busyAction === 'delete'}
            >
              Delete
            </ActionButton>
          </div>
        </section>

        <section className="market-admin-panel result-panel">
          <div className="market-section-title">
            <h4>Today Result</h4>
            <span>Hidden until reveal time</span>
          </div>
          <div className="market-panel-grid">
            <label className="matka-field-block">
              <span>Open Panel</span>
              <input
                value={openPanel}
                onChange={(event) => setOpenPanel(normalizePanelInput(event.target.value))}
                placeholder="3 digits"
                maxLength={3}
              />
            </label>
            <ActionButton type="button" onClick={saveOpenPanel} disabled={busy} loading={busyAction === 'saveOpen'}>
              Save Open
            </ActionButton>
            <label className="matka-field-block">
              <span>Close Panel</span>
              <input
                value={closePanel}
                onChange={(event) => setClosePanel(normalizePanelInput(event.target.value))}
                placeholder="3 digits"
                maxLength={3}
              />
            </label>
            <ActionButton type="button" onClick={saveClosePanel} disabled={busy} loading={busyAction === 'saveClose'}>
              Save Close
            </ActionButton>
          </div>
          <p className="market-result-preview">
            Today: {market.todayResult?.displayResult || market.todayResult?.openPanel || 'Result Coming'}
          </p>
        </section>
      </div>

      <section className="market-admin-panel market-chart-tools">
        <div className="market-section-title">
          <h4>Chart Data Tools</h4>
          <span>Auto-fill history or add one row manually</span>
        </div>
        <div className="market-row-actions chart-action-row">
          <ActionButton
            type="button"
            onClick={() => onAutoSeed('jodi')}
            disabled={busy}
            loading={busyAction === 'seed-jodi'}
          >
            Auto Jodi Data (2023+)
          </ActionButton>
          <ActionButton
            type="button"
            onClick={() => onAutoSeed('panel')}
            disabled={busy}
            loading={busyAction === 'seed-panel'}
          >
            Auto Panel Data (2023+)
          </ActionButton>
        </div>

        <div className="market-chart-manual">
          <h4>Manual Chart Row</h4>
          <div className="market-chart-manual-head">
            <label className="matka-field-block">
              <span>Chart Type</span>
              <select
                value={manualType}
                onChange={(event) => {
                  setManualType(event.target.value === 'panel' ? 'panel' : 'jodi');
                  setManualDays(createEmptyManualDays());
                }}
              >
                <option value="panel">Panel</option>
              </select>
            </label>
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
                      [dayKey]: manualType === 'panel'
                        ? normalizeManualPanelValue(event.target.value)
                        : normalizeManualJodiValue(event.target.value),
                    }))
                  }
                  placeholder={manualType === 'panel' ? '356-46-259' : '46'}
                  maxLength={manualType === 'panel' ? 10 : 2}
                />
              </label>
            ))}
          </div>
          <ActionButton type="button" onClick={onSaveManualRow} disabled={busy} loading={busyAction === 'manualRow'}>
            Add Manual Row
          </ActionButton>
          <p className="matka-admin-note">
            Manual panel rows use 356-46-259. Jodi is calculated from open/close.
          </p>
        </div>
      </section>
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
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  const activeMarkets = useMemo(
    () => markets.filter((market) => market.isActive).length,
    [markets],
  );

  const inactiveMarkets = markets.length - activeMarkets;

  const onCreateMarket = async (event) => {
    event.preventDefault();
    if (createBusy) {
      return;
    }

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
    if (logoutBusy) {
      return;
    }

    setLogoutBusy(true);
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
      setLogoutBusy(false);
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
    <main className={`matka-admin-shell matka-admin-dashboard-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <aside className="matka-admin-sidebar" aria-label="Admin navigation">
        <div className="admin-brand-lockup">
          <span className="admin-brand-mark">Dp</span>
          <div>
            <strong>DPBoss Admin</strong>
            <span>Market Control</span>
          </div>
        </div>
        <nav>
          <a href="#create-market" onClick={() => setSidebarOpen(false)}>Create Market</a>
          <a href="#market-list" onClick={() => setSidebarOpen(false)}>Markets</a>
          <a href="#audit-log" onClick={() => setSidebarOpen(false)}>Audit Logs</a>
        </nav>
        <div className="admin-sidebar-note">
          <strong>Live Rule</strong>
          <span>Results stay hidden until configured market timing.</span>
        </div>
      </aside>

      <section className="matka-admin-workspace">
        <section className="matka-admin-topbar">
          <div>
            <span className="admin-page-kicker">Secure Portal</span>
            <h1>Admin Dashboard</h1>
          </div>
          <div className="admin-user-menu">
            <ActionButton
              type="button"
              className="admin-menu-toggle"
              aria-label={sidebarOpen ? 'Close admin menu' : 'Open admin menu'}
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((current) => !current)}
            >
              <span className="hamburger-lines" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </ActionButton>
            <span>{admin}</span>
            <ActionButton type="button" onClick={onLogout} loading={logoutBusy} disabled={logoutBusy}>
              Logout
            </ActionButton>
          </div>
        </section>

        {feedback ? <p className="matka-admin-feedback">{feedback}</p> : null}

        <section className="admin-stat-grid" aria-label="Dashboard summary">
          <article>
            <span>Total Markets</span>
            <strong>{markets.length}</strong>
          </article>
          <article>
            <span>Active</span>
            <strong>{activeMarkets}</strong>
          </article>
          <article>
            <span>Inactive</span>
            <strong>{inactiveMarkets}</strong>
          </article>
          <article>
            <span>Audit Logs</span>
            <strong>{auditLogs.length}</strong>
          </article>
        </section>

        <section className="matka-admin-create" id="create-market">
          <div className="admin-section-heading">
            <div>
              <span>New Market</span>
              <h2>Create Market</h2>
            </div>
            <p>Market history is generated automatically after creation.</p>
          </div>
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
            <ActionButton type="submit" disabled={createBusy} loading={createBusy}>
              {createBusy ? 'Creating...' : 'Create Market'}
            </ActionButton>
          </form>
          <AdminProgressNotice visible={showCreateLoader} label="Creating market and chart history..." />
          <p className="matka-admin-note">
            Open/Close panel values are shown to users in Live Result only when those market times are reached.
          </p>
        </section>

        <section className="matka-admin-markets" id="market-list">
          <div className="admin-section-heading">
            <div>
              <span>Operations</span>
              <h2>Markets</h2>
            </div>
            <p>{sortedMarkets.length} markets available for editing.</p>
          </div>
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

        <section className="matka-admin-audit" id="audit-log">
          <div className="admin-section-heading">
            <div>
              <span>Security</span>
              <h2>Recent Audit Logs</h2>
            </div>
            <p>Latest admin activity from server logs.</p>
          </div>
          <div className="audit-log-list">
            {auditLogs.map((log) => {
              const audit = describeAuditLog(log);
              return (
                <div key={log._id} className="audit-log-item">
                  <div className="audit-log-main">
                    <strong>{audit.title}</strong>
                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  <p>{audit.detail}</p>
                  <div className="audit-log-meta">
                    <span>Admin: {log.adminUser || '-'}</span>
                    <span>Action: {titleCase(log.action)}</span>
                    <span>Entity: {titleCase(log.entityType)} / {log.entityId}</span>
                  </div>
                </div>
              );
            })}
            {!auditLogs.length ? (
              <div className="audit-log-item">No audit logs available yet.</div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
