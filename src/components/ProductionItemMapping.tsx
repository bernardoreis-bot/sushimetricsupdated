import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Link2, Trash2, Plus, AlertCircle } from 'lucide-react';

interface ProductionItemMapping {
  id: string;
  production_plan_name: string;
  powerbi_item_name: string;
  site_id: string | null;
  created_at: string;
}

interface Site {
  id: string;
  name: string;
}

export default function ProductionItemMapping() {
  const [mappings, setMappings] = useState<ProductionItemMapping[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [newMapping, setNewMapping] = useState({
    production_plan_name: '',
    powerbi_item_name: '',
    site_id: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadSites();
    loadMappings();
  }, []);

  const loadSites = async () => {
    const { data, error } = await supabase
      .from('sites')
      .select('id, name')
      .order('name');

    if (error) {
      console.error('Error loading sites:', error);
    } else {
      setSites(data || []);
    }
  };

  const loadMappings = async () => {
    const { data, error } = await supabase
      .from('production_item_mappings')
      .select('*')
      .order('production_plan_name');

    if (error) {
      console.error('Error loading mappings:', error);
      setError('Failed to load mappings');
    } else {
      setMappings(data || []);
    }
  };

  const addMapping = async () => {
    if (!newMapping.production_plan_name.trim() || !newMapping.powerbi_item_name.trim()) {
      setError('Both production plan name and inventory item name are required');
      return;
    }

    const { error } = await supabase
      .from('production_item_mappings')
      .insert({
        production_plan_name: newMapping.production_plan_name.trim(),
        powerbi_item_name: newMapping.powerbi_item_name.trim(),
        site_id: newMapping.site_id || null
      });

    if (error) {
      setError(`Failed to add mapping: ${error.message}`);
    } else {
      setSuccess('Mapping added successfully!');
      setNewMapping({ production_plan_name: '', powerbi_item_name: '', site_id: '' });
      loadMappings();
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const deleteMapping = async (id: string) => {
    const { error } = await supabase
      .from('production_item_mappings')
      .delete()
      .eq('id', id);

    if (error) {
      setError(`Failed to delete mapping: ${error.message}`);
    } else {
      setSuccess('Mapping deleted successfully!');
      loadMappings();
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const getSiteName = (siteId: string | null) => {
    if (!siteId) return 'All Sites';
    const site = sites.find(s => s.id === siteId);
    return site ? site.name : 'Unknown Site';
  };

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-2">
            <Link2 className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-800">Production Item Mapping</h1>
          </div>
          <p className="text-gray-600 mb-8">
            Map production plan item names to your inventory item names for accurate production sheet calculations.
            This is separate from stock count mappings.
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded">
              <p className="text-green-700 font-medium">{success}</p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Add New Mapping</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Production Plan Name
                </label>
                <input
                  type="text"
                  value={newMapping.production_plan_name}
                  onChange={(e) => setNewMapping({ ...newMapping, production_plan_name: e.target.value })}
                  placeholder="e.g., Salmon Nigiri Box"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  PowerBI Item Name
                </label>
                <input
                  type="text"
                  value={newMapping.powerbi_item_name}
                  onChange={(e) => setNewMapping({ ...newMapping, powerbi_item_name: e.target.value })}
                  placeholder="e.g., Salmon Nigiri"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Site (Optional)
                </label>
                <select
                  value={newMapping.site_id}
                  onChange={(e) => setNewMapping({ ...newMapping, site_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">All Sites</option>
                  {sites.map(site => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={addMapping}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Mapping
            </button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800">Current Mappings ({mappings.length})</h2>
            </div>

            {mappings.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">No mappings yet</p>
                <p className="text-sm">Create your first mapping to link production plan items with inventory items.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Production Plan Name</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">↔</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">PowerBI Item Name</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Site</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((mapping, index) => (
                      <tr key={mapping.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 text-gray-800 font-medium">{mapping.production_plan_name}</td>
                        <td className="px-6 py-4 text-blue-500 font-bold">→</td>
                        <td className="px-6 py-4 text-gray-800 font-medium">{mapping.powerbi_item_name}</td>
                        <td className="px-6 py-4 text-gray-600 text-sm">{getSiteName(mapping.site_id)}</td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => deleteMapping(mapping.id)}
                            className="text-red-600 hover:text-red-800 transition-colors"
                            title="Delete mapping"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h3 className="font-semibold text-amber-800 mb-2">💡 How This Works</h3>
            <ul className="text-sm text-gray-700 space-y-1 ml-4 list-disc">
              <li>Upload your production plan Excel file in the Production Sheet page</li>
              <li>If items don't automatically match, come here to create manual mappings</li>
              <li>Map the exact name from your production plan to the corresponding inventory item name</li>
              <li>Return to Production Sheet to see the matched items with a ✓ symbol</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
