import React from 'react';
import { BarChart3, ClipboardList, Factory, Wrench, Trophy, Megaphone, Lock } from 'lucide-react';

const SECTIONS = [
  { id: 'sales',        label: 'Sales',        sub: 'CRM · Calls',          icon: BarChart3 },
  { id: 'pm',           label: 'PM',           sub: 'Jobs · Audit',          icon: ClipboardList },
  { id: 'production',   label: 'Production',   sub: 'Overview · Throughput', icon: Factory },
  { id: 'installation', label: 'Installation', sub: 'Jobs · Crews',          icon: Wrench },
  { id: 'excellence',   label: 'Excellence',   sub: 'Scores · Culture',      icon: Trophy },
  { id: 'marketing',    label: 'Marketing',    sub: 'GMB · Facebook · Web',  icon: Megaphone },
];

export default function Sidebar({ active, onSelect, onLogout }) {
  return (
    <div className="w-[220px] flex-shrink-0 bg-sidebar flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="text-lg font-bold text-accent tracking-tight">Signs By G</div>
        <div className="text-[10px] text-white/40 mt-0.5 uppercase tracking-widest">Operations Hub</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {SECTIONS.map(s => {
          const isActive = active === s.id;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all relative ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent rounded-r-full" />
              )}
              <Icon size={18} className={isActive ? 'text-accent' : ''} />
              <div>
                <div className={`text-sm ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {s.label}
                </div>
                <div className="text-[10px] text-white/30 mt-0.5">{s.sub}</div>
              </div>
            </button>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
        <div className="text-[10px] text-white/20">signsbyg-ops</div>
        {onLogout && (
          <button
            onClick={onLogout}
            className="text-white/20 hover:text-white/50 transition-colors"
            title="Lock dashboard"
          >
            <Lock size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
