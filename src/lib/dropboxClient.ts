const DEFAULT_APP_KEY = 'your-dropbox-app-key';
const STATE_STORAGE_KEY = 'dropbox_auth_state';
const ACCESS_TOKEN_KEY = 'dropbox_access_token';
const REFRESH_TOKEN_KEY = 'dropbox_refresh_token';
const TOKEN_EXPIRY_KEY = 'dropbox_token_expiry';

const getDropboxAppKeyFromEnv = (): string | null => {
  // First try Vite's import.meta.env (browser)
  try {
    if (import.meta.env?.VITE_DROPBOX_APP_KEY) {
      const key = String(import.meta.env.VITE_DROPBOX_APP_KEY).trim();
      if (key && key !== DEFAULT_APP_KEY) {
        return key;
      }
    }
  } catch (err) {
    console.warn('Failed to read Vite environment variables:', err);
  }

  // Fallback to process.env (Node.js/SSR)
  if (typeof process !== 'undefined' && process.env) {
    const key = (process.env.VITE_DROPBOX_APP_KEY || process.env.DROPBOX_APP_KEY || '').trim();
    if (key && key !== DEFAULT_APP_KEY) {
      return key;
    }
  }

  return null;
};

export const resolveEnvDropboxAppKey = (): string | null => getDropboxAppKeyFromEnv();

export const isDropboxConfigured = (): boolean => Boolean(getDropboxAppKeyFromEnv());

