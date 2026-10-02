import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { fmtNumber } from '../../lib/format'
import { Button } from './button'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  className?: string
  align?: 'start' | 'end' | 'center'
  width?: string
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  loading,
  dense,
  rowClassName
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  empty?: ReactNode
  loading?: boolean
  dense?: boolean
  rowClassName?: (row: T) => string | undefined
}) {
  const align = (a?: string) => (a === 'end' ? 'text-end' : a === 'center' ? 'text-center' : 'text-start')
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={cn('sticky top-0 z-[1] border-b border-line bg-surface px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-subtle', align(c.align))}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cn(loading && 'opacity-60')}>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('group', onRowClick && 'cursor-pointer', rowClassName?.(row))}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn('border-b border-line/70 px-3 group-hover:bg-sunken/60', dense ? 'py-1.5' : 'py-2.5', align(c.align), c.className)}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && !loading ? empty : null}
    </div>
  )
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const { t } = useTranslation()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return <p className="px-3 py-2 text-xs text-muted">{t('common.showing', { count: total })}</p>
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <p className="text-xs text-muted">
        {t('common.showing', { count: total })} · {t('common.page', { page: fmtNumber(page), pages: fmtNumber(pages) })}
      </p>
      <div className="flex gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="previous">
          <ChevronLeft className="rtl:rotate-180" />
        </Button>
        <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="next">
          <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>
    </div>
  )
}
