import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { TrabajadorDocumento } from './entities/trabajador-documento.entity';
import { Trabajador } from './entities/trabajador.entity';
import { TrabajadoresController } from './trabajadores.controller';
import { TrabajadoresService } from './trabajadores.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Trabajador, TrabajadorDocumento])],
  controllers: [TrabajadoresController],
  providers: [TrabajadoresService],
})
export class TrabajadoresModule {}