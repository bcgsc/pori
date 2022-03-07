import os
from textwrap import dedent

CONTAINER = 'docker://bcgsc/pori-graphkb-loader:v6.0.0'
DATA_DIR = 'snakemake_data'
LOGS_DIR = 'snakemake_logs'

if not os.path.exists(DATA_DIR):
    os.mkdir(DATA_DIR)

if not os.path.exists(LOGS_DIR):
    os.mkdir(LOGS_DIR)


LOADER_COMMAND = 'node bin/load.js ' + ' '.join([f'--{k} {v}' for k, v in {
    'username': config.get('gkb_user') or os.environ.get('GKB_USER'),
    'password': config.get('gkb_pass') or os.environ.get('GKB_PASS'),
    'graphkb': config.get('gkb_url') or os.environ.get('GKB_URL')
}.items() if v])


DRUGBANK_EMAIL = config.get('drugbank_email')
DRUGBANK_PASSWORD = config.get('drugbank_password')
USE_DRUGBANK = DRUGBANK_EMAIL or DRUGBANK_PASSWORD
COSMIC_EMAIL = config.get('cosmic_email')
COSMIC_PASSWORD = config.get('cosmic_password')
USE_COSMIC = COSMIC_EMAIL or COSMIC_PASSWORD
BACKFILL_TRIALS = config.get('trials')
USE_FDA_UNII = config.get('fda')  # due to the non-scriptable download, making FDA optional
GITHUB_DATA = 'https://raw.githubusercontent.com/bcgsc/pori_graphkb_loader/develop/data'


rule all:
    input: f'{DATA_DIR}/civic.COMPLETE',
        f'{DATA_DIR}/cgi.COMPLETE',
        f'{DATA_DIR}/docm.COMPLETE',
        f'{DATA_DIR}/PMC4468049.COMPLETE',
        f'{DATA_DIR}/PMC4232638.COMPLETE',
        f'{DATA_DIR}/uberon.COMPLETE',
        f'{DATA_DIR}/fdaApprovals.COMPLETE',
        f'{DATA_DIR}/cancerhotspots.COMPLETE',
        f'{DATA_DIR}/moa.COMPLETE',
        *([f'{DATA_DIR}/ncitFdaXref.COMPLETE'] if USE_FDA_UNII else []),
        *([f'{DATA_DIR}/clinicaltrialsgov.COMPLETE'] if BACKFILL_TRIALS else []),
        *([f'{DATA_DIR}/cosmic_resistance.COMPLETE', f'{DATA_DIR}/cosmic_fusions.COMPLETE'] if USE_COSMIC else [])


rule download_ncit:
    output: f'{DATA_DIR}/ncit/Thesaurus.txt',
    shell: dedent(f'''\
        cd {DATA_DIR}/ncit
        wget https://evs.nci.nih.gov/ftp1/NCI_Thesaurus/Thesaurus.FLAT.zip
        unzip Thesaurus.FLAT.zip
        rm Thesaurus.FLAT.zip
        rm -rf __MACOSX''')


if USE_FDA_UNII:
    rule download_ncit_fda:
        output: f'{DATA_DIR}/ncit/FDA-UNII_NCIt_Subsets.txt'
        shell: dedent(f'''\
            cd {DATA_DIR}/ncit
            wget https://evs.nci.nih.gov/ftp1/FDA/UNII/FDA-UNII_NCIt_Subsets.txt''')


rule download_ensembl:
    output: f'{DATA_DIR}/ensembl/biomart_export.tsv'
    shell: dedent(f'''\
        cd {DATA_DIR}/ensembl
        query_string='<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE Query><Query  virtualSchemaName = "default" formatter = "TSV" header = "1" uniqueRows = "0" count = "" datasetConfigVersion = "0.6" ><Dataset name = "hsapiens_gene_ensembl" interface = "default" ><Filter name = "transcript_biotype" value = "protein_coding"/><Attribute name = "ensembl_gene_id" /><Attribute name = "ensembl_gene_id_version" /><Attribute name = "ensembl_transcript_id" /><Attribute name = "ensembl_transcript_id_version" /><Attribute name = "hgnc_id" /><Attribute name = "refseq_mrna" /><Attribute name = "description" /><Attribute name = "external_gene_name" /><Attribute name = "external_gene_source" /></Dataset></Query>'
        wget -O biomart_export.tsv "http://www.ensembl.org/biomart/martservice?query=$query_string"
        ''')


