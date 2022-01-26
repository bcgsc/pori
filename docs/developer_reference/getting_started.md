# Getting Started

For working on most of the PORI-related projects you will need to have a number of the components set up. For example, to work on the GraphKB API you will need both an OrientDB server and a Keycloak server already running.

If your institution regularly works on PORI related projects then we reccommend setting up a development instance of the PORI platform which your developers can point their applications to. If you do not have access to something like this, then the easiest way to get the dependencies for whatever part of the PORI platform you are working on up and running is by running the development version of the docker compose configuration found in this repository: [docker-compose.dev.yml](https://github.com/bcgsc/pori/blob/master/docker-compose.dev.yml).

## Start the Authentication Server

First, set up a keycloak instance for development (like the regular set up but you can ignore the https certificates). Since we are not exposing this outside our network and are using it for development and testing only we pass admin/admin as the admin user credentials. You should pick something more secure for non-development or public installations.

```bash
docker run \
    -e KEYCLOAK_USER=admin \
    -e KEYCLOAK_PASSWORD=admin \
    -p 8443:8334 \
    -p 8888:8080 \
    -d \
    bcgsc/pori-auth:latest
```

You should now be able to view the browser-based administrative console by visiting [http://localhost:8888](http://localhost:8888) in your browser.

### Download the Public Key File

After the container is started you can go to the admin console GUI to add a users and download the realm's public key file. This must be done prior to starting the other containers.

You can do this via the GUI as described in the main [install instructions](../install.md) or via a script using the keycloak REST API

```bash
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

# Now fetch the public key file
resp=$(curl -X GET "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/keys" \
        -H 'Content-Type: application/json' \
        -H "Accept: application/json" \
        -H "Authorization: Bearer $token" )

key=$( echo $resp | grep -o '"publicKey":[^,][^,]*' | sed 's/^"publicKey":\s*"//' | sed 's/"$//' )

if [ ! -d "keys" ];
then
    mkdir keys
fi

echo "-----BEGIN PUBLIC KEY-----" > $KEYFILE
echo "$key" >> $KEYFILE
echo "-----END PUBLIC KEY-----" >> $KEYFILE
```

## Create the Default Users

Next, create the users as specified in the main [install instructions](https://bcgsc.github.io/pori/install) or via the script below (uses the same evironmental variables and authentication step as the script to download the key file)

```bash
# Add the default users
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
```

Once keycloak is set up you will need to create some directories for storing database data (so that is persists when you stop and restart your docker containers)

```bash
mkdir -p databases/{postgres,orientdb}/{backup,data}
```

Now you are ready to start up with the dev compose yml

```bash
docker-compose -f docker-compose.dev.yml up -d
```
