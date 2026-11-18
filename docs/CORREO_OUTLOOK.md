# Correo saliente con Outlook (Microsoft 365)

La plataforma envía correos para: **credenciales de una campaña** (icono de sobre), **código personal para continuar** (si la persona escribe su correo), **código de verificación en dos pasos** y **resumen diario de pendientes**. Se configura con variables de entorno del servicio (en Railway: *Variables*). **Ninguna llave se escribe en el código ni se sube al repositorio.**

Hay dos formas. Pídele a quien administra el Microsoft 365 de la empresa que haga **una** de ellas; la primera es la recomendada.

---

## Opción A (recomendada): Microsoft Graph

No usa la contraseña de ningún buzón: usa una «aplicación» registrada que solo puede **enviar correo**. Quien tenga rol de administrador en el centro de administración de Entra ID / Microsoft 365 debe:

1. Entrar a **https://entra.microsoft.com** → *Identidad* → *Aplicaciones* → *Registros de aplicaciones* → **Nuevo registro**.
   - Nombre: `Sanithelp Evaluaciones – Correo`. Tipo de cuenta: *Solo esta organización*. Registrar.
2. En la pantalla de la aplicación, copiar:
   - **Id. de aplicación (cliente)** → `MS_CLIENT_ID`
   - **Id. de directorio (inquilino)** → `MS_TENANT_ID`
3. *Certificados y secretos* → **Nuevo secreto de cliente** (duración 24 meses). Copiar el **Valor** (solo se ve una vez) → `MS_CLIENT_SECRET`. Anotar la fecha de vencimiento para renovarlo.
4. *Permisos de API* → **Agregar un permiso** → *Microsoft Graph* → **Permisos de aplicación** → buscar **`Mail.Send`** → Agregar → **Conceder consentimiento de administrador** para la organización.
5. **Recomendado (seguridad):** limitar la aplicación a un solo buzón, para que no pueda enviar como cualquier persona de la empresa. En PowerShell con *Exchange Online*:
   ```powershell
   New-ApplicationAccessPolicy -AppId <MS_CLIENT_ID> -PolicyScopeGroupId evaluaciones@sanithelp.com -AccessRight RestrictAccess -Description "Sanithelp evaluaciones"
   ```
6. Definir el buzón remitente (debe existir; puede ser un buzón compartido): `MAIL_FROM=evaluaciones@sanithelp.com`.

Variables a cargar en el servicio:

```
MAIL_PROVIDER=graph
MAIL_FROM=evaluaciones@sanithelp.com
MAIL_FROM_NAME=Sanithelp
MS_TENANT_ID=...
MS_CLIENT_ID=...
MS_CLIENT_SECRET=...
```

## Opción B: SMTP (más simple, pero a menudo está desactivada)

Sirve si el administrador permite «SMTP autenticado» en el buzón (Centro de administración de Microsoft 365 → Usuarios → el buzón → *Correo* → *Administrar aplicaciones de correo electrónico* → marcar **SMTP autenticado**). Si la organización tiene *Security Defaults* o MFA obligatoria en ese buzón, hay que usar una **contraseña de aplicación** o la Opción A.

```
MAIL_PROVIDER=smtp
MAIL_FROM=evaluaciones@sanithelp.com
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=evaluaciones@sanithelp.com
SMTP_PASSWORD=...
```

---

## Opción C: Brevo (API por HTTPS; sin administrador de Microsoft)

Sirve cuando el hosting (Railway) bloquea SMTP y no se puede registrar una app en Microsoft. Las credenciales y códigos pasan por Brevo (servicio de correo transaccional): valídalo con la política de datos de la empresa.

1. Crear cuenta en https://www.brevo.com (plan gratis: ~300 correos/día).
2. *Remitentes, dominios e IP* → *Remitentes* → agregar `resultados@sanithelp.com`; llega un enlace de verificación a ese buzón. (Opcional, mejora la entrega: autenticar el dominio con los registros DNS que indica Brevo.)
3. *SMTP y API* → *Claves de API* → crear una y copiarla.

```
MAIL_PROVIDER=brevo
MAIL_FROM=resultados@sanithelp.com
MAIL_FROM_NAME=Sanithelp
BREVO_API_KEY=...
```

## Cómo probar

1. Reiniciar el servicio con las variables cargadas.
2. Entrar como administrador → **Configuración** → *Correo (Outlook)*: debe decir «Conectado». Escribe tu correo y pulsa **Enviar prueba**.
3. En **Campañas**, el icono de sobre ✉ envía la credencial a una o varias direcciones (hasta 20 por envío; cada persona recibe su propio correo).

## Qué se guarda y qué no

- Las direcciones de correo de las personas **no se guardan** (ni en la base ni en la auditoría): se usan para enviar y se descartan. La auditoría solo anota cuántos correos se enviaron.
- El correo de la persona que responde se usa solo para enviarle su código de continuar.
- Los códigos de verificación se guardan solo como hash y vencen a los 10 minutos.

## Problemas frecuentes

| Mensaje | Causa |
|---|---|
| «Microsoft rechazó las llaves (401)» | Tenant, id o secreto incorrectos, o el secreto venció. |
| «Microsoft Graph respondió 403 al enviar» | Falta conceder el consentimiento de administrador a `Mail.Send`, o la política de acceso no incluye el buzón. |
| «Microsoft Graph respondió 404» | `MAIL_FROM` no existe como buzón. |
| Los correos llegan a spam | Pedir a TI que agreguen SPF/DKIM del dominio (ya los trae Microsoft 365) y que marquen el remitente como seguro. |
