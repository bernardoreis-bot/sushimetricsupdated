import { useState, useEffect } from 'react';
import { Plus, CreditCard as Edit2, MapPin, Trash2, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Site {
  id: string;
  name: string;
  location: string;
  site_code: string;
  is_active: boolean;
}

export default function Sites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    site_code: '',
    is_active: true,
  });

  useEffect(() => {
    loadSites();
  }, []);

  const loadSites = async () => {
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .order('name');

    if (!error && data) {
      setSites(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingSite) {
      const { error } = await supabase
        .from('sites')
        .update({
          name: formData.name,
          location: formData.location,
          site_code: formData.site_code,
          is_active: formData.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingSite.id);

      if (!error) {
        resetForm();
        loadSites();
      }
    } else {
      const { error } = await supabase.from('sites').insert([formData]);

      if (!error) {
        resetForm();
        loadSites();
      }
    }
  };

  const handleEdit = (site: Site) => {
    setEditingSite(site);
    setFormData({
      name: site.name,
      location: site.location,
      site_code: site.site_code,
      is_active: site.is_active,
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string, siteCode: string) => {
    if (siteCode === 'ALL') {
      alert('Cannot delete "All Sites" - this is a system option used for dashboard aggregation.');
      return;
    }

    if (confirm('Are you sure you want to delete this site? This will also delete all associated transactions.')) {
      const { error } = await supabase.from('sites').delete().eq('id', id);
      if (!error) {
        loadSites();
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      location: '',
      site_code: '',
      is_active: true,
    });
    setEditingSite(null);
    setShowAddForm(false);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Sites Management</h1>
        <p className="text-gray-500 mt-1">Manage your kiosk locations</p>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div className="text-sm text-gray-600">
          Total Sites: <span className="font-semibold">{sites.length}</span> | Active: <span className="font-semibold">{sites.filter(s => s.is_active).length}</span>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddForm(!showAddForm);
          }}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Site
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            {editingSite ? 'Edit Site' : 'New Site'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Site Name <span className="text-red-500">*</span>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Site Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.site_code}
                onChange={(e) => setFormData({ ...formData, site_code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g., SITE001"
                required
                disabled={!!editingSite}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Location/Address</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="123 Main St, City, State"
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
                <span className="text-sm font-medium text-gray-700">Active Site</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              {editingSite ? 'Update Site' : 'Create Site'}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sites.map((site) => (
          <div
            key={site.id}
            className={`bg-white rounded-xl shadow-sm border-2 p-6 ${
              site.is_active ? 'border-gray-200' : 'border-gray-300 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Building2 className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{site.name}</h3>
                  <span className="text-xs text-gray-500 font-mono">{site.site_code}</span>
                </div>
              </div>
              {site.is_active ? (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                  Active
                </span>
              ) : (
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full font-semibold">
                  Inactive
                </span>
              )}
            </div>

            {site.location && (
              <div className="flex items-start gap-2 mb-4 text-sm text-gray-600">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{site.location}</span>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t border-gray-200">
              <button
                onClick={() => handleEdit(site)}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => handleDelete(site.id, site.site_code)}
                disabled={site.site_code === 'ALL'}
                className={`flex items-center justify-center px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  site.site_code === 'ALL'
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-red-50 hover:bg-red-100 text-red-600'
                }`}
                title={site.site_code === 'ALL' ? 'Cannot delete All Sites - system option' : 'Delete site'}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {sites.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Sites Yet</h3>
          <p className="text-gray-500 mb-4">Create your first kiosk site to get started</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Your First Site
          </button>
        </div>
      )}
    </div>
  );
}
