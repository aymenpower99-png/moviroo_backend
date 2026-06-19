import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = process.env.NODE_ENV === 'production';
        return {
          type: 'postgres' as const,
          host: config.get<string>('database.host'),
          port: config.get<number>('database.port'),
          username: config.get<string>('database.username'),
          password: config.get<string>('database.password'),
          database: config.get<string>('database.name'),
          autoLoadEntities: true,
          synchronize: !isProd, // ← OFF in production (use migrations)
          logging: !isProd,
          ssl: isProd
            ? { rejectUnauthorized: false }
            : false,
          extra: {
            statement_cache_size: 100,
            statement_timeout: 30000,
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
