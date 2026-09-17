#!/usr/bin/env bash
# Troca uma conta de serviço do Google (JSON) por um token de acesso OAuth2,
# assinando o JWT diretamente com a chave privada (fluxo "JWT Bearer" padrão
# do OAuth2 para contas de serviço). Não depende de nenhuma API extra do
# Google Cloud precisar estar habilitada — só o endpoint de token, que é
# sempre público.
#
# Uso: gcp_jwt_token.sh <caminho-do-service-account.json> [escopo]
set -euo pipefail

SA_KEY_FILE="$1"
SCOPE="${2:-https://www.googleapis.com/auth/datastore}"

CLIENT_EMAIL=$(jq -r '.client_email' "$SA_KEY_FILE")
PRIVATE_KEY=$(jq -r '.private_key' "$SA_KEY_FILE")

NOW=$(date +%s)
EXP=$((NOW + 3600))

b64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

HEADER=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
CLAIMS=$(printf '{"iss":"%s","scope":"%s","aud":"https://oauth2.googleapis.com/token","exp":%d,"iat":%d}' \
  "$CLIENT_EMAIL" "$SCOPE" "$EXP" "$NOW" | b64url)

UNSIGNED="${HEADER}.${CLAIMS}"

SIGNATURE=$(printf '%s' "$UNSIGNED" | openssl dgst -sha256 -sign <(printf '%s' "$PRIVATE_KEY") | b64url)

JWT="${UNSIGNED}.${SIGNATURE}"

RESPONSE=$(curl -sf -X POST https://oauth2.googleapis.com/token \
  --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
  --data-urlencode "assertion=${JWT}")

TOKEN=$(printf '%s' "$RESPONSE" | jq -r '.access_token // empty')
if [ -z "$TOKEN" ]; then
  echo "Falha ao obter access_token. Resposta do Google:" >&2
  echo "$RESPONSE" >&2
  exit 1
fi
echo "$TOKEN"
