import { Injectable, Logger } from '@nestjs/common';
import { HaversineService } from '../haversine.service';

export interface PricingRequest {
  pickupLat: number;
  pickupLon: number;
  dropoffLat: number;
  dropoffLon: number;
  carType: string;
  carMultiplier?: number;
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
  carMultipliers?: Record<string, number>;
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
export class PricingFallbackService {
  private readonly logger = new Logger(PricingFallbackService.name);

  /* Business-rule fallback constants */
  private static readonly BASE_FARE = 3.5;
  private static readonly RATE_PER_KM = 0.65;
  private static readonly RATE_PER_MIN = 0.3;
  private static readonly MIN_FARE = 4.0;

  /* Legacy fallback mirror of MULT_CAR — used only when no DB multiplier is provided */
  private static readonly CAR_MULT: Record<string, number> = {
    economy: 0.75,
    standard: 0.9,
    comfort: 1.0,
    first_class: 1.6,
    van: 1.3,
    mini_bus: 1.5,
  };

  constructor(private readonly haversine: HaversineService) {}

  /**
   * Get multiplier for a car type.
   * Priority: 1) provided override, 2) legacy CAR_MULT, 3) default 1.0
   */
  private getMultiplier(carType: string, override?: number): number {
    if (override !== undefined && override !== null) {
      return override;
    }
    return PricingFallbackService.CAR_MULT[normalizeCarType(carType)] ?? 1.0;
  }

  /**
   * Fallback pricing using pure business rules (single car type)
   */
  fallback(req: PricingRequest): PricingResult {
    const { distanceKm, durationMin } = this.haversine.calculate(
      req.pickupLat,
      req.pickupLon,
      req.dropoffLat,
      req.dropoffLon,
    );

    const raw =
      PricingFallbackService.BASE_FARE +
      distanceKm * PricingFallbackService.RATE_PER_KM +
      durationMin * PricingFallbackService.RATE_PER_MIN;

    const mult = this.getMultiplier(req.carType, req.carMultiplier);
    const priced = raw * mult;

    const exactPrice = Math.max(
      PricingFallbackService.MIN_FARE,
      +priced.toFixed(2),
    );
    const finalPrice = Math.ceil(exactPrice / 5) * 5;
    const loyaltyPoints = Math.ceil((finalPrice * 0.5) / 5) * 5;

    return {
      finalPrice,
      exactPrice,
      loyaltyPoints,
      surgeMultiplier: mult,
      distanceKm,
      durationMin: Math.ceil(durationMin),
      fullResponse: {
        fallback: true,
        base_fare: PricingFallbackService.BASE_FARE,
        distance_cost: +(
          distanceKm * PricingFallbackService.RATE_PER_KM
        ).toFixed(2),
        duration_cost: +(
          durationMin * PricingFallbackService.RATE_PER_MIN
        ).toFixed(2),
        car_multiplier: mult,
      },
    };
  }

  /**
   * Batch fallback (one pass, per-car-type multiplier)
   */
  batchFallback(req: BatchPricingRequest): BatchPricingResult {
    const { distanceKm, durationMin } = this.haversine.calculate(
      req.pickupLat,
      req.pickupLon,
      req.dropoffLat,
      req.dropoffLon,
    );

    const rawComfort =
      PricingFallbackService.BASE_FARE +
      distanceKm * PricingFallbackService.RATE_PER_KM +
      durationMin * PricingFallbackService.RATE_PER_MIN;

    const items: BatchPricingItem[] = req.carTypes.map((ct) => {
      const mult = this.getMultiplier(
        ct,
        req.carMultipliers?.[normalizeCarType(ct)],
      );
      const raw = rawComfort * mult;
      const exactPrice = Math.max(
        PricingFallbackService.MIN_FARE,
        +raw.toFixed(2),
      );
      const finalPrice = Math.ceil(exactPrice / 5) * 5;
      const loyaltyPoints = Math.ceil((finalPrice * 0.5) / 5) * 5;
      return {
        carType: normalizeCarType(ct), // Normalize to match ML service format
        finalPrice,
        exactPrice,
        loyaltyPoints,
        surgeMultiplier: mult,
      };
    });

    return {
      distanceKm,
      durationMin: Math.ceil(durationMin),
      items,
      fullResponse: {
        fallback: true,
        base_fare: PricingFallbackService.BASE_FARE,
        distance_cost: +(
          distanceKm * PricingFallbackService.RATE_PER_KM
        ).toFixed(2),
        duration_cost: +(
          durationMin * PricingFallbackService.RATE_PER_MIN
        ).toFixed(2),
      },
    };
  }
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
