
# About

Integrated Pipeline Reports (IPR) is the main reporting application of IPR. It is a web application
that is used to review and curate reports which summarize the interpretation of molecular data from
precision oncology patients.

This project is modularized across 3 repositories: [web client](https://github.com/bcgsc/pori_ipr_client),
[REST API](https://github.com/bcgsc/pori_ipr_api), and a [python adaptor](https://github.com/bcgsc/pori_ipr_python).
The API and web client are servers and are provided as docker containers. The python adaptor is
used to build reports and upload them into IPR.
