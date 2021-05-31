# CytoBand Coordinates

CytoBand notation is included in GraphKB-HGVS to increase compatibility with variant notation in older publications and knowledgebases.

CytoBand coordinates (`y`) are not a feature of HGVS, however variants using this system follow much the same patterns as the other types. Since this coordinate system is not very specific, the types of variants one can describe is more limited. Generally only duplications/gains, deletions/losses, inversions, and translocations can be described. Additionally sequence is never included. Any position in the CytoBand coordinate system is described by the pattern

```text
<arm><majorBand>.<minorBand>
```

The minor band number is optional.

## Deletion Example

A deletion spanning p11.1 to p12.

```text
chr1:y.p11.1_p12del
```
