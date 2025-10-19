"""
Ancient Greek - Bulgarian Language Trainer Backend
FastAPI application for vocabulary quiz
"""
import json
import random
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional, Any
from uuid import uuid4
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field


# ==================== Models ====================

class Direction:
    GREEK_TO_BULGARIAN = "greek_to_bulgarian"
    BULGARIAN_TO_GREEK = "bulgarian_to_greek"


class WordPair(BaseModel):
    greek: str
    bulgarian: str
    lesson: Optional[int] = None  # Add lesson field


class QuizConfig(BaseModel):
    count: int = Field(default=15, ge=1, le=200)
    direction: str = Field(default=Direction.GREEK_TO_BULGARIAN)
    time_per_question: int = Field(default=60, ge=10, le=300)  # Time in seconds per question (10s to 5min)
    word_pairs: Optional[List[Dict[str, Any]]] = None  # For reusing specific words (with lesson as int)
    selected_lessons: Optional[List[int]] = None  # Selected lesson numbers
    use_all_words: bool = False  # If True, use all available words from selected lessons
    exclude_correct_words: Optional[List[Dict[str, Any]]] = None  # Words already answered correctly (to exclude)


class QuizStartResponse(BaseModel):
    session_id: str
    total_questions: int
    direction: str
    time_per_question: int  # Time limit in seconds
    questions: List[Dict[str, str]]
    word_pairs: List[Dict[str, Any]]  # Return the word pairs used (with lesson as int)


class AnswerRequest(BaseModel):
    question_index: int
    answer: str


class AnswerResponse(BaseModel):
    correct: bool
    user_answer: str
    correct_answer: str
    current_score: float  # Changed to float to support partial credit
    total_answered: int
    partial_credit: bool = False  # True if answer is correct except for accents
    timed_out: bool = False  # True if the answer was submitted after time expired


class QuizSummary(BaseModel):
    session_id: str
    total_questions: int
    correct_count: int
    score_percentage: float
    incorrect_words: List[Dict[str, str]]
    partial_credit_words: List[Dict[str, str]] = []  # Words with accent errors


# ==================== Repository ====================

