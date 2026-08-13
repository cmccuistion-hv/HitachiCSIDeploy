/**
 * Theme-aware alternative clone mode: VMs from templates / cloned PVCs, then unlock.
 * MK-92ADPTR142 Secret settings / clone expand / delete notes.
 * Not a KubeVirt/CDI workaround — array clone rules on 20 Series / B85.
 */

function Volume({
  cx,
  cy,
  label,
}: {
  cx: number
  cy: number
  label: string
}) {
  return (
    <g className="rp-diagram-volume">
      <ellipse cx={cx} cy={cy} rx="40" ry="8" className="rp-diagram-volume-cap" />
      <rect x={cx - 40} y={cy} width="80" height="36" className="rp-diagram-volume-body" />
      <ellipse cx={cx} cy={cy + 36} rx="40" ry="8" className="rp-diagram-volume-cap" />
      <text x={cx} y={cy + 22} textAnchor="middle" className="rp-diagram-body">
        {label}
      </text>
    </g>
  )
}

function MiniVolume({
  cx,
  cy,
  label,
  grow,
  fade,
  fadeLate,
}: {
  cx: number
  cy: number
  label: string
  grow?: boolean
  fade?: boolean
  fadeLate?: boolean
}) {
  const body = (
    <>
      <ellipse cx={cx} cy={cy} rx="28" ry="6" className="rp-diagram-volume-cap" />
      <rect x={cx - 28} y={cy} width="56" height="26" className="rp-diagram-volume-body" />
      <ellipse cx={cx} cy={cy + 26} rx="28" ry="6" className="rp-diagram-volume-cap" />
    </>
  )
  const fadeClass = fade ? ' acm-delete-clone' : fadeLate ? ' acm-delete-parent' : ''
  return (
    <g className={`rp-diagram-volume${fadeClass}`}>
      {grow ? <g className="acm-grow">{body}</g> : body}
      <text x={cx} y={cy + 16} textAnchor="middle" className="rp-diagram-body">
        {label}
      </text>
    </g>
  )
}

