#!/usr/bin/env bash
#
# Genera un certificado TLS local para servir MediaServer por HTTPS en la LAN.
# Es necesario para poder instalar la PWA en Android, que exige un contexto
# seguro (HTTPS); por HTTP en una IP de LAN no ofrece «Instalar app».
#
# Uso:
#   scripts/gen-certs.sh <IP-o-nombre-de-la-máquina>
#
# Ejemplo:
#   scripts/gen-certs.sh 192.168.50.3
#
# Genera en certs/:
#   rootCA.pem      → instalar en el móvil como «Certificado de CA»
#   server.pem      → montar en el contenedor (TLS_CERT)
#   server-key.pem  → montar en el contenedor (TLS_KEY)
#
# Usa `mkcert` si está disponible (lo recomendado); si no, cae a `openssl`.
set -euo pipefail

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "Falta el argumento: la IP o el nombre con el que accedes al servidor." >&2
  echo "  $0 192.168.50.3" >&2
  exit 1
fi

OUT="$(cd "$(dirname "$0")/.." && pwd)/certs"
mkdir -p "$OUT"

if command -v mkcert >/dev/null 2>&1; then
  echo ">> mkcert: creando la autoridad de certificación local…"
  mkcert -install

  echo ">> mkcert: certificado para '$NAME' (+ localhost/127.0.0.1)…"
  mkcert \
    -cert-file "$OUT/server.pem" \
    -key-file "$OUT/server-key.pem" \
    "$NAME" localhost 127.0.0.1

  echo
  echo "CA raíz para instalar en el móvil:"
  echo "  $(mkcert -CAROOT)/rootCA.pem"
else
  echo ">> openssl: mkcert no está instalado; uso openssl (instala mkcert para simplificar)."

  # Determina si el argumento es una IP (va en subjectAltName como IP) o un nombre.
  if echo "$NAME" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    SAN_LINE="IP.2 = $NAME"
  else
    SAN_LINE="DNS.2 = $NAME"
  fi

  # 1. Autoridad de certificación local (10 años).
  openssl genrsa -out "$OUT/ca-key.pem" 2048 2>/dev/null
  openssl req -x509 -new -nodes -key "$OUT/ca-key.pem" -sha256 -days 3650 \
    -subj "/CN=MediaServer Local CA" -out "$OUT/rootCA.pem" 2>/dev/null

  # 2. Clave y certificado del servidor, firmado por la CA anterior.
  openssl genrsa -out "$OUT/server-key.pem" 2048 2>/dev/null
  cat > "$OUT/server.cnf" <<EOF
[req]
distinguished_name = dn
req_extensions = ext
prompt = no
[dn]
CN = MediaServer
[ext]
subjectAltName = @alt_names
[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
$SAN_LINE
EOF
  openssl req -new -key "$OUT/server-key.pem" -config "$OUT/server.cnf" -out "$OUT/server.csr" 2>/dev/null
  openssl x509 -req -in "$OUT/server.csr" -CA "$OUT/rootCA.pem" -CAkey "$OUT/ca-key.pem" \
    -CAcreateserial -days 825 -sha256 -extensions ext -extfile "$OUT/server.cnf" \
    -out "$OUT/server.pem" 2>/dev/null

  rm -f "$OUT/server.csr" "$OUT/server.cnf"

  echo
  echo "CA raíz para instalar en el móvil:"
  echo "  $OUT/rootCA.pem"
fi

echo
echo "Listo. Monta en el contenedor:"
echo "  certs/server.pem     → TLS_CERT"
echo "  certs/server-key.pem → TLS_KEY"
echo "  (puerto HTTPS por defecto: 3443)"
