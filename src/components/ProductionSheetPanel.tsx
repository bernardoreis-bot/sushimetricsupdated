import React, { useState, useEffect } from 'react';
import { Upload, Calculator, TrendingUp, AlertCircle, Link as LinkIcon, CheckCircle, Camera, Loader, AlertTriangle, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { batchMatchItems, ItemAlias } from '../utils/fuzzyItemMatcher';
import ItemAliasManager from './ItemAliasManager';
import MatchReviewModal from './MatchReviewModal';
import OpenAISetupWizard from './OpenAISetupWizard';

interface ProductionPlanItem {
  name: string;
  quantity: number;
}

interface ProductionItemMapping {
  id: string;
  production_plan_name: string;
  powerbi_item_name: string;
  site_id: string | null;
}


export default function ProductionSheetPanel() {
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [salesPeriodsUsed, setSalesPeriodsUsed] = useState<string[]>([]);
  const [productionPlanFile, setProductionPlanFile] = useState<File | null>(null);
  const [productionPlan, setProductionPlan] = useState<ProductionPlanItem[]>([]);
  const [productionMappings, setProductionMappings] = useState<ProductionItemMapping[]>([]);
  const [productionData, setProductionData] = useState<{
    items: Array<{
      item: string;
      avgProduced: string;
      avgSold: string;
      recommendedWithBuffer: number;
      perDay: number;
      periodsAnalyzed: number;
      isReduced: boolean;
      price: string;
      bufferPercent: string;
    }>;
    calculatedBufferPercent: string;
    reducedItemsAnalyzed: number;
    totalReduced: string;
    priceRanges: Array<{
      range: string;
      bufferPercent: string;
      baseRate: string;
      variability: string;
      itemCount: number;
      reducedPrice: number;
    }>;
    periodLabels?: string[];
  } | null>(null);
  const [manualVariability, setManualVariability] = useState<Map<number, number>>(new Map());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedSite, setSelectedSite] = useState<string>('');
  const [sites, setSites] = useState<Array<{id: string; name: string}>>([]);

  // Fuzzy matching state
  const [itemAliases, setItemAliases] = useState<ItemAlias[]>([]);
  const [matchResults, setMatchResults] = useState<{ matched: any[]; unmatched: any[]; matchRate: number } | null>(null);
  const [showAliasManager, setShowAliasManager] = useState(false);
  const [showMatchReview, setShowMatchReview] = useState(false);

  // Image processing state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imageProcessingStage, setImageProcessingStage] = useState('');
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [openaiConfigured, setOpenAIConfigured] = useState(false);
  const [checkingOpenAI, setCheckingOpenAI] = useState(true);

  useEffect(() => {
    loadProductionMappings();
    loadSites();
    loadItemAliases();
    checkOpenAIConfig();
  }, []);


  const checkOpenAIConfig = async () => {
    setCheckingOpenAI(true);
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'openai_api_key')
        .maybeSingle();

      setOpenAIConfigured(data?.setting_value && data.setting_value.length > 10);
    } catch (error) {
      console.error('Error checking OpenAI config:', error);
      setOpenAIConfigured(false);
    } finally {
      setCheckingOpenAI(false);
    }
  };

  const loadItemAliases = async () => {
    try {
      const { data, error } = await supabase
        .from('production_item_aliases')
        .select('*')
        .order('usage_count', { ascending: false });

      if (error) throw error;
      setItemAliases(data || []);
    } catch (err: any) {
      console.error('Error loading item aliases:', err);
    }
  };

  const loadProductionMappings = async () => {
    const { data, error } = await supabase
      .from('production_item_mappings')
      .select('*');

    if (error) {
      console.error('Error loading production mappings:', error);
    } else {
      setProductionMappings(data || []);
    }
  };

  const loadSites = async () => {
    const { data, error } = await supabase
      .from('sites')
      .select('id, name')
      .order('name');

    if (error) {
      console.error('Error loading sites:', error);
    } else {
      setSites(data || []);
    }
  };



  const savePlan = async () => {
    if (!selectedSite) {
      alert('Please select a site first');
      return;
    }

    if (productionPlan.length === 0) {
      alert('No production plan to save');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const planDate = prompt('Enter plan date (YYYY-MM-DD):', today);
    if (!planDate) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
      alert('Invalid date format. Please use YYYY-MM-DD format.');
      return;
    }

    try {
      const { error } = await supabase
        .from('production_plans')
        .insert({
          site_id: selectedSite,
          plan_date: planDate,
          plan_data: productionPlan,
          filename: productionPlanFile?.name || imageFile?.name || 'Unknown'
        });

      if (error) throw error;

      alert('Production plan saved successfully!');
    } catch (err: any) {
      console.error('Error saving plan:', err);
      alert('Error saving plan: ' + err.message);
    }
  };

  const handleSalesFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSalesFile(file);
    setError('');
  };

  const removeSalesFile = () => {
    setSalesFile(null);
    setProductionData(null);
    setSalesPeriodsUsed([]);
  };

  const parseDateValue = (value: any): Date | null => {
    if (!value && value !== 0) return null;
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value;
    }
    if (typeof value === 'number' && !Number.isNaN(value)) {
      const excelEpoch = new Date(Math.round((value - 25569) * 86400 * 1000));
      if (!isNaN(excelEpoch.getTime())) return excelEpoch;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const isoParsed = new Date(trimmed);
      if (!isNaN(isoParsed.getTime())) return isoParsed;
      const match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        let year = parseInt(match[3], 10);
        if (year < 100) year += 2000;
        const customDate = new Date(year, month, day);
        if (!isNaN(customDate.getTime())) return customDate;
      }
    }
    return null;
  };

  const extractDateFromRow = (row: any): Date | null => {
    const candidates = [
      'Date', 'date', 'DATE',
      'Transaction Date', 'transaction date', 'TRANSACTION DATE',
      'Week Ending', 'week ending', 'Week ending',
      'Period', 'period'
    ];
    for (const key of candidates) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        const parsed = parseDateValue(row[key]);
        if (parsed) return parsed;
      }
    }
    return null;
  };

  const groupRowsByRecentMonths = (rows: any[]) => {
    const monthMap = new Map<string, { label: string; rows: any[] }>();

    rows.forEach(row => {
      const dateValue = extractDateFromRow(row);
      if (!dateValue) return;
      const key = `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}`;
      const label = dateValue.toLocaleString('en-GB', { month: 'short', year: 'numeric' });

      if (!monthMap.has(key)) {
        monthMap.set(key, { label, rows: [] });
      }
      monthMap.get(key)!.rows.push(row);
    });

    const sortedKeys = Array.from(monthMap.keys()).sort((a, b) => (a < b ? 1 : -1));

    if (sortedKeys.length === 0) {
      return {
        dataArrays: rows.length ? [rows] : [],
        labels: rows.length ? ['All Data'] : []
      };
    }

    const selectedKeys = sortedKeys.slice(0, 3);
    const dataArrays = selectedKeys.map(key => monthMap.get(key)!.rows);
    const labels = selectedKeys.map(key => monthMap.get(key)!.label);

    return { dataArrays, labels };
  };

  const performFuzzyMatching = async (planItems: ProductionPlanItem[]) => {
    try {
      const availableItems = productionData?.items.map(item => item.item) || [];

      if (availableItems.length === 0) {
        console.log('No sales data available for matching yet');
        return;
      }

      const productionItemNames = planItems.map(item => item.name);

      const results = batchMatchItems(
        productionItemNames,
        availableItems,
        itemAliases,
        80
      );

      console.log('===== FUZZY MATCHING RESULTS =====');
      console.log(`Match Rate: ${results.matchRate.toFixed(1)}%`);
      console.log(`Matched: ${results.matched.length}/${productionItemNames.length}`);
      console.log(`Unmatched: ${results.unmatched.length}`);

      for (const match of results.matched) {
        if (match.aliasUsed) {
          const alias = itemAliases.find(
            a => a.production_item_name.toLowerCase() === match.productionItem.toLowerCase()
          );
          if (alias) {
            await supabase.rpc('increment_alias_usage', { alias_id: alias.id });
          }
        }
      }

      setMatchResults(results);

      if (results.unmatched.length > 0) {
        setShowMatchReview(true);
      }
    } catch (err: any) {
      console.error('Error performing fuzzy matching:', err);
    }
  };

  const processSalesFile = async () => {
    if (!salesFile) {
      setError('Please upload the consolidated sales Excel file');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (!window.XLSX) {
        await loadXLSXLibrary();
      }

      const fileData = await readExcelFile(salesFile);
      const { dataArrays, labels } = groupRowsByRecentMonths(fileData);

      if (dataArrays.length === 0) {
        throw new Error('No dated sales rows were found. Please ensure the file contains a Date column.');
      }

      const averaged = calculateAverages(dataArrays, labels);
      setProductionData(averaged);
      setSalesPeriodsUsed(averaged.periodLabels || []);
    } catch (err) {
      setError(`Error processing files: ${(err as Error).message}`);
      console.error('Processing error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadXLSXLibrary = () => {
    return new Promise<void>((resolve, reject) => {
      if (window.XLSX) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load XLSX library'));
      document.head.appendChild(script);
    });
  };

  const readExcelFile = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = window.XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

          console.log('Parsed data:', jsonData);
          resolve(jsonData);
        } catch (err) {
          reject(new Error(`Failed to parse ${file.name}: ${(err as Error).message}`));
        }
      };

      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsArrayBuffer(file);
    });
  };

  const calculateAverages = (dataArrays: any[][], periodLabels: string[] = []) => {
    const itemMap = new Map<string, { production: number[]; sales: number[]; isReduced: boolean; prices: number[]; reducedPrice?: number }>();
    const reducedItemsMap = new Map<string, number[]>();
    const reducedByPriceMap = new Map<number, { reducedQty: number; producedQty: number }>();

    dataArrays.forEach((periodRows) => {
      const periodItemMap = new Map<string, {
        productionSum: number;
        salesSum: number;
        priceSamples: number[];
        salesValueSum: number;
        isReduced: boolean;
      }>();

      periodRows.forEach(row => {
        const itemName = row['Item Name'] || row.Item || row.item || row.Product ||
                        row.product || row.Name || row.name || row.ITEM ||
                        row.PRODUCT || row['Product Name'] || '';

        if (!itemName || typeof itemName !== 'string' || itemName.trim() === '') {
          return;
        }

        const cleanName = String(itemName).trim();
        const isReduced = cleanName.toLowerCase().includes('reduced');

        const productionQty = parseFloat(
          row['Production Quantity'] || row['production quantity'] ||
          row['PRODUCTION QUANTITY'] || row['Production'] || row['production'] ||
          row['Produced'] || row['produced'] || 0
        );

        const salesVolume = parseFloat(
          row['Sales Volume'] || row['sales volume'] || row['SALES VOLUME'] ||
          row.Quantity || row.quantity || row.Sold || row.sold ||
          row.Volume || row.volume || 0
        );

        const salesValue = parseFloat(
          row['Sales Value'] || row['sales value'] || row['SALES VALUE'] ||
          row['Total Sales'] || row['total sales'] || row['Revenue'] || row['revenue'] ||
          row.Amount || row.amount || row.Sales || row.sales ||
          row['Total'] || row['total'] || 0
        );

        let price = parseFloat(
          row['Price'] || row['price'] || row['PRICE'] ||
          row['Unit Price'] || row['unit price'] || row['Cost'] || row['cost'] || 0
        );

        if ((isNaN(price) || price === 0) && !isNaN(salesValue) && !isNaN(salesVolume) && salesVolume > 0) {
          price = salesValue / salesVolume;
        }

        let itemAggregates = periodItemMap.get(cleanName);
        if (!itemAggregates) {
          itemAggregates = {
            productionSum: 0,
            salesSum: 0,
            priceSamples: [],
            salesValueSum: 0,
            isReduced
          };
          periodItemMap.set(cleanName, itemAggregates);
        }
        itemAggregates.isReduced = itemAggregates.isReduced || isReduced;

        if (!isNaN(productionQty) && productionQty > 0) {
          itemAggregates.productionSum += productionQty;
        }
        if (!isNaN(salesVolume) && salesVolume > 0) {
          itemAggregates.salesSum += salesVolume;
        }
        if (!isNaN(price) && price > 0) {
          itemAggregates.priceSamples.push(price);
        }
        if (!isNaN(salesValue) && salesValue > 0) {
          itemAggregates.salesValueSum += salesValue;
        }
      });

      periodItemMap.forEach((data, cleanName) => {
        if (data.productionSum <= 0 && data.salesSum <= 0) return;

        let avgPrice = 0;
        if (data.priceSamples.length > 0) {
          avgPrice = data.priceSamples.reduce((a, b) => a + b, 0) / data.priceSamples.length;
        } else if (data.salesSum > 0 && data.salesValueSum > 0) {
          avgPrice = data.salesValueSum / data.salesSum;
        }

        if (!itemMap.has(cleanName)) {
          itemMap.set(cleanName, {
            production: [],
            sales: [],
            isReduced: data.isReduced,
            prices: [],
            reducedPrice: data.isReduced && avgPrice > 0 ? avgPrice : undefined
          });
        }

        const itemData = itemMap.get(cleanName)!;
        itemData.isReduced = itemData.isReduced || data.isReduced;

        if (data.productionSum > 0) {
          itemData.production.push(data.productionSum);
        }
        if (data.salesSum > 0) {
          itemData.sales.push(data.salesSum);
        }
        if (avgPrice > 0) {
          itemData.prices.push(avgPrice);
          if (data.isReduced) {
            itemData.reducedPrice = avgPrice;
          }
        }

        if (data.isReduced && data.salesSum > 0) {
          if (!reducedItemsMap.has(cleanName)) {
            reducedItemsMap.set(cleanName, []);
          }
          reducedItemsMap.get(cleanName)!.push(data.salesSum);

          if (avgPrice > 0) {
            if (!reducedByPriceMap.has(avgPrice)) {
              reducedByPriceMap.set(avgPrice, { reducedQty: 0, producedQty: 0 });
            }
            reducedByPriceMap.get(avgPrice)!.reducedQty += data.salesSum;
          }
        }
      });
    });

    if (itemMap.size === 0) {
      throw new Error('No valid data found. Please check your Excel file format. Expected columns: "Item Name", "Production Quantity", and "Sales Volume"');
    }

    const reducedPriceRanges = [
      { reducedPrice: 2.50, minOriginal: 2.51, maxOriginal: 3.49, name: '£2.51-£3.49 → £2.50', buffer: 0, baseRate: 0, variability: 0 },
      { reducedPrice: 3.50, minOriginal: 3.60, maxOriginal: 4.49, name: '£3.60-£4.49 → £3.50', buffer: 0, baseRate: 0, variability: 0 },
      { reducedPrice: 4.50, minOriginal: 4.70, maxOriginal: 6.90, name: '£4.70-£6.90 → £4.50', buffer: 0, baseRate: 0, variability: 0 },
      { reducedPrice: 6.00, minOriginal: 7.00, maxOriginal: 9.99, name: '£7.00-£9.99 → £6.00', buffer: 0, baseRate: 0, variability: 0 },
      { reducedPrice: 7.50, minOriginal: 10.00, maxOriginal: 14.00, name: '£10.00-£14.00 → £7.50', buffer: 0, baseRate: 0, variability: 0 },
      { reducedPrice: 15.00, minOriginal: 16.00, maxOriginal: Infinity, name: '£16+ → £15.00', buffer: 0, baseRate: 0, variability: 0 }
    ];

    const reducedPriceStats = new Map<number, {
      totalReduced: number;
      totalProduced: number;
      itemCount: number;
      weeklyReductionRates: number[];
    }>();

    reducedByPriceMap.forEach((data, reducedPrice) => {
      if (!reducedPriceStats.has(reducedPrice)) {
        reducedPriceStats.set(reducedPrice, { totalReduced: 0, totalProduced: 0, itemCount: 0, weeklyReductionRates: [] });
      }
      reducedPriceStats.get(reducedPrice)!.totalReduced += data.reducedQty;
    });

    itemMap.forEach((data, itemName) => {
      if (!data.isReduced && data.prices.length > 0 && data.production.length > 0) {
        const avgPrice = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
        const avgProduction = data.production.reduce((a, b) => a + b, 0) / data.production.length;

        const matchingRange = reducedPriceRanges.find(r => avgPrice >= r.minOriginal && avgPrice <= r.maxOriginal);

        if (matchingRange) {
          if (!reducedPriceStats.has(matchingRange.reducedPrice)) {
            reducedPriceStats.set(matchingRange.reducedPrice, { totalReduced: 0, totalProduced: 0, itemCount: 0, weeklyReductionRates: [] });
          }
          const stats = reducedPriceStats.get(matchingRange.reducedPrice)!;
          stats.totalProduced += avgProduction;
          stats.itemCount++;

          if (data.production.length > 1) {
            for (let i = 0; i < data.production.length; i++) {
              const weekProduced = data.production[i];
              const weekSold = data.sales[i] || 0;
              const weekReductionRate = weekProduced > 0 ? (weekProduced - weekSold) / weekProduced : 0;
              stats.weeklyReductionRates.push(weekReductionRate);
            }
          }
        }
      }
    });

    reducedPriceStats.forEach((stats, reducedPrice) => {
      const range = reducedPriceRanges.find(r => r.reducedPrice === reducedPrice);
      if (range && stats.totalProduced > 0) {
        const baseReductionRate = (stats.totalReduced / stats.totalProduced) * 100;

        let variabilityBuffer = 5;
        if (stats.weeklyReductionRates.length > 1) {
          const mean = stats.weeklyReductionRates.reduce((a, b) => a + b, 0) / stats.weeklyReductionRates.length;
          const variance = stats.weeklyReductionRates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / stats.weeklyReductionRates.length;
          const stdDev = Math.sqrt(variance);

          const coefficientOfVariation = mean > 0 ? (stdDev / mean) * 100 : 5;
          variabilityBuffer = Math.max(3, Math.min(15, coefficientOfVariation));
        }

        const manualOverride = manualVariability.get(reducedPrice);
        const finalVariability = manualOverride !== undefined ? manualOverride : variabilityBuffer;

        range.baseRate = baseReductionRate;
        range.variability = finalVariability;
        range.buffer = baseReductionRate + finalVariability;
      } else if (range) {
        range.buffer = 20;
        range.baseRate = 15;
        range.variability = 5;
      }
    });

    const getBufferForPrice = (avgPrice: number): number => {
      const matchingRange = reducedPriceRanges.find(r => avgPrice >= r.minOriginal && avgPrice <= r.maxOriginal);
      return matchingRange ? matchingRange.buffer : 15;
    };

    let totalReduced = 0;
    let totalProduced = 0;
    let weightedBufferSum = 0;
    let totalItemsWithBuffer = 0;

    reducedItemsMap.forEach((sales) => {
      const avgReduced = sales.reduce((a, b) => a + b, 0) / sales.length;
      totalReduced += avgReduced;
    });

    itemMap.forEach((data) => {
      if (!data.isReduced && data.production.length > 0) {
        const avgProduced = data.production.reduce((a, b) => a + b, 0) / data.production.length;
        totalProduced += avgProduced;

        const avgPrice = data.prices && data.prices.length > 0
          ? data.prices.reduce((a, b) => a + b, 0) / data.prices.length
          : 0;
        const itemBuffer = getBufferForPrice(avgPrice);
        weightedBufferSum += itemBuffer * avgProduced;
        totalItemsWithBuffer += avgProduced;
      }
    });

    const averageBufferPercent = totalItemsWithBuffer > 0
      ? weightedBufferSum / totalItemsWithBuffer
      : 15;

    const results: Array<{
      item: string;
      avgProduced: string;
      avgSold: string;
      recommendedWithBuffer: number;
      perDay: number;
      periodsAnalyzed: number;
      isReduced: boolean;
      price: string;
      bufferPercent: string;
    }> = [];

    let totalRow = {
      avgProduced: 0,
      avgSold: 0,
      recommendedWithBuffer: 0,
      price: 0,
      priceCount: 0
    };

    itemMap.forEach((data, itemName) => {
      if (itemName.toLowerCase() === 'total') return;

      const avgProduced = data.production.length > 0
        ? data.production.reduce((a, b) => a + b, 0) / data.production.length
        : 0;
      const avgSold = data.sales.length > 0
        ? data.sales.reduce((a, b) => a + b, 0) / data.sales.length
        : 0;

      const avgPrice = data.prices && data.prices.length > 0
        ? data.prices.reduce((a, b) => a + b, 0) / data.prices.length
        : 0;

      const itemBufferPercent = data.isReduced ? 0 : getBufferForPrice(avgPrice);
      const bufferMultiplier = 1 + (itemBufferPercent / 100);

      const recommendedWithBuffer = Math.ceil(avgSold * bufferMultiplier);
      const perDay = Math.ceil(recommendedWithBuffer / 7);

      totalRow.avgProduced += avgProduced;
      totalRow.avgSold += avgSold;
      totalRow.recommendedWithBuffer += recommendedWithBuffer;
      if (avgPrice > 0) {
        totalRow.price += avgPrice;
        totalRow.priceCount++;
      }

      results.push({
        item: itemName,
        avgProduced: avgProduced.toFixed(2),
        avgSold: avgSold.toFixed(2),
        recommendedWithBuffer,
        perDay,
        periodsAnalyzed: Math.max(data.production.length, data.sales.length),
        isReduced: data.isReduced,
        price: avgPrice > 0 ? avgPrice.toFixed(2) : 'N/A',
        bufferPercent: itemBufferPercent.toFixed(1)
      });
    });

    const totalBufferPercent = totalRow.avgSold > 0
      ? ((totalRow.recommendedWithBuffer - totalRow.avgSold) / totalRow.avgSold * 100)
      : 0;

    results.unshift({
      item: 'Total',
      avgProduced: totalRow.avgProduced.toFixed(2),
      avgSold: totalRow.avgSold.toFixed(2),
      recommendedWithBuffer: totalRow.recommendedWithBuffer,
      perDay: Math.ceil(totalRow.recommendedWithBuffer / 7),
      periodsAnalyzed: dataArrays.length,
      isReduced: false,
      price: totalRow.priceCount > 0 ? (totalRow.price / totalRow.priceCount).toFixed(2) : 'N/A',
      bufferPercent: totalBufferPercent.toFixed(1)
    });

    results.sort((a, b) => {
      if (a.item.toLowerCase() === 'total') return -1;
      if (b.item.toLowerCase() === 'total') return 1;
      const priceA = parseFloat(a.price) || 0;
      const priceB = parseFloat(b.price) || 0;
      return priceA - priceB;
    });

    return {
      items: results,
      calculatedBufferPercent: averageBufferPercent.toFixed(1),
      reducedItemsAnalyzed: reducedItemsMap.size,
      totalReduced: totalReduced.toFixed(0),
      periodLabels,
      priceRanges: reducedPriceRanges
        .filter(r => {
          const stats = reducedPriceStats.get(r.reducedPrice);
          return stats && stats.itemCount > 0;
        })
        .map(r => {
          const stats = reducedPriceStats.get(r.reducedPrice)!;
          return {
            range: r.name,
            bufferPercent: r.buffer.toFixed(1),
            baseRate: r.baseRate.toFixed(1),
            variability: r.variability.toFixed(1),
            itemCount: stats.itemCount,
            reducedPrice: r.reducedPrice
          };
        })
    };
  };

  const handleProductionPlanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProductionPlanFile(file);
    setError('');

    try {
      if (!window.XLSX) {
        await loadXLSXLibrary();
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

          const rawData: any[][] = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: null });

          console.log('Production plan - Total rows in sheet:', rawData.length);
          console.log('First 10 rows:', rawData.slice(0, 10));

          const planItems: ProductionPlanItem[] = [];
          const seenItems = new Set<string>();
          const sectionHeaders = [
            'sides and snacks', 'variety bentos', 'selection boxes', 'signature set',
            'sharers', 'ready meals', 'classic rolls', 'specialty rolls', 'gyoza and bites',
            'boxes required for production', 'boxes required'
          ];
          const ignoreWords = ['product', 'number', 'total', 'subtotal', 'sum', 'count', 'qty', 'grand total'];

          console.log('=== STARTING PRODUCTION PLAN PARSING ===');
          console.log(`Total rows in sheet: ${rawData.length}`);

          rawData.forEach((row, rowIndex) => {
            if (!row || row.length === 0) return;

            const nonEmptyCells = row.filter(cell =>
              cell !== null && cell !== undefined && String(cell).trim() !== ''
            );

            if (nonEmptyCells.length < 2) return;

            let itemName = '';
            let quantity = 0;

            for (let i = 0; i < row.length; i++) {
              const cell1 = row[i];
              const cell2 = i + 1 < row.length ? row[i + 1] : null;

              if (!cell1 || cell1 === null || cell1 === undefined) continue;

              const str1 = String(cell1).trim();

              if (!str1) continue;

              if (cell2 !== null && cell2 !== undefined) {
                const str2 = String(cell2).trim();
                const num2 = parseFloat(str2);

                if (str1 && !isNaN(num2) && num2 > 0 && num2 < 10000) {
                  const lowerStr = str1.toLowerCase();

                  const isHeader = sectionHeaders.some(h => lowerStr === h || lowerStr.includes(h));
                  if (isHeader) {
                    continue;
                  }

                  const isIgnoreWord = ignoreWords.some(word => lowerStr === word);
                  if (isIgnoreWord) {
                    continue;
                  }

                  if (str1.length < 2) continue;

                  const hasLetter = /[a-zA-Z]/.test(str1);
                  const notOnlyNumber = !str1.match(/^\d+$/);

                  if (hasLetter && notOnlyNumber) {
                    itemName = str1.replace(/\*+$/, '').trim();
                    quantity = num2;
                    break;
                  }
                }
              }
            }

            if (itemName && quantity > 0) {
              const key = itemName.toLowerCase();
              if (!seenItems.has(key)) {
                seenItems.add(key);
                planItems.push({ name: itemName, quantity });
                console.log(`✓ Row ${rowIndex + 1}: "${itemName}" = ${quantity}`);
              }
            }
          });

          console.log('===== PARSING COMPLETE =====');
          console.log(`Total items found: ${planItems.length}`);
          console.log('All items:', planItems.map(p => `${p.name} (${p.quantity})`));

          setProductionPlan(planItems);

          if (planItems.length === 0) {
            setError('No valid items found in production plan. Please check the file format.');
          } else {
            setError('');
            performFuzzyMatching(planItems);
          }
        } catch (err) {
          setError(`Error parsing production plan: ${(err as Error).message}`);
          console.error('Parsing error:', err);
        }
      };

      reader.onerror = () => {
        setError('Failed to read file');
      };

      reader.readAsArrayBuffer(file);
    } catch (err) {
      setError(`Error processing production plan: ${(err as Error).message}`);
      console.error('Production plan error:', err);
    }
  };

  const removeProductionPlan = () => {
    setProductionPlanFile(null);
    setProductionPlan([]);
  };

  const findBestMatch = (itemName: string): ProductionPlanItem | null => {
    if (productionPlan.length === 0) return null;

    console.log(`Finding match for: "${itemName}"`);
    console.log(`Available mappings:`, productionMappings.map(m => ({
      powerbi: m.powerbi_item_name,
      production: m.production_plan_name
    })));

    const normalizedItemName = itemName.toLowerCase().trim();
    const manualMapping = productionMappings.find(
      mapping => mapping.powerbi_item_name.toLowerCase().trim() === normalizedItemName
    );

    console.log(`Manual mapping found:`, manualMapping);

    if (manualMapping) {
      console.log(`Looking for production plan item: "${manualMapping.production_plan_name}"`);
      console.log(`Available production plan items:`, productionPlan.map(p => p.name));

      const normalizedMappingName = manualMapping.production_plan_name.toLowerCase().trim();
      const mappedPlanItem = productionPlan.find(
        planItem => planItem.name.toLowerCase().trim() === normalizedMappingName
      );

      if (mappedPlanItem) {
        console.log(`✓ Match found via manual mapping: "${itemName}" → "${mappedPlanItem.name}"`);
        return mappedPlanItem;
      } else {
        console.log(`✗ No production plan item found for mapping: "${manualMapping.production_plan_name}"`);
      }
    }

    const normalize = (str: string) => {
      let normalized = str.toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

      normalized = normalized.replace(/^yo!?\s*/i, '');

      normalized = normalized.replace(/\s*p1\s*$/i, '');

      normalized = normalized.replace(/[^a-z0-9\s]/g, '');

      return normalized.trim();
    };

    const normalizedItem = normalize(itemName);
    let bestMatch: ProductionPlanItem | null = null;
    let highestScore = 0;

    productionPlan.forEach(planItem => {
      const normalizedPlan = normalize(planItem.name);

      if (normalizedItem === normalizedPlan) {
        bestMatch = planItem;
        highestScore = 100;
        return;
      }

      const words1 = normalizedItem.split(' ').filter(w => w.length > 0);
      const words2 = normalizedPlan.split(' ').filter(w => w.length > 0);
      const commonWords = words1.filter(w => words2.includes(w)).length;
      const score = (commonWords / Math.max(words1.length, words2.length)) * 100;

      if (score > highestScore && score > 50) {
        highestScore = score;
        bestMatch = planItem;
      }
    });

    return bestMatch;
  };

  const exportToExcel = async () => {
    if (!productionData) return;

    try {
      if (!window.XLSX) {
        await loadXLSXLibrary();
      }

      const exportData = productionData.items.map(item => ({
        'Item Name': item.item,
        'Price': item.price,
        'Average Produced': item.avgProduced,
        'Average Sold': item.avgSold,
        'Buffer %': item.bufferPercent,
        'Recommended Production': item.recommendedWithBuffer,
        'Per Day': item.perDay
      }));

      const worksheet = window.XLSX.utils.json_to_sheet(exportData);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Production Sheet');
      window.XLSX.writeFile(workbook, `Production_Sheet_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      setError(`Export failed: ${(err as Error).message}`);
    }
  };

  const handleImageProcess = async () => {
    console.log('handleImageProcess called');
    console.log('imageFile:', imageFile);
    console.log('openaiConfigured:', openaiConfigured);

    if (!imageFile || !openaiConfigured) {
      setError('Please select an image and ensure OpenAI API is configured');
      return;
    }

    setIsProcessingImage(true);
    setError('');

    try {
      setImageProcessingStage('Analyzing image with OpenAI...');
      console.log('Starting image processing...');

      const formData = new FormData();
      formData.append('image', imageFile);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-production-image`;
      console.log('API URL:', apiUrl);

      const { data: { session } } = await supabase.auth.getSession();
      console.log('Session obtained:', !!session);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
        body: formData
      });

      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Response result:', result);

      if (!result.success) {
        setError(result.error || 'Failed to process image');
        return;
      }

      setImageProcessingStage('Extracting items...');

      const extractedItems: ProductionPlanItem[] = (result.items || []).map((item: any) => ({
        name: item.productName || item.name || item.itemName || '',
        quantity: item.quantity || 0
      })).filter((item: ProductionPlanItem) => item.name && item.quantity > 0);

      console.log('Extracted items:', extractedItems);

      if (extractedItems.length === 0) {
        setError('No items found in the image. Please try a clearer image.');
        return;
      }

      setProductionPlan(extractedItems);
      setProductionPlanFile(new File([], imageFile.name));

      setImageProcessingStage('Complete!');

      performFuzzyMatching(extractedItems);

      setError('');
      console.log('Image processing complete');
    } catch (err) {
      console.error('Image processing error:', err);
      setError(`Processing failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessingImage(false);
      setImageProcessingStage('');
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-orange-500" />
              <h1 className="text-3xl font-bold text-gray-800">Production Sheet Calculator</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAliasManager(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                title="Manage item alias mappings"
              >
                <LinkIcon className="w-4 h-4" />
                Item Aliases ({itemAliases.length})
              </button>
            </div>
          </div>

          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <label className="block">
              <span className="text-sm font-semibold text-gray-700 mb-2 block">Select Site for This Production Plan:</span>
              <select
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="">-- Select a site --</option>
                {sites.map(site => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </select>
            </label>
          </div>


          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Upload className="w-5 h-5 text-gray-600" />
              <span className="text-lg font-semibold text-gray-700">Step 1: Upload Consolidated Sales History</span>
            </div>

            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200 mb-4 space-y-2 text-sm text-gray-700">
              <p>
                Upload a <strong>single Excel file</strong> that contains all sales rows for recent months. The system will automatically detect the last 3 months present in the file.
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Required columns: <strong>Site Name</strong>, <strong>Date</strong>, <strong>Item Name</strong>, <strong>Sales Volume</strong>, <strong>Production Quantity</strong> (optional) and <strong>Sales Value</strong> or <strong>Price</strong>.</li>
                <li>Multiple sites can be included; the tool filters by item names regardless of site.</li>
                {salesPeriodsUsed.length > 0 && (
                  <li>
                    Using data from:&nbsp;
                    <strong>{salesPeriodsUsed.join(' • ')}</strong>
                  </li>
                )}
              </ul>
            </div>

            <label className="block">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleSalesFileUpload}
                className="block w-full text-sm text-gray-600 file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
              />
            </label>

            {salesFile && (
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white border border-gray-200 rounded-lg p-3 gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{salesFile.name}</p>
                  <p className="text-xs text-gray-500">
                    {(salesFile.size / (1024 * 1024)).toFixed(2)} MB • Last modified {new Date(salesFile.lastModified).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={removeSalesFile}
                  className="text-red-600 hover:text-red-800 text-sm font-semibold"
                >
                  Remove file
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <p className="text-red-700 font-medium">{error}</p>
              </div>
            </div>
          )}

          <button
            onClick={processSalesFile}
            disabled={!salesFile || loading}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 transition-colors mb-8"
          >
            <Calculator className="w-5 h-5" />
            {loading ? 'Processing...' : 'Calculate Production Requirements'}
          </button>

          {productionData && (
            <>
              <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${openaiConfigured ? 'bg-green-100' : 'bg-amber-100'}`}>
                      <Settings className={`w-6 h-6 ${openaiConfigured ? 'text-green-600' : 'text-amber-600'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">OpenAI API Status (For Image Upload)</h3>
                      {checkingOpenAI ? (
                        <p className="text-sm text-gray-600 flex items-center gap-2">
                          <Loader className="w-4 h-4 animate-spin" />
                          Checking...
                        </p>
                      ) : openaiConfigured ? (
                        <p className="text-sm text-green-600 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          Configured - Image upload available
                        </p>
                      ) : (
                        <p className="text-sm text-amber-600 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          Not configured - Set up to use image upload
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSetupWizard(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Settings className="w-5 h-5" />
                    {openaiConfigured ? 'Update' : 'Setup'} API Key
                  </button>
                </div>
              </div>

              <div className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <Camera className="w-6 h-6 text-blue-600" />
                  Step 2: Production Plan Upload
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  Upload an image of your production plan or an Excel file. The system will match items with your sales data automatically.
                </p>

                {!openaiConfigured && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      <strong>Note:</strong> OpenAI API key required for image upload. Click "Setup API Key" above to configure.
                    </p>
                  </div>
                )}

                <div className="mb-4">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (!file.type.startsWith('image/')) {
                            setError('Please select a valid image file');
                            return;
                          }
                          setImageFile(file);
                          setImagePreview(URL.createObjectURL(file));
                          setError('');
                        }
                      }}
                      className="hidden"
                      id="image-upload-production"
                      disabled={!openaiConfigured}
                    />
                    <label htmlFor="image-upload-production" className={`cursor-pointer ${!openaiConfigured ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <Camera className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600 font-medium">Click to upload production plan image</p>
                      <p className="text-sm text-gray-500 mt-1">PNG, JPG up to 10MB</p>
                    </label>
                  </div>
                </div>

                {imagePreview && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Preview:</p>
                    <img src={imagePreview} alt="Preview" className="w-full h-64 object-contain border border-gray-200 rounded-lg" />
                  </div>
                )}

                <button
                  onClick={handleImageProcess}
                  disabled={!imageFile || !openaiConfigured || isProcessingImage}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 mb-4"
                >
                  {isProcessingImage ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      {imageProcessingStage || 'Processing...'}
                    </>
                  ) : (
                    <>
                      <Camera className="w-5 h-5" />
                      Process Image & Extract Items
                    </>
                  )}
                </button>

                <div className="flex items-center gap-4 my-4">
                  <div className="flex-1 h-px bg-gray-300"></div>
                  <span className="text-gray-500 font-semibold">OR</span>
                  <div className="flex-1 h-px bg-gray-300"></div>
                </div>

                <div>
                  <label className="block mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Upload className="w-5 h-5 text-gray-600" />
                      <span className="text-sm font-semibold text-gray-700">Upload Production Plan Excel</span>
                    </div>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleProductionPlanUpload}
                      className="block w-full text-sm text-gray-600 file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                    />
                  </label>

                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-700">
                      <strong>Expected format:</strong> Excel file with "Product" (or "Item Name") and "Number" (or "Quantity") columns
                    </p>
                  </div>
                </div>
              </div>

              {productionPlanFile && (
                <div className="mt-4 mb-8">
                  <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg mb-3">
                    <span className="text-sm text-gray-700 font-medium">
                      Production Plan: {productionPlanFile.name} ({productionPlan.length} items)
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={savePlan}
                        className="px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 font-semibold"
                      >
                        Save Plan
                      </button>
                      <button
                        onClick={removeProductionPlan}
                        className="text-red-600 hover:text-red-800 text-sm font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {selectedSite ? (
                    <p className="text-xs text-gray-600">
                      This plan will be saved for: <strong>{sites.find(s => s.id === selectedSite)?.name}</strong>
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600 font-semibold">
                      ⚠️ Please select a site above before saving
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {productionData && (
            <div>
              {productionData.priceRanges.length > 0 && (
                <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-300">
                  <h3 className="font-semibold text-gray-800 mb-3 text-lg">Buffer by Price Range</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {productionData.priceRanges.map((range, idx) => (
                      <div key={idx} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                        <div className="text-sm font-semibold text-gray-700 mb-2">{range.range}</div>
                        <div className="text-2xl font-bold text-green-700 mb-2">{range.bufferPercent}%</div>
                        <div className="text-xs text-gray-600 space-y-1 mb-3">
                          <div>Base rate: <span className="font-semibold">{range.baseRate}%</span></div>
                          <div>Variability: <span className="font-semibold">{range.variability}%</span></div>
                          <div>{range.itemCount} items</div>
                        </div>
                        <div className="mt-2">
                          <label className="text-xs text-gray-600 block mb-1">Adjust Variability %:</label>
                          <input
                            type="number"
                            min="0"
                            max="50"
                            step="0.5"
                            value={manualVariability.get(range.reducedPrice) ?? range.variability}
                            onChange={(e) => {
                              const newVariability = parseFloat(e.target.value) || 0;
                              const newMap = new Map(manualVariability);
                              newMap.set(range.reducedPrice, newVariability);
                              setManualVariability(newMap);
                              processSalesFile();
                            }}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800">Production Requirements</h2>
                <button
                  onClick={exportToExcel}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  Export to Excel
                </button>
              </div>

              <div className="overflow-x-auto" style={{maxWidth: '100%', width: '100%'}}>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
                      <th className="p-2 text-left font-semibold">Item</th>
                      <th className="p-2 text-right font-semibold whitespace-nowrap">Price</th>
                      <th className="p-2 text-right font-semibold whitespace-nowrap">Avg Prod</th>
                      <th className="p-2 text-right font-semibold whitespace-nowrap">Avg Sold</th>
                      <th className="p-2 text-right font-semibold whitespace-nowrap">Buffer %</th>
                      <th className="p-2 text-right font-semibold bg-green-700 whitespace-nowrap">Rec/Week</th>
                      <th className="p-2 text-right font-semibold bg-green-600 whitespace-nowrap">Rec/Day</th>
                      {productionPlan.length > 0 && (
                        <>
                          <th className="p-2 text-right font-semibold bg-blue-700 whitespace-nowrap">Plan/Week</th>
                          <th className="p-2 text-right font-semibold bg-blue-600 whitespace-nowrap">Plan/Day</th>
                          <th className="p-2 text-right font-semibold bg-purple-700 whitespace-nowrap">Week Diff</th>
                          <th className="p-2 text-right font-semibold bg-purple-600 whitespace-nowrap">Day Diff</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {productionData.items.map((item, index) => {
                      const match = findBestMatch(item.item);
                      const planQtyDay = match ? match.quantity : 0;
                      const planQtyWeek = match ? match.quantity * 7 : 0;
                      const weeklyDiff = match ? planQtyWeek - item.recommendedWithBuffer : 0;
                      const dailyDiff = match ? planQtyDay - item.perDay : 0;
                      const hasDailyDiff = match && dailyDiff !== 0;

                      let rowBgColor = index % 2 === 0 ? 'bg-gray-50' : 'bg-white';
                      if (item.item.toLowerCase() === 'total') {
                        rowBgColor = 'bg-orange-100 font-bold';
                      }

                      return (
                        <tr key={index} className={rowBgColor}>
                          <td className="p-2 font-medium text-gray-800 border-b">
                            <div className="flex items-center gap-1">
                              {match && <span className="text-green-600 font-bold">✓</span>}
                              <span className={item.item.toLowerCase() === 'total' ? 'font-bold' : ''}>{item.item}</span>
                            </div>
                          </td>
                          <td className="p-2 text-right text-gray-600 border-b whitespace-nowrap">£{item.price}</td>
                          <td className="p-2 text-right text-gray-700 border-b">{item.avgProduced}</td>
                          <td className="p-2 text-right font-semibold text-blue-600 border-b">{item.avgSold}</td>
                          <td className="p-2 text-right font-semibold text-amber-700 border-b">{item.bufferPercent}%</td>
                          <td className="p-2 text-right font-bold text-green-700 border-b bg-green-50">{item.recommendedWithBuffer}</td>
                          <td className={`p-2 text-right font-bold border-b bg-green-50 ${
                            hasDailyDiff ? 'text-red-700' : 'text-green-700'
                          }`}>{item.perDay}</td>
                          {productionPlan.length > 0 && (
                            <>
                              <td className="p-2 text-right font-bold text-blue-700 border-b bg-blue-50">
                                {match ? planQtyWeek : '-'}
                              </td>
                              <td className="p-2 text-right font-bold text-blue-700 border-b bg-blue-50">
                                {match ? planQtyDay : '-'}
                              </td>
                              <td className={`p-2 text-right font-bold border-b bg-purple-50 ${
                                !match ? 'text-gray-400' :
                                weeklyDiff > 0 ? 'text-green-700' :
                                weeklyDiff < 0 ? 'text-red-700' :
                                'text-gray-600'
                              }`}>
                                {match ? (weeklyDiff > 0 ? `+${weeklyDiff}` : weeklyDiff) : '-'}
                              </td>
                              <td className={`p-2 text-right font-bold border-b bg-purple-50 ${
                                !match ? 'text-gray-400' :
                                dailyDiff > 0 ? 'text-green-700' :
                                dailyDiff < 0 ? 'text-red-700' :
                                'text-gray-600'
                              }`}>
                                {match ? (dailyDiff > 0 ? `+${dailyDiff}` : dailyDiff) : '-'}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {matchResults && productionPlan.length > 0 && (
                <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border-2 border-green-300">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      Fuzzy Matching Results
                    </h3>
                    <div className="text-2xl font-bold text-green-600">
                      {matchResults.matchRate.toFixed(1)}%
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div className="bg-white p-3 rounded-lg border border-green-200">
                      <div className="text-sm text-gray-600">Matched Items</div>
                      <div className="text-2xl font-bold text-green-600">
                        {matchResults.matched.length} / {productionPlan.length}
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-orange-200">
                      <div className="text-sm text-gray-600">Needs Review</div>
                      <div className="text-2xl font-bold text-orange-600">
                        {matchResults.unmatched.length}
                      </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-blue-200">
                      <div className="text-sm text-gray-600">Using Aliases</div>
                      <div className="text-2xl font-bold text-blue-600">
                        {matchResults.matched.filter(m => m.aliasUsed).length}
                      </div>
                    </div>
                  </div>
                  {matchResults.unmatched.length > 0 && (
                    <button
                      onClick={() => setShowMatchReview(true)}
                      className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium flex items-center justify-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4" />
                      Review {matchResults.unmatched.length} Unmatched Item{matchResults.unmatched.length !== 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              )}

              {productionPlan.length > 0 && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-semibold text-gray-800 mb-3">All Production Plan Items ({productionPlan.length})</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {productionPlan.map((planItem, idx) => (
                      <div key={idx} className="bg-white p-3 rounded border border-gray-200">
                        <div className="font-medium text-gray-800 text-sm">{planItem.name}</div>
                        <div className="text-xs text-blue-600 font-semibold">Qty: {planItem.quantity}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6">
                <div className="p-4 bg-orange-50 rounded-lg">
                  <h3 className="font-semibold text-gray-800 mb-2">Summary</h3>
                  <p className="text-sm text-gray-600">
                    Total Items: <span className="font-bold">{productionData.items.length - 1}</span> |
                    Analysis based on <span className="font-bold">{salesPeriodsUsed.length || 1}</span> month(s) of sales data |
                    Weighted Avg Buffer: <span className="font-bold">{productionData.calculatedBufferPercent}%</span>
                    (Total reduced units: {productionData.totalReduced} across {productionData.reducedItemsAnalyzed} item types)
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAliasManager && (
        <ItemAliasManager
          onClose={() => setShowAliasManager(false)}
          onAliasAdded={loadItemAliases}
        />
      )}

      {showMatchReview && matchResults && matchResults.unmatched.length > 0 && (
        <MatchReviewModal
          unmatchedItems={matchResults.unmatched}
          onClose={() => setShowMatchReview(false)}
          onSaveMatches={() => {
            loadItemAliases();
            setShowMatchReview(false);
            if (productionPlan.length > 0) {
              performFuzzyMatching(productionPlan);
            }
          }}
        />
      )}

      {showSetupWizard && (
        <OpenAISetupWizard
          onComplete={() => {
            setShowSetupWizard(false);
            checkOpenAIConfig();
          }}
        />
      )}
    </div>
  );
}

declare global {
  interface Window {
    XLSX: any;
  }
}
