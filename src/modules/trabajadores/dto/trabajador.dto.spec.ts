import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTrabajadorDto } from './create-trabajador.dto';
import { UpdateTrabajadorDto } from './update-trabajador.dto';
import { FindEmpleadoUsersDto } from './find-empleado-users.dto';
import { CreateTrabajadorDocumentoDto } from './create-trabajador-documento.dto';

const uuid = '550e8400-e29b-41d4-a716-446655440000';

describe('Trabajador DTOs', () => {
  it('CreateTrabajadorDto valido con documentos', async () => {
    const dto = plainToInstance(CreateTrabajadorDto, {
      userId: uuid,
      rut: '11.111.111-1',
      comuna: 'Santiago',
      direccion: 'calle 1',
      telefono: '123456',
      fechaNacimiento: '1990-01-01',
      edad: 34,
      sueldo: 500000,
      fotoUrl: 'http://f',
      documentos: [
        {
          nombreArchivo: 'doc',
          rutaArchivo: '/ruta',
          tipoMime: 'application/pdf',
          tamanoBytes: 100,
          descripcion: 'd',
        },
      ],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('CreateTrabajadorDto rechaza userId invalido', async () => {
    const dto = plainToInstance(CreateTrabajadorDto, {
      userId: 'no',
      rut: 'x',
      comuna: 'x',
      direccion: 'x',
      telefono: 'x',
      fechaNacimiento: '1990-01-01',
      edad: 34,
      sueldo: 5,
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('UpdateTrabajadorDto parcial', async () => {
    const dto = plainToInstance(UpdateTrabajadorDto, {
      comuna: 'Maipu',
      sueldo: 600000,
      documentos: [{ nombreArchivo: 'd', rutaArchivo: '/d' }],
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

  it('CreateTrabajadorDocumentoDto valido', async () => {
    const dto = plainToInstance(CreateTrabajadorDocumentoDto, {
      nombreArchivo: 'doc',
      rutaArchivo: '/ruta',
      tamanoBytes: 50,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
