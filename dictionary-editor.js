/**
 * @author Seth Leonard
 * @license MIT
 * Copyright (c) 2024 Seth Leonard
 * 
 * Part of the Shavian Translator Firefox extension
 */
 
 console.log('Dictionary editor script loading...');

let dictionary = {};
let hasUnsavedChanges = false;

async function loadDictionary() {
    try {
        console.log('Loading dictionary...');
        const response = await fetch(browser.runtime.getURL('dict.json'));
        const compressedDict = await response.json();
        
        // Convert compressed array format to object format
        const baseDictionary = Object.fromEntries(
            compressedDict.map(([word, shavian, rank]) => [
                word,
                { shavian, rank }
            ])
        );
        
        // Load any custom modifications
        const stored = await browser.storage.local.get('customDictionary');
        dictionary = {
            ...baseDictionary,
            ...(stored.customDictionary || {})
        };
        
        console.log(`Loaded ${Object.keys(dictionary).length} words`);
        return true;
    } catch (error) {
        console.error('Error loading dictionary:', error);
        return false;
    }
}

// Rest of the file remains exactly the same
function renderResults(searchTerm = '') {
    const resultsBody = document.getElementById('resultsBody');
    resultsBody.innerHTML = '';
    
    // Find matches (limit to first 50 for performance)
    const matches = Object.entries(dictionary)
        .filter(([word]) => word.toLowerCase().includes(searchTerm.toLowerCase()))
        .slice(0, 50);
    
    matches.forEach(([word, data]) => {
        const row = document.createElement('tr');
        
        // English word (read-only)
        const wordCell = document.createElement('td');
        wordCell.textContent = word;
        
        // Shavian translation (editable)
        const shavianCell = document.createElement('td');
        shavianCell.className = 'input-cell';
        const shavianInput = document.createElement('input');
        shavianInput.value = data.shavian || '';
        shavianInput.addEventListener('change', () => {
            dictionary[word].shavian = shavianInput.value;
            hasUnsavedChanges = true;
            updateSaveStatus('Unsaved changes', 'red');
            console.log(`Updated ${word} to ${shavianInput.value}`);
        });
        shavianCell.appendChild(shavianInput);
        
        row.appendChild(wordCell);
        row.appendChild(shavianCell);
        resultsBody.appendChild(row);
    });
}

function updateSaveStatus(message, color) {
    const statusEl = document.getElementById('saveStatus');
    statusEl.textContent = message;
    statusEl.style.color = color;
}

function updateImportExportStatus(message) {
    const statusEl = document.getElementById('importExportStatus');
    statusEl.textContent = message;
    setTimeout(() => {
        statusEl.textContent = '';
    }, 3000);
}

async function saveChanges() {
    try {
        // Get the current customizations from the dictionary
        const customDictionary = {};
        const response = await fetch(browser.runtime.getURL('dict.json'));
        const compressedDict = await response.json();
        const baseDictionary = Object.fromEntries(
            compressedDict.map(([word, shavian, rank]) => [
                word,
                { shavian, rank }
            ])
        );
        
        Object.entries(dictionary).forEach(([word, data]) => {
            if (!baseDictionary[word] || 
                (baseDictionary[word].shavian !== data.shavian)) {
                customDictionary[word] = data;
            }
        });
        
        await browser.storage.local.set({ 
            customDictionary,
            dictionaryLastModified: Date.now()
        });
        
        hasUnsavedChanges = false;
        updateSaveStatus('Changes saved!', 'green');
        setTimeout(() => {
            if (!hasUnsavedChanges) {
                updateSaveStatus('', '');
            }
        }, 3000);
        console.log('Dictionary saved successfully');
    } catch (error) {
        console.error('Error saving dictionary:', error);
        updateSaveStatus('Error saving changes', 'red');
    }
}

function addNewWord(englishWord, shavianTranslation) {
    if (!englishWord || !shavianTranslation) {
        document.getElementById('addWordStatus').textContent = 'Both fields are required';
        return false;
    }

    const normalizedWord = englishWord.toLowerCase().trim();
    
    // Add the word to the dictionary
    dictionary[normalizedWord] = {
        shavian: shavianTranslation,
        rank: 999999  // High rank number for custom words
    };

    hasUnsavedChanges = true;
    updateSaveStatus('Unsaved changes', 'red');
    
    // Clear the input fields
    document.getElementById('newWordInput').value = '';
    document.getElementById('newShavianInput').value = '';
    document.getElementById('addWordStatus').textContent = 'Word added successfully!';
    
    // Refresh the display
    renderResults(document.getElementById('searchInput').value);
    
    return true;
}

