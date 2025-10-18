#!/usr/bin/env python3
"""
Test script for Ancient Greek Language Trainer API
"""
import requests
import json

BASE_URL = "http://localhost:8000/api"

def test_config():
    """Test GET /api/config endpoint"""
    print("Testing GET /api/config...")
    response = requests.get(f"{BASE_URL}/config")
    print(f"Status: {response.status_code}")
    data = response.json()
    print(json.dumps(data, indent=2, ensure_ascii=False))
    assert response.status_code == 200
    assert "directions" in data
    assert "total_words" in data
    print("✓ Config endpoint working\n")
    return data

def test_quiz_flow():
    """Test complete quiz flow"""
    print("Testing quiz flow...")
    
    # Start quiz
    print("1. Starting quiz with 5 words (Greek → Bulgarian)...")
    response = requests.post(
        f"{BASE_URL}/quiz",
        json={"count": 5, "direction": "greek_to_bulgarian"}
    )
    assert response.status_code == 200
    quiz_data = response.json()
    session_id = quiz_data["session_id"]
    print(f"   Session ID: {session_id}")
    print(f"   Total questions: {quiz_data['total_questions']}")
    print(f"   First question: {quiz_data['questions'][0]['prompt']}")
    print("   ✓ Quiz started\n")
    
    # Submit answers
    print("2. Submitting test answers...")
    for i in range(min(3, len(quiz_data['questions']))):
        question = quiz_data['questions'][i]
        # Submit intentionally wrong answer for testing
        answer_response = requests.post(
            f"{BASE_URL}/quiz/{session_id}/answer",
            json={"question_index": i, "answer": "test answer"}
        )
        assert answer_response.status_code == 200
        answer_data = answer_response.json()
        print(f"   Q{i+1}: {question['prompt']}")
        print(f"       Correct: {answer_data['correct']}")
        print(f"       Right answer: {answer_data['correct_answer']}")
    print("   ✓ Answers submitted\n")
    
    # Get summary
    print("3. Getting quiz summary...")
    summary_response = requests.get(f"{BASE_URL}/quiz/{session_id}/summary")
    assert summary_response.status_code == 200
    summary = summary_response.json()
    print(f"   Score: {summary['score_percentage']}%")
    print(f"   Correct: {summary['correct_count']}/{summary['total_questions']}")
    print(f"   Incorrect words: {len(summary['incorrect_words'])}")
    print("   ✓ Summary retrieved\n")
    
    return session_id

def test_bulgarian_to_greek():
    """Test Bulgarian to Greek direction"""
    print("Testing Bulgarian → Greek direction...")
    response = requests.post(
        f"{BASE_URL}/quiz",
        json={"count": 3, "direction": "bulgarian_to_greek"}
    )
    assert response.status_code == 200
    quiz_data = response.json()
    print(f"   Session: {quiz_data['session_id']}")
    print(f"   Direction: {quiz_data['direction']}")
    print(f"   First question (Bulgarian): {quiz_data['questions'][0]['prompt']}")
    print("   ✓ Bulgarian → Greek working\n")

def test_error_handling():
    """Test error cases"""
    print("Testing error handling...")
    
    # Invalid session
    print("1. Testing invalid session ID...")
    response = requests.get(f"{BASE_URL}/quiz/invalid-session-id/summary")
    assert response.status_code == 404
    print("   ✓ Returns 404 for invalid session\n")
    
    # Invalid direction
    print("2. Testing invalid direction...")
    response = requests.post(
        f"{BASE_URL}/quiz",
        json={"count": 5, "direction": "invalid_direction"}
    )
    assert response.status_code == 400
    print("   ✓ Returns 400 for invalid direction\n")

def main():
    """Run all tests"""
    print("=" * 60)
    print("Ancient Greek Language Trainer - API Tests")
    print("=" * 60 + "\n")
    
    try:
        # Verify server is running
        try:
            requests.get(f"{BASE_URL}/config", timeout=2)
        except requests.exceptions.RequestException:
            print("❌ Server is not running!")
            print("Please start the server with: python app.py")
            return
        
        test_config()
        test_quiz_flow()
        test_bulgarian_to_greek()
        test_error_handling()
        
        print("=" * 60)
        print("✅ All tests passed!")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    main()
