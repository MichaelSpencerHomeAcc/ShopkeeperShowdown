/** The Sorcerer's Wild Surge table, rolled on 2d6. Extremes are rare; a third of results touch the table. */
export interface SurgeResult {
  total: number
  name: string
  icon: string
  text: string
  /** Rough feel for the UI: bad for you, mixed, or good */
  tone: 'bad' | 'mixed' | 'good'
}

export const SURGES: SurgeResult[] = [
  { total: 2, name: 'Backfire', icon: '💥', text: 'Break one of your own windows.', tone: 'bad' },
  { total: 3, name: 'Butterfingers', icon: '💨', text: 'Discard a random card from your hoard.', tone: 'bad' },
  { total: 4, name: 'Sheep!', icon: '🐑', text: 'Your best window card swaps with a random Flea Market card.', tone: 'mixed' },
  { total: 5, name: 'Swap Meet', icon: '🔄', text: 'Every player passes a random hoard card to the next player.', tone: 'mixed' },
  { total: 6, name: 'Gold Rain', icon: '🌧️', text: 'Every player gains 1 coin; you gain 2 more.', tone: 'good' },
  { total: 7, name: 'Arcane Bloom', icon: '🌸', text: 'Draw 2 resources.', tone: 'good' },
  { total: 8, name: 'Blink', icon: '✨', text: 'Gain 1 extra action this turn (Draw 1 instead if it isn’t your turn).', tone: 'good' },
  { total: 9, name: 'Transmute', icon: '⚗️', text: 'Change one of your cards into any resource type.', tone: 'good' },
  { total: 10, name: 'Mirror Image', icon: '👥', text: 'Copy any Professional in play and resolve it.', tone: 'good' },
  { total: 11, name: 'Fireball', icon: '🔥', text: 'Break 1 window of every other player (the Night Watcher protects).', tone: 'good' },
  { total: 12, name: 'Wish', icon: '🌟', text: 'Choose any result on this table.', tone: 'good' },
]

export const SURGE_BY_TOTAL = Object.fromEntries(SURGES.map(s => [s.total, s])) as Record<number, SurgeResult>
