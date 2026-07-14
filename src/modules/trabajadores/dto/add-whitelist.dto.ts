import { IsEmail, IsString, MaxLength } from 'class-validator';

export class AddWhitelistDto {
  @IsEmail()
  @MaxLength(180)
  email: string;

  @IsString()
  @MaxLength(60)
  roleName: string;
}
