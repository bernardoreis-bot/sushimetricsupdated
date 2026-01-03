const { chromium } = require('playwright-extra');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Initialize Supabase
let supabase;
try {
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase environment variables');
  }
  
  supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );
} catch (error) {
  console.error('Supabase initialization failed:', error.message);
  // Create a mock supabase client that will fail gracefully
  supabase = {
    from: () => ({
      select: () => Promise.resolve({ data: null, error: new Error('Supabase not initialized') }),
      upsert: () => Promise.resolve({ error: new Error('Supabase not initialized') })
    })
  };
}

// Store active sessions
const sessions = new Map();

// Store to report type mapping
const REPORT_URLS = {
  'complete-tasks': 'https://web.trailapp.com/trail#/',
  'daily-report': 'https://web.trailapp.com/reports#/scores'
};

// Get or create isolated browser context
async function getOrCreateSession(storeId) {
  if (!sessions.has(storeId)) {
    const profilePath = getProfilePath(storeId);
    const browser = await chromium.launch({
      headless: true,  // Run in headless mode for Netlify
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-setuid-sandbox',
        '--disable-webgl',
        '--disable-threaded-animation',
        '--disable-threaded-scrolling',
        '--disable-in-process-stack-traces',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-crash-reporter',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-features=site-per-process',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-notifications',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--use-mock-keychain',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    
    // Add to active sessions
    sessions.set(storeId, {
      browser,
      context: await browser.newContext({
        viewport: { width: 1280, height: 900 },
        ignoreHTTPSErrors: true
      }),
      lastUsed: Date.now()
    });
    
    // Clean up old sessions
    cleanupOldSessions();
  }
  
  return sessions.get(storeId);
}

// Get profile path for store
function getProfilePath(storeId) {
  const profilePath = path.join(os.tmpdir(), `trail-profile-copy-${storeId}`);
  if (!fs.existsSync(profilePath)) {
    fs.mkdirSync(profilePath, { recursive: true });
  }
  return profilePath;
}

// Clean up old sessions
function cleanupOldSessions() {
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  
  for (const [storeId, session] of sessions.entries()) {
    if (now - session.lastUsed > 4 * HOUR) {
      session.browser.close();
      sessions.delete(storeId);
    }
  }
}

// Handle login
async function handleLogin(page, credentials, reportType) {
  try {
    // Set a longer timeout for navigation
    await page.goto(REPORT_URLS[reportType], { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 // 30 seconds
    });
    
    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Check if already logged in
    const isLoggedIn = await page.evaluate(() => {
      return !document.querySelector('input[type="email"], input[name="email"]');
    });
    
    if (isLoggedIn) {
      console.log('Already logged in');
      return true;
    }
    
    console.log('Attempting to log in...');
    
    // Handle login form with more robust selectors
    await page.fill('input[type="email"], input[name="email"]', credentials.email);
    await page.fill('input[type="password"]', credentials.password);
    
    // Click the login button and wait for navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.click('button[type="submit"], button:has-text("Sign In")')
    ]);
    
    // Wait for the page to fully load after login
    await page.waitForLoadState('networkidle');
    
    console.log('Login successful');
    return true;
  } catch (error) {
    console.error('Login failed:', error);
    // Take a screenshot of the error page for debugging
    const errorScreenshot = await page.screenshot({ type: 'png' });
    console.error('Page content at time of error:', await page.content());
    
    // Save the screenshot to a file for debugging
    const fs = require('fs');
    const path = require('path');
    const errorDir = path.join('/tmp', 'trail-errors-copy');
    if (!fs.existsSync(errorDir)) {
      fs.mkdirSync(errorDir, { recursive: true });
    }
    const errorFile = path.join(errorDir, `error-${Date.now()}.png`);
    fs.writeFileSync(errorFile, errorScreenshot);
    console.error(`Error screenshot saved to: ${errorFile}`);
    
    return false;
  }
}

// Take a screenshot of the page
async function takeScreenshot(page, reportType) {
  try {
    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Additional wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Take a full page screenshot
    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 80,
      fullPage: true
    });
    
    return screenshot.toString('base64');
  } catch (error) {
    console.error('Error taking screenshot:', error);
    return null;
  }
}

// Main handler
exports.handler = async function(event, context) {
  console.log('Received request:', JSON.stringify(event.body, null, 2));
  
  try {
    const { action, store, reportType, credentials, takeScreenshot } = JSON.parse(event.body);
    
    if (action === 'login') {
      console.log(`Starting login for ${store} - ${reportType}`);
      const session = await getOrCreateSession(store);
      const page = await session.context.newPage();
      
      try {
        // Set a longer default timeout
        page.setDefaultTimeout(30000); // 30 seconds
        
        // Set user agent to avoid bot detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36');
        
        // Handle login
        const loginSuccess = await handleLogin(page, credentials, reportType);
        
        if (!loginSuccess) {
          throw new Error('Login failed');
        }
        
        // Navigate to the report URL if not already there
        if (!page.url().includes(REPORT_URLS[reportType])) {
          await page.goto(REPORT_URLS[reportType], { 
            waitUntil: 'networkidle',
            timeout: 30000
          });
        }
        
        // Take screenshot if requested
        let screenshot = null;
        let reportUrl = page.url();
        
        if (takeScreenshot) {
          console.log('Taking screenshot...');
          try {
            screenshot = await takeScreenshot(page, reportType);
            if (screenshot) {
              console.log('Screenshot captured successfully');
            } else {
              console.log('Screenshot capture returned null');
            }
          } catch (screenshotError) {
            console.error('Error during screenshot capture:', screenshotError);
          }
        }
        
        // Update last used time
        session.lastUsed = Date.now();
        
        // Close the page
        await page.close();
        
        const response = {
          success: true,
          timestamp: new Date().toISOString(),
          url: reportUrl
        };
        
        if (screenshot) {
          response.screenshot = `data:image/jpeg;base64,${screenshot}`;
        }
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response)
        };
      } catch (error) {
        console.error('Error during page interaction:', error);
        // Try to capture the error state
        try {
          const errorScreenshot = await page.screenshot({ type: 'png' });
          console.error('Page content at time of error:', await page.content());
          
          return {
            statusCode: 500,
            body: JSON.stringify({
              success: false,
              error: error.message,
              screenshot: `data:image/png;base64,${errorScreenshot.toString('base64')}`,
              stack: error.stack
            })
          };
        } catch (screenshotError) {
          console.error('Failed to capture error screenshot:', screenshotError);
          throw error; // Re-throw the original error
        }
      } finally {
        try {
          await page.close();
          console.log('Page closed successfully');
        } catch (closeError) {
          console.error('Error closing page:', closeError);
        }
      }
    }
    
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: 'Invalid action' })
    };
  } catch (error) {
    console.error('Error in trail-session-copy handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
