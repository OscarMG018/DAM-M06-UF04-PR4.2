// Importacions
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Constants
const DATA_SUBFOLDER = 'steamreviews';
const CSV_GAMES_FILE_NAME = 'games.csv';
const CSV_REVIEWS_FILE_NAME = 'reviews.csv';
const MAX_REVIEWS = 10;
const OUTPUT_FILE_NAME = "exercici2_resposta.json";

// Funció per llegir el CSV de forma asíncrona
async function readCSV(filePath) {
    const results = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

// Funció per fer la petició a Ollama amb més detalls d'error
async function analyzeSentiment(text) {
    try {
        console.log('Enviant petició a Ollama...');
        console.log('Model:', process.env.CHAT_API_OLLAMA_MODEL_TEXT);
        
        const response = await fetch(`${process.env.CHAT_API_OLLAMA_URL}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: process.env.CHAT_API_OLLAMA_MODEL_TEXT,
                prompt: `Analyze the sentiment of this text and respond with only one word (positive/negative/neutral): "${text}"`,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Depuració de la resposta
        console.log('Resposta completa d\'Ollama:', JSON.stringify(data, null, 2));
        
        // Verificar si tenim una resposta vàlida
        if (!data || !data.response) {
            throw new Error('La resposta d\'Ollama no té el format esperat');
        }

        return data.response.trim().toLowerCase();
    } catch (error) {
        console.error('Error detallat en la petició a Ollama:', error);
        console.error('Detalls adicionals:', {
            url: `${process.env.CHAT_API_OLLAMA_URL}/generate`,
            model: process.env.CHAT_API_OLLAMA_MODEL_TEXT,
            promptLength: text.length
        });
        return 'error';
    }
}

async function main() {
    try {
        // Obtenim la ruta del directori de dades
        const dataPath = process.env.DATA_PATH;

        // Validem les variables d'entorn necessàries
        if (!dataPath) {
            throw new Error('La variable d\'entorn DATA_PATH no està definida');
        }
        if (!process.env.CHAT_API_OLLAMA_URL) {
            throw new Error('La variable d\'entorn CHAT_API_OLLAMA_URL no està definida');
        }
        if (!process.env.CHAT_API_OLLAMA_MODEL_TEXT) {
            throw new Error('La variable d\'entorn CHAT_API_OLLAMA_MODEL_TEXT no està definida');
        }

        // Construïm les rutes completes als fitxers CSV
        const gamesFilePath = path.join(__dirname, dataPath, DATA_SUBFOLDER, CSV_GAMES_FILE_NAME);
        const reviewsFilePath = path.join(__dirname, dataPath, DATA_SUBFOLDER, CSV_REVIEWS_FILE_NAME);

        // Validem si els fitxers existeixen
        if (!fs.existsSync(gamesFilePath) || !fs.existsSync(reviewsFilePath)) {
            throw new Error('Algun dels fitxers CSV no existeix');
        }

        // Llegim els CSVs
        const games = await readCSV(gamesFilePath);
        const reviews = await readCSV(reviewsFilePath);

        const result = {}
        result.timestamp = new Date().toISOString()
        result.games = []
        //Initialize the result object with all stats at 0
        for (const game of games) {
            result.games.push({
                appid: game.appid,
                name: game.name,
                statistics: {
                    positive: 0,
                    negative: 0,
                    neutral: 0,
                    error: 0
                }
            })
        }
        console.log(`Analitzant les primeres ${MAX_REVIEWS} reviews`)
        iterations = MAX_REVIEWS
        for (let i = 0; i < iterations; i++) {
            if (i >= reviews.length) {
                break
            }
            const review = reviews[i]
            const game = games.find(g => g.appid === review.app_id)
            if (!game) {
                console.error(`No s'ha trobat el joc amb ID ${review.app_id} per la revisió ${review.id}`)
                iterations++
                continue
            }
            const sentiment = await analyzeSentiment(review.content);
            if (sentiment === 'positive') {
                result.games[game.appid - 1].statistics.positive++
            } else if (sentiment === 'negative') {
                result.games[game.appid - 1].statistics.negative++
            } else if (sentiment === 'neutral') {
                result.games[game.appid - 1].statistics.neutral++
            } else {
                result.games[game.appid - 1].statistics.error++
            }
        }

        console.log(JSON.stringify(result, null, 2))
        const outputPath = path.join(__dirname, dataPath, OUTPUT_FILE_NAME);

        fs.writeFile(outputPath, JSON.stringify(result, null, 2), function(err) {
            if (err) {
                console.error("Error writing to file", err);
            } else {
                console.log("JSON exercici2_resposta.json saved to data.json");
            }
        });
     } catch (error) {
        console.error('Error durant l\'execució:', error.message);
    }
}

// Executem la funció principal
main();