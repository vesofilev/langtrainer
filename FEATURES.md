# Feature Guide - Ancient Greek Language Trainer

## Session Modes

### 1. Training + Exam Mode 📚➡️✅
Perfect for learning new vocabulary!

**How it works:**
1. Select "Training + Exam" mode
2. Choose your settings (direction, number of words)
3. **Training Phase**: 
   - Each word is displayed with its translation
   - Study at your own pace
   - Use keyboard (Enter) or mouse to navigate
   - Progress bar shows how many words left to study
4. **Exam Phase**:
   - Same words, but now you must recall the translation
   - Get tested on what you just learned
   - Immediate feedback with sound effects
5. **Results**:
   - See your score
   - Review mistakes

**Best for:**
- Learning new words
- First-time students
- Building vocabulary systematically

### 2. Exam Only Mode ✅
Jump straight to testing!

**How it works:**
1. Select "Exam Only" mode
2. Choose settings
3. Start answering questions immediately
4. Get results at the end

**Best for:**
- Quick review
- Testing existing knowledge
- Advanced students

## Interactive Features

### Sound Effects 🔊
- **Correct answer**: Pleasant ascending musical tones (C-E-G chord)
- **Incorrect answer**: Gentle descending tone
- Built with Web Audio API (no external files needed)

### Smart Answer Matching 🧠
The app intelligently matches your answers:
- **Case insensitive**: "мляко" = "МЛЯКО" = "Мляко"
- **Diacritic handling**: Removes Greek accent marks for comparison
- **Multiple correct answers**: "към, против" - both accepted
- **Whitespace tolerance**: Extra spaces are ignored

### Keyboard Shortcuts ⌨️
- **Enter**: Submit answer / Next question / Next word in training
- **Tab**: Navigate between input fields

## Translation Directions

### Ancient Greek → Bulgarian
**Example:**
- Question: `λέων`
- Answer: `лъв`

### Bulgarian → Ancient Greek
**Example:**
- Question: `лъв`
- Answer: `λέων`

## Progress Tracking

### During Quiz/Training
- Visual progress bar
- Counter: "Question 3 of 15"
- Live score updates

### Results Screen
- Overall score percentage
- Correct/Total answers
- List of mistakes with correct answers
- Your wrong answers shown for review

## Tips for Best Results

1. **Start with Training Mode**: If you're learning new words, always use Training + Exam mode first
2. **Adjust Word Count**: Start with 5-10 words if you're a beginner
3. **Practice Both Directions**: Alternate between Greek→Bulgarian and Bulgarian→Greek
4. **Review Mistakes**: After each exam, carefully review the incorrect words list
5. **Repeat**: Use "Start New Quiz" to practice more words or retry difficult ones

## Technical Features

- **Responsive Design**: Works on desktop, tablet, and mobile
- **No External Dependencies**: All sounds and styles are built-in
- **Fast Performance**: Local session storage, instant feedback
- **Accessibility**: Semantic HTML, keyboard navigation support
- **Browser Support**: Works in all modern browsers (Chrome, Firefox, Safari, Edge)

## Data Source

All vocabulary comes from `data/greek_words_standard.json`:
- 219 word pairs
- Ancient Greek lemmas (base forms)
- Bulgarian translations
- Carefully curated educational content
