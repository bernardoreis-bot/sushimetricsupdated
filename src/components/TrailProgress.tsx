import { useRef, useState } from 'react';

const TRAIL_URL = 'https://web.trailapp.com/trail#/';

export default function TrailProgress() {
  const aRef = useRef<HTMLIFrameElement>(null);
  const sRef = useRef<HTMLIFrameElement>(null);
  const oRef = useRef<HTMLIFrameElement>(null);
  const [fsId, setFsId] = useState<string | null>(null);

  const refresh = (ref: React.RefObject<HTMLIFrameElement>) => {
    if (ref.current) {
      const src = ref.current.src;
      ref.current.src = src;
    }
  };

  const toggleFullscreen = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setFsId(id);
    } else {
      document.exitFullscreen?.();
      setFsId(null);
    }
  };

  const Panel = ({ id, title, refEl }: { id: string; title: string; refEl: React.RefObject<HTMLIFrameElement> }) => (
    <div id={id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm md:text-base">{title}</h3>
        <div className="flex gap-2">
          <button onClick={() => refresh(refEl)} className="px-3 py-1 border rounded text-sm">Refresh</button>
          <button onClick={() => toggleFullscreen(id)} className="px-3 py-1 border rounded text-sm">
            {fsId === id ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
          <a href={TRAIL_URL} target="_blank" rel="noreferrer" className="px-3 py-1 border rounded text-sm">Open</a>
        </div>
      </div>
      <iframe
        ref={refEl}
        title={title}
        src={TRAIL_URL}
        width="100%"
        height="600"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        className="flex-1"
      />
    </div>
  );

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Trail Progress</h1>
        <p className="text-gray-500 mt-1">View three Trail accounts side-by-side.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <Panel id="trail-allerton" title="Allerton Road Trail" refEl={aRef} />
        <Panel id="trail-sefton" title="Sefton Park Trail" refEl={sRef} />
        <Panel id="trail-oldswan" title="Old Swan Trail" refEl={oRef} />
      </div>
    </div>
  );
}
