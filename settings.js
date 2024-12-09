/**
 * @author Seth Leonard
 * @license MIT
 * Copyright (c) 2024 Seth Leonard
 * 
 * Part of the Shavian Translator Firefox extension
 */
 
 // settings.js
console.log('Settings script loading...');

const toggleButton = document.getElementById('toggleButton');
const translateNowButton = document.getElementById('translateNow');

// Load saved settings
browser.storage.local.get(['wordTier', 'isEnabled']).then(result => {
    console.log('Loaded settings:', result);
    const wordTier = result.wordTier || 0; // default to all words
    const isEnabled = result.isEnabled || false;
    
    console.log('Setting wordTier to:', wordTier);
    document.getElementById('wordTier').value = wordTier;
    
    updateToggleButton(isEnabled);
});

function updateToggleButton(isEnabled) {
    console.log('Updating toggle button state:', isEnabled);
    toggleButton.textContent = isEnabled ? 'Disable Auto Translation' : 'Enable Auto Translation';
}

// Toggle button click handler
toggleButton.addEventListener('click', async () => {
    console.log('Toggle button clicked');
    await browser.runtime.sendMessage({ action: 'toggleTranslation' });
    // Don't close the popup automatically to allow multiple toggles
});

// Translate Now button click handler
translateNowButton.addEventListener('click', async () => {
    console.log('Translate Now button clicked');
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });

    await browser.tabs.executeScript(tabs[0].id, {
        code: `
            // Translation function, adapted from translate.js
            function translateAllText() {
                // Retrieve the word tier setting
                browser.storage.local.get('wordTier').then(result => {
                    const wordTier = result.wordTier || 0; // default to all words
                    console.log('Current word tier:', wordTier);

                    // Load both base dictionary and custom entries
                    Promise.all([
                        fetch(browser.runtime.getURL('dict.json')),
                        browser.storage.local.get(['customDictionary', 'dictionaryLastModified'])
                    ]).then(([response, stored]) => {
                        response.json().then(compressedDict => {
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

                            // Translation logic
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
                                    .replace(/\\b[\\w\\']+\\b/g, match => translateWord(match));
                            }

                            // Translate all text nodes
                            const walker = document.createTreeWalker(
                                document.body,
                                NodeFilter.SHOW_TEXT,
                                {
                                    acceptNode: node => {
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

                            let node;
                            while (node = walker.nextNode()) {
                                node.textContent = translateText(node.textContent);
                            }

                            console.log('Manual translation complete!');
                        });
                    })
                    .catch(err => console.error('Translation error:', err));
                });
            }

            // Call the translation function
            translateAllText();
        `
    });
});

// Save settings when changed
document.getElementById('wordTier').addEventListener('change', async (e) => {
    const wordTier = parseInt(e.target.value);
    console.log('Saving wordTier:', wordTier);
    await browser.storage.local.set({ wordTier });
    console.log('WordTier saved');

    // Check if translation is enabled and retranslate if it is
    const result = await browser.storage.local.get('isEnabled');
    console.log('Translation enabled:', result.isEnabled);
    if (result.isEnabled) {
        console.log('Retranslating page with new tier');
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        await browser.tabs.executeScript(tabs[0].id, {
            file: 'translate.js'
        });
    }
});

// Listen for changes to translation state
browser.storage.onChanged.addListener((changes) => {
    console.log('Storage changes:', changes);
    if (changes.isEnabled) {
        updateToggleButton(changes.isEnabled.newValue);
    }
});

document.getElementById('openDictionaryEditor').addEventListener('click', () => {
    browser.tabs.create({
        url: "dictionary-editor.html"
    });
});