// Sistema de Efeitos Sonoros Ultra-Resiliente (Web Audio API)
// Não trava ou para de funcionar por inatividade do navegador
class ScoreboardSound {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('placar_muted') === 'true';
  }

  getContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } catch (e) {
      console.warn('Erro ao inicializar AudioContext:', e);
    }
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('placar_muted', this.muted);
    return this.muted;
  }

  // Apito Fox 40 de Árbitro
  playWhistle(duration = 0.5) {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

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
      filter.connect(ctx.destination);

      lfo.start(now);
      osc1.start(now);
      osc2.start(now);

      lfo.stop(now + duration);
      osc1.stop(now + duration);
      osc2.stop(now + duration);

      // Limpeza de nós de áudio após tocar
      setTimeout(() => {
        try {
          osc1.disconnect();
          osc2.disconnect();
          lfo.disconnect();
          gain.disconnect();
          filter.disconnect();
        } catch (_) {}
      }, (duration + 0.1) * 1000);
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
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.08); // B5

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);

      setTimeout(() => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (_) {}
      }, 200);
    } catch (e) {
      console.warn('Erro som ponto add:', e);
    }
  }

  // Som sutil e suave ao Diminuir Ponto (-1)
  playPointSub() {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(329.63, now); // E4
      osc.frequency.exponentialRampToValueAtTime(220.00, now + 0.08); // A3

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);

      setTimeout(() => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (_) {}
      }, 200);
    } catch (e) {
      console.warn('Erro som ponto sub:', e);
    }
  }
}

window.sound = new ScoreboardSound();

// Mantém o contexto de áudio sempre ativo e desperto a cada toque ou clique
['click', 'pointerdown', 'keydown', 'touchstart'].forEach((eventType) => {
  window.addEventListener(eventType, () => {
    if (window.sound) {
      window.sound.getContext();
    }
  }, { passive: true });
});