const getRedirectUri = (): string => {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/dropbox-auth.html`;
};

const generateStateToken = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
};

export interface DropboxBaseEntry {
  '.tag': 'file' | 'folder';
  id: string;
  name: string;
  path_lower: string;
  path_display: string;
}

export interface DropboxFileMetadata extends DropboxBaseEntry {
  '.tag': 'file';
  size: number;
  server_modified: string;
  client_modified: string;
}

export interface DropboxFolderMetadata extends DropboxBaseEntry {
  '.tag': 'folder';
}

export type DropboxEntry = DropboxFileMetadata | DropboxFolderMetadata;

interface DropboxAuthPayload {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  uid?: string;
  account_id?: string;
}

export class DropboxClient {
  private appKey: string | null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(initialAppKey?: string | null) {
    this.appKey = this.normaliseAppKey(initialAppKey ?? getDropboxAppKeyFromEnv());
    this.restoreSessionFromStorage();
  }

  private normaliseAppKey(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed === DEFAULT_APP_KEY) {
      return null;
    }
    return trimmed;
  }

  public setAppKey(value: string | null) {
    this.appKey = this.normaliseAppKey(value);
    if (!this.appKey) {
      // Clear any existing session if configuration has been removed
      this.clearSession();
    }
  }

  public hasValidAppKey(): boolean {
    return Boolean(this.appKey);
  }

  private restoreSessionFromStorage() {
    if (typeof window === 'undefined') return;

    this.accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    this.refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);

    const storedExpiry = window.localStorage.getItem(TOKEN_EXPIRY_KEY);
    this.tokenExpiry = storedExpiry ? parseInt(storedExpiry, 10) : null;
  }

  public reloadSession() {
    this.restoreSessionFromStorage();
  }

  private persistSession() {
    if (typeof window === 'undefined') return;

    if (this.accessToken) {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, this.accessToken);
    } else {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    }

    if (this.refreshToken) {
      window.localStorage.setItem(REFRESH_TOKEN_KEY, this.refreshToken);
    } else {
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    }

    if (this.tokenExpiry) {
      window.localStorage.setItem(TOKEN_EXPIRY_KEY, this.tokenExpiry.toString());
    } else {
      window.localStorage.removeItem(TOKEN_EXPIRY_KEY);
    }
  }

  private clearSession() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.persistSession();
  }

  private setTokens(payload: DropboxAuthPayload) {
    this.accessToken = payload.access_token;
    if (payload.refresh_token) {
      this.refreshToken = payload.refresh_token;
    }

    if (payload.expires_in) {
      const expiryBufferSeconds = 60; // refresh one minute before expiry
      this.tokenExpiry = Date.now() + (payload.expires_in - expiryBufferSeconds) * 1000;
    } else {
      this.tokenExpiry = null;
    }

    this.persistSession();
  }

  private async ensureAccessToken(): Promise<string> {
    if (!this.accessToken) {
      throw new Error('Dropbox session missing. Please connect again.');
    }

    if (this.tokenExpiry && Date.now() > this.tokenExpiry) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      } else {
        this.clearSession();
        throw new Error('Dropbox session expired. Please connect again.');
      }
    }

    return this.accessToken;
  }

  private async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('Missing refresh token');
    }

    try {
      const response = await fetch('/.netlify/functions/dropbox-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const payload = (await response.json()) as DropboxAuthPayload;
      this.setTokens(payload);
    } catch (err) {
      console.warn('Token refresh failed:', err);
      // Clear the session so user can re-authenticate
      this.clearSession();
      throw new Error('Dropbox session expired. Please reconnect your Dropbox account.');
    }
  }

  public isAuthenticated(): boolean {
    return Boolean(this.accessToken && (!this.tokenExpiry || Date.now() < this.tokenExpiry));
  }

  public disconnect() {
    this.clearSession();
  }

  public authenticate(): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('Dropbox authentication is only available in the browser.'));
    }

    if (!this.hasValidAppKey()) {
      return Promise.reject(new Error('Dropbox integration is not configured. Please contact your administrator.'));
    }

    const redirectUri = getRedirectUri();
    if (!redirectUri) {
      return Promise.reject(new Error('Unable to determine redirect URI.'));
    }

    const appKey = this.appKey as string;
    const state = generateStateToken();
    window.localStorage.setItem(STATE_STORAGE_KEY, state);

    const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
    authUrl.searchParams.set('client_id', appKey);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('token_access_type', 'offline');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', 'files.metadata.read files.content.read');

    const popup = window.open(authUrl.toString(), 'dropbox-auth', 'width=600,height=720');
    if (!popup) {
      return Promise.reject(new Error('Popup blocked. Please allow popups to connect Dropbox.'));
    }

    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        if (closeInterval) {
          window.clearInterval(closeInterval);
        }
      };

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) {
          return;
        }

        const data = event.data;
        if (!data || typeof data !== 'object') {
          return;
        }

        if (data.type === 'dropbox-auth-success') {
          cleanup();
          this.reloadSession();
          resolve();
        } else if (data.type === 'dropbox-auth-error') {
          cleanup();
          const message = typeof data.message === 'string' ? data.message : 'Dropbox authentication failed.';
          reject(new Error(message));
        }
      };

      window.addEventListener('message', handleMessage);

      const closeInterval = window.setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new Error('Dropbox authentication window was closed before completing.'));
        }
      }, 500);
    });
  }

  private async apiPost<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const token = await this.ensureAccessToken();

    const response = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      this.clearSession();
      throw new Error('Dropbox session expired. Please reconnect.');
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message = errorBody.error_summary || errorBody.error || 'Dropbox API request failed.';
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  }

  public async listPDFFiles(): Promise<DropboxFileMetadata[]> {
    const files: DropboxFileMetadata[] = [];
    let cursor: string | null = null;

    interface ListFolderResponse {
      cursor: string;
      entries: DropboxEntry[];
      has_more: boolean;
    }

    do {
      const response: ListFolderResponse = cursor
        ? await this.apiPost<ListFolderResponse>('files/list_folder/continue', {
            cursor,
          })
        : await this.apiPost<ListFolderResponse>('files/list_folder', {
            path: '',
            recursive: false,
            include_non_downloadable_files: false,
          });

      const pdfEntries = response.entries.filter(
        (entry: DropboxEntry): entry is DropboxFileMetadata =>
          entry['.tag'] === 'file' && entry.name.toLowerCase().endsWith('.pdf')
      );

      files.push(...pdfEntries);
      cursor = response.has_more ? response.cursor : null;
    } while (cursor);

    return files;
  }

  public async downloadFile(path: string): Promise<Blob> {
    const token = await this.ensureAccessToken();

    const response = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path }),
      },
    });

    if (response.status === 401) {
      this.clearSession();
      throw new Error('Dropbox session expired. Please reconnect.');
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || 'Failed to download file from Dropbox.');
    }

    return response.blob();
  }
}
