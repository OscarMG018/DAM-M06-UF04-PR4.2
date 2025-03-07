/**
 * Test per a la verificació de models Ollama
 * 
 * Aquest test verifica la disponibilitat de models a Ollama
 * i la gestió d'errors relacionats amb models inexistents.
 */

const axios = require('axios');
const dotenv = require('dotenv');

// Carregar variables d'entorn de test
dotenv.config({ path: '.env.test' });

const OLLAMA_API_URL = process.env.CHAT_API_OLLAMA_URL || 'http://localhost:11434/api';
const MODEL_TO_TEST = process.env.CHAT_API_OLLAMA_MODEL || 'llama3.2:1b';

/**
 * Comprova la disponibilitat del servei Ollama
 * @returns {Promise<boolean>} Cert si Ollama està disponible
 */
async function isOllamaAvailable() {
    try {
        await axios.get(`${OLLAMA_API_URL}/tags`, { timeout: 5000 });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Obté la llista de models disponibles a Ollama
 * @returns {Promise<Array>} Llista de models
 */
async function getAvailableModels() {
    try {
        const response = await axios.get(`${OLLAMA_API_URL}/tags`);
        return response.data.models.map(model => ({
            name: model.name,
            modified_at: model.modified_at
        }));
    } catch (error) {
        console.error('Error retrieving models:', error.message);
        return [];
    }
}

/**
 * Verifica si un model específic existeix a Ollama
 * @param {string} modelName - Nom del model a verificar
 * @returns {Promise<boolean>} Cert si el model existeix
 */
async function doesModelExist(modelName) {
    try {
        const models = await getAvailableModels();
        return models.some(model => model.name === modelName);
    } catch (error) {
        console.error('Error checking model existence:', error.message);
        return false;
    }
}

/**
 * Intenta fer una petició simple a un model no existent
 * @param {string} modelName - Nom del model inexistent
 * @returns {Promise<Object>} Resultat de la petició
 */
async function testNonExistentModel(modelName) {
    try {
        await axios.post(`${OLLAMA_API_URL}/generate`, {
            model: modelName,
            prompt: 'Test prompt',
            stream: false
        });
        return { success: true, error: null };
    } catch (error) {
        return { 
            success: false, 
            error: error.response?.data?.error || error.message,
            status: error.response?.status
        };
    }
}

/**
 * Executa els tests
 */
async function runTests() {
    console.log('Iniciant tests de verificació de models Ollama...');
    
    // Comprovar si Ollama està disponible
    const ollamaAvailable = await isOllamaAvailable();
    if (!ollamaAvailable) {
        console.error('❌ Ollama no està disponible. Verifica la configuració o que el servei estigui en execució.');
        process.exit(1);
    }
    
    console.log('✅ Ollama està disponible');
    
    // Obtenir models disponibles
    const models = await getAvailableModels();
    console.log(`📋 Models disponibles (${models.length}):`);
    models.forEach(model => {
        console.log(`   - ${model.name}`);
    });
    
    // Verificar si el model configurat existeix
    const modelExists = await doesModelExist(MODEL_TO_TEST);
    if (modelExists) {
        console.log(`✅ El model configurat (${MODEL_TO_TEST}) està disponible`);
    } else {
        console.error(`❌ El model configurat (${MODEL_TO_TEST}) NO està disponible`);
        console.log('   Consell: Verifica la configuració o descarrega el model amb:');
        console.log(`   ollama pull ${MODEL_TO_TEST}`);
    }
    
    // Provar comportament amb model inexistent
    const nonExistentModel = 'model_que_no_existeix_' + Date.now();
    console.log(`🧪 Provant comportament amb model inexistent (${nonExistentModel})...`);
    
    const testResult = await testNonExistentModel(nonExistentModel);
    if (!testResult.success && testResult.error.includes('model') && testResult.status === 404) {
        console.log('✅ Ollama correctament reporta error per models inexistents');
        console.log(`   Error: ${testResult.error}`);
    } else if (testResult.success) {
        console.error('❌ Ollama NO va reportar error amb model inexistent (això no hauria de passar)');
    } else {
        console.warn('⚠️ Ollama va reportar un error inesperat amb model inexistent');
        console.log(`   Error: ${testResult.error}`);
        console.log(`   Status: ${testResult.status}`);
    }
    
    console.log('\nTests finalitzats!');
}

// Executar tests només si aquest fitxer s'executa directament
if (require.main === module) {
    runTests().catch(error => {
        console.error('Error en executar tests:', error);
        process.exit(1);
    });
}

module.exports = {
    isOllamaAvailable,
    getAvailableModels,
    doesModelExist,
    testNonExistentModel
}; 