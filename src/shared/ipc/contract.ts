/**
 * Typed contract between renderer and main. Every method listed here has a
 * handler registered in src/main/ipc/handlers/*. Inputs are validated with
 * the zod schemas in src/shared/schemas; outputs are plain DTOs.
 */
import type { AllSettings, SettingsGroup } from '../settings'
import type { LicenseState } from '../types/license'
import type { AuditLogDto, LoginUserTile, RoleDto, SessionInfo, UserDto } from '../types/auth'
import type {
  BrandDto,
  CategoryDto,
  DeviceModelDto,
  InventoryValuation,
  Paged,
  ProductDto,
  SerialDto,
  StockAlerts,
  StockMovementDto,
  VariantListItem
} from '../types/catalog'
import type {
  ActivateInput,
  AuditQueryInput,
  LoginInput,
  OnboardingInput,
  OverrideInput,
  RoleSaveInput,
  SettingsUpdateInput,
  UserCreateInput,
  UserUpdateInput
} from '../schemas/system'
import type {
  BrandSaveInput,
  CategorySaveInput,
  DeviceModelSaveInput,
  MovementQueryInput,
  PosSearchInput,
  ProductQueryInput,
  ProductSaveInput,
  StockAdjustInput
} from '../schemas/catalog'
import type { SystemInfo } from '../types/system'
import type { ExtendedContract } from './contract-ext'

type Empty = Record<string, never> | undefined

export interface CoreContract {
  // system
  'system.info': { in: Empty; out: SystemInfo }
  'system.onboard': { in: OnboardingInput; out: { ok: true } }
  'system.openDataFolder': { in: Empty; out: { ok: true } }
  'system.printers': { in: Empty; out: Array<{ name: string; displayName: string; isDefault: boolean }> }
  // license
  'license.state': { in: Empty; out: LicenseState }
  'license.activate': { in: ActivateInput; out: LicenseState }
  // auth
  'auth.loginTiles': { in: Empty; out: LoginUserTile[] }
  'auth.login': { in: LoginInput; out: SessionInfo }
  'auth.unlock': { in: LoginInput & { userId: string }; out: SessionInfo }
  'auth.session': { in: Empty; out: SessionInfo | null }
  'auth.lock': { in: Empty; out: { ok: true } }
  'auth.logout': { in: Empty; out: { ok: true } }
  'auth.heartbeat': { in: Empty; out: { locked: boolean } }
  'auth.override': { in: OverrideInput; out: { token: string; approverName: string } }
  'auth.changePassword': { in: { currentPassword: string; newPassword: string }; out: { ok: true } }
  'auth.setPin': { in: { currentPassword: string; pin: string | null }; out: { ok: true } }
  // users & roles
  'users.list': { in: Empty; out: UserDto[] }
  'users.create': { in: UserCreateInput; out: UserDto }
  'users.update': { in: UserUpdateInput; out: UserDto }
  'roles.list': { in: Empty; out: RoleDto[] }
  'roles.save': { in: RoleSaveInput; out: RoleDto }
  'roles.delete': { in: { id: string }; out: { ok: true } }
  'audit.list': { in: AuditQueryInput; out: Paged<AuditLogDto> }
  // settings
  'settings.get': { in: Empty; out: AllSettings }
  'settings.update': { in: SettingsUpdateInput; out: AllSettings[SettingsGroup] }
  // catalog
  'catalog.brands': { in: Empty; out: BrandDto[] }
  'catalog.saveBrand': { in: BrandSaveInput; out: BrandDto }
  'catalog.deleteBrand': { in: { id: string }; out: { ok: true } }
  'catalog.models': { in: { brandId?: string }; out: DeviceModelDto[] }
  'catalog.saveModel': { in: DeviceModelSaveInput; out: DeviceModelDto }
  'catalog.deleteModel': { in: { id: string }; out: { ok: true } }
  'catalog.categories': { in: Empty; out: CategoryDto[] }
  'catalog.saveCategory': { in: CategorySaveInput; out: CategoryDto }
  'catalog.deleteCategory': { in: { id: string }; out: { ok: true } }
  'catalog.list': { in: ProductQueryInput; out: Paged<VariantListItem> }
  'catalog.posSearch': { in: PosSearchInput; out: VariantListItem[] }
  'catalog.findByCode': { in: { code: string }; out: VariantListItem | null }
  'catalog.variant': { in: { id: string }; out: VariantListItem }
  'catalog.product': { in: { id: string }; out: ProductDto }
  'catalog.saveProduct': { in: ProductSaveInput; out: ProductDto }
  'catalog.deleteProduct': { in: { id: string }; out: { ok: true } }
  'catalog.toggleFavorite': { in: { id: string; isFavorite: boolean }; out: { ok: true } }
  'catalog.generateBarcode': { in: Empty; out: { code: string } }
  'catalog.serials': { in: { variantId: string }; out: SerialDto[] }
  // inventory
  'inventory.adjust': { in: StockAdjustInput; out: { id: string; number: string } }
  'inventory.movements': { in: MovementQueryInput; out: Paged<StockMovementDto> }
  'inventory.alerts': { in: Empty; out: StockAlerts }
  'inventory.valuation': { in: Empty; out: InventoryValuation }
}

export type ApiContract = CoreContract & ExtendedContract
export type ApiMethod = keyof ApiContract
export type ApiInput<K extends ApiMethod> = ApiContract[K]['in']
export type ApiOutput<K extends ApiMethod> = ApiContract[K]['out']

/** Events pushed from main to renderer. */
export interface ApiEvents {
  'session:changed': SessionInfo | null
  'license:changed': LicenseState
  'settings:changed': { group: SettingsGroup }
  'notice': { level: 'info' | 'warning' | 'error'; key: string; params?: Record<string, unknown> }
  'menu:command': { command: string }
}
export type ApiEventName = keyof ApiEvents
