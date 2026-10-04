import type { Player, ResourceCard, WorkOrderCard } from '../types'
import { canCraft } from './requirements'

/** Every card a player could spend on a Craft: hoard, non-broken windows, and the Rogue's counterfeits. */
export function craftableCards(player: Player): ResourceCard[] {
  return [
    ...player.hoard,
    ...player.windows.flatMap(w => (w.card && w.status !== 'broken' ? [w.card] : [])),
    ...(player.classId === 'rogue' ? player.counterfeitHand : []),
  ]
}

/** True when `player` holds enough matching cards to Craft `order` right now. */
export function canPlayerCraft(player: Player | undefined, order: WorkOrderCard | null): boolean {
  return !!player && !!order && canCraft(craftableCards(player), order.recipe, player.craftDiscount)
}
