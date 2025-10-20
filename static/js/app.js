// State management
const state = {
    sessionId: null,
    questions: [],
    currentIndex: 0,
    answers: [],
    config: null,
    mode: 'exam', // 'training' or 'exam'
    trainingCompleted: false,
    wordPairs: [], // Store word pairs from training to reuse in exam
    wasTrainingSession: false, // Track if user went through training
    timePerQuestion: 60, // Time limit per question in seconds
    timeRemaining: 60, // Current time remaining
    timerInterval: null, // Timer interval ID
    selectedLessons: [], // Selected lesson numbers
    availableLessons: [] // All available lessons
};

// API base URL
const API_BASE = window.location.origin + '/api';

// ==================== Word Progress Tracking ====================

const STORAGE_KEY = 'languageTrainerProgress';

// Create unique key for a word
// Normalize by removing all non-word chars and converting to lowercase for consistency
function createWordKey(greek, bulgarian, lesson) {
    const cleanGreek = greek.replace(/[^\wα-ωΑ-Ω]/g, '').toLowerCase();
    const cleanBulgarian = bulgarian.replace(/[^\wа-яА-Я]/g, '').toLowerCase();
    return `${lesson}_${cleanGreek}_${cleanBulgarian}`;
}

// Get progress data from localStorage
function getProgressData() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) {
            return {
                wordProgress: {},
                version: 1
            };
        }
        const parsed = JSON.parse(data);
        // Ensure wordProgress exists
        if (!parsed.wordProgress) {
            parsed.wordProgress = {};
        }
        return parsed;
    } catch (error) {
        console.error('[ERROR] Failed to parse progress data:', error);
        return {
            wordProgress: {},
            version: 1
        };
    }
}

// Save progress data to localStorage
function saveProgressData(data) {
    try {
        // Ensure data is valid before saving
        if (!data || !data.wordProgress) {
            console.error('[ERROR] Attempted to save invalid progress data:', data);
            return;
        }
        const jsonString = JSON.stringify(data);
        localStorage.setItem(STORAGE_KEY, jsonString);
        console.log(`[INFO] Saved progress: ${Object.keys(data.wordProgress).length} entries`);
    } catch (error) {
        console.error('[ERROR] Failed to save progress data:', error);
    }
}

// Reset all progress
// Reset all progress
function resetAllProgress() {
    if (confirm('Are you sure you want to reset ALL progress? This cannot be undone!')) {
        localStorage.removeItem(STORAGE_KEY);
        console.log('Progress reset');
        updateProgressDisplay();
        alert('Progress has been reset!');
    }
}

// Mark word as correctly answered for specific direction and lesson
function markWordCorrect(greek, bulgarian, lesson, direction) {
    const progress = getProgressData();
    const wordKey = createWordKey(greek, bulgarian, lesson);
    const progressKey = `${direction}_${lesson}_${wordKey}`;
    
    progress.wordProgress[progressKey] = {
        greek,
        bulgarian,
        lesson,
        direction,
        correct: true,
        lastSeen: new Date().toISOString()
    };
    
    saveProgressData(progress);
}

// Check if word was correctly answered for specific direction and lesson
function isWordCorrect(greek, bulgarian, lesson, direction) {
    const progress = getProgressData();
    const wordKey = createWordKey(greek, bulgarian, lesson);
    const progressKey = `${direction}_${lesson}_${wordKey}`;
    
    return progress.wordProgress[progressKey]?.correct === true;
}

// Reset progress for specific lessons and direction
function resetProgress(lessons, direction) {
    const progress = getProgressData();
    const keysToDelete = [];
    
    for (const key in progress.wordProgress) {
        const entry = progress.wordProgress[key];
        if (lessons.includes(entry.lesson) && entry.direction === direction) {
            keysToDelete.push(key);
        }
    }
    
    keysToDelete.forEach(key => delete progress.wordProgress[key]);
    saveProgressData(progress);
    
    console.log(`Reset progress: ${keysToDelete.length} words for lessons ${lessons.join(', ')} in ${direction} direction`);
}

// Get progress statistics for selected lessons and direction
function getProgressStats(lessons, direction, totalWords) {
    const progress = getProgressData();
    let correctCount = 0;
    
    for (const key in progress.wordProgress) {
        const entry = progress.wordProgress[key];
        if (lessons.includes(entry.lesson) && entry.direction === direction && entry.correct) {
            correctCount++;
        }
    }
    
    return {
        correctCount,
        totalWords,
        percentage: totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0
    };
}

