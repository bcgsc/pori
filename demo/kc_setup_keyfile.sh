
export KEYCLOAK_ADMIN_USER=admin
export KEYCLOAK_ADMIN_PASS=admin
export KEYCLOAK_REALM=PORI
export KEYCLOAK_URL=http://localhost:8888/auth
export DEFAULT_PASSWORD=secret

KEYFILE=keys/keycloak.key

# Get the Admin user token
auth_resp=$(curl -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=${KEYCLOAK_ADMIN_USER}" \
    -d "password=${KEYCLOAK_ADMIN_PASS}" \
    -d 'grant_type=password' \
    -d 'client_id=admin-cli')

token=$( echo $auth_resp | grep -o '"access_token":[^,][^,]*' | sed 's/^"access_token":\s*"//' | sed 's/"$//' )

if [ "$token" = "" ];
then
    echo "FAILED to get authorization token"
    exit 1
fi

# Now fetch the public key file
resp=$(curl -X GET "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/keys" \
        -H 'Content-Type: application/json' \
        -H "Accept: application/json" \
        -H "Authorization: Bearer $token" )
# echo $resp

key=$( echo $resp | grep -o '"publicKey":[^,][^,]*' | sed 's/^"publicKey":\s*"//' | sed 's/"$//' )

if [ ! -d "keys" ];
then
    mkdir keys
fi

echo "writing: $KEYFILE"
echo "-----BEGIN PUBLIC KEY-----" > $KEYFILE
echo "$key" >> $KEYFILE
echo "-----END PUBLIC KEY-----" >> $KEYFILE
