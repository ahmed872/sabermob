import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollText } from 'lucide-react'
import type { AuditLogDto } from '@shared/types/auth'
import { useApi } from '../../lib/query'
import { fmtDate } from '../../lib/format'
import { Card, EmptyState } from '../../components/ui/misc'
import { Input } from '../../components/ui/input'
import { DataTable, Pagination, type Column } from '../../components/ui/table'

function describe(m: Record<string, unknown> | null): string {
  if (!m) return ''
  return Object.entries(m)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ')
}

export function AuditSection() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const list = useApi('audit.list', { page, pageSize: 50, action: action || undefined }, { placeholderData: (p) => p })
  const columns: Column<AuditLogDto>[] = [
    { key: 'date', header: t('common.date'), cell: (r) => <span className="whitespace-nowrap text-muted">{fmtDate(r.createdAt, true)}</span> },
    { key: 'user', header: t('common.user'), cell: (r) => r.userName ?? '—' },
    { key: 'action', header: t('audit.filterAction'), cell: (r) => <span className="font-semibold">{t(`audit.actions.${r.action}`, { defaultValue: r.action })}</span> },
    { key: 'meta', header: t('common.details'), cell: (r) => <span className="line-clamp-1 text-xs text-muted">{describe(r.metadata)}</span> }
  ]
  return (
    <Card padded={false}>
      <div className="border-b border-line p-3">
        <Input
          className="max-w-xs"
          placeholder={t('audit.filterAction')}
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setPage(1)
          }}
          dir="ltr"
        />
      </div>
      <DataTable columns={columns} rows={list.data?.items ?? []} rowKey={(r) => r.id} dense empty={<EmptyState icon={ScrollText} title={t('common.noResults')} />} />
      <div className="border-t border-line">
        <Pagination page={page} pageSize={50} total={list.data?.total ?? 0} onPage={setPage} />
      </div>
    </Card>
  )
}
