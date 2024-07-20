let currentMatchIndex = -1;
let totalMatches = 0;
let isSearchingMultipleTabs = true;
let tabSearchResults = new Map();
let activeTabId = null;
let reSearch = false; // 再検索フラグを追加

// バックグラウンドスクリプトからの更新メッセージをリッスン
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateCounter") {
    currentMatchIndex = request.currentIndex;
    totalMatches = request.totalMatches;
    updateResultCount();
  }
  sendResponse({ status: "received" }); // 応答を送信
  return true; // 非同期レスポンスを示す
});

document.addEventListener("DOMContentLoaded", function () {
  // ポップアップが開かれたときに検索欄にフォーカスを当てる
  document.getElementById("searchWords").focus();

  document.getElementById("prevMatch").addEventListener("click", () => {
    reSearch = false;
    performSearch("prev");
  });
  document.getElementById("nextMatch").addEventListener("click", () => {
    reSearch = false;
    performSearch("next");
  });
  document.getElementById("searchWords").addEventListener("input", resetSearch);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      activeTabId = tabs[0].id;
    }
  });
  // エンターキーで検索を実行
  document
    .getElementById("searchWords")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        reSearch = false;
        performSearch("next");
      }
    });

  document
    .getElementById("searchMultipleTabs")
    .addEventListener("change", function () {
      isSearchingMultipleTabs = this.checked;
      if (isSearchingMultipleTabs) {
        clearTabResults();
      } else {
        updateResultCount();
      }
    });

  // チェックボックスのイベントリスナーを正しく設定
  const checkboxes = [
    "caseSensitive",
    "wholeWord",
    "useRegex",
    "searchMultipleTabs",
  ];
  checkboxes.forEach((id) => {
    document.getElementById(id).addEventListener("change", function () {
      saveCheckboxStates();
      updateSearchOptions();
      // チェックボックスの状態が変更されたら再検索を行う
      reSearch = true;
      performSearch("next");
    });
  });

  // チェックボックスの状態を復元
  restoreCheckboxStates();
});

function resetSearch() {
  currentMatchIndex = -1;
  totalMatches = 0;
  updateResultCount();
}

function clearTabResults() {
  tabSearchResults.clear();
  const tabResultsElement = document.getElementById("tabResults");
  tabResultsElement.innerHTML = "";
}

function performSearch(direction) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].url.startsWith("chrome://")) {
      alert("この拡張機能は chrome:// ページでは使用できません。");
      return;
    }
    const searchWords = document.getElementById("searchWords").value;
    const caseSensitive = document.getElementById("caseSensitive").checked;
    const wholeWord = document.getElementById("wholeWord").checked;
    const useRegex = document.getElementById("useRegex").checked;
    isSearchingMultipleTabs =
      document.getElementById("searchMultipleTabs").checked;
    if (searchWords) {
      if (isSearchingMultipleTabs) {
        searchAllTabs(searchWords, caseSensitive, wholeWord, useRegex);
      } else {
        searchSingleTab(
          searchWords,
          caseSensitive,
          wholeWord,
          useRegex,
          direction
        );
      }
    } else {
      clearTabResults();
      updateTabResultsDisplay();
      updateResultCount();
    }
  });
}

function searchAllTabs(searchWords, caseSensitive, wholeWord, useRegex) {
  clearTabResults();
  chrome.tabs.query({}, (tabs) => {
    let completedSearches = 0;
    const totalTabs = tabs.length;

    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(
        tab.id,
        {
          action: "search",
          words: searchWords,
          caseSensitive: caseSensitive,
          wholeWord: wholeWord,
          useRegex: useRegex,
          direction: "next",
          reSearch, // 再検索フラグを追加
        },
        (response) => {
          completedSearches++;
          if (chrome.runtime.lastError) {
            console.log(
              `Error in tab ${tab.id}: ${chrome.runtime.lastError.message}`
            );
          } else if (response && response.totalMatches !== undefined) {
            updateTabResult(
              tab.id,
              tab.title || "無題のタブ",
              tab.index,
              response.totalMatches
            );
          }

          if (completedSearches === totalTabs) {
            updateTabResultsDisplay();
            updateResultCount();
          }
        }
      );
    });
  });
}

function searchSingleTab(
  searchWords,
  caseSensitive,
  wholeWord,
  useRegex,
  direction
) {
  chrome.tabs.sendMessage(
    activeTabId,
    {
      action: "search",
      words: searchWords,
      caseSensitive: caseSensitive,
      wholeWord: wholeWord,
      useRegex: useRegex,
      direction: direction,
      reSearch, // 再検索フラグを追加
    },
    (response) => {
      if (response && response.currentIndex !== undefined) {
        currentMatchIndex = response.currentIndex;
        totalMatches = response.totalMatches;
        updateResultCount();
      }
    }
  );
}

