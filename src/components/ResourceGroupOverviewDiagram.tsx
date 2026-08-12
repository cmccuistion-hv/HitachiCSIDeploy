/**
 * Theme-aware CSI Driver resource-group overview (one array, multiple clusters).
 * Based on the Hitachi resource-partitioning multi-cluster example.
 */

function ClusterCard({
  x,
  label,
  rgLabel,
  tone,
}: {
  x: number
  label: string
  rgLabel: string
  tone: 'primary' | 'secondary'
}) {
  const cx = x + 73
  return (
    <g className="rp-diagram-card">
      <rect x={x} y="48" width="146" height="108" rx="10" />
      <text x={cx} y="66" textAnchor="middle" className="rp-diagram-card-title">
        Cluster
      </text>
      <text x={cx} y="80" textAnchor="middle" className="rp-diagram-muted">
        {label}
      </text>
      <g className={tone === 'primary' ? 'rp-diagram-rg-primary' : 'rp-diagram-rg-secondary'}>
        <rect x={x + 10} y="88" width="126" height="38" rx="6" />
        <text x={cx} y="104" textAnchor="middle" className="rp-diagram-body">
          Secret / StorageClass
        </text>
        <text x={cx} y="118" textAnchor="middle" className="rp-diagram-muted">
          {rgLabel}
        </text>
      </g>
      <text x={cx} y="144" textAnchor="middle" className="rp-diagram-muted">
        CSI Driver
      </text>
    </g>
  )
}

export function ResourceGroupOverviewDiagram({ resourceGroupID }: { resourceGroupID?: string }) {
  const thisRg = (resourceGroupID || '').trim()
  const leftRg = thisRg ? `Resource group ${thisRg}` : 'Resource group A'
  const rightRg = 'Resource group B'

  return (
    <svg
      className="rp-diagram"
      viewBox="0 0 640 372"
      role="img"
      aria-label="Resource partitioning: multiple clusters share one array. Each cluster’s Secret selects one resource group so LDEV IDs, host groups, and pools stay isolated."
    >
      <rect x="0" y="0" width="640" height="372" rx="10" className="rp-diagram-bg" />

      <text x="320" y="20" textAnchor="middle" className="rp-diagram-title">
        Resource partitioning — one array, several clusters
      </text>
      <text x="320" y="36" textAnchor="middle" className="rp-diagram-muted">
        Each cluster maps to exactly one resource group
      </text>

      <ClusterCard x={12} label="production #1" rgLabel={leftRg} tone="primary" />
      <ClusterCard x={166} label="production #2" rgLabel={leftRg} tone="primary" />
      <ClusterCard x={328} label="test #1" rgLabel={rightRg} tone="secondary" />
      <ClusterCard x={482} label="test #2" rgLabel={rightRg} tone="secondary" />

      <line x1="320" y1="48" x2="320" y2="168" className="rp-diagram-link rp-diagram-link-dashed" />
      <text x="320" y="46" textAnchor="middle" className="rp-diagram-link-label">
        boundary
      </text>

      <g className="rp-diagram-card">
        <rect x="135" y="172" width="100" height="28" rx="6" />
        <text x="185" y="190" textAnchor="middle" className="rp-diagram-body">
          Shared port
        </text>
      </g>
      <g className="rp-diagram-card">
        <rect x="405" y="172" width="100" height="28" rx="6" />
        <text x="455" y="190" textAnchor="middle" className="rp-diagram-body">
          Shared port
        </text>
      </g>

      <line x1="85" y1="156" x2="185" y2="172" className="rp-diagram-link rp-diagram-link-dashed" />
      <line x1="239" y1="156" x2="185" y2="172" className="rp-diagram-link rp-diagram-link-dashed" />
      <line x1="401" y1="156" x2="455" y2="172" className="rp-diagram-link rp-diagram-link-dashed" />
      <line x1="555" y1="156" x2="455" y2="172" className="rp-diagram-link rp-diagram-link-dashed" />
      <line x1="185" y1="200" x2="185" y2="228" className="rp-diagram-link" />
      <line x1="455" y1="200" x2="455" y2="228" className="rp-diagram-link" />

      <g className="rp-diagram-card">
        <rect x="12" y="220" width="616" height="136" rx="10" />
        <text x="28" y="240" className="rp-diagram-card-title">
          Storage
        </text>
        <line x1="320" y1="228" x2="320" y2="348" className="rp-diagram-link rp-diagram-link-dashed" />

        <g className="rp-diagram-rg-primary">
          <rect x="24" y="250" width="280" height="92" rx="8" />
          <text x="164" y="272" textAnchor="middle" className="rp-diagram-card-title">
            {leftRg}
          </text>
          <text x="164" y="292" textAnchor="middle" className="rp-diagram-muted">
            LDEV ID
          </text>
          <text x="164" y="308" textAnchor="middle" className="rp-diagram-muted">
            Host group ID
          </text>
          <text x="164" y="324" textAnchor="middle" className="rp-diagram-muted">
            Pool
          </text>
        </g>
        <g className="rp-diagram-rg-secondary">
          <rect x="336" y="250" width="280" height="92" rx="8" />
          <text x="476" y="272" textAnchor="middle" className="rp-diagram-card-title">
            {rightRg}
          </text>
          <text x="476" y="292" textAnchor="middle" className="rp-diagram-muted">
            LDEV ID
          </text>
          <text x="476" y="308" textAnchor="middle" className="rp-diagram-muted">
            Host group ID
          </text>
          <text x="476" y="324" textAnchor="middle" className="rp-diagram-muted">
            Pool
          </text>
        </g>
      </g>
    </svg>
  )
}
