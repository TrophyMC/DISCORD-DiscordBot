const { BOT } = require("../config.json")
const BotClient = require("./client/BotClient");

const client = new BotClient();
client.start(BOT.TOKEN);