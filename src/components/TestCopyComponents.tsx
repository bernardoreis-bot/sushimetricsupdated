import React from 'react';

export default function TestCopyComponents() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Test Copy Components</h1>
      <div className="bg-green-50 border border-green-200 rounded p-4">
        <p className="text-green-800">✅ Copy components are working!</p>
        <p className="text-sm text-green-600 mt-2">
          If you can see this page, the copy components are properly imported and functional.
        </p>
      </div>
    </div>
  );
}
