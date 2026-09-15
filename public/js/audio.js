// Sistema de Efeitos Sonoros com Controle de Mudo (Web Audio API)
class ScoreboardSound {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('placar_muted') === 'true';
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('placar_muted', this.muted);
    return this.muted;
  }

  // Apito Fox 40 de Árbitro
  playWhistle(duration = 0.5) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(2600, now);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(3100, now);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(32, now);
      lfoGain.gain.setValueAtTime(140, now);

      lfo.connect(osc1.frequency);
      lfo.connect(osc2.frequency);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4600, now);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(filter);
      filter.connect(this.ctx.destination);

      lfo.start(now);
      osc1.start(now);
      osc2.start(now);

      lfo.stop(now + duration);
      osc1.stop(now + duration);
      osc2.stop(now + duration);
    } catch (e) {
      console.warn('Erro ao tocar apito:', e);
    }
  }

  // Apito Duplo de Fim de Partida
  playFinalWhistle() {
    if (this.muted) return;
    this.playWhistle(0.35);
    setTimeout(() => {
      this.playWhistle(0.6);
    }, 450);
  }

  // Som simples e alegre ao Adicionar Ponto (+1)
  playPointAdd() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.08); // B5

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {
      console.warn('Erro som ponto add:', e);
    }
  }

  // Som sutil e suave ao Diminuir Ponto (-1)
  playPointSub() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(329.63, now); // E4
      osc.frequency.exponentialRampToValueAtTime(220.00, now + 0.08); // A3

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {
      console.warn('Erro som ponto sub:', e);
    }
  }
}

window.sound = new ScoreboardSound();

// Inicializa áudio no primeiro clique do usuário
document.addEventListener('click', () => {
  window.sound.init();
}, { once: true });
