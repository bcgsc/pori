# Annotate Variant List

The script [annotate_variant_list.py](./annotate_variant_list.py) can be used to match variants from input files to an instance of GraphKB. Copy the script locally and install the package dependencies.

This example script expects a file with a single field (variant) and no header. Each line should
be a separate HGVS-like variant notation. For example

```text
KRAS:p.G12D
KRAS:p.G13E
```

!!! note "Must use Python3.6 or higher"

```bash
pip3 install graphkb pandas
```

Then the annotator can be run as follows

```bash
python annotate_variant_list.py <INPUT FILE> --output graphkb_annotations.tsv
```

By default this will use the pori-demo version of GraphKB which has a limited amount of data. This
demo version is intended for demonstration/testing only and a custom or shared production instance
of the GraphKB API. This can be configured via the GraphKB arguments. See the help menu for a full
list of arguments.

```bash
python annotate_variant_list.py -h
```

The output file will contain the variant name and the annotations pulled from GraphKB.

The names of the variants matched will be included in the output file as "variant_matches", this
will be a semi-colon delimited list of all the variants which were considered to be present/equivalent
based on the input variant. For example if the input where `KRAS:p.G12D` we might expect to see
something like this

```text
KRAS mutation;KRAS:p.(G12_G13)mut;KRAS:p.?12mut;KRAS:p.G12;KRAS:p.G12D;KRAS:p.G12mut;chr12:g.25398284C>T
```

We can see the variant has matched less specific forms of the same variant such as `KRAS mutation`
or `KRAS:p.(G12_G13)mut` (any KRAS mutation at G12 or G13)
