import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, FileSearch, AlertCircle, Upload, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseInvoicePDF } from '../utils/invoiceParser';

interface ParsingRule {
  id: string;
  supplier_id: string | null;
  text_pattern: string;
  default_category_id: string | null;
  default_site_id: string | null;
  site_name_pattern: string | null;
  site_name_replacements: string[];
  invoice_number_pattern: string | null;
  date_pattern: string | null;
  amount_pattern: string | null;
  is_active: boolean;
  priority: number;
  notes: string | null;
  color: string;
  suppliers: { name: string } | null;
  transaction_categories: { name: string } | null;
  sites: { name: string } | null;
}

interface Supplier {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface Site {
  id: string;
  name: string;
}

export default function ParsingRules() {
  const [rules, setRules] = useState<ParsingRule[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRule, setEditingRule] = useState<ParsingRule | null>(null);
  const [invoiceText, setInvoiceText] = useState<string>('');
  const [showInvoiceText, setShowInvoiceText] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [formData, setFormData] = useState({
    supplier_id: '',
    text_pattern: '',
    default_category_id: '',
    default_site_id: '',
    site_name_pattern: '',
    site_name_replacements: '',
    invoice_number_pattern: '',
    date_pattern: '',
    amount_pattern: '',
    is_active: true,
    priority: 0,
    notes: '',
    color: 'green',
  });

  const colorOptions = [
    { value: 'blue', label: 'Blue', bgClass: 'bg-blue-500' },
    { value: 'orange', label: 'Orange', bgClass: 'bg-orange-500' },
    { value: 'green', label: 'Green', bgClass: 'bg-green-500' },
    { value: 'purple', label: 'Purple', bgClass: 'bg-purple-500' },
  ];

  useEffect(() => {
    loadRules();
    loadSuppliers();
    loadCategories();
    loadSites();
  }, []);

  const loadRules = async () => {
    const { data, error } = await supabase
      .from('invoice_parsing_rules')
      .select('*, suppliers(name), transaction_categories(name), sites(name)')
      .order('priority', { ascending: false });

    if (!error && data) {
      setRules(data as ParsingRule[]);
    }
  };

  const loadSuppliers = async () => {
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    if (!error && data) {
      setSuppliers(data);
    }
  };

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from('transaction_categories')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    if (!error && data) {
      setCategories(data);
    }
  };

  const loadSites = async () => {
    const { data, error } = await supabase
      .from('sites')
      .select('id, name')
      .eq('is_active', true)
      .neq('site_code', 'ALL')
      .order('name');

    if (!error && data) {
      setSites(data);
    }
  };

