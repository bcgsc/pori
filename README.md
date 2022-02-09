# Platform for Oncogenomic Reporting and Interpretation (PORI)

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.5728140.svg)](https://doi.org/10.5281/zenodo.5728140)

The Platform for Oncogenomic Reporting and Interpretation (PORI) is an open source collection of
software designed to support scaleable precision oncology. The platform has two main components:
a graph knowledge base (GraphKB) and an integrated pipeline reporting application (IPR).

![pori server stack](./docs/images/pori-server-stack.png)

For more information see the related [user manual](https://bcgsc.github.io/pori)

## Demo

A live demo of this is found at: [pori-demo.bcgsc.ca](https://pori-demo.bcgsc.ca). This demo was
deployed via docker-compose

## Citation

Please cite [Reisle, C. et al. A platform for oncogenomic reporting and interpretation. Nat. Commun. 13, 1–11 (2022)](https://www.nature.com/articles/s41467-022-28348-y)

## Building the Docs (Developers)

The main PORI site is built from this repo and pull documentation files from the python adapter repos. The documentation is built using mkdocs. The main website
will be updated on merge to the master branch of this repository.

First, set up a virtual environment (Optional but recommended)

```bash
python3 -m venv venv
source venv/bin/activate
pip install -U setuptools pip
```

Install the python dependencies

```bash
pip install -r requirements.txt
```

Run the script to pull the other respository files

```bash
bash docs/build_external.sh
```

And finally serve the documentation for viewing locally with

```bash
mkdocs serve
```
