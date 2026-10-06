# Despliegue en Railway

Guía para quien nunca ha usado Railway. Resultado: la app en una URL propia con HTTPS, conectada a PostgreSQL.

> Estado: la configuración está lista (`railway.json`), pero **el despliegue real no se ha hecho todavía**. Se hará con la cuenta de GitHub y de Railway de la titular del desarrollo, y al final se **traspasa a Sanithelp** (decisión de titularidad: la infraestructura es de Sanithelp S.A.S.).

> **Plan gratuito:** sirve para una prueba piloto, no para producción con datos reales. Verifica los límites vigentes del plan (memoria, almacenamiento, crédito mensual, si hay copias de seguridad y si el servicio se duerme). La exportación masiva de PDF usa hasta ~0,6 GB de memoria y archivos temporales de varios GB para campañas grandes; con límites bajos conviene exportar por lotes (filtros por área o forma). Para producción conviene un plan de pago.

## 0. Subir el código a GitHub

1. Crea un repositorio **privado** en GitHub (nunca público: contiene la lógica de un sistema con datos sensibles).
2. Sube el código (`.gitignore` ya excluye `.env`, los libros de Excel y los datos locales).
3. Verifica que en GitHub **no** aparezcan archivos `.env`, `.xlsm`, `.pgdata` ni `tmp_*`.

## 1. Crear el proyecto

1. Entra a <https://railway.com> con la cuenta de Sanithelp (el correo corporativo, no uno personal).
2. **New Project → Deploy from GitHub repo** y elige el repositorio. Railway detecta Node y usa `railway.json`.
3. En el proyecto: **New → Database → Add PostgreSQL**.

## 2. Variables del servicio web

En el servicio web → **Variables**. Genera cada secreto con `openssl rand -base64 32` (o 48 para `SESSION_SECRET`) y guárdalo en un gestor de contraseñas.

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al servicio Postgres) |
| `APP_BASE_URL` | La URL pública con `https://` (ver paso 3) |
| `SESSION_SECRET` | ≥ 32 caracteres aleatorios |
| `DATA_ENCRYPTION_KEY` | 32 bytes en base64 |
| `BLIND_INDEX_KEY` | 32 bytes en base64, **distinta** de la anterior |
| `ADMIN_BOOTSTRAP_EMAIL` | Correo del primer administrador |
| `ADMIN_BOOTSTRAP_PASSWORD` | Contraseña del primer administrador, ≥ 12 caracteres y robusta |

Si falta una, el servidor **no arranca** y los registros dicen cuál.

> **`DATA_ENCRYPTION_KEY` y `BLIND_INDEX_KEY` no se pueden recuperar.** Si se pierden, los datos cifrados quedan ilegibles. Guarda una copia en un gestor de secretos con acceso para al menos dos personas de Sanithelp. No las cambies sin seguir el procedimiento de rotación (`docs/SEGURIDAD.md`).

## 3. Dominio

Servicio web → **Settings → Networking → Generate Domain** (da una URL `*.up.railway.app`) o **Custom Domain** para uno propio (p. ej. `bateria.sanithelp.com`; Railway indica el registro CNAME a crear en el DNS). Pon esa URL en `APP_BASE_URL` y redespliega.

## 3.b Primer ingreso del administrador

Con el despliegue activo, entra a la URL con `ADMIN_BOOTSTRAP_EMAIL` y la contraseña temporal. El sistema obliga a activar la verificación en dos pasos y guardar los códigos de recuperación. **Esa contraseña queda como la definitiva** (no hay cambio autogestionado), así que debe ser fuerte y guardarse en un gestor de contraseñas; después **bórrala de las variables**. Si hay que cambiarla, otro administrador la restablece.

Alternativa por consola: `ADMIN_BOOTSTRAP_PASSWORD=... npm run create-admin -- correo@dominio.com "Nombre"`.

## 4. Verificar

- `https://TU-DOMINIO/api/health` debe responder `{"status":"ok"}`.
- Railway usa esa ruta como *healthcheck*: si falla, no activa el despliegue nuevo y conserva el anterior.

## 5. Registros, rollback y backups

- **Registros:** servicio web → pestaña *Deployments* → un despliegue → *View logs*. Los registros no contienen datos personales.
- **Rollback:** *Deployments* → un despliegue anterior exitoso → **Rollback**. Ojo: las migraciones de base de datos no se revierten solas; las migraciones de este proyecto son solo aditivas por diseño.
- **Backups:** servicio Postgres → pestaña *Backups* (si el plan la incluye) → programar copias diarias/semanales. Además, `ops/backup.sh` genera una copia cifrada con `pg_dump` + `openssl` (guárdala fuera de Railway) y `ops/restore.sh` la restaura en una base vacía. **Antes de salir a producción hay que probar una restauración real** en un proyecto de prueba y comprobar que la app arranca con ella: los scripts están escritos, pero *no se han podido ejecutar en el entorno de desarrollo* (no tiene `pg_dump`). Recuerda: la copia sin `DATA_ENCRYPTION_KEY` y `BLIND_INDEX_KEY` no sirve de nada.

## 6. Rol de base de datos con privilegios mínimos (recomendado antes de recibir datos reales)

Por defecto Railway da un solo usuario dueño de todo; si la app se conectara con él, podría quitar los triggers que hacen inmutable la auditoría. Para evitarlo:

1. Con el despliegue ya hecho (las migraciones ya crearon las tablas), edita `ops/db-roles.sql` cambiando `__APP_PASSWORD__` por una contraseña larga y aleatoria, y ejecútalo conectado como dueño: `psql "<URL original>" -f ops/db-roles.sql`.
2. En el servicio web: `MIGRATION_DATABASE_URL` = la URL original (dueño) y `DATABASE_URL` = la misma URL pero con usuario `sanithelp_app` y la contraseña nueva.
3. Redespliega. Las migraciones corren con el dueño; la app trabaja con el rol limitado. Tras agregar tablas nuevas, vuelve a ejecutar el script.

Está probado con la suite (`server/tests/dbrole.test.ts`: la app funciona completa con ese rol y no puede alterar la auditoría).

## 7. Operación periódica

| Tarea | Comando | Cuándo |
|---|---|---|
| Rotar la clave de cifrado | Poner la clave nueva en `DATA_ENCRYPTION_KEY` y subir `DATA_ENCRYPTION_KEY_VERSION`; la anterior a `DATA_ENCRYPTION_KEYS_OLD` (`1:base64`); correr `npm run rotate-keys` | Anual o ante sospecha de filtración |
| Retención | `npm run purge-expired -- <meses>` (simula) y luego con `--confirmar` | Según el plazo que defina Sanithelp con su asesor legal |
| Revisar dependencias | `npm audit --omit=dev` | En cada despliegue |

## Desarrollo local

```bash
cp .env.example .env     # completar los secretos
npm ci
npm run migrate
npm run dev:server       # API en :3000
npm run dev:client       # cliente en :5173 (proxy a :3000)
npm test                 # pruebas; usan un PostgreSQL embebido, no necesitas instalar nada
```
