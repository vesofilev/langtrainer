"""
Language Trainer Backend (Ancient Greek & Latin - Bulgarian)
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


# ==================== Helper Functions ====================

def get_timestamp():
    """Get current timestamp in readable format"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ==================== Models ====================

class LanguageMode:
    GREEK = "greek"
    LATIN = "latin"


class Direction:
    GREEK_TO_BULGARIAN = "greek_to_bulgarian"
    BULGARIAN_TO_GREEK = "bulgarian_to_greek"
    LATIN_TO_BULGARIAN = "latin_to_bulgarian"
    BULGARIAN_TO_LATIN = "bulgarian_to_latin"
    LATIN_MIXED = "latin_mixed"  # Combined la->bg and bg->la


class WordPair(BaseModel):
    greek: Optional[str] = None
    latin: Optional[str] = None
    bulgarian: str
    lesson: Optional[float] = None  # Lesson field (only for Greek words) - supports 32.1, 32.2, etc.
    actual_direction: Optional[str] = None  # For mixed mode: tracks actual direction of this specific word


class QuizConfig(BaseModel):
    count: int = Field(default=15, ge=1, le=200)
    direction: str = Field(default=Direction.GREEK_TO_BULGARIAN)
    language_mode: str = Field(default=LanguageMode.GREEK)  # "greek" or "latin"
    time_per_question: int = Field(default=60, ge=10, le=300)  # Time in seconds per question (10s to 5min)
    word_pairs: Optional[List[Dict[str, Any]]] = None  # For reusing specific words (with lesson as int)
    selected_lessons: Optional[List[float]] = None  # Selected lesson numbers (only for Greek) - supports 32.1, 32.2, etc.
    use_all_words: bool = False  # If True, use all available words from selected lessons
    exclude_correct_words: Optional[List[Dict[str, Any]]] = None  # Words already answered correctly (to exclude)
    random_order: bool = True  # If True, randomize word order; if False, use sequential order


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
    """Manages word data loading and retrieval for both Greek and Latin"""
    
    def __init__(self, 
                 greek_data_path: str = "data/greek_words_standard.json",
                 latin_la_bg_path: str = "data/phrases_la_bg.json",
                 latin_bg_la_path: str = "data/phrases_bg_la.json"):
        self.greek_data_path = Path(greek_data_path)
        self.latin_la_bg_path = Path(latin_la_bg_path)
        self.latin_bg_la_path = Path(latin_bg_la_path)
        
        # Greek data
        self.greek_words: List[WordPair] = []
        self.greek_words_with_lessons: List[Dict] = []
        
        # Latin data
        self.latin_la_bg: List[WordPair] = []  # Latin -> Bulgarian
        self.latin_bg_la: List[WordPair] = []  # Bulgarian -> Latin
        
        self._load_all_data()
    
    def _load_all_data(self):
        """Load all language data"""
        self._load_greek_words()
        self._load_latin_phrases()
    
    def _load_greek_words(self):
        """Load Greek words from JSON file"""
        if not self.greek_data_path.exists():
            print(f"[{get_timestamp()}] ⚠️  Greek data file not found: {self.greek_data_path}")
            return
        
        with open(self.greek_data_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self.greek_words_with_lessons = data  # Store complete data
        self.greek_words = [
            WordPair(greek=item["Лема"], bulgarian=item["Превод"], lesson=item.get("Урок"))
            for item in data
        ]
        print(f"[{get_timestamp()}] ✓ Loaded {len(self.greek_words)} Greek word pairs")
    
    def _load_latin_phrases(self):
        """Load Latin phrases from JSON files"""
        # Load Latin -> Bulgarian
        if self.latin_la_bg_path.exists():
            with open(self.latin_la_bg_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self.latin_la_bg = [
                WordPair(latin=item["la"], bulgarian=item["bg"])
                for item in data
            ]
            print(f"[{get_timestamp()}] ✓ Loaded {len(self.latin_la_bg)} Latin→Bulgarian phrases")
        else:
            print(f"[{get_timestamp()}] ⚠️  Latin→Bulgarian data file not found: {self.latin_la_bg_path}")
        
        # Load Bulgarian -> Latin
        if self.latin_bg_la_path.exists():
            with open(self.latin_bg_la_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self.latin_bg_la = [
                WordPair(latin=item["la"], bulgarian=item["bg"])
                for item in data
            ]
            print(f"[{get_timestamp()}] ✓ Loaded {len(self.latin_bg_la)} Bulgarian→Latin phrases")
        else:
            print(f"[{get_timestamp()}] ⚠️  Bulgarian→Latin data file not found: {self.latin_bg_la_path}")
    
    def get_words_for_language_and_direction(self, language_mode: str, direction: str) -> List[WordPair]:
        """Get words based on language mode and direction"""
        if language_mode == LanguageMode.GREEK:
            return self.greek_words
        elif language_mode == LanguageMode.LATIN:
            if direction == Direction.LATIN_TO_BULGARIAN:
                return self.latin_la_bg
            elif direction == Direction.BULGARIAN_TO_LATIN:
                return self.latin_bg_la
            elif direction == Direction.LATIN_MIXED:
                # For mixed mode, return empty list - it's handled specially in start_quiz
                # This prevents accidental combining of both lists
                return []
        return []
    
    def get_available_lessons(self) -> List[float]:
        """Get sorted list of all available lesson numbers (Greek only)"""
        lessons = set(item.get("Урок") for item in self.greek_words_with_lessons if "Урок" in item)
        return sorted(lessons)
    
    def get_words_by_lessons(self, lesson_numbers: List[float]) -> List[WordPair]:
        """Get all words from specific lessons (Greek only) - supports both int (26, 27) and float (32.1, 32.2)"""
        filtered_items = [
            item for item in self.greek_words_with_lessons
            if item.get("Урок") in lesson_numbers
        ]
        return [
            WordPair(greek=item["Лема"], bulgarian=item["Превод"], lesson=item.get("Урок"))
            for item in filtered_items
        ]
    
    def get_random_pairs(self, count: int, language_mode: str = LanguageMode.GREEK, 
                        direction: str = Direction.GREEK_TO_BULGARIAN,
                        lesson_numbers: Optional[List[float]] = None) -> List[WordPair]:
        """Get random word pairs without replacement"""
        if language_mode == LanguageMode.GREEK:
            if lesson_numbers:
                available_words = self.get_words_by_lessons(lesson_numbers)
            else:
                available_words = self.greek_words
        else:  # Latin
            available_words = self.get_words_for_language_and_direction(language_mode, direction)
        
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
        
        # Auto-detect language based on which field is populated
        has_greek = pair.greek is not None
        has_latin = pair.latin is not None
        
        # Handle Greek questions
        if self.direction == Direction.GREEK_TO_BULGARIAN and has_greek:
            return {
                "question_id": str(index),
                "prompt": pair.greek,
                "prompt_label": "Ancient Greek"
            }
        elif self.direction == Direction.BULGARIAN_TO_GREEK and has_greek:
            return {
                "question_id": str(index),
                "prompt": pair.bulgarian,
                "prompt_label": "Bulgarian"
            }
        # Handle Latin questions
        elif self.direction == Direction.LATIN_TO_BULGARIAN and has_latin:
            return {
                "question_id": str(index),
                "prompt": pair.latin,
                "prompt_label": "Latin"
            }
        elif self.direction == Direction.BULGARIAN_TO_LATIN and has_latin:
            return {
                "question_id": str(index),
                "prompt": pair.bulgarian,
                "prompt_label": "Bulgarian"
            }
        elif self.direction == Direction.LATIN_MIXED and has_latin:
            # For mixed mode, use the actual_direction field set during interleaving
            # This handles uneven list lengths correctly
            if pair.actual_direction == Direction.LATIN_TO_BULGARIAN:
                return {
                    "question_id": str(index),
                    "prompt": pair.latin,
                    "prompt_label": "Latin"
                }
            elif pair.actual_direction == Direction.BULGARIAN_TO_LATIN:
                return {
                    "question_id": str(index),
                    "prompt": pair.bulgarian,
                    "prompt_label": "Bulgarian"
                }
            else:
                # Fallback to index-based if actual_direction not set (shouldn't happen)
                if index % 2 == 0:
                    return {
                        "question_id": str(index),
                        "prompt": pair.latin,
                        "prompt_label": "Latin"
                    }
                else:
                    return {
                        "question_id": str(index),
                        "prompt": pair.bulgarian,
                        "prompt_label": "Bulgarian"
                    }
        
        # Fallback error
        raise ValueError(f"Invalid word pair for direction {self.direction}: greek={pair.greek}, latin={pair.latin}")
    
    def check_answer(self, index: int, user_answer: str) -> tuple[float, bool, bool]:
        """
        Check if answer is correct
        
        For Greek → Bulgarian / Latin → Bulgarian: Any ONE of the comma-separated Bulgarian variants is acceptable
        For Bulgarian → Greek / Bulgarian → Latin: User must provide the FULL answer (all variants)
        
        Returns: (score, is_partial_credit, timed_out)
        - score: 1.0 for fully correct, 0.5 for correct except accents (Greek only), 0.0 for incorrect or timed out
        - is_partial_credit: True if got 0.5 points (accent-only errors)
        - timed_out: True if the time limit was exceeded
        """
        if index >= len(self.word_pairs):
            raise IndexError(f"Question index {index} out of range")
        
        # Check if timed out
        timed_out = self.is_timed_out(index)
        
        pair = self.word_pairs[index]
        
        # Auto-detect language based on which field is populated
        has_greek = pair.greek is not None
        has_latin = pair.latin is not None
        
        # Determine correct answer based on direction and available data
        if self.direction in [Direction.GREEK_TO_BULGARIAN, Direction.LATIN_TO_BULGARIAN]:
            correct_answer = pair.bulgarian
        elif self.direction == Direction.BULGARIAN_TO_GREEK and has_greek:
            correct_answer = pair.greek
        elif self.direction == Direction.BULGARIAN_TO_LATIN and has_latin:
            correct_answer = pair.latin
        elif self.direction == Direction.LATIN_MIXED and has_latin:
            # In mixed mode, use the actual_direction field
            if pair.actual_direction == Direction.LATIN_TO_BULGARIAN:
                correct_answer = pair.bulgarian  # Latin -> Bulgarian
            elif pair.actual_direction == Direction.BULGARIAN_TO_LATIN:
                correct_answer = pair.latin  # Bulgarian -> Latin
            else:
                # Fallback to index-based if actual_direction not set
                if index % 2 == 0:
                    correct_answer = pair.bulgarian  # Latin -> Bulgarian
                else:
                    correct_answer = pair.latin  # Bulgarian -> Latin
        else:
            raise ValueError(f"Cannot determine correct answer for direction {self.direction}")
        
        # If timed out, automatically mark as incorrect
        if timed_out:
            self.answers[index] = 0.0
            self.user_answers[index] = user_answer
            return 0.0, False, True
        
        # Normalize both answers (without accents) for basic comparison
        normalized_user = WordRepository.normalize_answer(user_answer)
        normalized_correct = WordRepository.normalize_answer(correct_answer)
        
        # Also normalize WITH accents for accent-aware comparison (only for Greek)
        is_greek_direction = has_greek and self.direction in [Direction.GREEK_TO_BULGARIAN, Direction.BULGARIAN_TO_GREEK]
        
        if is_greek_direction:
            normalized_user_with_accents = WordRepository.normalize_with_accents(user_answer)
            normalized_correct_with_accents = WordRepository.normalize_with_accents(correct_answer)
        
        score = 0.0
        is_partial_credit = False
        
        # Determine if we're answering in Bulgarian (any variant acceptable) or foreign language (full answer required)
        answering_in_bulgarian = False
        if self.direction in [Direction.GREEK_TO_BULGARIAN, Direction.LATIN_TO_BULGARIAN]:
            answering_in_bulgarian = True
        elif self.direction == Direction.LATIN_MIXED:
            # Check actual_direction field
            answering_in_bulgarian = (pair.actual_direction == Direction.LATIN_TO_BULGARIAN)
        
        # Check based on direction type
        if answering_in_bulgarian:
            # Answering in Bulgarian - ANY ONE variant is acceptable
            import re
            
            if is_greek_direction:
                # Greek: Check with accents first
                if normalized_user_with_accents == normalized_correct_with_accents:
                    score = 1.0
                else:
                    # Split by comma OR semicolon
                    variants_with_accents = re.split(r'[,;]\s*(?![^()]*\))', correct_answer)
                    correct_variants_with_accents = [WordRepository.normalize_with_accents(v) for v in variants_with_accents]
                    if normalized_user_with_accents in correct_variants_with_accents:
                        score = 1.0
                    # If not exact match, check WITHOUT accents
                    elif normalized_user == normalized_correct:
                        score = 0.5
                        is_partial_credit = True
                    else:
                        variants = re.split(r'[,;]\s*(?![^()]*\))', correct_answer)
                        correct_variants = [WordRepository.normalize_answer(v) for v in variants]
                        if normalized_user in correct_variants:
                            score = 0.5
                            is_partial_credit = True
                        else:
                            score = 0.0
            else:
                # Latin: No accent checking, just check variants
                if normalized_user == normalized_correct:
                    score = 1.0
                else:
                    variants = re.split(r'[,;]\s*(?![^()]*\))', correct_answer)
                    correct_variants = [WordRepository.normalize_answer(v) for v in variants]
                    if normalized_user in correct_variants:
                        score = 1.0
                    else:
                        score = 0.0
        else:
            # Bulgarian → Greek/Latin - User must provide FULL answer
            if is_greek_direction:
                if normalized_user_with_accents == normalized_correct_with_accents:
                    score = 1.0
                elif normalized_user == normalized_correct:
                    score = 0.5
                    is_partial_credit = True
                else:
                    score = 0.0
            else:
                # Latin: No accent checking
                if normalized_user == normalized_correct:
                    score = 1.0
                else:
                    score = 0.0
        
        self.answers[index] = score
        self.user_answers[index] = user_answer
        
        return score, is_partial_credit, False
    
    def get_correct_answer(self, index: int) -> str:
        """Get the correct answer for a question"""
        pair = self.word_pairs[index]
        
        # Auto-detect language based on which field is populated
        has_greek = pair.greek is not None
        has_latin = pair.latin is not None
        
        if self.direction in [Direction.GREEK_TO_BULGARIAN, Direction.LATIN_TO_BULGARIAN]:
            return pair.bulgarian
        elif self.direction == Direction.BULGARIAN_TO_GREEK and has_greek:
            return pair.greek
        elif self.direction == Direction.BULGARIAN_TO_LATIN and has_latin:
            return pair.latin
        elif self.direction == Direction.LATIN_MIXED and has_latin:
            # Use actual_direction field
            if pair.actual_direction == Direction.LATIN_TO_BULGARIAN:
                return pair.bulgarian  # Latin -> Bulgarian
            elif pair.actual_direction == Direction.BULGARIAN_TO_LATIN:
                return pair.latin  # Bulgarian -> Latin
            else:
                # Fallback to index-based if actual_direction not set
                if index % 2 == 0:
                    return pair.bulgarian  # Latin -> Bulgarian
                else:
                    return pair.latin  # Bulgarian -> Latin
        
        raise ValueError(f"Cannot determine correct answer for direction {self.direction}")
    
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
            # Auto-detect language based on which field is populated
            has_greek = pair.greek is not None
            has_latin = pair.latin is not None
            
            # Determine prompt and correct answer based on direction and available data
            if self.direction == Direction.GREEK_TO_BULGARIAN and has_greek:
                prompt = pair.greek
                correct_ans = pair.bulgarian
            elif self.direction == Direction.BULGARIAN_TO_GREEK and has_greek:
                prompt = pair.bulgarian
                correct_ans = pair.greek
            elif self.direction == Direction.LATIN_TO_BULGARIAN and has_latin:
                prompt = pair.latin
                correct_ans = pair.bulgarian
            elif self.direction == Direction.BULGARIAN_TO_LATIN and has_latin:
                prompt = pair.bulgarian
                correct_ans = pair.latin
            elif self.direction == Direction.LATIN_MIXED and has_latin:
                if i % 2 == 0:
                    prompt = pair.latin
                    correct_ans = pair.bulgarian
                else:
                    prompt = pair.bulgarian
                    correct_ans = pair.latin
            
            word_info = {
                "prompt": prompt,
                "correct_answer": correct_ans,
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
    title="Language Trainer (Ancient Greek & Latin)",
    description="Vocabulary quiz API for Ancient Greek and Latin - Bulgarian",
    version="2.0.0"
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
async def get_config(language_mode: str = LanguageMode.GREEK):
    """Get available configuration options based on language mode"""
    
    if language_mode == LanguageMode.GREEK:
        available_lessons = word_repo.get_available_lessons()
        total_words = len(word_repo.greek_words)
        directions = [
            {"value": Direction.GREEK_TO_BULGARIAN, "label": "Ancient Greek → Bulgarian"},
            {"value": Direction.BULGARIAN_TO_GREEK, "label": "Bulgarian → Ancient Greek"}
        ]
        has_lessons = True
    else:  # Latin
        available_lessons = []
        total_words = len(word_repo.latin_la_bg) + len(word_repo.latin_bg_la)
        directions = [
            {"value": Direction.LATIN_TO_BULGARIAN, "label": "Latin → Bulgarian"},
            {"value": Direction.BULGARIAN_TO_LATIN, "label": "Bulgarian → Latin"},
            {"value": Direction.LATIN_MIXED, "label": "Mixed (Both Directions)"}
        ]
        has_lessons = False
    
    return {
        "language_mode": language_mode,
        "directions": directions,
        "default_count": 15,
        "min_count": 1,
        "max_count": min(200, total_words),
        "total_words": total_words,
        "default_time_per_question": 60,
        "min_time_per_question": 10,
        "max_time_per_question": 300,
        "available_lessons": available_lessons,
        "has_lessons": has_lessons
    }


@app.post("/api/words-count")
async def get_words_count(request: Dict):
    """Get word count for selected lessons or language mode"""
    language_mode = request.get("language_mode", LanguageMode.GREEK)
    
    if language_mode == LanguageMode.GREEK:
        selected_lessons = request.get("selected_lessons", [])
        if selected_lessons is None or len(selected_lessons) == 0:
            return {"count": 0}
        words = word_repo.get_words_by_lessons(selected_lessons)
        return {"count": len(words)}
    else:  # Latin
        direction = request.get("direction", Direction.LATIN_TO_BULGARIAN)
        if direction == Direction.LATIN_MIXED:
            # For mixed mode, return combined count from both directions
            count = len(word_repo.latin_la_bg) + len(word_repo.latin_bg_la)
            return {"count": count}
        else:
            words = word_repo.get_words_for_language_and_direction(language_mode, direction)
            return {"count": len(words)}


@app.post("/api/quiz", response_model=QuizStartResponse)
async def start_quiz(config: QuizConfig):
    """Start a new quiz session"""
    print(f"[{get_timestamp()}] [DEBUG] Received config: {config.model_dump()}")
    
    # Validate direction
    valid_directions = [
        Direction.GREEK_TO_BULGARIAN, Direction.BULGARIAN_TO_GREEK,
        Direction.LATIN_TO_BULGARIAN, Direction.BULGARIAN_TO_LATIN, Direction.LATIN_MIXED
    ]
    if config.direction not in valid_directions:
        raise HTTPException(status_code=400, detail="Invalid direction")
    
    # Get word pairs - either from config (reusing) or randomly selected
    if config.word_pairs:
        # Reuse specific word pairs (for exam after training)
        word_pairs = []
        for wp in config.word_pairs:
            if config.language_mode == LanguageMode.GREEK:
                word_pairs.append(WordPair(
                    greek=wp.get("greek"), 
                    bulgarian=wp["bulgarian"],
                    lesson=wp.get("lesson")
                ))
            else:  # Latin
                word_pairs.append(WordPair(
                    latin=wp.get("latin"),
                    bulgarian=wp["bulgarian"]
                ))
        # Shuffle the word pairs to present them in a different order than training (if random order is enabled)
        if config.random_order:
            random.shuffle(word_pairs)
    else:
        # Get all available words based on language mode
        if config.language_mode == LanguageMode.GREEK:
            if config.selected_lessons:
                available_words = word_repo.get_words_by_lessons(config.selected_lessons)
            else:
                available_words = word_repo.greek_words
        else:  # Latin
            # For mixed mode, we need to handle word selection differently
            if config.direction == Direction.LATIN_MIXED:
                # Don't combine lists yet - we'll handle them separately
                available_words = None  # Will be handled later
            else:
                available_words = word_repo.get_words_for_language_and_direction(
                    config.language_mode, config.direction
                )
        
        # Filter out words that were already answered correctly
        if config.exclude_correct_words and available_words is not None:
            print(f"[{get_timestamp()}] [DEBUG] Excluding {len(config.exclude_correct_words)} correct words")
            
            if config.language_mode == LanguageMode.GREEK:
                exclude_set = {
                    (wp.get("greek"), wp["bulgarian"]) 
                    for wp in config.exclude_correct_words
                }
                available_words = [
                    wp for wp in available_words 
                    if (wp.greek, wp.bulgarian) not in exclude_set
                ]
            else:  # Latin
                exclude_set = {
                    (wp.get("latin"), wp["bulgarian"]) 
                    for wp in config.exclude_correct_words
                }
                available_words = [
                    wp for wp in available_words 
                    if (wp.latin, wp.bulgarian) not in exclude_set
                ]
            print(f"[{get_timestamp()}] [DEBUG] After exclusion: {len(available_words)} words available")
        
        # If all words have been mastered (filtered everything out), restart the cycle with all words
        if available_words is not None and len(available_words) == 0:
            if config.language_mode == LanguageMode.GREEK:
                if config.selected_lessons:
                    available_words = word_repo.get_words_by_lessons(config.selected_lessons)
                else:
                    available_words = word_repo.greek_words
            else:  # Latin (non-mixed)
                available_words = word_repo.get_words_for_language_and_direction(
                    config.language_mode, config.direction
                )
            print(f"[{get_timestamp()}] [INFO] All words mastered! Restarting with full word set: {len(available_words)} words")
        
        # Special handling for Latin mixed mode
        if config.language_mode == LanguageMode.LATIN and config.direction == Direction.LATIN_MIXED:
            # Get words from both directions separately
            la_bg_words = word_repo.latin_la_bg
            bg_la_words = word_repo.latin_bg_la
            
            # Filter out correctly answered words if requested
            if config.exclude_correct_words:
                print(f"[{get_timestamp()}] [DEBUG] Excluding {len(config.exclude_correct_words)} correct words from mixed mode")
                exclude_set = {
                    (wp.get("latin"), wp["bulgarian"]) 
                    for wp in config.exclude_correct_words
                }
                la_bg_words = [
                    wp for wp in la_bg_words 
                    if (wp.latin, wp.bulgarian) not in exclude_set
                ]
                bg_la_words = [
                    wp for wp in bg_la_words 
                    if (wp.latin, wp.bulgarian) not in exclude_set
                ]
                print(f"[{get_timestamp()}] [DEBUG] After exclusion: {len(la_bg_words)} la→bg, {len(bg_la_words)} bg→la available")
            
            # If all words mastered in one or both directions, restart with full lists
            if len(la_bg_words) == 0:
                la_bg_words = word_repo.latin_la_bg
                print(f"[{get_timestamp()}] [INFO] All la→bg words mastered! Restarting with full set: {len(la_bg_words)} words")
            if len(bg_la_words) == 0:
                bg_la_words = word_repo.latin_bg_la
                print(f"[{get_timestamp()}] [INFO] All bg→la words mastered! Restarting with full set: {len(bg_la_words)} words")
            
            # Determine how many words we need from each direction
            if config.use_all_words:
                # Use all words from both lists, interleaved
                count_la_bg = len(la_bg_words)
                count_bg_la = len(bg_la_words)
            else:
                # Split the requested count evenly between both directions
                count_la_bg = config.count // 2
                count_bg_la = config.count - count_la_bg  # Remaining (handles odd numbers)
            
            # Sample from each list - random or sequential based on config
            if config.random_order:
                sampled_la_bg = random.sample(la_bg_words, min(count_la_bg, len(la_bg_words)))
                sampled_bg_la = random.sample(bg_la_words, min(count_bg_la, len(bg_la_words)))
            else:
                sampled_la_bg = la_bg_words[:count_la_bg]
                sampled_bg_la = bg_la_words[:count_bg_la]
            
            # Interleave the two lists: la→bg, bg→la, la→bg, bg→la, ...
            # Mark each word with its actual direction so frontend knows how to save progress
            word_pairs = []
            max_len = max(len(sampled_la_bg), len(sampled_bg_la))
            for i in range(max_len):
                if i < len(sampled_la_bg):
                    wp = sampled_la_bg[i].model_copy()
                    wp.actual_direction = Direction.LATIN_TO_BULGARIAN
                    word_pairs.append(wp)
                if i < len(sampled_bg_la):
                    wp = sampled_bg_la[i].model_copy()
                    wp.actual_direction = Direction.BULGARIAN_TO_LATIN
                    word_pairs.append(wp)
            
            print(f"[{get_timestamp()}] [DEBUG] Mixed mode: {len(sampled_la_bg)} la→bg + {len(sampled_bg_la)} bg→la = {len(word_pairs)} total")
        else:
            # Determine word count
            if config.use_all_words:
                word_count = len(available_words)
            else:
                word_count = min(config.count, len(available_words))
            
            # Get word pairs - random or sequential based on config
            if config.random_order:
                word_pairs = random.sample(available_words, word_count)
            else:
                word_pairs = available_words[:word_count]
    
    # Create session with time limit
    session = session_manager.create_session(word_pairs, config.direction, config.time_per_question)
    
    # Debug logging for quiz start
    print(f"\n[{get_timestamp()}] [DEBUG] Quiz Started:")
    print(f"[{get_timestamp()}]   Session ID: {session.session_id}")
    print(f"[{get_timestamp()}]   Language Mode: {config.language_mode}")
    print(f"[{get_timestamp()}]   Direction: {config.direction}")
    print(f"[{get_timestamp()}]   Word Count: {len(word_pairs)}")
    print(f"[{get_timestamp()}]   Time per Question: {config.time_per_question}s")
    if config.selected_lessons and config.language_mode == LanguageMode.GREEK:
        print(f"[{get_timestamp()}]   Selected Lessons: {sorted(config.selected_lessons)}")
    print()
    
    # Start timer for first question
    session.start_question(0)
    
    # Prepare questions
    questions = [session.get_question(i) for i in range(len(word_pairs))]
    
    # Return word pairs in response so they can be reused
    word_pairs_dict = []
    for wp in word_pairs:
        if config.language_mode == LanguageMode.GREEK:
            word_pairs_dict.append({
                "greek": wp.greek, 
                "bulgarian": wp.bulgarian, 
                "lesson": wp.lesson
            })
        else:  # Latin
            word_dict = {
                "latin": wp.latin,
                "bulgarian": wp.bulgarian
            }
            # Include actual_direction for mixed mode
            if wp.actual_direction:
                word_dict["actual_direction"] = wp.actual_direction
            word_pairs_dict.append(word_dict)
    
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
        # Get the question being asked
        question = session.get_question(answer_req.question_index)
        
        score, is_partial_credit, timed_out = session.check_answer(answer_req.question_index, answer_req.answer)
        correct_answer = session.get_correct_answer(answer_req.question_index)
        
        # Log the question, student's answer, and result
        status = "TIMED OUT" if timed_out else ("CORRECT" if score == 1.0 else ("PARTIAL CREDIT" if is_partial_credit else "WRONG"))
        print(f"\n[{get_timestamp()}] [STUDENT ANSWER] Session: {session_id[:8]}... | Q{answer_req.question_index + 1}")
        print(f"[{get_timestamp()}]   Question: {question['prompt']}")
        print(f"[{get_timestamp()}]   Student answered: '{answer_req.answer}'")
        print(f"[{get_timestamp()}]   Correct answer: '{correct_answer}'")
        print(f"[{get_timestamp()}]   Status: {status} (score: {score})")
        
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
    print(f"\n[{get_timestamp()}] [DEBUG] Quiz Results for session {session_id}:")
    print(f"[{get_timestamp()}]   Direction: {session.direction}")
    print(f"[{get_timestamp()}]   Total Questions: {summary.total_questions}")
    print(f"[{get_timestamp()}]   Correct Answers: {summary.correct_count}")
    print(f"[{get_timestamp()}]   Score: {summary.score_percentage}%")
    print(f"[{get_timestamp()}]   Incorrect: {len(summary.incorrect_words)}")
    print(f"[{get_timestamp()}]   Partial Credit: {len(summary.partial_credit_words)}")
    
    if summary.incorrect_words:
        print(f"\n[{get_timestamp()}]   Incorrect Answers:")
        for word in summary.incorrect_words:
            print(f"[{get_timestamp()}]     - {word['prompt']} → User: '{word['user_answer']}' | Correct: '{word['correct_answer']}'")
    
    if summary.partial_credit_words:
        print(f"\n[{get_timestamp()}]   Partial Credit Answers:")
        for word in summary.partial_credit_words:
            print(f"[{get_timestamp()}]     - {word['prompt']} → User: '{word['user_answer']}' | Correct: '{word['correct_answer']}'")
    
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
