import { useState, useEffect } from 'react';
import { Save, TrendingUp, AlertTriangle, Package as PackageIcon, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Site {
  id: string;
  name: string;
  site_code: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  category: string;
  last_unit_price: number;
}

interface StockCount {
  id?: string;
  site_id: string;
  product_id: string;
  quantity: number;
  unit_value: number;
  count_date: string;
  notes: string;
}

interface OrderPrediction {
  product: Product;
  currentStock: number;
  avgWeeklyUsage: number;
  daysUntilZero: number;
  suggestedOrder: number;
}

export default function StockCount() {
  const [sites, setSites] = useState<Site[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('');
  const [stockCounts, setStockCounts] = useState<StockCount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [orderPredictions, setOrderPredictions] = useState<OrderPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'count' | 'predictions'>('count');

  useEffect(() => {
    loadSites();
    loadProducts();
  }, []);

  useEffect(() => {
    if (selectedSite) {
      loadStockCounts();
      loadOrderPredictions();
    }
  }, [selectedSite]);

  const loadSites = async () => {
    const { data } = await supabase
      .from('sites')
      .select('*')
      .neq('site_code', 'ALL')
      .eq('is_active', true)
      .order('name');

    if (data) {
      setSites(data);
      if (data.length > 0 && !selectedSite) {
        setSelectedSite(data[0].id);
      }
    }
  };

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('name');

    if (data) {
      setProducts(data);
    }
  };

  const loadStockCounts = async () => {
    if (!selectedSite) return;

    const today = new Date().toISOString().split('T')[0];

    const { data: existingCounts } = await supabase
      .from('stock_counts')
      .select('*')
      .eq('site_id', selectedSite)
      .eq('count_date', today);

    if (existingCounts && existingCounts.length > 0) {
      setStockCounts(existingCounts.map(c => ({
        id: c.id,
        site_id: c.site_id,
        product_id: c.product_id,
        quantity: Number(c.quantity),
        unit_value: Number(c.unit_value),
        count_date: c.count_date,
        notes: c.notes || ''
      })));
    } else {
      setStockCounts(products.map(p => ({
        site_id: selectedSite,
        product_id: p.id,
        quantity: 0,
        unit_value: p.last_unit_price,
        count_date: today,
        notes: ''
      })));
    }
  };

  const loadOrderPredictions = async () => {
    if (!selectedSite) return;

    setLoading(true);
    try {
      const today = new Date();
      const fourWeeksAgo = new Date(today);
      fourWeeksAgo.setDate(today.getDate() - 28);

      const { data: invoiceItems } = await supabase
        .from('invoice_items')
        .select('*, transactions!inner(site_id, transaction_date)')
        .eq('transactions.site_id', selectedSite)
        .gte('transactions.transaction_date', fourWeeksAgo.toISOString().split('T')[0]);

      const { data: currentStock } = await supabase
        .from('stock_counts')
        .select('*')
        .eq('site_id', selectedSite)
        .order('count_date', { ascending: false })
        .limit(100);

      const productUsage: { [key: string]: number } = {};

      invoiceItems?.forEach(item => {
        if (!productUsage[item.product_id]) {
          productUsage[item.product_id] = 0;
        }
        productUsage[item.product_id] += Number(item.quantity);
      });

      const predictions: OrderPrediction[] = [];

      for (const product of products) {
        const weeklyUsage = (productUsage[product.id] || 0) / 4;
        const latestStock = currentStock?.find(s => s.product_id === product.id);
        const currentQty = latestStock ? Number(latestStock.quantity) : 0;

        if (weeklyUsage > 0) {
          const daysUntilZero = currentQty > 0 ? (currentQty / (weeklyUsage / 7)) : 0;
          const suggestedOrder = weeklyUsage * 2;

          predictions.push({
            product,
            currentStock: currentQty,
            avgWeeklyUsage: weeklyUsage,
            daysUntilZero,
            suggestedOrder
          });
        }
      }

      predictions.sort((a, b) => a.daysUntilZero - b.daysUntilZero);
      setOrderPredictions(predictions);
    } catch (error) {
      console.error('Error loading predictions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (productId: string, value: string) => {
    const quantity = parseFloat(value) || 0;
    setStockCounts(prev =>
      prev.map(sc =>
        sc.product_id === productId
          ? { ...sc, quantity }
          : sc
      )
    );
  };

  const handleNotesChange = (productId: string, value: string) => {
    setStockCounts(prev =>
      prev.map(sc =>
        sc.product_id === productId
          ? { ...sc, notes: value }
          : sc
      )
    );
  };

  const saveStockCounts = async () => {
    if (!selectedSite) return;

    setLoading(true);
    try {
      const countsToSave = stockCounts.filter(sc => sc.quantity > 0);

      for (const count of countsToSave) {
        if (count.id) {
          await supabase
            .from('stock_counts')
            .update({
              quantity: count.quantity,
              unit_value: count.unit_value,
              notes: count.notes,
              updated_at: new Date().toISOString()
            })
            .eq('id', count.id);
        } else {
          await supabase
            .from('stock_counts')
            .insert({
              site_id: count.site_id,
              product_id: count.product_id,
              quantity: count.quantity,
              unit_value: count.unit_value,
              count_date: count.count_date,
              notes: count.notes
            });
        }
      }

      alert('Stock counts saved successfully!');
      loadStockCounts();
      loadOrderPredictions();
    } catch (error) {
      console.error('Error saving stock counts:', error);
      alert('Failed to save stock counts');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStockForProduct = (productId: string) => {
    return stockCounts.find(sc => sc.product_id === productId);
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Stock Count</h1>
        <p className="text-gray-600">Track inventory and get intelligent ordering predictions</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Site</label>
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="">Select a site...</option>
              {sites.map(site => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('count')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'count'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Stock Count
            </button>
            <button
              onClick={() => setActiveTab('predictions')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'predictions'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Order Predictions
            </button>
          </div>
        </div>
      </div>

      {!selectedSite ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <PackageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Please select a site to view stock counts</p>
        </div>
      ) : (
        <>
          {activeTab === 'count' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Current Stock</h2>
                  <button
                    onClick={saveStockCounts}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    <Save className="w-5 h-5" />
                    Save All Counts
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Code</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Product Name</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Unit</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Quantity</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                          <PackageIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                          <p className="font-semibold">No products found</p>
                          <p className="text-sm mt-2">Add products to your system to start tracking stock</p>
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map(product => {
                        const stock = getStockForProduct(product.id);
                        return (
                          <tr key={product.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-900 font-medium">{product.code}</td>
                            <td className="px-6 py-4 text-sm text-gray-900">{product.name}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{product.unit}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                                {product.category}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={stock?.quantity || 0}
                                onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                                className="w-24 px-3 py-2 text-right border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="text"
                                value={stock?.notes || ''}
                                onChange={(e) => handleNotesChange(product.id, e.target.value)}
                                placeholder="Add notes..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'predictions' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-6 h-6 text-orange-500" />
                  <h2 className="text-xl font-bold text-gray-900">Order Predictions</h2>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Based on the last 4 weeks of invoice data and current stock levels
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Product</th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Current Stock</th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Avg Weekly Usage</th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Days Until Zero</th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Suggested Order</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {orderPredictions.map((pred, index) => {
                      const isUrgent = pred.daysUntilZero < 7;
                      const isLow = pred.daysUntilZero >= 7 && pred.daysUntilZero < 14;

                      return (
                        <tr key={index} className={`hover:bg-gray-50 ${isUrgent ? 'bg-red-50' : isLow ? 'bg-yellow-50' : ''}`}>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            <div className="font-medium">{pred.product.name}</div>
                            <div className="text-xs text-gray-500">{pred.product.code}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-right text-gray-900">
                            {pred.currentStock.toFixed(1)}
                          </td>
                          <td className="px-6 py-4 text-sm text-right text-gray-600">
                            {pred.avgWeeklyUsage.toFixed(1)}
                          </td>
                          <td className="px-6 py-4 text-sm text-right">
                            <span className={`font-semibold ${isUrgent ? 'text-red-600' : isLow ? 'text-yellow-600' : 'text-green-600'}`}>
                              {Math.floor(pred.daysUntilZero)} days
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                            {pred.suggestedOrder.toFixed(1)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {isUrgent && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                <AlertTriangle className="w-3 h-3" />
                                Urgent
                              </span>
                            )}
                            {isLow && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                                <AlertTriangle className="w-3 h-3" />
                                Low
                              </span>
                            )}
                            {!isUrgent && !isLow && (
                              <span className="inline-flex items-center px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                OK
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {orderPredictions.length === 0 && (
                  <div className="p-12 text-center text-gray-500">
                    <PackageIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p>No predictions available yet</p>
                    <p className="text-sm mt-2">Upload invoices and perform stock counts to see predictions</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
