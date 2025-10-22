// ==================== Greek Virtual Keyboard Functions ====================

let diacriticMode = false;
let allGreekWords = []; // Store all Greek words for autocomplete
let autocompleteEnabled = false; // Autocomplete is disabled by default
let shiftMode = false; // Shift/uppercase mode for Greek keyboard

// Smart diacritic system - track which diacritics are active
let activeDiacritics = {
    smoothBreathing: false,    // ᾿ (ἀ)
    roughBreathing: false,     // ῾ (ἁ)
    acute: false,              // ´ (ά)
    grave: false,              // ` (ὰ)
    circumflex: false,         // ῀ (ᾶ)
    iotaSubscript: false,      // ͅ (ᾳ)
    diaeresis: false           // ¨ (ϊ) - for iota and upsilon
};

// Unicode mapping for combining diacritics with base vowels
// This comprehensive map handles all polytonic Greek combinations
const diacriticMap = {
    // Alpha combinations
    'α': {
        base: 'α', upper: 'Α',
        smoothBreathing: 'ἀ', 'smoothBreathing+upper': 'Ἀ',
        roughBreathing: 'ἁ', 'roughBreathing+upper': 'Ἁ',
        acute: 'ά', 'acute+upper': 'Ά',
        grave: 'ὰ', 'grave+upper': 'Ὰ',
        circumflex: 'ᾶ', 'circumflex+upper': 'Ἆ',
        iotaSubscript: 'ᾳ', 'iotaSubscript+upper': 'ᾼ',
        'smoothBreathing+acute': 'ἄ', 'smoothBreathing+acute+upper': 'Ἄ',
        'roughBreathing+acute': 'ἅ', 'roughBreathing+acute+upper': 'Ἅ',
        'smoothBreathing+grave': 'ἂ', 'smoothBreathing+grave+upper': 'Ἂ',
        'roughBreathing+grave': 'ἃ', 'roughBreathing+grave+upper': 'Ἃ',
        'smoothBreathing+circumflex': 'ἆ', 'smoothBreathing+circumflex+upper': 'Ἆ',
        'roughBreathing+circumflex': 'ἇ', 'roughBreathing+circumflex+upper': 'Ἇ',
        'acute+iotaSubscript': 'ᾴ', 'acute+iotaSubscript+upper': 'ᾌ',
        'grave+iotaSubscript': 'ᾲ', 'grave+iotaSubscript+upper': 'ᾊ',
        'circumflex+iotaSubscript': 'ᾷ', 'circumflex+iotaSubscript+upper': 'ᾎ',
        'smoothBreathing+iotaSubscript': 'ᾀ', 'smoothBreathing+iotaSubscript+upper': 'ᾈ',
        'roughBreathing+iotaSubscript': 'ᾁ', 'roughBreathing+iotaSubscript+upper': 'ᾉ',
        'smoothBreathing+acute+iotaSubscript': 'ᾄ', 'smoothBreathing+acute+iotaSubscript+upper': 'ᾌ',
        'roughBreathing+acute+iotaSubscript': 'ᾅ', 'roughBreathing+acute+iotaSubscript+upper': 'ᾍ',
        'smoothBreathing+grave+iotaSubscript': 'ᾂ', 'smoothBreathing+grave+iotaSubscript+upper': 'ᾊ',
        'roughBreathing+grave+iotaSubscript': 'ᾃ', 'roughBreathing+grave+iotaSubscript+upper': 'ᾋ',
        'smoothBreathing+circumflex+iotaSubscript': 'ᾆ', 'smoothBreathing+circumflex+iotaSubscript+upper': 'ᾎ',
        'roughBreathing+circumflex+iotaSubscript': 'ᾇ', 'roughBreathing+circumflex+iotaSubscript+upper': 'ᾏ'
    },
    // Epsilon combinations
    'ε': {
        base: 'ε', upper: 'Ε',
        smoothBreathing: 'ἐ', 'smoothBreathing+upper': 'Ἐ',
        roughBreathing: 'ἑ', 'roughBreathing+upper': 'Ἑ',
        acute: 'έ', 'acute+upper': 'Έ',
        grave: 'ὲ', 'grave+upper': 'Ὲ',
        'smoothBreathing+acute': 'ἔ', 'smoothBreathing+acute+upper': 'Ἔ',
        'roughBreathing+acute': 'ἕ', 'roughBreathing+acute+upper': 'Ἕ',
        'smoothBreathing+grave': 'ἒ', 'smoothBreathing+grave+upper': 'Ἒ',
        'roughBreathing+grave': 'ἓ', 'roughBreathing+grave+upper': 'Ἓ'
    },
    // Eta combinations
    'η': {
        base: 'η', upper: 'Η',
        smoothBreathing: 'ἠ', 'smoothBreathing+upper': 'Ἠ',
        roughBreathing: 'ἡ', 'roughBreathing+upper': 'Ἡ',
        acute: 'ή', 'acute+upper': 'Ή',
        grave: 'ὴ', 'grave+upper': 'Ὴ',
        circumflex: 'ῆ', 'circumflex+upper': 'Ἦ',
        iotaSubscript: 'ῃ', 'iotaSubscript+upper': 'ῌ',
        'smoothBreathing+acute': 'ἤ', 'smoothBreathing+acute+upper': 'Ἤ',
        'roughBreathing+acute': 'ἥ', 'roughBreathing+acute+upper': 'Ἥ',
        'smoothBreathing+grave': 'ἢ', 'smoothBreathing+grave+upper': 'Ἢ',
        'roughBreathing+grave': 'ἣ', 'roughBreathing+grave+upper': 'Ἣ',
        'smoothBreathing+circumflex': 'ἦ', 'smoothBreathing+circumflex+upper': 'Ἦ',
        'roughBreathing+circumflex': 'ἧ', 'roughBreathing+circumflex+upper': 'Ἧ',
        'acute+iotaSubscript': 'ῄ', 'acute+iotaSubscript+upper': 'ᾜ',
        'grave+iotaSubscript': 'ῂ', 'grave+iotaSubscript+upper': 'ᾚ',
        'circumflex+iotaSubscript': 'ῇ', 'circumflex+iotaSubscript+upper': 'ᾞ',
        'smoothBreathing+iotaSubscript': 'ᾐ', 'smoothBreathing+iotaSubscript+upper': 'ᾘ',
        'roughBreathing+iotaSubscript': 'ᾑ', 'roughBreathing+iotaSubscript+upper': 'ᾙ',
        'smoothBreathing+acute+iotaSubscript': 'ᾔ', 'smoothBreathing+acute+iotaSubscript+upper': 'ᾜ',
        'roughBreathing+acute+iotaSubscript': 'ᾕ', 'roughBreathing+acute+iotaSubscript+upper': 'ᾝ',
        'smoothBreathing+grave+iotaSubscript': 'ᾒ', 'smoothBreathing+grave+iotaSubscript+upper': 'ᾚ',
        'roughBreathing+grave+iotaSubscript': 'ᾓ', 'roughBreathing+grave+iotaSubscript+upper': 'ᾛ',
        'smoothBreathing+circumflex+iotaSubscript': 'ᾖ', 'smoothBreathing+circumflex+iotaSubscript+upper': 'ᾞ',
        'roughBreathing+circumflex+iotaSubscript': 'ᾗ', 'roughBreathing+circumflex+iotaSubscript+upper': 'ᾟ'
    },
    // Iota combinations
    'ι': {
        base: 'ι', upper: 'Ι',
        smoothBreathing: 'ἰ', 'smoothBreathing+upper': 'Ἰ',
        roughBreathing: 'ἱ', 'roughBreathing+upper': 'Ἱ',
        acute: 'ί', 'acute+upper': 'Ί',
        grave: 'ὶ', 'grave+upper': 'Ὶ',
        circumflex: 'ῖ', 'circumflex+upper': 'Ἶ',
        diaeresis: 'ϊ', 'diaeresis+upper': 'Ϊ',
        'smoothBreathing+acute': 'ἴ', 'smoothBreathing+acute+upper': 'Ἴ',
        'roughBreathing+acute': 'ἵ', 'roughBreathing+acute+upper': 'Ἵ',
        'smoothBreathing+grave': 'ἲ', 'smoothBreathing+grave+upper': 'Ἲ',
        'roughBreathing+grave': 'ἳ', 'roughBreathing+grave+upper': 'Ἳ',
        'smoothBreathing+circumflex': 'ἶ', 'smoothBreathing+circumflex+upper': 'Ἶ',
        'roughBreathing+circumflex': 'ἷ', 'roughBreathing+circumflex+upper': 'Ἷ',
        'diaeresis+acute': 'ΐ', 'diaeresis+acute+upper': 'Ϊ́',
        'diaeresis+grave': 'ῒ', 'diaeresis+grave+upper': 'Ϊ̀'
    },
    // Omicron combinations
    'ο': {
        base: 'ο', upper: 'Ο',
        smoothBreathing: 'ὀ', 'smoothBreathing+upper': 'Ὀ',
        roughBreathing: 'ὁ', 'roughBreathing+upper': 'Ὁ',
        acute: 'ό', 'acute+upper': 'Ό',
        grave: 'ὸ', 'grave+upper': 'Ὸ',
        'smoothBreathing+acute': 'ὄ', 'smoothBreathing+acute+upper': 'Ὄ',
        'roughBreathing+acute': 'ὅ', 'roughBreathing+acute+upper': 'Ὅ',
        'smoothBreathing+grave': 'ὂ', 'smoothBreathing+grave+upper': 'Ὂ',
        'roughBreathing+grave': 'ὃ', 'roughBreathing+grave+upper': 'Ὃ'
    },
    // Upsilon combinations
    'υ': {
        base: 'υ', upper: 'Υ',
        smoothBreathing: 'ὐ', 'smoothBreathing+upper': 'Υ', // No uppercase smooth breathing on upsilon
        roughBreathing: 'ὑ', 'roughBreathing+upper': 'Ὑ',
        acute: 'ύ', 'acute+upper': 'Ύ',
        grave: 'ὺ', 'grave+upper': 'Ὺ',
        circumflex: 'ῦ', 'circumflex+upper': 'Υ̓͂',
        diaeresis: 'ϋ', 'diaeresis+upper': 'Ϋ',
        'smoothBreathing+acute': 'ὔ', 'smoothBreathing+acute+upper': 'Ύ',
        'roughBreathing+acute': 'ὕ', 'roughBreathing+acute+upper': 'Ὕ',
        'smoothBreathing+grave': 'ὒ', 'smoothBreathing+grave+upper': 'Ὺ',
        'roughBreathing+grave': 'ὓ', 'roughBreathing+grave+upper': 'Ὓ',
        'smoothBreathing+circumflex': 'ὖ', 'smoothBreathing+circumflex+upper': 'Υ̓͂',
        'roughBreathing+circumflex': 'ὗ', 'roughBreathing+circumflex+upper': 'Ὗ',
        'diaeresis+acute': 'ΰ', 'diaeresis+acute+upper': 'Ϋ́',
        'diaeresis+grave': 'ῢ', 'diaeresis+grave+upper': 'Ϋ̀'
    },
    // Omega combinations
    'ω': {
        base: 'ω', upper: 'Ω',
        smoothBreathing: 'ὠ', 'smoothBreathing+upper': 'Ὠ',
        roughBreathing: 'ὡ', 'roughBreathing+upper': 'Ὡ',
        acute: 'ώ', 'acute+upper': 'Ώ',
        grave: 'ὼ', 'grave+upper': 'Ὼ',
        circumflex: 'ῶ', 'circumflex+upper': 'Ὦ',
        iotaSubscript: 'ῳ', 'iotaSubscript+upper': 'ῼ',
        'smoothBreathing+acute': 'ὤ', 'smoothBreathing+acute+upper': 'Ὤ',
        'roughBreathing+acute': 'ὥ', 'roughBreathing+acute+upper': 'Ὥ',
        'smoothBreathing+grave': 'ὢ', 'smoothBreathing+grave+upper': 'Ὢ',
        'roughBreathing+grave': 'ὣ', 'roughBreathing+grave+upper': 'Ὣ',
        'smoothBreathing+circumflex': 'ὦ', 'smoothBreathing+circumflex+upper': 'Ὦ',
        'roughBreathing+circumflex': 'ὧ', 'roughBreathing+circumflex+upper': 'Ὧ',
        'acute+iotaSubscript': 'ῴ', 'acute+iotaSubscript+upper': 'ᾬ',
        'grave+iotaSubscript': 'ῲ', 'grave+iotaSubscript+upper': 'ᾪ',
        'circumflex+iotaSubscript': 'ῷ', 'circumflex+iotaSubscript+upper': 'ᾮ',
        'smoothBreathing+iotaSubscript': 'ᾠ', 'smoothBreathing+iotaSubscript+upper': 'ᾨ',
        'roughBreathing+iotaSubscript': 'ᾡ', 'roughBreathing+iotaSubscript+upper': 'ᾩ',
        'smoothBreathing+acute+iotaSubscript': 'ᾤ', 'smoothBreathing+acute+iotaSubscript+upper': 'ᾬ',
        'roughBreathing+acute+iotaSubscript': 'ᾥ', 'roughBreathing+acute+iotaSubscript+upper': 'ᾭ',
        'smoothBreathing+grave+iotaSubscript': 'ᾢ', 'smoothBreathing+grave+iotaSubscript+upper': 'ᾪ',
        'roughBreathing+grave+iotaSubscript': 'ᾣ', 'roughBreathing+grave+iotaSubscript+upper': 'ᾫ',
        'smoothBreathing+circumflex+iotaSubscript': 'ᾦ', 'smoothBreathing+circumflex+iotaSubscript+upper': 'ᾮ',
        'roughBreathing+circumflex+iotaSubscript': 'ᾧ', 'roughBreathing+circumflex+iotaSubscript+upper': 'ᾯ'
    },
    // Rho combinations
    'ρ': {
        base: 'ρ', upper: 'Ρ',
        smoothBreathing: 'ῤ', 'smoothBreathing+upper': 'Ρ',
        roughBreathing: 'ῥ', 'roughBreathing+upper': 'Ῥ'
    }
};

