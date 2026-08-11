import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

/** Click/focus-toggled help popover (hover enhances expand; touch-safe). */
export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tipId = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span
      className={`help-tip${open ? ' open' : ''}`}
      ref={wrapRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="help-tip-btn"
        aria-label="More information"
        aria-expanded={open}
        aria-controls={tipId}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        onFocus={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <span className="help-tip-popover" id={tipId} role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}

export function Field({
  label,
  hint,
  help,
  error,
  children,
}: {
  label: string
  hint?: string
  /** Longer “what is this?” shown via HelpTip beside the label */
  help?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className={`field${error ? ' error' : ''}`}>
      <label>
        {label}
        {help ? <HelpTip text={help} /> : null}
      </label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  )
}

export function Section({
  title,
  help,
  actions,
  children,
}: {
  title: string
  help?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="section">
      <div className="section-header">
        <h3>
          {title}
          {help ? <HelpTip text={help} /> : null}
        </h3>
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

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function flattenCopyText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenCopyText).join('')
  return ''
}

/** Code / YAML preview with a top-right copy icon (docs-style). */
export function CodeBlock({
  text,
  children,
  className = 'code-block',
  style,
}: {
  /** Text copied to clipboard. Defaults to string children. */
  text?: string
  children?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const display = children ?? text
  const copyValue = text ?? flattenCopyText(children).trim()

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  const { maxHeight, marginTop, marginBottom, margin, ...restStyle } = style ?? {}
  const wrapStyle: CSSProperties = {
    ...(margin !== undefined ? { margin } : null),
    ...(marginTop !== undefined ? { marginTop } : null),
    ...(marginBottom !== undefined ? { marginBottom } : null),
  }

  return (
    <div className="code-block-wrap" style={Object.keys(wrapStyle).length ? wrapStyle : undefined}>
      <pre
        className={className}
        style={{
          ...restStyle,
          ...(maxHeight !== undefined ? { maxHeight } : null),
        }}
      >
        {display}
      </pre>
      <button
        type="button"
        className={`code-block-copy${copied ? ' copied' : ''}`}
        aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        title={copied ? 'Copied' : 'Copy'}
        disabled={!copyValue}
        onClick={async () => {
          if (!copyValue) return
          try {
            await copyTextPreservingNewlines(copyValue)
          } catch {
            downloadTextFile('copied.txt', copyValue)
          }
          setCopied(true)
          if (resetTimer.current) clearTimeout(resetTimer.current)
          resetTimer.current = setTimeout(() => setCopied(false), 1600)
        }}
      >
        {copied ? <CheckIcon /> : <ClipboardIcon />}
      </button>
    </div>
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
