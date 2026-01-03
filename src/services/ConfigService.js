const fs = require('fs');
const path = require('path');
const Guardian = require('./Guardian');

class ConfigService {
    constructor() {
        this.configs = new Map();
        this._loadConfigs();
    }

    _loadConfigs() {
        const configPath = path.join(__dirname, '..', 'config');

        if (!fs.existsSync(configPath)) {
            return Guardian.handleGeneric(`Das Konfigurationsverzeichnis (${configPath}) existiert nicht.`, 'ConfigService Init');
        }

        const configFiles = fs.readdirSync(configPath).filter(file => file.endsWith('.json'));

        for (const file of configFiles) {
            try {
                const filePath = path.join(configPath, file);
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const configData = JSON.parse(fileContent);
                const configName = path.basename(file, '.json');

                if (this._validateConfig(configData, file)) {
                    this.configs.set(configName, configData);
                }
            } catch (error) {
                Guardian.handleGeneric(`Fehler beim Laden der Konfigurationsdatei ${file}.`, 'ConfigService Load', error.stack);
            }
        }
    }

    _validateConfig(data, fileName) {
        if (!Array.isArray(data)) {
            Guardian.handleGeneric(`Die Konfiguration in ${fileName} ist kein Array.`, 'ConfigService Validation');
            return false;
        }

        for (const item of data) {
            if (typeof item.pagination !== 'boolean' && typeof item.panigation !== 'boolean') {
                Guardian.handleGeneric(`In ${fileName} fehlt das 'pagination' Feld oder es ist kein Boolean.`, 'ConfigService Validation');
                return false;
            }
        }

        return true;
    }

    get(key) {
        if (!this.configs.has(key)) {
            Guardian.handleGeneric(`Die Konfiguration mit dem Key '${key}' wurde nicht gefunden.`, 'ConfigService Get');
            return null;
        }
        return this.configs.get(key);
    }

    getConfigCount() {
        return this.configs.size;
    }
}

module.exports = new ConfigService();