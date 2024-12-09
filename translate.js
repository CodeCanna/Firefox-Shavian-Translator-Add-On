/**
 * @author Seth Leonard
 * @license MIT
 * Copyright (c) 2024 Seth Leonard
 * 
 * Part of the Shavian Translator Firefox extension
 */
 
 // translate.js
const startTime = performance.now();

console.log('Translation script starting...');

// First get the current tier setting
browser.storage.local.get('wordTier').then(result => {
    const wordTier = result.wordTier || 0; // default to all words
    console.log('Current word tier:', wordTier);

    // Load both base dictionary and custom entries
    Promise.all([
        fetch(browser.runtime.getURL('dict.json')),
        browser.storage.local.get(['customDictionary', 'dictionaryLastModified'])
    ]).then(([response, stored]) => {
        console.log('Dictionary fetch response:', response.ok ? 'OK' : 'Failed');
        
        return response.json().then(compressedDict => {
            // Convert compressed array format to object format
            const baseDictionary = Object.fromEntries(
                compressedDict.map(([word, shavian, rank]) => [
                    word,
                    { shavian, rank }
                ])
            );
            
            // Merge base dictionary with custom entries
            const dict = {
                ...baseDictionary,
                ...(stored.customDictionary || {})
            };
            
            console.log('Dictionary loaded, entries:', Object.keys(dict).length);
            const parseTime = performance.now();
            console.log("Dictionary load time:", Math.floor(parseTime - startTime), "ms");

            function translateWord(word) {
                const lookup = word.toLowerCase();
                const entry = dict[lookup];
                
                if (!entry || !entry.shavian) {
                    return word;
                }

                if (wordTier === 0 || entry.rank <= wordTier) {
                    return word === word.toUpperCase() ? 
                        entry.shavian.toUpperCase() : 
                        entry.shavian;
                }

                return word;
            }

            function translateText(text) {
                return text
                    .replace(/[\u2018\u2019]/g, "'")
                    .replace(/\b[\w\']+\b/g, match => translateWord(match));
            }

            // Find all text nodes in the document
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: node => {
                        // Skip script and style tags
                        const parent = node.parentElement;
                        if (parent && (
                            parent.tagName === 'SCRIPT' ||
                            parent.tagName === 'STYLE' ||
                            parent.tagName === 'NOSCRIPT'
                        )) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

            // Translate each text node
            let node;
            while (node = walker.nextNode()) {
                node.textContent = translateText(node.textContent);
            }

            const endTime = performance.now();
            console.log("Translation time:", Math.floor(endTime - parseTime), "ms");
        });
    })
    .catch(error => {
        console.error("Translation error:", error.message);
        console.error("Error stack:", error.stack);
    });
});