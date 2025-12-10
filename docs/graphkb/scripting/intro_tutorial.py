from pori_python.graphkb import GraphKBConnection
from pori_python.graphkb.constants import FAILED_REVIEW_STATUS, STATEMENT_RETURN_PROPERTIES
from pori_python.graphkb.match import match_positional_variant
from pori_python.graphkb.util import convert_to_rid_list
from pori_python.graphkb.vocab import get_term_tree

import os
GKB_API_URL = 'https://graphkbdev-api.bcgsc.ca/api' # 'https://pori-demo.bcgsc.ca/graphkb-api/api'
GKB_USER = os.environ.get('USER') # 'colab_demo'
GKB_PASSWORD = os.environ.get('JIRA_PASS') # 'colab_demo'

graphkb_conn = GraphKBConnection(GKB_API_URL, use_global_cache=False)
graphkb_conn.login(GKB_USER, GKB_PASSWORD)


# 1. Matching variants
############################################

variant_name = 'KRAS:p.G12D'
variant_matches = match_positional_variant(graphkb_conn, variant_name)

print(f'Found {len(variant_matches)} variants:')
for match in variant_matches:
    print(variant_name, 'will match', match['displayName'])



# 2. Matching Statements on matched variants
############################################

statements = graphkb_conn.query(
    {
        'target': 'Statement',
        'filters': {'conditions': convert_to_rid_list(variant_matches), 'operator': 'CONTAINSANY'},
        'returnProperties': STATEMENT_RETURN_PROPERTIES, # should be customized to the users needs
    }
)

# filtering out statements with failed review
statements = [s for s in statements if s.get("reviewStatus") != FAILED_REVIEW_STATUS]

print(f'\nFound {len(statements)} statements:')
for statement in statements[:10]: # sampling first 10
    print(
        statement['relevance']['displayName'],
        statement['subject']['displayName'],
        statement['source']['displayName'] if statement['source'] else '',
    )


# 3. Matching Statements on matched variants + relevance term
############################################

BASE_THERAPEUTIC_TERMS = 'therapeutic efficacy'

therapeutic_terms = get_term_tree(graphkb_conn, BASE_THERAPEUTIC_TERMS, include_superclasses=False)

print(f'\nFound {len(therapeutic_terms)} equivalent terms:')
for term in therapeutic_terms:
    print('-', term['name'])


statements = graphkb_conn.query(
    {
        'target': 'Statement',
        'filters': {
            'AND': [
                {'conditions': convert_to_rid_list(variant_matches), 'operator': 'CONTAINSANY'},
                {'relevance': convert_to_rid_list(therapeutic_terms), 'operator': 'IN'},
            ]
        },
        'returnProperties': STATEMENT_RETURN_PROPERTIES, # should be customized to the users needs
    }
)

# filtering out statements with failed review
statements = [s for s in statements if s.get("reviewStatus") != FAILED_REVIEW_STATUS]

print(f'\nFound {len(statements)} statements:')
for statement in statements[:10]: # sampling first 10
    print(statement['relevance']['displayName'])
