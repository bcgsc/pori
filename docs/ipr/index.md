# About IPR

Integrated Pipeline Reports (IPR) is the main reporting application of PORI. It is a web application that is used to review and curate reports which summarize the interpretation of molecular data from precision oncology patients.

This project is modularized across two repositories: a [web client](https://github.com/bcgsc/pori_ipr_client) and a [REST API](https://github.com/bcgsc/pori_ipr_api); both are servers and are provided as docker containers. It is also relying on the IPR utilities found in the [PORI Python Adapter](https://github.com/bcgsc/pori_python), used to build reports and upload them into IPR.

Reports in IPR are divided into a series of sections. These are either: created by the PORI python adaptor (ex. knowledge base matches section); manually curated post-report creation (ex. analyst comments); or generated beforehand and included in the content passed to IPR via the python adaptor (ex. optional analyses).
