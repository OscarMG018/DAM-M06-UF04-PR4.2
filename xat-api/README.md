# xat-api

API per gestionar converses amb models d'Ollama.

## Prerequisits

- Node.js v20 o superior
- Base de dades MySQL (pot ser local o en Docker)
- Una instància d'Ollama amb models instal·lats

## Instal·lació i Configuració

1. Instal·la les dependències:

```bash
npm install
```

2. Configura les variables en el fitxer fitxer `.env`:

```env
# Port on s'executarà l'API
# XAT-API
PORT=3000
NODE_ENV=development # development, production, test

# MySQL
MYSQL_HOST=127.0.0.1
MYSQL_USER=chatuser
MYSQL_PASSWORD=chatpass
MYSQL_DATABASE=chatdb
MYSQL_PORT=3307

# Ollama Server
CHAT_API_OLLAMA_URL=http://127.0.0.1:11434/api
CHAT_API_OLLAMA_MODEL=llama3:latest

# Logging Configuration
LOG_LEVEL=debug                        # error, warn, info, http, verbose, debug, silly
LOG_FILE_PATH=./logs                  # Directori on es guardaran els logs
LOG_MAX_SIZE=20m                      # Mida màxima per fitxer
LOG_MAX_FILES=14d                     # Temps de retenció dels logs
```

4. Verifica que Ollama està funcionant i té models instal·lats:

El servidor i port han de ser el mateixos que els definits a la variable CHAT_API_OLLAMA_URL

```bash
curl http://localhost:11434/api/tags
```

## Executar l'Aplicació

1. Inicia l'aplicació en mode desenvolupament:

```bash
npm run dev
```

2. O en mode producció:

```bash
npm start
```

L'API estarà disponible a `http://localhost:3000` i la documentació Swagger a `http://localhost:3000/api-docs`.

## Verificació de Funcionament

Pots verificar que l'API funciona correctament amb les següents comandes curl:

1. Llistar models disponibles:

```bash
curl http://localhost:3000/api/chat/models
```

2. Crear una nova conversa amb un prompt:

```bash
curl -X POST http://localhost:3000/api/chat/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Hola, com estàs?",
    "model": "llama3:latest"
  }'
```

3. Obtenir una conversa existent (substitueix UUID):

```bash
curl http://localhost:3000/api/chat/conversation/UUID-DE-LA-CONVERSA
```

4. Afegir un prompt a una conversa existent:

```bash
curl -X POST http://localhost:3000/api/chat/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "UUID-DE-LA-CONVERSA",
    "prompt": "Segona pregunta",
    "model": "llama3:latest"
  }'
```

5. Provar streaming (requereix un client que suporti SSE):

```bash
curl -X POST http://localhost:3000/api/chat/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explica'm un conte llarg",
    "model": "llama3:latest",
    "stream": true
  }'
```

## Estructura de Fitxers

Els principals fitxers i directoris són:

```
xat-api/
├── src/
│   ├── config/           # Configuració de la base de dades i Swagger
│   ├── controllers/      # Controladors de l'API
│   ├── middleware/       # Middleware personalitzat
│   ├── models/          # Models de Sequelize
│   └── routes/          # Definició de rutes
├── tests/               # Tests unitaris i d'integració
├── .env                 # Variables d'entorn
├── package.json         # Dependències i scripts
└── server.js           # Punt d'entrada de l'aplicació
```

## Gestió d'Errors

L'API inclou gestió d'errors per:
- Errors de validació d'UUID
- Errors de connexió amb Ollama
- Errors de base de dades
- Errors en el streaming

Els errors retornen respostes JSON amb codis d'estat HTTP apropiats i missatges descriptius.

## Error Handling

The application implements a robust error handling system to provide clear, user-friendly error messages and implement resilience strategies:

### Key Error Handling Features

1. **Centralized Error Handler**
   - All errors are processed through a unified error handling middleware
   - Custom error types with specific HTTP status codes
   - Development vs. production error details

2. **User-Friendly Error Messages**
   - Clear, actionable error messages for end users
   - Technical details hidden in production but logged for debugging
   - Translated error messages in Catalan

3. **Retry Mechanisms**
   - Automatic retries for network-related errors
   - Exponential backoff with jitter to prevent thundering herd
   - Configurable retry counts and delays

4. **Model Validation**
   - Verification of model existence before sending requests to Ollama
   - Cache of available models to improve performance
   - Clear error messages when models are not available

5. **Database Connection Resilience**
   - Retries for temporary database connection issues
   - Graceful degradation when database is unavailable
   - Proper connection pool management

### Testing Error Handling

You can run the model verification test with:

```bash
npm run test-models
```

This will:
- Check if Ollama is available
- List all available models
- Verify if the configured model exists
- Test the error handling for non-existent models

### Common Error Types and Solutions

| Error Type | Description | Solution |
|------------|-------------|----------|
| `model_unavailable` | The requested Ollama model is not available | Check model name or pull the model with `ollama pull <model_name>` |
| `connection_failed` | Cannot connect to Ollama service | Verify Ollama is running and accessible at the configured URL |
| `connection_error` | Database connection error | Check database credentials and ensure MySQL is running |
| `validation_error` | Invalid input data | Check request parameters against API documentation |
| `request_timeout` | Request took too long to process | Try with a smaller prompt or a lighter model |

### Customizing Error Handling

You can adjust error handling behavior through environment variables:

```
# Retry Configuration
MAX_RETRIES=3                # Maximum number of retries for operations
RETRY_DELAY_MS=1000          # Base delay between retries (ms)

# Timeout Configuration
REQUEST_TIMEOUT=30000        # Request timeout in milliseconds
DB_CONNECTION_TIMEOUT=5000   # Database connection timeout
```
