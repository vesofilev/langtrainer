// ==================== Chemistry Virtual Keyboard Functions ====================

// Insert character at cursor in the active answer input (input or textarea)
function insertChem(char) {
    const input = document.getElementById('answerInput');
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;

    input.value = text.substring(0, start) + char + text.substring(end);
    input.focus();

    const newPos = start + char.length;
    input.setSelectionRange(newPos, newPos);
}

// Toggle chemistry keyboard visibility
function toggleChemKeyboard() {
    const keyboard = document.getElementById('chemKeyboard');
    const toggle = document.getElementById('chemKeyboardToggle');

    if (keyboard.classList.contains('active')) {
        keyboard.classList.remove('active');
        toggle.classList.remove('active');
        toggle.innerHTML = '⌨️ Формули';
    } else {
        keyboard.classList.add('active');
        toggle.classList.add('active');
        toggle.innerHTML = '⌨️ Скрий';

        // Scroll to show the submit button
        setTimeout(() => {
            const submitBtn = document.getElementById('submitBtn');
            if (submitBtn) submitBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 350);
    }
}

// Show/hide chemistry keyboard toggle based on language mode
function updateChemKeyboardVisibility() {
    const toggle = document.getElementById('chemKeyboardToggle');
    const keyboard = document.getElementById('chemKeyboard');
    if (!toggle || !keyboard) return;

    if (state.languageMode === 'chemistry') {
        toggle.style.display = 'inline-flex';
    } else {
        toggle.style.display = 'none';
        keyboard.classList.remove('active');
        toggle.classList.remove('active');
    }
}
