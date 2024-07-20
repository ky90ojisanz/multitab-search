chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && !tabs[0].url.startsWith("chrome://")) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        {
          action: "shortcut",
          direction: command === "next-match" ? "next" : "prev",
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            return;
          }
          if (response && response.currentIndex !== undefined) {
            // ポップアップが開いている場合、更新メッセージを送信
            chrome.runtime.sendMessage({
              action: "updateCounter",
              currentIndex: response.currentIndex,
              totalMatches: response.totalMatches,
            });
          }
        }
      );
    }
  });
});
