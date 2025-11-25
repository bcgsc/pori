
# All PORI Repositories

The platform has two main components: a graph knowledge base ([GraphKB](graphkb/index.md)), and a reporting
application ([IPR](ipr/index.md)). However these are modularized across several repositories listed below.

An overview of each project is given below. The projects are grouped by their type of development expertise.

## Front-End Web Development

In general our web clients are written in javascript/typescript and use [React](https://reactjs.org/), [Material-UI](https://material-ui.com), and [webpack](https://webpack.js.org).

There are two main web client projects as part of PORI

<div class='projects' markdown='1'>

- ### [GraphKB client](https://github.com/bcgsc/pori_graphkb_client)

    ![graphkb client](./images/graphkb_graph_view_square.png)

    The GraphKB client is the front-end web client for the GraphKB project. The client is used to explore and manage content within GraphKB. This is the primary way for knowledge base users to interact with GraphKB. It contains a graph-based view and support for common query operations. It also allows export of results up to 5K rows (larger exports should be done via the API).

- ### [IPR client](https://github.com/bcgsc/pori_ipr_client)

    ![ipr client](./images/pori-ipr-main-report-page.png)

    The IPR client is the front-end web application which consumes data from the IPR API. The primary function is the production and management of genomic reports. Case Analysts use the IPR client to curate and review reports prior to presentation to a molecular tumour board or dissemination.

</div>

## Back-End Web Development

The REST APIs that are part of PORI are written in javascript and are run using [NodeJS](https://nodejs.org/en/). Both are built on the popular [Express](https://expressjs.com/) framework. The database and corresponding object relational mapper (ORM) is where they differ. The IPR API uses [Postgres](https://www.postgresql.org/) and [sequelize](https://sequelize.org/) whereas the GraphKB API uses [OrientDB](https://orientdb.org/) and [orientjs](https://www.npmjs.com/package/orientjs).

Both APIs implement [swagger/openapi](https://swagger.io/specification/) documentation for developers using the APIs.

<div class='projects' markdown='1'>

- ### [GraphKB API](https://github.com/bcgsc/pori_graphkb_api)

    ![graphkb api](./images/graph-icon_outline.svg)

    GraphKB REST API and Graph Database. The GraphKB database is a graph database which is used to store variants, ontologies, and the relevance of these terms and variants. The KB uses strict controlled vocabulary to provide a parseable and machine-readable interface for other applications to build on.

- ### [IPR API](https://github.com/bcgsc/pori_ipr_api)

    ![ipr api](https://www.bcgsc.ca/gsc-logos/icon/logo-circle.png)

    The Integrated Pipeline Reports (IPR) REST API manages data access to the IPR database. The API is responsible for storing and serving all data for reports.

</div>

## ETL / Data Loading

The GraphKB project also includes a loaders package which is used to import content from external knowledge bases and ontologies into GraphKB. Writing these loaders requires a strong understanding of the knowledge graph structure of GraphKB as well as the structure of the target resource. The loaders are written in javscript to be able to leverage the parser and schema JS packages used by the API and client. They are run with [NodeJS](https://nodejs.org/en/). A list of the popular supported inputs can be found in the [loading data section](./graphkb/loading_data.md).

<div class='projects' markdown='1'>

- ### [GraphKB Data Loaders](https://github.com/bcgsc/pori_graphkb_loader)

    ![graphkb loaders](./images/graph-icon_outline.svg)

    GraphKB loaders is responsible for all data import into GraphKB. Automatic Import modules are provided for a variety of external ontologies and knowledge bases such as: Ensembl, Entrez Genes, RefSeq, HGNC, Disease Ontology, NCI Thesaurus, CIViC, DoCM, etc.

</div>

## Python Adapter

The popularity of python in bioinformatics makes it one of the top choices for adapters. This adapter is written to help users integrate PORI into their existing bioinformatic workflows. It is published and installed via pip.

```bash
pip install pori-python
```

!!! Warning "Deprecation warning"

    Legacy [GraphKB Python Adapter](https://github.com/bcgsc/pori_graphkb_python) and [IPR Python Adapter](https://github.com/bcgsc/pori_ipr_python) are now retired. Both sets of functionalities can now be found in the new [PORI Python Adapter](https://github.com/bcgsc/pori_python)

<div class='projects' markdown='1'>

- ### [PORI Python Adapter](https://github.com/bcgsc/pori_python)

    ![graphkb python](./images/graph-icon_outline.svg)

    This package combines two sets of functionalities; GraphKB-related utilities for querying the GraphKB API and matching observed variants, and IPR-related utilities for generating and uploading reports to the IPR API.

<!-- - ### [PORI cBioportal](https://github.com/bcgsc/pori_cbioportal)

    ![pori cbioportal](https://about.cbioportal.org/lovable-uploads/a1c7045f-ba63-47c3-a285-86d6cd769f37.png)

    This python adapter is intended to demonstrate creating a PORI report using data exported from a cBioportal instance. It uses the expression, copy number, fusion, and small mutation data as well as available metadata to complete the reports. -->

</div>

## Other Supporting Packages

There are a number of packages that are split into separate projects so that they can be re-used across the other PORI projects, like the GraphKB API, the GraphKB Client and the GraphKB data loader.

<div class='projects' markdown='1'>

- ### [GraphKB Parser](https://github.com/bcgsc/pori_graphkb_parser)

    ![graphkb parser](./images/graph-icon_outline.svg)

    A package for parsing and recreating HGVS-like variant notation used in GraphKB. Try it out online with [PlayCode](https://playcode.io/2586394), or on the Notation tab of the About section of the GraphKB client ([GraphKB client demo](https://pori-demo.bcgsc.ca/graphkb/about/notation); login instructions [here](./demo.md#graphkb)).

- ### [GraphKB Schema](https://github.com/bcgsc/pori_graphkb_schema)

    ![graphkb schema](./images/pori-schema-overview.svg)

    The GraphKB Schema package defines the data model, including the vertex and edge classes in the DB.
</div>
