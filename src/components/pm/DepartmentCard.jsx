import React from 'react';

const today = () => new Date().toISOString().slice(0, 10);

export default function DepartmentCard({ deptKey, label, lead, tasks, onJobClick }) {
  const now = today();
  const week = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const overdueTasks = tasks.filter(t => t.due_on && t.due_on < now);
  const weekTasks = tasks.filter(t => t.due_on && t.due_on >= now && t.due_on <= week);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col">
      {/* Card header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">{label}</h3>
          <p className="text-gray-400 text-xs">{lead}</p>
        </div>
        <div className="flex gap-1.5">
          {overdueTasks.length > 0 && (
            <span className="bg-red-500/20 text-red-400 text-[10px] px-1.5 py-0.5 rounded font-semibold">
              {overdueTasks.length} overdue
            </span>
          )}
          {weekTasks.length > 0 && (
            <span className="bg-yellow-500/20 text-yellow-400 text-[10px] px-1.5 py-0.5 rounded font-semibold">
              {weekTasks.length} this week
            </span>
          )}
        </div>
      </div>

      <p className="text-gray-300 text-[10px] mb-3">{tasks.length} active tasks</p>

      {/* Task list */}
      <div className="space-y-0.5 overflow-y-auto max-h-72 flex-1">
        {tasks.length === 0 && (
          <p className="text-gray-300 text-xs py-2">Queue empty</p>
        )}
        {tasks.map(t => {
          const isOverdue = t.due_on && t.due_on < now;
          const isThisWeek = t.due_on && !isOverdue && t.due_on <= week;
          return (
            <div
              key={t.gid}
              className="flex items-center gap-2 py-1 px-1 -mx-1 rounded cursor-pointer hover:bg-black/[0.02] transition-colors"
              onClick={() => onJobClick(t.parentGid || t.gid)}
            >
              <span className="flex-1 text-xs text-gray-700 truncate" title={t.name}>
                {t.name.replace(/^(DESIGN|PERMITTING|PRODUCTION|INSTALLATION|INVOICING)\s*[-–]\s*/i, '')}
              </span>
              {t.isRedo && (
                <span className="text-orange-400 text-[10px] font-bold shrink-0">REDO</span>
              )}
              {t.due_on && (
                <span className={`text-[10px] tabular-nums shrink-0 ${
                  isOverdue ? 'text-red-400 font-semibold' :
                  isThisWeek ? 'text-yellow-400' :
                  'text-gray-300'
                }`}>
                  {t.due_on}
                </span>
              )}
              {!t.due_on && (
                <span className="text-gray-300 text-[10px] shrink-0">no date</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
