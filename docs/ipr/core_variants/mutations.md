# Small Mutations

Small mutations are composed of indels and single nucleotide variants. These should be passed to the IPR python adapter in the main report content JSON.

```json
{
    "smallMutations": [
        // variants
    ]

}
```

Each variant is an object which may contain any of the following fields

{%
   include-markdown "../includes/smallMutations.md"
%}
