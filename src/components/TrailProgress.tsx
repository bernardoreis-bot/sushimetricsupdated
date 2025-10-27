import { useState } from 'react';

const TRAIL_URL = 'https://web.trailapp.com/trail#/';

export default function TrailProgress() {
  const [winA, setWinA] = useState<Window | null>(null);
  const [winS, setWinS] = useState<Window | null>(null);
  const [winO, setWinO] = useState<Window | null>(null);

  const openWin = (key: 'A' | 'S' | 'O') => {
    const features = 'noopener,noreferrer,width=1280,height=800';
    if (key === 'A' && winA && !winA.closed) return winA.focus();
    if (key === 'S' && winS && !winS.closed) return winS.focus();
    if (key === 'O' && winO && !winO.closed) return winO.focus();
    const w = window.open(TRAIL_URL, `trail-${key}`, features);
    if (key === 'A') setWinA(w);
    if (key === 'S') setWinS(w);
    if (key === 'O') setWinO(w);
  };

  const refreshWin = (w: Window | null) => {
    try {
      if (w && !w.closed) {
        w.location.href = TRAIL_URL; // force reload without reading cross-origin state
        w.focus();
      }
    } catch {}
  };

  const closeWin = (w: Window | null, set: (v: Window | null) => void) => {
    try { w?.close(); } catch {}
    set(null);
  };

  const Panel = ({ id, title, keyId, win, setWin }: { id: string; title: string; keyId: 'A' | 'S' | 'O'; win: Window | null; setWin: (w: Window | null) => void }) => (
    <div id={id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm md:text-base">{title}</h3>
        <div className="flex gap-2">
          <button onClick={() => openWin(keyId)} className="px-3 py-1 border rounded text-sm">Open / Focus</button>
          <button onClick={() => refreshWin(win)} className="px-3 py-1 border rounded text-sm">Refresh</button>
          <button onClick={() => closeWin(win, setWin)} className="px-3 py-1 border rounded text-sm">Close</button>
        </div>
      </div>
      <div className="p-4 text-sm text-gray-600">
        Trail does not allow embedding in iframes. Use the buttons above to open each account in its own window and keep sessions separate.
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Trail Progress</h1>
        <p className="text-gray-500 mt-1">Open three Trail accounts in separate windows and switch between them quickly.</p>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <Panel id="trail-allerton" title="Allerton Road Trail" keyId="A" win={winA} setWin={setWinA} />
        <Panel id="trail-sefton" title="Sefton Park Trail" keyId="S" win={winS} setWin={setWinS} />
        <Panel id="trail-oldswan" title="Old Swan Trail" keyId="O" win={winO} setWin={setWinO} />
      </div>
    </div>
  );
}
