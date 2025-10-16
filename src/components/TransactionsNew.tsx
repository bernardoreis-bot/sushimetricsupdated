import { useState, useEffect } from 'react';
import { Plus, CreditCard as Edit2, Trash2, Download, Search, Upload, FileText, Eye, UploadCloud } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseInvoicePDF, parseInvoiceLineItems } from '../utils/invoiceParser';
import TransactionDetails from './TransactionDetails';
import BulkInvoiceCreation from './BulkInvoiceCreation';
import { AlertModal, ConfirmModal } from './Modal';

interface Transaction {
  id: string;
  transaction_date: string;
  site_id: string;
  category_id: string | null;
  supplier_id: string | null;
  invoice_number: string | null;
  invoice_reference: string | null;
  amount: number;
  notes: string | null;
  sites: { name: string } | null;
  suppliers: { name: string } | null;
  transaction_categories: { name: string; code: string } | null;
}

interface Site {
  id: string;
  name: string;
  site_code: string;
}

interface Supplier {
  id: string;
  name: string;
  default_category_id: string | null;
}

interface Category {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

export default function TransactionsNew() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showInvoiceUpload, setShowInvoiceUpload] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [pendingLineItems, setPendingLineItems] = useState<any[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSite, setFilterSite] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    site_id: '',
    category_id: '',
    supplier_id: '',
    invoice_number: '',
    invoice_reference: '',
    amount: '',
    notes: '',
  });

  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [alertModal, setAlertModal] = useState<{isOpen: boolean; title: string; message: string; type: 'success' | 'error' | 'info' | 'warning'}>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  useEffect(() => {
    loadTransactions();
    loadSites();
    loadSuppliers();
    loadCategories();
  }, []);

  const loadTransactions = async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        id,
        transaction_date,
        site_id,
        category_id,
        supplier_id,
        invoice_number,
        invoice_reference,
        amount,
        notes,
        sites (name),
        suppliers (name),
        transaction_categories (name, code)
      `)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('Error loading transactions:', error);
    }

    console.log('Loaded transactions:', data?.length || 0, 'transactions');

    if (!error && data) {
      setTransactions(data as Transaction[]);
    }
  };

  const loadSites = async () => {
    const { data, error } = await supabase
      .from('sites')
      .select('id, name, site_code')
      .eq('is_active', true)
      .order('name');

    if (!error && data) {
      setAllSites(data);
      setSites(data.filter(s => s.site_code !== 'ALL'));
    }
  };

  const loadSuppliers = async () => {
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name, default_category_id')
      .eq('is_active', true)
      .order('name');

    if (!error && data) {
      setSuppliers(data);
    }
  };

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from('transaction_categories')
      .select('id, name, code, is_active')
      .eq('is_active', true)
      .order('name');

    if (!error && data) {
      setCategories(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const transactionData = {
      transaction_date: formData.transaction_date,
      site_id: formData.site_id,
      category_id: formData.category_id || null,
      supplier_id: formData.supplier_id || null,
      invoice_number: formData.invoice_number || null,
      invoice_reference: formData.invoice_reference || null,
      amount: parseFloat(formData.amount),
      notes: formData.notes || null,
      updated_at: new Date().toISOString(),
    };

    // Check for potential duplicates before inserting
    if (!editingTransaction) {
      const { data: potentialDuplicates } = await supabase
        .from('transactions')
        .select('id, invoice_number, amount, transaction_date')
        .or(`and(amount.eq.${transactionData.amount},invoice_number.eq.${transactionData.invoice_number || 'null'})`);

      if (potentialDuplicates && potentialDuplicates.length > 0) {
        const confirmAdd = confirm(
          `⚠️ POTENTIAL DUPLICATE DETECTED!\n\n` +
          `Found ${potentialDuplicates.length} transaction(s) with:\n` +
          `- Amount: £${transactionData.amount}\n` +
          `- Invoice #: ${transactionData.invoice_number || 'N/A'}\n\n` +
          `Do you still want to add this transaction?`
        );

        if (!confirmAdd) {
          return; // User cancelled
        }
      }
    }

    if (editingTransaction) {
      const { error } = await supabase
        .from('transactions')
        .update(transactionData)
        .eq('id', editingTransaction.id);

      if (!error) {
        resetForm();
        loadTransactions();
      }
    } else {
      const { data: newTransaction, error } = await supabase
        .from('transactions')
        .insert([transactionData])
        .select()
        .single();

      if (!error && newTransaction) {
        // Save line items if any
        if (pendingLineItems.length > 0) {
          console.log('Preparing to save line items:', pendingLineItems);

          const itemsToInsert = pendingLineItems.map(item => ({
            transaction_id: newTransaction.id,
            item_name: item.productName || item.name || 'Unknown Item',
            item_code: item.productCode || item.code || null,
            quantity: parseFloat(item.quantity) || 0,
            unit_price: parseFloat(item.pricePerUnit || item.price) || 0,
            line_total: parseFloat(item.totalPrice || item.total) || 0,
            category: 'Other'
          }));

          console.log('Items to insert:', itemsToInsert);

          const { error: itemsError } = await supabase.from('invoice_items').insert(itemsToInsert);

          if (itemsError) {
            console.error('Error saving line items:', itemsError);
            setAlertModal({
              isOpen: true,
              title: 'Warning',
              message: `Transaction saved but error saving line items: ${itemsError.message}`,
              type: 'warning'
            });
          } else {
            console.log(`✓ Successfully saved ${itemsToInsert.length} line items for transaction ${newTransaction.id}`);
          }
        } else {
          console.log('No pending line items to save');
        }

        resetForm();
        setPendingLineItems([]);
        loadTransactions();
      } else if (error) {
        console.error('Error creating transaction:', error);
        setAlertModal({
          isOpen: true,
          title: 'Error',
          message: 'Error creating transaction: ' + error.message,
          type: 'error'
        });
      }
    }
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setFormData({
      transaction_date: transaction.transaction_date,
      site_id: transaction.site_id,
      category_id: transaction.category_id || '',
      supplier_id: transaction.supplier_id || '',
      invoice_number: transaction.invoice_number || '',
      invoice_reference: transaction.invoice_reference || '',
      amount: transaction.amount.toString(),
      notes: transaction.notes || '',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this transaction?')) {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (!error) {
        loadTransactions();
      }
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedTransactions.size === 0) return;

    if (!confirm(`Are you sure you want to delete ${selectedTransactions.size} transaction(s)?`)) return;

    const { error } = await supabase
      .from('transactions')
      .delete()
      .in('id', Array.from(selectedTransactions));

    if (!error) {
      setSelectedTransactions(new Set());
      loadTransactions();
    }
  };

  const toggleSelectTransaction = (id: string) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTransactions(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedTransactions.size === filteredTransactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(filteredTransactions.map(t => t.id)));
    }
  };

  const handleInvoiceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setAlertModal({
        isOpen: true,
        title: 'Invalid File Type',
        message: 'Please upload a PDF file',
        type: 'error'
      });
      return;
    }

    setUploadingInvoice(true);
    try {
      const { data: parsingRules } = await supabase
        .from('invoice_parsing_rules')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      const parsed = await parseInvoicePDF(file, parsingRules || []);
      console.log('Parsed invoice data:', parsed);

      const updates: any = {};

      if (parsed.date) {
        updates.transaction_date = parsed.date;
      }

      if (parsed.invoiceNumber) {
        updates.invoice_number = parsed.invoiceNumber;
      }

      if (parsed.invoiceReference) {
        updates.invoice_reference = parsed.invoiceReference;
      }

      if (parsed.totalAmount) {
        updates.amount = parsed.totalAmount.toString();
      }

      if (parsed.matchedRuleSiteId) {
        updates.site_id = parsed.matchedRuleSiteId;
      } else if (parsed.siteName) {
        const matchingSite = sites.find(s =>
          s.name.toLowerCase().includes(parsed.siteName!.toLowerCase()) ||
          parsed.siteName!.toLowerCase().includes(s.name.toLowerCase())
        );
        if (matchingSite) {
          updates.site_id = matchingSite.id;
        }
      }

      if (parsed.matchedRuleSupplierId) {
        updates.supplier_id = parsed.matchedRuleSupplierId;
      } else if (parsed.supplierName) {
        const matchingSupplier = suppliers.find(s =>
          s.name.toLowerCase().includes(parsed.supplierName!.toLowerCase()) ||
          parsed.supplierName!.toLowerCase().includes(s.name.toLowerCase())
        );
        if (matchingSupplier) {
          updates.supplier_id = matchingSupplier.id;
        }
      }

      if (parsed.matchedRuleCategoryId) {
        updates.category_id = parsed.matchedRuleCategoryId;
      } else if (updates.supplier_id) {
        const supplier = suppliers.find(s => s.id === updates.supplier_id);
        if (supplier?.default_category_id) {
          updates.category_id = supplier.default_category_id;
        }
      }

      setFormData(prev => ({ ...prev, ...updates }));

      // Extract line items
      try {
        const lineItems = await parseInvoiceLineItems(file);
        console.log(`Extracted ${lineItems.length} line items from invoice`);
        setPendingLineItems(lineItems);
        setAlertModal({
          isOpen: true,
          title: 'Invoice Parsed Successfully',
          message: `Extracted ${lineItems.length} line items from the invoice. Please review the information before saving.`,
          type: 'success'
        });
      } catch (err) {
        console.warn('Could not extract line items:', err);
        setPendingLineItems([]);
        setAlertModal({
          isOpen: true,
          title: 'Invoice Parsed',
          message: 'Invoice metadata extracted successfully! Could not extract line items automatically.',
          type: 'warning'
        });
      }
    } catch (error) {
      console.error('Error parsing invoice:', error);
      setAlertModal({
        isOpen: true,
        title: 'Parsing Failed',
        message: 'Failed to parse invoice. Please enter the information manually.',
        type: 'error'
      });
    } finally {
      setUploadingInvoice(false);
      event.target.value = '';
    }
  };

  const resetForm = () => {
    setFormData({
      transaction_date: new Date().toISOString().split('T')[0],
      site_id: '',
      category_id: '',
      supplier_id: '',
      invoice_number: '',
      invoice_reference: '',
      amount: '',
      notes: '',
    });
    setEditingTransaction(null);
    setShowAddForm(false);
  };

  const handleCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

      const dateIndex = headers.findIndex(h => h.toLowerCase().includes('date'));
      const siteIndex = headers.findIndex(h => h.toLowerCase().includes('site'));
      const categoryIndex = headers.findIndex(h => h.toLowerCase().includes('category'));
      const invoiceNumIndex = headers.findIndex(h => h.toLowerCase().includes('invoice') && h.toLowerCase().includes('number'));
      const referenceIndex = headers.findIndex(h => h.toLowerCase().includes('reference'));
      const supplierIndex = headers.findIndex(h => h.toLowerCase().includes('supplier'));
      const amountIndex = headers.findIndex(h => h.toLowerCase().includes('amount'));
      const notesIndex = headers.findIndex(h => h.toLowerCase().includes('notes'));

      let imported = 0;
      let errors = 0;

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));

        const siteName = siteIndex >= 0 ? values[siteIndex] : '';
        const categoryName = categoryIndex >= 0 ? values[categoryIndex] : '';
        const supplierName = supplierIndex >= 0 ? values[supplierIndex] : '';

        const site = sites.find(s => s.name.toLowerCase() === siteName.toLowerCase());
        const category = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
        const supplier = suppliers.find(s => s.name.toLowerCase() === supplierName.toLowerCase());

        if (!site) {
          errors++;
          continue;
        }

        const transactionData = {
          transaction_date: dateIndex >= 0 ? values[dateIndex] : new Date().toISOString().split('T')[0],
          site_id: site.id,
          category_id: category?.id || null,
          supplier_id: supplier?.id || null,
          invoice_number: invoiceNumIndex >= 0 ? values[invoiceNumIndex] : null,
          invoice_reference: referenceIndex >= 0 ? values[referenceIndex] : null,
          amount: amountIndex >= 0 ? parseFloat(values[amountIndex]) || 0 : 0,
          notes: notesIndex >= 0 ? values[notesIndex] : null,
        };

        const { error } = await supabase.from('transactions').insert([transactionData]);
        if (error) {
          errors++;
        } else {
          imported++;
        }
      }

      setAlertModal({
        isOpen: true,
        title: 'Import Complete',
        message: `Imported: ${imported} transactions\nErrors: ${errors}`,
        type: imported > 0 ? 'success' : 'warning'
      });
      loadTransactions();
    } catch (error) {
      console.error('Error importing CSV:', error);
      setAlertModal({
        isOpen: true,
        title: 'Import Failed',
        message: 'Failed to import CSV. Please check the file format.',
        type: 'error'
      });
    } finally {
      event.target.value = '';
    }
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Site', 'Category', 'Invoice Number', 'Reference', 'Supplier', 'Amount', 'Notes'];
    const rows = filteredTransactions.map(t => [
      t.transaction_date,
      t.sites?.name || '',
      t.transaction_categories?.name || '',
      t.invoice_number || '',
      t.invoice_reference || '',
      t.suppliers?.name || '',
      t.amount,
      t.notes || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesCategory = filterCategory === 'all' || t.category_id === filterCategory;
    const matchesSite = filterSite === 'all' || t.site_id === filterSite;
    const matchesSearch = searchTerm === '' ||
      t.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.invoice_reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.suppliers?.name.toLowerCase().includes(searchTerm.toLowerCase());

    const transactionDate = new Date(t.transaction_date);
    const matchesStartDate = !startDate || transactionDate >= new Date(startDate);
    const matchesEndDate = !endDate || transactionDate <= new Date(endDate);

    return matchesCategory && matchesSite && matchesSearch && matchesStartDate && matchesEndDate;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(amount);
  };

  const getCategoryBadge = (code: string) => {
    const badges: { [key: string]: string } = {
      SALES: 'bg-blue-100 text-blue-700',
      LABOUR: 'bg-orange-100 text-orange-700',
      FOOD: 'bg-green-100 text-green-700',
      PACKAGING: 'bg-purple-100 text-purple-700',
    };
    return badges[code] || 'bg-gray-100 text-gray-700';
  };

  const selectedCategory = categories.find(c => c.id === formData.category_id);
  const showSupplierField = selectedCategory?.code === 'FOOD' || selectedCategory?.code === 'PACKAGING';

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
        <p className="text-gray-500 mt-1">Manage all transactions for your kiosks</p>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <select
            value={filterSite}
            onChange={(e) => setFilterSite(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">All Sites</option>
            {sites.map(site => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            placeholder="Start Date"
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            placeholder="End Date"
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition-colors"
            >
              Clear Dates
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {selectedTransactions.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              <Trash2 className="w-5 h-5" />
              Delete Selected ({selectedTransactions.size})
            </button>
          )}
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            <Download className="w-5 h-5" />
            Export CSV
          </button>
          <label className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors cursor-pointer">
            <Upload className="w-5 h-5" />
            Import CSV
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVImport}
              className="hidden"
            />
          </label>
          <button
            onClick={() => setShowInvoiceUpload(true)}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            <FileText className="w-5 h-5" />
            Invoice Helper
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => setShowBulkUpload(true)}
              className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              <UploadCloud className="w-5 h-5" />
              Bulk Invoice Creation
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowAddForm(!showAddForm);
              }}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Transaction
            </button>
          </div>
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              {editingTransaction ? 'Edit Transaction' : 'New Transaction'}
            </h3>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg cursor-pointer transition-colors">
                <Upload className="w-4 h-4" />
                {uploadingInvoice ? 'Parsing...' : 'Upload Invoice PDF'}
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleInvoiceUpload}
                  disabled={uploadingInvoice}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {uploadingInvoice && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
              Parsing invoice... This may take a few seconds.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.transaction_date}
                onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Site <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.site_id}
                onChange={(e) => setFormData({ ...formData, site_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              >
                <option value="">Select Site</option>
                {allSites.map(site => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.category_id}
                onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              >
                <option value="">Select Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {showSupplierField && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
                <select
                  value={formData.supplier_id}
                  onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select Supplier</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Number</label>
              <input
                type="text"
                value={formData.invoice_number}
                onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g., INV-2024-001"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Reference</label>
              <input
                type="text"
                value={formData.invoice_reference}
                onChange={(e) => setFormData({ ...formData, invoice_reference: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g., PO-12345"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount (£) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="0.00"
                required
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              {editingTransaction ? 'Update Transaction' : 'Create Transaction'}
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
                <th className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={filteredTransactions.length > 0 && selectedTransactions.size === filteredTransactions.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Site</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Category</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Invoice Info</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Supplier</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredTransactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 text-center">
                    <input
                      type="checkbox"
                      checked={selectedTransactions.has(transaction.id)}
                      onChange={() => toggleSelectTransaction(transaction.id)}
                      className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
                    />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {new Date(transaction.transaction_date).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{transaction.sites?.name}</td>
                  <td className="px-6 py-4">
                    {transaction.transaction_categories && (
                      <span className={`inline-block text-xs px-2 py-1 rounded-full font-semibold ${getCategoryBadge(transaction.transaction_categories.code)}`}>
                        {transaction.transaction_categories.name}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {transaction.invoice_number && (
                      <div>
                        <div className="font-semibold text-gray-900">{transaction.invoice_number}</div>
                        {transaction.invoice_reference && (
                          <div className="text-xs text-gray-500">{transaction.invoice_reference}</div>
                        )}
                      </div>
                    )}
                    {!transaction.invoice_number && transaction.invoice_reference && (
                      <div className="text-xs text-gray-500">{transaction.invoice_reference}</div>
                    )}
                    {!transaction.invoice_number && !transaction.invoice_reference && '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {transaction.suppliers?.name || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">
                    {formatCurrency(transaction.amount)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setSelectedTransaction(transaction)}
                        className="text-blue-600 hover:text-blue-800"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(transaction)}
                        className="text-gray-600 hover:text-gray-900"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(transaction.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredTransactions.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200 mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Transactions Found</h3>
          <p className="text-gray-500 mb-4">
            {transactions.length === 0
              ? 'Add your first transaction to get started'
              : 'Try adjusting your filters'}
          </p>
        </div>
      )}

      {showInvoiceUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-blue-600" />
                <h2 className="text-2xl font-bold text-gray-900">Invoice Reference Helper</h2>
              </div>
              <button
                onClick={() => setShowInvoiceUpload(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-blue-900 mb-2">How to Use Invoices</h3>
                <ul className="text-sm text-blue-800 space-y-2">
                  <li>• Use your physical or PDF invoices to help enter transaction details</li>
                  <li>• Find the <strong>Total Amount</strong> on the invoice and enter it when adding a transaction</li>
                  <li>• Copy the <strong>Invoice Number</strong> and <strong>Site Name</strong> to the transaction form</li>
                  <li>• Select the appropriate <strong>Category</strong> (FOOD or PACKAGING for supplier invoices)</li>
                  <li>• The system will automatically track these for your Stock Count predictions</li>
                </ul>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Example Invoice Format</h3>
                <div className="bg-white p-4 rounded border border-gray-200 text-sm font-mono">
                  <div className="mb-4">
                    <div className="font-bold text-lg">INVOICE #290721</div>
                    <div className="text-gray-600">Date: 04/08/25</div>
                  </div>
                  <div className="mb-4">
                    <div className="font-semibold">Deliver To:</div>
                    <div className="text-gray-700">Yo Sushi - Tesco Superstore Allerton</div>
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex justify-between font-bold">
                      <span>Total Amount:</span>
                      <span className="text-green-600">£3,102.78</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-sm text-gray-600">
                  <strong>Steps:</strong>
                  <ol className="list-decimal list-inside space-y-1 mt-2">
                    <li>Click "Add Transaction" button above</li>
                    <li>Enter the invoice date (04/08/25)</li>
                    <li>Select the site (Tesco Superstore Allerton)</li>
                    <li>Select category (FOOD or PACKAGING)</li>
                    <li>Select the supplier (Eden Farm)</li>
                    <li>Enter invoice number (290721)</li>
                    <li>Enter the total amount (£3102.78)</li>
                    <li>Click Save</li>
                  </ol>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setShowInvoiceUpload(false);
                    setShowAddForm(true);
                  }}
                  className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 font-semibold transition-colors"
                >
                  Got it, Add Transaction
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Details Modal */}
      {selectedTransaction && (
        <TransactionDetails
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onUpdate={loadTransactions}
        />
      )}

      {/* Bulk Invoice Creation Modal */}
      {showBulkUpload && (
        <BulkInvoiceCreation
          onClose={() => setShowBulkUpload(false)}
          onSuccess={loadTransactions}
          sites={sites}
          suppliers={suppliers}
          categories={categories}
        />
      )}

      {/* Alert Modal */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
}
