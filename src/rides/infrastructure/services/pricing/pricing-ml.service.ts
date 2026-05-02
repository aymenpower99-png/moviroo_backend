import { Injectable, Logger } from '@nestjs/common';
import { withRetry } from '../../../../common/utils/retry.util';

export interface PricingRequest {
  pickupLat: number;
  pickupLon: number;
  dropoffLat: number;
  dropoffLon: number;
  carType: string;
  bookingDt?: string;
}

export interface PricingResult {
  finalPrice: number;
  exactPrice: number;
  loyaltyPoints: number;
  surgeMultiplier: number;
  distanceKm: number;
  durationMin: number;
  fullResponse: Record<string, any>;
}

export interface BatchPricingRequest {
  pickupLat: number;
  pickupLon: number;
  dropoffLat: number;
  dropoffLon: number;
  carTypes: string[];
  bookingDt?: string;
}

export interface BatchPricingItem {
  carType: string;
  finalPrice: number;
  exactPrice: number;
  loyaltyPoints: number;
  surgeMultiplier: number;
}

export interface BatchPricingResult {
  distanceKm: number;
  durationMin: number;
  items: BatchPricingItem[];
  fullResponse: Record<string, any>;
}

@Injectable()
export class PricingMlService {
  private readonly logger = new Logger(PricingMlService.name);
  private readonly ML_API_URL =
    process.env.ML_API_URL ?? 'http://localhost:8000';

  /**
   * Call ML API for single car type pricing
   */
  async callMlApi(req: PricingRequest): Promise<PricingResult> {
    const body = {
      lat_origin: req.pickupLat,
      lon_origin: req.pickupLon,
      lat_dest: req.dropoffLat,
      lon_dest: req.dropoffLon,
      car_type: req.carType,
      booking_dt: req.bookingDt ?? new Date().toISOString(),
    };

    const res = await withRetry(
      () =>
        fetch(`${this.ML_API_URL}/price/quick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        }),
      `ML API pricing ${req.carType}`,
      { maxRetries: 2, initialDelayMs: 1000 },
      this.logger,
    );

    if (!res.ok) {
      throw new Error(`ML API responded with status ${res.status}`);
    }

    const data = (await res.json()) as Record<string, any>;

    return {
      finalPrice: data.final_price,
      exactPrice: data.final_price_exact ?? data.final_price,
      loyaltyPoints: data.loyalty_points ?? 0,
      surgeMultiplier: data.surge_multiplier,
      distanceKm: data.distance_km,
      durationMin: Math.ceil(data.duration_min),
      fullResponse: data,
    };
  }

  /**
   * Call ML API for batch pricing (multiple car types)
   */
  async callMlApiBatch(req: BatchPricingRequest): Promise<BatchPricingResult> {
    const body = {
      lat_origin: req.pickupLat,
      lon_origin: req.pickupLon,
      lat_dest: req.dropoffLat,
      lon_dest: req.dropoffLon,
      car_types: req.carTypes,
      booking_dt: req.bookingDt ?? new Date().toISOString(),
    };

    const res = await withRetry(
      () =>
        fetch(`${this.ML_API_URL}/price/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        }),
      `ML API batch pricing ${req.carTypes.join(',')}`,
      { maxRetries: 2, initialDelayMs: 1000 },
      this.logger,
    );

    if (!res.ok) {
      throw new Error(`ML API batch responded with status ${res.status}`);
    }

    const data = (await res.json()) as Record<string, any>;
    const common = (data.common ?? {}) as Record<string, any>;
    const prices = (data.prices ?? []) as Array<Record<string, any>>;

    const items: BatchPricingItem[] = prices.map((p) => ({
      carType: String(p.car_type),
      finalPrice: Number(p.final_price_rounded ?? p.final_price),
      exactPrice: Number(p.final_price ?? p.final_price_rounded),
      loyaltyPoints: Number(p.loyalty_points ?? 0),
      surgeMultiplier: Number(p.surge_multiplier ?? 1),
    }));

    return {
      distanceKm: Number(common.distance_km ?? 0),
      durationMin: Math.ceil(Number(common.duration_min ?? 0)),
      items,
      fullResponse: data,
    };
  }
}
