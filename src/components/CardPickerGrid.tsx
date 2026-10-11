/**
 * CardPickerGrid — horizontal scrollable row of cards for pick-one selection.
 * Pass ResourceCard[] (via resourceCards) or VisitorCard[] (via visitorCards).
 * selectedId highlights the chosen card; onSelect fires with the card's id.
 */
import type { ResourceCard, VisitorCard } from '../types'
import { ResourceCardMini } from './ResourceCardMini'
import { VisitorCardMini } from './VisitorCardMini'

interface BaseProps {
  selectedId: string
  onSelect: (id: string) => void
  /** Multi-select: highlights every id listed (overrides selectedId for resource cards). */
  selectedIds?: string[]
  label?: string
  emptyText?: string
  /** Size for resource cards. Default 'lg'. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Optional badge text per card id (e.g. { [cardId]: '🪟 W1' }) — shown as an overlay at the bottom of the card. */
  cardBadges?: Record<string, string>
}

interface ResourceProps extends BaseProps {
  resourceCards: ResourceCard[]
  visitorCards?: never
}

interface VisitorProps extends BaseProps {
  visitorCards: VisitorCard[]
  resourceCards?: never
}

type Props = ResourceProps | VisitorProps

export function CardPickerGrid({ selectedId, selectedIds, onSelect, label, emptyText, size = 'lg', cardBadges, ...rest }: Props) {
  const cards = 'resourceCards' in rest && rest.resourceCards ? rest.resourceCards : []
  const visitors = 'visitorCards' in rest && rest.visitorCards ? rest.visitorCards : []
  const isEmpty = cards.length === 0 && visitors.length === 0

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="text-[10px] font-semibold text-parchment-400 uppercase tracking-wide">{label}</div>
      )}
      {isEmpty ? (
        <div className="text-xs text-parchment-600 italic py-1">{emptyText ?? 'No cards available.'}</div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin scrollbar-thumb-parchment-700/40 scrollbar-track-transparent">
          {cards.map(card => (
            <div key={card.id} className="relative flex-shrink-0">
              <ResourceCardMini
                card={card}
                size={size}
                selected={selectedIds ? selectedIds.includes(card.id) : selectedId === card.id}
                onClick={() => onSelect(card.id)}
              />
              {cardBadges?.[card.id] && (
                <div className="absolute bottom-0 inset-x-0 text-center text-[7px] bg-sky-600/90 text-white font-bold rounded-b leading-tight py-0.5 pointer-events-none">
                  {cardBadges[card.id]}
                </div>
              )}
            </div>
          ))}
          {visitors.map(card => (
            <VisitorCardMini
              key={card.id}
              card={card}
              size="lg"
              selected={selectedId === card.id}
              onClick={() => onSelect(card.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
