import type { HandlerEvent } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

const POWERBI_EMBED_URL = 'https://app.powerbi.com/reportEmbed?reportId=c016912d-8d76-4829-85bb-e2f4056dd807&appId=eb0beee5-b009-4dee-816d-21adae41cf84&autoAuth=true&ctid=d1fd9353-f65b-4e79-a56a-70b4591ad484&actionBarEnabled=true&reportCopilotInEmbed=true';

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export function getLastSundayISO(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day; // 0 is Sunday
  const lastSunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  return lastSunday.toISOString().split('T')[0];
}

export async function loadConfig() {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'powerbi_sales_config')
    .maybeSingle();
  try {
    return data?.setting_value ? JSON.parse(data.setting_value) : { site_map: {} };
  } catch {
    return { site_map: {} };
  }
}

export async function saveAudit(entry: any) {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('id, setting_value')
    .eq('setting_key', 'powerbi_sales_audit')
    .maybeSingle();
  let list: any[] = [];
  try { list = data?.setting_value ? JSON.parse(data.setting_value) : []; } catch {}
  list.unshift({ time: new Date().toISOString(), ...entry });
  const payload = { setting_key: 'powerbi_sales_audit', setting_value: JSON.stringify(list.slice(0, 200)), updated_at: new Date().toISOString() } as any;
  if (data?.id) {
    await supabaseAdmin.from('app_settings').update(payload).eq('id', data.id);
  } else {
    await supabaseAdmin.from('app_settings').insert([payload]);
  }
}

export async function getSalesCategoryId() {
  const { data } = await supabaseAdmin
    .from('transaction_categories')
    .select('id, code')
    .eq('code', 'SALES')
    .maybeSingle();
  return data?.id || null;
}

async function screenshotReport(url?: string): Promise<string> {
  // Return base64 PNG
  const chromium = await import('chrome-aws-lambda');
  const puppeteer = await import('puppeteer-core');
  const executablePath = await chromium.executablePath;
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1440, height: 900 },
    executablePath,
    headless: 'new'
  } as any);
  try {
    const page = await browser.newPage();
    await page.goto(url || POWERBI_EMBED_URL, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(5000);
    const buf = await page.screenshot({ type: 'png', fullPage: true });
    return buf.toString('base64');
  } finally {
    await browser.close();
  }
}

