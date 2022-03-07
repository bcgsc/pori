const fs = require('fs');
const path = require('path');

const { runLoader } = require('../src');
const { createOptionsMenu, fileExists } = require('../src/cli');

const civic = require('../src/civic');
const dgidb = require('../src/dgidb');
const docm = require('../src/docm');
const oncotree = require('../src/oncotree');
const fdaApprovals = require('../src/fdaApprovals');

const cancerhotspots = require('../src/cancerhotspots');
const cgi = require('../src/cancergenomeinterpreter');
const cgl = require('../src/cgl');
const diseaseOntology = require('../src/diseaseOntology');
const drugbank = require('../src/drugbank');
const ensembl = require('../src/ensembl');
const fdaSrs = require('../src/fdaSrs');
const gscTherapeuticOntology = require('../src/gscTherapeuticOntology');
const ncit = require('../src/ncit');
const ncitFdaXref = require('../src/ncit/ncitFdaXref');
const ontology = require('../src/ontology');
const refseq = require('../src/refseq');
const PMC4468049 = require('../src/PMC4468049');
const PMC4232638 = require('../src/PMC4232638');
const uberon = require('../src/uberon');
const variants = require('../src/variants');
const asco = require('../src/asco');
const moa = require('../src/moa');

const clinicaltrialsgov = require('../src/clinicaltrialsgov');

const cosmicResistance = require('../src/cosmic/resistance');
const cosmicFusions = require('../src/cosmic/fusions');

const API_MODULES = {
    asco, clinicaltrialsgov, dgidb, docm, fdaApprovals, moa, oncotree,
};

const FILE_MODULES = {
    PMC4232638,
    PMC4468049,
    cancerhotspots,
    cgi,
    cgl,
    clinicaltrialsgov,
    diseaseOntology,
    drugbank,
    ensembl,
    fdaSrs,
    gscTherapeuticOntology,
    ncit,
    ncitFdaXref,
    ontology,
    refseq,
    uberon,
    variants,
};

const COSMIC_MODULES = {
    fusions: cosmicFusions,
    resistance: cosmicResistance,
};

const ALL_MODULES = {
    ...API_MODULES,
    ...FILE_MODULES,
    ...COSMIC_MODULES,
    civic,
};

const parser = createOptionsMenu();

const subparsers = parser.add_subparsers({ help: 'Sub-command help', required: true });
const apiParser = subparsers.add_parser('api');
apiParser.add_argument('module', {
    choices: Object.keys(API_MODULES),
    help: 'module to run',
});

const fileParser = subparsers.add_parser('file');
fileParser.add_argument('module', {
    choices: Object.keys(FILE_MODULES),
    help: 'module to run',
});
fileParser.add_argument('input', {
    help: 'path to the file/dir to be loaded',
    type: fileExists,
});
fileParser.add_argument('--ignoreCache', {
    action: 'store_true',
    default: false,
    help: 'Load the full content, to not check for previously loaded records already in the GraphKB instance',
});

const civicParser = subparsers.add_parser('civic');
civicParser.add_argument('--trustedCurators', {
    default: [],
    help: 'CIViC User IDs of curators whose statements should be imported even if they have not yet been reviewed (evidence is submitted but not accepted)',
    nargs: '+',
});


const cosmicParser = subparsers.add_parser('cosmic');
cosmicParser.add_argument('module', {
    choices: Object.keys(COSMIC_MODULES),
    help: 'module to run',
});
cosmicParser.add_argument('input', {
    help: 'path to the file to be loaded',
    type: fileExists,
});
cosmicParser.add_argument('classification', {
    help: 'path to the cosmic classification file',
    type: fileExists,
});

const { module: moduleName, input, ...options } = parser.parse_args();

let loaderFunction;

if (input) {
    loaderFunction = ALL_MODULES[moduleName || 'civic'].uploadFile;
} else {
    loaderFunction = ALL_MODULES[moduleName || 'civic'].upload;
}

const loaderOptions = { ...options };

if (input) {
    if (moduleName === 'clinicaltrialsgov') {
        if (fs.lstatSync(input).isDirectory()) {
            const files = fs.readdirSync(input)
                .map(filename => path.join(input, filename));
            loaderOptions.files = files;
        } else {
            loaderOptions.files = [input];
        }
    } else {
        loaderOptions.filename = input;

        if (options.module === 'cosmic') {
            loaderOptions.classification = options.classification;
        }
    }
}

runLoader(options, loaderFunction, loaderOptions)
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
