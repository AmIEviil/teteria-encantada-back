/**
 * Crea (o actualiza el rol de) un usuario directamente en la BD.
 *
 * Sirve para dos cosas:
 *   - Usuario con login local  -> se pasa --password (se hashea con bcrypt 10)
 *   - Whitelist de Google      -> sin --password; el usuario queda con
 *                                 provider=GOOGLE y google_id NULL, y se enlaza
 *                                 solo en su primer login con Google.
 *
 * Uso (desde teteria-encantada-back/):
 *   node scripts/create-user.js --email correo@gmail.com --role Admin
 *   node scripts/create-user.js --email correo@gmail.com --role Superadmin \
 *        --username superadmin --password "Encanto2026!" --first Super --last Admin
 *
 * Flags:
 *   --email      (requerido)
 *   --role       Superadmin | Admin | Tecnico | Cliente   (default: Cliente)
 *   --password   si se pasa, crea usuario LOCAL con esa contrasena
 *   --username   solo para usuarios locales (default: parte antes del @)
 *   --first / --last  nombre y apellido
 *   --force-role si el usuario ya existe, le cambia el rol
 *
 * Toma la conexion desde el .env (DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD).
 */
require('dotenv/config');
const bcrypt = require('bcrypt');
const { Client } = require('pg');

const SALT_ROUNDS = 10;
const VALID_ROLES = ['Superadmin', 'Admin', 'Tecnico', 'Cliente'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const email = String(args.email || '').trim().toLowerCase();
  if (!email) {
    console.error('Falta --email');
    process.exit(1);
  }

  const roleName = String(args.role || 'Cliente').trim();
  const matchedRole = VALID_ROLES.find(
    (role) => role.toLowerCase() === roleName.toLowerCase(),
  );
  if (!matchedRole) {
    console.error(`Rol invalido: ${roleName}. Validos: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const password = typeof args.password === 'string' ? args.password : null;
  const isLocal = Boolean(password);
  const username = isLocal
    ? String(args.username || email.split('@')[0]).trim().toLowerCase()
    : null;
  const firstName = String(args.first || email.split('@')[0]).slice(0, 80);
  const lastName = typeof args.last === 'string' ? args.last.slice(0, 80) : null;

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'TeteriaEncantada',
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    const roleResult = await client.query(
      'SELECT id, name FROM roles WHERE LOWER(name) = LOWER($1) AND "isActive" = true',
      [matchedRole],
    );
    if (roleResult.rowCount === 0) {
      throw new Error(
        `El rol ${matchedRole} no existe o no esta activo. Corre primero scripts/seed-roles-users.sql o levanta el backend una vez.`,
      );
    }
    const role = roleResult.rows[0];

    const existing = await client.query(
      'SELECT id, email, role_id, provider FROM users WHERE email = $1',
      [email],
    );

    if (existing.rowCount > 0) {
      const user = existing.rows[0];
      if (args['force-role'] && user.role_id !== role.id) {
        await client.query(
          'UPDATE users SET role_id = $1, "updatedAt" = now() WHERE id = $2',
          [role.id, user.id],
        );
        console.log(`Usuario ${email} ya existia. Rol actualizado a ${role.name}.`);
      } else {
        console.log(
          `Usuario ${email} ya existe (id=${user.id}). Usa --force-role para cambiarle el rol.`,
        );
      }
      await client.query('COMMIT');
      return;
    }

    const passwordHash = isLocal ? await bcrypt.hash(password, SALT_ROUNDS) : null;

    const inserted = await client.query(
      `INSERT INTO users (
         first_name, last_name, username, email, password_hash,
         provider, google_id, "isActive", role_id
       ) VALUES ($1, $2, $3, $4, $5, $6::users_provider_enum, NULL, true, $7)
       RETURNING id`,
      [
        firstName,
        lastName,
        username,
        email,
        passwordHash,
        isLocal ? 'LOCAL' : 'GOOGLE',
        role.id,
      ],
    );

    await client.query('COMMIT');

    console.log(`Usuario creado: ${email}`);
    console.log(`  id       : ${inserted.rows[0].id}`);
    console.log(`  rol      : ${role.name}`);
    console.log(`  provider : ${isLocal ? 'LOCAL' : 'GOOGLE (whitelist)'}`);
    if (isLocal) {
      console.log(`  username : ${username}   <- con esto se hace login, no con el email`);
    } else {
      console.log('  Entra con el boton de Google usando ese mismo correo.');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
