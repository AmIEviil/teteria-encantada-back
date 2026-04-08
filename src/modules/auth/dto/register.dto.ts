import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'El nombre de usuario solo puede contener letras, números, punto, guion y guion bajo',
  })
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  first_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  last_name?: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'La contraseña debe tener al menos una letra mayúscula, una minúscula y un número',
  })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  roleName?: string;
}
