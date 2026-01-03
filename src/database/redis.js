const Redis = require('ioredis');
const { REDIS } = require("../../config.json");
const logger = require('../utils/logger');
const Guardian = require("../services/Guardian");

class RedisClient {
    constructor() {
        this.client = null;
        this.subClient = null; // Neuer Client für Pub/Sub
        this.isConnected = false;
    }

    async connect() {
        const redisConfig = {
            host: REDIS.HOST,
            port: REDIS.PORT,
            username: REDIS.USER,
            password: REDIS.PASSWORD,
            db: REDIS.DB,
            retryStrategy: (times) => Math.min(times * 50, 2000),
            lazyConnect: true
        };

        try {
            this.client = new Redis(redisConfig);
            this.subClient = new Redis(redisConfig); // Zweite Instanz für Subscriptions

            this.client.on('connect', () => {
                this.isConnected = true;
                logger.info('✅  Redis Main Connection established');
            });

            await Promise.all([this.client.connect(), this.subClient.connect()]);
        } catch (error) {
            Guardian.handleGeneric('Failed to initialize Redis clients', 'Redis Init', error.stack);
            throw error;
        }
    }

    // Methode zum Senden von Paketen an Minecraft
    publish(channel, type, data) {
        if (!this.isConnected) return;
        const packet = JSON.stringify({ type, data });
        this.client.publish(channel, packet);
    }

    // Methode zum Abonnieren des Channels
    async subscribe(channel, callback) {
        await this.subClient.subscribe(channel);
        this.subClient.on('message', (chan, message) => {
            if (chan === channel) {
                try {
                    const parsed = JSON.parse(message);
                    callback(parsed);
                } catch (e) {
                    logger.error("Fehler beim Parsen der Redis-Nachricht");
                }
            }
        });
    }

    getClient() { return this.client; }
    isReady() { return this.isConnected; }
}

const redisClient = new RedisClient();
module.exports = { redisClient };