// View mastered words for a specific lesson
function viewMasteredWords(lesson) {
    const direction = document.getElementById('direction').value;
    const progress = getProgressData();
    const masteredWords = [];
    
    for (const key in progress.wordProgress) {
        const entry = progress.wordProgress[key];
        if (entry.lesson === lesson && entry.direction === direction && entry.correct) {
            masteredWords.push({
                greek: entry.greek,
                bulgarian: entry.bulgarian,
                lastSeen: entry.lastSeen
            });
        }
    }
    
    if (masteredWords.length === 0) {
        alert(`No mastered words found for Lesson ${lesson}`);
        return;
    }
    
    // Sort by last seen date (most recent first)
    masteredWords.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
    
    const directionLabel = direction === 'greek_to_bulgarian' ? 
        'Greek → Bulgarian' : 'Bulgarian → Greek';
    
    // Populate modal
    const modal = document.getElementById('masteredWordsModal');
    const statsDivElement = document.getElementById('masteredWordsStats');
    const listDiv = document.getElementById('masteredWordsList');
    
    // Update stats
    statsDivElement.innerHTML = `
        <strong>Lesson ${lesson}</strong><br>
        Direction: ${directionLabel}<br>
        Total mastered words: ${masteredWords.length}
    `;
    
    // Build word list
    let listHtml = '<div style="font-family: monospace;">';
    masteredWords.forEach((word, index) => {
        const lastSeenDate = new Date(word.lastSeen).toLocaleDateString();
        const lastSeenTime = new Date(word.lastSeen).toLocaleTimeString();
        listHtml += `
            <div style="padding: 8px; margin-bottom: 5px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #4caf50;">
                <div style="font-size: 1.1em; margin-bottom: 3px;">
                    <strong>${word.greek}</strong> → ${word.bulgarian}
                </div>
                <div style="font-size: 0.85em; color: #666;">
                    Last seen: ${lastSeenDate} ${lastSeenTime}
                </div>
            </div>
        `;
    });
    listHtml += '</div>';
    
    listDiv.innerHTML = listHtml;
    
    // Show modal
    modal.classList.add('active');
}

// Close mastered words modal
function closeMasteredWordsModal() {
    const modal = document.getElementById('masteredWordsModal');
    modal.classList.remove('active');
}

// Sound effects using Web Audio API
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioContext = null;

function initAudioContext() {
    if (!audioContext) {
        audioContext = new AudioContext();
    }
    // Always try to resume if suspended
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

async function playSuccessSound() {
    try {
        // Initialize and resume audio context if needed
        initAudioContext();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
    } catch (error) {
        console.warn('Audio playback failed:', error);
        return;
    }
    
    // Pleasant ascending notes for success
    const times = [0, 0.1, 0.2];
    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5 (major chord)
    
    times.forEach((time, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequencies[index];
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + time);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + time + 0.3);
        
        oscillator.start(audioContext.currentTime + time);
        oscillator.stop(audioContext.currentTime + time + 0.3);
    });
}

async function playErrorSound() {
    try {
        // Initialize and resume audio context if needed
        initAudioContext();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
    } catch (error) {
        console.warn('Audio playback failed:', error);
        return;
    }
    
    // Gentle descending tones for errors
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.3);
    
    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}

