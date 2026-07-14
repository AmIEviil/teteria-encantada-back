import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AddWhitelistDto } from './dto/add-whitelist.dto';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';
import { FindEmpleadoUsersDto } from './dto/find-empleado-users.dto';
import { SetWhitelistActiveDto } from './dto/set-whitelist-active.dto';
import { UpdateTrabajadorDto } from './dto/update-trabajador.dto';
import {
  TrabajadoresService,
  type EmpleadoUsersResponse,
  type PublicEmpleadoUser,
  type PublicTrabajador,
} from './trabajadores.service';

interface RequestWithUser extends Request {
  user: AuthUser;
}

@Controller('trabajadores')
@Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
export class TrabajadoresController {
  constructor(private readonly trabajadoresService: TrabajadoresService) {}

  @Get('users')
  findUsers(
    @Query() query: FindEmpleadoUsersDto,
  ): Promise<EmpleadoUsersResponse> {
    return this.trabajadoresService.findUsers(query);
  }

  @Post('whitelist')
  addToWhitelist(
    @Req() request: RequestWithUser,
    @Body() addWhitelistDto: AddWhitelistDto,
  ): Promise<PublicEmpleadoUser> {
    return this.trabajadoresService.addToWhitelist(
      request.user,
      addWhitelistDto,
    );
  }

  @Patch('whitelist/:id')
  setWhitelistActive(
    @Req() request: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() setWhitelistActiveDto: SetWhitelistActiveDto,
  ): Promise<PublicEmpleadoUser> {
    return this.trabajadoresService.setWhitelistActive(
      request.user,
      id,
      setWhitelistActiveDto.isActive,
    );
  }

  @Post()
  create(
    @Body() createTrabajadorDto: CreateTrabajadorDto,
  ): Promise<PublicTrabajador> {
    return this.trabajadoresService.create(createTrabajadorDto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PublicTrabajador> {
    return this.trabajadoresService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTrabajadorDto: UpdateTrabajadorDto,
  ): Promise<PublicTrabajador> {
    return this.trabajadoresService.update(id, updateTrabajadorDto);
  }
}
