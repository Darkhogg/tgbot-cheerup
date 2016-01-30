#!/usr/bin/env node
'use strict';
const crashit = require('crashit');
const Bot = require('./bot');

crashit.handleSignals(['SIGINT', 'SIGTERM'])
crashit.handleUncaught();
process.on('unhandledRejection', (err) => {
    console.error(err.stack);
    crashit.crash(err);
});

Bot().then(bot => {
    bot.setupPollLoop();
    bot.setupTickLoop(300);
});
