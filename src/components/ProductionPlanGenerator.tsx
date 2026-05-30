import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, Settings, BarChart3, RefreshCw, Sun, Moon } from 'lucide-react';
import * as XLSX from 'xlsx';

interface UploadedRow {
  'Site Name'?: string;
  'Date'?: string;
  'Item Name'?: string;
  'Sales Volume'?: number;
  'Sales Value'?: number;
  'Production Quantity'?: number;
  'Item Type'?: string;
  'Transaction Type'?: string;
  'Price Type'?: string;
  'Department'?: string;
  'Discount'?: string;
}

interface CleanedRow {
  site: string;
  date: string;
  itemName: string;
  salesVolume: number;
  salesValue: number;
  productionQty: number;
}

const COLUMN_ALIASES: Record<string, string[]> = {
  'Site Name': ['site', 'store', 'location', 'site name', 'store name', 'location name', 'outlet'],
  'Date': ['date', 'day', 'transaction date', 'date time', 'posting date'],
  'Item Name': ['item', 'product', 'product name', 'item name', 'description', 'item description', 'product description'],
  'Sales Volume': ['sales volume', 'quantity', 'sales qty', 'volume', 'qty', 'units', 'sold'],
  'Sales Value': ['sales value', 'value', 'revenue', 'amount', 'total', 'price', 'sales'],
  'Production Quantity': ['production quantity', 'production', 'prod qty', 'made', 'produced', 'manufactured'],
  'Item Type': ['item type', 'type', 'category', 'product type', 'item category'],
  'Transaction Type': ['transaction type', 'trans type', 'tran type', 'trans'],
  'Price Type': ['price type', 'pricing type', 'price band'],
  'Discount': ['discount', 'disc', 'discount amount'],
};

function findColumn(row: Record<string, unknown>, field: string): string | null {
  const lowerField = field.toLowerCase();
  const aliases = COLUMN_ALIASES[field] || [lowerField];
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const found = keys.find(k => k.toLowerCase().trim() === alias);
    if (found) return found;
  }
  for (const alias of aliases) {
    const found = keys.find(k => k.toLowerCase().trim().includes(alias));
    if (found) return found;
  }
  return null;
}

function getRowValue(row: Record<string, unknown>, field: string): unknown {
  const col = findColumn(row, field);
  return col ? row[col] : undefined;
}

interface ProductInfo {
  name: string;
  normalizedName: string;
  avgDailySales: number;
  avgDailyProduction: number;
  productType: 'produced' | 'purchased';
  historyDays: number;
  category: string;
}

interface StorePlan {
  store: string;
  products: ProductPlan[];
}

