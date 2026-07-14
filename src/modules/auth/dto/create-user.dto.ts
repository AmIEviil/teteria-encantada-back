import { IsOptional, IsString, MaxLength } from 'class-validator';
import { RegisterDto } from './register.dto';

export class CreateUserDto extends RegisterDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  roleName?: string;
}
