import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Site { id: string; name: string; }

interface PBISalesConfig {
  site_map: { [powerbiName: string]: string }; // maps PowerBI name -> site_id
  last_run?: string;
}

const POWERBI_EMBED_URL = 'https://app.powerbi.com/reportEmbed?reportId=c016912d-8d76-4829-85bb-e2f4056dd807&appId=eb0beee5-b009-4dee-816d-21adae41cf84&autoAuth=true&ctid=d1fd9353-f65b-4e79-a56a-70b4591ad484&actionBarEnabled=true&reportCopilotInEmbed=true';

export default function PowerBISales() {
  const [sites, setSites] = useState<Site[]>([]);
  const [config, setConfig] = useState<PBISalesConfig>({ site_map: { 'Allerton Road': '', 'Sefton Park': '', 'Old Swan': '' } });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [manual, setManual] = useState<{ [k: string]: string }>({});
  const [salesCategoryId, setSalesCategoryId] = useState<string | null>(null);

  const lastSunday = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - day);
    return sunday.toISOString().split('T')[0];
  }, []);

  useEffect(() => {
    loadSites();
    loadConfig();
    loadSalesCategory();
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

  const loadConfig = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'powerbi_sales_config')
      .maybeSingle();
    try {
      const parsed = data?.setting_value ? JSON.parse(data.setting_value) : null;
      if (parsed && parsed.site_map) setConfig(parsed);
    } catch {}
  };

  const loadSalesCategory = async () => {
    const { data } = await supabase
      .from('transaction_categories')
      .select('id, code')
      .eq('is_active', true);
    const sales = (data || []).find((c: any) => (c.code || '').toUpperCase() === 'SALES');
    setSalesCategoryId(sales?.id || null);
  };

  const saveConfig = async () => {
    const payload = { setting_key: 'powerbi_sales_config', setting_value: JSON.stringify(config), updated_at: new Date().toISOString() } as any;
    const { data } = await supabase
      .from('app_settings')
      .select('id')
      .eq('setting_key', 'powerbi_sales_config')
      .maybeSingle();
    if (data?.id) {
      await supabase.from('app_settings').update(payload).eq('id', data.id);
    } else {
      await supabase.from('app_settings').insert([payload]);
    }
    setFeedback('Configuration saved');
    setTimeout(() => setFeedback(null), 2000);
  };

  const triggerExtract = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/.netlify/functions/powerbi-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extract_latest', manual_override: null })
      });
      const json = await res.json();
      if (!res.ok) {
        const hint = json?.error?.includes('OPENAI') || json?.error?.toLowerCase?.().includes('openai')
          ? 'Missing or invalid OPENAI_API_KEY on Netlify.'
          : json?.error?.includes('SUPABASE') || json?.error?.toLowerCase?.().includes('supabase')
          ? 'Missing SUPABASE_SERVICE_ROLE_KEY on Netlify.'
          : '';
        throw new Error((json.error || 'Failed') + (hint ? ` — ${hint}` : ''));
      }
      setFeedback(json.message || 'Extracted and created sales transactions');
    } catch (e: any) {
      setFeedback(e.message || 'Failed to trigger');
    } finally {
      setLoading(false);
    }
  };

  const triggerManual = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      if (!salesCategoryId) throw new Error('Sales category not found. Create/enable category with code SALES.');
      const sunday = lastSunday;
      const rows: any[] = [];
      for (const [pbiName, siteId] of Object.entries(config.site_map)) {
        const amt = parseFloat(manual[pbiName] || '');
        if (siteId && !isNaN(amt) && amt > 0) {
          rows.push({
            transaction_date: sunday,
            site_id: siteId,
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Site Mapping</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.keys(config.site_map).map((pbiName) => (
            <div key={pbiName} className="flex flex-col gap-1">
              <label className="text-sm text-gray-700">{pbiName} → Sushi Metrics site</label>
              <select
                value={config.site_map[pbiName] || ''}
                onChange={(e) => setConfig({ ...config, site_map: { ...config.site_map, [pbiName]: e.target.value } })}
                className="px-3 py-2 border rounded"
              >
                <option value="">Select site</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={saveConfig} className="px-4 py-2 bg-blue-600 text-white rounded">Save Config</button>
          <button onClick={triggerExtract} disabled={loading} className="px-4 py-2 bg-orange-600 text-white rounded disabled:opacity-60">{loading ? 'Running…' : 'Run Extract Now'}</button>
        </div>
        {feedback && <div className="mt-2 text-sm text-gray-700">{feedback}</div>}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Manual Override (last Sunday {lastSunday})</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.keys(config.site_map).map((pbiName) => (
            <div key={pbiName} className="flex flex-col gap-1">
              <label className="text-sm text-gray-700">{pbiName} amount (£)</label>
              <input
                type="number"
                step="0.01"
                value={manual[pbiName] || ''}
                onChange={(e) => setManual({ ...manual, [pbiName]: e.target.value })}
                className="px-3 py-2 border rounded"
                placeholder="0.00"
              />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <button onClick={triggerManual} disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-60">Create Sales Transactions</button>
        </div>
      </div>
    </div>
  );
}
