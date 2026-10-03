import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlarmClock, LayoutGrid, List, ShieldCheck, Smartphone, Wrench } from 'lucide-react'
import type { RepairListItem, RepairStatusDto } from '@shared/types/repairs'
import { useApi } from '../../lib/query'
import { fmtDate, fmtMoney, fmtNumber, fmtRelative } from '../../lib/format'
import { cn, debounce } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { SearchInput, Select } from '../../components/ui/input'
import { Badge, Card, EmptyState, PageHeader, Segmented } from '../../components/ui/misc'
import { DataTable, Pagination, type Column } from '../../components/ui/table'

export function statusLabel(s: Pick<RepairStatusDto, 'name' | 'nameAr'> | undefined, lang: string): string {
  if (!s) return ''
  return lang === 'ar' ? s.nameAr : s.name
}

export function StatusBadge({ status }: { status: RepairStatusDto | undefined }) {
  const { i18n } = useTranslation()
  if (!status) return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: `${status.color}1f`, color: status.color }}>
      <span className="size-1.5 rounded-full" style={{ background: status.color }} />
      {statusLabel(status, i18n.language)}
    </span>
  )
}

export default function RepairsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const can = useCan()
  const [view, setView] = useState<'board' | 'list'>('board')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [statusId, setStatusId] = useState('')
  const [technicianId, setTechnicianId] = useState('')
  // Dashboard alerts link here with ?overdue=1 or ?status=READY
  const [params] = useSearchParams()
  const [overdue, setOverdue] = useState(params.get('overdue') === '1')
  const statusKey = params.get('status')
  const [page, setPage] = useState(1)
  const debounced = useMemo(() => debounce((v: string) => (setSearch(v), setPage(1)), 200), [])
  const statuses = useApi('repairs.statuses')
  useEffect(() => {
    const s = statusKey ? statuses.data?.find((x) => x.key === statusKey) : undefined
    if (s) setStatusId(s.id)
  }, [statusKey, statuses.data])
  const techs = useApi('repairs.technicians')
  const list = useApi(
    'repairs.list',
    {
      q: search || undefined,
      statusId: statusId || undefined,
      technicianId: technicianId || undefined,
      overdue: overdue || undefined,
      open: view === 'board' ? true : undefined,
      page: view === 'board' ? 1 : page,
      pageSize: view === 'board' ? 200 : 50
    },
    { placeholderData: (p) => p }
  )
  const byId = new Map((statuses.data ?? []).map((s) => [s.id, s]))
  const columns: Column<RepairListItem>[] = [
    {
      key: 'n',
      header: t('repairs.ticket'),
      cell: (r) => (
        <div>
          <p className="font-bold" dir="ltr">
            {r.number}
          </p>
          <p className="text-xs text-muted">{fmtDate(r.receivedAt)}</p>
        </div>
      )
    },
    {
      key: 'c',
      header: t('repairs.customer'),
      cell: (r) => (
        <div>
          <p className="font-semibold">{r.customerName}</p>
          <p className="text-xs text-muted" dir="ltr">
            {r.customerPhone}
          </p>
        </div>
      )
    },
    { key: 'd', header: t('repairs.device'), cell: (r) => <span>{[r.deviceBrand, r.deviceModel].filter(Boolean).join(' ')}</span> },
    { key: 'p', header: t('repairs.complaint'), cell: (r) => <span className="line-clamp-1 max-w-60 text-muted">{r.complaint}</span> },
    { key: 'tech', header: t('repairs.technician'), cell: (r) => <span className="text-muted">{r.technicianName ?? '—'}</span> },
    { key: 'price', header: t('common.price'), align: 'end', cell: (r) => <span className="tabular">{fmtMoney(r.finalPrice ?? r.estimatedPrice)}</span> },
    {
      key: 's',
      header: t('common.status'),
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          <StatusBadge status={byId.get(r.statusId)} />
          {r.overdue ? <Badge tone="danger">{t('repairs.overdue')}</Badge> : null}
        </span>
      )
    }
  ]
  const boardStatuses = (statuses.data ?? []).filter((s) => !s.isFinal && s.isActive)

  return (
    <div className="flex h-full flex-col p-5">
      <PageHeader
        icon={Wrench}
        title={t('repairs.title')}
        subtitle={t('repairs.subtitle')}
        actions={
          can('manage_repairs') ? (
            <Button onClick={() => navigate('/repairs/new')}>
              <Smartphone /> {t('repairs.newTicket')}
            </Button>
          ) : null
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-64 flex-1">
          <SearchInput
            autoFocus
            value={q}
            placeholder={t('repairs.searchPlaceholder')}
            onChange={(e) => {
              setQ(e.target.value)
              debounced(e.target.value)
            }}
            onClear={() => {
              setQ('')
              debounced('')
            }}
          />
        </div>
        {view === 'list' ? (
          <Select className="w-44" value={statusId} onChange={(e) => (setStatusId(e.target.value), setPage(1))}>
            <option value="">{t('repairs.all')}</option>
            {statuses.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {statusLabel(s, i18n.language)}
              </option>
            ))}
          </Select>
        ) : null}
        <Select className="w-44" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
          <option value="">{t('repairs.technician')}: {t('common.all')}</option>
          {techs.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </Select>
        <Button variant={overdue ? 'danger' : 'outline'} onClick={() => setOverdue(!overdue)}>
          <AlarmClock /> {t('repairs.overdue')}
        </Button>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'board', label: t('repairs.board'), icon: LayoutGrid },
            { value: 'list', label: t('repairs.list'), icon: List }
          ]}
        />
      </div>

      {view === 'board' && list.data && list.data.total > list.data.items.length ? (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">
          {t('repairs.boardLimited', { shown: fmtNumber(list.data.items.length), total: fmtNumber(list.data.total) })}
        </p>
      ) : null}
      {view === 'board' ? (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {boardStatuses.map((s) => {
            const items = (list.data?.items ?? []).filter((r) => r.statusId === s.id)
            return (
              <div key={s.id} className="flex w-72 shrink-0 flex-col rounded-2xl bg-sunken/70 p-2">
                <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                  <StatusBadge status={s} />
                  <span className="text-xs font-bold text-muted tabular">{items.length}</span>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                  {items.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => navigate(`/repairs/${r.id}`)}
                      className={cn('w-full rounded-xl border bg-surface p-3 text-start shadow-sm transition hover:border-primary', r.overdue ? 'border-danger/50' : 'border-line')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-muted" dir="ltr">
                          {r.number}
                        </span>
                        <span className="flex gap-1">
                          {r.isWarrantyClaim ? <ShieldCheck className="size-4 text-info" /> : null}
                          {r.overdue ? <AlarmClock className="size-4 text-danger" /> : null}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-bold">{[r.deviceBrand, r.deviceModel].filter(Boolean).join(' ')}</p>
                      <p className="line-clamp-2 text-xs text-muted">{r.complaint}</p>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="truncate font-semibold">{r.customerName}</span>
                        <span className="text-subtle">{fmtRelative(r.receivedAt)}</span>
                      </div>
                      {r.technicianName ? <p className="mt-1 text-[11px] text-muted">🔧 {r.technicianName}</p> : null}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {boardStatuses.length === 0 ? <EmptyState icon={Wrench} title={t('repairs.noRepairs')} /> : null}
        </div>
      ) : (
        <Card padded={false} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <DataTable
              columns={columns}
              rows={list.data?.items ?? []}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate(`/repairs/${r.id}`)}
              loading={list.isFetching}
              empty={<EmptyState icon={Wrench} title={t('repairs.noRepairs')} />}
            />
          </div>
          <div className="border-t border-line">
            <Pagination page={page} pageSize={50} total={list.data?.total ?? 0} onPage={setPage} />
          </div>
        </Card>
      )}
    </div>
  )
}