  const handleInvoiceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file');
      return;
    }

    setUploadingInvoice(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib = await import('pdfjs-dist');
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n\n';
      }

      setInvoiceText(fullText);
      setShowInvoiceText(true);

      const supplierMatch = fullText.match(/([A-Z][A-Za-z\s&]+(?:Ltd|Limited|Farm|Group|Services))/);
      if (supplierMatch && !formData.text_pattern) {
        setFormData(prev => ({ ...prev, text_pattern: supplierMatch[1].trim() }));
      }

      alert('Invoice uploaded! Review the extracted text below.');
    } catch (error) {
      console.error('Error processing invoice:', error);
      alert('Failed to process invoice. Please try again.');
    } finally {
      setUploadingInvoice(false);
      event.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const replacements = formData.site_name_replacements
      .split('\n')
      .map(r => r.trim())
      .filter(r => r.length > 0);

    const dataToSave = {
      supplier_id: formData.supplier_id || null,
      text_pattern: formData.text_pattern,
      default_category_id: formData.default_category_id || null,
      default_site_id: formData.default_site_id || null,
      site_name_pattern: formData.site_name_pattern || null,
      site_name_replacements: replacements,
      invoice_number_pattern: formData.invoice_number_pattern || null,
      date_pattern: formData.date_pattern || null,
      amount_pattern: formData.amount_pattern || null,
      is_active: formData.is_active,
      priority: formData.priority,
      notes: formData.notes || null,
      color: formData.color,
      updated_at: new Date().toISOString(),
    };

    if (editingRule) {
      const { error } = await supabase
        .from('invoice_parsing_rules')
        .update(dataToSave)
        .eq('id', editingRule.id);

      if (!error) {
        resetForm();
        loadRules();
      }
    } else {
      const { error } = await supabase
        .from('invoice_parsing_rules')
        .insert([dataToSave]);

      if (!error) {
        resetForm();
        loadRules();
      }
    }
  };

  const handleEdit = (rule: ParsingRule) => {
    setEditingRule(rule);
    setFormData({
      supplier_id: rule.supplier_id || '',
      text_pattern: rule.text_pattern,
      default_category_id: rule.default_category_id || '',
      default_site_id: rule.default_site_id || '',
      site_name_pattern: rule.site_name_pattern || '',
      site_name_replacements: (rule.site_name_replacements || []).join('\n'),
      invoice_number_pattern: rule.invoice_number_pattern || '',
      date_pattern: rule.date_pattern || '',
      amount_pattern: rule.amount_pattern || '',
      is_active: rule.is_active,
      priority: rule.priority,
      notes: rule.notes || '',
      color: rule.color || 'green',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this parsing rule?')) {
      const { error } = await supabase
        .from('invoice_parsing_rules')
        .delete()
        .eq('id', id);

      if (!error) {
        loadRules();
      }
    }
  };

  const resetForm = () => {
    setFormData({
      supplier_id: '',
      text_pattern: '',
      default_category_id: '',
      default_site_id: '',
      site_name_pattern: '',
      site_name_replacements: '',
      invoice_number_pattern: '',
      date_pattern: '',
      amount_pattern: '',
      is_active: true,
      priority: 0,
      notes: '',
      color: 'green',
    });
    setEditingRule(null);
    setShowAddForm(false);
    setInvoiceText('');
    setShowInvoiceText(false);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Invoice Rules</h1>
        <p className="text-gray-500 mt-1">Teach the system how to parse different invoice formats</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-2">How Parsing Rules Work:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Text Pattern:</strong> If this text is found in the invoice, apply this rule (e.g., "Eden Farm")</li>
              <li><strong>Site Name Replacements:</strong> Text to remove from site names (one per line, e.g., "Yo Sushi -", "Tesco Superstore")</li>
              <li><strong>Priority:</strong> Higher numbers are checked first (useful when you have overlapping rules)</li>
            </ul>
            <div className="mt-3 p-3 bg-white rounded border border-blue-200">
              <p className="font-semibold mb-1">Current Pattern Recognition:</p>
              <p className="text-xs">The system automatically looks for:</p>
              <ul className="list-disc list-inside space-y-1 text-xs mt-1">
                <li><strong>Invoice Number:</strong> "Invoice No. W1472761" or "INVOICE: 123456"</li>
                <li><strong>Reference:</strong> "Your Order No. ABC123" or "P.O. Number: XYZ789"</li>
                <li><strong>Date:</strong> "Date 10/09/25" or "Invoice Date: 01/12/2024"</li>
                <li><strong>Amount:</strong> "TOTAL £608.73" or "Amount Due: 1234.56"</li>
                <li><strong>Site Name:</strong> Extracts from "Delivered to:" section (after applying your custom replacements)</li>
              </ul>
              <p className="text-xs mt-2 text-blue-700">
                <strong>Tip:</strong> Upload a sample invoice to see what text is extracted, then add custom replacements if needed.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div className="text-sm text-gray-600">
          Total Rules: <span className="font-semibold">{rules.length}</span> | Active: <span className="font-semibold">{rules.filter(r => r.is_active).length}</span>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddForm(!showAddForm);
          }}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Parsing Rule
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            {editingRule ? 'Edit Parsing Rule' : 'New Parsing Rule'}
          </h3>
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Sample Invoice (Optional)
              </label>
              <p className="text-xs text-gray-500 mb-3">Upload an invoice to see all the text extracted. This helps you create accurate parsing rules.</p>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {uploadingInvoice ? 'Processing...' : 'Upload Invoice PDF'}
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleInvoiceUpload}
                    disabled={uploadingInvoice}
                    className="hidden"
                  />
                </label>
                {invoiceText && (
                  <button
                    type="button"
                    onClick={() => setShowInvoiceText(!showInvoiceText)}
                    className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
                  >
                    {showInvoiceText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showInvoiceText ? 'Hide' : 'Show'} Invoice Text
                  </button>
                )}
              </div>
              {showInvoiceText && invoiceText && (
                <div className="mt-3">
                  <div className="bg-white border border-gray-300 rounded p-3 max-h-64 overflow-y-auto">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">{invoiceText}</pre>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Text Pattern (to identify this invoice type) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.text_pattern}
                  onChange={(e) => setFormData({ ...formData, text_pattern: e.target.value })}
                  placeholder="e.g., Eden Farm, Bunzl"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
                <select
                  value={formData.supplier_id}
                  onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">No supplier link</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Default Category</label>
                <select
                  value={formData.default_category_id}
                  onChange={(e) => setFormData({ ...formData, default_category_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">No default category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Default Site</label>
                <select
                  value={formData.default_site_id}
                  onChange={(e) => setFormData({ ...formData, default_site_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Auto-detect from invoice</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                <div className="flex gap-3">
                  {colorOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: option.value })}
                      className={`w-10 h-10 rounded-lg ${option.bgClass} ${formData.color === option.value ? 'ring-2 ring-offset-2 ring-gray-900' : ''} transition-all`}
                      title={option.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Site Name Replacements (one per line)
              </label>
              <textarea
                value={formData.site_name_replacements}
                onChange={(e) => setFormData({ ...formData, site_name_replacements: e.target.value })}
                placeholder="Yo Sushi -&#10;Tesco Superstore&#10;Mather Avenue"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Describe when this rule should be used"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-orange-500 focus:ring-orange-500 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Active Rule</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Priority</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Color</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Text Pattern</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Supplier</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Category</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Site</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Replacements</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rules.map((rule) => {
                const colorOption = colorOptions.find(c => c.value === (rule.color || 'green'));
                return (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">{rule.priority}</td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center">
                      <div className={`w-6 h-6 rounded ${colorOption?.bgClass}`} title={colorOption?.label} />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-mono bg-gray-50">{rule.text_pattern}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {rule.suppliers?.name || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {rule.transaction_categories?.name || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {rule.sites?.name || <span className="text-gray-400 italic">Auto-detect</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {rule.site_name_replacements && rule.site_name_replacements.length > 0 ? (
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {rule.site_name_replacements.length} replacement{rule.site_name_replacements.length !== 1 ? 's' : ''}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {rule.is_active ? (
                      <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                        Active
                      </span>
                    ) : (
                      <span className="inline-block text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full font-semibold">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEdit(rule)}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {rules.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileSearch className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Parsing Rules Yet</h3>
          <p className="text-gray-500 mb-4">Add your first parsing rule to help the system understand your invoices</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Your First Rule
          </button>
        </div>
      )}
    </div>
  );
}
