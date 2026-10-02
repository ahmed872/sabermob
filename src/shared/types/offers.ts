import type { OfferDef, Suggestion, AutoApplied } from '../domain/offers'

export interface OfferDto extends OfferDef {
  description: string | null
  triggerNames: string[]
  targetNames: string[]
}

export interface OfferStats {
  offerId: string | null
  name: string
  type: string
  shown: number
  accepted: number
  dismissed: number
  converted: number
  conversionBp: number
  revenue: number
  discountCost: number
  profit: number
}

export interface SuggestResult {
  suggestions: Suggestion[]
  autoApply: AutoApplied[]
}

export interface OfferInsights {
  deadStockCount: number
  deadStockValue: number
  activeOffers: number
}
