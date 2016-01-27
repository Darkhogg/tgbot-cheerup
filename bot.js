'use strict';
const chrono = require('chrono-node');
const fuzzy = require('fuzzy');
const pd = require('paperdrone');
const pmongo = require('promised-mongo');
const moment = require('moment-timezone');
const uuid = require('node-uuid');

const phrases = require('./phrases');
const log = require('./log');

/* Create and configure the bot */
let bot = new pd.Bot({
    'token': process.env.TGBOT_TOKEN,
    'logger': log,
    'mongo': {
        'client': pmongo('cheerupbot')
    }
});

bot.logger.level = process.env.LOG_LEVEL;
bot.logger.colors = !!process.env.LOG_COLORS;

bot.addPlugin(new pd.plugins.BotInfoPlugin());
bot.addPlugin(new pd.plugins.KeyedStoragePlugin());
bot.addPlugin(new pd.plugins.MessagesPlugin());
bot.addPlugin(new pd.plugins.CommandsPlugin());
bot.addPlugin(new pd.plugins.HelpPlugin());
bot.addPlugin(new pd.plugins.PrompterPlugin());


/* Set up the help message */
bot.help.commands = ['help'];
bot.help.text =
    'Hi! I\'m a bot that will send you cheering up messages on demand or at your desired intervals.\n' +
    '\nCommands:\n' +
    '  /settings - See and modify your settings\n' +
    '  /cheerup - Immediately sends you a cheering up message\n' +
    '  /schedule - Create a new schedule' +
    '\nMy master is @Darkhogg\n' +
    'I\'m an open source bot: https://github.com/Darkhogg/tgbot-cheerup';


/* Log the bot's name and username */
bot.info().then(function (info) {
  bot.logger.info('[CheerUpBot]  started as: "%s" @%s', info.full_name, info.username);
});


bot.on('command.start', function ($evt, cmd, msg) {
    return bot.storage.get('settings', msg.from.id).then(obj => {
        let ps = [bot.api.sendMessage({
            'chat_id': msg.chat.id,
            'text': 'Welcome!  If this is the first time you use me, I\'m going to ask you a few questions.' +
                    'When we\'re finished, use /help to see what you can do.'
        })];

        if (!obj.timezone) {
            ps.push(bot.prompter.prompt(msg.chat.id, msg.from.id, 'settings_timezone'));
        }

        return Promise.all(ps);
    });
});

bot.on('command.settings', function ($evt, cmd, msg) {
    let setting = cmd.payload.trim().toLowerCase();
    if (['timezone'].indexOf(setting) >= 0) {
        return bot.prompter.prompt(msg.chat.id, msg.from.id, 'settings_' + setting);
    }

    return bot.storage.get('settings', msg.from.id).then(obj => {
        bot.api.sendMessage({
            'chat_id': msg.chat.id,
            'text': 'Your current settings are:\n' +
                    '  - _timezone_: *' + obj.timezone + '*\n' +
                    '\nTo modify a value, send `/settings <name>`, where _<name>_ is the setting name.  ' +
                    'For example, `/settings timezone` will let you modify your timezone.',
            'parse_mode': 'Markdown'
        });
    });
});

/* A /cheerup command was received */
bot.on('command.cheerup', function ($evt, cmd, msg) {
    return bot.emit('cheerup', msg.from);
});

bot.on('command.schedule', function ($evt, cmd, msg) {
    let key = uuid.v4();
    let cat = 'sched-' + bot.id;

    return bot.storage.set(cat, key, {}).then(() => {
        return Promise.all([
            bot.prompter.prompt(msg.chat.id, msg.from.id, 'schedule_time', {'cat': cat, 'key': key}),
            bot.prompter.prompt(msg.chat.id, msg.from.id, 'schedule_duration', {'cat': cat, 'key': key}),
        ]);
    });
});


bot.on('prompt.request.schedule_time', function ($evt, prompt) {
    return bot.api.sendMessage({
        'chat_id': prompt.chat,
        'text': 'When do you want me to begin sending you cheering up messages?\n' +
                '_Note: Write a date and time with the format `YYYY-MM-DD hh:mm:ss`.  ' +
                'For example, it\'s ' + moment.tz('Europe/Madrid') + ' in Madrid right now._',
        'parse_mode': 'Markdown'
    });
});

bot.on('prompt.complete.schedule_time', function ($evt, prompt, result) {
    return bot.storage.get('settings', prompt.user).then(obj => {
        let when = moment.tz(result.text, 'YYYY-MM-DD HH:mm:ss', obj.timezone);
        console.log(when.utc().format());
    });
});

bot.on('prompt.request.schedule_duration', function ($evt, prompt) {

});

bot.on('prompt.complete.schedule_duration', function ($evt, prompt, result) {

});


bot.on('prompt.request.settings_timezone', function ($evt, prompt) {
    return bot.api.sendMessage({
        'chat_id': prompt.chat,
        'text': 'Write your timezone\'s name.\n_Note: See the map at http://momentjs.com/timezone/ to see what timezone you\'re in._',
        'parse_mode': 'Markdown'
    });
});

bot.on('prompt.complete.settings_timezone', function ($evt, prompt, result) {
    let timezones = moment.tz.names();
    let filtered = fuzzy.filter(result.text, timezones);

    let selected = filtered.length ? filtered[0].original : 'UTC';
    bot.logger.debug('[CheerUpBot]  timezone "%s" (%s matches): ', result.text, filtered.length, selected);

    return bot.storage.get('settings', prompt.user).then(obj => {
        obj.timezone = selected;
        return bot.storage.set('settings', prompt.user, obj);

    }).then(() => {
        return bot.api.sendMessage({
            'chat_id': prompt.chat,
            'text': 'Your timezone has been set as *' + selected + '*.  ' +
                    'I\'s currently ' + moment.tz(selected).format('HH:mm') + ' in this timezone.  ' +
                    'If this is wrong or you want to change it, refer to the /help.',
            'parse_mode': 'Markdown'
        });
    });
});


/* A scheduled cheerup is due */
bot.on('scheduled.cheerup', function ($evt, type, when, data) {
    return bot.emit('cheerup', data.user);
});

/* Event emitted whenever we want to send a cheering up message */
bot.on('cheerup', function ($evt, user) {
    bot.logger.verbose('[CheerUpBot]  sending cheering up message to #%s (@%s)', user.id, user.username || '~');

    return bot.api.sendMessage({
        'chat_id': user.id,
        'text': phrases.random()
    });
});


/* Export it to the world! */
module.exports = bot;
