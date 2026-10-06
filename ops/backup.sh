#!/usr/bin/env bash
# Copia de seguridad cifrada de la base de datos.
# Uso:  BACKUP_URL="postgres://..." BACKUP_PASSPHRASE="..." ./ops/backup.sh [carpeta_destino]
# Requiere pg_dump y openssl. La copia contiene datos ya cifrados por la aplicación (AES-256-GCM), pero se cifra de nuevo
# con una frase propia: guárdala APARTE de las claves DATA_ENCRYPTION_KEY y BLIND_INDEX_KEY (sin ellas la copia no sirve).
set -euo pipefail
: "${BACKUP_URL:?Falta BACKUP_URL}"
: "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE}"
dest="${1:-.}"
mkdir -p "$dest"
file="$dest/bateria_$(date -u +%Y%m%dT%H%M%SZ).dump.enc"
pg_dump --format=custom --no-owner "$BACKUP_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$file"
echo "Copia creada: $file"
