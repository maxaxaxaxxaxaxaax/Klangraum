/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement, svg } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { PlaybackState } from '../types';

@customElement('play-pause-button')
export class PlayPauseButton extends LitElement {

  @property({ type: String }) playbackState: PlaybackState = 'stopped';
  @property({ type: Boolean, reflect: true }) active = false;

  static override styles = css`
    :host {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    :host(:hover) .button-circle {
      transform: scale(1.05);
    }
    .button-circle {
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
      pointer-events: all;
    }
    :host([active="true"]) .button-circle {
      background: #ff0000;
      border-color: #ff0000;
    }
    .icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
    }
    svg {
      width: 100%;
      height: 100%;
    }
    .hitbox {
      pointer-events: all;
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      cursor: pointer;
    }
    .loader {
      stroke: #ffffff;
      stroke-width: 3;
      stroke-linecap: round;
      animation: spin linear 1s infinite;
      transform-origin: center;
      transform-box: fill-box;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(359deg); }
    }
  `;

  private renderPause() {
    return html`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
      <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
    </svg>`;
  }

  private renderPlay() {
    return html`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 5v14l11-7z" fill="currentColor"/>
    </svg>`;
  }

  private renderLoading() {
    return svg`<path shape-rendering="crispEdges" class="loader" d="M70,74.2L70,74.2c-10.7,0-19.5-8.7-19.5-19.5l0,0c0-10.7,8.7-19.5,19.5-19.5
            l0,0c10.7,0,19.5,8.7,19.5,19.5l0,0"/>`;
  }

  private renderIcon() {
    if (this.playbackState === 'playing') {
      return this.renderPause();
    } else if (this.playbackState === 'loading') {
      return this.renderLoading();
    } else {
      return this.renderPlay();
    }
  }

  override updated(changedProperties: Map<string | number | symbol, unknown>) {
    if (changedProperties.has('playbackState')) {
      this.active = this.playbackState === 'playing';
    }
  }

  override render() {
    return html`
      <div class="button-circle">
        <div class="icon">
          ${this.renderIcon()}
        </div>
      </div>
      <div class="hitbox"></div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'play-pause-button': PlayPauseButton
  }
}
