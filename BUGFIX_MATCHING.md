# Answer Matching Fix - October 18, 2025

## Problem
Multi-word answers with punctuation (parentheses, commas, periods) were not matching correctly even when typed identically.

**Example:**
- Correct answer: `вещ, ценност (в мн. ч. пари)`
- User typed: `вещ, ценност (в мн. ч. пари)`
- Result: ❌ Marked as incorrect (BUG)

## Root Cause
1. **Punctuation not normalized**: The old normalization only handled diacritics and whitespace
2. **Naive comma splitting**: Split on ALL commas, even inside parentheses like "(в мн. ч. пари)"

## Solution

### 1. Enhanced Normalization (`normalize_answer`)
Now removes common punctuation before comparison:
- Parentheses: `( )`
- Brackets: `[ ]`
- Periods: `.`
- Commas: `,`
- Semicolons: `;`
- Colons: `:`

**Result:**
- `"вещ, ценност (в мн. ч. пари)"` → `"вещ ценност в мн ч пари"`
- Exact character-by-character match is now easier

### 2. Smart Comma Splitting (`check_answer`)
Uses regex to split on commas ONLY if they're not inside parentheses:
```python
re.split(r',\s*(?![^()]*\))', correct_answer)
```

**Examples:**
- `"към, против"` → `["към", "против"]` ✅ (splits correctly)
- `"вещ, ценност (в мн. ч. пари)"` → `["вещ, ценnost (в мн. ч. пари)"]` ✅ (no split inside parentheses)

### 3. Two-Stage Matching
1. **First**: Check exact match (normalized)
2. **Second**: If not exact, check against comma-separated variants

## Test Results

All test cases now pass:

```
✅ Test 1: Complex answer with parentheses
   Input: "вещ, ценност (в мн. ч. пари)"
   
✅ Test 2: Simple alternatives
   Input: "към" matches "към, против"
   
✅ Test 3: Second alternative
   Input: "против" matches "към, против"
   
✅ Test 4: Case insensitive
   Input: "МЛЯКО" matches "мляко"
   
✅ Test 5: Extra spaces
   Input: "  мляко  " matches "мляко"
```

## Files Changed
- `app.py`: Updated `normalize_answer()` and `check_answer()` methods
- `test_matching.py`: New test file to verify matching logic

## Impact
- **More lenient matching**: Users don't need to type punctuation perfectly
- **Smarter alternatives**: Comma-separated options work correctly
- **Better UX**: Fewer false negatives, especially for complex Bulgarian translations

## Deployment
Server restarted with fix applied. Users can now:
1. Type answers without worrying about exact punctuation
2. Get credit for correct answers even with minor formatting differences
3. Use either alternative in comma-separated answer lists
