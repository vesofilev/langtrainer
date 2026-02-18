# Ancient Greek Language Trainer 🏛️

A web-based vocabulary quiz application for learning Ancient Greek and Latin vocabulary with Bulgarian translations.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/vesofilev/langtrainer.git
cd langtrainer

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py

# Open http://localhost:8000 in your browser
```

## Features

- **Multiple Languages**:
  - **Ancient Greek** - Learn vocabulary with lesson-based organization (lessons 26-32)
  - **Latin** - Practice Latin phrases and expressions
  - **Spanish** - Practice Spanish phrases and expressions
  - Language switcher to toggle between Greek, Latin and Spanish modes
- **Two Session Modes**:
  - **Training + Exam**: First learn the words with their translations, then get tested on them
  - **Exam Only**: Jump straight into testing your knowledge
- **Bi-directional Testing**: 
  - Greek: Greek ↔ Bulgarian translation practice
  - Latin: Latin ↔ Bulgarian translation practice
  - Mixed mode: Practice both directions in a single quiz (Latin only)
- **Lesson Selection** (Greek only): Choose specific lessons or practice all available words
- **Customizable Quizzes**: Choose the number of words (1-50) for each quiz session
- **Immediate Feedback**: Get instant confirmation on your answers with sound effects
- **Smart Matching**: Answer validation handles diacritics and comma-separated alternatives
- **Progress Tracking**: 
  - Visual progress bar and live score updates
  - Track mastered words and exclude them from future quizzes
  - Persistent progress tracking across sessions
- **Review Mistakes**: See all incorrect answers with correct translations at the end
- **Audio Feedback**: Pleasant sound effects for correct/incorrect answers
- **Timed Questions**: Optional time limits per question with timeout detection
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

### Prerequisites

- **Python 3.9 or higher** - [Download Python](https://www.python.org/downloads/)
- **pip** (usually comes with Python)
- **Git** (optional, for cloning the repository)

### Step-by-Step Installation

#### 1. Get the Code

**Option A: Clone with Git**
```bash
git clone https://github.com/vesofilev/langtrainer.git
cd langtrainer
```

**Option B: Download ZIP**
- Download the repository as a ZIP file
- Extract it to your desired location
- Open a terminal/command prompt in the extracted folder

#### 2. Create a Virtual Environment (Recommended)

This keeps the project dependencies isolated from your system Python.

**On macOS/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

**On Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

You should see `(venv)` appear at the beginning of your terminal prompt.

#### 3. Install Dependencies

With your virtual environment activated:

```bash
pip install -r requirements.txt
```

This will install:
- **FastAPI** - Modern web framework for building APIs
- **Uvicorn** - ASGI server to run the application
- **Pydantic** - Data validation library
- **WeasyPrint** - PDF generation (optional, for vocabulary PDFs)

#### 4. Verify Installation

Check that everything is installed correctly:

```bash
python -c "import fastapi, uvicorn, pydantic; print('✓ All dependencies installed successfully!')"
```

### Troubleshooting Installation

**Issue: `python` command not found**
- Try `python3` instead of `python`
- Ensure Python is added to your PATH

**Issue: `pip` command not found**
- Try `python -m pip` instead of `pip`
- Or `python3 -m pip` on macOS/Linux

**Issue: Permission errors on macOS/Linux**
- Don't use `sudo pip install`
- Use a virtual environment instead (see Step 2)

**Issue: WeasyPrint installation fails**
- WeasyPrint requires additional system libraries
- It's optional and only needed for PDF generation
- The main application will work without it

## Running the Application

### Starting the Server

**Method 1: Using the app.py script (Recommended)**

```bash
python app.py
```

**Method 2: Using uvicorn directly**

```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

The server will start on port 8000. You should see output like:
```
[2025-11-03 10:30:45] ✓ Loaded 500 Greek word pairs
[2025-11-03 10:30:45] ✓ Loaded 245 Latin→Bulgarian phrases
[2025-11-03 10:30:45] ✓ Loaded 245 Bulgarian→Latin phrases
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

## Literature Mode (LLM Grading)

Literature mode grades open-ended answers via OpenAI.

### Configure API key

Set `OPENAI_API_KEY` for the process running the server.

Recommended: create a local `.env` file:

1. Copy [.env.example](.env.example) to `.env`
2. Fill in `OPENAI_API_KEY=...`

The app will automatically load `.env` at startup (via `python-dotenv`).

### Accessing the Application

**Open your browser and navigate to:**
- Main application: [http://localhost:8000](http://localhost:8000)
- API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- Alternative API docs: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Stopping the Server

Press `Ctrl+C` in the terminal where the server is running.

### Running on a Different Port

If port 8000 is already in use:

```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8080
```

Then access the app at [http://localhost:8080](http://localhost:8080)

### Deactivating the Virtual Environment

When you're done working with the application:

```bash
deactivate
```

## Additional Tools

### Generating Vocabulary PDFs

You can generate PDF vocabulary lists for specific lessons:

```bash
# Generate PDF for a single lesson
python generate_vocabulary_pdf.py 26

