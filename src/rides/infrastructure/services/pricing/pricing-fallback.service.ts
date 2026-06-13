import { Injectable, Logger } from '@nestjs/common';
import { HaversineService } from '../haversine.service';
import { PricingConfigService } from '../../../../common/services/pricing-config.service';

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

  constructor(
    private readonly haversine: HaversineService,
    private readonly pricingConfig: PricingConfigService,
  ) {}

  /**
   * Get multiplier for a car type.
   * Priority: 1) provided override, 2) config MULT_CAR, 3) default 1.0
   */
  private async getMultiplier(carType: string, override?: number): Promise<number> {
    if (override !== undefined && override !== null) {
      return override;
    }
    const multCar = await this.pricingConfig.getValue<Record<string, number>>('MULT_CAR', {});
    return multCar[normalizeCarType(carType)] ?? 1.0;
  }

  /**
   * Fallback pricing using pure business rules (single car type).
   * Reads BASE_FARE, RATE_PER_KM, RATE_PER_MIN, MIN_FARE from PostgreSQL via Config API.
   */
  async fallback(req: PricingRequest): Promise<PricingResult> {
    const { distanceKm, durationMin } = this.haversine.calculate(
      req.pickupLat,
      req.pickupLon,
      req.dropoffLat,
      req.dropoffLon,
    );

    const baseFare = await this.pricingConfig.getValue<number>('BASE_FARE', 6);
    const ratePerKm = await this.pricingConfig.getValue<number>('RATE_PER_KM', 0.65);
    const ratePerMin = await this.pricingConfig.getValue<number>('RATE_PER_MIN', 0.3);
    const minFare = await this.pricingConfig.getValue<number>('MIN_FARE', 4);

    const raw = baseFare + distanceKm * ratePerKm + durationMin * ratePerMin;

    const mult = await this.getMultiplier(req.carType, req.carMultiplier);
    const priced = raw * mult;

    const exactPrice = Math.max(minFare, +priced.toFixed(2));
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
        base_fare: baseFare,
        distance_cost: +(distanceKm * ratePerKm).toFixed(2),
        duration_cost: +(durationMin * ratePerMin).toFixed(2),
        car_multiplier: mult,
      },
    };
  }

  /**
   * Batch fallback (one pass, per-car-type multiplier)
   */
  async batchFallback(req: BatchPricingRequest): Promise<BatchPricingResult> {
    const { distanceKm, durationMin } = this.haversine.calculate(
      req.pickupLat,
      req.pickupLon,
      req.dropoffLat,
      req.dropoffLon,
    );

    const baseFare = await this.pricingConfig.getValue<number>('BASE_FARE', 6);
    const ratePerKm = await this.pricingConfig.getValue<number>('RATE_PER_KM', 0.65);
    const ratePerMin = await this.pricingConfig.getValue<number>('RATE_PER_MIN', 0.3);
    const minFare = await this.pricingConfig.getValue<number>('MIN_FARE', 4);

    const rawComfort = baseFare + distanceKm * ratePerKm + durationMin * ratePerMin;

    const items: BatchPricingItem[] = await Promise.all(
      req.carTypes.map(async (ct) => {
        const mult = await this.getMultiplier(
          ct,
          req.carMultipliers?.[normalizeCarType(ct)],
        );
        const raw = rawComfort * mult;
        const exactPrice = Math.max(minFare, +raw.toFixed(2));
        const finalPrice = Math.ceil(exactPrice / 5) * 5;
        const loyaltyPoints = Math.ceil((finalPrice * 0.5) / 5) * 5;
        return {
          carType: normalizeCarType(ct),
          finalPrice,
          exactPrice,
          loyaltyPoints,
          surgeMultiplier: mult,
        };
      }),
    );

    return {
      distanceKm,
      durationMin: Math.ceil(durationMin),
      items,
      fullResponse: {
        fallback: true,
        base_fare: baseFare,
        distance_cost: +(distanceKm * ratePerKm).toFixed(2),
        duration_cost: +(durationMin * ratePerMin).toFixed(2),
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
