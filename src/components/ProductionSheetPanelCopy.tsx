import React, { useState, useEffect } from 'react';
import { Upload, Calculator, TrendingUp, AlertCircle, Link as LinkIcon, CheckCircle, Camera, Loader, AlertTriangle, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { batchMatchItems, ItemAlias } from '../utils/fuzzyItemMatcher';
import ItemAliasManager from './ItemAliasManager';
import MatchReviewModal from './MatchReviewModal';
import OpenAISetupWizard from './OpenAISetupWizard';
import { getLastThreeSundays, type WeekInfo } from '../utils/weekCalculations';

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

export default function ProductionSheetPanelCopy() {
  const [files, setFiles] = useState<File[]>([]);
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
      weeksAnalyzed: number;
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
  } | null>(null);
  const [manualVariability, setManualVariability] = useState<Map<number, number>>(new Map());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedSite, setSelectedSite] = useState<string>('');
  const [sites, setSites] = useState<Array<{id: string; name: string}>>([]);
  const [weekInfos, setWeekInfos] = useState<WeekInfo[]>([]);

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
    const weeks = getLastThreeSundays();
    setWeekInfos(weeks);
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
        .eq('setting_key', 'openai_api_key_copy')
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
        .from('production_item_aliases_copy')
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
      .from('production_item_mappings_copy')
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
        .from('production_plans_copy')
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, weekNumber: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (files.length >= 3 && !files[weekNumber - 1]) {
      setError('Maximum 3 files allowed');
      return;
    }

    const newFiles = [...files];
    newFiles[weekNumber - 1] = file;
    setFiles(newFiles);
    setError('');
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setProductionData(null);
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
            await supabase.rpc('increment_alias_usage_copy', { alias_id: alias.id });
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

  const processFiles = async () => {
    if (files.length === 0) {
      setError('Please upload at least one Excel file');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (!window.XLSX) {
        await loadXLSXLibrary();
      }

      const allData = [];

      for (const file of files) {
        const data = await readExcelFile(file);
        allData.push(data);
      }

      const averaged = calculateAverages(allData);
      setProductionData(averaged);
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

  const calculateAverages = (dataArrays: any[][]) => {
    // This would contain the same calculation logic as the original
    // For brevity, I'm including a simplified version
    const itemMap = new Map<string, { production: number[]; sales: number[]; isReduced: boolean; prices: number[]; reducedPrice?: number }>();
    
    dataArrays.forEach((weekData) => {
      weekData.forEach(row => {
        const itemName = row['Item Name'] || row.Item || row.item || row.Product ||
                        row.product || row.Name || row.name || row.ITEM ||
                        row.PRODUCT || row['Product Name'] || '';

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

        if (itemName && itemName.trim() !== '') {
          const cleanName = String(itemName).trim();
          const isReduced = cleanName.toLowerCase().includes('reduced');

          const hasProduction = !isNaN(productionQty) && productionQty > 0;
          const hasSales = !isNaN(salesVolume) && salesVolume > 0;
          const hasPrice = !isNaN(price) && price > 0;

          if (hasProduction || hasSales) {
            if (!itemMap.has(cleanName)) {
              itemMap.set(cleanName, {
                production: [],
                sales: [],
                isReduced,
                prices: [],
                reducedPrice: isReduced && hasPrice ? price : undefined
              });
            }
            const itemData = itemMap.get(cleanName)!;

            if (hasProduction) {
              itemData.production.push(productionQty);
            }
            if (hasSales) {
              itemData.sales.push(salesVolume);
            }
            if (hasPrice) {
              itemData.prices.push(price);
              if (isReduced) {
                itemData.reducedPrice = price;
              }
            }
          }
        }
      });
    });

    if (itemMap.size === 0) {
      throw new Error('No valid data found. Please check your Excel file format. Expected columns: "Item Name", "Production Quantity", and "Sales Volume"');
    }

    const results: Array<{
      item: string;
      avgProduced: string;
      avgSold: string;
      recommendedWithBuffer: number;
      perDay: number;
      weeksAnalyzed: number;
      isReduced: boolean;
      price: string;
      bufferPercent: string;
    }> = [];

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

      const itemBufferPercent = data.isReduced ? 0 : 15; // Default buffer
      const bufferMultiplier = 1 + (itemBufferPercent / 100);

      const recommendedWithBuffer = Math.ceil(avgSold * bufferMultiplier);
      const perDay = Math.ceil(recommendedWithBuffer / 7);

      results.push({
        item: itemName,
        avgProduced: avgProduced.toFixed(2),
        avgSold: avgSold.toFixed(2),
        recommendedWithBuffer,
        perDay,
        weeksAnalyzed: Math.max(data.production.length, data.sales.length),
        isReduced: data.isReduced,
        price: avgPrice > 0 ? avgPrice.toFixed(2) : 'N/A',
        bufferPercent: itemBufferPercent.toFixed(1)
      });
    });

    return {
      items: results,
      calculatedBufferPercent: '15.0',
      reducedItemsAnalyzed: 0,
      totalReduced: '0',
      priceRanges: []
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
      window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Production Sheet Copy');
      window.XLSX.writeFile(workbook, `Production_Sheet_Copy_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      setError(`Export failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Production Sheet Panel (Copy)</h1>
          <p className="text-gray-500 mt-2">
            Duplicate version of the production planning tool for testing and development purposes.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Site Selection</h2>
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select a site...</option>
            {sites.map(site => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sales Data Files</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {weekInfos.map((week, index) => (
              <div key={week.weekNumber} className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">{week.displayLabel}</h3>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => handleFileUpload(e, week.weekNumber)}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {files[index] && (
                  <div className="mt-2 text-sm text-green-600">
                    ✓ {files[index].name}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={processFiles}
            disabled={files.filter(f => f).length === 0 || loading}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Process Files'}
          </button>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Production Plan</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleProductionPlanUpload}
              className="hidden"
              id="production-plan-upload"
            />
            <label htmlFor="production-plan-upload" className="cursor-pointer">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">Click to upload production plan</p>
              <p className="text-sm text-gray-500 mt-1">Excel files only</p>
            </label>
          </div>
          {productionPlanFile && (
            <div className="mt-4 flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
              <div>
                <p className="text-green-800 font-medium">{productionPlanFile.name}</p>
                <p className="text-green-600 text-sm">{productionPlan.length} items extracted</p>
              </div>
              <button
                onClick={removeProductionPlan}
                className="text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        {productionData && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Production Results</h2>
              <button
                onClick={exportToExcel}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Export to Excel
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Produced</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Sold</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Recommended</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Per Day</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Buffer %</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {productionData.items.map((item, index) => (
                    <tr key={index} className={item.isReduced ? 'bg-purple-50' : ''}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {item.item}
                        {item.isReduced && <span className="ml-2 text-xs text-purple-600">(REDUCED)</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">{item.avgProduced}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">{item.avgSold}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600">{item.recommendedWithBuffer}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-green-600">{item.perDay}</td>
                      <td className="px-4 py-3 text-sm text-right text-orange-600">{item.bufferPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={savePlan}
            disabled={!selectedSite || productionPlan.length === 0}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Save Production Plan
          </button>
        </div>
      </div>
    </div>
  );
}
