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
import { SYSTEM_ROLES } from '../auth/constants/system-roles.constant';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateEventTicketDto } from './dto/create-event-ticket.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { FindEventsDto } from './dto/find-events.dto';
import { FindEventTicketsDto } from './dto/find-event-tickets.dto';
import { UpdateEventStatusDto } from './dto/update-event-status.dto';
import { UpdateEventTicketDto } from './dto/update-event-ticket.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventTicket } from './entities/event-ticket.entity';
import { Event } from './entities/event.entity';
import { EventsService } from './events.service';

@Controller('events')
@Roles(SYSTEM_ROLES.SUPERADMIN, SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.TECNICO)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  create(@Body() createEventDto: CreateEventDto): Promise<Event> {
    return this.eventsService.create(createEventDto);
  }

  @Get()
  findAll(@Query() filters: FindEventsDto): Promise<Event[]> {
    return this.eventsService.findAll(filters);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Event> {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEventDto: UpdateEventDto,
  ): Promise<Event> {
    return this.eventsService.update(id, updateEventDto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEventStatusDto: UpdateEventStatusDto,
  ): Promise<Event> {
    return this.eventsService.updateStatus(id, updateEventStatusDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.eventsService.remove(id);
  }

  @Post(':id/tickets')
  createTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() createEventTicketDto: CreateEventTicketDto,
  ): Promise<EventTicket[]> {
    return this.eventsService.createTicket(id, createEventTicketDto);
  }

  @Get(':id/tickets')
  findTickets(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() filters: FindEventTicketsDto,
  ): Promise<EventTicket[]> {
    return this.eventsService.findTickets(id, filters);
  }

  @Patch(':id/tickets/:ticketId')
  updateTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() updateEventTicketDto: UpdateEventTicketDto,
  ): Promise<EventTicket> {
    return this.eventsService.updateTicket(id, ticketId, updateEventTicketDto);
  }

  @Delete(':id/tickets/:ticketId')
  removeTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ): Promise<{ message: string }> {
    return this.eventsService.removeTicket(id, ticketId);
  }
}
