import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Tag } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TransactionCategory {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  color: string;
}

export default function TransactionCategories() {
  const [categories, setCategories] = useState<TransactionCategory[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TransactionCategory | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    is_active: true,
    color: 'blue',
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from('transaction_categories')
      .select('*')
      .order('name');

    if (!error && data) {
      setCategories(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingCategory) {
      const { error } = await supabase
        .from('transaction_categories')
        .update({
          name: formData.name,
          code: formData.code,
          is_active: formData.is_active,
          color: formData.color,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingCategory.id);

      if (!error) {
        resetForm();
        loadCategories();
      }
    } else {
      const { error } = await supabase.from('transaction_categories').insert([formData]);

      if (!error) {
        resetForm();
        loadCategories();
      }
    }
  };

  const handleEdit = (category: TransactionCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      code: category.code,
      is_active: category.is_active,
      color: category.color || 'blue',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this category? Transactions using this category will have it unlinked.')) {
      const { error } = await supabase.from('transaction_categories').delete().eq('id', id);
      if (!error) {
        loadCategories();
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      is_active: true,
      color: 'blue',
    });
    setEditingCategory(null);
    setShowAddForm(false);
  };

  const colorOptions = [
    { value: 'blue', label: 'Blue', bgClass: 'bg-blue-500', textClass: 'text-blue-500' },
    { value: 'orange', label: 'Orange', bgClass: 'bg-orange-500', textClass: 'text-orange-500' },
    { value: 'green', label: 'Green', bgClass: 'bg-green-500', textClass: 'text-green-500' },
    { value: 'purple', label: 'Purple', bgClass: 'bg-purple-500', textClass: 'text-purple-500' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Transaction Categories</h1>
        <p className="text-gray-500 mt-1">Manage transaction categories for your business</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-2">Dashboard Category Codes:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded border border-blue-200">
              <p className="font-semibold">SALES</p>
              <p className="text-xs mt-1">Revenue/Income - Shown in blue on dashboard</p>
            </div>
            <div className="bg-white p-3 rounded border border-blue-200">
              <p className="font-semibold">LABOUR</p>
              <p className="text-xs mt-1">Staff costs - Shown in orange on dashboard</p>
            </div>
            <div className="bg-white p-3 rounded border border-blue-200">
              <p className="font-semibold">FOOD</p>
              <p className="text-xs mt-1">Food Cost of Goods Sold (COGS) - Shown in green on dashboard</p>
            </div>
            <div className="bg-white p-3 rounded border border-blue-200">
              <p className="font-semibold">PACKAGING</p>
              <p className="text-xs mt-1">Packaging COGS - Shown in purple on dashboard</p>
            </div>
          </div>
          <p className="text-xs mt-3 text-blue-700">
            <strong>Note:</strong> The CODE field connects categories to the dashboard analytics. Use the exact codes above for dashboard integration.
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div className="text-sm text-gray-600">
          Total Categories: <span className="font-semibold">{categories.length}</span> | Active: <span className="font-semibold">{categories.filter(c => c.is_active).length}</span>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddForm(!showAddForm);
          }}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Category
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            {editingCategory ? 'Edit Category' : 'New Category'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g., Labour Cost"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g., LABOUR"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Use SALES, LABOUR, FOOD, or PACKAGING for dashboard integration. Custom codes will work but won't appear in analytics.
              </p>
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
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-orange-500 focus:ring-orange-500 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Active Category</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              {editingCategory ? 'Update Category' : 'Create Category'}
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
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Category Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Code</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Color</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {categories.map((category) => {
                const colorOption = colorOptions.find(c => c.value === (category.color || 'blue'));
                return (
                <tr key={category.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">{category.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-mono">{category.code}</td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center">
                      <div className={`w-6 h-6 rounded ${colorOption?.bgClass}`} title={colorOption?.label} />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {category.is_active ? (
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
                        onClick={() => handleEdit(category)}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(category.id)}
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

      {categories.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200 mt-6">
          <Tag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Categories Yet</h3>
          <p className="text-gray-500 mb-4">Add your first transaction category to get started</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Your First Category
          </button>
        </div>
      )}
    </div>
  );
}
