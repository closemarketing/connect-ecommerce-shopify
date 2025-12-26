#!/usr/bin/env python
# -*- coding: utf-8 -*-
import sys
import os

try:
	from pypdf import PdfReader
	has_pypdf = True
except ImportError:
	has_pypdf = False
	print("Installing pypdf...")
	os.system("pip install pypdf")
	from pypdf import PdfReader

def extract_pdf_text(pdf_path):
	"""Extract text from PDF file"""
	try:
		with open(pdf_path, 'rb') as file:
			pdf_reader = PdfReader(file)
			text = ""
			total_pages = len(pdf_reader.pages)
			
			print(f"Total pages: {total_pages}\n")
			print("=" * 80)
			
			for page_num in range(total_pages):
				page = pdf_reader.pages[page_num]
				page_text = page.extract_text()
				text += f"\n\n--- PAGE {page_num + 1} ---\n\n"
				text += page_text
			
			return text
	except Exception as e:
		print(f"Error reading PDF: {e}")
		return None

if __name__ == "__main__":
	pdf_path = r"C:\laragon\www\shopi-clientify-app\docs\Guía del Integrador 8.3.0.pdf"
	
	if not os.path.exists(pdf_path):
		# Try alternate path
		pdf_path = os.path.join(os.getcwd(), "docs", "Guía del Integrador 8.3.0.pdf")
	
	if os.path.exists(pdf_path):
		print(f"Reading PDF: {pdf_path}\n")
		text = extract_pdf_text(pdf_path)
		if text:
			# Save to file for easier reading
			output_file = "agora_api_guide.txt"
			with open(output_file, 'w', encoding='utf-8') as f:
				f.write(text)
			print(f"\n\nText extracted and saved to: {output_file}")
			print(f"Total characters: {len(text)}")
			
			# Print first 5000 characters
			print("\n\n" + "=" * 80)
			print("FIRST 5000 CHARACTERS:")
			print("=" * 80)
			print(text[:5000])
	else:
		print(f"PDF file not found at: {pdf_path}")