async function getCustomizations() {
    // Get the current base dictionary to identify customizations
    const response = await fetch(browser.runtime.getURL('dict.json'));
    const compressedDict = await response.json();
    const baseDictionary = Object.fromEntries(
        compressedDict.map(([word, shavian, rank]) => [
            word,
            { shavian, rank }
        ])
    );
    
    const customizations = {};
    Object.entries(dictionary).forEach(([word, data]) => {
        if (!baseDictionary[word] || 
            (baseDictionary[word].shavian !== data.shavian)) {
            customizations[word] = data;
        }
    });
    
    return customizations;
}

async function exportDictionary() {
    try {
        // Get current customizations (including unsaved changes)
        const customizations = await getCustomizations();
        
        const exportData = {
            metadata: {
                exportDate: new Date().toISOString(),
                totalCustomizations: Object.keys(customizations).length,
                type: 'Shavian Dictionary Customizations'
            },
            customizations: customizations
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'shavian-dictionary-customizations.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        updateImportExportStatus(`Exported ${Object.keys(customizations).length} customizations successfully!`);
    } catch (error) {
        console.error('Export error:', error);
        updateImportExportStatus('Error exporting dictionary');
    }
}

async function importDictionary(file) {
    try {
        const text = await file.text();
        const importedData = JSON.parse(text);
        
        // Validate the imported data
        if (!importedData.customizations || typeof importedData.customizations !== 'object') {
            // Try legacy format
            if (typeof importedData === 'object') {
                importedData = { customizations: importedData };
            } else {
                throw new Error('Invalid import file format');
            }
        }

        // Merge the imported data with existing dictionary
        Object.entries(importedData.customizations).forEach(([word, data]) => {
            dictionary[word] = {
                ...data,
                rank: data.rank || 999999  // Ensure imported words have a rank
            };
        });

        hasUnsavedChanges = true;
        updateSaveStatus('Unsaved changes', 'red');
        renderResults(document.getElementById('searchInput').value);
        
        updateImportExportStatus(`Imported ${Object.keys(importedData.customizations).length} customizations successfully!`);
    } catch (error) {
        console.error('Import error:', error);
        updateImportExportStatus('Error importing dictionary');
    }
}

async function deleteAllCustomizations() {
    if (!confirm('Are you sure you want to delete all dictionary customizations? This cannot be undone.')) {
        return;
    }
    
    try {
        // Clear the customDictionary from storage
        await browser.storage.local.remove('customDictionary');
        
        // Reload the page to reset the dictionary to base state
        window.location.reload();
    } catch (error) {
        console.error('Error deleting customizations:', error);
        alert('Error deleting customizations. Please try again.');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded');
    
    const searchInput = document.getElementById('searchInput');
    const saveButton = document.getElementById('saveButton');
    const addWordButton = document.getElementById('addWordButton');
    const exportButton = document.getElementById('exportButton');
    const importButton = document.getElementById('importButton');
    const importFile = document.getElementById('importFile');
    const deleteAllButton = document.getElementById('deleteAllButton');
    
    // Load dictionary first
    const loaded = await loadDictionary();
    if (!loaded) {
        document.getElementById('results').textContent = 'Error loading dictionary';
        return;
    }
    
    // Initial render
    renderResults();
    
    // Search functionality
    searchInput.addEventListener('input', (e) => {
        renderResults(e.target.value);
    });
    
    // Save functionality
    saveButton.addEventListener('click', saveChanges);
    
    // Add word functionality
    addWordButton.addEventListener('click', () => {
        const englishWord = document.getElementById('newWordInput').value;
        const shavianTranslation = document.getElementById('newShavianInput').value;
        addNewWord(englishWord, shavianTranslation);
    });
    
    // Export functionality
    exportButton.addEventListener('click', exportDictionary);
    
    // Import functionality
    importButton.addEventListener('click', () => {
        importFile.click();
    });
    
    importFile.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importDictionary(e.target.files[0]);
        }
    });
    
    // Delete all functionality
    deleteAllButton.addEventListener('click', deleteAllCustomizations);
    
    // Handle page unload
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            return e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        }
    });
});
