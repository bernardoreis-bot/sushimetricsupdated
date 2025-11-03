const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const { createClient } = require('@supabase/supabase-js');

const STORE_MAP = {
  allerton: 'Allerton Road',
  sefton: 'Sefton Park',
  oldswan: 'Old Swan',
};

const REPORT_MAP = {
  'complete-tasks': {
    label: 'Complete Tasks',
    url: 'https://web.trailapp.com/trail#/',
  },
  'daily-report': {
    label: 'Daily Report',
    url: 'https://web.trailapp.com/reports#/scores',
  },
};

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  },
  body: JSON.stringify(payload),
});

const resolveEnvCredentials = (store) => {
  const upper = store.toUpperCase();
  const email = process.env[`TRAIL_${upper}_EMAIL`];
  const password = process.env[`TRAIL_${upper}_PASSWORD`];
  if (email && password) {
    return { email, password };
  }
  return null;
};

const fetchStoredCredentials = async () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'trail_credentials')
    .maybeSingle();

  if (error) {
    console.error('[trail-fetch] Failed to load stored credentials', error.message);
    return null;
  }

  try {
    return data?.setting_value ? JSON.parse(data.setting_value) : null;
  } catch (parseError) {
    console.error('[trail-fetch] Invalid stored credentials payload');
    return null;
  }
};

const ensureCredentials = async (store, provided) => {
  if (provided?.email && provided?.password) {
    return provided;
  }

  const envCreds = resolveEnvCredentials(store);
  if (envCreds) {
    return envCreds;
  }

  const stored = await fetchStoredCredentials();
  if (stored?.[store]?.email && stored?.[store]?.password) {
    return {
      email: stored[store].email,
      password: stored[store].password,
    };
  }

  return null;
};

const extractStructuredData = async (page) => {
  try {
    return await page.evaluate(() => {
      const output = {
        tasks: [],
        summary: null,
      };

      const header = document.querySelector('header h1, header h2, main h1, main h2');
      if (header && header.textContent) {
        output.summary = header.textContent.trim();
      }

      const taskSelectors = [
        '[data-testid="task-row"]',
        '[data-testid="task-item"]',
        '.task-row',
        '.task-item',
        '[role="row"]',
      ];

      const seen = new Set();
      taskSelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((el) => {
          if (seen.has(el)) return;
          seen.add(el);

          const nameNode = el.querySelector('[data-testid="task-name"], .task-name, .taskName, [role="cell"]');
          const statusNode = el.querySelector('[data-testid="task-status"], .status, .task-status');
          const completionNode = el.querySelector('[data-testid="task-completion"], .completion, .task-completion');

          const name = nameNode?.textContent?.trim();
          if (!name) return;

          output.tasks.push({
            name,
            status: statusNode?.textContent?.trim() || null,
            completion: completionNode?.textContent?.trim() || null,
          });
        });
      });

      return output;
    });
  } catch (error) {
    console.warn('[trail-fetch] Failed to extract structured data:', error.message);
    return {
      tasks: [],
      summary: null,
    };
  }
};

const waitForContent = async (page, reportType) => {
  const waitPromises = [page.waitForTimeout(2500)];
  if (reportType === 'complete-tasks') {
    waitPromises.push(
      page.waitForSelector('[data-testid="task-list"], [role="table"], .task-list', {
        timeout: 10000,
      }).catch(() => null)
    );
  } else {
    waitPromises.push(
      page.waitForSelector('[data-testid="scores"], [data-testid="report"]', {
        timeout: 10000,
      }).catch(() => null)
    );
  }
  await Promise.all(waitPromises);
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' });
  }

  let request;
  try {
    request = JSON.parse(event.body || '{}');
  } catch (error) {
    return jsonResponse(400, { success: false, error: 'Invalid JSON payload' });
  }

  const store = (request.store || '').toLowerCase();
  const reportType = (request.reportType || '').toLowerCase();

  if (!STORE_MAP[store]) {
    return jsonResponse(400, { success: false, error: 'Invalid store. Use allerton, sefton, or oldswan.' });
  }

  if (!REPORT_MAP[reportType]) {
    return jsonResponse(400, { success: false, error: 'Invalid report type. Use complete-tasks or daily-report.' });
  }

  const credentials = await ensureCredentials(store, request.credentials);
  if (!credentials) {
    return jsonResponse(400, {
      success: false,
      error: `Missing credentials for ${STORE_MAP[store]}. Save them in Sushi Metrics or set TRAIL_${store.toUpperCase()}_* environment variables.`,
    });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(20000);

    const { url } = REPORT_MAP[reportType];
    await page.goto(url, { waitUntil: 'networkidle2' });

    try {
      const emailSelector = 'input[type="email"], input[name="email"], input#email, input[name="username"], input#username';
      const passwordSelector = 'input[type="password"], input[name="password"], input#password';
      const submitSelector = 'button[type="submit"], button[data-testid="login-submit"], button:not([type])';

      const emailInput = await page.$(emailSelector);
      const passwordInput = await page.$(passwordSelector);

      if (emailInput && passwordInput) {
        await emailInput.click({ clickCount: 3 }).catch(() => {});
        await emailInput.type(credentials.email, { delay: 50 });
        await passwordInput.click({ clickCount: 3 }).catch(() => {});
        await passwordInput.type(credentials.password, { delay: 50 });

        const submitButton = await page.$(submitSelector);
        if (submitButton) {
          await submitButton.click().catch(() => {});
        } else {
          await page.keyboard.press('Enter').catch(() => {});
        }
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 12000 }).catch(() => null);
      }
    } catch (loginError) {
      console.warn('[trail-fetch] Login interaction failed:', loginError.message);
    }

    await waitForContent(page, reportType);

    const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: true });
    const screenshot = `data:image/png;base64,${screenshotBuffer.toString('base64')}`;
    const data = await extractStructuredData(page);

    return jsonResponse(200, {
      success: true,
      store,
      storeLabel: STORE_MAP[store],
      reportType,
      reportLabel: REPORT_MAP[reportType].label,
      timestamp: new Date().toISOString(),
      screenshot,
      data,
    });
  } catch (error) {
    console.error('[trail-fetch] Unhandled error:', error.message);
    return jsonResponse(500, {
      success: false,
      error: 'Failed to generate Trail report. Please try again.',
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
    }
  }
};
