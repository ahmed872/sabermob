/**
 * Permission catalogue. Keys are stable identifiers stored in the database.
 * Authorization is enforced in the main process IPC router and services;
 * the renderer only uses them to hide UI.
 */
export const PERMISSIONS = {
  // sales
  view_sales: 'sales',
  create_sale: 'sales',
  cancel_sale: 'sales',
  refund_sale: 'sales',
  edit_price: 'sales',
  apply_discount: 'sales',
  sell_below_min_price: 'sales',
  sell_on_credit: 'sales',
  reprint_receipt: 'sales',
  manage_shifts: 'sales',
  view_all_shifts: 'sales',
  manage_cash_drawer: 'sales',
  // profit & finance
  view_profit: 'finance',
  view_cost: 'finance',
  view_reports: 'finance',
  export_reports: 'finance',
  // inventory
  view_inventory: 'inventory',
  manage_inventory: 'inventory',
  modify_stock: 'inventory',
  import_data: 'inventory',
  // suppliers
  manage_suppliers: 'suppliers',
  manage_purchases: 'suppliers',
  pay_suppliers: 'suppliers',
  view_supplier_balances: 'suppliers',
  // repairs
  view_repairs: 'repairs',
  manage_repairs: 'repairs',
  delete_repair: 'repairs',
  view_device_passcode: 'repairs',
  // customers
  view_customer_data: 'customers',
  manage_customers: 'customers',
  collect_customer_debt: 'customers',
  // offers
  manage_offers: 'offers',
  view_offer_analytics: 'offers',
  // administration
  manage_users: 'admin',
  manage_settings: 'admin',
  manage_backups: 'admin',
  view_audit_log: 'admin',
  manage_license: 'admin'
} as const

export type PermissionKey = keyof typeof PERMISSIONS
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[]

export const SYSTEM_ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN', 'ACCOUNTANT', 'INVENTORY_MANAGER'] as const
export type SystemRoleKey = (typeof SYSTEM_ROLES)[number]

const MANAGER_EXCLUDES: PermissionKey[] = ['manage_users', 'manage_license', 'manage_backups']

export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRoleKey, PermissionKey[]> = {
  OWNER: ALL_PERMISSIONS,
  MANAGER: ALL_PERMISSIONS.filter((p) => !MANAGER_EXCLUDES.includes(p)),
  CASHIER: [
    'view_sales', 'create_sale', 'apply_discount', 'manage_shifts', 'view_inventory',
    'view_repairs', 'manage_repairs', 'view_customer_data', 'manage_customers', 'collect_customer_debt'
  ],
  TECHNICIAN: ['view_repairs', 'manage_repairs', 'view_inventory', 'view_customer_data', 'view_device_passcode'],
  ACCOUNTANT: [
    'view_sales', 'view_profit', 'view_cost', 'view_reports', 'export_reports', 'view_supplier_balances',
    'pay_suppliers', 'view_customer_data', 'collect_customer_debt', 'view_all_shifts', 'view_audit_log', 'view_inventory'
  ],
  INVENTORY_MANAGER: [
    'view_inventory', 'manage_inventory', 'modify_stock', 'import_data', 'manage_suppliers', 'manage_purchases',
    'view_cost', 'view_sales'
  ]
}

/** Max discount (bp) each built-in role may give without manager approval. */
export const DEFAULT_ROLE_DISCOUNT_BP: Record<SystemRoleKey, number> = {
  OWNER: 10_000,
  MANAGER: 5_000,
  CASHIER: 1_000,
  TECHNICIAN: 0,
  ACCOUNTANT: 0,
  INVENTORY_MANAGER: 0
}
