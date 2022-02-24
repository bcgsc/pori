#!/bin/bash

if [ "$#" -ne 5 ];
then
    echo "Given: $@"
    echo ""
    echo "Argument Error:"
    echo "$0 <URL> <USER> <PASS> <REALM> <KEYFILE>"
    exit 1
fi

echo "KEYCLOAK_URL=$1"
KEYCLOAK_URL=$1
echo "KEYCLOAK_USER=$2"
KEYCLOAK_USER=$2
echo "KEYCLOAK_PASSWORD=$3"
KEYCLOAK_PASSWORD=$3
echo "KEYCLOAK_REALM=$4"
KEYCLOAK_REALM=$4
echo "KEYFILE=$5"
KEYFILE=$5

# Get the Admin user token
echo "POST ${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token"
auth_resp=$(curl -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=${KEYCLOAK_USER}" \
    -d "password=${KEYCLOAK_PASSWORD}" \
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
echo "writing: $KEYFILE"
echo "-----BEGIN PUBLIC KEY-----" > $KEYFILE
echo "$key" >> $KEYFILE
echo "-----END PUBLIC KEY-----" >> $KEYFILE
