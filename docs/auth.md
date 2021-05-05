# Keycloak Server Setup (Legacy)

- [Server Requirements](#server-requirements)
- [Installation](#installation)
- [Configuration](#configuration)
  - [Create a new realm](#create-a-new-realm)
  - [Set up a User Federation](#set-up-a-user-federation)
  - [Set Up and Grant Roles](#set-up-and-grant-roles)
  - [Set up a Client](#set-up-a-client)
  - [Group Mappers](#group-mappers)

## Server Requirements

Keycloak is available on Windows. However this guide uses an installation on a centos7 server.

- 1 CPU Core, 4GB of Memory and 30GB of disk space

## Installation

Docs will follow the procedure for installing and setting up a Keycloak realm on Keycloak version 4.8.3 on Centos 7.

Download Keycloak 4.8.3 TAR File https://www.keycloak.org/downloads-archive.html
Place your TAR file in the /opt/ directory and untar it.

```bash
cd /opt/
tar -xvf keycloak-4.8.3.Final.tar.gz
```

Edit the standalone.xml file for keycloak.

```bash
vi /opt/keycloak-4.8.3.Final/standalone/configuration/standalone.xml
```

Configure the conf file to find your SSL certificate. Look for the "UndertowRealm" Section. External Docs: https://wjw465150.gitbooks.io/keycloak-documentation/content/server_installation/topics/network/https.html

```xml
<security-realm name="UndertowRealm">
    <server-identities>
        <ssl>
            <keystore path="keycloak.jks" relative-to="jboss.server.config.dir" keystore-password="secret" />
        </ssl>
    </server-identities>
</security-realm>
```

Additionally, Find the element server `name="default-server"` (it’s a child element of subsystem `xmlns="urn:jboss:domain:undertow:3.0"`) and add:

```xml
<subsystem xmlns="urn:jboss:domain:undertow:3.0">
   <buffer-cache name="default"/>
   <server name="default-server">
      <https-listener name="https" socket-binding="https" security-realm="UndertowRealm"/>
   ...
</subsystem>
```

Then, we need to modify the address binds to the IP address, localhost may also work

```xml
<inet-address value="${jboss.bind.address.management:xx.xx.xx.xx}"/>
        </interface>
        <interface name="public">
            <inet-address value="${jboss.bind.address:xx.xx.xx.xx}"/>
```

Lastly at the bottom of the file modify these ports to 80 and 443 and then save standalone.xml, like so:

```xml
        <socket-binding name="http" port="${jboss.http.port:80}"/>
        <socket-binding name="https" port="${jboss.https.port:443}"/>
```

The keycloak server can be started by running the binary. Server can also be configured to run as a service

```bash
/opt/keycloak-4.8.3.Final/bin/standalone.sh
```

## Configuration

Opening the webpage for keycloak, follow the instructions to set a secure administrator account. Once that is done and you are signed in we will want to start by setting up a new realm

### Create a new realm

In order to configure a realm from scratch you simply add a realm in the top left of the keycloak console. The realm name is trivial but its usually good to let it describe the scope of what applications will authenticate with it. All applications that authenticate with the realm will have single sign on between them.

In order for an application to use keycloak they need to receive the realm's public key, this can be found under `<RealmName>` → Realm Settings → Keys then click the Public key button for the RSA Type, copy that value and give it to the necessary parties. This value is static so you can always come back here to find it.

Once a realm is created we then need to add a user management system, for these docs it will be ldap.  It is also possible to create keycloak internal users in addition to importing users from a user federation.

### Set up a User Federation

To set up a ldap connection navigate to the User Federation tab under the new realm. Create a new ldap and fill the values as they pertain to your ldaps settings. It will be necessary to set up the timed sync near the bottom, without this keycloak won't update from ldap on its own.

### Set Up and Grant Roles

The way roles function is pretty simple, they are created under the `<RealmName>` → Roles tab using the Add Role button where a name is put in. You will want to create a roll for each application authenticating with keycloak in this realm.

These roles are granted to the user by going to `<RealmName>` → Users → `<UsersName>` → Role Mappings then moving roles into the Assigned Role column. Client Roles are available on the same screen by selecting the related client under the Client Roles and moving the Role to the Assigned Role column.

When the user authenticates their roles are tacked on in their session so the apps can check for what roles they have been granted.

### Set up a Client

Clients are needed to control what applications are allowed to authenticate. I'll walk through the necessary fields and what they do. Clients should be created for each application being used by the realm.

Navigate to the `<RealmName>` → Clients then create a new client. Select a name and continue, no other changes are needed. Once created, open the client to make some minor adjustments.

Openid-connect is the correct protocol to use and we will want to turn Implicit Flow Enabled to On

Root URIs can stay blank, they aren't a required field.

Valid Redirect URIs is the most important field to be configured, each of these is an entry that is allowed to redirect over to keycloak to authenticate. So if `https://app.domain.ca/*` for example is not in this list, the app would not be able authenticate with this realm and client. It is possible to just use * for this value, but it is a bit of a security concern.

Web Orgins is a field used for CORS related requests, typically the value of + is suitable as this just allows all Valid Redirect URIs.

Client Roles we briefly covered above, but these roles are roles that only pertain to the client, so a smaller scope than Realm Roles. A good time to use Client Roles is for access that is only for that application. These are created under `<RealmName>` → Clients → `<ClientName>` → Roles

### Group Mappers

Group Mappers are an extremely helpful tool for us to control Role access in keycloak with ldap webgroups. We can accomplish this by navigating `<RealmName>` → UserFederation → Ldap → Mappers then creating a new mapper with type group-ldap mapper. We then need to fill the config with information pertaining to your ldap set up and specify which group in LDAP Filter.

Once we sync the group in to keycloak that group will appear in `<RealmName>` → Groups. Then open Edit on the imported group. Under Role Mappings we can give an Available Role (Client or Realm) to the group. Thus giving any user in that group the assigned role.
