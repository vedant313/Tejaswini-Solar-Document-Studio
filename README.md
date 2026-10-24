# Tejaswini Solar Document Studio — Full Project

React + Vite starter project for reading PM Surya Ghar acknowledgement PDFs and portal screenshots, reviewing extracted customer details, and generating draft Annexure, WCR, and Model Agreement PDFs.

## Run on Windows
1. Extract this ZIP to a new folder.
2. Open the extracted `Tejaswini_Solar_Full_Project` folder in VS Code.
3. Open Terminal > New Terminal.
4. Run these commands one at a time:

```powershell
npm.cmd install
npm.cmd run dev
```

5. Open the local URL shown in the terminal (usually `http://localhost:5173`).
6. Choose the acknowledgement PDF or screenshot upload option.

## Notes
- Text-based PDFs are read with PDF.js; screenshots use Tesseract OCR.
- Missing details such as total installation cost and vendor name must be entered manually when absent from the acknowledgement.
- Verify customer name, CA number, mobile, address, capacity and dates before generating documents.
- Generated Annexure/WCR/Model Agreement PDFs are drafts, not official forms. Check against your approved company/authority templates before using them.
- Customer data is processed in the browser by this starter. Handle Aadhaar and customer documents carefully.


## Supplied PDF templates
The user-provided Annexure-I, WCR, and Model Agreement PDFs are included under `public/templates/`. Generated PDFs render those supplied pages as backgrounds and overlay entered values. Check placement on each generated PDF before official use; if any overlay is not aligned, adjust coordinates in `src/App.jsx`.
