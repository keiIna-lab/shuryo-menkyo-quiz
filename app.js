(function () {
  var L = window.RyoLogic;
  var BANK = window.RYO_QUESTIONS || [];
  var STORE = "ryo-shiken-records-v1";
  var SESSION = "ryo-shiken-session-v1";
  var MARKS = ["ア", "イ", "ウ"];
  var CAT = { law: "法令", manage: "保護管理", wildlife: "鳥獣", gear: "猟具" };
  var LIC = {
    net: { name: "網猟", full: "網猟免許", gear: "むそう網・はり網・つき網・なげ網", age: "試験日に満18歳以上" },
    trap: { name: "わな猟", full: "わな猟免許", gear: "くくりわな・はこわな・はこおとし・囲いわな", age: "試験日に満18歳以上" },
    gun1: { name: "第一種銃猟", full: "第一種銃猟免許", gear: "装薬銃と空気銃", age: "試験日に満20歳以上" },
    gun2: { name: "第二種銃猟", full: "第二種銃猟免許", gear: "空気銃", age: "試験日に満20歳以上" }
  };

  var state = {
    view: "home",
    license: null,
    mode: null,
    paper: [],
    index: 0,
    picks: {},
    revealed: {},
    submitted: false,
    scored: false,
    endsAt: null,
    seed: 1,
    filter: "all",
    limit: 20,
    issues: [],
    notice: ""
  };
  var timerId = 0;
  var app = document.getElementById("app");

  function loadRecords() {
    try {
      var raw = localStorage.getItem(STORE);
      state.records = raw ? JSON.parse(raw) : {};
      if (!state.records || typeof state.records !== "object") state.records = {};
    } catch (err) {
      state.records = {};
    }
  }

  function saveRecords() {
    localStorage.setItem(STORE, JSON.stringify(state.records));
  }

  function saveSession() {
    if (state.view !== "quiz" && state.view !== "result") {
      sessionStorage.removeItem(SESSION);
      return;
    }
    sessionStorage.setItem(SESSION, JSON.stringify({
      view: state.view,
      license: state.license,
      mode: state.mode,
      paper: state.paper,
      index: state.index,
      picks: state.picks,
      revealed: state.revealed,
      submitted: state.submitted,
      scored: state.scored,
      endsAt: state.endsAt,
      seed: state.seed
    }));
  }

  function restoreSession() {
    try {
      var raw = sessionStorage.getItem(SESSION);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (!saved || !LIC[saved.license] || !saved.paper || !saved.paper.length) return;
      var known = {};
      BANK.forEach(function (q) { known[q.id] = true; });
      if (saved.paper.some(function (id) { return !known[id]; })) return;
      Object.keys(saved).forEach(function (key) { state[key] = saved[key]; });
    } catch (err) {
      sessionStorage.removeItem(SESSION);
    }
  }

  function qById(id) {
    for (var i = 0; i < BANK.length; i++) if (BANK[i].id === id) return BANK[i];
    return null;
  }

  function paperQuestions() {
    return state.paper.map(qById).filter(Boolean);
  }

  function record(id, ok) {
    if (!state.records[id]) state.records[id] = { attempts: [] };
    state.records[id].attempts.push({ ok: ok, at: Date.now(), license: state.license });
    saveRecords();
  }

  function pendingIds() {
    return L.pendingWrongIds(BANK, state.records, state.license);
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = 0;
  }

  function formatLeft(ms) {
    var sec = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function armTimer() {
    stopTimer();
    if (state.view !== "quiz" || !state.endsAt || state.submitted) return;
    timerId = setInterval(function () {
      var el = document.querySelector("[data-timer]");
      if (!el || !state.endsAt) return;
      var left = state.endsAt - Date.now();
      el.textContent = formatLeft(left);
      el.classList.toggle("warn", left < 5 * 60 * 1000);
      if (left <= 0) submitExam(true);
    }, 250);
  }

  function render() {
    stopTimer();
    app.innerHTML = shell(viewHtml());
    bind();
    armTimer();
    saveSession();
  }

  function shell(inner) {
    var issue = "";
    if (state.issues.length) {
      issue = '<div class="warn-list"><strong>問題データの点検で異常があります。</strong><ul>' +
        state.issues.slice(0, 8).map(function (x) { return "<li>" + L.escapeHtml(x) + "</li>"; }).join("") +
        "</ul></div>";
    }
    return '<header class="topbar"><a class="brand" href="#home" data-go="home"><span class="seal">猟</span><span><small>TOKYO HUNTER EXAM</small><strong>東京都狩猟免許試験対策</strong></span></a>' +
      (state.license ? '<button class="ghost" type="button" data-go="dash">' + L.escapeHtml(LIC[state.license].full) + "</button>" : "") +
      "</header>" + issue + '<main id="main" class="layout">' + inner + "</main>" +
      '<footer class="footer">環境省が公表している例題と、鳥獣保護管理法・施行規則・環境省の狩猟制度の公表内容に合わせて作った三肢択一です。市販問題集の文章は転載していません。都道府県ごとの捕獲禁止や、その年の会場・手数料は東京都の受験案内で確認してください。</footer>';
  }

  function viewHtml() {
    if (state.view === "quiz") return quizHtml();
    if (state.view === "result") return resultHtml();
    if (state.view === "stats") return statsHtml();
    if (state.view === "dash") return dashHtml();
    return homeHtml();
  }

  function homeHtml() {
    var cards = L.LICENSES.map(function (id) {
      var meta = LIC[id];
      var n = BANK.filter(function (q) { return L.includesLicense(q, id); }).length;
      return '<button class="license" type="button" data-license="' + id + '"><em>' + L.escapeHtml(meta.age) + "</em><strong>" +
        L.escapeHtml(meta.full) + "</strong><span>" + L.escapeHtml(meta.gear) + "</span><span>演習 " + n + " 問</span></button>";
    }).join("");
    return '<section class="hero"><div><p class="kicker">網・わな・第一種銃猟・第二種銃猟</p><h1>四つの免許を、<br>一冊の問題集で。</h1><p class="lede">知識試験と同じ三肢択一です。模擬試験は法令13、猟具6、鳥獣9、保護管理2の30問・90分。70%以上で合格表示になります。間違えた問題だけをやり直し、受けた問題は項目別に残します。</p></div>' +
      '<aside class="note"><strong>この1000問について</strong><br>環境省のサイトに載っている例題を収録しています。ほかは、法律・施行規則・環境省が公表している狩猟鳥獣と猟期、禁止猟法に沿って作った演習です。過去の市販問題をそのまま写したものではありません。</aside></section>' +
      '<h2 class="section-title">受ける免許を選ぶ</h2><div class="cards">' + cards + "</div>";
  }

  function dashHtml() {
    var meta = LIC[state.license];
    var wrong = pendingIds().length;
    var sum = L.summarize(BANK, state.records, state.license);
    var notice = state.notice ? '<p class="warn-list">' + L.escapeHtml(state.notice) + "</p>" : "";
    state.notice = "";
    return notice + '<p class="kicker">' + L.escapeHtml(meta.age) + "</p><h1>" + L.escapeHtml(meta.full) + '</h1><p class="lede">使える猟具は' + L.escapeHtml(meta.gear) + "です。共通の法令・鳥獣・保護管理に、この免許の猟具を合わせて出します。</p>" +
      '<div class="modes">' +
      modeBtn("mock", "模擬試験", "30問・90分。途中の解説はありません。") +
      modeBtn("exempt", "一部免除", "ほかの免許を持っている人向け。猟具10問・30分。") +
      modeBtn("practice", "分野別の演習", "項目を選んで、解答のたびに解説を見ます。") +
      modeBtn("retry", "間違えた問題", wrong ? wrong + "問がやり直し待ちです。" : "まだやり直し待ちはありません。") +
      modeBtn("stats", "項目別の成績", sum.total.taken ? sum.total.taken + "問に取り組み、のべ正答率 " + pct(sum.total.rate) + "。" : "まだ記録がありません。") +
      "</div>" + practicePicker();
  }

  function modeBtn(mode, title, text) {
    return '<button class="mode" type="button" data-mode="' + mode + '"><strong>' + title + "</strong><span>" + L.escapeHtml(text) + "</span></button>";
  }

  function practicePicker() {
    var topics = [];
    var seen = {};
    BANK.forEach(function (q) {
      if (!L.includesLicense(q, state.license)) return;
      var key = q.category + "\n" + q.topic;
      if (seen[key]) return;
      seen[key] = true;
      topics.push(q);
    });
    var chips = '<button type="button" class="mini" data-filter="all" aria-pressed="' + (state.filter === "all") + '">すべて</button>' +
      L.CATEGORIES.map(function (c) {
        return '<button type="button" class="mini" data-filter="' + c + '" aria-pressed="' + (state.filter === c) + '">' + CAT[c] + "</button>";
      }).join("");
    var limits = [10, 20, 30, 50].map(function (n) {
      return '<button type="button" class="mini" data-limit="' + n + '" aria-pressed="' + (state.limit === n) + '">' + n + "問</button>";
    }).join("");
    var list = topics.filter(function (q) {
      return state.filter === "all" || q.category === state.filter;
    }).map(function (q) {
      var n = BANK.filter(function (item) {
        return item.topic === q.topic && L.includesLicense(item, state.license);
      }).length;
      return '<button class="topic-row" type="button" data-topic="' + L.escapeHtml(q.topic) + '" data-category="' + q.category + '"><span><em class="kicker">' + CAT[q.category] + "</em><br><strong>" + L.escapeHtml(q.topic) + "</strong></span><span>" + n + "問</span></button>";
    }).join("");
    return '<h2 class="section-title">分野別の演習</h2><div class="filters" aria-label="分野">' + chips + limits + '</div><div class="topics">' + list + "</div>";
  }

  function startPaper(mode, questions, minutes) {
    state.mode = mode;
    state.paper = questions.map(function (q) { return q.id; });
    state.index = 0;
    state.picks = {};
    state.revealed = {};
    state.submitted = false;
    state.scored = false;
    state.endsAt = minutes ? Date.now() + minutes * 60 * 1000 : null;
    state.view = "quiz";
    if (!state.paper.length) {
      state.view = "dash";
      state.mode = null;
      state.notice = mode === "retry" ? "やり直し待ちの問題はありません。不正解が残ると、ここに並びます。" : "この条件で出題できる問題がありません。";
    }
    render();
  }

  function quizHtml() {
    var q = qById(state.paper[state.index]);
    if (!q) return '<p class="empty">問題を表示できません。</p>';
    var practice = state.mode === "practice" || state.mode === "retry";
    var shown = practice && state.revealed[q.id];
    var choices = q.choices.map(function (choice, i) {
      var cls = "choice";
      if (state.picks[q.id] === i) cls += " selected";
      if (shown && i === q.answer) cls += " good";
      if (shown && state.picks[q.id] === i && i !== q.answer) cls += " bad";
      return '<button class="' + cls + '" type="button" data-pick="' + i + '"' + (shown ? " disabled" : "") + '><span class="mark">' + MARKS[i] + "</span><span>" + L.escapeHtml(choice) + "</span></button>";
    }).join("");
    var explain = shown ? '<div class="explain"><strong>' + (state.picks[q.id] === q.answer ? "正解です。" : "不正解です。") + "</strong> " + L.escapeHtml(q.explain) + "</div>" : "";
    var left = state.endsAt ? '<div class="timer" data-timer>' + formatLeft(state.endsAt - Date.now()) + "</div>" : "<div></div>";
    var title = { mock: "模擬試験", exempt: "一部免除", practice: "分野別の演習", retry: "間違えた問題" }[state.mode] || "演習";
    var invert = q.text.indexOf("誤っている") !== -1 ? " invert" : "";
    var dots = state.paper.map(function (id, i) {
      var cls = i === state.index ? "on" : "";
      var item = qById(id);
      if (state.revealed[id]) {
        if (state.picks[id] === item.answer) cls += " hit";
        else cls += " miss";
      } else if (state.picks[id] != null) cls += " filled";
      return '<button type="button" data-jump="' + i + '" class="' + cls + '">' + (i + 1) + "</button>";
    }).join("");
    var allDone = state.paper.every(function (id) { return state.revealed[id]; });
    var primary = practice
      ? (shown
        ? '<button class="solid" type="button" data-next>' + (state.index + 1 === state.paper.length ? (allDone ? "結果を見る" : "未解答へ") : "次の問題") + "</button>"
        : '<button class="solid" type="button" data-reveal' + (state.picks[q.id] == null ? " disabled" : "") + ">解答を見る</button>")
      : '<button class="solid" type="button" data-submit>提出する</button>';
    return '<div class="quiz-head"><div><p class="kicker">' + L.escapeHtml(LIC[state.license].name) + " / " + title + "</p><strong>" + CAT[q.category] + "・" + L.escapeHtml(q.topic) + "</strong></div>" + left + "</div>" +
      '<div class="progress"><span style="width:' + ((state.index + 1) / state.paper.length * 100) + '%"></span></div>' +
      '<p class="sub">' + (state.index + 1) + " / " + state.paper.length + (q.origin === "moe" ? " ・環境省の公表例題" : "") + "</p>" +
      '<h2 class="stem' + invert + '">' + L.escapeHtml(q.text) + "</h2>" +
      '<div class="choices">' + choices + "</div>" + explain +
      '<div class="dots" aria-label="問題番号">' + dots + "</div>" +
      '<div class="nav"><button class="ghost" type="button" data-prev' + (state.index === 0 ? " disabled" : "") + ">前へ</button>" +
      '<button class="ghost" type="button" data-go="dash">中断</button>' + primary +
      (practice ? "" : '<button class="ghost" type="button" data-next' + (state.index + 1 === state.paper.length ? " disabled" : "") + ">次へ</button>") +
      "</div>";
  }

  function resultHtml() {
    var questions = paperQuestions();
    var correct = L.countCorrect(questions, state.picks);
    var pass = L.isPass(correct, questions.length);
    var rows = L.sessionBreakdown(questions, state.picks).map(function (row) {
      return "<tr><td>" + CAT[row.category] + "</td><td>" + row.correct + " / " + row.total + "</td><td>" + pct(row.total ? row.correct / row.total : 0) + "</td></tr>";
    }).join("");
    var review = questions.map(function (q, i) {
      var pick = state.picks[q.id];
      var ok = pick === q.answer;
      var choiceHtml = q.choices.map(function (choice, idx) {
        var tag = idx === q.answer ? "正解" : "";
        if (pick === idx && idx !== q.answer) tag = "あなたの解答";
        if (pick === idx && idx === q.answer) tag = "あなたの解答・正解";
        return "<li>" + MARKS[idx] + " " + L.escapeHtml(choice) + (tag ? "（" + tag + "）" : "") + "</li>";
      }).join("");
      return '<article class="panel"><p class="kicker">' + (i + 1) + " ・ " + CAT[q.category] + "・" + L.escapeHtml(q.topic) + (ok ? " ・ 正解" : " ・ 不正解") + "</p><h3>" + L.escapeHtml(q.text) + "</h3><ul>" + choiceHtml + "</ul><p>" + L.escapeHtml(q.explain) + "</p></article>";
    }).join("");
    return '<p class="kicker">結果</p><div class="score"><b class="' + (pass ? "pass" : "fail") + '">' + correct + "</b><span>/ " + questions.length + "　" + (pass ? "70%以上です" : "70%未満です") + "</span></div>" +
      '<div class="panel"><table><thead><tr><th>項目</th><th>正解</th><th>正答率</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<div class="nav"><button class="solid" type="button" data-mode="retry">間違えた問題をやり直す</button><button class="ghost" type="button" data-go="stats">項目別の成績</button><button class="ghost" type="button" data-go="dash">メニューへ</button></div>' +
      review;
  }

  function statsHtml() {
    var sum = L.summarize(BANK, state.records, state.license);
    if (!sum.total.taken) {
      return '<h1>項目別の成績</h1><p class="empty">この免許で受けた問題は、まだありません。</p><button class="ghost" type="button" data-go="dash">戻る</button>';
    }
    var cats = sum.byCategory.map(function (row) {
      return '<div class="bar-row"><span>' + CAT[row.key] + '</span><div class="bar' + (row.rate < 0.7 ? " bad" : "") + '"><span style="width:' + Math.round(row.rate * 100) + '%"></span></div><strong>' + pct(row.rate) + "</strong></div>";
    }).join("");
    var topics = sum.byTopic.map(function (row) {
      return "<tr><td>" + CAT[row.category] + "</td><td>" + L.escapeHtml(row.key) + "</td><td>" + row.taken + "</td><td>" + row.attempts + "</td><td>" + row.correct + "</td><td>" + row.wrong + "</td><td>" + pct(row.rate) + "</td><td>" + row.pending + '</td><td><button class="mini" type="button" data-topic="' + L.escapeHtml(row.key) + '" data-category="' + row.category + '">演習</button></td></tr>';
    }).join("");
    return '<h1>項目別の成績</h1><p class="lede">' + L.escapeHtml(LIC[state.license].full) + "で受けた問題だけを集計しています。取り組んだ問題 " + sum.total.taken + "、のべ解答 " + sum.total.attempts + "、のべ正答率 " + pct(sum.total.rate) + "、やり直し待ち " + sum.total.pending + "問。</p>" +
      '<div class="panel">' + cats + "</div>" +
      '<div class="panel"><table><thead><tr><th>分野</th><th>項目</th><th>問題数</th><th>のべ解答</th><th>正解</th><th>不正解</th><th>正答率</th><th>直し待ち</th><th></th></tr></thead><tbody>' + topics + "</tbody></table></div>" +
      '<div class="nav"><button class="solid" type="button" data-export>成績を書き出す</button><button class="ghost danger" type="button" data-reset>記録を消す</button><button class="ghost" type="button" data-go="dash">戻る</button></div>';
  }

  function pct(rate) {
    return Math.round(rate * 1000) / 10 + "%";
  }

  function submitExam(fromTimer) {
    if (state.submitted) return;
    if (!fromTimer) {
      var blank = state.paper.filter(function (id) { return state.picks[id] == null; }).length;
      var message = blank ? blank + "問が無解答です。無解答は不正解として提出します。" : "解答を提出します。";
      if (!window.confirm(message)) return;
    }
    state.submitted = true;
    state.endsAt = null;
    if (!state.scored) {
      paperQuestions().forEach(function (q) {
        record(q.id, state.picks[q.id] === q.answer);
        state.revealed[q.id] = true;
      });
      state.scored = true;
    }
    state.view = "result";
    render();
  }

  function finishPractice() {
    state.view = "result";
    state.submitted = true;
    render();
  }

  function revealCurrent() {
    var id = state.paper[state.index];
    var q = qById(id);
    if (!q || state.picks[id] == null || state.revealed[id]) return;
    state.revealed[id] = true;
    record(id, state.picks[id] === q.answer);
    render();
  }

  function bind() {
    app.onclick = function (event) {
      var el = event.target.closest("[data-license],[data-mode],[data-go],[data-pick],[data-reveal],[data-next],[data-prev],[data-jump],[data-submit],[data-filter],[data-limit],[data-topic],[data-export],[data-reset]");
      if (!el) return;
      if (el.dataset.license) {
        state.license = el.dataset.license;
        state.view = "dash";
        state.filter = "all";
        render();
        return;
      }
      if (el.dataset.go) {
        if (el.dataset.go === "dash" && state.view === "quiz" && !state.submitted && (state.mode === "mock" || state.mode === "exempt")) {
          if (!window.confirm("この試験を中断すると、いまの解答は成績に残りません。")) return;
        }
        state.view = el.dataset.go === "home" ? "home" : el.dataset.go;
        if (el.dataset.go === "home") state.license = null;
        render();
        return;
      }
      if (el.dataset.filter) {
        state.filter = el.dataset.filter;
        render();
        return;
      }
      if (el.dataset.limit) {
        state.limit = Number(el.dataset.limit);
        render();
        return;
      }
      if (el.dataset.topic) {
        var drawn = L.drawPractice(BANK, state.license, {
          category: el.dataset.category,
          topic: el.dataset.topic,
          limit: state.limit,
          seed: Date.now() % 100000
        });
        startPaper("practice", drawn, 0);
        return;
      }
      if (el.dataset.mode) {
        var mode = el.dataset.mode;
        var seed = Date.now() % 100000;
        if (mode === "stats") { state.view = "stats"; render(); return; }
        try {
          if (mode === "mock") { startPaper("mock", L.drawMock(BANK, state.license, seed), 90); return; }
          if (mode === "exempt") { startPaper("exempt", L.drawExempt(BANK, state.license, seed), 30); return; }
          if (mode === "retry") {
            var ids = pendingIds();
            startPaper("retry", L.drawPractice(BANK, state.license, { ids: ids, seed: seed }), 0);
            return;
          }
          if (mode === "practice") {
            startPaper("practice", L.drawPractice(BANK, state.license, { limit: state.limit, seed: seed, category: state.filter === "all" ? "" : state.filter }), 0);
            return;
          }
        } catch (err) {
          state.notice = err.message || String(err);
          state.view = "dash";
          render();
          return;
        }
      }
      if (el.dataset.pick != null && !state.revealed[state.paper[state.index]]) {
        state.picks[state.paper[state.index]] = Number(el.dataset.pick);
        render();
        return;
      }
      if (el.dataset.reveal != null) { revealCurrent(); return; }
      if (el.dataset.prev != null) {
        state.index = Math.max(0, state.index - 1);
        render();
        return;
      }
      if (el.dataset.next != null) {
        var practiceMode = state.mode === "practice" || state.mode === "retry";
        if (practiceMode && state.index + 1 === state.paper.length && state.revealed[state.paper[state.index]]) {
          var missing = -1;
          for (var mi = 0; mi < state.paper.length; mi++) {
            if (!state.revealed[state.paper[mi]]) { missing = mi; break; }
          }
          if (missing === -1) finishPractice();
          else { state.index = missing; render(); }
          return;
        }
        state.index = Math.min(state.paper.length - 1, state.index + 1);
        render();
        return;
      }
      if (el.dataset.jump != null) {
        state.index = Number(el.dataset.jump);
        render();
        return;
      }
      if (el.dataset.submit != null) { submitExam(false); return; }
      if (el.dataset.export != null) exportStats();
      if (el.dataset.reset != null) resetStats();
    };
  }

  function exportStats() {
    var payload = {
      license: state.license,
      exportedAt: new Date().toISOString(),
      summary: L.summarize(BANK, state.records, state.license),
      records: state.records
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "ryo-shiken-" + state.license + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function resetStats() {
    if (!window.confirm("このブラウザに保存した解答記録を消します。")) return;
    state.records = {};
    saveRecords();
    render();
  }

  document.addEventListener("keydown", function (event) {
    if (state.view !== "quiz") return;
    if (event.target && event.target.closest && event.target.closest("input, textarea")) return;
    var n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[event.code];
    if (n != null && !state.revealed[state.paper[state.index]]) {
      state.picks[state.paper[state.index]] = n;
      render();
    }
  });

  loadRecords();
  state.issues = L.validateBank(BANK);
  restoreSession();
  render();
})();
