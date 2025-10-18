# Ancient Greek Language Trainer 🏛️

A web-based vocabulary quiz application for learning Ancient Greek - Bulgarian word pairs.

## Features

- **Two Session Modes**:
  - **Training + Exam**: First learn the words with their translations, then get tested on them
  - **Exam Only**: Jump straight into testing your knowledge
- **Bi-directional Testing**: Practice translating from Ancient Greek to Bulgarian or vice versa
- **Customizable Quizzes**: Choose the number of words (1-50) for each quiz session
- **Immediate Feedback**: Get instant confirmation on your answers with sound effects
- **Smart Matching**: Answer validation handles diacritics and comma-separated alternatives
- **Progress Tracking**: Visual progress bar and live score updates
- **Review Mistakes**: See all incorrect answers with correct translations at the end
- **Audio Feedback**: Pleasant sound effects for correct/incorrect answers
- **Clean UI**: Modern, responsive design that works on desktop and mobile

## Technology Stack

**Backend:**
- FastAPI (Python web framework)
- Pydantic (data validation)
- Uvicorn (ASGI server)

**Frontend:**
- Vanilla HTML/CSS/JavaScript
- No build tools required
- Responsive design

## Installation

1. **Clone or navigate to the project directory**

2. **Install Python dependencies:**

```bash
pip install -r requirements.txt
```

## Running the Application

**Start the server:**

```bash
python app.py
```

Or using uvicorn directly:

```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

**Open your browser:**

Navigate to [http://localhost:8000](http://localhost:8000)

## Usage

1. **Configure Your Session:**
   - Select session mode:
     - **Training + Exam**: Study the words first, then take the test
     - **Exam Only**: Test yourself immediately
   - Select the translation direction (Greek → Bulgarian or Bulgarian → Greek)
   - Choose the number of words you want to practice
   - Click "Start Session"

2. **Training Mode** (if selected):
   - Review each word with its translation
   - Take your time to memorize
   - Press Enter or click "Next Word" to continue
   - Click "Start Exam" when ready (or "Skip to Exam" to skip ahead)

3. **Exam Mode:**
   - Type your answer in the input field
   - Press Enter or click "Submit Answer"
   - Get immediate feedback with sound effects (correct/incorrect with the right answer)
   - Click "Next Question" to continue

4. **Review Results:**
   - See your score percentage and correct/total count
   - Review all incorrect answers with correct translations
   - Start a new session to practice more

## API Documentation

Once the server is running, visit:
- Interactive API docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Alternative docs: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Key Endpoints

- `GET /api/config` - Get available quiz configurations
- `POST /api/quiz` - Start a new quiz session
- `GET /api/quiz/{session_id}/question/{question_index}` - Get question with answer (for training mode)
- `POST /api/quiz/{session_id}/answer` - Submit an answer
- `GET /api/quiz/{session_id}/summary` - Get quiz results

## Data Format

The application uses `data/greek_words_standard.json` with the following structure:

```json
[
    {
        "Лема": "κώνωψ",
        "Превод": "комар"
    },
    {
        "Лема": "λέγω",
        "Превод": "говореше"
    }
]
```

- `Лема` - Ancient Greek lemma (base form)
- `Превод` - Bulgarian translation

## Project Structure

```
LanguageTrainer/
├── app.py                          # FastAPI backend application
├── requirements.txt                # Python dependencies
├── README.md                       # This file
├── data/
│   └── greek_words_standard.json   # Vocabulary data
└── static/
    └── index.html                  # Frontend application
```

## Development

The application uses an in-memory session store. For production deployment, consider:
- Adding session persistence (Redis, database)
- Implementing user authentication
- Adding session expiration/cleanup
- Rate limiting
- HTTPS/SSL configuration

## License

Free to use for educational purposes.

## Contributing

Feel free to submit issues or pull requests for improvements!
