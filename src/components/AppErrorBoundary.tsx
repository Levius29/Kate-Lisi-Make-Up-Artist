import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  error?: Error
  componentStack?: string
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {}

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(_error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? '' })
  }

  render() {
    const { error, componentStack } = this.state
    if (!error) return this.props.children

    const reportDetail = [error.stack ?? `${error.name}: ${error.message}`, componentStack]
      .filter(Boolean)
      .join('\n')

    return (
      <main className="min-h-dvh overflow-y-auto bg-canvas pb-[calc(2rem+env(safe-area-inset-bottom))] pl-[calc(1.5rem+env(safe-area-inset-left))] pr-[calc(1.5rem+env(safe-area-inset-right))] pt-[calc(2rem+env(safe-area-inset-top))] text-ink">
        <section className="mx-auto flex min-h-[calc(100dvh-4rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-xl flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Studio is still safe
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
            This screen stopped working
          </h1>
          <p className="mt-5 text-base leading-7 text-muted">
            Your client records and studio details are safe on this device. This display error
            did not change them.
          </p>
          <button
            type="button"
            className="mt-7 min-h-12 w-full rounded-full bg-ink px-6 py-3 text-base font-semibold text-canvas sm:w-auto sm:self-start"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <details className="mt-6 min-w-0 rounded-2xl border border-line bg-paper px-4">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-muted">
              Details for support
            </summary>
            <pre className="mb-4 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-canvas p-3 text-xs leading-5 text-muted">
              {reportDetail}
            </pre>
          </details>
        </section>
      </main>
    )
  }
}
