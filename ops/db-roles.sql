-- Rol de la aplicación con privilegios mínimos (Fase 6).
-- Por qué: el dueño de las tablas puede quitar los triggers que hacen inmutable la auditoría. La aplicación NO debe
-- conectarse como dueño. Las migraciones las corre el dueño (MIGRATION_DATABASE_URL); la app usa este rol (DATABASE_URL).
--
-- Cómo usarlo (una sola vez, conectado como dueño/superusuario de la base, después del primer despliegue):
--   1. Cambia __APP_PASSWORD__ por una contraseña larga y aleatoria (guárdala en tu gestor de secretos).
--   2. Ejecútalo:  psql "<URL de la base como dueño>" -f ops/db-roles.sql
--   3. En el servicio web: DATABASE_URL = URL con usuario sanithelp_app; MIGRATION_DATABASE_URL = URL original (dueño).
-- Es idempotente: se puede volver a correr tras agregar tablas nuevas.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sanithelp_app') THEN
    CREATE ROLE sanithelp_app LOGIN PASSWORD '__APP_PASSWORD__' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO sanithelp_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO sanithelp_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sanithelp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sanithelp_app;

-- La auditoría es solo-inserción también a nivel de privilegios (además de los triggers).
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM sanithelp_app;

-- Tablas futuras creadas por el dueño reciben los mismos privilegios (el dueño debe ser quien ejecuta este script).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sanithelp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sanithelp_app;
