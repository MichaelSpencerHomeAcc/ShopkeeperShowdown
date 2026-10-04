import { useEffect } from 'react'
import { RESOURCE_CARDS } from '../data/resources'
import { VISITOR_CARDS } from '../data/visitors'
import { PROFESSIONAL_CARDS } from '../data/professionals'
import { WORK_ORDER_CARDS } from '../data/workorders'
import { RENOWN_CARDS } from '../data/renown'

const STATIC_IMAGES = [
  '/cards/resources/Card Back.png',
  '/cards/workorders/Card Back.png',
  '/cards/tokens/Stolen.png',
  '/cards/tokens/Break_Protect - side two.png',
  '/cards/tokens/Armament Reputation Token.png',
  '/cards/tokens/Consumable Reputation Token.png',
  '/cards/tokens/Trinket Reputation Token.png',
  '/cards/tokens/Trade Good Reputation Token.png',
  '/cards/tokens/Clan.png',
  '/cards/tokens/The Night Watcher.png',
]

// High-priority images (shown in action panels early) come first so the
// browser fetches them before the large resource card set.
function collectImageUrls(): string[] {
  return [
    ...WORK_ORDER_CARDS.map(c => c.imageFile),
    ...PROFESSIONAL_CARDS.map(c => c.imageFile),
    ...VISITOR_CARDS.map(c => c.imageFile),
    ...STATIC_IMAGES,
    ...RENOWN_CARDS.map(c => c.imageFile),
    ...RESOURCE_CARDS.map(c => c.imageFile),
  ]
}

export function useImagePreloader() {
  useEffect(() => {
    const urls = collectImageUrls()

    // Inject <link rel="preload"> tags — higher browser priority than new Image()
    const inserted: HTMLLinkElement[] = []
    urls.forEach(href => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = href
      document.head.appendChild(link)
      inserted.push(link)
    })

    return () => {
      inserted.forEach(link => document.head.removeChild(link))
    }
  }, [])
}
