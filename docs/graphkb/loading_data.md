# Loading Data

We have provided a number of modules to automate loading external resources into GraphKB. Users can
pick and choose which resources they would like to load or use the snakemake pipeline to load them all.

## Loading All Resources

Loading GraphKB content can be done as an initialization step using snakemake (see instructions [here](https://github.com/bcgsc/pori_graphkb_loader#initializing-graphkb-content)). This will download and load all open-data content by default into your newly created GraphKB instance.

![workflow](https://github.com/bcgsc/pori_graphkb_loader/raw/develop/docs/basic_workflow.png)

## Loading Licensed Content

Both COSMIC and DrugBank have some licensing on their content which will require users to create
their own accounts with the respective resource. However, including them in the default load is trivial.
Once you have your credentials, simply include the email/password parameters for the resource you
would like to load as config arguments.

```bash
snakemake -j 1 \
  --config drugbank_email="YOUR EMAIL" \
  drugbank_password="YOUR PASSWORD" \
  cosmic_email="YOUR EMAIL" \
  cosmic_password="YOUR PASSWORD"
```

## Popular Resources

Most popular resources which have pre-built loaders provided for GraphKB are listed below. However, for an exhaustive list of all possible loaders, please see the [loader project](https://github.com/bcgsc/pori_graphkb_loader) itself.

<div class='external' markdown='1'>

- ![logo](https://gblobscdn.gitbook.com/spaces%2F-LEybeKogIn-6VllQQKY%2Favatar.png)

    ### ChEMBL

    [https://www.ebi.ac.uk/chembl](https://www.ebi.ac.uk/chembl/)

    Drug definitions and relationships can be loaded from ChEMBL via their REST API.

- ![logo](https://disease-ontology.org/media/images/DO-logo-teal.svg)

    ### Disease Ontology

    [https://disease-ontology.org](https://disease-ontology.org/)

    Disease definitions and relationships are loaded from Data files provided by the Disease Ontology.

- ![logo](https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Drugbank_logo.svg/720px-Drugbank_logo.svg.png)

    ### DrugBank

    [https://go.drugbank.com](https://go.drugbank.com/)

    Drug Definitions and relationships along with cross references to the FDA drugs list are loaded
    from the XML database dumps of DrugBank

- ![logo](https://m.ensembl.org/img/ensembl_logo.png)

    ### Ensembl

    [https://uswest.ensembl.org/index.html](https://uswest.ensembl.org/index.html)

    Gene, Transcript, and Protein definitions as well as cross-mappings to RefSeq versions

- ![logo](https://www.ncbi.nlm.nih.gov/corehtml/logo100.gif)

    ### Entrez API

    [https://www.ncbi.nlm.nih.gov/books/NBK25501](https://www.ncbi.nlm.nih.gov/books/NBK25501/)

    Module used in other loaders for fetching publications (PubMed, PMC); genes (Entrez gene); RS ISs (snp), etc.
    from the NCBI Entrez API utitlies

- ![logo](https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Food_and_Drug_Administration_logo.svg/1280px-Food_and_Drug_Administration_logo.svg.png)

    ### FDA SRS

    [https://fdasis.nlm.nih.gov/srs](https://fdasis.nlm.nih.gov/srs/)

    The FDA substance registration system contains drug definitions and names

- ![logo](https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Food_and_Drug_Administration_logo.svg/1280px-Food_and_Drug_Administration_logo.svg.png)

    ### FDA Approval Announcements

    [https://www.fda.gov/drugs/resources-information-approved-drugs/hematologyoncology-cancer-approvals-safety-notifications](https://www.fda.gov/drugs/resources-information-approved-drugs/hematologyoncology-cancer-approvals-safety-notifications)

    Parses Oncology Approval Announcements from the FDA site, stores as evidence items

- ![logo](https://www.genenames.org/img/hgnc/logo/hgnc-light-bkgrd-no-txt.svg)

    ### HGNC

    [https://www.genenames.org](https://www.genenames.org/)

    Gene names and definitions as well as cross-mappings to several other gene resources such as
    ensembl and entrez

- ![logo](https://ncit.nci.nih.gov/ncitbrowser/images/thesaurus_browser_logo.jpg)

    ### NCIt

    [https://ncithesaurus.nci.nih.gov/ncitbrowser](https://ncithesaurus.nci.nih.gov/ncitbrowser/)

    NCI Thesaurus which contains therapies, anatomical entities, and disease definitions.

- ![logo](../images/graph-icon_outline.svg)

    ### GraphKB Ontology JSON

    [https://github.com/bcgsc/pori_graphkb_loader/tree/master/src/ontology](https://github.com/bcgsc/pori_graphkb_loader/tree/master/src/ontology)

    This loads a simple JSON format describing a set of ontology terms

- ![logo](http://uberon.github.io/images/u-logo.jpg)

    ### Uberon

    [https://uberon.github.io](https://uberon.github.io/)

    The uberon ontology contains anatomical entity definitions

- ![logo](data:image/png;base64,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)

    ### Cancer Genome Interpreter

    [https://www.cancergenomeinterpreter.org/home](https://www.cancergenomeinterpreter.org/home)

    This is an external knowledge base which can be imported as statements into GraphKB

- ![logo](https://docs.civicdb.org/en/latest/_images/CIViC_logo_for-light-bg_SM_v5a1.png)

    ### CIViC

    [https://civicdb.org](https://civicdb.org/)

    This is an external knowledge base which can be imported as statements into GraphKB

- ![logo](https://clinicaltrials.gov/ct2/html/images/ct.gov-nlm-nih-logo.png)

    ### ClinicalTrials.gov

    [https://clinicaltrials.gov/ct2/home](https://clinicaltrials.gov/ct2/home)

    Contains details for clinical trials around the world. Where possible the drugs and disease terms
    associated with the trial are matched and linked to the trial when the data is loaded.

- ![logo](https://www.oncokb.org/content/oncokb.png)

    ### OncoKB

    [https://www.oncokb.org](https://www.oncokb.org/)

    This is a legacy loader. It is written to load the actionability JSON files provided by OncoKB.
    As this is not an open data resource, using this loader will require licensing specific to your
    user/instance. This is an external knowledge base which can be imported as statements into GraphKB.

- ![logo](data:image/jpeg;base64,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)

    ### DGIdb

    [https://www.dgidb.org](https://www.dgidb.org/)

    Loads Gene-Drug Interactions into GraphKB. These are used in exploring novel mutation targets

- ![logo](http://docm.info/assets/header_logo-7e7e686fc19f02d7c10932bc7af013b0.png)

    ### DoCM

    [http://docm.info](http://docm.info/)

    This is an external knowledge base which can be imported as statements into GraphKB.

</div>

## Custom Content

If you have your own instance of GraphKB and would like to transform your existing knowledgebase toload it into GraphKB please look at the other knowledgebase loaders for examples. There are some commonly used helper modules and functions available in the code base to make this process simpler. You can see documentation for individual loaders grouped with their loader (See their corresponding README.md).

```text
src/
`--loader/
  |-- index.js
  `-- README.md
```

If you have any issues or questions please make an issue in the [loaders repo](https://github.com/bcgsc/pori_graphkb_loader/issues).
