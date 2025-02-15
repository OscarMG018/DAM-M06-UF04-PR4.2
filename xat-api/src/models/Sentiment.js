const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Prompt = require('./Prompt');

const Sentiment = sequelize.define('Sentiment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    text: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    sentiment: {
        type: DataTypes.ENUM('positive', 'negative', 'neutral'),
        allowNull: false
    },
    model: {
        type: DataTypes.STRING,
        allowNull: false
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

// Optional: If you want to associate sentiment analysis with a prompt
Sentiment.belongsTo(Prompt);
Prompt.hasOne(Sentiment);

module.exports = Sentiment; 