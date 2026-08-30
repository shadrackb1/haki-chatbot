class IQEngine {
  constructor() {
    this.conversationMemory = new Map();
    this.contextStack = new Map();
    this.intentHistory = new Map();
    this.escalationTracker = new Map();
    this.reasoningDepth = 3;
    this.maxMemoryTurns = 20;
    this.intentPatterns = {
      REPORT_VIOLATION: [
        /(?:they|i|my boss|employer|supervisor|manager)\s+(?:did|does|is|are|have|has|had|won't|refuse|deny|beat|force|intimidate|threaten|cheat|steal|owe|fire|dismiss|sack)/i,
        /(?:unpaid|underpaid|not paid|no pay|delayed|owe|arrears|deduction)/i,
        /(?:fired|dismissed|sacked|terminated|let go|kicked out|lost job)/i,
        /(?:harass|abuse|bully|threat|intimidate|beat|assault|sexual)/i,
        /(?:child|minor|underage|young|school)\s+(?:labor|labour|work|job)/i,
        /(?:unsafe|dangerous|hazard|accident|injury|no.*protective|no.*equipment|no.*helmet|no.*boots)/i,
        /(?:discriminat|tribal|ethnic|racist|gender|pregnant|disability|female)/i,
        /(?:overtime|extra.*hours|night.*shift|no.*break|no.*rest|long.*hours)/i
      ],
      SEEK_ADVICE: [
        /(?:what|how|can|should|do|does|is|are)\s+(?:i|we|my|me)\s+(?:do|go|report|file|claim|get|find|contact|call)/i,
        /(?:right|rights|entitled|legal|law|act|section|court|labour)/i,
        /(?:where|how)\s+(?:do|can|should)\s+(?:i|we)\s+(?:report|go|file|complain|sue)/i,
        /(?:help|assist|guide|advise|advise|recommend|suggest)/i
      ],
      CHECK_STATUS: [
        /(?:status|update|progress|follow.?up|track|where.*case|what.*happen)/i,
        /(?:how.*long|when|timeline|deadline|next.*step)/i
      ],
      EMERGENCY: [
        /(?:urgent|emergency|immediately|right now|help me|danger|scared|afraid|threatened)/i,
        /(?:police|hospital|run|escape|hide|safe|security)/i,
        /(?:dharura|haraka|sasa|ninaogopa|tishio|nguvu|polisi|hospitali|kuhama|kujificha|usalama)/i,
        /(?:ninaogopa|tafadhali|nisaidie|sasa|hivi|karibu|ndio|muhimu)/i
      ],
      GREETING: [
        /^(?:hi|hello|hey|jambo|hujambo|habari|good\s+(?:morning|afternoon|evening))/i,
        /^(?:nade|awoywo|wamwirĩ|bware|ua urie|sopa)/i
      ],
      THANKS: [
        /(?:thank|thanks|appreciate|asante|shukran|nashukuru|edego|mahadsanid)/i
      ],
      GOODBYE: [
        /(?:bye|goodbye|see you|later|kwaheri|tutaonana|odok asego|kot beitech)/i
      ]
    };
  }

  processMessage(userId, message, language, conversationHistory) {
    if (!this.conversationMemory.has(userId)) {
      this.conversationMemory.set(userId, []);
    }
    if (!this.contextStack.has(userId)) {
      this.contextStack.set(userId, { topics: [], sentiment: 'neutral', urgency: 0 });
    }
    if (!this.intentHistory.has(userId)) {
      this.intentHistory.set(userId, []);
    }
    if (!this.escalationTracker.has(userId)) {
      this.escalationTracker.set(userId, { level: 0, turns: 0, unresolved: 0 });
    }

    const memory = this.conversationMemory.get(userId);
    const context = this.contextStack.get(userId);
    const intents = this.intentHistory.get(userId);
    const escalation = this.escalationTracker.get(userId);

    memory.push({
      message,
      language,
      timestamp: Date.now(),
      role: 'user'
    });

    if (memory.length > this.maxMemoryTurns) {
      memory.splice(0, memory.length - this.maxMemoryTurns);
    }

    const detectedIntents = this.detectIntents(message);
    const sentiment = this.analyzeSentiment(message);
    const urgency = this.assessUrgency(message, detectedIntents);
    const topic = this.extractTopic(message, detectedIntents);

    context.sentiment = sentiment;
    context.urgency = Math.max(context.urgency, urgency);
    if (topic && !context.topics.includes(topic)) {
      context.topics.push(topic);
      if (context.topics.length > 5) context.topics.shift();
    }

    intents.push({
      intents: detectedIntents,
      sentiment,
      urgency,
      topic,
      timestamp: Date.now()
    });

    escalation.turns++;
    if (detectedIntents.includes('REPORT_VIOLATION')) {
      escalation.level = Math.min(escalation.level + 1, 5);
      escalation.unresolved++;
    }
    if (detectedIntents.includes('EMERGENCY')) {
      escalation.level = 5;
    }

    const contextSummary = this.buildContextSummary(userId);
    const reasoningChain = this.buildReasoningChain(userId, detectedIntents, sentiment, urgency);
    const suggestedResponse = this.suggestResponseType(userId, detectedIntents, sentiment, urgency, escalation);

    return {
      intents: detectedIntents,
      sentiment,
      urgency,
      topic,
      contextSummary,
      reasoningChain,
      suggestedResponse,
      escalation: { ...escalation },
      shouldEscalate: escalation.level >= 3 || urgency >= 4,
      shouldOfferHelp: escalation.level >= 2 || sentiment === 'negative' || urgency >= 3,
      followUpQuestions: this.generateFollowUp(userId, detectedIntents, topic, memory),
      memorySize: memory.length,
      turnCount: escalation.turns
    };
  }

  detectIntents(message) {
    const intents = [];
    Object.entries(this.intentPatterns).forEach(([intent, patterns]) => {
      if (patterns.some(p => p.test(message))) {
        intents.push(intent);
      }
    });
    if (intents.length === 0) intents.push('UNKNOWN');
    return intents;
  }

  analyzeSentiment(message) {
    const positive = [
      /(?:thank|thanks|good|great|helpful|appreciate|happy|glad|excellent|wonderful|amazing)/i,
      /(?:asante|shukran|nashukuru|edego|mahadsanid|nzuri|vizuri|poa|sawa)/i
    ];
    const negative = [
      /(?:bad|terrible|awful|horrible|worst|hate|angry|furious|frustrated|upset|sad|depressed)/i,
      /(?:mbaya|baya|hasira|uchungu|machozi|huzuni|kero|mateke|ngato|chiel)/i
    ];
    const fear = [
      /(?:afraid|scared|fear|terrified|panic|anxious|worried|nervous|threatened)/i,
      /(?:hofu|woga|tishio|wasiwasi|khofu|ngato)/i
    ];

    const posCount = positive.filter(p => p.test(message)).length;
    const negCount = negative.filter(p => p.test(message)).length;
    const fearCount = fear.filter(p => p.test(message)).length;

    if (fearCount > 0) return 'fearful';
    if (negCount > posCount) return 'negative';
    if (posCount > negCount) return 'positive';
    return 'neutral';
  }

  assessUrgency(message, intents) {
    let urgency = 1;

    if (intents.includes('EMERGENCY')) urgency = 5;
    else if (intents.includes('REPORT_VIOLATION')) urgency = 3;

    if (/(?:now|immediately|urgent|haraka|sasa|right away|emergency)/i.test(message)) {
      urgency = Math.min(urgency + 2, 5);
    }
    if (/(?:danger|scared|afraid|threatened|violence|force|intimidate)/i.test(message)) {
      urgency = Math.min(urgency + 1, 5);
    }
    if (/(?:child|minor|underage|pregnant|disabled)/i.test(message)) {
      urgency = Math.min(urgency + 1, 5);
    }

    return urgency;
  }

  extractTopic(message, intents) {
    const topicPatterns = {
      wages: /(?:wage|salary|pay|paid|unpaid|money|owe|mshahara|mbeca|wuoyi|osotwa)/i,
      dismissal: /(?:fired|dismissed|sacked|terminated|lost job|kufukuzwa|gutigwo|nyuol)/i,
      harassment: /(?:harass|abuse|threat|violence|intimidate|bully|sexual|unyanyasaji|ngato)/i,
      safety: /(?:accident|injury|safety|protective|equipment|danger|hazard|ajali|usalama)/i,
      hours: /(?:hours|overtime|shift|break|rest|night|masaa|zamu)/i,
      child_labour: /(?:child|children|minor|underage|young|mtoto|watoto|dhana)/i,
      discrimination: /(?:discriminat|tribal|ethnic|racial|gender|pregnant|ubaguzi)/i,
      rights: /(?:right|rights|entitled|legal|law|act|section|haki|sheria)/i
    };

    for (const [topic, pattern] of Object.entries(topicPatterns)) {
      if (pattern.test(message)) return topic;
    }

    if (intents.includes('REPORT_VIOLATION')) return 'violation';
    if (intents.includes('SEEK_ADVICE')) return 'advice';
    return 'general';
  }

  buildContextSummary(userId) {
    const memory = this.conversationMemory.get(userId) || [];
    const context = this.contextStack.get(userId) || {};
    const intents = this.intentHistory.get(userId) || [];

    const recentIntents = intents.slice(-5).map(i => i.intents).flat();
    const topicHistory = context.topics || [];
    const sentimentTrend = intents.slice(-3).map(i => i.sentiment);

    return {
      totalTurns: memory.length,
      recentIntents: [...new Set(recentIntents)],
      topicHistory,
      sentimentTrend,
      dominantSentiment: this.getMostCommon(sentimentTrend),
      hasReportedViolation: recentIntents.includes('REPORT_VIOLATION'),
      hasAskedForAdvice: recentIntents.includes('SEEK_ADVICE'),
      isUrgent: recentIntents.includes('EMERGENCY'),
      unresolvedIssues: this.escalationTracker.get(userId)?.unresolved || 0
    };
  }

  buildReasoningChain(userId, intents, sentiment, urgency) {
    const chain = [];
    const context = this.contextStack.get(userId) || {};
    const escalation = this.escalationTracker.get(userId) || {};

    if (intents.includes('GREETING')) {
      chain.push('User greeted bot - respond warmly and ask how to help');
    }

    if (intents.includes('REPORT_VIOLATION')) {
      chain.push('User reported a workplace violation');
      if (sentiment === 'fearful' || sentiment === 'negative') {
        chain.push('User is emotionally distressed - lead with empathy before analysis');
      }
      chain.push('Classify violation type and severity');
      chain.push('Search legal knowledge base for applicable laws');
      chain.push('Provide specific remedies and next steps');
      if (escalation.level >= 3) {
        chain.push('User has reported multiple issues - offer comprehensive support');
      }
    }

    if (intents.includes('SEEK_ADVICE')) {
      chain.push('User is seeking guidance');
      chain.push('Identify specific area of concern');
      chain.push('Provide actionable steps with institutional contacts');
    }

    if (intents.includes('EMERGENCY')) {
      chain.push('URGENT: User may be in danger');
      chain.push('Provide emergency contacts immediately');
      chain.push('Police: 999/112, GBV Hotline: 1195');
    }

    if (intents.includes('CHECK_STATUS')) {
      chain.push('User wants to follow up on previous issue');
      chain.push('Review conversation history for prior reports');
    }

    if (context.urgency >= 3) {
      chain.push('Conversation has high urgency - prioritize direct action steps');
    }

    return chain;
  }

  suggestResponseType(userId, intents, sentiment, urgency, escalation) {
    const suggestions = [];

    if (intents.includes('EMERGENCY')) {
      return {
        type: 'emergency',
        tone: 'urgent',
        priority: 'critical',
        includeContacts: true,
        includeLaws: false,
        includeRemedies: true
      };
    }

    if (intents.includes('GREETING')) {
      return {
        type: 'greeting',
        tone: 'warm',
        priority: 'normal',
        includeWelcome: true
      };
    }

    if (intents.includes('THANKS')) {
      return {
        type: 'acknowledgment',
        tone: 'appreciative',
        priority: 'low'
      };
    }

    if (intents.includes('REPORT_VIOLATION')) {
      suggestions.push({
        type: 'violation_report',
        tone: sentiment === 'fearful' ? 'empathetic' : 'supportive',
        priority: urgency >= 4 ? 'high' : 'normal',
        includeLaws: true,
        includeRemedies: true,
        includeInstitutions: true,
        stepByStep: true
      });
    }

    if (intents.includes('SEEK_ADVICE')) {
      suggestions.push({
        type: 'advice',
        tone: 'informative',
        priority: 'normal',
        includeLaws: true,
        includeRemedies: true,
        includeInstitutions: true
      });
    }

    if (escalation.level >= 3) {
      suggestions.forEach(s => {
        s.tone = 'empathetic';
        s.includeFollowUp = true;
        s.acknowledgeHistory = true;
      });
    }

    return suggestions[0] || {
      type: 'general',
      tone: 'helpful',
      priority: 'normal'
    };
  }

  generateFollowUp(userId, intents, topic, memory) {
    const questions = [];

    if (intents.includes('REPORT_VIOLATION')) {
      if (topic === 'wages') {
        questions.push('How long has this been happening?');
        questions.push('Do you have any payment records or pay slips?');
      } else if (topic === 'dismissal') {
        questions.push('Were you given any reason for the dismissal?');
        questions.push('Do you have your employment contract?');
      } else if (topic === 'harassment') {
        questions.push('Did anyone witness what happened?');
        questions.push('Have you reported this to anyone before?');
      } else if (topic === 'safety') {
        questions.push('Have you been injured? Do you need medical help?');
        questions.push('Has your employer provided any protective equipment?');
      } else {
        questions.push('Can you tell me more about what happened?');
        questions.push('When did this start?');
      }
    }

    if (intents.includes('SEEK_ADVICE')) {
      questions.push('What specific area would you like help with?');
      questions.push('Would you like me to explain your rights under a specific law?');
    }

    if (memory.length <= 2) {
      questions.push('You can describe what happened at your workplace, and I will help you understand your rights.');
    }

    return questions.slice(0, 3);
  }

  getMemory(userId) {
    return this.conversationMemory.get(userId) || [];
  }

  getContext(userId) {
    return this.contextStack.get(userId) || {};
  }

  clearMemory(userId) {
    this.conversationMemory.delete(userId);
    this.contextStack.delete(userId);
    this.intentHistory.delete(userId);
    this.escalationTracker.delete(userId);
  }

  getMostCommon(arr) {
    if (arr.length === 0) return null;
    const counts = {};
    arr.forEach(item => {
      counts[item] = (counts[item] || 0) + 1;
    });
    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  }
}

export default IQEngine;
