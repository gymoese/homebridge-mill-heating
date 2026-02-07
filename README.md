# homebridge-mill-heating

Local Homebridge plugin for **Mill (Gen 3+) heaters** using the **Millheat local WiFi Control REST API**.

This plugin exposes a heater as a **HomeKit Thermostat** and lets HomeKit control the setpoint. The heater is kept in *individual control* (no weekly program).

> ✅ Recommended: **HTTP (no API key)** for Gen 4 based on current findings (see Gen 4 note below).

---

## Features

- Thermostat service (Current Temperature, Target Temperature, Heating state)
- Supports **multiple heaters** (each heater is its own accessory)
- Configurable per heater:
  - Host (IP or hostname)
  - Protocol: `http`, `https`, or `auto`
  - Optional API key (adds `Authentication` header)
  - Poll interval
  - Min/Max temperature and step
  - Temperature unit (C/F)
  - Manufacturer / Model / Firmware / Serial shown in Home app

---

## Gen 4 note (IMPORTANT)

On at least one **Mill Gen 4** heater / firmware, calling `POST /set-api-key` caused the device to become **cloud-only**:
- The heater stayed online in the Mill app
- **Local REST ports were closed** (no HTTP/HTTPS access on LAN)

Because of this, **this plugin does NOT set an API key on the device** and the default is to run **without API key over HTTP** on a trusted LAN.

If your device already has local HTTPS + API key working (commonly Gen 3), you can enable `https`/`auto` + `apiKey` in config.

---

## Requirements

- Homebridge **v1.7+**
- Node.js **v20+** recommended (matches current Homebridge guidance)

---

## Installation

### Option A: Install from npm (once published)
```bash
sudo npm i -g homebridge-mill-heating
```

### Option B: Install from a local `.tgz` (recommended for development)

On your dev machine (plugin folder):
```bash
npm ci
npm run build
npm pack
```

Copy the generated `homebridge-mill-heating-x.y.z.tgz` to your Homebridge host (Pi), e.g. to `/tmp/`.

If you run Homebridge via **hb-service** (Homebridge UI):
```bash
sudo hb-service stop
cd /var/lib/homebridge
sudo -u homebridge npm i /tmp/homebridge-mill-heating-x.y.z.tgz
sudo hb-service start
```

---

## Configuration

This plugin is a **platform** plugin. Add it to `config.json`.

### Minimal (recommended for Gen 4): HTTP without API key

```json
{
  "platform": "MillHeating",
  "accessories": [
    {
      "name": "Sommerhus Radiator",
      "host": "192.168.1.194",
      "protocol": "http"
    }
  ]
}
```

### HTTPS with API key (only if local REST remains reachable)

```json
{
  "platform": "MillHeating",
  "accessories": [
    {
      "name": "Mill Heater (Gen3)",
      "host": "192.168.1.105",
      "protocol": "https",
      "apiKey": "your-api-key",
      "allowInsecureHttps": true
    }
  ]
}
```

### Protocol selection rules

- `protocol: "http"` → always uses HTTP
- `protocol: "https"` → always uses HTTPS
- `protocol: "auto"` → uses HTTPS if `apiKey` is set, otherwise HTTP

### Full example (all per-heater options)

```json
{
  "platform": "MillHeating",
  "accessories": [
    {
      "name": "Living Room Heater",
      "host": "mill-heater.local",
      "protocol": "http",

      "pollIntervalSeconds": 10,

      "minTemperature": 5,
      "maxTemperature": 30,
      "temperatureStep": 0.5,
      "temperatureUnit": "C",

      "manufacturer": "Mill",
      "model": "Gen 4 Panel Heater",
      "firmwareRevision": "0x251105",
      "serialNumber": "A0:85:E3:CD:0E:30"
    }
  ]
}
```

---

## API key and HTTPS

### Setting an API key (manual)

**Warning (Gen 4):** setting an API key may disable local REST on some firmwares. Proceed at your own risk.

If you still want to set it (commonly Gen 3):
- Call `POST /set-api-key` over HTTP **once**
- Device reboots and switches to HTTPS with a self-signed certificate
- Subsequent requests must use HTTPS + header `Authentication: <apiKey>`

Example (Windows PowerShell, using real curl):

```powershell
curl.exe -X POST "http://192.168.1.105/set-api-key" -H "Content-Type: application/json" --data "{\"api_key\":\"your-api-key\"}"
```

Verify HTTPS after reboot:

```powershell
curl.exe -k "https://192.168.1.105/status" -H "Authentication: your-api-key"
```

---

## Troubleshooting

### PowerShell `curl` vs `curl.exe`
In Windows PowerShell, `curl` is often an alias for `Invoke-WebRequest`. Use **`curl.exe`** to run real curl.

### Heater reachable in app but not on LAN
This usually means the heater is running **cloud-only** mode and the local REST API is disabled. Ensure the device is configured for a mode that enables local API (see Mill documentation `sta_cloud_and_local_api`).

### Self-signed certificate errors
Use:
- `allowInsecureHttps: true` in config, and/or
- `curl.exe -k ...` for manual testing

### Homebridge logs
For hb-service installs:
```bash
sudo tail -n 200 /var/lib/homebridge/homebridge.log
```

---

## Development

```bash
npm ci
npm run build
npm test
```

### Packaging sanity check
Before running `npm pack`, ensure `dist/` exists and is included in the package:
```bash
npm run build
npm pack --dry-run
```

---

## License

MIT

---

## Disclaimer

This project is not affiliated with Mill. Use at your own risk.
