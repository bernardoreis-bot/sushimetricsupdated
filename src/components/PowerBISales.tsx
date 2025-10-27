import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Site { id: string; name: string; }

const POWERBI_EMBED_URL = 'https://app.powerbi.com/reportEmbed?reportId=c016912d-8d76-4829-85bb-e2f4056dd807&appId=eb0beee5-b009-4dee-816d-21adae41cf84&autoAuth=true&ctid=d1fd9353-f65b-4e79-a56a-70b4591ad484&actionBarEnabled=true&reportCopilotInEmbed=true';

export default function PowerBISales() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [manual, setManual] = useState<{ [k: string]: string }>({});
  const [salesCategoryId, setSalesCategoryId] = useState<string | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [autoUrls, setAutoUrls] = useState<{ [name: string]: string }>({
    'Allerton Road': '',
    'Sefton Park': '',
    'Old Swan': ''
  });

  const lastSunday = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - day);
    return sunday.toISOString().split('T')[0];
  }, []);

  useEffect(() => {
    loadSites();
    loadSalesCategory();
    loadAudit();
    loadAuto();
  }, []);

  const loadSites = async () => {
    const { data } = await supabase
      .from('sites')
      .select('id, name')
      .neq('site_code', 'ALL')
      .eq('is_active', true)
      .order('name');
    if (data) setSites(data as any);
  };

  const loadAuto = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'powerbi_sales_auto')
      .maybeSingle();
    try {
      const parsed = data?.setting_value ? JSON.parse(data.setting_value) : {};
      setAutoUrls(parsed.embed_urls || autoUrls);
    } catch {}
  };

  const saveAuto = async () => {
    const payload = { setting_key: 'powerbi_sales_auto', setting_value: JSON.stringify({ embed_urls: autoUrls }), updated_at: new Date().toISOString() } as any;
    const { data } = await supabase
      .from('app_settings')
      .select('id')
      .eq('setting_key', 'powerbi_sales_auto')
      .maybeSingle();
    if (data?.id) {
      await supabase.from('app_settings').update(payload).eq('id', data.id);
    } else {
      await supabase.from('app_settings').insert([payload]);
    }
    setFeedback('Automation settings saved');
    setTimeout(() => setFeedback(null), 2000);
  };

  const runAutomationNow = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/.netlify/functions/powerbi-sales-schedule', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Run failed');
      setFeedback('Automation executed');
      loadAudit();
    } catch (e: any) {
      setFeedback(e.message || 'Failed to run');
    } finally {
      setLoading(false);
    }
  };

  const loadSalesCategory = async () => {
    const { data } = await supabase
      .from('transaction_categories')
      .select('id, code')
      .eq('is_active', true);
    const sales = (data || []).find((c: any) => (c.code || '').toUpperCase() === 'SALES');
    setSalesCategoryId(sales?.id || null);
  };

  const loadAudit = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'powerbi_sales_audit')
      .maybeSingle();
    try {
      setAudit(data?.setting_value ? JSON.parse(data.setting_value).slice(0, 50) : []);
    } catch {
      setAudit([]);
    }
  };

  const triggerManual = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      if (!salesCategoryId) throw new Error('Sales category not found. Create/enable category with code SALES.');
      const sunday = lastSunday;
      const rows: any[] = [];
      const targets = ['Allerton Road', 'Sefton Park', 'Old Swan'];
      for (const name of targets) {
        const amt = parseFloat(manual[name] || '');
        const site = sites.find(s => s.name.toLowerCase() === name.toLowerCase());
        if (site?.id && !isNaN(amt) && amt > 0) {
          rows.push({
            transaction_date: sunday,
            site_id: site.id,
            category_id: salesCategoryId,
            supplier_id: null,
            invoice_number: null,
            invoice_reference: null,
            amount: amt,
            notes: 'PowerBI weekly sales (manual)',
            updated_at: new Date().toISOString(),
          });
        }
      }
      if (rows.length === 0) throw new Error('Enter at least one amount and map sites.');
      const { error } = await supabase.from('transactions').insert(rows);
      if (error) throw new Error(error.message);
      setFeedback(`Created ${rows.length} sales transaction(s) for ${sunday}.`);
      setManual({});
      loadAudit();
    } catch (e: any) {
      setFeedback(e.message || 'Failed to create');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">PowerBI Sales</h1>
        <p className="text-gray-500 mt-1">Embedded report and automated weekly sales extraction</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="aspect-video w-full border rounded overflow-hidden">
          <iframe title="Franchise Report" width="100%" height="100%" src={POWERBI_EMBED_URL} frameBorder={0} allowFullScreen />
        </div>
      </div>

      

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Quick Add Sales Transaction (Sunday {lastSunday})</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {['Allerton Road','Sefton Park','Old Swan'].map((name) => (
            <div key={name} className="flex flex-col gap-1">
              <label className="text-sm text-gray-700">{name} amount (£)</label>
              <input
                type="number"
                step="0.01"
                value={manual[name] || ''}
                onChange={(e) => setManual({ ...manual, [name]: e.target.value })}
                className="px-3 py-2 border rounded"
                placeholder="0.00"
              />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <button onClick={triggerManual} disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-60">Quick Add Sales Transaction</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Automation Settings</h2>
        <p className="text-sm text-gray-600 mb-3">Optional: paste per-site embed URLs pre-filtered to the site in Power BI. Used by the scheduled extractor to read the correct site automatically.</p>
        <div className="grid grid-cols-1 gap-3">
          {(['Allerton Road','Sefton Park','Old Swan'] as const).map((name) => (
            <div key={name} className="flex flex-col gap-1">
              <label className="text-sm text-gray-700">{name} embed URL</label>
              <input
                type="url"
                value={autoUrls[name] || ''}
                onChange={(e) => setAutoUrls({ ...autoUrls, [name]: e.target.value })}
                className="px-3 py-2 border rounded"
                placeholder="https://app.powerbi.com/reportEmbed?...(filtered to site)"
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={saveAuto} className="px-4 py-2 bg-blue-600 text-white rounded">Save Settings</button>
          <button onClick={runAutomationNow} disabled={loading} className="px-4 py-2 bg-orange-600 text-white rounded disabled:opacity-60">{loading ? 'Running…' : 'Run Automation Now'}</button>
        </div>
        {feedback && <div className="mt-2 text-sm text-gray-700">{feedback}</div>}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">Automation Status</h2>
          <button onClick={loadAudit} className="px-3 py-1 border rounded">Refresh</button>
        </div>
        <div className="text-sm text-gray-600">Shows latest attempts, successes, and alerts from the automated process.</div>
        <div className="mt-3 max-h-64 overflow-auto text-sm">
          {audit.length === 0 && <div className="text-gray-500">No logs yet</div>}
          {audit.map((a, idx) => (
            <div key={idx} className="py-1 border-b border-gray-100">
              <div className="font-mono text-gray-700">{a.time || ''} • {a.type}</div>
              <div className="text-gray-600 truncate">{JSON.stringify(a)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
