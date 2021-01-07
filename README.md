# Platform for Oncogenomic Reporting and Interpretation (PORI)

This repository contains central documentation for the platform as well as setup and installation
instructions.

The PORI Platform is composed of 5 main servers

- IPR server
- GraphKB server
- [Keycloak/Authentication server](./AUTH.md)
- OrientDB server (v3.0)
- PostgresSQL server (v9.6)

## IPR/GraphKB Server Setup

### Web Server Requirements

- A Centos 7 server with 1 CPU Core, 8GB of Memory and 30GB+ of disk space for IPR
- A Centos 7 server with 2 CPU Cores, 8GB of Memory and 30GB+ of disk space for GraphKB
- A Valid SSL Certificate

### Install ImageMagick

ImageMagick is required for the IPR application, install via this command:

```bash
yum install -y ImageMagick.x86_4 ImageMagick-devel.x86_64
```

### Apache Setup

#### Install

An installation of apache 2.4 is required with the following modules installed:

- mod_proxy_html
- mod_ssl

#### Configuration

Modify the apache httpd.conf to add the following line:

```text
Include virtual-hosts
```

Then inside the apache configuration home directory we want to create a sym link to the conf files in the repo

```bash
cd /etc/httpd/
ln -s /var/www/app/virtual-hosts virtual-hosts
```

This should set up apache to read any files inside the virtual-hosts directory. Alternatively the virtual-hosts directory in the repo can be moved to the apache directory.

Each of the conf files will need edited to replace the `<Domain>` points with the valid domain name your server is using, `<Email>` with a valid email, and the paths your certificate files. There needs to be two separate domains (or sub domains) for the client and app.
