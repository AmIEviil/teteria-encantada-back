import { IsNotEmpty, IsString } from 'class-validator';

export class MigrationActionDto {
  @IsString()
  @IsNotEmpty()
  migrationName: string;
}
