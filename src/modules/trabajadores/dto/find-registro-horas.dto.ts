import { IsOptional, IsUUID, Matches } from 'class-validator';

export class FindRegistroHorasDto {
  @IsOptional()
  @IsUUID()
  trabajadorId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'El mes debe tener formato YYYY-MM' })
  mes?: string;
}
