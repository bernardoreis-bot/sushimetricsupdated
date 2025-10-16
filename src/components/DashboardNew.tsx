import { useEffect, useState } from 'react';
import { PoundSterling, Package, Building2, Users, ShoppingBag, ChevronLeft, ChevronRight, Save, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Site {
  id: string;
  name: string;
  site_code?: string;
}

interface Analytics {
  totalSales: number;
  totalLabour: number;
  totalFood: number;
  totalPackaging: number;
  labourPercent: number;
  foodPercent: number;
  packagingPercent: number;
  weekRange: string;
  avgWeeklySales: number;
  avgWeeklyLabour: number;
  avgWeeklyFood: number;
  avgWeeklyPackaging: number;
}

interface Comparison {
  metricType: string;
  currentTotal: number;
  currentAvg: number;
  previousMonthTotal: number;
  previousMonthAvg: number;
  previousYearTotal: number;
  previousYearAvg: number;
  momChangePercent: number;
  yoyChangePercent: number;
}

interface MonthlyData {
  month: string;
  sales: number;
  labour: number;
  food: number;
  packaging: number;
}

interface WeeklyData {
  week: string;
  sales: number;
  labour: number;
  food: number;
  packaging: number;
}

// Helper function to format date as YYYY-MM-DD without timezone issues
const formatDateForDB = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const InfoTooltip = ({ title, formula }: { title: string; formula: string }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="ml-2 p-1 hover:bg-gray-200 rounded-full transition-colors"
      >
        <Info className="w-4 h-4 text-gray-500" />
      </button>
      {showTooltip && (
        <div className="absolute z-50 w-80 p-4 bg-gray-900 text-white text-sm rounded-lg shadow-xl left-6 top-0">
          <div className="font-semibold mb-2">{title}</div>
          <div className="whitespace-pre-line">{formula}</div>
        </div>
      )}
    </div>
  );
};

