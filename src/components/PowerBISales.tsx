import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Brain, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import OpenAI from 'openai';

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
  
  // AI Production Plan States
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState<any>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [monthsToAnalyze, setMonthsToAnalyze] = useState(3);
  const [bufferPercent, setBufferPercent] = useState(15);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [selectedSiteForAI, setSelectedSiteForAI] = useState<string>('all');
  

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
    checkOpenAIConfig();
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

  const checkOpenAIConfig = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'openai_api_key')
        .maybeSingle();
      setOpenaiConfigured(data?.setting_value && data.setting_value.length > 10);
    } catch (error) {
      console.error('Error checking OpenAI config:', error);
      setOpenaiConfigured(false);
    }
  };

  const analyzeSalesWithAI = async () => {
    if (!openaiConfigured) {
      setAiError('OpenAI API key not configured. Please configure it in settings.');
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setAiResults(null);

    try {
      // Calculate date range for analysis
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - monthsToAnalyze);

      // Query sales data from Supabase
      let query = supabase
        .from('transactions')
        .select('transaction_date, amount, site_id, sites(name)')
        .eq('category_id', salesCategoryId)
        .gte('transaction_date', startDate.toISOString())
        .lte('transaction_date', endDate.toISOString())
        .order('transaction_date', { ascending: true });

      if (selectedSiteForAI !== 'all') {
        query = query.eq('site_id', selectedSiteForAI);
      }

      const { data: salesData, error: salesError } = await query;

      if (salesError) throw new Error(`Failed to fetch sales data: ${salesError.message}`);
      if (!salesData || salesData.length === 0) {
        throw new Error('No sales data found for the selected period and site');
      }

      // Format data for AI analysis
      const formattedData = salesData.map((row: any) => ({
        date: row.transaction_date,
        amount: row.amount,
        site: row.sites?.name || 'Unknown'
      }));

      // Get OpenAI API key
      const { data: apiKeyData } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'openai_api_key')
        .maybeSingle();

      const apiKey = apiKeyData?.setting_value;
      if (!apiKey) {
        throw new Error('OpenAI API key not found');
      }

      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

      // Create prompt for AI analysis
      const prompt = `Analyze this sales data and create a production plan using the following parameters:
- Analyze the last ${monthsToAnalyze} months of sales data (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})
- Apply a ${bufferPercent}% buffer for safety stock
- Consider weekday patterns (Monday-Sunday sales variations)
- Provide production recommendations per item
- Calculate daily production quantities
- Identify top-selling items and seasonal trends
- Site filter: ${selectedSiteForAI === 'all' ? 'All sites' : 'Specific site'}

Sales Data:
${JSON.stringify(formattedData, null, 2)}

Please provide the analysis in JSON format with the following structure:
{
  "summary": "Overall analysis summary",
  "topItems": [{"name": "Item name", "avgDailySales": number, "recommendedDailyProduction": number}],
  "productionPlan": [{"item": "Item name", "dailyQuantity": number, "weeklyQuantity": number, "bufferIncluded": number}],
  "insights": ["Insight 1", "Insight 2"],
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a production planning expert. Analyze sales data and create production plans.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      // Try to parse JSON response
      let parsedResults;
      try {
        parsedResults = JSON.parse(content);
      } catch {
        // If not JSON, wrap in a structure
        parsedResults = {
          summary: content,
          topItems: [],
          productionPlan: [],
          insights: [],
          recommendations: []
        };
      }

      setAiResults(parsedResults);
    } catch (error: any) {
      setAiError(error.message || 'Failed to analyze sales data with AI');
    } finally {
      setAiLoading(false);
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5" />
          AI-Powered Production Plan
        </h2>
        
        {!openaiConfigured && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              OpenAI API key not configured. Configure it in app settings to enable AI production planning.
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Site for Analysis
            </label>
            <select
              value={selectedSiteForAI}
              onChange={(e) => setSelectedSiteForAI(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="all">All Sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Months to Analyze
              </label>
              <select
                value={monthsToAnalyze}
                onChange={(e) => setMonthsToAnalyze(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value={3}>3 Months</option>
                <option value={4}>4 Months</option>
                <option value={5}>5 Months</option>
                <option value={6}>6 Months</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buffer Percentage
              </label>
              <input
                type="number"
                value={bufferPercent}
                onChange={(e) => setBufferPercent(Number(e.target.value))}
                min="0"
                max="50"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>

          <button
            onClick={analyzeSalesWithAI}
            disabled={!openaiConfigured || aiLoading}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition"
          >
            {aiLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Analyzing with AI...
              </>
            ) : (
              <>
                <Brain className="w-5 h-5" />
                Generate Production Plan
              </>
            )}
          </button>

          {aiError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="text-sm text-red-800">{aiError}</div>
            </div>
          )}

          {aiResults && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Analysis Complete
                </h3>
                <p className="text-sm text-green-800">{aiResults.summary}</p>
              </div>

              {aiResults.topItems && aiResults.topItems.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Top Selling Items</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-right">Avg Daily Sales</th>
                          <th className="px-3 py-2 text-right">Recommended Production</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiResults.topItems.map((item: any, idx: number) => (
                          <tr key={idx} className="border-t">
                            <td className="px-3 py-2">{item.name}</td>
                            <td className="px-3 py-2 text-right">{item.avgDailySales}</td>
                            <td className="px-3 py-2 text-right font-medium">{item.recommendedDailyProduction}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {aiResults.productionPlan && aiResults.productionPlan.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Production Plan</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-right">Daily Qty</th>
                          <th className="px-3 py-2 text-right">Weekly Qty</th>
                          <th className="px-3 py-2 text-right">Buffer Included</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiResults.productionPlan.map((item: any, idx: number) => (
                          <tr key={idx} className="border-t">
                            <td className="px-3 py-2">{item.item}</td>
                            <td className="px-3 py-2 text-right">{item.dailyQuantity}</td>
                            <td className="px-3 py-2 text-right">{item.weeklyQuantity}</td>
                            <td className="px-3 py-2 text-right">{item.bufferIncluded}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {aiResults.insights && aiResults.insights.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Key Insights</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                    {aiResults.insights.map((insight: string, idx: number) => (
                      <li key={idx}>{insight}</li>
                    ))}
                  </ul>
                </div>
              )}

              {aiResults.recommendations && aiResults.recommendations.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Recommendations</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                    {aiResults.recommendations.map((rec: string, idx: number) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
