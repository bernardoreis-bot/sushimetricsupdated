// Serverless screenshot for Trail accounts
// Usage: GET /.netlify/functions/trail-progress?account=allerton|sefton|oldswan
// Returns: { image: "data:image/png;base64,...", ts: ISOString }

export const handler = async (event: any) => {
  try {
    const account = (event.queryStringParameters?.account || '').toLowerCase();
    const map: Record<string, { email?: string; pass?: string }> = {
      allerton: { email: process.env.TRAIL_ALLERTON_EMAIL, pass: process.env.TRAIL_ALLERTON_PASSWORD },
      sefton:   { email: process.env.TRAIL_SEFTON_EMAIL,   pass: process.env.TRAIL_SEFTON_PASSWORD },
      oldswan:  { email: process.env.TRAIL_OLDSWAN_EMAIL,  pass: process.env.TRAIL_OLDSWAN_PASSWORD },
    };

    // If envs missing, try Supabase app_settings: key 'trail_credentials'
    if (!map.allerton.email || !map.sefton.email || !map.oldswan.email) {
      const { createClient } = await import('@supabase/supabase-js');
      const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      if (SUPABASE_URL && SERVICE_KEY) {
        const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data } = await admin
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'trail_credentials')
          .maybeSingle();
        try {
          const jc = data?.setting_value ? JSON.parse(data.setting_value) : null;
          if (jc) {
            map.allerton.email = map.allerton.email || jc?.allerton?.email;
            map.allerton.pass  = map.allerton.pass  || jc?.allerton?.password;
            map.sefton.email   = map.sefton.email   || jc?.sefton?.email;
            map.sefton.pass    = map.sefton.pass    || jc?.sefton?.password;
            map.oldswan.email  = map.oldswan.email  || jc?.oldswan?.email;
            map.oldswan.pass   = map.oldswan.pass   || jc?.oldswan?.password;
          }
        } catch {}
      }
    }
    if (!map[account]) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid account. Use allerton|sefton|oldswan' }) };
    }

    const { email, pass } = map[account];
    if (!email || !pass) {
      return { statusCode: 400, body: JSON.stringify({ error: `Missing credentials for ${account}. Add them in Sushi Metrics → People Management → Trail Progress → Trail Credentials, or set TRAIL_* env vars in Netlify.` }) };
    }

    const puppeteer = require('puppeteer-core');
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: '/opt/chrome/chrome',
      headless: true,
    });

    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(12000);
      const url = 'https://web.trailapp.com/trail#/';
      await page.goto(url, { waitUntil: 'networkidle2' });

      // If redirected to login, try to fill
      try {
        const emailSel = 'input[type="email"], input[name="email"], input#email, input[name="username"], input#username';
        const passSel = 'input[type="password"], input[name="password"], input#password';
        const hasEmail = await page.$(emailSel);
        const hasPass = await page.$(passSel);
        if (hasEmail && hasPass) {
          await page.click(emailSel);
          await page.keyboard.type(email);
          await page.click(passSel);
          await page.keyboard.type(pass);
          // Try submit
          const submitBtn = await page.$('button[type="submit"], button:not([type])');
          if (submitBtn) await submitBtn.click();
          else {
            await page.keyboard.press('Enter');
          }
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
        }
      } catch {}

      await page.waitForTimeout(1500);
      const buf = await page.screenshot({ type: 'png', fullPage: true });
      const base64 = buf.toString('base64');
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ image: `data:image/png;base64,${base64}` , ts: new Date().toISOString() }) };
    } finally {
      await browser.close();
    }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};
