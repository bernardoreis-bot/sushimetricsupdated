import { useState } from 'react';
import { Search, CheckCircle, AlertTriangle } from 'lucide-react';
import { AdvancedMatchResult } from '../utils/advancedMatcher';

interface ManualMatchingInterfaceProps {
  matchResults: AdvancedMatchResult[];
  availableItems: string[];
  onManualMapping: (ocrItem: string, mappedItem: string) => void;
}

export default function ManualMatchingInterface({
  matchResults,
  availableItems,
  onManualMapping
}: ManualMatchingInterfaceProps) {
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [selectedMappings, setSelectedMappings] = useState<Record<string, string>>({});

  const unmatchedItems = matchResults.filter(r => r.needsReview);

  if (unmatchedItems.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-gray-800 mb-2">All Items Matched!</h3>
        <p className="text-gray-600">No manual mapping required.</p>
      </div>
    );
  }

  const handleSearch = (ocrItem: string, term: string) => {
    setSearchTerms({ ...searchTerms, [ocrItem]: term });
  };

  const handleSelectMapping = (ocrItem: string, mappedItem: string) => {
    setSelectedMappings({ ...selectedMappings, [ocrItem]: mappedItem });
  };

  const handleConfirmMapping = (ocrItem: string) => {
    const mappedItem = selectedMappings[ocrItem];
    if (mappedItem) {
      onManualMapping(ocrItem, mappedItem);
      const updated = { ...selectedMappings };
      delete updated[ocrItem];
      setSelectedMappings(updated);
    }
  };

  const getFilteredItems = (ocrItem: string) => {
    const searchTerm = searchTerms[ocrItem] || '';
    if (!searchTerm.trim()) {
      const result = matchResults.find(r => r.ocrItem === ocrItem);
      return result?.candidates.map(c => c.itemName) || [];
    }

    const lowerSearch = searchTerm.toLowerCase();
    return availableItems.filter(item =>
      item.toLowerCase().includes(lowerSearch)
    ).slice(0, 10);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-8">
      <div className="flex items-center gap-3 mb-6">
        <AlertTriangle className="w-6 h-6 text-amber-600" />
        <h2 className="text-2xl font-bold text-gray-800">Manual Mapping Required</h2>
      </div>

      <p className="text-gray-600 mb-6">
        Select the correct inventory match for each unmatched item. Your selections will be saved automatically.
      </p>

      <div className="space-y-6">
        {unmatchedItems.map((item) => {
          const filteredItems = getFilteredItems(item.ocrItem);
          const selectedItem = selectedMappings[item.ocrItem];

          return (
            <div key={item.ocrItem} className="border border-gray-200 rounded-lg p-5 bg-gray-50">
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-700">From Production Plan:</p>
                <p className="text-lg font-bold text-gray-900">{item.ocrItem}</p>
                <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
              </div>

              <div className="mb-3">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Search Inventory:
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerms[item.ocrItem] || ''}
                    onChange={(e) => handleSearch(item.ocrItem, e.target.value)}
                    placeholder="Type to search..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 max-h-64 overflow-y-auto">
                {filteredItems.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No matches found</p>
                ) : (
                  <div className="space-y-2">
                    {filteredItems.map((availableItem) => (
                      <button
                        key={availableItem}
                        onClick={() => handleSelectMapping(item.ocrItem, availableItem)}
                        className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                          selectedItem === availableItem
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-300 bg-white'
                        }`}
                      >
                        <span className="font-medium text-gray-800">{availableItem}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => handleConfirmMapping(item.ocrItem)}
                disabled={!selectedItem}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                Confirm Mapping
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
