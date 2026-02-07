import { Agent, fetch } from 'undici';

export type OperationMode =
  | 'Off'
  | 'Weekly program'
  | 'Independent device'
  | 'Control individually'
  | 'Invalid';

export interface ControlStatusDto {
  ambient_temperature: number;
  current_power: number;
  control_signal: number;
  set_temperature: number;
  switched_on: boolean;
  connected_to_cloud: boolean;
  operation_mode: OperationMode;
  status: 'ok' | string;
}

export type ProtocolMode = 'http' | 'https' | 'auto';

export interface MillApiClientOptions {
  host: string;
  protocol?: ProtocolMode;          // default: http
  apiKey?: string;                 // optional
  allowInsecureHttps?: boolean;    // default: true (when https)
  timeoutMs?: number;              // default: 5000
}

export class MillApiClient {
  private readonly baseUrl: string;
  private readonly dispatcher?: Agent;
  private readonly timeoutMs: number;
  private readonly protocolResolved: 'http' | 'https';

  constructor(private readonly opts: MillApiClientOptions) {
    this.timeoutMs = opts.timeoutMs ?? 5000;

    const protocolMode: ProtocolMode = opts.protocol ?? 'http';
    const hasKey = !!(opts.apiKey && opts.apiKey.trim().length > 0);

    // Resolve protocol
    if (protocolMode === 'auto') {
      this.protocolResolved = hasKey ? 'https' : 'http';
    } else {
      this.protocolResolved = protocolMode;
    }

    this.baseUrl = `${this.protocolResolved}://${opts.host}`;

    // HTTPS: allow self-signed if requested
    const allowInsecure = opts.allowInsecureHttps ?? true;
    if (this.protocolResolved === 'https' && allowInsecure) {
      this.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }
  }

  async getStatus(): Promise<{ status: 'ok' | string; name?: string; version?: string; mac_address?: string }> {
    return this.getJson('/status');
  }

  async getControlStatus(): Promise<ControlStatusDto> {
    return this.getJson('/control-status');
  }

  async setOperationMode(mode: OperationMode): Promise<void> {
    await this.postJson('/operation-mode', { mode });
  }

  async setNormalTemperature(value: number): Promise<void> {
    await this.postJson('/set-temperature', { type: 'Normal', value });
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {};
    const key = this.opts.apiKey?.trim();
    if (key) h.Authentication = key;
    return h;
  }

  private timeoutSignal(): AbortSignal {
    return AbortSignal.timeout(this.timeoutMs);
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private async getJson<T = any>(path: string): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'GET',
      headers: this.headers(),
      signal: this.timeoutSignal(),
      dispatcher: this.dispatcher,
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`GET ${path} failed: HTTP ${res.status} - ${JSON.stringify(json)}`);
    if (json?.status && json.status !== 'ok') throw new Error(`GET ${path} status != ok: ${json.status}`);
    return json as T;
  }

  private async postJson(path: string, body: unknown): Promise<void> {
    const res = await fetch(this.url(path), {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: this.timeoutSignal(),
      dispatcher: this.dispatcher,
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`POST ${path} failed: HTTP ${res.status} - ${JSON.stringify(json)}`);
    if (json?.status && json.status !== 'ok') throw new Error(`POST ${path} status != ok: ${json.status}`);
  }
}
