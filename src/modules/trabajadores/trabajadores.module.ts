import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../auth/entities/role.entity';
import { User } from '../auth/entities/user.entity';
import { RegistroHora } from './entities/registro-hora.entity';
import { Trabajador } from './entities/trabajador.entity';
import { RegistroHorasController } from './registro-horas.controller';
import { RegistroHorasService } from './registro-horas.service';
import { TrabajadoresController } from './trabajadores.controller';
import { TrabajadoresService } from './trabajadores.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, Trabajador, RegistroHora])],
  controllers: [RegistroHorasController, TrabajadoresController],
  providers: [TrabajadoresService, RegistroHorasService],
})
export class TrabajadoresModule {}
