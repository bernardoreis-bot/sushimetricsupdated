import { useState } from 'react';
import { Plus, Trash2, Save, X } from 'lucide-react';

interface InvoiceItem {
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  totalPrice: number;
}

interface InvoiceItemEditorProps {
  items: InvoiceItem[];
  onSave: (items: InvoiceItem[]) => void;
  onCancel: () => void;
}

export default function InvoiceItemEditor({ items: initialItems, onSave, onCancel }: InvoiceItemEditorProps) {
  const [items, setItems] = useState<InvoiceItem[]>(initialItems);

  const addItem = () => {
    setItems([...items, {
      productCode: '',
      productName: '',
      quantity: 1,
      unit: '',
      pricePerUnit: 0,
      totalPrice: 0
    }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Auto-calculate total if quantity or price changes
    if (field === 'quantity' || field === 'pricePerUnit') {
      newItems[index].totalPrice = newItems[index].quantity * newItems[index].pricePerUnit;
    }
    
    setItems(newItems);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-blue-50">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Edit Invoice Items</h3>
            <p className="text-sm text-gray-600">Review and edit extracted items before saving</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-white/50 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="grid grid-cols-6 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Code</label>
                    <input
                      type="text"
                      value={item.productCode}
                      onChange={(e) => updateItem(index, 'productCode', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      placeholder="Code"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Product Name</label>
                    <input
                      type="text"
                      value={item.productName}
                      onChange={(e) => updateItem(index, 'productName', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      placeholder="Product name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Qty</label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Unit Price</label>
                    <input
                      type="number"
                      value={item.pricePerUnit}
                      onChange={(e) => updateItem(index, 'pricePerUnit', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Total</label>
                      <input
                        type="number"
                        value={item.totalPrice}
                        onChange={(e) => updateItem(index, 'totalPrice', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <button
                      onClick={() => removeItem(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addItem}
            className="mt-4 flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-orange-500 hover:text-orange-500 transition-colors w-full justify-center"
          >
            <Plus className="w-5 h-5" />
            Add Item
          </button>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="text-sm text-gray-600">
            Total Items: <span className="font-semibold">{items.length}</span>
            {' | '}
            Total Value: <span className="font-semibold">£{items.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2)}</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(items)}
              className="flex items-center gap-2 px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-semibold"
            >
              <Save className="w-5 h-5" />
              Save Items ({items.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
