#!/usr/bin/env bash
#
# Give a resort's own domain a certificate and a vhost (2026-09-15 design, §5).
#
# Run by a person or a timer, on the server, as root. The application never runs
# this and never does any of it: a bug in a request handler must not be able to
# edit a web server that serves a dozen businesses that are not ours.
#
#   bash provision-resort-domains.sh            # do it
#   bash provision-resort-domains.sh --dry-run  # print what it would do
#
# Three rules it never breaks:
#
#   1. It writes only /etc/nginx/conf.d/domains/resortmela-*.conf. Hestia names
#      its own files <domain>.conf, so the two cannot collide and this can never
#      overwrite a file it did not create.
#   2. It edits nginx.conf never. The wildcard include is already there.
#   3. It reloads only after `nginx -t` passes. A bad config leaves the running
#      one alone and stops.
#
set -euo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

APP_DIR="${APP_DIR:-/opt/resortmela}"
NGINX_DIR="/etc/nginx/conf.d/domains"
PREFIX="resortmela-"
WEBROOT="${WEBROOT:-/var/www/letsencrypt}"
WEB_PORT="${WEB_PORT:-3000}"
# the address the other vhosts on this box listen on; nginx here is not
# listening on a wildcard, and copying that is what keeps us consistent with it
LISTEN_IP="${LISTEN_IP:-194.163.191.50}"
CERT_EMAIL="${CERT_EMAIL:-}"

say() { printf '%s\n' "$*"; }
run() { if (( DRY_RUN )); then say "  would: $*"; else "$@"; fi; }

# ── what needs doing ─────────────────────────────────────────────────────
# Verified, not yet provisioned. Read straight from the database because this
# script is the thing the application is deliberately not allowed to be.
mapfile -t HOSTS < <(
  mysql --batch --skip-column-names resortmela -e \
    "SELECT host FROM resort_domains WHERE verifiedAt IS NOT NULL AND provisionedAt IS NULL ORDER BY id;"
)

if (( ${#HOSTS[@]} == 0 )); then
  say "Nothing waiting."
  exit 0
fi

say "${#HOSTS[@]} domain(s) waiting:"
printf '  %s\n' "${HOSTS[@]}"
mkdir -p "$WEBROOT"

for HOST in "${HOSTS[@]}"; do
  say ""
  say "── $HOST ─────────────────────────────────────────"

  # paranoia, cheaply: this string becomes a filename and a server_name, and it
  # came out of a database. It should already be a hostname; make sure.
  if [[ ! "$HOST" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]]; then
    say "  refusing: not a hostname"
    continue
  fi

  CONF="$NGINX_DIR/${PREFIX}${HOST}.conf"

  # ── 1. a port-80 server, so ACME has somewhere to answer ───────────────
  if [[ ! -f "$CONF" ]]; then
    say "  writing the http-only vhost"
    if (( DRY_RUN )); then
      say "  would write $CONF (http, acme + redirect)"
    else
      cat > "$CONF" <<NGINX
# Written by provision-resort-domains.sh. Do not edit by hand.
server {
    listen ${LISTEN_IP}:80;
    server_name ${HOST};
    location ^~ /.well-known/acme-challenge/ { root ${WEBROOT}; }
    location / { return 301 https://\$host\$request_uri; }
}
NGINX
    fi
    run nginx -t
    run systemctl reload nginx
  fi

  # ── 2. the certificate, over the webroot ───────────────────────────────
  if [[ -d "/etc/letsencrypt/live/${HOST}" ]]; then
    say "  certificate already there"
  else
    say "  asking Let's Encrypt"
    EMAIL_ARG=(--register-unsafely-without-email)
    [[ -n "$CERT_EMAIL" ]] && EMAIL_ARG=(-m "$CERT_EMAIL")
    if ! run certbot certonly --webroot -w "$WEBROOT" -d "$HOST" \
      --non-interactive --agree-tos "${EMAIL_ARG[@]}"; then
      # a failure is nearly always DNS that has not moved yet; leave the row
      # unprovisioned and let the next run try again, rather than looping into
      # Let's Encrypt's rate limit
      say "  certbot refused — leaving it for the next run"
      continue
    fi
  fi

  # ── 3. the real vhost ──────────────────────────────────────────────────
  say "  writing the https vhost"
  if (( DRY_RUN )); then
    say "  would write $CONF (http redirect + https proxy to 127.0.0.1:${WEB_PORT})"
  else
    cat > "$CONF" <<NGINX
# Written by provision-resort-domains.sh. Do not edit by hand.
server {
    listen ${LISTEN_IP}:80;
    server_name ${HOST};
    location ^~ /.well-known/acme-challenge/ { root ${WEBROOT}; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen ${LISTEN_IP}:443 ssl;
    http2 on;
    server_name ${HOST};

    ssl_certificate /etc/letsencrypt/live/${HOST}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${HOST}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # the pictures, straight off the disk: these never need to travel through
    # Node, and their names are content hashes so they can be cached for ever
    location /uploads/ {
        alias ${APP_DIR}/apps/api/var/uploads/;
        access_log off;
        expires max;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:${WEB_PORT};
        proxy_http_version 1.1;
        # the Host is the whole routing decision on the other side — the
        # middleware reads it to know whose site this is
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
NGINX
  fi

  if ! run nginx -t; then
    say "  nginx refused the config — stopping, nothing reloaded"
    exit 1
  fi
  run systemctl reload nginx

  # ── 4. say so, so the owner's screen stops saying "waiting for us" ─────
  if (( DRY_RUN )); then
    say "  would mark $HOST provisioned"
  else
    mysql resortmela -e \
      "UPDATE resort_domains SET provisionedAt = NOW() WHERE host = '${HOST}' AND verifiedAt IS NOT NULL;"
  fi
  say "  live"
done

say ""
say "Done."
