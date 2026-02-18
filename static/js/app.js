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
    selectedLessons: [], // Selected lesson numbers (Greek only)
    availableLessons: [], // All available lessons (Greek only)
    languageMode: 'greek', // 'greek', 'latin', 'spanish', or 'literature'
    currentDirection: 'greek_to_bulgarian', // Current quiz direction
    literatureTopicId: null // Selected literature topic id (literature mode)
};

// API base URL
const API_BASE = window.location.origin + '/api';

// ==================== Word Progress Tracking ====================

const STORAGE_KEY_PREFIX = 'languageTrainerProgress';

// Get storage key for current language mode
function getStorageKey() {
    return `${STORAGE_KEY_PREFIX}_${state.languageMode}`;
}

// Create unique key for a word
// Normalize by removing all non-word chars and converting to lowercase for consistency
function createWordKey(word1, word2, lesson) {
    // Literature progress is tracked by (topic_id, question_id) instead of free text.
    // We overload the params as: word1 = question_id, lesson = topic_id.
    if (state.languageMode === 'literature') {
        const topicId = String(lesson ?? 'no-topic');
        const questionId = String(word1 ?? 'no-question');
        return `${topicId}_${questionId}`;
    }

    // Prefer Unicode-aware normalization to support Spanish (ñ, á, ¿, etc.) and Greek.
    // Fallback to legacy regex if the runtime doesn't support Unicode property escapes.
    let clean1 = '';
    let clean2 = '';
    try {
        clean1 = (word1 || '').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
        clean2 = (word2 || '').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
    } catch (e) {
        clean1 = (word1 || '').replace(/[^\wα-ωΑ-Ωa-zA-Z]/g, '').toLowerCase();
        clean2 = (word2 || '').replace(/[^\wа-яА-Яa-zA-Z]/g, '').toLowerCase();
    }
    const lessonPart = lesson !== undefined && lesson !== null ? `${lesson}_` : '';
    return `${lessonPart}${clean1}_${clean2}`;
}

// Get list of correctly answered literature questions for a topic
function getCorrectLiteratureQuestions(topicId, direction) {
    const progress = getProgressData();
    const correct = [];

    for (const key in progress.wordProgress) {
        const entry = progress.wordProgress[key];
        if (entry?.correct === true && entry.direction === direction && entry.topic_id === topicId) {
            correct.push({
                topic_id: entry.topic_id,
                question_id: entry.question_id
            });
        }
    }

    return correct;
}

// Get progress data from localStorage
function getProgressData() {
    try {
        const data = localStorage.getItem(getStorageKey());
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
        localStorage.setItem(getStorageKey(), jsonString);
        console.log(`[INFO] Saved progress for ${state.languageMode}: ${Object.keys(data.wordProgress).length} entries`);
    } catch (error) {
        console.error('[ERROR] Failed to save progress data:', error);
    }
}

// Reset all progress for current language mode
function resetAllProgress() {
    const modeLabel = state.languageMode === 'greek'
        ? 'Greek'
        : (state.languageMode === 'latin'
            ? 'Latin'
            : (state.languageMode === 'spanish'
                ? 'Spanish'
                : 'Literature'));
    if (confirm(`Are you sure you want to reset ALL ${modeLabel} progress? This cannot be undone!`)) {
        localStorage.removeItem(getStorageKey());
        console.log(`Progress reset for ${state.languageMode}`);
        updateProgressDisplay();
        alert('Progress has been reset!');
    }
}

// Mark word as correctly answered for specific direction and lesson
function markWordCorrect(word1, word2, lesson, direction) {
    const progress = getProgressData();
    const wordKey = createWordKey(word1, word2, lesson);
    const progressKey = `${direction}_${lesson || 'no-lesson'}_${wordKey}`;
    
    const wordData = {
        word1,  // greek or latin
        word2: word2,  // bulgarian
        lesson,
        direction,
        correct: true,
        lastSeen: new Date().toISOString()
    };
    
    progress.wordProgress[progressKey] = wordData;
    saveProgressData(progress);
}

// Check if word was correctly answered for specific direction and lesson
function isWordCorrect(word1, word2, lesson, direction) {
    const progress = getProgressData();
    const wordKey = createWordKey(word1, word2, lesson);
    const progressKey = `${direction}_${lesson || 'no-lesson'}_${wordKey}`;
    
    return progress.wordProgress[progressKey]?.correct === true;
}

// Reset progress for specific lessons and direction
function resetProgress(lessons, direction) {
    const progress = getProgressData();
    const keysToDelete = [];
    
    for (const key in progress.wordProgress) {
        const entry = progress.wordProgress[key];
        if (lessons && lessons.length > 0) {
            if (lessons.includes(entry.lesson) && entry.direction === direction) {
                keysToDelete.push(key);
            }
        } else {
            // For Latin/Spanish (no lessons), just match direction
            if (entry.direction === direction) {
                keysToDelete.push(key);
            }
        }
    }
    
    keysToDelete.forEach(key => delete progress.wordProgress[key]);
    saveProgressData(progress);
    
    console.log(`Reset progress: ${keysToDelete.length} words for ${direction} direction`);
}