if USE_FDA_UNII:
    rule download_fda_srs:
        output: f'{DATA_DIR}/fda/UNII_Records.txt'
        shell: dedent(f'''\
            cd {DATA_DIR}/fda
            wget https://fdasis.nlm.nih.gov/srs/download/srs/UNII_Data.zip
            unzip UNII_Data.zip
            rm UNII_Data.zip

            mv UNII*.txt UNII_Records.txt
            ''')


rule download_refseq:
    output: f'{DATA_DIR}/refseq/LRG_RefSeqGene.tab'
    shell: dedent(f'''\
        cd {DATA_DIR}/refseq
        wget -O LRG_RefSeqGene.tab ftp://ftp.ncbi.nih.gov/refseq/H_sapiens/RefSeqGene/LRG_RefSeqGene
        ''')


rule download_uberon:
    output: f'{DATA_DIR}/uberon/uberon.owl'
    shell: dedent(f'''\
        cd {DATA_DIR}/uberon
        wget http://purl.obolibrary.org/obo/uberon.owl
        ''')


rule download_do:
    output: f'{DATA_DIR}/do/doid.json'
    shell: dedent(f'''\
        cd {DATA_DIR}/do;
        REPO=https://github.com/DiseaseOntology/HumanDiseaseOntology.git;
        LATEST=$(git ls-remote $REPO --tags v\\* | cut -f 2 | sed 's/refs\\/tags\///' | grep '\\bv[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]\\b' | sort -d | tail -n 1)
        echo $LATEST
        wget https://github.com/DiseaseOntology/HumanDiseaseOntology/raw/$LATEST/src/ontology/doid.json
        ''')


rule download_drugbank:
    output: f'{DATA_DIR}/drugbank/full_database.xml'
    shell: dedent(f'''\
        cd {DATA_DIR}/drugbank
        wget https://www.drugbank.ca/releases
        latest=$(grep 'href="/releases/[^"]*"' -o releases | cut -f 3 -d/ | sed 's/"//' | sort -V | tail -n 2 | head -n 1)
        rm releases
        filename="drugbank_all_full_database_v$latest".xml

        curl -Lfv -o ${{filename}}.zip -u {DRUGBANK_EMAIL}:{DRUGBANK_PASSWORD} https://go.drugbank.com/releases/5-1-8/downloads/all-full-database
        unzip ${{filename}}.zip
        mv full\ database.xml full_database.xml''')


rule download_PMC4468049:
    output: f'{DATA_DIR}/PMC4468049/NIHMS632238-supplement-2.xlsx'
    shell: dedent(f'''\
        cd {DATA_DIR}/PMC4468049
        wget https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4468049/bin/NIHMS632238-supplement-2.xlsx
        ''')


rule download_PMC4232638:
    output: f'{DATA_DIR}/PMC4232638/13059_2014_484_MOESM2_ESM.xlsx'
    shell: dedent(f'''\
        cd {DATA_DIR}/PMC4232638
        wget https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4232638/bin/13059_2014_484_MOESM2_ESM.xlsx
        ''')


rule download_cgi:
    output: f'{DATA_DIR}/cgi/cgi_biomarkers_per_variant.tsv'
    shell: dedent(f'''\
        cd {DATA_DIR}/cgi
        wget https://www.cancergenomeinterpreter.org/data/cgi_biomarkers_20180117.zip
        unzip cgi_biomarkers_20180117.zip
        ''')


rule download_local_data:
    output: f'{DATA_DIR}/local/{{local}}.json'
    shell: dedent(f'''\
        cd {DATA_DIR}/local
        wget {GITHUB_DATA}/{{wildcards.local}}.json
        ''')


