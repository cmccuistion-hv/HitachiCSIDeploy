import type { ReactNode } from 'react'

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className={`field${error ? ' error' : ''}`}>
      <label>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  )
}

export function Section({
  title,
  actions,
  children,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="section">
      <div className="section-header">
        <h3>{title}</h3>
        {actions}
      </div>
      {children}
    </div>
  )
}

export function Callout({
  children,
  variant = 'info',
}: {
  children: ReactNode
  variant?: 'info' | 'warn' | 'ok'
}) {
  return <div className={`callout${variant !== 'info' ? ` ${variant}` : ''}`}>{children}</div>
}

export function ChoiceCard({
  title,
  description,
  selected,
  onClick,
  acronym,
  disabled,
}: {
  title: string
  description?: string
  selected?: boolean
  onClick?: () => void
  /** Legacy acronym — shown small and muted, no “aka” wording */
  acronym?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`choice-card${selected ? ' selected' : ''}`}
      onClick={onClick}
      disabled={disabled}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      <h3>
        {title}
        {acronym && <span className="acronym">{acronym}</span>}
      </h3>
      {description && <p>{description}</p>}
    </button>
  )
}

export function ToggleRow({
  checked,
  onChange,
  title,
  description,
  acronym,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  description: string
  /** Legacy acronym — shown small and muted, no “aka” wording */
  acronym?: string
  disabled?: boolean
}) {
  return (
    <label className="toggle-row" style={disabled ? { opacity: 0.55 } : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div>
        <strong>
          {title}
          {acronym && <span className="acronym">{acronym}</span>}
        </strong>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--hv-text-subtle)' }}>
          {description}
        </p>
      </div>
    </label>
  )
}

function copyTextPreservingNewlines(text: string): Promise<void> {
  // Prefer Clipboard API; fall back to a textarea so newlines are not collapsed.
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    try {
      if (!document.execCommand('copy')) reject(new Error('copy failed'))
      else resolve()
    } catch (e) {
      reject(e)
    } finally {
      document.body.removeChild(ta)
    }
  })
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={async () => {
        try {
          await copyTextPreservingNewlines(text)
        } catch {
          // Clipboard may be blocked (e.g. insecure context / IDE webview) — download instead.
          downloadTextFile('copied.txt', text)
        }
      }}
    >
      {label}
    </button>
  )
}

export function DownloadButton({
  filename,
  content,
  label = 'Download',
  mime,
}: {
  filename: string
  content: string
  label?: string
  mime?: string
}) {
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => downloadTextFile(filename, content, mime)}
    >
      {label}
    </button>
  )
}
