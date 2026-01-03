const Event = require("../../structures/Events");
const {ActivityType} = require("discord.js");
const logger = require("../../utils/logger");

class Bot extends Event {
    constructor(client) {
        super(client, "clientReady", true);
    }

    async execute() {
        logger.info(`✅  Logged in as ${this.client.user.username}`);

        let status = [
            {
                name: "Private League Games",
                type: ActivityType.Watching,
            },
            {
                name: "Use /help",
                type: ActivityType.Listening,
            },
            {
                name: "Developed by MecryTv",
                type: ActivityType.Custom,
            },
        ];

        setInterval(() => {
            let randomStatus = Math.floor(Math.random() * status.length);
            this.client.user.setActivity(status[randomStatus]);
        }, 10000);
    }
}

module.exports = Bot;