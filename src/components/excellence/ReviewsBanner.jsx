// src/components/excellence/ReviewsBanner.jsx
import React from 'react';

export default function ReviewsBanner() {
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl px-6 py-4 flex items-center gap-6">
      <div className="flex items-center gap-2">
        <span className="text-xl">⭐</span>
        <div>
          <p className="text-xs text-white/40 uppercase tracking-widest">Google Reviews</p>
          <p className="text-sm text-white/30 mt-0.5">Google Business Profile integration coming soon</p>
        </div>
      </div>
      <div className="ml-auto text-[10px] text-white/20 border border-white/10 rounded px-2 py-1">V2</div>
    </div>
  );
}
