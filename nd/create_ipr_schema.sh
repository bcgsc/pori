#!/bin/bash

export PGPASSWORD=password #$IPR_POSTGRES_PASSWORD
export POSTGRES_USER=ipr_service #$IPR_POSTGRES_USER
export DB_NAME=ipr

echo "***CREATING PSQL SCHEMA WITH MIGRATION DATA ***"

echo $POSTGRES_USER
echo $DB_NAME


if [ "$SCHEMA_DUMP_LOCATION" = "" ];
then
    SCHEMA_DUMP_LOCATION=".database/ipr_schema.postgres.dump"
fi

echo $SCHEMA_DUMP_LOCATION

pg_restore -U $POSTGRES_USER -d $DB_NAME -f $SCHEMA_DUMP_LOCATION
