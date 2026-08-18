/**
 * Humanizer - Removes AI patterns from generated text and adds pixelai signature
 * Based on anti-AI writing research (Wikipedia, GPTZero, Binoculars, etc.)
 */

class Humanizer {
    constructor() {
        // AI vocabulary words to replace/remove (from research)
        this.aiVocabulary = [
            'delve', 'tapestry', 'multifaceted', 'seamlessly', 'unwavering', 
            'ever-evolving', 'game-changer', 'spearheaded', 'groundbreaking', 
            'revolutionize', 'paradigm shift', 'synergy', 'leverage', 'empower', 
            'holistic', 'testament', 'realm', 'journey', 'navigate', 'embark', 
            'elucidate', 'foster', 'harness', 'showcase', 'underscore', 'garner', 
            'interplay', 'vibrant', 'intricate', 'intricacies', 'meticulous', 
            'meticulously', 'boasts', 'bolster', 'bolstered', 'align with', 
            'additionally', 'deep dive', 'unveil', 'unleash', 'seamless', 'pivotal', 
            'pivotal role', 'robust', 'valuable', 'enhance', 'enduring', 'emphasizing', 
            'highlighting', 'comprehensive', 'crucial', 'key'
        ];

        // AI phrases to cut/rewrite (with replacements)
        this.aiPhrases = [
            { pattern: /in today's fast-paced world/gi, replacement: '' },
            { pattern: /in the ever-evolving landscape of/gi, replacement: '' },
            { pattern: /in the realm of/gi, replacement: '' },
            { pattern: /it's important to note that/gi, replacement: '' },
            { pattern: /it's worth mentioning that/gi, replacement: '' },
            { pattern: /it is important to note that/gi, replacement: '' },
            { pattern: /not only.*?but also/gi, replacement: '' },
            { pattern: /this serves as a testament to/gi, replacement: 'this shows' },
            { pattern: /plays a vital role in/gi, replacement: 'drives' },
            { pattern: /despite these challenges/gi, replacement: 'still' },
            { pattern: /future outlook/gi, replacement: 'what\'s next' },
            { pattern: /challenges and future prospects/gi, replacement: 'what\'s next' },
            { pattern: /let's dive in/gi, replacement: '' },
            { pattern: /let's explore/gi, replacement: '' },
            { pattern: /without further ado/gi, replacement: '' },
            { pattern: /in conclusion/gi, replacement: '' },
            { pattern: /ultimately/gi, replacement: 'in the end' },
            { pattern: /overall,/gi, replacement: '' },
            { pattern: /as we've seen/gi, replacement: '' },
            { pattern: /when it comes to/gi, replacement: 'for' },
            { pattern: /the future looks bright/gi, replacement: '' },
            { pattern: /exciting times lie ahead/gi, replacement: '' },
            { pattern: /it appears to have been/gi, replacement: 'it was' },
            { pattern: /based on available information/gi, replacement: 'from what I know' },
            { pattern: /research needed to understand/gi, replacement: 'we need to learn' },
            { pattern: /here's what you need to know/gi, replacement: '' },
            { pattern: /let's break this down/gi, replacement: '' },
            { pattern: /great question/gi, replacement: '' },
            { pattern: /you're absolutely right/gi, replacement: '' },
            { pattern: /i hope this helps/gi, replacement: '' },
            { pattern: /let me know if/gi, replacement: '' },
            { pattern: /let me know if you need help/gi, replacement: '' },
            { pattern: /feel free to ask/gi, replacement: '' },
            { pattern: /happy to help/gi, replacement: '' },
            { pattern: /delve into/gi, replacement: 'dig into' },
            { pattern: /the key is to/gi, replacement: 'what matters is' },
            { pattern: /it\'s worth noting that/gi, replacement: '' },
            { pattern: /this is a proof/gi, replacement: 'this is evidence' },
            { pattern: /use the working together/gi, replacement: 'use the connection' },
            { pattern: /the main is to/gi, replacement: 'what matters is' }
        ];

        // Transition words that AI overuses at sentence starts
        this.overusedTransitions = [
            'additionally', 'moreover', 'furthermore', 'consequently', 'therefore',
            'however', 'nevertheless', 'subsequently', 'accordingly', 'similarly',
            'likewise', 'meanwhile', 'accordingly', 'hence', 'thus', 'then',
            'first', 'second', 'third', 'finally', 'lastly', 'in addition'
        ];

        // Sycophantic patterns to remove
        this.sycophanticPatterns = [
            /^great question[,.!]?\s*/i,
            /^that'?s a great question[,.!]?\s*/i,
            /^you'?re absolutely right[,.!]?\s*/i,
            /^excellent point[,.!]?\s*/i,
            /^good catch[,.!]?\s*/i,
            /^i'?m glad you asked[,.!]?\s*/i,
            /^that'?s an excellent question[,.!]?\s*/i,
            /^thanks for asking[,.!]?\s*/i,
            /^let me know if.*help/i,
            /^happy to help[,.!]?\s*/i,
            /^i hope this helps[,.!]?\s*/i,
            /^feel free to ask[,.!]?\s*/i
        ];

        // Filler phrases to simplify
        this.fillerPhrases = [
            { pattern: /in order to/gi, replacement: 'to' },
            { pattern: /due to the fact that/gi, replacement: 'because' },
            { pattern: /at this point in time/gi, replacement: 'now' },
            { pattern: /has the ability to/gi, replacement: 'can' },
            { pattern: /is able to/gi, replacement: 'can' },
            { pattern: /serves as/gi, replacement: 'is' },
            { pattern: /stands as/gi, replacement: 'is' },
            { pattern: /represents a/gi, replacement: 'is a' },
            { pattern: /functions as/gi, replacement: 'works as' }
        ];

        // Weak hedging patterns
        this.hedgingPatterns = [
            { pattern: /\bcould potentially\b/gi, replacement: 'could' },
            { pattern: /\bmay possibly\b/gi, replacement: 'may' },
            { pattern: /\bmight potentially\b/gi, replacement: 'might' },
            { pattern: /\bappears to be\b/gi, replacement: 'is' },
            { pattern: /\bseems to be\b/gi, replacement: 'is' },
            { pattern: /\btends to\b/gi, replacement: '' }
        ];
    }

    /**
     * Main humanization pipeline
     */
    humanize(text) {
        if (!text || typeof text !== 'string') return text;
        
        let result = text;
        
        // 1. Remove sycophantic openings
        result = this.removeSycophancy(result);
        
        // 2. Replace AI vocabulary with simpler alternatives
        result = this.replaceAIVocabulary(result);
        
        // 3. Cut/rewrite AI phrases
        result = this.removeAIPhrases(result);
        
        // 3.5. Reduce overused transitions at sentence starts
        result = this.reduceTransitions(result);
        
        // 4. Simplify filler phrases
        result = this.simplifyFillers(result);
        
        // 5. Reduce excessive hedging
        result = this.reduceHedging(result);
        
        // 6. Add sentence length variation (burstiness)
        result = this.addBurstiness(result);
        
        // 7. Add pixelai signature
        result = this.addSignature(result);
        
        return result.trim();
    }

    /**
     * Remove sycophantic openings like "Great question!"
     */
    removeSycophancy(text) {
        let result = text;
        for (const pattern of this.sycophanticPatterns) {
            result = result.replace(pattern, '');
        }
        return result.trim();
    }

    /**
     * Replace AI vocabulary with simpler alternatives
     */
    replaceAIVocabulary(text) {
        let result = text;
        
        // Handle multi-word phrases first (order matters - longer phrases first)
        const phraseReplacements = {
            'delve into': 'dig into',
            'deep dive': 'close look',
            'paradigm shift': 'big change',
            'game-changer': 'big shift',
            'pivotal role': 'key part',
            'align with': 'match',
            'spearheaded': 'led',
            'groundbreaking': 'new',
            'revolutionize': 'change',
            'seamlessly': 'smoothly',
            'unwavering': 'steady',
            'ever-evolving': 'changing',
            'multifaceted': 'complex',
            'intricacies': 'details',
            'meticulously': 'carefully',
            'bolstered': 'supported',
            'additionally': 'also',
            'unveil': 'show',
            'unleash': 'release',
            'seamless': 'smooth',
            'seamlessly': 'smoothly'
        };
        
        // Single word replacements
        const wordReplacements = {
            'delve': 'dig',
            'tapestry': 'mix',
            'multifaceted': 'complex',
            'unwavering': 'steady',
            'ever-evolving': 'changing',
            'game-changer': 'big shift',
            'spearheaded': 'led',
            'groundbreaking': 'new',
            'revolutionize': 'change',
            'paradigm shift': 'big change',
            'synergy': 'connection',
            'leverage': 'use',
            'empower': 'enable',
            'holistic': 'whole',
            'testament': 'evidence',
            'realm': 'area',
            'journey': 'path',
            'navigate': 'handle',
            'embark': 'start',
            'elucidate': 'explain',
            'foster': 'help grow',
            'harness': 'use',
            'showcase': 'show',
            'underscore': 'stress',
            'garner': 'get',
            'interplay': 'interaction',
            'vibrant': 'lively',
            'intricate': 'complex',
            'intricacies': 'details',
            'meticulous': 'careful',
            'meticulously': 'carefully',
            'boasts': 'has',
            'bolster': 'support',
            'bolstered': 'supported',
            'additionally': 'also',
            'deep dive': 'close look',
            'unveil': 'show',
            'unleash': 'release',
            'seamless': 'smooth',
            'pivotal': 'key',
            'pivotal role': 'key part',
            'robust': 'strong',
            'valuable': 'useful',
            'enhance': 'improve',
            'enduring': 'lasting',
            'emphasizing': 'stressing',
            'highlighting': 'showing',
            'comprehensive': 'thorough',
            'crucial': 'important',
            'key': 'main'
        };

        // Apply phrase replacements first
        for (const [aiPhrase, humanPhrase] of Object.entries(phraseReplacements)) {
            const regex = new RegExp(aiPhrase.replace(/\s+/g, '\\s+'), 'gi');
            result = result.replace(regex, humanPhrase);
        }

        // Apply word replacements
        for (const [aiWord, humanWord] of Object.entries(wordReplacements)) {
            const regex = new RegExp(`\\b${aiWord}\\b`, 'gi');
            result = result.replace(regex, humanWord);
        }
        
        return result;
    }

    /**
     * Remove AI phrases
     */
    removeAIPhrases(text) {
        let result = text;
        for (const { pattern, replacement } of this.aiPhrases) {
            result = result.replace(pattern, replacement);
        }
        // Clean up double spaces and stray commas from removals
        result = result.replace(/\s+/g, ' ');
        result = result.replace(/\s*,\s*,/g, ',');
        result = result.replace(/,\s*\./g, '.');
        result = result.replace(/^\s*,\s*/, '');
        return result.trim();
    }

    /**
     * Reduce overused transition words at sentence starts
     */
    reduceTransitions(text) {
        let result = text;
        
        // Split into sentences, process each
        const sentences = result.split(/(?<=[.!?])\s+/);
        const processed = sentences.map((sentence, i) => {
            const trimmed = sentence.trim();
            if (!trimmed) return sentence;
            
            // Check if sentence starts with overused transition
            const words = trimmed.split(/\s+/);
            if (words.length > 0) {
                const firstWord = words[0].toLowerCase().replace(/[^a-z]/g, '');
                if (this.overusedTransitions.includes(firstWord) && i > 0) {
                    // 70% chance to remove the transition
                    if (Math.random() < 0.7) {
                        return words.slice(1).join(' ');
                    }
                }
            }
            return sentence;
        });
        
        return processed.join(' ');
    }

    /**
     * Simplify filler phrases
     */
    simplifyFillers(text) {
        let result = text;
        for (const { pattern, replacement } of this.fillerPhrases) {
            result = result.replace(pattern, replacement);
        }
        return result;
    }

    /**
     * Reduce excessive hedging
     */
    reduceHedging(text) {
        let result = text;
        for (const { pattern, replacement } of this.hedgingPatterns) {
            result = result.replace(pattern, replacement);
        }
        // Clean up double spaces from removals
        result = result.replace(/\s+/g, ' ').trim();
        return result;
    }

    /**
     * Add burstiness - vary sentence lengths
     * This is a light touch - just ensures we don't have uniform length
     */
    addBurstiness(text) {
        // This is subtle - we just ensure the text doesn't feel monotonous
        // Real burstiness comes from the LLM prompt, this just polishes
        return text;
    }

    /**
     * Add the pixelai signature
     */
    addSignature(text) {
        const signatures = [
            '*pixelai*',
            '*pixelai*',
            '*pixelai*',
            '*pixelai*'  // weighted to always add
        ];
        const sig = signatures[Math.floor(Math.random() * signatures.length)];
        
        // Don't add if already present
        if (text.toLowerCase().includes('*pixelai*')) {
            return text;
        }
        
        // Add with spacing
        return `${text}\n\n${sig}`;
    }

    /**
     * Quick analysis - returns list of AI patterns found (for debugging)
     */
    analyze(text) {
        const findings = [];
        const lower = text.toLowerCase();
        
        // Check vocabulary
        for (const word of this.aiVocabulary) {
            if (lower.includes(word.toLowerCase())) {
                findings.push({ type: 'vocabulary', word, severity: 'medium' });
            }
        }
        
        // Check phrases
        for (const entry of this.aiPhrases) {
            if (entry && entry.pattern && entry.pattern.test) {
                if (entry.pattern.test(text)) {
                    findings.push({ type: 'phrase', phrase: entry.pattern.source, severity: 'high' });
                }
            }
        }
        
        // Check sycophancy
        for (const pattern of this.sycophanticPatterns) {
            if (pattern.test(text)) {
                findings.push({ type: 'sycophancy', pattern: pattern.source, severity: 'high' });
            }
        }
        
        // Check transitions at sentence starts
        const sentences = text.split(/(?<=[.!?])\s+/);
        let transitionCount = 0;
        for (const sentence of sentences) {
            const words = sentence.trim().split(/\s+/);
            if (words.length > 0) {
                const firstWord = words[0].toLowerCase().replace(/[^a-z]/g, '');
                if (this.overusedTransitions.includes(firstWord)) {
                    transitionCount++;
                }
            }
        }
        if (transitionCount > 2) {
            findings.push({ type: 'transitions', count: transitionCount, severity: 'medium' });
        }
        
        return findings;
    }
}

export default Humanizer;