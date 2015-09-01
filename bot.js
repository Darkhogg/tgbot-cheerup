var pd = require('paperdrone');

var bot = new pd.Bot({'token': process.env.TGBOT_TOKEN});

bot.logger.level = 'debug';

bot.addPlugin(new pd.plugins.CommandsPlugin());
bot.addPlugin(new pd.plugins.HelpPlugin());

bot.help.text = 'The Cheer Up Bot is a bot that can be configured to send you cheering up messages at custom intervals.';
bot.help.commands = ['help'];


module.exports = bot;
