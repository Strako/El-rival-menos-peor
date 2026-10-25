const MEDALS: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
  4: '4️⃣',
  5: '5️⃣',
  6: '6️⃣',
  7: '7️⃣',
  8: '8️⃣',
  9: '9️⃣',
  10: '🔟',
};

export function rankBadge(rank: number): { emoji: string; label: string } {
  return {
    emoji: MEDALS[rank] ?? `#${rank}`,
    label: `Puesto ${rank}`,
  };
}
