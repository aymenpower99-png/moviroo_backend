import { Injectable, Logger } from '@nestjs/common';
import {
  PricingService,
  BatchPricingRequest,
  BatchPricingItem,
} from '../../infrastructure/services/pricing.service';
import { ClassesService } from '../../../classes/classes.service';
import {
  GetVehiclePricesDto,
  GetVehiclePricesResponse,
  VehicleClassPrice,
} from '../dtos/get-vehicle-prices.dto';

@Injectable()
export class GetVehiclePricesUseCase {
  private readonly logger = new Logger(GetVehiclePricesUseCase.name);

  constructor(
    private readonly pricingService: PricingService,
    private readonly classesService: ClassesService,
  ) {}

  /**
   * Passenger flow — returns ALL active vehicle classes with prices in ONE call.
   *
   * Orchestration only: fetch classes from DB → 1 ML batch call → map to response.
   * No pricing logic lives here (ML service owns it, with fallback in PricingService).
   */
  async execute(dto: GetVehiclePricesDto): Promise<GetVehiclePricesResponse> {
    // 1. Fetch all active vehicle classes from DB
    const vehicleClasses = await this.classesService.findAll();

    if (vehicleClasses.length === 0) {
      this.logger.warn('No active vehicle classes found in DB');
      return {
        vehicleClasses: [],
        pickupLat: dto.pickupLat,
        pickupLon: dto.pickupLon,
        dropoffLat: dto.dropoffLat,
        dropoffLon: dto.dropoffLon,
      };
    }

    // 2. Normalize and deduplicate car types before sending to ML
    const rawCarTypes = vehicleClasses.map((v) => v.name);
    const normalizedTypes = rawCarTypes.map((name) => normalizeCarType(name));
    const uniqueCarTypes = Array.from(new Set(normalizedTypes));

    this.logger.log(
      `Batch pricing for ${vehicleClasses.length} vehicle classes (deduplicated to ${uniqueCarTypes.length}): ${uniqueCarTypes.join(', ')}`,
    );

    // 3. Single batch call to ML API for all car types
    const batchReq: BatchPricingRequest = {
      pickupLat: dto.pickupLat,
      pickupLon: dto.pickupLon,
      dropoffLat: dto.dropoffLat,
      dropoffLon: dto.dropoffLon,
      carTypes: uniqueCarTypes,
      bookingDt: dto.bookingDt,
    };

    const batchResult = await this.pricingService.batchEstimate(batchReq);

    // 4. Index prices by normalized car type for O(1) lookup
    const priceByCarType = new Map<string, BatchPricingItem>();
    for (const item of batchResult.items) {
      priceByCarType.set(normalizeCarType(item.carType), item);
    }

    // 4. Merge DB metadata with ML prices
    const withPrices: VehicleClassPrice[] = vehicleClasses.map((vc) => {
      const key = normalizeCarType(vc.name);
      const price = priceByCarType.get(key);

      if (!price) {
        this.logger.warn(
          `No price returned for class "${vc.name}" (key=${key}) — using 0`,
        );
      }

      return {
        id: vc.id,
        name: vc.name,
        imageUrl: vc.imageUrl,
        seats: vc.seats,
        bags: vc.bags,
        priceTnd: price?.finalPrice ?? 0,
        exactPrice: price?.exactPrice ?? 0,
        distanceKm: batchResult.distanceKm,
        durationMin: batchResult.durationMin,
        surgeMultiplier: price?.surgeMultiplier ?? 1.0,
        loyaltyPoints: price?.loyaltyPoints ?? 0,
      };
    });

    this.logger.log(
      `Batch pricing complete (distance=${batchResult.distanceKm.toFixed(2)}km, ` +
        `duration=${batchResult.durationMin}min)`,
    );

    return {
      vehicleClasses: withPrices,
      pickupLat: dto.pickupLat,
      pickupLon: dto.pickupLon,
      dropoffLat: dto.dropoffLat,
      dropoffLon: dto.dropoffLon,
    };
  }

  /**
   * Alternative method that accepts individual parameters instead of DTO.
   * Used by the /pricing/all endpoint for passenger flow.
   */
  async executeAll(
    pickupLat: number,
    pickupLon: number,
    dropoffLat: number,
    dropoffLon: number,
    bookingDt?: string,
  ): Promise<GetVehiclePricesResponse> {
    const dto: GetVehiclePricesDto = {
      pickupLat,
      pickupLon,
      dropoffLat,
      dropoffLon,
      bookingDt,
    };
    return this.execute(dto);
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
