class ResponseGenerator {
    constructor() {
        // Response templates for different intents and languages
        this.responseTemplates = {
            en: {
                greeting: [
                    "Hey {name}! What's up?",
                    "Yo {name}, how's it going?",
                    "Hey! What's on your mind?",
                    "What's good {name}?"
                ],
                help: [
                    "What do you need?",
                    "Sure, what's up?",
                    "Hit me with it."
                ],
                profile_query: [
                    "I'm {name} — {bio} If you wanna know anything else, just ask.",
                    "{bio} That's the short version. What do you want to know?"
                ],
                schedule_inquiry: [
                    "My schedule: {working_hours} ({timezone}). {availability_details}",
                    "I work {working_hours} {timezone}. {availability_details}"
                ],
                contact_request: [
                    "Email: {email} | Phone: {phone} | WhatsApp: you're already here 😄",
                    "Drop me an email at {email} or call {phone}. Or just keep texting me here."
                ],
                status_check: [
                    "Doing well! You?",
                    "Pretty good, just vibing. You?",
                    "All good here. How about you?"
                ],
                general_chat: [
                    "Tell me more about that",
                    "Hmm, what do you mean?",
                    "That's a new one for me — go on",
                    "What's the story there?"
                ],
                default: "Not sure I follow — can you rephrase that?"
            }
        };
    }

    // Generate greeting response
    async generateGreeting(language, userContext) {
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const greetingTemplates = templates.greeting;
        const randomIndex = Math.floor(Math.random() * greetingTemplates.length);
        let response = greetingTemplates[randomIndex];
        
        // Personalize with user context if available
        if (userContext && userContext.userName) {
            response = response.replace('there', userContext.userName);
        }
        
        return response;
    }

    // Generate help response
    async generateHelp(language, userContext) {
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const helpTemplates = templates.help;
        const randomIndex = Math.floor(Math.random() * helpTemplates.length);
        return helpTemplates[randomIndex];
    }

    // Generate profile info response
    async generateProfileInfo(language, userContext, knowledgeBase) {
        const profile = knowledgeBase.getProfile();
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const profileTemplates = templates.profile_query;
        const randomIndex = Math.floor(Math.random() * profileTemplates.length);
        let response = profileTemplates[randomIndex];
        
        // Replace placeholders with actual data
        response = response.replace('{name}', profile.name || '[Your Name]');
        response = response.replace('{occupation}', profile.occupation || '[Your Occupation]');
        response = response.replace('{bio}', profile.bio || '[Your Bio]');
        
        return response;
    }

    // Generate schedule info response
    async generateScheduleInfo(language, userContext, calendarIntegration) {
        const schedule = knowledgeBase.getSchedule ? knowledgeBase.getSchedule() : {};
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const scheduleTemplates = templates.schedule_inquiry;
        const randomIndex = Math.floor(Math.random() * scheduleTemplates.length);
        let response = scheduleTemplates[randomIndex];
        
        // Replace placeholders with actual data
        response = response.replace('{working_hours}', schedule.working_hours || '9:00-18:00');
        response = response.replace('{timezone}', schedule.timezone || 'UTC');
        
        // Generate availability details
        let availabilityDetails = '';
        if (schedule.typical_availability) {
            const today = new Date();
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = dayNames[today.getDay()].toLowerCase();
            
            if (schedule.typical_availability[dayName] && schedule.typical_availability[dayName].length > 0) {
                availabilityDetails = `Today (${dayName.charAt(0).toUpperCase() + dayName.slice(1)}), I'm available during: ${schedule.typical_availability[dayName].join(' and ')}.`;
            } else {
                availabilityDetails = `I don't have regular availability scheduled for today.`;
            }
        }
        
        response = response.replace('{availability_details}', availabilityDetails);
        
        return response;
    }

    // Generate contact info response
    async generateContactInfo(language, userContext, knowledgeBase) {
        const profile = knowledgeBase.getProfile();
        const contact = profile.contact || {};
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const contactTemplates = templates.contact_request;
        const randomIndex = Math.floor(Math.random() * contactTemplates.length);
        let response = contactTemplates[randomIndex];
        
        // Replace placeholders with actual data
        response = response.replace('{email}', contact.email || 'your.email@example.com');
        response = response.replace('{phone}', contact.phone || '+1234567890');
        
        return response;
    }

    // Generate status info response
    async generateStatusInfo(language, userContext) {
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const statusTemplates = templates.status_check;
        const randomIndex = Math.floor(Math.random() * statusTemplates.length);
        return statusTemplates[randomIndex];
    }

    // Handle learning feedback
    async handleLearningFeedback(message, language, userContext, conversationManager) {
        // Store the feedback for future use
        // For now, just acknowledge it
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const feedbackResponses = [
            "Got it, noted.",
            "Makes sense. I'll keep that in mind.",
            "Cool, thanks for saying.",
            "Noted. Anything else?"
        ];
        const randomIndex = Math.floor(Math.random() * feedbackResponses.length);
        return feedbackResponses[randomIndex];
    }

    // Generate general response
    async generateGeneralResponse(message, language, userContext, knowledgeBase) {
        // First, try to find a matching FAQ
        const faqMatch = knowledgeBase.getBestFAQMatch ? knowledgeBase.getBestFAQMatch(message) : null;
        
        if (faqMatch) {
            return faqMatch.answer;
        }
        
        // If no FAQ match, generate a general response
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        const generalTemplates = templates.general_chat;
        const randomIndex = Math.floor(Math.random() * generalTemplates.length);
        return generalTemplates[randomIndex];
    }

    // Generate a response that engages with a specific topic
    async generateTopicResponse(topic, language, userContext, knowledgeBase) {
        // First, try to see if the topic matches any FAQs
        const faqMatch = knowledgeBase.getBestFAQMatch ? knowledgeBase.getBestFAQMatch(topic) : null;
        
        if (faqMatch) {
            return faqMatch.answer;
        }
        
        // If no specific FAQ match, generate a response that engages with the topic
        const templates = this.responseTemplates[language] || this.responseTemplates.en;
        
        // Topic-specific response templates
        const topicResponses = [
            `"${topic}" — yeah, what about it?`,
            `Oh interesting, what specifically?`,
            `What do you want to know about ${topic}?`,
            `Go on, what's your question about ${topic}?`,
        ];
        
        const randomIndex = Math.floor(Math.random() * topicResponses.length);
        return topicResponses[randomIndex];
    }

    // Add custom response template
    addResponseTemplate(language, intent, template) {
        if (!this.responseTemplates[language]) {
            this.responseTemplates[language] = {};
        }
        if (!this.responseTemplates[language][intent]) {
            this.responseTemplates[language][intent] = [];
        }
        this.responseTemplates[language][intent].push(template);
    }
}

export default ResponseGenerator;