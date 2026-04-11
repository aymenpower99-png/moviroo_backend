import { Injectable, Logger } from '@nestjs/common';

interface NhtsaModel {
  Model_ID: number;
  Model_Name: string;
}

@Injectable()
export class VehicleMakesService {
  private readonly logger = new Logger(VehicleMakesService.name);

  private readonly POPULAR_MAKES = [
    { id: 474, name: 'Toyota' },
    { id: 448, name: 'Honda' },
    { id: 440, name: 'Ford' },
    { id: 460, name: 'Hyundai' },
    { id: 461, name: 'Kia' },
    { id: 441, name: 'Chevrolet' },
    { id: 452, name: 'Nissan' },
    { id: 482, name: 'Volkswagen' },
    { id: 467, name: 'Mercedes-Benz' },
    { id: 449, name: 'BMW' },
    { id: 447, name: 'Audi' },
    { id: 476, name: 'Renault' },
    { id: 492, name: 'Peugeot' },
    { id: 451, name: 'Citroën' },
    { id: 491, name: 'Opel' },
    { id: 466, name: 'Mazda' },
    { id: 478, name: 'Subaru' },
    { id: 475, name: 'Suzuki' },
    { id: 445, name: 'Mitsubishi' },
    { id: 444, name: 'Lexus' },
    { id: 463, name: 'Infiniti' },
    { id: 462, name: 'Jeep' },
    { id: 450, name: 'Dodge' },
    { id: 469, name: 'Chrysler' },
    { id: 480, name: 'Volvo' },
    { id: 473, name: 'Skoda' },
    { id: 477, name: 'SEAT' },
    { id: 464, name: 'Fiat' },
    { id: 453, name: 'Alfa Romeo' },
    { id: 456, name: 'Porsche' },
    { id: 479, name: 'Tesla' },
    { id: 471, name: 'Land Rover' },
    { id: 465, name: 'Jaguar' },
    { id: 468, name: 'Mini' },
    { id: 484, name: 'Dacia' },
    { id: 459, name: 'Isuzu' },
    { id: 470, name: 'Iveco' },
  ];

  private readonly FALLBACK_MODELS: Record<number, string[]> = {
    441: ['Blazer','Camaro','Colorado','Corvette','Equinox','Impala','Malibu','Silverado','Spark','Suburban','Tahoe','Trailblazer','Traverse','Trax'],
    484: ['Duster','Jogger','Logan','Lodgy','Sandero','Spring','Stepway'],
    447: ['A1','A3','A4','A5','A6','A7','A8','Q3','Q5','Q7','Q8','R8','RS6','S3','S4','S5','TT'],
    463: ['FX35','G37','Q50','Q60','Q70','QX50','QX60','QX70','QX80'],
  };

  getAllMakes(): { id: number; name: string }[] {
    return [...this.POPULAR_MAKES].sort((a, b) => a.name.localeCompare(b.name));
  }

  searchMakes(q: string): { id: number; name: string }[] {
    const lower = q.toLowerCase();
    return this.POPULAR_MAKES
      .filter(m => m.name.toLowerCase().includes(lower))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getModelsByMakeId(makeId: number): Promise<{ id: number; name: string }[]> {
    try {
      const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeId/${makeId}?format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !contentType.includes('application/json')) {
        return this.getFallbackModels(makeId);
      }
      const json = (await res.json()) as { Results: NhtsaModel[] };
      if (!Array.isArray(json?.Results) || json.Results.length === 0) {
        return this.getFallbackModels(makeId);
      }
      return json.Results
        .map(m => ({ id: m.Model_ID, name: m.Model_Name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      this.logger.error(`Failed to fetch models for makeId=${makeId}`, err);
      return this.getFallbackModels(makeId);
    }
  }

  private getFallbackModels(makeId: number): { id: number; name: string }[] {
    const names = this.FALLBACK_MODELS[makeId];
    if (!names) return [];
    return names
      .map((name, i) => ({ id: makeId * 1000 + i, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}