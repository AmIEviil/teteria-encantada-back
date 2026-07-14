import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { FindRegistroHorasDto } from './dto/find-registro-horas.dto';
import { UpsertRegistroHoraDto } from './dto/upsert-registro-hora.dto';
import {
  RegistroHorasService,
  type PublicRegistroHora,
  type RegistroHorasMesResponse,
} from './registro-horas.service';

interface RequestWithUser {
  user: AuthUser;
}

@Controller('trabajadores/horas')
@Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.TECNICO)
export class RegistroHorasController {
  constructor(private readonly registroHorasService: RegistroHorasService) {}

  @Get()
  findMonth(
    @Req() request: RequestWithUser,
    @Query() filters: FindRegistroHorasDto,
  ): Promise<RegistroHorasMesResponse> {
    return this.registroHorasService.findMonth(request.user, filters);
  }

  @Post()
  upsert(
    @Req() request: RequestWithUser,
    @Body() dto: UpsertRegistroHoraDto,
  ): Promise<PublicRegistroHora | null> {
    return this.registroHorasService.upsert(request.user, dto);
  }
}
