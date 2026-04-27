const STYLES = {
  healthy: 'bg-green-500/20 text-green-400 border border-green-500/30',
  watch:   'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  risk:    'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  critical:'bg-red-500/20 text-red-400 border border-red-500/30',
};

export default function HealthBadge({ score, band, size = 'sm' }) {
  const base = size === 'lg'
    ? 'text-lg font-bold px-3 py-1 rounded-lg'
    : 'text-xs font-semibold px-2 py-0.5 rounded';
  return (
    <span className={`inline-flex items-center tabular-nums ${base} ${STYLES[band] ?? STYLES.critical}`}>
      {score}
    </span>
  );
}