// Initialize
async function init() {
    try {
        const response = await fetch(`${API_BASE}/config`);
        state.config = await response.json();
        document.getElementById('wordCount').max = state.config.max_count;
        document.getElementById('timePerQuestion').value = state.config.default_time_per_question || 60;
        document.getElementById('timePerQuestion').min = state.config.min_time_per_question || 10;
        document.getElementById('timePerQuestion').max = state.config.max_time_per_question || 300;
        
        // Load available lessons
        state.availableLessons = state.config.available_lessons || [];
        renderLessonsSelector();
        
        // Select all lessons by default
        selectAllLessons();
        
        // Initialize keyboard visibility
        updateKeyboardVisibility();
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

// Render lessons selector
function renderLessonsSelector() {
    const container = document.getElementById('lessonsSelector');
    container.innerHTML = '';
    
    state.availableLessons.forEach(lessonNum => {
        const div = document.createElement('div');
        div.className = 'lesson-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `lesson-${lessonNum}`;
        checkbox.value = lessonNum;
        checkbox.onchange = updateSelectedLessons;
        
        const label = document.createElement('label');
        label.htmlFor = `lesson-${lessonNum}`;
        label.textContent = `Урок ${lessonNum}`;
        
        div.appendChild(checkbox);
        div.appendChild(label);
        container.appendChild(div);
        
        // Make the entire item clickable
        div.onclick = (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                updateSelectedLessons();
            }
        };
    });
}

// Select all lessons
function selectAllLessons() {
    state.availableLessons.forEach(lessonNum => {
        const checkbox = document.getElementById(`lesson-${lessonNum}`);
        if (checkbox) checkbox.checked = true;
    });
    updateSelectedLessons();
}

// Deselect all lessons
function deselectAllLessons() {
    state.availableLessons.forEach(lessonNum => {
        const checkbox = document.getElementById(`lesson-${lessonNum}`);
        if (checkbox) checkbox.checked = false;
    });
    updateSelectedLessons();
}

// Update selected lessons and word count
// Update selected lessons and word count
async function updateSelectedLessons() {
    state.selectedLessons = [];
    state.availableLessons.forEach(lessonNum => {
        const checkbox = document.getElementById(`lesson-${lessonNum}`);
        if (checkbox && checkbox.checked) {
            state.selectedLessons.push(lessonNum);
        }
    });
    
    // Update available word count
    await updateWordCount();
    
    // Update summary text
    updateSelectedLessonsSummary();
}

// Update word count based on selected lessons
async function updateWordCount() {
    try {
        const response = await fetch(`${API_BASE}/words-count`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selected_lessons: state.selectedLessons })
        });
        const data = await response.json();
        
        // Update both the main summary and modal summary
        document.getElementById('availableWordsCount').textContent = data.count;
        document.getElementById('modalAvailableWordsCount').textContent = data.count;
        
        // Update max for word count input (limited by both MAX_WORDS and available words)
        const MAX_WORDS = 200;
        const wordCountInput = document.getElementById('wordCount');
        wordCountInput.max = Math.min(MAX_WORDS, data.count);
        
        // Adjust current value if it exceeds new max
        if (parseInt(wordCountInput.value) > parseInt(wordCountInput.max)) {
            wordCountInput.value = wordCountInput.max;
        }
    } catch (error) {
        console.error('Failed to update word count:', error);
    }
}

// Toggle word count input based on "use all words" checkbox
// Toggle word count input based on "use all words" checkbox
function toggleWordCount() {
    const useAllWords = document.getElementById('useAllWords').checked;
    const wordCountGroup = document.getElementById('wordCountGroup');
    const wordCountInput = document.getElementById('wordCount');
    
    if (useAllWords) {
        wordCountGroup.style.opacity = '0.5';
        wordCountInput.disabled = true;
    } else {
        wordCountGroup.style.opacity = '1';
        wordCountInput.disabled = false;
    }
}

// Open lessons modal
function openLessonsModal() {
    document.getElementById('lessonsModal').classList.add('active');
}

// Close lessons modal
function closeLessonsModal() {
    document.getElementById('lessonsModal').classList.remove('active');
}

// Apply lesson selection and close modal
function applyLessonSelection() {
    updateSelectedLessonsSummary();
    closeLessonsModal();
}

// Update the summary text showing selected lessons
// Update the summary text showing selected lessons
function updateSelectedLessonsSummary() {
    const summaryText = document.getElementById('selectedLessonsText');
    const modalSummaryText = document.getElementById('modalSelectedLessonsText');
    
    let displayText = '';
    
    if (state.selectedLessons.length === 0) {
        displayText = 'No lessons selected';
    } else if (state.selectedLessons.length === state.availableLessons.length) {
        displayText = 'All lessons';
    } else if (state.selectedLessons.length <= 5) {
        displayText = `Lesson${state.selectedLessons.length > 1 ? 's' : ''} ${state.selectedLessons.sort((a, b) => a - b).join(', ')}`;
    } else {
        displayText = `${state.selectedLessons.length} lessons selected`;
    }
    
    // Update both summaries
    summaryText.textContent = displayText;
    modalSummaryText.textContent = displayText;
    
    // Update progress display
    updateProgressDisplay();
}

