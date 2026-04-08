import 'dotenv/config';
import { DataSource } from 'typeorm';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'TeteriaEncantada',
  synchronize: process.env.DB_SYNCHRONIZE !== 'false',
  extra: {
    max: 10,
    idleTimeoutMillis: 30000,
  },
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  logging: process.env.DB_LOGGING === 'true' ? ['error', 'warn'] : ['error'],
});

export default AppDataSource;
