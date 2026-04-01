import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { Vehicle, VehicleStatus, VehicleType } from './entities/vehicle.entity';
import { CreateVehicleDto } from './dto/create-vehicle.dto';

// ─── Mock factory ─────────────────────────────────────────────────────────────
// Use 'as unknown as Vehicle' to bypass strict structural typing on the mock.
// TypeORM entities are never constructed via new(), so a plain object is correct here.

const mockVehicle = (overrides: Partial<Record<string, unknown>> = {}): Vehicle => ({
  id:                       'uuid-1',
  make:                     'Toyota',
  model:                    'Camry',
  year:                     2022,
  color:                    null,
  seats:                    null,
  driverId:                 null,
  agencyId:                 null,
  licensePlate:             null,
  vin:                      null,
  vehicleType:              VehicleType.STANDARD,
  photos:                   null,
  status:                   VehicleStatus.PENDING,
  isActive:                 true,
  verifiedAt:               null,
  createdAt:                new Date('2024-01-01'),
  updatedAt:                new Date('2024-01-01'),
  deletedAt:                null,
  registrationDocumentUrl:  null,
  registrationExpiry:       null,
  insuranceDocumentUrl:     null,
  insuranceExpiry:          null,
  technicalControlUrl:      null,
  technicalControlExpiry:   null,
  ...overrides,
} as unknown as Vehicle);

// ─── Mock Repository ──────────────────────────────────────────────────────────

interface MockRepo {
  findOne:      ReturnType<typeof jest.fn>;
  findAndCount: ReturnType<typeof jest.fn>;
  create:       ReturnType<typeof jest.fn>;
  save:         ReturnType<typeof jest.fn>;
  softDelete:   ReturnType<typeof jest.fn>;
}

