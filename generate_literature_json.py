"""Generate literature topic JSON from markdown sources.

Currently supports markdown formatted as:
- First non-empty line: title
- Questions: lines starting with "<number>. "
- Answer: subsequent lines until next question
- Optional multiple-choice block inside answer (A)/Б)/...)

Usage:
  python generate_literature_json.py docs/димчо_дебелянов.md data/literature/debelyanov_poetry.json

"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Dict, Any


QUESTION_RE = re.compile(r"^(\d+)\.\s+(.*)\s*$")
CHOICE_RE = re.compile(r"^([А-ГA-D])\)\s+(.*)\s*$")


@dataclass
class ParsedQuestion:
    question_id: str
    question_number: int
    prompt: str
    reference_answer: str
    choices: Optional[List[Dict[str, str]]] = None
    correct_choice: Optional[str] = None


def _normalize_whitespace(text: str) -> str:
    lines = [ln.rstrip() for ln in text.splitlines()]
    # Trim leading/trailing blank lines
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    # Collapse consecutive blank lines
    out: List[str] = []
    blank = False
    for ln in lines:
        if not ln.strip():
            if not blank:
                out.append("")
            blank = True
        else:
            out.append(ln)
            blank = False
    return "\n".join(out).strip()


def parse_markdown(md_text: str) -> Dict[str, Any]:
    lines = md_text.splitlines()

    # Title = first non-empty line
    title = "Литература"
    for ln in lines:
        if ln.strip():
            title = ln.strip()
            break

    questions: List[ParsedQuestion] = []
    current_q_num: Optional[int] = None
    current_prompt: Optional[str] = None
    current_answer_lines: List[str] = []

    def flush():
        nonlocal current_q_num, current_prompt, current_answer_lines
        if current_q_num is None or current_prompt is None:
            return
        answer = _normalize_whitespace("\n".join(current_answer_lines))

        # Attempt to extract multiple-choice options and a correct option marker.
        # We keep full reference answer regardless.
        choices: List[Dict[str, str]] = []
        correct_choice: Optional[str] = None

        for ln in answer.splitlines():
            m = CHOICE_RE.match(ln.strip())
            if m:
                choices.append({"key": m.group(1), "text": m.group(2).strip()})

        # Heuristic for correct choice: look for "Правилен избор" then a letter like "А" / "B"
        m_correct = re.search(r"Правилен\s+избор[^:]*:\s*([А-ГA-D])\)?", answer)
        if m_correct:
            correct_choice = m_correct.group(1)

        q = ParsedQuestion(
            question_id=str(current_q_num),
            question_number=current_q_num,
            prompt=current_prompt.strip(),
            reference_answer=answer,
            choices=choices or None,
            correct_choice=correct_choice,
        )
        questions.append(q)

        current_q_num = None
        current_prompt = None
        current_answer_lines = []

    for ln in lines:
        m = QUESTION_RE.match(ln)
        if m:
            flush()
            current_q_num = int(m.group(1))
            current_prompt = m.group(2).strip()
            current_answer_lines = []
            continue

        if current_q_num is not None:
            current_answer_lines.append(ln)

    flush()

    return {
        "title": title,
        "questions": [
            {
                "id": q.question_id,
                "number": q.question_number,
                "prompt": q.prompt,
                "reference_answer": q.reference_answer,
                "choices": q.choices,
                "correct_choice": q.correct_choice,
            }
            for q in questions
        ],
    }


def main(argv: List[str]) -> int:
    if len(argv) != 3:
        print("Usage: python generate_literature_json.py <input.md> <output.json>")
        return 2

    input_path = Path(argv[1])
    output_path = Path(argv[2])

    md_text = input_path.read_text(encoding="utf-8")
    parsed = parse_markdown(md_text)

    topic_id = output_path.stem
    payload = {
        "topic_id": topic_id,
        "title": parsed["title"],
        "language": "bg",
        "source": str(input_path.as_posix()),
        "questions": parsed["questions"],
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(payload['questions'])} questions to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
