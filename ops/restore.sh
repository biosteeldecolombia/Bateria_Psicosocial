#!/usr/bin/env bash
# Restaura una copia creada con backup.sh en una base VACÍA (para pruebas de recuperación o en un desastre).
# Uso:  RESTORE_URL="postgres://..." BACKUP_PASSPHRASE="..." ./ops/restore.sh archivo.dump.enc
set -euo pipefail
: "${RESTORE_URL:?Falta RESTORE_URL (base destino, vacía)}"
: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE}"
file="${1:?Indica el archivo .dump.enc}"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$file" \
  | pg_restore --no-owner --dbname "$RESTORE_URL"
echo "Restauración terminada. Verifica: arrancar la app contra esa base y revisar /api/health."
