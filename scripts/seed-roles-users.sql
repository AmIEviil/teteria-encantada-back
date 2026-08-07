-- ============================================================================
--  Teteria Encantada - Seed de roles, usuarios y whitelist de Google
--  Base de datos: TeteriaEncantada (PostgreSQL)
--  Ejecutar en pgAdmin -> Query Tool sobre la BD TeteriaEncantada
--
--  Es 100% idempotente: se puede correr varias veces sin duplicar nada.
--
--  Bloques:
--    1. Extension uuid + roles del sistema
--    2. Usuario Superadmin local (login con usuario + contrasena)
--    3. Whitelist de correos para entrar con Google (Admin / Tecnico / etc.)
--    4. (Opcional) Ficha de trabajador asociada a un usuario
--    5. Consultas de verificacion
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extension y roles del sistema
--    Los nombres DEBEN coincidir exactamente con SYSTEM_ROLES del backend
--    (src/modules/auth/constants/system-roles.constant.ts):
--    Superadmin | Admin | Tecnico | Cliente
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

INSERT INTO roles (name, description, "isActive")
VALUES
  ('Superadmin', 'Rol del sistema: Superadmin', true),
  ('Admin',      'Rol del sistema: Admin',      true),
  ('Tecnico',    'Rol del sistema: Tecnico',    true),
  ('Cliente',    'Rol del sistema: Cliente',    true)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      "isActive"  = true,
      "updatedAt" = now();


-- ---------------------------------------------------------------------------
-- 2. Usuario Superadmin con login local (POST /api/auth/login)
--
--    IMPORTANTE: el login local usa USERNAME + PASSWORD, no el email.
--    El backend guarda el username en minusculas, asi que aqui va en minusculas.
--
--    password_hash de abajo = bcrypt(10) de la contrasena:  Encanto2026!
--    Cambiala despues desde la app o regenera el hash con:
--      node -e "console.log(require('bcrypt').hashSync('TU_PASS',10))"
-- ---------------------------------------------------------------------------
INSERT INTO users (
  first_name, last_name, username, email, password_hash,
  provider, google_id, "isActive", role_id
)
SELECT
  'Super',
  'Admin',
  'superadmin',
  'gcarootarola@gmail.com',
  '$2b$10$l3UsDD5vBd4PLVWjteo4HOkaFCka2IZZUPK2AznevDxI2W7L8lGhy',
  'LOCAL'::users_provider_enum,
  NULL,
  true,
  r.id
FROM roles r
WHERE r.name = 'Superadmin'
ON CONFLICT (email) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. Whitelist de correos para entrar con Google
--
--    Como funciona el login con Google en este backend
--    (AuthService.googleLogin, src/modules/auth/auth.service.ts):
--
--      a) Si el email YA existe en la tabla users:
--           - si "isActive" = false  -> 401 "La cuenta esta inactiva"
--           - si google_id es NULL   -> se enlaza la cuenta de Google
--                                       (guarda google_id, provider = GOOGLE,
--                                        y pisa first_name / last_name con los
--                                        datos reales de Google)
--           - conserva el ROL que ya tenia la fila
--      b) Si el email NO existe -> crea el usuario automaticamente con rol
--         'Cliente'.
--
--    O sea: NO hay una tabla de whitelist aparte. La "whitelist" es
--    justamente pre-crear la fila en users con el rol que quieres. Si el
--    correo no esta pre-cargado, la persona igual puede entrar, pero solo
--    como Cliente (sin acceso al panel de Admin/Tecnico).
--
--    Equivale al endpoint POST /api/trabajadores/whitelist
--    ({ email, roleName }), que hace exactamente este mismo INSERT.
--
--    -> EDITA la lista de VALUES de abajo con los correos reales.
--       google_id queda NULL a proposito: se llena solo en el primer login.
-- ---------------------------------------------------------------------------
INSERT INTO users (
  first_name, last_name, username, email, password_hash,
  provider, google_id, "isActive", role_id
)
SELECT
  -- el backend usa la parte antes del @ como nombre provisional;
  -- Google lo reemplaza por el nombre real en el primer login
  LEFT(SPLIT_PART(w.email, '@', 1), 80),
  NULL,
  NULL,
  LOWER(w.email),
  NULL,
  'GOOGLE'::users_provider_enum,
  NULL,
  true,
  r.id
FROM (
  VALUES
    -- (correo, rol)   <-- CAMBIA ESTOS DATOS
    ('gcarootarola@gmail.com',  'Superadmin'),
    ('brujantigua@gmail.com',   'Admin'),
    ('trabajador1@gmail.com',   'Tecnico'),
    ('trabajador2@gmail.com',   'Tecnico')
) AS w(email, role_name)
JOIN roles r
  ON LOWER(r.name) = LOWER(w.role_name)
 AND r."isActive" = true
ON CONFLICT (email) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4. (OPCIONAL) Ficha de trabajador para un usuario ya existente
--    Solo rut y telefono son obligatorios (ver Trabajador entity).
--    Descomenta y ajusta los datos.
-- ---------------------------------------------------------------------------
-- INSERT INTO trabajadores (
--   user_id, rut, telefono, comuna, direccion, fecha_nacimiento, edad, sueldo, foto_url
-- )
-- SELECT
--   u.id,
--   '11111111-1',
--   '+56911111111',
--   'Santiago',
--   'Av. Siempre Viva 742',
--   '1995-05-20',
--   30,
--   750000.00,
--   NULL
-- FROM users u
-- WHERE u.email = 'trabajador1@gmail.com'
-- ON CONFLICT (user_id) DO NOTHING;

COMMIT;


-- ---------------------------------------------------------------------------
-- 5. Verificacion
-- ---------------------------------------------------------------------------
SELECT id, name, "isActive" FROM roles ORDER BY name;

SELECT u.email,
       u.username,
       u.provider,
       (u.google_id IS NOT NULL) AS google_enlazado,
       (u.password_hash IS NOT NULL) AS tiene_password,
       u."isActive",
       r.name AS rol,
       (t.id IS NOT NULL) AS tiene_ficha_trabajador
FROM users u
JOIN roles r ON r.id = u.role_id
LEFT JOIN trabajadores t ON t.user_id = u.id
ORDER BY r.name, u.email;
