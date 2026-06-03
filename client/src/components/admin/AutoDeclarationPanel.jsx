import { useState, useEffect } from 'react';

export function AutoDeclarationPanel({ marketId, marketName, openTime, closeTime }) {
  const [autoResults, setAutoResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ session: 'open', panel: '' });

  const todayStr = new Date().toISOString().split('T')[0];

  // Fetch auto-declared results
  const fetchAutoResults = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/auto-results?marketId=${marketId}&date=${todayStr}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('matka_admin_token')}`,
          'X-CSRF-Token': import.meta.env.VITE_CSRF_TOKEN || ''
        }
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

  // Override auto-declared result
  const handleOverride = async (e) => {
    e.preventDefault();
    setOverriding(true);

    try {
      const response = await fetch('/api/v1/admin/auto-results/override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('matka_admin_token')}`,
          'X-CSRF-Token': import.meta.env.VITE_CSRF_TOKEN || ''
        },
        body: JSON.stringify({
          marketId,
          date: todayStr,
          session: overrideForm.session,
          panel: overrideForm.panel
        })
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

  // Generate random panel for preview
  const generateRandomPanel = async () => {
    try {
      const response = await fetch('/api/v1/admin/generate-panel', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('matka_admin_token')}`,
          'X-CSRF-Token': import.meta.env.VITE_CSRF_TOKEN || ''
        }
      });

      if (response.ok) {
        const data = await response.json();
        setOverrideForm(prev => ({ ...prev, panel: data.data.panel }));
      }
    } catch (error) {
      console.error('Failed to generate random panel:', error);
    }
  };

  // Trigger auto-declaration check
  const triggerAutoCheck = async () => {
    try {
      const response = await fetch('/api/v1/admin/auto-results/trigger', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('matka_admin_token')}`,
          'X-CSRF-Token': import.meta.env.VITE_CSRF_TOKEN || ''
        }
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
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchAutoResults, 30000);
    return () => clearInterval(interval);
  }, [marketId]);

  if (loading && !autoResults) {
    return (
      <div className="border rounded-lg p-4 bg-yellow-50">
        <div className="flex items-center gap-2">
          <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
          <span className="text-sm text-gray-600">Loading auto-declaration status...</span>
        </div>
      </div>
    );
  }

  const hasAutoResults = autoResults?.openPanel || autoResults?.closePanel;

  return (
    <div className="border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-purple-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-blue-800 flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          Auto Declaration - {marketName}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={triggerAutoCheck}
            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
          >
            Check Now
          </button>
          <button
            onClick={() => setShowOverride(!showOverride)}
            className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
          >
            Override
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded p-3 border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Open Time: {openTime}</span>
            {autoResults?.isAutoGenerated?.open && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">AUTO</span>
            )}
          </div>
          <div className="text-lg font-bold text-center py-2 bg-gray-50 rounded">
            {autoResults?.openPanel || '---'}
          </div>
        </div>

        <div className="bg-white rounded p-3 border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Close Time: {closeTime}</span>
            {autoResults?.isAutoGenerated?.close && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">AUTO</span>
            )}
          </div>
          <div className="text-lg font-bold text-center py-2 bg-gray-50 rounded">
            {autoResults?.closePanel || '---'}
          </div>
        </div>
      </div>

      {autoResults?.jodi && (
        <div className="text-center mb-4">
          <div className="inline-block bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg">
            <span className="text-sm">Jodi: </span>
            <span className="text-lg font-bold">{autoResults.jodi}</span>
          </div>
        </div>
      )}

      {hasAutoResults && (
        <div className="bg-green-100 border border-green-300 rounded p-3 mb-4">
          <div className="flex items-center gap-2 text-green-800">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <span className="text-sm font-medium">
              Auto-declaration active. System will automatically declare results 1 minute before time if not manually set.
            </span>
          </div>
        </div>
      )}

      {showOverride && (
        <div className="bg-white border rounded p-4 mt-4">
          <h4 className="font-medium mb-3 text-gray-800">Override Auto-Declared Result</h4>
          <form onSubmit={handleOverride} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Session</label>
              <select
                value={overrideForm.session}
                onChange={(e) => setOverrideForm(prev => ({ ...prev, session: e.target.value }))}
                className="w-full p-2 border rounded-md"
              >
                <option value="open">Open</option>
                <option value="close">Close</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Panel (3 digits)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={overrideForm.panel}
                  onChange={(e) => setOverrideForm(prev => ({ ...prev, panel: e.target.value.slice(0, 3) }))}
                  placeholder="000"
                  pattern="[0-9]{3}"
                  maxLength={3}
                  className="flex-1 p-2 border rounded-md text-center font-mono text-lg"
                  required
                />
                <button
                  type="button"
                  onClick={generateRandomPanel}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm"
                >
                  Random
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={overriding}
                className="flex-1 bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {overriding ? 'Overriding...' : 'Override Result'}
              </button>
              <button
                type="button"
                onClick={() => setShowOverride(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="text-xs text-gray-500 mt-3 space-y-1">
        <div>• System automatically generates results 1 minute before declaration time</div>
        <div>• Auto-generated results are marked with "AUTO" badge</div>
        <div>• Admin can override auto-generated results at any time</div>
        <div>• Manual results take priority over auto-generated ones</div>
      </div>
    </div>
  );
}