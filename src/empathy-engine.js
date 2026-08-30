class EmpathyEngine {
  constructor() {
    this.sentimentHistory = new Map();
    this.emotionalState = new Map();
    this.culturalContext = new Map();
    this.responseStyle = new Map();

    this.empathyLevels = {
      neutral: 0.3,
      positive: 0.4,
      negative: 0.7,
      fearful: 0.9,
      angry: 0.8,
      sad: 0.85,
      hopeful: 0.5
    };

    this.culturalExpressions = {
      en: {
        acknowledge: [
          "I hear you.",
          "I understand this is difficult.",
          "That must be really hard.",
          "You don't deserve this.",
          "This is not your fault.",
          "You're doing the right thing by speaking up."
        ],
        encourage: [
          "You have rights, and they matter.",
          "The law protects you.",
          "You are not alone in this.",
          "There are people who can help.",
          "Your voice matters.",
          "You deserve better."
        ],
        comfort: [
          "Take your time. I'm here to help.",
          "It's okay to feel this way.",
          "You're being very brave.",
          "One step at a time.",
          "We'll figure this out together."
        ]
      },
      sw: {
        acknowledge: [
          "Naelewa.",
          "Ninaelewa hili ni gumu.",
          "Hii ni ngumu sana.",
          "Hustahili hii.",
          "Sio la kwako.",
          "Unafanya vema kwa kusema ukweli."
        ],
        encourage: [
          "Una haki, na zina umuhimu.",
          "Sheria inakulinda.",
          "Huko peke yako.",
          "Kuna watu wanaweza kukusaidia.",
          "Sauti yako ina umuhimu.",
          "Unastahili bora zaidi."
        ],
        comfort: [
          "Chukua muda wako. Niko hapa kukusaidia.",
          "Ni sawa kuhisi hivi.",
          "Unajiamini sana.",
          "Hatua kwa hatua.",
          "Tutatatua pamoja."
        ]
      },
      kik: {
        acknowledge: [
          "Nĩngũũria.",
          "Nĩngũũria gũkĩra gũkĩra.",
          "Ũũ nĩũkĩra mũno.",
          "Ndũkũrĩkĩa ũũ.",
          "Ndũkũũrĩte.",
          "Wĩ gũkũũria gũkĩra."
        ],
        encourage: [
          "Ũna haki, na cio nĩĩnĩ.",
          "Sharia nĩĩkũrinda.",
          "Ndũũko irĩ.",
          "Kũna andũ makũũhĩtĩa.",
          "Ũthĩĩmũ yaku nĩĩnĩ.",
          "Ũkĩrĩa ũharo ũngĩ."
        ],
        comfort: [
          "Twara ũthĩĩ. Nĩngũkũhĩtĩa.",
          "Nĩ mwega gũhĩtĩa ũũ.",
          "Wĩ nĩ mũno.",
          "Gĩtangĩ na gĩtangĩ.",
          "Tũũtũũĩarĩ na gũkĩra."
        ]
      },
      luo: {
        acknowledge: [
          "An feyo.",
          "An feyo ka chieno nade.",
          "Chieno en chiemo mor.",
          "Ni nadi chieno.",
          "Ni nadi chieno ka.",
          "Nadi chiemo kaka onge."
        ],
        encourage: [
          "Ni nadi gi chiemo.",
          "An gi ka nadi omollo.",
          "Ni nadi ngato.",
          "Ni nadi gi omollo.",
          "Ni nadi gi chiemo.",
          "Ni nadi gi mor."
        ],
        comfort: [
          "Gin kalocha. Nadi ngato.",
          "Nade gi mor.",
          "Nadi gi mor.",
          "Ka ka ka.",
          "An gi ka nadi."
        ]
      },
      kal: {
        acknowledge: [
          "An feyo.",
          "An feyo ka ne.",
          "En ka ne ne.",
          "En ka ne ne.",
          "En ka ne ne.",
          "En ka ne ne."
        ],
        encourage: [
          "En ka ne ne.",
          "En ka ne ne.",
          "En ka ne ne.",
          "En ka ne ne.",
          "En ka ne ne.",
          "En ka ne ne."
        ],
        comfort: [
          "En ka ne ne.",
          "En ka ne ne.",
          "En ka ne ne.",
          "En ka ne ne.",
          "En ka ne ne."
        ]
      }
    };

    this.sentimentResponses = {
      positive: {
        tone: 'warm',
        pace: 'normal',
        detail: 'moderate',
        empathy: 0.4
      },
      neutral: {
        tone: 'helpful',
        pace: 'normal',
        detail: 'moderate',
        empathy: 0.3
      },
      negative: {
        tone: 'empathetic',
        pace: 'slower',
        detail: 'thorough',
        empathy: 0.7
      },
      fearful: {
        tone: 'gentle',
        pace: 'slow',
        detail: 'detailed',
        empathy: 0.9
      },
      angry: {
        tone: 'calm',
        pace: 'measured',
        detail: 'focused',
        empathy: 0.8
      },
      sad: {
        tone: 'compassionate',
        pace: 'slow',
        detail: 'supportive',
        empathy: 0.85
      }
    };
  }

  processSentiment(userId, message, previousSentiment) {
    const currentSentiment = this.classifySentiment(message);
    const emotionalShift = this.detectEmotionalShift(userId, currentSentiment);
    const empathyLevel = this.getEmpathyLevel(currentSentiment);
    const responseStyle = this.getResponseStyle(currentSentiment, emotionalShift);

    if (!this.sentimentHistory.has(userId)) {
      this.sentimentHistory.set(userId, []);
    }
    if (!this.emotionalState.has(userId)) {
      this.emotionalState.set(userId, { current: 'neutral', shifts: 0 });
    }

    const history = this.sentimentHistory.get(userId);
    history.push({ sentiment: currentSentiment, timestamp: Date.now() });
    if (history.length > 10) history.splice(0, history.length - 10);

    const state = this.emotionalState.get(userId);
    state.current = currentSentiment;
    if (emotionalShift) state.shifts++;

    return {
      sentiment: currentSentiment,
      empathyLevel,
      responseStyle,
      emotionalShift,
      shouldComfort: currentSentiment === 'fearful' || currentSentiment === 'sad',
      shouldEncourage: currentSentiment === 'negative' || state.shifts >= 2,
      shouldDeescalate: currentSentiment === 'angry',
      culturalTone: this.getCulturalTone(userId),
      sentimentTrend: history.slice(-3).map(h => h.sentiment)
    };
  }

  classifySentiment(message) {
    const patterns = {
      positive: [
        /(?:thank|thanks|good|great|helpful|appreciate|happy|glad|excellent|wonderful|amazing|poa|sawa|nzuri)/i,
        /(?:asante|shukran|nashukuru|edego|mahadsanid)/i
      ],
      negative: [
        /(?:bad|terrible|awful|horrible|worst|hate|angry|furious|frustrated|upset|sad|depressed|pain|hurt)/i,
        /(?:mbaya|baya|hasira|uchungu|machozi|huzuni|kero|mateke|ngato|chiel)/i
      ],
      fearful: [
        /(?:afraid|scared|fear|terrified|panic|anxious|worried|nervous|threatened|danger|hide|escape)/i,
        /(?:hofu|woga|tishio|wasiwasi|khofu)/i
      ],
      angry: [
        /(?:furious|outraged|rage|hate|livid|mad|fuming|enraged|incensed)/i,
        /(?:hasira|chuki|wazimu|nyongo)/i
      ],
      sad: [
        /(?:sad|depressed|hopeless|desperate|helpless|worthless|alone|lonely|cry|tears)/i,
        /(?:huzuni|machozi|upweke|taabu)/i
      ]
    };

    for (const [sentiment, pats] of Object.entries(patterns)) {
      const matches = pats.filter(p => p.test(message)).length;
      if (matches > 0) return sentiment;
    }
    return 'neutral';
  }

  detectEmotionalShift(userId, currentSentiment) {
    const history = this.sentimentHistory.get(userId) || [];
    if (history.length === 0) return false;

    const lastSentiment = history[history.length - 1]?.sentiment;
    if (lastSentiment && lastSentiment !== currentSentiment) {
      const escalation = ['neutral', 'positive', 'negative', 'fearful', 'angry', 'sad'];
      const lastIndex = escalation.indexOf(lastSentiment);
      const currentIndex = escalation.indexOf(currentSentiment);
      return currentIndex > lastIndex;
    }
    return false;
  }

  getEmpathyLevel(sentiment) {
    return this.empathyLevels[sentiment] || 0.3;
  }

  getResponseStyle(sentiment, emotionalShift) {
    const style = { ...this.sentimentResponses[sentiment] || this.sentimentResponses.neutral };
    if (emotionalShift) {
      style.empathy = Math.min(style.empathy + 0.2, 1);
      style.pace = 'slower';
    }
    return style;
  }

  getCulturalTone(userId) {
    return this.culturalContext.get(userId) || 'formal';
  }

  setCulturalContext(userId, language) {
    const informalLanguages = ['kik', 'luo', 'kam', 'luy', 'gus', 'mer', 'emb', 'kal', 'som'];
    this.culturalContext.set(userId, informalLanguages.includes(language) ? 'community' : 'formal');
  }

  generateEmpathicPrefix(sentiment, language) {
    const expressions = this.culturalExpressions[language] || this.culturalExpressions['en'];
    const pool = expressions.acknowledge || expressions.acknowledge;

    if (sentiment === 'fearful' || sentiment === 'sad') {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    if (sentiment === 'negative') {
      return (expressions.acknowledge || [])[Math.floor(Math.random() * (expressions.acknowledge || []).length)] || '';
    }
    if (sentiment === 'angry') {
      return (expressions.comfort || [])[Math.floor(Math.random() * (expressions.comfort || []).length)] || '';
    }
    return '';
  }

  generateEncouragement(language) {
    const expressions = this.culturalExpressions[language] || this.culturalExpressions['en'];
    const pool = expressions.encourage || [];
    return pool[Math.floor(Math.random() * pool.length)] || '';
  }

  generateComfort(language) {
    const expressions = this.culturalExpressions[language] || this.culturalExpressions['en'];
    const pool = expressions.comfort || [];
    return pool[Math.floor(Math.random() * pool.length)] || '';
  }

  formatLegalInfoWithEmpathy(legalInfo, sentiment, language) {
    const prefix = this.generateEmpathicPrefix(sentiment, language);
    const encouragement = this.generateEncouragement(language);

    let formatted = '';
    if (prefix) formatted += prefix + '\n\n';
    formatted += legalInfo;
    if (encouragement) formatted += '\n\n' + encouragement;

    return formatted;
  }

  getSentimentInsights(userId) {
    const history = this.sentimentHistory.get(userId) || [];
    const state = this.emotionalState.get(userId) || { current: 'neutral', shifts: 0 };

    return {
      current: state.current,
      shifts: state.shifts,
      trend: history.slice(-5).map(h => h.sentiment),
      isDistressed: state.current === 'fearful' || state.current === 'sad',
      needsExtraCare: state.shifts >= 2 || state.current === 'fearful'
    };
  }

  reset(userId) {
    this.sentimentHistory.delete(userId);
    this.emotionalState.delete(userId);
  }
}

export default EmpathyEngine;
