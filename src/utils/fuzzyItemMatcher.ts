// Fuzzy Item Matching Utility for Production Plan Items
// Implements advanced matching logic with normalization, synonyms, and substring matching

export interface MatchResult {
  itemName: string;
  score: number;
  matchType: 'exact' | 'fuzzy' | 'substring' | 'synonym';
  normalizedSource: string;
  normalizedTarget: string;
}

export interface ItemAlias {
  id: string;
  production_item_name: string;
  mapped_item_name: string;
  confidence_score: number;
  match_type: string;
  usage_count: number;
}

// Normalize item name for comparison
export function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove common suffixes and prefixes
    .replace(/\b(p1|p2|p3|box|roll|pcs|pc|piece|pieces)\b/gi, '')
    // Remove punctuation
    .replace(/[^\w\s]/g, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate Levenshtein distance between two strings
export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

// Calculate similarity score (0-100) between two strings
export function calculateSimilarity(str1: string, str2: string): number {
  const normalized1 = normalizeItemName(str1);
  const normalized2 = normalizeItemName(str2);

  // Exact match after normalization
  if (normalized1 === normalized2) {
    return 100;
  }

  // Substring match
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    const longer = Math.max(normalized1.length, normalized2.length);
    const shorter = Math.min(normalized1.length, normalized2.length);
    return Math.round((shorter / longer) * 95); // 95% max for substring
  }

  // Levenshtein-based similarity
  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);

  if (maxLength === 0) return 100;

  const similarity = ((maxLength - distance) / maxLength) * 100;
  return Math.max(0, Math.round(similarity));
}

// Find best matches for a production item
export function findBestMatches(
  productionItemName: string,
  availableItems: string[],
  minScore: number = 50
): MatchResult[] {
  const results: MatchResult[] = [];

  for (const availableItem of availableItems) {
    const score = calculateSimilarity(productionItemName, availableItem);

    if (score >= minScore) {
      let matchType: 'exact' | 'fuzzy' | 'substring' | 'synonym' = 'fuzzy';

      if (score === 100) {
        matchType = 'exact';
      } else if (score >= 90) {
        const norm1 = normalizeItemName(productionItemName);
        const norm2 = normalizeItemName(availableItem);
        if (norm1.includes(norm2) || norm2.includes(norm1)) {
          matchType = 'substring';
        }
      }

      results.push({
        itemName: availableItem,
        score,
        matchType,
        normalizedSource: normalizeItemName(productionItemName),
        normalizedTarget: normalizeItemName(availableItem)
      });
    }
  }

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}

// Apply stored aliases to match production items
export function applyAliases(
  productionItemName: string,
  aliases: ItemAlias[]
): string | null {
  const normalized = normalizeItemName(productionItemName);

  for (const alias of aliases) {
    const aliasNormalized = normalizeItemName(alias.production_item_name);

    if (aliasNormalized === normalized) {
      return alias.mapped_item_name;
    }
  }

  return null;
}

// Batch match production items with available items using aliases
export interface BatchMatchResult {
  matched: Array<{
    productionItem: string;
    matchedItem: string;
    score: number;
    matchType: string;
    aliasUsed: boolean;
  }>;
  unmatched: Array<{
    productionItem: string;
    suggestions: MatchResult[];
  }>;
  matchRate: number;
}

export function batchMatchItems(
  productionItems: string[],
  availableItems: string[],
  aliases: ItemAlias[],
  minConfidence: number = 80
): BatchMatchResult {
  const matched: BatchMatchResult['matched'] = [];
  const unmatched: BatchMatchResult['unmatched'] = [];

  for (const productionItem of productionItems) {
    // Try alias first
    const aliasMatch = applyAliases(productionItem, aliases);

    if (aliasMatch) {
      matched.push({
        productionItem,
        matchedItem: aliasMatch,
        score: 100,
        matchType: 'alias',
        aliasUsed: true
      });
      continue;
    }

    // Try fuzzy matching
    const matches = findBestMatches(productionItem, availableItems, 50);

    if (matches.length > 0 && matches[0].score >= minConfidence) {
      matched.push({
        productionItem,
        matchedItem: matches[0].itemName,
        score: matches[0].score,
        matchType: matches[0].matchType,
        aliasUsed: false
      });
    } else {
      unmatched.push({
        productionItem,
        suggestions: matches.slice(0, 3) // Top 3 suggestions
      });
    }
  }

  const matchRate = (matched.length / productionItems.length) * 100;

  return {
    matched,
    unmatched,
    matchRate
  };
}

// Extract item name variations for better matching
export function generateNameVariations(itemName: string): string[] {
  const variations: string[] = [itemName];
  const normalized = normalizeItemName(itemName);

  variations.push(normalized);

  // Add version without common prefixes
  const withoutPrefix = itemName.replace(/^(yo!?|the)\s+/i, '').trim();
  if (withoutPrefix !== itemName) {
    variations.push(withoutPrefix);
    variations.push(normalizeItemName(withoutPrefix));
  }

  // Add version without numbers
  const withoutNumbers = itemName.replace(/\d+/g, '').trim();
  if (withoutNumbers !== itemName) {
    variations.push(withoutNumbers);
    variations.push(normalizeItemName(withoutNumbers));
  }

  return [...new Set(variations)]; // Remove duplicates
}

// Check if two items are likely the same product
export function areLikelySameItem(item1: string, item2: string, threshold: number = 80): boolean {
  return calculateSimilarity(item1, item2) >= threshold;
}
