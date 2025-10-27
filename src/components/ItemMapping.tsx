import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Upload, Package, Search, AlertCircle, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseInvoiceLineItems, ParsedLineItem } from '../utils/invoiceParser';

interface Supplier {
  id: string;
  name: string;
}

interface ProductMapping {
  id: string;
  supplier_id: string;
  supplier_product_code: string;
  supplier_product_name: string;
  internal_product_id: string | null;
  category: string;
  unit: string;
  notes: string | null;
  created_at: string;
  suppliers: { name: string } | null;
  products: { code: string; name: string } | null;
}

interface Product {
  id: string;
  code: string;
  name: string;
}

export default function ItemMapping() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMapping, setEditingMapping] = useState<ProductMapping | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedLineItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [showUnmapped, setShowUnmapped] = useState(false);
  const [unmappedItems, setUnmappedItems] = useState<ParsedLineItem[]>([]);
  const [itemCategories, setItemCategories] = useState<Map<number, string>>(new Map());
  const [selectedMappings, setSelectedMappings] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('Ambient');
  const [categories, setCategories] = useState<string[]>(['Ambient', 'Chilled', 'Frozen', 'Packaging', 'Cleaning', 'Other']);
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [bulkParsedCategory, setBulkParsedCategory] = useState('');
  const [formData, setFormData] = useState({
    supplier_id: '',
    supplier_product_code: '',
    supplier_product_name: '',
    category: 'Ambient',
    unit: 'CASE',
    unit_price: '0.00',
    notes: '',
  });

  useEffect(() => {
    loadSuppliers();
    loadProducts();
    loadMappings();
    loadCategorySettings();
  }, []);

  const loadSuppliers = async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name')
      .order('name');

    if (data) setSuppliers(data);
  };

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('id, code, name')
      .order('name');

    if (data) setProducts(data);
  };

  const loadMappings = async () => {
    const { data } = await supabase
      .from('product_mappings')
      .select(`
        *,
        suppliers(name),
        products(code, name)
      `)
      .order('created_at', { ascending: false });

    if (data) setMappings(data as any);
  };

  const loadCategorySettings = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('id, setting_value')
      .eq('setting_key', 'item_mapping_categories')
      .maybeSingle();
    try {
      const list = data?.setting_value ? JSON.parse(data.setting_value) : null;
      if (Array.isArray(list) && list.every((x) => typeof x === 'string')) {
        setCategories(list);
        if (!list.includes(bulkCategory)) setBulkCategory(list[0] || 'Ambient');
        if (!list.includes(bulkParsedCategory)) setBulkParsedCategory(list[0] || 'Ambient');
      }
    } catch {}
  };

  const saveCategorySettings = async (list: string[]) => {
    const { data } = await supabase
      .from('app_settings')
      .select('id')
      .eq('setting_key', 'item_mapping_categories')
      .maybeSingle();
    if (data?.id) {
      await supabase
        .from('app_settings')
        .update({ setting_value: JSON.stringify(list), updated_at: new Date().toISOString() })
        .eq('id', data.id);
    } else {
      await supabase
        .from('app_settings')
        .insert([{ setting_key: 'item_mapping_categories', setting_value: JSON.stringify(list), updated_at: new Date().toISOString() }]);
    }
  };

  const addCategoryLocal = async () => {
    const name = newCategory.trim();
    if (!name) return;
    if (categories.includes(name)) {
      setNewCategory('');
      return;
    }
    const list = [...categories, name];
    setCategories(list);
    await saveCategorySettings(list);
    setNewCategory('');
    if (!bulkCategory) setBulkCategory(name);
    if (!bulkParsedCategory) setBulkParsedCategory(name);
  };

  const removeCategoryLocal = async (name: string) => {
    if (categories.length <= 1) return;
    const list = categories.filter((c) => c !== name);
    setCategories(list);
    await saveCategorySettings(list);
    const fallback = list[0] || 'Ambient';
    if (bulkCategory === name) setBulkCategory(fallback);
    if (bulkParsedCategory === name) setBulkParsedCategory(fallback);
    const updated = new Map(itemCategories);
    for (const [idx, cat] of updated.entries()) {
      if (cat === name) updated.set(idx, fallback);
    }
    setItemCategories(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const dataToSave = {
      supplier_id: formData.supplier_id || null,
      supplier_product_code: formData.supplier_product_code,
      supplier_product_name: formData.supplier_product_name,
      internal_product_id: null,
      category: formData.category,
      unit: formData.unit,
      unit_price: parseFloat(formData.unit_price) || 0,
      notes: formData.notes || null,
    };

    if (editingMapping) {
      const { error } = await supabase
        .from('product_mappings')
        .update(dataToSave)
        .eq('id', editingMapping.id);

      if (!error) {
        loadMappings();
        resetForm();
      }
    } else {
      const { error } = await supabase
        .from('product_mappings')
        .insert([dataToSave]);

      if (!error) {
        loadMappings();
        resetForm();
      }
    }
  };

  const handleEdit = (mapping: ProductMapping) => {
    setEditingMapping(mapping);
    setFormData({
      supplier_id: mapping.supplier_id || '',
      supplier_product_code: mapping.supplier_product_code,
      supplier_product_name: mapping.supplier_product_name,
      category: mapping.category,
      unit: mapping.unit,
      unit_price: (mapping as any).unit_price?.toString() || '0.00',
      notes: mapping.notes || '',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this mapping?')) {
      const { error } = await supabase
        .from('product_mappings')
        .delete()
        .eq('id', id);

      if (!error) loadMappings();
    }
  };

  const resetForm = () => {
    setFormData({
      supplier_id: '',
      supplier_product_code: '',
      supplier_product_name: '',
      category: 'Ambient',
      unit: 'CASE',
      unit_price: '0.00',
      notes: '',
    });
    setEditingMapping(null);
    setShowAddForm(false);
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
      const items = await parseInvoiceLineItems(file);
      setParsedItems(items);
      const unmappedIdx: number[] = items
        .map((it, i) => ({ it, i }))
        .filter(({ it }) => !mappings.some(m => m.supplier_product_code.toLowerCase() === it.productCode.toLowerCase()))
        .map(({ i }) => i);
      setSelectedItems(new Set(unmappedIdx));

      const defaultCategories = new Map<number, string>();
      const def = categories[0] || 'Ambient';
      items.forEach((_, i) => defaultCategories.set(i, def));
      setItemCategories(defaultCategories);

      const unmapped = items.filter(item => {
        return !mappings.some(m =>
          m.supplier_product_code.toLowerCase() === item.productCode.toLowerCase()
        );
      });
      setUnmappedItems(unmapped);

      setShowBulkUpload(true);
      alert(`Found ${items.length} items (${unmapped.length} unmapped). Default selected: unmapped only.`);
    } catch (error) {
      console.error('Error parsing invoice:', error);
      alert('Failed to parse invoice');
    } finally {
      setUploadingInvoice(false);
      event.target.value = '';
    }
  };

  const handleBulkAdd = async () => {
    if (selectedItems.size === 0) {
      alert('Please select at least one item');
      return;
    }

    if (!formData.supplier_id) {
      alert('Please select a supplier for bulk upload');
      return;
    }

    const mappingsToInsert = Array.from(selectedItems).map(index => {
      const item = parsedItems[index];
      return {
        supplier_id: formData.supplier_id,
        supplier_product_code: item.productCode,
        supplier_product_name: item.productName,
        internal_product_id: null,
        category: itemCategories.get(index) || 'Ambient',
        unit: 'CASE',
        unit_price: item.pricePerUnit || 0,
        notes: `Unit from invoice: ${item.unit}`,
      };
    });

    const { error } = await supabase
      .from('product_mappings')
      .insert(mappingsToInsert);

    if (!error) {
      loadMappings();
      setShowBulkUpload(false);
      setParsedItems([]);
      setSelectedItems(new Set());
      setItemCategories(new Map());
      alert(`Successfully added ${mappingsToInsert.length} mappings!`);
    } else {
      console.error('Error adding mappings:', error);
      alert('Error adding mappings: ' + error.message);
    }
  };

  const toggleItemSelection = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const toggleMappingSelection = (id: string) => {
    const newSelected = new Set(selectedMappings);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedMappings(newSelected);
  };

  const handleBulkCategoryChange = async () => {
    if (selectedMappings.size === 0) {
      alert('Please select at least one mapping');
      return;
    }

    const updates = Array.from(selectedMappings).map(id =>
      supabase
        .from('product_mappings')
        .update({ category: bulkCategory })
        .eq('id', id)
    );

    await Promise.all(updates);
    loadMappings();
    setSelectedMappings(new Set());
    setShowBulkActions(false);
    alert(`Updated ${updates.length} mappings to ${bulkCategory}`);
  };

  const handleBulkDelete = async () => {
    if (selectedMappings.size === 0) {
      alert('Please select at least one mapping');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedMappings.size} mappings?`)) {
      return;
    }

    const { error } = await supabase
      .from('product_mappings')
      .delete()
      .in('id', Array.from(selectedMappings));

    if (!error) {
      loadMappings();
      setSelectedMappings(new Set());
      setShowBulkActions(false);
      alert(`Deleted ${selectedMappings.size} mappings`);
    }
  };

  const filteredMappings = mappings.filter((m) => {
    const matchesSearch =
      m.supplier_product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.supplier_product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.products?.name || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSupplier = !filterSupplier || m.supplier_id === filterSupplier;

    return matchesSearch && matchesSupplier;
  });

  const units = ['CASE', 'SINGLE', 'KG', 'LITER', 'PACK', 'BOX'];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Item Mapping</h1>
        <p className="text-gray-500 mt-1">Map supplier product codes to your internal products</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex gap-3">
          <Package className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-blue-900">What is Item Mapping?</p>
            <p className="text-sm text-blue-800 mt-1">
              Item mapping links supplier-specific product codes and names to your internal product catalog.
              This is essential for accurate stock counting and ordering when different suppliers use different codes for the same item.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by code or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <label className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 cursor-pointer">
            <Upload className="w-5 h-5" />
            {uploadingInvoice ? 'Uploading...' : 'Bulk Upload from Invoice'}
            <input
              type="file"
              accept="application/pdf"
              onChange={handleInvoiceUpload}
              disabled={uploadingInvoice}
              className="hidden"
            />
          </label>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Mapping
          </button>
        </div>
      </div>

      {showBulkUpload && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Bulk Upload from Invoice</h2>

          {unmappedItems.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-yellow-900">Unmapped Items Detected</p>
                  <p className="text-sm text-yellow-800 mt-1">
                    {unmappedItems.length} items from this invoice are not yet mapped in your system.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Supplier (applies to all selected items)</label>
            <select
              value={formData.supplier_id}
              onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
              required
              className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Select Supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="text-sm text-gray-500 mt-1">Set individual categories for each item in the table below (defaults to Ambient)</p>
          </div>

          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">
                Select Items to Map ({selectedItems.size} selected)
              </label>
              <div className="flex gap-2 items-center">
                <button
                  onClick={() => setSelectedItems(new Set(parsedItems.map((_, i) => i)))}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedItems(new Set(unmappedItems.map(item =>
                    parsedItems.findIndex(p => p.productCode === item.productCode)
                  ).filter(i => i !== -1)))}
                  className="text-sm text-orange-600 hover:text-orange-800"
                >
                  Select Unmapped Only
                </button>
                <button
                  onClick={() => setSelectedItems(new Set())}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear All
                </button>
                <div className="w-px h-4 bg-gray-300" />
                <select
                  value={bulkParsedCategory || (categories[0] || 'Ambient')}
                  onChange={(e) => setBulkParsedCategory(e.target.value)}
                  className="text-sm px-2 py-1 border border-gray-300 rounded"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const chosen = bulkParsedCategory || (categories[0] || 'Ambient');
                    const updated = new Map(itemCategories);
                    Array.from(selectedItems).forEach((idx) => updated.set(idx, chosen));
                    setItemCategories(updated);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Apply Category to Selected
                </button>
                <div className="w-px h-4 bg-gray-300" />
                <button
                  onClick={() => setManageCategoriesOpen(!manageCategoriesOpen)}
                  className="text-sm text-gray-700 hover:text-gray-900"
                >
                  {manageCategoriesOpen ? 'Hide Categories' : 'Manage Categories'}
                </button>
              </div>
            </div>

            {manageCategoriesOpen && (
              <div className="mb-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="New category"
                    className="px-2 py-1 border border-gray-300 rounded"
                  />
                  <button onClick={addCategoryLocal} className="px-3 py-1 bg-blue-600 text-white rounded">Add</button>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {categories.map((c) => (
                    <span key={c} className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white border text-sm">
                      <span>{c}</span>
                      <button onClick={() => removeCategoryLocal(c)} className="text-red-600">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      <input
                        type="checkbox"
                        checked={selectedItems.size === parsedItems.length && parsedItems.length > 0}
                        onChange={() => {
                          if (selectedItems.size === parsedItems.length) {
                            setSelectedItems(new Set());
                          } else {
                            setSelectedItems(new Set(parsedItems.map((_, i) => i)));
                          }
                        }}
                        className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                      />
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Code</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Product Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Unit Price</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Notes</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {parsedItems.map((item, index) => {
                    const isUnmapped = unmappedItems.some(u => u.productCode === item.productCode);
                    return (
                      <tr key={index} className={isUnmapped ? 'bg-yellow-50' : ''}>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={selectedItems.has(index)}
                            onChange={() => toggleItemSelection(index)}
                            className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-4 py-2 text-sm font-mono">{item.productCode}</td>
                        <td className="px-4 py-2 text-sm">{item.productName}</td>
                        <td className="px-4 py-2 text-sm font-semibold text-green-700">£{item.pricePerUnit.toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">Unit from invoice: {item.unit}</td>
                        <td className="px-4 py-2">
                          <select
                            value={itemCategories.get(index) || 'Ambient'}
                            onChange={(e) => {
                              const newCategories = new Map(itemCategories);
                              newCategories.set(index, e.target.value);
                              setItemCategories(newCategories);
                            }}
                            className="text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
                          >
                            {categories.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {isUnmapped ? (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                              Not Mapped
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                              Already Mapped
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleBulkAdd}
              disabled={selectedItems.size === 0 || !formData.supplier_id}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Add {selectedItems.size} Mappings
            </button>
            <button
              onClick={() => {
                setShowBulkUpload(false);
                setParsedItems([]);
                setSelectedItems(new Set());
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingMapping ? 'Edit Mapping' : 'Add New Mapping'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
                <select
                  value={formData.supplier_id}
                  onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Supplier Product Code</label>
                <input
                  type="text"
                  value={formData.supplier_product_code}
                  onChange={(e) => setFormData({ ...formData, supplier_product_code: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., BNZ-12345"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Supplier Product Name</label>
                <input
                  type="text"
                  value={formData.supplier_product_name}
                  onChange={(e) => setFormData({ ...formData, supplier_product_name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., Salmon Fillet 1kg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unit</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {units.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unit Price (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.unit_price}
                  onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Any additional notes..."
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                {editingMapping ? 'Update Mapping' : 'Add Mapping'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showBulkActions && selectedMappings.size > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Bulk Actions ({selectedMappings.size} selected)
          </h3>
          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Change Category</label>
              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleBulkCategoryChange}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Update Category
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              Delete Selected
            </button>
            <button
              onClick={() => {
                setSelectedMappings(new Set());
                setShowBulkActions(false);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">
            Product Mappings ({filteredMappings.length})
          </h2>
          {selectedMappings.size > 0 ? (
            <button
              onClick={() => setShowBulkActions(!showBulkActions)}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm"
            >
              {showBulkActions ? 'Hide' : 'Show'} Bulk Actions ({selectedMappings.size})
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (selectedMappings.size === filteredMappings.length) {
                    setSelectedMappings(new Set());
                  } else {
                    setSelectedMappings(new Set(filteredMappings.map(m => m.id)));
                  }
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {selectedMappings.size === filteredMappings.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  <input
                    type="checkbox"
                    checked={selectedMappings.size === filteredMappings.length && filteredMappings.length > 0}
                    onChange={() => {
                      if (selectedMappings.size === filteredMappings.length) {
                        setSelectedMappings(new Set());
                      } else {
                        setSelectedMappings(new Set(filteredMappings.map(m => m.id)));
                      }
                    }}
                    className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredMappings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    No mappings found. Add your first mapping to get started.
                  </td>
                </tr>
              ) : (
                filteredMappings.map((mapping) => (
                  <tr key={mapping.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedMappings.has(mapping.id)}
                        onChange={() => toggleMappingSelection(mapping.id)}
                        className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{mapping.suppliers?.name || '-'}</td>
                    <td className="px-6 py-4 text-sm font-mono text-gray-900">{mapping.supplier_product_code}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{mapping.supplier_product_name}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                        {mapping.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{mapping.unit}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{mapping.notes || '-'}</td>
                    <td className="px-6 py-4 text-sm text-right">
                      <button
                        onClick={() => handleEdit(mapping)}
                        className="text-blue-600 hover:text-blue-800 mr-3"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(mapping.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
