'use strict';
const pd = require('paperdrone');

const phrases = require('../phrases');

module.exports = pd.Plugin.define('CheerUp_Cheerup', function (bot, options) {

    /* A /cheerup command was received */
    bot.on('command.cheerup', function ($evt, cmd, msg) {
        return bot.emit('cheerup', msg.from);
    });

    /* Event emitted whenever we want to send a cheering up message */
    bot.on('cheerup', function ($evt, user) {
        bot.logger.info('[CheerUpBot]  sending cheering up message to #%s (@%s)', user.id, user.username || '~');

        return bot.api.sendMessage({
            'chat_id': user.id,
            'text': phrases.random()
        }).tap(() => bot.users.updateActive(user.id));
    });
});
