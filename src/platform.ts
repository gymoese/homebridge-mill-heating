import type {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import type { MillHeatingPlatformConfig, MillHeaterAccessoryConfig } from './types';
import { MillThermostatAccessory } from './millThermostatAccessory';

export class MillHeatingPlatform implements DynamicPlatformPlugin {
  private readonly accessories: PlatformAccessory[] = [];

  constructor(
    private readonly log: Logger,
    private readonly config: PlatformConfig,
    private readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      this.log.debug('didFinishLaunching');

      const cfg = this.config as MillHeatingPlatformConfig;
      const devices = cfg.accessories ?? [];

      // Create/update configured accessories
      for (const device of devices) {
        this.upsertAccessory(device);
      }

      // Remove accessories no longer in config
      const wantedIds = new Set(devices.map(d => this.uuidFor(d)));
      const toRemove = this.accessories.filter(a => !wantedIds.has(a.UUID));
      if (toRemove.length > 0) {
        this.log.info(`Removing ${toRemove.length} accessory(ies) not present in config...`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toRemove);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  private upsertAccessory(device: MillHeaterAccessoryConfig): void {
    const uuid = this.uuidFor(device);
    const existing = this.accessories.find(a => a.UUID === uuid);

    if (existing) {
      this.log.info('Restoring existing accessory from cache:', existing.displayName);
      existing.context.device = device;
      new MillThermostatAccessory(this, existing, device);
      return;
    }

    this.log.info('Adding new accessory:', device.name);
    const accessory = new this.api.platformAccessory(device.name, uuid);
    accessory.context.device = device;

    new MillThermostatAccessory(this, accessory, device);

    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    this.accessories.push(accessory);
  }

  private uuidFor(device: MillHeaterAccessoryConfig): string {
    // Stable ID per heater based on host + name
    return this.api.hap.uuid.generate(`mill-heater:${device.host}:${device.name}`);
  }
}
