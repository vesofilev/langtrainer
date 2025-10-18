#!/usr/bin/env python3
"""
Test answer matching improvements
"""
import unicodedata
import re

def normalize_answer(text: str) -> str:
    """Normalize text for comparison (case-insensitive, trim, remove extra spaces and punctuation)"""
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

def check_answer(user_answer: str, correct_answer: str) -> bool:
    """Check if answer is correct"""
    # Normalize both answers for comparison
    normalized_user = normalize_answer(user_answer)
    normalized_correct = normalize_answer(correct_answer)
    
    print(f"User (normalized):    '{normalized_user}'")
    print(f"Correct (normalized): '{normalized_correct}'")
    
    # First check exact match (normalized)
    if normalized_user == normalized_correct:
        return True
    
    # Check if user answer matches any comma-separated variant
    # Only split on commas that are NOT inside parentheses
    variants = re.split(r',\s*(?![^()]*\))', correct_answer)
    print(f"Variants found: {variants}")
    correct_variants = [normalize_answer(v) for v in variants]
    print(f"Normalized variants: {correct_variants}")
    
    return normalized_user in correct_variants

# Test cases
print("=" * 60)
print("Test 1: Complex answer with parentheses")
print("=" * 60)
user = "вещ, ценност (в мн. ч. пари)"
correct = "вещ, ценност (в мн. ч. пари)"
result = check_answer(user, correct)
print(f"Result: {'✅ CORRECT' if result else '❌ INCORRECT'}\n")

print("=" * 60)
print("Test 2: Simple comma-separated alternatives")
print("=" * 60)
user = "към"
correct = "към, против"
result = check_answer(user, correct)
print(f"Result: {'✅ CORRECT' if result else '❌ INCORRECT'}\n")

print("=" * 60)
print("Test 3: Second alternative")
print("=" * 60)
user = "против"
correct = "към, против"
result = check_answer(user, correct)
print(f"Result: {'✅ CORRECT' if result else '❌ INCORRECT'}\n")

print("=" * 60)
print("Test 4: Case insensitive")
print("=" * 60)
user = "МЛЯКО"
correct = "мляко"
result = check_answer(user, correct)
print(f"Result: {'✅ CORRECT' if result else '❌ INCORRECT'}\n")

print("=" * 60)
print("Test 5: Extra spaces")
print("=" * 60)
user = "  мляко  "
correct = "мляко"
result = check_answer(user, correct)
print(f"Result: {'✅ CORRECT' if result else '❌ INCORRECT'}\n")