export default function DashboardNew() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [currentWeekEnd, setCurrentWeekEnd] = useState<Date | null>(null);
  const [analytics, setAnalytics] = useState<Analytics>({
    totalSales: 0,
    totalLabour: 0,
    totalFood: 0,
    totalPackaging: 0,
    labourPercent: 0,
    foodPercent: 0,
    packagingPercent: 0,
    weekRange: '',
    avgWeeklySales: 0,
    avgWeeklyLabour: 0,
    avgWeeklyFood: 0,
    avgWeeklyPackaging: 0,
  });
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSites();
  }, []);

  useEffect(() => {
    if (currentWeekEnd) {
      loadAnalytics();
    } else {
      // Get last completed Sunday (NOT including today if today is Sunday)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const currentDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      const daysToSubtract = currentDayOfWeek === 0 ? 7 : currentDayOfWeek;

      const lastSunday = new Date(today);
      lastSunday.setDate(today.getDate() - daysToSubtract);
      lastSunday.setHours(0, 0, 0, 0);

      setCurrentWeekEnd(lastSunday);
    }
    loadMonthlyData();
    loadWeeklyData();
  }, [selectedSite, currentWeekEnd]);

  useEffect(() => {
    if (analytics.totalSales > 0) {
      loadComparisons();
    }
  }, [analytics]);

  const loadSites = async () => {
    const { data, error } = await supabase
      .from('sites')
      .select('id, name, site_code')
      .eq('is_active', true)
      .order('name');

    console.log('=== LOAD SITES ===');
    console.log('All sites from DB:', data);

    if (!error && data) {
      const actualSites = data.filter(s => s.site_code !== 'ALL');
      console.log('Actual sites (excluding ALL):', actualSites);
      setSites(actualSites);
    }
  };

  const loadAnalytics = async () => {
    if (!currentWeekEnd) return;

    setLoading(true);
    try {
      console.log('\n=== LOAD ANALYTICS ===');
      console.log('Selected Site:', selectedSite);
      console.log('Sites array length:', sites.length);
      console.log('Current Week End:', currentWeekEnd);

      // Calculate the start of the 4-week period
      // currentWeekEnd is the last completed Sunday
      // We need to go back exactly 4 weeks (28 days) to get to the Monday of 4 weeks ago
      const fourWeeksStart = new Date(currentWeekEnd);
      fourWeeksStart.setDate(currentWeekEnd.getDate() - 27); // Go back 27 days to the Monday

      // Use formatDateForDB to avoid timezone issues
      const startDateStr = formatDateForDB(fourWeeksStart);
      const endDateStr = formatDateForDB(currentWeekEnd);

      console.log('=== DATE CALCULATION ===');
      console.log('Current week end object:', currentWeekEnd);
      console.log('Four weeks start object:', fourWeeksStart);
      console.log('Start date string:', startDateStr);
      console.log('End date string:', endDateStr);
      console.log('Expected: 2025-09-08 to 2025-10-05');

      const { data: allSitesRecord, error: siteError } = await supabase
        .from('sites')
        .select('id')
        .eq('site_code', 'ALL')
        .maybeSingle();

      if (siteError) throw siteError;
      const allSitesId = allSitesRecord?.id;
      console.log('All Sites ID:', allSitesId);

      let query = supabase
        .from('transactions')
        .select('id, transaction_date, site_id, category_id, amount, transaction_categories(code), sites!inner(site_code)')
        .gte('transaction_date', startDateStr)
        .lte('transaction_date', endDateStr);

      console.log('=== QUERY SETUP ===');
      console.log('Filtering: transaction_date >= ', startDateStr);
      console.log('Filtering: transaction_date <= ', endDateStr);
      console.log('Selected site:', selectedSite);

      if (selectedSite !== 'all') {
        query = query.or(`site_id.eq.${selectedSite},site_id.eq.${allSitesId}`);
        console.log('Adding site filter for specific site');
      } else {
        console.log('No site filter - fetching ALL sites');
      }

      const { data: transactions, error } = await query;

      if (error) throw error;

      console.log('=== QUERY RESULTS ===');
      console.log('Total transactions found:', transactions?.length);
      console.log('First transaction date:', transactions?.[0]?.transaction_date);
      console.log('Last transaction date:', transactions?.[transactions.length - 1]?.transaction_date);

      const activeSiteCount = sites.length;
      console.log('Active site count for division:', activeSiteCount);

      let totalSales = 0;
      let totalLabour = 0;
      let totalFood = 0;
      let totalPackaging = 0;

      transactions?.forEach(t => {
        const amount = Number(t.amount) || 0;
        const code = t.transaction_categories?.code;
        const isAllSites = t.sites?.site_code === 'ALL';

        const adjustedAmount = (selectedSite !== 'all' && isAllSites && activeSiteCount > 0)
          ? amount / activeSiteCount
          : amount;

        console.log(`Transaction: Date=${t.transaction_date}, Code=${code}, Site=${t.sites?.site_code}, Amount=£${amount}, Adjusted=£${adjustedAmount.toFixed(2)}`);

        if (isAllSites) {
          console.log(`  ⚠️ ALL SITES transaction: ${code} = £${amount}, adjusted to £${adjustedAmount.toFixed(2)}`);
        }

        if (code === 'SALES') {
          totalSales += adjustedAmount;
        } else if (code === 'LABOUR') {
          totalLabour += adjustedAmount;
        } else if (code === 'FOOD') {
          totalFood += adjustedAmount;
        } else if (code === 'PACKAGING') {
          totalPackaging += adjustedAmount;
        }
      });

      console.log('=== FINAL TOTALS ===');
      console.log('Sales:', formatCurrency(totalSales));
      console.log('Labour:', formatCurrency(totalLabour));
      console.log('Food:', formatCurrency(totalFood));
      console.log('Packaging:', formatCurrency(totalPackaging));

      const labourPercent = totalSales > 0 ? (totalLabour / totalSales) * 100 : 0;
      const foodPercent = totalSales > 0 ? (totalFood / totalSales) * 100 : 0;
      const packagingPercent = totalSales > 0 ? (totalPackaging / totalSales) * 100 : 0;

      console.log('=== PERCENTAGES ===');
      console.log(`Labour: ${labourPercent.toFixed(2)}% (${formatCurrency(totalLabour)} / ${formatCurrency(totalSales)})`);
      console.log(`Food: ${foodPercent.toFixed(2)}% (${formatCurrency(totalFood)} / ${formatCurrency(totalSales)})`);
      console.log(`Packaging: ${packagingPercent.toFixed(2)}% (${formatCurrency(totalPackaging)} / ${formatCurrency(totalSales)})`);

      const avgWeeklySales = totalSales / 4;
      const avgWeeklyLabour = totalLabour / 4;
      const avgWeeklyFood = totalFood / 4;
      const avgWeeklyPackaging = totalPackaging / 4;

      const displayStartDate = fourWeeksStart.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const displayEndDate = currentWeekEnd.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

      setAnalytics({
        totalSales,
        totalLabour,
        totalFood,
        totalPackaging,
        labourPercent,
        foodPercent,
        packagingPercent,
        avgWeeklySales,
        avgWeeklyLabour,
        avgWeeklyFood,
        avgWeeklyPackaging,
        weekRange: `${displayStartDate} - ${displayEndDate}`,
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMonthlyData = async () => {
    try {
      console.log('\\n=== LOAD MONTHLY DATA ===');

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];
      console.log('Monthly data from:', sixMonthsAgoStr);

      const { data: allSitesRecord } = await supabase
        .from('sites')
        .select('id')
        .eq('site_code', 'ALL')
        .maybeSingle();

      const allSitesId = allSitesRecord?.id;
      console.log('All Sites ID for monthly:', allSitesId);

      let query = supabase
        .from('transactions')
        .select('id, transaction_date, site_id, category_id, amount, transaction_categories(code), sites!inner(site_code)')
        .gte('transaction_date', sixMonthsAgoStr);

      if (selectedSite !== 'all') {
        query = query.or(`site_id.eq.${selectedSite},site_id.eq.${allSitesId}`);
      }

      const { data: transactions, error } = await query;

      if (error) throw error;

      console.log('Monthly transactions found:', transactions?.length);

      const activeSiteCount = sites.length;
      console.log('Active site count for monthly division:', activeSiteCount);

      const monthlyMap: { [key: string]: { sales: number; labour: number; food: number; packaging: number } } = {};

      transactions?.forEach(t => {
        const date = new Date(t.transaction_date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyMap[monthKey]) {
          monthlyMap[monthKey] = { sales: 0, labour: 0, food: 0, packaging: 0 };
        }

        const amount = Number(t.amount) || 0;
        const code = t.transaction_categories?.code;
        const isAllSites = t.sites?.site_code === 'ALL';

        const adjustedAmount = (selectedSite !== 'all' && isAllSites && activeSiteCount > 0)
          ? amount / activeSiteCount
          : amount;

        if (isAllSites) {
          console.log(`Monthly ALL SITES: ${monthKey} ${code} = \u00a3${amount}, adjusted to \u00a3${adjustedAmount.toFixed(2)}`);        
        }

        if (code === 'SALES') {
          monthlyMap[monthKey].sales += adjustedAmount;
        } else if (code === 'LABOUR') {
          monthlyMap[monthKey].labour += adjustedAmount;
        } else if (code === 'FOOD') {
          monthlyMap[monthKey].food += adjustedAmount;
        } else if (code === 'PACKAGING') {
          monthlyMap[monthKey].packaging += adjustedAmount;
        }
      });

      const monthlyArray: MonthlyData[] = Object.keys(monthlyMap)
        .sort()
        .slice(-12)
        .map(key => {
          const [year, month] = key.split('-');
          const date = new Date(parseInt(year), parseInt(month) - 1);
          const monthName = date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

          return {
            month: monthName,
            sales: monthlyMap[key].sales,
            labour: monthlyMap[key].labour,
            food: monthlyMap[key].food,
            packaging: monthlyMap[key].packaging,
          };
        });

      setMonthlyData(monthlyArray);
    } catch (error) {
      console.error('Error loading monthly data:', error);
    }
  };

  const loadWeeklyData = async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - (52 * 7));

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      let query = supabase
        .from('transactions')
        .select('transaction_date, amount, transaction_categories(code), sites!inner(site_code)')
        .gte('transaction_date', startDateStr)
        .lte('transaction_date', endDateStr);

      if (selectedSite !== 'all') {
        query = query.or(`site_id.eq.${selectedSite},sites.site_code.eq.ALL`);
      }

      const { data: transactions, error } = await query;

      if (error) throw error;

      const { data: allSitesRecord } = await supabase
        .from('sites')
        .select('id, site_code')
        .eq('site_code', 'ALL')
        .maybeSingle();

      const activeSiteCount = sites.filter(s => s.site_code !== 'ALL').length;

      const weeklyMap: { [key: string]: { sales: number; labour: number; food: number; packaging: number } } = {};

      transactions?.forEach(t => {
        const date = new Date(t.transaction_date);
        const dayOfWeek = date.getDay();
        const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        const weekEnd = new Date(date);
        weekEnd.setDate(date.getDate() + daysToSunday);
        const weekKey = weekEnd.toISOString().split('T')[0];

        if (!weeklyMap[weekKey]) {
          weeklyMap[weekKey] = { sales: 0, labour: 0, food: 0, packaging: 0 };
        }

        const amount = Number(t.amount) || 0;
        const code = t.transaction_categories?.code;
        const isAllSites = t.sites?.site_code === 'ALL';

        const adjustedAmount = (selectedSite !== 'all' && isAllSites && activeSiteCount > 0)
          ? amount / activeSiteCount
          : amount;

        if (code === 'SALES') {
          weeklyMap[weekKey].sales += adjustedAmount;
        } else if (code === 'LABOUR') {
          weeklyMap[weekKey].labour += adjustedAmount;
        } else if (code === 'FOOD') {
          weeklyMap[weekKey].food += adjustedAmount;
        } else if (code === 'PACKAGING') {
          weeklyMap[weekKey].packaging += adjustedAmount;
        }
      });

      const weeklyArray: WeeklyData[] = Object.keys(weeklyMap)
        .sort()
        .slice(-52)
        .map(key => {
          const date = new Date(key);
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - 6);
          const weekLabel = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;

          return {
            week: weekLabel,
            sales: weeklyMap[key].sales,
            labour: weeklyMap[key].labour,
            food: weeklyMap[key].food,
            packaging: weeklyMap[key].packaging,
          };
        });

      setWeeklyData(weeklyArray);
    } catch (error) {
      console.error('Error loading weekly data:', error);
    }
  };

  const loadComparisons = async () => {
    if (!currentWeekEnd) return;

    try {
      console.log('\n=== LOAD COMPARISONS ===');

      const fourWeeksStart = new Date(currentWeekEnd);
      fourWeeksStart.setDate(currentWeekEnd.getDate() - 27);

      const previousMonthEnd = new Date(currentWeekEnd);
      previousMonthEnd.setDate(previousMonthEnd.getDate() - 28);
      const previousMonthStart = new Date(previousMonthEnd);
      previousMonthStart.setDate(previousMonthEnd.getDate() - 27);

      const previousYearEnd = new Date(currentWeekEnd);
      previousYearEnd.setFullYear(previousYearEnd.getFullYear() - 1);
      const previousYearStart = new Date(previousYearEnd);
      previousYearStart.setDate(previousYearEnd.getDate() - 27);

      const { data: allSitesRecord } = await supabase
        .from('sites')
        .select('id')
        .eq('site_code', 'ALL')
        .maybeSingle();

      const allSitesId = allSitesRecord?.id;
      const activeSiteCount = sites.length;

      const getMetrics = async (startDate: Date, endDate: Date) => {
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        let query = supabase
          .from('transactions')
          .select('*, transaction_categories(code), sites!inner(site_code)')
          .gte('transaction_date', startDateStr)
          .lte('transaction_date', endDateStr);

        if (selectedSite !== 'all') {
          query = query.or(`site_id.eq.${selectedSite},site_id.eq.${allSitesId}`);
        }

        const { data: transactions } = await query;

        let sales = 0, labour = 0, food = 0, packaging = 0;

        transactions?.forEach(t => {
          const amount = Number(t.amount) || 0;
          const code = t.transaction_categories?.code;
          const isAllSites = t.sites?.site_code === 'ALL';

          const adjustedAmount = (selectedSite !== 'all' && isAllSites && activeSiteCount > 0)
            ? amount / activeSiteCount
            : amount;

          if (code === 'SALES') sales += adjustedAmount;
          else if (code === 'LABOUR') labour += adjustedAmount;
          else if (code === 'FOOD') food += adjustedAmount;
          else if (code === 'PACKAGING') packaging += adjustedAmount;
        });

        return {
          salesTotal: sales,
          salesAvg: sales / 4,
          labourTotal: labour,
          labourAvg: labour / 4,
          foodTotal: food,
          foodAvg: food / 4,
          packagingTotal: packaging,
          packagingAvg: packaging / 4
        };
      };

      const previousMonth = await getMetrics(previousMonthStart, previousMonthEnd);
      const previousYear = await getMetrics(previousYearStart, previousYearEnd);

      const createComparison = (
        type: string,
        currTotal: number,
        currAvg: number,
        prevMonthTotal: number,
        prevMonthAvg: number,
        prevYearTotal: number,
        prevYearAvg: number
      ): Comparison => ({
        metricType: type,
        currentTotal: currTotal,
        currentAvg: currAvg,
        previousMonthTotal: prevMonthTotal,
        previousMonthAvg: prevMonthAvg,
        previousYearTotal: prevYearTotal,
        previousYearAvg: prevYearAvg,
        momChangePercent: prevMonthAvg > 0 ? ((currAvg - prevMonthAvg) / prevMonthAvg) * 100 : 0,
        yoyChangePercent: prevYearAvg > 0 ? ((currAvg - prevYearAvg) / prevYearAvg) * 100 : 0,
      });

      setComparisons([
        createComparison('sales', analytics.totalSales, analytics.avgWeeklySales, previousMonth.salesTotal, previousMonth.salesAvg, previousYear.salesTotal, previousYear.salesAvg),
        createComparison('labour', analytics.totalLabour, analytics.avgWeeklyLabour, previousMonth.labourTotal, previousMonth.labourAvg, previousYear.labourTotal, previousYear.labourAvg),
        createComparison('food', analytics.totalFood, analytics.avgWeeklyFood, previousMonth.foodTotal, previousMonth.foodAvg, previousYear.foodTotal, previousYear.foodAvg),
        createComparison('packaging', analytics.totalPackaging, analytics.avgWeeklyPackaging, previousMonth.packagingTotal, previousMonth.packagingAvg, previousYear.packagingTotal, previousYear.packagingAvg),
      ]);

      console.log('Comparisons loaded:', comparisons);
    } catch (error) {
      console.error('Error loading comparisons:', error);
    }
  };

  const saveSnapshot = async () => {
    if (!currentWeekEnd) return;

    setSaving(true);
    try {
      console.log('\n=== SAVE SNAPSHOT ===');

      const fourWeeksStart = new Date(currentWeekEnd);
      fourWeeksStart.setDate(currentWeekEnd.getDate() - 27);

      const siteIdToSave = selectedSite === 'all' ? null : selectedSite;

      const { data: existing } = await supabase
        .from('weekly_analytics_snapshots')
        .select('id')
        .eq('site_id', siteIdToSave)
        .eq('week_end_date', currentWeekEnd.toISOString().split('T')[0])
        .maybeSingle();

      const snapshotData = {
        site_id: siteIdToSave,
        week_end_date: currentWeekEnd.toISOString().split('T')[0],
        week_start_date: fourWeeksStart.toISOString().split('T')[0],
        total_sales: analytics.totalSales,
        total_labour: analytics.totalLabour,
        total_food: analytics.totalFood,
        total_packaging: analytics.totalPackaging,
        labour_percent: analytics.labourPercent,
        food_percent: analytics.foodPercent,
        packaging_percent: analytics.packagingPercent,
        avg_weekly_sales: analytics.avgWeeklySales,
        avg_weekly_labour: analytics.avgWeeklyLabour,
        avg_weekly_food: analytics.avgWeeklyFood,
        avg_weekly_packaging: analytics.avgWeeklyPackaging,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase
          .from('weekly_analytics_snapshots')
          .update(snapshotData)
          .eq('id', existing.id);
        console.log('Snapshot updated');
      } else {
        await supabase
          .from('weekly_analytics_snapshots')
          .insert(snapshotData);
        console.log('Snapshot created');
      }

      for (const comp of comparisons) {
        const { data: existingComp } = await supabase
          .from('weekly_comparisons')
          .select('id')
          .eq('site_id', siteIdToSave)
          .eq('week_end_date', currentWeekEnd.toISOString().split('T')[0])
          .eq('metric_type', comp.metricType)
          .maybeSingle();

        const compData = {
          site_id: siteIdToSave,
          week_end_date: currentWeekEnd.toISOString().split('T')[0],
          metric_type: comp.metricType,
          current_value: comp.currentValue,
          previous_month_value: comp.previousMonthValue,
          previous_year_value: comp.previousYearValue,
          mom_change_percent: comp.momChangePercent,
          yoy_change_percent: comp.yoyChangePercent,
        };

        if (existingComp) {
          await supabase
            .from('weekly_comparisons')
            .update(compData)
            .eq('id', existingComp.id);
        } else {
          await supabase
            .from('weekly_comparisons')
            .insert(compData);
        }
      }

      alert('Analytics snapshot saved successfully!');
    } catch (error) {
      console.error('Error saving snapshot:', error);
      alert('Error saving snapshot. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    if (!currentWeekEnd) return;

    const newWeekEnd = new Date(currentWeekEnd);
    if (direction === 'prev') {
      newWeekEnd.setDate(newWeekEnd.getDate() - 7);
    } else {
      newWeekEnd.setDate(newWeekEnd.getDate() + 7);
    }
    setCurrentWeekEnd(newWeekEnd);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Performance overview for your kiosks</p>
        </div>
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-gray-500" />
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 font-semibold"
          >
            <option value="all">All Sites</option>
            {sites.map(site => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Rolling 4 Weeks Analytics</h2>
            <p className="text-sm text-gray-600 mt-1">Based on 4 completed weeks only (partial weeks excluded)</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateWeek('prev')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Previous week"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <span className="text-sm text-gray-700 font-medium min-w-[200px] text-center">
                {analytics.weekRange}
              </span>
              <button
                onClick={() => navigateWeek('next')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Next week"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <button
              onClick={saveSnapshot}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Snapshot'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-blue-50 rounded-lg p-6 border-2 border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <PoundSterling className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-700">Total Sales</h3>
              </div>
              <InfoTooltip
                title="Rolling Sales"
                formula="Sum of all sales from the last 4 COMPLETED weeks.

Week 4 Sales + Week 3 Sales + Week 2 Sales + Week 1 Sales = Rolling Sales

Note: Only complete weeks are included. If today is Tuesday, this week is NOT included."
              />
            </div>
            <div className="text-4xl font-bold text-blue-600">
              {formatCurrency(analytics.totalSales)}
            </div>
            <div className="text-sm text-gray-600 mt-2">
              Avg per week: {formatCurrency(analytics.totalSales / 4)}
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-6 border-2 border-orange-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500 rounded-lg">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-700">Labour Cost</h3>
              </div>
              <InfoTooltip
                title="Labour Cost Percentage"
                formula="Labour Cost % over 4 weeks:

Rolling Labour Total / Rolling Sales Total × 100

Example: £30,000 labour ÷ £100,000 sales = 30% Labour Cost

This uses the sum of 4 complete weeks, not an average of weekly percentages."
              />
            </div>
            <div className="mb-2">
              <div className="text-4xl font-bold text-orange-600">
                {analytics.labourPercent.toFixed(2)}%
              </div>
              <div className="text-sm text-gray-600 mt-2">
                {formatCurrency(analytics.totalLabour)}
              </div>
            </div>
            <div className="text-sm text-gray-600 mt-2">
              Avg per week: {formatCurrency(analytics.avgWeeklyLabour)}
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-6 border-2 border-green-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500 rounded-lg">
                  <ShoppingBag className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-700">Food Cost</h3>
              </div>
              <InfoTooltip
                title="Food Cost Percentage"
                formula="Rolling Food Cost % over 4 weeks:

(Week 4 Food + Week 3 Food + Week 2 Food + Week 1 Food) / Rolling Sales × 100

This uses the sum of 4 complete weeks of food purchases divided by 4 complete weeks of sales."
              />
            </div>
            <div className="mb-2">
              <div className="text-4xl font-bold text-green-600">
                {analytics.foodPercent.toFixed(2)}%
              </div>
              <div className="text-sm text-gray-600 mt-2">
                {formatCurrency(analytics.totalFood)}
              </div>
            </div>
            <div className="text-sm text-gray-600 mt-2">
              Avg per week: {formatCurrency(analytics.avgWeeklyFood)}
            </div>
          </div>

          <div className="bg-amber-50 rounded-lg p-6 border-2 border-amber-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500 rounded-lg">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-700">Packaging Cost</h3>
              </div>
              <InfoTooltip
                title="Packaging Cost Percentage"
                formula="Rolling Packaging Cost % over 4 weeks:

(Week 4 Packaging + Week 3 Packaging + Week 2 Packaging + Week 1 Packaging) / Rolling Sales × 100

This uses the sum of 4 complete weeks of packaging purchases divided by 4 complete weeks of sales."
              />
            </div>
            <div className="mb-2">
              <div className="text-4xl font-bold text-amber-600">
                {analytics.packagingPercent.toFixed(2)}%
              </div>
              <div className="text-sm text-gray-600 mt-2">
                {formatCurrency(analytics.totalPackaging)}
              </div>
            </div>
            <div className="text-sm text-gray-600 mt-2">
              Avg per week: {formatCurrency(analytics.avgWeeklyPackaging)}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Performance Comparisons (4-Week Periods)</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Metric</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-l border-gray-300" colSpan={2}>Current Period</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-l border-gray-300" colSpan={2}>Previous 4 Weeks</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-l border-gray-300">Change</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-l border-gray-300" colSpan={2}>Same Period Last Year</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-l border-gray-300">Change</th>
              </tr>
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-600"></th>
                <th className="px-4 py-2 text-right text-xs text-gray-600 border-l border-gray-200">Total</th>
                <th className="px-4 py-2 text-right text-xs text-gray-600">Avg/Week</th>
                <th className="px-4 py-2 text-right text-xs text-gray-600 border-l border-gray-200">Total</th>
                <th className="px-4 py-2 text-right text-xs text-gray-600">Avg/Week</th>
                <th className="px-4 py-2 text-right text-xs text-gray-600 border-l border-gray-200">%</th>
                <th className="px-4 py-2 text-right text-xs text-gray-600 border-l border-gray-200">Total</th>
                <th className="px-4 py-2 text-right text-xs text-gray-600">Avg/Week</th>
                <th className="px-4 py-2 text-right text-xs text-gray-600 border-l border-gray-200">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {comparisons.map((comp, index) => {
                const getChangeColor = (percent: number) => {
                  if (comp.metricType === 'sales') {
                    return percent > 0 ? 'text-green-600' : 'text-red-600';
                  } else {
                    return percent < 0 ? 'text-green-600' : 'text-red-600';
                  }
                };

                const getChangeSymbol = (percent: number) => {
                  return percent > 0 ? '+' : '';
                };

                return (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 capitalize">{comp.metricType}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 border-l border-gray-200">
                      {formatCurrency(comp.currentTotal)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                      {formatCurrency(comp.currentAvg)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 border-l border-gray-200">
                      {formatCurrency(comp.previousMonthTotal)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {formatCurrency(comp.previousMonthAvg)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-semibold border-l border-gray-200 ${getChangeColor(comp.momChangePercent)}`}>
                      {getChangeSymbol(comp.momChangePercent)}{comp.momChangePercent.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700 border-l border-gray-200">
                      {formatCurrency(comp.previousYearTotal)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {formatCurrency(comp.previousYearAvg)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-semibold border-l border-gray-200 ${getChangeColor(comp.yoyChangePercent)}`}>
                      {getChangeSymbol(comp.yoyChangePercent)}{comp.yoyChangePercent.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Weekly Trend (Last 52 Weeks)</h2>
          {weeklyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10 }}
                  interval={Math.floor(weeklyData.length / 12)}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `£${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelStyle={{ color: '#000' }}
                />
                <Legend />
                <Line type="monotone" dataKey="sales" stroke="#3b82f6" name="Sales" strokeWidth={2} />
                <Line type="monotone" dataKey="labour" stroke="#f97316" name="Labour" strokeWidth={2} />
                <Line type="monotone" dataKey="food" stroke="#22c55e" name="Food" strokeWidth={2} />
                <Line type="monotone" dataKey="packaging" stroke="#f59e0b" name="Packaging" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-gray-500">
              No weekly data available yet. Add transactions to see the trend.
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Cost Breakdown</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Labour Cost</span>
                <span className="font-semibold text-orange-600">{analytics.labourPercent.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-orange-500 h-3 rounded-full transition-all"
                  style={{ width: `${Math.min(analytics.labourPercent, 100)}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Food Cost</span>
                <span className="font-semibold text-green-600">{analytics.foodPercent.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-green-500 h-3 rounded-full transition-all"
                  style={{ width: `${Math.min(analytics.foodPercent, 100)}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Packaging Cost</span>
                <span className="font-semibold text-amber-600">{analytics.packagingPercent.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-amber-500 h-3 rounded-full transition-all"
                  style={{ width: `${Math.min(analytics.packagingPercent, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-3">Weekly Averages</h3>
            <div className="space-y-2">
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm text-gray-600">Sales</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(analytics.totalSales / 4)}</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm text-gray-600">Labour</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(analytics.totalLabour / 4)}</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm text-gray-600">Food</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(analytics.totalFood / 4)}</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm text-gray-600">Packaging</span>
                <span className="text-sm font-bold text-gray-900">{formatCurrency(analytics.totalPackaging / 4)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
