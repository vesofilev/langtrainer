#!/usr/bin/env python3
"""
Test specific case: without periods in abbreviations
"""
import unicodedata
import re

def normalize_answer(text: str) -> str:
    """Normalize text for comparison"""
    text = ''.join(
        c for c in unicodedata.normalize('NFD', text)
        if unicodedata.category(c) != 'Mn'
    )
    text = text.lower().strip()
    text = text.replace('(', ' ').replace(')', ' ')
    text = text.replace('[', ' ').replace(']', ' ')
    text = text.replace('.', ' ').replace(',', ' ')
    text = text.replace(';', ' ').replace(':', ' ')
    text = text.replace('  ', ' ')
    return ' '.join(text.split())

def check_answer(user_answer: str, correct_answer: str) -> bool:
    normalized_user = normalize_answer(user_answer)
    normalized_correct = normalize_answer(correct_answer)
    
    print(f"User typed:           '{user_answer}'")
    print(f"Correct answer:       '{correct_answer}'")
    print(f"User (normalized):    '{normalized_user}'")
    print(f"Correct (normalized): '{normalized_correct}'")
    print(f"Match: {normalized_user == normalized_correct}")
    
    if normalized_user == normalized_correct:
        return True
    
    variants = re.split(r',\s*(?![^()]*\))', correct_answer)
    correct_variants = [normalize_answer(v) for v in variants]
    return normalized_user in correct_variants

# Test the specific case
print("=" * 70)
print("TEST: User types without periods in abbreviation")
print("=" * 70)
user = "вещ, ценност (в мн ч пари)"
correct = "вещ, ценност (в мн. ч. пари)"
result = check_answer(user, correct)
print(f"\nResult: {'✅ CORRECT - Will work!' if result else '❌ INCORRECT - Will NOT work!'}")
print("=" * 70)
