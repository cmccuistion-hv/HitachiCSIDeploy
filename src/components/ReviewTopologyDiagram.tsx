/**
 * Live Review diagram: configured objects, nested pools, click → generated YAML.
 * Theme tokens via rp-diagram-* — not a copy of the CSI Driver worker poster.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildReviewTopology, type ReviewChip, type ReviewSiteView } from '../catalog/reviewTopology'
import type { WizardState } from '../catalog/types'
import type { GeneratedFile } from '../generator/yaml'
import { CodeBlock, DownloadButton } from './ui'

function clipId(id: string): string {
  return `rt-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

/** Approximate SVG fit: truncate with an ellipsis and keep the full string in a tooltip. */
function FittedText({
  x,
  y,
  width,
  text,
  className,
  fontSize,
}: {
  x: number
  y: number
  width: number
  text: string
  className: string
  fontSize: number
}) {
  const max = Math.max(4, Math.floor(width / (fontSize * 0.58)))
  const shown = text.length <= max ? text : `${text.slice(0, max - 1)}…`
  return (
    <text x={x} y={y} textAnchor="middle" className={className}>
      {shown !== text ? <title>{text}</title> : null}
      {shown}
    </text>
  )
}

function Hit({
  id,
  selected,
  onSelect,
  children,
}: {
  id: string
  selected: string | null
  onSelect: (id: string) => void
  children: ReactNode
}) {
  return (
    <g
      className={`rp-diagram-hit${selected === id ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(id)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(id)
        }
      }}
    >
      {children}
    </g>
  )
}

function Chip({
  chip,
  x,
  y,
  w,
  h,
  selected,
  onSelect,
}: {
  chip: ReviewChip
  x: number
  y: number
  w: number
  h: number
  selected: string | null
  onSelect: (id: string) => void
}) {
  const cx = x + w / 2
  const tw = w - 14
  const cid = clipId(chip.id)
  const cls =
    chip.tone === 'ctrl'
      ? 'rp-diagram-chip-ctrl'
      : chip.tone === 'dr'
        ? 'rp-diagram-chip-dr'
        : chip.tone === 'node'
          ? 'rp-diagram-chip-node'
          : chip.tone === 'pill'
            ? 'rp-diagram-pill'
            : 'rp-diagram-card'
  const titleClass = chip.tone === 'ctrl' || chip.tone === 'dr' || chip.tone === 'node'
    ? 'rp-diagram-chip-title'
    : chip.tone === 'pill'
      ? 'rp-diagram-link-label'
      : 'rp-diagram-card-title'
  const titleSize = chip.tone === 'pill' ? 8 : 11
  const subClass = chip.tone === 'ctrl' || chip.tone === 'dr' || chip.tone === 'node'
    ? 'rp-diagram-chip-sub'
    : 'rp-diagram-muted'
  const subSize = chip.tone === 'ctrl' || chip.tone === 'dr' || chip.tone === 'node' ? 9 : 9.5
  return (
    <Hit id={chip.id} selected={selected} onSelect={onSelect}>
      <clipPath id={cid}>
        <rect x={x + 5} y={y} width={w - 10} height={h} rx={6} />
      </clipPath>
      <g className={cls}>
        <rect x={x} y={y} width={w} height={h} rx={chip.tone === 'pill' ? 9 : 8} />
        <g clipPath={`url(#${cid})`}>
          {chip.sub ? (
            <>
              <FittedText
                x={cx}
                y={y + h / 2 - 3}
                width={tw}
                text={chip.label}
                className={titleClass}
                fontSize={titleSize}
              />
              <FittedText
                x={cx}
                y={y + h / 2 + 10}
                width={tw}
                text={chip.sub}
                className={subClass}
                fontSize={subSize}
              />
            </>
          ) : (
            <FittedText
              x={cx}
              y={y + h / 2 + 4}
              width={tw}
              text={chip.label}
              className={titleClass}
              fontSize={titleSize}
            />
          )}
        </g>
      </g>
    </Hit>
  )
}

function SiteColumn({
  site,
  x,
  width,
  y,
  selected,
  onSelect,
}: {
  site: ReviewSiteView
  x: number
  width: number
  y: number
  selected: string | null
  onSelect: (id: string) => void
}) {
  const pad = 12
  const inner = width - pad * 2
  let cy = y + 22
  const rows: ReactNode[] = []

  rows.push(
    <text key="t" x={x + width / 2} y={y + 16} textAnchor="middle" className="rp-diagram-site">
      {site.title}
    </text>,
  )
  if (site.clusterLabel) {
    rows.push(
      <text key="cl" x={x + width / 2} y={y + 28} textAnchor="middle" className="rp-diagram-muted">
        {site.clusterLabel}
      </text>,
    )
    cy = y + 36
  }

  for (let r = 0; r < site.chips.length; r++) {
    const row = site.chips[r]
    const gap = 8
    const cw = row.length === 1 ? inner : (inner - gap * (row.length - 1)) / row.length
    const h = row.some((c) => c.sub) ? 32 : 26
    row.forEach((chip, i) => {
      rows.push(
        <Chip
          key={chip.id}
          chip={chip}
          x={x + pad + i * (cw + gap)}
          y={cy}
          w={cw}
          h={h}
          selected={selected}
          onSelect={onSelect}
        />,
      )
    })
    cy += h + 6
  }

  const scs = [...site.storageClasses]
  if (site.snapshot) scs.push(site.snapshot)
  if (scs.length) {
    const gap = 8
    const cols = Math.min(2, scs.length)
    const cw = cols === 1 ? inner : (inner - gap) / 2
    scs.forEach((chip, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      rows.push(
        <Chip
          key={chip.id}
          chip={chip}
          x={x + pad + col * (cw + gap)}
          y={cy + row * 40}
          w={cw}
          h={36}
          selected={selected}
          onSelect={onSelect}
        />,
      )
    })
    cy += Math.ceil(scs.length / 2) * 40
  }
  if (site.moreStorageClasses) {
    rows.push(
      <Hit key={site.moreStorageClasses.id} id={site.moreStorageClasses.id} selected={selected} onSelect={onSelect}>
        <g className="rp-diagram-pill">
          <rect x={x + pad} y={cy} width={inner} height={18} rx={9} />
          <FittedText
            x={x + width / 2}
            y={cy + 13}
            width={inner - 8}
            text={site.moreStorageClasses.label}
            className="rp-diagram-link-label"
            fontSize={8}
          />
        </g>
      </Hit>,
    )
    cy += 24
  }

  if (site.testVolume) {
    rows.push(
      <Chip
        key={site.testVolume.id}
        chip={site.testVolume}
        x={x + pad}
        y={cy}
        w={inner}
        h={36}
        selected={selected}
        onSelect={onSelect}
      />,
    )
    cy += 42
  }

  const clusterH = cy - y + 8

  return { nodes: rows, clusterH, clusterBottom: y + clusterH }
}

export function ReviewTopologyDiagram({
  state,
  files,
}: {
  state: WizardState
  files: GeneratedFile[]
}) {
  const model = useMemo(() => buildReviewTopology(state, files), [state, files])
  const [selected, setSelected] = useState<string | null>(null)
  const [filePath, setFilePath] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)

  const hit = selected ? model.hits[selected] : null
  const hitFiles = (hit?.files ?? [])
    .map((p) => files.find((f) => f.path === p))
    .filter((f): f is GeneratedFile => !!f)
  const current = hitFiles.find((f) => f.path === filePath) ?? hitFiles[0]

  const select = (id: string) => {
    setSelected(id)
    const next = model.hits[id]
    setFilePath(next?.files[0] ?? '')
  }

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (selected) {
      if (!el.open) el.showModal()
    } else if (el.open) {
      el.close()
    }
  }, [selected])

  const close = () => setSelected(null)

  const dual = model.dualSite
  const colW = dual ? 300 : 616
  const leftX = 12
  const rightX = 328
  const clusterY = 44

  const left = SiteColumn({
    site: model.sites[0],
    x: leftX,
    width: colW,
    y: clusterY,
    selected,
    onSelect: select,
  })
  const right = dual && model.sites[1]
    ? SiteColumn({
        site: model.sites[1],
        x: rightX,
        width: colW,
        y: clusterY,
        selected,
        onSelect: select,
      })
    : null

  const clusterH = Math.max(left.clusterH, right?.clusterH ?? 0)
  const arrayY = clusterY + clusterH + 20

  const renderArray = (site: ReviewSiteView, x: number, width: number) => {
    const pad = 12
    const inner = width - pad * 2
    const poolH = 52
    const gap = 8
    const poolRows = Math.ceil(Math.max(site.array.pools.length, 1) / 2)
    const moreH = site.array.morePools ? 22 : 0
    const bodyH = 40 + (site.array.pools.length ? poolRows * (poolH + gap) : 28) + moreH + 8
    const ghost = site.ghosts[0]
    const nodes: ReactNode[] = []
    if (ghost) {
      nodes.push(
        <g key="ghost" className="rp-diagram-card" opacity={0.4}>
          <rect x={x - 8} y={arrayY + 8} width={width} height={bodyH} rx={10} />
          <FittedText
            x={x + width / 2 - 8}
            y={arrayY + bodyH - 6}
            width={width - 16}
            text={ghost.label}
            className="rp-diagram-muted"
            fontSize={9.5}
          />
        </g>,
      )
    }
    nodes.push(
      <Hit key={site.array.id} id={site.array.id} selected={selected} onSelect={select}>
        <g className={x < 200 ? 'rp-diagram-rg-primary' : 'rp-diagram-rg-secondary'}>
          <rect x={x} y={arrayY} width={width} height={bodyH} rx={10} />
        </g>
        <FittedText
          x={x + width / 2}
          y={arrayY + 18}
          width={width - 16}
          text={site.array.title}
          className="rp-diagram-card-title"
          fontSize={11}
        />
        <FittedText
          x={x + width / 2}
          y={arrayY + 32}
          width={width - 16}
          text={site.array.sub}
          className="rp-diagram-muted"
          fontSize={9.5}
        />
      </Hit>,
    )
    if (!site.array.pools.length) {
      nodes.push(
        <text key="nopool" x={x + width / 2} y={arrayY + 52} textAnchor="middle" className="rp-diagram-muted">
          No pools yet — add a StorageClass
        </text>,
      )
    }
    site.array.pools.forEach((p, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const pw = site.array.pools.length === 1 ? inner : (inner - gap) / 2
      const px = x + pad + col * (pw + gap)
      const py = arrayY + 40 + row * (poolH + gap)
      nodes.push(
        <Hit key={p.id} id={p.id} selected={selected} onSelect={select}>
          <g className="rp-diagram-card">
            <rect x={px} y={py} width={pw} height={poolH} rx={8} />
            <FittedText
              x={px + pw / 2}
              y={py + 16}
              width={pw - 12}
              text={p.title}
              className="rp-diagram-card-title"
              fontSize={11}
            />
            <FittedText
              x={px + pw / 2}
              y={py + 30}
              width={pw - 12}
              text={p.sub}
              className="rp-diagram-muted"
              fontSize={9.5}
            />
            {p.extra ? (
              <FittedText
                x={px + pw / 2}
                y={py + 42}
                width={pw - 12}
                text={p.extra}
                className="rp-diagram-muted"
                fontSize={9.5}
              />
            ) : null}
          </g>
        </Hit>,
      )
    })
    if (site.array.morePools) {
      const my = arrayY + bodyH - 26
      nodes.push(
        <Hit key={site.array.morePools.id} id={site.array.morePools.id} selected={selected} onSelect={select}>
          <g className="rp-diagram-pill">
            <rect x={x + pad} y={my} width={inner} height={18} rx={9} />
            <FittedText
              x={x + width / 2}
              y={my + 13}
              width={inner - 8}
              text={site.array.morePools.label}
              className="rp-diagram-link-label"
              fontSize={8}
            />
          </g>
        </Hit>,
      )
    }
    return { nodes, height: bodyH }
  }

  const leftArr = renderArray(model.sites[0], leftX, colW)
  const rightArr = dual && model.sites[1] ? renderArray(model.sites[1], rightX, colW) : null
  const arrayH = Math.max(leftArr.height, rightArr?.height ?? 0)
  const svgH = arrayY + arrayH + 28

  return (
    <div className="review-topo">
      <svg
        className="rp-diagram"
        viewBox={`0 0 640 ${svgH}`}
        role="img"
        aria-label={`Your Hitachi CSI deployment: ${model.subtitle}. Click an object to open the YAML files that make it.`}
      >
        <rect x="0" y="0" width="640" height={svgH} rx="10" className="rp-diagram-bg" />
        <text x="320" y="20" textAnchor="middle" className="rp-diagram-title">
          Your Hitachi CSI deployment
        </text>
        <FittedText
          x={320}
          y={34}
          width={600}
          text={model.subtitle}
          className="rp-diagram-muted"
          fontSize={9.5}
        />

        <rect x={leftX} y={clusterY} width={colW} height={clusterH} rx="12" className="rp-diagram-cluster" />
        {left.nodes}
        {right ? (
          <>
            <rect x={rightX} y={clusterY} width={colW} height={clusterH} rx="12" className="rp-diagram-cluster" />
            {right.nodes}
            <line x1={leftX + colW} y1={clusterY + 88} x2={rightX} y2={clusterY + 88} className="rp-diagram-link" />
          </>
        ) : null}

        <line
          x1={leftX + colW / 2}
          y1={clusterY + clusterH}
          x2={leftX + colW / 2}
          y2={arrayY}
          className="rp-diagram-link-rest"
        />
        <text x={leftX + colW / 2 + 8} y={arrayY - 6} className="rp-diagram-link-label">
          REST
        </text>
        {right ? (
          <>
            <line
              x1={rightX + colW / 2}
              y1={clusterY + clusterH}
              x2={rightX + colW / 2}
              y2={arrayY}
              className="rp-diagram-link-rest"
            />
            <Hit id="journals" selected={selected} onSelect={select}>
              <rect x={leftX + colW - 8} y={arrayY + 20} width={rightX - leftX - colW + 16} height={28} rx={6} fill="transparent" />
              <line
                x1={leftX + colW}
                y1={arrayY + 36}
                x2={rightX}
                y2={arrayY + 36}
                className="rp-diagram-link"
              />
            </Hit>
          </>
        ) : (
          <text x={leftX + colW / 2 + 36} y={arrayY - 6} className="rp-diagram-link-label">
            {`data path · ${model.protocolLabel}`}
          </text>
        )}

        {leftArr.nodes}
        {rightArr?.nodes}

        <text x="320" y={svgH - 10} textAnchor="middle" className="rp-diagram-muted">
          Click any object to open its YAML
        </text>
      </svg>

      <dialog
        ref={dialogRef}
        className="yaml-dialog"
        aria-labelledby="yaml-dialog-title"
        onCancel={(e) => {
          e.preventDefault()
          close()
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) close()
        }}
        onClose={close}
      >
        <div className="yaml-dialog-body">
          <div className="yaml-dialog-head">
            <div>
              <h2 id="yaml-dialog-title">{hit?.title ?? 'Generated files'}</h2>
              {hit?.why ? <p className="yaml-dialog-why">{hit.why}</p> : null}
            </div>
            <button type="button" className="btn btn-secondary" onClick={close}>
              Close
            </button>
          </div>
          {hitFiles.length > 1 ? (
            <div className="tabs" role="tablist" aria-label="Generated files">
              {hitFiles.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  role="tab"
                  aria-selected={current?.path === f.path}
                  className={`tab${current?.path === f.path ? ' active' : ''}`}
                  onClick={() => setFilePath(f.path)}
                  title={f.path}
                >
                  {f.path.split('/').pop() || f.path}
                </button>
              ))}
            </div>
          ) : null}
          {current ? (
            <>
              <div className="yaml-dialog-meta">
                <code>{current.path}</code>
                {current.description ? <span> — {current.description}</span> : null}
                <DownloadButton
                  filename={current.path.split('/').pop() || 'file'}
                  content={current.content}
                  label="Download file"
                />
              </div>
              <CodeBlock className="yaml-preview" text={current.content}>
                {current.content}
              </CodeBlock>
            </>
          ) : (
            <p>No generated file for this object in the current package.</p>
          )}
        </div>
      </dialog>
    </div>
  )
}
