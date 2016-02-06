#!/usr/bin/env node
'use strict';
const crashit = require('crashit');

const log = require('./log');
const Bot = require('./bot');

crashit.addHook((cause) => {
    log.warn('[App]  shutting down: %s', cause);
});

crashit.handleSignals(['SIGINT', 'SIGTERM', 'SIGUSR2'], true)
crashit.handleUncaught(true);
process.on('unhandledRejection', (err) => {
    console.error(err.stack);
    crashit.crash(err, true);
});

Bot().then(bot => {
    bot.setupPollLoop();
    bot.setupTickLoop(parseInt(process.env.TGBOT_TICK_INTERVAL) || 60);
});
