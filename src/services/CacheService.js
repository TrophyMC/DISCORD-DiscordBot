const { redisClient } = require('../database/redis');
const { REDIS } = require('../../config.json');
const Guardian = require('./Guardian');
const logger = require('../utils/logger');

class CacheService {
    constructor() {
        this.cacheNodes = new Map();
        this.syncInterval = null;
        this.syncIntervalTime = REDIS.SYNC_INTERVAL || 300000;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) {
            return Guardian.handleGeneric('CacheService wurde bereits initialisiert.', 'CacheService Init');
        }

        try {
            await redisClient.connect();
            this._startSyncInterval();
            this.isInitialized = true;
            logger.info('✅  CacheService initialisiert');
        } catch (error) {
            Guardian.handleGeneric('Fehler bei der Initialisierung des CacheService', 'CacheService Init', error.stack);
            throw error;
        }
    }

    registerCacheNode(cacheNode) {
        if (this.cacheNodes.has(cacheNode.name)) {
            return Guardian.handleGeneric(
                `CacheNode mit dem Namen '${cacheNode.name}' ist bereits registriert.`,
                'CacheService Register'
            );
        }

        this.cacheNodes.set(cacheNode.name, cacheNode);
        logger.debug(`📦  CacheNode '${cacheNode.name}' registriert`);
    }

    getCacheNode(name) {
        const node = this.cacheNodes.get(name);
        if (!node) {
            Guardian.handleGeneric(
                `CacheNode mit dem Namen '${name}' wurde nicht gefunden.`,
                'CacheService Get'
            );
            return null;
        }
        return node;
    }

    _startSyncInterval() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        this.syncInterval = setInterval(async () => {
            await this.syncAllToDatabase();
        }, this.syncIntervalTime);

        logger.info(`⏰  Cache-Sync-Interval gestartet (${this.syncIntervalTime / 1000}s)`);
    }

    async syncAllToDatabase() {
        logger.info('🔄  Starte Cache-Sync zur Datenbank...');
        let successCount = 0;
        let errorCount = 0;

        for (const [name, node] of this.cacheNodes) {
            try {
                const synced = await node.syncToDatabase();
                successCount += synced;
                logger.debug(`   ✓ ${name}: ${synced} Einträge synchronisiert`);
            } catch (error) {
                errorCount++;
                Guardian.handleGeneric(
                    `Fehler beim Sync von CacheNode '${name}'`,
                    'CacheService Sync',
                    error.stack
                );
            }
        }

        logger.info(`✅  Cache-Sync abgeschlossen: ${successCount} erfolgreich, ${errorCount} Fehler`);
    }

    async shutdown() {
        logger.info('🛑  CacheService wird heruntergefahren...');

        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        await this.syncAllToDatabase();
        await redisClient.disconnect();

        this.isInitialized = false;
        logger.info('✅  CacheService heruntergefahren');
    }

    getCacheNodeCount() {
        return this.cacheNodes.size;
    }

    isReady() {
        return this.isInitialized && redisClient.isReady();
    }
}

module.exports = new CacheService();