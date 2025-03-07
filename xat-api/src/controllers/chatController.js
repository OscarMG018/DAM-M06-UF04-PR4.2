// Importacions necessàries
const Conversation = require('../models/Conversation');
const Prompt = require('../models/Prompt');
const { validateUUID } = require('../middleware/validators');
const axios = require('axios');
const { logger } = require('../config/logger');
const Sentiment = require('../models/Sentiment');

// Constants de configuració
const OLLAMA_API_URL = process.env.CHAT_API_OLLAMA_URL || 'http://localhost:11434/api';
const DEFAULT_OLLAMA_MODEL = process.env.CHAT_API_OLLAMA_MODEL || 'llama3.2:1b';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Cache per emmagatzemar models disponibles
let ollamaModelsCache = {
    models: [],
    lastUpdated: null,
    ttl: 5 * 60 * 1000 // 5 minuts en ms
};

/**
 * Retorna la llista de models disponibles a Ollama
 * @route GET /api/chat/models
 */
const listOllamaModels = async (req, res, next) => {
    try {
        logger.info('Sol·licitant llista de models a Ollama');
        
        // Comprovar si tenim models en cache vàlids
        const now = Date.now();
        if (ollamaModelsCache.models.length > 0 && 
            ollamaModelsCache.lastUpdated && 
            (now - ollamaModelsCache.lastUpdated < ollamaModelsCache.ttl)) {
            logger.debug('Retornant models des de cache', { 
                count: ollamaModelsCache.models.length,
                cacheAge: now - ollamaModelsCache.lastUpdated
            });
            
            return res.json({
                total_models: ollamaModelsCache.models.length,
                models: ollamaModelsCache.models,
                from_cache: true
            });
        }
        
        // Si no tenim models en cache o han caducat, obtenim-los d'Ollama
        const response = await fetchWithRetry(`${OLLAMA_API_URL}/tags`, {
            method: 'GET'
        });
        
        const models = response.data.models.map(model => ({
            name: model.name,
            modified_at: model.modified_at,
            size: model.size,
            digest: model.digest
        }));

        // Actualitzar cache
        ollamaModelsCache = {
            models,
            lastUpdated: now,
            ttl: 5 * 60 * 1000
        };

        logger.info(`Models recuperats correctament`, { count: models.length });
        res.json({
            total_models: models.length,
            models: models,
            from_cache: false
        });
    } catch (error) {
        logger.error('Error recuperant models d\'Ollama', {
            error: error.message,
            url: `${OLLAMA_API_URL}/tags`
        });
        
        if (error.response) {
            const status = error.response.status || 500;
            res.status(status).json({
                message: 'No s\'han pogut recuperar els models. Verifiqueu que el servei Ollama està en funcionament.',
                error: error.response.data
            });
        } else if (error.code === 'ECONNREFUSED') {
            res.status(503).json({
                message: 'No s\'ha pogut establir connexió amb el servei Ollama. Verifiqueu que està en funcionament i és accessible.',
                error: 'connection_refused'
            });
        } else {
            next(error);
        }
    }
};

/**
 * Comprova si un model existeix a Ollama
 * @param {string} modelName - Nom del model a comprovar
 * @returns {Promise<boolean>} Cert si el model existeix
 */
const isModelAvailable = async (modelName) => {
    try {
        logger.debug('Comprovant disponibilitat del model', { model: modelName });
        
        // Si tenim models en cache vàlids, comprovar-ho allà primer
        const now = Date.now();
        if (ollamaModelsCache.models.length > 0 && 
            ollamaModelsCache.lastUpdated && 
            (now - ollamaModelsCache.lastUpdated < ollamaModelsCache.ttl)) {
            const modelExists = ollamaModelsCache.models.some(model => model.name === modelName);
            logger.debug('Comprovació des de cache', { 
                model: modelName, 
                exists: modelExists
            });
            return modelExists;
        }
        
        // Si no tenim cache vàlida, consultar a Ollama
        const response = await fetchWithRetry(`${OLLAMA_API_URL}/tags`, {
            method: 'GET'
        });
        
        const models = response.data.models.map(model => ({
            name: model.name,
            modified_at: model.modified_at,
            size: model.size,
            digest: model.digest
        }));
        
        // Actualitzar cache
        ollamaModelsCache = {
            models,
            lastUpdated: now,
            ttl: 5 * 60 * 1000
        };
        
        const modelExists = models.some(model => model.name === modelName);
        logger.debug('Model verificat', { model: modelName, exists: modelExists });
        return modelExists;
    } catch (error) {
        logger.error('Error comprovant disponibilitat del model', {
            error: error.message,
            model: modelName
        });
        
        // En cas d'error, assumim que el model no existeix
        return false;
    }
};