rule download_cancerhotspots:
    output: f'{DATA_DIR}/cancerhotspots/cancerhotspots.v2.maf'
    shell: dedent(f'''\
        cd {DATA_DIR}/cancerhotspots
        wget http://download.cbioportal.org/cancerhotspots/cancerhotspots.v2.maf.gz
        gunzip cancerhotspots.v2.maf.gz
        ''')


rule download_clinicaltrialsgov:
    output: directory(f'{DATA_DIR}/clinicaltrialsgov')
    shell: dedent(f'''\
        cd {DATA_DIR}/clinicaltrialsgov
        wget https://clinicaltrials.gov/AllPublicXML.zip
        unzip AllPublicXML.zip''')


rule download_cosmic_resistance:
    output: f'{DATA_DIR}/cosmic/CosmicResistanceMutations.tsv'
    shell: dedent(f'''
        cd {DATA_DIR}/cosmic
        AUTH=$( echo "{COSMIC_EMAIL}:{COSMIC_PASSWORD}" | base64 )
        resp=$( curl -H "Authorization: Basic $AUTH" https://cancer.sanger.ac.uk/cosmic/file_download/GRCh38/cosmic/v92/CosmicResistanceMutations.tsv.gz );
        url=$( node  -e "var resp = $resp; console.log(resp.url);" );
        curl "$url" -o CosmicResistanceMutations.tsv.gz
        gunzip CosmicResistanceMutations.tsv.gz
        ''')


rule download_cosmic_diseases:
    output: f'{DATA_DIR}/cosmic/classification.csv'
    shell: dedent(f'''
        cd {DATA_DIR}/cosmic
        AUTH=$( echo "{COSMIC_EMAIL}:{COSMIC_PASSWORD}" | base64 )
        resp=$( curl -H "Authorization: Basic $AUTH" https://cancer.sanger.ac.uk/cosmic/file_download/GRCh38/cosmic/v92/classification.csv );
        url=$( node  -e "var resp = $resp; console.log(resp.url);" );
        curl "$url" -o classification.csv
        ''')


rule download_cosmic_fusions:
    output: f'{DATA_DIR}/cosmic/CosmicFusionExport.tsv'
    shell: dedent(f'''
        cd {DATA_DIR}/cosmic
        AUTH=$( echo "{COSMIC_EMAIL}:{COSMIC_PASSWORD}" | base64 )
        resp=$( curl -H "Authorization: Basic $AUTH" https://cancer.sanger.ac.uk/cosmic/file_download/GRCh38/cosmic/v92/CosmicFusionExport.tsv.gz );
        url=$( node  -e "var resp = $resp; console.log(resp.url);" );
        curl "$url" -o CosmicFusionExport.tsv.gz
        gunzip CosmicFusionExport.tsv.gz
        ''')


rule load_local:
    input: f'{DATA_DIR}/local/{{local}}.json'
    container: CONTAINER
    log: f'{LOGS_DIR}/local-{{local}}.logs.txt'
    output: f'{DATA_DIR}/local-{{local}}.COMPLETE'
    shell: LOADER_COMMAND + ' file ontology {input} &> {log}; cp {log} {output}'


rule load_ncit:
    input: expand(rules.load_local.output, local=['vocab']),
        data=rules.download_ncit.output
    container: CONTAINER
    log: f'{LOGS_DIR}/ncit.logs.txt'
    output: f'{DATA_DIR}/ncit.COMPLETE'
    shell: LOADER_COMMAND + ' file ncit {input.data} &> {log}; cp {log} {output}'


if USE_FDA_UNII:
    rule load_fda_srs:
        input: expand(rules.load_local.output, local=['vocab']),
            data=f'{DATA_DIR}/fda/UNII_Records.txt'
        container: CONTAINER
        log: f'{LOGS_DIR}/fdaSrs.logs.txt'
        output: f'{DATA_DIR}/fdaSrs.COMPLETE'
        shell: LOADER_COMMAND + ' file fdaSrs {input.data} &> {log}; cp {log} {output}'


    rule load_ncit_fda:
        input: rules.load_ncit.output,
            rules.load_fda_srs.output,
            data=rules.download_ncit_fda.output
        container: CONTAINER
        log: f'{LOGS_DIR}/ncitFdaXref.logs.txt'
        output: f'{DATA_DIR}/ncitFdaXref.COMPLETE'
        shell: LOADER_COMMAND + ' file ncitFdaXref {input.data} &> {log}; cp {log} {output}'


