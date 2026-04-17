import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HelpArticle } from './entities/help-article.entity';
import { HelpCenterService } from './help-center.service';
import { HelpCenterPublicController, HelpCenterAdminController } from './help-center.controller';

@Module({
  imports: [TypeOrmModule.forFeature([HelpArticle])],
  controllers: [HelpCenterPublicController, HelpCenterAdminController],
  providers: [HelpCenterService],
})
export class HelpCenterModule {}
