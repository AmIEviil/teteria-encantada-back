import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import {
  lastDayOfMonth,
  todayInSantiago,
} from '../../common/date/santiago-date';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { FindRegistroHorasDto } from './dto/find-registro-horas.dto';
import { UpsertRegistroHoraDto } from './dto/upsert-registro-hora.dto';
import { RegistroHora } from './entities/registro-hora.entity';
import { Trabajador } from './entities/trabajador.entity';

export interface PublicRegistroHora {
  fecha: string;
  horas: number;
}

export interface RegistroHorasMesResponse {
  trabajadorId: string;
  mes: string;
  items: PublicRegistroHora[];
  totalHoras: number;
}

@Injectable()
export class RegistroHorasService {
  constructor(
    @InjectRepository(RegistroHora)
    private readonly registroRepository: Repository<RegistroHora>,
    @InjectRepository(Trabajador)
    private readonly trabajadorRepository: Repository<Trabajador>,
  ) {}

  async upsert(
    authUser: AuthUser,
    dto: UpsertRegistroHoraDto,
  ): Promise<PublicRegistroHora | null> {
    const trabajadorId = await this.resolveTrabajadorId(
      authUser,
      dto.trabajadorId,
    );

    if (dto.fecha > todayInSantiago()) {
      throw new BadRequestException(
        'No se pueden registrar horas en fechas futuras',
      );
    }

    const existing = await this.registroRepository.findOneBy({
      trabajadorId,
      fecha: dto.fecha,
    });

    if (dto.horas === 0) {
      if (existing) {
        await this.registroRepository.remove(existing);
      }

      return null;
    }

    if (existing) {
      existing.horas = dto.horas;
      const updated = await this.registroRepository.save(existing);

      return { fecha: updated.fecha, horas: Number(updated.horas) };
    }

    const created = this.registroRepository.create({
      trabajadorId,
      fecha: dto.fecha,
      horas: dto.horas,
    });
    const saved = await this.registroRepository.save(created);

    return { fecha: saved.fecha, horas: Number(saved.horas) };
  }

  async findMonth(
    authUser: AuthUser,
    filters: FindRegistroHorasDto,
  ): Promise<RegistroHorasMesResponse> {
    const trabajadorId = await this.resolveTrabajadorId(
      authUser,
      filters.trabajadorId,
    );
    const mes = filters.mes ?? todayInSantiago().slice(0, 7);

    const registros = await this.registroRepository.find({
      where: {
        trabajadorId,
        fecha: Between(`${mes}-01`, lastDayOfMonth(mes)),
      },
      order: { fecha: 'ASC' },
    });

    const items = registros.map((registro) => ({
      fecha: registro.fecha,
      horas: Number(registro.horas),
    }));

    return {
      trabajadorId,
      mes,
      items,
      totalHoras: items.reduce((total, item) => total + item.horas, 0),
    };
  }

  private async resolveTrabajadorId(
    authUser: AuthUser,
    requestedTrabajadorId?: string,
  ): Promise<string> {
    const isAdmin =
      authUser.role === SYSTEM_ROLES.SUPERADMIN ||
      authUser.role === SYSTEM_ROLES.ADMIN;

    if (isAdmin && requestedTrabajadorId) {
      return requestedTrabajadorId;
    }

    const ownTrabajadorId = await this.findOwnTrabajadorId(authUser.userId);

    if (
      !isAdmin &&
      requestedTrabajadorId &&
      requestedTrabajadorId !== ownTrabajadorId
    ) {
      throw new ForbiddenException('Solo puedes gestionar tus propias horas');
    }

    return ownTrabajadorId;
  }

  private async findOwnTrabajadorId(userId: string): Promise<string> {
    const trabajador = await this.trabajadorRepository.findOneBy({ userId });

    if (!trabajador) {
      throw new NotFoundException(
        'Tu usuario no tiene una ficha de trabajador asociada',
      );
    }

    return trabajador.id;
  }
}
