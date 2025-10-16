import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, X, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MatchResult } from '../utils/fuzzyItemMatcher';

interface UnmatchedItem {
  productionItem: string;
  suggestions: MatchResult[];
}

interface MatchReviewModalProps {
  unmatchedItems: UnmatchedItem[];
  onClose: () => void;
  onSaveMatches: () => void;
}

export default function MatchReviewModal({ unmatchedItems, onClose, onSaveMatches }: MatchReviewModalProps) {
  const [selections, setSelections] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);

  const handleSelectMatch = (productionItem: string, matchedItem: string) => {
    const newSelections = new Map(selections);
    newSelections.set(productionItem, matchedItem);
    setSelections(newSelections);
  };

  const handleSaveSelections = async () => {
    if (selections.size === 0) {
      alert('Please select at least one match to save');
      return;
    }

    try {
      setSaving(true);

      const aliases = Array.from(selections.entries()).map(([productionItem, mappedItem]) => ({
        production_item_name: productionItem,
        mapped_item_name: mappedItem,
        match_type: 'manual',
        confidence_score: 100,
        created_by: 'user'
      }));

      const { error } = await supabase
        .from('production_item_aliases')
        .insert(aliases);

      if (error) throw error;

      alert(`Successfully saved ${aliases.length} new mapping(s)!`);
      onSaveMatches();
      onClose();
    } catch (err: any) {
      console.error('Error saving matches:', err);
      alert('Failed to save matches: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-orange-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
              Review Unmatched Items
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {unmatchedItems.length} item{unmatchedItems.length !== 1 ? 's' : ''} need{unmatchedItems.length === 1 ? 's' : ''} manual review. Select the best match for each item.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {unmatchedItems.map((item, index) => (
              <div
                key={index}
                className="bg-white border border-gray-300 rounded-lg p-5 shadow-sm"
              >
                <div className="mb-3">
                  <h3 className="font-semibold text-lg text-gray-900 mb-1">
                    {item.productionItem}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Production item from Excel - select matching sales item below:
                  </p>
                </div>

                {item.suggestions.length === 0 ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                    <p className="text-gray-600">No similar items found. You may need to add this item manually to your sales data.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                      Suggested Matches:
                    </p>
                    {item.suggestions.map((suggestion, sIndex) => (
                      <label
                        key={sIndex}
                        className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${
                          selections.get(item.productionItem) === suggestion.itemName
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-300 bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`match-${index}`}
                          checked={selections.get(item.productionItem) === suggestion.itemName}
                          onChange={() => handleSelectMatch(item.productionItem, suggestion.itemName)}
                          className="mt-1 w-4 h-4 text-blue-600"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900">{suggestion.itemName}</span>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-1 text-xs font-medium rounded ${
                                suggestion.score >= 90
                                  ? 'bg-green-100 text-green-800'
                                  : suggestion.score >= 70
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {suggestion.score}% match
                              </span>
                              <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                                {suggestion.matchType}
                              </span>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Normalized: {suggestion.normalizedTarget}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {selections.has(item.productionItem) && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm text-green-800">
                      <strong>{item.productionItem}</strong> will be mapped to <strong>{selections.get(item.productionItem)}</strong>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {selections.size} of {unmatchedItems.length} item{unmatchedItems.length !== 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSelections}
              disabled={saving || selections.size === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save {selections.size > 0 ? `${selections.size} ` : ''}Match{selections.size !== 1 ? 'es' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
