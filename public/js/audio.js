// Sistema de Efeitos Sonoros usando Web Audio API nativa
// Não requer download de nenhum arquivo de áudio externo!

class SportsSoundSystem {
  constructor() {
    this.ctx = null;
    this.soundEnabled = true;
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  play(type) {
    if (!this.soundEnabled) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      switch (type) {
        case 'point':
          this.playPointSound();
          break;
        case 'whistle':
          this.playRefereeWhistle();
          break;
        case 'buzzer':
          this.playStadiumBuzzer();
          break;
        case 'set_won':
          this.playSetWonFanfare();
          break;
        case 'match_won':
          this.playMatchWonFanfare();
          break;
      }
    } catch (e) {
      console.warn('Erro ao reproduzir som:', e);
    }
  }

  // Toque suave para pontuação
  playPointSound() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.12); // A5

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  // Apito de árbitro realista (frequências duplas com tremolo/modulação de esfera)
  playRefereeWhistle() {
    const now = this.ctx.currentTime;
    const duration = 0.55;

    // Frequências clássicas do apito esportivo Fox 40
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const masterGain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(2600, now);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(3100, now);

    // Modulador para simular a esfera ("pea") do apito vibrando
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(35, now);
    lfoGain.gain.setValueAtTime(150, now);

    lfo.connect(osc1.frequency);
    lfo.connect(osc2.frequency);

    // Envoltória de volume
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.4, now + 0.04);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Filtro passa-baixa para suavizar o timbre
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4500, now);

    osc1.connect(masterGain);
    osc2.connect(masterGain);
    masterGain.connect(filter);
    filter.connect(this.ctx.destination);

    lfo.start(now);
    osc1.start(now);
    osc2.start(now);

    lfo.stop(now + duration);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  }

  // Buzina de estádio (timeout / fim de período)
  playStadiumBuzzer() {
    const now = this.ctx.currentTime;
    const duration = 0.8;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(130, now + duration);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.05);
    gain.gain.setValueAtTime(0.45, now + duration - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);

    osc.connect(gain);
    gain.connect(filter);
    filter.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  // Fanfarra de Set Vencido
  playSetWonFanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.4);
      }, idx * 110);
    });
  }

  // Fanfarra de Vitória da Partida
  playMatchWonFanfare() {
    this.playRefereeWhistle();
    setTimeout(() => {
      this.playSetWonFanfare();
    }, 600);
    setTimeout(() => {
      this.playStadiumBuzzer();
    }, 1200);
  }
}

window.soundSystem = new SportsSoundSystem();

// Inicializar áudio no primeiro clique do usuário
document.addEventListener('click', () => {
  window.soundSystem.initContext();
}, { once: true });
