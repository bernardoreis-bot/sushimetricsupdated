import * as XLSX from 'xlsx';

export interface SalesDataItem {
  itemName: string;
  productionQuantity?: number;
  salesVolume?: number;
  price?: number;
  salesValue?: number;
  source: 'week1' | 'week2' | 'week3';
}

export interface ParsedSalesData {
  items: SalesDataItem[];
  uniqueItems: string[];
  totalItems: number;
  weeks: number;
}

export async function parseSalesDataFile(file: File, weekLabel: 'week1' | 'week2' | 'week3'): Promise<SalesDataItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData: any[] = XLSX.utils.sheet_to_json(firstSheet);

        const items: SalesDataItem[] = [];

        for (const row of jsonData) {
          const itemName =
            row['Item Name'] ||
            row['item name'] ||
            row['ItemName'] ||
            row['Product Name'] ||
            row['product name'] ||
            row['ProductName'];

          if (!itemName || typeof itemName !== 'string' || itemName.trim() === '') {
            continue;
          }

          const productionQuantity =
            parseFloat(row['Production Quantity']) ||
            parseFloat(row['production quantity']) ||
            parseFloat(row['ProductionQuantity']) ||
            parseFloat(row['Quantity']) ||
            parseFloat(row['quantity']) ||
            0;

          const salesVolume =
            parseFloat(row['Sales Volume']) ||
            parseFloat(row['sales volume']) ||
            parseFloat(row['SalesVolume']) ||
            parseFloat(row['Volume']) ||
            parseFloat(row['volume']) ||
            0;

          const price =
            parseFloat(row['Price']) ||
            parseFloat(row['price']) ||
            parseFloat(row['Unit Price']) ||
            parseFloat(row['unit price']) ||
            0;

          const salesValue =
            parseFloat(row['Sales Value']) ||
            parseFloat(row['sales value']) ||
            parseFloat(row['SalesValue']) ||
            parseFloat(row['Value']) ||
            parseFloat(row['value']) ||
            (salesVolume && price ? salesVolume * price : 0);

          items.push({
            itemName: itemName.trim(),
            productionQuantity,
            salesVolume,
            price,
            salesValue,
            source: weekLabel
          });
        }

        resolve(items);
      } catch (error) {
        reject(new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsBinaryString(file);
  });
}

export function mergeSalesData(week1?: SalesDataItem[], week2?: SalesDataItem[], week3?: SalesDataItem[]): ParsedSalesData {
  const allItems: SalesDataItem[] = [];
  const itemSet = new Set<string>();

  if (week1) allItems.push(...week1);
  if (week2) allItems.push(...week2);
  if (week3) allItems.push(...week3);

  allItems.forEach(item => itemSet.add(item.itemName.toLowerCase()));

  return {
    items: allItems,
    uniqueItems: Array.from(itemSet),
    totalItems: allItems.length,
    weeks: [week1, week2, week3].filter(w => w && w.length > 0).length
  };
}

export function calculateReducedPriceMapping(salesData: ParsedSalesData): Map<string, number> {
  const priceMap = new Map<string, number>();
  const priceGroups = new Map<string, number[]>();

  for (const item of salesData.items) {
    const key = item.itemName.toLowerCase();
    if (item.price && item.price > 0) {
      if (!priceGroups.has(key)) {
        priceGroups.set(key, []);
      }
      priceGroups.get(key)!.push(item.price);
    }
  }

  priceGroups.forEach((prices, itemName) => {
    const validPrices = prices.filter(p => p > 0);
    if (validPrices.length > 0) {
      const averagePrice = validPrices.reduce((sum, p) => sum + p, 0) / validPrices.length;
      const reducedPrice = averagePrice * 0.85;
      priceMap.set(itemName, reducedPrice);
    }
  });

  return priceMap;
}
