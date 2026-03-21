"""
Language Trainer Backend (Ancient Greek & Latin - Bulgarian)
FastAPI application for vocabulary quiz
"""
import json
import os
import random
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional, Any
from uuid import uuid4
from datetime import datetime, timedelta

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore

try:
    # Optional convenience: load OPENAI_API_KEY (and other settings) from .env
    from dotenv import load_dotenv  # type: ignore

    load_dotenv()
except Exception:  # pragma: no cover
    pass

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
    SPANISH = "spanish"
    LITERATURE = "literature"
    BIOLOGY = "biology"


class Direction:
    GREEK_TO_BULGARIAN = "greek_to_bulgarian"
    BULGARIAN_TO_GREEK = "bulgarian_to_greek"
    LATIN_TO_BULGARIAN = "latin_to_bulgarian"
    BULGARIAN_TO_LATIN = "bulgarian_to_latin"
    LATIN_MIXED = "latin_mixed"  # Combined la->bg and bg->la
    SPANISH_TO_BULGARIAN = "spanish_to_bulgarian"
    BULGARIAN_TO_SPANISH = "bulgarian_to_spanish"
    SPANISH_MIXED = "spanish_mixed"  # Combined es->bg and bg->es
    LITERATURE_QA = "literature_qa"
    BIOLOGY_QA = "biology_qa"


class WordPair(BaseModel):
    greek: Optional[str] = None
    latin: Optional[str] = None
    spanish: Optional[str] = None
    bulgarian: str
    lesson: Optional[float] = None  # Lesson field (only for Greek words) - supports 32.1, 32.2, etc.
    actual_direction: Optional[str] = None  # For mixed mode: tracks actual direction of this specific word
    words: Optional[Dict[str, str]] = None  # Optional vocabulary hints (Latin word -> Bulgarian translation)


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

    # Literature mode
    topic_id: Optional[str] = None


class QuizStartResponse(BaseModel):
    session_id: str
    total_questions: int
    direction: str
    time_per_question: int  # Time limit in seconds
    questions: List[Dict[str, Any]]
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

    # Literature mode (LLM grading)
    score_percent: Optional[int] = None
    notes: Optional[str] = None


class QuizSummary(BaseModel):
    session_id: str
    total_questions: int
    correct_count: int
    score_percentage: float
    incorrect_words: List[Dict[str, Any]]
    partial_credit_words: List[Dict[str, Any]] = []  # Words with accent errors


# ==================== Repository ====================

