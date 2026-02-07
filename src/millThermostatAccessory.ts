import { PlatformAccessory, Service, CharacteristicValue } from 'homebridge';
import type { MillHeatingPlatform } from './platform';
import { MillApiClient, ControlStatusDto } from './millApiClient';
import type { DeviceConfig, EffectiveAccessoryInfo } from './types';

export class MillThermostatAccessory {
  private readonly service: Service;

  private lastStatus?: ControlStatusDto;
  private lastFetchAt = 0;

  constructor(
    private readonly platform: MillHeatingPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: DeviceConfig,
    private readonly api: MillApiClient,
  ) {
    this.setupAccessoryInformation();

    this.service = this.accessory.getService(this.platform.Service.Thermostat)
      ?? this.accessory.addService(this.platform.Service.Thermostat);

    this.service.setCharacteristic(this.platform.Characteristic.Name, device.name);

    this.wireCharacteristics();
    this.startPolling();

    void this.ensureControlIndividually(true).catch(err => {
      this.platform.log.warn(`[${device.name}] ensure mode failed: ${err?.message ?? err}`);
    });
  }

  private setupAccessoryInformation(): void {
    const info = this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?? this.accessory.addService(this.platform.Service.AccessoryInformation);

    const effective = (this.accessory.context.effectiveInfo ?? {}) as EffectiveAccessoryInfo;

    info.setCharacteristic(this.platform.Characteristic.Manufacturer, effective.manufacturer ?? 'Mill');
    info.setCharacteristic(this.platform.Characteristic.Model, effective.model ?? 'Heater (Local API)');
    info.setCharacteristic(this.platform.Characteristic.FirmwareRevision, effective.firmwareRevision ?? 'unknown');

    if (effective.hardwareRevision) {
      info.setCharacteristic(this.platform.Characteristic.HardwareRevision, effective.hardwareRevision);
    }
    if (effective.serialNumber) {
      info.setCharacteristic(this.platform.Characteristic.SerialNumber, effective.serialNumber);
    }
  }

  private wireCharacteristics(): void {
    const C = this.platform.Characteristic;

    const unit = this.platform.temperatureUnit === 'fahrenheit'
      ? C.TemperatureDisplayUnits.FAHRENHEIT
      : C.TemperatureDisplayUnits.CELSIUS;

    this.service.getCharacteristic(C.TemperatureDisplayUnits)
      .onGet(async () => unit)
      .onSet(async (_value: CharacteristicValue) => {
        this.service.updateCharacteristic(C.TemperatureDisplayUnits, unit);
      });

    this.service.updateCharacteristic(C.TemperatureDisplayUnits, unit);

    this.service.getCharacteristic(C.CurrentTemperature)
      .onGet(async () => (await this.getFreshStatus()).ambient_temperature);

    this.service.getCharacteristic(C.TargetTemperature)
      .setProps({
        minValue: this.platform.temperatureMin,
        maxValue: this.platform.temperatureMax,
        minStep: this.platform.temperatureStep,
      })
      .onGet(async () => (await this.getFreshStatus()).set_temperature)
      .onSet(async (value: CharacteristicValue) => {
        const v = Number(value);
        const s = await this.getFreshStatus();

        if (s.operation_mode === 'Off' || s.switched_on === false) {
          await this.api.setOperationMode('Control individually');
        } else if (s.operation_mode !== 'Control individually') {
          await this.api.setOperationMode('Control individually');
        }

        await this.api.setNormalTemperature(v);
        await this.refreshAndPush();
      });

    this.service.getCharacteristic(C.TargetHeatingCoolingState)
      .setProps({
        validValues: [
          C.TargetHeatingCoolingState.OFF,
          C.TargetHeatingCoolingState.HEAT,
        ],
      })
      .onGet(async () => this.mapTargetState(await this.getFreshStatus()))
      .onSet(async (value: CharacteristicValue) => {
        const v = Number(value);

        if (v === C.TargetHeatingCoolingState.OFF) {
          await this.api.setOperationMode('Off');
        } else {
          await this.api.setOperationMode('Control individually');
        }

        await this.refreshAndPush();
      });

    this.service.getCharacteristic(C.CurrentHeatingCoolingState)
      .onGet(async () => this.mapCurrentState(await this.getFreshStatus()));
  }

  private startPolling(): void {
    const intervalMs = this.platform.pollSeconds * 1000;

    setInterval(() => {
      void this.refreshAndPush().catch(err => {
        this.platform.log.warn(`[${this.device.name}] poll error: ${err?.message ?? err}`);
      });
    }, intervalMs);
  }

  private async refreshAndPush(): Promise<void> {
    const s = await this.api.getControlStatus();
    this.lastStatus = s;
    this.lastFetchAt = Date.now();

    const C = this.platform.Characteristic;

    this.service.updateCharacteristic(C.CurrentTemperature, s.ambient_temperature);
    this.service.updateCharacteristic(C.TargetTemperature, s.set_temperature);
    this.service.updateCharacteristic(C.TargetHeatingCoolingState, this.mapTargetState(s));
    this.service.updateCharacteristic(C.CurrentHeatingCoolingState, this.mapCurrentState(s));
  }

  private async getFreshStatus(): Promise<ControlStatusDto> {
    const now = Date.now();
    if (this.lastStatus && (now - this.lastFetchAt) < this.platform.cacheTtlMs) {
      return this.lastStatus;
    }

    const s = await this.api.getControlStatus();
    this.lastStatus = s;
    this.lastFetchAt = now;
    return s;
  }

  private mapTargetState(s: ControlStatusDto): number {
    const C = this.platform.Characteristic.TargetHeatingCoolingState;
    const isOff = s.operation_mode === 'Off' || s.switched_on === false;
    return isOff ? C.OFF : C.HEAT;
  }

  private mapCurrentState(s: ControlStatusDto): number {
    const C = this.platform.Characteristic.CurrentHeatingCoolingState;
    const isOff = s.operation_mode === 'Off' || s.switched_on === false;
    if (isOff) return C.OFF;
    return (s.current_power > 0 || s.control_signal > 0) ? C.HEAT : C.OFF;
  }

  private async ensureControlIndividually(onlyIfNotOff: boolean): Promise<void> {
    const s = await this.getFreshStatus();
    if (onlyIfNotOff && s.operation_mode === 'Off') return;
    if (s.operation_mode !== 'Control individually') {
      await this.api.setOperationMode('Control individually');
      await this.refreshAndPush();
    }
  }
}
