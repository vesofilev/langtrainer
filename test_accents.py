#!/usr/bin/env python3
"""
Test accent/diacritic handling in Ancient Greek
"""
from app import WordRepository

def test_accent_detection():
    """Test that accent differences are properly detected"""
    
    print("Testing accent detection...")
    print("-" * 60)
    
    test_cases = [
        # (user_answer, correct_answer, expected_result)
        ("θηρίον", "θηρίον", "exact_match"),  # Perfect match with accents
        ("θηριον", "θηρίον", "no_accents"),   # Missing accent
        ("λέγω", "λέγω", "exact_match"),      # Perfect match with accents
        ("λεγω", "λέγω", "no_accents"),       # Missing accent
        ("άνθρωπος", "ἄνθρωπος", "no_accents"), # Wrong diacritic (smooth breathing vs rough)
        ("completely", "διαφορετικό", "wrong"), # Completely different
    ]
    
    for user_answer, correct_answer, expected in test_cases:
        # Normalize WITH accents
        user_with_accents = WordRepository.normalize_with_accents(user_answer)
        correct_with_accents = WordRepository.normalize_with_accents(correct_answer)
        
        # Normalize WITHOUT accents
        user_no_accents = WordRepository.normalize_answer(user_answer)
        correct_no_accents = WordRepository.normalize_answer(correct_answer)
        
        # Determine result
        if user_with_accents == correct_with_accents:
            result = "exact_match"
        elif user_no_accents == correct_no_accents:
            result = "no_accents"
        else:
            result = "wrong"
        
        status = "✅" if result == expected else "❌"
        
        print(f"{status} User: '{user_answer}' vs Correct: '{correct_answer}'")
        print(f"   Expected: {expected}, Got: {result}")
        print(f"   With accents: '{user_with_accents}' vs '{correct_with_accents}'")
        print(f"   No accents: '{user_no_accents}' vs '{correct_no_accents}'")
        print()

if __name__ == "__main__":
    test_accent_detection()
