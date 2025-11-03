#!/usr/bin/env python3
"""
Generate a PDF file with Greek-Bulgarian vocabulary for lessons 30 and 31
with two-column table layout using WeasyPrint.
"""

import json
from pathlib import Path
from datetime import datetime
from weasyprint import HTML, CSS


def get_timestamp():
    """Get current timestamp in readable format"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def generate_vocabulary_pdf(input_file, output_file, lessons):
    """
    Generate PDF vocabulary list from JSON data with two-column layout.
    
    Args:
        input_file: Path to the JSON file with vocabulary
        output_file: Path to the output PDF file
        lessons: List of lesson numbers to include
    """
    # Load the vocabulary data
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Filter words for specified lessons
    words_by_lesson = {}
    for lesson in lessons:
        words_by_lesson[lesson] = [
            item for item in data 
            if item.get("Урок") == lesson
        ]
    
    # Build HTML content
    lessons_title = ", ".join(str(l) for l in lessons)
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Старогръцки Речник - Уроци {lessons_title}</title>
        <style>
            @page {{
                size: A4;
                margin: 1.5cm 1.2cm;
            }}
            body {{
                font-family: 'Times New Roman', serif;
                font-size: 10pt;
            }}
            h1 {{
                text-align: center;
                font-size: 16pt;
                margin-bottom: 5px;
                margin-top: 0;
            }}
            h2 {{
                font-size: 13pt;
                margin-top: 10px;
                margin-bottom: 5px;
                border-bottom: 1px solid #333;
                padding-bottom: 2px;
                page-break-after: avoid;
            }}
            .lesson-info {{
                font-size: 9pt;
                margin-bottom: 8px;
                font-weight: bold;
                page-break-after: avoid;
            }}
            .two-column-container {{
                display: flex;
                gap: 15px;
                margin-bottom: 15px;
                page-break-inside: avoid;
            }}
            .column {{
                flex: 1;
            }}
            table {{
                width: 100%;
                border-collapse: collapse;
                font-size: 12pt;
            }}
            th {{
                background-color: #f0f0f0;
                border: 1px solid #999;
                padding: 3px 4px;
                text-align: left;
                font-weight: bold;
                font-size: 12pt;
            }}
            td {{
                border: 1px solid #ddd;
                padding: 2px 4px;
                vertical-align: top;
                line-height: 1.2;
            }}
            td:first-child {{
                width: 45%;
            }}
            .summary {{
                text-align: center;
                margin-top: 15px;
                font-size: 9pt;
                font-weight: bold;
                border-top: 1px solid #333;
                padding-top: 5px;
            }}
        </style>
    </head>
    <body>
        <h1>Старогръцки Речник - Уроци {lessons_title}</h1>
    """
    
    for lesson in lessons:
        words = words_by_lesson[lesson]
        
        # Add page break before lesson 31 to keep it with its table
        if lesson == 31:
            html_content += '<div style="page-break-before: always;"></div>'
        
        html_content += f"""
        <h2>Урок {lesson}</h2>
        <div class="lesson-info">Общо думи: {len(words)}</div>
        """
        
        # Split words into two halves
        mid_point = (len(words) + 1) // 2
        left_words = words[:mid_point]
        right_words = words[mid_point:]
        
        html_content += '<div class="two-column-container">'
        
        # Left column
        html_content += '<div class="column"><table><thead><tr><th>Гръцки</th><th>Превод</th></tr></thead><tbody>'
        for word in left_words:
            greek = word.get("Лема", "")
            bulgarian = word.get("Превод", "")
            html_content += f'<tr><td>{greek}</td><td>{bulgarian}</td></tr>'
        html_content += '</tbody></table></div>'
        
        # Right column
        html_content += '<div class="column"><table><thead><tr><th>Гръцки</th><th>Превод</th></tr></thead><tbody>'
        for word in right_words:
            greek = word.get("Лема", "")
            bulgarian = word.get("Превод", "")
            html_content += f'<tr><td>{greek}</td><td>{bulgarian}</td></tr>'
        html_content += '</tbody></table></div>'
        
        html_content += '</div>'
    
    # Close HTML
    html_content += """
    </body>
    </html>
    """
    
    # Generate PDF
    HTML(string=html_content).write_pdf(output_file)
    
    # Calculate total for reporting
    total_words = sum(len(words_by_lesson[lesson]) for lesson in lessons)
    
    print(f"[{get_timestamp()}] ✓ Generated vocabulary PDF: {output_file}")
    print(f"[{get_timestamp()}]   Lessons: {lessons}")
    print(f"[{get_timestamp()}]   Total words: {total_words}")
    for lesson in lessons:
        print(f"[{get_timestamp()}]     - Lesson {lesson}: {len(words_by_lesson[lesson])} words")


if __name__ == "__main__":
    import sys
    
    # Configuration
    input_file = Path("data/greek_words_standard.json")
    
    # Parse command-line arguments or use defaults
    if len(sys.argv) > 1:
        # Parse lessons from command line (e.g., "32.1" "32.2")
        lessons = [float(arg) for arg in sys.argv[1:]]
        # Generate output filename based on lessons
        lessons_str = "_".join(str(l).replace(".", "_") for l in lessons)
        output_file = Path(f"vocabulary_lessons_{lessons_str}.pdf")
    else:
        # Default lessons
        output_file = Path("vocabulary_lessons_30_31.pdf")
        lessons = [30, 31]
    
    # Generate the PDF file
    generate_vocabulary_pdf(input_file, output_file, lessons)
