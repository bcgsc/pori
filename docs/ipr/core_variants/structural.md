# Structural Variants

Structural variants should be passed to the IPR python adapter in the main report content JSON.

```json
{
    "structuralVariants": [
        // variants
    ]

}
```

Each variant is an object which may contain any of the following fields

{%
   include-markdown "../includes/structuralVariants.md"
%}

## Images

When the svg field contains an SVG image string this image will be displayed by the report via the actions tab (see button circled in red below). This allows the user to bring up the visualization when they are reviewing the structural variants in the report.

![fusions button](../images/ipr_client.structural_variants.fusion_image.png)

Clicking this button will bring the user to a pop up showing the visualization. The visualization shown below was created with [MAVIS](http://mavis.bcgsc.ca/).

![fusions popup](../images/ipr_client.structural_variants.fusion_popup.png)