// Get progress statistics for selected lessons and direction
function getProgressStats(lessons, direction, totalWords) {
    const progress = getProgressData();
    let correctCount = 0;
    
    for (const key in progress.wordProgress) {
        const entry = progress.wordProgress[key];
        if (lessons && lessons.length > 0) {
            if (lessons.includes(entry.lesson) && entry.direction === direction && entry.correct) {
                correctCount++;
            }
        } else {
            // For Latin/Spanish (no lessons), just match direction
            if (entry.direction === direction && entry.correct) {
                correctCount++;
            }
        }
    }
    
    return {
        correctCount,
        totalWords,
        percentage: totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0
    };
}

// View mastered words for a specific lesson
function viewMasteredWords(lesson = null) {
    const direction = document.getElementById('direction').value;
    const progress = getProgressData();
    const masteredWords = [];
    
    for (const key in progress.wordProgress) {
        const entry = progress.wordProgress[key];
        
        // For lesson-based modes: filter by lesson
        // For phrase modes: show all for current direction (lesson will be null)
        const lessonMatch = (state.config && state.config.has_lessons)
            ? (entry.lesson === lesson)
            : (lesson === null || lesson === undefined);
        
        // For mixed mode, include both directions
        let directionMatch;
        if (direction === 'latin_mixed') {
            directionMatch = (entry.direction === 'latin_to_bulgarian' || entry.direction === 'bulgarian_to_latin');
        } else if (direction === 'spanish_mixed') {
            directionMatch = (entry.direction === 'spanish_to_bulgarian' || entry.direction === 'bulgarian_to_spanish');
        } else {
            directionMatch = (entry.direction === direction);
        }
            
        if (lessonMatch && directionMatch && entry.correct) {
            masteredWords.push({
                word1: entry.word1,
                word2: entry.word2,
                lastSeen: entry.lastSeen,
                actualDirection: entry.direction  // Store actual direction for proper display
            });
        }
    }
    
    if (masteredWords.length === 0) {
        const msg = state.languageMode === 'greek' 
            ? `No mastered words found for Lesson ${lesson}` 
            : `No mastered words found for this direction`;
        alert(msg);
        return;
    }
    
    // Sort by last seen date (most recent first)
    masteredWords.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
    
    // Get direction label based on language mode
    let directionLabel;
    if (state.languageMode === 'greek') {
        directionLabel = direction === 'greek_to_bulgarian' ? 
            'Greek → Bulgarian' : 'Bulgarian → Greek';
    } else if (state.languageMode === 'latin') {
        if (direction === 'latin_to_bulgarian') {
            directionLabel = 'Latin → Bulgarian';
        } else if (direction === 'bulgarian_to_latin') {
            directionLabel = 'Bulgarian → Latin';
        } else {
            directionLabel = 'Latin Mixed';
        }
    } else if (state.languageMode === 'spanish') {
        if (direction === 'spanish_to_bulgarian') {
            directionLabel = 'Spanish → Bulgarian';
        } else if (direction === 'bulgarian_to_spanish') {
            directionLabel = 'Bulgarian → Spanish';
        } else {
            directionLabel = 'Spanish Mixed';
        }
    }
    
    // Populate modal
    const modal = document.getElementById('masteredWordsModal');
    const statsDivElement = document.getElementById('masteredWordsStats');
    const listDiv = document.getElementById('masteredWordsList');
    
    // Hide/show direction filter dropdown (not needed for Latin since we already filter by direction)
    const directionFilterDiv = document.querySelector('#masteredWordsModal > .modal-content > div:first-of-type');
    if (directionFilterDiv && (state.languageMode === 'latin' || state.languageMode === 'spanish')) {
        directionFilterDiv.style.display = 'none';
    } else if (directionFilterDiv) {
        directionFilterDiv.style.display = 'block';
    }
    
    // Update stats
    if (state.languageMode === 'greek') {
        statsDivElement.innerHTML = `
            <strong>Lesson ${lesson}</strong><br>
            Direction: ${directionLabel}<br>
            Total mastered words: ${masteredWords.length}
        `;
    } else {
        statsDivElement.innerHTML = `
            <strong>${state.languageMode === 'latin' ? 'Latin' : (state.languageMode === 'spanish' ? 'Spanish' : 'Language')}</strong><br>
            Direction: ${directionLabel}<br>
            Total mastered words: ${masteredWords.length}
        `;
    }
    
    // Build word list
    let listHtml = '<div style="font-family: monospace;">';
    masteredWords.forEach((word, index) => {
        const lastSeenDate = new Date(word.lastSeen).toLocaleDateString();
        const lastSeenTime = new Date(word.lastSeen).toLocaleTimeString();
        
        // Determine display order based on direction
        // For X_to_bulgarian directions: show word1 (source) → word2 (bulgarian)
        // For bulgarian_to_X directions: show word2 (bulgarian) → word1 (source)
        let questionWord, answerWord;
        
        // For mixed mode, use the actual direction of each word
        const displayDirection = ((direction === 'latin_mixed' || direction === 'spanish_mixed') && word.actualDirection) 
            ? word.actualDirection 
            : direction;
        
        if (displayDirection.endsWith('_to_bulgarian')) {
            // Latin/Greek → Bulgarian
            questionWord = word.word1;
            answerWord = word.word2;
        } else {
            // Bulgarian → Latin/Greek
            questionWord = word.word2;
            answerWord = word.word1;
        }
        
        listHtml += `
            <div style="padding: 8px; margin-bottom: 5px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #4caf50;">
                <div style="font-size: 1.1em; margin-bottom: 3px;">
                    <strong>${questionWord}</strong> → ${answerWord}
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
    // Restore previously selected language mode from localStorage
    const savedLanguageMode = localStorage.getItem('selectedLanguageMode');
    if (savedLanguageMode && (savedLanguageMode === 'greek' || savedLanguageMode === 'latin' || savedLanguageMode === 'spanish' || savedLanguageMode === 'literature')) {
        const languageSelect = document.getElementById('languageMode');
        if (languageSelect) {
            languageSelect.value = savedLanguageMode;
        }
    }
    
    // Load language mode (either saved or default Greek)
    await switchLanguageMode();
}

// Switch language mode
async function switchLanguageMode() {
    const languageSelect = document.getElementById('languageMode');
    state.languageMode = languageSelect ? languageSelect.value : 'greek';
    
    // Save selected language mode to localStorage
    localStorage.setItem('selectedLanguageMode', state.languageMode);
    
    try {
        const response = await fetch(`${API_BASE}/config?language_mode=${state.languageMode}`);
        state.config = await response.json();
        
        // Update title & subtitle
        const title = document.getElementById('appTitle');
        const subtitle = document.getElementById('appSubtitle');
        if (state.languageMode === 'greek') {
            title.textContent = '🏛️ Ancient Greek Trainer';
            if (subtitle) subtitle.textContent = 'Test your vocabulary knowledge';
        } else if (state.languageMode === 'latin') {
            title.textContent = '🏟️ Latin Trainer';
            if (subtitle) subtitle.textContent = 'Test your vocabulary knowledge';
        } else if (state.languageMode === 'spanish') {
            title.textContent = '🇪🇸 Spanish Trainer';
            if (subtitle) subtitle.textContent = 'Test your vocabulary knowledge';
        } else {
            title.textContent = '📖 Литература';
            if (subtitle) subtitle.textContent = 'Отговори на въпроси и получи оценка';
        }
        
        // Update direction options
        const directionSelect = document.getElementById('direction');
        directionSelect.innerHTML = '';
        state.config.directions.forEach(dir => {
            const option = document.createElement('option');
            option.value = dir.value;
            option.textContent = dir.label;
            directionSelect.appendChild(option);
        });
        
        // Update "Use all words" checkbox label
        const useAllWordsLabel = document.getElementById('useAllWordsLabel');
        if (useAllWordsLabel) {
            if (state.languageMode === 'greek') {
                useAllWordsLabel.textContent = 'Use all available words from selected lessons';
            } else if (state.languageMode === 'latin' || state.languageMode === 'spanish') {
                useAllWordsLabel.textContent = 'Use all available words';
            } else {
                useAllWordsLabel.textContent = 'Използвай всички въпроси по темата';
            }
        }

        // Localize setup labels for literature
        const sessionModeLabel = document.querySelector('label[for="sessionMode"]');
        const directionLabel = document.querySelector('label[for="direction"]');
        const wordCountLabel = document.querySelector('label[for="wordCount"]');
        const timeLabel = document.querySelector('label[for="timePerQuestion"]');
        const sessionModeSelect = document.getElementById('sessionMode');
        if (state.languageMode === 'literature') {
            if (sessionModeLabel) sessionModeLabel.textContent = 'Режим:';
            if (directionLabel) directionLabel.textContent = 'Тип тест:';
            if (wordCountLabel) wordCountLabel.textContent = 'Брой въпроси:';
            if (timeLabel) timeLabel.textContent = 'Време за въпрос (секунди):';
            if (sessionModeSelect) {
                sessionModeSelect.options[0].textContent = 'Тренировка + Изпит';
                sessionModeSelect.options[1].textContent = 'Само изпит';
            }
            const answerInput = document.getElementById('answerInput');
            if (answerInput) answerInput.placeholder = 'Въведи отговор...';

            const startBtn = document.getElementById('startSessionBtn');
            if (startBtn) startBtn.textContent = 'Старт';
            const trainingTitle = document.getElementById('trainingTitle');
            if (trainingTitle) trainingTitle.textContent = '📚 Тренировка';
            const summaryTitle = document.getElementById('summaryTitle');
            if (summaryTitle) summaryTitle.textContent = 'Резултати 🎉';
            const timerLabel = document.getElementById('timerLabel');
            if (timerLabel) timerLabel.textContent = 'Оставащо време:';

            const trainingAnswerLabel = document.getElementById('trainingAnswerLabel');
            if (trainingAnswerLabel) trainingAnswerLabel.textContent = 'Еталонен отговор:';
        } else {
            if (sessionModeLabel) sessionModeLabel.textContent = 'Session Mode:';
            if (directionLabel) directionLabel.textContent = 'Quiz Direction:';
            if (wordCountLabel) wordCountLabel.textContent = 'Number of Words:';
            if (timeLabel) timeLabel.textContent = 'Time per Question (seconds):';
            if (sessionModeSelect) {
                sessionModeSelect.options[0].textContent = 'Training + Exam';
                sessionModeSelect.options[1].textContent = 'Exam Only';
            }
            const answerInput = document.getElementById('answerInput');
            if (answerInput) answerInput.placeholder = 'Type your answer...';

            const startBtn = document.getElementById('startSessionBtn');
            if (startBtn) startBtn.textContent = 'Start Session';
            const trainingTitle = document.getElementById('trainingTitle');
            if (trainingTitle) trainingTitle.textContent = '📚 Training Mode';
            const summaryTitle = document.getElementById('summaryTitle');
            if (summaryTitle) summaryTitle.textContent = 'Quiz Complete! 🎉';
            const timerLabel = document.getElementById('timerLabel');
            if (timerLabel) timerLabel.textContent = 'Time Remaining:';

            const trainingAnswerLabel = document.getElementById('trainingAnswerLabel');
            if (trainingAnswerLabel) trainingAnswerLabel.textContent = 'Translation:';
        }
        
        // Show/hide lessons/topics group based on whether language has lessons
        const lessonsGroup = document.getElementById('lessonsGroup');
        const topicsGroup = document.getElementById('topicsGroup');

        if (state.languageMode === 'literature') {
            if (topicsGroup) topicsGroup.style.display = 'block';
            if (lessonsGroup) lessonsGroup.style.display = 'none';
            state.availableLessons = [];
            state.selectedLessons = [];

            const topics = state.config.topics || [];
            const topicSelect = document.getElementById('literatureTopic');
            if (topicSelect) {
                topicSelect.innerHTML = '';
                topics.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.topic_id;
                    opt.textContent = t.title;
                    topicSelect.appendChild(opt);
                });

                const savedTopic = localStorage.getItem('selectedLiteratureTopicId');
                if (savedTopic && topics.some(t => t.topic_id === savedTopic)) {
                    topicSelect.value = savedTopic;
                }
                state.literatureTopicId = topicSelect.value || (topics[0]?.topic_id ?? null);
                if (state.literatureTopicId) {
                    localStorage.setItem('selectedLiteratureTopicId', state.literatureTopicId);
                }
            }

            await onLiteratureTopicChange();
        } else {
            if (topicsGroup) topicsGroup.style.display = 'none';
        }

        if (state.config.has_lessons) {
            lessonsGroup.style.display = 'block';
            state.availableLessons = state.config.available_lessons || [];
            renderLessonsSelector();
            selectAllLessons();
        } else {
            lessonsGroup.style.display = 'none';
            state.availableLessons = [];
            state.selectedLessons = [];
        }
        
        // Update other config settings
        document.getElementById('wordCount').max = state.config.max_count;
        document.getElementById('timePerQuestion').value = state.config.default_time_per_question || 60;
        document.getElementById('timePerQuestion').min = state.config.min_time_per_question || 10;
        document.getElementById('timePerQuestion').max = state.config.max_time_per_question || 300;
        
        // Update keyboard visibility
        updateKeyboardVisibility();
        
        // Update progress display
        updateProgressDisplay();
        
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

// Handle literature topic change
async function onLiteratureTopicChange() {
    if (state.languageMode !== 'literature') return;
    const topicSelect = document.getElementById('literatureTopic');
    if (!topicSelect) return;

    state.literatureTopicId = topicSelect.value || null;
    if (state.literatureTopicId) {
        localStorage.setItem('selectedLiteratureTopicId', state.literatureTopicId);
    }

    // Fetch question count for the selected topic
    try {
        const direction = document.getElementById('direction')?.value || 'literature_qa';
        const resp = await fetch(`${API_BASE}/words-count`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language_mode: state.languageMode,
                direction,
                topic_id: state.literatureTopicId
            })
        });
        const data = await resp.json();
        const countEl = document.getElementById('literatureQuestionsCount');
        if (countEl) countEl.textContent = String(data.count || 0);
    } catch (e) {
        console.error('Failed to load literature question count:', e);
        const countEl = document.getElementById('literatureQuestionsCount');
        if (countEl) countEl.textContent = '0';
    }

    // Update progress display for this topic
    updateProgressDisplay();
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
        const direction = document.getElementById('direction')?.value;
        const response = await fetch(`${API_BASE}/words-count`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language_mode: state.languageMode,
                direction: direction,
                selected_lessons: state.selectedLessons
            })
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
    
    const progress = getProgressData();
    
    // Get direction label based on language mode
    let directionLabel;
    if (state.languageMode === 'greek') {
        directionLabel = direction === 'greek_to_bulgarian' ? 
            'Greek → Bulgarian' : 'Bulgarian → Greek';
    } else if (state.languageMode === 'latin') {
        if (direction === 'latin_to_bulgarian') {
            directionLabel = 'Latin → Bulgarian';
        } else if (direction === 'bulgarian_to_latin') {
            directionLabel = 'Bulgarian → Latin';
        } else {
            directionLabel = 'Latin Mixed';
        }
    } else if (state.languageMode === 'spanish') {
        if (direction === 'spanish_to_bulgarian') {
            directionLabel = 'Spanish → Bulgarian';
        } else if (direction === 'bulgarian_to_spanish') {
            directionLabel = 'Bulgarian → Spanish';
        } else {
            directionLabel = 'Spanish Mixed';
        }
    }
    
    // Handle Literature mode (topics)
    if (state.languageMode === 'literature') {
        if (!state.literatureTopicId) {
            progressSummary.style.display = 'none';
            return;
        }

        // Count mastered questions for current topic
        let masteredCount = 0;
        for (const key in progress.wordProgress) {
            const entry = progress.wordProgress[key];
            if (entry?.correct && entry.direction === direction && entry.topic_id === state.literatureTopicId) {
                masteredCount++;
            }
        }

        // Total questions in topic
        let totalCount = 0;
        try {
            const response = await fetch(`${API_BASE}/words-count`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    language_mode: state.languageMode,
                    direction: direction,
                    topic_id: state.literatureTopicId
                })
            });
            const data = await response.json();
            totalCount = data.count || 0;
        } catch (error) {
            console.error('Failed to get literature question count:', error);
        }

        if (masteredCount === 0) {
            progressSummary.style.display = 'none';
            return;
        }

        const percentage = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;
        let html = `<div style="margin-bottom: 5px;"><strong>Тема</strong>: ${state.literatureTopicId}</div>`;
        html += `<div style="margin: 5px 0;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
                <span style="font-weight: 500;">Овладени: ${masteredCount}/${totalCount} (${percentage}%)</span>
            </div>
            <div style="width: 100%; height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden;">
                <div style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, #4caf50 0%, #66bb6a 100%); transition: width 0.3s ease;"></div>
            </div>
        </div>`;
        html += `<div style="margin: 10px 0; display: flex; align-items: center;">
            <button type="button" onclick="resetAllProgress()" style="padding: 2px 6px; font-size: 1.00em; background: #ff5252; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️ Reset Progress</button>
        </div>`;

        progressStats.innerHTML = html;
        progressSummary.style.display = 'block';
        return;
    }

    // Handle lesson-based modes (Greek / Spanish)
    if (state.config && state.config.has_lessons) {
        if (state.selectedLessons.length === 0) {
            progressSummary.style.display = 'none';
            return;
        }
        
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
                    body: JSON.stringify({ 
                        language_mode: state.languageMode,
                        selected_lessons: [lesson] 
                    })
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
    } else {
        // Phrase modes (no lessons): Latin (and legacy Spanish)
        // Count mastered words for current direction
        let masteredCount = 0;
        for (const key in progress.wordProgress) {
            const entry = progress.wordProgress[key];
            // For mixed mode, count both directions
            if (direction === 'latin_mixed') {
                if ((entry.direction === 'latin_to_bulgarian' || entry.direction === 'bulgarian_to_latin') && entry.correct) masteredCount++;
            } else if (direction === 'spanish_mixed') {
                if ((entry.direction === 'spanish_to_bulgarian' || entry.direction === 'bulgarian_to_spanish') && entry.correct) masteredCount++;
            } else if (entry.direction === direction && entry.correct) {
                masteredCount++;
            }
        }
        
        // Get total words count from server
        let totalCount = 0;
        try {
            const response = await fetch(`${API_BASE}/words-count`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    language_mode: state.languageMode,
                    direction: direction,
                    selected_lessons: []
                })
            });
            const data = await response.json();
            totalCount = data.count;
        } catch (error) {
            console.error('Failed to get word count:', error);
        }
        
        // Check if any progress exists
        if (masteredCount === 0) {
            progressSummary.style.display = 'none';
            return;
        }
        
        // Build display
        const percentage = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;
        let html = `<div style="margin-bottom: 5px;"><strong>${directionLabel}</strong></div>`;
        html += `<div style="margin: 5px 0;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
                <span style="font-weight: 500;">Mastered: ${masteredCount}/${totalCount} (${percentage}%)</span>
                <button type="button" onclick="viewMasteredWords()" style="padding: 2px 8px; font-size: 0.75em; background: #2196f3; color: white; border: none; border-radius: 3px; cursor: pointer; margin-left: 8px;">👁️ View</button>
            </div>
            <div style="width: 100%; height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden;">
                <div style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, #4caf50 0%, #66bb6a 100%); transition: width 0.3s ease;"></div>
            </div>
        </div>`;
        
        // Add reset progress button
        html += `<div style="margin: 10px 0; display: flex; align-items: center;">
            <button type="button" onclick="resetAllProgress()" style="padding: 2px 6px; font-size: 1.00em; background: #ff5252; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️ Reset Progress</button>
        </div>`;
        
        progressStats.innerHTML = html;
        progressSummary.style.display = 'block';
    }
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
    state.currentDirection = direction; // Store current direction
    let count = parseInt(document.getElementById('wordCount').value);
    const timePerQuestion = parseInt(document.getElementById('timePerQuestion').value);
    const useAllWords = document.getElementById('useAllWords').checked;
    const randomOrderCheckbox = document.getElementById('randomOrder');
    const randomOrder = randomOrderCheckbox ? randomOrderCheckbox.checked : true;

    // Validate lesson selection for lesson-based modes (Greek / Spanish)
    if (state.config && state.config.has_lessons && state.selectedLessons.length === 0) {
        alert('Please select at least one lesson');
        return;
    }

    // Validate topic selection for Literature mode
    if (state.languageMode === 'literature' && !state.literatureTopicId) {
        alert('Моля, изберете тема');
        return;
    }

    // Get available words count
    let availableWords;
    if (state.config && state.config.has_lessons) {
        availableWords = parseInt(document.getElementById('availableWordsCount').textContent) || 0;
    } else {
        // For Latin/Spanish/Literature, get count from API
        const countResponse = await fetch(`${API_BASE}/words-count`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language_mode: state.languageMode,
                direction: direction,
                topic_id: state.languageMode === 'literature' ? state.literatureTopicId : undefined
            })
        });
        const countData = await countResponse.json();
        availableWords = countData.count || 0;
    }
    
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
            alert(`Only ${availableWords} words are available. Your selection will be limited to ${availableWords} words.`);
            count = availableWords;
            document.getElementById('wordCount').value = availableWords;
        }
        
        // Final check - if no words available
        if (availableWords === 0) {
            alert('No words available.');
            return;
        }
    }

    // Store time per question in state
    state.timePerQuestion = timePerQuestion;

    // Get list of words already answered correctly for this direction
    const excludeWords = (state.config && state.config.has_lessons)
        ? getCorrectWordsForLessons(state.selectedLessons, direction)
        : (state.languageMode === 'literature'
            ? getCorrectLiteratureQuestions(state.literatureTopicId, direction)
            : (direction === 'latin_mixed' 
                ? [...getCorrectWordsForDirection('latin_to_bulgarian'), ...getCorrectWordsForDirection('bulgarian_to_latin')]
                : (direction === 'spanish_mixed'
                    ? [...getCorrectWordsForDirection('spanish_to_bulgarian'), ...getCorrectWordsForDirection('bulgarian_to_spanish')]
                    : getCorrectWordsForDirection(direction))));
    console.log(`Excluding ${excludeWords.length} correctly answered words`);

    // When use_all_words is true, count is ignored by backend, but we still need to send a valid value (>= 1)
    if (useAllWords && (!count || count < 1)) {
        count = 1;  // Send placeholder value when using all words
    }

    try {
        const requestBody = {
            language_mode: state.languageMode,
            direction,
            count,
            time_per_question: timePerQuestion,
            selected_lessons: (state.config && state.config.has_lessons) ? state.selectedLessons : [],
            topic_id: state.languageMode === 'literature' ? state.literatureTopicId : null,
            use_all_words: useAllWords,
            exclude_correct_words: excludeWords,
            random_order: randomOrder
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
    const foreignKey = state.languageMode === 'spanish' ? 'spanish' : 'greek';
    
    for (const key in progress.wordProgress) {
        const entry = progress.wordProgress[key];
        if (entry.correct && 
            entry.direction === direction && 
            lessons.includes(entry.lesson)) {
            correctWords.push({
                [foreignKey]: entry.word1,
                bulgarian: entry.word2,
                lesson: entry.lesson
            });
        }
    }
    
    return correctWords;
}

// Get list of correctly answered words for specific direction (phrase modes - no lessons)
function getCorrectWordsForDirection(direction) {
    const progress = getProgressData();
    const correctWords = [];
    const foreignKey = state.languageMode === 'spanish' ? 'spanish' : 'latin';
    
    for (const key in progress.wordProgress) {
        const entry = progress.wordProgress[key];
        if (entry.correct && entry.direction === direction) {
            correctWords.push({
                [foreignKey]: entry.word1,
                bulgarian: entry.word2
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
        state.languageMode === 'literature'
            ? `Въпрос ${state.currentIndex + 1} от ${state.questions.length}`
            : `Word ${state.currentIndex + 1} of ${state.questions.length}`;
    document.getElementById('trainingPromptLabel').textContent = question.prompt_label;
    document.getElementById('trainingPrompt').textContent = question.prompt;
    
    // Fetch the correct answer for this question
    fetchCorrectAnswer();

    const nextBtn = document.getElementById('trainingNextBtn');
    if (state.currentIndex === state.questions.length - 1) {
        nextBtn.textContent = state.languageMode === 'literature' ? 'Започни изпит' : 'Start Exam';
    } else {
        nextBtn.textContent = state.languageMode === 'literature' ? 'Следващ' : 'Next Word';
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
    const msg = state.languageMode === 'literature'
        ? 'Сигурни ли сте, че искате да пропуснете тренировката и да отидете директно на изпита?'
        : 'Are you sure you want to skip training and go directly to the exam?';
    if (confirm(msg)) {
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
                language_mode: state.languageMode,  // Include language mode
                direction, 
                count: state.wordPairs.length,
                word_pairs: state.wordPairs,  // Reuse the same words!
                time_per_question: state.timePerQuestion,  // Keep same time limit
                selected_lessons: (state.config && state.config.has_lessons) ? state.selectedLessons : [],
                topic_id: state.languageMode === 'literature' ? state.literatureTopicId : null
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
        state.languageMode === 'literature'
            ? `Въпрос ${state.currentIndex + 1} от ${state.questions.length}`
            : `Question ${state.currentIndex + 1} of ${state.questions.length}`;
    document.getElementById('questionLabel').textContent = question.prompt_label;

    // Literature: support MCQ rendering
    const questionTextEl = document.getElementById('questionText');
    if (state.languageMode === 'literature' && Array.isArray(question.choices) && question.choices.length > 0) {
        const escapeHtml = (s) => String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const choicesHtml = question.choices.map(c => {
            const key = escapeHtml(c.key);
            const text = escapeHtml(c.text);
            return `<div style="text-align:left; margin: 6px 0; padding: 10px 12px; border: 1px solid #e0e0e0; border-radius: 10px; background: #fff; cursor: pointer;" data-choice-key="${key}">
                <strong>${key})</strong> ${text}
            </div>`;
        }).join('');

        questionTextEl.innerHTML = `
            <div style="margin-bottom: 14px;">${escapeHtml(question.prompt)}</div>
            <div id="literatureChoices" style="margin-top: 10px;">${choicesHtml}</div>
            <div style="margin-top: 10px; font-size: 12px; color:#666; text-align:left;">Избери опция или въведи буквата (А/Б/В/Г).</div>
        `;

        // Click-to-fill
        const container = document.getElementById('literatureChoices');
        if (container) {
            container.querySelectorAll('[data-choice-key]')?.forEach(div => {
                div.addEventListener('click', () => {
                    const key = div.getAttribute('data-choice-key');
                    const input = document.getElementById('answerInput');
                    if (input && key) {
                        input.value = key;
                        input.focus();
                    }
                });
            });
        }

        const answerInput = document.getElementById('answerInput');
        if (answerInput) {
            answerInput.placeholder = 'Въведи: А, Б, В или Г';
        }
    } else {
        questionTextEl.textContent = question.prompt;
    }
    document.getElementById('answerInput').value = '';
    document.getElementById('feedback').classList.add('hidden');
    document.getElementById('answerInput').focus();
    document.getElementById('submitBtn').textContent = state.languageMode === 'literature' ? 'Предай отговор' : 'Submit Answer';
    document.getElementById('submitBtn').onclick = () => submitAnswer(false);
    
    // Update keyboard visibility based on direction
    updateKeyboardVisibility();

    // Start backend timer when the question is actually shown.
    // This avoids server-side timeouts while the user is still on the feedback screen.
    if (state.sessionId) {
        fetch(`${API_BASE}/quiz/${state.sessionId}/question/${state.currentIndex}/start`, {
            method: 'POST'
        }).catch(() => {
            // Best-effort: if this fails, backend will fallback to starting at submit time.
        });
    }
    
    // Start the timer for this question
    startTimer();
}

// Submit answer
async function submitAnswer(isTimeout = false) {
    // Stop the timer
    stopTimer();

    const answer = isTimeout ? '' : document.getElementById('answerInput').value.trim();
    const submitBtn = document.getElementById('submitBtn');
    const answerInput = document.getElementById('answerInput');
    const feedback = document.getElementById('feedback');

    if (!answer && !isTimeout) {
        alert(state.languageMode === 'literature' ? 'Моля, въведете отговор' : 'Please enter an answer');
        // Restart timer if user didn't actually submit
        startTimer();
        return;
    }

    // Prevent double-submit
    if (submitBtn?.disabled) return;

    // Literature: show loading sandbox while waiting for LLM grading
    if (state.languageMode === 'literature' && !isTimeout) {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('btn-loading');
            submitBtn.textContent = 'Оценявам...';
        }
        if (answerInput) answerInput.disabled = true;
        if (feedback) {
            feedback.classList.remove('hidden', 'correct', 'incorrect', 'loading');
            feedback.classList.add('loading');
            feedback.innerHTML = `
                <span class="spinner"></span>
                🤖 Изчакване на оценка от модела...<br>
                <small>Това може да отнеме няколко секунди.</small>
            `;
        }
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
            state.currentIndex < state.questions.length - 1
                ? (state.languageMode === 'literature' ? 'Следващ въпрос' : 'Next Question')
                : (state.languageMode === 'literature' ? 'Виж резултати' : 'View Results');
        document.getElementById('submitBtn').onclick = nextQuestion;
    } catch (error) {
        const msg = (state.languageMode === 'literature')
            ? ('Грешка при оценяване: ' + error.message)
            : ('Failed to submit answer: ' + error.message);
        alert(msg);

        // Restore input/button so user can retry
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('btn-loading');
            submitBtn.textContent = state.languageMode === 'literature' ? 'Предай отговор' : 'Submit Answer';
        }
        if (answerInput) answerInput.disabled = false;
    }
    finally {
        // Always clear loading state if it was set
        if (state.languageMode === 'literature' && submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('btn-loading');
        }
    }
}

// Display feedback
function displayFeedback(result, wasTimeout = false) {
    const feedback = document.getElementById('feedback');
    feedback.classList.remove('hidden', 'correct', 'incorrect', 'loading');

    // Check timeout condition more carefully
    const isActualTimeout = (wasTimeout === true || result.timed_out === true);
    
    // Literature mode feedback (LLM-graded)
    if (state.languageMode === 'literature') {
        if (isActualTimeout) {
            feedback.classList.add('incorrect');
            feedback.innerHTML = `
                ⏰ Времето изтече!<br>
                <small>Еталонен отговор:</small><br>
                <small><strong>${result.correct_answer || ''}</strong></small>
            `;
            playErrorSound();
        } else {
            const scorePercent = (result.score_percent !== undefined && result.score_percent !== null)
                ? result.score_percent
                : (result.correct ? 100 : 0);
            const masteredThreshold = 85;
            const isGood = scorePercent >= masteredThreshold;

            feedback.classList.add(isGood ? 'correct' : 'incorrect');
            const notes = result.notes ? `<br><small>Бележки:</small><br><small style="white-space: pre-line;">${String(result.notes)}</small>` : '';
            feedback.innerHTML = `
                📊 Оценка: <strong>${scorePercent}%</strong>
                ${notes}
                <br><small>Еталонен отговор:</small><br>
                <small><strong>${result.correct_answer || ''}</strong></small>
            `;

            if (isGood) {
                playSuccessSound();
            } else {
                playErrorSound();
            }
        }

        document.getElementById('answerInput').disabled = true;
        return;
    }

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

        // Literature summary (LLM-graded)
        if (state.languageMode === 'literature') {
            if (summary.incorrect_words.length > 0) {
                html += '<h3>Преглед на отговорите:</h3>';
                summary.incorrect_words.forEach(item => {
                    const score = (item.score_percent !== undefined && item.score_percent !== null)
                        ? item.score_percent
                        : 0;
                    const notes = item.notes ? `<br><small style="color:#555;">Бележки: ${item.notes}</small>` : '';
                    html += `
                        <div class="incorrect-item">
                            <strong>${item.prompt}</strong>
                            <br><small>Оценка: <strong>${score}%</strong></small>
                            <br><small style="color: #856404;">Твоят отговор: ${item.user_answer || '(няма отговор)'}</small>
                            ${notes}
                            <br><small>Еталонен отговор:</small>
                            <br><small><strong>${item.correct_answer || ''}</strong></small>
                        </div>
                    `;
                });
            }

            if (summary.incorrect_words.length === 0) {
                html = '<p style="text-align: center; color: #28a745; font-weight: 600;">🎉 Отлично! Всички отговори са оценени като достатъчно добри.</p>';
            }

            incorrectList.innerHTML = html;
        } else {
        
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
        }

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
    const direction = state.currentDirection || document.getElementById('direction').value;
    
    console.log('[Save Progress] Starting...');
    console.log('[Save Progress] Language mode:', state.languageMode);
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
        const lesson = state.languageMode === 'literature' ? wordPair.topic_id : wordPair.lesson;
        
        // For lesson-based modes, lesson is required
        if ((state.config && state.config.has_lessons) && !lesson) {
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
        
        // Determine mastery
        // - Language modes: mastered only if fully correct (not partial credit)
        // - Literature: mastered if score_percent >= threshold
        const LITERATURE_MASTERED_THRESHOLD = 85;
        const wasFullyCorrect = state.languageMode === 'literature'
            ? (answerResult.score_percent !== undefined && answerResult.score_percent !== null && answerResult.score_percent >= LITERATURE_MASTERED_THRESHOLD && answerResult.timed_out !== true)
            : (answerResult.correct === true && !answerResult.partial_credit);
        
        // Get word1 and word2 based on language mode
        const word1 = state.languageMode === 'greek'
            ? wordPair.greek
            : (state.languageMode === 'latin'
                ? wordPair.latin
                : (state.languageMode === 'spanish'
                    ? wordPair.spanish
                    : wordPair.question_id));
        const word2 = state.languageMode === 'literature' ? '' : wordPair.bulgarian;
        
        console.log(`[Save Progress] Word ${index}: ${word1} ↔ ${word2}, Lesson ${lesson || 'N/A'}`);
        console.log(`[Save Progress]   - correct: ${answerResult.correct}, partial_credit: ${answerResult.partial_credit}, wasFullyCorrect: ${wasFullyCorrect}`);
        
        // For mixed mode, use the actual_direction field from the word pair
        // This is set by the backend during interleaving, so it's accurate even when lists have different lengths
        let actualDirection = direction;
        if ((direction === 'latin_mixed' || direction === 'spanish_mixed') && wordPair.actual_direction) {
            actualDirection = wordPair.actual_direction;
            console.log(`[Save Progress]   - Mixed mode: using actual_direction = ${actualDirection}`);
        } else if (direction === 'latin_mixed') {
            // Fallback to old logic if actual_direction not present (shouldn't happen with updated backend)
            actualDirection = (index % 2 === 0) ? 'latin_to_bulgarian' : 'bulgarian_to_latin';
            console.warn(`[Save Progress]   - Mixed mode: actual_direction missing, using fallback index-based logic`);
        } else if (direction === 'spanish_mixed') {
            actualDirection = (index % 2 === 0) ? 'spanish_to_bulgarian' : 'bulgarian_to_spanish';
            console.warn(`[Save Progress]   - Mixed mode: actual_direction missing, using fallback index-based logic`);
        }
        
        // Create unique key for this item
        const wordKey = createWordKey(word1, word2, lesson);
        const progressKey = `${actualDirection}_${lesson || 'no-lesson'}_${wordKey}`;
        
        if (wasFullyCorrect) {
            // Mark as mastered
            if (state.languageMode === 'literature') {
                progress.wordProgress[progressKey] = {
                    topic_id: wordPair.topic_id,
                    question_id: wordPair.question_id,
                    direction: actualDirection,
                    correct: true,
                    lastSeen: new Date().toISOString()
                };
            } else {
                progress.wordProgress[progressKey] = {
                    word1: word1,
                    word2: word2,
                    lesson: lesson,
                    direction: actualDirection,
                    correct: true,
                    lastSeen: new Date().toISOString()
                };
            }
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
    
    // Update progress display when returning to setup
    updateProgressDisplay();
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

