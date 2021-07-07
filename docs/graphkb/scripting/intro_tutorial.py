from graphkb import GraphKBConnection
from graphkb.constants import BASE_RETURN_PROPERTIES, GENERIC_RETURN_PROPERTIES
from graphkb.match import match_positional_variant
from graphkb.util import convert_to_rid_list
from graphkb.vocab import get_term_tree

GKB_API_URL = 'https://pori-demo.bcgsc.ca/graphkb-api/api'
GKB_USER = 'colab_demo'
GKB_PASSWORD = 'colab_demo'

graphkb_conn = GraphKBConnection(GKB_API_URL, use_global_cache=False)
graphkb_conn.login(GKB_USER, GKB_PASSWORD)


variant_name = 'KRAS:p.G12D'
variant_matches = match_positional_variant(graphkb_conn, variant_name)

for match in variant_matches:
    print(variant_name, 'will match', match['displayName'])

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


BASE_THERAPEUTIC_TERMS = 'therapeutic efficacy'

therapeutic_terms = get_term_tree(graphkb_conn, BASE_THERAPEUTIC_TERMS, include_superclasses=False)

print(f'\nFound {len(therapeutic_terms)} equivalent terms')

for term in therapeutic_terms:
    print('-', term['name'])
print()

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
