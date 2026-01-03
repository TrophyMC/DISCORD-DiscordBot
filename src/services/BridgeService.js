const { redisClient } = require('../database/redis');
const { REDIS } = require("../../config.json");
const CacheService = require('./CacheService');
const path = require('path');
const fs = require('fs');

class BridgeService {
    constructor() {
        this.channel = REDIS.BRIDGE_CHANNEL;
        this.listeners = new Map();
    }

    async initialize(client) {
        this.loadListeners();

        await redisClient.subscribe(this.channel, (packet) => {
            const { type, data } = packet;

            CacheService.cacheNodes.forEach(node => node.handleSyncEvent(type, data));

            const listener = this.listeners.get(type);
            if (listener) {
                listener.execute(client, data);
            }
        });
    }

    loadListeners() {
        const listenersPath = path.join(__dirname, '../sync');
        if (!fs.existsSync(listenersPath)) return;

        const files = fs.readdirSync(listenersPath).filter(f => f.endsWith('.js'));
        for (const file of files) {
            const ListenerClass = require(path.join(listenersPath, file));
            const listener = new ListenerClass();
            this.listeners.set(listener.type, listener);
        }
    }

    sendToMinecraft(type, data) {
        redisClient.publish(this.channel, type, data);
    }
}

module.exports = new BridgeService();