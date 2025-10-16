import { useState } from 'react';
import { X, Upload, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { processInvoiceWithLineItems, saveTransactionWithLineItems, ProcessedInvoice } from '../utils/invoiceProcessor';

interface BulkInvoiceCreationProps {
  onClose: () => void;
  onSuccess: () => void;
  sites: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; code: string }>;
}

export default function BulkInvoiceCreation({
  onClose,
  onSuccess,
  sites,
  suppliers,
  categories
}: BulkInvoiceCreationProps) {
  const [processing, setProcessing] = useState(false);
  const [invoices, setInvoices] = useState<ProcessedInvoice[]>([]);
  const [savedInvoices, setSavedInvoices] = useState<Set<number>>(new Set());

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setProcessing(true);
    const processedInvoices: ProcessedInvoice[] = [];

    try {
      // Load parsing rules
      const { data: parsingRules } = await supabase
        .from('invoice_parsing_rules')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type !== 'application/pdf') continue;

        try {
          const processed = await processInvoiceWithLineItems(file, parsingRules || []);
          processedInvoices.push(processed);
        } catch (err) {
          console.error(`Error processing ${file.name}:`, err);
        }
      }

      setInvoices(processedInvoices);
    } catch (err) {
      alert('Error processing invoices: ' + (err as Error).message);
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
      alert('Please fill in all required fields (Date, Site, Amount)');
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
    } else {
      alert('Error saving transaction: ' + result.error);
    }
  };

  const handleSaveAll = async () => {
    setProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < invoices.length; i++) {
      if (!savedInvoices.has(i)) {
        const invoice = invoices[i];

        // Validate required fields
        if (!invoice.formData.transaction_date || !invoice.formData.site_id || !invoice.formData.amount) {
          console.log(`Skipping invoice ${i + 1}: Missing required fields`);
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
    }

    setProcessing(false);

    if (failCount > 0) {
      alert(`Saved ${successCount} transactions. ${failCount} failed (check required fields: Date, Site, Amount)`);
    } else {
      alert(`Successfully saved all ${successCount} transactions!`);
      onClose(); // Close modal after successful save
    }

    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-7xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Bulk Invoice Creation</h2>
            <p className="text-sm text-gray-500 mt-1">Upload multiple invoices at once</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {invoices.length === 0 ? (
            <div className="text-center py-12">
              <label className="inline-flex flex-col items-center gap-4 px-8 py-12 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                <Upload className="w-12 h-12 text-gray-400" />
                <div>
                  <div className="text-lg font-semibold text-gray-900">
                    {processing ? 'Processing invoices...' : 'Select Invoice PDFs'}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Choose multiple PDF files to process
                  </div>
                </div>
                <input
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={handleFileSelect}
                  disabled={processing}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              {invoices.map((invoice, index) => (
                <div
                  key={index}
                  className={`border-2 rounded-xl p-6 ${
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
                          {invoice.lineItems.length} line items extracted
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
                          <option key={site.id} value={site.id}>{site.name}</option>
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
                          <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
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
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
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
                      />
                    </div>
                  </div>

                  {invoice.lineItems.length > 0 && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        <strong>{invoice.lineItems.length} line items</strong> will be automatically saved with this transaction
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {invoices.length > 0 && (
          <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {savedInvoices.size} of {invoices.length} transactions saved
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
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
                  {processing ? 'Adding All Transactions...' : 'Add All Transactions'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
