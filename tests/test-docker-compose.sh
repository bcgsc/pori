RETRY=10
TIMEOUT=20
MIN_HEALTHY_EXPECTED=4
SERVICES_EXPECTED=8

x=0;
healthy_count=-1
up_count=-1

while [ $x -le $RETRY ]
do
    x=$(( $x + 1 ));
    healthy_count=$( docker ps | grep pori_ | grep -c '(healthy)' )
    up_count=$( docker ps | grep pori_ | grep -c '\sUp ' )

    if [ $healthy_count -ge $MIN_HEALTHY_EXPECTED ];
    then
        # at least 4 services current have health checks
        if [ $up_count -eq $SERVICES_EXPECTED ];
        then
            echo "Expected number of services found as up and running"
            exit 0;
        fi
    fi
    echo "$healthy_count != $MIN_HEALTHY_EXPECTED (healthy) or $up_count != $SERVICES_EXPECTED (up)"

    if [ $x -le $RETRY ];
    then
        echo "sleep $TIMEOUT before next retry"
        sleep $TIMEOUT;
    fi
done

echo "$healthy_count != $MIN_HEALTHY_EXPECTED (healthy) or $up_count != $SERVICES_EXPECTED (up)"
exit 1
