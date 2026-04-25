import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entites/user.entity';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'classes');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  // ── POST /admin/classes/upload-image ─────────────────────────────────────
  @Post('upload-image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}${extname(file.originalname)}`;
          cb(null, unique);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new BadRequestException('Only image files are allowed'), false);
      },
    }),
  )
  uploadImage(@UploadedFile() file: { filename: string }) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return { url: `/uploads/classes/${file.filename}` };
  }

  // ── POST /admin/classes ───────────────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateClassDto) {
    return this.classesService.create(dto);
  }

  // ── GET /admin/classes ────────────────────────────────────────────────────
  // Returns all classes WITH vehicleCount
  @Get()
  findAll() {
    return this.classesService.findAll();
  }

  // ── GET /admin/classes/active-multipliers ─────────────────────────────────
  // Returns active classes with multipliers for ML pricing
  // Must be BEFORE :id to avoid route conflict
  @Get('active-multipliers')
  getActiveClassesWithMultipliers() {
    return this.classesService.getActiveClassesWithMultipliers();
  }

  // ── GET /admin/classes/:id/detail ─────────────────────────────────────────
  // Must be BEFORE :id to avoid route conflict
  @Get(':id/detail')
  findOneWithVehicles(@Param('id', ParseUUIDPipe) id: string) {
    return this.classesService.findOneWithVehicles(id);
  }

  // ── GET /admin/classes/:id/features ──────────────────────────────────────
  @Get(':id/features')
  getFeatures(@Param('id', ParseUUIDPipe) id: string) {
    return this.classesService.getFeatures(id);
  }

  // ── GET /admin/classes/:id ────────────────────────────────────────────────
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.classesService.findOne(id);
  }

  // ── PATCH /admin/classes/:id ──────────────────────────────────────────────
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClassDto) {
    return this.classesService.update(id, dto);
  }

  // ── DELETE /admin/classes/:id ─────────────────────────────────────────────
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.classesService.remove(id);
  }
}
