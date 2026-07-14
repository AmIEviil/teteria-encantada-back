import { IsOptional, IsUUID, Matches } from 'class-validator';

export class FindRegistroHorasDto {
  @IsOptional()
  @IsUUID()
  trabajadorId?: string;

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'El mes debe tener formato YYYY-MM',
  })
  mes?: string;
}
