import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertRegistroHoraDto } from './upsert-registro-hora.dto';

const buildDto = (data: Record<string, unknown>) =>
  plainToInstance(UpsertRegistroHoraDto, data);

describe('UpsertRegistroHoraDto', () => {
  it('acepta horas en múltiplos de 0.5', async () => {
    const errors = await validate(
      buildDto({ fecha: '2026-07-13', horas: 7.5 }),
    );
    expect(errors).toHaveLength(0);
  });

  it('acepta 0 horas (borra el registro del día)', async () => {
    const errors = await validate(buildDto({ fecha: '2026-07-13', horas: 0 }));
    expect(errors).toHaveLength(0);
  });

  it('rechaza horas que no son múltiplo de 0.5', async () => {
    const errors = await validate(
      buildDto({ fecha: '2026-07-13', horas: 7.3 }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('horas');
  });

  it('rechaza más de 24 horas', async () => {
    const errors = await validate(
      buildDto({ fecha: '2026-07-13', horas: 24.5 }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rechaza horas negativas', async () => {
    const errors = await validate(buildDto({ fecha: '2026-07-13', horas: -1 }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rechaza una fecha con formato inválido', async () => {
    const errors = await validate(buildDto({ fecha: '13-07-2026', horas: 8 }));
    expect(errors.some((error) => error.property === 'fecha')).toBe(true);
  });
});
