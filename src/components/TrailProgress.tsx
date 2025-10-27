import { useState } from 'react';

type Key = 'allerton' | 'sefton' | 'oldswan';

export default function TrailProgress() {
  const [images, setImages] = useState<Record<Key, string | null>>({ allerton: null, sefton: null, oldswan: null });
  const [loading, setLoading] = useState<Record<Key, boolean>>({ allerton: false, sefton: false, oldswan: false });
  const [error, setError] = useState<Record<Key, string | null>>({ allerton: null, sefton: null, oldswan: null });

  const refresh = async (key: Key) => {
    setLoading({ ...loading, [key]: true });
    setError({ ...error, [key]: null });
    try {
      const res = await fetch(`/.netlify/functions/trail-progress?account=${key}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch');
      setImages({ ...images, [key]: json.image });
    } catch (e: any) {
      setError({ ...error, [key]: e.message || 'Error' });
    } finally {
      setLoading({ ...loading, [key]: false });
    }
  };

  const Panel = ({ id, title, keyId }: { id: string; title: string; keyId: Key }) => (
    <div id={id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm md:text-base">{title}</h3>
        <div className="flex gap-2">
          <button onClick={() => refresh(keyId)} className="px-3 py-1 border rounded text-sm" disabled={loading[keyId]}>{loading[keyId] ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>
      <div className="min-h-[300px] flex items-center justify-center bg-gray-50">
        {images[keyId] ? (
          <img src={images[keyId] as string} alt={`${title} screenshot`} className="max-w-full" />
        ) : (
          <div className="text-gray-500 text-sm">Click Refresh to load a live screenshot</div>
        )}
      </div>
      {error[keyId] && <div className="px-4 py-2 text-sm text-red-600">{error[keyId]}</div>}
    </div>
  );

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Trail Progress</h1>
        <p className="text-gray-500 mt-1">View each account via secure server-side snapshots.</p>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <Panel id="trail-allerton" title="Allerton Road Trail" keyId="allerton" />
        <Panel id="trail-sefton" title="Sefton Park Trail" keyId="sefton" />
        <Panel id="trail-oldswan" title="Old Swan Trail" keyId="oldswan" />
      </div>
    </div>
  );
}
