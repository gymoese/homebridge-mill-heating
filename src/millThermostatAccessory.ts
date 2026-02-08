import type {
  CharacteristicValue,
  PlatformAccessory,
  Service,
} from 'homebridge';

import type { MillHeatingPlatform } from './platform';
import type { MillHeaterAccessoryConfig } from './types';
import { MillApiClient } from './millApiClient';

export class MillThermostatAccessory {
  private readonly service: Service;
  private readonly infoService: Service;
  private readonly client: MillApiClient;

  private pollTimer?: NodeJS.Timeout;

  // Cached state
  private active = true;
  private currentTemp = 20;
  private targetTemp = 21;
  private heating = false;

  // Config defaults
  private readonly minTemp: number;
  private readonly maxTemp: number;
  private readonly step: number;
  private readonly pollIntervalSeconds: number;

  constructor(
    private readonly platform: MillHeatingPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly cfg: MillHeaterAccessoryConfig,
  ) {
    const { hap } = this.platform['api'];
    const Characteristic = hap.Characteristic;
    const Service = hap.Service;

    this.minTemp = cfg.minTemperature ?? 5;
    this.maxTemp = cfg.maxTemperature ?? 30;
    this.step = cfg.temperatureStep ?? 0.5;
    this.pollIntervalSeconds = cfg.pollIntervalSeconds ?? 10;

    this.client = new MillApiClient({
      host: cfg.host,
      protocol: cfg.protocol ?? 'http',
      apiKey: cfg.apiKey ?? '',
      allowInsecureHttps: cfg.allowInsecureHttps ?? true,
      timeoutMs: 5000,
    });

    // Thermostat service
    this.service =
      this.accessory.getService(Service.Thermostat) ??
      this.accessory.addService(Service.Thermostat);

    this.service.setCharacteristic(Characteristic.Name, cfg.name);

    // Accessory information
    this.infoService =
      this.accessory.getService(Service.AccessoryInformation) ??
      this.accessory.addService(Service.AccessoryInformation);

    this.infoService
      .setCharacteristic(Characteristic.Manufacturer, cfg.manufacturer ?? 'Mill')
      .setCharacteristic(Characteristic.Model, cfg.model ?? 'Gen 3/4 Heater')
      .setCharacteristic(Characteristic.FirmwareRevision, cfg.firmwareRevision ?? '')
      .setCharacteristic(Characteristic.SerialNumber, cfg.serialNumber ?? '');

    // Display unit
    const displayUnit =
      (cfg.temperatureUnit ?? 'C') === 'F'
        ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT
        : Characteristic.TemperatureDisplayUnits.CELSIUS;

    this.service.setCharacteristic(Characteristic.TemperatureDisplayUnits, displayUnit);

    // Props (min/max/step)
    this.service.getCharacteristic(Characteristic.TargetTemperature).setProps({
      minValue: this.minTemp,
      maxValue: this.maxTemp,
      minStep: this.step,
    });

    // TargetHeatingCoolingState: expose OFF + HEAT
    this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).setProps({
      validValues: [
        Characteristic.TargetHeatingCoolingState.OFF,
        Characteristic.TargetHeatingCoolingState.HEAT,
      ],
    });

    // Handlers
    this.service
      .getCharacteristic(Characteristic.Active)
      .onGet(this.handleGetActive.bind(this))
      .onSet(this.handleSetActive.bind(this));

    this.service
      .getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(this.handleGetCurrentTemperature.bind(this));

    this.service
      .getCharacteristic(Characteristic.TargetTemperature)
      .onGet(this.handleGetTargetTemperature.bind(this))
      .onSet(this.handleSetTargetTemperature.bind(this));

    this.service
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .onGet(this.handleGetTargetHeatingCoolingState.bind(this))
      .onSet(this.handleSetTargetHeatingCoolingState.bind(this));

    this.service
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .onGet(this.handleGetCurrentHeatingCoolingState.bind(this));

