import { IsBoolean } from 'class-validator';

export class SetWhitelistActiveDto {
  @IsBoolean()
  isActive: boolean;
}
