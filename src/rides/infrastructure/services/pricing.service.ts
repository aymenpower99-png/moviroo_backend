import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { HaversineService } from './haversine.service';
import { withRetry } from '../../../common/utils/retry.util';
import { ClassesService } from '../../../classes/classes.service';

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

  constructor(
    private readonly haversine: HaversineService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly classesService: ClassesService,
  ) {}

  /** Call ML API; fall back to business rules if unavailable - CACHED */
  async estimate(req: PricingRequest): Promise<PricingResult> {
    const startTime = Date.now();
    this.logger.log(
      `[PRICING] Estimate request: ${req.carType} from (${req.pickupLat}, ${req.pickupLon}) to (${req.dropoffLat}, ${req.dropoffLon})`,
    );

    // Validate coordinates BEFORE any caching or ML call
    this.validateCoordinates(
      req.pickupLat,
      req.pickupLon,
      req.dropoffLat,
      req.dropoffLon,
    );

    // Check cache first (shorter TTL for pricing since it can change)
    const cacheKey = `pricing:${req.pickupLat.toFixed(6)}:${req.pickupLon.toFixed(6)}:${req.dropoffLat.toFixed(6)}:${req.dropoffLon.toFixed(6)}:${req.carType}:${req.bookingDt ?? 'now'}`;
    const cached = await this.cacheManager.get<PricingResult>(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      this.logger.log(
        `[PRICING] Cache HIT for pricing: ${req.carType} - ${duration}ms - ${cached.finalPrice} TND`,
      );
      return cached;
    }

    try {
      const apiStart = Date.now();
      const result = await this.callMlApi(req);
      const apiDuration = Date.now() - apiStart;
      const totalDuration = Date.now() - startTime;

      await this.cacheManager.set(cacheKey, result, 180); // 3 minutes
      this.logger.log(
        `[PRICING] ML API success: ${req.carType} - ${totalDuration}ms (API: ${apiDuration}ms) - ${result.finalPrice} TND (surge: ${result.surgeMultiplier})`,
      );
      return result;
    } catch (err) {
      const fallbackStart = Date.now();
      this.logger.warn(
        `[PRICING] ML API unavailable, using fallback pricing: ${err}`,
      );
      const fallbackResult = this.fallback(req);
      const fallbackDuration = Date.now() - fallbackStart;
      const totalDuration = Date.now() - startTime;

      await this.cacheManager.set(cacheKey, fallbackResult, 60); // 1 minute for fallback
      this.logger.log(
        `[PRICING] Fallback used: ${req.carType} - ${totalDuration}ms (Fallback: ${fallbackDuration}ms) - ${fallbackResult.finalPrice} TND`,
      );
      return fallbackResult;
    }
  }

  /**
   * Batch pricing: ONE HTTP call to ML API /price/batch for all car types.
   * Used by the passenger flow to fetch prices of every vehicle class at once.
   * Falls back to business rules per car type if ML API is unavailable.
   * CACHED
   */
  async batchEstimate(req: BatchPricingRequest): Promise<BatchPricingResult> {
    const startTime = Date.now();
    this.logger.log(
      `[PRICING] Batch estimate request: ${req.carTypes.join(', ')} from (${req.pickupLat}, ${req.pickupLon}) to (${req.dropoffLat}, ${req.dropoffLon})`,
    );

    // Validate coordinates BEFORE any caching or ML call
    this.validateCoordinates(
      req.pickupLat,
      req.pickupLon,
      req.dropoffLat,
      req.dropoffLon,
    );

    // Check cache first
    const carTypesKey = req.carTypes.sort().join(',');
    const cacheKey = `batch_pricing:${req.pickupLat.toFixed(6)}:${req.pickupLon.toFixed(6)}:${req.dropoffLat.toFixed(6)}:${req.dropoffLon.toFixed(6)}:${carTypesKey}:${req.bookingDt ?? 'now'}`;
    const cached = await this.cacheManager.get<BatchPricingResult>(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      this.logger.log(
        `[PRICING] Cache HIT for batch pricing: ${req.carTypes.join(', ')} - ${duration}ms - ${cached.items.length} results`,
      );
      return cached;
    }

    try {
      const apiStart = Date.now();
      const result = await this.callMlApiBatch(req);
      const apiDuration = Date.now() - apiStart;
      const totalDuration = Date.now() - startTime;

      await this.cacheManager.set(cacheKey, result, 180); // 3 minutes
      this.logger.log(
        `[PRICING] ML API batch success: ${req.carTypes.join(', ')} - ${totalDuration}ms (API: ${apiDuration}ms) - ${result.distanceKm.toFixed(1)}km, ${result.durationMin}min`,
      );
      return result;
    } catch (err) {
      const fallbackStart = Date.now();
      this.logger.warn(
        `[PRICING] ML API batch unavailable, using fallback: ${err}`,
      );
      const fallbackResult = this.batchFallback(req);
      const fallbackDuration = Date.now() - fallbackStart;
      const totalDuration = Date.now() - startTime;

      await this.cacheManager.set(cacheKey, fallbackResult, 60); // 1 minute for fallback
      this.logger.log(
        `[PRICING] Fallback used for batch: ${req.carTypes.join(', ')} - ${totalDuration}ms (Fallback: ${fallbackDuration}ms)`,
      );
      return fallbackResult;
    }
  }

  /**
   * Get pricing for ALL active car classes from database.
   * Fetches car classes dynamically from DB and calls batch pricing.
   * Used by passenger flow to show all available options.
   */
  async estimateAllActiveClasses(
    pickupLat: number,
    pickupLon: number,
    dropoffLat: number,
    dropoffLon: number,
    bookingDt?: string,
  ): Promise<BatchPricingResult> {
    this.logger.log(
      `[PRICING] Estimate all active classes from (${pickupLat}, ${pickupLon}) to (${dropoffLat}, ${dropoffLon})`,
    );

    // Fetch all active car classes with multipliers from database
    const classes = await this.classesService.getActiveClassesWithMultipliers();

    if (classes.length === 0) {
      this.logger.warn('[PRICING] No active car classes found in database');
      throw new Error('No active car classes available');
    }

    const carTypes = classes.map((c) => normalizeCarType(c.name));
    this.logger.log(
      `[PRICING] Found ${classes.length} active classes: ${carTypes.join(', ')}`,
    );

    // Call batch pricing with all active car types
    return await this.batchEstimate({
      pickupLat,
      pickupLon,
      dropoffLat,
      dropoffLon,
      carTypes,
      bookingDt,
    });
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

  /**
   * Validate that coordinates are valid before sending to ML / OSRM.
   * Throws BadRequestException with explicit message if invalid.
   * Rules:
   *   - Must be defined and finite
   *   - Cannot be (0,0) — typical fallback for missing data
   *   - Must be in geographic bounds (-90..90, -180..180)
   *   - Pickup and dropoff cannot be identical (zero-distance trip)
   */
  private validateCoordinates(
    pickupLat: number,
    pickupLon: number,
    dropoffLat: number,
    dropoffLon: number,
  ): void {
    const isInvalid = (lat: number, lon: number) =>
      lat === undefined ||
      lat === null ||
      lon === undefined ||
      lon === null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      (lat === 0 && lon === 0) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180;

    if (isInvalid(pickupLat, pickupLon)) {
      this.logger.error(
        `[PRICING] Invalid pickup coordinates: (${pickupLat}, ${pickupLon})`,
      );
      throw new Error(
        `Invalid pickup coordinates (${pickupLat}, ${pickupLon}). Must be valid lat/lon, not (0,0).`,
      );
    }

    if (isInvalid(dropoffLat, dropoffLon)) {
      this.logger.error(
        `[PRICING] Invalid dropoff coordinates: (${dropoffLat}, ${dropoffLon})`,
      );
      throw new Error(
        `Invalid dropoff coordinates (${dropoffLat}, ${dropoffLon}). Must be valid lat/lon, not (0,0).`,
      );
    }

    if (pickupLat === dropoffLat && pickupLon === dropoffLon) {
      this.logger.error(
        `[PRICING] Pickup and dropoff are identical: (${pickupLat}, ${pickupLon})`,
      );
      throw new Error('Pickup and dropoff coordinates cannot be identical.');
    }
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
