import { useApp } from '../../stores/app'
import { LoginScreen } from './login-screen'

/** Full-screen overlay; the underlying screen (e.g. an open cart) is preserved. */
export function LockScreen() {
  const session = useApp((s) => s.session)
  return (
    <div className="fixed inset-0 z-[70]">
      <LoginScreen lockedUserId={session?.userId} />
    </div>
  )
}