/**
 * Funció genèrica per fer peticions HTTP amb reintents
 * @param {string} url - URL a consultar
 * @param {Object} options - Opcions de la petició
 * @param {number} retries - Nombre de reintents (opcional)
 * @returns {Promise<Object>} Resposta de la petició
 */
const fetchWithRetry = async (url, options = {}, retries = MAX_RETRIES) => {
    try {
        logger.debug('Fent petició HTTP', { url, retries_left: retries });
        return await axios(url, options);
    } catch (error) {
        // Si és un error de connexió i encara tenim reintents disponibles
        if ((error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || 
             error.code === 'ETIMEDOUT') && retries > 0) {
            logger.warn('Error de connexió, reintentant', { 
                url, 
                error: error.message, 
                retries_left: retries 
            });
            
            // Esperar abans de reintentar
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            
            // Reintentar la petició
            return fetchWithRetry(url, options, retries - 1);
        }
        
        // Si ja no tenim reintents o és un altre tipus d'error, propagar-lo
        logger.error('Error en petició HTTP sense possibilitat de reintent', {
            url,
            error: error.message,
            code: error.code,
            retries_left: retries
        });
        throw error;
    }
};

/**
 * Genera una resposta utilitzant el model d'Ollama
 * @param {string} prompt - Text d'entrada per generar la resposta
 * @param {Object} options - Opcions de configuració
 * @returns {Promise<string>} Resposta generada
 */
const generateResponse = async (prompt, options = {}) => {
    try {
        const {
            model = DEFAULT_OLLAMA_MODEL,
            stream = false
        } = options;

        logger.debug('Iniciant generació de resposta', { 
            model, 
            stream,
            promptLength: prompt.length 
        });

        // Verificar que el model existeix abans de fer la petició
        const modelExists = await isModelAvailable(model);
        if (!modelExists) {
            logger.error('Model no disponible', { model });
            
            // Crear un error personalitzat
            const modelError = new Error(`El model "${model}" no està disponible a Ollama`);
            modelError.isModelError = true;
            modelError.model = model;
            modelError.statusCode = 400;
            throw modelError;
        }

        const requestBody = {
            model,
            prompt,
            stream
        };

        // Utilitzar la funció fetchWithRetry per fer la petició amb reintents
        const response = await fetchWithRetry(`${OLLAMA_API_URL}/generate`, {
            method: 'POST',
            data: requestBody,
            timeout: 30000,
            responseType: stream ? 'stream' : 'json'
        });

        // Gestió diferent per respostes en streaming i no streaming
        if (stream) {
            return new Promise((resolve, reject) => {
                let fullResponse = '';
                
                response.data.on('data', (chunk) => {
                    const chunkStr = chunk.toString();
                    try {
                        const parsedChunk = JSON.parse(chunkStr);
                        if (parsedChunk.response) {
                            fullResponse += parsedChunk.response;
                        }
                    } catch (parseError) {
                        logger.error('Error processant chunk de resposta', { 
                            error: parseError.message,
                            chunk: chunkStr 
                        });
                    }
                });
                
                response.data.on('end', () => {
                    logger.debug('Generació en streaming completada', {
                        responseLength: fullResponse.length
                    });
                    resolve(fullResponse.trim());
                });
                
                response.data.on('error', (error) => {
                    logger.error('Error en streaming', { error: error.message });
                    reject(error);
                });
            });
        }

        logger.debug('Resposta generada correctament', {
            responseLength: response.data.response.length
        });
        return response.data.response.trim();
    } catch (error) {
        logger.error('Error en la generació de resposta', {
            error: error.message,
            model: options.model,
            stream: options.stream
        });
        
        if (error.isModelError) {
            throw error; // Propagar els errors de model específics
        }
        
        if (error.response?.data) {
            logger.error('Detalls de l\'error d\'Ollama', { 
                details: error.response.data 
            });
            
            // Si l'error és específic del model, crear un error personalitzat
            if (error.response.data.error && 
                (error.response.data.error.includes('model') || 
                 error.response.data.error.includes('not found'))) {
                const modelError = new Error(error.response.data.error);
                modelError.isModelError = true;
                modelError.model = options.model;
                modelError.statusCode = 400;
                throw modelError;
            }
        }

        return 'Ho sento, no he pogut generar una resposta en aquest moment. Si us plau, intenteu-ho de nou més tard o proveu amb un altre model.';
    }
};

