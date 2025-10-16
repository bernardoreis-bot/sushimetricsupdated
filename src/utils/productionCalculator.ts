import { ProductionMatch } from './productionItemMatcher';

export interface ProductionRequirement {
  itemName: string;
  powerBIItem: string;
  quantityRequired: number;
  averageWeeklySales: number;
  averageWeeklyProduction: number;
  suggestedProduction: number;
  suggestedDailyProduction: number;
  unitPrice: number;
  totalCost: number;
  confidence: number;
  matchStatus: 'matched' | 'needs_review' | 'unmatched';
  weeks: number;
  priceRange?: string;
  bufferPercent?: number;
  isReduced: boolean;
  reducedPrice?: number;
}

export interface ProductionSummary {
  requirements: ProductionRequirement[];
  totalItems: number;
  totalCost: number;
  totalQuantity: number;
  averageConfidence: number;
  matchedCount: number;
  reviewCount: number;
  unmatchedCount: number;
}

// Price range definitions matching ProductionSheetPanel
const REDUCED_PRICE_RANGES = [
  { reducedPrice: 2.50, minOriginal: 2.51, maxOriginal: 3.49, name: '£2.51-£3.49 → £2.50', variability: 5 },
  { reducedPrice: 3.50, minOriginal: 3.60, maxOriginal: 4.49, name: '£3.60-£4.49 → £3.50', variability: 7 },
  { reducedPrice: 4.50, minOriginal: 4.70, maxOriginal: 6.90, name: '£4.70-£6.90 → £4.50', variability: 8 },
  { reducedPrice: 6.00, minOriginal: 7.00, maxOriginal: 9.99, name: '£7.00-£9.99 → £6.00', variability: 10 },
  { reducedPrice: 7.50, minOriginal: 10.00, maxOriginal: 14.00, name: '£10.00-£14.00 → £7.50', variability: 12 },
  { reducedPrice: 15.00, minOriginal: 16.00, maxOriginal: Infinity, name: '£16+ → £15.00', variability: 15 }
];

function getPriceRangeInfo(price: number): { range: string; variability: number; reducedPrice: number } | null {
  const matchingRange = REDUCED_PRICE_RANGES.find(r => price >= r.minOriginal && price <= r.maxOriginal);
  if (matchingRange) {
    return {
      range: matchingRange.name,
      variability: matchingRange.variability,
      reducedPrice: matchingRange.reducedPrice
    };
  }
  return null;
}

