const { DATABASE } = require("../../config.json")
const { Sequelize } = require("sequelize")
const logger = require("../utils/logger")

const sequelize = new Sequelize(
    DATABASE.DB_NAME,
    DATABASE.USER,
    DATABASE.PASSWORD,
    {
        host: DATABASE.HOST,
        port: DATABASE.PORT,
        dialect: 'mariadb',
        logging: false,
        dialectOptions: {
            collation: 'utf8mb4_general_ci'
        }
    }
)

async function connectDB() {
    try {
        await sequelize.authenticate();
        logger.info('✅  Database Connection successfully');
    } catch (error) {
        logger.error('❌ Unable to connect to the database:', error);
        process.exit(1);
    }
}

module.exports = { sequelize, connectDB };