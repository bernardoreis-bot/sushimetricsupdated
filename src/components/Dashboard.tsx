import { useEffect, useState } from 'react';
import { TrendingUp, DollarSign, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface WeeklySales {
  week_start_date: string;
  week_end_date: string;
  total_sales: number;
  labor_cost: number;
}

export default function Dashboard() {
  const [rolling4WeeksData, setRolling4WeeksData] = useState({
    laborCostPercent: 0,
    totalSales: 0,
    totalLabor: 0,
    cogsPercent: 0,
    totalCogs: 0,
    weekRange: '',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const today = new Date();
      const dayOfWeek = today.getDay();
      const isCompleteWeek = dayOfWeek === 0;

      const weeksToFetch = isCompleteWeek ? 4 : 5;

      const { data: weeklyData, error: weeklyError } = await supabase
        .from('weekly_sales')
        .select('*')
        .order('week_end_date', { ascending: false })
        .limit(weeksToFetch);

      if (weeklyError) throw weeklyError;

      let completedWeeks: WeeklySales[] = [];
      if (weeklyData && weeklyData.length > 0) {
        if (isCompleteWeek) {
          completedWeeks = weeklyData.slice(0, 4);
        } else {
          const lastWeekEndDate = new Date(weeklyData[0].week_end_date);
          if (lastWeekEndDate < today) {
            completedWeeks = weeklyData.slice(0, 4);
          } else {
            completedWeeks = weeklyData.slice(1, 5);
          }
        }
      }

      let totalSales = 0;
      let totalLabor = 0;
      let weekRange = '';

      if (completedWeeks.length > 0) {
        totalSales = completedWeeks.reduce((sum, week) => sum + Number(week.total_sales || 0), 0);
        totalLabor = completedWeeks.reduce((sum, week) => sum + Number(week.labor_cost || 0), 0);

        const oldestWeek = completedWeeks[completedWeeks.length - 1];
        const newestWeek = completedWeeks[0];
        weekRange = `${formatDate(oldestWeek.week_start_date)} - ${formatDate(newestWeek.week_end_date)}`;
      }

      const laborCostPercent = totalSales > 0 ? (totalLabor / totalSales) * 100 : 0;

      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      const { data: purchaseData, error: purchaseError } = await supabase
        .from('purchases')
        .select('total_amount')
        .gte('purchase_date', fourWeeksAgo.toISOString().split('T')[0]);

      if (purchaseError) throw purchaseError;

      const totalCogs = purchaseData?.reduce((sum, purchase) => sum + Number(purchase.total_amount || 0), 0) || 0;
      const cogsPercent = totalSales > 0 ? (totalCogs / totalSales) * 100 : 0;

      setRolling4WeeksData({
        laborCostPercent,
        totalSales,
        totalLabor,
        cogsPercent,
        totalCogs,
        weekRange,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Good Morning</h1>
        <p className="text-gray-500 mt-1">Here's your kiosk performance overview</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Rolling 4 Weeks Analytics</h2>
          <span className="text-sm text-gray-500">{rolling4WeeksData.weekRange}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-orange-50 rounded-lg p-6 border-2 border-orange-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-orange-500 rounded-lg">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-700">Labor Cost</h3>
            </div>
            <div className="mb-2">
              <div className="text-4xl font-bold text-orange-600">
                {rolling4WeeksData.laborCostPercent.toFixed(2)}%
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {formatCurrency(rolling4WeeksData.totalLabor)}
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-6 border-2 border-blue-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-700">Total Sales</h3>
            </div>
            <div className="text-4xl font-bold text-blue-600">
              {formatCurrency(rolling4WeeksData.totalSales)}
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-6 border-2 border-green-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-500 rounded-lg">
                <Package className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-700">COGS</h3>
            </div>
            <div className="mb-2">
              <div className="text-4xl font-bold text-green-600">
                {rolling4WeeksData.cogsPercent.toFixed(2)}%
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {formatCurrency(rolling4WeeksData.totalCogs)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Stats</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Average Weekly Sales</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(rolling4WeeksData.totalSales / 4)}
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Average Weekly Labor</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(rolling4WeeksData.totalLabor / 4)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
