const { EmbedBuilder } = require("discord.js");
const logger = require("../utils/logger");
const path = require("path");

class Guardian {
    constructor() {
        this.client = null;
        this.ERROR_LOG_CHANNEL_ID = '1163164124683964507';
        this.DEVELOPER_PING_ROLE_ID = '1286386691925344390';
    }

    /**
     * @returns {string} Die Fehler-ID im Format PL-TIMESTAMP-RANDOM.
     */
    generateErrorId() {
        const timestamp = Math.floor(Date.now() / 1000);
        const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
        return `CW-${timestamp}-${randomPart}`;
    }

    /**
     * @param {import('discord.js').Client} client Die Discord-Client-Instanz.
     */
    initialize(client) {
        this.client = client;
        this._initializeGlobalHandlers();
        logger.guardian('info', "✅  Guardian betriebsbereit");
    }

    /**
     * @private
     */
    _initializeGlobalHandlers() {
        process.on('unhandledRejection', (reason, promise) => {
            logger.guardian('error', 'Unhandled Rejection erfasst:', reason);
            const error = new Error(reason || "Unbekannter Promise Rejection Grund");
            this.report(error, null, 'Unhandled Rejection');
        });

        process.on('uncaughtException', (err, origin) => {
            logger.guardian('error', `Uncaught Exception erfasst: ${err}`, `Origin: ${origin}`);
            this.report(err, null, 'Uncaught Exception');
        });
    }

