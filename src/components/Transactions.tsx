import { useState, useEffect } from 'react';
import { Plus, Calendar, Package, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Purchase {
  id: string;
  purchase_date: string;
  supplier_name: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  category: string;
}

interface WeeklySales {
  id: string;
  week_start_date: string;
  week_end_date: string;
  total_sales: number;
  labor_cost: number;
}

export default function Transactions() {
  const [activeTab, setActiveTab] = useState<'purchases' | 'weekly'>('purchases');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [weeklySales, setWeeklySales] = useState<WeeklySales[]>([]);
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showAddWeekly, setShowAddWeekly] = useState(false);

  const [newPurchase, setNewPurchase] = useState({
    purchase_date: new Date().toISOString().split('T')[0],
    supplier_name: '',
    item_name: '',
    quantity: '',
    unit_price: '',
    category: 'fish',
  });

  const [newWeekly, setNewWeekly] = useState({
    week_start_date: '',
    week_end_date: '',
    total_sales: '',
    labor_cost: '',
  });

  useEffect(() => {
    loadPurchases();
    loadWeeklySales();
  }, []);

  const loadPurchases = async () => {
    const { data, error } = await supabase
      .from('purchases')
      .select('*')
      .order('purchase_date', { ascending: false });

    if (!error && data) {
      setPurchases(data);
    }
  };

  const loadWeeklySales = async () => {
    const { data, error } = await supabase
      .from('weekly_sales')
      .select('*')
      .order('week_end_date', { ascending: false });

    if (!error && data) {
      setWeeklySales(data);
    }
  };

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();

    const quantity = parseFloat(newPurchase.quantity) || 0;
    const unitPrice = parseFloat(newPurchase.unit_price) || 0;
    const totalAmount = quantity * unitPrice;

    const { error } = await supabase.from('purchases').insert([
      {
        purchase_date: newPurchase.purchase_date,
        supplier_name: newPurchase.supplier_name,
        item_name: newPurchase.item_name,
        quantity,
        unit_price: unitPrice,
        total_amount: totalAmount,
        category: newPurchase.category,
      },
    ]);

    if (!error) {
      setNewPurchase({
        purchase_date: new Date().toISOString().split('T')[0],
        supplier_name: '',
        item_name: '',
        quantity: '',
        unit_price: '',
        category: 'fish',
      });
      setShowAddPurchase(false);
      loadPurchases();
    }
  };

  const handleAddWeekly = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.from('weekly_sales').insert([
      {
        week_start_date: newWeekly.week_start_date,
        week_end_date: newWeekly.week_end_date,
        total_sales: parseFloat(newWeekly.total_sales) || 0,
        labor_cost: parseFloat(newWeekly.labor_cost) || 0,
      },
    ]);

    if (!error) {
      setNewWeekly({
        week_start_date: '',
        week_end_date: '',
        total_sales: '',
        labor_cost: '',
      });
      setShowAddWeekly(false);
      loadWeeklySales();
    }
  };

  const handleDeletePurchase = async (id: string) => {
    const { error } = await supabase.from('purchases').delete().eq('id', id);
    if (!error) {
      loadPurchases();
    }
  };

  const handleDeleteWeekly = async (id: string) => {
    const { error } = await supabase.from('weekly_sales').delete().eq('id', id);
    if (!error) {
      loadWeeklySales();
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
        <p className="text-gray-500 mt-1">Manage purchases and weekly sales data</p>
      </div>

      <div className="mb-6 flex gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('purchases')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'purchases'
              ? 'text-orange-600 border-b-2 border-orange-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Purchases & COGS
        </button>
        <button
          onClick={() => setActiveTab('weekly')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'weekly'
              ? 'text-orange-600 border-b-2 border-orange-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Weekly Sales & Labor
        </button>
      </div>

      {activeTab === 'purchases' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Purchase Records</h2>
            <button
              onClick={() => setShowAddPurchase(!showAddPurchase)}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Purchase
            </button>
          </div>

          {showAddPurchase && (
            <form onSubmit={handleAddPurchase} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="font-semibold text-gray-900 mb-4">New Purchase</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    value={newPurchase.purchase_date}
                    onChange={(e) => setNewPurchase({ ...newPurchase, purchase_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Supplier Name</label>
                  <input
                    type="text"
                    value={newPurchase.supplier_name}
                    onChange={(e) => setNewPurchase({ ...newPurchase, supplier_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Item Name</label>
                  <input
                    type="text"
                    value={newPurchase.item_name}
                    onChange={(e) => setNewPurchase({ ...newPurchase, item_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <select
                    value={newPurchase.category}
                    onChange={(e) => setNewPurchase({ ...newPurchase, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="fish">Fish</option>
                    <option value="rice">Rice</option>
                    <option value="vegetables">Vegetables</option>
                    <option value="supplies">Supplies</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPurchase.quantity}
                    onChange={(e) => setNewPurchase({ ...newPurchase, quantity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Unit Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPurchase.unit_price}
                    onChange={(e) => setNewPurchase({ ...newPurchase, unit_price: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                >
                  Save Purchase
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddPurchase(false)}
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
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Supplier</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Item</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Category</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Quantity</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Unit Price</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {purchases.map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{formatDate(purchase.purchase_date)}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{purchase.supplier_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{purchase.item_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 capitalize">{purchase.category}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 text-right">{purchase.quantity}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 text-right">{formatCurrency(purchase.unit_price)}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{formatCurrency(purchase.total_amount)}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleDeletePurchase(purchase.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'weekly' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Weekly Sales & Labor Data</h2>
            <button
              onClick={() => setShowAddWeekly(!showAddWeekly)}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Week
            </button>
          </div>

          {showAddWeekly && (
            <form onSubmit={handleAddWeekly} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="font-semibold text-gray-900 mb-4">New Weekly Data</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Week Start Date (Monday)</label>
                  <input
                    type="date"
                    value={newWeekly.week_start_date}
                    onChange={(e) => setNewWeekly({ ...newWeekly, week_start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Week End Date (Sunday)</label>
                  <input
                    type="date"
                    value={newWeekly.week_end_date}
                    onChange={(e) => setNewWeekly({ ...newWeekly, week_end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Total Sales</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newWeekly.total_sales}
                    onChange={(e) => setNewWeekly({ ...newWeekly, total_sales: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Labor Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newWeekly.labor_cost}
                    onChange={(e) => setNewWeekly({ ...newWeekly, labor_cost: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                >
                  Save Weekly Data
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddWeekly(false)}
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
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Week Start</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Week End</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total Sales</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Labor Cost</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Labor %</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {weeklySales.map((week) => {
                    const laborPercent = week.total_sales > 0 ? (week.labor_cost / week.total_sales) * 100 : 0;
                    return (
                      <tr key={week.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">{formatDate(week.week_start_date)}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{formatDate(week.week_end_date)}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{formatCurrency(week.total_sales)}</td>
                        <td className="px-6 py-4 text-sm text-gray-900 text-right">{formatCurrency(week.labor_cost)}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-orange-600 text-right">{laborPercent.toFixed(2)}%</td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleDeleteWeekly(week.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
