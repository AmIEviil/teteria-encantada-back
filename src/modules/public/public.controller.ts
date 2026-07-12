import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import type { PublicEventDetail, PublicPurchaseResult } from '../events/events.service';
import { PublicCreateReservationDto } from './dto/public-create-reservation.dto';
import { PublicFindReservationsDto } from './dto/public-find-reservations.dto';
import { PublicPurchaseDto } from './dto/public-purchase.dto';
import {
  PublicEventItem,
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

  @Get('events')
  findEvents(): Promise<PublicEventItem[]> {
    return this.publicService.findEvents();
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

  @Get('events/:id')
  findEvent(@Param('id', ParseUUIDPipe) id: string): Promise<PublicEventDetail> {
    return this.publicService.findEvent(id);
  }

  @Post('events/:id/tickets')
  purchase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublicPurchaseDto,
  ): Promise<PublicPurchaseResult> {
    return this.publicService.purchase(id, dto);
  }
}
