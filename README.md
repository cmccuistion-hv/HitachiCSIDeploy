# Hitachi CSI Deployment Wizard

Interactive wizard that walks you through deploying the **Hitachi CSI** stack and generates ready-to-apply manifests.

**Goal:** first persistent volume in about **10 minutes**.

## Components (plain-language names)

| Wizard name | Role | Legacy acronym |
|-------------|------|----------------|
| CSI Driver | Core volume provisioning | HSPC |
| Replication | UR / TrueCopy across clusters | HRPC |
| Disaster Recovery | Policy-based DR operator | HRPC DR |
| Performance Metrics | Prometheus exporter / Grafana | HSPP |
| OpenShift Console Plugin | OpenShift UI dashboard | — |

## Features

- Platform-aware flow (OpenShift, ROSA, Kubernetes, RKE2, EKS)
- OpenShift OperatorHub steps for the CSI Driver
- Dynamic prerequisites (multipath, iSCSI, NVMe, firewall, licenses)
- StorageClass builder with documented constraints (stretched/GAD, SDS Block, efficiency rules)
- Auto-detects latest component versions from [csi-operator-hitachi](https://github.com/hitachi-vantara/csi-operator-hitachi)
- Live YAML preview, ZIP export, `install.sh`, config save/resume
- Hitachi Vantara NEXT color theme (`#2064B4` primary)

## Local development

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

You do not need to run production builds while developing if a Vite dev server is already running.

## GitHub Pages

1. Push this repository to GitHub.
2. Enable **Settings → Pages → Build and deployment → GitHub Actions**.
3. The workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and publishes on pushes to `main`.
4. Site uses relative `base: './'` so it works as a project Pages site.

## Docs used for the option catalog

Official guides (also under `docs/`):

- [CSI Driver guide](https://docs.hitachivantara.com/r/en-us/mk-92adptr142/latest) (MK-92ADPTR142)
- [Replication guide](https://docs.hitachivantara.com/r/en-us/mk-92adptr155/latest) (MK-92ADPTR155)
- [Performance Metrics guide](https://docs.hitachivantara.com/r/en-us/mk-92adptr156/latest) (MK-92ADPTR156)

See [catalog-notes.md](catalog-notes.md) for constraint mapping.

## Stack

- React + TypeScript + Vite
- Theme colors aligned with Hitachi Vantara NEXT (`#2064B4` primary from `@hitachivantara/uikit-styles`)
- `jszip` for bundle download

## License

Manifests and product names are Hitachi Vantara’s. This wizard is a helper UI around the public operator samples.
