import Humanizer from './src/humanizer.js';

const h = new Humanizer();

const testCases = [
    "Great question! Additionally, it is important to note that in today's fast-paced world, we must delve into the intricacies of this multifaceted topic. Let me know if you need help!",
    "I hope this helps! Furthermore, this serves as a testament to the fact that we need to navigate the ever-evolving landscape of technology. Happy to help!",
    "That's a great question! Let me break this down: the key is to leverage the synergy between components. This is a game-changer for your workflow.",
    "You're absolutely right. It's worth mentioning that this comprehensive approach will enhance your robust system. Feel free to ask if you need more info!"
];

for (const test of testCases) {
    console.log('='.repeat(60));
    console.log('ORIGINAL:');
    console.log(test);
    console.log('\nHUMANIZED:');
    console.log(h.humanize(test));
    console.log('\nANALYSIS:');
    console.log(h.analyze(test));
    console.log();
}