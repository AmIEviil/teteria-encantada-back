import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../interfaces/auth-user.interface';

interface JwtPayload {
  sub: string;
  username?: string | null;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    });
  }

  validate(payload: JwtPayload): AuthUser {
    return {
      userId: payload.sub,
      username: payload.username ?? null,
      email: payload.email,
      role: payload.role,
    };
  }
}
