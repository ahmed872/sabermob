import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { PermissionKey } from '@shared/permissions'

export interface AppRoute {
  path: string
  component: LazyExoticComponent<ComponentType> | ComponentType
  permission?: PermissionKey[]
}

const InventoryPage = lazy(() => import('../features/inventory/inventory-page'))
const ProductEditorPage = lazy(() => import('../features/inventory/product-editor'))
const SettingsPage = lazy(() => import('../features/settings/settings-page'))
const PosPage = lazy(() => import('../features/pos/pos-page'))
const SalesHistoryPage = lazy(() => import('../features/sales/sales-history'))
const ShiftsPage = lazy(() => import('../features/sales/shifts-page'))

export const ROUTES: AppRoute[] = [
  { path: '/pos', component: PosPage, permission: ['create_sale'] },
  { path: '/sales/history', component: SalesHistoryPage, permission: ['create_sale', 'view_sales'] },
  { path: '/sales/shifts', component: ShiftsPage, permission: ['view_all_shifts'] },
  { path: '/inventory', component: InventoryPage, permission: ['view_inventory'] },
  { path: '/inventory/:tab', component: InventoryPage, permission: ['view_inventory'] },
  { path: '/inventory/products/new', component: ProductEditorPage, permission: ['manage_inventory'] },
  { path: '/inventory/products/:id', component: ProductEditorPage, permission: ['view_inventory'] },
  { path: '/settings', component: SettingsPage },
  { path: '/settings/:section', component: SettingsPage }
]

/** Where to land after sign-in, based on what the user may do. */
export function DEFAULT_ROUTE(can: (p: PermissionKey[]) => boolean): string {
  for (const r of ROUTES) {
    if (r.path.includes(':')) continue
    if (!r.permission || can(r.permission)) return r.path
  }
  return '/settings'
}
