/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

import './PlayPauseButton';
import type { PlaybackState, Prompt } from '../types';
import subGenresData from '../sub-genres.json';
import mainGenresData from '../main-genres.json';
import { geminiAgent } from '../index';

// Hierarchical genre circle system
interface GenreCircle {
  id: string;
  prompts: Map<string, Prompt>;
  ringOffsetX: number;
  ringOffsetY: number;
  disabledGenres: Set<string>;
  isExpanding: boolean;
  expansionProgress: number;
  radiusMultiplier: number; // Radius multiplier for this circle (0.1 to 0.6)
}

/** The grid of prompt inputs. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  static override styles = css`
    :host {
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      position: relative;
    }
    #background {
      will-change: background-image;
      position: absolute;
      height: 100%;
      width: 100%;
      z-index: -1;
      background: #296b63;
    }
    #radial-container {
      width: 80vmin;
      height: 80vmin;
      position: relative;
      margin-top: 8vmin;
      cursor: move;
      cursor: grab;
      &:active {
        cursor: grabbing;
      }
    }
    #center-circle {
      position: absolute;
      width: 2.5vmin;
      height: 2.5vmin;
      background: transparent;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10;
      cursor: pointer;
      transition: transform 0.2s;
      --cross-color: rgba(255, 255, 255, 0.9);
      &:hover {
        transform: translate(-50%, -50%) scale(1.1);
      }
      &:active {
        transform: translate(-50%, -50%) scale(0.95);
      }
      &::before,
      &::after {
        content: '';
        position: absolute;
        background: var(--cross-color);
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }
      &::before {
        width: 2.5vmin;
        height: 0.3vmin;
      }
      &::after {
        width: 0.3vmin;
        height: 2.5vmin;
      }
    }
    #center-genre-label {
      position: absolute;
      transform: translate(-50%, -50%);
      z-index: 9;
      font-size: 2.5vmin;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      text-align: center;
      white-space: nowrap;
      pointer-events: none;
      will-change: left, top, opacity;
    }
    #max-weight-line {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 5;
    }
    #max-weight-line svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    #max-weight-line line {
      stroke: #ffffff;
      stroke-width: 1;
      stroke-dasharray: 5, 5;
      transition: x1 0.2s, y1 0.2s, x2 0.2s, y2 0.2s;
    }
    .genre-item {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 0.3vmin 0.5vmin;
      border-radius: 2vmin;
      font-size: 1.2vmin;
      font-weight: 500;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      user-select: none;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.2s, color 0.3s;
      border: none;
      background: transparent;
      transform-origin: center center;
    }
    .genre-item.filtered {
      opacity: 0.5;
    }
    .genre-item.disabled {
      opacity: 0.2;
      text-decoration: line-through;
    }
    #back-button {
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      border: 2px solid #fff;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      z-index: 100;
      display: none;
      &.visible {
        display: block;
      }
      &:hover {
        background: rgba(0, 0, 0, 0.9);
      }
    }
    #circle-navigation {
      position: absolute;
      top: calc(15vmin + 20px);
      right: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 100;
    }
    .circle-nav-button {
      padding: 6px 12px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.2s;
      &:hover {
        background: rgba(0, 0, 0, 0.9);
        border-color: rgba(255, 255, 255, 0.6);
      }
      &.active {
        background: rgba(255, 255, 255, 0.2);
        border-color: #fff;
      }
    }
    .genre-item.inactive {
      filter: grayscale(100%) brightness(0.6);
      pointer-events: none;
      cursor: default;
    }
    #media-controls {
      position: absolute;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 20px;
      z-index: 100;
      padding: 16px 24px;
      background: rgba(0, 0, 0, 0.6);
      border-radius: 50px;
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    play-pause-button {
      position: relative;
      width: 56px;
      height: 56px;
      flex-shrink: 0;
    }
    #dice-button {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;
      padding: 0;
      margin: 0;
    }
    #dice-button:hover {
      transform: scale(1.05);
      border-color: rgba(255, 255, 255, 0.8);
    }
    #dice-button:active {
      transform: scale(0.95);
    }
    #dice-button svg {
      width: 28px;
      height: 28px;
      color: #ffffff;
    }
    .nav-arrow-button {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;
      padding: 0;
      margin: 0;
    }
    .nav-arrow-button:hover:not(:disabled) {
      transform: scale(1.05);
      border-color: rgba(255, 255, 255, 0.8);
    }
    .nav-arrow-button:active:not(:disabled) {
      transform: scale(0.95);
    }
    .nav-arrow-button:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
    .nav-arrow-button svg {
      width: 20px;
      height: 20px;
      color: #ffffff;
    }
    #volume-control {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-left: 20px;
    }
    #volume-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      flex-shrink: 0;
      cursor: pointer;
      transition: all 0.2s ease;
      padding: 0;
      margin: 0;
    }
    #volume-icon:hover {
      transform: scale(1.05);
      border-color: rgba(255, 255, 255, 0.8);
    }
    #volume-icon:active {
      transform: scale(0.95);
    }
    #volume-icon svg {
      width: 20px;
      height: 20px;
    }
    #volume-icon svg {
      width: 100%;
      height: 100%;
    }
    #volume-slider-horizontal {
      width: 120px;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
      opacity: 0;
      max-width: 0;
      overflow: hidden;
      transition: opacity 0.3s ease, max-width 0.3s ease;
      pointer-events: none;
    }
    #volume-control.visible #volume-slider-horizontal {
      opacity: 1;
      max-width: 120px;
      pointer-events: all;
    }
    #volume-slider-horizontal::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
      margin-top: -4px;
    }
    #volume-slider-horizontal::-webkit-slider-runnable-track {
      height: 4px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
    }
    #volume-slider-horizontal::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
      border: none;
    }
    #volume-slider-horizontal::-moz-range-track {
      height: 4px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
    }
    #volume-slider-horizontal::-moz-range-progress {
      height: 4px;
      background: #fff;
      border-radius: 2px;
    }
    #debug-panel {
      position: absolute;
      top: 50px;
      right: 10px;
      background: rgba(0, 0, 0, 0.9);
      border: 2px solid #fff;
      border-radius: 8px;
      padding: 15px;
      color: #fff;
      font-family: 'Satoshi', sans-serif;
      font-size: 12px;
      max-width: 400px;
      max-height: 80vh;
      overflow-y: auto;
      z-index: 1000;
      display: none;
      backdrop-filter: blur(10px);
      &.visible {
        display: block;
      }
    }
    #debug-panel h3 {
      margin: 0 0 10px 0;
      font-size: 14px;
      border-bottom: 1px solid #fff;
      padding-bottom: 5px;
    }
    .debug-item {
      margin: 8px 0;
      padding: 5px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      border-left: 3px solid;
    }
    .debug-label {
      font-weight: bold;
      margin-right: 8px;
    }
    .debug-value {
      color: #aaa;
    }
    .debug-weight-bar {
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
      margin-top: 4px;
      overflow: hidden;
    }
    .debug-weight-fill {
      height: 100%;
      transition: width 0.2s;
    }
    #radius-container {
      position: absolute;
      bottom: 20px;
      left: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      z-index: 100;
    }
    #radius-slider {
      width: 6px;
      height: 150px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      outline: none;
      cursor: pointer;
      writing-mode: bt-lr; /* IE */
      -webkit-appearance: slider-vertical; /* WebKit */
    }
    #radius-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #ffffff;
      cursor: pointer;
      margin-left: -5px;
    }
    #radius-slider::-webkit-slider-runnable-track {
      background: rgba(255, 255, 255, 0.2);
    }
    #radius-slider::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #ffffff;
      cursor: pointer;
      border: none;
    }
    #radius-slider::-moz-range-track {
      background: rgba(255, 255, 255, 0.2);
    }
    #radius-slider::-moz-range-progress {
      background: #ffffff;
    }
    #radius-label {
      min-width: 35px;
      text-align: center;
      color: #ffffff;
      font-size: 12px;
      font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-weight: 500;
      user-select: none;
    }
    input[type="range"][orient="vertical"] {
      writing-mode: bt-lr;
      -webkit-appearance: slider-vertical;
    }
    #chat-container {
      margin-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.3);
      padding-top: 15px;
    }
    #chat-messages {
      max-height: 300px;
      overflow-y: auto;
      margin-bottom: 10px;
      padding: 10px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 4px;
    }
    .chat-message {
      margin-bottom: 10px;
      padding: 8px;
      border-radius: 4px;
      word-wrap: break-word;
    }
    .chat-message.user {
      background: rgba(253, 123, 46, 0.2);
      border-left: 3px solid #FD7B2E;
    }
    .chat-message.assistant {
      background: rgba(255, 255, 255, 0.1);
      border-left: 3px solid #fff;
    }
    .chat-message-role {
      font-weight: bold;
      font-size: 10px;
      margin-bottom: 4px;
      opacity: 0.7;
    }
    .chat-message-content {
      font-size: 11px;
      line-height: 1.4;
    }
    #chat-input-container {
      display: flex;
      gap: 8px;
    }
    #chat-input {
      flex: 1;
      padding: 8px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      color: #fff;
      font-size: 12px;
      font-family: 'Satoshi', sans-serif;
      outline: none;
      &:focus {
        border-color: #FD7B2E;
      }
      &::placeholder {
        color: rgba(255, 255, 255, 0.5);
      }
    }
    #chat-send-button {
      padding: 8px 16px;
      background: #FD7B2E;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      transition: background 0.2s;
      &:hover:not(:disabled) {
        background: #e66a1f;
      }
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
    #chat-clear-button {
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: background 0.2s;
      &:hover {
        background: rgba(255, 255, 255, 0.2);
      }
    }
    #system-instruction-input {
      width: 100%;
      padding: 8px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      color: #fff;
      font-size: 11px;
      font-family: 'Satoshi', sans-serif;
      resize: vertical;
      outline: none;
      &:focus {
        border-color: #FD7B2E;
      }
      &::placeholder {
        color: rgba(255, 255, 255, 0.5);
      }
    }
    #system-instruction-save-button:hover {
      background: #e66a1f;
    }
    #system-instruction-reset-button:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    #new-circle-message-input {
      width: 100%;
      padding: 8px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      color: #fff;
      font-size: 11px;
      font-family: 'Satoshi', sans-serif;
      resize: vertical;
      outline: none;
      &:focus {
        border-color: #FD7B2E;
      }
      &::placeholder {
        color: rgba(255, 255, 255, 0.5);
      }
    }
    #new-circle-message-reset-button:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    .genre-circle-outline {
      position: absolute;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      pointer-events: none;
      transform: translate(-50%, -50%);
    }
  `;

  private prompts: Map<string, Prompt>;
  private originalPrompts: Map<string, Prompt> = new Map();

  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() public audioLevel = 0;

  @property({ type: Object })
  private filteredPrompts = new Set<string>();

  @state() private disabledGenres = new Set<string>();
  @state() private showingSubGenres = false;
  @state() private selectedMainGenreId: string | null = null;
  @state() private subGenrePrompts: Map<string, Prompt> = new Map();
  // Map to store names of generated genres (promptId -> name)
  private generatedGenreNames = new Map<string, string>();

  @state() private genreCircleStack: GenreCircle[] = [];
  @state() private activeCircleIndex = -1;

  @state() private ringOffsetX = 0;
  @state() private ringOffsetY = 0;
  @state() private isDragging = false;
  @state() private dragStartX = 0;
  @state() private dragStartY = 0;
  /** Ring offsets of all circles at drag start, so we can move all circles together by the same delta */
  private dragStartRingOffsets: { x: number; y: number }[] = [];
  @state() private containerSize = 0;
  @state() private showDebugPanel = false;
  @state() private volume = 1.0;
  @state() private showVolumeControl = false;
  @state() private chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  @state() private chatInput = '';
  @state() private chatLoading = false;
  @state() private systemInstruction = 'You are a helpful AI assistant for music production and DJing.';
  @state() private newCircleMessageTemplate = `Take the currently active {genres}, combine them meaningfully, and generate 5 new named prompts that can be used for further mixing.
