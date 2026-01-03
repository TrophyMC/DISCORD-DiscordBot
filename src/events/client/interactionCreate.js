const Event = require('../../structures/Events.js');

module.exports = class InteractionCreate extends Event {
    constructor(client) {
        super(client, 'interactionCreate', false);
    }

    async execute(interaction) {
        if (!interaction.isChatInputCommand()) return;

        const command = this.client.commands.get(interaction.commandName);

        if (!command) return;

        await command.execute(interaction);

    }
};
