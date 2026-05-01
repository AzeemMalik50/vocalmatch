import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';

export interface JwtPayload {
  sub: string;
  username: string;
  tv?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly auth: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || '3zgdkjxV2Rz5egsadptUok25RQ1chrBuukzg0EWpUQNAekWxDU2gWP',
    });
  }
  async validate(payload: JwtPayload) {
    const user = await this.auth.validateTokenPayload(payload.sub, payload.tv);
    if (!user) throw new UnauthorizedException('Session expired');
    return { userId: user.id, username: user.username };
  }
}