class WordRepository:
    """Manages word data loading and retrieval"""
    
    def __init__(self, data_path: str = "data/greek_words_standard.json"):
        self.data_path = Path(data_path)
        self.words: List[WordPair] = []
        self.words_with_lessons: List[Dict] = []  # Store full data with lesson info
        self._load_words()
    
    def _load_words(self):
        """Load words from JSON file"""
        if not self.data_path.exists():
            raise FileNotFoundError(f"Data file not found: {self.data_path}")
        
        with open(self.data_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.words_with_lessons = data  # Store complete data
        self.words = [
            WordPair(greek=item["Лема"], bulgarian=item["Превод"], lesson=item.get("Урок"))
            for item in data
        ]
        print(f"✓ Loaded {len(self.words)} word pairs")
    
    def get_available_lessons(self) -> List[int]:
        """Get sorted list of all available lesson numbers"""
        lessons = set(item.get("Урок") for item in self.words_with_lessons if "Урок" in item)
        return sorted(lessons)
    
    def get_words_by_lessons(self, lesson_numbers: List[int]) -> List[WordPair]:
        """Get all words from specific lessons"""
        filtered_items = [
            item for item in self.words_with_lessons
            if item.get("Урок") in lesson_numbers
        ]
        return [
            WordPair(greek=item["Лема"], bulgarian=item["Превод"], lesson=item.get("Урок"))
            for item in filtered_items
        ]
    
    def get_random_pairs(self, count: int, lesson_numbers: Optional[List[int]] = None) -> List[WordPair]:
        """Get random word pairs without replacement, optionally filtered by lessons"""
        if lesson_numbers:
            available_words = self.get_words_by_lessons(lesson_numbers)
        else:
            available_words = self.words
        
        if count > len(available_words):
            count = len(available_words)
        return random.sample(available_words, count)
    
    @staticmethod
    def normalize_with_accents(text: str) -> str:
        """Normalize text but KEEP accents/diacritics (for Greek comparison)"""
        # Convert to lowercase and normalize whitespace
        text = text.lower().strip()
        # Normalize common punctuation variations
        text = text.replace('(', ' ').replace(')', ' ')
        text = text.replace('[', ' ').replace(']', ' ')
        text = text.replace('.', ' ').replace(',', ' ')
        text = text.replace(';', ' ').replace(':', ' ')
        text = text.replace('  ', ' ')  # Double spaces to single
        return ' '.join(text.split())  # Remove all extra whitespace
    
    @staticmethod
    def normalize_answer(text: str) -> str:
        """Normalize text for comparison (case-insensitive, trim, remove extra spaces, punctuation, and accents)"""
        # Remove diacritics for Greek text comparison
        text = ''.join(
            c for c in unicodedata.normalize('NFD', text)
            if unicodedata.category(c) != 'Mn'
        )
        # Convert to lowercase and normalize whitespace
        text = text.lower().strip()
        # Normalize common punctuation variations
        text = text.replace('(', ' ').replace(')', ' ')
        text = text.replace('[', ' ').replace(']', ' ')
        text = text.replace('.', ' ').replace(',', ' ')
        text = text.replace(';', ' ').replace(':', ' ')
        text = text.replace('  ', ' ')  # Double spaces to single
        return ' '.join(text.split())  # Remove all extra whitespace


# ==================== Quiz Session Manager ====================

class QuizSession:
    """Represents an active quiz session"""
    
    def __init__(self, session_id: str, word_pairs: List[WordPair], direction: str, time_per_question: int):
        self.session_id = session_id
        self.word_pairs = word_pairs
        self.direction = direction
        self.time_per_question = time_per_question  # Time limit in seconds
        self.answers: List[Optional[float]] = [None] * len(word_pairs)  # Changed to float for partial credit
        self.user_answers: List[str] = [""] * len(word_pairs)
        self.question_start_times: Dict[int, datetime] = {}  # Track when each question was started
    
    def start_question(self, index: int):
        """Mark the start time for a question"""
        self.question_start_times[index] = datetime.now()
    
    def is_timed_out(self, index: int) -> bool:
        """Check if the time limit has been exceeded for this question"""
        if index not in self.question_start_times:
            return False
        
        elapsed = datetime.now() - self.question_start_times[index]
        return elapsed.total_seconds() > self.time_per_question
    
    def get_question(self, index: int) -> Dict[str, str]:
        """Get question at index"""
        if index >= len(self.word_pairs):
            raise IndexError(f"Question index {index} out of range")
        
        pair = self.word_pairs[index]
        if self.direction == Direction.GREEK_TO_BULGARIAN:
            return {
                "question_id": str(index),
                "prompt": pair.greek,
                "prompt_label": "Ancient Greek"
            }
        else:
            return {
                "question_id": str(index),
                "prompt": pair.bulgarian,
                "prompt_label": "Bulgarian"
            }
    
    def check_answer(self, index: int, user_answer: str) -> tuple[float, bool, bool]:
        """
        Check if answer is correct
        
        For Greek → Bulgarian: Any ONE of the comma-separated Bulgarian variants is acceptable
        For Bulgarian → Greek: User must provide the FULL Greek answer (all variants)
        
        Returns: (score, is_partial_credit, timed_out)
        - score: 1.0 for fully correct, 0.5 for correct except accents, 0.0 for incorrect or timed out
        - is_partial_credit: True if got 0.5 points (accent-only errors)
        - timed_out: True if the time limit was exceeded
        """
        if index >= len(self.word_pairs):
            raise IndexError(f"Question index {index} out of range")
        
        # Check if timed out
        timed_out = self.is_timed_out(index)
        
        pair = self.word_pairs[index]
        correct_answer = pair.bulgarian if self.direction == Direction.GREEK_TO_BULGARIAN else pair.greek
        
        # If timed out, automatically mark as incorrect
        if timed_out:
            self.answers[index] = 0.0
            self.user_answers[index] = user_answer
            return 0.0, False, True
        
        # Normalize both answers (without accents) for basic comparison
        normalized_user = WordRepository.normalize_answer(user_answer)
        normalized_correct = WordRepository.normalize_answer(correct_answer)
        
        # Also normalize WITH accents for accent-aware comparison
        normalized_user_with_accents = WordRepository.normalize_with_accents(user_answer)
        normalized_correct_with_accents = WordRepository.normalize_with_accents(correct_answer)
        
        score = 0.0
        is_partial_credit = False
        
        # Check based on direction
        if self.direction == Direction.GREEK_TO_BULGARIAN:
            # Answering in Bulgarian - ANY ONE variant is acceptable
            import re
            
            # First check exact match WITH accents
            if normalized_user_with_accents == normalized_correct_with_accents:
                score = 1.0
            else:
                # Split by comma OR semicolon (both are used as separators in the data)
                # Pattern: split by comma or semicolon, but not if inside parentheses
                variants_with_accents = re.split(r'[,;]\s*(?![^()]*\))', correct_answer)
                correct_variants_with_accents = [WordRepository.normalize_with_accents(v) for v in variants_with_accents]
                if normalized_user_with_accents in correct_variants_with_accents:
                    score = 1.0
                # If not exact match, check WITHOUT accents
                elif normalized_user == normalized_correct:
                    # Correct except for accents - give partial credit
                    score = 0.5
                    is_partial_credit = True
                else:
                    # Check if user answer matches any variant (comma or semicolon separated) WITHOUT accents
                    variants = re.split(r'[,;]\s*(?![^()]*\))', correct_answer)
                    correct_variants = [WordRepository.normalize_answer(v) for v in variants]
                    if normalized_user in correct_variants:
                        # Correct except for accents - give partial credit
                        score = 0.5
                        is_partial_credit = True
                    else:
                        score = 0.0
        else:
            # Bulgarian → Greek - User must provide FULL answer (all variants)
            # Only accept if the COMPLETE answer matches
            if normalized_user_with_accents == normalized_correct_with_accents:
                score = 1.0
            elif normalized_user == normalized_correct:
                # Correct except for accents - give partial credit
                score = 0.5
                is_partial_credit = True
            else:
                score = 0.0
        
        self.answers[index] = score
        self.user_answers[index] = user_answer
        
        return score, is_partial_credit, False
    
    def get_correct_answer(self, index: int) -> str:
        """Get the correct answer for a question"""
        pair = self.word_pairs[index]
        return pair.bulgarian if self.direction == Direction.GREEK_TO_BULGARIAN else pair.greek
    
    def get_summary(self) -> QuizSummary:
        """Generate quiz summary"""
        # Sum up scores (can be 0, 0.5, or 1.0 per answer)
        total_score = sum(ans for ans in self.answers if ans is not None)
        total = len(self.word_pairs)
        score_percentage = (total_score / total * 100) if total > 0 else 0
        
        # Count fully correct answers (score = 1.0)
        correct_count = sum(1 for ans in self.answers if ans == 1.0)
        
        incorrect_words = []
        partial_credit_words = []
        
        for i, (pair, score) in enumerate(zip(self.word_pairs, self.answers)):
            if self.direction == Direction.GREEK_TO_BULGARIAN:
                word_info = {
                    "prompt": pair.greek,
                    "correct_answer": pair.bulgarian,
                    "user_answer": self.user_answers[i]
                }
            else:
                word_info = {
                    "prompt": pair.bulgarian,
                    "correct_answer": pair.greek,
                    "user_answer": self.user_answers[i]
                }
            
            if score == 0.0:
                incorrect_words.append(word_info)
            elif score == 0.5:
                partial_credit_words.append(word_info)
        
        return QuizSummary(
            session_id=self.session_id,
            total_questions=total,
            correct_count=correct_count,
            score_percentage=round(score_percentage, 1),
            incorrect_words=incorrect_words,
            partial_credit_words=partial_credit_words
        )


class SessionManager:
    """Manages multiple quiz sessions"""
    
    def __init__(self):
        self.sessions: Dict[str, QuizSession] = {}
    
    def create_session(self, word_pairs: List[WordPair], direction: str, time_per_question: int = 60) -> QuizSession:
        """Create a new quiz session"""
        session_id = str(uuid4())
        session = QuizSession(session_id, word_pairs, direction, time_per_question)
        self.sessions[session_id] = session
        return session
    
    def get_session(self, session_id: str) -> QuizSession:
        """Retrieve a session by ID"""
        if session_id not in self.sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        return self.sessions[session_id]
    
    def delete_session(self, session_id: str):
        """Delete a session"""
        if session_id in self.sessions:
            del self.sessions[session_id]


# ==================== FastAPI App ====================

app = FastAPI(
    title="Ancient Greek Language Trainer",
    description="Vocabulary quiz API for Ancient Greek - Bulgarian",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
word_repo = WordRepository()
session_manager = SessionManager()


# ==================== Endpoints ====================

@app.get("/api/config")
async def get_config():
    """Get available configuration options"""
    available_lessons = word_repo.get_available_lessons()
    return {
        "directions": [
            {"value": Direction.GREEK_TO_BULGARIAN, "label": "Ancient Greek → Bulgarian"},
            {"value": Direction.BULGARIAN_TO_GREEK, "label": "Bulgarian → Ancient Greek"}
        ],
        "default_count": 15,
        "min_count": 1,
        "max_count": min(200, len(word_repo.words)),
        "total_words": len(word_repo.words),
        "default_time_per_question": 60,
        "min_time_per_question": 10,
        "max_time_per_question": 300,
        "available_lessons": available_lessons
    }


@app.post("/api/words-count")
async def get_words_count(request: Dict):
    """Get word count for selected lessons"""
    selected_lessons = request.get("selected_lessons", [])
    if selected_lessons is None or len(selected_lessons) == 0:
        return {"count": 0}
    
    words = word_repo.get_words_by_lessons(selected_lessons)
    return {"count": len(words)}


@app.post("/api/quiz", response_model=QuizStartResponse)
async def start_quiz(config: QuizConfig):
    """Start a new quiz session"""
    print(f"[DEBUG] Received config: {config.model_dump()}")
    
    # Validate direction
    if config.direction not in [Direction.GREEK_TO_BULGARIAN, Direction.BULGARIAN_TO_GREEK]:
        raise HTTPException(status_code=400, detail="Invalid direction")
    
    # Get word pairs - either from config (reusing) or randomly selected
    if config.word_pairs:
        # Reuse specific word pairs (for exam after training)
        word_pairs = [
            WordPair(
                greek=wp["greek"], 
                bulgarian=wp["bulgarian"],
                lesson=wp.get("lesson")
            )
            for wp in config.word_pairs
        ]
        # Shuffle the word pairs to present them in a different order than training
        random.shuffle(word_pairs)
    else:
        # Get all available words from selected lessons
        if config.selected_lessons:
            available_words = word_repo.get_words_by_lessons(config.selected_lessons)
        else:
            available_words = word_repo.words
        
        # Filter out words that were already answered correctly
        if config.exclude_correct_words:
            print(f"[DEBUG] Excluding {len(config.exclude_correct_words)} correct words:")
            for i, wp in enumerate(config.exclude_correct_words):
                print(f"  [{i}] {wp['greek']} ↔ {wp['bulgarian']} (lesson {wp.get('lesson', '?')})")
            
            exclude_set = {
                (wp["greek"], wp["bulgarian"]) 
                for wp in config.exclude_correct_words
            }
            available_words = [
                wp for wp in available_words 
                if (wp.greek, wp.bulgarian) not in exclude_set
            ]
            print(f"[DEBUG] After exclusion: {len(available_words)} words available")
        
        # If all words have been mastered (filtered everything out), restart the cycle with all words
        if len(available_words) == 0:
            if config.selected_lessons:
                available_words = word_repo.get_words_by_lessons(config.selected_lessons)
            else:
                available_words = word_repo.words
            print(f"[INFO] All words mastered! Restarting with full word set: {len(available_words)} words")
        
        # Determine word count
        if config.use_all_words:
            word_count = len(available_words)
        else:
            word_count = min(config.count, len(available_words))
        
        # Get random word pairs from filtered available words
        word_pairs = random.sample(available_words, word_count)
    
    # Create session with time limit
    session = session_manager.create_session(word_pairs, config.direction, config.time_per_question)
    
    # Debug logging for quiz start
    print(f"\n[DEBUG] Quiz Started:")
    print(f"  Session ID: {session.session_id}")
    print(f"  Direction: {config.direction}")
    print(f"  Word Count: {len(word_pairs)}")
    print(f"  Time per Question: {config.time_per_question}s")
    if config.selected_lessons:
        print(f"  Selected Lessons: {sorted(config.selected_lessons)}")
    print()
    
    # Start timer for first question
    session.start_question(0)
    
    # Prepare questions
    questions = [session.get_question(i) for i in range(len(word_pairs))]
    
    # Return word pairs in response so they can be reused (including lesson info)
    word_pairs_dict = [
        {"greek": wp.greek, "bulgarian": wp.bulgarian, "lesson": wp.lesson}
        for wp in word_pairs
    ]
    
    return QuizStartResponse(
        session_id=session.session_id,
        total_questions=len(word_pairs),
        direction=config.direction,
        time_per_question=config.time_per_question,
        questions=questions,
        word_pairs=word_pairs_dict
    )


@app.get("/api/quiz/{session_id}/question/{question_index}")
async def get_question_with_answer(session_id: str, question_index: int):
    """Get question with its correct answer (for training mode)"""
    session = session_manager.get_session(session_id)
    
    try:
        question = session.get_question(question_index)
        correct_answer = session.get_correct_answer(question_index)
        
        return {
            **question,
            "correct_answer": correct_answer
        }
    except IndexError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/quiz/{session_id}/answer", response_model=AnswerResponse)
async def submit_answer(session_id: str, answer_req: AnswerRequest):
    """Submit an answer for a question"""
    session = session_manager.get_session(session_id)
    
    try:
        score, is_partial_credit, timed_out = session.check_answer(answer_req.question_index, answer_req.answer)
        correct_answer = session.get_correct_answer(answer_req.question_index)
        
        # Start timer for next question if exists
        next_index = answer_req.question_index + 1
        if next_index < len(session.word_pairs):
            session.start_question(next_index)
        
        # Calculate current score (sum of all scores, which can be 0.0, 0.5, or 1.0)
        answered = [a for a in session.answers if a is not None]
        total_score = sum(answered)
        
        return AnswerResponse(
            correct=(score == 1.0),
            user_answer=answer_req.answer,
            correct_answer=correct_answer,
            current_score=total_score,
            total_answered=len(answered),
            partial_credit=is_partial_credit,
            timed_out=timed_out
        )
    except IndexError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/quiz/{session_id}/summary", response_model=QuizSummary)
async def get_summary(session_id: str):
    """Get quiz summary"""
    session = session_manager.get_session(session_id)
    summary = session.get_summary()
    
    # Debug logging for quiz results
    print(f"\n[DEBUG] Quiz Results for session {session_id}:")
    print(f"  Direction: {session.direction}")
    print(f"  Total Questions: {summary.total_questions}")
    print(f"  Correct Answers: {summary.correct_count}")
    print(f"  Score: {summary.score_percentage}%")
    print(f"  Incorrect: {len(summary.incorrect_words)}")
    print(f"  Partial Credit: {len(summary.partial_credit_words)}")
    
    if summary.incorrect_words:
        print(f"\n  Incorrect Answers:")
        for word in summary.incorrect_words:
            print(f"    - {word['prompt']} → User: '{word['user_answer']}' | Correct: '{word['correct_answer']}'")
    
    if summary.partial_credit_words:
        print(f"\n  Partial Credit Answers:")
        for word in summary.partial_credit_words:
            print(f"    - {word['prompt']} → User: '{word['user_answer']}' | Correct: '{word['correct_answer']}'")
    
    print()  # Empty line for readability
    
    return summary


@app.delete("/api/quiz/{session_id}")
async def delete_quiz(session_id: str):
    """Delete a quiz session"""
    session_manager.delete_session(session_id)
    return {"message": "Session deleted"}


# Serve static files and frontend
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def serve_frontend():
    """Serve the frontend HTML"""
    return FileResponse("static/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
