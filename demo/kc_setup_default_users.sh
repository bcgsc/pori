
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

# Add the default users with some generated passwords

BODY_TEMPLATE='{"username": "<USERNAME>", "enabled": true, "credentials": [{"type": "password", "value": "<PASSWORD>", "temporary": false}], "realmRoles": ["IPR", "GraphKB"]}'

for username in graphkb_admin graphkb_importer ipr_graphkb_link iprdemo colab_demo
do
    echo "Adding user: $username"
    echo "setting user (${username}) with password (${DEFAULT_PASSWORD})"
    body=${BODY_TEMPLATE/<USERNAME>/$username}
    body=${body/<PASSWORD>/$DEFAULT_PASSWORD}

    curl -X POST "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users" \
        -H 'Content-Type: application/json' \
        -H "Accept: application/json" \
        -H "Authorization: Bearer $token" \
        -d "$body"
done

echo ""
