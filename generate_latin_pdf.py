#!/usr/bin/env python3
"""
Generate a PDF file with Latin-Bulgarian phrases
with two-column table layout using WeasyPrint.
"""

import json
import sys
from pathlib import Path
from datetime import datetime
from weasyprint import HTML, CSS


def get_timestamp():
    """Get current timestamp in readable format"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def generate_latin_pdf(input_file_la_bg, input_file_bg_la, output_file, direction="both"):
    """
    Generate PDF vocabulary list from Latin phrase JSON data with two-column layout.
    
    Args:
        input_file_la_bg: Path to the Latin→Bulgarian JSON file
        input_file_bg_la: Path to the Bulgarian→Latin JSON file
        output_file: Path to the output PDF file
        direction: "la_bg", "bg_la", or "both" (default)
    """
    data_la_bg = []
    data_bg_la = []
    
    # Load the appropriate data based on direction
    if direction in ["la_bg", "both"]:
        with open(input_file_la_bg, 'r', encoding='utf-8') as f:
            data_la_bg = json.load(f)
            # Sort by Latin phrase
            data_la_bg.sort(key=lambda x: x["la"].lower())
    
    if direction in ["bg_la", "both"]:
        with open(input_file_bg_la, 'r', encoding='utf-8') as f:
            data_bg_la = json.load(f)
            # Sort by Bulgarian phrase
            data_bg_la.sort(key=lambda x: x["bg"].lower())
    
    # Build HTML content
    direction_title = {
        "la_bg": "Latin → Bulgarian",
        "bg_la": "Bulgarian → Latin",
        "both": "Latin ↔ Bulgarian"
    }[direction]
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Латински Фрази - {direction_title}</title>
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
                margin-top: 20px;
                margin-bottom: 10px;
                border-bottom: 2px solid #333;
                padding-bottom: 3px;
                page-break-after: avoid;
            }}
            .phrase-info {{
                font-size: 9pt;
                margin-bottom: 15px;
                text-align: center;
                color: #555;
                font-style: italic;
            }}
            table {{
                width: 100%;
                border-collapse: collapse;
                font-size: 11pt;
                margin-bottom: 20px;
            }}
            th {{
                background-color: #f0f0f0;
                border: 1px solid #999;
                padding: 4px 6px;
                text-align: left;
                font-weight: bold;
                font-size: 12pt;
            }}
            td {{
                border: 1px solid #ddd;
                padding: 3px 6px;
                vertical-align: top;
                line-height: 1.3;
            }}
            td:first-child {{
                width: 48%;
                font-style: italic;
            }}
            td:last-child {{
                width: 48%;
            }}
            .summary {{
                text-align: center;
                margin-top: 20px;
                font-size: 9pt;
                font-weight: bold;
                border-top: 1px solid #333;
                padding-top: 5px;
            }}
            tr:nth-child(even) {{
                background-color: #f9f9f9;
            }}
        </style>
    </head>
    <body>
        <h1>Латински Фрази - {direction_title}</h1>
        <div class="phrase-info">Сборник с латински фрази и изрази</div>
    """
    
    # Add Latin → Bulgarian section
    if direction in ["la_bg", "both"]:
        html_content += """
        <h2>Latin → Български</h2>
        <table>
            <thead>
                <tr>
                    <th>Latin</th>
                    <th>Български</th>
                </tr>
            </thead>
            <tbody>
        """
        
        for phrase in data_la_bg:
            latin = phrase["la"]
            bulgarian = phrase["bg"]
            html_content += f"""
                <tr>
                    <td>{latin}</td>
                    <td>{bulgarian}</td>
                </tr>
            """
        
        html_content += """
            </tbody>
        </table>
        """
    
    # Add Bulgarian → Latin section
    if direction in ["bg_la", "both"]:
        html_content += """
        <h2>Български → Latin</h2>
        <table>
            <thead>
                <tr>
                    <th>Български</th>
                    <th>Latin</th>
                </tr>
            </thead>
            <tbody>
        """
        
        for phrase in data_bg_la:
            latin = phrase["la"]
            bulgarian = phrase["bg"]
            html_content += f"""
                <tr>
                    <td>{bulgarian}</td>
                    <td>{latin}</td>
                </tr>
            """
        
        html_content += """
            </tbody>
        </table>
        """
    
    # Add summary
    html_content += """
        <div class="summary">
    """
    
    if direction == "both":
        total = len(data_la_bg) + len(data_bg_la)
        html_content += f"""
            Общо фрази: {total} ({len(data_la_bg)} Latin→Bulgarian + {len(data_bg_la)} Bulgarian→Latin)
        """
    elif direction == "la_bg":
        html_content += f"""
            Общо фрази: {len(data_la_bg)}
        """
    else:
        html_content += f"""
            Общо фрази: {len(data_bg_la)}
        """
    
    html_content += """
        </div>
    </body>
    </html>
    """
    
    # Generate PDF
    HTML(string=html_content).write_pdf(output_file)
    
    print(f"[{get_timestamp()}] ✓ Generated Latin phrases PDF: {output_file}")
    print(f"[{get_timestamp()}]   Direction: {direction_title}")
    
    if direction == "both":
        total = len(data_la_bg) + len(data_bg_la)
        print(f"[{get_timestamp()}]   Total phrases: {total}")
        print(f"[{get_timestamp()}]     - Latin → Bulgarian: {len(data_la_bg)} phrases")
        print(f"[{get_timestamp()}]     - Bulgarian → Latin: {len(data_bg_la)} phrases")
    elif direction == "la_bg":
        print(f"[{get_timestamp()}]   Total phrases: {len(data_la_bg)}")
    else:
        print(f"[{get_timestamp()}]   Total phrases: {len(data_bg_la)}")


if __name__ == "__main__":
    # File paths
    data_dir = Path(__file__).parent / "data"
    input_file_la_bg = data_dir / "phrases_la_bg.json"
    input_file_bg_la = data_dir / "phrases_bg_la.json"
    
    # Parse command line arguments
    if len(sys.argv) > 1:
        direction = sys.argv[1].lower()
        if direction not in ["la_bg", "bg_la", "both"]:
            print(f"Invalid direction: {direction}")
            print("Usage: python generate_latin_pdf.py [direction]")
            print("  direction: la_bg, bg_la, or both (default: both)")
            sys.exit(1)
    else:
        direction = "both"
    
    # Generate output filename based on direction
    output_file = f"latin_phrases_{direction}.pdf"
    
    # Generate the PDF
    generate_latin_pdf(input_file_la_bg, input_file_bg_la, output_file, direction)
