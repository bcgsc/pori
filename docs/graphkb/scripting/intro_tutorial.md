# Matching Tutorial

This tutorial will cover how to get started using GraphKB to annotate your variants. There is an
interative/jupyter version of this tutorial ([tutorial.ipynb](./tutorial.ipynb)) which can be run in a web browser
using [google colab](https://colab.research.google.com/github/bcgsc/pori_graphkb_python/blob/master/docs/usage_examples/tutorial.ipynb)
or a local jupyter server

## Install

Install graphkb as a dependency of your python script (It is recommended to use a virtual environment)

```python
pip install graphkb
```

## Connecting to the API

The first thing to do is setting up the connection to the API

```python
from graphkb import GraphKBConnection

GKB_API_URL = 'https://pori-demo.bcgsc.ca/graphkb-api/api'
GKB_USER = 'colab_demo'
GKB_PASSWORD = 'colab_demo'

graphkb_conn = GraphKBConnection(GKB_API_URL, use_global_cache=False)
```

Next, use this to login

```python
graphkb_conn.login(GKB_USER, GKB_PASSWORD)
```

This will store the credentials passed on the connection object and re-login as required.

## Variant Matches

For this example we are going to try matching a protein change (`p.G12D`) on the gene (`KRAS`).

```python
from graphkb.match import match_positional_variant

variant_name = 'KRAS:p.G12D'
variant_matches = match_positional_variant(graphkb_conn, variant_name)

for match in variant_matches:
    print(variant_name, 'will match', match['displayName'])
```

From this step you should see something like this (actual content will vary depending on the
instance of the GraphKB API/DB you are using)

```text
KRAS:p.G12D will match KRAS:p.G12
KRAS:p.G12D will match KRAS:p.G12X
KRAS:p.G12D will match KRAS:p.G12D
KRAS:p.G12D will match KRAS:p.G12mut
KRAS:p.G12D will match KRAS:p.(G12_G13)mut
KRAS:p.G12D will match KRAS:p.?12mut
KRAS:p.G12D will match KRAS:p.G12D
KRAS:p.G12D will match chr12:g.25398284C>T
KRAS:p.G12D will match KRAS:p.G12mut
KRAS:p.G12D will match KRAS mutation
```

As you can see above the match function has pulled similar/equivalent variant representations which
we will then use to match statements.

Next, use these variant matches to find the related statements

## Statement Annotations

```python
from graphkb.constants import BASE_RETURN_PROPERTIES, GENERIC_RETURN_PROPERTIES
from graphkb.util import convert_to_rid_list

# return properties should be customized to the users needs
return_props = (
    BASE_RETURN_PROPERTIES
    + ['sourceId', 'source.name', 'source.displayName']
    + [f'conditions.{p}' for p in GENERIC_RETURN_PROPERTIES]
    + [f'subject.{p}' for p in GENERIC_RETURN_PROPERTIES]
    + [f'evidence.{p}' for p in GENERIC_RETURN_PROPERTIES]
    + [f'relevance.{p}' for p in GENERIC_RETURN_PROPERTIES]
    + [f'evidenceLevel.{p}' for p in GENERIC_RETURN_PROPERTIES]
)

statements = graphkb_conn.query(
    {
        'target': 'Statement',
        'filters': {'conditions': convert_to_rid_list(variant_matches), 'operator': 'CONTAINSANY'},
        'returnProperties': return_props,
    }
)

for statement in statements[:5]:
    print(
        statement['relevance']['displayName'],
        statement['subject']['displayName'],
        statement['source']['displayName'] if statement['source'] else '',
    )
```

This should output lines similar to the following

```text
resistance gefitinib [C1855] CIViC
likely pathogenic lung cancer [DOID:1324] DoCM
```

## Categorizing Statements

Something we often want to know is if a statement is therapeutic, or prognostic, etc. The
naive approach is to base this on a list of known terms or a regex pattern. In GraphKB we can
leverage the ontology structure instead.

In this example we will look for all terms that would indicate a therapeutically relevent statement.

To do this we pick our 'base' terms. These are the terms we consider to be the highest level
of the ontology tree, the most general term for that category.

```python
from graphkb.vocab import get_term_tree


BASE_THERAPEUTIC_TERMS = 'therapeutic efficacy'

therapeutic_terms = get_term_tree(graphkb_conn, BASE_THERAPEUTIC_TERMS, include_superclasses=False)

print(f'Found {len(therapeutic_terms)} equivalent terms')

for term in therapeutic_terms:
    print('-', term['name'])
print()
```

This will result in output like

```text
Found 13 equivalent terms
- therapeutic efficacy
- targetable
- response
- sensitivity
- likely sensitivity
- no sensitivity
- no response
- resistance
- reduced sensitivity
- likely resistance
- innate resistance
- acquired resistance
- no resistance
```

We can filter the statements we have already retrieved, or we can add this to our original query
and filter before we retrive from the API

```python
statements = graphkb_conn.query(
    {
        'target': 'Statement',
        'filters': {
            'AND': [
                {'conditions': convert_to_rid_list(variant_matches), 'operator': 'CONTAINSANY'},
                {'relevance': convert_to_rid_list(therapeutic_terms), 'operator': 'IN'},
            ]
        },
        'returnProperties': return_props,
    }
)

for statement in statements:
    print(statement['relevance']['displayName'])
```

Similar filtering can be done for the other properties and any other base-term classification you
would like to use. Use the graph view at [https://graphkb.bcgsc.ca](https://graphkb.bcgsc.ca)
to explore record relationships and decide on the categories you would like to use.

The full code for this tutorial can be downloaded [here](./tutorial.py)