class WordRepository:
    """Manages word data loading and retrieval for both Greek and Latin"""
    
    def __init__(self, 
                 greek_data_path: str = "data/greek_words_standard.json",
                 latin_la_bg_path: str = "data/phrases_la_bg.json",
                 latin_bg_la_path: str = "data/phrases_bg_la.json",
                 spanish_data_path: str = "data/spanish_words_standard.json",
                 # Legacy Spanish phrase files (no lessons). Kept for backwards compatibility.
                 spanish_es_bg_path: str = "data/phrases_es_bg.json",
                 spanish_bg_es_path: str = "data/phrases_bg_es.json",
                 verse_lessons_config_path: str = "data/verse_lessons.json"):
        self.greek_data_path = Path(greek_data_path)
        self.latin_la_bg_path = Path(latin_la_bg_path)
        self.latin_bg_la_path = Path(latin_bg_la_path)
        self.spanish_data_path = Path(spanish_data_path)
        self.spanish_es_bg_path = Path(spanish_es_bg_path)
        self.spanish_bg_es_path = Path(spanish_bg_es_path)
        self.verse_lessons_config_path = Path(verse_lessons_config_path)
        
        # Greek data
        self.greek_words: List[WordPair] = []
        self.greek_words_with_lessons: List[Dict] = []
        
        # Latin data
        self.latin_la_bg: List[WordPair] = []  # Latin -> Bulgarian
        self.latin_bg_la: List[WordPair] = []  # Bulgarian -> Latin
        self.latin_la_bg_with_lessons: List[Dict] = []  # Raw data with lessons
        self.latin_bg_la_with_lessons: List[Dict] = []  # Raw data with lessons

        # Spanish data (preferred format: like Greek)
        self.spanish_words: List[WordPair] = []
        self.spanish_words_with_lessons: List[Dict] = []

        # Spanish data (legacy format: two files, no lessons)
        self.spanish_es_bg: List[WordPair] = []  # Spanish -> Bulgarian
        self.spanish_bg_es: List[WordPair] = []  # Bulgarian -> Spanish

        # Verse translation config
        self.verse_lessons_config: List[Dict] = []  # [{lesson, title, language_mode, source}, ...]
        
        self._load_all_data()
    
    def _load_all_data(self):
        """Load all language data"""
        self._load_greek_words()
        self._load_latin_phrases()
        self._load_spanish_words()
        self._load_verse_config()

        # Fallback to legacy Spanish phrase files if lesson-based file isn't present.
        if len(self.spanish_words) == 0:
            self._load_spanish_phrases()

    def _load_spanish_words(self):
        """Load Spanish words/phrases in Greek-like lesson-based format."""
        if not self.spanish_data_path.exists():
            print(f"[{get_timestamp()}] ⚠️  Spanish data file not found: {self.spanish_data_path}")
            return

        with open(self.spanish_data_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        self.spanish_words_with_lessons = data
        self.spanish_words = [
            WordPair(spanish=item.get("Лема"), bulgarian=item.get("Превод"), lesson=item.get("Урок"))
            for item in data
            if item.get("Лема") is not None and item.get("Превод") is not None
        ]
        print(f"[{get_timestamp()}] ✓ Loaded {len(self.spanish_words)} Spanish word pairs (lesson-based)")

    def get_spanish_available_lessons(self) -> List[float]:
        """Get sorted list of available lesson numbers (Spanish only)."""
        lessons = set(item.get("Урок") for item in self.spanish_words_with_lessons if "Урок" in item)
        return sorted(lessons)

    def get_spanish_words_by_lessons(self, lesson_numbers: List[float]) -> List[WordPair]:
        """Get Spanish word pairs for specific lessons."""
        filtered_items = [
            item for item in self.spanish_words_with_lessons
            if item.get("Урок") in lesson_numbers
        ]
        return [
            WordPair(spanish=item.get("Лема"), bulgarian=item.get("Превод"), lesson=item.get("Урок"))
            for item in filtered_items
            if item.get("Лема") is not None and item.get("Превод") is not None
        ]
    
    def get_latin_available_lessons(self) -> List[float]:
        """Get sorted list of available lesson numbers for Latin."""
        lessons = set()
        for item in self.latin_la_bg_with_lessons:
            if "Урок" in item:
                lessons.add(item["Урок"])
        for item in self.latin_bg_la_with_lessons:
            if "Урок" in item:
                lessons.add(item["Урок"])
        return sorted(lessons)

    def get_latin_words_by_lessons(self, lesson_numbers: List[float], direction: str = None) -> List[WordPair]:
        """Get Latin word pairs for specific lessons."""
        if direction == Direction.LATIN_TO_BULGARIAN:
            filtered = [item for item in self.latin_la_bg_with_lessons if item.get("Урок") in lesson_numbers]
            return [WordPair(latin=item["la"], bulgarian=item["bg"], lesson=item.get("Урок"), words=item.get("words")) for item in filtered]
        elif direction == Direction.BULGARIAN_TO_LATIN:
            filtered = [item for item in self.latin_bg_la_with_lessons if item.get("Урок") in lesson_numbers]
            return [WordPair(latin=item["la"], bulgarian=item["bg"], lesson=item.get("Урок"), words=item.get("words")) for item in filtered]
        else:
            # Return from both files (for mixed mode or general use)
            la_bg = [WordPair(latin=item["la"], bulgarian=item["bg"], lesson=item.get("Урок"), words=item.get("words")) for item in self.latin_la_bg_with_lessons if item.get("Урок") in lesson_numbers]
            bg_la = [WordPair(latin=item["la"], bulgarian=item["bg"], lesson=item.get("Урок"), words=item.get("words")) for item in self.latin_bg_la_with_lessons if item.get("Урок") in lesson_numbers]
            return la_bg + bg_la

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
            self.latin_la_bg_with_lessons = data
            self.latin_la_bg = [
                WordPair(latin=item["la"], bulgarian=item["bg"], lesson=item.get("Урок"), words=item.get("words"))
                for item in data
            ]
            print(f"[{get_timestamp()}] ✓ Loaded {len(self.latin_la_bg)} Latin→Bulgarian phrases")
        else:
            print(f"[{get_timestamp()}] ⚠️  Latin→Bulgarian data file not found: {self.latin_la_bg_path}")
        
        # Load Bulgarian -> Latin
        if self.latin_bg_la_path.exists():
            with open(self.latin_bg_la_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self.latin_bg_la_with_lessons = data
            self.latin_bg_la = [
                WordPair(latin=item["la"], bulgarian=item["bg"], lesson=item.get("Урок"))
                for item in data
            ]
            print(f"[{get_timestamp()}] ✓ Loaded {len(self.latin_bg_la)} Bulgarian→Latin phrases")
        else:
            print(f"[{get_timestamp()}] ⚠️  Bulgarian→Latin data file not found: {self.latin_bg_la_path}")

    def _load_spanish_phrases(self):
        """Load Spanish phrases from JSON files"""
        # Load Spanish -> Bulgarian
        if self.spanish_es_bg_path.exists():
            with open(self.spanish_es_bg_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self.spanish_es_bg = [
                WordPair(spanish=item.get("es"), bulgarian=item["bg"])
                for item in data
                if item.get("es") is not None and item.get("bg") is not None
            ]
            print(f"[{get_timestamp()}] ✓ Loaded {len(self.spanish_es_bg)} Spanish→Bulgarian phrases")
        else:
            print(f"[{get_timestamp()}] ⚠️  Spanish→Bulgarian data file not found: {self.spanish_es_bg_path}")

        # Load Bulgarian -> Spanish
        if self.spanish_bg_es_path.exists():
            with open(self.spanish_bg_es_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self.spanish_bg_es = [
                WordPair(spanish=item.get("es"), bulgarian=item["bg"])
                for item in data
                if item.get("es") is not None and item.get("bg") is not None
            ]
            print(f"[{get_timestamp()}] ✓ Loaded {len(self.spanish_bg_es)} Bulgarian→Spanish phrases")
        else:
            print(f"[{get_timestamp()}] ⚠️  Bulgarian→Spanish data file not found: {self.spanish_bg_es_path}")

    def _load_verse_config(self):
        """Load verse-translation lesson configuration."""
        if self.verse_lessons_config_path.exists():
            with open(self.verse_lessons_config_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self.verse_lessons_config = data.get("verse_lessons", [])
            print(f"[{get_timestamp()}] ✓ Loaded {len(self.verse_lessons_config)} verse lesson config(s)")
        else:
            print(f"[{get_timestamp()}] ⚠️  Verse lessons config not found: {self.verse_lessons_config_path}")

    def get_verse_lesson_numbers(self) -> List[float]:
        """Return lesson numbers that support verse translation."""
        return [entry["lesson"] for entry in self.verse_lessons_config]

    def get_verse_lesson_info(self, lesson: float) -> Optional[Dict]:
        """Get verse lesson metadata."""
        for entry in self.verse_lessons_config:
            if entry["lesson"] == lesson:
                return entry
        return None

    def get_verse_lines(self, lesson: float) -> List[Dict]:
        """Get all phrase lines for a verse lesson (from la->bg data) preserving order."""
        return [
            item for item in self.latin_la_bg_with_lessons
            if item.get("Урок") == lesson
        ]
    
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
        elif language_mode == LanguageMode.SPANISH:
            # Spanish behaves like Greek: one list, direction determines prompt/answer.
            if len(self.spanish_words) > 0:
                return self.spanish_words

            # Legacy fallback (no lessons)
            if direction == Direction.SPANISH_TO_BULGARIAN:
                return self.spanish_es_bg
            elif direction == Direction.BULGARIAN_TO_SPANISH:
                return self.spanish_bg_es
            elif direction == Direction.SPANISH_MIXED:
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


# ==================== Literature (BG) ====================

LITERATURE_MASTERED_THRESHOLD = 85  # percent
BIOLOGY_MASTERED_THRESHOLD = 85  # percent
CROSS_EXAM_MASTERED_THRESHOLD = 70  # percent — minimum score to consider a cross-exam question "passed"

# ==================== Verse Translation ====================

VERSE_MASTERED_THRESHOLD = 70  # percent – slightly lower since free-form translation is harder


class VerseGroup(BaseModel):
    """A group of consecutive verse lines presented as a single question."""
    group_index: int
    lines_la: List[str]
    lines_bg: List[str]
    words: Optional[List[Dict[str, str]]] = None  # vocabulary hints per line
    start_line: int  # 0-based index in the full verse lesson
    end_line: int    # exclusive


class VerseTranslationGrader:
    """Grades verse translation answers against a gold reference using OpenAI."""

    def __init__(self, model: str = "gpt-5.2"):
        self.model = model

    def _client(self):
        if OpenAI is None:
            raise HTTPException(status_code=500, detail="OpenAI SDK not installed")
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set")
        return OpenAI(api_key=api_key)

    def grade(self, *, latin_text: str, reference_translation: str, student_translation: str) -> tuple[int, str]:
        """Return (score_percent, notes)"""
        client = self._client()

        system = (
            "Ти си строг учител по латински език (на български). "
            "Оцени превода на ученика от латински на български спрямо ЕТАЛОННИЯ превод. "
            "Оценявай: точност на смисъла, пълнота, правилно предадени имена и термини. "
            "Леки стилистични разлики са допустими – важното е смисълът да е предаден вярно. "
            "Върни само валиден JSON с ключове: score_percent (0-100 цяло число) и notes (кратки бележки на български). "
            "Не цитирай дълги пасажи; предпочитай пунктуални указания."
        )

        user = (
            f"ЛАТИНСКИ ТЕКСТ:\n{latin_text}\n\n"
            f"ЕТАЛОНЕН ПРЕВОД (златен стандарт):\n{reference_translation}\n\n"
            f"ПРЕВОД НА УЧЕНИКА:\n{student_translation}\n\n"
            "Оцени точно спрямо еталона."
        )

        resp = client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
        )

        text = getattr(resp, "output_text", None) or ""
        text = text.strip()

        try:
            data = json.loads(text)
            if not isinstance(data, dict):
                score = 0
                notes_obj = data
            else:
                score = int(max(0, min(100, data.get("score_percent", 0))))
                notes_obj = data.get("notes", "")

            if isinstance(notes_obj, list):
                notes = "\n".join(str(x).strip() for x in notes_obj if str(x).strip()).strip()
            elif isinstance(notes_obj, dict):
                notes = json.dumps(notes_obj, ensure_ascii=False, indent=2).strip()
            else:
                notes = str(notes_obj).strip()
            return score, notes
        except Exception:
            return 0, "Грешка при оценяването: неуспешно парсване на отговор от модела."


class VerseTranslationSession:
    """An active verse-translation quiz session."""

    def __init__(self, session_id: str, lesson: float, groups: List[VerseGroup],
                 time_per_question: int, grader: VerseTranslationGrader):
        self.session_id = session_id
        self.lesson = lesson
        self.direction = "verse_translation"
        self.word_pairs = groups  # compatibility with generic session handling
        self.time_per_question = time_per_question
        self.answers: List[Optional[float]] = [None] * len(groups)
        self.user_answers: List[str] = [""] * len(groups)
        self.score_percents: List[Optional[int]] = [None] * len(groups)
        self.notes: List[Optional[str]] = [None] * len(groups)
        self.question_start_times: Dict[int, datetime] = {}
        self._grader = grader

    # --- Timer helpers (same interface as other sessions) ---
    def start_question(self, index: int):
        self.question_start_times[index] = datetime.now()

    def is_timed_out(self, index: int) -> bool:
        if index not in self.question_start_times:
            return False
        elapsed = datetime.now() - self.question_start_times[index]
        return elapsed.total_seconds() > self.time_per_question

    # --- Question / answer ---
    def get_question(self, index: int) -> Dict[str, Any]:
        if index >= len(self.word_pairs):
            raise IndexError(f"Question index {index} out of range")
        g: VerseGroup = self.word_pairs[index]
        return {
            "question_id": str(index),
            "prompt": "\n".join(g.lines_la),
            "prompt_label": "Преведи от латински",
            "question_type": "verse",
            "words": [w for w in (g.words or []) if w],
            "line_count": len(g.lines_la),
        }

    def get_correct_answer(self, index: int) -> str:
        g: VerseGroup = self.word_pairs[index]
        return "\n".join(g.lines_bg)

    def check_answer(self, index: int, user_answer: str) -> tuple[float, bool, bool]:
        if index >= len(self.word_pairs):
            raise IndexError(f"Question index {index} out of range")

        timed_out = self.is_timed_out(index)
        self.user_answers[index] = user_answer

        if timed_out:
            self.answers[index] = 0.0
            self.score_percents[index] = 0
            self.notes[index] = "Времето изтече."
            return 0.0, False, True

        g: VerseGroup = self.word_pairs[index]
        latin_text = "\n".join(g.lines_la)
        reference = "\n".join(g.lines_bg)

        score_percent, notes = self._grader.grade(
            latin_text=latin_text,
            reference_translation=reference,
            student_translation=user_answer,
        )
        self.score_percents[index] = score_percent
        self.notes[index] = notes
        self.answers[index] = score_percent / 100.0
        return self.answers[index] or 0.0, False, False

    def get_summary(self) -> QuizSummary:
        total = len(self.word_pairs)
        total_score = sum(ans for ans in self.answers if ans is not None)
        score_percentage = (total_score / total * 100) if total > 0 else 0

        correct_count = 0
        incorrect_words: List[Dict[str, Any]] = []
        for i, g in enumerate(self.word_pairs):
            sp = self.score_percents[i] if self.score_percents[i] is not None else int((self.answers[i] or 0) * 100)
            if sp >= VERSE_MASTERED_THRESHOLD:
                correct_count += 1
            else:
                incorrect_words.append({
                    "prompt": "\n".join(g.lines_la),
                    "correct_answer": "\n".join(g.lines_bg),
                    "user_answer": self.user_answers[i],
                    "score_percent": sp,
                    "notes": self.notes[i],
                })

        return QuizSummary(
            session_id=self.session_id,
            total_questions=total,
            correct_count=correct_count,
            score_percentage=round(score_percentage, 1),
            incorrect_words=incorrect_words,
            partial_credit_words=[],
        )


class LiteratureChoice(BaseModel):
    key: str
    text: str


class LiteratureQuestion(BaseModel):
    id: str
    number: int
    prompt: str
    reference_answer: str
    choices: Optional[List[LiteratureChoice]] = None
    correct_choice: Optional[str] = None


class LiteratureTopic(BaseModel):
    topic_id: str
    title: str
    language: str = "bg"
    source: Optional[str] = None
    questions: List[LiteratureQuestion]


class LiteratureRepository:
    """Loads literature topics from JSON files under data/literature/*.json"""

    def __init__(self, data_dir: str = "data/literature"):
        self.data_dir = Path(data_dir)
        self.topics: Dict[str, LiteratureTopic] = {}
        self._load_topics()

    def _load_topics(self) -> None:
        if not self.data_dir.exists():
            print(f"[{get_timestamp()}] ⚠️  Literature data dir not found: {self.data_dir}")
            return

        for path in sorted(self.data_dir.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                topic = LiteratureTopic(**payload)
                self.topics[topic.topic_id] = topic
            except Exception as e:
                print(f"[{get_timestamp()}] ⚠️  Failed loading literature topic {path}: {e}")

        if self.topics:
            print(f"[{get_timestamp()}] ✓ Loaded {len(self.topics)} literature topic(s)")

    def list_topics(self) -> List[Dict[str, Any]]:
        return [
            {
                "topic_id": t.topic_id,
                "title": t.title,
                "question_count": len(t.questions),
            }
            for t in self.topics.values()
        ]

    def get_topic(self, topic_id: str) -> LiteratureTopic:
        if topic_id not in self.topics:
            raise HTTPException(status_code=404, detail=f"Unknown literature topic: {topic_id}")
        return self.topics[topic_id]

    def get_question_count(self, topic_id: str) -> int:
        return len(self.get_topic(topic_id).questions)

    def get_questions(self, topic_id: str) -> List[LiteratureQuestion]:
        return list(self.get_topic(topic_id).questions)

    def get_questions_by_ids(self, topic_id: str, question_ids: List[str]) -> List[LiteratureQuestion]:
        topic = self.get_topic(topic_id)
        lookup = {q.id: q for q in topic.questions}
        missing = [qid for qid in question_ids if qid not in lookup]
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown question id(s): {missing}")
        return [lookup[qid] for qid in question_ids]


class BiologyRepository:
    """Loads biology quiz topics and study guides from data/biology/.

    Quiz files:        data/biology/<name>.json          (must NOT end with _study_guide)
    Study guide files: data/biology/<name>_study_guide.json
    """

    def __init__(self, data_dir: str = "data/biology"):
        self.data_dir = Path(data_dir)
        self.topics: Dict[str, LiteratureTopic] = {}
        self.study_guides: Dict[str, Dict] = {}
        self._load_all()

    def _load_all(self) -> None:
        if not self.data_dir.exists():
            print(f"[{get_timestamp()}] ⚠️  Biology data dir not found: {self.data_dir}")
            return

        for path in sorted(self.data_dir.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                if path.stem.endswith("_study_guide"):
                    topic_id = payload.get("topic_id")
                    if topic_id:
                        self.study_guides[topic_id] = payload
                else:
                    topic = LiteratureTopic(**payload)
                    self.topics[topic.topic_id] = topic
            except Exception as e:
                print(f"[{get_timestamp()}] ⚠️  Failed loading biology file {path}: {e}")

        print(f"[{get_timestamp()}] ✓ Loaded {len(self.topics)} biology topic(s) and {len(self.study_guides)} study guide(s)")

    def list_topics(self) -> List[Dict[str, Any]]:
        return [
            {
                "topic_id": t.topic_id,
                "title": t.title,
                "question_count": len(t.questions),
                "has_study_guide": t.topic_id in self.study_guides,
            }
            for t in self.topics.values()
        ]

    def get_topic(self, topic_id: str) -> LiteratureTopic:
        if topic_id not in self.topics:
            raise HTTPException(status_code=404, detail=f"Unknown biology topic: {topic_id}")
        return self.topics[topic_id]

    def get_question_count(self, topic_id: str) -> int:
        return len(self.get_topic(topic_id).questions)

    def get_questions(self, topic_id: str) -> List[LiteratureQuestion]:
        return list(self.get_topic(topic_id).questions)

    def get_questions_by_ids(self, topic_id: str, question_ids: List[str]) -> List[LiteratureQuestion]:
        topic = self.get_topic(topic_id)
        lookup = {q.id: q for q in topic.questions}
        missing = [qid for qid in question_ids if qid not in lookup]
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown question id(s): {missing}")
        return [lookup[qid] for qid in question_ids]

    def get_study_guide(self, topic_id: str) -> Dict:
        if topic_id not in self.study_guides:
            raise HTTPException(status_code=404, detail=f"No study guide found for biology topic: {topic_id}")
        return self.study_guides[topic_id]


class LiteratureOpenAIGrader:
    """Grades open-ended answers against a gold reference using OpenAI Responses API."""

    def __init__(self, model: str = "gpt-5.2"):
        self.model = model

    def _client(self):
        if OpenAI is None:
            raise HTTPException(status_code=500, detail="OpenAI SDK not installed")
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set")
        return OpenAI(api_key=api_key)

    def grade(self, *, question: str, reference_answer: str, student_answer: str) -> tuple[int, str]:
        """Return (score_percent, notes)"""
        client = self._client()

        system = (
            "Ти си строг учител по литература (на български). "
            "Оцени отговора на ученика спрямо ЕТАЛОННИЯ отговор. "
            "Върни само валиден JSON с ключове: score_percent (0-100 цяло число) и notes (кратки бележки на български: какво липсва/какво да се подобри). "
            "Не цитирай дълги пасажи; предпочитай пунктуални указания."
        )

        user = (
            f"ВЪПРОС:\n{question}\n\n"
            f"ЕТАЛОНЕН ОТГОВОР (златен стандарт):\n{reference_answer}\n\n"
            f"ОТГОВОР НА УЧЕНИКА:\n{student_answer}\n\n"
            "Оцени точно спрямо еталона."
        )

        resp = client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
        )

        text = getattr(resp, "output_text", None) or ""
        text = text.strip()

        # Try to parse JSON
        try:
            data = json.loads(text)
            if not isinstance(data, dict):
                # If the model returned a JSON array or other structure, treat it as notes.
                score = 0
                notes_obj = data
            else:
                score = int(max(0, min(100, data.get("score_percent", 0))))
                notes_obj = data.get("notes", "")

            # Normalize notes to a readable string.
            if isinstance(notes_obj, list):
                notes = "\n".join(str(x).strip() for x in notes_obj if str(x).strip()).strip()
            elif isinstance(notes_obj, dict):
                notes = json.dumps(notes_obj, ensure_ascii=False, indent=2).strip()
            else:
                notes = str(notes_obj).strip()
            return score, notes
        except Exception:
            # Fallback: very conservative
            return 0, "Грешка при оценяването: неуспешно парсване на отговор от модела."


class BiologyOpenAIGrader(LiteratureOpenAIGrader):
    """Grades biology open-ended answers with a subject-specific prompt."""

    def grade(self, *, question: str, reference_answer: str, student_answer: str) -> tuple[int, str]:
        client = self._client()

        system = (
            "Ти си строг учител по биология (на български). "
            "Оцени отговора на ученика спрямо ЕТАЛОННИЯ отговор. "
            "Вземи предвид правилното разбиране на биологичните понятия, йерархии и процеси. "
            "Върни само валиден JSON с ключове: score_percent (0-100 цяло число) и notes (кратки бележки на български: какво липсва/какво да се подобри). "
            "Не цитирай дълги пасажи; предпочитай пунктуални указания."
        )

        user = (
            f"ВЪПРОС:\n{question}\n\n"
            f"ЕТАЛОНЕН ОТГОВОР (златен стандарт):\n{reference_answer}\n\n"
            f"ОТГОВОР НА УЧЕНИКА:\n{student_answer}\n\n"
            "Оцени точно спрямо еталона."
        )

        resp = client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
        )

        text = getattr(resp, "output_text", None) or ""
        text = text.strip()
        try:
            data = json.loads(text)
            if not isinstance(data, dict):
                score = 0
                notes_obj = data
            else:
                score = int(max(0, min(100, data.get("score_percent", 0))))
                notes_obj = data.get("notes", "")
            if isinstance(notes_obj, list):
                notes = "\n".join(str(x).strip() for x in notes_obj if str(x).strip()).strip()
            elif isinstance(notes_obj, dict):
                notes = json.dumps(notes_obj, ensure_ascii=False, indent=2).strip()
            else:
                notes = str(notes_obj).strip()
            return score, notes
        except Exception:
            return 0, "Грешка при оценяването: неуспешно парсване на отговор от модела."


class CrossExamSession:
    """Stores state for one cross-examination session (questions generated by LLM from source markdown)."""

    def __init__(self, session_id: str, topic_id: str, questions: List[str], source_content: str):
        self.session_id = session_id
        self.topic_id = topic_id
        self.questions = questions
        self.source_content = source_content  # markdown text used as ground-truth for evaluation
        self.answers: List[Optional[str]] = [None] * len(questions)
        self.scores: List[Optional[int]] = [None] * len(questions)
        self.notes_list: List[Optional[str]] = [None] * len(questions)
        self.created_at: datetime = datetime.now()

    def record_answer(self, idx: int, answer: str, score: int, notes: str) -> None:
        self.answers[idx] = answer
        self.scores[idx] = score
        self.notes_list[idx] = notes

    @property
    def total_answered(self) -> int:
        return sum(1 for a in self.answers if a is not None)

    def get_summary(self) -> Dict:
        answered_indices = [i for i, a in enumerate(self.answers) if a is not None]
        scores_answered = [self.scores[i] for i in answered_indices if self.scores[i] is not None]
        avg_score = round(sum(scores_answered) / len(scores_answered)) if scores_answered else 0
        return {
            "session_id": self.session_id,
            "topic_id": self.topic_id,
            "total_questions": len(self.questions),
            "total_answered": len(answered_indices),
            "average_score": avg_score,
            "questions": [
                {
                    "index": i,
                    "question": self.questions[i],
                    "answer": self.answers[i],
                    "score_percent": self.scores[i],
                    "notes": self.notes_list[i],
                    "passed": (self.scores[i] or 0) >= CROSS_EXAM_MASTERED_THRESHOLD,
                }
                for i in answered_indices
            ],
            "failed_question_indices": [
                i for i in answered_indices
                if (self.scores[i] or 0) < CROSS_EXAM_MASTERED_THRESHOLD
            ],
        }


class CrossExamGenerator:
    """Generates cross-exam questions from a markdown source file and evaluates student answers."""

    def __init__(self, model: str = "gpt-5.2"):
        self.model = model

    def _client(self):
        if OpenAI is None:
            raise HTTPException(status_code=500, detail="OpenAI SDK not installed")
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set")
        return OpenAI(api_key=api_key)

    def load_source(self, source_path: str) -> str:
        """Read markdown source, falling back to appending '.md' if the path has no extension."""
        path = Path(source_path)
        if not path.exists():
            path_md = Path(source_path + ".md")
            if path_md.exists():
                path = path_md
            else:
                raise HTTPException(
                    status_code=404,
                    detail=f"Source file not found: {source_path} (also tried {source_path}.md)"
                )
        return path.read_text(encoding="utf-8")

    def _strip_fences(self, text: str) -> str:
        """Remove markdown code fences from LLM output."""
        text = text.strip()
        if text.startswith("```"):
            parts = text.split("```")
            # parts[0] is empty, parts[1] is the fenced block, possibly starting with 'json\n'
            inner = parts[1]
            if inner.startswith("json"):
                inner = inner[4:]
            text = inner.strip()
        return text

    def generate_questions(self, source_content: str, count: int) -> List[str]:
        """Ask the LLM to produce *count* exam questions for the given markdown lesson."""
        client = self._client()

        system = (
            f"Ти си опитен учител по биология. Задачата ти е да съставиш точно {count} въпроса "
            "за устна проверка на знанията на ученик по дадения урок.\n"
            "Изисквания за въпросите:\n"
            "• Всеки въпрос проверява РАЗЛИЧЕН аспект от урока — без повторения.\n"
            "• Включвай различни нива на мислене: дефиниции, разбиране, сравнение, "
            "приложение, причинно-следствени връзки.\n"
            "• Формулирай ясно и на академичен български.\n"
            "• Избягвай да/не въпроси и въпроси с тривиален едносричен отговор.\n"
            "• НЕ включвай отговорите — само въпросите.\n"
            f"Върни САМО валиден JSON масив от точно {count} низа (въпросите), без никакъв допълнителен текст."
        )

        user = (
            f"СЪДЪРЖАНИЕ НА УРОКА:\n\n{source_content}\n\n"
            f"Състави точно {count} въпроса по горното съдържание."
        )

        resp = client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.7,
        )

        text = self._strip_fences(getattr(resp, "output_text", None) or "")
        try:
            questions = json.loads(text)
            if not isinstance(questions, list):
                raise ValueError("Expected a JSON array")
            result = [str(q).strip() for q in questions if str(q).strip()][:count]
            if not result:
                raise ValueError("Empty question list")
            return result
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to parse generated questions: {exc}. Raw output: {text[:300]}"
            )

    def evaluate_answer(self, source_content: str, question: str, student_answer: str) -> tuple[int, str]:
        """Evaluate a student's answer against the lesson source. Returns (score_percent, notes)."""
        client = self._client()

        system = (
            "Ти си строг, но справедлив учител по биология. "
            "Оценяваш отговора на ученика ЕДИНСТВЕНО спрямо съдържанието на урока — "
            "той е твоят единствен еталон за истина.\n"
            "Критерии за оценка:\n"
            "• Фактическа точност спрямо урока.\n"
            "• Пълнота — покрива ли отговорът основните аспекти на въпроса.\n"
            "• Биологична коректност на използваната терминология.\n"
            "Бъди гъвкав с формулировките — перифразирането е напълно допустимо, "
            "стига съдържанието да е фактически вярно спрямо урока.\n"
            "Върни САМО валиден JSON с два ключа:\n"
            "  \"score_percent\": цяло число 0–100\n"
            "  \"notes\": 2–3 изречения на български — какво е правилно, какво липсва или е неточно"
        )

        user = (
            f"СЪДЪРЖАНИЕ НА УРОКА (единствен еталон за оценяване):\n\n{source_content}\n\n"
            f"ВЪПРОС: {question}\n\n"
            f"ОТГОВОР НА УЧЕНИКА: {student_answer}\n\n"
            "Оцени отговора спрямо урока."
        )

        resp = client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
        )

        text = self._strip_fences(getattr(resp, "output_text", None) or "")
        try:
            data = json.loads(text)
            score = int(max(0, min(100, data.get("score_percent", 0))))
            notes_raw = data.get("notes", "")
            if isinstance(notes_raw, list):
                notes = "\n".join(str(x).strip() for x in notes_raw if str(x).strip())
            else:
                notes = str(notes_raw).strip()
            return score, notes
        except Exception:
            return 0, "Грешка при оценяването: неуспешно парсване на отговора от модела."


class LiteratureSession:
    """Represents an active literature session (topic-based)."""

    def __init__(self, session_id: str, topic_id: str, questions: List[LiteratureQuestion], direction: str, time_per_question: int,
                 grader: LiteratureOpenAIGrader):
        self.session_id = session_id
        self.topic_id = topic_id
        self.word_pairs = questions  # Keep attribute name for endpoint compatibility
        self.direction = direction
        self.time_per_question = time_per_question
        self.answers: List[Optional[float]] = [None] * len(questions)
        self.user_answers: List[str] = [""] * len(questions)
        self.score_percents: List[Optional[int]] = [None] * len(questions)
        self.notes: List[Optional[str]] = [None] * len(questions)
        self.question_start_times: Dict[int, datetime] = {}
        self._grader = grader

    def start_question(self, index: int):
        self.question_start_times[index] = datetime.now()

    def is_timed_out(self, index: int) -> bool:
        if index not in self.question_start_times:
            return False
        elapsed = datetime.now() - self.question_start_times[index]
        return elapsed.total_seconds() > self.time_per_question

    def get_question(self, index: int) -> Dict[str, str]:
        if index >= len(self.word_pairs):
            raise IndexError(f"Question index {index} out of range")
        q = self.word_pairs[index]
        payload: Dict[str, Any] = {
            "question_id": q.id,
            "prompt": q.prompt,
            "prompt_label": "Въпрос",
        }

        if q.choices:
            payload["question_type"] = "mcq"
            payload["choices"] = [c.model_dump() for c in q.choices]
        else:
            payload["question_type"] = "open"

        return payload

    def get_correct_answer(self, index: int) -> str:
        q = self.word_pairs[index]
        return q.reference_answer

    def check_answer(self, index: int, user_answer: str) -> tuple[float, bool, bool]:
        if index >= len(self.word_pairs):
            raise IndexError(f"Question index {index} out of range")

        timed_out = self.is_timed_out(index)
        self.user_answers[index] = user_answer

        if timed_out:
            self.answers[index] = 0.0
            self.score_percents[index] = 0
            self.notes[index] = "Времето изтече."
            return 0.0, False, True

        q = self.word_pairs[index]

        # Multiple choice: deterministic grading
        if q.choices and q.correct_choice:
            given = (user_answer or "").strip().upper()
            correct = q.correct_choice.strip().upper()
            score = 100 if given == correct else 0
            self.score_percents[index] = score
            self.notes[index] = None if score == 100 else f"Правилен избор: {correct}."
            self.answers[index] = score / 100.0
            return self.answers[index] or 0.0, False, False

        # Open-ended: LLM grading
        score_percent, notes = self._grader.grade(
            question=q.prompt,
            reference_answer=q.reference_answer,
            student_answer=user_answer,
        )
        self.score_percents[index] = score_percent
        self.notes[index] = notes
        self.answers[index] = score_percent / 100.0
        return self.answers[index] or 0.0, False, False

    def get_summary(self) -> QuizSummary:
        total = len(self.word_pairs)
        total_score = sum(ans for ans in self.answers if ans is not None)
        score_percentage = (total_score / total * 100) if total > 0 else 0

        # Consider "correct" if above threshold
        correct_count = 0
        incorrect_words: List[Dict[str, Any]] = []
        for i, q in enumerate(self.word_pairs):
            sp = self.score_percents[i] if self.score_percents[i] is not None else int((self.answers[i] or 0) * 100)
            if sp >= LITERATURE_MASTERED_THRESHOLD:
                correct_count += 1
            else:
                incorrect_words.append({
                    "prompt": q.prompt,
                    "correct_answer": q.reference_answer,
                    "user_answer": self.user_answers[i],
                    "score_percent": sp,
                    "notes": self.notes[i],
                })

        return QuizSummary(
            session_id=self.session_id,
            total_questions=total,
            correct_count=correct_count,
            score_percentage=round(score_percentage, 1),
            incorrect_words=incorrect_words,
            partial_credit_words=[],
        )


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
        has_spanish = pair.spanish is not None
        
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
            q = {
                "question_id": str(index),
                "prompt": pair.latin,
                "prompt_label": "Latin"
            }
            if pair.words:
                q["words"] = pair.words
            return q
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
                q = {
                    "question_id": str(index),
                    "prompt": pair.latin,
                    "prompt_label": "Latin"
                }
                if pair.words:
                    q["words"] = pair.words
                return q
            elif pair.actual_direction == Direction.BULGARIAN_TO_LATIN:
                q = {
                    "question_id": str(index),
                    "prompt": pair.bulgarian,
                    "prompt_label": "Bulgarian"
                }
                if pair.words:
                    q["words"] = pair.words
                return q
            else:
                # Fallback to index-based if actual_direction not set (shouldn't happen)
                if index % 2 == 0:
                    q = {
                        "question_id": str(index),
                        "prompt": pair.latin,
                        "prompt_label": "Latin"
                    }
                    if pair.words:
                        q["words"] = pair.words
                    return q
                else:
                    q = {
                        "question_id": str(index),
                        "prompt": pair.bulgarian,
                        "prompt_label": "Bulgarian"
                    }
                    if pair.words:
                        q["words"] = pair.words
                    return q

        # Handle Spanish questions
        elif self.direction == Direction.SPANISH_TO_BULGARIAN and has_spanish:
            return {
                "question_id": str(index),
                "prompt": pair.spanish,
                "prompt_label": "Spanish"
            }
        elif self.direction == Direction.BULGARIAN_TO_SPANISH and has_spanish:
            return {
                "question_id": str(index),
                "prompt": pair.bulgarian,
                "prompt_label": "Bulgarian"
            }
        elif self.direction == Direction.SPANISH_MIXED and has_spanish:
            if pair.actual_direction == Direction.SPANISH_TO_BULGARIAN:
                return {
                    "question_id": str(index),
                    "prompt": pair.spanish,
                    "prompt_label": "Spanish"
                }
            elif pair.actual_direction == Direction.BULGARIAN_TO_SPANISH:
                return {
                    "question_id": str(index),
                    "prompt": pair.bulgarian,
                    "prompt_label": "Bulgarian"
                }
            else:
                if index % 2 == 0:
                    return {
                        "question_id": str(index),
                        "prompt": pair.spanish,
                        "prompt_label": "Spanish"
                    }
                else:
                    return {
                        "question_id": str(index),
                        "prompt": pair.bulgarian,
                        "prompt_label": "Bulgarian"
                    }
        
        # Fallback error
        raise ValueError(
            f"Invalid word pair for direction {self.direction}: greek={pair.greek}, latin={pair.latin}, spanish={pair.spanish}"
        )
    
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
        has_spanish = pair.spanish is not None
        
        # Determine correct answer based on direction and available data
        if self.direction in [Direction.GREEK_TO_BULGARIAN, Direction.LATIN_TO_BULGARIAN, Direction.SPANISH_TO_BULGARIAN]:
            correct_answer = pair.bulgarian
        elif self.direction == Direction.BULGARIAN_TO_GREEK and has_greek:
            correct_answer = pair.greek
        elif self.direction == Direction.BULGARIAN_TO_LATIN and has_latin:
            correct_answer = pair.latin
        elif self.direction == Direction.BULGARIAN_TO_SPANISH and has_spanish:
            correct_answer = pair.spanish
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
        elif self.direction == Direction.SPANISH_MIXED and has_spanish:
            if pair.actual_direction == Direction.SPANISH_TO_BULGARIAN:
                correct_answer = pair.bulgarian  # Spanish -> Bulgarian
            elif pair.actual_direction == Direction.BULGARIAN_TO_SPANISH:
                correct_answer = pair.spanish  # Bulgarian -> Spanish
            else:
                if index % 2 == 0:
                    correct_answer = pair.bulgarian
                else:
                    correct_answer = pair.spanish
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
        if self.direction in [Direction.GREEK_TO_BULGARIAN, Direction.LATIN_TO_BULGARIAN, Direction.SPANISH_TO_BULGARIAN]:
            answering_in_bulgarian = True
        elif self.direction == Direction.LATIN_MIXED:
            # Check actual_direction field
            answering_in_bulgarian = (pair.actual_direction == Direction.LATIN_TO_BULGARIAN)
        elif self.direction == Direction.SPANISH_MIXED:
            answering_in_bulgarian = (pair.actual_direction == Direction.SPANISH_TO_BULGARIAN)
        
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
                # Latin/Spanish: No accent checking, just check variants
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
                # Latin/Spanish: No accent checking
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
        has_spanish = pair.spanish is not None
        
        if self.direction in [Direction.GREEK_TO_BULGARIAN, Direction.LATIN_TO_BULGARIAN, Direction.SPANISH_TO_BULGARIAN]:
            return pair.bulgarian
        elif self.direction == Direction.BULGARIAN_TO_GREEK and has_greek:
            return pair.greek
        elif self.direction == Direction.BULGARIAN_TO_LATIN and has_latin:
            return pair.latin
        elif self.direction == Direction.BULGARIAN_TO_SPANISH and has_spanish:
            return pair.spanish
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
        elif self.direction == Direction.SPANISH_MIXED and has_spanish:
            if pair.actual_direction == Direction.SPANISH_TO_BULGARIAN:
                return pair.bulgarian
            elif pair.actual_direction == Direction.BULGARIAN_TO_SPANISH:
                return pair.spanish
            else:
                if index % 2 == 0:
                    return pair.bulgarian
                else:
                    return pair.spanish
        
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
            has_spanish = pair.spanish is not None
            
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
                if pair.actual_direction == Direction.LATIN_TO_BULGARIAN:
                    prompt = pair.latin
                    correct_ans = pair.bulgarian
                elif pair.actual_direction == Direction.BULGARIAN_TO_LATIN:
                    prompt = pair.bulgarian
                    correct_ans = pair.latin
                else:
                    if i % 2 == 0:
                        prompt = pair.latin
                        correct_ans = pair.bulgarian
                    else:
                        prompt = pair.bulgarian
                        correct_ans = pair.latin
            elif self.direction == Direction.SPANISH_TO_BULGARIAN and has_spanish:
                prompt = pair.spanish
                correct_ans = pair.bulgarian
            elif self.direction == Direction.BULGARIAN_TO_SPANISH and has_spanish:
                prompt = pair.bulgarian
                correct_ans = pair.spanish
            elif self.direction == Direction.SPANISH_MIXED and has_spanish:
                if pair.actual_direction == Direction.SPANISH_TO_BULGARIAN:
                    prompt = pair.spanish
                    correct_ans = pair.bulgarian
                elif pair.actual_direction == Direction.BULGARIAN_TO_SPANISH:
                    prompt = pair.bulgarian
                    correct_ans = pair.spanish
                else:
                    if i % 2 == 0:
                        prompt = pair.spanish
                        correct_ans = pair.bulgarian
                    else:
                        prompt = pair.bulgarian
                        correct_ans = pair.spanish
            
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
        self.sessions: Dict[str, Any] = {}
    
    def create_session(self, word_pairs: List[WordPair], direction: str, time_per_question: int = 60) -> QuizSession:
        """Create a new vocabulary quiz session"""
        session_id = str(uuid4())
        session = QuizSession(session_id, word_pairs, direction, time_per_question)
        self.sessions[session_id] = session
        return session

    def create_literature_session(self, topic_id: str, questions: List[LiteratureQuestion], direction: str,
                                  time_per_question: int, grader: LiteratureOpenAIGrader) -> LiteratureSession:
        """Create a new literature session"""
        session_id = str(uuid4())
        session = LiteratureSession(session_id, topic_id, questions, direction, time_per_question, grader)
        self.sessions[session_id] = session
        return session

    def create_verse_session(self, lesson: float, groups: List[VerseGroup],
                             time_per_question: int, grader: VerseTranslationGrader) -> VerseTranslationSession:
        """Create a new verse translation session"""
        session_id = str(uuid4())
        session = VerseTranslationSession(session_id, lesson, groups, time_per_question, grader)
        self.sessions[session_id] = session
        return session
    
    def get_session(self, session_id: str) -> Any:
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
    title="Language Trainer (Ancient Greek, Latin & Spanish)",
    description="Vocabulary quiz API for Ancient Greek, Latin and Spanish - Bulgarian",
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
literature_repo = LiteratureRepository()
biology_repo = BiologyRepository()
literature_grader = LiteratureOpenAIGrader(model=os.getenv("LITERATURE_GRADING_MODEL", "gpt-5.2"))
biology_grader = BiologyOpenAIGrader(model=os.getenv("BIOLOGY_GRADING_MODEL", os.getenv("LITERATURE_GRADING_MODEL", "gpt-5.2")))
verse_grader = VerseTranslationGrader(model=os.getenv("VERSE_GRADING_MODEL", os.getenv("LITERATURE_GRADING_MODEL", "gpt-5.2")))
cross_exam_generator = CrossExamGenerator(model=os.getenv("CROSS_EXAM_MODEL", os.getenv("BIOLOGY_GRADING_MODEL", os.getenv("LITERATURE_GRADING_MODEL", "gpt-5.2"))))
cross_exam_sessions: Dict[str, CrossExamSession] = {}
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
    elif language_mode == LanguageMode.LATIN:
        available_lessons = word_repo.get_latin_available_lessons()
        total_words = len(word_repo.latin_la_bg) + len(word_repo.latin_bg_la)
        directions = [
            {"value": Direction.LATIN_TO_BULGARIAN, "label": "Latin → Bulgarian"},
            {"value": Direction.BULGARIAN_TO_LATIN, "label": "Bulgarian → Latin"},
            {"value": Direction.LATIN_MIXED, "label": "Mixed (Both Directions)"}
        ]
        has_lessons = bool(available_lessons)
    elif language_mode == LanguageMode.SPANISH:
        if len(word_repo.spanish_words) > 0:
            available_lessons = word_repo.get_spanish_available_lessons()
            total_words = len(word_repo.spanish_words)
            has_lessons = True
        else:
            # Legacy phrase mode (no lessons)
            available_lessons = []
            total_words = len(word_repo.spanish_es_bg) + len(word_repo.spanish_bg_es)
            has_lessons = False
        directions = [
            {"value": Direction.SPANISH_TO_BULGARIAN, "label": "Spanish → Bulgarian"},
            {"value": Direction.BULGARIAN_TO_SPANISH, "label": "Bulgarian → Spanish"},
            {"value": Direction.SPANISH_MIXED, "label": "Mixed (Both Directions)"}
        ]
    elif language_mode == LanguageMode.LITERATURE:
        available_lessons = []
        total_words = 0
        directions = [
            {"value": Direction.LITERATURE_QA, "label": "Въпрос → Отговор"}
        ]
        has_lessons = False
    elif language_mode == LanguageMode.BIOLOGY:
        available_lessons = []
        total_words = 0
        directions = [
            {"value": Direction.BIOLOGY_QA, "label": "Въпрос → Отговор"}
        ]
        has_lessons = False
    else:
        raise HTTPException(status_code=400, detail="Invalid language_mode")
    
    payload: Dict[str, Any] = {
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

    if language_mode == LanguageMode.LITERATURE:
        topics = literature_repo.list_topics()
        payload["topics"] = topics
        payload["default_count"] = 10
        payload["max_count"] = 200
        payload["total_words"] = sum(t["question_count"] for t in topics)

    if language_mode == LanguageMode.BIOLOGY:
        topics = biology_repo.list_topics()
        payload["topics"] = topics
        payload["default_count"] = 10
        payload["max_count"] = 200
        payload["total_words"] = sum(t["question_count"] for t in topics)

    # Include verse-eligible lesson numbers for Latin mode
    if language_mode == LanguageMode.LATIN:
        payload["verse_lessons"] = word_repo.get_verse_lesson_numbers()

    return payload


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
    elif language_mode == LanguageMode.LATIN:
        selected_lessons = request.get("selected_lessons", [])
        direction = request.get("direction", Direction.LATIN_TO_BULGARIAN)
        if selected_lessons:
            words = word_repo.get_latin_words_by_lessons(selected_lessons, direction if direction != Direction.LATIN_MIXED else None)
            return {"count": len(words)}
        if direction == Direction.LATIN_MIXED:
            # For mixed mode, return combined count from both directions
            count = len(word_repo.latin_la_bg) + len(word_repo.latin_bg_la)
            return {"count": count}
        else:
            words = word_repo.get_words_for_language_and_direction(language_mode, direction)
            return {"count": len(words)}
    elif language_mode == LanguageMode.SPANISH:
        # Lesson-based Spanish (preferred)
        if len(word_repo.spanish_words) > 0:
            selected_lessons = request.get("selected_lessons", [])
            if selected_lessons is None or len(selected_lessons) == 0:
                return {"count": 0}
            words = word_repo.get_spanish_words_by_lessons(selected_lessons)
            return {"count": len(words)}

        # Legacy phrase mode (no lessons)
        direction = request.get("direction", Direction.SPANISH_TO_BULGARIAN)
        if direction == Direction.SPANISH_MIXED:
            count = len(word_repo.spanish_es_bg) + len(word_repo.spanish_bg_es)
            return {"count": count}
        words = word_repo.get_words_for_language_and_direction(language_mode, direction)
        return {"count": len(words)}
    elif language_mode == LanguageMode.LITERATURE:
        topic_id = request.get("topic_id")
        if not topic_id:
            raise HTTPException(status_code=400, detail="topic_id is required for literature")
        return {"count": literature_repo.get_question_count(topic_id)}
    elif language_mode == LanguageMode.BIOLOGY:
        topic_id = request.get("topic_id")
        if not topic_id:
            raise HTTPException(status_code=400, detail="topic_id is required for biology")
        return {"count": biology_repo.get_question_count(topic_id)}
    else:
        raise HTTPException(status_code=400, detail="Invalid language_mode")


# ==================== Verse Translation Endpoints ====================

@app.get("/api/verse-config")
async def get_verse_config():
    """Return list of verse-eligible lessons and their metadata."""
    lessons = word_repo.verse_lessons_config
    result = []
    for entry in lessons:
        lesson_num = entry["lesson"]
        lines = word_repo.get_verse_lines(lesson_num)
        result.append({
            "lesson": lesson_num,
            "title": entry.get("title", f"Урок {lesson_num}"),
            "source": entry.get("source", ""),
            "language_mode": entry.get("language_mode", "latin"),
            "line_count": len(lines),
        })
    return {"verse_lessons": result}


@app.post("/api/verse-quiz")
async def start_verse_quiz(request: Dict):
    """Create a verse translation session.

    Expected body:
    {
        "lesson": 10.1,
        "group_size": 4,
        "ordering": "sequential" | "random",
        "time_per_question": 120,
        "skip_training": false
    }
    """
    lesson = request.get("lesson")
    if lesson is None:
        raise HTTPException(status_code=400, detail="lesson is required")
    lesson = float(lesson)

    info = word_repo.get_verse_lesson_info(lesson)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Lesson {lesson} is not a verse lesson")

    group_size = int(request.get("group_size", 4))
    if group_size < 1:
        group_size = 1
    ordering = request.get("ordering", "sequential")  # "sequential" or "random"
    time_per_question = int(request.get("time_per_question", 120))
    skip_training = bool(request.get("skip_training", False))

    # Get all lines for this verse lesson (in order)
    lines = word_repo.get_verse_lines(lesson)
    if not lines:
        raise HTTPException(status_code=404, detail=f"No verse lines found for lesson {lesson}")

    total_lines = len(lines)

    # Build groups
    groups: List[VerseGroup] = []

    if ordering == "random":
        import random as _rand
        # Pick random start indices; allow overlap
        num_groups = max(1, total_lines // group_size)
        for gi in range(num_groups):
            start = _rand.randint(0, max(0, total_lines - group_size))
            end = min(start + group_size, total_lines)
            chunk = lines[start:end]
            groups.append(VerseGroup(
                group_index=gi,
                lines_la=[c["la"] for c in chunk],
                lines_bg=[c["bg"] for c in chunk],
                words=[c.get("words") for c in chunk if c.get("words")],
                start_line=start,
                end_line=end,
            ))
        _rand.shuffle(groups)
    else:
        # Sequential: non-overlapping groups
        gi = 0
        for start in range(0, total_lines, group_size):
            end = min(start + group_size, total_lines)
            chunk = lines[start:end]
            groups.append(VerseGroup(
                group_index=gi,
                lines_la=[c["la"] for c in chunk],
                lines_bg=[c["bg"] for c in chunk],
                words=[c.get("words") for c in chunk if c.get("words")],
                start_line=start,
                end_line=end,
            ))
            gi += 1

    if not groups:
        raise HTTPException(status_code=400, detail="Could not build any groups from verse data")

    session = session_manager.create_verse_session(lesson, groups, time_per_question, verse_grader)

    # Build questions list for the frontend (same shape as regular quiz)
    questions = []
    for i, g in enumerate(groups):
        questions.append(session.get_question(i))

    # Build word_pairs list for frontend progress saving
    word_pairs = []
    for g in groups:
        word_pairs.append({
            "latin": "\n".join(g.lines_la),
            "bulgarian": "\n".join(g.lines_bg),
            "lesson": lesson,
            "actual_direction": "verse_translation",
        })

    return {
        "session_id": session.session_id,
        "questions": questions,
        "total_questions": len(questions),
        "word_pairs": word_pairs,
        "time_per_question": time_per_question,
        "lesson": lesson,
        "title": info.get("title", f"Урок {lesson}"),
        "skip_training": skip_training,
    }


@app.post("/api/quiz", response_model=QuizStartResponse)
async def start_quiz(config: QuizConfig):
    """Start a new quiz session"""
    print(f"[{get_timestamp()}] [DEBUG] Received config: {config.model_dump()}")
    
    # Validate direction
    valid_directions = [
        Direction.GREEK_TO_BULGARIAN, Direction.BULGARIAN_TO_GREEK,
        Direction.LATIN_TO_BULGARIAN, Direction.BULGARIAN_TO_LATIN, Direction.LATIN_MIXED,
        Direction.SPANISH_TO_BULGARIAN, Direction.BULGARIAN_TO_SPANISH, Direction.SPANISH_MIXED,
        Direction.LITERATURE_QA, Direction.BIOLOGY_QA
    ]
    if config.direction not in valid_directions:
        raise HTTPException(status_code=400, detail="Invalid direction")

    # ==================== Literature mode ====================
    if config.language_mode == LanguageMode.LITERATURE:
        if config.direction != Direction.LITERATURE_QA:
            raise HTTPException(status_code=400, detail="Invalid direction for literature")

        topic_id = config.topic_id

        # Reuse question ids (exam after training)
        if config.word_pairs:
            if not topic_id:
                topic_id = config.word_pairs[0].get("topic_id")
            if not topic_id:
                raise HTTPException(status_code=400, detail="topic_id is required for literature")

            question_ids = [wp.get("question_id") for wp in config.word_pairs if wp.get("question_id")]
            if not question_ids:
                raise HTTPException(status_code=400, detail="No question_id provided")

            selected_questions = literature_repo.get_questions_by_ids(topic_id, question_ids)
            if config.random_order:
                random.shuffle(selected_questions)
        else:
            if not topic_id:
                raise HTTPException(status_code=400, detail="topic_id is required for literature")

            available_questions = literature_repo.get_questions(topic_id)

            # Exclude mastered
            if config.exclude_correct_words:
                exclude_ids = {
                    wp.get("question_id")
                    for wp in config.exclude_correct_words
                    if wp.get("question_id")
                }
                available_questions = [q for q in available_questions if q.id not in exclude_ids]

            if len(available_questions) == 0:
                available_questions = literature_repo.get_questions(topic_id)
                print(f"[{get_timestamp()}] [INFO] All questions mastered! Restarting with full question set: {len(available_questions)}")

            if config.use_all_words:
                selected_questions = list(available_questions)
            else:
                count = min(config.count, len(available_questions))
                if config.random_order:
                    selected_questions = random.sample(available_questions, count)
                else:
                    selected_questions = available_questions[:count]

        session = session_manager.create_literature_session(
            topic_id=topic_id,
            questions=selected_questions,
            direction=config.direction,
            time_per_question=config.time_per_question,
            grader=literature_grader,
        )

        print(f"\n[{get_timestamp()}] [DEBUG] Literature Quiz Started:")
        print(f"[{get_timestamp()}]   Session ID: {session.session_id}")
        print(f"[{get_timestamp()}]   Topic: {topic_id}")
        print(f"[{get_timestamp()}]   Questions: {len(selected_questions)}")
        print(f"[{get_timestamp()}]   Time per Question: {config.time_per_question}s\n")

        session.start_question(0)

        questions_payload = [session.get_question(i) for i in range(len(selected_questions))]
        word_pairs_dict = [
            {"topic_id": topic_id, "question_id": q.id}
            for q in selected_questions
        ]

        return QuizStartResponse(
            session_id=session.session_id,
            total_questions=len(selected_questions),
            direction=config.direction,
            time_per_question=config.time_per_question,
            questions=questions_payload,
            word_pairs=word_pairs_dict,
        )
    
    # ==================== Biology mode ====================
    if config.language_mode == LanguageMode.BIOLOGY:
        if config.direction != Direction.BIOLOGY_QA:
            raise HTTPException(status_code=400, detail="Invalid direction for biology")

        topic_id = config.topic_id

        if config.word_pairs:
            if not topic_id:
                topic_id = config.word_pairs[0].get("topic_id")
            if not topic_id:
                raise HTTPException(status_code=400, detail="topic_id is required for biology")

            question_ids = [wp.get("question_id") for wp in config.word_pairs if wp.get("question_id")]
            if not question_ids:
                raise HTTPException(status_code=400, detail="No question_id provided")

            selected_questions = biology_repo.get_questions_by_ids(topic_id, question_ids)
            if config.random_order:
                random.shuffle(selected_questions)
        else:
            if not topic_id:
                raise HTTPException(status_code=400, detail="topic_id is required for biology")

            available_questions = biology_repo.get_questions(topic_id)

            if config.exclude_correct_words:
                exclude_ids = {
                    wp.get("question_id")
                    for wp in config.exclude_correct_words
                    if wp.get("question_id")
                }
                available_questions = [q for q in available_questions if q.id not in exclude_ids]

            if len(available_questions) == 0:
                available_questions = biology_repo.get_questions(topic_id)
                print(f"[{get_timestamp()}] [INFO] All biology questions mastered! Restarting with full set: {len(available_questions)}")

            if config.use_all_words:
                selected_questions = list(available_questions)
            else:
                count = min(config.count, len(available_questions))
                if config.random_order:
                    selected_questions = random.sample(available_questions, count)
                else:
                    selected_questions = available_questions[:count]

        session = session_manager.create_literature_session(
            topic_id=topic_id,
            questions=selected_questions,
            direction=config.direction,
            time_per_question=config.time_per_question,
            grader=biology_grader,
        )

        ids_selected = [q.id for q in selected_questions]
        print(f"\n[{get_timestamp()}] [DEBUG] Biology Quiz Started:")
        print(f"[{get_timestamp()}]   Session ID: {session.session_id}")
        print(f"[{get_timestamp()}]   Topic: {topic_id}")
        print(f"[{get_timestamp()}]   Questions: {len(selected_questions)} | IDs: {ids_selected}")
        if len(ids_selected) != len(set(ids_selected)):
            print(f"[{get_timestamp()}]   *** DUPLICATE QUESTION IDs DETECTED ***")
        print(f"[{get_timestamp()}]   Time per Question: {config.time_per_question}s\n")

        session.start_question(0)

        questions_payload = [session.get_question(i) for i in range(len(selected_questions))]
        word_pairs_dict = [
            {"topic_id": topic_id, "question_id": q.id}
            for q in selected_questions
        ]

        return QuizStartResponse(
            session_id=session.session_id,
            total_questions=len(selected_questions),
            direction=config.direction,
            time_per_question=config.time_per_question,
            questions=questions_payload,
            word_pairs=word_pairs_dict,
        )

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
            elif config.language_mode == LanguageMode.LATIN:
                word_pairs.append(WordPair(
                    latin=wp.get("latin"),
                    bulgarian=wp["bulgarian"],
                    lesson=wp.get("lesson")
                ))
            else:  # Spanish
                word_pairs.append(WordPair(
                    spanish=wp.get("spanish"),
                    bulgarian=wp["bulgarian"],
                    lesson=wp.get("lesson")
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
        elif config.language_mode == LanguageMode.LATIN:
            # For mixed mode, we need to handle word selection differently
            if config.direction == Direction.LATIN_MIXED:
                available_words = None  # handled later
            elif config.selected_lessons:
                available_words = word_repo.get_latin_words_by_lessons(config.selected_lessons, config.direction)
            else:
                available_words = word_repo.get_words_for_language_and_direction(config.language_mode, config.direction)
        else:  # Spanish
            # Preferred: lesson-based Spanish (single list, like Greek)
            if len(word_repo.spanish_words) > 0:
                if config.selected_lessons:
                    available_words = word_repo.get_spanish_words_by_lessons(config.selected_lessons)
                else:
                    available_words = word_repo.spanish_words
            else:
                # Legacy fallback: phrase files
                if config.direction == Direction.SPANISH_MIXED:
                    available_words = None  # handled later (legacy)
                else:
                    available_words = word_repo.get_words_for_language_and_direction(config.language_mode, config.direction)
        
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
            elif config.language_mode == LanguageMode.LATIN:
                exclude_set = {
                    (wp.get("latin"), wp["bulgarian"]) 
                    for wp in config.exclude_correct_words
                }
                available_words = [wp for wp in available_words if (wp.latin, wp.bulgarian) not in exclude_set]
            else:  # Spanish
                exclude_set = {
                    (wp.get("spanish"), wp["bulgarian"]) 
                    for wp in config.exclude_correct_words
                }
                available_words = [wp for wp in available_words if (wp.spanish, wp.bulgarian) not in exclude_set]
            print(f"[{get_timestamp()}] [DEBUG] After exclusion: {len(available_words)} words available")
        
        # If all words have been mastered (filtered everything out), restart the cycle with all words
        if available_words is not None and len(available_words) == 0:
            if config.language_mode == LanguageMode.GREEK:
                if config.selected_lessons:
                    available_words = word_repo.get_words_by_lessons(config.selected_lessons)
                else:
                    available_words = word_repo.greek_words
            elif config.language_mode == LanguageMode.LATIN:
                if config.selected_lessons:
                    available_words = word_repo.get_latin_words_by_lessons(config.selected_lessons, config.direction)
                else:
                    available_words = word_repo.get_words_for_language_and_direction(config.language_mode, config.direction)
            elif config.language_mode == LanguageMode.SPANISH and len(word_repo.spanish_words) > 0:
                if config.selected_lessons:
                    available_words = word_repo.get_spanish_words_by_lessons(config.selected_lessons)
                else:
                    available_words = word_repo.spanish_words
            else:
                available_words = word_repo.get_words_for_language_and_direction(config.language_mode, config.direction)
            print(f"[{get_timestamp()}] [INFO] All words mastered! Restarting with full word set: {len(available_words)} words")
        
        # Special handling for Latin mixed mode
        if config.language_mode == LanguageMode.LATIN and config.direction == Direction.LATIN_MIXED:
            # Get words from both directions separately
            if config.selected_lessons:
                la_bg_words = word_repo.get_latin_words_by_lessons(config.selected_lessons, Direction.LATIN_TO_BULGARIAN)
                bg_la_words = word_repo.get_latin_words_by_lessons(config.selected_lessons, Direction.BULGARIAN_TO_LATIN)
            else:
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
        # Special handling for Spanish mixed mode
        elif config.language_mode == LanguageMode.SPANISH and config.direction == Direction.SPANISH_MIXED:
            # Preferred: lesson-based Spanish uses a single list. We sample once and alternate directions.
            if available_words is not None:
                if config.use_all_words:
                    word_pairs = list(available_words)
                else:
                    word_count = min(config.count, len(available_words))
                    if config.random_order:
                        word_pairs = random.sample(available_words, word_count)
                    else:
                        word_pairs = available_words[:word_count]

                for i, wp in enumerate(word_pairs):
                    wp.actual_direction = Direction.SPANISH_TO_BULGARIAN if i % 2 == 0 else Direction.BULGARIAN_TO_SPANISH

                print(f"[{get_timestamp()}] [DEBUG] Spanish mixed mode (single list): {len(word_pairs)} total")
            else:
                # Legacy: interleave the two separate lists (no lessons)
                es_bg_words = word_repo.spanish_es_bg
                bg_es_words = word_repo.spanish_bg_es

                if config.exclude_correct_words:
                    print(f"[{get_timestamp()}] [DEBUG] Excluding {len(config.exclude_correct_words)} correct words from Spanish mixed mode")
                    exclude_set = {
                        (wp.get("spanish"), wp["bulgarian"]) 
                        for wp in config.exclude_correct_words
                    }
                    es_bg_words = [wp for wp in es_bg_words if (wp.spanish, wp.bulgarian) not in exclude_set]
                    bg_es_words = [wp for wp in bg_es_words if (wp.spanish, wp.bulgarian) not in exclude_set]
                    print(f"[{get_timestamp()}] [DEBUG] After exclusion: {len(es_bg_words)} es→bg, {len(bg_es_words)} bg→es available")

                if len(es_bg_words) == 0:
                    es_bg_words = word_repo.spanish_es_bg
                    print(f"[{get_timestamp()}] [INFO] All es→bg words mastered! Restarting with full set: {len(es_bg_words)} words")
                if len(bg_es_words) == 0:
                    bg_es_words = word_repo.spanish_bg_es
                    print(f"[{get_timestamp()}] [INFO] All bg→es words mastered! Restarting with full set: {len(bg_es_words)} words")

                if config.use_all_words:
                    count_es_bg = len(es_bg_words)
                    count_bg_es = len(bg_es_words)
                else:
                    count_es_bg = config.count // 2
                    count_bg_es = config.count - count_es_bg

                if config.random_order:
                    sampled_es_bg = random.sample(es_bg_words, min(count_es_bg, len(es_bg_words)))
                    sampled_bg_es = random.sample(bg_es_words, min(count_bg_es, len(bg_es_words)))
                else:
                    sampled_es_bg = es_bg_words[:count_es_bg]
                    sampled_bg_es = bg_es_words[:count_bg_es]

                word_pairs = []
                max_len = max(len(sampled_es_bg), len(sampled_bg_es))
                for i in range(max_len):
                    if i < len(sampled_es_bg):
                        wp = sampled_es_bg[i].model_copy()
                        wp.actual_direction = Direction.SPANISH_TO_BULGARIAN
                        word_pairs.append(wp)
                    if i < len(sampled_bg_es):
                        wp = sampled_bg_es[i].model_copy()
                        wp.actual_direction = Direction.BULGARIAN_TO_SPANISH
                        word_pairs.append(wp)

                print(f"[{get_timestamp()}] [DEBUG] Spanish mixed mode (legacy): {len(sampled_es_bg)} es→bg + {len(sampled_bg_es)} bg→es = {len(word_pairs)} total")
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
    if config.selected_lessons and config.language_mode in [LanguageMode.GREEK, LanguageMode.LATIN, LanguageMode.SPANISH]:
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
        elif config.language_mode == LanguageMode.LATIN:
            word_dict = {"latin": wp.latin, "bulgarian": wp.bulgarian, "lesson": wp.lesson}
            if wp.actual_direction:
                word_dict["actual_direction"] = wp.actual_direction
            if wp.words:
                word_dict["words"] = wp.words
            word_pairs_dict.append(word_dict)
        else:  # Spanish
            word_dict = {"spanish": wp.spanish, "bulgarian": wp.bulgarian, "lesson": wp.lesson}
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

        # Literature extra fields (if present)
        score_percent: Optional[int] = None
        notes: Optional[str] = None
        if hasattr(session, "score_percents"):
            try:
                score_percent = session.score_percents[answer_req.question_index]
                notes = session.notes[answer_req.question_index]
            except Exception:
                score_percent = None
                notes = None
        
        # Log the question, student's answer, and result
        if score_percent is not None:
            status = "TIMED OUT" if timed_out else f"SCORE {score_percent}%"
        else:
            status = "TIMED OUT" if timed_out else ("CORRECT" if score == 1.0 else ("PARTIAL CREDIT" if is_partial_credit else "WRONG"))
        print(f"\n[{get_timestamp()}] [STUDENT ANSWER] Session: {session_id[:8]}... | Q{answer_req.question_index + 1}")
        print(f"[{get_timestamp()}]   Question: {question['prompt']}")
        print(f"[{get_timestamp()}]   Student answered: '{answer_req.answer}'")
        print(f"[{get_timestamp()}]   Correct answer: '{correct_answer}'")
        print(f"[{get_timestamp()}]   Status: {status} (score: {score})")
        
        # NOTE: Do NOT start timing for the next question here.
        # The next question should start when it is actually shown to the user.
        
        # Calculate current score (sum of all scores, which can be 0.0, 0.5, or 1.0)
        answered = [a for a in session.answers if a is not None]
        total_score = sum(answered)
        
        # Correctness rule: languages require 1.0; literature/verse uses threshold
        is_graded = score_percent is not None or getattr(session, "topic_id", None) is not None
        if is_graded and score_percent is not None:
            # Verse sessions use a lower threshold than literature
            is_verse = getattr(session, "direction", None) == "verse_translation"
            threshold = VERSE_MASTERED_THRESHOLD if is_verse else LITERATURE_MASTERED_THRESHOLD
            correct_flag = score_percent >= threshold
        else:
            correct_flag = (score == 1.0)

        return AnswerResponse(
            correct=correct_flag,
            user_answer=answer_req.answer,
            correct_answer=correct_answer,
            current_score=total_score,
            total_answered=len(answered),
            partial_credit=is_partial_credit,
            timed_out=timed_out,
            score_percent=score_percent,
            notes=notes,
        )
    except IndexError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/quiz/{session_id}/question/{question_index}/start")
async def start_question_timer(session_id: str, question_index: int):
    """Start the timer for a specific question index.

    This prevents timer desync where the backend starts counting down before the UI shows the next question.
    Safe to call multiple times; it will not reset an already-started question.
    """
    session = session_manager.get_session(session_id)

    # Basic bounds check
    if question_index < 0 or question_index >= len(session.word_pairs):
        raise HTTPException(status_code=400, detail="Invalid question_index")

    # Only set start time once per question (avoid resetting timer by repeated calls)
    if getattr(session, "answers", None) is not None:
        # If question already answered, don't change timing
        try:
            if session.answers[question_index] is not None:
                started_at = session.question_start_times.get(question_index)
                return {
                    "question_index": question_index,
                    "started": started_at is not None,
                    "started_at": started_at.isoformat() if started_at else None,
                    "time_per_question": getattr(session, "time_per_question", 60),
                }
        except Exception:
            pass

    if question_index not in session.question_start_times:
        session.start_question(question_index)

    started_at = session.question_start_times.get(question_index)
    return {
        "question_index": question_index,
        "started": True,
        "started_at": started_at.isoformat() if started_at else None,
        "time_per_question": getattr(session, "time_per_question", 60),
    }


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


# ==================== Biology Cross-Exam Endpoints ====================

class CrossExamStartRequest(BaseModel):
    topic_id: str
    count: int = Field(default=10, ge=3, le=30)


class CrossExamAnswerRequest(BaseModel):
    question_index: int
    answer: str


class CrossExamRetakeRequest(BaseModel):
    session_id: str
    failed_only: bool = False


class CrossExamResumeRequest(BaseModel):
    """Start a new session reusing a saved question list (client-persisted, e.g. from localStorage)."""
    topic_id: str
    questions: List[str]


@app.post("/api/biology/cross-exam/start")
async def start_cross_exam(req: CrossExamStartRequest):
    """Generate fresh cross-exam questions from the lesson's source markdown and start a session."""
    topic = biology_repo.get_topic(req.topic_id)
    if not topic.source:
        raise HTTPException(status_code=400, detail=f"Topic '{req.topic_id}' has no source file configured")

    source_content = cross_exam_generator.load_source(topic.source)
    questions = cross_exam_generator.generate_questions(source_content, req.count)

    session_id = str(uuid4())
    session = CrossExamSession(
        session_id=session_id,
        topic_id=req.topic_id,
        questions=questions,
        source_content=source_content,
    )
    cross_exam_sessions[session_id] = session

    print(f"[{get_timestamp()}] 🔬 Cross-exam started: session={session_id} topic={req.topic_id} questions={len(questions)}")
    return {
        "session_id": session_id,
        "topic_id": req.topic_id,
        "questions": questions,
        "total_questions": len(questions),
    }


@app.post("/api/biology/cross-exam/{session_id}/answer")
async def answer_cross_exam(session_id: str, req: CrossExamAnswerRequest):
    """Submit and evaluate one answer. Returns score and feedback."""
    session = cross_exam_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Cross-exam session not found: {session_id}")

    idx = req.question_index
    if idx < 0 or idx >= len(session.questions):
        raise HTTPException(status_code=400, detail=f"question_index {idx} out of range (0–{len(session.questions)-1})")

    question = session.questions[idx]
    score, notes = cross_exam_generator.evaluate_answer(session.source_content, question, req.answer)
    session.record_answer(idx, req.answer, score, notes)

    print(f"[{get_timestamp()}] 🔬 Cross-exam answer: session={session_id} q={idx} score={score}%")
    return {
        "question_index": idx,
        "question": question,
        "score_percent": score,
        "notes": notes,
        "passed": score >= CROSS_EXAM_MASTERED_THRESHOLD,
        "total_answered": session.total_answered,
    }


@app.get("/api/biology/cross-exam/{session_id}/summary")
async def get_cross_exam_summary(session_id: str):
    """Return the full summary for a cross-exam session."""
    session = cross_exam_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Cross-exam session not found: {session_id}")
    return session.get_summary()


@app.post("/api/biology/cross-exam/retake")
async def retake_cross_exam(req: CrossExamRetakeRequest):
    """Create a new session reusing the same questions (or just failed ones) from a previous session."""
    original = cross_exam_sessions.get(req.session_id)
    if not original:
        raise HTTPException(status_code=404, detail=f"Original cross-exam session not found: {req.session_id}")

    if req.failed_only:
        failed_indices = [
            i for i, a in enumerate(original.answers)
            if a is not None and (original.scores[i] or 0) < CROSS_EXAM_MASTERED_THRESHOLD
        ]
        if not failed_indices:
            raise HTTPException(status_code=400, detail="No failed questions to retake — all answers passed!")
        questions = [original.questions[i] for i in failed_indices]
    else:
        questions = list(original.questions)

    session_id = str(uuid4())
    session = CrossExamSession(
        session_id=session_id,
        topic_id=original.topic_id,
        questions=questions,
        source_content=original.source_content,
    )
    cross_exam_sessions[session_id] = session

    print(f"[{get_timestamp()}] 🔬 Cross-exam retake: session={session_id} from={req.session_id} failed_only={req.failed_only} questions={len(questions)}")
    return {
        "session_id": session_id,
        "topic_id": session.topic_id,
        "questions": questions,
        "total_questions": len(questions),
    }


@app.post("/api/biology/cross-exam/resume")
async def resume_cross_exam(req: CrossExamResumeRequest):
    """Create a new session from a client-saved question list (e.g. restored from localStorage after a page refresh)."""
    topic = biology_repo.get_topic(req.topic_id)
    if not topic.source:
        raise HTTPException(status_code=400, detail=f"Topic '{req.topic_id}' has no source file configured")

    questions = [q.strip() for q in req.questions if q.strip()]
    if not questions:
        raise HTTPException(status_code=400, detail="No questions provided")

    source_content = cross_exam_generator.load_source(topic.source)

    session_id = str(uuid4())
    session = CrossExamSession(
        session_id=session_id,
        topic_id=req.topic_id,
        questions=questions,
        source_content=source_content,
    )
    cross_exam_sessions[session_id] = session

    print(f"[{get_timestamp()}] 🔬 Cross-exam resume: session={session_id} topic={req.topic_id} questions={len(questions)}")
    return {
        "session_id": session_id,
        "topic_id": req.topic_id,
        "questions": questions,
        "total_questions": len(questions),
    }


# ==================== Biology Study Guide Endpoint ====================

@app.get("/api/biology/study-guide/{topic_id}")
async def get_biology_study_guide(topic_id: str):
    """Return the structured study guide for a biology topic."""
    return biology_repo.get_study_guide(topic_id)


# Serve static files and frontend
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def serve_frontend():
    """Serve the frontend HTML"""
    return FileResponse("static/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
