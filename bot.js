'use strict';
const chrono = require('chrono-node');
const fuzzy = require('fuzzy');
const pd = require('paperdrone');
const mongodb = require('mongodb-bluebird');
const moment = require('moment-timezone');
const uuid = require('node-uuid');

const phrases = require('./phrases');
const log = require('./log');

module.exports = function createBot () {

    return mongodb.connect(process.env.MONGO_URL).then((db) => {
        /* Create and configure the bot */
        let bot = new pd.Bot({
            'token': process.env.TGBOT_TOKEN,
            'logger': log,
            'mongo': {
                'client': db
            }
        });

        bot.logger.level = process.env.LOG_LEVEL;
        bot.logger.colors = !!process.env.LOG_COLORS;

        bot.addPlugin(new pd.plugins.BotInfoPlugin());
        bot.addPlugin(new pd.plugins.KeyedStoragePlugin());
        bot.addPlugin(new pd.plugins.SchedulerPlugin());
        bot.addPlugin(new pd.plugins.MessagesPlugin());
        bot.addPlugin(new pd.plugins.CommandsPlugin());
        bot.addPlugin(new pd.plugins.HelpPlugin());
        bot.addPlugin(new pd.plugins.PrompterPlugin());
        bot.addPlugin(new pd.plugins.UsersPlugin());


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

        bot.on(['command.schedule', 'command.newsched'], function ($evt, cmd, msg) {
            return bot.prompter.prompt(msg.chat.id, msg.from.id, 'schedule_time');
        });

        bot.on('command.listsched', function ($evt, cmd, msg) {
            return bot.storage.get('settings', msg.from.id).then(settings => {
                return bot.storage.list('sched:'+msg.from.id).then(function (scheds) {
                    let lines = scheds.map((sched) => ' - ' +
                        'next: *' + moment(sched.value.next).tz(settings.timezone).format() + '*  ' +
                        'interval: *' + moment.duration(sched.value.interval, 'seconds').humanize() + '*'
                    );

                    return bot.api.sendMessage({
                        'chat_id': msg.chat.id,
                        'text': 'You have *' + lines.length + '* configured schedules:\n' +
                                lines.join('\n') +
                                '\n\nTo remove any of them, use the /delsched command.',
                        'parse_mode': 'Markdown'
                    });
                });
            });
        });

        bot.on('command.delsched', function ($evt, cmd, msg) {
            bot.prompter.prompt(msg.chat.id, msg.from.id, 'delete_schedule');
        });

        bot.on('prompt.request.schedule_time', function ($evt, prompt) {
            let now = moment.tz('Europe/Madrid').format('YYYY-MM-DD hh:mm:ss');
            return bot.api.sendMessage({
                'chat_id': prompt.chat,
                'text': 'When do you want me to begin sending you cheering up messages?\n' +
                        '_Note_: Write a date and time with the format `YYYY-MM-DD hh:mm:ss`.  ' +
                        'For example, it\'s `' + now + '` in Madrid right now.',
                /*'reply_markup': Json.stringify({
                    'keyboard': [['8 hours', '1 day', '1 week']]
                    'one_time_keyboard': true,
                }),*/
                'parse_mode': 'Markdown'
            });
        });

        bot.on('prompt.complete.schedule_time', function ($evt, prompt, result) {
            return bot.storage.get('settings', prompt.user).then(settings => {
                let when = moment.tz(result.text, 'YYYY-MM-DD HH:mm:ss', settings.timezone);

                bot.logger.debug('[CheerUpBot]  date "%s": ', result.text, when.format());

                if (!when.isValid()) {
                    when = moment().tz(settings.timezone);
                }

                return bot.api.sendMessage({
                    'chat_id': prompt.chat,
                    'text': 'You\'ve chosen to start receiving cheering up messages on *' + when.format() + '*.',
                    'parse_mode': 'Markdown'
                }).then(() => {
                    return bot.prompter.prompt(prompt.chat, prompt.user, 'schedule_duration', { 'time': when.toDate() })
                });
            });
        });

        bot.on('prompt.request.schedule_duration', function ($evt, prompt) {
            return bot.api.sendMessage({
                'chat_id': prompt.chat,
                'text': 'At what interval do you want me to send you cheering up messages?\n' +
                        '_Note_: Write a number and unit separated by a space.  ' +
                        'For example, `1 day`, `8 hours`, `90 minutes`.',
                'reply_markup': JSON.stringify({
                    'keyboard': [['8 hours'], ['1 day'], ['1 week']],
                    'one_time_keyboard': true,
                }),
                'parse_mode': 'Markdown'
            });
        });

        bot.on('prompt.complete.schedule_duration', function ($evt, prompt, result) {
            let parts = result.text.trim().split(/\s+/);
            let duration = moment.duration(parseInt(parts[0]), parts[1]);

            bot.logger.debug('[CheerUpBot]  duration "%s": ', result.text, duration.humanize());

            if (duration.asSeconds() <= 0) {
                duration = moment.duration(1, 'day');
            }

            return bot.api.sendMessage({
                'chat_id': prompt.chat,
                'text': 'You\'ve chosen to receive cheering up messages with an interval of *' + duration.humanize() + '*.',
                'parse_mode': 'Markdown',
                'reply_markup': JSON.stringify({'hide_keyboard': true}),

            }).then(() => {
                let schedId = uuid.v4().replace(/-/, '').substring(0, 6);

                let now = moment();
                let nextTime = moment(prompt.data.time);
                while (duration.asSeconds() > 0 && nextTime.isValid() && now.isAfter(nextTime)) {
                    nextTime.add(duration);
                }

                bot.logger.verbose('[CheerUpBot] (@%s)  new schedule: <%s> start at "%s" with interval "%s"',
                    (result.from.username || result.from.id), schedId, nextTime.format(), duration.humanize());

                return bot.storage.set('sched:' + prompt.user, schedId, {
                    'next': nextTime.toDate(),
                    'interval': duration.asSeconds()

                }).then(() => bot.scheduler.schedule('cheerup', nextTime, {
                    'user_id': prompt.user,
                    'username': result.from.username,
                    'sched_id': schedId,

                })).then(() => bot.api.sendMessage({
                    'chat_id': prompt.chat,
                    'text': 'A new cheer up schedule has been created!\n' +
                            '  \\[' + schedId + ']  next time: *' + nextTime.format() + '*   interval: *' + duration.humanize() + '*',
                    'parse_mode': 'Markdown'
                }));
            });
        });

        bot.on('prompt.request.delete_schedule', function ($evt, prompt) {
            return bot.storage.get('settings', prompt.user).then(settings => {
                return bot.storage.list('sched:'+prompt.user).then(function (scheds) {
                    let lines = scheds.map((sched) => ' - \\[_' + sched.key + '_] ' +
                        'next: *' + moment(sched.value.next).tz(settings.timezone).format() + '*  ' +
                        'interval: *' + moment.duration(sched.value.interval, 'seconds').humanize() + '*'
                    );
                    let kbd = scheds.map((sched) => [sched.key]).concat([['/cancel']]);

                    return bot.api.sendMessage({
                        'chat_id': prompt.chat,
                        'text': 'You have *' + lines.length + '* configured schedules:\n' +
                                lines.join('\n') +
                                '\n\nSelect the ID of the schedule to remove.',
                        'parse_mode': 'Markdown',
                        'reply_markup': JSON.stringify({
                            'keyboard': kbd,
                            'one_time_keyboard': true,
                        })
                    });
                });
            });
        });

        bot.on('prompt.complete.delete_schedule', function ($evt, prompt, result) {
            if (result.text == '/cancel') {
                return bot.api.sendMessage({
                    'chat_id': prompt.chat,
                    'text': 'Ok, I\'ll leave everything as is!',
                    'reply_markup': JSON.stringify({
                        'hide_keyboard': true,
                    })
                });
            }

            return bot.storage.del('sched:'+prompt.chat, result.text).then((dr) => {
                let message = (dr.result.n
                    ? 'Removed schedule _' + result.text + '_!'
                    : 'Schedule _' + result.text + '_ was not found.'
                );

                return bot.api.sendMessage({
                    'chat_id': prompt.chat,
                    'text': message,
                    'parse_mode': 'Markdown',
                    'reply_markup': JSON.stringify({
                        'hide_keyboard': true,
                    })
                });
            });
        });


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


        /* A scheduled cheerup is due */
        bot.on('scheduled.cheerup', function ($evt, type, when, data) {
            return bot.storage.get('sched:'+data.user_id, data.sched_id).then(obj => {
                if (!obj.interval) {
                    bot.logger.verbose('[CheerUpBot]  cheerup schedule <%s> not found', data.sched_id);
                    return;
                }

                let now = moment();
                let duration = moment.duration(obj.interval, 'seconds');

                let nextTime = moment(when);
                while (duration.asSeconds() > 0 && nextTime.isValid() && now.isAfter(nextTime)) {
                    nextTime.add(duration);
                }

                return bot.scheduler.schedule('cheerup', nextTime, data)
                .then(() => bot.storage.set('sched:'+data.user_id, data.sched_id, {
                    'next': nextTime.toDate(),
                    'interval': duration.asSeconds()
                }))
                .then(() => bot.emit('cheerup', { 'id': data.user_id, 'username': data.username }));
            });
        });

        /* Event emitted whenever we want to send a cheering up message */
        bot.on('cheerup', function ($evt, user) {
            bot.logger.info('[CheerUpBot]  sending cheering up message to #%s (@%s)', user.id, user.username || '~');

            return bot.api.sendMessage({
                'chat_id': user.id,
                'text': phrases.random()
            }).tap(() => bot.users.updateActive(user.id));
        });

        return bot;
    });
};
