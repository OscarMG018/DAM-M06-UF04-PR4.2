const { logger } = require('../config/logger');

/**
 * Middleware per gestionar errors de forma centralitzada
 * Captura tots els errors de l'aplicació i proporciona una resposta adequada
 */
const errorHandler = (err, req, res, next) => {
    // Registrem l'error complet amb stack trace per debugging
    logger.error('Error detectat:', { 
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });
    
    // Gestió d'errors de validació de Sequelize (per exemple, camps obligatoris)
    if (err.name === 'SequelizeValidationError') {
        logger.warn('Error de validació de dades:', {
            errors: err.errors.map(e => e.message)
        });
        return res.status(400).json({
            message: 'La informació proporcionada no és vàlida. Si us plau, reviseu les dades introduïdes.',
            errors: err.errors.map(e => e.message)
        });
    }
    
    // Gestió d'errors de clau única de Sequelize (per exemple, duplicats)
    if (err.name === 'SequelizeUniqueConstraintError') {
        logger.warn('Intent de duplicar registre únic:', {
            errors: err.errors.map(e => e.message)
        });
        return res.status(400).json({
            message: 'Ja existeix un registre amb aquestes dades. No es poden crear duplicats.',
            errors: err.errors.map(e => e.message)
        });
    }

    // Gestió d'errors de connexió a API externa (Ollama)
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        logger.error('Error de connexió amb servei extern:', {
            code: err.code,
            target: err.config?.url || 'desconegut'
        });
        return res.status(503).json({
            message: 'No s\'ha pogut connectar amb el servei extern. Si us plau, verifiqueu que el servei Ollama estigui actiu i accessible.',
            error: 'connection_failed'
        });
    }

    // Gestió d'errors de timeout
    if (err.code === 'ETIMEDOUT' || err.code === 'TIMEOUT' || err.message.includes('timeout')) {
        logger.error('Timeout en la connexió:', {
            code: err.code,
            target: err.config?.url || 'desconegut'
        });
        return res.status(504).json({
            message: 'La sol·licitud ha trigat massa temps en completar-se. Això pot ser degut a alta càrrega al servidor o complexitat de la consulta.',
            error: 'request_timeout'
        });
    }

    // Gestió d'errors de model no disponible
    if (err.isModelError) {
        logger.error('Error amb el model d\'Ollama:', {
            model: err.model,
            details: err.message
        });
        return res.status(400).json({
            message: `El model sol·licitat "${err.model}" no està disponible o no s'ha pogut carregar. Si us plau, proveu amb un altre model o contacteu amb l'administrador.`,
            error: 'model_unavailable',
            model: err.model
        });
    }

    // Crear un missatge d'error amigable per l'usuari
    const userFriendlyMessage = createUserFriendlyErrorMessage(err);

    // Per altres tipus d'errors, retornem un error 500
    // En desenvolupament mostrem el missatge d'error, en producció no
    const isDevMode = process.env.NODE_ENV === 'development';
    logger.error('Error no controlat:', {
        isDev: isDevMode,
        errorName: err.name,
        errorMessage: err.message
    });

    res.status(err.statusCode || 500).json({
        message: userFriendlyMessage,
        error: isDevMode ? err.message : 'Error intern del servidor'
    });
};

/**
 * Crea un missatge d'error amigable per l'usuari
 * @param {Error} err - L'error captat
 * @returns {string} Missatge d'error amigable
 */
function createUserFriendlyErrorMessage(err) {
    // Segons el tipus o condició de l'error, proporcionar diferents missatges
    if (err.message.includes('database') || err.name.includes('Sequelize')) {
        return 'Hi ha hagut un problema amb la base de dades. Si us plau, intenteu-ho de nou més tard.';
    } else if (err.message.includes('auth') || err.message.includes('token')) {
        return 'Error d\'autenticació. Si us plau, inicieu sessió de nou.';
    } else if (err.message.includes('permission') || err.statusCode === 403) {
        return 'No teniu permisos per realitzar aquesta acció.';
    } else if (err.statusCode === 404 || err.message.includes('not found')) {
        return 'El recurs sol·licitat no s\'ha trobat.';
    } else if (err.message.includes('ollama') || err.message.includes('model')) {
        return 'Hi ha hagut un problema amb el servei d\'IA. Si us plau, intenteu-ho de nou més tard.';
    }
    
    // Missatge genèric per altres tipus d'errors
    return 'Hi ha hagut un problema en processar la vostra sol·licitud. Si us plau, intenteu-ho de nou més tard.';
}

module.exports = errorHandler;