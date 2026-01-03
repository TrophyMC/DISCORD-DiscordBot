class SyncListener {
    constructor(type) {
        this.type = type;
    }

    async execute(client, data) {
        throw new Error(`Execute-Methode für SyncListener ${this.type} nicht implementiert!`);
    }
}

module.exports = SyncListener;