import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Loader,
  Cloud,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Check,
  FileText
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  DropboxClient,
  DropboxFileMetadata,
  resolveEnvDropboxAppKey
} from '../lib/dropboxClient';
import { loadDropboxConfig } from '../lib/dropboxConfig';
import {
  processInvoiceWithLineItems,
  saveTransactionWithLineItems,
  ProcessedInvoice
} from '../utils/invoiceProcessor';

interface DropboxBulkInvoiceCreationProps {
  onClose: () => void;
  onSuccess: () => void;
  sites: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; code: string }>;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export default function DropboxBulkInvoiceCreation({
  onClose,
  onSuccess,
  sites,
  suppliers,
  categories
}: DropboxBulkInvoiceCreationProps) {
  const [dropboxClient] = useState<DropboxClient>(() => new DropboxClient());
  const [configured, setConfigured] = useState<boolean>(false);
  const [configLoading, setConfigLoading] = useState<boolean>(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [authenticating, setAuthenticating] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [files, setFiles] = useState<DropboxFileMetadata[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<boolean>(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const [invoices, setInvoices] = useState<ProcessedInvoice[]>([]);
  const [savedInvoices, setSavedInvoices] = useState<Set<number>>(new Set());

  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const initializeClient = async () => {
      setConfigLoading(true);
      setConfigError(null);

      try {
        // First try to load from config
        const config = await loadDropboxConfig();
        
        if (!isActive) return;

        if (config?.appKey) {
          dropboxClient.setAppKey(config.appKey);
          setConfigured(true);
          setAuthenticated(dropboxClient.isAuthenticated());
          return;
        }

        // Fallback to environment variable
        const envKey = resolveEnvDropboxAppKey();
        if (envKey) {
          dropboxClient.setAppKey(envKey);
          setConfigured(true);
          setAuthenticated(dropboxClient.isAuthenticated());
          return;
        }

        // No configuration found
        throw new Error('No Dropbox configuration found');
      } catch (err) {
        if (!isActive) return;
        
        const message = err instanceof Error ? err.message : 'Failed to load Dropbox configuration';
        console.error('Dropbox config error:', message);
        setConfigError(message);
        setConfigured(false);
      } finally {
        if (isActive) {
          setConfigLoading(false);
        }
      }
    };

    initializeClient();

    return () => {
      isActive = false;
    };
  }, [dropboxClient]);

  useEffect(() => {
    if (!configLoading && configured && authenticated) {
      loadFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, authenticated, configLoading]);

  const loadFiles = async () => {
    setLoadingFiles(true);
    setFilesError(null);

    try {
      const results = await dropboxClient.listPDFFiles();
      setFiles(results);
      setAuthenticated(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load files from Dropbox.';
      setFilesError(message);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleAuthenticate = async () => {
    setAuthenticating(true);
    setAuthError(null);

    try {
      await dropboxClient.authenticate();
      setAuthenticated(true);
      await loadFiles();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Dropbox authentication failed.';
      console.error('Dropbox auth error:', message);

      // Provide more helpful error messages
      let displayMessage = message;
      if (message.includes('not configured')) {
        displayMessage = 'Dropbox is not configured. Please go to Settings > Dropbox Integration and configure your App Key.';
      } else if (message.includes('Popup blocked')) {
        displayMessage = 'Popup was blocked by your browser. Please allow popups for this site and try again.';
      } else if (message.includes('Server authentication failed')) {
        displayMessage = 'Authentication server unavailable. Please ensure Netlify functions are deployed, or configure Dropbox credentials locally in settings.';
      }

      setAuthError(displayMessage);
    } finally {
      setAuthenticating(false);
    }
  };

  const handleDisconnect = () => {
    dropboxClient.disconnect();
    setAuthenticated(false);
    setFiles([]);
    setSelectedFiles(new Set());
    setInvoices([]);
    setSavedInvoices(new Set());
  };

  const toggleSelectFile = (path: string) => {
    const updated = new Set(selectedFiles);
    if (updated.has(path)) {
      updated.delete(path);
    } else {
      updated.add(path);
    }
    setSelectedFiles(updated);
  };

  const resetImportState = () => {
    setInvoices([]);
    setSavedInvoices(new Set());
    setImportErrors([]);
    setSaveError(null);
  };

  const handleImportSelected = async () => {
    if (selectedFiles.size === 0) {
      setImportErrors(['Select at least one PDF file to import.']);
      return;
    }

    setProcessing(true);
    setImportErrors([]);
    setSaveError(null);

    try {
      const { data: parsingRules, error: parsingError } = await supabase
        .from('invoice_parsing_rules')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (parsingError) {
        throw parsingError;
      }

      const processedInvoices: ProcessedInvoice[] = [];
      const errors: string[] = [];

      const fileMap = new Map(files.map((file) => [file.path_lower, file]));

      for (const path of Array.from(selectedFiles)) {
        const metadata = fileMap.get(path);
        if (!metadata) continue;

        try {
          const blob = await dropboxClient.downloadFile(metadata.path_lower);
          const file = new File([blob], metadata.name, { type: 'application/pdf' });
          const processed = await processInvoiceWithLineItems(file, parsingRules || []);
          processedInvoices.push(processed);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unable to process file.';
          errors.push(`${metadata.name}: ${message}`);
        }
      }

      if (processedInvoices.length > 0) {
        setInvoices(processedInvoices);
        setSavedInvoices(new Set());
        setSelectedFiles(new Set());
      } else {
        setInvoices([]);
      }

      setImportErrors(errors);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error while importing files.';
      setImportErrors([message]);
    } finally {
      setProcessing(false);
    }
  };

  const updateInvoiceField = (index: number, field: string, value: string) => {
    const updated = [...invoices];
    updated[index].formData = {
      ...updated[index].formData,
      [field]: value
    };
    setInvoices(updated);
  };

  const handleSaveInvoice = async (index: number) => {
    const invoice = invoices[index];

    if (!invoice.formData.transaction_date || !invoice.formData.site_id || !invoice.formData.amount) {
      setSaveError('Please fill in all required fields (Date, Site, Amount).');
      return;
    }

    const transactionData = {
      transaction_date: invoice.formData.transaction_date,
      site_id: invoice.formData.site_id,
      category_id: invoice.formData.category_id || null,
      supplier_id: invoice.formData.supplier_id || null,
      invoice_number: invoice.formData.invoice_number || null,
      invoice_reference: invoice.formData.invoice_reference || null,
      amount: parseFloat(invoice.formData.amount),
      notes: invoice.formData.notes || null
    };

    const result = await saveTransactionWithLineItems(transactionData, invoice.lineItems);

    if (result.success) {
      const newSaved = new Set(savedInvoices);
      newSaved.add(index);
      setSavedInvoices(newSaved);
      setSaveError(null);
    } else {
      setSaveError(result.error || 'Failed to save transaction.');
    }
  };

  const handleSaveAll = async () => {
    if (invoices.length === 0) return;

    setProcessing(true);
    setSaveError(null);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < invoices.length; i++) {
      if (savedInvoices.has(i)) continue;

      const invoice = invoices[i];

      if (!invoice.formData.transaction_date || !invoice.formData.site_id || !invoice.formData.amount) {
        failCount++;
        continue;
      }

      const transactionData = {
        transaction_date: invoice.formData.transaction_date,
        site_id: invoice.formData.site_id,
        category_id: invoice.formData.category_id || null,
        supplier_id: invoice.formData.supplier_id || null,
        invoice_number: invoice.formData.invoice_number || null,
        invoice_reference: invoice.formData.invoice_reference || null,
        amount: parseFloat(invoice.formData.amount),
        notes: invoice.formData.notes || null
      };

      const result = await saveTransactionWithLineItems(transactionData, invoice.lineItems);

      if (result.success) {
        const newSaved = new Set(savedInvoices);
        newSaved.add(i);
        setSavedInvoices(newSaved);
        successCount++;
      } else {
        failCount++;
      }
    }

    setProcessing(false);

    if (failCount > 0) {
      setSaveError(`Saved ${successCount} transactions. ${failCount} failed (check required fields).`);
    } else {
      setSaveError(null);
      onClose();
    }

    onSuccess();
  };

  const handleBackToSelection = () => {
    resetImportState();
  };

  const renderFileSelection = () => {
    if (configLoading) {
      return (
        <div className="text-center py-12">
          <Loader className="w-12 h-12 text-gray-300 animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Preparing Dropbox integration…</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            Loading configuration and checking your Dropbox connection.
          </p>
        </div>
      );
    }

    if (!configured) {
      return (
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Dropbox Not Configured</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
            The Dropbox integration isn&apos;t configured yet. You can set up Dropbox in two ways:
          </p>
          <div className="text-left max-w-md mx-auto mb-4 space-y-2 text-sm">
            <div>
              <strong>Option 1: Local Configuration</strong>
              <p className="text-gray-600">Go to Settings &gt; Dropbox Integration and enter your Dropbox App Key directly in your browser.</p>
            </div>
            <div>
              <strong>Option 2: Environment Variables</strong>
              <p className="text-gray-600">Set the <code className="bg-gray-100 px-1 rounded">VITE_DROPBOX_APP_KEY</code> environment variable.</p>
            </div>
          </div>
          {configError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm max-w-md mx-auto">
              {configError}
            </div>
          )}
        </div>
      );
    }

    if (!authenticated) {
      return (
        <div className="text-center py-12">
          <Cloud className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Connect to Dropbox</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto mb-6">
            Connect your Dropbox account to access invoice PDFs stored in the dedicated Sushi Metrics folder.
          </p>
          <button
            onClick={handleAuthenticate}
            disabled={authenticating}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {authenticating ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Connecting…
              </>
            ) : (
              <>
                <Cloud className="w-5 h-5" />
                Connect Dropbox
              </>
            )}
          </button>

          {authError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm max-w-md mx-auto">
              {authError}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <Cloud className="w-5 h-5 text-blue-500" />
            <span>Connected to Dropbox</span>
            <button
              onClick={handleDisconnect}
              type="button"
              className="text-red-600 hover:text-red-700 font-medium"
            >
              Disconnect
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadFiles}
              disabled={loadingFiles}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loadingFiles ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleImportSelected}
              disabled={processing || selectedFiles.size === 0 || loadingFiles}
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {processing ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Import Selected ({selectedFiles.size})
                </>
              )}
            </button>
          </div>
        </div>

        {filesError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {filesError}
          </div>
        )}

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between text-sm text-gray-600">
            <span>Select the PDF invoices you want to process</span>
            <span>{files.length} file(s) found</span>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-200">
            {loadingFiles ? (
              <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
                <Loader className="w-5 h-5 animate-spin mr-2" /> Loading files…
              </div>
            ) : files.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">
                No PDF files found in your Dropbox folder.
              </div>
            ) : (
              files.map((file) => (
                <label
                  key={file.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(file.path_lower)}
                    onChange={() => toggleSelectFile(file.path_lower)}
                    className="w-4 h-4 text-orange-500 border-gray-300 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{file.name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {formatFileSize(file.size)} · Updated {new Date(file.server_modified).toLocaleString()}
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {importErrors.length > 0 && (
          <div className="space-y-2">
            {importErrors.map((error, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5" />
                <span>{error}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderInvoiceEditor = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Review Imported Invoices</h3>
          <p className="text-sm text-gray-500">Validate the extracted data before saving.</p>
        </div>
        <button
          onClick={handleBackToSelection}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Import more files
        </button>
      </div>

      {importErrors.length > 0 && (
        <div className="space-y-2">
          {importErrors.map((error, index) => (
            <div
              key={index}
              className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{error}</span>
            </div>
          ))}
        </div>
      )}

      {saveError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="space-y-4">
        {invoices.map((invoice, index) => (
          <div
            key={index}
            className={`border-2 rounded-xl p-6 transition-colors ${
              savedInvoices.has(index)
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {savedInvoices.has(index) ? (
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                ) : (
                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">
                    {index + 1}
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-gray-900">{invoice.file.name}</h3>
                  <p className="text-sm text-gray-500">
                    {invoice.lineItems.length} line item{invoice.lineItems.length === 1 ? '' : 's'} extracted
                  </p>
                </div>
              </div>
              {!savedInvoices.has(index) && (
                <button
                  onClick={() => handleSaveInvoice(index)}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
                >
                  Add Transaction
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={invoice.formData.transaction_date}
                  onChange={(e) => updateInvoiceField(index, 'transaction_date', e.target.value)}
                  disabled={savedInvoices.has(index)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Site <span className="text-red-500">*</span>
                </label>
                <select
                  value={invoice.formData.site_id}
                  onChange={(e) => updateInvoiceField(index, 'site_id', e.target.value)}
                  disabled={savedInvoices.has(index)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                >
                  <option value="">Select site</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={invoice.formData.amount}
                  onChange={(e) => updateInvoiceField(index, 'amount', e.target.value)}
                  disabled={savedInvoices.has(index)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
                <select
                  value={invoice.formData.supplier_id}
                  onChange={(e) => updateInvoiceField(index, 'supplier_id', e.target.value)}
                  disabled={savedInvoices.has(index)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={invoice.formData.category_id}
                  onChange={(e) => updateInvoiceField(index, 'category_id', e.target.value)}
                  disabled={savedInvoices.has(index)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                >
                  <option value="">Select category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Number</label>
                <input
                  type="text"
                  value={invoice.formData.invoice_number}
                  onChange={(e) => updateInvoiceField(index, 'invoice_number', e.target.value)}
                  disabled={savedInvoices.has(index)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                  placeholder="e.g., INV-2024-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Reference</label>
                <input
                  type="text"
                  value={invoice.formData.invoice_reference}
                  onChange={(e) => updateInvoiceField(index, 'invoice_reference', e.target.value)}
                  disabled={savedInvoices.has(index)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                  placeholder="e.g., PO-12345"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <input
                  type="text"
                  value={invoice.formData.notes}
                  onChange={(e) => updateInvoiceField(index, 'notes', e.target.value)}
                  disabled={savedInvoices.has(index)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                  placeholder="Optional notes…"
                />
              </div>
            </div>

            {invoice.lineItems.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <strong>{invoice.lineItems.length} line items</strong> will be automatically saved with this transaction.
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-7xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Dropbox Bulk Invoice Import</h2>
            <p className="text-sm text-gray-500 mt-1">
              Import and process invoice PDFs directly from your Dropbox folder without affecting existing tools.
            </p>
          </div>
          <button onClick={() => { onClose(); }} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {invoices.length === 0
            ? renderFileSelection()
            : renderInvoiceEditor()}
        </div>

        {invoices.length > 0 && (
          <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {savedInvoices.size} of {invoices.length} transactions saved
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  resetImportState();
                  onClose();
                }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              >
                Close
              </button>
              {savedInvoices.size < invoices.length && (
                <button
                  onClick={handleSaveAll}
                  disabled={processing}
                  className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Adding All Transactions…' : 'Add All Transactions'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