// Update progress statistics display
async function updateProgressDisplay() {
    const direction = document.getElementById('direction').value;
    const progressSummary = document.getElementById('progressSummary');
    const progressStats = document.getElementById('progressStats');
    
    if (state.selectedLessons.length === 0) {
        progressSummary.style.display = 'none';
        return;
    }
    
    const progress = getProgressData();
    
    // Get direction label
    const directionLabel = direction === 'greek_to_bulgarian' ? 
        'Greek → Bulgarian' : 'Bulgarian → Greek';
    
    // Count mastered words per lesson for current direction
    const masteredByLesson = {};
    state.selectedLessons.forEach(lesson => {
        masteredByLesson[lesson] = 0;
    });
    
    for (const key in progress.wordProgress) {
        const entry = progress.wordProgress[key];
        if (entry.direction === direction && 
            entry.correct && 
            state.selectedLessons.includes(entry.lesson)) {
            masteredByLesson[entry.lesson]++;
        }
    }
    
    // Get total words count per lesson from server
    const lessonCounts = {};
    for (const lesson of state.selectedLessons) {
        try {
            const response = await fetch(`${API_BASE}/words-count`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selected_lessons: [lesson] })
            });
            const data = await response.json();
            lessonCounts[lesson] = data.count;
        } catch (error) {
            console.error(`Failed to get count for lesson ${lesson}:`, error);
            lessonCounts[lesson] = 0;
        }
    }
    
    // Check if any progress exists
    const hasProgress = Object.values(masteredByLesson).some(count => count > 0);
    if (!hasProgress) {
        progressSummary.style.display = 'none';
        return;
    }
    
    // Build display with direction
    let html = `<div style="margin-bottom: 5px;"><strong>${directionLabel}</strong></div>`;
    
    // Show per-lesson breakdown
    state.selectedLessons.sort((a, b) => a - b).forEach(lesson => {
        const mastered = masteredByLesson[lesson];
        const total = lessonCounts[lesson] || 0;
        if (mastered > 0 || total > 0) {
            const percentage = total > 0 ? Math.round((mastered / total) * 100) : 0;
            html += `<div style="margin: 5px 0;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
                    <span style="font-weight: 500;">Урок ${lesson}: ${mastered}/${total} (${percentage}%)</span>
                    ${mastered > 0 ? `<button type="button" onclick="viewMasteredWords(${lesson})" style="padding: 2px 8px; font-size: 0.75em; background: #2196f3; color: white; border: none; border-radius: 3px; cursor: pointer; margin-left: 8px;">👁️ View</button>` : ''}
                </div>
                <div style="width: 100%; height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden;">
                    <div style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, #4caf50 0%, #66bb6a 100%); transition: width 0.3s ease;"></div>
                </div>
            </div>`;
        }
    });
    
    // Add reset progress button as a line item
    html += `<div style="margin: 10px 0; display: flex; align-items: center;">
        <button type="button" onclick="resetAllProgress()" style="padding: 2px 6px; font-size: 1.00em; background: #ff5252; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️ Reset Progress</button>
    </div>`;
    
    progressStats.innerHTML = html;
    progressSummary.style.display = 'block';
}

// Timer functions
function startTimer() {
    // Clear any existing timer
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
    }

    // Reset timer to configured time
    state.timeRemaining = state.timePerQuestion;
    updateTimerDisplay();

    // Start countdown
    state.timerInterval = setInterval(() => {
        state.timeRemaining--;
        updateTimerDisplay();

        if (state.timeRemaining <= 0) {
            handleTimeout();
        }
    }, 1000);
}

function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

function updateTimerDisplay() {
    const display = document.getElementById('timerDisplay');
    const container = document.getElementById('timerContainer');
    
    display.textContent = state.timeRemaining;

    // Update styling based on time remaining
    container.classList.remove('warning', 'danger');
    
    const percentRemaining = (state.timeRemaining / state.timePerQuestion) * 100;
    
    if (percentRemaining <= 20) {
        container.classList.add('danger');
    } else if (percentRemaining <= 40) {
        container.classList.add('warning');
    }
}

async function handleTimeout() {
    stopTimer();
    
    // Auto-submit with empty answer
    await submitAnswer(true);
}

