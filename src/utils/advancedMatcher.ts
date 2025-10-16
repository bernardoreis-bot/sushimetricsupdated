import { normalizeItemName, calculateSimilarity } from './fuzzyItemMatcher';

export interface MatchCandidate {
  itemName: string;
  score: number;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'substring';
  confidence: number;
}

export interface AdvancedMatchResult {
  ocrItem: string;
  quantity: number;
  matchedItem: string | null;
  matchScore: number;
  matchType: string;
  candidates: MatchCandidate[];
  needsReview: boolean;
}

export interface LearnedMapping {
  original_text: string;
  normalized_text: string;
  mapped_powerbi_item: string;
  confidence_score: number;
}

export function findAdvancedMatches(
  ocrItem: string,
  availableItems: string[],
  learnedMappings: LearnedMapping[],
  minScore: number = 50
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  const normalizedOCR = normalizeItemName(ocrItem);

  const aliasMatch = learnedMappings.find(
    mapping => normalizeItemName(mapping.original_text) === normalizedOCR
  );

  if (aliasMatch) {
    candidates.push({
      itemName: aliasMatch.mapped_powerbi_item,
      score: 100,
      matchType: 'alias',
      confidence: aliasMatch.confidence_score
    });
    return candidates;
  }

  for (const availableItem of availableItems) {
    const score = calculateSimilarity(ocrItem, availableItem);
    if (score >= minScore) {
      let matchType: 'exact' | 'fuzzy' | 'substring' = 'fuzzy';
      if (score === 100) matchType = 'exact';
      else if (score >= 90) matchType = 'substring';

      candidates.push({
        itemName: availableItem,
        score,
        matchType,
        confidence: score
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

export function batchMatchWithOCR(
  ocrItems: Array<{ productName: string; quantity: number }>,
  availableItems: string[],
  learnedMappings: LearnedMapping[],
  autoMatchThreshold: number = 85
): AdvancedMatchResult[] {
  const results: AdvancedMatchResult[] = [];

  for (const ocrItem of ocrItems) {
    const candidates = findAdvancedMatches(
      ocrItem.productName,
      availableItems,
      learnedMappings,
      50
    );

    const bestMatch = candidates[0];
    const needsReview = !bestMatch || bestMatch.score < autoMatchThreshold;

    results.push({
      ocrItem: ocrItem.productName,
      quantity: ocrItem.quantity,
      matchedItem: needsReview ? null : bestMatch.itemName,
      matchScore: bestMatch?.score || 0,
      matchType: bestMatch?.matchType || 'none',
      candidates: candidates.slice(0, 5),
      needsReview
    });
  }

  return results;
}

export function generateMatchingSummary(results: AdvancedMatchResult[]) {
  const matched = results.filter(r => !r.needsReview);
  const needsReview = results.filter(r => r.needsReview);

  return {
    total: results.length,
    matched: matched.length,
    needsReview: needsReview.length,
    matchRate: (matched.length / results.length) * 100,
    matchTypes: {},
    avgConfidence: matched.length > 0
      ? matched.reduce((sum, r) => sum + r.matchScore, 0) / matched.length
      : 0
  };
}
