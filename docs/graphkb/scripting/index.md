# User Manual

The GraphKB python adapter is a python package to facilitate interacting with the GraphKB API.
The GraphKB API is a REST API [https://graphkb.bcgsc.ca/api)](https://graphkb.bcgsc.ca/api). The openapi specification
is hosted here: [https://graphkb-api.bcgsc.ca/api/spec](https://graphkb-api.bcgsc.ca/api/spec).
The [client](https://graphkb.bcgsc.ca/about) also contains documentation on the background and features of GraphKB

This adapter adds functions for common queries as well as for paginating and authenticating

## Getting Started

Install the python adapter with pip

```bash
pip install graphkb
```

This will require python 3.6 or greater.

Next, start incorporating graphkb into your own python project/script. The script below gets version
information from graphkb


```python
from graphkb import GraphKBConnection

gkb_conn = GraphKBConnection()

# authenticate the current user
gkb_conn.login('myusername', 'mypassword')

# get the version information
version_metadata = gkb_conn.request('/version')
```

Querying GraphKB uses the `/query` endpoint which takes the query arguments in the request body.
See the [openapi specification](https://graphkb-api.bcgsc.ca/api/spec) for more details on how to
build this object.

## Matching Variants

There are 2 main matching functions, one of positional variants and one for category variants. Let's
take a look at a couple of examples

```python
from graphkb import GraphKBConnection
from graphkb.match import match_positional_variant

gkb_conn = GraphKBConnection()
gkb_conn.login('myusername', 'mypassword')

variant_matches = match_positional_variant(gkb_conn, 'KRAS:p.G12D')
```

This will give you a list of variants from GraphKB that are considered to match the input. We can
then use this list of variants to fetch related annotations

```python
from graphkb.util import convert_to_rid_list

annotations = gkb_conn.query({
    'target': 'Statement',
    'filters': {
        'conditions': convert_to_rid_list(variant_matches),
        'operator': 'CONTAINSANY'
    }
})
```

This will fetch a list of statements where any of the matched variants are conditions for the
statement
