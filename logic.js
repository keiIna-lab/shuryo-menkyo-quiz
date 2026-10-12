(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RyoLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var LICENSES = ["net", "trap", "gun1", "gun2"];
  var CATEGORIES = ["law", "manage", "wildlife", "gear"];
  var MOCK_PLAN = { law: 13, gear: 6, wildlife: 9, manage: 2 };
  var EXEMPT_PLAN = { gear: 10 };

  function includesLicense(q, license) {
    return q.licenses.indexOf(license) !== -1;
  }

  function poolFor(questions, license, category) {
    return questions.filter(function (q) {
      return q.category === category && includesLicense(q, license);
    });
  }

  function hashString(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rand) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function sample(list, n, rand) {
    if (list.length < n) {
      throw new Error("プールが足りません: 必要 " + n + " / 実際 " + list.length);
    }
    return shuffle(list, rand).slice(0, n);
  }

  function drawByPlan(questions, license, plan, seed) {
    var rand = mulberry32(seed >>> 0);
    var picked = [];
    Object.keys(plan).forEach(function (category) {
      picked = picked.concat(sample(poolFor(questions, license, category), plan[category], rand));
    });
    return shuffle(picked, rand);
  }

  function drawMock(questions, license, seed) {
    return drawByPlan(questions, license, MOCK_PLAN, seed);
  }

  function drawExempt(questions, license, seed) {
    return drawByPlan(questions, license, EXEMPT_PLAN, seed);
  }

  function drawPractice(questions, license, options) {
    var opts = options || {};
    var rand = mulberry32((opts.seed || 1) >>> 0);
    var list = questions.filter(function (q) {
      if (!includesLicense(q, license)) return false;
      if (opts.category && q.category !== opts.category) return false;
      if (opts.topic && q.topic !== opts.topic) return false;
      if (opts.ids && opts.ids.indexOf(q.id) === -1) return false;
      return true;
    });
    list = shuffle(list, rand);
    if (opts.limit && opts.limit > 0 && opts.limit < list.length) list = list.slice(0, opts.limit);
    return list;
  }

  function isPass(correct, total) {
    if (!total) return false;
    return correct * 10 >= total * 7;
  }

  function lastAttempt(record) {
    if (!record || !record.attempts || !record.attempts.length) return null;
    return record.attempts[record.attempts.length - 1];
  }

  function pendingWrongIds(questions, records, license) {
    return questions.filter(function (q) {
      if (license && !includesLicense(q, license)) return false;
      var last = lastAttempt(records[q.id]);
      return !!(last && last.ok === false);
    }).map(function (q) { return q.id; });
  }

  function summarize(questions, records, license) {
    var byTopic = {};
    var byCategory = {};
    function bucket(map, key) {
      if (!map[key]) {
        map[key] = {
          key: key,
          taken: 0,
          attempts: 0,
          correct: 0,
          wrong: 0,
          latestCorrect: 0,
          pending: 0
        };
      }
      return map[key];
    }
    questions.forEach(function (q) {
      if (license && !includesLicense(q, license)) return;
      var rec = records[q.id];
      var attempts = rec && rec.attempts ? rec.attempts : [];
      if (!attempts.length) return;
      var topic = bucket(byTopic, q.topic);
      var cat = bucket(byCategory, q.category);
      topic.category = q.category;
      [topic, cat].forEach(function (row) {
        row.taken += 1;
        row.attempts += attempts.length;
        attempts.forEach(function (a) {
          if (a.ok) row.correct += 1;
          else row.wrong += 1;
        });
        if (attempts[attempts.length - 1].ok) row.latestCorrect += 1;
        else row.pending += 1;
      });
    });
    function finalize(map) {
      return Object.keys(map).map(function (key) {
        var row = map[key];
        row.rate = row.attempts ? row.correct / row.attempts : 0;
        return row;
      }).sort(function (a, b) {
        if (a.category && b.category && a.category !== b.category) {
          return CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
        }
        return a.rate - b.rate;
      });
    }
    var topics = finalize(byTopic);
    var categories = finalize(byCategory);
    var total = { taken: 0, attempts: 0, correct: 0, wrong: 0, pending: 0, rate: 0 };
    categories.forEach(function (row) {
      total.taken += row.taken;
      total.attempts += row.attempts;
      total.correct += row.correct;
      total.wrong += row.wrong;
      total.pending += row.pending;
    });
    total.rate = total.attempts ? total.correct / total.attempts : 0;
    return { byTopic: topics, byCategory: categories, total: total };
  }

  function sessionBreakdown(questions, picks) {
    var rows = {};
    questions.forEach(function (q) {
      if (!rows[q.category]) rows[q.category] = { category: q.category, total: 0, correct: 0 };
      rows[q.category].total += 1;
      if (picks[q.id] === q.answer) rows[q.category].correct += 1;
    });
    return CATEGORIES.filter(function (c) { return rows[c]; }).map(function (c) { return rows[c]; });
  }

  function countCorrect(questions, picks) {
    var n = 0;
    questions.forEach(function (q) {
      if (picks[q.id] === q.answer) n += 1;
    });
    return n;
  }

  function validateBank(questions) {
    var issues = [];
    if (!questions || questions.length !== 1000) {
      issues.push("問題数が1000ではありません: " + (questions ? questions.length : 0));
    }
    var ids = {};
    var texts = {};
    (questions || []).forEach(function (q, index) {
      if (!q.id || ids[q.id]) issues.push("idが空か重複: " + q.id + " @" + index);
      ids[q.id] = true;
      if (!q.text || texts[q.text + "\n" + q.choices.join("|")]) {
        issues.push("設問と選択肢の組が重複: " + q.id);
      }
      texts[q.text + "\n" + q.choices.join("|")] = true;
      if (!q.choices || q.choices.length !== 3) issues.push("選択肢が3つでない: " + q.id);
      else {
        var set = {};
        q.choices.forEach(function (c) {
          if (!c || !String(c).trim()) issues.push("空の選択肢: " + q.id);
          if (set[c]) issues.push("選択肢の重複: " + q.id);
          set[c] = true;
        });
      }
      if (q.answer !== 0 && q.answer !== 1 && q.answer !== 2) issues.push("正解番号が不正: " + q.id);
      if (!q.explain || !String(q.explain).trim()) issues.push("解説が空: " + q.id);
      if (CATEGORIES.indexOf(q.category) === -1) issues.push("分野が不正: " + q.id);
      if (!q.topic) issues.push("項目が空: " + q.id);
      if (!q.licenses || !q.licenses.length) issues.push("免許が空: " + q.id);
      (q.licenses || []).forEach(function (lic) {
        if (LICENSES.indexOf(lic) === -1) issues.push("不明な免許: " + q.id);
      });
    });
    if (!issues.length) {
      LICENSES.forEach(function (lic) {
        try {
          var mock = drawMock(questions, lic, 7);
          if (mock.length !== 30) issues.push(lic + " の模擬が30問でない");
          var seen = {};
          mock.forEach(function (q) {
            if (seen[q.id]) issues.push(lic + " の模擬で重複");
            seen[q.id] = true;
            if (!includesLicense(q, lic)) issues.push(lic + " に不適切な問題");
          });
          var counts = { law: 0, gear: 0, wildlife: 0, manage: 0 };
          mock.forEach(function (q) { counts[q.category] += 1; });
          Object.keys(MOCK_PLAN).forEach(function (key) {
            if (counts[key] !== MOCK_PLAN[key]) issues.push(lic + " の" + key + "が" + counts[key]);
          });
          var exempt = drawExempt(questions, lic, 3);
          if (exempt.length !== 10) issues.push(lic + " の一部免除が10問でない");
          exempt.forEach(function (q) {
            if (q.category !== "gear") issues.push(lic + " の一部免除に猟具以外");
          });
        } catch (err) {
          issues.push(lic + ": " + err.message);
        }
      });
    }
    return issues;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  return {
    LICENSES: LICENSES,
    CATEGORIES: CATEGORIES,
    MOCK_PLAN: MOCK_PLAN,
    EXEMPT_PLAN: EXEMPT_PLAN,
    includesLicense: includesLicense,
    poolFor: poolFor,
    hashString: hashString,
    drawMock: drawMock,
    drawExempt: drawExempt,
    drawPractice: drawPractice,
    isPass: isPass,
    lastAttempt: lastAttempt,
    pendingWrongIds: pendingWrongIds,
    summarize: summarize,
    sessionBreakdown: sessionBreakdown,
    countCorrect: countCorrect,
    validateBank: validateBank,
    escapeHtml: escapeHtml
  };
});
