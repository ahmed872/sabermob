/** Contract for offers, reports, search, backup and import/export. */
import type { OfferSaveInput, SuggestInput } from '../schemas/offers'
import type { OfferDto, OfferInsights, OfferStats, SuggestResult } from '../types/offers'
import type { FinalContract } from './contract-final'

type Empty = Record<string, never> | undefined

export interface OfferContract {
  'offers.list': { in: Empty; out: OfferDto[] }
  'offers.save': { in: OfferSaveInput; out: OfferDto }
  'offers.delete': { in: { id: string }; out: { ok: true } }
  'offers.suggest': { in: SuggestInput; out: SuggestResult }
  'offers.analytics': { in: { from?: string; to?: string }; out: OfferStats[] }
  'offers.insights': { in: Empty; out: OfferInsights }
}

export interface LateContract extends OfferContract, FinalContract {}
