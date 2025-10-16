import Tesseract from 'tesseract.js';

export interface FallbackOCRResult {
  text: string;
  confidence: number;
  items: Array<{
    productName: string;
    quantity: number;
  }>;
}

export async function performFallbackOCR(imageFile: File): Promise<FallbackOCRResult> {
  console.log('Starting fallback OCR with Tesseract...');

  const { data } = await Tesseract.recognize(imageFile, 'eng', {
    logger: (m) => console.log('Tesseract:', m)
  });

  const extractedText = data.text;
  const confidence = data.confidence;

  console.log(`Tesseract OCR complete. Confidence: ${confidence}%`);

  const items = parseProductionPlanText(extractedText);

  return {
    text: extractedText,
    confidence,
    items
  };
}

function parseProductionPlanText(text: string): Array<{ productName: string; quantity: number }> {
  const items: Array<{ productName: string; quantity: number }> = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const patterns = [
      /^(.+?)\s+(\d+)$/,
      /^(.+?)\s+[\|\/]\s*(\d+)$/,
      /^(.+?)\s*-\s*(\d+)$/,
      /^(.+?)[:;]\s*(\d+)$/
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const productName = match[1].trim();
        const quantity = parseInt(match[2], 10);

        if (productName.length > 3 && !isNaN(quantity) && quantity > 0 && quantity < 1000) {
          items.push({ productName, quantity });
          break;
        }
      }
    }
  }

  return items;
}
