/**
 * @author Seth Leonard
 * @license MIT
 * Copyright (c) 2024 Seth Leonard
 * 
 * Part of the Shavian Translator Firefox extension
 */
 
 // background.js
let isEnabled = false;

// Load saved state when extension starts
browser.storage.local.get('isEnabled').then(result => {
    isEnabled = result.isEnabled || false;
    console.log('Initial state loaded:', isEnabled);
    updateIcon();
});

// Handle keyboard shortcut
browser.commands.onCommand.addListener(async (command) => {
    console.log('Command received:', command);
    if (command === "_execute_browser_action") {
        console.log('Toggling via keyboard shortcut');
        await toggleTranslation();
    }
});

// Handle messages from the settings popup
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    console.log('Message received:', message);
    if (message.action === 'toggleTranslation') {
        console.log('Toggling via popup button');
        await toggleTranslation();
        return true; // Keep message port open for async response
    }
});

// Function to toggle translation state
async function toggleTranslation() {
    console.log('Toggle function called, current state:', isEnabled);
    
    // Toggle state first
    isEnabled = !isEnabled;
    await browser.storage.local.set({ isEnabled });
    console.log('State toggled and saved:', isEnabled);
    updateIcon();
    
    if (isEnabled) {
        // Only translate when turning on
        console.log('Translating current page on enable');
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        await browser.tabs.executeScript(tabs[0].id, {
            file: 'translate.js'
        });
    }
}

// Add listener for page navigation
browser.webNavigation.onCompleted.addListener(async (details) => {
    console.log('Navigation detected, translation enabled:', isEnabled);
    if (isEnabled && details.frameId === 0) {
        console.log('Attempting to translate new page');
        await browser.tabs.executeScript(details.tabId, {
            file: 'translate.js'
        });
    }
});

// Update icon and tooltip based on state
function updateIcon() {
    const iconPath = isEnabled ? 'icons/icon48-active.png' : 'icons/icon48.png';
    browser.browserAction.setIcon({
        path: {
            48: iconPath,
            96: iconPath.replace('48', '96')
        }
    });
    
    browser.browserAction.setTitle({
        title: `Shavian Translator (${isEnabled ? 'On' : 'Off'})`
    });
}