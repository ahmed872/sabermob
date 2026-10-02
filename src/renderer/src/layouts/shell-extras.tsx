import { GlobalSearch, SearchTrigger } from '../features/search/global-search'

/**
 * Slots in the shell that feature modules fill in (global search, shift
 * status, global keyboard overlays). Kept separate so the shell layout does
 * not depend on every module.
 */
export const ShellExtras = {
  HeaderStart: SearchTrigger,
  HeaderEnd: () => null,
  Overlays: GlobalSearch
}
