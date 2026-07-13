import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from '../auth/entities/role.entity';
import { User } from '../auth/entities/user.entity';
import { Trabajador } from './entities/trabajador.entity';
import { TrabajadoresController } from './trabajadores.controller';
import { TrabajadoresService } from './trabajadores.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, Trabajador])],
  controllers: [TrabajadoresController],
  providers: [TrabajadoresService],
})
export class TrabajadoresModule {}
