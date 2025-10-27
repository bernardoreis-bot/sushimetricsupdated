import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Key = 'allerton' | 'sefton' | 'oldswan';

export default function TrailProgress() {
  const [images, setImages] = useState<Record<Key, string | null>>({ allerton: null, sefton: null, oldswan: null });
  const [loading, setLoading] = useState<Record<Key, boolean>>({ allerton: false, sefton: false, oldswan: false });
  const [error, setError] = useState<Record<Key, string | null>>({ allerton: null, sefton: null, oldswan: null });
  const [creds, setCreds] = useState<{ allerton: { email: string; password: string }; sefton: { email: string; password: string }; oldswan: { email: string; password: string } }>(
    { allerton: { email: '', password: '' }, sefton: { email: '', password: '' }, oldswan: { email: '', password: '' } }
  );
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => { loadCreds(); }, []);

  const loadCreds = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'trail_credentials')
      .maybeSingle();
    try {
      const v = data?.setting_value ? JSON.parse(data.setting_value) : null;
      if (v) setCreds({
        allerton: { email: v?.allerton?.email || '', password: v?.allerton?.password || '' },
        sefton:   { email: v?.sefton?.email   || '', password: v?.sefton?.password   || '' },
        oldswan:  { email: v?.oldswan?.email  || '', password: v?.oldswan?.password  || '' },
      });
    } catch {}
  };

  const saveCreds = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const payload: any = { setting_key: 'trail_credentials', setting_value: JSON.stringify(creds), updated_at: new Date().toISOString() };
      const { data } = await supabase
        .from('app_settings')
        .select('id')
        .eq('setting_key', 'trail_credentials')
        .maybeSingle();
      if (data?.id) await supabase.from('app_settings').update(payload).eq('id', data.id);
      else await supabase.from('app_settings').insert([payload]);
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(null), 2000);
    } finally { setSaving(false); }
  };

  const refresh = async (key: Key) => {
    setLoading({ ...loading, [key]: true });
    setError({ ...error, [key]: null });
    try {
      // Check if running locally (development mode)
      if (import.meta.env.DEV) {
        // Mock response for local development
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate loading
        const mockImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; // 1x1 transparent pixel
        setImages({ ...images, [key]: mockImage });
        return;
      }

      // Production: call Netlify function
      const res = await fetch(`/.netlify/functions/trail-progress?account=${key}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch');
      setImages({ ...images, [key]: json.image });
    } catch (e: any) {
      setError({ ...error, [key]: e.message || 'Error' });
    } finally {
      setLoading({ ...loading, [key]: false });
    }
  };

  const Panel = ({ id, title, keyId }: { id: string; title: string; keyId: Key }) => (
    <div id={id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm md:text-base">{title}</h3>
        <div className="flex gap-2">
          <button onClick={() => refresh(keyId)} className="px-3 py-1 border rounded text-sm" disabled={loading[keyId]}>{loading[keyId] ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>
      <div className="min-h-[300px] flex items-center justify-center bg-gray-50">
        {images[keyId] ? (
          <img src={images[keyId] as string} alt={`${title} screenshot`} className="max-w-full" />
        ) : (
          <div className="text-gray-500 text-sm">Click Refresh to load a live screenshot</div>
        )}
      </div>
      {error[keyId] && <div className="px-4 py-2 text-sm text-red-600">{error[keyId]}</div>}
    </div>
  );

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Trail Progress</h1>
        <p className="text-gray-500 mt-1">View each account via secure server-side snapshots.{import.meta.env.DEV && <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">DEV MODE</span>}</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Trail Credentials</h2>
        <p className="text-sm text-gray-600 mb-3">Store login details securely in Sushi Metrics. Serverless jobs use these to fetch snapshots. You can change them anytime.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['allerton','sefton','oldswan'] as Key[]).map((k) => (
            <div key={k} className="flex flex-col gap-2 border rounded p-3">
              <div className="text-sm font-medium text-gray-800">{k === 'allerton' ? 'Allerton Road' : k === 'sefton' ? 'Sefton Park' : 'Old Swan'}</div>
              <input className="px-3 py-2 border rounded" placeholder="Email" value={creds[k].email} onChange={(e) => setCreds({ ...creds, [k]: { ...creds[k], email: e.target.value } })} />
              <input className="px-3 py-2 border rounded" placeholder="Password" type="password" value={creds[k].password} onChange={(e) => setCreds({ ...creds, [k]: { ...creds[k], password: e.target.value } })} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2 items-center">
          <button onClick={saveCreds} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60">{saving ? 'Saving…' : 'Save Credentials'}</button>
          {saveMsg && <span className="text-sm text-gray-700">{saveMsg}</span>}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <Panel id="trail-allerton" title="Allerton Road Trail" keyId="allerton" />
        <Panel id="trail-sefton" title="Sefton Park Trail" keyId="sefton" />
        <Panel id="trail-oldswan" title="Old Swan Trail" keyId="oldswan" />
      </div>
    </div>
  );
}
