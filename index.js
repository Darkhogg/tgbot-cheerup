#!/usr/bin/env node

var bot = require('./bot');

bot.setupPollLoop();
bot.setupTickLoop(300);
