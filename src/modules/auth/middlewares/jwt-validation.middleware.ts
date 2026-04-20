import {
  Injectable,
  Logger,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { NextFunction, Request, Response } from 'express';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

type RequestWithUser = Request & {
  user?: {
    id: string;
    email: string;
    username: string | null;
    isActive: boolean;
    first_name: string;
    last_name: string | null;
    role: string | null;
  };
};

interface JwtPayload {
  sub?: string;
  id?: string;
  email?: string;
  username?: string | null;
  role?: string;
}

@Injectable()
export class JwtValidationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(JwtValidationMiddleware.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const routePath = this.normalizePath(req.originalUrl);
    const clientIp =
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown';

    this.logger.log(`[${req.method}] ${routePath} - IP: ${clientIp}`);

    if (req.method === 'OPTIONS') {
      next();
      return;
    }

    if (this.isPublicRoute(routePath) || this.isSystemRoute(routePath)) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'No token provided',
        error: 'Unauthorized',
      });
    }

    const token = authHeader.slice(7);

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      });

      const userIdentifier =
        payload.username?.trim().toLowerCase() ||
        payload.email?.trim().toLowerCase();

      if (!userIdentifier) {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'Invalid token payload',
          error: 'Unauthorized',
        });
      }

      const user = payload.username
        ? await this.userRepository
            .createQueryBuilder('user')
            .leftJoinAndSelect('user.role', 'role')
            .where('LOWER(user.username) = LOWER(:username)', {
              username: payload.username.trim(),
            })
            .getOne()
        : await this.userRepository
            .createQueryBuilder('user')
            .leftJoinAndSelect('user.role', 'role')
            .where('LOWER(user.email) = LOWER(:email)', {
              email: payload.email?.trim() ?? '',
            })
            .getOne();

      if (!user) {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'User not found',
          error: 'Unauthorized',
        });
      }

      if (!user.isActive) {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'User account is not active',
          error: 'Unauthorized',
        });
      }

      const request = req as RequestWithUser;
      request.user = {
        id: user.id,
        email: user.email,
        username: user.username,
        isActive: user.isActive,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role?.name ?? null,
      };

      next();
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid or expired token',
        error: 'Unauthorized',
      });
    }
  }

  private normalizePath(path: string): string {
    const withoutQuery = path.split('?')[0] || '/';
    const trimmed = withoutQuery.replace(/\/+$/, '') || '/';
    return trimmed;
  }

  private isPublicRoute(path: string): boolean {
    const publicRoutes = [
      '/auth/login',
      '/auth/register',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/roles',
      '/public/menu',
      '/public/tables',
      '/public/reservations',
      '/public/reservations/schedule',
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
      '/api/auth/roles',
      '/api/public/menu',
      '/api/public/tables',
      '/api/public/reservations',
      '/api/public/reservations/schedule',
      '/',
    ];

    return publicRoutes.some((route) => this.matchRoute(path, route));
  }

  private isSystemRoute(path: string): boolean {
    const systemRoutes = ['/health', '/status', '/favicon.ico'];
    return systemRoutes.some((route) => this.matchRoute(path, route));
  }

  private matchRoute(path: string, route: string): boolean {
    const normalizedPath = this.normalizePath(path);
    const normalizedRoute = this.normalizePath(route);

    if (normalizedPath === normalizedRoute) {
      return true;
    }

    const routeRegex = new RegExp(
      `^${normalizedRoute.replace(/:[^/]+/g, '[^/]+')}(?:/)?$`,
    );

    return routeRegex.test(normalizedPath);
  }
}
