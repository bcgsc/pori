# Comparators

This is used to provide details on how outlier evaluations were performed by listing the cohorts
that were used in the comparisons


```json
{
    "comparators": [
        {
            "analysisRole": "mutation burden (primary)",
            "name": "average"
        },
        {
            "analysisRole": "expression (disease QC)",
            "name": "qc_tcga_comp_TARGET_RHD_percentile_median_(6)",
            "size": 6
        },
        {
            "analysisRole": "expression (primary site)",
            "name": "average",
            "size": 1024
        }
    ],
}
```

{%
   include-markdown "../includes/comparators.md"
%}

The field `analysisRole` can have the following values, each can only be used once per report

- cibersort (primary)
- cibersort (secondary)
- mixcr (primary)
- mixcr (secondary)
- HRD (primary)
- HRD (secondary)
- expression (disease)
- expression (disease QC)
- expression (primary site)
- expression (primary site QC)
- expression (biopsy site)
- expression (biopsy site QC)
- mutation burden (primary)
- mutation burden (secondary)
- mutation burden (tertiary)
- mutation burden (quaternary)
- mutation burden SV (primary)
- mutation burden SV (secondary)
- mutation burden SV (tertiary)
- mutation burden SV (quaternary)
- protein expression (primary)
- protein expression (secondary)