rule load_refseq:
    input: expand(rules.load_local.output, local=['vocab']),
        data=rules.download_refseq.output
    container: CONTAINER
    log: f'{LOGS_DIR}/refseq.logs.txt'
    output: f'{DATA_DIR}/refseq.COMPLETE'
    shell: LOADER_COMMAND + ' file refseq {input.data} &> {log}; cp {log} {output}'


rule load_ensembl:
    input: rules.load_refseq.output,
        data=rules.download_ensembl.output
    container: CONTAINER
    log: f'{LOGS_DIR}/ensembl.logs.txt'
    output: f'{DATA_DIR}/ensembl.COMPLETE'
    shell: LOADER_COMMAND + ' file ensembl {input.data} &> {log}; cp {log} {output}'


rule load_do:
    input: rules.load_ncit.output,
        data=rules.download_do.output
    container: CONTAINER
    log: f'{LOGS_DIR}/do.logs.txt'
    output: f'{DATA_DIR}/do.COMPLETE'
    shell: LOADER_COMMAND + ' file diseaseOntology {input.data} &> {log}; cp {log} {output}'


rule load_uberon:
    input: rules.load_ncit.output,
        data=rules.download_uberon.output
    container: CONTAINER
    log: f'{LOGS_DIR}/uberon.logs.txt'
    output: f'{DATA_DIR}/uberon.COMPLETE'
    shell: LOADER_COMMAND + ' file uberon {input.data} &> {log}; cp {log} {output}'


rule load_drugbank:
    input: rules.load_fda_srs.output if USE_FDA_UNII else [],
        data=rules.download_drugbank.output
    container: CONTAINER
    log: f'{LOGS_DIR}/drugbank.logs.txt'
    output: f'{DATA_DIR}/drugbank.COMPLETE'
    shell: LOADER_COMMAND + ' file drugbank {input.data} &> {log}; cp {log} {output}'


rule load_oncotree:
    input: rules.load_ncit.output
    container: CONTAINER
    log: f'{LOGS_DIR}/oncotree.logs.txt'
    output: f'{DATA_DIR}/oncotree.COMPLETE'
    shell: LOADER_COMMAND + ' api oncotree &> {log}; cp {log} {output}'


rule load_dgidb:
    input: rules.load_local.output
    container: CONTAINER
    log: f'{LOGS_DIR}/dgidb.logs.txt'
    output: f'{DATA_DIR}/dgidb.COMPLETE'
    shell: LOADER_COMMAND + ' api dgidb &> {log}; cp {log} {output}'


def get_drug_inputs(wildcards):
    inputs = [*rules.load_ncit.output]
    if USE_FDA_UNII:
        inputs.extend(rules.load_fda_srs.output)
    container: CONTAINER
    if USE_DRUGBANK:
        inputs.append(*rules.load_drugbank.output)
    return inputs


rule all_drugs:
    input: lambda wildcards: get_drug_inputs(wildcards)
    container: CONTAINER
    output: f'{LOGS_DIR}/all_drugs.COMPLETE'
    shell: 'touch {output}'


rule all_diseases:
    input: rules.load_do.output,
        rules.load_ncit.output,
        rules.load_oncotree.output
    container: CONTAINER
    output: f'{LOGS_DIR}/all_diseases.COMPLETE'
    shell: 'touch {output}'


rule load_cancerhotspots:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes']),
        rules.load_oncotree.output,
        rules.load_ensembl.output,
        data=rules.download_cancerhotspots.output
    container: CONTAINER
    log: f'{LOGS_DIR}/cancerhotspots.logs.txt'
    output: f'{DATA_DIR}/cancerhotspots.COMPLETE'
    shell: LOADER_COMMAND + ' file cancerhotspots {input.data} &> {log}; cp {log} {output}'


rule load_PMC4232638:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes']),
        data=rules.download_PMC4232638.output
    container: CONTAINER
    log: f'{LOGS_DIR}/PMC4232638.logs.txt'
    output: f'{DATA_DIR}/PMC4232638.COMPLETE'
    shell: LOADER_COMMAND + ' file PMC4232638 {input.data} &> {log}; cp {log} {output}'


