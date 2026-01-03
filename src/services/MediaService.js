const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const Guardian = require('./Guardian');

class MediaService {
    constructor() {
        this.media = new Map();
        this._loadMedia();
    }

    _loadMediaRecursive(dirPath) {
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            const mediaPath = path.join(__dirname, '..', 'images');

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    this._loadMediaRecursive(fullPath);
                } else {
                    const key = path.relative(mediaPath, fullPath).replace(/\\/g, '/');
                    this.media.set(key, fullPath);
                }
            }
        } catch (error) {
            Guardian.handleGeneric(`Fehler beim rekursiven Laden von Medien im Pfad ${dirPath}.`, 'MediaService Load', error.stack);
        }
    }

    _loadMedia() {
        const mediaPath = path.join(__dirname, '..', 'images');
        if (!fs.existsSync(mediaPath)) {
            return Guardian.handleGeneric(`Das Medienverzeichnis (${mediaPath}) existiert nicht.`, 'MediaService Init');
        }
        this._loadMediaRecursive(mediaPath);
    }

    get(key) {
        if (!this.media.has(key)) {
            Guardian.handleGeneric(`Die Mediendatei mit dem Key '${key}' wurde nicht gefunden.`, 'MediaService Get');
            return null;
        }
        return this.media.get(key);
    }

    getAttachment(key, options = {}) {
        const filePath = this.get(key);
        if (!filePath) {
            return null;
        }
        try {
            return new AttachmentBuilder(filePath, { name: path.basename(key), ...options });
        } catch(error) {
            Guardian.handleGeneric(`Fehler beim Erstellen des Attachments für '${key}'.`, 'MediaService Attachment', error.stack);
            return null;
        }
    }

    getAttachmentURL(key) {
        if (!this.media.has(key)) {
            Guardian.handleGeneric(`Die Mediendatei mit dem Key '${key}' für eine URL wurde nicht gefunden.`, 'MediaService GetURL');
            return null;
        }
        const fileName = path.basename(key);
        return `attachment://${fileName}`;
    }

    getMediaCount() {
        return this.media.size;
    }
}

module.exports = new MediaService();