import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';
import { FindEmpleadoUsersDto } from './dto/find-empleado-users.dto';
import { UpdateTrabajadorDto } from './dto/update-trabajador.dto';
import { TrabajadorDocumento } from './entities/trabajador-documento.entity';
import { Trabajador } from './entities/trabajador.entity';

export interface PublicTrabajadorDocumento {
  id: string;
  nombreArchivo: string;
  rutaArchivo: string;
  tipoMime: string | null;
  tamanoBytes: number | null;
  descripcion: string | null;
  createdAt: Date;
}

export interface PublicTrabajador {
  id: string;
  userId: string;
  rut: string;
  comuna: string;
  direccion: string;
  telefono: string;
  fechaNacimiento: string;
  edad: number;
  sueldo: number;
  fotoUrl: string | null;
  documentos: PublicTrabajadorDocumento[];
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
    @InjectRepository(TrabajadorDocumento)
    private readonly documentoRepository: Repository<TrabajadorDocumento>,
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
      queryBuilder.andWhere('LOWER(COALESCE(user.last_name, \'\')) LIKE LOWER(:lastName)', {
        lastName: `%${filters.lastName.trim()}%`,
      });
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

    const [users, totalItems] = await queryBuilder.skip(skip).take(limit).getManyAndCount();

    const userIds = users.map((user) => user.id);
    const trabajadores =
      userIds.length > 0
        ? await this.trabajadorRepository.find({
            where: { userId: In(userIds) },
            relations: { documentos: true },
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

  async create(createTrabajadorDto: CreateTrabajadorDto): Promise<PublicTrabajador> {
    const user = await this.userRepository.findOne({
      where: { id: createTrabajadorDto.userId },
      relations: { role: true },
    });

    if (!user) {
      throw new NotFoundException('El usuario seleccionado no existe');
    }

    const existingTrabajador = await this.trabajadorRepository.findOne({
      where: { userId: createTrabajadorDto.userId },
      relations: { documentos: true, user: true },
    });

    if (existingTrabajador) {
      throw new ConflictException('Ese usuario ya tiene un trabajador asociado');
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
      comuna: createTrabajadorDto.comuna.trim(),
      direccion: createTrabajadorDto.direccion.trim(),
      telefono: createTrabajadorDto.telefono.trim(),
      fechaNacimiento: createTrabajadorDto.fechaNacimiento,
      edad: createTrabajadorDto.edad,
      sueldo: createTrabajadorDto.sueldo,
      fotoUrl: createTrabajadorDto.fotoUrl?.trim() || null,
      documentos:
        createTrabajadorDto.documentos?.map((documento) =>
          this.documentoRepository.create({
            nombreArchivo: documento.nombreArchivo.trim(),
            rutaArchivo: documento.rutaArchivo.trim(),
            tipoMime: documento.tipoMime?.trim() || null,
            tamanoBytes: documento.tamanoBytes ?? null,
            descripcion: documento.descripcion?.trim() || null,
          }),
        ) ?? [],
    });

    const savedTrabajador = await this.trabajadorRepository.save(trabajador);

    return this.findOne(savedTrabajador.id);
  }

  async findOne(id: string): Promise<PublicTrabajador> {
    const trabajador = await this.trabajadorRepository.findOne({
      where: { id },
      relations: { user: { role: true }, documentos: true },
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
      relations: { user: { role: true }, documentos: true },
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

    if (updateTrabajadorDto.documentos) {
      trabajador.documentos = updateTrabajadorDto.documentos.map((documento) =>
        this.documentoRepository.create({
          nombreArchivo: documento.nombreArchivo.trim(),
          rutaArchivo: documento.rutaArchivo.trim(),
          tipoMime: documento.tipoMime?.trim() || null,
          tamanoBytes: documento.tamanoBytes ?? null,
          descripcion: documento.descripcion?.trim() || null,
        }),
      );
    }

    const savedTrabajador = await this.trabajadorRepository.save(trabajador);

    return this.toPublicTrabajador(savedTrabajador);
  }

  private toPublicEmpleadoUser(
    user: User,
    trabajador?: Trabajador | null,
  ): PublicEmpleadoUser {
    const hasTrabajador =
      trabajador && typeof trabajador.id === 'string' && trabajador.id.length > 0;

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
    const documentos = trabajador.documentos ?? [];

    return {
      id: trabajador.id,
      userId: trabajador.userId,
      rut: trabajador.rut,
      comuna: trabajador.comuna,
      direccion: trabajador.direccion,
      telefono: trabajador.telefono,
      fechaNacimiento: trabajador.fechaNacimiento,
      edad: trabajador.edad,
      sueldo: Number(trabajador.sueldo),
      fotoUrl: trabajador.fotoUrl,
      documentos: documentos.map((documento) => ({
        id: documento.id,
        nombreArchivo: documento.nombreArchivo,
        rutaArchivo: documento.rutaArchivo,
        tipoMime: documento.tipoMime,
        tamanoBytes: documento.tamanoBytes,
        descripcion: documento.descripcion,
        createdAt: documento.createdAt,
      })),
      createdAt: trabajador.createdAt,
      updatedAt: trabajador.updatedAt,
    };
  }
}