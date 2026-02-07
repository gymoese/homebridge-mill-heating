export type TemperatureUnit = 'celsius' | 'fahrenheit';

export interface AccessoryInfoConfig {
  manufacturer?: string;
  model?: string;
  firmwareRevision?: string;
  hardwareRevision?: string;
  serialNumber?: string;
}

export interface DeviceConfig {
  name: string;
  host: string;
  info?: AccessoryInfoConfig;
}

export interface PlatformConfigTyped {
  name?: string;

  pollSeconds?: number;
  cacheTtlMs?: number;

  temperatureUnit?: TemperatureUnit;
  temperatureMin?: number;
  temperatureMax?: number;
  temperatureStep?: number;

  apiKey?: string;
  allowInsecureHttps?: boolean;

  accessoryInfo?: AccessoryInfoConfig;
  devices: DeviceConfig[];
}

export interface EffectiveAccessoryInfo {
  manufacturer: string;
  model: string;
  firmwareRevision: string;
  hardwareRevision: string;
  serialNumber: string;
}
