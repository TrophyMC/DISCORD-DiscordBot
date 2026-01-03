const { redisClient } = require('../database/redis');
const { REDIS } = require('../../config.json');
const Guardian = require('../services/Guardian');

class CacheNode {
    constructor({ name, model, fields, ttl = REDIS.TTL, defaults = {} }) {
        this.name = name;
        this.model = model;
        this.fields = fields;
        this.ttl = ttl || REDIS.TTL;
        this.activeTTL = REDIS.ACTIVE_TTL || 7200;
        this.inactiveThreshold = REDIS.INACTIVE_THRESHOLD || 1800;
        this.defaults = defaults;
        this.syncEvents = syncEvents;
        this.keyPrefix = `cache:${name}:`;
        this.lastAccessKey = `lastaccess:${name}:`;
    }

    _buildKey(userId) {
        return `${this.keyPrefix}${userId}`;
    }

    _buildLastAccessKey(userId) {
        return `${this.lastAccessKey}${userId}`;
    }

    async _markActive(userId) {
        if (!redisClient.isReady()) return;

        try {
            const client = redisClient.getClient();
            const lastAccessKey = this._buildLastAccessKey(userId);
            const now = Date.now();

            await client.set(lastAccessKey, now.toString(), 'EX', this.activeTTL);
        } catch (error) {

        }
    }

    async _isActive(userId) {
        if (!redisClient.isReady()) return false;

        try {
            const client = redisClient.getClient();
            const lastAccessKey = this._buildLastAccessKey(userId);
            const lastAccess = await client.get(lastAccessKey);

            if (!lastAccess) return false;

            const now = Date.now();
            const timeSinceAccess = (now - parseInt(lastAccess)) / 1000; // in Sekunden

            return timeSinceAccess < this.inactiveThreshold;
        } catch (error) {
            return false;
        }
    }

    async get(userId) {
        if (!redisClient.isReady()) {
            Guardian.handleGeneric('Redis ist nicht bereit', 'CacheNode Get');
            return null;
        }

        try {
            const client = redisClient.getClient();
            const key = this._buildKey(userId);
            const data = await client.hgetall(key);

            await this._markActive(userId);

            if (data && Object.keys(data).length > 0) {
                const parsed = {};
                for (const field of this.fields) {
                    if (data[field] !== undefined) {
                        parsed[field] = this._parseValue(data[field]);
                    }
                }

                const isActive = await this._isActive(userId);
                const newTTL = isActive ? this.activeTTL : this.ttl;
                await client.expire(key, newTTL);

                return parsed;
            }

            const dbRecord = await this.model.findOne({
                where: { discordId: userId }
            });

            if (dbRecord) {
                const dbData = {};
                for (const field of this.fields) {
                    dbData[field] = dbRecord[field];
                }
                await this.set(userId, dbData);
                return dbData;
            }

            const newData = { ...this.defaults };
            await this._createNewNode(userId, newData);
            return newData;

        } catch (error) {
            Guardian.handleGeneric(
                `Fehler beim Abrufen von Cache für User ${userId}`,
                'CacheNode Get',
                error.stack
            );
            return null;
        }
    }

    async _createNewNode(userId, data) {
        try {
            await this.model.create({
                discordId: userId,
                ...data
            });

            await this.set(userId, data);

        } catch (error) {
            if (error.name === 'SequelizeUniqueConstraintError') {
                const existing = await this.model.findOne({
                    where: { discordId: userId }
                });
                if (existing) {
                    const existingData = {};
                    for (const field of this.fields) {
                        existingData[field] = existing[field];
                    }
                    await this.set(userId, existingData);
                }
            } else {
                throw error;
            }
        }
    }

    async set(userId, data, expiresIn = null) {
        if (!redisClient.isReady()) {
            Guardian.handleGeneric('Redis ist nicht bereit', 'CacheNode Set');
            return false;
        }

        try {
            const client = redisClient.getClient();
            const key = this._buildKey(userId);

            await this._markActive(userId);

            const pipeline = client.pipeline();

            for (const field of this.fields) {
                if (data[field] !== undefined) {
                    pipeline.hset(key, field, data[field].toString());
                }
            }

            const isActive = await this._isActive(userId);
            const ttl = expiresIn !== null ? expiresIn : (isActive ? this.activeTTL : this.ttl);

            if (ttl > 0) {
                pipeline.expire(key, ttl);
            }

            await pipeline.exec();
            return true;
        } catch (error) {
            Guardian.handleGeneric(
                `Fehler beim Setzen von Cache für User ${userId}`,
                'CacheNode Set',
                error.stack
            );
            return false;
        }
    }

    async increment(userId, field, amount = 1) {
        if (!redisClient.isReady()) {
            Guardian.handleGeneric('Redis ist nicht bereit', 'CacheNode Increment');
            return false;
        }

        if (!this.fields.includes(field)) {
            Guardian.handleGeneric(
                `Feld '${field}' ist nicht in den CacheNode-Feldern definiert`,
                'CacheNode Increment'
            );
            return false;
        }

        try {
            const existingData = await this.get(userId);
            if (!existingData) {
                Guardian.handleGeneric(
                    `Node für User ${userId} konnte nicht erstellt werden`,
                    'CacheNode Increment'
                );
                return false;
            }

            const client = redisClient.getClient();
            const key = this._buildKey(userId);

            await this._markActive(userId);

            await client.hincrby(key, field, amount);

            await client.expire(key, this.activeTTL);

            return true;
        } catch (error) {
            Guardian.handleGeneric(
                `Fehler beim Inkrementieren von ${field} für User ${userId}`,
                'CacheNode Increment',
                error.stack
            );
            return false;
        }
    }

    async decrement(userId, field, amount = 1) {
        return await this.increment(userId, field, -amount);
    }

