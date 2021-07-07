# Uploading A Report

## Install

Before you can generate and upload reports you will first need to install the package with pip

```bash
pip install ipr
```

This will require python 3.6 or greater.

this can now be used as a command line tool

```bash
ipr -h
```

or as part of a script (see the [developer reference](../../developer_reference/ipr/main/#create_report))

```python
from argparse import Namespace

from ipr.main import create_report

create_report(...)
```

The pre-generated content (ex. variant calls) of the report is passed to this function via a JSON object. The various sections of this object are desribed in the core variants and optional analyses sections.

The [full specification](https://raw.githubusercontent.com/bcgsc/pori_ipr_python/feature/json-only/ipr/content.spec.json) for the upload can be viewed/explored via the JSON schema explorer [here](https://json-schema.app/view?url=https://raw.githubusercontent.com/bcgsc/pori_ipr_python/master/ipr/content.spec.json)

Most content is optional with a few top-level elements required.

## JSON Examples

Below are a couple of simplified examples of what the input JSON may look like

### No Variants

It is possible to load a report where no variants were called. In such cases, only the 4 main
top-level fields are required

```json
{
    "project": "string",
    "patientId": "PATIENT 0",
    "template": "genomic",
    "kbDiseaseMatch": "colorectal cancer"
}
```

### Only Small Mutations

To include small mutations in the JSON, simply add the "smallMutations" property. This is a list of objects (dicts if you are more familiar with python). Any number of small mutations can be included.

```json
{
    "patientId": "PATIENT001",
    "kbDiseaseMatch": "colorectal cancer",
    "project": "TEST",
    "template": "genomic",
    "smallMutations": [
        {
            "gene": "APC",
            "proteinChange": "p.Thr1556fs",
            "transcript": "ENST00000457016",
            "hgvsGenomic": "5:g.112175951_112175952insA",
            "hgvsProtein": "APC:p.Thr1556fs",
            "chromosome": "5",
            "startPosition": 112175951,
            "endPosition": 112175951,
            "refSeq": "G",
            "altSeq": "GA"
        },
        {
            "gene": "XRCC1",
            "proteinChange": "p.Q399R",
            "transcript": "ENST00000543982",
            "hgvsGenomic": "19:g.44051039_44051040delCAinsAG",
            "chromosome": "19",
            "startPosition": 44051039,
            "endPosition": 44051040,
            "refSeq": "CAG",
            "altSeq": "AGG"
        }
    ]
}
```

### Small Mutations and Expression

Expression variants can be included with or without small mutations.

```json
{
    "patientId": "PATIENT001",
    "kbDiseaseMatch": "colorectal cancer",
    "project": "TEST",
    "template": "genomic",
    "smallMutations": [
        {
            "gene": "APC",
            "proteinChange": "p.Thr1556fs",
            "transcript": "ENST00000457016",
            "hgvsGenomic": "5:g.112175951_112175952insA",
            "hgvsProtein": "APC:p.Thr1556fs",
            "chromosome": "5",
            "startPosition": 112175951,
            "endPosition": 112175951,
            "refSeq": "G",
            "altSeq": "GA"
        }
    ],
    "expressionVariants": [
        {
            "gene": "APC",
            "kbCategory": "reduced expression"
        }
    ]
}
```

## Top-Level Fields Reference

All top-level fields are listed in detail below

{%
   include-markdown "./includes/general.md"
%}