rule load_PMC4468049:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes']),
        rules.all_diseases.output,
        data=rules.download_PMC4468049.output
    container: CONTAINER
    log: f'{LOGS_DIR}/PMC4468049.logs.txt'
    output: f'{DATA_DIR}/PMC4468049.COMPLETE'
    shell: LOADER_COMMAND + ' file PMC4468049 {input.data} &> {log}; cp {log} {output}'


rule load_civic:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes', 'evidenceLevels', 'aacr', 'asco']),
        rules.load_ncit.output,
        rules.load_do.output
    container: CONTAINER
    log: f'{LOGS_DIR}/civic.logs.txt'
    output: f'{DATA_DIR}/civic.COMPLETE'
    shell: LOADER_COMMAND + ' api civic &> {log}; cp {log} {output}'


rule load_cgi:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes', 'evidenceLevels']),
        rules.all_diseases.output,
        rules.all_drugs.output,
        data=rules.download_cgi.output
    container: CONTAINER
    log: f'{LOGS_DIR}/cgi.logs.txt'
    output: f'{DATA_DIR}/cgi.COMPLETE'
    shell: LOADER_COMMAND + ' file cgi {input.data} &> {log}; cp {log} {output}'


rule load_docm:
    input: expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes']),
        rules.load_ncit.output,
        rules.load_do.output
    container: CONTAINER
    log: f'{LOGS_DIR}/docm.logs.txt'
    output: f'{DATA_DIR}/docm.COMPLETE'
    shell: LOADER_COMMAND + ' api docm &> {log}; cp {log} {output}'


rule load_approvals:
    container: CONTAINER
    log: f'{LOGS_DIR}/fdaApprovals.logs.txt'
    output: f'{DATA_DIR}/fdaApprovals.COMPLETE'
    shell: LOADER_COMMAND + ' api fdaApprovals &> {log}; cp {log} {output}'


rule load_clinicaltrialsgov:
    input: expand(rules.load_local.output, local=['vocab']),
        rules.all_diseases.output,
        rules.all_drugs.output,
        data=rules.download_clinicaltrialsgov.output
    container: CONTAINER
    log: f'{LOGS_DIR}/clinicaltrialsgov.logs.txt'
    output: f'{DATA_DIR}/clinicaltrialsgov.COMPLETE'
    shell: LOADER_COMMAND + ' api clinicaltrialsgov &> {log}; cp {log} {output}'


rule load_cosmic_resistance:
    input: expand(rules.load_local.output, local=['vocab', 'chromosomes']),
        rules.all_diseases.output,
        rules.all_drugs.output,
        main=rules.download_cosmic_resistance.output,
        supp=rules.download_cosmic_diseases.output
    container: CONTAINER
    log: f'{LOGS_DIR}/cosmic_resistance.logs.txt'
    output: f'{DATA_DIR}/cosmic_resistance.COMPLETE'
    shell: LOADER_COMMAND + ' cosmic resistance {input.main} {input.supp} &> {log}; cp {log} {output}'


rule load_cosmic_fusions:
    input: rules.all_diseases.output,
        main=rules.download_cosmic_fusions.output,
        supp=rules.download_cosmic_diseases.output
    container: CONTAINER
    log: f'{LOGS_DIR}/cosmic_fusions.logs.txt'
    output: f'{DATA_DIR}/cosmic_fusions.COMPLETE'
    shell: LOADER_COMMAND + ' cosmic fusions {input.main} {input.supp} &> {log}; cp {log} {output}'


rule load_moa:
    input: rules.load_oncotree.output,
        expand(rules.load_local.output, local=['vocab', 'signatures', 'chromosomes', 'evidenceLevels', 'aacr', 'asco'])
    container: CONTAINER
    log: f'{LOGS_DIR}/load_moa.logs.txt'
    output: f'{DATA_DIR}/moa.COMPLETE'
    shell: LOADER_COMMAND + ' api moa  &> {log}; cp {log} {output}'
