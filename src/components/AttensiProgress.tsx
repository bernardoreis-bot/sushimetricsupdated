import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const ATTENSI_URL = 'https://admin.attensi.com/yo/dashboard';

export default function AttensiProgress() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);
  const [img, setImg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attEmail, setAttEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => { loadEmail(); }, []);

  const loadEmail = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'attensi_credentials')
      .maybeSingle();
    try {
      const v = data?.setting_value ? JSON.parse(data.setting_value) : null;
      if (v?.email) setAttEmail(v.email);
    } catch {}
  };

  const saveEmail = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const payload: any = { setting_key: 'attensi_credentials', setting_value: JSON.stringify({ email: attEmail }), updated_at: new Date().toISOString() };
      const { data } = await supabase
        .from('app_settings')
        .select('id')
        .eq('setting_key', 'attensi_credentials')
        .maybeSingle();
      if (data?.id) await supabase.from('app_settings').update(payload).eq('id', data.id);
      else await supabase.from('app_settings').insert([payload]);
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(null), 2000);
    } finally { setSaving(false); }
  };

  const refresh = () => {
    if (iframeRef.current) {
      const src = iframeRef.current.src;
      iframeRef.current.src = src;
    }
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
      setIsFs(true);
    } else {
      await document.exitFullscreen?.();
      setIsFs(false);
    }
  };

  const openNew = () => {
    window.open(ATTENSI_URL, '_blank', 'noopener,noreferrer');
  };

  const loadSnapshot = async () => {
    setLoading(true);
    setError(null);
    try {
      // Check if running locally (development mode)
      if (import.meta.env.DEV) {
        // Mock response for local development
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate loading
        const mockImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; // 1x1 transparent pixel
        setImg(mockImage);
        return;
      }

      // Production: call Netlify function
      const res = await fetch('/.netlify/functions/attensi-progress');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setImg(json.image);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Attensi Progress</h1>
          <p className="text-gray-500 mt-1">View the Attensi dashboard. Log in once to keep the session.{import.meta.env.DEV && <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">DEV MODE</span>}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} className="px-3 py-2 border rounded">Refresh</button>
          <button onClick={toggleFullscreen} className="px-3 py-2 border rounded">{isFs ? 'Exit Fullscreen' : 'Fullscreen'}</button>
          <button onClick={openNew} className="px-3 py-2 border rounded">Open</button>
          <button onClick={loadSnapshot} disabled={loading} className="px-3 py-2 border rounded">{loading ? 'Loading…' : 'Load Snapshot'}</button>
        </div>
      </div>

      <div ref={containerRef} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <iframe
          ref={iframeRef}
          title="Attensi Dashboard"
          src={ATTENSI_URL}
          width="100%"
          style={{ height: '80vh' }}
          allowFullScreen
        />
      </div>

      <div className="mt-4 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200 font-medium">Snapshot (server-rendered)</div>
        <div className="min-h-[300px] flex items-center justify-center bg-gray-50">
          {img ? (
            <img src={img} alt="Attensi snapshot" className="max-w-full" />
          ) : (
            <div className="text-gray-500 text-sm">Click Load Snapshot to fetch a live view</div>
          )}
        </div>
        {error && <div className="px-4 py-2 text-sm text-red-600">{error}</div>}
      </div>
    </div>
  );
}
