/**
 * Configuració principal del servidor Express
 * Aquest fitxer inicialitza tots els components necessaris per l'API
 */

// Carregar variables d'entorn
const dotenv = require('dotenv');
dotenv.config();

// Importacions principals
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./src/config/swagger');
const { sequelize } = require('./src/config/database');
const errorHandler = require('./src/middleware/errorHandler');
const chatRoutes = require('./src/routes/chatRoutes');
const { logger, expressLogger } = require('./src/config/logger');
const { withRetry, retryConditions } = require('./src/utils/retryUtils');

// Crear instància d'Express
const app = express();

/**
 * Configuració dels middlewares principals
 * - CORS per permetre peticions des d'altres dominis
 * - Parser de JSON per processar el cos de les peticions
 */
app.use(cors());
app.use(express.json());

// Configuració de Swagger per la documentació de l'API
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

/**
 * Middleware de logging personalitzat
 * Registra totes les peticions HTTP amb timestamp
 */
app.use((req, res, next) => {
    logger.info('Petició HTTP rebuda', {
        method: req.method,
        url: req.url,
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    next();
});

// Configuració del logger d'Express per més detalls
app.use(expressLogger);

// Registre de les rutes principals
app.use('/api/chat', chatRoutes);

// Gestió centralitzada d'errors
app.use(errorHandler);

// Port per defecte 3000 si no està definit a les variables d'entorn
const PORT = process.env.PORT || 3000;
const MAX_DB_RETRIES = 5;
const DB_RETRY_BASE_DELAY = 2000;

/**
 * Funció per verificar connexió amb Ollama
 * @returns {Promise<boolean>} Cert si Ollama està disponible
 */
async function checkOllamaConnection() {
    const axios = require('axios');
    const OLLAMA_API_URL = process.env.CHAT_API_OLLAMA_URL || 'http://localhost:11434/api';
    
    try {
        logger.info('Verificant connexió amb Ollama');
        await axios.get(`${OLLAMA_API_URL}/tags`, { timeout: 5000 });
        logger.info('Connexió amb Ollama establerta correctament');
        return true;
    } catch (error) {
        logger.error('No es pot connectar amb Ollama', {
            error: error.message,
            url: `${OLLAMA_API_URL}/tags`
        });

        if (error.code === 'ECONNREFUSED') {
            logger.error('Ollama no està en funcionament o no és accessible. Verifiqueu que el servei Ollama està iniciat i escolta al port correcte.');
        } else if (error.code === 'ENOTFOUND') {
            logger.error('No es pot resoldre el host d\'Ollama. Verifiqueu la URL configurada a CHAT_API_OLLAMA_URL.');
        }
        
        return false;
    }
}

/**
 * Funció per verificar connexió amb la base de dades
 * @returns {Promise<boolean>} Cert si la base de dades està disponible
 */
async function checkDatabaseConnection() {
    try {
        await withRetry(
            async () => {
                await sequelize.authenticate();
            },
            {
                maxRetries: MAX_DB_RETRIES,
                baseDelay: DB_RETRY_BASE_DELAY,
                shouldRetry: retryConditions.databaseConnection,
                operationName: 'Connexió amb la base de dades'
            }
        );
        
        logger.info('Base de dades connectada correctament', {
            host: process.env.MYSQL_HOST,
            database: process.env.MYSQL_DATABASE,
            port: process.env.MYSQL_PORT
        });
        return true;
    } catch (error) {
        logger.error('Error fatal en connectar amb la base de dades', {
            error: error.message,
            host: process.env.MYSQL_HOST,
            database: process.env.MYSQL_DATABASE,
            port: process.env.MYSQL_PORT
        });
        
        // Proporcionar consells específics segons el tipus d'error
        if (error.original?.code === 'ECONNREFUSED') {
            logger.error('La base de dades no està accessible. Verifiqueu que el servidor MySQL està en funcionament i escolta al port configurat.');
        } else if (error.original?.code === 'ER_ACCESS_DENIED_ERROR') {
            logger.error('Error d\'autenticació. Verifiqueu les credencials (MYSQL_USER i MYSQL_PASSWORD).');
        } else if (error.original?.code === 'ER_BAD_DB_ERROR') {
            logger.error(`La base de dades ${process.env.MYSQL_DATABASE} no existeix. Creeu-la abans d'iniciar l'aplicació.`);
        }
        
        return false;
    }
}

/**
 * Funció d'inicialització del servidor
 * - Connecta amb la base de dades
 * - Sincronitza els models
 * - Inicia el servidor HTTP
 */
async function startServer() {
    try {
        // Verificar connexió amb la base de dades
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
            logger.error('No s\'ha pogut establir connexió amb la base de dades. L\'aplicació s\'iniciarà amb funcionalitat limitada.');
            // No abortem l'aplicació, però algunes parts no funcionaran correctament
        } else {
            // Sincronitzar models amb la base de dades
            try {
                await sequelize.sync({
                    // No fa res si la taula ja existeix
                    force: false,  // Valor per defecte, segur per producció
                });

                logger.info('Models sincronitzats correctament', {
                    timestamp: new Date().toISOString()
                });
            } catch (syncError) {
                logger.error('Error en sincronitzar models amb la base de dades', {
                    error: syncError.message,
                    stack: syncError.stack
                });
                logger.warn('L\'aplicació s\'iniciarà, però podria tenir problemes amb la persistència de dades');
            }
        }
        
        // Verificar connexió amb Ollama (opcional, no impedeix l'inici)
        const ollamaConnected = await checkOllamaConnection();
        if (!ollamaConnected) {
            logger.warn('No s\'ha pogut establir connexió amb Ollama. Les funcionalitats de chat i generació de text no estaran disponibles.');
            // No abortem l'aplicació, però algunes rutes no funcionaran correctament
        }
        
        // Iniciar el servidor HTTP
        app.listen(PORT, () => {
            logger.info('Servidor iniciat correctament', {
                port: PORT,
                mode: process.env.NODE_ENV,
                docs: `http://127.0.0.1:${PORT}/api-docs`,
                db_connected: dbConnected,
                ollama_connected: ollamaConnected
            });
            
            // Mostrar advertències si alguns serveis no estan disponibles
            if (!dbConnected || !ollamaConnected) {
                logger.warn('Servidor iniciat amb funcionalitat limitada', {
                    db_available: dbConnected,
                    ollama_available: ollamaConnected,
                    timestamp: new Date().toISOString()
                });
            }
        });
    } catch (error) {
        logger.error('Error fatal en iniciar el servidor', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        process.exit(1);
    }
}

/**
 * Gestió d'errors no controlats
 * Registra l'error i tanca l'aplicació de forma segura
 */
process.on('unhandledRejection', (error) => {
    logger.error('Error no controlat detectat', {
        error: error.message,
        stack: error.stack,
        type: 'UnhandledRejection',
        timestamp: new Date().toISOString()
    });
    // No tanquem immediatament per permetre finalitzar les peticions en curs
    setTimeout(() => {
        process.exit(1);
    }, 3000);
});

// Gestió del senyal SIGTERM per tancament graciós
process.on('SIGTERM', () => {
    logger.info('Senyal SIGTERM rebut. Tancant el servidor...');
    // Tancar connexions obertes si cal
    sequelize.close().then(() => {
        logger.info('Connexions de base de dades tancades correctament');
        process.exit(0);
    }).catch(err => {
        logger.error('Error en tancar connexions de base de dades', {
            error: err.message
        });
        process.exit(1);
    });
});

// Gestió del senyal SIGINT (Ctrl+C)
process.on('SIGINT', () => {
    logger.info('Senyal SIGINT rebut. Tancant el servidor...');
    // Tancar connexions obertes si cal
    sequelize.close().then(() => {
        logger.info('Connexions de base de dades tancades correctament');
        process.exit(0);
    }).catch(err => {
        logger.error('Error en tancar connexions de base de dades', {
            error: err.message
        });
        process.exit(1);
    });
});

// Iniciar el servidor
startServer();

// Exportar l'app per tests
module.exports = app;