// Start session (training or exam)
// Start session (training or exam)
async function startSession() {
    const sessionMode = document.getElementById('sessionMode').value;
    const direction = document.getElementById('direction').value;
    let count = parseInt(document.getElementById('wordCount').value);
    const timePerQuestion = parseInt(document.getElementById('timePerQuestion').value);
    const useAllWords = document.getElementById('useAllWords').checked;

    // Validate lesson selection
    if (state.selectedLessons.length === 0) {
        alert('Please select at least one lesson');
        return;
    }

    // Get available words count from the displayed value
    const availableWords = parseInt(document.getElementById('availableWordsCount').textContent) || 0;
    
    // Validate word count limits
    const MAX_WORDS = 200;
    const MIN_WORDS = 1;
    
    if (!useAllWords) {
        if (isNaN(count) || count < MIN_WORDS) {
            alert(`Please enter a valid number of words (minimum: ${MIN_WORDS})`);
            return;
        }
        
        // Check against absolute maximum
        if (count > MAX_WORDS) {
            alert(`The maximum number of words is ${MAX_WORDS}. Your selection will be limited to ${MAX_WORDS} words.`);
            count = MAX_WORDS;
            document.getElementById('wordCount').value = MAX_WORDS;
        }
        
        // Check against available words in selected lessons
        if (count > availableWords) {
            alert(`Only ${availableWords} words are available in the selected lessons. Your selection will be limited to ${availableWords} words.`);
            count = availableWords;
            document.getElementById('wordCount').value = availableWords;
        }
        
        // Final check - if no words available
        if (availableWords === 0) {
            alert('No words available in the selected lessons.');
            return;
        }
    }

    // Store time per question in state
    state.timePerQuestion = timePerQuestion;

    // Get list of words already answered correctly for this direction and lessons
    const excludeWords = getCorrectWordsForLessons(state.selectedLessons, direction);
    console.log(`Excluding ${excludeWords.length} correctly answered words`);

    // When use_all_words is true, count is ignored by backend, but we still need to send a valid value (>= 1)
    if (useAllWords && (!count || count < 1)) {
        count = 1;  // Send placeholder value when using all words
    }

    try {
        const requestBody = {
            direction,
            count,
            time_per_question: timePerQuestion,
            selected_lessons: state.selectedLessons,
            use_all_words: useAllWords,
            exclude_correct_words: excludeWords
        };
        
        console.log('Starting session with config:', requestBody);

        const response = await fetch(`${API_BASE}/quiz`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error:', errorText);
            
            // Try to parse error details
            let errorMessage = 'Unable to start session. ';
            try {
                const errorData = JSON.parse(errorText);
                if (errorData.detail) {
                    if (Array.isArray(errorData.detail)) {
                        // Validation error
                        const validationErrors = errorData.detail.map(err => {
                            if (err.loc && err.loc.includes('count')) {
                                return `Word count ${err.msg.toLowerCase()}`;
                            }
                            return err.msg;
                        }).join(', ');
                        errorMessage += validationErrors;
                    } else {
                        errorMessage += errorData.detail;
                    }
                }
            } catch (e) {
                errorMessage += `Server error ${response.status}`;
            }
            
            alert(errorMessage);
            return;
        }

        const data = await response.json();
        state.sessionId = data.session_id;
        state.questions = data.questions;
        state.wordPairs = data.word_pairs;  // Store word pairs for reuse
        state.timePerQuestion = data.time_per_question; // Get from server response
        state.currentIndex = 0;
        state.answers = [];
        state.trainingCompleted = false;
        state.wasTrainingSession = (sessionMode === 'training'); // Track if training was used
        
        // Store direction in config for keyboard visibility
        if (!state.config) state.config = {};
        state.config.direction = direction;

        if (sessionMode === 'training') {
            state.mode = 'training';
            showScreen('trainingScreen');
            displayTrainingWord();
        } else {
            state.mode = 'exam';
            showScreen('quizScreen');
            displayQuestion();
        }
    } catch (error) {
        alert('Failed to start session: ' + error.message);
    }
}

// Get list of correctly answered words for specific lessons and direction
function getCorrectWordsForLessons(lessons, direction) {
    const progress = getProgressData();
    const correctWords = [];
    
    for (const key in progress.wordProgress) {
        const entry = progress.wordProgress[key];
        if (entry.correct && 
            entry.direction === direction && 
            lessons.includes(entry.lesson)) {
            correctWords.push({
                greek: entry.greek,
                bulgarian: entry.bulgarian,
                lesson: entry.lesson
            });
        }
    }
    
    return correctWords;
}

// Display training word
function displayTrainingWord() {
    const question = state.questions[state.currentIndex];
    const progress = ((state.currentIndex) / state.questions.length) * 100;

    document.getElementById('trainingProgressFill').style.width = progress + '%';
    document.getElementById('trainingCounter').textContent = 
        `Word ${state.currentIndex + 1} of ${state.questions.length}`;
    document.getElementById('trainingPromptLabel').textContent = question.prompt_label;
    document.getElementById('trainingPrompt').textContent = question.prompt;
    
    // Fetch the correct answer for this question
    fetchCorrectAnswer();

    const nextBtn = document.getElementById('trainingNextBtn');
    if (state.currentIndex === state.questions.length - 1) {
        nextBtn.textContent = 'Start Exam';
    } else {
        nextBtn.textContent = 'Next Word';
    }
}

