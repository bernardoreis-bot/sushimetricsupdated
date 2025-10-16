export interface ProductionMatch {
  ocrItem: string;
  ocrQuantity: number;
  ocrCategory?: string;
  powerBIItem: string | null;
  confidence: number;
  variations: Array<{
    powerBIItem: string;
    confidence: number;
    matchType: string;
  }>;
  needsReview: boolean;
  status: 'matched' | 'needs_review' | 'unmatched';
  avgPrice?: number;
  totalCost?: number;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeText(str1);
  const norm2 = normalizeText(str2);

  if (norm1 === norm2) return 100;

  const distance = levenshteinDistance(norm1, norm2);
  const maxLength = Math.max(norm1.length, norm2.length);
  const similarity = ((maxLength - distance) / maxLength) * 100;

  const words1 = norm1.split(' ');
  const words2 = norm2.split(' ');
  let wordMatches = 0;

  for (const word1 of words1) {
    if (word1.length < 3) continue;
    for (const word2 of words2) {
      if (word2.length < 3) continue;
      if (word1 === word2 || word2.includes(word1) || word1.includes(word2)) {
        wordMatches++;
        break;
      }
    }
  }

  const wordBonus = (wordMatches / Math.max(words1.length, words2.length)) * 20;

  return Math.min(100, similarity + wordBonus);
}

export function matchProductionItems(
  ocrItems: Array<{ productName: string; quantity: number; category?: string }>,
  powerBIItems: string[],
  priceMap: Map<string, number>,
  confidenceThreshold: number = 85
): ProductionMatch[] {
  const results: ProductionMatch[] = [];

  for (const ocrItem of ocrItems) {
    const variations: Array<{
      powerBIItem: string;
      confidence: number;
      matchType: string;
    }> = [];

    for (const powerBIItem of powerBIItems) {
      const confidence = calculateSimilarity(ocrItem.productName, powerBIItem);

      if (confidence >= 50) {
        let matchType = 'fuzzy';
        if (confidence === 100) matchType = 'exact';
        else if (confidence >= 90) matchType = 'very_high';
        else if (confidence >= 75) matchType = 'high';
        else if (confidence >= 60) matchType = 'medium';
        else matchType = 'low';

        variations.push({
          powerBIItem,
          confidence,
          matchType
        });
      }
    }

    variations.sort((a, b) => b.confidence - a.confidence);

    const topMatch = variations[0] || null;
    const needsReview = !topMatch || topMatch.confidence < confidenceThreshold;

    const avgPrice = topMatch ? priceMap.get(topMatch.powerBIItem.toLowerCase()) || 0 : 0;
    const totalCost = avgPrice * ocrItem.quantity;

    let status: 'matched' | 'needs_review' | 'unmatched' = 'unmatched';
    if (topMatch) {
      status = needsReview ? 'needs_review' : 'matched';
    }

    results.push({
      ocrItem: ocrItem.productName,
      ocrQuantity: ocrItem.quantity,
      ocrCategory: ocrItem.category,
      powerBIItem: topMatch ? topMatch.powerBIItem : null,
      confidence: topMatch ? topMatch.confidence : 0,
      variations: variations.slice(0, 5),
      needsReview,
      status,
      avgPrice,
      totalCost
    });
  }

  return results.sort((a, b) => {
    if (a.status !== b.status) {
      const statusOrder = { matched: 0, needs_review: 1, unmatched: 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return b.confidence - a.confidence;
  });
}
