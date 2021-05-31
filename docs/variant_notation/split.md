
# Multi-Feature (Split) Notation

Multi-feature notation is a novel feature of GraphKB-HGVS and not part of standard HGVS. It is
based on the original form for cytogenetic descriptions of translocations (as previously
reccommended by HGVS) but this form is generalized to allow other coordinate systems.

Multi-Feature notation will use the same positions and coordinate systems as continuous notation.
However parentheses are used to divide features and positions. All multi-feature variants should
following the pattern below

```text
(<feature>,<feature>):<type>(<prefix>.<pos>,<prefix>.<pos>)<seq>
```

Untemplated sequence should only be included for sequence specific coordinate types such as
genomic, CDS, and protein. Where possible, continuous notation is preferred to multi-feature.

## Examples

### Gene Fusion

Using exon coordinates we could describe a gene fusion of exon 4 of EWSR1 to exon 7 of FLI1 as
follows

```text
(EWSR1,FLI1):fusion(e.4,e.7)
```

A range can also be used here. When a range of positions is given it indicates uncertainty. Since
the range is already separated by a comma it is not necessary to enclose the uncertainty in
parentheses (as you would for continuous notation).

For example, if we wanted to express a fusion of any exon from 4-6 of EWSR1 to any exon from 7-10
of FLI1

```text
(ESWR1,FLI1):fusion(e.4_6,e.7_10)
```

### Genomic Translocation

Multi-feature variants can also be described using the genomic coordinate system (`g`). For example
a translocation might be described

```text
(chr8,chr7):trans(g.1234,g.4567)
(chr8,chr7):trans(g.1234,g.4567)AAT
```

Above we are describing a translocation from chr8:1234 to chr7:4567 where AAT is the untemplated
sequence inserted between the breakpoints.
