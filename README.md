# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/bundled/promptdj-midi

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` from the example and add your Gemini API key:
   ```bash
   cp .env.example .env.local
   ```
   Then edit `.env.local` and set `GEMINI_API_KEY` (get one at https://aistudio.google.com/apikey).
3. Run the app:
   ```bash
   npm run dev
   ```
