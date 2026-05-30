import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, Settings, BarChart3, RefreshCw, Sun, Moon, HelpCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

interface CleanedRow {
  site: string;
  item: string;
  itemRaw: string;
  date: Date;
  sales: number;
  value: number;
  prod: number;
}

interface ProductPlan {
  item: string;
  medPrice: number | null;
  dynBuf: number;
  avgSales: number;
  histDays: number;
  planQty: Record<string, number>;
  weekTotal: number;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STORE_COLORS: Record<string, string> = {
  'Allerton Road': '#4A96A2',
  'Old Swan Liverpool': '#D48B2E',
  'Sefton Park': '#8A50C8'
};

function normaliseName(raw: string): string {
  return raw
    .replace(/^T\d+\s+/i, '')   // remove leading "T1 ", "T2 " etc.
    .replace(/\s+T\d+$/i, '')   // remove trailing " T1" etc.
    .replace(/\s+/g, ' ')
    .trim();
}

function isReducedRow(r: any): boolean {
  const itemName = String(r['Item Name'] || '').trim().toLowerCase();
  const itemType = String(r['Item Type'] || '').trim().toLowerCase();
  const tranType = String(r['Transaction Type'] || '').trim().toLowerCase();
  const priceType = String(r['Price Type'] || '').trim().toLowerCase();
  const dept = String(r['Department'] || '').trim().toLowerCase();
  const discount = String(r['Discount'] || '').trim().toLowerCase();
  return (
    itemType.includes('reduc') || tranType.includes('reduc') ||
    priceType.includes('reduc') || itemName.includes('reduc') ||
    dept.includes('reduc') || discount === 'yes' ||
    itemType.includes('waste') || itemType.includes('void') ||
    tranType.includes('void') || tranType.includes('refund')
  );
}

function parseNum(v: any): number {
  if (v === '' || v == null) return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) || n < 0 ? 0 : n;
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
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function priceBand(p: number | null): string {
  if (p === null) return '—';
  if (p < 3) return '< £3';
  if (p < 6) return '£3–£5.99';
  if (p < 10) return '£6–£9.99';
  if (p < 15) return '£10–£14.99';
  return '£15+';
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
  const [method, setMethod] = useState<'prod' | 'sales'>('prod');
  const [minHistoryDays, setMinHistoryDays] = useState(3);
  const [minAvgSales, setMinAvgSales] = useState(0);
  const [plans, setPlans] = useState<Record<string, ProductPlan[]>>({});
  const [activeTab, setActiveTab] = useState<string>('');
  const [showFormula, setShowFormula] = useState(false);

  const [priceBuffers, setPriceBuffers] = useState({
    lt3: 1.35,
    mid1: 1.30,
    mid2: 1.20,
    mid3: 1.10,
    high: 1.05
  });

  const [categories, setCategories] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('yoSushi_productCategories_v2');
    return saved ? JSON.parse(saved) : {};
  });

  const [catOrder, setCatOrder] = useState('Sushi, Hot Food, Drinks, Dessert, Snacks, Other, Uncategorised');
  const [parsedInfo, setParsedInfo] = useState<{
    total: number;
    valid: number;
    reduced: number;
    merged: number;
    stores: string[];
    minDate: Date | null;
    maxDate: Date | null;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem('ppg_darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

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
      try {
        const binary = evt.target?.result;
        const workbook = XLSX.read(binary, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawJson = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

        let reducedCount = 0;
        let t1MergedCount = 0;

        const cleaned: CleanedRow[] = rawJson
          .filter(r => {
            const s = String(r['Site Name'] || '').trim();
            return s && !s.startsWith('Applied') && !s.startsWith('Delivery') &&
                   !s.startsWith('Accounting') && s !== 'Total';
          })
          .map(r => {
            let d = r['Date'];
            if (typeof d === 'number') {
              d = new Date(Math.round((d - 25569) * 86400 * 1000));
            } else {
              d = new Date(d);
            }

            const reduced = isReducedRow(r);
            if (reduced) reducedCount++;

            const rawName = String(r['Item Name'] || '').trim();
            const normName = normaliseName(rawName);
            if (normName !== rawName) t1MergedCount++;

            return {
              site: String(r['Site Name'] || '').trim(),
              item: normName,
              itemRaw: rawName,
              date: isNaN(d.getTime()) ? null : d,
              sales: reduced ? 0 : parseNum(r['Sales Volume']),
              value: reduced ? 0 : parseNum(r['Sales Value']),
              prod: reduced ? 0 : parseNum(r['Production Quantity']),
              reduced
            };
          })
          .filter((r: any) => r.date && r.item && !r.reduced) as CleanedRow[];

        if (cleaned.length === 0) {
          alert('No valid rows found in the uploaded file. Please check the column headers.');
          return;
        }

        const stores = [...new Set(cleaned.map(r => r.site))].filter(Boolean).sort();
        const minDate = new Date(Math.min(...cleaned.map(r => r.date.getTime())));
        const maxDate = new Date(Math.max(...cleaned.map(r => r.date.getTime())));

        // Auto-set week start to the Monday following the max date
        const day = maxDate.getDay();
        const daysToNextMonday = day === 0 ? 1 : 8 - day;
        const nextMonday = addDays(maxDate, daysToNextMonday);
        setWeekStart(formatDate(nextMonday));

        setParsedInfo({
          total: rawJson.length,
          valid: cleaned.length,
          reduced: reducedCount,
          merged: t1MergedCount,
          stores,
          minDate,
          maxDate
        });

        setData(cleaned);
        setPlans({});
        setActiveTab('');
      } catch (err: any) {
        alert('Could not read file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const getBandKey = (p: number | null): string => {
    if (p === null) return 'mid1';
    if (p < 3) return 'lt3';
    if (p < 6) return 'mid1';
    if (p < 10) return 'mid2';
    if (p < 15) return 'mid3';
    return 'high';
  };

  const getUserBuf = (bandKey: string): number => {
    return (priceBuffers as any)[bandKey] || 1.0;
  };

  const generatePlan = useCallback(() => {
    if (data.length === 0) return;

    // History window relative to the maximum date in the file (matching HTML v2.1)
    const allDates = data.map(r => r.date.getTime());
    const maxTs = Math.max(...allDates);
    const cutoff = new Date(maxTs - historyWeeks * 7 * 86400 * 1000);
    const df = data.filter(r => r.date >= cutoff);

    const planStart = new Date(weekStart + 'T00:00:00');
    const planDates = DAYS.map((_, i) => {
      const d = new Date(planStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    const stores = [...new Set(df.map(r => r.site))].sort();
    const storePlans: Record<string, ProductPlan[]> = {};

    for (const store of stores) {
      const sdf = df.filter(r => r.site === store);

      // Group by item -> date
      const itemMap: Record<string, Record<string, { sales: number; value: number; prod: number; date: Date }>> = {};
      for (const r of sdf) {
        if (!itemMap[r.item]) itemMap[r.item] = {};
        const dk = formatDate(r.date);
        if (!itemMap[r.item][dk]) {
          itemMap[r.item][dk] = { sales: 0, value: 0, prod: 0, date: r.date };
        }
        itemMap[r.item][dk].sales += r.sales;
        itemMap[r.item][dk].value += r.value;
        itemMap[r.item][dk].prod += r.prod;
      }

      // First pass - compute medPrice & avgProd per item
      const itemMeta: Record<string, {
        medPrice: number | null;
        avgSales: number;
        avgProd: number | null;
        days: any[];
        bandKey: string;
      }> = {};

      for (const [item, dateMap] of Object.entries(itemMap)) {
        const days = Object.values(dateMap);
        if (days.length < minHistoryDays) continue;
        const avgSales = days.reduce((s, d) => s + d.sales, 0) / days.length;
        if (avgSales < minAvgSales) continue;

        const priced = days.filter(d => d.sales > 0 && d.value > 0).map(d => d.value / d.sales).sort((a, b) => a - b);
        const medPrice = priced.length ? priced[Math.floor(priced.length / 2)] : null;

        const allProd = days.filter(d => d.prod > 0).map(d => d.prod);
        const avgProd = allProd.length ? allProd.reduce((a, b) => a + b, 0) / allProd.length : null;

        itemMeta[item] = { medPrice, avgSales, avgProd, days, bandKey: getBandKey(medPrice) };
      }

      // Collect avg production per band
      const bandProds: Record<string, number[]> = { lt3: [], mid1: [], mid2: [], mid3: [], high: [] };
      for (const [, meta] of Object.entries(itemMeta)) {
        if (meta.avgProd !== null) {
          bandProds[meta.bandKey].push(meta.avgProd);
        }
      }

      const bandAvgProd: Record<string, number | null> = {};
      for (const [k, arr] of Object.entries(bandProds)) {
        bandAvgProd[k] = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      }

      const getSmartBuf = (meta: any): number => {
        const bk = meta.bandKey;
        const userBuf = getUserBuf(bk);
        const bandAvg = bandAvgProd[bk];
        const productAvg = meta.avgProd;

        if (bandAvg === null || productAvg === null || productAvg === 0) return userBuf;

        const bandReducedPerProduct = (userBuf - 1.0) * bandAvg;
        const smartBuf = 1.0 + (bandReducedPerProduct / productAvg);
        return Math.min(Math.max(smartBuf, 1.0), userBuf * 1.5);
      };

      const results: ProductPlan[] = [];

      for (const [item, meta] of Object.entries(itemMeta)) {
        const { medPrice, avgSales, days } = meta;
        const smartBuf = getSmartBuf(meta);

        // Weekday buckets
        const wdSales: Record<string, number[]> = {};
        const wdProd: Record<string, number[]> = {};

        for (const d of days) {
          const dow = DAYS[d.date.getDay() === 0 ? 6 : d.date.getDay() - 1];
          if (!wdSales[dow]) {
            wdSales[dow] = [];
            wdProd[dow] = [];
          }
          wdSales[dow].push(d.sales);
          if (d.prod > 0) wdProd[dow].push(d.prod);
        }

        const allProd = days.filter(d => d.prod > 0).map(d => d.prod);
        const overallAvgProd = allProd.length ? allProd.reduce((a, b) => a + b, 0) / allProd.length : null;

        const planQty: Record<string, number> = {};
        for (const day of DAYS) {
          let qty = 0;
          if (method === 'prod') {
            if (wdProd[day] && wdProd[day].length > 0) {
              qty = (wdProd[day].reduce((a, b) => a + b, 0) / wdProd[day].length) * smartBuf;
            } else if (overallAvgProd !== null) {
              qty = overallAvgProd * smartBuf;
            } else {
              const base = wdSales[day] ? wdSales[day].reduce((a, b) => a + b, 0) / wdSales[day].length : avgSales;
              qty = base * smartBuf;
            }
          } else {
            const base = wdSales[day] ? wdSales[day].reduce((a, b) => a + b, 0) / wdSales[day].length : avgSales;
            qty = base * smartBuf;
          }
          qty = Math.max(qty, 0);
          planQty[day] = Math.ceil(qty);
        }

        const weekTotal = DAYS.reduce((s, d) => s + planQty[d], 0);
        results.push({
          item,
          medPrice,
          dynBuf: Math.round(smartBuf * 100) / 100,
          avgSales,
          histDays: days.length,
          planQty,
          weekTotal
        });
      }

      storePlans[store] = results.sort((a, b) => b.avgSales - a.avgSales);
    }

    setPlans(storePlans);
    if (stores.length > 0) {
      setActiveTab(stores[0]);
    }
  }, [data, historyWeeks, weekStart, method, minHistoryDays, minAvgSales, priceBuffers]);

  const downloadExcel = useCallback(() => {
    if (Object.keys(plans).length === 0) return;
    const wb = XLSX.utils.book_new();

    for (const [store, plan] of Object.entries(plans)) {
      const planDates = DAYS.map((_, i) => {
        const d = new Date(weekStart + 'T00:00:00');
        d.setDate(d.getDate() + i);
        return d;
      });

      const headers = [
        '#', 'Product', 'Price Band', 'Unit Price', 'Avg Daily Sales', 'History Days',
        ...DAYS.map((d, i) => DAYS_SHORT[i] + ' ' + planDates[i].getDate() + '/' + String(planDates[i].getMonth() + 1).padStart(2, '0')),
        'WEEK TOTAL'
      ];

      const rows = plan.map((row, ri) => [
        ri + 1, row.item, priceBand(row.medPrice),
        row.medPrice ? '£' + row.medPrice.toFixed(2) : '—',
        row.avgSales.toFixed(2), row.histDays,
        ...DAYS.map(d => row.planQty[d]),
        row.weekTotal
      ]);

      const dayTotals = DAYS.map(d => plan.reduce((s, r) => s + r.planQty[d], 0));
      rows.push(['', 'DAILY TOTAL', '', '', '', '', ...dayTotals, dayTotals.reduce((a, b) => a + b, 0)]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [5, 44, 13, 11, 14, 12, ...Array(7).fill(10), 12].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, store.slice(0, 31));
    }

    const dateStr = weekStart.replace(/-/g, '');
    XLSX.writeFile(wb, `production_plan_${dateStr}.xlsx`);
  }, [plans, weekStart]);

  const getCat = (product: string) => categories[product] || 'Uncategorised';

  const getCatOrderList = () => {
    return catOrder.split(',').map(s => s.trim()).filter(Boolean);
  };

  const groupByCategory = (plan: ProductPlan[]) => {
    const order = getCatOrderList();
    const groups: Record<string, ProductPlan[]> = {};
    plan.forEach(r => {
      const cat = getCat(r.item);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(r);
    });

    const result: [string, ProductPlan[]][] = [];
    order.forEach(cat => {
      if (groups[cat]) {
        result.push([cat, groups[cat]]);
        delete groups[cat];
      }
    });

    Object.keys(groups).sort().forEach(cat => {
      result.push([cat, groups[cat]]);
    });

    return result;
  };

  const allCategoryNames = () => {
    const stored = Object.values(categories);
    const ordered = getCatOrderList();
    return [...new Set([...ordered, ...stored, 'Uncategorised'])].filter(Boolean);
  };

  const activePlan = plans[activeTab] || [];
  const activeColor = STORE_COLORS[activeTab] || '#1a6870';
  const dayTotals = DAYS.map(d => activePlan.reduce((s, r) => s + (r.planQty[d] || 0), 0));
  const grandTotal = dayTotals.reduce((a, b) => a + b, 0);

  const bgClass = darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900';
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputBg = darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900';
  const borderClass = darkMode ? 'border-gray-700' : 'border-gray-200';

  return (
    <div className={`min-h-screen ${bgClass} transition-colors pb-12`}>
      {/* Header */}
      <div className={`border-b ${borderClass} ${cardBg} px-6 py-4 sticky top-0 z-50 shadow-sm`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍣</span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Production Plan Generator</h1>
              <p className={`text-xs ${textMuted}`}>Upload POS data to generate a 7-day production plan</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFormula(!showFormula)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                showFormula
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              Formula Settings
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 mt-6 space-y-6">
        {/* Formula Settings Panel */}
        {showFormula && (
          <div className={`${cardBg} rounded-xl border p-5 shadow-md space-y-4 animate-in fade-in slide-in-from-top-2 duration-200`}>
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-teal-600 dark:text-teal-400 flex items-center gap-2">
                <HelpCircle className="w-4 h-4" /> Formula &amp; Buffer Settings
              </h3>
              <button onClick={() => setShowFormula(false)} className={`text-xs ${textMuted} hover:underline`}>Close</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed">
              <div className="space-y-2">
                <p><strong>Name normalisation:</strong> T1/T2/T3 tier prefixes &amp; suffixes stripped — "T1 Salmon Nigiri" and "Salmon Nigiri" are merged into one product before any calculation.</p>
                <p><strong>Pre-filter:</strong> Reduced, voided &amp; refund rows excluded — these are already-produced items, not new demand.</p>
                <p><strong>Primary:</strong> Weekday historical production qty (full-price rows only).</p>
                <p><strong>Fallback 1:</strong> Overall avg production qty.</p>
                <p><strong>Buffer formula (2-layer):</strong></p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li><em>Band reduced units per product</em> = (your buffer − 1) × avg production in that price band ÷ number of products in band</li>
                  <li><em>Product buffer</em> = 1 + (band reduced per product ÷ <strong>this product's own avg production</strong>)</li>
                </ol>
                <p className="italic">Result: low-volume products get proportionally the same extra units as high-volume ones — never over or under-stocked relative to their own scale.</p>
              </div>
              <div className="space-y-4">
                <div className="font-bold text-teal-600 dark:text-teal-400">Price-range buffers (fallback multiplier)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-[10px] font-semibold uppercase ${textMuted} mb-1`}>&lt; £3</label>
                    <input
                      type="number"
                      step="0.05"
                      value={priceBuffers.lt3}
                      onChange={e => setPriceBuffers({ ...priceBuffers, lt3: parseFloat(e.target.value) || 1.0 })}
                      className={`w-full rounded-lg border px-3 py-1.5 text-xs ${inputBg}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-[10px] font-semibold uppercase ${textMuted} mb-1`}>£3 – £5.99</label>
                    <input
                      type="number"
                      step="0.05"
                      value={priceBuffers.mid1}
                      onChange={e => setPriceBuffers({ ...priceBuffers, mid1: parseFloat(e.target.value) || 1.0 })}
                      className={`w-full rounded-lg border px-3 py-1.5 text-xs ${inputBg}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-[10px] font-semibold uppercase ${textMuted} mb-1`}>£6 – £9.99</label>
                    <input
                      type="number"
                      step="0.05"
                      value={priceBuffers.mid2}
                      onChange={e => setPriceBuffers({ ...priceBuffers, mid2: parseFloat(e.target.value) || 1.0 })}
                      className={`w-full rounded-lg border px-3 py-1.5 text-xs ${inputBg}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-[10px] font-semibold uppercase ${textMuted} mb-1`}>£10 – £14.99</label>
                    <input
                      type="number"
                      step="0.05"
                      value={priceBuffers.mid3}
                      onChange={e => setPriceBuffers({ ...priceBuffers, mid3: parseFloat(e.target.value) || 1.0 })}
                      className={`w-full rounded-lg border px-3 py-1.5 text-xs ${inputBg}`}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className={`block text-[10px] font-semibold uppercase ${textMuted} mb-1`}>£15+</label>
                    <input
                      type="number"
                      step="0.05"
                      value={priceBuffers.high}
                      onChange={e => setPriceBuffers({ ...priceBuffers, high: parseFloat(e.target.value) || 1.0 })}
                      className={`w-full rounded-lg border px-3 py-1.5 text-xs ${inputBg}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Parameters */}
        <div className={`${cardBg} rounded-xl border p-5 shadow-sm space-y-4`}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">⚙️ Parameters</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className={`block text-[10px] font-semibold uppercase ${textMuted} mb-1`}>Plan Week Start (Monday)</label>
              <input
                type="date"
                value={weekStart}
                onChange={e => setWeekStart(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
              />
              <span className={`text-[10px] ${textMuted} mt-1 block`}>Must be a Monday</span>
            </div>
            <div>
              <label className={`block text-[10px] font-semibold uppercase ${textMuted} mb-1`}>History Weeks</label>
              <input
                type="number"
                value={historyWeeks}
                onChange={e => setHistoryWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                min={1}
                max={52}
              />
              <span className={`text-[10px] ${textMuted} mt-1 block`}>Weeks of history to learn from</span>
            </div>
            <div>
              <label className={`block text-[10px] font-semibold uppercase ${textMuted} mb-1`}>Method</label>
              <select
                value={method}
                onChange={e => setMethod(e.target.value as 'prod' | 'sales')}
                className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
              >
                <option value="prod">Production Qty history</option>
                <option value="sales">Sales × Buffer multiplier</option>
              </select>
              <span className={`text-[10px] ${textMuted} mt-1 block`}>Primary data source for plan</span>
            </div>
            <div>
              <label className={`block text-[10px] font-semibold uppercase ${textMuted} mb-1`}>Min History Days</label>
              <input
                type="number"
                value={minHistoryDays}
                onChange={e => setMinHistoryDays(Math.max(1, parseInt(e.target.value) || 1))}
                className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                min={1}
              />
              <span className={`text-[10px] ${textMuted} mt-1 block`}>Skip products with fewer data points</span>
            </div>
            <div>
              <label className={`block text-[10px] font-semibold uppercase ${textMuted} mb-1`}>Min Avg Daily Sales</label>
              <input
                type="number"
                value={minAvgSales}
                onChange={e => setMinAvgSales(Math.max(0, parseFloat(e.target.value) || 0))}
                className={`w-full rounded-lg border px-3 py-2 text-sm ${inputBg}`}
                min={0}
                step={0.1}
              />
              <span className={`text-[10px] ${textMuted} mt-1 block`}>0 = include all products</span>
            </div>
          </div>
        </div>

        {/* Upload Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${cardBg} ${
            fileName ? 'border-teal-500 bg-teal-50/5 dark:bg-teal-950/5' : 'border-gray-300 dark:border-gray-700 hover:border-teal-500'
          }`}
        >
          <div className="text-3xl mb-2">📂</div>
          <p className="text-sm font-semibold">
            {fileName ? <span className="text-teal-600 dark:text-teal-400">{fileName}</span> : 'Click to upload or drag & drop your Excel export'}
          </p>
          <p className={`text-xs mt-1 ${textMuted}`}>Supports .xlsx files exported from your POS system</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* Status Banner */}
        {parsedInfo && (
          <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900 rounded-xl p-4 text-xs space-y-1">
            <div className="font-bold text-teal-800 dark:text-teal-300">✅ File Loaded Successfully</div>
            <div className="text-teal-700 dark:text-teal-400 flex flex-wrap gap-x-4 gap-y-1">
              <span>• <strong>{parsedInfo.valid.toLocaleString()}</strong> valid rows loaded</span>
              {parsedInfo.reduced > 0 && <span className="text-amber-600 dark:text-amber-400">• <strong>{parsedInfo.reduced.toLocaleString()}</strong> reduced/void rows excluded</span>}
              {parsedInfo.merged > 0 && <span className="text-teal-600 dark:text-teal-400">• <strong>{parsedInfo.merged.toLocaleString()}</strong> T1/T2 rows merged</span>}
              <span>• <strong>{parsedInfo.stores.length}</strong> stores detected</span>
              {parsedInfo.minDate && parsedInfo.maxDate && (
                <span>• History: <strong>{parsedInfo.minDate.toLocaleDateString('en-GB')}</strong> → <strong>{parsedInfo.maxDate.toLocaleDateString('en-GB')}</strong></span>
              )}
            </div>
            <div className="text-teal-600 dark:text-teal-500 mt-1 font-medium">
              👉 Target Week Start automatically set to Monday <strong>{weekStart}</strong>. Click \"Generate Production Plan\" below!
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={generatePlan}
            disabled={data.length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-semibold text-sm shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Generate Production Plan
          </button>
          {Object.keys(plans).length > 0 && (
            <button
              onClick={downloadExcel}
              className="flex items-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg transition-colors font-semibold text-sm border border-gray-300 dark:border-gray-700 shadow-sm"
            >
              <Download className="w-4 h-4" />
              Download Excel
            </button>
          )}
        </div>

        {/* Category Order Controls */}
        {Object.keys(plans).length > 0 && (
          <div className={`${cardBg} rounded-xl border p-4 shadow-sm space-y-3`}>
            <div className="font-bold text-xs uppercase tracking-wider text-teal-600 dark:text-teal-400">📂 Category Order</div>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-width-[240px]">
                <label className={`block text-[10px] font-semibold uppercase ${textMuted} mb-1`}>Display order (comma separated)</label>
                <input
                  type="text"
                  value={catOrder}
                  onChange={e => setCatOrder(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-xs ${inputBg}`}
                />
              </div>
            </div>
            <p className={`text-[10px] ${textMuted}`}>Category assignments are saved in your browser — same product names will remember their category next time.</p>
          </div>
        )}

        {/* Results Tabs & Tables */}
        {Object.keys(plans).length > 0 ? (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
              {Object.keys(plans).map(store => {
                const plan = plans[store];
                const totalUnits = plan.reduce((s, r) => s + r.weekTotal, 0);
                const isActive = activeTab === store;
                const activeBorderColor = STORE_COLORS[store] || '#1a6870';

                return (
                  <button
                    key={store}
                    onClick={() => setActiveTab(store)}
                    style={{ borderTopColor: isActive ? activeBorderColor : 'transparent' }}
                    className={`px-5 py-3 text-xs font-bold border-t-2 border-x border-b transition-all whitespace-nowrap rounded-t-lg ${
                      isActive
                        ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-x-gray-200 dark:border-x-gray-700 border-b-white dark:border-b-gray-800'
                        : 'bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 border-transparent border-b-gray-200 dark:border-b-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800/30'
                    }`}
                  >
                    {store} <span className="opacity-60 font-normal">({plan.length} products · {totalUnits.toLocaleString()} units)</span>
                  </button>
                );
              })}
            </div>

            {/* Active Store Panel */}
            {activeTab && plans[activeTab] && (
              <div className={`${cardBg} rounded-b-xl border border-t-0 shadow-sm overflow-hidden`}>
                {/* KPI Bar */}
                <div className="flex flex-wrap gap-6 p-5 bg-gray-50 dark:bg-gray-900/30 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold" style={{ color: activeColor }}>{activePlan.length}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Products</span>
                  </div>
                  <div className="w-px bg-gray-200 dark:bg-gray-700 self-stretch"></div>
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold" style={{ color: activeColor }}>{grandTotal.toLocaleString()}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Units / Week</span>
                  </div>
                  <div className="w-px bg-gray-200 dark:bg-gray-700 self-stretch"></div>
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold" style={{ color: activeColor }}>{Math.round(grandTotal / 7).toLocaleString()}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>Avg / Day</span>
                  </div>
                  <div className="w-px bg-gray-200 dark:bg-gray-700 self-stretch"></div>
                  {DAYS.map((d, i) => (
                    <div key={d} className="flex flex-col">
                      <span className="text-lg font-bold" style={{ color: activeColor }}>{dayTotals[i].toLocaleString()}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>{DAYS_SHORT[i]}</span>
                    </div>
                  ))}
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-teal-600 text-white">
                        <th className="p-2.5 text-center font-bold uppercase tracking-wider w-10">#</th>
                        <th className="p-2.5 text-left font-bold uppercase tracking-wider min-w-[200px]">Product</th>
                        <th className="p-2.5 text-left font-bold uppercase tracking-wider min-w-[140px]">Category</th>
                        <th className="p-2.5 text-center font-bold uppercase tracking-wider">Price</th>
                        <th className="p-2.5 text-center font-bold uppercase tracking-wider">Avg Sales</th>
                        <th className="p-2.5 text-center font-bold uppercase tracking-wider" title="Dynamic buffer applied">Buffer</th>
                        {DAYS.map((d, i) => {
                          const planStart = new Date(weekStart + 'T00:00:00');
                          const dt = addDays(planStart, i);
                          const isWe = i >= 5;
                          return (
                            <th
                              key={d}
                              className="p-2.5 text-center font-bold uppercase tracking-wider"
                              style={{ backgroundColor: isWe ? '#2a5a30' : undefined }}
                            >
                              {DAYS_SHORT[i]}
                              <span className="block font-normal opacity-75 text-[9px] mt-0.5">
                                {dt.getDate()} {dt.toLocaleString('en-GB', { month: 'short' })}
                              </span>
                            </th>
                          );
                        })}
                        <th className="p-2.5 text-center font-bold uppercase tracking-wider bg-teal-950">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupByCategory(activePlan).map(([cat, rows]) => {
                        const catTotal = rows.reduce((s, r) => s + r.weekTotal, 0);
                        return (
                          <React.Fragment key={cat}>
                            {/* Category Header Row */}
                            <tr className="bg-teal-50/50 dark:bg-teal-950/20 border-t-2 border-teal-600 dark:border-teal-800">
                              <td colSpan={7 + DAYS.length} className="p-2.5 text-left font-bold text-teal-700 dark:text-teal-400">
                                ▸ {cat.toUpperCase()} &nbsp;
                                <span className="font-normal text-[10px] opacity-75">
                                  {rows.length} product{rows.length !== 1 ? 's' : ''} · {catTotal.toLocaleString()} units/week
                                </span>
                              </td>
                            </tr>
                            {rows.map((row, ri) => {
                              const cats = allCategoryNames();
                              return (
                                <tr key={row.item} className="border-b border-gray-100 dark:border-gray-800 hover:bg-teal-50/10 dark:hover:bg-teal-950/10">
                                  <td className="p-2 text-center text-gray-400 text-[10px]">{ri + 1}</td>
                                  <td className="p-2 text-left font-medium">{row.item}</td>
                                  <td className="p-2 text-left">
                                    <select
                                      value={getCat(row.item)}
                                      onChange={e => handleCategoryChange(row.item, e.target.value)}
                                      className={`w-full rounded border px-2 py-1 text-xs ${inputBg}`}
                                    >
                                      {cats.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                      ))}
                                      <option value="__new__">＋ New category…</option>
                                    </select>
                                  </td>
                                  <td className="p-2 text-center text-gray-500 dark:text-gray-400">{priceBand(row.medPrice)}</td>
                                  <td className="p-2 text-center text-gray-500 dark:text-gray-400">{row.avgSales.toFixed(1)}</td>
                                  <td className="p-2 text-center text-teal-600 dark:text-teal-400 font-bold">{row.dynBuf ? row.dynBuf.toFixed(2) + '×' : '—'}</td>
                                  {DAYS.map((d, i) => {
                                    const isWe = i >= 5;
                                    const qty = row.planQty[d] || 0;
                                    return (
                                      <td
                                        key={d}
                                        className={`p-2 text-center ${isWe ? 'bg-green-50/30 dark:bg-green-950/10' : ''} ${qty > 0 ? 'font-bold' : 'text-gray-400'}`}
                                      >
                                        {qty || '—'}
                                      </td>
                                    );
                                  })}
                                  <td className="p-2 text-center font-bold bg-teal-50/30 dark:bg-teal-950/10 text-teal-700 dark:text-teal-400">{row.weekTotal}</td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-teal-600 text-white font-bold">
                        <td colSpan={3}></td>
                        <td colSpan={2} className="p-2.5 text-left">DAILY TOTAL</td>
                        <td></td>
                        {dayTotals.map((t, i) => (
                          <td key={i} className="p-2.5 text-center">{t.toLocaleString()}</td>
                        ))}
                        <td className="p-2.5 text-center bg-teal-950">{grandTotal.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={`${cardBg} rounded-xl border p-12 text-center shadow-sm`}>
            <div className="text-5xl mb-4">📋</div>
            <p className="text-lg font-semibold">No plan generated yet</p>
            <p className={`text-sm mt-1 max-w-md mx-auto ${textMuted}`}>
              Upload your Excel export and press <strong>Generate Production Plan</strong> to see daily production quantities per store.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
