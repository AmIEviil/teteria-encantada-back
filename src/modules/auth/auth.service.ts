import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  DEFAULT_SYSTEM_ROLES,
  SYSTEM_ROLES,
  type SystemRoleName,
} from './constants/system-roles.constant';
import { CreateUserDto } from './dto/create-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { AuthUser } from './interfaces/auth-user.interface';

export interface PublicRole {
  id: string;
  name: string;
}

export interface PublicUser {
  id: string;
  username: string | null;
  first_name: string;
  last_name: string | null;
  email: string;
  isActive: boolean;
  role: PublicRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

export interface ForgotPasswordResponse {
  message: string;
  resetToken?: string;
  expiresAt?: Date;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly saltRounds = 10;
  private readonly resetPasswordDurationMs = 1000 * 60 * 30;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultRoles();
    await this.bootstrapSuperAdmin();
  }

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const roleName = registerDto.roleName ?? SYSTEM_ROLES.TECNICO;
    const user = await this.createAndPersistUser(registerDto, roleName);
    return this.buildAuthResponse(user);
  }

  async createUser(createUserDto: CreateUserDto): Promise<PublicUser> {
    const roleName =
      (createUserDto.roleName as SystemRoleName | undefined) ??
      SYSTEM_ROLES.CLIENTE;

    const user = await this.createAndPersistUser(createUserDto, roleName);
    return this.toPublicUser(user);
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const username = this.normalizeUsername(loginDto.username);

    const user = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('LOWER(user.username) = LOWER(:username)', { username })
      .getOne();

    if (!user?.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.buildAuthResponse(user);
  }

  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponse> {
    const email = this.normalizeEmail(forgotPasswordDto.email);

    const user = await this.userRepository.findOneBy({ email });

    if (!user?.isActive) {
      return {
        message:
          'Si el correo está registrado, recibirás instrucciones para restablecer la contraseña.',
      };
    }

    const resetToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.resetPasswordDurationMs);

    user.resetPasswordTokenHash = this.hashResetToken(resetToken);
    user.resetPasswordExpiresAt = expiresAt;

    await this.userRepository.save(user);

    return {
      message:
        'Token de recuperación generado. En producción este token debe enviarse por correo.',
      resetToken,
      expiresAt,
    };
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    if (resetPasswordDto.newPassword !== resetPasswordDto.confirmPassword) {
      throw new BadRequestException(
        'La confirmación no coincide con la nueva contraseña',
      );
    }

    const tokenHash = this.hashResetToken(resetPasswordDto.token);

    const user = await this.userRepository.findOne({
      where: { resetPasswordTokenHash: tokenHash },
      relations: { role: true },
    });

    if (!user?.resetPasswordExpiresAt) {
      throw new BadRequestException('El token de recuperación no es válido');
    }

    if (user.resetPasswordExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('El token de recuperación ha expirado');
    }

    user.passwordHash = await bcrypt.hash(
      resetPasswordDto.newPassword,
      this.saltRounds,
    );
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;

    await this.userRepository.save(user);

    return { message: 'Contraseña actualizada correctamente' };
  }

  async getProfile(authUser: AuthUser): Promise<PublicUser> {
    const user = await this.userRepository.findOne({
      where: { id: authUser.userId },
      relations: { role: true },
    });

    if (!user?.isActive) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.toPublicUser(user);
  }

  async getRoles(): Promise<PublicRole[]> {
    const roles = await this.roleRepository.find({ order: { name: 'ASC' } });
    return roles.map((role) => ({ id: role.id, name: role.name }));
  }

  private async createAndPersistUser(
    payload: RegisterDto,
    roleName: string,
  ): Promise<User> {
    const email = this.normalizeEmail(payload.email);
    const username = this.normalizeUsername(payload.username);

    const existingUserByEmail = await this.userRepository.findOneBy({ email });

    if (existingUserByEmail) {
      throw new ConflictException(
        'Ya existe un usuario registrado con ese correo',
      );
    }

    const existingUserByUsername = await this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:username)', { username })
      .getOne();

    if (existingUserByUsername) {
      throw new ConflictException('Ese nombre de usuario ya está en uso');
    }

    const role = await this.resolveRoleByName(roleName);

    const user = this.userRepository.create({
      username,
      first_name: payload.first_name.trim(),
      last_name: payload.last_name?.trim() || null,
      email,
      passwordHash: await bcrypt.hash(payload.password, this.saltRounds),
      role,
      roleId: role.id,
      isActive: true,
      resetPasswordTokenHash: null,
      resetPasswordExpiresAt: null,
    });

    return this.userRepository.save(user);
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      isActive: user.isActive,
      role: {
        id: user.role.id,
        name: user.role.name,
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async buildAuthResponse(user: User): Promise<AuthResponse> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role.name,
    });

    return {
      accessToken,
      user: this.toPublicUser(user),
    };
  }

  private hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeUsername(username: string): string {
    return username.trim().toLowerCase();
  }

  private async resolveRoleByName(roleName: string): Promise<Role> {
    const resolvedRole = await this.roleRepository
      .createQueryBuilder('role')
      .where('LOWER(role.name) = LOWER(:roleName)', { roleName })
      .getOne();

    if (!resolvedRole?.isActive) {
      throw new NotFoundException(
        `El rol ${roleName} no existe o no está activo`,
      );
    }

    return resolvedRole;
  }

  private async seedDefaultRoles(): Promise<void> {
    const existingRoles = await this.roleRepository.find();
    const existingNames = new Set(existingRoles.map((role) => role.name));

    const missingRoles = DEFAULT_SYSTEM_ROLES.filter(
      (roleName) => !existingNames.has(roleName),
    );

    if (missingRoles.length === 0) {
      return;
    }

    await this.roleRepository.save(
      missingRoles.map((roleName) =>
        this.roleRepository.create({
          name: roleName,
          description: `Rol del sistema: ${roleName}`,
          isActive: true,
        }),
      ),
    );
  }

  private async bootstrapSuperAdmin(): Promise<void> {
    const email = process.env.AUTH_SEED_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.AUTH_SEED_ADMIN_PASSWORD?.trim();
    const usernameFromEnv = process.env.AUTH_SEED_ADMIN_USERNAME?.trim();

    if (!email || !password) {
      return;
    }

    const username = this.normalizeUsername(
      usernameFromEnv && usernameFromEnv.length > 0
        ? usernameFromEnv
        : email.split('@')[0],
    );

    const existingAdmin = await this.userRepository.findOneBy({ email });

    if (existingAdmin) {
      return;
    }

    await this.createAndPersistUser(
      {
        username,
        first_name: process.env.AUTH_SEED_ADMIN_FIRST_NAME ?? 'Super',
        last_name: process.env.AUTH_SEED_ADMIN_LAST_NAME ?? 'Admin',
        email,
        password,
      },
      SYSTEM_ROLES.SUPERADMIN,
    );
  }
}
