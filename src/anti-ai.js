class AntiAIFlows {
  constructor() {
    this.conversationPatterns = new Map();
    this.sentenceVariation = new Map();
    this.imperfectionPool = [];
    this.colloquialPool = [];
    this.lastResponse = new Map();
    this.variationIndex = new Map();

    this.colloquialMap = {
      en: {
        fillers: ['well', 'look', 'see', 'honestly', 'see here', 'listen', 'actually', 'you know', 'i mean', 'right'],
        contractions: {
          'i am': "i'm", 'you are': "you're", 'it is': "it's", 'that is': "that's",
          'do not': "don't", 'does not': "doesn't", 'did not': "didn't",
          'will not': "won't", 'would not': "wouldn't", 'could not': "couldn't",
          'should not': "shouldn't", 'have not': "haven't", 'has not': "hasn't",
          'can not': "can't", 'is not': "isn't", 'are not': "aren't",
          'we are': "we're", 'they are': "they're", 'i have': "i've",
          'you have': "you've", 'we have': "we've", 'they have': "they've",
          'i will': "i'll", 'you will': "you'll", 'he will': "he'll",
          'she will': "she'll", 'we will': "we'll", 'they will': "they'll"
        },
        casualPhrases: [
          "basically", "the thing is", "here's the deal", "what happens is",
          "the way i see it", "from what you're telling me", "based on what you said",
          "so basically", "long story short", "bottom line is", "the thing about this is"
        ],
        humanImperfections: [
          "um", "uh", "hmm", "well", "so", "like", "you know",
          "i think", "i believe", "it seems", "from what i understand"
        ]
      },
      sw: {
        fillers: ['basi', 'yuny', 'sawa', 'uhm', 'ndio', 'kweli', 'unaona', 'unasema', 'kwa mfano', 'sawa sawa'],
        contractions: {},
        casualPhrases: [
          "kwa kweli", "kama wewe unaniambia", "kwa maana",
          "jinsi ninavyoona", "kwa mujibu wa", "hivyo ndivyo",
          "kwamba", "kwa sababu", "kwa hivyo", "hivyo"
        ],
        humanImperfections: [
          "eeh", "aah", "uhm", "ndio", "sawa", "kweli",
          "kama", "labda", "pengine", "inawezekana"
        ]
      },
      kik: {
        fillers: ['atĩ', 'no', 'ũũ', 'mũno', 'ni', 'na', 'ĩ', 'gũtĩ', 'kana', 'Ũũ'],
        contractions: {},
        casualPhrases: [
          "gũkĩra", "kana", "gũtĩ", "niĩ", "ũũ", "ĩ", "na",
          "gũhĩtĩa", "kũhĩtĩa", "gũũria", "ũũ"
        ],
        humanImperfections: [
          "eeh", "aah", "ũũ", "no", "ni", "ĩ", "gũtĩ"
        ]
      },
      luo: {
        fillers: ['nade', 'eh', 'ade', 'ka', 'ni', 'gi', 'bi', 'nyo', 'da', 'en'],
        contractions: {},
        casualPhrases: [
          "ka an feyo", "gi ka nadi", "ni nadi", "en gi",
          "kaka", "nade", "eh", "ade", "ka"
        ],
        humanImperfections: [
          "eh", "ade", "nade", "ka", "ni", "gi"
        ]
      },
      kal: {
        fillers: ['awoywo', 'eh', 'ab', 'en', 'ka', 'ne', 'ko', 'eng', 'toin', 'ab'],
        contractions: {},
        casualPhrases: [
          "en ka ne", "ne", "ka", "en", "ko", "eng",
          "toin", "awoywo", "eh", "ab"
        ],
        humanImperfections: [
          "eh", "ab", "en", "ka", "ne", "ko"
        ]
      },
      som: {
        fillers: ['haa', 'eh', 'waar', 'marka', 'kadib', 'hadda', 'sidoo', 'sidaa', 'waxaa', 'laakin'],
        contractions: {},
        casualPhrases: [
          "sidaa", "kadib", "hadda", "marka", "waxaa",
          "laakin", "sidoo", "haka", "iskaa"
        ],
        humanImperfections: [
          "haa", "eh", "waar", "marka", "kadib"
        ]
      }
    };

    this.sentenceStarters = {
      en: [
        "So", "Look", "Okay", "Right", "Well", "See", "Alright",
        "Here's the thing", "Listen", "Actually", "The thing is",
        "From what you told me", "Based on what you said"
      ],
      sw: [
        "Sawa", "Ndio", "Basi", "Sawa sawa", "Kwa kweli",
        "Kama wewe unaniambia", "Kwa hivyo", "Unaona", "Kwa mfano"
      ],
      kik: [
        "Ũũ", "No", "Atĩ", "Kana", "Gũtĩ", "Mũno", "Niĩ", "Ĩ"
      ],
      luo: [
        "Nade", "Eh", "Ka", "Ade", "En", "Gi", "Bi"
      ],
      kal: [
        "Awoywo", "Eh", "Ab", "En", "Ka", "Ne", "Ko"
      ],
      som: [
        "Haa", "Waar", "Marka", "Kadib", "Hadda", "Waxaa"
      ]
    };

    this.humanPatterns = {
      en: {
        agreement: ["right", "yeah", "exactly", "that's right", "you got it", "precisely"],
        thinking: ["hmm", "let me think", "let's see", "from what I know", "if I'm not mistaken"],
        emphasis: ["definitely", "absolutely", "for sure", "no doubt", "clearly", "obviously"],
        transition: ["so here's what I think", "now look", "here's the thing", "what I'd suggest"],
        reassurance: ["don't worry", "you'll be fine", "it's going to be okay", "hang in there"]
      },
      sw: {
        agreement: ["ndio", "sawa", "kweli", "sawa sawa", "ndio kweli", "unaona"],
        thinking: ["eeh", "unaona", "kama", "labda", "pengine"],
        emphasis: ["kweli", "sawa", "ndio", "hakika", "bila shaka"],
        transition: ["sawa basi", "kwa hivyo", "sasa", "hivyo ndivyo"],
        reassurance: ["usijali", "utakuwa sawa", "mambo yatakuwa sawa", "subiri"]
      }
    };
  }

  processResponse(response, userId, language) {
    const lastResponse = this.lastResponse.get(userId);
    let processed = response;

    processed = this.applyContractions(processed, language);
    processed = this.addSentenceVariation(processed, userId, language);
    processed = this.addHumanImperfections(processed, language);
    processed = this.adjustFormality(processed, language);
    processed = this.addColloquialisms(processed, language);
    processed = this.ensureNaturalFlow(processed, lastResponse, language);

    this.lastResponse.set(userId, processed);
    return processed;
  }

  applyContractions(text, language) {
    const map = this.colloquialMap[language]?.contractions || {};
    let result = text;
    Object.entries(map).forEach(([full, short]) => {
      const regex = new RegExp(`\\b${full}\\b`, 'gi');
      result = result.replace(regex, short);
    });
    return result;
  }

  addSentenceVariation(text, userId, language) {
    const starters = this.sentenceStarters[language] || this.sentenceStarters['en'];
    const sentences = text.split(/(?<=[.!?])\s+/);

    if (sentences.length <= 1) return text;

    const variation = this.variationIndex.get(userId) || 0;
    const modified = sentences.map((sentence, i) => {
      if (i === 0 && variation % 3 !== 0) {
        const starter = starters[variation % starters.length];
        if (!sentence.toLowerCase().startsWith(starter.toLowerCase())) {
          return `${starter}, ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
        }
      }
      return sentence;
    });

    this.variationIndex.set(userId, variation + 1);
    return modified.join(' ');
  }

  addHumanImperfections(text, language) {
    const pool = this.colloquialMap[language]?.humanImperfections || this.colloquialMap['en']?.humanImperfections || [];
    if (pool.length === 0) return text;

    const shouldAdd = Math.random() < 0.15;
    if (!shouldAdd) return text;

    const sentences = text.split(/(?<=[.!?])\s+/);
    if (sentences.length <= 1) return text;

    const insertAt = Math.floor(Math.random() * sentences.length);
    const filler = pool[Math.floor(Math.random() * pool.length)];

    if (Math.random() < 0.5) {
      sentences[insertAt] = `${filler}, ${sentences[insertAt].charAt(0).toLowerCase()}${sentences[insertAt].slice(1)}`;
    } else {
      sentences[insertAt] = sentences[insertAt].replace(/\.$/, `, ${filler}.`);
    }

    return sentences.join(' ');
  }

  adjustFormality(text, language) {
    const casualPhrases = this.colloquialMap[language]?.casualPhrases || [];
    if (casualPhrases.length === 0) return text;

    const shouldCasualize = Math.random() < 0.2;
    if (!shouldCasualize) return text;

    const patterns = [
      { formal: 'It is important to note that', casual: 'The thing is' },
      { formal: 'It should be noted that', casual: 'Look' },
      { formal: 'In accordance with', casual: 'Under' },
      { formal: 'Pursuant to', casual: 'According to' },
      { formal: 'With reference to', casual: 'About' },
      { formal: 'In the event that', casual: 'If' },
      { formal: 'For the purpose of', casual: 'To' },
      { formal: 'With regard to', casual: 'About' },
      { formal: 'In consideration of', casual: 'For' },
      { formal: 'It is recommended that', casual: 'You should' }
    ];

    let result = text;
    patterns.forEach(({ formal, casual }) => {
      if (result.includes(formal)) {
        result = result.replace(formal, casual);
      }
    });

    return result;
  }

  addColloquialisms(text, language) {
    const phrases = this.colloquialMap[language]?.casualPhrases || [];
    if (phrases.length === 0) return text;

    const shouldAdd = Math.random() < 0.1;
    if (!shouldAdd) return text;

    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    const sentences = text.split(/(?<=[.!?])\s+/);

    if (sentences.length > 1) {
      const insertAt = Math.floor(Math.random() * sentences.length);
      sentences[insertAt] = `${phrase}, ${sentences[insertAt].charAt(0).toLowerCase()}${sentences[insertAt].slice(1)}`;
    }

    return sentences.join(' ');
  }

  ensureNaturalFlow(text, lastResponse, language) {
    if (!lastResponse) return text;

    const lastEnding = lastResponse.slice(-50).toLowerCase();
    const currentStart = text.slice(0, 50).toLowerCase();

    if (lastEnding.includes('court') && currentStart.includes('court')) {
      text = text.replace(/court/i, 'that same court');
    }
    if (lastEnding.includes('employer') && currentStart.includes('employer')) {
      text = text.replace(/employer/i, 'your employer');
    }

    if (text.length > 200) {
      const sentences = text.split(/(?<=[.!?])\s+/);
      if (sentences.length > 3) {
        const mid = Math.floor(sentences.length / 2);
        const transition = this.getTransitionWord(language);
        sentences[mid] = `${transition} ${sentences[mid].charAt(0).toLowerCase()}${sentences[mid].slice(1)}`;
        text = sentences.join(' ');
      }
    }

    return text;
  }

  getTransitionWord(language) {
    const transitions = {
      en: ['Also,', 'Plus,', 'And here\'s another thing:', 'Now,', 'On top of that,'],
      sw: ['Pia,', 'Na pia:', 'Sasa,', 'Kwa hivyo:'],
      kik: ['Na,', 'Gũkĩra:', 'Ĩĩ,'],
      luo: ['Ka,', 'En gi:', 'Nade,'],
      kal: ['Ka,', 'En:', 'Ab,'],
      som: ['Sidoo,', 'Waxaa kaloo ah:']
    };
    const pool = transitions[language] || transitions['en'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  getColloquialGreeting(language) {
    const greetings = {
      en: ["Hey there", "Hi", "Hello", "Hey", "What's up", "How's it going"],
      sw: ["Habari", "Jambo", "Sema", "Mambo", "Hujambo"],
      kik: ["Wamwirĩ", "Wĩ mwĩra", "Nĩ ũũ"],
      luo: ["Nade", "Nadi", "Nadi ochalo"],
      kal: ["Awoywo", "Awoywo wuok"],
      som: ["Iska warran", "Subax wanaagsan", "Salaan"]
    };
    const pool = greetings[language] || greetings['en'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  getColloquialFarewell(language) {
    const farewells = {
      en: ["Take care", "All the best", "Good luck", "Stay strong", "See you later"],
      sw: ["Kila la heri", "Ujane na heri", "Sawa", "Tuonane"],
      kik: ["Tũgatũũka", "Ũharo", "Nĩ mwega"],
      luo: ["Odok asego", "Nadi", "E mar"],
      kal: ["Kot beitech", "Awoywo", "En ka ne"],
      som: ["Nabadgelyo", "Ha noqoto", "Allaha ha la garab dhigo"]
    };
    const pool = farewells[language] || farewells['en'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  makeItHuman(text, language) {
    let result = text;

    result = result.replace(/\./g, () => {
      const r = Math.random();
      if (r < 0.05) return '...';
      if (r < 0.08) return '..';
      return '.';
    });

    result = result.replace(/!/g, () => {
      return Math.random() < 0.1 ? '!!' : '!';
    });

    const words = result.split(' ');
    if (words.length > 10 && Math.random() < 0.15) {
      const insertAt = Math.floor(Math.random() * (words.length - 2)) + 1;
      const fillers = this.colloquialMap[language]?.fillers || [];
      if (fillers.length > 0) {
        const filler = fillers[Math.floor(Math.random() * fillers.length)];
        words.splice(insertAt, 0, filler);
        result = words.join(' ');
      }
    }

    return result;
  }
}

export default AntiAIFlows;
