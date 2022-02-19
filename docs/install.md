
# Install with Docker

Since PORI is a production-ready, institution-level, scalable platform, the simplest way to get the entire platform up and running from scratch is using [docker](https://www.docker.com/).  For simplicity the default instructions set up the platform with http.

Most of the servers are auto-started together with docker-compose but the keycloak container must be started and configured on its own first.

Start by cloning this repository which contains the default docker compose configs (`docker-compose.yml` and `docker-compose.dev.yml`)

```bash
git clone https://github.com/bcgsc/pori.git
cd pori
```

For working on most of the PORI-related projects you will need to have a number of the components set up. For example, to work on the GraphKB API you will need both an OrientDB server and a Keycloak server already running.

If your institution regularly works on PORI related projects then we recommend setting up a development instance of the PORI platform which your developers can point their applications to. If you do not have access to something like this, then the easiest way to get the dependencies for whatever part of the PORI platform you are working on up and running is by running the development version of the docker compose configuration found in this repository: [docker-compose.dev.yml](https://github.com/bcgsc/pori/blob/master/docker-compose.dev.yml).

```yaml title="docker-compose.dev.yml"
--8<-- "./docker-compose.dev.yml"
```

The demo uses a default keycloak setup with a realm "PORI" and two clients: "GraphKB" and "IPR".
For convenience there are also a number of default users which all have the default password of "secret".

| Name             | Default in DB | Purpose                                                                                                                                              |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| graphkb_importer | GraphKB       | This is the default user that is created when the new GraphKB DB is created. It is an admin user that can be used to add new users or import content |
| ipr_graphkb_link | GraphKB       | This is the user used by IPR to pull data from GraphKB                                                                                               |
| iprdemo          | IPR           | This is an admin user in the IPR demo db                                                                                                             |
| graphkb_admin    | GraphKB       | Admin user for managing content/users in the GraphKB web interface                                                                                   |


![default users](../images/pori-keycloak-default-users.png)

## Run docker-compose

First thing you should do is create new/empty directories for the data stored by GraphKB and IPR.

```bash
mkdir -p databases/{postgres,orientdb}/{backup,data}
```

You should also create a new directory for storing the public key from keycloak. This key will be downloaded and store so that it was be used in checking incoming tokens by the GraphKB and IPR APIs. If this directory already exists you should delete and remake it.

```bash
mkdir keys
```

Next, use docker-compose to start the DB, API, and client servers. The paths/URLs in the docker-compose.yml file should be adjusted to match your deployment. In our demo deployment we have a proxy pass set up from the configured ports to handle the https layer

```bash
docker-compose -f docker-compose.dev.yml up -d
```

This will start the following services

- Postgres db server for IPR with a default db dump
- OrientDB server for GraphKB with an empty default db
- GraphKB API server (nodejs)
- IPR API server (nodejs)
- GraphKB client server (nginx)
- IPR client server (nginx)
- Keycloak Authentication server

Once the platform is live you can [populate the new GraphKB instance](./graphkb/loading_data.md)
with external content using the loaders.

It will take a minute or two for all of the servers to start. You can check how they look with docker

```bash
docker ps
```

If any of them show "(health: starting)" then they are not ready yet.

### Viewing Log Files

Sometimes you will need to check the logs from the various servers, this can be done with the docker logs command. First find the container ID (or name) by listing all the running containers with `docker ps` and then run the following

```bash
docker logs <CONTAINER ID>
```

### Loading Data into GraphKB

If you are running the GraphKB loader via its docker container you will need to tell it to use the host network so that it is able to find the GraphKB API.

Here is an example of running the GraphKB Loader on the vocabulary terms using the docker container and the docker-compose setup described above.

First download the vocabulary terms data

```bash
wget https://raw.githubusercontent.com/bcgsc/pori_graphkb_loader/develop/data/vocab.json
```

Then you can load these terms using the ontology file loader

```bash
docker run --net host bcgsc/pori-graphkb-loader:latest \
    -u graphkb_importer \
    -p secret \
    -g http://localhost:8888/api \
    file \
    ontology \
    vocab.json
```

## HTTPS

For a production instance of PORI you will want to use HTTPS instead of HTTP. The simplest way to accomplish this is with a reverse proxy to pick up the ports. This way you can run the platform as above, with http, when initially setting up and testing.

Once you have your reverse proxy set up and configured you can use the newly bound URLs in place of the http://hostname:port URLs.
