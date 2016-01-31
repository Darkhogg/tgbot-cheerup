'use strict';
const pd = require('paperdrone');
const mongodb = require('mongodb-bluebird');

const log = require('./log');

const BasicsPart = require('./parts/basics-part');
const CheerupPart = require('./parts/cheerup-part');
const SchedulePart = require('./parts/schedule-part');

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

        /* Add built-in plugins */
        bot.addPlugin(new pd.plugins.BotInfoPlugin());
        bot.addPlugin(new pd.plugins.KeyedStoragePlugin());
        bot.addPlugin(new pd.plugins.SchedulerPlugin());
        bot.addPlugin(new pd.plugins.MessagesPlugin());
        bot.addPlugin(new pd.plugins.CommandsPlugin());
        bot.addPlugin(new pd.plugins.HelpPlugin());
        bot.addPlugin(new pd.plugins.PrompterPlugin());
        bot.addPlugin(new pd.plugins.UsersPlugin());

        /* add bot parts */
        bot.addPlugin(new BasicsPart());
        bot.addPlugin(new CheerupPart());
        bot.addPlugin(new SchedulePart());

        return bot;
    });
};
