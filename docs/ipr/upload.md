# Uploading A Report

## Install

Before you can generate and upload reports you will first need to install the [PORI Python Adapter library](https://pypi.org/project/pori-python/). The package has been tested for python versions from 3.9 to 3.12.

```bash
pip install pori-python
```

The `ipr` command is available as an endpoint to the [command_interface()](../../developer_reference/pori_python/ipr/main/#command_interface) function, which call the [ipr_report()](../../developer_reference/pori_python/ipr/main/#ipr_report) function based on parsed user input. This can be used to upload a report from the command line. Use the `--help`/`-h` option to see a help menu with full options.


```bash
ipr -h
```

Users should use the `--ipr_url` argument to point the loader to their particular instance of IPR. A similar option exists for GraphKB.

```bash
ipr -c /path/to/your/json/input/file.json --ipr_url https://youriprinstance-api.com/api
```

Report creation and upload can also be done as part of a script (see the [developer reference](../developer_reference/pori_python/ipr/main.md#ipr_report))

```python
from ipr.main import ipr_report

ipr_report(...)
```

The pre-generated content (ex. variant calls) of the report is passed to this function via a JSON object. The various sections of this object are desribed in the core variants and optional analyses sections.

The [full specification](https://raw.githubusercontent.com/bcgsc/pori_python/main/pori_python/ipr/content.spec.json) for the upload can be viewed/explored via the JSON schema explorer [here](https://json-schema.app/view?url=https://raw.githubusercontent.com/bcgsc/pori_python/main/pori_python/ipr/content.spec.json)

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