// Toggle diacritic button - marks a diacritic as active/inactive
function toggleDiacritic(diacriticName) {
    // Only one accent mark can be active at a time (acute, grave, circumflex)
    const accentMarks = ['acute', 'grave', 'circumflex'];
    
    if (accentMarks.includes(diacriticName)) {
        // Deactivate other accent marks
        accentMarks.forEach(mark => {
            if (mark !== diacriticName) {
                activeDiacritics[mark] = false;
                const btn = document.querySelector(`[data-diacritic="${mark}"]`);
                if (btn) btn.classList.remove('active');
            }
        });
    }
    
    // Only one breathing mark can be active at a time
    const breathingMarks = ['smoothBreathing', 'roughBreathing'];
    
    if (breathingMarks.includes(diacriticName)) {
        // Deactivate other breathing marks
        breathingMarks.forEach(mark => {
            if (mark !== diacriticName) {
                activeDiacritics[mark] = false;
                const btn = document.querySelector(`[data-diacritic="${mark}"]`);
                if (btn) btn.classList.remove('active');
            }
        });
    }
    
    // Toggle the selected diacritic
    activeDiacritics[diacriticName] = !activeDiacritics[diacriticName];
    
    // Update button visual state
    const btn = document.querySelector(`[data-diacritic="${diacriticName}"]`);
    if (btn) {
        if (activeDiacritics[diacriticName]) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }
    
    updateKeyboardPreview();
}