async function fetchCorrectAnswer() {
    try {
        const response = await fetch(
            `${API_BASE}/quiz/${state.sessionId}/question/${state.currentIndex}`
        );
        const data = await response.json();
        document.getElementById('trainingAnswer').textContent = data.correct_answer;
    } catch (error) {
        console.error('Failed to fetch answer:', error);
        document.getElementById('trainingAnswer').textContent = '(Error loading answer)';
    }
}

function nextTrainingWord() {
    state.currentIndex++;
    
    if (state.currentIndex < state.questions.length) {
        displayTrainingWord();
    } else {
        // Training complete, start exam
        startExam();
    }
}

function skipToExam() {
    if (confirm('Are you sure you want to skip training and go directly to the exam?')) {
        startExam();
    }
}

function startExam() {
    state.trainingCompleted = true;
    state.currentIndex = 0;
    state.answers = [];
    
    // Create new quiz session with same words
    startQuizAfterTraining();
}

async function startQuizAfterTraining() {
    const direction = document.getElementById('direction').value;

    try {
        // Start a new quiz session WITH THE SAME word pairs from training
        const response = await fetch(`${API_BASE}/quiz`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                direction, 
                count: state.wordPairs.length,
                word_pairs: state.wordPairs,  // Reuse the same words!
                time_per_question: state.timePerQuestion,  // Keep same time limit
                selected_lessons: state.selectedLessons  // Keep selected lessons
            })
        });

        const data = await response.json();
        state.sessionId = data.session_id;
        state.questions = data.questions;
        state.wordPairs = data.word_pairs;  // Update with shuffled order from server
        state.timePerQuestion = data.time_per_question; // Update from server
        state.currentIndex = 0;
        state.answers = [];

        showScreen('quizScreen');
        displayQuestion();
    } catch (error) {
        alert('Failed to start exam: ' + error.message);
    }
}

// Start quiz (legacy - now called from startSession)
async function startQuiz() {
    const direction = document.getElementById('direction').value;
    const count = parseInt(document.getElementById('wordCount').value);

    try {
        const response = await fetch(`${API_BASE}/quiz`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction, count })
        });

        const data = await response.json();
        state.sessionId = data.session_id;
        state.questions = data.questions;
        state.currentIndex = 0;
        state.answers = [];

        showScreen('quizScreen');
        displayQuestion();
    } catch (error) {
        alert('Failed to start quiz: ' + error.message);
    }
}

// Display current question
function displayQuestion() {
    const question = state.questions[state.currentIndex];
    const progress = ((state.currentIndex) / state.questions.length) * 100;

    document.getElementById('progressFill').style.width = progress + '%';
    document.getElementById('questionCounter').textContent = 
        `Question ${state.currentIndex + 1} of ${state.questions.length}`;
    document.getElementById('questionLabel').textContent = question.prompt_label;
    document.getElementById('questionText').textContent = question.prompt;
    document.getElementById('answerInput').value = '';
    document.getElementById('feedback').classList.add('hidden');
    document.getElementById('answerInput').focus();
    document.getElementById('submitBtn').textContent = 'Submit Answer';
    document.getElementById('submitBtn').onclick = () => submitAnswer(false);
    
    // Update keyboard visibility based on direction
    updateKeyboardVisibility();
    
    // Start the timer for this question
    startTimer();
}

// Submit answer
async function submitAnswer(isTimeout = false) {
    // Stop the timer
    stopTimer();

    const answer = isTimeout ? '' : document.getElementById('answerInput').value.trim();

    if (!answer && !isTimeout) {
        alert('Please enter an answer');
        // Restart timer if user didn't actually submit
        startTimer();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/quiz/${state.sessionId}/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question_index: state.currentIndex,
                answer: answer
            })
        });

        const result = await response.json();
        displayFeedback(result, isTimeout);
        state.answers.push(result);

        // Update button to "Next"
        document.getElementById('submitBtn').textContent = 
            state.currentIndex < state.questions.length - 1 ? 'Next Question' : 'View Results';
        document.getElementById('submitBtn').onclick = nextQuestion;
    } catch (error) {
        alert('Failed to submit answer: ' + error.message);
    }
}

