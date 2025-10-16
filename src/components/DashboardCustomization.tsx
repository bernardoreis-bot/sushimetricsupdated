import { useState, useEffect } from 'react';
import { Save, Palette, Layout, Sliders, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AlertModal } from './Modal';

interface CustomizationSettings {
  theme: 'light' | 'dark';
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  buttonRadius: string;
  fontSize: string;
  contentPadding: string;
}

const defaultSettings: CustomizationSettings = {
  theme: 'light',
  primaryColor: '#f97316',
  secondaryColor: '#3b82f6',
  accentColor: '#10b981',
  buttonRadius: '0.5rem',
  fontSize: '16px',
  contentPadding: '2rem',
};

export default function DashboardCustomization() {
  const [settings, setSettings] = useState<CustomizationSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [alertModal, setAlertModal] = useState<{isOpen: boolean; title: string; message: string; type: 'success' | 'error'}>({
    isOpen: false,
    title: '',
    message: '',
    type: 'success'
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'dashboard_customization')
        .maybeSingle();

      if (data?.setting_value) {
        setSettings({ ...defaultSettings, ...JSON.parse(data.setting_value) });
      }
    } catch (err) {
      console.error('Error loading customization:', err);
    }
  };

  const saveSettings = async () => {
    setSaving(true);

    try {
      const { data: existing } = await supabase
        .from('app_settings')
        .select('id')
        .eq('setting_key', 'dashboard_customization')
        .maybeSingle();

      if (existing) {
        await supabase
          .from('app_settings')
          .update({
            setting_value: JSON.stringify(settings),
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'dashboard_customization');
      } else {
        await supabase
          .from('app_settings')
          .insert({
            setting_key: 'dashboard_customization',
            setting_value: JSON.stringify(settings),
            description: 'Dashboard customization settings'
          });
      }

      applySettings(settings);

      setAlertModal({
        isOpen: true,
        title: 'Success',
        message: 'Settings saved! Refresh the page to see all changes applied.',
        type: 'success'
      });
    } catch (err: any) {
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to save settings: ' + err.message,
        type: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const applySettings = (settings: CustomizationSettings) => {
    const root = document.documentElement;

    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    root.style.setProperty('--primary-color', settings.primaryColor);
    root.style.setProperty('--secondary-color', settings.secondaryColor);
    root.style.setProperty('--accent-color', settings.accentColor);
    root.style.setProperty('--button-radius', settings.buttonRadius);
    root.style.setProperty('--font-size', settings.fontSize);
    root.style.setProperty('--content-padding', settings.contentPadding);

    localStorage.setItem('dashboard_customization', JSON.stringify(settings));
  };

  const resetToDefaults = () => {
    setSettings(defaultSettings);
    applySettings(defaultSettings);
  };

  const previewChanges = () => {
    applySettings(settings);
    setAlertModal({
      isOpen: true,
      title: 'Preview Applied',
      message: 'Changes previewed! Save to make them permanent.',
      type: 'success'
    });
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Customization</h1>
        <p className="text-gray-500 mt-1">Customize the appearance of your dashboard</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Palette className="w-6 h-6 text-orange-500" />
            <h2 className="text-xl font-semibold text-gray-900">Colors</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color (Buttons, Links)</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={settings.primaryColor}
                  onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  className="h-12 w-20 rounded border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={settings.primaryColor}
                  onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={settings.secondaryColor}
                  onChange={(e) => setSettings({ ...settings, secondaryColor: e.target.value })}
                  className="h-12 w-20 rounded border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={settings.secondaryColor}
                  onChange={(e) => setSettings({ ...settings, secondaryColor: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Accent Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={settings.accentColor}
                  onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })}
                  className="h-12 w-20 rounded border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={settings.accentColor}
                  onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Layout className="w-6 h-6 text-orange-500" />
            <h2 className="text-xl font-semibold text-gray-900">Layout</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content Padding: {settings.contentPadding}
              </label>
              <input
                type="range"
                min="0.5"
                max="4"
                step="0.5"
                value={parseFloat(settings.contentPadding)}
                onChange={(e) => setSettings({ ...settings, contentPadding: `${e.target.value}rem` })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Compact</span>
                <span>Spacious</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Button Roundness</label>
              <select
                value={settings.buttonRadius}
                onChange={(e) => setSettings({ ...settings, buttonRadius: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="0">Square</option>
                <option value="0.25rem">Slightly Rounded</option>
                <option value="0.5rem">Rounded</option>
                <option value="0.75rem">Very Rounded</option>
                <option value="9999px">Pill Shape</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Sliders className="w-6 h-6 text-orange-500" />
            <h2 className="text-xl font-semibold text-gray-900">Typography</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Base Font Size: {settings.fontSize}
              </label>
              <input
                type="range"
                min="12"
                max="20"
                step="1"
                value={parseInt(settings.fontSize)}
                onChange={(e) => setSettings({ ...settings, fontSize: `${e.target.value}px` })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Small (12px)</span>
                <span>Large (20px)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Preview</h3>
          <div className="space-y-3">
            <button
              style={{
                backgroundColor: settings.primaryColor,
                borderRadius: settings.buttonRadius
              }}
              className="w-full py-2 px-4 text-white font-medium"
            >
              Primary Button
            </button>
            <button
              style={{
                backgroundColor: settings.secondaryColor,
                borderRadius: settings.buttonRadius
              }}
              className="w-full py-2 px-4 text-white font-medium"
            >
              Secondary Button
            </button>
            <button
              style={{
                backgroundColor: settings.accentColor,
                borderRadius: settings.buttonRadius
              }}
              className="w-full py-2 px-4 text-white font-medium"
            >
              Accent Button
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-3">
        <button
          onClick={resetToDefaults}
          className="flex items-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-semibold"
        >
          <RefreshCw className="w-5 h-5" />
          Reset to Defaults
        </button>
        <button
          onClick={previewChanges}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-semibold"
        >
          Preview Changes
        </button>
        <button
          onClick={saveSettings}
          disabled={saving}
          style={{ backgroundColor: settings.primaryColor, borderRadius: settings.buttonRadius }}
          className="flex items-center gap-2 px-6 py-3 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 font-semibold"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Saving...' : 'Save & Apply'}
        </button>
      </div>

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
}
