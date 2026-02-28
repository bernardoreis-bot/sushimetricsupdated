import React from 'react';
import { ProductionResultsState, ProductionResultsItem } from './ProductionSheetPanel';

interface DailyProductionSheetProps {
  productionData: ProductionResultsState | null;
  selectedDate?: Date;
}

const DailyProductionSheet: React.FC<DailyProductionSheetProps> = ({ 
  productionData, 
  selectedDate = new Date() 
}) => {
  console.log('DailyProductionSheet rendering with productionData:', !!productionData);
  
  // Menu item to base roll requirements mapping
  const MENU_ROLL_REQUIREMENTS: Record<string, Array<{baseRoll: string, quantity: number}>> = {
    // Sides & Snacks
    'Avocado Hosomaki': [{baseRoll: 'Avocado Hosomaki', quantity: 1}],
    'Cucumber Hosomaki': [{baseRoll: 'Cucumber Hosomaki', quantity: 1}],
    'Salmon Hosomaki': [{baseRoll: 'Salmon Hosomaki', quantity: 1}],
    'Inari Nigiri': [{baseRoll: 'Inari Nigiri', quantity: 3}],
    'Korean Chilli Chicken Onigiri': [{baseRoll: 'Korean Chilli Chicken Onigiri', quantity: 1}],
    'Tuna & Cucumber Mayo Onigiri': [{baseRoll: 'Tuna & Cucumber Mayo Onigiri', quantity: 1}],
    'Salted Edamame': [],
    'Seaweed Salad': [],
    
    // Variety Bentos
    'Seafood Variety Bento': [
      {baseRoll: 'California Roll', quantity: 0.6},
      {baseRoll: 'Cucumber Maki', quantity: 1},
      {baseRoll: 'Salmon Nigiri', quantity: 2}
    ],
    'Chicken Variety Bento': [
      {baseRoll: 'Chicken Katsu Roll', quantity: 0.6},
      {baseRoll: 'Cucumber Maki', quantity: 1},
      {baseRoll: 'Inari - Chilli Chicken', quantity: 2}
    ],
    'O-mega Salmon Selection': [
      {baseRoll: 'Salmon Avocado Roll', quantity: 1},
      {baseRoll: 'Salmon Nigiri', quantity: 4}
    ],
    'Spicy Chicken Selection': [
      {baseRoll: 'Chicken Katsu Roll', quantity: 0.4},
      {baseRoll: 'Mango Chilli Chicken Roll', quantity: 0.4},
      {baseRoll: 'Korean Chicken Bites', quantity: 4}
    ],
    'Plant Power Selection': [
      {baseRoll: 'Veggie Roll', quantity: 1},
      {baseRoll: 'Inari Nigiri', quantity: 3}
    ],
    'Classic Sushi Selection': [
      {baseRoll: 'Salmon Nigiri', quantity: 3},
      {baseRoll: 'Salmon Avocado Roll', quantity: 0.4},
      {baseRoll: 'California Roll', quantity: 0.4},
      {baseRoll: 'Salmon Maki', quantity: 0.5}
    ],
    
    // Signature Sets
    'Classic Seafood Signature Set': [
      {baseRoll: 'Salmon Avocado Roll', quantity: 0.6},
      {baseRoll: 'Garnished Salmon Nigiri', quantity: 2},
      {baseRoll: 'Salmon Nigiri', quantity: 2},
      {baseRoll: 'Garnished Prawn Nigiri', quantity: 2},
      {baseRoll: 'Tuna Nigiri', quantity: 1},
      {baseRoll: 'Cucumber Maki', quantity: 1}
    ],
    'Chicken Spice Signature Set': [
      {baseRoll: 'Chicken Katsu Roll (Sesame)', quantity: 0.6},
      {baseRoll: 'Mango Chilli Chicken Roll', quantity: 0.6},
      {baseRoll: 'Chicken Volcano Roll', quantity: 0.5},
      {baseRoll: 'Cucumber Maki', quantity: 0.5}
    ],
    'Crunchy Rainbow Signature Set': [
      {baseRoll: 'California Roll', quantity: 0.6},
      {baseRoll: 'Ebi Chive Maki', quantity: 0.5},
      {baseRoll: 'Seafood Futomaki', quantity: 1},
      {baseRoll: 'Garnished Prawn Nigiri', quantity: 3}
    ],
    
    // Sharers
    'Deluxe Classic Sushi Sharer': [
      {baseRoll: 'California Roll', quantity: 0.8},
      {baseRoll: 'Salmon Avocado Roll', quantity: 0.8},
      {baseRoll: 'Salmon Nigiri', quantity: 6},
      {baseRoll: 'Salmon Maki', quantity: 1},
      {baseRoll: 'Cucumber Maki', quantity: 1}
    ],
    'Luxury Seafood Sushi Sharer': [
      {baseRoll: 'Salmon Avocado Roll', quantity: 0.8},
      {baseRoll: 'Cucumber Maki', quantity: 1},
      {baseRoll: 'Salmon Maki', quantity: 1},
      {baseRoll: 'Garnished Salmon Nigiri', quantity: 2},
      {baseRoll: 'Garnished Tuna Nigiri', quantity: 2},
      {baseRoll: 'Garnished Prawn Nigiri', quantity: 2},
      {baseRoll: 'Salmon Rose', quantity: 5}
    ],
    'Sumptuous Chicken Sharer': [
      {baseRoll: 'Chicken Katsu Roll (Sesame)', quantity: 0.8},
      {baseRoll: 'Chicken Volcano Roll', quantity: 0.8},
      {baseRoll: 'Cucumber Maki', quantity: 1.5},
      {baseRoll: 'Teriyaki Chicken Bites', quantity: 4},
      {baseRoll: 'Korean Chicken Bites', quantity: 4},
      {baseRoll: 'Inari - Chilli Chicken', quantity: 2}
    ],
    
    // Gyoza & Bites
    'Chicken Gyoza': [],
    'Vegetable Gyoza': [],
    'Teriyaki Chicken Bites': [{baseRoll: 'Teriyaki Chicken Bites', quantity: 10}],
    'Korean Chicken Bites': [{baseRoll: 'Korean Chicken Bites', quantity: 10}],
    'Mini Teriyaki Chicken Bites': [{baseRoll: 'Teriyaki Chicken Bites', quantity: 5}],
    'Mini Korean Chicken Bites': [{baseRoll: 'Korean Chicken Bites', quantity: 5}],
    
    // Classic Rolls
    'Salmon Nigiri': [{baseRoll: 'Salmon Nigiri', quantity: 5}],
    'Nigiri Selects': [
      {baseRoll: 'Garnished Salmon Nigiri', quantity: 2},
      {baseRoll: 'Garnished Prawn Nigiri', quantity: 2},
      {baseRoll: 'Garnished Tuna Nigiri', quantity: 1}
    ],
    'Classic California Roll': [{baseRoll: 'California Roll', quantity: 1}],
    'Classic Salmon & Avocado Roll': [{baseRoll: 'Salmon Avocado Roll', quantity: 1}],
    'Classic Chicken Katsu Roll': [{baseRoll: 'Chicken Katsu Roll', quantity: 1}],
    'Veggie Roll': [{baseRoll: 'Veggie Roll', quantity: 1}],
    
    // Specialty Rolls
    'Crunchy Chicken Katsu Roll': [{baseRoll: 'Crunchy Chicken Katsu Roll', quantity: 1}],
    'Crunchy Chilli Chicken Katsu Roll': [{baseRoll: 'Crunchy Chilli Chicken Katsu Roll', quantity: 1}],
    'Crunchy California Roll': [{baseRoll: 'Crunchy California Roll', quantity: 1}],
    'Crunchy Chilli Prawn Katsu Roll': [{baseRoll: 'Crunchy Chilli Prawn Katsu Roll', quantity: 1}],
    'Crunchy Salmon & Avocado Roll': [{baseRoll: 'Crunchy Salmon & Avocado Roll', quantity: 1}],
    'Crunchy Chilli Salmon & Avocado Roll': [{baseRoll: 'Crunchy Chilli Salmon & Avocado Roll', quantity: 1}],
    'Crunchy Veggie Roll': [{baseRoll: 'Crunchy Veggie Roll', quantity: 1}],
    'Mango Chilli Chicken Roll': [{baseRoll: 'Mango Chilli Chicken Roll', quantity: 1}],
    
    // Ready Meals
    'Korean Chicken Noodles': [],
    'Korean Chicken Rice Bowl': [],
    'Chicken Katsu Curry': [],
    'Chicken Teriyaki Noodles': [],
    'Korean Beef Rice Bowl': []
  };

  // Function to calculate base roll requirements for menu items
  const calculateBaseRollRequirements = (menuItems: Array<{item: string, quantity: number}>) => {
    const baseRollRequirements: Record<string, number> = {};
    
    menuItems.forEach(({item, quantity}) => {
      const requirements = MENU_ROLL_REQUIREMENTS[item];
      if (requirements) {
        requirements.forEach(({baseRoll, quantity: rollQuantity}) => {
          // Calculate total pieces needed for this base roll
          const totalPiecesNeeded = quantity * rollQuantity;
          
          // Get roll info to calculate how many base rolls are needed
          const rollInfo = getRollInfo(baseRoll);
          
          if (rollInfo && rollInfo.rollType !== 'Nigiri' && rollInfo.rollType !== 'Onigiri' && rollInfo.rollType !== 'Bites') {
            // For rolls: Calculate how many base rolls needed from total pieces
            const baseRollsNeeded = Math.ceil(totalPiecesNeeded / rollInfo.piecesPerRoll);
            baseRollRequirements[baseRoll] = (baseRollRequirements[baseRoll] || 0) + baseRollsNeeded;
          } else {
            // For nigiri, onigiri, bites: The quantity IS the number of individual pieces
            baseRollRequirements[baseRoll] = (baseRollRequirements[baseRoll] || 0) + totalPiecesNeeded;
          }
        });
      }
    });
    
    return baseRollRequirements;
  };
  const ROLL_CALCULATIONS: Record<string, { piecesPerRoll: number; rollType: string }> = {
    // Hosomaki (thin rolls) - 8 pieces per roll
    'Avocado Hosomaki': { piecesPerRoll: 8, rollType: 'Hosomaki' },
    'Cucumber Hosomaki': { piecesPerRoll: 8, rollType: 'Hosomaki' },
    'Salmon Hosomaki': { piecesPerRoll: 8, rollType: 'Hosomaki' },
    'Cucumber Maki': { piecesPerRoll: 8, rollType: 'Hosomaki' },
    'Salmon Maki': { piecesPerRoll: 8, rollType: 'Hosomaki' },
    'Ebi Chive Maki': { piecesPerRoll: 8, rollType: 'Hosomaki' },
    
    // Futomaki/Uramaki (thick rolls) - 10 pieces per roll (standard)
    'Classic California Roll': { piecesPerRoll: 10, rollType: 'Futomaki' },
    'Classic Salmon & Avocado Roll': { piecesPerRoll: 10, rollType: 'Futomaki' },
    'Classic Chicken Katsu Roll': { piecesPerRoll: 10, rollType: 'Futomaki' },
    'Veggie Roll': { piecesPerRoll: 10, rollType: 'Futomaki' },
    'Salmon Avocado Roll': { piecesPerRoll: 10, rollType: 'Futomaki' },
    'California Roll': { piecesPerRoll: 10, rollType: 'Futomaki' },
    'Chicken Katsu Roll': { piecesPerRoll: 10, rollType: 'Futomaki' },
    'Chicken Katsu Roll (Sesame)': { piecesPerRoll: 10, rollType: 'Futomaki' },
    'Chicken Volcano Roll': { piecesPerRoll: 10, rollType: 'Futomaki' },
    'Seafood Futomaki': { piecesPerRoll: 10, rollType: 'Futomaki' },
    'Spicy Chicken Katsu Roll': { piecesPerRoll: 10, rollType: 'Futomaki' },
    'Spicy Prawn Katsu Roll': { piecesPerRoll: 10, rollType: 'Futomaki' },
    'Spicy Salmon Avocado Roll': { piecesPerRoll: 10, rollType: 'Futomaki' },
    'Mango Chilli Chicken Roll': { piecesPerRoll: 10, rollType: 'Futomaki' },
    
    // Specialty Rolls (all 10 pieces)
    'Crunchy Chicken Katsu Roll': { piecesPerRoll: 10, rollType: 'Specialty' },
    'Crunchy Chilli Chicken Katsu Roll': { piecesPerRoll: 10, rollType: 'Specialty' },
    'Crunchy California Roll': { piecesPerRoll: 10, rollType: 'Specialty' },
    'Crunchy Chilli Prawn Katsu Roll': { piecesPerRoll: 10, rollType: 'Specialty' },
    'Crunchy Salmon & Avocado Roll': { piecesPerRoll: 10, rollType: 'Specialty' },
    'Crunchy Chilli Salmon & Avocado Roll': { piecesPerRoll: 10, rollType: 'Specialty' },
    'Crunchy Veggie Roll': { piecesPerRoll: 10, rollType: 'Specialty' },
    
    // Nigiri (1 piece per nigiri - no rolls needed)
    'Salmon Nigiri': { piecesPerRoll: 1, rollType: 'Nigiri' },
    'Inari Nigiri': { piecesPerRoll: 1, rollType: 'Nigiri' },
    'Garnished Salmon Nigiri': { piecesPerRoll: 1, rollType: 'Nigiri' },
    'Garnished Prawn Nigiri': { piecesPerRoll: 1, rollType: 'Nigiri' },
    'Garnished Tuna Nigiri': { piecesPerRoll: 1, rollType: 'Nigiri' },
    'Tuna Nigiri': { piecesPerRoll: 1, rollType: 'Nigiri' },
    
    // Onigiri (1 piece per onigiri - no rolls needed)
    'Korean Chilli Chicken Onigiri': { piecesPerRoll: 1, rollType: 'Onigiri' },
    'Tuna & Cucumber Mayo Onigiri': { piecesPerRoll: 1, rollType: 'Onigiri' },
    
    // Chicken Bites (individual pieces - no rolls needed)
    'Korean Chicken Bites': { piecesPerRoll: 1, rollType: 'Bites' },
    'Teriyaki Chicken Bites': { piecesPerRoll: 1, rollType: 'Bites' },
    'Mini Korean Chicken Bites': { piecesPerRoll: 1, rollType: 'Bites' },
    'Mini Teriyaki Chicken Bites': { piecesPerRoll: 1, rollType: 'Bites' },
  };

  // Function to get roll info for an item (with fuzzy matching)
  const getRollInfo = (itemName: string) => {
    // Try exact match first
    let rollInfo = ROLL_CALCULATIONS[itemName];
    
    // If no exact match, try fuzzy matching
    if (!rollInfo) {
      const normalizedItem = itemName.toLowerCase().trim();
      
      // Find matching roll by checking if item name contains roll keywords
      for (const [rollName, info] of Object.entries(ROLL_CALCULATIONS)) {
        const normalizedRollName = rollName.toLowerCase().trim();
        
        // Check if production item contains roll name or vice versa
        if (normalizedItem.includes(normalizedRollName) || normalizedRollName.includes(normalizedItem)) {
          rollInfo = info;
          break;
        }
        
        // Check for partial matches
        if (normalizedItem.includes('california roll') && normalizedRollName.includes('california roll')) {
          rollInfo = info;
          break;
        }
        if (normalizedItem.includes('salmon avocado roll') && normalizedRollName.includes('salmon avocado roll')) {
          rollInfo = info;
          break;
        }
        if (normalizedItem.includes('chicken katsu roll') && normalizedRollName.includes('chicken katsu roll')) {
          rollInfo = info;
          break;
        }
        if (normalizedItem.includes('veggie roll') && normalizedRollName.includes('veggie roll')) {
          rollInfo = info;
          break;
        }
        if (normalizedItem.includes('cucumber maki') && normalizedRollName.includes('cucumber maki')) {
          rollInfo = info;
          break;
        }
        if (normalizedItem.includes('salmon maki') && normalizedRollName.includes('salmon maki')) {
          rollInfo = info;
          break;
        }
        if (normalizedItem.includes('salmon nigiri') && normalizedRollName.includes('salmon nigiri')) {
          rollInfo = info;
          break;
        }
      }
    }
    
    return rollInfo;
  };

  // Function to calculate rolls needed for roll items
  const calculateRollsNeeded = (dailyDemand: number, itemName: string): number | null => {
    console.log('Calculating rolls for:', itemName, 'Demand:', dailyDemand);
    
    const rollInfo = getRollInfo(itemName);
    console.log('Final roll info:', rollInfo);
    
    // If no roll info found or not a roll item, return null
    if (!rollInfo || rollInfo.rollType === 'Nigiri' || rollInfo.rollType === 'Onigiri' || rollInfo.rollType === 'Bites') {
      console.log('No roll calculation needed for:', itemName);
      return null;
    }
    
    if (dailyDemand <= 0) {
      console.log('Zero or negative demand for:', itemName);
      return null;
    }
    
    // FIXED: Daily quantity IS the number of rolls needed
    // If daily demand is 6 Cucumber Hosomaki, you need 6 rolls
    const rollsNeeded = dailyDemand;
    console.log('Calculated rolls needed:', rollsNeeded, 'for', itemName);
    return rollsNeeded;
  };

  // Get today's weekday index (0 = Sunday, 1 = Monday, etc.)
  const todayWeekday = selectedDate.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  
  // Function to get today's recommendation based on weekday
  const getTodayRecommendation = (item: ProductionResultsItem): number => {
    const weekdayRecommendations = item.weekdayRecommendations || {} as number[];
    const value = weekdayRecommendations[todayWeekday];
    return typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  };

  if (!productionData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <p className="text-gray-500 text-center">No production data available</p>
      </div>
    );
  }

  const filteredItems = productionData.items.filter((item: ProductionResultsItem) => 
    item.item.toLowerCase() !== 'total'
  ).map((item: ProductionResultsItem) => ({
    ...item,
    todayRecommendation: getTodayRecommendation(item)
  })).filter((item: any) => item.todayRecommendation > 0);

  // Calculate base roll requirements for all menu items
  const baseRollRequirements = calculateBaseRollRequirements(
    filteredItems.map((item: any) => ({ item: item.item, quantity: item.todayRecommendation }))
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
      {/* Header */}
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Daily Production Sheet</h2>
        <p className="text-gray-600">
          {selectedDate.toLocaleDateString('en-GB', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Based on {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][todayWeekday]} recommendations
        </p>
      </div>

      {/* Production Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Roll Type to Produce</th>
              <th className="border border-gray-300 px-4 py-2 text-center font-semibold">Quantity</th>
              <th className="border border-gray-300 px-4 py-2 text-center font-semibold">Pieces per Roll</th>
              <th className="border border-gray-300 px-4 py-2 text-center font-semibold">Total Pieces</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item: any, index: number) => {
              const rollInfo = getRollInfo(item.item);
              const rolls = calculateRollsNeeded(item.todayRecommendation, item.item);
              
              // Only show items that need rolls (not nigiri, onigiri, or bites)
              if (!rollInfo || rollInfo.rollType === 'Nigiri' || rollInfo.rollType === 'Onigiri' || rollInfo.rollType === 'Bites') {
                return null;
              }
              
              return (
                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="border border-gray-300 px-4 py-2 font-medium">
                    {item.item}
                    <span className={`ml-2 text-xs px-2 py-1 rounded ${
                      rollInfo.rollType === 'Hosomaki' ? 'bg-blue-100 text-blue-800' :
                      rollInfo.rollType === 'Futomaki' ? 'bg-green-100 text-green-800' :
                      rollInfo.rollType === 'Specialty' ? 'bg-purple-100 text-purple-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {rollInfo.rollType}
                    </span>
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-center font-bold text-lg">
                    {rolls}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-center">
                    {rollInfo.piecesPerRoll}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-center font-semibold">
                    {rolls && rollInfo ? rolls * rollInfo.piecesPerRoll : 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Base Production Requirements */}
      <div className="mt-6 p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
        <h3 className="font-bold text-purple-800 mb-3 text-center">🍣 DAILY PRODUCTION REQUIREMENTS</h3>
        <p className="text-sm text-purple-600 text-center mb-4">
          Base rolls and items needed to produce today's menu items
        </p>
        
        {/* Production Requirements Table */}
        <div className="mb-4">
          <table className="w-full border-collapse border border-purple-200">
            <thead>
              <tr className="bg-purple-100">
                <th className="border border-purple-200 px-3 py-2 text-left font-semibold text-purple-800">Item Type</th>
                <th className="border border-purple-200 px-3 py-2 text-center font-semibold text-purple-800">Quantity Needed</th>
                <th className="border border-purple-200 px-3 py-2 text-center font-semibold text-purple-800">Category</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(baseRollRequirements)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([baseRoll, quantity], index) => {
                  const rollInfo = getRollInfo(baseRoll);
                  
                  return (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-purple-25'}>
                      <td className="border border-purple-200 px-3 py-2 font-medium">
                        {baseRoll}
                        <span className={`ml-2 text-xs px-2 py-1 rounded ${
                          rollInfo?.rollType === 'Hosomaki' ? 'bg-blue-100 text-blue-800' :
                          rollInfo?.rollType === 'Futomaki' ? 'bg-green-100 text-green-800' :
                          rollInfo?.rollType === 'Specialty' ? 'bg-purple-100 text-purple-800' :
                          rollInfo?.rollType === 'Nigiri' ? 'bg-orange-100 text-orange-800' :
                          rollInfo?.rollType === 'Onigiri' ? 'bg-yellow-100 text-yellow-800' :
                          rollInfo?.rollType === 'Bites' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {rollInfo?.rollType || 'Other'}
                        </span>
                      </td>
                      <td className="border border-purple-200 px-3 py-2 text-center font-bold text-lg text-purple-700">
                        {quantity}
                      </td>
                      <td className="border border-purple-200 px-3 py-2 text-center">
                        {rollInfo?.rollType || 'Item'}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        
        {/* Production Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-white p-3 rounded-lg border border-purple-200">
            <h4 className="font-semibold text-purple-700 mb-1">Total Item Types:</h4>
            <p className="text-2xl font-bold text-purple-800">{Object.keys(baseRollRequirements).length}</p>
          </div>
          <div className="bg-white p-3 rounded-lg border border-purple-200">
            <h4 className="font-semibold text-purple-700 mb-1">Rolls to Make:</h4>
            <p className="text-2xl font-bold text-purple-800">
              {Object.entries(baseRollRequirements).reduce((sum, [baseRoll, quantity]) => {
                const rollInfo = getRollInfo(baseRoll);
                if (rollInfo && rollInfo.rollType !== 'Nigiri' && rollInfo.rollType !== 'Onigiri' && rollInfo.rollType !== 'Bites') {
                  return sum + quantity;
                }
                return sum;
              }, 0)}
            </p>
          </div>
          <div className="bg-white p-3 rounded-lg border border-orange-200">
            <h4 className="font-semibold text-orange-700 mb-1">Individual Pieces:</h4>
            <p className="text-2xl font-bold text-orange-800">
              {Object.entries(baseRollRequirements).reduce((sum, [baseRoll, quantity]) => {
                const rollInfo = getRollInfo(baseRoll);
                if (!rollInfo || rollInfo.rollType === 'Nigiri' || rollInfo.rollType === 'Onigiri' || rollInfo.rollType === 'Bites') {
                  return sum + quantity;
                }
                return sum;
              }, 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Menu Items Breakdown */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold text-gray-800 mb-3">Menu Items Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          {filteredItems.map((item: any, index: number) => {
            const requirements = MENU_ROLL_REQUIREMENTS[item.item];
            
            return (
              <div key={index} className="border border-gray-200 rounded-lg p-3">
                <div className="font-semibold text-gray-800 mb-2">{item.item}</div>
                <div className="text-gray-600 mb-1">Quantity: {item.todayRecommendation}</div>
                {requirements && requirements.length > 0 ? (
                  <div className="text-xs space-y-1">
                    <div className="font-medium text-gray-700">Requires:</div>
                    {requirements.map((req, reqIndex) => (
                      <div key={reqIndex} className="flex justify-between">
                        <span>{req.baseRoll}</span>
                        <span className="font-semibold">{(req.quantity * item.todayRecommendation).toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">No base rolls required</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Debug Info */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
        <p><strong>Debug Info:</strong></p>
        <p>Today's weekday: {todayWeekday} ({['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][todayWeekday]})</p>
        <p>Roll calculation: Daily Quantity = Number of Rolls Needed</p>
        <p>Example: 6 Cucumber Hosomaki = 6 rolls (8 pieces each = 48 total pieces)</p>
        <div className="mt-2">
          <strong>Item Details:</strong>
          {filteredItems.slice(0, 3).map((item: any, i: number) => {
            const rollInfo = getRollInfo(item.item);
            const rolls = calculateRollsNeeded(item.todayRecommendation, item.item);
            const totalPieces = rollInfo && rolls ? rolls * rollInfo.piecesPerRoll : item.todayRecommendation;
            return (
              <div key={i} className="ml-2">
                {item.item}: Daily={item.todayRecommendation}, Type={rollInfo?.rollType || 'Unknown'}, 
                Rolls={rolls || 'N/A'}, Total Pieces={totalPieces}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-gray-200 text-center text-sm text-gray-500">
        <p>This sheet shows daily production requirements including roll calculations.</p>
        <p>Generated on {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
};

export default DailyProductionSheet;
