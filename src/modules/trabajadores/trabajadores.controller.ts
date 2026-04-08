import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto';
import { FindEmpleadoUsersDto } from './dto/find-empleado-users.dto';
import { UpdateTrabajadorDto } from './dto/update-trabajador.dto';
import { TrabajadoresService, type EmpleadoUsersResponse, type PublicTrabajador } from './trabajadores.service';

@Controller('trabajadores')
@Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN)
export class TrabajadoresController {
  constructor(private readonly trabajadoresService: TrabajadoresService) {}

  @Get('users')
  findUsers(@Query() query: FindEmpleadoUsersDto): Promise<EmpleadoUsersResponse> {
    return this.trabajadoresService.findUsers(query);
  }

  @Post()
  create(@Body() createTrabajadorDto: CreateTrabajadorDto): Promise<PublicTrabajador> {
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