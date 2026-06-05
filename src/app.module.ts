import { Module } from '@nestjs/common';
import { DashboardAnalyticsModule } from './analytics/dashboard/dashboard.module';
import { DriversAnalyticsModule } from './analytics/drivers/drivers.module';
import { DispatchAnalyticsModule } from './analytics/dispatch/dispatch.module';
import { RidesAnalyticsModule } from './analytics/rides/rides.module';
import { SupportAnalyticsModule } from './analytics/support/support.module';
import { RatingsAnalyticsModule } from './analytics/ratings/ratings.module';
import { VehiclesAnalyticsModule } from './analytics/vehicles/vehicles.module';
import { PassengersAnalyticsModule } from './analytics/passengers/passengers.module';
import { DemandAnalyticsModule } from './analytics/demand/demand.module';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import mailConfig from './config/mail.config';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { AdminModule } from './admin/admin.module';
import { ClassesModule } from './classes/classes.module'; // ← ADD
import { VehiclesModule } from './vehicles/vehicles.module';
import { DriversModule } from './driver/drivers.module';
import { SupportModule } from './support/support.module';
import { WorkAreaModule } from './work-area/work-area.module';
import { RidesModule } from './rides/rides.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { TripsModule } from './trips/trips.module';
import { BillingModule } from './billing/billing.module';
import { HelpCenterModule } from './help-center/help-center.module';
import { EarningsModule } from './earnings/earnings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatModule } from './chat/chat.module';
import { PlacesModule } from './places/places.module';
import { MembershipLevelsModule } from './membership-levels/membership-levels.module';
import { PassengersModule } from './passenger/passengers.module';
import { VoiceModule } from './voice/voice.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { PublicStatsModule } from './public-stats/public-stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, mailConfig],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 100, // 100 requests per minute globally
      },
    ]),
    DatabaseModule,
    MailModule,
    AuthModule,
    AdminModule,
    ClassesModule,
    VehiclesModule,
    DriversModule,
    SupportModule,
    WorkAreaModule,
    RidesModule,
    DispatchModule,
    TripsModule,
    BillingModule,
    HelpCenterModule,
    EarningsModule,
    NotificationsModule,
    DashboardAnalyticsModule,
    DriversAnalyticsModule,
    DispatchAnalyticsModule,
    RidesAnalyticsModule,
    SupportAnalyticsModule,
    RatingsAnalyticsModule,
    VehiclesAnalyticsModule,
    PassengersAnalyticsModule,
    DemandAnalyticsModule,
    ChatModule,
    PlacesModule,
    MembershipLevelsModule,
    PassengersModule,
    VoiceModule,
    ChatbotModule,
    PublicStatsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply global rate limiting to every route
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
