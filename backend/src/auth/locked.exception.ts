import { HttpException } from '@nestjs/common';

/**
 * 423 Locked — thrown when a user account is locked out due to
 * too many failed login attempts (brute-force protection, B1).
 */
export class LockedException extends HttpException {
  constructor(message = 'Account locked. Try again later.') {
    super(message, 423);
  }
}
