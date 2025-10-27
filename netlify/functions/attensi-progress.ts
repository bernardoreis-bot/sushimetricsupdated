export const handler = async () => {
  try {
    let email = process.env.ATTENSI_EMAIL;
    let pass = process.env.ATTENSI_PASSWORD;
    if (!email) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        if (SUPABASE_URL && SERVICE_KEY) {
          const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
          const { data } = await admin
            .from('app_settings')
            .select('setting_value')
            .eq('setting_key', 'attensi_credentials')
            .maybeSingle();
          const jc = data?.setting_value ? JSON.parse(data.setting_value) : null;
          if (jc) {
            email = email || jc.email;
            pass = pass || jc.password;
          }
        }
      } catch {}
    }
    if (!email || !pass) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing ATTENSI_EMAIL/ATTENSI_PASSWORD in Netlify env.' }) };
    }
    const chromium = require('chrome-aws-lambda');
    const puppeteer = require('puppeteer-core');
    const browser = await puppeteer.launch({
      args: [...chromium.args, '--disable-gpu', '--single-process'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(20000);
      const url = 'https://admin.attensi.com/yo/dashboard';
      await page.goto(url, { waitUntil: 'networkidle2' });
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
          const submitBtn = await page.$('button[type="submit"], button');
          if (submitBtn) await submitBtn.click();
          else await page.keyboard.press('Enter');
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
        }
      } catch {}
      await page.waitForTimeout(3000);
      const buf = await page.screenshot({ type: 'png', fullPage: true });
      const base64 = buf.toString('base64');
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ image: `data:image/png;base64,${base64}`, ts: new Date().toISOString() }) };
    } finally {
      await browser.close();
    }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};
