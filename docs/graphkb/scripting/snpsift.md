# Annotate SNPSift Files

The script [annotate_snpsift.py](./annotate_snpsift.py) can be used to match variants from input files to an instance of GraphKB. Copy the script locally and install the package dependencies.

!!! note "Must use Python3.6 or higher"

```bash
pip3 install graphkb pandas
```

Then the annotator can be run as follows

```bash
python annotate_snpsift.py <INPUT FILES> --output graphkb_annotations.tsv
```

By default this will use the pori-demo version of GraphKB which has a limited amount of data. This
demo version is intended for demonstration/testing only and a custom or shared production instance
of the GraphKB API. This can be configured via the GraphKB arguments. See the help menu for a full
list of arguments.

```bash
python annotate_snpsift.py -h
```

The output file will contain the variant name and the annotations pulled from GraphKB.
