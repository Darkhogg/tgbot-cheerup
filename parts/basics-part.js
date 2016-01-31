'use strict';
const pd = require('paperdrone');

module.exports = pd.Plugin.define('CheerUp_Basics', function (bot, options) {
    /* Set up the help message */
    bot.help.commands = ['help'];
    bot.help.text =
        'Hi! I\'m a bot that will send you cheering up messages on demand or at your desired intervals.\n' +
        '\nCommands:\n' +
        '  /settings - See and modify your settings\n' +
        '  /cheerup - Immediately sends you a cheering up message\n' +
        '  /newsched - Create a new schedule\n' +
        '  /listsched - List all running schedules\n'
        '  /delsched - Stop a running schedule\n'
        '\nMy master is @Darkhogg, ask him anything about me!\n' +
        'I\'m an open source bot: https://github.com/Darkhogg/tgbot-cheerup';

    /* Log the bot's name and username */
    bot.info().then(function (info) {
      bot.logger.info('[CheerUpBot]  started as: "%s" @%s', info.full_name, info.username);
    });

    /* Start command */
    bot.on('command.start', function ($evt, cmd, msg) {
        return bot.storage.get('settings', msg.from.id).then(obj => {
            let ps = [bot.api.sendMessage({
                'chat_id': msg.chat.id,
                'text': 'Welcome!  If this is the first time you use me, I\'m going to ask you a few questions.  ' +
                        'When we\'re finished, use /help to see what you can do.'
            })];

            if (!obj.timezone) {
                ps.push(bot.prompter.prompt(msg.chat.id, msg.from.id, 'settings_timezone'));
            }

            return Promise.all(ps);
        });
    });

    /* Settings command */
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

    /* ========================== */
    /* === SETTINGS: TIMEZONE === */

    bot.on('prompt.request.settings_timezone', function ($evt, prompt) {
        return bot.api.sendMessage({
            'chat_id': prompt.chat,
            'text': 'Write your timezone\'s name.\n_Note_: See the map at [http://momentjs.com/timezone/]() to see what timezone you\'re in.',
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
})
