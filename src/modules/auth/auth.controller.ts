import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { SYSTEM_ROLES } from './constants/system-roles.constant';
import { CreateUserDto } from './dto/create-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import {
  AuthResponse,
  AuthService,
  ForgotPasswordResponse,
  PublicRole,
  PublicUser,
} from './auth.service';
import { AuthUser } from './interfaces/auth-user.interface';

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

  @Public()
  @Get('roles')
  roles(): Promise<PublicRole[]> {
    return this.authService.getRoles();
  }

  @Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
  @Post('users')
  createUser(@Body() createUserDto: CreateUserDto): Promise<PublicUser> {
    return this.authService.createUser(createUserDto);
  }
}
