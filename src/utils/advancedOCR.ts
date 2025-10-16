import Tesseract from 'tesseract.js';

export interface OCRResult {
  text: string;
  confidence: number;
}

export interface ExtractedItem {
  productName: string;
  quantity: number;
  confidence: number;
  category?: string;
}

const COMMON_MISSPELLINGS: Record<string, string> = {
  'chiken': 'chicken',
  'chilli': 'chilli',
  'californla': 'california',
  'samon': 'salmon',
  'avacado': 'avocado',
  'cucmber': 'cucumber',
  'vegtable': 'vegetable',
  'niglri': 'nigiri',
  'hosomakl': 'hosomaki',
  'terlyaki': 'teriyaki',
  'katchu': 'katsu',
  'bentos': 'bento',
  'gyozas': 'gyoza'
};

const CATEGORY_HEADERS = [
  'sides and snacks',
  'variety bentos',
  'selection boxes',
  'gyoza and bites',
  'signature set',
  'sharers',
  'ready meals',
  'classic rolls',
  'specialty rolls',
  'boxes required for production'
];

export async function performOCR(imageFile: File): Promise<OCRResult> {
  try {
    const result = await Tesseract.recognize(imageFile, 'eng');
    return {
      text: result.data.text,
      confidence: result.data.confidence
    };
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to process image with OCR');
  }
}

function correctSpelling(text: string): string {
  let corrected = text.toLowerCase();
  Object.entries(COMMON_MISSPELLINGS).forEach(([wrong, right]) => {
    const regex = new RegExp(wrong, 'gi');
    corrected = corrected.replace(regex, right);
  });
  return corrected;
}

function isHeaderLine(line: string): boolean {
  const lowerLine = line.toLowerCase().trim();
  return CATEGORY_HEADERS.some(header => lowerLine.includes(header)) ||
    lowerLine.includes('product') ||
    lowerLine.includes('number') ||
    lowerLine.includes('boxes required');
}

function extractQuantity(text: string): number | null {
  const numbers = text.match(/\b(\d+)\b/g);
  if (numbers && numbers.length > 0) {
    return parseInt(numbers[numbers.length - 1], 10);
  }
  return null;
}

function cleanProductName(name: string): string {
  return name
    .replace(/\b\d+\b/g, '')
    .replace(/[|\/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTableFromOCR(ocrText: string): ExtractedItem[] {
  const lines = ocrText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const items: ExtractedItem[] = [];
  let currentCategory = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isHeaderLine(line)) {
      const lowerLine = line.toLowerCase();
      const matchedCategory = CATEGORY_HEADERS.find(cat => lowerLine.includes(cat));
      if (matchedCategory) {
        currentCategory = matchedCategory;
      }
      continue;
    }
    const parts = line.split(/\s{2,}|\t|\|/);
    if (parts.length >= 2) {
      const productPart = parts[0];
      const numberPart = parts[parts.length - 1];
      const quantity = extractQuantity(numberPart);
      if (quantity !== null && quantity > 0) {
        const productName = cleanProductName(productPart);
        if (productName.length > 2) {
          const correctedName = correctSpelling(productName);
          items.push({
            productName: correctedName,
            quantity,
            confidence: 85,
            category: currentCategory || undefined
          });
        }
      }
    }
  }
  return items;
}

export function enhanceExtractedItems(items: ExtractedItem[]): ExtractedItem[] {
  const uniqueItems = new Map<string, ExtractedItem>();
  items.forEach(item => {
    const key = item.productName.toLowerCase();
    if (!uniqueItems.has(key)) {
      uniqueItems.set(key, item);
    }
  });
  return Array.from(uniqueItems.values());
}
