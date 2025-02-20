// Importacions
const fs = require('fs').promises;
const { dir } = require('console');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Constants des de variables d'entorn
const IMAGES_SUBFOLDER = 'imatges/animals';
const IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif'];
const OLLAMA_URL = process.env.CHAT_API_OLLAMA_URL;
const OLLAMA_MODEL = process.env.CHAT_API_OLLAMA_MODEL_VISION;

const DIRECTORIES_TO_ANALIZE = 2;
const OUTPUT_FILE_NAME = "exercici3_resposta.json"

// Funció per llegir un fitxer i convertir-lo a Base64
async function imageToBase64(imagePath) {
    try {
        const data = await fs.readFile(imagePath);
        return Buffer.from(data).toString('base64');
    } catch (error) {
        console.error(`Error al llegir o convertir la imatge ${imagePath}:`, error.message);
        return null;
    }
}

// Funció per fer la petició a Ollama amb més detalls d'error
async function queryOllama(base64Image, prompt) {
    const requestBody = {
        model: OLLAMA_MODEL,
        prompt: prompt,
        images: [`${base64Image}`],
        stream: false,
        options: {
            temperature: 0.7,
            num_predict: 1024
        }
    };

    try {
        // Add debug logging
        console.log('=== Debug Info ===');
        console.log('Image size (bytes):', base64Image.length);
        console.log('Prompt length:', prompt.length);
        console.log('Model being used:', OLLAMA_MODEL);
        
        // Test basic connection first
        try {
            const versionCheck = await axios.get(`${OLLAMA_URL}/api/version`);
            console.log('Ollama version:', versionCheck.data);
        } catch (e) {
            console.error('Failed basic connection test:', e.message);
        }

        let retries = 3;
        let lastError;
        
        while (retries > 0) {
            try {
                console.log(`Attempt ${4-retries}: Making request to Ollama...`);
                const response = await axios.post(`${OLLAMA_URL}/api/generate`, requestBody, {
                    timeout: 300000,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
                
                console.log('Response received. Status:', response.status);
                console.log('Response type:', typeof response.data);
                console.log('Response structure:', Object.keys(response.data));
                
                const data = response.data;
                if (!data || !data.response) {
                    console.error('Raw response:', JSON.stringify(data, null, 2));
                    throw new Error('La resposta d\'Ollama no té el format esperat');
                }
                return data.response;
            } catch (error) {
                lastError = error;
                console.error('Request error details:', {
                    message: error.message,
                    response: error.response?.data,
                    status: error.response?.status
                });
                retries--;
                if (retries > 0) {
                    console.log(`Reintentant petició. Intents restants: ${retries}`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
        
        throw lastError;
    } catch (error) {
        //console.error('Error detallat en la petició a Ollama:', error);
        console.error('Detalls adicionals:', {
            url: `${OLLAMA_URL}/api/generate`,
            model: OLLAMA_MODEL,
            promptLength: prompt.length,
            imageLength: base64Image.length,
            errorMessage: error.message,
            errorCode: error.code
        });
        throw error;
    }
}

async function getAllImages() {
    const imageList = [];
    const imagesFolderPath = path.join(__dirname, process.env.DATA_PATH, IMAGES_SUBFOLDER);
    try {
        await fs.access(imagesFolderPath);
    } catch (error) {
        throw new Error(`El directori d'imatges no existeix: ${imagesFolderPath}`);
    }
    try {
        const animalDirectories = await fs.readdir(imagesFolderPath);
        directoriesAnalized = 0;

        for (const animalDir of animalDirectories) {
            // Construïm la ruta completa al directori de l'animal actual
            const animalDirPath = path.join(imagesFolderPath, animalDir);

            try {
                // Obtenim informació sobre l'element (si és directori, fitxer, etc.)
                const stats = await fs.stat(animalDirPath);
                
                // Si no és un directori, l'ignorem i continuem amb el següent
                if (!stats.isDirectory()) {
                    console.log(`S'ignora l'element no directori: ${animalDirPath}`);
                    continue;
                }
            } catch (error) {
                // Si hi ha error al obtenir la info del directori, el loguegem i continuem
                console.error(`Error al obtenir informació del directori: ${animalDirPath}`, error.message);
                continue;
            }

            // Obtenim la llista de tots els fitxers dins del directori de l'animal
            const imageFiles = await fs.readdir(animalDirPath);

            // Iterem per cada fitxer dins del directori de l'animal
            for (const imageFile of imageFiles) {
                // Construïm la ruta completa al fitxer d'imatge
                const imagePath = path.join(animalDirPath, imageFile);
                // Obtenim l'extensió del fitxer i la convertim a minúscules
                const ext = path.extname(imagePath).toLowerCase();
                
                // Si l'extensió no és d'imatge vàlida (.jpg, .png, etc), l'ignorem
                if (!IMAGE_TYPES.includes(ext)) {
                    console.log(`S'ignora fitxer no vàlid: ${imagePath}`);
                    continue;
                }

                // Convertim la imatge a format Base64 per enviar-la a Ollama
                const base64String = await imageToBase64(imagePath);

                // Si s'ha pogut convertir la imatge correctament
                if (base64String) {
                    imageList.push({fileName : imageFile, base64String : base64String});
                }
            }
            directoriesAnalized++
            if (directoriesAnalized >= DIRECTORIES_TO_ANALIZE) {
                break;
            }
        }
    } catch (error) {
        console.error('Error durant l\'execució:', error.message);
    }
    return imageList;
}

function isJSON(str) {
    try {
        JSON.parse(str);
        return true;
    } catch (e) {
        return false;
    }
}

// Funció principal
async function main() {
    // Validem les variables d'entorn necessàries
    if (!process.env.DATA_PATH) {
        throw new Error('La variable d\'entorn DATA_PATH no està definida.');
    }
    if (!OLLAMA_URL) {
        throw new Error('La variable d\'entorn CHAT_API_OLLAMA_URL no està definida.');
    }
    if (!OLLAMA_MODEL) {
        throw new Error('La variable d\'entorn CHAT_API_OLLAMA_MODEL no està definida.');
    }

    const imageList = await getAllImages();
    console.log(`S'han analitzat ${imageList.length} imatges`);
    const result = [];

    const prompt = "Identify the type of animal in the image. Response by making a json with the following "
        + "information: name(common/scientific name), taxonomy, habitat, diet, physical characteristics, endangerState";
    
    for (const image of imageList) {
        try {
            const response = await queryOllama(image.base64String, prompt);
            if (response && isJSON(response)) {
                result.push(JSON.parse(response));
            } else {
                console.error(`La resposta retornada no és un JSON: ${response}`);
            }
        } catch (error) {
            console.error(`Error processant imatge ${image.fileName}:`, error);
            break;
        }
    }

    const outputPath = path.join(__dirname, process.env.DATA_PATH, OUTPUT_FILE_NAME);

    try {
        await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
        console.log(`JSON ${OUTPUT_FILE_NAME} desat correctament`);
    } catch (err) {
        console.error("Error escrivint al fitxer:", err);
    }
}

// Executem la funció principal
main();