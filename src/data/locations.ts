import type { Location } from '../types'

/** Town board locations in board order (left-to-right, top row first). */
export const LOCATIONS: { id: Location; label: string }[] = [
  { id: 'guildhall',     label: 'Guildhall' },
  { id: 'tavern',        label: 'Tavern' },
  { id: 'wilderness',    label: 'Wilderness' },
  { id: 'barracks',      label: 'Barracks' },
  { id: 'workshop',      label: 'Workshop' },
  { id: 'thieves-guild', label: "Thieves' Guild" },
]
