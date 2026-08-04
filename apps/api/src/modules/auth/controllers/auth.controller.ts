import { Controller, Get } from '@nestjs/common';
import { JwtService } from '../services/jwt.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly jwtService: JwtService) {}

  @Get('test-token')
  async testToken() {
    const token = await this.jwtService.generateAccessToken({
      sub: '123',
      email: 'demo@example.com',
    });

    return {
      token,
    };
  }
}
