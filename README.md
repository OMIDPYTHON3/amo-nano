# amo-nano

AMO is a self-contained professional terminal code editor for Termux/Android
and Linux. It is packaged as a [Node.js Single Executable Application](https://nodejs.org/api/single-executable-applications.html)
(SEA): esbuild bundles `src/cli/index.js`, Node.js generates the SEA payload and
`postject` injects it into a target Node.js binary.

## Build locally

```bash
npm ci
npm test
npm run build      # produces ./amo
```

The build uses the Node.js binary that runs it as the SEA base. To produce a
binary for another architecture, set `AMO_NODE_BASE` to a Node.js binary of the
same Node.js version built for that target:

```bash
AMO_NODE_BASE=/path/to/node-linux-arm64/bin/node npm run build
AMO_TARGET_ARCH=arm64
```

SEA payloads are architecture-independent (snapshots and code cache are
disabled in `scripts/build.mjs`), so the host Node.js can generate the payload
that is injected into a cross-compiled target binary.

## CI targets

GitHub Actions builds two Linux targets in parallel:

| Target | Artifact | Base runtime |
| --- | --- | --- |
| `arm64` | `amo-nano-linux-arm64` | official Node.js `linux-arm64` |
| `amd64` | `amo-nano-linux-amd64` | official Node.js `linux-x64` |

When both jobs succeed, a GitHub Release is created with both binaries
attached.
