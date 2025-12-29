import { useState, useCallback, useEffect, useMemo } from 'react';
import { RefreshCw, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';
import { useStore } from '../store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type ReportType = 'complete-tasks' | 'daily-report';
type StoreKey = 'allerton' | 'sefton' | 'oldswan';
type PanelKey = `${StoreKey}-${ReportType}`;

interface TrailReport {
  id: ReportType;
  label: string;
  url: string;
}

interface Store {
  id: StoreKey;
  name: string;
  email: string;
  password: string;
}

interface TrailTask {
  name: string | null;
  status: string | null;
  completion: string | null;
}

interface TrailData {
  summary: string | null;
  tasks: TrailTask[];
}

interface TrailResponse {
  success: boolean;
  error?: string;
  message?: string;
  screenshot?: string;
  timestamp?: string;
  data?: TrailData;
}

const STORE_DEFINITIONS: Store[] = [
  { id: 'allerton', name: 'Allerton Road', email: '', password: '' }
];

const REPORT_DEFINITIONS: TrailReport[] = [
  { id: 'complete-tasks', label: 'Complete Tasks', url: 'https://web.trailapp.com/trail#/' },
  { id: 'daily-report', label: 'Daily Report', url: 'https://web.trailapp.com/reports#/scores' },
];

const PANEL_KEYS = STORE_DEFINITIONS.flatMap((store) =>
  REPORT_DEFINITIONS.map((report) => `${store.id}-${report.id}` as PanelKey)
);

const toPanelKey = (store: StoreKey, report: ReportType): PanelKey => `${store}-${report}` as PanelKey;

const createPanelRecord = <T,>(defaultValue: T): Record<PanelKey, T> => {
  const result = {} as Record<PanelKey, T>;
  PANEL_KEYS.forEach((key) => {
    result[key] = defaultValue;
  });
  return result;
};

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export default function TrailProgressCopy() {
  const [stores, setStores] = useState<Store[]>(() => STORE_DEFINITIONS.map((store) => ({ ...store })));
  const [loading, setLoading] = useState<Record<PanelKey, boolean>>(() => createPanelRecord(false));
  const [screenshots, setScreenshots] = useState<Record<PanelKey, string | null>>(() => createPanelRecord<string | null>(null));
  const [lastFetch, setLastFetch] = useState<Record<PanelKey, string | null>>(() => createPanelRecord<string | null>(null));
  const [savingCreds, setSavingCreds] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loadingCreds, setLoadingCreds] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);

  const shouldRefetch = useCallback(
    (panelKey: PanelKey) => {
      const fetchedAt = lastFetch[panelKey];
      if (!fetchedAt) return true;
      return Date.now() - new Date(fetchedAt).getTime() >= THIRTY_MINUTES_MS;
    },
    [lastFetch]
  );

  const loadCredentials = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setCredentialsError('Supabase is not configured. Trail credentials cannot be loaded.');
      return;
    }

    setLoadingCreds(true);
    setCredentialsError(null);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'trail_credentials_copy')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data?.setting_value) {
        try {
          const parsed = JSON.parse(data.setting_value) as Record<StoreKey, { email?: string; password?: string }>;
          setStores((prev) =>
            prev.map((store) => ({
              ...store,
              email: parsed?.[store.id]?.email ?? '',
              password: parsed?.[store.id]?.password ?? '',
            }))
          );
        } catch (parseError) {
          console.error('Invalid Trail credential payload', parseError);
          setCredentialsError('Stored Trail credentials are invalid JSON. Please resave them.');
        }
      }
    } catch (err) {
      console.error('Failed to load Trail credentials', err);
      setCredentialsError('Unable to load Trail credentials from Supabase.');
    } finally {
      setLoadingCreds(false);
    }
  }, []);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const saveCredentials = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSaveMessage('Supabase is not configured.');
      return;
    }

    setSavingCreds(true);
    setSaveMessage(null);
    try {
      const payload = stores.reduce<Record<StoreKey, { email: string; password: string }>>((acc, store) => {
        acc[store.id] = {
          email: store.email.trim(),
          password: store.password,
        };
        return acc;
      }, {} as Record<StoreKey, { email: string; password: string }>);

      const { error } = await supabase
        .from('app_settings')
        .upsert(
          {
            setting_key: 'trail_credentials_copy',
            setting_value: JSON.stringify(payload),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'setting_key' }
        );

      if (error) {
        throw error;
      }

      setSaveMessage('Credentials saved successfully.');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save Trail credentials', err);
      setSaveMessage('Failed to save credentials. Please try again.');
    } finally {
      setSavingCreds(false);
    }
  }, [stores]);

  const fetchTrailReport = useCallback(
    async (storeId: StoreKey, reportId: ReportType, force = false, mode: 'auto' | 'browser' = 'auto') => {
      const panelKey = toPanelKey(storeId, reportId);

      if (!force && !shouldRefetch(panelKey)) {
        return;
      }

      const store = stores.find((item) => item.id === storeId);
      if (!store) return;

      if (!store.email || !store.password) {
        console.warn(`Trail credentials missing for ${store.name}.`);
        return;
      }

      setLoading((prev) => ({ ...prev, [panelKey]: true }));

      try {
        const response = await fetch('/.netlify/functions/trail-fetch-copy.cjs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store: storeId,
            reportType: reportId,
            mode,
            credentials: {
              email: store.email,
              password: store.password,
            },
          }),
        });

        const payload = (await response.json()) as TrailResponse;

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || payload.message || 'Failed to fetch Trail report.');
        }

        setScreenshots((prev) => ({ ...prev, [panelKey]: payload.screenshot ?? null }));
        setLastFetch((prev) => ({ ...prev, [panelKey]: payload.timestamp ?? new Date().toISOString() }));
      } catch (err) {
        console.error('Trail report fetch failed', err);
      } finally {
        setLoading((prev) => ({ ...prev, [panelKey]: false }));
      }
    },
    [shouldRefetch, stores]
  );

  const handleBrowserLogin = useCallback(
    async (store: Store, report: TrailReport) => {
      const panelKey = toPanelKey(store.id, report.id);
      setLoading(prev => ({ ...prev, [panelKey]: true }));
      
      try {
        // First, trigger the screenshot capture
        const response = await fetch('/.netlify/functions/trail-session-copy.cjs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'login',
            store: store.id,
            reportType: report.id,
            credentials: {
              email: store.email,
              password: store.password
            },
            takeScreenshot: true
          })
        });

        if (response.ok) {
          const { success, screenshot, error, url } = await response.json();
          
          if (success && screenshot) {
            // Update the screenshot in the UI
            setScreenshots(prev => ({ ...prev, [panelKey]: screenshot }));
            setLastFetch(prev => ({ ...prev, [panelKey]: new Date().toISOString() }));
            
            // Open the report URL in a new window after screenshot is taken
            if (url) {
              const width = 1280;
              const height = 900;
              const left = (window.screen.width - width) / 2;
              const top = (window.screen.height - height) / 2;
              const windowFeatures = `width=${width},height=${height},top=${top},left=${left},menubar=no,toolbar=no,location=no,status=no`;
              
              // Open the window with the report URL
              const newWindow = window.open(url, `trail-copy-${store.id}-${report.id}`, windowFeatures);
              
              if (!newWindow) {
                console.warn('Popup was blocked. Please allow popups for this site.');
              }
            }
          } else {
            console.error('Failed to capture screenshot:', error);
          }
        }
      } catch (error) {
        console.error('Error in handleBrowserLogin:', error);
      } finally {
        setLoading(prev => ({ ...prev, [panelKey]: false }));
      }
    },
    []
  );

  const panelMeta = useMemo(
    () =>
      stores.flatMap((store) =>
        REPORT_DEFINITIONS.map((report) => ({
          store,
          report,
          panelKey: toPanelKey(store.id, report.id),
        }))
      ),
    [stores]
  );

  const handleRefreshAll = useCallback(() => {
    panelMeta.forEach(({ store, report }) => {
      fetchTrailReport(store.id, report.id, true);
    });
  }, [fetchTrailReport, panelMeta]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      panelMeta.forEach(({ store, report, panelKey }) => {
        if (shouldRefetch(panelKey)) {
          fetchTrailReport(store.id, report.id);
        }
      });
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchTrailReport, panelMeta, shouldRefetch]);

  const renderPanel = (store: Store, report: TrailReport) => {
    const panelKey = toPanelKey(store.id, report.id);
    const panelLoading = loading[panelKey];
    const screenshot = screenshots[panelKey];
    const fetchedAt = lastFetch[panelKey];
    const isStale = shouldRefetch(panelKey);

    return (
      <div key={panelKey} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900 text-base">{store.name} · {report.label}</h3>
            <p className="text-xs text-gray-500">
              Last updated: {fetchedAt ? new Date(fetchedAt).toLocaleString() : 'Never'}{' '}
              {!panelLoading && fetchedAt && (isStale ? '(stale)' : '(cached)')}
            </p>
            <p className="text-xs text-blue-600">
              Source:&nbsp;
              <a
                href={report.url}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {report.url}
              </a>
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchTrailReport(store.id, report.id, true)}
            disabled={panelLoading}
            className={`px-3 py-1.5 text-sm rounded border ${
              panelLoading ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
            }`}
          >
            {panelLoading ? 'Refreshing…' : 'Refresh'}
          </button>
          <div className="flex flex-col space-y-2">
            <button
              type="button"
              onClick={() => handleBrowserLogin(store, report)}
              className="flex items-center justify-center px-3 py-1.5 text-sm rounded border bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              disabled={loading[panelKey]}
            >
              {loading[panelKey] ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Isolated Session
                </>
              )}
            </button>
            <div className="text-xs text-gray-500 text-center">
              {store.name} • {report.label}
            </div>
          </div>
        </div>

        <div className="flex-1 bg-gray-50 flex items-center justify-center min-h-[240px]">
          {screenshot ? (
            <img src={screenshot} alt={`${store.name} ${report.label}`} className="max-h-[480px] w-full object-contain" />
          ) : panelLoading ? (
            <div className="text-gray-500 text-sm">Fetching latest data…</div>
          ) : (
            <div className="text-gray-500 text-sm">Refresh to load the latest screenshot.</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Trail Progress (Copy)</h1>
          <div className="space-y-2 max-w-2xl">
            <p className="text-gray-500">
              Monitor Trail Complete Tasks and Daily Reports across all stores. Each store uses an isolated browser session to prevent login conflicts.
            </p>
            <div className="bg-blue-50 border border-blue-100 text-blue-700 px-4 py-2 rounded text-sm">
              <p className="font-medium">How to use:</p>
              <ol className="list-decimal pl-5 mt-1 space-y-1">
                <li>Click "Open Isolated Session" for a store</li>
                <li>Complete login in the new window (if prompted)</li>
                <li>The screenshot will update automatically</li>
                <li>Each store maintains its own login session</li>
              </ol>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRefreshAll}
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Refresh All
          </button>
          <button
            type="button"
            onClick={saveCredentials}
            disabled={savingCreds}
            className={`px-4 py-2 rounded text-sm font-medium ${
              savingCreds ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {savingCreds ? 'Saving…' : 'Save Credentials'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Trail Credentials (Copy)</h2>
          {saveMessage && <span className="text-sm text-gray-700">{saveMessage}</span>}
        </div>
        <p className="text-sm text-gray-600">
          These credentials are stored securely in Supabase. They are sent to the Trail Netlify function only when you refresh a panel.
        </p>
        {credentialsError && <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded">{credentialsError}</div>}
        {loadingCreds && <div className="text-sm text-gray-500">Loading saved credentials…</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {stores.map((store) => (
            <div key={store.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="font-medium text-gray-900 text-sm">{store.name}</div>
              <input
                type="email"
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Email"
                value={store.email}
                onChange={(event) => {
                  const value = event.target.value;
                  setStores((prev) =>
                    prev.map((item) => (item.id === store.id ? { ...item, email: value } : item))
                  );
                }}
              />
              <input
                type="password"
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Password"
                value={store.password}
                onChange={(event) => {
                  const value = event.target.value;
                  setStores((prev) =>
                    prev.map((item) => (item.id === store.id ? { ...item, password: value } : item))
                  );
                }}
              />
              <p className="text-xs text-gray-500">Used for both screenshot panels.</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {stores.map((store) => (
          <div key={store.id} className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">{store.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {REPORT_DEFINITIONS.map((report) => renderPanel(store, report))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 space-y-2">
        <h3 className="font-semibold text-gray-900">Usage Tips</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Refresh panels to fetch new screenshots and task data. Cached entries refresh automatically after 30 minutes.</li>
          <li>The Refresh All button forces all six panels to fetch immediately.</li>
          <li>If Trail requires manual verification, open Trail in a separate browser tab to complete any CAPTCHA challenges, then refresh again.</li>
        </ul>
      </div>
    </div>
  );
}
