const highlightColors = [
  "yellow",
  "lightgreen",
  "lightblue",
  "pink",
  "orange",
  "lavender",
];
let highlights = [];
let currentHighlightIndex = -1;
let lastSearchTerm = "";
let reSearch = false;
let searchOptions = {
  words: "",
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === "search") {
      if (request.reSearch) {
        // 再検索の場合は既存のハイライトをすべて削除
        removeHighlights();
      }
      reSearch = request.reSearch;
      searchOptions = {
        words: request.words,
        caseSensitive: request.caseSensitive,
        wholeWord: request.wholeWord,
        useRegex: request.useRegex,
      };
      const result = performSearch(request.direction);
      sendResponse(result);
    } else if (request.action === "navigate") {
      const result = navigateHighlights(request.direction);
      sendResponse(result);
    } else if (request.action === "shortcut") {
      const result = performSearch(request.direction);
      sendResponse(result);
    } else if (request.action === "updateSearchOptions") {
      searchOptions = {
        caseSensitive: request.options.caseSensitive,
        wholeWord: request.options.wholeWord,
        useRegex: request.options.useRegex,
      };
    }
  } catch (error) {
    console.error("Error in content script:", error);
    sendResponse({ error: error.message });
  }
  return true; // 非同期レスポンスを示す
});

function performSearch(direction) {
  let count;
  if (
    searchOptions.words &&
    (reSearch || searchOptions.words !== lastSearchTerm)
  ) {
    count = highlightWords(
      searchOptions.words,
      searchOptions.caseSensitive,
      searchOptions.wholeWord,
      searchOptions.useRegex
    );
    lastSearchTerm = searchOptions.words;
    currentHighlightIndex = -1;
  } else {
    count = highlights.length;
  }
  if (count > 0) {
    const result = navigateHighlights(direction);
    return result;
  } else {
    currentHighlightIndex = -1;
    return { currentIndex: -1, totalMatches: 0 };
  }
}

function highlightWords(words, caseSensitive, wholeWord, useRegex) {
  removeHighlights();

  let searchTerms;
  if (useRegex) {
    try {
      searchTerms = [new RegExp(words, caseSensitive ? "g" : "gi")];
    } catch (e) {
      console.error("Invalid regular expression:", e);
      return 0;
    }
  } else {
    searchTerms = words.split(" ").filter((word) => word.length > 0);
  }

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        // 非表示の要素内のテキストノードを除外
        if (isNodeVisible(node.parentElement)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      },
    }
  );
  const nodesToHighlight = new Set();

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (
      searchTerms.some((term) => {
        if (term instanceof RegExp) {
          return term.test(node.textContent);
        } else {
          let searchText = caseSensitive
            ? node.textContent
            : node.textContent.toLowerCase();
          let searchTerm = caseSensitive ? term : term.toLowerCase();
          if (wholeWord) {
            const wordBoundary = "\\b";
            const regex = new RegExp(
              wordBoundary +
                searchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") +
                wordBoundary,
              caseSensitive ? "g" : "gi"
            );
            return regex.test(searchText);
          } else {
            return searchText.includes(searchTerm);
          }
        }
      })
    ) {
      nodesToHighlight.add(node);
    }
  }

  nodesToHighlight.forEach((node) => {
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    searchTerms.forEach((term) => {
      let regex;
      if (term instanceof RegExp) {
        regex = term;
      } else {
        const escapedTerm = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const wordBoundary = wholeWord ? "\\b" : "";
        regex = new RegExp(
          wordBoundary + escapedTerm + wordBoundary,
          caseSensitive ? "g" : "gi"
        );
      }

      let match;
      while ((match = regex.exec(node.textContent)) !== null) {
        if (lastIndex < match.index) {
          fragment.appendChild(
            document.createTextNode(
              node.textContent.slice(lastIndex, match.index)
            )
          );
        }
        const mark = document.createElement("mark");
        mark.className = "extension-highlight";
        const colorIndex = searchTerms.indexOf(term) % highlightColors.length;
        mark.style.backgroundColor = highlightColors[colorIndex];
        mark.style.color = "black";
        mark.appendChild(document.createTextNode(match[0]));
        fragment.appendChild(mark);
        lastIndex = regex.lastIndex;
      }
    });

    if (lastIndex < node.textContent.length) {
      fragment.appendChild(
        document.createTextNode(node.textContent.slice(lastIndex))
      );
    }

    node.parentNode.replaceChild(fragment, node);
  });

  highlights = Array.from(
    document.querySelectorAll("mark.extension-highlight")
  );
  return highlights.length;
}

// 要素が表示されているかどうかを確認する補助関数
function isNodeVisible(element) {
  return !!(
    element.offsetWidth ||
    element.offsetHeight ||
    element.getClientRects().length
  );
}

function removeHighlights() {
  const existingHighlights = document.querySelectorAll(
    "mark.extension-highlight"
  );
  existingHighlights.forEach((mark) => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
  highlights = [];
  currentHighlightIndex = -1;
}

function navigateHighlights(direction) {
  if (highlights.length === 0) {
    return { currentIndex: -1, totalMatches: 0 };
  }

  if (currentHighlightIndex >= 0 && currentHighlightIndex < highlights.length) {
    const currentHighlight = highlights[currentHighlightIndex];
    const colorIndex = currentHighlightIndex % highlightColors.length;
    currentHighlight.style.backgroundColor = highlightColors[colorIndex];
    currentHighlight.style.color = "black";
  }

  if (direction === "next") {
    currentHighlightIndex = (currentHighlightIndex + 1) % highlights.length;
  } else if (direction === "prev") {
    currentHighlightIndex =
      (currentHighlightIndex - 1 + highlights.length) % highlights.length;
  }

  const highlight = highlights[currentHighlightIndex];

  // スクロールを強調
  highlight.scrollIntoView({ behavior: "smooth", block: "center" });

  // 現在のハイライトを強調表示
  highlight.style.backgroundColor = "orange";
  highlight.style.color = "white";

  // ハイライトを点滅させる
  setTimeout(() => {
    highlight.style.backgroundColor = "red";
    setTimeout(() => {
      highlight.style.backgroundColor = "orange";
    }, 200);
  }, 200);

  return {
    currentIndex: currentHighlightIndex,
    totalMatches: highlights.length,
  };
}
