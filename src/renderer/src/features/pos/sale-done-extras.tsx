import type { SaleDto } from '@shared/types/sales'

/** Extra actions after a sale (receipt printing is registered by the printing module). */
export function SaleDoneExtras(_props: { sale: SaleDto }) {
  return null
}
