import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'La contraseña debe tener al menos una letra mayúscula, una minúscula y un número',
  })
  newPassword: string;

  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}