# Generate PDF for multiple lessons
python generate_vocabulary_pdf.py 26 27

# Generate PDF for sub-lessons
python generate_vocabulary_pdf.py 32.1 32.2
```

This creates a PDF file with a two-column layout showing Greek words and their Bulgarian translations. The output file will be named `vocabulary_lessons_26.pdf`, `vocabulary_lessons_26_27.pdf`, or `vocabulary_lessons_32_1_32_2.pdf` respectively.

**Note:** This requires the WeasyPrint library to be installed.

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

The application uses JSON files for vocabulary data:

### Greek Words (`data/greek_words_standard.json`)

```json
[
    {
        "Лема": "κώνωψ",
        "Превод": "комар",
        "Урок": 26
    },
    {
        "Лема": "λέγω",
        "Превод": "говореше",
        "Урок": 27
    }
]
```

- `Лема` - Ancient Greek lemma (base form)
- `Превод` - Bulgarian translation
- `Урок` - Lesson number (supports both integers like 26, 27 and floats like 32.1, 32.2)

### Latin Phrases

**Latin → Bulgarian (`data/phrases_la_bg.json`)**
```json
[
    {
        "la": "carpe diem",
        "bg": "лови деня"
    }
]
```

**Bulgarian → Latin (`data/phrases_bg_la.json`)**
```json
[
    {
        "la": "veni, vidi, vici",
        "bg": "дойдох, видях, победих"
    }
]
```

### Spanish Phrases

**Spanish (lesson-based, Greek-like format) (`data/spanish_words_standard.json`)**
```json
[
  {
    "Лема": "Hola",
    "Превод": "Здравей",
    "Урок": 1
  }
]
```

## Project Structure

```
LanguageTrainer/
├── app.py                              # FastAPI backend application
├── requirements.txt                    # Python dependencies
├── README.md                           # This file
├── FEATURES.md                         # Detailed feature documentation
├── generate_vocabulary_pdf.py          # PDF generation script for vocabulary lists
├── data/
│   ├── greek_words_standard.json       # Greek vocabulary with lessons
│   ├── greek_words_standard_full.json  # Extended Greek vocabulary
│   ├── greek_words.json                # Additional Greek words
│   ├── phrases_la_bg.json              # Latin → Bulgarian phrases
│   └── phrases_bg_la.json              # Bulgarian → Latin phrases
└── static/
    ├── index.html                      # Main application HTML
    ├── css/
    │   ├── main.css                    # Base styles
    │   ├── components.css              # UI components
    │   ├── screens.css                 # Screen layouts
    │   ├── modals.css                  # Modal dialogs
    │   ├── keyboard.css                # Greek keyboard styles
    │   └── animations.css              # Animations
    └── js/
        ├── app.js                      # Main application logic
        └── greek-keyboard.js           # Virtual Greek keyboard
```

## Development

### Architecture

- **Backend**: FastAPI with in-memory session management
- **Frontend**: Vanilla JavaScript (no framework dependencies)
- **Data Storage**: JSON files for vocabulary data
- **State Management**: Browser localStorage for progress tracking and preferences

### Running Tests

The project includes several test scripts:

```bash
# Test API endpoints
python test_api.py

# Test accent handling
python test_accents.py

# Test answer matching logic
python test_matching.py

# Test timer functionality
python test_timer.py
```

### Development Mode

Run the server with auto-reload for development:

```bash
uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Changes to `app.py` will automatically reload the server.

### Production Considerations

For production deployment, consider:
- **Session Persistence**: Use Redis or database instead of in-memory storage
- **User Authentication**: Add user accounts and authentication
- **Session Expiration**: Implement automatic session cleanup
- **Rate Limiting**: Prevent API abuse
- **HTTPS/SSL**: Configure secure connections
- **Database**: Store vocabulary data in a proper database
- **Caching**: Add response caching for better performance
- **Logging**: Implement proper logging with log rotation
- **Monitoring**: Add health checks and monitoring

## License

Free to use for educational purposes.

## Contributing

Feel free to submit issues or pull requests for improvements!
