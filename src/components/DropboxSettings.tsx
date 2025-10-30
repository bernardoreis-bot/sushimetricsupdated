import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Loader2, RefreshCcw, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { loadDropboxConfig, saveDropboxConfig } from '../lib/dropboxConfig';

interface SaveState {
  status: 'idle' | 'saving' | 'success' | 'error';
  message: string | null;
}

export default function DropboxSettings() {
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [appKeyInput, setAppKeyInput] = useState('');
  const [appSecretInput, setAppSecretInput] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle', message: null });
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [isLocalConfig, setIsLocalConfig] = useState(false);

  const maskedAppKey = useMemo(() => {
    if (!appKeyInput) return '';
    if (appKeyInput.length <= 8) return '••••••••';
    return `${appKeyInput.slice(0, 4)}••••${appKeyInput.slice(-4)}`;
  }, [appKeyInput]);

  const maskedAppSecret = useMemo(() => {
    if (!appSecretInput) return '';
    return '••••••••••••••••';
  }, [appSecretInput]);

  useEffect(() => {
    let mounted = true;

    const preloadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setSessionEmail(data.session?.user?.email ?? null);
      }
    };

    const loadConfig = async () => {
      setLoadingConfig(true);
      setConfigError(null);

      try {
        const config = await loadDropboxConfig();
        if (!mounted) return;

        if (config?.appKey) {
          setAppKeyInput(config.appKey);
        } else {
          setAppKeyInput('');
        }
        setLastUpdated(config?.updatedAt ?? null);
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : 'Unable to load Dropbox configuration.';
        setConfigError(message);
        setAppKeyInput('');
        setLastUpdated(null);
      } finally {
        if (mounted) {
          setLoadingConfig(false);
        }
      }
    };

    preloadSession();
    loadConfig();

    return () => {
      mounted = false;
    };
  }, []);

  const handleRefresh = async () => {
    setSaveState({ status: 'idle', message: null });
    setAppSecretInput('');
    setLoadingConfig(true);
    setConfigError(null);

    try {
      const config = await loadDropboxConfig();
      if (config) {
        setAppKeyInput(config.appKey);
        setIsLocalConfig(config.source === 'local');
      } else {
        setAppKeyInput('');
        setIsLocalConfig(false);
      }
      setLastUpdated(config?.updatedAt ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load Dropbox configuration.';
      setConfigError(message);
      setAppKeyInput('');
      setLastUpdated(null);
      setIsLocalConfig(false);
    } finally {
      setLoadingConfig(false);
    }
  };
  
  const toggleShowSecret = () => setShowSecret(!showSecret);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveState({ status: 'saving', message: null });

    const trimmedKey = appKeyInput.trim();
    const trimmedSecret = appSecretInput.trim();

    if (!trimmedKey) {
      setSaveState({
        status: 'error',
        message: 'App Key is required',
      });
      return;
    }

    if (!trimmedKey || !trimmedSecret) {
      setSaveState({ status: 'error', message: 'Both App Key and App Secret are required.' });
      return;
    }

    try {
      const { source } = await saveDropboxConfig(trimmedKey, trimmedSecret || undefined);
      setIsLocalConfig(source === 'local');

      setSaveState({
        status: 'success',
        message: `Dropbox configuration saved to ${source === 'local' ? 'browser storage' : 'server'}`,
      });
      setLastUpdated(new Date().toISOString());

      // Clear the secret input field after saving
      if (trimmedSecret) {
        setAppSecretInput('');
      }
    } catch (error) {
      console.error('Error saving Dropbox configuration:', error);
      setSaveState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to save configuration',
      });
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dropbox Integration</h1>
        <p className="text-gray-600 mt-2 max-w-2xl">
          Configure the Dropbox App Key and App Secret used for bulk invoice imports. Credentials are stored securely in Supabase.
          You&apos;ll need to deploy Netlify functions (or run them locally via Netlify CLI) so the authentication proxy can exchange tokens safely.
        </p>
      </div>

      <div className="space-y-6 max-w-3xl">
        {sessionEmail && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-3 text-sm">
            Signed in as <strong>{sessionEmail}</strong>. Only administrators should update the Dropbox credentials.
          </div>
        )}

        {configError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 mt-0.5" />
            <span>{configError}</span>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Dropbox App Credentials</h2>
              <p className="text-sm text-gray-500">Provide your Dropbox App Key and Secret with App Folder permissions.</p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              disabled={loadingConfig || saveState.status === 'saving'}
            >
              <RefreshCcw className={`w-4 h-4 ${loadingConfig ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <form onSubmit={handleSave} className="p-6 space-y-6">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="appKey"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
                >
                  Dropbox App Key
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    type="text"
                    id="appKey"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white sm:text-sm"
                    value={appKeyInput}
                    onChange={(e) => setAppKeyInput(e.target.value)}
                    placeholder="Enter your Dropbox App Key"
                    disabled={loadingConfig || saveState.status === 'saving'}
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Get this from the Dropbox App Console
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <label
                    htmlFor="appSecret"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
                  >
                    Dropbox App Secret
                  </label>
                  <button
                    type="button"
                    onClick={toggleShowSecret}
                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    disabled={loadingConfig || saveState.status === 'saving'}
                  >
                    {showSecret ? (
                      <span className="flex items-center">
                        <EyeOff className="w-3.5 h-3.5 mr-1" /> Hide
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <Eye className="w-3.5 h-3.5 mr-1" /> Show
                      </span>
                    )}
                  </button>
                </div>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    type={showSecret ? "text" : "password"}
                    id="appSecret"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white sm:text-sm"
                    value={appSecretInput || ''}
                    onChange={(e) => setAppSecretInput(e.target.value)}
                    placeholder="Enter your Dropbox App Secret"
                    disabled={loadingConfig || saveState.status === 'saving'}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {appSecretInput ? 'Leave empty to keep existing secret' : 'Required for first-time setup'}
                </p>
              </div>

              {isLocalConfig && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-md">
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">
                    <span className="font-medium">Note:</span> Configuration is currently stored in your browser's local storage. 
                    For persistent access across devices, please log in and save again.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
              <p className="font-medium text-gray-800 mb-1">Deployment notes</p>
              <ul className="list-disc list-inside space-y-1">
                <li>In production, set <code className="font-mono text-xs">DROPBOX_APP_KEY</code> and <code className="font-mono text-xs">DROPBOX_APP_SECRET</code> in Netlify if you prefer environment variables.</li>
                <li>When running locally without Netlify CLI, the fallback Supabase configuration will be used.</li>
              </ul>
            </div>

            {lastUpdated && (
              <div className="text-xs text-gray-500">
                Last updated: {new Date(lastUpdated).toLocaleString()}
              </div>
            )}

            {saveState.status === 'error' && saveState.message && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 flex items-start gap-2 text-sm">
                <AlertCircle className="w-5 h-5 mt-0.5" />
                <span>{saveState.message}</span>
              </div>
            )}

            {saveState.status === 'success' && saveState.message && (
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-5 h-5 mt-0.5" />
                <span>{saveState.message}</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={saveState.status === 'saving'}
                className="inline-flex items-center gap-2 px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-60"
              >
                {saveState.status === 'saving' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save Credentials'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
