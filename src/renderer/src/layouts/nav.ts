import { BarChart3, Home, Package, Settings, ShoppingCart, Truck, Users, Wrench, type LucideIcon } from 'lucide-react'
import type { PermissionKey } from '@shared/permissions'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  permission?: PermissionKey[]
  shortcut?: string
}

/**
 * Main navigation (kept deliberately short). Modules register here as they
 * are implemented; advanced features live inside their module.
 */
export const NAV: NavItem[] = [
  { to: '/dashboard', label: 'nav.dashboard', icon: Home },
  { to: '/pos', label: 'nav.sales', icon: ShoppingCart, permission: ['create_sale'] },
  { to: '/inventory', label: 'nav.inventory', icon: Package, permission: ['view_inventory'] },
  { to: '/repairs', label: 'nav.repairs', icon: Wrench, permission: ['view_repairs'] },
  { to: '/customers', label: 'nav.customers', icon: Users, permission: ['view_customer_data'] },
  { to: '/suppliers', label: 'nav.suppliers', icon: Truck, permission: ['manage_suppliers', 'view_supplier_balances', 'manage_purchases'] },
  { to: '/reports', label: 'nav.reports', icon: BarChart3, permission: ['view_reports'] },
  { to: '/settings', label: 'nav.settings', icon: Settings, permission: ['manage_settings', 'manage_users', 'manage_backups', 'manage_license', 'view_audit_log'] }
]
