// src/lib/excellenceUtils.js
export function gradeColor(grade) {
  return { A: 'text-success', B: 'text-accent', C: 'text-warning', D: 'text-orange-400', F: 'text-danger' }[grade] ?? 'text-white/40';
}

export function scoreColor(score) {
  if (score >= 75) return 'text-success';
  if (score >= 50) return 'text-warning';
  return 'text-danger';
}
