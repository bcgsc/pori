import argparse
import os
import typing
from typing import Dict, List

import pandas as pd

from graphkb import GraphKBConnection
from graphkb.constants import BASE_RETURN_PROPERTIES, GENERIC_RETURN_PROPERTIES
from graphkb.match import match_positional_variant
from graphkb.types import Statement
from graphkb.util import FeatureNotFoundError, convert_aa_3to1, convert_to_rid_list
from graphkb.vocab import get_term_tree


def annotate_variant(
    graphkb_conn: GraphKBConnection, raw_variant_name: str, include_unmatched: bool = False
) -> List[Dict[str, str]]:
    results = []
    variant_name = convert_aa_3to1(raw_variant_name)

    if 'c.*' in variant_name:
        results.append(
            {'variant': raw_variant_name, 'error': f'skipping unsupported notation: {variant_name}'}
        )
        return results

    print(f'processing: {variant_name}')

    try:
        variant_matches = match_positional_variant(graphkb_conn, variant_name)
    except FeatureNotFoundError:
        if include_unmatched:
            results.append({'variant': raw_variant_name})
        return results
    except Exception as err:
        results.append({'variant': raw_variant_name, 'error': str(err)})
        return results

    if variant_matches:
        print(f'{variant_name} matches {len(variant_matches)} variant records')
    # return properties should be customized to the users needs
    return_props = (
        BASE_RETURN_PROPERTIES
        + ['sourceId', 'source.name', 'source.displayName']
        + [f'conditions.{p}' for p in GENERIC_RETURN_PROPERTIES]
        + [f'subject.{p}' for p in GENERIC_RETURN_PROPERTIES]
        + [f'evidence.{p}' for p in GENERIC_RETURN_PROPERTIES]
        + [f'relevance.{p}' for p in GENERIC_RETURN_PROPERTIES]
        + [f'evidenceLevel.{p}' for p in GENERIC_RETURN_PROPERTIES]
        + ['reviewStatus']
    )

    statements = typing.cast(
        Statement,
        graphkb_conn.query(
            {
                'target': 'Statement',
                'filters': {
                    'conditions': convert_to_rid_list(variant_matches),
                    'operator': 'CONTAINSANY',
                },
                'returnProperties': return_props,
            }
        ),
    )
    if not statements:
        if include_unmatched:
            results.append(
                {
                    'variant_matches': ';'.join(
                        sorted([v['displayName'] for v in variant_matches])
                    ),
                    'variant': raw_variant_name,
                }
            )
        return results
    print(f'{variant_name} matches {len(statements)} statements')

    for statement in statements:
        row = {
            'variant_matches': ';'.join(sorted([v['displayName'] for v in variant_matches])),
            'variant': raw_variant_name,
            'statement.relevance': statement['relevance']['displayName'],
            'statement.@rid': statement['@rid'],
            'statement.subject': statement['subject']['displayName'],
            'statement.source': statement['source']['displayName'] if statement['source'] else '',
            'statement.evidence': ';'.join(
                sorted([e['displayName'] for e in statement['evidence']])
            ),
            'statement.conditions': ';'.join(
                sorted([e['displayName'] for e in statement['conditions']])
            ),
            'statement.evidence_level': ';'.join(
                sorted([e['displayName'] for e in (statement['evidenceLevel'] or [])])
            ),
            'statement.review_status': statement['reviewStatus'],
            'is_therapeutic': bool(statement['relevance']['@rid'] in therapeutic_terms),
        }
        results.append(row)
    return results


parser = argparse.ArgumentParser(formatter_class=argparse.ArgumentDefaultsHelpFormatter)
parser.add_argument(
    'inputs', help='Input tab delimited file(s) with variant column to be annotated', nargs='+'
)
parser.add_argument('--output', help='Path to the output file with the annotations', required=True)
parser.add_argument(
    '--graphkb_url',
    default='https://pori-demo.bcgsc.ca/graphkb-api/api',
    help='The BASE API URL of the GraphKB API instance being matched against',
)
parser.add_argument(
    '--graphkb_user', default='colab_demo', help='The username for logging in to GraphKB'
)
parser.add_argument(
    '--graphkb_pass', default='colab_demo', help='The password for logging in to GraphKB'
)
parser.add_argument(
    '--include_unmatched',
    default=False,
    action='store_true',
    help='Include lines for variants that did not match any statements',
)
args = parser.parse_args()


graphkb_conn = GraphKBConnection(args.graphkb_url, use_global_cache=True)
graphkb_conn.login(args.graphkb_user, args.graphkb_pass)

# read the input files
inputs = []
for filename in args.inputs:
    print(f'reading: {filename}')
    temp_df = pd.read_csv(filename, sep='\t')
    temp_df['filename'] = os.path.basename(filename)
    inputs.append(temp_df)
input_df = pd.concat(inputs)

# generate the variant list df
def get_variant(row):
    if not pd.isnull(row['ANN[*].HGVS_P']):
        return row['ANN[*].GENE'] + ':' + row['ANN[*].HGVS_P']
    # fall back to cds variant description when no protein change given
    if not pd.isnull(row['ANN[*].HGVS_C']):
        return row['ANN[*].GENE'] + ':' + row['ANN[*].HGVS_C']
    return None


input_df['variant'] = input_df.apply(get_variant, axis=1)


BASE_THERAPEUTIC_TERMS = 'therapeutic efficacy'

therapeutic_terms = set(
    convert_to_rid_list(
        get_term_tree(graphkb_conn, BASE_THERAPEUTIC_TERMS, include_superclasses=False)
    )
)

results: List[Dict] = []

for raw_variant_name in sorted(input_df['variant'].unique()):
    try:
        results.extend(annotate_variant(graphkb_conn, raw_variant_name, args.include_unmatched))
    except Exception as err:
        print(err)


print(f'writing: {args.output}')
df = pd.DataFrame.from_records(results)
# re-add the filename to the output
df = df.merge(input_df[['variant', 'filename']], on='variant', how='left')
df = df.reindex(
    columns=[
        'filename',
        'variant',
        'variant_matches',
        'is_therapeutic',
        'statement.source',
        'statement.relevance',
        'statement.subject',
        'statement.conditions',
        'statement.evidence',
        'statement.evidence_level',
        'statement.@rid',
        'statement.review_status',
        'error',
    ]
)
df.to_csv(args.output, index=False, sep='\t')
