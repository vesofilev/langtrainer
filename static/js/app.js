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
    noTimeLimitOpen: false, // No time limit for open-ended questions
    selectedLessons: [], // Selected lesson numbers (Greek only)
    availableLessons: [], // All available lessons (Greek only)
    languageMode: 'greek', // 'greek', 'latin', 'spanish', or 'literature'
    currentDirection: 'greek_to_bulgarian', // Current quiz direction
    literatureTopicId: null, // Selected literature topic id (literature mode)
    // Verse translation state
    isVerseMode: false,          // Whether we're in verse translation mode
    verseConfig: null,           // Verse config from /api/verse-config
    verseLesson: null,           // Selected verse lesson number
    // Cross-exam state
    isCrossExam: false,
    crossExamSessionId: null,
    crossExamQuestions: [],
    crossExamCurrentIndex: 0,
    crossExamTopicId: null,
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
    if (state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry') {
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
                : (state.languageMode === 'biology'
                    ? 'Biology'
                    : (state.languageMode === 'history'
                        ? 'History'
                        : (state.languageMode === 'geography'
                            ? 'Geography'
                            : (state.languageMode === 'chemistry'
                                ? 'Chemistry'
                                : 'Literature'))))));
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
        } else if (direction === 'latin_qa') {
            directionLabel = 'Латински въпрос → отговор';
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
    if (savedLanguageMode && document.querySelector(`#languageMode option[value="${savedLanguageMode}"]`)) {
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
        } else if (state.languageMode === 'biology') {
            title.textContent = '🧬 Биология';
            if (subtitle) subtitle.textContent = 'Прегледай урока и се тествай';
        } else if (state.languageMode === 'history') {
            title.textContent = '📜 История';
            if (subtitle) subtitle.textContent = 'Прегледай урока и се тествай';
        } else if (state.languageMode === 'geography') {
            title.textContent = '🌍 География';
            if (subtitle) subtitle.textContent = 'Прегледай урока и се тествай';
        } else if (state.languageMode === 'chemistry') {
            title.textContent = '🧪 Химия';
            if (subtitle) subtitle.textContent = 'Прегледай урока и се тествай';
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
        // Hide direction dropdown when there's only one option
        const directionGroup = directionSelect.closest('.form-group');
        if (directionGroup) {
            directionGroup.style.display = state.config.directions.length <= 1 ? 'none' : '';
        }

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
        if (state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry') {
            if (sessionModeLabel) sessionModeLabel.textContent = 'Режим:';
            if (directionLabel) directionLabel.textContent = 'Тип тест:';
            if (wordCountLabel) wordCountLabel.textContent = 'Брой въпроси:';
            if (timeLabel) timeLabel.textContent = 'Време за въпрос (секунди):';
            if (sessionModeSelect) {
                sessionModeSelect.options[0].textContent = (state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry') ? 'Преговор + Изпит' : 'Тренировка + Изпит';
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

        if (state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry') {
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

                const savedTopic = localStorage.getItem(`selectedTopicId_${state.languageMode}`);
                if (savedTopic && topics.some(t => t.topic_id === savedTopic)) {
                    topicSelect.value = savedTopic;
                }
                state.literatureTopicId = topicSelect.value || (topics[0]?.topic_id ?? null);
                if (state.literatureTopicId) {
                    localStorage.setItem(`selectedTopicId_${state.languageMode}`, state.literatureTopicId);
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
        updateChemKeyboardVisibility();
        
        // Show/hide cross-exam panel (biology and history)
        const crossExamGroup = document.getElementById('crossExamGroup');
        if (crossExamGroup) crossExamGroup.style.display = (state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry') ? 'block' : 'none';

        // Load verse config for Latin mode and show/hide verse panel
        await updateVersePanel();
        
        // Update progress display
        updateProgressDisplay();
        
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

// Handle literature topic change
async function onLiteratureTopicChange() {
    if (state.languageMode !== 'literature' && state.languageMode !== 'biology' && state.languageMode !== 'history' && state.languageMode !== 'geography' && state.languageMode !== 'chemistry') return;
    const topicSelect = document.getElementById('literatureTopic');
    if (!topicSelect) return;

    state.literatureTopicId = topicSelect.value || null;
    if (state.literatureTopicId) {
        localStorage.setItem(`selectedTopicId_${state.languageMode}`, state.literatureTopicId);
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

    // Show/hide saved cross-exam session for this topic
    if (state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry') {
        updateCrossExamLastSession(state.literatureTopicId);
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
    
    // Refresh verse panel visibility
    await updateVersePanel();
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
        } else if (direction === 'latin_qa') {
            directionLabel = 'Латински въпрос → отговор';
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

    // Handle Literature / Biology mode (topics)
    if (state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry') {
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

    // Skip timer for LLM-graded questions if option is set
    const currentQuestion = state.questions[state.currentIndex];
    const isLLMQuestion = (currentQuestion && currentQuestion.question_type === 'open')
        || state.languageMode === 'literature'
        || state.isVerseMode;
    if (state.noTimeLimitOpen && isLLMQuestion) {
        state.timeRemaining = null;
        const display = document.getElementById('timerDisplay');
        const container = document.getElementById('timerContainer');
        if (display) display.textContent = '∞';
        if (container) container.classList.remove('warning', 'danger');
        return;
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

// ==================== Verse Translation Functions ====================

async function updateVersePanel() {
    const verseGroup = document.getElementById('verseTranslationGroup');
    if (!verseGroup) return;

    // Only show for Latin mode when verse lessons exist
    if (state.languageMode === 'latin' && state.config && Array.isArray(state.config.verse_lessons) && state.config.verse_lessons.length > 0) {
        // Check if any selected lesson is verse-eligible
        const verseLessonNumbers = state.config.verse_lessons;
        const hasVerseLesson = state.selectedLessons.some(l => verseLessonNumbers.includes(l));
        
        if (hasVerseLesson) {
            // Fetch full verse config
            try {
                const resp = await fetch(`${API_BASE}/verse-config`);
                const data = await resp.json();
                state.verseConfig = data.verse_lessons || [];
            } catch (e) {
                console.error('Failed to load verse config:', e);
                state.verseConfig = [];
            }

            // Populate verse lesson dropdown
            const verseLessonSelect = document.getElementById('verseLesson');
            if (verseLessonSelect) {
                verseLessonSelect.innerHTML = '';
                state.verseConfig.forEach(vl => {
                    const opt = document.createElement('option');
                    opt.value = vl.lesson;
                    opt.textContent = `${vl.title} (${vl.line_count} стиха)`;
                    verseLessonSelect.appendChild(opt);
                });
                state.verseLesson = state.verseConfig.length > 0 ? state.verseConfig[0].lesson : null;
                onVerseLessonChange();
            }

            verseGroup.style.display = 'block';
            return;
        }
    }

    verseGroup.style.display = 'none';
    state.verseConfig = null;
    state.verseLesson = null;
}

function onVerseLessonChange() {
    const select = document.getElementById('verseLesson');
    if (!select) return;
    state.verseLesson = parseFloat(select.value);

    const info = (state.verseConfig || []).find(v => v.lesson === state.verseLesson);
    const infoDiv = document.getElementById('verseInfo');
    if (info && infoDiv) {
        const groupSize = parseInt(document.getElementById('verseGroupSize')?.value || '4');
        const numGroups = Math.ceil(info.line_count / groupSize);
        infoDiv.textContent = `📏 ${info.line_count} стиха · ${numGroups} групи по ${groupSize} · ${info.source || ''}`;
    }
}

async function startVerseSession() {
    if (!state.verseLesson) {
        alert('Моля, изберете стихотворен урок');
        return;
    }

    const groupSize = parseInt(document.getElementById('verseGroupSize')?.value || '4');
    const ordering = document.getElementById('verseOrdering')?.value || 'sequential';
    const sessionMode = document.getElementById('verseSessionMode')?.value || 'training';
    const timePerQuestion = parseInt(document.getElementById('verseTimePerQuestion')?.value || '120');

    state.isVerseMode = true;
    state.currentDirection = 'verse_translation';
    state.timePerQuestion = timePerQuestion;

    try {
        const startBtn = document.getElementById('startVerseBtn');
        if (startBtn) { startBtn.disabled = true; startBtn.textContent = '⏳ Зареждане...'; }

        const response = await fetch(`${API_BASE}/verse-quiz`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lesson: state.verseLesson,
                group_size: groupSize,
                ordering: ordering,
                time_per_question: timePerQuestion,
                skip_training: sessionMode === 'exam',
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            let msg = 'Грешка при стартиране на сесията.';
            try { const e = JSON.parse(errText); if (e.detail) msg += ' ' + e.detail; } catch {}
            alert(msg);
            return;
        }

        const data = await response.json();
        state.sessionId = data.session_id;
        state.questions = data.questions;
        state.wordPairs = data.word_pairs;
        state.timePerQuestion = data.time_per_question;
        state.currentIndex = 0;
        state.answers = [];
        state.trainingCompleted = false;
        state.wasTrainingSession = (sessionMode === 'training');

        if (sessionMode === 'training') {
            state.mode = 'training';
            // Set training screen labels for verse mode
            const trainingTitle = document.getElementById('trainingTitle');
            if (trainingTitle) trainingTitle.textContent = '📜 Тренировка — Превод на стихове';
            const trainingAnswerLabel = document.getElementById('trainingAnswerLabel');
            if (trainingAnswerLabel) trainingAnswerLabel.textContent = 'Еталонен превод:';
            showScreen('trainingScreen');
            displayTrainingWord();
        } else {
            state.mode = 'exam';
            showScreen('quizScreen');
            displayQuestion();
        }
    } catch (error) {
        alert('Грешка: ' + error.message);
    } finally {
        const startBtn = document.getElementById('startVerseBtn');
        if (startBtn) { startBtn.disabled = false; startBtn.textContent = '📜 Започни превод на стихове'; }
    }
}

// ==================== End Verse Translation Functions ====================

// Start session (training or exam)
// Start session (training or exam)
async function startSession() {
    const sessionMode = document.getElementById('sessionMode').value;
    const direction = document.getElementById('direction').value;
    state.currentDirection = direction; // Store current direction

    // Latin Q&A: prompt is a Bulgarian question, expected answer is verbatim Bulgarian text,
    // so override the English-by-default labels left over from the regular Latin flow.
    if (direction === 'latin_qa') {
        const trainingAnswerLabel = document.getElementById('trainingAnswerLabel');
        if (trainingAnswerLabel) trainingAnswerLabel.textContent = 'Отговор:';
        const answerInput = document.getElementById('answerInput');
        if (answerInput) answerInput.placeholder = 'Въведи отговор...';
    }
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
    if ((state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry') && !state.literatureTopicId) {
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
                topic_id: (state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry') ? state.literatureTopicId : undefined
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
    state.noTimeLimitOpen = document.getElementById('noTimeLimitOpen')?.checked || false;

    // Get list of words already answered correctly for this direction
    const excludeWords = (state.config && state.config.has_lessons)
        ? getCorrectWordsForLessons(state.selectedLessons, direction)
        : ((state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry')
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
            topic_id: (state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry') ? state.literatureTopicId : null,
            use_all_words: useAllWords,
            exclude_correct_words: excludeWords,
            random_order: randomOrder,
            no_time_limit_open: state.noTimeLimitOpen
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

        if (state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry') {
            const ids = data.questions.map(q => q.question_id);
            const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
            console.log(`[${state.languageMode}] Question IDs received:`, ids);
            if (dupes.length) console.warn(`[${state.languageMode}] DUPLICATE question IDs in response:`, dupes);
        }
        state.answers = [];
        state.trainingCompleted = false;
        state.wasTrainingSession = (sessionMode === 'training'); // Track if training was used
        
        // Store direction in config for keyboard visibility
        if (!state.config) state.config = {};
        state.config.direction = direction;

        if (sessionMode === 'training') {
            if (state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry') {
                state.mode = 'study_guide';
                await showStudyGuide();
            } else {
                state.mode = 'training';
                showScreen('trainingScreen');
                displayTrainingWord();
            }
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
    const foreignKey = state.languageMode === 'spanish' ? 'spanish' : (state.languageMode === 'latin' ? 'latin' : 'greek');
    
    // For mixed modes, match both sub-directions
    const directionMatches = (entryDirection) => {
        if (direction === 'latin_mixed') {
            return entryDirection === 'latin_to_bulgarian' || entryDirection === 'bulgarian_to_latin';
        }
        if (direction === 'spanish_mixed') {
            return entryDirection === 'spanish_to_bulgarian' || entryDirection === 'bulgarian_to_spanish';
        }
        return entryDirection === direction;
    };
    
    for (const key in progress.wordProgress) {
        const entry = progress.wordProgress[key];
        if (entry.correct && 
            directionMatches(entry.direction) && 
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
    const isVerse = state.isVerseMode;

    document.getElementById('trainingProgressFill').style.width = progress + '%';
    document.getElementById('trainingCounter').textContent = 
        (state.languageMode === 'literature' || isVerse)
            ? `Въпрос ${state.currentIndex + 1} от ${state.questions.length}`
            : `Word ${state.currentIndex + 1} of ${state.questions.length}`;
    document.getElementById('trainingPromptLabel').textContent = question.prompt_label;

    // Verse prompts contain newlines; render with line breaks
    const promptEl = document.getElementById('trainingPrompt');
    if (isVerse && question.prompt.includes('\n')) {
        promptEl.innerHTML = question.prompt.split('\n').map(l => `<div>${l}</div>`).join('');
    } else {
        promptEl.textContent = question.prompt;
    }
    
    // Show vocabulary words if present
    const wordsContainer = document.getElementById('trainingWordsContainer');
    const wordsList = document.getElementById('trainingWordsList');

    // Verse mode: words is an array of dicts [{key: val, ...}, ...]
    if (isVerse && Array.isArray(question.words) && question.words.length > 0) {
        const chips = [];
        question.words.forEach(wordDict => {
            if (wordDict && typeof wordDict === 'object') {
                Object.entries(wordDict).forEach(([lat, bg]) => {
                    chips.push(`<span style="display: inline-block; padding: 4px 10px; background: #e8eaf6; border-radius: 4px; font-size: 0.9em;"><strong>${lat}</strong> — ${bg}</span>`);
                });
            }
        });
        wordsList.innerHTML = chips.join('');
        wordsContainer.style.display = chips.length > 0 ? 'block' : 'none';
    } else if (question.words && typeof question.words === 'object' && !Array.isArray(question.words) && Object.keys(question.words).length > 0) {
        wordsList.innerHTML = Object.entries(question.words).map(([latin, bg]) => 
            `<span style="display: inline-block; padding: 4px 10px; background: #e8eaf6; border-radius: 4px; font-size: 0.9em;"><strong>${latin}</strong> — ${bg}</span>`
        ).join('');
        wordsContainer.style.display = 'block';
    } else {
        wordsContainer.style.display = 'none';
    }
    
    // Fetch the correct answer for this question
    fetchCorrectAnswer();

    const nextBtn = document.getElementById('trainingNextBtn');
    if (state.currentIndex === state.questions.length - 1) {
        nextBtn.textContent = (state.languageMode === 'literature' || isVerse) ? 'Започни изпит' : 'Start Exam';
    } else {
        nextBtn.textContent = (state.languageMode === 'literature' || isVerse) ? 'Следващ' : 'Next Word';
    }
}

async function fetchCorrectAnswer() {
    try {
        const response = await fetch(
            `${API_BASE}/quiz/${state.sessionId}/question/${state.currentIndex}`
        );
        const data = await response.json();
        const answerEl = document.getElementById('trainingAnswer');
        // Verse answers may be multiline
        if (state.isVerseMode && data.correct_answer && data.correct_answer.includes('\n')) {
            answerEl.innerHTML = data.correct_answer.split('\n').map(l => `<div>${l}</div>`).join('');
        } else {
            answerEl.textContent = data.correct_answer;
        }
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
    const isVerse = state.isVerseMode;
    const msg = (state.languageMode === 'literature' || isVerse)
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
    
    // For verse mode, create a new verse session
    if (state.isVerseMode) {
        startVerseExamAfterTraining();
        return;
    }
    
    // Create new quiz session with same words
    startQuizAfterTraining();
}

async function startVerseExamAfterTraining() {
    try {
        // Create a new verse quiz session with same settings
        const response = await fetch(`${API_BASE}/verse-quiz`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lesson: state.verseLesson,
                group_size: parseInt(document.getElementById('verseGroupSize')?.value || '4'),
                ordering: document.getElementById('verseOrdering')?.value || 'sequential',
                time_per_question: state.timePerQuestion,
                skip_training: true,
            })
        });

        if (!response.ok) {
            throw new Error('Failed to start verse exam');
        }

        const data = await response.json();
        state.sessionId = data.session_id;
        state.questions = data.questions;
        state.wordPairs = data.word_pairs;
        state.timePerQuestion = data.time_per_question;
        state.currentIndex = 0;
        state.answers = [];

        state.mode = 'exam';
        showScreen('quizScreen');
        displayQuestion();
    } catch (error) {
        alert('Грешка при стартиране на изпита: ' + error.message);
    }
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
                topic_id: (state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry') ? state.literatureTopicId : null,
                no_time_limit_open: state.noTimeLimitOpen,
                random_order: false  // Keep same order as training
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
    const isVerse = state.isVerseMode;

    document.getElementById('progressFill').style.width = progress + '%';
    document.getElementById('questionCounter').textContent = 
        (state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry' || isVerse)
            ? `Въпрос ${state.currentIndex + 1} от ${state.questions.length}`
            : `Question ${state.currentIndex + 1} of ${state.questions.length}`;
    document.getElementById('questionLabel').textContent = question.prompt_label;

    // Show/hide verse textarea vs regular input
    const answerInput = document.getElementById('answerInput');
    const verseTextarea = document.getElementById('verseAnswerInput');
    const autocompleteContainer = answerInput?.closest('.autocomplete-container');

    if (isVerse) {
        // Show textarea, hide regular input
        if (autocompleteContainer) autocompleteContainer.style.display = 'none';
        if (verseTextarea) { verseTextarea.style.display = 'block'; verseTextarea.value = ''; }
    } else {
        // Show regular input, hide textarea
        if (autocompleteContainer) autocompleteContainer.style.display = '';
        if (verseTextarea) verseTextarea.style.display = 'none';
    }

    // Render question prompt
    const questionTextEl = document.getElementById('questionText');

    if (isVerse && question.prompt.includes('\n')) {
        // Verse: render each line of Latin text
        questionTextEl.innerHTML = question.prompt.split('\n').map(l =>
            `<div style="text-align: left; margin: 4px 0; font-style: italic;">${l}</div>`
        ).join('');
    } else if ((state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry') && Array.isArray(question.choices) && question.choices.length > 0) {
        const escapeHtml = (s) => String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const choicesHtml = question.choices.map(c => {
            const key = escapeHtml(c.key);
            const text = escapeHtml(c.text);
            return `<div style="text-align:left; margin: 6px 0; padding: 10px 12px; border: 1px solid #e0e0e0; border-radius: 10px; background: #fff; cursor: pointer; font-size: 0.9em;" data-choice-key="${key}">
                <span style="font-weight:600; color:#888; margin-right:6px;">${key})</span>${text}
            </div>`;
        }).join('');

        questionTextEl.innerHTML = `
            <div style="margin-bottom: 14px;">${escapeHtml(question.prompt)}</div>
            <div id="literatureChoices" style="margin-top: 10px; font-size: 0.6em;">${choicesHtml}</div>
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

        if (answerInput) {
            answerInput.placeholder = 'Въведи: А, Б, В или Г';
        }
    } else {
        questionTextEl.textContent = question.prompt;
        if (answerInput) {
            answerInput.placeholder = question.question_type === 'open' ? 'Напиши отговор...' : 'Въведи отговор...';
        }
    }

    // Show question image if present
    const existingImg = document.getElementById('questionImage');
    if (existingImg) existingImg.remove();
    if (question.image) {
        const img = document.createElement('img');
        img.id = 'questionImage';
        img.src = question.image;
        img.alt = 'Илюстрация към въпроса';
        img.style.cssText = 'max-width: 100%; margin: 12px 0; border-radius: 8px; border: 1px solid #e0e0e0;';
        questionTextEl.after(img);
    }

    // Swap input to textarea for open-ended questions, back to input for MC
    if (answerInput) {
        const isOpen = question.question_type === 'open';
        const container = answerInput.parentElement;
        if (isOpen && answerInput.tagName === 'INPUT') {
            const ta = document.createElement('textarea');
            ta.id = 'answerInput';
            ta.placeholder = 'Напиши отговор...';
            ta.rows = 4;
            ta.style.cssText = 'width:100%; padding:12px; font-size:16px; border:2px solid #90caf9; border-radius:8px; resize:vertical; font-family:inherit; box-sizing:border-box;';
            ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitAnswer(); } });
            container.replaceChild(ta, answerInput);
        } else if (!isOpen && answerInput.tagName === 'TEXTAREA') {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.id = 'answerInput';
            inp.placeholder = 'Въведи: А, Б, В или Г';
            inp.autocomplete = 'off';
            container.replaceChild(inp, answerInput);
        }
    }

    // Verse vocabulary hints in quiz mode
    const quizWordsContainer = document.getElementById('quizWordsContainer');
    const quizWordsList = document.getElementById('quizWordsList');
    if (isVerse && Array.isArray(question.words) && question.words.length > 0) {
        const chips = [];
        question.words.forEach(wordDict => {
            if (wordDict && typeof wordDict === 'object') {
                Object.entries(wordDict).forEach(([lat, bg]) => {
                    chips.push(`<span style="display: inline-block; padding: 3px 8px; background: #e8eaf6; border-radius: 4px; font-size: 0.85em;"><strong>${lat}</strong> — ${bg}</span>`);
                });
            }
        });
        if (quizWordsList) quizWordsList.innerHTML = chips.join('');
        if (quizWordsContainer) quizWordsContainer.style.display = chips.length > 0 ? 'block' : 'none';
    } else {
        if (quizWordsContainer) quizWordsContainer.style.display = 'none';
    }

    if (!isVerse) {
        document.getElementById('answerInput').value = '';
    }
    document.getElementById('feedback').classList.add('hidden');

    if (isVerse) {
        verseTextarea?.focus();
    } else {
        document.getElementById('answerInput').focus();
    }

    document.getElementById('submitBtn').textContent = (state.languageMode === 'literature' || isVerse) ? 'Предай отговор' : 'Submit Answer';
    document.getElementById('submitBtn').onclick = () => submitAnswer(false);
    
    // Update keyboard visibility based on direction
    updateKeyboardVisibility();
    updateChemKeyboardVisibility();

    // Start backend timer when the question is actually shown.
    if (state.sessionId) {
        fetch(`${API_BASE}/quiz/${state.sessionId}/question/${state.currentIndex}/start`, {
            method: 'POST'
        }).catch(() => {});
    }
    
    // Start the timer for this question
    startTimer();
}

// Submit answer
async function submitAnswer(isTimeout = false) {
    // Stop the timer
    stopTimer();

    const isVerse = state.isVerseMode;
    const currentQuestion = state.questions[state.currentIndex];
    const isBiologyOpenEnded = (state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry') && currentQuestion?.question_type === 'open';
    const isLLMGraded = state.languageMode === 'literature' || isBiologyOpenEnded || isVerse;

    // Get answer from the right input element
    let answer;
    if (isTimeout) {
        answer = '';
    } else if (isVerse) {
        answer = (document.getElementById('verseAnswerInput')?.value || '').trim();
    } else {
        answer = document.getElementById('answerInput').value.trim();
    }

    const submitBtn = document.getElementById('submitBtn');
    const answerInput = document.getElementById('answerInput');
    const verseTextarea = document.getElementById('verseAnswerInput');
    const feedback = document.getElementById('feedback');

    if (!answer && !isTimeout) {
        alert(isLLMGraded ? 'Моля, въведете отговор' : 'Please enter an answer');
        // Restart timer if user didn't actually submit
        startTimer();
        return;
    }

    // Prevent double-submit
    if (submitBtn?.disabled) return;

    // LLM-graded modes: show loading spinner while waiting for grading
    if (isLLMGraded && !isTimeout) {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('btn-loading');
            submitBtn.textContent = 'Оценявам...';
        }
        if (answerInput) answerInput.disabled = true;
        if (verseTextarea) verseTextarea.disabled = true;
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
                answer: answer,
                no_time_limit: state.noTimeLimitOpen && (
                    (currentQuestion && currentQuestion.question_type === 'open')
                    || state.languageMode === 'literature'
                    || state.isVerseMode
                )
            })
        });

        const result = await response.json();
        displayFeedback(result, isTimeout);
        state.answers.push(result);

        // Update button to "Next"
        document.getElementById('submitBtn').textContent = 
            state.currentIndex < state.questions.length - 1
                ? (isLLMGraded ? 'Следващ въпрос' : 'Next Question')
                : (isLLMGraded ? 'Виж резултати' : 'View Results');
        document.getElementById('submitBtn').onclick = nextQuestion;
    } catch (error) {
        const msg = isLLMGraded
            ? ('Грешка при оценяване: ' + error.message)
            : ('Failed to submit answer: ' + error.message);
        alert(msg);

        // Restore input/button so user can retry
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('btn-loading');
            submitBtn.textContent = isLLMGraded ? 'Предай отговор' : 'Submit Answer';
        }
        if (answerInput) answerInput.disabled = false;
        if (verseTextarea) verseTextarea.disabled = false;
    }
    finally {
        // Always clear loading state if it was set
        if (isLLMGraded && submitBtn) {
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
    const isVerse = state.isVerseMode;
    const currentQuestion = state.questions[state.currentIndex];
    const isBiologyOpenEnded = (state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry') && currentQuestion?.question_type === 'open';
    const isLLMGraded = state.languageMode === 'literature' || isBiologyOpenEnded || isVerse;

    // Helper to format correct answer (may be multiline for verse)
    const formatAnswer = (text) => {
        if (!text) return '';
        if (isVerse && text.includes('\n')) {
            return text.split('\n').map(l => `<div>${l}</div>`).join('');
        }
        return text;
    };
    
    // LLM-graded mode feedback (literature or verse)
    if (isLLMGraded) {
        const masteredThreshold = isVerse ? 70 : 85;

        if (isActualTimeout) {
            feedback.classList.add('incorrect');
            feedback.innerHTML = `
                ⏰ Времето изтече!<br>
                <small>Еталонен отговор:</small><br>
                <small><strong>${formatAnswer(result.correct_answer)}</strong></small>
            `;
            playErrorSound();
        } else {
            const scorePercent = (result.score_percent !== undefined && result.score_percent !== null)
                ? result.score_percent
                : (result.correct ? 100 : 0);
            const isGood = scorePercent >= masteredThreshold;

            feedback.classList.add(isGood ? 'correct' : 'incorrect');
            const notes = result.notes ? `<br><small>Бележки:</small><br><small style="white-space: pre-line;">${String(result.notes)}</small>` : '';
            feedback.innerHTML = `
                📊 Оценка: <strong>${scorePercent}%</strong>
                ${notes}
                <br><small>Еталонен отговор:</small><br>
                <small><strong>${formatAnswer(result.correct_answer)}</strong></small>
            `;

            if (isGood) {
                playSuccessSound();
            } else {
                playErrorSound();
            }
        }

        document.getElementById('answerInput').disabled = true;
        if (isVerse) {
            const vta = document.getElementById('verseAnswerInput');
            if (vta) vta.disabled = true;
        }
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
    const vta = document.getElementById('verseAnswerInput');
    if (vta) vta.disabled = false;
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

        // LLM-graded summary (literature, biology, or verse)
        if (state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry' || state.isVerseMode) {
            const formatText = (text) => {
                if (!text) return '';
                if (state.isVerseMode && text.includes('\n')) {
                    return text.split('\n').map(l => `<div>${l}</div>`).join('');
                }
                return text;
            };

            if (summary.incorrect_words.length > 0) {
                html += '<h3>Преглед на отговорите:</h3>';
                summary.incorrect_words.forEach(item => {
                    const score = (item.score_percent !== undefined && item.score_percent !== null)
                        ? item.score_percent
                        : 0;
                    const notes = item.notes ? `<br><small style="color:#555;">Бележки: ${item.notes}</small>` : '';
                    html += `
                        <div class="incorrect-item">
                            <strong>${formatText(item.prompt)}</strong>
                            <br><small>Оценка: <strong>${score}%</strong></small>
                            <br><small style="color: #856404;">Твоят отговор: ${formatText(item.user_answer) || '(няма отговор)'}</small>
                            ${notes}
                            <br><small>Еталонен отговор:</small>
                            <br><small><strong>${formatText(item.correct_answer)}</strong></small>
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

        // Hide cross-exam retake section for normal quizzes
        const crossExamRetakeSection = document.getElementById('crossExamRetakeSection');
        if (crossExamRetakeSection) crossExamRetakeSection.style.display = 'none';
        const summaryNewQuizBtn = document.getElementById('summaryNewQuizBtn');
        if (summaryNewQuizBtn) { summaryNewQuizBtn.style.display = 'block'; summaryNewQuizBtn.textContent = 'Start New Quiz'; }

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
        const lesson = (state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry') ? wordPair.topic_id : wordPair.lesson;
        
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
        // - Literature: mastered if score_percent >= 85
        // - Verse: mastered if score_percent >= 70
        const LITERATURE_MASTERED_THRESHOLD = 85;
        const VERSE_MASTERED_THRESHOLD = 70;
        const isLLMGraded = state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry' || state.isVerseMode;
        const llmThreshold = state.isVerseMode ? VERSE_MASTERED_THRESHOLD : LITERATURE_MASTERED_THRESHOLD;
        const wasFullyCorrect = isLLMGraded
            ? (answerResult.score_percent !== undefined && answerResult.score_percent !== null && answerResult.score_percent >= llmThreshold && answerResult.timed_out !== true)
            : (answerResult.correct === true && !answerResult.partial_credit);
        
        // Get word1 and word2 based on language mode
        const word1 = state.languageMode === 'greek'
            ? wordPair.greek
            : (state.languageMode === 'latin'
                ? wordPair.latin
                : (state.languageMode === 'spanish'
                    ? wordPair.spanish
                    : wordPair.question_id));
        const word2 = (state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry') ? '' : wordPair.bulgarian;
        
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
            if (state.languageMode === 'literature' || state.languageMode === 'biology' || state.languageMode === 'history' || state.languageMode === 'geography' || state.languageMode === 'chemistry' || state.languageMode === 'chemistry') {
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
    
    // For verse mode, use verse-specific retake
    if (state.isVerseMode) {
        startVerseExamAfterTraining();
        return;
    }
    
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
    state.isVerseMode = false; // Reset verse mode
    state.isCrossExam = false; // Reset cross-exam mode
    state.crossExamSessionId = null;
    state.crossExamQuestions = [];
    state.crossExamCurrentIndex = 0;
    
    // Reset verse textarea / regular input visibility
    const autocompleteContainer = document.getElementById('answerInput')?.closest('.autocomplete-container');
    if (autocompleteContainer) autocompleteContainer.style.display = '';
    const verseTextarea = document.getElementById('verseAnswerInput');
    if (verseTextarea) verseTextarea.style.display = 'none';
    const quizWordsContainer = document.getElementById('quizWordsContainer');
    if (quizWordsContainer) quizWordsContainer.style.display = 'none';
    
    // Update progress display when returning to setup
    updateProgressDisplay();
}

// ==================== Biology Study Guide ====================

async function showStudyGuide() {
    const topicId = state.literatureTopicId;
    try {
        const resp = await fetch(`${API_BASE}/study-guide/${state.languageMode}/${encodeURIComponent(topicId)}`);
        if (!resp.ok) throw new Error('Failed to load study guide');
        const data = await resp.json();
        displayStudyGuide(data);
        showScreen('studyGuideScreen');
    } catch (e) {
        console.error('Failed to load study guide:', e);
        alert('Не може да се зареди преговорът. Преминаване директно към изпита.');
        state.mode = 'exam';
        showScreen('quizScreen');
        displayQuestion();
    }
}

function displayStudyGuide(data) {
    const titleEl = document.getElementById('studyGuideTitle');
    if (titleEl) titleEl.textContent = data.title || '📚 Преговор';

    // Build summary page (overview + sections)
    const summaryEl = document.getElementById('studyGuideSummary');
    let summaryHtml = '';

    if (data.overview) {
        summaryHtml += `<div class="study-guide-overview">${data.overview}</div>`;
    }

    (data.sections || []).forEach(section => {
        summaryHtml += `<div class="study-guide-section">
            <h3 class="study-guide-section-title">${section.title}</h3>
            <p class="study-guide-summary">${(section.summary || '').replace(/\n/g, '<br>')}</p>`;

        if (section.must_know && section.must_know.length) {
            summaryHtml += `<div class="study-guide-must-know"><strong>Задължително знай:</strong><ul>`;
            section.must_know.forEach(item => { summaryHtml += `<li>${item}</li>`; });
            summaryHtml += `</ul></div>`;
        }

        if (section.key_terms && section.key_terms.length) {
            summaryHtml += `<div class="study-guide-key-terms"><strong>Ключови понятия:</strong><dl>`;
            section.key_terms.forEach(t => {
                summaryHtml += `<dt>${t.term}</dt><dd>${t.definition}</dd>`;
            });
            summaryHtml += `</dl></div>`;
        }

        if (section.compare_points && section.compare_points.length) {
            summaryHtml += `<div class="study-guide-compare"><strong>Сравни:</strong><ul>`;
            section.compare_points.forEach(p => { summaryHtml += `<li>${p}</li>`; });
            summaryHtml += `</ul></div>`;
        }

        summaryHtml += `</div>`;
    });

    summaryEl.innerHTML = summaryHtml;

    // Build final recap page
    const recapEl = document.getElementById('studyGuideRecap');
    let hasRecap = false;

    if (data.final_recap) {
        let recapHtml = '';
        if (typeof data.final_recap === 'string') {
            // Chemistry format: plain string
            recapHtml = `<div class="study-guide-recap"><h3>📌 Запомни задължително:</h3><p>${data.final_recap.replace(/\n/g, '<br>')}</p></div>`;
            hasRecap = true;
        } else if (data.final_recap.must_remember && data.final_recap.must_remember.length > 0) {
            // Biology format: { must_remember: [...] }
            recapHtml = `<div class="study-guide-recap"><h3>📌 Запомни задължително:</h3><ul>`;
            data.final_recap.must_remember.forEach(item => { recapHtml += `<li>${item}</li>`; });
            recapHtml += `</ul></div>`;
            hasRecap = true;
        }
        recapEl.innerHTML = recapHtml;
    }

    // Show/hide buttons depending on whether recap exists
    const nextBtn = document.getElementById('studyGuideNextBtn');
    const backBtn = document.getElementById('studyGuideBackBtn');
    const examBtn = document.getElementById('studyGuideExamBtn');
    if (nextBtn) nextBtn.style.display = hasRecap ? '' : 'none';
    if (backBtn) backBtn.style.display = 'none';
    if (examBtn) examBtn.style.display = hasRecap ? 'none' : '';

    // Start on summary page
    summaryEl.style.display = '';
    recapEl.style.display = 'none';
}

function showStudyGuideRecap() {
    document.getElementById('studyGuideSummary').style.display = 'none';
    document.getElementById('studyGuideRecap').style.display = '';
    document.getElementById('studyGuideNextBtn').style.display = 'none';
    document.getElementById('studyGuideBackBtn').style.display = '';
    document.getElementById('studyGuideExamBtn').style.display = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showStudyGuideSummary() {
    document.getElementById('studyGuideSummary').style.display = '';
    document.getElementById('studyGuideRecap').style.display = 'none';
    document.getElementById('studyGuideNextBtn').style.display = '';
    document.getElementById('studyGuideBackBtn').style.display = 'none';
    document.getElementById('studyGuideExamBtn').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startExamFromStudyGuide() {
    state.mode = 'exam';
    showScreen('quizScreen');
    displayQuestion();
}

// ==================== Cross-Exam (Biology & History) ====================

async function startCrossExam() {
    const topicId = state.literatureTopicId;
    if (!topicId) {
        alert('Моля, избери тема.');
        return;
    }
    const count = parseInt(document.getElementById('crossExamCount').value) || 10;
    const btn = document.getElementById('startCrossExamBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Генериране на въпроси…'; }

    try {
        const resp = await fetch(`${API_BASE}/${state.languageMode}/cross-exam/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic_id: topicId, count })
        });
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Failed to start cross-exam');
        }
        const data = await resp.json();

        state.isCrossExam = true;
        state.crossExamSessionId = data.session_id;
        state.crossExamQuestions = data.questions;
        state.crossExamCurrentIndex = 0;
        state.crossExamTopicId = topicId;

        showCrossExamQuestion();
    } catch (e) {
        alert('Грешка при стартиране на кръстосан изпит: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔬 Започни кръстосан изпит'; }
    }
}

function showCrossExamQuestion() {
    const idx = state.crossExamCurrentIndex;
    const total = state.crossExamQuestions.length;

    document.getElementById('crossExamCounter').textContent = `Въпрос ${idx + 1} от ${total}`;
    document.getElementById('crossExamQuestion').textContent = state.crossExamQuestions[idx];
    document.getElementById('crossExamAnswer').value = '';
    document.getElementById('crossExamFeedback').style.display = 'none';
    document.getElementById('crossExamAnswerArea').style.display = 'block';
    document.getElementById('crossExamNextArea').style.display = 'none';

    const nextBtn = document.getElementById('crossExamNextBtn');
    if (nextBtn) {
        nextBtn.textContent = idx + 1 < total ? 'Следващ въпрос →' : '📊 Виж резултатите';
    }

    showScreen('crossExamScreen');
    document.getElementById('crossExamAnswer').focus();
}

async function submitCrossExamAnswer() {
    const answer = document.getElementById('crossExamAnswer').value.trim();
    if (!answer) {
        alert('Моля, напиши отговор.');
        return;
    }

    const idx = state.crossExamCurrentIndex;
    const btn = document.querySelector('#crossExamAnswerArea .btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Оценяване…'; }

    try {
        const resp = await fetch(`${API_BASE}/${state.languageMode}/cross-exam/${state.crossExamSessionId}/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question_index: idx, answer })
        });
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Грешка при оценяване');
        }
        const result = await resp.json();

        const scoreColor = result.score_percent >= 70 ? '#1b5e20' : result.score_percent >= 40 ? '#e65100' : '#b71c1c';
        const scoreBg   = result.score_percent >= 70 ? '#e8f5e9' : result.score_percent >= 40 ? '#fff3e0' : '#ffebee';
        const feedbackEl = document.getElementById('crossExamFeedback');
        feedbackEl.style.cssText = `display:block; background:${scoreBg}; border:2px solid ${scoreColor}; border-radius:8px; padding:14px 16px;`;
        feedbackEl.innerHTML = `
            <div style="font-weight:700; color:${scoreColor}; font-size:1.1em; margin-bottom:6px;">
                ${result.passed ? '✅' : '❌'} Оценка: ${result.score_percent}%
            </div>
            <div style="font-size:0.93em; line-height:1.5;">${result.notes || ''}</div>
        `;

        document.getElementById('crossExamAnswerArea').style.display = 'none';
        document.getElementById('crossExamNextArea').style.display = 'block';
    } catch (e) {
        alert('Грешка: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Изпрати отговор'; }
    }
}

function nextCrossExamQuestion() {
    state.crossExamCurrentIndex++;
    if (state.crossExamCurrentIndex >= state.crossExamQuestions.length) {
        showCrossExamSummary();
    } else {
        showCrossExamQuestion();
    }
}

async function showCrossExamSummary() {
    try {
        const resp = await fetch(`${API_BASE}/${state.languageMode}/cross-exam/${state.crossExamSessionId}/summary`);
        if (!resp.ok) throw new Error('Failed to load summary');
        const summary = await resp.json();

        document.getElementById('scorePercentage').textContent = summary.average_score + '%';
        document.getElementById('correctCount').textContent = `${summary.total_answered}/${summary.total_questions}`;

        const incorrectList = document.getElementById('incorrectList');
        let html = '<h3>Преглед на отговорите:</h3>';
        summary.questions.forEach(q => {
            const scoreColor = q.score_percent >= 70 ? '#1b5e20' : q.score_percent >= 40 ? '#e65100' : '#b71c1c';
            html += `
                <div class="incorrect-item" style="border-left:4px solid ${scoreColor};">
                    <strong>${q.question}</strong>
                    <br><small>Оценка: <strong style="color:${scoreColor};">${q.passed ? '✅' : '❌'} ${q.score_percent}%</strong></small>
                    <br><small style="color:#856404;">Твоят отговор: ${q.answer || '(няма)'}</small>
                    ${q.notes ? `<br><small style="color:#555;">Бележки: ${q.notes}</small>` : ''}
                </div>
            `;
        });
        incorrectList.innerHTML = html;

        document.getElementById('retakeSection').style.display = 'none';
        document.getElementById('crossExamRetakeSection').style.display = 'block';
        const summaryBtn = document.getElementById('summaryNewQuizBtn');
        if (summaryBtn) { summaryBtn.style.display = 'block'; summaryBtn.textContent = '← Обратно към менюто'; }

        const retakeFailedBtn = document.getElementById('retakeFailedBtn');
        if (retakeFailedBtn) {
            const hasFailed = summary.failed_question_indices && summary.failed_question_indices.length > 0;
            retakeFailedBtn.style.display = hasFailed ? '' : 'none';
        }

        // Persist to localStorage so retake survives page refresh
        const savedData = {
            topic_id: summary.topic_id,
            questions: summary.questions.map(q => q.question),
            failed_questions: summary.questions.filter(q => !q.passed).map(q => q.question),
            average_score: summary.average_score,
            total: summary.total_questions,
            timestamp: new Date().toISOString(),
        };
        localStorage.setItem(`crossExamLastSession_${summary.topic_id}`, JSON.stringify(savedData));
        updateCrossExamLastSession(summary.topic_id);

        showScreen('summaryScreen');
        window.scrollTo(0, 0);
    } catch (e) {
        alert('Не може да се зареди резюмето: ' + e.message);
    }
}

function updateCrossExamLastSession(topicId) {
    const container = document.getElementById('crossExamLastSession');
    const infoEl = document.getElementById('crossExamLastSessionInfo');
    const resumeFailedBtn = document.getElementById('resumeFailedBtn');
    if (!container || !topicId) return;

    const raw = localStorage.getItem(`crossExamLastSession_${topicId}`);
    if (!raw) {
        container.style.display = 'none';
        return;
    }

    try {
        const saved = JSON.parse(raw);
        const date = new Date(saved.timestamp).toLocaleDateString('bg-BG');
        infoEl.textContent = `Последен изпит: ${date} — ${saved.total} въпроса, средна оценка ${saved.average_score}%`;
        container.style.display = 'block';
        if (resumeFailedBtn) {
            resumeFailedBtn.style.display =
                saved.failed_questions && saved.failed_questions.length > 0 ? '' : 'none';
        }
    } catch (e) {
        container.style.display = 'none';
    }
}

async function resumeCrossExam(failedOnly) {
    const topicId = state.literatureTopicId;
    const raw = localStorage.getItem(`crossExamLastSession_${topicId}`);
    if (!raw) return;
    const saved = JSON.parse(raw);

    const questions = failedOnly ? saved.failed_questions : saved.questions;
    if (!questions || questions.length === 0) {
        alert('Няма въпроси за повторение.');
        return;
    }

    const btn = document.getElementById(failedOnly ? 'resumeFailedBtn' : 'resumeAllBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }

    try {
        const resp = await fetch(`${API_BASE}/${state.languageMode}/cross-exam/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic_id: topicId, questions })
        });
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Failed to resume');
        }
        const data = await resp.json();

        state.isCrossExam = true;
        state.crossExamSessionId = data.session_id;
        state.crossExamQuestions = data.questions;
        state.crossExamCurrentIndex = 0;
        state.crossExamTopicId = topicId;

        showCrossExamQuestion();
    } catch (e) {
        alert('Грешка: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = failedOnly ? '⚠️ Повтори само грешните' : '🔄 Повтори всички въпроси';
        }
    }
}

async function retryCrossExam(failedOnly) {
    try {
        const resp = await fetch(`${API_BASE}/${state.languageMode}/cross-exam/retake`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: state.crossExamSessionId, failed_only: failedOnly })
        });
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Грешка при повторение');
        }
        const data = await resp.json();

        state.crossExamSessionId = data.session_id;
        state.crossExamQuestions = data.questions;
        state.crossExamCurrentIndex = 0;

        showCrossExamQuestion();
    } catch (e) {
        alert('Грешка: ' + e.message);
    }
}

function startNewCrossExam() {
    state.isCrossExam = false;
    state.crossExamSessionId = null;
    state.crossExamQuestions = [];
    state.crossExamCurrentIndex = 0;

    document.getElementById('retakeSection').style.display = 'none';
    document.getElementById('crossExamRetakeSection').style.display = 'none';
    document.getElementById('summaryNewQuizBtn').style.display = 'block';

    showScreen('setupScreen');
}

function onCrossExamKeyDown(event) {
    // Ctrl+Enter or Cmd+Enter submits the answer
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        submitCrossExamAnswer();
    }
}

// Show screen
function showScreen(screenId) {
    document.querySelectorAll('.setup-screen, .quiz-screen, .summary-screen, .training-screen, .study-guide-screen, .cross-exam-screen')
        .forEach(screen => screen.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Handle Enter key
document.addEventListener('keypress', (e) => {
    // Initialize audio on first interaction
    initAudioContext();
    
    if (e.key === 'Enter') {
        // In verse mode, allow Enter/Shift+Enter to insert newlines in the textarea
        if (state.isVerseMode && document.activeElement?.id === 'verseAnswerInput') {
            return; // let the browser handle newline insertion
        }

        const activeScreen = document.querySelector('.setup-screen.active, .quiz-screen.active, .training-screen.active, .study-guide-screen.active, .cross-exam-screen.active');
        if (activeScreen) {
            if (activeScreen.id === 'setupScreen') {
                startSession();
            } else if (activeScreen.id === 'quizScreen') {
                document.getElementById('submitBtn').click();
            } else if (activeScreen.id === 'trainingScreen') {
                nextTrainingWord();
            } else if (activeScreen.id === 'studyGuideScreen') {
                startExamFromStudyGuide();
            } else if (activeScreen.id === 'crossExamScreen') {
                // Enter on the next button if answer area is hidden; otherwise Ctrl+Enter submits
                const nextArea = document.getElementById('crossExamNextArea');
                if (nextArea && nextArea.style.display !== 'none') {
                    nextCrossExamQuestion();
                }
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

