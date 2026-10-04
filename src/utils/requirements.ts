import type { ResourceType } from '../types'

export type Requirements = Record<ResourceType, number> & { ANY: number }

export function parseRequirements(str: string): Requirements {
  const result: Requirements = { ARM: 0, CON: 0, TRI: 0, TRG: 0, ANY: 0 }
  for (const m of str.matchAll(/(\d+)\s*(ARM|CON|TRI|TRG|ANY)/g)) {
    result[m[2] as keyof Requirements] += parseInt(m[1])
  }
  return result
}

export function meetsRequirements(selected: { type: ResourceType }[], req: Requirements): boolean {
  const counts: Record<string, number> = { ARM: 0, CON: 0, TRI: 0, TRG: 0 }
  for (const c of selected) counts[c.type]++

  // Check specific type requirements first
  const specificMet = (['ARM', 'CON', 'TRI', 'TRG'] as ResourceType[]).every(t => counts[t] >= req[t])
  if (!specificMet) return false

  // Check ANY: remaining cards (after covering specifics) must satisfy ANY count
  if (req.ANY > 0) {
    const usedForSpecifics = (['ARM', 'CON', 'TRI', 'TRG'] as ResourceType[]).reduce(
      (sum, t) => sum + req[t], 0
    )
    const remaining = selected.length - usedForSpecifics
    return remaining >= req.ANY
  }

  return true
}

export function totalRequired(req: Requirements): number {
  return req.ARM + req.CON + req.TRI + req.TRG + req.ANY
}

const REQUIREMENT_KEYS = ['ARM', 'CON', 'TRI', 'TRG', 'ANY'] as const

function meetsWithWaivers(selected: { type: ResourceType }[], req: Requirements, waivers: number): boolean {
  if (meetsRequirements(selected, req)) return true
  if (waivers <= 0) return false
  return REQUIREMENT_KEYS.some(k => req[k] > 0 && meetsWithWaivers(selected, { ...req, [k]: req[k] - 1 }, waivers - 1))
}

/**
 * True when `selected` cards satisfy a Work Order `recipe`. `waivers` lets that many required
 * cards be skipped (Paladin's Forge of Ironpeak discount).
 */
export function canCraft(selected: { type: ResourceType }[], recipe: string, waivers = 0): boolean {
  return meetsWithWaivers(selected, parseRequirements(recipe), waivers)
}