/**
 * Registra un nou prompt i genera una resposta
 * @route POST /api/chat/prompt
 */
const registerPrompt = async (req, res, next) => {
    try {
        const { 
            conversationId, 
            prompt, 
            model = DEFAULT_OLLAMA_MODEL, 
            stream = false 
        } = req.body;

        logger.info('Nova sol·licitud de prompt rebuda', {
            hasConversationId: !!conversationId,
            model,
            stream,
            promptLength: prompt?.length
        });

        // Validacions inicials
        if (!prompt?.trim()) {
            logger.warn('Intent de registrar prompt buit');
            return res.status(400).json({ 
                message: 'El prompt és obligatori. Si us plau, proporcioneu text per processar.',
                error: 'prompt_required'
            });
        }

        // Comprovació del model abans de continuar
        try {
            const modelExists = await isModelAvailable(model);
            if (!modelExists) {
                logger.warn('Intent d\'utilitzar un model no disponible', { model });
                return res.status(400).json({
                    message: `El model "${model}" no està disponible. Si us plau, escolliu un altre model.`,
                    error: 'model_unavailable',
                    model,
                    available_models: ollamaModelsCache.models.map(m => m.name)
                });
            }
        } catch (modelError) {
            logger.error('Error en verificar el model', {
                error: modelError.message,
                model
            });
            // Continuem tot i l'error, es gestionarà més endavant
        }

        // Gestió de la conversa
        let conversation;
        if (conversationId) {
            if (!validateUUID(conversationId)) {
                logger.warn('ID de conversa invàlid', { conversationId });
                return res.status(400).json({ 
                    message: 'El format de l\'ID de conversa no és vàlid. Ha de ser un UUID.',
                    error: 'invalid_uuid'
                });
            }
            
            try {
                conversation = await Conversation.findByPk(conversationId);
                
                if (!conversation) {
                    logger.info('Creant nova conversa amb ID proporcionat', { conversationId });
                    conversation = await Conversation.create({ id: conversationId });
                }
            } catch (dbError) {
                logger.error('Error en accedir a la base de dades per la conversa', {
                    error: dbError.message,
                    conversationId
                });
                return res.status(500).json({
                    message: 'No s\'ha pogut recuperar o crear la conversa. Si us plau, intenteu-ho de nou.',
                    error: 'database_error'
                });
            }
        } else {
            try {
                logger.info('Creant nova conversa sense ID específic');
                conversation = await Conversation.create();
            } catch (dbError) {
                logger.error('Error en crear nova conversa', {
                    error: dbError.message
                });
                return res.status(500).json({
                    message: 'No s\'ha pogut crear una nova conversa. Si us plau, intenteu-ho de nou.',
                    error: 'database_error'
                });
            }
        }

        // Gestió de streaming vs no-streaming
        try {
            if (stream) {
                await handleStreamingResponse(req, res, conversation, prompt, model);
            } else {
                await handleNormalResponse(req, res, conversation, prompt, model);
            }
        } catch (error) {
            // L'error ja hauria d'estar gestionat pels handlers respectius
            logger.error('Error no gestionat en el processament de la resposta', {
                error: error.message,
                stack: error.stack
            });
            next(error);
        }
    } catch (error) {
        logger.error('Error en el procés de registre de prompt', {
            error: error.message,
            stack: error.stack
        });
        next(error);
    }
};

/**
 * Gestiona la resposta en mode streaming
 * @private
 */
