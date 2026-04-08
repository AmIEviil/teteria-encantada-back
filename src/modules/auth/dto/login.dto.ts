import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(60)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
