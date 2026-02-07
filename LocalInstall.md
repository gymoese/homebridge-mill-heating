# LocalInstall.md
## Local development & installation guide for `homebridge-mill-heating`

This document describes **the exact, reproducible steps** for developing, building, packaging and installing the plugin locally on a Homebridge Raspberry Pi **without publishing to npm**.

It is written to avoid all the pitfalls we just hit: global installs, NODE_PATH hacks, symlinks, and plugin discovery issues.

---

## Prerequisites

### Development machine (Windows / macOS / Linux)
- Node.js **v20 or newer**
- npm (comes with Node)
- Git
- Project builds cleanly with:
  ```bash
  npm run build
  ```

### Raspberry Pi / Homebridge
- Homebridge installed via **hb-service**
- Homebridge running with:
  - `--strict-plugin-resolution`
  - `-P /var/lib/homebridge/node_modules`
- SSH access to the Pi
- Node.js installed (same major version as dev machine preferred)

Verify on Pi:
```bash
node -v
npm -v
```

---

## Key rule (important)

> **Homebridge only loads plugins from**
>
> `/var/lib/homebridge/node_modules`
>
> when running with `--strict-plugin-resolution`.
>
> Global installs (`npm -g`) will NOT be picked up.

This guide installs the plugin **locally** in that folder.

---

## Step-by-step workflow

### 1. Bump version (local development)
Always bump version so you can see what is actually running.

From project root:
```bash
npm version patch --no-git-tag-version
```

Example:
```
0.2.0 → 0.2.1
```

---

### 2. Build the plugin
```bash
npm run build
```

Ensure:
- `dist/` is updated
- No TypeScript errors

---

### 3. Create installable package
```bash
npm pack
```

This creates a file like:
```
homebridge-mill-heating-0.2.1.tgz
```

---

### 4. Copy package to Raspberry Pi
From your dev machine:
```bash
scp homebridge-mill-heating-0.2.1.tgz pi@<PI-IP>:/tmp/
```

Verify on Pi:
```bash
ls /tmp | grep mill
```

---

### 5. Stop Homebridge
On the Pi:
```bash
sudo hb-service stop
```

---

### 6. Install plugin locally (the correct way)
```bash
cd /var/lib/homebridge
sudo -u homebridge npm install /tmp/homebridge-mill-heating-0.2.1.tgz
```

This installs to:
```
/var/lib/homebridge/node_modules/homebridge-mill-heating
```

---

### 7. Verify installation
```bash
ls /var/lib/homebridge/node_modules | grep mill
```

Optional deep check:
```bash
sudo -u homebridge node -p "require.resolve('homebridge-mill-heating')"
sudo -u homebridge node -p "require('homebridge-mill-heating/package.json').version"
```

---

### 8. Start Homebridge
```bash
sudo hb-service start
```

---

### 9. Verify plugin loaded
```bash
sudo tail -n 120 /var/lib/homebridge/homebridge.log | grep -i mill
```

Expected output:
```
Loaded plugin: homebridge-mill-heating@0.2.1
Registering platform 'homebridge-mill-heating.MillHeatingPlatform'
```

If you see:
```
No plugin was found for the platform "MillHeatingPlatform"
```
→ the plugin is **not installed in `/var/lib/homebridge/node_modules`**.

---

## Updating the plugin (next time)

Repeat only these steps:

```bash
npm version patch --no-git-tag-version
npm run build
npm pack
scp homebridge-mill-heating-<version>.tgz pi@<PI-IP>:/tmp/
sudo hb-service stop
cd /var/lib/homebridge
sudo -u homebridge npm install /tmp/homebridge-mill-heating-<version>.tgz
sudo hb-service start
```

---

## Common pitfalls & fixes

### ❌ Plugin installed globally
```bash
npm install -g homebridge-mill-heating
```
➡ Homebridge will NOT load it.

### ❌ NODE_PATH hacks
Not needed. Homebridge ignores them with `--strict-plugin-resolution`.

### ❌ File missing in /tmp
If npm says `ENOENT`:
```bash
ls /tmp
```
The `.tgz` file is simply not there (often lost after reboot).

---

## Clean uninstall (if needed)
```bash
sudo hb-service stop
cd /var/lib/homebridge
sudo -u homebridge npm remove homebridge-mill-heating
sudo hb-service start
```

---

## Recommendation
Keep this file in the repo root as:

```
LocalInstall.md
```

And keep README.md short by linking to it:

> For local development installs, see `LocalInstall.md`.

---

## Final note
This process is **deliberately boring and deterministic**.

If you follow it exactly, the plugin will load every time.
