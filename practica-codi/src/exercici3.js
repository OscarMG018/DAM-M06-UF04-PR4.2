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

const DIRECTORIES_TO_ANALIZE = 2000;
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

function findJSON(str) {
    let largestCandidate = "";
    let largestParsed = null;

    // Iterate over every character in the string
    for (let i = 0; i < str.length; i++) {
        // Only consider characters that could be the start of JSON
        if (str[i] !== '{' && str[i] !== '[') continue;

        let stack = [];
        let inString = false;
        let escaped = false;
        
        // Determine the initial expected closing bracket
        stack.push(str[i] === '{' ? '}' : ']');

        // Scan forward from the starting position
        for (let j = i + 1; j < str.length; j++) {
        let char = str[j];

        // If inside a string literal, handle escape sequences and closing quotes
        if (inString) {
            if (escaped) {
            escaped = false;
            } else if (char === '\\') {
            escaped = true;
            } else if (char === '"') {
            inString = false;
            }
            continue;
        } else {
            // Not in a string: check for string start, or opening/closing brackets
            if (char === '"') {
            inString = true;
            } else if (char === '{' || char === '[') {
            stack.push(char === '{' ? '}' : ']');
            } else if (char === '}' || char === ']') {
            if (stack.length === 0 || char !== stack[stack.length - 1]) {
                // Mismatched bracket, so break out of the loop for this candidate
                break;
            }
            stack.pop();
            // When the stack is empty, we have a balanced candidate
            if (stack.length === 0) {
                const candidate = str.slice(i, j + 1);
                try {
                // Try parsing the candidate; if valid, update if it is larger than the current one.
                const parsed = JSON.parse(candidate);
                if (candidate.length > largestCandidate.length) {
                    largestCandidate = candidate;
                    largestParsed = parsed;
                }
                } catch (e) {
                // Ignore parse errors and continue scanning
                }
                // We can break after finding a balanced candidate for this starting point.
                break;
            }
            }
        }
        }
    }
    
    return largestParsed;
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
    console.log("S'analitzaran un maxim de "+ DIRECTORIES_TO_ANALIZE  + " directoris");
    console.log(`S'han trobat ${imageList.length} imatges`);
    const result = [];

    const prompt = "Analitza la imatge proporcionada i identifica l'animal que hi apareix. Retorna únicament la informació en format JSON segons l'estructura següent, sense cap text addicional."
        + `{  
            "analisis": [  
                {  
                    "imatge": {  
                        "nom_fitxer": "nom_del_fitxer.jpg"  
                    },  
                    "analisi": {  
                        "nom_comu": "nom comú de l'animal",  
                        "nom_cientific": "nom científic si és conegut",  
                        "taxonomia": {  
                            "classe": "mamífer/au/rèptil/amfibi/peix",  
                            "ordre": "ordre taxonòmic",  
                            "familia": "família taxonòmica"  
                        },  
                        "habitat": {  
                            "tipus": ["tipus d'hàbitats"],  
                            "regioGeografica": ["regions on viu"],  
                            "clima": ["tipus de climes"]  
                        },  
                        "dieta": {  
                            "tipus": "carnívor/herbívor/omnívor",  
                            "aliments_principals": ["llista d'aliments"]  
                        },  
                        "caracteristiques_fisiques": {  
                            "mida": {  
                                "altura_mitjana_cm": "altura mitjana",  
                                "pes_mitja_kg": "pes mitjà"  
                            },  
                            "colors_predominants": ["colors"],  
                            "trets_distintius": ["característiques"]  
                        },  
                        "estat_conservacio": {  
                            "classificacio_IUCN": "estat",  
                            "amenaces_principals": ["amenaces"]  
                        }  
                    }  
                }  
            ]  
        }`
    const length = imageList.length;
    for (const image of imageList) {
        console.log(`Processant la imatge ${length - imageList.length + 1} de ${length}`);
        try {
            const response = await queryOllama(image.base64String, prompt);
            jsonResponse = findJSON(response)
            if (jsonResponse) {
                result.push(jsonResponse);
            } else {
                console.error(`La resposta retornada no conté JSON: ${response}`);
                result.push({ error: "La resposta retornada no conté JSON" });
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