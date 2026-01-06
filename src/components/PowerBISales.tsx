import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Site { id: string; name: string; }

const POWERBI_EMBED_URL = 'https://app.powerbi.com/reportEmbed?reportId=bc012c13-5fac-40ac-8eb1-075976a011f5&appId=eb0beee5-b009-4dee-816d-21adae41cf84&autoAuth=true&ctid=d1fd9353-f65b-4e79-a56a-70b4591ad484&actionBarEnabled=true&reportCopilotInEmbed=true';
const POWERBI_DAILY_URL = 'https://app.powerbi.com/reportEmbed?reportId=a22f8ce4-fc3a-44d0-a85f-83b43ee619c0&appId=eb0beee5-b009-4dee-816d-21adae41cf84&autoAuth=true&ctid=d1fd9353-f65b-4e79-a56a-70b4591ad484&actionBarEnabled=true';
const POWERBI_DETAIL_URL = 'https://app.powerbi.com/reportEmbed?reportId=f5aec466-0ff8-478c-86b9-83ab98400152&appId=eb0beee5-b009-4dee-816d-21adae41cf84&autoAuth=true&ctid=d1fd9353-f65b-4e79-a56a-70b4591ad484&actionBarEnabled=true';

export default function PowerBISales() {
  const [sites, setSites] = useState<Site[]>([]);
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

  const loadSalesCategory = async () => {
    const { data } = await supabase
      .from('transaction_categories')
      .select('id, code')
      .eq('is_active', true);
    const sales = (data || []).find((c: any) => (c.code || '').toUpperCase() === 'SALES');
    setSalesCategoryId(sales?.id || null);
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
        {feedback && <div className="mt-2 text-sm text-gray-700">{feedback}</div>}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="aspect-video w-full border rounded overflow-hidden">
          <iframe title="Franchise Report" width="100%" height="100%" src={POWERBI_EMBED_URL} frameBorder={0} allowFullScreen />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Daily Sales Report</h2>
        <div className="aspect-video w-full border rounded overflow-hidden">
          <iframe title="Daily Sales Report - Franchise" width="100%" height="100%" src={POWERBI_DAILY_URL} frameBorder={0} allowFullScreen />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Detail Export</h2>
        <div className="aspect-video w-full border rounded overflow-hidden">
          <iframe title="Detail Export" width="100%" height="100%" src={POWERBI_DETAIL_URL} frameBorder={0} allowFullScreen />
        </div>
      </div>
    </div>
  );
}
