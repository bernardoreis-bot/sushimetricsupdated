import { useState, useEffect } from 'react';
import { Plus, CreditCard as Edit2, Trash2, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  is_active: boolean;
  default_category_id: string | null;
  color: string;
}

interface Category {
  id: string;
  name: string;
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    is_active: true,
    default_category_id: '',
    color: 'orange',
  });

  useEffect(() => {
    loadSuppliers();
    loadCategories();
  }, []);

  const loadSuppliers = async () => {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name');

    if (!error && data) {
      setSuppliers(data);
    }
  };

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from('transaction_categories')
      .select('id, name')
      .order('name');

    if (!error && data) {
      setCategories(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingSupplier) {
      const { error } = await supabase
        .from('suppliers')
        .update({
          ...formData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingSupplier.id);

      if (!error) {
        resetForm();
        loadSuppliers();
      }
    } else {
      const { error } = await supabase.from('suppliers').insert([formData]);

      if (!error) {
        resetForm();
        loadSuppliers();
      }
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contact_person: supplier.contact_person,
      phone: supplier.phone,
      email: supplier.email,
      is_active: supplier.is_active,
      default_category_id: supplier.default_category_id || '',
      color: supplier.color || 'orange',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this supplier?')) {
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (!error) {
        loadSuppliers();
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      contact_person: '',
      phone: '',
      email: '',
      is_active: true,
      default_category_id: '',
      color: 'orange',
    });
    setEditingSupplier(null);
    setShowAddForm(false);
  };

  const colorOptions = [
    { value: 'blue', label: 'Blue', bgClass: 'bg-blue-500' },
    { value: 'orange', label: 'Orange', bgClass: 'bg-orange-500' },
    { value: 'green', label: 'Green', bgClass: 'bg-green-500' },
    { value: 'purple', label: 'Purple', bgClass: 'bg-purple-500' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Suppliers Management</h1>
        <p className="text-gray-500 mt-1">Manage your supplier contacts</p>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div className="text-sm text-gray-600">
          Total Suppliers: <span className="font-semibold">{suppliers.length}</span> | Active: <span className="font-semibold">{suppliers.filter(s => s.is_active).length}</span>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddForm(!showAddForm);
          }}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Supplier
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            {editingSupplier ? 'Edit Supplier' : 'New Supplier'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Supplier Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Contact Person</label>
              <input
                type="text"
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Default Category</label>
              <select
                value={formData.default_category_id}
                onChange={(e) => setFormData({ ...formData, default_category_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">No default category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
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
                <span className="text-sm font-medium text-gray-700">Active Supplier</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              {editingSupplier ? 'Update Supplier' : 'Create Supplier'}
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
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Supplier Name</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Color</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Default Category</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Contact Person</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {suppliers.map((supplier) => {
                const categoryName = categories.find(c => c.id === supplier.default_category_id)?.name;
                const colorOption = colorOptions.find(c => c.value === (supplier.color || 'orange'));
                return (
                <tr key={supplier.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">{supplier.name}</td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center">
                      <div className={`w-6 h-6 rounded ${colorOption?.bgClass}`} title={colorOption?.label} />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {categoryName ? (
                      <span className="inline-block text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">
                        {categoryName}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{supplier.contact_person || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{supplier.phone || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{supplier.email || '-'}</td>
                  <td className="px-6 py-4 text-center">
                    {supplier.is_active ? (
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
                        onClick={() => handleEdit(supplier)}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(supplier.id)}
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

      {suppliers.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Suppliers Yet</h3>
          <p className="text-gray-500 mb-4">Add your first supplier to get started</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Your First Supplier
          </button>
        </div>
      )}
    </div>
  );
}