// Reset all diacritics to inactive state
function resetDiacritics() {
    Object.keys(activeDiacritics).forEach(key => {
        activeDiacritics[key] = false;
    });
    
    // Remove active class from all diacritic buttons
    document.querySelectorAll('.diacritic-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    updateKeyboardPreview();
}

// Update the visual preview of what vowels will look like with current diacritics
function updateKeyboardPreview() {
    const baseVowels = ['α', 'ε', 'η', 'ι', 'ο', 'υ', 'ω'];
    
    baseVowels.forEach(vowel => {
        const key = document.querySelector(`.greek-key[data-vowel="${vowel}"]`);
        if (key) {
            const combined = getCombinedCharacter(vowel);
            key.textContent = combined;
        }
    });
    
    // Update rho if breathings are active
    const rhoKey = document.querySelector('.greek-key[data-vowel="ρ"]');
    if (rhoKey) {
        const combined = getCombinedCharacter('ρ');
        rhoKey.textContent = combined;
    }
}

// Get the combined character based on active diacritics
function getCombinedCharacter(baseChar) {
    const charMap = diacriticMap[baseChar];
    if (!charMap) return baseChar;
    
    // Build the combination key
    const activeParts = [];
    
    // Order matters for the key: breathing → accent → iota/diaeresis
    if (activeDiacritics.smoothBreathing) activeParts.push('smoothBreathing');
    if (activeDiacritics.roughBreathing) activeParts.push('roughBreathing');
    if (activeDiacritics.acute) activeParts.push('acute');
    if (activeDiacritics.grave) activeParts.push('grave');
    if (activeDiacritics.circumflex) activeParts.push('circumflex');
    if (activeDiacritics.iotaSubscript) activeParts.push('iotaSubscript');
    if (activeDiacritics.diaeresis) activeParts.push('diaeresis');
    
    // No diacritics active - return base or uppercase
    if (activeParts.length === 0) {
        return shiftMode ? charMap.upper : charMap.base;
    }
    
    // Build the combination key
    const combinationKey = activeParts.join('+') + (shiftMode ? '+upper' : '');
    
    // Return the combined character or base if combination doesn't exist
    return charMap[combinationKey] || (shiftMode ? charMap.upper : charMap.base);
}

// Insert a vowel with the current diacritics
function insertVowelWithDiacritics(baseVowel) {
    const combinedChar = getCombinedCharacter(baseVowel);
    insertGreek(combinedChar);
    
    // Reset diacritics after insertion (like shift key)
    resetDiacritics();
    
    // Also reset shift if it was active
    if (shiftMode) {
        toggleShift();
    }
}

// Toggle autocomplete functionality
function toggleAutocomplete() {
    autocompleteEnabled = !autocompleteEnabled;
    const toggle = document.getElementById('autocompleteToggle');
    const dropdown = document.getElementById('autocompleteDropdown');
    
    if (autocompleteEnabled) {
        toggle.classList.add('active');
        toggle.innerHTML = '💡 Disable Autocomplete';
        showNotification('Autocomplete enabled', 'info');
    } else {
        toggle.classList.remove('active');
        toggle.innerHTML = '💡 Enable Autocomplete';
        dropdown.classList.remove('active');
        showNotification('Autocomplete disabled', 'info');
    }
}

// Toggle shift mode for uppercase Greek letters
function toggleShift() {
    shiftMode = !shiftMode;
    const shiftBtn = document.getElementById('shiftBtn');
    const allKeys = document.querySelectorAll('.greek-key[data-lower]');
    
    if (shiftMode) {
        shiftBtn.classList.add('active');
        // Update all letter keys to show uppercase
        allKeys.forEach(key => {
            const upper = key.getAttribute('data-upper');
            if (upper) {
                key.textContent = upper;
            }
        });
    } else {
        shiftBtn.classList.remove('active');
        // Update all letter keys to show lowercase
        allKeys.forEach(key => {
            const lower = key.getAttribute('data-lower');
            if (lower) {
                key.textContent = lower;
            }
        });
    }
}

// Insert Greek character (handles shift mode)
function insertGreekLetter(lowerChar, upperChar) {
    const charToInsert = shiftMode ? upperChar : lowerChar;
    insertGreek(charToInsert);
    
    // Auto-disable shift after inserting one character (like a real keyboard)
    if (shiftMode) {
        toggleShift();
    }
}

// Toggle Greek keyboard visibility
function toggleGreekKeyboard() {
    const keyboard = document.getElementById('greekKeyboard');
    const toggle = document.getElementById('keyboardToggle');
    
    if (keyboard.classList.contains('active')) {
        keyboard.classList.remove('active');
        toggle.classList.remove('active');
        toggle.innerHTML = '⌨️ Show Greek Keyboard';
    } else {
        keyboard.classList.add('active');
        toggle.classList.add('active');
        toggle.innerHTML = '⌨️ Hide Greek Keyboard';
        
        // Scroll to show the submit button (which is after the keyboard)
        setTimeout(() => {
            const submitBtn = document.getElementById('submitBtn');
            if (submitBtn) {
                submitBtn.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        }, 100);
    }
}

// Insert Greek character at cursor position
function insertGreek(char) {
    const input = document.getElementById('answerInput');
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    
    input.value = text.substring(0, start) + char + text.substring(end);
    input.focus();
    
    // Set cursor position after inserted character
    const newPos = start + char.length;
    input.setSelectionRange(newPos, newPos);
    
    // Trigger autocomplete
    handleAutocomplete();
}

// Enable diacritic editing mode
function enableDiacriticMode() {
    diacriticMode = !diacriticMode;
    const input = document.getElementById('answerInput');
    
    if (diacriticMode) {
        input.style.cursor = 'pointer';
        input.title = 'Click on any character to edit its diacritics';
        showNotification('Diacritic mode enabled. Click on any Greek letter to edit.', 'info');
    } else {
        input.style.cursor = 'text';
        input.title = '';
        closeDiacriticPopup();
    }
}

// Show diacritic options popup
function showDiacriticOptions(char, position) {
    const baseLetter = stripDiacritics(char);
    const variants = diacriticVariants[baseLetter];
    
    if (!variants) {
        showNotification('No diacritic variants available for this character.', 'warning');
        return;
    }
    
    const popup = document.getElementById('diacriticPopup');
    const options = document.getElementById('diacriticOptions');
    
    // Clear previous options
    options.innerHTML = '';
    
    // Add variant buttons
    variants.forEach(variant => {
        const btn = document.createElement('div');
        btn.className = 'diacritic-option';
        btn.textContent = variant;
        btn.onclick = () => replaceDiacritic(position, variant);
        options.appendChild(btn);
    });
    
    // Position popup near the input
    const input = document.getElementById('answerInput');
    const rect = input.getBoundingClientRect();
    popup.style.left = rect.left + 'px';
    popup.style.top = (rect.bottom + 5) + 'px';
    popup.classList.add('active');
    
    // Store current position
    popup.dataset.position = position;
}

// Replace character with diacritic variant
function replaceDiacritic(position, newChar) {
    const input = document.getElementById('answerInput');
    const text = input.value;
    
    input.value = text.substring(0, position) + newChar + text.substring(position + 1);
    input.focus();
    
    closeDiacriticPopup();
    diacriticMode = false;
    input.style.cursor = 'text';
    
    // Trigger autocomplete
    handleAutocomplete();
}

// Close diacritic popup
function closeDiacriticPopup() {
    const popup = document.getElementById('diacriticPopup');
    popup.classList.remove('active');
}

// Strip diacritics to get base letter
function stripDiacritics(char) {
    const normalized = char.normalize('NFD');
    return normalized.replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Handle autocomplete suggestions
function handleAutocomplete() {
    const input = document.getElementById('answerInput');
    const value = input.value.trim().toLowerCase();
    const dropdown = document.getElementById('autocompleteDropdown');
    
    // Only show autocomplete if enabled, for Bulgarian to Greek direction, and has minimum input
    if (!autocompleteEnabled || !state.config || state.config.direction !== 'bulgarian_to_greek' || value.length < 2) {
        dropdown.classList.remove('active');
        return;
    }
    
    // Filter Greek words that start with the input
    const matches = allGreekWords.filter(word => {
        const greekLower = word.greek.toLowerCase();
        return greekLower.includes(value);
    }).slice(0, 8); // Limit to 8 suggestions
    
    if (matches.length === 0) {
        dropdown.classList.remove('active');
        return;
    }
    
    // Build autocomplete items
    dropdown.innerHTML = '';
    matches.forEach(word => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `
            <div class="greek-text">${word.greek}</div>
            <div class="bulgarian-text">${word.bulgarian}</div>
        `;
        item.onclick = () => selectAutocomplete(word.greek);
        dropdown.appendChild(item);
    });
    
    dropdown.classList.add('active');
}

// Select autocomplete suggestion
function selectAutocomplete(text) {
    const input = document.getElementById('answerInput');
    input.value = text;
    document.getElementById('autocompleteDropdown').classList.remove('active');
    input.focus();
}

// Load all Greek words for autocomplete
async function loadGreekWordsForAutocomplete() {
    try {
        // Use the word pairs from the current session if available
        if (state.wordPairs && state.wordPairs.length > 0) {
            allGreekWords = state.wordPairs.map(wp => ({
                greek: wp.greek,
                bulgarian: wp.bulgarian
            }));
        } else {
            // Fetch from API if not available
            const response = await fetch(`${API_BASE}/lessons`);
            const data = await response.json();
            // This will need to be adapted based on your API structure
            // For now, we'll populate it when a quiz starts
        }
    } catch (error) {
        console.error('Failed to load Greek words for autocomplete:', error);
    }
}

// Show notification helper
function showNotification(message, type = 'info') {
    const feedback = document.getElementById('feedback');
    feedback.textContent = message;
    feedback.className = 'feedback';
    if (type === 'info') {
        feedback.style.background = '#d1ecf1';
        feedback.style.color = '#0c5460';
        feedback.style.border = '2px solid #bee5eb';
    } else if (type === 'warning') {
        feedback.style.background = '#fff3cd';
        feedback.style.color = '#856404';
        feedback.style.border = '2px solid #ffeaa7';
    }
    feedback.classList.remove('hidden');
    
    setTimeout(() => {
        feedback.classList.add('hidden');
    }, 3000);
}

// Handle click on input for diacritic mode
document.getElementById('answerInput').addEventListener('click', function(e) {
    if (!diacriticMode) return;
    
    const input = e.target;
    const position = input.selectionStart;
    
    if (position >= 0 && position < input.value.length) {
        const char = input.value[position];
        showDiacriticOptions(char, position);
    }
});

// Handle input changes for autocomplete
document.getElementById('answerInput').addEventListener('input', handleAutocomplete);

// Close autocomplete when clicking outside
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('autocompleteDropdown');
    const input = document.getElementById('answerInput');
    
    if (e.target !== input && !dropdown.contains(e.target)) {
        dropdown.classList.remove('active');
    }
    
    // Close diacritic popup when clicking outside
    const popup = document.getElementById('diacriticPopup');
    if (!popup.contains(e.target) && e.target !== input) {
        closeDiacriticPopup();
    }
});

// Show/hide keyboard based on quiz direction and language mode
function updateKeyboardVisibility() {
    const keyboardToggle = document.getElementById('keyboardToggle');
    const autocompleteToggle = document.getElementById('autocompleteToggle');
    const keyboard = document.getElementById('greekKeyboard');
    
    // Get current direction from state or direction select
    const direction = state.currentDirection || document.getElementById('direction')?.value;
    
    // Show keyboard only for Bulgarian → Greek (Greek mode only)
    if (state.languageMode === 'greek' && direction === 'bulgarian_to_greek') {
        keyboardToggle.style.display = 'inline-flex';
        autocompleteToggle.style.display = 'inline-flex';
        // Load words for autocomplete
        if (state.wordPairs && state.wordPairs.length > 0) {
            allGreekWords = state.wordPairs.map(wp => ({
                greek: wp.greek,
                bulgarian: wp.bulgarian
            }));
        }
    } else {
        // Hide keyboard for Latin mode or Greek → Bulgarian direction
        keyboardToggle.style.display = 'none';
        autocompleteToggle.style.display = 'none';
        keyboard.classList.remove('active');
        document.getElementById('autocompleteDropdown').classList.remove('active');
    }
}
