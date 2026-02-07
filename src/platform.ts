import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLUGIN_NAME, PLATFORM_NAME } from './settings';
import { MillThermostatAccessory } from './millThermostatAccessory';
import { MillApiClient } from './millApiClient';
import type { DeviceConfig, PlatformConfigTyped, EffectiveAccessoryInfo } from './types';

export class MillHeatingPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly pollSeconds: number;
  public readonly cacheTtlMs: number;

  public readonly temperatureUnit: 'celsius' | 'fahrenheit';
  public readonly temperatureMin: number;
  public readonly temperatureMax: number;
  public readonly temperatureStep: number;

  public readonly accessoryInfoDefaults: EffectiveAccessoryInfo;

  private readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    const cfg = this.config as unknown as PlatformConfigTyped;

    this.pollSeconds = Number(cfg.pollSeconds ?? 10);
    this.cacheTtlMs = Number(cfg.cacheTtlMs ?? 2000);

    this.temperatureUnit = (cfg.temperatureUnit ?? 'celsius') as any;
    this.temperatureMin = Number(cfg.temperatureMin ?? 5);
    this.temperatureMax = Number(cfg.temperatureMax ?? 35);
    this.temperatureStep = Number(cfg.temperatureStep ?? 0.5);

    const info = cfg.accessoryInfo ?? {};
    this.accessoryInfoDefaults = {
      manufacturer: info.manufacturer ?? 'Mill',
      model: info.model ?? 'Heater (Local API)',
      firmwareRevision: info.firmwareRevision ?? 'unknown',
      hardwareRevision: info.hardwareRevision ?? '',
      serialNumber: info.serialNumber ?? '',
    };

    this.api.on('didFinishLaunching', () => {
      void this.init().catch(err => this.log.error(`Init failed: ${err?.message ?? err}`));
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  private async init(): Promise<void> {
    const cfg = this.config as unknown as PlatformConfigTyped;

    const devices = (cfg.devices ?? []) as DeviceConfig[];
    if (!devices.length) {
      this.log.warn('No devices configured.');
      return;
    }

    const apiKey = (cfg.apiKey ?? '').trim();
    const allowInsecureHttps = Boolean(cfg.allowInsecureHttps ?? true);

    for (const device of devices) {
      await this.setupDevice(device, { apiKey, allowInsecureHttps });
    }
  }

  private async setupDevice(
    device: DeviceConfig,
    opts: { apiKey: string; allowInsecureHttps: boolean },
  ): Promise<void> {
    const label = `[${device.name}]`;

    const uuid = this.api.hap.uuid.generate(`mill:${device.host}:${device.name}`);
    const existing = this.accessories.find(a => a.UUID === uuid);

    const accessory = existing ?? new this.api.platformAccessory(device.name, uuid);
    accessory.context.device = device;

    const effectiveInfo: EffectiveAccessoryInfo = {
      manufacturer: device.info?.manufacturer ?? this.accessoryInfoDefaults.manufacturer,
      model: device.info?.model ?? this.accessoryInfoDefaults.model,
      firmwareRevision: device.info?.firmwareRevision ?? this.accessoryInfoDefaults.firmwareRevision,
      hardwareRevision: device.info?.hardwareRevision ?? this.accessoryInfoDefaults.hardwareRevision,
      serialNumber: device.info?.serialNumber ?? this.accessoryInfoDefaults.serialNumber,
    };

    accessory.context.effectiveInfo = effectiveInfo;

    if (!existing) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.log.info(`${label} Registered accessory (${device.host})`);
    } else {
      this.log.info(`${label} Restored accessory (${device.host})`);
    }

    if (!opts.apiKey) {
      this.log.warn(`${label} apiKey is empty. HTTPS/auth will likely fail (heater uses HTTPS+key after set-api-key).`);
    }

    const client = new MillApiClient({
      host: device.host,
      apiKey: opts.apiKey,
      allowInsecureHttps: opts.allowInsecureHttps,
      timeoutMs: 5000,
    });

    // Optional: read /status once and fill missing info nicely (read-only)
    try {
      const s = await client.getStatus();
      if (s?.status === 'ok') {
        const infoService = accessory.getService(this.Service.AccessoryInformation)
          ?? accessory.addService(this.Service.AccessoryInformation);

        if (!effectiveInfo.model && s.name) {
          infoService.setCharacteristic(this.Characteristic.Model, s.name);
        }
        if ((effectiveInfo.firmwareRevision === 'unknown' || !effectiveInfo.firmwareRevision) && s.version) {
          infoService.setCharacteristic(this.Characteristic.FirmwareRevision, s.version);
        }
        if (!effectiveInfo.serialNumber && s.mac_address) {
          infoService.setCharacteristic(this.Characteristic.SerialNumber, s.mac_address);
        }
      }
    } catch {
      // ignore - still can work later
    }

    new MillThermostatAccessory(this, accessory, device, client);
  }
}
