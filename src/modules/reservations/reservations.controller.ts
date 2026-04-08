import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { GetReservationsDto } from './dto/get-reservations.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { Reservation } from './entities/reservation.entity';
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
@Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.TECNICO)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  create(
    @Body() createReservationDto: CreateReservationDto,
  ): Promise<Reservation> {
    return this.reservationsService.create(createReservationDto);
  }

  @Get()
  findAll(@Query() filters: GetReservationsDto): Promise<Reservation[]> {
    return this.reservationsService.findAll(filters);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Reservation> {
    return this.reservationsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateReservationDto: UpdateReservationDto,
  ): Promise<Reservation> {
    return this.reservationsService.update(id, updateReservationDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.reservationsService.remove(id);
  }
}