const createMockRepo = (): MockRepo => ({
  findOne:      jest.fn(),
  findAndCount: jest.fn(),
  create:       jest.fn(),
  save:         jest.fn(),
  softDelete:   jest.fn(),
});

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('VehiclesService – Workflow', () => {
  let service: VehiclesService;
  let repo: MockRepo;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        {
          provide: getRepositoryToken(Vehicle),
          useValue: createMockRepo(),
        },
      ],
    }).compile();

    service = module.get<VehiclesService>(VehiclesService);
    repo    = module.get<MockRepo>(getRepositoryToken(Vehicle));
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Step 1: Create ───────────────────────────────────────────────────────

  describe('create()', () => {
    const baseDto: CreateVehicleDto = { make: 'Toyota', model: 'Camry', year: 2022 };

    it('status = Pending when no photos and no driver', async () => {
      repo.findOne.mockResolvedValue(null);
      const created = mockVehicle({ status: VehicleStatus.PENDING });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.create(baseDto);
      expect(result.status).toBe(VehicleStatus.PENDING);
    });

    it('status = Pending when photos present but no driver', async () => {
      repo.findOne.mockResolvedValue(null);
      const dto = { ...baseDto, photos: ['http://photo.jpg'] };
      const created = mockVehicle({ status: VehicleStatus.PENDING, photos: dto.photos });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.create(dto);
      expect(result.status).toBe(VehicleStatus.PENDING);
    });

    it('status = Pending when driver present but no photos', async () => {
      repo.findOne.mockResolvedValue(null);
      const dto = { ...baseDto, driverId: 'driver-uuid' };
      const created = mockVehicle({ status: VehicleStatus.PENDING, driverId: dto.driverId });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.create(dto);
      expect(result.status).toBe(VehicleStatus.PENDING);
    });

    it('status = Available when both photos AND driver provided', async () => {
      repo.findOne.mockResolvedValue(null);
      const dto = { ...baseDto, photos: ['http://photo.jpg'], driverId: 'driver-uuid' };
      const created = mockVehicle({
        status:   VehicleStatus.AVAILABLE,
        photos:   dto.photos,
        driverId: dto.driverId,
      });
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.create(dto);
      expect(result.status).toBe(VehicleStatus.AVAILABLE);
    });

    it('throws BadRequestException if license plate already registered', async () => {
      repo.findOne.mockResolvedValue(mockVehicle({ licensePlate: 'ABC-123' }));
      const dto = { ...baseDto, licensePlate: 'ABC-123' };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Step 3: setOnTrip ───────────────────────────────────────────────────

  describe('setOnTrip()', () => {
    it('Available → On_Trip', async () => {
      const vehicle = mockVehicle({ status: VehicleStatus.AVAILABLE });
      repo.findOne.mockResolvedValue(vehicle);
      repo.save.mockImplementation((v: unknown) =>
        Promise.resolve({ ...(v as object), status: VehicleStatus.ON_TRIP }),
      );

      const result = await service.setOnTrip('uuid-1');
      expect(result.status).toBe(VehicleStatus.ON_TRIP);
    });

    it('throws if not Available (Pending)', async () => {
      repo.findOne.mockResolvedValue(mockVehicle({ status: VehicleStatus.PENDING }));
      await expect(service.setOnTrip('uuid-1')).rejects.toThrow(BadRequestException);
    });

    it('throws if already On_Trip', async () => {
      repo.findOne.mockResolvedValue(mockVehicle({ status: VehicleStatus.ON_TRIP }));
      await expect(service.setOnTrip('uuid-1')).rejects.toThrow(BadRequestException);
    });

    it('throws if Maintenance', async () => {
      repo.findOne.mockResolvedValue(mockVehicle({ status: VehicleStatus.MAINTENANCE }));
      await expect(service.setOnTrip('uuid-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Step 4: endTrip ─────────────────────────────────────────────────────

  describe('endTrip()', () => {
    it('On_Trip → Available', async () => {
      const vehicle = mockVehicle({ status: VehicleStatus.ON_TRIP });
      repo.findOne.mockResolvedValue(vehicle);
      repo.save.mockImplementation((v: unknown) =>
        Promise.resolve({ ...(v as object), status: VehicleStatus.AVAILABLE }),
      );

      const result = await service.endTrip('uuid-1');
      expect(result.status).toBe(VehicleStatus.AVAILABLE);
    });

    it('throws if not On_Trip', async () => {
      repo.findOne.mockResolvedValue(mockVehicle({ status: VehicleStatus.AVAILABLE }));
      await expect(service.endTrip('uuid-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Step 5: setMaintenance ───────────────────────────────────────────────

  describe('setMaintenance()', () => {
    it('Available → Maintenance and driverId becomes null', async () => {
      const vehicle = mockVehicle({ status: VehicleStatus.AVAILABLE, driverId: 'drv-1' });
      repo.findOne.mockResolvedValue(vehicle);
      repo.save.mockImplementation((v: unknown) => Promise.resolve(v));

      const result = await service.setMaintenance('uuid-1');
      expect(result.status).toBe(VehicleStatus.MAINTENANCE);
      expect(result.driverId).toBeNull();
    });

    it('On_Trip → Maintenance and driverId becomes null', async () => {
      const vehicle = mockVehicle({ status: VehicleStatus.ON_TRIP, driverId: 'drv-1' });
      repo.findOne.mockResolvedValue(vehicle);
      repo.save.mockImplementation((v: unknown) => Promise.resolve(v));

      const result = await service.setMaintenance('uuid-1');
      expect(result.status).toBe(VehicleStatus.MAINTENANCE);
      expect(result.driverId).toBeNull();
    });

    it('Pending → Maintenance and driverId becomes null', async () => {
      const vehicle = mockVehicle({ status: VehicleStatus.PENDING, driverId: 'drv-1' });
      repo.findOne.mockResolvedValue(vehicle);
      repo.save.mockImplementation((v: unknown) => Promise.resolve(v));

      const result = await service.setMaintenance('uuid-1');
      expect(result.status).toBe(VehicleStatus.MAINTENANCE);
      expect(result.driverId).toBeNull();
    });

    it('throws if already Maintenance', async () => {
      repo.findOne.mockResolvedValue(mockVehicle({ status: VehicleStatus.MAINTENANCE }));
      await expect(service.setMaintenance('uuid-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Step 6: completeMaintenance ─────────────────────────────────────────

  describe('completeMaintenance()', () => {
    it('Maintenance → Available', async () => {
      const vehicle = mockVehicle({ status: VehicleStatus.MAINTENANCE });
      repo.findOne.mockResolvedValue(vehicle);
      repo.save.mockImplementation((v: unknown) => Promise.resolve(v));

      const result = await service.completeMaintenance('uuid-1');
      expect(result.status).toBe(VehicleStatus.AVAILABLE);
    });

    it('throws if not Maintenance', async () => {
      repo.findOne.mockResolvedValue(mockVehicle({ status: VehicleStatus.AVAILABLE }));
      await expect(service.completeMaintenance('uuid-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── assignDriver ─────────────────────────────────────────────────────────

  describe('assignDriver()', () => {
    it('assigns driver + Pending → Available when photos exist', async () => {
      const vehicle = mockVehicle({
        status:   VehicleStatus.PENDING,
        photos:   ['http://photo.jpg'],
        driverId: null,
      });
      repo.findOne.mockResolvedValue(vehicle);
      repo.save.mockImplementation((v: unknown) => Promise.resolve(v));

      const result = await service.assignDriver('uuid-1', 'new-driver');
      expect(result.driverId).toBe('new-driver');
      expect(result.status).toBe(VehicleStatus.AVAILABLE);
    });

    it('assigns driver but stays Pending when no photos', async () => {
      const vehicle = mockVehicle({
        status:   VehicleStatus.PENDING,
        photos:   null,
        driverId: null,
      });
      repo.findOne.mockResolvedValue(vehicle);
      repo.save.mockImplementation((v: unknown) => Promise.resolve(v));

      const result = await service.assignDriver('uuid-1', 'new-driver');
      expect(result.driverId).toBe('new-driver');
      expect(result.status).toBe(VehicleStatus.PENDING);
    });

    it('throws if vehicle is On_Trip', async () => {
      repo.findOne.mockResolvedValue(mockVehicle({ status: VehicleStatus.ON_TRIP }));
      await expect(service.assignDriver('uuid-1', 'drv')).rejects.toThrow(BadRequestException);
    });

    it('throws if vehicle is Maintenance', async () => {
      repo.findOne.mockResolvedValue(mockVehicle({ status: VehicleStatus.MAINTENANCE }));
      await expect(service.assignDriver('uuid-1', 'drv')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('throws NotFoundException for unknown id', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('returns vehicle when found', async () => {
      const vehicle = mockVehicle();
      repo.findOne.mockResolvedValue(vehicle);
      const result = await service.findOne('uuid-1');
      expect(result.id).toBe('uuid-1');
    });
  });
});