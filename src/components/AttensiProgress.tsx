import { useRef, useState } from 'react';

const ATTENSI_URL = 'https://admin.attensi.com/yo/dashboard';

export default function AttensiProgress() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);

  const refresh = () => {
    if (iframeRef.current) {
      const src = iframeRef.current.src;
      iframeRef.current.src = src;
    }
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
      setIsFs(true);
    } else {
      await document.exitFullscreen?.();
      setIsFs(false);
    }
  };

  const openNew = () => {
    window.open(ATTENSI_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Attensi Progress</h1>
          <p className="text-gray-500 mt-1">View the Attensi dashboard. Log in once to keep the session.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} className="px-3 py-2 border rounded">Refresh</button>
          <button onClick={toggleFullscreen} className="px-3 py-2 border rounded">{isFs ? 'Exit Fullscreen' : 'Fullscreen'}</button>
          <button onClick={openNew} className="px-3 py-2 border rounded">Open</button>
        </div>
      </div>

      <div ref={containerRef} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <iframe
          ref={iframeRef}
          title="Attensi Dashboard"
          src={ATTENSI_URL}
          width="100%"
          style={{ height: '80vh' }}
          allowFullScreen
        />
      </div>
    </div>
  );
}
