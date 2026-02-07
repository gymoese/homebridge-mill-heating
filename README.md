# Homebridge Mill Heating

Homebridge plugin for controlling **Mill heaters** using the **local HTTPS REST API**.

Each heater is exposed as a native **HomeKit Thermostat**:
- Off / Heat
- Target temperature
- Current temperature
- Heating state

The plugin focuses on **local control only**:
- No cloud
- No Mill account
- No automatic device provisioning

---

## Important: API key setup (required)

Mill heaters using the local REST API require an **API key**.
Once set, the heater switches to **HTTPS-only** and requires authentication.

The plugin **does not** configure the heater automatically.
You must configure the API key **manually once**.

### Set API key on the heater

Run the following command from a device on the same local network:

    curl -X POST http://<heater-ip>/set-api-key \
      -H "Content-Type: application/json" \
      -d '{"api_key":"YOUR_SECRET_KEY"}'

After this:
- The heater **reboots**
- Only **HTTPS** is accepted
- All requests must include the header:

    Authentication: YOUR_SECRET_KEY

- The HTTPS certificate is **self-signed**
- The API key can only be changed by **factory reset**

---

## Supported devices

### Supported
- Mill heaters exposing the **local REST API (Gen 3 or newer)**
- Tested on **Mill Gen 4 panel heater** using API provided by Mill Support

Gen 4 devices are expected to work as long as the same endpoints are available:
- `/status`
- `/control-status`
- `/operation-mode`
- `/set-temperature`

### Not supported
- Mill Wi-Fi Socket (would require an Outlet/Switch accessory)

---

## Installation

### Homebridge UI
Search for **Mill Heating** and install.

### npm

    npm install -g homebridge-mill-heating

Restart Homebridge after installation.

---

## Configuration

Example configuration:

```json
{
  "platform": "MillHeatingPlatform",
  "name": "Mill Heating",

  "pollSeconds": 10,
  "cacheTtlMs": 2000,

  "temperatureUnit": "celsius",
  "temperatureMin": 5,
  "temperatureMax": 35,
  "temperatureStep": 0.5,

  "apiKey": "YOUR_SECRET_KEY",
  "allowInsecureHttps": true,

  "accessoryInfo": {
    "manufacturer": "Mill",
    "model": "Panel Heater (Local API)",
    "firmwareRevision": "unknown"
  },

  "devices": [
    {
      "name": "Sommerhus Radiator",
      "host": "192.168.1.105"
    }
  ]
}
```

---

## Configuration options

### Platform options

| Option | Description | Default |
|------|------------|---------|
| pollSeconds | Poll interval (seconds) | 10 |
| cacheTtlMs | Cache duration (ms) | 2000 |
| temperatureUnit | celsius / fahrenheit | celsius |
| temperatureMin | Minimum target temperature | 5 |
| temperatureMax | Maximum target temperature | 35 |
| temperatureStep | Temperature step size | 0.5 |
| apiKey | Heater API key | required |
| allowInsecureHttps | Accept self-signed HTTPS certificate | true |

### Device options

| Option | Description |
|------|------------|
| name | Name shown in HomeKit |
| host | IP address or resolvable hostname |

---

## Accessory information

You can customize what HomeKit shows under accessory details:

```json
"accessoryInfo": {
  "manufacturer": "Mill",
  "model": "Panel Heater Gen 4",
  "firmwareRevision": "0x220727",
  "serialNumber": ""
}
```

---

## HomeKit behavior

- **OFF**  
  Sets operation mode to `Off`

- **HEAT**  
  Sets operation mode to `Control individually`

- **Setting temperature while OFF**  
  Automatically switches to HEAT first

- **Heating state**  
  Derived from heater power / control signal

- **Temperature unit**  
  Exposed via HomeKit Thermostat service

---

## Networking notes

- If using IP address, configure a **DHCP reservation**
- Hostnames are supported if resolvable by the Homebridge host

---

## Security

- Local network only
- HTTPS + API key authentication
- Self-signed certificates supported
- Plugin never:
  - Sets API keys
  - Resets devices
  - Changes device configuration

---

## Troubleshooting

Verify heater connectivity:

    curl -k -H "Authentication: YOUR_SECRET_KEY" https://<heater-ip>/status
    curl -k -H "Authentication: YOUR_SECRET_KEY" https://<heater-ip>/control-status

If both return `status: ok`, the plugin should work.

---

## License

MIT

---

## Disclaimer

This plugin is not affiliated with or endorsed by Mill International AS.