async function handleStreamingResponse(req, res, conversation, prompt, model) {
    // Configuració de SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let newPrompt;
    try {
        newPrompt = await Prompt.create({
            prompt: prompt.trim(),
            response: '',
            model,
            stream: true,
            ConversationId: conversation.id
        });

        logger.debug('Iniciant resposta en streaming', {
            promptId: newPrompt.id,
            conversationId: conversation.id
        });

        // Event inicial
        res.write(`data: ${JSON.stringify({
            type: 'start',
            conversationId: conversation.id,
            promptId: newPrompt.id,
            prompt: prompt.trim()
        })}\n\n`);
    } catch (dbError) {
        logger.error('Error en crear el registre de prompt per streaming', {
            error: dbError.message,
            conversationId: conversation.id
        });
        
        res.write(`data: ${JSON.stringify({
            type: 'error',
            error: 'db_error',
            message: 'Error en registrar el prompt a la base de dades'
        })}\n\n`);
        
        res.end();
        return;
    }

    try {
        await processStreamingResponse(res, conversation, newPrompt, prompt, model);
    } catch (error) {
        logger.error('Error en streaming', {
            error: error.message,
            promptId: newPrompt.id
        });
        
        let errorMessage = 'Error en el procés de streaming';
        let errorType = 'streaming_error';
        
        if (error.isModelError) {
            errorMessage = `El model "${model}" no està disponible o hi ha hagut un problema en utilitzar-lo`;
            errorType = 'model_error';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'No s\'ha pogut connectar amb el servei Ollama. Verifiqueu que està actiu.';
            errorType = 'connection_error';
        } else if (error.code === 'ETIMEDOUT') {
            errorMessage = 'La sol·licitud ha excedit el temps d\'espera. Proveu amb un prompt més curt o un model més ràpid.';
            errorType = 'timeout_error';
        }
        
        res.write(`data: ${JSON.stringify({
            type: 'error',
            error: errorType,
            message: errorMessage
        })}\n\n`);
        
        res.end();
    }
}

/**
 * Gestiona la resposta normal (no streaming)
 * @private
 */
