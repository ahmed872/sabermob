import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

/**
 * Catches rendering errors so a bug in one screen never leaves the cashier
 * with a blank window. Offers "try again" (re-render) and "reload".
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  override state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack)
  }

  override componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  override render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-lg font-extrabold">{i18n.t('errors.INTERNAL')}</p>
        <p className="max-w-lg font-mono text-xs text-muted" dir="ltr" data-testid="ui-error">
          {this.state.error.message}
        </p>
        <div className="flex gap-2">
          <button className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-fg" onClick={() => this.setState({ error: null })}>
            {i18n.t('common.retry')}
          </button>
          <button className="rounded-xl border border-line-strong px-4 py-2 font-semibold" onClick={() => location.reload()}>
            {i18n.t('common.refresh')}
          </button>
        </div>
      </div>
    )
  }
}
