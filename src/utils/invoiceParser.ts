import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface ParsedInvoice {
  invoiceNumber: string | null;
  invoiceReference: string | null;
  date: string | null;
  siteName: string | null;
  totalAmount: number | null;
  vatAmount: number | null;
  supplierName: string | null;
  matchedRuleCategoryId: string | null;
  matchedRuleSupplierId: string | null;
  matchedRuleSiteId: string | null;
}

export interface ParsedLineItem {
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  totalPrice: number;
}

interface ParsingRule {
  id: string;
  supplier_id: string | null;
  text_pattern: string;
  default_category_id: string | null;
  default_site_id: string | null;
  site_name_replacements: string[];
  priority: number;
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);

  let matches = 0;
  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1 === word2 || word1.includes(word2) || word2.includes(word1)) {
        matches++;
        break;
      }
    }
  }

  const maxWords = Math.max(words1.length, words2.length);
  return matches / maxWords;
}

export async function parseInvoicePDF(file: File, parsingRules: ParsingRule[] = []): Promise<ParsedInvoice> {
  try {
    console.log('Starting PDF parse...');
    const arrayBuffer = await file.arrayBuffer();
    console.log('ArrayBuffer created, size:', arrayBuffer.byteLength);

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    console.log('Loading task created');

    const pdf = await loadingTask.promise;
    console.log('PDF loaded, pages:', pdf.numPages);

    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      console.log('Processing page', i);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + ' ';
      console.log('Page', i, 'extracted, length:', pageText.length);
    }

    console.log('Full text extracted, total length:', fullText.length);
    const result = extractInvoiceData(fullText, parsingRules);
    console.log('Extraction complete');
    return result;
  } catch (error) {
    console.error('Error parsing PDF - Full details:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    throw error;
  }
}