    // Start polling
    this.startPolling().catch(err => {
      this.platform['log'].error(`[${cfg.name}] Initial poll failed: ${this.errMsg(err)}`);
    });
  }

  private async startPolling(): Promise<void> {
    await this.pollOnce();

    if (this.pollTimer) clearInterval(this.pollTimer);

    this.pollTimer = setInterval(() => {
      this.pollOnce().catch(err => {
        this.platform['log'].warn(`[${this.cfg.name}] Poll failed: ${this.errMsg(err)}`);
      });
    }, this.pollIntervalSeconds * 1000);
  }

  private async pollOnce(): Promise<void> {
    const cs = await this.client.getControlStatus();

    this.currentTemp = cs.ambient_temperature;
    this.targetTemp = cs.set_temperature;

    // OFF => off, else on (ignore switched_on)
    this.active = cs.operation_mode !== 'OFF';

    // heating if active and current_power > 0
    this.heating = this.active && (cs.current_power ?? 0) > 0;

    this.updateCharacteristics();
  }

  private updateCharacteristics(): void {
    const { hap } = this.platform['api'];
    const Characteristic = hap.Characteristic;

    this.service.updateCharacteristic(
      Characteristic.Active,
      this.active ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE,
    );

    this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.currentTemp);
    this.service.updateCharacteristic(Characteristic.TargetTemperature, this.targetTemp);

    this.service.updateCharacteristic(
      Characteristic.CurrentHeatingCoolingState,
      this.heating
        ? Characteristic.CurrentHeatingCoolingState.HEAT
        : Characteristic.CurrentHeatingCoolingState.OFF,
    );

    this.service.updateCharacteristic(
      Characteristic.TargetHeatingCoolingState,
      this.active
        ? Characteristic.TargetHeatingCoolingState.HEAT
        : Characteristic.TargetHeatingCoolingState.OFF,
    );
  }

  // Characteristic handlers

  private handleGetActive(): CharacteristicValue {
    const { hap } = this.platform['api'];
    return this.active ? hap.Characteristic.Active.ACTIVE : hap.Characteristic.Active.INACTIVE;
  }

  private async handleSetActive(value: CharacteristicValue): Promise<void> {
    const { hap } = this.platform['api'];
    const Characteristic = hap.Characteristic;

    const wantActive = value === Characteristic.Active.ACTIVE;

    if (!wantActive) {
      // OFF means real OFF on device
      await this.client.setOperationMode('OFF');
      this.active = false;
      this.heating = false;
      this.updateCharacteristics();
      return;
    }

    // Turn on: Control individually + keep current target
    await this.client.setOperationMode('Control individually');
    await this.client.setNormalTemperature(this.clampTemp(this.targetTemp));
    this.active = true;
    this.updateCharacteristics();
  }

  private handleGetCurrentTemperature(): CharacteristicValue {
    return this.currentTemp;
  }

  private handleGetTargetTemperature(): CharacteristicValue {
    return this.targetTemp;
  }

  private async handleSetTargetTemperature(value: CharacteristicValue): Promise<void> {
    const temp = this.clampTemp(Number(value));
    this.targetTemp = temp;

    // In HomeKit, changing target temp typically implies "on"
    if (!this.active) {
      await this.client.setOperationMode('Control individually');
      this.active = true;
    }

    await this.client.setNormalTemperature(temp);
    this.updateCharacteristics();
  }

  private handleGetTargetHeatingCoolingState(): CharacteristicValue {
    const { hap } = this.platform['api'];
    return this.active
      ? hap.Characteristic.TargetHeatingCoolingState.HEAT
      : hap.Characteristic.TargetHeatingCoolingState.OFF;
  }

  private async handleSetTargetHeatingCoolingState(value: CharacteristicValue): Promise<void> {
    const { hap } = this.platform['api'];
    const Characteristic = hap.Characteristic;

    const v = Number(value);
    if (v === Characteristic.TargetHeatingCoolingState.OFF) {
      await this.handleSetActive(Characteristic.Active.INACTIVE);
      return;
    }

    // HEAT selected
    await this.handleSetActive(Characteristic.Active.ACTIVE);
  }

  private handleGetCurrentHeatingCoolingState(): CharacteristicValue {
    const { hap } = this.platform['api'];
    return this.heating
      ? hap.Characteristic.CurrentHeatingCoolingState.HEAT
      : hap.Characteristic.CurrentHeatingCoolingState.OFF;
  }

  // Helpers

  private clampTemp(t: number): number {
    const clamped = Math.min(this.maxTemp, Math.max(this.minTemp, t));
    // Snap to step
    const snapped = Math.round(clamped / this.step) * this.step;
    // avoid floating precision e.g. 21.0000000002
    return Math.round(snapped * 10) / 10;
  }

  private errMsg(err: unknown): string {
    if (err instanceof Error) return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
}
