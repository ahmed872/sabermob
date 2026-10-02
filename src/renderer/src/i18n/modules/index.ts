import { auth } from './auth'
import { common } from './common'
import { errors } from './errors'
import { permissions } from './permissions'
import { inventory } from './inventory'
import { admin } from './admin'
import { pos } from './pos'
import { business } from './business'
import { print } from './print'
import { offers } from './offers'

export const modules = [common, errors, auth, permissions, inventory, admin, pos, business, print, offers]
