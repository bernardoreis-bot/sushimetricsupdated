import React, { useState, useEffect } from 'react';
import { Link, Plus, Trash2, Save, X, Upload, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ItemAlias {
  id: string;
  production_item_name: string;
  mapped_item_name: string;
  confidence_score: number;
  match_type: string;
  usage_count: number;
  last_used_at: string | null;
  notes: string | null;
  created_at: string;
}

interface ItemAliasManagerProps {
  onClose: () => void;
  onAliasAdded?: () => void;
}

export default function ItemAliasManager({ onClose, onAliasAdded }: ItemAliasManagerProps) {
  const [aliases, setAliases] = useState<ItemAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAlias, setNewAlias] = useState({
    production_item_name: '',
    mapped_item_name: '',
    notes: ''
  });
  const [error, setError] = useState('');

  useEffect(() => {
    loadAliases();
  }, []);

  const loadAliases = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('production_item_aliases')
        .select('*')
        .order('usage_count', { ascending: false });

      if (error) throw error;
      setAliases(data || []);
    } catch (err: any) {
      console.error('Error loading aliases:', err);
      setError('Failed to load aliases: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAlias = async () => {
    if (!newAlias.production_item_name.trim() || !newAlias.mapped_item_name.trim()) {
      alert('Please enter both production item name and mapped item name');
      return;
    }

    try {
      const { error } = await supabase
        .from('production_item_aliases')
        .insert({
          production_item_name: newAlias.production_item_name.trim(),
          mapped_item_name: newAlias.mapped_item_name.trim(),
          match_type: 'manual',
          confidence_score: 100,
          created_by: 'user',
          notes: newAlias.notes.trim() || null
        });

      if (error) throw error;

      setNewAlias({ production_item_name: '', mapped_item_name: '', notes: '' });
      setShowAddModal(false);
      await loadAliases();
      if (onAliasAdded) onAliasAdded();
      alert('Alias added successfully!');
    } catch (err: any) {
      console.error('Error adding alias:', err);
      alert('Failed to add alias: ' + err.message);
    }
  };

  const handleDeleteAlias = async (id: string) => {
    if (!confirm('Are you sure you want to delete this alias mapping?')) return;

    try {
      const { error } = await supabase
        .from('production_item_aliases')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await loadAliases();
      if (onAliasAdded) onAliasAdded();
      alert('Alias deleted successfully!');
    } catch (err: any) {
      console.error('Error deleting alias:', err);
      alert('Failed to delete alias: ' + err.message);
    }
  };

  const exportAliases = () => {
    const csvContent = [
      ['Production Item Name', 'Mapped Item Name', 'Match Type', 'Usage Count', 'Notes'].join(','),
      ...aliases.map(alias =>
        [
          `"${alias.production_item_name}"`,
          `"${alias.mapped_item_name}"`,
          alias.match_type,
          alias.usage_count,
          `"${alias.notes || ''}"`
        ].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `item-aliases-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importAliases = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n').slice(1); // Skip header
      const newAliases = [];

      for (const line of lines) {
        if (!line.trim()) continue;

        const match = line.match(/^"([^"]+)","([^"]+)"/);
        if (match) {
          newAliases.push({
            production_item_name: match[1],
            mapped_item_name: match[2],
            match_type: 'manual',
            confidence_score: 100,
            created_by: 'import'
          });
        }
      }

      if (newAliases.length === 0) {
        alert('No valid aliases found in file');
        return;
      }

      const { error } = await supabase
        .from('production_item_aliases')
        .insert(newAliases);

      if (error) throw error;

      await loadAliases();
      if (onAliasAdded) onAliasAdded();
      alert(`Successfully imported ${newAliases.length} aliases!`);
    } catch (err: any) {
      console.error('Error importing aliases:', err);
      alert('Failed to import aliases: ' + err.message);
    }

    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Link className="w-6 h-6 text-blue-600" />
              Item Alias Manager
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage mappings between production plan items and sales data items
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center gap-3 p-4 bg-gray-50 border-b border-gray-200">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Alias
          </button>
          <button
            onClick={exportAliases}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <label className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            Import CSV
            <input
              type="file"
              accept=".csv"
              onChange={importAliases}
              className="hidden"
            />
          </label>
          <div className="ml-auto text-sm text-gray-600">
            {aliases.length} alias{aliases.length !== 1 ? 'es' : ''} total
          </div>
        </div>

        {/* Aliases List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-600 mt-2">Loading aliases...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800">{error}</p>
            </div>
          ) : aliases.length === 0 ? (
            <div className="text-center py-12">
              <Link className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No aliases yet. Add your first mapping to get started!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {aliases.map(alias => (
                <div
                  key={alias.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-medium text-gray-900">{alias.production_item_name}</span>
                        <span className="text-gray-400">→</span>
                        <span className="font-medium text-blue-600">{alias.mapped_item_name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          {alias.match_type}
                        </span>
                        <span>Used {alias.usage_count} time{alias.usage_count !== 1 ? 's' : ''}</span>
                        {alias.last_used_at && (
                          <span>Last used: {new Date(alias.last_used_at).toLocaleDateString()}</span>
                        )}
                      </div>
                      {alias.notes && (
                        <p className="text-sm text-gray-600 mt-2 italic">{alias.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteAlias(alias.id)}
                      className="text-red-600 hover:text-red-800 p-2"
                      title="Delete alias"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Alias Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Add New Alias</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Production Item Name (from Excel)
                </label>
                <input
                  type="text"
                  value={newAlias.production_item_name}
                  onChange={(e) => setNewAlias({ ...newAlias, production_item_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Seaweed Salad"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mapped Item Name (from Power BI/Sales Data)
                </label>
                <input
                  type="text"
                  value={newAlias.mapped_item_name}
                  onChange={(e) => setNewAlias({ ...newAlias, mapped_item_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., YO! Seaweed Salad P1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={newAlias.notes}
                  onChange={(e) => setNewAlias({ ...newAlias, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Common product alias"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleAddAlias}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Alias
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