    /**
     * @param {import('discord.js').Interaction} interaction - Die Interaktion, auf die geantwortet werden soll.
     * @param {string} errorId - Die generierte Fehler-ID.
     * @private
     */
    async _sendUserReply(interaction, errorId) {
        if (!interaction || !interaction.channel || !interaction.isCommand()) return;

        const replyContent = {
            content: `> Oops! 🛠️ Es ist ein unerwarteter Fehler aufgetreten.\n> **Fehler-ID:** \`${errorId}\`\n> \n> Bitte melde diese ID einem Teammitglied, damit wir das Problem schnell beheben können.`,
            ephemeral: true,
        };

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(replyContent);
            } else {
                await interaction.reply(replyContent);
            }
        } catch (e) {
            logger.guardian("error", "Konnte User-Fehlermeldung nicht senden:", e);
        }
    }

    /**
     * @param {Error} error - Das Fehlerobjekt.
     * @returns {{fileName: string, filePath: string, line: string} | null} Ein Objekt mit den Standortdetails oder null.
     * @private
     */
    _parseStackForLocation(error) {
        if (!error.stack) return null;

        const stackLines = error.stack.split('\n').slice(1);
        const relevantLine = stackLines.find(line => !line.includes('Guardian.js'));

        if (!relevantLine) return null;

        const locationMatch = relevantLine.match(/\((.*?)\)/);

        if (!locationMatch || !locationMatch[1]) return null;

        const fullPath = locationMatch[1];
        const parts = fullPath.split(':');
        const line = parts[parts.length - 2] || 'N/A';
        const filePath = parts.slice(0, parts.length - 2).join(':') || 'N/A';
        const fileName = path.basename(filePath) || 'N/A';

        return { fileName, filePath, line };
    }

    /**
     * @param {Error} error - Das Fehlerobjekt.
     * @param {string} errorId - Die generierte Fehler-ID.
     * @param {object} context - Zusätzliche Informationen über den Fehlerkontext.
     * @private
     */
    async _sendLogReport(error, errorId, context) {
        if (!this.client) {
            return logger.guardian('error', "Guardian wurde nicht initialisiert. Konnte Fehlerbericht nicht senden.");
        }

        const { interaction, type } = context;

        const errorLogChannelId = this.ERROR_LOG_CHANNEL_ID;

        if (!errorLogChannelId) {
            return logger.guardian('warn', `Hardcodierte 'ERROR_LOG_CHANNEL_ID' fehlt oder ist nicht ersetzt. Überspringe Discord-Log.`);
        }

        const logChannel = await this.client.channels.fetch(errorLogChannelId).catch(() => null);
        if (!logChannel) {
            return logger.guardian('error', `Fehler-Log-Channel mit ID ${errorLogChannelId} nicht gefunden.`);
        }

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle(`🛡️ Guardian | ${type}`)
            .setTimestamp()
            .setFooter({ text: `Fehler-ID: ${errorId}` });

        let contentToSend = null;

        if (interaction) {
            const developerPingRoleId = this.DEVELOPER_PING_ROLE_ID;
            if (developerPingRoleId) {
                const developerRole = await interaction.guild.roles.fetch(developerPingRoleId).catch(() => null);
                if (developerRole) {
                    contentToSend = `${developerRole}`;
                } else {
                    logger.guardian('warn', `Developer Ping Rolle mit ID ${developerPingRoleId} auf dem Server nicht gefunden.`);
                }
            } else {
                logger.guardian('warn', `Hardcodierte 'DEVELOPER_PING_ROLE_ID' fehlt oder ist nicht ersetzt.`);
            }

            embed.addFields(
                { name: "Ausgelöst von", value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
                { name: "Server", value: `\`${interaction.guild.name}\``, inline: true },
                { name: "Befehl", value: interaction.isCommand() ? `\`/${interaction.commandName}\`` : "`N/A`", inline: true },
            );
        } else {
            embed.addFields({ name: "Kontext", value: "`Globaler Prozess`", inline: true });
        }


        const location = this._parseStackForLocation(error);
        if (location) {
            embed.addFields(
                { name: "📍 Fehlerort", value: `\`\`\`ini\n[Datei]: ${location.fileName}\n[Zeile]: ${location.line}\`\`\`` },
                { name: "Pfad", value: `\`${location.filePath}\``}
            );
        }

        const stackTrace = error.stack || error.toString();
        embed.addFields(
            { name: "Fehlermeldung", value: `\`\`\`${error.message}\`\`\`` },
            { name: "Stack Trace", value: `\`\`\`js\n${stackTrace.substring(0, 1000)}\`\`\`` }
        );

        await logChannel.send({ content: contentToSend, embeds: [embed] });
    }
    /**
     * @param {string} errorMessage - Eine klare, für Entwickler verständliche Fehlermeldung.
     * @param {import('discord.js').Interaction} interaction - Die Interaktion, bei der der Fehler auftrat.
     * @param {string} type - Eine optionale, spezifische Art des Fehlers.
     */
    async handleCommand(errorMessage, interaction, type = 'Command Logic Error') {
        const error = new Error(errorMessage);
        await this.report(error, interaction, type);
    }

    /**
     * @param {string} errorMessage - Eine klare, für Entwickler verständliche Fehlermeldung.
     * @param {{guild?: import('discord.js').Guild, eventName?: string}} context - Optionale Kontext-Objekte aus dem Event (z.B. der Server).
     */
    async handleEvent(errorMessage, context = {}) {
        const error = new Error(errorMessage);
        const type = context.eventName ? `Event Logic Error: ${context.eventName}` : 'Event Logic Error';
        await this.report(error, null, type);
    }

    /**
     * @param {string} errorMessage - Eine klare, für Entwickler verständliche Fehlermeldung.
     * @param {string} type - Ein benutzerdefinierter Typ für den Fehler (z.B. "Service Initialization").
     * @param {string} [stack] - **Optional:** Der `error.stack` des ursprünglichen Fehlers.
     */
    async handleGeneric(errorMessage, type = 'Generic System Error', stack = null) {
        const error = new Error(errorMessage);
        if (stack) {
            error.stack = stack;
        }
        await this.report(error, null, type);
    }

    /**
     * Hauptmethode zur Behandlung eines Fehlers.
     * @param {Error} error - Das aufgetretene Fehlerobjekt.
     * @param {import('discord.js').Interaction | null} interaction - Die Interaktion, bei der der Fehler auftrat.
     * @param {string} type - Die Art des Fehlers (z.B. "Command Execution").
     */
    async report(error, interaction, type = "Unbekannter Fehler") {
        const errorId = this.generateErrorId();
        const context = {
            interaction,
            type,
        };

        logger.guardian('error', `Fehler erfasst [ID: ${errorId}] | Typ: ${type}:`, error);

        const location = this._parseStackForLocation(error);

        if (location) {
            logger.guardian('error', `📍 Fehlerort: ${location.fileName} (Zeile: ${location.line}) | Pfad: ${location.filePath}`);
        }

        await this._sendLogReport(error, errorId, context);

        if (interaction) {
            await this._sendUserReply(interaction, errorId);
        }
    }
}

module.exports = new Guardian();