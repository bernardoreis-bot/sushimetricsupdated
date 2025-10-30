import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface DropboxConfigPayload {
  appKey: string;
  appSecret: string;
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const SETTING_KEY = 'dropbox_credentials';

const respond = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

async function fetchConfig() {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('id, setting_value, updated_at')
    .eq('setting_key', SETTING_KEY)
    .maybeSingle();

  if (!data?.setting_value) {
    return { configured: false, appKey: null as string | null, updatedAt: data?.updated_at ?? null };
  }

  try {
    const parsed = JSON.parse(data.setting_value);
    return {
      configured: Boolean(parsed?.appKey && parsed?.appKey.trim()),
      appKey: typeof parsed?.appKey === 'string' ? parsed.appKey : null,
      updatedAt: data.updated_at ?? null,
    };
  } catch {
    return { configured: false, appKey: null as string | null, updatedAt: data?.updated_at ?? null };
  }
}

async function requireAdmin(token: string | null) {
  if (!token) {
    throw new Error('Unauthorized');
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    throw new Error('Unauthorized');
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('user_roles!inner(name)')
    .eq('id', user.id)
    .maybeSingle();

  const roleData = profile?.user_roles as
    | { name?: string }[]
    | { name?: string }
    | null
    | undefined;

  const roleName = Array.isArray(roleData)
    ? roleData[0]?.name
    : roleData?.name;

  if (profileError || roleName !== 'Admin') {
    throw new Error('Admin access required');
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod === 'GET') {
    try {
      const payload = await fetchConfig();
      return respond(200, payload);
    } catch (err) {
      console.error('Failed to load Dropbox config', err);
      return respond(500, { error: 'Failed to load configuration' });
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const token = event.headers?.authorization?.replace('Bearer ', '') ?? null;
      await requireAdmin(token);

      let body: DropboxConfigPayload | null = null;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return respond(400, { error: 'Invalid JSON payload' });
      }

      if (!body?.appKey || !body?.appSecret) {
        return respond(400, { error: 'appKey and appSecret are required' });
      }

      const payload = {
        setting_key: SETTING_KEY,
        setting_value: JSON.stringify({ appKey: body.appKey.trim(), appSecret: body.appSecret.trim() }),
        updated_at: new Date().toISOString(),
      };

      const { data } = await supabaseAdmin
        .from('app_settings')
        .select('id')
        .eq('setting_key', SETTING_KEY)
        .maybeSingle();

      if (data?.id) {
        await supabaseAdmin.from('app_settings').update(payload).eq('id', data.id);
      } else {
        await supabaseAdmin.from('app_settings').insert([payload]);
      }

      return respond(200, { success: true });
    } catch (err: any) {
      const message = err?.message === 'Admin access required' ? err.message : 'Failed to save configuration';
      const status = err?.message === 'Admin access required' || err?.message === 'Unauthorized' ? 403 : 500;
      console.error('Failed to save Dropbox config', err);
      return respond(status, { error: message });
    }
  }

  return respond(405, { error: 'Method not allowed' });
};
