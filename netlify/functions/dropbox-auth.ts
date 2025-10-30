import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const DROPBOX_TOKEN_URL = 'https://api.dropbox.com/oauth2/token';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

const SETTINGS_KEY = 'dropbox_credentials';

const getStoredCredentials = async () => {
  if (!supabaseAdmin) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', SETTINGS_KEY)
    .maybeSingle();

  if (error || !data?.setting_value) {
    return null;
  }

  try {
    const parsed = JSON.parse(data.setting_value);
    if (parsed?.appKey && parsed?.appSecret) {
      return {
        clientId: String(parsed.appKey),
        clientSecret: String(parsed.appSecret),
      };
    }
  } catch (err) {
    console.warn('Failed to parse stored Dropbox credentials', err);
  }

  return null;
};

const getCredentials = async () => {
  const clientId = process.env.DROPBOX_APP_KEY;
  const clientSecret = process.env.DROPBOX_APP_SECRET;

  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }

  const stored = await getStoredCredentials();
  if (stored) {
    return stored;
  }

  throw new Error('Dropbox credentials are not configured.');
};

const respond = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  },
  body: JSON.stringify(body),
});

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  let payload: any;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON payload' });
  }

  const { grant_type, code, refresh_token, redirect_uri } = payload;

  if (!grant_type) {
    return respond(400, { error: 'grant_type is required' });
  }

  let form = new URLSearchParams();
  form.append('grant_type', grant_type);

  if (grant_type === 'authorization_code') {
    if (!code) {
      return respond(400, { error: 'authorization_code grant requires code' });
    }
    if (!redirect_uri) {
      return respond(400, { error: 'authorization_code grant requires redirect_uri' });
    }
    form.append('code', code);
    form.append('redirect_uri', redirect_uri);
  } else if (grant_type === 'refresh_token') {
    if (!refresh_token) {
      return respond(400, { error: 'refresh_token grant requires refresh_token' });
    }
    form.append('refresh_token', refresh_token);
  } else {
    return respond(400, { error: `Unsupported grant_type: ${grant_type}` });
  }

  let creds;
  try {
    creds = await getCredentials();
  } catch (err: any) {
    return respond(500, { error: err.message || 'Missing Dropbox credentials' });
  }

  const authHeader = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');

  const response = await fetch(DROPBOX_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${authHeader}`,
    },
    body: form.toString(),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error_description || data.error_summary || data.error || 'Dropbox token exchange failed';
    return respond(response.status, { error: message });
  }

  return respond(200, data);
};
