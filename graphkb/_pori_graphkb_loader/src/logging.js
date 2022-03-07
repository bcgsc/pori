/**
 * module responsible for setting up logging
 * @module importer/logging
 */
const winston = require('winston');

const GKB_LOG_LEVEL = process.env.GKB_LOG_LEVEL || 'info';

const transports = [
    new winston.transports.Console({
        colorize: true,
        level: GKB_LOG_LEVEL,
        timestamp: true,
    }),
];


const logFormat = winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`);

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp(),
        logFormat,
    ),
    levels: winston.config.npm.levels,
    transports,
});


module.exports = { logger };
