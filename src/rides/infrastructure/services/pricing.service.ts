import { Injectable, Logger } from '@nestjs/common';
import { HaversineService } from './haversine.service';

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
  surgeMultiplier: number;
  distanceKm: number;
  durationMin: number;
  fullResponse: Record<string, any>;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private readonly ML_API_URL =
    process.env.ML_API_URL ?? 'http://localhost:8000';

  /* Business-rule fallback constants (mirror config.py) */
  private static readonly BASE_FARE = 3.5;
  private static readonly RATE_PER_KM = 0.65;
  private static readonly RATE_PER_MIN = 0.3;
  private static readonly MIN_FARE = 4.0;

  constructor(private readonly haversine: HaversineService) {}

  /** Call ML API; fall back to business rules if unavailable */
  async estimate(req: PricingRequest): Promise<PricingResult> {
    try {
      return await this.callMlApi(req);
    } catch (err) {
      this.logger.warn(`ML API unavailable, using fallback pricing: ${err}`);
      return this.fallback(req);
    }
  }

  /* ── ML API call ──────────────────────────── */

  private async callMlApi(req: PricingRequest): Promise<PricingResult> {
    const body = {
      lat_origin: req.pickupLat,
      lon_origin: req.pickupLon,
      lat_dest: req.dropoffLat,
      lon_dest: req.dropoffLon,
      car_type: req.carType,
      booking_dt: req.bookingDt ?? new Date().toISOString(),
    };

    const res = await fetch(`${this.ML_API_URL}/price/quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`ML API responded with status ${res.status}`);
    }

    const data = (await res.json()) as Record<string, any>;

    return {
      finalPrice: data.final_price,
      surgeMultiplier: data.surge_multiplier,
      distanceKm: data.distance_km,
      durationMin: data.duration_min,
      fullResponse: data,
    };
  }

  /* ── Fallback (pure business rules) ────────── */

  private fallback(req: PricingRequest): PricingResult {
    const { distanceKm, durationMin } = this.haversine.calculate(
      req.pickupLat,
      req.pickupLon,
      req.dropoffLat,
      req.dropoffLon,
    );

    const raw =
      PricingService.BASE_FARE +
      distanceKm * PricingService.RATE_PER_KM +
      durationMin * PricingService.RATE_PER_MIN;

    const finalPrice = Math.max(PricingService.MIN_FARE, +raw.toFixed(2));

    return {
      finalPrice,
      surgeMultiplier: 1.0,
      distanceKm,
      durationMin,
      fullResponse: {
        fallback: true,
        base_fare: PricingService.BASE_FARE,
        distance_cost: +(distanceKm * PricingService.RATE_PER_KM).toFixed(2),
        duration_cost: +(durationMin * PricingService.RATE_PER_MIN).toFixed(2),
      },
    };
  }
}
