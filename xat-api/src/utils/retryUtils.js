/**
 * Utilitats per a reintents d'operacions
 * Aquest fitxer proporciona funcions genèriques per a la gestió de reintents
 */

const { logger } = require('../config/logger');

/**
 * Constants de configuració per als reintents
 */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 5000;

/**
 * Executa una funció amb reintents en cas d'error
 * Utilitza backoff exponencial per augmentar el temps d'espera entre reintents
 * 
 * @param {Function} operation - Funció a executar
 * @param {Object} options - Opcions de configuració
 * @param {number} options.maxRetries - Nombre màxim de reintents (per defecte: 3)
 * @param {number} options.baseDelay - Retard base en ms (per defecte: 500)
 * @param {number} options.maxDelay - Retard màxim en ms (per defecte: 5000)
 * @param {Function} options.shouldRetry - Funció que determina si s'ha de reintentar (per defecte: sempre per errors)
 * @param {string} options.operationName - Nom de l'operació per a logs
 * @returns {Promise<any>} Resultat de l'operació
 */
async function withRetry(
    operation,
    {
        maxRetries = DEFAULT_MAX_RETRIES,
        baseDelay = DEFAULT_BASE_DELAY_MS,
        maxDelay = DEFAULT_MAX_DELAY_MS,
        shouldRetry = () => true,
        operationName = 'Operació'
    } = {}
) {
    let lastError;
    let attempt = 0;

    while (attempt <= maxRetries) {
        try {
            if (attempt > 0) {
                logger.debug(`Reintentant ${operationName} (intent ${attempt}/${maxRetries})`, {
                    operationName,
                    attempt,
                    maxRetries
                });
            }

            return await operation();
        } catch (error) {
            lastError = error;
            attempt++;

            // Comprovar si hem de reintentar
            if (attempt > maxRetries || !shouldRetry(error)) {
                logger.debug(`No es reintenta ${operationName}`, {
                    operationName,
                    attempt,
                    maxRetries,
                    shouldRetry: shouldRetry(error),
                    error: error.message
                });
                break;
            }

            // Calcular retard amb backoff exponencial
            const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
            
            // Afegir jitter (variació aleatòria) per evitar sincronització de reintents
            const jitter = Math.random() * 0.3 * delay;
            const delayWithJitter = Math.floor(delay + jitter);

            logger.debug(`Esperant abans de reintentar ${operationName}`, {
                operationName,
                attempt,
                delay: delayWithJitter,
                error: error.message
            });

            // Esperar abans de reintentar
            await new Promise(resolve => setTimeout(resolve, delayWithJitter));
        }
    }

    // Si arribem aquí és que hem esgotat els reintents o no s'ha de reintentar
    logger.warn(`${operationName} ha fallat després de ${attempt} intents`, {
        operationName,
        attempts: attempt,
        maxRetries,
        error: lastError.message
    });

    throw lastError;
}

/**
 * Funcions predefinides per determinar si s'ha de reintentar segons el tipus d'error
 */
const retryConditions = {
    /**
     * Reintenta per errors de connexió a la base de dades
     */
    databaseConnection: (error) => {
        return (
            error.name === 'SequelizeConnectionError' ||
            error.name === 'SequelizeConnectionRefusedError' ||
            error.name === 'SequelizeHostNotFoundError' ||
            error.name === 'SequelizeHostNotReachableError' ||
            error.name === 'SequelizeInvalidConnectionError' ||
            error.name === 'SequelizeConnectionTimedOutError' ||
            error.message.includes('Connection lost') ||
            error.message.includes('Connection terminated') ||
            error.message.includes('Connection timed out')
        );
    },

    /**
     * Reintenta per errors de timeout o transacció
     */
    transactionTimeout: (error) => {
        return (
            error.name === 'SequelizeTimeoutError' ||
            error.name === 'TimeoutError' ||
            error.message.includes('Deadlock') ||
            error.message.includes('Lock wait timeout') ||
            error.message.includes('Too many connections')
        );
    },

    /**
     * Reintenta per qualsevol error excepte errors de validació o clau única
     */
    nonValidationError: (error) => {
        return (
            error.name !== 'SequelizeValidationError' &&
            error.name !== 'SequelizeUniqueConstraintError' &&
            error.name !== 'SequelizeForeignKeyConstraintError'
        );
    },

    /**
     * Reintenta per errors de xarxa (per API externes)
     */
    networkError: (error) => {
        return (
            error.code === 'ECONNREFUSED' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNRESET' ||
            error.code === 'ESOCKETTIMEDOUT' ||
            error.message.includes('socket hang up') ||
            error.message.includes('network')
        );
    }
};

module.exports = {
    withRetry,
    retryConditions
}; 