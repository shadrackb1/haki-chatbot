import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LanguageLibrary {
  constructor() {
    this.languages = {};
    this.violationKeywords = {};
    this.greetingPatterns = {};
    this.phrasePatterns = {};
    this.detectionCache = new Map();
    this.confidenceThreshold = 0.35;
    this.loadDictionaries();
  }

  loadDictionaries() {
    try {
      const langPath = path.join(__dirname, '..', 'data', 'local-languages.json');
      const langData = JSON.parse(fs.readFileSync(langPath, 'utf8'));
      this.languages = langData.languages || {};
      this.violationKeywords = langData.violation_keywords_multilingual || {};

      Object.keys(this.languages).forEach(code => {
        const lang = this.languages[code];
        if (lang.greetings) {
          this.greetingPatterns[code] = Object.values(lang.greetings).map(g => g.toLowerCase());
        }
      });

      this.phrasePatterns = {
        en: {
          greeting: [/^(hi|hello|hey|good\s)/i],
          help: [/\b(help|assist|support|guide|tell me|explain|what can you|advice|rights)\b/i],
          complaint: [/\b(problem|issue|complaint|wrong|unfair|not right|employer|salary|wage|fired|dismissed)\b/i],
          urgent: [/\b(urgent|emergency|now|immediately|danger|afraid|scared)\b/i],
          thanks: [/\b(thank|thanks|appreciate)\b/i],
          goodbye: [/\b(bye|goodbye|see you|later)\b/i]
        },
        sw: {
          greeting: [/^(hujambo|habari|jambo|uhoye|sijambo)/i],
          help: [/(saidia|msaada|nisaidie|ueleze|nini)/i],
          complaint: [/(tatizo|shida|ida|mbaya|sahihi|kosa|unyanyasaji|mshahara|kufukuzwa|kulipwa)/i],
          urgent: [/(haraka|sasa|hivi|karibu|ndio|muhimu|dharura|ninaogopa)/i],
          thanks: [/(asante|shukran|nashukuru|nawashukuru|pole)/i],
          goodbye: [/(kwaheri|tutaonana|baadaye|kesho|tuonane)/i]
        },
        kik: {
          greeting: [/^(wĩ mwĩra|wamwirĩ)/i],
          help: [/(gũkũhĩtĩa|gũtigwo|gũthĩĩ|ũharo|kĩriũgĩ)/i],
          complaint: [/(gũtigwo|gũtonda|gukua|kwihoka|mbeca|muhoro)/i],
          thanks: [/(nĩ ngũkũĩra|ngũkũtwarĩra|asante)/i],
          goodbye: [/(tũgatũũka|tuonane|kwaheri)/i]
        },
        luo: {
          greeting: [/^(nade|nadi|nadi ochalo)/i],
          help: [/(chiemo|kanyruok|omollo|nyuol|otieno)/i],
          complaint: [/(ngato|chiel|nango|nyaral|odiek)/i],
          thanks: [/(edego|nade|e mar|asante)/i],
          goodbye: [/(odok asego|tutaonana|kwaheri)/i]
        },
        kal: {
          greeting: [/^(awoywo|awoywo wuok)/i],
          help: [/(emboret|silany|kiplagat|bet)/i],
          complaint: [/(kiptum|kibet|rop|emboret)/i],
          thanks: [/(asante|e kina|ab asee)/i],
          goodbye: [/(kot beitech|tutaonana|kwaheri)/i]
        },
        kam: {
          greeting: [/^(ua urie|ndaa)/i],
          help: [/(ndengu|mbai|mulimo|mbeca)/i],
          complaint: [/(mbeca|muia|ndengu|mulimo)/i],
          thanks: [/(niundu ni|asante)/i],
          goodbye: [/(tuonane|kwaheri)/i]
        },
        luy: {
          greeting: [/^(mwambo|musumba)/i],
          help: [/(mbiya|musumbi|mulimu)/i],
          complaint: [/(mbiya|musumbi|nyongesa)/i],
          thanks: [/(ne mahoro|asante)/i],
          goodbye: [/(tuonane|kwaheri)/i]
        },
        gus: {
          greeting: [/^(bware|bware ekwaro)/i],
          help: [/(ngombe|omariba|nyanchama)/i],
          complaint: [/(ngombe|omariba|nyanchama)/i],
          thanks: [/(e mar|asante)/i],
          goodbye: [/(tuonane|kwaheri)/i]
        },
        som: {
          greeting: [/^(iska warran|subax|galab)/i],
          help: [/(shaqo|lakin|mushaar|xaquuqda)/i],
          complaint: [/(tacad|cagdarrimo|xilka)/i],
          thanks: [/(mahadsanid|asante)/i],
          goodbye: [/(nabadgelyo|kwaheri)/i]
        }
      };
    } catch (err) {
      console.error('[LanguageLibrary] Failed to load dictionaries:', err.message);
    }
  }

  detectLanguage(text) {
    if (!text || text.trim().length === 0) return { language: 'en', confidence: 0 };

    const normalized = text.toLowerCase().trim().replace(/[^\w\s]/g, '');
    const words = normalized.split(/\s+/).filter(w => w.length > 0);

    if (words.length === 0) return { language: 'en', confidence: 0 };

    const scores = {};

    Object.keys(this.languages).forEach(code => {
      scores[code] = 0;
    });

    Object.keys(this.greetingPatterns).forEach(code => {
      const greetings = this.greetingPatterns[code];
      if (greetings.some(g => normalized.startsWith(g) || normalized === g)) {
        scores[code] = (scores[code] || 0) + 20;
      }
    });

    Object.keys(this.phrasePatterns).forEach(code => {
      const patterns = this.phrasePatterns[code];
      Object.values(patterns).forEach(patternArray => {
        patternArray.forEach(pattern => {
          if (pattern.test(normalized)) {
            scores[code] = (scores[code] || 0) + 5;
          }
        });
      });
    });

    words.forEach(word => {
      Object.keys(this.languages).forEach(code => {
        if (code === 'en') return;
        const lang = this.languages[code];
        if (lang.work_keywords && lang.work_keywords.some(kw => kw.toLowerCase() === word)) {
          scores[code] += 3;
        }
      });
    });

    const langSpecificMarkers = {
      sw: /(mshahara|mishahara|kulipwa|haujalipwa|haunipii|hawajanilipa|kufukuzwa|unyanyasaji|ubaguzi|vitisho|matatizo|tatizo|shida|ida|dharura|haraka|sawa|ndio|hapana|namna|pia|bado|tayari|tena|sana|watu|mtu|maji|nyumba|shule|kazi|chakula|nguo|pesa|sheria|haki|dawa|hospitali|polisi|kanisa|soko|barabara|mto|milima|shamba|msitu|duka|hoteli|ofisi|kampuni|kiwanda|taifa|nchi|ninaogopa|naomba|nisaidie|nimeshindwa|wameniambia|walinzi|usiku|mchana|asubuhi|jioni|miezi|mitatu)/i,
      kik: /(muhoro|mbeca|ndungu|guoko|gutigwo|gukuhitia|wira|mweri|nthi|kiama|ruriri|njamba|mutuahi|muthii|thayu|watho|ngima|muhuko|ritho|njeru|kaburu|gitangi|gukira|uharo|kiriuugi|gutonda|gukua|kwihoka)/i,
      luo: /(wuoyi|chiemo|odiech|odhiambo|nyuol|otieno|ochieng|owino|ading|onyango|awino|anyango|ngato|chiel|nango|nyaral|dhana|chwaro|nyathi|nyarlal|edego|nade|nadi|ochalo|chenro|odiechieng|nyambura|adingo|jagero|kaudo|mbaja)/i,
      kal: /(osotwa|emboret|silany|kiplagat|bet|cheruiyot|bett|korir|koech|rop|kork|wosiket|chepkoech|jebet|kiptum|kibet|awoywo|wuok|apon|chieng)/i,
      kam: /(mulimo|mbeca|muia|ndengu|mbai|muthiani|kioko|mutua|kilonzo|malia|nyiva|waana|mwanza|mweu|mweene|ndegu)/i,
      luy: /(mabiya|musumbi|nayo|nyongesa|masinde|wanyama|barasa|mukhisa|situma|khisa|wafura|hana|khakhwe|mwanza|bakhanga|khasoka|mukasa)/i,
      gus: /(ngombe|omariba|nyanchama|ogata|keroi|omwanchang|omosuba|omochana|omwana|nkoma|kiiro|mosioka)/i,
      som: /(shaqo|lakin|mushaar|shaqaale|hakka|caruur|xoolo|kheyraad|dhaqaale|ganacsi|ciidamada|booliiska|maamulka|maxkamadda|xaquuqda|sharciga|tacad|kala|duwanaanta|iska|warran|subax|galab|fiidnimo|mahadsanid|nabadgelyo|ninaogopa)/i
    };

    Object.keys(langSpecificMarkers).forEach(code => {
      const matches = normalized.match(langSpecificMarkers[code]);
      if (matches) {
        scores[code] = (scores[code] || 0) + matches.length * 10;
      }
    });

    let bestLang = 'en';
    let bestScore = 0;
    let secondBest = 0;

    Object.keys(scores).forEach(code => {
      if (scores[code] > bestScore) {
        secondBest = bestScore;
        bestScore = scores[code];
        bestLang = code;
      } else if (scores[code] > secondBest) {
        secondBest = scores[code];
      }
    });

    const confidence = bestScore > 0 ? (bestScore - secondBest) / bestScore : 0;

    if (confidence < this.confidenceThreshold) {
      return {
        language: this.languages[bestLang]?.fallback_to || 'en',
        confidence: confidence,
        detected: bestLang,
        fallback: true
      };
    }

    return {
      language: bestLang,
      confidence: Math.min(confidence, 1),
      detected: bestLang,
      fallback: false
    };
  }

  getLanguageInfo(code) {
    return this.languages[code] || this.languages['en'];
  }

  getWelcomeMessage(code) {
    const lang = this.languages[code] || this.languages['en'];
    return lang.welcome_message || this.languages['en'].welcome_message;
  }

  getHelpText(code) {
    const lang = this.languages[code] || this.languages['en'];
    return lang.help_text || this.languages['en'].help_text;
  }

  getGreeting(code) {
    const lang = this.languages[code] || this.languages['en'];
    if (lang.greetings) {
      return lang.greetings.hello || 'Hello';
    }
    return 'Hello';
  }

  getViolationKeywords(violationType, language) {
    const keywords = this.violationKeywords[violationType];
    if (!keywords) return [];

    if (keywords[language]) return keywords[language];

    const langInfo = this.languages[language];
    if (langInfo && langInfo.fallback_to) {
      return keywords[langInfo.fallback_to] || keywords['en'] || [];
    }

    return keywords['en'] || [];
  }

  translateViolationType(type, language) {
    const translations = {
      WAGE_VIOLATION: {
        en: 'Wage Violation',
        sw: 'Ukiukaji wa Mishahara',
        kik: 'Gũtigwo Mbeca',
        luo: 'Chieno Wuoyi',
        kal: 'Emboret',
        kam: 'Mbeca',
        luy: 'Mbiya',
        gus: 'Omariba',
        mer: 'Mbeca',
        som: 'Mushaar Laakin'
      },
      UNFAIR_DISMISSAL: {
        en: 'Unfair Dismissal',
        sw: 'Kufukuzwa Kwa Usababu',
        kik: 'Gũtigwo Gũkĩra',
        luo: 'Nyuol Ka Chiel',
        kal: 'Emboret Ka Silany',
        kam: 'Mulimo',
        luy: 'Mabuyu',
        gus: 'Ngombe',
        mer: 'Gũtigwo',
        som: 'Xilka Shaqo'
      },
      HARASSMENT: {
        en: 'Harassment',
        sw: 'Unyanyasaji',
        kik: 'Unyanyasaji',
        luo: 'Ngato',
        kal: 'Kiptum',
        kam: 'Unyanyasaji',
        luy: 'Khasoka',
        gus: 'Kiiro',
        mer: 'Unyanyasaji',
        som: 'Cagdarrimo'
      },
      CHILD_LABOUR: {
        en: 'Child Labour',
        sw: 'Kazi ya Watoto',
        kik: 'Wĩra wa Ciiana',
        luo: 'Dhana Ka Chwaro',
        kal: 'Kork Ka Wosiket',
        kam: 'Waana',
        luy: 'Hana',
        gus: 'Omosuba',
        mer: 'Wĩra wa Ciiana',
        som: 'Carruur Shaqo'
      },
      DISCRIMINATION: {
        en: 'Discrimination',
        sw: 'Ubaguzi',
        kik: 'Ubaguzi',
        luo: 'Ngato',
        kal: 'Kibet',
        kam: 'Ubaguzi',
        luy: 'Ubaguzi',
        gus: 'Ubaguzi',
        mer: 'Ubaguzi',
        som: 'Kala Duwanaan'
      },
      SAFETY_VIOLATION: {
        en: 'Safety Violation',
        sw: 'Ukiukaji wa Usalama',
        kik: 'Gũtigwo Ũtigithĩ',
        luo: 'Chieno Ngato',
        kal: 'Kiitab Ka Emboret',
        kam: 'Kihoti',
        luy: 'Mukasa',
        gus: 'Kiiro',
        mer: 'Gũtigwo Ũtigithĩ',
        som: 'Nabadgelyo Laakin'
      },
      WORKING_HOURS: {
        en: 'Working Hours Violation',
        sw: 'Ukiukaji wa Masaa ya Kazi',
        kik: 'Gũtigwo Masaa ma Wĩra',
        luo: 'Chieno Masaa',
        kal: 'Toin Ka Emboret',
        kam: 'Masaa',
        luy: 'Masaa',
        gus: 'Ngombe',
        mer: 'Gũtigwo Masaa',
        som: 'Saacadood Shaqo'
      }
    };

    return translations[type]?.[language] || translations[type]?.['en'] || type;
  }

  getSupportedLanguages() {
    return Object.keys(this.languages).map(code => ({
      code,
      name: this.languages[code].name,
      native_name: this.languages[code].native_name,
      family: this.languages[code].family,
      region: this.languages[code].region,
      speakers: this.languages[code].speakers
    }));
  }

  isSupportedLanguage(code) {
    return !!this.languages[code];
  }

  getLanguageByFamily(family) {
    return Object.keys(this.languages)
      .filter(code => this.languages[code].family === family)
      .map(code => ({ code, ...this.languages[code] }));
  }
}

export default LanguageLibrary;
