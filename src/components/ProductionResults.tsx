import { CheckCircle, AlertCircle } from 'lucide-react';

interface ProductionResultsProps {
  extractedText: string;
  itemCount: number;
}

export default function ProductionResults({ extractedText, itemCount }: ProductionResultsProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-8">
      <div className="flex items-center gap-3 mb-4">
        <CheckCircle className="w-6 h-6 text-green-600" />
        <h2 className="text-2xl font-bold text-gray-800">OCR Results</h2>
      </div>
      
      <div className="mb-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-lg font-semibold text-green-800">
            Extracted {itemCount} items from your production plan
          </p>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
        <p className="text-sm font-semibold text-gray-700 mb-2">Extracted Text:</p>
        <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">{extractedText}</pre>
      </div>
    </div>
  );
}
