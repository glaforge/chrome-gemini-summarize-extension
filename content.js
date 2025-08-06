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

(() => {
  /**
   * This script attempts to extract the most meaningful content from a page
   * using a multi-step fallback strategy.
   */

  // --- Method 1: Use Mozilla's Readability.js ---
  // This is the best method for well-structured articles.
  try {
    // We clone the document so Readability doesn't alter the original page
    const documentClone = document.cloneNode(true);
    const reader = new Readability(documentClone);
    const article = reader.parse();

    if (article && article.textContent && article.textContent.trim().length > 250) {
      // Success! Return the title and clean text content.
      return `${article.title}\n\n${article.textContent}`;
    }
    // If Readability returns a very short article, it might be wrong,
    // so we'll let the script continue to the next method.
  } catch (e) {
    console.error("Readability.js failed:", e);
    // Proceed to the next method if Readability throws an error.
  }

  // --- Method 2: Heuristic-based content extraction ---
  // This is a fallback for pages that are not traditional articles.
  const cleanText = (text) => {
    return text.replace(/\s\s+/g, ' ').replace(/\n\n+/g, '\n').trim();
  };

  const contentSelectors = [
    'article',
    'main',
    '.main-content',
    '#main-content',
    '.post-body',
    '#content',
    '.content',
  ];

  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      const text = cleanText(element.innerText);
      if (text.length > 250) {
        return text; // Return text from the first good selector
      }
    }
  }

  // --- Method 3: Final fallback to the entire page body ---
  // This is the last resort if the other methods fail.
  return cleanText(document.body.innerText);
})();