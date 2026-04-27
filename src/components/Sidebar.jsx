import React from 'react';

const SECTIONS = [
  { id: 'sales',        label: 'Sales',        sub: 'CRM · Calls',          emoji: '📊', color: '#6366f1' },
  { id: 'pm',           label: 'PM',           sub: 'Jobs · Audit',          emoji: '📋', color: '#a855f7' },
  { id: 'production',   label: 'Production',   sub: 'Overview · Throughput', emoji: '🏭', color: '#f97316' },
  { id: 'installation', label: 'Installation', sub: 'Jobs · Crews',          emoji: '🔧', color: '#eab308' },
];

export default function Sidebar({ active, onSelect }) {
  return (
    <div className="w-[180px] flex-shrink-0 bg-navy border-r border-white/7 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/6">
        <div className="text-sm font-bold text-white tracking-tight">Signs by G</div>
        <div className="text-[10px] text-white/30 mt-0.5">Operations Hub</div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {SECTIONS.map(s => {
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="w-full text-left px-2.5 py-2 rounded-lg flex items-center gap-2.5 transition-all"
              style={isActive ? {
                background: `${s.color}22`,
                border: `1px solid ${s.color}55`,
              } : {
                background: 'transparent',
                border: '1px solid transparent',
              }}
            >
              <span className="text-base leading-none">{s.emoji}</span>
              <div>
                <div className={`text-xs font-${isActive ? '600' : '500'} ${isActive ? 'text-white' : 'text-white/50'}`}>
                  {s.label}
                </div>
                <div className="text-[10px] text-white/25 mt-0.5">{s.sub}</div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/6">
        <div className="text-[10px] text-white/20">signsbyg-ops</div>
      </div>
    </div>
  );
}
