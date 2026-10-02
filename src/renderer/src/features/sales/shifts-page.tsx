import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCheck, Clock3 } from 'lucide-react'
import type { ShiftSummary } from '@shared/types/sales'
import { useApi, useApiMutation } from '../../lib/query'
import { fmtDate, fmtMoney } from '../../lib/format'
import { cn } from '../../lib/utils'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Badge, Card, EmptyState, PageHeader } from '../../components/ui/misc'
import { DataTable, Pagination, type Column } from '../../components/ui/table'
import { ShiftSummaryView } from '../pos/shift'

export default function ShiftsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<ShiftSummary | null>(null)
  const list = useApi('shifts.list', { page, pageSize: 30 }, { placeholderData: (p) => p })
  const review = useApiMutation('shifts.review', { invalidate: ['shifts.'], onSuccess: (s) => setOpen(s) })
  const columns: Column<ShiftSummary>[] = [
    { key: 'n', header: '#', cell: (s) => <span className="font-bold">{s.number}</span> },
    { key: 'by', header: t('common.user'), cell: (s) => s.openedBy },
    { key: 'at', header: t('common.date'), cell: (s) => <span className="text-muted">{fmtDate(s.openedAt, true)}</span> },
    { key: 'sales', header: t('pos.salesTotal'), align: 'end', cell: (s) => <span className="tabular">{fmtMoney(s.salesTotal)}</span> },
    { key: 'exp', header: t('pos.expectedCash'), align: 'end', cell: (s) => <span className="tabular">{fmtMoney(s.expectedCash)}</span> },
    {
      key: 'diff',
      header: t('pos.difference'),
      align: 'end',
      cell: (s) => (s.difference === null ? '—' : <span className={cn('font-bold tabular', s.difference === 0 ? 'text-success' : 'text-warning')} dir="ltr">{fmtMoney(s.difference)}</span>)
    },
    {
      key: 'st',
      header: t('common.status'),
      cell: (s) => (
        <span className="flex gap-1">
          <Badge tone={s.status === 'OPEN' ? 'success' : 'neutral'}>{s.status === 'OPEN' ? t('pos.shiftOpen') : t('pos.shiftClosed')}</Badge>
          {s.reviewedBy ? <Badge tone="info"><CheckCheck className="size-3" /></Badge> : null}
        </span>
      )
    }
  ]
  return (
    <div className="flex h-full flex-col p-5">
      <PageHeader
        icon={Clock3}
        title={t('pos.shifts')}
        actions={
          <Button variant="outline" onClick={() => navigate('/pos')}>
            <ArrowLeft className="rtl:rotate-180" /> {t('nav.pos')}
          </Button>
        }
      />
      <Card padded={false} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DataTable columns={columns} rows={list.data?.items ?? []} rowKey={(s) => s.id} onRowClick={setOpen} empty={<EmptyState icon={Clock3} title={t('common.noResults')} />} />
        </div>
        <div className="border-t border-line">
          <Pagination page={page} pageSize={30} total={list.data?.total ?? 0} onPage={setPage} />
        </div>
      </Card>
      {open ? (
        <Dialog
          open
          onOpenChange={(o) => !o && setOpen(null)}
          size="sm"
          title={`${t('pos.shiftSummary')} — ${open.number}`}
          footer={
            open.status === 'CLOSED' && !open.reviewedBy ? (
              <Button onClick={() => review.mutate({ id: open.id })} loading={review.isPending}>
                <CheckCheck /> {t('common.confirm')}
              </Button>
            ) : null
          }
        >
          <ShiftSummaryView s={open} />
        </Dialog>
      ) : null}
    </div>
  )
}
