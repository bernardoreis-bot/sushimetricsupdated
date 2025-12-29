import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Camera, Upload, CheckCircle, XCircle, Loader, AlertTriangle, Key, Settings, Save, Info } from 'lucide-react';
import { parseSalesDataFile, mergeSalesData, calculateReducedPriceMapping, type SalesDataItem, type ParsedSalesData } from '../utils/salesDataParser';
import { matchProductionItems, type ProductionMatch } from '../utils/productionItemMatcher';
import { calculateProductionRequirements, generateSalesDataMap, type ProductionSummary } from '../utils/productionCalculator';
import { getLastThreeSundays, type WeekInfo } from '../utils/weekCalculations';
import OpenAISetupWizard from './OpenAISetupWizard';

interface Site {
  id: string;
  name: string;
}

interface StoredSalesData {
  id: string;
  week_number: number;
  week_ending_date: string;
  file_name: string;
  parsed_items: SalesDataItem[];
  unique_items: string[];
  item_count: number;
}

export default function ProductionImageBetaCopy() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState('');
  const [weeks] = useState<WeekInfo[]>(getLastThreeSundays());

  const [salesFiles, setSalesFiles] = useState<{week1?: File, week2?: File, week3?: File}>({});
  const [storedSalesData, setStoredSalesData] = useState<Map<number, StoredSalesData>>(new Map());
  const [salesData, setSalesData] = useState<ParsedSalesData | null>(null);
  const [parsingSales, setParsingSales] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [storedProductionImage, setStoredProductionImage] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [progress, setProgress] = useState(0);

  const [productionMatches, setProductionMatches] = useState<ProductionMatch[]>([]);
  const [productionSummary, setProductionSummary] = useState<ProductionSummary | null>(null);
  const [showResults, setShowResults] = useState(false);

  const [error, setError] = useState('');
  const [diagnosticLog, setDiagnosticLog] = useState<string[]>([]);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [openaiConfigured, setOpenAIConfigured] = useState(false);
  const [checkingOpenAI, setCheckingOpenAI] = useState(true);

  useEffect(() => {
    loadSites();
    checkOpenAIConfig();
  }, []);

  useEffect(() => {
    if (selectedSite) {
      loadStoredSalesData();
    }
  }, [selectedSite]);

  useEffect(() => {
    if (selectedSite && salesData) {
      loadStoredProductionImage();
    }
  }, [selectedSite, salesData]);

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

  const loadSites = async () => {
    const { data } = await supabase
      .from('sites')
      .select('id, name')
      .neq('name', 'All Sites')
      .order('name');
    if (data) setSites(data);
  };

  const loadStoredSalesData = async () => {
    if (!selectedSite) return;

    const weekDates = weeks.map(w => w.formattedDate);
    const { data } = await supabase
      .from('site_sales_data_uploads_copy')
      .select('*')
      .eq('site_id', selectedSite)
      .in('week_ending_date', weekDates);

    if (data) {
      const dataMap = new Map<number, StoredSalesData>();
      data.forEach(item => {
        dataMap.set(item.week_number, item);
      });
      setStoredSalesData(dataMap);

      if (data.length > 0) {
        const allItems: SalesDataItem[] = [];
        data.forEach(week => {
          if (week.parsed_items) {
            allItems.push(...week.parsed_items);
          }
        });
        const merged = mergeSalesData(
          data.find(d => d.week_number === 1)?.parsed_items,
          data.find(d => d.week_number === 2)?.parsed_items,
          data.find(d => d.week_number === 3)?.parsed_items
        );
        setSalesData(merged);
      }
    }
  };

  const loadStoredProductionImage = async () => {
    if (!selectedSite) return;

    const latestWeek = weeks[weeks.length - 1];
    const { data } = await supabase
      .from('site_production_images_copy')
      .select('*')
      .eq('site_id', selectedSite)
      .eq('week_ending_date', latestWeek.formattedDate)
      .maybeSingle();

    if (data) {
      setStoredProductionImage(data);
      if (data.production_matches) {
        setProductionMatches(data.production_matches);

        // Recalculate production summary from stored matches
        if (salesData) {
          const salesMap = generateSalesDataMap(salesData.items);
          const summary = calculateProductionRequirements(data.production_matches, salesMap);
          setProductionSummary(summary);
        }

        setShowResults(true);
      }
    } else {
      // Clear results if no stored data
      setStoredProductionImage(null);
      setProductionMatches([]);
      setProductionSummary(null);
      setShowResults(false);
    }
  };

  const addLog = (message: string) => {
    setDiagnosticLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    console.log('[Log]', message);
  };

  const handleSalesFileSelect = (weekNumber: 1 | 2 | 3, file: File | null) => {
    if (!file) {
      setSalesFiles(prev => {
        const newFiles = { ...prev };
        delete newFiles[`week${weekNumber}`];
        return newFiles;
      });
      return;
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Please select a valid Excel file (.xlsx or .xls)');
      return;
    }

    setSalesFiles(prev => ({ ...prev, [`week${weekNumber}`]: file }));
    addLog(`Week ${weekNumber} file selected: ${file.name}`);
  };

  const uploadSalesData = async () => {
    if (!selectedSite) {
      setError('Please select a site first');
      return;
    }

    const filesToUpload = Object.entries(salesFiles).filter(([_, file]) => file !== undefined);
    if (filesToUpload.length === 0) {
      setError('Please upload at least one sales data file');
      return;
    }

    setParsingSales(true);
    addLog(`Parsing and uploading ${filesToUpload.length} sales data file(s)...`);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      for (const [weekKey, file] of filesToUpload) {
        const weekNumber = parseInt(weekKey.replace('week', '')) as 1 | 2 | 3;
        const weekInfo = weeks.find(w => w.weekNumber === weekNumber);

        if (!weekInfo || !file) continue;

        const parsedData = await parseSalesDataFile(file, weekKey as 'week1' | 'week2' | 'week3');
        const uniqueItems = [...new Set(parsedData.map(item => item.itemName.toLowerCase()))];

        await supabase
          .from('site_sales_data_uploads_copy')
          .upsert({
            site_id: selectedSite,
            week_number: weekNumber,
            week_ending_date: weekInfo.formattedDate,
            file_name: file.name,
            parsed_items: parsedData,
            unique_items: uniqueItems,
            item_count: parsedData.length,
            uploaded_by: user?.id
          }, {
            onConflict: 'site_id,week_number,week_ending_date'
          });

        addLog(`Week ${weekNumber} saved: ${parsedData.length} items`);
      }

      await loadStoredSalesData();
      setSalesFiles({});
      setError('');
      addLog('All sales data uploaded successfully');
    } catch (err) {
      setError(`Failed to upload sales data: ${err instanceof Error ? err.message : 'Unknown error'}`);
      addLog(`Upload failed: ${err}`);
    } finally {
      setParsingSales(false);
    }
  };

  const processImage = async () => {
    if (!imageFile || !selectedSite) {
      setError('Please select both an image and a site');
      return;
    }

    if (!openaiConfigured) {
      setError('OpenAI API key is not configured');
      return;
    }

    if (!salesData) {
      setError('Please upload sales data first');
      return;
    }

    setIsProcessing(true);
    setError('');
    setProgress(0);
    setShowResults(false);
    addLog('Starting OpenAI GPT-4 Vision processing...');

    try {
      setProcessingStage('Analyzing image with OpenAI...');
      setProgress(20);

      const formData = new FormData();
      formData.append('image', imageFile);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-production-image-copy.cjs`;
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
        body: formData
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error);
        return;
      }

      addLog(`Extracted ${result.itemCount} items from image`);
      setProgress(50);

      setProcessingStage('Matching with PowerBI data...');
      const priceMap = calculateReducedPriceMapping(salesData);
      const matches = matchProductionItems(result.items || [], salesData.uniqueItems, priceMap, 85);
      setProductionMatches(matches);
      addLog(`Matched ${matches.filter(m => m.status === 'matched').length}/${matches.length} items`);
      setProgress(70);

      setProcessingStage('Calculating production requirements...');
      const salesMap = generateSalesDataMap(salesData.items);
      const summary = calculateProductionRequirements(matches, salesMap);
      setProductionSummary(summary);
      addLog(`Calculated requirements for ${summary.totalItems} items`);
      setProgress(90);

      setProcessingStage('Saving results...');
      const { data: { user } } = await supabase.auth.getUser();
      const latestWeek = weeks[weeks.length - 1];

      await supabase
        .from('site_production_images_copy')
        .upsert({
          site_id: selectedSite,
          week_ending_date: latestWeek.formattedDate,
          image_url: imagePreview,
          image_file_name: imageFile.name,
          ocr_results: result.items,
          production_matches: matches,
          match_rate: (matches.filter(m => m.status === 'matched').length / matches.length) * 100,
          total_items: matches.length,
          matched_items: matches.filter(m => m.status === 'matched').length,
          needs_review_items: matches.filter(m => m.status === 'needs_review').length,
          processing_method: 'openai',
          sales_data_weeks: salesData.weeks,
          uploaded_by: user?.id
        }, {
          onConflict: 'site_id,week_ending_date'
        });

      for (const req of summary.requirements) {
        await supabase.from('production_requirements_copy').insert({
          site_id: selectedSite,
          week_ending_date: latestWeek.formattedDate,
          item_name: req.itemName,
          powerbi_item: req.powerBIItem,
          quantity_required: req.quantityRequired,
          unit_price: req.unitPrice,
          total_cost: req.totalCost,
          confidence_score: req.confidence,
          match_status: req.matchStatus,
          created_by: user?.id
        });
      }

      setProgress(100);
      setShowResults(true);
      addLog('Processing completed successfully!');
    } catch (err) {
      setError(`Processing failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      addLog(`Error: ${err}`);
    } finally {
      setIsProcessing(false);
      setProgress(0);
      setProcessingStage('');
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file');
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setError('');
      addLog(`Image selected: ${file.name}`);
    }
  };

  return (
    <div className="p-8">
      {showSetupWizard && (
        <OpenAISetupWizard
          onComplete={() => {
            setShowSetupWizard(false);
            checkOpenAIConfig();
          }}
        />
      )}

      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl shadow-lg p-8 mb-8 text-white">
        <div className="flex items-center gap-4 mb-4">
          <div className="bg-white/20 p-3 rounded-lg">
            <Camera className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Production Plan Image Upload (BETA COPY)</h1>
            <p className="text-purple-100 mt-1">Complete production planning with OpenAI and PowerBI data (Copy Version)</p>
          </div>
        </div>

        <div className="bg-white/10 rounded-lg p-4 mt-6 border border-white/20">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold mb-2">How This Works (Copy):</p>
              <ul className="space-y-1 text-purple-100">
                <li>1. Upload sales data for the last 3 weeks (automatically saves per site)</li>
                <li>2. Upload production plan image (automatically saves per site and week)</li>
                <li>3. OpenAI extracts items and matches with PowerBI data</li>
                <li>4. View complete production requirements with costs and suggestions</li>
                <li>5. Data persists - next time you only upload new week's data!</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${openaiConfigured ? 'bg-green-100' : 'bg-amber-100'}`}>
              <Key className={`w-6 h-6 ${openaiConfigured ? 'text-green-600' : 'text-amber-600'}`} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">OpenAI API Status (Copy)</h3>
              {checkingOpenAI ? (
                <p className="text-sm text-gray-600 flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Checking...
                </p>
              ) : openaiConfigured ? (
                <p className="text-sm text-green-600 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Configured
                </p>
              ) : (
                <p className="text-sm text-amber-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Not configured
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowSetupWizard(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            <Settings className="w-5 h-5" />
            {openaiConfigured ? 'Update' : 'Setup'} API Key
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-red-900 mb-1">Error</h3>
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Select Site</label>
        <select
          value={selectedSite}
          onChange={(e) => setSelectedSite(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
        >
          <option value="">Choose a site...</option>
          {sites.map(site => (
            <option key={site.id} value={site.id}>{site.name}</option>
          ))}
        </select>
      </div>

      {selectedSite && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Step 1: Sales Data (Last 3 Weeks) - Copy</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {weeks.map((week) => {
                const stored = storedSalesData.get(week.weekNumber);
                const hasFile = !!salesFiles[`week${week.weekNumber}`];

                return (
                  <div key={week.weekNumber} className={`border-2 rounded-lg p-4 ${
                    stored ? 'border-green-300 bg-green-50' : 'border-gray-300'
                  }`}>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      {week.displayLabel}
                    </label>

                    {stored && (
                      <div className="mb-3 p-3 bg-white border border-green-200 rounded">
                        <p className="text-xs font-semibold text-green-800">✓ Data Saved</p>
                        <p className="text-xs text-green-700 mt-1">{stored.file_name}</p>
                        <p className="text-xs text-green-600">{stored.item_count} items</p>
                      </div>
                    )}

                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => handleSalesFileSelect(week.weekNumber as 1 | 2 | 3, e.target.files?.[0] || null)}
                      className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                    />
                    {hasFile && (
                      <p className="text-xs text-purple-600 mt-2">✓ New file ready to upload</p>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={uploadSalesData}
              disabled={Object.keys(salesFiles).length === 0 || parsingSales}
              className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {parsingSales ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Upload & Save Sales Data (Copy)
                </>
              )}
            </button>

            {salesData && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-semibold text-green-900">✓ Sales Data Loaded</p>
                <p className="text-xs text-green-700 mt-1">
                  {salesData.uniqueItems.length} unique PowerBI items from {salesData.weeks} week(s)
                </p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Step 2: Production Plan Image - Copy</h2>

            {storedProductionImage && (
              <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-purple-900">✓ Previous Image Saved</p>
                    <p className="text-xs text-purple-700 mt-1">
                      {storedProductionImage.image_file_name} - {storedProductionImage.total_items} items ({storedProductionImage.match_rate.toFixed(1)}% matched)
                    </p>
                    <p className="text-xs text-purple-600 mt-1">Upload a new image to replace or view previous results below</p>
                  </div>
                  {showResults && (
                    <button
                      onClick={() => {
                        const element = document.getElementById('production-results-copy');
                        element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="ml-4 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      View Results
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="mb-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-500 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                  id="image-upload-copy"
                />
                <label htmlFor="image-upload-copy" className="cursor-pointer">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
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
              onClick={processImage}
              disabled={!imageFile || !salesData || isProcessing}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  {processingStage || 'Processing...'}
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5" />
                  Process Image & Calculate Requirements (Copy)
                </>
              )}
            </button>

            {isProcessing && (
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-purple-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                </div>
                <p className="text-sm text-gray-600 text-center mt-2">{progress}% complete</p>
              </div>
            )}
          </div>

          {showResults && productionSummary && (
            <div id="production-results-copy" className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Production Requirements (Copy)</h2>

              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Total Items</p>
                  <p className="text-3xl font-bold text-purple-600">{productionSummary.totalItems}</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Total Quantity</p>
                  <p className="text-3xl font-bold text-green-600">{productionSummary.totalQuantity}</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Total Cost</p>
                  <p className="text-3xl font-bold text-purple-600">£{productionSummary.totalCost.toFixed(2)}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Match Rate</p>
                  <p className="text-3xl font-bold text-amber-600">{productionSummary.averageConfidence.toFixed(1)}%</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">PowerBI Match</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Required Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Avg Weekly Sales</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Avg Weekly Production</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Buffer %</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Suggested Weekly</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Per Day</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Unit Price (85%)</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Total Cost</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {productionSummary.requirements.map((req, index) => (
                      <tr key={index} className={req.isReduced ? 'bg-purple-50' : req.matchStatus === 'needs_review' ? 'bg-amber-50' : ''}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {req.itemName}
                          {req.isReduced && <span className="ml-2 text-xs font-semibold text-purple-600">(REDUCED)</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {req.powerBIItem}
                          {req.priceRange && <div className="text-xs text-gray-500">{req.priceRange}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold">{req.quantityRequired}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">{req.averageWeeklySales.toFixed(1)}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">{req.averageWeeklyProduction.toFixed(1)}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          <span className={`font-semibold ${req.isReduced ? 'text-purple-600' : 'text-orange-600'}`}>
                            {req.bufferPercent?.toFixed(1) || '0'}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-purple-600">{req.suggestedProduction}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-green-600">{req.suggestedDailyProduction}</td>
                        <td className="px-4 py-3 text-sm text-right">£{req.unitPrice.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold">£{req.totalCost.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          {req.matchStatus === 'matched' && (
                            <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded">✓ Matched</span>
                          )}
                          {req.matchStatus === 'needs_review' && (
                            <span className="px-2 py-1 text-xs font-semibold bg-amber-100 text-amber-800 rounded">⚠ Review</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 space-y-3">
                <div className="p-4 bg-purple-50 border-l-4 border-purple-500 rounded-lg">
                  <p className="text-sm text-purple-800">
                    <strong>Note (Copy):</strong> Unit prices are reduced to 85% of sales price for cost calculation.
                    Average weekly sales and production calculated from {productionSummary.requirements[0]?.weeks || 0} week(s) of data.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
