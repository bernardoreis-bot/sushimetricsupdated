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

async function screenshotReport(): Promise<string> {
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
    await page.goto(POWERBI_EMBED_URL, { waitUntil: 'networkidle2' });
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

export async function runExtractLatest(source: string) {
  const cfg = await loadConfig();
  const siteMap: Record<string, string> = cfg.site_map || {};
  const pbiSiteNames = Object.keys(siteMap).filter(k => siteMap[k]);
  if (pbiSiteNames.length === 0) throw new Error('No sites mapped in config');
  const sundayISO = getLastSundayISO();
  const png = await screenshotReport();
  const amountsByPbiName = await extractSalesFromScreenshot(png, pbiSiteNames, sundayISO);
  const bySiteId: Record<string, number> = {};
  for (const [pbiName, siteId] of Object.entries(siteMap)) {
    if (!siteId) continue;
    const v = Number((amountsByPbiName as any)[pbiName] || 0);
    if (!isNaN(v) && v > 0) bySiteId[siteId] = v;
  }
  await createSalesTransactions(bySiteId, sundayISO, source);
  const missing: string[] = pbiSiteNames.filter(n => !(amountsByPbiName as any)[n] || Number((amountsByPbiName as any)[n]) <= 0);
  await saveAudit({ type: 'extract', source, sundayISO, extracted: amountsByPbiName, mapped: bySiteId, missing });
  return { bySiteId, missing };
}
