export function purchasePoints(total: number, rate: number): number {
  return Math.max(0, Math.floor(total * rate));
}

export function resolveLevelId(
  points: number,
  levels: Array<{ id: string; threshold: number }>,
): string | null {
  const eligible = levels
    .filter((l) => l.threshold <= points)
    .sort((a, b) => b.threshold - a.threshold);
  return eligible.length > 0 ? eligible[0].id : null;
}
