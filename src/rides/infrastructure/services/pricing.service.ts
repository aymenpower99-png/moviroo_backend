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
  finalPrice: number; // facture price (rounded to 5 TND)
  exactPrice: number; // exact calculated price
  loyaltyPoints: number; // points earned for this ride
  surgeMultiplier: number;
  distanceKm: number;
  durationMin: number; // whole minutes (ceil)
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
  carType: string; // e.g. "economy", "comfort"
  finalPrice: number;
  exactPrice: number;
  loyaltyPoints: number;
  surgeMultiplier: number;
}

export interface BatchPricingResult {
  distanceKm: number;
  durationMin: number;
  items: BatchPricingItem[]; // one per carType (same order as request)
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

  /**
   * Batch pricing: ONE HTTP call to ML API /price/batch for all car types.
   * Used by the passenger flow to fetch prices of every vehicle class at once.
   * Falls back to business rules per car type if ML API is unavailable.
   */
  async batchEstimate(req: BatchPricingRequest): Promise<BatchPricingResult> {
    try {
      return await this.callMlApiBatch(req);
    } catch (err) {
      this.logger.warn(`ML API batch unavailable, using fallback: ${err}`);
      return this.batchFallback(req);
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
      exactPrice: data.final_price_exact ?? data.final_price,
      loyaltyPoints: data.loyalty_points ?? 0,
      surgeMultiplier: data.surge_multiplier,
      distanceKm: data.distance_km,
      durationMin: Math.ceil(data.duration_min),
      fullResponse: data,
    };
  }

  /* ── ML API batch call ─────────────────────── */

  private async callMlApiBatch(
    req: BatchPricingRequest,
  ): Promise<BatchPricingResult> {
    const body = {
      lat_origin: req.pickupLat,
      lon_origin: req.pickupLon,
      lat_dest: req.dropoffLat,
      lon_dest: req.dropoffLon,
      car_types: req.carTypes,
      booking_dt: req.bookingDt ?? new Date().toISOString(),
    };

    const res = await fetch(`${this.ML_API_URL}/price/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

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

    const exactPrice = Math.max(PricingService.MIN_FARE, +raw.toFixed(2));
    const finalPrice = Math.ceil(exactPrice / 5) * 5;
    const loyaltyPoints = Math.ceil((finalPrice * 0.5) / 5) * 5;

    return {
      finalPrice,
      exactPrice,
      loyaltyPoints,
      surgeMultiplier: 1.0,
      distanceKm,
      durationMin: Math.ceil(durationMin),
      fullResponse: {
        fallback: true,
        base_fare: PricingService.BASE_FARE,
        distance_cost: +(distanceKm * PricingService.RATE_PER_KM).toFixed(2),
        duration_cost: +(durationMin * PricingService.RATE_PER_MIN).toFixed(2),
      },
    };
  }

  /* ── Batch fallback (one pass, per-car-type multiplier) ────── */

  private batchFallback(req: BatchPricingRequest): BatchPricingResult {
    const { distanceKm, durationMin } = this.haversine.calculate(
      req.pickupLat,
      req.pickupLon,
      req.dropoffLat,
      req.dropoffLon,
    );

    const rawComfort =
      PricingService.BASE_FARE +
      distanceKm * PricingService.RATE_PER_KM +
      durationMin * PricingService.RATE_PER_MIN;

    const items: BatchPricingItem[] = req.carTypes.map((ct) => {
      const mult = PricingService.CAR_MULT[normalizeCarType(ct)] ?? 1.0;
      const raw = rawComfort * mult;
      const exactPrice = Math.max(PricingService.MIN_FARE, +raw.toFixed(2));
      const finalPrice = Math.ceil(exactPrice / 5) * 5;
      const loyaltyPoints = Math.ceil((finalPrice * 0.5) / 5) * 5;
      return {
        carType: ct,
        finalPrice,
        exactPrice,
        loyaltyPoints,
        surgeMultiplier: 1.0,
      };
    });

    return {
      distanceKm,
      durationMin: Math.ceil(durationMin),
      items,
      fullResponse: {
        fallback: true,
        base_fare: PricingService.BASE_FARE,
        distance_cost: +(distanceKm * PricingService.RATE_PER_KM).toFixed(2),
        duration_cost: +(durationMin * PricingService.RATE_PER_MIN).toFixed(2),
      },
    };
  }

  /* Mirror of MULT_CAR in config.py (fallback only) */
  private static readonly CAR_MULT: Record<string, number> = {
    economy: 0.75,
    standard: 0.9,
    comfort: 1.0,
    first_class: 1.6,
    van: 1.3,
    mini_bus: 1.5,
  };
}

/** Normalize a DB class name ("First Class", "Economy") to ML API key. */
function normalizeCarType(raw: string): string {
  const s = String(raw)
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    firstclass: 'first_class',
    first: 'first_class',
    premium: 'first_class',
    minibus: 'mini_bus',
  };
  return aliases[s] ?? s;
}