// Display feedback
function displayFeedback(result, wasTimeout = false) {
    const feedback = document.getElementById('feedback');
    feedback.classList.remove('hidden', 'correct', 'incorrect');

    // Check timeout condition more carefully
    const isActualTimeout = (wasTimeout === true || result.timed_out === true);
    
    if (isActualTimeout) {
        // Timeout feedback
        feedback.classList.add('incorrect');
        feedback.innerHTML = `
            ⏰ Time's up!<br>
            <small>Correct answer: <strong>${result.correct_answer}</strong></small>
        `;
        playErrorSound();
    } else if (result.correct) {
        feedback.classList.add('correct');
        feedback.innerHTML = `✅ Correct! Well done!`;
        playSuccessSound(); // Play success sound
    } else if (result.partial_credit) {
        // Partial credit for accent/aspiration errors
        feedback.classList.add('incorrect');
        feedback.innerHTML = `
            ⚠️ Almost! Check accents/aspirations (0.5 points)<br>
            <small>You answered: <strong>${result.user_answer}</strong></small><br>
            <small>Correct answer: <strong>${result.correct_answer}</strong></small>
        `;
        playErrorSound(); // Play error sound (softer than full error)
    } else {
        feedback.classList.add('incorrect');
        feedback.innerHTML = `
            ❌ Incorrect<br>
            <small>You answered: <strong>${result.user_answer}</strong></small><br>
            <small>Correct answer: <strong>${result.correct_answer}</strong></small>
        `;
        playErrorSound(); // Play error sound
    }

    document.getElementById('answerInput').disabled = true;
}

// Next question or show summary
function nextQuestion() {
    document.getElementById('answerInput').disabled = false;
    state.currentIndex++;

    if (state.currentIndex < state.questions.length) {
        displayQuestion();
    } else {
        showSummary();
    }
}

// Show summary
// Show summary
async function showSummary() {
    try {
        const response = await fetch(`${API_BASE}/quiz/${state.sessionId}/summary`);
        const summary = await response.json();

        // Save progress for this quiz
        saveQuizProgress(summary);
        
        // Update progress display immediately
        updateProgressDisplay();

        document.getElementById('scorePercentage').textContent = summary.score_percentage + '%';
        document.getElementById('correctCount').textContent = 
            `${summary.correct_count}/${summary.total_questions}`;

        // Display incorrect and partial credit words
        const incorrectList = document.getElementById('incorrectList');
        let html = '';
        
        // Show fully incorrect words
        if (summary.incorrect_words.length > 0) {
            html += '<h3>Review These Words (0 points):</h3>';
            summary.incorrect_words.forEach(item => {
                html += `
                    <div class="incorrect-item">
                        <strong>${item.prompt}</strong> → ${item.correct_answer}
                        <br><small style="color: #856404;">You answered: ${item.user_answer || '(no answer)'}</small>
                    </div>
                `;
            });
        }
        
        // Show partial credit words (accent errors)
        if (summary.partial_credit_words && summary.partial_credit_words.length > 0) {
            html += '<h3 style="margin-top: 20px;">Check Accents/Aspirations (0.5 points each):</h3>';
            summary.partial_credit_words.forEach(item => {
                html += `
                    <div class="incorrect-item" style="border-left: 3px solid #ffc107;">
                        <strong>${item.prompt}</strong> → ${item.correct_answer}
                        <br><small style="color: #856404;">You answered: ${item.user_answer}</small>
                    </div>
                `;
            });
        }
        
        if (summary.incorrect_words.length === 0 && 
            (!summary.partial_credit_words || summary.partial_credit_words.length === 0)) {
            html = '<p style="text-align: center; color: #28a745; font-weight: 600;">🎉 Perfect score! You got all answers correct!</p>';
        }
        
        incorrectList.innerHTML = html;

        // Show retake option if:
        // 1. User went through training (wasTrainingSession)
        // 2. Score is not 100%
        // 3. We have word pairs to reuse
        const retakeSection = document.getElementById('retakeSection');
        if (state.wasTrainingSession && 
            summary.score_percentage < 100 && 
            state.wordPairs.length > 0) {
            retakeSection.style.display = 'block';
        } else {
            retakeSection.style.display = 'none';
        }

        showScreen('summaryScreen');
    } catch (error) {
        alert('Failed to load summary: ' + error.message);
    }
}

