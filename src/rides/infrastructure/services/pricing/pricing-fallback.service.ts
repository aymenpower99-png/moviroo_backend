import { Injectable, Logger } from '@nestjs/common';
import { HaversineService } from '../haversine.service';

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
export class PricingFallbackService {
  private readonly logger = new Logger(PricingFallbackService.name);

  /* Business-rule fallback constants */
  private static readonly BASE_FARE = 3.5;
  private static readonly RATE_PER_KM = 0.65;
  private static readonly RATE_PER_MIN = 0.3;
  private static readonly MIN_FARE = 4.0;

  /* Mirror of MULT_CAR in config.py (fallback only) */
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

    const exactPrice = Math.max(PricingFallbackService.MIN_FARE, +raw.toFixed(2));
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
        base_fare: PricingFallbackService.BASE_FARE,
        distance_cost: +(distanceKm * PricingFallbackService.RATE_PER_KM).toFixed(2),
        duration_cost: +(durationMin * PricingFallbackService.RATE_PER_MIN).toFixed(2),
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
      const mult = PricingFallbackService.CAR_MULT[normalizeCarType(ct)] ?? 1.0;
      const raw = rawComfort * mult;
      const exactPrice = Math.max(PricingFallbackService.MIN_FARE, +raw.toFixed(2));
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
        base_fare: PricingFallbackService.BASE_FARE,
        distance_cost: +(distanceKm * PricingFallbackService.RATE_PER_KM).toFixed(2),
        duration_cost: +(durationMin * PricingFallbackService.RATE_PER_MIN).toFixed(2),
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
