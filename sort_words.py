"""
Sort Greek words by lesson number, then alphabetically by lemma (ignoring accents and diacritics)
"""
import json
import unicodedata
from pathlib import Path


def remove_accents(text: str) -> str:
    """
    Remove accents and diacritics from Greek text for sorting purposes.
    Normalizes the text using NFD (decomposed form) and filters out combining marks.
    """
    # Normalize to NFD (decomposed form where accents are separate characters)
    nfd = unicodedata.normalize('NFD', text)
    # Filter out combining characters (accents, breathing marks, etc.)
    without_accents = ''.join(char for char in nfd if unicodedata.category(char) != 'Mn')
    return without_accents


def sort_greek_words(input_file: str, output_file: str = None):
    """
    Sort Greek words first by lesson number (Урок field), then by lemma (Лема field) ignoring accents.
    
    Args:
        input_file: Path to input JSON file
        output_file: Path to output JSON file (defaults to input_file if not specified)
    """
    if output_file is None:
        output_file = input_file
    
    # Read the JSON file
    with open(input_file, 'r', encoding='utf-8') as f:
        words = json.load(f)
    
    print(f"Loaded {len(words)} words from {input_file}")
    
    # Sort by lesson number first, then by lemma without accents
    sorted_words = sorted(words, key=lambda x: (x.get('Урок', 0), remove_accents(x['Лема'].lower())))
    
    # Write back to file with pretty formatting
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(sorted_words, f, ensure_ascii=False, indent=4)
    
    print(f"Sorted {len(sorted_words)} words and saved to {output_file}")
    
    # Show first few entries as example
    print("\nFirst 5 entries after sorting:")
    for i, word in enumerate(sorted_words[:5], 1):
        lemma_without_accents = remove_accents(word['Лема'])
        lesson = word.get('Урок', 'N/A')
        print(f"{i}. Урок {lesson}: {word['Лема']} (normalized: {lemma_without_accents}) - {word['Превод']}")


if __name__ == '__main__':
    # Sort the standard words file
    data_dir = Path(__file__).parent / 'data'
    
    print("Sorting greek_words_standard.json...")
    sort_greek_words(
        str(data_dir / 'greek_words_standard.json'),
        str(data_dir / 'greek_words_standard.json')
    )
    
    print("\n" + "="*60 + "\n")
    
    print("Sorting greek_words_standard_full.json...")
    sort_greek_words(
        str(data_dir / 'greek_words_standard_full.json'),
        str(data_dir / 'greek_words_standard_full.json')
    )
    
    print("\n" + "="*60 + "\n")
    
    print("Sorting greek_words.json...")
    sort_greek_words(
        str(data_dir / 'greek_words.json'),
        str(data_dir / 'greek_words.json')
    )