async function handleNormalResponse(req, res, conversation, prompt, model) {
    try {
        logger.debug('Generant resposta no streaming', {
            conversationId: conversation.id,
            model
        });

        let responseText;
        let attempts = 0;
        const maxAttempts = MAX_RETRIES;
        
        // Intentar generar resposta amb reintents
        while (attempts < maxAttempts) {
            try {
                responseText = await generateResponse(prompt, { model, stream: false });
                break; // Si té èxit, sortim del bucle
            } catch (genError) {
                attempts++;
                
                // Si és un error específic del model, no reintentem
                if (genError.isModelError) {
                    throw genError;
                }
                
                // Si hem arribat al màxim d'intents, propaguem l'error
                if (attempts >= maxAttempts) {
                    logger.error('Nombre màxim d\'intents excedits', {
                        attempts,
                        error: genError.message
                    });
                    throw genError;
                }
                
                // Esperar abans de reintentar
                const delayMs = RETRY_DELAY_MS * attempts;
                logger.warn(`Reintentant generació de resposta (intent ${attempts}/${maxAttempts})`, {
                    delay: delayMs,
                    error: genError.message
                });
                
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        // Guardar el prompt i la resposta a la base de dades
        try {
            const newPrompt = await Prompt.create({
                prompt: prompt.trim(),
                response: responseText,
                model,
                stream: false,
                ConversationId: conversation.id
            });

            logger.info('Prompt i resposta guardats correctament', { 
                promptId: newPrompt.id,
                conversationId: conversation.id,
                responseLength: responseText.length
            });

            // Enviar resposta al client
            res.status(201).json({
                id: newPrompt.id,
                conversationId: conversation.id,
                prompt: prompt.trim(),
                response: responseText,
                model,
                stream: false,
                createdAt: newPrompt.createdAt
            });
        } catch (dbError) {
            logger.error('Error en desar el prompt i resposta a la base de dades', {
                error: dbError.message,
                conversationId: conversation.id
            });
            
            // Tot i l'error de base de dades, retornem la resposta generada al client
            res.status(207).json({
                conversationId: conversation.id,
                prompt: prompt.trim(),
                response: responseText,
                model,
                stream: false,
                warning: 'La resposta s\'ha generat correctament però no s\'ha pogut desar a la base de dades'
            });
        }
    } catch (error) {
        logger.error('Error en generar resposta normal', {
            error: error.message,
            conversationId: conversation.id,
            model
        });
        
        // Personalitzar la resposta segons el tipus d'error
        if (error.isModelError) {
            return res.status(400).json({
                message: `El model "${model}" no està disponible o no s'ha pogut carregar.`,
                error: 'model_unavailable',
                model
            });
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return res.status(503).json({
                message: 'No s\'ha pogut connectar amb el servei Ollama. Verifiqueu que està en funcionament.',
                error: 'connection_error'
            });
        } else if (error.code === 'ETIMEDOUT') {
            return res.status(504).json({
                message: 'La sol·licitud ha excedit el temps d\'espera. Proveu amb un prompt més curt o un model més ràpid.',
                error: 'timeout_error'
            });
        }
        
        // Per altres tipus d'errors
        res.status(500).json({
            message: 'Hi ha hagut un problema en generar la resposta. Si us plau, intenteu-ho de nou més tard.',
            error: 'generation_error'
        });
    }
}

/**
 * Processa la resposta en streaming i l'envia al client
 * @private
 */
async function processStreamingResponse(res, conversation, prompt, promptText, model) {
    try {
        // Generar resposta amb streaming
        const response = await axios.post(`${OLLAMA_API_URL}/generate`, {
            model,
            prompt: promptText,
            stream: true
        }, {
            timeout: 60000,
            responseType: 'stream'
        });

        let fullResponse = '';

        // Processar la resposta en streaming
        response.data.on('data', async (chunk) => {
            try {
                const chunkStr = chunk.toString();
                const parsedChunk = JSON.parse(chunkStr);
                
                if (parsedChunk.response) {
                    fullResponse += parsedChunk.response;
                    
                    // Enviar chunk al client
                    res.write(`data: ${JSON.stringify({
                        type: 'chunk',
                        chunk: parsedChunk.response
                    })}\n\n`);
                }
                
                // Si és l'últim chunk, actualitzar el prompt a la base de dades
                if (parsedChunk.done) {
                    try {
                        await prompt.update({ response: fullResponse.trim() });
                        logger.debug('Resposta completa actualitzada a la base de dades', {
                            promptId: prompt.id,
                            responseLength: fullResponse.length
                        });
                        
                        // Enviar event de finalització
                        res.write(`data: ${JSON.stringify({
                            type: 'end',
                            conversationId: conversation.id,
                            promptId: prompt.id,
                            responseLength: fullResponse.length,
                            complete: true
                        })}\n\n`);
                    } catch (dbError) {
                        logger.error('Error en actualitzar resposta a la base de dades', {
                            error: dbError.message,
                            promptId: prompt.id
                        });
                        
                        // Enviar event de finalització amb advertència
                        res.write(`data: ${JSON.stringify({
                            type: 'end',
                            conversationId: conversation.id,
                            promptId: prompt.id,
                            responseLength: fullResponse.length,
                            complete: true,
                            warning: 'No s\'ha pogut desar la resposta a la base de dades'
                        })}\n\n`);
                    }
                    
                    // Finalitzar la connexió SSE
                    res.end();
                }
            } catch (parseError) {
                logger.error('Error processant chunk de resposta', {
                    error: parseError.message,
                    chunk: chunk.toString().substring(0, 100) // Limitem per no omplir els logs
                });
            }
        });

        // Gestió d'errors en el stream
        response.data.on('error', async (error) => {
            logger.error('Error en stream de resposta', {
                error: error.message,
                promptId: prompt.id
            });
            
            // Intentar actualitzar el prompt amb la resposta parcial
            try {
                if (fullResponse.length > 0) {
                    await prompt.update({ 
                        response: fullResponse.trim() + '\n[Resposta incompleta degut a un error]' 
                    });
                }
            } catch (dbError) {
                logger.error('Error en actualitzar resposta parcial', {
                    error: dbError.message,
                    promptId: prompt.id
                });
            }
            
            // Enviar error al client
            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: 'stream_error',
                message: 'Error en el processament de la resposta en streaming',
                partialResponse: fullResponse.length > 0
            })}\n\n`);
            
            res.end();
        });
    } catch (error) {
        // Gestió d'errors en la inicialització del streaming
        logger.error('Error en iniciar streaming', {
            error: error.message,
            promptId: prompt.id,
            modelUsed: model
        });
        
        let errorMessage = 'Error en la generació de resposta en streaming';
        let errorType = 'streaming_error';
        
        // Personalitzar el missatge segons el tipus d'error
        if (error.response && error.response.data) {
            logger.error('Detalls de l\'error d\'Ollama', { 
                statusCode: error.response.status,
                data: error.response.data 
            });
            
            // Comprovar si l'error està relacionat amb el model
            if (error.response.data.error && error.response.data.error.includes('model')) {
                errorMessage = `El model "${model}" no està disponible o hi ha hagut un problema en utilitzar-lo`;
                errorType = 'model_error';
            }
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            errorMessage = 'No s\'ha pogut connectar amb el servei Ollama. Verifiqueu que està actiu.';
            errorType = 'connection_error';
        } else if (error.code === 'ETIMEDOUT') {
            errorMessage = 'La sol·licitud ha excedit el temps d\'espera. Proveu amb un prompt més curt o un model més ràpid.';
            errorType = 'timeout_error';
        }
        
        // Enviar error al client
        res.write(`data: ${JSON.stringify({
            type: 'error',
            error: errorType,
            message: errorMessage
        })}\n\n`);
        
        res.end();
        throw error; // Propagar l'error per la gestió centralitzada
    }
}

/**
 * Recupera una conversa amb tots els seus prompts
 * @route GET /api/chat/conversation/:id
 */
const getConversation = async (req, res, next) => {
    try {
        const { id } = req.params;

        logger.debug('Sol·licitud de recuperació de conversa', { conversationId: id });

        if (!validateUUID(id)) {
            logger.warn('Intent de recuperar conversa amb ID invàlid', { id });
            return res.status(400).json({ message: 'ID de conversa invàlid' });
        }

        const conversation = await Conversation.findByPk(id);
        if (!conversation) {
            logger.warn('Conversa no trobada', { id });
            return res.status(404).json({ message: 'Conversa no trobada' });
        }

        const conversationWithPrompts = await Conversation.findByPk(id, {
            include: {
                model: Prompt,
                attributes: ['id', 'prompt', 'response', 'createdAt']
            },
            order: [[Prompt, 'createdAt', 'ASC']]
        });

        logger.info('Conversa recuperada correctament', {
            conversationId: id,
            promptCount: conversationWithPrompts.Prompts.length
        });

        res.json(conversationWithPrompts);
    } catch (error) {
        logger.error('Error en recuperar conversa', {
            error: error.message,
            conversationId: req.params.id
        });
        next(error);
    }
};

/**
 * Analitza el sentiment d'una frase
 * @route POST /api/chat/sentiment-analysis
*/
const analizeSentiment = async (req, res) => {
    try {
        const { text, promptId } = req.body;

        if (!text) {
            return res.status(400).json({ message: 'Text is required for sentiment analysis' });
        }

        const model = DEFAULT_OLLAMA_MODEL;
        const stream = false;

        logger.debug('Starting sentiment analysis', { 
            model, 
            textLength: text.length,
            promptId
        });

        const requestBody = {
            model,
            prompt: `Analyze the sentiment of this text and respond with only one word (positive/negative/neutral): "${text}"`,
            stream
        };

        const response = await axios.post(`${OLLAMA_API_URL}/generate`, requestBody, {
            timeout: 30000,
            responseType: 'json'
        });

        const sentiment = response.data.response.trim().toLowerCase();
        
        // Validate sentiment value
        if (!['positive', 'negative', 'neutral'].includes(sentiment)) {
            throw new Error('Invalid sentiment response from model');
        }

        // Create sentiment record
        const sentimentRecord = await Sentiment.create({
            text,
            sentiment,
            model,
            PromptId: promptId || null
        });

        logger.info('Sentiment analysis completed and stored', {
            sentimentId: sentimentRecord.id,
            sentiment,
            promptId
        });
        
        res.status(200).json({
            id: sentimentRecord.id,
            sentiment,
            text,
            model,
            createdAt: sentimentRecord.createdAt
        });
    } catch (error) {
        logger.error('Error in sentiment analysis', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            message: 'Error performing sentiment analysis',
            error: error.message 
        });
    }
};


// Exportació de les funcions públiques
module.exports = {
    registerPrompt,
    getConversation,
    listOllamaModels,
    analizeSentiment
};