class Event {
    constructor(client, name, once = false) {
        this.client = client;
        this.name = name;
        this.once = once;
    }

    async execute(...args) {
        throw new Error(`Event ${this.name} muss execute() implementieren!`);
    }
}

module.exports = Event;