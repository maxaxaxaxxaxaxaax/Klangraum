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
import { loadLocalSongs, deleteLocalSong, type KieSongResult } from '../utils/KieApiClient';

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
  private static readonly SONGS_STORAGE_KEY = 'klanggraum-generated-songs';

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
      touch-action: none;
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
      touch-action: none;
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
        background: #FD7B2E;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        border-radius: 0.1vmin;
      }
      &::before {
        width: 2.5vmin;
        height: 0.15vmin;
      }
      &::after {
        width: 0.15vmin;
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
      transition: opacity 0.2s, transform 0.2s;
      border: none;
      background: transparent;
      transform-origin: center center;
      touch-action: none;
    }
    .genre-item-svg {
      position: absolute;
      overflow: visible;
      pointer-events: none;
      user-select: none;
    }
    .genre-item-svg text {
      font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      pointer-events: auto;
      transition: opacity 0.2s;
    }
    .genre-item-svg text.filtered {
      opacity: 0.5;
    }
    .genre-item-svg text.disabled {
      opacity: 0.2;
      text-decoration: line-through;
    }
    .genre-item-svg text.inactive {
      filter: grayscale(100%) brightness(0.6);
      pointer-events: none;
      cursor: default;
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
    #header {
      position: absolute;
      top: 20px;
      left: 20px;
      right: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 100;
      pointer-events: none;
    }
    #header > * {
      pointer-events: auto;
    }
    #header-logo {
      height: auto;
      flex-shrink: 0;
    }
    #media-controls {
      position: absolute;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      z-index: 100;
      padding: 12px 20px 16px 20px;
      background: rgba(0, 0, 0, 0.6);
      border-radius: 24px;
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    #media-controls .presets-row {
      display: flex;
      gap: 6px;
    }
    #media-controls .controls-row {
      display: flex;
      align-items: center;
      gap: 20px;
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
    #seed-button {
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
    #seed-button:hover {
      transform: scale(1.05);
      border-color: rgba(255, 255, 255, 0.8);
    }
    #seed-button:active {
      transform: scale(0.95);
    }
    #seed-button svg {
      width: 28px;
      height: 28px;
      color: #ffffff;
    }
    #replay-button {
      height: 40px;
      padding: 0 16px;
      border-radius: 20px;
      border: 2px solid #ffffff;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;
      margin: 0;
      color: #ffffff;
      font-size: 14px;
      font-weight: 600;
      font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #replay-button:hover {
      transform: scale(1.05);
      border-color: rgba(255, 255, 255, 0.8);
      background: rgba(255, 255, 255, 0.1);
    }
    #replay-button:active {
      transform: scale(0.95);
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
    }
    #volume-icon {
      width: 36px;
      height: 36px;
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
    #header-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    #songs-button {
      position: relative;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    #songs-button:hover {
      transform: scale(1.05);
      border-color: rgba(255, 255, 255, 0.8);
    }
    #songs-button:active {
      transform: scale(0.95);
    }
    #songs-button svg {
      width: 20px;
      height: 20px;
    }
    #songs-button .badge {
      position: absolute;
      top: -6px;
      right: -6px;
      background: #FD7B2E;
      color: #fff;
      font-size: 10px;
      font-weight: bold;
      min-width: 16px;
      height: 16px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      font-family: 'Satoshi', sans-serif;
    }
    #songs-panel {
      position: absolute;
      top: 60px;
      right: 0;
      background: rgba(0, 0, 0, 0.9);
      border: 2px solid #fff;
      border-radius: 12px;
      padding: 12px;
      min-width: 280px;
      max-width: 350px;
      max-height: 400px;
      overflow-y: auto;
      z-index: 1000;
      backdrop-filter: blur(10px);
      font-family: 'Satoshi', sans-serif;
    }
    #songs-panel h3 {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: #fff;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      padding-bottom: 8px;
    }
    .song-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      margin-bottom: 8px;
      transition: background 0.2s;
    }
    .song-item:last-child {
      margin-bottom: 0;
    }
    .song-item:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .song-item-cover {
      width: 48px;
      height: 48px;
      border-radius: 6px;
      object-fit: cover;
      flex-shrink: 0;
    }
    .song-item-info {
      flex: 1;
      min-width: 0;
    }
    .song-item-title {
      font-size: 12px;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .song-item-duration {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.6);
      margin-top: 2px;
    }
    .song-item-buttons {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }
    .song-item-button {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.3);
      background: transparent;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .song-item-button:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: #fff;
    }
    .song-item-button.playing {
      background: #FD7B2E;
      border-color: #FD7B2E;
    }
    .song-item-button svg {
      width: 14px;
      height: 14px;
    }
    .songs-empty {
      text-align: center;
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
      padding: 20px;
    }
    .song-item-clickable {
      cursor: pointer;
      flex: 1;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    #song-detail-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(10px);
    }
    .song-detail-content {
      background: rgba(30, 30, 30, 0.95);
      border: 2px solid #fff;
      border-radius: 16px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      font-family: 'Satoshi', sans-serif;
    }
    .song-detail-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 20px;
    }
    .song-detail-cover {
      width: 120px;
      height: 120px;
      border-radius: 12px;
      object-fit: cover;
      flex-shrink: 0;
    }
    .song-detail-info {
      flex: 1;
    }
    .song-detail-title {
      font-size: 20px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 8px;
    }
    .song-detail-duration {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 12px;
    }
    .song-detail-date {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
    }
    .song-detail-section {
      margin-bottom: 16px;
    }
    .song-detail-section h4 {
      font-size: 12px;
      color: #FD7B2E;
      margin: 0 0 8px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .song-detail-section p {
      font-size: 14px;
      color: #fff;
      margin: 0;
      padding: 12px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .song-detail-section p.empty {
      color: rgba(255, 255, 255, 0.4);
      font-style: italic;
    }
    .song-detail-audio {
      width: 100%;
      height: 40px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
    }
    .song-detail-audio::-webkit-media-controls-panel {
      background: rgba(255, 255, 255, 0.1);
    }
    .song-detail-buttons {
      display: flex;
      gap: 12px;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    .song-detail-btn {
      flex: 1;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      background: transparent;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .song-detail-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: #fff;
    }
    .song-detail-btn.primary {
      background: #FD7B2E;
      border-color: #FD7B2E;
    }
    .song-detail-btn.primary:hover {
      background: #e56a20;
    }
    .song-detail-btn svg {
      width: 18px;
      height: 18px;
    }
    .song-detail-close {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.3);
      background: rgba(0, 0, 0, 0.5);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .song-detail-close:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: #fff;
    }
    .song-detail-close svg {
      width: 20px;
      height: 20px;
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
      writing-mode: vertical-lr;
      direction: rtl;
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
      writing-mode: vertical-lr;
      direction: rtl;
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
    .circle-label {
      position: absolute;
      transform: translateX(-50%);
      font-size: 1.5vmin;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.7);
      text-align: center;
      white-space: nowrap;
      pointer-events: none;
      z-index: 1;
    }
    .preset-slot {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.3);
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
      font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      cursor: pointer;
      transition: all 0.2s ease;
      user-select: none;
    }
    .preset-slot:hover {
      border-color: rgba(255, 255, 255, 0.6);
      color: rgba(255, 255, 255, 0.8);
    }
    .preset-slot.saved {
      border-color: #FD7B2E;
      background: rgba(253, 123, 46, 0.3);
      color: #FD7B2E;
    }
    .preset-slot.saved:hover {
      background: rgba(253, 123, 46, 0.5);
    }
    #replay-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      backdrop-filter: blur(10px);
    }
    #replay-modal {
      background: linear-gradient(145deg, #1a1a1a 0%, #2d2d2d 100%);
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 16px;
      padding: 30px;
      min-width: 360px;
      max-width: 90vw;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }
    #replay-modal h2 {
      margin: 0 0 20px 0;
      font-size: 24px;
      font-weight: 600;
      color: #fff;
      text-align: center;
      font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #replay-modal .duration-info {
      text-align: center;
      font-size: 48px;
      font-weight: 700;
      color: #FD7B2E;
      margin: 20px 0;
      font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #replay-modal .duration-label {
      text-align: center;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 30px;
    }
    #replay-modal .status-text {
      text-align: center;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 20px;
      min-height: 20px;
    }
    #replay-modal .modal-buttons {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    #replay-modal .modal-btn {
      padding: 14px 28px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #replay-modal .modal-btn svg {
      width: 20px;
      height: 20px;
    }
    #replay-modal .modal-btn.primary {
      background: #FD7B2E;
      color: #fff;
      border: none;
    }
    #replay-modal .modal-btn.primary:hover {
      background: #e66a1f;
      transform: scale(1.02);
    }
    #replay-modal .modal-btn.primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    #replay-modal .modal-btn.secondary {
      background: transparent;
      color: #fff;
      border: 2px solid rgba(255, 255, 255, 0.3);
    }
    #replay-modal .modal-btn.secondary:hover {
      border-color: rgba(255, 255, 255, 0.6);
      background: rgba(255, 255, 255, 0.1);
    }
    #replay-modal .modal-btn.secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #replay-modal .close-btn {
      position: absolute;
      top: 15px;
      right: 15px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    #replay-modal .close-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    #replay-modal .close-btn svg {
      width: 18px;
      height: 18px;
    }
    #replay-modal-content {
      position: relative;
    }
    .kie-section {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
    }
    .kie-section h3 {
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      text-align: center;
    }
    .kie-status {
      text-align: center;
      padding: 20px;
      color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
    }
    .kie-status .spinner {
      display: inline-block;
      width: 24px;
      height: 24px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-top-color: #FD7B2E;
      border-radius: 50%;
      animation: kie-spin 1s linear infinite;
      margin-bottom: 12px;
    }
    @keyframes kie-spin {
      to { transform: rotate(360deg); }
    }
    .kie-songs {
      display: flex;
      gap: 16px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .kie-song-card {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 16px;
      width: 160px;
      text-align: center;
    }
    .kie-song-card img {
      width: 100%;
      height: 120px;
      object-fit: cover;
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .kie-song-card .song-title {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 4px;
    }
    .kie-song-card .song-duration {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 12px;
    }
    .kie-song-card .song-buttons {
      display: flex;
      gap: 8px;
      justify-content: center;
    }
    .kie-song-card .song-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }
    .kie-song-card .song-btn.play {
      background: #FD7B2E;
      color: #fff;
    }
    .kie-song-card .song-btn.play:hover {
      background: #e66a1f;
      transform: scale(1.05);
    }
    .kie-song-card .song-btn.download {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
    }
    .kie-song-card .song-btn.download:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .kie-song-card .song-btn svg {
      width: 18px;
      height: 18px;
    }
    .kie-error {
      text-align: center;
      padding: 20px;
      color: #ff6b6b;
      font-size: 14px;
    }
    .kie-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .kie-form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .kie-form-group label {
      font-size: 13px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.9);
    }
    .kie-form-group .hint {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.5);
      margin-top: 2px;
    }
    .kie-input {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 10px 12px;
      color: #fff;
      font-size: 14px;
      font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      outline: none;
      transition: border-color 0.2s;
    }
    .kie-input:focus {
      border-color: #FD7B2E;
    }
    .kie-input::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }
    .kie-textarea {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 10px 12px;
      color: #fff;
      font-size: 14px;
      font-family: 'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      outline: none;
      transition: border-color 0.2s;
      resize: vertical;
      min-height: 80px;
    }
    .kie-textarea:focus {
      border-color: #FD7B2E;
    }
    .kie-textarea::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }
    .kie-audio-preview {
      background: rgba(253, 123, 46, 0.15);
      border: 1px solid rgba(253, 123, 46, 0.3);
      border-radius: 8px;
      padding: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .kie-audio-preview .audio-icon {
      width: 40px;
      height: 40px;
      background: #FD7B2E;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .kie-audio-preview .audio-icon svg {
      width: 20px;
      height: 20px;
      color: #fff;
    }
    .kie-audio-preview .audio-info {
      flex: 1;
    }
    .kie-audio-preview .audio-info .title {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
    }
    .kie-audio-preview .audio-info .duration {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
    }
    .kie-audio-preview .preview-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }
    .kie-audio-preview .preview-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .kie-audio-preview .preview-btn.playing {
      background: #FD7B2E;
    }
    .kie-audio-preview .preview-btn svg {
      width: 18px;
      height: 18px;
    }
    .kie-crop-controls {
      margin-top: 12px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
    }
    .kie-crop-controls .crop-label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
    }
    .kie-crop-slider-container {
      position: relative;
      height: 48px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      margin-bottom: 8px;
      cursor: pointer;
      touch-action: none;
      user-select: none;
    }
    .kie-crop-slider-container .crop-range {
      position: absolute;
      top: 0;
      height: 100%;
      background: rgba(253, 123, 46, 0.15);
      border-top: 2px solid rgba(253, 123, 46, 0.6);
      border-bottom: 2px solid rgba(253, 123, 46, 0.6);
      cursor: grab;
      z-index: 1;
    }
    .kie-crop-slider-container .crop-range:active {
      cursor: grabbing;
    }
    .kie-crop-slider-container .crop-handle {
      position: absolute;
      top: 0;
      width: 12px;
      height: 100%;
      background: #FD7B2E;
      cursor: ew-resize;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }
    .kie-crop-slider-container .crop-handle:hover {
      background: #ff8c42;
    }
    .kie-crop-slider-container .crop-handle.start {
      left: 0;
      border-radius: 4px 0 0 4px;
      transform: translateX(-6px);
    }
    .kie-crop-slider-container .crop-handle.end {
      right: 0;
      border-radius: 0 4px 4px 0;
      transform: translateX(6px);
    }
    .kie-crop-slider-container .crop-handle::after {
      content: '';
      width: 2px;
      height: 20px;
      background: rgba(255, 255, 255, 0.6);
      border-radius: 1px;
    }
    .kie-crop-slider-container .crop-time-label {
      position: absolute;
      bottom: -18px;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.6);
      transform: translateX(-50%);
      white-space: nowrap;
    }
    .kie-crop-slider-container .crop-time-label.start {
      left: 0;
    }
    .kie-crop-slider-container .crop-time-label.end {
      right: 0;
      transform: translateX(50%);
    }
    .kie-crop-waveform {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 4px;
      pointer-events: none;
    }
    .kie-crop-playhead {
      position: absolute;
      top: 0;
      width: 2px;
      height: 100%;
      background: #ffffff;
      pointer-events: none;
      z-index: 10;
      box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
      transition: opacity 0.2s;
    }
    .kie-crop-playhead.hidden {
      opacity: 0;
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
  
  // Preset positions (keys 1-9)
  @state() private savedPresets: Map<number, { offsetX: number; offsetY: number; radius: number; circleIndex: number }> = new Map();
  private presetAnimationId: number | null = null;
  @state() private systemInstruction = 'You are a helpful AI assistant for music production and DJing.';
  
  // Replay modal state
  @state() private showReplayModal = false;
  @state() private replayDuration = 0;
  @state() private replayStatus: 'idle' | 'playing' | 'stopped' = 'idle';
  @state() private isReplayPlaying = false;
  
  // KIE.ai song generation state
  @state() private kieStatus: 'idle' | 'uploading' | 'generating' | 'polling' | 'complete' | 'error' = 'idle';
  @state() private kieStatusMessage = '';
  @state() private kieGeneratedSongs: KieSongResult[] = [];
  @state() private kiePlayingSongIndex: number | null = null;
  private kieAudioElement: HTMLAudioElement | null = null;

  // Songs panel state
  @state() private showSongsPanel = false;
  @state() private selectedSongIndex: number | null = null;
  
  // KIE.ai input fields
  @state() private kieStyleInput = '';
  @state() private kieLyricsInput = '';
  
  // Audio cropping state
  @state() private audioCropStart = 0;  // Start time in seconds
  @state() private audioCropEnd = 60;   // End time in seconds
  @state() private isPreviewPlaying = false;
  private previewAudioSource: AudioBufferSourceNode | null = null;
  
  // Crop dragging state
  @state() private cropDragging: 'start' | 'end' | 'range' | null = null;
  private cropDragStartX = 0;
  private cropDragStartValue = 0;
  private cropDragEndValue = 0;
  private cropContainerWidth = 0;
  
  // Waveform visualization
  @state() private waveformData: number[] = [];
  
  // Playhead position (0-1 relative to replay duration)
  @state() private playheadPosition = 0;
  private playheadAnimationId: number | null = null;
  private playheadStartTime = 0;
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

  // Bound handlers for passive event listeners
  private boundTouchStart = this.handleTouchStart.bind(this);
  private boundTouchMove = this.handleTouchMove.bind(this);
  private boundTouchEnd = this.handleTouchEnd.bind(this);

  override connectedCallback() {
    super.connectedCallback();
    this.loadSongsFromStorage();
  }

  private loadSongsFromStorage() {
    try {
      const stored = localStorage.getItem(PromptDjMidi.SONGS_STORAGE_KEY);
      if (stored) {
        this.kieGeneratedSongs = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load songs from storage:', e);
    }
  }

  private saveSongsToStorage() {
    try {
      localStorage.setItem(
        PromptDjMidi.SONGS_STORAGE_KEY,
        JSON.stringify(this.kieGeneratedSongs)
      );
    } catch (e) {
      console.warn('Failed to save songs to storage:', e);
    }
  }

  private deleteSongFromPanel(index: number) {
    this.kieGeneratedSongs = this.kieGeneratedSongs.filter((_, i) => i !== index);
    this.saveSongsToStorage();
  }

  private clearAllSongs() {
    this.kieGeneratedSongs = [];
    this.saveSongsToStorage();
  }

  override firstUpdated() {
    // Defer initialization to next frame to avoid triggering update during update
    requestAnimationFrame(() => this.initializeContainer());
    // Add resize observer to handle window resizing
    if (typeof ResizeObserver !== 'undefined') {
      const container = this.shadowRoot?.getElementById('radial-container');
      if (container) {
        const observer = new ResizeObserver(() => {
          requestAnimationFrame(() => this.initializeContainer());
        });
        observer.observe(container);
        
        // Register touch events with passive: true to avoid scroll-blocking warnings
        container.addEventListener('touchstart', this.boundTouchStart, { passive: true });
        container.addEventListener('touchmove', this.boundTouchMove, { passive: true });
        container.addEventListener('touchend', this.boundTouchEnd, { passive: true });
        container.addEventListener('touchcancel', this.boundTouchEnd, { passive: true });
      }
    }
    // Listen for keyboard events
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    // Remove passive touch listeners
    const container = this.shadowRoot?.getElementById('radial-container');
    if (container) {
      container.removeEventListener('touchstart', this.boundTouchStart);
      container.removeEventListener('touchmove', this.boundTouchMove);
      container.removeEventListener('touchend', this.boundTouchEnd);
      container.removeEventListener('touchcancel', this.boundTouchEnd);
    }
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private handleKeyDown(e: KeyboardEvent) {
    // Toggle debug panel with P
    if (e.key === 'p' || e.key === 'P') {
      this.showDebugPanel = !this.showDebugPanel;
      this.requestUpdate();
      return;
    }
    
    // Preset keys 1-9
    const key = parseInt(e.key);
    if (key >= 1 && key <= 9) {
      e.preventDefault();
      const activeCircle = this.getActiveCircle();
      if (!activeCircle) return;
      
      if (e.shiftKey) {
        // Shift + Number = Delete preset
        if (this.savedPresets.has(key)) {
          this.savedPresets.delete(key);
          this.savedPresets = new Map(this.savedPresets); // Trigger reactivity
          this.showPresetToast(`Preset ${key} gelöscht`);
        }
      } else if (this.savedPresets.has(key)) {
        // Preset exists → Jump to saved position
        const preset = this.savedPresets.get(key)!;
        // Switch to saved circle if different and exists
        if (preset.circleIndex !== this.activeCircleIndex && preset.circleIndex < this.genreCircleStack.length) {
          this.navigateToCircle(preset.circleIndex);
        }
        this.animateToPreset(preset.offsetX, preset.offsetY, preset.radius);
        this.showPresetToast(`Preset ${key} geladen`);
      } else {
        // Slot empty → Save current position
        this.savedPresets.set(key, {
          offsetX: activeCircle.ringOffsetX,
          offsetY: activeCircle.ringOffsetY,
          radius: activeCircle.radiusMultiplier,
          circleIndex: this.activeCircleIndex
        });
        this.savedPresets = new Map(this.savedPresets); // Trigger reactivity
        this.showPresetToast(`Preset ${key} gespeichert`);
      }
    }
  }
  
  private showPresetToast(message: string) {
    // Dispatch a toast event that can be caught by parent components
    this.dispatchEvent(new CustomEvent('show-toast', { 
      detail: { message, duration: 1500 },
      bubbles: true,
      composed: true
    }));
  }
  
  private handlePresetClick(num: number) {
    const activeCircle = this.getActiveCircle();
    if (!activeCircle) return;
    
    if (this.savedPresets.has(num)) {
      // Preset exists → Jump to saved position
      const preset = this.savedPresets.get(num)!;
      // Switch to saved circle if different and exists
      if (preset.circleIndex !== this.activeCircleIndex && preset.circleIndex < this.genreCircleStack.length) {
        this.navigateToCircle(preset.circleIndex);
      }
      this.animateToPreset(preset.offsetX, preset.offsetY, preset.radius);
      this.showPresetToast(`Preset ${num} geladen`);
    } else {
      // Slot empty → Save current position
      this.savedPresets.set(num, {
        offsetX: activeCircle.ringOffsetX,
        offsetY: activeCircle.ringOffsetY,
        radius: activeCircle.radiusMultiplier,
        circleIndex: this.activeCircleIndex
      });
      this.savedPresets = new Map(this.savedPresets); // Trigger reactivity
      this.showPresetToast(`Preset ${num} gespeichert`);
    }
  }
  
  private animateToPreset(targetOffsetX: number, targetOffsetY: number, targetRadius: number) {
    const activeCircle = this.getActiveCircle();
    if (!activeCircle) return;
    
    // Cancel any ongoing animation
    if (this.presetAnimationId !== null) {
      cancelAnimationFrame(this.presetAnimationId);
    }
    
    const startOffsetX = activeCircle.ringOffsetX;
    const startOffsetY = activeCircle.ringOffsetY;
    const startRadius = activeCircle.radiusMultiplier;
    const duration = 300; // ms
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      
      // Interpolate values
      const newOffsetX = startOffsetX + (targetOffsetX - startOffsetX) * eased;
      const newOffsetY = startOffsetY + (targetOffsetY - startOffsetY) * eased;
      const newRadius = startRadius + (targetRadius - startRadius) * eased;
      
      // Only update the active circle (preset is for this circle only)
      this.genreCircleStack = this.genreCircleStack.map((circle, idx) => {
        if (idx === this.activeCircleIndex) {
          return {
            ...circle,
            ringOffsetX: newOffsetX,
            ringOffsetY: newOffsetY,
            radiusMultiplier: newRadius
          };
        }
        return circle; // Other circles remain unchanged
      });
      
      this.updateWeightsFromPosition();
      
      if (progress < 1) {
        this.presetAnimationId = requestAnimationFrame(animate);
      } else {
        this.presetAnimationId = null;
        this.syncActiveCircleState();
      }
    };
    
    this.presetAnimationId = requestAnimationFrame(animate);
  }

  override updated(changedProperties: Map<string | number | symbol, unknown>) {
    // Use requestAnimationFrame to defer initialization to avoid triggering
    // a new update cycle during the current update
    if (this.containerSize === 0) {
      requestAnimationFrame(() => this.initializeContainer());
    }
    
    // Re-render waveform when data or crop changes
    if (changedProperties.has('waveformData') || 
        changedProperties.has('audioCropStart') || 
        changedProperties.has('audioCropEnd')) {
      const canvas = this.shadowRoot?.querySelector('.kie-crop-waveform') as HTMLCanvasElement;
      if (canvas) {
        this.renderWaveform(canvas);
      }
    }
  }

  private initializeContainer() {
    const container = this.shadowRoot?.getElementById('radial-container');
    if (container) {
      const newSize = container.offsetWidth;
      if (newSize > 0 && newSize !== this.containerSize) {
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

    // Get active circle for ring offset
    const activeCircle = this.getActiveCircle();
    const ringOffsetX = activeCircle ? activeCircle.ringOffsetX : this.ringOffsetX;
    const ringOffsetY = activeCircle ? activeCircle.ringOffsetY : this.ringOffsetY;
    const ringCenterX = fixedCenterX + ringOffsetX;
    const ringCenterY = fixedCenterY + ringOffsetY;

    // PASS 1: Calculate fisheye scales for all items using equal-spacing positions
    // (same logic as renderGenres())
    const scaleData = promptArray.map((prompt, index) => {
      const equalAngleStep = (Math.PI * 2) / promptArray.length;
      const equalAngle = (index * equalAngleStep) - (Math.PI / 2);
      const genreX = ringCenterX + Math.cos(equalAngle) * radius;
      const genreY = ringCenterY + Math.sin(equalAngle) * radius;
      const fisheyeScale = this.calculateFisheyeScale(genreX, genreY, radius);
      return { prompt, index, fisheyeScale };
    });

    // Calculate total scale for proportional distribution
    const totalScale = scaleData.reduce((sum, d) => sum + d.fisheyeScale, 0);

    // PASS 2: Calculate proportional angles and use mid-angle positions for weight calculation
    let currentAngle = -Math.PI / 2; // Start at top

    scaleData.forEach(({ prompt, fisheyeScale }) => {
      if (this.disabledGenres.has(prompt.promptId)) {
        prompt.weight = 0;
        newPrompts.set(prompt.promptId, prompt);
        return;
      }

      // Calculate proportional arc portion based on fisheye scale
      const arcPortion = (fisheyeScale / totalScale) * (Math.PI * 2);
      const startAngle = currentAngle;
      const endAngle = currentAngle + arcPortion;
      currentAngle = endAngle; // Update for next item

      // Use mid-angle of the arc (where the text is displayed at startOffset="50%")
      const midAngle = (startAngle + endAngle) / 2;
      const genreX = ringCenterX + Math.cos(midAngle) * radius;
      const genreY = ringCenterY + Math.sin(midAngle) * radius;

      const distance = this.calculateDistance(fixedCenterX, fixedCenterY, genreX, genreY);

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
    
    const newDisabledGenres = new Set(this.disabledGenres);
    
    // Shift+Click: Select only this genre, disable all others
    if (e.shiftKey) {
      // Disable all genres except the clicked one
      for (const prompt of this.prompts.values()) {
        if (prompt.promptId === promptId) {
          newDisabledGenres.delete(promptId);
        } else {
          newDisabledGenres.add(prompt.promptId);
        }
      }
    } else {
      // Normal click: Toggle disabled state for this genre
      if (newDisabledGenres.has(promptId)) {
        newDisabledGenres.delete(promptId);
      } else {
        newDisabledGenres.add(promptId);
      }
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
      // touch-action: none in CSS prevents default scroll behavior
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
    // touch-action: none in CSS prevents default scroll behavior
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
    const target = e.target as HTMLElement;
    
    // Handle center circle touch
    if (target.id === 'center-circle' || target.closest('#center-circle')) {
      this.createNewGenreCircle();
      return;
    }
    
    // Handle genre item touch (for long press)
    const genreItem = target.classList.contains('genre-item') ? target : target.closest('.genre-item');
    if (genreItem && !genreItem.classList.contains('inactive')) {
      const promptId = (genreItem as HTMLElement).dataset.promptId;
      if (promptId) {
        this.handleGenrePointerDown(promptId, e);
      }
      return;
    }
    
    // Default: handle container drag
    this.handlePointerDown(e);
  }

  private handleTouchMove(e: TouchEvent) {
    this.handlePointerMove(e);
  }

  private handleTouchEnd(e: TouchEvent) {
    const target = e.target as HTMLElement;
    
    // Handle genre item touch end
    const genreItem = target.classList.contains('genre-item') ? target : target.closest('.genre-item');
    if (genreItem) {
      this.handleGenrePointerUp(e);
      return;
    }
    
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

  private toggleSongsPanel() {
    this.showSongsPanel = !this.showSongsPanel;
  }

  private formatSongDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private playSongFromPanel(index: number) {
    if (this.kiePlayingSongIndex === index) {
      // Stop current song
      if (this.kieAudioElement) {
        this.kieAudioElement.pause();
        this.kieAudioElement = null;
      }
      this.kiePlayingSongIndex = null;
    } else {
      // Stop any currently playing song
      if (this.kieAudioElement) {
        this.kieAudioElement.pause();
      }
      // Play new song
      const song = this.kieGeneratedSongs[index];
      this.kieAudioElement = new Audio(song.audio_url);
      this.kieAudioElement.play();
      this.kiePlayingSongIndex = index;
      this.kieAudioElement.onended = () => {
        this.kiePlayingSongIndex = null;
        this.kieAudioElement = null;
      };
    }
  }

  private downloadSong(index: number) {
    const song = this.kieGeneratedSongs[index];
    const link = document.createElement('a');
    link.href = song.audio_url;
    link.download = `klanggraum-song-${index + 1}.mp3`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private openSongDetail(index: number) {
    this.selectedSongIndex = index;
  }

  private closeSongDetail() {
    this.selectedSongIndex = null;
  }

  private formatDate(timestamp: number | undefined): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private renderSongDetailModal() {
    if (this.selectedSongIndex === null) return null;

    const song = this.kieGeneratedSongs[this.selectedSongIndex];
    if (!song) return null;

    return html`
      <div id="song-detail-modal" @click=${(e: Event) => {
        if ((e.target as HTMLElement).id === 'song-detail-modal') {
          this.closeSongDetail();
        }
      }}>
        <button class="song-detail-close" @click=${this.closeSongDetail} title="Schließen">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
        <div class="song-detail-content">
          <div class="song-detail-header">
            <img class="song-detail-cover" src="${song.image_url}" alt="Cover" />
            <div class="song-detail-info">
              <div class="song-detail-title">Song ${this.selectedSongIndex + 1}</div>
              <div class="song-detail-duration">${this.formatSongDuration(song.duration)}</div>
              ${song.createdAt ? html`
                <div class="song-detail-date">Erstellt: ${this.formatDate(song.createdAt)}</div>
              ` : ''}
            </div>
          </div>

          <div class="song-detail-section">
            <h4>Style / Prompt</h4>
            <p class="${!song.style ? 'empty' : ''}">${song.style || 'Kein Style angegeben'}</p>
          </div>

          <div class="song-detail-section">
            <h4>Lyrics</h4>
            <p class="${!song.lyrics ? 'empty' : ''}">${song.lyrics || 'Instrumental (keine Lyrics)'}</p>
          </div>

          <div class="song-detail-section">
            <h4>Source Audio (Input für KI)</h4>
            ${song.sourceAudioUrl ? html`
              <audio
                class="song-detail-audio"
                controls
                src="${song.sourceAudioUrl}"
              ></audio>
            ` : html`
              <p class="empty">Kein Source-Audio verfügbar</p>
            `}
          </div>

          <div class="song-detail-buttons">
            <button
              class="song-detail-btn ${this.kiePlayingSongIndex === this.selectedSongIndex ? 'primary' : ''}"
              @click=${() => this.playSongFromPanel(this.selectedSongIndex!)}>
              ${this.kiePlayingSongIndex === this.selectedSongIndex ? html`
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16"/>
                  <rect x="14" y="4" width="4" height="16"/>
                </svg>
                Stop
              ` : html`
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Abspielen
              `}
            </button>
            <button class="song-detail-btn" @click=${() => this.downloadSong(this.selectedSongIndex!)}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
              Download
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderSongsPanel() {
    if (!this.showSongsPanel) return null;

    return html`
      <div id="songs-panel">
        <h3>Generated Songs</h3>
        ${this.kieGeneratedSongs.length === 0 ? html`
          <div class="songs-empty">
            No songs generated yet.<br/>
            Use Replay to create songs!
          </div>
        ` : this.kieGeneratedSongs.map((song, index) => html`
          <div class="song-item">
            <div class="song-item-clickable" @click=${() => this.openSongDetail(index)} title="Details anzeigen">
              <img class="song-item-cover" src="${song.image_url}" alt="Cover" />
              <div class="song-item-info">
                <div class="song-item-title">Song ${index + 1}</div>
                <div class="song-item-duration">${this.formatSongDuration(song.duration)}</div>
              </div>
            </div>
            <div class="song-item-buttons">
              <button
                class="song-item-button ${this.kiePlayingSongIndex === index ? 'playing' : ''}"
                @click=${() => this.playSongFromPanel(index)}
                title="${this.kiePlayingSongIndex === index ? 'Stop' : 'Play'}">
                ${this.kiePlayingSongIndex === index ? html`
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"/>
                    <rect x="14" y="4" width="4" height="16"/>
                  </svg>
                ` : html`
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                `}
              </button>
              <button
                class="song-item-button"
                @click=${() => this.downloadSong(index)}
                title="Download">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                </svg>
              </button>
            </div>
          </div>
        `)}
      </div>
    `;
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

  private handleSeedClick() {
    this.dispatchEvent(new CustomEvent('reseed'));
  }

  private handleReplayClick() {
    // Open the replay modal and request duration info
    this.dispatchEvent(new CustomEvent('replay-get-duration'));
    this.showReplayModal = true;
    this.replayStatus = 'idle';
    this.isReplayPlaying = false;
    // Initialize crop to full duration
    this.audioCropStart = 0;
    this.audioCropEnd = this.replayDuration || 60;
    // Request waveform data for visualization
    this.waveformData = [];
    this.requestWaveformData();
  }

  private closeReplayModal() {
    // Stop replay if playing
    if (this.isReplayPlaying) {
      this.dispatchEvent(new CustomEvent('replay-stop'));
    }
    this.showReplayModal = false;
    this.replayStatus = 'idle';
    this.isReplayPlaying = false;
    // Reset KIE.ai state
    this.resetKieState();
  }

  private handleReplayPlay() {
    if (this.replayDuration < 1) {
      this.replayStatus = 'idle';
      return;
    }
    this.replayStatus = 'playing';
    this.isReplayPlaying = true;
    this.dispatchEvent(new CustomEvent('replay-play'));
  }

  private handleReplayStop() {
    this.dispatchEvent(new CustomEvent('replay-stop'));
    this.replayStatus = 'stopped';
    this.isReplayPlaying = false;
  }

  private handleReplayDownload() {
    this.dispatchEvent(new CustomEvent('replay-download'));
  }

  /**
   * Update replay duration from external source
   */
  public setReplayDuration(duration: number) {
    this.replayDuration = duration;
    // Update crop end if it exceeds the new duration
    if (this.audioCropEnd > duration) {
      this.audioCropEnd = duration;
    }
    // Ensure crop start is valid
    if (this.audioCropStart >= duration) {
      this.audioCropStart = 0;
    }
  }

  /**
   * Called when replay playback ends
   */
  public onReplayEnded() {
    this.replayStatus = 'stopped';
    this.isReplayPlaying = false;
  }

  /**
   * Start KIE.ai song generation
   */
  private handleKieGenerateSong() {
    if (this.replayDuration < 1) {
      return;
    }
    // Stop preview if playing
    this.stopAudioPreview();
    
    this.kieStatus = 'uploading';
    this.kieStatusMessage = 'Audio wird hochgeladen...';
    this.kieGeneratedSongs = [];
    this.dispatchEvent(new CustomEvent('kie-generate-song', {
      detail: {
        style: this.kieStyleInput.trim(),
        lyrics: this.kieLyricsInput.trim(),
        cropStart: this.audioCropStart,
        cropEnd: this.audioCropEnd,
      }
    }));
  }

  /**
   * Update KIE.ai generation status from external source
   */
  public setKieStatus(status: 'idle' | 'uploading' | 'generating' | 'polling' | 'complete' | 'error', message?: string) {
    this.kieStatus = status;
    this.kieStatusMessage = message || '';
  }

  /**
   * Set generated songs from KIE.ai
   */
  public setKieGeneratedSongs(songs: KieSongResult[]) {
    this.kieGeneratedSongs = songs;
    this.kieStatus = 'complete';
    this.saveSongsToStorage();
  }

  /**
   * Play a KIE.ai generated song
   */
  private handleKieSongPlay(index: number) {
    const song = this.kieGeneratedSongs[index];
    if (!song) return;

    // Stop current audio if playing
    if (this.kieAudioElement) {
      this.kieAudioElement.pause();
      this.kieAudioElement = null;
    }

    // If clicking on same song, just stop
    if (this.kiePlayingSongIndex === index) {
      this.kiePlayingSongIndex = null;
      return;
    }

    // Play the song
    this.kieAudioElement = new Audio(song.audio_url);
    this.kieAudioElement.play();
    this.kiePlayingSongIndex = index;

    this.kieAudioElement.onended = () => {
      this.kiePlayingSongIndex = null;
      this.kieAudioElement = null;
      this.requestUpdate();
    };
  }

  /**
   * Download a KIE.ai generated song
   */
  private handleKieSongDownload(index: number) {
    const song = this.kieGeneratedSongs[index];
    if (!song) return;

    const a = document.createElement('a');
    a.href = song.audio_url;
    a.download = `klanggraum-song-${index + 1}.mp3`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Reset KIE.ai state
   */
  private resetKieState() {
    if (this.kieAudioElement) {
      this.kieAudioElement.pause();
      this.kieAudioElement = null;
    }
    this.stopAudioPreview();
    this.kieStatus = 'idle';
    this.kieStatusMessage = '';
    this.kieGeneratedSongs = [];
    this.kiePlayingSongIndex = null;
  }

  /**
   * Play audio preview of the cropped section
   */
  private handleAudioPreviewPlay() {
    if (this.isPreviewPlaying) {
      this.stopAudioPreview();
      return;
    }
    
    // Dispatch event to play cropped audio
    this.isPreviewPlaying = true;
    this.dispatchEvent(new CustomEvent('replay-preview-play', {
      detail: {
        startTime: this.audioCropStart,
        endTime: this.audioCropEnd,
      }
    }));
    
    // Start playhead animation
    this.startPlayheadAnimation();
  }

  /**
   * Start playhead animation
   */
  private startPlayheadAnimation() {
    this.playheadStartTime = performance.now();
    this.playheadPosition = this.audioCropStart / this.replayDuration;
    
    const duration = (this.audioCropEnd - this.audioCropStart) * 1000; // in ms
    
    const animate = () => {
      if (!this.isPreviewPlaying) {
        this.playheadPosition = 0;
        return;
      }
      
      const elapsed = performance.now() - this.playheadStartTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Calculate playhead position relative to full duration
      const currentTime = this.audioCropStart + (this.audioCropEnd - this.audioCropStart) * progress;
      this.playheadPosition = currentTime / this.replayDuration;
      
      if (progress < 1) {
        this.playheadAnimationId = requestAnimationFrame(animate);
      } else {
        this.playheadPosition = 0;
      }
    };
    
    this.playheadAnimationId = requestAnimationFrame(animate);
  }

  /**
   * Stop playhead animation
   */
  private stopPlayheadAnimation() {
    if (this.playheadAnimationId) {
      cancelAnimationFrame(this.playheadAnimationId);
      this.playheadAnimationId = null;
    }
    this.playheadPosition = 0;
  }

  /**
   * Stop audio preview
   */
  private stopAudioPreview() {
    if (this.previewAudioSource) {
      try {
        this.previewAudioSource.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      this.previewAudioSource = null;
    }
    this.isPreviewPlaying = false;
    this.stopPlayheadAnimation();
    this.dispatchEvent(new CustomEvent('replay-preview-stop'));
  }

  /**
   * Called when preview playback ends
   */
  public onPreviewEnded() {
    this.isPreviewPlaying = false;
    this.previewAudioSource = null;
    this.stopPlayheadAnimation();
    this.requestUpdate();
  }

  /**
   * Update crop start time
   */
  private handleCropStartChange(value: number) {
    const maxStart = Math.max(0, this.audioCropEnd - 1);
    this.audioCropStart = Math.max(0, Math.min(value, maxStart));
  }

  /**
   * Update crop end time
   */
  private handleCropEndChange(value: number) {
    const minEnd = this.audioCropStart + 1;
    const maxEnd = this.replayDuration;
    this.audioCropEnd = Math.max(minEnd, Math.min(value, maxEnd));
  }

  /**
   * Get the cropped duration
   */
  private getCroppedDuration(): number {
    return Math.max(0, this.audioCropEnd - this.audioCropStart);
  }

  /**
   * Handle crop drag start
   */
  private handleCropDragStart(e: PointerEvent, type: 'start' | 'end' | 'range') {
    e.preventDefault();
    e.stopPropagation();
    
    const container = (e.currentTarget as HTMLElement).closest('.kie-crop-slider-container') as HTMLElement;
    if (!container) return;
    
    this.cropDragging = type;
    this.cropDragStartX = e.clientX;
    this.cropDragStartValue = this.audioCropStart;
    this.cropDragEndValue = this.audioCropEnd;
    this.cropContainerWidth = container.getBoundingClientRect().width;
    
    // Add global listeners
    window.addEventListener('pointermove', this.handleCropDragMove);
    window.addEventListener('pointerup', this.handleCropDragEnd);
  }

  /**
   * Handle crop drag move (bound method)
   */
  private handleCropDragMove = (e: PointerEvent) => {
    if (!this.cropDragging || this.cropContainerWidth === 0) return;
    
    const deltaX = e.clientX - this.cropDragStartX;
    const deltaTime = (deltaX / this.cropContainerWidth) * this.replayDuration;
    
    const minDuration = 1; // Minimum 1 second crop
    
    if (this.cropDragging === 'start') {
      // Dragging start handle
      let newStart = this.cropDragStartValue + deltaTime;
      newStart = Math.max(0, Math.min(newStart, this.cropDragEndValue - minDuration));
      this.audioCropStart = newStart;
    } else if (this.cropDragging === 'end') {
      // Dragging end handle
      let newEnd = this.cropDragEndValue + deltaTime;
      newEnd = Math.max(this.cropDragStartValue + minDuration, Math.min(newEnd, this.replayDuration));
      this.audioCropEnd = newEnd;
    } else if (this.cropDragging === 'range') {
      // Dragging entire range
      const rangeSize = this.cropDragEndValue - this.cropDragStartValue;
      let newStart = this.cropDragStartValue + deltaTime;
      let newEnd = this.cropDragEndValue + deltaTime;
      
      // Clamp to bounds
      if (newStart < 0) {
        newStart = 0;
        newEnd = rangeSize;
      }
      if (newEnd > this.replayDuration) {
        newEnd = this.replayDuration;
        newStart = this.replayDuration - rangeSize;
      }
      
      this.audioCropStart = newStart;
      this.audioCropEnd = newEnd;
    }
    
    this.requestUpdate();
  };

  /**
   * Handle crop drag end (bound method)
   */
  private handleCropDragEnd = () => {
    this.cropDragging = null;
    window.removeEventListener('pointermove', this.handleCropDragMove);
    window.removeEventListener('pointerup', this.handleCropDragEnd);
  };

  /**
   * Handle click on crop container to set position
   */
  private handleCropContainerClick(e: PointerEvent) {
    // Only handle direct clicks on the container background, not on handles or range
    if ((e.target as HTMLElement).classList.contains('crop-handle') || 
        (e.target as HTMLElement).classList.contains('crop-range')) {
      return;
    }
    
    const container = e.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = clickX / rect.width;
    const clickTime = clickRatio * this.replayDuration;
    
    // Determine if click is closer to start or end
    const midPoint = (this.audioCropStart + this.audioCropEnd) / 2;
    
    if (clickTime < midPoint) {
      // Move start to click position
      this.handleCropStartChange(Math.max(0, Math.min(clickTime, this.audioCropEnd - 1)));
    } else {
      // Move end to click position
      this.handleCropEndChange(Math.max(this.audioCropStart + 1, Math.min(clickTime, this.replayDuration)));
    }
  }

  /**
   * Set waveform data for visualization
   */
  public setWaveformData(data: number[]) {
    this.waveformData = data;
  }

  /**
   * Request waveform data from audio buffer
   */
  private requestWaveformData() {
    this.dispatchEvent(new CustomEvent('replay-get-waveform'));
  }

  /**
   * Render waveform on canvas
   */
  private renderWaveform(canvas: HTMLCanvasElement) {
    if (!canvas || this.waveformData.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    const barCount = this.waveformData.length;
    const barWidth = width / barCount;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw waveform bars
    const centerY = height / 2;
    
    for (let i = 0; i < barCount; i++) {
      const amplitude = this.waveformData[i];
      const barHeight = amplitude * height * 0.9;
      const x = i * barWidth;
      
      // Check if this bar is in the selected crop range
      const barTime = (i / barCount) * this.replayDuration;
      const isSelected = barTime >= this.audioCropStart && barTime <= this.audioCropEnd;
      
      // Set color based on selection
      ctx.fillStyle = isSelected 
        ? 'rgba(253, 123, 46, 0.8)' 
        : 'rgba(255, 255, 255, 0.3)';
      
      // Draw bar centered vertically
      ctx.fillRect(x, centerY - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
    }
  }

  private calculateFisheyeScale(genreX: number, genreY: number, radius: number): number {
    const fixedCenterX = this.containerSize / 2;
    const fixedCenterY = this.containerSize / 2;
    const distance = Math.sqrt((genreX - fixedCenterX) ** 2 + (genreY - fixedCenterY) ** 2);
    const maxDistance = radius * 2;
    const normalized = Math.min(distance / maxDistance, 1);
    return 1.8 - (normalized * 1.1); // 1.8 at center, 0.7 at edge
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

  private getCircleName(circleIndex: number): string {
    if (circleIndex === 0) {
      return 'Root';
    }
    return `Circle ${circleIndex}`;
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

    // Get position of the genre with max weight using Fisheye-based calculation
    const radiusMultiplier = this.getActiveRadiusMultiplier();
    const radius = this.containerSize * radiusMultiplier;
    const activeCircle = this.getActiveCircle();
    if (!activeCircle) return null;

    const fixedCenterX = this.containerSize / 2;
    const fixedCenterY = this.containerSize / 2;
    const ringCenterX = fixedCenterX + activeCircle.ringOffsetX;
    const ringCenterY = fixedCenterY + activeCircle.ringOffsetY;

    // PASS 1: Calculate fisheye scales for all items using equal-spacing positions
    const scaleData = promptArray.map((prompt, index) => {
      const equalAngleStep = (Math.PI * 2) / promptArray.length;
      const equalAngle = (index * equalAngleStep) - (Math.PI / 2);
      const genreX = ringCenterX + Math.cos(equalAngle) * radius;
      const genreY = ringCenterY + Math.sin(equalAngle) * radius;
      const fisheyeScale = this.calculateFisheyeScale(genreX, genreY, radius);
      return { prompt, index, fisheyeScale };
    });

    const totalScale = scaleData.reduce((sum, d) => sum + d.fisheyeScale, 0);

    // PASS 2: Find the mid-angle position of the max weight genre
    let currentAngle = -Math.PI / 2; // Start at top
    let targetMidAngle = currentAngle;

    for (let i = 0; i < scaleData.length; i++) {
      const arcPortion = (scaleData[i].fisheyeScale / totalScale) * (Math.PI * 2);
      if (i === maxWeightIndex) {
        // Use mid-angle of the arc (where the text is displayed)
        targetMidAngle = currentAngle + arcPortion / 2;
        break;
      }
      currentAngle += arcPortion;
    }

    // Calculate position using Fisheye-based mid-angle
    const genreX = ringCenterX + Math.cos(targetMidAngle) * radius;
    const genreY = ringCenterY + Math.sin(targetMidAngle) * radius;
    
    // Calculate angle from fixed center to genre position
    const dx = genreX - fixedCenterX;
    const dy = genreY - fixedCenterY;
    const angle = Math.atan2(dy, dx);
    
    // Calculate radius of center cross (2.5vmin / 2, converted to pixels)
    // Since containerSize is in pixels and represents 80vmin, we need to convert
    // 2.5vmin = (2.5 / 80) * containerSize
    const centerCircleRadius = (2.5 / 80) * this.containerSize;
    
    // Calculate start point on the edge of center cross
    const x1 = fixedCenterX + Math.cos(angle) * centerCircleRadius;
    const y1 = fixedCenterY + Math.sin(angle) * centerCircleRadius;
    
    return { x1, y1, x2: genreX, y2: genreY };
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
    
    // Center cross: Position fix, Farbe = orange
    const centerCircleStyle = styleMap({
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
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
        @mouseleave=${this.handleMouseUp}>
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
          @click=${this.handleCenterCircleClick}></div>
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
      <div id="header">
        <img id="header-logo" src="/Logo/Logo.png" alt="Logo" />
        <div id="header-controls">
          <div id="songs-button" @click=${this.toggleSongsPanel} title="Generated Songs">
            ${this.kieGeneratedSongs.length > 0 ? html`
              <span class="badge">${this.kieGeneratedSongs.length}</span>
            ` : ''}
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" fill="currentColor"/>
            </svg>
            ${this.renderSongsPanel()}
          </div>
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
        </div>
      </div>
      <div id="media-controls">
        <div class="presets-row">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => html`
            <div 
              class=${classMap({ 
                'preset-slot': true, 
                'saved': this.savedPresets.has(num) 
              })}
              @click=${() => this.handlePresetClick(num)}
              title=${this.savedPresets.has(num) ? `Preset ${num} laden (oder Shift+${num} zum Löschen)` : `Taste ${num} zum Speichern`}
            >${num}</div>
          `)}
        </div>
        <div class="controls-row">
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
          <button id="seed-button" @click=${this.handleSeedClick} title="New Seed">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="currentColor"/>
            </svg>
          </button>
          <button id="replay-button" @click=${this.handleReplayClick} title="Replay last 60 seconds">
            Replay
          </button>
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
      </div>
      ${this.showReplayModal ? this.renderReplayModal() : ''}
      ${this.renderSongDetailModal()}`;
  }

  private renderReplayModal() {
    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getStatusText = () => {
      if (this.replayDuration < 1) {
        return 'Keine Aufnahme vorhanden. Starte zuerst die Wiedergabe.';
      }
      switch (this.replayStatus) {
        case 'playing':
          return 'Wiedergabe läuft...';
        case 'stopped':
          return 'Wiedergabe beendet.';
        default:
          return 'Bereit zur Wiedergabe.';
      }
    };

    const renderKieSection = () => {
      // Show loading state
      if (this.kieStatus === 'uploading' || this.kieStatus === 'generating' || this.kieStatus === 'polling') {
        return html`
          <div class="kie-section">
            <h3>Song erstellen mit KIE.ai</h3>
            <div class="kie-status">
              <div class="spinner"></div>
              <div>${this.kieStatusMessage || 'Verarbeitung...'}</div>
            </div>
          </div>
        `;
      }

      // Show error state
      if (this.kieStatus === 'error') {
        return html`
          <div class="kie-section">
            <h3>Song erstellen mit KIE.ai</h3>
            <div class="kie-error">
              <div>Fehler: ${this.kieStatusMessage}</div>
              <button class="modal-btn secondary" @click=${() => this.kieStatus = 'idle'} style="margin-top: 12px;">
                Erneut versuchen
              </button>
            </div>
          </div>
        `;
      }

      // Show results
      if (this.kieStatus === 'complete' && this.kieGeneratedSongs.length > 0) {
        return html`
          <div class="kie-section">
            <h3>Generierte Songs</h3>
            <div class="kie-songs">
              ${this.kieGeneratedSongs.map((song, index) => html`
                <div class="kie-song-card">
                  <img src="${song.image_url}" alt="Song Cover ${index + 1}" />
                  <div class="song-title">Variante ${index + 1}</div>
                  <div class="song-duration">${formatDuration(song.duration)}</div>
                  <div class="song-buttons">
                    <button 
                      class="song-btn play" 
                      @click=${() => this.handleKieSongPlay(index)}
                      title="${this.kiePlayingSongIndex === index ? 'Stop' : 'Abspielen'}"
                    >
                      ${this.kiePlayingSongIndex === index ? html`
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M6 6h12v12H6z" fill="currentColor"/>
                        </svg>
                      ` : html`
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M8 5v14l11-7z" fill="currentColor"/>
                        </svg>
                      `}
                    </button>
                    <button 
                      class="song-btn download" 
                      @click=${() => this.handleKieSongDownload(index)}
                      title="Download"
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"/>
                      </svg>
                    </button>
                  </div>
                </div>
              `)}
            </div>
            <div style="text-align: center; margin-top: 16px;">
              <button class="modal-btn secondary" @click=${() => this.resetKieState()}>
                Neuen Song erstellen
              </button>
            </div>
          </div>
        `;
      }

      // Show form with audio preview, style and lyrics inputs
      return html`
        <div class="kie-section">
          <h3>Song erstellen mit KIE.ai</h3>
          <div class="kie-form">
            <!-- Audio Preview with Cropping -->
            <div class="kie-form-group">
              <label>Audio (${formatDuration(this.replayDuration)} aufgenommen)</label>
              <div class="kie-audio-preview">
                <div class="audio-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" fill="currentColor"/>
                  </svg>
                </div>
                <div class="audio-info">
                  <div class="title">Ausgewählter Bereich</div>
                  <div class="duration">${formatDuration(this.getCroppedDuration())} ausgewählt</div>
                </div>
                <button 
                  class="preview-btn ${this.isPreviewPlaying ? 'playing' : ''}" 
                  @click=${this.handleAudioPreviewPlay}
                  title="${this.isPreviewPlaying ? 'Stop' : 'Vorschau'}"
                  ?disabled=${this.replayDuration < 1}
                >
                  ${this.isPreviewPlaying ? html`
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 6h12v12H6z" fill="currentColor"/>
                    </svg>
                  ` : html`
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 5v14l11-7z" fill="currentColor"/>
                    </svg>
                  `}
                </button>
              </div>
              
              <!-- Crop Controls -->
              <div class="kie-crop-controls">
                <div class="crop-label">
                  <span>Bereich zuschneiden</span>
                  <span>${formatDuration(this.audioCropStart)} - ${formatDuration(this.audioCropEnd)}</span>
                </div>
                
                <!-- Interactive Crop Slider with Waveform -->
                <div 
                  class="kie-crop-slider-container"
                  @pointerdown=${(e: PointerEvent) => this.handleCropContainerClick(e)}
                >
                  <!-- Waveform Canvas (background) -->
                  <canvas 
                    class="kie-crop-waveform" 
                    width="400" 
                    height="48"
                  ></canvas>
                  <!-- Playhead indicator -->
                  <div 
                    class="kie-crop-playhead ${this.isPreviewPlaying ? '' : 'hidden'}"
                    style="left: ${this.playheadPosition * 100}%;"
                  ></div>
                  <!-- Selected Range (overlay) -->
                  <div 
                    class="crop-range" 
                    style="left: ${(this.audioCropStart / Math.max(this.replayDuration, 1)) * 100}%; width: ${((this.audioCropEnd - this.audioCropStart) / Math.max(this.replayDuration, 1)) * 100}%;"
                    @pointerdown=${(e: PointerEvent) => this.handleCropDragStart(e, 'range')}
                  >
                    <!-- Start Handle -->
                    <div 
                      class="crop-handle start"
                      @pointerdown=${(e: PointerEvent) => this.handleCropDragStart(e, 'start')}
                    ></div>
                    <!-- End Handle -->
                    <div 
                      class="crop-handle end"
                      @pointerdown=${(e: PointerEvent) => this.handleCropDragStart(e, 'end')}
                    ></div>
                  </div>
                  <!-- Time Labels -->
                  <span class="crop-time-label start" style="left: ${(this.audioCropStart / Math.max(this.replayDuration, 1)) * 100}%;">
                    ${formatDuration(this.audioCropStart)}
                  </span>
                  <span class="crop-time-label end" style="right: ${100 - (this.audioCropEnd / Math.max(this.replayDuration, 1)) * 100}%;">
                    ${formatDuration(this.audioCropEnd)}
                  </span>
                </div>
                
              </div>
            </div>

            <!-- Style Input -->
            <div class="kie-form-group">
              <label>Style / Genre (optional)</label>
              <input 
                type="text" 
                class="kie-input"
                placeholder="z.B. Pop, Rock, Electronic, Ambient..."
                .value=${this.kieStyleInput}
                @input=${(e: Event) => {
                  this.kieStyleInput = (e.target as HTMLInputElement).value;
                }}
              />
              <div class="hint">Beschreibe den gewünschten Musikstil</div>
            </div>

            <!-- Lyrics Input -->
            <div class="kie-form-group">
              <label>Lyrics / Text (optional)</label>
              <textarea 
                class="kie-textarea"
                placeholder="Schreibe hier Lyrics oder lass es leer für instrumental..."
                .value=${this.kieLyricsInput}
                @input=${(e: Event) => {
                  this.kieLyricsInput = (e.target as HTMLTextAreaElement).value;
                }}
              ></textarea>
              <div class="hint">Lass das Feld leer für einen instrumentalen Song</div>
            </div>

            <!-- Submit Button -->
            <div style="text-align: center; margin-top: 8px;">
              <button 
                class="modal-btn primary" 
                @click=${this.handleKieGenerateSong}
                ?disabled=${this.replayDuration < 1}
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
                </svg>
                Song generieren
              </button>
              <div style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 12px;">
                Erstellt 2 Song-Varianten basierend auf deinen Eingaben
              </div>
            </div>
          </div>
        </div>
      `;
    };

    return html`
      <div id="replay-modal-overlay" @click=${(e: Event) => {
        if ((e.target as HTMLElement).id === 'replay-modal-overlay') {
          this.closeReplayModal();
        }
      }}>
        <div id="replay-modal">
          <div id="replay-modal-content">
            <button class="close-btn" @click=${this.closeReplayModal} title="Schließen">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" fill="currentColor"/>
              </svg>
            </button>
            <h2>Replay Buffer</h2>
            <div class="duration-info">${formatDuration(this.replayDuration)}</div>
            <div class="duration-label">Aufgenommene Zeit (max. 60 Sekunden)</div>
            <div class="status-text">${getStatusText()}</div>
            <div class="modal-buttons">
              ${this.isReplayPlaying ? html`
                <button class="modal-btn primary" @click=${this.handleReplayStop}>
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 6h12v12H6z" fill="currentColor"/>
                  </svg>
                  Stop
                </button>
              ` : html`
                <button class="modal-btn primary" @click=${this.handleReplayPlay} ?disabled=${this.replayDuration < 1}>
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 5v14l11-7z" fill="currentColor"/>
                  </svg>
                  Abspielen
                </button>
              `}
              <button class="modal-btn secondary" @click=${this.handleReplayDownload} ?disabled=${this.replayDuration < 1}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"/>
                </svg>
                Download
              </button>
              <button class="modal-btn secondary" @click=${this.closeReplayModal}>
                Schließen
              </button>
            </div>
            ${renderKieSection()}
          </div>
        </div>
      </div>
    `;
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
    const circleOutlines = this.genreCircleStack.map((circle, circleIndex) => {
      const radius = this.containerSize > 0 ? (this.containerSize * circle.radiusMultiplier) : 200;
      const centerX = this.containerSize / 2 + circle.ringOffsetX;
      const centerY = this.containerSize / 2 + circle.ringOffsetY;
      const diameter = radius * 2;
      const isActive = circleIndex === this.activeCircleIndex;

      // Calculate distance-based opacity for passive circles
      const distanceFromActive = Math.abs(circleIndex - this.activeCircleIndex);
      const distanceOpacity = distanceFromActive === 0
        ? 1 // aktiver Kreis
        : distanceFromActive === 1
          ? 0.25 // gerade so sichtbar
          : 0.08; // nur angedeutet

      const outlineColor = isActive ? '#FD7B2E' : `rgba(255, 255, 255, ${distanceOpacity})`;
      const outlineStyle = styleMap({
        left: `${centerX}px`,
        top: `${centerY}px`,
        width: `${diameter}px`,
        height: `${diameter}px`,
        opacity: `${circle.expansionProgress}`,
        borderColor: outlineColor,
      });
      
      // For passive circles, also render a label - position it outside the active circle
      if (!isActive) {
        const circleName = this.getCircleName(circleIndex);

        // Get active circle info to check for overlap
        const activeCircle = this.genreCircleStack[this.activeCircleIndex];
        const activeRadius = activeCircle ? (this.containerSize * activeCircle.radiusMultiplier) : 0;
        const activeCenterX = activeCircle ? (this.containerSize / 2 + activeCircle.ringOffsetX) : 0;
        const activeCenterY = activeCircle ? (this.containerSize / 2 + activeCircle.ringOffsetY) : 0;

        // Helper to check if a point is inside the active circle
        const isInsideActiveCircle = (x: number, y: number): boolean => {
          if (!activeCircle) return false;
          const dx = x - activeCenterX;
          const dy = y - activeCenterY;
          return Math.sqrt(dx * dx + dy * dy) < activeRadius + 20; // 20px padding for label
        };

        // Try different label positions: top, bottom, left, right
        const labelOffset = radius + 15;
        const positions = [
          { x: centerX, y: centerY - labelOffset }, // top
          { x: centerX, y: centerY + labelOffset }, // bottom
          { x: centerX - labelOffset, y: centerY }, // left
          { x: centerX + labelOffset, y: centerY }, // right
        ];

        // Find first position that's outside the active circle
        let labelPosition = positions.find(pos => !isInsideActiveCircle(pos.x, pos.y));

        // If all positions are inside the active circle, don't show the label
        if (!labelPosition) {
          return html`<div class="genre-circle-outline" style=${outlineStyle}></div>`;
        }

        const labelStyle = styleMap({
          left: `${labelPosition.x}px`,
          top: `${labelPosition.y}px`,
          opacity: `${circle.expansionProgress * distanceOpacity}`,
        });

        return html`
          <div class="genre-circle-outline" style=${outlineStyle}></div>
          <div class="circle-label" style=${labelStyle}>${circleName}</div>
        `;
      }
      
      return html`<div class="genre-circle-outline" style=${outlineStyle}></div>`;
    });

    // Only render labels for the active circle, passive circles only show outlines
    const activeItems = items.filter(item => item.circleIndex === this.activeCircleIndex);
    
    // PASS 1: Calculate fisheye scales for all items using equal-spacing positions
    const activeCircle = this.getActiveCircle();
    const radius = activeCircle && this.containerSize > 0 
      ? (this.containerSize * activeCircle.radiusMultiplier) 
      : 200;
    
    const scaleData = activeItems.map(item => {
      // Calculate position using equal spacing (original positions)
      const equalAngleStep = (Math.PI * 2) / item.total;
      const equalAngle = (item.index * equalAngleStep) - (Math.PI / 2);
      const fixedCenterX = this.containerSize / 2;
      const fixedCenterY = this.containerSize / 2;
      const ringCenterX = fixedCenterX + item.circle.ringOffsetX;
      const ringCenterY = fixedCenterY + item.circle.ringOffsetY;
      const genreX = ringCenterX + Math.cos(equalAngle) * radius;
      const genreY = ringCenterY + Math.sin(equalAngle) * radius;
      
      const fisheyeScale = this.calculateFisheyeScale(genreX, genreY, radius);
      return { ...item, fisheyeScale };
    });
    
    // Calculate total scale for proportional distribution
    const totalScale = scaleData.reduce((sum, d) => sum + d.fisheyeScale, 0);
    
    // PASS 2: Calculate proportional angles and render
    let currentAngle = -Math.PI / 2; // Start at top
    
    const genreItems = repeat(
      scaleData,
      (item) => item.key,
      (item) => {
        const { circle, circleIndex, prompt, fisheyeScale, total } = item;
        const isActive = circleIndex === this.activeCircleIndex;
        
        // Get display text first
        let displayText = prompt.text;
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
        
        // Calculate proportional arc portion based on fisheye scale
        const arcPortion = (fisheyeScale / totalScale) * (Math.PI * 2);
        const startAngle = currentAngle;
        const endAngle = currentAngle + arcPortion;
        currentAngle = endAngle; // Update for next item
        
        // Ring center position
        const fixedCenterX = this.containerSize / 2;
        const fixedCenterY = this.containerSize / 2;
        const ringCenterX = fixedCenterX + circle.ringOffsetX;
        const ringCenterY = fixedCenterY + circle.ringOffsetY;
        
        // Calculate arc path points with proportional angles
        const startX = ringCenterX + Math.cos(startAngle) * radius;
        const startY = ringCenterY + Math.sin(startAngle) * radius;
        const endX = ringCenterX + Math.cos(endAngle) * radius;
        const endY = ringCenterY + Math.sin(endAngle) * radius;
        
        // SVG arc: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
        const largeArcFlag = arcPortion > Math.PI ? 1 : 0;
        const pathId = `arc-${circle.id}-${prompt.promptId}`;
        const arcPath = `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;
        
        // Calculate font size with fisheye effect
        const baseFontSize = 12;
        const fontSize = baseFontSize * fisheyeScale;
        
        // For active circles, use weight-based opacity; for passive circles, use distance-based opacity
        const distanceFromActive = Math.abs(item.circleIndex - this.activeCircleIndex);
        const distanceOpacity = distanceFromActive === 0
          ? 1 // aktiver Kreis
          : distanceFromActive === 1
            ? 0.25 // gerade so sichtbar
            : 0.08; // nur angedeutet
        const baseOpacity = isActive ? (prompt.weight > 0.1 ? 1 : 0.3) : distanceOpacity;
        const opacity = baseOpacity * circle.expansionProgress;
        
        // Text color
        const textColor = isActive 
          ? (prompt.weight <= 0.1 ? '#ffffff' : '#FD7B2E')
          : '#ffffff';
        
        const isFiltered = this.filteredPrompts.has(prompt.text);
        const isDisabled = circle.disabledGenres.has(prompt.promptId) && !this.showingSubGenres;
        
        const textClasses = [
          isFiltered ? 'filtered' : '',
          isDisabled ? 'disabled' : '',
          !isActive ? 'inactive' : '',
        ].filter(Boolean).join(' ');
        
        const svgStyle = styleMap({
          left: '0',
          top: '0',
          width: `${this.containerSize}px`,
          height: `${this.containerSize}px`,
          opacity: `${opacity}`,
        });
        
        if (isActive) {
          return html`
            <svg class="genre-item-svg" style=${svgStyle}>
              <defs>
                <path id=${pathId} d=${arcPath} fill="none"/>
              </defs>
              <text 
                class=${textClasses}
                fill=${textColor}
                style="font-size: ${fontSize}px"
                data-prompt-id=${prompt.promptId}
                @mousedown=${(e: MouseEvent) => this.handleGenreMouseDown(prompt.promptId, e)}
                @mouseup=${this.handleGenreMouseUp}
                @mouseleave=${this.handleGenreMouseUp}
                @click=${(e: MouseEvent) => this.handleGenreClick(prompt.promptId, e)}>
                <textPath href="#${pathId}" startOffset="50%" text-anchor="middle">
                  ${displayText}
                </textPath>
              </text>
            </svg>`;
        }
        return html`
          <svg class="genre-item-svg" style=${svgStyle}>
            <defs>
              <path id=${pathId} d=${arcPath} fill="none"/>
            </defs>
            <text 
              class=${textClasses}
              fill=${textColor}
              style="font-size: ${fontSize}px"
              data-prompt-id=${prompt.promptId}>
              <textPath href="#${pathId}" startOffset="50%" text-anchor="middle">
                ${displayText}
              </textPath>
            </text>
          </svg>`;
      }
    );

    return html`${circleOutlines}${genreItems}`;
  }
}