async function extractSalesFromScreenshot(base64Png: string, siteNames: string[], lastSundayISO: string): Promise<Record<string, number>> {
  if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
  const prompt = [
    {
      role: 'system',
      content: 'You are a data extraction assistant. Read the image of a Power BI sales report and extract the latest Sunday sales figure in GBP for each provided site name. Return a strict JSON object mapping each site name to a number (e.g. {"Allerton Road": 1234.56}). Use 0 if not visible.'
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Sites: ${siteNames.join(', ')}. Target date: ${lastSundayISO}. Look for weekly sales or last Sunday figures in GBP (£). Return only valid JSON.` },
        { type: 'input_image', image_url: { url: `data:image/png;base64,${base64Png}` } }
      ] as any
    }
  ];
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: prompt,
      temperature: 0
    })
  });
  const json = await resp.json();
  const text = json.choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(text); } catch { throw new Error('Model did not return JSON'); }
}

async function extractCurrentViewFromScreenshot(base64Png: string): Promise<{ site_name: string; last7days_amount: number; sunday_present?: boolean }> {
  if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
  const prompt = [
    {
      role: 'system',
      content: 'You read a Power BI SALES dashboard screenshot. Extract the selected Site name (top-right Site filter value) and the numeric total for "Last 7 Days" card in GBP. Also confirm whether the Last 7 Days bar chart includes a bar for Sunday (return sunday_present true/false). Return JSON like {"site_name":"Allerton Road","last7days_amount":4673.00,"sunday_present":true}. If not visible, return zero amount and empty site.'
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Find the Site value at the top right (dropdown current selection). Also find the big KPI card labeled "Last 7 Days" and read its currency value in GBP. Confirm whether the bar chart below includes a Sunday bar.' },
        { type: 'input_image', image_url: { url: `data:image/png;base64,${base64Png}` } }
      ] as any
    }
  ];
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: prompt, temperature: 0 })
  });
  const json = await resp.json();
  const text = json.choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(text); } catch { throw new Error('Model did not return JSON'); }
}

export async function createSalesTransactions(amountBySiteId: Record<string, number>, sundayISO: string, source: string) {
  const salesCatId = await getSalesCategoryId();
  const entries = Object.entries(amountBySiteId).map(([site_id, amount]) => ({
    transaction_date: sundayISO,
    site_id,
    category_id: salesCatId,
    supplier_id: null,
    invoice_number: null,
    invoice_reference: null,
    amount: Number(amount || 0),
    notes: `PowerBI weekly sales (${source})` ,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabaseAdmin.from('transactions').insert(entries);
  if (error) throw error;
}

export async function runExtractCurrentView(source: string) {
  const cfg = await loadConfig();
  const siteMap: Record<string, string> = cfg.site_map || {};
  const sundayISO = getLastSundayISO();
  const png = await screenshotReport();
  const { site_name, last7days_amount } = await extractCurrentViewFromScreenshot(png);
  // Map extracted site name to configured site ID (case-insensitive contains)
  const match = Object.keys(siteMap).find(k => k.toLowerCase() === (site_name || '').toLowerCase())
    || Object.keys(siteMap).find(k => (site_name || '').toLowerCase().includes(k.toLowerCase()))
    || Object.keys(siteMap).find(k => k.toLowerCase().includes((site_name || '').toLowerCase()));
  const siteId = match ? siteMap[match] : undefined;
  const bySiteId: Record<string, number> = {};
  if (siteId && Number(last7days_amount) > 0) bySiteId[siteId] = Number(last7days_amount);
  await createSalesTransactions(bySiteId, sundayISO, source);
  await saveAudit({ type: 'extract_current', source, sundayISO, extracted: { site_name, last7days_amount }, mapped: bySiteId });
  return { bySiteId, extracted: { site_name, last7days_amount } };
}

async function siteIdByName(name: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('sites')
    .select('id, name, is_active')
    .eq('is_active', true);
  const match = (data || []).find((s: any) => (s.name || '').toLowerCase() === name.toLowerCase());
  return match?.id || null;
}

async function hasWeeklySalesFor(site_id: string, sundayISO: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('transactions')
    .select('id')
    .eq('site_id', site_id)
    .eq('transaction_date', sundayISO)
    .limit(1);
  return !!(data && data.length > 0);
}

export async function runScheduledBatch(): Promise<any> {
  const sundayISO = getLastSundayISO();
  const { data: autoCfgRow } = await supabaseAdmin
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'powerbi_sales_auto')
    .maybeSingle();
  let autoCfg: any = {};
  try { autoCfg = autoCfgRow?.setting_value ? JSON.parse(autoCfgRow.setting_value) : {}; } catch {}
  const embedUrls: Record<string, string> = autoCfg.embed_urls || {};
  const sites = ['Allerton Road', 'Sefton Park', 'Old Swan'];
  const results: any[] = [];
  for (const siteName of sites) {
    const site_id = await siteIdByName(siteName);
    if (!site_id) { await saveAudit({ type: 'batch_skip', reason: 'site_not_found', siteName }); continue; }
    const already = await hasWeeklySalesFor(site_id, sundayISO);
    if (already) { await saveAudit({ type: 'batch_skip', reason: 'already_created', siteName, sundayISO }); continue; }
    const url = embedUrls[siteName] || POWERBI_EMBED_URL;
    try {
      const png = await screenshotReport(url);
      const { site_name, last7days_amount, sunday_present } = await extractCurrentViewFromScreenshot(png);
      const nameOk = !site_name || site_name.toLowerCase().includes(siteName.toLowerCase()) || siteName.toLowerCase().includes((site_name || '').toLowerCase());
      if (Number(last7days_amount) > 0 && nameOk && (sunday_present !== false)) {
        await createSalesTransactions({ [site_id]: Number(last7days_amount) }, sundayISO, 'schedule');
        results.push({ siteName, amount: Number(last7days_amount) });
        await saveAudit({ type: 'batch_success', siteName, sundayISO, amount: Number(last7days_amount) });
      } else {
        await saveAudit({ type: 'batch_no_data', siteName, sundayISO, extracted: { site_name, last7days_amount, sunday_present } });
      }
    } catch (err: any) {
      await saveAudit({ type: 'batch_error', siteName, error: err.message || String(err) });
    }
  }
  // If it's Wednesday >= 18:00 UTC and some sites still missing, raise alert entries
  const now = new Date();
  const isWed = now.getUTCDay() === 3; // 3 = Wednesday
  const hour = now.getUTCHours();
  if (isWed && hour >= 18) {
    for (const siteName of sites) {
      const site_id = await siteIdByName(siteName);
      if (!site_id) continue;
      const done = await hasWeeklySalesFor(site_id, sundayISO);
      if (!done) {
        await saveAudit({ type: 'schedule_alert', siteName, sundayISO, message: 'Sales still missing by Wednesday 18:00 UTC' });
      }
    }
  }
  return { ok: true, results };
}
