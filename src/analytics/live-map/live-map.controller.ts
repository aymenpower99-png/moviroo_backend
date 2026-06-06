import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../users/entites/user.entity';
import { LiveMapService } from './live-map.service';
import { GetDriversDto } from './dto/get-drivers.dto';
import { GetRidesDto } from './dto/get-rides.dto';

@Controller('analytics/live-map')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class LiveMapController {
  constructor(private readonly liveMapService: LiveMapService) {}

  @Get('drivers')
  @Roles(UserRole.SUPER_ADMIN)
  getOnlineDrivers(@Query() dto: GetDriversDto) {
    return this.liveMapService.getOnlineDrivers(dto);
  }

  @Get('rides')
  @Roles(UserRole.SUPER_ADMIN)
  getActiveRides(@Query() dto: GetRidesDto) {
    return this.liveMapService.getActiveRides(dto);
  }

  @Get('drivers/nearby')
  @Roles(UserRole.SUPER_ADMIN)
  getNearbyDrivers(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('radius_meters') radiusMeters: number,
  ) {
    return this.liveMapService.getNearbyDrivers(lat, lng, radiusMeters);
  }

  @Get('heatmap')
  @Roles(UserRole.SUPER_ADMIN)
  getHeatmapData(
    @Query('lat_min') latMin: number,
    @Query('lat_max') latMax: number,
    @Query('lng_min') lngMin: number,
    @Query('lng_max') lngMax: number,
    @Query('grid_size') gridSize?: number,
  ) {
    return this.liveMapService.getHeatmapData(
      latMin,
      latMax,
      lngMin,
      lngMax,
      gridSize,
    );
  }
}