export function AlternativeCloneModeDiagram() {
  return (
    <svg
      className="rp-diagram acm-diagram"
      viewBox="0 0 640 528"
      role="img"
      aria-label="Create virtual machines from a template, or clone a volume. On 20 Series and B85 those clones cannot grow past the original and the original cannot be deleted while clones exist. That is an array rule, not an OpenShift Virtualization limit. Alternative clone mode makes CSI keep a hidden original for every new volume so clones can grow, and CSI deletes the hidden parent — you do not have to delete clones first. Cost: about twice the pool space."
    >
      <defs>
        <marker
          id="acm-data-arr"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 10 5 L 0 10 Z" className="rp-diagram-marker-data" />
        </marker>
      </defs>

      <rect x="0" y="0" width="640" height="528" rx="10" className="rp-diagram-bg" />

      <text x="320" y="20" textAnchor="middle" className="rp-diagram-title">
        Alternative clone mode
      </text>
      <text x="320" y="36" textAnchor="middle" className="rp-diagram-muted">
        Create VMs from a template (or clone a volume) and still grow those disks.
      </text>


      <rect x="12" y="60" width="616" height="72" rx="12" className="rp-diagram-cluster" />
      <text x="320" y="78" textAnchor="middle" className="rp-diagram-site">
        Typical use
      </text>

      <g className="rp-diagram-chip-ctrl">
        <rect x="100" y="88" width="140" height="32" rx="8" />
        <text x="170" y="108" textAnchor="middle" className="rp-diagram-chip-title">
          Template disk
        </text>
      </g>
      <line
        x1="240"
        y1="104"
        x2="292"
        y2="104"
        className="rp-diagram-link-data"
      />
      <g className="rp-diagram-pill">
        <rect x="292" y="95" width="56" height="18" rx="9" />
        <text x="320" y="108" textAnchor="middle" className="rp-diagram-link-label">
          clone
        </text>
      </g>
      <line
        x1="348"
        y1="104"
        x2="400"
        y2="104"
        className="rp-diagram-link-data"
        markerEnd="url(#acm-data-arr)"
      />
      <g className="rp-diagram-chip-node">
        <rect x="400" y="88" width="140" height="32" rx="8" />
        <text x="470" y="108" textAnchor="middle" className="rp-diagram-chip-title">
          New VM disk
        </text>
      </g>
      <g className="acm-without rp-diagram-card">
        <rect x="12" y="144" width="302" height="88" rx="10" />
        <text x="163" y="164" textAnchor="middle" className="rp-diagram-card-title">
          Without this
        </text>
        <text x="163" y="186" textAnchor="middle" className="rp-diagram-body">
          Clone cannot grow past the template
        </text>
        <text x="163" y="204" textAnchor="middle" className="rp-diagram-body">
          Cannot delete original while clones exist
        </text>
        <text x="163" y="222" textAnchor="middle" className="rp-diagram-muted">
          Clones stay tied to the original
        </text>
      </g>

      <g className="acm-with rp-diagram-card">
        <rect x="326" y="144" width="302" height="88" rx="10" />
        <text x="477" y="164" textAnchor="middle" className="rp-diagram-card-title">
          What this gets you
        </text>
        <text x="477" y="186" textAnchor="middle" className="rp-diagram-body">
          Grow a VM disk past the template
        </text>
        <text x="477" y="204" textAnchor="middle" className="rp-diagram-body">
          CSI deletes the hidden parent
        </text>
        <text x="477" y="222" textAnchor="middle" className="rp-diagram-muted">
          CSI keeps a hidden original per volume
        </text>
      </g>

      <g className="rp-diagram-card">
        <rect x="12" y="244" width="616" height="130" rx="10" />
        <text x="320" y="262" textAnchor="middle" className="rp-diagram-card-title">
          How CSI does it (with this on)
        </text>
        <text x="320" y="276" textAnchor="middle" className="rp-diagram-muted">
          Every new volume from this Secret gets two disks. Cost: about twice the pool space.
        </text>

        <g className="rp-diagram-rg-primary">
          <rect x="28" y="286" width="268" height="76" rx="8" />
          <text x="162" y="302" textAnchor="middle" className="rp-diagram-card-title">
            Disk the VM uses
          </text>
          <Volume cx={162} cy={312} label="VM disk" />
        </g>

        <g className="rp-diagram-pill">
          <rect x="300" y="318" width="40" height="18" rx="9" />
          <text x="320" y="331" textAnchor="middle" className="rp-diagram-link-label">
            clone
          </text>
        </g>
        <line x1="296" y1="327" x2="304" y2="327" className="rp-diagram-link rp-diagram-link-dashed" />
        <line x1="336" y1="327" x2="344" y2="327" className="rp-diagram-link rp-diagram-link-dashed" />
        <circle className="acm-packet" r="3.2">
          <animateMotion dur="2.4s" repeatCount="indefinite" path="M 296 327 H 344" />
        </circle>

        <g className="rp-diagram-rg-secondary">
          <rect x="344" y="286" width="268" height="76" rx="8" />
          <text x="478" y="302" textAnchor="middle" className="rp-diagram-card-title">
            Hidden original
          </text>
          <Volume cx={478} cy={312} label="Source" />
        </g>
      </g>

      <text x="320" y="392" textAnchor="middle" className="rp-diagram-title">
        Later
      </text>

      <g className="acm-later-expand rp-diagram-card">
        <rect x="12" y="402" width="302" height="114" rx="10" />
        <text x="163" y="420" textAnchor="middle" className="rp-diagram-card-title">
          Grow the VM disk
        </text>
        <text x="163" y="434" textAnchor="middle" className="rp-diagram-muted">
          CSI grows the hidden original too
        </text>
        <MiniVolume cx={78} cy={448} label="VM disk" grow />
        <g className="rp-diagram-pill">
          <rect x="118" y="460" width="90" height="16" rx="8" />
          <text x="163" y="472" textAnchor="middle" className="rp-diagram-link-label">
            expand both
          </text>
        </g>
        <line x1="108" y1="468" x2="118" y2="468" className="rp-diagram-link-data" />
        <line x1="208" y1="468" x2="218" y2="468" className="rp-diagram-link-data" />
        <circle className="acm-packet acm-packet-expand" r="3">
          <animateMotion dur="1.8s" repeatCount="indefinite" path="M 108 468 H 218" />
        </circle>
        <MiniVolume cx={248} cy={448} label="Source" grow />
      </g>

      <g className="acm-later-recreate rp-diagram-card">
        <rect x="326" y="402" width="302" height="114" rx="10" />
        <text x="477" y="420" textAnchor="middle" className="rp-diagram-card-title">
          CSI deletes the hidden parent
        </text>
        <text x="477" y="434" textAnchor="middle" className="rp-diagram-muted">
          You do not have to delete clones first
        </text>
        <MiniVolume cx={392} cy={448} label="VM disk" fade />
        <g className="rp-diagram-pill">
          <rect x="424" y="460" width="106" height="16" rx="8" />
          <text x="477" y="472" textAnchor="middle" className="rp-diagram-link-label">
            CSI deletes parent
          </text>
        </g>
        <line x1="422" y1="468" x2="424" y2="468" className="rp-diagram-link-rest" />
        <line x1="530" y1="468" x2="532" y2="468" className="rp-diagram-link-rest" />
        <MiniVolume cx={562} cy={448} label="Source" fadeLate />
      </g>
    </svg>
  )
}
