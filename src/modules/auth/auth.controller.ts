import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { CreateUserDto } from './dto/create-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import {
  AuthResponse,
  AuthService,
  ForgotPasswordResponse,
  PublicRole,
  PublicUser,
} from './auth.service';
import { AuthUser } from './interfaces/auth-user.interface';
import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { GoogleProfileResult } from './strategies/google.strategy';
// import { Roles } from './decorators/roles.decorator';
// import { SYSTEM_ROLES } from './constants/system-roles.constant';

interface RequestWithUser extends Request {
  user: AuthUser;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() registerDto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(registerDto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('login')
  login(@Body() loginDto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponse> {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Post('reset-password')
  resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Get('profile')
  profile(@Req() request: RequestWithUser): Promise<PublicUser> {
    return this.authService.getProfile(request.user);
  }

  @Get('roles')
  roles(): Promise<PublicRole[]> {
    return this.authService.getRoles();
  }

  // @Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
  @Public() // Temporalmente público para permitir la creación de usuarios sin autenticación
  @Post('users')
  createUser(@Body() createUserDto: CreateUserDto): Promise<PublicUser> {
    return this.authService.createUser(createUserDto);
  }

  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google')
  googleAuth(): void {
    // El guard redirige a Google; no se ejecuta cuerpo.
  }

  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  async googleCallback(
    @Req() request: Request & { user: GoogleProfileResult },
    @Res() response: Response,
  ): Promise<void> {
    const { accessToken } = await this.authService.googleLogin(request.user);
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    response.redirect(`${frontend}/auth/google/callback?token=${accessToken}`);
  }
}
