#!/usr/bin/env bash
#
# Configura el SMTP propio del proyecto de Supabase, que es lo que hace falta
# para poder encender la confirmacion por correo.
#
# Por que hace falta: sin SMTP propio, Supabase manda los correos de auth con su
# servicio integrado, limitado a **2 por hora** y pensado solo para desarrollo.
# Encender la confirmacion con ese limite deja fuera a cualquiera que se registre
# a partir del tercero de cada hora.
#
# Las credenciales salen de `.env.local` (que esta en .gitignore). Este script
# **nunca imprime la contrasena**.
#
#   ./scripts/setup-smtp.sh            # aplica el SMTP de .env.local
#   ./scripts/setup-smtp.sh --verify   # solo enseña como esta ahora
#   ./scripts/setup-smtp.sh --enable-confirmation
#                                      # ademas exige confirmar el correo
#   ./scripts/setup-smtp.sh --disable-confirmation
#                                      # vuelve atras (autoconfirm)
#
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="apply"
case "${1:-}" in
  --verify)               MODE="verify" ;;
  --enable-confirmation)  MODE="enable" ;;
  --disable-confirmation) MODE="disable" ;;
  "")                     ;;
  *) echo "Opcion desconocida: $1" >&2; exit 2 ;;
esac

[ -f .env.local ] || { echo "Falta .env.local (ver docs/BACKEND.md)." >&2; exit 1; }
set -a; . ./.env.local; set +a

: "${SUPABASE_PROJECT_REF:?falta SUPABASE_PROJECT_REF en .env.local}"
: "${SUPABASE_ACCESS_TOKEN:?falta SUPABASE_ACCESS_TOKEN en .env.local}"

API="https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth"

show() {
  curl -sf "$API" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | python3 -c '
import json, sys
d = json.load(sys.stdin)
host = d.get("smtp_host")
print("  SMTP host      :", host or "(sin configurar - usa el servicio integrado de Supabase)")
print("  SMTP port      :", d.get("smtp_port") or "-")
print("  SMTP user      :", d.get("smtp_user") or "-")
print("  SMTP pass      :", "(guardada)" if d.get("smtp_pass") else "-")
print("  Remitente      :", d.get("smtp_admin_email") or "-")
print("  Nombre visible :", d.get("smtp_sender_name") or "-")
auto = d.get("mailer_autoconfirm")
print("  Confirmacion   :", "APAGADA (autoconfirm: entra sin confirmar)" if auto else "ENCENDIDA (hay que confirmar el correo)")
print("  site_url       :", d.get("site_url") or "-")
if not host:
    print()
    print("  Limite actual  : 2 correos por hora (integrado). No sirve para produccion.")
'
}

patch() { # $1 = json body
  curl -sf -X PATCH "$API" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$1" > /dev/null
}

if [ "$MODE" = "verify" ]; then
  echo "Configuracion de correo del proyecto $SUPABASE_PROJECT_REF:"; echo
  show; exit 0
fi

if [ "$MODE" = "enable" ] || [ "$MODE" = "disable" ]; then
  if [ "$MODE" = "enable" ]; then
    # No se enciende la confirmacion sin SMTP propio: seria dejar a la gente
    # fuera en cuanto pasen 2 registros en una hora.
    HOST=$(curl -sf "$API" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
      | python3 -c 'import json,sys; print(json.load(sys.stdin).get("smtp_host") or "")')
    if [ -z "$HOST" ]; then
      echo "ERROR: no hay SMTP propio configurado." >&2
      echo "Encender la confirmacion ahora dejaria el registro limitado a 2 correos por hora." >&2
      echo "Corre primero ./scripts/setup-smtp.sh" >&2
      exit 1
    fi
    patch '{"mailer_autoconfirm": false}'
    echo "Confirmacion por correo ENCENDIDA. Quien se registre tendra que abrir el enlace."
  else
    patch '{"mailer_autoconfirm": true}'
    echo "Confirmacion por correo APAGADA. El registro entra directo."
  fi
  echo; show; exit 0
fi

# --- aplicar el SMTP ---------------------------------------------------------
: "${SMTP_HOST:?falta SMTP_HOST en .env.local}"
: "${SMTP_PORT:?falta SMTP_PORT en .env.local}"
: "${SMTP_USER:?falta SMTP_USER en .env.local}"
: "${SMTP_PASS:?falta SMTP_PASS en .env.local}"
: "${SMTP_ADMIN_EMAIL:?falta SMTP_ADMIN_EMAIL en .env.local (el remitente)}"
# `export` a proposito: `set -a` solo alcanza a lo que viene de .env.local, y
# el bloque de python de abajo lee esto por os.environ.
export SMTP_SENDER_NAME="${SMTP_SENDER_NAME:-X AutoHub}"

BODY=$(python3 - <<'PY'
import json, os
print(json.dumps({
    "smtp_host": os.environ["SMTP_HOST"],
    "smtp_port": str(os.environ["SMTP_PORT"]),
    "smtp_user": os.environ["SMTP_USER"],
    "smtp_pass": os.environ["SMTP_PASS"],
    "smtp_admin_email": os.environ["SMTP_ADMIN_EMAIL"],
    "smtp_sender_name": os.environ["SMTP_SENDER_NAME"],
}))
PY
)

echo "Aplicando SMTP a $SUPABASE_PROJECT_REF ($SMTP_HOST:$SMTP_PORT como $SMTP_USER)..."
patch "$BODY"
echo "Listo."; echo
show
echo
echo "Siguiente paso: probar un registro real. Si el correo llega, encender la"
echo "confirmacion con:  ./scripts/setup-smtp.sh --enable-confirmation"
