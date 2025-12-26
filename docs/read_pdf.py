#!/usr/bin/env python
# -*- coding: utf-8 -*-
import os
from pypdf import PdfReader

# Get PDF filename
pdf_files = [f for f in os.listdir('.') if f.endswith('.pdf')]
if not pdf_files:
	print("No PDF found")
	exit(1)

pdf_path = pdf_files[0]
print(f"Reading: {pdf_path}\n")

try:
	with open(pdf_path, 'rb') as file:
		pdf_reader = PdfReader(file)
		total_pages = len(pdf_reader.pages)
		print(f"Total pages: {total_pages}\n")
		
		text = ""
		for page_num in range(total_pages):
			page = pdf_reader.pages[page_num]
			page_text = page.extract_text()
			text += f"\n\n{'='*80}\n PAGE {page_num + 1} / {total_pages}\n{'='*80}\n\n"
			text += page_text
		
		# Save complete text
		with open("agora_api_guide_full.txt", 'w', encoding='utf-8') as f:
			f.write(text)
		
		print(f"Extracted {len(text)} characters")
		print(f"Saved to: agora_api_guide_full.txt")
		
		# Print preview
		print("\n" + "="*80)
		print("PREVIEW (first 8000 chars):")
		print("="*80)
		print(text[:8000])
		
except Exception as e:
	print(f"Error: {e}")
	import traceback
	traceback.print_exc()