function extractInvoiceData(text: string, parsingRules: ParsingRule[]): ParsedInvoice {
  console.log('Parsing text:', text.substring(0, 500));

  const result: ParsedInvoice = {
    invoiceNumber: null,
    invoiceReference: null,
    date: null,
    siteName: null,
    totalAmount: null,
    vatAmount: null,
    supplierName: null,
    matchedRuleCategoryId: null,
    matchedRuleSupplierId: null,
    matchedRuleSiteId: null,
  };

  // Extract invoice number
  const invoicePatterns = [
    /Invoice\s+No\.?\s+([A-Z0-9]+)/i,
    /Invoice[:\s]+([A-Z0-9]+)(?=\s+TAX|\s+Order|\s+\d{2}\/|\s*$)/i,
    /^(\d{6})\s+\d{2}\/\d{2}\/\d{2}/m,
    /^([A-Z]\d{7})$/m,
  ];

  for (const pattern of invoicePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const num = match[1].trim();
      if (num.length >= 5 && num.length <= 12 && !num.match(/^(Invoice|Order)$/i)) {
        result.invoiceNumber = num;
        console.log('Found invoice number:', result.invoiceNumber);
        break;
      }
    }
  }

  // Extract date
  const datePatterns = [
    /Date\s+(\d{2}\/\d{2}\/\d{2,4})/i,
    /TAX POINT DATE\s+(\d{2}\/\d{2}\/\d{2,4})/i,
    /(\d{2}\/\d{2}\/\d{2,4})\s+INVOICE/i,
    /Invoice\s+Date[:\s]*(\d{2}\/\d{2}\/\d{2,4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      result.date = convertDateFormat(match[1]);
      console.log('Found date:', result.date);
      break;
    }
  }

  // Match parsing rules
  let matchedRule: ParsingRule | null = null;
  for (const rule of parsingRules) {
    if (text.toLowerCase().includes(rule.text_pattern.toLowerCase())) {
      matchedRule = rule;
      result.matchedRuleCategoryId = rule.default_category_id;
      result.matchedRuleSupplierId = rule.supplier_id;
      result.matchedRuleSiteId = rule.default_site_id;
      console.log('✓ Matched parsing rule:', rule.text_pattern, '(priority:', rule.priority + ')');
      if (rule.default_category_id) {
        console.log('  → Will use category from rule');
      }
      if (rule.supplier_id) {
        console.log('  → Will use supplier from rule');
      }
      if (rule.default_site_id) {
        console.log('  → Will use site from rule');
      }
      break;
    }
  }

  // Extract reference/order number
  const referencePatterns = [
    /Your\s+Order\s+No\.?\s+([A-Za-z0-9\s\/\-]+?)(?=\s+INVOICE|\s+Delivered|\s+TAX|$)/i,
    /Order\s+No:?\s+(\d{5,7})/i,
    /REFERENCE\s+([A-Za-z0-9\s\/\-]+?)(?=\s|$)/i,
  ];

  for (const pattern of referencePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const ref = match[1].trim();
      if (ref.length >= 3 && ref.length <= 30) {
        result.invoiceReference = ref;
        console.log('Found invoice reference:', result.invoiceReference);
        break;
      }
    }
  }

  // Extract site name from "Deliver To" section
  const deliverToMatch = text.match(/Deliver To[:\s]+(.*?)(?:Account No|$)/is);
  if (deliverToMatch) {
    const deliverToSection = deliverToMatch[1];
    console.log('Deliver To section (raw):', deliverToSection);

    const lines = deliverToSection
      .split(/[\n]/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    console.log('Deliver To lines:', lines);

    for (const line of lines) {
      let cleaned = line;

      // Apply custom replacements from rule
      if (matchedRule && matchedRule.site_name_replacements) {
        for (const replacement of matchedRule.site_name_replacements) {
          cleaned = cleaned.replace(new RegExp(replacement, 'gi'), '');
        }
      }

      // Apply default cleaning
      cleaned = cleaned
        .replace(/^Rollwave\s+Foods\s+Ltd/gi, '')
        .replace(/Yo\s+Sushi\s*-?\s*/gi, '')
        .replace(/Asda\s+/gi, '')
        .replace(/Tesco\s+Superstore?\s*/gi, '')
        .replace(/\d+\s+Smithdown\s+Rd/gi, '')
        .replace(/Mather\s+Avenue/gi, '')
        .replace(/Liverpool/gi, '')
        .replace(/L\d+\s*\d*[A-Z]{0,2}/gi, '')
        .replace(/^\d{10,11}$/g, '')
        .replace(/^\d+$/g, '')
        .trim();

      if (cleaned.length > 2 && !cleaned.match(/^\d/) && cleaned.match(/[a-zA-Z]/)) {
        result.siteName = cleaned;
        console.log('✓ Extracted site name:', result.siteName);
        break;
      }
    }
  }

  if (!result.siteName) {
    console.log('⚠ No site name found in Deliver To section');
  }

  // Extract total amount
  const amountPatterns = [
    /Total\s+Amount\s+£([\d,]+\.\d{2})/i,
    /([\d,]+\.\d{2})\s+Total\s+Amount/i,
    /TOTAL\s+£([\d,]+\.\d{2})/i,
    /Total[:\s]+£([\d,]+\.\d{2})/,
    /£([\d,]+\.\d{2})\s*$(?!.*£)/m,
  ];

  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const amount = match[1].replace(/,/g, '');
      const parsed = parseFloat(amount);
      if (parsed >= 10 && parsed < 100000) {
        result.totalAmount = parsed;
        console.log('Found total amount:', result.totalAmount);
        break;
      }
    }
  }

  // Extract VAT amount
  const vatPatterns = [
    /VAT\s+@\s+\d+%\s+£([\d,]+\.\d{2})/i,
    /VAT\s+Amount\s+£([\d,]+\.\d{2})/i,
    /Total\s+VAT\s+£([\d,]+\.\d{2})/i,
    /VAT\s+£([\d,]+\.\d{2})/i,
    /Value\s+Added\s+Tax\s+£([\d,]+\.\d{2})/i,
  ];

  for (const pattern of vatPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const amount = match[1].replace(/,/g, '');
      const parsed = parseFloat(amount);
      if (parsed > 0 && parsed < 50000) {
        result.vatAmount = parsed;
        console.log('Found VAT amount:', result.vatAmount);
        break;
      }
    }
  }

  // Extract supplier name
  const supplierPatterns = [
    { pattern: /Eden\s+Farm\s+Hulleys/i, name: 'Eden Farm' },
    { pattern: /Bunzl\s+Catering/i, name: 'Bunzl Catering' },
  ];

  for (const { pattern, name } of supplierPatterns) {
    if (pattern.test(text)) {
      result.supplierName = name;
      console.log('Found supplier:', name);
      break;
    }
  }

  console.log('Final parsed result:', result);
  return result;
}

