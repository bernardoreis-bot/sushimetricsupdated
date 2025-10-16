import { useState } from 'react';
import { CheckCircle, XCircle, Loader, ExternalLink, Key, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface OpenAISetupWizardProps {
  onComplete: () => void;
}

export default function OpenAISetupWizard({ onComplete }: OpenAISetupWizardProps) {
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const testConnection = async (keyToTest: string) => {
    if (!keyToTest.trim()) {
      setErrorMessage('Please enter an API key');
      setTestResult('error');
      return false;
    }

    setTesting(true);
    setErrorMessage('');

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${keyToTest}`
        }
      });

      if (response.ok) {
        setTestResult('success');
        setTesting(false);
        return true;
      } else {
        const errorData = await response.text();
        setTestResult('error');
        setErrorMessage(`API Key Invalid (Status ${response.status}): ${errorData.substring(0, 200)}`);
        setTesting(false);
        return false;
      }
    } catch (error) {
      setTestResult('error');
      setErrorMessage(`Connection failed: ${error instanceof Error ? error.message : 'Network error'}`);
      setTesting(false);
      return false;
    }
  };

  const saveAndComplete = async () => {
    if (testResult !== 'success') {
      setErrorMessage('Please test the connection first');
      return;
    }

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'openai_api_key',
          setting_value: apiKey,
          updated_by: user?.id,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'setting_key'
        });

      if (error) {
        throw error;
      }

      onComplete();
    } catch (error) {
      setErrorMessage(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-green-600 to-green-700 p-6 text-white">
          <div className="flex items-center gap-3">
            <Key className="w-8 h-8" />
            <div>
              <h2 className="text-2xl font-bold">OpenAI API Setup Required</h2>
              <p className="text-green-100 mt-1">Configure your API key to enable ChatGPT-powered image processing</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold mb-1">Why is this needed?</p>
                <p>The Production Plan Image Upload tool uses OpenAI's GPT-4 Vision to extract text from images. Without an API key, only basic fallback OCR will be available.</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Step 1: Get Your API Key</h3>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <ol className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-green-600">1.</span>
                    <span>Visit <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline inline-flex items-center gap-1">
                      OpenAI Platform <ExternalLink className="w-3 h-3" />
                    </a></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-green-600">2.</span>
                    <span>Sign in with your OpenAI account (or create one)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-green-600">3.</span>
                    <span>Click "Create new secret key" and give it a name</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold text-green-600">4.</span>
                    <span>Copy the generated API key (starts with "sk-")</span>
                  </li>
                </ol>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Step 2: Enter Your API Key</h3>
              <div className="space-y-3">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setTestResult('idle');
                    setErrorMessage('');
                  }}
                  placeholder="Paste your OpenAI API key here (e.g., sk-...)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                />

                <button
                  onClick={() => testConnection(apiKey)}
                  disabled={testing || !apiKey.trim()}
                  className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {testing ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Testing Connection...
                    </>
                  ) : (
                    <>
                      <Key className="w-5 h-5" />
                      Test Connection
                    </>
                  )}
                </button>

                {testResult === 'success' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-green-900">Connection Successful!</p>
                      <p className="text-sm text-green-700 mt-1">Your API key is valid and ready to use.</p>
                    </div>
                  </div>
                )}

                {testResult === 'error' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-red-900">Connection Failed</p>
                      <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
                      <p className="text-xs text-red-600 mt-2">Please check your API key and try again.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={saveAndComplete}
                disabled={testResult !== 'success' || saving}
                className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Save & Continue
                  </>
                )}
              </button>

              <button
                onClick={onComplete}
                className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors"
              >
                Skip (Use Fallback OCR)
              </button>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 border-t border-gray-200 p-4">
          <p className="text-xs text-gray-600">
            <strong>Note:</strong> Your API key is stored securely in the database and is only used to communicate with OpenAI's API. You can update or remove it at any time from Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
