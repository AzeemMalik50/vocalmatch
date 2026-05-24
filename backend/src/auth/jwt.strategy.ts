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
      // Accept the token from either the Authorization header (normal REST
      // clients) or a `?token=` query parameter (EventSource can't set
      // headers, so SSE clients pass it in the URL). Passport tries each
      // extractor in order and uses the first one that returns a value.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET ||
        '3zgdkjxV2Rz5egsadptUok25RQ1chrBuukzg0EWpUQNAekWxDU2gWP',
    });
  }
  async validate(payload: JwtPayload) {
    const user = await this.auth.validateTokenPayload(payload.sub, payload.tv);
    if (!user) throw new UnauthorizedException('Session expired');
    // Expose isAdmin too so routes that need a cheap admin check (e.g. the
    // SSE vote-gate) don't have to round-trip the DB. AdminGuard still
    // re-checks freshly for mutation endpoints — defense in depth.
    return {
      userId: user.id,
      username: user.username,
      isAdmin: !!user.isAdmin,
    };
  }
}
