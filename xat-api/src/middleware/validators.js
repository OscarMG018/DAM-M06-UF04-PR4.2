/**
 * Utilitats i middlewares de validació
 * Aquest fitxer proporciona funcions per validar dades d'entrada
 */

const { logger } = require('../config/logger');

/**
 * Valida si un string és un UUID vàlid
 * 
 * @param {string} str - String a validar
 * @returns {boolean} - Cert si és un UUID vàlid
 */
function validateUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!str || typeof str !== 'string') {
        return false;
    }
    return uuidRegex.test(str);
}

/**
 * Middleware per validar paràmetres de ruta
 * 
 * @param {Object} schema - Esquema de validació
 * @returns {Function} - Middleware de validació
 */
function validateParams(schema) {
    return (req, res, next) => {
        const { error } = schema.validate(req.params);
        if (error) {
            logger.warn('Error de validació de paràmetres', {
                path: req.path,
                params: req.params,
                error: error.message
            });
            return res.status(400).json({
                message: 'Els paràmetres de la petició no són vàlids',
                errors: error.details.map(detail => ({
                    field: detail.context.key,
                    message: detail.message.replace(/"/g, ''),
                    value: detail.context.value
                }))
            });
        }
        next();
    };
}

/**
 * Middleware per validar cos de petició
 * 
 * @param {Object} schema - Esquema de validació
 * @returns {Function} - Middleware de validació
 */
function validateBody(schema) {
    return (req, res, next) => {
        const { error } = schema.validate(req.body, { abortEarly: false });
        if (error) {
            logger.warn('Error de validació del cos de la petició', {
                path: req.path,
                method: req.method,
                error: error.message
            });
            return res.status(400).json({
                message: 'El contingut de la petició no és vàlid. Si us plau, reviseu les dades enviades.',
                errors: error.details.map(detail => ({
                    field: detail.context.key,
                    message: detail.message.replace(/"/g, ''),
                    value: detail.context.value
                }))
            });
        }
        next();
    };
}

/**
 * Middleware per validar model Ollama
 * Comprova si el model existeix abans de processar la petició
 * 
 * @param {Function} getModelsFunc - Funció per obtenir models disponibles
 * @returns {Function} - Middleware de validació
 */
function validateOllamaModel(getModelsFunc) {
    return async (req, res, next) => {
        try {
            // Si no s'ha especificat model, utilitzar el model per defecte
            if (!req.body.model) {
                return next();
            }

            // Obtenir models disponibles
            const models = await getModelsFunc();
            const modelExists = models.some(model => model.name === req.body.model);

            if (!modelExists) {
                logger.warn('Intent d\'utilitzar model no disponible', {
                    model: req.body.model,
                    availableModels: models.map(m => m.name)
                });
                
                return res.status(400).json({
                    message: `El model "${req.body.model}" no està disponible a Ollama.`,
                    error: 'model_unavailable',
                    availableModels: models.map(m => m.name)
                });
            }

            next();
        } catch (error) {
            logger.error('Error en validar model Ollama', {
                error: error.message,
                model: req.body.model
            });
            
            // Si no podem verificar, permetem continuar i es validarà més endavant
            next();
        }
    };
}

/**
 * Genera objectes d'error amb format estàndard
 * 
 * @param {string} message - Missatge d'error
 * @param {number} statusCode - Codi d'estat HTTP
 * @param {string} errorCode - Codi d'error intern
 * @returns {Error} - Objecte d'error
 */
function createError(message, statusCode = 400, errorCode = 'validation_error') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.errorCode = errorCode;
    return error;
}

module.exports = {
    validateUUID,
    validateParams,
    validateBody,
    validateOllamaModel,
    createError
};