import type { CurseId } from '../types'

/**
 * The Warlock's Curse deck. Curses are deliberately mild: each one triggers once and then
 * returns to the deck, and any curse that hasn't triggered by the end of the victim's next
 * turn fizzles. Cursed players see exactly what's coming, so they can play around it.
 */
export interface CurseCard {
  id: CurseId
  name: string
  icon: string
  /** What happens to the cursed player */
  text: string
  flavour: string
}

export const CURSES: CurseCard[] = [
  { id: 'jinx', name: 'Jinx', icon: '🎲', text: 'Their next die roll is 1 lower (minimum 1).', flavour: 'Luck sours like milk left in the sun.' },
  { id: 'butterfingers', name: 'Butterfingers', icon: '💨', text: 'Their next Gather or Mascot draws 1 fewer card (minimum 1).', flavour: 'Something keeps tugging at the satchel.' },
  { id: 'tithe', name: 'Tithe', icon: '🪙', text: 'Their next sale to a Visitor pays the Warlock 1 of the coins.', flavour: 'The shadows always take their cut.' },
  { id: 'hexedGoods', name: 'Hexed Goods', icon: '🕯️', text: 'Their next sale to a Visitor earns no Reputation from the cards.', flavour: 'The customer leaves with a shiver and no compliments.' },
  { id: 'leakyPockets', name: 'Leaky Pockets', icon: '🕳️', text: 'At the start of their next turn, their cheapest hoard card is discarded.', flavour: 'Just a small hole. Just a small loss.' },
  { id: 'tollOfShadows', name: 'Toll of Shadows', icon: '⛓️', text: 'Their next location action costs 1 coin, paid to the Warlock.', flavour: 'Every road has a gatekeeper, if you know where to look.' },
  { id: 'unsettledShelves', name: 'Unsettled Shelves', icon: '🌫️', text: 'At the start of their next turn, a random window card slides back into their hoard.', flavour: 'Things never stay where you put them.' },
  { id: 'badOmen', name: 'Bad Omen', icon: '🐦', text: 'No effect on them — the Warlock bottles a 1 instead.', flavour: 'A crow lands on the sign. Nobody says a word.' },
]

export const CURSE_BY_ID = Object.fromEntries(CURSES.map(c => [c.id, c])) as Record<CurseId, CurseCard>
