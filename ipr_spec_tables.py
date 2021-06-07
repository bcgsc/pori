"""
Generate the tables describing the various fields
that can be given as input in the JSON passed to the IPR
python adaptor
"""
import json
import os


def get_type(obj):
    if 'type' in obj and isinstance(obj['type'], list):
        types = [get_type(t) for t in obj['type']]
        return ' | '.join(sorted(types))

    for complex in ['oneOf', 'anyOf']:
        if complex in obj:
            types = [get_type(t) for t in obj[complex]]
            return ' | '.join(sorted(types))
    try:
        return obj['type']
    except TypeError:
        return str(obj)


def spec_to_md(spec, optional_only=False, ignore_nested=False):

    has_example = False

    for prop_name, prop_defn in spec['properties'].items():
        if 'example' in prop_defn or 'examples' in prop_defn:
            has_example = True

    rows = (
        ['| Field | Type | Example | Description |', '|---|---|---|---|']
        if has_example
        else ['| Field | Type  | Description |', '|---|---|---|']
    )
    required_props = spec.get('required', {})
    prop_order = sorted(spec['properties'].keys(), key=lambda x: (x not in required_props, x))

    for prop_name in prop_order:
        prop_defn = spec['properties'][prop_name]
        is_req = prop_name in required_props
        if optional_only and prop_name in required_props:
            continue
        if ('properties' in prop_defn or 'items' in prop_defn) and ignore_nested:
            continue
        desc = prop_defn.get('description', '')
        examples = (
            [prop_defn.get('example')] if 'example' in prop_defn else prop_defn.get('examples', [])
        )
        type_name = get_type(prop_defn)
        if type_name == 'null | number | string':  # special syntax to allow inf
            type_name = 'number?'
        elif type_name.startswith('null | '):
            type_name = type_name.replace('null | ', '') + '?'
        elif type_name.endswith(' | null'):
            type_name = type_name.replace(' | null', '') + '?'

        prop_name = prop_name if not is_req else f'**{prop_name}** *(required)*'
        if not has_example:
            row = [
                prop_name,
                f'`{type_name}`',
                desc,
            ]
        else:
            row = [
                prop_name,
                f'`{type_name}`',
                f'`{json.dumps(examples[0])}`' if examples else '',
                desc,
            ]
        rows.append('|' + ' | '.join(row) + '|')
    result = '\n'.join(rows)

    # if not optional_only:
    #     result += '\n\n[^req]: Indicates a required field'
    return result


specfile = os.path.join(os.path.dirname(__file__), '_pori_ipr_python/ipr/content.spec.json')
with open(specfile, 'r') as fh:
    spec = json.load(fh)

for defn, filename, optional_only, ignore_nested in [
    (spec['properties']['expressionVariants']['items'], 'expressionVariants', True, False),
    (
        spec['properties']['pairwiseExpressionCorrelation']['items'],
        'pairwiseExpressionCorrelation',
        False,
        False,
    ),
    (spec['properties']['hlaTypes']['items'], 'hlaTypes', False, False),
    (spec['properties']['immuneCellTypes']['items'], 'immuneCellTypes', False, False),
    (spec['properties']['mutationSignature']['items'], 'mutationSignature', False, False),
    (spec['properties']['mutationBurden']['items'], 'mutationBurden', False, False),
    (spec['properties']['comparators']['items'], 'comparators', False, False),
    (spec['properties']['smallMutations']['items'], 'smallMutations', False, False),
    (spec['properties']['structuralVariants']['items'], 'structuralVariants', False, False),
    (spec['properties']['copyVariants']['items'], 'copyVariants', False, False),
    (spec['properties']['patientInformation'], 'patientInformation', False, False),
    (spec, 'general', False, True),
]:
    with open(os.path.join(os.path.dirname(__file__), 'ipr/includes', filename + '.md'), 'w') as fh:
        fh.write(spec_to_md(defn, optional_only=optional_only, ignore_nested=ignore_nested))
