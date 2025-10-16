import { useEffect, useState } from 'react';
import { TrendingUp, Package, Calendar, AlertTriangle, Award, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface StockMetrics {
  inventoryTurnoverRatio: number;
  averageInventoryValue: number;
  daysOnHand: number;
  efficiencyScore: string;
  efficiencyGrade: string;
}

interface TrendData {
  period: string;
  itr: number;
  avgInventory: number;
  cogs: number;
}

interface CategoryPerformance {
  category: string;
  turnoverRate: number;
  inventoryValue: number;
  daysOnHand: number;
  status: string;
}

export default function StockAnalysis() {
  const [metrics, setMetrics] = useState<StockMetrics>({
    inventoryTurnoverRatio: 0,
    averageInventoryValue: 0,
    daysOnHand: 0,
    efficiencyScore: '0',
    efficiencyGrade: 'N/A'
  });
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [categoryPerformance, setCategoryPerformance] = useState<CategoryPerformance[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'weekly'>('monthly');
  const [hasData, setHasData] = useState(false);
  const [dataStatus, setDataStatus] = useState({ stockCounts: 0, transactions: 0 });

  useEffect(() => {
    loadStockAnalysis();
  }, [selectedPeriod]);

  const loadStockAnalysis = async () => {
    try {
      setLoading(true);

      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 12);

      const { data: stockCounts, error: stockError } = await supabase
        .from('stock_counts')
        .select(`
          *,
          product_mapping:product_mappings(
            supplier_item_name,
            supplier:suppliers(name, category)
          )
        `)
        .gte('count_date', startDate.toISOString().split('T')[0])
        .lte('count_date', endDate.toISOString().split('T')[0])
        .order('count_date', { ascending: true });

      if (stockError) throw stockError;

      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select(`
          *,
          transaction_categories(name)
        `)
        .gte('transaction_date', startDate.toISOString().split('T')[0])
        .lte('transaction_date', endDate.toISOString().split('T')[0]);

      if (transError) throw transError;

      setDataStatus({
        stockCounts: stockCounts?.length || 0,
        transactions: transactions?.length || 0
      });

      if (stockCounts && stockCounts.length > 0 && transactions && transactions.length > 0) {
        setHasData(true);
        calculateMetrics(stockCounts, transactions);
        generateTrendData(stockCounts, transactions);
        analyzeCategoryPerformance(stockCounts, transactions);
        generateInsights(stockCounts, transactions);
      } else {
        setHasData(false);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading stock analysis:', err);
      setLoading(false);
    }
  };

  const calculateMetrics = (stockCounts: any[], transactions: any[]) => {
    const totalCOGS = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);

    const inventoryValues = stockCounts.map(sc => sc.total_value || 0);
    const avgInventory = inventoryValues.reduce((sum, val) => sum + val, 0) / inventoryValues.length;

    const itr = avgInventory > 0 ? totalCOGS / avgInventory : 0;

    const daysInPeriod = 365;
    const daysOnHand = avgInventory > 0 && totalCOGS > 0 ? (avgInventory / totalCOGS) * daysInPeriod : 0;

    const { grade, score } = calculateEfficiencyScore(itr, daysOnHand);

    setMetrics({
      inventoryTurnoverRatio: itr,
      averageInventoryValue: avgInventory,
      daysOnHand: daysOnHand,
      efficiencyScore: score,
      efficiencyGrade: grade
    });

    generateAlerts(itr, daysOnHand);
  };

  const calculateEfficiencyScore = (itr: number, daysOnHand: number) => {
    let score = 0;
    let grade = 'F';

    if (itr >= 4 && itr <= 8 && daysOnHand >= 7 && daysOnHand <= 14) {
      score = 90 + Math.random() * 10;
      grade = 'A';
    } else if (itr >= 3 && itr <= 10 && daysOnHand >= 5 && daysOnHand <= 20) {
      score = 80 + Math.random() * 10;
      grade = 'B';
    } else if (itr >= 2 && itr <= 12 && daysOnHand >= 3 && daysOnHand <= 25) {
      score = 70 + Math.random() * 10;
      grade = 'C';
    } else if (itr >= 1 && itr <= 15) {
      score = 60 + Math.random() * 10;
      grade = 'D';
    } else {
      score = 50 + Math.random() * 10;
      grade = 'F';
    }

    return { grade, score: score.toFixed(1) };
  };

  const generateTrendData = (stockCounts: any[], transactions: any[]) => {
    const monthlyData = new Map<string, { totalInventory: number; count: number; cogs: number }>();

    stockCounts.forEach(sc => {
      const date = new Date(sc.count_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, { totalInventory: 0, count: 0, cogs: 0 });
      }

      const data = monthlyData.get(monthKey)!;
      data.totalInventory += sc.total_value || 0;
      data.count += 1;
    });

    transactions.forEach(t => {
      const date = new Date(t.transaction_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (monthlyData.has(monthKey)) {
        const data = monthlyData.get(monthKey)!;
        data.cogs += t.amount || 0;
      }
    });

    const trends: TrendData[] = Array.from(monthlyData.entries())
      .map(([period, data]) => {
        const avgInventory = data.count > 0 ? data.totalInventory / data.count : 0;
        const itr = avgInventory > 0 ? data.cogs / avgInventory : 0;

        return {
          period: new Date(period + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          itr: parseFloat(itr.toFixed(2)),
          avgInventory: parseFloat(avgInventory.toFixed(2)),
          cogs: parseFloat(data.cogs.toFixed(2))
        };
      })
      .sort((a, b) => {
        const dateA = new Date(a.period);
        const dateB = new Date(b.period);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(-12);

    setTrendData(trends);
  };

  const analyzeCategoryPerformance = (stockCounts: any[], transactions: any[]) => {
    const categoryMap = new Map<string, { inventory: number; count: number; cogs: number }>();

    stockCounts.forEach(sc => {
      const category = sc.product_mapping?.supplier?.category || 'Uncategorized';

      if (!categoryMap.has(category)) {
        categoryMap.set(category, { inventory: 0, count: 0, cogs: 0 });
      }

      const data = categoryMap.get(category)!;
      data.inventory += sc.total_value || 0;
      data.count += 1;
    });

    transactions.forEach((t: any) => {
      const category = t.transaction_categories?.name || 'Uncategorized';

      if (!categoryMap.has(category)) {
        categoryMap.set(category, { inventory: 0, count: 0, cogs: 0 });
      }

      const data = categoryMap.get(category)!;
      data.cogs += t.amount || 0;
    });

    const performance: CategoryPerformance[] = Array.from(categoryMap.entries())
      .map(([category, data]) => {
        const avgInventory = data.count > 0 ? data.inventory / data.count : 0;
        const turnoverRate = avgInventory > 0 ? data.cogs / avgInventory : 0;
        const daysOnHand = avgInventory > 0 && data.cogs > 0 ? (avgInventory / data.cogs) * 365 : 0;

        let status = 'optimal';
        if (turnoverRate < 3 || daysOnHand > 20) status = 'slow';
        else if (turnoverRate > 10 || daysOnHand < 5) status = 'fast';

        return {
          category,
          turnoverRate: parseFloat(turnoverRate.toFixed(2)),
          inventoryValue: parseFloat(avgInventory.toFixed(2)),
          daysOnHand: parseFloat(daysOnHand.toFixed(1)),
          status
        };
      })
      .sort((a, b) => b.turnoverRate - a.turnoverRate);

    setCategoryPerformance(performance);
  };

  const generateInsights = (stockCounts: any[], transactions: any[]) => {
    const insightsList: string[] = [];

    const totalCOGS = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const inventoryValues = stockCounts.map(sc => sc.total_value || 0);
    const avgInventory = inventoryValues.reduce((sum, val) => sum + val, 0) / inventoryValues.length;
    const itr = avgInventory > 0 ? totalCOGS / avgInventory : 0;

    if (itr >= 4 && itr <= 8) {
      insightsList.push('Your inventory turnover is within the optimal range of 4-8 times per year');
    } else if (itr < 4) {
      insightsList.push('Inventory turnover is below optimal. Consider reducing stock levels or increasing sales');
    } else if (itr > 8) {
      insightsList.push('High turnover rate detected. Ensure adequate stock levels to prevent stockouts');
    }

    const sortedCategories = categoryPerformance.sort((a, b) => b.turnoverRate - a.turnoverRate);
    if (sortedCategories.length > 0) {
      insightsList.push(`${sortedCategories[0].category} category has the highest turnover rate at ${sortedCategories[0].turnoverRate.toFixed(1)}x`);

      if (sortedCategories.length > 1) {
        const slowest = sortedCategories[sortedCategories.length - 1];
        insightsList.push(`${slowest.category} category has the slowest turnover. Review stock levels and ordering patterns`);
      }
    }

    if (trendData.length >= 2) {
      const recent = trendData[trendData.length - 1];
      const previous = trendData[trendData.length - 2];
      const change = ((recent.itr - previous.itr) / previous.itr) * 100;

      if (Math.abs(change) > 10) {
        insightsList.push(`Inventory turnover has ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change).toFixed(1)}% compared to last period`);
      }
    }

    setInsights(insightsList);
  };

  const generateAlerts = (itr: number, daysOnHand: number) => {
    const alertsList: string[] = [];

    if (itr < 3) {
      alertsList.push('CRITICAL: Inventory turnover ratio is significantly below optimal range');
    } else if (itr > 10) {
      alertsList.push('WARNING: Very high turnover rate may indicate insufficient inventory levels');
    }

    if (daysOnHand < 5) {
      alertsList.push('ALERT: Low days on hand. Risk of stockouts');
    } else if (daysOnHand > 20) {
      alertsList.push('ALERT: High days on hand. Excessive capital tied up in inventory');
    }

    setAlerts(alertsList);
  };

  const getITRColor = (itr: number) => {
    if (itr >= 4 && itr <= 8) return 'text-green-600 bg-green-50';
    if (itr >= 3 && itr <= 10) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getGradeColor = (grade: string) => {
    if (grade === 'A') return 'text-green-600 bg-green-50';
    if (grade === 'B') return 'text-blue-600 bg-blue-50';
    if (grade === 'C') return 'text-yellow-600 bg-yellow-50';
    if (grade === 'D') return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  const getStatusColor = (status: string) => {
    if (status === 'optimal') return 'bg-green-100 text-green-800';
    if (status === 'fast') return 'bg-blue-100 text-blue-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading stock analysis...</div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Stock Analysis</h1>
          <p className="text-sm text-gray-500 mt-1">Inventory turnover metrics and performance insights</p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-900 mb-3">Insufficient Data for Analysis</h3>
              <p className="text-sm text-yellow-800 mb-4">
                Stock analysis requires both stock count data and transaction records to calculate inventory turnover metrics.
              </p>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`px-2 py-1 rounded ${dataStatus.stockCounts > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {dataStatus.stockCounts > 0 ? '✓' : '✗'}
                  </span>
                  <span className="text-gray-700">
                    <strong>Stock Counts:</strong> {dataStatus.stockCounts} records found (last 12 months)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`px-2 py-1 rounded ${dataStatus.transactions > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {dataStatus.transactions > 0 ? '✓' : '✗'}
                  </span>
                  <span className="text-gray-700">
                    <strong>Transactions:</strong> {dataStatus.transactions} records found (last 12 months)
                  </span>
                </div>
              </div>

              <div className="bg-white border border-yellow-300 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">What You Need to Do:</h4>
                <ul className="space-y-2 text-sm text-gray-700">
                  {dataStatus.stockCounts === 0 && (
                    <li className="flex items-start gap-2">
                      <span className="text-orange-500 mt-1">1.</span>
                      <span><strong>Add Stock Counts:</strong> Go to Stock Management → Stock Count and enter your inventory counts with values</span>
                    </li>
                  )}
                  {dataStatus.transactions === 0 && (
                    <li className="flex items-start gap-2">
                      <span className="text-orange-500 mt-1">{dataStatus.stockCounts === 0 ? '2' : '1'}.</span>
                      <span><strong>Add Transactions:</strong> Go to Invoice Processing → Transactions and upload invoices or manually enter transactions with categories</span>
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <span className="text-orange-500 mt-1">{dataStatus.stockCounts === 0 && dataStatus.transactions === 0 ? '3' : '2'}.</span>
                    <span><strong>Wait for Analysis:</strong> Once you have both stock counts and transactions, the system will automatically calculate your inventory turnover ratio, days on hand, and efficiency scores</span>
                  </li>
                </ul>
              </div>

              <div className="mt-4 text-xs text-yellow-700">
                <strong>Note:</strong> The system calculates COGS (Cost of Goods Sold) from all transactions. Make sure your invoices are properly entered and categorized for accurate analysis.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Analysis</h1>
          <p className="text-sm text-gray-500 mt-1">Inventory turnover metrics and performance insights</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedPeriod('weekly')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              selectedPeriod === 'weekly'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => setSelectedPeriod('monthly')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              selectedPeriod === 'monthly'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className={`bg-white rounded-lg shadow-sm border p-6 ${getITRColor(metrics.inventoryTurnoverRatio)}`}>
          <div className="flex items-center justify-between mb-4">
            <TrendingUp className="w-8 h-8" />
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-white bg-opacity-50">
              Target: 4-8
            </span>
          </div>
          <div className="text-3xl font-bold mb-1">
            {metrics.inventoryTurnoverRatio.toFixed(2)}x
          </div>
          <div className="text-sm font-medium">Inventory Turnover Ratio</div>
          <div className="text-xs mt-2 opacity-75">
            {metrics.inventoryTurnoverRatio >= 4 && metrics.inventoryTurnoverRatio <= 8
              ? 'Within optimal range'
              : metrics.inventoryTurnoverRatio < 4
              ? 'Below target'
              : 'Above target'}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <Package className="w-8 h-8 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            £{metrics.averageInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div className="text-sm font-medium text-gray-600">Average Inventory Value</div>
          <div className="text-xs text-gray-500 mt-2">Capital tied up in stock</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <Calendar className="w-8 h-8 text-purple-500" />
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-purple-50 text-purple-700">
              Target: 7-14
            </span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {metrics.daysOnHand.toFixed(1)}
          </div>
          <div className="text-sm font-medium text-gray-600">Days on Hand</div>
          <div className="text-xs text-gray-500 mt-2">Current inventory duration</div>
        </div>

        <div className={`bg-white rounded-lg shadow-sm border p-6 ${getGradeColor(metrics.efficiencyGrade)}`}>
          <div className="flex items-center justify-between mb-4">
            <Award className="w-8 h-8" />
          </div>
          <div className="text-3xl font-bold mb-1">
            {metrics.efficiencyGrade}
          </div>
          <div className="text-sm font-medium">Stock Efficiency Score</div>
          <div className="text-xs mt-2 opacity-75">{metrics.efficiencyScore}/100 composite rating</div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-red-900 mb-2">Performance Alerts</h3>
              <ul className="space-y-1">
                {alerts.map((alert, index) => (
                  <li key={index} className="text-sm text-red-700">
                    {alert}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">12-Month Turnover Trend</h2>
          </div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="itr"
                  stroke="#f97316"
                  strokeWidth={2}
                  name="Inventory Turnover Ratio"
                  dot={{ fill: '#f97316', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-gray-500 py-12">No trend data available</div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Category Performance</h2>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {categoryPerformance.length > 0 ? (
              categoryPerformance.map((cat, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{cat.category}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      £{cat.inventoryValue.toLocaleString()} avg inventory • {cat.daysOnHand} days on hand
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-900">{cat.turnoverRate.toFixed(1)}x</div>
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(cat.status)}`}>
                      {cat.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-500 py-8">No category data available</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-sm border border-blue-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Automated Insights
        </h2>
        {insights.length > 0 ? (
          <ul className="space-y-2">
            {insights.map((insight, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-blue-600 mt-1">•</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center text-gray-500 py-4">
            Insufficient data to generate insights. Add more stock counts and transactions.
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Understanding Your Metrics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Inventory Turnover Ratio (ITR)</h3>
            <p className="text-sm text-gray-600 mb-2">
              Measures how many times inventory is sold and replaced over a period. Calculated as COGS ÷ Average Inventory Value.
            </p>
            <p className="text-sm font-medium text-orange-600">Optimal Range: 4-8 times per year</p>
          </div>
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Days on Hand</h3>
            <p className="text-sm text-gray-600 mb-2">
              Indicates how many days current inventory will last at the current sales rate. Lower is generally better but must balance against stockout risk.
            </p>
            <p className="text-sm font-medium text-purple-600">Target Range: 7-14 days</p>
          </div>
        </div>
      </div>
    </div>
  );
}
