
# Continuous Notation

All continuous notation follows a similar pattern that is loosely defined as:

```text
<feature>:<prefix>.<pos><type><seq>
```

The `reference feature` would be the gene (chromosome, transcript, etc.)  name that the variant
occurs on. The prefix denotes the coordinate type (see [prefixes](#prefixes)). The range is the
position or positions of the variant. For a deletion, this is the range that is deleted. For an
insertion, this is the two positions the sequence is inserted between. The sequence element will
depend on the type of variant being described, but often this is the untemplated/inserted sequence.

The sequence element is often optional. For all notation types there are general and more specific
versions of notating the same event. Where possible more specificity is preferred. But it is
recognized that notation coming from outside sources may not always provide all information. For
each variant, the different equivalent notation options are shown below in order of increasing
specificity.

## Examples

### Substitution

[Genomic/CDS substitution variants](http://varnomen.hgvs.org/recommendations/DNA/variant/substitution/)
differ from
[protein substitution variants](http://varnomen.hgvs.org/recommendations/protein/variant/substitution/).
Therefore examples of both will be given.

A protein missense mutation where G is replaced with D

```text
KRAS:p.G12D
```

A genomic substitution from A to C

```text
chr11:g.1234A>C
```

### Indel

A [protein deletion](http://varnomen.hgvs.org/recommendations/protein/variant/deletion/) of amino
acids GH and insertion of three amino acids TTA

```text
EGFR:p.G512_H513delins
EGFR:p.G512_H513delins3
EGFR:p.G512_H513delGHins
EGFR:p.G512_H513delGHins3
EGFR:p.G512_H513delinsTTA
EGFR:p.G512_H513delGHinsTTA
```

#### Insertion

Insertions must be a range to specify between which two coordinates the insertion occurs. This
avoids the problem
when only a single coordinate is given of which side it is inserted on.

An [protein insertion](http://varnomen.hgvs.org/recommendations/protein/variant/insertion/) of four
amino acids between G123 and H124. The sequence element here is optional and can also be described
as a number if the number of bases inserted is known but the sequence is not given.

```text
EGFR:p.G123_H124ins
EGFR:p.G123_H124ins4
EGFR:p.G123_H124insCCST
```

### Deletion

The reference sequence is optional when denoting a deletion. For example the same deletion could
be notated both ways as shown below.

```text
EGFR:p.R10_G14del
EGFR:p.R10_G14del5
EGFR:p.R10_G14delRSTGG
```

If the reference sequence is known, it is always better to provide more information than less.

#### Duplication

Four amino acids are duplicated. Once again, the sequence element is optional

```text
EGFR:p.R10_G14dup
EGFR:p.R10_G14dup5
EGFR:p.R10_G14dupRSTGG
```

### Frameshift

[Frameshifts](http://varnomen.hgvs.org/recommendations/protein/variant/frameshift/) are only
applicable to variants denoted with protein coordinates. Frameshift notation follows the pattern
below

```text
<feature>:p.<pos><first alternate AA>fs*<position of next truncating AA>
```

The `first alternate AA`, and `position of next truncating AA` are both optional elements. For
example the protein frameshift variant might be noted multiple ways

```text
PTEN:p.G123fs
PTEN:p.G123fs*10
PTEN:p.G123Afs
PTEN:p.G123Afs*10
```
