/*
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Element Declarations ---
  const mainContainer = document.getElementById('main-container');
  const setupContainer = document.getElementById('setup-container');
  const goToOptionsButton = document.getElementById('go-to-options');
  const summarizeButton = document.getElementById('summarize');
  const shrinkButton = document.getElementById('shrink');
  const copyButton = document.getElementById('copy');
  const summaryContainer = document.getElementById('summary-container');
  const errorContainer = document.getElementById('error-container');
  const langToggle = document.getElementById('lang-toggle-checkbox');
  const loader = document.querySelector('.loader-container');

  let rawSummary = '';
  const converter = new showdown.Converter();
  const summarizeButtonOriginalHTML = summarizeButton.innerHTML;

  // --- Initial Setup Check ---
  chrome.storage.sync.get('apiKey', ({ apiKey }) => {
    if (apiKey) {
      mainContainer.style.display = 'block';
      setupContainer.style.display = 'none';
      initializeMain();
    } else {
      mainContainer.style.display = 'none';
      setupContainer.style.display = 'flex';
      goToOptionsButton.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
    }
  });

  function initializeMain() {
    // --- Event Listeners ---
    summarizeButton.addEventListener('click', () => {
      startProcess({ action: 'summarize' });
    });

    shrinkButton.addEventListener('click', () => {
      if (!rawSummary) return;
      startProcess({ action: 'shrink', text: rawSummary });
    });

    copyButton.addEventListener('click', () => {
      const htmlToCopy = summaryContainer.innerHTML;
      const textToCopy = summaryContainer.innerText;

      if (htmlToCopy) {
        const htmlBlob = new Blob([htmlToCopy], { type: 'text/html' });
        const textBlob = new Blob([textToCopy], { type: 'text/plain' });
        const clipboardItem = new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        });

        navigator.clipboard.write([clipboardItem]).then(() => {
          const originalContent = copyButton.innerHTML;
          copyButton.textContent = 'Copied!';
          setTimeout(() => {
            copyButton.innerHTML = originalContent;
          }, 2000);
        }).catch(err => handleError('Failed to copy rich text.'));
      }
    });

    langToggle.addEventListener('change', saveLanguageChoice);

    // --- Core Functions ---
    function startProcess(request) {
      setLoadingState(true);
      const selectedLanguage = langToggle.checked ? 'French' : 'English';
      request.language = selectedLanguage;
      chrome.runtime.sendMessage(request);
    }

    function setLoadingState(isLoading) {
      summarizeButton.disabled = isLoading;
      shrinkButton.disabled = isLoading;
      copyButton.disabled = isLoading;

      if (isLoading) {
        summarizeButton.textContent = 'Summarizing...';
        rawSummary = '';
        summaryContainer.innerHTML = '';
        errorContainer.innerHTML = '';
        loader.style.display = 'flex';
      } else {
        summarizeButton.innerHTML = summarizeButtonOriginalHTML;
        loader.style.display = 'none';
      }
    }

    function handleError(errorMessage) {
      setLoadingState(false);
      errorContainer.textContent = `Error: ${errorMessage}`;
    }

    // --- Message Listener for Stream ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'summaryChunk') {
        loader.style.display = 'none';
        rawSummary += message.chunk;
        summaryContainer.innerHTML = converter.makeHtml(rawSummary);
      } else if (message.type === 'summaryComplete') {
        setLoadingState(false);
        copyButton.disabled = !rawSummary;
        shrinkButton.disabled = !rawSummary;
      } else if (message.type === 'summaryError') {
        // The API key error is now handled on startup, but this will catch other errors.
        handleError(message.error);
      }
    });

    // --- Language Preference Logic ---
    function saveLanguageChoice() {
      const language = langToggle.checked ? 'French' : 'English';
      chrome.storage.sync.set({ preferredLanguage: language });
    }

    function restoreLanguageChoice() {
      chrome.storage.sync.get({ preferredLanguage: 'English' }, (items) => {
        langToggle.checked = items.preferredLanguage === 'French';
      });
    }

    restoreLanguageChoice();
  }
});