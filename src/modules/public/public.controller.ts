import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PublicCreateReservationDto } from './dto/public-create-reservation.dto';
import { PublicFindReservationsDto } from './dto/public-find-reservations.dto';
import {
  PublicMenuItem,
  PublicReservationItem,
  PublicReservationScheduleItem,
  PublicService,
  PublicTableItem,
} from './public.service';

@Controller('public')
@Public()
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('menu')
  findMenu(): Promise<PublicMenuItem[]> {
    return this.publicService.findMenu();
  }

  @Get('tables')
  findTables(): Promise<PublicTableItem[]> {
    return this.publicService.findTables();
  }

  @Get('reservations')
  findReservations(
    @Query() filters: PublicFindReservationsDto,
  ): Promise<PublicReservationItem[]> {
    return this.publicService.findReservations(filters);
  }

  @Get('reservations/schedule')
  findReservationSchedule(): Promise<PublicReservationScheduleItem[]> {
    return this.publicService.findReservationSchedule();
  }

  @Post('reservations')
  createReservation(
    @Body() createReservationDto: PublicCreateReservationDto,
  ): Promise<PublicReservationItem> {
    return this.publicService.createReservation(createReservationDto);
  }
}
