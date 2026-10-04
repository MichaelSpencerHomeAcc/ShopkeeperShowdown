import { describe, expect, it } from 'vitest'
import { canCraft, meetsRequirements, parseRequirements, recipeMainType } from './requirements'
import { cardsOf } from '../test/helpers'

describe('parseRequirements', () => {
  it('reads Visitor demands and Work Order recipes', () => {
    expect(parseRequirements('2 ARM, 1 CON')).toEqual({ ARM: 2, CON: 1, TRI: 0, TRG: 0, ANY: 0 })
    expect(parseRequirements('1 ARM + 1 TRI + 3 TRG')).toEqual({ ARM: 1, CON: 0, TRI: 1, TRG: 3, ANY: 0 })
    expect(parseRequirements('5 ANY')).toEqual({ ARM: 0, CON: 0, TRI: 0, TRG: 0, ANY: 5 })
  })
})

describe('meetsRequirements', () => {
  it('needs every specific type', () => {
    const req = parseRequirements('2 ARM + 1 CON')
    expect(meetsRequirements(cardsOf('ARM', 'ARM', 'CON'), req)).toBe(true)
    expect(meetsRequirements(cardsOf('ARM', 'CON', 'CON'), req)).toBe(false)
  })

  it('fills ANY slots with leftover cards only', () => {
    const req = parseRequirements('1 ARM, 2 ANY')
    expect(meetsRequirements(cardsOf('ARM', 'TRI', 'TRG'), req)).toBe(true)
    expect(meetsRequirements(cardsOf('ARM', 'TRI'), req)).toBe(false)
  })
})

describe('recipeMainType', () => {
  it('picks the most-needed type, breaking ties in ARM, CON, TRI, TRG order', () => {
    expect(recipeMainType('1 ARM + 1 TRI + 3 TRG')).toBe('TRG')
    expect(recipeMainType('2 ARM + 2 TRG')).toBe('ARM')
    expect(recipeMainType('2 CON + 2 TRI')).toBe('CON')
  })
})

describe('canCraft', () => {
  const recipe = '2 ARM + 1 CON + 1 TRI'

  it('accepts an exact match and rejects a short one', () => {
    expect(canCraft(cardsOf('ARM', 'ARM', 'CON', 'TRI'), recipe)).toBe(true)
    expect(canCraft(cardsOf('ARM', 'CON', 'TRI'), recipe)).toBe(false)
  })

  it('lets a Forge of Ironpeak waiver skip exactly one required card', () => {
    expect(canCraft(cardsOf('ARM', 'CON', 'TRI'), recipe, 1)).toBe(true)
    expect(canCraft(cardsOf('ARM', 'TRI'), recipe, 1)).toBe(false)
    expect(canCraft(cardsOf('ARM', 'TRI'), recipe, 2)).toBe(true)
  })
})
