const {Client, Collection, GatewayIntentBits, REST, Routes} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { BOT } = require("../../config.json")
const logger = require("../utils/logger");
const ConfigService = require("../services/ConfigService");
const MessageService = require("../services/MessageService");
const MediaService = require("../services/MediaService");
const EmojiService = require("../services/EmojiService");
const Guardian = require("../services/Guardian");
const ModelService = require("../services/ModelService");
const CacheService = require("../services/CacheService");
const BridgeService = require("../services/BridgeService");

class BotClient extends Client {
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildMessageReactions,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildEmojisAndStickers,
                GatewayIntentBits.GuildIntegrations,
                GatewayIntentBits.GuildScheduledEvents,
                GatewayIntentBits.GuildWebhooks,
                GatewayIntentBits.GuildInvites,
                GatewayIntentBits.GuildModeration,
                GatewayIntentBits.GuildMessageTyping,
                GatewayIntentBits.GuildScheduledEvents,
                GatewayIntentBits.DirectMessages,
            ],
        });

        this.commands = new Collection();
    }

    async loadAndRegisterCommands() {
        const commandsPath = path.join(__dirname, "../commands");
        const commandFiles = this.getAllFiles(commandsPath);
        const commandArray = [];
        let count = 0;

        for (const file of commandFiles) {
            try {
                const CommandClass = require(file);
                const command = new CommandClass();
                this.commands.set(command.name, command);
                if (command.data) {
                    commandArray.push(command.data.toJSON());
                }
                count++;
            } catch (error) {
                Guardian.handleGeneric(`Fehler beim Laden des Befehls in Datei: ${path.basename(file)}`, 'Command Loading', error.stack);
            }
        }

        if (!BOT || !BOT.CLIENT_ID || !BOT.TOKEN) {
            await Guardian.handleGeneric("CLIENT_ID oder TOKEN fehlt in der config.json. Der Bot kann nicht starten.", "Bot Initialization");
            process.exit(1);
        }

        const rest = new REST({version: "10"}).setToken(BOT.TOKEN);

        await rest.put(Routes.applicationCommands(BOT.CLIENT_ID), { body: commandArray })
            .then(() => logger.info(`🚀  ${count} Commands geladen`))
            .catch(err => {
                Guardian.handleGeneric(`Fehler beim Registrieren der Slash Commands bei Discord. Grund`, "Discord API Error", err.stack);
            });
    }

    async loadEvents() {
        const eventsPath = path.join(__dirname, "../events");
        const eventFolders = fs.readdirSync(eventsPath);
        let count = 0;

        for (const folder of eventFolders) {
            const folderPath = path.join(eventsPath, folder);
            const eventFiles = this.getAllFiles(folderPath);

            for (const file of eventFiles) {
                try {
                    const EventClass = require(file);
                    const event = new EventClass(this);
                    if (event.once) {
                        this.once(event.name, (...args) => event.execute(...args));
                    } else {
                        this.on(event.name, (...args) => event.execute(...args));
                    }
                    count++;
                } catch (error) {
                    Guardian.handleGeneric(`Fehler beim Laden des Events in Datei: ${path.basename(file)}`, 'Event Loading', error.stack);
                }
            }
        }
        logger.info(`🚀  ${count} Events geladen`);
    }

    async loadCacheNodes() {
        const cachePath = path.join(__dirname, '../cache');

        if (!fs.existsSync(cachePath)) {
            logger.warn('⚠️  Cache-Verzeichnis existiert nicht. Erstelle es...');
            fs.mkdirSync(cachePath, { recursive: true });
            return 0;
        }

        const cacheFiles = this.getAllFiles(cachePath).filter(file => file.endsWith('.js'));
        let count = 0;

        for (const file of cacheFiles) {
            try {
                require(file);
                count++;
            } catch (error) {
                Guardian.handleGeneric(
                    `Fehler beim Laden der CacheNode-Datei: ${path.basename(file)}`,
                    'CacheNode Loading',
                    error.stack
                );
            }
        }

        return count;
    }

    getAllFiles(dir) {
        try {
            const files = fs.readdirSync(dir, { withFileTypes: true });
            let allFiles = [];
            for (const file of files) {
                const filePath = path.join(dir, file.name);
                if (file.isDirectory()) {
                    allFiles = [...allFiles, ...this.getAllFiles(filePath)];
                } else if (file.name.endsWith(".js")) {
                    allFiles.push(filePath);
                }
            }
            return allFiles;
        } catch (error) {
            Guardian.handleGeneric(`Fehler beim Lesen des Verzeichnisses: ${dir}`, "File System Error", error.stack);
            return [];
        }
    }

    async start(token) {
        logger.mtvBanner();
        Guardian.initialize(this);

        try {
            await ModelService.initialize();
            await CacheService.initialize();
            await BridgeService.initialize(this);

            const cacheNodeCount = await this.loadCacheNodes();

            await this.loadAndRegisterCommands();
            await this.loadEvents();

            logger.info(`⚙️  ${ConfigService.getConfigCount()} Konfigurationen geladen`);
            logger.info(`💬  ${MessageService.getMessageCount()} Nachrichtendateien geladen`);
            logger.info(`🖼️ ${MediaService.getMediaCount()} Mediendateien geladen`);
            logger.info(`😃  ${EmojiService.getEmojiCount()} Emojis geladen`);
            logger.info(`📊  ${ModelService.getModelCount()} Datenbankmodelle geladen`);
            logger.info(`📦  ${cacheNodeCount} CacheNodes geladen`);
            logger.info(`🔄  ${CacheService.getCacheNodeCount()} CacheNodes registriert`);

            await this.login(token);

            process.on('SIGINT', async () => {
                logger.warn('🛑  SIGINT empfangen, fahre Bot herunter...');
                await this.gracefulShutdown();
            });

            process.on('SIGTERM', async () => {
                logger.warn('🛑  SIGTERM empfangen, fahre Bot herunter...');
                await this.gracefulShutdown();
            });

        } catch (error) {
            await Guardian.handleGeneric(`Ein kritischer Fehler ist während des Bot-Starts aufgetreten: ${error.message}`, "Critical Startup Error");
        }
    }

    async gracefulShutdown() {
        try {
            logger.info('🔄  Synchronisiere Cache zur Datenbank...');
            await CacheService.shutdown();

            logger.info('👋  Trenne Discord-Verbindung...');
            this.destroy();

            logger.session('end');
            process.exit(0);
        } catch (error) {
            Guardian.handleGeneric('Fehler beim Herunterfahren', 'Shutdown', error.stack);
            process.exit(1);
        }
    }
}

module.exports = BotClient;