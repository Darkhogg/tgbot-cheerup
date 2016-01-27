'use strict';
const winston = require('winston')

let logger = new winston.Logger();

logger.cli();
logger.add(winston.transports.Console, {
  'level':       process.env.LOG_LEVEL,
  'colorize':    !!process.env.LOG_COLORS,
  'prettyPrint': !!process.env.LOG_PRETTY,
});

module.exports = logger;
