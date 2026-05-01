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
import { AuthService } from './auth.service';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  DeleteAccountDto,
  LoginDto,
  SignupDto,
} from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Patch('email')
  @UseGuards(JwtAuthGuard)
  changeEmail(@Req() req: any, @Body() dto: ChangeEmailDto) {
    return this.auth.changeEmail(req.user.userId, dto);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.userId, dto);
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  deleteAccount(@Req() req: any, @Body() dto: DeleteAccountDto) {
    return this.auth.deleteAccount(req.user.userId, dto);
  }

  @Post('sign-out-everywhere')
  @UseGuards(JwtAuthGuard)
  signOutEverywhere(@Req() req: any) {
    return this.auth.signOutEverywhere(req.user.userId);
  }
}