// Save quiz progress to localStorage
function saveQuizProgress(summary) {
    const direction = document.getElementById('direction').value;
    
    console.log('[Save Progress] Starting...');
    console.log('[Save Progress] Direction:', direction);
    console.log('[Save Progress] Word pairs:', state.wordPairs);
    console.log('[Save Progress] Answers:', state.answers);
    console.log('[Save Progress] Summary:', summary);
    
    // Get progress data once
    const progress = getProgressData();
    let correctlySavedCount = 0;
    let skippedCount = 0;
    
    // Use state.answers array which has the actual results for each question
    // state.answers[i].correct is true if fully correct, false if wrong
    // state.answers[i].partial_credit is true if accent/aspiration error
    state.wordPairs.forEach((wordPair, index) => {
        const lesson = wordPair.lesson;
        
        // Validate lesson exists
        if (!lesson) {
            console.warn(`[Save Progress] Skipping word ${index}: No lesson info for`, wordPair);
            skippedCount++;
            return;
        }
        
        // Get the answer result for this question
        const answerResult = state.answers[index];
        
        // Validate answer exists
        if (!answerResult) {
            console.warn(`[Save Progress] Skipping word ${index}: No answer recorded for`, wordPair);
            skippedCount++;
            return;
        }
        
        // Debug: log the full answer result
        console.log(`[Save Progress] Answer object for word ${index}:`, answerResult);
        
        // A word is mastered only if it was answered 100% correctly
        // Don't save partial credit (accent errors) as mastered
        const wasFullyCorrect = answerResult.correct === true && !answerResult.partial_credit;
        
        console.log(`[Save Progress] Word ${index}: ${wordPair.greek} ↔ ${wordPair.bulgarian}, Lesson ${lesson}`);
        console.log(`[Save Progress]   - correct: ${answerResult.correct}, partial_credit: ${answerResult.partial_credit}, wasFullyCorrect: ${wasFullyCorrect}`);
        
        // Create unique key for this word
        const wordKey = createWordKey(wordPair.greek, wordPair.bulgarian, lesson);
        const progressKey = `${direction}_${lesson}_${wordKey}`;
        
        if (wasFullyCorrect) {
            // Mark word as correctly answered and mastered
            progress.wordProgress[progressKey] = {
                greek: wordPair.greek,
                bulgarian: wordPair.bulgarian,
                lesson: lesson,
                direction: direction,
                correct: true,
                lastSeen: new Date().toISOString()
            };
            correctlySavedCount++;
            console.log(`[Save Progress] ✓ Saved as mastered: ${progressKey}`);
        } else {
            console.log(`[Save Progress] ✗ NOT saved (incorrect or partial): ${progressKey}`);
        }
        // If incorrect or partial credit, don't save - they'll appear in future quizzes
    });
    
    // Save once at the end
    saveProgressData(progress);
    
    console.log(`[Save Progress] Complete!`);
    console.log(`[Save Progress] - Total words in quiz: ${state.wordPairs.length}`);
    console.log(`[Save Progress] - Fully correct & saved: ${correctlySavedCount}`);
    console.log(`[Save Progress] - Skipped (no lesson/answer): ${skippedCount}`);
    console.log(`[Save Progress] - Total mastered words in storage: ${Object.keys(progress.wordProgress).length}`);
}

// Retake exam with same words after training
function retakeExam() {
    // Reset answers but keep the same word pairs
    state.answers = Array(state.wordPairs.length).fill(null);
    state.wasTrainingSession = true; // Keep the flag so retake option remains available
    
    // Start quiz with the same word pairs
    startQuizAfterTraining();
}

// Restart quiz
function restartQuiz() {
    stopTimer(); // Stop any running timer
    showScreen('setupScreen');
    state.sessionId = null;
    state.questions = [];
    state.currentIndex = 0;
    state.answers = [];
    state.trainingCompleted = false;
    state.mode = 'exam';
    state.wordPairs = [];  // Clear stored word pairs
}

// Show screen
function showScreen(screenId) {
    document.querySelectorAll('.setup-screen, .quiz-screen, .summary-screen, .training-screen')
        .forEach(screen => screen.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Handle Enter key
document.addEventListener('keypress', (e) => {
    // Initialize audio on first interaction
    initAudioContext();
    
    if (e.key === 'Enter') {
        const activeScreen = document.querySelector('.setup-screen.active, .quiz-screen.active, .training-screen.active');
        if (activeScreen) {
            if (activeScreen.id === 'setupScreen') {
                startSession();
            } else if (activeScreen.id === 'quizScreen') {
                document.getElementById('submitBtn').click();
            } else if (activeScreen.id === 'trainingScreen') {
                nextTrainingWord();
            }
        }
    }
});

// Initialize audio on any click (for autoplay policy)
document.addEventListener('click', () => {
    initAudioContext();
}, { once: false });

// Close modal when clicking outside
document.getElementById('lessonsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'lessonsModal') {
        closeLessonsModal();
    }
});

// Close mastered words modal when clicking outside
document.getElementById('masteredWordsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'masteredWordsModal') {
        closeMasteredWordsModal();
    }
});

// Initialize on load
init();

