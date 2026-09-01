/**
 * SkillRegistry - Modular skill loader/registry for PixelAI WhatsApp chatbot
 *
 * Discovers, loads, and manages skill modules from src/skills/.
 * Each skill lives in its own subdirectory with an index.js exporting the skill interface:
 *   { name, description, triggers, execute, isAvailable }
 *
 * Persists enabled/disabled state and usage stats to data/skill-settings.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILLS_DIR = path.join(__dirname, 'skills');
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'skill-settings.json');

/**
 * Load persisted settings (enabled states + usage stats) from disk.
 * Returns { enabled: { [name]: boolean }, stats: { [name]: number } }.
 */
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            return {
                enabled: parsed.enabled ?? {},
                stats: parsed.stats ?? {},
            };
        }
    } catch (err) {
        console.warn('[SkillRegistry] Failed to load settings, using defaults:', err.message);
    }
    return { enabled: {}, stats: {} };
}

/**
 * Persist settings to disk. Creates parent directories if needed.
 */
function saveSettings(settings) {
    try {
        const dir = path.dirname(SETTINGS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (err) {
        console.error('[SkillRegistry] Failed to save settings:', err.message);
    }
}

class SkillRegistry {
    constructor() {
        /** @type {Map<string, object>} name → skill object */
        this.skills = new Map();

        /** @type {Map<string, boolean>} name → enabled state (runtime override) */
        this.enabledState = new Map();

        /** @type {Map<string, number>} name → usage count */
        this.stats = new Map();

        const settings = loadSettings();
        for (const [name, enabled] of Object.entries(settings.enabled)) {
            this.enabledState.set(name, enabled);
        }
        for (const [name, count] of Object.entries(settings.stats)) {
            this.stats.set(name, count);
        }
    }

    /**
     * Scan src/skills/ for subdirectories, dynamically import each index.js,
     * validate the exported skill interface, and register it.
     * Skills that fail to load are logged and skipped.
     */
    async loadSkills() {
        let entries;
        try {
            entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
        } catch (err) {
            console.warn('[SkillRegistry] Could not read skills directory:', err.message);
            return;
        }

        const directories = entries.filter(e => e.isDirectory());

        const loadPromises = directories.map(async (dir) => {
            const skillPath = path.join(SKILLS_DIR, dir.name, 'index.js');
            const spec = `./skills/${dir.name}/index.js`;

            try {
                const mod = await import(spec);
                const skill = mod.default ?? mod;

                if (!this.#validateSkill(skill, dir.name)) {
                    return;
                }

                this.skills.set(skill.name, skill);

                // Apply persisted enabled state; default to true for new skills
                if (!this.enabledState.has(skill.name)) {
                    this.enabledState.set(skill.name, true);
                }

                console.log(`[SkillRegistry] Loaded skill: ${skill.name}`);
            } catch (err) {
                console.warn(`[SkillRegistry] Failed to load skill "${dir.name}":`, err.message);
            }
        });

        await Promise.allSettled(loadPromises);
    }

    /**
     * Validate that an imported module conforms to the skill interface.
     * @returns {boolean}
     */
    #validateSkill(skill, dirName) {
        if (!skill || typeof skill !== 'object') {
            console.warn(`[SkillRegistry] Skill "${dirName}" did not export an object`);
            return false;
        }

        if (typeof skill.name !== 'string' || skill.name.length === 0) {
            console.warn(`[SkillRegistry] Skill "${dirName}" missing or invalid "name"`);
            return false;
        }

        if (typeof skill.description !== 'string') {
            console.warn(`[SkillRegistry] Skill "${skill.name || dirName}" missing "description"`);
            return false;
        }

        if (!Array.isArray(skill.triggers)) {
            console.warn(`[SkillRegistry] Skill "${skill.name}" missing "triggers" array`);
            return false;
        }

        if (typeof skill.execute !== 'function') {
            console.warn(`[SkillRegistry] Skill "${skill.name}" missing "execute" function`);
            return false;
        }

        if (typeof skill.isAvailable !== 'function') {
            console.warn(`[SkillRegistry] Skill "${skill.name}" missing "isAvailable" function`);
            return false;
        }

        return true;
    }

    /**
     * Get a skill by its unique name.
     * @param {string} name
     * @returns {object|null}
     */
    getSkillByName(name) {
        return this.skills.get(name) ?? null;
    }

    /**
     * Match a message against all skills' triggers (case-insensitive substring).
     * Returns matching skills sorted by trigger specificity — longest matching
     * trigger string wins, so more specific skills rank higher.
     *
     * @param {string} message
     * @returns {object[]}
     */
    getSkillForMessage(message) {
        if (!message || typeof message !== 'string') return [];

        const lowerMessage = message.toLowerCase();
        const matches = [];

        for (const skill of this.skills.values()) {
            if (!this.enabledState.get(skill.name)) continue;
            if (!skill.isAvailable()) continue;

            let bestTriggerLength = 0;
            for (const trigger of skill.triggers) {
                if (lowerMessage.includes(trigger.toLowerCase())) {
                    if (trigger.length > bestTriggerLength) {
                        bestTriggerLength = trigger.length;
                    }
                }
            }

            if (bestTriggerLength > 0) {
                // Skills can declare priorityBoost (e.g. 1 = double weight) so
                // intent-bearing triggers like "case summary" outrank longer
                // topic-only matches from other skills.
                const weight = skill.priorityBoost
                    ? bestTriggerLength * (1 + skill.priorityBoost)
                    : bestTriggerLength;
                matches.push({ skill, specificity: weight });
            }
        }

        matches.sort((a, b) => b.specificity - a.specificity);
        return matches.map(m => m.skill);
    }

    /**
     * Return every loaded skill regardless of enabled state.
     * @returns {object[]}
     */
    getAllSkills() {
        return Array.from(this.skills.values());
    }

    /**
     * Return only skills that are enabled AND available.
     * @returns {object[]}
     */
    getEnabledSkills() {
        return this.getAllSkills().filter(
            skill => this.enabledState.get(skill.name) !== false && skill.isAvailable()
        );
    }

    /**
     * Enable a skill by name and persist the change.
     * @param {string} name
     * @returns {boolean} true if the skill exists
     */
    enableSkill(name) {
        if (!this.skills.has(name)) {
            console.warn(`[SkillRegistry] Cannot enable unknown skill "${name}"`);
            return false;
        }
        this.enabledState.set(name, true);
        this.#persistSettings();
        return true;
    }

    /**
     * Disable a skill by name and persist the change.
     * @param {string} name
     * @returns {boolean} true if the skill exists
     */
    disableSkill(name) {
        if (!this.skills.has(name)) {
            console.warn(`[SkillRegistry] Cannot disable unknown skill "${name}"`);
            return false;
        }
        this.enabledState.set(name, false);
        this.#persistSettings();
        return true;
    }

    /**
     * Return usage counts for all loaded skills.
     * @returns {{ [name: string]: number }}
     */
    getSkillStats() {
        const result = {};
        for (const [name, count] of this.stats) {
            result[name] = count;
        }
        return result;
    }

    /**
     * Increment the usage counter for a skill and persist.
     * @param {string} name
     */
    recordSkillUsage(name) {
        const current = this.stats.get(name) ?? 0;
        this.stats.set(name, current + 1);
        this.#persistSettings();
    }

    /**
     * Write current enabled states and stats to disk.
     */
    #persistSettings() {
        const enabled = {};
        for (const [name, val] of this.enabledState) {
            enabled[name] = val;
        }
        const stats = {};
        for (const [name, val] of this.stats) {
            stats[name] = val;
        }
        saveSettings({ enabled, stats });
    }
}

export default SkillRegistry;
