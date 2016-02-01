'use strict';
const pd = require('paperdrone');
const fuzzy = require('fuzzy');
const moment = require('moment-timezone');
const uuid = require('node-uuid');

module.exports = pd.Plugin.define('CheerUp_Schedule', function (bot, options) {

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
            .tap(() => bot.logger.verbose(
                '[CheerUpBot]  sending scheduled cheerup <%s> to #%s (@%s)',
                data.sched_id, data.user_id, data.username||'~'
            ))
            .then(() => bot.emit('cheerup', { 'id': data.user_id, 'username': data.username }));
        });
    });
});
