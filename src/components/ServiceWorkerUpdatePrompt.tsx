interface ServiceWorkerUpdatePromptProps {
  onReload: () => void
  onDismiss: () => void
}

export function ServiceWorkerUpdatePrompt({
  onReload,
  onDismiss,
}: ServiceWorkerUpdatePromptProps) {
  return (
    <aside
      aria-label="App update"
      className="row-start-2 border-t border-line bg-paper pb-3 pl-[calc(0.75rem+env(safe-area-inset-left))] pr-[calc(0.75rem+env(safe-area-inset-right))] pt-3 text-ink lg:col-start-2 lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      role="status"
    >
      <div className="mx-auto grid w-full max-w-3xl grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 lg:max-w-4xl">
        <p className="min-w-0 text-sm font-semibold">Update ready</p>
        <button
          type="button"
          onClick={onReload}
          className="min-h-11 rounded-xl bg-accent px-4 text-sm font-bold text-paper"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="h-11 w-11 rounded-xl border border-line text-xl text-muted"
          aria-label="Dismiss update"
        >
          ×
        </button>
      </div>
    </aside>
  )
}
