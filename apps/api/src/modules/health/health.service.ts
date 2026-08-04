import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database';
import { RedisService } from '../../infrastructure/redis';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check() {
    const services = {
      api: {
        status: 'up',
      },
      database: {
        status: 'down',
      },
      redis: {
        status: 'down',
      },
    };

    let overallStatus: 'healthy' | 'degraded' = 'healthy';

    // Database
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      services.database.status = 'up';
    } catch {
      overallStatus = 'degraded';
    }

    // Redis
    try {
      await this.redis.client.ping();
      services.redis.status = 'up';
    } catch {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services,
    };
  }
}
