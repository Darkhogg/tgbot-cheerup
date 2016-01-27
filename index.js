#!/usr/bin/env node
'use strict';
const crashit = require('crashit');
const bot = require('./bot');

crashit.handleSignals(['SIGINT', 'SIGTERM'])
crashit.handleUncaught();
process.on('unhandledRejection', (err) => {
    console.err(err);
    crashit.crash(err);
})

bot.setupPollLoop();
bot.setupTickLoop(300);
