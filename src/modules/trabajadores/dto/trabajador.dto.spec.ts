import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTrabajadorDto } from './create-trabajador.dto';
import { UpdateTrabajadorDto } from './update-trabajador.dto';
import { FindEmpleadoUsersDto } from './find-empleado-users.dto';

const uuid = '550e8400-e29b-41d4-a716-446655440000';

describe('Trabajador DTOs', () => {
  it('CreateTrabajadorDto valido', async () => {
    const dto = plainToInstance(CreateTrabajadorDto, {
      userId: uuid,
      rut: '202800074-2',
      comuna: 'Santiago',
      direccion: 'calle 1',
      telefono: '123456',
      fechaNacimiento: '1990-01-01',
      edad: 34,
      sueldo: 500000,
      fotoUrl: 'http://f',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CreateTrabajadorDto solo exige rut y telefono', async () => {
    const dto = plainToInstance(CreateTrabajadorDto, {
      userId: uuid,
      rut: '11111111-K',
      telefono: '+56 9 1111 1111',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CreateTrabajadorDto rechaza rut con puntos o verificador invalido', async () => {
    const conPuntos = plainToInstance(CreateTrabajadorDto, {
      userId: uuid,
      rut: '11.111.111-1',
      telefono: '123456',
    });
    expect((await validate(conPuntos)).length).toBeGreaterThan(0);

    const verificadorInvalido = plainToInstance(CreateTrabajadorDto, {
      userId: uuid,
      rut: '11111111-X',
      telefono: '123456',
    });
    expect((await validate(verificadorInvalido)).length).toBeGreaterThan(0);
  });

  it('CreateTrabajadorDto rechaza userId invalido', async () => {
    const dto = plainToInstance(CreateTrabajadorDto, {
      userId: 'no',
      rut: '202800074-2',
      telefono: 'x',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('UpdateTrabajadorDto parcial', async () => {
    const dto = plainToInstance(UpdateTrabajadorDto, {
      comuna: 'Maipu',
      sueldo: 600000,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('FindEmpleadoUsersDto valido', async () => {
    const dto = plainToInstance(FindEmpleadoUsersDto, {
      page: 1,
      limit: 10,
      firstName: 'Juan',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('FindEmpleadoUsersDto rechaza limit > 100', async () => {
    const dto = plainToInstance(FindEmpleadoUsersDto, { limit: 999 });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
