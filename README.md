# Klangraum

Klangraum is an experimental system for exploring music as a continuous, interactive space rather than a collection of static tracks.

Instead of selecting songs, users navigate through a dynamic sound environment where music is generated in real time and adapts continuously to interaction and context.

The project explores how artificial intelligence can transform music from a fixed, work-based medium into a fluid and exploratory experience.

## Concept

Klangraum treats music as a navigable landscape.  
Users move through a radial genre map where musical states blend, transform, and evolve in real time.

AI agents generate new musical prompts, subgenres, and transitions, allowing users to discover sound worlds that do not exist as predefined tracks.

## Features

- 🎹 **MIDI Controller Support**: Control music generation in real-time using MIDI controllers
- 🎵 **Real-time AI Music Generation**: Continuous audio synthesis powered by Google Gemini AI and DeepMind Lyria
- 🎨 **Interactive Genre-Space Navigation**: Dynamic genre selection with weighted prompt system
- 🎧 **Audio Analysis**: Real-time audio visualization and analysis
- 💾 **Replay Buffer**: Record and replay generated audio segments
- 🎼 **Song Generation**: Generate complete songs from audio clips using KIE.ai
- 🎚️ **Audio Controls**: Playback, volume control, and audio cropping
- 🤖 **AI-Generated Subgenres**: Context-driven music exploration with AI-generated prompts

## Prerequisites

- **Node.js** (v18 or higher recommended)
- **npm** or **yarn**
- **Google Gemini API Key** ([Get one here](https://aistudio.google.com/apikey))
- **KIE.ai API Key** (optional, for song generation features)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/maxaxaxaxxaxaxaax/Klangraum.git
   cd Klangraum
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```

4. Edit `.env.local` and add your API keys:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   VITE_KIE_API_KEY=your_kie_api_key_here  # Optional
   ```

## Usage

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3000` (or the port shown in the terminal).

### Production Build

Build for production:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GEMINI_API_KEY` | Yes | Google Gemini API key for AI music generation |
| `VITE_KIE_API_KEY` | No | KIE.ai API key for song generation features |

### MIDI Setup

1. Connect your MIDI controller to your computer
2. The application will automatically detect available MIDI devices
3. Use MIDI controls to adjust genre weights and trigger music generation

## Project Structure

```
Klangraum/
├── src/              # React application source
├── components/       # Web Components (Lit)
├── utils/           # Utility functions and helpers
├── Songs/           # Generated audio files (gitignored)
├── public/          # Static assets
└── dist/            # Build output (gitignored)
```

## Tech Stack

- **React + TypeScript** - UI framework and type safety
- **Vite** - Build tool and dev server
- **SVG-based Radial Interface** - Interactive genre navigation
- **Lit** - Web Components
- **Tailwind CSS** - Styling
- **Google Gemini AI** - AI prompt generation agents
- **Google DeepMind Lyria** - Real-time music generation
- **KIE.ai** - Song generation API
- **Web Audio API** - Audio processing and analysis
- **Web MIDI API** - MIDI controller integration

## Development

### Code Style

This project uses:
- ESLint for code linting
- TypeScript for type checking
- Prettier (recommended) for code formatting

### Building

The project uses Vite for building. The build output will be in the `dist/` directory.

## Security

⚠️ **Important**: Never commit API keys or sensitive information to the repository. Always use `.env.local` for local development, which is automatically ignored by git.

## License

This project is licensed under the Apache-2.0 License.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on the [GitHub repository](https://github.com/maxaxaxaxxaxaxaax/Klangraum).
