import type { CurseId } from '../types'

/**
 * The Warlock's Curse deck, built to work as real cards on a table: the Warlock lays one face-up
 * in front of a player, and at the start of that player's next turn they resolve it and hand it
 * back (bottom of the Warlock's deck). One moment to remember, nothing hidden to track, and most
 * curses let the victim choose what they give up.
 */
export interface CurseCard {
  id: CurseId
  name: string
  icon: string
  /** What the cursed player does at the start of their next turn */
  text: string
  flavour: string
  /** The victim picks a card or window when it resolves */
  choice?: 'hoardCard' | 'windowCard' | 'window'
}

export const CURSES: CurseCard[] = [
  { id: 'tithe', name: 'Tithe', icon: '🪙', text: 'Pay the Warlock 3 coins.', flavour: 'The shadows always take their cut.' },
  { id: 'leakyPockets', name: 'Leaky Pockets', icon: '🕳️', text: 'Discard 1 card from your hoard (your choice).', flavour: 'Just a small hole. Just a small loss.', choice: 'hoardCard' },
  { id: 'stickyFingers', name: 'Sticky Fingers', icon: '🖐️', text: 'Give the Warlock 1 card from your hoard (your choice).', flavour: 'Something unseen tugs at the satchel.', choice: 'hoardCard' },
  { id: 'hexedShutters', name: 'Hexed Shutters', icon: '🪟', text: 'Shutter 1 of your open windows (your choice) until the start of your next turn.', flavour: 'The latch won’t budge, no matter how you pull.', choice: 'window' },
  { id: 'unsettledShelves', name: 'Unsettled Shelves', icon: '🌫️', text: 'Move 1 card from your windows back to your hoard (your choice).', flavour: 'Things never stay where you put them.', choice: 'windowCard' },
  { id: 'weariness', name: 'Weariness', icon: '😮‍💨', text: 'Exhaust 1 of your Active tokens (a Monk loses 1 Momentum).', flavour: 'Your limbs feel like lead this morning.' },
  { id: 'misfortune', name: 'Misfortune', icon: '🎲', text: 'Roll a d6. On a 1–3, pay the Warlock 3 coins.', flavour: 'Luck sours like milk left in the sun.' },
  { id: 'badOmen', name: 'Bad Omen', icon: '🐦', text: 'No effect on you — the Warlock bottles a 1 straight away.', flavour: 'A crow lands on the sign. Nobody says a word.' },
]

export const CURSE_BY_ID = Object.fromEntries(CURSES.map(c => [c.id, c])) as Record<CurseId, CurseCard>
