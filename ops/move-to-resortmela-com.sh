#!/usr/bin/env bash
#
# Move the platform onto its own domain (2026-09-19).
#
# Run on the server, as root, AFTER the three A records at Namecheap point at
# this machine:
#
#     @    A  194.163.191.50
#     www  A  194.163.191.50
#     api  A  194.163.191.50
#
#   bash move-to-resortmela-com.sh --check    # is DNS there yet?
#   bash move-to-resortmela-com.sh --dry-run  # print what it would do
#   bash move-to-resortmela-com.sh            # do it
#
# What it does NOT touch, deliberately:
#
#   * MX and SPF for resortmela.com. Mail to platform@resortmela.com is
#     forwarded by Namecheap and has nothing to do with this machine.
#   * The old hostnames. `resortmela.rootcodebd.com` keeps SERVING the console
#     and `backresort.rootcodebd.com` keeps serving the API — no redirect. An
#     app already on somebody's phone knows only the old address, and API keys
#     an agency has already deployed name the old API. They stop being the
#     advertised address; they do not stop working.
#   * Any file belonging to the dozen other businesses on this box. This writes
#     exactly one nginx file, named so that neither Hestia nor
#     provision-resort-domains.sh can collide with it.
#
set -euo pipefail

MODE="${1:-run}"
IP="194.163.191.50"
APP_DIR="${APP_DIR:-/opt/resortmela}"
WEBROOT="${WEBROOT:-/var/www/letsencrypt}"
CONF="/etc/nginx/conf.d/domains/resortmela-platform.conf"
UPLOAD_ROOT="${UPLOAD_ROOT:-/var/lib/resortmela/uploads}"
WEB="resortmela.com"
WWW="www.resortmela.com"
API="api.resortmela.com"
CERT_NAME="resortmela.com"

say() { printf '%s\n' "$*"; }
run() { if [[ "$MODE" == "--dry-run" ]]; then say "  would: $*"; else "$@"; fi; }

# ── is DNS there yet? ────────────────────────────────────────────────────
check_dns() {
  local bad=0
  for h in "$WEB" "$WWW" "$API"; do
    local got
    got="$(dig +short "$h" A @1.1.1.1 | tail -1)"
    if [[ "$got" == "$IP" ]]; then
      say "  $h -> $got  ok"
    else
      say "  $h -> ${got:-(nothing)}  expected $IP"
      bad=1
    fi
  done
  return $bad
}

if [[ "$MODE" == "--check" ]]; then
  say "DNS:"
  check_dns && say "All three point here." || say "Not yet — Let's Encrypt will refuse until they do."
  exit 0
fi

say "DNS:"
if ! check_dns; then
  say ""
  say "Refusing: a certificate cannot be issued until all three resolve here."
  exit 1
fi

# ── 1. port 80, so ACME has somewhere to answer ──────────────────────────
mkdir -p "$WEBROOT"
if [[ ! -f "$CONF" ]]; then
  say ""
  say "Writing the http-only vhost so Let's Encrypt can answer."
  if [[ "$MODE" == "--dry-run" ]]; then
    say "  would write $CONF"
  else
    cat > "$CONF" <<NGINX
# Written by move-to-resortmela-com.sh. The platform's own hostnames.
server {
    listen ${IP}:80;
    server_name ${WEB} ${WWW} ${API};
    location ^~ /.well-known/acme-challenge/ { root ${WEBROOT}; }
    location / { return 301 https://\$host\$request_uri; }
}
NGINX
  fi
  run nginx -t
  run systemctl reload nginx
fi

# ── 2. one certificate covering all three ────────────────────────────────
if [[ -d "/etc/letsencrypt/live/${CERT_NAME}" ]]; then
  say "Certificate already there."
else
  say "Asking Let's Encrypt for ${WEB}, ${WWW}, ${API}."
  run certbot certonly --webroot -w "$WEBROOT" \
    -d "$WEB" -d "$WWW" -d "$API" \
    --cert-name "$CERT_NAME" --non-interactive --agree-tos \
    -m "platform@resortmela.com"
fi

# ── 3. the real vhosts ───────────────────────────────────────────────────
say "Writing the https vhosts."
if [[ "$MODE" == "--dry-run" ]]; then
  say "  would write $CONF (apex -> web:3000, www -> apex, api -> 4000)"
else
  cat > "$CONF" <<NGINX
# Written by move-to-resortmela-com.sh. The platform's own hostnames.
#
# The apex serves the console and the marketing site; www redirects to it so
# there is one address and one thing to index; api serves the API.
server {
    listen ${IP}:80;
    server_name ${WEB} ${WWW} ${API};
    location ^~ /.well-known/acme-challenge/ { root ${WEBROOT}; }
    location / { return 301 https://\$host\$request_uri; }
}

# www -> the apex. A redirect, not a second copy of the site.
server {
    listen ${IP}:443 ssl;
    http2 on;
    server_name ${WWW};
    ssl_certificate /etc/letsencrypt/live/${CERT_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${CERT_NAME}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    return 301 https://${WEB}\$request_uri;
}

# the console and the marketing site
server {
    listen ${IP}:443 ssl;
    http2 on;
    server_name ${WEB};
    ssl_certificate /etc/letsencrypt/live/${CERT_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${CERT_NAME}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 25m;

    # the pictures, straight off the disk — same as a resort's own domain gets
    location /uploads/ {
        alias ${UPLOAD_ROOT}/;
        access_log off;
        expires max;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        # the Host is the whole routing decision on the other side
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}

# the API
server {
    listen ${IP}:443 ssl;
    http2 on;
    server_name ${API};
    ssl_certificate /etc/letsencrypt/live/${CERT_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${CERT_NAME}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
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
  say "nginx refused the config — stopping, nothing reloaded."
  exit 1
fi
run systemctl reload nginx

say ""
say "nginx is serving ${WEB}, ${WWW} and ${API}."
say "Next: update ${APP_DIR}/.env and apps/web/.env, rebuild the web app, restart both."
