/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

import { throttle } from '../utils/throttle';

import './PlayPauseButton';
import type { PlaybackState, Prompt } from '../types';
import subGenresData from '../sub-genres.json';
import mainGenresData from '../main-genres.json';

// Hierarchical genre circle system
interface GenreCircle {
  id: string;
  prompts: Map<string, Prompt>;
  ringOffsetX: number;
  ringOffsetY: number;
  disabledGenres: Set<string>;
  isExpanding: boolean;
  expansionProgress: number;
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
      background: #111;
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
      border-radius: 50%;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.9);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10;
      cursor: pointer;
      transition: transform 0.2s, border-color 0.2s;
      &:hover {
        transform: translate(-50%, -50%) scale(1.1);
      }
      &:active {
        transform: translate(-50%, -50%) scale(0.95);
      }
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
      transition: opacity 0.2s, transform 0.2s;
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
      top: 10px;
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
      opacity: 0.2 !important;
      filter: grayscale(100%) brightness(0.4);
      pointer-events: none;
      cursor: default;
    }
    play-pause-button {
      position: relative;
      width: 15vmin;
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
      font-family: monospace;
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
    #volume-container {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 100;
      background: rgba(0, 0, 0, 0.7);
      padding: 10px 20px;
      border-radius: 25px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      backdrop-filter: blur(10px);
    }
    #volume-slider {
      width: 150px;
      height: 6px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      outline: none;
      cursor: pointer;
    }
    #volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
      box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
      transition: transform 0.2s;
    }
    #volume-slider::-webkit-slider-thumb:hover {
      transform: scale(1.2);
    }
    #volume-slider::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
      border: none;
      box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
      transition: transform 0.2s;
    }
    #volume-slider::-moz-range-thumb:hover {
      transform: scale(1.2);
    }
    #volume-icon {
      width: 20px;
      height: 20px;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      user-select: none;
    }
    #volume-value {
      min-width: 35px;
      text-align: center;
      color: #fff;
      font-size: 12px;
      font-family: monospace;
      user-select: none;
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

  constructor(
    initialPrompts: Map<string, Prompt>,
  ) {
    super();
    this.prompts = initialPrompts;
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

  private getGenrePosition(index: number, total: number, radius: number) {
    // Calculate equal spacing: divide full circle (2π) by total number of items
    // Start at top (-π/2) and distribute evenly
    const angleStep = (Math.PI * 2) / total;
    const angle = (index * angleStep) - (Math.PI / 2);
    
    // Fixed center point (always at container center)
    const fixedCenterX = this.containerSize / 2;
    const fixedCenterY = this.containerSize / 2;
    
    // Genre ring center is offset from fixed center by the active circle's offset
    const activeCircle = this.getActiveCircle();
    const ringOffsetX = activeCircle ? activeCircle.ringOffsetX : this.ringOffsetX;
    const ringOffsetY = activeCircle ? activeCircle.ringOffsetY : this.ringOffsetY;
    
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
    const radius = this.containerSize * 0.35;
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
    const radius = this.containerSize > 0 ? this.containerSize * 0.35 : 200;
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

  /** Main genre ID that has the highest weight in the current mix (from active circle). */
  private getMainGenreIdWithHighestWeight(): string | null {
    const activeCircle = this.getActiveCircle();
    if (!activeCircle) return null;
    let bestId: string | null = null;
    let bestWeight = -1;
    for (const p of activeCircle.prompts.values()) {
      if (p.weight <= bestWeight) continue;
      let mainId: string | null = null;
      if (p.promptId.startsWith('prompt-')) {
        mainId = p.promptId.slice('prompt-'.length);
      } else if (p.promptId.startsWith('sub-')) {
        const m = p.promptId.match(/^sub-(.+?)-\d+$/);
        mainId = m ? m[1] : null;
      }
      if (mainId) {
        bestWeight = p.weight;
        bestId = mainId;
      }
    }
    return bestId;
  }

  private createNewGenreCircle() {
    const activeCircle = this.getActiveCircle();
    if (!activeCircle || activeCircle.isExpanding) return;
    
    // New circle shows subgenres of the genre with highest % in the current mix (if any)
    const mainId = this.getMainGenreIdWithHighestWeight();
    const subGenres = mainId ? (subGenresData as any)[mainId] as { name: string; prompt: string }[] | undefined : undefined;
    const mainGenres = mainGenresData as any[];
    const mainGenre = mainId ? mainGenres.find((g: any) => g.id === mainId) : null;
    
    let initialPrompts: Map<string, Prompt>;
    if (mainGenre && subGenres && subGenres.length > 0) {
      initialPrompts = new Map<string, Prompt>();
      subGenres.forEach((subGenre: any, index: number) => {
        const subPromptId = `sub-${mainGenre.id}-${index}`;
        initialPrompts.set(subPromptId, {
          promptId: subPromptId,
          text: subGenre.prompt,
          weight: 0,
          cc: index,
          color: this.hslToHex(mainGenre.colorHue, 100, 50),
        });
      });
    } else {
      initialPrompts = new Map(this.originalPrompts);
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

  /** Vorerst deaktiviert – Lichtblobs im Hintergrund (Code bleibt erhalten). */
  private readonly backgroundBlobsEnabled = false;

  /** Generates radial gradients for each prompt based on weight and color. */
  private readonly makeBackground = throttle(
    () => {
      const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

      const MAX_WEIGHT = 0.5;
      const MAX_ALPHA = 0.6;

      const bg: string[] = [];
      const promptArray = [...this.prompts.values()];
      const radius = this.containerSize > 0 ? (this.containerSize * 0.35) : 200;

      promptArray.forEach((p, i) => {
        const alphaPct = clamp01(p.weight / MAX_WEIGHT) * MAX_ALPHA;
        const alpha = Math.round(alphaPct * 0xff)
          .toString(16)
          .padStart(2, '0');

        const stop = p.weight / 2;
        const genrePos = this.getGenrePosition(i, promptArray.length, radius);
        const x = (genrePos.x / this.containerSize) * 100;
        const y = (genrePos.y / this.containerSize) * 100;
        const s = `radial-gradient(circle at ${x}% ${y}%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 100}%)`;

        bg.push(s);
      });

      return bg.join(', ');
    },
    30, // don't re-render more than once every XXms
  );

  private playPause() {
    this.dispatchEvent(new CustomEvent('play-pause'));
  }

  private handleVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const newVolume = parseFloat(target.value) / 100;
    this.volume = newVolume;
    this.dispatchEvent(new CustomEvent('volume-changed', { detail: newVolume }));
  }

  public addFilteredPrompt(prompt: string) {
    this.filteredPrompts = new Set([...this.filteredPrompts, prompt]);
  }

  override render() {
    const bg = styleMap({
      backgroundImage: this.backgroundBlobsEnabled ? this.makeBackground() : 'none',
    });
    
    // Center circle: Position fix, Outline-Farbe = aktueller Mix
    const centerCircleStyle = styleMap({
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      borderColor: this.getMixColor(),
    });
    
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
      <play-pause-button .playbackState=${this.playbackState} @click=${this.playPause}></play-pause-button>
      <div id="volume-container">
        <div id="volume-icon">🔊</div>
        <input
          id="volume-slider"
          type="range"
          min="0"
          max="100"
          value=${this.volume * 100}
          @input=${this.handleVolumeChange}
          @change=${this.handleVolumeChange}
        />
        <div id="volume-value">${Math.round(this.volume * 100)}%</div>
      </div>
      <div id="debug-panel" class=${classMap({ visible: this.showDebugPanel })}>
        ${this.renderDebugPanel()}
      </div>`;
  }

  private renderDebugPanel() {
    const allPrompts = [...this.prompts.values()];
    const promptArray = allPrompts.sort((a, b) => b.weight - a.weight);
    const radius = this.containerSize > 0 ? (this.containerSize * 0.35) : 200;
    
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
    `;
  }

  private renderGenreCircles() {
    // Visual circles removed - only genre items are rendered
    return html``;
  }

  private getGenrePositionForCircle(index: number, total: number, radius: number, circle: GenreCircle) {
    // Calculate equal spacing: divide full circle (2π) by total number of items
    // Start at top (-π/2) and distribute evenly
    const angleStep = (Math.PI * 2) / total;
    const angle = (index * angleStep) - (Math.PI / 2);
    
    // Fixed center point (always at container center)
    const fixedCenterX = this.containerSize / 2;
    const fixedCenterY = this.containerSize / 2;
    
    // Genre ring center is offset from fixed center by the circle's offset
    const ringCenterX = fixedCenterX + circle.ringOffsetX;
    const ringCenterY = fixedCenterY + circle.ringOffsetY;
    const x = ringCenterX + Math.cos(angle) * radius;
    const y = ringCenterY + Math.sin(angle) * radius;
    return { x, y, angle };
  }

  private renderGenres() {
    const radius = this.containerSize > 0 ? (this.containerSize * 0.35) : 200;
    
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

    return repeat(
      items,
      (item) => item.key,
      (item) => {
        const { circle, circleIndex, prompt, index, total } = item;
        const isActive = circleIndex === this.activeCircleIndex;
        const pos = this.getGenrePositionForCircle(index, total, radius, circle);
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
        const baseOpacity = isActive ? (prompt.weight > 0.1 ? 1 : 0.3) : 0.2;
        const opacity = baseOpacity * circle.expansionProgress;
        const style = styleMap({
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          width: `${boxWidthPx}px`,
          minHeight: `${boxHeightPx}px`,
          transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
          color: prompt.color,
          opacity: `${opacity}`,
        });
        const classes = classMap({
          'genre-item': true,
          'inactive': !isActive,
          'filtered': this.filteredPrompts.has(prompt.text),
          'disabled': circle.disabledGenres.has(prompt.promptId) && !this.showingSubGenres,
        });
        let displayText = prompt.text;
        if (this.showingSubGenres && this.selectedMainGenreId) {
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
  }
}
