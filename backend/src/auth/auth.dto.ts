import { Equals, IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'Username can only contain letters, numbers, _ . -',
  })
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsBoolean()
  @Equals(true, { message: 'You must agree to the Terms of Service' })
  acceptedTerms: boolean;

  @IsBoolean()
  @Equals(true, { message: 'You must agree to the Privacy Policy' })
  acceptedPrivacy: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}

export class LoginDto {
  // Field name kept as `email` for API + frontend compatibility, but the
  // value can be EITHER an email address OR a username — the service
  // looks the user up by both. Validation relaxed to `@IsString` so
  // usernames (which don't pass `@IsEmail`) aren't rejected at the
  // pipe layer.
  @IsString()
  @MinLength(1)
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}

export class ChangeEmailDto {
  @IsEmail()
  newEmail: string;

  @IsString()
  currentPassword: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class DeleteAccountDto {
  @IsString()
  currentPassword: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
