import type { PlatformConfig } from 'homebridge';

export type ProtocolMode = 'http' | 'https' | 'auto';

export interface MillHeaterAccessoryConfig {
  /** Name shown in Home app */
  name: string;

  /** IP or resolvable hostname */
  host: string;

  /** http (default), https, or auto (https if apiKey set) */
  protocol?: ProtocolMode;

  /** Optional API key (Authentication header) */
  apiKey?: string;

  /** If https, allow self-signed cert (default true) */
  allowInsecureHttps?: boolean;

  /** Poll interval in seconds (default 10) */
  pollIntervalSeconds?: number;

  /** Thermostat bounds / step (defaults: 5/30/0.5) */
  minTemperature?: number;
  maxTemperature?: number;
  temperatureStep?: number;

  /** Display unit for HomeKit */
  temperatureUnit?: 'C' | 'F';

  /** Accessory information */
  manufacturer?: string;
  model?: string;
  firmwareRevision?: string;
  serialNumber?: string;
}

export interface MillHeatingPlatformConfig extends PlatformConfig {
  accessories?: MillHeaterAccessoryConfig[];
}
