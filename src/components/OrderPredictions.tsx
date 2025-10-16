import { useState, useEffect } from 'react';
import { TrendingUp, Package, Calendar, Download, AlertTriangle, CheckCircle, BarChart3, Info, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { validateTransactionsSchema, type SchemaValidationResult } from '../utils/schemaValidator';
import SchemaFixDialog from './SchemaFixDialog';

interface Site {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface StockItem {
  product_name: string;
  quantity: number;
}

interface PredictionItem {
  itemName: string;
  avgWeeklyUsage: number;
  minUsage: number;
  maxUsage: number;
  currentStock: number;
  predictedQuantity: number;
  weeksCovered: number;
  riskLevel: 'low' | 'medium' | 'high';
  historicalData: number[];
}

export default function OrderPredictions() {
  const [sites, setSites] = useState<Site[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [transactionType, setTransactionType] = useState('invoice');
  const [predictionPeriod, setPredictionPeriod] = useState(2);
  const [predictions, setPredictions] = useState<PredictionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [analysisDate, setAnalysisDate] = useState('');
  const [diagnostic, setDiagnostic] = useState<string>('');
  const [diagnosticType, setDiagnosticType] = useState<'info' | 'warning' | 'error'>('info');
  const [dataStatus, setDataStatus] = useState({
    hasTransactions: false,
    hasInvoiceItems: false,
    hasStockData: false,
    transactionCount: 0,
    lastOrderDate: '',
    weeksOfData: 0
  });
  const [schemaValidation, setSchemaValidation] = useState<SchemaValidationResult | null>(null);
  const [showSchemaDialog, setShowSchemaDialog] = useState(false);
  const [validatingSchema, setValidatingSchema] = useState(false);

  useEffect(() => {
    loadSites();
    loadSuppliers();
    validateSchema();
  }, []);

  const validateSchema = async () => {
    setValidatingSchema(true);
    const result = await validateTransactionsSchema();
    setSchemaValidation(result);
    setValidatingSchema(false);

    if (!result.valid) {
      setDiagnostic(result.errorMessage || 'Schema validation failed');
      setDiagnosticType('error');
    }
  };

  const loadSites = async () => {
    const { data } = await supabase
      .from('sites')
      .select('id, name')
      .order('name');

    if (data) {
      setSites(data);
      if (data.length > 0) {
        setSelectedSite(data[0].id);
      }
    }
  };

  const loadSuppliers = async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name')
      .order('name');

    if (data) {
      setSuppliers(data);
    }
  };

  const calculatePredictions = async () => {
    setDiagnostic('');
    setPredictions([]);

    if (!selectedSite) {
      setDiagnostic('Please select a site location before generating predictions.');
      setDiagnosticType('error');
      return;
    }

    if (!selectedSupplier) {
      setDiagnostic('Please select a supplier before generating predictions.');
      setDiagnosticType('error');
      return;
    }

    if (!schemaValidation) {
      setDiagnostic('Validating database schema...');
      setDiagnosticType('info');
      await validateSchema();
      return;
    }

    if (!schemaValidation.valid) {
      const errorMsg = `${schemaValidation.errorMessage}\n\n${schemaValidation.fixSuggestion}\n\nClick the "Fix Schema" button below to see detailed instructions.`;
      setDiagnostic(errorMsg);
      setDiagnosticType('error');
      return;
    }

    setLoading(true);
    setDiagnostic('Validating data availability...');
    setDiagnosticType('info');

    try {
      const siteName = sites.find(s => s.id === selectedSite)?.name || 'Selected site';
      const supplierName = suppliers.find(s => s.id === selectedSupplier)?.name || 'Selected supplier';

      const twelveWeeksAgo = new Date();
      twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - (12 * 7));

      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select(`
          id,
          amount,
          transaction_date,
          transaction_type,
          invoice_items (
            item_name,
            quantity,
            unit_price
          )
        `)
        .eq('site_id', selectedSite)
        .eq('supplier_id', selectedSupplier)
        .eq('transaction_type', transactionType)
        .gte('transaction_date', twelveWeeksAgo.toISOString().split('T')[0])
        .order('transaction_date', { ascending: true });

      if (transError) {
        console.error('Transaction query error:', transError);
        setDiagnostic(`Database error: ${transError.message}. Please check your connection.`);
        setDiagnosticType('error');
        setLoading(false);
        return;
      }

      if (!transactions || transactions.length === 0) {
        const detailedMessage = `No ${transactionType} transactions found for "${supplierName}" at "${siteName}" in the past 12 weeks.\n\nPossible reasons:\n• No orders placed with this supplier at this location\n• Transaction type mismatch (try switching between invoice/credit/delivery)\n• Supplier-site combination doesn't exist in your data\n• Transactions may be older than 12 weeks\n\nNext steps:\n• Verify you have ${transactionType} transactions in the Transactions module\n• Check that the supplier is correctly linked to this site\n• Try a different transaction type or supplier`;

        setDiagnostic(detailedMessage);
        setDiagnosticType('warning');
        setDataStatus({
          hasTransactions: false,
          hasInvoiceItems: false,
          hasStockData: false,
          transactionCount: 0,
          lastOrderDate: '',
          weeksOfData: 0
        });
        setLoading(false);
        return;
      }

      const transWithItems = transactions.filter(t => t.invoice_items && t.invoice_items.length > 0);

      if (transWithItems.length === 0) {
        const detailedMessage = `Found ${transactions.length} ${transactionType} transaction(s) for "${supplierName}" at "${siteName}", but NONE have itemized invoice data.\n\nProblem: Transactions exist but lack invoice_items entries.\n\nSolution:\n• Transactions must have detailed line items (products/quantities) in the invoice_items table\n• Go to the Transactions module and ensure invoices have itemized entries\n• Upload or manually enter invoice line items for these transactions\n\nCannot generate predictions without itemized order history.`;

        setDiagnostic(detailedMessage);
        setDiagnosticType('error');
        setDataStatus({
          hasTransactions: true,
          hasInvoiceItems: false,
          hasStockData: false,
          transactionCount: transactions.length,
          lastOrderDate: transactions[transactions.length - 1]?.transaction_date || '',
          weeksOfData: 0
        });
        setLoading(false);
        return;
      }

      const itemUsageMap = new Map<string, number[]>();

      transactions.forEach((trans: any) => {
        if (trans.invoice_items && Array.isArray(trans.invoice_items)) {
          trans.invoice_items.forEach((item: any) => {
            if (!itemUsageMap.has(item.item_name)) {
              itemUsageMap.set(item.item_name, []);
            }
            itemUsageMap.get(item.item_name)!.push(parseFloat(item.quantity) || 0);
          });
        }
      });

      const { data: stockData } = await supabase
        .from('stock_counts')
        .select('product_name, quantity')
        .eq('site_id', selectedSite)
        .order('count_date', { ascending: false })
        .limit(100);

      const stockMap = new Map<string, number>();
      let hasStockData = false;

      if (stockData && stockData.length > 0) {
        hasStockData = true;
        stockData.forEach((item: StockItem) => {
          stockMap.set(item.product_name.toLowerCase(), item.quantity);
        });
      } else {
        const warningMsg = `Warning: No stock count data found for "${siteName}".\n\nPredictions will be generated but current stock will show as 0 for all items.\n\nRecommendation:\n• Perform a stock count for this site using the Stock Count module\n• This will improve prediction accuracy by factoring in current inventory levels`;

        setDiagnostic(warningMsg);
        setDiagnosticType('warning');
      }

      const predictionItems: PredictionItem[] = [];

      itemUsageMap.forEach((usageHistory, itemName) => {
        const totalUsage = usageHistory.reduce((sum, val) => sum + val, 0);
        const avgWeeklyUsage = totalUsage / 12;
        const minUsage = Math.min(...usageHistory);
        const maxUsage = Math.max(...usageHistory);

        const currentStock = stockMap.get(itemName.toLowerCase()) || 0;

        const predictedQuantity = Math.max(0, (avgWeeklyUsage * predictionPeriod) - currentStock);

        const weeksCovered = currentStock / avgWeeklyUsage;

        const variance = usageHistory.reduce((sum, val) => sum + Math.pow(val - avgWeeklyUsage, 2), 0) / usageHistory.length;
        const stdDev = Math.sqrt(variance);
        const coefficientOfVariation = stdDev / avgWeeklyUsage;

        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        if (weeksCovered < 1 || coefficientOfVariation > 0.5) {
          riskLevel = 'high';
        } else if (weeksCovered < 2 || coefficientOfVariation > 0.3) {
          riskLevel = 'medium';
        }

        predictionItems.push({
          itemName,
          avgWeeklyUsage,
          minUsage,
          maxUsage,
          currentStock,
          predictedQuantity,
          weeksCovered,
          riskLevel,
          historicalData: usageHistory
        });
      });

      predictionItems.sort((a, b) => b.predictedQuantity - a.predictedQuantity);

      setPredictions(predictionItems);
      setAnalysisDate(new Date().toLocaleDateString());

      const firstDate = transWithItems[0]?.transaction_date;
      const lastDate = transWithItems[transWithItems.length - 1]?.transaction_date;
      const daysDiff = Math.floor((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24));
      const weeksOfData = Math.floor(daysDiff / 7);

      setDataStatus({
        hasTransactions: true,
        hasInvoiceItems: true,
        hasStockData,
        transactionCount: transWithItems.length,
        lastOrderDate: lastDate,
        weeksOfData
      });

      if (!hasStockData) {
        setDiagnosticType('warning');
      } else {
        const successMsg = `Successfully analyzed ${transWithItems.length} ${transactionType} transactions from "${supplierName}" at "${siteName}" covering ${weeksOfData} weeks of data. Generated predictions for ${predictionItems.length} items.`;
        setDiagnostic(successMsg);
        setDiagnosticType('info');
      }

    } catch (error) {
      console.error('Prediction error:', error);
      const errorMsg = `Unexpected error while calculating predictions:\n\n${error instanceof Error ? error.message : String(error)}\n\nPlease check:\n• Database connection is working\n• Transactions and invoice_items tables are accessible\n• Data integrity (no corrupt records)\n\nIf the problem persists, contact support with the error details above.`;
      setDiagnostic(errorMsg);
      setDiagnosticType('error');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (predictions.length === 0) return;

    const headers = ['Item Name', 'Avg Weekly Usage', 'Min Usage', 'Max Usage', 'Current Stock', 'Predicted Order Qty', 'Weeks Covered', 'Risk Level'];
    const rows = predictions.map(p => [
      p.itemName,
      p.avgWeeklyUsage.toFixed(2),
      p.minUsage.toFixed(2),
      p.maxUsage.toFixed(2),
      p.currentStock.toFixed(2),
      p.predictedQuantity.toFixed(2),
      p.weeksCovered.toFixed(1),
      p.riskLevel.toUpperCase()
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `order-prediction-${selectedSite}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const totalPredicted = predictions.reduce((sum, p) => sum + p.predictedQuantity, 0);
  const highRiskItems = predictions.filter(p => p.riskLevel === 'high').length;
  const itemsNeedingOrder = predictions.filter(p => p.predictedQuantity > 0).length;

  return (
    <div className="p-8">
      {showSchemaDialog && schemaValidation && (
        <SchemaFixDialog
          missingColumns={schemaValidation.missingColumns}
          existingColumns={schemaValidation.existingColumns}
          tableName="transactions"
          onClose={() => {
            setShowSchemaDialog(false);
            validateSchema();
          }}
        />
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Smart Order Predictions</h1>
        <p className="text-gray-500 mt-1">AI-powered order forecasting based on 12-week historical analysis</p>
      </div>

      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-6 mb-8 text-white">
        <div className="flex items-start gap-3 mb-4">
          <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold mb-2">How This Works:</p>
            <ul className="space-y-1 text-blue-100">
              <li>1. Select your site location and supplier</li>
              <li>2. Choose transaction type (invoice, credit, delivery)</li>
              <li>3. System analyzes past 12 weeks of orders for that exact combination</li>
              <li>4. Compares with current stock levels to calculate optimal order quantity</li>
              <li>5. Highlights items at risk of stock-out with recommended reorder amounts</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Prediction Parameters</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Site Location <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select site...</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Supplier <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Type</label>
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="invoice">Invoice</option>
              <option value="credit">Credit</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Prediction Period</label>
            <select
              value={predictionPeriod}
              onChange={(e) => setPredictionPeriod(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>1 Week</option>
              <option value={2}>2 Weeks</option>
              <option value={3}>3 Weeks</option>
              <option value={4}>4 Weeks</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={calculatePredictions}
              disabled={loading || !selectedSite || !selectedSupplier}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors flex items-center justify-center gap-2"
            >
              <BarChart3 className="w-5 h-5" />
              {loading ? 'Analyzing...' : 'Generate Prediction'}
            </button>
          </div>
        </div>
      </div>

      {diagnostic && (
        <div className={`mb-6 rounded-xl shadow-sm border overflow-hidden ${
          diagnosticType === 'error' ? 'bg-red-50 border-red-200' :
          diagnosticType === 'warning' ? 'bg-amber-50 border-amber-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                {diagnosticType === 'error' && <XCircle className="w-8 h-8 text-red-600" />}
                {diagnosticType === 'warning' && <AlertTriangle className="w-8 h-8 text-amber-600" />}
                {diagnosticType === 'info' && <CheckCircle className="w-8 h-8 text-blue-600" />}
              </div>
              <div className="flex-1">
                <h3 className={`text-lg font-semibold mb-2 ${
                  diagnosticType === 'error' ? 'text-red-900' :
                  diagnosticType === 'warning' ? 'text-amber-900' :
                  'text-blue-900'
                }`}>
                  {diagnosticType === 'error' ? 'Data Validation Failed' :
                   diagnosticType === 'warning' ? 'Warning - Incomplete Data' :
                   'Analysis Complete'}
                </h3>
                <div className={`whitespace-pre-line text-sm ${
                  diagnosticType === 'error' ? 'text-red-800' :
                  diagnosticType === 'warning' ? 'text-amber-800' :
                  'text-blue-800'
                }`}>
                  {diagnostic}
                </div>

                {diagnosticType === 'error' && schemaValidation && !schemaValidation.valid && (
                  <div className="mt-4">
                    <button
                      onClick={() => setShowSchemaDialog(true)}
                      className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
                    >
                      <AlertTriangle className="w-5 h-5" />
                      Fix Schema Issue
                    </button>
                  </div>
                )}

                {(dataStatus.hasTransactions || dataStatus.transactionCount > 0) && (
                  <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Data Status Summary:</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        {dataStatus.hasTransactions ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="text-gray-700">Transactions: {dataStatus.transactionCount}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {dataStatus.hasInvoiceItems ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="text-gray-700">Invoice Items: {dataStatus.hasInvoiceItems ? 'Available' : 'Missing'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {dataStatus.hasStockData ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-amber-600" />
                        )}
                        <span className="text-gray-700">Stock Data: {dataStatus.hasStockData ? 'Available' : 'Not Found'}</span>
                      </div>
                      {dataStatus.lastOrderDate && (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-blue-600" />
                          <span className="text-gray-700">Last Order: {new Date(dataStatus.lastOrderDate).toLocaleDateString()}</span>
                        </div>
                      )}
                      {dataStatus.weeksOfData > 0 && (
                        <div className="flex items-center gap-2 col-span-2">
                          <BarChart3 className="w-4 h-4 text-blue-600" />
                          <span className="text-gray-700">Historical Data: {dataStatus.weeksOfData} weeks</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {predictions.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Items</p>
                  <p className="text-2xl font-bold text-gray-900">{predictions.length}</p>
                </div>
                <Package className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Need Ordering</p>
                  <p className="text-2xl font-bold text-orange-600">{itemsNeedingOrder}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-orange-500" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">High Risk Items</p>
                  <p className="text-2xl font-bold text-red-600">{highRiskItems}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Analysis Date</p>
                  <p className="text-lg font-bold text-gray-900">{analysisDate}</p>
                </div>
                <Calendar className="w-8 h-8 text-green-500" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recommended Order Quantities</h2>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-5 h-5" />
                Export to CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item Name</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Weekly</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Min/Max</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Order Qty</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weeks Covered</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {predictions.map((pred, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{pred.itemName}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">{pred.avgWeeklyUsage.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">
                        {pred.minUsage.toFixed(1)} / {pred.maxUsage.toFixed(1)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">{pred.currentStock.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-right">
                        {pred.predictedQuantity > 0 ? (
                          <span className="text-blue-600">{pred.predictedQuantity.toFixed(2)}</span>
                        ) : (
                          <span className="text-green-600">Fully Stocked</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">
                        {pred.weeksCovered.toFixed(1)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {pred.riskLevel === 'high' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            High
                          </span>
                        )}
                        {pred.riskLevel === 'medium' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            Medium
                          </span>
                        )}
                        {pred.riskLevel === 'low' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Low
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <Info className="w-5 h-5" />
              Calculation Methodology
            </h3>
            <ul className="text-sm text-blue-800 space-y-2">
              <li><strong>Avg Weekly Usage:</strong> Total usage over 12 weeks ÷ 12</li>
              <li><strong>Predicted Order Qty:</strong> (Avg Weekly × {predictionPeriod} weeks) - Current Stock (never negative)</li>
              <li><strong>Weeks Covered:</strong> Current Stock ÷ Avg Weekly Usage</li>
              <li><strong>Risk Level:</strong> High if stock covers less than 1 week or high variability; Medium if less than 2 weeks</li>
              <li><strong>Data Source:</strong> Past 12 weeks of {transactionType} transactions from selected supplier at selected site</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
