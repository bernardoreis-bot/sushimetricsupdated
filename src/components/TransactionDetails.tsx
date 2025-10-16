import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Plus, Trash2, Package, AlertCircle } from 'lucide-react';

interface Transaction {
  id: string;
  transaction_date: string;
  amount: number;
  invoice_number?: string;
  reference?: string;
  notes?: string;
  sites?: { name: string };
  suppliers?: { name: string };
  transaction_categories?: { name: string; code: string };
}

interface InvoiceItem {
  id: string;
  item_name: string;
  item_code?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  category?: string;
}

interface TransactionDetailsProps {
  transaction: Transaction;
  onClose: () => void;
  onUpdate: () => void;
}

export default function TransactionDetails({ transaction, onClose, onUpdate }: TransactionDetailsProps) {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);

  const [newItem, setNewItem] = useState({
    item_name: '',
    item_code: '',
    quantity: 0,
    unit_price: 0,
    category: 'Other'
  });

  useEffect(() => {
    loadItems();
  }, [transaction.id]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('transaction_id', transaction.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const lineTotal = newItem.quantity * newItem.unit_price;

      const { error } = await supabase
        .from('invoice_items')
        .insert({
          transaction_id: transaction.id,
          item_name: newItem.item_name,
          item_code: newItem.item_code || null,
          quantity: newItem.quantity,
          unit_price: newItem.unit_price,
          line_total: lineTotal,
          category: newItem.category
        });

      if (error) throw error;

      setSuccess('Item added successfully');
      setNewItem({ item_name: '', item_code: '', quantity: 0, unit_price: 0, category: 'Other' });
      setShowAddItem(false);
      loadItems();
      onUpdate();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const { error } = await supabase
        .from('invoice_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      setSuccess('Item deleted successfully');
      loadItems();
      onUpdate();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const totalItems = items.reduce((sum, item) => sum + item.line_total, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Transaction Details</h2>
            <p className="text-sm text-gray-500 mt-1">
              {transaction.invoice_number || 'No invoice number'} - {new Date(transaction.transaction_date).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Transaction Info */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Supplier</div>
              <div className="text-sm font-medium text-gray-900 mt-1">
                {transaction.suppliers?.name || 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Site</div>
              <div className="text-sm font-medium text-gray-900 mt-1">
                {transaction.sites?.name || 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Category</div>
              <div className="text-sm font-medium text-gray-900 mt-1">
                {transaction.transaction_categories?.name || 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Total Amount</div>
              <div className="text-lg font-bold text-gray-900 mt-1">
                £{transaction.amount.toFixed(2)}
              </div>
            </div>
          </div>
          {transaction.notes && (
            <div className="mt-4">
              <div className="text-xs text-gray-500 uppercase font-semibold">Notes</div>
              <div className="text-sm text-gray-700 mt-1">{transaction.notes}</div>
            </div>
          )}
        </div>

        {/* Messages */}
        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        {/* Items List */}
        <div className="flex-1 overflow-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Line Items ({items.length})
            </h3>
            <button
              onClick={() => setShowAddItem(!showAddItem)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>

          {/* Add Item Form */}
          {showAddItem && (
            <form onSubmit={handleAddItem} className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Item Name</label>
                  <input
                    type="text"
                    value={newItem.item_name}
                    onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Item Code</label>
                  <input
                    type="text"
                    value={newItem.item_code}
                    onChange={(e) => setNewItem({ ...newItem, item_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Unit Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newItem.unit_price}
                    onChange={(e) => setNewItem({ ...newItem, unit_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
                >
                  Add Item
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddItem(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Items Table */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading items...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">No line items yet</p>
              <p className="text-sm text-gray-500 mt-1">Click "Add Item" to add items to this transaction</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Item Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Code</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Quantity</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Unit Price</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Total</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.item_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{item.item_code || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">£{item.unit_price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">£{item.line_total.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      Total Line Items:
                    </td>
                    <td className="px-4 py-3 text-right text-lg font-bold text-gray-900">
                      £{totalItems.toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                  {Math.abs(totalItems - transaction.amount) > 0.01 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-right text-xs text-gray-600">
                        Difference from transaction total:
                      </td>
                      <td className="px-4 py-2 text-right text-sm font-semibold text-orange-600">
                        £{(transaction.amount - totalItems).toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