interface ProductPlan {
  name: string;
  normalizedName: string;
  productType: 'produced' | 'purchased';
  avgDailySales: number;
  avgDailyProduction: number;
  smartBuffer: number;
  dailyPlan: { day: string; qty: number }[];
  weeklyTotal: number;
  category: string;
  isExcluded?: boolean;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const PRICE_BANDS = [
  { label: '< £3', max: 3, buffer: 1.35 },
  { label: '£3 - £5.99', min: 3, max: 5.99, buffer: 1.30 },
  { label: '£6 - £9.99', min: 6, max: 9.99, buffer: 1.20 },
  { label: '£10 - £14.99', min: 10, max: 14.99, buffer: 1.10 },
  { label: '£15+', min: 15, buffer: 1.05 },
];

const EXCLUDE_ITEM_TYPES = ['reduc', 'waste', 'void'];
const EXCLUDE_TRANSACTION_TYPES = ['reduc', 'void', 'refund'];
const EXCLUDE_PRICE_TYPES = ['reduc'];

function normalizeProductName(name: string): string {
  let n = name.trim();
  n = n.replace(/^(T1|T2|T3)[\s_-]+/i, '');
  n = n.replace(/[\s_-]+(T1|T2|T3)$/i, '');
  return n;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getPriceBand(salesValue: number, productionQty: number): number {
  const avgPrice = productionQty > 0 ? salesValue / productionQty : salesValue;
  for (const band of PRICE_BANDS) {
    if (band.label === '< £3' && avgPrice < 3) return band.buffer;
    if (band.max && avgPrice >= (band.min || 0) && avgPrice < band.max) return band.buffer;
    if (band.label === '£15+' && avgPrice >= 15) return band.buffer;
  }
  return 1.30;
}

function shouldExcludeRow(row: Record<string, unknown>): boolean {
  const itemType = String(getRowValue(row, 'Item Type') || '').toLowerCase();
  const transType = String(getRowValue(row, 'Transaction Type') || '').toLowerCase();
  const priceType = String(getRowValue(row, 'Price Type') || '').toLowerCase();
  const discount = String(getRowValue(row, 'Discount') || '').toLowerCase();

  if (EXCLUDE_ITEM_TYPES.some(t => itemType.includes(t))) return true;
  if (EXCLUDE_TRANSACTION_TYPES.some(t => transType.includes(t))) return true;
  if (EXCLUDE_PRICE_TYPES.some(t => priceType.includes(t))) return true;
  if (discount === 'yes' || discount === 'y') return true;
  return false;
}

export default function ProductionPlanGenerator() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('ppg_darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  const [data, setData] = useState<CleanedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [weekStart, setWeekStart] = useState(() => {
    const d = getMonday(new Date());
    return formatDate(d);
  });
  const [historyWeeks, setHistoryWeeks] = useState(8);
  const [method, setMethod] = useState<'production' | 'sales'>('production');
  const [minHistoryDays, setMinHistoryDays] = useState(3);
  const [minAvgSales, setMinAvgSales] = useState(0);
  const [plans, setPlans] = useState<StorePlan[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('yoSushi_productCategories_v2');
    return saved ? JSON.parse(saved) : {};
  });
  const [showParams, setShowParams] = useState(false);
  const [parsedInfo, setParsedInfo] = useState<{ total: number; valid: number; excluded: number; columns?: string[]; missingCols?: number } | null>(null);
  const [categoryPrompt, setCategoryPrompt] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('ppg_darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const allCategories = [...new Set(Object.values(categories).filter(Boolean))].sort();

  const saveCategory = useCallback((product: string, cat: string) => {
    setCategories(prev => {
      const next = { ...prev, [product]: cat };
      localStorage.setItem('yoSushi_productCategories_v2', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleCategoryChange = useCallback((product: string, value: string) => {
    if (value === '__new__') {
      const name = prompt('Enter new category name:');
      if (name && name.trim()) {
        saveCategory(product, name.trim());
      }
    } else {
      saveCategory(product, value);
    }
  }, [saveCategory]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const binary = evt.target?.result;
      const workbook = XLSX.read(binary, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawJson: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);
      const jsonKeys = rawJson.length > 0 ? Object.keys(rawJson[0]) : [];
      console.log('Excel columns found:', jsonKeys);

      const cleaned: CleanedRow[] = [];
      let missingCols = 0;
      for (const row of rawJson) {
        if (shouldExcludeRow(row)) { continue; }
        const site = String(getRowValue(row, 'Site Name') || '').trim();
        const date = String(getRowValue(row, 'Date') || '').trim();
        const itemName = String(getRowValue(row, 'Item Name') || '').trim();
        if (!site || !date || !itemName) { missingCols++; continue; }
        cleaned.push({
          site,
          date,
          itemName,
          salesVolume: Number(getRowValue(row, 'Sales Volume')) || 0,
          salesValue: Number(getRowValue(row, 'Sales Value')) || 0,
          productionQty: Number(getRowValue(row, 'Production Quantity')) || 0,
        });
      }
      const excluded = rawJson.length - cleaned.length - missingCols;
      setParsedInfo({ total: rawJson.length, valid: cleaned.length, excluded, columns: jsonKeys, missingCols });
      setData(cleaned);
      setPlans([]);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const generatePlan = useCallback(() => {
    if (data.length === 0) return;

    const startDate = new Date(weekStart);
    const historyStart = new Date(startDate);
    historyStart.setDate(historyStart.getDate() - historyWeeks * 7);

    const filtered = data.filter(row => {
      const rowDate = new Date(row.date);
      return rowDate >= historyStart && rowDate < startDate;
    });

    const storeGroups: Record<string, CleanedRow[]> = {};
    for (const row of filtered) {
      if (!storeGroups[row.site]) storeGroups[row.site] = [];
      storeGroups[row.site].push(row);
    }

    const storePlans: StorePlan[] = [];

    for (const [store, rows] of Object.entries(storeGroups)) {
      const productGroups: Record<string, CleanedRow[]> = {};
      for (const row of rows) {
        const key = normalizeProductName(row.itemName);
        if (!productGroups[key]) productGroups[key] = [];
        productGroups[key].push(row);
      }

      const products: ProductPlan[] = [];
      const allDates = [...new Set(rows.map(r => r.date))].sort();
      const totalDays = allDates.length;

      for (const [normName, productRows] of Object.entries(productGroups)) {
        const totalSales = productRows.reduce((s, r) => s + r.salesVolume, 0);
        const totalProduction = productRows.reduce((s, r) => s + r.productionQty, 0);
        const avgDailySales = totalSales / totalDays;
        const avgDailyProduction = totalProduction / totalDays;
        const productDays = productRows.length;

        const productType: 'produced' | 'purchased' = totalProduction > 0 ? 'produced' : 'purchased';

        if (productDays < minHistoryDays) continue;
        if (avgDailySales < minAvgSales) continue;

        const userBuffer = getPriceBand(
          productRows.reduce((s, r) => s + r.salesValue, 0),
          totalProduction
        );

        // Group produced products by price band for band-level averaging
        const producedEntries = Object.entries(productGroups).filter(([, pg]) =>
          pg.reduce((s, r) => s + r.productionQty, 0) > 0
        );
        const bandGroups: Record<string, { totalProd: number; count: number }> = {};
        for (const [pname, pg] of producedEntries) {
          const band = getPriceBand(
            pg.reduce((s, r) => s + r.salesValue, 0),
            pg.reduce((s, r) => s + r.productionQty, 0)
          );
          const key = band.toString();
          if (!bandGroups[key]) bandGroups[key] = { totalProd: 0, count: 0 };
          bandGroups[key].totalProd += pg.reduce((s, r) => s + r.productionQty, 0) / totalDays;
          bandGroups[key].count++;
        }
        const userBandKey = userBuffer.toString();
        const bandInfo = bandGroups[userBandKey];
        const bandAvgProduction = bandInfo ? bandInfo.totalProd / bandInfo.count : avgDailyProduction;

        let smartBuffer = userBuffer;
        if (productType === 'produced' && avgDailyProduction > 0) {
          const bandReducedPerProduct = (userBuffer - 1.0) * bandAvgProduction;
          smartBuffer = 1.0 + (bandReducedPerProduct / avgDailyProduction);
          smartBuffer = Math.max(1.0, Math.min(smartBuffer, userBuffer * 1.5));
        }

        const weeklyQty = method === 'production' ? avgDailyProduction * 7 : avgDailySales * 7;
        const bufferedQty = weeklyQty * smartBuffer;

        const dailyPlan = DAYS.map((day, idx) => {
          const dateStr = formatDate(addDays(startDate, idx));
          const dayHistory = productRows.filter(r => {
            const d = new Date(r.date);
            return d.getDay() === (idx + 1) % 7;
          });
          const dayAvg = dayHistory.length > 0
            ? dayHistory.reduce((s, r) => s + (method === 'production' ? r.productionQty : r.salesVolume), 0) / dayHistory.length
            : 0;
          const totalDayAvg = allDates.filter(d => {
            const dayOfWeek = new Date(d).getDay();
            return dayOfWeek === (idx + 1) % 7;
          }).length;

          const weight = totalDayAvg > 0 ? (dayHistory.length / totalDayAvg) : (1 / 7);
          return { day: dayStr(dateStr, day), qty: Math.round(bufferedQty * weight) };
        });

        products.push({
          name: productRows[0].itemName,
          normalizedName: normName,
          productType,
          avgDailySales,
          avgDailyProduction,
          smartBuffer,
          dailyPlan,
          weeklyTotal: dailyPlan.reduce((s, d) => s + d.qty, 0),
          category: categories[normName] || '',
        });
      }

      products.sort((a, b) => {
        if (a.productType !== b.productType) return a.productType === 'produced' ? -1 : 1;
        return a.normalizedName.localeCompare(b.normalizedName);
      });

      storePlans.push({ store, products });
    }

    setPlans(storePlans);
  }, [data, weekStart, historyWeeks, method, minHistoryDays, minAvgSales, categories]);

  const exportToExcel = useCallback(() => {
    if (plans.length === 0) return;

    const wb = XLSX.utils.book_new();

    for (const plan of plans) {
      const header = ['Product Name', 'Type', 'Category', 'Avg Daily Sales', 'Avg Daily Production', 'Buffer',
        ...DAYS, 'Weekly Total'];
      const rows = plan.products.map(p => [
        p.normalizedName,
        p.productType === 'produced' ? 'Produced' : 'Purchased',
        p.category,
        Math.round(p.avgDailySales * 100) / 100,
        Math.round(p.avgDailyProduction * 100) / 100,
        Math.round(p.smartBuffer * 100) / 100,
        ...p.dailyPlan.map(d => d.qty),
        p.weeklyTotal,
      ]);

      const wsData = [header, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      const colWidths = header.map((h, i) => {
        const maxLen = Math.max(
          h.length,
          ...rows.map(r => String(r[i]).length)
        );
        return { wch: maxLen + 3 };
      });
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, plan.store.slice(0, 31));
    }

    XLSX.writeFile(wb, `ProductionPlan_${weekStart}.xlsx`);
  }, [plans, weekStart]);

  const totalProducts = plans.reduce((s, p) => s + p.products.length, 0);
  const totalWeeklyUnits = plans.reduce((s, p) => s + p.products.reduce((s2, pr) => s2 + pr.weeklyTotal, 0), 0);
  const totalProduced = plans.reduce((s, p) => s + p.products.filter(pr => pr.productType === 'produced').length, 0);
  const totalPurchased = plans.reduce((s, p) => s + p.products.filter(pr => pr.productType === 'purchased').length, 0);
  const dailyTotals = DAYS.map((_, idx) =>
    plans.reduce((s, p) => s + p.products.reduce((s2, pr) => s2 + (pr.dailyPlan[idx]?.qty || 0), 0), 0)
  );

  const bgClass = darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900';
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputBg = darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900';

  return (
    <div className={`min-h-screen ${bgClass} transition-colors`}>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className={`${cardBg} rounded-xl shadow-sm border p-4 md:p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Production Plan Generator</h1>
              <p className={textMuted}>Upload POS data to generate a 7-day production plan</p>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Upload */}
        <div className={`${cardBg} rounded-xl shadow-sm border p-4 md:p-6`}>
          <div className="flex items-center gap-4 flex-wrap">
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`flex items-center gap-3 px-6 py-3 rounded-lg cursor-pointer transition-colors ${darkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
            >
              <Upload className="w-5 h-5" />
              <span className="font-medium">Upload POS Export (.xlsx)</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
            {fileName && (
              <span className={`text-sm ${textMuted}`}>{fileName}</span>
            )}
            {parsedInfo && (
              <span className="text-sm flex flex-wrap gap-x-3 gap-y-1 items-center">
                <span className={parsedInfo.valid > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                  {parsedInfo.valid} rows loaded
                </span>
                {parsedInfo.excluded > 0 && (
                  <span className="text-amber-600">{parsedInfo.excluded} excluded</span>
                )}
                {parsedInfo.missingCols && parsedInfo.missingCols > 0 ? (
                  <span className="text-red-600">{parsedInfo.missingCols} rows missing Site/Date/Item</span>
                ) : null}
                {parsedInfo.columns && parsedInfo.columns.length > 0 && (
                  <span className="text-gray-400 text-xs" title={parsedInfo.columns.join(', ')}>
                    Cols: {parsedInfo.columns.join(', ')}
                  </span>
                )}
              </span>
            )}
            <button
              onClick={() => setShowParams(!showParams)}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
            >
              <Settings className="w-4 h-4" />
              Parameters
            </button>
          </div>
        </div>

        {/* Parameters Panel */}
        {showParams && (
          <div className={`${cardBg} rounded-xl shadow-sm border p-4 md:p-6 space-y-4`}>
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Settings className="w-4 h-4" /> Parameters
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${textMuted}`}>Week Start (Monday)</label>
                <input
                  type="date"
                  value={weekStart}
                  onChange={e => setWeekStart(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${textMuted}`}>History Weeks</label>
                <input
                  type="number"
                  value={historyWeeks}
                  onChange={e => setHistoryWeeks(Math.max(1, Number(e.target.value)))}
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                  min={1}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${textMuted}`}>Method</label>
                <select
                  value={method}
                  onChange={e => setMethod(e.target.value as 'production' | 'sales')}
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                >
                  <option value="production">Production Qty</option>
                  <option value="sales">Sales</option>
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${textMuted}`}>Min History Days</label>
                <input
                  type="number"
                  value={minHistoryDays}
                  onChange={e => setMinHistoryDays(Math.max(1, Number(e.target.value)))}
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                  min={1}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${textMuted}`}>Min Avg Sales</label>
                <input
                  type="number"
                  value={minAvgSales}
                  onChange={e => setMinAvgSales(Math.max(0, Number(e.target.value)))}
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                  min={0}
                  step={0.1}
                />
              </div>
            </div>
          </div>
        )}

        {/* Price Band Buffers */}
        <div className={`${cardBg} rounded-xl shadow-sm border p-4 md:p-6`}>
          <h2 className="font-semibold text-lg mb-3">Price Band Buffers</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {PRICE_BANDS.map(band => (
              <div key={band.label} className={`p-3 rounded-lg text-center text-sm ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className={textMuted}>{band.label}</div>
                <div className="font-bold text-lg">{band.buffer}x</div>
              </div>
            ))}
          </div>
        </div>

        {/* KPI Dashboard */}
        {plans.length > 0 && (
          <div className={`${cardBg} rounded-xl shadow-sm border p-4 md:p-6`}>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-blue-500" />
              <h2 className="font-semibold text-lg">KPI Dashboard</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <div className={`p-3 rounded-lg text-center ${darkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
                <div className="text-xs text-gray-500">Products</div>
                <div className="font-bold text-xl">{totalProducts}</div>
              </div>
              <div className={`p-3 rounded-lg text-center ${darkMode ? 'bg-gray-700' : 'bg-green-50'}`}>
                <div className="text-xs text-gray-500">Units/Week</div>
                <div className="font-bold text-xl">{totalWeeklyUnits}</div>
              </div>
              <div className={`p-3 rounded-lg text-center ${darkMode ? 'bg-gray-700' : 'bg-purple-50'}`}>
                <div className="text-xs text-gray-500">Avg/Day</div>
                <div className="font-bold text-xl">{Math.round(totalWeeklyUnits / 7)}</div>
              </div>
              <div className="p-3 rounded-lg text-center bg-teal-50">
                <div className="text-xs text-gray-500">Produced</div>
                <div className="font-bold text-xl text-teal-600">{totalProduced}</div>
              </div>
              <div className="p-3 rounded-lg text-center bg-orange-50">
                <div className="text-xs text-gray-500">Purchased</div>
                <div className="font-bold text-xl text-orange-600">{totalPurchased}</div>
              </div>
              {dailyTotals.map((total, idx) => (
                <div key={DAYS[idx]} className={`p-3 rounded-lg text-center ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <div className="text-xs text-gray-500">{DAYS[idx].slice(0, 3)}</div>
                  <div className="font-bold text-lg">{total}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generate / Export Buttons */}
        {data.length > 0 && (
          <div className="flex gap-3">
            <button
              onClick={generatePlan}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Generate Plan
            </button>
            {plans.length > 0 && (
              <button
                onClick={exportToExcel}
                className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
              >
                <Download className="w-4 h-4" />
                Export Excel
              </button>
            )}
          </div>
        )}

        {/* Plans */}
        {plans.map(plan => (
          <div key={plan.store} className={`${cardBg} rounded-xl shadow-sm border overflow-hidden`}>
            <div className={`px-4 md:px-6 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <h2 className="text-lg font-bold">{plan.store}</h2>
            </div>

            {/* Production Plan - Produced Items */}
            {plan.products.filter(p => p.productType === 'produced').length > 0 && (
              <div className="border-b border-gray-200">
                <div className="px-4 md:px-6 py-3 bg-teal-50 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-teal-500" />
                  <span className="font-semibold text-teal-700">Production Plan</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                        <th className="text-left px-4 py-2 font-medium">Product</th>
                        <th className="text-left px-4 py-2 font-medium">Category</th>
                        <th className="text-right px-4 py-2 font-medium">Avg/Day</th>
                        <th className="text-right px-4 py-2 font-medium">Buffer</th>
                        {DAYS.map(d => <th key={d} className="text-right px-2 py-2 font-medium text-xs">{d.slice(0, 3)}</th>)}
                        <th className="text-right px-4 py-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.products.filter(p => p.productType === 'produced').map((p, idx) => (
                        <tr key={p.normalizedName} className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'} ${idx % 2 === 0 ? (darkMode ? 'bg-gray-800/50' : 'bg-white') : (darkMode ? 'bg-gray-800' : 'bg-gray-50/50')}`}>
                          <td className="px-4 py-2 font-medium">{p.normalizedName}</td>
                          <td className="px-4 py-2">
                            <select
                              value={p.category}
                              onChange={e => handleCategoryChange(p.normalizedName, e.target.value)}
                              className={`w-32 rounded border px-2 py-1 text-xs ${inputBg}`}
                            >
                              <option value="">-- Category --</option>
                              {allCategories.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                              <option value="__new__">+ New Category...</option>
                            </select>
                          </td>
                          <td className="text-right px-4 py-2">{method === 'production' ? Math.round(p.avgDailyProduction) : Math.round(p.avgDailySales)}</td>
                          <td className="text-right px-4 py-2 font-mono">{p.smartBuffer.toFixed(2)}x</td>
                          {p.dailyPlan.map(d => <td key={d.day} className="text-right px-2 py-2 font-mono">{d.qty}</td>)}
                          <td className="text-right px-4 py-2 font-bold">{p.weeklyTotal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Stock to Order - Purchased Items */}
            {plan.products.filter(p => p.productType === 'purchased').length > 0 && (
              <div>
                <div className="px-4 md:px-6 py-3 bg-orange-50 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span className="font-semibold text-orange-700">Stock to Order</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                        <th className="text-left px-4 py-2 font-medium">Product</th>
                        <th className="text-left px-4 py-2 font-medium">Category</th>
                        <th className="text-right px-4 py-2 font-medium">Avg/Day</th>
                        <th className="text-right px-4 py-2 font-medium">Buffer</th>
                        {DAYS.map(d => <th key={d} className="text-right px-2 py-2 font-medium text-xs">{d.slice(0, 3)}</th>)}
                        <th className="text-right px-4 py-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.products.filter(p => p.productType === 'purchased').map((p, idx) => (
                        <tr key={p.normalizedName} className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'} ${idx % 2 === 0 ? (darkMode ? 'bg-gray-800/50' : 'bg-white') : (darkMode ? 'bg-gray-800' : 'bg-gray-50/50')}`}>
                          <td className="px-4 py-2 font-medium">{p.normalizedName}</td>
                          <td className="px-4 py-2">
                            <select
                              value={p.category}
                              onChange={e => handleCategoryChange(p.normalizedName, e.target.value)}
                              className={`w-32 rounded border px-2 py-1 text-xs ${inputBg}`}
                            >
                              <option value="">-- Category --</option>
                              {allCategories.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                              <option value="__new__">+ New Category...</option>
                            </select>
                          </td>
                          <td className="text-right px-4 py-2">{Math.round(p.avgDailySales)}</td>
                          <td className="text-right px-4 py-2 font-mono">{p.smartBuffer.toFixed(2)}x</td>
                          {p.dailyPlan.map(d => <td key={d.day} className="text-right px-2 py-2 font-mono">{d.qty}</td>)}
                          <td className="text-right px-4 py-2 font-bold">{p.weeklyTotal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}

        {data.length === 0 && (
          <div className={`${cardBg} rounded-xl shadow-sm border p-12 text-center`}>
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className={`text-lg font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Upload a POS export to get started</p>
            <p className={`text-sm mt-1 ${textMuted}`}>Supports .xlsx files with columns like: Site Name, Date, Item Name, Sales Volume, Sales Value, Production Quantity</p>
            {parsedInfo && parsedInfo.valid === 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 inline-block">
                No valid rows found. Check that your Excel has <strong>Site Name</strong>, <strong>Date</strong>, and <strong>Item Name</strong> columns.
                {parsedInfo.columns && parsedInfo.columns.length > 0 && (
                  <div className="mt-1 text-xs">Detected columns: {parsedInfo.columns.join(', ')}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function dayStr(dateStr: string, dayName: string): string {
  return `${dateStr} (${dayName})`;
}
