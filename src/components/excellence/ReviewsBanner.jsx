// src/components/excellence/ReviewsBanner.jsx
import React from 'react';

export default function ReviewsBanner() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl px-6 py-4 flex items-center gap-6">
      <div className="flex items-center gap-2">
        <span className="text-xl">⭐</span>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">Google Reviews</p>
          <p className="text-sm text-gray-400 mt-0.5">Google Business Profile integration coming soon</p>
        </div>
      </div>
      <div className="ml-auto text-[10px] text-gray-400 border border-gray-200 rounded px-2 py-1">V2</div>
    </div>
  );
}
