import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { HelpCenterService } from './help-center.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entites/user.entity';

// ── Public / Driver endpoints ──
@Controller('help-center')
@UseGuards(AuthGuard('jwt'))
export class HelpCenterPublicController {
  constructor(private readonly svc: HelpCenterService) {}

  @Get()
  getArticles(@Query('lang') lang: string = 'en') {
    return this.svc.getArticles(lang);
  }

  @Get('categories')
  getCategories(@Query('lang') lang: string = 'en') {
    return this.svc.getCategories(lang);
  }
}

// ── Admin endpoints ──
@Controller('admin/help-center')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class HelpCenterAdminController {
  constructor(private readonly svc: HelpCenterService) {}

  @Get()
  listAll() {
    return this.svc.adminListAll();
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.adminGetOne(id);
  }

  @Post()
  create(@Body() dto: CreateArticleDto) {
    return this.svc.createArticle(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateArticleDto) {
    return this.svc.updateArticle(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteArticle(id);
  }
}
