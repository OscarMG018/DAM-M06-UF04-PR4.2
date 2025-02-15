const express = require('express');
const router = express.Router();
const { registerPrompt, getConversation, listOllamaModels, analizeSentiment } = require('../controllers/chatController');

/**
 * @swagger
 * /api/chat/prompt:
 *   post:
 *     summary: Crear un nou prompt o afegir-lo a una conversa existent
 *     tags: [Prompts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               conversationId:
 *                 type: string
 *                 format: uuid
 *                 description: ID de la conversa (opcional)
 *               prompt:
 *                 type: string
 *                 description: Text del prompt
 *               model:
 *                 type: string
 *                 description: Model d'Ollama a utilitzar
 *                 default: llama3:latest
 *               stream:
 *                 type: boolean
 *                 description: Indica si la resposta ha de ser en streaming
 *                 default: false
 *     responses:
 *       201:
 *         description: Prompt registrat correctament
 *       400:
 *         description: Dades invàlides
 *       404:
 *         description: Conversa no trobada
 */
router.post('/prompt', registerPrompt);

/**
 * @swagger
 * /api/chat/conversation/{id}:
 *   get:
 *     summary: Obtenir una conversa per ID
 *     tags: [Conversations]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: UUID de la conversa
 *     responses:
 *       200:
 *         description: Conversa trobada
 *       404:
 *         description: Conversa no trobada
 */
router.get('/conversation/:id', getConversation);

/**
 * @swagger
 * /api/chat/models:
 *   get:
 *     summary: Llistar models disponibles a Ollama
 *     tags: [Chat]
 *     responses:
 *       200:
 *         description: Llista de models disponibles
 *       500:
 *         description: Error al recuperar models
 */
router.get('/models', listOllamaModels);


/**
 * @swagger
 * /api/chat/sentiment-analysis:
 *   post:
 *     summary: Analyze the sentiment of a given text
 *     tags: [Sentiment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 description: The text to analyze
 *     responses:
 *       200:
 *         description: Sentiment analysis result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sentiment:
 *                   type: string
 *                   description: The detected sentiment (e.g., positive, negative)
 *       400:
 *         description: Invalid input data
 */
router.post('/sentiment-analysis', analizeSentiment);


module.exports = router;
