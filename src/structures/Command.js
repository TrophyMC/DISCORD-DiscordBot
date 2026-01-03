class Command {
    constructor({name, description}) {
        this.name = name;
        this.description = description;
    }

    async execute(interaction) {
        throw new Error(`Command ${this.name} muss execute() implementieren!`);
    }
}

module.exports = Command;