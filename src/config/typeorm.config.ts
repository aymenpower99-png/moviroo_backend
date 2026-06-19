import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

function buildOptions(): DataSourceOptions {
  const isProd = process.env.NODE_ENV === 'production';

  if (process.env.DATABASE_URL) {
    return {
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: ['src/**/*.entity.ts'],
      migrations: ['src/migrations/*.ts'],
      synchronize: false,
      logging: false,
      ssl: isProd ? { rejectUnauthorized: false } : false,
    } as DataSourceOptions;
  }

  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'moviroo',
    entities: ['src/**/*.entity.ts'],
    migrations: ['src/migrations/*.ts'],
    synchronize: false,
    logging: false,
  };
}

export const dataSourceOptions = buildOptions();

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
