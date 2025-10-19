"""
Test the timer functionality for quiz questions
"""
import time
from app import QuizSession, WordPair, Direction


def test_timer_within_limit():
    """Test that answers submitted within time limit are accepted"""
    print("Test 1: Answer within time limit")
    
    word_pairs = [
        WordPair(greek="ἄνθρωπος", bulgarian="човек"),
        WordPair(greek="θεός", bulgarian="бог")
    ]
    
    session = QuizSession("test-1", word_pairs, Direction.GREEK_TO_BULGARIAN, time_per_question=5)
    
    # Start question
    session.start_question(0)
    
    # Answer within time (wait 1 second)
    time.sleep(1)
    
    score, is_partial, timed_out = session.check_answer(0, "човек")
    
    assert score == 1.0, f"Expected score 1.0, got {score}"
    assert not timed_out, f"Expected not timed out, got {timed_out}"
    assert not is_partial, f"Expected not partial credit, got {is_partial}"
    
    print("✅ PASS: Answer within time limit accepted")
    print(f"   Score: {score}, Timed out: {timed_out}, Partial: {is_partial}")


def test_timer_expired():
    """Test that answers submitted after time limit are rejected"""
    print("\nTest 2: Answer after time limit expired")
    
    word_pairs = [
        WordPair(greek="ἄνθρωπος", bulgarian="човек"),
        WordPair(greek="θεός", bulgarian="бог")
    ]
    
    session = QuizSession("test-2", word_pairs, Direction.GREEK_TO_BULGARIAN, time_per_question=2)
    
    # Start question
    session.start_question(0)
    
    # Wait for timer to expire (wait 3 seconds, limit is 2)
    print("   Waiting for timer to expire (3 seconds)...")
    time.sleep(3)
    
    # Try to answer after timeout - even with correct answer
    score, is_partial, timed_out = session.check_answer(0, "човек")
    
    assert score == 0.0, f"Expected score 0.0 for timeout, got {score}"
    assert timed_out, f"Expected timed_out=True, got {timed_out}"
    
    print("✅ PASS: Answer after timeout rejected")
    print(f"   Score: {score}, Timed out: {timed_out}, Partial: {is_partial}")


def test_timer_partial_credit_within_limit():
    """Test that partial credit works when within time limit"""
    print("\nTest 3: Partial credit (no accents) within time limit")
    
    word_pairs = [
        WordPair(greek="ἄνθρωπος", bulgarian="човек")
    ]
    
    session = QuizSession("test-3", word_pairs, Direction.GREEK_TO_BULGARIAN, time_per_question=5)
    
    # Start question
    session.start_question(0)
    
    # Answer within time but without accents (if applicable to Bulgarian)
    time.sleep(1)
    
    score, is_partial, timed_out = session.check_answer(0, "човек")
    
    assert not timed_out, f"Expected not timed out, got {timed_out}"
    
    print("✅ PASS: Partial credit works within time limit")
    print(f"   Score: {score}, Timed out: {timed_out}, Partial: {is_partial}")


def test_timer_wrong_answer_expired():
    """Test that wrong answer after timeout still shows timeout flag"""
    print("\nTest 4: Wrong answer after timeout")
    
    word_pairs = [
        WordPair(greek="ἄνθρωπος", bulgarian="човек")
    ]
    
    session = QuizSession("test-4", word_pairs, Direction.GREEK_TO_BULGARIAN, time_per_question=2)
    
    # Start question
    session.start_question(0)
    
    # Wait for timer to expire
    print("   Waiting for timer to expire (3 seconds)...")
    time.sleep(3)
    
    # Submit wrong answer
    score, is_partial, timed_out = session.check_answer(0, "wrong answer")
    
    assert score == 0.0, f"Expected score 0.0, got {score}"
    assert timed_out, f"Expected timed_out=True, got {timed_out}"
    
    print("✅ PASS: Wrong answer after timeout correctly flagged")
    print(f"   Score: {score}, Timed out: {timed_out}, Partial: {is_partial}")


def test_multiple_questions_timer():
    """Test timer for multiple questions in sequence"""
    print("\nTest 5: Multiple questions with different timer outcomes")
    
    word_pairs = [
        WordPair(greek="ἄνθρωπος", bulgarian="човек"),
        WordPair(greek="θεός", bulgarian="бог"),
        WordPair(greek="γυνή", bulgarian="жена")
    ]
    
    session = QuizSession("test-5", word_pairs, Direction.GREEK_TO_BULGARIAN, time_per_question=2)
    
    # Question 0 - answer within time
    session.start_question(0)
    time.sleep(0.5)
    score0, partial0, timeout0 = session.check_answer(0, "човек")
    assert not timeout0, "Question 0 should not timeout"
    
    # Question 1 - let it timeout
    session.start_question(1)
    print("   Waiting for question 1 to timeout (3 seconds)...")
    time.sleep(3)
    score1, partial1, timeout1 = session.check_answer(1, "бог")
    assert timeout1, "Question 1 should timeout"
    assert score1 == 0.0, "Timed out question should score 0"
    
    # Question 2 - answer within time
    session.start_question(2)
    time.sleep(0.5)
    score2, partial2, timeout2 = session.check_answer(2, "жена")
    assert not timeout2, "Question 2 should not timeout"
    
    print("✅ PASS: Multiple questions handled correctly")
    print(f"   Q0: score={score0}, timeout={timeout0}")
    print(f"   Q1: score={score1}, timeout={timeout1}")
    print(f"   Q2: score={score2}, timeout={timeout2}")


def test_is_timed_out_before_start():
    """Test that is_timed_out returns False for questions not started"""
    print("\nTest 6: Check timeout status before question starts")
    
    word_pairs = [
        WordPair(greek="ἄνθρωπος", bulgarian="човек")
    ]
    
    session = QuizSession("test-6", word_pairs, Direction.GREEK_TO_BULGARIAN, time_per_question=5)
    
    # Check timeout before starting question
    is_timeout = session.is_timed_out(0)
    
    assert not is_timeout, "Question should not be timed out before it starts"
    
    print("✅ PASS: Unstarted question not marked as timed out")
    print(f"   is_timed_out(0): {is_timeout}")


def run_all_tests():
    """Run all timer tests"""
    print("="*60)
    print("Running Timer Tests for Language Trainer")
    print("="*60)
    
    try:
        test_timer_within_limit()
        test_timer_expired()
        test_timer_partial_credit_within_limit()
        test_timer_wrong_answer_expired()
        test_multiple_questions_timer()
        test_is_timed_out_before_start()
        
        print("\n" + "="*60)
        print("✅ ALL TESTS PASSED!")
        print("="*60)
        
    except AssertionError as e:
        print("\n" + "="*60)
        print(f"❌ TEST FAILED: {e}")
        print("="*60)
        raise


if __name__ == "__main__":
    run_all_tests()