export function calculateProductionRequirements(
  productionMatches: ProductionMatch[],
  salesDataByItem: Map<string, { totalSales: number; totalProduction: number; averagePrice: number; weeks: number }>
): ProductionSummary {
  // First pass: collect all items with their data
  const itemsData: Array<{
    match: ProductionMatch;
    salesInfo: { totalSales: number; totalProduction: number; averagePrice: number; weeks: number };
    averageWeeklySales: number;
    averageWeeklyProduction: number;
    isReduced: boolean;
    priceRangeInfo: { range: string; variability: number; reducedPrice: number } | null;
  }> = [];

  for (const match of productionMatches) {
    if (!match.powerBIItem) {
      continue;
    }

    const salesInfo = salesDataByItem.get(match.powerBIItem.toLowerCase()) || {
      totalSales: 0,
      totalProduction: 0,
      averagePrice: match.avgPrice || 0,
      weeks: 1
    };

    const averageWeeklySales = salesInfo.totalSales / Math.max(1, salesInfo.weeks);
    const averageWeeklyProduction = salesInfo.totalProduction / Math.max(1, salesInfo.weeks);
    const itemLower = match.powerBIItem.toLowerCase();
    const isReduced = itemLower.includes('reduced') || itemLower.includes('(reduced)');
    const priceRangeInfo = getPriceRangeInfo(salesInfo.averagePrice);

    itemsData.push({
      match,
      salesInfo,
      averageWeeklySales,
      averageWeeklyProduction,
      isReduced,
      priceRangeInfo
    });
  }

  // Second pass: calculate total reduced items per price range
  const reducedByPriceRange = new Map<number, number>();
  const normalItemsByPriceRange = new Map<number, number>();

  for (const item of itemsData) {
    if (!item.priceRangeInfo) continue;

    const reducedPrice = item.priceRangeInfo.reducedPrice;

    if (item.isReduced) {
      const current = reducedByPriceRange.get(reducedPrice) || 0;
      reducedByPriceRange.set(reducedPrice, current + item.averageWeeklySales);
    } else {
      const current = normalItemsByPriceRange.get(reducedPrice) || 0;
      normalItemsByPriceRange.set(reducedPrice, current + 1);
    }
  }

  // Third pass: create requirements with distributed reduced items
  const requirements: ProductionRequirement[] = [];

  for (const item of itemsData) {
    const quantityRequired = item.match.ocrQuantity;
    const unitPrice = item.salesInfo.averagePrice;
    const bufferPercent = item.isReduced ? 0 : (item.priceRangeInfo?.variability || 10);

    // Calculate additional quantity from reduced items for this price range
    let additionalFromReduced = 0;
    if (!item.isReduced && item.priceRangeInfo) {
      const reducedPrice = item.priceRangeInfo.reducedPrice;
      const totalReduced = reducedByPriceRange.get(reducedPrice) || 0;
      const normalItemsCount = normalItemsByPriceRange.get(reducedPrice) || 1;

      if (totalReduced > 0 && normalItemsCount > 0) {
        additionalFromReduced = totalReduced / normalItemsCount;
      }
    }

    // Calculate suggested production with buffer and reduced distribution
    let suggestedProduction: number;
    if (item.isReduced) {
      suggestedProduction = quantityRequired;
    } else {
      const baseProduction = item.averageWeeklySales + additionalFromReduced;
      suggestedProduction = Math.ceil(baseProduction * (1 + bufferPercent / 100));
    }

    const suggestedDailyProduction = Math.ceil(suggestedProduction / 7);

    // Use reduced price for cost calculation (85% of original)
    const costUnitPrice = unitPrice * 0.85;
    const totalCost = quantityRequired * costUnitPrice;

    requirements.push({
      itemName: item.match.ocrItem,
      powerBIItem: item.match.powerBIItem,
      quantityRequired,
      averageWeeklySales: item.averageWeeklySales,
      averageWeeklyProduction: item.averageWeeklyProduction,
      suggestedProduction,
      suggestedDailyProduction,
      unitPrice: costUnitPrice,
      totalCost,
      confidence: item.match.confidence,
      matchStatus: item.match.status,
      weeks: item.salesInfo.weeks,
      priceRange: item.priceRangeInfo?.range,
      bufferPercent,
      isReduced: item.isReduced,
      reducedPrice: item.priceRangeInfo?.reducedPrice
    });
  }

  const totalCost = requirements.reduce((sum, r) => sum + r.totalCost, 0);
  const totalQuantity = requirements.reduce((sum, r) => sum + r.quantityRequired, 0);
  const averageConfidence = requirements.length > 0
    ? requirements.reduce((sum, r) => sum + r.confidence, 0) / requirements.length
    : 0;

  return {
    requirements: requirements.sort((a, b) => b.totalCost - a.totalCost),
    totalItems: requirements.length,
    totalCost,
    totalQuantity,
    averageConfidence,
    matchedCount: requirements.filter(r => r.matchStatus === 'matched').length,
    reviewCount: requirements.filter(r => r.matchStatus === 'needs_review').length,
    unmatchedCount: requirements.filter(r => r.matchStatus === 'unmatched').length
  };
}

export function generateSalesDataMap(
  salesItems: Array<{ itemName: string; salesVolume?: number; productionQuantity?: number; price?: number; source: string }>
): Map<string, { totalSales: number; totalProduction: number; averagePrice: number; weeks: number }> {
  const itemMap = new Map<string, { totalSales: number; totalProduction: number; prices: number[]; sources: Set<string> }>();

  for (const item of salesItems) {
    const key = item.itemName.toLowerCase();
    const existing = itemMap.get(key) || { totalSales: 0, totalProduction: 0, prices: [], sources: new Set() };

    existing.totalSales += item.salesVolume || 0;
    existing.totalProduction += item.productionQuantity || 0;
    if (item.price && item.price > 0) {
      existing.prices.push(item.price);
    }
    existing.sources.add(item.source);

    itemMap.set(key, existing);
  }

  const resultMap = new Map<string, { totalSales: number; totalProduction: number; averagePrice: number; weeks: number }>();

  for (const [key, data] of itemMap.entries()) {
    const averagePrice = data.prices.length > 0
      ? data.prices.reduce((sum, p) => sum + p, 0) / data.prices.length
      : 0;

    resultMap.set(key, {
      totalSales: data.totalSales,
      totalProduction: data.totalProduction,
      averagePrice,
      weeks: data.sources.size
    });
  }

  return resultMap;
}