Always respond only in the following JSON format (exactly 5 objects):

[
  {
    "id": "",
    "name": "",
    "prompt": ""
  },
  {
    "id": "",
    "name": "",
    "prompt": ""
  },
  {
    "id": "",
    "name": "",
    "prompt": ""
  },
  {
    "id": "",
    "name": "",
    "prompt": ""
  },
  {
    "id": "",
    "name": "",
    "prompt": ""
  }
]`;

  constructor(
    initialPrompts: Map<string, Prompt>,
  ) {
    super();
    this.prompts = initialPrompts;
    // Initialize system instruction from agent
    this.systemInstruction = geminiAgent.getSystemInstruction();
    this.originalPrompts = new Map(initialPrompts);
    
    // Initialize with the first genre circle
    this.genreCircleStack = [{
      id: 'circle-0',
      prompts: new Map(initialPrompts),
      ringOffsetX: 0,
      ringOffsetY: 0,
      disabledGenres: new Set(),
      isExpanding: false,
      expansionProgress: 1.0,
      radiusMultiplier: 0.35,
    }];
    this.activeCircleIndex = 0;
  }

  override firstUpdated() {
    this.initializeContainer();
    // Add resize observer to handle window resizing
    if (typeof ResizeObserver !== 'undefined') {
      const container = this.shadowRoot?.getElementById('radial-container');
      if (container) {
        const observer = new ResizeObserver(() => {
          this.initializeContainer();
        });
        observer.observe(container);
      }
    }
    // Listen for keyboard events
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'p' || e.key === 'P') {
      this.showDebugPanel = !this.showDebugPanel;
      this.requestUpdate();
    }
  }

  override updated() {
    if (this.containerSize === 0) {
      this.initializeContainer();
    }
  }

  private initializeContainer() {
    const container = this.shadowRoot?.getElementById('radial-container');
    if (container) {
      const newSize = container.offsetWidth;
      if (newSize > 0) {
        this.containerSize = newSize;
        this.syncActiveCircleState();
        this.updateWeightsFromPosition();
      }
    }
  }

  private syncActiveCircleState() {
    const activeCircle = this.getActiveCircle();
    if (activeCircle) {
      this.ringOffsetX = activeCircle.ringOffsetX;
      this.ringOffsetY = activeCircle.ringOffsetY;
      this.prompts = activeCircle.prompts;
      this.disabledGenres = activeCircle.disabledGenres;
      // Derive subgenre view from active circle's prompts
      const first = activeCircle.prompts.values().next().value;
      if (first?.promptId.startsWith('sub-')) {
        const match = first.promptId.match(/^sub-(.+?)-\d+$/);
        this.selectedMainGenreId = match ? match[1] : null;
        this.showingSubGenres = !!this.selectedMainGenreId;
      } else {
        this.showingSubGenres = false;
        this.selectedMainGenreId = null;
      }
    }
  }

  /** Speichert die aktuelle Position des aktiven Kreises im Stack (damit sie beim Zurückspringen wieder erscheint). */
  private persistActiveCirclePosition() {
    if (this.activeCircleIndex < 0 || this.activeCircleIndex >= this.genreCircleStack.length) return;
    this.genreCircleStack = this.genreCircleStack.map((circle, i) =>
      i === this.activeCircleIndex
        ? { ...circle, ringOffsetX: this.ringOffsetX, ringOffsetY: this.ringOffsetY }
        : circle
    );
  }

  private getActiveCircle(): GenreCircle | null {
    if (this.activeCircleIndex >= 0 && this.activeCircleIndex < this.genreCircleStack.length) {
      return this.genreCircleStack[this.activeCircleIndex];
    }
    return null;
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const { promptId, text, weight, cc } = e.detail;
    const prompt = this.prompts.get(promptId);

    if (!prompt) {
      console.error('prompt not found', promptId);
      return;
    }

    prompt.text = text;
    prompt.weight = weight;
    prompt.cc = cc;

    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, prompt);

    this.prompts = newPrompts;
    this.requestUpdate();

    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.prompts }),
    );
  }

  private getGenrePosition(index: number, total: number, radius: number, circle?: GenreCircle) {
    // Calculate equal spacing: divide full circle (2π) by total number of items
    // Start at top (-π/2) and distribute evenly
    const angleStep = (Math.PI * 2) / total;
    const angle = (index * angleStep) - (Math.PI / 2);

    // Fixed center point (always at container center)
    const fixedCenterX = this.containerSize / 2;
    const fixedCenterY = this.containerSize / 2;

    // Genre ring center is offset from fixed center by the circle's offset
    const targetCircle = circle ?? this.getActiveCircle();
    const ringOffsetX = targetCircle ? targetCircle.ringOffsetX : this.ringOffsetX;
    const ringOffsetY = targetCircle ? targetCircle.ringOffsetY : this.ringOffsetY;

    const ringCenterX = fixedCenterX + ringOffsetX;
    const ringCenterY = fixedCenterY + ringOffsetY;
    const x = ringCenterX + Math.cos(angle) * radius;
    const y = ringCenterY + Math.sin(angle) * radius;
    return { x, y, angle };
  }

  private calculateDistance(x1: number, y1: number, x2: number, y2: number) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  private updateWeightsFromPosition() {
    const promptArray = [...this.prompts.values()];
    const radiusMultiplier = this.getActiveRadiusMultiplier();
    const radius = this.containerSize * radiusMultiplier;
    const epsilon = 0.5; // Smaller epsilon for sharper transition when directly overlapping
    const exponent = 3; // Higher exponent: sharper falloff, fully on one genre → only it in mix

    const newPrompts = new Map(this.prompts);
    const rawWeights: { promptId: string; raw: number }[] = [];

    // Fixed center point (always at container center)
    const fixedCenterX = this.containerSize / 2;
    const fixedCenterY = this.containerSize / 2;

    promptArray.forEach((prompt, index) => {
      if (this.disabledGenres.has(prompt.promptId)) {
        prompt.weight = 0;
        newPrompts.set(prompt.promptId, prompt);
        return;
      }

      const genrePos = this.getGenrePosition(index, promptArray.length, radius);
      const distance = this.calculateDistance(
        fixedCenterX,
        fixedCenterY,
        genrePos.x,
        genrePos.y,
      );

      // Inverse distance^exponent: closer genre to fixed center → stronger influence
      // When directly overlapping (distance ≈ 0), only that genre is active
      const raw = 1 / (distance + epsilon) ** exponent;
      rawWeights.push({ promptId: prompt.promptId, raw });
    });

    const totalRaw = rawWeights.reduce((s, { raw }) => s + raw, 0);

    rawWeights.forEach(({ promptId, raw }) => {
      const p = newPrompts.get(promptId);
      if (!p) return;
      p.weight = totalRaw > 0 ? (raw / totalRaw) * 2 : 0;
      newPrompts.set(promptId, p);
    });

    this.prompts = newPrompts;
    this.requestUpdate();

    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.prompts }),
    );
  }

  private longPressTimer: number | null = null;
  private longPressDelay = 500; // 500ms for long press

  private handleGenrePointerDown(promptId: string, e: MouseEvent | TouchEvent) {
    e.stopPropagation();
    
    // Start long press timer
    this.longPressTimer = window.setTimeout(() => {
      this.handleGenreLongPress(promptId);
      this.longPressTimer = null;
    }, this.longPressDelay);
  }

  private handleGenrePointerUp(e: MouseEvent | TouchEvent) {
    e.stopPropagation();
    
    // Cancel long press if pointer is released before delay
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private handleGenreMouseDown(promptId: string, e: MouseEvent) {
    this.handleGenrePointerDown(promptId, e);
  }

  private handleGenreMouseUp(e: MouseEvent) {
    this.handleGenrePointerUp(e);
  }

  private handleGenreTouchStart(promptId: string, e: TouchEvent) {
    this.handleGenrePointerDown(promptId, e);
  }

  private handleGenreTouchEnd(e: TouchEvent) {
    this.handleGenrePointerUp(e);
  }

  private handleGenreClick(promptId: string, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    
    // Only handle click if not showing sub-genres (sub-genres can't be disabled)
    if (this.showingSubGenres) {
      return;
    }
    
    // Toggle disabled state for main genres only
    const newDisabledGenres = new Set(this.disabledGenres);
    if (newDisabledGenres.has(promptId)) {
      newDisabledGenres.delete(promptId);
    } else {
      newDisabledGenres.add(promptId);
    }
    this.disabledGenres = newDisabledGenres;
    
    // Update active circle's disabled genres
    const activeCircle = this.getActiveCircle();
    if (activeCircle) {
      const updatedStack = [...this.genreCircleStack];
      updatedStack[this.activeCircleIndex] = {
        ...activeCircle,
        disabledGenres: newDisabledGenres,
      };
      this.genreCircleStack = updatedStack;
    }
    
    // Update weights immediately
    this.updateWeightsFromPosition();
  }

  private handleGenreLongPress(promptId: string) {
    // Find the main genre by promptId
    const prompt = this.prompts.get(promptId);
    if (!prompt) return;
    
    // Find main genre ID from main genres data by matching the prompt text
    const mainGenre = (mainGenresData as any[]).find(g => g.prompt === prompt.text);
    if (!mainGenre) return;
    
    // Load sub-genres for this main genre
    const subGenres = (subGenresData as any)[mainGenre.id];
    if (!subGenres || subGenres.length === 0) return;
    
    // Create prompts for sub-genres using the prompt text from JSON, not the name
    const newSubPrompts = new Map<string, Prompt>();
    subGenres.forEach((subGenre: any, index: number) => {
      const subPromptId = `sub-${mainGenre.id}-${index}`;
      newSubPrompts.set(subPromptId, {
        promptId: subPromptId,
        text: subGenre.prompt, // Use the prompt text, not the name
        weight: 0,
        cc: index,
        color: this.hslToHex(mainGenre.colorHue, 100, 50),
      });
    });
    
    this.subGenrePrompts = newSubPrompts;
    this.selectedMainGenreId = mainGenre.id;
    this.showingSubGenres = true;
    
    this.prompts = newSubPrompts;
    const activeCircle = this.getActiveCircle();
    if (!activeCircle) {
      this.requestUpdate();
      this.updateWeightsFromPosition();
      return;
    }
    // Stack aktualisieren, damit renderGenres() die Sub-Genres mit Namen anzeigt
    const radiusMultiplier = this.getActiveRadiusMultiplier();
    const radius = this.containerSize > 0 ? this.containerSize * radiusMultiplier : 200;
    // Ring so positionieren, dass das Main-Genre mit dem höchsten Mix-% (das geöffnete) im Sub-Ring in der Mitte liegt
    const mainGenres = mainGenresData as any[];
    const mainIndex = mainGenres.findIndex((g: any) => g.id === mainGenre.id);
    const nMain = mainGenres.length;
    const alpha = mainIndex >= 0 && nMain > 0
      ? (mainIndex * (Math.PI * 2) / nMain) - (Math.PI / 2)
      : -Math.PI / 2;
    const offX = -radius * Math.cos(alpha);
    const offY = -radius * Math.sin(alpha);
    this.ringOffsetX = offX;
    this.ringOffsetY = offY;
    const updatedStack = [...this.genreCircleStack];
    updatedStack[this.activeCircleIndex] = {
      ...activeCircle,
      prompts: new Map(newSubPrompts),
      ringOffsetX: offX,
      ringOffsetY: offY,
    };
    this.genreCircleStack = updatedStack;
    this.requestUpdate();
    this.updateWeightsFromPosition();
  }

  private handleBackToMainGenres() {
    this.showingSubGenres = false;
    this.selectedMainGenreId = null;
    const orig = new Map(this.originalPrompts);
    this.prompts = orig;
    const activeCircle = this.getActiveCircle();
    if (activeCircle) {
      const updatedStack = [...this.genreCircleStack];
      updatedStack[this.activeCircleIndex] = { ...activeCircle, prompts: orig };
      this.genreCircleStack = updatedStack;
    }
    this.requestUpdate();
    this.updateWeightsFromPosition();
  }

  private hslToHex(h: number, s: number, l: number): string {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  /** Gewichtete Mischfarbe aus allen Prompts – für die Center-Outline. */
  private getMixColor(): string {
    let totalWeight = 0;
    let r = 0, g = 0, b = 0;
    for (const p of this.prompts.values()) {
      if (p.weight <= 0) continue;
      const hex = p.color.replace(/^#/, '');
      if (hex.length !== 6) continue;
      const pr = parseInt(hex.slice(0, 2), 16);
      const pg = parseInt(hex.slice(2, 4), 16);
      const pb = parseInt(hex.slice(4, 6), 16);
      r += pr * p.weight;
      g += pg * p.weight;
      b += pb * p.weight;
      totalWeight += p.weight;
    }
    if (totalWeight <= 0) return 'rgba(255, 255, 255, 0.6)';
    r = Math.round(r / totalWeight);
    g = Math.round(g / totalWeight);
    b = Math.round(b / totalWeight);
    return `rgb(${r}, ${g}, ${b})`;
  }

  private handleCenterCircleClick(e: MouseEvent | TouchEvent) {
    e.stopPropagation();
    e.preventDefault();
    this.createNewGenreCircle();
  }

  private async createNewGenreCircle() {
    const activeCircle = this.getActiveCircle();
    if (!activeCircle || activeCircle.isExpanding) return;
    
    // Save current playback state and set to loading for animation
    const previousPlaybackState = this.playbackState;
    this.playbackState = 'loading';
    this.requestUpdate();
    
    // New circle shows genres that are currently active in the mix (weight > 0.1)
    const activePrompts = new Map<string, Prompt>();
    const activeGenreNames: string[] = [];
    let index = 0;
    
    // Get all prompts from the active circle that have weight > 0.1
    for (const prompt of activeCircle.prompts.values()) {
      if (prompt.weight > 0.1) {
        // Create a copy of the prompt with weight reset to 0 for the new circle
        activePrompts.set(prompt.promptId, {
          ...prompt,
          weight: 0,
          cc: index++,
        });
        
        // Get genre name for chat message
        let genreName = prompt.text;
        if (this.showingSubGenres && this.selectedMainGenreId) {
          const subGenres = (subGenresData as any)[this.selectedMainGenreId] as { name: string; prompt: string }[] | undefined;
          if (subGenres) {
            const match = prompt.promptId.match(/^sub-.+-(\d+)$/);
            const idx = match ? parseInt(match[1], 10) : -1;
            if (idx >= 0 && idx < subGenres.length) {
              genreName = subGenres[idx].name;
            } else {
              const byPrompt = subGenres.find((sg) => sg.prompt === prompt.text);
              if (byPrompt) genreName = byPrompt.name;
            }
          }
        } else {
          const mainGenre = (mainGenresData as any[]).find(g => g.prompt === prompt.text);
          if (mainGenre) genreName = mainGenre.name;
        }
        activeGenreNames.push(genreName);
      }
    }
    
    // Try to generate new prompts from active genres
    let initialPrompts: Map<string, Prompt> = new Map();
    let generationSuccess = false;
    
    if (activeGenreNames.length > 0) {
      try {
        // Replace {genres} placeholder with actual genre names
        const genreMessage = this.newCircleMessageTemplate.replace('{genres}', activeGenreNames.join(', '));
        console.log('Sending genres to chat for generation:', activeGenreNames);
        
        // Send message to agent and wait for response
        const response = await geminiAgent.sendMessage(genreMessage);
        console.log('Received response from agent:', response);
        
        // Parse JSON response
        const generatedGenres = this.parseJsonResponse(response);
        
        if (generatedGenres && generatedGenres.length > 0) {
          // Use generated prompts
          initialPrompts = this.generatePromptsFromJson(generatedGenres);
          generationSuccess = true;
          console.log('Successfully generated', initialPrompts.size, 'new prompts');
          
          // Also add to chat messages for display
          this.chatMessages = [...this.chatMessages, { role: 'user', content: genreMessage }];
          this.chatMessages = [...this.chatMessages, { role: 'assistant', content: response }];
        } else {
          console.warn('Failed to parse generated genres, falling back to active prompts');
        }
      } catch (error) {
        console.error('Error generating new prompts:', error);
        // Fall through to fallback logic
      }
    }
    
    // Restore previous playback state
    this.playbackState = previousPlaybackState;
    this.requestUpdate();
    
    // Fallback: use active prompts if generation failed or no active genres
    if (!generationSuccess) {
      if (activePrompts.size > 0) {
        initialPrompts = activePrompts;
      } else {
        initialPrompts = new Map(this.originalPrompts);
      }
      
      // Add fallback message to chat (without sending API call)
      if (activeGenreNames.length > 0) {
        const genreMessage = `Ein neuer Genre-Kreis wurde erstellt mit folgenden aktiven Genres: ${activeGenreNames.join(', ')}.`;
        this.chatMessages = [...this.chatMessages, { role: 'user', content: genreMessage }];
        this.chatMessages = [...this.chatMessages, { role: 'assistant', content: 'Der Kreis wurde mit den aktiven Genres erstellt.' }];
      } else {
        const genreMessage = `Ein neuer Genre-Kreis wurde erstellt, aber es sind keine aktiven Genres im Mix (alle Genres haben Gewicht ≤ 0.1).`;
        this.chatMessages = [...this.chatMessages, { role: 'user', content: genreMessage }];
        this.chatMessages = [...this.chatMessages, { role: 'assistant', content: 'Der Kreis wurde mit den Standard-Genres erstellt.' }];
      }
      this.requestUpdate();
    }
    
    const newCircleId = `circle-${this.genreCircleStack.length}`;
    const newCircle: GenreCircle = {
      id: newCircleId,
      prompts: initialPrompts,
      ringOffsetX: 0,
      ringOffsetY: 0,
      disabledGenres: new Set(),
      isExpanding: true,
      expansionProgress: 0,
      radiusMultiplier: 0.35, // Default radius multiplier for new circles
    };
    
    this.genreCircleStack = [...this.genreCircleStack, newCircle];
    this.activeCircleIndex = this.genreCircleStack.length - 1;
    
    // Animate expansion
    const duration = 500; // 500ms animation
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth expansion
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      
      // Update the expanding circle
      const updatedStack = [...this.genreCircleStack];
      if (updatedStack[this.activeCircleIndex]) {
        updatedStack[this.activeCircleIndex] = {
          ...updatedStack[this.activeCircleIndex],
          expansionProgress: easeOutCubic,
          isExpanding: progress < 1,
        };
        this.genreCircleStack = updatedStack;
      }
      
      this.syncActiveCircleState();
      this.requestUpdate();
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Expansion complete
        const finalStack = [...this.genreCircleStack];
        if (finalStack[this.activeCircleIndex]) {
          finalStack[this.activeCircleIndex] = {
            ...finalStack[this.activeCircleIndex],
            isExpanding: false,
            expansionProgress: 1.0,
          };
          this.genreCircleStack = finalStack;
        }
        this.updateWeightsFromPosition();
      }
    };
    
    requestAnimationFrame(animate);
  }

  private navigateBack() {
    if (this.activeCircleIndex > 0) {
      this.persistActiveCirclePosition();
      this.activeCircleIndex--;
      this.syncActiveCircleState();
      this.updateWeightsFromPosition();
      this.requestUpdate();
    }
  }

  private navigateNext() {
    if (this.activeCircleIndex < this.genreCircleStack.length - 1) {
      this.persistActiveCirclePosition();
      this.activeCircleIndex++;
      this.syncActiveCircleState();
      this.updateWeightsFromPosition();
      this.requestUpdate();
    }
  }

  private navigateToCircle(index: number) {
    if (index >= 0 && index < this.genreCircleStack.length) {
      this.persistActiveCirclePosition();
      this.activeCircleIndex = index;
      this.syncActiveCircleState();
      this.updateWeightsFromPosition();
      this.requestUpdate();
    }
  }

  private handlePointerDown(e: PointerEvent | MouseEvent | TouchEvent) {
    const target = e.target as HTMLElement;
    const container = this.shadowRoot?.getElementById('radial-container');
    const centerCircle = this.shadowRoot?.getElementById('center-circle');
    
    // Don't start dragging if clicking on center circle or genre items
    if (target === centerCircle || (centerCircle && centerCircle.contains(target))) {
      return;
    }
    
    // Check if clicking on a genre item - only allow interaction with active circle items
    const genreItem = target.classList.contains('genre-item') ? target : target.closest('.genre-item');
    if (genreItem) {
      // Only allow interaction if it's not inactive
      if (!genreItem.classList.contains('inactive')) {
        return;
      }
    }
    
    // Start dragging: all circles will move together (pan the map)
    if (container) {
      this.isDragging = true;
      this.dragStartRingOffsets = this.genreCircleStack.map((c) => ({
        x: c.ringOffsetX,
        y: c.ringOffsetY,
      }));
      const rect = container.getBoundingClientRect();
      const clientX = 'clientX' in e ? e.clientX : (e as TouchEvent).touches[0].clientX;
      const clientY = 'clientY' in e ? e.clientY : (e as TouchEvent).touches[0].clientY;
      const containerCenterX = this.containerSize / 2;
      const containerCenterY = this.containerSize / 2;
      this.dragStartX = clientX - rect.left - containerCenterX - this.ringOffsetX;
      this.dragStartY = clientY - rect.top - containerCenterY - this.ringOffsetY;
      e.preventDefault();
    }
  }

  private handlePointerMove(e: PointerEvent | MouseEvent | TouchEvent) {
    if (!this.isDragging) return;
    
    const container = this.shadowRoot?.getElementById('radial-container');
    if (!container || this.containerSize === 0) return;
    
    const rect = container.getBoundingClientRect();
    const clientX = 'clientX' in e ? e.clientX : (e as TouchEvent).touches?.[0]?.clientX ?? 0;
    const clientY = 'clientY' in e ? e.clientY : (e as TouchEvent).touches?.[0]?.clientY ?? 0;
    
    if (clientX === 0 && clientY === 0) return; // Invalid touch event
    
    const containerCenterX = this.containerSize / 2;
    const containerCenterY = this.containerSize / 2;
    
    // New offset from cursor (for the active circle)
    const newOffsetX = clientX - rect.left - containerCenterX - this.dragStartX;
    const newOffsetY = clientY - rect.top - containerCenterY - this.dragStartY;
    const maxOffset = this.containerSize * 0.4;
    const nextOffsetX = Math.max(-maxOffset, Math.min(maxOffset, newOffsetX));
    const nextOffsetY = Math.max(-maxOffset, Math.min(maxOffset, newOffsetY));
    this.ringOffsetX = nextOffsetX;
    this.ringOffsetY = nextOffsetY;
    
    // Move all circles by the same delta so the whole map pans together (no "wall" pushing inactives to one spot)
    // Only the active circle is clamped to maxOffset; others follow the delta without clamping so they don't pile up
    const startOffsets = this.dragStartRingOffsets;
    if (startOffsets.length > 0 && this.activeCircleIndex >= 0 && this.activeCircleIndex < startOffsets.length) {
      const deltaX = nextOffsetX - startOffsets[this.activeCircleIndex].x;
      const deltaY = nextOffsetY - startOffsets[this.activeCircleIndex].y;
      const updatedStack = this.genreCircleStack.map((circle, i) => {
        const x = startOffsets[i].x + deltaX;
        const y = startOffsets[i].y + deltaY;
        return {
          ...circle,
          ringOffsetX: i === this.activeCircleIndex ? nextOffsetX : x,
          ringOffsetY: i === this.activeCircleIndex ? nextOffsetY : y,
        };
      });
      this.genreCircleStack = updatedStack;
    }
    
    this.updateWeightsFromPosition();
    this.requestUpdate(); // Force update to move the center label with the circle
    e.preventDefault();
  }

  private handlePointerUp() {
    this.isDragging = false;
  }

  private handleMouseDown(e: MouseEvent) {
    this.handlePointerDown(e);
  }

  private handleMouseMove(e: MouseEvent) {
    this.handlePointerMove(e);
  }

  private handleMouseUp() {
    this.handlePointerUp();
  }

  private handleTouchStart(e: TouchEvent) {
    this.handlePointerDown(e);
  }

  private handleTouchMove(e: TouchEvent) {
    this.handlePointerMove(e);
  }

  private handleTouchEnd() {
    this.handlePointerUp();
  }

  private playPause() {
    this.dispatchEvent(new CustomEvent('play-pause'));
  }

  private handleVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const newVolume = parseFloat(target.value) / 100;
    this.volume = newVolume;
    this.dispatchEvent(new CustomEvent('volume-changed', { detail: newVolume }));
  }

  private toggleVolumeControl() {
    this.showVolumeControl = !this.showVolumeControl;
  }

  private handleDiceClick() {
    // Randomize the ring position to create a random mix
    const activeCircle = this.getActiveCircle();
    if (!activeCircle) return;
    
    // Generate random offset within bounds
    const maxOffset = this.containerSize * 0.4;
    const randomX = (Math.random() - 0.5) * 2 * maxOffset;
    const randomY = (Math.random() - 0.5) * 2 * maxOffset;
    
    // Update active circle position
    this.ringOffsetX = randomX;
    this.ringOffsetY = randomY;
    
    // Update the circle in the stack
    const updatedStack = [...this.genreCircleStack];
    updatedStack[this.activeCircleIndex] = {
      ...activeCircle,
      ringOffsetX: randomX,
      ringOffsetY: randomY,
    };
    this.genreCircleStack = updatedStack;
    
    // Update weights based on new position
    this.updateWeightsFromPosition();
    this.requestUpdate();
  }

  private handleRadiusChange(e: Event) {
    const target = e.target as HTMLInputElement;
    // Slider range: 0-100 maps to radius multiplier 0.1-0.6
    const sliderValue = parseFloat(target.value);
    const newRadiusMultiplier = 0.1 + (sliderValue / 100) * 0.5;
    
    // Update only the active circle's radius multiplier
    const activeCircle = this.getActiveCircle();
    if (activeCircle && this.activeCircleIndex >= 0) {
      const updatedStack = [...this.genreCircleStack];
      updatedStack[this.activeCircleIndex] = {
        ...activeCircle,
        radiusMultiplier: newRadiusMultiplier,
      };
      this.genreCircleStack = updatedStack;
    }
    
    this.updateWeightsFromPosition();
    this.requestUpdate();
  }

  private getActiveRadiusMultiplier(): number {
    const activeCircle = this.getActiveCircle();
    return activeCircle?.radiusMultiplier ?? 0.35;
  }

  public addFilteredPrompt(prompt: string) {
    this.filteredPrompts = new Set([...this.filteredPrompts, prompt]);
  }

  private getMaxWeightGenrePosition(): { x1: number; y1: number; x2: number; y2: number } | null {
    const promptArray = [...this.prompts.values()];
    if (promptArray.length === 0) return null;

    // Find genre with highest weight
    let maxWeight = -1;
    let maxWeightPrompt: Prompt | null = null;
    let maxWeightIndex = -1;

    promptArray.forEach((prompt, index) => {
      if (prompt.weight > maxWeight) {
        maxWeight = prompt.weight;
        maxWeightPrompt = prompt;
        maxWeightIndex = index;
      }
    });

    if (!maxWeightPrompt || maxWeight <= 0.1) return null;

    // Get position of the genre with max weight
    const radiusMultiplier = this.getActiveRadiusMultiplier();
    const radius = this.containerSize * radiusMultiplier;
    const activeCircle = this.getActiveCircle();
    if (!activeCircle) return null;

    const fixedCenterX = this.containerSize / 2;
    const fixedCenterY = this.containerSize / 2;
    
    const pos = this.getGenrePosition(maxWeightIndex, promptArray.length, radius, activeCircle);
    
    // Calculate angle from center to genre
    const dx = pos.x - fixedCenterX;
    const dy = pos.y - fixedCenterY;
    const angle = Math.atan2(dy, dx);
    
    // Calculate radius of center cross (2.5vmin / 2, converted to pixels)
    // Since containerSize is in pixels and represents 80vmin, we need to convert
    // 2.5vmin = (2.5 / 80) * containerSize
    const centerCircleRadius = (2.5 / 80) * this.containerSize;
    
    // Calculate start point on the edge of center cross
    const x1 = fixedCenterX + Math.cos(angle) * centerCircleRadius;
    const y1 = fixedCenterY + Math.sin(angle) * centerCircleRadius;
    
    return { x1, y1, x2: pos.x, y2: pos.y };
  }

  override render() {
    const bg = styleMap({
      backgroundImage: 'none',
    });
    
    // Get main genre name and calculate position if showing subgenres
    let mainGenreName = '';
    let centerLabelStyle = styleMap({ 
      opacity: '0',
      left: '50%',
      top: '50%',
    });
    
    if (this.showingSubGenres && this.selectedMainGenreId) {
      const mainGenre = (mainGenresData as any[]).find((g: any) => g.id === this.selectedMainGenreId);
      if (mainGenre) {
        mainGenreName = mainGenre.name;
        
        // Get active circle to calculate its center position - use same logic as genre items
        // Use the circle from the stack directly, not from getActiveCircle() which might be stale
        const activeCircle = this.genreCircleStack[this.activeCircleIndex];
        if (activeCircle) {
          const fixedCenterX = this.containerSize / 2;
          const fixedCenterY = this.containerSize / 2;
          // Use ringOffsetX/Y directly from the circle object, same as genre items do
          const ringCenterX = fixedCenterX + activeCircle.ringOffsetX;
          const ringCenterY = fixedCenterY + activeCircle.ringOffsetY;
          const opacity = activeCircle.expansionProgress;
          
          centerLabelStyle = styleMap({
            left: `${ringCenterX}px`,
            top: `${ringCenterY}px`,
            opacity: `${opacity}`,
          });
        }
      }
    }
    
    // Center cross: Position fix, Farbe = aktueller Mix
    const centerCircleStyle = styleMap({
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      '--cross-color': this.getMixColor(),
    });

    // Get position of genre with max weight for the indicator line
    const maxWeightPos = this.getMaxWeightGenrePosition();
    const fixedCenterX = this.containerSize / 2;
    const fixedCenterY = this.containerSize / 2;
    
    return html`<div id="background" style=${bg}></div>
      <div 
        id="radial-container"
        @mousedown=${this.handleMouseDown}
        @mousemove=${this.handleMouseMove}
        @mouseup=${this.handleMouseUp}
        @mouseleave=${this.handleMouseUp}
        @touchstart=${this.handleTouchStart}
        @touchmove=${this.handleTouchMove}
        @touchend=${this.handleTouchEnd}
        @touchcancel=${this.handleTouchEnd}>
        ${this.renderGenres()}
        ${maxWeightPos && this.containerSize > 0 && this.showDebugPanel ? html`
          <svg id="max-weight-line" width=${this.containerSize} height=${this.containerSize} viewBox="0 0 ${this.containerSize} ${this.containerSize}">
            <line 
              x1=${maxWeightPos.x1} 
              y1=${maxWeightPos.y1} 
              x2=${maxWeightPos.x2} 
              y2=${maxWeightPos.y2} />
          </svg>
        ` : ''}
        ${this.showingSubGenres && mainGenreName ? html`
          <div 
            id="center-genre-label"
            style=${centerLabelStyle}
          >${mainGenreName}</div>
        ` : ''}
        <div 
          id="center-circle" 
          style=${centerCircleStyle}
          @click=${this.handleCenterCircleClick}
          @touchstart=${this.handleCenterCircleClick}></div>
      </div>
      <button 
        id="back-button" 
        class=${classMap({ visible: this.showingSubGenres })}
        @click=${this.handleBackToMainGenres}>
        ← Back to Main Genres
      </button>
      ${this.genreCircleStack.length > 1 ? html`
        <div id="circle-navigation">
          <button
            class=${classMap({ 
              'circle-nav-button': true,
              'active': this.activeCircleIndex === 0 
            })}
            @click=${() => this.navigateToCircle(0)}>
            Root
          </button>
          ${this.genreCircleStack.slice(1).map((circle, index) => html`
            <button
              class=${classMap({ 
                'circle-nav-button': true,
                'active': this.activeCircleIndex === index + 1 
              })}
              @click=${() => this.navigateToCircle(index + 1)}>
              Circle ${index + 1}
            </button>
          `)}
          ${this.activeCircleIndex > 0 ? html`
            <button
              class="circle-nav-button"
              @click=${this.navigateBack}>
              ← Back
            </button>
          ` : ''}
        </div>
      ` : ''}
        <div id="media-controls">
        <button 
          class="nav-arrow-button" 
          @click=${this.navigateBack} 
          ?disabled=${this.activeCircleIndex <= 0}
          title="Previous Level">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"/>
          </svg>
        </button>
        <button id="dice-button" @click=${this.handleDiceClick} title="Randomize Mix">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7.5 18C6.67 18 6 17.33 6 16.5S6.67 15 7.5 15s1.5.67 1.5 1.5S8.33 18 7.5 18zm0-9C6.67 9 6 8.33 6 7.5S6.67 6 7.5 6 9 6.67 9 7.5 8.33 9 7.5 9zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4.5 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0-9c-.83 0-1.5-.67-1.5-1.5S15.17 6 16 6s1.5.67 1.5 1.5S16.83 9 16 9z" fill="currentColor"/>
          </svg>
        </button>
        <play-pause-button 
          .playbackState=${this.playbackState} 
          @click=${this.playPause}></play-pause-button>
        <div id="volume-control" class=${classMap({ visible: this.showVolumeControl })}>
          <div id="volume-icon" @click=${this.toggleVolumeControl}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill="currentColor"/>
            </svg>
          </div>
          <input
            id="volume-slider-horizontal"
            type="range"
            min="0"
            max="100"
            value=${this.volume * 100}
            @input=${this.handleVolumeChange}
            @change=${this.handleVolumeChange}
          />
        </div>
        <button 
          class="nav-arrow-button" 
          @click=${this.navigateNext} 
          ?disabled=${this.activeCircleIndex >= this.genreCircleStack.length - 1}
          title="Next Level">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/>
          </svg>
        </button>
      </div>
      <div id="radius-container">
        <input
          id="radius-slider"
          type="range"
          orient="vertical"
          min="0"
          max="100"
          value=${((this.getActiveRadiusMultiplier() - 0.1) / 0.5) * 100}
          @input=${this.handleRadiusChange}
          @change=${this.handleRadiusChange}
        />
        <div id="radius-label">R</div>
      </div>
      <div id="debug-panel" class=${classMap({ visible: this.showDebugPanel })}>
        ${this.renderDebugPanel()}
      </div>`;
  }

  private async handleChatSend() {
    if (!this.chatInput.trim() || this.chatLoading) return;
    
    const userMessage = this.chatInput.trim();
    this.chatInput = '';
    this.chatMessages = [...this.chatMessages, { role: 'user', content: userMessage }];
    this.chatLoading = true;
    this.requestUpdate();
    
    try {
      const response = await geminiAgent.sendMessage(userMessage);
      this.chatMessages = [...this.chatMessages, { role: 'assistant', content: response }];
    } catch (error) {
      this.chatMessages = [...this.chatMessages, { 
        role: 'assistant', 
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }];
    } finally {
      this.chatLoading = false;
      this.requestUpdate();
    }
  }

  private handleChatKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleChatSend();
    }
  }

  private handleChatClear() {
    this.chatMessages = [];
    geminiAgent.clearHistory();
  }

  private handleSystemInstructionSave() {
    // Update the system instruction in the Gemini Agent
    // Note: We need to rebuild it with genre data if enabled
    const baseInstruction = this.systemInstruction;
    geminiAgent.setSystemInstruction(baseInstruction);
    
    // Reload genre data to include it in the system instruction
    geminiAgent.reloadGenreData(baseInstruction);
    
    // Show feedback
    console.log('System-Anweisung gespeichert:', baseInstruction);
    this.requestUpdate();
  }

  private handleSystemInstructionReset() {
    // Reset to default system instruction
    this.systemInstruction = 'You are a helpful AI assistant for music production and DJing.';
    geminiAgent.setSystemInstruction(this.systemInstruction);
    geminiAgent.reloadGenreData(this.systemInstruction);
    this.requestUpdate();
  }

  private handleNewCircleMessageReset() {
    // Reset to default new circle message template
    this.newCircleMessageTemplate = `Take the currently active {genres}, combine them meaningfully, and generate 5 new named prompts that can be used for further mixing.