function updateTabResult(tabId, tabTitle, tabIndex, matchCount) {
  if (matchCount > 0) {
    tabSearchResults.set(tabId, {
      title: tabTitle,
      index: tabIndex,
      count: matchCount,
    });
  }
}

function updateTabResultsDisplay() {
  const tabResultsElement = document.getElementById("tabResults");
  tabResultsElement.innerHTML = "";

  if (tabSearchResults.size === 0) {
    if (isSearchingMultipleTabs) {
      tabResultsElement.textContent = "検索結果はありません";
    } else {
      tabResultsElement.textContent = "";
    }
    return;
  }
  chrome.tabs.query({}, (tabs) => {
    const tabMap = new Map(tabs.map((tab) => [tab.id, tab]));
    // Mapのエントリを配列に変換
    let mapArray = Array.from(tabSearchResults);
    // tabSearchResults = tabSearchResults.sort((a, b) => a.tabIndex - b.tabIndex);
    mapArray.sort((a, b) => a[1].index - b[1].index);
    // 新しい並び替えられたMapを作成
    tabSearchResults = new Map(mapArray);

    tabSearchResults.forEach((result, tabId) => {
      const tab = tabMap.get(tabId);
      const tabTitle = tab ? tab.title : result.title;
      const tabResultElement = document.createElement("div");
      tabResultElement.className = "tab-result";
      tabResultElement.textContent = `${tabTitle}: ${result.count}件`;
      // クリックイベントリスナーを追加
      tabResultElement.addEventListener("click", () => {
        switchToTab(tabId);
      });

      // カーソルスタイルを変更してクリック可能であることを示す
      tabResultElement.style.cursor = "pointer";
      tabResultsElement.appendChild(tabResultElement);
    });
  });
}

function updateResultCount() {
  const resultCountElement = document.getElementById("resultCount");
  if (isSearchingMultipleTabs) {
    let totalMatches = 0;
    tabSearchResults.forEach((result) => {
      totalMatches += result.count;
    });
    resultCountElement.textContent = `合計: ${totalMatches}件`;
  } else if (totalMatches > 0) {
    resultCountElement.textContent = `${
      currentMatchIndex + 1
    } / ${totalMatches}`;
  } else {
    resultCountElement.textContent = "";
  }
}

// タブを切り替える関数
function switchToTab(tabId) {
  chrome.tabs.update(tabId, { active: true }, () => {
    if (chrome.runtime.lastError) {
      console.error("Error switching tab:", chrome.runtime.lastError);
    } else {
      // タブの切り替えが成功したらポップアップを閉じる
      window.close();
    }
  });
}

function updateSearchOptions() {
  const options = {
    caseSensitive: document.getElementById("caseSensitive").checked,
    wholeWord: document.getElementById("wholeWord").checked,
    useRegex: document.getElementById("useRegex").checked,
    searchMultipleTabs: document.getElementById("searchMultipleTabs").checked,
  };

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        {
          action: "updateSearchOptions",
          options: options,
        },
        function (response) {
          if (chrome.runtime.lastError) {
            console.log(
              "Could not send message to content script:",
              chrome.runtime.lastError
            );
          }
        }
      );
    }
  });
}

// チェックボックスの状態を保存する関数
function saveCheckboxStates() {
  const states = {
    caseSensitive: document.getElementById("caseSensitive").checked,
    wholeWord: document.getElementById("wholeWord").checked,
    useRegex: document.getElementById("useRegex").checked,
    searchMultipleTabs: document.getElementById("searchMultipleTabs").checked,
  };
  chrome.storage.local.set({ checkboxStates: states }, function () {
    if (chrome.runtime.lastError) {
      console.error("Error saving checkbox states:", chrome.runtime.lastError);
    }
  });
}

// チェックボックスの状態を復元する関数
function restoreCheckboxStates() {
  chrome.storage.local.get(["checkboxStates"], function (result) {
    if (result.checkboxStates) {
      document.getElementById("caseSensitive").checked =
        result.checkboxStates.caseSensitive;
      document.getElementById("wholeWord").checked =
        result.checkboxStates.wholeWord;
      document.getElementById("useRegex").checked =
        result.checkboxStates.useRegex;
      document.getElementById("searchMultipleTabs").checked =
        result.checkboxStates.searchMultipleTabs;

      // 状態を復元した後、検索オプションを更新
      updateSearchOptions();
    }
  });
}
