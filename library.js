(function () {
  function parse(body) {
    return body.trim().split("\n").filter(Boolean).map(function (line) {
      var i1 = line.indexOf("|");
      var i2 = line.indexOf("|", i1 + 1);
      return {
        theme: line.slice(0, i1),
        sharp: line.slice(i1 + 1, i2) === "1",
        text: line.slice(i2 + 1)
      };
    });
  }

  function ready(list) {
    window.AFFIRMATION_LIBRARY = list;
    window.dispatchEvent(new Event("library-ready"));
  }

  fetch("./library.txt")
    .then(function (res) { return res.text(); })
    .then(function (body) { ready(parse(body)); })
    .catch(function () { ready([]); });
})();