function convertDateFormat(dateStr: string): string {
  const parts = dateStr.split(/[\/\-]/);

  if (parts.length === 3) {
    let [day, month, year] = parts;

    if (year.length === 2) {
      year = '20' + year;
    }

    day = day.padStart(2, '0');
    month = month.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  return dateStr;
}

export async function parseInvoiceLineItems(file: File): Promise<ParsedLineItem[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      let lastY = -1;
      let currentLine = '';

      textContent.items.forEach((item: any) => {
        const y = item.transform[5];

        if (lastY !== -1 && Math.abs(y - lastY) > 5) {
          if (currentLine.trim()) {
            fullText += currentLine.trim() + '\n';
          }
          currentLine = '';
        }

        currentLine += item.str + ' ';
        lastY = y;
      });

      if (currentLine.trim()) {
        fullText += currentLine.trim() + '\n';
      }
    }

    console.log('Extracted PDF text:', fullText.substring(0, 1000));
    const items = extractLineItems(fullText);
    console.log('Parsed items:', items.length, items);

    return items;
  } catch (error) {
    console.error('Error parsing line items:', error);
    throw error;
  }
}

function extractLineItems(text: string): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];
  const lines = text.split('\n');

  console.log('Total lines:', lines.length);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.length < 10) continue;

    if (line.includes('VAT Code') ||
        line.includes('VAT Rate') ||
        line.includes('Currency') ||
        line.includes('Payment within') ||
        line.includes('All items included') ||
        line.includes('Total Goods') ||
        line.includes('TOTAL')) {
      continue;
    }

    const bunzlPattern = /^([A-Z]+\d{4,5}|[A-Z]\d{5})\s+(.+?)\s+(\d+)\s+(CASE|SINGLE|PACK\d*|BOX)\s+£([\d.]+)\s+£([\d.]+)\s+V\s*$/i;
    const bunzlMatch = line.match(bunzlPattern);

    if (bunzlMatch) {
      const [, code, name, qty, unit, pricePerUnit, totalPrice] = bunzlMatch;
      console.log('Bunzl match:', code, name, qty, unit);
      items.push({
        productCode: code.trim(),
        productName: cleanProductName(name.trim()),
        quantity: parseInt(qty),
        unit: unit.trim(),
        pricePerUnit: parseFloat(pricePerUnit),
        totalPrice: parseFloat(totalPrice),
      });
      continue;
    }

    const edenFarmPattern = /^(\d{5})\s+(.+?)\s+(\d+)\s+(.+?)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+\d+\s*$/;
    const edenMatch = line.match(edenFarmPattern);

    if (edenMatch) {
      const [, code, name, qty, unit, price, value] = edenMatch;
      console.log('Eden Farm match:', code, name, qty, unit);
      items.push({
        productCode: code.trim(),
        productName: cleanProductName(name.trim()),
        quantity: parseInt(qty),
        unit: unit.trim(),
        pricePerUnit: parseFloat(price),
        totalPrice: parseFloat(value),
      });
      continue;
    }

    const bunzlSimplePattern = /^([A-Z]\d{5}|[A-Z]{1,2}\d{5})\s+(.+?)$/;
    if (bunzlSimplePattern.test(line)) {
      const parts = line.split(/\s+/);
      if (parts.length >= 6) {
        const code = parts[0];
        const vIndex = parts.lastIndexOf('V');

        if (vIndex > 0) {
          const totalPrice = parts[vIndex - 1].replace('£', '');
          const pricePerUnit = parts[vIndex - 2].replace('£', '');
          const unit = parts[vIndex - 3];
          const qty = parts[vIndex - 4];
          const name = parts.slice(1, vIndex - 4).join(' ');

          if (!isNaN(parseInt(qty)) && !isNaN(parseFloat(pricePerUnit))) {
            items.push({
              productCode: code,
              productName: cleanProductName(name),
              quantity: parseInt(qty),
              unit: unit,
              pricePerUnit: parseFloat(pricePerUnit),
              totalPrice: parseFloat(totalPrice),
            });
            continue;
          }
        }
      }
    }

    const edenSimplePattern = /^(\d{5})\s+(.+?)$/;
    if (edenSimplePattern.test(line)) {
      const parts = line.split(/\s+/);
      if (parts.length >= 6) {
        const code = parts[0];
        const lastNumber = parts[parts.length - 1];

        if (!isNaN(parseInt(lastNumber)) && lastNumber.length <= 2) {
          const vat = lastNumber;
          const rrp = parts[parts.length - 2];
          const value = parts[parts.length - 3];
          const price = parts[parts.length - 4];
          const unit = parts[parts.length - 5];
          const qty = parts[parts.length - 6];
          const name = parts.slice(1, parts.length - 6).join(' ');

          if (!isNaN(parseInt(qty)) && !isNaN(parseFloat(price))) {
            items.push({
              productCode: code,
              productName: cleanProductName(name),
              quantity: parseInt(qty),
              unit: unit,
              pricePerUnit: parseFloat(price),
              totalPrice: parseFloat(value),
            });
          }
        }
      }
    }

    // AGGRESSIVE FALLBACK: Catch any line with a product code pattern and numbers
    // This catches items like: "14351 Nori Half Sheets WPL (A) 110x 100pcs 47.55 47.55 0.00 1"
    const aggressivePattern = /^(\d{4,6}|[A-Z]{1,3}\d{4,6})\s+(.+?)\s+([\d.]+)\s+([\d.]+)/;
    const aggressiveMatch = line.match(aggressivePattern);

    if (aggressiveMatch) {
      const [, code, nameAndRest] = aggressiveMatch;

      // Extract all numbers from the line
      const numbers = line.match(/[\d.]+/g) || [];
      const floatNumbers = numbers.slice(1).map(parseFloat).filter(n => !isNaN(n) && n > 0);

      if (floatNumbers.length >= 2) {
        // Typically: quantity, price, total (or variations)
        const totalPrice = floatNumbers[floatNumbers.length - 2]; // Second to last number
        const pricePerUnit = floatNumbers[floatNumbers.length - 3] || totalPrice; // Third to last
        const quantity = floatNumbers[0]; // First number after code

        // Extract clean product name (everything before the first number after code)
        const nameMatch = nameAndRest.match(/^(.+?)\s+\d/);
        const productName = nameMatch ? nameMatch[1].trim() : nameAndRest.split(/\s+\d/)[0].trim();

        if (productName.length >= 3) {
          console.log('Aggressive match caught:', code, productName, quantity, pricePerUnit, totalPrice);
          items.push({
            productCode: code.trim(),
            productName: cleanProductName(productName),
            quantity: quantity,
            unit: 'UNIT',
            pricePerUnit: pricePerUnit,
            totalPrice: totalPrice,
          });
        }
      }
    }
  }

  return items;
}

function cleanProductName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .replace(/\(A\)$/, '')
    .replace(/\(F\)$/, '')
    .replace(/\(FS\)$/, '')
    .replace(/\(AS\)$/, '')
    .trim();
}
