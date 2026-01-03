const fs = require('fs');
const path = require('path');
const Guardian = require('./Guardian');

class MessageService {
    constructor() {
        this.messages = new Map();
        this._loadMessages();
    }

    _loadMessages() {
        const messagesPath = path.join(__dirname, '..', 'messages');
        if (!fs.existsSync(messagesPath)) {
            return Guardian.handleGeneric(`Das Nachrichtenverzeichnis (${messagesPath}) existiert nicht.`, 'MessageService Init');
        }

        const messageFiles = fs.readdirSync(messagesPath).filter(file => file.endsWith('.json'));
        for (const file of messageFiles) {
            try {
                const filePath = path.join(messagesPath, file);
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const messageData = JSON.parse(fileContent);
                const messageName = path.basename(file, '.json');
                this.messages.set(messageName, messageData);
            } catch (error) {
                Guardian.handleGeneric(`Fehler beim Laden der Nachrichtendatei ${file}.`, 'MessageService Load', error.stack);
            }
        }
    }

    get(key, replacements = {}) {
        const [fileName, ...path] = key.split('.');
        let message = this.messages.get(fileName);

        if (!message) {
            Guardian.handleGeneric(`Nachrichtendatei mit dem Key '${fileName}' wurde nicht gefunden.`, 'MessageService Get');
            return `[Fehler: Nachrichtendatei '${fileName}' nicht gefunden]`;
        }

        for (const part of path) {
            if (message && typeof message === 'object' && part in message) {
                message = message[part];
            } else {
                Guardian.handleGeneric(`Nachrichtenschlüssel '${key}' wurde nicht gefunden.`, 'MessageService Get');
                return `[Fehler: Schlüssel '${key}' nicht gefunden]`;
            }
        }

        if (Array.isArray(message)) {
            message = message.join('\n');
        }

        if (typeof message === 'string') {
            for (const placeholder in replacements) {
                message = message.replace(`{${placeholder}}`, replacements[placeholder]);
            }
        }

        return message;
    }

    getMessageCount() {
        return this.messages.size;
    }
}

module.exports = new MessageService();