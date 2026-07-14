import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { AuthProvider, User } from '../auth/entities/user.entity';
import { Role } from '../auth/entities/role.entity';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AddWhitelistDto } from './dto/add-whitelist.dto';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';
import { FindEmpleadoUsersDto } from './dto/find-empleado-users.dto';
import { UpdateTrabajadorDto } from './dto/update-trabajador.dto';
import { Trabajador } from './entities/trabajador.entity';

export interface PublicTrabajador {
  id: string;
  userId: string;
  rut: string;
  telefono: string;
  comuna: string | null;
  direccion: string | null;
  fechaNacimiento: string | null;
  edad: number | null;
  sueldo: number | null;
  fotoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicEmpleadoUser {
  id: string;
  username: string | null;
  first_name: string;
  last_name: string | null;
  email: string;
  isActive: boolean;
  role: {
    id: string;
    name: string;
  };
  createdAt: Date;
  updatedAt: Date;
  trabajador: PublicTrabajador | null;
}

export interface EmpleadoUsersPagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface EmpleadoUsersResponse {
  items: PublicEmpleadoUser[];
  pagination: EmpleadoUsersPagination;
}

@Injectable()
export class TrabajadoresService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Trabajador)
    private readonly trabajadorRepository: Repository<Trabajador>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async findUsers(
    filters: FindEmpleadoUsersDto,
  ): Promise<EmpleadoUsersResponse> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .orderBy('user.createdAt', 'DESC');

    if (filters.firstName?.trim()) {
      queryBuilder.andWhere('LOWER(user.first_name) LIKE LOWER(:firstName)', {
        firstName: `%${filters.firstName.trim()}%`,
      });
    }

    if (filters.lastName?.trim()) {
      queryBuilder.andWhere(
        "LOWER(COALESCE(user.last_name, '')) LIKE LOWER(:lastName)",
        {
          lastName: `%${filters.lastName.trim()}%`,
        },
      );
    }

    if (filters.createdFrom?.trim()) {
      queryBuilder.andWhere('user.createdAt >= :createdFrom', {
        createdFrom: filters.createdFrom,
      });
    }

    if (filters.createdTo?.trim()) {
      queryBuilder.andWhere('user.createdAt <= :createdTo', {
        createdTo: `${filters.createdTo}T23:59:59.999Z`,
      });
    }

    if (filters.onlyStaff) {
      queryBuilder.andWhere('role.name != :clienteRole', {
        clienteRole: SYSTEM_ROLES.CLIENTE,
      });
    }

    const [users, totalItems] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const userIds = users.map((user) => user.id);
    const trabajadores =
      userIds.length > 0
        ? await this.trabajadorRepository.find({
            where: { userId: In(userIds) },
          })
        : [];

    const trabajadorByUserId = new Map(
      trabajadores.map((trabajador) => [trabajador.userId, trabajador]),
    );

    return {
      items: users.map((user) =>
        this.toPublicEmpleadoUser(user, trabajadorByUserId.get(user.id)),
      ),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      },
    };
  }

  async create(
    createTrabajadorDto: CreateTrabajadorDto,
  ): Promise<PublicTrabajador> {
    const user = await this.userRepository.findOne({
      where: { id: createTrabajadorDto.userId },
      relations: { role: true },
    });

    if (!user) {
      throw new NotFoundException('El usuario seleccionado no existe');
    }

    const existingTrabajador = await this.trabajadorRepository.findOne({
      where: { userId: createTrabajadorDto.userId },
      relations: { user: true },
    });

    if (existingTrabajador) {
      throw new ConflictException(
        'Ese usuario ya tiene un trabajador asociado',
      );
    }

    const rutExists = await this.trabajadorRepository.findOneBy({
      rut: createTrabajadorDto.rut.trim(),
    });

    if (rutExists) {
      throw new ConflictException('Ya existe un trabajador con ese RUT');
    }

    const trabajador = this.trabajadorRepository.create({
      userId: createTrabajadorDto.userId,
      rut: createTrabajadorDto.rut.trim(),
      telefono: createTrabajadorDto.telefono.trim(),
      comuna: createTrabajadorDto.comuna?.trim() || null,
      direccion: createTrabajadorDto.direccion?.trim() || null,
      fechaNacimiento: createTrabajadorDto.fechaNacimiento ?? null,
      edad: createTrabajadorDto.edad ?? null,
      sueldo: createTrabajadorDto.sueldo ?? null,
      fotoUrl: createTrabajadorDto.fotoUrl?.trim() || null,
    });

    const savedTrabajador = await this.trabajadorRepository.save(trabajador);

    return this.findOne(savedTrabajador.id);
  }

  async findOne(id: string): Promise<PublicTrabajador> {
    const trabajador = await this.trabajadorRepository.findOne({
      where: { id },
      relations: { user: { role: true } },
    });

    if (!trabajador) {
      throw new NotFoundException('Trabajador no encontrado');
    }

    return this.toPublicTrabajador(trabajador);
  }

  async update(
    id: string,
    updateTrabajadorDto: UpdateTrabajadorDto,
  ): Promise<PublicTrabajador> {
    const trabajador = await this.trabajadorRepository.findOne({
      where: { id },
      relations: { user: { role: true } },
    });

    if (!trabajador) {
      throw new NotFoundException('Trabajador no encontrado');
    }

    if (updateTrabajadorDto.rut) {
      const rutExists = await this.trabajadorRepository.findOne({
        where: { rut: updateTrabajadorDto.rut.trim() },
      });

      if (rutExists && rutExists.id !== trabajador.id) {
        throw new ConflictException('Ya existe un trabajador con ese RUT');
      }
    }

    Object.assign(trabajador, {
      rut: updateTrabajadorDto.rut?.trim() ?? trabajador.rut,
      comuna: updateTrabajadorDto.comuna?.trim() ?? trabajador.comuna,
      direccion: updateTrabajadorDto.direccion?.trim() ?? trabajador.direccion,
      telefono: updateTrabajadorDto.telefono?.trim() ?? trabajador.telefono,
      fechaNacimiento:
        updateTrabajadorDto.fechaNacimiento ?? trabajador.fechaNacimiento,
      edad: updateTrabajadorDto.edad ?? trabajador.edad,
      sueldo: updateTrabajadorDto.sueldo ?? trabajador.sueldo,
      fotoUrl: updateTrabajadorDto.fotoUrl?.trim() ?? trabajador.fotoUrl,
    });

    const savedTrabajador = await this.trabajadorRepository.save(trabajador);

    return this.toPublicTrabajador(savedTrabajador);
  }

  async addToWhitelist(
    authUser: AuthUser,
    dto: AddWhitelistDto,
  ): Promise<PublicEmpleadoUser> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.userRepository.findOneBy({ email });

    if (existing) {
      throw new ConflictException(
        'Ya existe un usuario registrado con ese correo',
      );
    }

    const role = await this.roleRepository
      .createQueryBuilder('role')
      .where('LOWER(role.name) = LOWER(:roleName)', { roleName: dto.roleName })
      .getOne();

    if (!role?.isActive) {
      throw new NotFoundException(
        `El rol ${dto.roleName} no existe o no está activo`,
      );
    }

    if (
      role.name === SYSTEM_ROLES.SUPERADMIN &&
      authUser.role !== SYSTEM_ROLES.SUPERADMIN
    ) {
      throw new ForbiddenException(
        'Solo un Superadmin puede otorgar el rol Superadmin',
      );
    }

    const user = this.userRepository.create({
      username: null,
      first_name: email.split('@')[0].slice(0, 80),
      last_name: null,
      email,
      passwordHash: null,
      provider: AuthProvider.GOOGLE,
      googleId: null,
      role,
      roleId: role.id,
      isActive: true,
      resetPasswordTokenHash: null,
      resetPasswordExpiresAt: null,
    });

    const saved = await this.userRepository.save(user);

    return this.toPublicEmpleadoUser(saved, null);
  }

  async setWhitelistActive(
    authUser: AuthUser,
    id: string,
    isActive: boolean,
  ): Promise<PublicEmpleadoUser> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { role: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (
      user.role.name === SYSTEM_ROLES.SUPERADMIN &&
      authUser.role !== SYSTEM_ROLES.SUPERADMIN
    ) {
      throw new ForbiddenException(
        'Solo un Superadmin puede modificar a otro Superadmin',
      );
    }

    if (id === authUser.userId) {
      throw new ForbiddenException('No puedes desactivar tu propia cuenta');
    }

    user.isActive = isActive;

    const saved = await this.userRepository.save(user);
    const trabajador = await this.trabajadorRepository.findOneBy({
      userId: saved.id,
    });

    return this.toPublicEmpleadoUser(saved, trabajador);
  }

  private toPublicEmpleadoUser(
    user: User,
    trabajador?: Trabajador | null,
  ): PublicEmpleadoUser {
    const hasTrabajador =
      trabajador &&
      typeof trabajador.id === 'string' &&
      trabajador.id.length > 0;

    const trabajadorPublico = hasTrabajador
      ? this.toPublicTrabajador(trabajador)
      : null;

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
      trabajador: trabajadorPublico,
    };
  }

  private toPublicTrabajador(trabajador: Trabajador): PublicTrabajador {
    return {
      id: trabajador.id,
      userId: trabajador.userId,
      rut: trabajador.rut,
      telefono: trabajador.telefono,
      comuna: trabajador.comuna,
      direccion: trabajador.direccion,
      fechaNacimiento: trabajador.fechaNacimiento,
      edad: trabajador.edad,
      sueldo: trabajador.sueldo === null ? null : Number(trabajador.sueldo),
      fotoUrl: trabajador.fotoUrl,
      createdAt: trabajador.createdAt,
      updatedAt: trabajador.updatedAt,
    };
  }
}
