import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

interface NhtsaMake {
  Make_ID:   number;
  Make_Name: string;
}

interface NhtsaModel {
  Model_ID:   number;
  Model_Name: string;
  Make_ID:    number;
  Make_Name:  string;
}

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  // ─── Get All Car Makes (NHTSA) ────────────────────────────────────────────

  async getAllMakes(): Promise<{ id: number; name: string }[]> {
    try {
      const url  = 'https://vpic.nhtsa.dot.gov/api/vehicles/getallmakes?format=json';
      const res  = await fetch(url);
      const json = (await res.json()) as { Results: NhtsaMake[] };

      return json.Results
        .map((m) => ({ id: m.Make_ID, name: m.Make_Name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      this.logger.error('Failed to fetch car makes from NHTSA', err);
      throw new InternalServerErrorException(
        'Could not fetch car makes. Try again later.',
      );
    }
  }

  // ─── Get Models for a Make ID (NHTSA) ─────────────────────────────────────

  async getModelsByMakeId(
    makeId: number,
  ): Promise<{ id: number; name: string }[]> {
    try {
      const url  = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeId/${makeId}?format=json`;
      const res  = await fetch(url);
      const json = (await res.json()) as { Results: NhtsaModel[] };

      return json.Results
        .map((m) => ({ id: m.Model_ID, name: m.Model_Name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      this.logger.error(`Failed to fetch models for makeId=${makeId}`, err);
      throw new InternalServerErrorException(
        'Could not fetch car models. Try again later.',
      );
    }
  }
}