Always respond only in the following JSON format (exactly 5 objects):

[
  {
    "id": "",
    "name": "",
    "prompt": ""
  },
  {
    "id": "",
    "name": "",
    "prompt": ""
  },
  {
    "id": "",
    "name": "",
    "prompt": ""
  },
  {
    "id": "",
    "name": "",
    "prompt": ""
  },
  {
    "id": "",
    "name": "",
    "prompt": ""
  }
]`;
    this.requestUpdate();
  }

  /**
   * Parse JSON from agent response (handles markdown code blocks)
   */
  private parseJsonResponse(response: string): Array<{ id: string; name: string; prompt: string }> | null {
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      
      // Try to find JSON array directly
      const arrayMatch = response.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      }
      
      // Try parsing the whole response
      return JSON.parse(response);
    } catch (error) {
      console.error('Failed to parse JSON response:', error);
      console.error('Response was:', response);
      return null;
    }
  }

  /**
   * Convert generated genre JSON to Prompt objects
   */
  private generatePromptsFromJson(genres: Array<{ id: string; name: string; prompt: string }>): Map<string, Prompt> {
    const prompts = new Map<string, Prompt>();
    
    genres.forEach((genre, index) => {
      // Generate a unique promptId
      const promptId = `generated-${genre.id}-${Date.now()}-${index}`;
      
      // Store the name for display purposes
      this.generatedGenreNames.set(promptId, genre.name);
      
      // Generate color based on index (distribute colors evenly around hue circle)
      const hue = (index * 360 / genres.length) % 360;
      const color = this.hslToHex(hue, 100, 50);
      
      prompts.set(promptId, {
        promptId,
        text: genre.prompt,
        weight: 0,
        cc: index,
        color,
      });
    });
    
    return prompts;
  }

  private renderDebugPanel() {
    const allPrompts = [...this.prompts.values()];
    const promptArray = allPrompts.sort((a, b) => b.weight - a.weight);
    const radiusMultiplier = this.getActiveRadiusMultiplier();
    const radius = this.containerSize > 0 ? (this.containerSize * radiusMultiplier) : 200;
    
    return html`
      <h3>Debug Info (Drücke 'p' zum Schließen)</h3>
      <div class="debug-item">
        <span class="debug-label">Ring Offset:</span>
        <span class="debug-value">X: ${this.ringOffsetX.toFixed(1)}, Y: ${this.ringOffsetY.toFixed(1)}</span>
      </div>
      <div class="debug-item">
        <span class="debug-label">Fixed Center:</span>
        <span class="debug-value">X: ${(this.containerSize / 2).toFixed(1)}, Y: ${(this.containerSize / 2).toFixed(1)}</span>
      </div>
      <div class="debug-item">
        <span class="debug-label">Container Size:</span>
        <span class="debug-value">${this.containerSize}px</span>
      </div>
      <div class="debug-item">
        <span class="debug-label">Radius:</span>
        <span class="debug-value">${radius.toFixed(1)}px</span>
      </div>
      <h3 style="margin-top: 15px; margin-bottom: 10px;">Mix (sortiert nach Anteil):</h3>
      ${promptArray.map((prompt) => {
        const originalIndex = allPrompts.findIndex(p => p.promptId === prompt.promptId);
        const genrePos = this.getGenrePosition(
          originalIndex >= 0 ? originalIndex : 0,
          allPrompts.length,
          radius
        );
        const fixedCenterX = this.containerSize / 2;
        const fixedCenterY = this.containerSize / 2;
        const distance = this.calculateDistance(
          fixedCenterX,
          fixedCenterY,
          genrePos.x,
          genrePos.y
        );
        const mixPercent = (prompt.weight / 2) * 100;
        
        return html`
          <div class="debug-item" style="border-left-color: ${prompt.color}">
            <div>
              <span class="debug-label">${prompt.text}:</span>
              <span class="debug-value">${mixPercent.toFixed(1)}%</span>
            </div>
            <div style="margin-top: 4px;">
              <span class="debug-label">Distanz:</span>
              <span class="debug-value">${distance.toFixed(1)}px</span>
            </div>
            <div class="debug-weight-bar">
              <div 
                class="debug-weight-fill" 
                style="width: ${mixPercent}%; background: ${prompt.color}">
              </div>
            </div>
          </div>
        `;
      })}
      <div id="system-instruction-container" style="margin-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.3); padding-top: 15px;">
        <h3 style="margin-bottom: 10px;">System-Anweisung (System Instruction)</h3>
        <textarea
          id="system-instruction-input"
          rows="4"
          .value=${this.systemInstruction}
          @input=${(e: Event) => {
            const target = e.target as HTMLTextAreaElement;
            this.systemInstruction = target.value;
          }}
          placeholder="System-Anweisung für den AI Agent..."
        ></textarea>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button
            id="system-instruction-save-button"
            @click=${this.handleSystemInstructionSave}
            style="padding: 8px 16px; background: #FD7B2E; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; transition: background 0.2s;"
          >
            Speichern
          </button>
          <button
            id="system-instruction-reset-button"
            @click=${this.handleSystemInstructionReset}
            style="padding: 8px 12px; background: rgba(255, 255, 255, 0.1); color: #fff; border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 4px; cursor: pointer; font-size: 11px; transition: background 0.2s;"
          >
            Zurücksetzen
          </button>
        </div>
      </div>
      <div id="new-circle-message-container" style="margin-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.3); padding-top: 15px;">
        <h3 style="margin-bottom: 10px;">Nachricht beim neuen Kreis</h3>
        <div style="font-size: 10px; opacity: 0.7; margin-bottom: 8px;">
          Verwende <code style="background: rgba(255, 255, 255, 0.1); padding: 2px 4px; border-radius: 2px;">{genres}</code> als Platzhalter für die Genre-Namen
        </div>
        <textarea
          id="new-circle-message-input"
          rows="3"
          .value=${this.newCircleMessageTemplate}
          @input=${(e: Event) => {
            const target = e.target as HTMLTextAreaElement;
            this.newCircleMessageTemplate = target.value;
          }}
          placeholder="Nachricht beim Erstellen eines neuen Kreises..."
        ></textarea>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button
            id="new-circle-message-reset-button"
            @click=${this.handleNewCircleMessageReset}
            style="padding: 8px 12px; background: rgba(255, 255, 255, 0.1); color: #fff; border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 4px; cursor: pointer; font-size: 11px; transition: background 0.2s;"
          >
            Zurücksetzen
          </button>
        </div>
      </div>
      <div id="chat-container">
        <h3 style="margin-top: 15px; margin-bottom: 10px;">Gemini AI Chat</h3>
        <div id="chat-messages">
          ${this.chatMessages.length === 0 ? html`
            <div style="text-align: center; opacity: 0.5; padding: 20px; font-size: 11px;">
              Starte eine Unterhaltung mit dem AI Agent. Er kennt alle Genres und Subgenres.
            </div>
          ` : ''}
          ${repeat(
            this.chatMessages,
            (msg, index) => `chat-msg-${index}`,
            (msg, index) => html`
              <div class="chat-message ${msg.role}">
                <div class="chat-message-role">${msg.role === 'user' ? 'You' : 'AI'}</div>
                <div class="chat-message-content">${msg.content}</div>
              </div>
            `
          )}
          ${this.chatLoading ? html`
            <div class="chat-message assistant">
              <div class="chat-message-role">AI</div>
              <div class="chat-message-content" style="opacity: 0.7;">Thinking...</div>
            </div>
          ` : ''}
        </div>
        <div id="chat-input-container">
          <input
            id="chat-input"
            type="text"
            placeholder="Frage stellen..."
            .value=${this.chatInput}
            @input=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              this.chatInput = target.value;
            }}
            @keydown=${this.handleChatKeyDown}
            ?disabled=${this.chatLoading}
          />
          <button
            id="chat-send-button"
            @click=${this.handleChatSend}
            ?disabled=${this.chatLoading || !this.chatInput.trim()}
          >
            Send
          </button>
          <button
            id="chat-clear-button"
            @click=${this.handleChatClear}
            ?disabled=${this.chatLoading}
          >
            Clear
          </button>
        </div>
      </div>
    `;
  }

  private renderGenres() {
    // Build flat list of genre items with unique key per circle+prompt so inactive circles
    // keep their own DOM nodes and positions (do not move when active circle is dragged)
    const items: { key: string; circle: GenreCircle; circleIndex: number; prompt: Prompt; index: number; total: number }[] = [];
    this.genreCircleStack.forEach((circle, circleIndex) => {
      const promptArray = [...circle.prompts.values()];
      promptArray.forEach((prompt, index) => {
        items.push({
          key: `${circle.id}-${prompt.promptId}`,
          circle,
          circleIndex,
          prompt,
          index,
          total: promptArray.length,
        });
      });
    });

    // Render circle outlines for each circle in the stack
    const circleOutlines = this.genreCircleStack.map((circle) => {
      const radius = this.containerSize > 0 ? (this.containerSize * circle.radiusMultiplier) : 200;
      const centerX = this.containerSize / 2 + circle.ringOffsetX;
      const centerY = this.containerSize / 2 + circle.ringOffsetY;
      const diameter = radius * 2;
      const outlineStyle = styleMap({
        left: `${centerX}px`,
        top: `${centerY}px`,
        width: `${diameter}px`,
        height: `${diameter}px`,
        opacity: `${circle.expansionProgress}`,
      });
      return html`<div class="genre-circle-outline" style=${outlineStyle}></div>`;
    });

    const genreItems = repeat(
      items,
      (item) => item.key,
      (item) => {
        const { circle, circleIndex, prompt, index, total } = item;
        const isActive = circleIndex === this.activeCircleIndex;
        // Each circle uses its own radius multiplier
        const radius = this.containerSize > 0 ? (this.containerSize * circle.radiusMultiplier) : 200;
        const pos = this.getGenrePosition(index, total, radius, circle);
        const angleDeg = (pos.angle * 180 / Math.PI);
        let rotationDeg = angleDeg + 90;
        rotationDeg = ((rotationDeg % 360) + 360) % 360;
        if (rotationDeg > 90 && rotationDeg <= 270) {
          rotationDeg = (rotationDeg + 180) % 360;
        }
        const slotAngle = (Math.PI * 2) / total;
        const boxAngle = slotAngle * 0.98;
        const boxWidthPx = Math.max(20, 2 * radius * Math.sin(boxAngle / 2));
        const boxHeightPx = Math.max(22, radius * 0.12);
        // For active circles, use weight-based opacity
        // For inactive circles, use a fixed opacity that's visible but distinct
        const baseOpacity = isActive ? (prompt.weight > 0.1 ? 1 : 0.3) : 0.4;
        const opacity = baseOpacity * circle.expansionProgress;
        // Use white color if genre is not in mix (weight is low or zero), otherwise use active color
        const textColor = isActive 
          ? (prompt.weight <= 0.1 ? '#ffffff' : '#FD7B2E')
          : '#ffffff'; // Passive circles always use white
        const style = styleMap({
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          width: `${boxWidthPx}px`,
          minHeight: `${boxHeightPx}px`,
          transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
          color: textColor,
          opacity: `${opacity}`,
        });
        const classes = classMap({
          'genre-item': true,
          'inactive': !isActive,
          'filtered': this.filteredPrompts.has(prompt.text),
          'disabled': circle.disabledGenres.has(prompt.promptId) && !this.showingSubGenres,
        });
        let displayText = prompt.text;
        // Check if this is a generated genre (has a stored name)
        if (this.generatedGenreNames.has(prompt.promptId)) {
          displayText = this.generatedGenreNames.get(prompt.promptId) || prompt.text;
        } else if (this.showingSubGenres && this.selectedMainGenreId) {
          const subGenres = (subGenresData as any)[this.selectedMainGenreId] as { name: string; prompt: string }[] | undefined;
          if (subGenres) {
            const match = prompt.promptId.match(/^sub-.+-(\d+)$/);
            const idx = match ? parseInt(match[1], 10) : -1;
            if (idx >= 0 && idx < subGenres.length) displayText = subGenres[idx].name;
            else {
              const byPrompt = subGenres.find((sg) => sg.prompt === prompt.text);
              if (byPrompt) displayText = byPrompt.name;
            }
          }
        } else {
          const mainGenre = (mainGenresData as any[]).find(g => g.prompt === prompt.text);
          if (mainGenre) displayText = mainGenre.name;
        }
        if (isActive) {
          return html`<div
            class=${classes}
            style=${style}
            @mousedown=${(e: MouseEvent) => this.handleGenreMouseDown(prompt.promptId, e)}
            @mouseup=${this.handleGenreMouseUp}
            @mouseleave=${this.handleGenreMouseUp}
            @touchstart=${(e: TouchEvent) => this.handleGenreTouchStart(prompt.promptId, e)}
            @touchend=${this.handleGenreTouchEnd}
            @touchcancel=${this.handleGenreTouchEnd}
            @click=${(e: MouseEvent) => this.handleGenreClick(prompt.promptId, e)}>${displayText}</div>`;
        }
        return html`<div class=${classes} style=${style}>${displayText}</div>`;
      }
    );

    return html`${circleOutlines}${genreItems}`;
  }
}
