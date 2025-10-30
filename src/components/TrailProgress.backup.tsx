import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

type Key = 'allerton' | 'sefton' | 'oldswan';

export default function TrailProgress() {
  // State for UI
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  
  // State for images and loading
  const [images, setImages] = useState<Record<Key, string | null>>({ 
    allerton: null, 
    sefton: null, 
    oldswan: null 
  });
  
  const [loading, setLoading] = useState<Record<Key, boolean>>({ 
    allerton: false, 
    sefton: false, 
    oldswan: false 
  });
  
  const [error, setError] = useState<Record<Key, string | null>>({ 
    allerton: null, 
    sefton: null, 
    oldswan: null 
  });
  
  // Credentials state
  const [creds, setCreds] = useState<{ 
    allerton: { email: string; password: string }; 
    sefton: { email: string; password: string }; 
    oldswan: { email: string; password: string } 
  }>({ 
    allerton: { email: '', password: '' }, 
    sefton: { email: '', password: '' }, 
    oldswan: { email: '', password: '' } 
  });

  // Load credentials on mount
  useEffect(() => {
    const loadCreds = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'trail_credentials')
        .single();
      
      if (data?.value) {
        try {
          const savedCreds = JSON.parse(data.value);
          setCreds({
            allerton: savedCreds.allerton || { email: '', password: '' },
            sefton: savedCreds.sefton || { email: '', password: '' },
            oldswan: savedCreds.oldswan || { email: '', password: '' }
          });
        } catch (err) {
          console.error('Error parsing saved credentials:', err);
        }
      }
    };
    
    loadCreds();
  }, []);

  // Save credentials to Supabase
  const saveCreds = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ 
          key: 'trail_credentials', 
          value: JSON.stringify(creds) 
        });
      
      if (error) throw error;
      setSaveMsg('Credentials saved successfully!');
    } catch (err) {
      console.error('Error saving credentials:', err);
      setSaveMsg('Error saving credentials');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }, [creds]);

  // Panel component
  const Panel = useCallback(({ id, title, keyId }: { id: string; title: string; keyId: Key }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm md:text-base">{title}</h3>
        <div className="flex gap-2">
          <button 
            onClick={() => refresh(keyId)} 
            className="px-3 py-1 border rounded text-sm" 
            disabled={loading[keyId]}
          >
            {loading[keyId] ? 'Refreshing…' : 'Refresh'}
          </button>
          <button 
            className="px-3 py-1 text-sm bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
            onClick={() => triggerBrowserVerification(keyId)}
          >
            Browser Verification
          </button>
        </div>
      </div>
      <div className="min-h-[300px] flex items-center justify-center bg-gray-50">
        {images[keyId] ? (
          <img 
            src={images[keyId]!} 
            alt={`${title} screenshot`} 
            className="max-w-full" 
          />
        ) : (
          <div className="text-gray-500 text-sm">
            {error[keyId] ? (
              <div className="text-red-500">{error[keyId]}</div>
            ) : (
              'Click Refresh to load a live screenshot'
            )}
          </div>
        )}
      </div>
      <div className="px-4 py-2 text-xs text-gray-500 border-t">
        Last updated: {new Date().toLocaleString()}
      </div>
    </div>
  ), [images, loading, error]);

  // Refresh function
  const refresh = useCallback(async (key: Key) => {
    setLoading(prev => ({ ...prev, [key]: true }));
    setError(prev => ({ ...prev, [key]: null }));
    
    try {
      const response = await fetch(`/.netlify/functions/trail-progress?account=${key}`);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to fetch screenshot');
      }
      
      const data = await response.json();
      
      if (!data.image) {
        throw new Error('No image data in response');
      }
      
      setImages(prev => ({ ...prev, [key]: data.image }));
    } catch (err: any) {
      console.error('Error refreshing:', err);
      setError(prev => ({ ...prev, [key]: err.message || 'Failed to refresh' }));
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  // Browser verification
  const triggerBrowserVerification = useCallback((key: Key) => {
    const win = window.open('about:blank', '_blank');
    if (!win) return;
    
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://web.trailapp.com/login';
    form.target = '_blank';
    form.style.display = 'none';
    
    const email = document.createElement('input');
    email.type = 'hidden';
    email.name = 'email';
    email.value = creds[key]?.email || '';
    
    const password = document.createElement('input');
    password.type = 'hidden';
    password.name = 'password';
    password.value = creds[key]?.password || '';
    
    form.appendChild(email);
    form.appendChild(password);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  }, [creds]);

  // Save credentials to Supabase
  const saveCreds = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ 
          key: 'trail_credentials', 
          value: JSON.stringify(creds) 
        });
      
      if (error) throw error;
      setSaveMsg('Credentials saved successfully!');
    } catch (err) {
      console.error('Error saving credentials:', err);
      setSaveMsg('Error saving credentials');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }, [creds]);

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Trail Progress</h1>
        <p className="text-gray-500 mt-1">View each account via secure server-side snapshots.</p>
      </div>

      {/* Credentials Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Trail Credentials</h2>
        <p className="text-sm text-gray-600 mb-3">
          Store login details securely in Sushi Metrics. Serverless jobs use these to fetch snapshots. 
          You can change them anytime.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['allerton', 'sefton', 'oldswan'] as Key[]).map((key) => (
            <div key={key} className="flex flex-col gap-2 border rounded p-3">
              <div className="text-sm font-medium text-gray-800">
                {key === 'allerton' ? 'Allerton Road' : key === 'sefton' ? 'Sefton Park' : 'Old Swan'}
              </div>
              
              <input 
                className="px-3 py-2 border rounded" 
                placeholder="Email" 
                value={creds[key].email}
                onChange={(e) => setCreds({ ...creds, [key]: { ...creds[key], email: e.target.value } })}
              />
              
              <input 
                className="px-3 py-2 border rounded" 
                placeholder="Password" 
                type="password"
                value={creds[key].password}
                onChange={(e) => setCreds({ ...creds, [key]: { ...creds[key], password: e.target.value } })}
              />
            </div>
          ))}
        </div>
        
        <div className="mt-3 flex gap-2 items-center">
          <button 
            onClick={saveCreds} 
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Credentials'}
          </button>
          
          {saveMsg && (
            <span className="text-sm text-gray-700">{saveMsg}</span>
          )}
        </div>
      </div>

      {/* Trail Panels */}
      <div className="grid grid-cols-1 gap-4 mt-6">
        <Panel 
          id="trail-allerton" 
          title="Allerton Road" 
          keyId="allerton" 
        />
        <Panel 
          id="trail-sefton" 
          title="Sefton Park" 
          keyId="sefton" 
        />
        <Panel 
          id="trail-oldswan" 
          title="Old Swan" 
          keyId="oldswan" 
        />
      </div>
    </div>
  );
}
