
module.exports = {
    plugins: ['plugins/markdown'],
    markdown: {
        idInHeadings: true
    },
    opts: {
        template: 'node_modules/docdash'
    },
    docdash: {
        collapse: true,
        search: true,
        scripts: [
            'docdash.jsdoc.css'
        ]
    },
    templates: {
        default: {
            staticFiles: {
                include: ['doc', 'config/docdash.jsdoc.css']
            }
        }
    }
};
