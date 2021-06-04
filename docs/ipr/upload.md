# Uploading A Report

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

The [full specification](https://raw.githubusercontent.com/bcgsc/pori_ipr_python/feature/json-only/ipr/content.spec.json) for the upload can be viewed/explored via the JSON schema explorer [here](https://json-schema.app/view?url=https://raw.githubusercontent.com/bcgsc/pori_ipr_python/feature/json-only/ipr/content.spec.json)

Most content is optional with a few top-level elements required

```json
{
    "project": "string",
    "patientId": "PATIENT 0",
    "template": "genomic",
    "kbDiseaseMatch": "colorectal cancer"
}
```

All top-level fields are listed in detail below

{%
   include-markdown "./includes/general.md"
%}
