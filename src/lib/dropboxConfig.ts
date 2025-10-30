const LOCAL_STORAGE_KEY = 'dropbox_config';

interface DropboxConfig {
  appKey: string;
  appSecret?: string;
  updatedAt: string | null;
  source: 'local' | 'server';
}

export interface DropboxConfigState {
  loading: boolean;
  config: DropboxConfig | null;
  error: string | null;
}

// Get config from local storage
function getLocalConfig(): DropboxConfig | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!saved) return null;
    
    const parsed = JSON.parse(saved);
    if (!parsed?.appKey) return null;
    
    return {
      appKey: parsed.appKey,
      appSecret: parsed.appSecret,
      updatedAt: parsed.updatedAt || null,
      source: 'local' as const
    };
  } catch (err) {
    console.warn('Failed to load Dropbox config from local storage', err);
    return null;
  }
}

// Save config to local storage
function saveLocalConfig(config: Omit<DropboxConfig, 'source' | 'updatedAt'>): void {
  if (typeof window === 'undefined') return;
  
  try {
    const toSave = {
      ...config,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(toSave));
  } catch (err) {
    console.error('Failed to save Dropbox config to local storage', err);
    throw new Error('Failed to save configuration');
  }
}

export async function saveDropboxConfig(
  appKey: string,
  appSecret?: string
): Promise<{ source: 'local' | 'server' }> {
  const config = {
    appKey: appKey.trim(),
    appSecret: appSecret?.trim(),
  };

  // Always save to local storage
  saveLocalConfig(config);
  
  // Try to save to server if available
  try {
    const { supabase, isSupabaseConfigured } = await import('./supabase');
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          {
            setting_key: 'dropbox_credentials',
            setting_value: JSON.stringify({
              ...config,
              updatedAt: new Date().toISOString(),
            }),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'setting_key' }
        )
        .select();

      if (error) throw error;
      return { source: 'server' };
    }
  } catch (err) {
    console.warn('Failed to save Dropbox config to server, using local storage', err);
  }
  
  return { source: 'local' };
}

export async function fetchDropboxConfig(): Promise<DropboxConfig | null> {
  // First try local storage
  const localConfig = getLocalConfig();
  if (localConfig) {
    return localConfig;
  }
  
  // Fall back to server if available
  try {
    const { supabase, isSupabaseConfigured } = await import('./supabase');
    if (!isSupabaseConfigured) return null;

    const { data, error } = await supabase
      .from('app_settings')
      .select('setting_value, updated_at')
      .eq('setting_key', 'dropbox_credentials')
      .maybeSingle();

    if (error) throw error;
    if (!data?.setting_value) return null;

    const parsed = JSON.parse(data.setting_value);
    if (!parsed?.appKey) return null;
    
    return {
      appKey: parsed.appKey,
      updatedAt: data.updated_at ?? null,
      source: 'server' as const
    };
  } catch (err) {
    console.warn('Failed to fetch Dropbox config from server', err);
    return null;
  }
}

export async function loadDropboxConfig(): Promise<DropboxConfig | null> {
  try {
    return await fetchDropboxConfig();
  } catch (error) {
    console.error('Error loading Dropbox configuration:', error);
    return getLocalConfig(); // Fall back to local storage
  }
  // If Supabase fails or returns no config, try Netlify function
  try {
    const response = await fetch('/.netlify/functions/dropbox-config', {
      headers: {
        'Accept': 'application/json',
      },
    });

    // Only process as JSON if the content type is correct
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (response.ok && data?.appKey) {
        return {
          appKey: data.appKey,
          updatedAt: data.updatedAt || null,
        };
      }
      throw new Error(data?.error || 'Invalid configuration from server');
    }
    
    // If we get here, the response wasn't JSON or didn't contain expected data
    if (response.ok) {
      throw new Error('Unexpected response format from server');
    } else {
      throw new Error(`Server returned ${response.status} status`);
    }
  } catch (netlifyErr) {
    console.warn('Failed to load Dropbox config from Netlify function:', netlifyErr);
    
    // If we have environment variables, use them as a last resort
    const envAppKey = import.meta.env.VITE_DROPBOX_APP_KEY || process.env.VITE_DROPBOX_APP_KEY;
    if (envAppKey) {
      return {
        appKey: envAppKey,
        updatedAt: new Date().toISOString(),
      };
    }
    
    // If we get here, all methods failed
    throw new Error('Dropbox is not configured. Please set up the integration in the settings panel.');
  }
}
