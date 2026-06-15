import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { Roles, ROLES_KEY } from './decorators/roles.decorator';

describe('Auth DTOs', () => {
  it('RegisterDto valido', async () => {
    const dto = plainToInstance(RegisterDto, {
      username: 'juan',
      first_name: 'Juan',
      email: 'juan@x.com',
      password: 'Secret123',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('RegisterDto rechaza username con caracteres invalidos', async () => {
    const dto = plainToInstance(RegisterDto, {
      username: 'juan perez!',
      first_name: 'Juan',
      email: 'juan@x.com',
      password: 'Secret123',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('RegisterDto rechaza password debil', async () => {
    const dto = plainToInstance(RegisterDto, {
      username: 'juan',
      first_name: 'Juan',
      email: 'juan@x.com',
      password: 'weak',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('CreateUserDto hereda validacion', async () => {
    const dto = plainToInstance(CreateUserDto, {});
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('LoginDto valido', async () => {
    const dto = plainToInstance(LoginDto, {
      username: 'juan',
      password: 'Secret123',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('ResetPasswordDto valido', async () => {
    const dto = plainToInstance(ResetPasswordDto, {
      token: 't',
      newPassword: 'Secret123',
      confirmPassword: 'Secret123',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('ForgotPasswordDto rechaza email invalido', async () => {
    const dto = plainToInstance(ForgotPasswordDto, { email: 'no-mail' });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

describe('Roles decorator', () => {
  it('expone metadata de roles', () => {
    class Demo {}
    Roles('Admin', 'Superadmin')(Demo);
    expect(Reflect.getMetadata(ROLES_KEY, Demo)).toEqual([
      'Admin',
      'Superadmin',
    ]);
  });
});
