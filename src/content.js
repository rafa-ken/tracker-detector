(function () {
  function count(storage) {
    try { return storage.length; } catch { return 0; }
  }

  const data = {
    localStorage: count(window.localStorage),
    sessionStorage: count(window.sessionStorage),
    indexedDB: 0,
  };

  function send() {
    browser.runtime.sendMessage({ type: "storageReport", data });
  }

  if (window.indexedDB && indexedDB.databases) {
    indexedDB.databases()
      .then((dbs) => { data.indexedDB = dbs.length; send(); })
      .catch(send);
  } else {
    send();
  }
})();