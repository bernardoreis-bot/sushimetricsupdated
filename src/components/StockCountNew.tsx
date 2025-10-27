import { useState, useEffect } from 'react';
import { Save, History, Trash2, Search, Package, ChevronDown, ChevronUp, Download, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Site {
  id: string;
  name: string;
}

interface Product {
  id: string;
  supplier_product_code: string;
  supplier_product_name: string;
  category: string;
  unit: string;
  supplier_id: string;
  notes: string | null;
  unit_price: number;
  units_per_box?: number;
  cost_per_unit?: number;
  cost_per_box?: number;
  input_mode?: 'boxes' | 'units' | 'both';
}

interface StockCountEntry {
  id?: string;
  product_mapping_id: string;
  quantity: number;
  unit_value: number;
  notes: string;
  boxes?: number;
  units?: number;
  units_per_box?: number;
  cost_per_unit?: number;
  cost_per_box?: number;
  total_cost?: number;
  input_mode?: 'boxes' | 'units' | 'both';
}

interface HistoricalCount {
  id: string;
  count_date: string;
  site_id: string;
  product_mapping_id: string;
  quantity: number;
  unit_value: number;
  notes: string;
  counted_by: string | null;
  created_at: string;
  pdf_data: string | null;
  sites: { name: string };
  product_mappings: { supplier_product_code: string; supplier_product_name: string; category: string };
}

interface StockData {
  date: string;
  stockValue: number;
  itemCount: number;
}

export default function StockCountNew() {
  const [sites, setSites] = useState<Site[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSite, setSelectedSite] = useState('');
  const [countDate, setCountDate] = useState(new Date().toISOString().split('T')[0]);
  const [countedBy, setCountedBy] = useState('');
  const [stockEntries, setStockEntries] = useState<StockCountEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'current' | 'history' | 'analytics'>('current');
  const [historicalCounts, setHistoricalCounts] = useState<HistoricalCount[]>([]);
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  const [historySiteFilter, setHistorySiteFilter] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Ambient', 'Chilled', 'Frozen']));
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [stockData, setStockData] = useState<StockData[]>([]);
  const [currentStockValue, setCurrentStockValue] = useState(0);
  const [currentItemCount, setCurrentItemCount] = useState(0);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState<Set<string>>(new Set());
  const [analyticsSiteFilter, setAnalyticsSiteFilter] = useState<'all' | string>('all');

  const categories = ['Ambient', 'Chilled', 'Frozen', 'Packaging', 'Cleaning', 'Other'];
  const [stockText, setStockText] = useState('');
  const [importText, setImportText] = useState('');
  const [textFeedback, setTextFeedback] = useState<string | null>(null);

  useEffect(() => {
    loadSites();
    loadProducts();
  }, []);

  useEffect(() => {
    if (selectedSite && countDate) {
      loadExistingCount();
    }
  }, [selectedSite, countDate]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistoricalCounts();
    } else if (activeTab === 'analytics') {
      loadStockData();
    }
  }, [activeTab, historyDateFilter, historySiteFilter, selectedSite, analyticsSiteFilter]);

  useEffect(() => {
    if (autoSaveEnabled && stockEntries.length > 0 && selectedSite && countDate) {
      const timer = setTimeout(() => {
        handleAutoSave();
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [stockEntries, autoSaveEnabled, selectedSite, countDate]);

  type InputMode = 'boxes' | 'units' | 'both';
  type SkuConfig = { units_per_box?: number; cost_per_unit?: number; cost_per_box?: number; input_mode?: InputMode };

  const inferUnitsPerBox = (text: string): number | undefined => {
    if (!text) return undefined;
    // Examples: "24 x 330ml", "24x330ml", "case of 24", "pack of 12", "12pk", "12/330ml", "x24"
    const patterns: RegExp[] = [
      /(\d+)\s*[xX×]/,               // 24 x 330
      /case\s*of\s*(\d+)/i,          // case of 24
      /pack\s*of\s*(\d+)/i,          // pack of 12
      /(\d+)\s*pk/i,                  // 12pk
      /(\d+)\s*\/\s*\d+/i,         // 24/330
      /x\s*(\d+)/i                    // x24
    ];
    for (const rx of patterns) {
      const m = text.match(rx);
      if (m && m[1]) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return undefined;
  };

  const parseSkuConfigFromNotes = (notes: string): SkuConfig => {
    const cfg: SkuConfig = {};
    if (!notes) return cfg;
    const jsonMatch = notes.match(/StockConfig:\s*(\{[\s\S]*?\})/i) || notes.match(/SCFG:\s*(\{[\s\S]*?\})/i);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]); } catch {}
    }
    // fallback key:value scanning
    notes.split(/\n|;/).forEach((line) => {
      const [kRaw, vRaw] = line.split(':');
      if (!kRaw || !vRaw) return;
      const k = kRaw.trim().toLowerCase();
      const v = vRaw.trim();
      if (k.includes('units_per_box')) cfg.units_per_box = Number(v);
      if (k.includes('cost_per_unit')) cfg.cost_per_unit = Number(v);
      if (k.includes('cost_per_box')) cfg.cost_per_box = Number(v);
      if (k.includes('input_mode')) cfg.input_mode = (v as InputMode);
    });
    if (!cfg.units_per_box) {
      const inferred = inferUnitsPerBox(notes);
      if (inferred) cfg.units_per_box = inferred;
    }
    return cfg;
  };

  const extractSCMetaFromNotes = (notes: string | null): any => {
    if (!notes) return null;
    const m = notes.match(/SCMeta:\s*(\{[\s\S]*?\})/);
    if (m) { try { return JSON.parse(m[1]); } catch { return null; } }
    return null;
  };

  const buildSCMetaNotes = (userNotes: string, meta: any) => {
    const clean = (userNotes || '').replace(/\n?SCMeta:\s*(\{[\s\S]*?\})/g, '').trim();
    const spacer = clean ? '\n' : '';
    return `${clean}${spacer}SCMeta: ${JSON.stringify(meta)}`;
  };

  const getProductById = (id: string) => products.find(p => p.id === id);

  const computeFor = (product: Product, boxes: number, units: number) => {
    const unitsPerBox = Number(product.units_per_box ?? 1) || 1;
    const totalUnits = (Number(boxes) || 0) * unitsPerBox + (Number(units) || 0);
    // Prefer explicit costs if present
    const costPerUnit = Number(product.cost_per_unit ?? product.unit_price ?? 0) || 0;
    const costPerBox = Number(product.cost_per_box ?? (unitsPerBox * costPerUnit)) || 0;
    const totalCost = (Number(boxes) || 0) * costPerBox + (Number(units) || 0) * costPerUnit;
    return { unitsPerBox, totalUnits, costPerUnit, costPerBox, totalCost };
  };

  const formatSmartStock = (totalUnits: number, unitsPerBox: number) => {
    const upb = unitsPerBox || 1;
    if (upb <= 0) return `${Number(totalUnits || 0)} units`;
    const boxes = Math.floor((totalUnits || 0) / upb);
    const remainder = Math.round((((totalUnits || 0) - boxes * upb) + Number.EPSILON) * 100) / 100;
    if (remainder === 0 && boxes > 0) return `${boxes} box${boxes === 1 ? '' : 'es'}`;
    if (boxes > 0) return `${boxes} box${boxes === 1 ? '' : 'es'} and ${remainder} units`;
    return `${remainder} units`;
  };

  const buildStockTemplate = () => {
    const header = [
      '# Stock Count Template',
      '# Format: CODE  # Product Name (unit) - case — notes • £/box • £/unit = quantity',
      '# Example: CODE123  # Example Product (1kg) - case — keep refrigerated • £24.00/box • £1.00/unit = 12.5',
      ''
    ];
    // Deduplicate by normalized supplier_product_code, prefer entries that have notes
    const codeToProduct = new Map<string, Product>();
    products.forEach(p => {
      const code = (p.supplier_product_code || '').toUpperCase().trim();
      if (!code) return;
      const existing = codeToProduct.get(code);
      if (!existing) {
        codeToProduct.set(code, p);
      } else if ((!existing.notes || existing.notes.length === 0) && p.notes && p.notes.length > 0) {
        codeToProduct.set(code, p);
      }
    });
    const unique = Array.from(codeToProduct.values());

    const lines = unique.map(p => {
      const entry = stockEntries.find(e => e.product_mapping_id === p.id);
      const quantity = entry ? entry.quantity : 0;
      const notesPart = p.notes ? ` — ${p.notes}` : '';
      const upb = Number(p.units_per_box ?? 1) || 1;
      const cpu = Number(p.cost_per_unit ?? p.unit_price ?? 0) || 0;
      const cpb = Number(p.cost_per_box ?? (upb * cpu)) || 0;
      return `${p.supplier_product_code}  # ${p.supplier_product_name} (${p.unit}) - case${notesPart} • £${cpb.toFixed(2)}/box • £${cpu.toFixed(2)}/unit = ${quantity}`;
    });
    return [...header, ...lines].join('\n');
  };

  useEffect(() => {
    if (products.length === 0) {
      setStockText('');
      return;
    }
    setStockText(buildStockTemplate());
  }, [products, stockEntries]);

  const parseStockText = (text: string) => {
    const lines = text.split(/\r?\n/);
    const updates: { productId: string; quantity: number }[] = [];
    const errors: string[] = [];
    const codeMap = new Map(products.map(p => [p.supplier_product_code.toUpperCase(), p]));
    lines.forEach((rawLine, index) => {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      // Extract code as the first token on the line
      const codeMatch = trimmed.match(/^([A-Za-z0-9._-]+)/);
      if (!codeMatch) {
        errors.push(`Line ${index + 1}: missing product code`);
        return;
      }
      const code = codeMatch[1].toUpperCase();

      // Quantity is the value after the last '=' on the line
      const eqIdx = trimmed.lastIndexOf('=');
      if (eqIdx === -1) {
        errors.push(`Line ${index + 1}: missing '=' for ${code}`);
        return;
      }
      let quantityStr = trimmed.slice(eqIdx + 1);
      // Remove any trailing inline comments after '='
      const hashIdx = quantityStr.indexOf('#');
      if (hashIdx !== -1) quantityStr = quantityStr.slice(0, hashIdx);
      quantityStr = quantityStr.trim();

      if (!quantityStr) {
        errors.push(`Line ${index + 1}: missing quantity for ${code}`);
        return;
      }
      const quantity = parseFloat(quantityStr);
      if (Number.isNaN(quantity)) {
        errors.push(`Line ${index + 1}: invalid quantity '${quantityStr}' for ${code}`);
        return;
      }

      const product = codeMap.get(code);
      if (!product) {
        errors.push(`Line ${index + 1}: unknown product code '${code}'`);
        return;
      }
      updates.push({ productId: product.id, quantity });
    });
    return { updates, errors };
  };

  const handleImportFromText = () => {
    const trimmed = importText.trim();
    if (!trimmed) {
      setTextFeedback('Please paste the stock text to import.');
      return;
    }
    const { updates, errors } = parseStockText(trimmed);
    if (errors.length > 0) {
      setTextFeedback(`Unable to import:\n${errors.join('\n')}`);
      return;
    }
    if (updates.length === 0) {
      setTextFeedback('No stock values detected.');
      return;
    }
    setStockEntries(prev => {
      const entryMap = new Map(prev.map(e => [e.product_mapping_id, e]));
      updates.forEach(({ productId, quantity }) => {
        const product = products.find(p => p.id === productId);
        const unitPrice = product?.unit_price ?? 0;
        const existing = entryMap.get(productId);
        if (existing) {
          entryMap.set(productId, { ...existing, quantity, unit_value: unitPrice });
        } else {
          entryMap.set(productId, {
            product_mapping_id: productId,
            quantity,
            unit_value: unitPrice,
            notes: ''
          });
        }
      });
      return Array.from(entryMap.values());
    });
    setImportText('');
    setTextFeedback(`Imported counts for ${updates.length} product${updates.length === 1 ? '' : 's'}.`);
  };

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(stockText);
      setTextFeedback('Template copied to clipboard.');
    } catch (error) {
      setTextFeedback('Unable to copy to clipboard. Please copy manually.');
    }
  };

  const handleClearImport = () => {
    setImportText('');
    setTextFeedback(null);
  };

  const loadSites = async () => {
    const { data } = await supabase
      .from('sites')
      .select('id, name')
      .neq('site_code', 'ALL')
      .eq('is_active', true)
      .order('name');

    if (data) {
      setSites(data);
      if (data.length > 0) setSelectedSite(data[0].id);
    }
  };

  const loadProducts = async () => {
    const { data } = await supabase
      .from('product_mappings')
      .select('id, supplier_product_code, supplier_product_name, category, unit, supplier_id, notes, unit_price')
      .order('category, supplier_product_name');

    if (data) {
      const enriched = (data as any[]).map((p) => {
        const cfg = parseSkuConfigFromNotes(p.notes || '');
        const isCaseUnit = /case|box|pack|tray/i.test(p.unit || '');
        const inferredUpb = inferUnitsPerBox(p.notes || '') || 1;
        const unitsPerBox = Number(cfg.units_per_box ?? p.units_per_box ?? inferredUpb ?? 1) || 1;
        const base = Number(p.unit_price ?? 0) || 0;
        let costPerBox = Number(cfg.cost_per_box ?? p.cost_per_box ?? (isCaseUnit ? base : 0));
        let costPerUnit = Number(cfg.cost_per_unit ?? p.cost_per_unit ?? (isCaseUnit ? (unitsPerBox ? base / unitsPerBox : base) : base));
        if (!isCaseUnit) {
          // If priced per unit, derive box cost from units
          if (!costPerBox) costPerBox = unitsPerBox * costPerUnit;
        } else {
          // If priced per case, ensure both present
          if (!costPerBox) costPerBox = base;
          if (!costPerUnit) costPerUnit = unitsPerBox ? costPerBox / unitsPerBox : base;
        }
        const inputMode = (cfg.input_mode ?? p.input_mode ?? 'both') as 'boxes' | 'units' | 'both';
        return {
          ...p,
          units_per_box: unitsPerBox,
          cost_per_unit: costPerUnit,
          cost_per_box: costPerBox,
          input_mode: inputMode,
        } as Product;
      });
      setProducts(enriched as any);
    }
  };

  const loadExistingCount = async () => {
    const { data } = await supabase
      .from('stock_counts')
      .select('*')
      .eq('site_id', selectedSite)
      .eq('count_date', countDate);

    if (data && data.length > 0) {
      setStockEntries(data.map(d => {
        const product = getProductById(d.product_mapping_id);
        const meta = extractSCMetaFromNotes(d.notes || '');
        const boxes = meta?.boxes ?? 0;
        const units = meta?.units ?? d.quantity ?? 0;
        const cfgUnitsPerBox = meta?.units_per_box ?? product?.units_per_box ?? 1;
        const costPerUnit = meta?.cost_per_unit ?? product?.cost_per_unit ?? product?.unit_price ?? 0;
        const costPerBox = meta?.cost_per_box ?? product?.cost_per_box ?? (cfgUnitsPerBox * costPerUnit);
        const totalUnits = (boxes * cfgUnitsPerBox) + units;
        const totalCost = boxes * costPerBox + units * costPerUnit;
        return {
          id: d.id,
          product_mapping_id: d.product_mapping_id,
          quantity: totalUnits,
          unit_value: costPerUnit,
          notes: (d.notes || '').replace(/\n?SCMeta:\s*(\{[\s\S]*?\})/g, '').trim(),
          boxes,
          units,
          units_per_box: cfgUnitsPerBox,
          cost_per_unit: costPerUnit,
          cost_per_box: costPerBox,
          total_cost: totalCost,
        } as StockCountEntry;
      }));
    } else {
      setStockEntries([]);
    }
  };

  const loadHistoricalCounts = async () => {
    let query = supabase
      .from('stock_counts')
      .select('*, sites(name), product_mappings(supplier_product_code, supplier_product_name, category)')
      .order('created_at', { ascending: false });

    if (historyDateFilter) {
      query = query.eq('count_date', historyDateFilter);
    }
    if (historySiteFilter) {
      query = query.eq('site_id', historySiteFilter);
    }

    const { data } = await query;
    if (data) setHistoricalCounts(data as any);
  };

  const handleBulkDeleteHistory = async () => {
    if (selectedHistoryItems.size === 0) {
      alert('Please select items to delete');
      return;
    }

    if (!confirm(`Delete ${selectedHistoryItems.size} selected items?`)) {
      return;
    }

    const { error } = await supabase
      .from('stock_counts')
      .delete()
      .in('id', Array.from(selectedHistoryItems));

    if (!error) {
      setSelectedHistoryItems(new Set());
      loadHistoricalCounts();
    }
  };

  const loadStockData = async () => {
    try {
      let query = supabase
        .from('stock_counts')
        .select(`
          count_date,
          quantity,
          unit_value,
          site_id,
          product_mappings!inner(unit_price)
        `)
        .order('count_date', { ascending: true });

      if (analyticsSiteFilter !== 'all') {
        query = query.eq('site_id', analyticsSiteFilter);
      }

      const { data: stockCounts } = await query;

      const dateMap: { [key: string]: { value: number; count: number } } = {};

      stockCounts?.forEach(count => {
        const date = count.count_date;
        const unitPrice = (count.product_mappings as any).unit_price || 0;
        const value = count.quantity * unitPrice;

        if (!dateMap[date]) {
          dateMap[date] = { value: 0, count: 0 };
        }
        dateMap[date].value += value;
        dateMap[date].count += count.quantity > 0 ? 1 : 0;
      });

      const stockArray: StockData[] = Object.keys(dateMap)
        .sort()
        .slice(-30)
        .map(date => ({
          date: new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
          stockValue: Math.round(dateMap[date].value * 100) / 100,
          itemCount: dateMap[date].count,
        }));

      setStockData(stockArray);

      const latestDate = Object.keys(dateMap).sort().pop();
      if (latestDate) {
        setCurrentStockValue(dateMap[latestDate].value);
        setCurrentItemCount(dateMap[latestDate].count);
      }
    } catch (error) {
      console.error('Error loading stock data:', error);
    }
  };

  const upsertEntry = (productMappingId: string, boxes: number, units: number) => {
    const product = getProductById(productMappingId);
    if (!product) return;
    const { unitsPerBox, totalUnits, costPerUnit, costPerBox, totalCost } = computeFor(product, boxes, units);
    const existing = stockEntries.find(e => e.product_mapping_id === productMappingId);
    const next = {
      product_mapping_id: productMappingId,
      boxes,
      units,
      units_per_box: unitsPerBox,
      quantity: totalUnits,
      cost_per_unit: costPerUnit,
      cost_per_box: costPerBox,
      unit_value: costPerUnit,
      total_cost: totalCost,
      notes: existing?.notes || '',
    } as StockCountEntry;
    if (existing) {
      setStockEntries(stockEntries.map(e => e.product_mapping_id === productMappingId ? { ...e, ...next } : e));
    } else {
      setStockEntries([...stockEntries, next]);
    }
  };

  const handleBoxesChange = (productMappingId: string, boxes: number) => {
    const existing = stockEntries.find(e => e.product_mapping_id === productMappingId);
    upsertEntry(productMappingId, Math.max(0, boxes), existing?.units || 0);
  };

  const handleUnitsChange = (productMappingId: string, units: number) => {
    const existing = stockEntries.find(e => e.product_mapping_id === productMappingId);
    upsertEntry(productMappingId, existing?.boxes || 0, Math.max(0, units));
  };

  const handleNotesChange = (productMappingId: string, notes: string) => {
    setStockEntries(stockEntries.map(e =>
      e.product_mapping_id === productMappingId ? { ...e, notes } : e
    ));
  };

  const handleAutoSave = async () => {
    if (!selectedSite) return;

    const entriesToSave = stockEntries.filter(e => e.quantity > 0);

    // Validate per-SKU input mode rules
    const violations: string[] = [];
    entriesToSave.forEach(e => {
      const p = getProductById(e.product_mapping_id);
      const mode = p?.input_mode || 'both';
      const bx = e.boxes || 0;
      const un = e.units || 0;
      if (mode === 'boxes' && un > 0) violations.push(`${p?.supplier_product_code}: units not allowed`);
      if (mode === 'units' && bx > 0) violations.push(`${p?.supplier_product_code}: boxes not allowed`);
      if (bx === 0 && un === 0) violations.push(`${p?.supplier_product_code}: enter boxes or units`);
    });
    if (violations.length > 0) {
      alert(`Please fix the following before saving:\n${violations.join('\n')}`);
      return;
    }
    if (entriesToSave.length === 0) return;

    await supabase
      .from('stock_counts')
      .delete()
      .eq('site_id', selectedSite)
      .eq('count_date', countDate);

    const dataToInsert = entriesToSave.map(entry => {
      const meta = {
        boxes: entry.boxes || 0,
        units: entry.units || 0,
        units_per_box: entry.units_per_box || 1,
        cost_per_unit: entry.cost_per_unit ?? entry.unit_value,
        cost_per_box: entry.cost_per_box ?? ((entry.units_per_box || 1) * (entry.cost_per_unit ?? entry.unit_value)),
        total_cost: entry.total_cost ?? (entry.quantity * entry.unit_value),
      };
      return {
        site_id: selectedSite,
        product_mapping_id: entry.product_mapping_id,
        quantity: entry.quantity,
        unit_value: entry.unit_value,
        count_date: countDate,
        counted_by: countedBy || null,
        notes: buildSCMetaNotes(entry.notes, meta),
      };
    });

    const { error } = await supabase
      .from('stock_counts')
      .insert(dataToInsert);

    if (!error) {
      setLastSaved(new Date());
    }
  };

  const handleSaveCount = async () => {
    if (!selectedSite) {
      alert('Please select a site');
      return;
    }

    if (!countedBy || countedBy.trim() === '') {
      alert('Please enter who counted the stock');
      return;
    }

    const entriesToSave = stockEntries.filter(e => e.quantity > 0);

    if (entriesToSave.length === 0) {
      alert('No items to save');
      return;
    }

    await supabase
      .from('stock_counts')
      .delete()
      .eq('site_id', selectedSite)
      .eq('count_date', countDate);

    const dataToInsert = entriesToSave.map(entry => {
      const meta = {
        boxes: entry.boxes || 0,
        units: entry.units || 0,
        units_per_box: entry.units_per_box || 1,
        cost_per_unit: entry.cost_per_unit ?? entry.unit_value,
        cost_per_box: entry.cost_per_box ?? ((entry.units_per_box || 1) * (entry.cost_per_unit ?? entry.unit_value)),
        total_cost: entry.total_cost ?? (entry.quantity * entry.unit_value),
      };
      return {
        site_id: selectedSite,
        product_mapping_id: entry.product_mapping_id,
        quantity: entry.quantity,
        unit_value: entry.unit_value,
        count_date: countDate,
        counted_by: countedBy || null,
        notes: buildSCMetaNotes(entry.notes, meta),
      };
    });

    const { error } = await supabase
      .from('stock_counts')
      .insert(dataToInsert);

    if (!error) {
      alert('Stock count saved successfully!');
      setLastSaved(new Date());
      loadExistingCount();
    } else {
      console.error('Error saving stock count:', error);
      alert(`Error saving stock count: ${error.message}`);
    }
  };

  const handleDeleteHistoricalEntry = async (id: string) => {
    if (confirm('Delete this entry?')) {
      await supabase.from('stock_counts').delete().eq('id', id);
      loadHistoricalCounts();
    }
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const handleExportPDF = () => {
    const siteName = sites.find(s => s.id === selectedSite)?.name || 'Unknown Site';

    const groupedData = categories.map(category => ({
      category,
      items: stockEntries
        .map(entry => {
          const product = products.find(p => p.id === entry.product_mapping_id);
          return { ...entry, product };
        })
        .filter(item => item.product?.category === category && item.quantity > 0),
    })).filter(g => g.items.length > 0);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Stock Count Report - ${siteName} - ${countDate}</title>
        <style>
          @media print {
            @page { margin: 1cm; }
          }
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            color: #000;
          }
          h1 { font-size: 24px; margin-bottom: 5px; }
          h2 { font-size: 18px; margin-top: 20px; margin-bottom: 10px; color: #333; }
          .header { margin-bottom: 20px; }
          .info { font-size: 14px; color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background-color: #f3f4f6; padding: 8px; text-align: left; border: 1px solid #ddd; font-size: 12px; }
          td { padding: 8px; border: 1px solid #ddd; font-size: 11px; }
          .total-row { font-weight: bold; background-color: #f9fafb; }
          .category-total { background-color: #e5e7eb; }
          .product-notes { font-size: 9px; color: #666; font-style: italic; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Stock Count Report</h1>
          <div class="info">
            <strong>Site:</strong> ${siteName}<br>
            <strong>Date:</strong> ${new Date(countDate).toLocaleDateString()}<br>
            ${countedBy ? `<strong>Counted By:</strong> ${countedBy}<br>` : ''}
            <strong>Generated:</strong> ${new Date().toLocaleString()}
          </div>
        </div>

        ${groupedData.map(group => `
          <h2>${group.category}</h2>
          <table>
            <thead>
              <tr>
                <th>Product Code</th>
                <th>Product Name</th>
                <th>Boxes</th>
                <th>Units</th>
                <th>Total Units</th>
                <th>Units/Box</th>
                <th>Cost/Unit (£)</th>
                <th>Cost/Box (£)</th>
                <th>Total Cost (£)</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${group.items.map(item => `
                <tr>
                  <td>${item.product?.supplier_product_code || '-'}</td>
                  <td>
                    ${item.product?.supplier_product_name || '-'}
                    ${item.product?.notes ? `<br><span class="product-notes">${item.product.notes}</span>` : ''}
                  </td>
                  <td>${item.boxes || 0}</td>
                  <td>${item.units || 0}</td>
                  <td>${item.quantity}</td>
                  <td>${item.units_per_box || ((item.product && item.product.unit) ? '' : '')}</td>
                  <td>£${(item.cost_per_unit ?? item.unit_value).toFixed(2)}</td>
                  <td>£${(item.cost_per_box ?? ((item.units_per_box || 1) * (item.cost_per_unit ?? item.unit_value))).toFixed(2)}</td>
                  <td>£${(item.total_cost ?? (item.quantity * (item.cost_per_unit ?? item.unit_value))).toFixed(2)}</td>
                  <td>${item.notes || '-'}</td>
                </tr>
              `).join('')}
              <tr class="category-total">
                <td colspan="8" style="text-align: right;"><strong>Category Total:</strong></td>
                <td><strong>£${group.items.reduce((sum, item) => sum + (item.total_cost ?? (item.quantity * (item.cost_per_unit ?? item.unit_value))), 0).toFixed(2)}</strong></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        `).join('')}

        <table style="margin-top: 30px;">
          <tr class="total-row">
            <td colspan="5" style="text-align: right; font-size: 14px;">GRAND TOTAL:</td>
            <td style="font-size: 14px;">£${totalValue.toFixed(2)}</td>
            <td></td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock-count-${siteName.replace(/\s+/g, '-')}-${countDate}.html`;
    link.click();
    URL.revokeObjectURL(url);

    setTimeout(() => {
      const printWindow = window.open(url);
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          setTimeout(() => {
            printWindow.print();
          }, 250);
        });
      }
    }, 100);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.supplier_product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.supplier_product_code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !categoryFilter || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const groupedProducts = categories.map(category => ({
    category,
    products: filteredProducts.filter(p => p.category === category),
  })).filter(g => g.products.length > 0);

  const totalValue = stockEntries.reduce((sum, e) => sum + (e.total_cost ?? (e.quantity * e.unit_value)), 0);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Stock Count</h1>
        <p className="text-gray-500 mt-1">Track and manage inventory across your sites</p>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('current')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'current'
              ? 'bg-orange-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Current Count
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'history'
              ? 'bg-orange-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <History className="w-4 h-4" />
          History
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'analytics'
              ? 'bg-orange-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Analytics
        </button>
      </div>

      {activeTab === 'current' ? (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Site</label>
                <select
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Count Date</label>
                <input
                  type="date"
                  value={countDate}
                  onChange={(e) => setCountDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Counted By</label>
                <input
                  type="text"
                  value={countedBy}
                  onChange={(e) => setCountedBy(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  onClick={handleSaveCount}
                  className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Count
                </button>
                <button
                  onClick={handleExportPDF}
                  disabled={stockEntries.length === 0}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  Export PDF
                </button>
              </div>
            </div>

            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-blue-900">Total Items: {stockEntries.filter(e => e.quantity > 0).length}</span>
                  {lastSaved && (
                    <span className="text-xs text-green-700 ml-4">
                      Auto-saved: {lastSaved.toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-sm text-blue-700">Estimated Value:</span>
                  <p className="text-2xl font-bold text-blue-900">£{totalValue.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            {textFeedback && (
              <div className="mb-4 px-4 py-3 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-800 whitespace-pre-line">
                {textFeedback}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col">
                <label className="text-sm font-semibold text-gray-700 mb-2">Current counts template</label>
                <textarea
                  value={stockText}
                  readOnly
                  className="flex-1 min-h-[200px] font-mono text-sm bg-gray-50 border border-gray-300 rounded-lg p-3 resize-none"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopyTemplate}
                    className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900 transition-colors"
                  >
                    Copy template
                  </button>
                </div>
              </div>
              <div className="flex flex-col">
                <label className="text-sm font-semibold text-gray-700 mb-2">Paste stock counts here</label>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={`Example:\nCODE123  # Example Product (1kg) - case = 12.5\nBEEF01  # Bulgogi Beef (1kg) - case = 6`}
                  className="flex-1 min-h-[200px] font-mono text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleImportFromText}
                    className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    Apply counts from text
                  </button>
                  <button
                    type="button"
                    onClick={handleClearImport}
                    className="px-4 py-2 bg-gray-100 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">All Categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {groupedProducts.map(group => {
              const isExpanded = expandedCategories.has(group.category);
              const categoryCount = stockEntries.filter(e =>
                group.products.some(p => p.id === e.product_mapping_id && e.quantity > 0)
              ).length;

              return (
                <div key={group.category} className="mb-4">
                  <button
                    onClick={() => toggleCategory(group.category)}
                    className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                      <span className="font-semibold text-gray-900">{group.category}</span>
                      <span className="text-sm text-gray-600">({group.products.length} items)</span>
                      {categoryCount > 0 && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                          {categoryCount} counted
                        </span>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-2 space-y-2">
                      {group.products.map(product => {
                        const entry = stockEntries.find(e => e.product_mapping_id === product.id);
                        return (
                          <div key={product.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{product.supplier_product_name}</p>
                              <p className="text-sm text-gray-500">{product.supplier_product_code} • {product.unit}</p>
                              {product.notes && (
                                <p className="text-xs text-gray-400 mt-1">{product.notes}</p>
                              )}
                            </div>
                            {(() => {
                              const mode = product.input_mode || 'both';
                              const showBoxes = mode !== 'units';
                              const showUnits = mode !== 'boxes';
                              const upb = product.units_per_box || 1;
                              const boxesVal: any = entry?.boxes ?? '';
                              const unitsVal: any = entry?.units ?? '';
                              const totalUnits = entry?.quantity || 0;
                              const smart = formatSmartStock(totalUnits, upb);
                              const cpu = entry?.cost_per_unit ?? product.cost_per_unit ?? product.unit_price ?? 0;
                              const cpb = entry?.cost_per_box ?? product.cost_per_box ?? (upb * cpu);
                              const totalCost = entry?.total_cost ?? (totalUnits * cpu);
                              return (
                                <>
                                  {showBoxes ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={boxesVal}
                                        onChange={(e) => handleBoxesChange(product.id, parseFloat(e.target.value) || 0)}
                                        placeholder="Boxes"
                                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                      />
                                      <span className="text-xs text-gray-600">boxes</span>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-400 w-28 text-center">Boxes disabled</div>
                                  )}
                                  {showUnits ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={unitsVal}
                                        onChange={(e) => handleUnitsChange(product.id, parseFloat(e.target.value) || 0)}
                                        placeholder="Units"
                                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                      />
                                      <span className="text-xs text-gray-600">units</span>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-400 w-28 text-center">Units disabled</div>
                                  )}
                                  <div
                                    className="text-xs text-gray-500 w-60"
                                    title={`Total ${totalUnits} units • ${Math.floor((totalUnits||0)/(upb||1))} boxes + ${(totalUnits||0) - Math.floor((totalUnits||0)/(upb||1))*(upb||1)} units`}
                                  >
                                    {smart} • {upb} units/box • £{cpb.toFixed(2)}/box • £{cpu.toFixed(2)}/unit • total £{(entry?.total_cost ?? totalCost).toFixed(2)}
                                  </div>
                                </>
                              );
                            })()}
                            <input
                              type="text"
                              value={entry?.notes || ''}
                              onChange={(e) => handleNotesChange(product.id, e.target.value)}
                              placeholder="Notes..."
                              className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : activeTab === 'history' ? (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Date</label>
                <input
                  type="date"
                  value={historyDateFilter}
                  onChange={(e) => setHistoryDateFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Site</label>
                <select
                  value={historySiteFilter}
                  onChange={(e) => setHistorySiteFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">All Sites</option>
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">
                Historical Counts ({historicalCounts.length})
              </h2>
              {selectedHistoryItems.size > 0 && (
                <button
                  onClick={handleBulkDeleteHistory}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                >
                  Delete Selected ({selectedHistoryItems.size})
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedHistoryItems.size === historicalCounts.length && historicalCounts.length > 0}
                        onChange={() => {
                          if (selectedHistoryItems.size === historicalCounts.length) {
                            setSelectedHistoryItems(new Set());
                          } else {
                            setSelectedHistoryItems(new Set(historicalCounts.map(c => c.id)));
                          }
                        }}
                        className="w-4 h-4 text-orange-500 rounded"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Counted By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Value</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {historicalCounts.map(count => (
                    <tr key={count.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedHistoryItems.has(count.id)}
                          onChange={() => {
                            const newSet = new Set(selectedHistoryItems);
                            if (newSet.has(count.id)) {
                              newSet.delete(count.id);
                            } else {
                              newSet.add(count.id);
                            }
                            setSelectedHistoryItems(newSet);
                          }}
                          className="w-4 h-4 text-orange-500 rounded"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div>{new Date(count.count_date).toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500">{new Date(count.created_at).toLocaleTimeString()}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{count.counted_by || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{count.sites.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {count.product_mappings?.supplier_product_code} - {count.product_mappings?.supplier_product_name}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                          {count.product_mappings?.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 text-right">{count.quantity}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 text-right">£{Number(count.unit_value).toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">
                        £{(count.quantity * Number(count.unit_value)).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{count.notes || '-'}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleDeleteHistoricalEntry(count.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {historicalCounts.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No historical counts found
                </div>
              )}
            </div>
          </div>
        </>
      ) : activeTab === 'analytics' ? (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900">Stock Analytics</h2>
              </div>
              <div className="flex gap-2">
                <select
                  value={analyticsSiteFilter}
                  onChange={(e) => setAnalyticsSiteFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All Sites</option>
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {stockData.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="text-sm text-blue-700 mb-1">Current Stock Value</div>
                    <div className="text-2xl font-bold text-blue-900">£{currentStockValue.toFixed(2)}</div>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="text-sm text-green-700 mb-1">Items in Stock</div>
                    <div className="text-2xl font-bold text-green-900">{currentItemCount}</div>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <div className="text-sm text-purple-700 mb-1">Avg Item Value</div>
                    <div className="text-2xl font-bold text-purple-900">
                      £{currentItemCount > 0 ? (currentStockValue / currentItemCount).toFixed(2) : '0.00'}
                    </div>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={stockData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="stockValue" stroke="#2563eb" strokeWidth={2} name="Stock Value (£)" />
                    <Line yAxisId="right" type="monotone" dataKey="itemCount" stroke="#16a34a" strokeWidth={2} name="Item Count" />
                  </LineChart>
                </ResponsiveContainer>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No stock count data available yet. Complete stock counts to see history.
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