    async update(userId, field, value) {
        if (!redisClient.isReady()) {
            Guardian.handleGeneric('Redis ist nicht bereit', 'CacheNode Update');
            return false;
        }

        if (!this.fields.includes(field)) {
            Guardian.handleGeneric(
                `Feld '${field}' ist nicht in den CacheNode-Feldern definiert`,
                'CacheNode Update'
            );
            return false;
        }

        try {
            const existingData = await this.get(userId);
            if (!existingData) {
                return false;
            }

            const client = redisClient.getClient();
            const key = this._buildKey(userId);

            await this._markActive(userId);

            await client.hset(key, field, value.toString());
            await client.expire(key, this.activeTTL);

            return true;
        } catch (error) {
            Guardian.handleGeneric(
                `Fehler beim Update von ${field} für User ${userId}`,
                'CacheNode Update',
                error.stack
            );
            return false;
        }
    }

    async bulkUpdate(userId, updates) {
        if (!redisClient.isReady()) {
            Guardian.handleGeneric('Redis ist nicht bereit', 'CacheNode BulkUpdate');
            return false;
        }

        try {
            const existingData = await this.get(userId);
            if (!existingData) {
                return false;
            }

            const client = redisClient.getClient();
            const key = this._buildKey(userId);

            await this._markActive(userId);

            const pipeline = client.pipeline();

            for (const [field, value] of Object.entries(updates)) {
                if (this.fields.includes(field)) {
                    pipeline.hset(key, field, value.toString());
                }
            }

            pipeline.expire(key, this.activeTTL);
            await pipeline.exec();

            return true;
        } catch (error) {
            Guardian.handleGeneric(
                `Fehler beim Bulk-Update für User ${userId}`,
                'CacheNode BulkUpdate',
                error.stack
            );
            return false;
        }
    }

    async delete(userId) {
        if (!redisClient.isReady()) {
            return false;
        }

        try {
            const client = redisClient.getClient();
            const key = this._buildKey(userId);
            const lastAccessKey = this._buildLastAccessKey(userId);

            await client.del(key);
            await client.del(lastAccessKey);

            return true;
        } catch (error) {
            Guardian.handleGeneric(
                `Fehler beim Löschen von Cache für User ${userId}`,
                'CacheNode Delete',
                error.stack
            );
            return false;
        }
    }

    async syncToDatabase() {
        if (!redisClient.isReady()) {
            Guardian.handleGeneric('Redis ist nicht bereit für Sync', 'CacheNode Sync');
            return 0;
        }

        try {
            const client = redisClient.getClient();
            const pattern = `${this.keyPrefix}*`;
            const keys = await client.keys(pattern);

            if (keys.length === 0) {
                return 0;
            }

            let syncedCount = 0;
            let deletedCount = 0;

            for (const key of keys) {
                const userId = key.replace(this.keyPrefix, '');
                const cacheData = await client.hgetall(key);

                if (!cacheData || Object.keys(cacheData).length === 0) {
                    continue;
                }

                const parsed = {};
                for (const field of this.fields) {
                    if (cacheData[field] !== undefined) {
                        parsed[field] = this._parseValue(cacheData[field]);
                    }
                }

                const dbRecord = await this.model.findOne({
                    where: { discordId: userId }
                });

                if (!dbRecord) {
                    await this.model.create({
                        discordId: userId,
                        ...parsed
                    });
                } else {
                    const updates = {};
                    for (const field of this.fields) {
                        if (parsed[field] !== undefined) {
                            updates[field] = parsed[field];
                        }
                    }
                    await dbRecord.update(updates);
                }

                const isActive = await this._isActive(userId);

                if (!isActive) {
                    await client.del(key);
                    await client.del(this._buildLastAccessKey(userId));
                    deletedCount++;
                } else {
                    await client.expire(key, this.activeTTL);
                }

                syncedCount++;
            }

            if (deletedCount > 0) {
                Guardian.handleGeneric(
                    `${deletedCount} inaktive User aus Redis entfernt (von ${syncedCount} gesamt)`,
                    'CacheNode Sync'
                );
            }

            return syncedCount;
        } catch (error) {
            Guardian.handleGeneric(
                `Fehler beim Sync zur Datenbank für CacheNode '${this.name}'`,
                'CacheNode Sync',
                error.stack
            );
            return 0;
        }
    }

    _parseValue(value) {
        const num = parseInt(value, 10);
        return isNaN(num) ? value : num;
    }

    async getAllKeys() {
        if (!redisClient.isReady()) {
            return [];
        }

        try {
            const client = redisClient.getClient();
            const pattern = `${this.keyPrefix}*`;
            return await client.keys(pattern);
        } catch (error) {
            Guardian.handleGeneric(
                'Fehler beim Abrufen aller Keys',
                'CacheNode GetAllKeys',
                error.stack
            );
            return [];
        }
    }

    async handleSyncEvent(type, data) {
        if (!this.syncEvents.includes(type)) return;
        const identifier = data.discordId || data.uuid;

        if (!identifier) {
            return Guardian.handleGeneric(`SyncEvent ${type} ohne Identifier erhalten`, `CacheNode:${this.name}`);
        }

        try {
            const updateData = {};
            for (const field of this.fields) {
                if (data[field] !== undefined) {
                    updateData[field] = data[field];
                }
            }

            await this.set(identifier, updateData);

            console.log(`[CacheSync] Node '${this.name}' aktualisiert durch Event '${type}' für ${identifier}`);
        } catch (error) {
            Guardian.handleGeneric(`Fehler beim Verarbeiten von SyncEvent ${type}`, `CacheNode:${this.name}`, error.stack);
        }
    }
}

module.exports = CacheNode;