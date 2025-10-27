import { contextBridge, ipcRenderer } from 'electron';

type WinKey = 'trail-allerton' | 'trail-sefton' | 'trail-oldswan' | 'attensi';

declare global {
  interface Window { desktop: any }
}

contextBridge.exposeInMainWorld('desktop', {
  openWindow: (key: WinKey) => ipcRenderer.invoke('open-window', key),
  refreshWindow: (key: WinKey) => ipcRenderer.invoke('refresh-window', key),
  closeWindow: (key: WinKey) => ipcRenderer.invoke('close-window', key),
  focusWindow: (key: WinKey) => ipcRenderer.invoke('focus-window', key),
  logoutWindow: (key: WinKey) => ipcRenderer.invoke('logout-window', key),
  getService: () => ipcRenderer.invoke('get-service'),
  getCredential: (service: string) => ipcRenderer.invoke('get-credential', service),
  setCredential: (service: string, email: string, password: string) => ipcRenderer.invoke('set-credential', service, email, password),
});

// Try auto-login when running inside one of the target windows
(async () => {
  try {
    const service = await ipcRenderer.invoke('get-service');
    if (!service) return;
    const cred = await ipcRenderer.invoke('get-credential', service);
    if (!cred) return;
    const { email, password } = cred as { email: string; password: string };

    const tryFill = () => {
      try {
        const host = location.hostname;
        const bySel = (sel: string) => document.querySelector<HTMLInputElement>(sel);
        const typeSel = (t: string) => document.querySelector<HTMLInputElement>(`input[type="${t}"]`);
        let emailEl: HTMLInputElement | null = null;
        let passEl: HTMLInputElement | null = null;
        let submitBtn: HTMLElement | null = null;

        // Heuristics for Trail / Attensi
        emailEl = bySel('input[name="email"], input#email, input[name="username"], input#username') || typeSel('email');
        passEl = bySel('input[name="password"], input#password') || typeSel('password');
        submitBtn = (document.querySelector('button[type="submit"]') as HTMLElement) || (document.querySelector('button') as HTMLElement);

        if (emailEl && passEl) {
          emailEl.focus(); emailEl.value = email; emailEl.dispatchEvent(new Event('input', { bubbles: true }));
          passEl.focus(); passEl.value = password; passEl.dispatchEvent(new Event('input', { bubbles: true }));
          if (submitBtn) (submitBtn as HTMLButtonElement).click?.();
          else {
            const form = emailEl.form || passEl.form || document.querySelector('form');
            (form as HTMLFormElement)?.submit?.();
          }
        }
      } catch {}
    };

    // On initial load + any navigation changes
    window.addEventListener('DOMContentLoaded', () => setTimeout(tryFill, 500));
    const obs = new MutationObserver(() => setTimeout(tryFill, 500));
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch {}
})();
