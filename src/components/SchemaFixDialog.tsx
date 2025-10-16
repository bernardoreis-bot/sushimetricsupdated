import { useState } from 'react';
import { AlertTriangle, XCircle, CheckCircle, Code, ExternalLink } from 'lucide-react';

interface SchemaFixDialogProps {
  missingColumns: string[];
  existingColumns: string[];
  tableName: string;
  onClose: () => void;
}

export default function SchemaFixDialog({ missingColumns, existingColumns, tableName, onClose }: SchemaFixDialogProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'sql' | 'guide'>('info');

  const generateAlterSQL = () => {
    const alterStatements = missingColumns.map(col => {
      let sqlType = 'text';
      let defaultValue = '';

      if (col === 'transaction_type') {
        sqlType = 'text';
        defaultValue = " DEFAULT 'invoice'";
      } else if (col === 'site_id' || col === 'supplier_id') {
        sqlType = 'uuid';
      } else if (col.includes('date')) {
        sqlType = 'timestamptz';
        defaultValue = ' DEFAULT now()';
      } else if (col.includes('amount') || col.includes('price')) {
        sqlType = 'numeric(10,2)';
        defaultValue = ' DEFAULT 0';
      }

      return `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${col} ${sqlType}${defaultValue};`;
    });

    return alterStatements.join('\n');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-red-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">Database Schema Issue Detected</h2>
                <p className="text-red-100 mt-1">Required columns are missing from the {tableName} table</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-red-700 rounded-lg transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'info'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Problem Details
            </button>
            <button
              onClick={() => setActiveTab('sql')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'sql'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              SQL Fix
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === 'guide'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Step-by-Step Guide
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'info' && (
            <div className="space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                  <XCircle className="w-5 h-5" />
                  Missing Columns ({missingColumns.length})
                </h3>
                <ul className="space-y-1">
                  {missingColumns.map(col => (
                    <li key={col} className="text-red-800 font-mono text-sm">• {col}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Existing Columns ({existingColumns.length})
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {existingColumns.slice(0, 10).map(col => (
                    <div key={col} className="text-green-800 font-mono text-sm">• {col}</div>
                  ))}
                  {existingColumns.length > 10 && (
                    <div className="text-green-700 text-sm italic">...and {existingColumns.length - 10} more</div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Why This Matters</h3>
                <p className="text-blue-800 text-sm">
                  The Order Predictions tool requires specific columns in the transactions table to analyze historical data.
                  Without these columns, the system cannot filter transactions by type, link them to sites/suppliers, or generate accurate predictions.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800">
                  <strong>Important:</strong> Running SQL commands directly modifies your database structure.
                  Always back up your data before making schema changes. Consider testing in a development environment first.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Code className="w-5 h-5" />
                    SQL Migration Script
                  </h3>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generateAlterSQL());
                      alert('SQL copied to clipboard!');
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Copy to Clipboard
                  </button>
                </div>

                <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-green-400 text-sm font-mono whitespace-pre">
                    {generateAlterSQL()}
                  </pre>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">How to Run This SQL:</h4>
                <ol className="space-y-2 text-sm text-blue-800">
                  <li className="flex items-start gap-2">
                    <span className="font-semibold">1.</span>
                    <span>Go to your Supabase Dashboard → SQL Editor</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold">2.</span>
                    <span>Copy the SQL above and paste it into the editor</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold">3.</span>
                    <span>Click "Run" to execute the migration</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold">4.</span>
                    <span>Refresh this page to revalidate the schema</span>
                  </li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                    1
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-2">Access Supabase Dashboard</h4>
                    <p className="text-sm text-gray-700 mb-2">
                      Navigate to your Supabase project dashboard at <code className="bg-gray-100 px-2 py-1 rounded">https://supabase.com/dashboard</code>
                    </p>
                    <a
                      href="https://supabase.com/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                      Open Supabase Dashboard
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                    2
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-2">Open SQL Editor</h4>
                    <p className="text-sm text-gray-700">
                      From the left sidebar, click on "SQL Editor" to open the query interface.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                    3
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-2">Run the Migration</h4>
                    <p className="text-sm text-gray-700">
                      Switch to the "SQL Fix" tab above, copy the generated SQL, paste it into the SQL Editor, and click "Run".
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                    4
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-2">Verify and Retry</h4>
                    <p className="text-sm text-gray-700">
                      Close this dialog and click "Generate Prediction" again. The system will automatically revalidate the schema.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="font-semibold text-amber-900 mb-2">Alternative: Contact Your Administrator</h4>
                <p className="text-sm text-amber-800">
                  If you don't have database access, share the SQL from the "SQL Fix" tab with your database administrator
                  or technical team to implement the required schema changes.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
