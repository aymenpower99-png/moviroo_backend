import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClassesService } from './classes.service';

@Controller('classes')
@UseGuards(AuthGuard('jwt'))
export class PublicClassesController {
  constructor(private readonly classesService: ClassesService) {}

  // ── GET /classes/:id/public ─────────────────────────────────────────────────
  // Public endpoint for vehicle class details (accessible to authenticated users)
  // Returns class with features for frontend vehicle selection
  @Get(':id/public')
  findOnePublic(@Param('id', ParseUUIDPipe) id: string) {
    return this.classesService.findOnePublic(id);
  }
}
