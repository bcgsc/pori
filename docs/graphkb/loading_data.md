# Loading Data

We have provided a number of modules to automate loading external resources into GraphKB. Users can
pick and choose which resources they would like to load or use the snakemake pipeline to load them all (see instructions [here](#loading-content)). This will download and load content by default into your newly created GraphKB instance.

## Popular Resources

Most popular resources which have pre-built loaders provided for GraphKB are listed below. However, for an exhaustive list of all possible loaders, please see the [loader project](https://github.com/bcgsc/pori_graphkb_loader) itself.

<div class='external' markdown='1'>

- ![cgi logo]()

    ### Cancer Genome Interpreter

    [https://www.cancergenomeinterpreter.org/home](https://www.cancergenomeinterpreter.org/home)

    [CC BY-NC 4.0](https://www.cancergenomeinterpreter.org/faq#q11c)

    This is an external knowledge base which can be imported as statements into GraphKB.

- ![logo](https://gblobscdn.gitbook.com/spaces%2F-LEybeKogIn-6VllQQKY%2Favatar.png)

    ### ChEMBL

    [https://www.ebi.ac.uk/chembl](https://www.ebi.ac.uk/chembl/)

    [CC BY-SA 3.0](https://chembl.gitbook.io/chembl-interface-documentation/about#data-licensing)

    Drug definitions and relationships can be loaded from ChEMBL via their REST API.

- ![logo](https://docs.civicdb.org/en/latest/_images/CIViC_logo_for-light-bg_SM_v5a1.png)

    ### CIViC

    [https://civicdb.org](https://civicdb.org/)

    [CC0 1.0](https://docs.civicdb.org/en/latest/about/faq.html?highlight=license#how-is-civic-licensed)

    This is an external knowledge base which can be imported as statements into GraphKB.

- ![logo](https://clinicaltrials.gov/ct2/html/images/ct.gov-nlm-nih-logo.png)

    ### ClinicalTrials.gov

    [https://clinicaltrials.gov/ct2/home](https://clinicaltrials.gov/ct2/home)

    [Attribution](https://clinicaltrials.gov/ct2/about-site/terms-conditions#Use)

    Contains details for clinical trials around the world. Where possible the drugs and disease terms
    associated with the trial are matched and linked to the trial when the data is loaded.

- ![logo](https://cosmic-blog.sanger.ac.uk/static/home/domainlogo.png)

    ### COSMIC

    [https://cancer.sanger.ac.uk/cosmic](https://cancer.sanger.ac.uk/cosmic)

    [Non-commercial](https://cancer.sanger.ac.uk/cosmic/license)

    Catalogue of Somatic Mutations in Cancer. Loaders are written for importing both the resistance mutations as well as recurrent fusions information.

- ![cosmic logo]()

    ### DGIdb

    [https://www.dgidb.org](https://www.dgidb.org/)

    [Open Access](https://www.dgidb.org/faq)

    Loads Gene-Drug Interactions into GraphKB. These are used in exploring novel mutation targets.

- ![logo](https://disease-ontology.org/media/images/DO-logo-teal.svg)

    ### Disease Ontology

    [https://disease-ontology.org](https://disease-ontology.org/)

    [CC0 1.0 Universal](https://github.com/DiseaseOntology/HumanDiseaseOntology)

    Disease definitions and relationships are loaded from Data files provided by the Disease Ontology.

- ![logo](https://raw.githubusercontent.com/griffithlab/docm/master/app/assets/images/header_logo%402.png)

    ### DoCM

    [http://docm.info](http://docm.info/)

    [CC BY 4.0](http://docm.info/about)

    This is an external knowledge base which can be imported as statements into GraphKB.


- ![logo](https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Drugbank_logo.svg/720px-Drugbank_logo.svg.png)

    ### DrugBank

    [https://go.drugbank.com](https://go.drugbank.com/)

    [Attribution-NonCommercial 4.0 International](https://dev.drugbank.com/guides/faqs#usage)

    Drug Definitions and relationships along with cross references to the FDA drugs list are loaded
    from the XML database dumps of DrugBank.

- ![logo](https://m.ensembl.org/img/ensembl_logo.png)

    ### Ensembl

    [https://uswest.ensembl.org/index.html](https://uswest.ensembl.org/index.html)

    [No Restrictions](https://uswest.ensembl.org/info/about/legal/disclaimer.html)

    Gene, Transcript, and Protein definitions as well as cross-mappings to RefSeq versions.

- ![logo](https://www.ncbi.nlm.nih.gov/corehtml/logo100.gif)

    ### Entrez API

    [https://www.ncbi.nlm.nih.gov/books/NBK25501](https://www.ncbi.nlm.nih.gov/books/NBK25501/)

    [No Restrictions](https://www.ncbi.nlm.nih.gov/home/about/policies/)

    Module used in other loaders for fetching publications (PubMed, PMC); genes (Entrez gene); RS IDs (snp), etc.
    from the NCBI Entrez API utitlies.

- ![logo](https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Food_and_Drug_Administration_logo.svg/1280px-Food_and_Drug_Administration_logo.svg.png)

    ### FDA Approval Announcements

    [https://www.fda.gov/drugs/resources-information-approved-drugs/hematologyoncology-cancer-approvals-safety-notifications](https://www.fda.gov/drugs/resources-information-approved-drugs/hematologyoncology-cancer-approvals-safety-notifications)

    Parses Oncology Approval Announcements from the FDA site, stores as evidence items.

- ![fda-srs logo](https://precision.fda.gov/uniisearch/_next/image?url=%2Funiisearch%2Fgsrs-logo.svg&w=256&q=75)

    ### FDA SRS

    [https://precision.fda.gov/uniisearch](https://precision.fda.gov/uniisearch)

    The FDA global substance registration system contains drug definitions and names.

- ![logo](../images/graph-icon_outline.svg)

    ### GraphKB Ontology JSON

    [https://github.com/bcgsc/pori_graphkb_loader/tree/master/src/ontology](https://github.com/bcgsc/pori_graphkb_loader/tree/master/src/ontology)

    This loads a simple JSON format describing a set of ontology terms. We have included some examples and helpful ontology JSON files in the [data folder](https://github.com/bcgsc/pori_graphkb_loader/tree/master/data) of the corresponding repository.

- ![logo](https://www.genenames.org/img/hgnc/logo/hgnc-light-bkgrd-no-txt.svg)

    ### HGNC

    [https://www.genenames.org](https://www.genenames.org/)

    [No Restrictions](https://www.genenames.org/about/)

    Gene names and definitions as well as cross-mappings to several other gene resources such as
    ensembl and entrez.

- ![MOA logo](https://moalmanac.org/static/img/moalmanac.jpg)

    ### MOAlmanac

    [https://moalmanac.org](https://moalmanac.org)

    [ODbL v1.0](https://moalmanac.org/terms)

    A collection of putative alteration/action relationships identified in clinical, preclinical, and inferential studies.

- ![logo](https://ncit.nci.nih.gov/ncitbrowser/images/thesaurus_browser_logo.jpg)

    ### NCIt

    [https://ncithesaurus.nci.nih.gov/ncitbrowser](https://ncithesaurus.nci.nih.gov/ncitbrowser/)

    [CC BY 4.0](https://evs.nci.nih.gov/ftp1/NCI_Thesaurus/ThesaurusTermsofUse.pdf)

    NCI Thesaurus which contains therapies, anatomical entities, and disease definitions.

- ![logo](https://avatars.githubusercontent.com/u/22530657?s=200&v=4)

    ### OncoKB

    [https://www.oncokb.org](https://www.oncokb.org/)

    [Restricted](https://www.oncokb.org/account/register)

    This is a legacy loader. It is written to load the actionability JSON files provided by OncoKB.
    As this is not an open data resource, using this loader will require licensing specific to your
    user/instance. This is an external knowledge base which can be imported as statements into GraphKB.

- ![logo](http://uberon.github.io/images/u-logo.jpg)

    ### Uberon

    [https://uberon.github.io](https://uberon.github.io/)

    [CC BY 3.0](https://github.com/obophenotype/uberon/issues/1139)

    The uberon ontology contains anatomical entity definitions.

</div>

## Custom Content

If you have your own instance of GraphKB and would like to transform your existing knowledge base to load it into GraphKB please look at the other knowledge base loaders for examples. There are some commonly used helper modules and functions available in the code base to make this process simpler. You can see documentation for individual loaders grouped with their loader (See their corresponding README.md).

```text
src/
`--loader/
  |-- index.js
  `-- README.md
```

If you have any issues or questions please make an issue in the [loaders repo](https://github.com/bcgsc/pori_graphkb_loader/issues).

## Loading Content

{%
   include-markdown "./_pori_graphkb_loader/README.md"
   start="## Initializing GraphKB Content"
%}
