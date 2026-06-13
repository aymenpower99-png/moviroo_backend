import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * PricingConfigService — Single source of truth gateway
 *
 * All pricing configuration lives in PostgreSQL (via the Config API).
 * This service is the ONLY way the NestJS backend reads or writes pricing config.
 *
 * Flow:
 *   Admin Dashboard ──▶ PricingConfigService ──▶ Config API (Flask) ──▶ PostgreSQL
 *   Pricing Fallback ──▶ PricingConfigService ──▶ Config API (Flask) ──▶ PostgreSQL
 *
 * Fallback:
 *   If Config API / PostgreSQL is down, this service returns hardcoded legacy
 *   constants so rides never break. The local values are emergency fallback only.
 */

const ML_CONFIG_API_URL =
  process.env.ML_CONFIG_API_URL ?? 'http://localhost:5000';

const ML_TIMEOUT_MS = +(process.env.ML_API_TIMEOUT_MS ?? 5000);

/** Emergency fallback values (used ONLY when Config API is unreachable) */
const FALLBACK_CONFIG: Record<string, any> = {
  BASE_FARE: 6,
  RATE_PER_KM: 0.65,
  RATE_PER_MIN: 0.3,
  MIN_FARE: 4,
  MULT_TRAFFIC: { 1: 1, 2: 1.2, 3: 1.5 },
  MULT_WEATHER: { 1: 1.2, 2: 2.1, 3: 1.3, 4: 1.1 },
  MULT_DEMAND: { normal: 1, rush: 1.25, surge: 1.6 },
  MULT_NIGHT: 2.2,
  MULT_CAR: {
    economy: 0.75,
    standard: 0.9,
    comfort: 1,
    first_class: 1.6,
    van: 1.3,
    mini_bus: 1.5,
  },
  MULT_FRIDAY_JUMUAH: 1.4,
  MULT_RAMADAN: {
    ramadan_iftar: 2.1,
    ramadan_tarawih: 1.3,
    ramadan_suhoor: 1.15,
    ramadan_last_week: 1.6,
    none: 1,
  },
  MULT_BEACH: {
    afflux_matin: 1.25,
    'après_midi': 1.3,
    coucher_soleil: 1.35,
    none: 1,
  },
  MULT_ZONE: {
    capitale: 1.15,
    banlieue: 1.05,
    balnéaire: 1.1,
    intérieure: 1,
    sud: 0.95,
  },
  MULT_SPECIAL_EVENT: {
    aid_el_fitr: 2,
    aid_el_adha_week: 1.8,
    new_year_eve: 1.9,
    new_year_days: 1.4,
    none: 1,
  },
  ENABLE_TRAFFIC: true,
  ENABLE_WEATHER: true,
  ENABLE_DEMAND: true,
  ENABLE_NIGHT: true,
  ENABLE_FRIDAY_JUMUAH: true,
  ENABLE_RAMADAN: true,
  ENABLE_BEACH: true,
  ENABLE_ZONE: true,
  ENABLE_SPECIAL_EVENT: true,
  ENABLE_SEASON: true,
};

@Injectable()
export class PricingConfigService {
  private readonly logger = new Logger(PricingConfigService.name);

  constructor(private readonly http: HttpService) {}

  /**
   * Fetch the full pricing config from the Config API (PostgreSQL).
   * Returns fallback values if the Config API is unreachable.
   */
  async getConfig(): Promise<Record<string, any>> {
    try {
      const res = await firstValueFrom(
        this.http.get(`${ML_CONFIG_API_URL}/api/config`, {
          timeout: ML_TIMEOUT_MS,
        }),
      );
      this.logger.log(
        `[Config API] Fetched ${Object.keys(res.data).length} keys from PostgreSQL`,
      );
      return res.data;
    } catch (err) {
      this.logger.warn(
        `[Config API] Unreachable — using emergency fallback config. Error: ${err}`,
      );
      return { ...FALLBACK_CONFIG };
    }
  }

  /**
   * Update pricing config in PostgreSQL (via Config API).
   * Only SUPER_ADMIN should call this.
   */
  async updateConfig(
    updates: Record<string, any>,
  ): Promise<{ success: boolean; data?: Record<string, any>; error?: string }> {
    try {
      const res = await firstValueFrom(
        this.http.post(`${ML_CONFIG_API_URL}/api/config`, updates, {
          timeout: ML_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      this.logger.log(
        `[Config API] Updated ${Object.keys(updates).length} keys in PostgreSQL`,
      );
      return { success: true, data: res.data };
    } catch (err) {
      this.logger.error(
        `[Config API] Failed to update config: ${err}`,
      );
      return { success: false, error: String(err) };
    }
  }

  /**
   * Get a single config value (with optional fallback).
   * Used by PricingFallbackService for lightweight reads.
   */
  async getValue<T>(key: string, fallback?: T): Promise<T> {
    const cfg = await this.getConfig();
    return (cfg[key] ?? fallback) as T;
  }
}
