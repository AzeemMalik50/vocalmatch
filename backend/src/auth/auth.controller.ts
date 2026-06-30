import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  DeleteAccountDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  SignupDto,
} from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle({
    short: { limit: 1, ttl: 10_000 },
    long: { limit: 10, ttl: 3_600_000 },
  })
  @Post('signup')
  @ApiOperation({
    summary: 'Create a new account',
    description:
      'Public signup. Returns the new user profile and a JWT in `token`. ' +
      'Username must be unique; email is normalized to lowercase.',
  })
  @ApiResponse({ status: 201, description: 'Account created -- returns `{ user, token }`.' })
  @ApiResponse({ status: 409, description: 'Email or username already taken.' })
  signup(@Req() req: any, @Body() dto: SignupDto) {
    return this.auth.signup(dto, req.ip);
  }

  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Exchange email/password for a JWT',
    description:
      'Returns `{ user, token }`. The token is the bearer credential for ' +
      'every subsequent authenticated request and the SSE `/stream` endpoint.',
  })
  @ApiResponse({ status: 200, description: 'Login OK.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  login(@Req() req: any, @Body() dto: LoginDto) {
    return this.auth.login(dto, req.ip);
  }

  @Throttle({ short: { limit: 3, ttl: 60_000 } })
  @Patch('email')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: "Change the signed-in user's email",
    description: 'Requires the current password for confirmation.',
  })
  changeEmail(@Req() req: any, @Body() dto: ChangeEmailDto) {
    return this.auth.changeEmail(req.user.userId, dto);
  }

  @Throttle({ short: { limit: 3, ttl: 60_000 } })
  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: "Change the signed-in user's password",
    description:
      'Bumps the token version so any other active sessions are invalidated ' +
      'on their next request.',
  })
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.userId, dto);
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: "Delete the signed-in user's account",
    description:
      'Hard-deletes the user record; videos are soft-deleted so historical ' +
      'battles remain auditable.',
  })
  deleteAccount(@Req() req: any, @Body() dto: DeleteAccountDto) {
    return this.auth.deleteAccount(req.user.userId, dto);
  }

  @Post('sign-out-everywhere')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: "Invalidate all of this user's active sessions",
    description:
      'Bumps the token version. All previously issued JWTs (including the ' +
      'one used to call this endpoint) stop validating on the next request.',
  })
  signOutEverywhere(@Req() req: any) {
    return this.auth.signOutEverywhere(req.user.userId);
  }

  @Throttle({
    short: { limit: 1, ttl: 60_000 },
    long: { limit: 5, ttl: 3_600_000 },
  })
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request a password-reset link',
    description:
      'Public. Always returns 200 -- does not reveal whether the email is registered. ' +
      'If the email matches a user, a reset link is sent.',
  })
  forgotPassword(@Req() req: any, @Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto, req.ip);
  }

  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reset password with a one-time token',
    description:
      'Public. Token expires 1 hour after issuance. On success the user must ' +
      'sign in with the new password -- existing sessions are invalidated.',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }
}
